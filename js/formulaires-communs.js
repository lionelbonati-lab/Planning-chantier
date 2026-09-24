"use strict";
  /* ============================================================
     SÉLECTION MULTIPLE / BARRE D'ACTION — repris du prototype (§3.3 de
     v3-inventory.md) : ces fonctions étaient déjà APPELÉES un peu partout
     dans le fichier (resoudreClicBulle, drag Déplacer/Copier tactile,
     construireGrille…) mais jamais définies — trou laissé par
     l'interruption précédente, cf. FRONTEND-CHANGELOG.md. (La barre du bas
     #barreAction, câblée ici par cablerBarreAction(), a disparu au round du
     24.09.2026 suite 8 — cf. le commentaire juste en dessous.) Adaptation serveur : supprimer une bulle qui porte un
     serieId demande la portée (cet événement / les suivants / tous — cf.
     supprimerSelection et series.js, round du 24.09.2026, suite 20) ; les
     autres bulles sont retirées localement et laissées au moteur de diff
     générique (render() -> synchroniser()), comme le reste du fichier. ============ */
  // Round du 24.09.2026 (suite 8) — la barre du bas (#barreAction :
  // Annuler / Supprimer, et Copier / Déplacer après un glisser tactile) a
  // disparu. Lionel : « retravailler au passage les deux boutons annuler et
  // supprimer qui s'ouvrent quand une bulle est sélectionnée. Peut-être les
  // réduire à de simples icônes […] On y ajouterait une petite icône pour
  // modifier la tâche à la place du double-clic », puis, pour la place :
  // « Dans la barre avec les flèches. Sur desktop et tablette. Sur mobile
  // une pilule vient remplacer la barre d'onglet en bas. » Tout vit donc
  // dans #panneauSelection (cf. htmlPagePlanning, js/coquille.js), tenu à
  // jour par majBarreSelection ci-dessous. cablerBarreAction/
  // afficherChoixDeplacerCopier n'existent plus.
  // Round du 24.09.2026 (suite 7) — Lionel : « quand je clique une bulle,
  // elle soit sélectionnée. Mais si j'en clique une autre, la bulle que
  // j'avais cliquée est désélectionnée et la nouvelle est sélectionnée. »
  // Sélection SIMPLE par défaut : un clic remplace la sélection (recliquer
  // la seule bulle sélectionnée la désélectionne). L'ancien comportement
  // (chaque clic ajoute/retire) ne vaut plus qu'en mode multiple
  // (modeSelectionMultiple) ou quand `cumuler` est vrai — appui LONG sur la
  // bulle (suite 9, Lionel : « appui long = sélection multiple »), ou Ctrl/
  // Cmd+clic sur ordinateur — ce qui allume aussi le mode, pour que les
  // flèches « ‹ › » apparaissent dans la pilule.
  function basculerSelection(id, cumuler) {
    var deja = !!bullesSelectionnees[id];
    var activer;
    if (modeSelectionMultiple || cumuler) {
      activer = !deja;
      if (cumuler && !modeSelectionMultiple) { modeSelectionMultiple = true; }
    } else {
      var autres = Object.keys(bullesSelectionnees).filter(function (k) { return k !== id; });
      autres.forEach(function (k) {
        delete bullesSelectionnees[k];
        var d = document.querySelector('.bulle[data-id="' + k + '"]');
        if (d) d.classList.remove("selectionnee");
      });
      activer = !(deja && !autres.length);
    }
    if (activer) bullesSelectionnees[id] = true; else delete bullesSelectionnees[id];
    var dom = document.querySelector('.bulle[data-id="' + id + '"]');
    if (dom) dom.classList.toggle("selectionnee", activer);
    majBarreSelection();
  }
  // Bouton ⧉ de la pilule (suite 9) : bascule "copier au prochain
  // déplacement" — cf. copieSelectionActive (core.js). Remplace le
  // "Copier" qui posait une copie sur place (suite 8).
  function basculerCopieSelection() {
    if (!Object.keys(bullesSelectionnees).length) return;
    copieSelectionActive = !copieSelectionActive;
    majBarreSelection();
    toast(copieSelectionActive ? "Le prochain déplacement (flèches ou glisser) posera une copie." : "Le prochain déplacement déplacera.");
  }
  // Décale toute la sélection de `deltaHalf` demi-journées (±1) ou jours
  // (±2), en gardant la forme de chaque bulle (modèle demi-slot de
  // demiSlotsDepuisBornes/bornesDepuisDemiSlots, le même que le glisser à la
  // souris) : une journée entière décalée d'une demi-journée devient
  // "aprem + matin du lendemain", comme au glisser. Tout ou rien : si UNE
  // bulle butait sur le bord de la fenêtre affichée, rien ne bouge (sinon
  // les bulles perdraient leurs positions relatives). Les cases de week-end
  // (isolées, jamais déplaçables) restent en place. La sélection est
  // conservée après le décalage — pour pouvoir appuyer plusieurs fois.
  // copieSelectionActive (suite 9) : des COPIES sont posées à la nouvelle
  // position, les originaux restent, et ce sont les copies qui ressortent
  // sélectionnées (pour continuer à les décaler) ; la bascule se remet à
  // zéro.
  function decalerSelection(deltaHalf) {
    var ids = Object.keys(bullesSelectionnees);
    if (!ids.length) { toast("Aucune bulle sélectionnée."); return; }
    var maxHalf = nbJoursAffiches() * 2 - 1, plages = [], weekend = 0;
    ids.forEach(function (id) {
      var p = itemParId(id);
      if (!p) return;
      if (estGiWeekend(p.item.giDebut)) { weekend++; return; }
      plages.push(p);
    });
    if (!plages.length) { toast(weekend ? "Une case de week-end ne se décale pas." : "Aucune bulle sélectionnée."); return; }
    var bloque = plages.some(function (p) {
      var b = demiSlotsDepuisBornes(p.item.giDebut, p.item.duree, p.item.demiDebut || null, p.item.demiFin || null);
      return b.halfStart + deltaHalf < 0 || b.halfFinIncl + deltaHalf > maxHalf;
    });
    if (bloque) { toast(deltaHalf < 0 ? "Déjà au début de la semaine affichée." : "Déjà à la fin de la semaine affichée."); return; }
    sauvegarderUndo();
    var copie = copieSelectionActive, nouveaux = [];
    plages.forEach(function (p) {
      var it = p.item;
      var b = demiSlotsDepuisBornes(it.giDebut, it.duree, it.demiDebut || null, it.demiFin || null);
      var nb = bornesDepuisDemiSlots(b.halfStart + deltaHalf, b.halfFinIncl + deltaHalf);
      if (copie) {
        var nouveau = p.liste === TACHES
          ? itemPlageTache(it.type, it.texte, it.personneId, nb.giDebut, nb.duree, { chantier: it.chantier, important: it.important, statut: it.statut, demiDebut: nb.demiDebut, demiFin: nb.demiFin })
          : itemPlage(it.type, it.texte, nb.giDebut, nb.duree, { important: it.important, demiDebut: nb.demiDebut, demiFin: nb.demiFin });
        nouveau.dateDebutIso = isoDeGi(nouveau.giDebut);
        p.liste.push(nouveau);
        nouveaux.push(nouveau.id);
        return;
      }
      it.giDebut = nb.giDebut; it.duree = nb.duree; it.demiDebut = nb.demiDebut; it.demiFin = nb.demiFin;
      it.dateDebutIso = isoDeGi(it.giDebut);
    });
    if (copie) {
      copieSelectionActive = false;
      bullesSelectionnees = {};
      nouveaux.forEach(function (id) { bullesSelectionnees[id] = true; });
    }
    var msgDecale = (copie ? "Copié (" : "Décalé (") + plages.length + ")" + (weekend ? " — " + weekend + " case(s) de week-end laissée(s) en place." : ".");
    // Bulle de série décalée : boîte « événement récurrent » (series.js).
    var enAttente = rendreAvecPorteeSerie("deplacer", msgDecale);
    majBarreSelection();
    if (!enAttente) toast(msgDecale);
  }
  // Pilule de sélection (#panneauSelection) : appelée à chaque rendu et à
  // chaque changement de sélection. Visible dès qu'une bulle est
  // sélectionnée. Crayon seulement pour UNE bulle ; flèches seulement en
  // mode multiple (réponse de Lionel, suite 7) ; ⧉ teinté quand "copier au
  // prochain déplacement" est armé. body.selection-active : sur téléphone,
  // la pilule prend la place de .nav-bas (cf. style-mobile.css).
  function majBarreSelection() {
    var panneau = document.getElementById("panneauSelection");
    if (!panneau) return;
    var n = Object.keys(bullesSelectionnees).length;
    panneau.hidden = !n;
    document.body.classList.toggle("selection-active", n > 0);
    panneau.querySelector(".sel-fleches").hidden = !modeSelectionMultiple;
    panneau.querySelector(".sel-compte").textContent = String(n);
    document.getElementById("selModifier").hidden = n !== 1;
    document.getElementById("selCopier").classList.toggle("actif", copieSelectionActive);
    // ⚑ (suite 14) : caché si rien de la sélection ne porte le drapeau
    // depuis la grille (que des jalons), teinté quand TOUT ce qui le porte
    // est déjà important — un appui le retire alors.
    var marquables = plagesImportantSelection_();
    var btnImportant = document.getElementById("selImportant");
    var tousImportants = marquables.length > 0 && marquables.every(function (p) { return !!p.item.important; });
    btnImportant.hidden = !marquables.length;
    btnImportant.classList.toggle("actif", tousImportants);
    btnImportant.setAttribute("aria-pressed", tousImportants ? "true" : "false");
  }
  // Bulles de la sélection qui peuvent porter le drapeau "important" depuis
  // la grille : tâches, absences, notes. Pas les jalons : leur drapeau se
  // règle sur la page Jalons, la grille ne le charge ni ne l'envoie (cf.
  // diffsJalons, js/donnees-sync.js) — le poser ici ne tiendrait pas au
  // rechargement.
  function plagesImportantSelection_() {
    var out = [];
    Object.keys(bullesSelectionnees).forEach(function (id) {
      var p = itemParId(id);
      if (p && p.item.type !== "jalon") out.push(p);
    });
    return out;
  }
  // ⚑ de la pilule (round du 24.09.2026, suite 14 — Lionel : « Ajoutez le
  // flag important à la pilule de sélection simple et multiple afin de
  // pouvoir mettre un texte important sur une ou plusieurs cases en même
  // temps »). Même règle qu'une case à cocher de groupe : si TOUTES les
  // bulles marquables sont déjà importantes, le drapeau est retiré à
  // toutes ; sinon il est posé sur toutes. Une seule étape d'annulation.
  // Enregistrement par le trajet habituel : mutation des items puis
  // render() -> synchroniser(), comme le décalage par les flèches. Une
  // bulle de série ouvre la boîte « événement récurrent » (suite 20, cf.
  // rendreAvecPorteeSerie, series.js) : le drapeau peut alors aller sur
  // cette occurrence, les suivantes ou toute la série. La sélection reste
  // en place pour enchaîner une autre action.
  function basculerImportantSelection() {
    var plages = plagesImportantSelection_();
    var jalons = Object.keys(bullesSelectionnees).length - plages.length;
    if (!plages.length) { toast("Le drapeau d'un jalon se règle sur la page Jalons."); return; }
    var poser = !plages.every(function (p) { return !!p.item.important; });
    sauvegarderUndo();
    plages.forEach(function (p) { p.item.important = poser; });
    var msg = (poser ? "Marqué important (" : "Important retiré (") + plages.length + ")" + (jalons ? " — jalon(s) : drapeau sur la page Jalons." : ".");
    var enAttente = rendreAvecPorteeSerie("modifier", msg);
    majBarreSelection();
    if (!enAttente) toast(msg);
  }
  // Crayon : ouvre la fiche de LA bulle sélectionnée (même geste qu'Entrée).
  function modifierSelection() {
    var ids = Object.keys(bullesSelectionnees);
    if (ids.length !== 1) return;
    var plage = itemParId(ids[0]);
    if (!plage) return;
    ouvrirBulle(plage.item, plage, Math.round(window.innerWidth / 2 - 110), Math.round(window.innerHeight / 2 - 90));
  }
  // Sortie automatique de la sélection une fois l'action terminée
  // (suppression, déplacement ou copie du groupe) : il suffit ensuite de
  // recliquer une bulle (ou double-tap/clic droit) pour une nouvelle
  // sélection.
  // Nettoie aussi la classe .selectionnee posée sur chaque bulle DOM (round
  // du 12.09.2026) : les appelants historiques (onAnnulerActuel, defaire/
  // refaire) enchaînaient déjà avec un render() qui reconstruit toute la
  // grille et fait donc disparaître ces classes de fait, mais le nouvel
  // appelant (fermerAuClicExterieur, cf. plus bas — Lionel : « lors de
  // l'enregistrement/annulation/suppression d'un formulaire le mode
  // sélection reste actif, sortir du mode ») ne re-render pas toujours
  // (Annuler seul, notamment) : sans ce nettoyage direct, la bulle resterait
  // visuellement teintée "sélectionnée" bien que bullesSelectionnees soit
  // déjà vide.
  // Suite 9 : vider la sélection éteint aussi le mode multiple (plus de
  // bouton pour le voir — le mode n'existe que le temps d'une sélection) et
  // désarme "copier au prochain déplacement".
  function quitterModeSelection() {
    Object.keys(bullesSelectionnees).forEach(function (id) {
      var dom = document.querySelector('.bulle[data-id="' + id + '"]');
      if (dom) dom.classList.remove("selectionnee");
    });
    bullesSelectionnees = {};
    modeSelectionMultiple = false;
    copieSelectionActive = false;
    majBarreSelection();
  }
  // Suppression groupée depuis la sélection : toujours confirmée avant
  // d'agir. Sans bulle de série : confirmation simple, retrait local, le
  // moteur de diff générique (render()) s'occupe du reste. Avec au moins
  // une bulle de série (round du 24.09.2026, suite 20) : la boîte
  // « Supprimer l’événement récurrent » tient lieu de confirmation, comme
  // dans un agenda — cet événement, celui-ci et les suivants, ou tous
  // (supprimerAvecPorteeSerie, series.js). Avant, la portée était imposée
  // en dur à « cet élément seul ».
  function supprimerSelection() {
    var ids = Object.keys(bullesSelectionnees);
    if (!ids.length) return;
    var plages = ids.map(function (id) { return itemParId(id); }).filter(Boolean);
    var msgOk = "Supprimé (" + ids.length + ").";
    if (plages.some(function (p) { return p.item.serieId; })) {
      supprimerAvecPorteeSerie(plages, quitterModeSelection, msgOk);
      return;
    }
    var texte = "Supprimer " + ids.length + " bulle" + (ids.length > 1 ? "s" : "") + " sélectionnée" + (ids.length > 1 ? "s" : "") + " ?";
    demanderConfirmation(texte, function () {
      sauvegarderUndo();
      plages.forEach(function (plage) {
        var i = plage.liste.indexOf(plage.item);
        if (i >= 0) plage.liste.splice(i, 1);
      });
      quitterModeSelection();
      render();
      toast(msgOk);
    });
  }

  // ---- Raccourcis clavier (ordinateur) — Échap sort de la sélection ET
  // ferme un popup ouvert (ajout/édition) sans enregistrer ; Suppr/Retour
  // arrière supprime la sélection (confirmation) ; Entrée ouvre l'édition
  // quand une seule bulle est cochée (comme un double clic), ou valide un
  // popup ouvert ; Ctrl+Z/Ctrl+Y annulent/refont ; Ctrl+X/C/V coupent/
  // copient/collent la sélection. Tout, sauf Échap et Entrée-valide-popup,
  // est ignoré quand on tape dans un champ de texte (couper/copier/coller/
  // annuler natif du navigateur DANS ce champ ne doit pas être court-circuité).
  document.addEventListener("keydown", function (e) {
    var cible = e.target, tag = cible && cible.tagName;
    var dansChamp = tag === "INPUT" || tag === "TEXTAREA" || (cible && cible.isContentEditable);

    if (e.key === "Escape") {
      if (popFermerActuel) { popFermerActuel(); e.preventDefault(); return; }
      if (Object.keys(bullesSelectionnees).length > 0 || modeSelectionMultiple) { quitterModeSelection(); render(false); e.preventDefault(); }
      return;
    }
    if (e.key === "Enter" && popValiderActuel) { popValiderActuel(); e.preventDefault(); return; }
    if (dansChamp) return;

    if (e.key === "Delete" || e.key === "Backspace") {
      if (Object.keys(bullesSelectionnees).length === 0) return;
      e.preventDefault();
      supprimerSelection();
      return;
    }
    // ← → (round du 24.09.2026, suite 7) : équivalent clavier des flèches de
    // #panneauSelection — demi-journée, jour entier avec Maj. En mode
    // multiple seulement, comme la barre elle-même (réponse de Lionel).
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && modeSelectionMultiple && Object.keys(bullesSelectionnees).length) {
      e.preventDefault();
      decalerSelection((e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 2 : 1));
      return;
    }
    if (e.key === "Enter") {
      var idsSel = Object.keys(bullesSelectionnees);
      if (idsSel.length !== 1) return;
      var plage = itemParId(idsSel[0]);
      if (!plage) return;
      e.preventDefault();
      ouvrirBulle(plage.item, plage, Math.round(window.innerWidth / 2 - 110), Math.round(window.innerHeight / 2 - 90));
      return;
    }

    var ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    var touche = e.key.toLowerCase();
    if (touche === "z") { e.preventDefault(); if (e.shiftKey) refaire(); else defaire(); return; }
    if (touche === "y") { e.preventDefault(); refaire(); return; }
    if (touche === "c") { e.preventDefault(); copierSelection(); return; }
    if (touche === "x") { e.preventDefault(); couperSelection(); return; }
    if (touche === "v") { e.preventDefault(); collerPressePapier(); return; }
  });

  function copierSelection() {
    var ids = Object.keys(bullesSelectionnees);
    if (!ids.length) { toast("Rien à copier."); return; }
    pressePapier = ids.map(function (id) {
      var plage = itemParId(id);
      return plage ? Object.assign({}, plage.item) : null;
    }).filter(Boolean);
    toast("Copié (" + pressePapier.length + ").");
  }
  function couperSelection() {
    var ids = Object.keys(bullesSelectionnees);
    if (!ids.length) { toast("Rien à couper."); return; }
    copierSelection();
    sauvegarderUndo();
    ids.forEach(function (id) {
      var plage = itemParId(id);
      if (!plage) return;
      var i = plage.liste.indexOf(plage.item);
      if (i >= 0) plage.liste.splice(i, 1);
    });
    quitterModeSelection();
    render();
    toast("Coupé (" + ids.length + ").");
  }
  function collerPressePapier() {
    if (!pressePapier.length) { toast("Presse-papier vide."); return; }
    sauvegarderUndo();
    var nouveauxIds = [];
    pressePapier.forEach(function (it) {
      var nouveau;
      if (it.personneId !== undefined) {
        nouveau = itemPlageTache(it.type, it.texte, it.personneId, it.giDebut, it.duree, { chantier: it.chantier, important: it.important, statut: it.statut, demiDebut: it.demiDebut, demiFin: it.demiFin });
        TACHES.push(nouveau);
      } else if (it.type === "jalon" || it.type === "note") {
        nouveau = itemPlage(it.type, it.texte, it.giDebut, it.duree, { important: it.important, demiDebut: it.demiDebut, demiFin: it.demiFin });
        nouveau.dateDebutIso = isoDeGi(it.giDebut);
        (it.type === "jalon" ? JALONS : NOTES).push(nouveau);
      } else return;
      nouveauxIds.push(nouveau.id);
    });
    bullesSelectionnees = {};
    nouveauxIds.forEach(function (id) { bullesSelectionnees[id] = true; });
    render();
    majBarreSelection();
    toast("Collé (" + nouveauxIds.length + ").");
  }

  /* ============ POPUPS GÉNÉRIQUES ============ */
  function demanderConfirmation(texte, confirme, avant) {
    var overlay = document.createElement("div");
    overlay.className = "voile-confirm";
    var pop = document.createElement("div");
    pop.className = "pop confirm-pop";
    pop.innerHTML = '<div class="cp-titre">Confirmer</div>' +
      '<p class="confirm-texte">' + esc(texte) + '</p>' +
      '<div class="confirm-boutons">' +
      '<button type="button" class="c-annuler">Annuler</button>' +
      '<button type="button" class="c-ok danger">Confirmer</button>' +
      '</div>';
    document.body.appendChild(overlay);
    document.body.appendChild(pop);
    function nettoyer() {
      overlay.remove(); pop.remove();
      if (popFermerActuel === nettoyer) popFermerActuel = null;
      if (popValiderActuel === validerConfirm) popValiderActuel = null;
      if (avant) avant();
    }
    function validerConfirm() { nettoyer(); confirme(); }
    overlay.addEventListener("pointerdown", nettoyer);
    pop.querySelector(".c-annuler").addEventListener("click", nettoyer);
    pop.querySelector(".c-ok").addEventListener("click", validerConfirm);
    popFermerActuel = nettoyer;
    popValiderActuel = validerConfirm;
  }
  function positionnerPop(pop, x, y) {
    pop.style.left = "-999px"; pop.style.top = "-999px";
    document.body.appendChild(pop);
    var pr = pop.getBoundingClientRect();
    pop.style.left = Math.max(6, Math.min(x, window.innerWidth - pr.width - 10)) + "px";
    pop.style.top = Math.max(6, Math.min(y, window.innerHeight - pr.height - 10)) + "px";
    // Round du 14.09.2026 — Lionel : « les popup sont trop en bas et si je
    // sélectionne les séries, je ne vois pas les séries qui sont hors
    // écran. » Le clamp ci-dessus n'a lieu qu'UNE FOIS, à l'ouverture — mais
    // plusieurs popups grandissent ENSUITE selon ce qu'on y coche (ex.
    // « Série (se répète) » révèle .serie-options, cf. cablerSerieChamps ;
    // « options avancées » révèle son bloc, cf. optionsAvanceesHTML) sans
    // jamais rappeler positionnerPop(). Un popup ouvert près du bas de
    // l'écran (fréquent : on clique une case du planning, pas forcément
    // tout en haut de la fenêtre) grandit alors PAR LE BAS, hors écran —
    // `max-height`/`overflow-y:auto` (cf. règle .pop) plafonnent la hauteur
    // de la boîte mais pas SA POSITION : une boîte trop basse peut dépasser
    // l'écran même hauteur plafonnée, sans aucun moyen de faire défiler la
    // PAGE jusqu'à elle (position:fixed). Un ResizeObserver reclampe donc le
    // popup (même formule que ci-dessus, mais sur sa position ACTUELLE
    // plutôt que x/y d'origine) à chaque changement réel de sa taille —
    // couvre tous les cas présents ET futurs, sans avoir à penser à
    // rappeler un reclamp depuis chaque bascule .hidden au cas par cas
    // (c'est justement l'oubli d'un de ces cas qui a produit ce bug).
    // Ignoré sur mobile/tablette (.form-pop y est repositionné en CSS avec
    // !important — cf. les 2 @media plus haut — donc ces style.top/left
    // posés en JS y sont déjà sans effet visuel, inoffensif).
    // Auto-nettoyage paresseux plutôt qu'un disconnect() explicite à la
    // fermeture (trop de chemins de fermeture différents dans ce fichier
    // pour être sûr de tous les retrouver sans en oublier un — même défaut
    // que le bug corrigé ici) : l'observer se déconnecte de lui-même au 1er
    // redimensionnement constaté après la disparition du popup du DOM.
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        if (!pop.isConnected) { ro.disconnect(); return; }
        var r = pop.getBoundingClientRect();
        pop.style.top = Math.max(6, Math.min(r.top, window.innerHeight - r.height - 10)) + "px";
        pop.style.left = Math.max(6, Math.min(r.left, window.innerWidth - r.width - 10)) + "px";
      });
      ro.observe(pop);
    }
  }
  function fermerAuClicExterieur(pop, celluleSurbrillance, valider) {
    if (celluleSurbrillance) celluleSurbrillance.classList.add("selection-add");
    function surClic(ev) { if (!pop.contains(ev.target)) fermer(); }
    function fermer() {
      pop.remove();
      document.removeEventListener("pointerdown", surClic, true);
      if (celluleSurbrillance) celluleSurbrillance.classList.remove("selection-add");
      if (popFermerActuel === fermer) popFermerActuel = null;
      if (valider && popValiderActuel === valider) popValiderActuel = null;
      // Round du 12.09.2026 — Lionel : « lors de l'enregistrement/annulation/
      // suppression d'un formulaire le mode sélection reste actif, sortir du
      // mode. » fermer() est le point de sortie COMMUN à Enregistrer/
      // Annuler/Supprimer (tous l'appellent, cf. leurs handlers f-ok/
      // f-annuler/f-suppr dans ouvrirEdition/ouvrirEditionPlage et les
      // formulaires historiques) et au clic extérieur — un seul endroit
      // suffit donc à couvrir les 3 cas demandés, sans rien dupliquer par
      // formulaire.
      if (Object.keys(bullesSelectionnees).length) quitterModeSelection();
    }
    setTimeout(function () { document.addEventListener("pointerdown", surClic, true); }, 0);
    popFermerActuel = fermer;
    if (valider) popValiderActuel = valider;
    return fermer;
  }

  /* ============ FABRIQUES PARTAGÉES — cartes tâche/absence/note/jalon
     (round du 11.09.2026, cf. le bloc CSS .carte-item plus haut et
     mockups.html) : ouvrirEdition (tâche/absence) et ouvrirEditionPlage
     (jalon/note) construisent toutes les 2 le même bandeau/dates-plage/pied,
     d'où ces fabriques communes plutôt que dupliquer ~150 lignes de balisage
     et de câblage quasi identiques entre les 2 fonctions. ============ */
  var JOURS_ABBR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  function libelleDateCourte(gi) {
    var iso = isoDeGi(gi);
    if (!iso) return "";
    var l = libelleJourGi(gi);
    var d = new Date(iso + "T00:00:00");
    return JOURS_ABBR[d.getDay()] + ". " + l.jour + " " + l.mois;
  }
  // §88 — même libellé que libelleDateCourte, mais depuis une vraie date ISO
  // plutôt qu'un gi (donc valable pour une date HORS de la fenêtre chargée,
  // qui n'a par définition aucun gi — cf. libelleJourGi/isoDeGi, qui lisent
  // etat.cache et renvoient vide dans ce cas). Calcule jour/mois directement
  // par l'objet Date plutôt que via le cache serveur.
  function libelleDateCourteIso(iso) {
    if (!iso) return "";
    var d = new Date(iso + "T00:00:00");
    return JOURS_ABBR[d.getDay()] + ". " + d.getDate() + " " + MOIS_ABBR[d.getMonth() + 1];
  }
  var ICONE_FERMER = '<svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var ICONE_DRAPEAU = '<svg class="icon" viewBox="0 0 24 24"><path d="M6 3v18M6 4h12l-3 4 3 4H6"/></svg>';
  var ICONE_CHEVRON_G = '<svg class="icon" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>';
  var ICONE_CHEVRON_D = '<svg class="icon" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
  var ICONE_CHEVRON_BAS = '<svg class="icon" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
  var ICONE_CHEVRON_HAUT = '<svg class="icon" viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>';
  var ICONE_SUPPR = '<svg class="icon" viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0l-1 13a2 2 0 01-2 2H9a2 2 0 01-2-2L6 7"/></svg>';
  var ICONE_CHECK = '<svg class="icon" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>';

  // opts: { clair, fondStyle, important, chantierHTML, nomGrand }
  function bandeauHTML(opts) {
    return '<div class="bandeau' + (opts.clair ? " clair" : "") + '"' + (opts.fondStyle ? ' style="' + opts.fondStyle + '"' : "") + '>' +
      '<button type="button" class="fermer f-annuler" title="Fermer">' + ICONE_FERMER + '</button>' +
      '<button type="button" class="important-toggle f-important' + (opts.important ? " actif" : "") + '" title="Important">' + ICONE_DRAPEAU + '</button>' +
      (opts.chantierHTML || "") +
      '<div class="nom-grand">' + esc(opts.nomGrand || "") + '</div>' +
      '</div>';
  }
  // bord : "debut" | "fin" — demi : "matin"|"aprem"|null. Les 2 boutons A/P
  // restent TOUJOURS actifs sur les 2 lignes (Lionel, round du 12.09.2026 :
  // "jeudi A, vendredi P... voudrait dire 2 jours complets, il n'y a pas de
  // trou" — correct, cf. commentaire de datesPlageHTML plus bas) : aucune
  // combinaison n'est désactivée ici.
  // isoHorsFenetre (§88) : quand non-null, cette borne est hors de la
  // fenêtre actuellement chargée (uniquement possible pour un jalon/note,
  // cf. appliquerDateChoisieFormulaire) — le libellé vient alors directement
  // de la vraie date ISO (libelleDateCourteIso) plutôt que du gi (calé/
  // clampé sur le bord visible, cf. commentaire de appliquerDateChoisieFormulaire),
  // avec une classe CSS dédiée pour rester lisible que ce jour n'est pas
  // affiché à l'écran en ce moment.
  function dateLigneHTML(label, gi, bord, demi, isoHorsFenetre) {
    var texteDate = isoHorsFenetre ? libelleDateCourteIso(isoHorsFenetre) : libelleDateCourte(gi);
    return '<div class="date-ligne" data-bord="' + bord + '">' +
      '<div class="date-ligne-gauche">' +
      '<span class="label-date">' + label + '</span>' +
      '<div class="date-nav">' +
      '<button type="button" class="fleche f-fleche" data-sens="-1" title="Jour précédent">' + ICONE_CHEVRON_G + '</button>' +
      '<span class="date-val' + (isoHorsFenetre ? ' date-val-hors-fenetre' : '') + '"' + (isoHorsFenetre ? ' title="Hors de la semaine affichée actuellement à l’écran"' : '') + '>' + esc(texteDate) + '</span>' +
      '<button type="button" class="fleche f-fleche" data-sens="1" title="Jour suivant">' + ICONE_CHEVRON_D + '</button>' +
      '</div></div>' +
      '<div class="demi-toggle" title="Moment de la journée">' +
      '<button type="button" class="demi-btn f-demi-btn' + (demi === "matin" ? " actif" : "") + '" data-demi="matin" title="Avant-midi seulement">A</button>' +
      '<button type="button" class="demi-btn f-demi-btn' + (demi === "aprem" ? " actif" : "") + '" data-demi="aprem" title="Après-midi seulement">P</button>' +
      '</div></div>';
  }
  // Sur 1 seul jour, Début et Fin désignent la même date : les 2 lignes
  // restent affichées (symétrie demandée par Lionel : "Absence et tâche
  // aussi avec A/P") mais partagent alors la même demi-journée.
  //
  // Sur plusieurs jours, les 4 combinaisons sont possibles et aucune ne
  // creuse de trou visuel : "Début=matin" et "Fin=aprem" sont chacun
  // équivalents à une journée entière pour le RENDU (colonneEtSpanDemi ne
  // raccourcit visuellement qu'avec Début=aprem ou Fin=matin, cf. plus bas
  // dans le fichier) — ex. Lionel, round du 12.09.2026 : *"jeudi 10.09 A,
  // vendredi 11.09 P, voudrait dire 2 jours complets, il n'y a pas de
  // trou"* — exact, c'est bien ce qui s'affiche. Seule la détection
  // d'occupation (demisOccupeesTache, utilisée pour le chantier par défaut
  // d'une nouvelle tâche et la sélection au glissé) devait être corrigée en
  // conséquence pour ne jamais compter cette combinaison-là comme "à
  // moitié libre" alors qu'elle s'affiche pleine — cf. demisOccupeesTache.
  function datesPlageHTML(giDebut, giFin, demiDebut, demiFin, isoDebutHorsFenetre, isoFinHorsFenetre) {
    return '<div class="dates-plage">' +
      dateLigneHTML("Début", giDebut, "debut", demiDebut, isoDebutHorsFenetre) +
      dateLigneHTML("Fin", giFin, "fin", demiFin, isoFinHorsFenetre) +
      '</div>';
  }
  function piedPrincipalHTML(avecSuppr) {
    return '<div class="pied-principal">' +
      (avecSuppr ? '<button type="button" class="btn-icon supprimer f-suppr" title="Supprimer">' + ICONE_SUPPR + '</button>' : "") +
      '<button type="button" class="f-ok">' + ICONE_CHECK + ' Enregistrer</button>' +
      '</div>';
  }
  function optionsAvanceesHTML(champStatut, champSerie) {
    if (!champStatut && !champSerie) return "";
    return '<div class="lien-plus ferme f-lien-plus">Plus d’options ' + ICONE_CHEVRON_BAS + '</div>' +
      '<div class="options-avancees" hidden>' + champStatut + champSerie + '</div>';
  }
  function cablerLienPlus(pop) {
    var lien = pop.querySelector(".f-lien-plus");
    if (!lien) return;
    var bloc = pop.querySelector(".options-avancees");
    lien.addEventListener("click", function () {
      bloc.hidden = !bloc.hidden;
      lien.classList.toggle("ferme", bloc.hidden);
      lien.innerHTML = bloc.hidden ? ("Plus d’options " + ICONE_CHEVRON_BAS) : ("Moins d’options " + ICONE_CHEVRON_HAUT);
    });
  }
  // §88 — vraie date ISO d'une borne du state, qu'elle soit dans la fenêtre
  // (dérivée du gi) ou hors fenêtre (override debutHorsFenetreIso/
  // finHorsFenetreIso, jalon/note uniquement — cf. appliquerDateChoisieFormulaire).
  // Utilisée partout où le code avait besoin jusqu'ici de `isoDeGi(state.giXxx)`
  // pour connaître "la date actuellement affichée pour cette borne".
  function isoBorneEtat(state, bord) {
    if (bord === "debut") return state.debutHorsFenetreIso || isoDeGi(state.giDebut);
    return state.finHorsFenetreIso || isoDeGi(state.giFin);
  }
  // state : { giDebut, giFin, demiDebut, demiFin, ... } muté en place ;
  // rafraichir() est rappelée après chaque changement pour re-rendre le bloc
  // dates-plage (texte de date, état actif des boutons A/P) — cf.
  // isoDeGi/nbJoursAffiches pour les bornes de la fenêtre chargée, seul
  // espace où `gi` a un sens (pas de conversion date calendaire libre).
  function cablerDatesPlage(pop, state, rafraichir) {
    var conteneur = pop.querySelector(".dates-plage");
    conteneur.querySelectorAll(".f-fleche").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var ligne = btn.closest(".date-ligne");
        var bord = ligne.dataset.bord;
        var sens = +btn.dataset.sens;
        // Round du 12.09.2026 — retour de Lionel sur le round précédent :
        // « les curseurs sont liés mais pas correctement [...] augmenter la
        // date de fin ne doit pas augmenter la date de début [...] diminuer
        // la date de début ne doit pas diminuer la date de fin ». L'ancien
        // code liait les 2 bornes dans TOUS les sens dès qu'elles étaient
        // égales (donc aussi "Fin suivant"/"Début précédent", à tort) parce
        // qu'il recalculait le gi À LA MAIN au lieu de réutiliser
        // appliquerDateChoisieFormulaire, dont le calcul giAutre >= /<=
        // giChoisi ne recolle l'AUTRE borne que quand la garder créerait un
        // intervalle invalide (Début > Fin) — donc uniquement "Début
        // suivant"/"Fin précédent" quand elles sont égales, jamais "Fin
        // suivant"/"Début précédent". Reste ici uniquement le calcul du jour
        // ouvré voisin (isoJourOuvreVoisin) : les flèches avancent/reculent
        // d'un jour ouvré, jamais sur un week-end.
        //
        // Un 1er essai de ce correctif laissait aussi les flèches naviguer
        // vers une autre semaine quand le jour visé en sortait — retiré tout
        // de suite après (même round) sur 2 retours de Lionel : « le
        // planning ne doit pas suivre en arrière-plan » et « cette manière
        // limite une tâche à 1 semaine [en pratique : recollait
        // silencieusement l'autre borne dès qu'elle ne rentrait plus dans la
        // nouvelle fenêtre], il ne doit pas y avoir de limite ». cf. le
        // commentaire de appliquerDateChoisieFormulaire pour l'explication
        // complète (la fenêtre chargée n'est pas qu'une limite d'affichage :
        // c'est aussi la limite réelle du moteur de synchronisation — vrai
        // pour tâche/absence, plus pour jalon/note depuis §88, cf. son
        // commentaire). isoBorneEtat (§88) plutôt que isoDeGi direct : sinon
        // "Fin suivant" repartirait du bord VISIBLE (clampé) au lieu de la
        // vraie date déjà choisie, dès qu'une borne est hors fenêtre.
        var isoActuel = isoBorneEtat(state, bord);
        if (!isoActuel) return;
        appliquerDateChoisieFormulaire(state, bord, isoJourOuvreVoisin(isoActuel, sens), rafraichir);
      });
    });
    conteneur.querySelectorAll(".f-demi-btn").forEach(function (btn) {
      if (btn.disabled) return;
      btn.addEventListener("click", function () {
        var ligne = btn.closest(".date-ligne");
        var bord = ligne.dataset.bord;
        var v = btn.dataset.demi;
        // Round du 12.09.2026 — Lionel : « impossible de sélectionner A et P
        // si la date de début correspond à la date de fin [...] on doit
        // pouvoir faire A/P ou A/A ou PP, mais pas P/A ». Avant ce correctif,
        // les 2 lignes étaient forcées à toujours porter la MÊME valeur dès
        // que Début === Fin (1 seul jour) : impossible d'avoir Début=matin
        // ET Fin=aprem en même temps. Les 2 lignes basculent maintenant
        // indépendamment, EXACTEMENT comme sur plusieurs jours (plus aucune
        // condition sur state.giDebut === state.giFin ici) — seule la
        // combinaison Début=aprem + Fin=matin reste bloquée sur 1 seul jour :
        // elle ferait "commencer après-midi, finir le matin" du MÊME jour,
        // ce qui n'a pas de sens (contrairement à plusieurs jours, où cette
        // même combinaison est parfaitement valide). Début=matin + Fin=aprem
        // reste normalisé en journée entière (null/null) à l'enregistrement,
        // cf. la sauvegarde de la fiche plus bas — ça n'a donc pas besoin
        // d'être bloqué ici.
        var unSeulJour = state.giDebut === state.giFin;
        if (bord === "debut") {
          var nvD = state.demiDebut === v ? null : v;
          if (unSeulJour && nvD === "aprem" && state.demiFin === "matin") return;
          state.demiDebut = nvD;
        } else {
          var nvF = state.demiFin === v ? null : v;
          if (unSeulJour && nvF === "matin" && state.demiDebut === "aprem") return;
          state.demiFin = nvF;
        }
        rafraichir();
      });
    });
    cablerCalendrierDate(conteneur, state, rafraichir);
  }
  // Round D — Lionel : « Cliquer sur la date dans les formulaires permet
  // d'ouvrir un calendrier. » Un <input type="date"> natif invisible,
  // positionné juste au-dessus du texte de la date (.date-val), sert de
  // calendrier — pas de composant "date picker" maison à écrire/maintenir.
  // .showPicker() (Chrome/Edge) ouvre le calendrier natif au clic ; navigateur
  // sans support -> repli sur .focus() (l'utilisateur ouvre alors le
  // calendrier lui-même via le petit icône natif du champ, toujours visible
  // puisque l'input, bien qu'habillé pour être discret, n'est jamais
  // display:none).
  //
  // Round du 12.09.2026 — CORRECTIF IMPORTANT par rapport au paragraphe
  // ci-dessus (Round D) : choisir une date ici ne navigue PLUS vers une
  // autre semaine (cf. appliquerDateChoisieFormulaire, appelée juste en
  // dessous) — une date hors de la fenêtre actuellement affichée est
  // refusée (toast), suite au retour de Lionel « le planning ne doit pas
  // suivre en arrière-plan ». Un input[type=date] natif ne permet de toute
  // façon pas de brider son calendrier à seulement quelques jours valides
  // (on pourrait poser min/max, mais l'utilisateur verrait alors les autres
  // dates grisées SANS explication) — la validation se fait donc après coup,
  // dans appliquerDateChoisieFormulaire. CONSÉQUENCE À GARDER EN TÊTE : le
  // calendrier ne peut donc plus viser une date lointaine (~5 ans
  // devant/derrière) comme le pouvait "Ajout lointain" (supprimé plus haut
  // dans ce même round D en le disant redondant avec CE calendrier) — cette
  // affirmation ne tient donc plus depuis ce correctif. "Ajout lointain"
  // n'a pas été réintroduit ici (pas demandé), mais si Lionel a besoin
  // d'assigner une tâche à une date lointaine SANS d'abord y naviguer à la
  // main, il faudra soit ramener une variante d'"Ajout lointain", soit
  // construire le vrai enregistrement en plage évoqué dans le commentaire de
  // appliquerDateChoisieFormulaire.
  //
  // §88 : le paragraphe ci-dessus ("une date hors fenêtre est refusée") ne
  // vaut plus que pour tâche/absence — cf. appliquerDateChoisieFormulaire.
  // Pour jalon/note, ce calendrier peut donc de nouveau viser une date
  // lointaine, comme le pouvait l'ancien "Ajout lointain".
  function cablerCalendrierDate(conteneur, state, rafraichir) {
    conteneur.querySelectorAll(".date-val").forEach(function (span) {
      span.classList.add("date-val-cliquable");
      // Ne pas écraser le title "hors de la semaine affichée" déjà posé par
      // dateLigneHTML (§88) sur une borne hors fenêtre — on le complète
      // plutôt que de le remplacer.
      span.title = (span.classList.contains("date-val-hors-fenetre") ? "Hors de la semaine affichée actuellement à l’écran. " : "") + "Cliquer pour choisir une date dans le calendrier";
      span.addEventListener("click", function () {
        if (conteneur.querySelector(".date-picker-natif")) return; // déjà ouvert (ex. double-clic)
        var ligne = span.closest(".date-ligne");
        var bord = ligne.dataset.bord;
        var isoActuel = isoBorneEtat(state, bord);
        if (!isoActuel) return;
        var input = document.createElement("input");
        input.type = "date";
        input.className = "date-picker-natif";
        input.value = isoActuel;
        var r = span.getBoundingClientRect();
        input.style.left = r.left + "px"; input.style.top = r.top + "px";
        input.style.width = Math.max(r.width, 90) + "px"; input.style.height = r.height + "px";
        ligne.appendChild(input);
        var nettoye = false;
        function nettoyer() { if (nettoye) return; nettoye = true; if (input.parentElement) input.remove(); }
        input.addEventListener("change", function () {
          var iso = input.value;
          nettoyer();
          if (iso) appliquerDateChoisieFormulaire(state, bord, iso, rafraichir);
        });
        input.addEventListener("blur", function () { setTimeout(nettoyer, 200); });
        if (input.showPicker) { try { input.showPicker(); } catch (ex) { input.focus(); } }
        else input.focus();
      });
    });
  }
  // Applique la date choisie (calendrier OU flèches, cf. cablerDatesPlage) au
  // bord `bord` ("debut"|"fin") d'une plage tâche/absence/jalon/note.
  //
  // Round du 12.09.2026 — 2 retours de Lionel sur la version précédente de
  // cette fonction (qui naviguait vers la semaine cible quand la date sortait
  // de la fenêtre affichée) :
  // 1. « le planning ne doit pas suivre en arrière-plan » : changer la date
  //    dans une fiche ne doit JAMAIS faire bouger la grille affichée
  //    derrière — même quand la fiche reste ouverte pendant la navigation,
  //    voir la grille "sauter" de semaine en arrière-plan est déroutant.
  // 2. « cette manière limite une tâche à 1 semaine, il ne doit pas y avoir
  //    de limite » : naviguer vers la semaine de la borne éditée ne réglait
  //    d'ailleurs qu'à moitié le problème — dès que l'AUTRE borne (non
  //    éditée) ne rentrait plus dans cette nouvelle fenêtre, elle était
  //    ramenée de force sur la date choisie (repli de la ligne juste
  //    au-dessus), ce qui recollait silencieusement la plage à 1 seul jour
  //    au lieu de vraiment l'étendre.
  // Cause racine commune aux 2 : `giDebut`/`giFin` sont des coordonnées
  // relatives à la fenêtre CHARGÉE (cf. §1 du spec) — pour qu'une plage soit
  // représentable en gi, ses 2 bornes doivent être visibles EN MÊME TEMPS
  // dans cette fenêtre (max 2 semaines). Ce n'est pas qu'une limite
  // d'affichage : le moteur de synchronisation (calculerEtatLocal, cellules
  // "personne" ET jalons) ne diffuse QUE les jours de la fenêtre
  // actuellement chargée (giVisibleFenetre) — un jour au-delà serait de
  // toute façon silencieusement ignoré à l'enregistrement, PAS écrit sur le
  // serveur. Faire "voyager" la fenêtre en arrière-plan pour contourner ça
  // n'aurait fait que déplacer le problème (et perdre le fil visuel de
  // Lionel avec la grille, cf. retour 1) sans jamais lever la vraie limite.
  //
  // §88 (round du 17.09.2026, suite×3) — MISE À JOUR IMPORTANTE du
  // raisonnement ci-dessus, suite au retour de Lionel : « L'ajout hors
  // semaine active est bloqué par les formulaires de saisie » (après avoir
  // testé §87 en conditions réelles). Le blocage décrit plus haut reste
  // ENTIÈREMENT réel pour une Tâche/Absence (aucun enregistrement en plage
  // côté serveur pour elles — cf. le paragraphe ci-dessus, toujours valable
  // pour ces 2 types, un chantier séparé à faire). Pour un Jalon ou une
  // Note en revanche, ce "chantier séparé" n'en est plus un : le serveur
  // (planPlage, functions/enregistrer-plage/logic.js) sait DÉJÀ écrire une
  // plage entière à partir de vraies dates ISO, sans jamais dépendre de ce
  // qui est chargé côté client — cf. diffsNotes, qui l'utilise déjà ainsi.
  // Le vrai blocage pour ces 2 types n'était donc QUE dans cette fonction
  // (et le moteur de diff associé, cf. jalonsParId/diffsJalons plus bas) —
  // purement un choix d'implémentation, pas une limite du serveur.
  //
  // state.kind ("jalon"|"note"|"tache"|"absence", posé par
  // ouvrirEditionPlage/ouvrirEdition) distingue donc maintenant les 2 cas :
  // - jalon/note : une date hors fenêtre n'est plus refusée. La borne
  //   choisie est gardée comme une vraie date ISO à part
  //   (state.debutHorsFenetreIso/finHorsFenetreIso), le gi correspondant
  //   étant calé ("clampé") sur le bord VISIBLE le plus proche pour que le
  //   reste du code qui a besoin d'une position d'affichage (surbrillance de
  //   la grille essentiellement — cf. surbrillancePreciseJalonNote) garde
  //   quelque chose de valide à lire. La comparaison Début/Fin ci-dessous se
  //   fait donc sur de VRAIES dates ISO (jamais des gi, qui n'existent que
  //   DANS la fenêtre) pour rester juste même quand l'une des 2 bornes est
  //   hors fenêtre.
  // - tâche/absence : comportement INCHANGÉ, la date est toujours refusée
  //   (toast) — cf. le paragraphe précédent, toujours vrai pour ces 2 types.
  //
  // Round du 24.09.2026 (suite 5) — le "chantier séparé" annoncé ci-dessus
  // pour tâche/absence est fait (Lionel : « J'aimerai pouvoir déplacer une
  // tâche en dehors de la semaine activé ») : plus aucun refus ici, les 4
  // types gardent une borne hors fenêtre en vraie date ISO. L'écriture de
  // la tâche/absence passe alors par enregistrerTacheEnDatesServeur
  // (donnees-sync.js, vraies dates, directement sur la table `taches`),
  // plus par le moteur de diff — cf. ouvrirEdition.
  //
  // La borne éditée (`bord`) garde TOUJOURS exactement la date choisie —
  // l'AUTRE borne n'est recollée dessus que si la garder créerait un
  // intervalle invalide (Début > Fin) ; sinon elle reste inchangée (cf.
  // cablerDatesPlage pour le détail de cette asymétrie).
  function appliquerDateChoisieFormulaire(state, bord, isoChoisi, rafraichir) {
    var autreEstFin = bord === "debut";
    var isoAutre = autreEstFin
      ? (state.finHorsFenetreIso || isoDeGi(state.giFin))
      : (state.debutHorsFenetreIso || isoDeGi(state.giDebut));
    var isoDebutFinal, isoFinFinal;
    if (bord === "debut") {
      isoDebutFinal = isoChoisi;
      isoFinFinal = (isoAutre >= isoChoisi) ? isoAutre : isoChoisi;
    } else {
      isoFinFinal = isoChoisi;
      isoDebutFinal = (isoAutre <= isoChoisi) ? isoAutre : isoChoisi;
    }
    var giD = giDepuisIso(isoDebutFinal), giF = giDepuisIso(isoFinFinal);
    var n = nbJoursAffiches();
    state.giDebut = giD != null ? giD : 0;
    state.giFin = giF != null ? giF : (n - 1);
    if (state.giDebut > state.giFin) { var tmp = state.giDebut; state.giDebut = state.giFin; state.giFin = tmp; }
    state.debutHorsFenetreIso = giD != null ? null : isoDebutFinal;
    state.finHorsFenetreIso = giF != null ? null : isoFinFinal;
    if (state.giDebut === state.giFin && !state.debutHorsFenetreIso && !state.finHorsFenetreIso) state.demiFin = state.demiDebut;
    rafraichir();
  }
  // Descriptif affiché en texte simple, cliquable pour ouvrir un petit
  // éditeur (popup centré desktop/tablette, demi-fenêtre bas d'écran
  // téléphone — même balisage, seule la CSS change, cf. .desc-edit-box) posé
  // en enfant de `pop` (jamais "extérieur" au sens de fermerAuClicExterieur).
  // getTexte/setTexte lisent/écrivent une simple variable JS locale à
  // l'appelant — aucun appel serveur ici, l'enregistrement se fait comme
  // avant au clic sur "Enregistrer" du formulaire entier.
  function cablerDescriptifEdit(pop, getTexte, setTexte, placeholderVide) {
    var span = pop.querySelector(".descriptif-texte");
    function afficher() {
      var t = getTexte();
      span.textContent = t;
      if (!t && placeholderVide) span.setAttribute("data-placeholder", placeholderVide);
    }
    afficher();
    span.addEventListener("click", function () {
      if (pop.querySelector(".desc-edit-overlay")) return;
      var overlay = document.createElement("div");
      overlay.className = "desc-edit-overlay";
      var box = document.createElement("div");
      box.className = "desc-edit-box";
      box.innerHTML = '<div class="popup-head"><div class="popup-titre">Modifier le descriptif</div>' +
        '<button type="button" class="popup-close" title="Fermer">' + ICONE_FERMER + '</button></div>' +
        '<textarea>' + esc(getTexte()) + '</textarea>' +
        '<div class="popup-pied"><button type="button" class="popup-valider">' + ICONE_CHECK + ' Enregistrer</button></div>';
      pop.appendChild(overlay); pop.appendChild(box);
      var ta = box.querySelector("textarea");
      ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      function fermerEdit() { overlay.remove(); box.remove(); }
      function validerEdit() { setTexte(ta.value.trim()); afficher(); fermerEdit(); }
      overlay.addEventListener("pointerdown", fermerEdit);
      box.querySelector(".popup-close").addEventListener("click", fermerEdit);
      box.querySelector(".popup-valider").addEventListener("click", validerEdit);
      // Round du 12.09.2026 — Lionel : « appuis sur entré doit enregistrer le
      // texte du descriptif, esc ferme sans enregistrer. actuellement
      // appuyer sur entrer sort du formulaire sans enregistrer le texte du
      // descriptif. » Sans ceci, Entrée/Échap tapés dans CE textarea
      // remontaient jusqu'au raccourci clavier global (cf. plus haut,
      // popValiderActuel/popFermerActuel), qui valide/ferme le FORMULAIRE
      // ENTIER (la carte tâche/absence/note/jalon) sans jamais committer ce
      // texte via setTexte() — d'où le texte perdu. stopPropagation()
      // empêche ce document.addEventListener("keydown") de les revoir.
      // Maj+Entrée reste un retour à la ligne normal dans le textarea.
      ta.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); validerEdit(); return; }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fermerEdit(); }
      });
    });
    return afficher;
  }

  /* ============ SÉRIE (RÉCURRENCE) — création/modification/suppression
     directement côté serveur (apiEnregistrerSerie/apiModifierSerie/
     apiSupprimerSerie), §4 du spec : occurrences matérialisées, pas de
     règle "live" — le calcul des dates se fait côté serveur (pasCalendaire_),
     jamais en espace `gi` côté client (contrairement au prototype V3 isolé).
     ============ */
  // Round du 24.09.2026 (suite 20) — Lionel : « j'aimerai qu'elles se
  // comporte comme sur un calendrier avant suppression, déplacement ou
  // modification. proposer de modifier toute la série, les événements à
  // venir ou uniquement celui-ci. » Boîte calquée sur celle d'un agenda :
  // titre « Modifier/Déplacer/Supprimer l’événement récurrent », 3 choix
  // en boutons radio (« Cet événement » coché d'office), Annuler / OK.
  // Entrée valide, Échap / clic à côté / Annuler appellent opts.onAnnuler
  // (le geste qui a ouvert la boîte y remet la grille en l'état — cf.
  // rendreAvecPorteeSerie, series.js). opts.seulementUnique grise les 2
  // autres choix (case de week-end, cf. changementSerie_) ; opts.message
  // s'affiche sous le titre.
  function demanderPorteeSerie(titre, callback, opts) {
    opts = opts || {};
    var overlay = document.createElement("div");
    overlay.className = "voile-confirm";
    var pop = document.createElement("div");
    pop.className = "pop confirm-pop confirm-pop-serie";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", titre);
    var choix = [
      { valeur: "unique", classe: "cs-unique", libelle: "Cet événement" },
      { valeur: "suivant", classe: "cs-suivant", libelle: "Cet événement et les suivants" },
      { valeur: "serie", classe: "cs-serie", libelle: "Tous les événements" }
    ];
    pop.innerHTML = '<div class="cs-titre">' + esc(titre) + '</div>' +
      (opts.message ? '<p class="confirm-texte cs-message">' + esc(opts.message) + '</p>' : '') +
      '<div class="confirm-boutons-serie" role="radiogroup">' +
      choix.map(function (c, i) {
        var off = opts.seulementUnique && i > 0;
        return '<label class="cs-choix ' + c.classe + (off ? ' desactive' : '') + '">' +
          '<input type="radio" name="porteeSerie" value="' + c.valeur + '"' + (i === 0 ? ' checked' : '') + (off ? ' disabled' : '') + '>' +
          '<span>' + c.libelle + '</span></label>';
      }).join("") +
      '</div>' +
      '<div class="confirm-boutons cs-pied">' +
      '<button type="button" class="c-annuler cs-annuler">Annuler</button>' +
      '<button type="button" class="c-ok cs-ok">OK</button>' +
      '</div>';
    document.body.appendChild(overlay);
    document.body.appendChild(pop);
    var fini = false;
    function nettoyer() {
      fini = true;
      overlay.remove(); pop.remove();
      if (popFermerActuel === annuler) popFermerActuel = null;
      if (popValiderActuel === valider) popValiderActuel = null;
    }
    function annuler() { if (fini) return; nettoyer(); if (opts.onAnnuler) opts.onAnnuler(); }
    function valider() {
      if (fini) return;
      var coche = pop.querySelector('input[name="porteeSerie"]:checked');
      nettoyer();
      callback(coche ? coche.value : "unique");
    }
    overlay.addEventListener("pointerdown", annuler);
    pop.querySelector(".cs-annuler").addEventListener("click", annuler);
    pop.querySelector(".cs-ok").addEventListener("click", valider);
    // Double clic sur un choix = choisir et valider d'un coup.
    pop.querySelectorAll(".cs-choix input").forEach(function (r) { r.addEventListener("dblclick", valider); });
    popFermerActuel = annuler;
    popValiderActuel = valider;
    var premier = pop.querySelector('input[name="porteeSerie"]');
    if (premier) premier.focus();
  }
  function serieChampsHTML() {
    return '<label class="chk"><input type="checkbox" class="f-serie"> Série (se répète)</label>' +
      '<div class="serie-options" hidden>' +
      '<div class="label-champ">Fréquence</div>' +
      '<div class="serie-intervalle-row">Tous les ' +
      '<input type="number" class="serie-intervalle" min="1" max="365" value="1"> ' +
      '<select class="serie-unite">' +
      '<option value="jour">jour(s)</option>' +
      '<option value="semaine" selected>semaine(s)</option>' +
      '<option value="mois">mois</option>' +
      '<option value="annee">année(s)</option>' +
      '</select></div>' +
      '<div class="chip-row serie-fin-row">' +
      '<button type="button" class="chip sub actif" data-fin="occurrences">Nombre de répétitions</button>' +
      '<button type="button" class="chip sub" data-fin="date">Jusqu’à une date</button>' +
      '</div>' +
      '<label class="chk-ligne serie-ligne-nb">Répétitions (dont celle-ci) <input type="number" class="serie-nb" min="2" max="366" value="4"></label>' +
      '<label class="chk-ligne serie-ligne-date" hidden>Se termine le <input type="date" class="serie-date"></label>' +
      '</div>';
  }
  // Round D — bandeau affiché à la place de serieChampsHTML() dans la fiche
  // d'un item qui est DÉJÀ en série (cf. commentaire CSS .serie-info-existante
  // ci-dessus) : rend visible, avant même de cliquer "Enregistrer", que la
  // modification proposera un choix de portée.
  function serieInfoExistanteHTML() {
    return '<div class="serie-info-existante"><span class="icone-serie">↻</span><span>Événement récurrent. En enregistrant ou en supprimant, un choix sera proposé : cet événement, cet événement et les suivants, ou tous les événements.</span></div>';
  }
  // Renvoie une fonction lireChoixSerie() -> null (pas coché) ou
  // {frequence, intervalle, finType, finValeur} — finValeur est un ISO
  // (finType="date") ou un entier (finType="occurrences"), prêt pour
  // apiEnregistrerSerie.
  function cablerSerieChamps(pop, isoBase) {
    var chk = pop.querySelector(".f-serie");
    if (!chk) return function () { return null; };
    var options = pop.querySelector(".serie-options");
    var ligneNb = pop.querySelector(".serie-ligne-nb");
    var ligneDate = pop.querySelector(".serie-ligne-date");
    var dateInput = pop.querySelector(".serie-date");
    var intervalleInput = pop.querySelector(".serie-intervalle");
    var uniteSelect = pop.querySelector(".serie-unite");
    var finActuel = "occurrences";
    chk.addEventListener("change", function () { options.hidden = !chk.checked; });
    var JOURS_DEFAUT_PAR_OCCURRENCE = { jour: 3.5, semaine: 7, mois: 30, annee: 365 };
    var OCCURRENCES_DEFAUT = 4;
    function majDateDefaut() {
      var freq = uniteSelect.value;
      var intervalle = Math.max(1, parseInt(intervalleInput.value, 10) || 1);
      var d = new Date((isoBase || isoDeDate(new Date())) + "T00:00:00");
      d.setDate(d.getDate() + Math.round((JOURS_DEFAUT_PAR_OCCURRENCE[freq] || 7) * intervalle * OCCURRENCES_DEFAUT));
      dateInput.value = isoDeDate(d);
    }
    intervalleInput.addEventListener("input", majDateDefaut);
    uniteSelect.addEventListener("change", majDateDefaut);
    pop.querySelectorAll(".serie-fin-row .chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        pop.querySelectorAll(".serie-fin-row .chip").forEach(function (b) { b.classList.remove("actif"); });
        btn.classList.add("actif");
        finActuel = btn.dataset.fin;
        ligneNb.hidden = finActuel !== "occurrences";
        ligneDate.hidden = finActuel !== "date";
      });
    });
    majDateDefaut();
    return function lireChoixSerie() {
      if (!chk.checked) return null;
      var freq = uniteSelect.value;
      var intervalle = Math.max(1, Math.min(365, parseInt(intervalleInput.value, 10) || 1));
      if (finActuel === "date") return { frequence: freq, intervalle: intervalle, finType: "date", finValeur: dateInput.value || isoBase };
      var n = Math.max(2, Math.min(366, parseInt(pop.querySelector(".serie-nb").value, 10) || 4));
      return { frequence: freq, intervalle: intervalle, finType: "occurrences", finValeur: n };
    };
  }
  // Applique la réponse d'une API "série" (enregistrer-serie/gerer-serie,
  // étape 4 du §6bis, migration hors Google) : contrairement aux anciennes
  // apiEnregistrerSerie/apiModifierSerie/apiSupprimerSerie (WebApp.gs), ces
  // deux Edge Functions ne renvoient plus la semaine affichée rafraîchie ni
  // la liste des semaines touchées ({semaine, semainesTouchees}) — une série
  // peut de toute façon poser des occurrences n'importe où dans le temps
  // (plus de plafond "5 semaines créées", cf. genererSemaines côté client,
  // étape 2) : borner le rechargement à "les semaines touchées" n'aurait
  // plus de sens. On oublie tout le cache et on recharge simplement la
  // fenêtre affichée — même filet que la synchronisation (cf. synchroniser()
  // juste au-dessus), le paramètre `r` n'est donc plus utilisé ici.
  function apresEcritureSerie() {
    oublierCache();
    assurerFenetreChargee(function () {
      construireVueDepuisCache();
      render(false);
    });
  }
  function labGCourant() { return etat.semaines[etat.indexSemaine].labG; }

