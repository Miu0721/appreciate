/**
 * Calendar service
 * Handles Google Calendar polling and event processing
 */

const { google } = require('googleapis');
const Store = require('electron-store');
const { oauth2Client } = require('../config/google');
const { POLLING_INTERVAL, APPRECIATE_KEYWORDS } = require('../config/constants');
const {
  generateEventCode,
  isEventTracked,
  trackEvent,
  saveEvent,
  getTrackedEventByCode,
  calculateDeadlineAndDeliveryTime,
  formatDeadline,
  updateEventDoc,
  Timestamp,
  serverTimestamp
} = require('./event');
const { sendSlackDMToAttendees } = require('./notification');

const store = new Store({ encryptionKey: 'appreciate-secure-key-2024' });

let pollingTimer = null;

// Reference to delivery function (set from main process)
let deliveryFn = null;

/**
 * Set the delivery function (handles queue, overlay, Slack DM, and marking delivered)
 * @param {Function} fn - Function to deliver gratitudes (eventCode, eventTitle, organizerEmail)
 */
function setDeliveryFunction(fn) {
  deliveryFn = fn;
}

/**
 * Start calendar polling
 */
async function startCalendarPolling() {
  const tokens = store.get('tokens');
  if (!tokens) {
    console.log('No tokens found, skipping calendar polling');
    return;
  }

  oauth2Client.setCredentials(tokens);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const pollCalendar = async () => {
    try {
      const now = new Date();
      const timeMin = now.toISOString();
      const timeMax = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime'
      });

      const events = response.data.items || [];
      console.log(`[Calendar] Found ${events.length} events`);

      for (const event of events) {
        const title = event.summary || '';
        const description = event.description || '';
        console.log(`[Calendar] Checking event: "${title}"`);

        // Check for title containing keywords or tags in description
        const titleMatch = APPRECIATE_KEYWORDS.title.some(keyword => title.includes(keyword));
        const descMatch = APPRECIATE_KEYWORDS.description.some(tag => description.includes(tag));

        if (titleMatch || descMatch) {
          console.log(`[Calendar] Matched! Processing: "${title}"`);
          await processAppreciateEvent(event);
        }
      }
    } catch (error) {
      console.error('Calendar polling error:', error);
    }
  };

  // Initial poll
  await pollCalendar();

  // Set up interval
  pollingTimer = setInterval(pollCalendar, POLLING_INTERVAL);
}

/**
 * Stop calendar polling
 */
function stopCalendarPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

/**
 * Process appreciate-tagged event
 * @param {Object} event - Google Calendar event
 */
async function processAppreciateEvent(event) {
  const eventId = event.id;

  // Skip if already tracked
  if (isEventTracked(eventId)) {
    return;
  }

  const endTime = new Date(event.end.dateTime || event.end.date);
  const now = new Date();

  // Register event in Firestore
  const eventCode = generateEventCode();
  const eventData = {
    googleEventId: eventId,
    title: event.summary || '',
    description: event.description || '',
    startTime: Timestamp.fromDate(new Date(event.start.dateTime || event.start.date)),
    endTime: Timestamp.fromDate(endTime),
    eventCode,
    organizerEmail: event.organizer?.email || '',
    attendees: (event.attendees || []).map(a => a.email),
    status: 'pending',
    overlayShown: false,
    createdAt: serverTimestamp()
  };

  const saved = await saveEvent(eventData);
  if (!saved) return;

  trackEvent(eventId, { eventCode, endTime, data: eventData });

  // Schedule end-of-event notification
  const timeUntilEnd = endTime.getTime() - now.getTime();
  if (timeUntilEnd > 0) {
    setTimeout(() => {
      triggerEventEnd(eventCode, event.summary);
    }, timeUntilEnd);
  } else if (timeUntilEnd > -10 * 60 * 1000) {
    // Event ended within last 10 minutes, trigger immediately
    triggerEventEnd(eventCode, event.summary);
  }
}

/**
 * Trigger event end flow
 * @param {string} eventCode - Event code
 * @param {string} eventTitle - Event title
 */
async function triggerEventEnd(eventCode, eventTitle) {
  const trackedEvent = getTrackedEventByCode(eventCode);
  if (!trackedEvent) {
    console.error('Tracked event not found:', eventCode);
    return;
  }

  const { deadline, deliveryTime } = calculateDeadlineAndDeliveryTime(trackedEvent.endTime);
  const now = new Date();

  // Update event status with deadline info
  await updateEventDoc(eventCode, {
    status: 'collecting',
    deadline: Timestamp.fromDate(deadline),
    deliveryTime: Timestamp.fromDate(deliveryTime)
  });

  // Get attendees and send Slack DM with deadline
  if (trackedEvent.data.attendees) {
    const attendeeEmails = trackedEvent.data.attendees;
    const deadlineStr = formatDeadline(deadline);
    sendSlackDMToAttendees(attendeeEmails, eventCode, eventTitle, deadlineStr);
  }

  // Schedule collection end
  const timeUntilDeadline = deadline.getTime() - now.getTime();
  if (timeUntilDeadline > 0) {
    console.log(`Scheduling collection end in ${Math.round(timeUntilDeadline / 1000 / 60)} minutes`);
    setTimeout(async () => {
      await endGratitudeCollection(eventCode, eventTitle);
    }, timeUntilDeadline);
  }

  // Schedule delivery
  const timeUntilDelivery = deliveryTime.getTime() - now.getTime();
  if (timeUntilDelivery > 0) {
    console.log(`Scheduling delivery in ${Math.round(timeUntilDelivery / 1000 / 60)} minutes`);
    setTimeout(async () => {
      await deliverGratitudes(eventCode, eventTitle);
    }, timeUntilDelivery);
  }
}

/**
 * End gratitude collection
 * @param {string} eventCode - Event code
 * @param {string} eventTitle - Event title
 */
async function endGratitudeCollection(eventCode, eventTitle) {
  console.log(`Ending gratitude collection for: ${eventTitle}`);
  await updateEventDoc(eventCode, { status: 'completed' });
}

/**
 * Deliver gratitudes to organizer (queues the delivery)
 * @param {string} eventCode - Event code
 * @param {string} eventTitle - Event title
 */
function deliverGratitudes(eventCode, eventTitle) {
  console.log(`Scheduling delivery for: ${eventTitle}`);

  const trackedEvent = getTrackedEventByCode(eventCode);
  const organizerEmail = trackedEvent?.data?.organizerEmail || null;

  // Use the delivery function (handles queue, overlay, Slack DM, and marking delivered)
  if (deliveryFn) {
    deliveryFn(eventCode, eventTitle, organizerEmail);
  }
}

module.exports = {
  startCalendarPolling,
  stopCalendarPolling,
  setDeliveryFunction,
  deliverGratitudes
};
