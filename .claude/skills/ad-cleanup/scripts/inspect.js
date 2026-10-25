// Usage: node inspect.js <url> [<url>...]
// Loads each URL with the current main.js injected, then a content page
// reached by a real click, and prints:
//   - framework (Next.js / React / Vue / WordPress) -> decides hide vs remove
//   - every VISIBLE ad candidate (ads that main.js does not handle yet):
//     external links wrapping media, iframes, fixed/sticky overlays, and
//     elements whose id/class looks ad-related, each with its ancestor chain
//   - page errors and whether navigation still works
// Screenshots go to $OUT_DIR. Run with NO_MAIN=1 to see the page without
// main.js (e.g. to collect candidates that main.js already hides).
const path = require('path');
const { OUT_DIR, readMain, launch, watchErrors, open, testNavigation } = require('./lib');

const collect = () => {
  const site = location.hostname.split('.').slice(-2).join('.');
  const external = (u) => {
    try {
      const h = new URL(u, location.href).hostname;
      return h && !h.endsWith(site);
    } catch {
      return false;
    }
  };
  const visible = (el) => {
    if (!el.getClientRects().length) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const label = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
    (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).join('.') : '');
  const describe = (el, why) => {
    const chain = [];
    for (let e = el, i = 0; e && e !== document.body && i < 6; e = e.parentElement, i++) chain.push(label(e));
    const r = el.getBoundingClientRect();
    const attrs = [...el.attributes]
      .filter((a) => !['class', 'id', 'style', 'src', 'href'].includes(a.name))
      .map((a) => `${a.name}=${a.value.slice(0, 40)}`).join(' ');
    return `[${why}] ${Math.round(r.width)}x${Math.round(r.height)} ${getComputedStyle(el).position}\n    ${chain.join(' < ').slice(0, 450)}\n    ${(el.href || el.src || el.querySelector?.('a[href]')?.href || '').slice(0, 100)} ${attrs.slice(0, 160)}`;
  };

  const seen = new Set();
  const out = [];
  const add = (el, why) => {
    if (seen.has(el) || el.id?.startsWith('cpb') || !visible(el)) return;
    seen.add(el);
    out.push(describe(el, why));
  };
  for (const a of document.querySelectorAll('a[href]')) {
    if (external(a.href) && (a.querySelector('img,video,picture,iframe,canvas') || /sponsored/.test(a.rel))) add(a, 'ext-link');
  }
  for (const f of document.querySelectorAll('iframe')) add(f, 'iframe');
  for (const el of document.querySelectorAll('body *')) {
    const pos = getComputedStyle(el).position;
    if ((pos === 'fixed' || pos === 'sticky') && el.getBoundingClientRect().width > 40) add(el, pos);
  }
  const adName = /(^|[-_\s])(ads?|advert|banner|sponsor|qc|quangcao|catfish|balloon|preload|popup|overlay)([-_\s\d]|$)|__clb-/i;
  for (const el of document.querySelectorAll('[id],[class]')) {
    if (adName.test(el.id) || adName.test(typeof el.className === 'string' ? el.className : '')) add(el, 'ad-name');
  }

  const framework = [
    (document.getElementById('__next') || self.__next_f || document.querySelector('script[src*="/_next/"]')) && 'Next.js',
    [...document.querySelectorAll('body *')].slice(0, 300).some((e) => Object.keys(e).some((k) => k.startsWith('__react'))) && 'React',
    (document.querySelector('[data-v-app]') || window.__VUE__) && 'Vue',
    document.querySelector('link[href*="wp-content"], script[src*="wp-content"]') && 'WordPress',
  ].filter(Boolean);

  return { framework: framework.join(', ') || 'unknown (plain DOM)', candidates: out };
};

(async () => {
  const browser = await launch();
  const page = (await browser.pages())[0];
  const errors = watchErrors(page);
  if (!process.env.NO_MAIN) await page.evaluateOnNewDocument(readMain());

  for (const url of process.argv.slice(2)) {
    for (const step of ['home', 'content']) {
      errors.length = 0;
      let nav;
      if (step === 'home') {
        await open(page, url);
      } else {
        nav = await testNavigation(page);
        await open(page, page.url());
      }
      const host = new URL(page.url()).hostname;
      const shot = path.join(OUT_DIR, `${host}-${step}.png`);
      await page.screenshot({ path: shot });
      const data = await page.evaluate(collect);
      console.log(`\n##### [${step}] ${page.url()}`);
      if (nav) console.log(`navigation: ${nav.ok ? 'OK' : 'FAILED'} ${JSON.stringify(nav)}`);
      console.log(`framework: ${data.framework}`);
      console.log(`page errors: ${errors.length ? JSON.stringify(errors) : 'none'}`);
      console.log(`screenshot: ${shot}`);
      console.log(`visible candidates (${data.candidates.length}):`);
      for (const c of data.candidates) console.log('  ' + c);
    }
  }
  await browser.close();
})();
