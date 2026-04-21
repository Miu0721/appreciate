/**
 * Window management module
 * Handles creation and management of Electron windows
 */

const { BrowserWindow, screen } = require('electron');
const path = require('path');

// Window references
let mainWindow = null;
let overlayWindow = null;
let summaryWindow = null;

/**
 * Get secure web preferences for windows
 * @returns {Object} WebPreferences object
 */
function getSecureWebPreferences() {
  return {
    preload: path.join(__dirname, '..', '..', 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false
  };
}

/**
 * Create main window (login)
 * @returns {BrowserWindow} Main window instance
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 500,
    resizable: false,
    webPreferences: getSecureWebPreferences(),
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e'
  });

  mainWindow.loadFile(path.join(__dirname, 'login.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * Create overlay window for gratitude display
 * @returns {BrowserWindow} Overlay window instance
 */
function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: width,
    height: height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: getSecureWebPreferences()
  });

  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

/**
 * Create summary window
 * @returns {BrowserWindow} Summary window instance
 */
function createSummaryWindow() {
  summaryWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: getSecureWebPreferences(),
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e'
  });

  summaryWindow.loadFile(path.join(__dirname, 'summary.html'));

  summaryWindow.on('closed', () => {
    summaryWindow = null;
  });

  return summaryWindow;
}

/**
 * Get main window instance
 * @returns {BrowserWindow|null}
 */
function getMainWindow() {
  return mainWindow;
}

/**
 * Get overlay window instance
 * @returns {BrowserWindow|null}
 */
function getOverlayWindow() {
  return overlayWindow;
}

/**
 * Get summary window instance
 * @returns {BrowserWindow|null}
 */
function getSummaryWindow() {
  return summaryWindow;
}

/**
 * Show main window (create if not exists)
 */
function showMainWindow() {
  if (!mainWindow) {
    createMainWindow();
  }
  mainWindow.show();
}

/**
 * Close overlay window
 */
function closeOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
}

/**
 * Set overlay ignore mouse events
 * @param {boolean} ignore - Whether to ignore mouse events
 */
function setOverlayIgnoreMouseEvents(ignore) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(ignore);
  }
}

module.exports = {
  createMainWindow,
  createOverlayWindow,
  createSummaryWindow,
  getMainWindow,
  getOverlayWindow,
  getSummaryWindow,
  showMainWindow,
  closeOverlay,
  setOverlayIgnoreMouseEvents
};
