require('dotenv').config();
const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { google } = require('googleapis');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, onSnapshot, serverTimestamp, Timestamp } = require('firebase/firestore');
const { WebClient } = require('@slack/web-api');

// Electron Store for local settings
const store = new Store({
  encryptionKey: 'appreciate-secure-key-2024'
});

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain: 'appreciate-54692.firebaseapp.com',
  projectId: 'appreciate-54692',
  storageBucket: 'appreciate-54692.appspot.com',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || 'YOUR_SENDER_ID',
  appId: process.env.FIREBASE_APP_ID || 'YOUR_APP_ID'
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Google OAuth2 configuration
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID',
  process.env.GOOGLE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET',
  'http://localhost:3000/oauth/callback'
);

// Slack client
const slackClient = process.env.SLACK_BOT_TOKEN
  ? new WebClient(process.env.SLACK_BOT_TOKEN)
  : null;

// Window references
let mainWindow = null;
let overlayWindow = null;
let summaryWindow = null;
let participantWindow = null;
let notificationBannerWindow = null;
let tray = null;

// Calendar polling interval (1 minute)
const POLLING_INTERVAL = 60 * 1000;
let pollingTimer = null;

// Tracked events
const trackedEvents = new Map();

// Generate event code (6-8 alphanumeric characters)
function generateEventCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = Math.floor(Math.random() * 3) + 6; // 6-8 characters
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create main window (login)
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 500,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e'
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'windows', 'login.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create overlay window for gratitude display
function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: width,
    height: height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.loadFile(path.join(__dirname, 'src', 'windows', 'overlay.html'));
  overlayWindow.setIgnoreMouseEvents(false);

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

// Create summary window
function createSummaryWindow() {
  summaryWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e'
  });

  summaryWindow.loadFile(path.join(__dirname, 'src', 'windows', 'summary.html'));

  summaryWindow.on('closed', () => {
    summaryWindow = null;
  });
}

// Create participant window for gratitude input
function createParticipantWindow(eventId, eventTitle) {
  participantWindow = new BrowserWindow({
    width: 500,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e'
  });

  participantWindow.loadFile(path.join(__dirname, 'src', 'windows', 'participant.html'));

  participantWindow.webContents.on('did-finish-load', () => {
    participantWindow.webContents.send('event-info', { eventId, eventTitle });
  });

  participantWindow.on('closed', () => {
    participantWindow = null;
  });
}

// Create notification banner window
function createNotificationBannerWindow(eventTitle, eventId) {
  const { width } = screen.getPrimaryDisplay().workAreaSize;

  notificationBannerWindow = new BrowserWindow({
    width: 400,
    height: 120,
    x: width - 420,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  notificationBannerWindow.loadFile(path.join(__dirname, 'src', 'windows', 'notification-banner.html'));

  notificationBannerWindow.webContents.on('did-finish-load', () => {
    notificationBannerWindow.webContents.send('notification-data', { eventTitle, eventId });
  });

  // Auto-close after 10 seconds if not interacted
  setTimeout(() => {
    if (notificationBannerWindow && !notificationBannerWindow.isDestroyed()) {
      notificationBannerWindow.close();
    }
  }, 10000);

  notificationBannerWindow.on('closed', () => {
    notificationBannerWindow = null;
  });
}

// Create system tray
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  let trayIcon;

  try {
    const fs = require('fs');
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
    } else {
      // Create a simple 16x16 icon programmatically (pink circle)
      trayIcon = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA' +
        'gElEQVQ4T2NkoBAwUqifYdQAhtEwYBgeBv9RYoARl5ewGfAfQ+P/DAwM/0E0I7oBjP8Z' +
        'GP7jMgSbZkZGBgZGRgYGRmyasamBuQKrAbgMwWYIIw5XEDQAZgg2Q4hyBS5DiHYFLkOI' +
        'dgU+Q0hyBTZDSHYFpgEku4IYQ0hOC4QMAQC4HTARCwGnQgAAAABJRU5ErkJggg=='
      );
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
    }
  } catch (e) {
    // Fallback: create minimal icon
    trayIcon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA' +
      'gElEQVQ4T2NkoBAwUqifYdQAhtEwYBgeBv9RYoARl5ewGfAfQ+P/DAwM/0E0I7oBjP8Z' +
      'GP7jMgSbZkZGBgZGRgYGRmyasamBuQKrAbgMwWYIIw5XEDQAZgg2Q4hyBS5DiHYFLkOI' +
      'dgU+Q0hyBTZDSHYFpgEku4IYQ0hOC4QMAQC4HTARCwGnQgAAAABJRU5ErkJggg=='
    );
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
        if (!mainWindow) createMainWindow();
        mainWindow.show();
      }
    },
    {
      label: 'テスト通知を送信',
      click: () => sendTestNotification()
    },
    { type: 'separator' },
    {
      label: '終了',
      click: () => app.quit()
    }
  ]);

  tray.setToolTip('Appreciate - イベント感謝収集システム');
  tray.setContextMenu(contextMenu);
}

// Send test notification (TEST0001)
function sendTestNotification() {
  createNotificationBannerWindow('テストイベント', 'TEST0001');
}

// Start calendar polling
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

      for (const event of events) {
        // Check for #appreciate or #ありがとう tag
        const description = event.description || '';
        if (description.includes('#appreciate') || description.includes('#ありがとう')) {
          await processAppreciateEvent(event);
        }
      }
    } catch (error) {
      console.error('Calendar polling error:', error);
      // Retry on next interval
    }
  };

  // Initial poll
  await pollCalendar();

  // Set up interval
  pollingTimer = setInterval(pollCalendar, POLLING_INTERVAL);
}

// Send Slack DM to attendees
async function sendSlackDMToAttendees(attendeeEmails, eventCode, eventTitle) {
  if (!slackClient) {
    console.log('Slack client not configured, skipping DM notifications');
    return;
  }

  for (const email of attendeeEmails) {
    try {
      // Look up user by email
      const userResult = await slackClient.users.lookupByEmail({ email });
      if (!userResult.ok || !userResult.user) {
        console.log(`Slack user not found for email: ${email}`);
        continue;
      }

      const slackUserId = userResult.user.id;

      // Send DM with button to open gratitude modal
      await slackClient.chat.postMessage({
        channel: slackUserId,
        text: `「${eventTitle}」が終了しました。感謝を送りましょう！`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📣 *「${eventTitle}」が終了しました*\n\n主催者に感謝を送りましょう！`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '🙏 感謝を送る',
                  emoji: true
                },
                style: 'primary',
                action_id: 'open_gratitude_modal',
                value: `${eventCode}|${eventTitle}`
              }
            ]
          }
        ]
      });

      console.log(`Slack DM sent to ${email}`);
    } catch (error) {
      console.error(`Failed to send Slack DM to ${email}:`, error.message);
    }
  }
}

// Process appreciate-tagged event
async function processAppreciateEvent(event) {
  const eventId = event.id;

  // Skip if already tracked
  if (trackedEvents.has(eventId)) {
    return;
  }

  const endTime = new Date(event.end.dateTime || event.end.date);
  const now = new Date();

  // Register event in Firestore
  const eventCode = generateEventCode();
  const eventData = {
    googleEventId: eventId,
    title: event.summary,
    description: event.description,
    startTime: Timestamp.fromDate(new Date(event.start.dateTime || event.start.date)),
    endTime: Timestamp.fromDate(endTime),
    eventCode,
    organizerEmail: event.organizer?.email || '',
    attendees: (event.attendees || []).map(a => a.email),
    status: 'pending',
    createdAt: serverTimestamp()
  };

  try {
    await setDoc(doc(db, 'events', eventCode), eventData);
    trackedEvents.set(eventId, { eventCode, endTime, data: eventData });

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
  } catch (error) {
    console.error('Error saving event to Firestore:', error);
  }
}

// Trigger event end flow
async function triggerEventEnd(eventCode, eventTitle) {
  // Update event status
  try {
    const eventRef = doc(db, 'events', eventCode);
    await setDoc(eventRef, { status: 'collecting' }, { merge: true });
  } catch (error) {
    console.error('Error updating event status:', error);
  }

  // Get attendees and send Slack DM
  const trackedEvent = Array.from(trackedEvents.values()).find(e => e.eventCode === eventCode);
  if (trackedEvent && trackedEvent.data.attendees) {
    const attendeeEmails = trackedEvent.data.attendees.filter(email =>
      email !== trackedEvent.data.organizerEmail
    );
    sendSlackDMToAttendees(attendeeEmails, eventCode, eventTitle);
  }

  // Show notification banner (for organizer)
  createNotificationBannerWindow(eventTitle, eventCode);

  // Schedule 3-minute warning (7 minutes after start)
  setTimeout(() => {
    showThreeMinuteWarning(eventTitle);
  }, 7 * 60 * 1000);

  // Schedule collection end (10 minutes after event end)
  setTimeout(async () => {
    await endGratitudeCollection(eventCode, eventTitle);
  }, 10 * 60 * 1000);
}

// Show 3-minute warning to organizer
function showThreeMinuteWarning(eventTitle) {
  const notification = new Notification({
    title: 'Appreciate',
    body: `「${eventTitle}」の感謝受付終了まであと3分です`,
    silent: false
  });
  notification.show();
}

// End gratitude collection and show overlay
async function endGratitudeCollection(eventCode, eventTitle) {
  try {
    const eventRef = doc(db, 'events', eventCode);
    await setDoc(eventRef, { status: 'completed' }, { merge: true });
  } catch (error) {
    console.error('Error updating event status:', error);
  }

  // Show overlay with gratitudes
  createOverlayWindow();

  if (overlayWindow) {
    overlayWindow.webContents.on('did-finish-load', () => {
      overlayWindow.webContents.send('show-gratitudes', { eventCode, eventTitle });
    });
  }
}

// IPC Handlers
ipcMain.handle('get-auth-url', () => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
});

ipcMain.handle('exchange-code', async (event, code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    store.set('tokens', tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    store.set('user', userInfo.data);

    // Start calendar polling
    startCalendarPolling();

    return { success: true, user: userInfo.data };
  } catch (error) {
    console.error('Token exchange error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-stored-user', () => {
  return store.get('user');
});

ipcMain.handle('logout', () => {
  store.delete('tokens');
  store.delete('user');
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
  return { success: true };
});

ipcMain.handle('submit-gratitude', async (event, data) => {
  const { eventCode, emojis, message } = data;

  try {
    const gratitudeId = `${eventCode}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
});

ipcMain.handle('get-event-by-code', async (event, eventCode) => {
  try {
    const eventDoc = await getDoc(doc(db, 'events', eventCode));
    if (eventDoc.exists()) {
      return { success: true, event: eventDoc.data() };
    }
    return { success: false, error: 'イベントが見つかりません' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-participant-window', (event, { eventId, eventTitle }) => {
  createParticipantWindow(eventId, eventTitle);
});

ipcMain.handle('close-notification-banner', () => {
  if (notificationBannerWindow && !notificationBannerWindow.isDestroyed()) {
    notificationBannerWindow.close();
  }
});

ipcMain.handle('open-summary', (event, eventCode) => {
  createSummaryWindow();
  if (summaryWindow) {
    summaryWindow.webContents.on('did-finish-load', () => {
      summaryWindow.webContents.send('load-summary', { eventCode });
    });
  }
});

ipcMain.handle('close-overlay', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
});

// App lifecycle
app.whenReady().then(() => {
  createMainWindow();
  createTray();

  // Check for stored tokens and start polling
  const tokens = store.get('tokens');
  if (tokens) {
    oauth2Client.setCredentials(tokens);
    startCalendarPolling();
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
  if (pollingTimer) {
    clearInterval(pollingTimer);
  }
});

// Local server for OAuth callback
const server = require('./server');
