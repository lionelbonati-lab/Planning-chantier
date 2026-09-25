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
  // Heures de travail dans le tableau (round du 25.09.2026, suite 27) —
  // Lionel : « Les heures de travail viennent s'afficher dans le tableau
  // des fériés », avec les totaux du mois (« Heures + totaux ») comme les
  // colonnes J.trav. / H.trav. de la feuille PMB. Chaque jour ouvré couvert
  // par un horaire (page Horaires) montre sa durée (8.75). Jour coloré
  // (férié, vacances, compensé…) : la durée s'affiche quand même (Lionel :
  // « Oui, heures quand même »), plus discrète, mais ne compte PAS dans les
  // totaux — ce n'est pas un jour travaillé, comme sur la feuille.
  // heuresFerieJour_ renvoie { duree, compte } ou null (week-end / sans horaire).
  //
  // Round du 25.09.2026 (suite 32) — Lionel : « Tu peux constater que
  // certains jours compensées (jaune) ont des heures de travaille. C'est
  // pour arriver à un total de 2112 heures de travaille à effectuer dans
  // l'année, sont compté dedans les vacances et jours fériés. Les
  // compensées sont le supplément de heures faites ». Sur la feuille PMB,
  // le 9 janvier est jaune ET compte 1.75 h dans J.trav./H.trav. (16 j,
  // 114.25 h en janvier) : c'est une demi-journée travaillée, décrite par
  // sa propre période « du 9 au 9 » dans le tableau des horaires. Alors
  // que le vendredi 15 mai (pont, jaune aussi) tombe dans la période du
  // 4 au 29 mai et ne compte PAS. D'où la règle : un jour COMPENSÉ compte
  // comme travaillé seulement quand une période d'un seul jour le couvre
  // (horaireDuJour(...).jourSeul). Férié et vacances ne comptent jamais
  // comme travaillés : ils ont leurs propres colonnes (cf. ci-dessous).
  function heuresFerieJour_(m, j) {
    var h = horaireDuJour(isoFerie(ferieAnnee, m, j));
    if (!h) return null;
    var entree = feriesAnneeCourante[m + "-" + j];
    return { duree: h.duree, compte: !entree || (entree.categorie === "compenses" && h.jourSeul) };
  }
  // Heures d'un jour férié ou de vacances (suite 32) : la feuille PMB
  // compte chacun 8.09 h (2 fériés en avril = 16.18, 25 jours de vacances
  // = 202.30) — les 2112 h annuelles réparties sur les jours ouvrés de
  // l'année (lundi → vendredi, 261 en 2026) : 2112 ÷ 261 = 8.0920 h. Au
  // centième près, la feuille retombe ainsi sur 1845.00 + 64.74 + 202.30
  // = 2112.03 h. Une année à 260 jours ouvrés donnera 8.12 h.
  var HEURES_ANNUELLES = 2112;
  function joursOuvresAnnee_(annee) {
    var n = 0;
    for (var d = new Date(annee, 0, 1); d.getFullYear() === annee; d = ajoutJours(d, 1)) {
      var wd = d.getDay();
      if (wd !== 0 && wd !== 6) n++;
    }
    return n;
  }
  function heuresJourPaye_() { return HEURES_ANNUELLES / joursOuvresAnnee_(ferieAnnee); }
  // Totaux d'un mois, colonnes de la feuille PMB : J.trav./H.trav.,
  // J.fériés/H.fériés, J.vac./H.vac. — plus les compensés (0 h : ils sont
  // rattrapés par les journées plus longues), comptés pour le bilan.
  function totauxMoisFeries_(m) {
    var t = { jours: 0, heures: 0, joursFeries: 0, joursVac: 0, joursComp: 0 }, nb = joursDansMois(ferieAnnee, m);
    for (var j = 1; j <= nb; j++) {
      var wd = new Date(ferieAnnee, m, j).getDay();
      if (wd === 0 || wd === 6) continue;
      var hj = heuresFerieJour_(m, j), entree = feriesAnneeCourante[m + "-" + j];
      if (hj && hj.compte) { t.jours++; t.heures += hj.duree; }
      else if (entree && entree.categorie === "ferie") t.joursFeries++;
      else if (entree && entree.categorie === "vacances_entreprise") t.joursVac++;
      else if (entree && entree.categorie === "compenses") t.joursComp++;
    }
    var hp = heuresJourPaye_();
    t.heuresFeries = t.joursFeries * hp;
    t.heuresVac = t.joursVac * hp;
    return t;
  }
  // Cellules J./H. d'une paire de colonnes : vides quand le nombre de jours est 0.
  function cellulesTotal_(jours, heures) {
    return '<td class="total">' + (jours || "") + '</td><td class="total">' + (jours ? formatDuree(heures) : "") + "</td>";
  }
  // Libellé du bilan annuel (pied du tableau et carte de fin sur téléphone).
  function texteBilanAnnuel_(an) {
    return "Nb. d’heures " + ferieAnnee + " (travaillées + fériés + vacances, 1 jour payé = " + HEURES_ANNUELLES + " ÷ " +
      joursOuvresAnnee_(ferieAnnee) + " = " + formatDuree(heuresJourPaye_()) + " h ; " + an.joursComp +
      (an.joursComp > 1 ? " jours compensés" : " jour compensé") + " à 0 h) — objectif " + HEURES_ANNUELLES + " h";
  }
  function renderFerieCalendrier() {
    var table = document.getElementById("ferieCalendrier");
    if (!table) return;
    var html = '<colgroup><col style="width:78px">';
    for (var jc = 1; jc <= 31; jc++) html += "<col>";
    html += '<col style="width:40px"><col style="width:58px"><col style="width:40px"><col style="width:52px"><col style="width:40px"><col style="width:58px">';
    html += "</colgroup><thead><tr><th class=\"coin\"></th>";
    for (var j = 1; j <= 31; j++) html += "<th>" + j + "</th>";
    html += '<th class="total" title="Jours travaillés">J.trav.</th><th class="total" title="Heures travaillées">H.trav.</th>' +
      '<th class="total" title="Jours fériés payés">J.fér.</th><th class="total" title="Heures fériées">H.fér.</th>' +
      '<th class="total" title="Jours de vacances">J.vac.</th><th class="total" title="Heures de vacances">H.vac.</th>';
    html += "</tr></thead><tbody>";
    var an = { jours: 0, heures: 0, joursFeries: 0, heuresFeries: 0, joursVac: 0, heuresVac: 0, joursComp: 0 };
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
        var hj = heuresFerieJour_(m, j2);
        html += '<td class="' + classes + '" data-m="' + m + '" data-j="' + j2 + '" data-weekend="' + estWeekend + '"' + style + titre + ">" +
          (hj ? '<span class="h-jour' + (hj.compte ? "" : " h-non-compte") + '">' + formatDuree(hj.duree) + "</span>" : "") + "</td>";
      }
      var tm = totauxMoisFeries_(m);
      Object.keys(an).forEach(function (k) { an[k] += tm[k]; });
      html += cellulesTotal_(tm.jours, tm.heures) + cellulesTotal_(tm.joursFeries, tm.heuresFeries) + cellulesTotal_(tm.joursVac, tm.heuresVac);
      html += "</tr>";
    }
    // Pied : « Total travaillé 2026 » (ligne du bas de la feuille), puis le
    // « Nb. d'heures » de son encadré — travaillées + fériées + vacances,
    // à comparer aux 2112 h annuelles (suite 32).
    html += '</tbody><tfoot><tr><td class="mois" colspan="32">Total travaillé ' + ferieAnnee + "</td>" +
      '<td class="total">' + an.jours + '</td><td class="total">' + formatDuree(an.heures) + "</td>" +
      cellulesTotal_(an.joursFeries, an.heuresFeries) + cellulesTotal_(an.joursVac, an.heuresVac) + "</tr>" +
      '<tr class="bilan-annuel"><td class="mois" colspan="32">' + esc(texteBilanAnnuel_(an)) + "</td>" +
      '<td class="total" colspan="6" title="Heures travaillées + fériées + vacances">' + formatDuree(an.heures + an.heuresFeries + an.heuresVac) + " h</td></tr></tfoot>";
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
    var anM = { jours: 0, heures: 0, joursFeries: 0, heuresFeries: 0, joursVac: 0, heuresVac: 0, joursComp: 0 };
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
        var hjM = heuresFerieJour_(m, j);
        cases += '<button type="button" class="' + classes + '" data-m="' + m + '" data-j="' + j + '"' +
          (cat ? ' style="--jour-couleur:' + cat.couleur + '"' : "") +
          (estWeekend ? " disabled" : "") +
          ' aria-label="' + j + " " + MOIS_FR[m] + (entree ? " — " + esc(entree.libelle) : "") + (hjM ? ", " + formatDuree(hjM.duree) + " h" : "") + '">' + j +
          (hjM ? '<small class="h-jour' + (hjM.compte ? "" : " h-non-compte") + '">' + formatDuree(hjM.duree) + "</small>" : "") + "</button>";
        if (entree) liste.push('<li><span class="pastille-jour" style="background:' + (cat ? cat.couleur : "var(--border)") + '"></span>' +
          '<span class="date-jour">' + JOURS_ABREGES_FR[jourSemaine] + " " + j + "</span>" +
          '<span class="libelle-jour">' + esc(entree.libelle) + "</span></li>");
      }
      // Totaux du mois (suite 27) : jours et heures travaillés, à côté du
      // nombre de jours colorés.
      var tmM = totauxMoisFeries_(m);
      Object.keys(anM).forEach(function (k) { anM[k] += tmM[k]; });
      var comptes = [];
      if (tmM.jours) comptes.push(tmM.jours + " j · " + formatDuree(tmM.heures) + " h");
      if (liste.length) comptes.push(liste.length + (liste.length > 1 ? " jours colorés" : " jour coloré"));
      html += '<section class="mois-carte">' +
        '<div class="mois-carte-titre"><span>' + MOIS_FR[m] + "</span>" +
          (comptes.length ? '<span class="mois-carte-compte">' + comptes.join(" — ") + "</span>" : "") + "</div>" +
        '<div class="mois-grille">' + cases + "</div>" +
        (liste.length ? '<ul class="mois-liste">' + liste.join("") + "</ul>" : "") +
        "</section>";
    }
    // Bilan de l'année (suite 32) : l'encadré de la feuille PMB, en carte
    // sous décembre — le tableau (et son pied) est masqué sur téléphone.
    var ligneBilan = function (lib, jours, heures) {
      return "<li><span class=\"libelle-jour\">" + lib + '</span><span class="date-jour">' + jours + " j</span><b>" + formatDuree(heures) + " h</b></li>";
    };
    html += '<section class="mois-carte bilan-annuel">' +
      '<div class="mois-carte-titre"><span>Bilan ' + ferieAnnee + '</span><span class="mois-carte-compte">' +
        formatDuree(anM.heures + anM.heuresFeries + anM.heuresVac) + " h</span></div>" +
      '<ul class="mois-liste">' + ligneBilan("Travaillé", anM.jours, anM.heures) + ligneBilan("Fériés", anM.joursFeries, anM.heuresFeries) +
        ligneBilan("Vacances", anM.joursVac, anM.heuresVac) + "</ul>" +
      '<p class="bilan-note">' + esc(texteBilanAnnuel_(anM)) + "</p></section>";
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

