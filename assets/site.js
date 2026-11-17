(function () {
  "use strict";

  // Home shows the top game + up to 8 more; the All games page only earns a link past that.
  var HOME_MAX = 9;
  var SORT_MIN = 6;
  var PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.2v13.6c0 .8.9 1.3 1.6.8l10-6.8c.6-.4.6-1.2 0-1.6l-10-6.8C8.9 3.9 8 4.4 8 5.2z"/></svg>';

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function short(n) {
    if (n < 1000) return String(n);
    var units = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
    for (var i = 0; i < units.length; i++) {
      if (n >= units[i][0]) {
        var v = Math.floor((n / units[i][0]) * 10) / 10;
        return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)) + units[i][1];
      }
    }
  }
  function full(n) { return Number(n).toLocaleString("en-US"); }
  function monthYear(iso) { return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" }); }
  function stamp(iso) { return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function reduced() { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

  function loadData() {
    if (window.SITE_DATA) return Promise.resolve(window.SITE_DATA);
    return fetch("data/games.json", { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  // games.roblox.com sends no CORS header, so a page on GitHub Pages cannot read it.
  // games.roproxy.com returns the same /v1/games JSON (playing, visits, favoritedCount)
  // with Access-Control-Allow-Origin: *. One request covers every game. On failure
  // the page keeps the counts stored in data/games.js.
  var STATS_URL = "https://games.roproxy.com/v1/games?universeIds=";
  var STATS_TIMEOUT = 6000;

  function asNumber(v) {
    if (typeof v === "string" && v.trim() !== "") v = Number(v);
    return typeof v === "number" && isFinite(v) ? v : null;
  }
  function sumOf(games, key) {
    var n = 0;
    for (var i = 0; i < games.length; i++) n += games[i][key] || 0;
    return n;
  }
  function statsLine(data) {
    if (data.statsLive) return "Playing, visits and favorites from Roblox at " + stamp(data.statsFetchedAt) + ".";
    if (data.updatedAt) return "Saved playing, visits and favorites from " + stamp(data.updatedAt) + ". Live counts did not load.";
    return "Saved playing, visits and favorites. Live counts did not load.";
  }
  function fetchStatsChunk(ids) {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer;
    var timed = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        if (ctrl) ctrl.abort();
        reject(new Error("stats timeout"));
      }, STATS_TIMEOUT);
    });
    var opts = { cache: "no-store" };
    if (ctrl) opts.signal = ctrl.signal;
    var req = fetch(STATS_URL + ids.join(","), opts).then(function (r) {
      if (!r.ok) throw new Error("stats HTTP " + r.status);
      return r.json();
    }).then(function (body) {
      if (!body || !Array.isArray(body.data)) throw new Error("stats payload");
      return body.data;
    });
    req.then(function () { clearTimeout(timer); }, function () { clearTimeout(timer); });
    timed.catch(function () {});
    return Promise.race([req, timed]);
  }
  function fetchStats(ids) {
    var chunks = [];
    for (var i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
    return Promise.all(chunks.map(fetchStatsChunk)).then(function (lists) {
      var rows = [];
      lists.forEach(function (list) { rows = rows.concat(list); });
      return rows;
    });
  }
  function applyStats(data, rows) {
    var byId = {};
    rows.forEach(function (d) { if (d && d.id != null) byId[String(d.id)] = d; });
    var games = (data.games || []).map(function (g) { return Object.assign({}, g); });
    var matched = 0;
    games.forEach(function (g) {
      var d = byId[String(g.id)];
      if (!d) return;
      var playing = asNumber(d.playing), visits = asNumber(d.visits), favorites = asNumber(d.favoritedCount);
      if (playing == null || visits == null || favorites == null) return;
      g.playing = playing;
      g.visits = visits;
      g.favorites = favorites;
      matched++;
    });
    if (!games.length || matched !== games.length) throw new Error("stats missed a game");
    games.sort(function (a, b) { return b.playing - a.playing || b.visits - a.visits; });
    return Object.assign({}, data, {
      games: games,
      totals: Object.assign({}, data.totals, {
        games: games.length,
        playing: sumOf(games, "playing"),
        visits: sumOf(games, "visits"),
        favorites: sumOf(games, "favorites")
      }),
      statsLive: true,
      statsFetchedAt: new Date().toISOString()
    });
  }
  function withLiveStats(data) {
    var ids = (data.games || []).map(function (g) { return g.id; }).filter(function (id) { return id != null; });
    if (!ids.length || typeof fetch !== "function") return Promise.resolve(Object.assign({}, data, { statsLive: false }));
    return fetchStats(ids).then(function (rows) {
      return applyStats(data, rows);
    }).catch(function (err) {
      console.warn("Live Roblox stats did not load. Showing saved counts.", err);
      return Object.assign({}, data, { statsLive: false });
    });
  }

  /* ---------- broken images: Roblox image URLs expire after 180 days ---------- */
  document.addEventListener("error", function (e) {
    var img = e.target;
    if (!img || img.tagName !== "IMG") return;
    var fb = img.getAttribute("data-fallback");
    if (fb && img.src !== fb) { img.removeAttribute("data-fallback"); img.src = fb; return; }
    if (img.closest(".mosaic")) { img.remove(); return; }
    var thumb = img.closest(".spot-thumbs button");
    if (thumb) { thumb.remove(); return; }
    var box = img.closest(".game-img, .spot-main");
    if (box) { box.classList.add("img-missing"); img.remove(); return; }
    img.style.visibility = "hidden";
  }, true);

  /* ---------- nav ---------- */
  function initNav() {
    var nav = $(".nav"), btn = $(".menu-btn"), links = $(".nav-links");
    function onScroll() { nav.classList.toggle("solid", window.scrollY > 24); }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    if (!btn) return;
    function setOpen(open) {
      links.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
      btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
    btn.addEventListener("click", function () { setOpen(btn.getAttribute("aria-expanded") !== "true"); });
    links.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") { setOpen(false); btn.focus(); }
    });
  }
  function navLink(key, show) {
    var a = $('[data-nav="' + key + '"]');
    if (a) a.hidden = !show;
  }

  function gameCard(g, level) {
    var h = "h" + (level || 3);
    var img = g.thumbnail || g.icon;
    return '<a class="game" href="' + esc(g.url) + '" target="_blank" rel="noopener">' +
      '<div class="game-img" data-name="' + esc(g.name) + '">' +
        (img ? '<img src="' + esc(img) + '"' + (g.icon && g.icon !== img ? ' data-fallback="' + esc(g.icon) + '"' : "") + ' alt="" width="768" height="432" loading="lazy" decoding="async">' : "") +
      "</div>" +
      '<div class="game-body">' +
        (g.icon ? '<img class="game-icon" src="' + esc(g.icon) + '" alt="" width="56" height="56" loading="lazy" decoding="async">' : "") +
        "<" + h + ">" + esc(g.name) + '<span class="sr-only"> (opens on Roblox)</span></' + h + ">" +
        '<div class="game-genre">' + esc(g.genre && g.genre !== "All" ? g.genre : "Roblox experience") + "</div>" +
        '<p class="game-stats"><span><b>' + full(g.playing) + "</b> playing</span><span><b>" + short(g.visits) + "</b> visits</span><span><b>" + short(g.favorites) + "</b> favorites</span></p>" +
      "</div></a>";
  }

  function fillYear() {
    var y = $("[data-year]");
    if (y) y.textContent = new Date().getFullYear();
  }

  /* ---------- contact (static in HTML, data only adds the group list) ---------- */
  function initCopy() {
    var copyBtn = $("[data-copy]"), status = $("[data-copy-status]");
    if (!copyBtn) return;
    copyBtn.addEventListener("click", function () {
      var name = copyBtn.getAttribute("data-copy");
      var done = function () { status.textContent = "Copied " + name + ". Add it as a friend in Discord."; };
      var legacy = function () {
        var ta = document.createElement("textarea"), ok = false;
        ta.value = name; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        ta.remove();
        if (ok) done(); else status.textContent = "Could not copy. The username is " + name + ".";
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(name).then(done, legacy);
      else legacy();
    });
  }
  function renderContact(data) {
    var c = data.contact || {};
    if (c.discord) {
      $("[data-dc-user]").textContent = c.discord;
      $("[data-copy]").setAttribute("data-copy", c.discord);
    }
    if (c.discordInvite) $("[data-dc-invite]").href = c.discordInvite;
    var groups = (data.groups || []).filter(function (g) { return g.members >= 50; }).sort(function (a, b) { return b.members - a.members; });
    if (groups.length) {
      $("[data-groups]").innerHTML = groups.map(function (g) {
        return '<li><a href="' + esc(g.url) + '" target="_blank" rel="noopener"><span class="g-name">' + esc(g.name) + '<span class="sr-only"> (opens on Roblox)</span></span><span class="g-count">' + full(g.members) + " members</span></a></li>";
      }).join("");
    }
  }

  /* ---------- home ---------- */
  function buildMosaic(games) {
    var pics = [];
    games.forEach(function (g) { (g.gallery && g.gallery.length ? g.gallery : [g.thumbnail]).forEach(function (u) { if (u) pics.push(u); }); });
    var host = $(".mosaic");
    if (!host || !pics.length) return;
    // Moving reel: 7 columns x 9 pictures (one period, longer than the hero plus the 9deg tilt, also on a
    // phone where the hero is about 1010px), written twice per column so the slide can loop without a seam
    var cols = 7, per = 9, html = "";
    for (var c = 0; c < cols; c++) {
      var col = [];
      for (var i = 0; i < per; i++) col.push(pics[(c * 3 + i * 5) % pics.length]);
      html += '<div class="mosaic-col">' + col.concat(col).map(function (u, k) {
        return '<img src="' + esc(u) + '" alt="" width="768" height="432" decoding="async"' + (k >= per ? ' loading="lazy"' : "") + ">";
      }).join("") + "</div>";
    }
    host.innerHTML = html;
    $$("img", host).forEach(function (img) {
      if (img.complete && img.naturalWidth) img.classList.add("ok");
      else img.addEventListener("load", function () { img.classList.add("ok"); }, { once: true });
    });
  }

  // The one counting moment on the page: draws the eye to the studio numbers once, on load
  function countUp(el, target, format) {
    if (reduced() || target < 10) { el.textContent = format(target); return; }
    var t0 = null, dur = 1000;
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = format(Math.round(target * e));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function renderHome(data) {
    var games = (data.games || []).slice();
    var t = data.totals || {};
    var top = games[0];
    var rest = games.slice(1, HOME_MAX);
    var many = games.length > HOME_MAX;
    buildMosaic(games);
    renderContact(data);

    $("[data-hero-actions]").innerHTML = top
      ? '<a class="btn btn-main" href="' + esc(top.url) + '" target="_blank" rel="noopener">' + PLAY + "Play " + esc(top.name) + "</a>" +
        (rest.length ? '<a class="btn btn-line" href="#games">See the other ' + (games.length - 1 === 1 ? "game" : (games.length - 1) + " games") + "</a>" : "")
      : '<a class="btn btn-main" href="#hangout">Follow the studio</a>';

    var fresh = data.statsLive === true;
    var playingLabel = $("[data-playing-label]");
    if (playingLabel) playingLabel.textContent = fresh ? "Playing now" : "Playing";
    var fetched = $("[data-fetched]");
    if (fetched) fetched.textContent = statsLine(data);

    [["playing", t.playing || 0, full], ["visits", t.visits || 0, short], ["favorites", t.favorites || 0, short], ["members", t.members || 0, short]]
      .forEach(function (n) { var el = $('[data-num="' + n[0] + '"]'); if (el) countUp(el, n[1], n[2]); });

    // Top game: most players online, or most visits when nobody is on
    if (!top) {
      $("#spotlight").hidden = true;
      navLink("spotlight", false);
    } else {
      var live = top.playing > 0;
      $("[data-spot-title]").textContent = live ? (fresh ? "Busiest right now" : "Busiest game") : "Most visited";
      $("[data-spot-sub]").textContent = live
        ? (fresh ? "The game with the most players online." : "The game that had the most players when these counts were saved.")
        : (fresh ? "Nobody is playing right now, so this is the game with the most visits." : "Nobody was playing when these counts were saved, so this is the game with the most visits.");
      var pics = (top.gallery && top.gallery.length ? top.gallery : [top.thumbnail]).filter(Boolean);
      var spot = $("[data-spot]");
      spot.innerHTML =
        '<div class="spot-media">' +
          '<div class="spot-main" data-name="' + esc(top.name) + '"><img src="' + esc(pics[0] || top.icon) + '" alt="Screenshot of ' + esc(top.name) + '" width="768" height="432"' + (top.icon ? ' data-fallback="' + esc(top.icon) + '"' : "") + "></div>" +
          (pics.length > 1 ? '<div class="spot-thumbs" role="group" aria-label="Screenshots">' + pics.map(function (u, i) {
            return '<button type="button" aria-pressed="' + (i === 0) + '" aria-label="Show screenshot ' + (i + 1) + " of " + pics.length + '" data-src="' + esc(u) + '"><img src="' + esc(u) + '" alt="" width="96" height="54" loading="lazy"></button>';
          }).join("") + "</div>" : "") +
        "</div>" +
        '<div class="spot-info">' +
          (live ? '<p class="spot-live"><b>' + full(top.playing) + "</b> playing</p>" : "") +
          '<h3 class="display">' + esc(top.name) + "</h3>" +
          (top.description ? '<p class="spot-desc" lang="id">' + esc(top.description) + "</p>" : "") +
          '<p class="spot-facts"><span><b>' + full(top.visits) + "</b> visits</span><span><b>" + full(top.favorites) + "</b> favorites</span>" +
            (top.genre && top.genre !== "All" ? "<span>" + esc(top.genre) + "</span>" : "") + "</p>" +
          '<a class="btn btn-main" href="' + esc(top.url) + '" target="_blank" rel="noopener">' + PLAY + "Play on Roblox</a>" +
        "</div>";
      var main = $(".spot-main img", spot);
      $$(".spot-thumbs button", spot).forEach(function (b) {
        b.addEventListener("click", function () {
          $$(".spot-thumbs button", spot).forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
          b.setAttribute("aria-pressed", "true");
          if (!main) return;
          main.style.opacity = "0";
          setTimeout(function () { main.src = b.getAttribute("data-src"); main.style.opacity = "1"; }, 160);
        });
      });
    }

    if (!rest.length) {
      $("#games").hidden = true;
      navLink("games", false);
    } else {
      $("[data-games]").innerHTML = rest.map(function (g) { return gameCard(g, 3); }).join("");
      $("[data-more]").innerHTML = many ? '<a class="btn btn-line" href="games.html">See all ' + games.length + " games</a>" : "";
    }
    navLink("all", many);

    var byDate = games.filter(function (g) { return g.created; }).sort(function (a, b) { return a.created < b.created ? -1 : 1; });
    if (byDate.length) {
      var story = $("[data-story]"), first = byDate[0], last = byDate[byDate.length - 1];
      story.innerHTML = "The first public game went live in <b>" + monthYear(first.created) + "</b>" +
        (byDate.length > 1 ? ", and the newest one is <b>" + esc(last.name) + "</b>." : ".");
      story.hidden = false;
    }
  }

  function homeError(err) {
    console.error(err);
    var note = '<div class="note" style="grid-column:1/-1" role="alert"><b>The game list did not load.</b> Refresh the page, or <a href="https://www.roblox.com/communities/895905903" target="_blank" rel="noopener">open the studio group on Roblox</a>.</div>';
    $("[data-spot-sub]").textContent = "Something went wrong while loading games.";
    $("[data-spot]").outerHTML = note;
    $("#games").hidden = true;
    navLink("games", false);
    $$("[data-num]").forEach(function (el) { el.textContent = "?"; });
    var playingLabel = $("[data-playing-label]");
    if (playingLabel) playingLabel.textContent = "Playing";
    var fetched = $("[data-fetched]");
    if (fetched) fetched.textContent = "";
    $("[data-hero-actions]").innerHTML = '<a class="btn btn-main" href="#hangout">Contact the studio</a>';
  }

  /* ---------- games page ---------- */
  function renderAll(data) {
    var games = (data.games || []).slice();
    var grid = $("[data-all]");
    var sorts = {
      playing: function (a, b) { return b.playing - a.playing || b.visits - a.visits; },
      visits: function (a, b) { return b.visits - a.visits; },
      favorites: function (a, b) { return b.favorites - a.favorites; },
      newest: function (a, b) { return (b.created || "") < (a.created || "") ? -1 : 1; }
    };
    function draw(key) {
      if (!games.length) {
        grid.innerHTML = '<div class="note" style="grid-column:1/-1"><b>No public games right now.</b> The next one is in the works. <a href="index.html#hangout">Follow the studio</a> to hear when it is out.</div>';
        return;
      }
      grid.innerHTML = games.slice().sort(sorts[key]).map(function (g) { return gameCard(g, 2); }).join("");
    }
    var bar = $(".sortbar");
    bar.hidden = games.length < SORT_MIN;
    $$("button", bar).forEach(function (b) {
      b.addEventListener("click", function () {
        $$("button", bar).forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        draw(b.getAttribute("data-sort"));
      });
    });
    $("[data-count]").textContent = games.length === 1 ? "1 public game" : games.length + " public games";
    $("[data-updated]").textContent = statsLine(data);
    draw("playing");
  }

  function allError(err) {
    console.error(err);
    $("[data-count]").textContent = "Games";
    $("[data-all]").innerHTML = '<div class="note" style="grid-column:1/-1" role="alert"><b>The game list did not load.</b> Refresh the page, or <a href="https://www.roblox.com/communities/895905903" target="_blank" rel="noopener">open the studio group on Roblox</a>.</div>';
  }

  document.addEventListener("DOMContentLoaded", function () {
    initNav();
    fillYear();
    var page = document.body.getAttribute("data-page");
    if (page === "home") initCopy();
    loadData().then(withLiveStats).then(function (data) {
      if (page === "home") renderHome(data); else renderAll(data);
    }).catch(function (err) {
      if (page === "home") homeError(err); else allError(err);
    });
  });
})();
