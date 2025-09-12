// ==UserScript==
// @name         wPlace Tile Fetcher
// @namespace    https://example.com
// @version      0.15.0
// @description  Captures wPlace fetch GET requests matching /s0/pixel/tileX/tileY?x=posX&y=posY, extracts coordinates, stitches tiles, outputs base64 image, mimics BlueMarble.
// @author       Grok
// @match        https://wplace.live/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wplace.live
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const usw = unsafeWindow;

  // Logging utility
  function log(level, ...args) {
    try {
      let color = "black";
      switch (level) {
        case "error": color = "red"; break;
        case "info": color = "lime"; break;
        case "warn": color = "yellow"; break;
        case "debug": color = "orange"; break;
      }
      console.log(`%c[wPlaceTileFetcher] %c[${level}]`, "color:purple", `color:${color}`, ...args);
    } catch (_) {
      // Prevent logging errors from breaking the script
    }
  }

  // Constants
  const LEFT_SIDEBAR_SELECTOR = ".absolute.left-2.top-2.z-30.flex.flex-col.gap-3";
  const LS_KEYS = {
    UI_OPEN: "tile_fetcher_ui_open",
  };
  const TILE_SIZE = 1000; // wplace.live tile size (1000x1000 pixels)

  // State
  let isSelecting = false;
  let points = []; // [posX, posY, tileX, tileY]
  let lastCapturedCoords = null; // Store latest captured coordinates
  usw._tile_fetcher_ui = localStorage.getItem(LS_KEYS.UI_OPEN) === "true";

  // Override fetch to capture coordinate URLs
  function overrideFetch() {
    const originalFetch = window.fetch;
    window.fetch = async function (resource, init = {}) {
      const url = typeof resource === 'string' ? resource : resource.url;

      if (init.method === 'GET' || !init.method) {
        const match = url.match(/https:\/\/backend\.wplace\.live\/s0\/pixel\/(\d+)\/(\d+)\?x=(\d+)&y=(\d+)/);
        if (match) {
          const [, tileX, tileY, posX, posY] = match.map(Number);
          log("info", `Captured coordinates from URL: Tile(${tileX},${tileY}) Pixel(${posX},${posY})`);
          lastCapturedCoords = [posX, posY, tileX, tileY];
        }
      }

      return originalFetch.apply(this, arguments);
    };
    unsafeWindow.fetch = window.fetch;
  }

  // Override XMLHttpRequest to capture coordinate URLs
  function overrideXHR() {
    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function (method, url) {
      if (method === 'GET' && typeof url === 'string') {
        const match = url.match(/https:\/\/backend\.wplace\.live\/s0\/pixel\/(\d+)\/(\d+)\?x=(\d+)&y=(\d+)/);
        if (match) {
          const [, tileX, tileY, posX, posY] = match.map(Number);
          log("info", `Captured coordinates from XHR: Tile(${tileX},${tileY}) Pixel(${posX},${posY})`);
          lastCapturedCoords = [posX, posY, tileX, tileY];
        }
      }
      return originalXHR.apply(this, arguments);
    };
    unsafeWindow.XMLHttpRequest.prototype.open = window.XMLHttpRequest.prototype.open;
  }

  // Call overrides initially
  overrideFetch();
  overrideXHR();

  // Periodically re-override in case the app overrides them
  setInterval(() => {
    overrideFetch();
    overrideXHR();
  }, 1000);

  // Update UI visibility
  function updateVisibility() {
    const menu = document.getElementById("tile_fetcher_menu");
    const btn = document.getElementById("tile_fetcher_btn");
    if (!menu || !btn) return;

    if (usw._tile_fetcher_ui) {
      menu.style.display = "block";
      menu.style.pointerEvents = "auto";
    } else {
      menu.style.display = "none";
      menu.style.pointerEvents = "none";
    }
  }

  // Set UI open state
  function setUIOpen(state) {
    usw._tile_fetcher_ui = !!state;
    localStorage.setItem(LS_KEYS.UI_OPEN, usw._tile_fetcher_ui ? "true" : "false");
    updateVisibility();
  }

  // Update point display
  function updatePointDisplay() {
    const point1El = document.getElementById("tile_fetcher_point1");
    const point2El = document.getElementById("tile_fetcher_point2");
    if (!point1El || !point2El) return;

    point1El.textContent = points[0]
      ? `Point 1: Tile(${points[0][2]},${points[0][3]}) Pixel(${points[0][0]},${points[0][1]})`
      : "Point 1: Not selected";
    point2El.textContent = points[1]
      ? `Point 2: Tile(${points[1][2]},${points[1][3]}) Pixel(${points[1][0]},${points[1][1]})`
      : "Point 2: Not selected";
  }

  // Create menu category
  function createCategory(name) {
    const cat = document.createElement("div");
    cat.className = "tile_fetcher_category";
    const title = document.createElement("h3");
    title.textContent = name;
    title.className = "tile_fetcher_category-title";
    cat.appendChild(title);
    const content = document.createElement("div");
    content.className = "tile_fetcher_category-content";
    cat.appendChild(content);
    cat.content = content;
    document.getElementById("tile_fetcher_menu").appendChild(cat);
    return cat;
  }

  // Create button
  function createButton(category, title, onclick) {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("btn");
    button.textContent = title;
    button.addEventListener("click", () => onclick(button));
    category.content.appendChild(button);
    return button;
  }

  // Create the main button with SVG icon
  function createMainButton() {
    if (document.getElementById("tile_fetcher_btn")) return;
    const left = document.querySelector(LEFT_SIDEBAR_SELECTOR);
    if (!left) return; // Wait until sidebar exists

    log("info", "Creating tile fetcher button");
    const container = document.createElement("div");
    container.classList.add("max-sm");
    left.appendChild(container);

    const button = document.createElement("button");
    button.classList.add("btn", "btn-sm", "btn-circle");
    button.id = "tile_fetcher_btn";
    button.title = "wPlace Tile Fetcher";
    button.addEventListener("click", () => setUIOpen(!usw._tile_fetcher_ui));
    container.appendChild(button);

    // SVG icon
    button.innerHTML = `<svg fill="currentColor" style="scale:.75" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19 14h-2v3h-3v2h3v3h2v-3h3v-2h-3zM4 19h3v-2H5v-2H3v3a1 1 0 0 0 1 1zM19 4a1 1 0 0 0-1-1h-3v2h2v2h2V4zM5 5h2V3H4a1 1 0 0 0-1 1v3h2V5zM3 9h2v4H3zm14 0h2v3h-2zM9 3h4v2H9zm0 14h3v2H9z"/></svg>`;
  }

  // Get coordinates from captured fetch
  async function fetchCoordinates() {
    if (!lastCapturedCoords) {
      log("error", "No coordinates captured from fetch requests");
      return null;
    }

    const [posX, posY, tileX, tileY] = lastCapturedCoords;
    log("debug", `Using captured coordinates: Tile(${tileX},${tileY}) Pixel(${posX},${posY})`);
    return lastCapturedCoords;
  }

  // Fetch and process tiles
  async function fetchAndStitchTiles(openInNewTab = false) {
    if (points.length !== 2) {
      log("error", "Please select exactly two points.");
      alert("Please select two points by clicking on the map.");
      return;
    }

    const [[x1, y1, tileX1, tileY1], [x2, y2, tileX2, tileY2]] = points;
    log("info", `Processing tiles from (${tileX1},${tileY1}) to (${tileX2},${tileY2}) with crop points (${x1},${y1}) and (${x2},${y2})`);

    // Compute absolute pixel coordinates for both points
    const absStartX = tileX1 * TILE_SIZE + x1;
    const absStartY = tileY1 * TILE_SIZE + y1;
    const absEndX   = tileX2 * TILE_SIZE + x2;
    const absEndY   = tileY2 * TILE_SIZE + y2;

    // Ensure correct ordering (start may be to the right/below end)
    const minAbsX = Math.min(absStartX, absEndX);
    const maxAbsX = Math.max(absStartX, absEndX);
    const minAbsY = Math.min(absStartY, absEndY);
    const maxAbsY = Math.max(absStartY, absEndY);

    // Determine tile ranges to fetch
    const minTileX = Math.floor(minAbsX / TILE_SIZE);
    const maxTileX = Math.floor((maxAbsX) / TILE_SIZE);
    const minTileY = Math.floor(minAbsY / TILE_SIZE);
    const maxTileY = Math.floor((maxAbsY) / TILE_SIZE);

    // Output dimensions
    const width = maxAbsX - minAbsX;
    const height = maxAbsY - minAbsY;

    // Safety checks
    if (width <= 0 || height <= 0) {
      log("error", "Computed width/height invalid", width, height);
      alert("Invalid selection region. Make sure you picked two different points.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    try {
      // Fetch and draw tiles
      for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
        for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
          const url = `https://backend.wplace.live/files/s0/tiles/${tileX}/${tileY}.png`;
          log("debug", `Fetching tile: ${url}`);
          const img = new Image();
          img.crossOrigin = "Anonymous";
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = () => {
              log("warn", `Failed to load tile: ${url}`);
              resolve(); // Continue with other tiles
            };
            img.src = url;
          });

          if (!img.complete || img.naturalWidth === 0) continue;

          // Absolute top-left of this tile in global pixels
          const tileAbsX = tileX * TILE_SIZE;
          const tileAbsY = tileY * TILE_SIZE;

          // Compute intersection of tile with requested crop in absolute coords
          const intersectLeft   = Math.max(minAbsX, tileAbsX);
          const intersectTop    = Math.max(minAbsY, tileAbsY);
          const intersectRight  = Math.min(maxAbsX, tileAbsX + TILE_SIZE);
          const intersectBottom = Math.min(maxAbsY, tileAbsY + TILE_SIZE);

          const srcX = intersectLeft - tileAbsX;
          const srcY = intersectTop  - tileAbsY;
          const srcW = intersectRight - intersectLeft;
          const srcH = intersectBottom - intersectTop;

          if (srcW <= 0 || srcH <= 0) continue;

          // Destination on canvas (relative to minAbsX/minAbsY)
          const destX = intersectLeft - minAbsX;
          const destY = intersectTop  - minAbsY;

          ctx.drawImage(img, srcX, srcY, srcW, srcH, destX, destY, srcW, srcH);
        }
      }

      // Convert to base64 and handle output
      const base64 = canvas.toDataURL("image/png");
      console.log("Base64 length:", base64.length, "Base64 preview:", base64.substring(0, 50));
      if (!base64.startsWith("data:image/png;base64,") || base64.length < 100) {
        log("error", "Base64 is empty or invalid");
        alert("Failed to generate image: Canvas is empty or invalid.");
        return;
      }
      log("info", "Image generated successfully");
      if (openInNewTab) {
        const newWindow = window.open("", "_blank");
        if (newWindow) {
            newWindow.document.write(`<html style="height: 100%;"><head><meta name="viewport" content="width=device-width, minimum-scale=0.1"><title>stitched.png (${width}×${height})</title></head><body style="margin: 0px; height: 100%; background-color: rgb(14, 14, 14);"><img style="display: block;-webkit-user-select: none;margin: auto;background-color: hsl(0, 0%, 90%);transition: background-color 300ms;" src="${base64}" width="${width}"></body></html>`);
            newWindow.document.close();
          } else {
            log("error", "Failed to open new tab, possible popup blocker");
            alert("Cannot open new tab. Please allow popups or try downloading instead.");
        }
      } else {
        const link = document.createElement("a");
        link.href = base64;
        link.download = "stitched.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (e) {
      log("error", "Failed to process tiles", e);
      alert("Error processing tiles: " + (e && e.message ? e.message : e));
    }
  }

  // Map click handler for point selection
  async function mapClickHandler(e) {
    if (points.length >= 2) {
      log("info", "Two points already selected");
      return;
    }

    // Reset lastCapturedCoords before click
    lastCapturedCoords = null;

    // Wait briefly for fetch to occur
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const coords = await fetchCoordinates();
    if (!coords) {
      log("error", "No coordinates captured for click");
      return;
    }

    points.push(coords);
    log("info", `Selected point: (${coords[0]},${coords[1]}) on tile (${coords[2]},${coords[3]})`);
    updatePointDisplay();

    if (points.length === 2) {
      log("info", "Two points selected, ready to process");
      usw._map.off("click", mapClickHandler);
      const selectBtn = document.querySelector("#tile_fetcher_menu .btn:nth-child(1)");
      if (selectBtn) selectBtn.textContent = "Select Points";
      isSelecting = false;
    }
  }

  // Inject UI
  function injectUI() {
    log("info", "Injecting UI");

    createMainButton();

    // ESC closes menu
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        setUIOpen(false);
        isSelecting = false;
        points = [];
        if (usw._map) usw._map.off("click", mapClickHandler);
        updatePointDisplay();
      }
    }, { capture: true });

    // Build panel
    if (!document.getElementById("tile_fetcher_menu")) {
      const menu = document.createElement("div");
      menu.id = "tile_fetcher_menu";
      menu.style.display = "none";
      document.body.appendChild(menu);

      const title = document.createElement("h3");
      title.className = "tile_fetcher_menu-title";
      title.textContent = "wPlace Tile Fetcher";
      menu.appendChild(title);

      const cat_main = createCategory("Tile Fetcher");

      // Point display
      const point1Display = document.createElement("div");
      point1Display.id = "tile_fetcher_point1";
      point1Display.textContent = "Point 1: Not selected";
      point1Display.style.margin = "8px";
      cat_main.content.appendChild(point1Display);

      const point2Display = document.createElement("div");
      point2Display.id = "tile_fetcher_point2";
      point2Display.textContent = "Point 2: Not selected";
      point2Display.style.margin = "8px";
      cat_main.content.appendChild(point2Display);

      // Select Points button
      createButton(cat_main, "Select Points", (btn) => {
        if (!usw._map) {
          log("error", "Map not available");
          alert("Map not available. Please wait for the map to load.");
          return;
        }
        isSelecting = !isSelecting;
        points = [];
        updatePointDisplay();
        btn.textContent = isSelecting ? "Stop Selecting" : "Select Points";
        if (isSelecting) {
          log("info", "Started point selection");
          usw._map.on("click", mapClickHandler);
        } else {
          log("info", "Stopped point selection");
          usw._map.off("click", mapClickHandler);
        }
      });

      // Process Tiles (Download) button
      createButton(cat_main, "Process Tiles (Download)", () => {
        fetchAndStitchTiles(false);
      });

      // Process Tiles (New Tab) button
      createButton(cat_main, "Process Tiles (New Tab)", () => {
        fetchAndStitchTiles(true);
      });

      // Close button
      createButton(cat_main, "Close", () => setUIOpen(false));

      // CSS for the panel
      const style = document.createElement("style");
      style.textContent = `
:root {
  --tf-accent: #f5c2e7;
  --tf-crust: rgb(17,17,27);
  --tf-mantle: #181825;
  --tf-base: #1e1e2e;
  --tf-text: #cdd6f4;
  --tf-surface: #313244;
  --tf-padding: 12px;
}

#tile_fetcher_menu {
  position: fixed;
  right: 10px;
  top: 60px;
  width: 300px;
  max-height: 80vh;
  overflow-y: auto;
  background-color: rgba(17,17,27,0.95);
  backdrop-filter: blur(6px);
  border-radius: 12px;
  z-index: 10000;
  display: none;
  color: var(--tf-text);
}

#tile_fetcher_menu.hidden {
  display: none !important;
}

.tile_fetcher_menu-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--tf-accent);
  margin: 6px 8px 10px 8px;
}

.tile_fetcher_category {
  backdrop-filter: blur(4px);
  padding: 8px 10px;
  border-radius: 12px;
  background-color: rgba(17,17,27,0.6);
  margin: 8px;
}

.tile_fetcher_category-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--tf-accent);
  margin-bottom: 6px;
}

.tile_fetcher_category-content .btn {
  margin-right: 8px;
  margin-top: 6px;
}

#tile_fetcher_menu[style*="display: none"] {
  pointer-events: none !important;
}

#tile_fetcher_point1, #tile_fetcher_point2 {
  font-size: 14px;
  color: var(--tf-text);
}
`;
      document.body.appendChild(style);
    }

    updateVisibility();
    updatePointDisplay();

    // Guard against button removal
    let guardTimer = null;
    const guard = () => {
      if (document.getElementById("tile_fetcher_btn")) return;
      createMainButton();
    };
    guardTimer = setInterval(guard, 1500);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        clearInterval(guardTimer);
        guardTimer = null;
      } else if (!guardTimer) {
        guardTimer = setInterval(guard, 1500);
      }
    });
  }

  // Wait for sidebar and initialize
  function readyUI() {
    if (document.querySelector(LEFT_SIDEBAR_SELECTOR)) {
      log("info", "Injecting UI immediately");
      injectUI();
      return;
    }
    log("info", "Waiting for UI…");
    const obs = new MutationObserver(() => {
      if (document.querySelector(LEFT_SIDEBAR_SELECTOR)) {
        obs.disconnect();
        injectUI();
      }
    });
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });

    // Fallback
    let tries = 0;
    const iv = setInterval(() => {
      if (document.querySelector(LEFT_SIDEBAR_SELECTOR)) {
        clearInterval(iv);
        injectUI();
      } else if (++tries > 300) {
        clearInterval(iv);
        log("warn", "UI anchor not found; giving up");
      }
    }, 100);
  }

  // Start
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", readyUI, { once: true });
  } else {
    readyUI();
  }
})();
