/* Inject header/footer partials, then signal readiness for main.js */
(function () {
  function inject(sel, url) {
    var host = document.querySelector(sel);
    if (!host) return Promise.resolve();
    return fetch(url).then(function (r) { return r.text(); }).then(function (html) {
      host.innerHTML = html;
    }).catch(function () { /* file:// fallback — partials require a server */ });
  }
  Promise.all([
    inject("header.site", "partials/header.html"),
    inject("footer.site", "partials/footer.html")
  ]).then(function () {
    document.dispatchEvent(new CustomEvent("partials:ready"));
  });
})();
