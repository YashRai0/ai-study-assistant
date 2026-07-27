import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { scheduleNextReview, QUALITY } from "../src/services/spacedRepetition.js";

const NEW_CARD = { easeFactor: 2.5, interval: 0, repetitions: 0 };

describe("scheduleNextReview", () => {
  test("a new card reviewed as 'Good' gets a 1-day interval", () => {
    const result = scheduleNextReview(NEW_CARD, QUALITY.GOOD);
    assert.equal(result.interval, 1);
    assert.equal(result.repetitions, 1);
  });

  test("the second successful review gets a 6-day interval", () => {
    const afterFirst = scheduleNextReview(NEW_CARD, QUALITY.GOOD);
    const afterSecond = scheduleNextReview(afterFirst, QUALITY.GOOD);
    assert.equal(afterSecond.interval, 6);
    assert.equal(afterSecond.repetitions, 2);
  });

  test("the third+ successful review multiplies by ease factor", () => {
    const r1 = scheduleNextReview(NEW_CARD, QUALITY.GOOD);
    const r2 = scheduleNextReview(r1, QUALITY.GOOD);
    const r3 = scheduleNextReview(r2, QUALITY.GOOD);
    assert.equal(r3.interval, Math.round(r2.interval * r2.easeFactor));
    assert.equal(r3.repetitions, 3);
  });

  test("failing a review ('Again') resets repetitions and interval to 1 day", () => {
    const afterFirst = scheduleNextReview(NEW_CARD, QUALITY.GOOD);
    const afterSecond = scheduleNextReview(afterFirst, QUALITY.GOOD);
    const afterFail = scheduleNextReview(afterSecond, QUALITY.AGAIN);
    assert.equal(afterFail.repetitions, 0);
    assert.equal(afterFail.interval, 1);
  });

  test("'Easy' increases ease factor more than 'Good'", () => {
    const good = scheduleNextReview(NEW_CARD, QUALITY.GOOD);
    const easy = scheduleNextReview(NEW_CARD, QUALITY.EASY);
    assert.ok(easy.easeFactor > good.easeFactor);
  });

  test("'Hard' decreases ease factor relative to the starting value", () => {
    const hard = scheduleNextReview(NEW_CARD, QUALITY.HARD);
    assert.ok(hard.easeFactor < NEW_CARD.easeFactor);
  });

  test("ease factor never drops below the 1.3 floor even with repeated failures", () => {
    let card = { easeFactor: 1.35, interval: 5, repetitions: 4 };
    for (let i = 0; i < 10; i++) {
      card = scheduleNextReview(card, QUALITY.AGAIN);
    }
    assert.ok(card.easeFactor >= 1.3);
  });

  test("nextReviewDate is `interval` days in the future", () => {
    const before = Date.now();
    const result = scheduleNextReview(NEW_CARD, QUALITY.GOOD);
    const expectedMs = before + result.interval * 24 * 60 * 60 * 1000;
    // allow a small tolerance for test execution time
    assert.ok(Math.abs(result.nextReviewDate.getTime() - expectedMs) < 5000);
  });
});
