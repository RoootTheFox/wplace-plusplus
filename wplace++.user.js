// ==UserScript==
// @name         wPlace++
// @namespace    https://rooot.gay
// @version      0.0.6
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
    if (dbg && !window.mk_enable_dbg) return;
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

/// START OF ACTUAL USERSCRIPT ///
(function() {
    const usw = unsafeWindow;

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

    usw._meow_ui = false;

    // in global context for now
    usw.setTheme = function setTheme(theme) {
        localStorage.setItem("meow_theme", theme);
        unsafeWindow.location.reload();
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

    /// FIXES BELOW ///
    usw.patches_orig = {};

    // hook fetch :3
    usw.patches_orig.fetch = usw.fetch;
    usw.originalFetch = window.fetch; // different context
    usw.sexfetch = window.fetch; // different context
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

    /*setInterval(() => {
        usw.fetch = patchedFetch;
        window.fetch = patchedFetch;
    }, 100); // insanely hacky but oh well. shouldn't cause a performance hit*/

    setTimeout(function() {
        mk_log("inf", "WAAAAAAAAAAAAAAAAAA")

        // find sidebar. todo: make this code run right after this loaded in
        let left_sidebar = document.querySelector(".absolute.left-2.top-2.z-30.flex.flex-col.gap-3")
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

        // close UI on ESC
        document.body.addEventListener('keydown', function(e) {
            if (e.key == "Escape") {
                usw._meow_ui = false;
                mk_update_visibility();
            }
        });

        // sparkles icon
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" style="scale:.75" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 16v4M6 4v4m1 10H3M8 6H4m9-2 1.7528 4.4444c.1879.4764.2819.7147.4258.9155.1275.1781.2834.334.4615.4615.2008.1439.4391.2379.9155.4258L21 12l-4.4444 1.7528c-.4764.1879-.7147.2819-.9155.4258a1.9976 1.9976 0 0 0-.4615.4615c-.1439.2008-.2379.4391-.4258.9155L13 20l-1.7528-4.4444c-.1879-.4764-.2819-.7147-.4258-.9155a1.9976 1.9976 0 0 0-.4615-.4615c-.2008-.1439-.439-.2379-.9155-.4258L5 12l4.4444-1.7528c.4764-.1879.7147-.2819.9155-.4258a1.9987 1.9987 0 0 0 .4615-.4615c.1439-.2008.2379-.439.4258-.9155L13 4Z"/></svg>`;
        button.innerHTML = svg;

        // build the UI (this will be hidden by default)
        let meow_menu = document.createElement("div");
        meow_menu.id = "mk_menu";
        meow_menu.style.display = "none";
        document.body.appendChild(meow_menu);

        let meow_menu_title = document.createElement("h3");
        meow_menu_title.className = "mk_menu-title";
        meow_menu_title.innerText = "wPlace++ v0.0.6";
        meow_menu.appendChild(meow_menu_title);

        let cat_wplace = mk_menu_create_category("wplace");
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

        mk_menu_create_button(cat_other_scripts, "toggle Blue Marble visibility", function () {
            mk_log("inf", "toggling bluemarble!");
            let bm = document.getElementById("bm-n");
            if (bm == undefined) {
                mk_log("err", "bluemarble not found!");
                return;
            }

            if (bm.classList.contains("meow_menu_hidden")) {
                mk_log("dbg", "showing bm!");
                bm.classList.remove("meow_menu_hidden");
            } else {
                mk_log("dbg", "hiding bm!");
                bm.classList.add("meow_menu_hidden");
            }
        });

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

/* bluemarble support */
.meow_menu_hidden { display: none; width: 0px; height: 0px; }
`;
        document.body.appendChild(style);

    }, 2000); // todo make this better lmao
})();
