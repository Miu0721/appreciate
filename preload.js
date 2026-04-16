const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Authentication
  getAuthUrl: () => ipcRenderer.invoke('get-auth-url'),
  exchangeCode: (code) => ipcRenderer.invoke('exchange-code', code),
  getStoredUser: () => ipcRenderer.invoke('get-stored-user'),
  logout: () => ipcRenderer.invoke('logout'),

  // Events
  getEventByCode: (eventCode) => ipcRenderer.invoke('get-event-by-code', eventCode),

  // Gratitude
  submitGratitude: (data) => ipcRenderer.invoke('submit-gratitude', data),

  // Windows
  openSummary: (eventCode) => ipcRenderer.invoke('open-summary', eventCode),
  closeOverlay: () => ipcRenderer.invoke('close-overlay'),

  // Event listeners
  onShowGratitudes: (callback) => ipcRenderer.on('show-gratitudes', (event, data) => callback(data)),
  onLoadSummary: (callback) => ipcRenderer.on('load-summary', (event, data) => callback(data)),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
