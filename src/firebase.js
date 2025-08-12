// src/firebase.js
// Firebase Realtime Database 연결 헬퍼 (실제 콘솔 값으로 교체하세요)

import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref as _ref,
  set as _set,
  update as _update,
  onValue as _onValue,
  push as _push,
  runTransaction as _runTransaction,
} from "firebase/database";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR-PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR-PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "YOUR-PROJECT",
  storageBucket: "YOUR-PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db };
export const ref = _ref;
export const set = _set;
export const update = _update;
export const onValue = _onValue;
export const push = _push;
export const runTransaction = _runTransaction;
