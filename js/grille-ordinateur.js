"use strict";
  /* ============================================================
     VUE SEMAINE — ORDINATEUR ET TABLETTE
     Round du 29.09.2026 (suite 99) — découpage de l'affichage du
     planning (Lionel : « Ne serait-il pas plus judicieux de faire 2
     application différente pour portable et pour deskop? », puis
     « Allons-y » au plan proposé), étape 4 : sorti tel quel de
     js/grille-rendu.js. Tout ce qui ne sert qu'aux vues « 1 semaine »,
     « Jours voisins » et « 2 semaines » (plus de 600 px de large) :
     glissement animé d'une semaine à l'autre, bouton de mode de vue,
     gabarit et cartes des jours voisins aux bords (refaits au
     redimensionnement), changement de semaine par balayage depuis un
     bord ou à la molette. Les fonctions qui touchent la grille reçoivent
     G, l'objet du rendu (cf. construireGrille et grilleCourante_,
     grille-rendu.js).
     Restent communs (grille-rendu.js) : naviguerSemaine (‹ ›),
     allerAujourdhui, les bandes Personnel / Intervenants collées sous
     l'en-tête (placerSepCollantes_) et l'espace entre semaines.
     ============================================================ */

  // ---- Changement de semaine et mode de vue ----------------------------

  // Round du 27.09.2026 (suite 72) — Lionel, à propos du glissement d'un
  // jour à l'autre sur téléphone : « l'effet me plaît […] J'aimerai un effet
  // similaire sur ordinateur lors du passage d'une semaine à l'autre. »
  // Sur ordinateur, la grille ne porte qu'UNE semaine (pas 2 comme la vue
  // « 1 jour ») : impossible d'y faire défiler la suivante. On passe donc
  // par l'API View Transitions : le navigateur photographie la grille
  // avant `maj` (le rendu de la nouvelle semaine), puis après, et fait
  // glisser les 2 photos côte à côte — l'ancienne semaine sort d'un côté
  // pendant que la nouvelle entre de l'autre, jointives (pas = largeur des
  // jours seuls, --vt-pas), en ralentissant à l'arrivée comme le
  // glissement du téléphone. La colonne des noms, elle, ne bouge pas :
  // chaque case (coin, Jalons, Notes, une par personne — data-vt posé à la
  // construction) reçoit son propre view-transition-name le temps du
  // glissement, et passe seulement de sa hauteur d'avant à la nouvelle ;
  // les jours sont rognés à droite d'elle (--vt-noms, cf. style.css). Nom
  // en double (une personne affichée 2 fois) : seul le premier le porte —
  // un doublon annulerait tout l'effet.
  // Rendu immédiat, comme avant, si le navigateur ne connaît pas l'API, en
  // vue « 1 jour » (qui a déjà son propre glissement), si le système
  // demande de réduire les animations, ou planning pas à l'écran.
  // Round du 28.09.2026 (suite 90) — Lionel, retour sur la suite 89 :
  // « Je voulais que seule la première colonne et les séparations
  // s'adaptent. Le planning glisse mais ne modifie pas ses hauteurs de
  // ligne. Étant donné qu'on a une bordure entre chaque jour, un décalage
  // de hauteur entre 2 jours n'est pas grave car on ne le verra plus une
  // fois aimanté. » La suite 89 ne faisait plus glisser que les dates :
  // le glissement de TOUTE la semaine (ci-dessous) est rétabli — chaque
  // photo avec ses propres hauteurs de lignes, rien n'est recalculé en
  // chemin ; seules les cases de la colonne des noms et les bandes
  // Personnel / Intervenants (data-vt) passent d'une hauteur, d'une place,
  // à l'autre. Les bandes collées sous l'en-tête (suite 89) reçoivent
  // leur place AVANT la 2e photo (placerSepCollantes_ dans le rappel).
  var transitionSemaine_ = null;
  function nommerColonneNoms_(on) {
    if (!racineEl) return;
    var vus = {};
    racineEl.style.viewTransitionName = on ? "semaine" : "";
    racineEl.querySelectorAll("[data-vt]").forEach(function (el) {
      var cle = "vt-" + el.dataset.vt;
      el.style.viewTransitionName = on && !vus[cle] ? cle : "";
      vus[cle] = true;
    });
  }
  function glisserVersSemaine_(dir, maj) {
    if (!racineEl) racineEl = document.getElementById("racine");
    var r = racineEl && racineEl.getBoundingClientRect();
    if (typeof document.startViewTransition !== "function" || modeJourMobileActif() || mouvementReduit_()
      || !r || !r.width || !racineEl.querySelector(".scroller")) { maj(); return; }
    var html = document.documentElement, noms = largeurNoms();
    html.style.setProperty("--vt-noms", noms + "px");
    html.style.setProperty("--vt-pas", Math.max(0, Math.min(r.width, window.innerWidth - r.left) - noms) + "px");
    html.style.setProperty("--vt-dir", dir > 0 ? "1" : "-1");
    // Jours voisins aux bords (round du 27.09.2026, suite 74) — Lionel a
    // choisi que la colonne des noms reste « entre le vendredi et la
    // semaine » : au changement de semaine, tout glisse et le jeudi et le
    // vendredi passent sous les noms. Les 2 photos ne glissent pas du même
    // pas. L'ancienne (vers la semaine suivante) : jusqu'à ce que son
    // vendredi arrive dans le bord gauche, là où la nouvelle l'affiche
    // (pas xS − xG, du bord du vendredi d'avant à la bande de droite) ; on
    // n'en garde que le bord de gauche et la semaine (pas son lundi
    // d'après, ni la colonne vide sous les noms). La nouvelle : son lundi
    // part d'où était le lundi d'après (pas xS − xL), on n'en garde que la
    // partie à partir de ce lundi. Au départ comme à l'arrivée, rien ne
    // saute ; en chemin, la place des noms s'ouvre entre les deux (fond de
    // la page) et arrive sous eux. Vers la semaine précédente : l'inverse.
    // Vue normale d'un côté seulement (bout du planning) : glissement
    // habituel.
    var bords = racineEl.classList.contains("vue-bords") && vueBordsActive();
    html.classList.toggle("vt-bords", bords);
    if (bords) {
      var z = (niveauZoomPlanning / 100) || 1, ths = racineEl.querySelectorAll(".entete-planning-figee .th[data-gi]:not(.th-demi):not(.th-weekend)");
      var thL = racineEl.querySelector('.entete-planning-figee .th[data-gi="5"]'), thS = ths[ths.length - 5];
      var xL = thL.getBoundingClientRect().left - r.left, xS = thS.getBoundingClientRect().left - r.left, xG = xL - (noms + 4) * z;
      // Week-ends affichés (round du 27.09.2026, suite 75 — Lionel : « Pas de
      // samedi-dimanche dans les semaines adjacentes ») : le vendredi qui
      // passe dans le bord gauche (ou en revient) est suivi de son
      // week-end, que le bord n'a pas. Le pas se prend donc sur ce vendredi
      // (xF, son bord droit + l'écart de 1 px), pas sur le lundi d'après :
      // le week-end finit (ou part) sous les noms. Sans week-end, xF = xS.
      var thF = ths[ths.length - 6], xF = thF ? thF.getBoundingClientRect().right - r.left + z : xS;
      var px = function (v) { return Math.round(v * 10) / 10 + "px"; };
      var masqueComplet = "linear-gradient(to right, #000 " + px(xG + 3) + ", transparent " + px(xG + 3) + ", transparent " + px(xL) + ", #000 " + px(xL) + ", #000 " + px(xS + 3) + ", transparent " + px(xS + 3) + ")";
      var masqueDroite = "linear-gradient(to right, transparent " + px(xL) + ", #000 " + px(xL) + ")";
      html.style.setProperty("--vt-noms", "0px");
      html.style.setProperty("--vt-masque-ancien", dir > 0 ? masqueComplet : masqueDroite);
      html.style.setProperty("--vt-masque-nouveau", dir > 0 ? masqueDroite : masqueComplet);
      html.style.setProperty("--vt-sortie", px(dir > 0 ? -(xF - xG) : xS - xL));
      html.style.setProperty("--vt-entree", px(dir > 0 ? xS - xL : -(xF - xG)));
    }
    html.classList.add("vt-semaine");
    nommerColonneNoms_(true);
    var t = document.startViewTransition(function () { maj(); placerSepCollantes_(); nommerColonneNoms_(true); });
    transitionSemaine_ = t;
    // Noms retirés dès la 2e photo prise (plus besoin pendant l'animation),
    // classe et variables à la fin — sauf si un nouveau glissement (clic
    // rapide sur › ›) a déjà pris le relais.
    t.ready.then(function () { if (transitionSemaine_ === t) nommerColonneNoms_(false); }, function () {});
    t.finished.then(function () {
      if (transitionSemaine_ !== t) return;
      transitionSemaine_ = null;
      nommerColonneNoms_(false);
      html.classList.remove("vt-semaine", "vt-bords");
    }, function () {});
  }
  // Round D — bouton unique "2 semaines" (remplace la paire .toggle-sem
  // "1 semaine"/"2 semaines", cf. commentaire de construireGrille) : bascule
  // simplement l'état, son rendu .actif suit deuxSemaines à chaque
  // reconstruction de .semaine-titre.
  function basculerDeuxSemaines() {
    deuxSemaines = !deuxSemaines;
    assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); });
  }
  // Round du 27.09.2026 (suite 82) — Lionel : « Regrouper les boutons mode
  // de vue en 1 seul bouton afin qu'un seul mode ne soit actif à la fois.
  // Comportement du clic sur le bouton 1 semaine > jours voisin > 2
  // semaines > 1 semaine. » #btnModeVue (ordinateur, tablette) : 3 modes,
  // un seul à la fois. « Jours voisins » : vueBords (suite 84, avant
  // l'option enregistrée `bords`) ; « 2 semaines » : deuxSemaines. Vue
  // d'ouverture : réglage vueOrdi. En 2 semaines, pas de bords
  // (vueBordsActive).
  var MODES_VUE = {
    semaine: { nom: "1 semaine", icone: "uneSemaine", suivant: "bords" },
    bords: { nom: "Jours voisins", icone: "joursBords", suivant: "deux" },
    deux: { nom: "2 semaines", icone: "deuxSemaines", suivant: "semaine" }
  };
  // Suite 84 : « Jours voisins » n'est plus l'option enregistrée `bords`
  // mais l'état vueBords (js/core.js), comme deuxSemaines : le bouton
  // change la vue de la session, le réglage vueOrdi celle de l'ouverture.
  function modeVueCourant() {
    if (deuxSemaines) return "deux";
    return vueBords ? "bords" : "semaine";
  }
  function basculerModeVue() {
    var suivant = MODES_VUE[modeVueCourant()].suivant;
    deuxSemaines = suivant === "deux";
    vueBords = suivant === "bords";
    assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); majBarreSelection(); });
    // Page Affichage ouverte : la ligne « Coins du planning » suit la vue.
    if (typeof majPageAffichage === "function") majPageAffichage();
  }
  // Jours voisins aux bords (suite 74) : colonnes en px calculées pour la
  // largeur du .scroller — refaites quand elle change (ou quand la vue
  // s'allume/s'éteint en passant sous 600 px), une fois le redimensionnement
  // fini. Jamais pendant un glisser de bulle.
  var minuteurBordsTaille_ = null;
  window.addEventListener("resize", function () {
    clearTimeout(minuteurBordsTaille_);
    minuteurBordsTaille_ = setTimeout(function redimBords() {
      var page = document.getElementById("page-planning"), sc = racineEl && racineEl.querySelector(".scroller");
      if (!sc || !page || !page.classList.contains("actif") || modeJourMobileActif()) return;
      if (!vueBordsRendue_ && !vueBordsActive()) return;
      if (document.body.classList.contains("en-glissement") || syncEnCours) { minuteurBordsTaille_ = setTimeout(redimBords, 400); return; }
      if (vueBordsRendue_ === vueBordsActive() && sc.dataset.largeurBords === String(sc.clientWidth)) return;
      assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); majBarreSelection(); });
    }, 150);
  });
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
    assurerFenetreChargee(function () { glisserVersSemaine_(dir, function () { construireVueDepuisCache(); render(false); majBarreSelection(); }); });
  }

  // ---- Grille : jours voisins, balayage de semaine ----------------------

  // Jours voisins aux bords (suite 74) — Lionel : « le vendredi de la
  // semaine avant à gauche de l'écran et le lundi de la semaine suivante
  // à droite, coller au bord de l'écran comme si la suite était cachée
  // en dehors de l'écran. On retrouverai le petit espace entre les
  // semaine. Les nom seraient affiché que sur la partie centrale. » De
  // gauche à droite, à l'écran : un bord du vendredi d'avant (P), la
  // bande entre semaines (.sep-semaines, 8 px à cheval sur la frontière),
  // la colonne des noms, les jours de la (des) semaine(s) affichée(s), la
  // bande, un bord du lundi d'après, aussi large que celui du vendredi.
  // Les 3 (ou 4) semaines sont dans la grille en entier, en colonnes de
  // largeur fixe calculées pour la largeur réelle du .scroller :
  // le défilement horizontal, calé plus bas (cibleScrollLeft) et tenu
  // (écouteur "scroll"), cache le reste. Bord : 40 % d'un jour, entre 24
  // et 120 px. Round du 27.09.2026 (suite 82) — Lionel : « Jour voisins
  // n'affichent qu'une demi journée. » Bord : un jour entier (matin et
  // après-midi), exactement la largeur d'un jour de la semaine affichée.
  function poserGabaritJoursVoisins_(G) {
    var scroller = G.scroller, grilleEntete = G.grilleEntete, grilleCorps = G.grilleCorps, LN = G.LN, nbSemainesAffichees = G.nbSemainesAffichees;
    var zB = (niveauZoomPlanning / 100) || 1, cpjB = colsParJour(), nbC = nbSemainesAffichees - 2;
    var W = (scroller.clientWidth || (racineEl.clientWidth - 2) || 1200) / zB;
    // Une semaine : 5 jours de cpj colonnes (+ 1 px d'écart chacune), et
    // ses 2 colonnes de week-end de 46 px (+ 1).
    var weB = afficherWeekends ? 2 * 47 : 0;
    // 5 jours par semaine affichée + 2 jours entiers aux bords.
    var colB = Math.max(20, (W - LN - 4 - nbC * weB) / (5 * nbC + 2) / cpjB - 1);
    var P = Math.floor(cpjB * (colB + 1));
    // Colonne vide : la bande couvre ses 3 premiers px (+ 4 du vendredi),
    // les noms le reste, jusqu'au trait de 1 px avant le lundi.
    //
    // Round du 27.09.2026 (suite 75) — Lionel : « Pas de samedi-dimanche dans les
    // semaines adjacentes. » Week-ends de la semaine d'avant et de celle
    // d'après : colonnes de 0 px (leur contenu est masqué, cf.
    // colsWeVoisins) ; le vendredi d'avant reste donc collé à la bande. Les
    // 2 écarts de 1 px de ces colonnes sont repris sur la colonne vide :
    // le lundi reste à la même distance du vendredi.
    var espaceB = LN + 3 - (afficherWeekends ? 2 : 0);
    var gabaritB = LN + "px", nbColsB = 1, nbWeB = 0;
    for (var sB = 0; sB < nbSemainesAffichees; sB++) {
      if (sB === 1) { gabaritB += " " + espaceB + "px"; nbColsB++; }
      gabaritB += " repeat(" + (5 * cpjB) + ", " + colB + "px)"; nbColsB += 5 * cpjB;
      if (afficherWeekends) {
        var voisineB = sB === 0 || sB === nbSemainesAffichees - 1;
        gabaritB += voisineB ? " repeat(2, 0px)" : " repeat(2, 46px)"; nbColsB += 2;
        if (!voisineB) nbWeB++;
      }
    }
    var totalB = LN + espaceB + nbSemainesAffichees * 5 * cpjB * colB + nbWeB * 92 + (nbColsB - 1);
    grilleEntete.style.gridTemplateColumns = grilleCorps.style.gridTemplateColumns = gabaritB;
    grilleEntete.style.minWidth = grilleCorps.style.minWidth = totalB + "px";
    scroller.dataset.largeurBords = String(scroller.clientWidth);
    racineEl.style.setProperty("--noms-gauche", (P + 4) + "px");
    document.documentElement.style.setProperty("--largeur-visible-bulle", (W - 2 * P - LN - 20) + "px");
    return { P: P, largeur: W, zoom: zB };
  }

  // Bulles des jours voisins (round du 27.09.2026, suite 84) — Lionel :
  // « Si les bulles du jours de coté sont plus long elle n'apparaissent
  // pas complètement. Le but est que je puisse voir ce qui sera fait le
  // vendredi avant et le lundi après. il faut traiter ces jours de coté
  // comme le mode 1 jour du mobile. bulle et texte affichés sur le jour
  // même si la tâche est plus longue. » En vue « Jours voisins », l'écran
  // montre 3 morceaux de la grille : le vendredi d'avant (A), la semaine
  // (C, après la colonne des noms), le lundi d'après (B). Une bulle qui
  // déborde d'un morceau (commencée plus tôt dans la semaine d'avant,
  // finie plus tard dans celle d'après, ou à cheval sur la colonne des
  // noms) avait une seule carte : texte hors de l'écran ou sous les noms,
  // bout de carte vide de l'autre côté. Elle a désormais une carte par
  // morceau visible, chacune à la largeur de sa part et avec son texte
  // (.bulle-morceaux, style.css) : la carte d'origine pour la semaine
  // (ou la seule part visible), des copies (.b-carte-voisin, placées par
  // `order`) pour les jours voisins. La bulle elle-même (item de grille)
  // ne change pas : clic, glisser et poignées comme avant.
  function ajusterBullesJoursVoisins_(G) {
    var grilleCorps = G.grilleCorps, grilleEntete = G.grilleEntete, scroller = G.scroller, nbSemainesAffichees = G.nbSemainesAffichees;
    var bulles = [].slice.call(grilleCorps.querySelectorAll(".bulle")).concat([].slice.call(grilleEntete.querySelectorAll(".bulle")));
    bulles.forEach(function (b) {
      if (!b.classList.contains("bulle-morceaux")) return;
      b.classList.remove("bulle-morceaux");
      b.querySelectorAll(":scope > .b-carte-voisin").forEach(function (c) { c.remove(); });
      var c0 = b.querySelector(":scope > .b-carte");
      if (c0) c0.style.marginLeft = c0.style.width = c0.style.maxWidth = c0.style.order = "";
    });
    if (!vueBordsRendue_ || !scroller.getClientRects().length) return;
    var zoom = (niveauZoomPlanning / 100) || 1;
    var rS = scroller.getBoundingClientRect(), visG = rS.left + scroller.clientLeft, visD = visG + scroller.clientWidth;
    // Morceaux visibles d'après les en-têtes de jours : semaine d'avant
    // (0), semaine affichée (1), semaine d'après (2).
    var zones = [null, null, null];
    grilleEntete.querySelectorAll(".th[data-gi]").forEach(function (th) {
      var gi = +th.dataset.gi, s = estGiWeekend(gi) ? semaineDuGiWeekend(gi) : Math.floor(gi / 5);
      var k = s === 0 ? 0 : s >= nbSemainesAffichees - 1 ? 2 : 1;
      var r = th.getBoundingClientRect(), g = Math.max(r.left, visG), d = Math.min(r.right, visD);
      if (d - g < 1) return;
      zones[k] = zones[k] ? [Math.min(zones[k][0], g), Math.max(zones[k][1], d)] : [g, d];
    });
    bulles.forEach(function (b) {
      var carte = b.querySelector(":scope > .b-carte");
      if (!carte) return;
      var r = b.getBoundingClientRect();
      if (r.width < 1) return;
      var parts = [];
      zones.forEach(function (z, k) {
        if (!z) return;
        var g = Math.max(r.left, z[0]), d = Math.min(r.right, z[1]);
        if (d - g >= 1) parts.push({ g: g, d: d, k: k });
      });
      if (!parts.length || (parts.length === 1 && parts[0].g - r.left < 1 && r.right - parts[0].d < 1)) return;
      b.classList.add("bulle-morceaux");
      var principale = parts.filter(function (p) { return p.k === 1; })[0] || parts[0], x = r.left;
      parts.forEach(function (p, i) {
        var c = carte;
        if (p !== principale) {
          c = carte.cloneNode(true);
          c.classList.add("b-carte-voisin");
          c.setAttribute("aria-hidden", "true");
          b.appendChild(c);
        }
        c.style.order = String(i);
        c.style.marginLeft = ((p.g - x) / zoom) + "px";
        c.style.width = c.style.maxWidth = ((p.d - p.g) / zoom) + "px";
        x = p.d;
      });
    });
  }

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
  // Round du 28.09.2026 (suite 89) — Lionel : « sur tablette une petite
  // Zone n'est pas visible, il faut légèrement balayer l'écran, ce qui fait
  // changer la semaine. idée: balayage depuis coté droit avance une
  // semaine, depuis côté gauche recule une semaine. défilement au centre ».
  // Avant, TOUT balayage qui continuait au-delà de la butée changeait de
  // semaine : pour voir les quelques pixels cachés d'une grille à peine
  // plus large que l'écran, le doigt arrivait en butée presque aussitôt.
  // Désormais, c'est l'endroit où le doigt se pose qui décide :
  // - dans la bande du bord droit (zoneBordSemaine_) et vers la gauche :
  //   semaine suivante ; bande du bord gauche et vers la droite :
  //   précédente — où que soit le défilement, sans faire défiler ;
  // - ailleurs (le centre) : défilement seul, jamais de changement de
  //   semaine.
  function cablerBalayageSemaine_(G) {
    var scroller = G.scroller, enModeJourMobile = G.enModeJourMobile;
    function zoneBordSemaine_() {
      var r = scroller.getBoundingClientRect();
      var g = Math.max(r.left, 0), d = Math.min(r.right, window.innerWidth);
      return { g: g, d: d, largeur: Math.max(48, Math.min(120, (d - g) * .12)) };
    }
    var seuilBordSemaine = 46, toucheDebutX = null, toucheDebutY = null, toucheAxe = null, toucheBord = null, toucheZone = null;
    scroller.addEventListener("touchstart", function (e) {
      toucheDebutX = (e.touches.length === 1) ? e.touches[0].clientX : null;
      toucheDebutY = (e.touches.length === 1) ? e.touches[0].clientY : null;
      toucheAxe = null;
      toucheBord = null;
      toucheZone = null;
      if (toucheDebutX !== null) {
        var z = zoneBordSemaine_();
        toucheZone = toucheDebutX <= z.g + z.largeur ? "gauche" : toucheDebutX >= z.d - z.largeur ? "droite" : "centre";
      }
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
      // Jours voisins aux bords : rien à faire défiler (la vue tient juste
      // dans l'écran), le balayage change de semaine partout, comme avant.
      var zone = vueBordsRendue_ ? (dx < 0 ? "droite" : "gauche") : toucheZone;
      // Chrome ne laisse annuler que les premiers déplacements, avant que la
      // page ne défile : un départ franchement horizontal depuis un bord est
      // retenu tout de suite.
      if (!toucheAxe && zone !== "centre" && Math.abs(dx) > Math.abs(dy) && e.cancelable) e.preventDefault();
      if (!toucheAxe && Math.abs(dx) + Math.abs(dy) > SEUIL_DEFILEMENT) toucheAxe = axeDuGeste(dx, dy);
      if (toucheAxe !== "x" || zone === "centre") { toucheBord = null; return; }
      toucheZone = zone;
      // Balayage parti d'un bord : il tourne la page, la grille ne défile pas.
      if (e.cancelable) e.preventDefault();
      if (toucheZone === "gauche" && dx > seuilBordSemaine) toucheBord = "debut";
      else if (toucheZone === "droite" && dx < -seuilBordSemaine) toucheBord = "fin";
      else toucheBord = null;
    }, { passive: false });
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
      // Jours voisins aux bords (suite 74) : défilement tenu, toujours « en
      // butée » des deux côtés — le geste change de semaine.
      if (!vueBordsRendue_ && (dx < 0 ? !auDebut : !aLaFin)) { accumulMolette = 0; return; }
      e.preventDefault();
      accumulMolette += dx;
      clearTimeout(resetAccumulMolette);
      resetAccumulMolette = setTimeout(function () { accumulMolette = 0; }, 400);
      if (accumulMolette <= -seuilMolette) { accumulMolette = 0; naviguerSemaineDepuisBordJour(-1); }
      else if (accumulMolette >= seuilMolette) { accumulMolette = 0; naviguerSemaineDepuisBordJour(1); }
    }, { passive: false });
  }
