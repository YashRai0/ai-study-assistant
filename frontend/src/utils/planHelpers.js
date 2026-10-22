/**
 * Study Plan & Milestone Calculation Helpers
 */

/**
 * Calculates completed percentage of days in a study plan
 * @param {Array<{completed?: boolean}>} days
 * @returns {number} 0-100 bounded percentage
 */
export function calculatePlanProgress(days = []) {
  if (!Array.isArray(days) || days.length === 0) return 0;
  const completed = days.filter((d) => d && d.completed).length;
  return Math.round((completed / days.length) * 100);
}

/**
 * Estimates total minutes remaining in an active study plan
 * @param {Array<{completed?: boolean, estimatedMinutes?: number}>} days
 * @returns {number} Total estimated minutes remaining
 */
export function calculateRemainingMinutes(days = []) {
  if (!Array.isArray(days) || days.length === 0) return 0;
  return days
    .filter((d) => d && !d.completed)
    .reduce((sum, d) => sum + (Number(d.estimatedMinutes) || 0), 0);
}

/**
 * Categorizes plans into active vs completed
 * @param {Array<{totalDays?: number, completedDays?: number}>} plans
 */
export function partitionPlans(plans = []) {
  const active = [];
  const completed = [];

  for (const p of plans) {
    if (p.totalDays && p.completedDays >= p.totalDays) {
      completed.push(p);
    } else {
      active.push(p);
    }
  }

  return { active, completed };
}
