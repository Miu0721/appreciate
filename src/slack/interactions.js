/**
 * Slack interaction handlers
 */

const express = require('express');
const { slackClient } = require('../config/slack');
const { getEventByCode } = require('../services/event');
const { submitGratitudeFromSlack } = require('../services/gratitude');
const { buildClosedModal, buildGratitudeModal, buildSuccessModal } = require('./modals');

// Server-side state management (Race Condition prevention)
const userEmojiState = new Map();

function getStateKey(userId, eventCode) {
  return `${userId}_${eventCode}`;
}

/**
 * Create Slack interactions router
 * @returns {express.Router} Express router
 */
function createInteractionsRouter() {
  const router = express.Router();

  router.post('/', express.urlencoded({ extended: true }), async (req, res) => {
    try {
      const payload = JSON.parse(req.body.payload);

      // Handle button click
      if (payload.type === 'block_actions') {
        const action = payload.actions[0];

        // Open gratitude modal from DM
        if (action.action_id === 'open_gratitude_modal') {
          const [eventCode, eventTitle] = action.value.split('|');

          // Check if event is still accepting gratitudes
          const eventData = await getEventByCode(eventCode);
          if (eventData && eventData.status === 'completed') {
            await slackClient.views.open({
              trigger_id: payload.trigger_id,
              view: buildClosedModal(eventTitle)
            });
            return res.status(200).send();
          }

          const key = getStateKey(payload.user.id, eventCode);
          userEmojiState.set(key, []); // Initialize

          await slackClient.views.open({
            trigger_id: payload.trigger_id,
            view: buildGratitudeModal(eventCode, eventTitle, [])
          });

          return res.status(200).send();
        }

        // Emoji button clicked - add emoji
        if (action.action_id.startsWith('emoji_')) {
          const emoji = action.value;
          const metadata = JSON.parse(payload.view.private_metadata);
          const key = getStateKey(payload.user.id, metadata.eventCode);

          // Server-side state management (Race Condition prevention)
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

        // Check if event is still accepting gratitudes
        const eventData = await getEventByCode(metadata.eventCode);
        if (eventData && eventData.status === 'completed') {
          userEmojiState.delete(key);
          return res.json({
            response_action: 'update',
            view: buildClosedModal(metadata.eventTitle)
          });
        }

        // Get emojis from server-side state
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

        // Calculate emoji counts
        const emojiCounts = emojis.reduce((acc, e) => {
          acc[e] = (acc[e] || 0) + 1;
          return acc;
        }, {});

        // Save to Firestore
        await submitGratitudeFromSlack({
          eventCode: metadata.eventCode,
          emojis,
          emojiCounts,
          message,
          slackUserId: payload.user.id,
          slackUserName: payload.user.name
        });

        // Clear state
        userEmojiState.delete(key);

        // Close modal with success message
        return res.json({
          response_action: 'update',
          view: buildSuccessModal(emojis, message)
        });
      }

      res.status(200).send();
    } catch (error) {
      console.error('Slack interaction error:', error);
      res.status(500).send('Internal error');
    }
  });

  return router;
}

module.exports = {
  createInteractionsRouter,
  userEmojiState
};
