// src/App.js
import React, { useState, useEffect, useRef, useMemo } from "react";
import { HashRouter as Router, Routes, Route, useNavigate, Navigate } from "react-router-dom";
import * as XLSX from "xlsx";
import "./App.css";
import LoginPage from "./LoginPage";
import { Toaster, toast } from "react-hot-toast";

/* Firebase */
import { db, ref, set, update, onValue, push, runTransaction } from "./firebase";

/* ===== 상수 ===== */
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

/* ===== 로그인 상태 ===== */
function getLocalAdmin()   { return localStorage.getItem("do-kkae-bi-admin") === "true"; }
function saveLocalAdmin(v) { localStorage.setItem("do-kkae-bi-admin", v ? "true" : "false"); }
function getLocalUserId()  { return localStorage.getItem("do-kkae-bi-user-id") || ""; }
function getLocalUserName(){ return localStorage.getItem("do-kkae-bi-user-name") || ""; }

/* ===== 유틸 ===== */
const entriesToList = (obj) => Object.entries(obj || {}).map(([id, v]) => ({ id, ...(v || {}) }));
const nowMeta = () => { const d=new Date(); return { ts:d.toISOString(), time:d.toLocaleString() }; };

/* ===== 배경 ===== */
function FixedBg({ src, overlay=null, maxW="min(90vw, 1400px)", maxH="min(80vh, 900px)", minW="320px", minH="200px", opacity=1 }) {
  return (
    <>
      <div style={{position:"fixed", inset:0, zIndex:-2, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none", overflow:"hidden"}}>
        <img src={src} alt="" style={{ width:"auto", height:"auto", maxWidth:maxW, maxHeight:maxH, minWidth:minW, minHeight:minH, objectFit:"contain", opacity }} />
      </div>
      {overlay && <div style={{position:"fixed", inset:0, zIndex:-1, background:overlay, pointerEvents:"none"}}/>}
    </>
  );
}

/* =========================================================
 * Home — 실시간 동기화 + 트랜잭션 + 1시간 병합 로그
 * ========================================================= */
function Home({ isAdmin, userId, userName }) {
  const navigate = useNavigate();

  // RTDB 구독 데이터
  // inventory: inventory[loc][cat][sub] = { itemId: {name, count, note} }
  const [inventory, setInventory] = useState({});
  // logsMap: { logId: {...} }
  const [logsMap, setLogsMap] = useState({});

  // UI 상태
  const [searchTerm, setSearchTerm] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [dataMenuOpen, setDataMenuOpen] = useState(false);
  const dataMenuRef = useRef(null);
  const [openPanel, setOpenPanel] = useState(null);
  const categoryRefs = useRef({});
  const cardRefs = useRef({});

  useEffect(() => { setSyncing(true); const t=setTimeout(()=>setSyncing(false), 600); return ()=>clearTimeout(t); }, [inventory, logsMap]);

  // 실시간 구독
  useEffect(()=> {
    const unsubInv  = onValue(ref(db, "inventory"), snap => setInventory(snap.val() || {}));
    const unsubLogs = onValue(ref(db, "logs"),      snap => setLogsMap(snap.val() || {}));
    return () => { unsubInv(); unsubLogs(); };
  }, []);

  // 외부 클릭으로 데이터 메뉴 닫기
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

  /* ========= 엑셀 내보내기 ========= */
  function exportInventoryExcel() {
    const rows = [];
    const itemTotals = {};
    locations.forEach((loc) => {
      Object.entries(subcategories).forEach(([cat, subs]) => {
        subs.forEach((sub) => {
          const items = inventory?.[loc]?.[cat]?.[sub] || {};
          Object.values(items).forEach((it) => {
            const count = Number(it.count || 0);
            rows.push({ 장소: loc, 상위카테고리: cat, 하위카테고리: sub, 품목명: it.name, 수량: count });
            if (!itemTotals[it.name]) itemTotals[it.name] = { 합계: 0, 장소별: {} };
            itemTotals[it.name].합계 += count;
            itemTotals[it.name].장소별[loc] = (itemTotals[it.name].장소별[loc] || 0) + count;
          });
        });
      });
    });
    rows.sort((a,b)=> a.장소!==b.장소 ? a.장소.localeCompare(b.장소)
      : a.상위카테고리!==b.상위카테고리 ? a.상위카테고리.localeCompare(b.상위카테고리)
      : a.하위카테고리!==b.하위카테고리 ? a.하위카테고리.localeCompare(b.하위카테고리)
      : a.품목명.localeCompare(b.품목명));
    rows.push({}); rows.push({ 품목명:"=== 품목별 전체 합계 ===" });
    Object.entries(itemTotals).forEach(([name, info])=>{
      rows.push({ 품목명:name, 총합계:info.합계, ...info.장소별 });
    });
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "재고현황"); XLSX.writeFile(wb, "재고현황.xlsx");
  }

  /* ========= 경로 헬퍼 ========= */
  const itemPath = (loc, cat, sub, itemId) => `inventory/${loc}/${cat}/${sub}/${itemId}`;

  /* ========= 로그 1시간 병합 =========
   * - mergeKey: loc|cat|sub|itemId|IN/OUT
   * - 동일 mergeKey & 1시간 이내면 해당 로그 change를 트랜잭션으로 누적
   */
  function findMergeTarget(mergeKey) {
    const oneHour = 60 * 60 * 1000;
    const now = Date.now();
    let candidateId = null;
    let candidateTs = 0;

    for (const [id, l] of Object.entries(logsMap || {})) {
      if (l?.mergeKey !== mergeKey) continue;
      const t = Date.parse(l.ts || 0);
      if (!Number.isFinite(t)) continue;
      // 가장 최근(log.ts가 최신) + 1시간 이내
      if (now - t <= oneHour && t >= candidateTs) {
        candidateTs = t;
        candidateId = id;
      }
    }
    return candidateId; // 없으면 null
  }

  /* ========= 수량 증감 (트랜잭션) + 병합 로그 ========= */
  async function handleUpdateItemCount(loc, cat, sub, itemId, delta) {
    if (!isAdmin || !itemId || !delta) return;
    try {
      // 1) 수량 원자적 증가/감소
      await runTransaction(ref(db, `${itemPath(loc, cat, sub, itemId)}/count`), (cur) => {
        const next = Math.max(0, Number(cur || 0) + delta);
        return next;
      });

      // 2) 로그 병합 여부 확인
      const dir = delta > 0 ? "IN" : "OUT";
      const mergeKey = `${loc}|${cat}|${sub}|${itemId}|${dir}`;
      const mergeId = findMergeTarget(mergeKey);
      const { ts, time } = nowMeta();
      const itemName = inventory?.[loc]?.[cat]?.[sub]?.[itemId]?.name || "";

      if (mergeId) {
        // 기존 로그의 change만 트랜잭션으로 누적 + 시간 갱신
        await runTransaction(ref(db, `logs/${mergeId}/change`), (cur) => Number(cur || 0) + delta);
        await update(ref(db, `logs/${mergeId}`), { ts, time });
      } else {
        // 새 로그 push
        await push(ref(db, "logs"), {
          ts, time,
          location: loc,
          category: cat,
          subcategory: sub,
          itemId, itemName,
          change: delta,
          reason: "입출고",
          operatorId: userId || "",
          operatorName: userName || "",
          mergeKey,
        });
      }
    } catch (e) {
      console.error(e);
      toast.error(`수량 변경 실패: ${e?.code || e?.message || "unknown error"}`);
    }
  }

  /* ========= 품목 이름/메모 수정 ========= */
  async function handleEditItemName(loc, cat, sub, itemId, oldName) {
    if (!isAdmin || !itemId) return;
    const newName = prompt("새 품목명을 입력하세요:", oldName || "");
    if (!newName || newName === oldName) return;
    try { await update(ref(db, itemPath(loc, cat, sub, itemId)), { name: newName }); }
    catch (e) { console.error(e); toast.error(`이름 수정 실패: ${e?.code || e?.message}`); }
  }
  async function handleEditItemNote(loc, cat, sub, itemId, currentNote) {
    if (!isAdmin || !itemId) return;
    const note = prompt("특이사항을 입력하세요:", currentNote || "");
    if (note === null) return;
    try { await update(ref(db, itemPath(loc, cat, sub, itemId)), { note }); }
    catch (e) { console.error(e); toast.error(`메모 저장 실패: ${e?.code || e?.message}`); }
  }

  /* ========= 신규 품목 추가 (멀티패스 update) ========= */
  async function handleAddNewItem(targetLoc) {
    if (!isAdmin) return;

    try {
      // 상/하위 카테고리 선택
      const cats = Object.keys(subcategories);
      const csel = prompt(`상위 카테고리 선택 (번호/이름)\n${cats.map((c,i)=>`${i+1}. ${c}`).join("\n")}`);
      if (csel === null) return;
      const cat = (/^\d+$/.test(csel.trim())) ? cats[parseInt(csel,10)-1] : cats.find(c=>c.toLowerCase()===csel.trim().toLowerCase());
      if (!cat) return toast.error("올바른 카테고리가 아닙니다.");

      const subs = subcategories[cat];
      const ssel = prompt(`하위 카테고리 선택 (번호/이름)\n${subs.map((s,i)=>`${i+1}. ${s}`).join("\n")}`);
      if (ssel === null) return;
      const sub = (/^\d+$/.test(ssel.trim())) ? subs[parseInt(ssel,10)-1] : subs.find(s=>s.toLowerCase()===ssel.trim().toLowerCase());
      if (!sub) return toast.error("올바른 하위카테고리가 아닙니다.");

      // 이름/수량
      let name = prompt("추가할 품목명:"); if (name === null) return; name = name.trim();
      if (!name) return toast.error("품목명이 비어 있습니다.");
      let countStr = prompt("초기 수량 입력(정수):", "0"); if (countStr === null) return;
      const count = Math.max(0, parseInt(String(countStr).trim(), 10));
      if (!Number.isFinite(count)) return toast.error("수량이 올바르지 않습니다.");

      // 중복 방지
      const hasDup = (L) => Object.values(inventory?.[L]?.[cat]?.[sub] || {}).some(it => (it?.name||"").toLowerCase() === name.toLowerCase());
      for (const L of locations) { if (hasDup(L)) return toast.error(`'${L} > ${cat} > ${sub}'에 동일 이름이 이미 있습니다.`); }

      // 공통 키 생성
      const commonKey = push(ref(db, "_keys")).key;
      if (!commonKey) throw new Error("키 생성 실패");

      // 모든 위치에 동일 아이디로 생성 (선택 위치만 초기 수량)
      const updates = {};
      for (const L of locations) {
        updates[`inventory/${L}/${cat}/${sub}/${commonKey}`] = { name, count: L === targetLoc ? count : 0, note: "" };
      }
      await update(ref(db), updates);
      toast.success(`추가 완료: [${cat} > ${sub}] ${name} (${targetLoc} ${count}개, 타 위치 0개)`);
    } catch (e) {
      console.error(e);
      toast.error(`품목 추가 실패: ${e?.code || e?.message || "unknown error"}`);
    }
  }

  /* ========= 이름으로 전체 삭제 ========= */
  async function handleDeleteItemByName() {
    if (!isAdmin) return;
    const name = prompt("삭제할 품목 이름을 입력하세요:"); if (!name) return;
    try {
      let total = 0;
      const updates = {};
      for (const L of locations) {
        for (const [cat, subs] of Object.entries(inventory?.[L] || {})) {
          for (const [sub, items] of Object.entries(subs || {})) {
            for (const [id, it] of Object.entries(items || {})) {
              if ((it?.name || "") === name) {
                total += Number(it?.count || 0);
                updates[`inventory/${L}/${cat}/${sub}/${id}`] = null;
              }
            }
          }
        }
      }
      if (!Object.keys(updates).length) return toast.error("해당 품목이 존재하지 않습니다.");
      await update(ref(db), updates);

      const { ts, time } = nowMeta();
      await push(ref(db, "logs"), {
        ts, time, location: "전체", category: "삭제", subcategory: "",
        itemId: "", itemName: name, change: -total, reason: "해당 품목은 총괄 삭제됨",
        operatorId: userId || "", operatorName: userName || "",
        mergeKey: `전체||${name}|OUT`,
      });
    } catch (e) {
      console.error(e);
      toast.error(`삭제 실패: ${e?.code || e?.message || "unknown error"}`);
    }
  }

  /* ========= 검색/요약 ========= */
  const filtered = useMemo(() => {
    const res = [];
    for (const L of locations) {
      for (const [cat, subs] of Object.entries(inventory?.[L] || {})) {
        for (const [sub, items] of Object.entries(subs || {})) {
          for (const [id, it] of Object.entries(items || {})) {
            if (!it?.name) continue;
            if (it.name.toLowerCase().includes(searchTerm.toLowerCase())) {
              res.push({ loc:L, cat, sub, id, name: it.name, count: Number(it.count || 0), note: it.note || "" });
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

  // 검색 → 스크롤
  function scrollToCategory(loc, cat, sub, itemName) {
    Object.keys(categoryRefs.current).forEach((k) => {
      if (k.startsWith(`${loc}-`)) {
        const el = categoryRefs.current[k];
        if (el && el.tagName === "DETAILS") el.open = false;
      }
    });
    const ck = `${loc}-${cat}`, sk = `${loc}-${cat}-${sub}`, ik = `${loc}-${cat}-${sub}-${itemName}`;
    if (categoryRefs.current[ck]) categoryRefs.current[ck].open = true;
    if (categoryRefs.current[sk]) categoryRefs.current[sk].open = true;
    setTimeout(()=>{ const el=categoryRefs.current[ik]; if (el) el.scrollIntoView({ behavior:"smooth", block:"start" }); }, 100);
  }

  // 연결 테스트
  async function healthcheck() {
    try {
      const { ts, time } = nowMeta();
      await set(ref(db, `__healthcheck__/lastWrite`), { ts, time });
      toast.success("RTDB 쓰기 OK");
    } catch (e) {
      console.error(e);
      toast.error(`RTDB 쓰기 실패: ${e?.code || e?.message}`);
    }
  }

  return (
    <main className="app-main fade-in">
      <FixedBg
        src={`${process.env.PUBLIC_URL}/DRONE_SOCCER_DOKKEBI2-Photoroom.png`}
        overlay="rgba(0,0,0,.18)" maxW="min(85vw, 1200px)" maxH="min(70vh, 800px)"
        minW="360px" minH="220px" opacity={0.9}
      />

      {syncing && <div className="sync-indicator"><span className="spinner" /> 동기화 중...</div>}

      <h1 className="dk-main-title" style={{ textAlign:"center", marginTop:".5rem" }}>도깨비 드론축구단 재고관리</h1>

      <div className="toolbar">
        <input className="search-input" type="text" placeholder="검색..." value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} />
        <button className="btn btn-default" onClick={()=>navigate("/logs")}>📘 기록</button>

        <div className="data-menu-wrap" ref={dataMenuRef}>
          <button className="btn btn-default" onClick={()=>setDataMenuOpen(v=>!v)} aria-haspopup="menu" aria-expanded={dataMenuOpen}>📦 데이터</button>
          {dataMenuOpen && (
            <div className="data-menu" role="menu">
              <button className="menu-item" onClick={()=>{ exportInventoryExcel(); setDataMenuOpen(false); }}>📤 재고 Excel 내보내기</button>
              <button className="menu-item" disabled title="베타: 아직 미구현" style={{ opacity:.55, textDecoration:"underline dotted", cursor:"not-allowed" }}>📥 가져오기 (베타)</button>
            </div>
          )}
        </div>

        {isAdmin && (
          <>
            <button className="btn btn-default" onClick={healthcheck}>🔌 연결 테스트</button>
            <button className="btn btn-default" onClick={()=>{ saveLocalAdmin(false); window.location.hash="#/login"; window.location.reload(); }}>🚪 로그아웃</button>
          </>
        )}
      </div>

      {/* 검색 결과 */}
      {searchTerm && (
        <div className="search-result" style={{ margin:"10px auto" }}>
          <h3 style={{ margin:0, marginBottom:6 }}>🔍 검색 결과</h3>
          {aggregated.length === 0 ? (
            <p style={{ color:"#9ca3af" }}>검색된 결과가 없습니다.</p>
          ) : (
            <>
              <ul style={{ listStyle:"disc inside" }}>
                {aggregated.map((e,i)=>(
                  <li key={i} style={{ marginBottom:"6px" }}>
                    <div onClick={()=>scrollToCategory("전체", e.cat, e.sub, e.name)} style={{ cursor:"pointer" }}>
                      [{e.cat} &gt; {e.sub}] {e.name} (총 {e.total}개)
                    </div>
                    <div className="search-loc-row">
                      {locations.map((L)=>(
                        <span key={L} onClick={()=>scrollToCategory(L, e.cat, e.sub, e.name)} className="search-loc-link">
                          {L}: {e.locs[L] || 0}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <div style={{ textAlign:"right", marginTop:"6px" }}>
                <button className="btn btn-default" onClick={()=>{
                  const txt = aggregated.map(
                    (e)=>`[${e.cat}>${e.sub}] ${e.name} (총 ${e.total}개) ` + locations.map(L=>`${L}:${e.locs[L] || 0}`).join(" / ")
                  ).join("\n");
                  navigator.clipboard.writeText(txt); toast.success("복사되었습니다");
                }}>📋 전체 복사</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 장소 카드 */}
      <div className="cards-grid">
        {locations.map((loc) => (
          <div key={loc} className="card fixed" ref={(el)=>{ if (el) cardRefs.current[loc]=el; }}>
            <div className="card-head" onClick={()=>setOpenPanel({ kind:"loc", loc })} style={{ cursor:"zoom-in" }}>
              <h2>{loc}</h2>
              {isAdmin && <button className="btn btn-default" onClick={(e)=>{ e.stopPropagation(); handleAddNewItem(loc); }}>+추가</button>}
            </div>

            <div className="card-content scroll">
              {Object.entries(subcategories).map(([cat, subs])=>(
                <details key={cat} ref={(el)=>{ if (el) categoryRefs.current[`${loc}-${cat}`]=el; }}>
                  <summary>📦 {cat}</summary>
                  {subs.map((sub)=>{
                    const items = entriesToList(inventory?.[loc]?.[cat]?.[sub]);
                    return (
                      <details key={sub} ref={(el)=>{ if (el) categoryRefs.current[`${loc}-${cat}-${sub}`]=el; }} style={{ marginLeft:8 }}>
                        <summary>▸ {sub}</summary>
                        <ul className="item-list">
                          {items.map((it)=>(
                            <li key={it.id} className="item-row" ref={(el)=>{ const k=`${loc}-${cat}-${sub}-${it.name}`; if (el && !categoryRefs.current[k]) categoryRefs.current[k]=el; }}>
                              <div className="item-text">
                                <span className="item-name">
                                  {it.name} <span className="item-count">({Number(it.count || 0)}개)</span>
                                </span>
                                {it.note && <div className="item-note">특이사항: {it.note}</div>}
                              </div>
                              {isAdmin && (
                                <div className="item-actions">
                                  <button className="btn btn-default btn-compact" onClick={()=>handleUpdateItemCount(loc, cat, sub, it.id, +1)}>＋</button>
                                  <button className="btn btn-default btn-compact" onClick={()=>handleUpdateItemCount(loc, cat, sub, it.id, -1)}>－</button>
                                  <button className="btn btn-default btn-compact" onClick={()=>handleEditItemName(loc, cat, sub, it.id, it.name)}>✎ 이름</button>
                                  <button className="btn btn-default btn-compact" onClick={(e)=>{ e.stopPropagation(); handleEditItemNote(loc, cat, sub, it.id, it.note); }}>📝 메모</button>
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
        <div className="card summary-card" ref={(el)=>{ if (el) cardRefs.current["summary"]=el; }}>
          <div className="card-head" onClick={()=>setOpenPanel({ kind:"summary" })} style={{ cursor:"zoom-in" }}>
            <h2>전체</h2>
            {isAdmin && <button className="btn btn-destructive" onClick={(e)=>{ e.stopPropagation(); handleDeleteItemByName(); }}>삭제</button>}
          </div>

          <div className="card-content scroll">
            {Object.entries(subcategories).map(([cat, subs])=>(
              <details key={cat} ref={(el)=>{ if (el) categoryRefs.current[`전체-${cat}`]=el; }}>
                <summary>📦 {cat}</summary>
                {subs.map((sub)=>{
                  const sumByName = {};
                  for (const L of locations) {
                    const items = inventory?.[L]?.[cat]?.[sub] || {};
                    Object.values(items).forEach((it)=>{ if (!it?.name) return; sumByName[it.name]=(sumByName[it.name]||0)+Number(it.count||0); });
                  }
                  return (
                    <details key={sub} ref={(el)=>{ if (el) categoryRefs.current[`전체-${cat}-${sub}`]=el; }} style={{ marginLeft:8 }}>
                      <summary>▸ {sub}</summary>
                      <ul className="item-list">
                        {Object.entries(sumByName).map(([name,count])=>(
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
        <div className="overlay" onClick={()=>setOpenPanel(null)}>
          <div className="popup-card pop-in" onClick={(e)=>e.stopPropagation()}>
            <div className="popup-head">
              <h3>{openPanel.kind === "summary" ? "전체 (확대 보기)" : `${openPanel.loc} (확대 보기)`}</h3>
              <button className="btn btn-outline" onClick={()=>setOpenPanel(null)}>닫기</button>
            </div>

            <div className="popup-content">
              {openPanel.kind === "summary" ? (
                Object.entries(subcategories).map(([cat, subs])=>(
                  <details key={cat} open>
                    <summary>📦 {cat}</summary>
                    {subs.map((sub)=>{
                      const sumByName = {};
                      for (const L of locations) {
                        const items = inventory?.[L]?.[cat]?.[sub] || {};
                        Object.values(items).forEach((it)=>{ if (!it?.name) return; sumByName[it.name]=(sumByName[it.name]||0)+Number(it.count||0); });
                      }
                      return (
                        <details key={sub} open style={{ marginLeft:8 }}>
                          <summary>▸ {sub}</summary>
                          <ul className="item-list">
                            {Object.entries(sumByName).map(([name,count])=>(
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
                Object.entries(subcategories).map(([cat, subs])=>(
                  <details key={cat} open>
                    <summary>📦 {cat}</summary>
                    {subs.map((sub)=>{
                      const items = entriesToList(inventory?.[openPanel.loc]?.[cat]?.[sub]);
                      return (
                        <details key={sub} open style={{ marginLeft:8 }}>
                          <summary>▸ {sub}</summary>
                          <ul className="item-list">
                            {items.map((it)=>(
                              <li key={it.id} className="item-row">
                                <div className="item-text">
                                  <span className="item-name">
                                    {it.name} <span className="item-count">({Number(it.count||0)}개)</span>
                                  </span>
                                  {it.note && <div className="item-note">특이사항: {it.note}</div>}
                                </div>
                                {isAdmin && (
                                  <div className="item-actions">
                                    <button className="btn btn-default btn-compact" onClick={()=>handleUpdateItemCount(openPanel.loc, cat, sub, it.id, +1)}>＋</button>
                                    <button className="btn btn-default btn-compact" onClick={()=>handleUpdateItemCount(openPanel.loc, cat, sub, it.id, -1)}>－</button>
                                    <button className="btn btn-default btn-compact" onClick={()=>handleEditItemName(openPanel.loc, cat, sub, it.id, it.name)}>✎ 이름</button>
                                    <button className="btn btn-default btn-compact" onClick={(e)=>{ e.stopPropagation(); handleEditItemNote(openPanel.loc, cat, sub, it.id, it.note); }}>📝 메모</button>
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

/* =========================================================
 * LogsPage — 실시간 push + 편집/삭제
 * ========================================================= */
function LogsPage() {
  const navigate = useNavigate();
  const [logsMap, setLogsMap] = useState({});
  const [filterDate, setFilterDate] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(()=> onValue(ref(db, "logs"), snap => setLogsMap(snap.val() || {})), []);

  const logs = useMemo(()=>{
    const arr = Object.entries(logsMap).map(([id,v])=>({ id, ...(v||{}) }));
    arr.sort((a,b)=> new Date(b.ts) - new Date(a.ts));
    return arr;
  }, [logsMap]);

  const filteredList = filterDate ? logs.filter((l)=> (l.ts||"").slice(0,10) === filterDate) : logs;

  const grouped = useMemo(()=> filteredList.reduce((acc,l)=>{ const day=(l.ts||"").slice(0,10); (acc[day]=acc[day]||[]).push(l); return acc; }, {}), [filteredList]);
  const dates = useMemo(()=> Object.keys(grouped).sort((a,b)=> new Date(b) - new Date(a)), [grouped]);

  function formatLabel(d) {
    const diff = Math.floor((Date.now() - Date.parse(d)) / (1000*60*60*24));
    return diff === 0 ? "오늘" : diff === 1 ? "어제" : d;
  }

  async function editReason(logId, current) {
    const note = prompt("메모:", current || ""); if (note === null) return;
    try { await update(ref(db, `logs/${logId}`), { reason: note }); }
    catch (e) { console.error(e); toast.error(`메모 저장 실패: ${e?.code || e?.message || "unknown error"}`); }
  }
  async function deleteLog(logId) {
    if (!window.confirm("삭제하시겠습니까?")) return;
    try { await set(ref(db, `logs/${logId}`), null); }
    catch (e) { console.error(e); toast.error(`삭제 실패: ${e?.code || e?.message || "unknown error"}`); }
  }

  function exportCSV(list) {
    const data = list.map((l)=>({
      시간:l.time, 장소:l.location, 상위카테고리:l.category, 하위카테고리:l.subcategory,
      품목:l.itemName||"", 증감:l.change, 메모:l.reason||"", ID:l.operatorId||"", 이름:l.operatorName||""
    }));
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(data));
    const blob = new Blob([csv], { type:"text/csv" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="기록.csv"; a.click();
  }
  function exportExcel(list) {
    const data = list.map((l)=>({
      시간:l.time, 장소:l.location, 상위카테고리:l.category, 하위카테고리:l.subcategory,
      품목:l.itemName||"", 증감:l.change, 메모:l.reason||"", ID:l.operatorId||"", 이름:l.operatorName||""
    }));
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Logs"); XLSX.writeFile(wb, "기록.xlsx");
  }

  // 외부 클릭으로 메뉴 닫기
  useEffect(()=> {
    function onClickOutside(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setExportOpen(false); }
    if (exportOpen) { document.addEventListener("mousedown", onClickOutside); document.addEventListener("touchstart", onClickOutside); }
    return ()=>{ document.removeEventListener("mousedown", onClickOutside); document.removeEventListener("touchstart", onClickOutside); };
  }, [exportOpen]);

  return (
    <main className="app-main logs-container" style={{ minHeight:"100vh" }}>
      <div className="logs-header">
        <button className="btn btn-default back-btn" onClick={()=>navigate("/")}>← 돌아가기</button>
        <h1 className="logs-title">📘 입출고 기록</h1>

        <div className="logs-controls">
          <input type="date" value={filterDate} onChange={(e)=>setFilterDate(e.target.value)} />
          <button className="btn btn-outline" onClick={()=>setFilterDate("")}>필터 해제</button>

          <div className="data-menu-wrap" ref={menuRef}>
            <button className="btn btn-default" onClick={()=>setExportOpen(v=>!v)} aria-haspopup="menu" aria-expanded={exportOpen}>⬇ 내보내기</button>
            {exportOpen && (
              <div className="data-menu" role="menu">
                <button className="menu-item" onClick={()=>{ exportCSV(logs); setExportOpen(false); }}>📄 CSV 내보내기</button>
                <button className="menu-item" onClick={()=>{ exportExcel(logs); setExportOpen(false); }}>📑 Excel 내보내기</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {dates.length === 0 ? (
        <p style={{ color:"#9ca3af" }}>기록이 없습니다.</p>
      ) : (
        dates.map((d)=>(
          <section key={d} style={{ marginBottom:"16px" }}>
            <h2 style={{ borderBottom:"1px solid #4b5563", paddingBottom:"4px", margin:"0 0 8px" }}>{formatLabel(d)}</h2>
            <ul style={{ listStyle:"none", padding:0, margin:0 }}>
              {grouped[d].map((l)=>(
                <li key={l.id} className="log-item">
                  <div className="log-text">
                    <div style={{ fontSize:14 }}>
                      [{l.time}] {l.location} &gt; {l.category} &gt; {l.subcategory} / <strong>{l.itemName}</strong>
                    </div>
                    <div className={l.change > 0 ? "text-green" : "text-red"} style={{ marginTop:4 }}>
                      {l.change > 0 ? ` 입고+${l.change}` : ` 출고-${-l.change}`}
                    </div>
                    <div className="muted" style={{ marginTop:4 }}>
                      👤 {l.operatorId ? `[${l.operatorId}]` : ""} {l.operatorName || ""}
                    </div>
                    {l.reason && <div className="log-note">메모: {l.reason}</div>}
                  </div>
                  <div className="log-actions">
                    <button className="btn btn-default" onClick={()=>editReason(l.id, l.reason)}>{l.reason ? "메모 수정" : "메모 추가"}</button>
                    <button className="btn btn-destructive" onClick={()=>deleteLog(l.id)}>삭제</button>
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
    <div style={{ position:"relative", minHeight:"100vh" }}>
      <FixedBg src={`${process.env.PUBLIC_URL}/white.png`} overlay={null} maxW="min(70vw, 900px)" maxH="min(65vh, 700px)" minW="300px" minH="180px" opacity={1} />
      <div style={{ position:"absolute", inset:0, background:"rgba(15, 23, 42, 0.6)", zIndex:-1 }} />
      <div style={{ position:"relative", zIndex:0 }}>{children}</div>
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
                      onLogin={({ pw, uid, name }) => {
                        if (pw === "2500" && uid && name) {
                          saveLocalAdmin(true);
                          localStorage.setItem("do-kkae-bi-user-id", uid);
                          localStorage.setItem("do-kkae-bi-user-name", name);
                          setUserId(uid); setUserName(name);
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
