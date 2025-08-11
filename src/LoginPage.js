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
      <div className="login-card">
        <h1 className="dk-main-title" style={{ textAlign: "center", marginBottom: "0.75rem" }}>
          도깨비 인벤토리
        </h1>
        <p className="login-sub">관리자 모드로 들어가려면 비밀번호를 입력해줘</p>

        <form onSubmit={submit} className="login-form">
          <label className="login-label">비밀번호</label>
          <div className="login-input-row">
            <input
              className="login-input"
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="••••"
              autoFocus
            />
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setShow((v) => !v)}
              title={show ? "숨기기" : "보기"}
            >
              {show ? "🙈" : "👁️"}
            </button>
          </div>

          <button type="submit" className="btn btn-default login-submit">
            🔑 로그인
          </button>
        </form>

        <div className="login-help">
          <div>• 일반 열람은 비번 없이 가능</div>
          <div>• 관리자 전환 시 모든 편집/동기화 기능 활성화</div>
        </div>
      </div>
    </div>
  );
}
