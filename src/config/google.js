/**
 * Google OAuth2 configuration
 */

require('dotenv').config();
const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

const REDIRECT_URI = 'http://localhost:3000/oauth/callback';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID',
  process.env.GOOGLE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET',
  REDIRECT_URI
);

/**
 * Generate OAuth2 authorization URL
 * @returns {string} Authorization URL
 */
function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code
 * @returns {Promise<Object>} Tokens
 */
async function exchangeCodeForTokens(code) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Get user info from Google
 * @returns {Promise<Object>} User info
 */
async function getUserInfo() {
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  return userInfo.data;
}

module.exports = {
  SCOPES,
  oauth2Client,
  getAuthUrl,
  exchangeCodeForTokens,
  getUserInfo
};
