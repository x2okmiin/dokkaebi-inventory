// src/LoginPage.jsx
import React, { useState } from "react";

export default function LoginPage({ onLogin }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    onLogin?.(pw);
  };

  // 👀 일반 열람 (비관리자 모드)
  const enterViewer = () => {
    localStorage.setItem("do-kkae-bi-admin", "false");
    // 일반 열람이 동작하려면 App.js 라우팅에서
    // isAdmin=false도 Home을 볼 수 있도록 설정되어 있어야 함.
    window.location.reload();
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

          {/* 인풋 + 오른쪽 컨트롤(👁️/일반 열람) 한 줄 배치 */}
          <div className="login-input-row login-input-row--with-actions">
            <input
              className="login-input"
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="••••"
              autoFocus
            />

            {/* 오른쪽 컨트롤 묶음 */}
            <div className="login-inline-actions">
              <button
                type="button"
                className="btn btn-outline login-eye"
                onClick={() => setShow((v) => !v)}
                title={show ? "숨기기" : "보기"}
                aria-label="비밀번호 보기 전환"
              >
                {show ? "🙈" : "👁️"}
              </button>

              <button
                type="button"
                className="btn btn-default login-viewer"
                onClick={enterViewer}
                title="비밀번호 없이 일반 열람"
              >
                👀 일반 열람
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-default login-submit">
            🔑 로그인
          </button>
        </form>

        <div className="login-help">
          <div>• 일반 열람은 비번 없이 가능 (읽기 전용)</div>
          <div>• 관리자 전환 시 모든 편집/동기화 기능 활성화</div>
        </div>
      </div>
    </div>
  );
}
