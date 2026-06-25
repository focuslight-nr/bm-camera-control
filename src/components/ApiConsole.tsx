import { useState } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";

const METHODS = ["GET", "PUT", "POST", "DELETE"];

/** Manual API access — reaches any endpoint the dedicated panels don't cover yet. */
export function ApiConsole() {
  const transport = useStore((s) => s.transport);
  const t = useT();
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/system");
  const [body, setBody] = useState("");
  const [resp, setResp] = useState("");

  async function send() {
    if (!transport) {
      setResp(t("console.notConnected"));
      return;
    }
    let parsed: any;
    if (body.trim()) {
      try {
        parsed = JSON.parse(body);
      } catch {
        setResp(t("console.badJson"));
        return;
      }
    }
    const r = await transport.request(method, path.trim(), parsed);
    setResp(`HTTP ${r.status}${r.error ? ` — ${r.error}` : ""}\n${pretty(r.body)}`);
  }

  return (
    <section className="panel p-4 flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <span className="text-[var(--color-accent-2)]">⌘</span>
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t("console.title")}</h2>
        <span className="text-[10px] text-[var(--color-muted)]">/control/api/v1</span>
      </header>
      <div className="flex gap-2">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="bg-[var(--color-panel-2)] border border-[var(--color-edge)] rounded-lg px-2 text-sm outline-none"
        >
          {METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          className="flex-1 bg-[var(--color-panel-2)] border border-[var(--color-edge)] rounded-lg px-3 py-1.5 text-sm font-mono outline-none focus:border-[var(--color-accent-2)]"
        />
        <button onClick={send} className="px-4 rounded-lg bg-[var(--color-accent-2)] text-black text-sm font-medium">
          {t("console.send")}
        </button>
      </div>
      {(method === "PUT" || method === "POST") && (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder='{"key": value}'
          rows={2}
          className="bg-[var(--color-panel-2)] border border-[var(--color-edge)] rounded-lg px-3 py-2 text-sm font-mono outline-none"
        />
      )}
      {resp && (
        <pre className="bg-[var(--color-bg)] border border-[var(--color-edge)] rounded-lg p-3 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-auto scrollbar-thin">
          {resp}
        </pre>
      )}
    </section>
  );
}

function pretty(body: string) {
  if (!body) return "(empty)";
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}
