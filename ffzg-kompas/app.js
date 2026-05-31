/* ─────────────────────────────────────────────
   FFZG KOMPAS · shared app helpers
   theme + language persistence, nav active state
   ───────────────────────────────────────────── */

(function () {
  const STORAGE_LANG  = 'kompas:lang';
  const STORAGE_THEME = 'kompas:theme';

  /* expose globally */
  window.KompasApp = {
    getLang () { return localStorage.getItem(STORAGE_LANG) || 'hr'; },
    setLang (lang) {
      localStorage.setItem(STORAGE_LANG, lang);
      this._applyLang(lang);
      if (typeof window.applyLang === 'function') window.applyLang(lang);
    },
    getTheme () { return localStorage.getItem(STORAGE_THEME) || 'dark'; },
    setTheme (theme) {
      localStorage.setItem(STORAGE_THEME, theme);
      this._applyTheme(theme);
    },
    toggleTheme () {
      this.setTheme(this.getTheme() === 'dark' ? 'light' : 'dark');
    },
    _applyTheme (theme) {
      document.querySelectorAll('.frame').forEach(f =>
        f.classList.toggle('light', theme === 'light'));
      document.body.classList.toggle('light-host', theme === 'light');
      document.documentElement.classList.toggle('light-root', theme === 'light');
      const icon = document.getElementById('theme-icon');
      if (icon) icon.className = theme === 'light' ? 'ti ti-moon' : 'ti ti-sun';
    },
    _applyLang (lang) {
      const btnHr = document.getElementById('btn-hr');
      const btnEn = document.getElementById('btn-en');
      if (btnHr) btnHr.classList.toggle('active', lang === 'hr');
      if (btnEn) btnEn.classList.toggle('active', lang === 'en');
      /* common strings (subnav + footer) */
      const s = window.KOMPAS_STRINGS?.[lang]; if (!s) return;
      const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
      setText('sub-map',  s.nav.map);
      setText('sub-info', s.nav.info);
      setText('sub-tips', s.nav.tips);
      setText('lbl-foot-credits', lang === 'hr' ? '// Autori' : '// Authors');
    },
  };

  /* run on load */
  document.addEventListener('DOMContentLoaded', () => {
    KompasApp._applyTheme(KompasApp.getTheme());
    KompasApp._applyLang(KompasApp.getLang());
    if (typeof window.applyLang === 'function') window.applyLang(KompasApp.getLang());
  });
})();
