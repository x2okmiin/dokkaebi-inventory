// src/App.js
import React, { useState, useEffect, useRef, useMemo } from "react";
import { HashRouter as Router, Routes, Route, useNavigate } from "react-router-dom";
import { db, ref, set, onValue } from "./firebase";
import * as XLSX from "xlsx";
import "./App.css";
import LoginPage from "./LoginPage";
import { Toaster, toast } from "react-hot-toast";

/* =======================
 * 상수 정의
 * ======================= */
const locations = ["동아리방", "비행장", "교수님방"];
const allLocations = ["전체", ...locations];
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
  // 기본 구조 생성
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
 * Firebase helpers
 * ======================= */
function saveInventoryToCloud(data) {
  set(ref(db, "inventory/"), data);
}
function saveLogsToCloud(logs) {
  set(ref(db, "logs/"), logs);
}

/* =======================
 * Home
 * ======================= */
function Home({ inventory, setInventory, searchTerm, setSearchTerm, logs, setLogs, isAdmin }) {
  const navigate = useNavigate();
  const categoryRefs = useRef({});
  const [syncing, setSyncing] = useState(false);

  // 로컬/클라우드 동기화
  useEffect(() => saveLocalInventory(inventory), [inventory]);
  useEffect(() => saveInventoryToCloud(inventory), [inventory]);
  useEffect(() => saveLocalLogs(logs), [logs]);
  useEffect(() => saveLogsToCloud(logs), [logs]);

  // (가시적인) 동기화 인디케이터
  useEffect(() => {
    setSyncing(true);
    const t = setTimeout(() => setSyncing(false), 700);
    return () => clearTimeout(t);
  }, [inventory, logs]);

  // Firebase 구독 (1회)
  useEffect(() => {
    const invRef = ref(db, "inventory/");
    const logRef = ref(db, "logs/");

    const unsubInv = onValue(invRef, (snapshot) => {
      if (snapshot.exists()) setInventory(snapshot.val());
    });
    const unsubLog = onValue(logRef, (snapshot) => {
      if (snapshot.exists()) setLogs(snapshot.val());
    });
    return () => {
      unsubInv();
      unsubLog();
    };
  }, [setInventory, setLogs]);

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
            // 합계
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

  /* ====== 수량 증감(1시간 병합) ====== */
  function handleUpdateItemCount(loc, cat, sub, idx, delta) {
    if (!isAdmin || delta === 0) return;
    const itemName = inventory[loc][cat][sub][idx]?.name;
    if (!itemName) return;

    // 재고 반영
    setInventory((prev) => {
      const inv = JSON.parse(JSON.stringify(prev));
      const it = inv[loc][cat][sub][idx];
      if (it) it.count = Math.max(0, it.count + delta);
      return inv;
    });

    // 로그 병합
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
        arr[mergeIdx] = {
          ...arr[mergeIdx],
          change: arr[mergeIdx].change + delta,
          time,
          ts,
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
        });
      }
      return arr;
    });
  }

  /* ====== 품목 이름 수정 ====== */
  function handleEditItemName(loc, cat, sub, idx) {
    if (!isAdmin) return;
    const oldName = inventory[loc][cat][sub][idx].name;
    const newName = prompt("새 품목명을 입력하세요:", oldName);
    if (!newName || newName === oldName) return;
    setInventory((prev) => {
      const inv = JSON.parse(JSON.stringify(prev));
      // 동일 카테고리/하위카테고리 내 전체 장소에 일괄 적용
      locations.forEach((L) => {
        inv[L][cat][sub] = inv[L][cat][sub].map((item) =>
          item.name === oldName ? { ...item, name: newName } : item
        );
      });
      return inv;
    });
  }

  /* ====== 품목 메모 ====== */
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

  /* ====== 품목 전체 삭제(이름으로) ====== */
  function handleDeleteItem() {
    if (!isAdmin) return;
    const name = prompt("삭제할 품목 이름을 입력하세요:");
    if (!name) return;

    // 존재/합계 확인
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

    // 삭제 반영
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

    // 로그 기록
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
      },
      ...prev,
    ]);
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

  /* ====== 검색 결과 클릭 → 해당 위치로 펼치고 스크롤 ====== */
  function scrollToCategory(loc, cat, sub, itemName) {
    // 같은 장소의 다른 섹션 닫기
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
    <main
      className="app-main fade-in"
      style={{
        backgroundImage: `url(${process.env.PUBLIC_URL}/DRONE_SOCCER_DOKKEBI2-Photoroom.png)`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center center",
        backgroundSize: "40vw auto",
        backgroundAttachment: "fixed",
        backgroundColor: "#181a20",
        minHeight: "100vh",
        paddingBottom: "4rem",
      }}
    >
      {/* 동기화 표시 */}
      {syncing && (
        <div
          style={{
            position: "fixed",
            bottom: "2.2rem",
            right: "2.2rem",
            background: "#2dd4bf",
            color: "#181a20",
            padding: "0.6rem 1.2rem",
            borderRadius: "1rem",
            fontWeight: 700,
            fontSize: "1rem",
            boxShadow: "0 2px 14px #2dd4bf44",
            zIndex: 99999,
            transition: "all 0.2s",
          }}
        >
          <span
            className="spinner"
            style={{
              display: "inline-block",
              width: "1.1em",
              height: "1.1em",
              border: "2.5px solid #fff",
              borderTop: "2.5px solid #2dd4bf",
              borderRadius: "50%",
              marginRight: "0.5em",
              animation: "spin 0.7s linear infinite",
              verticalAlign: "middle",
            }}
          />{" "}
          동기화 중...
        </div>
      )}

      <h1 className="dk-main-title" style={{ textAlign: "center", marginTop: "0.5rem" }}>
        도깨비 드론축구단 재고관리
      </h1>

      {/* 툴바 */}
      <div
        className="toolbar"
        style={{ display: "flex", justifyContent: "center", gap: "1rem", alignItems: "center", margin: "0.75rem 0" }}
      >
        <input
          type="text"
          placeholder="검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: "50%",
            padding: "0.5rem",
            borderRadius: "0.25rem",
            border: "1px solid #4b5563",
            background: "#374151",
            color: "#fff",
          }}
        />
        <button className="btn btn-default" onClick={() => navigate("/logs")}>
          📘 기록
        </button>
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
              onClick={() => {
                saveLocalAdmin(false);
                window.location.reload();
              }}
            >
              🚪 로그아웃
            </button>
            <button className="btn btn-default" onClick={exportInventoryExcel}>
              📤 재고 Excel
            </button>
            <button className="btn btn-outline" onClick={() => handleDeleteItem()}>
              🧹 품목명으로 전체 삭제
            </button>
          </>
        )}
      </div>

      {/* 검색 결과 */}
      {searchTerm && (
        <div className="search-result" style={{ width: "60%", margin: "1rem auto" }}>
          <h3>🔍 검색 결과</h3>
          {aggregated.length === 0 ? (
            <p style={{ color: "#9ca3af" }}>검색된 결과가 없습니다.</p>
          ) : (
            <>
              <ul style={{ listStyle: "disc inside" }}>
                {aggregated.map((e, i) => (
                  <li key={i} style={{ marginBottom: "0.5rem" }}>
                    <div onClick={() => scrollToCategory("전체", e.cat, e.sub, e.name)} style={{ cursor: "pointer" }}>
                      [{e.cat} &gt; {e.sub}] {e.name} (총 {e.total}개)
                    </div>
                    <div
                      style={{
                        fontSize: "0.875rem",
                        color: "#9ca3af",
                        display: "flex",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {locations.map((L) => (
                        <span
                          key={L}
                          onClick={() => scrollToCategory(L, e.cat, e.sub, e.name)}
                          style={{ cursor: "pointer", textDecoration: "underline" }}
                        >
                          {L}: {e.locs[L] || 0}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <div style={{ textAlign: "right", marginTop: "0.5rem" }}>
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

      {/* 재고 카드 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: "1rem",
          padding: "0 1rem 2rem",
        }}
      >
        {allLocations.map((loc) => (
          <div key={loc} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>{loc}</h2>
              <div>
                {isAdmin && loc !== "전체" && (
                  <button className="btn btn-default" onClick={() => handleAddNewItem(loc)}>
                    +추가
                  </button>
                )}
                {isAdmin && loc === "전체" && (
                  <button className="btn btn-destructive" onClick={handleDeleteItem}>
                    삭제
                  </button>
                )}
              </div>
            </div>

            <div className="card-content">
              {Object.entries(subcategories).map(([cat, subs]) => (
                <details
                  key={cat}
                  ref={(el) => {
                    if (el) categoryRefs.current[`${loc}-${cat}`] = el;
                  }}
                >
                  <summary>📦 {cat}</summary>
                  {subs.map((sub) => (
                    <details
                      key={sub}
                      ref={(el) => {
                        if (el) categoryRefs.current[`${loc}-${cat}-${sub}`] = el;
                      }}
                      style={{ marginLeft: "1rem" }}
                    >
                      <summary>▸ {sub}</summary>
                      <ul style={{ marginLeft: "1rem" }}>
                        {loc === "전체"
                          ? Object.entries(
                              locations.reduce((acc, L) => {
                                (inventory[L]?.[cat]?.[sub] || []).forEach((it) => {
                                  acc[it.name] = (acc[it.name] || 0) + (it.count || 0);
                                });
                                return acc;
                              }, {})
                            ).map(([name, count]) => <li key={name}>{name} ({count}개)</li>)
                          : (inventory[loc]?.[cat]?.[sub] || []).map((it, idx) => (
                              <li
                                key={idx}
                                ref={(el) => {
                                  const refKey = `${loc}-${cat}-${sub}-${it.name}`;
                                  if (el && !categoryRefs.current[refKey]) categoryRefs.current[refKey] = el;
                                }}
                                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                              >
                                <div>
                                  <span>{it.name} ({it.count}개)</span>
                                  {it.note && (
                                    <div style={{ fontSize: "0.75rem", color: "#999" }}>특이사항: {it.note}</div>
                                  )}
                                </div>
                                {isAdmin && (
                                  <div style={{ display: "flex", gap: "0.25rem" }}>
                                    <button onClick={() => handleUpdateItemCount(loc, cat, sub, idx, +1)}>＋</button>
                                    <button onClick={() => handleUpdateItemCount(loc, cat, sub, idx, -1)}>－</button>
                                    <button onClick={() => handleEditItemName(loc, cat, sub, idx)}>✎ 이름</button>
                                    <button
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
      </div>
    </main>
  );
}

/* =======================
 * LogsPage
 * ======================= */
function LogsPage({ logs, setLogs }) {
  const navigate = useNavigate();
  const [filterDate, setFilterDate] = useState("");

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

  return (
    <main className="app-main logs-container" style={{ minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <button className="btn btn-default" onClick={() => navigate("/")}>
          ← 돌아가기
        </button>
        <h1 style={{ flex: 1 }}>📘 입출고 기록</h1>
        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          style={{
            height: "2.25rem",
            padding: "0 0.7rem",
            borderRadius: "0.25rem",
            border: "1px solid #4b5563",
            background: "#222b",
            color: "#fff",
            fontSize: "1rem",
            outline: "none",
            boxSizing: "border-box",
            verticalAlign: "middle",
          }}
        />
        <button className="btn btn-outline" onClick={() => setFilterDate("")}>
          필터 해제
        </button>
        <button className="btn btn-default" onClick={exportCSV}>
          📄 CSV
        </button>
        <button className="btn btn-default" onClick={exportExcel}>
          📑 Excel
        </button>
      </div>

      {dates.length === 0 ? (
        <p style={{ color: "#9ca3af" }}>기록이 없습니다.</p>
      ) : (
        dates.map((d) => (
          <section key={d} style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ borderBottom: "1px solid #4b5563", paddingBottom: "0.25rem" }}>{formatLabel(d)}</h2>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {grouped[d].map((l, i) => {
                const idx = logs.findIndex((x) => x.ts === l.ts && x.key === l.key);
                return (
                  <li key={i} style={{ marginBottom: "1rem" }}>
                    <div>
                      [{l.time}] {l.location} &gt; {l.category} &gt; {l.subcategory} / <strong>{l.item}</strong>
                    </div>
                    <div className={l.change > 0 ? "text-green" : "text-red"}>
                      {l.change > 0 ? ` 입고+${l.change}` : ` 출고-${-l.change}`}
                    </div>
                    {l.reason && (
                      <div
                        style={{
                          marginTop: "0.25rem",
                          padding: "0.5rem",
                          background: "#374151",
                          borderRadius: "0.25rem",
                          fontSize: "0.875rem",
                          color: "#fff",
                        }}
                      >
                        메모: {l.reason}
                      </div>
                    )}
                    <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
                      <button className="btn btn-default" onClick={() => editReason(idx)}>
                        {l.reason ? "메모 수정" : "메모 추가"}
                      </button>
                      <button className="btn btn-destructive" onClick={() => deleteLog(idx)}>
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

/* =======================
 * AppWrapper
 * ======================= */
export default function AppWrapper() {
  const [inventory, setInventory] = useState(getLocalInventory);
  const [searchTerm, setSearchTerm] = useState("");
  const [logs, setLogs] = useState(getLocalLogs);
  const isAdmin = getLocalAdmin();

  return (
    <>
      {/* 토스트: Router 바깥 */}
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
            <Route
              path="*"
              element={
                <LoginPage
                  onLogin={(pw) => {
                    // 비밀번호는 여기서 검사
                    if (pw === "2500") {
                      saveLocalAdmin(true);
                      window.location.reload();
                    } else {
                      toast.error("비밀번호가 틀렸습니다.");
                    }
                  }}
                />
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
