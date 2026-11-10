/* Progressive enhancement: without JS every panel remains readable. */
(() => {
  document.querySelectorAll('.content-tabs').forEach((group) => {
    const menu = group.querySelector(':scope > .content-tabs-menu');
    const tabs = Array.from(menu.querySelectorAll('button'));
    const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
    const select = (index) => {
      tabs.forEach((tab, i) => {
        tab.setAttribute('aria-selected', String(i === index));
        tab.tabIndex = i === index ? 0 : -1;
        panels[i].hidden = i !== index;
      });
    };
    menu.setAttribute('role', 'tablist');
    tabs.forEach((tab, index) => {
      tab.setAttribute('role', 'tab');
      panels[index].setAttribute('role', 'tabpanel');
      panels[index].setAttribute('aria-labelledby', tab.id);
      panels[index].tabIndex = 0;
      tab.addEventListener('click', () => select(index));
      tab.addEventListener('keydown', (event) => {
        let next;
        switch (event.key) {
          case 'ArrowRight': next = (index + 1) % tabs.length; break;
          case 'ArrowLeft': next = (index + tabs.length - 1) % tabs.length; break;
          case 'Home': next = 0; break;
          case 'End': next = tabs.length - 1; break;
          default: return;
        }
        event.preventDefault();
        select(next);
        tabs[next].focus();
      });
    });
    select(0);
    group.dataset.tabsReady = '';
    menu.hidden = false;
  });
})();
