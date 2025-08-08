// src/__tests__/storage.test.js

import {
  getLocalInventory,
  saveLocalInventory,
  getLocalLogs,
  saveLocalLogs,
  getLocalAdmin,
  saveLocalAdmin
} from "../utils/storage";

describe("localStorage helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("getLocalInventory: 아무 값 없으면 빈 객체 반환", () => {
    expect(getLocalInventory()).toEqual({});
  });

  test("saveLocalInventory + getLocalInventory 연동", () => {
    const data = { foo: 1 };
    saveLocalInventory(data);
    expect(getLocalInventory()).toEqual(data);
  });

  test("getLocalLogs: 아무 값 없으면 빈 배열 반환", () => {
    expect(getLocalLogs()).toEqual([]);
  });

  test("saveLocalLogs + getLocalLogs 연동", () => {
    const arr = [{ a: 1 }];
    saveLocalLogs(arr);
    expect(getLocalLogs()).toEqual(arr);
  });

  test("getLocalAdmin 기본은 false", () => {
    expect(getLocalAdmin()).toBe(false);
  });

  test("saveLocalAdmin true/false 저장", () => {
    saveLocalAdmin(true);
    expect(getLocalAdmin()).toBe(true);
    saveLocalAdmin(false);
    expect(getLocalAdmin()).toBe(false);
  });
});
