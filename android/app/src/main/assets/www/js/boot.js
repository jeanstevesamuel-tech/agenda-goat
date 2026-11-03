// Petit script classique : applique le thème avant l'affichage pour éviter un flash.
(function () {
  var dark = false;
  try {
    var t = 'system', raw = localStorage.getItem('agenda-etoile-v2');
    if (raw) { var s = JSON.parse(raw).settings; if (s && s.theme) t = s.theme; }
    dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  } catch (e) { /* thème clair par défaut */ }
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  var m = document.querySelector('meta[name=theme-color]');
  if (m) m.setAttribute('content', dark ? '#13102A' : '#D42D78');
})();
