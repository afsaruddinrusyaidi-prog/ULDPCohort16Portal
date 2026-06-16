/* Countdown widgets: <div class="count" data-target="reveal|virtual|physical"> */
(function () {
  function pad(n) { return String(n).padStart(2, "0"); }
  function tick(el, target) {
    var diff = new Date(target) - new Date();
    if (diff <= 0) { el.innerHTML = '<div class="unit"><b>LIVE</b><small>now</small></div>'; return; }
    var d = Math.floor(diff / 864e5),
        h = Math.floor(diff % 864e5 / 36e5),
        m = Math.floor(diff % 36e5 / 6e4),
        s = Math.floor(diff % 6e4 / 1e3);
    el.innerHTML =
      '<div class="unit"><b>' + d + '</b><small>days</small></div>' +
      '<div class="unit"><b>' + pad(h) + '</b><small>hours</small></div>' +
      '<div class="unit"><b>' + pad(m) + '</b><small>mins</small></div>' +
      '<div class="unit"><b>' + pad(s) + '</b><small>secs</small></div>';
  }
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".count[data-target]").forEach(function (el) {
      var target = (window.ULDP && ULDP.DATES[el.dataset.target]) || el.dataset.target;
      tick(el, target);
      setInterval(function () { tick(el, target); }, 1000);
    });
  });
})();
