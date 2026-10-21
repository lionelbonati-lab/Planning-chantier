"use strict";
/* ============================================================
   INSTALLER L'APPLICATION DEPUIS UN LIEN — round du 21.10.2026 (suite 146)
   ------------------------------------------------------------
   Lionel : « Ajoute moi une icône sur la vue ouvrier et responsables pour
   installer l'application. » (avec l'image d'une flèche qui descend dans
   un bac, l'icône « télécharger »).

   Partagé par consultation.html (lien des ouvriers) et responsable.html
   (lien responsable) ; chargé AVANT js/consultation.js / js/responsable.js
   avec data-page="consultation" ou "responsable". Il pose :
     - le manifeste de la page (manifest-<page>.json : nom, icône, plein
       écran) et le service worker des liens (sw-liens.js, portée = la page
       seule) — Chrome et Edge ne proposent « Installer » qu'à ce prix ;
     - le bouton #btnInstaller de l'en-tête (icône « télécharger »), caché
       dans l'appli installée. Toucher : la fenêtre « Installer » du
       navigateur quand il en propose une (Chrome, Edge, Android) ; sinon
       les étapes pour cet appareil (iPhone / iPad, Safari sur Mac,
       Android, Firefox, autre ordinateur).

   Le jeton : l'appli installée s'ouvre sur « consultation.html » sans le
   ?j=… (un manifeste ne peut pas connaître le jeton de chacun). Chaque
   ouverture avec un jeton le garde donc sur l'appareil (localStorage
   « planning.lien.<page> ») ; l'appli installée, qui partage ce stockage
   avec le navigateur (Android, ordinateur), le remet dans l'adresse avant
   que la page le lise. iPhone, iPad et Safari sur Mac n'ont PAS de
   manifeste : « Sur l'écran d'accueil » y garde alors l'adresse exacte,
   jeton compris (leur appli a un stockage à part, vide au départ).
   Le CSS de la fenêtre est posé ici, avec les couleurs des deux pages.
   ============================================================ */
(function () {
  var script = document.currentScript;
  var PAGE = (script && script.dataset.page) === "responsable" ? "responsable" : "consultation";
  var NOM = PAGE === "responsable" ? "Planning" : "Mon planning";
  var CLE = "planning.lien." + PAGE;
  var JETON_VALIDE = /^[0-9a-f]{32,}$/i;
  var ua = navigator.userAgent || "";
  // L'iPad se présente comme un Mac depuis iPadOS 13 (mais tactile).
  var IOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var SAFARI_MAC = !IOS && /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua);
  var ANDROID = /Android/.test(ua);
  var FIREFOX = /Firefox\//.test(ua);
  var invite = null; // fenêtre « Installer » gardée par le navigateur
  var bouton = document.getElementById("btnInstaller");

  function installee() {
    try { if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true; } catch (e) { /* vieux navigateur */ }
    return window.navigator.standalone === true;
  }

  // ---- Jeton gardé / remis dans l'adresse ------------------------------
  var jeton = new URLSearchParams(location.search).get("j") || location.hash.replace(/^#/, "");
  try {
    if (JETON_VALIDE.test(jeton)) localStorage.setItem(CLE, jeton);
    else if (installee()) {
      var garde = localStorage.getItem(CLE);
      if (garde && JETON_VALIDE.test(garde)) history.replaceState(null, "", location.pathname + "?j=" + encodeURIComponent(garde));
    }
  } catch (e) { /* stockage bloqué : la page dira « Lien incomplet » */ }

  // ---- Manifeste et service worker -------------------------------------
  if (!IOS && !SAFARI_MAC) {
    var lien = document.createElement("link");
    lien.rel = "manifest";
    lien.href = "manifest-" + PAGE + ".json";
    document.head.appendChild(lien);
  }
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("sw-liens.js", { scope: PAGE + ".html" }).catch(function () { /* sans service worker : bouton → étapes */ });
  }

  // ---- Bouton ------------------------------------------------------------
  function montrer() { if (bouton && !installee()) bouton.hidden = false; }
  function cacher() { if (bouton) bouton.hidden = true; }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); // pas le bandeau du bas : notre icône le remplace
    invite = e;
    montrer();
  });
  window.addEventListener("appinstalled", function () { invite = null; cacher(); });

  if (bouton) {
    montrer();
    bouton.addEventListener("click", function () {
      if (!invite) { ouvrirAide(); return; }
      var ev = invite;
      invite = null; // une fenêtre ne s'ouvre qu'une fois (le navigateur en redonne une)
      Promise.resolve().then(function () { return ev.prompt(); }).then(function () { return ev.userChoice; }).then(function (choix) {
        if (choix && choix.outcome === "accepted") cacher();
      }).catch(function () { ouvrirAide(); });
    });
  }

  // ---- Étapes pour cet appareil ------------------------------------------
  var ICONE_PARTAGER = '<svg class="inst-ico" viewBox="0 0 20 20" fill="none" aria-label="Partager" role="img"><path d="M10 12.2V2.8M6.8 6 10 2.8 13.2 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M7.2 8.5H5.8c-.8 0-1.5.7-1.5 1.5v6c0 .8.7 1.5 1.5 1.5h8.4c.8 0 1.5-.7 1.5-1.5v-6c0-.8-.7-1.5-1.5-1.5h-1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

  function etapes() {
    if (IOS) {
      return [/CriOS|FxiOS|EdgiOS/.test(ua) ? "Touche le bouton Partager " + ICONE_PARTAGER + " dans la barre d’adresse."
        : "Touche le bouton Partager " + ICONE_PARTAGER + " de Safari : en bas sur iPhone (parfois dans le menu « ••• »), en haut sur iPad.",
        "Choisis « Sur l’écran d’accueil » (fais défiler la liste si besoin).",
        "Touche « Ajouter »."];
    }
    if (SAFARI_MAC) return ["Dans Safari, ouvre le menu Fichier › « Ajouter au Dock… ».", "Clique sur « Ajouter »."];
    if (ANDROID) {
      return ["Ouvre le menu du navigateur (⋮ en haut à droite, ou ≡ en bas).",
        "Choisis « Installer l’application » ou « Ajouter à l’écran d’accueil »."];
    }
    if (FIREFOX) return ["Firefox n’installe généralement pas les applications sur ordinateur : ouvre ce lien dans Chrome ou Edge.", "Clique ensuite sur cette même icône."];
    return ["Clique sur l’icône d’installation à droite de la barre d’adresse (un écran avec une flèche).",
      "Ou cherche « Installer » dans le menu du navigateur (⋮ ou …)."];
  }

  function ouvrirAide() {
    if (document.querySelector(".inst-boite")) return;
    var fond = document.createElement("div");
    fond.className = "inst-fond";
    var boite = document.createElement("div");
    boite.className = "inst-boite";
    boite.setAttribute("role", "dialog");
    boite.setAttribute("aria-modal", "true");
    boite.setAttribute("aria-labelledby", "instTitre");
    boite.innerHTML = '<h2 class="inst-titre" id="instTitre">Installer l’application</h2>' +
      '<ol class="inst-etapes">' + etapes().map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ol>" +
      '<p class="inst-note">L’icône « ' + NOM + ' » ouvre ensuite directement ce planning, comme une application.' +
      (IOS || SAFARI_MAC ? "" : " Déjà installée ? Ouvre-la depuis son icône.") + "</p>" +
      '<button type="button" class="inst-ok">OK</button>';
    document.body.appendChild(fond);
    document.body.appendChild(boite);
    // Capture : Échap ferme la fenêtre seule ; les flèches ne changent pas
    // la semaine derrière.
    function touche(e) {
      if (e.key === "Escape") { e.stopPropagation(); fermer(); }
      else if (/^Arrow/.test(e.key)) e.stopPropagation();
    }
    function fermer() {
      fond.remove(); boite.remove();
      document.removeEventListener("keydown", touche, true);
      if (bouton && !bouton.hidden) bouton.focus();
    }
    fond.addEventListener("click", fermer);
    boite.querySelector(".inst-ok").addEventListener("click", fermer);
    document.addEventListener("keydown", touche, true);
    boite.querySelector(".inst-ok").focus();
  }

  var style = document.createElement("style");
  style.textContent =
    ".inst-fond { position: fixed; inset: 0; z-index: 50; background: rgba(10, 16, 22, .45); }\n" +
    ".inst-boite { position: fixed; z-index: 51; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(380px, calc(100vw - 32px)); box-sizing: border-box;" +
      " max-height: calc(100% - 32px); overflow-y: auto; padding: 18px 18px 16px; background: var(--surface); color: var(--ink); border: 1px solid var(--border);" +
      " border-radius: 16px; box-shadow: 0 16px 40px rgba(0, 0, 0, .3); font-family: inherit; font-size: 15px; line-height: 1.4; }\n" +
    ".inst-titre { margin: 0 0 10px; font-size: 17px; font-weight: 800; }\n" +
    ".inst-etapes { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 8px; }\n" +
    ".inst-ico { width: 1.25em; height: 1.25em; vertical-align: -0.25em; color: var(--accent); }\n" +
    ".inst-note { margin: 12px 0 14px; color: var(--ink-muted); font-size: 13.5px; }\n" +
    ".inst-ok { display: block; width: 100%; min-height: 46px; border: 0; border-radius: 12px; background: var(--accent); color: var(--accent-ink); font: inherit; font-weight: 800; cursor: pointer; }\n" +
    "@media (hover: hover) and (pointer: fine) { .inst-ok:hover { filter: brightness(1.1); } }\n" +
    "@media (max-width: 600px) { .inst-boite { left: 0; right: 0; top: auto; bottom: 0; transform: none; width: auto; border-width: 1px 0 0; border-radius: 18px 18px 0 0;" +
      " padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); } }\n";
  document.head.appendChild(style);
})();
