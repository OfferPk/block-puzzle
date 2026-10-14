/* Game-specific achievements (cosmetic coin rewards). Shared ones live in achievements.js. */
window.ACH_DEFS = [
  { "id": "bp_first", "name": "First Stone", "desc": "Finish your first game", "metric": "games", "goal": 1, "reward": 15 },
  { "id": "bp_games25", "name": "Stonemason", "desc": "Finish 25 games", "metric": "games", "goal": 25, "reward": 80 },
  { "id": "bp_s500", "name": "Warm Up", "desc": "Score 500 in one game", "metric": "best_score", "goal": 500, "reward": 30 },
  { "id": "bp_s2000", "name": "Gem Cutter", "desc": "Score 2,000 in one game", "metric": "best_score", "goal": 2000, "reward": 80 },
  { "id": "bp_s5000", "name": "Grandmaster", "desc": "Score 5,000 in one game", "metric": "best_score", "goal": 5000, "reward": 150 },
  { "id": "bp_lines100", "name": "Line Breaker", "desc": "Clear 100 lines in total", "metric": "lines", "goal": 100, "reward": 60 },
  { "id": "bp_lines500", "name": "Demolition Crew", "desc": "Clear 500 lines in total", "metric": "lines", "goal": 500, "reward": 150 },
  { "id": "bp_multi3", "name": "Triple Cut", "desc": "Clear 3 lines with one piece", "metric": "best_multi", "goal": 3, "reward": 60 },
  { "id": "bp_combo5", "name": "Chain Reaction", "desc": "Reach a 5-clear combo streak", "metric": "best_combo", "goal": 5, "reward": 80 }
]
;
if (typeof module !== 'undefined') module.exports = window.ACH_DEFS;
