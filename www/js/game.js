/* Gridstone - UI, drag & drop, animation, persistence. Rules live in logic.js. */
(function () {
  'use strict';
  var L = window.BPLogic, SFX = window.SFX, THEMES = window.THEMES;
  var $ = function (id) { return document.getElementById(id); };
  var SAVE_KEY = 'gridstone.save.v1';
  var N = L.N;
  var native = window.Ads && window.Ads.isNative();
  document.body.classList.add(native ? 'native' : 'web');

  // ---------------- persistence ----------------
  function defaults() {
    return { best: 0, coins: 0, owned: ['jewel'], theme: 'jewel', settings: { sound: true, haptics: true }, game: null, ad: {} };
  }
  function load() {
    var d = defaults();
    try {
      var s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s && typeof s === 'object') {
        Object.keys(d).forEach(function (k) { if (s[k] !== undefined) d[k] = s[k]; });
        d.settings = Object.assign(defaults().settings, s.settings || {});
      }
    } catch (e) {}
    return d;
  }
  var save = load();
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
  var gate = window.AdGate.create(window.ADS_CONFIG, save.ad);
  save.ad = gate.state;

  // ---------------- game state ----------------
  var G = null;      // save.game (the running game)
  var rng = null;
  var busy = false;
  var cells = [];
  var drag = null;
  var CS = 40, GAP = 3;

  function validGame(g) {
    return g && Array.isArray(g.board) && g.board.length === N * N && Array.isArray(g.tray) && g.tray.length === 3;
  }
  function newSeed() { return ((Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0; }
  function deal(g) {
    var d = L.dealTray(g.board, rng, g.score);
    g.tray = d.tray.slice();
    g.colors = d.tray.map(function () { return 1 + Math.floor(rng.next() * L.COLORS); });
    g.rerollUsed = false;
    g.rng = rng.s;
  }
  function freshGame() {
    rng = L.makeRng(newSeed());
    var g = { board: L.emptyBoard(), tray: [null, null, null], colors: [1, 1, 1], score: 0, streak: 0, sinceClear: 0, moves: 0,
      reviveUsed: false, rerollUsed: false, over: false, awarded: 0, newBest: false, rng: 0 };
    deal(g);
    return g;
  }

  // ---------------- helpers ----------------
  function haptic(kind) {
    if (!save.settings.haptics || !native) return;
    var H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (!H) return;
    try {
      if (kind === 'success') H.notification({ type: 'SUCCESS' });
      else if (kind === 'error') H.notification({ type: 'WARNING' });
      else H.impact({ style: kind === 'medium' ? 'MEDIUM' : kind === 'heavy' ? 'HEAVY' : 'LIGHT' });
    } catch (e) {}
  }
  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.add('hidden'); }, ms || 2200);
  }
  function setCoins() { Array.prototype.forEach.call(document.querySelectorAll('.coins-val'), function (e) { e.textContent = save.coins; }); }
  function applyTheme() {
    var cl = document.body.classList;
    Array.prototype.slice.call(cl).forEach(function (c) { if (/^theme-/.test(c)) cl.remove(c); });
    cl.add('theme-' + save.theme);
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function fmt(n) { return String(n); }

  // ---------------- layout ----------------
  function layout() {
    var stage = $('stage');
    var W = stage.clientWidth - 20, H = stage.clientHeight - 12;
    var csW = (W - 11 * GAP) / 8;
    var csH = (H - 60 - 30 - 11 * GAP) / (8 + 2.9);
    CS = Math.max(24, Math.floor(Math.min(csW, csH, 54)));
    document.documentElement.style.setProperty('--cs', CS + 'px');
    document.documentElement.style.setProperty('--gap', GAP + 'px');
  }

  // ---------------- rendering ----------------
  function buildBoard() {
    var b = $('board'); b.innerHTML = ''; cells = [];
    for (var i = 0; i < N * N; i++) { var d = document.createElement('div'); d.className = 'cell'; d.dataset.i = i; b.appendChild(d); cells.push(d); }
  }
  function renderBoard() {
    for (var i = 0; i < N * N; i++) {
      var v = G.board[i];
      cells[i].className = v ? 'cell f c' + v : 'cell';
    }
  }
  function pieceEl(id, color) {
    var p = L.PIECES[id];
    var el = document.createElement('div'); el.className = 'piece';
    el.style.gridTemplateColumns = 'repeat(' + p.wd + ', var(--pcs))';
    el.style.gridTemplateRows = 'repeat(' + p.h + ', var(--pcs))';
    var map = {}; p.cells.forEach(function (q) { map[q[0] + ':' + q[1]] = 1; });
    for (var r = 0; r < p.h; r++) for (var c = 0; c < p.wd; c++) {
      var d = document.createElement('div');
      d.className = map[r + ':' + c] ? 'cell f c' + color : 'cell empty';
      el.appendChild(d);
    }
    return el;
  }
  function renderTray(animate) {
    for (var i = 0; i < 3; i++) {
      var slot = document.querySelector('.slot[data-slot="' + i + '"]');
      slot.innerHTML = ''; slot.classList.remove('dragging', 'nofit');
      var id = G.tray[i];
      if (id == null) continue;
      var el = pieceEl(id, G.colors[i]);
      if (animate) { el.classList.add('enter'); el.style.animationDelay = (i * 70) + 'ms'; }
      slot.appendChild(el);
      if (!L.fitsAnywhere(G.board, L.PIECES[id])) slot.classList.add('nofit');
    }
    $('btn-reroll').disabled = G.rerollUsed || G.over;
  }
  function renderScore() {
    $('score').textContent = fmt(G.score);
    $('best').textContent = fmt(Math.max(save.best, G.score));
    $('streak').innerHTML = G.streak >= 2 ? 'STREAK ×' + G.streak : '&nbsp;';
  }
  function renderAll(animateTray) { renderBoard(); renderTray(animateTray); renderScore(); }

  // ---------------- drag & drop ----------------
  function pieceSize(p) { return { w: p.wd * CS + (p.wd - 1) * GAP, h: p.h * CS + (p.h - 1) * GAP }; }
  function liftFor(type, p) { return type === 'mouse' ? -pieceSize(p).h / 2 : CS * 0.9; }
  function boardOrigin() { var r = $('board').getBoundingClientRect(); return { x: r.left, y: r.top }; }
  // top-left of the dragged piece for a pointer position
  function dragTopLeft(px, py, p, type) { var s = pieceSize(p); return { x: px - s.w / 2, y: py - s.h - liftFor(type, p) }; }
  /** Client point where a drag must be released so the piece in tray slot i lands at (r, c). Used by tests. */
  function dropPointFor(i, r, c, type) {
    var p = L.PIECES[G.tray[i]], s = pieceSize(p), o = boardOrigin();
    var x = o.x + c * (CS + GAP), y = o.y + r * (CS + GAP);
    return { x: x + s.w / 2, y: y + s.h + liftFor(type || 'touch', p) };
  }
  function targetFor(tl, p) {
    var o = boardOrigin(), step = CS + GAP;
    var fc = (tl.x - o.x) / step, fr = (tl.y - o.y) / step;
    var best = null, bd = 0.8;
    [Math.round(fr), Math.floor(fr), Math.ceil(fr)].forEach(function (r) {
      [Math.round(fc), Math.floor(fc), Math.ceil(fc)].forEach(function (c) {
        if (!L.canPlace(G.board, p, r, c)) return;
        var d = Math.hypot(r - fr, c - fc);
        if (d < bd) { bd = d; best = { r: r, c: c }; }
      });
    });
    return best;
  }
  function clearPreview() {
    for (var i = 0; i < cells.length; i++) cells[i].classList.remove('ghost', 'will-clear', 'lane-glow', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7');
    renderBoard();
  }
  function showPreview(p, t, color) {
    clearPreview();
    if (!t) return;
    p.cells.forEach(function (q) { var el = cells[(t.r + q[0]) * N + t.c + q[1]]; el.classList.add('ghost', 'c' + color); });
    var lines = L.previewClears(G.board, p, t.r, t.c);
    if (!lines) return;
    lines.rows.forEach(function (r) { for (var c = 0; c < N; c++) mark(r * N + c); });
    lines.cols.forEach(function (c) { for (var r = 0; r < N; r++) mark(r * N + c); });
    function mark(i) { var el = cells[i]; el.classList.add(el.classList.contains('f') ? 'will-clear' : 'lane-glow'); }
  }
  function onDown(e) {
    var slot = e.currentTarget, i = +slot.dataset.slot;
    if (busy || drag || G.over || G.tray[i] == null) return;
    e.preventDefault();
    SFX.unlock(); SFX.pick(); haptic('light');
    var p = L.PIECES[G.tray[i]];
    var el = document.createElement('div'); el.id = 'drag';
    el.appendChild(pieceEl(G.tray[i], G.colors[i]));
    document.body.appendChild(el);
    try { slot.setPointerCapture(e.pointerId); } catch (x) {}
    slot.classList.add('dragging');
    drag = { i: i, p: p, el: el, slot: slot, type: e.pointerType || 'mouse', id: e.pointerId, target: null };
    onMove(e);
  }
  function onMove(e) {
    if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
    e.preventDefault();
    var tl = dragTopLeft(e.clientX, e.clientY, drag.p, drag.type);
    drag.el.style.transform = 'translate(' + tl.x + 'px,' + tl.y + 'px)';
    var t = targetFor(tl, drag.p);
    if (!t || !drag.target || t.r !== drag.target.r || t.c !== drag.target.c) { drag.target = t; showPreview(drag.p, t, G.colors[drag.i]); }
  }
  function onUp(e) {
    if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
    e.preventDefault();
    var d = drag; drag = null;
    try { d.slot.releasePointerCapture(d.id); } catch (x) {}
    clearPreview();
    if (d.target && e.type !== 'pointercancel') { commit(d); return; }
    // fly back to the tray
    SFX.cancel();
    var sr = d.slot.getBoundingClientRect(), s = pieceSize(d.p);
    var back = d.el.animate([{ transform: d.el.style.transform }, { transform: 'translate(' + (sr.left + sr.width / 2 - s.w / 2) + 'px,' + (sr.top + sr.height / 2 - s.h / 2) + 'px) scale(.55)' }],
      { duration: 160, easing: 'ease-in' });
    back.finished.then(function () { d.el.remove(); d.slot.classList.remove('dragging'); }, function () { d.el.remove(); d.slot.classList.remove('dragging'); });
  }

  // ---------------- moves ----------------
  async function commit(d) {
    busy = true;
    var i = d.i, p = d.p, t = d.target, color = G.colors[i];
    var o = boardOrigin();
    var snap = d.el.animate([{ transform: d.el.style.transform }, { transform: 'translate(' + (o.x + t.c * (CS + GAP)) + 'px,' + (o.y + t.r * (CS + GAP)) + 'px)' }], { duration: 70, easing: 'ease-out' });
    await snap.finished.catch(function () {});
    d.el.remove(); d.slot.classList.remove('dragging');
    var res = L.place(G.board, p, t.r, t.c, color);
    var lines = res.rows.length + res.cols.length;
    var sc = L.scoreMove(G, p.size, lines, L.isEmpty(res.board));
    // show placed blocks first (before clearing)
    var pre = G.board.slice(); res.placed.forEach(function (k) { pre[k] = color; });
    G.board = pre; renderBoard();
    res.placed.forEach(function (k) { cells[k].classList.add('pop'); });
    SFX.place(p.size); haptic('light');
    G.tray[i] = null;
    G.score += sc.points; G.streak = sc.streak; G.sinceClear = sc.sinceClear; G.moves++;
    if (lines) {
      await wait(90);
      clearFx(res, pre, t, p, sc);
      G.board = res.board; renderBoard();
      SFX.clear(lines, sc.streak); haptic(lines >= 2 ? 'heavy' : 'medium');
    } else {
      G.board = res.board;
    }
    if (G.score > save.best) { if (!G.newBest && save.best > 0) toast('New best score!'); save.best = G.score; G.newBest = true; }
    var dealt = false;
    if (G.tray.every(function (x) { return x == null; })) { deal(G); dealt = true; }
    G.rng = rng.s;
    renderTray(dealt); renderScore();
    if (dealt) SFX.deal();
    persist();
    setTimeout(function () { res.placed.forEach(function (k) { cells[k].classList.remove('pop'); }); }, 260);
    busy = false;
    if (L.isGameOver(G.board, G.tray)) { busy = true; await wait(550); busy = false; gameOver(); }
  }

  function clearFx(res, pre, t, p, sc) {
    var fx = $('fx'), ar = $('app').getBoundingClientRect(), o = boardOrigin(), step = CS + GAP;
    var cr = t.r + p.h / 2, cc = t.c + p.wd / 2;
    res.cleared.forEach(function (k) {
      var r = Math.floor(k / N), c = k % N;
      var s = document.createElement('div'); s.className = 'shard c' + pre[k];
      s.style.width = s.style.height = CS + 'px';
      s.style.left = (o.x - ar.left + c * step) + 'px'; s.style.top = (o.y - ar.top + r * step) + 'px';
      fx.appendChild(s);
      var dist = Math.hypot(r - cr, c - cc);
      var dx = (c - cc) * 6, dy = (r - cr) * 6 - 10;
      s.animate([{ transform: 'scale(1)', opacity: 1, filter: 'brightness(1)' },
                 { transform: 'scale(1.12)', opacity: 1, filter: 'brightness(2)', offset: .35 },
                 { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.2) rotate(35deg)', opacity: 0, filter: 'brightness(2.5)' }],
        { duration: 420, delay: dist * 28, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'backwards' }).finished.then(function () { s.remove(); }, function () { s.remove(); });
      if (Math.random() < 0.45) spark(o.x - ar.left + c * step + CS / 2, o.y - ar.top + r * step + CS / 2, dist * 28);
    });
    // score popup
    var px = o.x - ar.left + cc * step, py = o.y - ar.top + cr * step;
    var pop = document.createElement('div'); pop.className = 'popup';
    var label = sc.boardClear ? 'BOARD CLEAR' : sc.combo >= 2 ? 'COMBO ×' + sc.combo : sc.streak >= 2 ? 'STREAK ×' + sc.streak : '';
    pop.innerHTML = '+' + sc.points + (label ? '<small>' + label + '</small>' : '');
    pop.style.left = px + 'px'; pop.style.top = py + 'px'; pop.style.fontSize = Math.min(44, 24 + sc.combo * 5) + 'px';
    fx.appendChild(pop);
    pop.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-80%) scale(1.1)', opacity: 1, offset: .25 },
                 { transform: 'translate(-50%,-160%) scale(1)', opacity: 0 }], { duration: 1100, easing: 'ease-out' }).finished.then(function () { pop.remove(); });
  }
  function spark(x, y, delay) {
    var fx = $('fx');
    for (var k = 0; k < 3; k++) {
      var s = document.createElement('div'); s.className = 'spark'; s.style.left = x + 'px'; s.style.top = y + 'px'; fx.appendChild(s);
      var a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 40;
      s.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: 'translate(' + Math.cos(a) * d + 'px,' + Math.sin(a) * d + 'px) scale(.2)', opacity: 0 }],
        { duration: 500 + Math.random() * 300, delay: delay, easing: 'ease-out', fill: 'backwards' }).finished.then(function (x) { return function () { x.remove(); }; }(s));
    }
  }

  // ---------------- game over / revive / reroll ----------------
  function bankCoins() {
    var due = L.coinsForScore(G.score) - (G.awarded || 0);
    if (due > 0) { save.coins += due; G.awarded = (G.awarded || 0) + due; setCoins(); }
    return due;
  }
  function gameOver() {
    G.over = true;
    var due = bankCoins();
    persist();
    if (G.newBest) SFX.best(); else SFX.over();
    haptic('error');
    showOver(due);
  }
  function showOver(due) {
    $('over-score').textContent = G.score;
    $('over-best').textContent = save.best;
    $('over-coins').textContent = '+' + (due != null ? due : G.awarded || 0);
    $('over-title').textContent = G.newBest ? 'NEW BEST' : 'GAME OVER';
    $('btn-revive').classList.toggle('hidden', !!G.reviveUsed);
    $('over').classList.remove('hidden');
    renderTray(false);
  }
  function revive() {
    if (!G.over || G.reviveUsed) return;
    SFX.click();
    window.Ads.showRewarded(function () {
      G.reviveUsed = true; G.over = false;
      G.board = L.reviveBoard(G.board);
      deal(G);
      $('over').classList.add('hidden');
      renderAll(true); persist();
      SFX.clear(2, 1); haptic('medium');
      toast('Revived: center cleared and new pieces dealt');
    }, function () { toast('No ad available right now. Try again in a moment.'); });
  }
  function reroll() {
    if (busy || drag || G.over) return;
    if (G.rerollUsed) { toast('One reroll per set of pieces'); return; }
    SFX.click();
    window.Ads.showRewarded(function () {
      deal(G); G.rerollUsed = true; G.rng = rng.s;
      renderTray(true); persist(); SFX.deal();
      if (L.isGameOver(G.board, G.tray)) gameOver();
    }, function () { toast('No ad available right now. Try again in a moment.'); });
  }
  async function newGameTransition(fromGameOver) {
    if (busy) return;
    busy = true;
    SFX.click();
    $('over').classList.add('hidden'); $('confirm').classList.add('hidden');
    if (fromGameOver) gate.gameCompleted(); else bankCoins();
    persist();
    // the ONLY place an interstitial may appear: game over -> new game, or restart
    try { await window.Ads.maybeInterstitial(gate); } catch (e) {}
    G = save.game = freshGame();
    persist();
    renderAll(true);
    busy = false;
  }

  // ---------------- screens ----------------
  function updateHome() {
    $('home-best').textContent = save.best;
    var inProgress = G && !G.over && G.moves > 0;
    $('play-label').textContent = inProgress ? 'CONTINUE' : 'PLAY';
    $('play-sub').textContent = inProgress ? 'Score ' + G.score : 'New game';
  }
  function showHome() {
    $('game').classList.add('hidden'); $('home').classList.remove('hidden');
    updateHome();
    window.Ads.hideBanner();
  }
  function showGame() {
    $('home').classList.add('hidden'); $('game').classList.remove('hidden');
    layout(); renderAll(true);
    if (G.over) showOver(null);
    window.Ads.showBanner().then(function () { setTimeout(layout, 60); });
    if (native && gate.state.gamesCompleted >= gate.config.INTERSTITIAL_MIN_GAMES - 1) window.Ads.prepareInterstitial();
  }

  // ---------------- shop ----------------
  function renderShop() {
    setCoins();
    var grid = $('shop-grid'); grid.innerHTML = '';
    THEMES.forEach(function (th) {
      var owned = save.owned.indexOf(th.id) >= 0, sel = save.theme === th.id;
      var d = document.createElement('div'); d.className = 'item theme-' + th.id + (sel ? ' selected' : '');
      var prev = document.createElement('div'); prev.className = 'prev';
      var mini = document.createElement('div'); mini.className = 'mini';
      [1, 1, 0, 5, 3, 0, 5, 5, 6, 0, 2, 4, 7, 7, 2, 4].forEach(function (v) { var c = document.createElement('div'); c.className = v ? 'cell f c' + v : 'cell'; mini.appendChild(c); });
      prev.appendChild(mini); d.appendChild(prev);
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = th.name; d.appendChild(nm);
      var b = document.createElement('button'); b.className = 'buy';
      if (sel) b.textContent = 'Equipped';
      else if (owned) { b.textContent = 'Equip'; b.classList.add('can'); }
      else { b.innerHTML = '<span class="coin-ico"></span>' + th.price; if (save.coins >= th.price) b.classList.add('can'); }
      b.addEventListener('click', function () {
        if (sel) return;
        if (!owned) {
          if (save.coins < th.price) { SFX.error(); toast('Score ' + ((th.price - save.coins) * 50) + ' more points to unlock'); return; }
          save.coins -= th.price; save.owned.push(th.id); SFX.coin();
        } else SFX.click();
        save.theme = th.id; persist(); applyTheme(); renderShop();
      });
      d.appendChild(b);
      grid.appendChild(d);
    });
  }
  function syncSettingsUI() {
    $('set-sound').checked = !!save.settings.sound;
    $('set-haptics').checked = !!save.settings.haptics;
    $('btn-privacy-options').classList.toggle('hidden', !(native && window.Ads.privacyOptionsRequired()));
  }

  // ---------------- wiring ----------------
  Array.prototype.forEach.call(document.querySelectorAll('.slot'), function (s) {
    s.addEventListener('pointerdown', onDown);
    s.addEventListener('pointermove', onMove);
    s.addEventListener('pointerup', onUp);
    s.addEventListener('pointercancel', onUp);
    s.addEventListener('lostpointercapture', function (e) { if (drag && drag.id === e.pointerId) onUp(e); });
  });
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  $('btn-play').addEventListener('click', function () { SFX.unlock(); SFX.click(); showGame(); });
  $('btn-home').addEventListener('click', function () { SFX.click(); showHome(); });
  $('btn-restart').addEventListener('click', function () {
    if (busy) return;
    SFX.click();
    if (G.over) { newGameTransition(true); return; }
    if (G.moves === 0) return;
    $('confirm').classList.remove('hidden');
  });
  $('confirm-no').addEventListener('click', function () { SFX.click(); $('confirm').classList.add('hidden'); });
  $('confirm-yes').addEventListener('click', function () { newGameTransition(false); });
  $('btn-newgame').addEventListener('click', function () { newGameTransition(true); });
  $('btn-revive').addEventListener('click', revive);
  $('btn-reroll').addEventListener('click', reroll);
  $('btn-shop').addEventListener('click', function () { SFX.unlock(); SFX.click(); renderShop(); $('shop').classList.remove('hidden'); });
  $('btn-settings-home').addEventListener('click', function () { SFX.unlock(); SFX.click(); syncSettingsUI(); $('settings').classList.remove('hidden'); });
  function syncMenuCard() {
    var b = $('btn-play');
    if (!b) return;
    document.documentElement.style.setProperty('--menu-w', b.offsetWidth + 'px');
    document.documentElement.style.setProperty('--menu-h', b.offsetHeight + 'px');
  }
  $('btn-howto').addEventListener('click', function () { SFX.unlock(); SFX.click(); syncMenuCard(); $('howto').classList.remove('hidden'); });
  window.addEventListener('resize', syncMenuCard);
  syncMenuCard();
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) {
    b.addEventListener('click', function () { SFX.click(); $(b.dataset.close).classList.add('hidden'); });
  });
  $('set-sound').addEventListener('change', function (e) { save.settings.sound = e.target.checked; SFX.setEnabled(save.settings.sound); persist(); SFX.click(); });
  $('set-haptics').addEventListener('change', function (e) { save.settings.haptics = e.target.checked; persist(); haptic('light'); });
  $('btn-privacy-options').addEventListener('click', function () { window.Ads.showPrivacyOptions(); });
  $('btn-reset').addEventListener('click', function () {
    if (!confirm('Reset best score, coins, themes and the current game?')) return;
    var ad = save.ad; save = defaults(); save.ad = ad;
    G = save.game = freshGame(); persist();
    applyTheme(); setCoins(); $('settings').classList.add('hidden'); updateHome();
  });
  window.addEventListener('resize', function () { if (!$('game').classList.contains('hidden')) layout(); });

  // play-time accounting for the ad gate (only while actually playing)
  var ticks = 0;
  setInterval(function () {
    if (document.visibilityState !== 'visible' || $('game').classList.contains('hidden') || !G || G.over) return;
    gate.addPlayTime(1000);
    if (++ticks % 10 === 0) persist();
  }, 1000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') persist(); });

  // ---------------- boot ----------------
  SFX.setEnabled(save.settings.sound);
  applyTheme(); setCoins(); buildBoard();
  if (validGame(save.game)) { G = save.game; rng = L.makeRng(G.rng || newSeed()); if (!Array.isArray(G.colors)) G.colors = [1, 2, 3]; }
  else { G = save.game = freshGame(); persist(); }
  updateHome();
  // consent + SDK init only: no ad is shown on launch
  if (window.Ads) window.Ads.init().then(syncSettingsUI);

  window.__bp = {
    get game() { return G; }, get save() { return save; }, logic: L, gate: gate,
    dropPointFor: dropPointFor, get busy() { return busy; }, layout: layout
  };
})();
