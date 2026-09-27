// Unit tests for the interstitial frequency rules. Run: node test/adgate.test.js
const assert = require('assert');
const AdGate = require('../www/js/adgate.js');
// load the shipped browser config (it assigns window.ADS_CONFIG)
const vm = require('vm'); const sandbox = { window: {} };
vm.runInNewContext(require('fs').readFileSync(__dirname + '/../www/js/ads-config.js', 'utf8'), sandbox);
const CFG = sandbox.window.ADS_CONFIG;
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok -', name); } catch (e) { fail++; console.log('  FAIL -', name, '\n   ', e.message); } }
const MIN = 60000;
const fresh = () => AdGate.create(CFG, {});

console.log('adgate.test.js');
t('shipped config: 5 games, 3 min, every 3 games, 90 s', () => {
  assert.strictEqual(CFG.INTERSTITIAL_MIN_GAMES, 5); assert.strictEqual(CFG.INTERSTITIAL_MIN_PLAY_MS, 3 * MIN);
  assert.strictEqual(CFG.INTERSTITIAL_EVERY_N_GAMES, 3); assert.strictEqual(CFG.INTERSTITIAL_MIN_INTERVAL_MS, 90000);
});
t('never on a fresh install (launch)', () => assert.strictEqual(fresh().canShow(Date.now()), false));
t('not before 5 completed games even with lots of play time', () => {
  const g = fresh(); g.addPlayTime(30000); for (let i = 0; i < 40; i++) g.addPlayTime(30000);
  for (let i = 0; i < 4; i++) { g.gameCompleted(); assert.strictEqual(g.canShow(1e12), false, 'game ' + (i + 1)); }
  g.gameCompleted(); assert.strictEqual(g.canShow(1e12), true);
});
t('not before 3 minutes of play even after many games', () => {
  const g = fresh(); for (let i = 0; i < 10; i++) g.gameCompleted();
  for (let s = 0; s < 179; s++) g.addPlayTime(1000);
  assert.strictEqual(g.canShow(1e12), false);
  g.addPlayTime(1000); assert.strictEqual(g.canShow(1e12), true);
});
t('play-time ignores bogus deltas (negative / huge)', () => { const g = fresh(); g.addPlayTime(-5); g.addPlayTime(10 * MIN); assert.strictEqual(g.state.playMs, 0); });
function eligible() { const g = fresh(); for (let i = 0; i < 5; i++) g.gameCompleted(); for (let i = 0; i < 180; i++) g.addPlayTime(1000); return g; }
t('after one ad: needs 3 more game overs', () => {
  const g = eligible(); let now = 1e9;
  assert.ok(g.canShow(now)); g.shown(now);
  now += 10 * MIN;
  g.gameCompleted(); assert.strictEqual(g.canShow(now), false);
  g.gameCompleted(); assert.strictEqual(g.canShow(now), false);
  g.gameCompleted(); assert.strictEqual(g.canShow(now), true);
});
t('at most one per 90 s even if games are quick', () => {
  const g = eligible(); let now = 1e9; g.shown(now);
  for (let i = 0; i < 6; i++) g.gameCompleted();
  assert.strictEqual(g.canShow(now + 30000), false); assert.strictEqual(g.canShow(now + 89999), false); assert.strictEqual(g.canShow(now + 90000), true);
});
t('restart without finishing a game does not count toward the 3', () => {
  const g = eligible(); const now = 1e9; g.shown(now);
  // restart transitions only ask canShow; they do not call gameCompleted
  for (let i = 0; i < 10; i++) assert.strictEqual(g.canShow(now + 10 * MIN), false);
});
t('clock moving backwards resets the interval instead of blocking forever', () => {
  const g = eligible(); g.shown(2e9); for (let i = 0; i < 3; i++) g.gameCompleted();
  assert.strictEqual(g.canShow(1e9), false); assert.strictEqual(g.canShow(1e9 + 90000), true);
});
t('state persists through JSON round trip', () => {
  const g = eligible(); g.shown(1e9); g.gameCompleted();
  const g2 = AdGate.create(CFG, JSON.parse(JSON.stringify(g.state)));
  assert.strictEqual(g2.state.gamesCompleted, 6); assert.strictEqual(g2.state.gamesSince, 1); assert.strictEqual(g2.state.playMs, 180000);
  g2.gameCompleted(); g2.gameCompleted(); assert.strictEqual(g2.canShow(1e9 + 90000), true);
});
t('simulated session: ads only on qualifying transitions', () => {
  const g = fresh(); let now = 1e9, shown = [];
  for (let game = 1; game <= 30; game++) {
    for (let s = 0; s < 40; s++) { g.addPlayTime(1000); now += 1000; } // 40 s per game
    g.gameCompleted();
    if (g.canShow(now)) { g.shown(now); shown.push({ game, now }); }
  }
  assert.ok(shown.length > 0); assert.ok(shown[0].game >= 5);
  assert.ok(shown[0].now - 1e9 >= 3 * MIN);
  for (let i = 1; i < shown.length; i++) { assert.ok(shown[i].game - shown[i - 1].game >= 3); assert.ok(shown[i].now - shown[i - 1].now >= 90000); }
});
t('ads.js never asks for an interstitial outside maybeInterstitial / game.js only on new-game transition', () => {
  const fs = require('fs'); const game = fs.readFileSync(__dirname + '/../www/js/game.js', 'utf8');
  const calls = game.match(/maybeInterstitial\(/g) || []; assert.strictEqual(calls.length, 1);
  const i = game.indexOf('maybeInterstitial('); const fn = game.lastIndexOf('function ', i); assert.ok(/function newGameTransition/.test(game.slice(fn, fn + 40)));
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
