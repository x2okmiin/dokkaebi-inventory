// src/firebase.js
// Firebase Realtime Database 연결 헬퍼
// ⚠️ 반드시 콘솔의 실제 config로 교체하세요.

import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref as _ref,
  set as _set,
  onValue as _onValue,
  update as _update,
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
export const onValue = _onValue;
export const update = _update;
