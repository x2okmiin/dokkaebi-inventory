// src/firebase.js
// Firebase v9+ (Modular) — Realtime Database 전용 초기화 + 함수 re-export

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

/**
Firebase 콘솔 → 프로젝트 선택 → 톱니바퀴(설정) → 프로젝트 설정 → 일반
→ [내 앱] 섹션 → Web 앱 클릭 → Firebase SDK snippet (config)
 */
const firebaseConfig = {
  apiKey: "AIzaSyB_dbko0nrKNTGUP_5SJBjLAXZp8wokVP8",
  authDomain: "dokkebi-inventory-9bd2f.firebaseapp.com",
  databaseURL:
    "https://dokkebi-inventory-9bd2f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dokkebi-inventory-9bd2f",
  storageBucket: "dokkebi-inventory-9bd2f.firebasestorage.app",
  messagingSenderId: "869306575595",
  appId: "1:869306575595:web:36a1a3a988879c213facae",
  measurementId: "G-928MG5M3Q1"
};

// 초기화
const app = initializeApp(firebaseConfig);

// RTDB 인스턴스
export const db = getDatabase(app);

// ===== Re-Exports (App.js에서 그대로 import해서 사용) =====
export const ref = _ref;                 // 사용법: ref(db, "path")
export const set = _set;                 // set(ref(db, "a/b"), data)
export const update = _update;           // update(ref(db), { "a/b": 1, "c/d": 2 })
export const onValue = _onValue;         // onValue(ref(db, "a/b"), snap => ...)
export const push = _push;               // push(ref(db, "a/b"))
export const runTransaction = _runTransaction; // runTransaction(ref(db, "a/b"), cur => ...)
