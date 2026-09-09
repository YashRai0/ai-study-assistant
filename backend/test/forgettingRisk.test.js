import test from "node:test";
import assert from "node:assert/strict";
import { calculateForgettingRisk } from "../src/services/mastery.js";

test("no review date at all returns a neutral mid-risk default", () => {
  assert.equal(calculateForgettingRisk(null), 0.5);
});

test("forgetting risk is near zero immediately after a review", () => {
  const risk = calculateForgettingRisk(new Date(), 0.8);
  assert.ok(risk < 0.05);
});

test("forgetting risk increases as more time passes since the last review", () => {
  const now = Date.now();
  const threeDaysAgo = new Date(now - 3 * 864e5);
  const thirtyDaysAgo = new Date(now - 30 * 864e5);
  const riskAt3Days = calculateForgettingRisk(threeDaysAgo, 0.7);
  const riskAt30Days = calculateForgettingRisk(thirtyDaysAgo, 0.7);
  assert.ok(riskAt30Days > riskAt3Days);
});

test("higher mastery decays more slowly than lower mastery at the same elapsed time — this is the actual fix, replacing a fixed decay rate that ignored mastery entirely", () => {
  const twoWeeksAgo = new Date(Date.now() - 14 * 864e5);
  const riskHighMastery = calculateForgettingRisk(twoWeeksAgo, 0.95);
  const riskLowMastery = calculateForgettingRisk(twoWeeksAgo, 0.2);
  assert.ok(riskHighMastery < riskLowMastery);
});

test("risk stays within [0, 1] even for very old review dates", () => {
  const yearsAgo = new Date(Date.now() - 900 * 864e5);
  const risk = calculateForgettingRisk(yearsAgo, 0.5);
  assert.ok(risk >= 0 && risk <= 1);
});
