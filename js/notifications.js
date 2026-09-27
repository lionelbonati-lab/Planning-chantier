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
      aReserver: dernierResumeAReserver ? dernierResumeAReserver.length : 0
    };
  }
  function pluriel_(n, mot) { return n + " " + mot + (n > 1 ? "s" : ""); }

  function majBoutonNotifications() {
    var groupe = document.getElementById("groupeNotifications");
    var btn = document.getElementById("btnNotifications");
    var btnBas = document.getElementById("btnNotificationsNavBas");
    var n = nbNotifications_(), total = n.demandes + n.aReserver;
    var cache = !statutAReserverCle_() && !n.demandes;
    var titre = "Notifications — " + (total ? [
      n.demandes ? pluriel_(n.demandes, "demande") + " d’absence" : "",
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
      contenu.querySelectorAll(".ar-ligne").forEach(function (b) {
        b.addEventListener("click", function () {
          var g = (dernierResumeAReserver || [])[+b.dataset.i];
          fermer();
          if (g) allerATacheAReserver_(g);
        });
      });
    }
    dessiner();
    Promise.all([chargerDemandesAbsence(true), majAReserver()]).then(function () { if (pop.isConnected) dessiner(); });
  }

  function cablerNotifications() {
    var btn = document.getElementById("btnNotifications");
    if (btn) btn.addEventListener("click", function () { ouvrirNotifications(); });
    var btnBas = document.getElementById("btnNotificationsNavBas");
    if (btnBas) btnBas.addEventListener("click", function (e) { e.stopPropagation(); ouvrirNotifications(); });
  }
