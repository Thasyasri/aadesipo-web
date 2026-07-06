// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { registerPersistenceFlush } from "./db";

describe("registerPersistenceFlush", () => {
  it("registers a pagehide handler that calls flush, and unsubscribes cleanly", () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const unsubscribe = registerPersistenceFlush(flush);

    // A pagehide (not beforeunload) listener is registered on window.
    expect(addSpy).toHaveBeenCalledWith("pagehide", expect.any(Function));
    expect(addSpy.mock.calls.some(([type]) => String(type) === "beforeunload")).toBe(false);

    // Firing pagehide invokes the flush exactly once.
    window.dispatchEvent(new Event("pagehide"));
    expect(flush).toHaveBeenCalledTimes(1);

    // Unsubscribe removes the same handler; later events no longer flush.
    unsubscribe();
    expect(removeSpy).toHaveBeenCalledWith("pagehide", expect.any(Function));
    window.dispatchEvent(new Event("pagehide"));
    expect(flush).toHaveBeenCalledTimes(1);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("defaults to the real flushPersistence and fires without throwing", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const unsubscribe = registerPersistenceFlush(); // no arg → real flushPersistence

    expect(addSpy).toHaveBeenCalledWith("pagehide", expect.any(Function));
    expect(() => window.dispatchEvent(new Event("pagehide"))).not.toThrow();

    unsubscribe();
    addSpy.mockRestore();
  });
});
