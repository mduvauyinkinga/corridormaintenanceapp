/**
 * config.js (site)
 * ------------------------------------------------------------------
 * Environment configuration for the static website.
 * Loaded as a plain (non-module) script BEFORE the ES modules on every page,
 * so window.__FIR_CONFIG__ is always defined when js/api.js runs.
 *
 * ⚠️ THIS FILE NOW CONFIGURES FIREBASE INSTEAD OF A LOCAL/REMOTE API BASE.
 * Replace the Firebase config values with your own project's settings.
 */

// Firebase configuration - replace with your Firebase project settings
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBc2abd0k9MHEi4P0mBTdCQ3Bg6gdZVj64",
  authDomain: "corridormaintenanceapp.firebaseapp.com",
  projectId: "corridormaintenanceapp",
  storageBucket: "corridormaintenanceapp.firebasestorage.app",
  messagingSenderId: "510490645459",
  appId: "1:510490645459:web:d5c9636d0edf0d99771526",
  measurementId: "G-H0E28XJ3GD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
// Initialize Firebase app - will be initialized in api.js
window.__FIREBASE_APP__ = null;

// Export for use by other modules
export const FIREBASE_CONFIG = window.__FIR_CONFIG__;