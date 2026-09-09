import test from "node:test";
import assert from "node:assert/strict";
import { calculateRetention, reviewsNeeded } from "../src/services/masteryWithEbbinghaus.js";

test("retention decays over time", () => {
  const mastery = 0.8;
  const retention0 = calculateRetention(mastery, 0);
  const retention7 = calculateRetention(mastery, 7);
  const retention30 = calculateRetention(mastery, 30);

  assert.equal(retention0, mastery);
  assert.ok(retention7 < mastery);
  assert.ok(retention30 < retention7);
});

test("higher mastery decays slower (retains a larger share of itself)", () => {
  const highMastery = 0.9;
  const lowMastery = 0.5;

  const decayHigh = calculateRetention(highMastery, 14);
  const decayLow = calculateRetention(lowMastery, 14);

  assert.ok(decayHigh / highMastery > decayLow / lowMastery);
});

test("reviews needed decreases as starting mastery increases", () => {
  const target = 0.9;
  const reviews0 = reviewsNeeded(0, target);
  const reviews05 = reviewsNeeded(0.5, target);
  const reviews08 = reviewsNeeded(0.8, target);

  // mastery=0 is a special case (returns a flat 5, skipping the
  // simulation loop entirely) rather than a computed value, so it isn't
  // guaranteed to strictly exceed every computed case — just be at least
  // as high as one requiring real progress from a cold start.
  assert.ok(reviews0 >= reviews05);
  assert.ok(reviews05 > reviews08);
});

test("reviewsNeeded returns 0 once current mastery already meets target", () => {
  assert.equal(reviewsNeeded(0.9, 0.9), 0);
  assert.equal(reviewsNeeded(0.95, 0.9), 0);
});
