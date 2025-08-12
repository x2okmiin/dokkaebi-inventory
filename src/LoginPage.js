// src/LoginPage.jsx
import React, { useState } from "react";

export default function LoginPage({ onLogin }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    onLogin?.(pw);
  };

  return (
    <div className="login-wrap fade-in">
      <div className="login-card login-pop">
        <h1 className="dk-main-title" style={{ textAlign: "center", marginBottom: "0.75rem" }}>
          도깨비 인벤토리
        </h1>
        <p className="login-sub">관리자 모드로 들어가려면 비밀번호를 입력해줘</p>

        <form onSubmit={submit} className="login-form">
          <label className="login-label">비밀번호</label>

          {/* 입력창은 유연하게 확장, 버튼은 항상 오른쪽에 고정 */}
          <div className="login-input-row login-input-row--nowrap">
            <input
              className="login-input login-input--flex"
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="••••"
              autoFocus
              autoComplete="current-password"
            />
            <button
              type="button"
              className="btn btn-outline login-eye-side"
              onClick={() => setShow((v) => !v)}
              title={show ? "숨기기" : "보기"}
              aria-label="비밀번호 보기 전환"
            >
              {show ? "🙈" : "👁️"}
            </button>
          </div>

          <button type="submit" className="btn btn-default login-submit">
            🔑 로그인
          </button>
        </form>
      </div>
    </div>
  );
}
