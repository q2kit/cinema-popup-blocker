# Cinema Popup Blocker

Cinema Popup Blocker is a Tampermonkey userscript that prevents supported movie sites from opening unwanted popup windows or new tabs.

## Features

- Blocks calls to `window.open`.
- Blocks clicks on links with `target="_blank"`.
- Blocks form submissions with `target="_blank"`.
- Shows a small status badge with the number of blocked popups.
- Keeps the blocked count for the current browser session.
- Lets you drag the status badge and remembers its position.
- Runs automatically on supported sites.

## Supported Sites

The script currently runs on:

- `motchillu.app`
- `phimnhua.online`
- `motchillm.fm`
- `phimmoic.mx`

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

The script only targets the domains listed in its userscript metadata. It does not block every possible redirect or popup technique used by websites.