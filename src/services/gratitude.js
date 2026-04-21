/**
 * Gratitude service
 * Handles gratitude data CRUD operations
 */

const { doc, setDoc, getDoc, getDocs, query, where, collection, serverTimestamp } = require('firebase/firestore');
const { getDb } = require('../config/firebase');

/**
 * Generate gratitude ID
 * @param {string} eventCode - Event code
 * @returns {string} Gratitude ID
 */
function generateGratitudeId(eventCode) {
  return `${eventCode}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Submit gratitude from Electron app
 * @param {Object} data - { eventCode, emojis, message }
 * @returns {Promise<Object>} Result
 */
async function submitGratitude(data) {
  const { eventCode, emojis, message } = data;

  try {
    const db = getDb();
    const gratitudeId = generateGratitudeId(eventCode);
    await setDoc(doc(db, 'gratitudes', gratitudeId), {
      eventCode,
      emojis,
      message: message || '',
      createdAt: serverTimestamp()
    });

    return { success: true };
  } catch (error) {
    console.error('Error submitting gratitude:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Submit gratitude from Slack
 * @param {Object} data - Gratitude data including Slack user info
 * @returns {Promise<Object>} Result
 */
async function submitGratitudeFromSlack(data) {
  const { eventCode, emojis, emojiCounts, message, slackUserId, slackUserName } = data;

  try {
    const db = getDb();
    const gratitudeId = generateGratitudeId(eventCode);
    await setDoc(doc(db, 'gratitudes', gratitudeId), {
      eventCode,
      emojis,
      emojiCounts,
      message,
      slackUserId,
      slackUserName,
      createdAt: serverTimestamp()
    });

    console.log('Gratitude saved:', gratitudeId, `(${emojis.length}個の絵文字)`);
    return { success: true, gratitudeId };
  } catch (error) {
    console.error('Error submitting gratitude from Slack:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get gratitudes for an event
 * @param {string} eventCode - Event code
 * @returns {Promise<Array>} Gratitudes
 */
async function getGratitudesForEvent(eventCode) {
  try {
    const db = getDb();
    const gratitudesQuery = query(
      collection(db, 'gratitudes'),
      where('eventCode', '==', eventCode)
    );
    const snapshot = await getDocs(gratitudesQuery);

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        emojis: data.emojis || [],
        message: data.message || ''
      };
    });
  } catch (error) {
    console.error('Error getting gratitudes:', error);
    return [];
  }
}

/**
 * Get summary data for an event
 * @param {string} eventCode - Event code
 * @returns {Promise<Object>} Summary data
 */
async function getSummaryData(eventCode) {
  try {
    const db = getDb();

    // Get event info
    const eventDoc = await getDoc(doc(db, 'events', eventCode));
    if (!eventDoc.exists()) {
      return { success: false, error: 'イベントが見つかりません' };
    }
    const eventData = eventDoc.data();

    // Get gratitudes
    const gratitudes = await getGratitudesForEvent(eventCode);

    return {
      success: true,
      data: {
        eventTitle: eventData.title || '',
        gratitudes
      }
    };
  } catch (error) {
    console.error('Error getting summary data:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  generateGratitudeId,
  submitGratitude,
  submitGratitudeFromSlack,
  getGratitudesForEvent,
  getSummaryData
};
