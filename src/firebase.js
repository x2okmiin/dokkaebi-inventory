// src/firebase.js
// Firebase Realtime Database + Anonymous Auth
// 👉 콘솔에서 프로젝트 설정값(config)만 채워 넣으면 바로 동작

import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref as _ref,
  set as _set,
  onValue as _onValue,
} from "firebase/database";

import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";

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

// 🔐 Anonymous Auth: 규칙에서 ".write": "auth != null" 허용을 만족시킴
const auth = getAuth(app);
signInAnonymously(auth).catch(() => { /* 실패해도 앱은 보여주되 쓰기만 막힘 */ });
onAuthStateChanged(auth, () => { /* 필요시 상태 변화 처리 가능 */ });

export { db, auth };
export const ref = _ref;
export const set = _set;
export const onValue = _onValue;
