/**
 * Event management service
 * Handles event tracking, code generation, and deadline calculation
 */

const { doc, setDoc, getDoc, getDocs, query, where, collection, serverTimestamp, Timestamp } = require('firebase/firestore');
const { getDb } = require('../config/firebase');
const { EVENT_CODE_CHARS, EVENT_CODE_MIN_LENGTH, EVENT_CODE_MAX_LENGTH } = require('../config/constants');

// TEST MODE: Set to true to deliver gratitudes 4 minutes after event end
const TEST_MODE = false;
const TEST_DELIVERY_MINUTES = 4;

// Tracked events in memory
const trackedEvents = new Map();

/**
 * Generate event code (6-8 alphanumeric characters)
 * @returns {string} Event code
 */
function generateEventCode() {
  const length = Math.floor(Math.random() * (EVENT_CODE_MAX_LENGTH - EVENT_CODE_MIN_LENGTH + 1)) + EVENT_CODE_MIN_LENGTH;
  let code = '';
  for (let i = 0; i < length; i++) {
    code += EVENT_CODE_CHARS.charAt(Math.floor(Math.random() * EVENT_CODE_CHARS.length));
  }
  return code;
}

/**
 * Get tracked event by event code
 * @param {string} eventCode - Event code
 * @returns {Object|undefined} Tracked event data
 */
function getTrackedEventByCode(eventCode) {
  return Array.from(trackedEvents.values()).find(event => event.eventCode === eventCode);
}

/**
 * Check if event is already tracked
 * @param {string} googleEventId - Google calendar event ID
 * @returns {boolean}
 */
function isEventTracked(googleEventId) {
  return trackedEvents.has(googleEventId);
}

/**
 * Track a new event
 * @param {string} googleEventId - Google calendar event ID
 * @param {Object} eventData - Event data
 */
function trackEvent(googleEventId, eventData) {
  trackedEvents.set(googleEventId, eventData);
}

/**
 * Update event document in Firestore
 * @param {string} eventCode - Event code
 * @param {Object} updates - Fields to update
 * @returns {Promise<boolean>} Success status
 */
async function updateEventDoc(eventCode, updates) {
  try {
    const db = getDb();
    const eventRef = doc(db, 'events', eventCode);
    await setDoc(eventRef, updates, { merge: true });
    return true;
  } catch (error) {
    console.error(`Error updating event ${eventCode}:`, error);
    return false;
  }
}

/**
 * Save event to Firestore
 * @param {Object} eventData - Event data to save
 * @returns {Promise<boolean>} Success status
 */
async function saveEvent(eventData) {
  try {
    const db = getDb();
    await setDoc(doc(db, 'events', eventData.eventCode), eventData);
    return true;
  } catch (error) {
    console.error('Error saving event to Firestore:', error);
    return false;
  }
}

/**
 * Get event by code
 * @param {string} eventCode - Event code
 * @returns {Promise<Object|null>} Event data or null
 */
async function getEventByCode(eventCode) {
  try {
    const db = getDb();
    const eventDoc = await getDoc(doc(db, 'events', eventCode));
    if (eventDoc.exists()) {
      return eventDoc.data();
    }
    return null;
  } catch (error) {
    console.error('Error getting event:', error);
    return null;
  }
}

/**
 * Calculate deadline (next day 9:59) and delivery time (next day 10:00)
 * In TEST_MODE: deadline is 3 minutes after event end, delivery is 4 minutes after
 * @param {Date} eventEndTime - Event end time
 * @returns {Object} { deadline, deliveryTime }
 */
function calculateDeadlineAndDeliveryTime(eventEndTime) {
  const endDate = new Date(eventEndTime);

  // TEST MODE: Deliver 4 minutes after event end
  if (TEST_MODE) {
    const deadline = new Date(endDate.getTime() + (TEST_DELIVERY_MINUTES - 1) * 60 * 1000);
    const deliveryTime = new Date(endDate.getTime() + TEST_DELIVERY_MINUTES * 60 * 1000);
    console.log(`[TEST MODE] Deadline: ${deadline.toLocaleTimeString()}, Delivery: ${deliveryTime.toLocaleTimeString()}`);
    return { deadline, deliveryTime };
  }

  // PRODUCTION: Next day 9:59:59
  const deadline = new Date(endDate);
  deadline.setDate(deadline.getDate() + 1);
  deadline.setHours(9, 59, 59, 999);

  // PRODUCTION: Next day 10:00:00
  const deliveryTime = new Date(endDate);
  deliveryTime.setDate(deliveryTime.getDate() + 1);
  deliveryTime.setHours(10, 0, 0, 0);

  return { deadline, deliveryTime };
}

/**
 * Format deadline for display
 * @param {Date} deadline - Deadline date
 * @returns {string} Formatted string
 */
function formatDeadline(deadline) {
  const month = deadline.getMonth() + 1;
  const day = deadline.getDate();
  const hours = deadline.getHours();
  const minutes = String(deadline.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

/**
 * Get pending events for delivery
 * @param {string} userEmail - User email
 * @returns {Promise<Array>} Pending events
 */
async function getPendingDeliveries(userEmail) {
  try {
    const db = getDb();
    const now = new Date();

    const eventsQuery = query(
      collection(db, 'events'),
      where('organizerEmail', '==', userEmail),
      where('status', '==', 'completed')
    );

    const snapshot = await getDocs(eventsQuery);

    if (snapshot.empty) {
      return [];
    }

    // Filter events where delivery time has passed but not yet delivered
    return snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(event => {
        // Skip if already delivered or overlay shown
        if (event.delivered || event.overlayShown) return false;

        // Check if delivery time has passed
        const deliveryTime = event.deliveryTime?.toDate?.();
        if (!deliveryTime) {
          // Legacy events without deliveryTime - skip
          return false;
        }
        return now >= deliveryTime;
      });
  } catch (error) {
    console.error('Error getting pending deliveries:', error);
    return [];
  }
}

module.exports = {
  trackedEvents,
  generateEventCode,
  getTrackedEventByCode,
  isEventTracked,
  trackEvent,
  updateEventDoc,
  saveEvent,
  getEventByCode,
  calculateDeadlineAndDeliveryTime,
  formatDeadline,
  getPendingDeliveries,
  Timestamp,
  serverTimestamp
};
