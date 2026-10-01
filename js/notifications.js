"use strict";
  /* ============================================================
     NOTIFICATIONS — round du 27.09.2026 (suite 81)
     ------------------------------------------------------------
     Lionel : « J'aimerai un bouton notifications à la place de celui de
     statut. On y placera les demandes de congés et les statuts à
     réserver. On peut retirer les statuts réserver et confirmer de cette
     section. »

     Bouton cloche (#btnNotifications) à la place de « À réserver » dans
     la barre d'outils (même rang, même repli dans « ⋮ », cf. REPLIS_ORDRE
     dans js/grille-rendu.js) et dans la barre du bas du téléphone
     (#btnNotificationsNavBas). Son compteur additionne ce qui attend :
       - les demandes d'absence envoyées depuis les liens de consultation
         (js/demandes-absence.js — elles remplacent le bandeau au-dessus
         du planning) ;
       - les tâches « à réserver » à partir d'aujourd'hui
         (js/a-reserver.js — plus de pastilles réservé / confirmé).
     Un clic ouvre la fenêtre « Notifications » : une section par sorte,
     avec son nombre ; demandes : Voir / Refuser / Accepter ; tâches : un
     clic amène le planning sur le jour et sélectionne la tâche.

     Le bouton est affiché dès qu'il existe un statut ou une demande en
     attente (comme « À réserver » s'affichait dès qu'il existait un
     statut).
     ============================================================ */

  function nbNotifications_() {
    return {
      demandes: demandesAbsence.length,
      aReserver: dernierResumeAReserver ? dernierResumeAReserver.length : 0,
      importants: importantsEnCours_().length
    };
  }

  // ---- Importants des 7 prochains jours (round du 29.09.2026, suite 125)
  // Lionel : « Notification pour important dans le bouton notif. », puis
  // « 7 prochains jours » à notre question sur la période. Tout ce qui
  // porte le drapeau « important » d'aujourd'hui à dans 6 jours (7 jours
  // de calendrier, week-end compris) : tâches et absences des personnes
  // affichées, jalons, notes. Lu sur le serveur comme « à réserver » (une
  // semaine pas encore chargée compte aussi), relu après chaque rendu (au
  // plus toutes les 1,5 s). Une tâche sur plusieurs jours de suite (une
  // ligne par demi-journée en base) ne compte qu'une fois : même
  // regroupement que « à réserver » (même sorte, personne, texte,
  // chantier, sur des jours ouvrés qui se suivent).
  var dernierImportants = null;
  function chargerImportants_() {
    var du = etat.aujourdhui, au = decalerIsoJours_(du, 6);
    var personnes = (etat.personnesActives || []).map(function (p) { return p.id; });
    function lire(q) { return Promise.resolve(q).then(function (res) { if (res.error) throw res.error; return res.data || []; }); }
    return Promise.all([
      personnes.length ? lire(sbClient.from("taches").select("personne_id, date, demi, texte, chantier_id, est_absence")
        .eq("important", true).in("personne_id", personnes).gte("date", du).lte("date", au).order("date").limit(2000)) : [],
      lire(sbClient.from("jalons").select("date, demi, texte, chantier_id").eq("important", true).gte("date", du).lte("date", au).order("date").limit(500)),
      lire(sbClient.from("notes").select("date, demi, texte, chantier_id").eq("important", true).gte("date", du).lte("date", au).order("date").limit(500))
    ]).then(function (r) {
      return r[0].map(function (t) { return Object.assign({ sorte: t.est_absence ? "absence" : "tache" }, t); })
        .concat(r[1].map(function (j) { return Object.assign({ sorte: "jalon" }, j); }))
        .concat(r[2].map(function (n) { return Object.assign({ sorte: "note" }, n); }));
    });
  }
  // Entrées {sorte, personneId, texte, chantierId, du, au, demis}, triées
  // par date, puis jalons, notes et personnes dans l'ordre du planning.
  function regrouperImportants_(lignes) {
    var ordre = { jalon: -2, note: -1 };
    (etat.personnesActives || []).forEach(function (p, i) { ordre["p" + p.id] = i; });
    var cle = function (t) { return [t.sorte, t.personne_id == null ? "" : t.personne_id, t.texte || "", t.chantier_id == null ? "" : t.chantier_id].join("|"); };
    var groupes = [], g = null;
    lignes.slice().sort(function (a, b) {
      var ka = cle(a), kb = cle(b);
      if (ka !== kb) return ka < kb ? -1 : 1;
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.demi === "aprem" ? 1 : 0) - (b.demi === "aprem" ? 1 : 0);
    }).forEach(function (t) {
      var demi = t.demi === "matin" || t.demi === "aprem" ? t.demi : "jour";
      if (g && g.k === cle(t) && (t.date === g.au || t.date === prochainJourOuvreIso_(g.au))) { g.au = t.date; g.demis[t.date + "|" + demi] = true; return; }
      g = { k: cle(t), sorte: t.sorte, personneId: t.personne_id == null ? null : t.personne_id, texte: t.texte || "", chantierId: t.chantier_id == null ? null : t.chantier_id, du: t.date, au: t.date, demis: {} };
      g.demis[t.date + "|" + demi] = true;
      groupes.push(g);
    });
    var rang = function (x) { var r = x.personneId != null ? ordre["p" + x.personneId] : ordre[x.sorte]; return r == null ? 999 : r; };
    return groupes.sort(function (a, b) { return a.du !== b.du ? (a.du < b.du ? -1 : 1) : rang(a) - rang(b); });
  }
  // Round du 01.10.2026 (suite 134) — Lionel : « Affichée note importante
  // comme passée dès que l'horaire de la tâche est dépassé. » Son choix :
  // « Retirer de la liste ». Un important sort de la liste (et du compteur)
  // dès la fin de sa dernière demi-journée, selon la page Horaires : fin du
  // matin s'il ne porte que sur le matin ce jour-là, sinon fin de la
  // journée. Jour sans horaire (week-end, période non saisie) : 12:00 pour
  // le matin, 18:00 sinon. Revu chaque minute (cf. cablerNotifications).
  function finImportant_(g) {
    var h = horaireDuJour(g.au);
    var matinSeul = g.demis[g.au + "|matin"] && !g.demis[g.au + "|aprem"] && !g.demis[g.au + "|jour"];
    if (matinSeul) return h ? h.matin.split("–")[1] : "12:00";
    return h ? h.fin : "18:00";
  }
  function importantsEnCours_() {
    var d = new Date(), deux = function (n) { return (n < 10 ? "0" : "") + n; };
    var jour = d.getFullYear() + "-" + deux(d.getMonth() + 1) + "-" + deux(d.getDate()), heure = deux(d.getHours()) + ":" + deux(d.getMinutes());
    return (dernierImportants || []).filter(function (g) { return g.au > jour || (g.au === jour && heure < finImportant_(g)); });
  }
  function majImportants() {
    if (!window.sbClient || !etat.aujourdhui) return Promise.resolve();
    return chargerImportants_().then(function (lignes) {
      dernierImportants = regrouperImportants_(lignes);
      majBoutonNotifications();
    }).catch(function () { /* compteur laissé tel quel : réessayé au prochain rendu */ });
  }
  function htmlLigneImportant_(g, i) {
    var p = g.personneId != null ? personneParAncre(g.personneId) : null;
    var qui = g.sorte === "jalon" ? "Jalon" : g.sorte === "note" ? "Note" : (p ? p.nom : "?") + (g.sorte === "absence" ? " · absence" : "");
    var ch = g.chantierId != null ? CHANTIERS[etat.chantiersParId[g.chantierId]] : null;
    return '<li><button type="button" class="ar-ligne imp-ligne" data-i="' + i + '" title="Voir dans le planning">' +
      '<span class="ar-quand">' + esc(quandAReserver_(g)) + "</span>" +
      '<span class="ar-qui">' + esc(qui) + "</span>" +
      '<span class="ar-quoi">' + esc(g.texte || "(sans texte)") + "</span>" +
      (ch ? '<span class="ar-chantier"><span class="swatch" style="background:' + esc2(ch.couleur) + '"></span>' + esc(ch.nom) + "</span>" : "") +
      "</button></li>";
  }
  // Un clic : le planning va au jour, la bulle est sélectionnée, amenée à
  // l'écran et clignote (comme une ligne « à réserver », suite 61).
  function allerAImportant_(g) {
    var pagePlanning = document.getElementById("page-planning");
    if (pagePlanning && !pagePlanning.classList.contains("actif")) {
      var onglet = document.querySelector('.onglet[data-page="planning"]');
      if (onglet) onglet.click();
    }
    allerAuJour(g.du, function () {
      var gi = giDepuisIso(g.du);
      if (gi == null) return;
      var liste = g.sorte === "jalon" ? JALONS : g.sorte === "note" ? NOTES : TACHES;
      var chantierTache = g.chantierId != null ? etat.chantiersParId[g.chantierId] : null;
      var it = liste.filter(function (t) {
        // Drapeau d'un jalon : pas chargé dans la grille (cf. diffsJalons).
        if ((liste !== JALONS && !t.important) || (t.texte || "") !== g.texte || gi < t.giDebut || gi >= t.giDebut + t.duree) return false;
        if (liste !== TACHES) return (t.chantierId || null) === g.chantierId;
        return String(t.personneId) === String(g.personneId) && (t.chantier || null) === (chantierTache || null);
      })[0];
      if (!it) return;
      quitterModeSelection();
      bullesSelectionnees[it.id] = true;
      majBarreSelection();
      var dom = document.querySelector('.bulle[data-id="' + it.id + '"]');
      if (!dom) return;
      dom.classList.add("selectionnee");
      amenerBulleEnVue_(dom);
      dom.classList.remove("bulle-retrouvee");
      void dom.offsetWidth;
      dom.classList.add("bulle-retrouvee");
      setTimeout(function () { dom.classList.remove("bulle-retrouvee"); }, 1300);
    });
  }
  function pluriel_(n, mot) { return n + " " + mot + (n > 1 ? "s" : ""); }

  function majBoutonNotifications() {
    var groupe = document.getElementById("groupeNotifications");
    var btn = document.getElementById("btnNotifications");
    var btnBas = document.getElementById("btnNotificationsNavBas");
    var n = nbNotifications_(), total = n.demandes + n.aReserver + n.importants;
    var cache = !statutAReserverCle_() && !n.demandes && !n.importants;
    var titre = "Notifications — " + (total ? [
      n.demandes ? pluriel_(n.demandes, "demande") + " d’absence" : "",
      n.importants ? pluriel_(n.importants, "important") + " (7 jours)" : "",
      n.aReserver ? pluriel_(n.aReserver, "tâche") + " « " + nomStatutAReserver_().toLowerCase() + " »" : ""
    ].filter(Boolean).join(", ") : "rien en attente");
    var change = false;
    if (groupe && groupe.hidden !== cache) { groupe.hidden = cache; change = true; }
    [btn, btnBas].forEach(function (b) {
      if (!b) return;
      if (b === btnBas) b.hidden = cache;
      var badge = b.querySelector(".compte-notifications");
      if (badge.textContent !== String(total)) change = true;
      badge.textContent = total;
      badge.hidden = !total;
      b.title = titre;
      b.setAttribute("aria-label", titre);
    });
    // Apparition du bouton, compteur à 2 chiffres : la barre est remesurée
    // (suite 50 — un compteur plus large pouvait pousser « ⋮ » hors de la
    // barre d'un téléphone étroit).
    if (change && typeof ajusterDebordementToolbar === "function") ajusterDebordementToolbar();
  }

  function ouvrirNotifications() {
    if (popFermerActuel) popFermerActuel();
    var pop = document.createElement("div");
    pop.className = "pop form-pop pop-notifications";
    pop.innerHTML = '<div class="cp-titre">Notifications</div><div class="notif-contenu"></div>' +
      '<div class="form-actions"><button type="button" class="f-annuler">Fermer</button></div>';
    var btn = document.getElementById("btnNotifications");
    var r = btn && btn.getBoundingClientRect().width ? btn.getBoundingClientRect() : { left: window.innerWidth / 2 - 240, bottom: 80 };
    positionnerPop(pop, Math.round(r.left), Math.round(r.bottom + 6));
    var fermer = fermerAuClicExterieur(pop, null, null);
    pop.querySelector(".f-annuler").addEventListener("click", fermer);
    var contenu = pop.querySelector(".notif-contenu");

    function titreSection(classe, icone, nom, n) {
      return '<div class="notif-titre ' + classe + '">' + icone + '<span>' + esc(nom) + '</span><b class="notif-nombre">' + n + "</b></div>";
    }
    function dessiner() {
      var n = nbNotifications_();
      var html = '<section class="notif-section notif-demandes">' + titreSection("", ICONS.absence, "Demandes d’absence", n.demandes) +
        htmlDemandesAbsence_() + "</section>";
      // Suite 125 : importants des 7 prochains jours — la section n'apparaît
      // que s'il y en a.
      var imp = importantsEnCours_(); // suite 134 : sans les passés
      if (imp.length) html += '<section class="notif-section notif-importants">' + titreSection("", ICONS.important, "Importants — 7 prochains jours", imp.length) +
        '<ul class="ar-liste">' + imp.map(htmlLigneImportant_).join("") + "</ul></section>";
      var nomStatut = nomStatutAReserver_();
      if (nomStatut) {
        var liste = dernierResumeAReserver || [];
        html += '<section class="notif-section notif-a-reserver">' + titreSection("", ICONS.reserver, nomStatut, liste.length) +
          (dernierResumeAReserver === null ? '<p class="notif-vide">Chargement…</p>'
            : !liste.length ? '<p class="notif-vide">Aucune tâche « ' + esc(nomStatut) + " » à partir d’aujourd’hui.</p>"
            : '<ul class="ar-liste">' + liste.map(htmlLigneAReserver_).join("") + "</ul>") +
          "</section>";
      }
      contenu.innerHTML = html;
      cablerListeDemandes_(contenu, fermer, function () { majBoutonNotifications(); if (pop.isConnected) dessiner(); });
      contenu.querySelectorAll(".imp-ligne").forEach(function (b) {
        b.addEventListener("click", function () {
          var g = imp[+b.dataset.i];
          fermer();
          if (g) allerAImportant_(g);
        });
      });
      contenu.querySelectorAll(".ar-ligne:not(.imp-ligne)").forEach(function (b) {
        b.addEventListener("click", function () {
          var g = (dernierResumeAReserver || [])[+b.dataset.i];
          fermer();
          if (g) allerATacheAReserver_(g);
        });
      });
    }
    dessiner();
    Promise.all([chargerDemandesAbsence(true), majAReserver(), majImportants()]).then(function () { if (pop.isConnected) dessiner(); });
  }

  function cablerNotifications() {
    var btn = document.getElementById("btnNotifications");
    if (btn) btn.addEventListener("click", function () { ouvrirNotifications(); });
    var btnBas = document.getElementById("btnNotificationsNavBas");
    if (btnBas) btnBas.addEventListener("click", function (e) { e.stopPropagation(); ouvrirNotifications(); });
    // Suite 134 : un important dont l'horaire est passé quitte le compteur
    // sans attendre le prochain rendu du planning.
    setInterval(function () { if (dernierImportants && dernierImportants.length) majBoutonNotifications(); }, 60000);
  }
