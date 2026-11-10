"use strict";
  /* ============================================================
     COMMENT ÇA MARCHE — round du 10.11.2026 (suite 159)
     ------------------------------------------------------------
     Lionel : « J'aimerais que tu écrives une page, comment ça marche,
     pour ceux qui se connectent la première fois, afin d'expliquer un peu
     toutes les fonctionnalités de l'application. Si jamais sur la tablette
     qu'on a au travail, on a un stylet, ce stylet agit comme un de gauche
     souris. Et quand on appuie avec le doigt, ce sera plutôt un clic
     droit. » Ses choix : stylet et doigt « L'expliquer dans la page » (rien
     ne change dans l'appli : le stylet y fait déjà le clic gauche, l'appui
     long du doigt le clic droit) ; affichage « 1re connexion + Réglages » ;
     forme « Une page à sections ».

     Page Réglages › Comment ça marche (#page-aide) : une section
     dépliable (<details>) par sujet ; « Gestes pour » Ordinateur,
     Tablette ou Téléphone (celui de cet appareil choisi d'office,
     appareilRetour_, js/page-retours.js) : les passages marqués
     data-pour ne s'affichent que pour l'appareil choisi. Ouverte toute
     seule à la première connexion d'un compte, après le choix de son mot
     de passe (aideAOuvrir_, js/core.js).
     ============================================================ */

  var APPAREILS_AIDE_ = [["ordinateur", "Ordinateur"], ["tablette", "Tablette"], ["telephone", "Téléphone"]];
  var appareilAide_ = null;

  // Tableau de gestes : [[geste, effet], …].
  function gestesAide_(lignes) {
    return '<table class="aide-gestes"><tbody>' + lignes.map(function (l) {
      return '<tr><th scope="row">' + l[0] + '</th><td>' + l[1] + '</td></tr>';
    }).join("") + '</tbody></table>';
  }
  // Passages d'un appareil : bloc (pour_), ligne de liste (pourLi_), ou
  // morceau de phrase (pourTexte_).
  function pour_(appareils, html) { return '<div data-pour="' + appareils + '">' + html + '</div>'; }
  function pourLi_(appareils, html) { return '<li data-pour="' + appareils + '">' + html + '</li>'; }
  function pourTexte_(appareils, html) { return '<span data-pour="' + appareils + '">' + html + '</span>'; }

  var SECTIONS_AIDE_ = [
    { titre: "Pour commencer", ouverte: true, html:
      '<p>Le planning montre, semaine par semaine, qui travaille où : une ligne par personne, une case par demi-journée (matin et après-midi). Chaque tâche est une « bulle » de la couleur de son chantier.</p>' +
      '<ul>' +
        '<li>Les onglets (Planning, Jalons, Notes, Personnel, Intervenants, Machines, Transports, Chantiers, Statuts, Horaires) mènent aux différentes pages.' +
          pourTexte_("telephone", ' Sur le téléphone, ils sont dans le sélecteur en bas de l’écran.') + '</li>' +
        '<li>La pastille ronde à ton initiale ouvre les réglages : Mon compte, Affichage, Couleurs, Notifications… La croix les referme.</li>' +
        '<li>Tout est enregistré tout de suite, sans bouton « Enregistrer ». Les boutons Annuler et Refaire de la barre défont ou refont le dernier changement' + pourTexte_("ordinateur", ' (Ctrl+Z, Ctrl+Y)') + '.</li>' +
        '<li>Le mode sélection est celui de départ : un toucher ou un clic sélectionne. Le mode ajout (son icône, à côté du « + ») sert à poser des tâches à la chaîne.</li>' +
      '</ul>' },
    { titre: "Les gestes", html:
      pour_("ordinateur", gestesAide_([
        ["Clic", "Sélectionner une bulle (recliquer : désélectionner ; Ctrl+clic : en ajouter d’autres)"],
        ["Glisser une bulle", "La déplacer (Maj : la copier)"],
        ["Glisser le bord d’une bulle", "L’allonger ou la raccourcir"],
        ["Glisser sur des cases", "Sélectionner toutes les bulles d’une zone"],
        ["Clic droit", "Menu de la bulle ou de la case : ajouter, modifier, couper, copier, coller, supprimer"],
        ["Clic sur un nom ou un jour", "Sélectionner toute la ligne ou toute la colonne"],
        ["Mode ajout : clic sur une case vide", "Ajouter une tâche (glisser : sur plusieurs demi-journées ou personnes)"]
      ]) + '<p>Clavier : Entrée modifie la bulle sélectionnée, Suppr la supprime, ← → la décalent d’une demi-journée (Maj : d’un jour), Ctrl+C / Ctrl+X / Ctrl+V copient, coupent et collent, Échap ferme une fenêtre ou quitte la sélection. Toute la liste : Réglages › Raccourcis clavier.</p>') +
      pour_("tablette", '<p class="aide-encadre"><b>Avec un stylet</b>, la pointe fait le clic gauche de la souris : toucher pour sélectionner, glisser pour déplacer une bulle ou sélectionner une zone, comme à la souris. <b>Avec le doigt</b>, l’appui long fait le clic droit : il ouvre le menu de la bulle ou de la case.</p>') +
      pour_("tablette telephone", gestesAide_([
        ["Toucher une bulle", "La sélectionner"],
        ["Double toucher une bulle", "Ouvrir sa fiche pour la modifier"],
        ["Appui long sur une bulle", "Son menu (comme le clic droit) : modifier, couper, copier, coller, supprimer, sélection multiple"],
        ["Appui long puis glisser", "Déplacer la bulle"],
        ["Double toucher une case vide", "Ajouter (tâche, absence…)"],
        ["Appui long sur une case", "Menu de la case ; appui long puis glisser : sélectionner toutes les bulles d’une zone"],
        ["Glisser sur le vide", "Faire défiler le planning"],
        ["Mode ajout : appui long sur une case vide", "Ajouter une tâche (puis glisser : sur plusieurs demi-journées ou personnes)"]
      ]) + '<p>« Sélection multiple », dans le menu d’une bulle : touche ensuite d’autres bulles pour les ajouter à la sélection.</p>') +
      '<p>Une sélection fait apparaître sa barre : Modifier, Copier (le prochain déplacement copie au lieu de déplacer), Important, Statut, Supprimer et × pour désélectionner.</p>' },
    { titre: "Se déplacer dans le planning", html:
      '<ul>' +
        '<li>« Aujourd’hui » revient au jour même ; l’icône calendrier mène à un jour choisi ; ‹ et › passent à la semaine précédente ou suivante, et « Sem. N » à une autre semaine.</li>' +
        pourLi_("ordinateur tablette", 'Le bouton de vue choisit 1 semaine, les jours voisins ou 2 semaines. − et + règlent le zoom.') +
        pourLi_("telephone", 'Le téléphone montre 1 jour ou 1 semaine (bouton de vue). En vue 1 jour, glisse vers la gauche ou la droite pour passer au jour voisin.') +
        pourLi_("ordinateur", 'Touches : P et S semaine précédente et suivante, A aujourd’hui, D choisir une date, V changer de vue, W afficher ou masquer les week-ends.') +
        '<li>Les week-ends, la vue d’ouverture et le style des bulles se règlent dans Réglages › Affichage ; les couleurs dans Réglages › Couleurs.</li>' +
      '</ul>' },
    { titre: "Ajouter une tâche, une absence, un jalon, une note", html:
      '<ul>' +
        '<li>Le « + » de la barre ouvre le menu Ajouter : tâche, absence, jalon ou note, sans viser de case.</li>' +
        pourLi_("ordinateur", 'Sur le planning : clic droit sur une case vide, puis « Ajouter » ; ou, en mode ajout, un clic sur la case.') +
        pourLi_("tablette telephone", 'Sur le planning : double toucher une case vide ; ou, en mode ajout, un appui long sur la case.') +
        '<li>La fiche d’une tâche : texte, chantier, statut, « Important » (la bulle ressort, et la cloche la rappelle les 7 jours qui précèdent), « Série (se répète) » pour une tâche qui revient, et « Détails et fichiers » pour un texte plus long, des photos ou des plans (bouton « Joindre »).</li>' +
        '<li>Les entrées rapides (sous-onglet de Personnel et d’Intervenants) mettent les tâches courantes directement dans le menu Ajouter.</li>' +
        '<li>Une nouvelle ligne (personne, intervenant, équipe) s’ajoute par le bouton « Ajouter une ligne » de la barre.</li>' +
      '</ul>' },
    { titre: "Absences et demandes de congé", html:
      '<ul>' +
        '<li>Une absence (congé, maladie, formation…) se pose comme une tâche, en choisissant « Absence » dans le menu Ajouter. Avec une heure dans le texte (« Arrivée 9h30 », « Départ 16h15 »), elle ne couvre qu’une partie de la demi-journée.</li>' +
        '<li>Les ouvriers demandent leurs congés depuis leur lien de consultation. La demande arrive dans la cloche (Notifications) du planning où l’ouvrier est affiché, sinon chez l’administrateur : « Voir », « Refuser » ou « Accepter ».</li>' +
        '<li>Une absence acceptée ou posée apparaît dans tous les plannings de l’entreprise.</li>' +
      '</ul>' },
    { titre: "Jalons et notes", html:
      '<ul>' +
        '<li>Les jalons (livraison, réception, échéance) et les notes ont leurs propres lignes dans le planning ; chaque section se replie.</li>' +
        '<li>Les pages Jalons et Notes les listent tous, pour les retrouver, les modifier ou les supprimer.</li>' +
      '</ul>' },
    { titre: "Personnel, intervenants, machines, transports", html:
      '<ul>' +
        '<li>Une ligne par personne, intervenant, machine ou transport. La coche « Afficher » met la ligne dans ton planning : chacun coche les siens.</li>' +
        '<li>L’ordre des lignes se change en glissant le nom' + pourTexte_("tablette telephone", ' (au doigt : « Monter » / « Descendre » dans le menu du nom)') + ' ; la hauteur d’une ligne, en glissant le trait sous le nom.</li>' +
        '<li>Une équipe est une ligne dont on choisit les membres semaine par semaine (menu du nom) ; chaque membre voit les tâches de l’équipe sur son lien de consultation.</li>' +
        '<li>Le lien de consultation (icône des maillons, dans Personnel) est à envoyer à un ouvrier : sans compte, il voit son planning, les détails de ses tâches et demande ses congés.</li>' +
      '</ul>' },
    { titre: "Chantiers, statuts, horaires", html:
      '<ul>' +
        '<li>Chantiers : nom, couleur (chacun peut choisir la sienne) et emplacement sur la carte, pour que l’ouvrier ouvre le trajet depuis son lien. Un chantier terminé se désactive.</li>' +
        '<li>Statuts : « à réserver », « confirmé »… La cloche liste les tâches encore à réserver.</li>' +
        '<li>Horaires : les heures de travail par période, les jours fériés et les vacances d’entreprise. Elles servent aussi au moment des notifications.</li>' +
      '</ul>' },
    { titre: "Imprimer", html:
      '<ul>' +
        '<li>L’icône d’imprimante de la barre ouvre l’aperçu de la semaine affichée, à imprimer ou à enregistrer en PDF.</li>' +
        '<li>Réglages › Mise en page d’impression : ce qui est imprimé, et comment.</li>' +
      '</ul>' },
    { titre: "Notifications", html:
      '<ul>' +
        '<li>La cloche de la barre rassemble ce qui attend : demandes d’absence, tâches à réserver et importants des 7 prochains jours.</li>' +
        '<li>Réglages › Notifications les envoie aussi sur cet appareil (téléphone, tablette ou ordinateur), même appli fermée : demandes d’absence, importants et tâches à réserver x jours de travail avant, changements faits sur un autre appareil. Chaque appareil se règle à part.</li>' +
      '</ul>' },
    { titre: "Partager le planning, les comptes", html:
      '<ul>' +
        '<li>Réglages › Liens responsables : un lien en lecture seule, à envoyer à un responsable, pour voir le planning de la semaine et des 4 suivantes, sans compte.</li>' +
        '<li>Plusieurs comptes peuvent travailler dans l’entreprise. Les chantiers, le personnel, les intervenants, les machines, les statuts, les horaires et les fériés sont communs. Chaque planning garde ses tâches, ses jalons, ses notes, ses lignes affichées et ses couleurs.</li>' +
        '<li>L’administrateur crée les comptes dans Réglages › Comptes.</li>' +
      '</ul>' },
    { titre: "Sans réseau, sur l’écran d’accueil", html:
      '<ul>' +
        '<li>Sans réseau, le planning déjà ouvert sur l’appareil reste lisible, et les changements faits sur la grille partent dès que le réseau revient.</li>' +
        '<li>L’icône de téléchargement en haut, quand elle est là, installe l’appli sur l’écran d’accueil ou le bureau, comme une vraie application.</li>' +
        '<li>Réglages › Sauvegardes : tout le planning est copié chaque nuit ; « Restaurer » revient en arrière après une grosse erreur.</li>' +
      '</ul>' },
    { titre: "Une idée, un problème ?", html:
      '<p>Réglages › Améliorations et bugs : note une idée ou un problème dans sa case, puis « Envoyer ». Tout est gardé et relu quand on en discute.</p>' }
  ];

  function htmlContenuPageAide() {
    return '<div class="page-titre"><h1>Comment ça marche</h1></div>' +
      '<p class="page-sous">Les fonctions de l’appli en bref. Touche un sujet pour le déplier.</p>' +
      '<div class="retours-concerne aide-appareil"><span class="retours-concerne-nom">Gestes pour</span>' +
        '<div class="bascule-appareil" role="radiogroup" aria-label="Appareil">' +
          APPAREILS_AIDE_.map(function (a) {
            return '<button type="button" class="bascule-profil" role="radio" data-appareil-aide="' + a[0] + '">' + esc(a[1]) + '</button>';
          }).join("") +
        '</div></div>' +
      '<div class="aide" id="aideSections">' +
        SECTIONS_AIDE_.map(function (s) {
          return '<details class="aide-section"' + (s.ouverte ? " open" : "") + '><summary>' + esc(s.titre) + '</summary><div class="aide-corps">' + s.html + '</div></details>';
        }).join("") +
      '</div>';
  }

  function majAppareilAide_() {
    var page = document.getElementById("page-aide");
    if (!page) return;
    page.querySelectorAll("[data-appareil-aide]").forEach(function (b) {
      var actif = b.dataset.appareilAide === appareilAide_;
      b.classList.toggle("actif", actif);
      b.setAttribute("aria-checked", actif ? "true" : "false");
    });
    page.querySelectorAll("[data-pour]").forEach(function (el) {
      el.hidden = el.dataset.pour.split(" ").indexOf(appareilAide_) < 0;
    });
  }

  function renderAide() {
    if (!appareilAide_) appareilAide_ = typeof appareilRetour_ === "function" ? appareilRetour_() : "ordinateur";
    majAppareilAide_();
  }

  function cablerPageAide() {
    var page = document.getElementById("page-aide");
    if (!page || page.dataset.cable) return;
    page.dataset.cable = "1";
    page.querySelectorAll("[data-appareil-aide]").forEach(function (b) {
      b.addEventListener("click", function () { appareilAide_ = b.dataset.appareilAide; majAppareilAide_(); });
    });
    renderAide();
  }

  // Première connexion (mot de passe provisoire remplacé, js/core.js) : la
  // page s'ouvre une fois le planning chargé.
  function ouvrirAideSiPremiereConnexion() {
    if (!aideAOuvrir_) return;
    aideAOuvrir_ = false;
    afficherPage("aide");
  }
