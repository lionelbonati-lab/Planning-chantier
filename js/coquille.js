"use strict";
  /* ============================================================
     COQUILLE DE NAVIGATION — 9 pages + routage #app.innerHTML.
     Round du 12.09.2026 — Lionel (mockup validé, « Option 2 — onglets ») :
     remplace l'ancienne sidebar à repli automatique (portée depuis
     prototype-bulles.html, §2 de v3-inventory.md) par une barre d'onglets
     horizontale, toujours visible, IDENTIQUE sur les 9 pages — plus de
     bouton ☰ ni de panneau qui s'ouvre par-dessus le contenu. Les 5 pages
     de réglages (Général/Chantiers/Statuts/Fériés/Entrée rapide) restent
     de simples onglets, SANS distinction visuelle avec les 4 premiers —
     Lionel (round du 22.09.2026, suite ×5) : « je ne veux pas 2 types
     d'onglets » (le retrait visuel .secondaire d'origine est retiré, cf. plus
     bas et style.css).
     Construite UNE SEULE FOIS après le premier apiDemarrer() réussi (cf.
     demarrer()). #progress/#toast restent EN DEHORS de #app (déjà correct,
     non touché ici — cf. body plus bas dans le fichier).
     ============================================================ */
  function construireCoquille() {
    app.innerHTML =
      '<div class="app-shell">' +
        '<nav class="onglets-nav" id="ongletsNav">' +
          '<div class="marque-nav"><img src="icons/icon-32.png" width="28" height="28" alt="Planning Chantiers"></div>' +
          '<div class="onglets-liste">' +
            '<button type="button" class="onglet actif" data-page="planning" title="Planning">' + ICONS.calendar + '<span class="onglet-nom">Planning</span></button>' +
            '<button type="button" class="onglet" data-page="jalons" title="Jalons">' + ICONS.flag + '<span class="onglet-nom">Jalons</span></button>' +
            // Suite 65 — Lionel : « Ajoute un onglet note entre jalon et
            // personnel. » (js/page-notes.js)
            '<button type="button" class="onglet" data-page="notes" title="Notes">' + ICONS.note + '<span class="onglet-nom">Notes</span></button>' +
            '<button type="button" class="onglet" data-page="personnel" title="Personnel">' + ICONS.people + '<span class="onglet-nom">Personnel</span></button>' +
            '<button type="button" class="onglet" data-page="intervenants" title="Intervenants">' + ICONS.hardhat + '<span class="onglet-nom">Intervenants</span></button>' +
            '<button type="button" class="onglet" data-page="chantiers" title="Chantiers">' + ICONS.building + '<span class="onglet-nom">Chantiers</span></button>' +
            '<button type="button" class="onglet" data-page="statuts" title="Statuts">' + ICONS.tag + '<span class="onglet-nom">Statuts</span></button>' +
            '<button type="button" class="onglet" data-page="horaires" title="Horaires">' + ICONS.clock + '<span class="onglet-nom">Horaires</span></button>' +
            '<button type="button" class="onglet" data-page="entree-rapide" title="Entrée rapide">' + ICONS.bolt + '<span class="onglet-nom">Entrée rapide</span></button>' +
          '</div>' +
          // Suite 63 — Lionel : « Le menu setting vient se placer à la place
          // du menu principal en haut de l'écran quand badge activé. Même
          // format visuel que le menu principal et même comportement. Une
          // croix fermer pour refermer le menu. » Les pages de réglages ont
          // leur propre rangée d'onglets (mêmes .onglet, même passage en
          // icônes seules quand ils ne tiennent pas), affichée à la place de
          // la rangée principale tant qu'une page de réglages est ouverte
          // (.app-shell.mode-reglages, cf. afficherPage) ; la croix prend la
          // place de la pastille et ramène à la page quittée.
          '<div class="onglets-liste onglets-reglages" id="ongletsReglages" aria-label="Réglages">' + htmlOngletsReglages_(false) + '</div>' +
          // Suite 61 : la pastille ouvre les réglages au lieu de déconnecter
          // directement (« Se déconnecter » est dans Mon compte).
          '<button type="button" class="avatar-nav" id="lienDeconnexionNav" title="Compte et réglages" aria-label="Compte et réglages">L</button>' +
          '<button type="button" class="fermer-reglages" id="btnFermerReglages" title="Fermer les réglages (Échap)" aria-label="Fermer les réglages">' + ICONS.close + '</button>' +
        '</nav>' +
        '<div class="app-main">' +
          htmlPagePlanning() + htmlPageJalons() + htmlPageNotes() + htmlPagePersonnel() + htmlPageIntervenants() +
          htmlPageChantiers() + htmlPageStatuts() + htmlPageEntreeRapide() + htmlPageHoraires() + htmlPageMiseEnPage() +
          htmlPagesReglages() +
        '</div>' +
        // §91 (round du 22.09.2026, suite) — Lionel, mockup mockup-nav-mobile.html
        // validé (croquis Google Sheets à l'appui : « j'aime bien la
        // présentation de Google sheet [...] en bas la bar d'onglets. en
        // haut la toolbar. ») : barre basse REMPLAÇANT .onglets-nav sur
        // téléphone (masquée par défaut, cf. style.css — desktop/tablette
        // gardent .onglets-nav telle quelle, INCHANGÉE, rien ici ne les
        // affecte). #switcherBtn réutilise le même mécanisme d'icône/libellé
        // que le mockup (mis à jour à chaque changement de page, cf.
        // cablerNavigation) ; #switcherPanneau reprend les 9 mêmes boutons
        // .onglet que la barre du haut (même data-page, classe .switcher-item
        // en plus pour leur habillage "liste" propre au panneau) — un SEUL
        // querySelectorAll(".onglet") dans cablerNavigation câble donc les 18
        // boutons (9 du haut + 9 d'ici) d'un coup, et les garde synchronisés
        // (cf. son commentaire). position:fixed sur .nav-bas (cf.
        // style-mobile.css) : #app reste le seul conteneur qui défile
        // (cf. son commentaire plus haut dans ce fichier), rien d'autre dans
        // l'arbre ne porte transform/filter/perspective qui piégerait un
        // position:fixed — vérifié avant ce round.
        '<div class="nav-bas" id="navBas">' +
          '<button type="button" class="switcher-btn" id="switcherBtn" aria-label="Changer de page">' +
            '<span id="switcherIcone">' + ICONS.calendar + '</span>' +
            '<span class="nom" id="switcherNom">Planning</span>' +
            '<span class="caret">▾</span>' +
          '</button>' +
          // « À réserver » dans la barre du bas (round du 25.09.2026, suite 53
          // — Lionel : « A réservé pourrait être placer sur la barre du bas
          // en mode mobile. ») : icône + compteur, de toutes les pages ; sur
          // téléphone, il ne figure plus dans la barre d'outils du planning
          // (cf. js/a-reserver.js, style-mobile.css).
          '<button type="button" class="nav-bas-a-reserver" id="btnAReserverNavBas" title="À réserver" aria-label="À réserver" hidden>' + ICONS.reserver + '<span class="compte-a-reserver" hidden></span></button>' +
          '<button type="button" class="avatar-nav" id="lienDeconnexionNavBas" title="Compte et réglages" aria-label="Compte et réglages">L</button>' +
          '<button type="button" class="fermer-reglages" id="btnFermerReglagesBas" title="Fermer les réglages" aria-label="Fermer les réglages">' + ICONS.close + '</button>' +
          '<div class="switcher-panneau" id="switcherPanneau">' +
            // Suite 63 : même bascule que la barre du haut — en réglages, la
            // liste « Pages » cède la place à la liste « Réglages ».
            '<div class="switcher-groupe switcher-groupe-reglages"><div class="switcher-titre">Réglages</div>' + htmlOngletsReglages_(true) + '</div>' +
            '<div class="switcher-groupe switcher-groupe-pages">' +
            '<div class="switcher-titre">Pages</div>' +
            '<button type="button" class="onglet switcher-item actif" data-page="planning">' + ICONS.calendar + 'Planning</button>' +
            '<button type="button" class="onglet switcher-item" data-page="jalons">' + ICONS.flag + 'Jalons</button>' +
            '<button type="button" class="onglet switcher-item" data-page="notes">' + ICONS.note + 'Notes</button>' +
            '<button type="button" class="onglet switcher-item" data-page="personnel">' + ICONS.people + 'Personnel</button>' +
            '<button type="button" class="onglet switcher-item" data-page="intervenants">' + ICONS.hardhat + 'Intervenants</button>' +
            '<button type="button" class="onglet switcher-item" data-page="chantiers">' + ICONS.building + 'Chantiers</button>' +
            '<button type="button" class="onglet switcher-item" data-page="statuts">' + ICONS.tag + 'Statuts</button>' +
            '<button type="button" class="onglet switcher-item" data-page="horaires">' + ICONS.clock + 'Horaires</button>' +
            '<button type="button" class="onglet switcher-item" data-page="entree-rapide">' + ICONS.bolt + 'Entrée rapide</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    cablerNavigation();
    // Onglets du haut : icônes seules quand ils ne tiennent pas (suite 53).
    ajusterOngletsNav();
    window.addEventListener("resize", ajusterOngletsNav);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajusterOngletsNav);
    cablerPagePlanning();
    cablerAReserver();
    cablerPageSauvegardes();
    cablerPageRaccourcis();
    cablerPageNotes();
    cablerPageCompte();
    cablerPageEntreeRapide();
    cablerPageFeries();
    cablerPageHoraires();
    cablerPageMiseEnPage();
    // §80 : le lien flottant (position:fixed, cf. afficherLienDeconnexion) ne
    // sert plus qu'à la fenêtre entre connexion et 1er rendu — la vraie
    // coquille étant maintenant construite, il devient redondant avec le
    // bouton juste posé dans la barre d'onglets ci-dessus.
    var flottant = document.getElementById("lienDeconnexion");
    if (flottant) flottant.remove();
    // §91 — 2 pastilles coexistent (barre du haut, masquée sur téléphone +
    // barre basse, visible seulement là). Suite 63 : elles ouvrent toutes
    // deux les réglages, les 2 croix les referment (cablerReglages).
    cablerReglages();
  }

  /* ---- Menu du compte et pages de réglages — round du 26.09.2026 (suite 61)
     Lionel : « Mettre les réglages de l'onglet "Général" dans le pastille
     de déconnexion. Une page par type de réglage. y mettre les raccourcis
     claviers. ôter l'onglet général. »
     La pastille « L » (en haut sur ordinateur/tablette, en bas sur
     téléphone) ouvre un petit menu : Affichage, Couleurs, Raccourcis
     clavier, Sauvegardes (puis Mon compte et Mise en page d'impression,
     ajoutées dans la même suite), puis Se déconnecter. Chaque entrée ouvre sa page
     (#page-affichage, #page-couleurs, #page-raccourcis, #page-sauvegardes),
     avec en haut une rangée pour passer d'une page de réglages à l'autre.
     L'onglet Général et sa page ont disparu : le week-end est dans
     Affichage, le thème et « Personnaliser » dans Couleurs, les sauvegardes
     dans Sauvegardes, rien d'autre n'y était.
     Suite 63 (même jour) : plus de petit menu ni de rangée dans chaque
     page — la pastille fait basculer la barre d'onglets elle-même sur les
     réglages (en haut, et dans la liste du sélecteur du bas sur
     téléphone), une croix à la place de la pastille la referme. */
  // « Mon compte » (même suite, message suivant de Lionel) : « Ajouter une
  // page info personnel, pour entrée ses donnée comme Nom, Prénom,
  // Entreprise, modification du mot de passe, suppression du compte et
  // déconnexion. a mettre dans le menu setup » — cf. js/page-compte.js.
  var PAGES_REGLAGES = [
    { page: "compte", nom: "Mon compte", court: "Compte", icone: "personne" },
    { page: "affichage", nom: "Affichage", icone: "affichage" },
    { page: "couleurs", nom: "Couleurs", icone: "palette" },
    // Lionel, pendant la même suite : « Mise en page impression passe
    // aussi dans le menu réglage » — l'onglet Mise en page est retiré.
    { page: "mise-en-page", nom: "Mise en page d’impression", court: "Impression", icone: "miseEnPage" },
    { page: "raccourcis", nom: "Raccourcis clavier", court: "Raccourcis", icone: "clavier" },
    { page: "sauvegardes", nom: "Sauvegardes", icone: "sauvegarde" }
  ];
  function pageReglage_(nom) { return PAGES_REGLAGES.filter(function (r) { return r.page === nom; })[0] || null; }
  // Onglets des réglages (suite 63) : mêmes .onglet que la rangée
  // principale, câblés avec elle (cablerNavigation, data-page). Barre du
  // haut : icône + nom (.onglet-nom, masqué en mode compact) ; liste du bas
  // (téléphone) : lignes .switcher-item.
  function htmlOngletsReglages_(bas) {
    return PAGES_REGLAGES.map(function (r) {
      return bas
        ? '<button type="button" class="onglet switcher-item" data-page="' + r.page + '">' + ICONS[r.icone] + r.nom + '</button>'
        : '<button type="button" class="onglet" data-page="' + r.page + '" title="' + r.nom + '">' + ICONS[r.icone] + '<span class="onglet-nom">' + r.nom + '</span></button>';
    }).join("");
  }
  function htmlPagesReglages() {
    return '<div class="page page-reglages" id="page-compte"><div class="page-scroll">' + htmlContenuPageCompte() + '</div></div>' +
      '<div class="page page-reglages" id="page-affichage"><div class="page-scroll">' +
        // Suite 62 — Lionel : « Ajouter d'autre options d'affichages avec
        // aperçu. » Contenu, aperçu et câblage : js/page-affichage.js.
        htmlContenuPageAffichage() +
      '</div></div>' +
      // Couleurs (suite 23.09 puis 54, js/page-couleurs.js) : liste
      // « Thème », « Personnaliser », et les palettes enregistrées (suite 61).
      '<div class="page page-reglages" id="page-couleurs"><div class="page-scroll">' +
        '<div class="page-titre"><h1>Couleurs</h1></div>' +
        '<p class="page-sous">Couleurs du planning, les mêmes sur tous les appareils du compte.</p>' +
        htmlReglagesCouleurs() +
      '</div></div>' +
      // Raccourcis clavier (suite 61, js/raccourcis.js).
      '<div class="page page-reglages" id="page-raccourcis"><div class="page-scroll">' +
        '<div class="page-titre"><h1>Raccourcis clavier</h1><button type="button" class="lien-reset-tout" id="btnRaccourcisDefaut" hidden>Tout rétablir</button></div>' +
        '<p class="page-sous">Touches du clavier et boutons de la souris d’un ordinateur, les mêmes sur tous les appareils du compte. « + » puis la combinaison voulue (ou le bouton du milieu, précédent, suivant de la souris) pour en ajouter une, « × » pour la retirer, « ↺ » pour revenir aux touches d’origine.</p>' +
        '<div id="listeRaccourcis"></div>' +
      '</div></div>' +
      // Sauvegardes (round du 25.09.2026, suite 49 — js/page-sauvegardes.js,
      // sql/0017_sauvegardes.sql). Lionel, proposition 14 : « Sauvegarde
      // automatique [...] pour pouvoir revenir en arrière après une grosse
      // erreur. »
      '<div class="page page-reglages" id="page-sauvegardes"><div class="page-scroll">' +
        '<div class="page-titre bloc-sauvegardes"><h1>Sauvegardes</h1>' +
        '<div class="actions-feries">' +
          '<button type="button" class="btn-calculer" id="btnImporterSauvegarde">Importer un fichier…</button>' +
          '<button type="button" class="btn-enregistrer" id="btnSauvegarderMaintenant">Sauvegarder maintenant</button>' +
          '<input type="file" id="fichierSauvegarde" accept=".json,application/json" hidden>' +
        '</div></div>' +
        '<p class="page-sous">Tout le planning (tâches, jalons, notes, personnes, chantiers, horaires, réglages…) est copié chaque nuit, si quelque chose a changé ; les 30 dernières copies sont gardées. « Restaurer » remplace tout le planning par une copie, après avoir sauvegardé l’état actuel. « Télécharger » en garde un fichier sur cet appareil.</p>' +
        '<div class="liste-intervenants" id="listeSauvegardes"></div>' +
      '</div></div>';
  }
  // Pages quittées de part et d'autre (suite 63) : la pastille rouvre la
  // dernière page de réglages vue (Mon compte la première fois), la croix
  // ramène à la page principale d'où l'on venait (Planning par défaut).
  var dernierReglage_ = null, dernierePagePrincipale_ = "planning";
  function reglagesOuverts() {
    var shell = document.querySelector(".app-shell");
    return !!(shell && shell.classList.contains("mode-reglages"));
  }
  function ouvrirReglages() { afficherPage(dernierReglage_ || PAGES_REGLAGES[0].page); }
  // true si les réglages étaient ouverts (Échap, cf. formulaires-communs.js).
  function fermerReglages() {
    if (!reglagesOuverts()) return false;
    afficherPage(dernierePagePrincipale_);
    return true;
  }
  function cablerReglages() {
    ["lienDeconnexionNav", "lienDeconnexionNavBas"].forEach(function (id) {
      var avatar = document.getElementById(id);
      if (avatar) avatar.addEventListener("click", function (e) { e.stopPropagation(); fermerSwitcherPages(); ouvrirReglages(); });
    });
    ["btnFermerReglages", "btnFermerReglagesBas"].forEach(function (id) {
      var croix = document.getElementById(id);
      if (croix) croix.addEventListener("click", function (e) { e.stopPropagation(); fermerSwitcherPages(); fermerReglages(); });
    });
    // Nom, adresse et initiale du compte connecté (js/page-compte.js).
    chargerInfosCompte();
  }

  function htmlPagePlanning() {
    return '<div class="page actif" id="page-planning"><div class="page-scroll"><div class="wrap">' +
      // Round du 12.09.2026 — le titre "Planning à bulles" + son paragraphe
      // d'aide avaient déjà disparu (retour de Lionel sur croquis, « encadré
      // rouge » inutile). Le bouton ☰ qui avait ensuite pris leur place ici
      // disparaît à son tour avec la sidebar qu'il ouvrait : la navigation
      // passe en onglets, toujours visibles, cf. construireCoquille(). Plus
      // rien à mettre dans un <header> propre à cette page — la légende
      // devient directement le 1er élément de .wrap.
      //
      // §83 (round du 16.09.2026, encore un autre, suite×7) — Lionel, mockup
      // mockup-sous-menu-outils.html à l'appui, « toolbar et menu ok » :
      // .toolbar-sheets remplace .legende-barre — UNE seule barre façon
      // Sheets sous les onglets, qui regroupe désormais Annuler/Refaire
      // (ex-.barre-undo, ex-cellule coin de la grille), Imprimer (déjà ici),
      // le chantier par défaut (ex-clic sur un swatch de #legende, cf.
      // construireSelectChantier) et les 4 icônes masquer/afficher
      // (ex-.btn-affichage texte du §82). La légende des chantiers
      // elle-même disparaît (Lionel : « on ne réaffiche pas la légende des
      // chantiers ») — tout ce groupe est STATIQUE, câblé une seule fois
      // (cf. cablerPagePlanning), seul son apparence (chantier choisi,
      // icônes actives/désactivées) est resynchronisée à chaque rendu (cf.
      // construireSelectChantier/majControlesAffichage).
      //
      // §85 (round du 17.09.2026) — Lionel, mockup mockup-sous-menu-outils.html
      // à l'appui : « on peut aussi enlever le "+" des lignes personnel et
      // intervenant. Ajouter une icone "ligne +" dans la tool bar [...] ainsi
      // qu'une icone "+" pour rajouter un élément au planning [...] Proposer
      // une case de zoom comme sur sheet », puis « place le zoom entre
      // impression et chantier ». 3 ajouts à cette même barre STATIQUE :
      // #zoomCtrl (entre Imprimer et le chantier), #menuAjoutLigne
      // (Personnel/Intervenant, remplace le "+" retiré de ligneSection) et
      // #menuAjoutElement (Tâche/Absence/Note/Jalon, avec une 2e page "pour
      // qui ?" pour Tâche/Absence) — cf. cablerPagePlanning pour tout le
      // câblage (générique aux 3 .outil-menu) et ouvrirAjoutElementBarre.
      // §91 (round du 22.09.2026, suite) — Lionel, mockup mockup-nav-mobile.html
      // validé (« c'est ok pour moi, la toolbar par contre est à retailler
      // on gardera les "tools" principaux sur la barre et le reste sera
      // dans un menu 3points à droite », puis « chantier visible mais
      // seulement la pastille de couleur. annuler/refaire dans la barre. ») :
      // PORT du mockup dans le vrai fichier. Cette même barre STATIQUE
      // (desktop/tablette INCHANGÉE au pixel près, cf. plus bas) se retaille
      // sur téléphone (cf. style-mobile.css) — restent visibles Annuler/
      // Refaire, la navigation semaine, le chantier (réduit à sa pastille,
      // simple CSS sur .select-chantier-btn — .nom-chantier/.caret restent
      // dans le HTML, juste masqués) et le "+" ; tout le reste (Imprimer,
      // Zoom, 2 semaines, Ajouter une ligne, les 4 icônes masquer/afficher)
      // rejoint le panneau "⋮" (#btnPlusOutils/#toolbarSecondaire plus bas).
      //
      // TECHNIQUE — refonte du round du 24.09.2026 (suite 3), Lionel :
      // « Mode normal, modifier l'ordre des éléments afin de rendre logique
      // le déplacement dans le menu 3 points -> annuler/refaire | imprimer |
      // Chantier | navigation semaines | Zoom | Insertions | Masquages » et
      // « En réduisant la largeur d'écran, placer un groupe d'élément dans le
      // menu 3 points quand il sort de la tool barre ». Remplace le montage
      // du §91/§106 (display:contents + `order`, puis TOUT le lot basculé
      // d'un coup dans le panneau par .toolbar-compacte) : ce montage ne
      // pouvait pas replier les groupes UN PAR UN, #toolbarSecondaire étant
      // soit entièrement "transparent" (display:contents), soit entièrement
      // un panneau.
      //
      // Désormais chaque groupe repliable est un vrai enfant de la barre OU
      // du panneau, déplacé physiquement (appendChild/insertBefore) par
      // ajusterDebordementToolbar() (grille-rendu.js) — toujours les MÊMES
      // éléments (mêmes id, câblage de cablerPagePlanning/majControlesAffichage/
      // majZoomAffichage/majSemaineAffichage inchangé : un listener suit son
      // élément quand il change de parent), donc jamais 2 copies à tenir
      // synchronisées. Deux rangs par groupe :
      //   data-rang       place dans la barre (ordre de Lionel ci-dessus) ;
      //   data-rang-menu  place dans le panneau "⋮" (Lionel : « Imprimer >
      //                   Zoom > Navigation semaine > Affichage 1 ou 2
      //                   semaine > Masquages »), différent de la barre
      //                   (Zoom y passe AVANT la navigation).
      // Le DOM suit toujours l'ordre visuel (insertion au bon rang, plus
      // aucun `order` CSS côté desktop) — ce qui permet aux séparateurs
      // d'être portés par les groupes eux-mêmes (.sep-avant, un ::before en
      // CSS) et de partir avec eux dans le panneau au lieu de rester
      // orphelins dans la barre.
      //
      // Toujours dans la barre (jamais repliés, Lionel : « mode compact,
      // sur la barre, annuler/refaire | Chantier | Insertions », plus
      // "Aujourd'hui" qu'il veut « Toujours sur la barre ») : Annuler/Refaire,
      // Chantier, Aujourd'hui, Ajouter une ligne + "+". Ordre de repli :
      // Zoom d'abord (round du 24.09.2026, suite 10 — Lionel : « c'est la
      // moins utilisé des fonctions »), puis Masquages, Navigation
      // (+ 2 semaines), Imprimer — cf. REPLIS_ORDRE, js/grille-rendu.js.
      // Téléphone (≤600px) : barre inchangée (Lionel : « Menu ⋮ seulement »),
      // tout le reste — Ajouter une ligne compris — toujours dans le panneau.
      '<div class="toolbar-sheets" id="legendeBarre">' +
        '<div class="toolbar-groupe" id="groupeAnnulerRefaire" data-rang="10">' +
          '<button type="button" class="toolbar-btn" id="btnDefaire" title="Annuler (Ctrl+Z)" aria-label="Annuler">' + ICONS.undo + '</button>' +
          '<button type="button" class="toolbar-btn" id="btnRefaire" title="Refaire (Ctrl+Y)" aria-label="Refaire">' + ICONS.redo + '</button>' +
        '</div>' +
        '<div class="toolbar-groupe sep-avant" id="groupeImprimer" data-rang="20" data-rang-menu="10">' +
          '<button type="button" class="toolbar-btn" id="btnImprimerTitre" title="Imprimer — aperçu et export PDF de la semaine affichée">' + ICONS.print + '<span class="toolbar-btn-label">Imprimer</span></button>' +
        '</div>' +
        // Chantier par défaut (§91 : toujours visible). .nom-chantier/.caret
        // restent dans le HTML même sur téléphone (construireSelectChantier
        // les cible à chaque rendu), seul leur affichage y change
        // (style-mobile.css). Habillage "pilule" comme Zoom/Sem. N et largeur
        // fixe de 25 caractères, cf. .select-chantier-btn dans style.css.
        // Résumé « À réserver » (round du 25.09.2026, suite 47 — Lionel :
        // « Un résumé facilement accessible des statuts à réserver ») :
        // icône + compteur dans la barre ; replié dans « ⋮ » (avec son
        // libellé) seulement quand la place manque, après Zoom et Masquages
        // (cf. REPLIS_ORDRE, grille-rendu.js) ; toujours dans la barre sur
        // téléphone. Cf. js/a-reserver.js.
        '<div class="toolbar-groupe sep-avant" id="groupeAReserver" data-rang="25" data-rang-menu="15" hidden>' +
          '<button type="button" class="toolbar-btn" id="btnAReserver" title="À réserver">' + ICONS.reserver + '<span class="toolbar-btn-label">À réserver</span><span class="compte-a-reserver" hidden></span></button>' +
        '</div>' +
        '<div class="toolbar-groupe sep-avant" id="groupeChantier" data-rang="30">' +
          '<div class="select-chantier" id="selectChantier">' +
            '<button type="button" class="select-chantier-btn" id="btnSelectChantier"><span class="swatch"></span><span class="nom-chantier">Chantier</span><span class="caret">▾</span></button>' +
            '<div class="select-chantier-panneau" id="panneauChantier"></div>' +
          '</div>' +
        '</div>' +
        // "Aujourd'hui" — hors de la navigation (qui se replie) : Lionel,
        // téléphone, round du 23.09.2026 (suite 13), « "Aujourd'hui" doit
        // rester dans la tool bar », confirmé pour desktop/tablette ce round
        // (« Toujours sur la barre »). Collé juste AVANT la navigation (pas
        // de séparateur entre les deux, cf. #groupeNavSemaine sans
        // .sep-avant) pour se lire comme un seul bloc "📅 ‹ Sem. N ›" tant
        // que la navigation est dans la barre.
        // #btnCalendrierBarre (round du 24.09.2026, suite 15 — Lionel :
        // « Cette icône calendrier sera aussi affichée dans la toolbar à
        // côté de aujourd'hui ») : d'abord au téléphone seulement, puis
        // partout (suite 16 — Lionel : « oui, ajoute aussi l'icône sur
        // ordinateur et tablette ») : là, la date choisie amène sa semaine
        // (allerAuJour, js/grille-rendu.js). Seul calendrier depuis la
        // suite 17 — Lionel : « Sur mobile, le calendrier se retrouve dans
        // la toolbar et dans le menu 3 points. L'enlever du menu 3 points ».
        '<div class="toolbar-groupe sep-avant" id="groupeAujourdhui" data-rang="40">' +
          '<button type="button" class="toolbar-btn" id="btnAujourdhui" title="Aller à aujourd’hui" aria-label="Aller à aujourd’hui">' + ICONS.aujourdhui + '</button>' +
          '<span class="toolbar-btn btn-calendrier" id="btnCalendrierBarre" title="Choisir un jour dans le calendrier">' + ICONS.choisirJour +
            '<input type="date" class="date-picker-jour" aria-label="Choisir un jour dans le calendrier">' +
          '</span>' +
        '</div>' +
        // Navigation semaine + "Afficher 2 semaines" collé derrière (Lionel :
        // « Collé à la navigation ») — un SEUL groupe, replié d'un bloc. Dans
        // le panneau : 1re ligne "‹ Sem. N ›" seule (Lionel : « placer "<"
        // N° semaine ">" sur la même ligne, plus de texte semaine précédente
        // et semaine suivante », puis « pas d'intitulé semaine »), calée à
        // droite sous les contrôles de la ligne Zoom, puis "Afficher 2
        // semaines" sur sa propre ligne en dessous. #btnVueJourMobile
        // ("1 semaine", round du 23.09.2026 suite 4) remplace #btnDeuxSemaines
        // sur téléphone seulement (échange en CSS, cf. style-mobile.css).
        // Round du 24.09.2026 (suite 15) — Lionel : « Dans le menu 3 point
        // sur mobile, en mode un jour, la navigation par semaine doit être
        // remplacée par la date du jour aller sélectionner une autre date
        // dans le calendrier », puis « tu ajoutes une icône calendrier où on
        // pourra sélectionner un jour, sur la même ligne que le bouton
        // afficher une semaine [...] 1 semaine seulement l'icône ».
        // .ligne-vue-mobile (téléphone seulement) : "1 semaine" réduit à
        // son icône. Round du 24.09.2026 (suite 17) — Lionel : « L'enlever
        // du menu 3 points [le calendrier] [...] Remettre dans le menu 3
        // points l'affichage et le défilement des semaines comme avant » :
        // plus d'icône calendrier ici (celle de la barre suffit), et
        // "‹ Sem. N ›" reste affiché en vue "1 jour" comme en vue
        // "1 semaine".
        '<div class="toolbar-groupe" id="groupeNavSemaine" data-rang="50" data-rang-menu="30">' +
          '<div class="nav-semaine-ligne">' +
            '<button type="button" class="toolbar-btn" id="btnSemainePrec" title="Semaine précédente" aria-label="Semaine précédente">' + ICONS.chevronGauche + '</button>' +
            '<div class="outil-menu" id="menuSemaine">' +
              '<button type="button" class="zoom-pill" id="btnSemainePill" title="Aller à une semaine">Sem. ▾</button>' +
              '<div class="outil-menu-panneau semaine-panneau" id="panneauSemaine"></div>' +
            '</div>' +
            '<button type="button" class="toolbar-btn" id="btnSemaineSuiv" title="Semaine suivante" aria-label="Semaine suivante">' + ICONS.chevronDroite + '</button>' +
          '</div>' +
          '<button type="button" class="toolbar-btn" id="btnDeuxSemaines" title="Afficher 2 semaines à la fois" aria-label="Afficher 2 semaines à la fois">' + ICONS.deuxSemaines + '<span class="toolbar-btn-label">Afficher 2 semaines</span><span class="toolbar-btn-coche">✓</span></button>' +
          '<div class="ligne-vue-mobile">' +
            '<button type="button" class="toolbar-btn" id="btnVueJourMobile" title="Afficher la semaine complète" aria-label="Afficher la semaine complète" aria-pressed="false">' + ICONS.semaineMobile + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="toolbar-groupe sep-avant" id="groupeZoom" data-rang="60" data-rang-menu="20">' +
          '<div class="zoom-ctrl" id="zoomCtrl">' +
            '<span class="libelle-panneau">Zoom</span>' +
            '<button type="button" class="zoom-btn" id="zoomMoins" title="Zoom arrière" aria-label="Zoom arrière">−</button>' +
            '<div class="outil-menu" id="menuZoom">' +
              '<button type="button" class="zoom-pill" id="btnZoom">100% ▾</button>' +
              '<div class="outil-menu-panneau zoom-panneau" id="panneauZoom">' +
                '<button type="button" class="outil-menu-item" data-zoom="75">75%</button>' +
                '<button type="button" class="outil-menu-item" data-zoom="90">90%</button>' +
                '<button type="button" class="outil-menu-item" data-zoom="100">100%</button>' +
                '<button type="button" class="outil-menu-item" data-zoom="110">110%</button>' +
                '<button type="button" class="outil-menu-item" data-zoom="125">125%</button>' +
                '<button type="button" class="outil-menu-item" data-zoom="150">150%</button>' +
              '</div>' +
            '</div>' +
            '<button type="button" class="zoom-btn" id="zoomPlus" title="Zoom avant" aria-label="Zoom avant">+</button>' +
          '</div>' +
        '</div>' +
        // Insertions : "Ajouter une ligne" puis "+" collé derrière (pas de
        // séparateur entre les 2), toujours dans la barre sur desktop/
        // tablette. Sur téléphone, "Ajouter une ligne" rejoint le panneau
        // (data-rang-menu) et "+" reste seul, poussé à droite avec "⋮"
        // (.toolbar-groupe-droite, cf. style-mobile.css).
        '<div class="toolbar-groupe sep-avant" id="groupeAjoutLigne" data-rang="70" data-rang-menu="40">' +
          '<div class="outil-menu" id="menuAjoutLigne">' +
            '<button type="button" class="toolbar-btn" id="btnAjoutLigne" title="Ajouter une ligne — Personnel ou Intervenant">' + ICONS.ajoutLigne + '<span class="toolbar-btn-label">Ajouter une ligne</span></button>' +
            '<div class="outil-menu-panneau">' +
              '<div class="outil-menu-titre">Ajouter une ligne</div>' +
              '<button type="button" class="outil-menu-item" data-ligne="personnel">' + ICONS.people + 'Personnel</button>' +
              '<button type="button" class="outil-menu-item" data-ligne="intervenant">' + ICONS.hardhat + 'Intervenant</button>' +
              // Suite 33 : une équipe (ligne unique pour plusieurs personnes, cf. js/equipes.js).
              '<button type="button" class="outil-menu-item" data-ligne="equipe">' + ICONS.people + 'Équipe</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="toolbar-groupe toolbar-groupe-droite" id="groupeAjoutElement" data-rang="80">' +
          '<div class="outil-menu" id="menuAjoutElement">' +
            '<button type="button" class="toolbar-btn" id="btnAjoutElement" title="Ajouter un élément au planning">' + ICONS.plus + '</button>' +
            '<div class="outil-menu-panneau">' +
              '<div class="outil-menu-page" data-page="choix">' +
                '<div class="outil-menu-titre">Ajouter au planning</div>' +
                '<button type="button" class="outil-menu-item" data-type="tache">' + ICONS.tache + 'Tâche</button>' +
                '<button type="button" class="outil-menu-item" data-type="absence">' + ICONS.absence + 'Absence</button>' +
                '<button type="button" class="outil-menu-item" data-type="note">' + ICONS.note + 'Note</button>' +
                '<button type="button" class="outil-menu-item" data-type="jalon">' + ICONS.flag + 'Jalon</button>' +
              '</div>' +
              '<div class="outil-menu-page" data-page="personne" id="pageAjoutPersonne" hidden></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // Masquages : icônes seules partout, y compris dans le panneau où
        // elles restent sur UNE ligne (Lionel : « 4 icones sur la même ligne
        // suffisent ») — plus de libellé ni de coche, l'état reste lisible
        // par la teinte .actif/.desactive (majControlesAffichage).
        '<div class="toolbar-groupe sep-avant" id="controlesAffichage" data-rang="90" data-rang-menu="50">' +
          '<button type="button" class="toolbar-toggle actif" data-affichage-cible="jalon" title="Masquer/afficher Jalons" aria-label="Masquer/afficher Jalons">' + ICONS.flag + '</button>' +
          '<button type="button" class="toolbar-toggle actif" data-affichage-cible="note" title="Masquer/afficher Notes" aria-label="Masquer/afficher Notes">' + ICONS.note + '</button>' +
          '<button type="button" class="toolbar-toggle actif" data-affichage-cible="personnel" title="Masquer/afficher Personnel" aria-label="Masquer/afficher Personnel">' + ICONS.people + '</button>' +
          '<button type="button" class="toolbar-toggle actif" data-affichage-cible="intervenants" title="Masquer/afficher Intervenants" aria-label="Masquer/afficher Intervenants">' + ICONS.hardhat + '</button>' +
        '</div>' +
        // "⋮" : visible seulement quand au moins un groupe est replié
        // (#legendeBarre.toolbar-compacte, posée par ajusterDebordementToolbar)
        // ou sur téléphone. Panneau (#toolbarSecondaire) sans aucun groupe au
        // départ, rempli par ajusterDebordementToolbar au premier rendu.
        // Menu ouvert : "⋮" devient "✕" (Lionel : « garde le menu ouvert »,
        // puis « Place la Croix fermer à la place des 3 points ») — le
        // panneau ne se referme plus à chaque clic sur l'un de ses boutons
        // (cf. cablerPagePlanning), d'où un moyen explicite et à la même
        // place de le refermer. Les 2 icônes sont dans le bouton, l'échange
        // se fait en CSS sur la classe .ouvert que cablerPagePlanning/
        // fermerAutresMenusOutils posent et retirent déjà sur #btnPlusOutils.
        '<button type="button" class="toolbar-btn" id="btnPlusOutils" data-rang="100" title="Plus d’outils / fermer le menu" aria-label="Plus d’outils">' +
          '<span class="icone-menu-ouvrir">' + ICONS.dots + '</span><span class="icone-menu-fermer">' + ICONS.close + '</span>' +
        '</button>' +
        '<div class="toolbar-secondaire" id="toolbarSecondaire" data-rang="110"></div>' +
      '</div>' +
      '<div class="zone-planning">' +
        '<div id="racine"></div>' +
        // Pilule de sélection (#panneauSelection) — round du 24.09.2026,
        // suite 8 puis suite 9 (Lionel, capture BlueMail à l'appui : « placer
        // cette barre en bas aussi sous forme de pilule […] de la couleur du
        // thème », « enlever le bouton de la barre »). Remplace l'ancienne
        // #barreAction (Annuler / Supprimer / Copier / Déplacer) et le
        // bouton "sélection multiple" de la barre d'outils (suite 7-8).
        // Fixée en bas de l'écran (position:fixed, cf. .panneau-selection
        // dans style.css), visible dès qu'une bulle est sélectionnée
        // (majBarreSelection) : ✎ modifier (une seule bulle — remplace le
        // double-clic), ⧉ copier-au-prochain-déplacement (bascule, cf.
        // copieSelectionActive), 🗑 supprimer, puis les flèches (mode
        // multiple seulement — appui long, Ctrl+clic ou sélection par
        // zone), puis ✕. Suite 14 — ⚑ important (Lionel : « Ajoutez le flag
        // important à la pilule de sélection simple et multiple afin de
        // pouvoir mettre un texte important sur une ou plusieurs cases en
        // même temps »), entre ⧉ et la corbeille, cf. basculerImportantSelection.
        // Placée ici, dans #page-planning, pour disparaître
        // avec l'onglet ; hors de #legendeBarre pour ne jamais compter dans
        // la mesure de débordement de la barre d'outils.
        '<div class="panneau-selection" id="panneauSelection" hidden>' +
          '<button type="button" class="toolbar-btn" id="selModifier" title="Modifier (Entrée)" aria-label="Modifier">' + ICONS.pencil + '</button>' +
          '<button type="button" class="toolbar-btn" id="selCopier" title="Copier au prochain déplacement (flèches ou glisser) au lieu de déplacer" aria-label="Copier au prochain déplacement">' + ICONS.copy + '</button>' +
          '<button type="button" class="toolbar-btn sel-important" id="selImportant" title="Important : marquer ou retirer" aria-label="Important" aria-pressed="false">' + ICONS.important + '</button>' +
          '<button type="button" class="toolbar-btn sel-supprimer" id="selSupprimer" title="Supprimer (Suppr)" aria-label="Supprimer">' + ICONS.trash + '</button>' +
          '<span class="sel-fleches" hidden>' +
            '<span class="sel-sep"></span>' +
            '<button type="button" class="toolbar-btn" data-decal="-2" title="Décaler d’un jour vers la gauche (Maj+←)" aria-label="Décaler d’un jour vers la gauche">' + ICONS.chevronDoubleGauche + '</button>' +
            '<button type="button" class="toolbar-btn" data-decal="-1" title="Décaler d’une demi-journée vers la gauche (←)" aria-label="Décaler d’une demi-journée vers la gauche">' + ICONS.chevronGauche + '</button>' +
            '<span class="sel-compte" title="Bulles sélectionnées">0</span>' +
            '<button type="button" class="toolbar-btn" data-decal="1" title="Décaler d’une demi-journée vers la droite (→)" aria-label="Décaler d’une demi-journée vers la droite">' + ICONS.chevronDroite + '</button>' +
            '<button type="button" class="toolbar-btn" data-decal="2" title="Décaler d’un jour vers la droite (Maj+→)" aria-label="Décaler d’un jour vers la droite">' + ICONS.chevronDoubleDroite + '</button>' +
          '</span>' +
          '<span class="sel-sep"></span>' +
          '<button type="button" class="toolbar-btn" id="selFermer" title="Désélectionner (Échap)" aria-label="Désélectionner">' + ICONS.close + '</button>' +
        '</div>' +

      '</div>' +
      '</div></div></div>';
  }
  function htmlPageJalons() {
    return '<div class="page" id="page-jalons"><div class="page-scroll">' +
      '<div class="page-titre"><h1>Jalons</h1></div>' +
      // Descriptions raccourcies (round du 26.09.2026, suite 54) — Lionel :
      // « jalons, modifier la description en "phases du projet". Et juste
      // "couleur" pour le choix de la couleur. »
      '<p class="page-sous">Phases du projet.</p>' +
      // Round du 23.09.2026 (suite) — à la demande de Lionel, le réglage de
      // couleur "Jalon" est déplacé ici (sur sa page naturelle) plutôt que
      // sur Général. Cf. js/page-couleurs.js (ligne réduite à « Couleur »,
      // suite 54).
      htmlReglagesCouleurs('jalons') +
      '<div class="liste-intervenants" id="listeJalons"></div>' +
      '</div></div>';
  }
  // Suite 65 : page Notes (js/page-notes.js) — couleur des notes, leur
  // présence dans le planning, et la liste de toutes les notes.
  function htmlPageNotes() {
    return '<div class="page" id="page-notes"><div class="page-scroll">' +
      '<div class="page-titre"><h1>Notes</h1></div>' +
      '<p class="page-sous">Remarques posées sur le planning, au-dessus des personnes.</p>' +
      htmlReglagesCouleurs('notes') +
      '<label class="reglage-ligne reglage-notes-planning"><span class="reglage-texte"><b>Afficher dans le planning</b><span>Comme l’icône note de la barre du planning.</span></span>' +
        '<span class="interrupteur"><input type="checkbox" id="chkNotesPlanning" checked><span class="interrupteur-piste"></span></span></label>' +
      '<div id="listeNotes"></div>' +
      '</div></div>';
  }
  function htmlPagePersonnel() {
    return '<div class="page" id="page-personnel"><div class="page-scroll">' +
      '<div class="page-titre"><h1>Personnel</h1></div>' +
      '<p class="page-sous">L’équipe interne.</p>' +
      // Équipes (round du 25.09.2026, suite 33 — js/equipes.js) : au-dessus
      // du personnel, qu'elles regroupent dans le planning.
      '<h2 class="titre-liste">Équipes</h2>' +
      // Suite 54 — Lionel : « personnel, description équipe plus brève ».
      '<p class="page-sous">Membres choisis chaque semaine en touchant le nom de l’équipe dans le planning.</p>' +
      '<div class="liste-intervenants" id="listeEquipes"></div>' +
      '<h2 class="titre-liste">Personnes</h2>' +
      // Round du 23.09.2026 (suite) — réglage de couleur de la ligne de
      // séparation Personnel, placé ici à la demande de Lionel (réutilisé
      // aussi par le bouton de masquage de la toolbar). Cf. js/page-couleurs.js.
      htmlReglagesCouleurs('personnel') +
      '<div class="liste-intervenants" id="listePersonnel"></div>' +
      '</div></div>';
  }
  function htmlPageIntervenants() {
    return '<div class="page" id="page-intervenants"><div class="page-scroll">' +
      '<div class="page-titre"><h1>Intervenants</h1></div>' +
      '<p class="page-sous">Les sous-traitants.</p>' +
      // Round du 23.09.2026 (suite) — idem Personnel, cf. js/page-couleurs.js.
      htmlReglagesCouleurs('intervenants') +
      '<div class="liste-intervenants" id="listeIntervenants"></div>' +
      '</div></div>';
  }
  function htmlPageChantiers() {
    return '<div class="page" id="page-chantiers"><div class="page-scroll">' +
      '<div class="page-titre"><h1>Chantiers</h1></div>' +
      // Suite 54 — Lionel : « statuts et chantier, modifications de la
      // couleur se fait par appuis sur la pastille. Description plus brève. »
      '<p class="page-sous">Touche la pastille pour changer la couleur. Un chantier désactivé reste sur les cases déjà posées.</p>' +
      '<div class="liste-intervenants" id="listeChantiers"></div>' +
      '</div></div>';
  }
  function htmlPageStatuts() {
    return '<div class="page" id="page-statuts"><div class="page-scroll">' +
      '<div class="page-titre"><h1>Statuts</h1></div>' +
      '<p class="page-sous">Statuts des tâches des intervenants. Touche la pastille pour changer la couleur.</p>' +
      '<div class="liste-intervenants" id="listeStatuts"></div>' +
      '</div></div>';
  }
  function htmlPageEntreeRapide() {
    return '<div class="page" id="page-entree-rapide"><div class="page-scroll">' +
      '<div class="page-titre"><h1>Entrée rapide</h1></div>' +
      '<p class="page-sous">Ces formulaires apparaissent dans le menu « Ajouter » de chaque case du planning, personnel et intervenants confondus. Chantier (et, pour un intervenant, Statut) sont toujours proposés en plus des champs ci-dessous.</p>' +
      '<div class="liste-formulaires" id="listeFormulaires"></div>' +
      '<div class="panneau-nouveau-form" id="panneauNouveauForm" hidden>' +
        '<h3 id="titreNouveauForm">Nouveau formulaire</h3>' +
        '<div class="champ-ligne"><label>Nom du formulaire</label><input type="text" class="nf-nom" placeholder="ex. Chape, Étanchéité…"></div>' +
        '<div class="note-panneau" id="noteFormSpecial" hidden>Ce formulaire a sa propre interface dédiée : son nom ne peut pas être changé (c’est lui qui fait le lien). Tout le reste — « Assigné à », champs, ordre — est modifiable normalement.</div>' +
        '<div class="champ-ligne"><label>Assigné à</label><select class="nf-assigne"><option value="">Tout le monde</option></select>' +
      '<span class="champ-aide">Détermine où ce formulaire apparaît dans le menu « Ajouter » du planning. Un intervenant choisi ici est le seul à le voir — l’électricien n’a pas besoin des entrées béton.</span></div>' +
      '<div class="champ-ligne"><label>Type d’entrée</label>' +
      '<select class="nf-type"><option value="tache">Tâche</option><option value="absence">Absence (congé, vacances…)</option></select>' +
      '<span class="champ-aide">Une entrée « Absence » se pose comme un congé (couleur orange sur le planning), pas comme une tâche de chantier.</span></div>' +
        '<div class="champ-ligne"><label>Champs du formulaire</label>' +
          '<div class="liste-champs-form" id="listeChampsForm"></div>' +
          '<button type="button" class="lien-ajouter-champ" id="btnAjouterChamp">+ Ajouter un champ</button>' +
          '<div class="constructeur-champ" id="constructeurChamp" hidden>' +
            '<input type="text" class="cc-label" placeholder="Nom du champ (ex. Quantité)">' +
            '<div class="chip-row cc-type-row">' +
              '<button type="button" class="chip sub actif" data-type="texte">Texte</button>' +
              '<button type="button" class="chip sub" data-type="select">Liste de choix</button>' +
              '<button type="button" class="chip sub" data-type="nombre">Nombre</button>' +
              '<button type="button" class="chip sub" data-type="case">Case à cocher</button>' +
            '</div>' +
            '<input type="text" class="cc-options" placeholder="Options séparées par une virgule (ex. Murs, Radier, Dalle)" hidden>' +
            '<div class="panneau-boutons"><button type="button" class="btn-reset cc-annuler">Annuler</button><button type="button" class="btn-ajout-st cc-ajouter">Ajouter le champ</button></div>' +
          '</div>' +
        '</div>' +
        '<div class="note-panneau">Le nom du formulaire + le nom (ou la valeur) de chaque champ rempli forment le texte de la tâche, dans l’ordre (ex. « Béton murs - 50 »). Sans aucun champ, l’entrée s’ajoute directement en un clic, sans formulaire.</div>' +
        '<div class="panneau-boutons"><button type="button" class="btn-reset nf-annuler">Annuler</button><button type="button" class="btn-ajout-st nf-ok">Enregistrer</button></div>' +
      '</div>' +
      '</div></div>';
  }
  // Page Horaires = ancienne page Fériés + ancienne page Horaires (round du
  // 25.09.2026, suite 47). Lionel : « Regrouper les onglets fériés et
  // horaires. Nom d'onglet horaires, placer le calendrier en haut de page et
  // les horaires en bas de page. » Une seule année ‹ › pour les 2 blocs (le
  // calendrier montre les heures de ces mêmes horaires) ; chaque bloc garde
  // ses propres boutons et son propre Enregistrer, comme avant — rien ne
  // change dans ce qui est écrit sur le serveur. Sur téléphone, la barre de
  // boutons de chaque bloc reste collée en bas tant que ce bloc est à
  // l'écran (style-mobile.css) : celle du calendrier, puis celle des
  // horaires en descendant. Calendrier : js/page-feries.js ; horaires :
  // js/page-horaires.js (en-tête et liste des périodes façon « tableau en
  // bas à gauche » de la feuille PMB, suite 27).
  function htmlPageHoraires() {
    return '<div class="page" id="page-horaires"><div class="page-scroll">' +
      '<div class="page-titre"><h1>Horaires</h1>' +
        '<div class="nav-annee"><button type="button" class="fleche" id="horaireAnneePrec">&larr;</button><span id="horaireAnneeLabel"></span><button type="button" class="fleche" id="horaireAnneeSuiv">&rarr;</button></div>' +
      '</div>' +
      '<section class="bloc-horaires" id="blocCalendrier">' +
        '<h2>Calendrier</h2>' +
        '<div class="actions-feries"><button class="btn-calculer" id="btnCalculerFeries" type="button">Calculer<span class="lib-long"> les fériés</span></button><button class="btn-effacer" id="btnEffacerFeries" type="button">Effacer<span class="lib-long"> l’année</span></button><button class="btn-enregistrer" id="btnEnregistrerFeries" type="button">Enregistrer</button></div>' +
        '<p class="page-sous">Choisis une catégorie ci-dessous puis clique les dates à colorer (reclic = efface). « Calculer les fériés » ajoute les jours fériés suisses fixes/mobiles de l’année et les ponts qui en dépendent, en catégorie Férié — vacances d’entreprise restent à poser à la main. Rien n’est écrit sur le serveur tant que tu n’as pas cliqué Enregistrer.</p>' +
        '<div class="categories" id="ferieCategories"></div>' +
        '<p class="page-sous-mobile">Choisis une catégorie, puis touche les jours à colorer (retoucher = efface). Rien n’est envoyé avant Enregistrer.</p>' +
        '<div class="calendrier-wrap"><table class="calendrier" id="ferieCalendrier"></table></div>' +
        // Version téléphone (suite 23) : 12 mois l'un sous l'autre, cf.
        // renderFerieMoisMobile (page-feries.js) ; affichée à la place du
        // tableau par style-mobile.css.
        '<div class="mois-feries" id="ferieMoisMobile"></div>' +
        '<div class="legende-feries">Semaines grisées, dates qui n’existent pas (ex. 30/31 février) en noir et non cliquables. Chaque jour montre sa durée de travail (Horaires de travail, plus bas). J.trav./H.trav. ne comptent pas les jours colorés, sauf un jour compensé qui a sa propre période d’un seul jour (demi-journée travaillée, ex. « du 9 au 9 »). Fériés et vacances comptent chacun 2112 h ÷ jours ouvrés de l’année ; les compensés 0 h.</div>' +
      '</section>' +
      '<section class="bloc-horaires" id="blocHoraires">' +
        '<h2>Horaires de travail</h2>' +
        '<div class="actions-feries"><button class="btn-calculer" id="btnCopierHoraires" type="button">Copier</button><button class="btn-calculer" id="btnAjouterHoraire" type="button">Ajouter<span class="lib-long"> une période</span></button><button class="btn-enregistrer" id="btnEnregistrerHoraires" type="button">Enregistrer</button></div>' +
        '<p class="page-sous">Une ligne par période, comme la feuille « Horaire de travail » : dates (incluses), horaire du matin, horaire de l’après-midi (laisser vide s’il n’y a que le matin). Les horaires valent du lundi au vendredi ; ils s’affichent dans le planning, l’impression et le calendrier ci-dessus. Rien n’est écrit sur le serveur tant que tu n’as pas cliqué Enregistrer.</p>' +
        '<div class="horaires-liste" id="horairesListe"></div>' +
      '</section>' +
      '</div></div>';
  }
  // Page Mise en page (round du 25.09.2026, suite 39) — cf.
  // js/page-mise-en-page.js. Réglages à gauche, aperçu schématique de la
  // feuille à droite (l'un sous l'autre sur téléphone).
  // Suite 61 : page de réglages (menu de la pastille), plus un onglet.
  function htmlPageMiseEnPage() {
    return '<div class="page page-reglages" id="page-mise-en-page"><div class="page-scroll">' +
      '<div class="page-titre"><h1>Mise en page</h1>' +
        '<div class="actions-feries"><span class="mep-etat" id="mepEtat"></span><button class="btn-calculer" id="btnReinitMep" type="button">Réinitialiser</button></div>' +
      '</div>' +
      '<p class="page-sous">La feuille imprimée depuis le planning (bouton Imprimer) : orientation, marges, largeur des colonnes, format des dates, espacements, en-tête et pied de page. Enregistré sur ton compte à chaque changement, mêmes réglages sur téléphone et ordinateur. Ce qui s’imprime ou non (jalons, notes, personnes…) se coche dans l’aperçu d’impression.</p>' +
      '<div class="mep-grille"><div class="mep-formulaire impr-grille" id="mepFormulaire"></div><div class="mep-apercu" id="mepApercu"></div></div>' +
      '</div></div>';
  }
  // afficherVersionServeur()/apiVersionServeur supprimés le 07.09.2026 (phase
  // 4, étape 5 — chasse aux trous laissés par la migration, cf.
  // MIGRATION-GITHUB-PLAN.md §6bis étape 5). Ce diagnostic datait du round du
  // 02.09.2026 ("ne marche pas même avec un nouveau déploiement") : il
  // vérifiait qu'Apps Script servait bien le dernier WebApp.gs envoyé. Il
  // appelait encore gsP() (donc google.script.run, cf. gs() plus haut) et
  // s'exécutait automatiquement à CHAQUE ouverture de la page Fériés — sans
  // le fix, Lionel aurait vu un message d'erreur "google is not defined"
  // permanent en bas de cette page. Le concept n'a plus de sens une fois
  // hébergé sur GitHub Pages (plus de "déploiement" Apps Script à vérifier) :
  // supprimé plutôt que porté.

  // Routage par onglets : un seul .page.actif à la fois. Round du
  // 12.09.2026 — remplace l'ancien routage sidebar (repli auto sur Planning,
  // panneau ouvert/fermé par pointerdown) : les onglets sont de simples
  // boutons statiques, toujours au même endroit, donc plus besoin de gérer
  // un état ouvert/fermé ni un clic en dehors pour refermer quoi que ce
  // soit. Chaque page "données serveur" se re-render à chaque activation
  // (jamais mise en cache côté page — la source de vérité est
  // etat.*Serveur/PERSONNES, déjà tenue à jour par les fonctions de
  // rafraîchissement de chaque CRUD).
  // Round du 25.09.2026 (suite 53) — Lionel : « Des icônes seront mieux
  // que des textes car sur mobile les textes sortent de l'écran. » La barre
  // d'onglets du haut (tablette, téléphone tenu à l'horizontale, petite
  // fenêtre d'ordinateur) coupait « Mise en page » et cachait « Entrée
  // rapide » dès 1024 px. Quand les 10 onglets ne tiennent pas, seuls les
  // icônes restent (libellé en title, au survol), sauf l'onglet actif qui
  // garde son nom. Mesuré, pas une largeur fixe : dépend de la police et
  // de la taille de texte choisie sur l'appareil.
  function ajusterOngletsNav() {
    var nav = document.getElementById("ongletsNav");
    // Suite 63 : la rangée affichée (principale ou réglages), l'autre est
    // masquée (largeur nulle).
    var liste = nav && [].filter.call(nav.querySelectorAll(".onglets-liste"), function (l) { return l.offsetWidth > 0; })[0];
    if (!liste) return;
    // Suite 65 : d'abord resserrés (noms gardés), puis icônes seules si ça
    // ne suffit toujours pas (cf. .onglets-serres, style.css).
    nav.classList.remove("onglets-compacts", "onglets-serres");
    if (liste.scrollWidth <= liste.clientWidth + 1) return;
    nav.classList.add("onglets-serres");
    if (liste.scrollWidth > liste.clientWidth + 1) { nav.classList.remove("onglets-serres"); nav.classList.add("onglets-compacts"); }
  }
  // Page affichée (onglet, ou page de réglages du menu de la pastille —
  // suite 61) : renseignée par cablerNavigation, utilisée par afficherPage.
  var renduParPage_ = {};
  function fermerSwitcherPages() {
    var b = document.getElementById("switcherBtn"), p = document.getElementById("switcherPanneau");
    if (b) b.classList.remove("ouvert");
    if (p) p.classList.remove("ouvert");
  }
  // Affiche la page « nom » (#page-<nom>) : onglets du haut et liste
  // « Pages » du bas teintés, sélecteur du bas renommé, rendu propre à la
  // page. Suite 61 : extrait du clic d'onglet, pour que le menu de la
  // pastille et les raccourcis clavier ouvrent une page par le même chemin.
  // Suite 63 : une page de réglages a son onglet, dans la rangée des
  // réglages qui remplace alors la rangée principale (haut et bas).
  function afficherPage(nom) {
    var page = document.getElementById("page-" + nom);
    if (!page) return;
    // §91 — comparaison par data-page : un clic sur .onglet OU sur
    // .switcher-item pour la même page teinte les DEUX exemplaires (haut
    // ET bas), puisque les 2 barres coexistent dans le DOM (l'une des deux
    // simplement masquée en CSS selon la largeur d'écran).
    document.querySelectorAll(".onglet").forEach(function (b) { b.classList.toggle("actif", b.dataset.page === nom); });
    document.querySelectorAll(".page").forEach(function (p) { p.classList.remove("actif"); });
    page.classList.add("actif");
    var reglage = pageReglage_(nom);
    var shell = document.querySelector(".app-shell");
    if (shell) shell.classList.toggle("mode-reglages", !!reglage);
    if (reglage) dernierReglage_ = nom; else dernierePagePrincipale_ = nom;
    // §91 — icône et libellé du sélecteur de page du bas d'écran, AVANT le
    // rendu à dessein : la navigation reste cohérente même si le rendu de
    // la page échoue (ex. souci réseau dans un render*() qui charge ses
    // données à la demande).
    var switcherIcone = document.getElementById("switcherIcone");
    var switcherNom = document.getElementById("switcherNom");
    var onglet = document.querySelector('.onglets-liste .onglet[data-page="' + nom + '"]');
    if (switcherIcone) {
      var svg = onglet ? onglet.querySelector("svg") : null;
      if (svg) switcherIcone.innerHTML = svg.outerHTML;
      else if (reglage) switcherIcone.innerHTML = ICONS[reglage.icone];
    }
    if (switcherNom) switcherNom.textContent = onglet ? onglet.textContent.trim() : (reglage ? reglage.nom : nom);
    fermerSwitcherPages();
    ajusterOngletsNav(); // l'onglet actif garde son nom (suite 53)
    var fn = renduParPage_[nom];
    if (fn) fn();
  }
  function cablerNavigation() {
    // §91 (round du 22.09.2026, suite) — querySelectorAll(".onglet") capte
    // les boutons de .onglets-nav en haut ET ceux de #switcherPanneau en
    // bas (cf. construireCoquille) : la même classe + le même data-page sur
    // les 2 jeux de boutons suffit à les câbler TOUS ici.
    var ongletsBtns = document.querySelectorAll(".onglet");
    var switcherBtn = document.getElementById("switcherBtn");
    var switcherPanneau = document.getElementById("switcherPanneau");
    renduParPage_ = {
      // Jalons (revue du 24.09.2026, suite 22) : liste relue à CHAQUE
      // ouverture de la page — chargée une seule fois auparavant, elle
      // ignorait tout ce que la grille avait fait aux jalons depuis.
      jalons: function () { JALONS_TOUS = null; renderJalons(); },
      // Suite 65 : relue à chaque ouverture, comme Jalons.
      notes: function () { NOTES_TOUTES = null; renderNotes(); },
      personnel: renderPersonnel, intervenants: renderIntervenants,
      chantiers: renderChantiers, statuts: renderStatuts,
      "entree-rapide": renderFormulaires,
      // Suite 47 : un seul onglet Horaires pour le calendrier (ex-Fériés) et
      // les horaires de travail.
      horaires: function () { renderFeries(); renderHoraires(); },
      "mise-en-page": renderMiseEnPage,
      // Pages de réglages (suite 61, ex-onglet Général) : sauvegardes
      // relues à chaque ouverture (suite 49), raccourcis et palettes
      // redessinés (un autre appareil a pu les changer).
      sauvegardes: renderSauvegardes,
      raccourcis: renderRaccourcis,
      couleurs: function () { if (typeof majReglagesCouleursAffiches === "function") majReglagesCouleursAffiches(); },
      compte: chargerInfosCompte,
      // Suite 64 : aperçu redessiné (chantiers, statuts) et polices des
      // pastilles chargées à l'ouverture de la page.
      affichage: majPageAffichage,
      // Round du 16.09.2026 (suite, encore) : la page Planning elle-même
      // n'a pas besoin d'un re-rendu complet à chaque activation (ses
      // données restent à jour en tâche de fond, cf. synchroniser()) — mais
      // #legendeBarre/.entete-planning-figee ont pu être mesurés (top sticky,
      // cf. ajusterEnteteFixe) pendant qu'elle était display:none (sur un
      // autre onglet), ce qui donne des hauteurs nulles et donc un top faux.
      // Remesurer juste au moment où elle redevient visible corrige ça sans
      // reconstruire toute la grille.
      // Round du 24.09.2026 (suite 6) : si la largeur d'écran a franchi 600px
      // pendant qu'on était sur un autre onglet, la vue "1 jour" s'est
      // activée/désactivée et la fenêtre chargée a changé — reconstruction
      // complète dans ce cas (verifierModeFenetre, grille-rendu.js), sinon
      // simple remesure comme avant.
      planning: function () { if (!verifierModeFenetre()) ajusterEnteteFixe(); }
    };
    ongletsBtns.forEach(function (btn) {
      btn.addEventListener("click", function () { afficherPage(btn.dataset.page); });
    });
    // §91 — ouverture/fermeture du panneau "Pages" du bas, même principe que
    // #selectChantier dans cablerPagePlanning (bouton statique, panneau
    // reconstruit une seule fois ici) ; document reste seul responsable de
    // la fermeture au clic extérieur (cf. tout en bas).
    if (switcherBtn && switcherPanneau) {
      switcherBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var etaitOuvert = switcherPanneau.classList.contains("ouvert");
        switcherBtn.classList.toggle("ouvert", !etaitOuvert);
        switcherPanneau.classList.toggle("ouvert", !etaitOuvert);
      });
      switcherPanneau.addEventListener("click", function (e) { e.stopPropagation(); });
    }
    document.addEventListener("click", fermerSwitcherPages);
  }

  function cablerPagePlanning() {
    // Boutons ↶/↷ de la barre d'outils (round du 12.09.2026, signalé par
    // Lionel : "le bouton annuler et refaire qui ne fonctionne pas") : ils
    // existaient dans le HTML et leur état disabled/enabled était bien tenu
    // à jour par majBoutonsUndo(), mais AUCUN clic n'était jamais câblé
    // dessus — bug présent depuis le tout premier commit du dépôt, seuls les
    // raccourcis clavier Ctrl+Z/Ctrl+Y (cf. plus bas, gestion clavier)
    // appelaient réellement defaire()/refaire().
    var btnDefaire = document.getElementById("btnDefaire");
    if (btnDefaire) btnDefaire.addEventListener("click", defaire);
    var btnRefaire = document.getElementById("btnRefaire");
    if (btnRefaire) btnRefaire.addEventListener("click", refaire);
    // Round D — le bouton "2 semaines" (ex-paire .toggle-sem) est câblé dans
    // construireGrille (avec Aujourd'hui/les flèches semaine, qu'il rejoint
    // visuellement) puisqu'il vit dans .semaine-titre, reconstruite à chaque
    // rendu — cf. basculerDeuxSemaines juste plus bas, appelée depuis
    // là-bas. "Ajout lointain" a disparu (Lionel : "on peut maintenant le
    // faire via les nouveaux formulaires").
    // "Imprimer" (STATIQUE depuis le round du 16.09.2026, suite, encore ;
    // redevenu un simple bouton icône .toolbar-btn au §83, cf. son historique
    // CSS plus haut) : il ne dépend d'aucune donnée de la grille, donc
    // câblé ici, une seule fois, plutôt que recréé à chaque construireGrille().
    var btnImprimerTitre = document.getElementById("btnImprimerTitre");
    if (btnImprimerTitre) btnImprimerTitre.addEventListener("click", openPrintSheet);
    // §83 (round du 16.09.2026, encore un autre, suite×7) — le sélecteur de
    // chantier par défaut (ex-clic sur un swatch de la légende) : ouverture/
    // fermeture du panneau câblées ici, une seule fois (conteneur STATIQUE,
    // comme Imprimer) ; le CONTENU du panneau (liste des chantiers actifs)
    // et l'apparence du bouton (swatch/nom) sont reconstruits par
    // construireSelectChantier() à chaque rendu — cf. plus bas.
    var selectChantier = document.getElementById("selectChantier");
    var btnSelectChantier = document.getElementById("btnSelectChantier");
    // §91 (round du 22.09.2026, suite) — panneau "⋮" téléphone (cf. le grand
    // commentaire de htmlPagePlanning) : mêmes variables statiques que
    // selectChantier ci-dessus, même conteneur câblé une seule fois.
    var toolbarSecondaire = document.getElementById("toolbarSecondaire");
    var btnPlusOutils = document.getElementById("btnPlusOutils");
    // §85 (round du 17.09.2026) — menuAjoutElement/reinitialiserMenuAjoutElement/
    // fermerAutresMenusOutils sont déclarées ici (var/function, "hoistées"
    // dans toute cablerPagePlanning) mais réellement remplies un peu plus
    // bas, avec le reste du câblage de #menuAjoutElement — utilisables dès
    // ici (fermeture du sélecteur de chantier) comme depuis là-bas, pour que
    // #selectChantier et les 3 nouveaux .outil-menu (zoom, ligne+, +) restent
    // mutuellement exclusifs : un seul panneau ouvert à la fois dans cette
    // barre.
    var menuAjoutElement = document.getElementById("menuAjoutElement");
    var pageAjoutPersonne = document.getElementById("pageAjoutPersonne");
    var typeAjoutBarreEnCours = null;
    function reinitialiserMenuAjoutElement() {
      if (!menuAjoutElement) return;
      var pageChoix = menuAjoutElement.querySelector('[data-page="choix"]');
      if (pageChoix) pageChoix.hidden = false;
      if (pageAjoutPersonne) pageAjoutPersonne.hidden = true;
      typeAjoutBarreEnCours = null;
    }
    // Ferme tout ce qui peut être ouvert dans cette barre SAUF `sauf` (un des
    // .outil-menu, ou null pour tout fermer) — réinitialise au passage
    // #menuAjoutElement sur sa page "choix" dès qu'il fait partie de ce qui
    // se ferme, pour ne jamais le rouvrir plus tard sur l'étape "pour qui ?"
    // d'un ajout précédent abandonné en cours de route.
    function fermerAutresMenusOutils(sauf) {
      document.querySelectorAll(".outil-menu.ouvert").forEach(function (m) {
        if (m === sauf) return;
        m.classList.remove("ouvert");
        if (m === menuAjoutElement) reinitialiserMenuAjoutElement();
      });
      if (selectChantier) selectChantier.classList.remove("ouvert");
      // §91 — #toolbarSecondaire (panneau "⋮" téléphone) rejoint ce même
      // mécanisme générique d'exclusion mutuelle — SAUF quand l'appel vient
      // d'un menu qu'il contient lui-même (ex. #menuAjoutLigne, resté un
      // .outil-menu tout à fait normal une fois déplacé dans ce panneau,
      // cf. htmlPagePlanning) : sinon ouvrir ce sous-menu refermerait
      // aussitôt le panneau qui le contient.
      if (toolbarSecondaire && (!sauf || !toolbarSecondaire.contains(sauf))) {
        toolbarSecondaire.classList.remove("ouvert");
        if (btnPlusOutils) btnPlusOutils.classList.remove("ouvert");
      }
    }
    if (selectChantier && btnSelectChantier) {
      btnSelectChantier.addEventListener("click", function (e) {
        e.stopPropagation();
        var etaitOuvert = selectChantier.classList.contains("ouvert");
        fermerAutresMenusOutils(null);
        selectChantier.classList.toggle("ouvert", !etaitOuvert);
      });
    }
    // §91 — ouverture/fermeture du panneau "⋮", même principe que
    // #selectChantier ci-dessus.
    if (toolbarSecondaire && btnPlusOutils) {
      btnPlusOutils.addEventListener("click", function (e) {
        e.stopPropagation();
        var etaitOuvert = toolbarSecondaire.classList.contains("ouvert");
        fermerAutresMenusOutils(null);
        toolbarSecondaire.classList.toggle("ouvert", !etaitOuvert);
        btnPlusOutils.classList.toggle("ouvert", !etaitOuvert);
      });
      // Round du 24.09.2026 (suite 3) — Lionel : « garde le menu ouvert ».
      // Un clic DANS le panneau (‹/›, un masquage, 2 semaines, Imprimer…)
      // ne remonte plus jusqu'au document, qui refermait tout — on peut
      // avancer de plusieurs semaines ou basculer plusieurs masquages
      // d'affilée. Ferme quand même les sous-menus ouverts (pilule Sem. N,
      // zoom, chantier) : fermerAutresMenusOutils(panneau) épargne le
      // panneau lui-même (il se "contient"). Les boutons de sous-menu et
      // leurs listes arrêtent déjà la propagation eux-mêmes, ce listener ne
      // les voit donc jamais. Fermeture : "✕" (le "⋮" du menu ouvert), ou
      // clic hors du panneau. EXCEPTION Imprimer (Lionel : « Bonne idée de
      // fermer le menu avec imprimé et ajouter ligne ») : ouvre une fenêtre
      // par-dessus, le menu n'a plus rien à faire ouvert derrière — son
      // propre listener (openPrintSheet) a déjà agi à ce stade, ce listener-ci
      // passant après lui (remontée de l'événement). Pendant pour "Ajouter
      // une ligne" : dans le câblage de #menuAjoutLigne plus bas.
      //
      // Round du 24.09.2026 (suite 12) — "1 semaine" (#btnVueJourMobile,
      // téléphone) referme aussi le menu. Lionel : « Je veux que le menu se
      // ferme lors de l'appui sur la vue 1 semaine ». Changer de vue
      // remplace toute la grille : le menu n'a plus rien à faire ouvert
      // par-dessus. Dans les deux sens (1 jour -> 1 semaine et retour).
      toolbarSecondaire.addEventListener("click", function (e) {
        e.stopPropagation();
        fermerAutresMenusOutils(e.target.closest("#btnImprimerTitre, #btnVueJourMobile") ? null : toolbarSecondaire);
      });
    }
    // Ouverture/fermeture des 3 .outil-menu (zoom, ligne+, +) — générique
    // plutôt que triplée, même idée que #selectChantier ci-dessus (bouton
    // statique qui ouvre son propre panneau).
    document.querySelectorAll(".outil-menu").forEach(function (menu) {
      var btnMenu = menu.querySelector(":scope > button");
      if (!btnMenu) return;
      btnMenu.addEventListener("click", function (e) {
        e.stopPropagation();
        var etaitOuvert = menu.classList.contains("ouvert");
        fermerAutresMenusOutils(menu);
        var maintenantOuvert = !etaitOuvert;
        menu.classList.toggle("ouvert", maintenantOuvert);
        if (menu === menuAjoutElement && !maintenantOuvert) reinitialiserMenuAjoutElement();
      });
    });
    // Un clic À L'INTÉRIEUR d'un panneau ne doit pas remonter jusqu'au
    // document (qui fermerait tout avant même que le bouton cliqué — Retour,
    // une personne, un palier de zoom — ait pu agir) — même filet que
    // .select-chantier-panneau n'a jamais eu besoin d'avoir, ses boutons
    // fermant déjà le panneau explicitement à chaque clic.
    document.querySelectorAll(".outil-menu-panneau").forEach(function (p) {
      p.addEventListener("click", function (e) { e.stopPropagation(); });
    });
    // Clic extérieur : ferme absolument tout (#selectChantier ET les 3
    // .outil-menu), remplace l'ancien listener dédié à #selectChantier seul
    // (§83) — fermerAutresMenusOutils(null) couvre maintenant les deux.
    document.addEventListener("click", function () { fermerAutresMenusOutils(null); });

    // ---- "ligne+" : Personnel ou Intervenant — réutilise TEL QUEL
    // ouvrirAjoutPersonne(sousTraitant), le même popup qu'ouvrait le "+" du
    // bout de ligneSection avant sa suppression ce round.
    var menuAjoutLigne = document.getElementById("menuAjoutLigne");
    if (menuAjoutLigne) {
      menuAjoutLigne.querySelectorAll("[data-ligne]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          // fermerAutresMenusOutils(null) plutôt que de ne refermer que ce
          // sous-menu : referme aussi le panneau "⋮" quand "Ajouter une
          // ligne" y est rangé (téléphone) — Lionel, round du 24.09.2026
          // (suite 3) : « Bonne idée de fermer le menu avec imprimé et
          // ajouter ligne ». Sans effet de plus quand il est dans la barre.
          fermerAutresMenusOutils(null);
          ouvrirAjoutPersonne(btn.dataset.ligne === "intervenant", btn.dataset.ligne === "equipe");
        });
      });
    }

    // ---- "+" (ajout d'élément) : Tâche/Absence/Note/Jalon. Note/Jalon
    // s'ouvrent directement (ouvrirAjoutElementBarre plus bas, cf. son
    // commentaire). Tâche/Absence affichent d'abord la 2e page "pour qui ?"
    // — liste reconstruite à l'ouverture (pas à chaque rendu de la grille,
    // ce menu n'étant consulté qu'à la demande) depuis PERSONNES, déjà la
    // liste "actif=true" triée (cf. demarrer()) — Absence exclut les
    // intervenants, même règle que boutonsMenuAjout()/le clic sur une case.
    if (menuAjoutElement && pageAjoutPersonne) {
      var pageChoixAjout = menuAjoutElement.querySelector('[data-page="choix"]');
      pageChoixAjout.querySelectorAll("[data-type]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var type = btn.dataset.type;
          if (type !== "tache" && type !== "absence") {
            menuAjoutElement.classList.remove("ouvert");
            ouvrirAjoutElementBarre(type, null);
            reinitialiserMenuAjoutElement();
            return;
          }
          typeAjoutBarreEnCours = type;
          pageAjoutPersonne.innerHTML =
            '<button type="button" class="outil-menu-retour">‹ Retour</button>' +
            '<div class="outil-menu-titre">Pour qui — ' + (type === "tache" ? "Tâche" : "Absence") + '</div>';
          // Ordre affiché (suite 33) ; pas d'absence pour une équipe.
          var liste = type === "absence" ? personnesAffichees("personnel").filter(function (p) { return !p.equipe; }) : personnesAfficheesToutes();
          liste.forEach(function (p) {
            var it = document.createElement("button");
            it.type = "button";
            it.className = "outil-menu-item";
            it.dataset.personne = p.id;
            it.textContent = p.nom;
            it.addEventListener("click", function () {
              menuAjoutElement.classList.remove("ouvert");
              ouvrirAjoutElementBarre(typeAjoutBarreEnCours, p.id);
              reinitialiserMenuAjoutElement();
            });
            pageAjoutPersonne.appendChild(it);
          });
          pageAjoutPersonne.querySelector(".outil-menu-retour").addEventListener("click", reinitialiserMenuAjoutElement);
          pageChoixAjout.hidden = true;
          pageAjoutPersonne.hidden = false;
        });
      });
    }

    // ---- Case de zoom façon Sheets. niveauZoomPlanning est appliqué (CSS
    // zoom, sur grilleEntete/grilleCorps — jamais sur .entete-planning-figee
    // elle-même) à chaque construireGrille(), donc render(false) suffit ici
    // pour que le changement soit immédiatement visible — même trajet que
    // les 4 icônes masquer/afficher ci-dessus.
    var NIVEAUX_ZOOM_PLANNING = [75, 90, 100, 110, 125, 150];
    var btnZoomMoins = document.getElementById("zoomMoins");
    var btnZoomPlus = document.getElementById("zoomPlus");
    if (btnZoomMoins) btnZoomMoins.addEventListener("click", function () {
      var i = NIVEAUX_ZOOM_PLANNING.indexOf(niveauZoomPlanning);
      niveauZoomPlanning = NIVEAUX_ZOOM_PLANNING[Math.max(0, i - 1)];
      render(false);
    });
    if (btnZoomPlus) btnZoomPlus.addEventListener("click", function () {
      var i = NIVEAUX_ZOOM_PLANNING.indexOf(niveauZoomPlanning);
      niveauZoomPlanning = NIVEAUX_ZOOM_PLANNING[Math.min(NIVEAUX_ZOOM_PLANNING.length - 1, i + 1)];
      render(false);
    });
    var panneauZoom = document.getElementById("panneauZoom");
    if (panneauZoom) {
      panneauZoom.querySelectorAll("[data-zoom]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          niveauZoomPlanning = parseInt(btn.dataset.zoom, 10);
          document.getElementById("menuZoom").classList.remove("ouvert");
          render(false);
        });
      });
    }

    // §87 (round du 17.09.2026, suite×2) — navigation de semaine dupliquée
    // dans la barre (Lionel : « l'insertion via le "+" doit pouvoir se faire
    // aussi en dehors de la vue visible, actuellement limité à la semaine en
    // cours ; on pourrait ajouter aujourd'hui/2 semaines/la navigation dans
    // la toolbar », mockup mockup-sous-menu-outils.html à l'appui, puis
    // ajusté : « il manque un rectangle avec un numéro de semaine, type
    // "Sem. 38" cliquable [...] dans le style visuel du zoom, mais avec le
    // même comportement que l'actuel [ouvrirAllerSemaine] »). ‹/›/Aujourd'hui/
    // 2 semaines réutilisent TELLES QUELLES naviguerSemaine/allerAujourdhui/
    // basculerDeuxSemaines, déjà éprouvées par la ligne coinNav/navSemaine
    // qu'elles remplacent (retirée de construireGrille ce round, Lionel :
    // « on enlève la première ligne du tableau qui ne sert plus »).
    var btnSemainePrec = document.getElementById("btnSemainePrec");
    var btnSemaineSuiv = document.getElementById("btnSemaineSuiv");
    var btnAujourdhuiBarre = document.getElementById("btnAujourdhui");
    var btnDeuxSemainesBarre = document.getElementById("btnDeuxSemaines");
    // Round du 23.09.2026 (suite 4) — #btnVueJourMobile, pendant mobile de
    // btnDeuxSemainesBarre (cf. #groupeVueJourMobile plus haut et
    // basculerVueJourMobile, js/grille-rendu.js).
    var btnVueJourMobileBarre = document.getElementById("btnVueJourMobile");
    if (btnSemainePrec) btnSemainePrec.addEventListener("click", function () { naviguerSemaine(-1); });
    if (btnSemaineSuiv) btnSemaineSuiv.addEventListener("click", function () { naviguerSemaine(1); });
    if (btnAujourdhuiBarre) btnAujourdhuiBarre.addEventListener("click", allerAujourdhui);
    // Pilule de sélection (round du 24.09.2026, suite 7 à 9) — cf.
    // #panneauSelection dans htmlPagePlanning ; logique dans
    // formulaires-communs.js.
    document.querySelectorAll("#panneauSelection [data-decal]").forEach(function (b) {
      b.addEventListener("click", function () { decalerSelection(+b.dataset.decal); });
    });
    document.getElementById("selModifier").addEventListener("click", modifierSelection);
    document.getElementById("selCopier").addEventListener("click", basculerCopieSelection);
    document.getElementById("selImportant").addEventListener("click", basculerImportantSelection);
    document.getElementById("selSupprimer").addEventListener("click", supprimerSelection);
    document.getElementById("selFermer").addEventListener("click", function () { quitterModeSelection(); render(false); });
    if (btnDeuxSemainesBarre) btnDeuxSemainesBarre.addEventListener("click", basculerDeuxSemaines);
    if (btnVueJourMobileBarre) btnVueJourMobileBarre.addEventListener("click", basculerVueJourMobile);
    // Icône calendrier de la barre (round du 24.09.2026, suite 15 ;
    // partout depuis la suite 16 ; plus de double dans le menu ⋮ du
    // téléphone depuis la suite 17) : un <input type="date">
    // natif, invisible, couvre EN PERMANENCE l'icône (.btn-calendrier, cf.
    // style.css) — au doigt, l'appui tombe directement sur lui et le
    // téléphone/la tablette ouvre son propre calendrier ; à la souris ou au
    // stylet, .showPicker() (sans lui, Chrome et Firefox n'ouvrent le
    // calendrier d'un champ date qu'au clic sur son icône à lui, invisible
    // ici). Pas "=== 'mouse'" : Safari/Firefox anciens laissent pointerType
    // vide sur un clic — seul le doigt s'en passe. Permanent plutôt que
    // créé à l'appui comme dans les fiches (cablerCalendrierDate,
    // formulaires-communs.js) : un calendrier
    // refermé sans choix y laissait sinon un champ périmé (aucun "blur" :
    // .showPicker() ne donne pas le focus). Valeur = jour affiché (vue "1
    // jour") ou jour de la semaine affichée (vue "1 semaine"), tenue à jour
    // par majSemaineAffichage, et bornes = semaines connues du planning.
    // Une date choisie referme tout menu encore ouvert, comme "1 semaine" :
    // la grille entière change (allerAuJour, js/grille-rendu.js).
    document.querySelectorAll(".btn-calendrier .date-picker-jour").forEach(function (input) {
      input.addEventListener("click", function (e) {
        majCalendrierJour(input);
        if (e.pointerType !== "touch" && input.showPicker) { try { input.showPicker(); } catch (ex) {} }
      });
      input.addEventListener("change", function () {
        var iso = input.value;
        if (!iso) return;
        input.blur();
        fermerAutresMenusOutils(null);
        allerAuJour(iso);
      });
    });
    // #menuSemaine/#btnSemainePill remplacent ouvrirAllerSemaine() (popup
    // centrée avec un <select>, supprimée avec son unique déclencheur
    // .lien-aller) par un dropdown façon Sheets, cohérent avec zoom/ligne+/+
    // juste à côté — reconstruit à l'OUVERTURE seulement (comme
    // #pageAjoutPersonne plus haut), jamais à chaque rendu : etat.semaines
    // ne change jamais en cours de session, et peut compter jusqu'à 521
    // semaines (FENETRE_SEMAINES=260 avant/après aujourd'hui) — tout afficher
    // d'un coup produirait un dropdown interminable, d'où une fenêtre de 8
    // avant / 8 après la semaine choisie (17 lignes, scrollable via
    // .semaine-panneau) : largement suffisant pour un saut rapide, ‹/› ou
    // rouvrir le dropdown depuis la nouvelle position couvrant le reste.
    // S'appuie sur l'ORDRE D'ATTACHEMENT des écouteurs sur #btnSemainePill :
    // la boucle générique ".outil-menu" plus haut bascule déjà .ouvert avant
    // que ce second écouteur (attaché après, donc exécuté après) ne
    // (re)construise le contenu — la lecture de .ouvert ci-dessous reflète
    // donc le nouvel état, pas l'ancien, sans avoir à dupliquer la logique
    // de bascule.
    var menuSemaine = document.getElementById("menuSemaine");
    var btnSemainePill = document.getElementById("btnSemainePill");
    var panneauSemaine = document.getElementById("panneauSemaine");
    if (menuSemaine && btnSemainePill && panneauSemaine) {
      btnSemainePill.addEventListener("click", function () {
        if (!menuSemaine.classList.contains("ouvert")) return;
        panneauSemaine.innerHTML = "";
        var titre = document.createElement("div");
        titre.className = "outil-menu-titre";
        titre.textContent = "Aller à…";
        panneauSemaine.appendChild(titre);
        var debut = Math.max(0, etat.indexSemaine - 8), fin = Math.min(etat.semaines.length - 1, etat.indexSemaine + 8);
        var _boucleSemaine = function (idx) {
          var s = etat.semaines[idx];
          var it = document.createElement("button");
          it.type = "button";
          it.className = "outil-menu-item" + (idx === etat.indexSemaine ? " actif" : "");
          var nom = document.createElement("span");
          nom.className = "semaine-item-nom";
          nom.textContent = "Semaine " + s.num;
          var droite = document.createElement("span");
          droite.className = "semaine-item-droite";
          var dates = document.createElement("span");
          dates.className = "semaine-dates-item";
          dates.textContent = isoAffiche(s.debut) + " – " + isoAffiche(s.fin);
          droite.appendChild(dates);
          if (idx === etat.indexSemaine) {
            var coche = document.createElement("span");
            coche.className = "coche";
            coche.textContent = "✓";
            droite.appendChild(coche);
          }
          it.appendChild(nom);
          it.appendChild(droite);
          it.addEventListener("click", function () {
            menuSemaine.classList.remove("ouvert");
            if (idx === etat.indexSemaine) return;
            etat.indexSemaine = idx;
            bullesSelectionnees = {};
            assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); majBarreSelection(); });
          });
          panneauSemaine.appendChild(it);
        };
        for (var iSem = debut; iSem <= fin; iSem++) _boucleSemaine(iSem);
      });
    }
    // §82 — les 4 contrôles masquer/afficher (Jalons/Notes/Personnel/
    // Intervenants, cf. .controles-affichage dans htmlPagePlanning ; devenus
    // des icônes .toolbar-toggle au §83, Lionel : « je préfèrerai des icones
    // pour les 4 sous-groupes ») sont un conteneur STATIQUE comme Imprimer
    // ci-dessus : câblés une seule fois ici plutôt que reconstruits à chaque
    // construireGrille(). majControlesAffichage() (appelée à chaque rendu)
    // se charge ensuite de tenir leur apparence (active/désactivée) à jour.
    var contAffichage = document.getElementById("controlesAffichage");
    if (contAffichage) {
      contAffichage.querySelectorAll(".toolbar-toggle").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var cible = btn.dataset.affichageCible;
          if (cible === "jalon") replierJalons = !replierJalons;
          else if (cible === "note") replierNotes = !replierNotes;
          else if (cible === "personnel") replierSectionPersonnel = !replierSectionPersonnel;
          else if (cible === "intervenants") replierSectionIntervenants = !replierSectionIntervenants;
          render(false);
        });
      });
    }
    // Round suivant (11.09.2026) — Lionel : « le bouton recharger doit
    // disparaitre. » Le bouton #btnReset et son câblage (oublierCache() +
    // assurerFenetreChargee(...) pour relire la fenêtre depuis le serveur)
    // sont supprimés ; oublierCache()/assurerFenetreChargee() restent
    // utilisées ailleurs (cf. synchroniser()), seul ce point d'appel dédié
    // au bouton disparaît.
    // Page Affichage (suite 62, js/page-affichage.js) : « Afficher les
    // week-ends » (#chkWeekends) et les autres réglages, retenus sur le
    // compte, avec leur aperçu.
    initPageAffichage();
    // Round du 23.09.2026 — câblage des sélecteurs de couleur (page
    // Couleurs depuis la suite 61, ex-onglet Général : htmlReglagesCouleurs()
    // dans htmlPagesReglages()), une fois leur HTML posé dans le DOM par le
    // innerHTML de construireCoquille. Défini dans js/page-couleurs.js.
    initReglagesCouleurs();
  }

