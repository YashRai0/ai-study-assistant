import test from "node:test";
import assert from "node:assert/strict";

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function calculatePhaseProgress(secondsLeft, totalSeconds) {
  if (totalSeconds <= 0) return 100;
  const elapsed = Math.max(0, totalSeconds - secondsLeft);
  return Math.min(100, Math.round((elapsed / totalSeconds) * 100));
}

function computeMasteryDelta(before, after) {
  const b = Math.round((before || 0) * 100);
  const a = Math.round((after !== undefined ? after : before || 0) * 100);
  const delta = a - b;
  return {
    beforePct: b,
    afterPct: a,
    delta,
    isPositive: delta > 0,
  };
}

test("StudySessionHud: formatTime formats seconds to mm:ss", () => {
  assert.equal(formatTime(300), "05:00");
  assert.equal(formatTime(65), "01:05");
  assert.equal(formatTime(9), "00:09");
  assert.equal(formatTime(0), "00:00");
});

test("StudySessionHud: calculatePhaseProgress tracks elapsed fraction", () => {
  assert.equal(calculatePhaseProgress(300, 300), 0);
  assert.equal(calculatePhaseProgress(150, 300), 50);
  assert.equal(calculatePhaseProgress(0, 300), 100);
});

test("StudySessionHud: computeMasteryDelta calculates gains accurately", () => {
  const gain = computeMasteryDelta(0.4, 0.65);
  assert.equal(gain.beforePct, 40);
  assert.equal(gain.afterPct, 65);
  assert.equal(gain.delta, 25);
  assert.equal(gain.isPositive, true);

  const flat = computeMasteryDelta(0.5, 0.5);
  assert.equal(flat.delta, 0);
  assert.equal(flat.isPositive, false);
});
