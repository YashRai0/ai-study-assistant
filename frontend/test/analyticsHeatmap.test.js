import test from "node:test";
import assert from "node:assert/strict";

function getActivityLevel(count) {
  if (!count || count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  return 3;
}

function computeHeatmapSummary(activityByDay) {
  if (!activityByDay || activityByDay.length === 0) {
    return { activeDays: 0, totalActions: 0, maxDayCount: 0 };
  }

  let activeDays = 0;
  let totalActions = 0;
  let maxDayCount = 0;

  for (const day of activityByDay) {
    if (day.count > 0) activeDays++;
    totalActions += day.count;
    if (day.count > maxDayCount) maxDayCount = day.count;
  }

  return { activeDays, totalActions, maxDayCount };
}

test("AnalyticsHeatmap: maps activity counts to correct visual intensity levels", () => {
  assert.equal(getActivityLevel(0), 0);
  assert.equal(getActivityLevel(1), 1);
  assert.equal(getActivityLevel(2), 1);
  assert.equal(getActivityLevel(3), 2);
  assert.equal(getActivityLevel(5), 2);
  assert.equal(getActivityLevel(8), 3);
  assert.equal(getActivityLevel(20), 3);
});

test("AnalyticsHeatmap: calculates active days and total actions accurately", () => {
  const data = [
    { date: "2026-10-01", count: 3 },
    { date: "2026-10-02", count: 0 },
    { date: "2026-10-03", count: 5 },
    { date: "2026-10-04", count: 0 },
    { date: "2026-10-05", count: 1 },
  ];

  const summary = computeHeatmapSummary(data);
  assert.equal(summary.activeDays, 3);
  assert.equal(summary.totalActions, 9);
  assert.equal(summary.maxDayCount, 5);
});
