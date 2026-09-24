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
  var GROUPES_COULEURS = [
    {
      id: "principale", nom: "Couleur principale de l'appli",
      description: "Boutons actifs, liens, cases sélectionnées, et texte de l'onglet actif (regroupés à ta demande).",
      champs: [{ v: "--accent" }],
      defautClair: "#1f4d8f", defautSombre: "#6fa6e8"
    },
    {
      id: "onglet-fond", nom: "Fond de l'onglet actif",
      description: "Fond ovale derrière le nom de la page ouverte (aussi fond de survol de nombreux boutons).",
      champs: [{ v: "--accent-soft" }],
      defautClair: "#e3ecf7", defautSombre: "#223247"
    },
    {
      id: "erreur-important", nom: "Erreur, suppression et étoile « important »",
      description: "Regroupés à ta demande : ces 3 éléments prendront la même couleur.",
      champs: [{ v: "--danger" }, { v: "--important-ink" }, { v: "--important-toggle-bg" }],
      defautClair: "#b3372f", defautSombre: "#e0685f"
    },
    {
      id: "absence", nom: "Absence",
      description: "Fond des cases d'absence et badge de type d'absence.",
      champs: [{ v: "--absence-bg" }],
      defautClair: "#f6c893", defautSombre: "#f6c893"
    },
    {
      id: "fond", nom: "Fond général, cases et coin",
      description: "Regroupés à ta demande : le fond général de l'appli, le fond des cases, et le coin de la grille prendront tous la même couleur.",
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
      description: "Couleur de la bulle « Jalon » posée sur le planning, et du bouton « afficher les jalons » de la barre d'outils quand il est activé.",
      champs: [{ v: "--jalon-bg" }],
      defautClair: "#d7cdf0", defautSombre: "#d7cdf0"
    },
    {
      id: "note", nom: "Note",
      description: "Couleur de la bulle « Note » posée sur le planning, et du bouton « afficher les notes » de la barre d'outils quand il est activé.",
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
      description: "Fond de la ligne « Personnel » dans le planning, et du bouton « afficher/masquer Personnel » de la barre d'outils quand il est activé.",
      champs: [{ v: "--section-personnel-bg" }],
      defautClair: "#f0f0f0", defautSombre: "#171f28"
    },
    {
      id: "section-intervenants", nom: "Séparation « Intervenants »", page: "intervenants",
      description: "Fond de la ligne « Intervenants » dans le planning, et du bouton « afficher/masquer Intervenants » de la barre d'outils quand il est activé.",
      champs: [{ v: "--section-intervenants-bg" }],
      defautClair: "#f0f0f0", defautSombre: "#171f28"
    },
    {
      id: "halo-suppression", nom: "Halo de suppression",
      description: "Contour au clic sur « Supprimer », et fond au survol du bouton « Effacer ».",
      champs: [{ v: "--interdit-bg" }],
      defautClair: "#f6dcd7", defautSombre: "#4a2620"
    },
    {
      id: "case-bloquee", nom: "Case bloquée / avertissement",
      description: "Fond des cases signalées comme bloquées ou non disponibles.",
      champs: [{ v: "--avertissement-bg" }],
      defautClair: "#f9d4b0", defautSombre: "#5a3110"
    },
    {
      id: "selection-cours", nom: "Sélection en cours",
      description: "Surbrillance pendant l'extension d'une sélection de cases.",
      champs: [{ v: "--succes-bg" }],
      defautClair: "#cdeccb", defautSombre: "#1c3a20"
    },
    {
      id: "weekend", nom: "Week-end",
      description: "Fond des colonnes samedi/dimanche.",
      champs: [{ v: "--weekend-bg" }],
      defautClair: "#cdcfc9", defautSombre: "#232b34"
    },
    {
      id: "statut-confirme", nom: "Statut « confirmé »",
      description: "Fond du badge « confirmé ».",
      champs: [{ v: "--status-confirme-bg" }],
      defautClair: "#cdf1ea", defautSombre: "#123f38"
    },
    {
      id: "sync", nom: "Point de synchronisation",
      description: "Petit point en haut de l'écran indiquant que l'appli est connectée. À ne changer que si tu veux vraiment y toucher.",
      champs: [{ v: "--sync-dot" }],
      defautClair: "#3fa15a", defautSombre: "#3fa15a"
    },
    {
      id: "bordure", nom: "Séparations (fines et renforcées)",
      description: "Regroupées à ta demande : les traits fins de la grille et la séparation renforcée entre semaines prendront la même couleur.",
      champs: [{ v: "--border" }, { v: "--border-strong" }],
      defautClair: "#d7dad2", defautSombre: "#2b3540"
    },
    {
      id: "texte", nom: "Texte principal et texte des tâches",
      description: "Regroupés à ta demande.",
      champs: [{ v: "--ink" }, { v: "--bubble-ink", alpha: 0.82 }],
      defautClair: "#1a2129", defautSombre: "#eef1f4"
    },
    {
      id: "texte-secondaire", nom: "Texte secondaire",
      description: "Sous-titres, dates, légendes.",
      champs: [{ v: "--ink-muted" }],
      defautClair: "#57616b", defautSombre: "#9aa7b3"
    },
    {
      id: "texte-discret", nom: "Texte discret / désactivé",
      description: "Compteurs, indications, éléments désactivés.",
      champs: [{ v: "--ink-faint" }],
      defautClair: "#8b93a0", defautSombre: "#66717c"
    },
    {
      id: "ombres", nom: "Ombres",
      description: "Ombre portée sous les menus, fenêtres et cartes. À ne changer que si les menus manquent de relief.",
      champs: [{ v: "--shadow", alpha: 0.16 }, { v: "--shadow-lg", alpha: 0.32 }],
      defautClair: "#182129", defautSombre: "#000000"
    }
  ];
  window.GROUPES_COULEURS = GROUPES_COULEURS;

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

  function htmlLigneCouleur(groupe) {
    return '<div class="reglage-couleurs-groupe" data-groupe="' + groupe.id + '">' +
      '<span class="reglage-texte"><b>' + groupe.nom + '</b><span>' + groupe.description + '</span></span>' +
      '<span class="reglage-couleurs-paires">' +
        '<span class="reglage-couleur-paire"><span>Clair</span><input type="color" class="rc-clair" data-groupe="' + groupe.id + '"></span>' +
        '<span class="reglage-couleur-paire"><span>Sombre</span><input type="color" class="rc-sombre" data-groupe="' + groupe.id + '"></span>' +
        '<button type="button" class="reglage-couleur-reset" data-groupe="' + groupe.id + '" title="Rétablir la couleur d’origine">↺</button>' +
      '</span>' +
    '</div>';
  }

  // Round du 23.09.2026 (suite ×3) — Lionel a demandé que certains réglages
  // (Jalon, Personnel, Intervenants) vivent sur leur propre page plutôt que
  // sur Général, à côté de l'élément qu'ils colorent. Chaque groupe porte
  // maintenant un `page` ("general" par défaut) ; htmlReglagesCouleurs(page)
  // n'affiche que les groupes de CETTE page. L'entête "Couleurs" + "Tout
  // réinitialiser" (qui agit sur TOUS les groupes, quelle que soit leur
  // page) ne s'affiche que sur Général — les autres pages n'ont qu'une
  // ligne, inutile de leur donner l'entête complète.
  function htmlReglagesCouleurs(page) {
    page = page || "general";
    var groupes = GROUPES_COULEURS.filter(function (g) { return (g.page || "general") === page; });
    var html = "";
    if (page === "general") {
      html += '<div class="reglage-couleurs-entete"><h2>Couleurs</h2>' +
        '<button type="button" class="lien-reset-tout" id="btnResetToutesCouleurs">Tout réinitialiser</button></div>' +
        '<p class="page-sous">Une couleur pour le mode clair, une pour le mode sombre. Les éléments listés ensemble ont été regroupés ensemble à ta demande : ils partagent la même couleur.</p>';
    }
    groupes.forEach(function (groupe) { html += htmlLigneCouleur(groupe); });
    return html;
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

  function initReglagesCouleurs() {
    var reglages = lireReglages();
    GROUPES_COULEURS.forEach(function (groupe) {
      var choix = reglages[groupe.id] || {};
      var champClair = document.querySelector('.rc-clair[data-groupe="' + groupe.id + '"]');
      var champSombre = document.querySelector('.rc-sombre[data-groupe="' + groupe.id + '"]');
      if (champClair) champClair.value = choix.clair || groupe.defautClair;
      if (champSombre) champSombre.value = choix.sombre || groupe.defautSombre;
    });
    // enregistrerChamp : mise à jour OPTIMISTE (cache local + application
    // CSS immédiate, comme avant ce round) suivie d'une écriture serveur
    // différée (planifierEcritureServeur_) en arrière-plan.
    function enregistrerChamp(groupeId, theme, hex) {
      var r = lireReglages();
      if (!r[groupeId]) r[groupeId] = {};
      r[groupeId][theme] = hex;
      marquerCommeSourceDeVerite_(r);
      ecrireCacheLocal_(r);
      appliquerCouleursPersonnalisees();
      planifierEcritureServeur_(groupeId, theme, hex);
    }
    document.querySelectorAll(".rc-clair").forEach(function (input) {
      input.addEventListener("input", function () { enregistrerChamp(input.dataset.groupe, "clair", input.value); });
    });
    document.querySelectorAll(".rc-sombre").forEach(function (input) {
      input.addEventListener("input", function () { enregistrerChamp(input.dataset.groupe, "sombre", input.value); });
    });
    document.querySelectorAll(".reglage-couleur-reset").forEach(function (bouton) {
      bouton.addEventListener("click", function () {
        var groupeId = bouton.dataset.groupe;
        var groupe = GROUPES_COULEURS.filter(function (g) { return g.id === groupeId; })[0];
        if (!groupe) return;
        var r = lireReglages();
        delete r[groupeId];
        marquerCommeSourceDeVerite_(r);
        ecrireCacheLocal_(r);
        appliquerCouleursPersonnalisees();
        var champClair = document.querySelector('.rc-clair[data-groupe="' + groupeId + '"]');
        var champSombre = document.querySelector('.rc-sombre[data-groupe="' + groupeId + '"]');
        if (champClair) champClair.value = groupe.defautClair;
        if (champSombre) champSombre.value = groupe.defautSombre;
        reinitialiserCouleurServeur_(groupeId).catch(notifierEchecSync_);
      });
    });
    var btnTout = document.getElementById("btnResetToutesCouleurs");
    if (btnTout) {
      btnTout.addEventListener("click", function () {
        var idsAvant = Object.keys(lireReglages());
        if (window.etat) window.etat.couleursPerso = {};
        ecrireCacheLocal_({});
        appliquerCouleursPersonnalisees();
        initReglagesCouleurs();
        reinitialiserToutesCouleursServeur_(idsAvant).catch(notifierEchecSync_);
      });
    }
  }
  window.initReglagesCouleurs = initReglagesCouleurs;
})();
