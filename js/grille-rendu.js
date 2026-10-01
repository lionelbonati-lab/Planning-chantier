"use strict";
  /* ============================================================
     MOTEUR DE RENDU / INTERACTION — repris du prototype prototype-bulles.html
     (V3), quasiment inchangé : il ne connaît que TACHES/JALONS/NOTES/
     PERSONNES/CHANTIERS/STATUTS en mémoire (cf. bloc "ÉTAT VUE" plus haut).
     Round du 29.09.2026 (suite 99) — affichage du planning découpé
     (Lionel : « Ne serait-il pas plus judicieux de faire 2 application
     différente pour portable et pour deskop? », puis « Allons-y ») :
       - ici, le commun : construction de la grille (construireGrille, G =
         l'objet du rendu, grilleCourante_), bulles, rendu, navigation
         commune (‹ ›, Aujourd'hui, calendrier), espace entre semaines ;
       - js/grille-hauteurs.js : lignes de hauteur fixe, cascade, pastille
         « +N », bulle sélectionnée dépliée (commun) ;
       - js/grille-telephone.js : vue « 1 jour » du téléphone ;
       - js/grille-ordinateur.js : vue semaine (ordinateur, tablette) —
         glissement de semaine, mode de vue, jours voisins, balayage ;
       - js/grille-interactions.js : gestes (doigt et souris, communs) ;
       - styles : style.css (commun), style-mobile.css (téléphone, dont la
         vue « 1 jour »), style-ordinateur.css (vue semaine).
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
  // ---- Chantier de la sélection (round du 29.09.2026, suite 92) --------
  // Lionel : « Quand une bulle est sélectionnée, synchroniser la case
  // chantier de la toolbar afin de pouvoir changer de chantier sans entrer
  // dans l'édition de formulaire, fonctionne en multi-selection tous les
  // chantier selectionné prendront le chantier. Si chantier différent lors
  // de la multiselection mettre la case sur aucun chantier. une foit
  // terminé le chantier par défaut reviens comme il était avant
  // l'édition. » Tant qu'une tâche est sélectionnée, la case montre le
  // chantier des tâches sélectionnées (« Aucun chantier » s'ils diffèrent
  // ou s'il n'y en a pas) et son panneau le change pour toutes ; le
  // chantier par défaut des formulaires (chantierParDefaut) n'est pas
  // touché et revient dès que la sélection est vide. Seules les tâches
  // portent un chantier modifiable depuis la grille : les absences n'en
  // ont pas, les notes non plus, celui d'un jalon se règle sur la page
  // Jalons (la grille ne l'envoie pas, cf. diffsJalons).
  function tachesChantierSelection_() {
    var out = [];
    Object.keys(bullesSelectionnees).forEach(function (id) {
      var p = itemParId(id);
      if (p && p.item.type === "tache") out.push(p);
    });
    return out;
  }
  function chantierValide_(k) { return k && CHANTIERS[k] ? k : null; }
  // Chantier commun aux tâches `plages`, sinon null.
  function chantierCommunSelection_(plages) {
    var k = chantierValide_(plages[0].item.chantier);
    return plages.every(function (p) { return chantierValide_(p.item.chantier) === k; }) ? k : null;
  }
  function appliquerChantierSelection(k) {
    var plages = tachesChantierSelection_();
    if (!plages.length) return;
    k = chantierValide_(k);
    if (plages.every(function (p) { return chantierValide_(p.item.chantier) === k; })) return;
    var autres = Object.keys(bullesSelectionnees).length - plages.length;
    sauvegarderUndo();
    plages.forEach(function (p) { p.item.chantier = k; });
    var msg = (k ? "Chantier « " + CHANTIERS[k].nom + " » (" : "Aucun chantier (") + plages.length + ")" +
      (autres ? " — " + autres + " bulle(s) sans chantier modifiable ici laissée(s) telle(s) quelle(s)." : ".");
    var enAttente = rendreAvecPorteeSerie("modifier", msg);
    majBarreSelection();
    if (!enAttente) toast(msg);
  }
  // Appelée par majBarreSelection (chaque changement de sélection, chaque
  // rendu) : la case n'est reconstruite que si ce qu'elle montre change.
  var etatSelectChantier_ = null;
  function signatureSelectChantier_() {
    var plages = tachesChantierSelection_();
    if (!plages.length) return "defaut";
    // Chantiers différents et « tous sans chantier » ont le même commun
    // (null) : la signature les distingue, sinon la case gardait « (différents) ».
    var k = chantierCommunSelection_(plages), mixte = plages.some(function (p) { return chantierValide_(p.item.chantier) !== k; });
    return "sel:" + k + ":" + plages.length + (mixte ? ":mixte" : "");
  }
  function majChantierSelection() {
    if (signatureSelectChantier_() !== etatSelectChantier_) construireSelectChantier();
  }
  function construireSelectChantier() {
    var btn = document.getElementById("btnSelectChantier");
    var panneau = document.getElementById("panneauChantier");
    if (!btn || !panneau) return;
    var defautActuel = chantierParDefautValide();
    var swatchBtn = btn.querySelector(".swatch");
    var nomBtn = btn.querySelector(".nom-chantier");
    // Suite 92 : sélection en cours -> son chantier (cf. plus haut).
    etatSelectChantier_ = signatureSelectChantier_();
    var plagesSel = tachesChantierSelection_(), enSelection = plagesSel.length > 0;
    var selectChantierEl = document.getElementById("selectChantier");
    if (selectChantierEl) selectChantierEl.classList.toggle("mode-selection", enSelection);
    if (enSelection) {
      var kSel = chantierCommunSelection_(plagesSel), nSel = plagesSel.length;
      var mixte = plagesSel.some(function (p) { return chantierValide_(p.item.chantier) !== kSel; });
      var quoi = nSel > 1 ? "des " + nSel + " tâches sélectionnées" : "de la tâche sélectionnée";
      swatchBtn.classList.toggle("swatch-vide", !kSel);
      swatchBtn.style.background = kSel ? CHANTIERS[kSel].couleur : "";
      nomBtn.textContent = kSel ? CHANTIERS[kSel].nom : "Aucun chantier";
      btn.title = "Chantier " + quoi + " — cliquer pour changer (le chantier par défaut des formulaires revient à la fin de la sélection)";
      panneau.innerHTML = "";
      var titre = document.createElement("div");
      titre.className = "select-chantier-titre";
      titre.textContent = nSel > 1 ? "Chantier des " + nSel + " tâches" + (mixte ? " (différents)" : "") : "Chantier de la tâche";
      panneau.appendChild(titre);
      [null].concat(Object.keys(CHANTIERS).filter(function (k) { return CHANTIERS[k].actif !== false || k === kSel; })).forEach(function (k) {
        var it = document.createElement("button");
        it.type = "button";
        // Chantiers différents : « Aucun chantier » sur la case, rien de coché.
        it.className = "select-chantier-item" + (k === kSel && !mixte ? " actif" : "") + (k ? "" : " select-chantier-aucun");
        it.dataset.chantier = k || "";
        it.innerHTML = (k ? '<span class="swatch" style="background:' + CHANTIERS[k].couleur + '"></span>' + esc(CHANTIERS[k].nom)
          : '<span class="swatch swatch-vide"></span>Aucun chantier') + '<span class="coche">✓</span>';
        it.addEventListener("click", function () {
          var sel = document.getElementById("selectChantier");
          if (sel) sel.classList.remove("ouvert");
          appliquerChantierSelection(k);
        });
        panneau.appendChild(it);
      });
      ajusterDebordementToolbar();
      ajusterEnteteFixe();
      return;
    }
    // Aucun chantier : pastille vide en pointillés (.swatch-vide, suite 55)
    // plutôt qu'un carré var(--border), qui devenait un bloc noir sur la case
    // blanche en mode sombre et se fondait dans la barre sur téléphone.
    swatchBtn.classList.toggle("swatch-vide", !defautActuel);
    if (defautActuel) {
      swatchBtn.style.background = CHANTIERS[defautActuel].couleur;
      nomBtn.textContent = CHANTIERS[defautActuel].nom;
      btn.title = "Chantier par défaut des formulaires : " + CHANTIERS[defautActuel].nom + " — cliquer pour changer";
    } else {
      swatchBtn.style.background = "";
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
  // « À réserver » (suite 47, js/a-reserver.js) : replié après Zoom et
  // Masquages, avant la navigation — sans quoi, toujours dans la barre, il
  // chassait la navigation dans « ⋮ » dès 820 px (tablette). Sur téléphone,
  // il reste dans la barre tant qu'il y tient (tout le reste est dans
  // « ⋮ ») — replié sinon (suite 50, cf. ajusterDebordementToolbar).
  // Suite 79 : « Jours voisins aux bords » replié juste avant la navigation.
  // Suite 81 : « À réserver » devient « Notifications » (même place).
  // Suite 82 : « Jours voisins » rejoint le bouton de vue (#btnModeVue).
  // Suite 83 — Lionel : « Les notifications sont un élément important, il
  // doit toujours rester dans la toolbar. […] "ajouter ligne" à déplacer
  // dans le menu 3points si manque de place. » La cloche quitte l'ordre de
  // repli (toujours dans la barre, entre Annuler/Refaire et Imprimer) ;
  // « Ajouter une ligne » y entre à sa place.
  // Suite 92 : hauteur des lignes, repliée juste après le zoom (bouton
  // retiré à la suite 122).
  // Suite 112 : icône du mode ajout (#groupeModeAjout), repliée juste
  // avant « Ajouter une ligne » (sur téléphone, masquée hors mode ajout).
  var REPLIS_ORDRE = ["groupeZoom", "controlesAffichage", "groupeModeAjout", "groupeAjoutLigne", "groupeNavSemaine", "groupeImprimer"];
  // Téléphone : tout ce qui se replie va dans « ⋮ » ; la cloche est dans la
  // barre du bas (#btnNotificationsNavBas), masquée dans celle-ci.
  // Round du 01.10.2026 (suite 136) — Lionel (retour n° 15, téléphone) :
  // « Rajouter le bouton mode ajout. » Son choix : « Barre, à côté du « + » ».
  // L'icône du mode ajout ne se replie plus dans « ⋮ » sur téléphone : elle
  // reste dans la barre, juste avant le « + » (style-mobile.css) — sauf
  // débordement (cf. ajusterDebordementToolbar).
  var REPLIS_TELEPHONE = REPLIS_ORDRE.filter(function (id) { return id !== "groupeModeAjout"; });
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
    // Tout ce qui peut être replié revient d'abord dans la barre — y compris
    // « À réserver », replié sur ordinateur mais pas sur téléphone (suite 47).
    REPLIS_ORDRE.concat(REPLIS_TELEPHONE).forEach(function (id) {
      var g = document.getElementById(id);
      if (g) insererAuRang(g, legendeBarre, "rang");
    });
    legendeBarre.classList.remove("toolbar-compacte");
    if (telephone) {
      groupes.forEach(function (g) { insererAuRang(g, panneau, "rangMenu"); });
      legendeBarre.classList.add("toolbar-compacte");
      // Suite 136 : l'icône du mode ajout reste dans la barre (retour n° 15),
      // sauf si elle la fait déborder (texte agrandi, test_suite50) : elle
      // rejoint alors « ⋮ », toujours affichée.
      var modeAjout = document.getElementById("groupeModeAjout");
      if (modeAjout && barreDeborde(legendeBarre, panneau)) insererAuRang(modeAjout, panneau, "rangMenu");
      // « À réserver » : sur téléphone, plus dans cette barre du tout, mais
      // dans la barre du bas (round du 25.09.2026, suite 53 — Lionel : « A
      // réservé pourrait être placer sur la barre du bas en mode mobile »,
      // #btnNotificationsNavBas depuis la suite 81) ; #groupeNotifications y est masqué en CSS
      // (style-mobile.css), il reste ici dans la barre, sans largeur. Il
      // était auparavant replié dans « ⋮ » quand la barre débordait (suite
      // 50, « Sur téléphone la toolbar déborde »).
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
    // Suite 132 : "groupe-<id>" pour une ligne Machines / Transports…
    // (js/groupes.js) — la tâche reste alors dans son groupe au glisser.
    return secteurDe(personneParAncre(personneId));
  }
  // Round du 26.09.2026 (suite 66) — Lionel : « J'arrive à changer les
  // tâches entre intervenants alors que cela devrait être interdit. » Le
  // glisser ne bloquait que le passage Personnel ↔ Intervenants (même
  // secteur exigé) : une tâche d'intervenant pouvait passer d'une
  // entreprise à l'autre. Désormais une tâche d'intervenant ne quitte
  // jamais SA ligne (elle se décale seulement dans le temps) ; entre
  // membres du personnel, rien ne change.
  function changementPersonneAutorise(source, cible) {
    if (String(source) === String(cible)) return true;
    var s = secteurPersonne(source);
    return s === secteurPersonne(cible) && s !== "sous-traitant";
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
  // Ordre d'empilement (suite 66, cf. attribuerRangsTaches_ dans
  // js/donnees-sync.js) : le rang d'abord — une tâche tout juste créée ou
  // copiée n'en a pas encore et se range sous les autres —, puis le début.
  // Jalons et notes n'ont pas de rang : le début seul, comme avant.
  function comparerRangTaches(a, b) {
    var ra = a.rang == null ? 1e9 : a.rang, rb = b.rang == null ? 1e9 : b.rang;
    return ra - rb || a.giDebut - b.giDebut;
  }
  function assignerPistesCompact(items) {
    var pistes = []; // pistes[i] = { "<hi>": true } : demi-journées déjà prises
    items.slice().sort(comparerRangTaches).forEach(function (it) {
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
  // Items rangés par piste (assignerPistesCompact déjà passé), l'ordre
  // d'origine gardé à piste égale : en vue « 1 jour » du téléphone
  // (suite 91), la bulle d'une piste plus basse est posée après, donc
  // par-dessus celle du dessus dans la cascade (cascaderBullesJourMobile_).
  function pistesDansLOrdre_(items) {
    return items.map(function (it, i) { return [it, i]; })
      .sort(function (a, b) { return a[0]._piste - b[0]._piste || a[1] - b[1]; })
      .map(function (x) { return x[0]; });
  }
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
  //
  // Jours voisins aux bords (round du 27.09.2026, suite 74, cf.
  // vueBordsActive, js/core.js) : une colonne vide de plus entre la semaine
  // d'avant (1re de la fenêtre) et la 1re semaine affichée en entier —
  // la place de la colonne des noms, qui s'y pose (collée à gauche à
  // --noms-gauche au lieu de 0, cf. style.css), entre le vendredi d'avant
  // et le lundi. vueBordsRendue_ : fixé à chaque rendu (construireGrille).
  var vueBordsRendue_ = false;
  function colonneGrille(gi) {
    var cpj = colsParJour();
    if (estGiWeekend(gi)) {
      var s = semaineDuGiWeekend(gi), j = jourWeekendIdx(gi);
      return 2 + s * (5 * cpj + 2) + 5 * cpj + j + (vueBordsRendue_ && s >= 1 ? 1 : 0);
    }
    return 2 + gi * cpj + (afficherWeekends ? Math.floor(gi / 5) * 2 : 0) + (vueBordsRendue_ && gi >= 5 ? 1 : 0);
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
    // Colonne d'aujourd'hui (suite 62) : teintée seulement si « Surligner
    // aujourd'hui » est choisi (page Affichage, html[data-aff-auj]).
    if (isoDeGi(gi) === etat.aujourdhui) cell.classList.add("cell-auj");
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
    if (isoDeGi(gi) === etat.aujourdhui) cell.classList.add("cell-auj"); // suite 62, cf. creerCell
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
    assurerFenetreChargee(function () { glisserVersSemaine_(dir, function () { construireVueDepuisCache(); render(false); majBarreSelection(); }); });
  }
  // ---- Séparations collantes — round du 28.09.2026 (suite 89) ----------
  // Lionel : « La séparation personnel doit rester sous la note tant
  // qu'une partie du personnel est visible à l'écran. Elles se fera pousser
  // hors de l'écran par la séparation intervenants. » Comme les titres de
  // section d'une liste de contacts : en descendant, la bande « Personnel »
  // reste collée sous l'en-tête figé (jours, Jalons, Notes) ; la bande
  // « Intervenants », en arrivant, la pousse vers le haut puis prend sa
  // place, jusqu'à la fin du planning. position:sticky ne peut pas le faire
  // ici (.scroller défile en largeur, cf. .entete-planning-figee dans
  // style.css) : chaque bande reçoit un simple translateY, une fois par
  // image, au défilement de la page. Rien d'autre ne bouge : ni les cases
  // ni les bulles ne sont remesurées.
  var rafSepCollantes_ = null;
  function planifierSepCollantes_() {
    if (!rafSepCollantes_) rafSepCollantes_ = requestAnimationFrame(placerSepCollantes_);
  }
  function placerSepCollantes_() {
    rafSepCollantes_ = null;
    var sc = racineEl && racineEl.querySelector(".scroller");
    var entete = racineEl && racineEl.querySelector(".entete-planning-figee");
    if (!sc || !entete || !sc.getClientRects().length) return;
    // Suite 132 : toutes les sections (groupes compris), dans l'ordre affiché.
    // Suite 135 : la ligne Machines (.lbl[data-section], sans bande) arrête
    // la bande qui la précède, sans coller elle-même.
    var sections = [].slice.call(sc.querySelectorAll(".section-row[data-section], .lbl[data-section]"));
    var bandes = sections.filter(function (b) { return b.classList.contains("section-row"); });
    if (!bandes.length) return;
    // Lectures d'abord (positions sans le décalage déjà posé), écritures ensuite.
    var haut = entete.getBoundingClientRect().bottom, bas = sc.getBoundingClientRect().bottom;
    var pos = sections.map(function (b) { return { b: b, t: b.getBoundingClientRect().top - (b._decalSep || 0), h: b.offsetHeight, bande: b.classList.contains("section-row") }; });
    pos.forEach(function (p, i) {
      if (!p.bande) return;
      var limite = (i + 1 < pos.length ? pos[i + 1].t : bas) - p.h;
      var d = Math.round(Math.max(0, Math.min(haut, limite) - p.t));
      if (d === (p.b._decalSep || 0)) return;
      p.b._decalSep = d;
      p.b.style.transform = d ? "translateY(" + d + "px)" : "";
      p.b.classList.toggle("section-collee", d > 0);
    });
  }
  document.addEventListener("scroll", planifierSepCollantes_, { capture: true, passive: true });
  window.addEventListener("resize", planifierSepCollantes_);
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
      caleJourMobileSurJourOuvre_(); // un samedi/dimanche : le jour ouvré le plus proche (suite 61)
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
    var sens = idx > etat.indexSemaine ? 1 : -1; // glissement de semaine (suite 72)
    etat.indexSemaine = idx;
    bullesSelectionnees = {};
    if (modeJourMobile_) cibleApresRendu = "aujourdhui";
    assurerFenetreChargee(function () { glisserVersSemaine_(sens, function () { construireVueDepuisCache(); render(false); majBarreSelection(); }); });
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
  // apres (suite 61) : appelée une fois le planning affiché sur ce jour
  // (tout de suite si c'est déjà la semaine affichée) — cf. le résumé des
  // statuts (js/a-reserver.js), qui y sélectionne la tâche choisie.
  function allerAuJour(iso, apres) {
    var idx = -1;
    for (var i = 0; i < etat.semaines.length; i++) {
      if (iso >= etat.semaines[i].debut && iso <= etat.semaines[i].fin) { idx = i; break; }
    }
    if (idx < 0) { toast("Date hors du planning."); return; }
    if (!modeJourMobileActif()) {
      if (idx === etat.indexSemaine) { if (apres) apres(); return; }
      etat.indexSemaine = idx;
      bullesSelectionnees = {};
      assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); majBarreSelection(); if (apres) apres(); });
      return;
    }
    if (jourSemaineIso_(iso) >= 5 && !afficherWeekends) {
      var ouvre = jourOuvreLePlusProche_(iso, idx);
      iso = ouvre.iso; idx = ouvre.idx;
      toast("Week-end masqué : " + libelleDateCourteIso(iso) + " affiché.");
    }
    etat.indexSemaine = idx;
    jourMobileIso = iso;
    debutFenetreMobile = null;
    cibleApresRendu = "aujourdhui";
    bullesSelectionnees = {};
    assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); majBarreSelection(); if (apres) apres(); });
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
  // Rendu fait planning masqué (round du 27.09.2026, suite 69 — Lionel :
  // « En mode mobile, on ne retourne pas sur le même jour sur le planning
  // après une modification dans l'affichage »). Un réglage de la page
  // Affichage (ou Couleurs…) redessine le planning pendant qu'il est caché :
  // rien n'y a de taille, donc ni le défilement (jour de la vue « 1 jour »,
  // position en vue semaine) ni les hauteurs mesurées ne tiennent.
  // grilleRendueMasquee_ le note ; au retour sur l'onglet Planning
  // (rendreSiRenduMasque, coquille.js), un nouveau rendu recale tout — le
  // jour mémorisé (jourMobileIso), sinon le dernier défilement vu à l'écran
  // (dernierScrollVisible_), pas celui, faux, de la grille redevenue visible.
  var grilleRendueMasquee_ = false, retourApresMasque_ = false, dernierScrollVisible_ = 0;
  function rendreSiRenduMasque() {
    if (!grilleRendueMasquee_) return false;
    retourApresMasque_ = true;
    render(false);
    return true;
  }
  // reajusterBullesJourMobile() (suite 35) : recoupe, à l'image suivante,
  // les cartes des bulles par jour en vue « 1 jour » (suite 91, cf.
  // decouperBullesJourMobile_) — pour l'aperçu d'une poignée, qui change
  // la taille d'une bulle sans aucun rendu. Suite 84 : pareil en vue
  // « Jours voisins ». majHauteursLignes() (suite 92) : hauteurs des lignes
  // remesurées d'après les réglages, sans nouveau rendu (curseurs) ; false :
  // rien de mesurable. Suite 99 : l'une et l'autre, comme
  // suivreDefilementJourMobile ci-dessous, sont des fonctions qui
  // agissent sur la grille du dernier rendu (grilleCourante_) — elles n'y
  // sont plus rebranchées à chaque rendu. reajusterBullesJourMobile : plus
  // loin, après construireGrille ; majHauteursLignes : js/grille-
  // hauteurs.js (étape 2) ; suivreDefilementJourMobile : js/grille-
  // telephone.js (étape 3).
  // Dernières mesures (suite 92) : { pers: {n, u, h}, jal: {n, u, h} } —
  // la hauteur en pixels affichée à côté des curseurs.
  var hauteursLignesMesurees = null;
  // suivreDefilementJourMobile(scroller, x) (suite 58) : ce qui suit le
  // défilement en vue « 1 jour » (espace entre semaines, case coin), recalé
  // dans la MÊME image qu'un défilement posé par le script
  // (defilerHorizontal_, grille-interactions.js) — par l'événement
  // « scroll », il n'arrivait qu'à l'image suivante.
  // Taille de la fenêtre (round du 27.09.2026, suite 72) : les positions
  // mémorisées pour le glissement (geoGlisse_, construireGrille) ne valent
  // que pour la taille où elles ont été mesurées.
  var generationTaille_ = 0;
  window.addEventListener("resize", function () { generationTaille_++; });
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
    // Ancienne grille à l'écran et à sa vraie place ? (cf. grilleRendueMasquee_)
    var grillePrecedenteFiable = !!(scrollerPrecedent && scrollerPrecedent.getClientRects().length && !retourApresMasque_);
    retourApresMasque_ = false;
    if (grillePrecedenteFiable) dernierScrollVisible_ = scrollLeftPrecedent;
    else if (scrollerPrecedent) scrollLeftPrecedent = dernierScrollVisible_;
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
    // Grille cachée (suite 69, cf. grilleRendueMasquee_) : toutes ses cases
    // y mesurent 0 px, le « jour visible » relevé était le 1er de la fenêtre
    // (le lundi) et remplaçait le jour affiché. Pas de relevé sans grille
    // fiable à l'écran : jourMobileIso reste celui d'avant.
    if (grillePrecedenteFiable && modeJourMobileRendu && modeJourMobileActif() && !cibleApresRendu && labsRendusDernier === fenetreLabGs().join(",")) {
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
    vueBordsRendue_ = vueBordsActive();
    racineEl.classList.toggle("vue-bords", vueBordsRendue_);
    scroller.classList.toggle("vue-bords", vueBordsRendue_);
    var labsRendus = labsRendusDernier = fenetreLabGs().join(",");
    // G (suite 99) : ce que les morceaux sortis de construireGrille lisent
    // de ce rendu, et l'état qu'ils tiennent pendant la vie de cette
    // grille (cf. grilleCourante_).
    var G = {
      scroller: scroller, grilleCorps: grilleCorps, grilleEntete: grilleEntete, enteteScroll: enteteScroll,
      LN: LN, n: n, nbSemainesAffichees: nbSemainesAffichees, enModeJourMobile: enModeJourMobile, labsRendus: labsRendus,
      coin: null,            // case coin de la ligne des jours (posée plus bas)
      isoCoinJour_: null,    // jour dont la case coin montre le mois (vue « 1 jour »)
      mesuresMob_: null,     // { pers: {n, u, h}, jal: {n, u, h} } (mesurerHauteursMobile_)
      geoGlisse_: null,      // colonnes des jours pour la case coin (majGeoGlisse_)
      cascadesOuvertes_: {}, // clé de la case -> true : bulles étalées (pastille « +N », suite 98)
      rafDecoupe_: null, rafCoinJour_: null, xCoin_: null,
      xDejaSuivi: null       // position de défilement déjà suivie par le script
    };
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
    // Lignes de hauteur fixe partout à l'écran (suite 92, cf.
    // mettreEnPlaceJourMobile_) : repère des règles communes de style.css.
    racineEl.classList.add("hauteurs-fixes");
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
    //
    // Round du 25.09.2026 (suite 50) — planning pleine largeur sur
    // téléphone (style-mobile.css) : .grille-cadre n'y a plus de bordure à
    // gauche ni à droite, plus rien à retirer (la vue "1 jour" n'existe
    // que sur téléphone, cf. modeJourMobileActif).
    var largeurVisibleJour = enModeJourMobile ? (racineEl.clientWidth - LN) : 0;
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
        // Suite 117 : chaque jour à sa largeur (largeursJours_).
        gabarit += gabaritSemaineJours_(largeurMin);
      }
    }
    var largeurMiniTotale = enModeJourMobile
      ? (LN + nbSemainesAffichees * (5 * colsParJour() * largeurColJour + (afficherWeekends ? 2 * largeurVisibleJour : 0))) + "px"
      : (LN + nbSemainesAffichees * (5 * colsParJour() * largeurMin + (afficherWeekends ? largeurWeekEnd_(5) + largeurWeekEnd_(6) : 0))) + "px";
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
    var geoBords = null;
    if (vueBordsRendue_) geoBords = poserGabaritJoursVoisins_(G); // jours voisins aux bords (suite 74)
    else racineEl.style.removeProperty("--noms-gauche");
    // Points d'entrée (majHauteursLignes, suivreDefilementJourMobile,
    // reajusterBullesJourMobile) branchés sur cette grille.
    grilleCourante_ = G;
    // Défilement natif (ou posé autrement) : en-tête figé recalé, puis même
    // suivi (suivreDefilementJourMobile). Position déjà suivie par le
    // script : rien à refaire.
    scroller.addEventListener("scroll", function () {
      var x = scroller.scrollLeft;
      if (enteteScroll.scrollLeft !== x) enteteScroll.scrollLeft = x;
      if (x === G.xDejaSuivi) return;
      G.xDejaSuivi = null;
      placerSepSemaines_(x); planifierMajCoinJourMobile_(G, x);
    });
    // Changement de semaine par balayage au doigt ou à la molette.
    cablerBalayageSemaine_(G);


    // Jours voisins aux bords (suite 75) : week-ends des
    // semaines d'avant et d'après, colonnes de 0 px (cf. gabaritB) — tout ce
    // qui y est posé (en-têtes, cases, bulles d'un samedi/dimanche) est
    // masqué (.we-voisin).
    var colsWeVoisins = {};
    if (vueBordsRendue_ && afficherWeekends) {
      [0, nbSemainesAffichees - 1].forEach(function (sV) {
        colsWeVoisins[colonneGrille(giWeekend(sV, 0))] = colsWeVoisins[colonneGrille(giWeekend(sV, 1))] = true;
      });
    }
    function poserDans(cibleGrille) {
      return function (el, col, row, colSpan, rowSpan) {
        if (colsWeVoisins[col] && (!colSpan || colSpan === 1)) el.classList.add("we-voisin");
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
    // Nom du jour dans son propre <span> (suite 67) : gras, italique et
    // taille réglables à part de la date (page Affichage).
    function nomJourHTML_(nom) { return nom ? '<span class="th-jour">' + esc(nom) + '</span>' : ""; }

    var aujIso = etat.aujourdhui;
    // Cellule coin de la ligne des jours : vide depuis le §83 (round du
    // 16.09.2026, encore un autre, suite×7) — Annuler/Refaire, qui
    // l'occupaient depuis le round précédent, ont rejoint la nouvelle barre
    // d'outils fixe sous les onglets (cf. son historique plus haut). §89
    // (round du 17.09.2026, suite×4) — Lionel : le mois n'est plus affiché
    // nulle part depuis le §87 (cf. le commentaire de htmlCoinMoisAnnee, js/core.js) ;
    // posé ici, dans cette case restée vide depuis le §83.
    // Suite 67 : mois + année, cf. htmlCoinMoisAnnee (js/core.js).
    // Round du 27.09.2026 (suite 70) — Lionel : « En mode mobile, le mois
    // affiché dans la case en haut à gauche ne peut pas être
    // septembre-octobre car il n'affiche qu'un jour. » La grille du
    // téléphone porte bien 2 semaines, mais l'écran n'en montre qu'UN jour :
    // en vue « 1 jour », la case prend le mois et l'année de ce jour-là
    // (jourMobileCourant), puis suit le glissement (majCoinJourMobile_,
    // appelée à l'image du défilement) — « oct. » dès que le jeudi 1er
    // occupe l'écran.
    var coin = document.createElement("div"); coin.className = "th coin";
    coin.dataset.vt = "coin"; // glissement de semaine (suite 72, rétabli suite 90) et page du jour (suite 90)
    G.coin = coin;
    G.isoCoinJour_ = enModeJourMobile ? jourMobileCourant() : null;
    coin.innerHTML = G.isoCoinJour_ ? htmlCoinMoisAnnee([G.isoCoinJour_]) : htmlCoinPlanning(n);
    poser(coin, 1, row);
    for (var gi = 0; gi < n; gi++) {
      var th = document.createElement("div");
      var estAuj = isoDeGi(gi) === aujIso;
      // En-tête de jour : simple repère (jour + date), plus cliquable depuis
      // le retrait du décalage en masse (demande de Lionel — la sélection
      // multiple de bulles de V3 couvre désormais cet usage, cf.
      // FRONTEND-CHANGELOG.md §5).
      th.className = "th" + (gi > 0 && gi % 5 === 0 ? " sem-frontiere" : "")
        + (gi > 0 && gi % 5 !== 0 ? " jour-frontiere" : "")
        + (estAuj ? " today" : "")
        // Jours voisins aux bords (suite 74) : jour et date collés du côté
        // visible (le vendredi d'avant n'en montre que la fin, le lundi
        // d'après que le début).
        + (vueBordsRendue_ && gi === 4 ? " th-bord-avant" : "")
        + (vueBordsRendue_ && gi === n - 5 ? " th-bord-apres" : "");
      th.dataset.gi = gi;
      var infoJour = libelleJourGi(gi);
      // Nom du jour et date selon la page Affichage (suite 64, groupe
      // « Dates », cf. enteteJourAffichage) ; « Heures de travail » peut
      // retirer la durée.
      var entete = enteteJourAffichage(isoDeGi(gi), infoJour.jour);
      // Durée de travail du jour (round du 25.09.2026, suite 27 — page
      // Horaires) sous la date, au format de la feuille PMB (8.75). Les
      // horaires eux-mêmes vont dans la ligne « M | A » juste en dessous.
      var horaireJour = optionAffichage("heures") === "oui" ? horaireDuJour(isoDeGi(gi)) : null;
      var dateHTML = '<span class="th-date">' + esc(entete.date) + "</span>" +
        (horaireJour ? '<span class="th-duree" title="Durée de travail (pause déduite)">' + formatDuree(horaireJour.duree) + " h</span>" : "");
      var ferJour = feriePourJour(gi);
      if (ferJour) {
        th.style.background = hexToRgba(ferJour.couleur, .55);
        th.title = ferJour.label;
        th.innerHTML = nomJourHTML_(entete.nom) + dateHTML + '<span class="th-ferie-label">' + esc(ferJour.label) + "</span>";
      } else {
        th.innerHTML = nomJourHTML_(entete.nom) + dateHTML;
      }
      if (!enModeJourMobile) ajouterPoigneeJour_(th);
      poser(th, colonneGrille(gi), row, colsParJour());
      if (afficherWeekends && (gi + 1) % 5 === 0) {
        var semIdxTh = Math.floor(gi / 5);
        [0, 1].forEach(function (j) {
          var giWE = giWeekend(semIdxTh, j);
          var thWE = document.createElement("div");
          thWE.className = "th th-weekend";
          thWE.dataset.gi = giWE;
          var infoWE = libelleJourGi(giWE), enteteWE = enteteJourAffichage(isoDeGi(giWE), infoWE.jour);
          thWE.innerHTML = nomJourHTML_(enteteWE.nom) + '<span class="th-date">' + htmlDateWeekEnd(enteteWE.date) + "</span>";
          if (!enModeJourMobile) ajouterPoigneeJour_(thWE);
          poser(thWE, colonneGrille(giWE), row);
        });
      }
    }
    row++;
    // « Ligne sous les jours » (suite 64, page Affichage) : horaires (défaut),
    // M | A seulement, ou pas de ligne du tout.
    var ligneDemiAff = optionAffichage("ligneDemi");
    // Fine ligne d'en-tête "M | A" sous chaque jour. Sans elle,
    // rien ne dirait laquelle des deux colonnes d'un jour est le matin — le
    // reste de la grille ne porte plus l'étiquette "Matin"/"Après-midi",
    // puisque les deux demi-journées partagent désormais une seule ligne.
    var coinDemi = document.createElement("div");
    coinDemi.className = "th coin th-demi";
    coinDemi.dataset.vt = "coin-demi";
    if (ligneDemiAff !== "masquee") poser(coinDemi, 1, row);
    for (var giD = 0; giD < n && ligneDemiAff !== "masquee"; giD++) {
      DEMIS.forEach(function (demi) {
        var thD = document.createElement("div");
        thD.className = "th th-demi" + (demi === "aprem" ? " th-demi-aprem" : " th-demi-matin")
          + (demi === "matin" && giD > 0 && giD % 5 === 0 ? " sem-frontiere" : "")
          + (demi === "matin" && giD > 0 && giD % 5 !== 0 ? " jour-frontiere" : "");
        // Horaires dans la ligne « M | A » (suite 27) — Lionel : « Dans la
        // ligne M|A, mais on peut afficher l'horaire complet » : l'horaire
        // du matin sous M, celui de l'après-midi sous A (« — » quand le
        // jour ne travaille que le matin). Sans horaire (week-end, période
        // non saisie) : les lettres M / A comme avant.
        var horaireD = ligneDemiAff === "ma" ? null : horaireDuJour(isoDeGi(giD));
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
    if (ligneDemiAff !== "masquee") row++;

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
      assignerPistesCompact(visibles);
      // Vue « 1 jour » du téléphone (suite 91), puis partout (suite 92) :
      // une seule piste de grille, de hauteur fixe (data-h-mob,
      // poserPistesFixes_) ; les pistes d'assignerPistesCompact rangent les
      // bulles en cascade (cascaderBullesJourMobile_), posées dans leur ordre.
      var pistesGrille = 1;
      visibles = pistesDansLOrdre_(visibles);
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
      lbl.dataset.vt = "s-" + kind;
      lbl.innerHTML = "<b>" + esc(label) + "</b>";
      lbl.title = label;
      lbl.dataset.hMob = "jal";
      lbl.dataset.ligne = kind; // suite 103 : hauteur de cette ligne à part
      poser(lbl, 1, row, null, pistesGrille);
      for (var g = 0; g < n; g++) {
        // Jalons et notes restent des objets à la JOURNÉE (ligne 4 et 5 de la
        // feuille, jamais scindées en demi-journées) : en compact leur case
        // couvre donc les 2 colonnes du jour.
        poser(creerCelluleFond(kind, g), colonneGrille(g), row, colsParJour(), pistesGrille);
        if (afficherWeekends && (g + 1) % 5 === 0) {
          var semG = Math.floor(g / 5);
          [0, 1].forEach(function (j) {
            poser(creerCelluleFond(kind, giWeekend(semG, j)), colonneGrille(giWeekend(semG, j)), row, null, pistesGrille);
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
        b.dataset.piste = String(it._piste);
        poser(b, csStatique[0], row, csStatique[1]);
      });
      row += pistesGrille;
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
      premiereLigneCorps_ = false; // suite 137 : la bande a son trait (border-top)
      var lg = document.createElement("div");
      // Round du 23.09.2026 (suite ×3) — modificateur .section-row-<cle>
      // pour un fond réglable indépendamment par section (cf. style.css et
      // js/page-couleurs.js) : "personnel" ou "intervenants", exactement
      // les 2 valeurs passées à ligneSection() plus bas.
      // Suite 132 (js/groupes.js) : un groupe (Machines, Transports…) a
      // .section-row-groupe (fond du Personnel). Poignée ⠿ : glisser le
      // titre pour ranger la section ailleurs (cablerGlisserSection).
      lg.className = "section-row section-row-" + (/^groupe-/.test(cle) ? "groupe" : cle);
      lg.dataset.section = cle;
      lg.innerHTML =
        '<div class="section-row-sticky">' +
        '<span class="section-poignee" title="Glisser pour changer l’ordre des groupes" aria-hidden="true">⠿</span>' +
        '<span class="section-label">' + esc(texte) + '</span>' +
        '</div>';
      cablerGlisserSection(lg, cle);
      // Bandeau fixe pendant le glissement de semaine (suite 72). Jours
      // voisins aux bords (suite 74) : les bandes entre semaines le coupent,
      // il glisse avec la grille ; seul son libellé reste fixe. Rétabli
      // suite 90 (la bande passe à sa nouvelle place, cf. glisserVersSemaine_).
      (vueBordsRendue_ ? lg.firstChild : lg).dataset.vt = "section-" + cle;
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
    // cleSection (suite 135) : ligne posée à la place du titre de sa
    // section (Machines) — sa 1re étiquette porte la poignée ⠿.
    function ligneGroupePersonnesCompact(groupe, cleSection) {
      groupe.forEach(function (p, iP) {
        var itemsLigne = TACHES.filter(function (it) { return it.personneId === p.id && giVisible(it.giDebut, n); });
        assignerPistesCompact(itemsLigne);
        // Une seule piste de grille (suites 91 et 92) : cf. les lignes
        // Jalons / Notes.
        var pistesGrille = 1;
        itemsLigne = pistesDansLOrdre_(itemsLigne);
        // Lignes alternées (suite 62, page Affichage) : une personne sur
        // deux de chaque groupe porte .ligne-alt (étiquette et cases),
        // teintée seulement si l'option est choisie (html[data-aff-zebre]).
        var alt = iP % 2 === 1;
        var estTransports = secteurDe(p) === "transports";
        // Round du 01.10.2026 (suite 137) — Lionel (bug n° 17) : « Si
        // transport masqué, manque la ligne sous notes ». Le trait sous Notes
        // (suite 135) suit la 1re ligne du corps, quelle qu'elle soit
        // (Transports, Machines…), et plus seulement Transports. Une bande
        // de section (Personnel…) en tête a déjà le sien (border-top).
        var premiere = premiereLigneCorps_;
        premiereLigneCorps_ = false;
        var lbl = document.createElement("div");
        lbl.className = "lbl lbl-compacte" + (alt ? " ligne-alt" : "");
        lbl.dataset.vt = "p" + p.id;
        // Ligne d'équipe (nom, membres, ▸/▾) ou membre d'une équipe
        // (décalé sous elle) — suite 33, cf. js/equipes.js.
        // nomSurDeuxLignes (suite 35) : césure permise après « / » ; nom
        // complet au survol s'il est coupé après 2 lignes.
        lbl.innerHTML = "<b>" + nomSurDeuxLignes(p.nom) + "</b>";
        lbl.title = p.nom;
        remplirEtiquetteEquipe(lbl, p);
        // Suite 134 : la ligne Transports (fond réglable, page Transports).
        if (estTransports) lbl.classList.add("lbl-transports");
        if (premiere) lbl.classList.add("ligne-premiere");
        // Suite 135 : la ligne Machines tient lieu de titre de sa section :
        // fond de la section, poignée ⠿ pour la ranger ailleurs.
        if (cleSection && iP === 0) {
          lbl.classList.add("lbl-section");
          lbl.dataset.section = cleSection;
          lbl.insertAdjacentHTML("afterbegin", '<span class="section-poignee" title="Glisser pour changer l’ordre des groupes" aria-hidden="true">⠿</span>');
          cablerGlisserSection(lbl, cleSection);
        }
        lbl.dataset.hMob = "pers";
        lbl.dataset.ligne = "p" + p.id; // suite 103 : hauteur de cette ligne à part
        poser(lbl, 1, row, null, pistesGrille);
        for (var gi4 = 0; gi4 < n; gi4++) {
          DEMIS.forEach(function (demi) {
            var c = creerCell(gi4, { personne: p.id, demi: demi });
            if (alt) c.classList.add("ligne-alt");
            // Suite 135 : trait sous Notes, cf. .ligne-premiere (style.css ;
            // suite 137 : 1re ligne du corps, pas seulement Transports).
            if (premiere) c.classList.add("ligne-premiere");
            if (demi === "aprem") c.classList.add("cell-aprem");
            // .cell-matin (suite 64) : teinte du matin si « Colonnes teintées :
            // Matin » (page Affichage).
            else c.classList.add("cell-matin");
            // Trait de séparation entre deux JOURS (retour de Lionel) : porté
            // par la colonne du matin, sauf en début de semaine où le trait de
            // semaine, plus fort, prend déjà le relais (posé par creerCell).
            if (demi === "matin" && gi4 > 0 && gi4 % 5 !== 0) c.classList.add("jour-frontiere");
            poser(c, colonneDemi(gi4, demi), row, null, pistesGrille);
          });
          if (afficherWeekends && (gi4 + 1) % 5 === 0) {
            var semGi4 = Math.floor(gi4 / 5);
            [0, 1].forEach(function (j) {
              // Une seule cellule serveur pour le week-end, portée par
              // "matin" — cf. construireVueDepuisCache, items week-end posés
              // avec demiDebut=demiFin="matin".
              var cw = creerCell(giWeekend(semGi4, j), { personne: p.id, demi: "matin" });
              if (alt) cw.classList.add("ligne-alt");
              if (premiere) cw.classList.add("ligne-premiere");
              poser(cw, colonneGrille(giWeekend(semGi4, j)), row, null, pistesGrille);
            });
          }
        }
        itemsLigne.forEach(function (it) {
          var b = bulleEl(it), piste = 0;
          b.dataset.piste = String(it._piste);
          if (estGiWeekend(it.giDebut)) { poser(b, colonneGrille(it.giDebut), row + piste, 1); return; }
          var dureeVisible = Math.max(1, Math.min(it.duree, n - it.giDebut));
          var demiDebutIt = it.demiDebut || null, demiFinIt = it.demiFin || null;
          // .demi-aprem (cf. son commentaire CSS, partagé avec le rendu
          // jalon/note) : même empiètement anti-trait quand la bulle démarre
          // sur la colonne "aprem".
          if (demiDebutIt === "aprem") b.classList.add("demi-aprem");
          var cs = colonneEtSpanDemi(it.giDebut, dureeVisible, demiDebutIt, demiFinIt);
          if (cs[1] === 1) b.classList.add("une-case"); // cf. .une-case (suite 25)
          poser(b, cs[0], row + piste, cs[1]);
        });
        row += pistesGrille;
      });
    }
    function ligneGroupePersonnes(groupe, cleSection) { ligneGroupePersonnesCompact(groupe, cleSection); }

    // Suite 33 : Personnel dans l'ordre des équipes (chaque équipe suivie
    // de ses membres, les membres repliés sans rien à eux cachés) — cf.
    // personnesAffichees, js/equipes.js.

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
    // Round du 30.09.2026 (suite 132) — Lionel : « Les groupes machines
    // et transports font leur apparitions. J'aimerai pouvoir réorganiser
    // mes groupes dans le planning. » Les sections suivent l'ordre choisi
    // (sectionsCorps, js/groupes.js) ; un groupe sans ligne n'est pas
    // affiché, et ne se replie pas depuis la barre (pas de bouton).
    // Round du 01.10.2026 (suite 134) — Lionel (retour n° 9) : « Transport
    // ne sera q'une ligne comme note et jalons. » Son choix : « En haut,
    // sous Notes ». La ligne Transports (groupe ligne_unique, js/groupes.js)
    // ouvre le corps du planning, sans titre de section, avant toutes les
    // sections : juste sous Notes. Bouton masquer/afficher : retour n° 10.
    var premiereLigneCorps_ = true; // suite 137, cf. ligneGroupePersonnesCompact
    if (!replierTransports) {
      var ligneTransports = personnesAffichees("transports").slice(0, 1);
      if (ligneTransports.length) ligneGroupePersonnes(ligneTransports);
    }
    sectionsCorps().forEach(function (sec) {
      if (sec.cle === "personnel" && replierSectionPersonnel) return;
      if (sec.cle === "intervenants" && replierSectionIntervenants) return;
      if (/^groupe-/.test(sec.cle) && replierSectionMachines) return;
      var lignes = personnesAffichees(sec.secteur);
      if (/^groupe-/.test(sec.cle) && !lignes.length) return;
      // Round du 01.10.2026 (suite 135) — Lionel (retour n° 13) : « Machine
      // aussi en une seule ligne comme transport. » Son choix : « À la
      // place de la section Machines » — pas de titre, la ligne seule, qui
      // se glisse comme une section (cf. ligneGroupePersonnesCompact).
      if (/^groupe-/.test(sec.cle)) { ligneGroupePersonnes(lignes, sec.cle); return; }
      ligneSection(sec.cle, sec.libelle);
      ligneGroupePersonnes(lignes);
    });

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
    if (geoBords) {
      // Jours voisins aux bords (suite 74) : toujours le 1er lundi affiché
      // en entier juste après la colonne des noms (bord du vendredi, bande,
      // noms), quel que soit le motif du rendu.
      cibleApresRendu = null;
      var thLundiB = grilleEntete.querySelector('.th[data-gi="5"]');
      cibleScrollLeft = thLundiB ? Math.max(0, Math.round(thLundiB.getBoundingClientRect().left - grilleEntete.getBoundingClientRect().left - (geoBords.P + 5 + LN) * geoBords.zoom)) : 0;
      geoBords.cible = cibleScrollLeft;
      // Tenu : rien d'autre ne fait défiler cette vue (molette, glisser au
      // bord de l'écran, bulle amenée en vue…) — on change de semaine.
      scroller.addEventListener("scroll", function () {
        if (Math.abs(scroller.scrollLeft - geoBords.cible) >= 1) scroller.scrollLeft = geoBords.cible;
        if (enteteScroll.scrollLeft !== scroller.scrollLeft) enteteScroll.scrollLeft = scroller.scrollLeft;
      }, { passive: true });
    } else if (enModeJourMobile) {
      // Round du 24.09.2026 (suite 6) — vue "1 jour" : TOUJOURS calé sur le
      // jour affiché (jourMobileCourant, core.js), quel que soit le motif du
      // rendu — après un recentrage de la fenêtre (même jour, nouvelle
      // colonne), ‹ › (même jour de la semaine), Aujourd'hui, ou un simple
      // re-rendu après modification. Remplace l'ancien scrollLeftPrecedent,
      // qui ne désigne plus le même jour dès que la fenêtre a glissé.
      cibleApresRendu = null;
      cibleScrollLeft = decalerSurColonne_(G, grilleEntete.querySelector('.th[data-gi="' + giDepuisIso(jourMobileCourant()) + '"]'));
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
    grilleRendueMasquee_ = !scroller.getClientRects().length;
    // enteteScroll doit refléter le même défilement horizontal dès ce même
    // rendu (sans attendre l'événement "scroll" ci-dessus, asynchrone dans
    // certains navigateurs) — sans quoi l'en-tête figé afficherait un bref
    // instant les mauvaises colonnes après un changement de semaine/mode qui
    // conserve le défilement horizontal.
    enteteScroll.scrollLeft = cibleScrollLeft;
    ajusterBullesJoursVoisins_(G); // vue « Jours voisins » (suite 84)
    planifierSepCollantes_(); // séparations Personnel / Intervenants (suite 89)
    // Vue « 1 jour » (suite 91) : pistes fixes, hauteurs des cartes, cartes
    // par jour et cascade. Si les polices ne sont pas encore chargées
    // (premier affichage), refait une fois qu'elles le sont : le texte
    // n'occupe pas la même place.
    mettreEnPlaceJourMobile_(G);
    if (document.fonts && document.fonts.status !== "loaded") {
      document.fonts.ready.then(function () {
        if (!scroller.isConnected) return;
        mettreEnPlaceJourMobile_(G);
        if (typeof majRetablirHauteurs === "function") majRetablirHauteurs();
      });
    }
    // « Rétablir » des lignes réglées à part (page Affichage, suite 122).
    if (typeof majRetablirHauteurs === "function") majRetablirHauteurs();
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
    if (enModeJourMobile) cablerArretJourMobile_(G);
    majBoutonsUndo();
    majBarreSelection();
    majControlesAffichage();
    majZoomAffichage();
    majSemaineAffichage();
    ajusterDebordementToolbar();
    ajusterEnteteFixe();
    poserSepSemaines_(enModeJourMobile, enteteFigee, enteteScroll, grilleEntete, cadre, scroller);
  }

  // ==== Grille : morceaux sortis de construireGrille =====================
  // Round du 29.09.2026 (suite 99) — Lionel, à propos du code du planning :
  // « Ne serait-il pas plus judicieux de faire 2 application différente
  // pour portable et pour deskop? », puis « Allons-y » au plan proposé
  // (une seule appli, l'affichage du planning découpé en commun /
  // ordinateur / téléphone). Étape 1 : les fonctions imbriquées dans
  // construireGrille en sortent, telles quelles. Ce qu'elles lisaient
  // par fermeture (grilles, .scroller, largeur des noms, vue « 1 jour »…)
  // leur arrive dans G, l'objet du rendu qui les a posées (cf.
  // construireGrille) ; l'état tenu d'un appel à l'autre pendant la vie
  // d'une grille (mesures, cases étalées, case coin…) y est aussi. Une
  // minuterie ou un écouteur d'un ancien rendu garde donc SON G, comme
  // avant sa fermeture. grilleCourante_ : le G du dernier rendu, pour
  // les points d'entrée appelés d'ailleurs (majHauteursLignes,
  // suivreDefilementJourMobile, reajusterBullesJourMobile).
  // Étapes 2 à 4 : ces morceaux sont rangés par vue — js/grille-
  // hauteurs.js (commun), js/grille-telephone.js (vue « 1 jour »),
  // js/grille-ordinateur.js (vue semaine, jours voisins, balayage). Ne
  // restent ici que ceux appelés dans toutes les vues.
  var grilleCourante_ = null;

  // Tout, au rendu (et une fois les polices chargées : le texte n'occupe
  // pas la même place). Suite 92 : partout (lignes de hauteur fixe sur
  // ordinateur et tablette aussi) ; cartes par jour et jour posé, en vue
  // « 1 jour » seulement.
  function mettreEnPlaceJourMobile_(G) {
    var enModeJourMobile = G.enModeJourMobile;
    poserPistesFixes_(G);
    mesurerHauteursMobile_(G);
    if (enModeJourMobile) decouperBullesJourMobile_(G);
    cascaderBullesJourMobile_(G);
    if (!enModeJourMobile) return;
    G.geoGlisse_ = null;
    poserJourMobile_(G);
  }
  function planifierDecoupeJourMobile_(G) {
    var scroller = G.scroller, enModeJourMobile = G.enModeJourMobile;
    if (G.rafDecoupe_) return;
    G.rafDecoupe_ = requestAnimationFrame(function () {
      G.rafDecoupe_ = null;
      if (!scroller.isConnected) return;
      if (enModeJourMobile) decouperBullesJourMobile_(G);
      cascaderBullesJourMobile_(G);
      if (enModeJourMobile) poserJourMobile_(G);
    });
  }
  // Suite 84 : en vue « Jours voisins », l'aperçu d'une poignée recoupe
  // aussi les cartes par morceau (ajusterBullesJoursVoisins_).
  // Suite 91 : en vue « 1 jour », cartes recoupées par jour et cascade.
  // Suite 92 : cascade refaite partout (l'amas d'une bulle étirée change).
  // Avant tout rendu : rien.
  function reajusterBullesJourMobile() {
    var G = grilleCourante_;
    if (!G) return;
    if (vueBordsRendue_) ajusterBullesJoursVoisins_(G);
    planifierDecoupeJourMobile_(G);
  }


  /* Espace entre deux semaines — round du 26.09.2026 (suite 61). Lionel :
     « Entre 2 semaines, il y a une bordure épaisse. A remplacer par un
     petite espace de quelque pixel. Mêmes arrondis en haut et bas que sur
     les bord du cadrillage, comme si on voyait 2 fenêtres côte à côte. »
     La grille reste UNE grille (bulles d'une semaine à l'autre, glisser,
     sélection : rien ne change) ; par-dessus, à chaque frontière de
     semaine, une bande de 8 px couleur du fond de page, bordée des deux
     côtés du trait du cadre (bord droit de la 1re fenêtre, bord gauche de
     la 2e), avec en haut et en bas les arrondis de 12 px du cadre
     (.entete-planning-scroll, .grille-cadre). Deux morceaux : l'un dans
     l'en-tête figé (il reste en haut avec lui), l'autre posé sur le corps
     (dans #racine, hors du .grille-cadre qui rogne son propre trait du
     bas). Une bulle à cheval sur deux semaines passe « derrière » la bande,
     comme derrière le montant entre deux fenêtres. Placés en JS, au pixel
     de la frontière (en-tête du lundi), à chaque rendu, défilement
     horizontal et changement de taille ; cachés quand la frontière passe
     sous la colonne des noms ou hors de l'écran. Vue « 1 jour » du
     téléphone : depuis la suite 69, sans trait épais (classe
     sans-trait-semaines) ; depuis la suite 71, avec la bande elle aussi —
     round du 27.09.2026, Lionel : « L'espace entre semaines n'est pas
     visible lorsqu'on change de semaine ». Le téléphone ne voit la
     frontière qu'en glissant du vendredi au lundi (ou du dimanche) : la
     bande apparaît pendant le geste et disparaît d'elle-même une fois le
     jour posé, le lundi calé contre la colonne des noms ou le vendredi
     contre le bord droit (même règle « cachée hors de l'écran »). */
  var sepSemaines_ = null;
  function poserSepSemaines_(jourMobile, enteteFigee, enteteScroll, grilleEntete, cadre, scroller) {
    if (sepSemaines_ && sepSemaines_.ro) sepSemaines_.ro.disconnect();
    sepSemaines_ = null;
    // « Entre 2 semaines : Rien » (suite 64, ex-« Trait » de la suite 62 —
    // Lionel : « proposer espace ou rien. plus de ligne épaisse ») : pas
    // d'espace, et le trait de .sem-frontiere est retiré en CSS
    // (html[data-aff-separation="rien"]).
    var trait = typeof optionAffichage === "function" && optionAffichage("separation") === "rien";
    var ths = trait ? [] : [].slice.call(grilleEntete.querySelectorAll(".th.sem-frontiere:not(.th-demi)"));
    racineEl.classList.toggle("avec-sep-semaines", ths.length > 0);
    // Vue « 1 jour » du téléphone : plus de trait épais non plus — round du
    // 26.09.2026 (suite 69), Lionel : « Sur mobile la grosse bordure est
    // restée entre les semaines ». Un simple trait, comme entre 2 jours.
    racineEl.classList.toggle("sans-trait-semaines", !!jourMobile);
    if (!ths.length) return;
    function morceau(ou, cote) {
      var m = document.createElement("div");
      m.className = "sep-semaines sep-" + cote;
      m.setAttribute("aria-hidden", "true");
      m.innerHTML = '<span class="sep-coin sep-coin-g"></span><span class="sep-coin sep-coin-d"></span>';
      ou.appendChild(m);
      return m;
    }
    // Jours voisins aux bords (suite 74) : la frontière entre la semaine
    // d'avant et la 1re affichée en entier est avant la colonne vide des
    // noms (cf. colonneGrille), pas contre le lundi — `avant` = largeur de
    // cette colonne et de son trait. Plus de colonne des noms à gauche de
    // l'écran : bande visible jusqu'au bord.
    var LNs = largeurNoms();
    sepSemaines_ = {
      enteteFigee: enteteFigee, enteteScroll: enteteScroll, cadre: cadre, scroller: scroller, bords: vueBordsRendue_,
      paires: ths.map(function (th) {
        return { th: th, avant: vueBordsRendue_ && th.dataset.gi === "5" ? LNs + 4 : 0, entete: morceau(enteteFigee, "haut"), corps: morceau(racineEl, "bas") };
      })
    };
    if (window.ResizeObserver) {
      sepSemaines_.ro = new ResizeObserver(function () { placerSepSemaines_(); });
      sepSemaines_.ro.observe(cadre);
      sepSemaines_.ro.observe(enteteFigee);
    }
    placerSepSemaines_();
  }
  // placerSepSemaines_(x) — round du 27.09.2026 (suite 72) : appelé à
  // chaque image d'un défilement horizontal avec sa position `x`. Rien ne
  // bouge alors dans la grille que le défilement lui-même : les positions
  // relevées à la dernière mesure complète (rendu, changement de taille)
  // suffisent (x_écran = x_contenu − défilement), sans relire la mise en
  // page à chaque image ; et un morceau n'est réécrit que s'il a bougé.
  function placerSepSemaines_(xConnu) {
    var s = sepSemaines_;
    if (!s || !s.cadre.isConnected) return;
    var m = s.mesure;
    if (xConnu == null || !m || m.taille !== generationTaille_) {
      var rr = racineEl.getBoundingClientRect(), rf = s.enteteFigee.getBoundingClientRect();
      var rc = s.cadre.getBoundingClientRect(), rs = s.scroller.getBoundingClientRect();
      if (!rc.width) { s.mesure = null; return; } // page Planning cachée : refait à son retour (rendu)
      var z = (niveauZoomPlanning / 100) || 1;
      var x0 = s.scroller.scrollLeft;
      m = s.mesure = {
        taille: generationTaille_, rr: rr.left, rf: rf.left, haut: rc.top - rr.top, hauteur: rc.height,
        gauche: rs.left + (s.bords ? 0 : largeurNoms() * z), droite: rs.right, hautEntete: s.enteteScroll.offsetTop,
        // Bord gauche du lundi, dans le repère du contenu défilé.
        xs: s.paires.map(function (p) { return p.th.getBoundingClientRect().left - p.avant * z + x0; })
      };
      if (xConnu == null) xConnu = x0;
    }
    s.paires.forEach(function (p, i) {
      // Bord gauche du lundi : le trait de 1 px de la grille est juste avant.
      var x = Math.round(m.xs[i] - xConnu);
      var visible = x - 5 >= m.gauche && x + 3 <= m.droite;
      var cle = visible ? [x, m.rr, m.rf, m.haut, m.hauteur, m.hautEntete].join("|") : "";
      if (cle === p.cle) return;
      p.cle = cle;
      p.entete.hidden = p.corps.hidden = !visible;
      if (!visible) return;
      p.entete.style.left = (x - 5 - m.rf) + "px";
      p.entete.style.top = m.hautEntete + "px";
      p.corps.style.left = (x - 5 - m.rr) + "px";
      p.corps.style.top = m.haut + "px";
      p.corps.style.height = m.hauteur + "px";
    });
  }
  window.addEventListener("resize", function () { placerSepSemaines_(); });

  // render(sync=true) : reconstruit la grille, puis lance la synchronisation
  // serveur (diff local <-> syncBaseline) sauf appel explicite render(false)
  // (utilisé après une reconstruction fraîche depuis le serveur, où il n'y a
  // par définition rien à synchroniser).
  // Position verticale gardée (round du 28.09.2026, suite 90) :
  // construireGrille vide #racine avant de le reconstruire, et ses mesures
  // en chemin forcent une mise en page de la page vide — #app, trop court,
  // revenait tout en haut. À chaque rendu : changement de semaine (dont le
  // glissement de la suite 90 aurait fait descendre la nouvelle semaine en
  // biais), relecture temps réel (suite 89), enregistrement. Remise où elle
  // était, dans la même tâche (rien ne s'affiche entre-temps).
  function render(sync) {
    var hautApp = app ? app.scrollTop : 0;
    construireGrille();
    if (app && hautApp && app.scrollTop !== hautApp) { app.scrollTop = hautApp; planifierSepCollantes_(); }
    if (sync !== false) synchroniser();
    planifierMajAReserver(); // tâches « À réserver » (suite 47, js/a-reserver.js), comptées dans « Notifications » (suite 81)
    apresRenduDemandes(); // demandes d'absence des liens de consultation (suite 69, js/demandes-absence.js)
    marquerExceptionsEquipes(); // « Hors équipe » / « + Équipe » (suite 131, js/equipes.js)
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
    //
    // Round du 29.09.2026 (suite 122) — Lionel : « Pastille de couleur pour
    // le chantier dans les notes et jalons, pas de chantier = pas de
    // pastille ». Jalon ET note : fond à la couleur du type, le chantier
    // devient une pastille devant le texte (.b-pastille), aucune sans
    // chantier.
    var chJalon = (it.type === "jalon" || it.type === "note") && it.chantierId != null ? CHANTIERS[etat.chantiersParId[it.chantierId]] : null;
    // Tâche sans chantier (suite 66 — Lionel : « Reste sans couleur ») :
    // fond de la page (blanc, comme à l'impression) cerclé d'un filet
    // (.sans-chantier), au lieu du gris #e5e5e5 d'avant.
    var sansChantier = it.type === "tache" && !(it.chantier && CHANTIERS[it.chantier]);
    if (sansChantier) el.classList.add("sans-chantier");
    // Absence partielle (suite 130, cf. absencePartielle) : « Arrivée 9h30 »,
    // « Départ 16h15 »… rayée de clair — la personne travaille une partie
    // de la demi-journée.
    if (it.type === "absence" && absencePartielle(it.texte)) el.classList.add("absence-partielle");
    var bg = it.type === "tache" ? (sansChantier ? "var(--bg)" : CHANTIERS[it.chantier].couleur)
      : it.type === "absence" ? "var(--absence-bg)"
      : it.type === "jalon" ? "var(--jalon-bg)" : "var(--note-bg)";
    // Étiquette (nom de chantier / "Absence"/"Jalon"/"Note") : n'est plus
    // affichée dans la bulle elle-même depuis le round du 02.09.2026 (retour
    // de Lionel : "on peut réduire les hauteurs de ligne en enlevant les
    // noms de chantier... on a déjà une légende") — la couleur de fond de la
    // bulle + la légende (construireLegende, qui couvre déjà chantiers ET
    // absence/jalon/note) suffisent à l'identifier sans ce 2e texte qui
    // forçait une ligne de plus par bulle. Gardée en mémoire (`tag`) pour
    // l'infobulle au survol (title ci-dessous), qui garde l'info accessible.
    var tag = it.type === "tache" ? (sansChantier ? "Aucun chantier" : CHANTIERS[it.chantier].nom)
      : it.type === "absence" ? "Absence" : (it.type === "jalon" ? "Jalon" : "Note") + (chJalon ? " · " + chJalon.nom : "");
    // Round du 23.09.2026 (suite 14) — .b-carte : nouvel enveloppe interne
    // portant tout le VISUEL (fond, coins arrondis, ombre — cf. son
    // commentaire CSS pour le bug Chromium que ça contourne). .bulle reste
    // l'item de grille "brut", jamais habillé ni sticky lui-même.
    var html = '<span class="poignee poignee-g" data-poignee="gauche"></span><span class="poignee poignee-d" data-poignee="droite"></span>' +
      '<div class="b-carte"><span class="b-txt">' + (chJalon ? '<span class="b-pastille" style="background:' + chJalon.couleur + '"></span>' : '') + esc(it.texte) + '</span>';
    if (it.statut && STATUTS[it.statut]) html += '<span class="b-statut" style="background:' + STATUTS[it.statut].couleur + '"><span class="dot"></span>' + esc(STATUTS[it.statut].nom) + '</span>';
    if (it.serieId) html += '<span class="b-serie" title="Fait partie d\'une série">↻ série</span>';
    html += '</div>';
    el.innerHTML = html;
    var carte = el.querySelector(".b-carte");
    carte.style.background = bg;
    // Vue « 1 jour » du téléphone (suite 91) : une carte par jour couvert,
    // posées après le rendu (decouperBullesJourMobile_, construireGrille).
    el.title = (tag ? tag + " — " : "") + it.texte;
    el.addEventListener("pointerdown", onPointerDownBulle);
    cablerPoigneeRedim(el.querySelector('[data-poignee="gauche"]'), el, it, "gauche");
    cablerPoigneeRedim(el.querySelector('[data-poignee="droite"]'), el, it, "droite");
    return el;
  }

