"use strict";
  /* ============================================================
     MOTEUR DE RENDU / INTERACTION — repris du prototype prototype-bulles.html
     (V3), quasiment inchangé : il ne connaît que TACHES/JALONS/NOTES/
     PERSONNES/CHANTIERS/STATUTS en mémoire (cf. bloc "ÉTAT VUE" plus haut).
     ============================================================ */
  function hexToRgba(hex, alpha) {
    var h = String(hex || "#999999").replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }
  // Fériés : source unique désormais (§5 du spec, fusion FERIES/FERIES_ETAT
  // du prototype) — etat.feriesServeur, indexé par date ISO. Couleur par
  // catégorie : recherche dans catsFeries() (etat.categoriesFeriesServeur,
  // cf. WebApp.gs/apiListerCategoriesFeries) — plus fixe depuis le round du
  // 02.09.2026 (suite), couleurs éditables par Lionel via renderFerieCategories.
  var feriesParIso = {};
  function reconstruireFeriesParIso() {
    feriesParIso = {};
    (etat.feriesServeur || []).forEach(function (f) { feriesParIso[f.iso] = f; });
  }
  function feriePourJour(gi) {
    var iso = isoDeGi(gi);
    if (!iso) return null;
    var f = feriesParIso[iso];
    if (!f) return null;
    var cat = catsFeries().filter(function (c) { return c.id === f.categorie; })[0];
    // Filet de sécurité neutre (gris), PAS la couleur de "Férié" (round du
    // 02.09.2026, suite, bug remonté par Lionel) : si jamais categorie ne
    // correspond à aucune catégorie connue (donnée corrompue, ou classeur
    // pas encore sur cette version du script), autant que ce soit visible
    // comme "quelque chose ne va pas" plutôt que de se faire passer pour un
    // vrai jour "Férié" — l'ancien filet retombait justement sur la couleur
    // de "Férié" (#e8a3a3), ce qui maquillait le problème en résultat plausible.
    return { label: f.libelle, couleur: cat ? cat.couleur : "#c9c9c9" };
  }

  // racineEl : fetché PARESSEUSEMENT (jamais au chargement du script) — au
  // moment où ce script s'exécute, #app est encore vide (la coquille de
  // navigation, #racine compris, n'est construite qu'après un premier
  // apiDemarrer() réussi, cf. construireCoquille()).
  document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  var racineEl;

  // construireSelectChantier() — ex-construireLegende(), renommée au §83
  // (round du 16.09.2026, encore un autre, suite×7) : la légende des
  // chantiers a disparu (Lionel : « on ne réaffiche pas la légende des
  // chantiers »), remplacée par le sélecteur explicite .select-chantier de
  // la nouvelle barre d'outils (cf. htmlPagePlanning/cablerPagePlanning) —
  // mais le MÉCANISME qu'elle portait (choisir un chantier "par défaut" des
  // formulaires, round du 03.09.2026) reste identique, juste ré-habillé :
  // reconstruit le panneau déroulant (liste des chantiers actifs) ET
  // l'apparence du bouton (swatch + nom du chantier par défaut, ou un
  // repli neutre "Chantier" si aucun n'est choisi).
  function construireSelectChantier() {
    var btn = document.getElementById("btnSelectChantier");
    var panneau = document.getElementById("panneauChantier");
    if (!btn || !panneau) return;
    var defautActuel = chantierParDefautValide();
    var swatchBtn = btn.querySelector(".swatch");
    var nomBtn = btn.querySelector(".nom-chantier");
    if (defautActuel) {
      swatchBtn.style.background = CHANTIERS[defautActuel].couleur;
      nomBtn.textContent = CHANTIERS[defautActuel].nom;
      btn.title = "Chantier par défaut des formulaires : " + CHANTIERS[defautActuel].nom + " — cliquer pour changer";
    } else {
      swatchBtn.style.background = "var(--border)";
      nomBtn.textContent = "Chantier";
      btn.title = "Choisir un chantier par défaut pour les formulaires";
    }
    panneau.innerHTML = "";
    // Round du 14.09.2026 : un chantier désactivé ne s'affiche plus dans ce
    // panneau (qui ne sert qu'à choisir le chantier par défaut des
    // formulaires, cf. commentaire juste en dessous) — CHANTIERS reste lui
    // la map COMPLÈTE (cf. construireVueDepuisCache), filtrée seulement ici.
    Object.keys(CHANTIERS).filter(function (k) { return CHANTIERS[k].actif !== false; }).forEach(function (k) {
      var c = CHANTIERS[k];
      var it = document.createElement("button");
      it.type = "button";
      // Cliquable (round du 03.09.2026, demande de Lionel) : choisit ce
      // chantier comme valeur PRÉ-COCHÉE de tous les selects "Chantier" des
      // formulaires (cf. chantierParDefaut, champChantierHTML) — cliquer le
      // chantier déjà actif le désélectionne (retour au comportement
      // d'avant : premier chantier de la liste).
      it.className = "select-chantier-item" + (k === defautActuel ? " actif" : "");
      it.title = (k === defautActuel)
        ? "Chantier par défaut des formulaires — cliquer pour désélectionner"
        : "Cliquer pour en faire le chantier par défaut des formulaires";
      it.innerHTML = '<span class="swatch" style="background:' + c.couleur + '"></span>' + esc(c.nom) + '<span class="coche">✓</span>';
      it.addEventListener("click", function () {
        chantierParDefaut = (k === chantierParDefautValide()) ? null : k;
        memoriserChantierParDefaut();
        construireSelectChantier();
        var sel = document.getElementById("selectChantier");
        if (sel) sel.classList.remove("ouvert");
      });
      panneau.appendChild(it);
    });
    // Round du 22.09.2026 (suite ×4) — Lionel : « un "+" pour ajouter un
    // chantier en bas de la liste ». Réutilise TEL QUEL le flux existant
    // (ouvrirAjoutChantier, page-chantiers.js — même formulaire nom+couleur,
    // même sauvegarde serveur, aucune logique dupliquée) : sa propre
    // callback de rafraîchissement (rafraichirApresChantiers -> finir())
    // rappelle déjà construireSelectChantier(), ce panneau se remplit donc
    // automatiquement avec le nouveau chantier dès l'enregistrement.
    var btnAjoutChantier = document.createElement("button");
    btnAjoutChantier.type = "button";
    btnAjoutChantier.className = "select-chantier-item select-chantier-ajouter";
    btnAjoutChantier.textContent = "+ Ajouter un chantier";
    btnAjoutChantier.addEventListener("click", function () {
      var sel = document.getElementById("selectChantier");
      if (sel) sel.classList.remove("ouvert");
      if (typeof ouvrirAjoutChantier === "function") ouvrirAjoutChantier();
    });
    panneau.appendChild(btnAjoutChantier);
    // ajusterDebordementToolbar (round du 23.09.2026, suite ×12) : le nom du
    // chantier par défaut affiché sur ce bouton peut changer la largeur
    // totale de la barre — revérifier le débordement en même temps que le
    // "top" sticky, juste après.
    ajusterDebordementToolbar();
    ajusterEnteteFixe();
  }

  // ajusterEnteteFixe() — round du 16.09.2026 (suite, encore). Calcule et
  // pose dynamiquement (plutôt qu'en dur, cf. l'historique de .barre-undo/
  // .legende dans FRONTEND-CHANGELOG §73.2/73.4, recalculé À LA MAIN 2 fois
  // de suite) le "top" sticky de #legendeBarre puis de .entete-planning-figee,
  // empilés sous .onglets-nav (cf. leurs commentaires CSS) : mesuré en JS à
  // chaque rendu, ça reste juste même si la hauteur de la légende change
  // (plus ou moins de chantiers, retour à la ligne sur écran étroit) sans
  // jamais avoir à refaire ce calcul à la main. Sans effet si la page
  // Planning n'est pas l'onglet actif (#page-planning est alors
  // display:none, donc les rects mesurés seraient nuls) — cf. les points
  // d'appel (fin de construireGrille/construireLegende, bascule vers
  // l'onglet Planning via RENDU_PAR_PAGE, redimensionnement de fenêtre)
  // qui couvrent tous les cas où cette mesure doit être refaite pendant que
  // la page est effectivement visible.
  //
  // Round du 24.09.2026 (suite 4) — Lionel, captures téléphone à l'appui :
  // « Sur mobile la partie au dessus de note doit rester fixe. Actuellement
  // elle monte de quelques pixel lors d'un défilement ». Root cause : le top
  // sticky valait la hauteur de .onglets-nav seule, alors qu'au repos la
  // barre est posée PLUS BAS — padding-top de .page-scroll (6px), plus le
  // margin-bottom de .onglets-nav (4px) sur desktop. Dès les premiers pixels
  // de défilement, barre ET en-tête remontaient donc de cet écart avant de se
  // coller (mesuré : 6px sur téléphone, où .onglets-nav est masquée, 10px
  // sur desktop/tablette). Le top sticky reprend maintenant la position
  // NATURELLE de la barre (mesurée en la décollant un instant, position
  // relative, sans repaint entre les deux) : collée exactement là où elle
  // est au repos, elle ne bouge plus d'un pixel. L'écart au-dessus d'elle,
  // qui laisserait désormais voir la grille défiler en dessous, est masqué
  // par un bandeau couleur de fond (::before, hauteur --ecart-haut, cf.
  // .toolbar-sheets dans style.css).
  function ajusterEnteteFixe() {
    var pagePlanning = document.getElementById("page-planning");
    if (!pagePlanning || !pagePlanning.classList.contains("actif")) return;
    var nav = document.querySelector(".onglets-nav");
    var legendeBarre = document.getElementById("legendeBarre");
    var conteneur = document.getElementById("app");
    if (!nav || !legendeBarre || !conteneur) return;
    var hNav = nav.getBoundingClientRect().height;
    legendeBarre.style.position = "relative";
    legendeBarre.style.top = "0px";
    var haut = legendeBarre.getBoundingClientRect().top - conteneur.getBoundingClientRect().top - conteneur.clientTop + conteneur.scrollTop;
    legendeBarre.style.position = "";
    haut = Math.max(hNav, haut);
    legendeBarre.style.top = haut + "px";
    legendeBarre.style.setProperty("--ecart-haut", (haut - hNav) + "px");
    var entete = document.querySelector(".entete-planning-figee");
    if (entete) entete.style.top = (haut + legendeBarre.getBoundingClientRect().height) + "px";
  }
  // ajusterDebordementToolbar() — round du 23.09.2026 (suite ×12). Lionel :
  // « sur desktop/tablette, placer les éléments qui dépassent de la toolbar
  // dans le menu 3 points. Pas de retour à la ligne. » Même principe de
  // mesure que ajusterEnteteFixe juste au-dessus (JS plutôt qu'en dur, pour
  // rester juste quel que soit le nombre de chantiers/la largeur d'écran) :
  // pose ou retire .toolbar-compacte sur #legendeBarre (cf. son gros
  // commentaire CSS pour ce que ça change) selon que le contenu, une fois
  // étendu, dépasserait ou non de la barre.
  //
  // Repart TOUJOURS de l'état étendu avant de mesurer (tous les groupes
  // remis dans la barre en premier) : sans ça, un groupe replié une fois ne
  // reviendrait jamais en réagrandissant la fenêtre — absent de la barre, il
  // ne pèserait plus dans la mesure. Remise en place puis repli, tous deux
  // synchrones, n'ont aucun effet visible à l'écran (aucun repaint entre les
  // deux) — seules les lectures de getBoundingClientRect entre les deux
  // forcent un reflow, sans jamais rien afficher de l'état intermédiaire.
  //
  // Round du 24.09.2026 (suite 3) — repli GROUPE PAR GROUPE. Lionel : « En
  // réduisant la largeur d'écran, placer un groupe d'élément dans le menu 3
  // points quand il sort de la tool barre », de droite à gauche (« De droite
  // à gauche » : Masquages, Zoom, Navigation, Imprimer — cf. REPLIS_ORDRE).
  // Plus un tout-ou-rien : chaque groupe est déplacé physiquement de la
  // barre vers #toolbarSecondaire (cf. le commentaire TECHNIQUE de
  // htmlPagePlanning, js/coquille.js), un à la fois, tant que la barre
  // déborde encore — "⋮" apparaissant dès le 1er repli (.toolbar-compacte),
  // sa propre largeur est prise en compte par la mesure suivante.
  //
  // La mesure ne regarde plus scrollWidth mais le bord droit de chaque
  // enfant direct de la barre : un menu déroulant OUVERT (le "+", le zoom…,
  // en position:absolute) peut dépasser de la barre sans qu'aucun bouton ne
  // déborde — scrollWidth l'aurait compté comme un débordement et replié
  // des groupes pour rien.
  //
  // Téléphone (≤600px) : pas de mesure, barre fixe (Lionel : « Menu ⋮
  // seulement », barre inchangée) — tous les groupes repliables ET "Ajouter
  // une ligne" vont d'office dans le panneau, comme avant ce round.
  //
  // Round du 24.09.2026 (suite 10) — Zoom replié EN PREMIER. Lionel :
  // « placer le zoom en premier dans le menu 3points lors du rétrécissement,
  // c'est la moins utilisé des fonctions ». L'ordre de repli n'est donc plus
  // strictement de droite à gauche : Zoom (le moins utilisé) part d'abord,
  // puis Masquages, Navigation, Imprimer. Seul l'ordre de REPLI change :
  // l'ordre d'affichage dans le menu (data-rang-menu, « Imprimer > Zoom >
  // Navigation semaine > … ») et celui de la barre restent ceux qu'il avait
  // fixés — insererAuRang place chaque groupe replié à son rang, quel que
  // soit le moment où il part.
  var REPLIS_ORDRE = ["groupeZoom", "controlesAffichage", "groupeNavSemaine", "groupeImprimer"];
  var REPLIS_TELEPHONE = REPLIS_ORDRE.concat(["groupeAjoutLigne"]);
  // Insère `el` dans `conteneur` avant le premier enfant de rang supérieur
  // (data-rang ou data-rang-menu selon `cle`) — garde le DOM dans l'ordre
  // visuel, dont dépendent les séparateurs (.sep-avant, cf. style.css).
  function insererAuRang(el, conteneur, cle) {
    var rang = Number(el.dataset[cle]);
    var suivant = null;
    for (var i = 0; i < conteneur.children.length; i++) {
      var c = conteneur.children[i];
      if (c !== el && c.dataset[cle] !== undefined && Number(c.dataset[cle]) > rang) { suivant = c; break; }
    }
    if (el.parentNode !== conteneur || el.nextElementSibling !== suivant) conteneur.insertBefore(el, suivant);
  }
  function barreDeborde(barre, panneau) {
    var st = getComputedStyle(barre);
    var bord = barre.getBoundingClientRect().right - parseFloat(st.paddingRight) - parseFloat(st.borderRightWidth);
    for (var i = 0; i < barre.children.length; i++) {
      var c = barre.children[i];
      if (c === panneau) continue;
      var r = c.getBoundingClientRect();
      if (r.width > 0 && r.right > bord + 1) return true;
    }
    return false;
  }
  function ajusterDebordementToolbar() {
    var pagePlanning = document.getElementById("page-planning");
    if (!pagePlanning || !pagePlanning.classList.contains("actif")) return;
    var legendeBarre = document.getElementById("legendeBarre");
    var panneau = document.getElementById("toolbarSecondaire");
    if (!legendeBarre || !panneau) return;
    var telephone = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 600px)").matches;
    var groupes = REPLIS_TELEPHONE.map(function (id) { return document.getElementById(id); }).filter(Boolean);
    groupes.forEach(function (g) { insererAuRang(g, legendeBarre, "rang"); });
    legendeBarre.classList.remove("toolbar-compacte");
    if (telephone) {
      groupes.forEach(function (g) { insererAuRang(g, panneau, "rangMenu"); });
      legendeBarre.classList.add("toolbar-compacte");
      return;
    }
    var ordre = REPLIS_ORDRE.map(function (id) { return document.getElementById(id); }).filter(Boolean);
    for (var i = 0; i < ordre.length && barreDeborde(legendeBarre, panneau); i++) {
      insererAuRang(ordre[i], panneau, "rangMenu");
      legendeBarre.classList.add("toolbar-compacte");
    }
    fermerPanneauSiVide(panneau);
  }
  // Panneau ouvert puis fenêtre ré-élargie jusqu'à tout faire revenir dans
  // la barre : "⋮" disparaît — ne pas laisser un panneau vide ouvert sans
  // plus aucun bouton pour le refermer.
  function fermerPanneauSiVide(panneau) {
    if (panneau.querySelector(".toolbar-groupe")) return;
    panneau.classList.remove("ouvert");
    var btn = document.getElementById("btnPlusOutils");
    if (btn) btn.classList.remove("ouvert");
  }
  var minuteurAjustEntete = null;
  window.addEventListener("resize", function () {
    clearTimeout(minuteurAjustEntete);
    minuteurAjustEntete = setTimeout(function () { ajusterDebordementToolbar(); ajusterEnteteFixe(); }, 120);
  });

  function secteurPersonne(personneId) {
    var p = personneParAncre(personneId);
    return p && p.sousTraitant ? "sous-traitant" : "personnel";
  }
  // Ordre AFFICHÉ (suite 33) : équipes suivies de leurs membres, membres
  // repliés exclus — cf. personnesAffichees (js/equipes.js).
  function lignesSecteur(secteur) {
    var out = [];
    personnesAffichees(secteur).forEach(function (p) {
      DEMIS.forEach(function (demi) { out.push({ personne: p.id, demi: demi }); });
    });
    return out;
  }
  // Empilement en mode compact : matin et après-midi d'une même personne
  // partagent maintenant UNE ligne, il faut donc décider quelles tâches
  // peuvent cohabiter sur la même piste. Deux tâches ne se gênent que si
  // elles occupent une même DEMI-JOURNÉE : une tâche du matin et une de
  // l'après-midi du même jour tombent dans deux colonnes différentes et
  // peuvent donc rester sur la même piste — c'est tout l'intérêt du mode,
  // sinon on n'aurait rien gagné en hauteur. On raisonne donc sur l'ensemble
  // des demi-journées occupées (jour × 2 + 0/1), pas sur des intervalles de
  // jours. Round du 25.09.2026 (suite 35) : sert aussi aux lignes Jalons et
  // Notes, qui passaient encore par l'ancien assignerPistes() À LA JOURNÉE
  // (supprimé) — cf. la ligne jalons/notes plus bas.
  function assignerPistesCompact(items) {
    var pistes = []; // pistes[i] = { "<hi>": true } : demi-journées déjà prises
    items.slice().sort(function (a, b) { return a.giDebut - b.giDebut; }).forEach(function (it) {
      var occupe = {};
      if (estGiWeekend(it.giDebut)) {
        occupe["w" + it.giDebut] = true; // le week-end a sa propre colonne, hors axe demi-journée
      } else {
        // demiDebut/demiFin (round du 08.09.2026, suite, encore — §49) : une
        // tâche/absence peut désormais occuper 1 SEUL demi-slot par bord et
        // les 2 demi-slots de chaque jour du milieu — même calcul d'empreinte
        // que demiSlotsDepuisBornes/construireVueDepuisCache, plus le vieux
        // décalage fixe "toujours la même demi-journée toute la durée".
        var slotsIt = demiSlotsDepuisBornes(it.giDebut, it.duree, it.demiDebut || null, it.demiFin || null);
        for (var h = slotsIt.halfStart; h <= slotsIt.halfFinIncl; h++) occupe[h] = true;
      }
      var cles = Object.keys(occupe);
      var piste = -1;
      for (var i = 0; i < pistes.length && piste === -1; i++) {
        var libre = cles.every(function (k) { return !pistes[i][k]; });
        if (libre) piste = i;
      }
      if (piste === -1) { piste = pistes.length; pistes.push({}); }
      cles.forEach(function (k) { pistes[piste][k] = true; });
      it._piste = piste;
    });
    return pistes.length;
  }
  // itemParId : résolution PURE PAR ID (JALONS/NOTES/TACHES), sans passer
  // par le DOM — plus simple et plus sûre qu'un
  // document.querySelector('.bulle[data-id="'+id+'"]') + itemDepuisBulle,
  // utilisée par tout code qui n'a de toute façon qu'un id en main (pas un
  // élément .bulle), par ex. lors d'une suppression/copie/coupe groupée.
  function itemParId(id) {
    var j = JALONS.filter(function (x) { return x.id === id; })[0];
    if (j) return { item: j, liste: JALONS };
    var n = NOTES.filter(function (x) { return x.id === id; })[0];
    if (n) return { item: n, liste: NOTES };
    var t = TACHES.filter(function (x) { return x.id === id; })[0];
    if (t) return { item: t, liste: TACHES };
    return null;
  }
  function itemDepuisBulle(bulleDom) {
    return itemParId(bulleDom.dataset.id);
  }
  // demisOccupeesTache (round du 08.09.2026, suite, encore — §49) : demi(s)
  // occupé(s) par une tâche/absence sur UN jour précis de sa plage — même
  // règle de bord que la projection de calculerEtatLocal (d===0 -> demiDebut,
  // dernier jour -> demiFin, tout jour du milieu -> les 2 demis). Renvoie
  // null si `gi` n'est pas dans la plage de `it`. Partagée par tout code qui
  // doit encore raisonner "cette tâche touche-t-elle CETTE demi-journée
  // précise" maintenant qu'une tâche n'a plus un seul champ `demi` fixe.
  //
  // Round du 12.09.2026 : sur une plage de PLUSIEURS jours, "matin" en 1er
  // jour et "aprem" en dernier jour ne raccourcissent RIEN visuellement
  // (colonneEtSpanDemi plus bas : colDebut === colonneGrille(gi) pour
  // "matin", colFinExclusif === fin du dernier jour pour "aprem" — les 2
  // valent exactement une journée entière) ; les compter comme "une seule
  // demi-journée occupée" ici serait donc en contradiction avec ce qui
  // s'affiche réellement (Lionel : *"jeudi 10.09 A, vendredi 11.09 P,
  // voudrait dire 2 jours complets, il n'y a pas de trou"* — exact) et
  // ferait notamment rater la moitié "libre à tort" d'une sélection au
  // glissé. Seuls "aprem" en 1er jour et "matin" en dernier jour raccourcissent
  // vraiment la bulle et restent donc de vraies demi-journées ici. Sur 1
  // seul jour (duree===1), aucune normalisation : "matin"/"aprem" y sont
  // chacun une vraie demi-journée (cf. colonneDemi, appliqué aux 2 bords à
  // la fois dans ce cas).
  function demisOccupeesTache(it, gi) {
    if (gi < it.giDebut || gi >= it.giDebut + it.duree) return null;
    var d = gi - it.giDebut, multi = it.duree > 1;
    var demiIci;
    if (d === 0) demiIci = (multi && it.demiDebut === "matin") ? null : (it.demiDebut || null);
    else if (multi && d === it.duree - 1) demiIci = (it.demiFin === "aprem") ? null : (it.demiFin || null);
    else demiIci = null;
    return demiIci ? [demiIci] : ["matin", "aprem"];
  }
  function celluleAPosition(kind, extra, gi) {
    var sel = '.cell[data-kind="' + kind + '"][data-jour="' + gi + '"]';
    if (kind === "personne") sel += '[data-personne="' + extra.personne + '"][data-demi="' + extra.demi + '"]';
    return document.querySelector(sel);
  }
  function poserSurCellule(visualDom, cible) {
    if (!cible) return;
    visualDom.classList.add("posee");
    var r = cible.getBoundingClientRect ? cible.getBoundingClientRect() : cible;
    var h = visualDom.getBoundingClientRect().height;
    visualDom.style.left = r.left + "px";
    visualDom.style.top = (r.top + Math.max(0, (r.height - h) / 2)) + "px";
    visualDom.style.width = r.width + "px";
  }
  function rectanglePlage(kind, extra, giDebut, duree) {
    var c0 = celluleAPosition(kind, extra, giDebut);
    if (!c0) return null;
    var c1 = celluleAPosition(kind, extra, giDebut + Math.max(1, duree) - 1) || c0;
    var r0 = c0.getBoundingClientRect(), r1 = c1.getBoundingClientRect();
    return { left: r0.left, top: r0.top, width: (r1.right - r0.left), height: r0.height };
  }

  function giVisible(gi, n) { return giVisibleFenetre(gi, n); }
  // Colonne CSS où COMMENCE le jour gi. En mode compact, un jour occupe 2
  // colonnes (matin puis après-midi) : cette fonction renvoie celle du matin,
  // et colonneDemi() ci-dessous ajoute le décalage de l'après-midi. Reste
  // valide pour un gi "virtuel" juste après la fin d'une semaine — c'est la
  // borne exclusive dont spanColonnes() a besoin (cf. son commentaire).
  function colonneGrille(gi) {
    var cpj = colsParJour();
    if (estGiWeekend(gi)) {
      var s = semaineDuGiWeekend(gi), j = jourWeekendIdx(gi);
      return 2 + s * (5 * cpj + 2) + 5 * cpj + j;
    }
    return 2 + gi * cpj + (afficherWeekends ? Math.floor(gi / 5) * 2 : 0);
  }
  // Colonne CSS d'une DEMI-JOURNÉE précise : les deux demis d'un jour sont
  // côte à côte (matin à gauche). Le week-end n'a qu'une seule case par
  // personne (§2 du spec), donc jamais de décalage.
  function colonneDemi(gi, demi) {
    if (estGiWeekend(gi)) return colonneGrille(gi);
    return colonneGrille(gi) + (demi === "aprem" ? 1 : 0);
  }
  // Span en COLONNES CSS d'une bulle de plage (jalon/note/tâche multi-jours),
  // à ne PAS confondre avec sa durée en JOURS OUVRÉS (dureeVisible, en unités
  // de gi — jamais le week-end, cf. estGiWeekend) : quand les week-ends sont
  // affichés, colonneGrille() insère 2 colonnes (Samedi/Dimanche) à chaque
  // frontière de semaine, donc une bulle qui traverse cette frontière (ex.
  // Vendredi -> Lundi, duree=2 en gi) doit s'étendre sur 2 colonnes CSS de
  // PLUS par frontière traversée pour atteindre visuellement sa vraie
  // dernière case (Lundi) — sinon elle s'arrête au milieu du week-end
  // (Samedi), ce qui la fait paraître décalée de 2 jours dès qu'on repasse
  // les week-ends à l'affichage (bug signalé par Lionel, round du
  // 02.09.2026). colonneGrille(gi) reste valide même pour un gi "virtuel"
  // au tout début de la semaine suivante (aucune case n'y est réellement
  // dessinée) : c'est exactement la borne EXCLUSIVE dont on a besoin ici.
  //
  // Round du 24.09.2026 (suite 23) — Lionel : « en affichant les week-end,
  // les bulles du vendredi sont affichés sur le week-end ». Revers de la
  // règle ci-dessus : la borne exclusive « début du jour ouvré suivant »
  // d'une bulle qui FINIT un vendredi est le lundi, posé APRÈS les 2
  // colonnes Samedi/Dimanche — la bulle les recouvrait donc toujours.
  // Borne désormais = fin du DERNIER jour de la bulle (colFinDernierJour_) :
  // toujours juste après sa dernière case, week-end traversé ou pas (un
  // Vendredi -> Lundi s'étend toujours jusqu'au lundi, puisque la colonne de
  // ce lundi inclut déjà le décalage du week-end).
  function colFinDernierJour_(giDebut, dureeVisible) {
    return colonneGrille(giDebut + Math.max(1, dureeVisible) - 1) + colsParJour();
  }
  function spanColonnes(giDebut, dureeVisible) {
    return colFinDernierJour_(giDebut, dureeVisible) - colonneGrille(giDebut);
  }
  // Colonne CSS de départ + span d'une bulle jalon/note/tâche compte tenu de
  // sa demi-journée éventuelle (matin/aprem) — UNE SEULE fonction, utilisée
  // à la fois par le rendu statique (construireVueDepuisCache) et par
  // l'aperçu en direct du redimensionnement (cablerPoigneeRedim), pour que
  // les deux ne puissent plus jamais diverger (cf. FRONTEND-CHANGELOG.md,
  // round du 03.09.2026 — avant ce partage, l'aperçu de glissement d'une
  // note en demi-journée ignorait sa colonne réelle en mode compact, la
  // faisant sauter sur le mauvais emplacement pendant le geste, ce qui
  // rendait la note impossible à redimensionner correctement : signalé par
  // Lionel, "je n'arrive pas à étendre une bulle note sur une demi journée").
  // demiDebut/demiFin (round du 03.09.2026, "je peux reduire de 1 jour à 1
  // demi jour, mais je ne peux pas augmenter à 1 jour et demi") : chaque
  // bord de la plage a désormais sa propre demi-journée — colDebut ne
  // dépend que de demiDebut (décalage éventuel du 1er jour), colFinExclusif
  // ne dépend que de demiFin (raccourci éventuel du dernier jour). Pour une
  // plage d'un seul jour les 2 valent la même chose (invariant maintenu côté
  // appelants), donc ce cas particulier retombe naturellement sur
  // l'ancien comportement (1 seule sous-colonne).
  function colonneEtSpanDemi(gi, duree, demiDebut, demiFin) {
    var colDebut = (demiDebut === "matin" || demiDebut === "aprem") ? colonneDemi(gi, demiDebut) : colonneGrille(gi);
    var giFin = gi + Math.max(1, duree) - 1;
    // Seul demiFin === "matin" raccourcit visuellement la fin (le dernier
    // jour s'arrête après sa sous-colonne matin) : demiFin === "aprem" n'a
    // de sens que comme bord de DÉPART reconduit sur un jour unique (cf.
    // demiPourRedimNote) et ne raccourcit jamais la fin d'une plage
    // multi-jours — il n'y a pas de façon de "commencer le dernier jour à
    // son après-midi" sans creuser un trou non contigu dans la bulle.
    var colFinExclusif = (demiFin === "matin") ? colonneDemi(giFin, "matin") + 1 : colFinDernierJour_(gi, duree); // cf. spanColonnes (suite 23)
    return [colDebut, Math.max(1, colFinExclusif - colDebut)];
  }
  // Moitié de journée survolée dans une cellule (round du 03.09.2026,
  // signalé par Lionel : "les notes sont toujours pas extensible ni
  // déplaçable en demi journée") — moitié gauche = matin, moitié droite =
  // après-midi. La cellule couvre les 2 colonnes du jour (fond commun, cf.
  // creerCelluleFond), donc son milieu tombe pile entre les 2 sous-colonnes
  // (suite 24 : la mention de l'ancien mode classique, retiré, n'a plus lieu
  // d'être ici). Une seule fonction, utilisée par le
  // redimensionnement (cablerPoigneeRedim) ET le déplacement d'une note
  // (onPointerDownGroupeSelection) ci-dessous.
  //
  // cel.dataset.demi (round du 14.09.2026 — Lionel, vidéo à l'appui :
  // "lors de l'étirement, la bulle est aimantée de manière bizarre", puis
  // "idem lors du déplacement, la bulle fait des « gauche-droite »") :
  // cette règle "milieu de la cellule" ne vaut QUE pour une cellule
  // fond-commun pleine largeur (creerCelluleFond, jalon/note — cf. ci-dessus).
  // Une cellule "personne" (creerCell) est déjà scindée matin/aprem en mode
  // compact (2 <div class="cell"> distinctes côte à côte, chacune large
  // d'UNE SEULE demi-journée, cf. colonneDemi) : lui appliquer quand même la
  // règle du milieu revient à re-découper une demi-journée déjà entière en 2
  // quarts, et la moitié gauche du quart droit tombe alors à nouveau côté
  // "matin" — dès que le pointeur franchit la frontière entre les 2 cellules
  // demi-journée, le résultat retombe donc brièvement en arrière avant de
  // rattraper le sens du glissement (aperçu qui semble "aimanté", tâche qui
  // "fait des gauche-droite" pendant le glissement). demiSlotCellule()
  // plus bas avait déjà cette distinction pour un tout autre appelant
  // (glissé de sélection rapide) ; elle est maintenant dans la fonction
  // partagée, pour que les 6 appels côté redimensionnement/déplacement d'une
  // bulle personne en bénéficient aussi. Une cellule "personne" a TOUJOURS
  // un data-demi valide (posé par creerCell) : le prendre directement, sans
  // aucun calcul sur clientX, élimine le découpage en quart superflu — c'est
  // aussi exactement ce que demande l'intuition de Lionel (survoler la
  // moitié matin d'un jour doit toujours viser "matin", jamais dépendre de
  // quel quart de cette moitié). Un fond jalon/note (creerCelluleFond) ne
  // pose jamais ce data-attribut : il retombe donc, inchangé, sur le calcul
  // par position du pointeur.
  function demiDepuisPointeur(cel, clientX) {
    if (cel.dataset && (cel.dataset.demi === "matin" || cel.dataset.demi === "aprem")) return cel.dataset.demi;
    var r = cel.getBoundingClientRect();
    if (!r.width) return "matin";
    return (clientX - r.left) < r.width / 2 ? "matin" : "aprem";
  }
  // Bords {demiDebut, demiFin} cibles d'une NOTE en cours de
  // redimensionnement par glissement (cablerPoigneeRedim) — extraite en
  // fonction pure (donc testable indépendamment de tout DOM/pointeur) de la
  // RÈGLE, pas de la détection elle-même (ça, c'est demiDepuisPointeur
  // ci-dessus).
  //
  // round du 03.09.2026 ("je peux reduire de 1 jour à 1 demi jour, mais je
  // ne peux pas augmenter à 1 jour et demi") : avant ce round, dès que la
  // poignée s'étendait sur plusieurs jours la demi-journée d'ORIGINE était
  // reconduite SANS Y TOUCHER (comportement figé, cf. FRONTEND-CHANGELOG
  // §23) — impossible d'atteindre "1 jour et demi" en tirant une poignée
  // depuis une note déjà en demi-journée, puisque le seul bord qu'elle
  // pouvait porter restait bloqué à sa valeur de départ. Désormais chaque
  // poignée ne gouverne QUE SON PROPRE bord (droite -> demiFin, gauche ->
  // demiDebut) ; l'autre bord n'est jamais touché, quelle que soit la durée
  // de l'aperçu — c'est exactement ce qui permet à l'aperçu de glisser en
  // continu "1 jour" -> "1 demi jour" -> "1 jour et demi".
  //   dureePrevisu === 1 : un seul jour restant, donc les 2 bords
  //     fusionnent forcément (invariant demiDebut === demiFin) — la position
  //     du pointeur DANS ce jour choisit alors la seule demi-journée de la
  //     note, quelle que soit la poignée tenue.
  //   dureePrevisu > 1, poignée "droite" : la position du pointeur dans le
  //     NOUVEAU dernier jour choisit demiFin (moitié gauche = rogné ->
  //     "matin" seul ; moitié droite = pas rogné -> journée entière) ;
  //     demiDebut ne bouge pas.
  //   dureePrevisu > 1, poignée "gauche" : symétrique sur demiDebut (moitié
  //     droite = rogné -> "aprem" seul ; moitié gauche = pas rogné ->
  //     journée entière) ; demiFin ne bouge pas.
  //
  // Round du 24.09.2026 (suite 21) — Lionel : « Raccourcir une bulle d'un
  // jour posé un lundi après-midi avec la poignée la décale contre la
  // gauche au lundi matin et sa grandeur reste de 1 jour complet. » La
  // règle « dureePrevisu === 1 » ci-dessus oubliait que le bord FIXE (celui
  // que la poignée ne tient pas) peut lui-même être une demi-journée : une
  // bulle « lundi après-midi -> mardi matin » raccourcie par la droite
  // jusqu'au lundi gardait bien lundi, mais le pointeur sur la moitié droite
  // de lundi rendait null/null — journée ENTIÈRE, calée sur le lundi matin.
  // Désormais le bord fixe reste là où il était : poignée droite, le début
  // garde sa demi-journée d'origine et la fin suit le pointeur sans jamais
  // passer avant lui (au pire, 1 seule demi-journée) ; poignée gauche,
  // symétrique. Les 2 bords retombent ensuite sur la forme canonique d'un
  // jour (même demi des 2 côtés, ou null/null pour la journée entière).
  // Sur plusieurs jours, un début "matin" ou une fin "aprem" sont ramenés à
  // null (même équivalence que colonneEtSpanDemi/demisOccupeesTache).
  function demiPourRedimNote(cote, dureePrevisu, demiDebutOrig, demiFinOrig, demiAuPoint) {
    var pointAprem = demiAuPoint === "aprem" ? 1 : 0;
    if (dureePrevisu === 1) {
      var s, f;
      if (cote === "droite") { s = demiDebutOrig === "aprem" ? 1 : 0; f = Math.max(s, pointAprem); }
      else { f = demiFinOrig === "matin" ? 0 : 1; s = Math.min(f, pointAprem); }
      var demiUnique = s === f ? (s ? "aprem" : "matin") : null;
      return { demiDebut: demiUnique, demiFin: demiUnique };
    }
    if (cote === "droite") return { demiDebut: demiDebutOrig === "aprem" ? "aprem" : null, demiFin: pointAprem ? null : "matin" };
    return { demiDebut: pointAprem ? "aprem" : null, demiFin: demiFinOrig === "matin" ? "matin" : null };
  }
  // Modèle "demi-slot" (round du 07.09.2026, suite — Lionel, après le §37 :
  // « toujours impossible de déplacer une note qui mesure 2 demi/journée de
  // 1 demi journée », clarifié en « un après-midi et un matin [...] je veux
  // le déplacer sur matin/après-midi »). demiCiblePourDeplacementNote
  // (round du 03.09.2026/§25, retirée à la suite 24 avec le mode classique)
  // reconduisait TOUJOURS la forme des 2 bords telle
  // quelle dès que duree > 1 — un déplacement de note à cheval sur plusieurs
  // jours ne pouvait donc bouger que par JOUR ENTIER, jamais par demi-journée :
  // ce n'était pas un bug caché, cette granularité n'avait simplement jamais
  // été construite pour le cas multi-jours.
  //
  // Un "demi-slot" est un entier qui numérote consécutivement les
  // demi-journées ouvrées : le jour `gi` a pour matin le slot `2*gi`, pour
  // après-midi le slot `2*gi+1`. Traduire une note en {halfStart, halfFinIncl}
  // (les 2 bornes INCLUSES, en demi-slots), translater cette paire d'un
  // nombre ENTIER de demi-slots puis reconvertir, donne exactement le
  // déplacement en demi-journée pour une note multi-jours — sans jamais
  // changer son NOMBRE TOTAL de demi-slots occupés (donc sa durée réelle de
  // travail), qu'elle soit concentrée sur un seul jour ou répartie sur
  // plusieurs jours calendaires.
  //
  // Round du 08.09.2026, suite — Lionel : « je n'arrive pas à placer ma note
  // sur lundi aprem [...] ce phénomène ne se produit que quand la bulle fait
  // un jour complet » / « une bulle de 2 case doit garder sa grandeur mais
  // doit pouvoir se déplacer de 1 case » : ce modèle gouverne désormais AUSSI
  // le déplacement en mode compact d'une note d'1 SEUL jour (duree === 1),
  // pas seulement duree > 1 comme avant ce round — cf. resoudreCibleGroupe.
  // Une note en JOURNÉE ENTIÈRE occupe exactement 2 demi-slots (autant
  // qu'une note "1 jour et demi" à cheval sur 2 jours calendaires) : rien ne
  // justifiait de la traiter différemment.
  function demiSlotsDepuisBornes(giDebut, duree, demiDebut, demiFin) {
    var halfStart = giDebut * 2 + (demiDebut === "aprem" ? 1 : 0);
    var halfFinIncl = (giDebut + Math.max(1, duree) - 1) * 2 + (demiFin === "matin" ? 0 : 1);
    return { halfStart: halfStart, halfFinIncl: halfFinIncl };
  }
  // Inverse de demiSlotsDepuisBornes : reconstruit {giDebut, duree, demiDebut,
  // demiFin} depuis une paire de bornes en demi-slots (incluses). Sur un seul
  // jour (les 2 bornes tombent dans le même `gi`), invariant maintenu partout
  // ailleurs dans le fichier : demiDebut === demiFin — soit la note tient sur
  // UN seul demi-slot (matin seul ou aprem seul), soit sur les 2 demi-slots du
  // jour (journée entière, demiDebut = demiFin = null). C'est précisément ce
  // cas qui permet au scénario de Lionel (2 demi-slots consécutifs à cheval
  // sur 2 jours -> 2 demi-slots du MÊME jour) de redevenir une journée pleine.
  function bornesDepuisDemiSlots(halfStart, halfFinIncl) {
    var giDebut = Math.floor(halfStart / 2), giFin = Math.floor(halfFinIncl / 2);
    var duree = giFin - giDebut + 1;
    if (duree === 1) {
      if (halfFinIncl === halfStart) {
        var demiUnique = (halfStart % 2 === 1) ? "aprem" : "matin";
        return { giDebut: giDebut, duree: 1, demiDebut: demiUnique, demiFin: demiUnique };
      }
      return { giDebut: giDebut, duree: 1, demiDebut: null, demiFin: null };
    }
    var demiDebut = (halfStart % 2 === 1) ? "aprem" : null;
    var demiFin = (halfFinIncl % 2 === 0) ? "matin" : null;
    return { giDebut: giDebut, duree: duree, demiDebut: demiDebut, demiFin: demiFin };
  }
  // Déplacement en demi-journée d'une note de PLUSIEURS jours (duree > 1) —
  // combine la position du CLIC initial dans la bulle (offsetHalvesClic, en
  // demi-slots — cf. onPointerDownGroupeSelection) et la position du
  // RELÂCHEMENT (giCibleBrut + demiSousPointeur) en un delta de demi-slots,
  // jamais un delta de jours entiers qui ne permettrait aucun décalage plus
  // fin qu'une journée complète. La fenêtre `[0, nTotal*2 - 1]` (bornes
  // incluses, en demi-slots) est la même limite que pour un déplacement en
  // jours entiers (`nTotal - duree` jours), simplement exprimée dans l'unité
  // demi-slot — la LONGUEUR occupée (`L`) ne change jamais, seule sa position
  // est bornée.
  function bordsDeplacementNoteMultiJours(giDebut, duree, demiDebut, demiFin, offsetHalvesClic, giCibleBrut, demiSousPointeur, nTotal) {
    var b = demiSlotsDepuisBornes(giDebut, duree, demiDebut, demiFin);
    var L = b.halfFinIncl - b.halfStart + 1;
    var halfSousPointeur = giCibleBrut * 2 + (demiSousPointeur === "aprem" ? 1 : 0);
    var nouveauHalfStart = halfSousPointeur - offsetHalvesClic;
    nouveauHalfStart = Math.max(0, Math.min(nTotal * 2 - L, nouveauHalfStart));
    return bornesDepuisDemiSlots(nouveauHalfStart, nouveauHalfStart + L - 1);
  }
  function appliquerTeinteFerie(cell, gi) {
    var fer = feriePourJour(gi);
    if (!fer) return;
    cell.classList.add("cell-ferie");
    cell.style.setProperty("--ferie-tint", hexToRgba(fer.couleur, .3));
    cell.title = fer.label;
  }
  function creerCell(gi, extra) {
    var cell = document.createElement("div");
    cell.className = "cell cell-personne";
    cell.dataset.kind = "personne"; cell.dataset.jour = String(gi);
    cell.dataset.personne = extra.personne; cell.dataset.demi = extra.demi;
    // Round du 24.09.2026 — Lionel : « en mode 2 semaines, j'ai une mauvaise
    // bordure au niveau du lundi midi. » En mode compact (toujours actif,
    // cf. le commentaire du mode unique dans core.js), une ligne Personnel/Intervenants pose 2
    // cellules DOM par jour (matin + aprem, cf. ligneGroupePersonnesCompact) —
    // cette fonction est donc appelée 2 fois par jour, une fois par demi.
    // "sem-frontiere" marque la frontière de SEMAINE (bordure gauche plus
    // marquée) et ne doit exister QUE sur la colonne du matin, premier bord
    // visuel du jour ; sans le test `extra.demi !== "aprem"`, la cellule
    // aprem du 1er jour de chaque semaine la recevait ELLE AUSSI, ce qui
    // dessinait une 2e bordure — visuellement une frontière de semaine en
    // plein milieu du lundi (entre ses 2 demi-journées) plutôt qu'à son bord
    // gauche.
    if (!estGiWeekend(gi) && gi > 0 && gi % 5 === 0 && extra.demi !== "aprem") cell.classList.add("sem-frontiere");
    if (estGiWeekend(gi)) cell.classList.add("case-weekend");
    appliquerTeinteFerie(cell, gi);
    cablerAjoutCellule(cell);
    return cell;
  }
  // Cellule week-end "inerte" (fond seul, pas cliquable, pas de data-kind) —
  // posée sur la ligne Après-midi d'une personne (cf. ligneGroupePersonnes) :
  // contrairement aux jours ouvrés, il n'existe physiquement QU'UNE seule
  // cellule week-end par personne côté feuille (colonne jj=6 fusionnée sur
  // les 4 lignes du bloc, §2 du spec) — pas de ligne matin/aprem distincte.
  // Le client V3 affiche 2 lignes par personne ; pour ne jamais écrire 2 fois
  // (donc s'écraser l'un l'autre) la même cellule serveur depuis 2 cases
  // "actives" différentes, seule la ligne Matin porte la vraie cellule
  // interactive (cf. creerCell + construireVueDepuisCache, items posés avec
  // demi:"matin") ; celle-ci, posée sur Après-midi, est un simple filler
  // visuel (même teinte --weekend-bg) pour que la grille reste alignée.
  function creerCelluleWeekendInerte(gi) {
    var cell = document.createElement("div");
    cell.className = "cell case-weekend";
    cell.style.cursor = "default";
    return cell;
  }
  function creerCelluleFond(kind, gi) {
    var cell = document.createElement("div");
    cell.className = "cell cell-" + kind;
    cell.dataset.kind = kind; cell.dataset.jour = String(gi);
    if (!estGiWeekend(gi) && gi > 0 && gi % 5 === 0) cell.classList.add("sem-frontiere");
    if (estGiWeekend(gi)) cell.classList.add("case-weekend");
    // Jalons/notes n'existent que sur les jours ouvrés côté feuille réelle
    // (apiEnregistrerPlage ignore explicitement les colonnes week-end, cf.
    // §2 du spec — seule la cellule "personne" week-end est fusionnée). Une
    // case week-end de la ligne Jalons/Notes reste donc un simple fond
    // inerte, pas cliquable (déviation documentée dans FRONTEND-CHANGELOG.md).
    if (estGiWeekend(gi)) { cell.style.cursor = "default"; return cell; }
    appliquerTeinteFerie(cell, gi);
    cablerAjoutCellule(cell);
    return cell;
  }

  // Navigation semaine (flèches ‹ › du titre planning, cf. construireGrille
  // plus bas) — étaient déjà APPELÉES (fleche-semaine/lien-aller) mais
  // jamais définies, trou laissé par l'interruption précédente (comme
  // basculerSelection plus haut, cf. FRONTEND-CHANGELOG.md). §1 du spec :
  // navigue en dates réelles (etat.indexSemaine dans etat.semaines), jamais
  // en gi — la fenêtre affichée change, la vue est reconstruite depuis
  // etat.cache pour cette nouvelle fenêtre.
  function naviguerSemaine(dir) {
    var nouvel = etat.indexSemaine + dir;
    if (nouvel < 0 || nouvel >= etat.semaines.length) { toast(dir < 0 ? "Déjà la première semaine du planning." : "Déjà la dernière semaine du planning."); return; }
    etat.indexSemaine = nouvel;
    bullesSelectionnees = {};
    assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); majBarreSelection(); });
  }
  // Bouton "Aujourd'hui" (retour de Lionel, 02.09.2026 : "il manque un
  // bouton aujourd'hui pour revenir à la semaine actuelle") — même règle que
  // indexSemaineDuJour_ côté serveur (WebApp.gs, apiDemarrer) : la semaine
  // contenant aujourd'hui, sinon la première à venir, sinon la dernière du
  // planning. Recalculée ici plutôt que renvoyée par le serveur : etat.semaines
  // et etat.aujourdhui sont déjà en main côté client depuis apiDemarrer, un
  // aller-retour réseau de plus n'aurait aucun sens pour ça.
  function indexSemaineAujourdhui_() {
    var iso = etat.aujourdhui;
    for (var i = 0; i < etat.semaines.length; i++) {
      var s = etat.semaines[i];
      if (iso >= s.debut && iso <= s.fin) return i;
    }
    for (var i2 = 0; i2 < etat.semaines.length; i2++) if (etat.semaines[i2].debut >= iso) return i2;
    return etat.semaines.length - 1;
  }
  // indexSemaineDeIso_ (généralisation d'indexSemaineAujourdhui_ à une date
  // ISO arbitraire, introduite pour cablerCalendrierDate) a disparu round du
  // 12.09.2026 : appliquerDateChoisieFormulaire ne navigue plus jamais vers
  // une autre semaine (cf. son commentaire — Lionel, « le planning ne doit
  // pas suivre en arrière-plan »), donc plus personne ne l'appelle.
  function allerAujourdhui() {
    var idx = indexSemaineAujourdhui_();
    if (idx < 0) return;
    // Round du 23.09.2026 (suite 13) — Lionel, mode mobile "1 jour" :
    // « "Aujourd'hui" doit ramener à Aujourd'hui même si on est un autre
    // jour de la semaine ». Avant ce round, ce bouton ne réagissait qu'à un
    // changement de SEMAINE (idx !== etat.indexSemaine) — en mode "1 jour"
    // mobile, rester sur la semaine en cours mais scrollé sur un autre jour
    // (lundi, mercredi...) faisait donc juste afficher le toast ci-dessous
    // sans rien recentrer. modeJourMobile_ recalcule ici la même condition
    // que la var locale enModeJourMobile de construireGrille (inaccessible
    // depuis cette fonction, appelée avant tout rendu) : vueJourMobile actif
    // ET largeur ≤600px.
    var modeJourMobile_ = modeJourMobileActif();
    // Round du 24.09.2026 (suite 6) — vue "1 jour" : la fenêtre de 2
    // semaines dépend du jour affiché (cf. fenetreLabGs, core.js) — aller à
    // aujourd'hui peut donc la déplacer même sans changer de semaine. Chemin
    // unique ici : jour et fenêtre recalculés, puis rendu calé sur ce jour.
    if (modeJourMobile_) {
      etat.indexSemaine = idx;
      jourMobileIso = etat.aujourdhui;
      debutFenetreMobile = null;
      cibleApresRendu = "aujourdhui"; // impose ce jour au rendu (cf. le relevé de l'ancienne grille, construireGrille)
      bullesSelectionnees = {};
      assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); majBarreSelection(); });
      return;
    }
    if (idx === etat.indexSemaine) {
      if (!modeJourMobile_) { toast("Déjà sur la semaine actuelle."); return; }
      // Semaine déjà correcte : pas besoin de recharger les données, juste
      // reposition ner le scroll sur la colonne d'aujourd'hui (cibleApresRendu,
      // consommé par construireGrille — cf. son commentaire plus bas).
      cibleApresRendu = "aujourdhui";
      render(false);
      return;
    }
    etat.indexSemaine = idx;
    bullesSelectionnees = {};
    if (modeJourMobile_) cibleApresRendu = "aujourdhui";
    assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); majBarreSelection(); });
  }
  // Round D — bouton unique "2 semaines" (remplace la paire .toggle-sem
  // "1 semaine"/"2 semaines", cf. commentaire de construireGrille) : bascule
  // simplement l'état, son rendu .actif suit deuxSemaines à chaque
  // reconstruction de .semaine-titre.
  function basculerDeuxSemaines() {
    deuxSemaines = !deuxSemaines;
    assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); });
  }
  // Round du 23.09.2026 (suite 4) — pendant mobile de basculerDeuxSemaines()
  // ci-dessus, pour le bouton "1 semaine" qui remplace "Afficher 2 semaines"
  // sur téléphone (cf. commentaire du gabarit dans construireGrille et
  // #groupeVueJourMobile dans js/coquille.js). Plus simple que
  // basculerDeuxSemaines : on ne change que la largeur des colonnes déjà en
  // mémoire, jamais la semaine chargée — pas besoin d'assurerFenetreChargee/
  // construireVueDepuisCache. cibleApresRendu recale le défilement (sur
  // aujourd'hui en repassant en "1 jour", sur le début de semaine en passant
  // en "1 semaine") dès ce même rendu, cf. son commentaire dans js/core.js.
  // Round du 24.09.2026 (suite 6) : la vue "1 jour" charge désormais 2
  // semaines (cf. fenetreLabGs, core.js) et la vue "1 semaine" une seule —
  // basculer change donc la FENÊTRE chargée, plus seulement la largeur des
  // colonnes : rechargement + reconstruction des bulles (gi) obligatoires,
  // comme basculerDeuxSemaines. En entrant en "1 jour", aujourd'hui s'il est
  // dans la semaine affichée, sinon son lundi (jourMobileCourant).
  function basculerVueJourMobile() {
    vueJourMobile = !vueJourMobile;
    cibleApresRendu = vueJourMobile ? "aujourdhui" : "debut";
    jourMobileIso = null;
    debutFenetreMobile = null;
    bullesSelectionnees = {};
    assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); majBarreSelection(); });
  }
  // Round du 24.09.2026 (suite 15) — date choisie dans un calendrier
  // (.btn-calendrier de la barre, partout depuis la suite 16, cf.
  // js/coquille.js).
  // Vue "1 jour" : même chemin qu'Aujourd'hui (allerAujourdhui plus haut)
  // avec une autre date — semaine et jour affichés, fenêtre de 2 semaines
  // recalculée autour, rendu calé sur ce jour (cibleApresRendu l'impose,
  // cf. le relevé de l'ancienne grille dans construireGrille). Samedi/
  // dimanche alors que le week-end est masqué : la grille n'a pas de
  // colonne pour eux, on prend le jour ouvré le plus proche (samedi ->
  // vendredi, dimanche -> lundi), en le disant. Vue "1 semaine" : la
  // semaine qui contient la date, comme un choix dans la pilule Sem. N.
  function allerAuJour(iso) {
    var idx = -1;
    for (var i = 0; i < etat.semaines.length; i++) {
      if (iso >= etat.semaines[i].debut && iso <= etat.semaines[i].fin) { idx = i; break; }
    }
    if (idx < 0) { toast("Date hors du planning."); return; }
    if (!modeJourMobileActif()) {
      if (idx === etat.indexSemaine) return;
      etat.indexSemaine = idx;
      bullesSelectionnees = {};
      assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); majBarreSelection(); });
      return;
    }
    var js = jourSemaineIso_(iso);
    if (js >= 5 && !afficherWeekends) {
      var d = new Date(iso + "T00:00:00");
      d.setDate(d.getDate() + (js === 5 ? -1 : 1));
      iso = isoDeDate(d);
      if (js === 6) idx = Math.min(idx + 1, etat.semaines.length - 1);
      toast("Week-end masqué : " + libelleDateCourteIso(iso) + " affiché.");
    }
    etat.indexSemaine = idx;
    jourMobileIso = iso;
    debutFenetreMobile = null;
    cibleApresRendu = "aujourdhui";
    bullesSelectionnees = {};
    assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); majBarreSelection(); });
  }
  // Jour sur lequel s'ouvre le calendrier : le jour affiché en vue
  // "1 jour" ; sinon aujourd'hui s'il est dans la semaine affichée, ou son
  // lundi. Bornes : toutes les semaines connues du planning.
  function majCalendrierJour(input) {
    var s = etat.semaines[etat.indexSemaine];
    if (!s) return;
    input.value = modeJourMobileActif() ? jourMobileCourant() : (etat.aujourdhui >= s.debut && etat.aujourdhui <= s.fin ? etat.aujourdhui : s.debut);
    input.min = etat.semaines[0].debut;
    input.max = etat.semaines[etat.semaines.length - 1].fin;
  }
  // Largeur d'écran qui passe au-dessus/au-dessous de 600px (rotation d'un
  // téléphone, fenêtre redimensionnée) : la vue "1 jour" s'active ou se
  // désactive, et avec elle la fenêtre chargée change (2 semaines <-> 1).
  // Les bulles déjà construites (gi) ne correspondraient plus : on
  // reconstruit. Onglet Planning masqué : fait à son retour (coquille.js,
  // RENDU_PAR_PAGE.planning) — renvoie true si une reconstruction est lancée.
  var modeJourMobileRendu = null, labsRendusDernier = null;
  // reajusterBullesJourMobile() (suite 35) : recalcule, à l'image suivante,
  // la largeur visible des cartes de bulles en vue « 1 jour » (cf.
  // ajusterLargeurBullesJourMobile dans construireGrille, qui la
  // rebranche à chaque rendu) — pour l'aperçu d'une poignée, qui change la
  // taille d'une bulle sans aucun défilement. Sans effet hors de ce mode.
  var reajusterBullesJourMobile = function () {};
  function verifierModeFenetre() {
    var page = document.getElementById("page-planning");
    if (!page || !page.classList.contains("actif") || modeJourMobileRendu === null) return false;
    if (modeJourMobileActif() === modeJourMobileRendu) return false;
    debutFenetreMobile = null;
    bullesSelectionnees = {};
    assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); majBarreSelection(); });
    return true;
  }
  if (typeof window.matchMedia === "function") {
    var mqTelephone = window.matchMedia("(max-width: 600px)");
    if (mqTelephone.addEventListener) mqTelephone.addEventListener("change", verifierModeFenetre);
  }
  // Préchargement, en arrière-plan, de la semaine juste avant et juste après
  // la fenêtre de la vue "1 jour" : c'est elle que demandera le prochain
  // recentrage (cf. recentrerFenetreJourMobile dans construireGrille) —
  // déjà en cache, il se fait sans attendre le réseau, donc sans à-coup.
  // Silencieux (pas de sablier ni de message) ; rafraîchi un peu avant
  // l'expiration du cache (FRAICHEUR_MS) pour ne pas recharger au mauvais
  // moment ; ignoré si le cache a été vidé entre-temps (generationCache,
  // cf. oublierCache).
  function prechargerVoisinesJourMobile() {
    var d = debutFenetreJourMobile_();
    [d - 1, d + 2].forEach(function (i) {
      var sem = etat.semaines[i];
      if (!sem) return;
      var ts = etat.cacheTs[sem.labG];
      if (etat.cache[sem.labG] && ts && (Date.now() - ts) < FRAICHEUR_MS / 2) return;
      var gen = generationCache;
      chargerSemaineDepuisServeur(sem.labG).then(function (data) { if (gen === generationCache) mettreEnCache(data); }, function () {});
    });
  }
  // Round du 23.09.2026 (suite 5) — Lionel : « Swipper un vendredi permet de
  // passer au lundi de la semaine suivante ? » (pas encore, à l'époque) —
  // pendant "bord de semaine" de naviguerSemaine() plus haut, déclenché par
  // un swipe qui continue au-delà du bord en mode "1 jour" mobile (cf. le
  // détecteur tactile posé sur .scroller dans construireGrille). dir>0 :
  // semaine suivante, on atterrit sur son PREMIER jour (cibleApresRendu =
  // "debut", symétrique du dernier jour de la semaine qu'on vient de
  // quitter) — dir<0 : semaine précédente, sur son DERNIER jour ("fin").
  // Pas de toast en cas de butée réelle (début/fin des 260 semaines
  // préchargées) : contrairement à naviguerSemaine(), qui réagit à un clic
  // explicite sur ‹ ›, ce déclencheur vient d'un simple geste continu — un
  // message à ce moment-là serait intrusif pour un cas qui n'arrivera
  // quasiment jamais en pratique.
  // (suite ×11) — Lionel : « L'action de swiper d'une semaine à l'autre est
  // intéressante et pourrait être portée aux versions tablette et desktop. »
  // Partagée telle quelle par le détecteur tactile ci-dessus (mobile "1
  // jour") ET par le détecteur "wheel" plus bas dans construireGrille
  // (molette/trackpad, desktop/tablette) — seul le geste d'entrée diffère,
  // le comportement (semaine + jour d'atterrissage) reste identique aux 2.
  function naviguerSemaineDepuisBordJour(dir) {
    var nouvel = etat.indexSemaine + dir;
    if (nouvel < 0 || nouvel >= etat.semaines.length) return;
    etat.indexSemaine = nouvel;
    bullesSelectionnees = {};
    cibleApresRendu = dir > 0 ? "debut" : "fin";
    assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); majBarreSelection(); });
  }
  // Round D (11.09.2026) — « Ajout lointain » (poser une tâche/absence/
  // note/jalon à une date éloignée sans faire défiler le calendrier,
  // ex-round du 02.09.2026) a été RETIRÉ à la demande de Lionel : « ajout
  // lointain disparaît car on peut maintenant le faire via les nouveaux
  // formulaires » — ouvrirEdition/ouvrirEditionPlage permettent désormais
  // de choisir n'importe quelle date directement dans leur propre fiche
  // (bloc dates-plage, cf. cablerDatesPlage), ce que ce formulaire dédié
  // était seul à offrir avant cette refonte. Fonctions supprimées avec le
  // bouton (cf. FRONTEND-CHANGELOG.md) : joursOuvresDepuis,
  // construireLignesAjoutLointain, ajoutLointainTache, ouvrirAjoutLointain.
  //
  // ouvrirAllerSemaine() (choisir une semaine dans la liste plutôt que de
  // cliquer ‹ › plusieurs fois — popup centrée avec un <select>, ouverte par
  // le "Semaine N" du coin de la grille) a été supprimée au §87 (round du
  // 17.09.2026, suite×2) avec son unique déclencheur .lien-aller — la même
  // liste (etat.semaines) est désormais proposée par #menuSemaine/
  // #btnSemainePill dans #legendeBarre, en dropdown façon Sheets plutôt
  // qu'en popup centrée (cf. cablerPagePlanning).

  function construireGrille() {
    if (!racineEl) racineEl = document.getElementById("racine");
    if (!racineEl || !fenetrePrete()) return;
    // Largeur de la colonne des noms (suite 35, cf. largeurNoms, core.js) :
    // lue une fois par rendu, pour tous les calculs ci-dessous.
    var LN = largeurNoms();
    var scrollerPrecedent = racineEl.querySelector(".scroller");
    var scrollLeftPrecedent = scrollerPrecedent ? scrollerPrecedent.scrollLeft : 0;
    // Vue "1 jour" (round du 24.09.2026, suite 6) : le rendu se cale sur
    // jourMobileIso, tenu à jour à chaque ARRÊT du défilement — mais un
    // défilement fait PENDANT un glisser de bulle (défilement automatique au
    // bord de l'écran) ne déclenche pas cette mise à jour, et le rendu qui
    // suit le dépôt ramènerait alors l'écran sur l'ancien jour. On relève
    // donc ici le jour réellement visible dans l'ancienne grille, tant que
    // rien n'impose un autre jour : même fenêtre qu'au rendu précédent, pas
    // de cible imposée (Aujourd'hui, bascule de vue), et jour toujours dans
    // la semaine affichée (sinon, c'est ‹ › ou la pilule qui viennent d'en
    // changer — jourMobileCourant se charge alors du bon jour).
    if (scrollerPrecedent && modeJourMobileRendu && modeJourMobileActif() && !cibleApresRendu && labsRendusDernier === fenetreLabGs().join(",")) {
      var bordNomsPrec = scrollerPrecedent.getBoundingClientRect().left + LN, thVisible = null, ecartVisible = Infinity;
      racineEl.querySelectorAll(".entete-planning-figee .th[data-gi]").forEach(function (th) {
        var e = Math.abs(th.getBoundingClientRect().left + th.clientLeft - bordNomsPrec);
        if (e < ecartVisible) { ecartVisible = e; thVisible = th; }
      });
      var isoVisible = thVisible ? isoDeGi(+thVisible.dataset.gi) : null;
      var semAff = etat.semaines[etat.indexSemaine];
      if (isoVisible && semAff && isoVisible >= semAff.debut && isoVisible <= semAff.fin) jourMobileIso = isoVisible;
    }
    // enteteScrollPrecedent (son scrollLeft servait de source pour resynchro
    // l'en-tête figé) a disparu round du 23.09.2026 (suite 4) : ce rôle est
    // repris par cibleScrollLeft, calculé une seule fois plus bas et
    // appliqué identiquement aux deux (scroller ET enteteScroll) — cf. son
    // commentaire pour le détail (recalage sur aujourd'hui en mode "1 jour").
    // §83 (round du 16.09.2026, encore un autre, suite×7) : Annuler/Refaire
    // ont quitté la cellule coin de cette grille pour la nouvelle barre
    // d'outils fixe sous les onglets (cf. #btnDefaire/#btnRefaire dans
    // htmlPagePlanning, câblés une seule fois dans cablerPagePlanning comme
    // Imprimer) — plus besoin de les extraire/replacer à chaque rendu ici
    // (ancien va-et-vient .barre-undo, cf. son historique CSS plus haut).
    racineEl.innerHTML = "";
    var n = nbJoursAffiches();
    var nbSemainesAffichees = fenetreLabGs().length; // 2 aussi en vue "1 jour" téléphone (round du 24.09.2026, suite 6, cf. fenetreLabGs)
    // La ligne "Aujourd'hui/2 semaines/‹ Semaine N ›" qui vivait ici (coinNav/
    // navSemaine, cf. leur historique avant suppression au §87, round du
    // 17.09.2026, suite×2) portait ses propres textes calculés à partir de
    // fenetreDonnees()/libelleJourGi() — donnees/num0/num1/texteSemaines/
    // deb0/fin0, plus utilisés nulle part ailleurs, disparaissent avec elle.
    // Lionel, à propos de la même navigation désormais dans #legendeBarre
    // (cf. htmlPagePlanning/cablerPagePlanning) : « on enlève la première
    // ligne du tableau qui ne sert plus » — entièrement redondante une fois
    // dupliquée dans la barre, cette cellule ne portait plus d'information
    // qu'on ne retrouve pas déjà là-haut.
    //
    // grilleEntete / grilleCorps (round du 16.09.2026, suite, encore) —
    // Lionel : « faire défiler la page après les notes ». La grille CSS
    // unique d'origine est scindée en DEUX grilles séparées, mêmes colonnes
    // (gabarit/largeurMiniTotale ci-dessous, calculées une seule fois et
    // appliquées aux deux pour rester pixel-alignées) : grilleEntete porte
    // tout ce qui doit rester FIXE à l'écran (nav de semaine, jours, M/A,
    // Jalons, Notes) et grilleCorps porte Personnel/Intervenants, qui
    // continue de défiler normalement. Cf. le commentaire CSS de
    // .entete-planning-figee pour le pourquoi (position:sticky ne peut pas
    // s'appliquer cellule par cellule ici, à cause de l'overflow-x:auto de
    // .scroller). enteteScroll.scrollLeft est recopié sur le défilement réel
    // de .scroller (seul à porter la barre de défilement visible) pour que
    // les deux grilles restent visuellement synchronisées horizontalement.
    var cadre = document.createElement("div"); cadre.className = "grille-cadre";
    var scroller = document.createElement("div"); scroller.className = "scroller";
    var grilleCorps = document.createElement("div"); grilleCorps.className = "grille grille-compacte";
    var enteteFigee = document.createElement("div"); enteteFigee.className = "entete-planning-figee";
    var enteteScroll = document.createElement("div"); enteteScroll.className = "entete-planning-scroll";
    var grilleEntete = document.createElement("div"); grilleEntete.className = "grille grille-compacte";
    // Chaque jour est scindé en 2 colonnes : la largeur minimale par
    // demi-journée est donc réduite (58px, contre 108px par jour à l'époque
    // du mode classique), pour que la semaine tienne dans la même largeur
    // plutôt que d'obliger à scroller deux fois plus : moitié moins de
    // largeur pour le texte, moitié moins de hauteur.
    var largeurMin = 58;
    // Round du 23.09.2026 (suite 4) — Lionel : « sur la vue mobile ne soit
    // afficher que 1 jours. Un bouton permettrait d'afficher la vue 1
    // semaine (à la place du 2 semaines qu'on retrouve sur desktop et
    // tablettes) ». enModeJourMobile ne s'active qu'en dessous de 600px
    // (même coupure que style-mobile.css) ET si vueJourMobile est actif
    // (bouton mobile, cf. basculerVueJourMobile plus bas — inerte sur
    // desktop/tablette, deuxSemaines/#btnDeuxSemaines inchangés là-bas).
    // Chaque colonne de jour prend alors quasi toute la largeur de l'écran
    // (calc(100vw - 116px), 116px = la colonne d'étiquette figée à gauche,
    // cf. .th.coin/.lbl/.lbl-speciale { position:sticky; left:0 } dans
    // style.css) au lieu de sa largeur minimale habituelle (108/58px) : un
    // seul jour tient à l'écran, le suivant/précédent se révèle en faisant
    // défiler horizontalement .scroller (mécanisme déjà existant, aucun
    // nouveau geste). En mode compact (colsParJour()===2, le réglage par
    // défaut), les 2 demi-colonnes matin/aprem se partagent cette largeur à
    // parts égales plutôt que chacune prendre 100% — sinon 1 jour occuperait
    // 2 écrans pleins. Colonnes week-end : même traitement (largeur pleine),
    // pas de division par colsParJour() puisqu'elles n'ont qu'une seule case
    // par personne (cf. commentaire de colonneDemi()).
    var enModeJourMobile = modeJourMobileActif();
    modeJourMobileRendu = enModeJourMobile;
    var labsRendus = labsRendusDernier = fenetreLabGs().join(",");
    // Round du 23.09.2026 (suite ×10) — cf. le commentaire de
    // .scroller.snap-jour-mobile dans style.css : le scroll-snap "1 jour"
    // (Lionel : « la case du jour doit être aimantée pour qu'elle rentre sur
    // l'écran ») ne s'active QUE dans ce mode, jamais en "1 semaine"/desktop/
    // tablette où le défilement libre reste inchangé.
    scroller.classList.toggle("snap-jour-mobile", enModeJourMobile);
    // Même repère sur #racine (suite 37) : les poignées des jalons et notes
    // (grilleEntete, hors de .scroller) suivent la même règle d'affichage
    // que celles des tâches (style.css, « Poignées en vue 1 jour »).
    racineEl.classList.toggle("vue-jour-mobile", enModeJourMobile);
    // Round du 23.09.2026 (suite 15) — Lionel : « La case jour ne fait pas
    // la largeur de l'écran mais déborde à droite ». Avant ce correctif, la
    // largeur de colonne ci-dessous se calculait avec l'unité CSS `100vw` —
    // la largeur BRUTE du viewport, qui ne « voit » jamais le padding
    // horizontal posé plus haut dans l'arbre entre le viewport et .scroller
    // (.page-scroll, 18px de chaque côté, cf. son commentaire — sans
    // compter les 2px de bordure gauche/droite de .grille-cadre). Résultat :
    // la colonne du jour se calculait ~38px plus large que l'espace
    // RÉELLEMENT disponible dans .scroller, débordant d'autant à droite.
    // Remplacé par une mesure réelle et déjà juste par construction :
    // racineEl (cf. plus haut, toujours monté à ce stade) hérite sa largeur
    // de .page-scroll comme .scroller lui-même, padding déjà déduit — measure
    // once ici (avant le vidage/reconstruction de son contenu, qui ne change
    // pas sa propre largeur, fixée par son parent) plutôt qu'une unité CSS
    // aveugle à ce padding.
    //
    // Round du 25.09.2026 (suite 37) — Lionel : « Vérifie la largeur des
    // bulles en mobile. » Mesuré à 360 px : zone visible du jour 230 px
    // (.scroller moins la colonne des noms), colonne du jour 233 px. Deux
    // oublis : les 2 px de bordure de .grille-cadre (citées plus haut mais
    // jamais retirées) et l'écart de 1 px entre colonnes de la grille
    // (.grille { gap: 1px }) entre le matin et l'après-midi. Le bord droit
    // du jour, et avec lui l'arrondi des bulles qui le touchent, passait
    // sous le bord de l'écran. Désormais : matin + écart + après-midi =
    // exactement la zone visible (colonne d'un jour de week-end aussi).
    var largeurVisibleJour = enModeJourMobile ? (racineEl.clientWidth - 2 - LN) : 0;
    var largeurColJour = (largeurVisibleJour - (colsParJour() - 1)) / colsParJour();
    // Même correctif pour .b-txt/.b-statut/.b-serie et .b-carte (style.css,
    // toutes deux `max-width: var(--largeur-visible-bulle, ...)` désormais)
    // — ces règles s'appliquent que l'on soit en mode "1 jour" mobile ou
    // non (texte sticky d'une bulle-plage large, y compris desktop/"1
    // semaine"), donc mise à jour à CHAQUE rendu, pas seulement en
    // enModeJourMobile. Variable globale (:root) plutôt que posée sur
    // .scroller/racineEl : plus simple à référencer depuis ces sélecteurs
    // (héritage CSS normal), pas de risque de portée manquante.
    document.documentElement.style.setProperty("--largeur-visible-bulle", (racineEl.clientWidth - LN - 16) + "px");
    var gabarit = LN + "px";
    for (var sTpl = 0; sTpl < nbSemainesAffichees; sTpl++) {
      if (enModeJourMobile) {
        gabarit += " repeat(" + (5 * colsParJour()) + ", minmax(" + largeurColJour + "px, 1fr))";
        if (afficherWeekends) gabarit += " repeat(2, minmax(" + largeurVisibleJour + "px, 1fr))";
      } else {
        gabarit += " repeat(" + (5 * colsParJour()) + ", minmax(" + largeurMin + "px, 1fr))";
        if (afficherWeekends) gabarit += " repeat(2, 46px)";
      }
    }
    var largeurMiniTotale = enModeJourMobile
      ? (LN + nbSemainesAffichees * (5 * colsParJour() * largeurColJour + (afficherWeekends ? 2 * largeurVisibleJour : 0))) + "px"
      : (LN + nbSemainesAffichees * (5 * colsParJour() * largeurMin + (afficherWeekends ? 2 * 46 : 0))) + "px";
    grilleEntete.style.gridTemplateColumns = gabarit;
    grilleEntete.style.minWidth = largeurMiniTotale;
    grilleCorps.style.gridTemplateColumns = gabarit;
    grilleCorps.style.minWidth = largeurMiniTotale;
    // Case de zoom façon Sheets (§85, round du 17.09.2026) — CSS zoom (pas
    // transform:scale, qui ne changerait que le RENDU sans jamais toucher la
    // taille réelle occupée : largeur de scroll, hauteur de page) posé
    // directement sur les 2 grilles, JAMAIS sur enteteFigee (l'élément
    // sticky lui-même, cf. son historique CSS plus haut) — enteteFigee et
    // son "top" calculé par ajusterEnteteFixe() restent donc totalement
    // étrangers au niveau de zoom choisi, quel qu'il soit. Les 2 grilles
    // gardent le même gabarit/largeurMiniTotale ci-dessus (calculés une
    // seule fois, en px "réels") : le zoom s'applique ensuite identiquement
    // aux deux, donc enteteScroll et scroller restent pixel-alignés à
    // n'importe quel niveau (cf. la synchronisation de scrollLeft plus bas).
    grilleEntete.style.zoom = grilleCorps.style.zoom = (niveauZoomPlanning / 100);

    enteteScroll.appendChild(grilleEntete);
    enteteFigee.appendChild(enteteScroll);
    racineEl.appendChild(enteteFigee);
    scroller.appendChild(grilleCorps);
    cadre.appendChild(scroller);
    racineEl.appendChild(cadre);
    // ajusterLargeurBullesJourMobile() — round du 24.09.2026. Lionel,
    // capture d'écran à l'appui : « les bulles doivent s'adapter aux
    // cellules où elles sont attribuées. La tâche décoffrage balcon est
    // planifiée du 22 matin au 23 midi. Le 22 la bulle doit faire les 2
    // cases et le 23 la case du matin. » Deux symptômes du même problème :
    // sur le dernier jour d'une bulle qui se termine en demi-journée, le
    // texte débordait hors-cadre à gauche (max-width trop large) ; sur un
    // jour où la bulle occupe la journée ENTIÈRE, la carte ne remplissait
    // que la moitié de la largeur (max-width trop étroite, la valeur unique
    // --largeur-visible-bulle posée plus haut est un compromis figé au
    // moment du rendu, pas au moment du scroll). Cause commune : la
    // LARGEUR du bord visible d'une bulle multi-jours doit s'adapter en
    // continu au jour réellement affiché, exactement comme sa POSITION
    // (déjà gérée par le sticky CSS natif, cf. le commentaire de .b-carte
    // dans style.css) — mais sticky ne fait que repositionner, jamais
    // rétrécir/agrandir. Aucune valeur figée une seule fois par bulle (au
    // rendu) ne peut être juste à la fois sur son premier jour (en général
    // une journée entière) ET sur un dernier jour en demi-journée : il faut
    // recalculer à chaque défilement.
    // Calcul GEOMÉTRIQUE (intersection entre la boîte de la bulle, fixe
    // dans le référentiel de la grille, et la fenêtre visible actuelle du
    // scroller) plutôt qu'une déduction à partir de demiDebut/demiFin :
    // correct quel que soit le jour affiché ET quelle que soit la forme de
    // la bulle (jour entier, demi-jour, milieu d'une plage de plusieurs
    // jours), sans avoir besoin de savoir à l'avance quel jour précis sera
    // visible. offsetLeft/offsetWidth de chaque .bulle sont relatifs à leur
    // offsetParent (grilleCorps ou grilleEntete pour Jalons/Notes, cf.
    // trouverScroller) — sans rapport avec le scroll, donc stables entre 2
    // appels tant que la grille elle-même n'est pas reconstruite.
    //
    // Round du 25.09.2026 (suite 35) : mesures en coordonnées ÉCRAN
    // (getBoundingClientRect) plutôt qu'en offsetLeft/scrollLeft. Sous zoom
    // du planning (grilles en `zoom: .8`…), offsetLeft reste dans le repère
    // non zoomé de la grille alors que scrollLeft est dans celui, zoomé, du
    // scroller : à 80 %, une bulle de la VEILLE passait pour visible (carte
    // affichée, largeur fausse) — ce qui faussait aussi la mesure des
    // hauteurs du jour posé (figerHauteursJourMobile, juste en dessous).
    // Toutes les lectures d'abord, puis toutes les écritures : une seule
    // mise en page par image. Largeur ramenée en px CSS de la carte (÷ zoom).
    //
    // Round du 25.09.2026 (suite 37). Lionel : « Recalculer le texte lors de
    // la fixation du jour. » Jusque-là ce calcul tournait à CHAQUE image du
    // glissement : la carte d'une bulle à moitié sortie rétrécissait au fil
    // du geste et son texte se ré-enroulait sans cesse (2 lignes, 3, puis
    // coupé), celle du jour qui arrive grandissait depuis 1 px. Désormais,
    // pendant le glissement (`pendantGlissement`, appel depuis l'événement
    // "scroll") une carte déjà affichée GARDE sa largeur, donc la mise en
    // page de son texte ; une carte qui apparaît reçoit d'emblée la largeur
    // qu'elle aura sur le jour où elle entre (sa part dans la colonne de ce
    // jour, lue sur les en-têtes de jours), sans attendre. Tout est recalculé
    // au plus juste quand le jour est posé (figerHauteursJourMobile, depuis
    // defilementArrete), au rendu et à l'aperçu d'une poignée.
    //
    // Largeur posée aussi en max-width inline (suite 37). Lionel : « Vérifie
    // la largeur des bulles en mobile. » Sur sa capture, les cartes de
    // tâches s'arrêtaient ~15 px avant le bord droit du jour, alors que
    // jalons et notes le touchaient : la règle de classe
    // `max-width: var(--largeur-visible-bulle)` (style.css), valeur de
    // secours calculée pour le TEXTE sticky des autres vues (largeur − noms
    // − 16 px de marge), bridait la largeur posée ici. Les cartes des
    // jalons/notes y échappaient (max-width:none propre à leur ligne).
    // Transition des cartes pendant le glissement (round du 25.09.2026,
    // suite 42). Lionel, 2 captures à l'appui (tâches d'un jour et demi,
    // jeudi 01 et mardi 22) : « Lors d'un balayage à droite pour reculer
    // d'un jour, la bulle ne fait que 1/2 journée avant fixation. Les tâches
    // que tu vois font 1.5 jours, en reculant d'un jour elles conservent
    // leur demi-journée avant recalcul. Est-ce possible que pendant le
    // balayage le bord droit s'accroche à la fin du jour où l'on se dirige
    // pour faire une sorte de transition. » Depuis la suite 37, une carte
    // affichée garde sa largeur pendant tout le geste : la demi-journée du
    // jeudi matin arrivait telle quelle sur le mercredi, qu'elle occupe
    // entièrement, et ne s'élargissait qu'une fois le jour posé.
    // Désormais, pour une carte déjà à l'écran quand le jour a été posé ET
    // dont la tâche occupe aussi le jour visé (le voisin dans le sens du
    // glissement) : sa largeur passe de celle du jour posé (`largeursPosees`)
    // à celle du jour visé, le bord droit suivant la fin de ce jour
    // (bornée à la fin de la tâche). Carte qui s'élargit : la largeur ne
    // bouge pas tant que la fin du jour visé n'a pas rattrapé son bord
    // droit, puis s'y accroche. Carte qui rétrécit (tâche plus courte sur
    // le jour visé) : elle garde sa largeur tant que son bord droit à
    // l'écran reste couvert par la tâche, puis suit la fin de la tâche —
    // jamais une carte plus courte que ce que la tâche couvre réellement à
    // l'écran. Les cartes qui sortent (tâche absente du jour visé) gardent
    // leur largeur (suite 37 : pas de texte ré-enroulé jusqu'à 1 px) ; celles
    // qui entrent passent toujours par le calcul d'entrée plus bas.
    var poseJour = -1, poseScroll = 0, largeursPosees = new WeakMap();
    function ajusterLargeurBullesJourMobile(pendantGlissement) {
      if (!enModeJourMobile) return;
      var zoom = (niveauZoomPlanning / 100) || 1;
      var rS = scroller.getBoundingClientRect();
      var debutVisible = rS.left + scroller.clientLeft + LN * zoom;
      var finVisible = rS.left + scroller.clientLeft + scroller.clientWidth;
      var bulles = [].slice.call(grilleCorps.querySelectorAll(".bulle")).concat([].slice.call(grilleEntete.querySelectorAll(".bulle")));
      var cartes = bulles.map(function (b) { return b.querySelector(".b-carte"); });
      // Pendant le glissement, seules les cartes masquées sont à calculer.
      var aCalculer = bulles.map(function (b, i) { return !!cartes[i] && (!pendantGlissement || cartes[i].style.display === "none" || !cartes[i].style.width); });
      // Sens du glissement depuis le jour posé (suite 42) : jour visé.
      var sensGlisse = 0;
      if (pendantGlissement && poseJour >= 0) {
        var ecart = scroller.scrollLeft - poseScroll;
        if (Math.abs(ecart) >= 1) sensGlisse = ecart > 0 ? 1 : -1;
      }
      var enTransition = bulles.map(function (b, i) { return !!cartes[i] && pendantGlissement && !aCalculer[i] && (largeursPosees.get(cartes[i]) || 0) >= 1; });
      var rects = bulles.map(function (b, i) { return aCalculer[i] || enTransition[i] ? b.getBoundingClientRect() : null; });
      var jours = null;
      if (aCalculer.indexOf(true) >= 0 || enTransition.indexOf(true) >= 0) {
        jours = [].slice.call(grilleEntete.querySelectorAll(".th[data-gi]")).map(function (th) {
          var r = th.getBoundingClientRect(); return [r.left, r.right];
        });
      }
      // Veille et lendemain du jour posé (round du 25.09.2026, suite 41).
      // Lionel, capture à l'appui (vendredi aux cartes de 17 px, « B / é. ») :
      // « En mode mobile, faire les calcul de texte et bulles sur le jour
      // avant et après le jour affiché, pour éviter ce genre de petites
      // bulles. » Une carte hors écran était masquée (display:none), puis
      // calculée seulement en entrant à l'écran pendant le glissement —
      // d'après la mince lamelle visible à cet instant dès que la colonne
      // de son jour n'était pas retrouvée à temps, et gardée ainsi jusqu'à
      // la fixation suivante. Désormais, à chaque calcul complet (rendu,
      // jour posé), les cartes des 2 jours voisins reçoivent déjà leur
      // largeur définitive — leur part dans la colonne de LEUR jour, comme
      // si ce jour était affiché — et restent en place hors écran, texte
      // déjà enroulé : le glissement n'a plus rien à calculer pour elles.
      // Seules les cartes de plus loin (2 jours d'un coup) passent encore
      // par le calcul d'entrée ci-dessous. Classe .jour-voisin : exclues
      // de la mesure des hauteurs du jour posé (figerHauteursJourMobile).
      var voisins = null;
      if (!pendantGlissement && jours) {
        var jPose = -1, recouvrement = 0;
        jours.forEach(function (c, j) {
          var r = Math.min(c[1], finVisible) - Math.max(c[0], debutVisible);
          if (r > recouvrement) { recouvrement = r; jPose = j; }
        });
        if (jPose >= 0) voisins = [jours[jPose + 1], jours[jPose - 1]].filter(Boolean);
        poseJour = jPose; poseScroll = scroller.scrollLeft;
      }
      // Jour visé : le voisin du jour posé dans le sens du geste (plus loin
      // si le geste a déjà dépassé un jour entier).
      var vise = null;
      if (sensGlisse && jours && jours[poseJour]) {
        var largeurJour = jours[poseJour][1] - jours[poseJour][0];
        var pas = largeurJour > 0 ? Math.max(1, Math.ceil(Math.abs(scroller.scrollLeft - poseScroll) / largeurJour - 0.001)) : 1;
        vise = jours[Math.max(0, Math.min(jours.length - 1, poseJour + sensGlisse * pas))];
      }
      for (var t = 0; t < bulles.length; t++) {
        if (!enTransition[t]) continue;
        var lPosee = largeursPosees.get(cartes[t]), l = lPosee;
        if (vise) {
          var r = rects[t];
          var lVisee = Math.min(r.right, vise[1]) - Math.max(r.left, vise[0]);
          var gauche = Math.max(debutVisible, r.left);
          if (lVisee >= 1 && lVisee > lPosee) l = Math.min(lVisee, Math.max(lPosee, Math.min(r.right, vise[1]) - gauche));
          else if (lVisee >= 1 && lVisee < lPosee) l = Math.max(lVisee, Math.min(lPosee, Math.min(r.right, Math.max(vise[1], finVisible)) - gauche));
        }
        if (Math.abs(parseFloat(cartes[t].style.width) * zoom - l) >= 0.5) cartes[t].style.width = cartes[t].style.maxWidth = (l / zoom) + "px";
      }
      for (var i = 0; i < bulles.length; i++) {
        var carte = cartes[i];
        if (!aCalculer[i]) continue;
        var g = Math.max(debutVisible, rects[i].left);
        var d = Math.min(finVisible, rects[i].right);
        if (pendantGlissement && jours && d - g >= 1) {
          // Carte qui entre à l'écran : sa part dans la colonne du jour où
          // se trouve son premier point visible (= sa largeur une fois ce
          // jour posé), au lieu de la mince lamelle visible à cet instant.
          var trouve = false;
          for (var j = 0; j < jours.length; j++) {
            if (g >= jours[j][0] - 0.5 && g < jours[j][1] - 0.5) { d = Math.min(rects[i].right, jours[j][1]); trouve = true; break; }
          }
          // Colonne introuvable (en-tête pas encore recalé sur le
          // défilement) : au plus un jour visible, jamais la lamelle
          // (suite 41, les « B / é. » de 17 px de la capture de Lionel).
          if (!trouve) d = Math.min(rects[i].right, g + (finVisible - debutVisible));
        }
        // width (pas seulement max-width) : .b-carte a align-self:flex-start
        // (rétrécit à son contenu, cf. son commentaire CSS) — livré seul,
        // max-width borne le débordement mais ne fait JAMAIS grandir la
        // carte au-delà du texte qu'elle contient. Lionel veut au contraire
        // que la carte COLORE toute la cellule qui lui est assignée même si
        // son texte n'a pas besoin de toute la largeur (« le 22 la bulle
        // doit faire les 2 cases », pas juste "ne pas déborder des 2
        // cases") — une largeur explicite force ce remplissage, le texte
        // continuant de s'enrouler sur 2 lignes si besoin (line-clamp
        // existant sur .b-txt, inchangé).
        //
        // display:none quand d<=g (aucun recouvrement réel avec la fenêtre
        // visible, ex. une bulle entièrement défilée hors champ) plutôt que
        // width:0px — trouvé en régressant test_regression_bulles_stacking_
        // vendredi.js : .b-carte garde son padding horizontal (14px+8px)
        // même en box-sizing:border-box dès que la largeur demandée passe
        // sous ce plancher (le contenu ne peut pas descendre en dessous de
        // 0, donc le rendu réel plafonne à ~22px de padding pur) — une bulle
        // censée être totalement hors écran redevenait visible avec un
        // bandeau vide de 22px. display:none n'a pas ce plancher.
        var voisin = false;
        if (d - g < 1 && voisins) {
          for (var v = 0; v < voisins.length && !voisin; v++) {
            var gv = Math.max(voisins[v][0], rects[i].left), dv = Math.min(voisins[v][1], rects[i].right);
            if (dv - gv >= 1) { voisin = true; g = gv; d = dv; }
          }
        }
        if (!pendantGlissement) bulles[i].classList.toggle("jour-voisin", voisin);
        if (d - g < 1) { carte.style.display = "none"; }
        else { carte.style.display = ""; carte.style.width = carte.style.maxWidth = ((d - g) / zoom) + "px"; }
        if (!pendantGlissement) largeursPosees.set(carte, d - g < 1 ? 0 : d - g);
        // Poignées d'une bulle hors du jour affiché masquées (suite 37) :
        // celles de la veille tombaient pile au bord de la colonne des noms
        // (traits parasites sur la capture de Lionel, x ≈ 108 px).
        bulles[i].classList.toggle("hors-jour", d - g < 1 || voisin);
      }
    }
    // figerHauteursJourMobile() — round du 25.09.2026 (suite 35), remplace
    // figerHauteursBullesJourMobile de la suite 34. Historique : Lionel,
    // « Sur mobile, éviter que les hauteurs de cellules ne change pendant un
    // changement de jour. » ajusterLargeurBullesJourMobile (juste au-dessus)
    // masque les cartes hors écran et rétrécit celles à moitié visibles
    // pendant le glissement ; or la hauteur d'une piste (ligne de grille,
    // cf. assignerPistesCompact) est celle de sa plus haute bulle affichée :
    // elle bougeait en plein geste. La suite 34 figeait donc chaque bulle à
    // une hauteur valable pour TOUS ses jours — lignes stables, mais
    // calibrées sur le jour le plus chargé de la fenêtre (Mathis à 109 px
    // le jeudi à cause des 2 bulles empilées du mercredi).
    // Suite 35 — Lionel : « sur mobile, lors du défilement, la hauteur
    // pourrait être calculée lors de la fixation du jour. Ainsi pendant le
    // switch la hauteur reste la même et est recalculée lorsque le jour est
    // fixé. » Désormais : une fois le jour posé (rendu, puis arrêt du
    // défilement — defilementArrete plus bas), on mesure les lignes pour CE
    // jour seulement (bulles des autres jours retirées de la mise en page le
    // temps de la mesure, cartes à leur largeur du jour), puis on fige ces
    // hauteurs sur la grille elle-même (gridTemplateRows en px). Pendant le
    // glissement suivant, rien ne peut plus pousser une ligne : les bulles du
    // jour qui arrive remplissent leur piste, texte coupé si besoin
    // (.grille.hauteurs-figees, style.css), jusqu'au prochain arrêt.
    // `cleHauteursJour` évite de remesurer quand le jour n'a pas changé (un
    // défilement vertical passe aussi par defilementArrete).
    var cleHauteursJour = null;
    function figerHauteursJourMobile(forcer) {
      if (!enModeJourMobile) return;
      // Largeurs (donc texte) recalculées à chaque fixation, même au même
      // endroit (suite 37) : un aller-retour sans lever le doigt a pu
      // afficher des cartes de l'autre jour, figées à leur largeur d'entrée.
      ajusterLargeurBullesJourMobile();
      var cle = Math.round(scroller.scrollLeft) + "|" + scroller.clientWidth;
      if (!forcer && cle === cleHauteursJour) return;
      cleHauteursJour = cle;
      var grilles = [grilleEntete, grilleCorps];
      var horsJour = [];
      // Hors du jour posé : carte masquée, ou simple lamelle de moins de
      // 30 px à l'écran (sous zoom, l'aimantation laisse voir quelques px de
      // la veille ; une carte si étroite, tout en padding, compterait une
      // hauteur absurde, une ligne par mot).
      var zoom = (niveauZoomPlanning / 100) || 1;
      grilles.forEach(function (g) {
        g.classList.remove("hauteurs-figees");
        g.style.gridTemplateRows = "";
        g.querySelectorAll(".bulle").forEach(function (b) {
          var carte = b.querySelector(".b-carte");
          if (carte && (carte.style.display === "none" || b.classList.contains("jour-voisin") || parseFloat(carte.style.width) * zoom < 30)) { b.style.display = "none"; horsJour.push(b); }
        });
      });
      // Lecture groupée : une seule mise en page. getComputedStyle rend les
      // pistes RÉSOLUES (« 41px 55px 30px… »), dans le repère de la grille
      // elle-même — zoom compris, puisqu'on les lui rend telles quelles.
      var pistes = grilles.map(function (g) { return getComputedStyle(g).gridTemplateRows; });
      horsJour.forEach(function (b) { b.style.display = ""; });
      grilles.forEach(function (g, i) {
        if (!pistes[i] || pistes[i] === "none") return;
        g.style.gridTemplateRows = pistes[i];
        g.classList.add("hauteurs-figees");
      });
    }
    // rAF-throttlé : "scroll" peut se déclencher plusieurs fois par frame
    // pendant un glissé — recalculer pour toutes les bulles à chaque
    // événement brut serait inutilement coûteux.
    // Un appel « complet » (aperçu d'une poignée) l'emporte sur un appel de
    // glissement tombé dans la même image.
    var rafAjustLargeurBulles = null, rafAjustComplet = false;
    function planifierAjustLargeurBulles(pendantGlissement) {
      if (!pendantGlissement) rafAjustComplet = true;
      if (rafAjustLargeurBulles) return;
      rafAjustLargeurBulles = requestAnimationFrame(function () {
        var complet = rafAjustComplet;
        rafAjustLargeurBulles = null; rafAjustComplet = false;
        ajusterLargeurBullesJourMobile(!complet);
      });
    }
    scroller.addEventListener("scroll", function () { enteteScroll.scrollLeft = scroller.scrollLeft; planifierAjustLargeurBulles(true); });
    reajusterBullesJourMobile = function () { planifierAjustLargeurBulles(false); };
    // Round du 23.09.2026 (suite 5) — Lionel : « Swipper un vendredi permet
    // de passer au lundi de la semaine suivante ? ». Réattaché à chaque
    // rendu (comme le mirroir de scroll juste au-dessus) puisque .scroller
    // est recréé à chaque fois. On ne s'appuie PAS sur le rebond élastique
    // natif du défilement (scrollLeft qui dépasserait 0/scrollWidth-
    // clientWidth pendant l'effet ressort iOS) : ce rebond n'existe pas
    // partout (Android/Chrome "colle" simplement au bord, sans dépassement
    // mesurable), ce qui laisserait le geste sans effet sur une partie des
    // téléphones. On mesure donc le déplacement RÉEL du doigt (touchmove),
    // indépendamment de scrollLeft, et on ne déclenche le changement de
    // semaine qu'au relâchement (touchend) si le doigt a continué à glisser
    // d'au moins seuilBordSemaine px au-delà du bord ALORS QUE le défilement,
    // lui, est déjà à sa butée — identique sur les 2 plateformes.
    //
    // Round du 24.09.2026 — Lionel : « le changement de semaine en suivant
    // gauche/droite ne fonctionne pas sur ordinateur et tablettes,
    // fonctionne sur mobile. » Ce détecteur était réservé au mode "1 jour"
    // mobile (enModeJourMobile) : le raisonnement de la suite ×11 ci-dessous
    // supposait qu'un écran plus large que 600px (tablette/desktop) dispose
    // toujours d'une molette/trackpad pour l'équivalent — faux pour une
    // tablette purement tactile (iPad sans trackpad, écran tactile de
    // bureau) : là, un doigt qui glisse ne déclenche aucun événement
    // "wheel", et le swipe restait donc sans effet en vue "1 semaine"/"2
    // semaines". Le détecteur tactile n'a lui-même aucune raison d'être
    // limité au mode "1 jour" : il ne regarde que le déplacement réel du
    // doigt et la butée de scroll, peu importe combien de jours sont
    // affichés — actif dans tous les modes désormais, en plus (jamais à la
    // place) du détecteur "wheel" ci-dessous qui reste nécessaire pour les
    // dispositifs à souris/trackpad sans écran tactile.
    //
    // Garde-fou "en-glissement" (ajouté avec cette généralisation) : en vue
    // "1 semaine"/"2 semaines", une tâche peut s'étaler sur plusieurs jours
    // ENTIERS déjà tous visibles à l'écran (donc maxScroll=0, "à la butée"
    // en permanence des DEUX côtés à la fois) — un glissé de sélection
    // multi-jours tout à fait normal (ex. Lundi -> Vendredi pour poser une
    // tâche sur la semaine) dépasse alors très facilement seuilBordSemaine
    // en déplacement horizontal brut, et aurait donc, sans ce garde-fou,
    // déclenché un changement de semaine EN PLUS de la sélection au
    // relâchement. document.body.classList "en-glissement" est déjà posée
    // par cablerAjoutCellule/onPointerDownGroupeSelection/cablerPoigneeRedim
    // dès qu'un geste est reconnu comme une sélection/un redimensionnement/
    // un déplacement de bulle (jamais pour un panoramique — cf. leurs
    // commentaires respectifs) : un signal déjà fiable pour distinguer "ce
    // doigt est en train de faire autre chose" d'un vrai swipe de
    // navigation, sans dupliquer leur propre logique de détection ici.
    //
    // toucheDebutY/toucheAxe (round du 25.09.2026, suite 26) — Lionel :
    // « Améliore le défilement tactile latéral et horizontal pour qu'il
    // n'agisse que dans un sens à la fois. » Même règle que le défilement
    // manuel (axeDuGeste, core.js, décidé une fois le doigt parti de
    // SEUIL_DEFILEMENT) : un geste reconnu VERTICAL ne peut plus changer de
    // semaine, même si le doigt a dérivé de plus de seuilBordSemaine de
    // côté pendant un long défilement vers le bas.
    var seuilBordSemaine = 46, toucheDebutX = null, toucheDebutY = null, toucheAxe = null, toucheBord = null;
    scroller.addEventListener("touchstart", function (e) {
      toucheDebutX = (e.touches.length === 1) ? e.touches[0].clientX : null;
      toucheDebutY = (e.touches.length === 1) ? e.touches[0].clientY : null;
      toucheAxe = null;
      toucheBord = null;
    }, { passive: true });
    scroller.addEventListener("touchmove", function (e) {
      // Vue "1 jour" téléphone : plus de bord de semaine à franchir, le
      // défilement est continu (round du 24.09.2026, suite 6 — cf.
      // fenetreLabGs, core.js) ; ce détecteur ne sert plus qu'aux autres vues.
      if (enModeJourMobile) return;
      if (toucheDebutX === null || e.touches.length !== 1) return;
      if (document.body.classList.contains("en-glissement")) { toucheBord = null; return; }
      var dx = e.touches[0].clientX - toucheDebutX;
      var dy = e.touches[0].clientY - toucheDebutY;
      if (!toucheAxe && Math.abs(dx) + Math.abs(dy) > SEUIL_DEFILEMENT) toucheAxe = axeDuGeste(dx, dy);
      if (toucheAxe !== "x") { toucheBord = null; return; }
      var maxScroll = scroller.scrollWidth - scroller.clientWidth;
      // "<= 1"/">= maxScroll - 1", pas une comparaison stricte à 0/maxScroll :
      // decalerSurColonne_ (plus bas) peut caler le repos sur 1px près de la
      // butée réelle (arrondi Math.round sur des rects sub-pixel) — trouvé en
      // testant ce round-ci (le seuil strict à 0 ratait systématiquement le
      // retour en arrière depuis le tout premier jour d'une semaine).
      if (scroller.scrollLeft <= 1 && dx > seuilBordSemaine) toucheBord = "debut";
      else if (scroller.scrollLeft >= maxScroll - 1 && dx < -seuilBordSemaine) toucheBord = "fin";
    }, { passive: true });
    scroller.addEventListener("touchend", function () {
      if (document.body.classList.contains("en-glissement")) { toucheDebutX = null; toucheBord = null; return; }
      if (toucheBord === "debut") naviguerSemaineDepuisBordJour(-1);
      else if (toucheBord === "fin") naviguerSemaineDepuisBordJour(1);
      toucheDebutX = null; toucheDebutY = null; toucheAxe = null; toucheBord = null;
    }, { passive: true });

    // Round du 23.09.2026 (suite ×11) — Lionel : « L'action de swiper d'une
    // semaine à l'autre est intéressante et pourrait être portée aux
    // versions tablette et desktop. » Équivalent du détecteur tactile
    // ci-dessus pour un dispositif à molette/trackpad — désormais actif EN
    // PLUS du détecteur tactile (round du 24.09.2026, cf. son commentaire
    // plus haut), pas à sa place : un ordinateur/une tablette à trackpad
    // profite de celui-ci, un écran tactile sans trackpad profite de
    // l'autre, les deux peuvent coexister sur un même appareil hybride sans
    // se marcher dessus (deux gestes différents). Toujours inerte en mode
    // "1 jour" mobile (enModeJourMobile→return) : là, seul le détecteur
    // tactile agit. deltaX (molette horizontale native, trackpad) OU deltaY
    // avec Maj enfoncée (convention historique du défilement horizontal à
    // la molette verticale, cf. la plupart des tableurs/calendriers web) —
    // jamais les deux à la fois : on prend le plus significatif des deux
    // pour éviter qu'un simple défilement vertical de la page (deltaY sans
    // Maj) ne déclenche quoi que ce soit ici.
    // Cumul (accumulMolette) plutôt qu'un seul événement : un trackpad émet
    // de nombreux petits événements "wheel" pendant un seul geste physique
    // (parfois quelques unités chacun) — un seuil unitaire les raterait
    // presque tous. Remis à zéro après un silence (resetAccumulMolette,
    // 400ms) ou dès que le défilement s'écarte du bord concerné — un simple
    // aller-retour de la molette sans rester au bord ne doit rien
    // déclencher.
    //
    // Round du 24.09.2026 — Lionel : « ne fonctionne pas sur ordinateur ».
    // e.preventDefault() se déclenchait auparavant seulement au moment du
    // franchissement du seuil, pas à chaque événement "wheel" reçu à la
    // butée pendant l'accumulation. Or Chrome/Edge interprètent un swipe
    // horizontal à 2 doigts qui dépasse la butée d'un conteneur SANS
    // preventDefault() comme un geste de navigation d'historique (retour
    // page précédente/suivante, avec son animation) — le trackpad ne
    // produit alors plus d'événements "wheel" pour la suite du geste,
    // l'accumulation n'atteint jamais seuilMolette et la semaine ne change
    // jamais (symptôme exact de Lionel : ça ne marche que sur mobile, où le
    // détecteur tactile ci-dessus n'a pas ce problème). Corrigé en appelant
    // preventDefault() dès qu'on est à la butée dans le sens du geste,
    // avant même de savoir si le seuil sera atteint — sans incidence sur le
    // défilement normal (loin de la butée, on retourne avant d'y arriver).
    // Complété côté CSS par overscroll-behavior-x:contain sur .scroller
    // (cf. style.css) en filet de sécurité supplémentaire.
    var seuilMolette = 60, accumulMolette = 0, resetAccumulMolette = null;
    scroller.addEventListener("wheel", function (e) {
      if (enModeJourMobile) return;
      var dx = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
      if (!dx) return;
      var maxScrollW = scroller.scrollWidth - scroller.clientWidth;
      var auDebut = scroller.scrollLeft <= 1, aLaFin = scroller.scrollLeft >= maxScrollW - 1;
      if (dx < 0 ? !auDebut : !aLaFin) { accumulMolette = 0; return; }
      e.preventDefault();
      accumulMolette += dx;
      clearTimeout(resetAccumulMolette);
      resetAccumulMolette = setTimeout(function () { accumulMolette = 0; }, 400);
      if (accumulMolette <= -seuilMolette) { accumulMolette = 0; naviguerSemaineDepuisBordJour(-1); }
      else if (accumulMolette >= seuilMolette) { accumulMolette = 0; naviguerSemaineDepuisBordJour(1); }
    }, { passive: false });

    function poserDans(cibleGrille) {
      return function (el, col, row, colSpan, rowSpan) {
        el.style.gridColumn = colSpan ? (col + " / span " + colSpan) : String(col);
        el.style.gridRow = rowSpan ? (row + " / span " + rowSpan) : String(row);
        cibleGrille.appendChild(el);
      };
    }
    function poserPleineLargeurDans(cibleGrille) {
      return function (el, ligne) {
        el.style.gridColumn = "1 / -1";
        el.style.gridRow = String(ligne);
        cibleGrille.appendChild(el);
      };
    }
    // poser()/poserPleineLargeur() ci-dessous visent grilleEntete jusqu'à la
    // ligne Notes ; ils sont ensuite RÉASSIGNÉS sur grilleCorps (cf. plus
    // bas, juste avant ligneSection) — ligneSection/ligneGroupePersonnesCompact
    // les référencent par fermeture (closure) et voient donc bien la valeur
    // en vigueur au moment de leur APPEL, pas de leur définition.
    var poser = poserDans(grilleEntete);
    var poserPleineLargeur = poserPleineLargeurDans(grilleEntete);

    // §87 (round du 17.09.2026, suite×2) — la ligne d'en-tête "Aujourd'hui/
    // 2 semaines/‹ Semaine N ›" qui vivait ici (coinNav + navSemaine, cf.
    // leur historique dans une version antérieure du fichier) disparaît :
    // Lionel, une fois cette navigation dupliquée dans #legendeBarre (cf.
    // htmlPagePlanning/cablerPagePlanning — ‹, la case "Sem. N", ›,
    // Aujourd'hui, 2 semaines, entre le zoom et le chantier) : « on enlève
    // la première ligne du tableau qui ne sert plus ». row démarre donc
    // directement sur la ligne des jours (avant : row 2, décalée d'une ligne
    // par coinNav/navSemaine).
    var row = 1;

    var aujIso = etat.aujourdhui;
    // Cellule coin de la ligne des jours : vide depuis le §83 (round du
    // 16.09.2026, encore un autre, suite×7) — Annuler/Refaire, qui
    // l'occupaient depuis le round précédent, ont rejoint la nouvelle barre
    // d'outils fixe sous les onglets (cf. son historique plus haut). §89
    // (round du 17.09.2026, suite×4) — Lionel : le mois n'est plus affiché
    // nulle part depuis le §87 (cf. le commentaire de moisAffichesCoin) ;
    // posé ici, dans cette case restée vide depuis le §83.
    var coin = document.createElement("div"); coin.className = "th coin"; coin.textContent = moisAffichesCoin(n); poser(coin, 1, row);
    for (var gi = 0; gi < n; gi++) {
      var th = document.createElement("div");
      var estAuj = isoDeGi(gi) === aujIso;
      // En-tête de jour : simple repère (jour + date), plus cliquable depuis
      // le retrait du décalage en masse (demande de Lionel — la sélection
      // multiple de bulles de V3 couvre désormais cet usage, cf.
      // FRONTEND-CHANGELOG.md §5).
      th.className = "th" + (gi > 0 && gi % 5 === 0 ? " sem-frontiere" : "")
        + (gi > 0 && gi % 5 !== 0 ? " jour-frontiere" : "")
        + (estAuj ? " today" : "");
      th.dataset.gi = gi;
      var infoJour = libelleJourGi(gi);
      // Durée de travail du jour (round du 25.09.2026, suite 27 — page
      // Horaires) sous la date, au format de la feuille PMB (8.75). Les
      // horaires eux-mêmes vont dans la ligne « M | A » juste en dessous.
      var horaireJour = horaireDuJour(isoDeGi(gi));
      var dateHTML = '<span class="th-date">' + infoJour.jour + "</span>" +
        (horaireJour ? '<span class="th-duree" title="Durée de travail (pause déduite)">' + formatDuree(horaireJour.duree) + " h</span>" : "");
      var ferJour = feriePourJour(gi);
      if (ferJour) {
        th.style.background = hexToRgba(ferJour.couleur, .55);
        th.title = ferJour.label;
        th.innerHTML = JOURS[gi % 5] + dateHTML + '<span class="th-ferie-label">' + esc(ferJour.label) + "</span>";
      } else {
        th.innerHTML = JOURS[gi % 5] + dateHTML;
      }
      poser(th, colonneGrille(gi), row, colsParJour());
      if (afficherWeekends && (gi + 1) % 5 === 0) {
        var semIdxTh = Math.floor(gi / 5);
        [0, 1].forEach(function (j) {
          var giWE = giWeekend(semIdxTh, j);
          var thWE = document.createElement("div");
          thWE.className = "th th-weekend";
          thWE.dataset.gi = giWE;
          var infoWE = libelleJourGi(giWE);
          thWE.innerHTML = JOURS_WEEKEND[j] + '<span class="th-date">' + infoWE.jour + "</span>";
          poser(thWE, colonneGrille(giWE), row);
        });
      }
    }
    row++;
    // Fine ligne d'en-tête "M | A" sous chaque jour. Sans elle,
    // rien ne dirait laquelle des deux colonnes d'un jour est le matin — le
    // reste de la grille ne porte plus l'étiquette "Matin"/"Après-midi",
    // puisque les deux demi-journées partagent désormais une seule ligne.
    var coinDemi = document.createElement("div");
    coinDemi.className = "th coin th-demi";
    poser(coinDemi, 1, row);
    for (var giD = 0; giD < n; giD++) {
      DEMIS.forEach(function (demi) {
        var thD = document.createElement("div");
        thD.className = "th th-demi" + (demi === "aprem" ? " th-demi-aprem" : "")
          + (demi === "matin" && giD > 0 && giD % 5 === 0 ? " sem-frontiere" : "")
          + (demi === "matin" && giD > 0 && giD % 5 !== 0 ? " jour-frontiere" : "");
        // Horaires dans la ligne « M | A » (suite 27) — Lionel : « Dans la
        // ligne M|A, mais on peut afficher l'horaire complet » : l'horaire
        // du matin sous M, celui de l'après-midi sous A (« — » quand le
        // jour ne travaille que le matin). Sans horaire (week-end, période
        // non saisie) : les lettres M / A comme avant.
        var horaireD = horaireDuJour(isoDeGi(giD));
        var texteDemi = horaireD ? (demi === "matin" ? horaireD.matin : (horaireD.aprem || "—")) : null;
        if (texteDemi) {
          thD.classList.add("th-horaire");
          thD.innerHTML = esc(texteDemi).replace("–", "–<wbr>");
          thD.title = (demi === "matin" ? "Matin " : "Après-midi ") + (texteDemi === "—" ? "non travaillé" : texteDemi);
        } else {
          thD.textContent = demi === "matin" ? "M" : "A";
          thD.title = demi === "matin" ? "Matin" : "Après-midi";
        }
        poser(thD, colonneDemi(giD, demi), row);
      });
      if (afficherWeekends && (giD + 1) % 5 === 0) {
        var semIdxD = Math.floor(giD / 5);
        [0, 1].forEach(function (j) {
          var vide = document.createElement("div");
          vide.className = "th th-demi th-weekend";
          poser(vide, colonneGrille(giWeekend(semIdxD, j)), row);
        });
      }
    }
    row++;

    [["jalon", JALONS, "Jalons"], ["note", NOTES, "Notes"]].forEach(function (spec) {
      var kind = spec[0], liste = spec[1], label = spec[2];
      // repliee (round du 16.09.2026, contrôle déplacé au §82 dans
      // .controles-affichage, icônes au §83) : Lionel, « avoir la
      // possibilité de masquer jalons et note ». §84 (round du 16.09.2026,
      // encore un autre, suite×8) — retour de Lionel : « les ligne
      // désactivées doivent etre totalement masqué et disparaitre du
      // planning, pas grisée ». La ligne ne réservait jusqu'ici qu'une seule
      // piste vide (nbPistes=1, sans aucune cellule de fond puisque la
      // boucle de pose plus bas tournait 0 fois) — sans cellule pour
      // couvrir ce fond, c'est le gris de `.grille { background:
      // var(--border) }` qui apparaissait tel quel sur toute la largeur,
      // lu comme "grisé" plutôt que "disparu". `return` ici évite
      // totalement de poser le libellé ET d'avancer `row` : la ligne
      // n'existe simplement plus dans cette grille, exactement comme les
      // lignes Personnel/Intervenants repliées (cf. plus bas,
      // ligneGroupePersonnes non appelée du tout quand repliée).
      var repliee = kind === "jalon" ? replierJalons : replierNotes;
      if (repliee) return;
      var visibles = liste.filter(function (it) { return giVisible(it.giDebut, n); });
      // Pistes à la DEMI-JOURNÉE (round du 25.09.2026, suite 35). Lionel :
      // « Comportement anormal des notes qui se trouvent sur des lignes
      // différentes sur le planning. » Les notes et jalons se posent pourtant
      // au demi-slot près (colonneEtSpanDemi, plus bas) depuis le §47, mais
      // leurs pistes étaient encore attribuées À LA JOURNÉE (ancien
      // assignerPistes) : « Remorque plateau » (mercredi matin) et « Tri
      // déchets dépôt » (mercredi après-midi) ne se chevauchent pas, et
      // tombaient pourtant sur 2 lignes l'une sous l'autre, en escalier.
      // Même empilement que les lignes de personnes en compact : deux notes ne
      // se gênent que si elles occupent une même demi-journée.
      var nbPistes = Math.max(1, assignerPistesCompact(visibles));
      // Titre de ligne ("Jalons"/"Notes") : retiré le 02.09.2026 (retour de
      // Lionel : "on peut réduire les hauteurs de ligne en enlevant... les
      // titres notes et jalons. on a déjà une légende"), puis REMIS le
      // 12.09.2026 (nouveau retour de Lionel : "ajouté les libellés jalon et
      // note dans la colonne de gauche" — sans repère textuel la colonne de
      // gauche ne dit plus quelle ligne est quoi une fois la légende hors du
      // premier écran). `title` conservé en plus pour le survol. Plus de
      // bouton de repli ici depuis le §82 (cf. .controles-affichage) : le
      // libellé redevient seul, comme avant le §80.
      var lbl = document.createElement("div");
      lbl.className = "lbl lbl-speciale";
      lbl.innerHTML = "<b>" + esc(label) + "</b>";
      lbl.title = label;
      poser(lbl, 1, row, null, nbPistes);
      for (var g = 0; g < n; g++) {
        // Jalons et notes restent des objets à la JOURNÉE (ligne 4 et 5 de la
        // feuille, jamais scindées en demi-journées) : en compact leur case
        // couvre donc les 2 colonnes du jour.
        poser(creerCelluleFond(kind, g), colonneGrille(g), row, colsParJour(), nbPistes);
        if (afficherWeekends && (g + 1) % 5 === 0) {
          var semG = Math.floor(g / 5);
          [0, 1].forEach(function (j) {
            poser(creerCelluleFond(kind, giWeekend(semG, j)), colonneGrille(giWeekend(semG, j)), row, null, nbPistes);
          });
        }
      }
      visibles.forEach(function (it) {
        var b = bulleEl(it);
        var dureeVisible = Math.min(it.duree, n - it.giDebut);
        // Bulle d'une DEMI-JOURNÉE (round du 02.09.2026, étendu aux jalons le
        // 08.09.2026 — §47 du FRONTEND-CHANGELOG : jalon et note partagent
        // maintenant demiDebut/demiFin et ce même rendu) :
        // chaque jour a 2 colonnes, l'entrée se pose exactement sur la bonne
        // (colonneEtSpanDemi), largeur naturelle. Les classes .bulle-demi-*
        // ne portent plus de géométrie depuis le retrait du mode classique
        // (suite 24, cf. core.js) : elles restent de simples repères, posés
        // sur les bulles d'UN SEUL jour ; pour une bulle de plusieurs jours,
        // c'est le titre (infobulle) qui signale le bord en demi-journée.
        var demiDebutIt = it.demiDebut || null, demiFinIt = it.demiFin || null;
        if (it.duree === 1 && (demiDebutIt === "matin" || demiDebutIt === "aprem")) {
          b.classList.add("bulle-demi", demiDebutIt === "matin" ? "bulle-demi-matin" : "bulle-demi-aprem");
          b.title = (b.title ? b.title + " — " : "") + (demiDebutIt === "matin" ? "Matin" : "Après-midi");
        } else if (it.duree > 1 && (demiDebutIt === "aprem" || demiFinIt === "matin")) {
          var bouts = [];
          if (demiDebutIt === "aprem") bouts.push("commence l'après-midi");
          if (demiFinIt === "matin") bouts.push("finit le matin");
          b.title = (b.title ? b.title + " — " : "") + bouts.join(", ");
        }
        // .demi-aprem (round du 03.09.2026, suite) : quelle que soit la durée,
        // colonneEtSpanDemi() pose le bord GAUCHE de la bulle sur la colonne
        // "aprem" dès que demiDebutIt === "aprem" (seul ce bord-là compte pour
        // la colonne de départ, cf. sa définition) — cette bulle a donc besoin
        // du même empiètement anti-trait que .cell.cell-aprem ci-dessus.
        if (demiDebutIt === "aprem") b.classList.add("demi-aprem");
        var csStatique = colonneEtSpanDemi(it.giDebut, dureeVisible, demiDebutIt, demiFinIt);
        // .une-case (suite 25) : poignées étroites, cf. son commentaire CSS.
        if (csStatique[1] === 1) b.classList.add("une-case");
        poser(b, csStatique[0], row + it._piste, csStatique[1]);
      });
      row += nbPistes;
    });

    // ---- Bascule vers le CORPS de la grille (Personnel/Intervenants) : à
    // partir d'ici, poser()/poserPleineLargeur() visent grilleCorps — une
    // grille CSS séparée qui, elle, défile normalement sous l'en-tête figé
    // ci-dessus (cf. son commentaire plus haut) — row repart à 1, propre à
    // cette grille.
    poser = poserDans(grilleCorps);
    poserPleineLargeur = poserPleineLargeurDans(grilleCorps);
    row = 1;

    // Round du 23.09.2026 (suite ×10) — repères invisibles pour le
    // scroll-snap "1 jour" mobile (cf. .snap-jour/.scroller.snap-jour-mobile
    // dans style.css pour le détail du mécanisme). Un par jour, posé ici
    // dans grilleCorps — la seule des 2 grilles réellement DANS .scroller,
    // l'élément qui porte le scroll-snap (grilleEntete est dans l'en-tête
    // figée séparée, cf. son historique plus haut) — plutôt que réutiliser
    // une case Personnel/Intervenants existante : celle-ci peut disparaître
    // si Lionel masque la section correspondante depuis la barre d'outils,
    // ce qui ferait disparaître le point d'ancrage avec elle. row=1 (fixe,
    // sans incrémenter la variable row utilisée par les sections
    // ci-dessous) et hauteur 0 (cf. CSS) : ne pousse ni ne recouvre rien,
    // seule sa position/largeur de colonne (colonneGrille/colsParJour)
    // compte pour le calcul du point d'ancrage. Même boucle et même
    // traitement des colonnes week-end que l'en-tête des jours plus haut
    // (poser(th, colonneGrille(gi), row, colsParJour())/thWE), pour rester
    // cohérent avec le découpage réel des colonnes.
    if (enModeJourMobile) {
      for (var giSnap = 0; giSnap < n; giSnap++) {
        var repereJour = document.createElement("div");
        repereJour.className = "snap-jour";
        poser(repereJour, colonneGrille(giSnap), 1, colsParJour());
        if (afficherWeekends && (giSnap + 1) % 5 === 0) {
          var semSnap = Math.floor(giSnap / 5);
          [0, 1].forEach(function (jSnap) {
            var repereWE = document.createElement("div");
            repereWE.className = "snap-jour";
            poser(repereWE, colonneGrille(giWeekend(semSnap, jSnap)), 1);
          });
        }
      }
    }

    function ligneSection(cle, texte) {
      // §82 : le masquage/affichage de cette section ne se pilote plus
      // depuis une flèche posée ici (cf. .controles-affichage, regroupé dans
      // la barre légende/imprimer) — cette ligne ne garde donc plus que son
      // libellé. §85 (round du 17.09.2026) — Lionel : « on peut aussi enlever
      // le "+" des lignes personnel et intervenant » : le bouton .btn-plage-
      // ligne disparaît d'ici, remplacé par l'icône "ligne+" de la barre
      // d'outils (cf. #btnAjoutLigne dans htmlPagePlanning/cablerPagePlanning),
      // qui ouvre le même ouvrirAjoutPersonne(sousTraitant) — ex-.btn-plage-
      // ligne/.section-row-sticky gap conservés tels quels pour ne pas avoir à
      // toucher leur CSS, simplement plus jamais peuplés d'un bouton ici.
      var lg = document.createElement("div");
      // Round du 23.09.2026 (suite ×3) — modificateur .section-row-<cle>
      // pour un fond réglable indépendamment par section (cf. style.css et
      // js/page-couleurs.js) : "personnel" ou "intervenants", exactement
      // les 2 valeurs passées à ligneSection() plus bas.
      lg.className = "section-row section-row-" + cle;
      lg.innerHTML =
        '<div class="section-row-sticky">' +
        '<span class="section-label">' + esc(texte) + '</span>' +
        '</div>';
      poserPleineLargeur(lg, row);
      row++;
    }

    // ---- Une seule ligne par personne : matin et après-midi occupent deux
    // colonnes voisines du même jour. -----------------------------------
    //
    // §49 (08.09.2026, suite, encore) — Lionel : « 1 tâche ne peut pas être
    // mise sur 2 case, elle s'étend de 1 jour (de 1 a 3, 5 ou 7 case) », puis
    // « on reste sur la seule vue compact qui devient la standard ». Le §48
    // avait tenté de résoudre le symptôme (bulles "découpées") en FUSIONNANT
    // au RENDU plusieurs items compact séparés (construireRunsCompacts,
    // data-membres/data-slots) — un pansement qui laissait la vraie cause
    // intacte : une tâche/absence portait un seul champ `demi` FIXE pour
    // toute sa durée, donc "matin+aprem jour1, matin jour2" restait
    // structurellement 2 items séparés, glués visuellement après coup
    // seulement quand ils se touchaient — jamais redimensionnables/
    // déplaçables à la demi-journée près (d'où le "de 1 a 3, 5 ou 7 case",
    // toujours par saut de 1 jour entier).
    //
    // Correctif de FOND (§49) : une tâche/absence porte désormais
    // demiDebut/demiFin PAR BORD, exactement comme un jalon ou une note (cf.
    // itemPlageTache et la fusion par demi-slot dans construireVueDepuisCache)
    // — un item EST déjà, nativement, sa propre plage continue. Le rendu
    // redevient donc aussi simple que celui des jalons/notes : 1 item = 1
    // bulle DOM, positionnée par colonneEtSpanDemi (déjà partagée avec eux) ;
    // plus besoin de fusionner quoi que ce soit après coup — construireRunsCompacts,
    // data-membres et data-slots disparaissent avec lui. Semaine/week-end :
    // case isolée à part (comme avant), toujours 1 seul demi-slot ("matin").
    function ligneGroupePersonnesCompact(groupe) {
      groupe.forEach(function (p) {
        var itemsLigne = TACHES.filter(function (it) { return it.personneId === p.id && giVisible(it.giDebut, n); });
        var nbPistes = Math.max(1, assignerPistesCompact(itemsLigne));
        var lbl = document.createElement("div");
        lbl.className = "lbl lbl-compacte";
        // Ligne d'équipe (nom, membres, ▸/▾) ou membre d'une équipe
        // (décalé sous elle) — suite 33, cf. js/equipes.js.
        // nomSurDeuxLignes (suite 35) : césure permise après « / » ; nom
        // complet au survol s'il est coupé après 2 lignes.
        lbl.innerHTML = "<b>" + nomSurDeuxLignes(p.nom) + "</b>";
        lbl.title = p.nom;
        remplirEtiquetteEquipe(lbl, p);
        poser(lbl, 1, row, null, nbPistes);
        for (var gi4 = 0; gi4 < n; gi4++) {
          DEMIS.forEach(function (demi) {
            var c = creerCell(gi4, { personne: p.id, demi: demi });
            if (demi === "aprem") c.classList.add("cell-aprem");
            // Trait de séparation entre deux JOURS (retour de Lionel) : porté
            // par la colonne du matin, sauf en début de semaine où le trait de
            // semaine, plus fort, prend déjà le relais (posé par creerCell).
            else if (gi4 > 0 && gi4 % 5 !== 0) c.classList.add("jour-frontiere");
            poser(c, colonneDemi(gi4, demi), row, null, nbPistes);
          });
          if (afficherWeekends && (gi4 + 1) % 5 === 0) {
            var semGi4 = Math.floor(gi4 / 5);
            [0, 1].forEach(function (j) {
              // Une seule cellule serveur pour le week-end, portée par
              // "matin" — cf. construireVueDepuisCache, items week-end posés
              // avec demiDebut=demiFin="matin".
              poser(creerCell(giWeekend(semGi4, j), { personne: p.id, demi: "matin" }), colonneGrille(giWeekend(semGi4, j)), row, null, nbPistes);
            });
          }
        }
        itemsLigne.forEach(function (it) {
          var b = bulleEl(it);
          if (estGiWeekend(it.giDebut)) { poser(b, colonneGrille(it.giDebut), row + it._piste, 1); return; }
          var dureeVisible = Math.max(1, Math.min(it.duree, n - it.giDebut));
          var demiDebutIt = it.demiDebut || null, demiFinIt = it.demiFin || null;
          // .demi-aprem (cf. son commentaire CSS, partagé avec le rendu
          // jalon/note) : même empiètement anti-trait quand la bulle démarre
          // sur la colonne "aprem".
          if (demiDebutIt === "aprem") b.classList.add("demi-aprem");
          var cs = colonneEtSpanDemi(it.giDebut, dureeVisible, demiDebutIt, demiFinIt);
          if (cs[1] === 1) b.classList.add("une-case"); // cf. .une-case (suite 25)
          poser(b, cs[0], row + it._piste, cs[1]);
        });
        row += nbPistes;
      });
    }
    function ligneGroupePersonnes(groupe) { ligneGroupePersonnesCompact(groupe); }

    // Suite 33 : Personnel dans l'ordre des équipes (chaque équipe suivie
    // de ses membres, les membres repliés sans rien à eux cachés) — cf.
    // personnesAffichees, js/equipes.js.
    var groupePersonnel = personnesAffichees("personnel");
    var groupeIntervenants = personnesAffichees("sous-traitant");

    // §86 (round du 17.09.2026, suite) — Lionel : « les lignes de séparation
    // "personnel" et "intervenant" doivent aussi être masquées quand le
    // groupe correspondant est masqué ». Jusqu'ici seule ligneGroupePersonnes
    // (les personnes elles-mêmes) était sautée quand repliée — ligneSection
    // (le libellé "PERSONNEL"/"INTERVENANTS", avec son .section-row et le
    // trait `border-bottom` qui le souligne) restait posée dans tous les cas,
    // comme un en-tête. Même principe que le §84 (Jalons/Notes) : la ligne
    // repliée ne doit plus exister DU TOUT dans la grille, libellé compris —
    // ligneSection() rejoint donc la même condition que le groupe qu'elle
    // annonce, au lieu d'être appelée inconditionnellement juste avant.
    if (!replierSectionPersonnel) {
      ligneSection("personnel", "Personnel");
      ligneGroupePersonnes(groupePersonnel);
    }
    if (!replierSectionIntervenants) {
      ligneSection("intervenants", "Intervenants");
      ligneGroupePersonnes(groupeIntervenants);
    }

    // Round du 23.09.2026 (suite 4, puis suite 5) — cibleApresRendu (cf. son
    // commentaire dans js/core.js) recale le défilement horizontal plutôt
    // que de restaurer scrollLeftPrecedent quand cette ancienne valeur n'a
    // plus de sens : soit parce que la largeur de colonnes vient de changer
    // (bascule 1 jour/1 semaine, ou tout premier rendu où elle n'existe
    // simplement pas), soit parce qu'elle correspond à la butée de
    // l'ANCIENNE semaine juste avant un changement de semaine déclenché par
    // un swipe au bord (cf. naviguerSemaineDepuisBordJour) — réappliquée
    // telle quelle à la nouvelle grille, elle ne tomberait pas forcément sur
    // le bon jour. "aujourdhui" : colonne .th.today (posée plus haut, boucle
    // des en-têtes de jour), seulement en mode "1 jour" (soustraction de
    // 116px, largeur de la colonne d'étiquette figée à gauche, cf.
    // commentaire du gabarit, pour que le jour visé remplisse l'écran juste
    // à côté d'elle). "debut"/"fin" : premier/dernier jour affiché (même
    // calcul que .th.today mais sur le premier/dernier ".th:not(.coin):not(.th-demi)"
    // du DOM — ":not(.th-demi)" exclu la fine ligne d'en-tête "M | A" du mode
    // compact, elle aussi construite en ".th" mais APRÈS la ligne des jours
    // (donc son DERNIER élément serait sinon pris à tort pour "fin"
    // — bug trouvé en testant ce round-ci). .th-weekend inclus, donc "fin"
    // tombe sur dimanche plutôt que vendredi quand les week-ends sont
    // affichés. En dehors de ces cas (rendu normal, ex. après édition d'une
    // tâche, ou navigation par les flèches ‹ › qui n'a jamais fixé
    // cibleApresRendu), la position de défilement de l'utilisateur est
    // préservée comme avant.
    var cibleScrollLeft = 0;
    function decalerSurColonne_(th) {
      if (!th) return 0;
      var rGrilleEntete = grilleEntete.getBoundingClientRect(), rTh = th.getBoundingClientRect();
      return Math.max(0, Math.round((rTh.left - rGrilleEntete.left) - LN));
    }
    if (enModeJourMobile) {
      // Round du 24.09.2026 (suite 6) — vue "1 jour" : TOUJOURS calé sur le
      // jour affiché (jourMobileCourant, core.js), quel que soit le motif du
      // rendu — après un recentrage de la fenêtre (même jour, nouvelle
      // colonne), ‹ › (même jour de la semaine), Aujourd'hui, ou un simple
      // re-rendu après modification. Remplace l'ancien scrollLeftPrecedent,
      // qui ne désigne plus le même jour dès que la fenêtre a glissé.
      cibleApresRendu = null;
      cibleScrollLeft = decalerSurColonne_(grilleEntete.querySelector('.th[data-gi="' + giDepuisIso(jourMobileCourant()) + '"]'));
    } else if (cibleApresRendu === "aujourdhui") {
      cibleApresRendu = null;
    } else if (cibleApresRendu === "debut") {
      cibleScrollLeft = 0;
      cibleApresRendu = null;
    } else if (cibleApresRendu === "fin") {
      // Round du 23.09.2026 (suite ×11) — "fin" existait déjà mais ne
      // servait jusqu'ici qu'au mode "1 jour" mobile (qui ne l'utilise plus depuis le
      // round du 24.09.2026, suite 6 : défilement continu, cf. plus haut).
      // Le swipe inter-semaines molette/trackpad (desktop/tablette, cf.
      // l'écouteur "wheel" plus bas) l'utilise aussi désormais en arrière
      // (dir=-1, cibleApresRendu="fin") pour atterrir sur la BUTÉE DROITE
      // de la semaine précédente plutôt que sur son tout début : sans ça
      // le défilement repartirait de 0 à chaque semaine chargée en
      // arrière, un aller-retour visuel qui casserait la continuité du
      // geste. Pas de notion de "jour" hors mode "1 jour" — juste la
      // butée de défilement réelle de la nouvelle grille, déjà dans le DOM
      // à ce stade (scroller.scrollWidth la reflète).
      cibleScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      cibleApresRendu = null;
    } else if (scrollerPrecedent) {
      cibleScrollLeft = scrollLeftPrecedent;
    }
    scroller.scrollLeft = cibleScrollLeft;
    // enteteScroll doit refléter le même défilement horizontal dès ce même
    // rendu (sans attendre l'événement "scroll" ci-dessus, asynchrone dans
    // certains navigateurs) — sans quoi l'en-tête figé afficherait un bref
    // instant les mauvaises colonnes après un changement de semaine/mode qui
    // conserve le défilement horizontal.
    enteteScroll.scrollLeft = cibleScrollLeft;
    // Premier calcul explicite (pas d'attente du prochain événement
    // "scroll", qui ne se déclenche pas forcément après une simple
    // affectation programmatique de scrollLeft identique à la position déjà
    // en cours, ex. re-rendu sans changement de semaine/jour) — cf. le
    // commentaire de ajusterLargeurBullesJourMobile plus haut.
    ajusterLargeurBullesJourMobile();
    // Hauteurs du jour affiché (suite 35, cf. figerHauteursJourMobile),
    // APRÈS le calage horizontal : c'est ce jour-là qu'on mesure. Si les
    // polices ne sont pas encore chargées (premier affichage), la mesure est
    // refaite une fois qu'elles le sont : le texte n'occupe pas la même place.
    figerHauteursJourMobile(true);
    if (enModeJourMobile && document.fonts && document.fonts.status !== "loaded") {
      document.fonts.ready.then(function () {
        if (!scroller.isConnected) return;
        figerHauteursJourMobile(true);
      });
    }
    // Round du 24.09.2026 (suite 6) — défilement "infini" de la vue "1 jour"
    // (cf. fenetreLabGs, core.js). Une fois le défilement ARRÊTÉ (plus
    // d'événement "scroll" depuis 200ms, aucun doigt posé, aucun glisser de
    // bulle en cours) : on relève le jour affiché (colonne dont le bord
    // gauche est le plus proche du bord de l'écran, après la colonne des
    // noms), on met à jour la semaine affichée (pilule Sem. N) s'il a changé
    // de semaine, et, s'il reste moins de 2 jours d'avance d'un côté, on fait
    // glisser la fenêtre de 2 semaines d'un cran (recentrerFenetreJourMobile).
    // Jamais PENDANT le geste : reconstruire la grille sous le doigt
    // casserait le geste en cours (cf. differerSiEnGlissement) ; à l'arrêt,
    // le jour affiché est déjà aligné (aimantation) et la grille reconstruite
    // le remet exactement à la même place — rien ne bouge à l'écran.
    if (enModeJourMobile) {
      var minuteurArret = null, doigtsPoses = 0;
      var programmerArret = function () { clearTimeout(minuteurArret); minuteurArret = setTimeout(defilementArrete, 200); };
      scroller.addEventListener("touchstart", function (e) { doigtsPoses = e.touches.length; clearTimeout(minuteurArret); }, { passive: true });
      scroller.addEventListener("touchend", function (e) { doigtsPoses = e.touches.length; programmerArret(); }, { passive: true });
      scroller.addEventListener("touchcancel", function (e) { doigtsPoses = e.touches.length; programmerArret(); }, { passive: true });
      scroller.addEventListener("scroll", programmerArret, { passive: true });
      var defilementArrete = function () {
        if (!scroller.isConnected || doigtsPoses > 0) return;
        // Bulle tenue au doigt (changement de jour en l'amenant au bord,
        // suite 26) : jour posé repris une fois la bulle lâchée (suite 41 —
        // l'arrêt était abandonné jusqu'ici, et avec lui le calcul des
        // largeurs du jour atteint si plus aucun défilement ne suivait).
        if (syncEnCours || document.body.classList.contains("en-glissement")) { minuteurArret = setTimeout(defilementArrete, 400); return; }
        // Jour posé : ses hauteurs de lignes (suite 35, cf.
        // figerHauteursJourMobile) — même si la fenêtre se recentre juste
        // après, la nouvelle grille remesure ce même jour à l'identique.
        figerHauteursJourMobile(false);
        var thJour = null, ecart = Infinity;
        grilleEntete.querySelectorAll(".th[data-gi]").forEach(function (th) {
          var e = Math.abs(decalerSurColonne_(th) - scroller.scrollLeft);
          if (e < ecart) { ecart = e; thJour = th; }
        });
        if (!thJour) return;
        var giJour = +thJour.dataset.gi, isoJour = isoDeGi(giJour);
        if (!isoJour) return;
        jourMobileIso = isoJour;
        for (var iSem = 0; iSem < etat.semaines.length; iSem++) {
          var sem = etat.semaines[iSem];
          if (isoJour >= sem.debut && isoJour <= sem.fin) {
            etat.indexSemaine = iSem;
            break;
          }
        }
        // Pilule Sem. N et, depuis la suite 15, date du jour du menu ⋮ :
        // à chaque arrêt, plus seulement au changement de semaine.
        majSemaineAffichage();
        var rangJour = estGiWeekend(giJour) ? semaineDuGiWeekend(giJour) * 5 + 4 : giJour;
        if (rangJour >= 2 && rangJour <= n - 3) return;
        recentrerFenetreJourMobile();
      };
      // Recentrage : la fenêtre est recalculée autour du jour affiché
      // (debutFenetreMobile = null -> debutFenetreJourMobile_, core.js) ;
      // rien à faire si elle ne peut pas bouger (tout début/fin des semaines
      // du planning). Semaine voisine en principe déjà en cache
      // (prechargerVoisinesJourMobile) : reconstruction immédiate.
      var recentrerFenetreJourMobile = function () {
        debutFenetreMobile = null;
        if (fenetreLabGs().join(",") === labsRendus) return;
        bullesSelectionnees = {};
        assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); majBarreSelection(); });
      };
      prechargerVoisinesJourMobile();
    }
    majBoutonsUndo();
    majBarreSelection();
    majControlesAffichage();
    majZoomAffichage();
    majSemaineAffichage();
    ajusterDebordementToolbar();
    ajusterEnteteFixe();
  }

  // render(sync=true) : reconstruit la grille, puis lance la synchronisation
  // serveur (diff local <-> syncBaseline) sauf appel explicite render(false)
  // (utilisé après une reconstruction fraîche depuis le serveur, où il n'y a
  // par définition rien à synchroniser).
  function render(sync) {
    construireGrille();
    if (sync !== false) synchroniser();
  }

  function bulleEl(it) {
    var el = document.createElement("div");
    el.className = "bulle bulle-" + it.type + (it.important ? " important" : "") + " bulle-plage"
      + (bullesSelectionnees[it.id] ? " selectionnee" : "");
    el.dataset.id = it.id;
    // Jalon rattaché à un chantier (revue du 24.09.2026, suite 22 — Lionel :
    // « Les jalons de la page jalons et les jalons affichée sur la grille ne
    // semblent pas bien synchronisée ») : la page Jalons le peint de la
    // couleur de son chantier (c'est même la raison d'être de ce champ, cf.
    // son en-tête), la grille le laissait en violet — même couleur désormais.
    var chJalon = it.type === "jalon" && it.chantierId != null ? CHANTIERS[etat.chantiersParId[it.chantierId]] : null;
    var bg = it.type === "tache" ? (it.chantier && CHANTIERS[it.chantier] ? CHANTIERS[it.chantier].couleur : "#e5e5e5")
      : it.type === "absence" ? "var(--absence-bg)"
      : it.type === "jalon" ? (chJalon ? chJalon.couleur : "var(--jalon-bg)") : "var(--note-bg)";
    // Étiquette (nom de chantier / "Absence"/"Jalon"/"Note") : n'est plus
    // affichée dans la bulle elle-même depuis le round du 02.09.2026 (retour
    // de Lionel : "on peut réduire les hauteurs de ligne en enlevant les
    // noms de chantier... on a déjà une légende") — la couleur de fond de la
    // bulle + la légende (construireLegende, qui couvre déjà chantiers ET
    // absence/jalon/note) suffisent à l'identifier sans ce 2e texte qui
    // forçait une ligne de plus par bulle. Gardée en mémoire (`tag`) pour
    // l'infobulle au survol (title ci-dessous), qui garde l'info accessible.
    var tag = it.type === "tache" ? (it.chantier && CHANTIERS[it.chantier] ? CHANTIERS[it.chantier].nom : "")
      : it.type === "absence" ? "Absence" : it.type === "jalon" ? "Jalon" + (chJalon ? " · " + chJalon.nom : "") : "Note";
    // Round du 23.09.2026 (suite 14) — .b-carte : nouvel enveloppe interne
    // portant tout le VISUEL (fond, coins arrondis, ombre — cf. son
    // commentaire CSS pour le bug Chromium que ça contourne). .bulle reste
    // l'item de grille "brut", jamais habillé ni sticky lui-même.
    var html = '<span class="poignee poignee-g" data-poignee="gauche"></span><span class="poignee poignee-d" data-poignee="droite"></span>' +
      '<div class="b-carte"><span class="b-txt">' + esc(it.texte) + '</span>';
    if (it.statut && STATUTS[it.statut]) html += '<span class="b-statut" style="background:' + STATUTS[it.statut].couleur + '"><span class="dot"></span>' + esc(STATUTS[it.statut].nom) + '</span>';
    if (it.serieId) html += '<span class="b-serie" title="Fait partie d\'une série">↻ série</span>';
    html += '</div>';
    el.innerHTML = html;
    var carte = el.querySelector(".b-carte");
    carte.style.background = bg;
    // Round du 24.09.2026 — la largeur de .b-carte en mode "1 jour" mobile
    // est désormais ajustée dynamiquement au scroll par
    // ajusterLargeurBullesJourMobile() (cf. son commentaire dans
    // construireGrille) plutôt qu'ici au moment de la création — cf.
    // FRONTEND-CHANGELOG.md pour le pourquoi (une valeur figée par bulle ne
    // peut pas être juste à la fois sur son premier jour, en général une
    // journée entière, ET sur un dernier jour en demi-journée).
    el.title = (tag ? tag + " — " : "") + it.texte;
    el.addEventListener("pointerdown", onPointerDownBulle);
    cablerPoigneeRedim(el.querySelector('[data-poignee="gauche"]'), el, it, "gauche");
    cablerPoigneeRedim(el.querySelector('[data-poignee="droite"]'), el, it, "droite");
    return el;
  }

