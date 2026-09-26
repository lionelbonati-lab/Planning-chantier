// page-couleurs.js — Round du 23.09.2026. Lionel : « j'aimerai pouvoir
// changer les couleurs des éléments sans passer par le code. Crée une page
// dans le menu général. Certains éléments pourraient être regroupés sous
// la même couleur. » Tableau xlsx envoyé pour qu'il choisisse les
// regroupements, rempli sur son Google Drive puis confirmé avec lui
// (cf. FRONTEND-CHANGELOG.md pour le round complet).
//
// Principe : chaque "groupe" ci-dessous pilote une ou plusieurs variables
// CSS (--accent, --bg, etc.) avec UNE SEULE couleur choisie par Lionel —
// c'est le regroupement qu'il a demandé. Tant qu'il n'a rien choisi pour un
// groupe, rien ne change (les variables gardent leur valeur d'origine
// posée dans style.css) : seuls les groupes explicitement enregistrés sont
// appliqués, en clair et en sombre séparément.
//
// Round du 24.09.2026 — Lionel : « Les couleurs devrait être les mêmes sur
// tous les appareils du même compte. Comme les chantiers. » Portée
// initialement locale à cet appareil (localStorage), changée d'avis ici :
// la table `couleurs_perso` (sql, RLS "connecte_tout" comme chantiers/
// statuts/etc.) est désormais la SOURCE DE VÉRITÉ, partagée par tout le
// monde connecté — cf. window.etat.couleursPerso, peuplé par
// js/donnees-sync.js (fetch parallèle au démarrage, comme chantiers/
// statuts/fériés). localStorage n'est PAS retiré : il redevient un simple
// CACHE local anti-flash (peindre les bonnes couleurs tout de suite au
// chargement du script, avant même que core.js/donnees-sync.js aient eu le
// temps de s'exécuter et de répondre au réseau — cf. lireReglages/
// appliquerCouleursPersonnalisees plus bas), resynchronisé sur le serveur à
// chaque réponse réussie et à chaque écriture de cet appareil, pour rester
// représentatif même hors-ligne.
(function () {
  var CLE_STOCKAGE = "planning.couleurs";

  // "champs" : les variables CSS pilotées par ce groupe. `alpha`, quand
  // présent, dit que la variable est une rgba() dont on ne remplace que le
  // r/g/b — la transparence d'origine (--shadow, --bubble-ink, etc.) est
  // gardée telle quelle, on ne demande pas à Lionel de la régler.
  //
  // Round du 26.09.2026 (suite 56) — Lionel : « Sélection des couleurs,
  // enlève les descriptions des couleurs. Cela allonge la liste pour aucune
  // plus value. » Le champ `description` de chaque groupe n'est plus
  // affiché nulle part : il reste ici en commentaire, pour savoir ce que
  // couvre chaque groupe en lisant le code.
  var GROUPES_COULEURS = [
    {
      id: "principale", nom: "Couleur principale de l'appli",
      // Boutons actifs, liens, cases sélectionnées, et texte de l'onglet actif (regroupés à ta demande).
      champs: [{ v: "--accent" }],
      defautClair: "#1f4d8f", defautSombre: "#6fa6e8"
    },
    {
      id: "onglet-fond", nom: "Fond de l'onglet actif",
      // Fond ovale derrière le nom de la page ouverte (aussi fond de survol de nombreux boutons).
      champs: [{ v: "--accent-soft" }],
      defautClair: "#e3ecf7", defautSombre: "#223247"
    },
    {
      id: "erreur-important", nom: "Erreur, suppression et étoile « important »",
      // Regroupés à ta demande : ces 3 éléments prendront la même couleur.
      champs: [{ v: "--danger" }, { v: "--important-ink" }, { v: "--important-toggle-bg" }],
      defautClair: "#b3372f", defautSombre: "#e0685f"
    },
    {
      id: "absence", nom: "Absence",
      // Fond des cases d'absence et badge de type d'absence.
      champs: [{ v: "--absence-bg" }],
      defautClair: "#f6c893", defautSombre: "#f6c893"
    },
    {
      id: "fond", nom: "Fond général, cases et coin",
      // Regroupés à ta demande : le fond général de l'appli, le fond des cases, et le coin de la grille prendront tous la même couleur.
      champs: [{ v: "--bg" }, { v: "--surface-2" }, { v: "--surface" }],
      defautClair: "#ffffff", defautSombre: "#10161d"
    },
    // Groupe "toolbar" (Fond de la barre d'outils) — existé un temps ici
    // (rounds du 23.09.2026, suite ×3 puis ×7), réglable indépendamment
    // avec un lien par défaut vers --accent-soft. Retiré au round suivant
    // (suite ×8) — Lionel : « enlève la possibilité de choisir la couleur
    // de la toolbar, elle doit toujours garder celle du thème ». La
    // variable --toolbar-bg elle-même a été supprimée de style.css :
    // .toolbar-sheets lit --accent-soft directement désormais, donc plus
    // rien à piloter ici — voir le commentaire dans style.css :root pour le
    // détail. Une éventuelle vieille entrée "toolbar" dans le localStorage
    // d'un appareil (choisie avant ce round) reste inerte : ce groupe
    // n'étant plus dans la liste ci-dessus, appliquerCouleursPersonnalisees
    // ne la lit plus jamais.
    {
      // Round du 23.09.2026 (suite) — Lionel : « le fond des jalons et note,
      // c'était pour les cellules, pas pour les bulles ». --jalon-bg/
      // --note-bg ne pilotent QUE la bulle/le badge d'un jalon ou d'une note
      // posé sur le planning (cf. js/grille-rendu.js, js/page-jalons.js,
      // le bouton "afficher les jalons"/"notes" de la toolbar) — pas de
      // fond de cellule séparé dans le code. Sortis du groupe "fond"
      // ci-dessus (qui les avait fait passer blanc/noir par erreur) et
      // remis en réglages indépendants, un par élément comme demandé.
      // (suite ×3) — déplacé de la page Général vers la page Jalons, sur
      // demande de Lionel ; "page" dit à htmlReglagesCouleurs() où
      // afficher la ligne (cf. plus bas). "Note" reste sur Général.
      id: "jalon", nom: "Jalon", page: "jalons",
      // Couleur de la bulle « Jalon » posée sur le planning, et du bouton « afficher les jalons » de la barre d'outils quand il est activé.
      champs: [{ v: "--jalon-bg" }],
      defautClair: "#d7cdf0", defautSombre: "#d7cdf0"
    },
    {
      id: "note", nom: "Note",
      // Couleur de la bulle « Note » posée sur le planning, et du bouton « afficher les notes » de la barre d'outils quand il est activé.
      champs: [{ v: "--note-bg" }],
      defautClair: "#f7e6ab", defautSombre: "#f7e6ab"
    },
    {
      // Round du 23.09.2026 (suite ×3) — Lionel : « séparations Personnel/
      // Intervenants : un réglage de couleur dans leurs pages respectives »
      // + « aussi utilisé pour les boutons de masquage ». Remplace la part
      // --surface (donc le groupe "fond") de .section-row-personnel — cf.
      // style.css — et le bouton "afficher/masquer Personnel" de la
      // toolbar (auparavant accent bleu générique, cf. .toolbar-toggle).
      // "page" affiche cette ligne sur la page Personnel, pas Général.
      id: "section-personnel", nom: "Séparation « Personnel »", page: "personnel",
      // Fond de la ligne « Personnel » dans le planning, et du bouton « afficher/masquer Personnel » de la barre d'outils quand il est activé.
      champs: [{ v: "--section-personnel-bg" }],
      defautClair: "#f0f0f0", defautSombre: "#171f28"
    },
    {
      id: "section-intervenants", nom: "Séparation « Intervenants »", page: "intervenants",
      // Fond de la ligne « Intervenants » dans le planning, et du bouton « afficher/masquer Intervenants » de la barre d'outils quand il est activé.
      champs: [{ v: "--section-intervenants-bg" }],
      defautClair: "#f0f0f0", defautSombre: "#171f28"
    },
    {
      id: "halo-suppression", nom: "Halo de suppression",
      // Contour au clic sur « Supprimer », et fond au survol du bouton « Effacer ».
      champs: [{ v: "--interdit-bg" }],
      defautClair: "#f6dcd7", defautSombre: "#4a2620"
    },
    {
      id: "case-bloquee", nom: "Case bloquée / avertissement",
      // Fond des cases signalées comme bloquées ou non disponibles.
      champs: [{ v: "--avertissement-bg" }],
      defautClair: "#f9d4b0", defautSombre: "#5a3110"
    },
    {
      id: "selection-cours", nom: "Sélection en cours",
      // Surbrillance pendant l'extension d'une sélection de cases.
      champs: [{ v: "--succes-bg" }],
      defautClair: "#cdeccb", defautSombre: "#1c3a20"
    },
    {
      id: "weekend", nom: "Week-end",
      // Fond des colonnes samedi/dimanche.
      champs: [{ v: "--weekend-bg" }],
      defautClair: "#cdcfc9", defautSombre: "#232b34"
    },
    {
      id: "statut-confirme", nom: "Statut « confirmé »",
      // Fond du badge « confirmé ».
      champs: [{ v: "--status-confirme-bg" }],
      defautClair: "#cdf1ea", defautSombre: "#123f38"
    },
    {
      id: "sync", nom: "Point de synchronisation",
      // Petit point en haut de l'écran indiquant que l'appli est connectée. À ne changer que si tu veux vraiment y toucher.
      champs: [{ v: "--sync-dot" }],
      defautClair: "#3fa15a", defautSombre: "#3fa15a"
    },
    {
      id: "bordure", nom: "Séparations (fines et renforcées)",
      // Regroupées à ta demande : les traits fins de la grille et la séparation renforcée entre semaines prendront la même couleur.
      champs: [{ v: "--border" }, { v: "--border-strong" }],
      defautClair: "#d7dad2", defautSombre: "#2b3540"
    },
    {
      id: "texte", nom: "Texte principal et texte des tâches",
      // Regroupés à ta demande.
      champs: [{ v: "--ink" }, { v: "--bubble-ink", alpha: 0.82 }],
      defautClair: "#1a2129", defautSombre: "#eef1f4"
    },
    {
      id: "texte-secondaire", nom: "Texte secondaire",
      // Sous-titres, dates, légendes.
      champs: [{ v: "--ink-muted" }],
      defautClair: "#57616b", defautSombre: "#9aa7b3"
    },
    {
      id: "texte-discret", nom: "Texte discret / désactivé",
      // Compteurs, indications, éléments désactivés.
      champs: [{ v: "--ink-faint" }],
      defautClair: "#8b93a0", defautSombre: "#66717c"
    },
    {
      id: "ombres", nom: "Ombres",
      // Ombre portée sous les menus, fenêtres et cartes. À ne changer que si les menus manquent de relief.
      champs: [{ v: "--shadow", alpha: 0.16 }, { v: "--shadow-lg", alpha: 0.32 }],
      defautClair: "#182129", defautSombre: "#000000"
    }
  ];
  window.GROUPES_COULEURS = GROUPES_COULEURS;

  // ---- Thèmes (round du 26.09.2026, suite 54) -----------------------------
  // Lionel : « maintenant que j'ai pu sélectionner et groupers mes couleurs
  // comme je le souhaites j'aimerais que les réglages de couleurs
  // disparaissent des réglages. Proposer des thèmes de couleurs à la place
  // avec juste une liste déroulante. Je ne sais pas si tu peux récupérer
  // couleurs que j'ai enregistrée. Une autre alternative qui peut me plaire
  // serai d'ouvrir une page de réglages avec un petit aperçu. Dans tous les
  // cas avoir toutes les couleurs dans l'onglet prend trop de place. »
  // Les deux sont faits : Général n'a plus qu'une liste « Thème » et un
  // bouton « Personnaliser » qui ouvre une fenêtre avec un petit aperçu du
  // planning et tous les réglages d'avant (ouvrirPersonnaliserCouleurs_).
  //
  // Un thème = des valeurs pour les groupes de Général seulement (ceux sans
  // `page`) : Jalon, Personnel et Intervenants gardent leur couleur, réglée
  // sur leur propre page. Un groupe absent du thème revient à sa couleur
  // d'origine (style.css). Choisir un thème réécrit donc les lignes de
  // `couleurs_perso` de ces groupes-là, rien d'autre — même table, même
  // partage entre appareils qu'avant, pas de nouvelle colonne : le thème
  // affiché se déduit des couleurs enregistrées (themeActuel_), et devient
  // « Personnalisé » dès qu'une couleur ne correspond plus à aucun thème.
  //
  // « Mes couleurs » : relevé dans `couleurs_perso` le 26.09.2026. Des
  // groupes de Général, seul « Fond général, cases et coin » y était réglé
  // (#ffffff en clair, rien en sombre) ; Personnel (#f3f4e6) et
  // Intervenants (#e7f3e2) y étaient aussi, mais ce sont des couleurs de
  // page, que les thèmes ne touchent pas.
  var THEMES_COULEURS = [
    { id: "mes-couleurs", nom: "Mes couleurs", valeurs: {
      fond: { clair: "#ffffff", sombre: null }
    } },
    { id: "classique", nom: "Classique", valeurs: {} },
    { id: "ardoise", nom: "Ardoise", valeurs: {
      principale: { clair: "#44576d", sombre: "#a3b8cf" },
      "onglet-fond": { clair: "#e3e8ee", sombre: "#28323d" },
      fond: { clair: "#f8f9fb", sombre: "#121820" },
      weekend: { clair: "#d8dde3", sombre: "#222a33" }
    } },
    { id: "foret", nom: "Forêt", valeurs: {
      principale: { clair: "#2e6b3c", sombre: "#7dc58c" },
      "onglet-fond": { clair: "#e0efe2", sombre: "#1e3324" },
      fond: { clair: "#fbfdf9", sombre: "#0f1511" },
      weekend: { clair: "#d2dccd", sombre: "#1f2a21" }
    } },
    { id: "terre-cuite", nom: "Terre cuite", valeurs: {
      principale: { clair: "#a3462a", sombre: "#ec9474" },
      "onglet-fond": { clair: "#f6e3da", sombre: "#3b271f" },
      fond: { clair: "#fffcf9", sombre: "#17110e" },
      weekend: { clair: "#e2d6ca", sombre: "#2a211c" }
    } },
    // Pour le plein soleil sur un chantier : texte noir sur blanc, bleu
    // plus foncé.
    { id: "contraste", nom: "Contraste fort", valeurs: {
      principale: { clair: "#0a3a8c", sombre: "#8fc3ff" },
      "onglet-fond": { clair: "#d3e2fa", sombre: "#1a2c48" },
      fond: { clair: "#ffffff", sombre: "#000000" },
      weekend: { clair: "#c2c5be", sombre: "#1b2027" },
      texte: { clair: "#000000", sombre: "#ffffff" },
      "texte-secondaire": { clair: "#2c343c", sombre: "#d3d9df" },
      "texte-discret": { clair: "#525c66", sombre: "#a0aab4" }
    } }
  ];
  window.THEMES_COULEURS = THEMES_COULEURS;

  // window.etat.couleursPerso : accès défensif, sans jamais lever — ce
  // script s'exécute AVANT core.js (qui déclare `etat`) dans index.html, et
  // avant que donnees-sync.js ait fini son premier aller-retour réseau. Un
  // accès à la propriété d'un objet existant (window.etat) ne lève jamais,
  // contrairement à la variable globale nue `etat` qui lèverait un
  // ReferenceError tant que core.js n'a pas encore tourné — d'où
  // window.etat plutôt que etat ici.
  function couleursPersoServeur_() {
    return (window.etat && window.etat.couleursPerso) || null;
  }
  function lireCacheLocal_() {
    try {
      var brut = localStorage.getItem(CLE_STOCKAGE);
      return brut ? JSON.parse(brut) : {};
    } catch (e) { return {}; }
  }
  function ecrireCacheLocal_(reglages) {
    try { localStorage.setItem(CLE_STOCKAGE, JSON.stringify(reglages)); } catch (e) {}
  }
  // lireReglages() : le serveur (couleursPersoServeur_) l'emporte dès qu'il
  // a répondu — y compris s'il répond {} (aucune couleur choisie sur AUCUN
  // appareil : un résultat à part entière, différent de "pas encore su",
  // donc {} ne doit PAS retomber sur le cache local). Seul `null` (script
  // tout juste chargé, ou requête réseau pas encore résolue/en échec)
  // retombe sur le dernier cache local connu.
  function lireReglages() {
    return couleursPersoServeur_() || lireCacheLocal_();
  }

  function hexVersRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!m) return null;
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  // Construit/actualise <style id="couleursPerso"> à partir de
  // lireReglages() (serveur si connu, sinon cache local). Appelée au tout
  // début du chargement (avant construireCoquille), puis de nouveau dès que
  // le serveur répond (js/donnees-sync.js) et à chaque changement d'un
  // sélecteur de couleur sur cet appareil.
  function appliquerCouleursPersonnalisees() {
    var reglages = lireReglages();
    // Cache local tenu à jour à CHAQUE application des données serveur, pas
    // seulement lors d'une écriture locale : si un AUTRE appareil a changé
    // une couleur, le prochain chargement de CET appareil doit repeindre
    // dès son cache (avant même la réponse réseau) avec cette valeur-là,
    // pas avec l'ancienne.
    if (couleursPersoServeur_()) ecrireCacheLocal_(reglages);
    var lignesClair = [];
    var lignesSombre = [];
    GROUPES_COULEURS.forEach(function (groupe) {
      var choix = reglages[groupe.id];
      if (!choix) return; // rien d'enregistré : on ne touche à rien, valeurs d'origine gardées.
      ["clair", "sombre"].forEach(function (theme) {
        var hex = choix[theme];
        if (!hex) return;
        var rgb = hexVersRgb(hex);
        if (!rgb) return;
        groupe.champs.forEach(function (champ) {
          var valeur = champ.alpha != null
            ? "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + champ.alpha + ")"
            : hex;
          var decl = champ.v + ": " + valeur + ";";
          if (theme === "clair") lignesClair.push(decl); else lignesSombre.push(decl);
        });
      });
    });
    // Le bloc sombre de style.css cible `:root:not([data-theme="light"])`,
    // plus spécifique qu'un simple `:root` — un `:root` tout court ici
    // perdrait contre lui même posé après (la spécificité l'emporte sur
    // l'ordre). On reprend le même sélecteur pour être sûr de gagner.
    var css = "";
    if (lignesClair.length) css += ":root{" + lignesClair.join("") + "}";
    if (lignesSombre.length) {
      css += "@media (prefers-color-scheme: dark){:root:not([data-theme=\"light\"]){" + lignesSombre.join("") + "}}";
    }
    var style = document.getElementById("couleursPerso");
    if (!style) {
      style = document.createElement("style");
      style.id = "couleursPerso";
      document.head.appendChild(style);
    }
    style.textContent = css;
  }
  window.appliquerCouleursPersonnalisees = appliquerCouleursPersonnalisees;

  // Appliquée tout de suite au chargement du script (avant la construction
  // de la coquille), pour éviter tout flash des couleurs d'origine.
  appliquerCouleursPersonnalisees();

  // Ligne de la fenêtre « Personnaliser ». Suite 56 : le nom seul, sans
  // description, et plus de « Clair »/« Sombre » répété sur chaque ligne —
  // une seule fois en tête de liste (htmlEnteteColonnes_), les champs
  // gardant leur nom pour les lecteurs d'écran (aria-label).
  function htmlLigneCouleur(groupe) {
    var nom = esc2(groupe.nom);
    return '<div class="reglage-couleurs-groupe" data-groupe="' + groupe.id + '">' +
      '<span class="reglage-texte"><b>' + nom + '</b></span>' +
      '<span class="reglage-couleurs-paires">' +
        '<span class="reglage-couleur-paire"><input type="color" class="rc-clair" data-groupe="' + groupe.id + '" aria-label="' + nom + ', mode clair"></span>' +
        '<span class="reglage-couleur-paire"><input type="color" class="rc-sombre" data-groupe="' + groupe.id + '" aria-label="' + nom + ', mode sombre"></span>' +
        '<button type="button" class="reglage-couleur-reset" data-groupe="' + groupe.id + '" title="Rétablir la couleur d’origine">↺</button>' +
      '</span>' +
    '</div>';
  }
  // Mêmes largeurs de colonnes que les lignes (style.css, .cm-colonnes),
  // reste collé en haut quand la liste défile.
  function htmlEnteteColonnes_() {
    return '<div class="cm-colonnes" aria-hidden="true">' +
      '<span class="reglage-couleur-paire"><span>Clair</span></span>' +
      '<span class="reglage-couleur-paire"><span>Sombre</span></span>' +
      '<span class="cm-col-reset"></span>' +
    '</div>';
  }
  // Ligne réduite des pages Jalons, Personnel et Intervenants (suite 54) —
  // Lionel : « jalons [...] juste "couleur" pour le choix de la couleur »,
  // « personnel [...] uniquement "Couleur" pour la couleur », « intervenant,
  // idem ». Plus de nom ni de description : « Couleur », une pastille
  // (.pastille-couleur, comme sur Chantiers/Statuts) et ↺. Les deux champs
  // clair/sombre restent dans la page, mais le CSS ne montre que celui du
  // mode affiché (.reglage-couleur-compacte, style.css) : on règle ce qu'on
  // voit. Mêmes classes rc-clair/rc-sombre, donc même câblage.
  function htmlLigneCouleurCompacte(groupe) {
    return '<div class="reglage-couleurs-groupe reglage-couleur-compacte" data-groupe="' + groupe.id + '">' +
      '<span class="reglage-texte"><b>Couleur</b></span>' +
      '<span class="reglage-couleurs-paires">' +
        '<input type="color" class="rc-clair pastille-couleur" data-groupe="' + groupe.id + '" title="Couleur" aria-label="Couleur (mode clair)">' +
        '<input type="color" class="rc-sombre pastille-couleur" data-groupe="' + groupe.id + '" title="Couleur" aria-label="Couleur (mode sombre)">' +
        '<button type="button" class="reglage-couleur-reset" data-groupe="' + groupe.id + '" title="Rétablir la couleur d’origine">↺</button>' +
      '</span>' +
    '</div>';
  }
  function htmlSelectTheme_(id) {
    return '<select class="sel-theme-couleurs"' + (id ? ' id="' + id + '"' : '') + ' aria-label="Thème de couleurs">' +
      THEMES_COULEURS.map(function (t) { return '<option value="' + t.id + '">' + t.nom + '</option>'; }).join("") +
      // Visible seulement quand les couleurs ne suivent aucun thème
      // (majSelectsTheme_) : on ne le choisit pas, on y arrive en
      // personnalisant.
      '<option value="perso" disabled hidden>Personnalisé</option>' +
    '</select>';
  }

  // Round du 23.09.2026 (suite ×3) — chaque groupe porte un `page`
  // ("general" par défaut) ; htmlReglagesCouleurs(page) n'affiche que les
  // groupes de CETTE page. Suite 54 : sur Général, plus aucune ligne de
  // couleur — la liste « Thème » et le bouton « Personnaliser » ; les lignes
  // de Général vivent dans la fenêtre ouverte par ce bouton.
  function htmlReglagesCouleurs(page) {
    page = page || "general";
    if (page === "general") {
      return '<div class="reglage-couleurs-entete"><h2>Couleurs</h2></div>' +
        '<div class="reglage-couleurs-groupe reglage-theme">' +
          '<span class="reglage-texte"><b>Thème</b></span>' +
          '<span class="reglage-couleurs-paires">' + htmlSelectTheme_("selThemeCouleurs") +
            '<button type="button" class="btn-personnaliser-couleurs" id="btnPersonnaliserCouleurs">' +
              (window.ICONS && ICONS.palette ? ICONS.palette : "") + '<span>Personnaliser</span></button>' +
          '</span>' +
        '</div>';
    }
    return GROUPES_COULEURS.filter(function (g) { return g.page === page; }).map(htmlLigneCouleurCompacte).join("");
  }
  window.htmlReglagesCouleurs = htmlReglagesCouleurs;

  // ---- Synchronisation serveur (round du 24.09.2026) ---------------------
  // Même schéma que majCouleurChantierServeur/etc. (js/page-chantiers.js) :
  // écriture directe côté client, RLS "connecte_tout" (comme chantiers/
  // statuts), pas besoin d'Edge Function dédiée pour un simple upsert/
  // delete. upsert ne fournit QUE le champ modifié (`clair` OU `sombre`,
  // jamais les deux) : PostgREST ne réécrit alors QUE cette colonne sur ON
  // CONFLICT (id), laissant l'autre thème intact sur la ligne existante —
  // ou NULL sur une toute nouvelle ligne, exactement comme un thème "jamais
  // choisi" pour ce groupe.
  function enregistrerCouleurServeur_(groupeId, theme, hex) {
    var payload = { id: groupeId };
    payload[theme] = hex;
    return sbClient.from("couleurs_perso").upsert(payload, { onConflict: "id" }).then(function (res) {
      if (res.error) throw res.error;
    });
  }
  function reinitialiserCouleurServeur_(groupeId) {
    return sbClient.from("couleurs_perso").delete().eq("id", groupeId).then(function (res) {
      if (res.error) throw res.error;
    });
  }
  function reinitialiserToutesCouleursServeur_(ids) {
    if (!ids.length) return Promise.resolve();
    return sbClient.from("couleurs_perso").delete().in("id", ids).then(function (res) {
      if (res.error) throw res.error;
    });
  }
  function notifierEchecSync_(err) {
    if (typeof toast === "function") toast("Couleur enregistrée sur cet appareil, mais pas synchronisée avec les autres : " + (err && err.message ? err.message : err));
  }
  // marquerCommeSourceDeVerite_ : si window.etat.couleursPerso n'existe pas
  // encore (cas limite — la page Couleurs ouverte avant même que le tout
  // premier chargement réseau ait fini, en pratique quasi jamais puisque le
  // reste de l'appli attend derrière l'écran de chargement), le fait
  // basculer sur l'objet qu'on vient de construire depuis le cache local,
  // pour que les lectures suivantes (y compris dans ce même appel) le
  // traitent déjà comme la source de vérité plutôt que de repartir du
  // localStorage à chaque fois.
  function marquerCommeSourceDeVerite_(r) {
    if (window.etat && !window.etat.couleursPerso) window.etat.couleursPerso = r;
  }

  // Un <input type="color"> émet un évènement "input" en continu pendant
  // qu'on fait glisser le sélecteur (potentiellement des dizaines par
  // seconde) — l'aperçu (appliquerCouleursPersonnalisees) reste immédiat à
  // chaque évènement, mais l'écriture réseau est différée de 400ms sans
  // nouveau changement sur ce même champ, pour ne pas bombarder Supabase
  // pendant un glissé et pour que 2 champs changés à la suite (clair ET
  // sombre, ou 2 groupes différents) ne s'annulent pas l'un l'autre.
  var attenteEcritureServeur_ = {};
  function planifierEcritureServeur_(groupeId, theme, hex) {
    var cle = groupeId + ":" + theme;
    clearTimeout(attenteEcritureServeur_[cle]);
    attenteEcritureServeur_[cle] = setTimeout(function () {
      delete attenteEcritureServeur_[cle];
      enregistrerCouleurServeur_(groupeId, theme, hex).catch(notifierEchecSync_);
    }, 400);
  }

  function groupeParId_(id) {
    return GROUPES_COULEURS.filter(function (g) { return g.id === id; })[0] || null;
  }
  function groupesGeneral_() {
    return GROUPES_COULEURS.filter(function (g) { return !g.page; });
  }
  function hexOuNull_(v) { return v ? String(v).toLowerCase() : null; }
  // Thème dont les couleurs enregistrées sont exactement celles-ci (groupes
  // de Général seulement), ou null (« Personnalisé »). Un groupe absent du
  // thème doit être absent des réglages (ou vide) ; un thème vide dans un
  // mode (sombre: null) veut dire « couleur d'origine » dans ce mode.
  function themeActuel_() {
    var r = lireReglages();
    for (var i = 0; i < THEMES_COULEURS.length; i++) {
      var t = THEMES_COULEURS[i];
      var ok = groupesGeneral_().every(function (g) {
        var a = r[g.id] || {}, b = t.valeurs[g.id] || {};
        return hexOuNull_(a.clair) === hexOuNull_(b.clair) && hexOuNull_(a.sombre) === hexOuNull_(b.sombre);
      });
      if (ok) return t;
    }
    return null;
  }
  window.themeCouleursActuel = function () { var t = themeActuel_(); return t ? t.id : "perso"; };
  function majSelectsTheme_() {
    var t = themeActuel_();
    document.querySelectorAll(".sel-theme-couleurs").forEach(function (sel) {
      var perso = sel.querySelector('option[value="perso"]');
      if (perso) perso.hidden = !!t;
      sel.value = t ? t.id : "perso";
    });
  }
  // Remet chaque champ de couleur de la page (et de la fenêtre, si ouverte)
  // sur la couleur enregistrée, ou celle d'origine.
  function majChampsCouleurs_() {
    var reglages = lireReglages();
    document.querySelectorAll(".rc-clair, .rc-sombre").forEach(function (input) {
      var groupe = groupeParId_(input.dataset.groupe);
      if (!groupe) return;
      var choix = reglages[groupe.id] || {};
      input.value = input.classList.contains("rc-clair") ? (choix.clair || groupe.defautClair) : (choix.sombre || groupe.defautSombre);
    });
  }
  // enregistrerChamp : mise à jour OPTIMISTE (cache local + application
  // CSS immédiate) suivie d'une écriture serveur différée
  // (planifierEcritureServeur_) en arrière-plan.
  function enregistrerChamp_(groupeId, theme, hex) {
    var r = lireReglages();
    if (!r[groupeId]) r[groupeId] = {};
    r[groupeId][theme] = hex;
    marquerCommeSourceDeVerite_(r);
    ecrireCacheLocal_(r);
    appliquerCouleursPersonnalisees();
    majSelectsTheme_();
    planifierEcritureServeur_(groupeId, theme, hex);
  }
  function reinitialiserGroupe_(groupeId) {
    if (!groupeParId_(groupeId)) return;
    var r = lireReglages();
    delete r[groupeId];
    marquerCommeSourceDeVerite_(r);
    ecrireCacheLocal_(r);
    appliquerCouleursPersonnalisees();
    majChampsCouleurs_();
    majSelectsTheme_();
    reinitialiserCouleurServeur_(groupeId).catch(notifierEchecSync_);
  }
  // Câble les champs de couleur et les ↺ contenus dans `racine` (la page,
  // ou la fenêtre « Personnaliser » à chaque ouverture) — jamais deux fois
  // le même élément.
  function cablerChampsCouleurs_(racine) {
    racine.querySelectorAll(".rc-clair, .rc-sombre").forEach(function (input) {
      input.addEventListener("input", function () {
        enregistrerChamp_(input.dataset.groupe, input.classList.contains("rc-clair") ? "clair" : "sombre", input.value);
      });
    });
    racine.querySelectorAll(".reglage-couleur-reset").forEach(function (bouton) {
      bouton.addEventListener("click", function () { reinitialiserGroupe_(bouton.dataset.groupe); });
    });
  }
  // Applique un thème : les groupes de Général prennent ses valeurs, ceux
  // qu'il ne cite pas reviennent à leur couleur d'origine. Côté serveur,
  // mêmes lignes `couleurs_perso` qu'un réglage à la main : les groupes du
  // thème réécrits en entier (clair ET sombre, null compris), les autres
  // groupes de Général supprimés.
  function appliquerTheme_(themeId) {
    var t = THEMES_COULEURS.filter(function (x) { return x.id === themeId; })[0];
    if (!t) return Promise.resolve();
    var r = lireReglages();
    var ids = groupesGeneral_().map(function (g) { return g.id; });
    // Une écriture encore en attente (couleur changée il y a moins de
    // 400 ms) ne doit pas repasser par-dessus le thème.
    ids.forEach(function (id) {
      ["clair", "sombre"].forEach(function (m) {
        clearTimeout(attenteEcritureServeur_[id + ":" + m]);
        delete attenteEcritureServeur_[id + ":" + m];
      });
    });
    var aSupprimer = ids.filter(function (id) { return r[id] && !t.valeurs[id]; });
    ids.forEach(function (id) { delete r[id]; });
    var lignes = Object.keys(t.valeurs).map(function (id) {
      r[id] = { clair: t.valeurs[id].clair || null, sombre: t.valeurs[id].sombre || null };
      return { id: id, clair: r[id].clair, sombre: r[id].sombre };
    });
    marquerCommeSourceDeVerite_(r);
    ecrireCacheLocal_(r);
    appliquerCouleursPersonnalisees();
    majChampsCouleurs_();
    majSelectsTheme_();
    return Promise.all([
      reinitialiserToutesCouleursServeur_(aSupprimer),
      lignes.length ? sbClient.from("couleurs_perso").upsert(lignes, { onConflict: "id" }).then(function (res) { if (res.error) throw res.error; }) : null
    ]).catch(notifierEchecSync_);
  }
  // Changement de la liste « Thème » (page Général ou fenêtre). Quitter
  // « Personnalisé » efface des couleurs qu'aucun thème ne retrouvera :
  // on demande d'abord. `apres` : rend la main à la fenêtre (Échap).
  function choisirTheme_(sel, apres) {
    var id = sel.value;
    if (themeActuel_()) { appliquerTheme_(id); return; }
    var t = THEMES_COULEURS.filter(function (x) { return x.id === id; })[0];
    sel.value = "perso";
    demanderConfirmation("Remplacer tes couleurs personnalisées par le thème « " + (t ? t.nom : id) + " » ?", function () {
      appliquerTheme_(id);
    }, apres);
  }

  // ---- Fenêtre « Personnaliser » (suite 54) ------------------------------
  // Petit aperçu du planning, peint avec les mêmes variables CSS que la
  // vraie grille : il suit chaque changement en direct, sans code à lui.
  // La couleur des tâches d'exemple est celle du premier chantier actif.
  function htmlApercuCouleurs_() {
    var chantier = (window.etat && etat.chantiers || []).filter(function (c) { return c.actif !== false && c.couleur; })[0];
    var fondTache = chantier ? esc2(chantier.couleur) : "#cfe0f5";
    var tache = function (texte, extra) { return '<i class="ac-bulle" style="background:' + fondTache + '">' + texte + (extra || "") + '</i>'; };
    return '<div class="apercu-couleurs" aria-hidden="true">' +
      '<div class="ac-haut"><span class="ac-onglet ac-actif">Planning</span><span class="ac-onglet">Jalons</span><span class="ac-onglet">Général</span><span class="ac-sync"></span></div>' +
      '<div class="ac-barre"><span class="ac-outil"></span><span class="ac-outil"></span><span class="ac-bouton">Aujourd’hui</span><span class="ac-supprimer">Supprimer</span></div>' +
      '<div class="ac-grille">' +
        '<div class="ac-ligne ac-entete"><span class="ac-nom"></span><span>Lun</span><span>Mar</span><span>Mer</span><span class="ac-we">Sam</span></div>' +
        '<div class="ac-ligne ac-section ac-section-perso"><span>Personnel</span></div>' +
        '<div class="ac-ligne"><span class="ac-nom">Lionel</span><span>' + tache("Coffrage") + '</span><span class="ac-absence">Congé</span><span><i class="ac-bulle ac-jalon">Jalon</i></span><span class="ac-we"></span></div>' +
        '<div class="ac-ligne"><span class="ac-nom">Antoine</span><span><i class="ac-bulle ac-note">Note</i></span><span class="ac-bloquee"></span><span class="ac-selection"></span><span class="ac-we"></span></div>' +
        '<div class="ac-ligne ac-section ac-section-inter"><span>Intervenants</span></div>' +
        '<div class="ac-ligne"><span class="ac-nom">Échafaudage</span><span class="ac-large">' + tache("Montage", ' <b class="ac-statut">confirmé</b>') + '</span><span></span><span class="ac-we"></span></div>' +
      '</div>' +
      '<div class="ac-legende"><span class="ac-important">! Important</span><span>Texte secondaire</span><span class="ac-discret">texte discret</span></div>' +
    '</div>';
  }
  function ouvrirPersonnaliserCouleurs_() {
    if (typeof popFermerActuel !== "undefined" && popFermerActuel) popFermerActuel();
    var overlay = document.createElement("div");
    overlay.className = "voile-confirm";
    var pop = document.createElement("div");
    pop.className = "pop confirm-pop couleurs-modal";
    pop.innerHTML =
      '<div class="cm-entete"><div class="cp-titre">Couleurs</div>' + htmlSelectTheme_("") + '</div>' +
      htmlApercuCouleurs_() +
      // Suite 56 : plus de phrase d'explication au-dessus de la liste, les
      // colonnes « Clair »/« Sombre » suffisent.
      '<div class="cm-liste">' +
        htmlEnteteColonnes_() +
        groupesGeneral_().map(htmlLigneCouleur).join("") +
      '</div>' +
      '<div class="form-actions"><button type="button" class="f-fermer">Fermer</button></div>';
    document.body.appendChild(overlay);
    document.body.appendChild(pop);
    function fermer() {
      overlay.remove(); pop.remove();
      if (popFermerActuel === fermer) popFermerActuel = null;
    }
    function reprendreLaMain() { popFermerActuel = fermer; }
    overlay.addEventListener("pointerdown", fermer);
    pop.querySelector(".f-fermer").addEventListener("click", fermer);
    var sel = pop.querySelector(".sel-theme-couleurs");
    sel.addEventListener("change", function () { choisirTheme_(sel, reprendreLaMain); });
    cablerChampsCouleurs_(pop);
    majChampsCouleurs_();
    majSelectsTheme_();
    popFermerActuel = fermer;
  }
  window.ouvrirPersonnaliserCouleurs = ouvrirPersonnaliserCouleurs_;

  // Appelée une fois, la coquille posée (js/coquille.js) : lignes
  // « Couleur » de Jalons/Personnel/Intervenants, liste « Thème » et bouton
  // « Personnaliser » de Général.
  function initReglagesCouleurs() {
    var pages = document.querySelectorAll(".reglage-couleur-compacte");
    pages.forEach(function (ligne) { cablerChampsCouleurs_(ligne); });
    var sel = document.getElementById("selThemeCouleurs");
    if (sel) sel.addEventListener("change", function () { choisirTheme_(sel); });
    var btn = document.getElementById("btnPersonnaliserCouleurs");
    if (btn) btn.addEventListener("click", ouvrirPersonnaliserCouleurs_);
    majChampsCouleurs_();
    majSelectsTheme_();
  }
  window.initReglagesCouleurs = initReglagesCouleurs;
  // Couleurs arrivées du serveur (js/donnees-sync.js) ou d'un autre
  // appareil : la liste « Thème » et les champs suivent.
  window.majReglagesCouleursAffiches = function () { majChampsCouleurs_(); majSelectsTheme_(); };
})();
