// src/utils/backup.js
const LS_KEY = "dkb_backup_inventory";
const LS_TS  = "dkb_backup_ts";
const TTL_MS = 30 * 60 * 1000; // 30분

const now = () => Date.now();
const isExpired = (ts) => !ts || now() - Number(ts) > TTL_MS;

export function hasBackup() {
  try {
    const ts = localStorage.getItem(LS_TS);
    const raw = localStorage.getItem(LS_KEY);
    if (!ts || !raw) return { ok: false, reason: "없음" };
    if (isExpired(ts)) return { ok: false, reason: "만료" };
    const sizeKB = Math.round((raw.length / 1024) * 10) / 10;
    const ageMs  = now() - Number(ts);
    return { ok: true, ts: Number(ts), ageMs, sizeKB };
  } catch {
    return { ok: false, reason: "오류" };
  }
}

export function createBackup(inventoryObject) {
  try {
    const data = JSON.stringify(inventoryObject ?? {}, null, 0);
    localStorage.setItem(LS_KEY, data);
    localStorage.setItem(LS_TS, String(now()));
    return { ok: true };
  } catch (e) {
    console.warn("[backup] createBackup failed:", e);
    return { ok: false, error: e?.message };
  }
}

export function loadBackup() {
  const meta = hasBackup();
  if (!meta.ok) return { ok: false, reason: meta.reason };
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = JSON.parse(raw || "{}");
    return { ok: true, inventory: parsed, ts: meta.ts };
  } catch (e) {
    return { ok: false, error: e?.message || "JSON parse error" };
  }
}

export function clearBackup() {
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_TS);
  } catch {}
}

export function describeBackup() {
  const meta = hasBackup();
  if (!meta.ok) return "백업 없음";
  const minutes = Math.floor(meta.ageMs / 60000);
  const seconds = Math.floor((meta.ageMs % 60000) / 1000);
  return `약 ${minutes}분 ${seconds}초 전 · ${meta.sizeKB}KB`;
}

export async function restoreBackup(applyInventory) {
  const meta = hasBackup();
  if (!meta.ok) return { ok: false, reason: meta.reason || "백업 없음" };
  try {
    const raw = localStorage.getItem(LS_KEY);
    const snapshot = JSON.parse(raw || "{}");
    const res = await applyInventory(snapshot);
    if (res?.ok) {
      clearBackup();
      return { ok: true };
    }
    return { ok: false, reason: res?.error || "적용 실패" };
  } catch (e) {
    return { ok: false, reason: e?.message || "복구 중 오류" };
  }
}
