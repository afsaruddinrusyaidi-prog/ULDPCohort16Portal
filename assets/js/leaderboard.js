/* ============================================================
   Leaderboard renderer
   Reads ULDP.API_URL (Apps Script JSON). Shape:
   {
     updated: "2026-07-23T22:05:00+08:00",
     standings: [
       { house:"visionaries", total:1240,
         categories:{ Community:520, Challenges:480, Spirit:240 } }, ...
     ],
     mvp: { visionaries:[{name:"...",points:85}, ...x3], ... }
   }
   Shows ONLY aggregates — never activities. Pre-launch => placeholder.
   Falls back to demo data if API_URL is empty (so layout is reviewable).
   ============================================================ */
(function () {
  var $ = function (s) { return document.querySelector(s); };

  var DEMO = {
    updated: new Date().toISOString(),
    standings: [
      { house: "builders",    total: 1180, categories: { Community: 480, Challenges: 460, Spirit: 240 } },
      { house: "visionaries", total: 1240, categories: { Community: 520, Challenges: 480, Spirit: 240 } },
      { house: "connectors",  total:  980, categories: { Community: 420, Challenges: 360, Spirit: 200 } },
      { house: "purpose",     total: 1050, categories: { Community: 410, Challenges: 430, Spirit: 210 } }
    ],
    mvp: {
      visionaries: [{ name: "—", points: 0 }, { name: "—", points: 0 }, { name: "—", points: 0 }],
      builders:    [{ name: "—", points: 0 }, { name: "—", points: 0 }, { name: "—", points: 0 }],
      purpose:     [{ name: "—", points: 0 }, { name: "—", points: 0 }, { name: "—", points: 0 }],
      connectors:  [{ name: "—", points: 0 }, { name: "—", points: 0 }, { name: "—", points: 0 }]
    }
  };

  // brighter line colours (match the site's house CSS vars) for the graph
  var CHART_COLORS = { visionaries: "#2742E0", builders: "#EE7A12", purpose: "#7C2FD6", connectors: "#0FA295" };

  function houseMeta(slug) {
    return ULDP.HOUSES.find(function (h) { return h.slug === slug; }) ||
           { name: slug, color: "#6B7080" };
  }

  function showLive() {
    var l = $("#lb-loading"), live = $("#lb-live");
    if (l) l.style.display = "none";
    if (live) live.style.display = "block";
  }

  function fmtDay(d) {
    try { var p = String(d).split("-"); return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("en-MY", { day: "numeric", month: "short" }); }
    catch (e) { return d; }
  }

  function renderChart(hist) {
    var wrap = $("#lb-graph-wrap"), host = $("#lb-chart");
    if (!host || !wrap) return;
    var days = (hist && hist.days) || [], series = (hist && hist.series) || {};
    if (!days.length) { wrap.style.display = "none"; return; }
    wrap.style.display = "block";

    var order = ["visionaries", "builders", "purpose", "connectors"];
    var W = 800, H = 360, pad = { l: 48, r: 18, t: 20, b: 46 }, n = days.length;
    var maxY = 1;
    order.forEach(function (h) { (series[h] || []).forEach(function (v) { if (v > maxY) maxY = v; }); });
    var stepBase = Math.pow(10, Math.floor(Math.log10(maxY)));
    maxY = Math.ceil(maxY / stepBase) * stepBase;
    function x(i) { return pad.l + (n <= 1 ? (W - pad.l - pad.r) / 2 : (i / (n - 1)) * (W - pad.l - pad.r)); }
    function y(v) { return H - pad.b - (v / maxY) * (H - pad.t - pad.b); }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="House points progression">';
    [0, 0.5, 1].forEach(function (f) {
      var v = maxY * f, yy = y(v);
      svg += '<line x1="' + pad.l + '" y1="' + yy + '" x2="' + (W - pad.r) + '" y2="' + yy + '" stroke="#E7E2D5" stroke-width="1"/>';
      svg += '<text x="' + (pad.l - 8) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="12" fill="#6E748A">' + Math.round(v) + '</text>';
    });
    svg += '<text x="' + pad.l + '" y="' + (H - pad.b + 22) + '" font-size="12" fill="#6E748A">' + fmtDay(days[0]) + '</text>';
    if (n > 1) svg += '<text x="' + (W - pad.r) + '" y="' + (H - pad.b + 22) + '" text-anchor="end" font-size="12" fill="#6E748A">' + fmtDay(days[n - 1]) + '</text>';
    order.forEach(function (h) {
      var data = series[h] || [], col = CHART_COLORS[h] || "#888";
      if (!data.length) return;
      if (n > 1) {
        var pts = data.map(function (v, i) { return x(i) + "," + y(v); }).join(" ");
        svg += '<polyline points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
      }
      data.forEach(function (v, i) { svg += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="' + (n > 1 ? 3.5 : 5) + '" fill="' + col + '"/>'; });
    });
    svg += '</svg>';
    var legend = '<div class="lb-legend2">' + order.map(function (h) {
      return '<span><i style="background:' + (CHART_COLORS[h]) + '"></i>' + houseMeta(h).name.replace("House of ", "") + '</span>';
    }).join("") + '</div>';
    host.innerHTML = svg + legend;
  }

  function loadHistory() {
    if (!ULDP.API_URL) return;
    var url = ULDP.API_URL + (ULDP.API_URL.indexOf("?") === -1 ? "?" : "&") + "feed=history";
    fetch(url, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (h) { if (h && h.days) renderChart(h); })   // old code returns no .days → chart stays hidden
      .catch(function () {});
  }

  function render(data) {
    showLive();
    var board = $("#lb-rows");
    if (!board) return;
    var rows = data.standings.slice().sort(function (a, b) { return b.total - a.total; });
    var max = Math.max.apply(null, rows.map(function (r) { return r.total; })) || 1;

    board.innerHTML = rows.map(function (r, i) {
      var meta = houseMeta(r.house);
      var segs = Object.keys(ULDP.CATEGORIES).map(function (cat) {
        var v = (r.categories && r.categories[cat]) || 0;
        var w = r.total ? (v / r.total * 100) : 0;
        return '<span style="width:' + w + '%;background:' + ULDP.CATEGORIES[cat] + '"></span>';
      }).join("");
      return '<div class="lb-row">' +
        '<div class="lb-rank r' + (i + 1) + '">' + (i + 1) + '</div>' +
        '<div class="lb-name" style="color:#fff">' + meta.name.replace("House of ", "") + '</div>' +
        '<div class="lb-track"><div class="lb-bar" data-w="' + (r.total / max * 100) + '">' + segs + '</div></div>' +
        '<div class="lb-pts">' + r.total.toLocaleString() + '</div>' +
        '</div>';
    }).join("");

    // animate bars after paint
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        board.querySelectorAll(".lb-bar").forEach(function (b) {
          b.style.width = b.dataset.w + "%";
        });
      });
    });

    // legend
    var lg = $("#lb-legend");
    if (lg) lg.innerHTML = Object.keys(ULDP.CATEGORIES).map(function (cat) {
      return '<span><i style="background:' + ULDP.CATEGORIES[cat] + '"></i>' + cat + '</span>';
    }).join("");

    // updated stamp
    var up = $("#lb-updated");
    if (up && data.updated) {
      up.textContent = "Last updated: " + new Date(data.updated).toLocaleString("en-MY", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
      });
    }

    // MVP
    var mvpWrap = $("#mvp-grid");
    if (mvpWrap && data.mvp) {
      mvpWrap.innerHTML = ULDP.HOUSES.map(function (h) {
        var list = (data.mvp[h.slug] || []).slice(0, 3);
        var lis = list.map(function (p) {
          return "<li><span>" + p.name + "</span><b>" + (p.points || 0) + "</b></li>";
        }).join("") || "<li><span>To be revealed</span><b>–</b></li>";
        return '<div class="mvp ' + h.slug + '"><h4>' + h.name + ' · MVP race</h4><ol>' + lis + "</ol></div>";
      }).join("");
    }
  }

  function showPlaceholder() {
    var l = $("#lb-loading"), live = $("#lb-live"), ph = $("#lb-pre");
    if (l) l.style.display = "none";
    if (live) live.style.display = "none";
    if (ph) ph.style.display = "block";
  }

  function load() {
    if (new Date() < new Date(ULDP.LEADERBOARD_LIVE_FROM)) { showPlaceholder(); return; }
    if (!ULDP.API_URL) { render(DEMO); return; }      // review mode
    fetch(ULDP.API_URL, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) { sessionStorage.setItem("lb-cache", JSON.stringify(d)); render(d); loadHistory(); })
      .catch(function () {
        var c = sessionStorage.getItem("lb-cache");
        if (c) { render(JSON.parse(c)); loadHistory(); } else render(DEMO);
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!document.getElementById("lb-rows")) return;
    load();
    setInterval(load, ULDP.REFRESH_MS);
  });
})();
