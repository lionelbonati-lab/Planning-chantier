"use strict";
/* ============================================================
   ITINÉRAIRE VERS UN CHANTIER — round du 21.10.2026 (suite 145)
   ------------------------------------------------------------
   Lionel : « J'aimerai pouvoir ajouter une adresse, sur un chantier, afin
   que mes ouvriers puisse cliquer sur le nom du chantier et que ça leur
   ouvre leur navigation gps. » Ses choix : appli « Au choix » ; sur le
   « Lien des ouvriers » (consultation.html, js/consultation.js) et le
   « Lien responsable » (responsable.html, js/responsable.js), pas dans
   l'appli du bureau.

   Le pin est posé dans Réglages › Chantiers (js/carte-chantier.js) ; les
   fonctions des liens (sql/0040) envoient lat / lng avec chaque tâche (et
   chaque jalon et note pour le responsable). Ce fichier, partagé par les
   deux pages :
     - htmlChantierGps(nom, lat, lng) : le nom du chantier ; avec un pin,
       en bouton souligné précédé d'une petite icône pin (texte du bouton
       = le nom seul, comme avant) ;
     - toucher ce bouton ouvre « Itinéraire vers « nom » » : Google Maps,
       Waze, Plans (appareils Apple seulement), Annuler — feuille qui monte
       du bas sur téléphone, boîte centrée sur ordinateur. Chaque lien
       ouvre l'appli installée (ou son site) sur le trajet en voiture
       jusqu'au pin.
   Le CSS est posé ici, avec les couleurs des deux pages (--surface, --ink,
   --accent…, définies par chacune, clair et sombre).
   ============================================================ */
(function () {
  var ICONE_PIN = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 18s5.5-5.6 5.5-10a5.5 5.5 0 0 0-11 0c0 4.4 5.5 10 5.5 10z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="10" cy="8" r="2" stroke="currentColor" stroke-width="1.7"/></svg>';
  var fermerOuvert = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function nombre(x) { var n = x == null || x === "" ? NaN : Number(x); return isFinite(n) ? n : null; }

  // Liens « itinéraire jusqu'au point » de chaque appli : sur téléphone,
  // l'appli installée les intercepte et lance le guidage ; sinon son site.
  function liensGps(lat, lng) {
    var ll = lat + "," + lng;
    var liens = [
      { nom: "Google Maps", url: "https://www.google.com/maps/dir/?api=1&destination=" + ll + "&travelmode=driving" },
      { nom: "Waze", url: "https://waze.com/ul?ll=" + ll + "&navigate=yes" }
    ];
    // Plans n'existe que sur iPhone, iPad et Mac (l'iPad se présente comme
    // un Mac depuis iPadOS 13).
    if (/Mac|iPhone|iPad|iPod/.test(navigator.userAgent || "")) {
      liens.push({ nom: "Plans", url: "https://maps.apple.com/?daddr=" + ll + "&dirflg=d" });
    }
    return liens;
  }

  window.htmlChantierGps = function (nom, lat, lng) {
    lat = nombre(lat); lng = nombre(lng);
    if (lat == null || lng == null) return esc(nom);
    return '<button type="button" class="chantier-gps" data-lat="' + lat + '" data-lng="' + lng + '" data-nom="' + esc(nom) +
      '" title="Itinéraire vers ce chantier">' + ICONE_PIN + esc(nom) + "</button>";
  };

  function ouvrirMenu(nom, lat, lng, depuis) {
    if (fermerOuvert) fermerOuvert();
    var titre = "Itinéraire vers « " + nom + " »";
    var fond = document.createElement("div");
    fond.className = "gps-fond";
    var menu = document.createElement("div");
    menu.className = "gps-menu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-modal", "true");
    menu.setAttribute("aria-label", titre);
    menu.innerHTML = '<div class="gps-titre">' + esc(titre) + "</div>" +
      liensGps(lat, lng).map(function (l) {
        return '<a class="gps-lien" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.nom) + "</a>";
      }).join("") +
      '<button type="button" class="gps-annuler">Annuler</button>';
    document.body.appendChild(fond);
    document.body.appendChild(menu);
    // Capture : Échap ferme le menu avant la feuille de la page ouvrier ;
    // les flèches ne changent pas la semaine derrière (page responsable).
    function touche(e) {
      if (e.key === "Escape") { e.stopPropagation(); fermer(); }
      else if (/^Arrow/.test(e.key)) e.stopPropagation();
    }
    function fermer() {
      fond.remove(); menu.remove();
      document.removeEventListener("keydown", touche, true);
      if (fermerOuvert === fermer) fermerOuvert = null;
      if (depuis && depuis.isConnected) depuis.focus();
    }
    fermerOuvert = fermer;
    fond.addEventListener("click", fermer);
    menu.querySelector(".gps-annuler").addEventListener("click", fermer);
    // Le lien s'ouvre (nouvel onglet ou appli) : le menu se referme derrière.
    menu.querySelectorAll(".gps-lien").forEach(function (a) {
      a.addEventListener("click", function () { setTimeout(fermer, 0); });
    });
    document.addEventListener("keydown", touche, true);
    menu.querySelector(".gps-lien").focus();
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".chantier-gps");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    ouvrirMenu(b.dataset.nom || "", nombre(b.dataset.lat), nombre(b.dataset.lng), b);
  });

  var style = document.createElement("style");
  style.textContent =
    ".chantier-gps { display: inline-flex; align-items: center; gap: 3px; margin: -3px 0; padding: 3px 0; font: inherit; color: inherit; background: none; border: 0; cursor: pointer;" +
      " text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; text-align: left; }\n" +
    ".chantier-gps svg { width: 1.05em; height: 1.05em; flex: none; }\n" +
    "@media (hover: hover) and (pointer: fine) { .chantier-gps:hover { text-decoration-thickness: 2px; } }\n" +
    ".gps-fond { position: fixed; inset: 0; z-index: 40; background: rgba(10, 16, 22, .45); }\n" +
    ".gps-menu { position: fixed; z-index: 41; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(340px, calc(100vw - 32px)); box-sizing: border-box;" +
      " display: flex; flex-direction: column; gap: 8px; padding: 16px; background: var(--surface); color: var(--ink); border: 1px solid var(--border);" +
      " border-radius: 16px; box-shadow: 0 16px 40px rgba(0, 0, 0, .3); font-family: inherit; }\n" +
    ".gps-titre { margin: 0 2px 4px; font-size: 16px; font-weight: 800; overflow-wrap: anywhere; }\n" +
    ".gps-lien, .gps-annuler { display: flex; align-items: center; justify-content: center; min-height: 48px; border-radius: 12px; font: inherit; font-size: 15px; font-weight: 700; text-decoration: none; }\n" +
    ".gps-lien { background: var(--accent); color: var(--accent-ink); }\n" +
    ".gps-annuler { margin-top: 4px; background: var(--surface-2); color: var(--ink); border: 1px solid var(--border); cursor: pointer; }\n" +
    "@media (hover: hover) and (pointer: fine) { .gps-lien:hover { filter: brightness(1.1); } }\n" +
    "@media (max-width: 600px) { .gps-menu { left: 0; right: 0; top: auto; bottom: 0; transform: none; width: auto; border-width: 1px 0 0; border-radius: 18px 18px 0 0;" +
      " padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); } }\n";
  document.head.appendChild(style);
})();
