/* Weekly challenge goal pool (stats are Achievements.bump keys). 3 are picked per week, same for everyone. */
(function (root) { var POOL = [
  { stat: 'games', text: 'Play {n} games', targets: [5, 8, 12] },
  { stat: 'lines', text: 'Clear {n} lines', targets: [40, 60, 90] },
  { stat: 'challenges', text: 'Finish {n} Daily Boards', targets: [2, 3, 4] },
  { stat: 'daily_claims', text: 'Claim the daily reward {n} times', targets: [3, 4, 5] }
]; root.WEEKLY_GOALS = POOL; if (typeof module !== 'undefined') module.exports = POOL; })(typeof window !== 'undefined' ? window : globalThis);
