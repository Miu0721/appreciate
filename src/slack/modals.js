/**
 * Slack modal builders
 */

const { EMOJI_LIST } = require('../config/constants');

/**
 * Build closed modal (event ended)
 * @param {string} eventTitle - Event title
 * @returns {Object} Modal view
 */
function buildClosedModal(eventTitle) {
  return {
    type: 'modal',
    title: {
      type: 'plain_text',
      text: '受付終了'
    },
    close: {
      type: 'plain_text',
      text: '閉じる'
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${eventTitle}*`
        }
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '⏰ *感謝の受付は終了しました*\n\nこのイベントの感謝受付期間は終了しています。\nまたの機会にご利用ください！'
        }
      }
    ]
  };
}

/**
 * Build gratitude modal with tap-to-add emojis
 * @param {string} eventCode - Event code
 * @param {string} eventTitle - Event title
 * @param {Array<string>} emojis - Selected emojis
 * @returns {Object} Modal view
 */
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

/**
 * Build success modal after submission
 * @param {Array<string>} emojis - Submitted emojis
 * @param {string} message - Submitted message
 * @returns {Object} Modal view
 */
function buildSuccessModal(emojis, message) {
  return {
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
  };
}

module.exports = {
  buildClosedModal,
  buildGratitudeModal,
  buildSuccessModal
};
