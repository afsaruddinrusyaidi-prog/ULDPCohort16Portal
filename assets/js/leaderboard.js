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

  function houseMeta(slug) {
    return ULDP.HOUSES.find(function (h) { return h.slug === slug; }) ||
           { name: slug, color: "#6B7080" };
  }

  function render(data) {
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
    var live = $("#lb-live"), ph = $("#lb-pre");
    if (live) live.style.display = "none";
    if (ph) ph.style.display = "block";
  }

  function load() {
    if (new Date() < new Date(ULDP.LEADERBOARD_LIVE_FROM)) { showPlaceholder(); return; }
    if (!ULDP.API_URL) { render(DEMO); return; }      // review mode
    fetch(ULDP.API_URL, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(render)
      .catch(function () {
        var c = sessionStorage.getItem("lb-cache");
        if (c) render(JSON.parse(c)); else render(DEMO);
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!document.getElementById("lb-rows")) return;
    load();
    setInterval(load, ULDP.REFRESH_MS);
  });
})();
