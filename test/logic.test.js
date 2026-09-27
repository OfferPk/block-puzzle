// Unit tests for Gridstone's pure game logic (no DOM). Run: node test/logic.test.js
const assert = require('assert');
const L = require('../www/js/logic.js');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok -', name); } catch (e) { fail++; console.log('  FAIL -', name, '\n   ', e.message); } }
const P = n => { const p = L.pieceByName(n); if (!p) throw new Error('no piece ' + n); return p; };
const N = L.N;
const idx = (r, c) => r * N + c;
const fromRows = rows => { const b = L.emptyBoard(); rows.forEach((s, r) => [...s].forEach((ch, c) => { if (ch !== '.') b[idx(r, c)] = 1; })); return b; };

console.log('logic.test.js');
t('8x8 empty board', () => { const b = L.emptyBoard(); assert.strictEqual(b.length, 64); assert.ok(L.isEmpty(b)); });
t('catalog: unique names, cells inside bounding box, normalized', () => {
  const names = new Set();
  L.PIECES.forEach((p, i) => {
    assert.strictEqual(p.id, i); assert.ok(!names.has(p.name)); names.add(p.name);
    assert.ok(p.cells.length >= 1 && p.cells.length <= 9);
    p.cells.forEach(([r, c]) => assert.ok(r >= 0 && c >= 0 && r < p.h && c < p.wd));
    assert.ok(p.cells.some(([r]) => r === 0) && p.cells.some(([, c]) => c === 0));
  });
});

// ---- placement ----
t('canPlace: inside empty board', () => assert.ok(L.canPlace(L.emptyBoard(), P('sq3'), 5, 5)));
t('canPlace: rejects out of bounds (right/bottom/negative)', () => {
  const b = L.emptyBoard();
  assert.ok(!L.canPlace(b, P('sq3'), 6, 0)); assert.ok(!L.canPlace(b, P('i5'), 0, 4)); assert.ok(!L.canPlace(b, P('dot'), -1, 0));
});
t('canPlace: rejects overlap', () => { const b = L.emptyBoard(); b[idx(3, 3)] = 1; assert.ok(!L.canPlace(b, P('sq2'), 2, 2)); assert.ok(L.canPlace(b, P('sq2'), 4, 4)); });
t('place: fills exactly the piece cells and does not mutate input', () => {
  const b = L.emptyBoard(); const res = L.place(b, P('t4'), 2, 3, 4);
  assert.ok(L.isEmpty(b)); assert.strictEqual(L.filled(res.board), 4); assert.strictEqual(res.placed.length, 4);
  res.placed.forEach(i => assert.strictEqual(res.board[i], 4)); assert.deepStrictEqual(res.cleared, []);
});
t('place: returns null on an invalid spot', () => assert.strictEqual(L.place(L.emptyBoard(), P('i4'), 0, 6), null));
t('positions: count on empty board = (9-h)*(9-w)', () => { const p = P('l4'); assert.strictEqual(L.positions(L.emptyBoard(), p).length, (9 - p.h) * (9 - p.wd)); });

// ---- line clears ----
t('row clear', () => {
  const b = fromRows(['', '', '', '', '', '', '', 'XXXXX...']); b[idx(0, 0)] = 1;
  const res = L.place(b, P('tri'), 7, 5, 2);
  assert.deepStrictEqual(res.rows, [7]); assert.deepStrictEqual(res.cols, []); assert.strictEqual(res.cleared.length, 8);
  assert.strictEqual(L.filled(res.board), 1);
});
t('column clear', () => {
  const b = L.emptyBoard(); for (let r = 0; r < 6; r++) b[idx(r, 2)] = 1; b[idx(0, 7)] = 1;
  const res = L.place(b, P('duo-r1'), 6, 2, 3);
  assert.deepStrictEqual(res.cols, [2]); assert.deepStrictEqual(res.rows, []); assert.strictEqual(L.filled(res.board), 1);
});
t('row + column cross clear counts the shared cell once', () => {
  const b = L.emptyBoard(); for (let i = 1; i < 8; i++) { b[idx(0, i)] = 1; b[idx(i, 0)] = 1; }
  const res = L.place(b, P('dot'), 0, 0, 1);
  assert.deepStrictEqual(res.rows, [0]); assert.deepStrictEqual(res.cols, [0]); assert.strictEqual(res.cleared.length, 15); assert.ok(L.isEmpty(res.board));
});
t('multiple rows at once', () => {
  const b = fromRows(['', '', '', '', '', '', 'XXXXXX..', 'XXXXXX..']);
  const res = L.place(b, P('sq2'), 6, 6, 1);
  assert.deepStrictEqual(res.rows, [6, 7]); assert.ok(L.isEmpty(res.board));
});
t('no clear on an almost-full row', () => { const b = fromRows(['XXXXXX..']); const res = L.place(b, P('dot'), 0, 6, 1); assert.deepStrictEqual(res.rows, []); assert.strictEqual(L.filled(res.board), 7); });
t('previewClears matches place', () => {
  const b = fromRows(['', '', '', '', '', '', '', 'XXXXX...']);
  assert.deepStrictEqual(L.previewClears(b, P('tri'), 7, 5), { rows: [7], cols: [] });
  assert.strictEqual(L.previewClears(b, P('tri'), 7, 6), null);
});
t('fullLines on a full board: 8 rows and 8 cols', () => { const f = L.fullLines(new Array(64).fill(1)); assert.strictEqual(f.rows.length, 8); assert.strictEqual(f.cols.length, 8); });

// ---- scoring ----
t('plain placement: 1 point per cell, streak unchanged at 0', () => { const s = L.scoreMove({ streak: 0, sinceClear: 0 }, 4, 0, false); assert.strictEqual(s.points, 4); assert.strictEqual(s.streak, 0); });
t('single line: cells + 20', () => { const s = L.scoreMove({ streak: 0, sinceClear: 0 }, 3, 1, false); assert.strictEqual(s.points, 23); assert.strictEqual(s.streak, 1); });
t('combo: 2 lines = 80, 3 lines = 180, 4 lines = 320', () => {
  assert.strictEqual(L.scoreMove({}, 0, 2, false).linePoints, 80);
  assert.strictEqual(L.scoreMove({}, 0, 3, false).linePoints, 180);
  assert.strictEqual(L.scoreMove({}, 0, 4, false).linePoints, 320);
});
t('streak multiplier: x1, x1.5, x2 ... capped at x3', () => {
  let st = { streak: 0, sinceClear: 0 }; const mults = [];
  for (let i = 0; i < 7; i++) { const s = L.scoreMove(st, 1, 1, false); mults.push(s.multiplier); st = s; }
  assert.deepStrictEqual(mults, [1, 1.5, 2, 2.5, 3, 3, 3]);
  assert.strictEqual(L.scoreMove({ streak: 2, sinceClear: 0 }, 1, 1, false).points, 1 + 40);
});
t('streak survives 2 non-clearing moves, breaks on the 3rd', () => {
  let s = L.scoreMove({ streak: 3, sinceClear: 0 }, 1, 0, false); assert.strictEqual(s.streak, 3);
  s = L.scoreMove(s, 1, 0, false); assert.strictEqual(s.streak, 3);
  s = L.scoreMove(s, 1, 0, false); assert.strictEqual(s.streak, 0);
  const s2 = L.scoreMove({ streak: 3, sinceClear: 2 }, 1, 1, false); assert.strictEqual(s2.streak, 4); assert.strictEqual(s2.sinceClear, 0);
});
t('board clear bonus +300', () => { const s = L.scoreMove({}, 1, 2, true); assert.strictEqual(s.points, 1 + 80 + 300); assert.ok(s.boardClear); });
t('coins: 1 per 50 points (cosmetic)', () => { assert.strictEqual(L.coinsForScore(49), 0); assert.strictEqual(L.coinsForScore(251), 5); });

// ---- game over ----
const holes = () => new Array(64).fill(0).map((_, i) => ((Math.floor(i / 8) + i % 8) % 4 === 0 ? 0 : 1));
t('game over when no tray piece fits', () => assert.ok(L.isGameOver(holes(), [P('duo').id, P('tri-r1').id, P('sq2').id])));
t('not over when one piece fits', () => assert.ok(!L.isGameOver(holes(), [P('duo').id, P('dot').id, null])));
t('empty tray is not game over', () => assert.ok(!L.isGameOver(holes(), [null, null, null])));
t('used slots ignored', () => assert.ok(L.isGameOver(holes(), [null, P('sq3').id, null])));
t('full board: over for any piece', () => assert.ok(L.isGameOver(new Array(64).fill(1), [P('dot').id])));
t('reviveBoard clears the centre 4x4 only', () => {
  const b = L.reviveBoard(new Array(64).fill(1));
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) assert.strictEqual(b[idx(r, c)], (r >= 2 && r < 6 && c >= 2 && c < 6) ? 0 : 1);
  assert.ok(!L.isGameOver(b, [P('sq3').id]));
});

// ---- fair generator ----
t('rng deterministic and resumable from its serialized state', () => {
  const a = L.makeRng(42), b = L.makeRng(42); for (let i = 0; i < 5; i++) assert.strictEqual(a.next(), b.next());
  const c = L.makeRng(a.s); assert.strictEqual(c.next(), a.next());
});
t('dealTray deterministic for the same seed', () => {
  assert.deepStrictEqual(L.dealTray(L.emptyBoard(), L.makeRng(7), 0).tray, L.dealTray(L.emptyBoard(), L.makeRng(7), 0).tray);
});
t('dealTray on empty board: 3 valid ids, all placeable', () => {
  for (let s = 1; s < 50; s++) { const d = L.dealTray(L.emptyBoard(), L.makeRng(s), 0); assert.strictEqual(d.tray.length, 3); assert.strictEqual(d.fair, 'all'); d.tray.forEach(id => assert.ok(L.PIECES[id])); }
});
t('dealTray on a nearly blocked board still deals a fitting piece', () => {
  for (let s = 1; s < 30; s++) {
    const d = L.dealTray(holes(), L.makeRng(s), 500);
    assert.ok(!L.isGameOver(holes(), d.tray), 'seed ' + s); // only the dot fits here
    assert.strictEqual(d.fair, 'all', 'seed ' + s);
    assert.strictEqual(L.setPlaceable(holes(), d.tray, 100000), true, 'set must be fully placeable: ' + d.tray.map(i => L.PIECES[i].name));
  }
});
t('setPlaceable considers clears between pieces', () => {
  // column 7 is the only free space: the 2nd vertical I4 completes 8 rows, which frees room for the 3x3
  assert.strictEqual(L.setPlaceable(fromRows(['XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.']), [P('i4-r1').id, P('i4-r1').id, P('sq3').id], 4000), true);
  assert.strictEqual(L.setPlaceable(fromRows(['XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.']), [P('sq3').id], 4000), false);
});
t('simulated games: every deal fair and game over always detected', () => {
  let deals = 0, unfair = 0;
  for (let g = 0; g < 60; g++) {
    const rng = L.makeRng(1000 + g); let board = L.emptyBoard(), score = 0, st = {}, tray = [];
    for (let move = 0; move < 400; move++) {
      if (tray.every(x => x == null)) { const d = L.dealTray(board, rng, score); deals++; if (d.fair !== 'all') unfair++; tray = d.tray.slice(); }
      if (L.isGameOver(board, tray)) break;
      let done = false;
      for (let k = 0; k < 3 && !done; k++) {
        if (tray[k] == null) continue; const pos = L.positions(board, L.PIECES[tray[k]]); if (!pos.length) continue;
        const [r, c] = pos[Math.floor(rng.next() * pos.length)]; const res = L.place(board, L.PIECES[tray[k]], r, c, 1);
        const sc = L.scoreMove(st, res.placed.length, res.rows.length + res.cols.length, L.isEmpty(res.board)); st = sc; score += sc.points;
        board = res.board; tray[k] = null; done = true;
      }
      assert.ok(done, 'a move must exist when not game over');
    }
  }
  assert.ok(deals > 100); assert.ok(unfair / deals < 0.02, `unfair ${unfair}/${deals}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
