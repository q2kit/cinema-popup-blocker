// Usage: node compare.js <url> '<css selector>'
// Decides whether a selector can be removed with JS or must only be hidden
// with CSS. Loads the page three times with the current main.js plus:
//   none   - nothing extra (baseline)
//   hide   - CSS display:none on the selector
//   remove - JS removal of the selector (kept up with a MutationObserver)
// and prints matched count, page text length, internal link count, errors
// and navigation. If "remove" loses content, shows "Application error",
// or breaks navigation compared to "hide", the selector must be hidden only.
const path = require('path');
const { OUT_DIR, readMain, launch, watchErrors, open, testNavigation } = require('./lib');

const [url, selector] = process.argv.slice(2);
if (!url || !selector) {
  console.error("usage: node compare.js <url> '<css selector>'");
  process.exit(1);
}

function hide(s) {
  const add = () => {
    if (!document.documentElement) return requestAnimationFrame(add);
    const st = document.createElement('style');
    st.textContent = s + '{display:none!important}';
    document.documentElement.appendChild(st);
  };
  add();
}

function remove(s) {
  addEventListener('DOMContentLoaded', () => {
    const run = () => document.querySelectorAll(s).forEach((e) => e.remove());
    new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
    run();
  });
}

const call = (fn) => `(${fn})(${JSON.stringify(selector)});`;
const modes = { none: '', hide: call(hide), remove: call(remove) };

(async () => {
  const browser = await launch();
  for (const [mode, code] of Object.entries(modes)) {
    const page = await browser.newPage();
    const errors = watchErrors(page);
    await page.evaluateOnNewDocument(readMain() + '\n' + code);
    await open(page, url);
    const stats = await page.evaluate((s) => ({
      matched: document.querySelectorAll(s).length,
      textLength: document.body.innerText.length,
      internalLinks: [...document.querySelectorAll('a[href]')].filter((a) => a.href.startsWith(location.origin)).length,
      appError: /Application error|client-side exception/i.test(document.body.innerText),
    }), selector);
    const shot = path.join(OUT_DIR, `compare-${mode}.png`);
    await page.screenshot({ path: shot });
    const nav = await testNavigation(page);
    console.log(`${mode.padEnd(6)} ${JSON.stringify(stats)}\n       navigation: ${nav.ok ? 'OK' : 'FAILED'} | errors: ${errors.length ? JSON.stringify(errors.slice(0, 4)) : 'none'}\n       screenshot: ${shot}`);
    await page.close();
  }
  await browser.close();
})();
