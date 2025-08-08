// src/App.test.js

import React from "react";
import { render, screen } from "@testing-library/react";
import AppWrapper from "./App";

test("메인 헤더가 렌더된다", () => {
  render(<AppWrapper />);
  expect(
    screen.getByText("도깨비 드론축구단 재고관리")
  ).toBeInTheDocument();
});
