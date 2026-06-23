/* Nav state, hamburger, staff link, scroll-reveal, scroll progress */
document.addEventListener("partials:ready", function () {
  // active nav link
  var page = document.body.dataset.page;
  document.querySelectorAll('.nav a[data-page]').forEach(function (a) {
    if (a.dataset.page === page) a.classList.add("active");
  });

  // staff console links (only when configured)
  if (window.ULDP && ULDP.STAFF_CONSOLE_URL) {
    ["staff-link", "staff-link-foot"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.href = ULDP.STAFF_CONSOLE_URL; el.style.display = "inline"; }
    });
  }

  // hamburger
  var burger = document.querySelector(".nav .burger");
  var menu = document.getElementById("nav-menu");
  if (burger && menu) {
    burger.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    menu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { menu.classList.remove("open"); });
    });
  }

  // scroll progress bar + sticky-header condensed state
  var bar = document.getElementById("scrollbar");
  var header = document.querySelector("header.site");
  var onScroll = function () {
    var h = document.documentElement;
    if (bar) {
      var max = h.scrollHeight - h.clientHeight;
      bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
    }
    if (header) header.classList.toggle("scrolled", h.scrollTop > 12);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
});

/* scroll reveal — staggered */
(function () {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".reveal").forEach(function (el, i) {
      el.style.transitionDelay = ((i % 4) * 70) + "ms";
      io.observe(el);
    });
  });
})();
