/* ============================================================
   Site-wide participant gate.
   Login is the first thing everyone sees — every page redirects
   to participant-login.html unless a member session exists.
   Runs from <head> (before render) to avoid a content flash.
   ============================================================ */
(function () {
  try {
    var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (page === "participant-login.html") return;          // the login page itself
    if (sessionStorage.getItem("uldp-member") === "1") return;
    // remember where they were heading, then send them to login
    sessionStorage.setItem("uldp-after-login", page + location.search + location.hash);
    location.replace("participant-login.html");
  } catch (e) { /* storage blocked — fail open */ }
})();
