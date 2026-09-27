"use strict";
  /* ============================================================
     DEMANDES D'ABSENCE — round du 27.09.2026 (suite 69)
     ------------------------------------------------------------
     Lionel : « Le lien de consultation des ouvriers doit pouvoir ajouter
     une absence que je doit valider dans mon planning. »

     L'ouvrier dépose sa demande depuis sa page de consultation
     (consultation.html, js/consultation.js) : elle arrive dans la table
     demandes_absence (sql/0020), JAMAIS directement dans `taches`. Ici,
     dans le planning :
       - un bandeau au-dessus de la grille, visible seulement s'il y a des
         demandes en attente : « 2 demandes d'absence à valider » ;
       - les demi-journées demandées sont hachurées (pointillés) sur la
         ligne de la personne, avec la demande en info-bulle ;
       - un clic sur le bandeau ouvre la liste : qui, quoi (« Congé -
         motif », suite 80), quand ; « Voir » amène le planning sur le premier jour,
         « Refuser » la classe refusée, « Accepter » pose les absences
         (une par demi-journée ouvrée, fériés sautés, au bout de chaque
         case — même écriture en vraies dates que la fiche,
         enregistrerTacheEnDatesServeur) puis la classe acceptée.
     L'ouvrier voit ensuite « Acceptée » ou « Refusée » sur sa page.

     Relu sur le serveur au démarrage, au plus toutes les 30 s après un
     rendu du planning, toutes les 2 minutes tant que l'onglet est visible
     et au retour sur l'onglet. Accepter efface l'historique d'annulation,
     comme toute écriture faite hors de la grille (cf. ecrireHorsFenetre).
     ============================================================ */

  var demandesAbsence = [];         // demandes en attente (lignes serveur)
  var derniereLectureDemandes_ = 0;
  var lectureDemandesEnCours_ = null;
  var traitementDemandeEnCours_ = false;

  function chargerDemandesAbsence(forcer) {
    if (!window.sbClient) return Promise.resolve(demandesAbsence);
    if (lectureDemandesEnCours_) return lectureDemandesEnCours_;
    if (!forcer && Date.now() - derniereLectureDemandes_ < 30000) return Promise.resolve(demandesAbsence);
    derniereLectureDemandes_ = Date.now();
    lectureDemandesEnCours_ = Promise.resolve(sbClient.from("demandes_absence")
      .select("id, personne_id, date_debut, date_fin, demi_debut, demi_fin, motif, remarque, statut, cree_le")
      .eq("statut", "en_attente").order("date_debut").limit(200))
      .then(function (res) {
        lectureDemandesEnCours_ = null;
        // Table absente (migration pas encore passée) ou serveur injoignable :
        // pas de bandeau, rien de cassé.
        if (res.error) return demandesAbsence;
        demandesAbsence = (res.data || []).slice().sort(function (a, b) {
          return a.date_debut < b.date_debut ? -1 : a.date_debut > b.date_debut ? 1 : a.id - b.id;
        });
        majBandeauDemandes();
        marquerCellulesDemandes();
        return demandesAbsence;
      }, function () { lectureDemandesEnCours_ = null; return demandesAbsence; });
    return lectureDemandesEnCours_;
  }
  // Appelé à chaque rendu (render, js/grille-rendu.js) : hachures reposées
  // tout de suite (la grille vient d'être reconstruite), relecture serveur
  // au plus toutes les 30 s.
  function apresRenduDemandes() {
    marquerCellulesDemandes();
    chargerDemandesAbsence(false);
  }

  // Round du 27.09.2026 (suite 80) — Lionel : « La remarque de la demande
  // de congé doit se mettre dans la bulle: "Congé - Motif". Motif à la
  // place de remarque. » Texte de l'absence posée à l'acceptation, et de
  // la demande partout où le bureau la voit (liste, info-bulle, message) :
  // le type choisi (colonne `motif` : Congé, Vacances…) puis le motif écrit
  // par l'ouvrier (colonne `remarque`, inchangée en base).
  function texteDemandeAbsence(q) {
    var type = q.motif || "Absence", motif = (q.remarque || "").trim();
    return motif ? type + " - " + motif : type;
  }
  function nomPersonneDemande_(q) {
    var p = personneParAncre(q.personne_id);
    return p ? p.nom : "?";
  }
  function libelleDemandeAbsence(q) {
    var j = function (iso) { return libelleDateCourteIso(iso).toLowerCase(); };
    if (q.date_debut === q.date_fin) {
      return "le " + j(q.date_debut) + (q.demi_debut === q.demi_fin ? (q.demi_debut === "aprem" ? " après-midi" : " matin") : "");
    }
    return "du " + j(q.date_debut) + (q.demi_debut === "aprem" ? " après-midi" : "") +
      " au " + j(q.date_fin) + (q.demi_fin === "matin" ? " matin" : "");
  }
  // Demi-journées couvertes : jours ouvrés (slotsPlageTacheIso), fériés
  // sautés — personne ne pose d'absence un jour déjà chômé.
  function slotsDemandeAbsence_(q) {
    return slotsPlageTacheIso(q.date_debut, q.date_fin, q.demi_debut, q.demi_fin).filter(function (s) { return !feriesParIso[s.date]; });
  }

  function majBandeauDemandes() {
    var b = document.getElementById("bandeauDemandes");
    if (!b) return;
    var n = demandesAbsence.length;
    b.hidden = !n;
    if (!n) return;
    b.querySelector(".bd-texte").textContent = n + " demande" + (n > 1 ? "s" : "") + " d’absence à valider";
  }

  function marquerCellulesDemandes() {
    var racine = document.getElementById("racine");
    if (!racine) return;
    racine.querySelectorAll(".cell.demande-absence").forEach(function (c) {
      c.classList.remove("demande-absence");
      if (c.dataset.titreDemande) { c.removeAttribute("title"); delete c.dataset.titreDemande; }
    });
    demandesAbsence.forEach(function (q) {
      var p = personneParAncre(q.personne_id);
      if (!p) return;
      var titre = "Demande d’absence de " + p.nom + " : " + texteDemandeAbsence(q) + " — " + libelleDemandeAbsence(q) + " (à valider)";
      slotsDemandeAbsence_(q).forEach(function (s) {
        var gi = giDepuisIso(s.date);
        if (gi == null) return;
        var c = racine.querySelector('.cell[data-kind="personne"][data-personne="' + p.id + '"][data-jour="' + gi + '"][data-demi="' + s.demi + '"]');
        if (!c) return;
        c.classList.add("demande-absence");
        if (!c.getAttribute("title")) { c.setAttribute("title", titre); c.dataset.titreDemande = "1"; }
      });
    });
  }

  function ouvrirDemandesAbsence() {
    if (popFermerActuel) popFermerActuel();
    var pop = document.createElement("div");
    pop.className = "pop form-pop pop-demandes-absence";
    pop.innerHTML = '<div class="cp-titre">Demandes d’absence</div><div class="da-contenu"><p class="da-vide">Chargement…</p></div>' +
      '<div class="form-actions"><button type="button" class="f-annuler">Fermer</button></div>';
    var bandeau = document.getElementById("bandeauDemandes");
    var r = bandeau && bandeau.getBoundingClientRect().width ? bandeau.getBoundingClientRect() : { left: window.innerWidth / 2 - 220, bottom: 80 };
    positionnerPop(pop, Math.round(r.left), Math.round(r.bottom + 6));
    var fermer = fermerAuClicExterieur(pop, null, null);
    pop.querySelector(".f-annuler").addEventListener("click", fermer);
    var contenu = pop.querySelector(".da-contenu");

    function dessiner() {
      if (!demandesAbsence.length) {
        contenu.innerHTML = '<p class="da-vide">Aucune demande en attente.</p>';
        return;
      }
      contenu.innerHTML = '<p class="da-aide">Envoyées depuis les liens de consultation. « Accepter » pose l’absence dans le planning.</p>' +
        '<ul class="da-liste">' + demandesAbsence.map(function (q) {
          return '<li data-id="' + esc2(q.id) + '"><div class="da-infos">' +
            '<span class="da-qui">' + esc(nomPersonneDemande_(q)) + "</span>" +
            '<span class="da-quoi">' + esc(texteDemandeAbsence(q)) + "</span>" +
            '<span class="da-quand">' + esc(libelleDemandeAbsence(q)) + "</span></div>" +
            '<div class="da-boutons">' +
            '<button type="button" class="lien-modifier da-voir">Voir</button>' +
            '<button type="button" class="lien-supprimer da-refuser">Refuser</button>' +
            '<button type="button" class="btn-enregistrer da-accepter">Accepter</button>' +
            "</div></li>";
        }).join("") + "</ul>";
      contenu.querySelectorAll(".da-liste li").forEach(function (li) {
        var q = demandesAbsence.filter(function (x) { return String(x.id) === li.dataset.id; })[0];
        if (!q) return;
        li.querySelector(".da-voir").addEventListener("click", function () {
          fermer();
          var pagePlanning = document.getElementById("page-planning");
          if (pagePlanning && !pagePlanning.classList.contains("actif")) {
            var onglet = document.querySelector('.onglet[data-page="planning"]');
            if (onglet) onglet.click();
          }
          allerAuJour(slotsDemandeAbsence_(q).length ? slotsDemandeAbsence_(q)[0].date : q.date_debut);
        });
        li.querySelector(".da-refuser").addEventListener("click", function () { traiterDemandeAbsence(q, false, dessiner); });
        li.querySelector(".da-accepter").addEventListener("click", function () { traiterDemandeAbsence(q, true, dessiner); });
      });
    }
    dessiner();
    chargerDemandesAbsence(true).then(function () { if (pop.isConnected) dessiner(); });
  }

  // Accepter : absences posées PUIS demande classée (si l'écriture des
  // absences échoue, la demande reste en attente — rien de perdu).
  function traiterDemandeAbsence(q, accepter, apres) {
    if (traitementDemandeEnCours_) return;
    traitementDemandeEnCours_ = true;
    occupe(true);
    var slots = accepter ? slotsDemandeAbsence_(q) : [];
    var chaine = accepter && slots.length
      ? attendreFinSynchro_().then(function () {
          return enregistrerTacheEnDatesServeur(q.personne_id, [], slots, { texte: texteDemandeAbsence(q), absence: true, important: false, chantier: null, statut: null });
        })
      : Promise.resolve();
    chaine.then(function () {
      return Promise.resolve(sbClient.from("demandes_absence")
        .update({ statut: accepter ? "acceptee" : "refusee", traitee_le: new Date().toISOString() }).eq("id", q.id));
    }).then(function (res) {
      if (res && res.error) throw res.error;
      traitementDemandeEnCours_ = false;
      occupe(false);
      demandesAbsence = demandesAbsence.filter(function (x) { return x.id !== q.id; });
      majBandeauDemandes();
      marquerCellulesDemandes();
      var qui = nomPersonneDemande_(q);
      if (accepter) {
        pileUndo = []; pileRedo = [];
        if (typeof majBoutonsUndo === "function") majBoutonsUndo();
        toast(("Absence de " + qui + " acceptée : " + texteDemandeAbsence(q) + " " + libelleDemandeAbsence(q) + ".").replace(/\.\.$/, "."));
        apresEcritureSerie();
      } else {
        toast("Demande de " + qui + " refusée.");
      }
      if (apres) apres();
    }).catch(function (err) {
      traitementDemandeEnCours_ = false;
      occupe(false);
      toast("Échec : " + (err && err.message ? err.message : err));
      if (accepter) apresEcritureSerie();
    });
  }

  function cablerDemandesAbsence() {
    var b = document.getElementById("bandeauDemandes");
    if (b) b.addEventListener("click", ouvrirDemandesAbsence);
    setInterval(function () { if (!document.hidden) chargerDemandesAbsence(true); }, 120000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) chargerDemandesAbsence(false); });
  }
