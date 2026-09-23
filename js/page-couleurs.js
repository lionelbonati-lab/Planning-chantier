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
// posée dans style.css) : seuls les groupes explicitement enregistrés dans
// localStorage sont appliqués, en clair et en sombre séparément.
//
// Portée volontairement locale à cet appareil (même choix que "Afficher
// les week-ends" sur cette page) : ce ne sont pas des couleurs "métier"
// partagées comme celles des chantiers/statuts, mais une préférence
// d'affichage.
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
      id: "fond", nom: "Fond général, cases, coin, jalons et notes",
      description: "Regroupés à ta demande : le fond général de l'appli, le fond des cases, le coin de la grille, et les fonds de Jalon/Note prendront tous la même couleur.",
      champs: [{ v: "--bg" }, { v: "--surface-2" }, { v: "--surface" }, { v: "--jalon-bg" }, { v: "--note-bg" }],
      defautClair: "#ffffff", defautSombre: "#10161d"
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

  function lireReglages() {
    try {
      var brut = localStorage.getItem(CLE_STOCKAGE);
      return brut ? JSON.parse(brut) : {};
    } catch (e) { return {}; }
  }
  function ecrireReglages(reglages) {
    try { localStorage.setItem(CLE_STOCKAGE, JSON.stringify(reglages)); } catch (e) {}
  }

  function hexVersRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!m) return null;
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  // Construit/actualise <style id="couleursPerso"> à partir de localStorage.
  // Appelée au tout début du chargement (avant construireCoquille) puis à
  // chaque changement d'un sélecteur de couleur.
  function appliquerCouleursPersonnalisees() {
    var reglages = lireReglages();
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

  function htmlReglagesCouleurs() {
    var html = '<div class="reglage-couleurs-entete"><h2>Couleurs</h2>' +
      '<button type="button" class="lien-reset-tout" id="btnResetToutesCouleurs">Tout réinitialiser</button></div>' +
      '<p class="page-sous">Une couleur pour le mode clair, une pour le mode sombre. Les éléments listés ensemble ont été regroupés ensemble à ta demande : ils partagent la même couleur.</p>';
    GROUPES_COULEURS.forEach(function (groupe) {
      html += '<div class="reglage-couleurs-groupe" data-groupe="' + groupe.id + '">' +
        '<span class="reglage-texte"><b>' + groupe.nom + '</b><span>' + groupe.description + '</span></span>' +
        '<span class="reglage-couleurs-paires">' +
          '<span class="reglage-couleur-paire"><span>Clair</span><input type="color" class="rc-clair" data-groupe="' + groupe.id + '"></span>' +
          '<span class="reglage-couleur-paire"><span>Sombre</span><input type="color" class="rc-sombre" data-groupe="' + groupe.id + '"></span>' +
          '<button type="button" class="reglage-couleur-reset" data-groupe="' + groupe.id + '" title="Rétablir la couleur d’origine">↺</button>' +
        '</span>' +
      '</div>';
    });
    return html;
  }
  window.htmlReglagesCouleurs = htmlReglagesCouleurs;

  function initReglagesCouleurs() {
    var reglages = lireReglages();
    GROUPES_COULEURS.forEach(function (groupe) {
      var choix = reglages[groupe.id] || {};
      var champClair = document.querySelector('.rc-clair[data-groupe="' + groupe.id + '"]');
      var champSombre = document.querySelector('.rc-sombre[data-groupe="' + groupe.id + '"]');
      if (champClair) champClair.value = choix.clair || groupe.defautClair;
      if (champSombre) champSombre.value = choix.sombre || groupe.defautSombre;
    });
    function enregistrerChamp(groupeId, theme, hex) {
      var r = lireReglages();
      if (!r[groupeId]) r[groupeId] = {};
      r[groupeId][theme] = hex;
      ecrireReglages(r);
      appliquerCouleursPersonnalisees();
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
        ecrireReglages(r);
        appliquerCouleursPersonnalisees();
        var champClair = document.querySelector('.rc-clair[data-groupe="' + groupeId + '"]');
        var champSombre = document.querySelector('.rc-sombre[data-groupe="' + groupeId + '"]');
        if (champClair) champClair.value = groupe.defautClair;
        if (champSombre) champSombre.value = groupe.defautSombre;
      });
    });
    var btnTout = document.getElementById("btnResetToutesCouleurs");
    if (btnTout) {
      btnTout.addEventListener("click", function () {
        ecrireReglages({});
        appliquerCouleursPersonnalisees();
        initReglagesCouleurs();
      });
    }
  }
  window.initReglagesCouleurs = initReglagesCouleurs;
})();
