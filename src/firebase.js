// src/firebase.js
// Firebase v9+ modular SDK
import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref as dbRef,
  set as dbSet,
  onValue as dbOnValue,
  update as dbUpdate,
  push as dbPush,
  runTransaction as dbRunTransaction,
} from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyB_dbko0nrKNTGUP_5SJBjLAXZp8wokVP8",
  authDomain: "dokkebi-inventory-9bd2f.firebaseapp.com",
  databaseURL:
    "https://dokkebi-inventory-9bd2f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dokkebi-inventory-9bd2f",
  storageBucket: "dokkebi-inventory-9bd2f.firebasestorage.app",
  messagingSenderId: "869306575595",
  appId: "1:869306575595:web:36a1a3a988879c213facae",
  measurementId: "G-928MG5M3Q1",
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/** 재사용을 편하게 하기 위한 re-export (프로젝트 가이드 준수) */
export { db };
export const ref = (path) => dbRef(db, path);
export const set = (reference, value) => dbSet(reference, value);
export const onValue = (reference, callback, onError) => dbOnValue(reference, callback, onError);

/** 향후 확장 옵션: update / push / runTransaction (설정값 변경 없이 사용 가능) */
export const update = (reference, values) => dbUpdate(reference, values);
export const push = (reference, value) => dbPush(reference, value);
export const runTransaction = (reference, updater) => dbRunTransaction(reference, updater);