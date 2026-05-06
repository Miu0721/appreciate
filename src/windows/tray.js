/**
 * System tray management
 */

const { Tray, Menu, nativeImage } = require('electron');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { showMainWindow } = require('./manager');
const { TRAY_ICON_FALLBACK } = require('../config/constants');

let tray = null;

// Reference to overlay function (set from main process)
let showGratitudeOverlayFn = null;

// Reference to delivery function (set from main process)
let deliverGratitudesFn = null;

// Reference to store for getting user email
let storeFn = null;

/**
 * Set the overlay display function for test
 * @param {Function} fn - Function to show gratitude overlay
 */
function setOverlayFunction(fn) {
  showGratitudeOverlayFn = fn;
}

/**
 * Set the delivery function for test (includes Slack DM to organizer)
 * @param {Function} fn - Function to deliver gratitudes
 * @param {Function} getStore - Function to get electron store
 */
function setDeliveryFunction(fn, getStore) {
  deliverGratitudesFn = fn;
  storeFn = getStore;
}

/**
 * Create system tray
 * @returns {Tray} Tray instance
 */
function createTray() {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
  let trayIcon;

  try {
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
    } else {
      trayIcon = nativeImage.createFromDataURL(TRAY_ICON_FALLBACK);
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
    }
  } catch (e) {
    trayIcon = nativeImage.createFromDataURL(TRAY_ICON_FALLBACK);
  }

  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Appreciate',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'ダッシュボードを開く',
      click: () => {
        showMainWindow();
      }
    },
    { type: 'separator' },
    {
      label: '🧪 オーバーレイテスト (TEST001)',
      click: () => {
        if (showGratitudeOverlayFn) {
          showGratitudeOverlayFn('TEST001', 'テストイベント');
        }
      }
    },
    {
      label: '📬 主催者配信テスト (Slack DM込み)',
      click: () => {
        if (deliverGratitudesFn && storeFn) {
          const store = storeFn();
          const user = store.get('user');
          const organizerEmail = user?.email || '';
          console.log(`Test delivery to organizer: ${organizerEmail}`);
          deliverGratitudesFn('TEST001', 'テストイベント', organizerEmail);
        }
      }
    },
    { type: 'separator' },
    {
      label: '終了',
      click: () => app.quit()
    }
  ]);

  tray.setToolTip('Appreciate - イベント感謝収集システム');
  tray.setContextMenu(contextMenu);

  return tray;
}

/**
 * Get tray instance
 * @returns {Tray|null}
 */
function getTray() {
  return tray;
}

module.exports = {
  createTray,
  getTray,
  setOverlayFunction,
  setDeliveryFunction
};
