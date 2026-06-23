/* ============================================================
   Site-wide participant gate.
   Login is the first thing everyone sees — every page redirects
   to participant-login.html unless a valid member session exists.

   A session lasts ~24 hours (login once a day). Refreshing and
   navigating within that window stay smooth. Runs from <head>
   (before render) to avoid a content flash.
   ============================================================ */
(function () {
  try {
    var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (page === "participant-login.html") return;          // the login page itself

    var exp = parseInt(localStorage.getItem("uldp-member-exp"), 10) || 0;
    if (Date.now() < exp) return;                           // still signed in today

    localStorage.removeItem("uldp-member-exp");
    sessionStorage.setItem("uldp-after-login", page + location.search + location.hash);
    location.replace("participant-login.html");
  } catch (e) { /* storage blocked — fail open */ }
})();
