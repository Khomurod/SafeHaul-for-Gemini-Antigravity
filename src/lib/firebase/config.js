import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
  getFirestore
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const rawFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const requiredFirebaseKeys = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];

const missingFirebaseKeys = requiredFirebaseKeys.filter((key) => !rawFirebaseConfig[key]);
const isE2ETestMode = import.meta.env.VITE_E2E_TEST_MODE === '1';
const canUsePlaceholderConfig = missingFirebaseKeys.length > 0 && !import.meta.env.PROD;

if (missingFirebaseKeys.length > 0 && import.meta.env.PROD) {
  throw new Error(
    `[firebase] Missing required Firebase env vars in production: ${missingFirebaseKeys.join(', ')}`,
  );
}

if (canUsePlaceholderConfig) {
  const modeLabel = isE2ETestMode ? 'E2E test mode' : 'non-production mode';
  console.warn(
    `[firebase] Missing env vars (${missingFirebaseKeys.join(', ')}). Using placeholder config in ${modeLabel}.`,
  );
}

const firebaseConfig = canUsePlaceholderConfig
  ? {
      apiKey: rawFirebaseConfig.apiKey || 'AIzaSyE2EPlaceholderKey1234567890123',
      authDomain: rawFirebaseConfig.authDomain || 'safehaul-e2e.firebaseapp.com',
      projectId: rawFirebaseConfig.projectId || 'safehaul-e2e',
      storageBucket: rawFirebaseConfig.storageBucket || 'safehaul-e2e.appspot.com',
      messagingSenderId: rawFirebaseConfig.messagingSenderId || '1234567890',
      appId: rawFirebaseConfig.appId || '1:1234567890:web:1234567890abcdef123456',
    }
  : rawFirebaseConfig;

// Initialize Firebase with HMR safety
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

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
