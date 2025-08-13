// src/App.js
import React, { useState, useEffect, useRef, useMemo } from "react";
import { HashRouter as Router, Routes, Route, useNavigate, Navigate } from "react-router-dom";
import * as XLSX from "xlsx";
import "./App.css";
import LoginPage from "./LoginPage";
import { Toaster, toast } from "react-hot-toast";

/* Firebase */
import { db, ref, set, onValue } from "./firebase";

/* 상수 */
const locations = ["동아리방", "비행장", "교수님방"];
const subcategories = {
  공구: ["수리", "납땜 용품", "드라이버", "그외 공구"],
  소모품: [
    "카본 프레임",
    "펜타 가드",
    "케이블 타이",
    "프로펠러",
    "XT커넥터",
    "볼트너트",
    "납땜 관련",
    "벨크로",
    "배터리",
    "LED",
    "테이프",
    "그외 소모품",
  ],
  "드론 제어부": ["FC", "FC ESC 연결선", "ESC", "모터", "수신기", "콘덴서", "제어부 세트"],
  "조종기 개수": ["학교", "개인"],
  "기체 개수": [],
};

/* localStorage helpers */
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
function getLocalUserId() {
  return localStorage.getItem("do-kkae-bi-user-id") || "";
}
function getLocalUserName() {
  return localStorage.getItem("do-kkae-bi-user-name") || "";
}

/* 고정 배경(로고 이미지 유지) */
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

/* 오로라/그리드 네온 */
function NeonBackdrop() {
  return (
    <>
      <div className="bg-aurora" aria-hidden />
      <div className="bg-grid" aria-hidden />
    </>
  );
}

/* Home */
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

  const applyingCloudRef = useRef({ inv: false, logs: false });

  /* 쓰기(관리자), 로컬 저장 */
  useEffect(() => {
    if (applyingCloudRef.current.inv) {
      applyingCloudRef.current.inv = false;
      return;
    }
    saveLocalInventory(inventory);
    if (isAdmin) set(ref(db, "inventory/"), inventory).catch(() => {});
  }, [inventory, isAdmin]);

  useEffect(() => {
    if (applyingCloudRef.current.logs) {
      applyingCloudRef.current.logs = false;
      return;
    }
    saveLocalLogs(logs);
    if (isAdmin) set(ref(db, "logs/"), logs).catch(() => {});
  }, [logs, isAdmin]);

  /* 읽기 구독 */
  useEffect(() => {
    const invRef = ref(db, "inventory/");
    const logRef = ref(db, "logs/");

    const unsubInv = onValue(invRef, (snap) => {
      if (!snap.exists()) return;
      const cloud = snap.val();
      if (JSON.stringify(cloud) !== JSON.stringify(inventory)) {
        applyingCloudRef.current.inv = true;
        setInventory(cloud);
      }
    });

    const unsubLogs = onValue(logRef, (snap) => {
      if (!snap.exists()) return;
      const cloud = snap.val();
      if (JSON.stringify(cloud) !== JSON.stringify(logs)) {
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

  /* 동기화 인디케이터 */
  useEffect(() => {
    setSyncing(true);
    const t = setTimeout(() => setSyncing(false), 700);
    return () => clearTimeout(t);
  }, [inventory, logs]);

  /* 외부 클릭 닫기 */
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

  /* 팝업 열릴 때 스크롤 */
  useEffect(() => {
    if (!openPanel) return;
    const key = openPanel.kind === "summary" ? "summary" : openPanel.loc;
    const el = cardRefs.current[key];
    if (el?.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [openPanel]);

  /* 내보내기 */
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
      rows.push({ 품목명: name, 총합계: info.합계, ...info.장소별 });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "재고현황");
    XLSX.writeFile(wb, "재고현황.xlsx");
  }

  /* 수량 증감(1시간 병합) + 작업자 */
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
        arr[mergeIdx] = {
          ...arr[mergeIdx],
          change: arr[mergeIdx].change + delta,
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
          subcategory: sub,
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

  /* 이름/메모/추가/삭제 */
  function handleEditItemName(loc, cat, sub, idx) {
    if (!isAdmin) return;
    const oldName = inventory[loc][cat][sub][idx].name;
    const newName = prompt("새 품목명을 입력하세요:", oldName);
    if (!newName || newName === oldName) return;
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

  /* === 변경됨: 카테고리 번호 선택 + '직접 입력한 품목명' & 중복 검사 === */
  function handleAddNewItem(loc) {
    if (!isAdmin) return;

    // 상위 카테고리 번호 선택
    const catKeys = Object.keys(subcategories);
    const catPick = prompt(
      "상위 카테고리 번호 선택:\n" + catKeys.map((c, i) => `${i + 1}. ${c}`).join("\n")
    );
    const catIdx = Number(catPick);
    if (!Number.isInteger(catIdx) || catIdx < 1 || catIdx > catKeys.length) {
      return toast.error("올바른 번호가 아닙니다.");
    }
    const cat = catKeys[catIdx - 1];

    // 하위 카테고리 번호 선택
    const subs = subcategories[cat] || [];
    if (subs.length === 0) return toast.error("해당 카테고리는 하위 카테고리가 없습니다.");
    const subPick = prompt(
      `하위 카테고리 번호 선택 [${cat}]:\n` + subs.map((s, i) => `${i + 1}. ${s}`).join("\n")
    );
    const subIdx = Number(subPick);
    if (!Number.isInteger(subIdx) || subIdx < 1 || subIdx > subs.length) {
      return toast.error("올바른 번호가 아닙니다.");
    }
    const sub = subs[subIdx - 1];

    // 초기 수량
    const count = Number(prompt("초기 수량 입력:"));
    if (isNaN(count) || count < 0) return toast.error("수량이 올바르지 않습니다.");

// ⛔ 기존 while(true) 재입력 로직 삭제
// ✅ 단일 입력 + 중복이면 취소(리턴)
const input = prompt("추가할 품목명을 입력하세요:");
if (!input) return; // 취소 또는 빈값 → 중단
const name = input.trim();

// 중복 검사(세 장소 전체 cat/sub 범위)
const existsAnywhere = locations.some((L) =>
  (inventory[L]?.[cat]?.[sub] || []).some((it) => (it.name || "") === name)
);
if (existsAnywhere) {
  toast.error("동일한 품목명이 존재합니다");
  return; // 재입력 없이 즉시 종료
}

// 추가
setInventory((prev) => {
  const inv = JSON.parse(JSON.stringify(prev));
  locations.forEach((L) => {
    if (!inv[L][cat]) inv[L][cat] = {};
    if (!inv[L][cat][sub]) inv[L][cat][sub] = [];
    inv[L][cat][sub].push({ name, count: L === loc ? count : 0, note: "" });
  });
  return inv;
});
toast.success(`추가됨: [${cat} > ${sub}] ${name} (${count}개)`);

    // 추가
    setInventory((prev) => {
      const inv = JSON.parse(JSON.stringify(prev));
      locations.forEach((L) => {
        if (!inv[L][cat]) inv[L][cat] = {};
        if (!inv[L][cat][sub]) inv[L][cat][sub] = [];
        inv[L][cat][sub].push({ name, count: L === loc ? count : 0, note: "" });
      });
      return inv;
    });

    toast.success(`추가됨: [${cat} > ${sub}] ${name} (${count}개)`);
  }

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

    const now = new Date(),
      ts = now.toISOString(),
      time = now.toLocaleString();
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
  }

  /* 검색/집계 */
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

  function scrollToCategory(loc, cat, sub, itemName) {
    Object.keys(categoryRefs.current).forEach((k) => {
      if (k.startsWith(`${loc}-`)) {
        const el = categoryRefs.current[k];
        if (el?.tagName === "DETAILS") el.open = false;
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
    }, 80);
  }

  return (
    <main className="stage">
      {/* 로고 배경(유지) */}
      <FixedBg
        src={`${process.env.PUBLIC_URL}/DRONE_SOCCER_DOKKEBI2-Photoroom.png`}
        overlay="rgba(0,0,0,.18)"
      />

      {/* 네온 백드롭 */}
      <NeonBackdrop />

      {/* 상단 헤더 */}
      <header className="topbar glass">
        <h1 className="logo">
          <span className="glow-dot" /> DOKKAEBI<span className="thin">/</span>INVENTORY
        </h1>

        <div className="toolbar">
          <input
            className="search-input"
            type="text"
            placeholder="검색: 품목명 입력…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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
                    <div className="result-name link" onClick={() => scrollToCategory("전체", e.cat, e.sub, e.name)}>
                      [{e.cat} &gt; {e.sub}] {e.name} <span className="chip">{e.total}개</span>
                    </div>
                    <div className="result-locs">
                      {locations.map((L) => (
                        <button
                          key={L}
                          className="link pill"
                          onClick={() => scrollToCategory(L, e.cat, e.sub, e.name)}
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
                  <summary className="summary">📦 {cat}</summary>
                  {subs.map((sub) => (
                    <details
                      key={sub}
                      ref={(el) => (categoryRefs.current[`${loc}-${cat}-${sub}`] = el)}
                      className="sub-details"
                    >
                      <summary className="sub-summary">▸ {sub}</summary>
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
                                {it.name}
                                <span className="item-count">({it.count}개)</span>
                              </span>
                              {it.note && <div className="item-note">특이사항: {it.note}</div>}
                            </div>
                            {isAdmin && (
                              <div className="item-actions">
                                <button className="btn btn-ghost btn-compact" onClick={() => handleUpdateItemCount(loc, cat, sub, idx, +1)}>
                                  ＋
                                </button>
                                <button className="btn btn-ghost btn-compact" onClick={() => handleUpdateItemCount(loc, cat, sub, idx, -1)}>
                                  －
                                </button>
                                <button className="btn btn-ghost btn-compact" onClick={() => handleEditItemName(loc, cat, sub, idx)}>
                                  ✎ 이름
                                </button>
                                <button
                                  className="btn btn-ghost btn-compact"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditItemNote(loc, cat, sub, idx);
                                  }}
                                >
                                  📝 메모
                                </button>
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
      </section>

      {/* 전체 요약 */}
      <section className="grid">
        <div className="card glass hover-rise" ref={(el) => (cardRefs.current["summary"] = el)}>
          <div className="card-head" onClick={() => setOpenPanel({ kind: "summary" })}>
            <h2 className="card-title">전체</h2>
            {isAdmin && (
              <button
                className="btn btn-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteItem();
                }}
              >
                삭제
              </button>
            )}
          </div>

          <div className="card-body">
            {Object.entries(subcategories).map(([cat, subs]) => (
              <details key={cat} ref={(el) => (categoryRefs.current[`전체-${cat}`] = el)}>
                <summary className="summary">📦 {cat}</summary>
                {subs.map((sub) => (
                  <details key={sub} ref={(el) => (categoryRefs.current[`전체-${cat}-${sub}`] = el)} className="sub-details">
                    <summary className="sub-summary">▸ {sub}</summary>
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
                            <span className="item-name">
                              {name} <span className="item-count">({count}개)</span>
                            </span>
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
                    <summary className="summary">📦 {cat}</summary>
                    {subs.map((sub) => (
                      <details key={sub} open className="sub-details">
                        <summary className="sub-summary">▸ {sub}</summary>
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
                                <span className="item-name">
                                  {name} <span className="item-count">({count}개)</span>
                                </span>
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
                    <summary className="summary">📦 {cat}</summary>
                    {subs.map((sub) => (
                      <details key={sub} open className="sub-details">
                        <summary className="sub-summary">▸ {sub}</summary>
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
                                  <button className="btn btn-ghost btn-compact" onClick={() => handleUpdateItemCount(openPanel.loc, cat, sub, idx, +1)}>
                                    ＋
                                  </button>
                                  <button className="btn btn-ghost btn-compact" onClick={() => handleUpdateItemCount(openPanel.loc, cat, sub, idx, -1)}>
                                    －
                                  </button>
                                  <button className="btn btn-ghost btn-compact" onClick={() => handleEditItemName(openPanel.loc, cat, sub, idx)}>
                                    ✎ 이름
                                  </button>
                                  <button className="btn btn-ghost btn-compact" onClick={() => handleEditItemNote(openPanel.loc, cat, sub, idx)}>
                                    📝 메모
                                  </button>
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

/* LogsPage (변경 없음) */
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
  }

  function deleteLog(i) {
    if (window.confirm("삭제하시겠습니까?")) setLogs((prev) => prev.filter((_, j) => j !== i));
  }

  function exportCSV() {
    const data = sorted.map((l) => ({
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
    const data = sorted.map((l) => ({
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

  return (
    <main className="stage">
      {/* 네온 + 로고 배경 모두 사용 */}
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

        <div className="toolbar">
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="search-input"
          />
          <button className="btn btn-secondary" onClick={() => setFilterDate("")}>
            필터 해제
          </button>

          <div className="menu-wrap" ref={menuRef}>
            <button
              className="btn btn-secondary"
              onClick={() => setExportOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
            >
              ⬇ 내보내기
            </button>
            {exportOpen && (
              <div className="menu" role="menu">
                <button
                  className="menu-item"
                  onClick={() => {
                    exportCSV();
                    setExportOpen(false);
                  }}
                >
                  📄 CSV 내보내기
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    exportExcel();
                    setExportOpen(false);
                  }}
                >
                  📑 Excel 내보내기
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

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

/* AppWrapper */
export default function AppWrapper() {
  const [inventory, setInventory] = useState(getLocalInventory);
  const [searchTerm, setSearchTerm] = useState("");
  const [logs, setLogs] = useState(getLocalLogs);
  const isAdmin = getLocalAdmin();
  const [userId, setUserId] = useState(getLocalUserId);
  const [userName, setUserName] = useState(getLocalUserName);

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
