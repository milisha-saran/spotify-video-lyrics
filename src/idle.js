export function createIdleTracker({ idleMs = 30000, now = Date.now } = {}) {
  let lastActive = now();
  let focused = true;
  return {
    markActive() {
      lastActive = now();
    },
    setFocused(value) {
      focused = value;
      if (value) lastActive = now();
    },
    isIdle() {
      return !focused || now() - lastActive >= idleMs;
    },
  };
}
