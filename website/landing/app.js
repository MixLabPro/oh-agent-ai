// Navigation works independently of the optional 3D runtime. No analytics.
(() => {
  document.querySelectorAll('[data-start-city]').forEach((link) => {
    link.addEventListener('click', () => window.dispatchEvent(new Event('av:explore-city')));
  });
  // Preview the exploration concept, not an in-browser game launch.
  const world = document.querySelector('.play-world');
  const modes = document.querySelectorAll('[data-exploration-mode]');
  const panels = document.querySelectorAll('[data-exploration-panel]');
  modes.forEach((button) => button.addEventListener('click', () => {
    const mode = button.dataset.explorationMode;
    if (!world || !['flight', 'drive'].includes(mode)) return;
    world.dataset.exploration = mode;
    modes.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    panels.forEach((panel) => { panel.hidden = panel.dataset.explorationPanel !== mode; });
  }));
})();
