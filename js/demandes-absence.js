"use strict";
  /* ============================================================
     DEMANDES D'ABSENCE — round du 27.09.2026 (suite 69)
     ------------------------------------------------------------
     Lionel : « Le lien de consultation des ouvriers doit pouvoir ajouter
     une absence que je doit valider dans mon planning. »

     L'ouvrier dépose sa demande depuis sa page de consultation
     (consultation.html, js/consultation.js) : elle arrive dans la table
     demandes_absence (sql/0020), JAMAIS directement dans `taches`. Ici,
     dans le planning :
       - un bandeau au-dessus de la grille, visible seulement s'il y a des
         demandes en attente (suite 81 : remplacé par la section « Demandes
         d'absence » des notifications, js/notifications.js — la cloche
         les compte) ;
       - les demi-journées demandées sont hachurées (pointillés) sur la
         ligne de la personne, avec la demande en info-bulle ;
       - la liste (dans les notifications depuis la suite 81) : qui, quoi (« Congé -
         motif », suite 80), quand ; « Voir » amène le planning sur le premier jour,
         « Refuser » la classe refusée, « Accepter » pose les absences
         (une par demi-journée ouvrée, fériés sautés, au bout de chaque
         case — même écriture en vraies dates que la fiche,
         enregistrerTacheEnDatesServeur) puis la classe acceptée.
     L'ouvrier voit ensuite « Acceptée » ou « Refusée » sur sa page.

     Round du 27.09.2026 (suite 83) — Lionel, page de consultation :
     « Possibilité de modifier (nouvelle demande d'approbation) ou annuler
     (Notification dans console bureau) une absence validé. » Deux sortes
     de demandes en plus (colonne type, sql/0021), liées à l'absence
     acceptée qu'elles visent (remplace_id → q.origine) :
       - « Modification » : Accepter retire les absences de l'ancienne
         demande (à partir d'aujourd'hui : le passé reste tel quel) puis
         pose les nouvelles ; l'ancienne passe « remplacee » ;
       - « Annulation » : Accepter retire les absences ; l'ancienne passe
         « annulee ».
     Refuser : l'absence acceptée reste telle quelle. Les absences
     retirées : celles de la personne, dans les demi-journées de l'ancienne
     demande, au texte « Type - Motif » (toutes les absences de ces cases
     si le bureau a changé le texte entre-temps).

     Relu sur le serveur au démarrage, au plus toutes les 30 s après un
     rendu du planning, toutes les 2 minutes tant que l'onglet est visible
     et au retour sur l'onglet. Accepter efface l'historique d'annulation,
     comme toute écriture faite hors de la grille (cf. ecrireHorsFenetre).
     ============================================================ */

  var demandesAbsence = [];         // demandes en attente (lignes serveur)
  var derniereLectureDemandes_ = 0;
  var lectureDemandesEnCours_ = null;
  var traitementDemandeEnCours_ = false;
  var COLONNES_DEMANDES_ = "id, personne_id, date_debut, date_fin, demi_debut, demi_fin, motif, remarque, statut, cree_le, type, remplace_id";

  function chargerDemandesAbsence(forcer) {
    if (!window.sbClient) return Promise.resolve(demandesAbsence);
    if (lectureDemandesEnCours_) return lectureDemandesEnCours_;
    if (!forcer && Date.now() - derniereLectureDemandes_ < 30000) return Promise.resolve(demandesAbsence);
    derniereLectureDemandes_ = Date.now();
    lectureDemandesEnCours_ = Promise.resolve(sbClient.from("demandes_absence")
      .select(COLONNES_DEMANDES_)
      .eq("statut", "en_attente").order("date_debut").limit(200))
      .then(function (res) {
        // Table absente (migration pas encore passée) ou serveur injoignable :
        // rien dans les notifications, rien de cassé.
        if (res.error) return res;
        // Suite 83 : l'absence acceptée visée par une modification ou une
        // annulation (q.origine).
        var ids = (res.data || []).map(function (q) { return q.remplace_id; }).filter(function (id) { return id != null; });
        if (!ids.length) return res;
        return Promise.resolve(sbClient.from("demandes_absence").select(COLONNES_DEMANDES_).in("id", ids)).then(function (r2) {
          var parId = {};
          ((r2 && r2.data) || []).forEach(function (o) { parId[o.id] = o; });
          res.data.forEach(function (q) { if (q.remplace_id != null) q.origine = parId[q.remplace_id] || null; });
          return res;
        }, function () { return res; });
      })
      .then(function (res) {
        lectureDemandesEnCours_ = null;
        if (res.error) return demandesAbsence;
        demandesAbsence = (res.data || []).slice().sort(function (a, b) {
          return a.date_debut < b.date_debut ? -1 : a.date_debut > b.date_debut ? 1 : a.id - b.id;
        });
        majBoutonNotifications();
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

  // Round du 27.09.2026 (suite 80) — Lionel : « La remarque de la demande
  // de congé doit se mettre dans la bulle: "Congé - Motif". Motif à la
  // place de remarque. » Texte de l'absence posée à l'acceptation, et de
  // la demande partout où le bureau la voit (liste, info-bulle, message) :
  // le type choisi (colonne `motif` : Congé, Vacances…) puis le motif écrit
  // par l'ouvrier (colonne `remarque`, inchangée en base).
  function texteDemandeAbsence(q) {
    var type = q.motif || "Absence", motif = (q.remarque || "").trim();
    return motif ? type + " - " + motif : type;
  }
  // Suite 83 : ce que la liste montre dans « quoi » selon la sorte.
  function typeDemande_(q) { return q.type || "nouvelle"; }
  function quoiDemandeAbsence_(q) {
    var t = typeDemande_(q);
    return (t === "modification" ? "Modification : " : t === "annulation" ? "Annulation : " : "") + texteDemandeAbsence(q);
  }
  function quandDemandeAbsence_(q) {
    var avant = typeDemande_(q) === "modification" && q.origine;
    return libelleDemandeAbsence(q) + (avant ? " — avant : " + (texteDemandeAbsence(q.origine) !== texteDemandeAbsence(q) ? texteDemandeAbsence(q.origine) + ", " : "") + libelleDemandeAbsence(q.origine) : "");
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
      var t = typeDemande_(q);
      var titre = (t === "modification" ? "Modification d’absence de " : t === "annulation" ? "Annulation d’absence de " : "Demande d’absence de ") +
        p.nom + " : " + texteDemandeAbsence(q) + " — " + libelleDemandeAbsence(q) + " (à valider)";
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

  // Liste des demandes, dans la section « Demandes d'absence » des
  // notifications (suite 81 ; avant, fenêtre ouverte par le bandeau) :
  // qui, quoi, quand ; Voir / Refuser / Accepter.
  function htmlDemandesAbsence_() {
    if (!demandesAbsence.length) return '<p class="notif-vide">Aucune demande en attente.</p>';
    return '<ul class="da-liste">' + demandesAbsence.map(function (q) {
      return '<li data-id="' + esc2(q.id) + '" class="da-' + typeDemande_(q) + '"><div class="da-infos">' +
        '<span class="da-qui">' + esc(nomPersonneDemande_(q)) + "</span>" +
        '<span class="da-quoi">' + esc(quoiDemandeAbsence_(q)) + "</span>" +
        '<span class="da-quand">' + esc(quandDemandeAbsence_(q)) + "</span></div>" +
        '<div class="da-boutons">' +
        '<button type="button" class="lien-modifier da-voir">Voir</button>' +
        '<button type="button" class="lien-supprimer da-refuser">Refuser</button>' +
        '<button type="button" class="btn-enregistrer da-accepter">Accepter</button>' +
        "</div></li>";
    }).join("") + "</ul>";
  }
  // fermer : ferme la fenêtre (« Voir ») ; redessiner : après Accepter /
  // Refuser, la demande quitte la liste.
  function cablerListeDemandes_(conteneur, fermer, redessiner) {
    conteneur.querySelectorAll(".da-liste li").forEach(function (li) {
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
      li.querySelector(".da-refuser").addEventListener("click", function () { traiterDemandeAbsence(q, false, redessiner); });
      li.querySelector(".da-accepter").addEventListener("click", function () { traiterDemandeAbsence(q, true, redessiner); });
    });
  }

  // Suite 83 : retire du planning les absences d'une demande acceptée
  // (modification ou annulation acceptée), à partir d'aujourd'hui.
  function retirerAbsencesDemande_(orig) {
    var auj = isoDeDate(new Date());
    var slots = slotsDemandeAbsence_(orig).filter(function (s) { return s.date >= auj; });
    if (!slots.length) return Promise.resolve();
    var cles = {};
    slots.forEach(function (s) { cles[s.date + "|" + s.demi] = true; });
    var dates = slots.map(function (s) { return s.date; }).sort();
    return Promise.resolve(sbClient.from("taches").select("id, date, demi, texte, est_absence").eq("personne_id", orig.personne_id)
      .gte("date", dates[0]).lte("date", dates[dates.length - 1])).then(function (res) {
      if (res.error) throw res.error;
      var abs = (res.data || []).filter(function (r) { return r.est_absence && cles[r.date + "|" + r.demi]; });
      var memes = abs.filter(function (r) { return r.texte === texteDemandeAbsence(orig); });
      var ids = (memes.length ? memes : abs).map(function (r) { return r.id; });
      if (!ids.length) return;
      return Promise.resolve(sbClient.from("taches").delete().in("id", ids)).then(function (r) { if (r.error) throw r.error; });
    });
  }

  // Accepter : absences posées (et, suite 83, anciennes retirées) PUIS
  // demande classée (si l'écriture échoue, la demande reste en attente —
  // rien de perdu).
  function traiterDemandeAbsence(q, accepter, apres) {
    if (traitementDemandeEnCours_) return;
    traitementDemandeEnCours_ = true;
    occupe(true);
    var type = typeDemande_(q);
    // Annulation : mêmes dates que l'absence visée (copiées par le serveur).
    var aRetirer = accepter && type !== "nouvelle" ? (q.origine || (type === "annulation" ? q : null)) : null;
    var slots = accepter && type !== "annulation" ? slotsDemandeAbsence_(q) : [];
    var chaine = aRetirer || slots.length ? attendreFinSynchro_() : Promise.resolve();
    if (aRetirer) chaine = chaine.then(function () { return retirerAbsencesDemande_(aRetirer); });
    if (slots.length) {
      chaine = chaine.then(function () {
        return enregistrerTacheEnDatesServeur(q.personne_id, [], slots, { texte: texteDemandeAbsence(q), absence: true, important: false, chantier: null, statut: null });
      });
    }
    var maintenant = new Date().toISOString();
    chaine.then(function () {
      return Promise.resolve(sbClient.from("demandes_absence")
        .update({ statut: accepter ? "acceptee" : "refusee", traitee_le: maintenant }).eq("id", q.id));
    }).then(function (res) {
      if (res && res.error) throw res.error;
      if (!accepter || type === "nouvelle" || q.remplace_id == null) return res;
      return Promise.resolve(sbClient.from("demandes_absence")
        .update({ statut: type === "annulation" ? "annulee" : "remplacee", traitee_le: maintenant }).eq("id", q.remplace_id));
    }).then(function (res) {
      if (res && res.error) throw res.error;
      traitementDemandeEnCours_ = false;
      occupe(false);
      demandesAbsence = demandesAbsence.filter(function (x) { return x.id !== q.id; });
      majBoutonNotifications();
      marquerCellulesDemandes();
      var qui = nomPersonneDemande_(q);
      if (accepter) {
        pileUndo = []; pileRedo = [];
        if (typeof majBoutonsUndo === "function") majBoutonsUndo();
        toast((type === "annulation" ? "Absence de " + qui + " annulée : " + texteDemandeAbsence(q) + " " + libelleDemandeAbsence(q) + ", retirée du planning."
          : type === "modification" ? "Absence de " + qui + " modifiée : " + texteDemandeAbsence(q) + " " + libelleDemandeAbsence(q) + "."
          : "Absence de " + qui + " acceptée : " + texteDemandeAbsence(q) + " " + libelleDemandeAbsence(q) + ".").replace(/\.\.$/, "."));
        apresEcritureSerie();
      } else {
        toast(type === "annulation" ? "Annulation de " + qui + " refusée : l’absence reste dans le planning."
          : type === "modification" ? "Modification de " + qui + " refusée : l’absence reste telle quelle."
          : "Demande de " + qui + " refusée.");
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
    setInterval(function () { if (!document.hidden) chargerDemandesAbsence(true); }, 120000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) chargerDemandesAbsence(false); });
  }
