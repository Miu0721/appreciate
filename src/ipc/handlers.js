/**
 * IPC handlers for Electron main process
 */

const { ipcMain } = require('electron');
const Store = require('electron-store');
const { oauth2Client, getAuthUrl, exchangeCodeForTokens, getUserInfo } = require('../config/google');
const { getEventByCode } = require('../services/event');
const { submitGratitude, getSummaryData } = require('../services/gratitude');
const { startCalendarPolling, stopCalendarPolling } = require('../services/calendar');
const {
  createOverlayWindow,
  createSummaryWindow,
  getOverlayWindow,
  closeOverlay,
  setOverlayIgnoreMouseEvents
} = require('../windows/manager');

const store = new Store({ encryptionKey: 'appreciate-secure-key-2024' });

/**
 * Register all IPC handlers
 */
function registerIpcHandlers() {
  // Get OAuth URL
  ipcMain.handle('get-auth-url', () => {
    return getAuthUrl();
  });

  // Exchange authorization code for tokens
  ipcMain.handle('exchange-code', async (event, code) => {
    try {
      const tokens = await exchangeCodeForTokens(code);
      oauth2Client.setCredentials(tokens);
      store.set('tokens', tokens);

      // Get user info
      const user = await getUserInfo();
      store.set('user', user);

      // Start calendar polling
      startCalendarPolling();

      return { success: true, user };
    } catch (error) {
      console.error('Token exchange error:', error);
      return { success: false, error: error.message };
    }
  });

  // Get stored user
  ipcMain.handle('get-stored-user', () => {
    return store.get('user');
  });

  // Logout
  ipcMain.handle('logout', () => {
    store.delete('tokens');
    store.delete('user');
    stopCalendarPolling();
    return { success: true };
  });

  // Submit gratitude
  ipcMain.handle('submit-gratitude', async (event, data) => {
    return await submitGratitude(data);
  });

  // Get event by code
  ipcMain.handle('get-event-by-code', async (event, eventCode) => {
    try {
      const eventData = await getEventByCode(eventCode);
      if (eventData) {
        return { success: true, event: eventData };
      }
      return { success: false, error: 'イベントが見つかりません' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Get summary data
  ipcMain.handle('get-summary-data', async (event, eventCode) => {
    return await getSummaryData(eventCode);
  });

  // Open summary window
  ipcMain.handle('open-summary', (event, eventCode) => {
    const summaryWindow = createSummaryWindow();
    if (summaryWindow) {
      summaryWindow.webContents.on('did-finish-load', () => {
        summaryWindow.webContents.send('load-summary', { eventCode });
      });
    }
  });

  // Close overlay
  ipcMain.handle('close-overlay', () => {
    closeOverlay();
  });

  // Set ignore mouse events for overlay
  ipcMain.handle('set-ignore-mouse-events', (event, ignore) => {
    setOverlayIgnoreMouseEvents(ignore);
  });
}

/**
 * Get electron store instance
 * @returns {Store}
 */
function getStore() {
  return store;
}

module.exports = {
  registerIpcHandlers,
  getStore
};
