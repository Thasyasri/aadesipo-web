// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTranslation, setLocale, getLocale } from "./index";

beforeEach(() => {
  localStorage.clear();
  setLocale("en");
});

describe("useTranslation", () => {
  it("resolves a plain key with no placeholders", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.t("hud.roll")).toBe("Roll");
  });

  it("interpolates a single placeholder", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.t("hud.payBail", { amount: "₹50" })).toBe("Pay bail (₹50)");
  });

  it("interpolates multiple placeholders in one string", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.t("gameLog.diceRolled", { player: "Alice", die1: 4, die2: 2 })).toBe(
      "Alice rolled 4 + 2",
    );
  });

  it("interpolates the same placeholder appearing implicitly via nested keys", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.t("gameLog.rentPaid", { from: "Bob", to: "Carol", amount: "₹120" })).toBe(
      "Bob paid ₹120 rent to Carol",
    );
  });

  it("leaves an unmatched placeholder untouched rather than throwing", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.t("hud.payBail", {})).toBe("Pay bail ({amount})");
  });

  it("persists locale changes to localStorage and reflects them reactively", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.locale).toBe("en");

    act(() => setLocale("en"));
    expect(getLocale()).toBe("en");
    expect(localStorage.getItem("aadesipo-locale")).toBe("en");
  });
});
