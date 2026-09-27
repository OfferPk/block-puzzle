// Captures raw 1080x1920 screenshots from the real game (360x640 CSS px @3x) for the store kit.
// Usage: PUPPETEER=puppeteer-core node store/capture_screens.js <url> <outdir>
const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
const URL = (process.argv[2] || 'http://localhost:8778/').replace(/\/?$/, '/');
const OUT = process.argv[3] || 'store/raw';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEY = 'gridstone.save.v1';

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.emulate({ viewport: { width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile' });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const ids = {};
  async function load(save, play = true) {
    await page.goto(URL + 'privacy.html', { waitUntil: 'networkidle0' });
    await page.evaluate((k, s) => localStorage.setItem(k, JSON.stringify(s)), KEY, save);
    await page.goto(URL, { waitUntil: 'networkidle0' }); await sleep(300);
    if (!ids.dot) Object.assign(ids, await page.evaluate(() => { const o = {}; window.__bp.logic.PIECES.forEach(p => o[p.name] = p.id); return o; }));
    if (play) { await page.tap('#btn-play'); await sleep(600); }
  }
  const base = (theme, game, extra) => Object.assign({ best: 4860, coins: 1260, owned: ['jewel', 'walnut', 'jade', 'obsidian', 'marble'], theme, settings: { sound: false, haptics: false }, ad: {}, game }, extra || {});
  // board from strings; digits = color index
  const B = rows => { const b = new Array(64).fill(0); rows.forEach((s, r) => [...s].forEach((ch, c) => { if (ch !== '.') b[r * 8 + c] = +ch; })); return b; };
  const G = (board, tray, score, extra) => Object.assign({ board, tray, colors: [2, 5, 3], score, streak: 0, sinceClear: 0, moves: 40, reviveUsed: false, rerollUsed: false, over: false, awarded: 0, newBest: false, rng: 777 }, extra || {});
  async function hold(i, r, c) { // start a touch drag and keep it hovering over (r,c)
    const from = await page.evaluate(i => { const q = document.querySelector(`.slot[data-slot="${i}"] .piece`).getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, i);
    const to = await page.evaluate((i, r, c) => window.__bp.dropPointFor(i, r, c, 'touch'), i, r, c);
    await page.touchscreen.touchStart(from.x, from.y);
    for (let k = 1; k <= 10; k++) { await page.touchscreen.touchMove(from.x + (to.x - from.x) * k / 10, from.y + (to.y - from.y) * k / 10); await sleep(16); }
    await sleep(250);
  }
  const shot = async n => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };

  await load(base('jewel', null), false); // placeholder to learn piece ids

  // 1 gameplay with drop preview (jewel), then the clear animation right after the drop
  await load(base('jewel', G(B(['1.....42', '15..3.42', '155.3...', '.6......', '.6...77.', '22.1177.', '2233.14.', '223...44']), [ids['tri'], ids['l4'], ids['sq2']], 2140, { streak: 2 })));
  await hold(0, 7, 3); await shot('1-preview'); await page.touchscreen.touchEnd(); await sleep(150); await shot('2-clear');
  await sleep(800);

  // 3 combo: row + column cross clear on walnut
  const bw = B(['4444.444', '....3...', '.5..3..6', '.5..1..6', '....1...', '.22.1.7.', '.22.2.7.', '....2...']);
  await load(base('walnut', G(bw, [ids['dot'], ids['cor'], ids['i4-r1']], 3380, { streak: 3 })));
  await hold(0, 0, 4); await shot('3-walnut-preview'); await page.touchscreen.touchEnd(); await sleep(140); await shot('3b-walnut-clear'); await sleep(900);

  // 4 jade mid game
  await load(base('jade', G(B(['..1122..', '..1122..', '3......6', '3.4444.6', '3......6', '..5..7..', '.555.77.', '........']), [ids['t4'], ids['bigl'], ids['duo']], 1520)));
  await shot('4-jade');
  // 5 obsidian
  await load(base('obsidian', G(B(['22....11', '2......1', '..333...', '..3.7...', '...77...', '6......4', '66..5.44', '6..555.4']), [ids['sq3'], ids['s4'], ids['j4-r1']], 2890)));
  await shot('5-obsidian');
  // 6 marble
  await load(base('marble', G(B(['........', '.11..22.', '.1....2.', '...33...', '...33...', '.4....5.', '.44..55.', '........']), [ids['i5'], ids['cor-r2'], ids['rc6']], 980)));
  await shot('6-marble');
  // 7 shop
  await load(base('jewel', null, { coins: 820, owned: ['jewel', 'walnut'] }), false);
  await page.tap('#btn-shop'); await sleep(600); await shot('7-shop');
  // 8 home
  await load(base('jewel', null), false); await shot('8-home');
  // 9 new best game over
  const hb = new Array(64).fill(0).map((_, i) => ((Math.floor(i / 8) + i % 8) % 4 === 0 ? 0 : 1 + ((i * 3) % 7)));
  await load(base('jewel', G(hb, [ids['dot'], ids['duo'], ids['tri-r1']], 5120), { best: 4860 }));
  const to = await page.evaluate(() => window.__bp.dropPointFor(0, 0, 0, 'touch'));
  const from = await page.evaluate(() => { const q = document.querySelector('.slot[data-slot="0"] .piece').getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
  await page.touchscreen.touchStart(from.x, from.y); for (let k = 1; k <= 8; k++) { await page.touchscreen.touchMove(from.x + (to.x - from.x) * k / 8, from.y + (to.y - from.y) * k / 8); await sleep(16); } await page.touchscreen.touchEnd();
  await sleep(1500); await shot('9-over');
  console.log('errors:', errors);
  await browser.close();
})();
