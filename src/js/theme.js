(function () {
    'use strict';
    const key = 'autodesk-theme';
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    let preference = 'dark';
    try { const saved = localStorage.getItem(key); if (['dark','light','system'].includes(saved)) preference = saved; } catch (_) {}
    function apply() {
        const theme = preference === 'system' ? (media.matches ? 'light' : 'dark') : preference;
        root.dataset.theme = theme;
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#eef1f5' : '#111214');
        document.querySelectorAll('[data-theme-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === preference)));
    }
    window.AutoDeskTheme = { get: () => preference, set(value) {
        if (!['dark','light','system'].includes(value)) return;
        preference = value;
        try { localStorage.setItem(key, value); } catch (_) {}
        apply();
    }};
    if (media.addEventListener) media.addEventListener('change', apply); else media.addListener(apply);
    document.addEventListener('click', event => {
        const button = event.target.closest('[data-theme-choice]');
        if (button) window.AutoDeskTheme.set(button.dataset.themeChoice);
    });
    apply();
})();
