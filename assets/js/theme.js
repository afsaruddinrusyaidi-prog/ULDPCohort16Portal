/* Apply the saved colour theme before first paint (default: dark). */
(function () {
  try {
    var t = localStorage.getItem("uldp-theme") || "dark";
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
