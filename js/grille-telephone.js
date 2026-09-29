"use strict";
  /* ============================================================
     VUE « 1 JOUR » DU TÉLÉPHONE
     Round du 29.09.2026 (suite 99) — découpage de l'affichage du
     planning (Lionel : « Ne serait-il pas plus judicieux de faire 2
     application différente pour portable et pour deskop? », puis
     « Allons-y » au plan proposé), étape 3 : sorti tel quel de
     js/grille-rendu.js. Tout ce qui ne sert qu'à la vue « 1 jour »
     (téléphone, largeur de 600 px au plus, cf. modeJourMobileActif,
     core.js) : bascule « 1 jour » / « 1 semaine », jour ouvré le plus
     proche d'un week-end masqué, préchargement des semaines voisines ;
     cartes découpées par jour, jour posé, case coin qui suit le
     défilement, arrêt du défilement et recentrage de la fenêtre de
     2 semaines. Les fonctions qui touchent la grille reçoivent G, l'objet
     du rendu (cf. construireGrille et grilleCourante_, grille-rendu.js).
     Restent communs (grille-rendu.js) : allerAuJour, majCalendrierJour,
     verifierModeFenetre (passage téléphone <-> ordinateur),
     mettreEnPlaceJourMobile_, planifierDecoupeJourMobile_ et
     reajusterBullesJourMobile (appelées dans toutes les vues).
     ============================================================ */

  // ---- Navigation --------------------------------------------------------

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
  // Jour ouvré le plus proche d'un samedi (le vendredi d'avant, même
  // semaine) ou d'un dimanche (le lundi d'après, semaine suivante) : date
  // et index de semaine (etat.semaines). Un jour ouvré est rendu tel quel.
  function jourOuvreLePlusProche_(iso, idx) {
    var js = jourSemaineIso_(iso);
    if (js < 5) return { iso: iso, idx: idx };
    var d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + (js === 5 ? -1 : 1));
    return { iso: isoDeDate(d), idx: js === 6 ? Math.min(idx + 1, etat.semaines.length - 1) : idx };
  }
  // Round du 26.09.2026 (suite 61) — Lionel : « Lorsqu'on ouvre l'appli en
  // mode mobile un jour de week-end, ouvrir l'appli sur le jour le plus
  // proche. » Vue « 1 jour » d'un téléphone, week-ends masqués : le samedi,
  // le vendredi ; le dimanche, le lundi qui suit. Avant, le lundi de la
  // semaine écoulée (jourMobileCourant, faute de colonne pour aujourd'hui).
  // Appelée au démarrage (demarrer, donnees-sync.js), avant le chargement
  // de la fenêtre, et par « Aujourd'hui ».
  function caleJourMobileSurJourOuvre_() {
    if (!modeJourMobileActif() || afficherWeekends || jourSemaineIso_(etat.aujourdhui) < 5) return false;
    var ouvre = jourOuvreLePlusProche_(etat.aujourdhui, indexSemaineAujourdhui_());
    etat.indexSemaine = ouvre.idx;
    jourMobileIso = ouvre.iso;
    debutFenetreMobile = null;
    return true;
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

  // ---- Grille en vue « 1 jour » ----------------------------------------

  // Une carte par jour couvert, chacune à la largeur de sa part (colonnes
  // de la grille, lues une fois) — la 1re est la carte d'origine, les
  // autres des copies (.b-carte-jour). data-jour : rang du jour (repères
  // .snap-jour, un par jour). Refait au rendu et à l'aperçu d'une poignée
  // (reajusterBullesJourMobile) ; jamais pendant un geste.
  function decouperBullesJourMobile_(G) {
    var grilleCorps = G.grilleCorps, grilleEntete = G.grilleEntete;
    var jours = [].map.call(grilleCorps.querySelectorAll(".snap-jour"), function (el) {
      var c = plageGrille_(el.style.gridColumn) || [0, 0];
      return { col: c[0], fin: c[0] + c[1] };
    }).sort(function (a, b) { return a.col - b.col; });
    [grilleEntete, grilleCorps].forEach(function (g) {
      var cs = getComputedStyle(g);
      var ws = cs.gridTemplateColumns.split(" ").map(parseFloat), ecartC = parseFloat(cs.columnGap) || 0;
      var gauche = [0];
      for (var c = 0; c < ws.length; c++) gauche.push(gauche[c] + ws[c] + ecartC);
      [].forEach.call(g.children, function (b) {
        if (!b.classList.contains("bulle")) return;
        b.querySelectorAll(":scope > .b-carte-jour").forEach(function (cj) { cj.remove(); });
        var carte = b.querySelector(":scope > .b-carte"), cb = plageGrille_(b.style.gridColumn);
        if (!carte || !cb) return;
        var parts = [];
        jours.forEach(function (d, j) {
          var a = Math.max(cb[0], d.col), z = Math.min(cb[0] + cb[1], d.fin);
          if (z > a && ws[z - 2] != null) parts.push({ j: j, g: gauche[a - 1], d: gauche[z - 2] + ws[z - 2] });
        });
        carte.dataset.jour = "-1";
        // Bulle qui commence l'après-midi : la carte d'origine recule de
        // 1 px sur le trait du matin (.demi-aprem, style.css) — elle
        // s'élargit d'autant pour finir au même bord.
        var x0 = gauche[cb[0] - 1], recul = b.classList.contains("demi-aprem") ? 1 : 0;
        parts.forEach(function (p, n) {
          var el = carte;
          if (n > 0) {
            el = carte.cloneNode(true);
            el.classList.add("b-carte-jour");
            el.setAttribute("aria-hidden", "true");
            b.appendChild(el);
          }
          el.dataset.jour = String(p.j);
          el.style.marginLeft = n > 0 ? (p.g - x0) + "px" : "";
          el.style.width = (p.d - p.g + (n === 0 ? recul : 0)) + "px";
          x0 = p.d;
        });
      });
    });
  }
  // Colonnes des jours, dans le repère du contenu défilé (suite 72) :
  // lues au repos, pour la case coin pendant le glissement
  // (majCoinJourMobile_) — aucune mesure à l'image.
  function majGeoGlisse_(G) {
    var scroller = G.scroller, grilleEntete = G.grilleEntete, LN = G.LN;
    var rS = scroller.getBoundingClientRect();
    if (!rS.width) { G.geoGlisse_ = null; return; }
    var x = scroller.scrollLeft, zoom = (niveauZoomPlanning / 100) || 1;
    var ths_ = [].slice.call(grilleEntete.querySelectorAll(".th[data-gi]"));
    G.geoGlisse_ = {
      taille: generationTaille_,
      debut: rS.left + scroller.clientLeft + LN * zoom,
      jours: ths_.map(function (th) { var r = th.getBoundingClientRect(); return [r.left + x, r.right + x]; }),
      gis: ths_.map(function (th) { return +th.dataset.gi; })
    };
  }
  // Jour posé (rendu, arrêt du défilement) : poignées des bulles absentes
  // de ce jour masquées (.hors-jour, suite 37 — celles de la veille
  // tombaient au bord de la colonne des noms).
  function poserJourMobile_(G, thJour) {
    var enModeJourMobile = G.enModeJourMobile, scroller = G.scroller, grilleEntete = G.grilleEntete, grilleCorps = G.grilleCorps;
    if (!enModeJourMobile || !scroller.isConnected || !scroller.getClientRects().length) return;
    if (!thJour) {
      var ecart = Infinity;
      grilleEntete.querySelectorAll(".th[data-gi]").forEach(function (th) {
        var e = Math.abs(decalerSurColonne_(G, th) - scroller.scrollLeft);
        if (e < ecart) { ecart = e; thJour = th; }
      });
    }
    var c = thJour && plageGrille_(thJour.style.gridColumn);
    if (!c) return;
    [grilleEntete, grilleCorps].forEach(function (g) {
      [].forEach.call(g.children, function (b) {
        if (!b.classList.contains("bulle")) return;
        var cb = plageGrille_(b.style.gridColumn);
        var ici = !!cb && cb[0] < c[0] + c[1] && cb[0] + cb[1] > c[0];
        if (b.classList.contains("hors-jour") === ici) b.classList.toggle("hors-jour", !ici);
      });
    });
    if (!G.geoGlisse_ || G.geoGlisse_.taille !== generationTaille_) majGeoGlisse_(G);
  }
  // Défilement posé par le script (defilerHorizontal_, grille-interactions
  // .js), `x` = sa position : espace entre semaines et case coin suivis
  // dans la même image. Avant tout rendu : rien.
  function suivreDefilementJourMobile(sc, x) {
    var G = grilleCourante_;
    if (!G || sc !== G.scroller || !G.enModeJourMobile) return;
    if (x == null) x = G.scroller.scrollLeft;
    G.xDejaSuivi = x;
    placerSepSemaines_(x);
    majCoinJourMobile_(G, x);
  }
  // Case coin en vue « 1 jour » (suite 70, cf. sa création plus bas) : le
  // jour affiché est celui dont le bord gauche est le plus proche du bord
  // de l'écran — même règle que l'arrêt du défilement (defilementArrete),
  // la case bascule donc à mi-chemin, là où l'aimantation posera le jour.
  // Une fois par image ; rien tant que la grille est masquée (tout y
  // mesure 0).
  function planifierMajCoinJourMobile_(G, x) {
    var enModeJourMobile = G.enModeJourMobile;
    G.xCoin_ = x != null ? x : null;
    if (!enModeJourMobile || G.rafCoinJour_) return;
    G.rafCoinJour_ = requestAnimationFrame(function () { G.rafCoinJour_ = null; majCoinJourMobile_(G, G.xCoin_); });
  }
  // Suite 72 : colonnes lues dans les positions mémorisées du glissement
  // (G.geoGlisse_) quand elles valent encore — aucune mesure à l'image.
  function majCoinJourMobile_(G, xConnu) {
    var enModeJourMobile = G.enModeJourMobile, coin = G.coin, scroller = G.scroller, grilleEntete = G.grilleEntete;
    if (!enModeJourMobile || !coin || !scroller.isConnected) return;
    var geo = G.geoGlisse_ && G.geoGlisse_.taille === generationTaille_ && G.geoGlisse_.gis.length ? G.geoGlisse_ : null;
    if (!geo && !scroller.getClientRects().length) return;
    var x = xConnu != null ? xConnu : scroller.scrollLeft;
    var gi = null, ecart = Infinity;
    if (geo) {
      geo.jours.forEach(function (c, j) {
        var e = Math.abs(Math.max(0, Math.round(c[0] - geo.debut)) - x);
        if (e < ecart) { ecart = e; gi = geo.gis[j]; }
      });
    } else {
      grilleEntete.querySelectorAll(".th[data-gi]").forEach(function (th) {
        var e = Math.abs(decalerSurColonne_(G, th) - x);
        if (e < ecart) { ecart = e; gi = +th.dataset.gi; }
      });
    }
    var iso = gi !== null ? isoDeGi(gi) : null;
    if (!iso || iso === G.isoCoinJour_) return;
    var avant = G.isoCoinJour_;
    G.isoCoinJour_ = iso;
    // Même mois, même année : rien à réécrire.
    if (avant && avant.slice(0, 7) === iso.slice(0, 7)) return;
    coin.innerHTML = htmlCoinMoisAnnee([iso]);
  }
  function decalerSurColonne_(G, th) {
    var grilleEntete = G.grilleEntete, LN = G.LN;
    if (!th) return 0;
    var rGrilleEntete = grilleEntete.getBoundingClientRect(), rTh = th.getBoundingClientRect();
    return Math.max(0, Math.round((rTh.left - rGrilleEntete.left) - LN));
  }

  // Arrêt du défilement en vue « 1 jour » (cf. son appel, construireGrille).
  function cablerArretJourMobile_(G) {
    var scroller = G.scroller, grilleEntete = G.grilleEntete, n = G.n, labsRendus = G.labsRendus;
    var minuteurArret = null, doigtsPoses = 0;
    var programmerArret = function () { clearTimeout(minuteurArret); minuteurArret = setTimeout(defilementArrete, 200); };
    scroller.addEventListener("touchstart", function (e) { doigtsPoses = e.touches.length; clearTimeout(minuteurArret); }, { passive: true });
    scroller.addEventListener("touchend", function (e) { doigtsPoses = e.touches.length; programmerArret(); }, { passive: true });
    scroller.addEventListener("touchcancel", function (e) { doigtsPoses = e.touches.length; programmerArret(); }, { passive: true });
    scroller.addEventListener("scroll", programmerArret, { passive: true });
    // Fin d'un glissement de page (suite 57, glisserVersJour dans
    // grille-interactions.js) : le jour est posé tout de suite, sans les
    // 200 ms d'attente d'un défilement natif (colonne des noms, bulle
    // amenée au bord), dont on ne connaît pas la fin autrement.
    scroller.addEventListener("jour-cale", function () { clearTimeout(minuteurArret); defilementArrete(); });
    var minuteurRecentrage = null, membresChanges = false;
    var defilementArrete = function () {
      if (!scroller.isConnected || doigtsPoses > 0) return;
      // Glissement de page encore en cours : il pose le jour à sa fin.
      if (calageJourEnCours) return;
      // Bulle tenue au doigt (changement de jour en l'amenant au bord,
      // suite 26) : jour posé repris une fois la bulle lâchée (suite 41 —
      // l'arrêt était abandonné jusqu'ici, et avec lui le calcul des
      // largeurs du jour atteint si plus aucun défilement ne suivait).
      if (syncEnCours || document.body.classList.contains("en-glissement")) { minuteurArret = setTimeout(defilementArrete, 400); return; }
      var thJour = null, ecart = Infinity;
      grilleEntete.querySelectorAll(".th[data-gi]").forEach(function (th) {
        var e = Math.abs(decalerSurColonne_(G, th) - scroller.scrollLeft);
        if (e < ecart) { ecart = e; thJour = th; }
      });
      if (!thJour) return;
      poserJourMobile_(G, thJour); // poignées du jour posé (suite 91)
      var giJour = +thJour.dataset.gi, isoJour = isoDeGi(giJour);
      if (!isoJour) return;
      // Suite 97 — Lionel : « en sélection simple, quand on change de
      // jour, la case est désélectionnée. Et en multiple, la case reste
      // sélectionnée. » Nouveau jour posé, sélection simple (ni plusieurs
      // bulles, ni mode multiple : body.selection-multiple) dont la bulle
      // n'est plus sur ce jour (.hors-jour, ou plus dans la grille) : la
      // sélection est vidée. Une bulle encore là (tâche de plusieurs
      // jours, bulle amenée au bord ou étirée jusqu'au nouveau jour)
      // reste sélectionnée.
      // Suite 98 : cases étalées (pastille « +N ») replacées au nouveau jour.
      if (isoJour !== jourMobileIso && Object.keys(G.cascadesOuvertes_).length) { G.cascadesOuvertes_ = {}; cascaderBullesJourMobile_(G); }
      if (isoJour !== jourMobileIso && !document.body.classList.contains("selection-multiple")) {
        var idsSel = Object.keys(bullesSelectionnees);
        if (idsSel.length && idsSel.every(function (id) {
          return [].every.call(racineEl.querySelectorAll('.bulle[data-id="' + id + '"]'), function (b) { return b.classList.contains("hors-jour"); });
        })) quitterModeSelection();
      }
      // Suite 118 : membres d'une équipe repliée suivant le jour affiché.
      var membresAvant = signatureMembresAffiches_();
      jourMobileIso = isoJour;
      if (signatureMembresAffiches_() !== membresAvant) membresChanges = true;
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
      if (rangJour >= 2 && rangJour <= n - 3) {
        // Suite 118 : membres à montrer / cacher pour ce jour — grille
        // refaite une fois l'image affichée, comme le recentrage.
        if (membresChanges) {
          clearTimeout(minuteurRecentrage);
          var refaireMembres = function () {
            if (!scroller.isConnected || doigtsPoses > 0 || calageJourEnCours) return;
            if (syncEnCours || document.body.classList.contains("en-glissement")) { minuteurRecentrage = setTimeout(refaireMembres, 400); return; }
            render(false);
          };
          minuteurRecentrage = setTimeout(refaireMembres, 0);
        }
        return;
      }
      // Pas tout de suite (round du 27.09.2026, suite 72) : la
      // reconstruction de la grille (quelques dizaines de ms sur un
      // téléphone) tombait dans la dernière image du glissement, qui
      // arrivait donc en retard, d'un coup. Minuterie posée depuis cette
      // image : elle part une fois l'image affichée — le jour arrive,
      // puis la grille se reconstruit à l'identique sous le doigt levé.
      // Doigt reposé ou glissement de page entre-temps : son propre arrêt
      // s'en chargera ; synchro ou bulle tenue : on réessaie plus tard,
      // comme l'arrêt lui-même.
      clearTimeout(minuteurRecentrage);
      var recentrerApresGlissement = function () {
        if (!scroller.isConnected || doigtsPoses > 0 || calageJourEnCours) return;
        if (syncEnCours || document.body.classList.contains("en-glissement")) { minuteurRecentrage = setTimeout(recentrerApresGlissement, 400); return; }
        recentrerFenetreJourMobile();
      };
      minuteurRecentrage = setTimeout(recentrerApresGlissement, 0);
    };
    // Recentrage : la fenêtre est recalculée autour du jour affiché
    // (debutFenetreMobile = null -> debutFenetreJourMobile_, core.js) ;
    // rien à faire si elle ne peut pas bouger (tout début/fin des semaines
    // du planning). Semaine voisine en principe déjà en cache
    // (prechargerVoisinesJourMobile) : reconstruction immédiate.
    var recentrerFenetreJourMobile = function () {
      // Suite 97 — Lionel : « en multiple, la case reste sélectionnée »
      // au changement de jour. La sélection était vidée d'office au
      // recentrage : les id des bulles et leurs colonnes (giDebut) sont
      // refaits avec la fenêtre. Chaque bulle sélectionnée est donc
      // notée par son contenu (cleBulle_) et sa DATE de début, puis
      // retrouvée dans la nouvelle fenêtre (la bulle de même contenu qui
      // couvre cette date) ; celles qui en sortent sont désélectionnées.
      // (La sélection simple d'une bulle absente du jour a déjà été
      // vidée à l'arrêt, plus haut.)
      var selAvant = [];
      Object.keys(bullesSelectionnees).forEach(function (id) {
        var p = itemParId(id), iso = p && isoDeGi(p.item.giDebut);
        if (iso) selAvant.push({ cle: cleBulle_(p.item), iso: iso });
      });
      debutFenetreMobile = null;
      if (fenetreLabGs().join(",") === labsRendus) { if (membresChanges) render(false); return; }
      bullesSelectionnees = {};
      assurerFenetreChargee(function () {
        construireVueDepuisCache();
        var toutes = TACHES.concat(JALONS, NOTES);
        selAvant.forEach(function (sel) {
          var gi = giDepuisIso(sel.iso);
          if (gi == null) return;
          var it = toutes.filter(function (x) { return !bullesSelectionnees[x.id] && cleBulle_(x) === sel.cle && gi >= x.giDebut && gi < x.giDebut + x.duree; })[0];
          if (it) bullesSelectionnees[it.id] = true;
        });
        if (!Object.keys(bullesSelectionnees).length) { modeSelectionMultiple = false; copieSelectionActive = false; }
        render(false); majBarreSelection();
      });
    };
    prechargerVoisinesJourMobile();
  }
