import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
  getFirestore,
  terminate
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

// ... Configuration remains the same ...
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase with HMR safety
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// --- APP CHECK: Bot Mitigation (reCAPTCHA Enterprise) ---
// Proves to Firebase that requests come from your real web app, not scripts/bots.
// Debug mode is enabled for localhost so development is not blocked.
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
if (recaptchaSiteKey) {
  // Enable debug tokens for localhost development
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true
  });
  console.log("✅ App Check initialized (reCAPTCHA Enterprise)");
} else {
  console.warn("⚠️ App Check NOT initialized: VITE_RECAPTCHA_ENTERPRISE_SITE_KEY not set");
}

export const auth = getAuth(app);

// Use memory-only cache and forced long polling to prevent "Unexpected state (ID: ca9)" 
// assertion failures caused by transport synchronization errors or IndexedDB corruption.
// HMR Safety: Check if db is already initialized.
// HMR Safety: Check if db is already initialized.
let firestore;
try {
  // 1. Force Clear Persistence (Nuclear Option for "Unexpected State")
  // This deletes the local IndexedDB to resolve corruption/lock contentions
  try {
    const dbName = 'firestore/[DEFAULT]/truckerapp-system/main';
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => console.log("✅ Persistence cleared");
    req.onerror = () => console.log("⚠️ Persistence clear skipped");
  } catch (err) { /* ignore in non-browser envs */ }

  // 2. Try to initialize with custom settings first
  firestore = initializeFirestore(app, {
    localCache: memoryLocalCache(),
    experimentalForceLongPolling: true
  });
} catch (e) {
  // If already initialized, use existing instance
  firestore = getFirestore(app);
}

export const db = firestore;
export const storage = getStorage(app);
export const functions = getFunctions(app);

console.log("Firebase has been connected safely (HMR-Optimized)!");