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
            '<button type="button" class="onglet actif" data-page="planning">' + ICONS.calendar + 'Planning</button>' +
            '<button type="button" class="onglet" data-page="jalons">' + ICONS.flag + 'Jalons</button>' +
            '<button type="button" class="onglet" data-page="personnel">' + ICONS.people + 'Personnel</button>' +
            '<button type="button" class="onglet" data-page="intervenants">' + ICONS.hardhat + 'Intervenants</button>' +
            '<button type="button" class="onglet" data-page="general">' + ICONS.gear + 'Général</button>' +
            '<button type="button" class="onglet" data-page="chantiers">' + ICONS.building + 'Chantiers</button>' +
            '<button type="button" class="onglet" data-page="statuts">' + ICONS.tag + 'Statuts</button>' +
            '<button type="button" class="onglet" data-page="feries">' + ICONS.star + 'Fériés</button>' +
            '<button type="button" class="onglet" data-page="entree-rapide">' + ICONS.bolt + 'Entrée rapide</button>' +
          '</div>' +
          '<button type="button" class="avatar-nav" id="lienDeconnexionNav" title="Se déconnecter" aria-label="Se déconnecter">L</button>' +
        '</nav>' +
        '<div class="app-main">' +
          htmlPagePlanning() + htmlPageJalons() + htmlPageGeneral() + htmlPagePersonnel() + htmlPageIntervenants() +
          htmlPageChantiers() + htmlPageStatuts() + htmlPageEntreeRapide() + htmlPageFeries() +
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
          '<button type="button" class="avatar-nav" id="lienDeconnexionNavBas" title="Se déconnecter" aria-label="Se déconnecter">L</button>' +
          '<div class="switcher-panneau" id="switcherPanneau">' +
            '<div class="switcher-titre">Pages</div>' +
            '<button type="button" class="onglet switcher-item actif" data-page="planning">' + ICONS.calendar + 'Planning</button>' +
            '<button type="button" class="onglet switcher-item" data-page="jalons">' + ICONS.flag + 'Jalons</button>' +
            '<button type="button" class="onglet switcher-item" data-page="personnel">' + ICONS.people + 'Personnel</button>' +
            '<button type="button" class="onglet switcher-item" data-page="intervenants">' + ICONS.hardhat + 'Intervenants</button>' +
            '<button type="button" class="onglet switcher-item" data-page="general">' + ICONS.gear + 'Général</button>' +
            '<button type="button" class="onglet switcher-item" data-page="chantiers">' + ICONS.building + 'Chantiers</button>' +
            '<button type="button" class="onglet switcher-item" data-page="statuts">' + ICONS.tag + 'Statuts</button>' +
            '<button type="button" class="onglet switcher-item" data-page="feries">' + ICONS.star + 'Fériés</button>' +
            '<button type="button" class="onglet switcher-item" data-page="entree-rapide">' + ICONS.bolt + 'Entrée rapide</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    cablerNavigation();
    cablerPagePlanning();
    cablerPageEntreeRapide();
    cablerPageFeries();
    // §80 : le lien flottant (position:fixed, cf. afficherLienDeconnexion) ne
    // sert plus qu'à la fenêtre entre connexion et 1er rendu — la vraie
    // coquille étant maintenant construite, il devient redondant avec le
    // bouton juste posé dans la barre d'onglets ci-dessus.
    var flottant = document.getElementById("lienDeconnexion");
    if (flottant) flottant.remove();
    // §91 — 2 boutons de déconnexion coexistent désormais (barre du haut,
    // masquée sur téléphone + barre basse, visible seulement là) : même
    // action pour les deux, extraite ici plutôt que dupliquée inline comme
    // avant ce round.
    function deconnecter() {
      sbClient.auth.signOut().then(function () { window.location.reload(); });
    }
    document.getElementById("lienDeconnexionNav").addEventListener("click", deconnecter);
    document.getElementById("lienDeconnexionNavBas").addEventListener("click", deconnecter);
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
        '<div class="toolbar-groupe sep-avant" id="groupeAujourdhui" data-rang="40">' +
          '<button type="button" class="toolbar-btn" id="btnAujourdhui" title="Aller à aujourd’hui" aria-label="Aller à aujourd’hui">' + ICONS.aujourdhui + '</button>' +
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
          '<button type="button" class="toolbar-btn" id="btnVueJourMobile" title="Afficher la semaine complète" aria-label="Afficher la semaine complète">' + ICONS.semaineMobile + '<span class="toolbar-btn-label">1 semaine</span><span class="toolbar-btn-coche">✓</span></button>' +
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
        // zone), puis ✕. Placée ici, dans #page-planning, pour disparaître
        // avec l'onglet ; hors de #legendeBarre pour ne jamais compter dans
        // la mesure de débordement de la barre d'outils.
        '<div class="panneau-selection" id="panneauSelection" hidden>' +
          '<button type="button" class="toolbar-btn" id="selModifier" title="Modifier (Entrée)" aria-label="Modifier">' + ICONS.pencil + '</button>' +
          '<button type="button" class="toolbar-btn" id="selCopier" title="Copier au prochain déplacement (flèches ou glisser) au lieu de déplacer" aria-label="Copier au prochain déplacement">' + ICONS.copy + '</button>' +
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
      '<p class="page-sous">Étapes clés d’un chantier (livraison, coulage, réception…), sur une durée aussi longue que nécessaire — indépendant des semaines affichées dans le planning.</p>' +
      // Round du 23.09.2026 (suite) — à la demande de Lionel, le réglage de
      // couleur "Jalon" est déplacé ici (sur sa page naturelle) plutôt que
      // sur Général. Cf. js/page-couleurs.js.
      htmlReglagesCouleurs('jalons') +
      '<div class="liste-intervenants" id="listeJalons"></div>' +
      '</div></div>';
  }
  function htmlPageGeneral() {
    return '<div class="page" id="page-general"><div class="page-scroll">' +
      '<div class="page-titre"><h1>Général</h1></div>' +
      '<p class="page-sous">Réglages d’affichage du planning (locaux à cet appareil, non partagés — cf. FRONTEND-CHANGELOG.md).</p>' +
      '<label class="reglage-ligne"><span class="reglage-texte"><b>Afficher les week-ends</b>' +
      '<span>Ajoute Samedi et Dimanche à la fin de chaque semaine, pour y poser une tâche ponctuelle.</span></span>' +
      '<span class="interrupteur"><input type="checkbox" id="chkWeekends"><span class="interrupteur-piste"></span></span></label>' +
      // Round du 23.09.2026 — page de réglages des couleurs, cf.
      // js/page-couleurs.js (données + logique). Générée par
      // htmlReglagesCouleurs() plutôt qu'écrite ici en dur : la liste des
      // groupes de couleurs vit dans un seul fichier, pas dupliquée.
      htmlReglagesCouleurs() +
      '</div></div>';
  }
  function htmlPagePersonnel() {
    return '<div class="page" id="page-personnel"><div class="page-scroll">' +
      '<div class="page-titre"><h1>Personnel</h1></div>' +
      '<p class="page-sous">L’équipe interne.</p>' +
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
      '<p class="page-sous">Les sous-traitants — leurs tâches ont un champ Statut, pas le personnel.</p>' +
      // Round du 23.09.2026 (suite) — idem Personnel, cf. js/page-couleurs.js.
      htmlReglagesCouleurs('intervenants') +
      '<div class="liste-intervenants" id="listeIntervenants"></div>' +
      '</div></div>';
  }
  function htmlPageChantiers() {
    return '<div class="page" id="page-chantiers"><div class="page-scroll">' +
      '<div class="page-titre"><h1>Chantiers</h1></div>' +
      '<p class="page-sous">Couleur utilisée dans la grille et les formulaires. Renommer met à jour toutes les cases déjà remplies du planning (y compris les semaines passées). Désactiver retire le chantier des listes pour une nouvelle tâche, sans toucher aux cases déjà posées (historique intact) ; le supprimer pour de bon (dans « Désactivés ») vide en plus toutes ces cases, y compris passées — irréversible.</p>' +
      '<div class="liste-intervenants" id="listeChantiers"></div>' +
      '</div></div>';
  }
  function htmlPageStatuts() {
    return '<div class="page" id="page-statuts"><div class="page-scroll">' +
      '<div class="page-titre"><h1>Statuts</h1></div>' +
      '<p class="page-sous">Statuts disponibles pour les tâches des intervenants (sous-traitants).</p>' +
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
  function htmlPageFeries() {
    return '<div class="page" id="page-feries"><div class="page-scroll">' +
      '<div class="page-titre"><h1>Fériés</h1>' +
        '<div class="nav-annee"><button type="button" class="fleche" id="ferieAnneePrec">&larr;</button><span id="ferieAnneeLabel"></span><button type="button" class="fleche" id="ferieAnneeSuiv">&rarr;</button></div>' +
        '<div class="actions-feries"><button class="btn-calculer" id="btnCalculerFeries" type="button">Calculer les fériés</button><button class="btn-effacer" id="btnEffacerFeries" type="button">Effacer l’année</button><button class="btn-enregistrer" id="btnEnregistrerFeries" type="button">Enregistrer</button></div>' +
      '</div>' +
      '<p class="page-sous">Choisis une catégorie ci-dessous puis clique les dates à colorer (reclic = efface). « Calculer les fériés » ajoute les jours fériés suisses fixes/mobiles de l’année et les ponts qui en dépendent, en catégorie Férié — vacances d’entreprise restent à poser à la main. Rien n’est écrit sur le serveur tant que tu n’as pas cliqué Enregistrer.</p>' +
      '<div class="categories" id="ferieCategories"></div>' +
      '<div class="calendrier-wrap"><table class="calendrier" id="ferieCalendrier"></table></div>' +
      '<div class="legende-feries">Semaines grisées, dates qui n’existent pas (ex. 30/31 février) en noir et non cliquables.</div>' +
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
  function cablerNavigation() {
    // §91 (round du 22.09.2026, suite) — querySelectorAll(".onglet") capte
    // maintenant 18 boutons (9 de .onglets-nav en haut + 9 de
    // #switcherPanneau en bas, cf. construireCoquille) plutôt que 9 : la
    // même classe + le même data-page sur les 2 jeux de boutons suffit à
    // les câbler TOUS ici, sans rien dupliquer côté logique.
    var ongletsBtns = document.querySelectorAll(".onglet");
    var switcherBtn = document.getElementById("switcherBtn");
    var switcherIcone = document.getElementById("switcherIcone");
    var switcherNom = document.getElementById("switcherNom");
    var switcherPanneau = document.getElementById("switcherPanneau");
    var RENDU_PAR_PAGE = {
      jalons: renderJalons, personnel: renderPersonnel, intervenants: renderIntervenants,
      chantiers: renderChantiers, statuts: renderStatuts,
      "entree-rapide": renderFormulaires, feries: renderFeries,
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
    function fermerSwitcher() {
      if (switcherBtn) switcherBtn.classList.remove("ouvert");
      if (switcherPanneau) switcherPanneau.classList.remove("ouvert");
    }
    ongletsBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        // §91 — comparaison par data-page (et non plus par référence exacte
        // au bouton cliqué) : un clic sur .onglet OU sur .switcher-item pour
        // la même page doit teinter les DEUX exemplaires (haut ET bas),
        // puisque les 2 barres peuvent coexister dans le DOM (l'une des
        // deux simplement masquée en CSS selon la largeur d'écran).
        ongletsBtns.forEach(function (b) { b.classList.toggle("actif", b.dataset.page === btn.dataset.page); });
        document.querySelectorAll(".page").forEach(function (p) { p.classList.remove("actif"); });
        var page = document.getElementById("page-" + btn.dataset.page);
        if (page) page.classList.add("actif");
        // §91 — resynchronise l'icône/le libellé du sélecteur de page bas
        // d'écran sur la page réellement choisie, quel que soit le bouton
        // cliqué (barre du haut OU liste du bas) : le texte du bouton
        // cliqué porte déjà exactement le même libellé que l'entrée
        // correspondante (même page, cf. construireCoquille), textContent
        // suffit donc (aucun nœud de texte dans le svg de l'icône). AVANT
        // fn() ci-dessous à dessein : cette barre de navigation doit rester
        // cohérente même si le rendu de la page ciblée échoue (ex. souci
        // réseau dans un render*() qui charge ses données à la demande).
        if (switcherIcone) {
          var svg = btn.querySelector("svg");
          if (svg) switcherIcone.innerHTML = svg.outerHTML;
        }
        if (switcherNom) switcherNom.textContent = btn.textContent.trim();
        fermerSwitcher();
        var fn = RENDU_PAR_PAGE[btn.dataset.page];
        if (fn) fn();
      });
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
    document.addEventListener("click", fermerSwitcher);
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
          ouvrirAjoutPersonne(btn.dataset.ligne === "intervenant");
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
          var liste = type === "absence" ? PERSONNES.filter(function (p) { return !p.sousTraitant; }) : PERSONNES;
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
    document.getElementById("selSupprimer").addEventListener("click", supprimerSelection);
    document.getElementById("selFermer").addEventListener("click", function () { quitterModeSelection(); render(false); });
    if (btnDeuxSemainesBarre) btnDeuxSemainesBarre.addEventListener("click", basculerDeuxSemaines);
    if (btnVueJourMobileBarre) btnVueJourMobileBarre.addEventListener("click", basculerVueJourMobile);
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
    var chk = document.getElementById("chkWeekends");
    if (chk) {
      chk.checked = afficherWeekends;
      chk.addEventListener("change", function () { afficherWeekends = chk.checked; render(false); });
    }
    // Round du 23.09.2026 — câblage des sélecteurs de couleur de la page
    // Général, une fois leur HTML (htmlReglagesCouleurs(), ci-dessus dans
    // htmlPageGeneral()) posé dans le DOM par le innerHTML tout en haut de
    // cette fonction. Définie dans js/page-couleurs.js.
    initReglagesCouleurs();
  }

