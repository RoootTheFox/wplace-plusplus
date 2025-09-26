// ==UserScript==
// @name         wPlace++
// @namespace    https://rooot.gay
// @version      0.1.7
// @description  fixes the map not loading, and adds a couple other map related QoL features :3
// @author       rooot
// @updateURL    https://github.com/RoootTheFox/wplace-plusplus/raw/refs/heads/main/wplace++.user.js
// @downloadURL  https://github.com/RoootTheFox/wplace-plusplus/raw/refs/heads/main/wplace++.user.js
// @match        https://wplace.live/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wplace.live
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

// util funcs taken from another project of mine
function mk_log(level) {
    let c = "black";
    let dbg = false;
    switch (level) {
        case "err": c = "red"; break;
        case "inf": c = "lime"; break;
        case "wrn": c = "yellow"; break;
        case "dbg": c = "orange"; dbg = true; break;
    }
    if (dbg && !unsafeWindow.mk_enable_dbg) return;
    let base_stuff = ["%c[wplace++] %c[" + level + "]", "color: pink", "color: " + c];
    let stuff = [...base_stuff, ...arguments];
    stuff.splice(base_stuff.length, 1);
    console.log.apply("%c[wplace++]", stuff);
}

function mk_update_visibility() {
    mk_log("dbg", "updating visibility!");

    if (!document.getElementById("mk_menu")) {
        mk_log("err", "mk_update_visibility: menu MISSING");
        return;
    }
    let mk_menu = document.getElementById("mk_menu");
    if (!document.getElementById("mk_btn")) {
        mk_log("err", "mk_update_visibility: button MISSING");
        return;
    }
    let mk_btn = document.getElementById("mk_btn");
    if (unsafeWindow._meow_ui) {
        mk_log("dbg", "mk_update_visibility: menu open TRUE");
        mk_menu.style.display = "unset";
    } else {
        mk_log("dbg", "mk_update_html: menu open FALSE");
        mk_menu.style.display = "none";
    }
}

function mk_menu_create_category(name) {
    let cat = document.createElement("div");
    cat.className = "mk_menu_category";
    let cat_title = document.createElement("h4");
    cat_title.innerHTML = name;
    cat_title.className = "mk_menu_category-title";
    cat.appendChild(cat_title);
    let cat_content = document.createElement("div");
    cat_content.className = "mk_menu_category-content";
    cat.appendChild(cat_content);
    cat.content = cat_content; // ref for easy access :3c

    document.getElementById("mk_menu").appendChild(cat);
    return cat;
}
function mk_menu_create_button(category, title, onclick) {
    let button = document.createElement("button");
    button.classList.add("btn");
    button.innerHTML = title;
    button.onclick = () => { onclick(button) };
    category.content.appendChild(button);
    return button;
}

async function meowHash(text) {
    const ti = new TextEncoder();
    return text.length < 8192 ? Array.from(new Uint8Array(await window.crypto.subtle.digest("SHA-1", ti.encode(text)))).map((b) => b.toString(16).padStart(2, "0")).join("") : "wah";
}

/// START OF ACTUAL USERSCRIPT ///
(function() {
    const usw = unsafeWindow;

    const LEFT_SIDEBAR_SELECTOR = ".absolute.left-2.top-2.z-30.flex.flex-col.gap-3";

    // might add more audio soon :tm:
    const AUDIO_HASHES = {
        // paint
        "83645da1b9fb56c6ef7e237baee54ce182eb3147": {
            name: "plop",
            description: "plays every time you place a pixel"
        },
        // abort paint
        "95bda61d456f8ef526717c7dc6eecd4649da7a57": {
            name: "smallPlop",
            description: "plays when you abort painting"
        },
        "ac8b0b71a00e2fe42b4a1fa335d36c149d149d43": {
            name: "notification1",
            description: "plays when your charges are full"
        }
    };
    // theming stuff :3

    /// THEMES ARE DEFINED HERE ///
    usw._meow_themes = {
        "liberty": { // light, default theme
            path: "/styles/liberty"
        },
        "dark": { // dark, maybe hard to read
            path: "/styles/dark"
        },
        "bright": {
            path: "/styles/bright"
        },
        "positron": {
            path: "/styles/positron"
        },
        "fiord": {
            path: "/styles/fiord"
        }
    };

    usw._meow_ui_themes = {
        "default": {
            display: "default (light)"
        },
        "ctp-mocha": {
            display: "catppuccin mocha (dark) [beta]",
            css: `
    :root {
        --color-base-100: #1e1e2e;
        --color-base-content: white;
        --color-base-200: #181825;
        --color-base-300: #11111b;

        /* fix buttons looking janky */
        --fx-noise:;
    }
    [data-rich-colors="true"][data-sonner-toast][data-type="error"], [data-rich-colors="true"][data-sonner-toast][data-type="error"] [data-close-button] {
        /* popups/toasts */
        --error-bg: var(--color-base-100);
        --error-border: var(--color-base-100);
        --error-text: #f38ba8;
    }
            `
        }
    };

    usw._meow_ui = false;

    // in global context for now
    usw.setTheme = function setTheme(theme) {
        localStorage.setItem("meow_theme", theme);
        if (usw._map && usw._map.setStyle) {
            usw._map.setStyle("https://ofm.rooot.gay"+usw._meow_themes[theme].path);
            usw._map.fire("style.load");
        } else {
            usw.location.reload();
        }
    };

    function getTheme() {
        let current_theme_id = localStorage.getItem("meow_theme");
        if (current_theme_id == undefined) current_theme_id = "liberty"; // default theme

        // just in case, so we dont end up with an empty map!
        if (!usw._meow_themes.hasOwnProperty(current_theme_id)) {
            mk_log("err", "THEME "+current_theme_id+" DOES NOT EXIST! falling back to liberty");
            current_theme_id = "liberty";
        }

        let current_theme = usw._meow_themes[current_theme_id];
        current_theme.name = current_theme_id;
        return current_theme;
    }

    function getUITheme() {
        let current_theme_id = localStorage.getItem("meow_ui_theme");
        if (current_theme_id == undefined) current_theme_id = "default";

        if (!usw._meow_ui_themes.hasOwnProperty(current_theme_id)) {
            mk_log("err", "UI THEME "+current_theme_id+" DOES NOT EXIST! falling back to default");
            current_theme_id = "default";
        }

        let current_theme = usw._meow_ui_themes[current_theme_id];
        current_theme.name = current_theme_id;
        if (current_theme.css == undefined) current_theme.css = "";
        return current_theme;
    }

    usw.setUITheme = function setUITheme(theme) {
        localStorage.setItem("meow_ui_theme", theme);
        document.getElementById("meow_ui_theme").innerHTML = getUITheme().css;
    };

    usw.setMuted = function setMuted(audioName, mute) {
        let muted_audios = localStorage.getItem("meow_muted_audio");
        if (muted_audios == undefined) muted_audios = "";

        let muted = muted_audios.split(",");
        if (mute) {
            if (!muted.includes(audioName)) muted.push(audioName);
        } else {
            let i = muted.indexOf(audioName);
            muted.splice(i, 1);
        }

        localStorage.setItem("meow_muted_audio", muted);
    }

    function isMuted(audioName) {
        // putting an array into localStorage causes it to get converted into a string. grr >:c
        let muted_audios = localStorage.getItem("meow_muted_audio");
        if (muted_audios == undefined) muted_audios = "";

        return muted_audios.split(",").includes(audioName);
    }

    /// FIXES BELOW ///
    usw.patches_orig = {};

    // hook fetch :3
    usw.patches_orig.fetch = usw.fetch;
    usw.originalFetch = window.fetch; // different context
    let patchedFetch = async function(req, ...args) {
        let url;
        let req_is_string = typeof req == "string";
        if (req_is_string) {
            url = req;
        } else {
            url = req.url;
        }

        let new_url = new URL(url);
        let is_map_request = new_url.host == "maps.wplace.live" || new_url.host == "tiles.openfreemap.org";
        if (is_map_request) {
            new_url.host = "ofm.rooot.gay";
            mk_log("dbg", "this request is now fetching from a different instance like a good girl >~<");
        }

        let theme = getTheme();
        if (is_map_request && new_url.pathname == "/styles/liberty") {
            new_url.pathname = theme.path;
            new_url.host = theme.host == undefined ? new_url.host : theme.host;
        }

        new_url.pathname = new_url.pathname.replace("/ ", "//"); // annoy cf cache a bit

        // replace with our "fixed" url
        if (req_is_string) {
            req = new_url.toString();
        } else {
            req = new Request(new_url.toString(), req);
        }

        // if map loading breaks with Blue Marble, its most likely NOT skipping map requests
        if (usw.bmfetchPatch != undefined) { // blue marble compat ???
            mk_log("dbg", "ATTEMPTING BM COMPAT");
            return await usw.bmfetchPatch(usw.originalFetch, req, ...args);
        } else {
            // we use this fetch here because the original fetch on the unsafe Window (actual window) causes
            // illegal invokation on chrom(e|ium) - on ff its fine but oh well, this works.
            return usw.originalFetch(req, ...args);
        }
    };

    usw.fetch = patchedFetch;
    window.fetch = patchedFetch;

    // BM compat
    usw.fetchIsPatched = true;
    window.fetchIsPatched = true;

    // get map instance (thanks @cgytrus <3)
    usw.patches_orig.Promise = usw.Promise;
    let patchedPromise = class PawsomePromise extends Promise {
        constructor(exec) {
            super(exec);
            let xstr= exec.toString();
            if (xstr.includes("touchZoomRotate.disableRotation") || (xstr.includes("styledata") && exec_string.includes("poi_r20"))) {
                mk_log("inf", "caught map promise >:3c");
                this.then((map) => {
                    mk_log("inf", "map exposed !! >:3");
                    usw._map = map;
                    usw.Promise = usw.patches_orig.Promise;
                });
            }
        }
    }
    usw.Promise = patchedPromise;

    // patch audio play for 
    Audio.prototype.original_play = Audio.prototype.play;
    Audio.prototype.play = async function() {
        let hash = await meowHash(this.src)
        mk_log("dbg", "audio hash", hash);

        if (AUDIO_HASHES.hasOwnProperty(hash)) {
            if (!isMuted(AUDIO_HASHES[hash].name)) {
                return this.original_play();
            } else {
                return null;
            }
        } else {
            mk_log("wrn", "audio", hash, "is unknown (you can probably ignore this)");
            return this.original_play();
        }
    }

    /// load UI themes ///
    let ui_style = document.createElement("style");
    ui_style.id = "meow_ui_theme";
    ui_style.innerHTML = getUITheme().css;
    document.body.appendChild(ui_style);

    function createButton() {
        if (document.getElementById("mk_btn")) return;

        mk_log("inf", "creating button");
        let left_sidebar = document.querySelector(LEFT_SIDEBAR_SELECTOR)
        let button_container = document.createElement("div");
        button_container.classList.add("max-sm");
        left_sidebar.appendChild(button_container);

        let button = document.createElement("button");
        button.classList.add("btn", "btn-sm", "btn-circle");
        button.id = "mk_btn";
        button.onclick = () => {
            usw._meow_ui = !usw._meow_ui;
            mk_update_visibility();
        }
        button_container.appendChild(button);
        // sparkles icon
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" style="scale:.75" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 16v4M6 4v4m1 10H3M8 6H4m9-2 1.7528 4.4444c.1879.4764.2819.7147.4258.9155.1275.1781.2834.334.4615.4615.2008.1439.4391.2379.9155.4258L21 12l-4.4444 1.7528c-.4764.1879-.7147.2819-.9155.4258a1.9976 1.9976 0 0 0-.4615.4615c-.1439.2008-.2379.4391-.4258.9155L13 20l-1.7528-4.4444c-.1879-.4764-.2819-.7147-.4258-.9155a1.9976 1.9976 0 0 0-.4615-.4615c-.2008-.1439-.439-.2379-.9155-.4258L5 12l4.4444-1.7528c.4764-.1879.7147-.2819.9155-.4258a1.9987 1.9987 0 0 0 .4615-.4615c.1439-.2008.2379-.439.4258-.9155L13 4Z"/></svg>`;
        button.innerHTML = svg;
    }

    function injectUI() {
        mk_log("inf", "injecting ui bwawawa :3");

        createButton();

        // close UI on ESC
        document.body.addEventListener('keydown', function(e) {
            if (e.key == "Escape") {
                usw._meow_ui = false;
                mk_update_visibility();
            }
        });

        // build the UI (this will be hidden by default)
        let meow_menu = document.createElement("div");
        meow_menu.id = "mk_menu";
        meow_menu.style.display = "none";
        document.body.appendChild(meow_menu);

        let meow_menu_title = document.createElement("h3");
        meow_menu_title.className = "mk_menu-title";
        meow_menu_title.innerHTML = "wPlace++ " + "v0.1.7" + ' by <a class="mk_menu-dev" href="https://rooot.gay" target="_blank">rooot</a>';
        meow_menu.appendChild(meow_menu_title);

        let cat_wplace = mk_menu_create_category("wplace");
        let cat_audio = mk_menu_create_category("audio");
        let cat_other_scripts = mk_menu_create_category("other");
        let cat_misc = mk_menu_create_category("misc");

        // add theming settings :3
        let bwa = document.createElement("span");
        bwa.innerText = "set map theme: ";
        let meow_menu_themeselect = document.createElement("select");
        for (let theme of Object.keys(usw._meow_themes)) {
            console.log(theme);
            let theme_option = document.createElement("option")
            theme_option.value = theme;
            theme_option.innerText = theme;
            meow_menu_themeselect.appendChild(theme_option);
        }
        meow_menu_themeselect.onchange = (v) => { usw.setTheme(v.srcElement.value) };
        meow_menu_themeselect.value = getTheme().name; // make sure we have the current active theme selected
        cat_wplace.appendChild(bwa);
        cat_wplace.appendChild(meow_menu_themeselect);

        // ui themes
        let mrrp = document.createElement("br");
        cat_wplace.appendChild(mrrp);
        let bwaa = document.createElement("span");
        bwaa.innerText = "set ui theme: ";
        let meow_menu_ui_themeselect = document.createElement("select");
        for (let theme of Object.keys(usw._meow_ui_themes)) {
            console.log(theme);
            let theme_option = document.createElement("option")
            theme_option.value = theme;
            theme_option.innerText = usw._meow_ui_themes[theme].display;
            meow_menu_ui_themeselect.appendChild(theme_option);
        }
        meow_menu_ui_themeselect.onchange = (v) => { usw.setUITheme(v.srcElement.value) };
        meow_menu_ui_themeselect.value = getUITheme().name;
        cat_wplace.appendChild(bwaa);
        cat_wplace.appendChild(meow_menu_ui_themeselect);


        // audio/sfx muting
        function createSFXToggle(cat, sfx, desc) {
            let input = document.createElement("input");
            [input.id, input.name, input.type] = [`meow-sfx-${sfx}-toggle`, sfx, "checkbox"];
            if (isMuted(sfx)) input.checked = true;
            input.onchange = function(e) {
                let [sfx, state] = [e.target.name, e.target.checked];
                mk_log("inf", "setting sfx", sfx, "to mute state", state);
                setMuted(sfx, state);
            }

            let label = document.createElement("label");
            [label.for, label.innerText] = [input.id, ` ${sfx} - ${desc}`];
            cat.appendChild(input);
            cat.appendChild(label);
            cat.appendChild(document.createElement("br"));
        }

        let sfxMuteInfo = document.createElement("p");
        sfxMuteInfo.innerText = "mute sound effects: ";
        cat_audio.appendChild(sfxMuteInfo);
        for (let hash of Object.keys(AUDIO_HASHES)) {
            createSFXToggle(cat_audio, AUDIO_HASHES[hash].name, AUDIO_HASHES[hash].description);
        }

        function createElementToggleButton(cat, text, sel) {
            let lsKeyHidden = `meow_hideElement_${sel}`;
            let hideCss = `#${sel} { display: none !important; }`;
            let hider = document.createElement("style");
            [hider.id, hider.innerHTML] = [lsKeyHidden, hideCss];

            mk_menu_create_button(cat, text, function () {
                mk_log("inf", "toggling element!");
                if (document.getElementById(sel) == undefined) {
                    mk_log("err", "element not found!");
                    localStorage.setItem(lsKeyHidden, false);
                    return;
                }

                let existingHider = document.getElementById(lsKeyHidden);
                if (existingHider) {
                    mk_log("dbg", "showing element!");
                    existingHider.parentNode.removeChild(existingHider);
                    localStorage.setItem(lsKeyHidden, false);
                } else {
                    mk_log("dbg", "hiding element!");
                    document.body.appendChild(hider);
                    localStorage.setItem(lsKeyHidden, true);
                }
            });

            if (localStorage.getItem(lsKeyHidden) == "true") document.body.appendChild(hider);
        }

        createElementToggleButton(cat_other_scripts, "toggle Blue Marble visibility", "bm-n");
        createElementToggleButton(cat_other_scripts, "toggle Overlay Pro visibility", "overlay-pro-panel");

        mk_menu_create_button(cat_misc, "CLOSE THIS MENU", function () {
            mk_log("inf", "closing~");
            usw._meow_ui = false;
            mk_update_visibility();
        });

        /// INJECT MENU STYLESHEET INTO DOCUMENT ///
        let style = document.createElement("style");
        style.innerHTML = `
:root {
    --mk-accent: #f5c2e7;
    --mk-crust-raw: 17, 17, 27;
    --mk-crust: rgb(var(--mk-crust-raw));
    --mk-mantle: #181825;
    --mk-base: #1e1e2e;
    --mk-text: #cdd6f4;
    --mk-surface: #313244;

    --meow-padding: 12px;
}

/* yippie menu */
#mk_menu {
    position: fixed;
    width: 100vw;
    height: 100vh;
    top: 0;
    left: 0;
    padding-top: 6px;
    background-color: rgba(var(--mk-crust-raw), 0.5);
    backdrop-filter: blur(4px);

    z-index: 10000;
    color: var(--mk-text);
}

.mk_menu-title {
    font-size: x-large;
    font-weight: bold;
    color: var(--mk-accent);
    margin-left: var(--meow-padding);
}

.mk_menu-dev {
    color: var(--mk-accent);
    text-decoration: underline;
}

.mk_menu_category {
    backdrop-filter: blur(4px);
    padding-top: 8px;
    padding-bottom: 8px;
    padding-left: var(--meow-padding);
    border-radius: var(--meow-padding);
    background-color: rgba(var(--mk-crust-raw), 0.5);

    margin-bottom: 6px;
    margin-left: 6px;
    margin-right: 6px;
}

.mk_menu_category-title {
    font-size: large;
    font-weight: bold;
    color: var(--mk-accent);
}

/* fix wacky button */
.mk_menu_category-content button {
    margin-right: var(--meow-padding);
}
`;
        document.body.appendChild(style);

        // something *really* likes getting rid of our button
        setInterval(() => {
            createButton();
        }, 150);
    }

    if (document.querySelector(LEFT_SIDEBAR_SELECTOR)) {
        mk_log("inf", "injecting immediately, script loaded late?");
        
        injectUI();
    } else {
        mk_log("inf", "waiting for UI to load!!");

        let iv = setInterval(() => {
            mk_log("dbg", "paws");
            if (document.querySelector(LEFT_SIDEBAR_SELECTOR)) {
                clearInterval(iv);
                injectUI();
            }
        }, 100);
    }
})();
