import { describe, expect, it } from "vitest";
import { numbersFromVietnameseSpeech } from "./viSpokenNumbers";

describe("numbersFromVietnameseSpeech", () => {
  it("đọc từng chữ số: một hai không → 120", () => {
    expect(numbersFromVietnameseSpeech("một hai không")).toEqual([120]);
  });

  it("tách bằng phẩy", () => {
    expect(numbersFromVietnameseSpeech("một hai không, năm mươi, ba mươi, bốn")).toEqual([120, 50, 30, 4]);
  });

  it("chữ số La Tinh vẫn lấy được", () => {
    expect(numbersFromVietnameseSpeech("120 50 30 4")).toEqual([120, 50, 30, 4]);
  });

  it("năm mươi → 50", () => {
    expect(numbersFromVietnameseSpeech("năm mươi")).toEqual([50]);
  });

  it("ba mươi bốn (một cụm) → 34 theo cách đọc tiếng Việt", () => {
    expect(numbersFromVietnameseSpeech("ba mươi bốn")).toEqual([34]);
  });

  it("ngắt bằng phẩy để tách 30 và 4", () => {
    expect(numbersFromVietnameseSpeech("ba mươi phẩy bốn")).toEqual([30, 4]);
  });
});
