// Camera communication layer.
//
// All traffic to a Blackmagic camera goes through here so that the front-end
// never has to deal with CORS or the camera's self-signed TLS certificate.
// The REST surface is proxied via `camera_request`; the notification
// WebSocket is relayed to the front-end through Tauri events.

use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::Message;

/// Result of a REST call returned to the front-end.
#[derive(Serialize)]
pub struct HttpResult {
    /// HTTP status code (0 means the request never completed).
    pub status: u16,
    /// Raw response body (usually JSON text, empty for 204).
    pub body: String,
    /// Transport-level error message, if any.
    pub error: Option<String>,
}

#[derive(Deserialize)]
pub struct RequestArgs {
    pub host: String,
    pub secure: bool,
    pub method: String,
    /// Path beneath `/control/api/v1`, e.g. "/system/product".
    pub path: String,
    /// Optional JSON body for PUT/POST.
    pub body: Option<serde_json::Value>,
}

fn api_base(host: &str, secure: bool) -> String {
    let scheme = if secure { "https" } else { "http" };
    format!("{scheme}://{host}/control/api/v1")
}

/// Proxy a single REST request to the camera.
#[tauri::command]
pub async fn camera_request(args: RequestArgs) -> HttpResult {
    let url = format!("{}{}", api_base(&args.host, args.secure), args.path);

    let client = match reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return HttpResult {
                status: 0,
                body: String::new(),
                error: Some(format!("client build failed: {e}")),
            }
        }
    };

    let method = match reqwest::Method::from_bytes(args.method.to_uppercase().as_bytes()) {
        Ok(m) => m,
        Err(e) => {
            return HttpResult {
                status: 0,
                body: String::new(),
                error: Some(format!("bad method: {e}")),
            }
        }
    };

    let mut req = client.request(method, &url);
    if let Some(body) = args.body {
        req = req.json(&body);
    }

    match req.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            HttpResult {
                status,
                body,
                error: None,
            }
        }
        Err(e) => HttpResult {
            status: 0,
            body: String::new(),
            error: Some(e.to_string()),
        },
    }
}

/// A camera found on the local network.
#[derive(Serialize)]
pub struct Discovered {
    pub host: String,
    #[serde(rename = "productName")]
    pub product_name: String,
    #[serde(rename = "deviceName")]
    pub device_name: String,
}

/// Best-effort local /24 base, e.g. "192.168.26".
fn local_subnet_base() -> Option<String> {
    let sock = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("8.8.8.8:80").ok()?;
    match sock.local_addr().ok()?.ip() {
        std::net::IpAddr::V4(v4) => {
            let o = v4.octets();
            Some(format!("{}.{}.{}", o[0], o[1], o[2]))
        }
        _ => None,
    }
}

/// Scan the local subnet for Blackmagic cameras exposing the REST API over HTTP.
/// (mDNS is often blocked by host firewalls; a direct probe is more reliable.)
#[tauri::command]
pub async fn discover_cameras(subnet: Option<String>) -> Vec<Discovered> {
    let base = match subnet.or_else(local_subnet_base) {
        Some(b) => b,
        None => return vec![],
    };
    let client = match reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_millis(1200))
        .build()
    {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let mut handles = Vec::new();
    for i in 1..=254u8 {
        let ip = format!("{base}.{i}");
        let c = client.clone();
        handles.push(tokio::spawn(async move {
            let url = format!("http://{ip}/control/api/v1/system/product");
            let resp = c.get(&url).send().await.ok()?;
            if !resp.status().is_success() {
                return None;
            }
            let txt = resp.text().await.ok()?;
            let v: serde_json::Value = serde_json::from_str(&txt).ok()?;
            v.get("productName")?;
            Some(Discovered {
                host: ip,
                product_name: v["productName"].as_str().unwrap_or("").to_string(),
                device_name: v["deviceName"].as_str().unwrap_or("").to_string(),
            })
        }));
    }

    let mut out = Vec::new();
    for h in handles {
        if let Ok(Some(d)) = h.await {
            out.push(d);
        }
    }
    out
}

/// Holds the sender used to push messages into the live WebSocket task.
#[derive(Default)]
pub struct WsState {
    pub tx: Arc<Mutex<Option<UnboundedSender<Message>>>>,
}

fn ws_url(host: &str, secure: bool) -> String {
    let scheme = if secure { "wss" } else { "ws" };
    format!("{scheme}://{host}/control/api/v1/event/websocket")
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
) -> Result<(), String> {
    // Drop any previous connection.
    {
        let mut guard = state.tx.lock().await;
        *guard = None;
    }

    let connector = native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .build()
        .map_err(|e| e.to_string())?;
    let connector = tokio_tungstenite::Connector::NativeTls(connector);

    let url = ws_url(&host, secure);
    let (ws_stream, _resp) = tokio_tungstenite::connect_async_tls_with_config(
        &url,
        None,
        false,
        Some(connector),
    )
    .await
    .map_err(|e| e.to_string())?;

    let (mut write, mut read) = ws_stream.split();
    let (tx, mut rx) = unbounded_channel::<Message>();

    {
        let mut guard = state.tx.lock().await;
        *guard = Some(tx);
    }

    let _ = app.emit("camera-ws-status", "connected");

    // Outgoing pump: front-end -> camera.
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if write.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Incoming pump: camera -> front-end.
    let app2 = app.clone();
    let tx_state = state.tx.clone();
    tokio::spawn(async move {
        while let Some(item) = read.next().await {
            match item {
                Ok(Message::Text(text)) => {
                    let _ = app2.emit("camera-ws", text.to_string());
                }
                Ok(Message::Close(_)) | Err(_) => break,
                _ => {}
            }
        }
        let mut guard = tx_state.lock().await;
        *guard = None;
        let _ = app2.emit("camera-ws-status", "disconnected");
    });

    Ok(())
}

/// Send a raw text frame (JSON request) on the live WebSocket.
#[tauri::command]
pub async fn camera_ws_send(state: State<'_, WsState>, text: String) -> Result<(), String> {
    let guard = state.tx.lock().await;
    match guard.as_ref() {
        Some(tx) => tx
            .send(Message::Text(text.into()))
            .map_err(|e| e.to_string()),
        None => Err("websocket not connected".into()),
    }
}

/// Close the live WebSocket, if any.
#[tauri::command]
pub async fn camera_ws_disconnect(state: State<'_, WsState>) -> Result<(), String> {
    let mut guard = state.tx.lock().await;
    *guard = None;
    Ok(())
}
