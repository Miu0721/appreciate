/**
 * Slack client configuration
 */

require('dotenv').config();
const { WebClient } = require('@slack/web-api');

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

/**
 * Slack Web API client instance
 * Returns null if token is not configured
 */
const slackClient = SLACK_BOT_TOKEN ? new WebClient(SLACK_BOT_TOKEN) : null;

/**
 * Look up Slack user ID by email
 * @param {string} email - User email address
 * @param {string} label - Label for logging
 * @returns {Promise<string|null>} Slack user ID or null
 */
async function getSlackUserIdByEmail(email, label) {
  if (!slackClient) {
    return null;
  }

  try {
    const userResult = await slackClient.users.lookupByEmail({ email });
    if (!userResult.ok || !userResult.user) {
      console.log(`Slack user not found for ${label}: ${email}`);
      return null;
    }
    return userResult.user.id;
  } catch (error) {
    console.error(`Failed to lookup Slack user ${email}:`, error.message);
    return null;
  }
}

module.exports = {
  slackClient,
  SLACK_SIGNING_SECRET,
  getSlackUserIdByEmail
};
