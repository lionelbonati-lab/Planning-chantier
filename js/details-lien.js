"use strict";
/* ============================================================
   DÉTAILS ET FICHIERS D'UNE TÂCHE SUR LES LIENS — round du 21.10.2026
   (suite 147)
   ------------------------------------------------------------
   Lionel : « J'aimerais pouvoir rajouter des détails à mes tâches
   J'aimerais pouvoir leur joindre des fichiers, photos ou PDF. » Visibles
   aussi sur le « Lien des ouvriers » (consultation.html) et le « Lien
   responsable » (responsable.html) — ce fichier, partagé par les deux
   pages, comme js/gps.js :
     - configurerDetailsLien({ page, jeton, url, cle, lundi }) : appelé
       une fois par la page (lundi() = semaine affichée) ;
     - htmlDetailsTache(t) : pour une tâche avec détails ou fichiers
       (sql/0041 : t.details, t.pieces), un bouton « Détails · 2 fichiers »
       précédé d'un trombone ; rien sinon ;
     - le toucher du bouton — ou de toute la tâche quand la page la marque
       data-fiche-tache (vue ouvrier : « qu'il soit visible dans la vue
       ouvrière en cliquant sur la tâche. ») — ouvre la fiche : texte de la
       tâche, détails, fichiers
       (vignette des photos, nom, taille) — feuille qui monte du bas sur
       téléphone, boîte centrée sur ordinateur. Chaque fichier s'ouvre
       dans un nouvel onglet, en original.
   Les fichiers sont dans un dossier privé : leurs adresses (valables
   1 heure) viennent de la fonction serveur pieces-lien, qui ne signe que
   les fichiers des tâches que ce lien affiche cette semaine-là. Elles
   sont demandées à l'ouverture de la fiche, avant tout clic (un lien
   préparé à l'avance n'est pas bloqué par le téléphone).
   ============================================================ */
(function () {
  var ICONE_TROMBONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 11.5 12.6 19.9a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"/></svg>';
  var ICONE_DETAILS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 6h14M5 11h14M5 16h9"/></svg>';
  var ICONE_PHOTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-8 8"/></svg>';
  var ICONE_DOCUMENT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';
  // Suite 150 — Lionel : « J'ai un message d'erreur. J'ai du réseau car j'ai
  // pu charger mes tâches. » La connexion n'est mise en cause que si la
  // demande n'a pas abouti ; si le serveur a répondu, autre message.
  var MESSAGE_RESEAU = "Fichiers inaccessibles : vérifie ta connexion internet, puis réessaie.";
  var MESSAGE_SERVEUR = "Fichiers inaccessibles pour le moment : ferme la fiche et rouvre-la dans quelques minutes.";
  var cfg = null;
  var taches = [];          // tâches des boutons affichés (data-i)
  var adresses = {};        // chemin -> { url, jusqua } (adresses déjà reçues)
  var fermerOuvert = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function detailsDe(t) { var d = t && t.details != null ? String(t.details).trim() : ""; return d || ""; }
  function piecesDe(t) {
    return (t && Array.isArray(t.pieces) ? t.pieces : []).filter(function (p) { return p && typeof p.chemin === "string" && p.chemin; });
  }
  function tailleLisible(n) {
    if (!(n > 0)) return "";
    if (n < 1024) return "< 1 Ko";
    if (n < 1024 * 1024) return Math.round(n / 1024) + " Ko";
    return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0).replace(".", ",") + " Mo";
  }
  function estImage(p) { return /^image\//.test(p.type || "") || /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(p.nom || ""); }
  function estPdf(p) { return /pdf/i.test(p.type || "") || /\.pdf$/i.test(p.nom || ""); }
  function libelle(t) {
    var n = piecesDe(t).length, morceaux = [];
    if (detailsDe(t)) morceaux.push("Détails");
    if (n) morceaux.push(n + " fichier" + (n > 1 ? "s" : ""));
    return morceaux.join(" · ");
  }

  window.configurerDetailsLien = function (o) { cfg = o; };

  window.htmlDetailsTache = function (t) {
    if (!detailsDe(t) && !piecesDe(t).length) return "";
    taches.push(t);
    return '<button type="button" class="tache-joint" data-i="' + (taches.length - 1) + '" title="Voir les détails et les fichiers">' +
      (piecesDe(t).length ? ICONE_TROMBONE : ICONE_DETAILS) + esc(libelle(t)) + "</button>";
  };

  // Adresses des fichiers (et vignettes) : celles déjà reçues et encore
  // valables 5 minutes, sinon une demande à pieces-lien. Suite 150 : une
  // réponse du serveur en erreur est marquée « serveur » (le réseau marche).
  function demanderAdresses(chemins) {
    var maintenant = Date.now(), manquants = chemins.filter(function (c) { return !(adresses[c] && adresses[c].jusqua > maintenant + 300000); });
    if (!manquants.length) return Promise.resolve();
    if (!cfg) return Promise.reject(new Error("page non configurée"));
    return fetch(cfg.url + "/functions/v1/pieces-lien", {
      method: "POST",
      headers: { apikey: cfg.cle, Authorization: "Bearer " + cfg.cle, "Content-Type": "application/json" },
      body: JSON.stringify({ jeton: cfg.jeton, page: cfg.page, lundi: cfg.lundi ? cfg.lundi() : null, chemins: manquants })
    }).then(function (rep) {
      return rep.json().catch(function () { return null; }).then(function (r) {
        if (!rep.ok || !r || !r.ok) {
          var e = new Error((r && r.erreur) || "HTTP " + rep.status);
          e.serveur = true;
          throw e;
        }
        Object.keys(r.urls || {}).forEach(function (c) { adresses[c] = { url: r.urls[c], jusqua: maintenant + 3600000 }; });
      });
    });
  }
  function adresse(c) { return c && adresses[c] ? adresses[c].url : ""; }

  function htmlFichiers(pieces, etat) {
    return pieces.map(function (p) {
      var url = adresse(p.chemin), vignette = adresse(p.vignette);
      var apercu = vignette ? '<span class="dl-apercu"><img src="' + esc(vignette) + '" alt=""></span>'
        : '<span class="dl-apercu">' + (estImage(p) ? ICONE_PHOTO : ICONE_DOCUMENT) + (estPdf(p) ? "<b>PDF</b>" : "") + "</span>";
      var corps = apercu + '<span class="dl-nom">' + esc(p.nom || p.chemin.split("/").pop()) + '</span><span class="dl-taille">' +
        esc(url ? tailleLisible(p.taille) : etat === "erreur" ? "Indisponible" : "Chargement…") + "</span>";
      return "<li>" + (url ? '<a class="dl-fichier" href="' + esc(url) + '" target="_blank" rel="noopener">' + corps + "</a>"
        : '<span class="dl-fichier attente">' + corps + "</span>") + "</li>";
    }).join("");
  }

  function ouvrirFiche(t, depuis) {
    if (fermerOuvert) fermerOuvert();
    var titre = t.texte || "Tâche", details = detailsDe(t), pieces = piecesDe(t);
    var fond = document.createElement("div");
    fond.className = "dl-fond";
    var fiche = document.createElement("div");
    fiche.className = "dl-fiche";
    fiche.setAttribute("role", "dialog");
    fiche.setAttribute("aria-modal", "true");
    fiche.setAttribute("aria-label", titre);
    fiche.innerHTML = '<div class="dl-titre">' + esc(titre) + "</div>" +
      (details ? '<div class="dl-details">' + esc(details) + "</div>" : "") +
      (pieces.length ? '<div class="dl-label">Fichiers</div><ul class="dl-liste">' + htmlFichiers(pieces, "attente") + "</ul>" +
        '<p class="dl-erreur" hidden>' + MESSAGE_RESEAU + "</p>" : "") +
      '<button type="button" class="dl-fermer">Fermer</button>';
    document.body.appendChild(fond);
    document.body.appendChild(fiche);
    // Capture : Échap ferme la fiche avant la feuille de la page ouvrier ;
    // les flèches ne changent pas la semaine derrière (page responsable).
    function touche(e) {
      if (e.key === "Escape") { e.stopPropagation(); fermer(); }
      else if (/^Arrow/.test(e.key)) e.stopPropagation();
    }
    function fermer() {
      fond.remove(); fiche.remove();
      document.removeEventListener("keydown", touche, true);
      if (fermerOuvert === fermer) fermerOuvert = null;
      if (depuis && depuis.isConnected) depuis.focus();
    }
    fermerOuvert = fermer;
    fond.addEventListener("click", fermer);
    fiche.querySelector(".dl-fermer").addEventListener("click", fermer);
    document.addEventListener("keydown", touche, true);
    fiche.querySelector(".dl-fermer").focus();
    if (!pieces.length) return;
    var chemins = [];
    pieces.forEach(function (p) { chemins.push(p.chemin); if (p.vignette) chemins.push(p.vignette); });
    var majListe = function (etat, serveur) {
      if (!fiche.isConnected) return;
      fiche.querySelector(".dl-liste").innerHTML = htmlFichiers(pieces, etat);
      var erreur = fiche.querySelector(".dl-erreur");
      erreur.hidden = etat !== "erreur";
      erreur.textContent = serveur ? MESSAGE_SERVEUR : MESSAGE_RESEAU;
    };
    demanderAdresses(chemins).then(function () {
      var manque = pieces.some(function (p) { return !adresse(p.chemin); });
      majListe(manque ? "erreur" : "ok", manque);
    }, function (e) { majListe("erreur", !!(e && e.serveur)); });
  }

  // Le bouton, ou toute la tâche quand la page la marque data-fiche-tache
  // (vue ouvrier) — sauf un autre bouton ou lien de la tâche (GPS).
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".tache-joint");
    if (!b && e.target.closest && !e.target.closest("a, button")) {
      var tache = e.target.closest("[data-fiche-tache]");
      b = tache && tache.querySelector(".tache-joint");
    }
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    var t = taches[+b.dataset.i];
    if (t) ouvrirFiche(t, b);
  });

  var style = document.createElement("style");
  style.textContent =
    ".tache-joint { display: inline-flex; align-items: center; gap: 3px; margin: -3px 0; padding: 3px 0; font: inherit; font-weight: 700; color: inherit; background: none; border: 0;" +
      " cursor: pointer; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; text-align: left; }\n" +
    ".tache-joint svg { width: 1.05em; height: 1.05em; flex: none; }\n" +
    "@media (hover: hover) and (pointer: fine) { .tache-joint:hover { text-decoration-thickness: 2px; } }\n" +
    "[data-fiche-tache] { cursor: pointer; }\n" +
    "@media (hover: hover) and (pointer: fine) { [data-fiche-tache]:hover { filter: brightness(.97); } }\n" +
    ".dl-fond { position: fixed; inset: 0; z-index: 40; background: rgba(10, 16, 22, .45); }\n" +
    ".dl-fiche { position: fixed; z-index: 41; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100vw - 32px)); max-height: calc(100vh - 48px);" +
      " box-sizing: border-box; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 16px; background: var(--surface); color: var(--ink);" +
      " border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 16px 40px rgba(0, 0, 0, .3); font-family: inherit; }\n" +
    ".dl-titre { margin: 0 2px; font-size: 16px; font-weight: 800; overflow-wrap: anywhere; }\n" +
    ".dl-details { font-size: 14.5px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }\n" +
    ".dl-label { margin: 4px 2px -4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--ink-faint); }\n" +
    ".dl-liste { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }\n" +
    ".dl-fichier { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 4px; border-radius: 10px; color: var(--ink); text-decoration: none; }\n" +
    "a.dl-fichier { background: var(--surface-2); }\n" +
    ".dl-fichier.attente { opacity: .7; }\n" +
    "@media (hover: hover) and (pointer: fine) { a.dl-fichier:hover { filter: brightness(.96); } }\n" +
    ".dl-apercu { flex: none; position: relative; width: 44px; height: 44px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface);" +
      " color: var(--ink-muted); display: grid; place-items: center; overflow: hidden; }\n" +
    ".dl-apercu svg { width: 22px; height: 22px; }\n" +
    ".dl-apercu b { position: absolute; left: 0; right: 0; bottom: 1px; text-align: center; font-size: 9px; font-weight: 800; color: var(--danger); }\n" +
    ".dl-apercu img { display: block; width: 100%; height: 100%; object-fit: cover; }\n" +
    ".dl-nom { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n" +
    ".dl-taille { flex: none; font-size: 12px; color: var(--ink-faint); padding-right: 6px; }\n" +
    ".dl-erreur { margin: 0 2px; font-size: 13px; color: var(--danger); }\n" +
    ".dl-fermer { display: flex; align-items: center; justify-content: center; min-height: 48px; margin-top: 4px; border-radius: 12px; font: inherit; font-size: 15px; font-weight: 700;" +
      " background: var(--surface-2); color: var(--ink); border: 1px solid var(--border); cursor: pointer; }\n" +
    "@media (max-width: 600px) { .dl-fiche { left: 0; right: 0; top: auto; bottom: 0; transform: none; width: auto; max-height: 85vh; border-width: 1px 0 0; border-radius: 18px 18px 0 0;" +
      " padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); } }\n";
  document.head.appendChild(style);
})();
