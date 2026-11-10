/* Enhance only after setup: without JavaScript all examples remain readable.
   Native buttons plus the ARIA tabs keyboard pattern keep switching accessible. */
(() => {
  document.querySelectorAll('.code-tabs').forEach((group) => {
    const list = group.querySelector(':scope > .code-tabs-list');
    const tabs = Array.from(list.children);
    const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
    const icon = panels[0].querySelector('.code-header > span > i');
    if (icon) {
      const headerIcon = icon.cloneNode(true);
      headerIcon.setAttribute('aria-hidden', 'true');
      list.prepend(headerIcon);
    }

    const select = (selected) => {
      tabs.forEach((tab, index) => {
        const active = index === selected;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        panels[index].hidden = !active;
      });
    };

    list.setAttribute('role', 'tablist');
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
    group.classList.add('code-tabs-ready');
    list.hidden = false;
  });
})();
