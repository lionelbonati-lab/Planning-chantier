"use strict";
  /* ============================================================
     AFFICHAGE — round du 26.09.2026 (suite 62)
     ------------------------------------------------------------
     Lionel : « Ajouter d'autre options d'affichages avec aperçu. »

     Page « Affichage » (pastille L > Affichage, cf. PAGES_REGLAGES dans
     js/coquille.js). Jusqu'ici un seul réglage, « Afficher les week-ends »,
     qui n'était même pas retenu d'une ouverture à l'autre. Maintenant :
       Planning — week-ends, séparation entre 2 semaines (espace arrondi de
         la suite 61 ou trait épais d'avant), colonne d'aujourd'hui
         surlignée, lignes alternées (une personne sur deux teintée) ;
       Bulles — taille du texte, nombre de lignes de texte, hauteur des
         lignes, coins arrondis ou droits, statut affiché ou masqué ;
       À l'ouverture — 1 ou 2 semaines (ordinateur, tablette), 1 jour ou
         1 semaine (téléphone).
     Chaque changement s'applique tout de suite au planning ET à l'aperçu
     en haut de la page (un petit planning d'exemple : Jeu, Ven, [Sam, Dim],
     Lun, Mar — pour voir aussi les week-ends et la séparation de semaine).

     Comment : les réglages « de style » sont posés en attributs sur <html>
     (data-aff-texte="grand"…), seulement quand ils diffèrent de l'origine —
     à l'origine, rien ne change au pixel près. Les règles CSS (style.css,
     « Options d'affichage ») visent À LA FOIS les vraies bulles (.b-txt,
     .b-carte…) et celles de l'aperçu (.aa-txt, .aa-carte…) : l'aperçu n'a
     aucun code de rendu à lui, il suit les mêmes règles que le planning.

     Enregistrement : table `reglages`, clé « affichage », seulement les
     réglages modifiés — partagé par le compte comme les raccourcis — plus
     une copie sur l'appareil (localStorage « planning.affichage »), lue dès
     le chargement de ce fichier pour que le planning s'affiche tout de
     suite avec les bons réglages.

     Suite 64 (même jour) — Lionel, « Setup affichage planning » :
       « Proposer divers option d'affichage des dates. afficher ou non les
         heures de travaille.
       · Afficher ou non la ligne des horaires, pouvoir choisir entre
         horaire ou M|A.
       · Colorier ou non les colonnes matin ou après-midi.
       · Entre 2 semaines, proposer espace ou rien. plus de ligne épaisse.
       · Coins du planning arrondi ou carré
       · Afficher statuts: non, pastille, badge.
       · taille du texte planning
       · police pour l'ensemble du document »
     D'où le groupe « Dates » (jour de la semaine, date, heures de
     travail, ligne sous les jours), la teinte matin / après-midi, « Rien »
     à la place du trait épais, les coins du cadre, le statut en 3 choix,
     une 4e taille de texte et le groupe « Police ». Les anciennes valeurs
     enregistrées sont reprises (alias : separation « trait » -> « rien »,
     statut « oui » -> « badge »).
     ============================================================ */

  var CLE_AFFICHAGE = "affichage", CLE_AFFICHAGE_LOCAL = "planning.affichage";
  // interrupteur : oui/non (case à cocher) ; sinon choix en pastilles.
  // css : posé en data-aff-<id> sur <html> quand ≠ défaut.
  // alias : anciennes valeurs enregistrées -> valeur actuelle (suite 64).
  var OPTIONS_AFFICHAGE = [
    { id: "weekends", groupe: "Planning", nom: "Afficher les week-ends", aide: "Ajoute Samedi et Dimanche à la fin de chaque semaine, pour y poser une tâche ponctuelle.", interrupteur: true, defaut: "non" },
    { id: "auj", groupe: "Planning", nom: "Surligner aujourd’hui", aide: "Teinte toute la colonne du jour, pas seulement son en-tête.", interrupteur: true, defaut: "non", css: true },
    { id: "zebre", groupe: "Planning", nom: "Lignes alternées", aide: "Une personne sur deux légèrement teintée, pour suivre une ligne d’un bout à l’autre.", interrupteur: true, defaut: "non", css: true },
    { id: "teinte", groupe: "Planning", nom: "Colonnes teintées", aide: "La demi-journée légèrement grisée, pour distinguer le matin de l’après-midi.", choix: [["aucune", "Aucune"], ["matin", "Matin"], ["aprem", "Après-midi"]], defaut: "aprem", css: true },
    { id: "separation", groupe: "Planning", nom: "Entre 2 semaines", aide: "Un espace, comme 2 fenêtres côte à côte, ou rien : un simple trait comme entre 2 jours.", choix: [["espace", "Espace"], ["rien", "Rien"]], defaut: "espace", alias: { trait: "rien" }, css: true },
    { id: "cadre", groupe: "Planning", nom: "Coins du planning", choix: [["arrondis", "Arrondis"], ["carres", "Carrés"]], defaut: "arrondis", css: true },
    { id: "jourSemaine", groupe: "Dates", nom: "Jour de la semaine", choix: [["abrege", "Jeu"], ["complet", "Jeudi"], ["initiale", "J"], ["masque", "Masqué"]], defaut: "abrege" },
    { id: "formatDate", groupe: "Dates", nom: "Date", choix: [["numero", "24"], ["chiffres", "24.09"], ["abrege", "24 sept."], ["complet", "24 septembre"]], defaut: "numero" },
    { id: "heures", groupe: "Dates", nom: "Heures de travail", aide: "La durée du jour (8.75 h) sous la date, d’après la page Horaires.", interrupteur: true, defaut: "oui" },
    { id: "ligneDemi", groupe: "Dates", nom: "Ligne sous les jours", aide: "Les horaires du matin et de l’après-midi, ou simplement M | A.", choix: [["horaires", "Horaires"], ["ma", "M | A"], ["masquee", "Masquée"]], defaut: "horaires" },
    { id: "texte", groupe: "Bulles", nom: "Taille du texte", choix: [["petit", "Petit"], ["normal", "Normal"], ["grand", "Grand"], ["tresgrand", "Très grand"]], defaut: "normal", css: true },
    { id: "lignes", groupe: "Bulles", nom: "Lignes de texte", aide: "Au-delà, le texte est coupé par « … ».", choix: [["1", "1"], ["2", "2"], ["3", "3"]], defaut: "2", css: true },
    { id: "hauteur", groupe: "Bulles", nom: "Hauteur des lignes", aide: "Serrée : plus de personnes à l’écran. Aérée : plus lisible.", choix: [["serree", "Serrée"], ["normale", "Normale"], ["aeree", "Aérée"]], defaut: "normale", css: true },
    { id: "coins", groupe: "Bulles", nom: "Coins des bulles", choix: [["arrondis", "Arrondis"], ["droits", "Droits"]], defaut: "arrondis", css: true },
    { id: "statut", groupe: "Bulles", nom: "Statut", aide: "Badge : « Confirmé », « Réservé »… sous le texte. Pastille : un point de sa couleur dans le coin (le nom au survol).", choix: [["non", "Non"], ["pastille", "Pastille"], ["badge", "Badge"]], defaut: "badge", alias: { oui: "badge" }, css: true },
    { id: "police", groupe: "Police", nom: "Police de l’appli", aide: "Pour tout le document : planning, pages, fenêtres.", choix: [["archivo", "Archivo"], ["inter", "Inter"], ["roboto", "Roboto"], ["nunito", "Nunito"], ["sourcesans", "Source Sans"], ["systeme", "Système"]], defaut: "archivo", css: true },
    { id: "vueOrdi", groupe: "À l’ouverture", nom: "Ordinateur, tablette", choix: [["1", "1 semaine"], ["2", "2 semaines"]], defaut: "1" },
    { id: "vueTel", groupe: "À l’ouverture", nom: "Téléphone", choix: [["jour", "1 jour"], ["semaine", "1 semaine"]], defaut: "jour" }
  ];
  // Polices Google (suite 64) : chargées à la demande — celle choisie au
  // démarrage, toutes en ouvrant la page Affichage (chaque pastille est
  // écrite dans sa police). Archivo est déjà chargée par index.html ;
  // « Système » est celle de l'appareil.
  var POLICES_GOOGLE_ = { inter: "Inter", roboto: "Roboto", nunito: "Nunito", sourcesans: "Source Sans 3" };
  var FAMILLES_POLICES_ = { archivo: "'Archivo', 'Helvetica Neue', Arial, sans-serif", inter: "'Inter', system-ui, sans-serif", roboto: "'Roboto', system-ui, sans-serif",
    nunito: "'Nunito', system-ui, sans-serif", sourcesans: "'Source Sans 3', system-ui, sans-serif", systeme: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" };
  function chargerPolices_(ids) {
    var familles = ids.filter(function (id) { return POLICES_GOOGLE_[id]; });
    if (!familles.length) return;
    var cle = familles.sort().join(",");
    if (document.querySelector('link[data-polices="' + cle + '"]')) return;
    var l = document.createElement("link");
    l.rel = "stylesheet"; l.dataset.polices = cle;
    l.href = "https://fonts.googleapis.com/css2?" + familles.map(function (id) { return "family=" + POLICES_GOOGLE_[id].replace(/ /g, "+") + ":wght@400;500;600;700;800"; }).join("&") + "&display=swap";
    document.head.appendChild(l);
  }
  function optionAffichageParId_(id) { return OPTIONS_AFFICHAGE.filter(function (o) { return o.id === id; })[0] || null; }
  function valeurAffichage_(o, v) { return o && o.alias && o.alias[v] ? o.alias[v] : v; }
  function valeurPermise_(o, v) {
    if (typeof v !== "string") return false;
    return o.interrupteur ? (v === "oui" || v === "non") : o.choix.some(function (c) { return c[0] === v; });
  }

  // ---- Lecture / écriture ---------------------------------------------
  // etat.reglages : undefined avant le 1er chargement, null si la table n'a
  // pas répondu -> copie de l'appareil ; objet -> il fait foi.
  function modifsAffichage_() {
    var r = window.etat && etat.reglages, m = null;
    if (r) m = r[CLE_AFFICHAGE];
    else { try { m = JSON.parse(localStorage.getItem(CLE_AFFICHAGE_LOCAL) || "null"); } catch (e) { m = null; } }
    return m && typeof m === "object" ? m : {};
  }
  function optionAffichage(id) {
    var o = optionAffichageParId_(id), v = valeurAffichage_(o, modifsAffichage_()[id]);
    return o && valeurPermise_(o, v) ? v : (o ? o.defaut : null);
  }
  function affichageModifie_() {
    return OPTIONS_AFFICHAGE.some(function (o) { return optionAffichage(o.id) !== o.defaut; });
  }
  var minuteurAffichage_ = null;
  function enregistrerModifsAffichage_(m) {
    // Un réglage revenu à l'origine n'a plus rien à garder.
    Object.keys(m).forEach(function (id) {
      var o = optionAffichageParId_(id);
      if (o) m[id] = valeurAffichage_(o, m[id]);
      if (!o || !valeurPermise_(o, m[id]) || m[id] === o.defaut) delete m[id];
    });
    if (window.etat && etat.reglages) etat.reglages[CLE_AFFICHAGE] = m;
    try { localStorage.setItem(CLE_AFFICHAGE_LOCAL, JSON.stringify(m)); } catch (e) {}
    clearTimeout(minuteurAffichage_);
    minuteurAffichage_ = setTimeout(function () {
      sbClient.from("reglages").upsert({ cle: CLE_AFFICHAGE, valeur: m, maj: new Date().toISOString() }, { onConflict: "cle" }).then(function (res) {
        if (res.error) throw res.error;
        if (window.etat && !etat.reglages) { etat.reglages = {}; etat.reglages[CLE_AFFICHAGE] = m; }
      }).catch(function (err) {
        toast("Affichage gardé sur cet appareil, mais pas enregistré sur le compte : " + (err && err.message ? err.message : err));
      });
    }, 400);
  }

  // ---- Application -----------------------------------------------------
  // Attributs de style sur <html> : seulement ceux qui diffèrent de
  // l'origine (aucun attribut = le planning d'avant cette suite).
  function appliquerStyleAffichage_() {
    var html = document.documentElement;
    OPTIONS_AFFICHAGE.forEach(function (o) {
      if (!o.css) return;
      var v = optionAffichage(o.id);
      if (v === o.defaut) html.removeAttribute("data-aff-" + o.id);
      else html.setAttribute("data-aff-" + o.id, v);
    });
    // Police (suite 64) : la famille passe par --police (style.css).
    var police = optionAffichage("police");
    if (police === "archivo") html.style.removeProperty("--police");
    else { html.style.setProperty("--police", FAMILLES_POLICES_[police]); chargerPolices_([police]); }
  }
  // En-tête d'un jour du planning (suite 64, groupe « Dates ») : nom du
  // jour et date selon les réglages. `numero` : le numéro tel que l'en-tête
  // l'a toujours écrit (défaut, rien ne change au pixel près).
  var NOMS_JOURS_AFF_ = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  var MOIS_AFF_ = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var MOIS_ABR_AFF_ = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  function enteteJourAffichage(iso, numero) {
    var an = +iso.slice(0, 4), mo = +iso.slice(5, 7), jr = +iso.slice(8, 10);
    var complet = NOMS_JOURS_AFF_[new Date(Date.UTC(an, mo - 1, jr)).getUTCDay()];
    var fj = optionAffichage("jourSemaine"), fd = optionAffichage("formatDate");
    var nom = fj === "complet" ? complet : fj === "initiale" ? complet.charAt(0) : fj === "masque" ? "" : complet.slice(0, 3);
    var p = function (x) { return (x < 10 ? "0" : "") + x; };
    var jour = jr === 1 ? "1er" : String(jr);
    var date = fd === "chiffres" ? p(jr) + "." + p(mo) : fd === "abrege" ? jour + " " + MOIS_ABR_AFF_[mo - 1] : fd === "complet" ? jour + " " + MOIS_AFF_[mo - 1]
      : (numero === undefined || numero === null || numero === "" ? String(jr) : String(numero));
    return { nom: nom, date: date };
  }
  // Au chargement des données (donnees-sync.js, juste après etat.reglages,
  // AVANT le calcul de la fenêtre chargée et le 1er rendu) : week-ends et
  // vue d'ouverture, en plus du style.
  function appliquerAffichageAuChargement() {
    appliquerStyleAffichage_();
    afficherWeekends = optionAffichage("weekends") === "oui";
    var telephone = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 600px)").matches;
    if (!telephone) deuxSemaines = optionAffichage("vueOrdi") === "2";
    vueJourMobile = optionAffichage("vueTel") !== "semaine";
  }
  // Tout de suite au chargement de ce fichier (copie de l'appareil) : le
  // style est déjà le bon au premier affichage, sans attendre le serveur.
  appliquerStyleAffichage_();

  function changerOptionAffichage(id, valeur) {
    var o = optionAffichageParId_(id);
    if (!o || !valeurPermise_(o, valeur)) return;
    var m = JSON.parse(JSON.stringify(modifsAffichage_()));
    m[id] = valeur;
    enregistrerModifsAffichage_(m);
    appliquerEffetOption_(id);
    majPageAffichage();
  }
  function appliquerEffetOption_(id) {
    appliquerStyleAffichage_();
    if (id === "weekends") {
      afficherWeekends = optionAffichage("weekends") === "oui";
      var chk = document.getElementById("chkWeekends");
      if (chk) chk.checked = afficherWeekends;
    }
    // Vue d'ouverture : prise à la prochaine ouverture seulement. Police :
    // style seul (les hauteurs se remesurent au rendu ci-dessous). Le reste
    // change la grille (séparateurs, hauteurs mesurées en vue « 1 jour ») :
    // nouveau rendu, s'il y a déjà un planning.
    if (id === "vueOrdi" || id === "vueTel") return;
    if (typeof racineEl !== "undefined" && racineEl && typeof render === "function") render(false);
  }
  function retablirAffichage() {
    var avant = {};
    OPTIONS_AFFICHAGE.forEach(function (o) { avant[o.id] = optionAffichage(o.id); });
    enregistrerModifsAffichage_({});
    afficherWeekends = false;
    var chk = document.getElementById("chkWeekends");
    if (chk) chk.checked = false;
    appliquerStyleAffichage_();
    if (Object.keys(avant).some(function (id) { return id !== "vueOrdi" && id !== "vueTel" && avant[id] !== optionAffichageParId_(id).defaut; }) &&
      typeof racineEl !== "undefined" && racineEl) render(false);
    majPageAffichage();
  }

  // ---- Page ------------------------------------------------------------
  function htmlLigneOption_(o) {
    var aide = o.aide ? '<span>' + esc(o.aide) + '</span>' : '';
    if (o.interrupteur) {
      // « Afficher les week-ends » garde son id d'origine (#chkWeekends) :
      // la touche W et les tests le cochent.
      var idChk = o.id === "weekends" ? "chkWeekends" : "chkAff-" + o.id;
      return '<label class="reglage-ligne" data-option="' + o.id + '"><span class="reglage-texte"><b>' + esc(o.nom) + '</b>' + aide + '</span>' +
        '<span class="interrupteur"><input type="checkbox" id="' + idChk + '" data-option="' + o.id + '"><span class="interrupteur-piste"></span></span></label>';
    }
    return '<div class="reglage-ligne reglage-choix" data-option="' + o.id + '"><span class="reglage-texte"><b id="nomAff-' + o.id + '">' + esc(o.nom) + '</b>' + aide + '</span>' +
      '<span class="choix-pastilles" role="radiogroup" aria-labelledby="nomAff-' + o.id + '">' +
      o.choix.map(function (c) {
        // Police : chaque pastille écrite dans sa police (suite 64).
        var style = o.id === "police" ? ' style="font-family:' + FAMILLES_POLICES_[c[0]].replace(/'/g, "&#39;") + '"' : "";
        return '<button type="button" role="radio" class="choix-pastille" data-option="' + o.id + '" data-valeur="' + c[0] + '" aria-checked="false"' + style + '>' + esc(c[1]) + '</button>';
      }).join("") + '</span></div>';
  }
  function htmlContenuPageAffichage() {
    var groupes = [];
    OPTIONS_AFFICHAGE.forEach(function (o) { if (groupes.indexOf(o.groupe) < 0) groupes.push(o.groupe); });
    return '<div class="page-titre"><h1>Affichage</h1><button type="button" class="lien-reset-tout" id="btnAffichageDefaut" hidden>Tout rétablir</button></div>' +
      '<p class="page-sous">Réglages d’affichage du planning, les mêmes sur tous les appareils du compte. L’aperçu montre le résultat.</p>' +
      '<div class="affichage-mise">' +
        '<div class="affichage-apercu-bloc"><div id="apercuAffichage"></div></div>' +
        '<div class="affichage-options">' +
          groupes.map(function (g) {
            return '<h2 class="titre-liste">' + esc(g) + '</h2>' +
              OPTIONS_AFFICHAGE.filter(function (o) { return o.groupe === g; }).map(htmlLigneOption_).join("");
          }).join("") +
          '<p class="page-sous affichage-note">« À l’ouverture » : pris en compte à la prochaine ouverture de l’appli.</p>' +
        '</div>' +
      '</div>';
  }

  // Petit planning d'exemple. Les couleurs des tâches sont celles des 3
  // premiers chantiers actifs (sinon des teintes neutres), le statut celui
  // du 1er statut connu — le même rendu que dans le vrai planning.
  // Suite 64 : comme le planning, 2 colonnes par jour ouvré (matin,
  // après-midi) et la ligne sous les jours ; en-têtes écrits par
  // enteteJourAffichage, horaires d'exemple (7 h–12 h, 13 h–16 h 45).
  function htmlApercuAffichage_() {
    var we = optionAffichage("weekends") === "oui", espace = optionAffichage("separation") === "espace";
    var ligneDemi = optionAffichage("ligneDemi"), heures = optionAffichage("heures") === "oui";
    var chantiers = (window.etat && etat.chantiers || []).filter(function (c) { return c.actif !== false && c.couleur; });
    var teintes = ["#f6c6b3", "#b9d3f0", "#f8e1b0"].map(function (d, i) { return chantiers[i] ? chantiers[i].couleur : d; });
    var cleStatut = typeof STATUTS_ORDRE !== "undefined" && STATUTS_ORDRE.filter(function (k) { return STATUTS[k]; })[0];
    var statut = cleStatut ? STATUTS[cleStatut] : null;
    var nomStatut = statut ? statut.nom : "Confirmé";
    var styleStatut = statut && statut.couleur ? ' style="background:' + esc(statut.couleur) + '"' : "";
    // Jours : [clé, date iso, type]. La séparation de semaine est posée
    // par-dessus (placerSepApercu_), comme dans le vrai planning.
    // Téléphone : sans le mardi, pour garder des colonnes lisibles.
    var etroit = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 600px)").matches;
    var jours = [["jeu", "2026-09-24", "jour"], ["ven", "2026-09-25", "jour"]];
    if (we) jours.push(["sam", "2026-09-26", "we"], ["dim", "2026-09-27", "we"]);
    jours.push(["lun", "2026-09-28", "jour"]);
    if (!etroit) jours.push(["mar", "2026-09-29", "jour"]);
    // Colonnes de la grille : noms, puis matin + après-midi par jour ouvré,
    // une seule par jour de week-end.
    var debut = {}, fin = {}, c0 = 2, pistes = ["var(--aa-noms)"];
    jours.forEach(function (j) {
      debut[j[0]] = c0;
      if (j[2] === "we") { pistes.push("minmax(0, .55fr)"); c0 += 1; }
      else { pistes.push("minmax(0, .5fr)", "minmax(0, .5fr)"); c0 += 2; }
      fin[j[0]] = c0;
    });
    // Jour absent de l'aperçu (le mardi sur téléphone) : le dernier affiché.
    function colDe(k) { return debut[k] || debut[jours[jours.length - 1][0]]; }
    function colA(k) { return fin[k] || fin[jours[jours.length - 1][0]]; }
    function classesJour(j) {
      return (j[2] === "we" ? " aa-we" : "") + (j[0] === "lun" ? " aa-lun" : "");
    }
    var h = [], row = 1;
    h.push('<span class="aa-coin" style="grid-row:1;grid-column:1">Sept.</span>');
    jours.forEach(function (j) {
      var e = enteteJourAffichage(j[1]);
      var duree = heures && j[2] !== "we" ? '<span class="aa-duree">' + (j[0] === "ven" ? "8.25" : "8.75") + ' h</span>' : "";
      h.push('<span class="aa-th' + (j[0] === "jeu" ? " aa-today" : "") + classesJour(j) + '" style="grid-row:1;grid-column:' + colDe(j[0]) + ' / ' + colA(j[0]) + '">' +
        (e.nom ? '<span class="aa-jour">' + esc(e.nom) + '</span>' : '') + '<b class="aa-date">' + esc(e.date) + '</b>' + duree + '</span>');
    });
    if (ligneDemi !== "masquee") {
      row = 2;
      h.push('<span class="aa-coin aa-demi" style="grid-row:2;grid-column:1"></span>');
      jours.forEach(function (j) {
        if (j[2] === "we") { h.push('<span class="aa-demi aa-we" style="grid-row:2;grid-column:' + colDe(j[0]) + '"></span>'); return; }
        var m = ligneDemi === "ma" ? "M" : "07:00–<wbr>12:00", a = ligneDemi === "ma" ? "A" : "13:00–<wbr>" + (j[0] === "ven" ? "16:15" : "16:45");
        h.push('<span class="aa-demi aa-matin' + classesJour(j) + '" style="grid-row:2;grid-column:' + colDe(j[0]) + '">' + m + '</span>' +
          '<span class="aa-demi aa-aprem" style="grid-row:2;grid-column:' + (colDe(j[0]) + 1) + '">' + a + '</span>');
      });
    }
    ["Lionel", "Mathis", "Antoine"].forEach(function (nom, p) {
      var r = row + p + 1, alt = p % 2 === 1 ? " aa-alt" : "";
      h.push('<span class="aa-nom' + alt + '" style="grid-row:' + r + ';grid-column:1">' + nom + '</span>');
      jours.forEach(function (j) {
        var auj = j[0] === "jeu" ? " aa-auj" : "";
        if (j[2] === "we") { h.push('<span class="aa-cell' + alt + classesJour(j) + '" style="grid-row:' + r + ';grid-column:' + colDe(j[0]) + '"></span>'); return; }
        h.push('<span class="aa-cell aa-matin' + alt + auj + classesJour(j) + '" style="grid-row:' + r + ';grid-column:' + colDe(j[0]) + '"></span>' +
          '<span class="aa-cell aa-aprem' + alt + auj + '" style="grid-row:' + r + ';grid-column:' + (colDe(j[0]) + 1) + '"></span>');
      });
    });
    // de/a : clé du jour, "m" ou "a" pour une seule demi-journée.
    function bulle(p, de, a, texte, teinte, avecStatut, demi) {
      var c1 = demi === "a" ? colDe(de) + 1 : colDe(de), c2 = demi === "m" ? colDe(a) + 1 : colA(a);
      return '<span class="aa-bulle" style="grid-row:' + (row + p + 1) + ';grid-column:' + c1 + ' / ' + c2 + '"><span class="aa-carte" style="background:' + esc(teinte) + '">' +
        '<span class="aa-txt">' + esc(texte) + '</span>' +
        (avecStatut ? '<span class="aa-statut"' + styleStatut + ' title="' + esc(nomStatut) + '"><i></i>' + esc(nomStatut) + '</span>' : '') + '</span></span>';
    }
    h.push(bulle(0, "jeu", "ven", "Bétonnage dalle piliers et muret de l’extension côté jardin", teintes[0]));
    h.push(bulle(0, "lun", "lun", "Coffrage piliers", teintes[1]));
    h.push(bulle(1, "jeu", "jeu", "Gabarits", teintes[2], false, "m"));
    h.push(bulle(1, "lun", "mar", "Décoffrage balcons", teintes[1]));
    h.push(bulle(2, "ven", "ven", "Armature dalle supérieure", teintes[0], true));
    if (!etroit) h.push(bulle(2, "mar", "mar", "Ouvertures murs", teintes[2]));
    return '<div class="apercu-affichage" aria-hidden="true"><div class="aa-cadre">' +
      '<div class="aa-grille" style="grid-template-columns:' + pistes.join(" ") + '">' + h.join("") + '</div></div>' +
      (espace ? '<div class="sep-semaines sep-haut aa-sep" hidden><span class="sep-coin sep-coin-g"></span><span class="sep-coin sep-coin-d"></span></div>' +
        '<div class="sep-semaines sep-bas aa-sep" hidden><span class="sep-coin sep-coin-g"></span><span class="sep-coin sep-coin-d"></span></div>' : '') +
      '</div>';
  }
  // Espace entre semaines de l'aperçu : les 2 mêmes pièces que le vrai
  // planning (.sep-semaines, cf. poserSepSemaines_ dans grille-rendu.js),
  // 5 px à gauche et 3 px à droite du bord du lundi, sur toute la hauteur
  // du cadre (moitié haute : angles arrondis en haut ; basse : en bas).
  function placerSepApercu_() {
    var ap = document.querySelector("#apercuAffichage .apercu-affichage");
    var lun = ap && ap.querySelector(".aa-th.aa-lun");
    var pieces = ap ? ap.querySelectorAll(".aa-sep") : [];
    if (!lun || !pieces.length) return;
    var ra = ap.getBoundingClientRect();
    if (!ra.width) return;
    var x = Math.round(lun.getBoundingClientRect().left - ra.left) - 5, moitie = Math.round(ra.height / 2);
    pieces[0].style.cssText = "left:" + x + "px;top:0;bottom:auto;height:" + moitie + "px";
    pieces[1].style.cssText = "left:" + x + "px;top:" + moitie + "px;height:" + (ra.height - moitie) + "px";
    pieces[0].hidden = pieces[1].hidden = false;
  }
  var roApercu_ = null;

  function majPageAffichage() {
    var page = document.getElementById("page-affichage");
    if (!page) return;
    // Pastilles « Police » : chaque police, seulement une fois la page ouverte.
    if (page.classList.contains("actif")) chargerPolices_(Object.keys(POLICES_GOOGLE_));
    OPTIONS_AFFICHAGE.forEach(function (o) {
      var v = optionAffichage(o.id);
      if (o.interrupteur) {
        var chk = page.querySelector('input[data-option="' + o.id + '"]');
        if (chk) chk.checked = v === "oui";
        return;
      }
      page.querySelectorAll('.choix-pastille[data-option="' + o.id + '"]').forEach(function (b) {
        var actif = b.dataset.valeur === v;
        b.classList.toggle("actif", actif);
        b.setAttribute("aria-checked", actif ? "true" : "false");
        b.tabIndex = actif ? 0 : -1;
      });
    });
    var btn = document.getElementById("btnAffichageDefaut");
    if (btn) btn.hidden = !affichageModifie_();
    var ap = document.getElementById("apercuAffichage");
    if (!ap) return;
    ap.innerHTML = htmlApercuAffichage_();
    placerSepApercu_();
    // Replacé quand la page devient visible ou change de largeur.
    if (!roApercu_ && window.ResizeObserver) { roApercu_ = new ResizeObserver(placerSepApercu_); roApercu_.observe(ap); }
  }

  // Câblage, une fois la page posée par construireCoquille (js/coquille.js).
  function initPageAffichage() {
    var page = document.getElementById("page-affichage");
    if (!page) return;
    page.addEventListener("change", function (e) {
      var chk = e.target.closest('input[type="checkbox"][data-option]');
      if (chk) changerOptionAffichage(chk.dataset.option, chk.checked ? "oui" : "non");
    });
    page.addEventListener("click", function (e) {
      var b = e.target.closest(".choix-pastille");
      if (b) { changerOptionAffichage(b.dataset.option, b.dataset.valeur); return; }
      if (e.target.closest("#btnAffichageDefaut")) retablirAffichage();
    });
    // Flèches dans un groupe de pastilles (comme des boutons radio).
    page.addEventListener("keydown", function (e) {
      var b = e.target.closest(".choix-pastille");
      if (!b || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      var freres = [].slice.call(b.parentNode.querySelectorAll(".choix-pastille"));
      var i = freres.indexOf(b) + (e.key === "ArrowRight" ? 1 : -1);
      if (i < 0 || i >= freres.length) return;
      e.preventDefault(); e.stopPropagation();
      changerOptionAffichage(freres[i].dataset.option, freres[i].dataset.valeur);
      freres[i].focus();
    });
    // Passage téléphone <-> écran large (rotation) : colonnes de l'aperçu.
    var mq = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 600px)") : null;
    if (mq && mq.addEventListener) mq.addEventListener("change", majPageAffichage);
    majPageAffichage();
  }
