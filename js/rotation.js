"use strict";
// ============================================================
// Rotation bloquée sur téléphone — round du 27.09.2026 (suite 85).
// Lionel : « Bloquer la rotation d'écran mobile. »
//
// Une page web ne peut pas interdire la rotation à coup sûr :
//  - screen.orientation.lock("portrait") : accepté seulement dans
//    certains cas (Android, appli installée ou plein écran) ; ailleurs
//    (Safari, onglet ordinaire) refusé — essayé quand même, sans bruit ;
//  - le manifeste (orientation) vaut pour tous les appareils, tablettes
//    comprises : il reste sur « any » (la tablette tourne librement).
// Filet : téléphone tenu en largeur -> la page est couverte par
// « Tourne ton téléphone » (#tournerTelephone), jusqu'au retour en
// hauteur. Rien n'est rechargé : le planning reste tel quel dessous.
//
// Téléphone = écran tactile dont le petit côté fait au plus 540 px
// (les tablettes en ont au moins 600), lu sur l'ÉCRAN (screen.*). En
// largeur : cf. paysage() — le clavier qui s'ouvre en hauteur rétrécit
// la fenêtre sans que le téléphone soit tourné.
// Chargé par index.html et consultation.html (page des ouvriers).
// ============================================================
(function () {
  var tactile = (navigator.maxTouchPoints || 0) > 0 ||
    (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches);
  if (!tactile || Math.min(screen.width, screen.height) > 540) return;

  try {
    if (screen.orientation && typeof screen.orientation.lock === "function") {
      var p = screen.orientation.lock("portrait");
      if (p && typeof p.catch === "function") p.catch(function () {});
    }
  } catch (e) {}

  var style = document.createElement("style");
  style.textContent =
    "#tournerTelephone { display: none; }" +
    "html.paysage-telephone, html.paysage-telephone body { overflow: hidden; }" +
    "html.paysage-telephone #tournerTelephone { display: flex; position: fixed; inset: 0; z-index: 2147483000;" +
    " flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px; text-align: center;" +
    " background: var(--bg, #eef0ec); color: var(--ink, #1c1f1a); font-weight: 600; font-size: 16px; line-height: 1.35; }" +
    "#tournerTelephone svg { width: 64px; height: 64px; color: var(--accent, #1f4d8f); }" +
    "#tournerTelephone .tt-sous { font-weight: 400; font-size: 14px; opacity: .75; }";
  document.head.appendChild(style);

  // En largeur = fenêtre plus large que haute ET écran tourné (le sens
  // de l'écran seul ne suffit pas partout : certains navigateurs le
  // donnent toujours « landscape » ; la fenêtre seule non plus : clavier).
  function paysage() {
    if (window.innerWidth <= window.innerHeight) return false;
    if (screen.orientation && typeof screen.orientation.type === "string") return screen.orientation.type.indexOf("landscape") === 0;
    if (typeof window.orientation === "number") return Math.abs(window.orientation) === 90;
    return screen.width > screen.height;
  }
  var ecran = null;
  function maj() {
    var en = paysage();
    document.documentElement.classList.toggle("paysage-telephone", en);
    if (en && !ecran && document.body) {
      ecran = document.createElement("div");
      ecran.id = "tournerTelephone";
      ecran.setAttribute("role", "alert");
      // Téléphone tourné d'un quart de tour, flèche de retour.
      ecran.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/><path d="M3 9a8 8 0 0 1 3-5.5"/><path d="M3 4v5h5"/></svg>' +
        '<div>Tourne ton téléphone</div><div class="tt-sous">L’appli s’utilise en hauteur sur téléphone.</div>';
      document.body.appendChild(ecran);
    }
  }
  if (screen.orientation && typeof screen.orientation.addEventListener === "function") screen.orientation.addEventListener("change", maj);
  window.addEventListener("orientationchange", maj);
  window.addEventListener("resize", maj);
  if (document.body) maj(); else document.addEventListener("DOMContentLoaded", maj);
})();
