// Firebase initialization.
// Paste your Firebase web config below after creating the project.
// Find it at: Firebase Console → Project Settings → General → Your apps → SDK setup → Config.
// These values are SAFE to commit — they identify the project, not authenticate it.
// Security is enforced by Firestore Rules.

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBcs_X_dLJ0Hzh8jod-oaER90urhW9QauU",
  authDomain: "xmonitor1-ea520.firebaseapp.com",
  projectId: "xmonitor1-ea520",
  storageBucket: "xmonitor1-ea520.firebasestorage.app",
  messagingSenderId: "86533923093",
  appId: "1:86533923093:web:3d7bd74d1c7249abc1c91c",
  measurementId: "G-BP3CB27EX8",
};

export const isFirebaseConfigured = true;

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
