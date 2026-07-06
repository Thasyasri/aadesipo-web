// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useRef, useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useFocusTrap } from "./useFocusTrap";

function TrapHarness({ active }: { active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, active);

  return (
    <div>
      <button>Outside before</button>
      <div ref={containerRef} tabIndex={-1} data-testid="container">
        <button>First</button>
        <button>Middle</button>
        <button>Last</button>
      </div>
      <button>Outside after</button>
    </div>
  );
}

function ToggleableTrapHarness() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, open);

  return (
    <div>
      <button onClick={() => setOpen(true)}>Open trigger</button>
      {open && (
        <div ref={containerRef} tabIndex={-1}>
          <button onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </div>
  );
}

describe("useFocusTrap", () => {
  it("moves focus to the first focusable element inside the container on activation", () => {
    render(<TrapHarness active={true} />);
    expect(screen.getByText("First")).toHaveFocus();
  });

  it("does nothing when inactive — focus stays wherever it was", () => {
    render(<TrapHarness active={false} />);
    expect(document.body).toHaveFocus();
  });

  it("wraps Tab from the last element back to the first", async () => {
    const user = userEvent.setup();
    render(<TrapHarness active={true} />);

    screen.getByText("Last").focus();
    await user.tab();

    expect(screen.getByText("First")).toHaveFocus();
  });

  it("wraps Shift+Tab from the first element back to the last", async () => {
    const user = userEvent.setup();
    render(<TrapHarness active={true} />);

    expect(screen.getByText("First")).toHaveFocus();
    await user.tab({ shift: true });

    expect(screen.getByText("Last")).toHaveFocus();
  });

  it("never lets Tab escape to elements outside the container", async () => {
    const user = userEvent.setup();
    render(<TrapHarness active={true} />);

    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(screen.getByText("Outside before")).not.toHaveFocus();
      expect(screen.getByText("Outside after")).not.toHaveFocus();
    }
  });

  it("restores focus to the trigger element after the trap deactivates", async () => {
    const user = userEvent.setup();
    render(<ToggleableTrapHarness />);

    const trigger = screen.getByText("Open trigger");
    trigger.focus();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    expect(screen.getByText("Close")).toHaveFocus();

    await user.click(screen.getByText("Close"));
    expect(trigger).toHaveFocus();
  });

  it("falls back to focusing the container itself when it has no focusable children", () => {
    function EmptyTrapHarness() {
      const containerRef = useRef<HTMLDivElement>(null);
      useFocusTrap(containerRef, true);
      return (
        <div ref={containerRef} tabIndex={-1} data-testid="empty-container">
          <p>No interactive elements here.</p>
        </div>
      );
    }
    render(<EmptyTrapHarness />);
    expect(screen.getByTestId("empty-container")).toHaveFocus();
  });

  it("prevents the default Tab action entirely when there are no focusable elements", () => {
    function EmptyTrapHarness() {
      const containerRef = useRef<HTMLDivElement>(null);
      useFocusTrap(containerRef, true);
      return (
        <div ref={containerRef} tabIndex={-1}>
          <p>Nothing focusable.</p>
        </div>
      );
    }
    render(<EmptyTrapHarness />);
    const event = fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(event).toBe(false);
  });
});
