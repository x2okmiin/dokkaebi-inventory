import React, { useState } from "react";

export default function LoginPage({ onLogin }) {
  const [pw, setPw] = useState("");
  return (
<main
  className="login-page fade-in"
  style={{
    position: "relative",
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#181a20",
    backgroundImage: `url(${process.env.PUBLIC_URL}/white.png)`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center center",
    backgroundSize: "40vw auto", // or "cover", or "60vw auto" 등
    overflow: "hidden"
  }}
>
  {/* 오버레이 */}
  <div style={{
    position: "absolute", inset: 0, background: "#0008", zIndex: 0
  }} />

  {/* 실제 내용 */}
  <div style={{
    position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center"
  }}>
    <h2 style={{
      marginBottom: "2rem", color: "#ffffffff", textShadow: "0 2px 10px #37ff147e"
    }}>
      부원 로그인
    </h2>
    <input
      type="password"
      value={pw}
      onChange={e => setPw(e.target.value)}
      placeholder="동방 비밀번호"
      style={{
        fontSize: "1rem",
        padding: "0.5rem 1rem",
        borderRadius: "0.5rem",
        border: "1px solid #aaa",
        marginBottom: "1rem",
        outline: "none",
      }}
      onKeyDown={e => { if (e.key === "Enter") onLogin(pw); }}
    />
<button
  className="btn btn-default"
  onClick={() => onLogin(pw)}
>
  로그인
</button>
  </div>
</main>
  )
};
