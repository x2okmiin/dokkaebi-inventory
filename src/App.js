// src/App.js
import React, { useState, useEffect, useRef, useMemo } from "react";
import { HashRouter as Router, Routes, Route, useNavigate, Navigate } from "react-router-dom";
import * as XLSX from "xlsx";
import "./App.css";
import LoginPage from "./LoginPage";
import { Toaster, toast } from "react-hot-toast";

/* Firebase (래퍼: ref(path)만 받음) */
import { ref, set, onValue } from "./firebase";

/* =========================
   1) 카테고리/스키마 정의
   - 배열: 2단계(상위→하위)
   - 객체: 3단계(상위→하위→최하위)
   ========================= */
const locations = ["동아리방", "비행장", "교수님방"];

const subcategories = {
  공구: ["수리", "납땜 용품", "드라이버", "그외 공구"],

  // ✅ 소모품: 일부 하위에 최하위(3단계) 구성
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
  "기체 개수": [],
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

  // 최초 기본 구조 생성 (2/3단계 혼합 지원)
  const base = {};
  locations.forEach((loc) => {
    base[loc] = {};
    Object.entries(subcategories).forEach(([cat, subs]) => {
      base[loc][cat] = base[loc][cat] || {};
      if (Array.isArray(subs)) {
        subs.forEach((sub) => {
          base[loc][cat][sub] = [];
        });
      } else {
        Object.entries(subs).forEach(([sub, subs2]) => {
          if (Array.isArray(subs2)) {
            base[loc][cat][sub] = [];
          } else {
            base[loc][cat][sub] = {};
            Object.keys(subs2).forEach((sub2) => {
              base[loc][cat][sub][sub2] = [];
            });
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
  return localStorage.getItem("do-kkae-bi-admin") === "true";
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

/* 고정 배경 */
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

/* 네온 백드롭 */
function NeonBackdrop() {
  return (
    <>
      <div className="bg-aurora" aria-hidden />
      <div className="bg-grid" aria-hidden />
    </>
  );
}

/* =========================
   3) 공용 유틸 (3단계 대응)
   ========================= */

// 안전 접근: 배열 항목 가져오기
function getItems(inv, loc, cat, sub, sub2) {
  const node = (((inv || {})[loc] || {})[cat] || {})[sub];
  if (!node) return [];
  if (sub2 && node && !Array.isArray(node)) {
    return node[sub2] || [];
  }
  return Array.isArray(node) ? node : [];
}

// 안전 대입: 배열 참조 반환(없으면 생성)
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

// sub2 문자열(로그/표시에 사용)
const subPath = (sub, sub2) => (sub2 ? `${sub}/${sub2}` : sub);

/* =========================
   4) 홈 화면
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
  const navigate = useNavigate();
  const categoryRefs = useRef({});
  const cardRefs = useRef({});
  const [syncing, setSyncing] = useState(false);

  const [dataMenuOpen, setDataMenuOpen] = useState(false);
  const dataMenuRef = useRef(null);
  const [openPanel, setOpenPanel] = useState(null);

  const [editKey, setEditKey] = useState(null); // 행 단일 편집

  /* 동기화 인디케이터 */
  useEffect(() => {
    setSyncing(true);
    const t = setTimeout(() => setSyncing(false), 700);
    return () => clearTimeout(t);
  }, [inventory, logs]);

  /* 외부 클릭 닫기 (데이터 메뉴) */
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

  /* 팝업 스크롤 */
  useEffect(() => {
    if (!openPanel) return;
    const key = openPanel.kind === "summary" ? "summary" : openPanel.loc;
    const el = cardRefs.current[key];
    if (el?.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [openPanel]);

  /* 편집 메뉴 닫기(문서 바깥/ESC) */
  useEffect(() => {
    if (!isAdmin) return;
    const onDocClick = (e) => {
      if (e.target.closest(".item-edit") || e.target.closest(".btn-compact")) return;
      setEditKey(null);
    };
    const onEsc = (e) => { if (e.key === "Escape") setEditKey(null); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [isAdmin]);

  /* 내보내기 */
  function exportInventoryExcel() {
    const rows = [];
    const itemTotals = {};
    locations.forEach((loc) => {
      Object.entries(subcategories).forEach(([cat, subs]) => {
        if (Array.isArray(subs)) {
          subs.forEach((sub) => {
            (getItems(inventory, loc, cat, sub) || []).forEach((item) => {
              rows.push({ 장소: loc, 상위카테고리: cat, 하위카테고리: sub, 품목명: item.name, 수량: item.count });
              if (!itemTotals[item.name]) itemTotals[item.name] = { 합계: 0, 장소별: {} };
              itemTotals[item.name].합계 += item.count;
              itemTotals[item.name].장소별[loc] = (itemTotals[item.name].장소별[loc] || 0) + item.count;
            });
          });
        } else {
          Object.entries(subs).forEach(([sub, subs2]) => {
            if (Array.isArray(subs2)) {
              (getItems(inventory, loc, cat, sub) || []).forEach((item) => {
                rows.push({ 장소: loc, 상위카테고리: cat, 하위카테고리: sub, 품목명: item.name, 수량: item.count });
                if (!itemTotals[item.name]) itemTotals[item.name] = { 합계: 0, 장소별: {} };
                itemTotals[item.name].합계 += item.count;
                itemTotals[item.name].장소별[loc] = (itemTotals[item.name].장소별[loc] || 0) + item.count;
              });
            } else {
              Object.keys(subs2).forEach((sub2) => {
                (getItems(inventory, loc, cat, sub, sub2) || []).forEach((item) => {
                  rows.push({
                    장소: loc,
                    상위카테고리: cat,
                    하위카테고리: `${sub}/${sub2}`,
                    품목명: item.name,
                    수량: item.count,
                  });
                  if (!itemTotals[item.name]) itemTotals[item.name] = { 합계: 0, 장소별: {} };
                  itemTotals[item.name].합계 += item.count;
                  itemTotals[item.name].장소별[loc] = (itemTotals[item.name].장소별[loc] || 0) + item.count;
                });
              });
            }
          });
        }
      });
    });

    rows.sort((a, b) => {
      if (a.장소 !== b.장소) return a.장소.localeCompare(b.장소);
      if (a.상위카테고리 !== b.상위카테고리) return a.상위카테고리.localeCompare(b.상위카테고리);
      if (a.하위카테고리 !== b.하위카테고리) return a.하위카테고리.localeCompare(b.하위카테고리);
      return a.품목명.localeCompare(b.품목명);
    });

    rows.push({});
    rows.push({ 품목명: "=== 품목별 전체 합계 ===" });
    Object.entries(itemTotals).forEach(([name, info]) => {
      rows.push({ 품목명: name, 총합계: info.합계, ...info.장소별 });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "재고현황");
    XLSX.writeFile(wb, "재고현황.xlsx");
  }

  /* 수량 증감(1시간 병합) + 작업자 — sub2 대응 */
  function handleUpdateItemCount(loc, cat, sub, idx, delta, sub2) {
    if (!isAdmin || delta === 0) return;

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
    const key = `${loc}|${cat}|${subKey}|${itemName}|${delta > 0 ? "IN" : "OUT"}`;
    setLogs((prev) => {
      const arr = [...prev];
      const mergeIdx = arr.findIndex((l) => l.key === key && now - new Date(l.ts) < 60 * 60 * 1000);
      if (mergeIdx > -1) {
        arr[mergeIdx] = {
          ...arr[mergeIdx],
          change: (arr[mergeIdx].change || 0) + delta,
          time,
          ts,
          operatorId: userId,
          operatorName: userName,
        };
      } else {
        arr.unshift({
          key,
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
        });
      }
      return arr;
    });
  }

  /* 이름 변경 / 메모 — sub2 대응 */
  function handleEditItemName(loc, cat, sub, idx, sub2) {
    if (!isAdmin) return;
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
    if (!isAdmin) return;
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

  /* 추가(중복 검사 포함) — sub2 대응 */
  function handleAddNewItem(loc) {
    if (!isAdmin) return;

    const catKeys = Object.keys(subcategories);
    const catPick = prompt(
      "상위 카테고리 번호 선택:\n" + catKeys.map((c, i) => `${i + 1}. ${c}`).join("\n")
    );
    const catIdx = Number(catPick);
    if (!Number.isInteger(catIdx) || catIdx < 1 || catIdx > catKeys.length) return toast.error("올바른 번호가 아닙니다.");
    const cat = catKeys[catIdx - 1];

    const subs = subcategories[cat];
    // 하위 선택
    const subList = Array.isArray(subs) ? subs : Object.keys(subs);
    if (subList.length === 0) return toast.error("해당 카테고리는 하위 카테고리가 없습니다.");
    const subPick = prompt(
      `하위 카테고리 번호 선택 [${cat}]:\n` + subList.map((s, i) => `${i + 1}. ${s}`).join("\n")
    );
    const subIdx = Number(subPick);
    if (!Number.isInteger(subIdx) || subIdx < 1 || subIdx > subList.length) return toast.error("올바른 번호가 아닙니다.");
    const sub = subList[subIdx - 1];

    // 최하위 선택(있다면)
    let sub2 = null;
    if (!Array.isArray(subs)) {
      const subs2Def = subs[sub];
      if (subs2Def && !Array.isArray(subs2Def)) {
        const sub2List = Object.keys(subs2Def);
        if (sub2List.length > 0) {
          const sub2Pick = prompt(
            `최하위 카테고리 번호 선택 [${cat} > ${sub}]:\n` +
              sub2List.map((s, i) => `${i + 1}. ${s}`).join("\n")
          );
          const sub2Idx = Number(sub2Pick);
          if (!Number.isInteger(sub2Idx) || sub2Idx < 1 || sub2Idx > sub2List.length)
            return toast.error("올바른 번호가 아닙니다.");
          sub2 = sub2List[sub2Idx - 1];
        }
      }
    }

    const count = Number(prompt("초기 수량 입력:"));
    if (isNaN(count) || count < 0) return toast.error("수량이 올바르지 않습니다.");

    const input = prompt("추가할 품목명을 입력하세요:");
    if (!input) return;
    const name = input.trim();

    // 중복 검사 (같은 cat/sub[/sub2] 범위에서 세 장소 전역)
    const existsAnywhere = locations.some((L) =>
      getItems(inventory, L, cat, sub, sub2).some((it) => (it.name || "") === name)
    );
    if (existsAnywhere) {
      toast.error("동일한 품목명이 존재합니다");
      return;
    }

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

  /* 전체 삭제(이름으로) — 경로 상세 토스트 포함 */
  function handleDeleteItem() {
    if (!isAdmin) return;
    const name = prompt("삭제할 품목 이름을 입력하세요:");
    if (!name) return;

    // 1) 어디에서(장소/카테고리/하위/최하위) 몇 개 있었는지 수집
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

    // 2) 실제 삭제
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

    // 3) 로그 기록
    const now = new Date(), ts = now.toISOString(), time = now.toLocaleString();
    setLogs((prev) => [
      {
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
      },
      ...prev,
    ]);

    // 4) 경로 상세 토스트
    const nonZero = foundDetails.filter((f) => f.count > 0);
    const lines = nonZero
      .slice(0, 8)
      .map(
        ({ L, cat, sub, sub2, count }) =>
          `• ${L} > ${cat} > ${sub}${sub2 ? " > " + sub2 : ""} : ${count}개`
      )
      .join("\n");
    const more = nonZero.length > 8 ? `\n외 ${nonZero.length - 8}개 경로…` : "";

    toast.success(`삭제됨: ${name}\n총 ${totalCount}개\n\n${lines}${more}`, {
      style: { whiteSpace: "pre-line" },
    });
  }

  /* ===== 검색/집계: 3단계 대응 — 품목명 + 하위/최하위 검색 ===== */
  const filtered = useMemo(() => {
    const q = (searchTerm || "").trim().toLowerCase();
    if (!q) return [];

    const out = [];
    Object.entries(inventory).forEach(([loc, cats]) => {
      Object.entries(cats || {}).forEach(([cat, subs]) => {
        if (Array.isArray(subs)) {
          // 2단계
          subs.forEach((sub) => {
            const subL = (sub || "").toLowerCase();
            (getItems(inventory, loc, cat, sub) || []).forEach((i) => {
              const nameL = (i.name || "").toLowerCase();
              if (nameL.includes(q) || subL.includes(q)) {
                out.push({ loc, cat, sub, sub2: null, ...i });
              }
            });
          });
        } else {
          // 3단계
          Object.entries(subs || {}).forEach(([sub, node]) => {
            const subL = (sub || "").toLowerCase();
            if (Array.isArray(node)) {
              (node || []).forEach((i) => {
                const nameL = (i.name || "").toLowerCase();
                if (nameL.includes(q) || subL.includes(q)) {
                  out.push({ loc, cat, sub, sub2: null, ...i });
                }
              });
            } else if (node && typeof node === "object") {
              Object.entries(node).forEach(([sub2, arr]) => {
                const sub2L = (sub2 || "").toLowerCase();
                (arr || []).forEach((i) => {
                  const nameL = (i.name || "").toLowerCase();
                  if (nameL.includes(q) || subL.includes(q) || sub2L.includes(q)) {
                    out.push({ loc, cat, sub, sub2, ...i });
                  }
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
    return Object.values(map);
  }, [filtered]);

  function scrollToCategory(loc, cat, sub, itemName, sub2 = null) {
    // 해당 loc의 details 닫기
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
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  /* 편집 메뉴 토글 */
  const toggleEditMenu = (key) => setEditKey((prev) => (prev === key ? null : key));

  return (
    <main className="stage">
      {/* 로고 배경 */}
      <FixedBg
        src={`${process.env.PUBLIC_URL}/DRONE_SOCCER_DOKKEBI2-Photoroom.png`}
        overlay="rgba(0,0,0,.18)"
      />
      <NeonBackdrop />

      {/* 헤더 */}
      <header className="topbar glass">
        <h1 className="logo">
          <span className="glow-dot" /> DOKKAEBI<span className="thin">/</span>INVENTORY
        </h1>

        <div className="toolbar">
          <input
            className="search-input"
            type="text"
            placeholder="검색: 품목/하위/최하위…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 100)}
          />

          <div className="menu-wrap" ref={dataMenuRef}>
            <button
              className="btn btn-secondary"
              onClick={() => setDataMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={dataMenuOpen}
            >
              📦 데이터
            </button>
            {dataMenuOpen && (
              <div className="menu" role="menu">
                <button
                  className="menu-item"
                  onClick={() => {
                    exportInventoryExcel();
                    setDataMenuOpen(false);
                  }}
                >
                  📤 재고 Excel 내보내기
                </button>
                <button className="menu-item disabled" disabled title="베타: 아직 미구현">
                  📥 가져오기 (베타)
                </button>
              </div>
            )}
          </div>

          <button className="btn btn-secondary" onClick={() => navigate("/logs")}>
            📘 기록
          </button>

          {isAdmin && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                saveLocalAdmin(false);
                window.location.hash = "#/login";
                window.location.reload();
              }}
            >
              🚪 로그아웃
            </button>
          )}
        </div>
      </header>

      {/* 동기화 표시 */}
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
                {aggregated.map((e, i) => (
                  <li key={i} className="result-item">
                    <div
                      className="result-name link"
                      onClick={() => scrollToCategory("전체", e.cat, e.sub, e.name, e.sub2)}
                    >
                      [{e.cat} &gt; {e.sub}{e.sub2 ? ` > ${e.sub2}` : ""}] {e.name}{" "}
                      <span className="chip">{e.total}개</span>
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
              <div className="right">
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

      {/* 카드 그리드 */}
      <section className="grid">
        {locations.map((loc) => (
          <div key={loc} className="card glass hover-rise" ref={(el) => (cardRefs.current[loc] = el)}>
            <div className="card-head" onClick={() => setOpenPanel({ kind: "loc", loc })}>
              <h2 className="card-title">{loc}</h2>
              {isAdmin && (
                <button
                  className="btn btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddNewItem(loc);
                  }}
                >
                  +추가
                </button>
              )}
            </div>

            <div className="card-body">
              {Object.entries(subcategories).map(([cat, subs]) => (
                <details key={cat} ref={(el) => (categoryRefs.current[`${loc}-${cat}`] = el)}>
                  <summary className="summary">{catIcon(cat)} {cat}</summary>

                  {/* 하위 (2단계 or 3단계 분기) */}
                  {Array.isArray(subs) ? (
                    // 🔹 2단계 leaf
                    subs.map((sub) => (
                      <details
                        key={sub}
                        ref={(el) => (categoryRefs.current[`${loc}-${cat}-${sub}`] = el)}
                        className="sub-details"
                      >
                        <summary className="sub-summary">▸ {sub}</summary>
                        <ul className="item-list">
                          {getItems(inventory, loc, cat, sub).map((it, idx) => {
                            const rowKey = `${loc}|${cat}|${sub}|${it.name}|${idx}`;
                            const open = editKey === rowKey;
                            return (
                              <li
                                key={idx}
                                className={`item-row ${open ? "is-editing" : ""}`}
                                ref={(el) => {
                                  const refKey = `${loc}-${cat}-${sub}-${it.name}`;
                                  if (el && !categoryRefs.current[refKey]) categoryRefs.current[refKey] = el;
                                }}
                              >
                                <div className="item-text">
                                  <span className="item-name">
                                    <span className="item-title">{it.name}</span>
                                    <span className="item-count">({it.count}개)</span>
                                  </span>

                                  <div className="item-edit">
                                    {isAdmin && (
                                      <>
                                        <div className="edit-toolbar">
                                          <button className="btn btn-ghost btn-compact" onClick={() => handleUpdateItemCount(loc, cat, sub, idx, +1)}>
                                            ＋ 입고
                                          </button>
                                          <button className="btn btn-ghost btn-compact" onClick={() => handleUpdateItemCount(loc, cat, sub, idx, -1)}>
                                            － 출고
                                          </button>
                                          <button className="btn btn-ghost btn-compact" onClick={() => handleEditItemName(loc, cat, sub, idx)}>
                                            ✎ 이름
                                          </button>
                                          <button className="btn btn-ghost btn-compact" onClick={() => handleEditItemNote(loc, cat, sub, idx)}>
                                            📝 메모
                                          </button>
                                        </div>
                                        <div className="edit-note-preview">
                                          {it.note ? `특이사항: ${it.note}` : "메모 없음"}
                                        </div>
                                      </>
                                    )}
                                  </div>

                                  {it.note && <div className="item-note">특이사항: {it.note}</div>}
                                </div>

                                {isAdmin && (
                                  <div className="item-actions">
                                    <button
                                      className="btn btn-secondary btn-compact"
                                      onClick={() => toggleEditMenu(rowKey)}
                                      title="이 아이템 수정"
                                    >
                                      {open ? "닫기" : "수정"}
                                    </button>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    ))
                  ) : (
                    // 🔹 3단계 가능 (객체)
                    Object.entries(subs).map(([sub, subs2]) =>
                      Array.isArray(subs2) ? (
                        // 하위가 곧바로 leaf
                        <details
                          key={sub}
                          ref={(el) => (categoryRefs.current[`${loc}-${cat}-${sub}`] = el)}
                          className="sub-details"
                        >
                          <summary className="sub-summary">▸ {sub}</summary>
                          <ul className="item-list">
                            {getItems(inventory, loc, cat, sub).map((it, idx) => {
                              const rowKey = `${loc}|${cat}|${sub}|${it.name}|${idx}`;
                              const open = editKey === rowKey;
                              return (
                                <li
                                  key={idx}
                                  className={`item-row ${open ? "is-editing" : ""}`}
                                  ref={(el) => {
                                    const refKey = `${loc}-${cat}-${sub}-${it.name}`;
                                    if (el && !categoryRefs.current[refKey]) categoryRefs.current[refKey] = el;
                                  }}
                                >
                                  <div className="item-text">
                                    <span className="item-name">
                                      <span className="item-title">{it.name}</span>
                                      <span className="item-count">({it.count}개)</span>
                                    </span>

                                    <div className="item-edit">
                                      {isAdmin && (
                                        <>
                                          <div className="edit-toolbar">
                                            <button className="btn btn-ghost btn-compact" onClick={() => handleUpdateItemCount(loc, cat, sub, idx, +1)}>
                                              ＋ 입고
                                            </button>
                                            <button className="btn btn-ghost btn-compact" onClick={() => handleUpdateItemCount(loc, cat, sub, idx, -1)}>
                                              － 출고
                                            </button>
                                            <button className="btn btn-ghost btn-compact" onClick={() => handleEditItemName(loc, cat, sub, idx)}>
                                              ✎ 이름
                                            </button>
                                            <button className="btn btn-ghost btn-compact" onClick={() => handleEditItemNote(loc, cat, sub, idx)}>
                                              📝 메모
                                            </button>
                                          </div>
                                          <div className="edit-note-preview">
                                            {it.note ? `특이사항: ${it.note}` : "메모 없음"}
                                          </div>
                                        </>
                                      )}
                                    </div>

                                    {it.note && <div className="item-note">특이사항: {it.note}</div>}
                                  </div>

                                  {isAdmin && (
                                    <div className="item-actions">
                                      <button
                                        className="btn btn-secondary btn-compact"
                                        onClick={() => toggleEditMenu(rowKey)}
                                        title="이 아이템 수정"
                                      >
                                        {open ? "닫기" : "수정"}
                                      </button>
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      ) : (
                        // 하위 아래 최하위(leaf 배열) 반복
                        <details
                          key={sub}
                          ref={(el) => (categoryRefs.current[`${loc}-${cat}-${sub}`] = el)}
                          className="sub-details"
                        >
                          <summary className="sub-summary">▸ {sub}</summary>

                          {Object.keys(subs2).map((sub2) => (
                            <details
                              key={sub2}
                              ref={(el) => (categoryRefs.current[`${loc}-${cat}-${sub}-${sub2}`] = el)}
                              className="sub-details"
                            >
                              <summary className="sub-summary">▸ {sub2}</summary>
                              <ul className="item-list">
                                {getItems(inventory, loc, cat, sub, sub2).map((it, idx) => {
                                  const rowKey = `${loc}|${cat}|${sub}/${sub2}|${it.name}|${idx}`;
                                  const open = editKey === rowKey;
                                  return (
                                    <li
                                      key={idx}
                                      className={`item-row ${open ? "is-editing" : ""}`}
                                      ref={(el) => {
                                        const refKey = `${loc}-${cat}-${sub}-${sub2}-${it.name}`;
                                        if (el && !categoryRefs.current[refKey]) categoryRefs.current[refKey] = el;
                                      }}
                                    >
                                      <div className="item-text">
                                        <span className="item-name">
                                          <span className="item-title">{it.name}</span>
                                          <span className="item-count">({it.count}개)</span>
                                        </span>

                                        <div className="item-edit">
                                          {isAdmin && (
                                            <>
                                              <div className="edit-toolbar">
                                                <button className="btn btn-ghost btn-compact" onClick={() => handleUpdateItemCount(loc, cat, sub, idx, +1, sub2)}>
                                                  ＋ 입고
                                                </button>
                                                <button className="btn btn-ghost btn-compact" onClick={() => handleUpdateItemCount(loc, cat, sub, idx, -1, sub2)}>
                                                  － 출고
                                                </button>
                                                <button className="btn btn-ghost btn-compact" onClick={() => handleEditItemName(loc, cat, sub, idx, sub2)}>
                                                  ✎ 이름
                                                </button>
                                                <button className="btn btn-ghost btn-compact" onClick={() => handleEditItemNote(loc, cat, sub, idx, sub2)}>
                                                  📝 메모
                                                </button>
                                              </div>
                                            </>
                                          )}
                                        </div>

                                        {it.note && <div className="item-note">특이사항: {it.note}</div>}
                                      </div>

                                      {isAdmin && (
                                        <div className="item-actions">
                                          <button
                                            className="btn btn-secondary btn-compact"
                                            onClick={() => toggleEditMenu(rowKey)}
                                            title="이 아이템 수정"
                                          >
                                            {open ? "닫기" : "수정"}
                                          </button>
                                        </div>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </details>
                          ))}
                        </details>
                      )
                    )
                  )}
                </details>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* ▼ 확대보기 팝업 */}
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
              {openPanel.kind === "summary" ? (
                Object.entries(subcategories).map(([cat, subs]) => (
                  <details key={cat} open>
                    <summary className="summary">{catIcon(cat)} {cat}</summary>

                    {Array.isArray(subs) ? (
                      subs.map((sub) => (
                        <details key={sub} open className="sub-details">
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
                              <li key={name} className="item-row">
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
                          <details key={sub} open className="sub-details">
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
                                <li key={name} className="item-row">
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
                          <details key={sub} open className="sub-details">
                            <summary className="sub-summary">▸ {sub}</summary>
                            {Object.keys(subs2).map((sub2) => (
                              <details key={sub2} open className="sub-details">
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
                                    <li key={name} className="item-row">
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
                ))
              ) : (
                Object.entries(subcategories).map(([cat, subs]) => (
                  <details key={cat} open>
                    <summary className="summary">{catIcon(cat)} {cat}</summary>

                    {Array.isArray(subs) ? (
                      subs.map((sub) => (
                        <details key={sub} open className="sub-details">
                          <summary className="sub-summary">▸ {sub}</summary>
                          <ul className="item-list">
                            {getItems(inventory, openPanel.loc, cat, sub).map((it, idx) => {
                              const rowKey = `${openPanel.loc}|${cat}|${sub}|${it.name}|${idx}`;
                              const open = editKey === rowKey;
                              return (
                                <li key={idx} className={`item-row ${open ? "is-editing" : ""}`}>
                                  <div className="item-text">
                                    <span className="item-name">
                                      <span className="item-title">{it.name}</span>
                                      <span className="item-count">({it.count}개)</span>
                                    </span>

                                    <div className="item-edit">
                                      {isAdmin && (
                                        <>
                                          <div className="edit-toolbar">
                                            <button className="btn btn-ghost btn-compact" onClick={() => handleUpdateItemCount(openPanel.loc, cat, sub, idx, +1)}>
                                              ＋ 입고
                                            </button>
                                            <button className="btn btn-ghost btn-compact" onClick={() => handleUpdateItemCount(openPanel.loc, cat, sub, idx, -1)}>
                                              － 출고
                                            </button>
                                            <button className="btn btn-ghost btn-compact" onClick={() => handleEditItemName(openPanel.loc, cat, sub, idx)}>
                                              ✎ 이름
                                            </button>
                                            <button className="btn btn-ghost btn-compact" onClick={() => handleEditItemNote(openPanel.loc, cat, sub, idx)}>
                                              📝 메모
                                            </button>
                                          </div>
                                          <div className="edit-note-preview">
                                            {it.note ? `특이사항: ${it.note}` : "메모 없음"}
                                          </div>
                                        </>
                                      )}
                                    </div>

                                    {it.note && <div className="item-note">특이사항: {it.note}</div>}
                                  </div>

                                  {isAdmin && (
                                    <div className="item-actions">
                                      <button
                                        className="btn btn-secondary btn-compact"
                                        onClick={() => setEditKey(open ? null : rowKey)}
                                        title="이 아이템 수정"
                                      >
                                        {open ? "닫기" : "수정"}
                                      </button>
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      ))
                    ) : (
                      Object.entries(subs).map(([sub, subs2]) =>
                        Array.isArray(subs2) ? (
                          <details key={sub} open className="sub-details">
                            <summary className="sub-summary">▸ {sub}</summary>
                            <ul className="item-list">
                              {getItems(inventory, openPanel.loc, cat, sub).map((it, idx) => {
                                const rowKey = `${openPanel.loc}|${cat}|${sub}|${it.name}|${idx}`;
                                const open = editKey === rowKey;
                                return (
                                  <li key={idx} className={`item-row ${open ? "is-editing" : ""}`}>
                                    <div className="item-text">
                                      <span className="item-name">
                                        <span className="item-title">{it.name}</span>
                                        <span className="item-count">({it.count}개)</span>
                                      </span>

                                      <div className="item-edit">
                                        {isAdmin && (
                                          <>
                                            <div className="edit-toolbar">
                                              <button className="btn btn-ghost btn-compact" onClick={() => handleUpdateItemCount(openPanel.loc, cat, sub, idx, +1)}>
                                                ＋ 입고
                                              </button>
                                              <button className="btn btn-ghost btn-compact" onClick={() => handleUpdateItemCount(openPanel.loc, cat, sub, idx, -1)}>
                                                － 출고
                                              </button>
                                              <button className="btn btn-ghost btn-compact" onClick={() => handleEditItemName(openPanel.loc, cat, sub, idx)}>
                                                ✎ 이름
                                              </button>
                                              <button className="btn btn-ghost btn-compact" onClick={() => handleEditItemNote(openPanel.loc, cat, sub, idx)}>
                                                📝 메모
                                              </button>
                                            </div>
                                            <div className="edit-note-preview">
                                              {it.note ? `특이사항: ${it.note}` : "메모 없음"}
                                            </div>
                                          </>
                                        )}
                                      </div>

                                      {it.note && <div className="item-note">특이사항: {it.note}</div>}
                                    </div>

                                    {isAdmin && (
                                      <div className="item-actions">
                                        <button
                                          className="btn btn-secondary btn-compact"
                                          onClick={() => setEditKey(open ? null : rowKey)}
                                          title="이 아이템 수정"
                                        >
                                          {open ? "닫기" : "수정"}
                                        </button>
                                      </div>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </details>
                        ) : (
                          <details key={sub} open className="sub-details">
                            <summary className="sub-summary">▸ {sub}</summary>
                            {Object.keys(subs2).map((sub2) => (
                              <details key={sub2} open className="sub-details">
                                <summary className="sub-summary">▸ {sub2}</summary>
                                <ul className="item-list">
                                  {getItems(inventory, openPanel.loc, cat, sub, sub2).map((it, idx) => {
                                    const rowKey = `${openPanel.loc}|${cat}|${sub}/${sub2}|${it.name}|${idx}`;
                                    const open = editKey === rowKey;
                                    return (
                                      <li key={idx} className={`item-row ${open ? "is-editing" : ""}`}>
                                        <div className="item-text">
                                          <span className="item-name">
                                            <span className="item-title">{it.name}</span>
                                            <span className="item-count">({it.count}개)</span>
                                          </span>

                                          <div className="item-edit">
                                            {isAdmin && (
                                              <>
                                                <div className="edit-toolbar">
                                                  <button className="btn btn-ghost btn-compact" onClick={() => handleUpdateItemCount(openPanel.loc, cat, sub, idx, +1, sub2)}>
                                                    ＋ 입고
                                                  </button>
                                                  <button className="btn btn-ghost btn-compact" onClick={() => handleUpdateItemCount(openPanel.loc, cat, sub, idx, -1, sub2)}>
                                                    － 출고
                                                  </button>
                                                  <button className="btn btn-ghost btn-compact" onClick={() => handleEditItemName(openPanel.loc, cat, sub, idx, sub2)}>
                                                    ✎ 이름
                                                  </button>
                                                  <button className="btn btn-ghost btn-compact" onClick={() => handleEditItemNote(openPanel.loc, cat, sub, idx, sub2)}>
                                                    📝 메모
                                                  </button>
                                                </div>
                                                <div className="edit-note-preview">
                                                  {it.note ? `특이사항: ${it.note}` : "메모 없음"}
                                                </div>
                                              </>
                                            )}
                                          </div>

                                          {it.note && <div className="item-note">특이사항: {it.note}</div>}
                                        </div>

                                        {isAdmin && (
                                          <div className="item-actions">
                                            <button
                                              className="btn btn-secondary btn-compact"
                                              onClick={() => setEditKey(open ? null : rowKey)}
                                              title="이 아이템 수정"
                                            >
                                              {open ? "닫기" : "수정"}
                                            </button>
                                          </div>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </details>
                            ))}
                          </details>
                        )
                      )
                    )}
                  </details>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 전체 요약 (읽기 전용) */}
      <section className="grid">
        <div className="card glass hover-rise" ref={(el) => (cardRefs.current["summary"] = el)}>
          <div className="card-head" onClick={() => setOpenPanel({ kind: "summary" })}>
            <h2 className="card-title">전체</h2>
            {isAdmin && (
              <button className="btn btn-danger" onClick={(e) => { e.stopPropagation(); handleDeleteItem(); }}>
                삭제
              </button>
            )}
          </div>

          <div className="card-body">
            {Object.entries(subcategories).map(([cat, subs]) => (
              <details key={cat} ref={(el) => (categoryRefs.current[`전체-${cat}`] = el)}>
                <summary className="summary">{catIcon(cat)} {cat}</summary>

                {Array.isArray(subs) ? (
                  subs.map((sub) => (
                    <details key={sub} ref={(el) => (categoryRefs.current[`전체-${cat}-${sub}`] = el)} className="sub-details">
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
                          <li key={name} className="item-row">
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
                      <details key={sub} ref={(el) => (categoryRefs.current[`전체-${cat}-${sub}`] = el)} className="sub-details">
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
                            <li key={name} className="item-row">
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
                      <details key={sub} ref={(el) => (categoryRefs.current[`전체-${cat}-${sub}`] = el)} className="sub-details">
                        <summary className="sub-summary">▸ {sub}</summary>
                        {Object.keys(subs2).map((sub2) => (
                          <details key={sub2} ref={(el) => (categoryRefs.current[`전체-${cat}-${sub}-${sub2}`] = el)} className="sub-details">
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
                                <li key={name} className="item-row">
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
            ))}
          </div>
        </div>
      </section>

      {/* 제작자 표시줄 */}
      <footer className="site-footer">
        <p>
          © 강원도립대 드론융합과 24학번 최석민 — 드론축구단 재고·입출고 관리 콘솔<br />
          문의: <a href="mailto:gwdokkebinv@gmail.com">gwdokkebinv@gmail.com</a>
        </p>
      </footer>
    </main>
  );
}

/* =========================
   5) 기록 페이지
   ========================= */
function LogsPage({ logs, setLogs }) {
  const [syncing, setSyncing] = useState(false);
  const navigate = useNavigate();
  const [filterDate, setFilterDate] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [itemKeyword, setItemKeyword] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const menuRef = useRef(null);

  // 로컬 백업(보조)
  useEffect(() => saveLocalLogs(logs), [logs]);

  // 동기화 인디케이터
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

  const grouped = useMemo(
    () =>
      filteredList.reduce((acc, l) => {
        const day = l.ts.slice(0, 10);
        (acc[day] = acc[day] || []).push(l);
        return acc;
      }, {}),
    [filteredList]
  );

  const dates = useMemo(() => Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a)), [grouped]);

  function formatLabel(d) {
    const diff = Math.floor((new Date() - new Date(d)) / (1000 * 60 * 60 * 24));
    return diff === 0 ? "오늘" : diff === 1 ? "어제" : d;
  }

  function editReason(i) {
    const note = prompt("메모:", logs[i].reason || "");
    if (note === null) return;
    const next = [...logs];
    next[i].reason = note;
      setLogs(next);  
      set(ref("logs/"), next)    
      .then(() => toast.success("메모 저장됨"))
      .catch((err) => toast.error(`클라우드 동기화 실패: ${err?.code || err?.message || err}`));
  }

  function deleteLog(i) {
    if (window.confirm("삭제하시겠습니까?")) {
      const next = logs.filter((_, j) => j !== i);
      setLogs(next); 
      set(ref("logs/"), next)      
        .then(() => toast.success("로그 삭제됨"))
        .catch((err) => toast.error(`클라우드 동기화 실패: ${err?.code || err?.message || err}`));
    }}

  useEffect(() => {
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setExportOpen(false);
    }
    if (exportOpen) {
      document.addEventListener("mousedown", onClickOutside);
      document.addEventListener("touchstart", onClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("touchstart", onClickOutside);
    };
  }, [exportOpen]);

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
    <main className="stage">
      <FixedBg
        src={`${process.env.PUBLIC_URL}/DRONE_SOCCER_DOKKEBI2-Photoroom.png`}
        overlay="rgba(0,0,0,.22)"
      />
      <NeonBackdrop />

      <header className="topbar glass">
        <button className="btn btn-ghost" onClick={() => navigate("/")}>
          ← 돌아가기
        </button>
        <h1 className="logo">입출고 기록</h1>

        {/* 폰/태블릿에선 타이틀 아래로 풀폭 정렬 */}
        <div className="toolbar">
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
              <option key={L} value={L}>{L}</option>
            ))}
          </select>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="search-input"
          />

          <button
            className="btn btn-secondary"
            onClick={() => { setFilterDate(""); setItemKeyword(""); setLocationFilter(""); }}
          >
            필터 해제
          </button>

          <div className="menu-wrap" ref={menuRef}>
            <button className="btn btn-secondary" onClick={() => setExportOpen((v) => !v)} aria-haspopup="menu" aria-expanded={exportOpen}>
              ⬇ 내보내기
            </button>
            {exportOpen && (
              <div className="menu menu-logs" role="menu">
                <button className="menu-item" onClick={() => { exportCSV(); setExportOpen(false); }}>
                  📄 CSV 내보내기
                </button>
                <button className="menu-item" onClick={() => { exportExcel(); setExportOpen(false); }}>
                  📑 Excel 내보내기
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 동기화 인디케이터 */}
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
        dates.map((d) => (
          <section key={d} className="panel glass lift-in">
            <h2 className="panel-title">{formatLabel(d)}</h2>
            <ul className="log-list">
              {grouped[d].map((l, i) => {
                const idx = logs.findIndex((x) => x.ts === l.ts && x.key === l.key);
                return (
                  <li key={i} className="log-row">
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
        ))
      )}
    </main>
  );
}

/* =========================
   6) AppWrapper (전역 실시간 동기화)
   ========================= */
export default function AppWrapper() {
  const [inventory, setInventory] = useState(getLocalInventory);
  const [searchTerm, setSearchTerm] = useState("");
  const [logs, setLogs] = useState(getLocalLogs);
  const isAdmin = getLocalAdmin();
  const [userId, setUserId] = useState(getLocalUserId);
  const [userName, setUserName] = useState(getLocalUserName);

  // ✅ 전역 동기화 플래그/스냅샷 ref
  const applyingCloudRef = useRef({ inv: false, logs: false });
  const invStateRef = useRef(inventory);
  const logsStateRef = useRef(logs);

  useEffect(() => { invStateRef.current = inventory; }, [inventory]);
  useEffect(() => { logsStateRef.current = logs; }, [logs]);

  // ✅ 클라우드 → 로컬 (앱 생애주기 동안 1회 구독)
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
    });

    const unsubLogs = onValue(logRefFB, (snap) => {
      if (!snap.exists()) return;
      const cloud = snap.val();
      if (JSON.stringify(cloud) !== JSON.stringify(logsStateRef.current)) {
        applyingCloudRef.current.logs = true;
        setLogs(cloud);
      }
    });

    return () => {
      unsubInv();
      unsubLogs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 로컬 → 클라우드 (관리자만; 루프 방지)
  useEffect(() => {
    if (applyingCloudRef.current.inv) { applyingCloudRef.current.inv = false; return; }
    saveLocalInventory(inventory);
    if (getLocalAdmin()) {
      set(ref("inventory/"), inventory).catch(() => {});
    }
  }, [inventory]);

  useEffect(() => {
    if (applyingCloudRef.current.logs) { applyingCloudRef.current.logs = false; return; }
    saveLocalLogs(logs);
    if (getLocalAdmin()) {
      set(ref("logs/"), logs).catch((err) => {
        toast.error(`클라우드 로그 저장 실패: ${err?.code || err?.message || err}`);
    });
    }
  }, [logs]);

  // ⏱️ 10분 무활동 자동 로그아웃
  useEffect(() => {
    if (!isAdmin) return;

    const LOGOUT_AFTER = 10 * 60 * 1000; // 10분
    let timer;

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        saveLocalAdmin(false);
        window.location.hash = "#/login";
        window.location.reload();
      }, LOGOUT_AFTER);
    };

    const events = ["mousemove", "keydown", "click", "touchstart", "scroll", "visibilitychange"];
    events.forEach((t) => document.addEventListener(t, reset, { passive: true }));

    reset(); // 초기 타이머 가동

    return () => {
      clearTimeout(timer);
      events.forEach((t) => document.removeEventListener(t, reset));
    };
  }, [isAdmin]);

  return (
    <>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#0b1020",
            color: "#e6f7ff",
            border: "1px solid #243056",
            borderRadius: "14px",
            fontWeight: 600,
            fontSize: "1.02rem",
          },
          success: { style: { background: "#07101f", color: "#53ffe9" } },
          error: { style: { background: "#160b12", color: "#ff7ba1" } },
        }}
      />

      <Router>
        <Routes>
          {!isAdmin ? (
            <>
              <Route
                path="/login"
                element={
                  <LoginPage
                    onLogin={({ pw, uid, name }) => {
                      if (pw === "2500" && uid && name) {
                        saveLocalAdmin(true);
                        localStorage.setItem("do-kkae-bi-user-id", uid);
                        localStorage.setItem("do-kkae-bi-user-name", name);
                        setUserId(uid);
                        setUserName(name);
                        window.location.hash = "#/";
                        window.location.reload();
                      } else {
                        toast.error("입력 정보를 확인해 주세요.");
                      }
                    }}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          ) : (
            <>
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route
                path="/"
                element={
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
                }
              />
              <Route path="/logs" element={<LogsPage logs={logs} setLogs={setLogs} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </Router>
    </>
  );
}

export { Home };
