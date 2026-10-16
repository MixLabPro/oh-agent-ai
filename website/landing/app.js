// Navigation works independently of the optional 3D runtime. No analytics.
(() => {
  document.querySelectorAll('[data-start-city]').forEach((link) => {
    link.addEventListener('click', () => window.dispatchEvent(new Event('av:explore-city')));
  });
})();
