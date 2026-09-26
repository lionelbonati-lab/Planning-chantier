"use strict";
  /* ============================================================
     RACCOURCIS CLAVIER — round du 26.09.2026 (suite 61)
     ------------------------------------------------------------
     Lionel : « Il me faut une page capable de gérer les raccourcis
     claviers. » puis « Mettre les réglages de l'onglet "Général" dans le
     pastille de déconnexion. Une page par type de réglage. y mettre les
     raccourcis claviers. »

     Un seul registre, ACTIONS_CLAVIER : chaque action a un nom, un groupe,
     ses touches d'origine, une condition (possible) et ce qu'elle fait. Le
     gestionnaire unique du clavier (formulaires-communs.js) ne connaît plus
     aucune touche lui-même : il demande ici quelle action correspond à la
     combinaison tapée (actionClavierPour). Avant cette suite, les touches
     étaient écrites en dur dans ce gestionnaire (Suppr, Entrée, ← →,
     Ctrl+Z/Y/C/X/V) : elles sont reprises telles quelles comme touches
     d'origine, avec les mêmes conditions.

     Page « Raccourcis clavier » (pastille L > Raccourcis clavier) : pour
     chaque action, ses combinaisons ; « + » puis taper la combinaison voulue
     pour en ajouter une, « × » pour en retirer une, « ↺ » pour revenir aux
     touches d'origine de l'action ; « Tout rétablir » pour toutes. Une
     combinaison déjà prise par une autre action est signalée : après
     confirmation, elle change d'action.

     Enregistrement : table `reglages`, clé « raccourcis », seulement les
     actions modifiées — { idAction: ["Ctrl+D", …] }, [] = aucune touche —
     partagé par le compte comme la mise en page, avec une copie sur
     l'appareil (localStorage « planning.raccourcis ») quand la table ne
     répond pas.

     Échap (fermer une fenêtre, quitter la sélection) et Entrée dans une
     fenêtre ouverte (valider) restent fixes : affichés, pas modifiables.
     ============================================================ */

  var CLE_RACCOURCIS = "raccourcis", CLE_RACCOURCIS_LOCAL = "planning.raccourcis";
  var MAC_RACCOURCIS_ = /Mac|iPhone|iPad/.test((navigator.platform || "") + " " + (navigator.userAgent || ""));

  // ---- Combinaison tapée -> texte (« Ctrl+Maj+Z ») -------------------------
  // Ordre fixe des modificateurs : Ctrl, Alt, Maj. Cmd (Mac) compte comme
  // Ctrl, comme avant cette suite (e.ctrlKey || e.metaKey). Maj ne compte
  // que pour une lettre ou une touche nommée (Maj+→) : pour un signe (+, ?,
  // les chiffres d'un clavier AZERTY), Maj fait partie de la façon de le
  // taper — « + » reste « + » quel que soit le clavier.
  var NOMS_TOUCHES_ = {
    ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓",
    Delete: "Suppr", Backspace: "Retour arrière", Enter: "Entrée", Escape: "Échap", " ": "Espace",
    PageUp: "Page préc.", PageDown: "Page suiv.", Home: "Début", End: "Fin", Tab: "Tab", Insert: "Inser"
  };
  function comboDepuisEvenement(e) {
    var k = e.key;
    if (!k || /^(Control|Shift|Alt|AltGraph|Meta|OS|Hyper|Super|CapsLock|NumLock|Dead|Unidentified|Process)$/.test(k)) return null;
    var lettre = k.length === 1 && k.toLowerCase() !== k.toUpperCase();
    var nom = NOMS_TOUCHES_[k] || (k.length === 1 ? k.toUpperCase() : k);
    // Option (Mac) + lettre tape un autre caractère (« Ω » pour Z) : on
    // prend alors la touche elle-même.
    if (e.altKey && !lettre && k.length === 1 && /^(Key[A-Z]|Digit[0-9])$/.test(e.code || "")) { nom = e.code.slice(-1); lettre = true; }
    var mods = [];
    if (e.ctrlKey || e.metaKey) mods.push("Ctrl");
    if (e.altKey) mods.push("Alt");
    if (e.shiftKey && (lettre || k.length > 1)) mods.push("Maj");
    return mods.concat([nom]).join("+");
  }
  // Round du 26.09.2026 (suite 64) — Lionel : « Ajouter les touches souris
  // aux raccourcis ». Les boutons de la souris qui ne servent à rien dans
  // le planning deviennent des touches comme les autres : bouton du milieu
  // (molette enfoncée) et les deux boutons de côté (précédent/suivant),
  // avec Ctrl, Alt, Maj si on veut. Le clic gauche et le clic droit gardent
  // leurs gestes sur la grille (listés, pas modifiables : GESTES_SOURIS_).
  var BOUTONS_SOURIS_ = { 1: "Clic milieu", 3: "Souris précédent", 4: "Souris suivant" };
  function comboDepuisSouris(e) {
    var nom = BOUTONS_SOURIS_[e.button];
    if (!nom) return null;
    var mods = [];
    if (e.ctrlKey || e.metaKey) mods.push("Ctrl");
    if (e.altKey) mods.push("Alt");
    if (e.shiftKey) mods.push("Maj");
    return mods.concat([nom]).join("+");
  }
  // « Ctrl++ » -> ["Ctrl", "+"] ; « + » -> ["+"].
  function morceauxCombo_(c) {
    if (c === "+") return ["+"];
    if (c.slice(-2) === "++") return c.slice(0, -2).split("+").concat(["+"]);
    return c.split("+");
  }
  function libelleTouche_(t) {
    if (MAC_RACCOURCIS_ && t === "Ctrl") return "⌘";
    if (MAC_RACCOURCIS_ && t === "Alt") return "⌥";
    return t;
  }
  // Suite 64 : une touche de souris (bouton, clic, glisser, molette) a
  // son icône de souris devant le nom.
  var RE_SOURIS_ = /^(Clic|Souris|Glisser|Molette)/;
  var ICONE_SOURIS_ = '<svg class="rc-souris" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="1.5" width="9" height="13" rx="4.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.8v4.4" stroke="currentColor" stroke-width="1.4"/></svg>';
  function htmlCombo_(c) {
    return morceauxCombo_(c).map(function (t) {
      return '<kbd' + (RE_SOURIS_.test(t) ? ' class="kbd-souris">' + ICONE_SOURIS_ : '>') + esc(libelleTouche_(t)) + '</kbd>';
    }).join('<span class="rc-plus">+</span>');
  }
  function libelleCombo(c) { return morceauxCombo_(c).map(libelleTouche_).join(MAC_RACCOURCIS_ ? "" : "+"); }

  // ---- Registre --------------------------------------------------------
  function selectionClavier_() { return Object.keys(bullesSelectionnees); }
  function planningAffiche_() { var p = document.getElementById("page-planning"); return !!(p && p.classList.contains("actif")); }
  function decalagePossible_() { return modeSelectionMultiple && selectionClavier_().length > 0; }
  function cliquer_(id) { var b = document.getElementById(id); if (b && !b.disabled) b.click(); }
  // Calendrier de la barre visible (téléphone ou ordinateur) : ouvert sur
  // le jour affiché, comme un clic sur son icône (cf. cablerPagePlanning).
  function ouvrirCalendrierBarre_() {
    var input = [].filter.call(document.querySelectorAll(".btn-calendrier .date-picker-jour"), function (i) { return i.offsetParent !== null; })[0];
    if (!input) return;
    majCalendrierJour(input);
    if (input.showPicker) { try { input.showPicker(); } catch (ex) { input.focus(); } } else input.focus();
  }
  function allerPage_(nom) { return function () { afficherPage(nom); }; }

  // groupe : titre de la section sur la page. planning : seulement quand
  // l'onglet Planning est affiché et qu'aucune fenêtre n'est ouverte
  // (naviguer derrière une fiche ouverte n'aurait aucun sens). defaut : []
  // = pas de touche d'origine, à choisir sur la page.
  var ACTIONS_CLAVIER = [
    { id: "annuler", groupe: "Modifier", nom: "Annuler", defaut: ["Ctrl+Z"], faire: function () { defaire(); } },
    { id: "refaire", groupe: "Modifier", nom: "Refaire", defaut: ["Ctrl+Y", "Ctrl+Maj+Z"], faire: function () { refaire(); } },
    { id: "copier", groupe: "Modifier", nom: "Copier la sélection", defaut: ["Ctrl+C"], faire: function () { copierSelection(); } },
    { id: "couper", groupe: "Modifier", nom: "Couper la sélection", defaut: ["Ctrl+X"], faire: function () { couperSelection(); } },
    { id: "coller", groupe: "Modifier", nom: "Coller", defaut: ["Ctrl+V"], faire: function () { collerPressePapier(); } },
    { id: "supprimer", groupe: "Modifier", nom: "Supprimer la sélection", defaut: ["Suppr", "Retour arrière"],
      possible: function () { return selectionClavier_().length > 0; }, faire: function () { supprimerSelection(); } },
    // Comme un double clic sur la bulle, quand une seule est cochée.
    { id: "modifier", groupe: "Modifier", nom: "Modifier la bulle sélectionnée", defaut: ["Entrée"],
      possible: function () { var ids = selectionClavier_(); return ids.length === 1 && !!itemParId(ids[0]); },
      faire: function () { var plage = itemParId(selectionClavier_()[0]); ouvrirBulle(plage.item, plage, Math.round(window.innerWidth / 2 - 110), Math.round(window.innerHeight / 2 - 90)); } },
    // ← → (suite 7) : en mode sélection multiple seulement, comme la barre
    // de sélection elle-même.
    { id: "decalerGauche", groupe: "Modifier", nom: "Décaler la sélection d’une demi-journée à gauche", defaut: ["←"], possible: decalagePossible_, faire: function () { decalerSelection(-1); } },
    { id: "decalerDroite", groupe: "Modifier", nom: "Décaler la sélection d’une demi-journée à droite", defaut: ["→"], possible: decalagePossible_, faire: function () { decalerSelection(1); } },
    { id: "decalerGaucheJour", groupe: "Modifier", nom: "Décaler la sélection d’un jour à gauche", defaut: ["Maj+←"], possible: decalagePossible_, faire: function () { decalerSelection(-2); } },
    { id: "decalerDroiteJour", groupe: "Modifier", nom: "Décaler la sélection d’un jour à droite", defaut: ["Maj+→"], possible: decalagePossible_, faire: function () { decalerSelection(2); } },

    // Suite 64 : les boutons de côté de la souris feuillettent les semaines
    // (au lieu de quitter l'appli par « Page précédente » du navigateur).
    { id: "semainePrecedente", groupe: "Naviguer", nom: "Semaine précédente", defaut: ["P", "Souris précédent"], planning: true, faire: function () { naviguerSemaine(-1); } },
    { id: "semaineSuivante", groupe: "Naviguer", nom: "Semaine suivante", defaut: ["S", "Souris suivant"], planning: true, faire: function () { naviguerSemaine(1); } },
    { id: "aujourdhui", groupe: "Naviguer", nom: "Aujourd’hui", defaut: ["A"], planning: true, faire: function () { allerAujourdhui(); } },
    { id: "choisirDate", groupe: "Naviguer", nom: "Choisir une date", defaut: ["D"], planning: true, faire: ouvrirCalendrierBarre_ },

    // Téléphone : « 1 jour / 1 semaine » ; ailleurs « 1 / 2 semaines ».
    { id: "changerVue", groupe: "Afficher", nom: "1 ou 2 semaines (téléphone : 1 jour ou 1 semaine)", defaut: ["V"], planning: true,
      faire: function () { if (modeJourMobileActif() || (window.matchMedia && window.matchMedia("(max-width: 600px)").matches)) basculerVueJourMobile(); else basculerDeuxSemaines(); } },
    { id: "weekends", groupe: "Afficher", nom: "Afficher ou masquer les week-ends", defaut: ["W"], planning: true,
      faire: function () { changerOptionAffichage("weekends", afficherWeekends ? "non" : "oui"); } },
    { id: "zoomPlus", groupe: "Afficher", nom: "Zoom avant", defaut: ["+"], planning: true, faire: function () { cliquer_("zoomPlus"); } },
    { id: "zoomMoins", groupe: "Afficher", nom: "Zoom arrière", defaut: ["-"], planning: true, faire: function () { cliquer_("zoomMoins"); } },
    { id: "zoom100", groupe: "Afficher", nom: "Zoom 100 %", defaut: ["0"], planning: true, faire: function () { niveauZoomPlanning = 100; render(false); } },
    { id: "imprimer", groupe: "Afficher", nom: "Imprimer", defaut: ["Ctrl+P"], planning: true, faire: function () { openPrintSheet(); } },

    { id: "pagePlanning", groupe: "Pages", nom: "Planning", defaut: [], faire: allerPage_("planning") },
    { id: "pageJalons", groupe: "Pages", nom: "Jalons", defaut: [], faire: allerPage_("jalons") },
    { id: "pagePersonnel", groupe: "Pages", nom: "Personnel", defaut: [], faire: allerPage_("personnel") },
    { id: "pageIntervenants", groupe: "Pages", nom: "Intervenants", defaut: [], faire: allerPage_("intervenants") },
    { id: "pageChantiers", groupe: "Pages", nom: "Chantiers", defaut: [], faire: allerPage_("chantiers") },
    { id: "pageStatuts", groupe: "Pages", nom: "Statuts", defaut: [], faire: allerPage_("statuts") },
    { id: "pageHoraires", groupe: "Pages", nom: "Horaires", defaut: [], faire: allerPage_("horaires") },
    { id: "pageMiseEnPage", groupe: "Pages", nom: "Mise en page", defaut: [], faire: allerPage_("mise-en-page") },
    { id: "pageEntreeRapide", groupe: "Pages", nom: "Entrée rapide", defaut: [], faire: allerPage_("entree-rapide") },
    { id: "pageRaccourcis", groupe: "Pages", nom: "Raccourcis clavier (cette page)", defaut: ["?"], faire: allerPage_("raccourcis") }
  ];
  var TOUCHES_FIXES_ = [
    { combo: "Échap", nom: "Fermer une fenêtre, quitter la sélection" },
    { combo: "Entrée", nom: "Valider une fenêtre ouverte" }
  ];
  // Suite 64 : gestes de la souris sur le planning, tels qu'ils sont codés
  // (grille-interactions.js, grille-rendu.js) — affichés sous « Souris »,
  // pas modifiables : ils tiennent à l'endroit où l'on clique.
  var GESTES_SOURIS_ = [
    { combo: "Clic", nom: "Sélectionner une bulle (recliquer : désélectionner)" },
    { combo: "Ctrl+Clic", nom: "Ajouter une bulle à la sélection, ou l’en retirer" },
    { combo: "Glisser", nom: "Déplacer une bulle (ou la sélection)" },
    { combo: "Maj+Glisser", nom: "Copier une bulle (ou la sélection) en la déposant" },
    { combo: "Glisser", nom: "Sur le bord d’une bulle : l’allonger ou la raccourcir" },
    { combo: "Clic", nom: "Sur une case vide : ajouter une tâche" },
    { combo: "Glisser", nom: "Sur des cases vides : ajouter sur plusieurs demi-journées ou personnes" },
    { combo: "Clic droit+Glisser", nom: "Sur les cases : sélectionner toutes les bulles d’une zone" },
    { combo: "Maj+Molette", nom: "Au bout du planning : semaine précédente ou suivante" }
  ];
  function actionClavierParId_(id) { return ACTIONS_CLAVIER.filter(function (a) { return a.id === id; })[0] || null; }

  // ---- Lecture / écriture ---------------------------------------------
  // etat.reglages : undefined avant le 1er chargement, null si la table n'a
  // pas répondu -> copie de l'appareil ; objet -> il fait foi (sans clé
  // « raccourcis » : rien de modifié sur le compte).
  function modifsRaccourcis_() {
    var r = window.etat && etat.reglages;
    if (r) return (r[CLE_RACCOURCIS] && typeof r[CLE_RACCOURCIS] === "object") ? r[CLE_RACCOURCIS] : {};
    try { var l = JSON.parse(localStorage.getItem(CLE_RACCOURCIS_LOCAL) || "{}"); return l && typeof l === "object" ? l : {}; } catch (e) { return {}; }
  }
  function combosDe(action) {
    var m = modifsRaccourcis_();
    return Array.isArray(m[action.id]) ? m[action.id].slice() : action.defaut.slice();
  }
  function estModifiee_(action) {
    var m = modifsRaccourcis_();
    return Array.isArray(m[action.id]) && m[action.id].join("|") !== action.defaut.join("|");
  }
  var minuteurRaccourcis_ = null;
  function enregistrerModifsRaccourcis_(m) {
    // Une action revenue à ses touches d'origine n'a plus rien à garder.
    Object.keys(m).forEach(function (id) {
      var a = actionClavierParId_(id);
      if (!a || !Array.isArray(m[id]) || m[id].join("|") === a.defaut.join("|")) delete m[id];
    });
    if (window.etat && etat.reglages) etat.reglages[CLE_RACCOURCIS] = m;
    try { localStorage.setItem(CLE_RACCOURCIS_LOCAL, JSON.stringify(m)); } catch (e) {}
    clearTimeout(minuteurRaccourcis_);
    minuteurRaccourcis_ = setTimeout(function () {
      sbClient.from("reglages").upsert({ cle: CLE_RACCOURCIS, valeur: m, maj: new Date().toISOString() }, { onConflict: "cle" }).then(function (res) {
        if (res.error) throw res.error;
        if (window.etat && !etat.reglages) { etat.reglages = {}; etat.reglages[CLE_RACCOURCIS] = m; }
      }).catch(function (err) {
        toast("Raccourcis gardés sur cet appareil, mais pas enregistrés sur le compte : " + (err && err.message ? err.message : err));
      });
    }, 400);
  }
  function changerCombosAction_(id, combos) {
    var m = JSON.parse(JSON.stringify(modifsRaccourcis_()));
    m[id] = combos;
    enregistrerModifsRaccourcis_(m);
  }

  // ---- Gestionnaire du clavier (appelé par formulaires-communs.js) -------
  // Première action de cette combinaison dont la condition est remplie ;
  // null sinon (la touche garde alors son effet normal dans le navigateur).
  function actionClavierPour(combo) {
    var m = modifsRaccourcis_();
    for (var i = 0; i < ACTIONS_CLAVIER.length; i++) {
      var a = ACTIONS_CLAVIER[i];
      var combos = Array.isArray(m[a.id]) ? m[a.id] : a.defaut;
      if (combos.indexOf(combo) < 0) continue;
      if (a.planning && (!planningAffiche_() || popFermerActuel)) continue;
      if (a.possible && !a.possible()) continue;
      return a;
    }
    return null;
  }
  // Pendant qu'on tape une nouvelle combinaison sur la page, le clavier ne
  // déclenche rien d'autre.
  var captureRaccourciEnCours = false;

  // ---- Page « Raccourcis clavier » --------------------------------------
  function renderRaccourcis() {
    var zone = document.getElementById("listeRaccourcis");
    if (!zone) return;
    var groupes = [];
    ACTIONS_CLAVIER.forEach(function (a) { if (groupes.indexOf(a.groupe) < 0) groupes.push(a.groupe); });
    var html = groupes.map(function (g) {
      return '<h2 class="titre-liste">' + esc(g) + '</h2><div class="liste-raccourcis">' +
        ACTIONS_CLAVIER.filter(function (a) { return a.groupe === g; }).map(function (a) {
          var combos = combosDe(a);
          return '<div class="ligne-raccourci" data-action="' + a.id + '">' +
            '<span class="rc-nom">' + esc(a.nom) + '</span>' +
            '<span class="rc-touches">' +
              combos.map(function (c) {
                return '<span class="rc-combo" data-combo="' + esc2(c) + '">' + htmlCombo_(c) +
                  '<button type="button" class="rc-retirer" title="Retirer" aria-label="Retirer ' + esc2(libelleCombo(c)) + '">×</button></span>';
              }).join("") +
              (combos.length ? "" : '<span class="rc-aucune">Aucune touche</span>') +
              '<button type="button" class="rc-ajouter" title="Ajouter une combinaison" aria-label="Ajouter une combinaison">+</button>' +
              '<button type="button" class="rc-defaut" title="Revenir aux touches d’origine" aria-label="Revenir aux touches d’origine"' + (estModifiee_(a) ? '' : ' hidden') + '>↺</button>' +
            '</span></div>';
        }).join("") + '</div>';
    }).join("");
    html += '<h2 class="titre-liste">Touches fixes</h2><div class="liste-raccourcis">' +
      TOUCHES_FIXES_.map(function (f) {
        return '<div class="ligne-raccourci rc-fixe"><span class="rc-nom">' + esc(f.nom) + '</span><span class="rc-touches"><span class="rc-combo">' + htmlCombo_(f.combo) + '</span></span></div>';
      }).join("") + '</div>';
    html += '<h2 class="titre-liste">Souris</h2><div class="liste-raccourcis liste-gestes-souris">' +
      GESTES_SOURIS_.map(function (f) {
        return '<div class="ligne-raccourci rc-fixe"><span class="rc-nom">' + esc(f.nom) + '</span><span class="rc-touches"><span class="rc-combo">' + htmlCombo_(f.combo) + '</span></span></div>';
      }).join("") + '</div>';
    zone.innerHTML = html;
    var reset = document.getElementById("btnRaccourcisDefaut");
    if (reset) reset.hidden = !Object.keys(modifsRaccourcis_()).length;
  }

  // Attend la combinaison suivante (écouteur en phase de capture, avant le
  // gestionnaire général). Échap ou un clic ailleurs : abandon.
  function capturerCombo_(ligne) {
    var action = actionClavierParId_(ligne.dataset.action);
    var bouton = ligne.querySelector(".rc-ajouter");
    if (!action || !bouton) return;
    var zone = document.createElement("span");
    zone.className = "rc-capture";
    zone.textContent = "Tapez la combinaison ou un bouton de la souris…";
    bouton.replaceWith(zone);
    captureRaccourciEnCours = true;
    function finir() {
      captureRaccourciEnCours = false;
      window.removeEventListener("keydown", surTouche, true);
      document.removeEventListener("pointerdown", surClic, true);
      document.removeEventListener("mousedown", surBouton, true);
    }
    // Suite 64 : un bouton de souris attribuable (milieu, côtés) est pris
    // comme combinaison ; un clic gauche/droit ailleurs abandonne.
    function surClic(e) { if (comboDepuisSouris(e)) return; if (!zone.contains(e.target)) { finir(); renderRaccourcis(); } }
    function surBouton(e) {
      var combo = comboDepuisSouris(e);
      if (!combo) return;
      e.preventDefault(); e.stopPropagation();
      boutonSourisTraite_ = e.button; // son relâchement ne doit pas faire « Page précédente »
      finir();
      attribuerCombo_(action, combo);
    }
    function surTouche(e) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { finir(); renderRaccourcis(); return; }
      var combo = comboDepuisEvenement(e);
      if (!combo) return; // Ctrl, Maj… seuls : on attend la touche
      finir();
      attribuerCombo_(action, combo);
    }
    window.addEventListener("keydown", surTouche, true);
    document.addEventListener("pointerdown", surClic, true);
    document.addEventListener("mousedown", surBouton, true);
  }

  // ---- Boutons de la souris (suite 64) -----------------------------------
  // Même registre que le clavier (actionClavierPour). L'action part à
  // l'appui ; l'effet normal du bouton est bloqué jusqu'au bout du geste —
  // relâchement compris : c'est là que le navigateur ferait « Page
  // précédente/suivante » (boutons de côté) ou ouvrirait un lien dans un
  // onglet (milieu, auxclick). Un bouton sans action garde son effet normal.
  var boutonSourisTraite_ = null;
  document.addEventListener("mousedown", function (e) {
    if (captureRaccourciEnCours) return;
    boutonSourisTraite_ = null;
    var combo = comboDepuisSouris(e);
    var action = combo && actionClavierPour(combo);
    if (!action) return;
    e.preventDefault();
    boutonSourisTraite_ = e.button;
    action.faire();
  }, true);
  ["mouseup", "auxclick"].forEach(function (type) {
    document.addEventListener(type, function (e) {
      if (boutonSourisTraite_ === null || e.button !== boutonSourisTraite_) return;
      e.preventDefault();
      if (type === "auxclick") boutonSourisTraite_ = null;
    }, true);
  });
  function attribuerCombo_(action, combo) {
    var siennes = combosDe(action);
    if (siennes.indexOf(combo) >= 0) { toast("« " + libelleCombo(combo) + " » sert déjà à cette action."); renderRaccourcis(); return; }
    var autre = ACTIONS_CLAVIER.filter(function (a) { return a !== action && combosDe(a).indexOf(combo) >= 0; })[0];
    function appliquer() {
      var m = JSON.parse(JSON.stringify(modifsRaccourcis_()));
      if (autre) m[autre.id] = combosDe(autre).filter(function (c) { return c !== combo; });
      m[action.id] = siennes.concat([combo]);
      enregistrerModifsRaccourcis_(m);
      renderRaccourcis();
      toast("« " + libelleCombo(combo) + " » : " + action.nom + ".");
    }
    if (!autre) { appliquer(); return; }
    renderRaccourcis();
    demanderConfirmation("« " + libelleCombo(combo) + " » sert déjà à « " + autre.nom + " ». L’utiliser pour « " + action.nom + " » à la place ?", appliquer);
  }
  function cablerPageRaccourcis() {
    var zone = document.getElementById("listeRaccourcis");
    if (!zone) return;
    zone.addEventListener("click", function (e) {
      var ligne = e.target.closest(".ligne-raccourci");
      if (!ligne || ligne.classList.contains("rc-fixe")) return;
      var action = actionClavierParId_(ligne.dataset.action);
      if (!action) return;
      if (e.target.closest(".rc-ajouter")) { capturerCombo_(ligne); return; }
      var retirer = e.target.closest(".rc-retirer");
      if (retirer) {
        var combo = retirer.parentNode.dataset.combo;
        changerCombosAction_(action.id, combosDe(action).filter(function (c) { return c !== combo; }));
        renderRaccourcis();
        return;
      }
      if (e.target.closest(".rc-defaut")) {
        // Les touches d'origine peuvent avoir été données à une autre
        // action entre-temps : elles lui sont reprises.
        var m = JSON.parse(JSON.stringify(modifsRaccourcis_()));
        delete m[action.id];
        ACTIONS_CLAVIER.forEach(function (a) {
          if (a === action || !Array.isArray(m[a.id])) return;
          m[a.id] = m[a.id].filter(function (c) { return action.defaut.indexOf(c) < 0; });
        });
        enregistrerModifsRaccourcis_(m);
        renderRaccourcis();
      }
    });
    var reset = document.getElementById("btnRaccourcisDefaut");
    if (reset) reset.addEventListener("click", function () {
      demanderConfirmation("Revenir aux touches d’origine pour tous les raccourcis ?", function () {
        enregistrerModifsRaccourcis_({});
        renderRaccourcis();
        toast("Raccourcis d’origine rétablis.");
      });
    });
    renderRaccourcis();
  }
