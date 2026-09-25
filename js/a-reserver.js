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

  // Compteur du bouton : relu après chaque rendu, au plus toutes les 1,5 s.
  var minuteurAReserver = null, dernierResumeAReserver = null;
  // Le bouton lui-même (affiché s'il existe au moins un statut) est
  // montré ou caché tout de suite, pas 1,5 s plus tard : un bouton qui
  // apparaît après coup décalerait toute la barre sous le doigt/la souris.
  function planifierMajAReserver() {
    var groupe = document.getElementById("groupeAReserver");
    var cache = !statutAReserverCle_();
    if (groupe && groupe.hidden !== cache) {
      groupe.hidden = cache;
      if (typeof ajusterDebordementToolbar === "function") ajusterDebordementToolbar();
    }
    clearTimeout(minuteurAReserver);
    if (!cache) minuteurAReserver = setTimeout(majBoutonAReserver, 1500);
  }
  function majBoutonAReserver() {
    var btn = document.getElementById("btnAReserver");
    if (!btn || !window.sbClient) return Promise.resolve();
    var cleStatut = statutAReserverCle_();
    if (!cleStatut) return Promise.resolve();
    return chargerTachesAvecStatut_().then(function (lignes) {
      dernierResumeAReserver = regrouperAReserver(lignes);
      afficherCompteAReserver_(cleStatut);
    }).catch(function () { /* compteur laissé tel quel : réessayé au prochain rendu */ });
  }
  function afficherCompteAReserver_(cleStatut) {
    var btn = document.getElementById("btnAReserver");
    if (!btn || !dernierResumeAReserver) return;
    var s = STATUTS[cleStatut] || { nom: cleStatut, couleur: "var(--surface-2)" };
    var n = dernierResumeAReserver.filter(function (g) { return g.statut === cleStatut; }).length;
    btn.querySelector(".toolbar-btn-label").textContent = premiereMajuscule_(s.nom);
    var badge = btn.querySelector(".compte-a-reserver");
    badge.textContent = n;
    badge.hidden = !n;
    badge.style.background = s.couleur;
    var barre = document.getElementById("legendeBarre");
    if (barre) barre.style.setProperty("--couleur-a-reserver", s.couleur); // pastille de « ⋮ » (style.css)
    btn.title = premiereMajuscule_(s.nom) + " — " + (n ? n + " tâche" + (n > 1 ? "s" : "") + " à partir d’aujourd’hui" : "rien à partir d’aujourd’hui");
    // Libellé et compteur changent la largeur du bouton : la barre est
    // remesurée (suite 50 — un compteur à 2 chiffres pouvait pousser « ⋮ »
    // hors de la barre d'un téléphone étroit).
    if (typeof ajusterDebordementToolbar === "function") ajusterDebordementToolbar();
  }

  function ouvrirResumeAReserver(cleStatut) {
    if (popFermerActuel) popFermerActuel();
    cleStatut = cleStatut || statutAReserverCle_();
    if (!cleStatut) return;
    var pop = document.createElement("div");
    pop.className = "pop form-pop pop-a-reserver";
    pop.innerHTML = '<div class="cp-titre">Résumé des statuts</div><div class="ar-contenu"><p class="ar-vide">Chargement…</p></div>' +
      '<div class="form-actions"><button type="button" class="f-annuler">Fermer</button></div>';
    var btn = document.getElementById("btnAReserver");
    var r = btn && btn.getBoundingClientRect().width ? btn.getBoundingClientRect() : { left: window.innerWidth / 2 - 190, bottom: 80 };
    positionnerPop(pop, Math.round(r.left), Math.round(r.bottom + 6));
    var fermer = fermerAuClicExterieur(pop, null, null);
    pop.querySelector(".f-annuler").addEventListener("click", fermer);
    var contenu = pop.querySelector(".ar-contenu");

    function dessiner() {
      var groupes = dernierResumeAReserver || [];
      var statuts = (etat.statutsServeur || []).slice().sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); });
      var html = '<div class="chip-row ar-statuts">' + statuts.map(function (s) {
        var n = groupes.filter(function (g) { return g.statut === s.cle; }).length;
        return '<button type="button" class="chip sub' + (s.cle === cleStatut ? " actif" : "") + '" data-statut="' + esc2(s.cle) + '">' +
          '<span class="ar-pastille" style="background:' + esc2(s.couleur) + '"></span>' + esc(premiereMajuscule_(s.nom)) + ' <b>' + n + "</b></button>";
      }).join("") + "</div>";
      var liste = groupes.filter(function (g) { return g.statut === cleStatut; });
      var nomStatut = premiereMajuscule_((STATUTS[cleStatut] || { nom: cleStatut }).nom);
      if (!liste.length) {
        html += '<p class="ar-vide">Aucune tâche « ' + esc(nomStatut) + " » à partir d’aujourd’hui.</p>";
      } else {
        html += '<ul class="ar-liste">' + liste.map(function (g, i) {
          var p = personneParAncre(g.personneId);
          var ch = g.chantier && CHANTIERS[g.chantier];
          return '<li><button type="button" class="ar-ligne" data-i="' + i + '" title="Voir dans le planning">' +
            '<span class="ar-quand">' + esc(quandAReserver_(g)) + "</span>" +
            '<span class="ar-qui">' + esc(p ? p.nom : "?") + "</span>" +
            '<span class="ar-quoi">' + esc(g.texte || "(sans texte)") + "</span>" +
            (ch ? '<span class="ar-chantier"><span class="swatch" style="background:' + esc2(ch.couleur) + '"></span>' + esc(ch.nom) + "</span>" : "") +
            "</button></li>";
        }).join("") + "</ul>";
      }
      contenu.innerHTML = html;
      contenu.querySelectorAll(".ar-statuts .chip").forEach(function (c) {
        c.addEventListener("click", function () { cleStatut = c.dataset.statut; dessiner(); });
      });
      contenu.querySelectorAll(".ar-ligne").forEach(function (b) {
        b.addEventListener("click", function () {
          var g = liste[+b.dataset.i];
          fermer();
          allerAuJour(g.du);
        });
      });
    }
    if (dernierResumeAReserver) dessiner();
    majBoutonAReserver().then(function () { if (pop.isConnected) dessiner(); });
  }

  function cablerAReserver() {
    var btn = document.getElementById("btnAReserver");
    if (btn) btn.addEventListener("click", function () { ouvrirResumeAReserver(); });
  }
