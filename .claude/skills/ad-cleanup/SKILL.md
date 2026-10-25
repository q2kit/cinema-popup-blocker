---
name: ad-cleanup
description: Investigate a supported (or newly added) movie site live in Chrome, find the common selectors of its banner ads / ad overlays, and add them to the banner hide/remove lists in main.js, verified against the real site. Use when the user adds a new site to @include, says banners/ads still show on a site, or asks to clean up ad elements.
---

# Ad cleanup for a site

Goal: every banner ad on the site is gone, and the site still renders and navigates. Work against the live site in Chrome; never guess selectors from memory.

Input: one or more site URLs (e.g. a domain the user just added). If none given, ask which site.

## 0. Setup (once per session)

```bash
S=<scratchpad>/ad-cleanup; mkdir -p $S && cd $S && npm init -y >/dev/null && npm i puppeteer-core@23.11.1
export NODE_PATH=$S/node_modules OUT_DIR=$S
```

Prefix every script run with `NODE_PATH=$S/node_modules OUT_DIR=$S` (shell state does not persist). Scripts live in `.claude/skills/ad-cleanup/scripts/`, drive the installed Google Chrome with a fresh profile per run, inject the repo's current `main.js`, and write screenshots to `$OUT_DIR`. Read the screenshots: they are the ground truth for "is it clean / did it break".

## 1. Make sure the script runs on the site

Load the URL and check the final hostname (sites redirect to rotated domains). If it is not matched by the `@include` regex in `main.js`, extend the regex (keep it name-based, e.g. `newsite\w*`) and update "Supported Sites" in `README.md`.

## 2. Investigate

```bash
node .claude/skills/ad-cleanup/scripts/inspect.js https://site/
```

It checks the home page and a content page reached by a real click, and prints the framework, page errors, navigation result and every **still-visible** ad candidate with its ancestor chain (`tag#id.class < parent < ...`). Add `NO_MAIN=1` to see the raw page.

From the output, find what the ads have in common, preferring in this order:
1. A stable container class/id used for all slots (e.g. `.ads-banner`, `[id^="__clb-"]`).
2. A stable attribute on every ad link (e.g. `a[rel~="sponsored"]`).
3. Overlays/popup ads: target the overlay via `:has()` on the ad link inside it (e.g. `.fixed.inset-0:has(a[rel~="sponsored"])`), never a bare utility class.
4. Wrappers that still leave empty space after the ad is gone (check `min-height`/padding in the screenshot), targeted with `:has()` so they only match when they hold ads.

Avoid selectors that could match real content: hashed/utility classes alone (`.fixed`, `.mb-2`, `.container`), the site header/nav, the video player. If a class could be shared, grep the site's JS (dump via the page's `script` responses) to confirm it is only used for ads. Leave player pre-roll ads (`.plyr__ads`, Google IMA iframes) alone: removing them can hang the player.

## 3. Hide or remove?

For each new selector:

```bash
node .claude/skills/ad-cleanup/scripts/compare.js https://site/ '<selector>'
```

- If `remove` loses content (`textLength`/`internalLinks` drop vs `hide`), shows `appError`, logs errors, or breaks navigation → **hide only** (React/Next.js own those nodes; removing them crashes the app).
- Otherwise → **remove** (also stops ad iframes/scripts).

## 4. Edit main.js

In the "Remove banners" section:
- add hide-only selectors to `HIDDEN_SELECTOR`, removable ones to `REMOVED_SELECTOR`;
- extend the section comment with one line per site describing what its ads look like and why hide vs remove.

Follow the repo style (CLAUDE.md). Bump `@version` (minor). Then `node --check main.js`.

## 5. Verify

Re-run `inspect.js` on the site **and on every other supported site** (the selectors are global):
- no visible ad candidates left (remaining ones must be explained: header, player, site UI);
- `page errors: none` (ignore errors that also appear with `NO_MAIN=1`);
- `navigation: OK` (if it fails, re-run with `NO_MAIN=1`; if it also fails there, it's the test click, not the script);
- screenshots look clean, with no blank gaps or blank pages.

Report a table per site: selectors added, hide vs remove and why, verification result. Don't commit unless asked.
