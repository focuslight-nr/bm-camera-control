import { create } from "zustand";

export type Lang = "en" | "ja";

/** UI string table. Keys are stable ids; English is the default/fallback. */
const STR = {
  "app.subtitle": { en: "Camera Control", ja: "カメラコントロール" },
  "conn.camera": { en: "Camera", ja: "実機" },
  "conn.mock": { en: "Mock", ja: "モック" },
  "conn.https": { en: "HTTPS", ja: "HTTPS" },
  "conn.username": { en: "Username", ja: "ユーザー名" },
  "conn.password": { en: "Password", ja: "パスワード" },
  "conn.connect": { en: "Connect", ja: "接続" },
  "conn.disconnect": { en: "Disconnect", ja: "切断" },
  "conn.connecting": { en: "Connecting…", ja: "接続中…" },
  "conn.failed": { en: "Connection failed — check host / credentials", ja: "接続失敗 — ホスト/資格情報を確認してください" },
  "conn.recent": { en: "Recent", ja: "最近" },
  "guard.on": { en: "PROGRAM guard on", ja: "PROGRAMガード ON" },
  "guard.off": { en: "PROGRAM guard off", ja: "PROGRAMガード OFF" },
  "conn.scan": { en: "Scan network", ja: "ネットワーク検索" },
  "conn.scanning": { en: "Scanning…", ja: "検索中…" },
  "fleet.show": { en: "Fleet", ja: "複数カメラ" },
  "fleet.title": { en: "Camera Fleet", ja: "カメラ一覧" },
  "fleet.control": { en: "Control", ja: "操作" },
  "fleet.offline": { en: "offline", ja: "オフライン" },
  "fleet.empty": { en: "No cameras yet — scan or connect.", ja: "カメラ未登録 — 検索/接続してください。" },
  "tab.close": { en: "Disconnect", ja: "切断" },
  "tab.copyLook": { en: "Copy look → others", ja: "ルックを他カメラへ" },
  "tab.copied": { en: "Copied", ja: "コピー" },
  "tab.cameras": { en: "cams", ja: "台" },
  "conn.hostPlaceholder": { en: "camera-name.local", ja: "camera-name.local" },
  "conn.browserWarning": {
    en: "※ Real-camera connection needs the desktop app (browser is mock-only)",
    ja: "※ ブラウザ実行では実機接続は不可（Tauri アプリで利用）",
  },
  "status.disconnected": { en: "disconnected", ja: "未接続" },
  "status.connecting": { en: "connecting", ja: "接続中" },
  "status.connected": { en: "connected", ja: "接続済み" },
  "status.error": { en: "error", ja: "エラー" },
  "onair": { en: "ON AIR", ja: "オンエア" },
  "empty.line1": {
    en: "Connect to a camera and only the features it supports appear.",
    ja: "カメラに接続するとモデルが対応する機能だけが表示されます。",
  },
  "empty.line2": {
    en: "No camera? Pick Mock to explore the app.",
    ja: "実機が無い場合は Mock を選んで動作を確認できます。",
  },
  "scene.save": { en: "Save scene", ja: "シーン保存" },
  "scene.load": { en: "Load scene", ja: "シーン読込" },
  "scene.applied": { en: "Applied", ja: "適用" },
  "scene.skipped": { en: "skipped", ja: "スキップ" },
  "scene.loadError": { en: "Invalid scene file", ja: "無効なシーンファイル" },
  "scenes.title": { en: "Scenes", ja: "シーン" },
  "scenes.namePlaceholder": { en: "Scene name…", ja: "シーン名…" },
  "scenes.saveCurrent": { en: "Save current", ja: "現在を保存" },
  "scenes.apply": { en: "Apply", ja: "適用" },
  "scenes.empty": { en: "No saved scenes yet.", ja: "保存済みシーンはありません。" },
  // Recording HUD
  "hud.recording": { en: "REC", ja: "REC" },
  "hud.standby": { en: "STBY", ja: "待機" },
  "hud.remaining": { en: "Remaining", ja: "残り収録" },
  "hud.clips": { en: "Clips", ja: "クリップ" },
  "hud.space": { en: "Free", ja: "空き" },
  "console.title": { en: "API Console", ja: "API コンソール" },
  "console.send": { en: "Send", ja: "送信" },
  "console.notConnected": { en: "Not connected.", ja: "未接続です。" },
  "console.badJson": { en: "⚠ Body is not valid JSON.", ja: "⚠ ボディが正しい JSON ではありません。" },
  // Panel titles
  "panel.transport": { en: "Transport", ja: "収録 / 再生" },
  "panel.lens": { en: "Lens", ja: "レンズ" },
  "panel.exposure": { en: "Exposure", ja: "露出" },
  "panel.whitebalance": { en: "White Balance", ja: "ホワイトバランス" },
  "panel.color": { en: "Color", ja: "カラー" },
  "panel.monitoring": { en: "Monitoring", ja: "モニタリング" },
  "panel.audio": { en: "Audio", ja: "オーディオ" },
  "panel.livestream": { en: "Livestream", ja: "ライブ配信" },
  "panel.system": { en: "System / Codec", ja: "システム / コーデック" },
  "panel.presets": { en: "Presets", ja: "プリセット" },
  "panel.camera": { en: "Status", ja: "ステータス" },
  "panel.slate": { en: "Slate / Metadata", ja: "スレート / メタデータ" },
  "panel.media": { en: "Media", ja: "メディア" },
  // Per-output monitoring
  "monout.title": { en: "Output Monitoring", ja: "出力モニタリング" },
  "monout.display": { en: "Output", ja: "出力" },
  "monout.zebra": { en: "Zebra", ja: "ゼブラ" },
  "monout.falseColor": { en: "False color", ja: "フォルスカラー" },
  "monout.displayLUT": { en: "Display LUT", ja: "表示 LUT" },
  "monout.cleanFeed": { en: "Clean feed", ja: "クリーンフィード" },
  "monout.frameGrids": { en: "Frame grids", ja: "グリッド" },
  "monout.safeArea": { en: "Safe area", ja: "セーフエリア" },
  "monout.focusAssist": { en: "Focus assist", ja: "フォーカスアシスト" },
  // Slate fields
  "slate.scene": { en: "Scene", ja: "シーン" },
  "slate.take": { en: "Take", ja: "テイク" },
  "slate.reel": { en: "Reel", ja: "リール" },
  "slate.sceneTime": { en: "Scene time", ja: "時間帯" },
  "slate.location": { en: "Location", ja: "場所" },
  "slate.project": { en: "Project", ja: "プロジェクト" },
  "slate.director": { en: "Director", ja: "監督" },
  "slate.operator": { en: "Operator", ja: "オペレーター" },
  "slate.autoInc": { en: "Auto-increment take", ja: "テイク自動加算" },
  // Media
  "media.slot": { en: "Slot", ja: "スロット" },
  "media.workingSet": { en: "Working set", ja: "ワーキングセット" },
  "media.active": { en: "Active", ja: "アクティブ" },
  "media.none": { en: "No media detected", ja: "メディアが検出されません" },
  "media.format": { en: "Format", ja: "初期化" },
  "media.formatConfirm": {
    en: "Erase ALL data and format this card? This cannot be undone.",
    ja: "このカードの全データを消去して初期化しますか？元に戻せません。",
  },
  "media.formatting": { en: "Formatting…", ja: "初期化中…" },
  "media.filesystem": { en: "Filesystem", ja: "ファイルシステム" },
  "media.free": { en: "free", ja: "空き" },
  "media.clips": { en: "clips", ja: "クリップ" },
  "media.formatFailed": { en: "Format failed", ja: "初期化に失敗しました" },
  // System format
  "format.recordFormat": { en: "Record format", ja: "収録フォーマット" },
  "format.resolution": { en: "Resolution", ja: "解像度" },
  "format.codec": { en: "Codec", ja: "コーデック" },
  "format.frameRate": { en: "Frame rate", ja: "フレームレート" },
  "format.apply": { en: "Apply format", ja: "フォーマット適用" },
  "format.confirm": {
    en: "Change the recording format? This briefly reconfigures the camera.",
    ja: "収録フォーマットを変更しますか？カメラが一時的に再構成されます。",
  },
} as const;

export type StrKey = keyof typeof STR;

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const STORAGE_KEY = "bmcc.lang";
function initialLang(): Lang {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  return saved === "ja" || saved === "en" ? saved : "en"; // default English
}

export const useLang = create<LangState>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
    set({ lang });
  },
}));

/** Hook returning a translator for the current language. */
export function useT() {
  const lang = useLang((s) => s.lang);
  return (key: StrKey) => STR[key]?.[lang] ?? STR[key]?.en ?? key;
}
