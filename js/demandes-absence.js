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

     Round du 27.09.2026 (suite 86) — Lionel : « Enlever le bouton
     "refuser" des annulations de congé. Pouvoir gérer les séries dans les
     demande de congé. »
       - Annulation : plus de « Refuser » — seulement Voir / Accepter
         (l'ouvrier ne vient plus au travail : l'absence sort du planning) ;
       - Séries : l'ouvrier peut demander une absence qui se répète
         (colonnes serie_frequence « semaine »/« mois », serie_intervalle,
         serie_fin — sql/0022). Hachures, « Voir », libellé (« chaque
         semaine jusqu'au … ») : toutes les occurrences
         (occurrencesDemandeAbsence_). Accepter pose les absences en VRAIE
         série du planning (ligne `series` + serie_id sur chaque absence,
         mémorisé dans la demande) : le bureau la gère ensuite comme toute
         série (« cet événement / les suivants / tous », js/series.js).
         Modification / annulation d'une série acceptée : toutes ses
         absences à venir retirées (par serie_id, même déplacées entre-temps),
         la nouvelle série posée.
       - Base sans la migration 0022 : relue avec les anciennes colonnes,
         rien de cassé (aucune demande ne peut alors être en série).

     Round du 27.09.2026 (suite 87) — Lionel : « Un ouvrier doit pouvoir
     modifier une serie ou juste un des éléments. » et « Les congés placés
     par le bureau doivent aussi apparaître dans la liste des congés de
     l'ouvrier. » Une modification / annulation peut viser une PARTIE du
     planning (colonnes cible_*, sql/0023) :
       - une seule absence d'une série acceptée (remplace_id = la série) :
         Accepter ne retire que cette absence ; la modification est posée
         dans la même série (serie_id de la série, « ↻ ») ; la série reste
         acceptée ;
       - une absence posée par le bureau (remplace_id vide) : Accepter
         retire ce bloc (cible_texte = son texte) puis pose la nouvelle.
     « Quand » dit ce qui est visé (« une absence de la série … », « posée
     par le bureau »).
     ============================================================ */

  var demandesAbsence = [];         // demandes en attente (lignes serveur)
  var derniereLectureDemandes_ = 0;
  var lectureDemandesEnCours_ = null;
  var traitementDemandeEnCours_ = false;
  var COLONNES_DEMANDES_ = "id, personne_id, date_debut, date_fin, demi_debut, demi_fin, motif, remarque, statut, cree_le, type, remplace_id";
  // Suite 86 : colonnes de répétition (sql/0022). Tant que la migration
  // n'est pas passée, la lecture qui les demande échoue : relue sans elles
  // (colonnesSerie_ retombe à false pour la session).
  var COLONNES_SERIE_ = ", serie_frequence, serie_intervalle, serie_fin, serie_id, cible_debut, cible_fin, cible_demi_debut, cible_demi_fin, cible_texte";
  var colonnesSerie_ = true;
  function lireDemandes_(filtrer) {
    function lire(avecSerie) {
      return Promise.resolve(filtrer(sbClient.from("demandes_absence").select(COLONNES_DEMANDES_ + (avecSerie ? COLONNES_SERIE_ : ""))));
    }
    if (!colonnesSerie_) return lire(false);
    return lire(true).then(function (res) {
      if (!res || !res.error) return res;
      return lire(false).then(function (r2) { if (r2 && !r2.error) colonnesSerie_ = false; return r2; });
    });
  }

  function chargerDemandesAbsence(forcer) {
    if (!window.sbClient) return Promise.resolve(demandesAbsence);
    if (lectureDemandesEnCours_) return lectureDemandesEnCours_;
    if (!forcer && Date.now() - derniereLectureDemandes_ < 30000) return Promise.resolve(demandesAbsence);
    derniereLectureDemandes_ = Date.now();
    lectureDemandesEnCours_ = lireDemandes_(function (q) { return q.eq("statut", "en_attente").order("date_debut").limit(200); })
      .then(function (res) {
        // Table absente (migration pas encore passée) ou serveur injoignable :
        // rien dans les notifications, rien de cassé.
        if (res.error) return res;
        // Suite 83 : l'absence acceptée visée par une modification ou une
        // annulation (q.origine).
        var ids = (res.data || []).map(function (q) { return q.remplace_id; }).filter(function (id) { return id != null; });
        if (!ids.length) return res;
        return lireDemandes_(function (q) { return q.in("id", ids); }).then(function (r2) {
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
    // Suite 87 : partie visée (une absence d'une série, absence du bureau).
    var cible = cibleDemande_(q);
    if (cible) {
      var provenance = q.remplace_id == null ? " (posée par le bureau)"
        : q.origine && estSerieDemande_(q.origine) ? " (une absence de la série « " + texteDemandeAbsence(q.origine) + " », " + libelleRepetitionDemande_(q.origine) + ")" : "";
      if (typeDemande_(q) === "annulation") return libelleDemandeAbsence(q) + provenance;
      return libelleDemandeAbsence(q) + " — avant : " + (cible.texte && cible.texte !== texteDemandeAbsence(q) ? cible.texte + ", " : "") + libelleDemandeAbsence(cible) + provenance;
    }
    var avant = typeDemande_(q) === "modification" && q.origine;
    return libelleDemandeAbsence(q) + (avant ? " — avant : " + (texteDemandeAbsence(q.origine) !== texteDemandeAbsence(q) ? texteDemandeAbsence(q.origine) + ", " : "") + libelleDemandeAbsence(q.origine) : "");
  }
  // Partie du planning visée par une modification / annulation (suite
  // 87), au format d'une demande simple (+ texte des absences visées), ou
  // null quand la demande vise toute l'absence acceptée (q.origine).
  function cibleDemande_(q) {
    if (!q || !q.cible_debut || typeDemande_(q) === "nouvelle") return null;
    return { personne_id: q.personne_id, date_debut: q.cible_debut, date_fin: q.cible_fin || q.cible_debut,
      demi_debut: q.cible_demi_debut || "matin", demi_fin: q.cible_demi_fin || "aprem",
      texte: q.cible_texte || (q.origine ? texteDemandeAbsence(q.origine) : null) };
  }
  function nomPersonneDemande_(q) {
    var p = personneParAncre(q.personne_id);
    return p ? p.nom : "?";
  }
  function libelleDemandeAbsence(q) {
    var j = function (iso) { return libelleDateCourteIso(iso).toLowerCase(); };
    var serie = estSerieDemande_(q) ? ", " + libelleRepetitionDemande_(q) + " jusqu’au " + j(q.serie_fin) : "";
    if (q.date_debut === q.date_fin) {
      return "le " + j(q.date_debut) + (q.demi_debut === q.demi_fin ? (q.demi_debut === "aprem" ? " après-midi" : " matin") : "") + serie;
    }
    return "du " + j(q.date_debut) + (q.demi_debut === "aprem" ? " après-midi" : "") +
      " au " + j(q.date_fin) + (q.demi_fin === "matin" ? " matin" : "") + serie;
  }

  // ---- Suite 86 : demandes en série ----
  function estSerieDemande_(q) { return !!(q && (q.serie_frequence === "semaine" || q.serie_frequence === "mois") && q.serie_fin); }
  function libelleRepetitionDemande_(q) {
    var n = Math.max(1, +q.serie_intervalle || 1);
    if (q.serie_frequence === "mois") return n === 1 ? "chaque mois" : "tous les " + n + " mois";
    return n === 1 ? "chaque semaine" : "toutes les " + n + " semaines";
  }
  // Dates ISO en UTC (pas d'heure d'été/hiver dans le calcul).
  function dateUtcDemande_(iso) { return new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))); }
  function plusJoursDemande_(iso, n) { var d = dateUtcDemande_(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  // k-ième pas de la répétition : k × N semaines, ou k × N mois au même
  // quantième, ramené au dernier jour d'un mois plus court (le 31 → le 30,
  // le 28 février…) — comme `date + interval 'N month'` côté serveur.
  function pasDemande_(iso, frequence, n) {
    var d = dateUtcDemande_(iso);
    if (frequence !== "mois") { d.setUTCDate(d.getUTCDate() + 7 * n); return d.toISOString().slice(0, 10); }
    var jour = d.getUTCDate(), m = d.getUTCMonth() + n;
    var dernier = new Date(Date.UTC(d.getUTCFullYear(), m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(d.getUTCFullYear(), m, Math.min(jour, dernier))).toISOString().slice(0, 10);
  }
  // Absences d'une demande [{debut, fin}] : la première, puis (série) une
  // par pas tant qu'elle commence au plus tard le serie_fin, même durée.
  function occurrencesDemandeAbsence_(q) {
    if (!estSerieDemande_(q)) return [{ debut: q.date_debut, fin: q.date_fin }];
    var duree = Math.round((dateUtcDemande_(q.date_fin) - dateUtcDemande_(q.date_debut)) / 86400000);
    var n = Math.max(1, +q.serie_intervalle || 1), out = [];
    for (var k = 0; k < 60; k++) {
      var debut = pasDemande_(q.date_debut, q.serie_frequence, k * n);
      if (debut > q.serie_fin) break;
      out.push({ debut: debut, fin: plusJoursDemande_(debut, duree) });
    }
    return out;
  }
  // Demi-journées couvertes : jours ouvrés (slotsPlageTacheIso), fériés
  // sautés — personne ne pose d'absence un jour déjà chômé. Série (suite
  // 86) : toutes les occurrences, week-ends sautés (une répétition au mois
  // peut tomber un samedi).
  function slotsDemandeAbsence_(q) {
    var serie = estSerieDemande_(q), out = [];
    occurrencesDemandeAbsence_(q).forEach(function (o) {
      slotsPlageTacheIso(o.debut, o.fin, q.demi_debut, q.demi_fin).forEach(function (s) {
        if (feriesParIso[s.date]) return;
        if (serie) { var j = dateUtcDemande_(s.date).getUTCDay(); if (j === 0 || j === 6) return; }
        out.push(s);
      });
    });
    return out;
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
  // qui, quoi, quand ; Voir / Refuser / Accepter. Suite 86 : pas de
  // « Refuser » pour une annulation (Lionel : « Enlever le bouton
  // "refuser" des annulations de congé. »).
  function htmlDemandesAbsence_() {
    if (!demandesAbsence.length) return '<p class="notif-vide">Aucune demande en attente.</p>';
    return '<ul class="da-liste">' + demandesAbsence.map(function (q) {
      return '<li data-id="' + esc2(q.id) + '" class="da-' + typeDemande_(q) + '"><div class="da-infos">' +
        '<span class="da-qui">' + esc(nomPersonneDemande_(q)) + "</span>" +
        '<span class="da-quoi">' + esc(quoiDemandeAbsence_(q)) + "</span>" +
        '<span class="da-quand">' + esc(quandDemandeAbsence_(q)) + "</span></div>" +
        '<div class="da-boutons">' +
        '<button type="button" class="lien-modifier da-voir">Voir</button>' +
        (typeDemande_(q) === "annulation" ? "" : '<button type="button" class="lien-supprimer da-refuser">Refuser</button>') +
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
      var refuser = li.querySelector(".da-refuser");
      if (refuser) refuser.addEventListener("click", function () { traiterDemandeAbsence(q, false, redessiner); });
      li.querySelector(".da-accepter").addEventListener("click", function () { traiterDemandeAbsence(q, true, redessiner); });
    });
  }

  // Suite 83 : retire du planning les absences d'une demande acceptée
  // (modification ou annulation acceptée), à partir d'aujourd'hui.
  // Suite 86 : série posée à l'acceptation (serie_id) → toutes ses absences
  // à venir, où qu'elles soient (le bureau a pu en déplacer).
  function retirerAbsencesDemande_(orig) {
    var auj = isoDeDate(new Date());
    if (orig.serie_id != null) {
      return Promise.resolve(sbClient.from("taches").delete().eq("serie_id", orig.serie_id).eq("personne_id", orig.personne_id).gte("date", auj))
        .then(function (r) { if (r && r.error) throw r.error; });
    }
    var slots = slotsDemandeAbsence_(orig).filter(function (s) { return s.date >= auj; });
    if (!slots.length) return Promise.resolve();
    var cles = {};
    slots.forEach(function (s) { cles[s.date + "|" + s.demi] = true; });
    var dates = slots.map(function (s) { return s.date; }).sort();
    return Promise.resolve(sbClient.from("taches").select("id, date, demi, texte, est_absence").eq("personne_id", orig.personne_id).eq("est_absence", true)
      .gte("date", dates[0]).lte("date", dates[dates.length - 1])).then(function (res) {
      if (res.error) throw res.error;
      var abs = (res.data || []).filter(function (r) { return r.est_absence && cles[r.date + "|" + r.demi]; });
      var texte = orig.texte || texteDemandeAbsence(orig);
      var memes = abs.filter(function (r) { return r.texte === texte; });
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
    // Suite 87 : une partie seulement (cible_*) → ces absences-là.
    var aRetirer = accepter && type !== "nouvelle" ? (cibleDemande_(q) || q.origine || (type === "annulation" ? q : null)) : null;
    var slots = accepter && type !== "annulation" ? slotsDemandeAbsence_(q) : [];
    var chaine = aRetirer || slots.length ? attendreFinSynchro_() : Promise.resolve();
    if (aRetirer) chaine = chaine.then(function () { return retirerAbsencesDemande_(aRetirer); });
    // Suite 86 : demande en série → ligne `series` d'abord (mêmes colonnes
    // que celles d'enregistrer-serie), puis chaque absence avec son serie_id.
    // Suite 87 : une seule absence d'une série modifiée → reposée dans
    // cette même série (pas de nouvelle ligne `series`, rien à mémoriser
    // dans la demande : son retrait ultérieur passera par ses dates).
    var serieId = null, serieCreee = false;
    if (slots.length && !estSerieDemande_(q) && cibleDemande_(q) && q.origine && q.origine.serie_id != null) serieId = q.origine.serie_id;
    if (slots.length && estSerieDemande_(q)) {
      chaine = chaine.then(function () {
        return Promise.resolve(sbClient.from("series").insert({
          type: "tache", cible_personne_id: q.personne_id, cible_demi: q.demi_debut === "aprem" ? "aprem" : "matin",
          texte: texteDemandeAbsence(q), statut_id: null, important: false, chantier_id: null, date_debut: q.date_debut,
          frequence: q.serie_frequence, intervalle: Math.max(1, +q.serie_intervalle || 1), fin_type: "date", fin_valeur: q.serie_fin
        }).select("id")).then(function (res) {
          if (res.error) throw res.error;
          var ligne = Array.isArray(res.data) ? res.data[0] : res.data;
          serieId = ligne && ligne.id != null ? ligne.id : null;
          if (serieId == null) throw new Error("série non créée");
          serieCreee = true;
        });
      });
    }
    if (slots.length) {
      chaine = chaine.then(function () {
        return enregistrerTacheEnDatesServeur(q.personne_id, [], slots, { texte: texteDemandeAbsence(q), absence: true, important: false, chantier: null, statut: null, serieId: serieId });
      });
    }
    var maintenant = new Date().toISOString();
    chaine.then(function () {
      var maj = { statut: accepter ? "acceptee" : "refusee", traitee_le: maintenant };
      if (serieCreee) maj.serie_id = serieId;
      return Promise.resolve(sbClient.from("demandes_absence").update(maj).eq("id", q.id));
    }).then(function (res) {
      if (res && res.error) throw res.error;
      // Une partie seulement (suite 87) : l'absence d'origine reste acceptée.
      if (!accepter || type === "nouvelle" || q.remplace_id == null || cibleDemande_(q)) return res;
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
