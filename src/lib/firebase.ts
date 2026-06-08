// Firebase initialization.
// Paste your Firebase web config below after creating the project.
// Find it at: Firebase Console → Project Settings → General → Your apps → SDK setup → Config.
// These values are SAFE to commit — they identify the project, not authenticate it.
// Security is enforced by Firestore Rules.

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "PASTE_apiKey_HERE",
  authDomain: "PASTE_authDomain_HERE",
  projectId: "PASTE_projectId_HERE",
  storageBucket: "PASTE_storageBucket_HERE",
  messagingSenderId: "PASTE_messagingSenderId_HERE",
  appId: "PASTE_appId_HERE",
};

export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith("PASTE_");

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export function getDb(): Firestore | null {
  if (!isFirebaseConfigured) return null;
  if (typeof window === "undefined") return null;
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  if (!db) {
    db = getFirestore(app);
  }
  return db;
}
