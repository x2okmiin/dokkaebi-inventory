// src/LoginPage.jsx
import React, { useState } from "react";

export default function LoginPage({ onLogin }) {
  const [pw, setPw] = useState("");

  function submit(e) {
    e?.preventDefault();
    onLogin?.(pw.trim());
  }
//세부 이미지 변경 등은 App.js에서 가능
  return (
    <main
      className="app-main fade-in"
    >
      <div style={{ maxWidth: 480, margin: "8vh auto 0", width: "92%" }}>
        <div className="card" style={{ padding: 24 }}>
          <h1 className="dk-main-title" style={{ marginBottom: 8 }}>도깨비 드론축구단</h1>
          <h2 style={{ margin: "0 0 18px", fontSize: "1.25rem", fontWeight: 800, color: "#2dd4bf" }}>
            관계자 로그인
          </h2>
          <form onSubmit={submit}>
            <input
              type="password"
              placeholder="비밀번호를 입력하세요"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              style={{ width: "100%", height: 44, padding: "0 12px", borderRadius: 10, border: "1.5px solid #334155", background: "#232943", color: "#fff" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn btn-default" type="submit" style={{ flex: 1 }}>🔑 로그인</button>
              <button className="btn btn-outline" type="button" onClick={() => setPw("")}>지우기</button>
            </div>
            <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 10 }}>
              동아리방 비번을 입력하시오. (추후 변경시 교체!)
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
