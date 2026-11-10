import { test } from "node:test";
import assert from "node:assert/strict";
import { createIdleTracker } from "../src/idle.js";

function setup() {
  let t = 0;
  const tracker = createIdleTracker({ now: () => t });
  return { tracker, setTime: (v) => { t = v; } };
}

test("fresh tracker is not idle", () => {
  const { tracker } = setup();
  assert.equal(tracker.isIdle(), false);
});

test("idle exactly at 30000 ms", () => {
  const { tracker, setTime } = setup();
  setTime(29999);
  assert.equal(tracker.isIdle(), false);
  setTime(30000);
  assert.equal(tracker.isIdle(), true);
});

test("markActive resets the timer", () => {
  const { tracker, setTime } = setup();
  setTime(30000);
  tracker.markActive();
  setTime(45000);
  assert.equal(tracker.isIdle(), false);
});

test("unfocused is idle at once; refocus counts as activity", () => {
  const { tracker, setTime } = setup();
  tracker.setFocused(false);
  assert.equal(tracker.isIdle(), true);
  tracker.setFocused(true);
  assert.equal(tracker.isIdle(), false);
  setTime(30000);
  assert.equal(tracker.isIdle(), true);
});
