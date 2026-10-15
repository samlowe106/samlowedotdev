/* Keep hover/focus notes inside the viewport and horizontally scrolling tables. */
(function () {
  'use strict';
  var active = null;
  var frame = 0;

  function place() {
    frame = 0;
    if (!active) return;
    var note = active.querySelector('.gloss-note');
    if (!note) return;
    note.style.setProperty('--gloss-shift-x', '0px');
    note.style.setProperty('--gloss-shift-y', '0px');
    note.style.removeProperty('max-width');
    var left = 8;
    var right = document.documentElement.clientWidth - 8;
    var top = 8;
    var bottom = window.innerHeight - 8;
    var table = active.closest('.table-wrapper');
    if (table) {
      var box = table.getBoundingClientRect();
      left = Math.max(left, box.left + 2);
      right = Math.min(right, box.right - 2);
      top = Math.max(top, box.top + 2);
      bottom = Math.min(bottom, box.bottom - 2);
    }
    note.style.maxWidth = Math.max(0, Math.min(260, right - left)) + 'px';
    var rect = note.getBoundingClientRect();
    var x = Math.max(left - rect.left, Math.min(0, right - rect.right));
    var y = 0;
    if (rect.top < top) {
      /* Prefer below the term if there is no room above it. */
      var term = active.getBoundingClientRect();
      y = term.bottom + 6 - rect.top;
    }
    y = Math.max(top - rect.top, Math.min(y, bottom - rect.bottom));
    note.style.setProperty('--gloss-shift-x', x + 'px');
    note.style.setProperty('--gloss-shift-y', y + 'px');
  }

  function activate(event) {
    var term = event.target.closest('.gloss-term');
    if (term) { active = term; place(); }
  }

  document.addEventListener('pointerover', activate);
  document.addEventListener('focusin', activate);
  function schedule() {
    if (active && (active.matches(':hover') || active === document.activeElement) && !frame) {
      frame = requestAnimationFrame(place);
    }
  }
  document.addEventListener('scroll', schedule, { capture: true, passive: true });
  window.addEventListener('resize', schedule);
})();
