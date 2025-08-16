// src/firebase.js
// Firebase v9+ modular SDK
import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref as dbRef,
  onValue as dbOnValue,
  set as dbSet,
  update as dbUpdate,
  push as dbPush,
  remove as dbRemove,
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
export const db = getDatabase(app);


// 래퍼들 (ref는 path만 받습니다)

export const ref = (path) => dbRef(db, path);
export const onValue = dbOnValue;
export const set = dbSet;
export const update = dbUpdate;
export const push = dbPush;
export const remove = dbRemove;