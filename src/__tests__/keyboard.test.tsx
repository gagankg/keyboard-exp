import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Keyboard, type KeyboardInteractionEvent } from "@/components/ui/keyboard";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// web-haptics uses navigator.vibrate + AudioContext — stub both
vi.mock("web-haptics/react", () => ({
  useWebHaptics: () => ({
    trigger: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
    isSupported: false,
  }),
}));

// AudioContext isn't available in jsdom — use class so `new` works
class MockAudioContext {
  state = "running";
  destination = {};
  createBufferSource = vi.fn(() => ({ buffer: null, connect: vi.fn(), start: vi.fn(), disconnect: vi.fn() }));
  createBiquadFilter = vi.fn(() => ({ type: "", frequency: { value: 0 }, Q: { value: 0 }, connect: vi.fn() }));
  createGain = vi.fn(() => ({ gain: { value: 0 }, connect: vi.fn() }));
  createBuffer = vi.fn(() => ({ getChannelData: vi.fn(() => new Float32Array(10)) }));
  decodeAudioData = vi.fn().mockResolvedValue({});
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}
globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext;

// Stub fetch so the audio buffer load doesn't fail
globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

// IntersectionObserver isn't in jsdom — use class so `new` works
const observeMock = vi.fn();
const disconnectMock = vi.fn();
class MockIntersectionObserver {
  constructor(cb: IntersectionObserverCallback) {
    // Immediately report visible so physical key listeners are registered
    cb([{ isIntersecting: true }] as IntersectionObserverEntry[], this);
  }
  observe = observeMock;
  disconnect = disconnectMock;
}
globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderKeyboard(onKeyEvent?: (e: KeyboardInteractionEvent) => void) {
  return render(
    <Keyboard
      onKeyEvent={onKeyEvent}
      enableSound={false}
      enableHaptics={false}
    />
  );
}

function pressPhysical(code: string) {
  fireEvent.keyDown(document, { code, key: code, repeat: false });
}

function releasePhysical(code: string) {
  fireEvent.keyUp(document, { code, key: code });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Keyboard — physical key events", () => {
  it("emits 'down' event on keydown", () => {
    const onKeyEvent = vi.fn();
    renderKeyboard(onKeyEvent);

    pressPhysical("KeyA");

    expect(onKeyEvent).toHaveBeenCalledWith({
      code: "KeyA",
      phase: "down",
      source: "physical",
    });
  });

  it("emits 'up' event on keyup", () => {
    const onKeyEvent = vi.fn();
    renderKeyboard(onKeyEvent);

    pressPhysical("KeyA");
    releasePhysical("KeyA");

    expect(onKeyEvent).toHaveBeenCalledWith({
      code: "KeyA",
      phase: "up",
      source: "physical",
    });
  });

  it("does not emit 'down' for repeated keydown events", () => {
    const onKeyEvent = vi.fn();
    renderKeyboard(onKeyEvent);

    fireEvent.keyDown(document, { code: "KeyA", key: "KeyA", repeat: true });

    expect(onKeyEvent).not.toHaveBeenCalled();
  });

  it("deduplicates: pressing the same key twice only emits one 'down'", () => {
    const onKeyEvent = vi.fn();
    renderKeyboard(onKeyEvent);

    pressPhysical("KeyB");
    pressPhysical("KeyB"); // second press — should be ignored

    const downEvents = onKeyEvent.mock.calls.filter(
      ([e]) => e.phase === "down" && e.code === "KeyB"
    );
    expect(downEvents).toHaveLength(1);
  });

  it("emits 'up' only once per key per press", () => {
    const onKeyEvent = vi.fn();
    renderKeyboard(onKeyEvent);

    pressPhysical("Space");
    releasePhysical("Space");
    releasePhysical("Space"); // second release — should be ignored

    const upEvents = onKeyEvent.mock.calls.filter(
      ([e]) => e.phase === "up" && e.code === "Space"
    );
    expect(upEvents).toHaveLength(1);
  });

  it("emits 'up' for all pressed keys on window blur (releaseAllKeys)", () => {
    const onKeyEvent = vi.fn();
    renderKeyboard(onKeyEvent);

    pressPhysical("KeyA");
    pressPhysical("KeyS");

    fireEvent(window, new Event("blur"));

    const upEvents = onKeyEvent.mock.calls.filter(([e]) => e.phase === "up");
    const codes = upEvents.map(([e]) => e.code);
    expect(codes).toContain("KeyA");
    expect(codes).toContain("KeyS");
  });

  it("cleans up listeners on unmount (no events after unmount)", () => {
    const onKeyEvent = vi.fn();
    const { unmount } = renderKeyboard(onKeyEvent);

    unmount();
    pressPhysical("KeyZ");

    expect(onKeyEvent).not.toHaveBeenCalled();
  });
});

describe("Keyboard — pointer events", () => {
  it("emits 'down' with source=pointer on pointerdown", () => {
    const onKeyEvent = vi.fn();
    renderKeyboard(onKeyEvent);

    const keyButton = screen.getByRole("button", { name: "KeyA" });
    fireEvent.pointerDown(keyButton, { button: 0, pointerId: 1 });

    expect(onKeyEvent).toHaveBeenCalledWith({
      code: "KeyA",
      phase: "down",
      source: "pointer",
    });
  });

  it("emits 'up' with source=pointer on pointerup — stale-state bug fix", () => {
    // This tests the fix: release must work even when isPressed state
    // hasn't re-rendered yet (i.e. pointerUp fires before React commits)
    const onKeyEvent = vi.fn();
    renderKeyboard(onKeyEvent);

    const keyButton = screen.getByRole("button", { name: "KeyA" });

    // Fire pointerDown and pointerUp in the same synchronous tick
    // (state has not updated between them — this was the stuck-key scenario)
    fireEvent.pointerDown(keyButton, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(keyButton, { button: 0, pointerId: 1 });

    const upEvents = onKeyEvent.mock.calls.filter(
      ([e]) => e.phase === "up" && e.code === "KeyA"
    );
    expect(upEvents).toHaveLength(1);
  });

  it("ignores non-primary pointer buttons", () => {
    const onKeyEvent = vi.fn();
    renderKeyboard(onKeyEvent);

    const keyButton = screen.getByRole("button", { name: "KeyA" });
    fireEvent.pointerDown(keyButton, { button: 2, pointerId: 1 }); // right-click

    expect(onKeyEvent).not.toHaveBeenCalled();
  });

  it("releases key on pointerleave", () => {
    const onKeyEvent = vi.fn();
    renderKeyboard(onKeyEvent);

    const keyButton = screen.getByRole("button", { name: "Space" });
    fireEvent.pointerDown(keyButton, { button: 0, pointerId: 1 });
    fireEvent.pointerLeave(keyButton, { pointerId: 1 });

    const upEvents = onKeyEvent.mock.calls.filter(([e]) => e.phase === "up");
    expect(upEvents.some(([e]) => e.code === "Space")).toBe(true);
  });

  it("releases key on pointercancel", () => {
    const onKeyEvent = vi.fn();
    renderKeyboard(onKeyEvent);

    const keyButton = screen.getByRole("button", { name: "Enter" });
    fireEvent.pointerDown(keyButton, { button: 0, pointerId: 1 });
    fireEvent.pointerCancel(keyButton, { pointerId: 1 });

    const upEvents = onKeyEvent.mock.calls.filter(([e]) => e.phase === "up");
    expect(upEvents.some(([e]) => e.code === "Enter")).toBe(true);
  });
});

describe("Keyboard — releaseAllKeys", () => {
  it("releases all physically pressed keys on visibilitychange to hidden", () => {
    const onKeyEvent = vi.fn();
    renderKeyboard(onKeyEvent);

    pressPhysical("KeyA");
    pressPhysical("ShiftLeft");

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      writable: true,
    });
    fireEvent(document, new Event("visibilitychange"));

    const upCodes = onKeyEvent.mock.calls
      .filter(([e]) => e.phase === "up")
      .map(([e]) => e.code);

    expect(upCodes).toContain("KeyA");
    expect(upCodes).toContain("ShiftLeft");

    // Reset
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
    });
  });

  it("does not emit 'up' when no keys are pressed", () => {
    const onKeyEvent = vi.fn();
    renderKeyboard(onKeyEvent);

    fireEvent(window, new Event("blur")); // no keys pressed, nothing to release

    const upEvents = onKeyEvent.mock.calls.filter(([e]) => e.phase === "up");
    expect(upEvents).toHaveLength(0);
  });
});
