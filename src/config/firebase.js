/**
 * Firebase configuration and initialization
 * Shared between main process and server
 */

require('dotenv').config();
const { initializeApp, getApps, getApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain: 'appreciate-54692.firebaseapp.com',
  projectId: 'appreciate-54692',
  storageBucket: 'appreciate-54692.appspot.com',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || 'YOUR_SENDER_ID',
  appId: process.env.FIREBASE_APP_ID || 'YOUR_APP_ID'
};

/**
 * Get or create Firebase app instance
 * @param {string} [name] - Optional app name for multiple instances
 * @returns {FirebaseApp}
 */
function getFirebaseApp(name) {
  const apps = getApps();

  if (name) {
    const existingApp = apps.find(app => app.name === name);
    if (existingApp) {
      return existingApp;
    }
    return initializeApp(firebaseConfig, name);
  }

  if (apps.length > 0) {
    return getApp();
  }
  return initializeApp(firebaseConfig);
}

/**
 * Get Firestore database instance
 * @param {string} [appName] - Optional app name
 * @returns {Firestore}
 */
function getDb(appName) {
  const app = getFirebaseApp(appName);
  return getFirestore(app);
}

module.exports = {
  firebaseConfig,
  getFirebaseApp,
  getDb
};
