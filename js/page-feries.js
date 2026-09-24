"use strict";
  /* ============================================================
     PAGE "FÉRIÉS" — calendrier annuel devenu réel (§5 du spec,
     apiListerFeries/apiEnregistrerFeries, NOUVELLES). Fusionne les 2
     systèmes déconnectés du prototype (liste FERIES d'affichage + page
     calendrier FERIES_ETAT/CATS_FERIES) en UN SEUL, alimenté par le
     serveur : etat.feriesServeur est la seule source, feriesParIso (déjà
     utilisé par la grille pour teinter les jours, cf. feriePourJour) ET le
     calendrier annuel ci-dessous en dérivent tous les deux. Round du
     02.09.2026 (suite) — "le menu fériés n'est pas comme décidé lors de la
     maquette" (Lionel a confirmé vouloir les 2 écarts) : restauration des 3
     catégories de la maquette d'origine (point 104 du spec,
     prototype-bulles.html : Vacances, Férié, Compensés — "Compensés" était
     jusqu'ici replié dans "Férié" par calculerFeries()) ET des couleurs
     éditables par catégorie (pastille = <input type="color"> natif, cliquer
     dessus ouvre le sélecteur du navigateur — repris tel quel de la
     maquette, cf. renderFerieCategories ci-dessous). etat.categoriesFeriesServeur
     (alimenté par apiDemarrer, cf. WebApp.gs/apiListerCategoriesFeries) est
     la seule source de vérité pour ces couleurs — catsFeries() ci-dessous
     les lit à l'APPEL, jamais à l'initialisation du script, pour ne jamais
     servir un etat pas encore chargé. Un férié posé en cliquant le
     calendrier (donc sans libellé saisi) reçoit par défaut le nom de sa
     catégorie ; "Calculer les fériés" pose de vrais libellés (Noël, etc.).
     Rien n'est écrit sur le serveur avant "Enregistrer" (bouton qui, dans le
     prototype, ne faisait rien) — les couleurs, elles, s'enregistrent à part
     (cf. enregistrerCouleurCategorieFerie, immédiat au relâchement du
     sélecteur de couleur, comme pour un chantier).
     ============================================================ */
  var ferieAnnee = new Date().getFullYear();
  var ferieCategorieActive = "ferie";
  var MOIS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  var JOURS_PAR_MOIS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var feriesAnneeCourante = {}, feriesAnneeOriginal = {};
  // Filet de sécurité si appelée avant le 1er apiDemarrer, ou si le serveur
  // ne renvoie rien (feuille "Catégories fériés" illisible, etc.) — mêmes 3
  // catégories/couleurs par défaut que WebApp.gs (CATEGORIES_FERIES_*_DEFAUT).
  var CATEGORIES_FERIES_DEFAUT = [
    { id: "vacances_entreprise", nom: "Vacances entreprise", couleur: "#a9c6ea" },
    { id: "ferie", nom: "Férié", couleur: "#e8a3a3" },
    { id: "compenses", nom: "Compensés", couleur: "#e8dba3" }
  ];
  function catsFeries() {
    return (etat.categoriesFeriesServeur && etat.categoriesFeriesServeur.length) ? etat.categoriesFeriesServeur : CATEGORIES_FERIES_DEFAUT;
  }
  function estBissextile(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function joursDansMois(y, m) { return m === 1 && estBissextile(y) ? 29 : JOURS_PAR_MOIS[m]; }
  function ajoutJours(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function lundiSurOuApres(d) { var wd = d.getDay(); return ajoutJours(d, (8 - wd) % 7); }
  // Pâques (algorithme grégorien standard), copié tel quel du prototype.
  function pasquesDate(annee) {
    var a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var mois = Math.floor((h + l - 7 * m + 114) / 31);
    var jour = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(annee, mois - 1, jour);
  }
  function calculerFeries(annee) {
    var paques = pasquesDate(annee);
    var items = [
      { nom: "Nouvel an", date: new Date(annee, 0, 1), pont: false },
      { nom: "Vendredi Saint", date: ajoutJours(paques, -2), pont: false },
      { nom: "Lundi de Pâques", date: ajoutJours(paques, 1), pont: false },
      { nom: "Fête du travail", date: new Date(annee, 4, 1), pont: false },
      { nom: "Lundi de l’Ascension", date: ajoutJours(paques, 39), pont: true },
      { nom: "Lundi de Pentecôte", date: ajoutJours(paques, 50), pont: false },
      { nom: "Fête-Dieu", date: ajoutJours(paques, 60), pont: true },
      { nom: "Indépendance jurassienne", date: new Date(annee, 5, 23), pont: true },
      { nom: "Fête nationale suisse", date: new Date(annee, 7, 1), pont: false },
      { nom: "Toussaint", date: new Date(annee, 10, 1), pont: false },
      { nom: "Lundi de St-Martin", date: lundiSurOuApres(new Date(annee, 10, 11)), pont: false },
      { nom: "Noël", date: new Date(annee, 11, 25), pont: false }
    ];
    var resultat = [];
    items.forEach(function (it) {
      var wd = it.date.getDay();
      var weekend = wd === 0 || wd === 6;
      if (!weekend) resultat.push({ mois: it.date.getMonth(), jour: it.date.getDate(), nom: it.nom });
      if (it.pont) {
        if (wd === 2) { var veille = ajoutJours(it.date, -1); resultat.push({ mois: veille.getMonth(), jour: veille.getDate(), nom: it.nom + " (pont)" }); }
        else if (wd === 4) { var lendemain = ajoutJours(it.date, 1); resultat.push({ mois: lendemain.getMonth(), jour: lendemain.getDate(), nom: it.nom + " (pont)" }); }
      }
    });
    return resultat;
  }
  function isoFerie(annee, mois, jour) {
    return annee + "-" + (mois + 1 < 10 ? "0" : "") + (mois + 1) + "-" + (jour < 10 ? "0" : "") + jour;
  }
  function chargerFeriesAnnee(annee) {
    feriesAnneeOriginal = {};
    (etat.feriesServeur || []).forEach(function (f) {
      if (String(f.iso).slice(0, 4) !== String(annee)) return;
      var p = f.iso.split("-");
      var key = (+p[1] - 1) + "-" + (+p[2]);
      feriesAnneeOriginal[key] = { iso: f.iso, libelle: f.libelle, categorie: f.categorie };
    });
    feriesAnneeCourante = {};
    Object.keys(feriesAnneeOriginal).forEach(function (k) { feriesAnneeCourante[k] = Object.assign({}, feriesAnneeOriginal[k]); });
  }
  function renderFerieCategories() {
    var zone = document.getElementById("ferieCategories");
    if (!zone) return;
    zone.innerHTML = catsFeries().map(function (c) {
      return '<div class="categorie' + (c.id === ferieCategorieActive ? " active" : "") + '" data-cat="' + c.id + '" style="--cat-couleur:' + c.couleur + '">' +
        '<input type="color" class="pastille-cat" value="' + esc2(c.couleur) + '" data-cat-couleur="' + c.id + '">' +
        '<span class="nom-cat">' + esc(c.nom) + '</span><span class="coche">' + (c.id === ferieCategorieActive ? "✓" : "") + '</span></div>';
    }).join("");
    zone.querySelectorAll(".categorie").forEach(function (el) {
      el.addEventListener("click", function (ev) {
        if (ev.target.classList.contains("pastille-cat")) return; // clic sur la pastille = choix de couleur, pas sélection de catégorie active
        ferieCategorieActive = el.dataset.cat;
        renderFerieCategories();
      });
    });
    zone.querySelectorAll(".pastille-cat").forEach(function (el) {
      // "input" : aperçu live pendant que le sélecteur natif est ouvert
      // (calendrier + grille du planning se reteintent immédiatement, comme
      // dans la maquette d'origine) — rien n'est envoyé au serveur ici.
      el.addEventListener("input", function () {
        var cat = catsFeries().filter(function (c) { return c.id === el.dataset.catCouleur; })[0];
        if (cat) cat.couleur = el.value;
        renderFerieCalendrier();
        render(false);
      });
      // "change" (tiré une fois la popup couleur native refermée) : seul
      // moment où on enregistre côté serveur — jamais à chaque "input", qui
      // tirerait des dizaines d'appels pendant un glissement dans le sélecteur.
      el.addEventListener("change", function () {
        enregistrerCouleurCategorieFerie(el.dataset.catCouleur, el.value);
      });
    });
  }
  function enregistrerCouleurCategorieFerie(id, couleur) {
    enregistrerCouleursCategoriesFeriesServeur([{ id: id, couleur: couleur }]).then(function (r) {
      etat.categoriesFeriesServeur = (r && r.length) ? r : etat.categoriesFeriesServeur;
      renderFerieCategories();
      renderFerieCalendrier();
      render(false);
      toast("Couleur enregistrée.");
    }).catch(function (err) { toast("Échec de l’enregistrement : " + (err && err.message ? err.message : err)); });
  }
  function renderFerieCalendrier() {
    var table = document.getElementById("ferieCalendrier");
    if (!table) return;
    var html = '<colgroup><col style="width:78px">';
    for (var jc = 1; jc <= 31; jc++) html += "<col>";
    html += "</colgroup><thead><tr><th class=\"coin\"></th>";
    for (var j = 1; j <= 31; j++) html += "<th>" + j + "</th>";
    html += "</tr></thead><tbody>";
    for (var m = 0; m < 12; m++) {
      html += '<tr><td class="mois">' + MOIS_FR[m] + "</td>";
      var nbJours = joursDansMois(ferieAnnee, m);
      for (var j2 = 1; j2 <= 31; j2++) {
        if (j2 > nbJours) { html += '<td class="jour vide"></td>'; continue; }
        var jourSemaine = new Date(ferieAnnee, m, j2).getDay();
        var estWeekend = jourSemaine === 0 || jourSemaine === 6;
        var entree = feriesAnneeCourante[m + "-" + j2];
        var cat = entree && catsFeries().filter(function (c) { return c.id === entree.categorie; })[0];
        var classes = "jour" + (estWeekend ? " weekend" : "") + (cat ? " coloree" : "");
        var style = cat ? ' style="--jour-couleur:' + cat.couleur + '"' : "";
        var titre = entree ? ' title="' + esc(entree.libelle) + '"' : "";
        html += '<td class="' + classes + '" data-m="' + m + '" data-j="' + j2 + '" data-weekend="' + estWeekend + '"' + style + titre + "></td>";
      }
      html += "</tr>";
    }
    html += "</tbody>";
    table.innerHTML = html;
    table.querySelectorAll("td.jour:not(.vide)").forEach(function (td) {
      if (td.dataset.weekend === "true") return; // week-end non cliquable (déjà chômé, cf. calculerFeries)
      td.addEventListener("click", function () { basculerJourFerie(+td.dataset.m, +td.dataset.j); });
    });
    renderFerieMoisMobile();
    majCompteModifsFeries();
  }
  // Clic (ordinateur) ou appui (téléphone) sur un jour : même règle pour les
  // 2 vues — pose la catégorie active, ou l'efface si le jour l'a déjà.
  function basculerJourFerie(m, j) {
    var key = m + "-" + j;
    var actuel = feriesAnneeCourante[key];
    if (actuel && actuel.categorie === ferieCategorieActive) {
      delete feriesAnneeCourante[key];
    } else {
      var catObj = catsFeries().filter(function (c) { return c.id === ferieCategorieActive; })[0];
      feriesAnneeCourante[key] = {
        iso: isoFerie(ferieAnnee, m, j),
        libelle: (actuel && actuel.libelle) || catObj.nom,
        categorie: ferieCategorieActive
      };
    }
    renderFerieCalendrier();
  }
  /* Version téléphone (round du 24.09.2026, suite 23 — Lionel : « Propose
     moi une version mobile de la page des feriés »). Le tableau annuel
     (12 lignes × 31 colonnes, 760px de large au minimum) obligeait à
     défiler de côté pour des cases de 24px, trop petites pour un doigt, et
     le libellé d'un jour n'était lisible qu'au survol (title), qui n'existe
     pas au doigt. Sur téléphone, il est remplacé par 12 mois l'un sous
     l'autre, en calendrier classique (lundi → dimanche, cases de ~44px) ;
     sous chaque mois, la liste de ses jours colorés avec leur libellé
     (« 25 déc. · Noël »). Les 2 vues sont TOUJOURS construites toutes les
     deux, à partir du même état (feriesAnneeCourante) ; c'est
     style-mobile.css qui montre l'une ou l'autre (≤600px) — rien à
     recalculer si l'écran pivote ou change de taille. */
  var JOURS_COURTS_FR = ["L", "M", "M", "J", "V", "S", "D"];
  var JOURS_ABREGES_FR = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  function renderFerieMoisMobile() {
    var zone = document.getElementById("ferieMoisMobile");
    if (!zone) return;
    var aujourdHui = new Date();
    var html = "";
    for (var m = 0; m < 12; m++) {
      var nbJours = joursDansMois(ferieAnnee, m);
      var decalage = (new Date(ferieAnnee, m, 1).getDay() + 6) % 7; // lundi = 0
      var cases = JOURS_COURTS_FR.map(function (l, i) { return '<span class="jm-entete' + (i >= 5 ? " weekend" : "") + '">' + l + "</span>"; }).join("");
      for (var v = 0; v < decalage; v++) cases += '<span class="jm-vide"></span>';
      var liste = [];
      for (var j = 1; j <= nbJours; j++) {
        var jourSemaine = new Date(ferieAnnee, m, j).getDay();
        var estWeekend = jourSemaine === 0 || jourSemaine === 6;
        var entree = feriesAnneeCourante[m + "-" + j];
        var cat = entree && catsFeries().filter(function (c) { return c.id === entree.categorie; })[0];
        var estAujourdHui = ferieAnnee === aujourdHui.getFullYear() && m === aujourdHui.getMonth() && j === aujourdHui.getDate();
        var classes = "jm" + (estWeekend ? " weekend" : "") + (cat ? " coloree" : "") + (estAujourdHui ? " aujourdhui" : "");
        cases += '<button type="button" class="' + classes + '" data-m="' + m + '" data-j="' + j + '"' +
          (cat ? ' style="--jour-couleur:' + cat.couleur + '"' : "") +
          (estWeekend ? " disabled" : "") +
          ' aria-label="' + j + " " + MOIS_FR[m] + (entree ? " — " + esc(entree.libelle) : "") + '">' + j + "</button>";
        if (entree) liste.push('<li><span class="pastille-jour" style="background:' + (cat ? cat.couleur : "var(--border)") + '"></span>' +
          '<span class="date-jour">' + JOURS_ABREGES_FR[jourSemaine] + " " + j + "</span>" +
          '<span class="libelle-jour">' + esc(entree.libelle) + "</span></li>");
      }
      html += '<section class="mois-carte">' +
        '<div class="mois-carte-titre"><span>' + MOIS_FR[m] + "</span>" +
          (liste.length ? '<span class="mois-carte-compte">' + liste.length + (liste.length > 1 ? " jours" : " jour") + "</span>" : "") + "</div>" +
        '<div class="mois-grille">' + cases + "</div>" +
        (liste.length ? '<ul class="mois-liste">' + liste.join("") + "</ul>" : "") +
        "</section>";
    }
    zone.innerHTML = html;
    zone.querySelectorAll("button.jm:not([disabled])").forEach(function (b) {
      b.addEventListener("click", function () { basculerJourFerie(+b.dataset.m, +b.dataset.j); });
    });
  }
  // Ce qui changerait sur le serveur si on cliquait Enregistrer : utilisé
  // par Enregistrer lui-même et par le compteur affiché sur le bouton.
  function diffFeries() {
    var modifs = [], nouveaux = [], supprimes = [], clesVues = {};
    Object.keys(feriesAnneeCourante).forEach(function (k) {
      clesVues[k] = true;
      var cur = feriesAnneeCourante[k], orig = feriesAnneeOriginal[k];
      if (!orig) nouveaux.push({ iso: cur.iso, libelle: cur.libelle, categorie: cur.categorie });
      else if (orig.libelle !== cur.libelle || orig.categorie !== cur.categorie) modifs.push({ iso: cur.iso, libelle: cur.libelle, categorie: cur.categorie });
    });
    Object.keys(feriesAnneeOriginal).forEach(function (k) { if (!clesVues[k]) supprimes.push(feriesAnneeOriginal[k].iso); });
    return { modifs: modifs, nouveaux: nouveaux, supprimes: supprimes };
  }
  // Compteur de modifications non enregistrées sur le bouton Enregistrer
  // (suite 23) : sur téléphone, la barre d'actions reste collée en bas
  // pendant qu'on fait défiler les 12 mois — le compteur rappelle qu'il
  // reste quelque chose à envoyer. Affiché aussi sur ordinateur.
  function majCompteModifsFeries() {
    var btn = document.getElementById("btnEnregistrerFeries");
    if (!btn) return;
    var d = diffFeries(), n = d.modifs.length + d.nouveaux.length + d.supprimes.length;
    btn.innerHTML = "Enregistrer" + (n ? ' <span class="compte-modifs">' + n + "</span>" : "");
    btn.classList.toggle("a-enregistrer", n > 0);
  }
  function renderFeries() {
    chargerFeriesAnnee(ferieAnnee);
    document.getElementById("ferieAnneeLabel").textContent = ferieAnnee;
    renderFerieCategories();
    renderFerieCalendrier();
  }
  function cablerPageFeries() {
    var prec = document.getElementById("ferieAnneePrec"), suiv = document.getElementById("ferieAnneeSuiv");
    if (prec) prec.addEventListener("click", function () { ferieAnnee--; renderFeries(); });
    if (suiv) suiv.addEventListener("click", function () { ferieAnnee++; renderFeries(); });
    var btnCalc = document.getElementById("btnCalculerFeries");
    if (btnCalc) btnCalc.addEventListener("click", function () {
      calculerFeries(ferieAnnee).forEach(function (it) {
        var key = it.mois + "-" + it.jour;
        var existant = feriesAnneeCourante[key];
        // Round du 02.09.2026 (suite, bug remonté par Lionel) : un jour déjà
        // catégorisé manuellement en "Vacances entreprise"/"Compensés" n'est
        // plus écrasé par un recalcul — seuls les jours encore vides ou déjà
        // "ferie" (donc pas encore décidés autrement) sont (re)remplis. Avant
        // ce correctif, "Calculer les fériés" remettait silencieusement en
        // "Férié" tout jour déjà marqué autrement s'il coïncidait avec un
        // férié calculé (Noël, Nouvel an, etc.) — repassait potentiellement
        // beaucoup de jours en rouge d'un coup, sans confirmation.
        if (existant && existant.categorie !== "ferie") return;
        feriesAnneeCourante[key] = { iso: isoFerie(ferieAnnee, it.mois, it.jour), libelle: it.nom, categorie: "ferie" };
      });
      renderFerieCalendrier();
      toast("Fériés calculés pour " + ferieAnnee + " (pas encore enregistrés).");
    });
    var btnEff = document.getElementById("btnEffacerFeries");
    if (btnEff) btnEff.addEventListener("click", function () {
      demanderConfirmation("Effacer toutes les dates colorées de " + ferieAnnee + " à l’écran (Enregistrer ensuite pour appliquer) ?", function () {
        feriesAnneeCourante = {};
        renderFerieCalendrier();
        toast("Effacé à l’écran — clique Enregistrer pour appliquer.");
      });
    });
    var btnSave = document.getElementById("btnEnregistrerFeries");
    if (btnSave) btnSave.addEventListener("click", function () {
      var d = diffFeries(), modifs = d.modifs, nouveaux = d.nouveaux, supprimes = d.supprimes;
      if (!modifs.length && !nouveaux.length && !supprimes.length) { toast("Rien à enregistrer."); return; }
      // Diagnostic (round du 02.09.2026, suite, bug remonté par Lionel —
      // "presque tout est écrasé lors de l'enregistrement"). Round encore
      // suivant (même jour) : Lionel a confirmé via apiVersionServeur() que
      // le déploiement actif sert bien CE WebApp.gs, et le bug persiste quand
      // même — l'hypothèse "déploiement pas à jour" est donc ÉLIMINÉE. Le
      // message ci-dessous ne doit plus prétendre le contraire (corrigé),
      // et le diagnostic est rendu plus précis (iso/catégorie concrets,
      // envoyé vs revenu, au lieu d'un simple compte) pour trouver la vraie
      // cause sans deviner à l'aveugle une 3e fois.
      var categoriesEnvoyees = {};
      modifs.concat(nouveaux).forEach(function (e) { categoriesEnvoyees[e.iso] = e.categorie; });
      enregistrerFeriesServeur(modifs, nouveaux, supprimes).then(function (r) {
        etat.feriesServeur = r || [];
        reconstruireFeriesParIso();
        chargerFeriesAnnee(ferieAnnee);
        renderFerieCalendrier();
        render(false); // les teintes de fériés du planning peuvent avoir changé
        var categoriesRevenues = {};
        (r || []).forEach(function (f) { categoriesRevenues[f.iso] = f.categorie; });
        var visees = 0, ecarts = 0, exemples = [];
        Object.keys(categoriesEnvoyees).forEach(function (iso) {
          if (categoriesEnvoyees[iso] === "ferie") return; // rien à détecter si "ferie" était déjà voulu
          visees++;
          var revenu = categoriesRevenues.hasOwnProperty(iso) ? categoriesRevenues[iso] : "(absent de la réponse)";
          if (revenu !== categoriesEnvoyees[iso]) {
            ecarts++;
            if (exemples.length < 3) exemples.push(iso + " : envoyé « " + categoriesEnvoyees[iso] + " », revenu « " + revenu + " »");
          }
        });
        if (ecarts > 0) {
          // Filet de sécurité conservé après la résolution du bug des fériés
          // (cf. BACKEND-CHANGELOG.md §19, cause = cellules fusionnées en
          // colonne "Catégorie") : si une catégorie enregistrée ne revient
          // pas telle qu'envoyée, mieux vaut le dire avec le détail utile que
          // d'afficher "Enregistré." sur une perte silencieuse — c'est ce
          // silence qui avait laissé le bug s'installer. Le rapatriement du
          // diagnostic serveur dans ce message, lui, est retiré : il n'avait
          // de sens que le temps de l'enquête.
          toast("Enregistré, mais " + ecarts + " jour(s) sur " + visees + " n’ont pas gardé la catégorie demandée. Exemples — " + exemples.join(" ; "));
        } else {
          toast("Enregistré.");
        }
      }).catch(function (err) { toast("Échec de l’enregistrement : " + (err && err.message ? err.message : err)); });
    });
  }

