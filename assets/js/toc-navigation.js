/* Keep TOC destinations aligned while images, fonts, or math settle. */
(function () {
  'use strict';

  var target = null;
  var observer = null;
  var frame = 0;

  function stop() {
    target = null;
    if (observer) observer.disconnect();
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function headingInset() {
    var inset = 0;
    var bar = document.getElementById('topbar-wrapper');
    if (bar) {
      var position = getComputedStyle(bar).position;
      if (position === 'fixed' || position === 'sticky') {
        inset = Math.max(0, bar.getBoundingClientRect().bottom);
      }
    }
    /* Leave one body-text line above the destination heading. */
    var content = document.querySelector('.content');
    if (!content) return inset;
    var textStyle = getComputedStyle(content);
    inset += parseFloat(textStyle.lineHeight) || parseFloat(textStyle.fontSize) * 1.5;
    return inset;
  }

  function syncScrollspy() {
    if (window.tocbot && tocbot.options) {
      /* Tocbot reads this option on every scroll; share the landing inset. */
      tocbot.options.headingsOffset = headingInset();
    }
  }

  function align() {
    frame = 0;
    if (!target || !target.isConnected) return;
    syncScrollspy();
    var delta = target.getBoundingClientRect().top - headingInset();
    if (Math.abs(delta) > 0.5) {
      /* Explicit instant overrides Bootstrap's global smooth scrolling. */
      window.scrollTo({ top: window.scrollY + delta, behavior: 'instant' });
    }
    /* A reload can already be aligned when Tocbot rebuilds on load. */
    document.dispatchEvent(new Event('scroll'));
  }

  function schedule() {
    if (target && !frame) frame = requestAnimationFrame(align);
  }

  function navigate(hash, addHistory, focusHeading) {
    var heading;
    try { heading = document.getElementById(decodeURIComponent(hash.slice(1))); } catch (error) { return false; }
    if (!heading || !heading.matches('.content h2, .content h3, .content h4')) return false;
    stop();
    target = heading;
    /* Open any enclosing disclosure before measuring the heading. */
    for (var parent = heading.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    if (addHistory && location.hash !== hash) history.pushState(null, '', hash);
    /* Match native fragment navigation's keyboard focus without another jump. */
    if (focusHeading) {
      var hadTabindex = heading.hasAttribute('tabindex');
      if (!hadTabindex) heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
      if (!hadTabindex) {
        heading.addEventListener('blur', function () { heading.removeAttribute('tabindex'); }, { once: true });
      }
    }
    if (window.ResizeObserver) {
      if (!observer) observer = new ResizeObserver(schedule);
      observer.observe(document.querySelector('.content'));
      observer.observe(document.body);
    }
    align();
    schedule();
    return true;
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest('#toc a[href]');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    var url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return;
    if (navigate(url.hash, true, true)) event.preventDefault();
  });

  /* Do not fight the reader, including keyboard and scrollbar navigation. */
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(function (type) {
    document.addEventListener(type, stop, { capture: true, passive: true });
  });
  window.addEventListener('popstate', stop);
  window.addEventListener('hashchange', function () {
    stop();
    navigate(location.hash, false, true);
  });
  /* Capture runs before Tocbot's scroll listener, including manual scrolling. */
  document.addEventListener('scroll', syncScrollspy, { capture: true, passive: true });
  window.addEventListener('load', syncScrollspy);
  window.addEventListener('resize', syncScrollspy);
  window.addEventListener('resize', schedule);
  document.addEventListener('load', schedule, true);
  if (document.fonts) document.fonts.ready.then(schedule);
  /* This deferred script runs after parsing. Use the same navigation path for
     direct links/reloads; later load/pageshow corrections never restart it if
     the reader has already taken control. */
  navigate(location.hash, false, false);
  window.addEventListener('pageshow', schedule);
})();
