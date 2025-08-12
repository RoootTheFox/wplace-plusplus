// ==UserScript==
// @name         random wplace fixes :3
// @namespace    https://rooot.gay
// @version      0.0.2
// @description  fixes the map not loading, and tries to evade cache a little
// @author       rooot
// @updateURL    https://gist.github.com/RoootTheFox/2a346d43ca9bb73b65a93ec07ebe2840/raw/be914e418b3d312a27f746af95ba17fe3402a695/wplace-fix.user.js
// @downloadURL  https://gist.github.com/RoootTheFox/2a346d43ca9bb73b65a93ec07ebe2840/raw/be914e418b3d312a27f746af95ba17fe3402a695/wplace-fix.user.js
// @match        https://wplace.live/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wplace.live
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    const usw = unsafeWindow;
    usw.patches_orig = {};

    // hook fetch :3
    usw.patches_orig.fetch = usw.fetch;
    let originalFetch = window.fetch; // different context
    let patchedFetch = async function(req, ...args) {
        let url;
        let reqIsString = typeof req == "string";
        if (reqIsString) {
            url = req;
        } else {
            url = req.url;
        }

        console.log("fetch called:", {
				req: req,
                url: url,
				args: args
			}/*, new Error().stack*/
		);

        let new_url = new URL(url);
        new_url.pathname = new_url.pathname.replace("/ ", "//"); // annoy cf cache a bit

        if (new_url.host == "maps.wplace.live" || new_url.host == "tiles.openfreemap.org") {
            new_url.host = "ofm.rooot.gay";
            console.debug("this request is now fetching from a different instance like a good girl >~<");
        }

        // replace with our "fixed" url
        if (reqIsString) {
            req = new_url.toString();
        } else {
            req = new Request(new_url.toString(), req);
        }

        // we use this fetch here because the original fetch on the unsafe Window (actual window) causes
        // illegal invokation on chrom(e|ium) - on ff its fine but oh well, this works.
        return originalFetch(req, ...args);
    };

    usw.fetch = patchedFetch;
    window.fetch = patchedFetch;

    setInterval(() => {
        usw.fetch = patchedFetch;
        window.fetch = patchedFetch;
    }, 100); // insanely hacky but oh well. shouldn't cause a performance hit
})();