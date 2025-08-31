// ==UserScript==
// @name         wPlace++ 
// @namespace    https://rooot.gay
// @version      0.1.5
// @description  Fix map not loading, QoL + safe UI panel (no fullscreen overlay), save prefs, avoid paint blackout & script conflicts.
// @author       rooot + fix:grok.com
// @updateURL    https://github.com/RoootTheFox/wplace-plusplus/raw/refs/heads/main/wplace++.user.js
// @downloadURL  https://github.com/RoootTheFox/wplace-plusplus/raw/refs/heads/main/wplace++.user.js
// @match        https://wplace.live/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wplace.live
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

/*** --- Utils --- ***/
function mk_log(level) {
  try {
    let c = "black";
    let dbg = false;
    switch (level) {
      case "err": c = "red"; break;
      case "inf": c = "lime"; break;
      case "wrn": c = "yellow"; break;
      case "dbg": c = "orange"; dbg = true; break;
    }
    if (dbg && !unsafeWindow.mk_enable_dbg) return;
    const base = ["%c[wplace++] %c[" + level + "]", "color:pink", "color:" + c];
    const stuff = [...base, ...arguments];
    // remove duplicated "level" from arguments
    stuff.splice(base.length, 1);
    // IMPORTANT: apply to console, not a string
    console.log.apply(console, stuff);
  } catch (_) {
    // never let logging break
  }
}

/*** --- App --- ***/
(function () {
  const usw = unsafeWindow;

  // --- Map safety wrappers ---
  // Wrap Map methods to avoid throwing when layers don't exist.
  function wrapMapSafety() {
    try {
      const MapProto = (unsafeWindow && unsafeWindow.mapboxgl && unsafeWindow.mapboxgl.Map) ? unsafeWindow.mapboxgl.Map.prototype : (unsafeWindow && unsafeWindow.Map ? unsafeWindow.Map.prototype : null);
      if (!MapProto) {
        // fallback: if _map exists later, we'll wrap its instance methods
        if (unsafeWindow._map && !unsafeWindow._map.__meow_safe_wrapped) {
          const _m = unsafeWindow._map;
          ['setLayoutProperty','setPaintProperty','moveLayer','setStyle','addLayer'].forEach(fn => {
            if (typeof _m[fn] === 'function') {
              const orig = _m[fn].bind(_m);
              _m[fn] = function() {
                try {
                  if (['setLayoutProperty','setPaintProperty'].includes(fn)) {
                    const layer = arguments[0];
                    if (!this.getLayer || !this.getLayer(layer)) return;
                  }
                  if (fn === 'moveLayer') {
                    const layer = arguments[0];
                    const before = arguments[1];
                    if (!this.getLayer || !this.getLayer(layer)) return;
                    // Additional check for before layer if specified
                    if (before && (!this.getLayer(before))) return;
                  }
                  return orig.apply(this, arguments);
                } catch (e) { console.warn('[wplace++] safeMap.'+fn+' suppressed', e); }
              };
            }
          });
          unsafeWindow._map.__meow_safe_wrapped = true;
        }
        return;
      }
      if (MapProto.__meow_safe_wrapped) return;
      ['setLayoutProperty','setPaintProperty','moveLayer','addLayer'].forEach(fn => {
        if (typeof MapProto[fn] === 'function') {
          const orig = MapProto[fn];
          MapProto[fn] = function() {
            try {
              if (['setLayoutProperty','setPaintProperty'].includes(fn)) {
                const layer = arguments[0];
                if (!this.getLayer || !this.getLayer(layer)) return; // skip silently
              }
              if (fn === 'moveLayer') {
                const layer = arguments[0];
                const before = arguments[1];
                if (!this.getLayer || !this.getLayer(layer)) return;
                // Additional check for before layer if specified
                if (before && (!this.getLayer(before))) return;
              }
              return orig.apply(this, arguments);
            } catch (e) {
              console.warn('[wplace++] safeMap.'+fn+' suppressed', e);
            }
          };
        }
      });
      MapProto.__meow_safe_wrapped = true;
    } catch (e) { console.warn('[wplace++] wrapMapSafety failed', e); }
  }
  // attempt early wrap
  try { wrapMapSafety(); } catch(e) { console.warn('[wplace++] initial wrap failed', e); }

  const LEFT_SIDEBAR_SELECTOR = ".absolute.left-2.top-2.z-30.flex.flex-col.gap-3";
  const LS_KEYS = {
    UI_OPEN: "meow_ui_open",
    THEME: "meow_theme",
    UI_THEME: "meow_ui_theme",
    HIDE_PREFIX: "meow_hideElement_", // + element id
  };

  /* ---- Themes ---- */
  usw._meow_themes = {
    liberty: { path: "/styles/liberty" },
    dark: { path: "/styles/dark" },
    bright: { path: "/styles/bright" },
    positron: { path: "/styles/positron" },
    fiord: { path: "/styles/fiord" },
  };

  usw._meow_ui_themes = {
    default: { display: "default (light)", css: "" },
    "ctp-mocha": {
      display: "catppuccin mocha (dark) [beta]",
      css: `
:root {
  --color-base-100:#1e1e2e;
  --color-base-content:white;
  --color-base-200:#181825;
  --color-base-300:#11111b;
  --fx-noise:;
}
[data-rich-colors="true"][data-sonner-toast][data-type="error"],
[data-rich-colors="true"][data-sonner-toast][data-type="error"] [data-close-button]{
  --error-bg:var(--color-base-100);
  --error-border:var(--color-base-100);
  --error-text:#f38ba8;
}
`,
    },
  };

  function getTheme() {
    let id = localStorage.getItem(LS_KEYS.THEME) || "liberty";
    if (!usw._meow_themes.hasOwnProperty(id)) {
      mk_log("wrn", "Unknown theme", id, "→ fallback liberty");
      id = "liberty";
    }
    const t = { ...usw._meow_themes[id], name: id };
    return t;
  }

  // New function to ensure theme applies after load (moved outside of getTheme)
  function applySavedTheme() {
    try {
      const themeId = localStorage.getItem(LS_KEYS.THEME) || null;
      if (!themeId) return;
      const theme = usw._meow_themes[themeId] || getTheme();
      const host = theme.host || "ofm.rooot.gay";
      // If map available, set style and wait for style to load before trying further styling.
      const doSet = (map) => {
        try {
          map.setStyle("https://" + host + theme.path);
          // ensure safety wrappers for instance as well
          if (!map.__meow_safe_wrapped) {
            ['setLayoutProperty','setPaintProperty','moveLayer','addLayer'].forEach(fn => {
              if (typeof map[fn] === 'function') {
                const orig = map[fn].bind(map);
                map[fn] = function() {
                  try {
                    if (['setLayoutProperty','setPaintProperty'].includes(fn)) {
                      const layer = arguments[0];
                      if (!this.getLayer || !this.getLayer(layer)) return;
                    }
                    if (fn === 'moveLayer') {
                      const layer = arguments[0];
                      const before = arguments[1];
                      if (!this.getLayer || !this.getLayer(layer)) return;
                      // Additional check for before layer if specified
                      if (before && (!this.getLayer(before))) return;
                    }
                    return orig.apply(this, arguments);
                  } catch (e) { console.warn('[wplace++] safeMap.'+fn+' suppressed', e); }
                };
              }
            });
            map.__meow_safe_wrapped = true;
          }
        } catch(e) { console.warn('[wplace++] applySavedTheme.setStyle failed', e); }
      };
      if (usw._map && usw._map.setStyle) doSet(usw._map);
      else {
        const iv = setInterval(() => {
          if (usw._map && usw._map.setStyle) {
            clearInterval(iv);
            doSet(usw._map);
          }
        }, 300);
      }
    } catch (e) { mk_log('err','applySavedTheme failed',e); }
  }

  function getUITheme() {
    let id = localStorage.getItem(LS_KEYS.UI_THEME) || "default";
    if (!usw._meow_ui_themes.hasOwnProperty(id)) {
      mk_log("wrn", "Unknown UI theme", id, "→ fallback default");
      id = "default";
    }
    const t = { ...usw._meow_ui_themes[id], name: id, css: usw._meow_ui_themes[id].css || "" };
    return t;
  }

  usw.setTheme = function setTheme(theme) {
    try {
      localStorage.setItem(LS_KEYS.THEME, theme);
      if (usw._map && usw._map.setStyle) {
        const t = usw._meow_themes[theme];
        const host = t.host || "ofm.rooot.gay";
        usw._map.setStyle("https://" + host + t.path);
        usw._map.fire("style.load");
      } else {
        applySavedTheme();
      }
    } catch (e) {
      mk_log("err", "setTheme failed", e);
    }
  };

  usw.setUITheme = function setUITheme(theme) {
    localStorage.setItem(LS_KEYS.UI_THEME, theme);
    const el = document.getElementById("meow_ui_theme");
    if (el) el.textContent = getUITheme().css;
  };

  /* ---- Persist UI open state ---- */
  usw._meow_ui = (localStorage.getItem(LS_KEYS.UI_OPEN) === "true");

  function setUIOpen(state) {
    usw._meow_ui = !!state;
    localStorage.setItem(LS_KEYS.UI_OPEN, usw._meow_ui ? "true" : "false");
    mk_update_visibility();
  }

  usw._meow_ui = localStorage.getItem("meow_ui_open") === "true";
  // toggle
  function toggleUI(state) {
    usw._meow_ui = state;
    localStorage.setItem("meow_ui_open", state);
    mk_update_visibility();
  }
  /* ---- Safe fetch patch (conflict-aware) ---- */
  if (!usw.fetchIsPatched) {
    try {
      usw.patches_orig = usw.patches_orig || {};
      usw.patches_orig.fetch = usw.fetch;
      usw.originalFetch = window.fetch; // raw window fetch

      const patchedFetch = async function (req, ...args) {
        try {
          let url = (typeof req === "string") ? req : req.url;
          const parsed = new URL(url, location.origin);
          const isMap = parsed.host === "maps.wplace.live" || parsed.host === "tiles.openfreemap.org";

          if (isMap) {
            parsed.host = "ofm.rooot.gay";
          }

          const theme = getTheme();
          if (isMap && parsed.pathname === "/styles/liberty") {
            parsed.pathname = theme.path;
            if (theme.host) parsed.host = theme.host;
          }

          // minor cache-buster (kept as in original)
          parsed.pathname = parsed.pathname.replace("/ ", "//");

          // replace request
          req = (typeof req === "string")
            ? parsed.toString()
            : new Request(parsed.toString(), req);

          // BlueMarble compat
          if (typeof usw.bmfetchPatch === "function") {
            mk_log("dbg", "BlueMarble compat in use");
            return await usw.bmfetchPatch(usw.originalFetch, req, ...args);
          }
          return usw.originalFetch(req, ...args);
        } catch (e) {
          mk_log("err", "patchedFetch error", e);
          // hard fallback to native if anything goes wrong
          return usw.originalFetch(req, ...args);
        }
      };

      usw.fetch = patchedFetch;
      window.fetch = patchedFetch;
      usw.fetchIsPatched = true;
      window.fetchIsPatched = true;
    } catch (e) {
      mk_log("err", "Failed to patch fetch", e);
    }
  } else {
    mk_log("dbg", "fetch already patched – skipping");
  }

  /* ---- Capture map Promise (as-is but safe) ---- */
  try {
    if (!usw.__meowPromisePatched) {
      usw.patches_orig = usw.patches_orig || {};
      usw.patches_orig.Promise = usw.Promise;
      class PawsomePromise extends Promise {
        constructor(exec) {
          super(exec);
          try {
            if (typeof exec === "function" && exec.toString().includes("maps.wplace.live")) {
              this.then((map) => {
                mk_log("inf", "map exposed");
                usw._map = map;
                // restore Promise to original after capture
                usw.Promise = usw.patches_orig.Promise;
                usw.__meowPromisePatched = false;
              });
            }
          } catch { /* ignore */ }
        }
      }
      usw.Promise = PawsomePromise;
      usw.__meowPromisePatched = true;
    }
  } catch (e) {
    mk_log("wrn", "Promise patch failed", e);
  }

  /* ---- UI injection ---- */

  function mk_update_visibility() {
    const menu = document.getElementById("mk_menu");
    const btn = document.getElementById("mk_btn");
    if (!menu || !btn) return;

    if (usw._meow_ui) {
      menu.style.display = "block";
      menu.style.pointerEvents = "auto";
    } else {
      menu.style.display = "none";
      menu.style.pointerEvents = "none";
    }
  }

  function mk_menu_create_category(name) {
    const cat = document.createElement("div");
    cat.className = "mk_menu_category";
    const title = document.createElement("h4");
    title.textContent = name;
    title.className = "mk_menu_category-title";
    cat.appendChild(title);
    const content = document.createElement("div");
    content.className = "mk_menu_category-content";
    cat.appendChild(content);
    cat.content = content;
    document.getElementById("mk_menu").appendChild(cat);
    return cat;
  }

  function mk_menu_create_button(category, title, onclick) {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("btn");
    button.textContent = title;
    button.addEventListener("click", () => onclick(button));
    category.content.appendChild(button);
    return button;
  }

  function createButton() {
    if (document.getElementById("mk_btn")) return;
    const left = document.querySelector(LEFT_SIDEBAR_SELECTOR);
    if (!left) return; // wait until it exists

    mk_log("inf", "creating meow button");
    const container = document.createElement("div");
    container.classList.add("max-sm");
    left.appendChild(container);

    const button = document.createElement("button");
    button.classList.add("btn", "btn-sm", "btn-circle");
    button.id = "mk_btn";
    button.title = "wPlace++";
    button.addEventListener("click", () => setUIOpen(!usw._meow_ui));
    container.appendChild(button);

    // icon
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" style="scale:.75" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 16v4M6 4v4m1 10H3M8 6H4m9-2 1.7528 4.4444c.1879.4764.2819.7147.4258.9155.1275.1781.2834.334.4615.4615.2008.1439.4391.2379.9155.4258L21 12l-4.4444 1.7528c-.4764.1879-.7147.2819-.9155.4258a1.9976 1.9976 0 0 0-.4615.4615c-.1439.2008-.2379.4391-.4258.9155L13 20l-1.7528-4.4444c-.1879-.4764-.2819-.7147-.4258-.9155a1.9976 1.9976 0 0 0-.4615-.4615c-.2008-.1439-.439-.2379-.9155-.4258L5 12l4.4444-1.7528c.4764-.1879.7147-.2819.9155-.4258a1.9987 1.9987 0 0 0 .4615-.4615c.1439-.2008.2379-.439.4258-.9155L13 4Z"/></svg>`;
  }

  function injectUI() {
    mk_log("inf", "injecting UI");

    createButton();

    // ESC closes menu & save
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setUIOpen(false);
    }, { capture: true });

    // build panel (NOT fullscreen overlay)
    if (!document.getElementById("mk_menu")) {
      const menu = document.createElement("div");
      menu.id = "mk_menu";
      menu.style.display = "none";
      document.body.appendChild(menu);

      const title = document.createElement("h3");
      title.className = "mk_menu-title";
      title.innerHTML = `wPlace++ v0.1.5-fix by <a class="mk_menu-dev" href="https://rooot.gay" target="_blank" rel="noreferrer">rooot</a>`;
      menu.appendChild(title);

      const cat_wplace = mk_menu_create_category("wplace");
      const cat_other = mk_menu_create_category("other");
      const cat_misc = mk_menu_create_category("misc");

      // Map theme
      const spanTheme = document.createElement("span");
      spanTheme.textContent = "map theme: ";
      const selectTheme = document.createElement("select");
      Object.keys(usw._meow_themes).forEach((id) => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id;
        selectTheme.appendChild(opt);
      });
      selectTheme.value = getTheme().name;
      selectTheme.addEventListener("change", (e) => usw.setTheme(e.target.value));
      cat_wplace.content.append(spanTheme, selectTheme);

      // UI theme
      cat_wplace.content.appendChild(document.createElement("br"));
      const spanUITheme = document.createElement("span");
      spanUITheme.textContent = "ui theme: ";
      const selectUI = document.createElement("select");
      Object.keys(usw._meow_ui_themes).forEach((id) => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = usw._meow_ui_themes[id].display;
        selectUI.appendChild(opt);
      });
      selectUI.value = getUITheme().name;
      selectUI.addEventListener("change", (e) => usw.setUITheme(e.target.value));
      cat_wplace.content.append(spanUITheme, selectUI);

      function createElementToggleButton(cat, text, elementId) {
        const lsKey = LS_KEYS.HIDE_PREFIX + elementId;
        const rule = `#${CSS.escape(elementId)}{display:none !important}`;
        let styleEl = document.getElementById(lsKey);

        const ensureStyle = () => {
          if (!styleEl) {
            styleEl = document.createElement("style");
            styleEl.id = lsKey;
            styleEl.textContent = rule;
          }
          return styleEl;
        };

        mk_menu_create_button(cat, text, () => {
          const exists = document.getElementById(elementId) !== null;
          if (!exists) {
            mk_log("wrn", "toggle target not found yet:", elementId);
            // still allow persisting preference; style will apply when element appears
          }
          if (document.getElementById(lsKey)) {
            // show
            document.getElementById(lsKey).remove();
            localStorage.setItem(lsKey, "false");
            mk_log("dbg", "showing element", elementId);
          } else {
            // hide
            document.body.appendChild(ensureStyle());
            localStorage.setItem(lsKey, "true");
            mk_log("dbg", "hiding element", elementId);
          }
        });

        // apply persisted state
        if (localStorage.getItem(lsKey) === "true") {
          document.body.appendChild(ensureStyle());
        }
      }

      // Common other tools
      createElementToggleButton(cat_other, "toggle Blue Marble visibility", "bm-n");
      createElementToggleButton(cat_other, "toggle Overlay Pro visibility", "overlay-pro-panel");

      mk_menu_create_button(cat_misc, "Close menu", () => setUIOpen(false));

      // Panel CSS (no fullscreen, no screen-dimming)
      const style = document.createElement("style");
      style.textContent = `
:root{
  --mk-accent:#f5c2e7;
  --mk-crust-raw:17,17,27;
  --mk-crust:rgb(var(--mk-crust-raw));
  --mk-mantle:#181825;
  --mk-base:#1e1e2e;
  --mk-text:#cdd6f4;
  --mk-surface:#313244;
  --meow-padding:12px;
}

/* compact floating panel */
#mk_menu {
    position: fixed;
    right: 10px;
    top: 60px;
    width: 300px;
    max-height: 80vh;
    overflow-y: auto;
    background-color: rgba(var(--mk-crust-raw), 0.95);
    backdrop-filter: blur(6px);
    border-radius: 12px;
    z-index: 10000;
    display: none; /* ẩn mặc định */
    color:var(--mk-text);
}

#mk_menu.hidden {
    display: none !important;
}

.mk_menu-title{
  font-size:18px;
  font-weight:700;
  color:var(--mk-accent);
  margin:6px 8px 10px 8px;
}

.mk_menu-dev{
  color:var(--mk-accent);
  text-decoration:underline;
}

.mk_menu_category{
  backdrop-filter:blur(4px);
  padding:8px 10px;
  border-radius:12px;
  background-color:rgba(var(--mk-crust-raw),.6);
  margin:8px;
}

.mk_menu_category-title{
  font-size:15px;
  font-weight:700;
  color:var(--mk-accent);
  margin-bottom:6px;
}

.mk_menu_category-content .btn{
  margin-right:8px;
  margin-top:6px;
}

/* when hidden, do not capture input */
#mk_menu[style*="display: none"]{
  pointer-events:none !important;
}
`;
      document.body.appendChild(style);

      // Inject UI theme <style>
      const uiStyle = document.createElement("style");
      uiStyle.id = "meow_ui_theme";
      uiStyle.textContent = getUITheme().css;
      document.head.appendChild(uiStyle);
    }

    // reflect saved open state
    mk_update_visibility();

    // if some other script removes the button, re-create infrequently
    let guardTimer = null;
    const guard = () => {
      if (document.getElementById("mk_btn")) return;
      createButton();
    };
    // a light guard every 1.5s
    guardTimer = setInterval(guard, 1500);
    // stop guard when page is hidden to save CPU
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { clearInterval(guardTimer); guardTimer = null; }
      else if (!guardTimer) guardTimer = setInterval(guard, 1500);
    });
  }


  // === Overlay nền ===
  function ensureBgOverlay() {
    if (!document.getElementById("mk_bg_overlay")) {
      const bg = document.createElement("div");
      bg.id = "mk_bg_overlay";
      bg.style.cssText = `position:fixed;inset:0;background-color:rgba(30,30,46,0.7);pointer-events:none;z-index:0;`;
      document.body.prepend(bg);
    }
  }


  /* ---- Wait for LEFT SIDEBAR safely ---- */

  // === Overlay nền (non-blocking) ===
  function ensureBgOverlay() {
    try {
      if (!document.getElementById("mk_bg_overlay")) {
        const bg = document.createElement("div");
        bg.id = "mk_bg_overlay";
        bg.style.cssText = "position:fixed;inset:0;background-color:rgba(30,30,46,0.12);pointer-events:none;z-index:0;mix-blend-mode:multiply;";
        document.body.prepend(bg);
      }
    } catch(e){ mk_log('err','ensureBgOverlay failed', e); }
  }

  function readyUI() {
    if (document.querySelector(LEFT_SIDEBAR_SELECTOR)) {
      mk_log("inf", "injecting immediately");
      injectUI();
      ensureBgOverlay();
      applySavedTheme();
      return;
    }
    mk_log("inf", "waiting for UI…");
    const obs = new MutationObserver(() => {
      if (document.querySelector(LEFT_SIDEBAR_SELECTOR)) {
        obs.disconnect();
        injectUI();
      ensureBgOverlay();
      applySavedTheme();
      }
    });
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });

    // fallback in case observer misses
    let tries = 0;
    const iv = setInterval(() => {
      if (document.querySelector(LEFT_SIDEBAR_SELECTOR)) {
        clearInterval(iv);
        injectUI();
      ensureBgOverlay();
      applySavedTheme();
      } else if (++tries > 300) { // ~30s fallback cap
        clearInterval(iv);
        mk_log("wrn", "UI anchor not found; giving up guard");
      }
    }, 100);
  }

  // Start
  if (document.readyState === "loading") {
    document.addEventListener('DOMContentLoaded', wrapMapSafety, { once: true });
    document.addEventListener("DOMContentLoaded", readyUI, { once: true });
  } else {
    readyUI();
  }
})();
