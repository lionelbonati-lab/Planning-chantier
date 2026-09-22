"use strict";
  /* ============================================================
     COQUILLE DE NAVIGATION — 9 pages + routage #app.innerHTML.
     Round du 12.09.2026 — Lionel (mockup validé, « Option 2 — onglets ») :
     remplace l'ancienne sidebar à repli automatique (portée depuis
     prototype-bulles.html, §2 de v3-inventory.md) par une barre d'onglets
     horizontale, toujours visible, IDENTIQUE sur les 9 pages — plus de
     bouton ☰ ni de panneau qui s'ouvre par-dessus le contenu. Les 5 pages
     de réglages (Général/Chantiers/Statuts/Fériés/Entrée rapide) restent
     de simples onglets, en retrait visuel (.secondaire) plutôt que
     regroupées, comme validé sur le mockup.
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
            '<button type="button" class="onglet secondaire" data-page="general">' + ICONS.gear + 'Général</button>' +
            '<button type="button" class="onglet secondaire" data-page="chantiers">' + ICONS.building + 'Chantiers</button>' +
            '<button type="button" class="onglet secondaire" data-page="statuts">' + ICONS.tag + 'Statuts</button>' +
            '<button type="button" class="onglet secondaire" data-page="feries">' + ICONS.star + 'Fériés</button>' +
            '<button type="button" class="onglet secondaire" data-page="entree-rapide">' + ICONS.bolt + 'Entrée rapide</button>' +
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
            '<div class="switcher-separateur"></div>' +
            '<button type="button" class="onglet secondaire switcher-item" data-page="general">' + ICONS.gear + 'Général</button>' +
            '<button type="button" class="onglet secondaire switcher-item" data-page="chantiers">' + ICONS.building + 'Chantiers</button>' +
            '<button type="button" class="onglet secondaire switcher-item" data-page="statuts">' + ICONS.tag + 'Statuts</button>' +
            '<button type="button" class="onglet secondaire switcher-item" data-page="feries">' + ICONS.star + 'Fériés</button>' +
            '<button type="button" class="onglet secondaire switcher-item" data-page="entree-rapide">' + ICONS.bolt + 'Entrée rapide</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    cablerNavigation();
    cablerBarreAction();
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
      // TECHNIQUE (détail dans FRONTEND-CHANGELOG.md §91) : les groupes
      // déplacés dans #toolbarSecondaire restent les MÊMES éléments (mêmes
      // id, même câblage dans cablerPagePlanning/majControlesAffichage/
      // majZoomAffichage/majSemaineAffichage, inchangés) — aucune
      // duplication de bouton ni de logique, donc aucun risque de
      // désynchronisation entre 2 copies. Sur desktop/tablette,
      // #toolbarSecondaire passe en display:contents (cf. style.css) : ses
      // enfants redeviennent des éléments flex NORMAUX de CETTE barre,
      // simplement repositionnés à leur place d'origine via `order` (posé
      // ci-dessous en style inline — un numéro de séquence par groupe/
      // séparateur, cf. le commentaire de #toolbarSecondaire dans
      // style.css pour le tableau complet) : le rendu desktop reste donc
      // rigoureusement identique à avant, bien que ces groupes ne soient
      // plus à leur ancienne place dans le HTML. Sur téléphone seulement
      // (style-mobile.css), #toolbarSecondaire devient un vrai panneau
      // déroulant (position:absolute sous cette barre), ouvert/fermé par
      // #btnPlusOutils (cf. cablerPagePlanning, fermerAutresMenusOutils
      // étendue pour l'inclure dans l'exclusion mutuelle déjà en place pour
      // #selectChantier/les .outil-menu). Les .toolbar-separateur-mobile/
      // .toolbar-btn-label/.toolbar-btn-coche/.zoom-secondaire-label
      // ajoutés ci-dessous sont TOUS masqués par défaut (style.css) : seul
      // style-mobile.css les affiche, pour donner des séparateurs
      // horizontaux + un libellé + une coche d'état à ces icônes une fois
      // dans ce panneau — jamais visibles sur desktop/tablette.
      '<div class="toolbar-sheets" id="legendeBarre">' +
        '<div class="toolbar-groupe" style="order:10">' +
          '<button type="button" class="toolbar-btn" id="btnDefaire" title="Annuler (Ctrl+Z)" aria-label="Annuler">' + ICONS.undo + '</button>' +
          '<button type="button" class="toolbar-btn" id="btnRefaire" title="Refaire (Ctrl+Y)" aria-label="Refaire">' + ICONS.redo + '</button>' +
        '</div>' +
        '<div class="toolbar-separateur" style="order:20"></div>' +
        '<div class="toolbar-separateur toolbar-separateur-mobile" style="order:15"></div>' +
        // §87 (round du 17.09.2026, suite×2) — Lionel : « l'insertion via le
        // "+" doit pouvoir se faire aussi en dehors de la vue visible,
        // actuellement limité à la semaine en cours [...] on pourrait
        // ajouter aujourd'hui/2 semaines/la navigation dans la toolbar »,
        // mockup mockup-sous-menu-outils.html à l'appui, puis ajusté :
        // « il manque un rectangle avec un numéro de semaine, type "Sem. 38"
        // cliquable [...] dans le style visuel du zoom, mais avec le même
        // comportement que l'actuel [ouvrirAllerSemaine] ». #btnSemainePill
        // réutilise .zoom-pill tel quel ; son panneau (#panneauSemaine) est
        // reconstruit à l'ouverture par cablerPagePlanning, comme
        // #pageAjoutPersonne plus bas — jamais rempli ici. Remplace
        // entièrement l'ancienne ligne coinNav/navSemaine du coin de la
        // grille (cf. son historique dans construireGrille), supprimée ce
        // round (Lionel : « on enlève la première ligne du tableau qui ne
        // sert plus »). #btnDeuxSemaines a quitté ce groupe au §91 (rejoint
        // #toolbarSecondaire plus bas, cf. son commentaire) — reste ici
        // exactement ce que le mockup téléphone garde visible en
        // permanence : la navigation semaine elle-même.
        '<div class="toolbar-groupe" style="order:70">' +
          '<button type="button" class="toolbar-btn" id="btnSemainePrec" title="Semaine précédente" aria-label="Semaine précédente">' + ICONS.chevronGauche + '</button>' +
          '<div class="outil-menu" id="menuSemaine">' +
            '<button type="button" class="zoom-pill" id="btnSemainePill" title="Aller à une semaine">Sem. ▾</button>' +
            '<div class="outil-menu-panneau semaine-panneau" id="panneauSemaine"></div>' +
          '</div>' +
          '<button type="button" class="toolbar-btn" id="btnSemaineSuiv" title="Semaine suivante" aria-label="Semaine suivante">' + ICONS.chevronDroite + '</button>' +
          '<button type="button" class="toolbar-btn" id="btnAujourdhui" title="Aller à aujourd’hui" aria-label="Aller à aujourd’hui">' + ICONS.aujourdhui + '</button>' +
        '</div>' +
        '<div class="toolbar-separateur" style="order:90"></div>' +
        '<div class="toolbar-separateur toolbar-separateur-mobile" style="order:95"></div>' +
        // §91 — chantier par défaut : reste ici, TOUJOURS visible (Lionel :
        // « chantier visible mais seulement la pastille de couleur »).
        // .nom-chantier/.caret restent dans le HTML (construireSelectChantier
        // les cible par querySelector à chaque rendu, cf. son commentaire) —
        // seule leur AFFICHAGE change sur téléphone (display:none en CSS,
        // cf. style-mobile.css), rien n'est retiré ni recâblé ici.
        '<div class="toolbar-groupe" style="order:100">' +
          '<div class="select-chantier" id="selectChantier">' +
            '<button type="button" class="select-chantier-btn" id="btnSelectChantier"><span class="swatch"></span><span class="nom-chantier">Chantier</span><span class="caret">▾</span></button>' +
            '<div class="select-chantier-panneau" id="panneauChantier"></div>' +
          '</div>' +
        '</div>' +
        '<div class="toolbar-separateur" style="order:110"></div>' +
        '<div class="toolbar-separateur toolbar-separateur-mobile" style="order:115"></div>' +
        // §91 — #menuAjoutLigne a quitté ce groupe (rejoint #toolbarSecondaire,
        // cf. son commentaire) ; #menuAjoutElement ("+") reste seul ici et
        // TOUJOURS visible (l'action la plus fréquente sur le terrain,
        // repris tel quel du mockup) — .toolbar-groupe-droite (classe sans
        // effet sur desktop/tablette, cf. style.css) pousse ce groupe ET
        // #btnPlusOutils juste à côté à l'extrémité droite de la barre,
        // SEULEMENT sur téléphone (cf. style-mobile.css) : sur desktop il
        // reste à sa place d'origine (order:130, juste après le chantier),
        // margin-left:auto n'étant défini que là-bas.
        '<div class="toolbar-groupe toolbar-groupe-droite" style="order:130">' +
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
          // §91 — bouton "⋮" (nouveau) : ouvre/ferme #toolbarSecondaire
          // (cf. cablerPagePlanning). Masqué par défaut (style.css) — n'existe
          // visuellement que sur téléphone (style-mobile.css), desktop/
          // tablette n'en ont jamais eu besoin (tout est déjà visible).
          '<button type="button" class="toolbar-btn" id="btnPlusOutils" title="Plus d’outils" aria-label="Plus d’outils">' + ICONS.dots + '</button>' +
        '</div>' +
        // §91 — panneau "⋮" : regroupe les 5 groupes retirés de la barre
        // principale sur téléphone (Imprimer, Zoom, 2 semaines, Ajouter une
        // ligne, les 4 icônes masquer/afficher) — cf. le grand commentaire
        // en tête de htmlPagePlanning() pour la technique (display:contents
        // + `order` sur desktop, vrai panneau sur téléphone).
        '<div class="toolbar-secondaire" id="toolbarSecondaire">' +
          '<div class="toolbar-groupe" style="order:30">' +
            '<button type="button" class="toolbar-btn" id="btnImprimerTitre" title="Imprimer — aperçu et export PDF de la semaine affichée">' + ICONS.print + '<span class="toolbar-btn-label">Imprimer</span></button>' +
          '</div>' +
          '<div class="toolbar-separateur" style="order:40"></div>' +
          '<div class="toolbar-separateur toolbar-separateur-mobile" style="order:35"></div>' +
          '<div class="toolbar-groupe" style="order:50">' +
            '<div class="zoom-ctrl" id="zoomCtrl">' +
              '<span class="zoom-secondaire-label">Zoom</span>' +
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
          '<div class="toolbar-separateur" style="order:60"></div>' +
          '<div class="toolbar-separateur toolbar-separateur-mobile" style="order:65"></div>' +
          '<div class="toolbar-groupe" style="order:80">' +
            '<button type="button" class="toolbar-btn" id="btnDeuxSemaines" title="Afficher 2 semaines à la fois" aria-label="Afficher 2 semaines à la fois">' + ICONS.deuxSemaines + '<span class="toolbar-btn-label">Afficher 2 semaines</span><span class="toolbar-btn-coche">✓</span></button>' +
          '</div>' +
          '<div class="toolbar-separateur toolbar-separateur-mobile" style="order:100"></div>' +
          '<div class="toolbar-groupe" style="order:120">' +
            '<div class="outil-menu" id="menuAjoutLigne">' +
              '<button type="button" class="toolbar-btn" id="btnAjoutLigne" title="Ajouter une ligne — Personnel ou Intervenant">' + ICONS.ajoutLigne + '<span class="toolbar-btn-label">Ajouter une ligne</span></button>' +
              '<div class="outil-menu-panneau">' +
                '<div class="outil-menu-titre">Ajouter une ligne</div>' +
                '<button type="button" class="outil-menu-item" data-ligne="personnel">' + ICONS.people + 'Personnel</button>' +
                '<button type="button" class="outil-menu-item" data-ligne="intervenant">' + ICONS.hardhat + 'Intervenant</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="toolbar-separateur" style="order:140"></div>' +
          '<div class="toolbar-separateur toolbar-separateur-mobile" style="order:135"></div>' +
          '<div class="toolbar-groupe" id="controlesAffichage" style="order:150">' +
            '<button type="button" class="toolbar-toggle actif" data-affichage-cible="jalon" title="Masquer/afficher Jalons">' + ICONS.flag + '<span class="toolbar-btn-label">Jalons</span><span class="toolbar-btn-coche">✓</span></button>' +
            '<button type="button" class="toolbar-toggle actif" data-affichage-cible="note" title="Masquer/afficher Notes">' + ICONS.note + '<span class="toolbar-btn-label">Notes</span><span class="toolbar-btn-coche">✓</span></button>' +
            '<button type="button" class="toolbar-toggle actif" data-affichage-cible="personnel" title="Masquer/afficher Personnel">' + ICONS.people + '<span class="toolbar-btn-label">Personnel</span><span class="toolbar-btn-coche">✓</span></button>' +
            '<button type="button" class="toolbar-toggle actif" data-affichage-cible="intervenants" title="Masquer/afficher Intervenants">' + ICONS.hardhat + '<span class="toolbar-btn-label">Intervenants</span><span class="toolbar-btn-coche">✓</span></button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="zone-planning">' +
        '<div id="racine"></div>' +
        '<div class="barre-action" id="barreAction" hidden>' +
          '<button type="button" id="baAnnuler" class="ovale-neutre">Annuler</button>' +
          '<button type="button" id="baSupprimer" class="ovale-danger">Supprimer</button>' +
          '<button type="button" id="baCopier" class="ovale-bleu" hidden>Copier</button>' +
          '<button type="button" id="baDeplacer" class="ovale-bleu" hidden>Déplacer</button>' +
        '</div>' +
      '</div>' +
      '</div></div></div>';
  }
  function htmlPageJalons() {
    return '<div class="page" id="page-jalons"><div class="page-scroll">' +
      '<div class="page-titre"><h1>Jalons</h1></div>' +
      '<p class="page-sous">Étapes clés d’un chantier (livraison, coulage, réception…), sur une durée aussi longue que nécessaire — indépendant des semaines affichées dans le planning.</p>' +
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
      '</div></div>';
  }
  function htmlPagePersonnel() {
    return '<div class="page" id="page-personnel"><div class="page-scroll">' +
      '<div class="page-titre"><h1>Personnel</h1></div>' +
      '<p class="page-sous">L’équipe interne.</p>' +
      '<div class="liste-intervenants" id="listePersonnel"></div>' +
      '</div></div>';
  }
  function htmlPageIntervenants() {
    return '<div class="page" id="page-intervenants"><div class="page-scroll">' +
      '<div class="page-titre"><h1>Intervenants</h1></div>' +
      '<p class="page-sous">Les sous-traitants — leurs tâches ont un champ Statut, pas le personnel.</p>' +
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
      planning: ajusterEnteteFixe
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
          menuAjoutLigne.classList.remove("ouvert");
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
    if (btnSemainePrec) btnSemainePrec.addEventListener("click", function () { naviguerSemaine(-1); });
    if (btnSemaineSuiv) btnSemaineSuiv.addEventListener("click", function () { naviguerSemaine(1); });
    if (btnAujourdhuiBarre) btnAujourdhuiBarre.addEventListener("click", allerAujourdhui);
    if (btnDeuxSemainesBarre) btnDeuxSemainesBarre.addEventListener("click", basculerDeuxSemaines);
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
  }

