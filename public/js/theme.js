(function () {
  try {
    var saved = localStorage.getItem('ps.theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) { /* private mode: fall back to the media query */ }
})();
