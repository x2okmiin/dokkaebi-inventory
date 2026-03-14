// src/firebase.js
// Firebase v9+ modular SDK
// -----------------------------------------------------------------------------
// 이 파일은 "Firebase 진입점" 역할을 합니다.
// - App.js에서 RTDB 호출을 직접 흩뿌리지 않고, 여기 래퍼를 통해 접근하도록 유지합니다.
// - 추후 v1.6.x에서 로딩 지연을 줄일 때 이 파일만 보면 성능/디버깅 포인트를 찾을 수 있게 설계합니다.
// -----------------------------------------------------------------------------
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

const isDebug = process.env.NODE_ENV !== "production";

/**
 * RTDB 작업 측정 로그.
 * 추후 최적화 시 어떤 경로(path)에서 지연이 발생하는지 콘솔에서 즉시 확인할 수 있다.
 */
function withPerfLog(label, path, work) {
  const started = performance.now();
  const result = work();

  if (!result || typeof result.then !== "function") {
    if (isDebug) {
      const elapsed = (performance.now() - started).toFixed(1);
      console.info(`[firebase:${label}] ${path} (${elapsed}ms)`);
    }
    return result;
  }

  return result
    .then((v) => {
      if (isDebug) {
        const elapsed = (performance.now() - started).toFixed(1);
        console.info(`[firebase:${label}] ${path} ✓ (${elapsed}ms)`);
      }
      return v;
    })
    .catch((e) => {
      if (isDebug) {
        const elapsed = (performance.now() - started).toFixed(1);
        console.warn(`[firebase:${label}] ${path} ✗ (${elapsed}ms)`, e);
      }
      throw e;
    });
}

// 래퍼들 (ref는 path만 받습니다)
export const ref = (path) => dbRef(db, path);

export const onValue = (targetRef, callback, onError) => {
  const path = targetRef?.toString?.() || "unknown";
  return dbOnValue(
    targetRef,
    (snapshot) => {
      if (isDebug) {
        console.info(`[firebase:onValue] ${path} received`);
      }
      callback(snapshot);
    },
    onError
  );
};

export const set = (targetRef, value) => {
  const path = targetRef?.toString?.() || "unknown";
  return withPerfLog("set", path, () => dbSet(targetRef, value));
};

export const update = (targetRef, value) => {
  const path = targetRef?.toString?.() || "unknown";
  return withPerfLog("update", path, () => dbUpdate(targetRef, value));
};

export const push = (targetRef, value) => {
  const path = targetRef?.toString?.() || "unknown";
  if (value === undefined) {
    return dbPush(targetRef);
  }
  return withPerfLog("push", path, () => dbPush(targetRef, value));
};

export const remove = (targetRef) => {
  const path = targetRef?.toString?.() || "unknown";
  return withPerfLog("remove", path, () => dbRemove(targetRef));
};

// TODO(v1.6.x): inventory/logs 경로 분리 모듈을 도입해 읽기 빈도를 줄이고,
//               Home/Logs 페이지 각각에 필요한 최소 구독만 유지하도록 최적화한다.