// src/App.js
import React, { useState, useEffect, useRef, useMemo } from "react";
import { HashRouter as Router, Routes, Route, useNavigate, Navigate } from "react-router-dom";
import * as XLSX from "xlsx";
import "./App.css";
import LoginPage from "./LoginPage";
import { Toaster, toast } from "react-hot-toast";

/* ==== Firebase (실시간 동기화) ==== */
import { db, ref, set, onValue } from "./firebase";

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
function getLocalInventory() {
  const d = localStorage.getItem("do-kkae-bi-inventory");
  if (d) return JSON.parse(d);
  const base = {};
  locations.forEach((loc) => {
    base[loc] = {};
    Object.keys(subcategories).forEach((cat) => {
      base[loc][cat] = {};
      subcategories[cat].forEach((sub) => {
        base[loc][cat][sub] = [];
      });
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
 * Home
 * ======================= */
function Home({ inventory, setInventory, searchTerm, setSearchTerm, logs, setLogs, isAdmin }) {
  const navigate = useNavigate();
  const categoryRefs = useRef({});
  const cardRefs = useRef({});
  const [syncing, setSyncing] = useState(false);

  // 데이터 메뉴 (Export/Import)
  const [dataMenuOpen, setDataMenuOpen] = useState(false);
  const dataMenuRef = useRef(null);

  // 팝업(확대 보기) 상태
  const [openPanel, setOpenPanel] = useState(null);

  // 🔒 클라우드 → 로컬 적용 중인지(무한 루프 방지)
  const applyingCloudRef = useRef({ inv: false, logs: false });

  /* --- (가시적인) 동기화 인디케이터 --- */
  useEffect(() => {
    setSyncing(true);
    const t = setTimeout(() => setSyncing(false), 700);
    return () => clearTimeout(t);
  }, [inventory, logs]);

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

  /* --- Firebase 실시간 구독 (읽기) --- */
  useEffect(() => {
    const invRef = ref(db, "inventory/");
    const logRef = ref(db, "logs/");

    const unsubInv = onValue(invRef, (snap) => {
      if (!snap.exists()) return;
      const cloud = snap.val();
      if (JSON.stringify(cloud) !== JSON.stringify(inventory)) {
        applyingCloudRef.current.inv = true;
        setInventory(cloud);
        saveLocalInventory(cloud);
      }
    });

    const unsubLogs = onValue(logRef, (snap) => {
      if (!snap.exists()) return;
      const cloud = snap.val();
      if (JSON.stringify(cloud) !== JSON.stringify(logs)) {
        applyingCloudRef.current.logs = true;
        setLogs(cloud);
        saveLocalLogs(cloud);
      }
    });

    return () => {
      unsubInv();
      unsubLogs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 초기에만 구독

  /* ====== 재고 엑셀 내보내기 ====== */
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
            });
            if (!itemTotals[item.name]) itemTotals[item.name] = { 합계: 0, 장소별: {} };
            itemTotals[item.name].합계 += item.count;
            itemTotals[item.name].장소별[loc] = (itemTotals[item.name].장소별[loc] || 0) + item.count;
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

  /* ====== 클라우드 쓰기 헬퍼 ====== */
  const setSubArrayToCloud = async (loc, cat, sub, arr) => {
    try {
      await set(ref(db, `inventory/${loc}/${cat}/${sub}`), arr);
    } catch (e) {
      console.error(e);
      toast.error("클라우드 저장 실패 (재고)");
    }
  };
  const setLogsToCloud = async (nextLogs) => {
    try {
      await set(ref(db, "logs/"), nextLogs);
    } catch (e) {
      console.error(e);
      toast.error("클라우드 저장 실패 (기록)");
    }
  };

  /* ====== 수량 증감 — 서브경로 전체 저장 ====== */
  function handleUpdateItemCount(loc, cat, sub, idx, delta) {
    if (!isAdmin || delta === 0) return;
    const itemName = inventory[loc]?.[cat]?.[sub]?.[idx]?.name;
    if (!itemName) return;

    // 1) 로컬 즉시 반영
    const nextInv = JSON.parse(JSON.stringify(inventory));
    const it = nextInv[loc][cat][sub][idx];
    it.count = Math.max(0, (it.count || 0) + delta);
    setInventory(nextInv);
    saveLocalInventory(nextInv);

    // 2) 클라우드 반영 (서브경로 전체)
    setSubArrayToCloud(loc, cat, sub, nextInv[loc][cat][sub]);

    // 3) 로그 추가/병합 + 클라우드 반영
    const now = new Date();
    const ts = now.toISOString();
    const time = now.toLocaleString();
    const key = `${loc}|${cat}|${sub}|${itemName}|${delta > 0 ? "IN" : "OUT"}`;

    setLogs((prev) => {
      const arr = [...prev];
      const mergeIdx = arr.findIndex(
        (l) => l.key === key && now - new Date(l.ts) < 60 * 60 * 1000
      );
      if (mergeIdx > -1) {
        arr[mergeIdx] = { ...arr[mergeIdx], change: arr[mergeIdx].change + delta, time, ts };
      } else {
        arr.unshift({
          key,
          location: loc,
          category: cat,
          subcategory: sub,
          item: itemName,
          change: delta,
          reason: "입출고",
          time,
          ts,
        });
      }
      saveLocalLogs(arr);
      setLogsToCloud(arr);
      return arr;
    });
  }

  /* ====== 품목 이름 수정 ====== */
  function handleEditItemName(loc, cat, sub, idx) {
    if (!isAdmin) return;
    const oldName = inventory[loc][cat][sub][idx].name;
    const newName = prompt("새 품목명을 입력하세요:", oldName);
    if (!newName || newName === oldName) return;

    const nextInv = JSON.parse(JSON.stringify(inventory));
    locations.forEach((L) => {
      nextInv[L][cat][sub] = nextInv[L][cat][sub].map((item) =>
        item.name === oldName ? { ...item, name: newName } : item
      );
    });
    setInventory(nextInv);
    saveLocalInventory(nextInv);
    // 위치별 서브경로 저장
    locations.forEach((L) => setSubArrayToCloud(L, cat, sub, nextInv[L][cat][sub]));
  }

  /* ====== 품목 메모 ====== */
  function handleEditItemNote(loc, cat, sub, idx) {
    if (!isAdmin) return;
    const nextInv = JSON.parse(JSON.stringify(inventory));
    const it = nextInv[loc][cat][sub][idx];
    const note = prompt("특이사항을 입력하세요:", it.note || "");
    if (note === null) return;
    it.note = note;
    setInventory(nextInv);
    saveLocalInventory(nextInv);
    setSubArrayToCloud(loc, cat, sub, nextInv[loc][cat][sub]);
  }

  /* ====== 신규 품목 추가 ====== */
  function handleAddNewItem(loc) {
    if (!isAdmin) return;
    const cat = prompt("상위 카테고리 선택:\n" + Object.keys(subcategories).join(", "));
    if (!cat || !subcategories[cat]) return toast.error("올바른 카테고리가 아닙니다.");
    const sub = prompt("하위 카테고리 선택:\n" + subcategories[cat].join(", "));
    if (!sub || !subcategories[cat].includes(sub)) return toast.error("올바른 하위카테고리가 아닙니다.");
    const name = prompt("추가할 품목명:");
    if (!name) return;
    const count = Number(prompt("초기 수량 입력:"));
    if (isNaN(count) || count < 0) return toast.error("수량이 올바르지 않습니다.");

    const nextInv = JSON.parse(JSON.stringify(inventory));
    locations.forEach((L) => {
      if (!nextInv[L][cat]) nextInv[L][cat] = {};
      if (!nextInv[L][cat][sub]) nextInv[L][cat][sub] = [];
      nextInv[L][cat][sub].push({ name, count: L === loc ? count : 0, note: "" });
    });
    setInventory(nextInv);
    saveLocalInventory(nextInv);
    // 위치별 서브경로 저장
    locations.forEach((L) => setSubArrayToCloud(L, cat, sub, nextInv[L][cat][sub]));
  }

  /* ====== 품목 전체 삭제(이름으로) ====== */
  function handleDeleteItem() {
    if (!isAdmin) return;
    const name = prompt("삭제할 품목 이름을 입력하세요:");
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

    const nextInv = JSON.parse(JSON.stringify(inventory));
    const touched = [];
    locations.forEach((L) => {
      Object.keys(nextInv[L]).forEach((cat) => {
        Object.keys(nextInv[L][cat]).forEach((sub) => {
          const before = nextInv[L][cat][sub] || [];
          const after = before.filter((item) => item.name !== name);
          if (after.length !== before.length) {
            nextInv[L][cat][sub] = after;
            touched.push([L, cat, sub, after]);
          }
        });
      });
    });
    setInventory(nextInv);
    saveLocalInventory(nextInv);
    touched.forEach(([L, cat, sub, arr]) => setSubArrayToCloud(L, cat, sub, arr));

    const now = new Date(), ts = now.toISOString(), time = now.toLocaleString();
    const nextLogs = [
      {
        key: `전체||${name}|OUT`,
        location: "전체",
        category: "삭제",
        subcategory: "",
        item: name,
        change: -totalCount,
        reason: "해당 품목은 총괄 삭제됨",
        time, ts,
      },
      ...logs,
    ];
    setLogs(nextLogs);
    saveLocalLogs(nextLogs);
    setLogsToCloud(nextLogs);
  }

  /* ====== 검색 / 결과 집계 ====== */
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

  /* ====== 검색 결과 클릭 → 해당 위치로 ====== */
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

        {/* 📦 데이터 드롭다운 (내보내기/가져오기) */}
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

              {/* 베타: 가져오기 비활성화 */}
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

        {/* 🚪 로그아웃 (관리자만 노출) */}
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

      {/* 장소 카드들 */}
      <div className="cards-grid">
        {locations.map((loc) => (
          <div
            key={loc}
            className="card fixed"
            ref={(el) => { if (el) cardRefs.current[loc] = el; }}
          >
            <div
              className="card-head"
              onClick={() => setOpenPanel({ kind: "loc", loc })}
              style={{ cursor: "zoom-in" }}
            >
              <h2>{loc}</h2>
              {isAdmin && (
                <button
                  className="btn btn-default"
                  onClick={(e) => { e.stopPropagation(); handleAddNewItem(loc); }}
                >
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
                            <div className="item-text">
                              <span className="item-name">
                                {it.name} <span className="item-count">({it.count}개)</span>
                              </span>
                              {it.note && <div className="item-note">특이사항: {it.note}</div>}
                            </div>
                            {isAdmin && (
                              <div className="item-actions">
                                <button className="btn btn-default btn-compact" onClick={() => handleUpdateItemCount(loc, cat, sub, idx, +1)}>＋</button>
                                <button className="btn btn-default btn-compact" onClick={() => handleUpdateItemCount(loc, cat, sub, idx, -1)}>－</button>
                                <button className="btn btn-default btn-compact" onClick={() => handleEditItemName(loc, cat, sub, idx)}>✎ 이름</button>
                                <button className="btn btn-default btn-compact" onClick={(e) => { e.stopPropagation(); handleEditItemNote(loc, cat, sub, idx); }}>📝 메모</button>
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
        <div
          className="card summary-card"
          ref={(el) => { if (el) cardRefs.current["summary"] = el; }}
        >
          <div
            className="card-head"
            onClick={() => setOpenPanel({ kind: "summary" })}
            style={{ cursor: "zoom-in" }}
          >
            <h2>전체</h2>
            {isAdmin && (
              <button
                className="btn btn-destructive"
                onClick={(e) => { e.stopPropagation(); handleDeleteItem(); }}
              >
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
                          (inventory[L]?.[cat]?.[sub] || []).forEach((it) => { acc[it.name] = (acc[it.name] || 0) + (it.count || 0); });
                          return acc;
                        }, {})
                      ).map(([name, count]) => (
                        <li key={name} className="item-row">
                          <div className="item-text">
                            <span className="item-name">{name} <span className="item-count">({count}개)</span></span>
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

      {/* 팝업 */}
      {openPanel && (
        <div className="overlay" onClick={() => setOpenPanel(null)}>
          <div className="popup-card pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="popup-head">
              <h3>
                {openPanel.kind === "summary" ? "전체 (확대 보기)" : `${openPanel.loc} (확대 보기)`}
              </h3>
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
                              (inventory[L]?.[cat]?.[sub] || []).forEach((it) => { acc[it.name] = (acc[it.name] || 0) + (it.count || 0); });
                              return acc;
                            }, {})
                          ).map(([name, count]) => (
                            <li key={name} className="item-row">
                              <div className="item-text">
                                <span className="item-name">{name} <span className="item-count">({count}개)</span></span>
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
                                <span className="item-name">
                                  {it.name} <span className="item-count">({it.count}개)</span>
                                </span>
                                {it.note && <div className="item-note">특이사항: {it.note}</div>}
                              </div>
                              {isAdmin && (
                                <div className="item-actions">
                                  <button className="btn btn-default btn-compact" onClick={() => handleUpdateItemCount(openPanel.loc, cat, sub, idx, +1)}>＋</button>
                                  <button className="btn btn-default btn-compact" onClick={() => handleUpdateItemCount(openPanel.loc, cat, sub, idx, -1)}>－</button>
                                  <button className="btn btn-default btn-compact" onClick={() => handleEditItemName(openPanel.loc, cat, sub, idx)}>✎ 이름</button>
                                  <button className="btn btn-default btn-compact" onClick={() => handleEditItemNote(openPanel.loc, cat, sub, idx)}>📝 메모</button>
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
  const [filterDate, setFilterDate] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => saveLocalLogs(logs), [logs]);

  const sorted = useMemo(() => [...logs].sort((a, b) => new Date(b.ts) - new Date(a.ts)), [logs]);
  const filteredList = filterDate ? sorted.filter((l) => l.ts.slice(0, 10) === filterDate) : sorted;

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
    const arr = [...logs];
    arr[i].reason = note;
    setLogs(arr);
    set(ref(db, "logs/"), arr).catch(() => toast.error("클라우드 저장 실패 (기록)"));
  }

  function deleteLog(i) {
    if (window.confirm("삭제하시겠습니까?")) {
      const next = logs.filter((_, j) => j !== i);
      setLogs(next);
      set(ref(db, "logs/"), next).catch(() => toast.error("클라우드 저장 실패 (기록)"));
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
    const data = sorted.map((l) => ({
      시간: l.time,
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
      </div>

      {dates.length === 0 ? (
        <p style={{ color: "#9ca3af" }}>기록이 없습니다.</p>
      ) : (
        dates.map((d) => (
          <section key={d} style={{ marginBottom: "16px" }}>
            <h2 style={{ borderBottom: "1px solid #4b5563", paddingBottom: "4px", margin: "0 0 8px" }}>{formatLabel(d)}</h2>
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
                      {l.reason && <div className="log-note">메모: {l.reason}</div>}
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

  // 로그인 라우트용 래퍼
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
          style: { background: "#232943", color: "#fff", fontWeight: 600, borderRadius: "1rem", fontSize: "1.08rem" },
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
                      onLogin={(pw) => {
                        if (pw === "2500") {
                          saveLocalAdmin(true);
                          window.location.hash = "#/";
                          window.location.reload();
                        } else {
                          toast.error("비밀번호가 틀렸습니다.");
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </Router>
    </>
  );
}

export { Home };
