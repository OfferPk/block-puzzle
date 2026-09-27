// Headless Chrome phone-size play test for Gridstone. Drags pieces with real touch (and mouse) events and checks:
// placement, line clear + scoring, reroll, game over, revive, new game, reload persistence, no console errors.
// Usage: node test/browser.test.js <url> [outdir]   (needs puppeteer-core + Chrome at /usr/bin/google-chrome or CHROME=...)
const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
const URL = (process.argv[2] || 'http://localhost:8778/').replace(/\/?$/, '/');
const OUT = process.argv[3] || '/tmp';
const KEY = 'gridstone.save.v1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ok -', m); };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.emulate({ viewport: { width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Mobile Safari/537.36' });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

  const game = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__bp.game)));
  const idle = () => page.waitForFunction(() => !window.__bp.busy, { timeout: 8000 });
  async function slotCenter(i) {
    return page.evaluate(i => { const r = document.querySelector(`.slot[data-slot="${i}"] .piece`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, i);
  }
  async function dragTouch(i, r, c) {
    const from = await slotCenter(i);
    const to = await page.evaluate((i, r, c) => window.__bp.dropPointFor(i, r, c, 'touch'), i, r, c);
    await page.touchscreen.touchStart(from.x, from.y);
    for (let k = 1; k <= 8; k++) { await page.touchscreen.touchMove(from.x + (to.x - from.x) * k / 8, from.y + (to.y - from.y) * k / 8); await sleep(16); }
    await page.touchscreen.touchEnd();
    await sleep(120); await idle();
  }
  async function dragMouse(i, r, c) {
    const from = await slotCenter(i);
    const to = await page.evaluate((i, r, c) => window.__bp.dropPointFor(i, r, c, 'mouse'), i, r, c);
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up();
    await sleep(120); await idle();
  }
  async function inject(gameState, extra) {
    await page.goto(URL + 'privacy.html', { waitUntil: 'networkidle0' });
    await page.evaluate((k, g, extra) => {
      const s = Object.assign({ best: 0, coins: 0, owned: ['jewel'], theme: 'jewel', settings: { sound: false, haptics: true }, ad: {}, game: g }, extra || {});
      localStorage.setItem(k, JSON.stringify(s));
    }, KEY, gameState, extra);
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await sleep(200);
    await page.tap('#btn-play'); await sleep(500);
  }
  const id = name => page.evaluate(n => window.__bp.logic.pieceByName(n).id, name);
  const baseGame = (board, tray) => ({ board, tray, colors: [1, 4, 5], score: 0, streak: 0, sinceClear: 0, moves: 1, reviveUsed: false, rerollUsed: false, over: false, awarded: 0, newBest: false, rng: 12345 });

  console.log('Testing', URL);
  // ---- fresh start ----
  await page.goto(URL + 'privacy.html', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL, { waitUntil: 'networkidle0' }); await sleep(300);
  assert(await page.$eval('#home', e => !e.classList.contains('hidden')), 'home screen on launch');
  await page.screenshot({ path: `${OUT}/bp-home.png` });
  await page.tap('#btn-play'); await sleep(500);
  assert(await page.$eval('#game', e => !e.classList.contains('hidden')), 'game screen opens');

  // ---- place the 3 tray pieces by touch drag (last one with the mouse) ----
  let g = await game();
  assert(g.tray.filter(x => x != null).length === 3, 'tray has 3 pieces');
  for (let i = 0; i < 3; i++) {
    const before = await game();
    const pos = await page.evaluate(i => { const g = window.__bp.game, L = window.__bp.logic; return L.positions(g.board, L.PIECES[g.tray[i]]).pop(); }, i);
    if (i < 2) await dragTouch(i, pos[0], pos[1]); else await dragMouse(i, pos[0], pos[1]);
    const after = await game();
    assert(after.moves === before.moves + 1 && after.score > before.score, `piece ${i + 1} placed by ${i < 2 ? 'touch' : 'mouse'} drag at (${pos}) → score ${after.score}`);
  }
  g = await game();
  assert(g.tray.filter(x => x != null).length === 3, 'a new tray of 3 was dealt after the tray emptied');
  await page.screenshot({ path: `${OUT}/bp-playing.png` });

  // ---- invalid drop returns the piece ----
  {
    const before = await game();
    const from = await slotCenter(0);
    await page.touchscreen.touchStart(from.x, from.y); await page.touchscreen.touchMove(from.x, from.y - 5); await page.touchscreen.touchEnd();
    await sleep(300); await idle();
    const after = await game();
    assert(after.moves === before.moves && after.tray[0] === before.tray[0], 'dropping outside the grid returns the piece to the tray');
  }

  // ---- reroll (rewarded; granted immediately on web) ----
  {
    const before = await game();
    await page.tap('#btn-reroll'); await sleep(500);
    const after = await game();
    assert(after.rerollUsed && after.tray.filter(x => x != null).length === 3 && JSON.stringify(after.tray) !== JSON.stringify(before.tray), 'reroll dealt a new tray of 3');
    assert(await page.$eval('#btn-reroll', e => e.disabled), 'reroll disabled until the next tray');
  }

  // ---- reload persistence ----
  {
    const before = await game();
    await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
    const label = await page.$eval('#play-label', e => e.textContent);
    assert(label === 'CONTINUE', 'home offers CONTINUE after reload');
    await page.tap('#btn-play'); await sleep(400);
    const after = await game();
    assert(JSON.stringify(after.board) === JSON.stringify(before.board) && after.score === before.score && JSON.stringify(after.tray) === JSON.stringify(before.tray),
      'board, score and tray restored after reload (score ' + after.score + ')');
  }

  // ---- clear a line ----
  {
    const board = new Array(64).fill(0);
    for (let c = 0; c < 5; c++) board[7 * 8 + c] = 2;
    board[0] = 5; // keep one block so this is not a board clear
    await inject(baseGame(board, [await id('tri'), await id('dot'), await id('duo')]));
    const pts = (await game()).score;
    await dragTouch(0, 7, 5);
    const g2 = await game();
    const row7 = g2.board.slice(56, 64).every(v => v === 0);
    assert(row7, 'completing row 8 cleared it');
    assert(g2.score - pts === 3 + 20, 'line clear scored 3 (cells) + 20 (1 line) = ' + (g2.score - pts));
    await page.screenshot({ path: `${OUT}/bp-cleared.png` });
  }

  // ---- combo: clear a row and a column at once ----
  {
    const board = new Array(64).fill(0);
    for (let c = 1; c < 8; c++) board[c] = 3;          // row 0 except (0,0)
    for (let r = 1; r < 8; r++) board[r * 8] = 6;      // col 0 except (0,0)
    await inject(baseGame(board, [await id('dot'), await id('duo'), await id('tri')]));
    await dragTouch(0, 0, 0);
    const g3 = await game();
    assert(g3.board.every(v => v === 0) && g3.score === 1 + 80 + 300, 'row+column combo scored 1 + 80 + 300 board-clear bonus = ' + g3.score);
  }

  // ---- game over, revive, new game ----
  {
    const board = new Array(64).fill(0).map((_, i) => ((Math.floor(i / 8) + i % 8) % 4 === 0 ? 0 : 1 + (i % 7)));
    await inject(baseGame(board, [await id('dot'), await id('duo'), await id('tri-r1')]), { best: 5000 });
    await dragTouch(0, 0, 0);
    await sleep(900);
    const over = await page.$eval('#over', e => !e.classList.contains('hidden'));
    const g4 = await game();
    assert(over && g4.over, 'game over detected when no piece fits, overlay shown');
    await page.screenshot({ path: `${OUT}/bp-over.png` });
    assert(await page.$eval('#btn-revive', e => !e.classList.contains('hidden')), 'revive offered (once per game)');
    await page.tap('#btn-revive'); await sleep(600);
    const g5 = await game();
    const center = [2, 3, 4, 5].every(r => [2, 3, 4, 5].every(c => g5.board[r * 8 + c] === 0));
    assert(!g5.over && g5.reviveUsed && await page.$eval('#over', e => e.classList.contains('hidden')), 'revive dealt pieces and resumed play');
    const fits = await page.evaluate(() => !window.__bp.logic.isGameOver(window.__bp.game.board, window.__bp.game.tray));
    assert(center && fits, 'revive cleared the 4x4 center and a piece fits');
  }
  {
    // second game over in the same game: no second revive; New game starts fresh and counts a completed game
    const board = new Array(64).fill(0).map((_, i) => ((Math.floor(i / 8) + i % 8) % 4 === 0 ? 0 : 1 + (i % 7)));
    const st = baseGame(board, [await id('dot'), await id('duo'), await id('tri-r1')]); st.reviveUsed = true; st.score = 250;
    await inject(st, { ad: { gamesSince: 0, gamesCompleted: 0, lastTs: 0, playMs: 0 } });
    await dragTouch(0, 0, 0); await sleep(900);
    assert((await game()).over && await page.$eval('#btn-revive', e => e.classList.contains('hidden')), 'revive not offered twice in one game');
    const coins = await page.evaluate(() => window.__bp.save.coins);
    assert(coins === 5, 'cosmetic coins banked on game over (251 pts → 5)');
    await page.tap('#btn-newgame'); await sleep(700);
    const g7 = await game();
    const after = await page.evaluate(() => window.__bp.gate.state.gamesCompleted);
    assert(g7.score === 0 && g7.moves === 0 && !g7.over && g7.board.every(v => v === 0) && after === 1, 'New game started fresh, completed-games counter = 1');
    assert(await page.$eval('#over', e => e.classList.contains('hidden')), 'game-over overlay closed');
    const canShow = await page.evaluate(() => window.__bp.gate.canShow(Date.now()));
    assert(canShow === false, 'ad gate blocks interstitials before 5 games / 3 minutes');
  }

  await sleep(300);
  assert(errors.length === 0, 'no console errors / failed requests' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log('BROWSER TEST PASSED');
})().catch(e => { console.error('BROWSER TEST FAILED:', e.message); process.exit(1); });
