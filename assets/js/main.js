/* Nav state, hamburger, scroll-reveal */
document.addEventListener("partials:ready", function () {
  // active nav link
  var page = document.body.dataset.page;
  document.querySelectorAll('.nav a[data-page]').forEach(function (a) {
    if (a.dataset.page === page) a.classList.add("active");
  });
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
});

/* scroll reveal */
(function () {
  if (!("IntersectionObserver" in window)) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  });
})();
