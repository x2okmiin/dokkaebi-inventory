// src/App.js
import React, { useState, useEffect, useRef, useMemo } from "react";
import { HashRouter as Router, Routes, Route, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import "./App.css";
import { Toaster, toast } from "react-hot-toast";
import LoginPage from "./LoginPage";
import { db, ref, set, onValue } from "./firebase";

/* =======================
 * 상수
 * ======================= */
const locations = ["동아리방", "비행장", "교수님방"];
const subcategories = {
  공구: ["수리", "납땜 용품", "드라이버", "그외 공구"],
  소모품: [
    "카본 프레임", "펜타 가드", "케이블 타이", "프로펠러", "XT커넥터",
    "볼트너트", "납땜 관련", "벨크로", "배터리", "LED", "테이프", "그외 소모품"
  ],
  "드론 제어부": ["FC", "FC ESC 연결선", "ESC", "모터", "수신기", "콘덴서", "제어부 세트"],
  "조종기 개수": ["학교", "개인"],
  "기체 개수": []
};

/* =======================
 * localStorage helpers
 * ======================= */
const LS_INV = "do-kkae-bi-inventory";
const LS_LOG = "do-kkae-bi-logs";
const LS_ADM = "do-kkae-bi-admin";

function newBaseInventory() {
  const base = {};
  locations.forEach((loc) => {
    base[loc] = {};
    Object.entries(subcategories).forEach(([cat, subs]) => {
      base[loc][cat] = {};
      subs.forEach((sub) => (base[loc][cat][sub] = []));
    });
  });
  return base;
}
function getLocalInventory() {
  const d = localStorage.getItem(LS_INV);
  return d ? JSON.parse(d) : newBaseInventory();
}
function saveLocalInventory(data) {
  localStorage.setItem(LS_INV, JSON.stringify(data));
}
function getLocalLogs() {
  const d = localStorage.getItem(LS_LOG);
  return d ? JSON.parse(d) : [];
}
function saveLocalLogs(data) {
  localStorage.setItem(LS_LOG, JSON.stringify(data));
}
function getLocalAdmin() {
  return localStorage.getItem(LS_ADM) === "true";
}
function saveLocalAdmin(val) {
  localStorage.setItem(LS_ADM, val ? "true" : "false");
}

/* =======================
 * Firebase helpers
 * ======================= */
function saveInventoryToCloud(data) {
  set(ref(db, "inventory/"), data);
}
function saveLogsToCloud(logs) {
  set(ref(db, "logs/"), logs);
}

/* =======================
 * 공통: 고정 배경
 * ======================= */
function FixedBg({
  src,
  overlay = null,
  maxW = "min(90vw, 1400px)",
  maxH = "min(80vh, 900px)",
  minW = "320px",
  minH = "200px",
  opacity = 1
}) {
  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          overflow: "hidden"
        }}
      >
        <img
          src={src}
          alt=""
          style={{
            width: "auto",
            height: "auto",
            maxWidth: maxW,
            maxHeight: maxH,
            minWidth: minW,
            minHeight: minH,
            objectFit: "contain",
            opacity
          }}
        />
      </div>
      {overlay && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: -1,
            background: overlay,
            pointerEvents: "none"
          }}
        />
      )}
    </>
  );
}

/* =======================
 * 버튼 리플 이펙트 훅 (터치/마우스 공통)
 * ======================= */
function useRipple() {
  useEffect(() => {
    function createRipple(e) {
      const target = e.target.closest(".btn");
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "ripple-anim";
      const size = Math.max(rect.width, rect.height);
      const x = (e.clientX ?? (e.touches?.[0]?.clientX || 0)) - rect.left - size / 2;
      const y = (e.clientY ?? (e.touches?.[0]?.clientY || 0)) - rect.top - size / 2;
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      target.appendChild(ripple);
      setTimeout(() => ripple.remove(), 550);
    }
    document.addEventListener("click", createRipple);
    document.addEventListener("touchstart", createRipple, { passive: true });
    return () => {
      document.removeEventListener("click", createRipple);
      document.removeEventListener("touchstart", createRipple);
    };
  }, []);
}

/* =======================
 * Home
 * ======================= */
function Home({ inventory, setInventory, searchTerm, setSearchTerm, logs, setLogs, isAdmin }) {
  const navigate = useNavigate();
  useRipple();

  const categoryRefs = useRef({});
  const cardRefs = useRef({});

  // 데이터 메뉴 (Export/Import) 상태
  const [dataMenuOpen, setDataMenuOpen] = useState(false);
  //const fileInputRef = useRef(null);
  const [syncing, setSyncing] = useState(false);

  // 팝업(확대 보기)
  const [openPanel, setOpenPanel] = useState(null);

  // 🔒 파이어베이스 핑퐁 방지 + 저장 디바운스
  const cloudInv = useRef(false);
  const cloudLogs = useRef(false);
  const invSaveTimer = useRef(null);
  const logSaveTimer = useRef(null);

  /* --- 동기화: 로컬 저장 + (클라우드 디바운스 저장) --- */
  useEffect(() => {
    saveLocalInventory(inventory);
    if (!cloudInv.current) {
      if (invSaveTimer.current) clearTimeout(invSaveTimer.current);
      invSaveTimer.current = setTimeout(() => saveInventoryToCloud(inventory), 350);
    }
    setSyncing(true);
    const t = setTimeout(() => setSyncing(false), 650);
    return () => clearTimeout(t);
  }, [inventory]);

  useEffect(() => {
    saveLocalLogs(logs);
    if (!cloudLogs.current) {
      if (logSaveTimer.current) clearTimeout(logSaveTimer.current);
      logSaveTimer.current = setTimeout(() => saveLogsToCloud(logs), 350);
    }
    setSyncing(true);
    const t = setTimeout(() => setSyncing(false), 650);
    return () => clearTimeout(t);
  }, [logs]);

  /* --- Firebase 구독 (1회) --- */
  useEffect(() => {
    const invRef = ref(db, "inventory/");
    const logRef = ref(db, "logs/");
    const unsubInv = onValue(invRef, (s) => {
      if (s.exists()) {
        cloudInv.current = true;
        setInventory(s.val());
        setTimeout(() => (cloudInv.current = false), 0);
      }
    });
    const unsubLog = onValue(logRef, (s) => {
      if (s.exists()) {
        cloudLogs.current = true;
        setLogs(s.val());
        setTimeout(() => (cloudLogs.current = false), 0);
      }
    });
    return () => {
      unsubInv();
      unsubLog();
    };
  }, [setInventory, setLogs]);

  /* --- 팝업 열릴 때 해당 카드로 스크롤 --- */
  useEffect(() => {
    if (!openPanel) return;
    const key = openPanel.kind === "summary" ? "summary" : openPanel.loc;
    const el = cardRefs.current[key];
    if (el?.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [openPanel]);

  /* ====== 내보내기: 재고 엑셀 ====== */
  function exportInventoryExcel() {
    const rows = [];
    const itemTotals = {};
    locations.forEach((loc) => {
      Object.entries(subcategories).forEach(([cat, subs]) => {
        subs.forEach((sub) => {
          (inventory[loc]?.[cat]?.[sub] || []).forEach((item) => {
            rows.push({
              장소: loc,
              상위카테고리: cat,
              하위카테고리: sub,
              품목명: item.name,
              수량: item.count,
              메모: item.note || ""
            });
            if (!itemTotals[item.name]) itemTotals[item.name] = { 합계: 0, 장소별: {} };
            itemTotals[item.name].합계 += item.count;
            itemTotals[item.name].장소별[loc] = (itemTotals[item.name].장소별[loc] || 0) + item.count;
          });
        });
      });
    });

    // 정렬
    rows.sort((a, b) => {
      if (a.장소 !== b.장소) return a.장소.localeCompare(b.장소);
      if (a.상위카테고리 !== b.상위카테고리) return a.상위카테고리.localeCompare(b.상위카테고리);
      if (a.하위카테고리 !== b.하위카테고리) return a.하위카테고리.localeCompare(b.하위카테고리);
      return a.품목명.localeCompare(b.품목명);
    });

    // 합계 섹션
    rows.push({});
    rows.push({ 품목명: "=== 품목별 전체 합계 ===" });
    Object.entries(itemTotals).forEach(([name, info]) => {
      rows.push({ 품목명: name, 총합계: info.합계, ...info.장소별 });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "재고현황");
    XLSX.writeFile(wb, "재고현황.xlsx");
    toast.success("재고 Excel 내보내기 완료");
  }

  /* ====== 가져오기: CSV/XLSX 업로드 ====== */
  function handleFilePicked(file) {
    if (!file) return;
    if (!window.confirm("⚠️ 현재 재고를 덮어쓰시겠습니까?")) return;
    const rd = new FileReader();
    rd.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        const inv = newBaseInventory();
        data.forEach((r) => {
          const loc = r["장소"], cat = r["상위카테고리"], sub = r["하위카테고리"];
          const nm = r["품목명"], cnt = Number(r["수량"] || 0), note = r["메모"] || "";
          if (locations.includes(loc) && subcategories[cat]?.includes(sub) && nm) {
            inv[loc][cat][sub].push({ name: nm, count: Math.max(0, cnt), note });
          }
        });
        setInventory(inv);
        toast.success("가져오기 완료");
      } catch (err) {
        console.error(err);
        toast.error("가져오기 실패: 파일 형식을 확인해주세요.");
      }
    };
    rd.readAsBinaryString(file);
  }
  function triggerImport() {
    if (!isAdmin) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.xlsx";
    input.onchange = (e) => handleFilePicked(e.target.files?.[0]);
    input.click();
  }

  /* ====== 수량 증감(1시간 병합) ====== */
  function handleUpdateItemCount(loc, cat, sub, idx, delta) {
    if (!isAdmin || delta === 0) return;
    const itemName = inventory[loc][cat][sub][idx]?.name;
    if (!itemName) return;

    setInventory((prev) => {
      const inv = JSON.parse(JSON.stringify(prev));
      const it = inv[loc][cat][sub][idx];
      if (it) it.count = Math.max(0, it.count + delta);
      return inv;
    });

    const now = new Date();
    const ts = now.toISOString();
    const time = now.toLocaleString();
    const key = `${loc}|${cat}|${sub}|${itemName}|${delta > 0 ? "IN" : "OUT"}`;
    setLogs((prev) => {
      const arr = [...prev];
      const mergeIdx = arr.findIndex((l) => l.key === key && now - new Date(l.ts) < 60 * 60 * 1000);
      if (mergeIdx > -1) {
        arr[mergeIdx] = { ...arr[mergeIdx], change: arr[mergeIdx].change + delta, time, ts };
      } else {
        arr.unshift({
          key, location: loc, category: cat, subcategory: sub,
          item: itemName, change: delta, reason: "입출고", time, ts
        });
      }
      return arr;
    });
  }

  /* ====== 이름/메모/추가/삭제 ====== */
  function handleEditItemName(loc, cat, sub, idx) {
    if (!isAdmin) return;
    const oldName = inventory[loc][cat][sub][idx].name;
    const newName = prompt("새 품목명을 입력하세요:", oldName)?.trim();
    if (!newName || newName === oldName) return;

    const exists = locations.some((L) =>
      (inventory[L]?.[cat]?.[sub] || []).some((it) => it.name === newName)
    );
    if (exists) return toast.error("해당 카테고리/하위에 같은 이름이 이미 있어요(전 위치).");

    setInventory((prev) => {
      const inv = JSON.parse(JSON.stringify(prev));
      locations.forEach((L) => {
        inv[L][cat][sub] = inv[L][cat][sub].map((item) =>
          item.name === oldName ? { ...item, name: newName } : item
        );
      });
      return inv;
    });
  }

  function handleEditItemNote(loc, cat, sub, idx) {
    if (!isAdmin) return;
    setInventory((prev) => {
      const inv = JSON.parse(JSON.stringify(prev));
      const it = inv[loc][cat][sub][idx];
      const note = prompt("특이사항을 입력하세요:", it.note || "");
      if (note === null) return prev;
      it.note = note;
      return inv;
    });
  }

  function handleAddNewItem(loc) {
    if (!isAdmin) return;
    const cat = prompt("상위 카테고리 선택:\n" + Object.keys(subcategories).join(", "));
    if (!cat || !subcategories[cat]) return toast.error("올바른 카테고리가 아닙니다.");
    const sub = prompt("하위 카테고리 선택:\n" + subcategories[cat].join(", "));
    if (!sub || !subcategories[cat].includes(sub)) return toast.error("올바른 하위카테고리가 아닙니다.");
    const name = prompt("추가할 품목명:")?.trim();
    if (!name) return;
    const count = Number(prompt("초기 수량 입력:"));
    if (isNaN(count) || count < 0) return toast.error("수량이 올바르지 않습니다.");

    const duplicate = locations.some((L) =>
      (inventory[L]?.[cat]?.[sub] || []).some((it) => it.name === name)
    );
    if (duplicate) return toast.error("이미 같은 이름의 품목이 존재합니다(전 위치).");

    setInventory((prev) => {
      const inv = JSON.parse(JSON.stringify(prev));
      locations.forEach((L) => {
        if (!inv[L][cat]) inv[L][cat] = {};
        if (!inv[L][cat][sub]) inv[L][cat][sub] = [];
        inv[L][cat][sub].push({ name, count: L === loc ? count : 0, note: "" });
      });
      return inv;
    });
  }

  function handleDeleteItem() {
    if (!isAdmin) return;
    const name = prompt("삭제할 품목 이름을 입력하세요:")?.trim();
    if (!name) return;

    let totalCount = 0;
    locations.forEach((L) => {
      Object.keys(inventory[L]).forEach((cat) => {
        Object.keys(inventory[L][cat]).forEach((sub) => {
          (inventory[L][cat][sub] || []).forEach((item) => {
            if (item.name === name) totalCount += item.count;
          });
        });
      });
    });
    if (totalCount === 0) return toast.error("해당 품목이 존재하지 않습니다.");

    setInventory((prev) => {
      const newInv = JSON.parse(JSON.stringify(prev));
      locations.forEach((L) => {
        Object.keys(newInv[L]).forEach((cat) => {
          Object.keys(newInv[L][cat]).forEach((sub) => {
            newInv[L][cat][sub] = (newInv[L][cat][sub] || []).filter((item) => item.name !== name);
          });
        });
      });
      return newInv;
    });

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
        ts
      },
      ...prev
    ]);
  }

  /* ====== 검색 / 집계 ====== */
  const filtered = useMemo(
    () =>
      Object.entries(inventory).flatMap(([loc, cats]) =>
        Object.entries(cats).flatMap(([cat, subs]) =>
          Object.entries(subs).flatMap(([sub, items]) =>
            (items || [])
              .filter((i) => i.name.toLowerCase().includes(searchTerm.toLowerCase()))
              .map((i) => ({ loc, cat, sub, ...i }))
          )
        )
      ),
    [inventory, searchTerm]
  );

  const aggregated = useMemo(() => {
    const map = {};
    filtered.forEach((e) => {
      const k = `${e.cat}|${e.sub}|${e.name}`;
      if (!map[k]) map[k] = { cat: e.cat, sub: e.sub, name: e.name, total: 0, locs: {} };
      map[k].locs[e.loc] = (map[k].locs[e.loc] || 0) + e.count;
      map[k].total += e.count;
    });
    return Object.values(map);
  }, [filtered]);

  /* ====== 검색 결과 클릭 → 해당 위치로 펼치고 스크롤 ====== */
  function scrollToCategory(loc, cat, sub, itemName) {
    Object.keys(categoryRefs.current).forEach((k) => {
      if (k.startsWith(`${loc}-`)) {
        const el = categoryRefs.current[k];
        if (el && el.tagName === "DETAILS") el.open = false;
      }
    });
    const ck = `${loc}-${cat}`;
    const sk = `${loc}-${cat}-${sub}`;
    const ik = `${loc}-${cat}-${sub}-${itemName}`;
    if (categoryRefs.current[ck]) categoryRefs.current[ck].open = true;
    if (categoryRefs.current[sk]) categoryRefs.current[sk].open = true;
    setTimeout(() => {
      const el = categoryRefs.current[ik];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  /* ====== UI ====== */
  return (
    <main className="app-main fade-in">
      {/* 배경 */}
      <FixedBg
        src={`${process.env.PUBLIC_URL}/DRONE_SOCCER_DOKKEBI2-Photoroom.png`}
        overlay="rgba(0,0,0,.16)"
        maxW="min(86vw, 1260px)"
        maxH="min(72vh, 820px)"
        minW="360px"
        minH="220px"
        opacity={0.92}
      />

      {/* 동기화 표시 */}
      {syncing && (
        <div className="sync-indicator">
          <span className="spinner" /> 동기화 중...
        </div>
      )}

      <h1 className="dk-main-title title-pulse" style={{ textAlign: "center", marginTop: "0.5rem" }}>
        도깨비 드론축구단 재고관리
      </h1>

      {/* 툴바 */}
      <div className="toolbar">
        <input
          className="search-input"
          type="text"
          placeholder="검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          aria-label="검색"
        />

        <button className="btn btn-default" onClick={() => navigate("/logs")}>📘 기록</button>

        {!isAdmin ? (
          <button
            className="btn btn-default"
            onClick={() => {
              const pw = prompt("관리자 비밀번호:");
              if (pw === "2500") {
                saveLocalAdmin(true);
                window.location.reload();
              } else {
                toast.error("틀렸습니다.");
              }
            }}
          >
            🔑 로그인
          </button>
        ) : (
          <>
            <button
              className="btn btn-default"
              onClick={() => { saveLocalAdmin(false); window.location.reload(); }}
            >
              🚪 로그아웃
            </button>

            {/* 📦 데이터 통합 버튼 */}
            <div className="data-menu-wrap">
              <button
                className="btn btn-default"
                onClick={() => setDataMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={dataMenuOpen}
              >
                📦 데이터
              </button>
              {dataMenuOpen && (
                <div className="data-menu" role="menu" onMouseLeave={() => setDataMenuOpen(false)}>
                  <button className="menu-item" role="menuitem" onClick={() => { setDataMenuOpen(false); exportInventoryExcel(); }}>
                    📤 재고 Excel 내보내기
                  </button>
                  <button className="menu-item" role="menuitem" onClick={() => { setDataMenuOpen(false); triggerImport(); }}>
                    --⤴️ CSV/XLSX 가져오기-- 미완
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 검색 결과 */}
      {searchTerm && (
        <div className="search-result" style={{ margin: "10px auto" }}>
          <h3 style={{ margin: 0, marginBottom: 6 }}>🔍 검색 결과</h3>
          {aggregated.length === 0 ? (
            <p className="muted">검색된 결과가 없습니다.</p>
          ) : (
            <>
              <ul style={{ listStyle: "disc inside" }}>
                {aggregated.map((e, i) => (
                  <li key={i} style={{ marginBottom: "6px" }}>
                    <div onClick={() => scrollToCategory("전체", e.cat, e.sub, e.name)} style={{ cursor: "pointer" }}>
                      [{e.cat} &gt; {e.sub}] {e.name} (총 {e.total}개)
                    </div>
                    <div className="search-loc-row">
                      {locations.map((L) => (
                        <span
                          key={L}
                          onClick={() => scrollToCategory(L, e.cat, e.sub, e.name)}
                          className="search-loc-link"
                        >
                          {L}: {e.locs[L] || 0}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <div style={{ textAlign: "right", marginTop: "6px" }}>
                <button
                  className="btn btn-default"
                  onClick={() => {
                    const txt = aggregated
                      .map(
                        (e) =>
                          `[${e.cat}>${e.sub}] ${e.name} (총 ${e.total}개) ` +
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
        </div>
      )}

      {/* 장소 카드 그리드 */}
      <div className="cards-grid">
        {locations.map((loc) => (
          <div
            key={loc}
            className="card fixed"
            ref={(el) => { if (el) cardRefs.current[loc] = el; }}
          >
            <div className="card-head" onClick={() => setOpenPanel({ kind: "loc", loc })} style={{ cursor: "zoom-in" }}>
              <h2>{loc}</h2>
              {isAdmin && (
                <button className="btn btn-default" onClick={(e) => { e.stopPropagation(); handleAddNewItem(loc); }}>
                  +추가
                </button>
              )}
            </div>

            <div className="card-content scroll">
              {Object.entries(subcategories).map(([cat, subs]) => (
                <details key={cat} ref={(el) => { if (el) categoryRefs.current[`${loc}-${cat}`] = el; }}>
                  <summary>📦 {cat}</summary>
                  {subs.map((sub) => (
                    <details key={sub} ref={(el) => { if (el) categoryRefs.current[`${loc}-${cat}-${sub}`] = el; }} style={{ marginLeft: 8 }}>
                      <summary>▸ {sub}</summary>
                      <ul className="item-list">
                        {(inventory[loc]?.[cat]?.[sub] || []).map((it, idx) => (
                          <li
                            key={idx}
                            className="item-row"
                            ref={(el) => {
                              const refKey = `${loc}-${cat}-${sub}-${it.name}`;
                              if (el && !categoryRefs.current[refKey]) categoryRefs.current[refKey] = el;
                            }}
                          >
                            {/* 텍스트 블록 (항상 앞줄/왼쪽, 줄바꿈 우선) */}
                            <div className="item-text">
                              <div className="item-name">
                                {it.name} <span className="item-count">({it.count}개)</span>
                              </div>
                              {it.note && <div className="item-note">특이사항: {it.note}</div>}
                            </div>

                            {/* 액션 블록 (좁은 화면에선 자동으로 다음 줄로 감김) */}
                            {isAdmin && (
                              <div className="item-actions">
                                <button className="btn btn-compact" onClick={() => handleUpdateItemCount(loc, cat, sub, idx, +1)}>＋</button>
                                <button className="btn btn-compact" onClick={() => handleUpdateItemCount(loc, cat, sub, idx, -1)}>－</button>
                                <button className="btn btn-compact" onClick={() => handleEditItemName(loc, cat, sub, idx)}>✎ 이름</button>
                                <button className="btn btn-compact" onClick={(e) => { e.stopPropagation(); handleEditItemNote(loc, cat, sub, idx); }}>📝 메모</button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 전체 요약 */}
      <section className="summary-bottom">
        <div className="card summary-card" ref={(el) => { if (el) cardRefs.current["summary"] = el; }}>
          <div className="card-head" onClick={() => setOpenPanel({ kind: "summary" })} style={{ cursor: "zoom-in" }}>
            <h2>전체</h2>
            {isAdmin && (
              <button className="btn btn-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteItem(); }}>
                삭제
              </button>
            )}
          </div>

          <div className="card-content scroll">
            {Object.entries(subcategories).map(([cat, subs]) => (
              <details key={cat} ref={(el) => { if (el) categoryRefs.current[`전체-${cat}`] = el; }}>
                <summary>📦 {cat}</summary>
                {subs.map((sub) => (
                  <details key={sub} ref={(el) => { if (el) categoryRefs.current[`전체-${cat}-${sub}`] = el; }} style={{ marginLeft: 8 }}>
                    <summary>▸ {sub}</summary>
                    <ul className="item-list">
                      {Object.entries(
                        locations.reduce((acc, L) => {
                          (inventory[L]?.[cat]?.[sub] || []).forEach((it) => {
                            acc[it.name] = (acc[it.name] || 0) + (it.count || 0);
                          });
                          return acc;
                        }, {})
                      ).map(([name, count]) => (
                        <li key={name} className="item-row">
                          <div className="item-text">
                            <div className="item-name">
                              {name} <span className="item-count">({count}개)</span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 팝업(확대 보기) */}
      {openPanel && (
        <div className="overlay" onClick={() => setOpenPanel(null)}>
          <div className="popup-card pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="popup-head">
              <h3>{openPanel.kind === "summary" ? "전체 (확대 보기)" : `${openPanel.loc} (확대 보기)`}</h3>
              <button className="btn btn-outline" onClick={() => setOpenPanel(null)}>닫기</button>
            </div>

            <div className="popup-content">
              {openPanel.kind === "summary" ? (
                Object.entries(subcategories).map(([cat, subs]) => (
                  <details key={cat} open>
                    <summary>📦 {cat}</summary>
                    {subs.map((sub) => (
                      <details key={sub} open style={{ marginLeft: 8 }}>
                        <summary>▸ {sub}</summary>
                        <ul className="item-list">
                          {Object.entries(
                            locations.reduce((acc, L) => {
                              (inventory[L]?.[cat]?.[sub] || []).forEach((it) => {
                                acc[it.name] = (acc[it.name] || 0) + (it.count || 0);
                              });
                              return acc;
                            }, {})
                          ).map(([name, count]) => (
                            <li key={name} className="item-row">
                              <div className="item-text">
                                <div className="item-name">
                                  {name} <span className="item-count">({count}개)</span>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ))}
                  </details>
                ))
              ) : (
                Object.entries(subcategories).map(([cat, subs]) => (
                  <details key={cat} open>
                    <summary>📦 {cat}</summary>
                    {subs.map((sub) => (
                      <details key={sub} open style={{ marginLeft: 8 }}>
                        <summary>▸ {sub}</summary>
                        <ul className="item-list">
                          {(inventory[openPanel.loc]?.[cat]?.[sub] || []).map((it, idx) => (
                            <li key={idx} className="item-row">
                              <div className="item-text">
                                <div className="item-name">
                                  {it.name} <span className="item-count">({it.count}개)</span>
                                </div>
                                {it.note && <div className="item-note">특이사항: {it.note}</div>}
                              </div>
                              {isAdmin && (
                                <div className="item-actions">
                                  <button className="btn btn-compact" onClick={() => handleUpdateItemCount(openPanel.loc, cat, sub, idx, +1)}>＋</button>
                                  <button className="btn btn-compact" onClick={() => handleUpdateItemCount(openPanel.loc, cat, sub, idx, -1)}>－</button>
                                  <button className="btn btn-compact" onClick={() => handleEditItemName(openPanel.loc, cat, sub, idx)}>✎ 이름</button>
                                  <button className="btn btn-compact" onClick={() => handleEditItemNote(openPanel.loc, cat, sub, idx)}>📝 메모</button>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ))}
                  </details>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* =======================
 * LogsPage
 * ======================= */
function LogsPage({ logs, setLogs }) {
  const navigate = useNavigate();

  useEffect(() => saveLocalLogs(logs), [logs]);

  const [filterDate, setFilterDate] = useState("");
  const sorted = useMemo(() => [...logs].sort((a, b) => new Date(b.ts) - new Date(a.ts)), [logs]);
  const filteredList = filterDate ? sorted.filter((l) => l.ts.slice(0, 10) === filterDate) : sorted;

  const grouped = useMemo(
    () => filteredList.reduce((acc, l) => {
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
    const arr = [...logs];
    arr[i].reason = note;
    setLogs(arr);
  }

  function deleteLog(i) {
    if (window.confirm("삭제하시겠습니까?")) {
      setLogs((prev) => prev.filter((_, j) => j !== i));
    }
  }

  function exportCSV() {
    const data = sorted.map((l) => ({
      시간: l.time,
      장소: l.location,
      상위카테고리: l.category,
      하위카테고리: l.subcategory,
      품목: l.item,
      증감: l.change,
      메모: l.reason
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
    const data = sorted.map((l) => ({
      시간: l.time,
      장소: l.location,
      상위카테고리: l.category,
      하위카테고리: l.subcategory,
      품목: l.item,
      증감: l.change,
      메모: l.reason
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Logs");
    XLSX.writeFile(wb, "기록.xlsx");
  }

  return (
    <main className="app-main logs-container" style={{ minHeight: "100vh" }}>
      <div className="logs-header">
        <button className="btn btn-default back-btn" onClick={() => navigate("/")}>← 돌아가기</button>
        <h1 className="logs-title">📘 입출고 기록</h1>
        <div className="logs-controls">
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
          <button className="btn btn-outline" onClick={() => setFilterDate("")}>필터 해제</button>
          <button className="btn btn-default" onClick={exportCSV}>📄 CSV</button>
          <button className="btn btn-default" onClick={exportExcel}>📑 Excel</button>
        </div>
      </div>

      {dates.length === 0 ? (
        <p className="muted">기록이 없습니다.</p>
      ) : (
        dates.map((d) => (
          <section key={d} style={{ marginBottom: "16px" }}>
            <h2 style={{ borderBottom: "1px solid #4b5563", paddingBottom: "4px", margin: "0 0 8px" }}>
              {formatLabel(d)}
            </h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {grouped[d].map((l, i) => {
                const idx = logs.findIndex((x) => x.ts === l.ts && x.key === l.key);
                return (
                  <li key={i} className="log-item">
                    <div className="log-text">
                      <div style={{ fontSize: 14 }}>
                        [{l.time}] {l.location} &gt; {l.category} &gt; {l.subcategory} / <strong>{l.item}</strong>
                      </div>
                      <div className={l.change > 0 ? "text-green" : "text-red"} style={{ marginTop: 4 }}>
                        {l.change > 0 ? ` 입고+${l.change}` : ` 출고-${-l.change}`}
                      </div>
                      {l.reason && (
                        <div className="log-note">메모: {l.reason}</div>
                      )}
                    </div>
                    <div className="log-actions">
                      <button className="btn btn-default" onClick={() => editReason(idx)}>{l.reason ? "메모 수정" : "메모 추가"}</button>
                      <button className="btn btn-destructive" onClick={() => deleteLog(idx)}>삭제</button>
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

/* =======================
 * AppWrapper
 * ======================= */
export default function AppWrapper() {
  const [inventory, setInventory] = useState(getLocalInventory);
  const [searchTerm, setSearchTerm] = useState("");
  const [logs, setLogs] = useState(getLocalLogs);
  const isAdmin = getLocalAdmin();

  const LoginShell = ({ children }) => (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <FixedBg
        src={`${process.env.PUBLIC_URL}/white.png`}
        overlay={null}
        maxW="min(70vw, 900px)"
        maxH="min(65vh, 700px)"
        minW="300px"
        minH="180px"
        opacity={1}
      />
      <div style={{ position: "relative", zIndex: 0 }}>{children}</div>
    </div>
  );

  return (
    <>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#232943",
            color: "#fff",
            fontWeight: 600,
            borderRadius: "1rem",
            fontSize: "1.04rem",
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale"
          },
          success: { style: { background: "#181a20", color: "#2dd4bf" } },
          error: { style: { background: "#181a20", color: "#ee3a60" } }
        }}
      />

      <Router>
        <Routes>
          {!isAdmin ? (
            <Route
              path="*"
              element={
                <LoginShell>
                  <LoginPage
                    onLogin={(pw) => {
                      if (pw === "2500") {
                        saveLocalAdmin(true);
                        window.location.reload();
                      } else {
                        toast.error("비밀번호가 틀렸습니다.");
                      }
                    }}
                  />
                </LoginShell>
              }
            />
          ) : (
            <>
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
                  />
                }
              />
              <Route path="/logs" element={<LogsPage logs={logs} setLogs={setLogs} />} />
              <Route
                path="*"
                element={
                  <Home
                    inventory={inventory}
                    setInventory={setInventory}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    logs={logs}
                    setLogs={setLogs}
                    isAdmin={isAdmin}
                  />
                }
              />
            </>
          )}
        </Routes>
      </Router>
    </>
  );
}

export { Home };
