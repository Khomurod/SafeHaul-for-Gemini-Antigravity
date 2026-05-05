import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
  getFirestore
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

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

// App Check bootstrapping
// Production: initialize whenever site key is present.
// Localhost: initialize only when debug token is explicitly provided.
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
const appCheckDebugToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const useDebugAppCheck = Boolean(isLocalhost && appCheckDebugToken);

if (useDebugAppCheck && typeof self !== 'undefined') {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken === 'true' ? true : appCheckDebugToken;
}

if (recaptchaSiteKey && (!isLocalhost || useDebugAppCheck)) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true
  });

  if (useDebugAppCheck) {
    console.info('[firebase] App Check initialized in localhost debug mode.');
  }
} else if (isLocalhost) {
  console.info('[firebase] App Check skipped on localhost. Set VITE_FIREBASE_APPCHECK_DEBUG_TOKEN to test protected uploads.');
} else {
  console.warn('[firebase] App Check not initialized: VITE_RECAPTCHA_ENTERPRISE_SITE_KEY is missing.');
}

export const auth = getAuth(app);

// Use memory-only cache to prevent IndexedDB assertion failures.
let firestore;
try {
  firestore = initializeFirestore(app, {
    localCache: memoryLocalCache(),
  });
} catch {
  // If already initialized (HMR), use existing instance
  firestore = getFirestore(app);
}

export const db = firestore;
export const storage = getStorage(app);
export const functions = getFunctions(app);
