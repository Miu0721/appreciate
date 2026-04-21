/**
 * Notification service
 * Handles Slack DM notifications
 */

const { slackClient, getSlackUserIdByEmail } = require('../config/slack');
const { WEB_APP_URL } = require('../config/constants');

/**
 * Send Slack DM to attendees
 * @param {Array<string>} attendeeEmails - List of attendee emails
 * @param {string} eventCode - Event code
 * @param {string} eventTitle - Event title
 * @param {string} deadlineStr - Formatted deadline string
 */
async function sendSlackDMToAttendees(attendeeEmails, eventCode, eventTitle, deadlineStr) {
  if (!slackClient) {
    console.log('Slack client not configured, skipping DM notifications');
    return;
  }

  for (const email of attendeeEmails) {
    try {
      const slackUserId = await getSlackUserIdByEmail(email, 'email');
      if (!slackUserId) continue;

      await slackClient.chat.postMessage({
        channel: slackUserId,
        text: `「${eventTitle}」が終了しました。感謝を送りましょう！`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📣 *「${eventTitle}」が終了しました*\n\n主催者に感謝を送りましょう！\n\n⏰ *締切: ${deadlineStr}*`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '🙏 感謝を送る',
                  emoji: true
                },
                style: 'primary',
                action_id: 'open_gratitude_modal',
                value: `${eventCode}|${eventTitle}`
              }
            ]
          }
        ]
      });

      console.log(`Slack DM sent to ${email}`);
    } catch (error) {
      console.error(`Failed to send Slack DM to ${email}:`, error.message);
    }
  }
}

/**
 * Send Slack DM to organizer with view link
 * @param {string} organizerEmail - Organizer's email
 * @param {string} eventCode - Event code
 * @param {string} eventTitle - Event title
 */
async function sendSlackDMToOrganizer(organizerEmail, eventCode, eventTitle) {
  if (!slackClient) {
    console.log('Slack client not configured, skipping organizer DM');
    return;
  }

  const viewUrl = `${WEB_APP_URL}/view.html?code=${eventCode}`;

  try {
    const slackUserId = await getSlackUserIdByEmail(organizerEmail, 'organizer email');
    if (!slackUserId) return;

    await slackClient.chat.postMessage({
      channel: slackUserId,
      text: `「${eventTitle}」の感謝が届きました！`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🎉 *「${eventTitle}」の感謝収集が完了しました！*\n\n参加者からの感謝が届いています。`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '✨ 感謝を見る',
                emoji: true
              },
              style: 'primary',
              url: viewUrl
            }
          ]
        }
      ]
    });

    console.log(`Slack DM sent to organizer: ${organizerEmail}`);
  } catch (error) {
    console.error(`Failed to send Slack DM to organizer ${organizerEmail}:`, error.message);
  }
}

module.exports = {
  sendSlackDMToAttendees,
  sendSlackDMToOrganizer
};
