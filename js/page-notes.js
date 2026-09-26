"use strict";
  /* ============================================================
     PAGE « NOTES » — round du 26.09.2026 (suite 65). Lionel : « Ajoute un
     onglet note entre jalon et personnel. Mets y la couleur et d'autres
     choses. »

     Même principe que la page Jalons (js/page-jalons.js), dont elle
     reprend les pièces (dates ISO sans limite de fenêtre, fiche à bandeau,
     écriture par enregistrer-plage) :
       - la couleur des notes (groupe « note » de js/page-couleurs.js, qui
         quitte « Personnaliser » pour venir ici, comme Jalon) ;
       - « Afficher dans le planning » : la même bascule que l'icône note de
         la barre du planning (replierNotes) ;
       - toutes les notes, en cours et à venir d'abord, puis les passées
         (les plus récentes en tête) : ajouter, modifier (texte, dates,
         important), supprimer.

     Différence avec les jalons : un jour peut porter PLUSIEURS notes (une
     ligne de table chacune, cf. planPlage côté serveur). La fusion en
     plages se fait donc par note — même texte, même « important » — et
     non jour par jour (fusionnerNotesTous). La modification et la
     suppression passent l'ancienne note en `origine` : le serveur ne
     retire QUE cette ligne-là sur chaque jour, les autres notes du même
     jour restent.
     ============================================================ */
  var NOTES_TOUTES = null; // null = pas encore chargées ; notes FUSIONNÉES sinon

  function chargerNotesToutesServeur() {
    return sbClient.from("notes").select("id, date, texte, important, demi").order("date").then(function (r) {
      if (r.error) throw new Error(r.error.message);
      return r.data || [];
    });
  }
  // Fusion PURE : par (texte, important), jours ouvrés consécutifs réunis en
  // une plage. Même règle de demi-journée que les jalons
  // (fusionnerJalonsTous) : le 1er jour peut commencer l'après-midi, un
  // jour qui porte une demi-journée termine la plage ; un 1er jour « matin
  // seulement » ne se prolonge pas (l'après-midi manque entre les deux).
  function fusionnerNotesTous(lignes) {
    var groupes = {}, cles = [];
    lignes.forEach(function (l) {
      var cle = l.texte + "\u0000" + (l.important ? 1 : 0);
      if (!groupes[cle]) { groupes[cle] = []; cles.push(cle); }
      groupes[cle].push(l);
    });
    var rangDemi = { matin: 0, "": 1, aprem: 2 };
    var items = [];
    cles.forEach(function (cle) {
      var tri = groupes[cle].slice().sort(function (a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : rangDemi[a.demi || ""] - rangDemi[b.demi || ""];
      });
      var courant = null;
      tri.forEach(function (l) {
        var demi = l.demi || null;
        if (courant && isoJourOuvreVoisin(courant.dateFin, 1) === l.date &&
            (courant.dateFin === courant.dateDebut ? courant.demiDebut !== "matin" : courant.demiFin === null)) {
          courant.dateFin = l.date;
          courant.idFin = l.id;
          courant.demiFin = demi;
        } else {
          courant = { idDebut: l.id, idFin: l.id, dateDebut: l.date, dateFin: l.date, texte: l.texte, important: !!l.important, demiDebut: demi, demiFin: demi };
          items.push(courant);
        }
      });
    });
    return items;
  }
  function libellePlageNote_(n) {
    var demi = function (d) { return d === "matin" ? " matin" : d === "aprem" ? " après-midi" : ""; };
    if (n.dateDebut === n.dateFin) return libelleDateIso(n.dateDebut, true) + (n.demiDebut ? demi(n.demiDebut) : "");
    return libellePlageJalon(n);
  }
  function ligneFicheNote_(n) {
    return '<div class="ligne-intervenant ligne-note" data-id-debut="' + esc2(n.idDebut) + '">' +
      '<span class="gauche-chantier"><span class="swatch-chantier swatch-note"></span><b>' + esc(n.texte) + '</b></span>' +
      (n.important ? '<span class="compte jalon-important" title="Important">' + ICONS.important + '</span>' : '') +
      '<span class="plage-jalon">' + esc(libellePlageNote_(n)) + '</span>' +
      '<span class="ligne-actions">' +
      boutonIconeLigne("lien-modifier", ICONS.pencil, "Modifier") +
      boutonIconeLigne("lien-supprimer", ICONS.trash, "Supprimer") + '</span></div>';
  }
  function apresEcritureNotes_() {
    NOTES_TOUTES = null;
    // Même relecture de la grille que la page Jalons (rafraichirGrilleApresJalons_).
    oublierCache();
    assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); });
    renderNotes();
  }
  function origineNote_(n) {
    return { dateDebut: n.dateDebut, dateFin: n.dateFin, texte: n.texte, important: n.important, demiDebut: n.demiDebut || null, demiFin: n.demiFin || null };
  }
  function supprimerNoteServeur_(n) {
    demanderConfirmation("Supprimer la note « " + n.texte + " » ?", function () {
      occupe(true);
      // Nouvelle plage vide sur les mêmes jours : seule la note d'origine
      // est retirée, jour par jour (cf. tête de fichier).
      invoquerFonctionServeur("enregistrer-plage", {
        kind: "note", dateDebut: n.dateDebut, dateFin: n.dateFin, demiDebut: n.demiDebut || null, demiFin: n.demiFin || null,
        texte: "", important: n.important, mode: "remplacement", origine: origineNote_(n)
      }).then(function () {
        occupe(false);
        apresEcritureNotes_();
        toast("Supprimée.");
      }).catch(function (err) { occupe(false); toast("Échec de la suppression : " + (err && err.message ? err.message : err)); });
    });
  }
  function majInterrupteurNotes_() {
    var chk = document.getElementById("chkNotesPlanning");
    if (chk) chk.checked = !replierNotes;
  }
  function renderNotes() {
    majInterrupteurNotes_();
    var zone = document.getElementById("listeNotes");
    if (!zone) return;
    if (NOTES_TOUTES === null) {
      zone.innerHTML = '<div class="page-placeholder">Chargement…</div>';
      chargerNotesToutesServeur().then(function (lignes) {
        NOTES_TOUTES = fusionnerNotesTous(lignes);
        renderNotes();
      }).catch(function (err) {
        zone.innerHTML = '<div class="page-placeholder">Échec du chargement : ' + esc(err && err.message ? err.message : err) + '</div>';
      });
      return;
    }
    var aujourdhui = isoDeDate(new Date());
    var parDebut = function (a, b) { return a.dateDebut < b.dateDebut ? -1 : a.dateDebut > b.dateDebut ? 1 : (a.texte < b.texte ? -1 : 1); };
    var aVenir = NOTES_TOUTES.filter(function (n) { return n.dateFin >= aujourdhui; }).sort(parDebut);
    var passees = NOTES_TOUTES.filter(function (n) { return n.dateFin < aujourdhui; }).sort(function (a, b) { return -parDebut(a, b); });
    zone.innerHTML =
      '<h2 class="titre-liste">En cours et à venir <span class="titre-compte">' + aVenir.length + '</span></h2>' +
      '<div class="liste-intervenants" id="listeNotesAVenir">' +
        (aVenir.length ? aVenir.map(ligneFicheNote_).join("") : '<p class="page-sous">Aucune note à venir.</p>') +
        '<button type="button" class="ligne-ajouter">+ Ajouter</button>' +
      '</div>' +
      (passees.length ? '<h2 class="titre-liste">Passées <span class="titre-compte">' + passees.length + '</span></h2>' +
        '<div class="liste-intervenants" id="listeNotesPassees">' + passees.map(ligneFicheNote_).join("") + '</div>' : '');
  }
  function noteDeLigne_(btn) {
    var idDebut = btn.closest("[data-id-debut]").dataset.idDebut;
    return (NOTES_TOUTES || []).filter(function (x) { return String(x.idDebut) === idDebut; })[0] || null;
  }

  // Fiche Ajouter/Modifier : bandeau à la couleur des notes, « important »,
  // 2 dates ISO (celles de la page Jalons, sans matin/après-midi : une
  // demi-journée posée dans la grille est gardée tant que son bord ne
  // bouge pas), texte.
  function ouvrirFormulaireNote(existante) {
    var aujourdhuiIso = premierJourOuvreDepuis(isoDeDate(new Date()));
    var state = {
      debutIso: existante ? existante.dateDebut : aujourdhuiIso,
      finIso: existante ? existante.dateFin : aujourdhuiIso,
      important: existante ? existante.important : false
    };
    var bandeau = function () { return bandeauHTML({ clair: true, fondStyle: "background:var(--note-bg)", important: state.important, nomGrand: "Note" }); };
    var pop = document.createElement("div");
    pop.className = "pop form-pop carte-item fiche-note";
    pop.innerHTML = bandeau() +
      datesPlageJalonHTML(state.debutIso, state.finIso) +
      '<div class="corps"><div class="label-champ" style="margin:0 0 6px">Texte</div>' +
      '<input type="text" class="f-texte-note" value="' + esc2(existante ? existante.texte : "") + '" placeholder="ex. Réunion de chantier"></div>' +
      piedPrincipalHTML(!!existante);
    var px = Math.round(window.innerWidth / 2 - 162), py = Math.max(30, Math.round(window.innerHeight / 2 - 230));
    positionnerPop(pop, px, py);
    var fermer = fermerAuClicExterieur(pop, null, function () { pop.querySelector(".f-ok").click(); });
    function cablerBandeau() {
      pop.querySelector(".f-annuler").addEventListener("click", fermer);
      pop.querySelector(".f-important").addEventListener("click", function () {
        state.important = !state.important;
        pop.querySelector(".bandeau").outerHTML = bandeau();
        cablerBandeau();
      });
    }
    function rafraichirDates() {
      pop.querySelector(".dates-plage").outerHTML = datesPlageJalonHTML(state.debutIso, state.finIso);
      cablerDatesJalon(pop, state, rafraichirDates);
    }
    cablerBandeau();
    cablerDatesJalon(pop, state, rafraichirDates);
    var champ = pop.querySelector(".f-texte-note");
    if (!existante) champ.focus();
    var suppr = pop.querySelector(".f-suppr");
    if (suppr) suppr.addEventListener("click", function () { fermer(); supprimerNoteServeur_(existante); });
    pop.querySelector(".f-ok").addEventListener("click", function () {
      // Une note tient sur une ligne : plusieurs lignes feraient plusieurs
      // notes (lignesDe, côté serveur).
      var texte = champ.value.replace(/\s+/g, " ").trim();
      if (!texte) { fermer(); return; }
      var demiDebut = existante && state.debutIso === existante.dateDebut ? (existante.demiDebut || null) : null;
      var demiFin = existante && state.finIso === existante.dateFin ? (existante.demiFin || null) : null;
      if (state.debutIso === state.finIso) { if (demiDebut !== demiFin) { demiDebut = null; demiFin = null; } }
      else { if (demiDebut === "matin") demiDebut = null; if (demiFin === "aprem") demiFin = null; }
      fermer();
      occupe(true);
      invoquerFonctionServeur("enregistrer-plage", {
        kind: "note", dateDebut: state.debutIso, dateFin: state.finIso, texte: texte,
        demiDebut: demiDebut, demiFin: demiFin, important: state.important, mode: "remplacement",
        origine: existante ? origineNote_(existante) : null
      }).then(function () {
        occupe(false);
        apresEcritureNotes_();
        toast(existante ? "Modifiée." : "Ajoutée.");
      }).catch(function (err) {
        occupe(false);
        toast("Échec de l’enregistrement : " + (err && err.message ? err.message : err));
      });
    });
  }

  // Câblage une fois (la liste est redessinée, les clics délégués).
  function cablerPageNotes() {
    var zone = document.getElementById("listeNotes");
    if (zone) zone.addEventListener("click", function (e) {
      if (e.target.closest(".ligne-ajouter")) { ouvrirFormulaireNote(null); return; }
      var btn = e.target.closest(".lien-modifier, .lien-supprimer");
      var n = btn && noteDeLigne_(btn);
      if (!n) return;
      if (btn.classList.contains("lien-modifier")) ouvrirFormulaireNote(n);
      else supprimerNoteServeur_(n);
    });
    var chk = document.getElementById("chkNotesPlanning");
    if (chk) chk.addEventListener("change", function () {
      replierNotes = !chk.checked;
      render(false);
    });
  }
