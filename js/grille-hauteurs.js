"use strict";
  /* ============================================================
     HAUTEURS FIXES ET CASCADE — commun à l'ordinateur, la tablette et
     le téléphone.
     Round du 29.09.2026 (suite 99) — découpage de l'affichage du
     planning (Lionel : « Ne serait-il pas plus judicieux de faire 2
     application différente pour portable et pour deskop? », puis
     « Allons-y » au plan proposé), étape 2 : sorti tel quel de
     js/grille-rendu.js. Lignes de hauteur fixe (suites 91 et 92),
     bulles en cascade et pastille « +N » (suite 98), bulle sélectionnée
     dépliée (suites 93 et 95) et poignées calées sur leurs cartes
     (suite 97). Les fonctions qui touchent la grille reçoivent G, l'objet
     du rendu (cf. construireGrille et grilleCourante_, grille-rendu.js).
     ============================================================ */

  // ---- Bulle sélectionnée dépliée (round du 29.09.2026, suite 93) -----
  // Lionel : « Sélectionner une bulle fait apparaître son texte en entier
  // ainsi que sa hauteur de bulle complète si tronquée. » Le dépliage
  // lui-même est en CSS (.bulle.selectionnee, style.css). Ici : une carte
  // dépliée qui dépasserait le bas de sa grille (dernière ligne du
  // planning) serait coupée par .scroller (overflow-y: hidden) ; elle
  // remonte d'autant (transform, qui s'ajoute au translate de la
  // cascade), sans passer au-dessus du haut de la grille. Appelée à chaque
  // changement de sélection (majBarreSelection) et après chaque cascade.
  //
  // Round du 29.09.2026 (suite 95) — Lionel : « L'agrandissement d'une
  // bulle sélectionnée peut se faire d'une demi case à droite ou à gauche
  // (dans sa demi journée opposée) pour éviter qu'elle ne prenne trop de
  // hauteur, la décaler contre le haut si elle passe dessous une ligne de
  // séparation. » Puis, même round : « il serait plutôt judicieux
  // d'élargir la bulle de quelques pixels et la centrer sur sa case quand
  // c'est possible, sinon […] la faire déborder à gauche ou à droite si
  // elle est en bout de planning. » Carte dépliée plus haute qu'une carte
  // fixe (U) : ELARGI_SEL_ px de plus de chaque côté, centrée sur sa case ;
  // au bord du planning visible (colonne des noms, bord droit), le
  // débordement passe tout entier de l'autre côté. Marges négatives
  // (gauche et droite) : la place de la carte dans sa bulle ne change pas
  // (en vue « 1 jour », les cartes des autres jours ne bougent pas). Puis,
  // si son bas passe sous la ligne de séparation du bas de sa ligne, elle
  // remonte, au plus jusqu'au haut de la ligne. En multi-sélection
  // (body.selection-multiple), rien : les bulles ne se déplient pas.
  // Largeur et marges d'origine gardées en data-deplie, remises au
  // changement suivant (sauf si un rendu les a reposées entre-temps).
  var ELARGI_SEL_ = 12;
  function remonterCartesSelection() {
    document.querySelectorAll("#racine .bulle > .b-carte[data-remonte]").forEach(function (c) {
      c.style.transform = ""; delete c.dataset.remonte;
    });
    document.querySelectorAll("#racine .bulle > .b-carte[data-deplie]").forEach(function (c) {
      var o = JSON.parse(c.dataset.deplie);
      if (c.style.width === o.w1) c.style.width = o.w0;
      if (c.style.marginLeft === o.m1) c.style.marginLeft = o.m0;
      if (c.style.marginRight === o.r1) c.style.marginRight = o.r0;
      delete c.dataset.deplie;
    });
    if (document.body.classList.contains("selection-multiple") || !racineEl.classList.contains("hauteurs-fixes")) { placerPoigneesCartes_(); return; }
    var cs = getComputedStyle(racineEl), px = function (v) { return parseFloat(cs.getPropertyValue(v)) || 0; };
    var marge = 3, sc = document.querySelector("#racine .scroller");
    var rs = sc ? sc.getBoundingClientRect() : null;
    document.querySelectorAll("#racine .bulle.selectionnee").forEach(function (b) {
      var g = b.closest(".grille"), cartes = [].filter.call(b.querySelectorAll(":scope > .b-carte"), function (c) { return c.offsetWidth > 0; });
      if (!g || !cartes.length) return;
      var jal = b.classList.contains("bulle-jalon") || b.classList.contains("bulle-note");
      // Suite 103 : hauteur lue sur la bulle (sa ligne peut être réglée à part).
      var u = px(jal ? "--mob-carte-jal" : "--mob-carte-pers"), h = parseFloat(getComputedStyle(b).getPropertyValue(jal ? "--mob-h-jal" : "--mob-h-pers")) || 0;
      var rg = g.getBoundingClientRect();
      // Planning visible, à l'écran : de la colonne des noms (collante) au
      // bord droit du planning.
      cartes.forEach(function (c) {
        if (!u || c.offsetHeight <= u + 1) return;
        var r = c.getBoundingClientRect(), k = c.offsetWidth ? r.width / c.offsetWidth : 1;
        var gMin = Math.max(rg.left, rs ? rs.left : rg.left) + largeurNoms() * k, gMax = Math.min(rg.right, rs ? rs.right : rg.right) - 2;
        if (r.right < gMin || r.left > gMax) return; // carte d'un autre jour, hors de l'écran
        var e = ELARGI_SEL_ * k, gauche = r.left - e, droite = r.right + e;
        if (gauche < gMin) { droite = Math.min(gMax, droite + gMin - gauche); gauche = gMin; }
        if (droite > gMax) { gauche = Math.max(gMin, gauche - (droite - gMax)); droite = gMax; }
        var dg = Math.max(0, r.left - gauche) / k, dd = Math.max(0, droite - r.right) / k;
        if (dg + dd < 0.5) return;
        var ccs = getComputedStyle(c);
        var o = { w0: c.style.width, m0: c.style.marginLeft, r0: c.style.marginRight };
        c.style.width = (c.offsetWidth + dg + dd) + "px";
        c.style.marginLeft = (parseFloat(ccs.marginLeft) - dg) + "px";
        c.style.marginRight = (parseFloat(ccs.marginRight) - dd) + "px";
        o.w1 = c.style.width; o.m1 = c.style.marginLeft; o.r1 = c.style.marginRight;
        c.dataset.deplie = JSON.stringify(o);
      });
      // Remontée : sous le bas de la ligne (bulle posée en haut de sa
      // ligne, H de haut), puis sous le bas de la grille (dernière ligne
      // du planning, coupée par .scroller) — jamais au-dessus du haut de
      // la ligne, ni de la grille. k : zoom du planning (mesures à l'écran,
      // décalage en px de la page).
      var rb = b.getBoundingClientRect();
      cartes.forEach(function (c) {
        var r = c.getBoundingClientRect(), k = c.offsetHeight ? r.height / c.offsetHeight : 1;
        var dLigne = h && !b.classList.contains("cascade-ouverte") ? Math.min(r.bottom - (rb.top + (h - marge) * k), r.top - (rb.top + marge * k)) : 0;
        var dGrille = Math.min(r.bottom - rg.bottom + 2, r.top - rg.top);
        var d = Math.max(dLigne, dGrille);
        if (d > 0.5) { c.style.transform = "translateY(" + (-Math.round(d / k)) + "px)"; c.dataset.remonte = "1"; }
      });
    });
    placerPoigneesCartes_();
  }
  // Round du 29.09.2026 (suite 97) — Lionel, captures à l'appui : « Sur
  // mobile, plusieurs incohérences au niveau des sélections et des
  // poignées. » Les poignées (.poignee-g / -d) couvraient toute la hauteur
  // de la BULLE (top/bottom 0, soit U) et ses bords d'origine ; depuis la
  // suite 95 la carte fait la hauteur de son texte, et, sélectionnée, se
  // déplie, s'élargit (marges négatives) et remonte (transform). Leur trait
  // tombait donc sous une carte courte (à cheval sur la ligne suivante), en
  // retrait d'une carte élargie, à côté d'une carte remontée. Chaque
  // poignée prend maintenant la place de sa carte (la première pour la
  // gauche, la dernière pour la droite, comme la cascade) : même haut, même
  // hauteur, même bord, même remontée. Lectures d'abord, écritures ensuite
  // (une seule mise en page).
  function placerPoigneesCartes_() {
    var fixes = racineEl.classList.contains("hauteurs-fixes"), aPoser = [];
    document.querySelectorAll("#racine .bulle").forEach(function (b) {
      var pg = b.querySelector(":scope > .poignee-g"), pd = b.querySelector(":scope > .poignee-d");
      var cs = b.querySelectorAll(":scope > .b-carte");
      if (!pg || !pd || !cs.length) return;
      if (!fixes) { aPoser.push([pg, "", "", "", "", ""], [pd, "", "", "", "", ""]); return; }
      var c0 = cs[0], c1 = cs[cs.length - 1];
      aPoser.push([pg, c0.offsetTop + "px", c0.offsetHeight + "px", c0.offsetLeft + "px", "", c0.style.transform]);
      aPoser.push([pd, c1.offsetTop + "px", c1.offsetHeight + "px", "", (b.clientWidth - c1.offsetLeft - c1.offsetWidth) + "px", c1.style.transform]);
    });
    aPoser.forEach(function (x) {
      var st = x[0].style, v = x[1] ? "auto" : "";
      if (st.top !== x[1]) st.top = x[1];
      if (st.bottom !== v) st.bottom = v;
      if (st.height !== x[2]) st.height = x[2];
      if (x[0].classList.contains("poignee-g") && st.left !== x[3]) st.left = x[3];
      if (x[0].classList.contains("poignee-d") && st.right !== x[4]) st.right = x[4];
      if (st.transform !== x[5]) st.transform = x[5];
    });
  }

  // ---- Vue « 1 jour » du téléphone : lignes de hauteur fixe -----------
  // Round du 28.09.2026 (suite 91) — Lionel : « Je pense qu'il serait
  // judicieux de passer à des hauteur de ligne fixe sur mobile. Plus de
  // calculs de hauteur de ligne. Si pas assez de place les bulles se
  // chevaucheront telle des post'it. Ajouter un réglage d'affichage mobile
  // permettant de choisir sa hauteur de ligne. Réglage différents pour
  // hauteurs des lignes jalons/notes. Pour un réglage de base partir sur
  // une hauteur contenant 2 bulles de 2hauteurs de texte. » Puis, à nos
  // questions : réglage « en nombre de bulles », chevauchement « en
  // cascade », Jalons/Notes « 1 bulle d'1 ligne » par défaut, « téléphone
  // seulement » (tablette et ordinateur gardent leurs hauteurs calculées).
  //
  // Tout ce qui s'était empilé depuis la suite 34 pour passer d'un jour à
  // l'autre disparaît : largeurs des cartes recalculées pendant le geste
  // (suites 37, 41, 42, 72), hauteurs de lignes mesurées pour le jour
  // posé, glissées puis interpolées sous le doigt (suites 35, 57, 58),
  // bulles tenues à leur place (suite 73), photos de la page (suite 90).
  // Chacun remettait en page la grille entière, ou la faisait
  // photographier, en plein geste. Désormais :
  // - toutes les lignes de personnes ont la même hauteur, tous les jours :
  //   la place de N bulles (réglage « Hauteur des lignes », page Affichage,
  //   téléphone : 1 à 4, 2 à l'origine) de L lignes de texte (« Lignes de
  //   texte », 2 à l'origine) ; Jalons et Notes, la leur (« Jalons et
  //   Notes » : 1 ou 2 bulles d'1 ou 2 lignes, 1 bulle d'1 ligne à
  //   l'origine) — suite 101 : une hauteur en pixels, qui ne dépend plus
  //   des lignes de texte (reglagesLignesMobile_). Hauteur d'une carte
  //   mesurée une fois au rendu, sur une
  //   carte sonde (mesurerHauteursMobile_) ; pistes de la grille posées
  //   une fois (poserPistesFixes_) ;
  // - une bulle de plusieurs jours a une carte par jour couvert, chacune à
  //   la largeur de sa part, texte au début (decouperBullesJourMobile_) :
  //   plus de carte collée au bord de l'écran (sticky) à recalculer ;
  // - les bulles d'une même personne et d'un même jour sont en cascade
  //   (cascaderBullesJourMobile_) : l'une sous l'autre tant qu'il y a la
  //   place, sinon chacune descend d'un pas régulier et recouvre le bas de
  //   la précédente, le haut de chacune restant visible, comme des post-it.
  //   Un appui sur une bulle la sélectionne et la passe devant (style.css) ;
  // - changer de jour n'est plus qu'un défilement : rien à mesurer ni à
  //   écrire pendant le geste, ni à l'arrêt.
  // Round du 29.09.2026 (suite 113). Lionel : « L'espace sous les bulles
  // est trop grand. ajoute un réglage qui permet d'adapter l'espace qu'on
  // souhaite entre chaque bulles et fond de case ». L'espace venait de la
  // pile : chaque bulle occupait la place d'une carte pleine (U, « Lignes
  // de texte » + statut) même quand son texte tenait sur une ligne. Les
  // bulles s'empilent maintenant à leur hauteur réelle (cascaderBulles-
  // JourMobile_) ; l'espace au-dessus, entre et sous elles, jusque-là fixe
  // (3 px), devient le réglage « Espace entre les bulles » (page Affichage
  // et panneau Hauteur, un par appareil).
  function margeBulles_() {
    var v = parseFloat(optionAffichage(profilAppareil_() === "ordi" ? "espaceBullesOrdi" : "espaceBullesTel"));
    return isFinite(v) && v >= 0 ? v : 3;
  }
  var PAS_MINI_MOB_ = 20;   // px : décalage minimal entre 2 bulles en cascade
  var VU_MINI_MOB_ = 10;    // px : en dessous, une bulle de la cascade compte comme cachée (suite 98)
  // « 4 / span 2 » → [4, 2] ; « 4 » → [4, 1].
  function plageGrille_(v) {
    var m = /^(\d+)(?:\s*\/\s*span\s+(\d+))?/.exec(v || "");
    return m ? [+m[1], m[2] ? +m[2] : 1] : null;
  }
  // Réglages de l'appareil (page Affichage) : hauteur des lignes de
  // personnes et des lignes Jalons/Notes, lignes de texte d'une bulle.
  // Round du 29.09.2026 (suite 101) — Lionel : « les hauteurs ne doivent
  // pas etre calculer en fonction du réglage texte dans les bulles.
  // réglage maintenant en pixels. même chose pour jalons et notes. » La
  // hauteur d'une ligne (h) est le réglage lui-même, en pixels ; les
  // lignes de texte (l) ne donnent plus que la hauteur d'une bulle.
  // Ordinateur et tablette d'un côté, téléphone de l'autre (profil).
  function reglagesLignesMobile_() {
    var ordi = profilAppareil_() === "ordi";
    var px = function (id, d) { var v = parseFloat(optionAffichage(id)); return isFinite(v) && v > 0 ? v : d; };
    return {
      pers: { h: px(ordi ? "hauteurLigneOrdi" : "hauteurLigneTel", ordi ? 117 : 89), l: Math.max(1, Math.min(3, +optionAffichage("lignes") || 2)) },
      jal: { h: px(ordi ? "hauteurJalOrdi" : "hauteurJalTel", 32), l: optionAffichage("lignesJal") === "2" ? 2 : 1 }
    };
  }
  // Hauteur d'une carte de `lignes` lignes de texte : une carte sonde,
  // texte assez long pour remplir toutes ses lignes, posée invisible dans
  // la grille (mêmes règles CSS que les vraies). Puis hauteur de ligne :
  // N cartes et leurs marges. Posées en variables sur #racine
  // (--mob-h-pers, --mob-carte-pers…, lues par style.css et par les
  // pistes de poserPistesFixes_).
  // Suite 92 : la sonde des personnes porte aussi un badge de statut —
  // sur ordinateur, « Statut : Badge » ajoute sa ligne sous le texte
  // (en pastille ou masqué, et toujours en vue « 1 jour », il ne prend
  // aucune place : style.css).
  function hauteurCarteSonde_(grille, classe, lignes, avecStatut) {
    var b = document.createElement("div");
    b.className = "bulle bulle-plage bulle-sonde " + classe;
    b.setAttribute("aria-hidden", "true");
    b.style.cssText = "position:absolute;left:0;top:0;width:44px;visibility:hidden;pointer-events:none";
    b.innerHTML = '<div class="b-carte" style="height:auto;max-height:none;width:44px"><span class="b-txt"></span>' +
      (avecStatut ? '<span class="b-statut"><span class="dot"></span>Statut</span>' : '') + '</div>';
    var t = b.querySelector(".b-txt");
    t.textContent = new Array(9).join("Mesure ");
    t.style.webkitLineClamp = t.style.lineClamp = String(lignes);
    grille.appendChild(b);
    var h = b.firstChild.offsetHeight;
    b.remove();
    return h;
  }
  // Suite 92 : N peut être décimal (curseur de l'ordinateur) — H au
  // pixel près, arrondi au dixième.
  // Suite 101 : H est le réglage (pixels) ; N, le nombre de bulles qui y
  // tiennent l'une sous l'autre (décimal, au moins 1), n'est plus que
  // déduit : il sert à la cascade (au-delà, chevauchement).
  function mesurerHauteursMobile_(G) {
    var scroller = G.scroller, grilleCorps = G.grilleCorps, grilleEntete = G.grilleEntete;
    if (!scroller.getClientRects().length) return false;
    var r = reglagesLignesMobile_(), m = margeBulles_();
    var mes = {};
    [["pers", grilleCorps, "bulle-tache"], ["jal", grilleEntete, "bulle-note"]].forEach(function (d) {
      var u = hauteurCarteSonde_(d[1], d[2], r[d[0]].l, d[0] === "pers"), h = r[d[0]].h;
      mes[d[0]] = { n: Math.max(1, (h - m) / (u + m)), u: u, h: h };
    });
    if (!mes.pers.u) return false;
    G.mesuresMob_ = hauteursLignesMesurees = mes;
    racineEl.style.setProperty("--mob-carte-pers", mes.pers.u + "px");
    racineEl.style.setProperty("--mob-h-pers", mes.pers.h + "px");
    racineEl.style.setProperty("--mob-carte-jal", mes.jal.u + "px");
    racineEl.style.setProperty("--mob-h-jal", mes.jal.h + "px");
    racineEl.style.setProperty("--mob-lignes-jal", String(r.jal.l));
    return true;
  }
  // Pistes de la grille : hauteur fixe pour les lignes de personnes
  // (étiquette marquée data-h-mob="pers") et de Jalons/Notes ("jal"), à
  // leur contenu pour le reste (dates, horaires, bandes Personnel /
  // Intervenants). Une seule piste par personne en vue « 1 jour » (cf.
  // ligneGroupePersonnesCompact) : la cascade remplace l'empilement.
  // Suite 103 : une ligne réglée à part (hauteursLignesPerso_, étiquette
  // marquée data-ligne) prend sa hauteur en pixels au lieu de la variable
  // commune ; g._hLignesMob la garde pour la cascade. Chaque étiquette
  // reçoit sa poignée (trait du bas, cf. cablerHauteurLigne_).
  function poserPistesFixes_(G) {
    var grilleEntete = G.grilleEntete, grilleCorps = G.grilleCorps;
    var perso = hauteursLignesPerso_(), repliees = lignesRepliees_();
    [grilleEntete, grilleCorps].forEach(function (g) {
      var nb = 0, fixes = {}, hPerso = {}, rangsReplies = {};
      [].forEach.call(g.children, function (el) {
        // Suite 105 : lignes et jours choisis gardent leur marque au rendu.
        if (el.dataset.ligne) el.classList.toggle("ligne-choisie", lignesChoisies_.indexOf(el.dataset.ligne) >= 0);
        else if (el.dataset.gi && el.classList.contains("th") && !el.classList.contains("th-demi")) el.classList.toggle("jour-choisi", joursChoisis_.indexOf(isoDeGi(+el.dataset.gi)) >= 0);
        var r = plageGrille_(el.style.gridRow);
        if (!r) return;
        nb = Math.max(nb, r[0] + r[1] - 1);
        if (!el.dataset.hMob) return;
        fixes[r[0]] = el.dataset.hMob;
        var id = el.dataset.ligne;
        if (!id) return;
        if (perso[id] > 0) hPerso[r[0]] = perso[id];
        el.classList.toggle("ligne-perso", perso[id] > 0);
        // Suite 116 : ligne repliée.
        var repliee = repliees.indexOf(id) >= 0;
        if (repliee) { rangsReplies[r[0]] = true; if (el.dataset.titreNormal == null) el.dataset.titreNormal = el.title || ""; }
        el.classList.toggle("ligne-repliee", repliee);
        if (repliee) el.title = "Ligne repliée — clic : la déplier";
        else if (el.dataset.titreNormal != null) { el.title = el.dataset.titreNormal; delete el.dataset.titreNormal; }
        // Suite 141 : chevron des lignes Transports / Machines.
        var bRepli = el.querySelector(":scope > .ligne-repli");
        if (bRepli) {
          bRepli.textContent = repliee ? "▸" : "▾";
          bRepli.title = repliee ? "Déplier la ligne" : "Replier la ligne";
          bRepli.setAttribute("aria-expanded", String(!repliee));
        }
        if (!el.querySelector(":scope > .poignee-ligne")) {
          var pg = document.createElement("span");
          pg.className = "poignee-ligne";
          pg.title = "Glisser : hauteur de la ligne — double-clic : ajuster au contenu";
          el.appendChild(pg);
        }
      });
      [].forEach.call(g.children, function (el) {
        if (el.dataset.ligne) return;
        var r = plageGrille_(el.style.gridRow);
        el.classList.toggle("en-ligne-repliee", !!(r && rangsReplies[r[0]]));
      });
      var t = [];
      for (var i = 1; i <= nb; i++) t.push(!fixes[i] ? "auto" : rangsReplies[i] ? HAUTEUR_REPLIEE_ + "px" : hPerso[i] ? hPerso[i] + "px" : "var(--mob-h-" + fixes[i] + ")");
      g.style.gridTemplateRows = t.join(" ");
      g._lignesMob = fixes;
      g._hLignesMob = hPerso;
      g._lignesRepliees = rangsReplies;
    });
  }
  // Cascade : pour chaque ligne (une personne, Jalons, Notes) et chaque
  // jour, les bulles présentes ce jour-là sont rangées par piste
  // (assignerPistesCompact, la même sur toute la fenêtre — deux bulles
  // qui ne se chevauchent pas, matin et après-midi, restent côte à côte),
  // pistes vides ce jour-là sautées. Rang k : k·(U + marge) sous la
  // première tant que les n bulles tiennent dans la ligne (n ≤ N), sinon
  // un pas régulier (H − 2·marge − U)/(n − 1) : la dernière finit pile au
  // bas de la ligne, chacune recouvre le bas de la précédente. Pas jamais
  // sous PAS_MINI_MOB_ (sinon, avec la place d'une seule bulle, toutes
  // tombaient au même endroit) : le haut de chaque bulle reste visible,
  // les dernières rognées au bas de la ligne (clip-path, style.css). Les bulles
  // sont posées dans l'ordre des pistes (ligneGroupePersonnesCompact) :
  // la suivante passe par-dessus la précédente. Décalage par `translate`
  // sur chaque carte (et sur les poignées, comme leur carte) : rien n'est
  // remis en page.
  //
  // Round du 29.09.2026 (suite 92) — hors de la vue « 1 jour » (ordinateur,
  // tablette, téléphone en semaine), une bulle garde une seule carte, au
  // même rang sur toute sa durée (Lionel, à notre question : « une seule
  // bulle ») : les bulles d'une ligne sont regroupées en amas, de proche
  // en proche tant qu'elles se chevauchent (colonnes de la grille) ; dans
  // chaque amas, même rangement par piste et même pas que par jour
  // ci-dessus. Une bulle seule dans son amas reste en haut de sa ligne.
  //
  // Round du 29.09.2026 (suite 98) — Lionel, capture à l'appui : « sur un
  // demi jour je ne vois pas une bulle car la ligne est trop petite. J'ai
  // une bulle verte cachée derrière la bulle bleu. » Puis, à notre
  // question : « La pastille, mais un appuis sur la pastille montre les
  // bulles du jour sans changer la hauteur des lignes. Un nouvel appuis
  // replace les bulles. » Bulle de la cascade dont moins de VU_MINI_MOB_
  // px dépassent au-dessus du bas de sa ligne : cachée. Une pastille
  // « +N » (N bulles cachées) se pose dans le coin bas droit de la
  // demi-journée de ces bulles. Un appui étale les bulles de la case
  // (même ligne, même jour — hors vue « 1 jour » : même amas) : une
  // hauteur de carte d'écart, sans chevauchement, par-dessus les lignes
  // suivantes (la ligne garde sa hauteur ; remontées d'autant si elles
  // dépassaient le bas du planning). La pastille devient « − » ; un nouvel
  // appui les replace en cascade. Changer de jour les replace aussi.
  function isoDeColonne_(G, col) {
    var grilleEntete = G.grilleEntete;
    var th = [].filter.call(grilleEntete.querySelectorAll(".th[data-gi]"), function (t) {
      var c = plageGrille_(t.style.gridColumn);
      return c && col >= c[0] && col < c[0] + c[1];
    })[0];
    return th ? isoDeGi(+th.dataset.gi) + ":" + (col - plageGrille_(th.style.gridColumn)[0]) : "c" + col;
  }
  function cascaderBullesJourMobile_(G) {
    var grilleCorps = G.grilleCorps, grilleEntete = G.grilleEntete, enModeJourMobile = G.enModeJourMobile;
    if (!G.mesuresMob_) return;
    var joursCol = [].map.call(grilleCorps.querySelectorAll(".snap-jour"), function (el) {
      var c = plageGrille_(el.style.gridColumn) || [0, 0];
      return { col: c[0], fin: c[0] + c[1] };
    }).sort(function (a, b) { return a.col - b.col; });
    [grilleEntete, grilleCorps].forEach(function (g) {
      var lignes = g._lignesMob || {}, parLigne = {};
      g.querySelectorAll(":scope > .pastille-cachees").forEach(function (el) { el.remove(); });
      g.querySelectorAll(":scope > .bulle.cascade-ouverte").forEach(function (b) { b.classList.remove("cascade-ouverte"); });
      [].forEach.call(g.children, function (b) {
        if (!b.classList.contains("bulle") || b.classList.contains("bulle-sonde")) return;
        var r = plageGrille_(b.style.gridRow);
        if (!r || !lignes[r[0]] || (g._lignesRepliees || {})[r[0]]) return;
        (parLigne[r[0]] = parLigne[r[0]] || []).push(b);
      });
      g._nMaxLignes = {};
      g._basMax = {};
      Object.keys(parLigne).forEach(function (row) {
        var mes = G.mesuresMob_[lignes[row]], m = margeBulles_();
        // Suite 103 : ligne réglée à part — même carte (U), sa hauteur
        // (H) et donc son nombre de bulles (N) ; la variable de hauteur
        // posée sur ses bulles règle leur rognage (clip-path, style.css).
        var hPerso = (g._hLignesMob || {})[row], varH = "--mob-h-" + lignes[row];
        if (hPerso) mes = { u: mes.u, h: hPerso, n: Math.max(1, (hPerso - m) / (mes.u + m)) };
        parLigne[row].forEach(function (b) { if (hPerso) b.style.setProperty(varH, hPerso + "px"); else b.style.removeProperty(varH); });
        var groupes = [];
        if (enModeJourMobile) {
          var parJour = {};
          parLigne[row].forEach(function (b) {
            var piste = +b.dataset.piste || 0;
            [].forEach.call(b.querySelectorAll(":scope > .b-carte"), function (c) {
              (parJour[c.dataset.jour] = parJour[c.dataset.jour] || []).push({ c: c, piste: piste, b: b });
            });
          });
          groupes = Object.keys(parJour).map(function (j) { parJour[j].jour = +j; return parJour[j]; });
        } else {
          var amas = null, fin = -1;
          parLigne[row].map(function (b) { return { b: b, col: plageGrille_(b.style.gridColumn) || [0, 1] }; })
            .sort(function (a, b) { return a.col[0] - b.col[0]; })
            .forEach(function (x) {
              if (!amas || x.col[0] >= fin) { amas = []; groupes.push(amas); fin = -1; }
              fin = Math.max(fin, x.col[0] + x.col[1]);
              var piste = +x.b.dataset.piste || 0;
              [].forEach.call(x.b.querySelectorAll(":scope > .b-carte"), function (c) { amas.push({ c: c, piste: piste, b: x.b }); });
            });
        }
        groupes.forEach(function (cartes) {
          var pistes = [];
          cartes.forEach(function (x) { if (pistes.indexOf(x.piste) < 0) pistes.push(x.piste); });
          pistes.sort(function (a, b) { return a - b; });
          var n = pistes.length;
          g._nMaxLignes[row] = Math.max(g._nMaxLignes[row] || 0, n);
          // Suite 113 : chaque piste à la hauteur de sa plus haute carte
          // (au plus U), la suivante juste dessous, à m px.
          var hPiste = pistes.map(function () { return 0; });
          cartes.forEach(function (x) {
            var k = pistes.indexOf(x.piste);
            hPiste[k] = Math.max(hPiste[k], Math.min(mes.u, x.c.offsetHeight || mes.u));
          });
          var yReel = [], yy = m;
          hPiste.forEach(function (h, k) { yReel[k] = yy; yy += h + m; });
          var bas = yReel[n - 1] + hPiste[n - 1];
          g._basMax[row] = Math.max(g._basMax[row] || 0, bas);
          // Tout tient : pile réelle. Sinon, cascade d'un pas régulier comme
          // avant, la dernière carte au bas de la ligne.
          var tient = bas + m <= mes.h + 0.5;
          var pas = n < 2 ? 0 : Math.max(Math.min(PAS_MINI_MOB_, mes.u + m), (mes.h - 2 * m - hPiste[n - 1]) / (n - 1));
          var yDe = function (k) { return tient ? yReel[k] : m + k * pas; };
          // Suite 98 : bulles cachées (colonnes de leur part de journée),
          // pastille « +N », case étalée si elle est ouverte.
          var cachees = [], c0 = Infinity, c1 = 0, d0 = Infinity;
          cartes.forEach(function (x) {
            var cb = plageGrille_(x.b.style.gridColumn) || [0, 1], a = cb[0], z = cb[0] + cb[1];
            var jc = cartes.jour != null ? joursCol[cartes.jour] : null;
            if (jc) { a = Math.max(a, jc.col); z = Math.min(z, jc.fin); }
            d0 = Math.min(d0, a);
            if (mes.h - yDe(pistes.indexOf(x.piste)) >= VU_MINI_MOB_) return;
            if (cachees.indexOf(x.piste) < 0) cachees.push(x.piste);
            c0 = Math.min(c0, a); c1 = Math.max(c1, z);
          });
          var cle = (g === grilleEntete ? "e" : "c") + row + "|" + isoDeColonne_(G, d0);
          var ouverte = cachees.length > 0 && !!G.cascadesOuvertes_[cle], decale = 0;
          if (ouverte) {
            tient = true;
            var rG = g.getBoundingClientRect(), kz = g.offsetHeight ? rG.height / g.offsetHeight : 1;
            var haut = (cartes[0].b.getBoundingClientRect().top - rG.top) / kz;
            decale = Math.max(0, Math.min(haut, haut + bas + 2 - g.offsetHeight));
          }
          if (cachees.length && c1 > c0) {
            var pc = document.createElement("button");
            pc.type = "button";
            pc.className = "pastille-cachees" + (ouverte ? " ouverte" : "");
            pc.textContent = ouverte ? "\u2212" : "+" + cachees.length;
            pc.title = ouverte ? "Replacer les bulles" : cachees.length + (cachees.length > 1 ? " bulles cachées : les montrer" : " bulle cachée : la montrer");
            pc.setAttribute("aria-label", pc.title);
            pc.style.gridRow = row;
            pc.style.gridColumn = c0 + " / " + c1;
            pc.addEventListener("click", function (e) {
              e.stopPropagation();
              if (G.cascadesOuvertes_[cle]) delete G.cascadesOuvertes_[cle]; else G.cascadesOuvertes_[cle] = true;
              cascaderBullesJourMobile_(G);
            });
            g.appendChild(pc);
          }
          cartes.forEach(function (x) {
            var rang = pistes.indexOf(x.piste), y = yDe(rang) - decale;
            if (ouverte) x.b.classList.add("cascade-ouverte");
            x.c.style.translate = "0 " + Math.round(y * 10) / 10 + "px";
            // Suite 94 : carte posée sur une autre de la pile (ombre et
            // liseré en haut, style.css) — lisible même de même couleur.
            x.c.toggleAttribute("data-empile", rang > 0);
          });
        });
        parLigne[row].forEach(function (b) {
          var cs = b.querySelectorAll(":scope > .b-carte");
          if (!cs.length) return;
          var pg = b.querySelector(":scope > .poignee-g"), pd = b.querySelector(":scope > .poignee-d");
          if (pg) pg.style.translate = cs[0].style.translate;
          if (pd) pd.style.translate = cs[cs.length - 1].style.translate;
        });
      });
    });
    remonterCartesSelection(); // suite 93
  }
  // Curseurs de hauteur (suite 92, barre d'outils et page Affichage) :
  // hauteurs remesurées et cascade refaite, sans nouveau rendu — les
  // pistes suivent les variables (poserPistesFixes_). Grille masquée
  // (page Affichage ouverte) : rien de mesurable, nouveau rendu au retour
  // sur le planning (grilleRendueMasquee_, rendreSiRenduMasque). false :
  // grille remplacée depuis, à rendre. Avant tout rendu : false.
  function majHauteursLignes() {
    var G = grilleCourante_;
    if (!G) return false;
    var scroller = G.scroller;
    if (!scroller.isConnected) return false;
    if (!scroller.getClientRects().length) { grilleRendueMasquee_ = true; return true; }
    if (!mesurerHauteursMobile_(G)) return false;
    cascaderBullesJourMobile_(G);
    return true;
  }

  /* ============ HAUTEUR DE CHAQUE LIGNE (round du 29.09.2026, suite 103) ============
     Lionel : « pour plus de maniabilité j'aimerai pouvoir changer chaques
     hauteurs de ligne séparément [...] excel est un bon exemple », puis, à
     notre question : « Hauteur sur chaque appareil ». Une personne (« p12 »),
     « jalon » ou « note » peut avoir sa propre hauteur, en pixels, retenue
     par l'appareil (ordinateur/tablette d'un côté, téléphone de l'autre,
     comme les curseurs de la page Affichage) ; les autres lignes gardent la
     hauteur commune. Comme dans un tableur :
     - glisser le trait sous le nom (.poignee-ligne) : hauteur de la ligne ;
     - double-clic sur ce trait : ajustée au contenu (toutes ses bulles
       l'une sous l'autre, sans cascade) ;
     - clic droit sur le nom (appui long au doigt) : menu « Hauteur » —
       valeur en pixels, « Ajuster au contenu », « Hauteur par défaut ».
     Round du 29.09.2026 (suite 104) — Lionel : « Clic droit sur le nom
     modifier le nom. Clic gauche pour le menu. » Clic (toucher) sur un
     nom : ce menu (plus « Modifier le nom… », et « Composition de
     l'équipe… » pour une équipe, qui l'ouvrait jusqu'ici au clic) ; clic
     droit (appui long au doigt) : modifier le nom (ouvrirModifierPersonne,
     la même fenêtre que la page Personnel). Jalons / Notes n'ont pas de
     nom à modifier : clic droit sans effet. */
  var HAUTEUR_LIGNE_MIN_ = 20, HAUTEUR_LIGNE_MAX_ = 400;
  function cleHauteursLignes_() { return profilAppareil_() === "tel" ? "planning.hauteursLignes.tel" : "planning.hauteursLignes"; }
  function hauteursLignesPerso_() {
    try {
      var o = JSON.parse(localStorage.getItem(cleHauteursLignes_()) || "{}");
      return o && typeof o === "object" ? o : {};
    } catch (e) { return {}; }
  }
  // px null : hauteur commune (réglage retiré).
  function changerHauteursLignes(ids, px) {
    var o = hauteursLignesPerso_();
    ids.forEach(function (id) {
      if (px == null) delete o[id];
      else o[id] = Math.round(Math.max(HAUTEUR_LIGNE_MIN_, Math.min(HAUTEUR_LIGNE_MAX_, px)));
    });
    try { localStorage.setItem(cleHauteursLignes_(), JSON.stringify(o)); } catch (e) {}
    appliquerHauteursLignes_();
    if (typeof majRetablirHauteurs === "function") majRetablirHauteurs();
  }
  /* Replier une ligne (round du 29.09.2026, suite 116) — Lionel, sur
     notre liste d'idées façon tableur : « Continue avec replier les lignes
     et la largeur des jours ». Une ligne (personne, équipe, Jalons, Notes)
     se replie en fine bande de HAUTEUR_REPLIEE_ px : son nom sur une
     ligne, ses bulles cachées — pour mettre de côté quelqu'un d'absent sans
     le retirer. Menu du nom (clic droit, appui long) : « Replier la
     ligne » (les lignes choisies ensemble), « Déplier toutes les lignes » ;
     un clic (toucher) sur le nom d'une ligne repliée la déplie. Retenu par
     l'appareil, comme les hauteurs (ordinateur/tablette, téléphone). */
  var HAUTEUR_REPLIEE_ = 18;
  function cleLignesRepliees_() { return profilAppareil_() === "tel" ? "planning.lignesRepliees.tel" : "planning.lignesRepliees"; }
  function lignesRepliees_() {
    try {
      var l = JSON.parse(localStorage.getItem(cleLignesRepliees_()) || "[]");
      return Array.isArray(l) ? l : [];
    } catch (e) { return []; }
  }
  function replierLignes(ids, replier) {
    var l = lignesRepliees_().filter(function (id) { return ids.indexOf(id) < 0; });
    if (replier) l = l.concat(ids);
    try { localStorage.setItem(cleLignesRepliees_(), JSON.stringify(l)); } catch (e) {}
    appliquerHauteursLignes_();
  }
  // Pistes et cascade refaites sur place, sans nouveau rendu.
  function appliquerHauteursLignes_() {
    var G = grilleCourante_;
    if (!G || !G.scroller.isConnected) return;
    poserPistesFixes_(G);
    majHauteursLignes();
  }
  // Toutes les bulles de la ligne l'une sous l'autre : le plus grand
  // nombre de bulles empilées (cascade, g._nMaxLignes), au moins une.
  function hauteurAuContenu_(lbl) {
    var G = grilleCourante_, r = plageGrille_(lbl.style.gridRow);
    var mes = G && G.mesuresMob_ && G.mesuresMob_[lbl.dataset.hMob];
    if (!mes || !r) return null;
    // Suite 113 : bas de la plus haute pile (hauteurs réelles) ; ligne
    // vide : la place d'une carte.
    var m = margeBulles_(), bas = (lbl.parentNode._basMax || {})[r[0]];
    return Math.ceil((bas || m + mes.u) + m);
  }
  function ajusterLigneAuContenu_(lbl) {
    var h = hauteurAuContenu_(lbl);
    if (h == null) return;
    changerHauteursLignes([lbl.dataset.ligne], h);
    toast("Hauteur ajustée au contenu : " + Math.round(Math.max(HAUTEUR_LIGNE_MIN_, h)) + " px.");
  }
  // Suite 105 : chaque ligne choisie à son propre contenu (comme le
  // double-clic d'un tableur sur plusieurs lignes).
  function ajusterLignesAuContenu_(ids) {
    if (ids.length < 2) { var l = etiquetteParId_(ids[0]); if (l) ajusterLigneAuContenu_(l); return; }
    var hs = {};
    ids.forEach(function (id) { var l = etiquetteParId_(id), h = l && hauteurAuContenu_(l); if (h != null) hs[id] = h; });
    Object.keys(hs).forEach(function (id) { changerHauteursLignes([id], hs[id]); });
    toast(Object.keys(hs).length + " lignes ajustées au contenu.");
  }
  function etiquetteParId_(id) {
    return etiquettesLignes_().filter(function (l) { return l.dataset.ligne === id; })[0] || null;
  }
  // Lignes réglées ensemble : toutes les lignes choisies si celle-ci en
  // fait partie (et qu'il y en a plusieurs), sinon elle seule.
  function lignesDuGeste_(id) {
    return lignesChoisies_.length > 1 && lignesChoisies_.indexOf(id) >= 0 ? lignesChoisies_.slice() : [id];
  }
  function etiquetteLigne_(el) { return el && el.closest ? el.closest("#racine .grille > [data-ligne]") : null; }

  // Glisser le trait sous le nom (souris ou doigt). Écouteur en capture
  // sur document : passe avant tout autre geste de la colonne des noms.
  document.addEventListener("pointerdown", function (e) {
    var pg = e.target.closest && e.target.closest(".poignee-ligne");
    if (!pg || (e.pointerType !== "touch" && e.button !== 0)) return;
    var lbl = etiquetteLigne_(pg);
    if (!lbl) return;
    e.preventDefault(); e.stopPropagation();
    var id = lbl.dataset.ligne, ids = lignesDuGeste_(id), pointerId = e.pointerId, y0 = e.clientY;
    var k = lbl.offsetHeight ? lbl.getBoundingClientRect().height / lbl.offsetHeight : 1;
    var h0 = lbl.offsetHeight, hCourant = h0, bouge = false, attente = false;
    var info = document.createElement("div");
    info.className = "info-hauteur-ligne";
    document.body.appendChild(info);
    document.body.classList.add("en-redim-ligne");
    function montrer(x, y) {
      info.textContent = Math.round(hCourant) + " px";
      info.style.left = (x + 14) + "px"; info.style.top = (y - 30) + "px";
    }
    montrer(e.clientX, e.clientY);
    function onMove(e2) {
      if (e2.pointerId !== pointerId) return;
      if (Math.abs(e2.clientY - y0) > 2) bouge = true;
      if (!bouge) return;
      hCourant = Math.max(HAUTEUR_LIGNE_MIN_, Math.min(HAUTEUR_LIGNE_MAX_, h0 + (e2.clientY - y0) / k));
      montrer(e2.clientX, e2.clientY);
      if (attente) return;
      attente = true;
      requestAnimationFrame(function () { attente = false; changerHauteursLignes(ids, hCourant); });
    }
    function fin(e2) {
      if (e2.pointerId !== pointerId) return;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", fin);
      document.removeEventListener("pointercancel", fin);
      info.remove();
      document.body.classList.remove("en-redim-ligne");
      if (bouge) { clicLigneIgnoreT_ = performance.now(); changerHauteursLignes(ids, hCourant); }
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", fin);
    document.addEventListener("pointercancel", fin);
  }, true);
  document.addEventListener("dblclick", function (e) {
    var pg = e.target.closest && e.target.closest(".poignee-ligne");
    if (!pg) return;
    e.preventDefault(); e.stopPropagation();
    var lbl = etiquetteLigne_(pg);
    if (lbl) ajusterLignesAuContenu_(lignesDuGeste_(lbl.dataset.ligne));
  }, true);

  // Suite 106 — Lionel : « Clic double clique gauche sur le nom modifier le
  // nom. Clic droit pour le menu » (la suite 104 faisait l'inverse). Donc :
  // clic droit (appui long au doigt) = menu de la ligne ; double-clic
  // (double toucher) = modifier le nom ; clic simple (toucher) = choisir la
  // ligne, comme l'en-tête de ligne d'un tableur (suite 105). Le clic qui
  // suit un appui long ou un trait glissé n'agit pas en plus ; le
  // « contextmenu » natif d'Android, qui suit aussi l'appui long, n'ouvre
  // pas un 2e menu. Temps : performance.now() (l'horloge des tests fige
  // Date.now()).
  var clicLigneIgnoreT_ = -1e9;
  function idPersonneLigne_(lbl) { return /^p\d+$/.test(lbl.dataset.ligne) ? +lbl.dataset.ligne.slice(1) : null; }
  function modifierNomLigne_(lbl) {
    var id = idPersonneLigne_(lbl);
    if (id != null && typeof ouvrirModifierPersonne === "function") ouvrirModifierPersonne(id, function () {});
  }
  // Round du 01.10.2026 (suite 141) — Lionel : « déplier et replier ligne
  // machine et transport ». Clic sur le chevron (lignes Transports /
  // Machines) : replier ou déplier cette ligne seule, sans la choisir.
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#racine .grille > [data-ligne] > .ligne-repli");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    var lbl = etiquetteLigne_(b);
    replierLignes([lbl.dataset.ligne], !lbl.classList.contains("ligne-repliee"));
  }, true);
  document.addEventListener("contextmenu", function (e) {
    var lbl = etiquetteLigne_(e.target);
    if (!lbl) return;
    e.preventDefault();
    if (performance.now() - clicLigneIgnoreT_ < 1000) return;
    ouvrirMenuHauteurLigne(lbl, e.clientX, e.clientY);
  });
  // Clic : Ctrl (Cmd) = ajouter / retirer la ligne, Maj = plage, simple =
  // cette ligne seule (au doigt, tant que des lignes sont choisies : ajouter
  // ou retirer). 2e clic rapproché (e.detail, ou 2e toucher du même nom en
  // moins de 400 ms) : modifier le nom.
  var dernierToucherNom_ = { id: null, t: -1e9 };
  document.addEventListener("click", function (e) {
    var lbl = etiquetteLigne_(e.target);
    if (!lbl || e.button !== 0 || e.target.closest(".poignee-ligne")) return;
    var id = lbl.dataset.ligne, tactile = dernierPointeur_ === "touch", t = performance.now();
    var double = e.detail >= 2 || (tactile && dernierToucherNom_.id === id && t - dernierToucherNom_.t < 400);
    dernierToucherNom_ = double ? { id: null, t: -1e9 } : { id: id, t: t };
    if (double && !e.ctrlKey && !e.metaKey && !e.shiftKey) { modifierNomLigne_(lbl); return; }
    // Suite 116 : clic simple sur une ligne repliée = la déplier.
    if (lbl.classList.contains("ligne-repliee") && !e.ctrlKey && !e.metaKey && !e.shiftKey) { replierLignes([id], false); return; }
    // Round du 29.09.2026 (suite 109). Lionel : « la sélection en mode ajout
    // est encore possible en appuyant sur les en-têtes de colonnes et de
    // lignes, ainsi qu'en clic droit avec la souris ». En mode ajout, un nom
    // ou un jour ne se choisit plus (modifier le nom et le menu restent).
    if (modeAjoutPlanning) return;
    if (e.ctrlKey || e.metaKey) choisirLigne_(id, "basculer");
    else if (e.shiftKey) choisirLigne_(id, ancreLigne_ != null ? "plage" : "basculer");
    else if (tactile && lignesChoisies_.length) choisirLigne_(id, "basculer");
    else choisirLigne_(id, "seul");
  });
  document.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "touch") return;
    var lbl = etiquetteLigne_(e.target);
    if (!lbl || e.target.closest(".poignee-ligne, .ligne-repli")) return;
    var pointerId = e.pointerId, x0 = e.clientX, y0 = e.clientY;
    var minuteur = setTimeout(function () {
      detacher();
      clicLigneIgnoreT_ = performance.now();
      ouvrirMenuHauteurLigne(lbl, x0, y0);
    }, DELAI_APPUI_LONG + 50);
    function onMove(e2) { if (e2.pointerId === pointerId && Math.abs(e2.clientX - x0) + Math.abs(e2.clientY - y0) > 8) detacher(); }
    function onFin(e2) { if (e2.pointerId === pointerId) detacher(); }
    function detacher() {
      clearTimeout(minuteur);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onFin);
      document.removeEventListener("pointercancel", onFin);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onFin);
    document.addEventListener("pointercancel", onFin);
  });
  // Un seul clic avalé (celui qui termine le geste), jamais les suivants :
  // tout nouvel appui efface la consigne, posée seulement après lui.
  document.addEventListener("pointerdown", function () { clicLigneIgnoreT_ = -1e9; }, true);
  document.addEventListener("click", function (e) {
    if (performance.now() - clicLigneIgnoreT_ < 800 && etiquetteLigne_(e.target)) { clicLigneIgnoreT_ = -1e9; e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* Sélection de lignes et de colonnes (round du 29.09.2026, suite 105) —
     Lionel, « Oui » à notre proposition : choisir des lignes par les noms
     (Ctrl / Maj), des colonnes par les jours, comme dans un tableur ; les
     lignes choisies prennent la même hauteur.
     - ordinateur : clic sur un nom ou un jour = cette ligne ou ce jour
       seul (suite 106 ; avant, le clic sur un nom ouvrait son menu) ;
       Ctrl (Cmd) + clic = l'ajoute ou le retire ; Maj + clic = de la
       dernière ligne (du dernier jour) cliquée jusqu'à celle-ci ;
     - doigt : toucher un nom ou un jour le choisit (aussi « Sélectionner
       la ligne » dans le menu du nom) ; tant que des lignes (des jours)
       sont choisies, toucher un autre nom (jour) l'ajoute ou le retire ;
     - les bulles de ces lignes et de ces jours (semaine affichée) sont
       sélectionnées : la pilule de sélection agit sur elles ;
     - hauteur : le trait (glisser, double-clic) et le menu d'une ligne
       choisie règlent toutes les lignes choisies.
     Jours retenus par leur date (isoDeGi), pas par leur colonne. Le choix
     s'efface avec la sélection des bulles (quitterModeSelection) et par un
     clic simple de la souris dans la grille. */
  var lignesChoisies_ = [], joursChoisis_ = [], ancreLigne_ = null, ancreJour_ = null, dernierPointeur_ = "mouse";
  document.addEventListener("pointerdown", function (e) {
    dernierPointeur_ = e.pointerType;
    if (!lignesChoisies_.length && !joursChoisis_.length) return;
    // Au doigt, un appui sert aussi à défiler : seulement sans bulle
    // sélectionnée (sinon, toucher une case vide quitte déjà la sélection).
    if ((e.pointerType === "touch" && Object.keys(bullesSelectionnees).length) || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target.closest && e.target.closest("#racine .grille .cell, #racine .grille .bulle")) oublierChoixLignesJours();
  }, true);
  function etiquettesLignes_() { return [].slice.call(document.querySelectorAll("#racine .grille > [data-ligne]")); }
  function thsJours_() { return [].slice.call(document.querySelectorAll("#racine .entete-planning-figee .th[data-gi]:not(.th-demi)")); }
  function isosJours_() {
    var vus = [];
    thsJours_().forEach(function (th) { var iso = isoDeGi(+th.dataset.gi); if (iso && vus.indexOf(iso) < 0) vus.push(iso); });
    return vus.sort();
  }
  // Round du 29.09.2026 (suite 110). Lionel : « sur portable la selection de
  // ligne selectionne toute la semaine, elle ne doit selectionner que ce
  // qu'il y a à l'ecran » ; « en mode jour voisin elle sélectionne les 3
  // semaines. » Une ligne choisie ne ramasse que ses cases à l'écran : milieu
  // de la case entre la colonne des noms et le bord droit de sa grille.
  function caseALEcran_(c) {
    if (!c.offsetWidth) return false;
    var sc = c.closest(".scroller");
    if (!sc) return true;
    var r = sc.getBoundingClientRect(), rc = c.getBoundingClientRect(), x = (rc.left + rc.right) / 2;
    return x >= r.left + largeurNoms() && x <= r.right;
  }
  function cellulesChoix_() {
    var cells = [];
    lignesChoisies_.forEach(function (id) {
      var sel = /^p/.test(id) ? '.cell[data-kind="personne"][data-personne="' + id.slice(1) + '"]' : '.cell[data-kind="' + id + '"]';
      cells = cells.concat([].filter.call(document.querySelectorAll("#racine " + sel), caseALEcran_));
    });
    thsJours_().forEach(function (th) {
      if (joursChoisis_.indexOf(isoDeGi(+th.dataset.gi)) >= 0) cells = cells.concat([].slice.call(document.querySelectorAll('#racine .cell[data-jour="' + th.dataset.gi + '"]')));
    });
    return cells;
  }
  function idsChoix_() { var c = cellulesChoix_(); return c.length ? idsDepuisCellules(c) : {}; }
  function majClassesChoix_() {
    etiquettesLignes_().forEach(function (l) { l.classList.toggle("ligne-choisie", lignesChoisies_.indexOf(l.dataset.ligne) >= 0); });
    thsJours_().forEach(function (th) { th.classList.toggle("jour-choisi", joursChoisis_.indexOf(isoDeGi(+th.dataset.gi)) >= 0); });
  }
  // Appelée par quitterModeSelection (formulaires-communs.js).
  function oublierChoixLignesJours() {
    ancreLigne_ = ancreJour_ = null;
    if (!lignesChoisies_.length && !joursChoisis_.length) return;
    lignesChoisies_ = []; joursChoisis_ = [];
    majClassesChoix_();
  }
  // Nouveau choix : les bulles de l'ancien quittent la sélection, celles
  // du nouveau y entrent ; les autres bulles sélectionnées restent.
  function changerChoix_(lignes, jours) {
    Object.keys(idsChoix_()).forEach(function (id) { delete bullesSelectionnees[id]; });
    lignesChoisies_ = lignes; joursChoisis_ = jours;
    Object.assign(bullesSelectionnees, idsChoix_());
    var nb = Object.keys(bullesSelectionnees).length;
    if (!nb && !lignes.length && !jours.length) { quitterModeSelection(); render(false); return; }
    modeSelectionMultiple = true;
    render(false);
    majBarreSelection();
    majClassesChoix_();
    var quoi = [];
    if (lignes.length) quoi.push(lignes.length + (lignes.length > 1 ? " lignes" : " ligne"));
    if (jours.length) quoi.push(jours.length + (jours.length > 1 ? " jours" : " jour"));
    toast((quoi.join(" et ") || "Sélection") + " — " + (nb ? nb + (nb > 1 ? " bulles sélectionnées." : " bulle sélectionnée.") : "aucune bulle."));
  }
  // mode : "seul" (remplace toute la sélection), "basculer" (ajoute ou
  // retire), "plage" (de l'ancre jusqu'ici, remplace le choix).
  function choisirParmi_(liste, choisis, cle, ancre, mode) {
    if (mode === "plage" && ancre != null && liste.indexOf(ancre) >= 0 && liste.indexOf(cle) >= 0) {
      var i = liste.indexOf(ancre), j = liste.indexOf(cle);
      return liste.slice(Math.min(i, j), Math.max(i, j) + 1);
    }
    if (mode === "seul") return [cle];
    var l = choisis.slice(), k = l.indexOf(cle);
    if (k >= 0) l.splice(k, 1); else l.push(cle);
    return l;
  }
  function choisirLigne_(id, mode) {
    var ids = etiquettesLignes_().map(function (l) { return l.dataset.ligne; });
    var l = choisirParmi_(ids, lignesChoisies_, id, ancreLigne_, mode), jours = mode === "basculer" ? joursChoisis_.slice() : [];
    if (mode === "seul") quitterModeSelection();
    if (mode !== "plage") ancreLigne_ = id;
    var ancre = ancreLigne_;
    changerChoix_(l, jours);
    ancreLigne_ = ancre;
  }
  function choisirJour_(iso, mode) {
    var j = choisirParmi_(isosJours_(), joursChoisis_, iso, ancreJour_, mode), lignes = mode === "basculer" ? lignesChoisies_.slice() : [];
    if (mode === "seul") quitterModeSelection();
    if (mode !== "plage") ancreJour_ = iso;
    var ancre = ancreJour_;
    changerChoix_(lignes, j);
    ancreJour_ = ancre;
  }
  document.addEventListener("click", function (e) {
    var th = e.target.closest && e.target.closest("#racine .entete-planning-figee .th[data-gi]:not(.th-demi)");
    if (!th || e.button !== 0 || modeAjoutPlanning) return;
    var iso = isoDeGi(+th.dataset.gi);
    if (!iso) return;
    if (e.ctrlKey || e.metaKey) choisirJour_(iso, "basculer");
    else if (e.shiftKey) choisirJour_(iso, ancreJour_ ? "plage" : "basculer");
    else if (dernierPointeur_ === "touch" && joursChoisis_.length) choisirJour_(iso, "basculer");
    else choisirJour_(iso, "seul");
  });

  // Suite 119 — menu du nom d'une équipe : « Couleur de l'équipe », une
  // rangée de pastilles (COULEURS_EQUIPES), le sélecteur du système pour
  // toute autre couleur (pastille arc-en-ciel), et ↺ (couleur par défaut) quand elle en a une.
  function htmlCouleurEquipe_(idEquipe) {
    var c = couleurEquipe(idEquipe);
    return '<div class="mc-sep"></div><div class="cp-titre">Couleur de l’équipe</div><div class="mc-couleurs">' +
      COULEURS_EQUIPES.map(function (k) {
        return '<button type="button" class="mc-pastille' + (k === c ? ' active' : '') + '" data-couleur="' + k + '" style="background:' + k + '" title="' + k + '" aria-label="Couleur ' + k + '"></button>';
      }).join("") +
      '<label class="mc-pastille mc-autre" title="Autre couleur"><input type="color" value="' + hexPastille(c || "#9e9e9e") + '" aria-label="Autre couleur"></label>' +
      (c ? '<button type="button" class="mc-pastille mc-defaut" data-couleur="" title="Couleur par défaut" aria-label="Couleur par défaut">↺</button>' : '') +
      '</div><div class="mc-sep"></div>';
  }
  function ouvrirMenuHauteurLigne(lbl, x, y) {
    var id = lbl.dataset.ligne;
    var nom = (lbl.querySelector("b") || lbl).textContent.trim() || lbl.title;
    // Suite 105 : ligne choisie parmi d'autres = menu de toutes ces lignes.
    var ids = lignesDuGeste_(id), groupe = ids.length > 1, choisie = lignesChoisies_.indexOf(id) >= 0;
    var reglages = hauteursLignesPerso_();
    var perso = ids.some(function (i) { return reglages[i] > 0; });
    var repliees = lignesRepliees_(), toutesRepliees = ids.every(function (i) { return repliees.indexOf(i) >= 0; });
    var autresRepliees = repliees.some(function (i) { return ids.indexOf(i) < 0; });
    var pop = document.createElement("div");
    pop.className = "pop menu-pop menu-hauteur-ligne";
    // Suite 104 : en tête, modifier le nom (et la composition d'une équipe).
    var idP = groupe ? null : idPersonneLigne_(lbl), equipe = lbl.classList.contains("lbl-equipe");
    // Suite 109 : pas de « Sélectionner la ligne » en mode ajout.
    var bChoix = modeAjoutPlanning ? '' : '<button type="button" data-a="choix">' + (choisie ? "Désélectionner la ligne" : "Sélectionner la ligne") + '</button>';
    // Suite 115 : changer l'ordre (au doigt, où le nom ne se glisse pas).
    var voisins = idP != null ? lignesPermutables_(lbl) : [], rang = voisins.indexOf(lbl);
    var bOrdre = rang < 0 ? '' : '<button type="button" data-a="monter"' + (rang > 0 ? '' : ' disabled') + '>Monter</button>' +
      '<button type="button" data-a="descendre"' + (rang < voisins.length - 1 ? '' : ' disabled') + '>Descendre</button>';
    // Round du 01.10.2026 (suite 137) — Lionel (retour n° 16) : « Ajouter
    // masquer et désactiver au clic droit dans la colonne nom. » Mêmes
    // effets que la coche « Afficher » et l'interrupteur « Actif » des pages
    // Personnel / Intervenants (Désactiver demande confirmation).
    // Round du 01.10.2026 (suite 138) — Lionel : « Je n'aime pas cette
    // fonction désactiver sur personnel et intervenants, la supprimer. »
    // « Désactiver… » retiré ; « Masquer la ligne » reste (Machines et
    // Transports compris, leurs lignes étant des personnes).
    var bMasquer = idP == null ? '' : '<div class="mc-sep"></div>' +
      '<button type="button" data-a="masquer">Masquer la ligne</button>';
    pop.innerHTML = (groupe ? '<div class="cp-titre">' + ids.length + ' lignes sélectionnées</div>' + bChoix :
      idP != null ? '<div class="cp-titre">' + esc(nom) + '</div>' +
      '<button type="button" data-a="nom">Modifier le nom…</button>' +
      (equipe ? '<button type="button" data-a="composition">Composition de l’équipe…</button>' + htmlCouleurEquipe_(idP) : '') + bChoix + bOrdre + bMasquer : bChoix) +
      '<div class="cp-titre">' + (groupe ? 'Hauteur des ' + ids.length + ' lignes' : 'Hauteur de la ligne' + (idP != null ? '' : ' — ' + esc(nom))) + '</div>' +
      '<div class="mhl-valeur"><input type="number" inputmode="numeric" min="' + HAUTEUR_LIGNE_MIN_ + '" max="' + HAUTEUR_LIGNE_MAX_ + '" step="1" value="' + Math.round(lbl.offsetHeight) + '" aria-label="Hauteur en pixels"><span>px</span>' +
      '<button type="button" class="btn-primaire" data-a="ok">OK</button></div>' +
      '<button type="button" data-a="contenu">Ajuster au contenu</button>' +
      '<button type="button" data-a="defaut"' + (perso ? '' : ' disabled') + '>Hauteur par défaut</button>' +
      // Suite 116 : replier / déplier.
      '<div class="mc-sep"></div>' +
      '<button type="button" data-a="replier">' + (toutesRepliees ? "Déplier " : "Replier ") + (groupe ? "les " + ids.length + " lignes" : "la ligne") + '</button>' +
      (autresRepliees ? '<button type="button" data-a="toutDeplier">Déplier toutes les lignes (' + repliees.length + ')</button>' : '');
    positionnerPop(pop, x, y);
    var fermer = fermerAuClicExterieur(pop);
    // Suite 105 : fermer le menu vide la sélection (fermerAuClicExterieur) ;
    // un réglage de hauteur la garde, lignes et jours choisis compris.
    function fermerGarde() {
      var b = Object.assign({}, bullesSelectionnees), l = lignesChoisies_, j = joursChoisis_, m = modeSelectionMultiple, al = ancreLigne_, aj = ancreJour_;
      fermer();
      if (!Object.keys(b).length) return;
      bullesSelectionnees = b; lignesChoisies_ = l; joursChoisis_ = j; modeSelectionMultiple = m; ancreLigne_ = al; ancreJour_ = aj;
      render(false); majBarreSelection(); majClassesChoix_();
    }
    var champ = pop.querySelector(".mhl-valeur input");
    function valider() {
      var v = parseFloat(champ.value);
      if (!isFinite(v)) return;
      fermerGarde();
      changerHauteursLignes(ids, v);
    }
    champ.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); valider(); } });
    pop.querySelector('[data-a="ok"]').addEventListener("click", valider);
    pop.querySelector('[data-a="contenu"]').addEventListener("click", function () { fermerGarde(); ajusterLignesAuContenu_(ids); });
    pop.querySelector('[data-a="defaut"]').addEventListener("click", function () { fermerGarde(); changerHauteursLignes(ids, null); });
    pop.querySelector('[data-a="replier"]').addEventListener("click", function () { fermerGarde(); replierLignes(ids, !toutesRepliees); });
    var bTout = pop.querySelector('[data-a="toutDeplier"]');
    if (bTout) bTout.addEventListener("click", function () { fermerGarde(); replierLignes(repliees, false); });
    var bCh = pop.querySelector('[data-a="choix"]');
    if (bCh) bCh.addEventListener("click", function () { fermer(); choisirLigne_(id, choisie ? "basculer" : "seul"); });
    var bNom = pop.querySelector('[data-a="nom"]'), bCompo = pop.querySelector('[data-a="composition"]');
    if (bNom) bNom.addEventListener("click", function () { fermer(); modifierNomLigne_(lbl); });
    if (bCompo) bCompo.addEventListener("click", function () { fermer(); ouvrirCompositionEquipe(idP); });
    // Suite 119 : couleur de l'équipe.
    pop.querySelectorAll(".mc-couleurs [data-couleur]").forEach(function (b) {
      b.addEventListener("click", function () { fermerGarde(); changerCouleurEquipe(idP, b.dataset.couleur || null); });
    });
    var pCouleur = pop.querySelector(".mc-couleurs input");
    if (pCouleur) pCouleur.addEventListener("change", function () { fermerGarde(); changerCouleurEquipe(idP, pCouleur.value); });
    var bMonter = pop.querySelector('[data-a="monter"]'), bDescendre = pop.querySelector('[data-a="descendre"]');
    if (bMonter) bMonter.addEventListener("click", function () { fermer(); deplacerPersonneLigne(idP, idPersonneLigne_(voisins[rang - 1]), false); });
    if (bDescendre) bDescendre.addEventListener("click", function () { fermer(); deplacerPersonneLigne(idP, idPersonneLigne_(voisins[rang + 1]), true); });
    // Suite 137 : masquer (personnes.masque, suite 134).
    var bMasq = pop.querySelector('[data-a="masquer"]');
    if (bMasq) bMasq.addEventListener("click", function () {
      fermer();
      Promise.resolve(sbClient.from("personnes").update({ masque: true }).eq("id", ancreDe(idP))).then(function (res) {
        if (res && res.error) throw res.error;
        rafraichirApresPersonnel();
        toast("« " + nom + " » masqué — à réafficher depuis sa page (coche « Afficher »).");
      }).catch(function (err) { toast("Échec : " + (err && err.message ? err.message : err)); });
    });
  }

  /* ============ ORDRE DES NOMS (round du 29.09.2026, suite 115) ============
     Lionel : « Réordonner les noms. » Glisser un nom à la souris (plus de
     6 px en hauteur) le déplace : un trait montre où il va ; au doigt,
     « Monter » / « Descendre » dans le menu du nom (appui long). L'ordre
     est celui de la page Personnel (colonne ordre en base), pour tous les
     appareils. Une ligne ne change de place que parmi ses pareilles : une
     équipe parmi les équipes, un membre parmi les membres de son équipe,
     une personne seule parmi les personnes seules, un intervenant parmi
     les intervenants (l'affichage regroupe toujours les équipes et leurs
     membres, cf. ordrePersonnesEquipes). */
  // Étiquettes de la même grille où la ligne lbl peut aller, dans l'ordre
  // affiché (elle comprise).
  function lignesPermutables_(lbl) {
    var idP = idPersonneLigne_(lbl);
    if (idP == null) return [];
    idP = String(idP);
    var moi = null;
    PERSONNES.forEach(function (x) { if (x.id === idP) moi = x; });
    if (!moi) return [];
    var ids;
    // Suite 132 (js/groupes.js) : une ligne de groupe (Machines…) parmi
    // celles de son groupe.
    var secteur = secteurDe(moi);
    if (secteur !== "personnel") ids = PERSONNES.filter(function (x) { return secteurDe(x) === secteur; }).map(function (x) { return x.id; });
    else {
      var ordre = ordrePersonnesEquipes(PERSONNES.filter(function (x) { return secteurDe(x) === "personnel"; }), lundiCourantEquipes(), function (x) { return x.id; });
      var e0 = ordre.filter(function (e) { return e.p.id === idP; })[0];
      if (!e0) return [];
      ids = ordre.filter(function (e) { return e.role === e0.role && (e.role !== "membre" || e.equipeId === e0.equipeId); }).map(function (e) { return e.p.id; });
    }
    var parLigne = {};
    etiquettesLignes_().forEach(function (l) { if (l.parentNode === lbl.parentNode) parLigne[l.dataset.ligne] = l; });
    return ids.map(function (id) { return parLigne["p" + id]; }).filter(Boolean);
  }
  // Place la personne idP juste avant (apres = false) ou après idCible :
  // tout de suite à l'écran (PERSONNES, personnes actives, semaines en
  // cache), puis en base — ordre renuméroté 1..N sur la liste complète
  // (désactivées comprises), seules les lignes changées sont écrites.
  function deplacerPersonneLigne(idP, idCible, apres) {
    idP = String(idP); idCible = String(idCible);
    if (idP === idCible) return Promise.resolve(false);
    function deplacer(liste, cle) {
      var i = -1, j = -1, k;
      for (k = 0; k < liste.length; k++) if (String(cle(liste[k])) === idP) i = k;
      if (i < 0) return false;
      var el = liste.splice(i, 1)[0];
      for (k = 0; k < liste.length; k++) if (String(cle(liste[k])) === idCible) j = k;
      liste.splice(j < 0 ? i : j + (apres ? 1 : 0), 0, el);
      return j >= 0 && j + (apres ? 1 : 0) !== i;
    }
    function parId(x) { return x.id; }
    if (!deplacer(PERSONNES, parId)) return Promise.resolve(false);
    deplacer(etat.personnesActives || [], parId);
    Object.keys(etat.cache || {}).forEach(function (lg) {
      var d = etat.cache[lg];
      if (d && d.personnes) deplacer(d.personnes, function (x) { return x.ancre; });
    });
    render(false);
    return listerPersonnesGestionServeur().then(function (liste) {
      deplacer(liste, parId);
      var nouveaux = {}, envois = [];
      liste.forEach(function (x, k) {
        nouveaux[x.id] = k + 1;
        if (x.ordre !== k + 1) envois.push(sbClient.from("personnes").update({ ordre: k + 1 }).eq("id", ancreDe(x.id)));
      });
      (etat.personnesActives || []).forEach(function (x) { if (nouveaux[String(x.id)]) x.ordre = nouveaux[String(x.id)]; });
      return Promise.all(envois);
    }).then(function (r) {
      r.forEach(function (res) { if (res.error) throw res.error; });
      return true;
    }).catch(function (err) {
      toast("Échec du changement d’ordre : " + (err && err.message ? err.message : err));
      return false;
    });
  }
  // Glisser un nom (souris, bouton gauche ; pas le trait de hauteur).
  document.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "touch" || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    var lbl = etiquetteLigne_(e.target);
    if (!lbl || e.target.closest(".poignee-ligne, .ligne-repli") || idPersonneLigne_(lbl) == null) return;
    var pointerId = e.pointerId, y0 = e.clientY, voisins = null, trait = null, cible = null;
    function viser(y) {
      var rs = voisins.map(function (l) { return l.getBoundingClientRect(); }), k = 0;
      while (k < rs.length - 1 && y > rs[k].bottom) k++;
      var apres = y > (rs[k].top + rs[k].bottom) / 2;
      cible = voisins[k] === lbl ? null : { lbl: voisins[k], apres: apres };
      var sc = lbl.closest(".scroller"), droite = sc ? sc.getBoundingClientRect().right : rs[k].right;
      trait.style.display = cible ? "" : "none";
      trait.style.top = ((apres ? rs[k].bottom : rs[k].top) - 1) + "px";
      trait.style.left = rs[k].left + "px";
      trait.style.width = Math.max(0, droite - rs[k].left) + "px";
    }
    function onMove(e2) {
      if (e2.pointerId !== pointerId) return;
      if (!trait) {
        if (Math.abs(e2.clientY - y0) <= 6) return;
        voisins = lignesPermutables_(lbl);
        if (voisins.length < 2) { detacher(); return; }
        trait = document.createElement("div");
        trait.className = "trait-ordre-ligne";
        document.body.appendChild(trait);
        document.body.classList.add("glisse-ligne");
        lbl.classList.add("ligne-deplacee");
      }
      e2.preventDefault();
      viser(e2.clientY);
    }
    function onUp(e2) {
      if (e2.pointerId !== pointerId) return;
      var fin = trait && cible;
      if (trait) clicLigneIgnoreT_ = performance.now();
      detacher();
      if (fin) deplacerPersonneLigne(idPersonneLigne_(lbl), idPersonneLigne_(cible.lbl), cible.apres);
    }
    function detacher() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      if (trait) trait.remove();
      document.body.classList.remove("glisse-ligne");
      lbl.classList.remove("ligne-deplacee");
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  });
