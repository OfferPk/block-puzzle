/*
 * Gridstone (8x8 block puzzle) - pure game logic, no DOM.
 * Works in the browser (window.BPLogic) and in Node (module.exports).
 *
 * Board: array of 64 ints (row-major), 0 = empty, 1..7 = block color.
 * Piece: { id, cells: [[r,c],...] } normalized so min r = min c = 0.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BPLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var N = 8;
  var COLORS = 7;

  // ---------- seeded RNG with serializable state (mulberry32) ----------
  function makeRng(state) {
    var r = { s: state >>> 0 };
    r.next = function () {
      r.s = (r.s + 0x6D2B79F5) >>> 0;
      var t = r.s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return r;
  }

  // ---------- piece catalog ----------
  function parse(rows) {
    var cells = [];
    rows.forEach(function (row, r) { for (var c = 0; c < row.length; c++) if (row[c] === '#') cells.push([r, c]); });
    return cells;
  }
  function rotate(cells) { // 90 degrees clockwise, then normalize
    var out = cells.map(function (p) { return [p[1], -p[0]]; });
    return normalize(out);
  }
  function normalize(cells) {
    var mr = Infinity, mc = Infinity;
    cells.forEach(function (p) { mr = Math.min(mr, p[0]); mc = Math.min(mc, p[1]); });
    return cells.map(function (p) { return [p[0] - mr, p[1] - mc]; })
      .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  }
  function sig(cells) { return cells.map(function (p) { return p[0] + ':' + p[1]; }).join(','); }

  // base shapes: [name, rows, weight, tier] (tier 0 = small, 1 = medium, 2 = large)
  var BASE = [
    ['dot', ['#'], 2, 0],
    ['duo', ['##'], 3, 0],
    ['tri', ['###'], 3, 0],
    ['cor', ['##', '#.'], 3, 0],
    ['sq2', ['##', '##'], 4, 1],
    ['i4', ['####'], 3, 1],
    ['t4', ['###', '.#.'], 2, 1],
    ['s4', ['.##', '##.'], 2, 1],
    ['z4', ['##.', '.##'], 2, 1],
    ['l4', ['#.', '#.', '##'], 2, 1],
    ['j4', ['.#', '.#', '##'], 2, 1],
    ['i5', ['#####'], 2, 2],
    ['rc6', ['###', '###'], 2, 2],
    ['bigl', ['#..', '#..', '###'], 2, 2],
    ['sq3', ['###', '###', '###'], 1, 2]
  ];
  var PIECES = [];
  (function build() {
    BASE.forEach(function (b) {
      var cells = normalize(parse(b[1])), seen = {};
      for (var k = 0; k < 4; k++) {
        var s = sig(cells);
        if (!seen[s]) { seen[s] = 1; PIECES.push({ id: PIECES.length, name: b[0] + (k ? '-r' + k : ''), cells: cells, weight: b[2], tier: b[3], size: cells.length }); }
        cells = rotate(cells);
      }
    });
    // split each base weight across its orientations
    var counts = {};
    PIECES.forEach(function (p) { var n = p.name.split('-')[0]; counts[n] = (counts[n] || 0) + 1; });
    PIECES.forEach(function (p) { p.w = p.weight / counts[p.name.split('-')[0]]; });
    PIECES.forEach(function (p) {
      var h = 0, w = 0; p.cells.forEach(function (q) { h = Math.max(h, q[0] + 1); w = Math.max(w, q[1] + 1); });
      p.h = h; p.wd = w;
    });
  })();

  // ---------- board rules ----------
  function emptyBoard() { var b = new Array(N * N); for (var i = 0; i < N * N; i++) b[i] = 0; return b; }
  function canPlace(board, piece, r, c) {
    var cells = piece.cells;
    for (var i = 0; i < cells.length; i++) {
      var rr = r + cells[i][0], cc = c + cells[i][1];
      if (rr < 0 || cc < 0 || rr >= N || cc >= N || board[rr * N + cc]) return false;
    }
    return true;
  }
  function fitsAnywhere(board, piece) {
    for (var r = 0; r <= N - piece.h; r++) for (var c = 0; c <= N - piece.wd; c++) if (canPlace(board, piece, r, c)) return true;
    return false;
  }
  function positions(board, piece) {
    var out = [];
    for (var r = 0; r <= N - piece.h; r++) for (var c = 0; c <= N - piece.wd; c++) if (canPlace(board, piece, r, c)) out.push([r, c]);
    return out;
  }
  /** Rows/cols that are full on this board. */
  function fullLines(board) {
    var rows = [], cols = [];
    for (var r = 0; r < N; r++) { var f = true; for (var c = 0; c < N; c++) if (!board[r * N + c]) { f = false; break; } if (f) rows.push(r); }
    for (var c2 = 0; c2 < N; c2++) { var g = true; for (var r2 = 0; r2 < N; r2++) if (!board[r2 * N + c2]) { g = false; break; } if (g) cols.push(c2); }
    return { rows: rows, cols: cols };
  }
  /**
   * Place a piece. Returns { board, rows, cols, cleared: [cell indices], placed: [cell indices] }
   * with full rows and columns removed, or null if it doesn't fit.
   */
  function place(board, piece, r, c, color) {
    if (!canPlace(board, piece, r, c)) return null;
    var b = board.slice(), placed = [];
    piece.cells.forEach(function (p) { var i = (r + p[0]) * N + (c + p[1]); b[i] = color || 1; placed.push(i); });
    var lines = fullLines(b), clearedSet = {};
    lines.rows.forEach(function (rr) { for (var x = 0; x < N; x++) clearedSet[rr * N + x] = 1; });
    lines.cols.forEach(function (cc) { for (var y = 0; y < N; y++) clearedSet[y * N + cc] = 1; });
    var cleared = Object.keys(clearedSet).map(Number).sort(function (a, b2) { return a - b2; });
    cleared.forEach(function (i) { b[i] = 0; });
    return { board: b, rows: lines.rows, cols: lines.cols, cleared: cleared, placed: placed };
  }
  /** Preview helper: which rows/cols WOULD clear if the piece were placed there. */
  function previewClears(board, piece, r, c) {
    if (!canPlace(board, piece, r, c)) return null;
    var b = board.slice();
    piece.cells.forEach(function (p) { b[(r + p[0]) * N + (c + p[1])] = 9; });
    return fullLines(b);
  }
  function isEmpty(board) { for (var i = 0; i < board.length; i++) if (board[i]) return false; return true; }
  function filled(board) { var n = 0; for (var i = 0; i < board.length; i++) if (board[i]) n++; return n; }

  // ---------- scoring ----------
  var SCORE = { LINE: 20, STREAK_STEP: 0.5, STREAK_MAX: 3, BOARD_CLEAR: 300, STREAK_GRACE: 2 };
  /**
   * Score for one placement.
   * state: { streak, sinceClear } (mutated copy returned).
   *  - every placed cell: +1
   *  - L lines cleared at once: LINE * L * L  (combo: 1->20, 2->80, 3->180, 4->320 ...)
   *  - streak: consecutive clearing moves (a streak survives up to 2 non-clearing placements)
   *    multiplies the line points by 1 + 0.5*(streak-1), capped at x3
   *  - clearing the whole board: +300
   */
  function scoreMove(state, cellsPlaced, lines, boardEmptyAfter) {
    var st = { streak: state.streak || 0, sinceClear: state.sinceClear || 0 };
    var pts = cellsPlaced, linePts = 0, mult = 1;
    if (lines > 0) {
      st.streak += 1; st.sinceClear = 0;
      mult = Math.min(SCORE.STREAK_MAX, 1 + SCORE.STREAK_STEP * (st.streak - 1));
      linePts = Math.round(SCORE.LINE * lines * lines * mult);
      pts += linePts;
      if (boardEmptyAfter) pts += SCORE.BOARD_CLEAR;
    } else {
      st.sinceClear += 1;
      if (st.sinceClear > SCORE.STREAK_GRACE) st.streak = 0;
    }
    return { points: pts, linePoints: linePts, multiplier: mult, combo: lines, streak: st.streak, sinceClear: st.sinceClear, boardClear: lines > 0 && boardEmptyAfter };
  }

  // ---------- game over ----------
  /** True when none of the remaining tray pieces fits anywhere. tray: array of piece ids or null. */
  function isGameOver(board, tray) {
    var any = false;
    for (var i = 0; i < tray.length; i++) {
      if (tray[i] == null) continue;
      any = true;
      if (fitsAnywhere(board, PIECES[tray[i]])) return false;
    }
    return any; // an empty tray is not game over (a new tray is dealt)
  }

  // ---------- fair tray generator ----------
  function pickWeighted(rng, weightFn) {
    var total = 0, i;
    for (i = 0; i < PIECES.length; i++) total += weightFn(PIECES[i]);
    var x = rng.next() * total;
    for (i = 0; i < PIECES.length; i++) { var wi = weightFn(PIECES[i]); x -= wi; if (wi > 0 && x <= 0) return PIECES[i].id; }
    return PIECES[PIECES.length - 1].id;
  }
  /** Difficulty-aware weights: bigger pieces get likelier as the score grows; a crowded board gets mercy. */
  function weightFn(score, board) {
    var fill = filled(board) / (N * N);
    var big = Math.min(1.6, 0.7 + score / 4000);
    var mercy = fill > 0.55 ? 1.8 : fill > 0.4 ? 1.3 : 1;
    return function (p) {
      var w = p.w;
      if (p.tier === 2) w *= big / mercy;
      if (p.tier === 0) w *= mercy;
      return w;
    };
  }
  /** Can all given pieces be placed in some order (line clears included)? Bounded search. */
  function setPlaceable(board, ids, budget) {
    var nodes = { n: 0 };
    function rec(b, rest) {
      if (!rest.length) return true;
      for (var k = 0; k < rest.length; k++) {
        var p = PIECES[rest[k]];
        var others = rest.slice(0, k).concat(rest.slice(k + 1));
        for (var r = 0; r <= N - p.h; r++) for (var c = 0; c <= N - p.wd; c++) {
          if (!canPlace(b, p, r, c)) continue;
          if (++nodes.n > budget) return null;
          var res = place(b, p, r, c, 1);
          var ok = rec(res.board, others);
          if (ok === null) return null;
          if (ok) return true;
        }
      }
      return false;
    }
    return rec(board, ids);
  }
  /**
   * Deal 3 pieces. Fairness: tries to find a set that can ALL be placed (in some order);
   * falls back to a set where at least one piece fits; only if no piece in the whole
   * catalog fits is an unplaceable set possible.
   */
  function dealTray(board, rng, score, opts) {
    opts = opts || {};
    var wf = weightFn(score || 0, board);
    var attempts = opts.attempts || 24, budget = opts.budget || 4000;
    var fallback = null;
    for (var a = 0; a < attempts; a++) {
      var ids = [pickWeighted(rng, wf), pickWeighted(rng, wf), pickWeighted(rng, wf)];
      var ok = setPlaceable(board, ids, budget);
      if (ok === true) return { tray: ids, fair: 'all' };
      if (!fallback && ids.some(function (id) { return fitsAnywhere(board, PIECES[id]); })) fallback = ids;
    }
    // second pass: draw only from pieces that fit somewhere right now (tight boards)
    var fit = PIECES.filter(function (p) { return fitsAnywhere(board, p); });
    if (fit.length) {
      var fitW = function (p) { return fitsAnywhere(board, p) ? wf(p) : 0; };
      for (var a2 = 0; a2 < attempts; a2++) {
        var ids3 = [pickWeighted(rng, fitW), pickWeighted(rng, fitW), pickWeighted(rng, fitW)];
        if (setPlaceable(board, ids3, budget) === true) return { tray: ids3, fair: 'all' };
      }
      // smallest fitting pieces as a final fair attempt
      var small = fit.slice().sort(function (x, y) { return x.cells.length - y.cells.length; })[0].id;
      if (setPlaceable(board, [small, small, small], budget) === true) return { tray: [small, small, small], fair: 'all' };
    }
    if (fallback) return { tray: fallback, fair: 'some' };
    // last resort: make sure at least one fitting piece is included, if any exists
    var ids2 = [pickWeighted(rng, wf), pickWeighted(rng, wf), pickWeighted(rng, wf)];
    if (fit.length) { ids2[0] = fit[Math.floor(rng.next() * fit.length)].id; return { tray: ids2, fair: 'one' }; }
    return { tray: ids2, fair: 'none' };
  }

  /** Revive: empty the centre 4x4 block (rows/cols 2..5). */
  function reviveBoard(board) {
    var b = board.slice();
    for (var r = 2; r < 6; r++) for (var c = 2; c < 6; c++) b[r * N + c] = 0;
    return b;
  }

  function coinsForScore(score) { return Math.floor(score / 50); }

  return {
    N: N, COLORS: COLORS, PIECES: PIECES, SCORE: SCORE, makeRng: makeRng, emptyBoard: emptyBoard, canPlace: canPlace,
    fitsAnywhere: fitsAnywhere, positions: positions, fullLines: fullLines, place: place, previewClears: previewClears,
    isEmpty: isEmpty, filled: filled, scoreMove: scoreMove, isGameOver: isGameOver, dealTray: dealTray,
    setPlaceable: setPlaceable, reviveBoard: reviveBoard, coinsForScore: coinsForScore, normalize: normalize,
    pieceByName: function (n) { for (var i = 0; i < PIECES.length; i++) if (PIECES[i].name === n) return PIECES[i]; return null; }
  };
});
