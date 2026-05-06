# Appreciate - 開発者向けドキュメント

イベント感謝収集システムの技術仕様書です。

---

## 目次

1. [プロジェクト概要](#プロジェクト概要)
2. [技術スタック](#技術スタック)
3. [ディレクトリ構造](#ディレクトリ構造)
4. [環境構築](#環境構築)
5. [アーキテクチャ](#アーキテクチャ)
6. [データベース設計](#データベース設計)
7. [API仕様](#api仕様)
8. [イベントライフサイクル](#イベントライフサイクル)
9. [開発・デプロイ](#開発デプロイ)
10. [トラブルシューティング](#トラブルシューティング)

---

## プロジェクト概要

**Appreciate**は、社内イベント終了後に参加者から感謝を収集・表示するElectronデスクトップアプリケーションです。

### 主要機能

- Google Calendarイベント自動検出（タイトルに「社内イベント」を含むイベント）
- イベント終了後、参加者へSlack DMで感謝送信を促す
- デスクトップオーバーレイで感謝をリアルタイムストリーム表示
- Web UIで感謝確認（イベントコード参照）
- 感謝サマリーレポート生成

---

## 技術スタック

| カテゴリ | 技術 | バージョン |
|---------|------|-----------|
| **フレームワーク** | Electron | 28.1.3 |
| **サーバー** | Express.js | 4.18.2 |
| **データベース** | Firebase Cloud Firestore | 10.7.1 |
| **外部API** | Slack Web API | 7.0.1 |
| **外部API** | Google APIs | 129.0.0 |
| **ローカルストレージ** | electron-store | 8.1.0 |
| **ビルド** | electron-builder | 24.9.1 |

---

## ディレクトリ構造

```
appreciate/
├── main.js                    # Electronメインプロセス（コアロジック）
├── server.js                  # Express.jsサーバー（Slack連携）
├── preload.js                 # Electronプリロード（IPC仲介）
├── package.json               # プロジェクト設定
│
├── src/windows/               # Electronウィンドウ用HTML
│   ├── login.html            # ログイン画面
│   ├── overlay.html          # リアルタイム感謝表示オーバーレイ
│   └── summary.html          # 感謝サマリー表示
│
├── web/                       # Webアプリ（Firebase Hosting）
│   ├── index.html            # ホームページ
│   ├── view.html             # 感謝確認ページ
│   └── firebase-config.js    # Firebase設定
│
├── scripts/                   # ユーティリティスクリプト
│   ├── deploy-web.js         # Firebase Hostingデプロイ
│   ├── trigger-overlay.js    # オーバーレイテスト
│   └── test-slack-dm.js      # Slack DMテスト
│
├── assets/                    # アイコン素材
│   ├── icon.icns
│   └── tray-icon.png
│
├── firebase.json              # Firebase設定
├── firestore.rules            # Firestoreセキュリティルール
├── firestore.indexes.json     # Firestoreインデックス
├── .env                       # 環境変数（gitignored）
└── .env.example               # 環境変数テンプレート
```

---

## 環境構築

### 必要条件

- Node.js 18.x 以上
- npm 9.x 以上
- macOS（Electronビルド用）

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example`をコピーして`.env`を作成し、以下の値を設定します。

```bash
cp .env.example .env
```

| 変数名 | 説明 | 取得元 |
|--------|------|--------|
| `GOOGLE_CLIENT_ID` | Google OAuth2クライアントID | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2シークレット | Google Cloud Console |
| `FIREBASE_API_KEY` | Firebase APIキー | [Firebase Console](https://console.firebase.google.com) |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID | Firebase Console > Project Settings |
| `FIREBASE_APP_ID` | Firebase App ID | Firebase Console > Project Settings |
| `SLACK_BOT_TOKEN` | Slack Botトークン（xoxb-...） | [Slack API](https://api.slack.com/apps) |
| `SLACK_SIGNING_SECRET` | Slack署名シークレット | Slack API > Basic Information |

### 3. 外部サービスの設定

#### Google Cloud Console

1. OAuth同意画面を設定
2. OAuth 2.0クライアントIDを作成（デスクトップアプリ）
3. リダイレクトURIに `http://localhost:3000/oauth/callback` を追加
4. 以下のスコープを有効化:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`

#### Firebase

1. Firestoreデータベースを作成
2. セキュリティルールをデプロイ: `firebase deploy --only firestore:rules`
3. インデックスをデプロイ: `firebase deploy --only firestore:indexes`

#### Slack App

1. Slack Appを作成
2. Bot Token Scopesを追加:
   - `chat:write`
   - `users:read.email`
3. Interactivityを有効化し、Request URLを設定:
   - `https://your-domain.com/slack/interactions`（本番）
   - ngrok等でローカル開発時は一時URLを設定

### 4. アプリケーションの起動

```bash
npm start
```

---

## アーキテクチャ

### システム構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                    Electron Application                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Main Window │  │   Overlay   │  │    Summary Window       │ │
│  │ (login.html)│  │(overlay.html│  │    (summary.html)       │ │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘ │
│         │                │                      │               │
│         └────────────────┼──────────────────────┘               │
│                          │ IPC                                  │
│                    ┌─────┴─────┐                                │
│                    │ main.js   │                                │
│                    │ (メイン   │                                │
│                    │ プロセス) │                                │
│                    └─────┬─────┘                                │
└──────────────────────────┼──────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│   Firebase  │   │   Google    │   │    Slack    │
│  Firestore  │   │  Calendar   │   │     API     │
└─────────────┘   └─────────────┘   └─────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Express.js Server (server.js)                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ /slack/         │  │ /oauth/callback │  │ /health         │ │
│  │ interactions    │  │                 │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### プロセス間通信（IPC）

Electronのセキュアなコンテキスト隔離を使用しています。

**preload.js** が公開するAPI（`window.electronAPI`）:

```javascript
// 認証
electronAPI.getAuthUrl()           // OAuth URL取得
electronAPI.exchangeCode(code)     // 認証コード交換
electronAPI.getStoredUser()        // 保存済みユーザー取得
electronAPI.logout()               // ログアウト

// イベント
electronAPI.getEventByCode(code)   // イベントコードで取得
electronAPI.getSummaryData(code)   // サマリーデータ取得

// 感謝
electronAPI.submitGratitude(data)  // 感謝送信

// ウィンドウ
electronAPI.openSummary(code)      // サマリーウィンドウを開く
electronAPI.closeOverlay()         // オーバーレイを閉じる
electronAPI.setIgnoreMouseEvents(ignore) // マウスイベント制御

// リスナー
electronAPI.onShowGratitudes(callback)   // 感謝表示イベント
electronAPI.onLoadSummary(callback)      // サマリーロードイベント
```

---

## データベース設計

### Firestore コレクション

#### events

イベント情報を格納するコレクション。

| フィールド | 型 | 説明 |
|-----------|------|------|
| `googleEventId` | string | Google CalendarイベントID |
| `title` | string | イベント名 |
| `description` | string | 説明 |
| `startTime` | Timestamp | 開始時刻 |
| `endTime` | Timestamp | 終了時刻 |
| `eventCode` | string | 一意のイベントコード（6-8文字） |
| `organizerEmail` | string | 主催者メールアドレス |
| `attendees` | string[] | 参加者メールアドレス配列 |
| `status` | string | `pending` / `collecting` / `completed` |
| `deadline` | Timestamp | 感謝受付デッドライン |
| `deliveryTime` | Timestamp | 配信時刻 |
| `overlayShown` | boolean | オーバーレイ表示済みフラグ |
| `delivered` | boolean | 配信済みフラグ |
| `createdAt` | Timestamp | 作成日時 |

#### gratitudes

感謝データを格納するコレクション。

| フィールド | 型 | 説明 |
|-----------|------|------|
| `eventCode` | string | イベントコード（外部キー） |
| `emojis` | string[] | 選択された絵文字配列 |
| `emojiCounts` | object | 絵文字ごとのカウント |
| `message` | string | メッセージ（任意、最大200文字） |
| `slackUserId` | string | Slack ユーザーID |
| `slackUserName` | string | Slack ユーザー名 |
| `createdAt` | Timestamp | 作成日時 |

### インデックス

```json
{
  "indexes": [
    {
      "collectionGroup": "events",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "endTime", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "gratitudes",
      "fields": [
        { "fieldPath": "eventCode", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]
    }
  ]
}
```

---

## API仕様

### Express.js エンドポイント（server.js）

#### POST /slack/interactions

Slackのインタラクティブコンポーネント（ボタンクリック、モーダル送信）を処理します。

**ペイロード種別**:

1. **block_actions** - 絵文字ボタンクリック
   - サーバー側で状態管理（レース条件対策）
   - 絵文字カウントをインクリメント/デクリメント
   - モーダルを更新して選択状態を反映

2. **view_submission** - モーダル送信
   - Firestoreに感謝データを保存
   - 送信完了メッセージをSlack DMで通知

#### GET /oauth/callback

Google OAuth2認証コールバックを処理します。

**クエリパラメータ**:
- `code`: 認証コード
- `state`: CSRF防止用状態トークン

#### GET /health

ヘルスチェック用エンドポイント。

**レスポンス**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### IPC ハンドラー（main.js）

| ハンドラー名 | 引数 | 戻り値 |
|-------------|------|--------|
| `get-auth-url` | なし | OAuth URL (string) |
| `exchange-code` | code: string | `{ success, user?, error? }` |
| `get-stored-user` | なし | user object または undefined |
| `logout` | なし | `{ success }` |
| `submit-gratitude` | `{ eventCode, emojis, message }` | `{ success, error? }` |
| `get-event-by-code` | eventCode: string | `{ success, event?, error? }` |
| `get-summary-data` | eventCode: string | `{ success, data?, error? }` |
| `open-summary` | eventCode: string | なし |
| `close-overlay` | なし | なし |
| `set-ignore-mouse-events` | ignore: boolean | なし |

---

## イベントライフサイクル

```
1. カレンダーポーリング（1分間隔）
   └─ Google Calendar APIで「社内イベント」を含むイベントを検索
         │
         ▼
2. イベント検出
   └─ Firestoreに events ドキュメント作成
      - eventCode: 6-8文字のランダム英数字
      - status: 'pending'
         │
         ▼
3. イベント終了時刻到達
   └─ status: 'collecting' に更新
      - deadline: 翌日9:59に設定
      - deliveryTime: 翌日10:00に設定
      - 全参加者にSlack DM送信（感謝送信リンク付き）
         │
         ▼
4. デッドライン到達（翌日9:59）
   └─ status: 'completed' に更新
      - 感謝受付終了
         │
         ▼
5. 配信時刻到達（翌日10:00）
   └─ オーバーレイウィンドウを表示
      - Firestoreから gratitudes をリアルタイムストリーム
      - 主催者にSlack DM送信（サマリーリンク付き）
         │
         ▼
6. 配信完了
   └─ delivered: true に更新
```

---

## 開発・デプロイ

### npm スクリプト

```bash
# 開発環境で起動
npm start

# macOS用DMGをビルド
npm run build

# Firebase Hostingにデプロイ
npm run deploy-web
```

### Firebase デプロイ

```bash
# Firestoreルールのみデプロイ
firebase deploy --only firestore:rules

# インデックスのみデプロイ
firebase deploy --only firestore:indexes

# Hostingのみデプロイ
firebase deploy --only hosting

# 全てデプロイ
firebase deploy
```

### テストスクリプト

```bash
# Slack DMテスト
node scripts/test-slack-dm.js

# オーバーレイテスト（手順表示）
node scripts/trigger-overlay.js
```

---

## トラブルシューティング

### Google OAuth認証エラー

**症状**: 認証画面でエラーが表示される

**解決策**:
1. Google Cloud ConsoleでリダイレクトURIが正しく設定されているか確認
2. OAuth同意画面のステータスが「テスト」の場合、テストユーザーに追加されているか確認
3. 必要なスコープが全て有効化されているか確認

### Slack DMが送信されない

**症状**: イベント終了後にSlack DMが届かない

**解決策**:
1. `SLACK_BOT_TOKEN`が正しいか確認
2. Slack Appの`users:read.email`スコープが有効か確認
3. 参加者のメールアドレスがSlackアカウントと一致しているか確認
4. Slack Appがワークスペースにインストールされているか確認

### Firestoreへの書き込みエラー

**症状**: 感謝データが保存されない

**解決策**:
1. Firebase Consoleでセキュリティルールを確認
2. `firestore.rules`の内容が正しくデプロイされているか確認
3. Firebaseの認証状態を確認

### オーバーレイが表示されない

**症状**: 配信時刻になってもオーバーレイが表示されない

**解決策**:
1. イベントの`status`が`completed`になっているか確認
2. `deliveryTime`が正しく設定されているか確認
3. アプリケーションが起動中か確認
4. Electronのログでエラーがないか確認

### カレンダーイベントが検出されない

**症状**: 「社内イベント」を含むイベントが検出されない

**解決策**:
1. Google Calendarへのアクセス権限が付与されているか確認
2. イベントタイトルに「社内イベント」が含まれているか確認
3. カレンダーの所有者または参加者としてログインしているか確認

---

## 参考情報

### Firebase プロジェクト

- **プロジェクトID**: `appreciate-54692`
- **Hosting URL**: `https://appreciate-54692.web.app`
- **Firestore Database**: `https://console.firebase.google.com/project/appreciate-54692/firestore`

### 主要ファイルの行数目安

| ファイル | 行数 | 主な責務 |
|---------|------|---------|
| `main.js` | ~800行 | Electronメインプロセス、イベント処理 |
| `server.js` | ~500行 | Express.js、Slack連携 |
| `preload.js` | ~30行 | IPC仲介 |

---

## 更新履歴

- **2024-01** - 初版作成
