// src/utils/storage.js

export function getLocalInventory() {
  const d = localStorage.getItem("do-kkae-bi-inventory");
  return d ? JSON.parse(d) : {};
}

export function saveLocalInventory(data) {
  localStorage.setItem("do-kkae-bi-inventory", JSON.stringify(data));
}

export function getLocalLogs() {
  const d = localStorage.getItem("do-kkae-bi-logs");
  return d ? JSON.parse(d) : [];
}

export function saveLocalLogs(data) {
  localStorage.setItem("do-kkae-bi-logs", JSON.stringify(data));
}

export function getLocalAdmin() {
  return localStorage.getItem("do-kkae-bi-admin") === "true";
}

export function saveLocalAdmin(val) {
  localStorage.setItem("do-kkae-bi-admin", val ? "true" : "false");
}
