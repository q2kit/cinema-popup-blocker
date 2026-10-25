// Shared helpers for the ad-cleanup scripts.
// Requires puppeteer-core on NODE_PATH (see SKILL.md).
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');

const REPO = path.resolve(__dirname, '../../../..');
const MAIN_PATH = process.env.MAIN_PATH || path.join(REPO, 'main.js');
const OUT_DIR = process.env.OUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'cpb-'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function readMain() {
  return fs.readFileSync(MAIN_PATH, 'utf8');
}

// Fresh profile every launch: ad networks cap frequency by cookie.
async function launch() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cpb-profile-')),
    args: ['--no-first-run', '--no-default-browser-check', '--window-size=1280,900'],
    defaultViewport: { width: 1280, height: 800 },
  });
}

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/.test(t)) errors.push('console: ' + t.slice(0, 160));
  });
  return errors;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function scrollThrough(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    scrollTo(0, 0);
  }).catch(() => {});
  await sleep(1500);
}

async function open(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto:', e.message));
  await sleep(7000);
  await scrollThrough(page);
}

// Real mouse click on a visible internal content link; reports whether the
// page navigated. Detects overlays that swallow clicks and broken apps.
async function testNavigation(page) {
  const before = page.url();
  const target = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href]')].filter((a) => {
      if (!a.href.startsWith(location.origin) || a.href.split('#')[0] === location.href.split('#')[0]) return false;
      if (a.closest('header, nav, footer, .swiper, .slick-slider, [class*="carousel"]')) return false;
      const r = a.getBoundingClientRect();
      return r.width > 40 && r.height > 20;
    });
    const a = links[Math.floor(links.length / 3)];
    if (!a) return null;
    a.scrollIntoView({ block: 'center' });
    const r = a.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, href: a.href };
  });
  if (!target) return { ok: false, note: 'no clickable internal link found' };
  await page.mouse.click(target.x, target.y);
  await sleep(6000);
  return { ok: page.url() !== before, clicked: target.href, now: page.url() };
}

module.exports = { REPO, MAIN_PATH, OUT_DIR, readMain, launch, watchErrors, sleep, scrollThrough, open, testNavigation };
