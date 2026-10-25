# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A single-file Tampermonkey userscript (`main.js`) that blocks popups/new tabs on a fixed list of movie sites and shows a draggable status badge with a blocked count. There is no build, lint, test, or package tooling. Plain browser JavaScript, no dependencies.

## Running / testing

No automated tests. To try a change, paste `main.js` into a Tampermonkey userscript, save, and reload a supported site. Block events are logged to the browser console with the `[CPB]` prefix.

To add a site or clean up its banner ads, use the `ad-cleanup` skill (`.claude/skills/ad-cleanup/`): its scripts drive the local Google Chrome via puppeteer-core with `main.js` injected, to find ad selectors, decide hide vs remove, and verify.

## Architecture

Everything lives in one IIFE in `main.js`. Things that are not obvious from a quick skim:

- **Metadata header matters.** `@run-at document-start` is required so the `window.open` override is installed before site scripts run. `@sandbox raw` + `@grant none` make the script run in the page's own context, so overriding `window.open` affects the site's scripts. Supported sites are defined by a single `@include` regex (name-based, because these sites keep moving to new domains); when changing it, also update the "Supported Sites" section in `README.md`.
- **Blocking**, all routed through `increaseBlocked(type, detail)` (which updates the counter, storage, console log, and badge):
  - `patchWindow(win)` locks (non-writable/non-configurable) `window.open`, `HTMLElement.prototype.click`, `EventTarget.prototype.dispatchEvent` and `HTMLFormElement.prototype.submit` in a window, and wraps the `HTMLIFrameElement` `contentWindow`/`contentDocument` getters so every same-origin iframe window gets patched before the page can use it. Real popunders seen on these sites use exactly these bypasses: `iframe.contentWindow.open()` from an about:blank iframe, and `.click()` on a `<a target="_blank">` that was never attached to the DOM (its click event never reaches `document` listeners).
  - Capture-phase `click`/`auxclick`/`submit` listeners on `document` cancel real user clicks on `<a target="_blank">` and submits of `<form target="_blank">`.
  - Code must not use `instanceof` against the top window's classes for elements that may come from an iframe realm; use `findBlankLink`/`hasBlankTarget`.
- **Banners** (top frame only): `HIDDEN_SELECTOR` is only hidden with CSS, because on the Next.js sites (motchill/phimmoi) React owns those nodes and removing them crashes the app ("Application error"). `REMOVED_SELECTOR` (phimnhua, not React) is hidden and also removed by a `MutationObserver`. Verify with a live page that the site still renders and navigates after changing either list.
- **Badge** is only created in the top frame (`window.top === window`), but blockers run in every frame the script is injected into. Because the script runs at document-start, `createBadge` waits for `DOMContentLoaded` / polls with `requestAnimationFrame` until `document.body` exists.
- **Styling** is injected as a `<style>` element with heavy `!important` use to survive hostile site CSS; inline positions are set with `style.setProperty(..., 'important')` for the same reason.
- **Storage:** blocked count in `sessionStorage` (`cpb_popup_block_count`), badge position in `localStorage` (`cpb_popup_block_position`). Both are per-site-origin and all accesses are wrapped in try/catch.
- All IDs, classes, and storage keys use the `cpb` prefix to avoid collisions with the host page.

## Conventions

2-space indentation, single quotes, very vertical formatting (arguments and expressions split across lines), sections separated by `// ====` banner comments. Match this style.
