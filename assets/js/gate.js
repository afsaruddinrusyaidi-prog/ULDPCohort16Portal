/* ============================================================
   Site-wide participant gate.
   Login is the first thing everyone sees — every page redirects
   to participant-login.html unless a member session exists.

   Refreshing any page forces a re-login (per spec), while normal
   link navigation within the session stays smooth. We tell the
   two apart with the Navigation Timing API: type "reload" → drop
   the session; "navigate"/"back_forward" → keep it.
   Runs from <head> (before render) to avoid a content flash.
   ============================================================ */
(function () {
  try {
    var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (page === "participant-login.html") return;          // the login page itself

    var isReload = false;
    var nav = (performance.getEntriesByType && performance.getEntriesByType("navigation")[0]);
    if (nav) isReload = nav.type === "reload";
    else if (performance.navigation) isReload = performance.navigation.type === 1;
    if (isReload) sessionStorage.removeItem("uldp-member");   // refresh → must sign in again

    if (sessionStorage.getItem("uldp-member") === "1") return;
    sessionStorage.setItem("uldp-after-login", page + location.search + location.hash);
    location.replace("participant-login.html");
  } catch (e) { /* storage blocked — fail open */ }
})();
