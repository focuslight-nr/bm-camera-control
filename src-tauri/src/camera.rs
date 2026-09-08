// Camera communication layer.
//
// All traffic to a Blackmagic camera goes through here so that the front-end
// never has to deal with CORS or the camera's self-signed TLS certificate.
// The REST surface is proxied via `camera_request`; the notification
// WebSocket is relayed to the front-end through Tauri events.
//
// SECURITY: the Tauri command boundary is a trust boundary. Everything that
// arrives from the webview (`host`, `path`, `method`, `subnet`) is attacker-
// influenceable if the UI is ever compromised, so it is validated here before
// it reaches a URL. See `validate_host` / `build_api_url`.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc::{channel, Sender};
use tokio::sync::{Mutex, Semaphore};
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message;
use url::Url;

/// Path prefix every REST call must stay within.
const API_PREFIX: &str = "/control/api/v1";
/// Applies to a single proxied REST call.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
/// Per-host probe budget during a subnet scan.
const DISCOVERY_TIMEOUT: Duration = Duration::from_millis(1200);
/// Concurrent probes during a subnet scan. 254 at once trips socket limits and
/// NAT/firewall heuristics on Windows for no wall-clock gain.
const DISCOVERY_CONCURRENCY: usize = 48;
/// Outgoing WebSocket queue depth. Bounded so a stalled camera applies
/// backpressure to the UI instead of growing the queue without limit.
const WS_QUEUE_DEPTH: usize = 64;
/// Keepalive cadence. Also flushes any Pong that tungstenite has queued in
/// response to a camera Ping — a listen-only session never writes otherwise,
/// so the Pong would sit in the send buffer and the camera would drop us.
const WS_KEEPALIVE: Duration = Duration::from_secs(20);

/// Result of a REST call returned to the front-end.
#[derive(Debug, Serialize)]
pub struct HttpResult {
    /// HTTP status code (0 means the request never completed).
    pub status: u16,
    /// Raw response body (usually JSON text, empty for 204).
    pub body: String,
    /// Transport-level error message, if any.
    pub error: Option<String>,
}

impl HttpResult {
    fn failed(error: impl Into<String>) -> Self {
        Self {
            status: 0,
            body: String::new(),
            error: Some(error.into()),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct RequestArgs {
    pub host: String,
    pub secure: bool,
    pub method: String,
    /// Path beneath `/control/api/v1`, e.g. "/system/product".
    pub path: String,
    /// Optional JSON body for PUT/POST.
    pub body: Option<serde_json::Value>,
    /// Optional HTTP Basic credentials (required when the camera's
    /// "Secure login" is enabled).
    pub username: Option<String>,
    pub password: Option<String>,
}

/// Reject anything that is not a bare hostname or IPv4 literal with an
/// optional port.
///
/// Without this, `host` is interpolated straight into a URL and
/// `"camera.local@attacker.example"` parses as userinfo + host: the request
/// (with the camera's Basic credentials attached) goes to the attacker.
/// A `/`, `?` or `#` in `host` is an equivalent escape.
///
/// IPv6 literals are deliberately unsupported — the cameras are IPv4 on a LAN,
/// and allowing `[` / `]` here would widen the parser surface for no gain.
fn validate_host(raw: &str) -> Result<(), String> {
    if raw.is_empty() || raw.len() > 253 {
        return Err("host: empty or too long".into());
    }
    let (name, port) = match raw.rsplit_once(':') {
        Some((n, p)) => (n, Some(p)),
        None => (raw, None),
    };
    if let Some(p) = port {
        if p.parse::<u16>().is_err() {
            return Err("host: invalid port".into());
        }
    }
    if name.is_empty() {
        return Err("host: empty".into());
    }
    if !name
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-')
    {
        return Err("host: only letters, digits, '.', '-' and an optional :port".into());
    }
    Ok(())
}

fn api_base(host: &str, secure: bool) -> String {
    let scheme = if secure { "https" } else { "http" };
    // Trailing slash so `Url::join` appends beneath the prefix.
    format!("{scheme}://{host}{API_PREFIX}/")
}

/// Build the absolute URL for a REST call, refusing anything that leaves the
/// intended camera or escapes `/control/api/v1`.
fn build_api_url(host: &str, secure: bool, path: &str) -> Result<Url, String> {
    validate_host(host)?;
    let base = Url::parse(&api_base(host, secure)).map_err(|e| format!("host: {e}"))?;
    if !base.username().is_empty() || base.password().is_some() {
        return Err("host: credentials are not allowed in the host field".into());
    }

    // A relative join resolves `..`, so the prefix check below is what actually
    // enforces the boundary. An absolute `path` would replace the host — the
    // origin check catches that.
    let url = base
        .join(path.trim_start_matches('/'))
        .map_err(|e| format!("path: {e}"))?;

    if url.scheme() != base.scheme()
        || url.host_str() != base.host_str()
        || url.port() != base.port()
    {
        return Err("path: must not change the target host".into());
    }
    // Compare on a segment boundary, not a byte prefix: `../v1x/evil` resolves
    // to `/control/api/v1x/evil`, which starts with the prefix but is a sibling
    // namespace, not a child of it.
    let path = url.path();
    if path != API_PREFIX && !path.starts_with(&format!("{API_PREFIX}/")) {
        return Err(format!("path: must stay beneath {API_PREFIX}"));
    }
    Ok(url)
}

/// Allowlist of methods the proxy will issue. `Method::from_bytes` would accept
/// any RFC-shaped token (`CONNECT`, `TRACE`, invented verbs) and turn this
/// command into a general-purpose HTTP client.
fn parse_method(raw: &str) -> Result<reqwest::Method, String> {
    match raw.to_ascii_uppercase().as_str() {
        "GET" => Ok(reqwest::Method::GET),
        "PUT" => Ok(reqwest::Method::PUT),
        "POST" => Ok(reqwest::Method::POST),
        "DELETE" => Ok(reqwest::Method::DELETE),
        other => Err(format!("method: {other} is not allowed")),
    }
}

// SECURITY: TLS verification is disabled because Blackmagic cameras ship a
// self-signed certificate with no way to install a trust anchor. Accepted
// threat model: the camera is on a trusted LAN segment. An attacker with
// on-path access to that segment can MITM the connection and read the Basic
// credentials. Mitigating that properly needs trust-on-first-use certificate
// pinning, which is tracked separately; `validate_host` at least keeps the
// target confined to an operator-supplied host.
fn build_client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .timeout(timeout)
        .connect_timeout(CONNECT_TIMEOUT)
        .build()
        .map_err(|e| format!("client build failed: {e}"))
}

/// Shared clients — rebuilding per call discards the connection pool and forces
/// a fresh TCP+TLS handshake on every UI interaction.
fn rest_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| build_client(REQUEST_TIMEOUT))
        .as_ref()
        .map_err(Clone::clone)
}

fn discovery_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| build_client(DISCOVERY_TIMEOUT))
        .as_ref()
        .map_err(Clone::clone)
}

/// Proxy a single REST request to the camera.
#[tauri::command]
pub async fn camera_request(args: RequestArgs) -> HttpResult {
    let url = match build_api_url(&args.host, args.secure, &args.path) {
        Ok(u) => u,
        Err(e) => return HttpResult::failed(e),
    };
    let method = match parse_method(&args.method) {
        Ok(m) => m,
        Err(e) => return HttpResult::failed(e),
    };
    let client = match rest_client() {
        Ok(c) => c,
        Err(e) => return HttpResult::failed(e),
    };

    let mut req = client.request(method, url);
    if let Some(user) = &args.username {
        req = req.basic_auth(user, args.password.as_deref());
    }
    if let Some(body) = args.body {
        req = req.json(&body);
    }

    match req.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            match resp.text().await {
                Ok(body) => HttpResult {
                    status,
                    body,
                    error: None,
                },
                // Never launder a truncated or non-UTF-8 body into a success:
                // the front-end cannot tell `""` from a legitimate empty 204.
                Err(e) => HttpResult {
                    status,
                    body: String::new(),
                    error: Some(format!("body read failed: {e}")),
                },
            }
        }
        Err(e) => HttpResult::failed(e.to_string()),
    }
}

/// A camera found on the local network.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Discovered {
    pub host: String,
    pub product_name: String,
    pub device_name: String,
}

/// Best-effort local /24 base, e.g. "192.168.26".
fn local_subnet_base() -> Option<String> {
    let sock = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    // No packet is sent; this just asks the routing table which source address
    // would be used, so the synchronous call does not actually block.
    sock.connect("8.8.8.8:80").ok()?;
    match sock.local_addr().ok()?.ip() {
        std::net::IpAddr::V4(v4) => {
            let o = v4.octets();
            Some(format!("{}.{}.{}", o[0], o[1], o[2]))
        }
        _ => None,
    }
}

/// A caller-supplied subnet is interpolated into a URL, so it must be exactly
/// three dotted octets.
fn validate_subnet_base(base: &str) -> Result<(), String> {
    let parts: Vec<&str> = base.split('.').collect();
    if parts.len() == 3 && parts.iter().all(|p| p.parse::<u8>().is_ok()) {
        Ok(())
    } else {
        Err("subnet: expected three dotted octets, e.g. 192.168.1".into())
    }
}

/// Scan the local subnet for Blackmagic cameras exposing the REST API over HTTP.
/// (mDNS is often blocked by host firewalls; a direct probe is more reliable.)
#[tauri::command]
pub async fn discover_cameras(subnet: Option<String>) -> Result<Vec<Discovered>, String> {
    let base = subnet
        .or_else(local_subnet_base)
        .ok_or_else(|| "could not determine the local subnet".to_string())?;
    validate_subnet_base(&base)?;
    let client = discovery_client()?;
    let permits = Arc::new(Semaphore::new(DISCOVERY_CONCURRENCY));

    let mut handles = Vec::with_capacity(254);
    for i in 1..=254u8 {
        let ip = format!("{base}.{i}");
        let permits = permits.clone();
        handles.push(tokio::spawn(async move {
            let _permit = permits.acquire_owned().await.ok()?;
            let url = format!("http://{ip}{API_PREFIX}/system/product");
            let resp = client.get(&url).send().await.ok()?;

            // A camera with "Secure login" enabled answers 401/403 — it is
            // still a camera, and the operator needs to see it in the list.
            if resp.status() == 401 || resp.status() == 403 {
                return Some(Discovered {
                    host: ip,
                    product_name: String::new(),
                    device_name: String::new(),
                });
            }
            if !resp.status().is_success() {
                return None;
            }

            let txt = resp.text().await.ok()?;
            let v: serde_json::Value = serde_json::from_str(&txt).ok()?;
            Some(Discovered {
                host: ip,
                product_name: v.get("productName")?.as_str()?.to_string(),
                device_name: v
                    .get("deviceName")
                    .and_then(|d| d.as_str())
                    .unwrap_or_default()
                    .to_string(),
            })
        }));
    }

    let mut out = Vec::new();
    for h in handles {
        if let Ok(Some(d)) = h.await {
            out.push(d);
        }
    }
    Ok(out)
}

/// One live WebSocket session.
///
/// `generation` exists because a reader task outlives the connection it belongs
/// to: without it, a stale reader's teardown would clear the *current*
/// connection's sender and report a healthy socket as disconnected.
struct Conn {
    generation: u64,
    tx: Sender<Message>,
    reader: JoinHandle<()>,
    writer: JoinHandle<()>,
}

/// Holds the live WebSocket session, if any.
#[derive(Default)]
pub struct WsState {
    conn: Arc<Mutex<Option<Conn>>>,
    next_generation: AtomicU64,
}

/// Close a session for real: ask for a clean Close frame, let the writer flush
/// it, then stop the reader. Dropping the sender alone only ends the outgoing
/// pump — the reader still owns its half of the split stream, so the TCP/TLS
/// connection would stay open and keep emitting events.
async fn teardown(conn: Conn) {
    let Conn {
        tx,
        reader,
        mut writer,
        ..
    } = conn;
    let _ = tx.send(Message::Close(None)).await;
    // Ends the writer loop once the Close frame is flushed.
    drop(tx);
    // Dropping a JoinHandle detaches the task, so a stalled write half would
    // leak a zombie task holding the socket open on every reconnect. Abort it.
    if tokio::time::timeout(Duration::from_millis(500), &mut writer)
        .await
        .is_err()
    {
        writer.abort();
    }
    reader.abort();
}

fn ws_url(host: &str, secure: bool) -> String {
    let scheme = if secure { "wss" } else { "ws" };
    format!("{scheme}://{host}{API_PREFIX}/event/websocket")
}

/// Open (or replace) the notification WebSocket and relay every text message
/// to the front-end as a `camera-ws` Tauri event. Connection lifecycle events
/// are emitted as `camera-ws-status`.
#[tauri::command]
pub async fn camera_ws_connect(
    app: AppHandle,
    state: State<'_, WsState>,
    host: String,
    secure: bool,
    username: Option<String>,
    password: Option<String>,
) -> Result<(), String> {
    use base64::Engine;
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    use tokio_tungstenite::tungstenite::http::{header::AUTHORIZATION, HeaderValue};

    validate_host(&host)?;

    // Close any previous session before opening a new one. The lock is released
    // before awaiting teardown so the outgoing reader can never block on it.
    let previous = { state.conn.lock().await.take() };
    if let Some(conn) = previous {
        teardown(conn).await;
    }

    // SECURITY: same self-signed-certificate trade-off as `build_client`.
    let connector = native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .build()
        .map_err(|e| format!("tls: {e}"))?;
    let connector = tokio_tungstenite::Connector::NativeTls(connector);

    let url = ws_url(&host, secure);
    let mut request = url.into_client_request().map_err(|e| format!("url: {e}"))?;
    // Add HTTP Basic auth to the websocket handshake when credentials are given.
    if let Some(user) = &username {
        let raw = format!("{}:{}", user, password.clone().unwrap_or_default());
        let value = format!(
            "Basic {}",
            base64::engine::general_purpose::STANDARD.encode(raw)
        );
        let mut value = HeaderValue::from_str(&value)
            .map_err(|_| "auth: username and password must be ASCII".to_string())?;
        value.set_sensitive(true); // keep credentials out of any header dump
        request.headers_mut().insert(AUTHORIZATION, value);
    }

    let (ws_stream, _resp) =
        tokio_tungstenite::connect_async_tls_with_config(request, None, false, Some(connector))
            .await
            .map_err(|e| format!("handshake: {e}"))?;

    let (mut write, mut read) = ws_stream.split();
    let (tx, mut rx) = channel::<Message>(WS_QUEUE_DEPTH);
    let generation = state.next_generation.fetch_add(1, Ordering::Relaxed);

    // Outgoing pump: front-end -> camera, plus keepalive.
    let writer = tokio::spawn(async move {
        let mut keepalive = tokio::time::interval(WS_KEEPALIVE);
        keepalive.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        keepalive.tick().await; // the first tick completes immediately
        loop {
            tokio::select! {
                msg = rx.recv() => match msg {
                    Some(m) => {
                        if write.send(m).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                },
                _ = keepalive.tick() => {
                    if write.send(Message::Ping(Vec::<u8>::new().into())).await.is_err() {
                        break;
                    }
                }
            }
        }
        let _ = write.close().await;
    });

    // Incoming pump: camera -> front-end.
    let app2 = app.clone();
    let conn_state = state.conn.clone();
    let reader = tokio::spawn(async move {
        let mut status = "disconnected".to_string();
        while let Some(item) = read.next().await {
            match item {
                Ok(Message::Text(text)) => {
                    if let Err(e) = app2.emit("camera-ws", text.to_string()) {
                        eprintln!("camera-ws emit failed: {e}");
                    }
                }
                Ok(Message::Close(_)) => break,
                Err(e) => {
                    status = format!("disconnected: {e}");
                    break;
                }
                // Ping/Pong are answered by tungstenite; Binary is unused by the
                // camera's notification protocol.
                _ => {}
            }
        }
        // Only tear down if this task still owns the current connection —
        // otherwise a stale reader would kill a newer, healthy session.
        let mut guard = conn_state.lock().await;
        if guard.as_ref().is_some_and(|c| c.generation == generation) {
            *guard = None;
            if let Err(e) = app2.emit("camera-ws-status", status) {
                eprintln!("camera-ws-status emit failed: {e}");
            }
        }
    });

    {
        let mut guard = state.conn.lock().await;
        *guard = Some(Conn {
            generation,
            tx,
            reader,
            writer,
        });
    }

    if let Err(e) = app.emit("camera-ws-status", "connected") {
        eprintln!("camera-ws-status emit failed: {e}");
    }
    Ok(())
}

/// Send a raw text frame (JSON request) on the live WebSocket.
#[tauri::command]
pub async fn camera_ws_send(state: State<'_, WsState>, text: String) -> Result<(), String> {
    let tx = {
        let guard = state.conn.lock().await;
        match guard.as_ref() {
            Some(conn) => conn.tx.clone(),
            None => return Err("websocket not connected".into()),
        }
    };
    // Bounded queue: a stalled camera surfaces as an explicit error rather than
    // an unbounded backlog of control messages the operator never sees applied.
    tx.send_timeout(Message::Text(text.into()), Duration::from_secs(2))
        .await
        .map_err(|e| format!("send failed: {e}"))
}

/// Close the live WebSocket, if any.
#[tauri::command]
pub async fn camera_ws_disconnect(app: AppHandle, state: State<'_, WsState>) -> Result<(), String> {
    let conn = { state.conn.lock().await.take() };
    if let Some(conn) = conn {
        teardown(conn).await;
        if let Err(e) = app.emit("camera-ws-status", "disconnected") {
            eprintln!("camera-ws-status emit failed: {e}");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_base_follows_the_secure_flag() {
        assert_eq!(
            api_base("10.0.0.5", true),
            "https://10.0.0.5/control/api/v1/"
        );
        assert_eq!(
            api_base("10.0.0.5", false),
            "http://10.0.0.5/control/api/v1/"
        );
    }

    #[test]
    fn ws_url_follows_the_secure_flag() {
        assert_eq!(
            ws_url("cam.local", true),
            "wss://cam.local/control/api/v1/event/websocket"
        );
        assert_eq!(
            ws_url("cam.local", false),
            "ws://cam.local/control/api/v1/event/websocket"
        );
    }

    #[test]
    fn accepts_plain_hosts_and_ports() {
        for host in ["10.0.0.5", "cam.local", "camera-1", "10.0.0.5:8080"] {
            assert!(validate_host(host).is_ok(), "should accept {host}");
        }
    }

    #[test]
    fn rejects_hostile_hosts() {
        for host in [
            "",
            "cam.local@attacker.example", // userinfo: request would go to the attacker
            "10.0.0.5/../..",
            "10.0.0.5?x=1",
            "10.0.0.5#frag",
            "10.0.0.5:notaport",
            "10.0.0.5:99999",
            "10.0.0.5 ",
            "[::1]",
        ] {
            assert!(validate_host(host).is_err(), "should reject {host:?}");
        }
    }

    #[test]
    fn builds_urls_beneath_the_api_prefix() {
        let url = build_api_url("10.0.0.5", true, "/system/product").unwrap();
        assert_eq!(
            url.as_str(),
            "https://10.0.0.5/control/api/v1/system/product"
        );

        // A leading slash is optional.
        let url = build_api_url("10.0.0.5", false, "system/product").unwrap();
        assert_eq!(
            url.as_str(),
            "http://10.0.0.5/control/api/v1/system/product"
        );
    }

    #[test]
    fn rejects_paths_that_escape_the_prefix_or_change_host() {
        for path in [
            "/../../../evil",
            "../../evil",
            "http://attacker.example/evil",
            // Sibling namespace: resolves to /control/api/v1x/evil, which a
            // naive byte-prefix check would wave through.
            "../v1x/evil",
            "../v1-admin/evil",
        ] {
            assert!(
                build_api_url("10.0.0.5", true, path).is_err(),
                "should reject {path:?}"
            );
        }
    }

    /// A protocol-relative path loses its leading slashes and stays a relative
    /// segment, so it is confined rather than rejected. Assert the confinement
    /// directly — that is the property that matters.
    #[test]
    fn hostile_paths_never_leave_the_camera() {
        for path in [
            "//attacker.example/evil",
            "/system/../../../../etc/passwd",
            "/system/product?x=1",
            "/system/product#frag",
        ] {
            if let Ok(url) = build_api_url("10.0.0.5", true, path) {
                assert_eq!(
                    url.host_str(),
                    Some("10.0.0.5"),
                    "host changed for {path:?}"
                );
                assert!(
                    url.path().starts_with(API_PREFIX),
                    "escaped the prefix for {path:?}: {}",
                    url.path()
                );
            }
        }
    }

    #[test]
    fn allows_only_the_four_camera_methods() {
        for m in ["GET", "put", "Post", "DELETE"] {
            assert!(parse_method(m).is_ok(), "should accept {m}");
        }
        for m in ["CONNECT", "TRACE", "PATCH", "WHATEVER", ""] {
            assert!(parse_method(m).is_err(), "should reject {m:?}");
        }
    }

    #[test]
    fn validates_subnet_bases() {
        for base in ["192.168.1", "10.0.0", "172.16.31"] {
            assert!(validate_subnet_base(base).is_ok(), "should accept {base}");
        }
        for base in ["192.168.1.5", "192.168", "attacker.example#", "999.1.1", ""] {
            assert!(
                validate_subnet_base(base).is_err(),
                "should reject {base:?}"
            );
        }
    }
}
