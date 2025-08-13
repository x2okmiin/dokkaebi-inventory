// src/LoginPage.jsx
import React, { useState } from "react";

export default function LoginPage({ onLogin }) {
  const [pw, setPw] = useState("");
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    onLogin?.({ pw, uid: uid.trim(), name: name.trim() });
  };

  return (
    <div className="login-stage">
      {/* 로고 배경(유지) */}
      <div className="fixed-bg">
        <img
          src={`${process.env.PUBLIC_URL}/white.png`}
          alt=""
          className="fixed-bg-img"
          style={{ maxWidth: "min(70vw, 900px)", maxHeight: "min(65vh, 700px)" }}
        />
      </div>

      {/* 네온 오로라/그리드 */}
      <div className="login-orbit" />
      <div className="bg-grid" aria-hidden />

      <div className="login-card neon-rise">
        <div className="brand">
          <div className="brand-badge">
            <span className="dot dot-cyan" />
            <span className="dot dot-purple" />
            <span className="dot dot-blue" />
          </div>
          <h1 className="brand-title">DOKKAEBI INVENTORY</h1>
          <p className="brand-sub">드론축구단 재고·입출고 관리 콘솔</p>
        </div>

        <form onSubmit={submit} className="login-form">
          <label className="login-label">ID (학번)</label>
          <div className="login-input-row login-input-row--nowrap">
            <input
              className="login-input login-input--flex"
              type="text"
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              placeholder="예: 202436029"
              autoComplete="username"
              required
            />
          </div>

          <label className="login-label">이름</label>
          <div className="login-input-row login-input-row--nowrap">
            <input
              className="login-input login-input--flex"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="성함을 적어주세요"
              autoComplete="name"
              required
            />
          </div>

          <label className="login-label">비밀번호</label>
          <div className="login-input-row login-input-row--nowrap">
            <input
              className="login-input login-input--flex"
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="••••"
              autoFocus
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="btn btn-ghost login-eye-side"
              onClick={() => setShow((v) => !v)}
              title={show ? "숨기기" : "보기"}
              aria-label="비밀번호 보기 전환"
            >
              {show ? "🙈" : "👁️"}
            </button>
          </div>

          <button type="submit" className="btn btn-primary login-submit">
            🔑 로그인
          </button>
        </form>
      </div>
    </div>
  );
}
