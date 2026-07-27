// SM-2 spaced-repetition scheduling — the algorithm behind SuperMemo/Anki.
// Pure function of a card's current SRS state + a review quality rating, so
// it's independent of the database and directly unit-testable.
//
// Quality scale (simplified to 4 buttons in the UI, matching Anki's
// convention rather than SM-2's original 0-5 granularity):
//   0 = "Again" (failed recall — forgot it)
//   3 = "Hard"  (recalled, but it was a struggle)
//   4 = "Good"  (recalled correctly, normal effort)
//   5 = "Easy"  (recalled correctly, trivially)

export const QUALITY = { AGAIN: 0, HARD: 3, GOOD: 4, EASY: 5 };

const MIN_EASE_FACTOR = 1.3;

/**
 * @param {{ easeFactor: number, interval: number, repetitions: number }} card
 * @param {number} quality - one of QUALITY's values
 * @returns {{ easeFactor: number, interval: number, repetitions: number, nextReviewDate: Date }}
 */
export function scheduleNextReview(card, quality) {
  let { easeFactor, interval, repetitions } = card;

  if (quality < 3) {
    // Failed recall: restart the interval ladder, but don't touch ease factor
    // down here — SM-2 still updates ease factor based on quality even on a
    // fail, just resets the repetition streak and interval separately.
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    repetitions += 1;
  }

  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < MIN_EASE_FACTOR) easeFactor = MIN_EASE_FACTOR;

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);

  return { easeFactor, interval, repetitions, nextReviewDate };
}
