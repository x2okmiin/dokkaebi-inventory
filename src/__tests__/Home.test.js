import React from "react";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { Home } from "../App";

describe("Home 컴포넌트", () => {
  const inventory = {
    동아리방: { 공구: { 수리: [{ name: "드라이버", count: 1 }] } },
    비행장: { 공구: { 수리: [] } },
    교수님방: { 공구: { 수리: [] } },
  };

  test("기본 UI가 렌더된다", () => {
    render(
      <BrowserRouter>
        <Home
          inventory={inventory}
          setInventory={() => {}}
          searchTerm=""
          setSearchTerm={() => {}}
          logs={[]}
          setLogs={() => {}}
          isAdmin={true}
          userId="202036099"
          userName="테스터"
        />
      </BrowserRouter>
    );

    expect(screen.getByText("동아리방")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /📦 데이터/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /🧭 가이드/ })).toBeInTheDocument();
  });
});