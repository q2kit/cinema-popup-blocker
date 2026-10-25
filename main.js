// ==UserScript==
// @name         Cinema Popup Blocker
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Block window.open / target=_blank and show blocker status
// @include      /^https:\/\/(www\.)?(motchill\w*|phimmoi\w*|phimnhua)\.[a-z.]+\//
// @run-at       document-start
// @sandbox      raw
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const BADGE_ID = 'cpb-popup-blocker-status';
  const COUNT_KEY = 'cpb_popup_block_count';
  const POSITION_KEY = 'cpb_popup_block_position';

  let blockedCount = getStoredCount();

  // =========================================================
  // Storage
  // =========================================================

  function getStoredCount() {
    try {
      return Number(
        sessionStorage.getItem(COUNT_KEY) || 0
      );
    } catch {
      return 0;
    }
  }

  function saveCount() {
    try {
      sessionStorage.setItem(
        COUNT_KEY,
        String(blockedCount)
      );
    } catch {
      // Ignore storage errors.
    }
  }

  // =========================================================
  // Counter
  // =========================================================

  function increaseBlocked(type, detail) {
    blockedCount++;

    saveCount();

    console.log(
      `[CPB] Blocked #${blockedCount} [${type}]`,
      detail
    );

    updateBadge();
    flashBadge();
  }

  function updateBadge() {
    const counter = document.getElementById(
      `${BADGE_ID}-counter`
    );

    if (counter) {
      counter.textContent = String(blockedCount);
    }
  }

  function flashBadge() {
    const badge = document.getElementById(BADGE_ID);

    if (!badge) {
      return;
    }

    badge.classList.remove('cpb-block-flash');

    // Force reflow to restart the animation.
    void badge.offsetWidth;

    badge.classList.add('cpb-block-flash');
  }

  // =========================================================
  // Helpers
  //
  // Elements may come from another window (e.g. an about:blank
  // iframe), so avoid instanceof checks against this window.
  // =========================================================

  // Every function installed by the blocker, so a window that
  // is already patched can be recognized.
  const blockerFunctions = new WeakSet();

  function lockProperty(object, name, value) {
    blockerFunctions.add(value);

    Object.defineProperty(
      object,
      name,
      {
        value,
        writable: false,
        configurable: false,
      }
    );
  }

  function hasBlankTarget(element) {
    const target = element
      .getAttribute('target')
      ?.trim()
      .toLowerCase();

    return target === '_blank';
  }

  function findBlankLink(node) {
    const link = node?.closest?.('a');

    if (!link || !hasBlankTarget(link)) {
      return null;
    }

    return link;
  }

  // =========================================================
  // Patch a window
  //
  // Applied to the page at document-start, and to every
  // same-origin iframe window the page gets hold of, because
  // each iframe has its own unpatched window.open and
  // prototypes.
  // =========================================================

  function patchWindow(win) {
    try {
      if (blockerFunctions.has(win.open)) {
        return;
      }
    } catch {
      // Cross-origin window: nothing to patch.
      return;
    }

    patchWindowOpen(win);

    for (const patch of [
      patchLinkClick,
      patchFormSubmit,
      patchFrameAccess,
    ]) {
      try {
        patch(win);
      } catch (error) {
        console.warn(
          `[CPB] ${patch.name} failed`,
          error
        );
      }
    }
  }

  // =========================================================
  // Block window.open
  // =========================================================

  const blockedWindowOpen = function (...args) {
    increaseBlocked(
      'window.open',
      args
    );

    return null;
  };

  blockerFunctions.add(blockedWindowOpen);

  function patchWindowOpen(win) {
    try {
      lockProperty(
        win,
        'open',
        blockedWindowOpen
      );
    } catch (error) {
      try {
        win.open = blockedWindowOpen;
      } catch (fallbackError) {
        console.warn(
          '[CPB] Failed to block window.open',
          error,
          fallbackError
        );
      }
    }
  }

  // =========================================================
  // Block scripted clicks on <a target="_blank">
  //
  // Popunders create a link that is never added to the page
  // and call link.click(). The click event of a detached
  // element never reaches the document listeners below.
  // =========================================================

  function patchLinkClick(win) {
    const elementProto = win.HTMLElement.prototype;
    const nativeClick = elementProto.click;

    lockProperty(
      elementProto,
      'click',
      function () {
        const link = findBlankLink(this);

        if (link) {
          increaseBlocked(
            'link.click()',
            link.href
          );

          return;
        }

        return nativeClick.apply(this, arguments);
      }
    );

    const eventProto = win.EventTarget.prototype;
    const nativeDispatch = eventProto.dispatchEvent;

    lockProperty(
      eventProto,
      'dispatchEvent',
      function (event) {
        const link =
          event?.type === 'click' &&
          findBlankLink(this);

        if (link) {
          increaseBlocked(
            'link.dispatchEvent(click)',
            link.href
          );

          return false;
        }

        return nativeDispatch.apply(this, arguments);
      }
    );
  }

  // =========================================================
  // Block form.submit() on <form target="_blank">
  //
  // form.submit() does not fire a submit event.
  // =========================================================

  function patchFormSubmit(win) {
    const formProto = win.HTMLFormElement.prototype;
    const nativeSubmit = formProto.submit;

    lockProperty(
      formProto,
      'submit',
      function () {
        if (hasBlankTarget(this)) {
          increaseBlocked(
            'form.submit()',
            this.action
          );

          return;
        }

        return nativeSubmit.apply(this, arguments);
      }
    );
  }

  // =========================================================
  // Patch iframe windows on access
  //
  // Popunders create an about:blank iframe and call
  // iframe.contentWindow.open(). Patch the iframe window
  // before handing it out.
  // =========================================================

  function patchFrameAccess(win) {
    const frameProto = win.HTMLIFrameElement.prototype;

    const windowGetter = Object.getOwnPropertyDescriptor(
      frameProto,
      'contentWindow'
    ).get;

    const documentGetter = Object.getOwnPropertyDescriptor(
      frameProto,
      'contentDocument'
    ).get;

    Object.defineProperty(
      frameProto,
      'contentWindow',
      {
        get() {
          const frameWindow = windowGetter.call(this);

          if (frameWindow) {
            patchWindow(frameWindow);
          }

          return frameWindow;
        },
        configurable: false,
      }
    );

    Object.defineProperty(
      frameProto,
      'contentDocument',
      {
        get() {
          const frameDocument = documentGetter.call(this);

          if (frameDocument?.defaultView) {
            patchWindow(frameDocument.defaultView);
          }

          return frameDocument;
        },
        configurable: false,
      }
    );
  }

  // Install immediately at document-start.
  patchWindow(window);

  // =========================================================
  // Block clicks on <a target="_blank">
  // =========================================================

  function handleBlankLink(event) {
    const link = findBlankLink(event.target);

    if (!link) {
      return;
    }

    increaseBlocked(
      'target=_blank',
      link.href
    );

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  // Use the capture phase to run before most website listeners.
  document.addEventListener(
    'click',
    handleBlankLink,
    true
  );

  // Handle middle-clicks on links with target="_blank".
  document.addEventListener(
    'auxclick',
    handleBlankLink,
    true
  );

  // =========================================================
  // Block <form target="_blank">
  // =========================================================

  document.addEventListener(
    'submit',
    function (event) {
      const form = event.target;

      if (
        !(form instanceof HTMLFormElement) ||
        !hasBlankTarget(form)
      ) {
        return;
      }

      increaseBlocked(
        'form target=_blank',
        form.action
      );

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    },
    true
  );

  // =========================================================
  // Badge
  // =========================================================

  function createBadge() {
    // Only create the badge on the top-level page.
    if (window.top !== window) {
      return;
    }

    if (!document.body) {
      requestAnimationFrame(createBadge);
      return;
    }

    if (document.getElementById(BADGE_ID)) {
      return;
    }

    createBadgeStyle();

    const badge = document.createElement('div');

    badge.id = BADGE_ID;

    badge.innerHTML = `
            <span class="cpb-status-dot"></span>
            <span class="cpb-label">CPB</span>
            <span id="${BADGE_ID}-counter">${blockedCount}</span>
        `;

    badge.title =
      'Popup Blocker is active\n' +
      'Drag to move';

    document.body.appendChild(badge);

    restorePosition(badge);
    makeDraggable(badge);
  }

  function createBadgeStyle() {
    if (
      document.getElementById(
        `${BADGE_ID}-style`
      )
    ) {
      return;
    }

    const style = document.createElement('style');

    style.id = `${BADGE_ID}-style`;

    style.textContent = `
            #${BADGE_ID} {
                position: fixed !important;

                top: 12px;
                right: 12px;

                display: flex !important;
                align-items: center !important;
                gap: 6px !important;

                box-sizing: border-box !important;

                padding: 7px 9px !important;

                background:
                    rgba(20, 20, 20, 0.92) !important;

                color: #fff !important;

                border:
                    1px solid
                    rgba(255, 255, 255, 0.18)
                    !important;

                border-radius: 8px !important;

                box-shadow:
                    0 2px 8px
                    rgba(0, 0, 0, 0.35)
                    !important;

                font-family:
                    -apple-system,
                    BlinkMacSystemFont,
                    "Segoe UI",
                    monospace !important;

                font-size: 12px !important;
                font-weight: 600 !important;
                line-height: 1 !important;

                cursor: grab !important;
                user-select: none !important;

                z-index: 2147483647 !important;

                /*
                 * Remains reasonably visible during normal use.
                 */
                opacity: 0.68 !important;

                transition:
                    opacity 0.15s ease,
                    transform 0.15s ease,
                    box-shadow 0.15s ease
                    !important;

                backdrop-filter: blur(3px);
                -webkit-backdrop-filter: blur(3px);
            }

            #${BADGE_ID}:hover {
                opacity: 1 !important;

                box-shadow:
                    0 3px 14px
                    rgba(0, 0, 0, 0.5)
                    !important;
            }

            #${BADGE_ID}.cpb-dragging {
                opacity: 1 !important;
                cursor: grabbing !important;
                transition: none !important;
            }

            #${BADGE_ID} .cpb-status-dot {
                display: block !important;

                width: 8px !important;
                height: 8px !important;

                flex: 0 0 8px !important;

                border-radius: 50% !important;

                background: #22c55e !important;

                box-shadow:
                    0 0 5px
                    #22c55e !important;
            }

            #${BADGE_ID} .cpb-label {
                white-space: nowrap !important;
            }

            #${BADGE_ID}-counter {
                display: inline-flex !important;

                min-width: 20px !important;
                height: 18px !important;

                box-sizing: border-box !important;

                align-items: center !important;
                justify-content: center !important;

                padding: 0 5px !important;

                border-radius: 5px !important;

                background:
                    rgba(255, 255, 255, 0.18)
                    !important;

                font-variant-numeric:
                    tabular-nums;
            }

            #${BADGE_ID}.cpb-block-flash {
                animation:
                    cpb-popup-block-flash
                    0.3s ease;
            }

            @keyframes cpb-popup-block-flash {
                0% {
                    opacity: 1;
                    transform: scale(1);
                }

                50% {
                    opacity: 1;
                    transform: scale(1.12);
                }

                100% {
                    transform: scale(1);
                }
            }
        `;

    document.documentElement.appendChild(style);
  }

  // =========================================================
  // Drag badge
  // =========================================================

  function makeDraggable(element) {
    let dragging = false;

    let startMouseX = 0;
    let startMouseY = 0;

    let startElementX = 0;
    let startElementY = 0;

    element.addEventListener(
      'pointerdown',
      function (event) {
        if (event.button !== 0) {
          return;
        }

        dragging = true;

        const rect =
          element.getBoundingClientRect();

        startMouseX = event.clientX;
        startMouseY = event.clientY;

        startElementX = rect.left;
        startElementY = rect.top;

        element.style.setProperty(
          'right',
          'auto',
          'important'
        );

        element.style.setProperty(
          'left',
          `${rect.left}px`,
          'important'
        );

        element.style.setProperty(
          'top',
          `${rect.top}px`,
          'important'
        );

        element.classList.add(
          'cpb-dragging'
        );

        try {
          element.setPointerCapture(
            event.pointerId
          );
        } catch {
          // Ignore.
        }

        event.preventDefault();
        event.stopPropagation();
      }
    );

    element.addEventListener(
      'pointermove',
      function (event) {
        if (!dragging) {
          return;
        }

        const deltaX =
          event.clientX -
          startMouseX;

        const deltaY =
          event.clientY -
          startMouseY;

        let x =
          startElementX +
          deltaX;

        let y =
          startElementY +
          deltaY;

        const maxX = Math.max(
          0,
          window.innerWidth -
          element.offsetWidth
        );

        const maxY = Math.max(
          0,
          window.innerHeight -
          element.offsetHeight
        );

        x = Math.max(
          0,
          Math.min(maxX, x)
        );

        y = Math.max(
          0,
          Math.min(maxY, y)
        );

        element.style.setProperty(
          'left',
          `${x}px`,
          'important'
        );

        element.style.setProperty(
          'top',
          `${y}px`,
          'important'
        );
      }
    );

    function stopDragging(event) {
      if (!dragging) {
        return;
      }

      dragging = false;

      element.classList.remove(
        'cpb-dragging'
      );

      try {
        element.releasePointerCapture(
          event.pointerId
        );
      } catch {
        // Ignore.
      }

      savePosition(element);
    }

    element.addEventListener(
      'pointerup',
      stopDragging
    );

    element.addEventListener(
      'pointercancel',
      stopDragging
    );
  }

  // =========================================================
  // Save / restore badge position
  // =========================================================

  function savePosition(element) {
    const rect =
      element.getBoundingClientRect();

    try {
      localStorage.setItem(
        POSITION_KEY,
        JSON.stringify({
          x: rect.left,
          y: rect.top,
        })
      );
    } catch {
      // Ignore.
    }
  }

  function restorePosition(element) {
    let raw;

    try {
      raw = localStorage.getItem(
        POSITION_KEY
      );
    } catch {
      return;
    }

    if (!raw) {
      return;
    }

    try {
      const position =
        JSON.parse(raw);

      if (
        typeof position.x !== 'number' ||
        typeof position.y !== 'number'
      ) {
        return;
      }

      const rect =
        element.getBoundingClientRect();

      const maxX = Math.max(
        0,
        window.innerWidth -
        rect.width
      );

      const maxY = Math.max(
        0,
        window.innerHeight -
        rect.height
      );

      const x = Math.max(
        0,
        Math.min(
          maxX,
          position.x
        )
      );

      const y = Math.max(
        0,
        Math.min(
          maxY,
          position.y
        )
      );

      element.style.setProperty(
        'right',
        'auto',
        'important'
      );

      element.style.setProperty(
        'left',
        `${x}px`,
        'important'
      );

      element.style.setProperty(
        'top',
        `${y}px`,
        'important'
      );
    } catch (error) {
      console.warn(
        '[CPB] Invalid badge position',
        error
      );
    }
  }

  // =========================================================
  // Keep badge inside viewport
  // =========================================================

  window.addEventListener(
    'resize',
    function () {
      const badge =
        document.getElementById(
          BADGE_ID
        );

      if (!badge) {
        return;
      }

      const rect =
        badge.getBoundingClientRect();

      const maxX = Math.max(
        0,
        window.innerWidth -
        badge.offsetWidth
      );

      const maxY = Math.max(
        0,
        window.innerHeight -
        badge.offsetHeight
      );

      const x = Math.max(
        0,
        Math.min(
          maxX,
          rect.left
        )
      );

      const y = Math.max(
        0,
        Math.min(
          maxY,
          rect.top
        )
      );

      badge.style.setProperty(
        'right',
        'auto',
        'important'
      );

      badge.style.setProperty(
        'left',
        `${x}px`,
        'important'
      );

      badge.style.setProperty(
        'top',
        `${y}px`,
        'important'
      );

      savePosition(badge);
    }
  );

  // =========================================================
  // Init badge
  // =========================================================

  if (window.top === window) {
    if (
      document.readyState ===
      'loading'
    ) {
      document.addEventListener(
        'DOMContentLoaded',
        createBadge,
        {
          once: true,
        }
      );
    } else {
      createBadge();
    }
  }

})();
