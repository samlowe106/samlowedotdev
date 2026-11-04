/* Initialize each independent viewer when it enters the viewport. */
(() => {
  const initialize = (frame) => {
    if (!window.Sketchfab) return;
    const client = new window.Sketchfab('1.12.1', frame);
    client.init(frame.dataset.model, {
      autostart: 0,
      camera: 0,
      dnt: 1,
      success(api) {
        api.addEventListener('viewerready', () => {
          const color = getComputedStyle(frame).getPropertyValue('--palette-sky').trim().replace(/^#/, '');
          const options = /^[\da-f]{6}$/i.test(color) ? { color: `${color}FF` } : {};
          api.setWireframe(true, options);
        });
      },
      error() {
        frame.src = `https://sketchfab.com/models/${frame.dataset.model}/embed?autostart=0&camera=0&dnt=1`;
      }
    });
  };

  const frames = document.querySelectorAll('.sketchfab-viewer iframe');
  if (!('IntersectionObserver' in window)) {
    frames.forEach(initialize);
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      initialize(entry.target);
    });
  });
  frames.forEach((frame) => observer.observe(frame));
})();
