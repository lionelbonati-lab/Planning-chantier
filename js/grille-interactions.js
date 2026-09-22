"use strict";
  /* ============================================================
     DRAG / RESIZE / SÉLECTION — repris quasiment à l'identique du
     prototype (mécanique générique indépendante de la source des
     données). Les fonctions continuent de muter TACHES/JALONS/NOTES en
     mémoire ; render() se charge ensuite de synchroniser au serveur
     (cf. bloc "MOTEUR DE SYNCHRONISATION" plus haut).
     ============================================================ */
  // demiDebut/demiFin (round du 08.09.2026, suite, encore — §49) : plus de
  // comparaison sur un seul `it.demi` fixe — un redimensionnement peut
  // désormais faire passer une tâche d'une demi-journée à l'autre (comme un
  // jalon/note), donc survoler la cellule "aprem" alors que `it` était posé
  // le matin doit rester VALIDE (seuls kind+personne comptent ici).
  function kindEtPersonneOk(it, cel) {
    if (it.personneId !== undefined) return cel.dataset.kind === "personne" && cel.dataset.personne === it.personneId;
    return cel.dataset.kind === it.type;
  }

  // trouverScroller() — round du 16.09.2026 (suite, encore). Depuis la
  // scission grilleEntete/grilleCorps (cf. commentaire CSS de
  // .entete-planning-figee), une bulle/case de la ligne Jalons ou Notes vit
  // dans .entete-planning-scroll, PAS dans .scroller — un simple
  // el.closest(".scroller") n'y trouve donc plus rien pour ces 2 lignes
  // (panoramique tactile et défilement auto en bord d'écran pendant un
  // glissé restaient sans effet, sans planter grâce aux `if (scroller)` déjà
  // présents partout, cf. leurs sites d'appel). .entete-planning-scroll
  // n'ayant pas sa propre barre de défilement (son scrollLeft n'est qu'un
  // MIROIR, cf. l'écouteur "scroll" de .scroller dans construireGrille), lui
  // appliquer un défilement directement désynchroniserait l'en-tête du
  // corps ; on redirige donc systématiquement vers le VRAI .scroller (le
  // mirroring se charge ensuite de répercuter le mouvement sur l'en-tête).
  function trouverScroller(el) {
    var s = el.closest(".scroller, .entete-planning-scroll");
    if (s && s.classList.contains("entete-planning-scroll")) return document.querySelector(".scroller") || s;
    return s;
  }

  var BORD_ZONE = 46, BORD_VITESSE_MAX = 16;
  function creerAutoDefilement(scroller) {
    var raf = null, dx = 0;
    function tick() { if (dx !== 0 && scroller) { scroller.scrollLeft += dx; raf = requestAnimationFrame(tick); } else raf = null; }
    return {
      maj: function (clientX) {
        if (!scroller) return;
        var r = scroller.getBoundingClientRect();
        if (clientX < r.left + BORD_ZONE) dx = -BORD_VITESSE_MAX * (1 - Math.max(0, clientX - r.left) / BORD_ZONE);
        else if (clientX > r.right - BORD_ZONE) dx = BORD_VITESSE_MAX * (1 - Math.max(0, r.right - clientX) / BORD_ZONE);
        else dx = 0;
        if (dx !== 0 && raf === null) raf = requestAnimationFrame(tick);
      },
      arreter: function () { dx = 0; if (raf) { cancelAnimationFrame(raf); raf = null; } }
    };
  }

  // demiDebut/demiFin (round du 08.09.2026, suite, encore — §49) : depuis
  // que TOUS les types de bulle (jalon/note/tâche/absence) portent
  // désormais leur propre demiDebut/demiFin par bord (plus de champ `demi`
  // fixe réservé aux tâches/absences), le redimensionnement en
  // demi-journée s'applique uniformément à tous — plus de distinction
  // "note ou jalon" (`estNoteOuJalon`), plus de repli `demiFixePourItem`, et
  // plus d'`ancrageAffichage` (mécanisme du §48 pour une bulle "fusionnée" —
  // devenu sans objet : une tâche/absence est maintenant nativement 1 seul
  // item continu, cf. FRONTEND-CHANGELOG §49). Chaque poignée gouverne son
  // PROPRE bord (demiDebutPrevisu pour la gauche, demiFinPrevisu pour la
  // droite, cf. demiPourRedimNote) ; l'autre bord n'est jamais touché — ce
  // qui permet d'atteindre "1 jour et demi" en tirant une poignée depuis
  // une bulle déjà en demi-journée (round du 03.09.2026, étendu au jalon au
  // §47, aux tâches/absences ici).
  function cablerPoigneeRedim(handleEl, bulleDom, it, cote) {
    handleEl.addEventListener("pointerdown", function (e) {
      if (bullesSelectionnees[bulleDom.dataset.id]) { basculerSelection(bulleDom.dataset.id); e.preventDefault(); e.stopPropagation(); return; }
      if (estGiWeekend(it.giDebut)) { e.preventDefault(); e.stopPropagation(); return; } // isolée, jamais redimensionnable
      e.preventDefault(); e.stopPropagation();
      var sx = e.clientX, sy = e.clientY, dernierX = sx, dernierY = sy;
      var pointerId = e.pointerId;
      var scroller = trouverScroller(bulleDom);
      var nTotal = nbJoursAffiches();
      var giDebutOrig = it.giDebut, dureeOrig = it.duree;
      var giFinExclusifFixe = giDebutOrig + dureeOrig;
      var arme = false, enDefilement = false;
      var giDebutPrevisu = giDebutOrig, dureePrevisu = dureeOrig;
      var demiDebutOrig = it.demiDebut || null, demiFinOrig = it.demiFin || null;
      var demiDebutPrevisu = demiDebutOrig, demiFinPrevisu = demiFinOrig;

      // spanColonnes (pas dureePrevisu directement) : même correctif que le
      // rendu statique (cf. FRONTEND-CHANGELOG.md §7) — sans lui, étirer la
      // poignée d'un jalon/note/tâche du vendredi jusqu'au lundi avec les
      // week-ends affichés arrêtait l'aperçu au milieu du week-end au lieu
      // d'atteindre lundi (3e site du même bug, trouvé lors de l'audit du
      // 02.09.2026 — les données enregistrées restaient correctes, seul
      // l'aperçu en direct était faux).
      //
      // colonneEtSpanDemi (round du 03.09.2026) : même correctif, un 4e
      // site du même problème — désormais PARTAGÉ avec le rendu statique
      // (cf. sa définition, juste après spanColonnes ci-dessus) pour que
      // les deux ne puissent plus jamais diverger.
      function appliquerPrevisu() {
        var giAff = (cote === "droite") ? giDebutOrig : giDebutPrevisu;
        var giFinAff = (cote === "droite") ? (giDebutPrevisu + dureePrevisu) : giFinExclusifFixe;
        var demiDebAff = (cote === "droite") ? demiDebutOrig : demiDebutPrevisu;
        var demiFinAff = (cote === "droite") ? demiFinPrevisu : demiFinOrig;
        var cs = colonneEtSpanDemi(giAff, giFinAff - giAff, demiDebAff, demiFinAff);
        bulleDom.style.gridColumn = cs[0] + " / span " + cs[1];
      }
      function armer() { arme = true; document.body.classList.add("en-glissement"); handleEl.classList.add("actif"); }
      function detacher() {
        clearTimeout(minuteur);
        document.body.classList.remove("en-glissement");
        handleEl.classList.remove("actif");
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onCancel);
        try { handleEl.releasePointerCapture(pointerId); } catch (ex) {}
      }
      function onMove(e2) {
        if (e2.pointerId !== pointerId) return;
        if (!arme) {
          var dist = Math.abs(e2.clientX - sx) + Math.abs(e2.clientY - sy);
          if (!enDefilement && dist > SEUIL_DEFILEMENT) { enDefilement = true; clearTimeout(minuteur); }
          if (enDefilement) { if (scroller) scroller.scrollLeft -= (e2.clientX - dernierX); window.scrollBy(0, -(e2.clientY - dernierY)); }
          dernierX = e2.clientX; dernierY = e2.clientY;
          return;
        }
        bulleDom.style.visibility = "hidden";
        var sous = document.elementFromPoint(e2.clientX, e2.clientY);
        bulleDom.style.visibility = "";
        var cel = sous && sous.closest(".cell");
        if (!cel || !kindEtPersonneOk(it, cel)) return;
        var giSurvol = +cel.dataset.jour;
        if (estGiWeekend(giDebutOrig) || estGiWeekend(giSurvol)) return;
        if (cote === "droite") {
          dureePrevisu = Math.max(1, Math.min(nTotal - giDebutOrig, giSurvol - giDebutOrig + 1));
          giDebutPrevisu = giDebutOrig;
          var bordsD = demiPourRedimNote(cote, dureePrevisu, demiDebutOrig, demiFinOrig, demiDepuisPointeur(cel, e2.clientX));
          demiDebutPrevisu = bordsD.demiDebut; demiFinPrevisu = bordsD.demiFin;
        } else {
          giDebutPrevisu = Math.max(0, Math.min(giFinExclusifFixe - 1, giSurvol));
          dureePrevisu = giFinExclusifFixe - giDebutPrevisu;
          var bordsG = demiPourRedimNote(cote, dureePrevisu, demiDebutOrig, demiFinOrig, demiDepuisPointeur(cel, e2.clientX));
          demiDebutPrevisu = bordsG.demiDebut; demiFinPrevisu = bordsG.demiFin;
        }
        appliquerPrevisu();
      }
      // Remet la bulle EXACTEMENT sur sa forme d'origine (round du
      // 08.09.2026, suite — Lionel : « bug visuel récurant ou l'apercu de
      // déplacement reste visible a l'ecran après dépose ») : appliquerPrevisu()
      // écrit directement sur bulleDom.style.gridColumn pendant le
      // glissement (ce n'est PAS un clone séparé, contrairement au
      // fantome-glisse du déplacement de bulle entière) — tout chemin de
      // sortie qui n'appelle pas render() doit donc explicitement remettre
      // ce style à sa valeur d'origine, sinon la bulle RÉELLE reste affichée
      // à la taille de l'aperçu alors que la donnée sous-jacente (it), elle,
      // n'a pas changé. Seul onCancel() le faisait ; onUp() avait 2 sorties
      // anticipées (enDefilement, !arme) qui ne le faisaient pas — un
      // survol/pointerup un peu particulier (auto-défilement déclenché, ou
      // un clic sans geste après tout) pouvait donc laisser la bulle
      // visuellement rétrécie/étendue sans que rien n'ait réellement changé.
      function reappliquerFormeOrigine() {
        var cs = colonneEtSpanDemi(giDebutOrig, giFinExclusifFixe - giDebutOrig, demiDebutOrig, demiFinOrig);
        bulleDom.style.gridColumn = cs[0] + " / span " + cs[1];
      }
      function onUp(e2) {
        if (e2.pointerId !== pointerId) return;
        detacher();
        if (enDefilement) { reappliquerFormeOrigine(); return; }
        if (!arme) { reappliquerFormeOrigine(); return; }
        if (giDebutPrevisu === giDebutOrig && dureePrevisu === dureeOrig && demiDebutPrevisu === demiDebutOrig && demiFinPrevisu === demiFinOrig) { reappliquerFormeOrigine(); return; }
        sauvegarderUndo();
        it.giDebut = giDebutPrevisu; it.duree = dureePrevisu;
        // dateDebutIso (round du 07.09.2026, cf. plus bas appliquerDelta/
        // appliquerDeltaNote/appliquerCibleUnitaire) : à rafraîchir à CHAQUE
        // mutation de giDebut, jamais laissé en l'état.
        it.dateDebutIso = isoDeGi(it.giDebut);
        it.demiDebut = demiDebutPrevisu; it.demiFin = demiFinPrevisu;
        render(); toast("Étendu.");
      }
      function onCancel(e2) {
        if (e2.pointerId !== pointerId) return;
        detacher();
        reappliquerFormeOrigine();
      }

      var immediat = e.pointerType !== "touch";
      var minuteur = immediat ? null : setTimeout(armer, DELAI_SELECTION);
      if (immediat) armer();
      try { handleEl.setPointerCapture(pointerId); } catch (ex) {}
      // document (pas handleEl) — cf. §79.
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onCancel);
    });
  }

  var dernierClicBulle = null, dernierClicTemps = 0;
  function ouvrirBulle(itemData, plage, x, y) {
    if (plage && plage.liste === TACHES) ouvrirEdition(null, itemData, null, x, y);
    else if (plage) ouvrirEditionPlage(itemData.type, itemData, null, null, x, y);
  }
  function resoudreClicBulle(id, itemData, plage, x, y) {
    var maintenant = Date.now();
    var estDouble = dernierClicBulle === id && (maintenant - dernierClicTemps) < DELAI_DOUBLE_CLIC;
    dernierClicBulle = estDouble ? null : id;
    dernierClicTemps = maintenant;
    if (estDouble) ouvrirBulle(itemData, plage, x, y);
    else basculerSelection(id);
  }

  function onPointerDownGroupeSelection(e) {
    var bulleDom = e.currentTarget;
    var idClic = bulleDom.dataset.id;
    var plageClic = itemDepuisBulle(bulleDom);
    if (!plageClic) { basculerSelection(idClic); return; }
    var itemClic = plageClic.item;
    // offsetJoursClic (round du 08.09.2026, suite — Lionel : "applique cela
    // aux jalons, tâches et absence, toutes les bulles doivent avoir le même
    // comportement" ; §49 — tâches/absences désormais dotées nativement de
    // demiDebut/demiFin comme les notes/jalons, cf. FRONTEND-CHANGELOG) :
    // 1 item = 1 seule bulle DOM continue de TOUJOURS itemClic.duree jours
    // de large, quel que soit son type — fraction de pixel -> jour, rapportée
    // à itemClic.giDebut.
    var offsetJoursClic = 0;
    if (itemClic.duree > 1 && !estGiWeekend(itemClic.giDebut)) {
      var rectClic = bulleDom.getBoundingClientRect();
      if (rectClic.width > 0) offsetJoursClic = Math.max(0, Math.min(itemClic.duree - 1, Math.floor((e.clientX - rectClic.left) / (rectClic.width / itemClic.duree))));
    }
    // offsetHalvesClic (round du 07.09.2026, suite ; étendu au round du
    // 08.09.2026, suite ; puis §49 — Lionel : "1 tâche ne peux pas etre mise
    // sur 2 case, elle s'étent de 1 jour (de 1 a 3 ,5 ou 7 case)", cf.
    // bordsDeplacementNoteMultiJours plus bas pour le détail) : équivalent en
    // demi-slots d'offsetJoursClic ci-dessus, pour le déplacement en
    // demi-journée de N'IMPORTE QUELLE bulle (note, jalon, tâche, absence —
    // depuis §49 toutes portent demiDebut/demiFin) en mode compact à la
    // souris — seul cas où la géométrie pixel-précise par demi-jour existe
    // (cf. colonneEtSpanDemi). Le tactile n'en a pas besoin (repli sur le
    // comportement jour entier, cf. appliquerCibleUnitaire pour les tâches).
    // Calculé pour TOUTE bulle (plus seulement duree > 1, depuis que
    // bordsDeplacementNoteMultiJours gouverne aussi les plages d'1 jour) :
    // une plage d'1 jour occupe 1 ou 2 demi-slots selon sa forme, exactement
    // comme `lClic` ci-dessous le calcule dans les 2 cas. Utilise la
    // géométrie RÉELLE de la bulle (largeur en pixels), pas `duree` :
    // contrairement à offsetJoursClic, la fraction du clic dans la largeur
    // totale est rapportée au nombre de demi-slots RÉELLEMENT occupés (`L`,
    // cf. demiSlotsDepuisBornes), qui peut différer de `duree * 2` quand un
    // bord est déjà en demi-journée.
    var offsetHalvesClic = 0;
    if (e.pointerType !== "touch") {
      var bClicSlots = demiSlotsDepuisBornes(itemClic.giDebut, itemClic.duree, itemClic.demiDebut || null, itemClic.demiFin || null);
      var lClic = bClicSlots.halfFinIncl - bClicSlots.halfStart + 1;
      var rectClicHalf = bulleDom.getBoundingClientRect();
      if (rectClicHalf.width > 0) offsetHalvesClic = Math.max(0, Math.min(lClic - 1, Math.floor(((e.clientX - rectClicHalf.left) / rectClicHalf.width) * lClic)));
    }
    var dejaSelectionnee = !!bullesSelectionnees[idClic];
    var groupeIds = dejaSelectionnee ? Object.keys(bullesSelectionnees) : [idClic];
    var tactile = e.pointerType === "touch";
    var copie = !tactile && e.shiftKey;
    var copieActuelle = copie;
    var sx = e.clientX, sy = e.clientY, dernierX = sx, dernierY = sy;
    var pointerId = e.pointerId;
    var scroller = trouverScroller(bulleDom);
    var autoDefil = creerAutoDefilement(scroller);
    var arme = false, enDefilement = false, bouge = false, badge = null;
    var fantomes = [];
    var cibleActuelle = null, surBoutonSuppr = false, cellulesSurvoleesActuelles = [];
    var surlignagePrecisEl = null;

    function kindOrigineGeste() { return plageClic.liste === TACHES ? "personne" : itemClic.type; }
    function celluleValidePourGeste(cible) {
      if (!cible || cible.dataset.kind !== kindOrigineGeste()) return false;
      if (plageClic.liste === TACHES && secteurPersonne(cible.dataset.personne) !== secteurPersonne(itemClic.personneId)) return false;
      return true;
    }
    function cellulesPlagePourSurvol(celluleSousPointeur) {
      if (!celluleSousPointeur) return [];
      var giBrut = +celluleSousPointeur.dataset.jour;
      var kind = celluleSousPointeur.dataset.kind;
      var extra = kind === "personne" ? { personne: celluleSousPointeur.dataset.personne, demi: celluleSousPointeur.dataset.demi } : null;
      if (estGiWeekend(giBrut)) { var c0 = celluleAPosition(kind, extra, giBrut); return c0 ? [c0] : []; }
      var duree = itemClic.duree || 1;
      var nTotal = nbJoursAffiches();
      var giCible = Math.max(0, Math.min(nTotal - duree, giBrut - offsetJoursClic));
      var out = [];
      for (var i = 0; i < duree; i++) { var c = celluleAPosition(kind, extra, giCible + i); if (c) out.push(c); }
      return out;
    }
    // Surbrillance de dépôt PRÉCISE en demi-journée (round du 07.09.2026,
    // suite — Lionel, capture d'écran à l'appui : « la surbrillance ne se
    // fait que sur les journée entière, je pense qu'on devrait plutôt parler
    // de cases »). cellulesPlagePourSurvol() ci-dessous ne peut structurellement
    // surligner que des .cell ENTIÈRES (une par jour, cf. creerCelluleFond —
    // jamais scindées en demi-journées, contrairement aux bulles elles-mêmes,
    // positionnées par colonneEtSpanDemi via colonneDemi) : dès que la
    // destination d'une note implique une demi-journée, la surbrillance
    // débordait donc toujours d'une demi-case de trop d'un côté. Cette
    // fonction calcule la géométrie FINALE exacte (même fonction pure que
    // resoudreCibleGroupe utilise au relâchement : bordsDeplacementNoteMultiJours
    // — modèle demi-slot, §38, étendu aux notes d'1 jour au round du
    // 08.09.2026 suite, cf. son en-tête), pour positionner un élément de
    // surbrillance dédié avec colonneEtSpanDemi() — la MÊME fonction qui pose
    // déjà la bulle réelle et son aperçu de redimensionnement — plutôt que de
    // dépendre des cellules DOM de fond.
    //
    // Restreint à souris + item seul (pas de sélection groupée) + cellule de
    // destination valide + hors week-end — exactement le même périmètre que
    // les rounds précédents (§37/§38), étendu aux jalons au round du
    // 08.09.2026 (suite, §47 du FRONTEND-CHANGELOG — parité demandée par
    // Lionel), puis aux tâches/absences au §49 (Lionel : "1 tâche ne peux
    // pas etre mise sur 2 case, elle s'étent de 1 jour" — désormais dotées
    // nativement de demiDebut/demiFin comme les notes/jalons, cf.
    // FRONTEND-CHANGELOG) : le tactile n'a pas la géométrie pixel-précise
    // par demi-jour (cf. colonneEtSpanDemi), et le week-end n'a qu'une seule
    // case par personne (§2 du spec). Renvoie null dans ces cas : le survol
    // retombe alors sur le comportement par cellule entière ci-dessous,
    // inchangé.
    function cibleNotePreciseCompacte(cible, clientX) {
      if (tactile || groupeIds.length !== 1 || clientX == null) return null;
      if (!celluleValidePourGeste(cible)) return null;
      var giCibleBrut = +cible.dataset.jour;
      if (estGiWeekend(giCibleBrut)) return null;
      var nTotal = nbJoursAffiches();
      var demiDebutActuelNote = itemClic.demiDebut || null, demiFinActuelNote = itemClic.demiFin || null;
      var demiSousPointeurMulti = demiDepuisPointeur(cible, clientX);
      return bordsDeplacementNoteMultiJours(itemClic.giDebut, itemClic.duree, demiDebutActuelNote, demiFinActuelNote, offsetHalvesClic, giCibleBrut, demiSousPointeurMulti, nTotal);
    }
    function nettoyerSurvol() {
      cellulesSurvoleesActuelles.forEach(function (c) { c.classList.remove("drop-hover", "cell-interdite"); });
      cellulesSurvoleesActuelles = [];
      if (surlignagePrecisEl) { surlignagePrecisEl.remove(); surlignagePrecisEl = null; }
    }
    function survolerCible(cible, clientX) {
      nettoyerSurvol();
      if (!cible) return;
      var precis = cibleNotePreciseCompacte(cible, clientX);
      if (precis) {
        surlignagePrecisEl = document.createElement("div");
        surlignagePrecisEl.className = "survol-precis";
        surlignagePrecisEl.style.pointerEvents = "none";
        var cs = colonneEtSpanDemi(precis.giDebut, precis.duree, precis.demiDebut, precis.demiFin);
        surlignagePrecisEl.style.gridColumn = cs[0] + " / span " + cs[1];
        // gridRow = cible.style.gridRow (round du 16.09.2026 ; auparavant
        // bulleDom.style.gridRow, cf. FRONTEND-CHANGELOG) : bulleDom reste
        // affiché (juste estompé, cf. armer()/"glisse-groupe") À SA LIGNE
        // D'ORIGINE pendant tout le glissement — un vrai déplacement fait
        // passer le pointeur sur une AUTRE ligne (une autre personne) que
        // celle-ci, donc bulleDom.style.gridRow ne correspondait plus du
        // tout à la ligne survolée. C'est exactement le bug signalé par
        // Lionel (« la sur-brillance... se perd d'une ligne à l'autre ») :
        // posée sur la ligne de départ, elle semblait disparaître dès qu'on
        // visait une AUTRE personne. `cible` est la vraie `.cell` survolée
        // (poser() lui a déjà donné le bon gridRow), donc la source correcte.
        surlignagePrecisEl.style.gridRow = cible.style.gridRow;
        // Hauteur : plus fixée en JS (cf. le commentaire CSS de
        // .survol-precis, retiré le 16.09.2026) — stretch par défaut de
        // .grille étire maintenant cet élément sur toute la hauteur
        // réellement dessinée de la ligne, comme .selection-precis. C'est
        // précisément ce que Lionel demande (« je préfèrerai que la(les)
        // case cible soient entièrement sur-brillée » plutôt que la taille
        // de la bulle).
        bulleDom.parentElement.appendChild(surlignagePrecisEl);
        return;
      }
      var classe = celluleValidePourGeste(cible) ? "drop-hover" : "cell-interdite";
      cellulesSurvoleesActuelles = cellulesPlagePourSurvol(cible);
      cellulesSurvoleesActuelles.forEach(function (c) { c.classList.add(classe); });
    }
    function armer() {
      arme = true;
      document.body.classList.add("en-glissement");
      groupeIds.forEach(function (id) {
        var dom = document.querySelector('.bulle[data-id="' + id + '"]');
        if (!dom) return;
        dom.classList.add("glisse-groupe");
        var r = dom.getBoundingClientRect();
        var clone = dom.cloneNode(true);
        clone.className = "bulle fantome-glisse bulle-plage";
        clone.style.position = "fixed"; clone.style.left = r.left + "px"; clone.style.top = r.top + "px";
        clone.style.width = r.width + "px"; clone.style.margin = "0"; clone.style.pointerEvents = "none";
        document.body.appendChild(clone);
        fantomes.push({ clone: clone, left: r.left, top: r.top, id: id });
      });
      if (groupeIds.length > 1 || copie) {
        badge = document.createElement("div");
        badge.className = "badge-glisse";
        badge.textContent = (tactile ? "" : (copie ? "Copier " : "Déplacer ")) + groupeIds.length + (groupeIds.length > 1 ? " bulles" : " bulle");
        badge.style.left = (sx + 14) + "px"; badge.style.top = (sy + 14) + "px";
        document.body.appendChild(badge);
      }
    }
    function nettoyerFantomes() {
      if (badge) { badge.remove(); badge = null; }
      fantomes.forEach(function (f) { f.clone.remove(); });
      fantomes = [];
      groupeIds.forEach(function (id) { var dom = document.querySelector('.bulle[data-id="' + id + '"]'); if (dom) dom.classList.remove("glisse-groupe"); });
      // round du 08.09.2026 (suite) : Lionel, « j'ai un bug visuel récurant
      // ou l'apercu de déplacement reste visible a l'ecran après dépose de
      // la note » — nettoyerFantomes() (ghost qui suit le curseur) et
      // nettoyerSurvol() (surbrillance précise de la case ciblée,
      // .survol-precis, §39) étaient 2 fonctions SÉPARÉES : chaque site
      // d'appel de resoudreCibleGroupe qui appelait nettoyerFantomes() sans
      // ÉGALEMENT appeler nettoyerSurvol() risquait de laisser
      // .survol-precis affiché après le lâcher. detacher() (appelé en tout
      // premier par onUp/onUp2/onCancel) appelle déjà nettoyerSurvol() dans
      // le chemin normal, mais consolider ici enlève toute cette classe de
      // risque pour de bon plutôt que de compter sur chaque site d'appel
      // pour se souvenir des 2 — nettoyer les fantômes sans nettoyer la
      // surbrillance de dépôt n'a de toute façon jamais de sens : les 2
      // n'existent que pendant le même geste de glissement.
      nettoyerSurvol();
    }
    function detacher() {
      clearTimeout(minuteur);
      document.body.classList.remove("en-glissement");
      autoDefil.arreter();
      if (baSupprimerEl) baSupprimerEl.classList.remove("cible-suppr");
      nettoyerSurvol();
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      try { bulleDom.releasePointerCapture(pointerId); } catch (ex) {}
    }
    function onMove(e2) {
      if (e2.pointerId !== pointerId) return;
      if (!arme) {
        var dist = Math.abs(e2.clientX - sx) + Math.abs(e2.clientY - sy);
        if (!enDefilement && dist > SEUIL_DEFILEMENT) { enDefilement = true; clearTimeout(minuteur); }
        if (enDefilement) { if (scroller) scroller.scrollLeft -= (e2.clientX - dernierX); window.scrollBy(0, -(e2.clientY - dernierY)); }
        dernierX = e2.clientX; dernierY = e2.clientY;
        return;
      }
      var d2 = Math.abs(e2.clientX - sx) + Math.abs(e2.clientY - sy);
      if (d2 > 4) bouge = true;
      if (!tactile) {
        copieActuelle = !!e2.shiftKey;
        if (!badge && copieActuelle) { badge = document.createElement("div"); badge.className = "badge-glisse"; document.body.appendChild(badge); }
        if (badge) badge.textContent = (copieActuelle ? "Copier " : "Déplacer ") + groupeIds.length + (groupeIds.length > 1 ? " bulles" : " bulle");
      }
      var dx = e2.clientX - sx, dy = e2.clientY - sy;
      fantomes.forEach(function (f) { f.clone.style.left = (f.left + dx) + "px"; f.clone.style.top = (f.top + dy) + "px"; });
      if (badge) { badge.style.left = (e2.clientX + 14) + "px"; badge.style.top = (e2.clientY + 14) + "px"; }
      autoDefil.maj(e2.clientX);
      var sous = document.elementFromPoint(e2.clientX, e2.clientY);
      surBoutonSuppr = !!(sous && sous.closest("#baSupprimer"));
      if (baSupprimerEl) baSupprimerEl.classList.toggle("cible-suppr", surBoutonSuppr);
      cibleActuelle = surBoutonSuppr ? null : (sous && sous.closest(".cell"));
      survolerCible(cibleActuelle, e2.clientX);
    }
    function supprimerGroupeConfirme() {
      nettoyerFantomes();
      var texteSuppr = "Supprimer " + groupeIds.length + " bulle" + (groupeIds.length > 1 ? "s" : "") + " ?";
      demanderConfirmation(texteSuppr, function () {
        sauvegarderUndo();
        groupeIds.forEach(function (id) {
          var plage = itemParId(id);
          if (!plage) return;
          var i = plage.liste.indexOf(plage.item);
          if (i >= 0) plage.liste.splice(i, 1);
          delete bullesSelectionnees[id];
        });
        quitterModeSelection();
        render();
        toast("Supprimé (" + groupeIds.length + ").");
      }, function () { render(false); });
    }
    function appliquerDelta(delta, copieFinale) {
      var nTotal = nbJoursAffiches();
      nettoyerFantomes();
      sauvegarderUndo();
      var nb = 0;
      groupeIds.forEach(function (id) {
        var plage = itemParId(id);
        if (!plage) return;
        var it = plage.item;
        var ni = Math.max(0, Math.min(nTotal - it.duree, it.giDebut + delta));
        if (copieFinale) {
          // demiDebut/demiFin (round du 03.09.2026, étendu au jalon le
          // 08.09.2026 — §47 du FRONTEND-CHANGELOG — puis à la tâche/absence
          // au §49, désormais dotée du même modèle) : sans eux, copier une
          // bulle démarrant/finissant en demi-journée par glissement
          // (Maj+glisser) donnait une copie en journée entière — la
          // demi-journée de l'originale disparaissait en silence.
          if (plage.liste === TACHES) plage.liste.push(itemPlageTache(it.type, it.texte, it.personneId, ni, it.duree, { important: it.important, chantier: it.chantier, statut: it.statut, demiDebut: it.demiDebut, demiFin: it.demiFin, serieId: it.serieId }));
          else plage.liste.push(itemPlage(it.type, it.texte, ni, it.duree, { important: it.important, demiDebut: it.demiDebut, demiFin: it.demiFin }));
        } else {
          it.giDebut = ni;
          // dateDebutIso (round du 07.09.2026, signalé par Lionel : "le
          // déplacement d'une demi journée ne fonctionne pas") : ce champ,
          // posé une fois pour toutes par construireVueDepuisCache() au
          // rendu depuis le serveur, n'était JAMAIS rafraîchi par un
          // déplacement local — isoDeApres()/diffsNotes (cf. plus haut)
          // le préfèrent pourtant à un recalcul depuis giDebut dès qu'il
          // est renseigné. Résultat : la synchronisation envoyait encore
          // l'ANCIENNE date au serveur après un déplacement, qui écrivait
          // donc au mauvais endroit (souvent un no-op sur l'ancienne case) —
          // au rechargement qui suit tout de suite après, la bulle
          // "revenait" à sa position de départ, donnant l'impression qu'un
          // glissement n'avait servi à rien. Un jalon n'utilise pas ce
          // champ pour sa synchro (diffsJalons recalcule labG/jourIdx à
          // chaque fois depuis giDebut, jamais depuis dateDebutIso) mais le
          // garder à jour reste correct pour lui aussi (référence de série).
          it.dateDebutIso = isoDeGi(it.giDebut);
        }
        nb++;
      });
      quitterModeSelection();
      render();
      toast((copieFinale ? "Copié (" : "Déplacé (") + nb + ").");
    }
    // NOTE seule, glissée à la souris (round du 03.09.2026, signalé par
    // Lionel : "les notes sont toujours pas extensible ni déplaçable en
    // demi journée") : variante de appliquerDelta ci-dessus qui pose EN
    // PLUS la demi-journée choisie par la position du relâchement (cf.
    // resoudreCibleGroupe), plutôt que de se contenter de la reconduire
    // telle quelle. Restreinte à un item unique (pas de sélection groupée) —
    // étendre ce choix de demi-journée à un glissement de plusieurs bulles
    // à la fois n'a pas été demandé et ouvrirait une ambiguïté (laquelle des
    // bulles sélectionnées la position du relâchement concerne-t-elle ?).
    function appliquerDeltaNote(delta, bordsCible, copieFinale) {
      var nTotal = nbJoursAffiches();
      nettoyerFantomes();
      sauvegarderUndo();
      var dom = document.querySelector('.bulle[data-id="' + idClic + '"]');
      var plage = dom && itemDepuisBulle(dom);
      if (!plage) { quitterModeSelection(); render(false); return; }
      var it = plage.item;
      var ni = Math.max(0, Math.min(nTotal - it.duree, it.giDebut + delta));
      if (copieFinale) plage.liste.push(itemPlage(it.type, it.texte, ni, it.duree, { important: it.important, demiDebut: bordsCible.demiDebut, demiFin: bordsCible.demiFin }));
      else { it.giDebut = ni; it.demiDebut = bordsCible.demiDebut; it.demiFin = bordsCible.demiFin; it.dateDebutIso = isoDeGi(it.giDebut); }
      quitterModeSelection();
      render();
      toast(copieFinale ? "Copié." : "Déplacé.");
    }
    // NOTE de PLUSIEURS jours (duree > 1), glissée à la souris en mode
    // compact (round du 07.09.2026, suite — Lionel : « je veux le déplacer
    // sur matin/après-midi » à propos d'une note "aprem jour1 + matin
    // jour2") : contrairement à appliquerDeltaNote ci-dessus (duree === 1,
    // ou reconduction de la forme telle quelle), ici `bords` peut changer
    // giDebut ET duree ET les 2 bords à la fois — cf.
    // bordsDeplacementNoteMultiJours (modèle demi-slot). Même restriction
    // qu'appliquerDeltaNote : un item seul, pas de sélection groupée.
    function appliquerDeltaNoteMultiJours(bords, copieFinale) {
      nettoyerFantomes();
      sauvegarderUndo();
      var dom = document.querySelector('.bulle[data-id="' + idClic + '"]');
      var plage = dom && itemDepuisBulle(dom);
      if (!plage) { quitterModeSelection(); render(false); return; }
      var it = plage.item;
      if (copieFinale) {
        plage.liste.push(itemPlage(it.type, it.texte, bords.giDebut, bords.duree, { important: it.important, demiDebut: bords.demiDebut, demiFin: bords.demiFin }));
      } else {
        it.giDebut = bords.giDebut; it.duree = bords.duree;
        it.demiDebut = bords.demiDebut; it.demiFin = bords.demiFin;
        // dateDebutIso (round du 07.09.2026, cf. appliquerDelta/appliquerDeltaNote
        // ci-dessus) : à rafraîchir à CHAQUE mutation de giDebut, sans quoi la
        // note "reviendrait" à sa position de départ après synchronisation.
        it.dateDebutIso = isoDeGi(it.giDebut);
      }
      quitterModeSelection();
      render();
      toast(copieFinale ? "Copié." : "Déplacé.");
    }
    function poserFantomesPourDelta(delta) {
      var nTotal = nbJoursAffiches();
      groupeIds.forEach(function (id) {
        var dom = document.querySelector('.bulle[data-id="' + id + '"]');
        var f = fantomes.filter(function (x) { return x.id === id; })[0];
        if (!dom || !f) return;
        var plage2 = itemDepuisBulle(dom);
        if (!plage2) return;
        var it2 = plage2.item;
        var ni2 = Math.max(0, Math.min(nTotal - it2.duree, it2.giDebut + delta));
        var kind2 = plage2.liste === TACHES ? "personne" : it2.type;
        // demi (round du 03.09.2026, repris ici au §49) : rectanglePlage
        // n'a besoin que d'UNE demi-journée de repère pour trouver sa
        // cellule de fond (celluleAPosition, indexée par data-demi) — le
        // 1er bord de l'item (demiDebut) fait toujours l'affaire, "matin"
        // en repli pour une plage en journée entière (demiDebut === null).
        var extra2 = plage2.liste === TACHES ? { personne: it2.personneId, demi: it2.demiDebut || "matin" } : null;
        poserSurCellule(f.clone, rectanglePlage(kind2, extra2, ni2, it2.duree));
      });
    }
    function estBulleUnitaireDeplacable() { return groupeIds.length === 1 && plageClic.liste === TACHES; }
    function celluleValidePourUnitaire(celluleCible) {
      if (!celluleCible || celluleCible.dataset.kind !== "personne") return false;
      return secteurPersonne(celluleCible.dataset.personne) === secteurPersonne(itemClic.personneId);
    }
    function appliquerCibleUnitaire(cible, copieFinale) {
      nettoyerFantomes();
      sauvegarderUndo();
      var dom = document.querySelector('.bulle[data-id="' + idClic + '"]');
      var plage = dom && itemDepuisBulle(dom);
      if (!plage) { quitterModeSelection(); render(false); return; }
      var it = plage.item;
      if (copieFinale) {
        plage.liste.push(itemPlageTache(it.type, it.texte, cible.personneId, cible.giDebut, cible.duree, { important: it.important, chantier: it.chantier, statut: it.statut, demiDebut: cible.demiDebut, demiFin: cible.demiFin, serieId: it.serieId }));
      } else {
        it.personneId = cible.personneId; it.giDebut = cible.giDebut; it.duree = cible.duree;
        it.demiDebut = cible.demiDebut; it.demiFin = cible.demiFin;
        it.dateDebutIso = isoDeGi(it.giDebut);
      }
      quitterModeSelection();
      render();
      toast(copieFinale ? "Copié." : "Déplacé.");
    }
    function poserFantomePourCible(cible) {
      var f = fantomes[0];
      if (!f) return;
      poserSurCellule(f.clone, rectanglePlage("personne", { personne: cible.personneId, demi: cible.demiDebut || "matin" }, cible.giDebut, cible.duree));
    }
    function posterMenuUnitairePourCible(cible) {
      if (badge) { badge.remove(); badge = null; }
      poserFantomePourCible(cible);
      afficherChoixDeplacerCopier(
        function () { quitterModeSelection(); nettoyerFantomes(); render(false); },
        function () { appliquerCibleUnitaire(cible, true); },
        function () { appliquerCibleUnitaire(cible, false); }
      );
      permettreRepriseGroupe(function () { posterMenuUnitairePourCible(cible); });
    }
    function resoudreCibleGroupe(celluleCible, clientXFinal) {
      if (!celluleCible) { nettoyerFantomes(); render(false); return; }
      var giCibleBrut = +celluleCible.dataset.jour;
      if (estBulleUnitaireDeplacable()) {
        if (!celluleValidePourUnitaire(celluleCible)) { nettoyerFantomes(); render(false); return; }
        var demiDebutActuelTache = itemClic.demiDebut || null, demiFinActuelTache = itemClic.demiFin || null;
        var estWEUnitaire = estGiWeekend(giCibleBrut);
        var cible;
        if (estWEUnitaire) {
          // Week-end (§2 du spec) : toujours 1 case, 1 seule demi-journée
          // interactive par personne — même convention forcée qu'à la
          // création (cf. itemPlageTache dans la boucle week-end de
          // construireVueDepuisCache).
          cible = { personneId: celluleCible.dataset.personne, giDebut: giCibleBrut, duree: 1, demiDebut: "matin", demiFin: "matin" };
        } else if (!tactile && clientXFinal != null) {
          // §49 (Lionel : "1 tâche ne peux pas etre mise sur 2 case, elle
          // s'étent de 1 jour (de 1 a 3 ,5 ou 7 case)") : une tâche/absence
          // porte désormais nativement demiDebut/demiFin comme une note ou
          // un jalon (cf. FRONTEND-CHANGELOG) — même modèle demi-slot
          // (bordsDeplacementNoteMultiJours) que cibleNotePreciseCompacte
          // utilise déjà pour la surbrillance de survol, pour que le dépôt
          // final corresponde exactement à ce qui a été prévisualisé.
          var demiSousPointeurTache = demiDepuisPointeur(celluleCible, clientXFinal);
          var bordsTache = bordsDeplacementNoteMultiJours(itemClic.giDebut, itemClic.duree, demiDebutActuelTache, demiFinActuelTache, offsetHalvesClic, giCibleBrut, demiSousPointeurTache, nbJoursAffiches());
          cible = { personneId: celluleCible.dataset.personne, giDebut: bordsTache.giDebut, duree: bordsTache.duree, demiDebut: bordsTache.demiDebut, demiFin: bordsTache.demiFin };
        } else {
          // Repli tactile (pas de position de relâchement pixel-précise
          // exploitable de la même façon qu'à la souris) : granularité jour
          // entier, forme reconduite telle quelle — comportement inchangé.
          var giCible = Math.max(0, Math.min(nbJoursAffiches() - itemClic.duree, giCibleBrut - offsetJoursClic));
          cible = { personneId: celluleCible.dataset.personne, giDebut: giCible, duree: itemClic.duree, demiDebut: demiDebutActuelTache, demiFin: demiFinActuelTache };
        }
        if (cible.personneId === itemClic.personneId && cible.giDebut === itemClic.giDebut && cible.duree === itemClic.duree && cible.demiDebut === demiDebutActuelTache && cible.demiFin === demiFinActuelTache) { nettoyerFantomes(); render(false); return; }
        if (tactile) posterMenuUnitairePourCible(cible); else appliquerCibleUnitaire(cible, copieActuelle);
        return;
      }
      if (estGiWeekend(giCibleBrut)) { nettoyerFantomes(); render(false); return; }
      var delta = giCibleBrut - offsetJoursClic - itemClic.giDebut;
      // NOTE ou JALON seul, glissé à la souris (round du 03.09.2026, signalé
      // par Lionel : "les notes sont toujours pas extensible ni déplaçable en
      // demi journée" ; étendu au jalon au round du 08.09.2026 suite, "je
      // veux que le jalon utilise aussi la demi journée, comme ça toutes les
      // bulles se comportent de la même manière", cf. §47 du
      // FRONTEND-CHANGELOG) : la demi-journée cible se choisit par la
      // position horizontale du relâchement dans la case visée.
      var kindGesteFinal = kindOrigineGeste();
      if (!tactile && groupeIds.length === 1 && (kindGesteFinal === "note" || kindGesteFinal === "jalon") && clientXFinal != null) {
        var demiDebutActuelNote = itemClic.demiDebut || null, demiFinActuelNote = itemClic.demiFin || null;
        // Modèle demi-slot (bordsDeplacementNoteMultiJours, §38) en mode
        // compact — pour TOUTE note, y compris duree === 1 (round du
        // 08.09.2026, suite — Lionel : « je n'arrive pas à placer ma note sur
        // lundi après-midi, elle se déplace de jour en jour et non de demi
        // jour en demi jour, ce phénomène ne se produit que quand la bulle
        // fait un jour complet »). Avant ce round, seules les notes
        // MULTI-JOURS (duree > 1) passaient par ce modèle ; une note d'1 SEUL
        // jour passait par demiCiblePourDeplacementNote ci-dessous, qui pour
        // une note en JOURNÉE ENTIÈRE (§42 : reconduit toujours sa forme
        // telle quelle) ne peut choisir qu'un jour ENTIER cible — impossible
        // d'atterrir à cheval sur 2 jours (ex. "lundi après-midi + mardi
        // matin"), alors qu'une note en journée entière occupe exactement 2
        // demi-slots ("2 cases" dans les mots de Lionel) au même titre qu'une
        // note "aprem jour1 + matin jour2". bordsDeplacementNoteMultiJours
        // traite les 2 cas identiquement (translation en demi-slots qui
        // préserve TOUJOURS le nombre total de demi-slots occupés, cf. son
        // en-tête) : une note d'1 jour plein posée pile sur une frontière de
        // jour retombe sur duree=1/demiDebut=null (toujours journée entière,
        // §42 préservé — cf. bornesDepuisDemiSlots) ; posée à cheval, elle
        // devient duree=2 avec un bord en demi-journée de chaque côté, sans
        // jamais rétrécir à une seule demi-journée ("garder sa grandeur",
        // dixit Lionel). Restreint au mode compact — cf. le commentaire de
        // colonneEtSpanDemi, la géométrie pixel-précise par demi-jour
        // n'existe qu'en compact ; le mode classique garde l'ancien
        // comportement par jour entier (demiCiblePourDeplacementNote
        // ci-dessous, inchangé pour ce mode).
        if (modeCompact) {
          var demiSousPointeurMulti = demiDepuisPointeur(celluleCible, clientXFinal);
          var bordsMulti = bordsDeplacementNoteMultiJours(itemClic.giDebut, itemClic.duree, demiDebutActuelNote, demiFinActuelNote, offsetHalvesClic, giCibleBrut, demiSousPointeurMulti, nbJoursAffiches());
          if (bordsMulti.giDebut === itemClic.giDebut && bordsMulti.duree === itemClic.duree && bordsMulti.demiDebut === demiDebutActuelNote && bordsMulti.demiFin === demiFinActuelNote) { nettoyerFantomes(); render(false); return; }
          appliquerDeltaNoteMultiJours(bordsMulti, copieActuelle);
          return;
        }
        // Mode CLASSIQUE (pas de géométrie demi-jour pixel-précise) : granularité
        // jour entier pour une note multi-jours (demiCiblePourDeplacementNote
        // reconduit sa forme telle quelle dès que duree > 1), et choix de la
        // demi-journée par la position du relâchement dans la case pour une
        // note d'1 seul jour — comportement du round du 03.09.2026, inchangé.
        var bordsCibleNote = demiCiblePourDeplacementNote(itemClic.duree, delta, demiDebutActuelNote, demiFinActuelNote, demiDepuisPointeur(celluleCible, clientXFinal));
        if (!delta && bordsCibleNote.demiDebut === demiDebutActuelNote && bordsCibleNote.demiFin === demiFinActuelNote) { nettoyerFantomes(); render(false); return; }
        appliquerDeltaNote(delta, bordsCibleNote, copieActuelle);
        return;
      }
      if (!delta) { nettoyerFantomes(); render(false); return; }
      if (tactile) posterMenuGroupePourDelta(delta); else appliquerDelta(delta, copieActuelle);
    }
    function posterMenuGroupePourDelta(delta) {
      if (badge) { badge.remove(); badge = null; }
      poserFantomesPourDelta(delta);
      afficherChoixDeplacerCopier(
        function () { quitterModeSelection(); nettoyerFantomes(); render(false); },
        function () { appliquerDelta(delta, true); },
        function () { appliquerDelta(delta, false); }
      );
      permettreRepriseGroupe(function () { posterMenuGroupePourDelta(delta); });
    }
    function permettreRepriseGroupe(reposer) {
      fantomes.forEach(function (f) {
        function reprendre(e3) {
          e3.preventDefault();
          fantomes.forEach(function (f2) { if (f2._reprendre) f2.clone.removeEventListener("pointerdown", f2._reprendre); });
          barreActionEl.hidden = true;
          suivreRedeplacementGroupe(e3, reposer);
        }
        f._reprendre = reprendre;
        f.clone.addEventListener("pointerdown", reprendre);
      });
    }
    function suivreRedeplacementGroupe(e0, reposer) {
      var pointerId2 = e0.pointerId;
      var sx2 = e0.clientX, sy2 = e0.clientY;
      fantomes.forEach(function (f) { f.left = parseFloat(f.clone.style.left) || 0; f.top = parseFloat(f.clone.style.top) || 0; f.clone.classList.remove("posee"); });
      document.body.classList.add("en-glissement");
      var autoDefil2 = creerAutoDefilement(scroller);
      var elementCapte = e0.currentTarget;
      var cibleActuelle2 = null, surBoutonSuppr2 = false;
      function onMove2(e2) {
        if (e2.pointerId !== pointerId2) return;
        var dx = e2.clientX - sx2, dy = e2.clientY - sy2;
        fantomes.forEach(function (f) { f.clone.style.left = (f.left + dx) + "px"; f.clone.style.top = (f.top + dy) + "px"; });
        autoDefil2.maj(e2.clientX);
        var sous = document.elementFromPoint(e2.clientX, e2.clientY);
        surBoutonSuppr2 = !!(sous && sous.closest("#baSupprimer"));
        if (baSupprimerEl) baSupprimerEl.classList.toggle("cible-suppr", surBoutonSuppr2);
        cibleActuelle2 = surBoutonSuppr2 ? null : (sous && sous.closest(".cell"));
        survolerCible(cibleActuelle2);
      }
      function detacher2() {
        document.body.classList.remove("en-glissement");
        autoDefil2.arreter();
        if (baSupprimerEl) baSupprimerEl.classList.remove("cible-suppr");
        nettoyerSurvol();
        document.removeEventListener("pointermove", onMove2);
        document.removeEventListener("pointerup", onUp2);
        document.removeEventListener("pointercancel", onCancel2);
        try { elementCapte.releasePointerCapture(pointerId2); } catch (ex) {}
      }
      function onUp2(e2) {
        if (e2.pointerId !== pointerId2) return;
        var celluleCible2 = cibleActuelle2, surSuppr2 = surBoutonSuppr2;
        detacher2();
        if (surSuppr2) { supprimerGroupeConfirme(); return; }
        if (!celluleCible2) { reposer(); return; }
        resoudreCibleGroupe(celluleCible2, e2.clientX);
      }
      function onCancel2(e2) { if (e2.pointerId !== pointerId2) return; detacher2(); reposer(); }
      try { elementCapte.setPointerCapture(pointerId2); } catch (ex) {}
      // document (pas elementCapte) — cf. §79.
      document.addEventListener("pointermove", onMove2);
      document.addEventListener("pointerup", onUp2);
      document.addEventListener("pointercancel", onCancel2);
    }
    function onUp(e2) {
      if (e2.pointerId !== pointerId) return;
      var celluleCible = cibleActuelle, surSuppr = surBoutonSuppr;
      detacher();
      if (enDefilement) { nettoyerFantomes(); return; }
      if (!arme || !bouge) { nettoyerFantomes(); resoudreClicBulle(idClic, itemClic, plageClic, e2.clientX, e2.clientY); return; }
      if (surSuppr) { supprimerGroupeConfirme(); return; }
      resoudreCibleGroupe(celluleCible, e2.clientX);
    }
    function onCancel(e2) { if (e2.pointerId !== pointerId) return; detacher(); nettoyerFantomes(); }

    var immediat = !tactile;
    var minuteur = immediat ? null : setTimeout(armer, DELAI_SELECTION);
    if (immediat) armer();
    try { bulleDom.setPointerCapture(pointerId); } catch (ex) {}
    // document (pas bulleDom) — cf. §79.
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
  }

  function onPointerDownBulle(e) {
    if (choixDeplacerCopierEnCours) { e.preventDefault(); e.stopPropagation(); return; }
    e.preventDefault(); e.stopPropagation();
    onPointerDownGroupeSelection(e);
  }

  var celluleSurlignees = [];
  function trouverCellules(kind, extra, giMin, giMax) {
    var sel = '.cell[data-kind="' + kind + '"]';
    if (kind === "personne") sel += '[data-personne="' + extra.personne + '"][data-demi="' + extra.demi + '"]';
    return Array.prototype.filter.call(document.querySelectorAll(sel), function (c) { var gi = +c.dataset.jour; return gi >= giMin && gi <= giMax; });
  }
  // #selection-overlay (round du 11.09.2026 — bug signalé par Lionel, vidéo
  // à l'appui : « la sélection verte lors du glisser se comporte
  // bizarrement ») : UN seul rectangle dessiné par-dessus TOUTES les cases
  // sélectionnées (englobant leurs getBoundingClientRect()), plutôt qu'un
  // anneau posé sur CHAQUE case individuellement (cf. règles .selection-add/
  // .selection-active ci-dessus, qui ne posent plus qu'un fond teinté) — un
  // rectangle continu plutôt qu'un quadrillage de cases séparées. position:
  // fixed + coordonnées viewport (getBoundingClientRect) : pas besoin de
  // connaître un ancêtre positionné ni le décalage de scroll du .scroller,
  // ça reste correct même si la grille défile pendant le glissé.
  var elSelectionOverlay = null;
  function selectionOverlay() {
    if (!elSelectionOverlay) {
      elSelectionOverlay = document.createElement("div");
      elSelectionOverlay.id = "selection-overlay";
      document.body.appendChild(elSelectionOverlay);
    }
    return elSelectionOverlay;
  }
  function masquerSelectionOverlay() { if (elSelectionOverlay) elSelectionOverlay.style.display = "none"; }
  function majSelectionOverlay(cellules, classe) {
    if (!cellules.length) { masquerSelectionOverlay(); return; }
    var minG = Infinity, minH = Infinity, maxD = -Infinity, maxB = -Infinity;
    cellules.forEach(function (c) {
      var r = c.getBoundingClientRect();
      if (r.left < minG) minG = r.left;
      if (r.top < minH) minH = r.top;
      if (r.right > maxD) maxD = r.right;
      if (r.bottom > maxB) maxB = r.bottom;
    });
    var overlay = selectionOverlay();
    overlay.className = classe === "selection-add" ? "actif-add" : "actif-defaut";
    overlay.style.left = minG + "px";
    overlay.style.top = minH + "px";
    overlay.style.width = (maxD - minG) + "px";
    overlay.style.height = (maxB - minH) + "px";
    overlay.style.display = "block";
  }
  var elSelectionPrecise = null;
  function effacerSurlignage() {
    celluleSurlignees.forEach(function (c) { c.classList.remove("selection-active", "selection-add"); });
    celluleSurlignees = [];
    masquerSelectionOverlay();
    if (elSelectionPrecise && elSelectionPrecise.parentElement) elSelectionPrecise.remove();
  }
  function surlignerRectangle(kind, lignes, iMin, iMax, giMin, giMax, classe) {
    effacerSurlignage();
    lignes.slice(iMin, iMax + 1).forEach(function (extra) { celluleSurlignees = celluleSurlignees.concat(trouverCellules(kind, extra, giMin, giMax)); });
    celluleSurlignees.forEach(function (c) { c.classList.add(classe || "selection-active"); });
    majSelectionOverlay(celluleSurlignees, classe);
  }
  function trouverIndexLigne(lignes, extra) {
    for (var i = 0; i < lignes.length; i++) if (lignes[i].personne === extra.personne && lignes[i].demi === extra.demi) return i;
    return -1;
  }
  // ---- Sélection "case par case" (round du 12.09.2026 — refonte demandée
  // par Lionel, vidéo à l'appui : « Ce n'est pas le comportement attendu. la
  // sélection doit se faire case par case, on ne parle plus de demi
  // journée [...] Ce comportement doit être pareil pour tout type des
  // bulles [...] si j'avais une 2ème [...] personne plus bas, il faudrait
  // faire une bulle par ligne »). Remplace le modèle "ligne figée sur la
  // demi de départ" du round du 11.09.2026 (lignesSecteur/trouverIndexLigne
  // ci-dessus, désormais réservés à l'ancien surlignerRectangle — laissé en
  // place mais plus appelé par le glissé — cf. cablerAjoutCellule/
  // demarrerSelectionRapide plus bas) par un modèle "tableur" : la
  // dimension horizontale est un numéro de DEMI-SLOT continu (jour*2 +
  // 0/1, cf. demiSlotsDepuisBornes) suivi au pixel/à la case près à chaque
  // pointermove ; la dimension verticale, pour "personne", est désormais la
  // PERSONNE SEULE (plus "2 lignes par personne") — une bulle est créée par
  // personne touchée, jamais par demi-ligne.
  function personnesSecteurListe(secteur) {
    return PERSONNES.filter(function (p) { return (p.sousTraitant ? "sous-traitant" : "personnel") === secteur; }).map(function (p) { return p.id; });
  }
  // Numéro de demi-slot (jour*2 + 0/1) sous une cellule DOM donnée. En mode
  // "personne" chaque cellule EST déjà une demi-journée précise (cf.
  // creerCell, colonneDemi) : son propre data-demi suffit, pas besoin de la
  // position du pointeur. Jalon/note n'ont qu'UNE cellule pleine largeur par
  // jour (creerCelluleFond) : seule la position du pointeur dans cette
  // cellule (demiDepuisPointeur, déjà utilisée pour le glissement d'une note
  // existante) dit quelle moitié est visée.
  function demiSlotCellule(kind, cell, clientX) {
    var gi = +cell.dataset.jour;
    var demi = kind === "personne" ? cell.dataset.demi : demiDepuisPointeur(cell, clientX);
    return gi * 2 + (demi === "aprem" ? 1 : 0);
  }
  function cellulesPersonnePourDemis(personneId, halfMin, halfMax) {
    var out = [];
    for (var h = halfMin; h <= halfMax; h++) {
      var gi = Math.floor(h / 2), demi = (h % 2 === 0) ? "matin" : "aprem";
      var c = celluleAPosition("personne", { personne: personneId, demi: demi }, gi);
      if (c) out.push(c);
    }
    return out;
  }
  // Surbrillance "personne" : union EXACTE des cases (personne × demi-slot)
  // du rectangle [pMin..pMax] × [halfMin..halfMax] — chaque case existante
  // (le week-end n'a qu'un seul demi-slot, cf. celluleAPosition) reçoit le
  // même fond teinté qu'avant (.selection-active/.selection-add), le
  // contour continu restant posé par #selection-overlay (majSelectionOverlay,
  // inchangé).
  function surlignerPlagePersonnes(personnesListe, pA, pB, halfA, halfB, classe) {
    effacerSurlignage();
    var pMin = Math.min(pA, pB), pMax = Math.max(pA, pB);
    var halfMin = Math.min(halfA, halfB), halfMax = Math.max(halfA, halfB);
    for (var pi = pMin; pi <= pMax; pi++) {
      celluleSurlignees = celluleSurlignees.concat(cellulesPersonnePourDemis(personnesListe[pi], halfMin, halfMax));
    }
    celluleSurlignees.forEach(function (c) { c.classList.add(classe || "selection-active"); });
    majSelectionOverlay(celluleSurlignees, classe);
  }
  // Surbrillance jalon/note : pas de sous-cellule DOM par demi (une seule
  // .cell pleine largeur par jour) — élément dédié positionné en
  // grid-column/grid-row par colonneEtSpanDemi(), MÊME fonction pure que le
  // rendu statique des bulles et que le survol de dépôt précis
  // (cibleNotePreciseCompacte) : garantit que ce qui est surligné ici est
  // EXACTEMENT ce que produira ouvrirEditionPlage à la même plage.
  function surlignerPlageJalonNote(kind, halfA, halfB, classe) {
    effacerSurlignage();
    var halfMin = Math.min(halfA, halfB), halfMax = Math.max(halfA, halfB);
    var bornes = bornesDepuisDemiSlots(halfMin, halfMax);
    var refCell = celluleAPosition(kind, null, bornes.giDebut);
    if (!refCell) return;
    if (!elSelectionPrecise) elSelectionPrecise = document.createElement("div");
    elSelectionPrecise.className = "selection-precis" + (classe === "selection-add" ? " precis-add" : "");
    var cs = colonneEtSpanDemi(bornes.giDebut, bornes.duree, bornes.demiDebut, bornes.demiFin);
    elSelectionPrecise.style.gridColumn = cs[0] + " / span " + cs[1];
    elSelectionPrecise.style.gridRow = refCell.style.gridRow;
    refCell.parentElement.appendChild(elSelectionPrecise);
  }

  // Round D (11.09.2026) — Lionel signale 2 bugs issus du round "case par
  // case" ci-dessus : (#1) « l'ajout simple sélectionne 2 case dans note et
  // jalon » — ouvrirEditionPlage teignait la case DOM entière (jalon/note
  // n'a qu'UNE case pleine largeur par jour, jamais scindée matin/aprem,
  // contrairement à "personne") même quand seule une demi-journée est
  // réellement visée ; (#2) « ajout multiple laisse une bordure verte sur la
  // case de départ » — ouvrirEdition/ouvrirEditionPlage ne teignaient qu'UNE
  // SEULE case DOM réelle (la case de départ du glissé) pendant que le
  // formulaire est ouvert, même quand la plage réelle couvre plusieurs
  // jours/personnes : le reste de la plage n'était plus surligné (nettoyé
  // par effacerSurlignage() à la fin du glissé), mais cette case unique
  // restait teintée, seule — lue à tort comme un résidu de surbrillance.
  // Fix commun aux 2 : au lieu de teindre une case DOM précise passée par
  // l'appelant, on reconstruit la surbrillance EXACTE de la plage en cours
  // d'édition (mêmes fonctions que pendant le glissé : surlignerPlagePersonnes/
  // surlignerPlageJalonNote) via un objet "duck-typé" qui expose la même
  // interface `classList.add/remove` que fermerAuClicExterieur() attend d'une
  // vraie case DOM — add() peint la plage complète, remove() appelle
  // effacerSurlignage() pour tout nettoyer d'un coup (que ce soit une case
  // .selection-add ou l'overlay .selection-precis).
  function surbrillancePrecisePersonnes(cibles, giDebut, duree, demiDebut, demiFin) {
    var personnes = [];
    (cibles || []).forEach(function (c) { if (personnes.indexOf(c.personne) === -1) personnes.push(c.personne); });
    var demiRepli = demiDebut || demiFin || "matin";
    var halves = demiSlotsDepuisBornes(giDebut, duree, demiDebut || demiRepli, demiFin || demiRepli);
    return {
      classList: {
        add: function (classe) { if (personnes.length) surlignerPlagePersonnes(personnes, 0, personnes.length - 1, halves.halfStart, halves.halfFinIncl, classe); },
        remove: function () { effacerSurlignage(); }
      }
    };
  }
  function surbrillancePreciseJalonNote(kind, giDebut, duree, demiDebut, demiFin) {
    var demiRepli = demiDebut || demiFin || "matin";
    var halves = demiSlotsDepuisBornes(giDebut, duree, demiDebut || demiRepli, demiFin || demiRepli);
    return {
      classList: {
        add: function (classe) { surlignerPlageJalonNote(kind, halves.halfStart, halves.halfFinIncl, classe); },
        remove: function () { effacerSurlignage(); }
      }
    };
  }

  var dernierTapCellule = null, dernierTapTemps = 0;
  function cablerAjoutCellule(cell) {
    cell.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    cell.addEventListener("pointerdown", function (e) {
      if (e.target !== cell) return;
      if (e.pointerType !== "touch" && e.button === 2) { e.preventDefault(); demarrerSelectionRapide(e, cell); return; }
      if (e.pointerType === "touch") {
        var maintenant = Date.now();
        var estDoubleTap = dernierTapCellule === cell && (maintenant - dernierTapTemps) < 400;
        dernierTapCellule = cell; dernierTapTemps = maintenant;
        if (estDoubleTap) { dernierTapCellule = null; e.preventDefault(); demarrerSelectionRapide(e, cell); return; }
      } else if (e.button !== 0) return;
      if (Object.keys(bullesSelectionnees).length > 0) { e.preventDefault(); demarrerDefilementOuSortieSelection(e, cell); return; }
      e.preventDefault();
      var sx = e.clientX, sy = e.clientY, dernierX = e.clientX, dernierY = e.clientY;
      var kind = cell.dataset.kind;
      // Modèle "case par case" (round du 12.09.2026, cf. surlignerPlagePersonnes/
      // surlignerPlageJalonNote plus haut) : la case de départ fixe un
      // demi-slot (halfDebut) et, pour "personne", une PERSONNE de départ —
      // plus de "ligne" (personne+demi) figée pour tout le geste.
      var halfDebut = demiSlotCellule(kind, cell, e.clientX);
      var halfCourant = halfDebut;
      var personnesListe = kind === "personne" ? personnesSecteurListe(secteurPersonne(cell.dataset.personne)) : null;
      var pIndexDebut = kind === "personne" ? personnesListe.indexOf(cell.dataset.personne) : 0;
      var pIndexCourant = pIndexDebut;
      var etendu = false, arme = false, enDefilement = false;
      var pointerId = e.pointerId;
      var scroller = trouverScroller(cell);

      function armerSelection() { arme = true; cell.classList.add("armement-selection"); document.body.classList.add("en-glissement"); }
      function detacher() {
        clearTimeout(minuteur);
        cell.classList.remove("armement-selection");
        document.body.classList.remove("en-glissement");
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onCancel);
        try { cell.releasePointerCapture(pointerId); } catch (ex) {}
      }
      // pointerId!==... (round du 16.09.2026, cf. FRONTEND-CHANGELOG §79) :
      // onMove/onUp/onCancel sont désormais posés sur document (voir plus
      // bas) plutôt que sur `cell` elle-même, donc ce garde-fou est
      // nécessaire pour ignorer le pointer d'un AUTRE doigt.
      function onMove(e2) {
        if (e2.pointerId !== pointerId) return;
        if (!arme) {
          var dist = Math.abs(e2.clientX - sx) + Math.abs(e2.clientY - sy);
          if (!enDefilement && dist > SEUIL_DEFILEMENT) { enDefilement = true; clearTimeout(minuteur); }
          if (enDefilement) { if (scroller) scroller.scrollLeft -= (e2.clientX - dernierX); window.scrollBy(0, -(e2.clientY - dernierY)); }
          dernierX = e2.clientX; dernierY = e2.clientY;
          return;
        }
        var d2 = Math.abs(e2.clientX - sx) + Math.abs(e2.clientY - sy);
        if (d2 > 4) etendu = true;
        if (!etendu) return;
        var sous = document.elementFromPoint(e2.clientX, e2.clientY);
        var c2 = sous && sous.closest(".cell");
        if (c2 && c2.dataset.kind === kind) {
          var giCandidat = +c2.dataset.jour;
          if (estGiWeekend(giCandidat)) return;
          var halfCandidat = demiSlotCellule(kind, c2, e2.clientX);
          if (kind === "personne") {
            var pIdxCandidat = personnesListe.indexOf(c2.dataset.personne);
            if (pIdxCandidat === -1) return;
            pIndexCourant = pIdxCandidat; halfCourant = halfCandidat;
            surlignerPlagePersonnes(personnesListe, pIndexDebut, pIndexCourant, halfDebut, halfCourant, "selection-add");
          } else {
            halfCourant = halfCandidat;
            surlignerPlageJalonNote(kind, halfDebut, halfCourant, "selection-add");
          }
        }
      }
      function onUp(e2) {
        if (e2.pointerId !== pointerId) return;
        detacher();
        effacerSurlignage();
        if (enDefilement) return;
        if (arme && etendu) {
          var bornes = bornesDepuisDemiSlots(Math.min(halfDebut, halfCourant), Math.max(halfDebut, halfCourant));
          if (kind === "personne") {
            var pMin = Math.min(pIndexDebut, pIndexCourant), pMax = Math.max(pIndexDebut, pIndexCourant);
            if (pMin === pMax && halfDebut === halfCourant) { ouvrirAjout(cell, e2.clientX, e2.clientY); return; }
            var repDemi = bornes.demiDebut || bornes.demiFin || "matin";
            var cibles = [];
            for (var pi = pMin; pi <= pMax; pi++) cibles.push({ personne: personnesListe[pi], demi: repDemi });
            ouvrirAjoutPlage(kind, cibles, bornes.giDebut, bornes.duree, bornes.demiDebut, bornes.demiFin);
          } else {
            if (halfDebut === halfCourant) { ouvrirAjout(cell, e2.clientX, e2.clientY); return; }
            ouvrirEditionPlage(kind, null, bornes.giDebut, bornes.duree, e2.clientX, e2.clientY, cell, bornes.demiDebut, bornes.demiFin);
          }
          return;
        }
        if (e.pointerType === "touch" && !arme) return;
        ouvrirAjout(cell, e2.clientX, e2.clientY);
      }
      function onCancel(e2) { if (e2.pointerId !== pointerId) return; detacher(); effacerSurlignage(); }

      var immediat = e.pointerType !== "touch";
      var minuteur = immediat ? null : setTimeout(armerSelection, DELAI_SELECTION);
      if (immediat) armerSelection();
      try { cell.setPointerCapture(pointerId); } catch (ex) {}
      // document.addEventListener (pas cell.addEventListener) — round du
      // 16.09.2026, cf. FRONTEND-CHANGELOG §79 : Lionel a signalé que le
      // glisser tactile ne fonctionnait TOUJOURS que sur la colonne des
      // noms (seule zone sans touch-action:none, donc seule à profiter du
      // scroll natif du navigateur) après le correctif précédent (§78).
      // Cause réelle : cablerAjoutCellule posait pointermove/pointerup sur
      // `cell` elle-même — cela ne fonctionne QUE si setPointerCapture()
      // réussit vraiment (elle redirige alors tous les événements suivants
      // vers `cell`, où qu'aille le doigt). Si elle échoue silencieusement
      // (try/catch du §78 empêchait juste le plantage, pas ce problème),
      // le pointermove suivant se déclenche sur la VRAIE cellule survolée
      // (une cellule voisine, .cell étant une grille de cases côte à côte) —
      // jamais sur `cell`, qui n'est plus un ancêtre de cet événement. Le
      // panoramique s'arrêtait donc dès que le doigt quittait la case de
      // départ, ce qui, sur des cases aussi étroites qu'un jour, arrive
      // en un instant. En posant les écouteurs sur `document` (qui reste
      // un ancêtre de PARTOUT), le geste continue d'être suivi quel que
      // soit l'endroit où le doigt se trouve physiquement, avec ou sans
      // capture — d'où le garde-fou pointerId ci-dessus, pour ignorer un
      // second doigt éventuel.
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onCancel);
    });
  }

  function demarrerSelectionRapide(e, celluleDebut) {
    var pointerId = e.pointerId;
    var scroller = trouverScroller(celluleDebut);
    var autoDefil = creerAutoDefilement(scroller);
    var kind = celluleDebut.dataset.kind;
    // Même modèle "case par case" que cablerAjoutCellule (round du
    // 12.09.2026) : demi-slot de départ + personne de départ (au lieu d'une
    // "ligne" personne+demi figée).
    var halfDebut = demiSlotCellule(kind, celluleDebut, e.clientX);
    var halfCourant = halfDebut;
    var personnesListe = kind === "personne" ? personnesSecteurListe(secteurPersonne(celluleDebut.dataset.personne)) : null;
    var pIndexDebut = kind === "personne" ? personnesListe.indexOf(celluleDebut.dataset.personne) : 0;
    var pIndexCourant = pIndexDebut;
    document.body.classList.add("en-glissement");
    if (kind === "personne") surlignerPlagePersonnes(personnesListe, pIndexDebut, pIndexDebut, halfDebut, halfDebut);
    else surlignerPlageJalonNote(kind, halfDebut, halfDebut);
    function onMove(e2) {
      if (e2.pointerId !== pointerId) return;
      var sous = document.elementFromPoint(e2.clientX, e2.clientY);
      var c2 = sous && sous.closest(".cell");
      if (c2 && c2.dataset.kind === kind) {
        var giCandidat = +c2.dataset.jour;
        if (!estGiWeekend(giCandidat)) {
          var halfCandidat = demiSlotCellule(kind, c2, e2.clientX);
          if (kind === "personne") {
            var pIdxCandidat = personnesListe.indexOf(c2.dataset.personne);
            if (pIdxCandidat !== -1) {
              pIndexCourant = pIdxCandidat; halfCourant = halfCandidat;
              surlignerPlagePersonnes(personnesListe, pIndexDebut, pIndexCourant, halfDebut, halfCourant);
            }
          } else {
            halfCourant = halfCandidat;
            surlignerPlageJalonNote(kind, halfDebut, halfCourant);
          }
        }
      }
      autoDefil.maj(e2.clientX);
    }
    function detacher() {
      document.body.classList.remove("en-glissement");
      autoDefil.arreter();
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      try { celluleDebut.releasePointerCapture(pointerId); } catch (ex) {}
    }
    function onUp(e2) {
      if (e2.pointerId !== pointerId) return;
      var bornes = bornesDepuisDemiSlots(Math.min(halfDebut, halfCourant), Math.max(halfDebut, halfCourant));
      detacher(); effacerSurlignage();
      var cells = [];
      if (kind === "personne") {
        var pMin = Math.min(pIndexDebut, pIndexCourant), pMax = Math.max(pIndexDebut, pIndexCourant);
        for (var pi = pMin; pi <= pMax; pi++) cells = cells.concat(cellulesPersonnePourDemis(personnesListe[pi], Math.min(halfDebut, halfCourant), Math.max(halfDebut, halfCourant)));
      } else {
        // Jalon/note : la sélection d'un item EXISTANT reste par JOUR (cf.
        // selectionnerDepuisCellules/ramasser, qui ne distingue pas de demi
        // pour ces 2 types) — seule la surbrillance pendant le geste est
        // désormais demi-précise (surlignerPlageJalonNote ci-dessus).
        cells = trouverCellules(kind, {}, bornes.giDebut, bornes.giDebut + bornes.duree - 1);
      }
      selectionnerDepuisCellules(cells);
    }
    function onCancel(e2) { if (e2.pointerId !== pointerId) return; detacher(); effacerSurlignage(); }
    try { celluleDebut.setPointerCapture(pointerId); } catch (ex) {}
    // document (pas celluleDebut) — même correctif qu'au-dessus, cf. §79.
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
  }

  function selectionnerDepuisCellules(cells) {
    if (!cells.length) return;
    var gisParCle = {};
    cells.forEach(function (c) {
      var cle = c.dataset.kind === "personne" ? ("personne|" + c.dataset.personne + "|" + c.dataset.demi) : c.dataset.kind;
      if (!gisParCle[cle]) gisParCle[cle] = {};
      gisParCle[cle][c.dataset.jour] = true;
    });
    function ramasser(liste) {
      liste.forEach(function (it) {
        if (it.personneId === undefined) {
          var gis = gisParCle[it.type];
          if (!gis) return;
          for (var g in gis) { var gi = +g; if (gi >= it.giDebut && gi < it.giDebut + it.duree) { bullesSelectionnees[it.id] = true; break; } }
          return;
        }
        // Tâche/absence (§49) : le(s) demi(s) occupé(s) peu(ven)t varier
        // selon le jour (demiDebut sur le 1er jour, demiFin sur le
        // dernier, journée entière au milieu — cf. demisOccupeesTache) ;
        // plus une seule clé "personne|id|demi" valable pour tout l'item.
        for (var gT = it.giDebut; gT < it.giDebut + it.duree; gT++) {
          var demisT = demisOccupeesTache(it, gT);
          if (!demisT) continue;
          var trouveT = demisT.some(function (d) {
            var gisT = gisParCle["personne|" + it.personneId + "|" + d];
            return gisT && gisT[gT];
          });
          if (trouveT) { bullesSelectionnees[it.id] = true; break; }
        }
      });
    }
    ramasser(TACHES); ramasser(JALONS); ramasser(NOTES);
    render(false);
    majBarreSelection();
    var n = Object.keys(bullesSelectionnees).length;
    toast(n ? ("Sélectionné (" + n + ").") : "Rien à sélectionner dans cette zone.");
  }

  // Round du 12.09.2026 — Lionel : « En mode sélection, sortir du mode
  // sélection si on clique à côté d'une bulle. » Un pointerdown sur une CASE
  // (jamais sur une .bulle, cf. onPointerDownBulle qui intercepte celles-ci
  // séparément) alors que des bulles sont sélectionnées ne servait jusqu'ici
  // qu'à armer un panoramique tactile (demarrerDefilementSimple) — un simple
  // clic/tap SANS glissé n'y déclenchait donc rigoureusement rien. Il quitte
  // désormais le mode sélection ; un vrai glissé (panoramique) reste inchangé.
  function demarrerDefilementOuSortieSelection(e, cell) {
    var pointerId = e.pointerId;
    var sx = e.clientX, sy = e.clientY, dernierX = sx, dernierY = sy;
    var scroller = trouverScroller(cell);
    var bouge = false;
    function onMove(e2) {
      if (e2.pointerId !== pointerId) return;
      if (Math.abs(e2.clientX - sx) + Math.abs(e2.clientY - sy) > 4) bouge = true;
      if (scroller) scroller.scrollLeft -= (e2.clientX - dernierX); window.scrollBy(0, -(e2.clientY - dernierY));
      dernierX = e2.clientX; dernierY = e2.clientY;
    }
    function onUp(e2) { if (e2.pointerId !== pointerId) return; detacher(); if (!bouge) { quitterModeSelection(); render(false); } }
    function onCancel(e2) { if (e2.pointerId !== pointerId) return; detacher(); }
    function detacher() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      try { cell.releasePointerCapture(pointerId); } catch (ex) {}
    }
    try { cell.setPointerCapture(pointerId); } catch (ex) {}
    // document (pas cell) — cf. §79.
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
  }
  function demarrerDefilementSimple(e, cell) {
    var pointerId = e.pointerId;
    var dernierX = e.clientX, dernierY = e.clientY;
    var scroller = trouverScroller(cell);
    function onMove(e2) { if (e2.pointerId !== pointerId) return; if (scroller) scroller.scrollLeft -= (e2.clientX - dernierX); window.scrollBy(0, -(e2.clientY - dernierY)); dernierX = e2.clientX; dernierY = e2.clientY; }
    function onEnd(e2) { if (e2.pointerId !== pointerId) return; detacher(); }
    function detacher() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
      try { cell.releasePointerCapture(pointerId); } catch (ex) {}
    }
    try { cell.setPointerCapture(pointerId); } catch (ex) {}
    // document (pas cell) — cf. §79.
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onEnd);
    document.addEventListener("pointercancel", onEnd);
  }

  /* ============ UNDO/REDO — session courante uniquement (cf. §8 du spec) ============
     Repris du prototype : sauvegarderUndo() est appelée en tout premier dans
     chaque fonction de mutation locale. render(), appelé ensuite, synchronise
     automatiquement l'état (annulé ou rétabli) vers le serveur — annuler
     revient donc à réécrire l'état précédent, pas à un simple undo visuel. */
  function clonerListe(liste) { return liste.map(function (x) { return Object.assign({}, x); }); }
  function snapshotEtat() { return { TACHES: clonerListe(TACHES), JALONS: clonerListe(JALONS), NOTES: clonerListe(NOTES) }; }
  function restaurerEtat(snap) { TACHES = snap.TACHES; JALONS = snap.JALONS; NOTES = snap.NOTES; }
  function sauvegarderUndo() {
    pileUndo.push(snapshotEtat());
    if (pileUndo.length > LIMITE_UNDO) pileUndo.shift();
    pileRedo = [];
  }
  function defaire() {
    if (!pileUndo.length) { toast("Rien à annuler (cette session seulement)."); return; }
    pileRedo.push(snapshotEtat());
    restaurerEtat(pileUndo.pop());
    bullesSelectionnees = {};
    render(); majBarreSelection();
    toast("Annulé.");
  }
  function refaire() {
    if (!pileRedo.length) { toast("Rien à refaire."); return; }
    pileUndo.push(snapshotEtat());
    restaurerEtat(pileRedo.pop());
    bullesSelectionnees = {};
    render(); majBarreSelection();
    toast("Rétabli.");
  }
  function majBoutonsUndo() {
    var d = document.getElementById("btnDefaire"), r = document.getElementById("btnRefaire");
    if (!d) return;
    d.disabled = !pileUndo.length;
    r.disabled = !pileRedo.length;
  }

  // §82, icônes au §83 (round du 16.09.2026, encore un autre, suite×7) —
  // synchronise l'apparence (teintée/active ou atténuée/désactivée) des 4
  // icônes .toolbar-toggle (cf. htmlPagePlanning) sur les 4 variables de
  // repli, à chaque rendu — même idée que majBoutonsUndo() ci-dessus. Ces
  // boutons sont câblés une seule fois (cablerPagePlanning, le conteneur
  // est statique), donc rien ici ne recrée ou ne recâble quoi que ce soit,
  // juste des classes posées/retirées.
  function majControlesAffichage() {
    var cont = document.getElementById("controlesAffichage");
    if (!cont) return;
    var etats = {
      jalon: replierJalons, note: replierNotes,
      personnel: replierSectionPersonnel, intervenants: replierSectionIntervenants
    };
    Object.keys(etats).forEach(function (cle) {
      var btn = cont.querySelector('[data-affichage-cible="' + cle + '"]');
      if (btn) {
        btn.classList.toggle("actif", !etats[cle]);
        btn.classList.toggle("desactive", etats[cle]);
      }
    });
  }

  // §85 (round du 17.09.2026) — synchronise le texte de la case de zoom
  // ("100% ▾") sur niveauZoomPlanning, à chaque rendu — même idée que
  // majControlesAffichage() juste au-dessus (bouton statique, câblé une
  // seule fois dans cablerPagePlanning ; le niveau réel est déjà appliqué
  // par construireGrille sur grilleEntete/grilleCorps, ceci ne touche que
  // l'étiquette affichée).
  function majZoomAffichage() {
    var btn = document.getElementById("btnZoom");
    if (btn) btn.textContent = niveauZoomPlanning + "% ▾";
  }

  // §87 (round du 17.09.2026, suite×2) — synchronise la case "Sem. N" et
  // l'icône "2 semaines" de la barre sur etat.indexSemaine/deuxSemaines, à
  // chaque rendu — même idée que majZoomAffichage() juste au-dessus (boutons
  // statiques, câblés une seule fois dans cablerPagePlanning). Remplace
  // l'ancien affichage "Semaine N" de coinNav/navSemaine, reconstruit à
  // chaque rendu DANS construireGrille (retiré ce round) ; la case étant
  // désormais hors de la grille, un aller-retour séparé est nécessaire.
  function majSemaineAffichage() {
    var pill = document.getElementById("btnSemainePill");
    if (pill && etat.semaines[etat.indexSemaine]) pill.textContent = "Sem. " + etat.semaines[etat.indexSemaine].num + " ▾";
    var btn2s = document.getElementById("btnDeuxSemaines");
    if (btn2s) btn2s.classList.toggle("actif", deuxSemaines);
  }

