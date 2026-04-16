const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { WebClient } = require('@slack/web-api');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, serverTimestamp } = require('firebase/firestore');

require('dotenv').config();

const app = express();
const PORT = 3000;

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain: 'appreciate-54692.firebaseapp.com',
  projectId: 'appreciate-54692',
  storageBucket: 'appreciate-54692.appspot.com',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || 'YOUR_SENDER_ID',
  appId: process.env.FIREBASE_APP_ID || 'YOUR_APP_ID'
};

const firebaseApp = initializeApp(firebaseConfig, 'server');
const db = getFirestore(firebaseApp);

// Slack client
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

// 絵文字リスト
const EMOJI_LIST = ['🙏', '👏', '🎉', '❤️', '💪', '🔥', '✨', '👍', '🌟', '💯'];

// サーバー側状態管理（Race Condition対策）
const userEmojiState = new Map();

function getStateKey(userId, eventCode) {
  return `${userId}_${eventCode}`;
}

// Slack interactions endpoint (must be before express.json middleware)
app.post('/slack/interactions', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload);

    // Handle button click
    if (payload.type === 'block_actions') {
      const action = payload.actions[0];

      // Open gratitude modal from DM
      if (action.action_id === 'open_gratitude_modal') {
        const [eventCode, eventTitle] = action.value.split('|');
        const key = getStateKey(payload.user.id, eventCode);
        userEmojiState.set(key, []); // 初期化

        await slackClient.views.open({
          trigger_id: payload.trigger_id,
          view: buildGratitudeModal(eventCode, eventTitle, [])
        });

        return res.status(200).send();
      }

      // Emoji button clicked - add emoji（連打対応）
      if (action.action_id.startsWith('emoji_')) {
        const emoji = action.value;
        const metadata = JSON.parse(payload.view.private_metadata);
        const key = getStateKey(payload.user.id, metadata.eventCode);

        // サーバー側で状態管理（Race Condition対策）
        const currentEmojis = userEmojiState.get(key) || [];
        currentEmojis.push(emoji);
        userEmojiState.set(key, currentEmojis);

        await slackClient.views.update({
          view_id: payload.view.id,
          view: buildGratitudeModal(metadata.eventCode, metadata.eventTitle, currentEmojis)
        });

        return res.status(200).send();
      }

      // Clear emojis
      if (action.action_id === 'clear_emojis') {
        const metadata = JSON.parse(payload.view.private_metadata);
        const key = getStateKey(payload.user.id, metadata.eventCode);
        userEmojiState.set(key, []);

        await slackClient.views.update({
          view_id: payload.view.id,
          view: buildGratitudeModal(metadata.eventCode, metadata.eventTitle, [])
        });

        return res.status(200).send();
      }
    }

    // Handle modal submission
    if (payload.type === 'view_submission' && payload.view.callback_id === 'gratitude_submit') {
      const metadata = JSON.parse(payload.view.private_metadata);
      const values = payload.view.state.values;
      const key = getStateKey(payload.user.id, metadata.eventCode);

      // サーバー側の状態から絵文字を取得
      const emojis = userEmojiState.get(key) || [];
      const message = values.message_block?.message_input?.value || '';

      // Validate at least one emoji
      if (emojis.length === 0) {
        return res.json({
          response_action: 'errors',
          errors: {
            message_block: '絵文字を1つ以上選択してください'
          }
        });
      }

      // Save to Firestore
      const gratitudeId = `${metadata.eventCode}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // 絵文字カウントも計算
      const emojiCounts = emojis.reduce((acc, e) => {
        acc[e] = (acc[e] || 0) + 1;
        return acc;
      }, {});

      await setDoc(doc(db, 'gratitudes', gratitudeId), {
        eventCode: metadata.eventCode,
        emojis,
        emojiCounts,
        message,
        slackUserId: payload.user.id,
        slackUserName: payload.user.name,
        createdAt: serverTimestamp()
      });

      // 状態をクリア
      userEmojiState.delete(key);

      console.log('Gratitude saved:', gratitudeId, `(${emojis.length}個の絵文字)`);

      // Close modal with success message
      return res.json({
        response_action: 'update',
        view: {
          type: 'modal',
          title: { type: 'plain_text', text: '送信完了' },
          close: { type: 'plain_text', text: '閉じる' },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `✅ *感謝を送信しました！*\n\n${emojis.length}個の絵文字: ${emojis.slice(0, 20).join('')}${emojis.length > 20 ? '...' : ''}\n${message || ''}`
              }
            }
          ]
        }
      });
    }

    res.status(200).send();
  } catch (error) {
    console.error('Slack interaction error:', error);
    res.status(500).send('Internal error');
  }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'web')));

// Slack signature verification
function verifySlackSignature(req, rawBody) {
  if (!SLACK_SIGNING_SECRET) return true; // Skip in development

  const timestamp = req.headers['x-slack-request-timestamp'];
  const slackSignature = req.headers['x-slack-signature'];

  if (!timestamp || !slackSignature) return false;

  // Check timestamp (within 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const mySignature = 'v0=' + crypto.createHmac('sha256', SLACK_SIGNING_SECRET)
    .update(sigBasestring)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature));
}

// Build gratitude modal with tap-to-add emojis（連打対応）
function buildGratitudeModal(eventCode, eventTitle, emojis = []) {
  const selectedDisplay = emojis.length > 0
    ? (emojis.length <= 30 ? emojis.join('') : `${emojis.slice(0, 30).join('')}... (${emojis.length}個)`)
    : '（タップで追加）';

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${eventTitle}* への感謝を送りましょう！`
      }
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*絵文字を選択（連打OK！）*'
      }
    },
    {
      type: 'actions',
      elements: EMOJI_LIST.slice(0, 5).map((emoji, i) => ({
        type: 'button',
        text: { type: 'plain_text', text: emoji, emoji: true },
        action_id: `emoji_${i}`,
        value: emoji
      }))
    },
    {
      type: 'actions',
      elements: EMOJI_LIST.slice(5, 10).map((emoji, i) => ({
        type: 'button',
        text: { type: 'plain_text', text: emoji, emoji: true },
        action_id: `emoji_${i + 5}`,
        value: emoji
      }))
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*選択中 (${emojis.length}個):* ${selectedDisplay}`
      }
    }
  ];

  // Add clear button if emojis selected
  if (emojis.length > 0) {
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: '🗑️ クリア' },
        action_id: 'clear_emojis',
        style: 'danger'
      }]
    });
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'input',
      block_id: 'message_block',
      optional: true,
      element: {
        type: 'plain_text_input',
        action_id: 'message_input',
        multiline: true,
        max_length: 200,
        placeholder: {
          type: 'plain_text',
          text: 'メッセージを入力（任意・200文字以内）'
        }
      },
      label: {
        type: 'plain_text',
        text: 'メッセージ'
      }
    }
  );

  return {
    type: 'modal',
    callback_id: 'gratitude_submit',
    private_metadata: JSON.stringify({ eventCode, eventTitle }),
    title: {
      type: 'plain_text',
      text: '感謝を送る'
    },
    submit: {
      type: 'plain_text',
      text: '送信'
    },
    close: {
      type: 'plain_text',
      text: 'キャンセル'
    },
    blocks
  };
}

// OAuth callback handler
app.get('/oauth/callback', (req, res) => {
  const { code, error } = req.query;

  if (error) {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>認証エラー</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
          }
          .container {
            text-align: center;
            padding: 40px;
          }
          .error-icon {
            font-size: 64px;
            margin-bottom: 20px;
          }
          h1 {
            margin-bottom: 10px;
          }
          p {
            color: #a0a0a0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error-icon">❌</div>
          <h1>認証エラー</h1>
          <p>認証に失敗しました。アプリを再起動してもう一度お試しください。</p>
          <p>エラー: ${error}</p>
        </div>
      </body>
      </html>
    `);
    return;
  }

  if (code) {
    // Send the code to the Electron app via a custom protocol or display it
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>認証成功</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
          }
          .container {
            text-align: center;
            padding: 40px;
          }
          .success-icon {
            font-size: 64px;
            margin-bottom: 20px;
          }
          h1 {
            margin-bottom: 10px;
          }
          p {
            color: #a0a0a0;
          }
          .code-box {
            background: rgba(255,255,255,0.1);
            border-radius: 8px;
            padding: 15px 30px;
            margin: 20px 0;
            font-family: monospace;
            font-size: 14px;
            word-break: break-all;
          }
        </style>
        <script>
          // Automatically close this window and pass the code to the app
          window.onload = function() {
            if (window.opener) {
              window.opener.postMessage({ type: 'oauth-code', code: '${code}' }, '*');
              setTimeout(() => window.close(), 2000);
            }
          };
        </script>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>認証成功！</h1>
          <p>このウィンドウは自動的に閉じます...</p>
          <p>閉じない場合は手動で閉じてください。</p>
        </div>
      </body>
      </html>
    `);
  } else {
    res.status(400).send('Invalid request');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server (0.0.0.0 for ngrok access)
const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

module.exports = server;
