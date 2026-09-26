"use strict";
  /* ============================================================
     FORMULAIRES AJOUT / ÉDITION — tâches, absences, jalons, notes.
     ============================================================ */
  // creerGroupeTaches (round du 12.09.2026 — refonte "case par case" de la
  // sélection, cf. cablerAjoutCellule/surlignerPlagePersonnes) : 1 SEUL item
  // par personne concernée, sur exactement {giDebut,duree,demiDebut,demiFin}
  // — les bords précis de la plage sélectionnée (bornesDepuisDemiSlots côté
  // appelant), désormais partagés par TOUT type de bulle (tâche, absence,
  // congé, vacances...), plus de traitement spécial pour les absences.
  // Remplace 2 anciens comportements :
  //  - le cas "absence, duree>1" (round du 11.09.2026, §51.2.2) posait déjà
  //    1 item/personne en journée entière — devenu le cas général ici ;
  //  - le cas "tâche" fragmentait 1 item PAR JOUR avec une demi-journée FIXE
  //    par ligne de sélection (matin/aprem "figé" pour toute la durée, cf.
  //    lignesSecteur) — Lionel a explicitement rejeté ce modèle : « Ce
  //    comportement doit être pareil pour tout type des bulles. on ne
  //    sélectionne pas que les matin ou que les après midi. » Le payload
  //    porte donc maintenant demiDebut/demiFin (bords de plage), plus une
  //    demi-journée par ligne — ouvrirEdition (formulaire "Tâche"/"Absence"
  //    avec descriptif) créait déjà 1 item fusionné par cible de cette façon
  //    (cf. son commentaire) ; ceci aligne les boutons rapides/formulaires
  //    historiques (Armature/Béton/Livraison/Entrée dynamique/Absence
  //    rapide) sur le même modèle.
  function creerGroupeTaches(cibles, giDebut, duree, payload) {
    var demiDebut = payload.demiDebut !== undefined ? payload.demiDebut : null;
    var demiFin = payload.demiFin !== undefined ? payload.demiFin : null;
    var personnesVues = {};
    cibles.forEach(function (c) {
      if (personnesVues[c.personne]) return;
      personnesVues[c.personne] = true;
      var ta = itemPlageTache(payload.type, payload.texte, c.personne, giDebut, duree, {
        chantier: payload.chantier, important: payload.important, statut: payload.statut,
        demiDebut: demiDebut, demiFin: demiFin
      });
      ta.dateDebutIso = isoDeGi(giDebut);
      TACHES.push(ta);
    });
  }
  function ajoutRapide(cibles, giDebut, duree, texte, type, demiDebut, demiFin) {
    sauvegarderUndo();
    creerGroupeTaches(cibles, giDebut, duree, { type: type, texte: texte, important: false, chantier: null, statut: null, demiDebut: demiDebut, demiFin: demiFin });
    render();
    toast("Ajouté.");
  }

  // Crée une série (§4 du spec) — un appel serveur par cible (ancre, demi)
  // touchée, cf. FRONTEND-CHANGELOG.md : apiEnregistrerSerie ne prend qu'UNE
  // seule cible {ancre,demi} par appel, contrairement au moteur du prototype
  // qui partageait un seul serieId entre toutes les lignes d'une sélection
  // multi-personnes — ici chaque ligne reçoit sa propre série.
  //
  // duree/demiDebut/demiFin (round du 15.09.2026 — bug Lionel : « si je
  // sélectionne 2 case ou plus, la bulle vient uniquement dans la première
  // case de chaque répétition ») : AJOUTÉS en fin de signature plutôt
  // qu'insérés au milieu, pour ne risquer de décaler aucun des arguments
  // positionnels déjà en place aux 3 sites d'appel existants. Avant ce
  // round, cette fonction ne recevait QUE `giDebut` (l'ancre) — la largeur
  // de la sélection d'origine (plusieurs jours et/ou les 2 demis d'un même
  // jour, cf. bornesDepuisDemiSlots côté appelant) était silencieusement
  // perdue : chaque occurrence ne posait jamais qu'UNE seule case (le jour
  // et la demi de l'ancre), jamais tout le reste de la plage sélectionnée.
  // Optionnels (undefined si un futur 4e site d'appel ne les fournit pas)
  // pour que le serveur puisse retomber sur son ancien comportement à 1
  // seule demi (cible_demi) — cf. le commentaire de champsSerie/
  // construireOccurrencesSerie (enregistrer-serie/logic.js).
  // isoDebutForce (round du 24.09.2026, suite 5) : date de départ réelle
  // quand elle est hors de la fenêtre chargée (fiche tâche/absence, cf.
  // ouvrirEdition) — giDebut n'est alors qu'un repère calé sur le bord visible.
  function creerSerieServeur(type, cibles, giDebut, texte, important, chantier, statut, choixSerie, apresChaqueAppel, duree, demiDebut, demiFin, isoDebutForce) {
    var isoDebut = isoDebutForce || isoDeGi(giDebut);
    // enregistrer-serie n'a que 3 types ("tache"|"jalon"|"note", cf.
    // champsSerie côté fonction) : "absence" n'a jamais été une vraie
    // catégorie de la table `series`/`taches.type` — traduite ici en "tache",
    // comme le reste du formulaire d'édition le fait déjà. Round du
    // 14.09.2026 (bug Lionel : une absence en série retombait "tâche" au
    // premier rechargement, même défaut que le chemin non-série corrigé
    // ailleurs ce même round, cf. tacheVue_) : `estAbsence` ci-dessous porte
    // désormais cette information jusqu'à taches.est_absence
    // (sql/0009_taches_est_absence.sql) sans toucher au type envoyé à
    // `series` (qui reste "tache", cf. plus haut — colonne inchangée).
    var typeServeur = (type === "absence") ? "tache" : type;
    var chaine = Promise.resolve();
    var dernier = null;
    (cibles.length ? cibles : [{}]).forEach(function (c) {
      chaine = chaine.then(function () {
        var payload = {
          type: typeServeur, personneId: c.personne != null ? ancreDe(c.personne) : undefined, demi: c.demi,
          texte: texte,
          // statut/chantier restent des NOMS/CLÉS côté vue (CHANTIERS/STATUTS,
          // cf. étape 3 du §6bis) — enregistrer-serie veut de vrais id,
          // traduits ici via les lookups posés au bootstrap (demarrer()).
          statutId: statut ? (etat.statutIdParCle[statut] || null) : null,
          important: !!important,
          chantierId: chantier ? ((etat.chantierParNom[chantier] && etat.chantierParNom[chantier].ligne) || null) : null,
          dateDebutIso: isoDebut, frequence: choixSerie.frequence, intervalle: choixSerie.intervalle,
          finType: choixSerie.finType, finValeur: choixSerie.finValeur,
          estAbsence: type === "absence",
          // Largeur de la sélection d'origine (round du 15.09.2026, cf.
          // commentaire de tête de fonction) — toujours envoyés explicitement
          // (même `null`) dès que cette fonction en reçoit, pour que chaque
          // occurrence de la série reproduise exactement la même plage que
          // la 1ère case posée, au lieu de la seule ancre.
          duree: Math.max(1, duree || 1),
          demiDebut: demiDebut !== undefined ? demiDebut : null,
          demiFin: demiFin !== undefined ? demiFin : null
        };
        return invoquerFonctionServeur("enregistrer-serie", payload).then(function (r) { dernier = r; });
      });
    });
    return chaine.then(function () { if (dernier) apresChaqueAppel(dernier); });
  }

  function boutonsMenuAjout(personneId) {
    // Pas d'absence non plus pour une ligne d'équipe (suite 33) : elle se
    // pose sur la ligne de la personne absente.
    var estIntervenant = secteurPersonne(personneId) === "sous-traitant" || estLigneEquipe(personneId);
    var html = '<button type="button" data-t="tache">Tâche</button>';
    // "Absence" (qui ouvre l'éditeur, pour saisir un motif) reste proposée
    // telle quelle au personnel : ce n'est pas une entrée rapide mais un type
    // de bulle à part entière.
    if (!estIntervenant) html += '<button type="button" data-t="absence">Absence</button>';
    // Congé / Vacances : codés en dur jusqu'ici, donc ni renommables, ni
    // assignables, ni supprimables (Lionel : "il faut ajouter les absences aux
    // ajouts rapides à éditer"). Ils viennent maintenant de la liste
    // configurable, comme n'importe quel formulaire — repli sur les 2 boutons
    // historiques TANT QU'aucune entrée rapide de type "absence" n'existe,
    // pour que rien ne disparaisse de son menu avant qu'il ne les ait créées.
    var aDesAbsencesConfigurees = FORMULAIRES_RAPIDES.some(function (f) { return f.typeEntree === "absence"; });
    if (!estIntervenant && !aDesAbsencesConfigurees) {
      html += '<button type="button" data-rapide="Congé">Congé</button>';
      html += '<button type="button" data-rapide="Vacances">Vacances</button>';
    }
    // "Assigné à" (restauré round "reverifie 1x que tu a tout fait" du
    // 02.09.2026, cf. FORMULAIRES_RAPIDES[].assigneA côté serveur) : "" =
    // tout le monde, sinon réservé à cette seule personne. L'index `i` reste
    // celui du tableau GLOBAL non filtré — cablerBoutonsMenuAjout relit
    // FORMULAIRES_RAPIDES[+btn.dataset.form], donc filtrer le tableau
    // lui-même déciderait un mauvais formulaire au clic.
    FORMULAIRES_RAPIDES.forEach(function (f, i) {
      if (!formulaireVisiblePour(f, personneId)) return;
      if (f.typeEntree === "absence" && estLigneEquipe(personneId)) return; // cf. estIntervenant ci-dessus
      html += '<button type="button" data-form="' + i + '">' + esc(f.nom) + '</button>';
    });
    // « Coller » (suite 24 — Lionel : « proposer une entrée rapide "coller"
    // dans le popup ») : seulement quand quelque chose a été copié ou coupé.
    // Colle sur la case cliquée, cf. collerSurCase (formulaires-communs.js).
    if (pressePapier.length) html += '<button type="button" class="btn-coller" data-coller="1">Coller (' + pressePapier.length + ')</button>';
    return html;
  }
  function cablerBoutonsMenuAjout(pop, fermer, cell, x, y, cibles, giDebut, duree, plageInit, demiDebut, demiFin) {
    var btnColler = pop.querySelector("button[data-coller]");
    if (btnColler) btnColler.addEventListener("click", function () {
      fermer();
      collerSurCase(cibles[0].personne, giDebut, demiDebut || cibles[0].demi);
    });
    pop.querySelectorAll("button[data-t]").forEach(function (btn) {
      btn.addEventListener("click", function () { var type = btn.dataset.t; fermer(); ouvrirEdition(cell, null, type, x, y, plageInit, demiDebut, demiFin); });
    });
    pop.querySelectorAll("button[data-rapide]").forEach(function (btn) {
      btn.addEventListener("click", function () { var texte = btn.dataset.rapide; fermer(); ajoutRapide(cibles, giDebut, duree, texte, "absence", demiDebut, demiFin); });
    });
    pop.querySelectorAll("button[data-form]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var f = FORMULAIRES_RAPIDES[+btn.dataset.form]; fermer();
        if (!f) return;
        if (f.nom === "Armature") { ouvrirFormulaireArmature(cibles, giDebut, duree, x, y, plageInit, demiDebut, demiFin); return; }
        if (f.nom === "Béton") { ouvrirFormulaireBeton(cibles, giDebut, duree, x, y, plageInit, demiDebut, demiFin); return; }
        if (f.nom === "Livraison armature") { ouvrirFormulaireLivraisonArmature(cibles, giDebut, duree, x, y, plageInit, demiDebut, demiFin); return; }
        // Un formulaire sans champ s'ajoute en un clic, avec SON type :
        // "Congé" configuré en absence pose bien un congé, pas une tâche.
        if (!f.champs || !f.champs.length) { ajoutRapide(cibles, giDebut, duree, f.nom, f.typeEntree === "absence" ? "absence" : "tache", demiDebut, demiFin); return; }
        ouvrirFormulaireDynamique(f, cibles, giDebut, duree, x, y, plageInit, demiDebut, demiFin);
      });
    });
  }
  function ouvrirAjout(cell, x, y) {
    var kind = cell.dataset.kind;
    // Clic simple (sans glissé) sur jalon/note (round du 12.09.2026 — Lionel :
    // « je les veux case par case, une case = une demi journée ») : la
    // demi-journée visée est désormais celle sous le POINTEUR (moitié
    // gauche/droite de la case pleine largeur, cf. demiDepuisPointeur — déjà
    // utilisée pour le glissement d'une note existante), pas systématiquement
    // la journée entière comme avant ce round.
    if (kind !== "personne") {
      var demiClicPlein = demiDepuisPointeur(cell, x);
      ouvrirEditionPlage(kind, null, +cell.dataset.jour, 1, x, y, cell, demiClicPlein, demiClicPlein);
      return;
    }
    // Filet de sécurité : le chargement d'arrière-plan démarré à l'ouverture
    // de l'appli (cf. demarrer()) a presque toujours fini depuis longtemps à
    // ce stade ; no-op si c'est déjà le cas (cf. chargerFormulairesRapides).
    chargerFormulairesRapides();
    var pop = document.createElement("div");
    pop.className = "pop menu-pop";
    pop.innerHTML = '<div class="cp-titre">Ajouter</div>' + boutonsMenuAjout(cell.dataset.personne);
    positionnerPop(pop, x, y);
    var fermer = fermerAuClicExterieur(pop, cell);
    var cibleRapide = [{ personne: cell.dataset.personne, demi: cell.dataset.demi }];
    var giRapide = +cell.dataset.jour;
    cablerBoutonsMenuAjout(pop, fermer, cell, x, y, cibleRapide, giRapide, 1, null, cell.dataset.demi, cell.dataset.demi);
  }
  function ouvrirAjoutPlage(kind, cibles, giDebut, duree, demiDebut, demiFin) {
    var premiere = cibles[0];
    var cell = document.querySelector('.cell[data-kind="personne"][data-jour="' + giDebut + '"][data-personne="' + premiere.personne + '"][data-demi="' + premiere.demi + '"]');
    if (!cell) return;
    var grilleRect = cell.closest(".grille").getBoundingClientRect();
    var px = grilleRect.left + grilleRect.width / 2 - 110, py = grilleRect.bottom + 10;
    // demiDebut/demiFin (round du 12.09.2026) : bords précis de la plage
    // "case par case" issue du glissé (bornesDepuisDemiSlots côté appelant),
    // désormais transportés jusqu'à ouvrirEdition (state.demiDebut/demiFin
    // initial, cf. plus bas) pour que la fiche qui s'ouvre — et ses boutons
    // A/P — reflète exactement ce qui vient d'être surligné.
    var plageInit = { cibles: cibles, giDebut: giDebut, duree: duree, demiDebut: demiDebut || null, demiFin: demiFin || null, px: px, py: py };
    var pop = document.createElement("div");
    pop.className = "pop menu-pop";
    var taille = duree + " jour" + (duree > 1 ? "s" : "") + (cibles.length > 1 ? (" · " + cibles.length + " personnes") : "");
    pop.innerHTML = '<div class="cp-titre">Ajouter (' + taille + ')</div>' + boutonsMenuAjout(premiere.personne);
    positionnerPop(pop, px, py);
    var fermer = fermerAuClicExterieur(pop);
    cablerBoutonsMenuAjout(pop, fermer, cell, null, null, cibles, giDebut, duree, plageInit, demiDebut, demiFin);
  }

  // §85 (round du 17.09.2026) — Lionel, mockup mockup-sous-menu-outils.html à
  // l'appui : icône "+" de la barre d'outils, pour ajouter un Jalon/Note/
  // Tâche/Absence SANS être obligé de cliquer une case de la grille au
  // préalable (contrairement à ouvrirAjout/ouvrirAjoutPlage ci-dessus, qui
  // partent toujours d'une case ou d'une plage réellement cliquée).
  // giPourAjoutBarre() vise aujourd'hui s'il est dans la semaine affichée (10
  // jours en mode 2 semaines), sinon le premier jour affiché — pas d'autre
  // choix raisonnable sans case cliquée pour deviner "quel jour".
  function giPourAjoutBarre() {
    var n = nbJoursAffiches();
    for (var gi = 0; gi < n; gi++) { if (isoDeGi(gi) === etat.aujourdhui) return gi; }
    return 0;
  }
  function ouvrirAjoutElementBarre(type, personneId) {
    var gi = giPourAjoutBarre();
    // Jalon/Note : même formulaire qu'un clic sur leur ligne (ouvrirAjout,
    // branche kind !== "personne"), journée ENTIÈRE par défaut (demiDebut/
    // demiFin null — pas de case cliquée pour deviner matin/après-midi,
    // ajustable ensuite via les boutons M/A de la fiche qui s'ouvre).
    if (type === "jalon" || type === "note") {
      ouvrirEditionPlage(type, null, gi, 1, null, null, null, null, null);
      return;
    }
    // Tâche/Absence : même formulaire qu'un clic sur la case du jour de
    // cette personne (ouvrirEdition), via un plageInit "fabriqué" à la main
    // (aucune case réelle) plutôt qu'un cell DOM — cf. le commentaire de
    // ouvrirEdition, qui ignore totalement `cell` dès qu'un plageInit est
    // fourni. px/py : même repli "centre de l'écran" que ouvrirAjoutPersonne
    // ci-dessus (pas de case/position de clic à partir de laquelle positionner
    // la fiche).
    var px = Math.round(window.innerWidth / 2 - 110), py = Math.round(window.innerHeight / 2 - 90);
    var plageInit = { cibles: [{ personne: personneId, demi: "matin" }], giDebut: gi, duree: 1, demiDebut: null, demiFin: null, px: px, py: py };
    ouvrirEdition(null, null, type, null, null, plageInit, null, null);
  }

  function positionFormulaire(x, y, plageInit) {
    if (plageInit) return { px: plageInit.px, py: plageInit.py };
    return { px: x != null ? x : Math.round(window.innerWidth / 2 - 110), py: y != null ? y : Math.round(window.innerHeight / 2 - 90) };
  }
  function cablerChipsExclusifs(container, attr, onChange) {
    container.querySelectorAll("[data-" + attr + "]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        container.querySelectorAll("[data-" + attr + "]").forEach(function (b) { b.classList.remove("actif"); });
        btn.classList.add("actif");
        onChange(btn.dataset[attr]);
      });
    });
  }
  function suffixeEtape(valeurEtape) { var n = (valeurEtape || "").trim(); return n ? " E" + n : ""; }
  // Round du 14.09.2026 : idem champChantierJalonHTML — un chantier
  // désactivé n'est plus proposé pour une NOUVELLE tâche, sauf s'il s'agit
  // du chantier déjà en place sur la tâche en cours d'édition.
  // « Aucun chantier » (round du 26.09.2026, suite 66 — Lionel :
  // « Possibilité d'affecter une tâches à aucun chantier. il est déjà
  // possible de désélectionner un chantier par défaut. dans l'impression il
  // sera noté autre. Reste sans couleur. ») : 1re option, valeur "" (lue
  // comme null), choisie quand la case n'a pas de chantier et qu'aucun
  // chantier par défaut n'est coché dans la légende — avant, le navigateur
  // prenait le 1er chantier de la liste (ou premierChantierActif_).
  var LIBELLE_SANS_CHANTIER = "Aucun chantier";
  function optionSansChantierHTML_(choisi) {
    return '<option value=""' + (choisi ? " selected" : "") + '>' + LIBELLE_SANS_CHANTIER + '</option>';
  }
  function champChantierHTML(chantierInit) {
    var noms = Object.keys(CHANTIERS).filter(function (nom) {
      var c = CHANTIERS[nom];
      return (c && c.actif !== false) || nom === chantierInit;
    });
    var options = optionSansChantierHTML_(!chantierInit || !CHANTIERS[chantierInit]) +
      noms.map(function (nom) { return '<option value="' + esc(nom) + '"' + (chantierInit === nom ? " selected" : "") + '>' + esc(nom) + '</option>'; }).join("");
    return '<select class="f-chantier">' + options + '</select>';
  }
  function champStatutHTML(statutInit) {
    var chips = '<button type="button" class="chip sub' + (!statutInit ? " actif" : "") + '" data-statut="">Aucun</button>' +
      STATUTS_ORDRE.map(function (s) { return '<button type="button" class="chip sub' + (statutInit === s ? " actif" : "") + '" data-statut="' + s + '">' + esc(STATUTS[s].nom) + '</button>'; }).join("");
    return '<div class="label-champ">Statut</div><div class="chip-row statut-row">' + chips + '</div>';
  }

  // Les 3 formulaires historiques (Armature/Béton/Livraison armature) sont
  // repris quasi tels quels du prototype — ils n'implémentent PAS "Série"
  // (jamais demandé par Lionel pour ces 3-là) et n'ont pas de mode édition
  // (toujours "Ajouter"). Le texte final part directement dans TACHES via
  // creerGroupeTaches ; c'est ensuite synchroniser() (appelé par render())
  // qui le pousse au serveur comme une tâche normale.
  function ouvrirFormulaireArmature(cibles, giDebut, duree, x, y, plageInit, demiDebut, demiFin) {
    var pop = document.createElement("div");
    pop.className = "pop form-pop";
    var etat = { zone: "murs", precision: "" };
    pop.innerHTML =
      '<div class="cp-titre">Ajouter — Armature</div>' +
      champChantierHTML(chantierExistantDansCase(cibles, giDebut, duree) || chantierParDefautValide()) +
      '<div class="label-champ">Zone</div>' +
      '<div class="chip-row zone-row">' +
      '<button type="button" class="chip actif" data-zone="murs">Murs</button>' +
      '<button type="button" class="chip" data-zone="radier">Radier</button>' +
      '<button type="button" class="chip" data-zone="dalle">Dalle</button>' +
      '<button type="button" class="chip" data-zone="autre">Autre…</button>' +
      '</div>' +
      '<div class="precision-wrap" hidden>' +
      '<div class="label-champ">Précision</div>' +
      '<div class="chip-row prec-row">' +
      '<button type="button" class="chip sub" data-prec="inférieure">Inférieure</button>' +
      '<button type="button" class="chip sub" data-prec="supérieure">Supérieure</button>' +
      '</div></div>' +
      '<div class="etape-wrap" hidden>' +
      '<div class="label-champ">Étape</div>' +
      '<input type="text" class="f-etape" placeholder="Numéro (si plusieurs étapes)" inputmode="numeric">' +
      '</div>' +
      '<input type="text" class="f-texte-autre" placeholder="Texte…" hidden>' +
      champStatutHTML(null) +
      '<div class="apercu"><span class="apercu-label">Aperçu du texte</span><span class="apercu-texte"></span></div>' +
      '<div class="form-actions"><button type="button" class="f-annuler">Annuler</button><button type="button" class="f-ok">Enregistrer</button></div>';
    var pos = positionFormulaire(x, y, plageInit);
    positionnerPop(pop, pos.px, pos.py);
    var fermer = fermerAuClicExterieur(pop, null, function () { pop.querySelector(".f-ok").click(); });

    var precisionWrap = pop.querySelector(".precision-wrap");
    var etapeWrap = pop.querySelector(".etape-wrap");
    var champEtape = pop.querySelector(".f-etape");
    var champAutre = pop.querySelector(".f-texte-autre");
    var champChantierSel = pop.querySelector(".f-chantier");
    var apercuTexte = pop.querySelector(".apercu-texte");
    var LABEL_ZONE = { murs: "murs", radier: "radier", dalle: "dalle" };
    var statutActuel = null;
    cablerChipsExclusifs(pop.querySelector(".statut-row"), "statut", function (v) { statutActuel = v || null; });

    function majApercu() {
      var texte;
      if (etat.zone === "autre") {
        texte = "Armature" + (champAutre.value.trim() ? " " + champAutre.value.trim() : "");
      } else if (etat.zone === "murs") {
        texte = "Armature murs" + suffixeEtape(champEtape.value);
      } else {
        texte = "Armature " + LABEL_ZONE[etat.zone] + (etat.precision ? " " + etat.precision : "");
      }
      apercuTexte.textContent = texte;
      return texte;
    }
    function majVisibilite() {
      var avecPrecision = etat.zone === "radier" || etat.zone === "dalle";
      precisionWrap.hidden = !avecPrecision;
      if (!avecPrecision) { etat.precision = ""; pop.querySelectorAll("[data-prec]").forEach(function (b) { b.classList.remove("actif"); }); }
      var avecEtape = etat.zone === "murs";
      etapeWrap.hidden = !avecEtape;
      if (!avecEtape) champEtape.value = "";
      champAutre.hidden = etat.zone !== "autre";
    }
    cablerChipsExclusifs(pop.querySelector(".zone-row"), "zone", function (v) { etat.zone = v; majVisibilite(); majApercu(); });
    cablerChipsExclusifs(precisionWrap, "prec", function (v) { etat.precision = v; majApercu(); });
    champEtape.addEventListener("input", majApercu);
    champAutre.addEventListener("input", majApercu);
    majVisibilite(); majApercu();

    pop.querySelector(".f-annuler").addEventListener("click", fermer);
    pop.querySelector(".f-ok").addEventListener("click", function () {
      var texte = majApercu();
      sauvegarderUndo();
      creerGroupeTaches(cibles, giDebut, duree, { type: "tache", texte: texte, important: false, chantier: champChantierSel.value || null, statut: statutActuel, demiDebut: demiDebut, demiFin: demiFin });
      fermer(); render(); toast("Ajouté.");
    });
  }
  function ouvrirFormulaireBeton(cibles, giDebut, duree, x, y, plageInit, demiDebut, demiFin) {
    var pop = document.createElement("div");
    pop.className = "pop form-pop";
    var etat = { zone: "murs" };
    pop.innerHTML =
      '<div class="cp-titre">Ajouter — Béton</div>' +
      champChantierHTML(chantierExistantDansCase(cibles, giDebut, duree) || chantierParDefautValide()) +
      '<div class="label-champ">Zone</div>' +
      '<div class="chip-row zone-row">' +
      '<button type="button" class="chip actif" data-zone="murs">Murs</button>' +
      '<button type="button" class="chip" data-zone="piliers">Piliers</button>' +
      '<button type="button" class="chip" data-zone="radier">Radier</button>' +
      '<button type="button" class="chip" data-zone="dalle">Dalle</button>' +
      '<button type="button" class="chip" data-zone="autre">Autre…</button>' +
      '</div>' +
      '<div class="etape-wrap" hidden>' +
      '<div class="label-champ">Étape</div>' +
      '<input type="text" class="f-etape" placeholder="Numéro (si plusieurs étapes)" inputmode="numeric">' +
      '</div>' +
      '<input type="text" class="f-texte-autre" placeholder="Texte…" hidden>' +
      '<div class="row3">' +
      '<div><div class="label-champ">Quantité</div><div class="champ-unite"><input type="text" class="f-quantite" placeholder="50" inputmode="decimal"><span class="unite">m³</span></div></div>' +
      '<div><div class="label-champ">Formule</div><input type="text" class="f-formule" placeholder="C301"></div>' +
      '<div><div class="label-champ">Heure</div><input type="text" class="f-heure" placeholder="13h30"></div>' +
      '</div>' +
      champStatutHTML(null) +
      '<div class="apercu"><span class="apercu-label">Aperçu du texte</span><span class="apercu-texte"></span></div>' +
      '<div class="form-actions"><button type="button" class="f-annuler">Annuler</button><button type="button" class="f-ok">Enregistrer</button></div>';
    var pos = positionFormulaire(x, y, plageInit);
    positionnerPop(pop, pos.px, pos.py);
    var fermer = fermerAuClicExterieur(pop, null, function () { pop.querySelector(".f-ok").click(); });

    var etapeWrap = pop.querySelector(".etape-wrap");
    var champEtape = pop.querySelector(".f-etape");
    var champAutre = pop.querySelector(".f-texte-autre");
    var champQuantite = pop.querySelector(".f-quantite");
    var champFormule = pop.querySelector(".f-formule");
    var champHeure = pop.querySelector(".f-heure");
    var champChantierSel = pop.querySelector(".f-chantier");
    var apercuTexte = pop.querySelector(".apercu-texte");
    var LABEL_ZONE = { murs: "murs", piliers: "piliers", radier: "radier", dalle: "dalle" };
    var statutActuel = null;
    cablerChipsExclusifs(pop.querySelector(".statut-row"), "statut", function (v) { statutActuel = v || null; });

    function majApercu() {
      var zoneTxt = etat.zone === "autre" ? champAutre.value.trim() : LABEL_ZONE[etat.zone];
      if (etat.zone === "murs") zoneTxt = zoneTxt + suffixeEtape(champEtape.value);
      var segments = ["Béton" + (zoneTxt ? " " + zoneTxt : "")];
      var q = champQuantite.value.trim();
      if (q) segments.push(q + "m³");
      if (champFormule.value.trim()) segments.push(champFormule.value.trim());
      if (champHeure.value.trim()) segments.push(champHeure.value.trim());
      var texte = segments.join(" - ");
      apercuTexte.textContent = texte;
      return texte;
    }
    function majVisibilite() {
      var avecEtape = etat.zone === "murs";
      etapeWrap.hidden = !avecEtape;
      if (!avecEtape) champEtape.value = "";
    }
    cablerChipsExclusifs(pop.querySelector(".zone-row"), "zone", function (v) {
      etat.zone = v; champAutre.hidden = v !== "autre"; majVisibilite(); majApercu();
    });
    champEtape.addEventListener("input", majApercu);
    [champAutre, champQuantite, champFormule, champHeure].forEach(function (el) { el.addEventListener("input", majApercu); });
    majVisibilite(); majApercu();

    pop.querySelector(".f-annuler").addEventListener("click", fermer);
    pop.querySelector(".f-ok").addEventListener("click", function () {
      var texte = majApercu();
      sauvegarderUndo();
      creerGroupeTaches(cibles, giDebut, duree, { type: "tache", texte: texte, important: false, chantier: champChantierSel.value || null, statut: statutActuel, demiDebut: demiDebut, demiFin: demiFin });
      fermer(); render(); toast("Ajouté.");
    });
  }
  function ouvrirFormulaireLivraisonArmature(cibles, giDebut, duree, x, y, plageInit, demiDebut, demiFin) {
    var pop = document.createElement("div");
    pop.className = "pop form-pop";
    var etat = { zone: "murs" };
    pop.innerHTML =
      '<div class="cp-titre">Ajouter — Livraison armature</div>' +
      champChantierHTML(chantierExistantDansCase(cibles, giDebut, duree) || chantierParDefautValide()) +
      '<div class="label-champ">Zone</div>' +
      '<div class="chip-row zone-row">' +
      '<button type="button" class="chip actif" data-zone="murs">Murs</button>' +
      '<button type="button" class="chip" data-zone="radier">Radier</button>' +
      '<button type="button" class="chip" data-zone="dalle">Dalle</button>' +
      '</div>' +
      champStatutHTML(null) +
      '<div class="apercu"><span class="apercu-label">Aperçu du texte</span><span class="apercu-texte"></span></div>' +
      '<div class="form-actions"><button type="button" class="f-annuler">Annuler</button><button type="button" class="f-ok">Enregistrer</button></div>';
    var pos = positionFormulaire(x, y, plageInit);
    positionnerPop(pop, pos.px, pos.py);
    var fermer = fermerAuClicExterieur(pop, null, function () { pop.querySelector(".f-ok").click(); });

    var champChantierSel = pop.querySelector(".f-chantier");
    var apercuTexte = pop.querySelector(".apercu-texte");
    var LABEL_ZONE = { murs: "murs", radier: "radier", dalle: "dalle" };
    var statutActuel = null;
    cablerChipsExclusifs(pop.querySelector(".statut-row"), "statut", function (v) { statutActuel = v || null; });

    function majApercu() {
      var texte = "Livraison armature " + LABEL_ZONE[etat.zone];
      apercuTexte.textContent = texte;
      return texte;
    }
    cablerChipsExclusifs(pop.querySelector(".zone-row"), "zone", function (v) { etat.zone = v; majApercu(); });
    majApercu();

    pop.querySelector(".f-annuler").addEventListener("click", fermer);
    pop.querySelector(".f-ok").addEventListener("click", function () {
      var texte = majApercu();
      sauvegarderUndo();
      creerGroupeTaches(cibles, giDebut, duree, { type: "tache", texte: texte, important: false, chantier: champChantierSel.value || null, statut: statutActuel, demiDebut: demiDebut, demiFin: demiFin });
      fermer(); render(); toast("Ajouté.");
    });
  }

  // ---- ouvrirFormulaireDynamique — formulaire générique pour tout
  // "Entrée rapide" personnalisé (FORMULAIRES_RAPIDES venant du serveur,
  // apiListerFormulairesRapides). Même gabarit visuel que les 3 formulaires
  // historiques (Chantier en haut, un champ par ligne, Statut, aperçu du
  // texte en direct, Série). Simplifications par rapport au prototype,
  // imposées par le contrat serveur figé (§3 du spec, cf. FRONTEND-CHANGELOG.md
  // pour le détail) : ni "type" (Tâche/Absence) ni "assigné à" ne sont
  // stockés par formulaire — toute entrée dynamique crée donc une TÂCHE
  // (jamais une absence directe : "Congé"/"Vacances" restent 2 boutons
  // Absence câblés en dur dans boutonsMenuAjout) et apparaît dans le menu
  // Ajouter de tout le monde, personnel compris. Statut reste réservé aux
  // sous-traitants (bugfix point 111 du round V3 : jamais pour le
  // personnel), Chantier reste proposé dans tous les cas. Pas de champ
  // "unité" dédié (absent du contrat) : à inclure dans le libellé au besoin
  // (ex. "Quantité (m³)").
  function ouvrirFormulaireDynamique(f, cibles, giDebut, duree, x, y, plageInit, demiDebut, demiFin) {
    // Type d'entrée du formulaire (9e colonne côté feuille, round du
    // 02.09.2026) : une entrée rapide peut désormais produire une ABSENCE et
    // plus seulement une tâche — c'est ce qui rend Congé/Vacances
    // configurables au lieu d'être figés dans le menu.
    var typeEntreeDyn = (f.typeEntree === "absence") ? "absence" : "tache";
    var personneRefDyn = cibles.length ? cibles[0].personne : null;
    var estSousTraitantDyn = personneRefDyn ? secteurPersonne(personneRefDyn) === "sous-traitant" : false;
    var pop = document.createElement("div");
    pop.className = "pop form-pop";
    var champsHTML = (f.champs || []).map(function (c) {
      if (c.type === "select") {
        var chips = (c.options || []).map(function (o, i) {
          return '<button type="button" class="chip sub' + (i === 0 ? " actif" : "") + '" data-val="' + esc2(o) + '">' + esc(o) + '</button>';
        }).join("");
        return '<div class="label-champ">' + esc(c.label) + '</div><div class="chip-row" data-champ-choix="' + esc2(c.cle) + '">' + chips + '</div>';
      }
      if (c.type === "case") {
        return '<label class="chk"><input type="checkbox" class="champ-dyn-case" data-champ="' + esc2(c.cle) + '"> ' + esc(c.label) + '</label>';
      }
      return '<div class="label-champ">' + esc(c.label) + '</div><input type="text" class="champ-dyn" data-champ="' + esc2(c.cle) + '"' +
        (c.type === "nombre" ? ' inputmode="decimal"' : "") + ' placeholder="' + esc(c.label) + '…">';
    }).join("");
    pop.innerHTML =
      '<div class="cp-titre">Ajouter — ' + esc(f.nom) + '</div>' +
      champChantierHTML(chantierExistantDansCase(cibles, giDebut, duree) || chantierParDefautValide()) +
      champsHTML +
      (estSousTraitantDyn ? champStatutHTML(null) : "") +
      '<div class="apercu"><span class="apercu-label">Aperçu du texte</span><span class="apercu-texte"></span></div>' +
      serieChampsHTML() +
      '<div class="form-actions"><button type="button" class="f-annuler">Annuler</button><button type="button" class="f-ok">Enregistrer</button></div>';
    var pos = positionFormulaire(x, y, plageInit);
    positionnerPop(pop, pos.px, pos.py);
    var fermer = fermerAuClicExterieur(pop, null, function () { pop.querySelector(".f-ok").click(); });
    var champChantierSel = pop.querySelector(".f-chantier");
    var apercuTexte = pop.querySelector(".apercu-texte");
    var statutActuel = null;
    if (estSousTraitantDyn) cablerChipsExclusifs(pop.querySelector(".statut-row"), "statut", function (v) { statutActuel = v || null; });
    var lireChoixSerie = cablerSerieChamps(pop, isoDeGi(giDebut));

    var valeursChoix = {};
    (f.champs || []).forEach(function (c) {
      if (c.type === "select") {
        valeursChoix[c.cle] = (c.options && c.options[0]) || "";
        cablerChipsExclusifs(pop.querySelector('[data-champ-choix="' + c.cle + '"]'), "val", function (v) { valeursChoix[c.cle] = v; majApercu(); });
      }
    });

    function majApercu() {
      var segments = [f.nom];
      (f.champs || []).forEach(function (c) {
        var v;
        if (c.type === "select") v = valeursChoix[c.cle];
        else if (c.type === "case") { var chk = pop.querySelector('.champ-dyn-case[data-champ="' + c.cle + '"]'); v = (chk && chk.checked) ? c.label : ""; }
        else { var input = pop.querySelector('.champ-dyn[data-champ="' + c.cle + '"]'); v = input ? input.value.trim() : ""; }
        if (v) segments.push(v);
      });
      var texte = segments.join(" - ");
      apercuTexte.textContent = texte;
      return texte;
    }
    pop.querySelectorAll(".champ-dyn, .champ-dyn-case").forEach(function (input) {
      input.addEventListener("input", majApercu); input.addEventListener("change", majApercu);
    });
    majApercu();

    pop.querySelector(".f-annuler").addEventListener("click", fermer);
    pop.querySelector(".f-ok").addEventListener("click", function () {
      var texte = majApercu();
      var chantier = champChantierSel ? (champChantierSel.value || null) : null;
      var choixSerie = lireChoixSerie();
      if (choixSerie) {
        fermer();
        // duree/demiDebut/demiFin (round du 15.09.2026) : déjà en scope ici
        // (paramètres de ouvrirFormulaireDynamique) et déjà transmis tels
        // quels à creerGroupeTaches ci-dessous pour le chemin normal — il
        // manquait seulement de les transmettre pareillement au chemin
        // "Série", qui les ignorait silencieusement.
        creerSerieServeur(typeEntreeDyn, cibles, giDebut, texte, false, chantier, statutActuel, choixSerie, function (r) {
          apresEcritureSerie(r); toast("Série ajoutée.");
        }, duree, demiDebut, demiFin).catch(function (err) {
          toast("Échec de la création de la série : " + (err && err.message ? err.message : err));
        });
      } else {
        sauvegarderUndo();
        creerGroupeTaches(cibles, giDebut, duree, { type: typeEntreeDyn, texte: texte, important: false, chantier: chantier, statut: statutActuel, demiDebut: demiDebut, demiFin: demiFin });
        fermer(); render(); toast("Ajouté.");
      }
    });
  }

  // ---- ouvrirEdition (tâche/absence) — adaptation du prototype : la case
  // "Série" à la création appelle désormais creerSerieServeur (serveur
  // d'abord, cache invalidé, PUIS re-rendu — apresEcritureSerie), au lieu de
  // générer les occurrences en mémoire. Modifier/supprimer un item qui PORTE
  // déjà un serieId (constaté depuis le cache, cf. tacheSlotAuGi/
  // construireVueDepuisCache — le serveur renvoie taches[].serieId) passe
  // systématiquement, quelle que soit la portée choisie ("unique" compris),
  // par la boîte « événement récurrent » puis l'écriture directe de
  // series.js (round du 24.09.2026, suite 20 — avant : gerer-serie, qui
  // ignorait les dates) : on ne les "splice" pas dans TACHES par optimisme
  // (cf. FRONTEND-CHANGELOG.md). Un item SANS
  // serieId se comporte exactement comme dans le prototype : mutation locale
  // de TACHES + render() (qui synchronise ensuite via le moteur de diff).
  function ouvrirEdition(cell, itemExisting, typeIfNew, x, y, plageInit, demiDebutArg, demiFinArg) {
    var extraCell = cell ? { personne: cell.dataset.personne, demi: cell.dataset.demi } : null;
    var giDebut0 = plageInit ? plageInit.giDebut : (cell ? +cell.dataset.jour : (itemExisting ? itemExisting.giDebut : 0));
    var duree0 = plageInit ? plageInit.duree : (itemExisting ? (itemExisting.duree || 1) : 1);
    var cibles = plageInit ? plageInit.cibles : (extraCell ? [extraCell] : []);
    var typeAffiche = itemExisting ? itemExisting.type : typeIfNew;

    // état local de la carte (mutable, re-rendu par cablerDatesPlage/
    // rafraichirDates) : la demi-journée initiale d'une NOUVELLE tâche/
    // absence reprend désormais les bords PRÉCIS de la plage sélectionnée au
    // glissé (demiDebutArg/demiFinArg, cf. bornesDepuisDemiSlots côté
    // cablerAjoutCellule — round du 12.09.2026, corrige Lionel : « Les
    // boutons A/P ne sont pas automatiquement en surbrillance suivant la
    // bulle »), plutôt qu'une seule demi-journée reprise de la case cliquée
    // (ancien demiInit, conservé comme repli pour un simple clic — cellule
    // unique, sans plage précise transmise).
    var demiInit = (!itemExisting && extraCell && (extraCell.demi === "matin" || extraCell.demi === "aprem")) ? extraCell.demi : null;
    var state = {
      kind: typeAffiche, // "tache"|"absence" — depuis le round du 24.09.2026 (suite 5), une date hors fenêtre est acceptée ici aussi (debutHorsFenetreIso/finHorsFenetreIso), enregistrée par enregistrerHorsFenetre plus bas.
      giDebut: giDebut0, giFin: giDebut0 + duree0 - 1,
      debutHorsFenetreIso: null, finHorsFenetreIso: null,
      demiDebut: itemExisting ? (itemExisting.demiDebut || null) : (demiDebutArg !== undefined ? demiDebutArg : demiInit),
      demiFin: itemExisting ? (itemExisting.demiFin || null) : (demiFinArg !== undefined ? demiFinArg : demiInit),
      important: itemExisting ? itemExisting.important : false
    };

    var pop = document.createElement("div");
    pop.className = "pop form-pop carte-item";
    var texteInit = itemExisting ? itemExisting.texte : "";
    var champChantier = "", defautNouveau = null;
    if (typeAffiche === "tache") {
      // Nouvelle tâche : pré-coché EN PRIORITÉ sur le chantier déjà présent
      // dans la case ciblée s'il y en a un (round du 03.09.2026, cf.
      // chantierExistantDansCase — sinon ajouter une 2e tâche sur une case
      // qui en a déjà une change silencieusement le chantier de la 1ère à la
      // synchronisation), sinon le chantier par défaut choisi dans la
      // légende, sinon comportement d'avant (aucun "selected", le navigateur
      // prend le 1er de la liste). Modification d'une tâche existante :
      // inchangé, son propre chantier.
      defautNouveau = chantierExistantDansCase(cibles, state.giDebut, state.giFin - state.giDebut + 1) || chantierParDefautValide();
      // Round du 14.09.2026 : même filtre qu'champChantierHTML (un chantier
      // désactivé n'est plus proposé pour du NOUVEAU) — MAIS repéré comme un
      // site à part lors des tests (verif_chantier_desactive_grille.js) :
      // cette construction inline, pas champChantierHTML, sert le vrai
      // formulaire "Tâche" de la grille. Reste proposé/sélectionné si c'est
      // le chantier déjà en place sur l'item existant modifié, OU celui déjà
      // présent sur une autre tâche de la même case ciblée (defautNouveau,
      // cf. chantierExistantDansCase) — jamais fait disparaître un chantier
      // déjà utilisé juste sous les yeux de Lionel.
      var sansChantier = itemExisting ? !(itemExisting.chantier && CHANTIERS[itemExisting.chantier]) : !defautNouveau;
      var options = optionSansChantierHTML_(sansChantier) + Object.keys(CHANTIERS).filter(function (k) {
        return CHANTIERS[k].actif !== false || k === defautNouveau || (itemExisting && itemExisting.chantier === k);
      }).map(function (k) {
        var sel = itemExisting ? (itemExisting.chantier === k) : (defautNouveau === k);
        return '<option value="' + esc(k) + '"' + (sel ? " selected" : "") + '>' + esc(k) + '</option>';
      }).join("");
      champChantier = '<select class="f-chantier chantier-tag">' + options + '</select>';
    }
    var personneRef = itemExisting ? itemExisting.personneId : (cibles.length ? cibles[0].personne : null);
    var estSousTraitant = personneRef ? secteurPersonne(personneRef) === "sous-traitant" : false;
    var champStatut = (typeAffiche === "tache" && estSousTraitant) ? champStatutHTML(itemExisting ? itemExisting.statut : null) : "";
    // Round D — Lionel : « modifier une série lors de l'ouverture d'un
    // formulaire avec série ». Un item déjà en série (itemExisting.serieId)
    // affiche désormais le bandeau serieInfoExistanteHTML (au lieu de rien
    // avant ce round) : rend visible dans la fiche elle-même que la portée
    // sera demandée à l'enregistrement (cf. demanderPorteeSerie plus bas,
    // déjà en place). serieChampsHTML() (case à cocher "Série (se répète)")
    // reste réservée à la CRÉATION (nouvelle tâche/absence) : la proposer
    // aussi pour un item existant qui n'est PAS encore en série créerait un
    // doublon serveur (enregistrer-serie insère toujours une occurrence à sa
    // date de départ SANS jamais remplacer ce qui existe déjà ce jour-là, cf.
    // construireOccurrencesSerie côté fonctions/enregistrer-serie/logic.js) —
    // nécessiterait de supprimer l'item existant en même temps que la série
    // est créée. Câblé depuis le round du 25.09.2026 (suite 47 — Lionel,
    // à la liste d'améliorations proposée : « Terminer les restes ») : la
    // case est proposée aussi pour une tâche/absence existante hors série ;
    // cochée, l'enregistrement supprime la tâche d'origine sur le serveur
    // PUIS crée la série à sa place (cf. convertirEnSerie plus bas) — plus
    // de doublon le 1er jour.
    var champSerie = itemExisting && itemExisting.serieId ? serieInfoExistanteHTML() : serieChampsHTML();
    var nomGrand;
    if (typeAffiche === "tache") {
      var pAffiche = itemExisting ? personneParAncre(itemExisting.personneId) : (cibles.length === 1 ? personneParAncre(cibles[0].personne) : null);
      nomGrand = pAffiche ? pAffiche.nom : (cibles.length > 1 ? (cibles.length + " personnes") : "");
    } else {
      nomGrand = "Absence";
    }
    var couleurBandeau = typeAffiche === "tache" ? (CHANTIERS[itemExisting ? itemExisting.chantier : defautNouveau] || {}).couleur : null;
    // Sans chantier (suite 66) : bandeau neutre, comme la bulle.
    var fondStyle = typeAffiche === "tache" ? ("background:" + (couleurBandeau || "var(--surface-2)")) : "background:var(--absence-bg)";

    pop.innerHTML =
      bandeauHTML({ clair: typeAffiche !== "tache", fondStyle: fondStyle, important: state.important, chantierHTML: champChantier, nomGrand: nomGrand }) +
      datesPlageHTML(state.giDebut, state.giFin, state.demiDebut, state.demiFin, state.debutHorsFenetreIso, state.finHorsFenetreIso) +
      '<div class="contenu-carte">' +
      '<div class="corps"><div class="label-champ" style="margin:0 0 6px">Descriptif</div>' +
      '<div class="descriptif-texte" tabindex="0"></div></div>' +
      optionsAvanceesHTML(champStatut, champSerie) +
      '</div>' +
      piedPrincipalHTML(!!itemExisting);

    var pos = positionFormulaire(x, y, plageInit);
    positionnerPop(pop, pos.px, pos.py);
    // Round D — surbrillance PRÉCISE de la plage entière (pas juste la case
    // de départ, cf. surbrillancePrecisePersonnes ci-dessus) pendant que la
    // fiche est ouverte, pour une nouvelle tâche/absence.
    var fermer = fermerAuClicExterieur(pop, !itemExisting ? surbrillancePrecisePersonnes(cibles, state.giDebut, state.giFin - state.giDebut + 1, state.demiDebut, state.demiFin) : null, function () { pop.querySelector(".f-ok").click(); });

    pop.querySelector(".f-annuler").addEventListener("click", fermer);
    pop.querySelector(".f-important").addEventListener("click", function () {
      state.important = !state.important;
      this.classList.toggle("actif", state.important);
    });
    // datesModifiees : posé dès que Lionel touche une date/un A-P (tout
    // passe par rafraichirDates) — cf. l'étendue réelle chargée plus bas,
    // qui ne doit jamais écraser un choix déjà fait entre-temps.
    var datesModifiees = false;
    function rafraichirDates() {
      datesModifiees = true;
      pop.querySelector(".dates-plage").outerHTML = datesPlageHTML(state.giDebut, state.giFin, state.demiDebut, state.demiFin, state.debutHorsFenetreIso, state.finHorsFenetreIso);
      cablerDatesPlage(pop, state, rafraichirDates);
    }
    cablerDatesPlage(pop, state, rafraichirDates);
    // Étendue RÉELLE d'une tâche qui touche un bord de l'écran (round du
    // 24.09.2026, suite 5) : la grille n'en connaît que la partie visible,
    // et la fiche l'affichait donc tronquée (ex. "ven. -> ven." pour une
    // tâche qui continue jusqu'au mardi suivant) — l'enregistrer telle
    // quelle, même pour changer le seul texte, l'aurait raccourcie à sa
    // partie visible. Chargée en arrière-plan dès l'ouverture (cf.
    // lignesTacheServeur), puis reportée dans les dates de la fiche ; la
    // même promesse sert ensuite à Enregistrer/Supprimer (debordementOrigine),
    // sans 2e requête.
    var promesseOrigine = (itemExisting && !itemExisting.serieId && toucheBordFenetre(itemExisting)) ? lignesTacheServeur(itemExisting) : null;
    if (promesseOrigine) promesseOrigine.then(function (r) {
      if (!r.debordeFenetre || datesModifiees || !pop.isConnected) return;
      var dates = r.lignes.map(function (l) { return l.date; }).sort();
      var premier = dates[0], dernier = dates[dates.length - 1];
      var demisDe = function (iso) { return r.lignes.filter(function (l) { return l.date === iso; }).map(function (l) { return l.demi; }); };
      if (premier < isoDeGi(0)) {
        state.debutHorsFenetreIso = premier;
        state.demiDebut = demisDe(premier).indexOf("matin") >= 0 ? null : "aprem";
      }
      if (dernier > isoDeGi(nbJoursAffiches() - 1)) {
        state.finHorsFenetreIso = dernier;
        state.demiFin = demisDe(dernier).indexOf("aprem") >= 0 ? null : "matin";
      }
      rafraichirDates();
      datesModifiees = false;
    }).catch(function () { /* repli : la fiche garde la partie visible, comme avant */ });
    var texteActuel = texteInit;
    cablerDescriptifEdit(pop, function () { return texteActuel; }, function (v) { texteActuel = v; }, "Cliquer pour ajouter un descriptif…");

    var chantierSel = pop.querySelector(".f-chantier");
    if (chantierSel) chantierSel.addEventListener("change", function () {
      var c = CHANTIERS[chantierSel.value];
      pop.querySelector(".bandeau").style.background = c ? c.couleur : "var(--surface-2)";
    });
    var statutRow = pop.querySelector(".statut-row");
    var statutActuel = itemExisting ? (itemExisting.statut || null) : null;
    if (statutRow) cablerChipsExclusifs(statutRow, "statut", function (v) { statutActuel = v || null; });
    var lireChoixSerie = cablerSerieChamps(pop, itemExisting ? itemExisting.dateDebutIso : isoDeGi(state.giDebut));
    cablerLienPlus(pop);

    // ---- Hors de la fenêtre chargée (round du 24.09.2026, suite 5 —
    // Lionel : « J'aimerai pouvoir déplacer une tâche en dehors de la
    // semaine activé »). Cf. le commentaire de section "TÂCHE/ABSENCE HORS
    // DE LA FENÊTRE CHARGÉE" (donnees-sync.js) pour le principe : écriture
    // "serveur d'abord" en vraies dates, puis rechargement — jamais une
    // mutation de TACHES, que le moteur de diff ne saurait écrire qu'à
    // moitié. Utilisé dans 2 cas :
    // - une borne de la fiche est hors de la fenêtre (debut/finHorsFenetreIso) ;
    // - la tâche d'origine DÉBORDE déjà de la fenêtre (étendue réelle trouvée
    //   sur le serveur, cf. lignesTacheServeur) : même une simple modif de
    //   texte ou une suppression doit alors toucher aussi la partie hors
    //   écran, sinon elle resterait orpheline avec l'ancien contenu.
    // Pile Annuler/Refaire vidée ensuite : elle ne contient que des copies
    // de la partie VISIBLE (snapshotEtat) — annuler après une écriture hors
    // fenêtre réécrirait l'ancienne partie visible sans retirer la nouvelle
    // partie hors écran (doublon), comme le ferait n'importe quel état
    // antérieur de la pile qui contient encore l'ancienne tâche.
    function ecrireHorsFenetre(travail, message) {
      fermer();
      occupe(true);
      travail().then(function () {
        occupe(false);
        pileUndo = []; pileRedo = [];
        toast(message);
        apresEcritureSerie();
      }).catch(function (err) {
        occupe(false);
        toast("Échec de l’enregistrement : " + (err && err.message ? err.message : err) + " — rechargement…");
        apresEcritureSerie();
      });
    }
    function libellePlage(isoD, isoF) {
      var l = function (iso) { return libelleDateCourteIso(iso).toLowerCase(); };
      return isoD === isoF ? ("le " + l(isoD)) : ("du " + l(isoD) + " au " + l(isoF));
    }
    // Lignes serveur de la tâche d'origine SI elle déborde de la fenêtre,
    // sinon null (la voie locale habituelle suffit alors). Une tâche qui ne
    // touche aucun bord de l'écran ne peut pas déborder : pas de requête.
    // enregistrementEnCours : ces vérifications passent par le serveur, la
    // fiche reste ouverte le temps de la réponse — un 2e clic sur
    // Enregistrer/Supprimer (ou un clic extérieur, qui valide) ne doit pas
    // relancer l'écriture une seconde fois.
    var enregistrementEnCours = false;
    function debordementOrigine() {
      if (!promesseOrigine) return Promise.resolve(null);
      return promesseOrigine.then(function (r) { return r.debordeFenetre ? r.lignes : null; });
    }

    var suppr = pop.querySelector(".f-suppr");
    if (suppr) suppr.addEventListener("click", function () {
      function supprimerUnique() {
        if (enregistrementEnCours) return;
        enregistrementEnCours = true;
        debordementOrigine().then(function (lignes) {
          if (lignes) {
            ecrireHorsFenetre(function () {
              return enregistrerTacheEnDatesServeur(ancreDe(itemExisting.personneId), lignes.map(function (l) { return l.id; }), [], {});
            }, "Supprimé (y compris hors de la semaine affichée).");
            return;
          }
          sauvegarderUndo();
          var i = TACHES.indexOf(itemExisting);
          if (i >= 0) TACHES.splice(i, 1);
          fermer(); render(); toast("Supprimé.");
        }).catch(function (err) {
          enregistrementEnCours = false;
          toast("Échec de la suppression : " + (err && err.message ? err.message : err));
        });
      }
      // Bulle de série (round du 24.09.2026, suite 20) : fiche fermée, puis
      // boîte « Supprimer l’événement récurrent » (series.js).
      if (itemExisting.serieId) {
        fermer();
        supprimerAvecPorteeSerie([{ item: itemExisting, liste: TACHES }], null, "Supprimé.");
        return;
      }
      supprimerUnique();
    });
    pop.querySelector(".f-ok").addEventListener("click", function () {
      if (enregistrementEnCours) return;
      var texte = texteActuel.trim();
      if (!texte) { fermer(); return; }
      var important = state.important;
      var chantierSel2 = pop.querySelector(".f-chantier");
      var chantier = chantierSel2 ? (chantierSel2.value || null) : (itemExisting ? itemExisting.chantier : null);
      var statutFinal = statutRow ? statutActuel : null;
      var giDebutFinal = state.giDebut, dureeFinal = state.giFin - state.giDebut + 1;
      var demiDebutFinal = state.demiDebut, demiFinFinal = state.demiFin;
      // Sur 1 seul jour, Début=matin + Fin=aprem est une combinaison valide
      // côté fiche (cf. cablerDatesPlage) mais équivaut à une journée
      // entière — ramenée ici à la forme canonique (null/null) qu'attend
      // tout le reste du fichier (demisOccupeesTache, rendu des bulles,
      // glissé/redimensionnement...), qui suppose encore demiDebut ===
      // demiFin dès que la durée vaut 1.
      if (state.giDebut === state.giFin && !state.debutHorsFenetreIso && !state.finHorsFenetreIso && demiDebutFinal === "matin" && demiFinFinal === "aprem") { demiDebutFinal = null; demiFinFinal = null; }

      // Plage en vraies dates (identique à la plage gi quand tout est dans
      // la fenêtre) — seule base valable dès qu'une borne est hors écran.
      var horsFenetre = !!(state.debutHorsFenetreIso || state.finHorsFenetreIso);
      var isoDebutFinal = state.debutHorsFenetreIso || isoDeGi(state.giDebut);
      var isoFinFinal = state.finHorsFenetreIso || isoDeGi(state.giFin);
      if (isoDebutFinal === isoFinFinal && demiDebutFinal === "matin" && demiFinFinal === "aprem") { demiDebutFinal = null; demiFinFinal = null; }
      var champsTache = { texte: texte, important: important, chantier: chantier, statut: statutFinal, absence: typeAffiche === "absence" };
      var slotsNouveaux = slotsPlageTacheIso(isoDebutFinal, isoFinFinal, demiDebutFinal, demiFinFinal);

      if (itemExisting) {
        function appliquerModifUnique() {
          sauvegarderUndo();
          itemExisting.texte = texte;
          itemExisting.important = important;
          if (chantier) itemExisting.chantier = chantier;
          if (statutRow) itemExisting.statut = statutActuel;
          // giDebut/duree/demiDebut/demiFin : mutation directe puis render()
          // — même trajet déjà emprunté par le glissement/redimensionnement
          // d'une bulle tâche (cf. plus haut, it.demiDebut/it.demiFin/
          // it.giDebut posés en place avant render()), le moteur de diff
          // (synchroniser/calculerEtatLocal) ne distingue pas l'origine du
          // changement.
          itemExisting.giDebut = giDebutFinal;
          itemExisting.duree = dureeFinal;
          itemExisting.demiDebut = demiDebutFinal;
          itemExisting.demiFin = demiFinFinal;
          itemExisting.dateDebutIso = isoDeGi(giDebutFinal);
          fermer(); render(); toast("Modifié.");
        }
        // Tâche existante hors série, case « Série (se répète) » cochée
        // (suite 47) : la tâche d'origine est retirée du serveur (toutes ses
        // lignes, même hors de la semaine affichée), puis la série est créée
        // avec les dates, textes et champs de la fiche. Dans cet ordre :
        // enregistrer-serie ne remplace jamais ce qui existe déjà le jour de
        // départ. Une synchronisation encore en cours (tâche tout juste
        // posée) est d'abord attendue, pour que ses lignes soient bien en
        // base au moment de les retirer.
        var choixConversion = !itemExisting.serieId ? lireChoixSerie() : null;
        if (choixConversion) {
          enregistrementEnCours = true;
          ecrireHorsFenetre(function () {
            return attendreFinSynchro_().then(function () { return lignesTacheServeur(itemExisting); }).then(function (r) {
              return enregistrerTacheEnDatesServeur(ancreDe(itemExisting.personneId), r.lignes.map(function (l) { return l.id; }), [], {});
            }).then(function () {
              return creerSerieServeur(typeAffiche, [{ personne: itemExisting.personneId }], giDebutFinal, texte, important,
                chantier || itemExisting.chantier, statutRow ? statutActuel : (itemExisting.statut || null), choixConversion, function () {},
                nbJoursOuvresEntre(isoDebutFinal, isoFinFinal), demiDebutFinal, demiFinFinal, isoDebutFinal);
            });
          }, "Série créée à partir de cette " + (typeAffiche === "absence" ? "absence." : "tâche."));
          return;
        }
        // Bulle de série (round du 24.09.2026, suite 20) : boîte « Modifier
        // l’événement récurrent » (cet événement / les suivants / tous), puis
        // écriture directe par series.js — dates comprises, même hors de la
        // fenêtre, et l'occurrence reste dans sa série. Avant : gerer-serie
        // « modifier » (dates ignorées en silence) ou, hors fenêtre, une
        // occurrence détachée de sa série sans rien demander.
        if (itemExisting.serieId) {
          var apresSerie = Object.assign({}, itemExisting, {
            texte: texte, important: important,
            chantier: chantier || itemExisting.chantier,
            statut: statutRow ? statutActuel : (itemExisting.statut || null)
          });
          fermer();
          enregistrerFicheSerie("TACHES", itemExisting, apresSerie,
            { debut: isoDebutFinal, fin: isoFinFinal, demiDebut: demiDebutFinal, demiFin: demiFinFinal }, horsFenetre);
          return;
        }
        // Hors série : hors fenêtre (ou tâche d'origine qui déborde déjà de
        // la fenêtre), écriture en vraies dates ; sinon appliquerModifUnique.
        // Champs absents de la fiche (pas de sélecteur de statut pour un
        // salarié, pas de chantier pour une absence) : ceux de la tâche
        // d'origine, comme le fait appliquerModifUnique en ne les touchant pas.
        champsTache.chantier = chantier || itemExisting.chantier;
        champsTache.statut = statutRow ? statutActuel : (itemExisting.statut || null);
        enregistrementEnCours = true;
        (horsFenetre ? (promesseOrigine || lignesTacheServeur(itemExisting)).then(function (r) { return r.lignes; }) : debordementOrigine()).then(function (lignes) {
          if (!lignes) { appliquerModifUnique(); return; }
          ecrireHorsFenetre(function () {
            return enregistrerTacheEnDatesServeur(ancreDe(itemExisting.personneId), lignes.map(function (l) { return l.id; }), slotsNouveaux, champsTache);
          }, (typeAffiche === "absence" ? "Absence enregistrée " : "Tâche enregistrée ") + libellePlage(isoDebutFinal, isoFinFinal));
        }).catch(function (err) {
          enregistrementEnCours = false;
          toast("Échec de l’enregistrement : " + (err && err.message ? err.message : err));
        });
        return;
      }
      if (horsFenetre) {
        var choixSerieHF = lireChoixSerie();
        if (choixSerieHF) {
          fermer();
          creerSerieServeur(typeAffiche, cibles, giDebutFinal, texte, important, chantier, statutFinal, choixSerieHF, function (r) {
            apresEcritureSerie(r); toast("Série ajoutée.");
          }, nbJoursOuvresEntre(isoDebutFinal, isoFinFinal), demiDebutFinal, demiFinFinal, isoDebutFinal).catch(function (err) {
            toast("Échec de la création de la série : " + (err && err.message ? err.message : err));
          });
          return;
        }
        ecrireHorsFenetre(function () {
          var chaine = Promise.resolve();
          cibles.forEach(function (c) {
            chaine = chaine.then(function () { return enregistrerTacheEnDatesServeur(ancreDe(c.personne), [], slotsNouveaux, champsTache); });
          });
          return chaine;
        }, (typeAffiche === "absence" ? "Absence ajoutée " : "Tâche ajoutée ") + libellePlage(isoDebutFinal, isoFinFinal));
        return;
      }

      var choixSerie = lireChoixSerie();
      if (choixSerie) {
        fermer();
        // dureeFinal/demiDebutFinal/demiFinFinal (round du 15.09.2026) :
        // déjà calculés juste au-dessus (utilisés par la branche "sans
        // série" ci-dessous) — il manquait de les transmettre pareillement
        // ici, cf. commentaire de tête de creerSerieServeur.
        creerSerieServeur(typeAffiche, cibles, giDebutFinal, texte, important, chantier, statutFinal, choixSerie, function (r) {
          apresEcritureSerie(r); toast("Série ajoutée.");
        }, dureeFinal, demiDebutFinal, demiFinFinal).catch(function (err) {
          toast("Échec de la création de la série : " + (err && err.message ? err.message : err));
        });
      } else {
        // 1 item fusionné {giDebut,duree,demiDebut,demiFin} PAR CIBLE, plutôt
        // que creerGroupeTaches (1 ligne serveur par jour, demi UNIQUE par
        // case) — la 1re ne sait pas représenter un bord de demi-journée
        // différent en début/fin. Même trajet que le glissement/
        // redimensionnement d'une bulle existante (déjà prouvé côté
        // synchroniser()/calculerEtatLocal, qui reconstruit l'état désiré
        // depuis TACHES sans distinguer "nouveau" de "modifié").
        sauvegarderUndo();
        cibles.forEach(function (c) {
          var nouveau = itemPlageTache(typeAffiche, texte, c.personne, giDebutFinal, dureeFinal, {
            important: important, chantier: chantier, statut: statutFinal, demiDebut: demiDebutFinal, demiFin: demiFinFinal
          });
          nouveau.dateDebutIso = isoDeGi(giDebutFinal);
          TACHES.push(nouveau);
        });
        fermer(); render(); toast("Ajouté.");
      }
    });
  }

  // ---- ouvrirEditionPlage (jalon/note) — même adaptation. Un jalon/une
  // note en série porte bien son serieId depuis le cache (serie_id, cf.
  // construireDonneesSemaine) : modifier ou supprimer une occurrence ouvre
  // la boîte « événement récurrent » (series.js, round du 24.09.2026,
  // suite 20), dont l'écriture directe conserve le serie_id — ce que le
  // trajet habituel (enregistrer-plage) ne sait pas faire.
  function ouvrirEditionPlage(kind, itemExisting, giDebut, duree, x, y, celluleSurbrillance, demiDebutArg, demiFinArg) {
    var liste = kind === "jalon" ? JALONS : NOTES;
    var giDebutReel = itemExisting ? itemExisting.giDebut : giDebut;
    var dureeInit = itemExisting ? itemExisting.duree : duree;
    // demiDebutArg/demiFinArg (round du 12.09.2026) : bords précis de la
    // plage "case par case" sélectionnée au glissé (ou du clic simple,
    // désormais lui aussi demi-précis via demiDepuisPointeur — cf.
    // ouvrirAjout), plutôt que systématiquement journée entière comme avant
    // ce round (Lionel : « les surbrillance sont fausse aussi sur les notes
    // et jalons, je les veux case par case »).
    var state = {
      kind: kind, // §88 — "jalon"|"note" ; une date hors fenêtre y est permise (comme pour tâche/absence depuis le round du 24.09.2026, suite 5, cf. appliquerDateChoisieFormulaire)
      giDebut: giDebutReel, giFin: giDebutReel + dureeInit - 1,
      debutHorsFenetreIso: null, finHorsFenetreIso: null,
      demiDebut: itemExisting ? (itemExisting.demiDebut || null) : (demiDebutArg !== undefined ? demiDebutArg : null),
      demiFin: itemExisting ? (itemExisting.demiFin || null) : (demiFinArg !== undefined ? demiFinArg : null),
      important: itemExisting ? itemExisting.important : false
    };

    var pop = document.createElement("div");
    pop.className = "pop form-pop carte-item";
    var texteInit = itemExisting ? itemExisting.texte : "";
    var libelles = { jalon: "Jalon", note: "Note" };
    // Série : jamais pour un jalon (Lionel, round du 08-11.09.2026 —
    // "Série sur Notes, tâches et absences", jalon volontairement exclu).
    // Round D — pour une NOTE déjà en série, affiche le même bandeau
    // d'information que ouvrirEdition (serieInfoExistanteHTML, cf. son
    // commentaire) plutôt que rien du tout. Suite 20 : aussi pour un jalon
    // en série (créé ailleurs, page Jalons ou ancienne donnée) — la boîte de
    // portée s'ouvre pour lui aussi.
    var champSerie = itemExisting ? (itemExisting.serieId ? serieInfoExistanteHTML() : "") : (kind === "jalon" ? "" : serieChampsHTML());

    pop.innerHTML =
      bandeauHTML({ clair: true, fondStyle: "background:var(--" + kind + "-bg)", important: state.important, chantierHTML: "", nomGrand: libelles[kind] }) +
      datesPlageHTML(state.giDebut, state.giFin, state.demiDebut, state.demiFin, state.debutHorsFenetreIso, state.finHorsFenetreIso) +
      '<div class="contenu-carte">' +
      '<div class="corps"><div class="label-champ" style="margin:0 0 6px">Descriptif</div>' +
      '<div class="descriptif-texte" tabindex="0"></div></div>' +
      optionsAvanceesHTML("", champSerie) +
      '</div>' +
      piedPrincipalHTML(!!itemExisting);

    var px = x != null ? x : Math.round(window.innerWidth / 2 - 110);
    var py = y != null ? y : Math.round(window.innerHeight / 2 - 90);
    positionnerPop(pop, px, py);
    // Round D — surbrillance PRÉCISE (demi-journée exacte, plage entière) via
    // surbrillancePreciseJalonNote au lieu de teindre la case DOM réelle
    // reçue en paramètre (celluleSurbrillance, désormais ignorée pour une
    // nouvelle entrée) : corrige à la fois « l'ajout simple sélectionne 2
    // case » (case entière au lieu d'une demi-journée) et « bordure verte sur
    // la case de départ » (une seule case au lieu de toute la plage).
    var fermer = fermerAuClicExterieur(pop, !itemExisting ? surbrillancePreciseJalonNote(kind, state.giDebut, state.giFin - state.giDebut + 1, state.demiDebut, state.demiFin) : null, function () { pop.querySelector(".f-ok").click(); });

    pop.querySelector(".f-annuler").addEventListener("click", fermer);
    pop.querySelector(".f-important").addEventListener("click", function () {
      state.important = !state.important;
      this.classList.toggle("actif", state.important);
    });
    function rafraichirDates() {
      pop.querySelector(".dates-plage").outerHTML = datesPlageHTML(state.giDebut, state.giFin, state.demiDebut, state.demiFin, state.debutHorsFenetreIso, state.finHorsFenetreIso);
      cablerDatesPlage(pop, state, rafraichirDates);
    }
    cablerDatesPlage(pop, state, rafraichirDates);
    var texteActuel = texteInit;
    cablerDescriptifEdit(pop, function () { return texteActuel; }, function (v) { texteActuel = v; }, "Cliquer pour ajouter un descriptif…");

    var lireChoixSerie = cablerSerieChamps(pop, itemExisting ? itemExisting.dateDebutIso : isoBorneEtat(state, "debut"));
    cablerLienPlus(pop);

    var suppr = pop.querySelector(".f-suppr");
    if (suppr) suppr.addEventListener("click", function () {
      function supprimerUnique() {
        sauvegarderUndo();
        var idx = liste.indexOf(itemExisting);
        if (idx >= 0) liste.splice(idx, 1);
        fermer(); render(); toast("Supprimé.");
      }
      // Même boîte « Supprimer l’événement récurrent » que la fiche tâche.
      if (itemExisting.serieId) {
        fermer();
        supprimerAvecPorteeSerie([{ item: itemExisting, liste: liste }], null, "Supprimé.");
        return;
      }
      supprimerUnique();
    });
    pop.querySelector(".f-ok").addEventListener("click", function () {
      var texte = texteActuel.trim();
      if (!texte) { fermer(); return; }
      var important = state.important;
      // §88 — isoDebutVrai/isoFinVrai (jamais isoDeGi(giDebutFinal) seul,
      // qui donnerait la date du bord VISIBLE clampé, pas la vraie date,
      // dès que l'une des 2 bornes est hors fenêtre) + dureeFinal en jours
      // ouvrés RÉELS entre ces 2 dates (giFin-giDebut+1 ne veut plus rien
      // dire dans ce cas, ces gi n'étant que des positions d'affichage).
      var isoDebutVrai = isoBorneEtat(state, "debut"), isoFinVrai = isoBorneEtat(state, "fin");
      var giDebutFinal = state.giDebut, dureeFinal = nbJoursOuvresEntre(isoDebutVrai, isoFinVrai);
      var demiDebutFinal = state.demiDebut, demiFinFinal = state.demiFin;
      // Sur 1 seul jour, Début=matin + Fin=aprem est une combinaison valide
      // côté fiche (cf. cablerDatesPlage) mais équivaut à une journée
      // entière — ramenée ici à la forme canonique (null/null) qu'attend
      // tout le reste du fichier (demisOccupeesTache, rendu des bulles,
      // glissé/redimensionnement...), qui suppose encore demiDebut ===
      // demiFin dès que la durée vaut 1. Le garde-fou "hors fenêtre" (§88)
      // évite de déclencher ça à tort quand giDebut === giFin uniquement
      // parce que les 2 bornes sont clampées sur le même jour visible tout
      // en restant réellement différentes (ex. début un vendredi, fin des
      // semaines plus tard).
      if (state.giDebut === state.giFin && !state.debutHorsFenetreIso && !state.finHorsFenetreIso && demiDebutFinal === "matin" && demiFinFinal === "aprem") { demiDebutFinal = null; demiFinFinal = null; }
      if (itemExisting) {
        function appliquerModifUnique() {
          sauvegarderUndo();
          itemExisting.texte = texte; itemExisting.important = important;
          itemExisting.giDebut = giDebutFinal; itemExisting.duree = dureeFinal;
          itemExisting.demiDebut = demiDebutFinal; itemExisting.demiFin = demiFinFinal;
          itemExisting.dateDebutIso = isoDebutVrai;
          fermer(); render(); toast("Modifié.");
        }
        // Même trajet que la fiche tâche (round du 24.09.2026, suite 20) :
        // boîte de portée, puis écriture directe par series.js — dates
        // comprises, l'occurrence reste dans sa série.
        if (itemExisting.serieId) {
          fermer();
          enregistrerFicheSerie(kind === "jalon" ? "JALONS" : "NOTES", itemExisting,
            Object.assign({}, itemExisting, { texte: texte, important: important }),
            { debut: isoDebutVrai, fin: isoFinVrai, demiDebut: demiDebutFinal, demiFin: demiFinFinal },
            !!(state.debutHorsFenetreIso || state.finHorsFenetreIso));
          return;
        }
        appliquerModifUnique();
      } else {
        var choixSerie = lireChoixSerie();
        if (choixSerie) {
          fermer();
          // dureeFinal/demiDebutFinal/demiFinFinal (round du 15.09.2026) :
          // même correctif que côté ouvrirEdition ci-dessus, pour un
          // jalon/note en série couvrant plusieurs jours.
          creerSerieServeur(kind, [{}], giDebutFinal, texte, important, null, null, choixSerie, function (r) {
            apresEcritureSerie(r); toast("Série ajoutée.");
          }, dureeFinal, demiDebutFinal, demiFinFinal).catch(function (err) {
            toast("Échec de la création de la série : " + (err && err.message ? err.message : err));
          });
        } else {
          sauvegarderUndo();
          liste.push(itemPlage(kind, texte, giDebutFinal, dureeFinal, { important: important, demiDebut: demiDebutFinal, demiFin: demiFinFinal }));
          liste[liste.length - 1].dateDebutIso = isoDebutVrai;
          fermer(); render(); toast("Ajouté.");
        }
      }
    });
  }

