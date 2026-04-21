/**
 * Appreciate - Express Server
 * Handles OAuth callbacks and Slack interactions
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');

const { SLACK_SIGNING_SECRET } = require('./src/config/slack');
const { SERVER_PORT } = require('./src/config/constants');
const { createInteractionsRouter } = require('./src/slack/interactions');
const { createOAuthRouter } = require('./src/routes/oauth');

const app = express();

// Slack interactions endpoint (must be before express.json middleware)
app.use('/slack/interactions', createInteractionsRouter());

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'web')));

/**
 * Slack signature verification
 * @param {express.Request} req - Express request
 * @param {string} rawBody - Raw request body
 * @returns {boolean} Whether signature is valid
 */
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

// OAuth callback
app.use('/oauth', createOAuthRouter());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server (0.0.0.0 for ngrok access)
const server = app.listen(SERVER_PORT, () => {
  console.log(`Server running at http://localhost:${SERVER_PORT}`);
});

module.exports = server;
