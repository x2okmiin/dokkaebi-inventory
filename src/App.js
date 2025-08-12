// src/App.js
import React, { useState, useEffect, useRef, useMemo } from "react";
import { HashRouter as Router, Routes, Route, useNavigate, Navigate } from "react-router-dom";
import * as XLSX from "xlsx";
import "./App.css";
import LoginPage from "./LoginPage";
import { Toaster, toast } from "react-hot-toast";

/* ==== Firebase (실시간 동기화) ==== */
import { db, ref, set, update, onValue, push, runTransaction } from "./firebase";

/* =======================
 * 상수 정의
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

/* =======================
 * 유틸
 * ======================= */
// 객체 → 배열 변환(helper) : {id:{...}, ...} → [{id, ...}, ...]
const entriesToList = (obj) =>
  Object.entries(obj || {}).map(([id, v]) => ({ id, ...(v || {}) }));

const nowMeta = () => {
  const d = new Date();
  return { ts: d.toISOString(), time: d.toLocaleString() };
};

/* =======================
 * 고정 배경
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
 * Home (실시간 동기화)
 * ======================= */
function Home({ isAdmin, userId, userName }) {
  const navigate = useNavigate();

  // inventory 구조: inventory[loc][cat][sub] = { itemId: {name, count, note}, ... }
  const [inventory, setInventory] = useState({});
  // logs: { logId: {...}, ... } → 배열로 가공하여 사용
  const [logsMap, setLogsMap] = useState({});

  const [searchTerm, setSearchTerm] = useState("");
  const categoryRefs = useRef({});
  const cardRefs = useRef({});
  const [syncing, setSyncing] = useState(false);

  const [dataMenuOpen, setDataMenuOpen] = useState(false);
  const dataMenuRef = useRef(null);
  const [openPanel, setOpenPanel] = useState(null);

  /* --- (가시적인) 동기화 인디케이터 --- */
  useEffect(() => {
    setSyncing(true);
    const t = setTimeout(() => setSyncing(false), 600);
    return () => clearTimeout(t);
  }, [inventory, logsMap]);

  /* --- 외부 클릭으로 데이터 메뉴 닫기 --- */
  useEffect(() => {
    function onClickOutside(e) {
      if (dataMenuRef.current && !dataMenuRef.current.contains(e.target)) {
        setDataMenuOpen(false);
      }
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

  /* --- Firebase 구독 (inventory / logs) --- */
  useEffect(() => {
    const invRef = ref(db, "inventory");
    const logRef = ref(db, "logs");

    const unsubInv = onValue(invRef, (snap) => {
      const v = snap.val() || {};
      setInventory(v);
    });

    const unsubLogs = onValue(logRef, (snap) => {
      const v = snap.val() || {};
      setLogsMap(v);
    });

    return () => {
      unsubInv();
      unsubLogs();
    };
  }, []);

  /* ====== 엑셀 내보내기 ====== */
  function exportInventoryExcel() {
    const rows = [];
    const itemTotals = {};
    locations.forEach((loc) => {
      Object.entries(subcategories).forEach(([cat, subs]) => {
        subs.forEach((sub) => {
          const itemsObj = inventory?.[loc]?.[cat]?.[sub] || {};
          Object.values(itemsObj).forEach((item) => {
            const count = Number(item.count || 0);
            rows.push({
              장소: loc,
              상위카테고리: cat,
              하위카테고리: sub,
              품목명: item.name,
              수량: count,
            });
            if (!itemTotals[item.name]) itemTotals[item.name] = { 합계: 0, 장소별: {} };
            itemTotals[item.name].합계 += count;
            itemTotals[item.name].장소별[loc] = (itemTotals[item.name].장소별[loc] || 0) + count;
          });
        });
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
      rows.push({
        품목명: name,
        총합계: info.합계,
        ...info.장소별,
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "재고현황");
    XLSX.writeFile(wb, "재고현황.xlsx");
  }

  /* ====== 경로 헬퍼 ====== */
  const itemPath = (loc, cat, sub, itemId) => `inventory/${loc}/${cat}/${sub}/${itemId}`;

  /* ====== 수량 증감 (트랜잭션) ====== */
  async function handleUpdateItemCount(loc, cat, sub, itemId, delta) {
    if (!isAdmin || !itemId || !delta) return;
    try {
      // 트랜잭션: count만 동시성 안전하게 변경
      await runTransaction(ref(db, `${itemPath(loc, cat, sub, itemId)}/count`), (cur) => {
        const next = Math.max(0, Number(cur || 0) + delta);
        return next;
      });

      // 로그 push
      const { ts, time } = nowMeta();
      await push(ref(db, "logs"), {
        ts,
        time,
        location: loc,
        category: cat,
        subcategory: sub,
        itemId,
        itemName: inventory?.[loc]?.[cat]?.[sub]?.[itemId]?.name || "",
        change: delta,
        reason: "입출고",
        operatorId: userId || "",
        operatorName: userName || "",
      });
    } catch (e) {
      console.error(e);
      toast.error("수량 변경 실패");
    }
  }

  /* ====== 품목 이름 수정 ====== */
  async function handleEditItemName(loc, cat, sub, itemId, oldName) {
    if (!isAdmin || !itemId) return;
    const newName = prompt("새 품목명을 입력하세요:", oldName || "");
    if (!newName || newName === oldName) return;
    try {
      await update(ref(db, itemPath(loc, cat, sub, itemId)), { name: newName });
    } catch (e) {
      console.error(e);
      toast.error("이름 수정 실패");
    }
  }

  /* ====== 품목 메모 ====== */
  async function handleEditItemNote(loc, cat, sub, itemId, currentNote) {
    if (!isAdmin || !itemId) return;
    const note = prompt("특이사항을 입력하세요:", currentNote || "");
    if (note === null) return;
    try {
      await update(ref(db, itemPath(loc, cat, sub, itemId)), { note });
    } catch (e) {
      console.error(e);
      toast.error("메모 저장 실패");
    }
  }

  /* ====== 신규 품목 추가 (각 위치별로 생성) ====== */
  async function handleAddNewItem(loc) {
    if (!isAdmin) return;
    const cat = prompt("상위 카테고리 선택:\n" + Object.keys(subcategories).join(", "));
    if (!cat || !subcategories[cat]) return toast.error("올바른 카테고리가 아닙니다.");
    const sub = prompt("하위 카테고리 선택:\n" + subcategories[cat].join(", "));
    if (!sub || !subcategories[cat].includes(sub)) return toast.error("올바른 하위카테고리가 아닙니다.");
    const name = prompt("추가할 품목명:");
    if (!name) return;
    const count = Number(prompt("초기 수량 입력:"));
    if (isNaN(count) || count < 0) return toast.error("수량이 올바르지 않습니다.");

    try {
      // 모든 위치에 동일 품목 key 생성(이 위치는 count=입력값, 타 위치는 0)
      for (const L of locations) {
        const newRef = push(ref(db, `inventory/${L}/${cat}/${sub}`));
        await set(newRef, {
          name,
          count: L === loc ? count : 0,
          note: "",
        });
      }
    } catch (e) {
      console.error(e);
      toast.error("품목 추가 실패");
    }
  }

  /* ====== 품목 전체 삭제(이름으로) ====== */
  async function handleDeleteItemByName() {
    if (!isAdmin) return;
    const name = prompt("삭제할 품목 이름을 입력하세요:");
    if (!name) return;

    try {
      let total = 0;
      // 서버 상태 기준으로 스캔 후 해당 name 모두 삭제
      const inv = inventory || {};
      const touched = [];
      for (const L of locations) {
        const cats = inv[L] || {};
        for (const [cat, subs] of Object.entries(cats)) {
          for (const [sub, itemsObj] of Object.entries(subs || {})) {
            for (const [id, it] of Object.entries(itemsObj || {})) {
              if ((it?.name || "") === name) {
                total += Number(it?.count || 0);
                touched.push({ L, cat, sub, id });
              }
            }
          }
        }
      }
      if (touched.length === 0) return toast.error("해당 품목이 존재하지 않습니다.");

      const updates = {};
      touched.forEach(({ L, cat, sub, id }) => {
        updates[`${itemPath(L, cat, sub, id)}`] = null; // 삭제
      });
      await update(ref(db), updates);

      const { ts, time } = nowMeta();
      await push(ref(db, "logs"), {
        ts, time,
        location: "전체",
        category: "삭제",
        subcategory: "",
        itemId: "",
        itemName: name,
        change: -total,
        reason: "해당 품목은 총괄 삭제됨",
        operatorId: userId || "",
        operatorName: userName || "",
      });
    } catch (e) {
      console.error(e);
      toast.error("삭제 실패");
    }
  }

  /* ====== 검색 / 집계 ====== */
  const filtered = useMemo(() => {
    const res = [];
    for (const L of locations) {
      for (const [cat, subs] of Object.entries(inventory?.[L] || {})) {
        for (const [sub, itemsObj] of Object.entries(subs || {})) {
          for (const [id, it] of Object.entries(itemsObj || {})) {
            if (!it?.name) continue;
            if (it.name.toLowerCase().includes(searchTerm.toLowerCase())) {
              res.push({ loc: L, cat, sub, id, name: it.name, count: Number(it.count || 0), note: it.note || "" });
            }
          }
        }
      }
    }
    return res;
  }, [inventory, searchTerm]);

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

  /* ====== 검색 → 위치로 스크롤 ====== */
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

  return (
    <main className="app-main fade-in">
      {/* 고정 배경 */}
      <FixedBg
        src={`${process.env.PUBLIC_URL}/DRONE_SOCCER_DOKKEBI2-Photoroom.png`}
        overlay="rgba(0,0,0,.18)"
        maxW="min(85vw, 1200px)"
        maxH="min(70vh, 800px)"
        minW="360px"
        minH="220px"
        opacity={0.9}
      />

      {/* 동기화 표시 */}
      {syncing && (
        <div className="sync-indicator">
          <span className="spinner" /> 동기화 중...
        </div>
      )}

      <h1 className="dk-main-title" style={{ textAlign: "center", marginTop: "0.5rem" }}>
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
        />

        <button className="btn btn-default" onClick={() => navigate("/logs")}>
          📘 기록
        </button>

        <div className="data-menu-wrap" ref={dataMenuRef}>
          <button
            className="btn btn-default"
            onClick={() => setDataMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={dataMenuOpen}
          >
            📦 데이터
          </button>
          {dataMenuOpen && (
            <div className="data-menu" role="menu">
              <button
                className="menu-item"
                onClick={() => {
                  exportInventoryExcel();
                  setDataMenuOpen(false);
                }}
              >
                📤 재고 Excel 내보내기
              </button>
              <button
                className="menu-item"
                disabled
                title="베타: 아직 미구현"
                style={{ opacity: 0.55, textDecoration: "underline dotted", cursor: "not-allowed" }}
              >
                📥 가져오기 (베타)
              </button>
            </div>
          )}
        </div>

        {isAdmin && (
          <button
            className="btn btn-default"
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

      {/* 검색 결과 */}
      {searchTerm && (
        <div className="search-result" style={{ margin: "10px auto" }}>
          <h3 style={{ margin: 0, marginBottom: 6 }}>🔍 검색 결과</h3>
          {aggregated.length === 0 ? (
            <p style={{ color: "#9ca3af" }}>검색된 결과가 없습니다.</p>
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

      {/* 장소 카드 */}
      <div className="cards-grid">
        {locations.map((loc) => (
          <div key={loc} className="card fixed" ref={(el) => { if (el) cardRefs.current[loc] = el; }}>
            <div
              className="card-head"
              onClick={() => setOpenPanel({ kind: "loc", loc })}
              style={{ cursor: "zoom-in" }}
            >
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
                  {subs.map((sub) => {
                    const items = entriesToList(inventory?.[loc]?.[cat]?.[sub]);
                    return (
                      <details key={sub} ref={(el) => { if (el) categoryRefs.current[`${loc}-${cat}-${sub}`] = el; }} style={{ marginLeft: 8 }}>
                        <summary>▸ {sub}</summary>
                        <ul className="item-list">
                          {items.map((it) => (
                            <li
                              key={it.id}
                              className="item-row"
                              ref={(el) => {
                                const refKey = `${loc}-${cat}-${sub}-${it.name}`;
                                if (el && !categoryRefs.current[refKey]) categoryRefs.current[refKey] = el;
                              }}
                            >
                              <div className="item-text">
                                <span className="item-name">
                                  {it.name} <span className="item-count">({Number(it.count || 0)}개)</span>
                                </span>
                                {it.note && <div className="item-note">특이사항: {it.note}</div>}
                              </div>
                              {isAdmin && (
                                <div className="item-actions">
                                  <button className="btn btn-default btn-compact" onClick={() => handleUpdateItemCount(loc, cat, sub, it.id, +1)}>＋</button>
                                  <button className="btn btn-default btn-compact" onClick={() => handleUpdateItemCount(loc, cat, sub, it.id, -1)}>－</button>
                                  <button className="btn btn-default btn-compact" onClick={() => handleEditItemName(loc, cat, sub, it.id, it.name)}>✎ 이름</button>
                                  <button className="btn btn-default btn-compact" onClick={(e) => { e.stopPropagation(); handleEditItemNote(loc, cat, sub, it.id, it.note); }}>📝 메모</button>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </details>
                    );
                  })}
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
              <button className="btn btn-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteItemByName(); }}>
                삭제
              </button>
            )}
          </div>

          <div className="card-content scroll">
            {Object.entries(subcategories).map(([cat, subs]) => (
              <details key={cat} ref={(el) => { if (el) categoryRefs.current[`전체-${cat}`] = el; }}>
                <summary>📦 {cat}</summary>
                {subs.map((sub) => {
                  // 모든 위치 합산
                  const sumByName = {};
                  for (const L of locations) {
                    const items = inventory?.[L]?.[cat]?.[sub] || {};
                    Object.values(items).forEach((it) => {
                      if (!it?.name) return;
                      sumByName[it.name] = (sumByName[it.name] || 0) + Number(it.count || 0);
                    });
                  }
                  return (
                    <details key={sub} ref={(el) => { if (el) categoryRefs.current[`전체-${cat}-${sub}`] = el; }} style={{ marginLeft: 8 }}>
                      <summary>▸ {sub}</summary>
                      <ul className="item-list">
                        {Object.entries(sumByName).map(([name, count]) => (
                          <li key={name} className="item-row">
                            <div className="item-text">
                              <span className="item-name">{name} <span className="item-count">({count}개)</span></span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })}
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 팝업 */}
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
                    {subs.map((sub) => {
                      const sumByName = {};
                      for (const L of locations) {
                        const items = inventory?.[L]?.[cat]?.[sub] || {};
                        Object.values(items).forEach((it) => {
                          if (!it?.name) return;
                          sumByName[it.name] = (sumByName[it.name] || 0) + Number(it.count || 0);
                        });
                      }
                      return (
                        <details key={sub} open style={{ marginLeft: 8 }}>
                          <summary>▸ {sub}</summary>
                          <ul className="item-list">
                            {Object.entries(sumByName).map(([name, count]) => (
                              <li key={name} className="item-row">
                                <div className="item-text">
                                  <span className="item-name">{name} <span className="item-count">({count}개)</span></span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </details>
                      );
                    })}
                  </details>
                ))
              ) : (
                Object.entries(subcategories).map(([cat, subs]) => (
                  <details key={cat} open>
                    <summary>📦 {cat}</summary>
                    {subs.map((sub) => {
                      const items = entriesToList(inventory?.[openPanel.loc]?.[cat]?.[sub]);
                      return (
                        <details key={sub} open style={{ marginLeft: 8 }}>
                          <summary>▸ {sub}</summary>
                          <ul className="item-list">
                            {items.map((it) => (
                              <li key={it.id} className="item-row">
                                <div className="item-text">
                                  <span className="item-name">
                                    {it.name} <span className="item-count">({Number(it.count || 0)}개)</span>
                                  </span>
                                  {it.note && <div className="item-note">특이사항: {it.note}</div>}
                                </div>
                                {isAdmin && (
                                  <div className="item-actions">
                                    <button className="btn btn-default btn-compact" onClick={() => handleUpdateItemCount(openPanel.loc, cat, sub, it.id, +1)}>＋</button>
                                    <button className="btn btn-default btn-compact" onClick={() => handleUpdateItemCount(openPanel.loc, cat, sub, it.id, -1)}>－</button>
                                    <button className="btn btn-default btn-compact" onClick={() => handleEditItemName(openPanel.loc, cat, sub, it.id, it.name)}>✎ 이름</button>
                                    <button className="btn btn-default btn-compact" onClick={() => handleEditItemNote(openPanel.loc, cat, sub, it.id, it.note)}>📝 메모</button>
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </details>
                      );
                    })}
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
 * LogsPage — push 기반 (실시간)
 * ======================= */
function LogsPage() {
  const navigate = useNavigate();
  const [logsMap, setLogsMap] = useState({}); // {logId: {...}}
  const [filterDate, setFilterDate] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const menuRef = useRef(null);

  // 구독
  useEffect(() => {
    const logRef = ref(db, "logs");
    return onValue(logRef, (snap) => setLogsMap(snap.val() || {}));
  }, []);

  const logs = useMemo(() => {
    const arr = Object.entries(logsMap).map(([id, v]) => ({ id, ...(v || {}) }));
    arr.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    return arr;
  }, [logsMap]);

  const filteredList = filterDate ? logs.filter((l) => (l.ts || "").slice(0, 10) === filterDate) : logs;

  const grouped = useMemo(
    () =>
      filteredList.reduce((acc, l) => {
        const day = (l.ts || "").slice(0, 10);
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

  async function editReason(logId, current) {
    const note = prompt("메모:", current || "");
    if (note === null) return;
    try {
      await update(ref(db, `logs/${logId}`), { reason: note });
    } catch (e) {
      console.error(e);
      toast.error("메모 저장 실패");
    }
  }

  async function deleteLog(logId) {
    if (!window.confirm("삭제하시겠습니까?")) return;
    try {
      await set(ref(db, `logs/${logId}`), null);
    } catch (e) {
      console.error(e);
      toast.error("삭제 실패");
    }
  }

  function exportCSV(list) {
    const data = list.map((l) => ({
      시간: l.time,
      장소: l.location,
      상위카테고리: l.category,
      하위카테고리: l.subcategory,
      품목: l.itemName || "",
      증감: l.change,
      메모: l.reason || "",
      ID: l.operatorId || "",
      이름: l.operatorName || "",
    }));
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(data));
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "기록.csv";
    a.click();
  }

  function exportExcel(list) {
    const data = list.map((l) => ({
      시간: l.time,
      장소: l.location,
      상위카테고리: l.category,
      하위카테고리: l.subcategory,
      품목: l.itemName || "",
      증감: l.change,
      메모: l.reason || "",
      ID: l.operatorId || "",
      이름: l.operatorName || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Logs");
    XLSX.writeFile(wb, "기록.xlsx");
  }

  // 외부 클릭으로 메뉴 닫기
  useEffect(() => {
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setExportOpen(false);
      }
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

  return (
    <main className="app-main logs-container" style={{ minHeight: "100vh" }}>
      <div className="logs-header">
        <button className="btn btn-default back-btn" onClick={() => navigate("/")}>← 돌아가기</button>
        <h1 className="logs-title">📘 입출고 기록</h1>

        <div className="logs-controls">
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
          <button className="btn btn-outline" onClick={() => setFilterDate("")}>필터 해제</button>

          <div className="data-menu-wrap" ref={menuRef}>
            <button
              className="btn btn-default"
              onClick={() => setExportOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
            >
              ⬇ 내보내기
            </button>
            {exportOpen && (
              <div className="data-menu" role="menu">
                <button className="menu-item" onClick={() => { exportCSV(logs); setExportOpen(false); }}>
                  📄 CSV 내보내기
                </button>
                <button className="menu-item" onClick={() => { exportExcel(logs); setExportOpen(false); }}>
                  📑 Excel 내보내기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {dates.length === 0 ? (
        <p style={{ color: "#9ca3af" }}>기록이 없습니다.</p>
      ) : (
        dates.map((d) => (
          <section key={d} style={{ marginBottom: "16px" }}>
            <h2 style={{ borderBottom: "1px solid #4b5563", paddingBottom: "4px", margin: "0 0 8px" }}>{formatLabel(d)}</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {grouped[d].map((l) => (
                <li key={l.id} className="log-item">
                  <div className="log-text">
                    <div style={{ fontSize: 14 }}>
                      [{l.time}] {l.location} &gt; {l.category} &gt; {l.subcategory} / <strong>{l.itemName}</strong>
                    </div>
                    <div className={l.change > 0 ? "text-green" : "text-red"} style={{ marginTop: 4 }}>
                      {l.change > 0 ? ` 입고+${l.change}` : ` 출고-${-l.change}`}
                    </div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      👤 {l.operatorId ? `[${l.operatorId}]` : ""} {l.operatorName || ""}
                    </div>
                    {l.reason && <div className="log-note">메모: {l.reason}</div>}
                  </div>
                  <div className="log-actions">
                    <button className="btn btn-default" onClick={() => editReason(l.id, l.reason)}>{l.reason ? "메모 수정" : "메모 추가"}</button>
                    <button className="btn btn-destructive" onClick={() => deleteLog(l.id)}>삭제</button>
                  </div>
                </li>
              ))}
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
  const isAdmin = getLocalAdmin();
  const [userId, setUserId] = useState(getLocalUserId);
  const [userName, setUserName] = useState(getLocalUserName);

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
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(15, 23, 42, 0.6)",
          zIndex: -1
        }}
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
            fontSize: "1.08rem",
          },
          success: { style: { background: "#181a20", color: "#2dd4bf" } },
          error: { style: { background: "#181a20", color: "#ee3a60" } },
        }}
      />

      <Router>
        <Routes>
          {!isAdmin ? (
            <>
              <Route
                path="/login"
                element={
                  <LoginShell>
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
                  </LoginShell>
                }
              />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          ) : (
            <>
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="/" element={<Home isAdmin={isAdmin} userId={userId} userName={userName} />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </Router>
    </>
  );
}

export { Home };
