import React from "react";
import { render, screen } from "@testing-library/react";
import AppWrapper from "./App";
test("로그인 화면이 렌더된다", () => {
  render(<AppWrapper />);
    expect(screen.getByRole("button", { name: "🔑 로그인" })).toBeInTheDocument();
});