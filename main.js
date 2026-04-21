/**
 * Appreciate - Event Gratitude Collection System
 * Electron Main Process Entry Point
 */

require('dotenv').config();
const { app, BrowserWindow } = require('electron');
const Store = require('electron-store');

// Import modules
const { oauth2Client } = require('./src/config/google');
const { createMainWindow, createOverlayWindow, getOverlayWindow } = require('./src/windows/manager');
const { createTray, setOverlayFunction: setTrayOverlayFunction } = require('./src/windows/tray');
const { registerIpcHandlers, getStore } = require('./src/ipc/handlers');
const { startCalendarPolling, stopCalendarPolling, setOverlayFunction: setCalendarOverlayFunction } = require('./src/services/calendar');
const { getPendingDeliveries, updateEventDoc } = require('./src/services/event');
const { sendSlackDMToOrganizer } = require('./src/services/notification');

const store = new Store({ encryptionKey: 'appreciate-secure-key-2024' });

/**
 * Show gratitude overlay and mark as shown
 * @param {string} eventCode - Event code
 * @param {string} eventTitle - Event title
 */
async function showGratitudeOverlay(eventCode, eventTitle) {
  const overlayWindow = createOverlayWindow();

  if (overlayWindow) {
    overlayWindow.webContents.on('did-finish-load', async () => {
      overlayWindow.webContents.send('show-gratitudes', { eventCode, eventTitle });

      // Mark overlay as shown
      await updateEventDoc(eventCode, { overlayShown: true });
    });
  }
}

/**
 * Deliver gratitudes to organizer
 * @param {string} eventCode - Event code
 * @param {string} eventTitle - Event title
 * @param {string} organizerEmail - Organizer email
 */
async function deliverGratitudes(eventCode, eventTitle, organizerEmail) {
  console.log(`Delivering gratitudes for: ${eventTitle}`);

  // Show overlay with gratitudes
  await showGratitudeOverlay(eventCode, eventTitle);

  // Send Slack DM to organizer
  if (organizerEmail) {
    await sendSlackDMToOrganizer(organizerEmail, eventCode, eventTitle);
  }

  // Mark as delivered
  await updateEventDoc(eventCode, { delivered: true });
}

/**
 * Check for pending deliveries on app startup
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

    for (let i = 0; i < pendingEvents.length; i++) {
      const event = pendingEvents[i];

      // Add delay between deliveries if multiple
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      await deliverGratitudes(event.id, event.title, event.organizerEmail);
    }
  } catch (error) {
    console.error('Error checking pending overlays:', error);
  }
}

// Set overlay function for tray and calendar
setTrayOverlayFunction(showGratitudeOverlay);
setCalendarOverlayFunction(showGratitudeOverlay);

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
