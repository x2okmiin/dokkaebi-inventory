// PATCH: src/App.js

/* ==========================================================================
   App.css 연동 및 파일 구성 안내
   작성 가이드:
   - 본 파일은 홈(재고) + 기록 페이지 + 실시간 동기화 래퍼를 포함한 단일 App.js입니다.
   - “전체” 카드는 장소 카드 그리드 내부에 포함되어 2열 이상에서 2×2 배열이 되도록 합니다.
   - Firebase RTDB: inventory는 set 전체 저장, logs는 push/update/remove만.
   - 섹션별 주석을 유지해 가독성과 회귀 테스트를 용이하게 합니다.
   ========================================================================== */

// src/App.js  — 통합본 (중복/경고 제거, 새 기기 부트 게이트, 2×2 그리드 유지)

 import React, { useState, useEffect, useRef, useMemo } from "react";
 import { HashRouter as Router, Routes, Route, useNavigate, Navigate, useLocation } from "react-router-dom";
 import * as XLSX from "xlsx";
 import "./App.css";
 
 import LoginPage from "./LoginPage";
 import { Toaster, toast } from "react-hot-toast";
 import { ref, set, onValue, push, update, remove } from "./firebase";
// [P1-A] 백업 유틸 임포트
import { createBackup, hasBackup, restoreBackup, describeBackup } from "./utils/backup";


 // Boot/Fallback config (⚠️ 모든 import 뒤, 다른 실행코드/선언 앞)
const BOOT_FORCE_HIDE_MS = 8000;      // 스플래시 강제 닫기
const BOOT_FALLBACK_FLAG_MS = 12000;  // 네트워크 지연 감지 표시


/* =========================
   버전 라벨
   ========================= */
const APP_VERSION =
  process.env.REACT_APP_VERSION ||
  localStorage.getItem("do-kkae-bi-app-version") ||
  "dev";
const APP_BUILD_INFO =
  process.env.REACT_APP_BUILD_INFO ||
  process.env.REACT_APP_GIT_COMMIT ||
  localStorage.getItem("do-kkae-bi-build-info") ||
  "local";
const ADMIN_PASSWORD = "2513";
const GUIDE_STORAGE_KEY = "do-kkae-bi-onboarding-v1.6.0-beta.5";
const GUIDE_RUNTIME_KEY = "do-kkae-bi-onboarding-runtime-v1";
const GUIDE_VERSION = "1.6.0-beta.5";
const GUIDE_STEP_COUNT = 6;

/**
 * 체험형 가이드 '진행 중 상태'를 라우팅 이동 간 유지하기 위한 런타임 저장소.
 * - 왜 필요한가?
 *   Home -> Logs 같은 해시 라우팅 전환 시 Home 컴포넌트가 언마운트되면서
 *   guidedStep/open 상태가 초기화되는 문제(가이드 씹힘)를 방지하기 위함.
 * - 주의사항:
 *   이 값은 "영구 완료 여부"(GUIDE_STORAGE_KEY)와 분리한다.
 *   완료/스킵 여부는 GUIDE_STORAGE_KEY, 진행 중 임시 상태는 GUIDE_RUNTIME_KEY.
 */
function getGuideRuntime() {
  try {
    const raw = sessionStorage.getItem(GUIDE_RUNTIME_KEY);
    if (!raw) return normalizeGuideRuntime({});
    return normalizeGuideRuntime(JSON.parse(raw));
  } catch {
    return normalizeGuideRuntime({});
  }
}

function normalizeGuideRuntime(runtime = {}) {
  const safeStepStates = Array.from({ length: GUIDE_STEP_COUNT }, (_, idx) => {
    const v = runtime?.stepStates?.[idx];
    return ["idle", "waiting-action", "done", "skipped"].includes(v) ? v : "idle";
  });
  return {
    open: !!runtime?.open,
    step: Number.isFinite(runtime?.step) ? Math.max(0, Math.min(5, runtime.step)) : 0,
    engaged: !!runtime?.engaged,
    panelOpen: !!runtime?.panelOpen,
    pendingAction: runtime?.pendingAction || "open-location-card",
    stepStates: safeStepStates,
    // step 1(로그 이동) 재실행 루프를 막기 위한 one-shot 제어 플래그들
    suppressAutoActionOnce: !!runtime?.suppressAutoActionOnce,
    pausedOnRoute: runtime?.pausedOnRoute || "",
    guideTransitioningTo: runtime?.guideTransitioningTo || "",
    sourceRoute: runtime?.sourceRoute || "/",
    returnRoute: runtime?.returnRoute || "/",
  };
}

function saveGuideRuntime(runtime) {
  try {
    const normalized = normalizeGuideRuntime(runtime);
    const nextRaw = JSON.stringify(normalized);
    const prevRaw = sessionStorage.getItem(GUIDE_RUNTIME_KEY);
    if (prevRaw === nextRaw) return;
    sessionStorage.setItem(GUIDE_RUNTIME_KEY, nextRaw);
    window.dispatchEvent(new CustomEvent("dokkebi-guide-runtime-updated", { detail: normalized }));
  } catch {}
}

function clearGuideRuntime() {
  try {
    sessionStorage.removeItem(GUIDE_RUNTIME_KEY);
  } catch {}
}


function getOnboardingState() {
  try {
    const raw = localStorage.getItem(GUIDE_STORAGE_KEY);
    if (!raw) return { seen: false, status: "new", ts: null, completedSteps: [], autoStartBlocked: false, dismissedUntilManualReopen: false };
    const parsed = JSON.parse(raw);
    return {
      seen: !!parsed?.seen,
      status: parsed?.status || "completed",
      reopenedAt: parsed?.reopenedAt || null,
      ts: parsed?.ts || null,
      completedSteps: Array.isArray(parsed?.completedSteps) ? parsed.completedSteps : [],
      autoStartBlocked: !!parsed?.autoStartBlocked,
      dismissedUntilManualReopen: !!parsed?.dismissedUntilManualReopen,
    };
  } catch {
    return { seen: false, status: "new", ts: null, completedSteps: [], autoStartBlocked: false, dismissedUntilManualReopen: false };
  }
}

  const blockAutoStart = status === "skipped";
  try {
    localStorage.setItem(
      GUIDE_STORAGE_KEY,
      JSON.stringify({
        seen: true,
        status,
        ts: new Date().toISOString(),
        completedSteps,
        // 스킵은 "자동 재등장 금지" 의미를 분명히 남긴다.
        // beta.6 이후 상태 확장 시에도 이 플래그를 기준으로 자동 시작 여부를 판정한다.
        autoStartBlocked: blockAutoStart,
        dismissedUntilManualReopen: blockAutoStart,
        version: GUIDE_VERSION,
      })
    );
  } catch {}

function markOnboardingReopened() {
  try {
    const prev = getOnboardingState();
    localStorage.setItem(
      GUIDE_STORAGE_KEY,
      JSON.stringify({
        ...prev,
        seen: true,
        status: prev.status === "skipped" ? "reopened" : (prev.status || "completed"),
        autoStartBlocked: false,
        dismissedUntilManualReopen: false,
        reopenedAt: new Date().toISOString(),
        version: GUIDE_VERSION,
      })
    );
  } catch {}
}

function isGuideAutoStartBlocked(state) {
  // "skipped" 또는 명시 차단 플래그가 있으면 자동 시작/자동 재개를 모두 막는다.
  return state?.status === "skipped" || !!state?.autoStartBlocked || !!state?.dismissedUntilManualReopen;
}


/* =========================
   1) 카테고리/스키마 정의
   ========================= */
const locations = ["동아리방", "비행장", "교수님방"];

const subcategories = {
  공구: ["수리", "납땜 용품", "드라이버", "그외 공구"],
  소모품: {
    "카본 프레임": [],
    "펜타 가드": { 새거: [], 중고: [], 기타: [] },
    "케이블 타이": { "100피스": [], "1000피스": [], "1000피스_중고": [] },
    프로펠러: { 새거: [], 중고: [] },
    XT커넥터: [],
    볼트너트: [],
    "납땜 관련": [],
    벨크로: [],
    배터리: { 기체: [], 충전기: [], 조종기: [], 기타: [] },
    LED: { 후방: [], 상부: [], "포지션 관련": [], 라운드: [] },
    테이프: { 필라멘트: [], 양면: [], "종이&마스킹": [], 절연: [], "그외 테이프": [] },
    "그외 소모품": [],
  },
  "드론 제어부": ["FC", "FC ESC 연결선", "ESC", "모터", "수신기", "콘덴서", "제어부 세트"],
  "조종기 개수": ["학교", "개인"],
  "기체 개수": ["학교", "개인"],
};

/* 아이콘 */
const catIcons = {
  공구: "🛠️",
  소모품: "🔩",
  "드론 제어부": "🧠",
  "조종기 개수": "🎮",
  "기체 개수": "🚁",
};
const catIcon = (cat) => catIcons[cat] || "📦";

/* =========================
   2) LocalStorage helpers
   ========================= */
function getLocalInventory() {
  const d = localStorage.getItem("do-kkae-bi-inventory");
  if (d) return JSON.parse(d);
  // 최초 템플릿 생성
  const base = {};
  locations.forEach((loc) => {
    base[loc] = {};
    Object.entries(subcategories).forEach(([cat, subs]) => {
      base[loc][cat] = base[loc][cat] || {};
      if (Array.isArray(subs)) {
        subs.forEach((sub) => (base[loc][cat][sub] = []));
      } else {
        Object.entries(subs).forEach(([sub, subs2]) => {
          if (Array.isArray(subs2)) {
            base[loc][cat][sub] = [];
          } else {
            base[loc][cat][sub] = {};
            Object.keys(subs2).forEach((sub2) => (base[loc][cat][sub][sub2] = []));
          }
        });
      }
    });
  });
  return base;
}
function saveLocalInventory(data) {
  localStorage.setItem("do-kkae-bi-inventory", JSON.stringify(data));
}
function getLocalLogs() {
  const d = localStorage.getItem("do-kkae-bi-logs");
  return d ? JSON.parse(d) : [];
}
function saveLocalLogs(data) {
  localStorage.setItem("do-kkae-bi-logs", JSON.stringify(data));
}
function getLocalAdmin() {
  return (
    sessionStorage.getItem("do-kkae-bi-admin") === "true" ||
    localStorage.getItem("do-kkae-bi-admin") === "true"
  );
}
function saveLocalAdmin(val) {
  localStorage.setItem("do-kkae-bi-admin", val ? "true" : "false");
}
function getLocalUserId() {
  return localStorage.getItem("do-kkae-bi-user-id") || "";
}
function getLocalUserName() {
  return localStorage.getItem("do-kkae-bi-user-name") || "";
}

/** 강제 로그아웃 — 전역 유틸(HashRouter 기준, 자동 새로고침 제거) */
function hardLogout() {
  // 세션(관리자/UID/이름) 초기화
  try {
    localStorage.removeItem("do-kkae-bi-user-id");
    localStorage.removeItem("do-kkae-bi-user-name");
    sessionStorage.removeItem("do-kkae-bi-admin");
    localStorage.removeItem("do-kkae-bi-login-ts");
    localStorage.setItem("do-kkae-bi-admin", "false");
  } catch (e) {
    console.warn("hardLogout warning:", e);
  }
  // 라우팅 이동 + 렌더 트리거
  window.location.hash = "#/login";
  try { window.dispatchEvent(new Event("dokkebi-auth-changed")); } catch {}
}

/* =========================
   3) 고정 배경 / 네온
   ========================= */
function FixedBg({
  src,
  overlay = null,
  maxW = "min(85vw, 1200px)",
  maxH = "min(70vh, 800px)",
  minW = "360px",
  minH = "220px",
  opacity = 0.95,
}) {
  return (
    <>
      <div className="fixed-bg">
        <img
          src={src}
          alt=""
          className="fixed-bg-img"
          style={{ maxWidth: maxW, maxHeight: maxH, minWidth: minW, minHeight: minH, opacity }}
        />
      </div>
      {overlay && <div className="fixed-bg-overlay" style={{ background: overlay }} />}
    </>
  );
}
function NeonBackdrop() {
  return (
    <>
      <div className="bg-aurora" aria-hidden />
      <div className="bg-grid" aria-hidden />
    </>
  );
}

/* =========================
   4) 공용 유틸
   ========================= */
   
function normalizeLogsVal(val) {
  if (!val) return [];
  if (Array.isArray(val)) {
    return Object.entries(val)
      .filter(([, v]) => v)
      .map(([k, v]) => ({ id: String(k), ...v }));
  }
  if (typeof val === "object") {
    return Object.entries(val)
      .filter(([, v]) => v)
      .map(([k, v]) => ({ id: k, ...v }));
  }
  return [];
}
function getItems(inv, loc, cat, sub, sub2) {
  const node = (((inv || {})[loc] || {})[cat] || {})[sub];
  if (!node) return [];
  if (sub2 && node && !Array.isArray(node)) return node[sub2] || [];
  return Array.isArray(node) ? node : [];
}
function ensureItems(inv, loc, cat, sub, sub2) {
  inv[loc] = inv[loc] || {};
  inv[loc][cat] = inv[loc][cat] || {};
  if (sub2) {
    inv[loc][cat][sub] = inv[loc][cat][sub] || {};
    inv[loc][cat][sub][sub2] = inv[loc][cat][sub][sub2] || [];
    return inv[loc][cat][sub][sub2];
  } else {
    inv[loc][cat][sub] = inv[loc][cat][sub] || [];
    return inv[loc][cat][sub];
  }
}
const subPath = (sub, sub2) => (sub2 ? `${sub}/${sub2}` : sub);

function createEmptyInventory() {
  const base = {};
  locations.forEach((loc) => {
    base[loc] = {};
    Object.entries(subcategories).forEach(([cat, subs]) => {
      base[loc][cat] = {};
      if (Array.isArray(subs)) {
        subs.forEach((sub) => (base[loc][cat][sub] = []));
      } else {
        Object.entries(subs).forEach(([sub, subs2]) => {
          if (Array.isArray(subs2)) {
            base[loc][cat][sub] = [];
          } else {
            base[loc][cat][sub] = {};
            Object.keys(subs2).forEach((sub2) => (base[loc][cat][sub][sub2] = []));
          }
        });
      }
    });
  });
  return base;
}

/** Firebase 금지 문자를 포함하거나 빈 문자열인 키 제거 */
const FORBIDDEN_KEY_RE = /[.#$/[\]]/;
function sanitizeInventoryKeys(src) {
  const inv = JSON.parse(JSON.stringify(src));
  const bad = [];
  const delIfBad = (obj, key, path) => {
    if (!key || FORBIDDEN_KEY_RE.test(key)) {
      delete obj[key];
      bad.push(`${path}${key === "" ? "(empty)" : key}`);
      return true;
    }
    return false;
  };
  Object.keys(inv || {}).forEach((loc) => {
    if (delIfBad(inv, loc, "inventory/")) return;
    const cats = inv[loc] || {};
    Object.keys(cats).forEach((cat) => {
      if (delIfBad(cats, cat, `inventory/${loc}/`)) return;
      const subs = cats[cat] || {};
      Object.keys(subs).forEach((sub) => {
        if (delIfBad(subs, sub, `inventory/${loc}/${cat}/`)) return;
        const node = subs[sub];
        if (Array.isArray(node)) return;
        if (node && typeof node === "object") {
          Object.keys(node).forEach((sub2) => {
            if (delIfBad(node, sub2, `inventory/${loc}/${cat}/${sub}/`)) return;
            if (!Array.isArray(node[sub2])) node[sub2] = [];
          });
        } else {
          subs[sub] = [];
        }
      });
    });
  });
  return { inv, bad };
}

/* ===== Boot Loading: 기존 스플래시(#app-splash)와 통합 ===== */
function BootLoading({ hint = "새 기기 · 첫 동기화", fallback = false }) {
  React.useEffect(() => {
    const splash = document.getElementById("app-splash");
    if (!splash) return; // 스플래시가 이미 닫혔으면 아무것도 안 함

    // ① 상단 상태 문구
    let sub = splash.querySelector(".splash-sub");
    if (!sub) {
      sub = document.createElement("div");
      sub.className = "splash-sub";
      splash.appendChild(sub);
    }
    sub.textContent = "최신 데이터 수신 중…";

    // ② 하단 메타(모드/폴백)
    let meta = splash.querySelector(".splash-meta");
    if (!meta) {
      meta = document.createElement("div");
      meta.className = "splash-meta";
      splash.appendChild(meta);
    }
    meta.textContent = `모드: ${hint}${fallback ? " · 네트워크 지연 감지(임시 통과)" : ""}`;
  }, [hint, fallback]);

  // 렌더링은 안 함(기존 스플래시만 업데이트)
  return null;
}


/* =========================
   5) 홈(재고) 화면
   ========================= */
function Home({
  inventory,
  setInventory,
  searchTerm,
  setSearchTerm,
  logs,
  setLogs,
  isAdmin,
  userId,
  userName,
}) {
  const resetAllRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const categoryRefs = useRef({});
  const cardRefs = useRef({});
  const [syncing, setSyncing] = useState(false);

  const [dataMenuOpen, setDataMenuOpen] = useState(false);
  const dataMenuRef = useRef(null);
  const [openPanel, setOpenPanel] = useState(null);
  const [editKey, setEditKey] = useState(null);
  // [P1-B] 백업 메타 상태
  const [backupMeta, setBackupMeta] = useState(() => hasBackup());
  const backupRefresh = React.useCallback(() => setBackupMeta(hasBackup()), []);

  const [highlightKey, setHighlightKey] = useState("");
  const [searchVisibleCount, setSearchVisibleCount] = useState(20);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [guideHubUnlocked, setGuideHubUnlocked] = useState(false);
  const [guidePanelOpen, setGuidePanelOpen] = useState(false);
  const [guidePendingAction, setGuidePendingAction] = useState("open-location-card");
  const [guideStepStates, setGuideStepStates] = useState(() => Array.from({ length: GUIDE_STEP_COUNT }, () => "idle"));
  const [guidedTutorialOpen, setGuidedTutorialOpen] = useState(false);
  const [guidedStep, setGuidedStep] = useState(0);
  // firstForcedGuide: 기기 첫 진입 강제 가이드 여부(닫기 버튼 노출 규칙 제어)
  const [firstForcedGuide, setFirstForcedGuide] = useState(false);
  // guideEngaged: 사용자가 "체험 시작" 또는 단계 선택으로 흐름에 실제 진입했는지 여부
  const [guideEngaged, setGuideEngaged] = useState(false);
  const [onboardingMeta, setOnboardingMeta] = useState(() => getOnboardingState());
  const dataMenuButtonRef = useRef(null);
  const importMenuItemRef = useRef(null);
  const logsNavButtonRef = useRef(null);
  const searchInputRef = useRef(null);

  // 온보딩 단계별 자동 이동 타겟(메인/로그/데이터 메뉴)
  const GUIDE_STEPS = useMemo(() => [
    {
      title: "1) 재고 관리 구조",
      desc: "장소 카드 확대 보기 또는 카테고리 details를 직접 열어 구조를 익히세요.",
      todo: "장소 카드 하나를 열어 구조를 확인하세요.",
      completeBy: "open-location-card",
      actionLabel: "장소 카드로 이동",
      action: () => cardRefs.current[locations[0]]?.scrollIntoView({ behavior: "smooth", block: "start" }),
    },
    {
      title: "2) 로그 페이지 핵심",
      desc: "기록 페이지에서 필터 토글 또는 내보내기를 실제 1회 조작해야 완료됩니다.",
      todo: "로그 페이지에서 필터 토글 또는 내보내기를 한 번 실행하세요.",
      completeBy: "logs-filter-or-export",
      actionLabel: "기록 페이지로 이동",
      action: () => {
        // 중요: /logs 이동 전에 런타임을 먼저 확정 저장해야 LogsPage가 stale prop 없이 즉시 최신 가이드를 읽는다.
        const preparedRuntime = normalizeGuideRuntime({
          ...getGuideRuntime(),
          open: true,
          step: 1,
          engaged: true,
          pendingAction: "logs-filter-or-export",
          panelOpen: true,
          sourceRoute: "/",
          returnRoute: "/",
          guideTransitioningTo: "logs",
          suppressAutoActionOnce: false,
          pausedOnRoute: "",
        });
        const stepStates = [...preparedRuntime.stepStates];
        if (stepStates[1] !== "done") stepStates[1] = "waiting-action";
        saveGuideRuntime({ ...preparedRuntime, stepStates });
        navigate("/logs", { state: { fromGuide: true, guideStep: 1, returnTo: "/" } });
      },
    },
    {
      title: "3) 검색과 이동",
      desc: "검색어 입력 후 결과 항목을 직접 눌러 위치 이동/하이라이트를 확인합니다.",
      todo: "검색 결과를 클릭해 해당 위치로 이동하세요.",
      completeBy: "search-result-click",
      actionLabel: "검색창으로 이동",
      action: () => searchInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
    },
    {
      title: "4) 권한 / 자동 로그아웃",
      desc: "우측 로그아웃 버튼 위치와 관리자 전용 버튼 노출 규칙을 확인하세요.",
      todo: "로그아웃 버튼 위치를 확인(터치)하고 자동 로그아웃 정책 안내를 읽으세요.",
      completeBy: "auth-policy-check",
      actionLabel: "권한 영역 보기",
      action: () => window.scrollTo({ top: 0, behavior: "smooth" }),
    },
    {
      title: "5) 일괄 추가와 백업",
      desc: "데이터 메뉴를 열어 내보내기/일괄추가/30분 복구 위치를 직접 확인합니다.",
      todo: "데이터 메뉴를 열고 항목 위치를 확인하세요.",
      completeBy: "open-data-menu",
      actionLabel: "데이터 메뉴 열기",
      action: () => {
        dataMenuButtonRef.current?.click();
        dataMenuButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
    },
    {
      title: "6) 마지막 운영 체크포인트",
      todo: "마지막 운영 체크포인트 확인 버튼을 눌러 완료하세요.",
      completeBy: "final-checkpoint",
      actionLabel: "운영 체크포인트 확인",
      action: () => window.scrollTo({ top: 0, behavior: "smooth" }),
    },
  ], [navigate]);


  // 시트 → JSON 로우 파싱(헤더 유연 + 'nan' 등 빈값 처리)
  function normalizeRow(r) {
    const get = (...keys) => {
      for (const k of keys) {
        if (r[k] !== undefined) return r[k];
        const rk = Object.keys(r).find(
          (x) => String(x).trim().toLowerCase() === String(k).trim().toLowerCase()
        );
        if (rk && r[rk] !== undefined) return r[rk];
      }
      return "";
    };
    const clean = (v) => {
      if (v === null || v === undefined) return "";
      let s = String(v).trim();
      if (!s) return "";
      const L = s.toLowerCase();
      if (L === "nan" || L === "na" || L === "n/a" || L === "-") return "";
      return s;
    };
    const loc = clean(get("장소", "위치", "place", "Place", "LOCATION", "location"));
    const cat = clean(get("상위카테고리", "대분류", "카테고리", "Category", "category"));
    const sub = clean(get("하위카테고리", "중분류", "Subcategory", "subcategory"));
    const sub2 = clean(get("최하위카테고리", "소분류", "SubSubcategory", "subsubcategory", "Sub2", "소분류(필요시)"));
    const name = clean(get("품목명", "품명", "항목", "아이템", "item", "Item", "품목"));
    const note = clean(get("메모", "비고", "설명", "Note", "note", "비고(선택)"));
    let qtyRaw = get("수량", "개수", "수량(개)", "수 량", "수량합계", "Qty", "qty", "Quantity", "quantity");
    let qty = Number(qtyRaw ?? 0);
    if (!Number.isFinite(qty)) qty = 0;
    return { loc, cat, sub, sub2, name, note, qty };
  }

  // 업로드용 파일 입력 ref
  const importInputRef = useRef(null);

  // 카테고리 경로 유효성 검사
  function isValidPath(cat, sub, sub2) {
    const def = subcategories[cat];
    if (!def) return false;
    if (Array.isArray(def)) {
      return !!sub && def.includes(sub) && (!sub2 || sub2 === "");
    }
    if (def && typeof def === "object") {
      if (!sub || !Object.prototype.hasOwnProperty.call(def, sub)) return false;
      const leaf = def[sub];
      if (Array.isArray(leaf)) {
        return !sub2 || sub2 === "";
      }
      if (leaf && typeof leaf === "object") {
        return !!sub2 && Object.prototype.hasOwnProperty.call(leaf, sub2);
      }
    }
    return false;
  }

  // 키 비교용 정규화
  function stripKey(s) {
    return String(s || "").toLowerCase().replace(/\s+/g, "").replace(/[&/]/g, "");
  }
  function canonLocName(loc) {
    const found = locations.find((L) => stripKey(L) === stripKey(loc));
    return found || loc;
  }
  function canonCatName(cat) {
    const keys = Object.keys(subcategories);
    const found = keys.find((k) => stripKey(k) === stripKey(cat));
    if (!found) {
      const alt = {
        드론제어부: "드론 제어부",
        조종기개수: "조종기 개수",
        기체개수: "기체 개수",
      }[stripKey(cat)];
      if (alt) return alt;
    }
    return found || cat;
  }
  function canonSubName(cat, sub) {
    const def = subcategories[cat];
    if (!def) return sub;
    const keys = Array.isArray(def) ? def : Object.keys(def);
    const found = keys.find((k) => stripKey(k) === stripKey(sub));
    if (!found && stripKey(sub) === "프로펠라") {
      const alt = keys.find((k) => stripKey(k) === "프로펠러");
      if (alt) return alt;
    }
    return found || sub;
  }
  function canonSub2Name(cat, sub, sub2) {
    const def = subcategories[cat];
    if (!def || Array.isArray(def)) return "";
    const leaf = def[sub];
    if (!leaf || Array.isArray(leaf)) return "";
    const keys = Object.keys(leaf);
    const found = keys.find((k) => stripKey(k) === stripKey(sub2));
    return found || sub2;
  }

  // 업로드 버튼
  function handleImportClick(e) {
    e.preventDefault();
    e.stopPropagation();

    if (guidedTutorialOpen && guidedStep === 1) {
      toast.success("[체험] 일괄 추가 버튼 위치와 진입 흐름을 확인했어요.");
      nextGuidedStep();
      return;
    }

    const ok = window.confirm(
      "⚠️ 일괄 추가\n\n- 로그를 남기지 않고 재고만 변경합니다.\n- 실행 전 '재고 Excel 내보내기'로 백업을 권장합니다.\n\n계속할까요?"
    );
    if (!ok) return;

    // 초기화 후 덮어쓰기 여부
    resetAllRef.current = window.confirm(
      "전체 재고를 완전 초기화 한 뒤 업로드 파일로 덮어쓸까요?\n아니오를 누르면 기존 재고에 합산/추가됩니다."
    );

    if (importInputRef.current) {
      importInputRef.current.value = null;
      importInputRef.current.click();
    }
  }

  const doneCount = useMemo(() => guideStepStates.filter((s) => s === "done").length, [guideStepStates]);

  function setGuideStepState(step, state) {
    setGuideStepStates((prev) => {
      const next = [...prev];
      next[step] = state;
      return next;
    });
  }

  function completeGuideStep(step, reason = "") {
    setGuideStepStates((prev) => {
      if (prev[step] === "done") return prev;
      const next = [...prev];
      next[step] = "done";
      return next;
    });
    if (reason) toast.success(reason);
  }

  function startGuideExperience(step = 0) {
    setTutorialOpen(false);
    setGuidedTutorialOpen(true);
    setGuideHubUnlocked(true);
    setGuidePanelOpen(true);
    setGuideEngaged(true);
    setGuidedStep(step);
    setGuidePendingAction(GUIDE_STEPS[step]?.completeBy || "");
    setGuideStepState(step, "waiting-action");
    setDataMenuOpen(false);
    setTimeout(() => GUIDE_STEPS[step]?.action?.(), 120);
  }

  function runGuideAction(step = guidedStep) {
    const target = GUIDE_STEPS[step];
    if (!target?.action) return;
    setGuidePendingAction(target.completeBy || "");
    if (guideStepStates[step] !== "done") setGuideStepState(step, "waiting-action");
    target.action();
  }

  function skipUnifiedGuide() {
    if (firstForcedGuide && guideEngaged) return;
    markOnboardingSeen("skipped", guideStepStates);
    // 스킵은 "자동 시작 차단"이므로 잔여 runtime 상태를 정리한다.
    saveGuideRuntime({
      ...getGuideRuntime(),
      open: false,
      panelOpen: false,
      engaged: false,
      pendingAction: "",
      guideTransitioningTo: "",
      suppressAutoActionOnce: false,
      pausedOnRoute: "",
      stepStates: guideStepStates,
    });
    clearGuideRuntime();
    setOnboardingMeta(getOnboardingState());
    setTutorialOpen(false);
    setGuidedTutorialOpen(false);
    setGuideEngaged(false);
    setGuidePanelOpen(false);
    setGuidePendingAction("");
    toast("가이드는 건너뛰었어요. 상단 '🧭 가이드' 버튼에서 언제든 다시 볼 수 있습니다.");
  }

  function nextGuidedStep() {
    if (guideStepStates[guidedStep] !== "done") {
      toast("현재 단계의 실제 동작을 먼저 완료해 주세요.");
      return;
    }
    setGuidedStep((cur) => {
      if (cur >= GUIDE_STEPS.length - 1) {
        setGuidedTutorialOpen(false);
        setGuideEngaged(false);
        setGuidePanelOpen(false);
        setDataMenuOpen(false);
        clearGuideRuntime();
        markOnboardingSeen("completed", guideStepStates);
        setOnboardingMeta(getOnboardingState());
        toast.success("체험형 온보딩 완료! 이제 운영 흐름대로 바로 사용할 수 있어요.");
        return cur;
      }
      const next = cur + 1;
      setGuidePendingAction(GUIDE_STEPS[next]?.completeBy || "");
      if (guideStepStates[next] !== "done") setGuideStepState(next, "waiting-action");
      setTimeout(() => runGuideAction(next), 140);
      return next;
    });
  }

  // 파일 업로드 후 병합
  async function onImportFileChange(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const file = ev.target.files?.[0];
    ev.target.value = "";
    setDataMenuOpen(false);
    if (!file) return;

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (!rows.length) {
        toast.error("업로드 시트가 비어있습니다.");
        return;
      }

      let applied = 0,
        added = 0,
        increased = 0,
        invalid = 0;
      const invalidSamples = [];

      // [P1-C] 업로드 적용 직전 — 인벤토리 스냅샷 백업
      createBackup(JSON.parse(JSON.stringify(inventory)));
      backupRefresh();


      setInventory((prev) => {
        const next = resetAllRef.current ? createEmptyInventory() : JSON.parse(JSON.stringify(prev));
        resetAllRef.current = false;

        for (const raw of rows) {
          const { loc, cat, sub, sub2, name, note, qty } = normalizeRow(raw);
          const cLoc = canonLocName(loc);
          const cCat = canonCatName(cat);
          const cSub = canonSubName(cCat, sub);
          const cSub2 = sub2 ? canonSub2Name(cCat, cSub, sub2) : "";

          if (!cLoc || !locations.includes(cLoc)) continue;
          if (!name || !Number.isFinite(qty)) continue;

          if (!isValidPath(cCat, cSub, cSub2)) {
            invalid++;
            if (invalidSamples.length < 5)
              invalidSamples.push(`${cat || "(빈)"}>${sub || ""}${sub2 ? ">" + sub2 : ""}`);
            continue;
          }

          const arr = ensureItems(next, cLoc, cCat, cSub, cSub2 || undefined);
          const idx = arr.findIndex((it) => String(it.name).trim() === name);
          if (idx >= 0) {
            arr[idx].count = Math.max(0, Number(arr[idx].count || 0) + Number(qty));
            if (note) arr[idx].note = note;
            increased++;
            applied++;
          } else {
            arr.push({
              name,
              count: qty > 0 ? Number(qty) : 0,
              ...(note ? { note } : {}),
            });
            added++;
            applied++;
          }
        }
        return next;
      });

      toast.success(`일괄 추가 완료: 적용 ${applied}건 (신규 ${added}, 증가 ${increased}) / 무시 ${invalid}건`);
      if (invalid) {
        console.warn("[Import skipped examples]", invalidSamples);
        toast(
          (t) => (
            <div>
              일부 행이 무시되었습니다. (총 {invalid}건)
              <div style={{ opacity: 0.8, marginTop: 4, fontSize: 12 }}>
                예시: {invalidSamples.join(" / ")}
              </div>
              <button className="btn btn-ghost" onClick={() => toast.dismiss(t.id)}>
                닫기
              </button>
            </div>
          ),
          { duration: 6000 }
        );
      }
    } catch (err) {
      console.error(err);
      toast.error(`가져오기 실패: ${err?.message || String(err)}`);
    }
  }
  
  // [P1-F] 백업 메타 주기적 갱신(선택)
  useEffect(() => {
    backupRefresh(); // 마운트 시 1회
    const t = setInterval(backupRefresh, 60 * 1000);
    return () => clearInterval(t);
  }, [backupRefresh]);
  useEffect(() => {
    setSearchVisibleCount(20);
  }, [searchTerm]);

  const applyRuntimeToHome = React.useCallback((state, rawRuntime) => {
    const runtime = normalizeGuideRuntime(rawRuntime);
    const autoStartBlocked = isGuideAutoStartBlocked(state);
    setOnboardingMeta(state);
    setFirstForcedGuide(!state.seen);
    setGuideStepStates(runtime.stepStates);
    setGuidePanelOpen(!!runtime.panelOpen);
    setGuidePendingAction(runtime.pendingAction || "open-location-card");

    if (!state.seen) {
      setTutorialOpen(true);
      setGuideHubUnlocked(!!runtime.engaged);
      setGuidedTutorialOpen(!!runtime.open);
      setGuidedStep(runtime.step || 0);
      setGuideEngaged(!!runtime.engaged);
      return;
    }

    // 스킵 후엔 자동 가이드를 완전히 막고, 수동 재오픈(상단 버튼)만 허용한다.
    if (autoStartBlocked) {
      setTutorialOpen(false);
      setGuidedTutorialOpen(false);
      setGuidePanelOpen(false);
      setGuideEngaged(false);
      if (runtime.open || runtime.pendingAction || runtime.guideTransitioningTo) {
        saveGuideRuntime({
          ...runtime,
          open: false,
          panelOpen: false,
          pendingAction: "",
          guideTransitioningTo: "",
          suppressAutoActionOnce: false,
        });
      }
      return;
    }

    if (runtime.open) {
      setGuidedTutorialOpen(true);
      setGuidedStep(runtime.step || 0);
      setGuideEngaged(!!runtime.engaged);
      setGuideHubUnlocked(true);
    }
  }, []);

  useEffect(() => {
    applyRuntimeToHome(getOnboardingState(), getGuideRuntime());
    const onGuideRuntimeUpdated = () => applyRuntimeToHome(getOnboardingState(), getGuideRuntime());
    window.addEventListener("dokkebi-guide-runtime-updated", onGuideRuntimeUpdated);
    return () => window.removeEventListener("dokkebi-guide-runtime-updated", onGuideRuntimeUpdated);
  }, [applyRuntimeToHome]);

  useEffect(() => {
    if (!guidedTutorialOpen) return;
    if (isGuideAutoStartBlocked(getOnboardingState())) return;
    const currentRuntime = getGuideRuntime();
    // 핵심 규칙: Home 복귀 시에는 가이드를 이어서 보여주되 step action 자동 재실행(= /logs 강제 점프)은 1회 차단한다.
    if (currentRuntime.suppressAutoActionOnce) {
      saveGuideRuntime({ ...currentRuntime, suppressAutoActionOnce: false, guideTransitioningTo: "" });
      return;
    }
    const target = GUIDE_STEPS[guidedStep];
    if (target?.action) target.action();
  }, [guidedTutorialOpen, guidedStep, GUIDE_STEPS, location.key]);

  useEffect(() => {
    // 앱 내 back/브라우저 back으로 Logs에서 복귀한 경우를 location.state로도 감지해 자동 점프를 차단한다.
    if (location?.state?.fromLogsGuideBack) {
      const runtime = getGuideRuntime();
      saveGuideRuntime({
        ...runtime,
        open: true,
        step: 1,
        engaged: true,
        pendingAction: "logs-filter-or-export",
        suppressAutoActionOnce: true,
        pausedOnRoute: "logs",
        guideTransitioningTo: "",
      });
    }
  }, [location]);

  useEffect(() => {
    const prev = getGuideRuntime();
    saveGuideRuntime({
      ...prev,
      open: guidedTutorialOpen,
      step: guidedStep,
      engaged: guideEngaged,
      panelOpen: guidePanelOpen,
      pendingAction: guidePendingAction,
      stepStates: guideStepStates,
    });
  }, [guidedTutorialOpen, guidedStep, guideEngaged, guidePanelOpen, guidePendingAction, guideStepStates]);

  // 동기화 인디케이터
  useEffect(() => {
    setSyncing(true);
    const t = setTimeout(() => setSyncing(false), 700);
    return () => clearTimeout(t);
  }, [inventory, logs]);

  // 데이터 메뉴 외부 클릭 닫기
  useEffect(() => {
    function onClickOutside(e) {
      if (dataMenuRef.current && !dataMenuRef.current.contains(e.target)) setDataMenuOpen(false);
    }
    if (dataMenuOpen) {
      document.addEventListener("mousedown", onClickOutside);
      document.addEventListener("touchstart", onClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("touchstart", onClickOutside);
    };
  }, [dataMenuOpen]);

  // 팝업 열릴 때 해당 카드 위치로 스크롤
  useEffect(() => {
    if (!openPanel) return;
    const key = openPanel.kind === "summary" ? "summary" : openPanel.loc;
    const el = cardRefs.current[key];
    if (el?.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [openPanel]);

  // 팝업 열릴 때 내부 details 모두 펼치기
  useEffect(() => {
    if (!openPanel) return;
    requestAnimationFrame(() => {
      document.querySelectorAll(".popup details").forEach((d) => (d.open = true));
    });
  }, [openPanel]);

  // 이름/메모 편집 메뉴 닫기
  useEffect(() => {
    const onDocClick = (e) => {
      if (e.target.closest(".item-edit") || e.target.closest(".btn-compact") || e.target.closest(".item-actions")) return;
      setEditKey(null);
    };
    const onEsc = (e) => {
      if (e.key === "Escape") setEditKey(null);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  // [P1-D] 백업에서 복구
  async function handleRestoreFromBackup() {
    const meta = hasBackup();
    if (!meta.ok) {
      toast.error(meta.reason === "만료" ? "백업이 만료되었습니다(30분 경과)." : "복구할 백업이 없습니다.");
      backupRefresh();
      return;
    }

    toast.loading("백업에서 복구 중…", { id: "bk" });
    const res = await restoreBackup(async (snapshot) => {
      // RTDB 저장은 AppWrapper의 useEffect([inventory])가 처리하므로,
      // 여기서는 상태만 되돌리면 됨.
      setInventory(JSON.parse(JSON.stringify(snapshot)));
      return { ok: true };
    });

    if (res.ok) toast.success("복구 완료! (재고를 백업 시점으로 되돌렸어요)", { id: "bk" });
    else toast.error(`복구 실패: ${res.reason || "알 수 없는 오류"}`, { id: "bk" });

    backupRefresh();
  }


  /* ===== 내보내기 ===== */
  function exportInventoryExcel() {
    const HEADER = ["장소", "상위카테고리", "하위카테고리", "최하위카테고리", "품목명", "수량", "메모"];

    const toNaNString = (v) => {
      if (v === 0 || v == null || Number.isNaN(v)) return "nan";
      return v;
    };

    // 모든 장소에서 등장하는 "경로+품목" 전체 키 집합 생성
    const allItemKeys = new Set();

    for (const loc of locations) {
      Object.entries(subcategories).forEach(([cat, subs]) => {
        if (Array.isArray(subs)) {
          subs.forEach((sub) => {
            (getItems(inventory, loc, cat, sub) || []).forEach((it) => {
              allItemKeys.add(`${cat}|||${sub}|||${""}|||${it.name}`);
            });
          });
        } else {
          Object.entries(subs).forEach(([sub, subs2]) => {
            if (Array.isArray(subs2)) {
              (getItems(inventory, loc, cat, sub) || []).forEach((it) => {
                allItemKeys.add(`${cat}|||${sub}|||${""}|||${it.name}`);
              });
            } else {
              Object.keys(subs2).forEach((sub2) => {
                (getItems(inventory, loc, cat, sub, sub2) || []).forEach((it) => {
                  allItemKeys.add(`${cat}|||${sub}|||${sub2}|||${it.name}`);
                });
              });
            }
          });
        }
      });
    }

    // 행 생성 및 품목별 합계
    const rows = [];
    const itemTotals = {}; // { [name]: { 합계: number, 장소별: { [loc]: number } } }

    const addItemTotal = (name, loc, countNum) => {
      if (!itemTotals[name]) itemTotals[name] = { 합계: 0, 장소별: {} };
      itemTotals[name].합계 += countNum || 0;
      itemTotals[name].장소별[loc] = (itemTotals[name].장소별[loc] || 0) + (countNum || 0);
    };

    const findItem = (loc, cat, sub, sub2, itemName) => {
      const arr = getItems(inventory, loc, cat, sub, sub2);
      if (!arr || !arr.length) return { count: 0, note: "" };
      const found = arr.find((x) => (x?.name || "") === itemName);
      return { count: Number(found?.count || 0), note: found?.note ?? "" };
    };

    for (const key of allItemKeys) {
      const [cat, sub, sub2, itemName] = key.split("|||");
      for (const loc of locations) {
        const { count: countNum, note } = findItem(loc, cat, sub || "", sub2 || "", itemName);
        rows.push({
          장소: loc,
          상위카테고리: cat,
          하위카테고리: sub || "",
          최하위카테고리: sub2 || "",
          품목명: itemName,
          수량: toNaNString(countNum),
          메모: note,
        });
        addItemTotal(itemName, loc, countNum);
      }
    }

    rows.sort((a, b) => {
      if (a.장소 !== b.장소) return a.장소.localeCompare(b.장소);
      if (a.상위카테고리 !== b.상위카테고리) return a.상위카테고리.localeCompare(b.상위카테고리);
      if ((a.하위카테고리 || "") !== (b.하위카테고리 || "")) return (a.하위카테고리 || "").localeCompare(b.하위카테고리 || "");
      if ((a.최하위카테고리 || "") !== (b.최하위카테고리 || "")) return (a.최하위카테고리 || "").localeCompare(b.최하위카테고리 || "");
      return a.품목명.localeCompare(b.품목명);
    });

    const ws = XLSX.utils.json_to_sheet([], { header: HEADER });
    XLSX.utils.sheet_add_aoa(ws, [HEADER], { origin: "A1" });
    XLSX.utils.sheet_add_json(ws, rows, { origin: "A2", skipHeader: true });

    // 자동 열너비
    const colWidths = HEADER.map((h) => {
      const maxLen = Math.max(
        h.length,
        ...rows.map((r) => (r[h] !== undefined && r[h] !== null ? String(r[h]).length : 0))
      );
      return { wch: Math.min(Math.max(10, maxLen + 2), 40) };
    });
    ws["!cols"] = colWidths;

    // 시트2: 품목별 합계
    const totalRows = Object.entries(itemTotals).map(([name, info]) => ({
      품목명: name,
      총합계: info.합계,
      ...info.장소별,
    }));
    const wsTotals = XLSX.utils.json_to_sheet(totalRows);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "재고현황");
    XLSX.utils.book_append_sheet(wb, wsTotals, "품목별 합계");
    XLSX.writeFile(wb, `재고현황_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /* ===== 수량 증감 ===== */
  function handleUpdateItemCount(loc, cat, sub, idx, delta, sub2) {
    if (delta === 0) return;
    const list = getItems(inventory, loc, cat, sub, sub2);
    const itemName = list[idx]?.name;
    if (!itemName) return;

    setInventory((prev) => {
      const inv = JSON.parse(JSON.stringify(prev));
      const arr = ensureItems(inv, loc, cat, sub, sub2);
      if (arr[idx]) arr[idx].count = Math.max(0, (arr[idx].count || 0) + delta);
      return inv;
    });

    const now = new Date();
    const ts = now.toISOString();
    const time = now.toLocaleString();
    const subKey = subPath(sub, sub2);
    const dir = delta > 0 ? "IN" : "OUT";
    const mergeKey = `${loc}|${cat}|${subKey}|${itemName}|${dir}`;

    const mergeIdx = logs.findIndex((l) => l.key === mergeKey && now - new Date(l.ts) < 60 * 60 * 1000);

    if (mergeIdx > -1) {
      const target = logs[mergeIdx];
      const next = [...logs];
      next[mergeIdx] = {
        ...target,
        change: (target.change || 0) + delta,
        time,
        ts,
        operatorId: userId,
        operatorName: userName,
      };
      setLogs(next);
      update(ref(`logs/${target.id}`), {
        change: next[mergeIdx].change,
        time,
        ts,
        operatorId: userId,
        operatorName: userName,
      }).catch((err) => toast.error(`로그 병합 실패: ${err?.code || err?.message || err}`));
    } else {
      const logObj = {
        key: mergeKey,
        location: loc,
        category: cat,
        subcategory: subKey,
        item: itemName,
        change: delta,
        reason: "입출고",
        time,
        ts,
        operatorId: userId,
        operatorName: userName,
      };
      setLogs((prev) => [{ id: `local-${ts}`, ...logObj }, ...prev]);
      const newRef = push(ref("logs/"));
      set(newRef, logObj).catch((err) => toast.error(`로그 기록 실패: ${err?.code || err?.message || err}`));
    }
  }

  /* ===== 이름/메모 편집 ===== */
  function handleEditItemName(loc, cat, sub, idx, sub2) {
    const list = getItems(inventory, loc, cat, sub, sub2);
    const oldName = list[idx]?.name;
    if (!oldName) return;
    const newName = prompt("새 품목명을 입력하세요:", oldName);
    if (!newName || newName === oldName) return;

    setInventory((prev) => {
      const inv = JSON.parse(JSON.stringify(prev));
      locations.forEach((L) => {
        const arr = ensureItems(inv, L, cat, sub, sub2);
        arr.forEach((it) => {
          if (it.name === oldName) it.name = newName;
        });
      });
      return inv;
    });
  }
  function handleEditItemNote(loc, cat, sub, idx, sub2) {
    setInventory((prev) => {
      const inv = JSON.parse(JSON.stringify(prev));
      const arr = ensureItems(inv, loc, cat, sub, sub2);
      if (!arr[idx]) return prev;
      const note = prompt("특이사항을 입력하세요:", arr[idx].note || "");
      if (note === null) return prev;
      arr[idx].note = note;
      return inv;
    });
  }

  /* ===== 품목 추가 ===== */
  function handleAddNewItem(loc) {
    const catKeys = Object.keys(subcategories);
    const catPick = prompt("상위 카테고리 번호 선택:\n" + catKeys.map((c, i) => `${i + 1}. ${c}`).join("\n"));
    const catIdx = Number(catPick);
    if (!Number.isInteger(catIdx) || catIdx < 1 || catIdx > catKeys.length) return toast.error("올바른 번호가 아닙니다.");
    const cat = catKeys[catIdx - 1];

    const subs = subcategories[cat];
    const subList = Array.isArray(subs) ? subs : Object.keys(subs);
    if (subList.length === 0) return toast.error("해당 카테고리는 하위 카테고리가 없습니다.");
    const subPick = prompt(`하위 카테고리 번호 선택 [${cat}]:\n` + subList.map((s, i) => `${i + 1}. ${s}`).join("\n"));
    const subIdx = Number(subPick);
    if (!Number.isInteger(subIdx) || subIdx < 1 || subIdx > subList.length) return toast.error("올바른 번호가 아닙니다.");
    const sub = subList[subIdx - 1];

    let sub2 = null;
    if (!Array.isArray(subs)) {
      const subs2Def = subs[sub];
      if (subs2Def && !Array.isArray(subs2Def)) {
        const sub2List = Object.keys(subs2Def);
        if (sub2List.length > 0) {
          const sub2Pick = prompt(`최하위 카테고리 번호 선택 [${cat} > ${sub}]:\n` + sub2List.map((s, i) => `${i + 1}. ${s}`).join("\n"));
          const sub2Idx = Number(sub2Pick);
          if (!Number.isInteger(sub2Idx) || sub2Idx < 1 || sub2Idx > sub2List.length) return toast.error("올바른 번호가 아닙니다.");
          sub2 = sub2List[sub2Idx - 1];
        }
      }
    }

    const count = Number(prompt("초기 수량 입력:"));
    if (isNaN(count) || count < 0) return toast.error("수량이 올바르지 않습니다.");

    const input = prompt("추가할 품목명을 입력하세요:");
    if (!input) return;
    const name = input.trim();

    const existsAnywhere = locations.some((L) =>
      getItems(inventory, L, cat, sub, sub2).some((it) => (it.name || "") === name)
    );
    if (existsAnywhere) return toast.error("동일한 품목명이 존재합니다");

    setInventory((prev) => {
      const inv = JSON.parse(JSON.stringify(prev));
      locations.forEach((L) => {
        const arr = ensureItems(inv, L, cat, sub, sub2);
        arr.push({ name, count: L === loc ? count : 0, note: "" });
      });
      return inv;
    });
    toast.success(`추가됨: [${cat} > ${sub}${sub2 ? " > " + sub2 : ""}] ${name} (${count}개)`);
  }

  /* ===== 전체 삭제(이름) ===== */
  function handleDeleteItem() {
    const name = prompt("삭제할 품목 이름을 입력하세요:");
    if (!name) return;

    const foundDetails = [];
    let totalCount = 0;

    locations.forEach((L) => {
      Object.keys(inventory[L] || {}).forEach((cat) => {
        Object.keys(inventory[L][cat] || {}).forEach((sub) => {
          const node = inventory[L][cat][sub];
          if (Array.isArray(node)) {
            node.forEach((item) => {
              if (item.name === name) {
                const c = item.count || 0;
                totalCount += c;
                foundDetails.push({ L, cat, sub, sub2: null, count: c });
              }
            });
          } else if (node && typeof node === "object") {
            Object.keys(node).forEach((sub2) => {
              (node[sub2] || []).forEach((item) => {
                if (item.name === name) {
                  const c = item.count || 0;
                  totalCount += c;
                  foundDetails.push({ L, cat, sub, sub2, count: c });
                }
              });
            });
          }
        });
      });
    });

    if (totalCount === 0) return toast.error("해당 품목이 존재하지 않습니다.");

    setInventory((prev) => {
      const newInv = JSON.parse(JSON.stringify(prev));
      locations.forEach((L) => {
        Object.keys(newInv[L] || {}).forEach((cat) => {
          Object.keys(newInv[L][cat] || {}).forEach((sub) => {
            const node = newInv[L][cat][sub];
            if (Array.isArray(node)) {
              newInv[L][cat][sub] = node.filter((it) => it.name !== name);
            } else if (node && typeof node === "object") {
              Object.keys(node).forEach((sub2) => {
                node[sub2] = (node[sub2] || []).filter((it) => it.name !== name);
              });
            }
          });
        });
      });
      return newInv;
    });

    const now = new Date(),
      ts = now.toISOString(),
      time = now.toLocaleString();
    const logObj = {
      key: `전체||${name}|OUT`,
      location: "전체",
      category: "삭제",
      subcategory: "",
      item: name,
      change: -totalCount,
      reason: "해당 품목은 총괄 삭제됨",
      time,
      ts,
      operatorId: userId,
      operatorName: userName,
    };
    setLogs((prev) => [{ id: `local-${ts}`, ...logObj }, ...prev]);
    const newRef = push(ref("logs/"));
    set(newRef, logObj).catch((err) => toast.error(`삭제 로그 기록 실패: ${err?.code || err?.message || err}`));

    const nonZero = foundDetails.filter((f) => f.count > 0);
    const lines = nonZero
      .slice(0, 8)
      .map(({ L, cat, sub, sub2, count }) => `• ${L} > ${cat} > ${sub}${sub2 ? " > " + sub2 : ""} : ${count}개`)
      .join("\n");
    const more = nonZero.length > 8 ? `\n외 ${nonZero.length - 8}개 경로…` : "";
    toast.success(`삭제됨: ${name}\n총 ${totalCount}개\n\n${lines}${more}`, { style: { whiteSpace: "pre-line" } });
  }

  /* ===== 검색/집계 ===== */
  const filtered = useMemo(() => {
    const q = (searchTerm || "").trim().toLowerCase();
    if (!q) return [];
    const out = [];
    Object.entries(inventory).forEach(([loc, cats]) => {
      Object.entries(cats || {}).forEach(([cat, subs]) => {
        if (Array.isArray(subs)) {
          subs.forEach((sub) => {
            const subL = (sub || "").toLowerCase();
            (getItems(inventory, loc, cat, sub) || []).forEach((i) => {
              const nameL = (i.name || "").toLowerCase();
              if (nameL.includes(q) || subL.includes(q)) out.push({ loc, cat, sub, sub2: null, ...i });
            });
          });
        } else {
          Object.entries(subs || {}).forEach(([sub, node]) => {
            const subL = (sub || "").toLowerCase();
            if (Array.isArray(node)) {
              (node || []).forEach((i) => {
                const nameL = (i.name || "").toLowerCase();
                if (nameL.includes(q) || subL.includes(q)) out.push({ loc, cat, sub, sub2: null, ...i });
              });
            } else if (node && typeof node === "object") {
              Object.entries(node).forEach(([sub2, arr]) => {
                const sub2L = (sub2 || "").toLowerCase();
                (arr || []).forEach((i) => {
                  const nameL = (i.name || "").toLowerCase();
                  if (nameL.includes(q) || subL.includes(q) || sub2L.includes(q))
                    out.push({ loc, cat, sub, sub2, ...i });
                });
              });
            }
          });
        }
      });
    });
    return out;
  }, [inventory, searchTerm]);

  const aggregated = useMemo(() => {
    const map = {};
    filtered.forEach((e) => {
      const k = `${e.cat}|${e.sub}|${e.sub2 || ""}|${e.name}`;
      if (!map[k]) map[k] = { cat: e.cat, sub: e.sub, sub2: e.sub2 || null, name: e.name, total: 0, locs: {} };
      map[k].locs[e.loc] = (map[k].locs[e.loc] || 0) + (e.count || 0);
      map[k].total += e.count || 0;
    });
    return Object.values(map).sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name)));
  }, [filtered]);
  const visibleSearchResults = useMemo(() => aggregated.slice(0, searchVisibleCount), [aggregated, searchVisibleCount]);
  const hasMoreSearchResults = aggregated.length > visibleSearchResults.length;


  function scrollToCategory(loc, cat, sub, itemName, sub2 = null) {
    Object.keys(categoryRefs.current).forEach((k) => {
      if (k.startsWith(`${loc}-`)) {
        const el = categoryRefs.current[k];
        if (el?.tagName === "DETAILS") el.open = false;
      }
    });
    const ck = `${loc}-${cat}`;
    const sk = `${loc}-${cat}-${sub}`;
    const tk = sub2 ? `${loc}-${cat}-${sub}-${sub2}` : null;
    if (categoryRefs.current[ck]) categoryRefs.current[ck].open = true;
    if (categoryRefs.current[sk]) categoryRefs.current[sk].open = true;
    if (tk && categoryRefs.current[tk]) categoryRefs.current[tk].open = true;

    setTimeout(() => {
      const ik = `${loc}-${cat}-${sub}${sub2 ? "-" + sub2 : ""}-${itemName}`;
      const el = categoryRefs.current[ik];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightKey(ik);
        window.setTimeout(() => setHighlightKey((prev) => (prev === ik ? "" : prev)), 1600);
        if (guidedTutorialOpen && guidedStep === 2) {
          completeGuideStep(2, "[가이드] 검색 결과 클릭으로 위치 이동을 확인했어요.");
        }
      }
    }, 80);
  }

  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const toggleEditMenu = (key, e) => {
    if (e) stop(e);
    setEditKey((prev) => (prev === key ? null : key));
  };

  /* ===== 카드 렌더 ===== */
  const renderItemRow = (loc, cat, sub, it, idx, sub2) => {
    const rowKey = `${loc}|${cat}|${sub2 ? `${sub}/${sub2}` : sub}|${it.name}|${idx}`;
    const open = editKey === rowKey;
    const refKey = `${loc}-${cat}-${sub}${sub2 ? `-${sub2}` : ""}-${it.name}`;
    return (
      <li
        key={`${it.name}-${idx}`}
        className={`item-row ${open ? "is-editing" : ""} ${highlightKey === refKey ? "item-row-highlight" : ""}`}
        ref={(el) => {
          if (el) categoryRefs.current[refKey] = el;
        }}
        onClick={stop}
      >
        <div className="item-text">
          <span className="item-name">
            <span className="item-title">{it.name}</span>
            <span className="item-count">({it.count}개)</span>
          </span>

          <div className="item-edit">
            <div className="edit-toolbar" onClick={stop}>
              <button
                className="btn btn-ghost btn-compact"
                onClick={(e) => {
                  stop(e);
                  handleUpdateItemCount(loc, cat, sub, idx, +1, sub2);
                }}
              >
                ➕ 입고
              </button>
              <button
                className="btn btn-ghost btn-compact"
                onClick={(e) => {
                  stop(e);
                  handleUpdateItemCount(loc, cat, sub, idx, -1, sub2);
                }}
              >
                ➖ 출고
              </button>
              <button
                className="btn btn-ghost btn-compact"
                onClick={(e) => {
                  stop(e);
                  handleEditItemName(loc, cat, sub, idx, sub2);
                }}
              >
                ✏️ 이름
              </button>
              <button
                className="btn btn-ghost btn-compact"
                onClick={(e) => {
                  stop(e);
                  handleEditItemNote(loc, cat, sub, idx, sub2);
                }}
              >
                📝 메모
              </button>
            </div>
          </div>

          {it.note && <div className="item-note">특이사항: {it.note}</div>}
        </div>

        <div className="item-actions">
          <button
            className="btn btn-secondary btn-compact"
            onClick={(e) => toggleEditMenu(rowKey, e)}
            title="이 아이템 수정"
          >
            {open ? "닫기" : "수정"}
          </button>
        </div>
      </li>
    );
  };

  const renderLocCardBody = (loc) =>
    Object.entries(subcategories).map(([cat, subs]) => (
      <details key={`${loc}-${cat}`} ref={(el) => (categoryRefs.current[`${loc}-${cat}`] = el)}>
        <summary className="summary">
          {catIcon(cat)} {cat}
        </summary>

        {Array.isArray(subs) ? (
          subs.map((sub) => (
            <details
              key={`${loc}-${cat}-${sub}`}
              ref={(el) => (categoryRefs.current[`${loc}-${cat}-${sub}`] = el)}
              className="sub-details"
            >
              <summary className="sub-summary">▸ {sub}</summary>
              <ul className="item-list">
                {getItems(inventory, loc, cat, sub).map((it, idx) => renderItemRow(loc, cat, sub, it, idx))}
              </ul>
            </details>
          ))
        ) : (
          Object.entries(subs).map(([sub, subs2]) =>
            Array.isArray(subs2) ? (
              <details
                key={`${loc}-${cat}-${sub}`}
                ref={(el) => (categoryRefs.current[`${loc}-${cat}-${sub}`] = el)}
                className="sub-details"
              >
                <summary className="sub-summary">▸ {sub}</summary>
                <ul className="item-list">
                  {getItems(inventory, loc, cat, sub).map((it, idx) => renderItemRow(loc, cat, sub, it, idx))}
                </ul>
              </details>
            ) : (
              <details
                key={`${loc}-${cat}-${sub}`}
                ref={(el) => (categoryRefs.current[`${loc}-${cat}-${sub}`] = el)}
                className="sub-details"
              >
                <summary className="sub-summary">▸ {sub}</summary>
                {Object.keys(subs2).map((sub2) => (
                  <details
                    key={`${loc}-${cat}-${sub}-${sub2}`}
                    ref={(el) => (categoryRefs.current[`${loc}-${cat}-${sub}-${sub2}`] = el)}
                    className="sub-details"
                  >
                    <summary className="sub-summary">▸ {sub2}</summary>
                    <ul className="item-list">
                      {getItems(inventory, loc, cat, sub, sub2).map((it, idx) =>
                        renderItemRow(loc, cat, sub, it, idx, sub2)
                      )}
                    </ul>
                  </details>
                ))}
              </details>
            )
          )
        )}
      </details>
    ));

  const renderSummaryCardBody = () =>
    Object.entries(subcategories).map(([cat, subs]) => (
      <details key={`전체-${cat}`} ref={(el) => (categoryRefs.current[`전체-${cat}`] = el)}>
        <summary className="summary">
          {catIcon(cat)} {cat}
        </summary>

        {Array.isArray(subs) ? (
          subs.map((sub) => (
            <details
              key={`전체-${cat}-${sub}`}
              ref={(el) => (categoryRefs.current[`전체-${cat}-${sub}`] = el)}
              className="sub-details"
            >
              <summary className="sub-summary">▸ {sub}</summary>
              <ul className="item-list">
                {Object.entries(
                  locations.reduce((acc, L) => {
                    getItems(inventory, L, cat, sub).forEach((it) => {
                      acc[it.name] = (acc[it.name] || 0) + (it.count || 0);
                    });
                    return acc;
                  }, {})
                ).map(([name, count]) => (
                  <li
                    key={`전체-${cat}-${sub}-${name}`}
                    className="item-row"
                    ref={(el) => {
                      if (el) categoryRefs.current[`전체-${cat}-${sub}-${name}`] = el;
                    }}
                    onClick={stop}
                  >
                    <div className="item-text">
                      <span className="item-name">
                        <span className="item-title">{name}</span>
                        <span className="item-count">({count}개)</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          ))
        ) : (
          Object.entries(subs).map(([sub, subs2]) =>
            Array.isArray(subs2) ? (
              <details
                key={`전체-${cat}-${sub}`}
                ref={(el) => (categoryRefs.current[`전체-${cat}-${sub}`] = el)}
                className="sub-details"
              >
                <summary className="sub-summary">▸ {sub}</summary>
                <ul className="item-list">
                  {Object.entries(
                    locations.reduce((acc, L) => {
                      getItems(inventory, L, cat, sub).forEach((it) => {
                        acc[it.name] = (acc[it.name] || 0) + (it.count || 0);
                      });
                      return acc;
                    }, {})
                  ).map(([name, count]) => (
                    <li
                      key={`전체-${cat}-${sub}-${name}`}
                      className="item-row"
                      ref={(el) => {
                        if (el) categoryRefs.current[`전체-${cat}-${sub}-${name}`] = el;
                      }}
                      onClick={stop}
                    >
                      <div className="item-text">
                        <span className="item-name">
                          <span className="item-title">{name}</span>
                          <span className="item-count">({count}개)</span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            ) : (
              <details
                key={`전체-${cat}-${sub}`}
                ref={(el) => (categoryRefs.current[`전체-${cat}-${sub}`] = el)}
                className="sub-details"
              >
                <summary className="sub-summary">▸ {sub}</summary>
                {Object.keys(subs2).map((sub2) => (
                  <details
                    key={`전체-${cat}-${sub}-${sub2}`}
                    ref={(el) => (categoryRefs.current[`전체-${cat}-${sub}-${sub2}`] = el)}
                    className="sub-details"
                  >
                    <summary className="sub-summary">▸ {sub2}</summary>
                    <ul className="item-list">
                      {Object.entries(
                        locations.reduce((acc, L) => {
                          getItems(inventory, L, cat, sub, sub2).forEach((it) => {
                            acc[it.name] = (acc[it.name] || 0) + (it.count || 0);
                          });
                          return acc;
                        }, {})
                      ).map(([name, count]) => (
                        <li
                          key={`전체-${cat}-${sub}-${sub2}-${name}`}
                          className="item-row"
                          ref={(el) => {
                            if (el) categoryRefs.current[`전체-${cat}-${sub}-${sub2}-${name}`] = el;
                          }}
                          onClick={stop}
                        >
                          <div className="item-text">
                            <span className="item-name">
                              <span className="item-title">{name}</span>
                              <span className="item-count">({count}개)</span>
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </details>
            )
          )
        )}
      </details>
    ));

  /* ===== 렌더 ===== */
  return (
    <main className="stage main">
      <FixedBg src={`${process.env.PUBLIC_URL}/DRONE_SOCCER_DOKKEBI2-Photoroom.png`} overlay="rgba(0,0,0,.18)" />
      <NeonBackdrop />
      <header className="topbar glass">
        <h1 className="logo">
          <span className="glow-dot" /> DOKKEBI<span className="thin">/</span>INVENTORY
          <button
            type="button"
            className="ver-chip"
            title={`버전: ${APP_VERSION}${isAdmin ? " (더블클릭하여 라벨 변경)" : ""}`}
            onDoubleClick={() => {
              if (!isAdmin) return;
              const next = prompt(
                "버전 표시에 사용할 라벨을 입력하세요 (예: 1.0.5):",
                localStorage.getItem("do-kkae-bi-app-version") || APP_VERSION
              );
              if (next === null) return;
              localStorage.setItem("do-kkae-bi-app-version", String(next).trim());
              window.location.hash = "#/";
              try { window.dispatchEvent(new Event("dokkebi-auth-changed")); } catch {}
            }}
          >
            v{APP_VERSION}
          </button>
        </h1>

        <div className="toolbar">
          <input
            ref={searchInputRef}
            className="search-input"
            type="text"
            placeholder="검색: 품목/하위/최하위…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 100)}
          />

          <div className="menu-wrap" ref={dataMenuRef}>
            <button
              ref={dataMenuButtonRef}
              className={`btn btn-secondary ${guidedTutorialOpen && guidedStep === 0 ? "tutorial-target-pulse" : ""}`}
              onClick={() => {
                setDataMenuOpen((v) => !v);
                if (guidedTutorialOpen && guidedStep === 4) {
                  completeGuideStep(4, "[가이드] 데이터 메뉴 위치를 확인했어요.");
                }
              }}
              aria-haspopup="menu"
              aria-expanded={dataMenuOpen}
            >
              📦 데이터
            </button>

            {dataMenuOpen && (
              <div className="menu" role="menu" onClick={(e) => e.stopPropagation()}>
                <button
                  className="menu-item"
                  onClick={() => {
                    exportInventoryExcel();
                    setDataMenuOpen(false);
                  }}
                >
                  📤 재고 Excel 내보내기
                </button>

                {isAdmin ? (
                  <button
                    ref={importMenuItemRef}
                    className={`menu-item ${guidedTutorialOpen && guidedStep === 1 ? "tutorial-target-pulse" : ""}`}
                    onClick={handleImportClick}
                    title="CSV/XLSX에서 재고를 일괄 추가합니다(로그 미생성)"
                  >
                    📥 일괄 추가
                  </button>
                ) : (
                  <button className="menu-item disabled" disabled title="관리자 전용">
                    📥 가져오기 (관리자 테스트)
                  </button>
                )}

                <input
                  ref={importInputRef}
                  type="file"
                  accept=".xlsx,.csv"
                  style={{ display: "none" }}
                  onChange={onImportFileChange}
                />
                    {/* [P1-E] 30분 내 백업 되돌리기 */}
                  <button
                    className={`menu-item${backupMeta.ok ? "" : " disabled"}`}
                    onClick={() => {
                      if (!backupMeta.ok) return;
                      handleRestoreFromBackup();
                      setDataMenuOpen(false);
                    }}
                    disabled={!backupMeta.ok}
                    title={backupMeta.ok ? `백업: ${describeBackup()}` : "최근 30분 내 백업 없음"}
                  >
                    ⏪ 30분 내 백업 되돌리기 {backupMeta.ok ? `(${describeBackup()})` : "(없음)"}
                  </button>
              </div>
            )}
          </div>

          <button ref={logsNavButtonRef} className="btn btn-secondary" onClick={() => navigate("/logs")}>
            📘 기록
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              // 수동 재오픈은 skip 차단을 해제하는 유일한 진입점이다.
              markOnboardingReopened();
              setOnboardingMeta(getOnboardingState());
              setFirstForcedGuide(false);
              setGuideEngaged(false);
              setGuideHubUnlocked(true);
              setTutorialOpen(true);
              setGuidedTutorialOpen(false);
              setGuidePanelOpen(false);
              setGuidePendingAction("");
              saveGuideRuntime({ ...getGuideRuntime(), open: false, panelOpen: false, pendingAction: "", guideTransitioningTo: "" });
            }}
          >
            🧭 가이드 {onboardingMeta.seen ? (onboardingMeta.status === "completed" ? "(완료)" : onboardingMeta.status === "skipped" ? "(스킵됨)" : "(재오픈)") : "(필수 1회)"}
          </button>

          {(isAdmin || (userId && userName)) && (
            <button className="btn btn-ghost" onClick={() => hardLogout()}>
              🚪 로그아웃
            </button>
          )}
        </div>
      </header>

      {syncing && (
        <div className="sync-indicator">
          <span className="spinner" /> 실시간 동기화…
        </div>
      )}

      {/* 검색 결과 */}
      {searchTerm && (
        <section className="panel glass lift-in">
          <h3 className="panel-title">🔍 검색 결과</h3>
          {aggregated.length === 0 ? (
            <p className="muted">검색된 결과가 없습니다.</p>
          ) : (
            <>
              <ul className="result-list">
                {visibleSearchResults.map((e, i) => (
                  <li key={i} className="result-item">
                    <div
                      className="result-name link"
                      onClick={() => scrollToCategory("전체", e.cat, e.sub, e.name, e.sub2)}
                    >
                      [{e.cat} &gt; {e.sub}
                      {e.sub2 ? ` > ${e.sub2}` : ""}] {e.name} <span className="chip">{e.total}개</span>
                    </div>
                    <div className="result-locs">
                      {locations.map((L) => (
                        <button
                          key={L}
                          className="link pill"
                          onClick={() => scrollToCategory(L, e.cat, e.sub, e.name, e.sub2)}
                          title={`${L}로 이동`}
                        >
                          {L}: {e.locs[L] || 0}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="right result-actions">
                {hasMoreSearchResults && (
                  <button className="btn btn-secondary" onClick={() => setSearchVisibleCount((n) => n + 20)}>
                    +더보기 ({visibleSearchResults.length}/{aggregated.length})
                  </button>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    const txt = aggregated
                      .map(
                        (e) =>
                          `[${e.cat}>${e.sub}${e.sub2 ? ">" + e.sub2 : ""}] ${e.name} (총 ${e.total}개) ` +
                          locations.map((L) => `${L}:${e.locs[L] || 0}`).join(" / ")
                      )
                      .join("\n");
                    navigator.clipboard.writeText(txt);
                    toast.success("복사되었습니다");
                  }}
                >
                  📋 전체 복사
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* 카드 그리드 (장소 3 + 전체 1 = 2×2 배열) */}
      <section className="grid summary-grid">
        {locations.map((loc) => (
          <div key={loc} className="card glass hover-rise" ref={(el) => (cardRefs.current[loc] = el)}>
            <div className="card-head head-split">
              <button
                type="button"
                className="head-zoom"
                onClick={() => {
                  setOpenPanel({ kind: "loc", loc });
                  if (guidedTutorialOpen && guidedStep === 0) {
                    completeGuideStep(0, "[가이드] 재고 구조 첫 체험을 완료했어요.");
                  }
                }}
                title="확대보기"
                aria-label={`${loc} 확대보기`}
              >
                <h2 className="card-title">{loc}</h2>
                <span className="head-hint">확대보기</span>
              </button>
              <div className="head-actions">
                <button
                  className="btn btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddNewItem(loc);
                  }}
                >
                  +추가
                </button>
              </div>
            </div>
            <div className="card-body">{renderLocCardBody(loc)}</div>
          </div>
        ))}

        {/* 전체 카드 (요약) */}
        <div className="card glass hover-rise card--summary" ref={(el) => (cardRefs.current["summary"] = el)}>
          <div className="card-head head-split">
            <button
              type="button"
              className="head-zoom"
              onClick={() => {
                setOpenPanel({ kind: "summary" });
                if (guidedTutorialOpen && guidedStep === 0) {
                  completeGuideStep(0, "[가이드] 재고 구조 첫 체험을 완료했어요.");
                }
              }}
              title="전체 확대보기"
              aria-label="전체 확대보기"
            >
              <h2 className="card-title">전체</h2>
              <span className="head-hint">확대보기</span>
            </button>
            <div className="head-actions">
              <button
                className="btn btn-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteItem();
                }}
              >
                /삭제
              </button>
            </div>
          </div>
          <div className="card-body">{renderSummaryCardBody()}</div>
        </div>
      </section>

      {/* 확대보기 팝업 */}
      {openPanel && (
        <div className="overlay" onClick={() => setOpenPanel(null)}>
          <div className="popup glass neon-rise" onClick={(e) => e.stopPropagation()}>
            <div className="popup-head">
              <h3 className="popup-title">
                {openPanel.kind === "summary" ? "전체 (확대 보기)" : `${openPanel.loc} (확대 보기)`}
              </h3>
              <button className="btn btn-ghost" onClick={() => setOpenPanel(null)}>
                닫기
              </button>
            </div>

            <div className="popup-body">
              {openPanel.kind === "summary" ? renderSummaryCardBody() : renderLocCardBody(openPanel.loc)}
            </div>
          </div>
        </div>
      )}

      {tutorialOpen && (
        <div className="overlay" onClick={() => setTutorialOpen(false)}>
          <div className="popup glass neon-rise tutorial-popup" onClick={(e) => e.stopPropagation()}>
            <div className="popup-head">
              <h3 className="popup-title">v1.6.0-beta.5 실전 체험 가이드 허브</h3>
              {(guideHubUnlocked || !firstForcedGuide) && (
                <button className="btn btn-ghost" onClick={() => setTutorialOpen(false)}>닫기</button>
              )}
            </div>
            <div className="popup-body">
              <p className="muted">총 6단계를 실제 UI 동작으로 체험합니다. 완료 조건을 충족해야 다음 단계로 진행됩니다.</p>
              {GUIDE_STEPS.map((step, idx) => (
                <button
                  key={step.title}
                  type="button"
                  className={`tutorial-step ${guidedStep === idx ? "is-active" : ""}`}
                  onClick={() => {
                    setGuideHubUnlocked(true);
                    startGuideExperience(idx);
                  }}
                >
                  <span className="tutorial-bullet">{guideStepStates[idx] === "done" ? "✅" : guidedStep === idx ? "👉" : "◯"}</span>
                  <span>
                    <strong>{step.title}</strong>
                    <small>{step.todo}</small>
                  </span>
                </button>
              ))}

              <div className="tutorial-import-detail">
                <strong>첫 진입은 체험형 흐름(강제 유도)입니다.</strong>
                <ul>
                  <li>단계마다 해당 화면 위치로 자동 이동하거나, 관련 페이지로 이동합니다.</li>
                  <li>완료 상태 / 스킵 상태 / 재오픈 상태를 각각 저장합니다.</li>
                  <li>재오픈 시에는 원하는 단계만 골라 빠르게 복습할 수 있습니다.</li>
                </ul>
                <div className="tutorial-actions">
                  <button className="btn btn-secondary" type="button" onClick={() => startGuideExperience(guidedStep || 0)}>
                    🎮 기능 버튼 직접 체험 시작
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={skipUnifiedGuide} disabled={!(!firstForcedGuide || !guideEngaged)}>
                    이번만 스킵
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {(guidedTutorialOpen || guidePanelOpen) && (
        <aside className="guide-checklist-panel" aria-label="실전 체험 체크리스트">
          <div className="guide-checklist-head">
            <strong>체크리스트</strong>
            <button className="btn btn-ghost btn-compact" onClick={() => setGuidePanelOpen((v) => !v)}>
              {guidePanelOpen ? "접기" : "펼치기"}
            </button>
          </div>
          {guidePanelOpen && (
            <ul>
              {GUIDE_STEPS.map((step, idx) => (
                <li key={`panel-${step.title}`}>
                  <button
                    type="button"
                    className={`guide-check-item ${guidedStep === idx ? "is-current" : ""}`}
                    onClick={() => {
                      setGuideHubUnlocked(true);
                      setGuidedTutorialOpen(true);
                      setGuidedStep(idx);
                      runGuideAction(idx);
                    }}
                  >
                    <span>{guideStepStates[idx] === "done" ? "✅" : guideStepStates[idx] === "waiting-action" ? "🟡" : "⚪"}</span>
                    <span>{step.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}

      {guidedTutorialOpen && (
        <div className="guided-coach" role="status" aria-live="polite">
          <div className="guided-coach-title">🎯 실전 체험 가이드 {guidedStep + 1}/{GUIDE_STEPS.length}</div>
          <p><strong>{GUIDE_STEPS[guidedStep]?.title}</strong></p>
          <p>{GUIDE_STEPS[guidedStep]?.todo}</p>
          <p className="muted small">진행률: {doneCount}/{GUIDE_STEPS.length} 완료</p>
          {guidedStep === 5 && (
            <ul>
              <li>모바일 스크롤: 카드 내부보다 페이지 스크롤이 먼저 동작하는지 확인</li>
              <li>로그 필터 접힘: 기록 리스트 스크롤 시 필터가 자동 축소되는지 확인</li>
              <li>하단 가이드/알림: 서로 겹치지 않고 버튼이 눌리는지 확인</li>
            </ul>
          )}
          <div className="tutorial-actions">
            <button className="btn btn-secondary" onClick={() => runGuideAction(guidedStep)}>
              {GUIDE_STEPS[guidedStep]?.actionLabel || "위치로 이동"}
            </button>
            {guidedStep === 5 && (
              <button className="btn btn-secondary" onClick={() => completeGuideStep(5, "[가이드] 마지막 운영 체크포인트를 확인했어요.")}>체크 확인</button>
            )}
            {guidedStep === 3 && (
              <button className="btn btn-secondary" onClick={() => completeGuideStep(3, "[가이드] 권한/자동 로그아웃 정책 확인 완료")}>권한 체크 완료</button>
            )}
            <button className="btn btn-primary" onClick={nextGuidedStep}>
              {guidedStep >= GUIDE_STEPS.length - 1 ? "체험 완료" : "다음 단계"}
            </button>
            {(guideHubUnlocked || !firstForcedGuide) && (
              <button className="btn btn-ghost" onClick={() => setGuidedTutorialOpen(false)}>
                닫기
              </button>
            )}
          </div>
        </div>
      )}


      <footer className="site-footer">
        <p>
          © 강원도립대 드론융합과 24학번 최석민 - 드론축구단 재고·입출고 관리 콘솔
          <br />
          문의: <a href="mailto:gwdokkebinv@gmail.com">gwdokkebinv@gmail.com</a>
          <br />
          <span className="muted small">빌드 정보: {APP_BUILD_INFO}</span>
        </p>
      </footer>
    </main>
  );
}

/* =========================
   6) 기록 페이지
   ========================= */
function LogsPage({ logs, setLogs }) {
  const [syncing, setSyncing] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [filterDate, setFilterDate] = useState("");
  const [dateFocused, setDateFocused] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [itemKeyword, setItemKeyword] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [visibleLogsCount, setVisibleLogsCount] = useState(500);
  const [userFilterExpanded, setUserFilterExpanded] = useState(true);
  const [autoCollapsed, setAutoCollapsed] = useState(false);
  const autoCollapsePauseUntilRef = useRef(0);
  const menuRef = useRef(null);

  const onboardingState = getOnboardingState();
  const [runtime, setRuntime] = useState(() => normalizeGuideRuntime(getGuideRuntime()));
  const persistRuntime = React.useCallback((updater) => {
    setRuntime((prev) => {
      const candidate = typeof updater === "function" ? updater(prev) : updater;
      const next = normalizeGuideRuntime(candidate);
      saveGuideRuntime(next);
      return next;
    });
  }, []);
  const logsGuideOpen = !!runtime?.open && runtime?.step === 1;
  const firstForcedGuideInLogs = !onboardingState.seen;

  const completeLogsGuideStep = React.useCallback((reason = "") => {
    // step 2 완료 기준(beta.5): 필터 "위치 확인" 스크롤은 제외하고,
    // 실제 조작(필터 토글 / 내보내기 메뉴 열기 / CSV·Excel 실행)만 완료로 인정한다.
    if (!(runtime?.open && runtime?.step === 1)) return;
    const alreadyDone = runtime?.stepStates?.[1] === "done";
    const safeStates = Array.from({ length: GUIDE_STEP_COUNT }, (_, idx) => runtime?.stepStates?.[idx] || "idle");
    safeStates[1] = "done";
    persistRuntime((prev) => ({ ...prev, stepStates: safeStates, pendingAction: "" }));
    if (!alreadyDone && reason) toast.success(reason);
  }, [runtime, persistRuntime]);

  useEffect(() => {
    // Logs는 Router prop snapshot 대신 session runtime을 직접 구독해 stale guide 상태를 피한다.
    const reloadRuntime = () => setRuntime(normalizeGuideRuntime(getGuideRuntime()));
    reloadRuntime();
    window.addEventListener("dokkebi-guide-runtime-updated", reloadRuntime);
    return () => window.removeEventListener("dokkebi-guide-runtime-updated", reloadRuntime);
  }, []);

  useEffect(() => {
    // 스킵 상태에선 runtime 잔여값이 있어도 Logs 자동 코치를 띄우지 않는다.
    if (isGuideAutoStartBlocked(onboardingState)) {
      if (runtime.open || runtime.pendingAction || runtime.guideTransitioningTo) {
        persistRuntime((prev) => ({
          ...prev,
          open: false,
          panelOpen: false,
          pendingAction: "",
          guideTransitioningTo: "",
          suppressAutoActionOnce: false,
        }));
      }
      return;
    }
    // guide에 의해 진입한 경우(또는 step 1 runtime) 팝업을 강제로 보장한다.
    if (location?.state?.fromGuide || (runtime.open && runtime.step === 1)) {
      persistRuntime((prev) => ({
        ...prev,
        open: true,
        step: 1,
        engaged: true,
        pendingAction: "logs-filter-or-export",
        guideTransitioningTo: "",
        sourceRoute: prev?.sourceRoute || "/",
        returnRoute: prev?.returnRoute || "/",
      }));
      setUserFilterExpanded(true);
      setAutoCollapsed(false);
    }
  }, [location?.state, onboardingState, runtime.open, runtime.step, runtime.pendingAction, runtime.guideTransitioningTo, persistRuntime]);

  const isMobileLike = () => window.matchMedia("(max-width: 1100px)").matches;

  // 가이드 2단계(로그 페이지 핵심) 진입 시 필터를 자동으로 펼쳐 체험 끊김을 줄입니다.
  useEffect(() => {
    if (!runtime?.open || runtime?.step !== 1) return;
    setUserFilterExpanded(true);
    setAutoCollapsed(false);
  }, [runtime]);

  useEffect(() => saveLocalLogs(logs), [logs]);

  useEffect(() => {
    setSyncing(true);
    const t = setTimeout(() => setSyncing(false), 700);
    return () => clearTimeout(t);
  }, [logs]);

  const sorted = useMemo(() => [...logs].sort((a, b) => new Date(b.ts) - new Date(a.ts)), [logs]);

  const filteredList = useMemo(() => {
    let list = sorted;
    if (filterDate) list = list.filter((l) => l.ts.slice(0, 10) === filterDate);
    if (locationFilter) list = list.filter((l) => l.location === locationFilter);
    if (itemKeyword.trim()) {
      const q = itemKeyword.trim().toLowerCase();
      list = list.filter((l) => (l.item || "").toLowerCase().includes(q));
    }
    return list;
  }, [sorted, filterDate, locationFilter, itemKeyword]);
  const visibleLogs = useMemo(() => filteredList.slice(0, visibleLogsCount), [filteredList, visibleLogsCount]);

  const grouped = useMemo(
    () =>
      visibleLogs.reduce((acc, l) => {
        const day = l.ts.slice(0, 10);
        (acc[day] = acc[day] || []).push(l);
        return acc;
      }, {}),
    [visibleLogs]
  );
  const dates = useMemo(() => Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a)), [grouped]);

  useEffect(() => {
    setVisibleLogsCount(500);
  }, [filterDate, itemKeyword, locationFilter, logs]);

  const filterExpanded = userFilterExpanded;
  const mobileFilterCollapsed = isMobileLike() && !userFilterExpanded;

  useEffect(() => {
    if (!isMobileLike()) {
      setAutoCollapsed(false);
      setUserFilterExpanded(true);
      return;
    }
    let lastTop = window.scrollY || 0;
    const onScroll = () => {
      const top = window.scrollY || 0;
      const down = top > lastTop + 16;
      lastTop = top;

      // 자동 접힘은 사용자 수동 펼침 의도를 덮어쓰지 않도록 일정 시간 쿨다운을 둡니다.
      if (Date.now() < autoCollapsePauseUntilRef.current) return;
      if (down && top > 170 && !autoCollapsed && userFilterExpanded) {
        setAutoCollapsed(true);
        setUserFilterExpanded(false);
      }
    };

    const onResize = () => {
      if (!isMobileLike()) {
        setAutoCollapsed(false);
        setUserFilterExpanded(true);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [autoCollapsed, userFilterExpanded]);

  const toggleFilters = () => {
    setUserFilterExpanded((prev) => {
      const next = !prev;
      if (next) {
        autoCollapsePauseUntilRef.current = Date.now() + 4000;
        setAutoCollapsed(false);
      }
      return next;
    });

    completeLogsGuideStep("[가이드] 로그 필터 펼침/접기 조작을 확인했어요.");
  };
  function formatLabel(d) {
    const diff = Math.floor((new Date() - new Date(d)) / (1000 * 60 * 60 * 24));
    return diff === 0 ? "오늘" : diff === 1 ? "어제" : d;
  }

  function editReason(i) {
    if (!logs[i]?.id) {
      toast.error("동기화 중입니다. 잠시 후 다시 시도하세요.");
      return;
    }
    const note = prompt("메모:", logs[i].reason || "");
    if (note === null) return;

    const id = logs[i].id;
    const next = [...logs];
    next[i].reason = note;
    setLogs(next);
    update(ref(`logs/${id}`), { reason: note })
      .then(() => toast.success("메모 저장됨"))
      .catch((err) => toast.error(`클라우드 동기화 실패: ${err?.code || err?.message || err}`));
  }

  function deleteLog(i) {
    if (!logs[i]?.id) {
      toast.error("동기화 중입니다. 잠시 후 다시 시도하세요.");
      return;
    }
    if (!window.confirm("삭제하시겠습니까?")) return;

    const id = logs[i].id;
    setLogs((prev) => prev.filter((_, j) => j !== i));
    remove(ref(`logs/${id}`))
      .then(() => toast.success("로그 삭제됨"))
      .catch((err) => toast.error(`클라우드 동기화 실패: ${err?.code || err?.message || err}`));
  }

  function exportCSV() {
    const data = filteredList.map((l) => ({
      시간: l.time,
      ID: l.operatorId || "",
      이름: l.operatorName || "",
      장소: l.location,
      상위카테고리: l.category,
      하위카테고리: l.subcategory,
      품목: l.item,
      증감: l.change,
      메모: l.reason,
    }));
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(data));
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "기록.csv";
    a.click();
  }
  const handleGuideAwareBack = React.useCallback((cause = "in-app") => {
    if (runtime?.open && runtime?.step === 1) {
      // Logs step1에서 홈으로 복귀할 때는 '일시중단 상태 + auto action 1회 억제'를 먼저 저장해 라우팅 루프를 차단한다.
      persistRuntime((prev) => ({
        ...prev,
        open: true,
        step: 1,
        engaged: true,
        pendingAction: "logs-filter-or-export",
        pausedOnRoute: "logs",
        suppressAutoActionOnce: true,
        guideTransitioningTo: "home",
      }));
      navigate("/", { state: { fromLogsGuideBack: true, cause } });
      return;
    }
    navigate(-1);
  }, [runtime, persistRuntime, navigate]);

  useEffect(() => {
    const onPopState = () => {
      const current = getGuideRuntime();
      if (current.open && current.step === 1) {
        saveGuideRuntime({
          ...current,
          pausedOnRoute: "logs",
          suppressAutoActionOnce: true,
          guideTransitioningTo: "home",
        });
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function exportExcel() {
    const data = filteredList.map((l) => ({
      시간: l.time,
      ID: l.operatorId || "",
      이름: l.operatorName || "",
      장소: l.location,
      상위카테고리: l.category,
      하위카테고리: l.subcategory,
      품목: l.item,
      증감: l.change,
      메모: l.reason,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Logs");
    XLSX.writeFile(wb, "기록.xlsx");
  }

  return (
    <main className="stage main">
      <FixedBg src={`${process.env.PUBLIC_URL}/DRONE_SOCCER_DOKKEBI2-Photoroom.png`} overlay="rgba(0,0,0,.22)" />
      <NeonBackdrop />

      <header className="topbar glass">
        <button className="btn btn-ghost" onClick={() => handleGuideAwareBack("in-app")}>
          ← 돌아가기
        </button>
        <h1 className="logo">📘입출고 기록</h1>

        <div className={`toolbar toolbar-logs ${mobileFilterCollapsed ? "toolbar-collapsed" : ""} ${filterExpanded ? "toolbar-expanded" : ""}`}>
          <button
            className="btn btn-ghost toolbar-toggle"
            onClick={toggleFilters}
            aria-expanded={filterExpanded}
          >
            {filterExpanded ? "필터 접기 ▲" : "필터 펼치기 ▼"}
          </button>
          <input
            className="search-input"
            type="text"
            value={itemKeyword}
            onChange={(e) => setItemKeyword(e.target.value)}
            placeholder="품목 검색 (부분 일치)"
          />
          <select
            className="search-input"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            aria-label="장소 필터"
          >
            <option value="">전체 장소</option>
            {locations.map((L) => (
              <option key={L} value={L}>
                {L}
              </option>
            ))}
          </select>
          <input
            type={dateFocused || filterDate ? "date" : "text"}
            value={filterDate}
            onFocus={() => setDateFocused(true)}
            onBlur={() => setDateFocused(false)}
            onChange={(e) => setFilterDate(e.target.value)}
            placeholder="날짜 필터"
            inputMode="none"
            className="search-input"
          />

          <button
            className="btn btn-secondary"
            onClick={() => {
              setFilterDate("");
              setItemKeyword("");
              setLocationFilter("");
            }}
          >
            필터 해제
          </button>

          <div className="menu-wrap" ref={menuRef}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setExportOpen((v) => !v);
                completeLogsGuideStep("[가이드] 내보내기 메뉴 열기를 확인했어요.");
              }}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
            >
              ⬇ 내보내기
            </button>
            {exportOpen && (
              <div className="menu menu-logs" role="menu">
                <button
                  className="menu-item"
                  onClick={() => {
                    exportCSV();
                    setExportOpen(false);
                    completeLogsGuideStep("[가이드] CSV 내보내기 실행을 확인했어요.");
                  }}
                >
                  📄 CSV 내보내기
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    exportExcel();
                    setExportOpen(false);
                    completeLogsGuideStep("[가이드] Excel 내보내기 실행을 확인했어요.");
                  }}
                >
                  📑 Excel 내보내기
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {syncing && (
        <div className="sync-indicator">
          <span className="spinner" /> 실시간 동기화…
        </div>
      )}

      {dates.length === 0 ? (
        <section className="panel glass lift-in">
          <p className="muted">기록이 없습니다.</p>
        </section>
      ) : (
        <>
          {dates.map((d) => (
            <section key={d} className="panel glass lift-in">
              <h2 className="panel-title">{formatLabel(d)}</h2>
              <ul className="log-list">
                {grouped[d].map((l, i) => {
                  const idx = logs.findIndex((x) => x.ts === l.ts && x.key === l.key);
                  return (
                    <li key={`${l.id || "local"}-${i}`} className="log-row">
                      <div className="log-text">
                        <div className="log-line">
                          <span className="time">[{l.time}]</span> {l.location} &gt; {l.category} &gt; {l.subcategory} /{" "}
                          <strong>{l.item}</strong>
                        </div>
                        <div className={l.change > 0 ? "mark in" : "mark out"}>
                          {l.change > 0 ? `입고 +${l.change}` : `출고 -${-l.change}`}
                        </div>
                        <div className="muted small">
                          👤 {l.operatorId ? `[${l.operatorId}]` : ""} {l.operatorName || ""}
                        </div>
                        {l.reason && <div className="log-note">메모: {l.reason}</div>}
                      </div>
                      <div className="log-actions">
                        <button className="btn btn-ghost" onClick={() => editReason(idx)}>
                          {l.reason ? "메모 수정" : "메모 추가"}
                        </button>
                        <button className="btn btn-danger" onClick={() => deleteLog(idx)}>
                          삭제
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {filteredList.length > visibleLogs.length && (
            <section className="panel glass lift-in right">
              <button className="btn btn-secondary" onClick={() => setVisibleLogsCount((n) => n + 500)}>
                +더보기 ({visibleLogs.length}/{filteredList.length})
              </button>
            </section>
          )}
        </>
      )}

      {logsGuideOpen && (
        <div className="guided-coach" role="status" aria-live="polite">
          <div className="guided-coach-title">🎯 실전 체험 가이드 2/6</div>
          <p><strong>2) 로그 페이지 핵심</strong></p>
          <p>필터 위치 확인 버튼은 안내 전용입니다. 필터 펼침/접기 또는 내보내기 메뉴·실행 1회가 완료 조건입니다.</p>
          <div className="tutorial-actions">
            <button className="btn btn-secondary" onClick={() => { setUserFilterExpanded(true); setAutoCollapsed(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              필터 위치 확인
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (runtime?.stepStates?.[1] !== "done") {
                  toast("필터 토글 또는 내보내기를 먼저 1회 실행해 주세요.");
                  return;
                }
                persistRuntime((prev) => ({ ...prev, open: true, step: 2, engaged: true, pendingAction: "search-result-click", suppressAutoActionOnce: false, pausedOnRoute: "", guideTransitioningTo: "home" }));
                navigate("/");
              }}
            >
              다음 단계
            </button>
            {(!firstForcedGuideInLogs || runtime?.engaged) && (
              <button className="btn btn-ghost" onClick={() => { persistRuntime((prev) => ({ ...prev, open: false, step: 1, engaged: prev?.engaged })); }}>
                닫기
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

/* =========================
   7) AppWrapper (실시간 동기화)
   ========================= */
export default function AppWrapper() {
  // 0) 새 기기 부트 게이트
  const [isFreshDevice, setIsFreshDevice] = useState(() => localStorage.getItem("do-kkae-bi-has-synced") !== "true");
  const [bootSynced, setBootSynced] = useState(false);
  const [fallbackFired, setFallbackFired] = useState(false);

  // 1) 재고/검색/로그 상태 (⚠️ 반드시 최상단에 선언해서 아래에서 참조 가능하게!)
  const [inventory, setInventory] = useState(getLocalInventory);
  const [searchTerm, setSearchTerm] = useState("");
  const [logs, setLogs] = useState(getLocalLogs);

  // 2) 부트 플래그 & 헬퍼
  const bootRef = useRef({ inv: false, logs: false, fired: false });

  const fireReadyOnce = () => {
    if (bootRef.current.fired) return;
    bootRef.current.fired = true;
    try {
      window.dispatchEvent(new Event("dokkebi-ready"));
    } catch {}
  };

  // [v1.6.0-beta] 부트 동기화 완료를 단일 함수로 처리해 스플래시/부트 로딩 충돌을 방지합니다.
  const markBootSyncDone = React.useCallback((reason = "ready") => {
    setBootSynced((prev) => {
      if (prev) return prev;
      try {
        localStorage.setItem("do-kkae-bi-has-synced", "true");
        localStorage.setItem("do-kkae-bi-last-sync-ts", String(Date.now()));
      } catch {}
      if (process.env.NODE_ENV !== "production") {
        console.info(`[boot] sync completed (${reason})`);
      }
      fireReadyOnce();
      return true;
    });
  }, []);

  // 3) 지연 폴백 (12초): 새 기기 + 아직 부트 미완료면 임시 통과
  useEffect(() => {
    if (!isFreshDevice || bootSynced) return;
    const t = setTimeout(() => {
      setFallbackFired(true);
      markBootSyncDone("fallback");      // 화면은 열어주되, 부트 완료 경로를 단일화
      // 실제 두 스냅샷이 나중에라도 들어오면 onValue 쪽에서 정상 완료 처리됨
    }, BOOT_FALLBACK_FLAG_MS);
    return () => clearTimeout(t);
  }, [isFreshDevice, bootSynced, markBootSyncDone]);

  // 4) 부트 완료 후 fresh 플래그 해제
  useEffect(() => {
    if (bootSynced && isFreshDevice) setIsFreshDevice(false);
  }, [bootSynced, isFreshDevice]);

  // 🔄 auth 변경 시 재렌더 트리거
  const [, setAuthTick] = useState(0);
  useEffect(() => {
    const onAuth = () => setAuthTick((v) => v + 1);
    window.addEventListener("dokkebi-auth-changed", onAuth);
    window.addEventListener("storage", onAuth);
    return () => {
      window.removeEventListener("dokkebi-auth-changed", onAuth);
      window.removeEventListener("storage", onAuth);
    };
  }, []);

  // 매 렌더마다 최신 스토리지 값을 읽음 (authTick 변화로 재계산)
  const isAdmin = getLocalAdmin();
  const userId = getLocalUserId();
  const userName = getLocalUserName();
  const isLoggedIn = !!(isAdmin || (userId && userName));

  // RTDB 적용 플래그/스냅샷 보관
  const applyingCloudRef = useRef({ inv: false, logs: false });
  const invStateRef = useRef(inventory);
  const logsStateRef = useRef(logs);

  // ✅ 스플래시 폴백 타이머 ref
  const splashTimeoutRef = useRef(null);

  // 앱 부팅: 버전 라벨 갱신(스플래시 닫기는 부트 완료 시점으로 일원화)
  useEffect(() => {
    try {
      const envV = process.env.REACT_APP_VERSION || "dev";
      const cur = localStorage.getItem("do-kkae-bi-app-version") || "";
      const parse = (v) => String(v).split(".").map((n) => parseInt(n, 10) || 0);
      const older = (() => {
        if (!cur) return true;
        const [a1, a2, a3] = parse(cur);
        const [b1, b2, b3] = parse(envV);
        if (a1 !== b1) return a1 < b1;
        if (a2 !== b2) return a2 < b2;
        return a3 < b3;
      })();
      if (older) localStorage.setItem("do-kkae-bi-app-version", envV);
      window.dispatchEvent(new CustomEvent("dokkaebi-version", { detail: envV }));
    } catch {}
  }, []);

  // 마운트 시 세션 타임아웃 검증(10분)
  useEffect(() => {
    const ts = Number(localStorage.getItem("do-kkae-bi-login-ts") || 0);
    const LIMIT = 10 * 60 * 1000;
    if (ts && Date.now() - ts > LIMIT) {
      hardLogout();
    }
  }, []);

  // 클라우드 → 로컬 동기화
  useEffect(() => {
    const invRefFB = ref("inventory/");
    const logRefFB = ref("logs/");

    const unsubInv = onValue(invRefFB, (snap) => {
      if (!snap.exists()) return;
      const cloud = snap.val();
      if (JSON.stringify(cloud) !== JSON.stringify(invStateRef.current)) {
        applyingCloudRef.current.inv = true;
        setInventory(cloud);
      }
      if (!bootRef.current.inv) {
        bootRef.current.inv = true;     // 첫 인벤토리 스냅샷 도착
       // ✅ 부트 완료 체크: 인벤토리+로그 모두 수신되면 부트 완료
       if (bootRef.current.logs && !bootSynced) {
         markBootSyncDone("inventory+logs");
       }
      }
    });

    const unsubLogs = onValue(logRefFB, (snap) => {
      if (!snap.exists()) return;
      const normalized = normalizeLogsVal(snap.val()).sort((a, b) => new Date(b.ts) - new Date(a.ts));
      if (JSON.stringify(normalized) !== JSON.stringify(logsStateRef.current)) {
        applyingCloudRef.current.logs = true;
        setLogs(normalized);
      }
      if (!bootRef.current.logs) {
        bootRef.current.logs = true;    // 첫 로그 스냅샷 도착
       // ✅ 부트 완료 체크: 인벤토리+로그 모두 수신되면 부트 완료
       if (bootRef.current.inv && !bootSynced) {
         markBootSyncDone("logs+inventory");
       }
      }
    });

    return () => {
      unsubInv();
      unsubLogs();
    };
  }, [bootSynced, markBootSyncDone]);

  // RTDB 지연 대비 (8초) 스플래시 강제 닫기
  useEffect(() => {
   splashTimeoutRef.current = setTimeout(() => {
     markBootSyncDone("force-hide");
    }, BOOT_FORCE_HIDE_MS);
     return () => {
       if (splashTimeoutRef.current) {
         clearTimeout(splashTimeoutRef.current);
         splashTimeoutRef.current = null;
       }
     };
   }, [markBootSyncDone]);

  // 스플래시: ready 이벤트 수신 시 닫기 (+ 폴백 타이머 취소)
  useEffect(() => {
    const el = document.getElementById("app-splash");
    if (!el) return;
    const onReady = () => {
      el.classList.add("hide");
      setTimeout(() => el.remove(), 400);
      if (splashTimeoutRef.current) {
        clearTimeout(splashTimeoutRef.current);
        splashTimeoutRef.current = null;
      }
    };
    window.addEventListener("dokkebi-ready", onReady);
    return () => window.removeEventListener("dokkebi-ready", onReady);
  }, []);

  // 최신 스냅샷 보관(비교용)
  useEffect(() => {
    invStateRef.current = inventory;
  }, [inventory]);
  useEffect(() => {
    logsStateRef.current = logs;
  }, [logs]);

    // 로컬→클라우드 (inventory set 전체 저장)
  useEffect(() => {
    // 0) 방금 들어온 클라우드 스냅샷을 로컬에 적용 중이면, 쓰기 금지 (에코 방지)
    if (applyingCloudRef.current.inv) {
      applyingCloudRef.current.inv = false;
      return;
    }

    // 1) 🔒 첫 RTDB 스냅샷(inv)이 오기 전에는 "절대" 클라우드에 쓰지 않음
    //    → 신규 기기가 구/빈 로컬 상태로 RTDB를 덮어쓰는 사고 방지
    if (!bootRef.current.inv) {
      const { inv: safeInv } = sanitizeInventoryKeys(inventory);
      // 로컬 백업까지만 수행
      saveLocalInventory(safeInv);
      return;
    }

    // 2) 스냅샷을 최소 1번 받은 뒤에만 쓰기 진행
    const { inv: safeInv, bad } = sanitizeInventoryKeys(inventory);
    if (bad.length) {
      console.warn(
        "[Inventory sanitize] removed invalid keys:",
        bad.slice(0, 20),
        bad.length > 20 ? `…(+${bad.length - 20})` : ""
      );
    }
    saveLocalInventory(safeInv);
    set(ref("inventory/"), safeInv).catch((err) => {
      console.error("Firebase set failed:", err);
      toast.error("클라우드 저장 실패: 잘못된 키가 포함되어 있습니다.");
    });
  }, [inventory]);

  // 10분 무활동 자동 로그아웃(관리자만)
  useEffect(() => {
    const syncGuideBodyClass = () => {
      const rt = normalizeGuideRuntime(getGuideRuntime());
      const shouldSet = !!rt.open;
      document.body.classList.toggle("guide-open", shouldSet);
    };
    syncGuideBodyClass();
    window.addEventListener("dokkebi-guide-runtime-updated", syncGuideBodyClass);
    window.addEventListener("storage", syncGuideBodyClass);
    return () => {
      document.body.classList.remove("guide-open");
      window.removeEventListener("dokkebi-guide-runtime-updated", syncGuideBodyClass);
      window.removeEventListener("storage", syncGuideBodyClass);
    };
  }, []);
  useEffect(() => {
    if (!isAdmin) return;
    const LOGOUT_AFTER = 10 * 60 * 1000;
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        hardLogout();
      }, LOGOUT_AFTER);
    };
    const events = ["mousemove", "keydown", "click", "touchstart", "scroll", "visibilitychange"];
    events.forEach((t) => document.addEventListener(t, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((t) => document.removeEventListener(t, reset));
    };
  }, [isAdmin]);


  return (
    <>
      <Toaster
        containerClassName="app-toaster"
        position={typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 720px)").matches ? "top-center" : "bottom-right"}
        toastOptions={{
          style: {
            background: "#0b1020",
            color: "#e6f7ff",
            border: "1px solid #243056",
            borderRadius: "14px",
            fontWeight: 600,
            fontSize: "0.98rem",
          },
          success: { style: { background: "#07101f", color: "#53ffe9" } },
          error: { style: { background: "#160b12", color: "#ff7ba1" } },
        }}
      />
     {/* ✅ 로그인 여부와 상관 없이, 부트가 끝나기 전엔 공통 오버레이 */}
          {!bootSynced && (
            <BootLoading
              hint={isLoggedIn ? "실시간 동기화" : "초기화/동기화 준비"}
              fallback={fallbackFired}
            />
          )}
      <Router>
        <Routes>
          {/* 로그인 안돼 있으면 /login 으로 보냄 */}
          <Route
            path="/"
            element={
              isLoggedIn ? (
                <Home
                  inventory={inventory}
                  setInventory={setInventory}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  logs={logs}
                  setLogs={setLogs}
                  isAdmin={isAdmin}
                  userId={userId}
                  userName={userName}
                />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          <Route
            path="/logs"
            element={isLoggedIn ? <LogsPage logs={logs} setLogs={setLogs} /> : <Navigate to="/login" replace />}
          />

          {/* 이미 로그인돼 있으면 / 로 되돌림 */}
          <Route
            path="/login"
            element={
              isLoggedIn ? (
                <Navigate to="/" replace />
              ) : (
                <LoginPage
                  onLogin={({ pw, uid, name }) => {
                    if (pw === ADMIN_PASSWORD && String(uid || "").trim().length === 9 && name) {
                      // 저장소 갱신
                      saveLocalAdmin(true);
                      sessionStorage.setItem("do-kkae-bi-admin", "true");
                      localStorage.setItem("do-kkae-bi-login-ts", String(Date.now()));
                      localStorage.setItem("do-kkae-bi-user-id", uid);
                      localStorage.setItem("do-kkae-bi-user-name", name);

                      // 상태 갱신 (리로드 없이 가드 통과)
                      setAuthTick((v) => v + 1);
                      toast.success("로그인 성공");

                      // 라우팅 + 렌더 트리거 (새로고침 불필요)
                      window.location.hash = "#/";
                      try { window.dispatchEvent(new Event("dokkebi-auth-changed")); } catch {}
                    } else {
                      toast.error("입력 정보를 확인해 주세요.");
                    }
                  }}
                />
              )
            }
          />

          <Route path="*" element={<Navigate to={isLoggedIn ? "/" : "/login"} replace />} />
        </Routes>
      </Router>
    </>
  );
}

export { Home };
