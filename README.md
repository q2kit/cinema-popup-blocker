# Cinema Popup Blocker

Cinema Popup Blocker is a Tampermonkey userscript that prevents supported movie sites from opening unwanted popup windows or new tabs, and hides their banner ads.

## Features

- Blocks calls to `window.open`, including calls made through an iframe's window.
- Blocks clicks on links with `target="_blank"`, including scripted `link.click()` on links that are not in the page.
- Blocks form submissions with `target="_blank"`, including `form.submit()`.
- Hides banner ads, the popup ad overlay, and the Telegram promo overlay.
- Shows a small status badge with the number of blocked popups.
- Keeps the blocked count for the current browser session.
- Lets you drag the status badge and remembers its position.
- Runs automatically on supported sites.

## Supported Sites

These sites change domains often, so the script matches by name instead of exact domain. It runs on any `https://` site whose domain starts with `motchill`, `phimmoi` or `phimnhua`, for example:

- `motchillu.mx` (also reached from `motchillu.app` and `motchillm.fm`)
- `phimmoic.com.mx` (also reached from `phimmoic.mx`)
- `phimnhua.online`

To add a site, edit the `@include` regex in the userscript header.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Open Tampermonkey and create a new userscript.
3. Replace the default script with the contents of [`main.js`](main.js).
4. Save the userscript.
5. Open or refresh one of the supported sites.

## Usage

After installation, the script works automatically. No additional configuration is required.

The status badge appears in the top-right corner of the page. It shows:

- A green dot when the blocker is active.
- `CPB` to identify the blocker.
- The number of blocked popup attempts.

Drag the badge to move it. Its position is saved in browser local storage and restored on future visits.

The counter is stored in session storage, so it normally resets when the browser session is cleared or ends. Block events are also written to the browser console with the `[CPB]` prefix.

## Notes

The script only targets the domains matched by the `@include` rule in its userscript metadata. It does not block every possible redirect or popup technique used by websites.