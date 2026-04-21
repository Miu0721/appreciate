/**
 * OAuth callback route
 */

const express = require('express');

/**
 * Create OAuth router
 * @returns {express.Router} Express router
 */
function createOAuthRouter() {
  const router = express.Router();

  router.get('/callback', (req, res) => {
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

  return router;
}

module.exports = {
  createOAuthRouter
};
