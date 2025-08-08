// src/__tests__/Home.test.js

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { Home } from "../App";

describe("Home 컴포넌트 입출고 기능", () => {
  const initialInventory = {
    동아리방: { 공구: { 수리: [{ name: "드라이버", count: 0 }] } },
    비행장: { 공구: { 수리: [] } },
    교수님방: { 공구: { 수리: [] } }
  };
  let inventory, setInventory, logs, setLogs;

  beforeEach(() => {
    inventory = JSON.parse(JSON.stringify(initialInventory));
    setInventory = jest.fn();
    logs = [];
    setLogs = jest.fn();
  });

  test("＋ 버튼 클릭 시 count 증가, setInventory 호출", () => {
    render(
      <BrowserRouter>
        <Home
          inventory={inventory}
          setInventory={setInventory}
          searchTerm=""
          setSearchTerm={() => {}}
          logs={logs}
          setLogs={setLogs}
          isAdmin={true}
        />
      </BrowserRouter>
    );

    // 첫 번째 "📦 공구" summary 클릭
    const [firstToolSummary] = screen.getAllByText("📦 공구");
    fireEvent.click(firstToolSummary);
    // 첫 번째 "▸ 수리" summary 클릭
    const [firstRepairSummary] = screen.getAllByText("▸ 수리");
    fireEvent.click(firstRepairSummary);

    // 버튼 찾고 클릭
    const plusBtn = screen.getByRole("button", { name: "＋" });
    fireEvent.click(plusBtn);

    expect(setInventory).toHaveBeenCalled();
  });

  test("－ 버튼 클릭 시 count 0 미만으로 내려가지 않음", () => {
    inventory.동아리방.공구.수리[0].count = 0;

    render(
      <BrowserRouter>
        <Home
          inventory={inventory}
          setInventory={setInventory}
          searchTerm=""
          setSearchTerm={() => {}}
          logs={logs}
          setLogs={setLogs}
          isAdmin={true}
        />
      </BrowserRouter>
    );

    const [toolSumm] = screen.getAllByText("📦 공구");
    fireEvent.click(toolSumm);
    const [repairSumm] = screen.getAllByText("▸ 수리");
    fireEvent.click(repairSumm);

    const minusBtn = screen.getByRole("button", { name: "－" });
    fireEvent.click(minusBtn);

    expect(setInventory).toHaveBeenCalled();
    const newInv = setInventory.mock.calls[0][0];
    expect(newInv.동아리방.공구.수리[0].count).toBe(0);
  });

  test("입고 시 logs에 새로운 기록 생성", () => {
    render(
      <BrowserRouter>
        <Home
          inventory={inventory}
          setInventory={setInventory}
          searchTerm=""
          setSearchTerm={() => {}}
          logs={logs}
          setLogs={setLogs}
          isAdmin={true}
        />
      </BrowserRouter>
    );

    const [toolSumm] = screen.getAllByText("📦 공구");
    fireEvent.click(toolSumm);
    const [repairSumm] = screen.getAllByText("▸ 수리");
    fireEvent.click(repairSumm);

    const plusBtn = screen.getByRole("button", { name: "＋" });
    fireEvent.click(plusBtn);

    expect(setLogs).toHaveBeenCalled();
  });
});
