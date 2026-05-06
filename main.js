/**
 * Appreciate - Event Gratitude Collection System
 * Electron Main Process Entry Point
 */

require('dotenv').config();
const { app, BrowserWindow, Notification } = require('electron');
const Store = require('electron-store');

// Import modules
const { oauth2Client } = require('./src/config/google');
const { createMainWindow, createOverlayWindow, getOverlayWindow } = require('./src/windows/manager');
const { createTray, setOverlayFunction: setTrayOverlayFunction, setDeliveryFunction: setTrayDeliveryFunction } = require('./src/windows/tray');
const { registerIpcHandlers, getStore } = require('./src/ipc/handlers');
const { startCalendarPolling, stopCalendarPolling, setDeliveryFunction: setCalendarDeliveryFunction } = require('./src/services/calendar');
const { getPendingDeliveries, updateEventDoc } = require('./src/services/event');
const { sendSlackDMToOrganizer } = require('./src/services/notification');

const store = new Store({ encryptionKey: 'appreciate-secure-key-2024' });

// Delivery queue to prevent overlapping overlays
const deliveryQueue = [];
let isDelivering = false;

/**
 * Show gratitude overlay and mark as shown
 * Returns a promise that resolves when the overlay is closed
 * @param {string} eventCode - Event code
 * @param {string} eventTitle - Event title
 * @returns {Promise<void>}
 */
function showGratitudeOverlay(eventCode, eventTitle) {
  return new Promise((resolve) => {
    const overlayWindow = createOverlayWindow();

    if (overlayWindow) {
      overlayWindow.webContents.on('did-finish-load', async () => {
        overlayWindow.webContents.send('show-gratitudes', { eventCode, eventTitle });

        // Mark overlay as shown
        await updateEventDoc(eventCode, { overlayShown: true });
      });

      // Resolve when overlay is closed
      overlayWindow.on('closed', () => {
        console.log(`Overlay closed for: ${eventTitle}`);
        resolve();
      });
    } else {
      resolve();
    }
  });
}

/**
 * Add event to delivery queue and process
 * @param {string} eventCode - Event code
 * @param {string} eventTitle - Event title
 * @param {string} organizerEmail - Organizer email
 */
function queueDelivery(eventCode, eventTitle, organizerEmail) {
  deliveryQueue.push({ eventCode, eventTitle, organizerEmail });
  console.log(`Queued delivery for: ${eventTitle} (queue size: ${deliveryQueue.length})`);
  processDeliveryQueue();
}

/**
 * Process delivery queue one by one
 */
async function processDeliveryQueue() {
  if (isDelivering || deliveryQueue.length === 0) {
    return;
  }

  isDelivering = true;
  const { eventCode, eventTitle, organizerEmail } = deliveryQueue.shift();

  console.log(`Processing delivery for: ${eventTitle}`);

  // Show overlay and wait for it to close
  await showGratitudeOverlay(eventCode, eventTitle);

  // Send Slack DM to organizer
  if (organizerEmail) {
    await sendSlackDMToOrganizer(organizerEmail, eventCode, eventTitle);
  }

  // Mark as delivered
  await updateEventDoc(eventCode, { delivered: true });

  isDelivering = false;

  // Process next in queue
  processDeliveryQueue();
}

/**
 * Deliver gratitudes to organizer (adds to queue)
 * @param {string} eventCode - Event code
 * @param {string} eventTitle - Event title
 * @param {string} organizerEmail - Organizer email
 */
function deliverGratitudes(eventCode, eventTitle, organizerEmail) {
  queueDelivery(eventCode, eventTitle, organizerEmail);
}

/**
 * Check for pending deliveries on app startup
 * Shows a notification 3 minutes after startup, then delivers 3 minutes later
 */
async function checkPendingOverlays() {
  try {
    const user = store.get('user');
    if (!user || !user.email) {
      console.log('No user logged in, skipping pending delivery check');
      return;
    }

    const pendingEvents = await getPendingDeliveries(user.email);

    if (pendingEvents.length === 0) {
      console.log('No pending deliveries');
      return;
    }

    console.log(`Found ${pendingEvents.length} pending delivery(s)`);

    const THREE_MINUTES = 3 * 60 * 1000;

    // Show notification after 3 minutes
    setTimeout(() => {
      console.log('Showing gratitude notification...');

      const eventTitles = pendingEvents.map(e => e.title).join('、');
      new Notification({
        title: '感謝が届いています',
        body: `「${eventTitles}」の感謝が3分後に届きます`
      }).show();

      // Deliver gratitudes after another 3 minutes
      setTimeout(() => {
        console.log('Delivering gratitudes...');

        // Queue all events - they will be delivered one by one
        for (const event of pendingEvents) {
          console.log('Delivering event:', event.id, event.title, 'eventCode:', event.eventCode || event.id);
          deliverGratitudes(event.eventCode || event.id, event.title, event.organizerEmail);
        }
      }, THREE_MINUTES);
    }, THREE_MINUTES);
  } catch (error) {
    console.error('Error checking pending overlays:', error);
  }
}

// Set overlay function for tray
setTrayOverlayFunction(showGratitudeOverlay);

// Set delivery function for tray (for testing with Slack DM)
setTrayDeliveryFunction(deliverGratitudes, () => store);

// Set delivery function for calendar (uses queue system)
setCalendarDeliveryFunction(deliverGratitudes);

// App lifecycle
app.whenReady().then(async () => {
  // Register IPC handlers
  registerIpcHandlers();

  // Create main window and tray
  createMainWindow();
  createTray();

  // Check for stored tokens and start polling
  const tokens = store.get('tokens');
  if (tokens) {
    oauth2Client.setCredentials(tokens);
    startCalendarPolling();

    // Check for pending overlays (events that ended while app was offline)
    setTimeout(() => {
      checkPendingOverlays();
    }, 3000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep app running in background on macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopCalendarPolling();
});

// Local server for OAuth callback and Slack interactions
const server = require('./server');
