# Bm Camera Control

[English](README.md) | **日本語**

Blackmagic カメラを **Camera Control REST API + 通知用 WebSocket** 経由で操作する、
クロスプラットフォーム(Windows / macOS)のデスクトップアプリです。Tauri 2 + React +
TypeScript で新規に構築しています。UI は **ケイパビリティ駆動**で、接続したカメラが実際に
申告する機能だけを表示するため、同じアプリが機種ごとに自動で適応します。

![Bm Camera Control](docs/screenshot.png)

> 非公式・サードパーティ製ツールです。Blackmagic Design とは無関係であり、承認も受けていません。
> 仕様参照: `RESTAPIforBlackmagicCameras.pdf`(Blackmagic Developer Information, 2025年8月)

## なぜデスクトップアプリ(Tauri)なのか

カメラは **自己署名証明書**付きの HTTPS で API を提供します。素のブラウザアプリでは CORS と
証明書信頼のプロンプトで詰まります。本アプリは **Rust バックエンド**が REST + WebSocket の
通信をすべて代理し(`src-tauri/src/camera.rs`)、自己署名証明書を受理し CORS を完全に回避します。
フロントエンドがカメラと直接通信することはありません。

## 機能ゲーティングの仕組み

接続時に、カメラ自身からケイパビリティ一式を構築します(機種ごとのハードコードは不要):

- `GET /system/product` → 機種名 + ファームウェア
- WebSocket `listProperties` → その個体が対応する正確なプロパティ一覧
- `GET /video/supportedISOs`、`…/supportedShutters` など → 選択肢・範囲

`src/api/registry.ts` の各コントロールは、有効化を司るプロパティでタグ付けされ、
`src/components/Panel.tsx` がカメラの非対応機能を非表示にします。

## アーキテクチャ

```
src-tauri/src/camera.rs   Rust: HTTP プロキシ + WebSocket リレー(自己署名 TLS 対応)
src/api/                  通信層(Tauri/モック)、コントロールレジストリ
src/store.ts              Zustand ストア + 接続/購読/ケイパビリティのフロー
src/components/           パネル、ウィジェット、カラーホイール、API コンソール
src/mock/profiles.ts      オフライン開発用の仕様準拠モックカメラ
```

通信層は抽象化されています(`src/types.ts: Transport`)。実機用の **TauriTransport** と、
オフライン用の **MockTransport** があります。素のブラウザでは既定でモック、Tauri シェル内
では実機に接続できます。

## 前提条件

- Node.js 18+
- Rust(stable) — <https://rustup.rs> からインストール
- **Windows**: MSVC C++ Build Tools + WebView2(Windows 11 はプリインストール)
- **macOS**: Xcode Command Line Tools(`xcode-select --install`)

## 開発

```bash
npm install
npm run tauri dev      # 実機に接続するデスクトップアプリ
npm run dev            # ブラウザのみ(モックモード)、http://localhost:1420
```

## ビルド

```bash
npm run tauri build    # 現在の OS 向けインストーラ(Win .msi / macOS .dmg)
```

## 実機への接続

1. **Blackmagic Camera Setup** でネットワークアクセス(web media manager)を有効化し、
   HTTPS 証明書を生成します。ファームウェア 8.6 以降。
2. アプリを起動し、ソース切替を **Camera** にして、ホスト名
   (例: `studio-camera-6k-pro.local`)を入力、HTTPS を有効のまま Connect します。

### Secure login(HTTP Basic 認証)

Blackmagic Camera Setup で **Secure login** を有効にすると、カメラは HTTPS エンドポイントで
HTTP Basic 認証を要求します(`WWW-Authenticate: Basic` 付きの `401` を返します)。HTTPS に
チェックを入れた状態で、接続バーにカメラの **ユーザー名 / パスワード** を入力してください。
資格情報は REST 呼び出しと WebSocket ハンドシェイクの両方に付与されます。資格情報は
メモリ上にのみ保持され、ディスクには保存しません。Secure login が無効なら空欄のままで
構いません(または HTTP で接続)。

## 検出 & マルチカメラ

- **ネットワークスキャン**(デスクトップ)は、ローカル /24 を REST API でプローブして
  カメラを発見します(`src-tauri/src/camera.rs` の `discover_cameras`)。mDNS ではなくこの
  方式を採用しているのは、ホストのファイアウォールが受信 UDP 5353 をしばしばブロックする
  ためで、直接 HTTP プローブの方が確実です。検出済み/最近のカメラはワンクリックの接続チップ
  として表示されます。
- **コントロールタブ** — 接続中の各カメラは独立したライブセッション(専用 WebSocket + 状態)
  としてタブ表示されます。再接続なしで瞬時にタブ切替でき、各タブが自前のライブデータと
  ON AIR / PROGRAM ガード状態を保持します。ストアは `sessions` マップ + `activeId` を持ち、
  アクティブセッションを top-level フィールドにミラーリングするためパネル側は単純なまま
  です(`src/store.ts`, `src/components/TabBar.tsx`)。
- **Copy look → others** は、アクティブカメラのルックを他の全接続タブに適用します
  (非対応設定はスキップ)。ワンアクションのマルチカメラ・カラーマッチです。
- **Fleet ビュー**(ヘッダー ▦)は、複数カメラを同時にポーリングするタリーウォールを表示
  します(PGM/PVW、REC、バッテリ、オンライン)。**Control** でそのカメラをライブタブとして
  開きます(`src/fleetStore.ts`, `src/components/FleetWall.tsx`)。

## 信頼性 & 安全性

- 書き込みは **エンドポイント単位で直列化**され、409 はリトライします。
- **自動再接続** — WebSocket が切断した場合に再確立します(実機)。
- **最近のカメラ** を記憶し、すばやく再接続できます。
- **PROGRAM ガード**: カメラのタリーが Program(または収録中)の間、最初の「映像に影響する
  変更」で確認を求め、その後はセッション中アンロックされます。カメラが Program を抜けると
  再武装します。ライブ中はヘッダーで ON/OFF を切替できます。

## オート WB / AF と出力別モニタリング

- ワンタッチの **オートホワイトバランス** / **オートフォーカス**
  (`/video/whiteBalance/doAuto`, `/lens/focus/doAutoFocus`)。
- **出力モニタリング**パネル: 物理出力ごと(HDMI / SDI / USB-C)に、ゼブラ、フォルスカラー、
  フォーカスアシスト、表示 LUT、クリーンフィード、フレームグリッド、セーフエリアを切替。

## シーン

ファイルの保存/読込に加え、アプリ内の **名前付きシーン**(localStorage、ワンタップ呼び出し)、
さらに **収録 HUD**(経過時間、残り収録時間、クリップ数、空き容量)を備えます。

## シーンの保存 / 読込

ヘッダーに **Save scene** / **Load scene** があります。保存は、カメラの調整可能な*ルック*設定
(露出、ホワイトバランス、カラーコレクション、モニタリング、オーディオ、カメラ表示オプション)を
可搬な JSON ファイルにエクスポートします(`src/config.ts`)。ファイルの読込はそれらの設定を
接続中のカメラに再適用し、**カメラが非対応の項目はスキップ**します(=機種をまたいで可搬)。
物理的/状態的/破壊的なもの(収録/再生、レンズ位置、収録フォーマット、メディア初期化、
スレートのメタデータ)は意図的に**保存しない**ため、シーンを読み込んでも録画が始まったり
カードが初期化されたりしません。保存はブラウザ/webview のダウンロードを使います。デスクトップ
ビルドでプロンプトが出ない場合は Tauri の `dialog`/`fs` プラグインを配線してください。

## 多言語対応(i18n)

UI は既定で **英語**、ヘッダーのトグルで **日本語** に切り替えられます(`localStorage` に永続化)。
文字列は `src/i18n.ts`(`useT()` フック)にあり、`STR` テーブルを拡張すれば言語を追加できます。

## CI & リリース

- **CI**(`.github/workflows/ci.yml`)は `main` への push と PR ごとに実行され、
  フロントエンドの型チェック+ビルドと、Rust バックエンドの `cargo check` を行います。
- **リリース**(`.github/workflows/release.yml`)はバージョンタグを push すると実行され、
  **Windows** と **macOS**(Apple Silicon + Intel)向けのネイティブインストーラをビルドして、
  **下書き(draft)**の GitHub Release に添付します:

  ```bash
  # 先に package.json と src-tauri/{Cargo.toml,tauri.conf.json} のバージョンを更新
  git tag v0.1.0 && git push origin v0.1.0
  ```

  ビルドは **署名なし**です(Windows SmartScreen / macOS Gatekeeper が「不明な発行元」と警告
  します)。一般配布する場合は、コード署名証明書をリポジトリの Secrets に登録し、`tauri-action`
  に配線してください。

## 実装状況

実装済み: 接続 + ケイパビリティ検出、収録/再生(Transport)、レンズ、露出(ディテール
シャープニング含む)、ホワイトバランス、カラー(LGGO ホイール)、モニタリング、オーディオ
(入力ソース / レベル / +48V / ローカット / パッド)、ライブ配信、**収録フォーマット**エディタ
(`/system/format` + `/system/supportedFormats`、明示的な Apply)、プリセット、ステータス/タリー
(+ カラーバー、プログラム表示、電源表示モード)、**スレート / メタデータ**エディタ、**メディア**
(スロット / ワーキングセット / 確認付きの2段階破壊的**初期化**)、さらに専用ウィジェットが
未提供のエンドポイントにも到達できる **API コンソール**。書き込みは**エンドポイント単位で
直列化**され 409 をリトライします(`/slates/nextClip` 等、一部は同時 PUT を拒否するため)。
コントロールの追加は `src/api/registry.ts` にエントリを足すだけ(スレート/フォーマット/メディア
のような入れ子リソースは専用パネル)で済みます。

**実機でエンドツーエンド検証済み** — Micro Studio Camera 4K G2(FW 9.6.2)に HTTP 接続:
ケイパビリティ検出、全パネルのライブ動作、機種別の機能ゲーティング、書き込み往復
(セーフエリアのスライダーと入れ子のスレートメタデータ、いずれも独立した `curl` で確認)。
注意: 本機は HTTP で接続してください(HTTPS エンドポイントは認証が必要で 401 を返します)。
既知の軽微な点: スレートの連続 PUT で一時的に 409 を返すことがあり、スレート書き込みを
直列化すると堅牢になります。
