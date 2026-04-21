# Appreciate 開発者ガイド

## 概要

Appreciateは、社内イベント後に参加者から主催者へ感謝を送るためのElectronアプリケーションです。Googleカレンダーと連携してイベントを検出し、Slack経由で感謝を収集します。

---

## アーキテクチャ

```
appreciate/
├── main.js                    # Electronメインプロセス（エントリポイント）
├── server.js                  # Expressサーバー（OAuth・Slack連携）
├── preload.js                 # プリロードスクリプト
├── src/
│   ├── config/                # 設定・初期化
│   ├── services/              # ビジネスロジック
│   ├── windows/               # ウィンドウ管理
│   ├── ipc/                   # IPC通信
│   ├── slack/                 # Slack連携
│   └── routes/                # HTTPルート
└── web/                       # Web UI
```

---

## モジュール詳細

### 1. 設定モジュール (`src/config/`)

#### `firebase.js`
Firebase Firestoreの設定と初期化を管理。

```javascript
const { getDb } = require('./src/config/firebase');

// Firestoreインスタンスを取得
const db = getDb();
```

**エクスポート:**
- `firebaseConfig` - Firebase設定オブジェクト
- `getFirebaseApp(name?)` - Firebaseアプリインスタンスを取得
- `getDb(appName?)` - Firestoreインスタンスを取得

#### `slack.js`
Slackクライアントの初期化とユーザー検索。

```javascript
const { slackClient, getSlackUserIdByEmail } = require('./src/config/slack');

// メールからSlackユーザーIDを取得
const userId = await getSlackUserIdByEmail('user@example.com', 'label');
```

**エクスポート:**
- `slackClient` - Slack WebClientインスタンス（トークン未設定時はnull）
- `SLACK_SIGNING_SECRET` - 署名検証用シークレット
- `getSlackUserIdByEmail(email, label)` - メールからユーザーID検索

#### `google.js`
Google OAuth2の設定と認証フロー。

```javascript
const { oauth2Client, getAuthUrl, exchangeCodeForTokens } = require('./src/config/google');

// 認証URLを生成
const url = getAuthUrl();

// 認証コードをトークンに交換
const tokens = await exchangeCodeForTokens(code);
```

**エクスポート:**
- `SCOPES` - 必要なOAuthスコープ
- `oauth2Client` - OAuth2クライアントインスタンス
- `getAuthUrl()` - 認証URL生成
- `exchangeCodeForTokens(code)` - トークン交換
- `getUserInfo()` - ユーザー情報取得

#### `constants.js`
アプリケーション全体で使用する定数。

```javascript
const { POLLING_INTERVAL, EMOJI_LIST } = require('./src/config/constants');
```

**主な定数:**
| 定数名 | 値 | 説明 |
|--------|-----|------|
| `POLLING_INTERVAL` | 60000 | カレンダーポーリング間隔(ms) |
| `SERVER_PORT` | 3000 | サーバーポート |
| `EMOJI_LIST` | Array | 選択可能な絵文字リスト |
| `APPRECIATE_KEYWORDS` | Object | イベント検出キーワード |

---

### 2. サービスモジュール (`src/services/`)

#### `event.js`
イベントの追跡・管理とFirestore操作。

```javascript
const {
  generateEventCode,
  getTrackedEventByCode,
  saveEvent,
  updateEventDoc,
  calculateDeadlineAndDeliveryTime
} = require('./src/services/event');

// イベントコード生成（6-8文字）
const code = generateEventCode(); // "ABC123"

// 締切と配信時間を計算（イベント終了翌日の9:59/10:00）
const { deadline, deliveryTime } = calculateDeadlineAndDeliveryTime(endTime);
```

**主な機能:**
- イベントコード生成
- メモリ内でのイベント追跡（Map）
- Firestoreへの保存・更新
- 締切時間の計算

#### `gratitude.js`
感謝データのCRUD操作。

```javascript
const { submitGratitude, getSummaryData } = require('./src/services/gratitude');

// 感謝を送信
await submitGratitude({ eventCode, emojis, message });

// サマリーデータを取得
const summary = await getSummaryData(eventCode);
```

**エクスポート:**
- `submitGratitude(data)` - Electronからの感謝送信
- `submitGratitudeFromSlack(data)` - Slackからの感謝送信
- `getGratitudesForEvent(eventCode)` - イベントの感謝一覧取得
- `getSummaryData(eventCode)` - サマリーデータ取得

#### `calendar.js`
Googleカレンダーのポーリングとイベント処理。

```javascript
const { startCalendarPolling, stopCalendarPolling } = require('./src/services/calendar');

// ポーリング開始
await startCalendarPolling();

// ポーリング停止
stopCalendarPolling();
```

**イベント検出条件:**
- タイトルに「社内イベント」を含む
- 説明に `#appreciate` または `#ありがとう` を含む

**フロー:**
1. 1分間隔でカレンダーをポーリング
2. 条件に合うイベントを検出・登録
3. イベント終了時にSlack DMを送信
4. 翌日9:59に受付終了
5. 翌日10:00に感謝を配信

#### `notification.js`
Slack DM通知の送信。

```javascript
const { sendSlackDMToAttendees, sendSlackDMToOrganizer } = require('./src/services/notification');

// 参加者にDM送信
await sendSlackDMToAttendees(emails, eventCode, eventTitle, deadline);

// 主催者にDM送信
await sendSlackDMToOrganizer(email, eventCode, eventTitle);
```

---

### 3. ウィンドウモジュール (`src/windows/`)

#### `manager.js`
Electronウィンドウの作成と管理。

```javascript
const {
  createMainWindow,
  createOverlayWindow,
  createSummaryWindow,
  showMainWindow
} = require('./src/windows/manager');
```

**ウィンドウ種別:**
| 関数 | 説明 | サイズ |
|------|------|--------|
| `createMainWindow()` | ログイン画面 | 400x500 |
| `createOverlayWindow()` | 感謝表示オーバーレイ | フルスクリーン |
| `createSummaryWindow()` | サマリー画面 | 800x600 |

#### `tray.js`
システムトレイの作成。

```javascript
const { createTray, setOverlayFunction } = require('./src/windows/tray');

// オーバーレイ関数を設定（テストメニュー用）
setOverlayFunction(showGratitudeOverlay);

// トレイを作成
createTray();
```

---

### 4. IPCモジュール (`src/ipc/`)

#### `handlers.js`
レンダラープロセスとの通信ハンドラー。

```javascript
const { registerIpcHandlers } = require('./src/ipc/handlers');

// 全IPCハンドラーを登録
registerIpcHandlers();
```

**登録されるハンドラー:**
| チャンネル | 説明 |
|-----------|------|
| `get-auth-url` | OAuth認証URL取得 |
| `exchange-code` | 認証コード交換 |
| `get-stored-user` | 保存済みユーザー取得 |
| `logout` | ログアウト |
| `submit-gratitude` | 感謝送信 |
| `get-event-by-code` | イベント取得 |
| `get-summary-data` | サマリー取得 |
| `open-summary` | サマリーウィンドウを開く |
| `close-overlay` | オーバーレイを閉じる |
| `set-ignore-mouse-events` | マウスイベント透過設定 |

---

### 5. Slackモジュール (`src/slack/`)

#### `modals.js`
Slackモーダルの構築関数。

```javascript
const { buildGratitudeModal, buildClosedModal } = require('./src/slack/modals');

// 感謝送信モーダルを構築
const view = buildGratitudeModal(eventCode, eventTitle, selectedEmojis);
```

**エクスポート:**
- `buildClosedModal(eventTitle)` - 受付終了モーダル
- `buildGratitudeModal(eventCode, eventTitle, emojis)` - 感謝送信モーダル
- `buildSuccessModal(emojis, message)` - 送信完了モーダル

#### `interactions.js`
Slackインタラクションの処理。

```javascript
const { createInteractionsRouter } = require('./src/slack/interactions');

// Expressルーターを作成
app.use('/slack/interactions', createInteractionsRouter());
```

**処理するアクション:**
- `open_gratitude_modal` - モーダルを開く
- `emoji_*` - 絵文字選択
- `clear_emojis` - 絵文字クリア
- `gratitude_submit` - 送信

---

### 6. ルートモジュール (`src/routes/`)

#### `oauth.js`
OAuth2コールバック処理。

```javascript
const { createOAuthRouter } = require('./src/routes/oauth');

app.use('/oauth', createOAuthRouter());
```

**エンドポイント:**
- `GET /oauth/callback` - Google OAuth2コールバック

---

## データフロー

### イベント検出〜感謝配信

```
┌─────────────────────────────────────────────────────────────────┐
│                     カレンダーポーリング                          │
│  calendar.js: startCalendarPolling()                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ イベント検出
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     イベント登録                                 │
│  event.js: saveEvent() → Firestore                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ イベント終了時
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Slack DM送信                                 │
│  notification.js: sendSlackDMToAttendees()                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 参加者がボタンクリック
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     感謝モーダル表示                             │
│  interactions.js → modals.js: buildGratitudeModal()            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 送信
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     感謝保存                                     │
│  gratitude.js: submitGratitudeFromSlack() → Firestore          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 翌日10:00
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     感謝配信                                     │
│  main.js: deliverGratitudes()                                   │
│  → オーバーレイ表示 + 主催者へDM                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 環境変数

`.env` ファイルに以下を設定:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# Firebase
FIREBASE_API_KEY=your_api_key
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id

# Slack
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your_signing_secret

# App
WEB_APP_URL=http://localhost:3000
```

---

## 開発コマンド

```bash
# 開発サーバー起動
npm start

# モジュールテスト（Node.js）
node -e "require('./src/config/firebase')"

# ヘルスチェック
curl http://localhost:3000/health
```

---

## トラブルシューティング

### Firebase初期化エラー
```
Firebase: Firebase App named '[DEFAULT]' already exists
```
→ `getFirebaseApp()` は既存インスタンスを返すため、通常は発生しない

### Slackクライアントがnull
→ `SLACK_BOT_TOKEN` 環境変数を確認

### カレンダーポーリングが動作しない
→ Googleログイン後、`store.get('tokens')` が保存されているか確認

---

## 貢献ガイドライン

1. 新機能は適切なモジュールに追加
2. 設定値は `constants.js` に集約
3. Firestoreアクセスは `services/` 経由で行う
4. CommonJS形式を維持（`require`/`module.exports`）
