// src/firebase.js
// Firebase Realtime Database 연결 헬퍼
// 👉 아래 config 값은 네 프로젝트 콘솔에서 복사해서 넣어줘.
//    (Project settings > Your apps > Firebase SDK snippet > Config)
import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref as _ref,
  set as _set,
  onValue as _onValue,
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

// 앱/DB 초기화 (중복 방지)
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// App.js에서 그대로 import해서 쓰기 편하게 export alias 맞춰줌
export { db };
export const ref = _ref;
export const set = _set;
export const onValue = _onValue;
