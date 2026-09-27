"use strict";
  /* ============================================================
     RÉSUMÉ « À RÉSERVER » — round du 25.09.2026 (suite 47)
     ------------------------------------------------------------
     Lionel : « Un résumé facilement accessible des statuts à réserver
     serait bien aussi. »

     Bouton de la barre d'outils du planning (#btnAReserver ; replié dans
     « ⋮ » après le zoom et les masquages quand la barre manque de place —
     sur téléphone aussi depuis la suite 50 —, une pastille sur « ⋮ » le
     signale alors) avec le nombre de tâches encore
     « à réserver » à partir d'aujourd'hui. Un clic ouvre la liste, triée
     par date : quand, qui, quoi, quel chantier ; un clic sur une ligne
     amène le planning sur ce jour. Des pastilles en haut de la liste
     passent aux autres statuts (réservé, confirmé…) : même résumé.

     Round du 27.09.2026 (suite 81) — Lionel : « J'aimerai un bouton
     notifications à la place de celui de statut. On y placera les
     demandes de congés et les statuts à réserver. On peut retirer les
     statuts réserver et confirmer de cette section. » Le bouton et la
     fenêtre sont désormais ceux des notifications (js/notifications.js) ;
     ce fichier ne fait plus que lire et regrouper les tâches « à
     réserver » (dernierResumeAReserver), sans les pastilles des autres
     statuts.

     Lu directement sur le serveur (table taches, statut_id, date >=
     aujourd'hui), pas dans les semaines chargées : une réservation dans 3
     mois compte aussi. Une tâche posée sur plusieurs jours de suite (une
     ligne par demi-journée en base) ne compte qu'une fois : les lignes
     d'une même personne, même texte, même chantier, même statut, sur des
     jours ouvrés qui se suivent, sont regroupées en une plage « lun. 28
     sept. → ven. 2 oct. ». Le compteur est relu (au plus toutes les 1,5 s)
     après chaque rendu du planning : il suit les modifications.
     ============================================================ */

  // Statut résumé par défaut : « à réserver » (clé areserver) s'il existe,
  // sinon le premier de la page Statuts.
  function statutAReserverCle_() {
    var liste = (etat.statutsServeur || []).slice().sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); });
    for (var i = 0; i < liste.length; i++) if (liste[i].cle === "areserver") return liste[i].cle;
    return liste.length ? liste[0].cle : null;
  }
  function premiereMajuscule_(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : ""; }

  // Toutes les tâches avec un statut, d'aujourd'hui à la fin du planning,
  // des personnes affichées au planning.
  function chargerTachesAvecStatut_() {
    var ids = Object.keys(etat.statutsParId || {}).map(Number);
    var personnes = (etat.personnesActives || []).map(function (p) { return p.id; });
    if (!ids.length || !personnes.length) return Promise.resolve([]);
    return Promise.resolve(sbClient.from("taches").select("personne_id, date, demi, texte, statut_id, chantier_id")
      .in("statut_id", ids).in("personne_id", personnes).gte("date", etat.aujourdhui).order("date").limit(2000))
      .then(function (res) { if (res.error) throw res.error; return res.data || []; });
  }

  // Regroupe les lignes en entrées {cle statut, personneId, texte,
  // chantier, du, au, demis}, triées par date puis par ordre des personnes.
  function regrouperAReserver(lignes) {
    var ordrePersonne = {};
    (etat.personnesActives || []).forEach(function (p, i) { ordrePersonne[p.id] = i; });
    var cle = function (t) { return [t.statut_id, t.personne_id, t.texte || "", t.chantier_id == null ? "" : t.chantier_id].join("|"); };
    var triees = lignes.slice().sort(function (a, b) {
      var ka = cle(a), kb = cle(b);
      if (ka !== kb) return ka < kb ? -1 : 1;
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.demi === "matin" ? 0 : 1) - (b.demi === "matin" ? 0 : 1);
    });
    var groupes = [], g = null;
    triees.forEach(function (t) {
      if (g && g.k === cle(t) && (t.date === g.au || t.date === prochainJourOuvreIso_(g.au))) {
        g.au = t.date; g.demis[t.date + "|" + t.demi] = true;
        return;
      }
      g = {
        k: cle(t), statut: etat.statutsParId[t.statut_id] || null, personneId: t.personne_id, texte: t.texte || "",
        chantier: t.chantier_id != null ? (etat.chantiersParId[t.chantier_id] || null) : null,
        du: t.date, au: t.date, demis: {}
      };
      g.demis[t.date + "|" + t.demi] = true;
      groupes.push(g);
    });
    return groupes.sort(function (a, b) {
      if (a.du !== b.du) return a.du < b.du ? -1 : 1;
      return (ordrePersonne[a.personneId] || 0) - (ordrePersonne[b.personneId] || 0);
    });
  }

  // « lun. 28 sept. », année ajoutée si ce n'est pas l'année en cours.
  function dateAReserver_(iso) {
    return libelleDateCourteIso(iso) + (iso.slice(0, 4) !== etat.aujourdhui.slice(0, 4) ? " " + iso.slice(0, 4) : "");
  }
  function quandAReserver_(g) {
    if (g.du !== g.au) return dateAReserver_(g.du) + " → " + dateAReserver_(g.au);
    var matin = g.demis[g.du + "|matin"], aprem = g.demis[g.du + "|aprem"];
    return dateAReserver_(g.du) + (matin && !aprem ? ", matin" : aprem && !matin ? ", après-midi" : "");
  }

  // Tâches à réserver : relues après chaque rendu, au plus toutes les 1,5 s.
  var minuteurAReserver = null, dernierResumeAReserver = null;
  // Le bouton « Notifications » (affiché s'il existe un statut ou une
  // demande) est montré ou caché tout de suite, pas 1,5 s plus tard : un
  // bouton qui apparaît après coup décalerait toute la barre sous le
  // doigt/la souris.
  function planifierMajAReserver() {
    majBoutonNotifications();
    clearTimeout(minuteurAReserver);
    if (statutAReserverCle_()) minuteurAReserver = setTimeout(majAReserver, 1500);
  }
  function majAReserver() {
    if (!window.sbClient || !statutAReserverCle_()) return Promise.resolve();
    return chargerTachesAvecStatut_().then(function (lignes) {
      var cle = statutAReserverCle_();
      // Suite 81 : seules les tâches « à réserver » (plus de pastilles pour
      // réservé, confirmé…).
      dernierResumeAReserver = regrouperAReserver(lignes).filter(function (g) { return g.statut === cle; });
      majBoutonNotifications();
    }).catch(function () { /* compteur laissé tel quel : réessayé au prochain rendu */ });
  }
  // Nom du statut résumé, pour le titre de sa section (« À réserver »).
  function nomStatutAReserver_() {
    var cle = statutAReserverCle_();
    return cle ? premiereMajuscule_((STATUTS[cle] || { nom: cle }).nom) : "";
  }

  // Une ligne de la liste : quand, qui, quoi, chantier ; un clic amène le
  // planning sur ce jour et y sélectionne la tâche (suite 61).
  function htmlLigneAReserver_(g, i) {
    var p = personneParAncre(g.personneId);
    var ch = g.chantier && CHANTIERS[g.chantier];
    return '<li><button type="button" class="ar-ligne" data-i="' + i + '" title="Voir dans le planning">' +
      '<span class="ar-quand">' + esc(quandAReserver_(g)) + "</span>" +
      '<span class="ar-qui">' + esc(p ? p.nom : "?") + "</span>" +
      '<span class="ar-quoi">' + esc(g.texte || "(sans texte)") + "</span>" +
      (ch ? '<span class="ar-chantier"><span class="swatch" style="background:' + esc2(ch.couleur) + '"></span>' + esc(ch.nom) + "</span>" : "") +
      "</button></li>";
  }
  function allerATacheAReserver_(g) {
    // Ouvert depuis la barre du bas sur une autre page (suite 53) :
    // retour au planning d'abord.
    var pagePlanning = document.getElementById("page-planning");
    if (pagePlanning && !pagePlanning.classList.contains("actif")) {
      var onglet = document.querySelector('.onglet[data-page="planning"]');
      if (onglet) onglet.click();
    }
    allerAuJour(g.du, function () { selectionnerDepuisResume_(g); });
  }

  // Round du 26.09.2026 (suite 61) — Lionel : « Quand on appuie sur une
  // tâche dans le résumé des statuts, le planning se place sur la semaine de
  // la tâche, c'est une bonne idée, ajoute la sélection automatique de la
  // tâche pour la retrouver plus vite et pouvoir faire les ajustements
  // nécessaires. » Une fois la semaine affichée : la bulle de cette tâche
  // (même personne, texte, statut, chantier, et couvrant son 1er jour) est
  // sélectionnée seule, comme d'un clic — Entrée l'ouvre, Suppr, Ctrl+X,
  // glisser… marchent tout de suite —, amenée à l'écran si elle est plus
  // bas (ou à droite), et clignote une seconde pour que l'œil la trouve.
  function selectionnerDepuisResume_(g) {
    var gi = giDepuisIso(g.du);
    var it = gi == null ? null : TACHES.filter(function (t) {
      return String(t.personneId) === String(g.personneId) && (t.texte || "") === g.texte &&
        (t.statut || null) === (g.statut || null) && (t.chantier || null) === (g.chantier || null) &&
        gi >= t.giDebut && gi < t.giDebut + t.duree;
    })[0];
    if (!it) return;
    quitterModeSelection();
    bullesSelectionnees[it.id] = true;
    var dom = document.querySelector('.bulle[data-id="' + it.id + '"]');
    majBarreSelection();
    if (!dom) return;
    dom.classList.add("selectionnee");
    amenerBulleEnVue_(dom);
    dom.classList.remove("bulle-retrouvee");
    void dom.offsetWidth; // relance l'animation si la même bulle est choisie deux fois
    dom.classList.add("bulle-retrouvee");
    setTimeout(function () { dom.classList.remove("bulle-retrouvee"); }, 1300);
  }
  // Verticalement : entre l'en-tête figé du planning et le bas de l'écran
  // (barre du bas du téléphone comprise), seul #app défile. En largeur (2
  // semaines serrées, zoom) : le planning défile jusqu'à la bulle, à droite
  // de la colonne des noms — jamais en vue « 1 jour » du téléphone, où le
  // jour est déjà calé.
  function amenerBulleEnVue_(dom) {
    var app = document.getElementById("app"), r = dom.getBoundingClientRect();
    var entete = document.querySelector(".entete-planning-figee");
    var navBas = document.getElementById("navBas");
    var haut = (entete ? entete.getBoundingClientRect().bottom : 0) + 8;
    var bas = (navBas && navBas.offsetParent !== null ? navBas.getBoundingClientRect().top : window.innerHeight) - 8;
    if (app && r.top < haut) app.scrollTop -= haut - r.top;
    else if (app && r.bottom > bas) app.scrollTop += Math.min(r.bottom - bas, r.top - haut);
    var scroller = dom.closest(".scroller");
    // Jours voisins aux bords (suite 74) : défilement tenu, rien à amener.
    if (!scroller || modeJourMobileActif() || scroller.classList.contains("vue-bords")) return;
    var rs = scroller.getBoundingClientRect(), gauche = rs.left + largeurNoms() * ((niveauZoomPlanning / 100) || 1) + 8;
    if (r.left < gauche) scroller.scrollLeft -= gauche - r.left;
    else if (r.right > rs.right - 8) scroller.scrollLeft += Math.min(r.right - rs.right + 8, r.left - gauche);
  }
