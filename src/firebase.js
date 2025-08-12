// src/firebase.js
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

// ✅ 네가 준 콘솔 설정 사용 (storageBucket만 appspot.com으로 보정)
const firebaseConfig = {
  apiKey: "AIzaSyB_dbko0nrKNTGUP_5SJBjLAXZp8wokVP8",
  authDomain: "dokkebi-inventory-9bd2f.firebaseapp.com",
  databaseURL:
    "https://dokkebi-inventory-9bd2f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dokkebi-inventory-9bd2f",
  storageBucket: "dokkebi-inventory-9bd2f.appspot.com",
  messagingSenderId: "869306575595",
  appId: "1:869306575595:web:36a1a3a988879c213facae",
  measurementId: "G-928MG5M3Q1",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// Re-exports
export const ref = _ref;
export const set = _set;
export const update = _update;
export const onValue = _onValue;
export const push = _push;
export const runTransaction = _runTransaction;
