"use strict";
  /* ============================================================
     CHARGEMENT DEPUIS SUPABASE (phase 4, étape 2 du §6bis)
     ------------------------------------------------------------
     Remplace apiDemarrer()/apiChargerSemaine() (WebApp.gs) : le nouveau
     schéma (sql/0001_schema.sql) n'a plus de notion de "semaine" côté
     serveur — taches/assignations/jalons/notes sont juste des lignes avec
     une vraie date. `labG` redevient donc une coordonnée PUREMENT CLIENTE
     (jamais envoyée ni reçue du serveur) : l'entier YYYYMMDD du LUNDI de la
     semaine, qui sert uniquement de clé au cache existant
     (etat.cache/mettreEnCache, cf. plus haut) — exactement le même rôle
     qu'avant, juste calculé au lieu de venir de la colonne label du
     classeur.

     Trois familles de fonctions ci-dessous :
     - des fonctions de dates PURES (numeroSemaineIsoUTC, genererSemaines,
       infosSemaineDepuisLabG...) — jamais d'appel réseau, testées dans
       test_chargement.js ;
     - construireDonneesSemaine(labG, brut, lookups), pure elle aussi : prend
       des lignes Supabase déjà récupérées (tableaux d'objets bruts) et les
       remet exactement dans la forme que chargerSemaine_ (WebApp.gs)
       renvoyait — c'est CE contrat que construireVueDepuisCache() (plus
       bas, INCHANGÉE) consomme, jamais modifié ici ;
     - chargerSemaineDepuisServeur(labG), la seule des trois à parler au
       réseau (sbClient.from(...)) : un mince emballage autour des deux
       précédentes.
     ============================================================ */

  // Fenêtre de semaines générée au bootstrap, très large (~5 ans de chaque
  // côté d'aujourd'hui) — pure arithmétique de dates, sans coût serveur
  // (rien n'est chargé avant assurerFenetreChargee), qui rend en pratique
  // inatteignables les messages "Déjà la première/dernière semaine du
  // planning" (naviguerSemaine) : il n'y a plus de notion de planning qui
  // "s'arrête" quelque part, contrairement au classeur (SEMAINES_AVANCE).
  var FENETRE_SEMAINES = 260;

  function pad2_(n) { return (n < 10 ? "0" : "") + n; }
  // Parse strict "YYYY-MM-DD" -> Date UTC (minuit UTC) — même convention que
  // functions/*/logic.js (dateUTC), reprise ici pour que toute l'arithmétique
  // de semaines du client suive la même règle que le backend : jamais de
  // Date en heure locale (cf. new Date(y,m,d) qui dépendrait du fuseau du
  // navigateur, piège classique autour de minuit).
  function dateUTCDepuisIso_(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) throw new Error("Date invalide : " + iso);
    var d = new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)));
    if (isNaN(d.getTime())) throw new Error("Date invalide : " + iso);
    return d;
  }
  function isoDepuisDateUTC_(d) { return d.toISOString().slice(0, 10); }
  function ajouterJoursUTC_(d, n) { var r = new Date(d.getTime()); r.setUTCDate(r.getUTCDate() + n); return r; }
  // labG <-> iso du lundi qu'il désigne — pure reformulation, aucun calcul
  // de calendrier ici (cf. lundiDeSemaineUTC pour "quel est le lundi de la
  // semaine contenant telle date").
  function labGVersIso_(labG) { var s = String(labG); return s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8); }
  function isoVersLabG(iso) { return parseInt(String(iso).replace(/-/g, ""), 10); }

  // Port UTC de numeroSemaineIso_ (WebApp.gs) — même formule ("jeudi de la
  // même semaine ISO"), seule la base horaire change (UTC au lieu
  // d'heure locale, cf. dateUTCDepuisIso_ ci-dessus). Le "jeudi" est ce qui
  // fait fonctionner la règle même à cheval sur une année (le n° de semaine
  // ISO d'un lundi 30 décembre peut être "1" de l'année suivante, cf.
  // test_chargement.js) : le jeudi de cette semaine-là tombe bien en janvier.
  function numeroSemaineIsoUTC(dateIso) {
    var d = dateUTCDepuisIso_(dateIso);
    var jeudi = ajouterJoursUTC_(d, 3 - ((d.getUTCDay() + 6) % 7));
    var j4 = new Date(Date.UTC(jeudi.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((jeudi.getTime() - j4.getTime()) / 86400000 - 3 + ((j4.getUTCDay() + 6) % 7)) / 7);
  }
  // Lundi (iso) de la semaine ISO contenant dateIso — port UTC de lundiDe_.
  function lundiDeSemaineUTC(dateIso) {
    var d = dateUTCDepuisIso_(dateIso);
    return isoDepuisDateUTC_(ajouterJoursUTC_(d, -((d.getUTCDay() + 6) % 7)));
  }

  // Génère etat.semaines : une entrée par semaine (lundi ancré), de
  // `semainesAvant` semaines avant la semaine d'aujourd'hui à `semainesApres`
  // après, dans l'ordre chronologique. Remplace entièrement le mécanisme de
  // "création automatique des semaines manquantes" (assurerSemainesAvance_,
  // WebApp.gs) : plus rien à "créer" à l'avance, une date est une date, que
  // des lignes existent déjà dessus ou non.
  function genererSemaines(aujourdhuiIso, semainesAvant, semainesApres) {
    var lundiAuj = dateUTCDepuisIso_(lundiDeSemaineUTC(aujourdhuiIso));
    var out = [];
    for (var i = -semainesAvant; i <= semainesApres; i++) {
      var lundi = ajouterJoursUTC_(lundiAuj, i * 7);
      var lundiIso = isoDepuisDateUTC_(lundi);
      // fin = DIMANCHE (pas vendredi) : même bornage que l'ancien
      // listerSemainesPlanning (WebApp.gs), qui prenait la dernière date
      // trouvée sur la ligne 3 en balayant jusqu'à la colonne week-end
      // dimanche incluse — c'est ce bornage que indexSemaineAujourdhui_
      // (plus bas, INCHANGÉE) utilise pour "la semaine contenant aujourd'hui"
      // : un samedi/dimanche doit rester rattaché à SA semaine, pas basculer
      // sur la suivante.
      var dimancheIso = isoDepuisDateUTC_(ajouterJoursUTC_(lundi, 6));
      out.push({ labG: isoVersLabG(lundiIso), num: String(numeroSemaineIsoUTC(lundiIso)), debut: lundiIso, fin: dimancheIso });
    }
    return out;
  }

  // Abréviations françaises de mois pour l'affichage des dates de la grille
  // — copiées telles quelles de WebApp.gs (MOIS_ABBR_WEB).
  var MOIS_ABBR_WEB = ["", "jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

  // Couleurs proposées pour un nouveau chantier — copiées telles quelles de
  // Planning_Format.gs (CHANTIER_PALETTE) : palette choisie pour rester
  // lisible à l'impression (cf. commentaire d'origine dans Planning_Format.gs),
  // reprise sans y toucher. etat.palette (demarrer()) s'en sert directement ;
  // couleurProposeeChantier() (page "Chantiers", pas encore portée) choisira
  // la 1ère couleur pas encore utilisée dedans, exactement comme avant.
  var CHANTIER_PALETTE = [
    '#adcbef', '#f8c8b5', '#aee3d0', '#fae5ba', '#f5c4d6', '#bcdebc', '#b8b2dd', '#f5c0c0',
    '#81afe7', '#f4ab8e', '#7bd1b2', '#f7d691', '#efa3c0', '#95cb95', '#938acb', '#f1a1a0',
    '#5493de', '#f08e67', '#3aba8c', '#f4c45f'
  ];

  // Toutes les dates dérivées d'un labG : les 5 jours ouvrés (affichage +
  // clé de regroupement) et les 2 jours de week-end — pure, réutilisée à la
  // fois pour construire la plage de la requête Supabase (chargerSemaineDepuisServeur)
  // et pour peupler dates/mois/isoDates/weekendDates du contrat de sortie
  // (construireDonneesSemaine).
  function infosSemaineDepuisLabG(labG) {
    var lundiIso = labGVersIso_(labG);
    var lundi = dateUTCDepuisIso_(lundiIso);
    var dates = [], mois = [], isoDates = [];
    for (var j = 0; j < 5; j++) {
      var d = ajouterJoursUTC_(lundi, j);
      dates.push(pad2_(d.getUTCDate()));
      mois.push(MOIS_ABBR_WEB[d.getUTCMonth() + 1]);
      isoDates.push(isoDepuisDateUTC_(d));
    }
    var weekendDates = [isoDepuisDateUTC_(ajouterJoursUTC_(lundi, 5)), isoDepuisDateUTC_(ajouterJoursUTC_(lundi, 6))];
    return { debut: lundiIso, fin: weekendDates[1], dates: dates, mois: mois, isoDates: isoDates, weekendDates: weekendDates };
  }

  // Remet en forme des lignes Supabase déjà récupérées (taches/assignations/
  // jalons/notes de la semaine, personnes déjà chargées une fois au
  // bootstrap) dans EXACTEMENT la forme que chargerSemaine_ (WebApp.gs)
  // renvoyait — c'est ce contrat que construireVueDepuisCache() consomme,
  // inchangé, plus bas dans ce fichier.
  //
  // brut = { personnes, taches, assignations, jalons, notes } (tableaux
  // bruts, tels que renvoyés par sbClient.from(...).select(...)).
  // lookups = { chantiersParId, statutsParId } (cf. etat, remplis par
  // demarrer()).
  //
  // Décision de portage (cf. §8 du plan, "deux chantiers sur une même
  // demi-journée") : le nouveau schéma autorise plusieurs lignes
  // `assignations` pour la même (personne, date, demi), l'UI actuelle
  // (comme l'ancien classeur) n'en affiche qu'une par case — on garde donc
  // la PREMIÈRE par id croissant et on ignore les suivantes. Même règle
  // pour un éventuel jalon en double sur une même date (ne devrait pas
  // arriver en pratique, aucune contrainte unique en base). Pour l'ordre
  // des tâches et des notes dans une case (avant : ordre des lignes de
  // texte dans la cellule), ordre.taches existe en base (colonne `ordre`,
  // triée ici) ; jalons/notes n'ont pas de colonne d'ordre dédiée — l'id
  // croissant (ordre d'insertion) en tient lieu, repli raisonnable en
  // l'absence d'un besoin exprimé de réordonner des notes à la main.
  function construireDonneesSemaine(labG, brut, lookups) {
    var infos = infosSemaineDepuisLabG(labG);
    var chantiersParId = (lookups && lookups.chantiersParId) || {};
    var statutsParId = (lookups && lookups.statutsParId) || {};

    function cle_(personneId, demi, date) { return personneId + "|" + demi + "|" + date; }

    var assignationParCle = {};
    (brut.assignations || []).slice().sort(function (a, b) { return a.id - b.id; }).forEach(function (a) {
      var k = cle_(a.personne_id, a.demi, a.date);
      if (!assignationParCle[k]) assignationParCle[k] = a; // 1ère par id, cf. commentaire ci-dessus
    });

    var tachesParCle = {};
    (brut.taches || []).slice().sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); }).forEach(function (t) {
      var k = cle_(t.personne_id, t.demi, t.date);
      (tachesParCle[k] = tachesParCle[k] || []).push(t);
    });

    var jalonParDate = {};
    (brut.jalons || []).slice().sort(function (a, b) { return a.id - b.id; }).forEach(function (j) {
      if (!jalonParDate[j.date]) jalonParDate[j.date] = j;
    });

    var notesParDate = {};
    (brut.notes || []).slice().sort(function (a, b) { return a.id - b.id; }).forEach(function (n) {
      (notesParDate[n.date] = notesParDate[n.date] || []).push(n);
    });

    function tacheVue_(t) {
      return {
        texte: t.texte,
        statut: t.statut_id != null ? (statutsParId[t.statut_id] || null) : null,
        important: !!t.important,
        serieId: t.serie_id || null,
        // chantier (round du 16.09.2026, sql/0010_taches_chantier_id.sql —
        // Lionel : "plusieurs chantier sur la même case ... actuellement si
        // une tâche est affecté à un chantier, la tâche déjà en place change
        // de chantier") : AVANT ce round, le chantier était un attribut de LA
        // CASE (via `assignations`, cf. celluleVue_ ci-dessous), partagé de
        // force par toutes les tâches empilées dessus — poser un chantier sur
        // une nouvelle tâche recolorait donc TOUTES les autres. `chantier_id`
        // est désormais une vraie colonne de `taches` (comme statut_id) :
        // chaque tâche porte son propre chantier, indépendamment des autres
        // tâches de la même case.
        chantier: t.chantier_id != null ? (chantiersParId[t.chantier_id] || null) : null,
        // Round du 14.09.2026 (bug signalé par Lionel, vidéo à l'appui : « une
        // absence sur plusieurs jours est attribuée à un chantier et prend la
        // couleur grise ») : `taches` gagne une vraie colonne est_absence
        // (sql/0009_taches_est_absence.sql) — avant ce round, RIEN ne
        // distinguait une absence d'une tâche côté serveur (aucune colonne
        // `type`, cf. commentaire de creerSerieServeur plus bas) : le client
        // décidait seul, à CHAQUE reconstruction depuis le cache
        // (construireVueDepuisCache), en appliquant estAbsence() au texte —
        // "Congé"/"Vacances"/tout texte contenant "absent" passait, mais une
        // absence au descriptif libre ("test", un motif personnalisé...)
        // repassait "tâche" dès la synchronisation suivante (synchroniser()
        // recharge systématiquement depuis le serveur après écriture, cf.
        // plus bas) — d'où le passage au gris (repli "chantier introuvable",
        // bulleEl) puis, en rouvrant la fiche, un chantier par défaut
        // proposé/enregistré comme pour une vraie tâche. absence ci-dessous
        // est désormais la source de vérité ; estAbsence(texte) ne reste
        // qu'un FILET DE SÉCURITÉ (OR, cf. construireVueDepuisCache) pour les
        // lignes écrites avant ce round et non couvertes par le backfill SQL.
        absence: !!t.est_absence
      };
    }
    // Une case = une liste de tâches (via taches, chacune avec son PROPRE
    // chantier désormais, cf. tacheVue_ ci-dessus), indexée par
    // (personne, demi, date). `chantier` au niveau de la case redevient un
    // simple REPLI : `assignations` (round du 16.09.2026 — plus jamais écrite
    // par aucun chemin du code, cf. sql/0010_taches_chantier_id.sql) ne peut
    // plus, en pratique, décrire qu'une case sans aucune tâche ; gardé
    // uniquement pour lire d'éventuelles vieilles lignes orphelines encore en
    // base (jamais produites par l'UI actuelle : champChantierHTML n'offre
    // jamais une case vide).
    function celluleVue_(personneId, demi, date) {
      var a = assignationParCle[cle_(personneId, demi, date)];
      var taches = (tachesParCle[cle_(personneId, demi, date)] || []).map(tacheVue_);
      return { chantier: (!taches.length && a) ? (chantiersParId[a.chantier_id] || null) : null, taches: taches };
    }

    var jalons = infos.isoDates.map(function (iso) {
      var j = jalonParDate[iso];
      // demi (round du 08.09.2026, suite — sql/0006_jalons_demi.sql) : un
      // jalon porte désormais lui aussi sa propre demi-journée, exactement
      // comme une note (cf. n.demi juste en dessous).
      return { texte: j ? j.texte : "", serieId: j ? (j.serie_id || null) : null, demi: j ? (j.demi || null) : null };
    });
    var notes = infos.isoDates.map(function (iso) {
      return (notesParDate[iso] || []).map(function (n) {
        return { texte: n.texte, important: !!n.important, serieId: n.serie_id || null, demi: n.demi || null };
      });
    });

    var personnes = (brut.personnes || []).map(function (p) {
      var matin = [], aprem = [];
      for (var j = 0; j < 5; j++) {
        matin.push(celluleVue_(p.id, "matin", infos.isoDates[j]));
        aprem.push(celluleVue_(p.id, "aprem", infos.isoDates[j]));
      }
      // Week-end : toujours demi="matin" (cf. construireVueDepuisCache plus
      // bas, qui pose systématiquement ces 2 cases avec demi:"matin" — seule
      // ligne interactive côté client pour le week-end). weekendDates[0]/[1]
      // = Samedi/Dimanche.
      return {
        ancre: p.id, nom: p.nom, sousTraitant: !!p.sous_traitant,
        matin: matin, aprem: aprem,
        weekend: [celluleVue_(p.id, "matin", infos.weekendDates[0]), celluleVue_(p.id, "matin", infos.weekendDates[1])]
      };
    });

    return {
      labG: labG, numero: String(numeroSemaineIsoUTC(infos.debut)),
      dates: infos.dates, mois: infos.mois, isoDates: infos.isoDates, weekendDates: infos.weekendDates,
      jalons: jalons, notes: notes, personnes: personnes
    };
  }

  // Seule fonction de cette section à parler au réseau : requête les 4
  // tables sur la plage Monday..Sunday du labG donné, filtrées aux personnes
  // actives connues (etat.personnesActives, chargées une fois par
  // demarrer()), puis délègue toute la remise en forme à
  // construireDonneesSemaine ci-dessus. `.in("personne_id", [])` est évité
  // explicitement (tableau vide) : un planning sans personne active ne doit
  // pas déclencher une requête malformée, juste renvoyer des cases vides.
  function chargerSemaineDepuisServeur(labG) {
    var infos = infosSemaineDepuisLabG(labG);
    var idsPersonnes = (etat.personnesActives || []).map(function (p) { return p.id; });
    var qTaches = idsPersonnes.length
      ? sbClient.from("taches").select("*").gte("date", infos.debut).lte("date", infos.fin).in("personne_id", idsPersonnes)
      : Promise.resolve({ data: [], error: null });
    var qAssignations = idsPersonnes.length
      ? sbClient.from("assignations").select("*").gte("date", infos.debut).lte("date", infos.fin).in("personne_id", idsPersonnes)
      : Promise.resolve({ data: [], error: null });
    var qJalons = sbClient.from("jalons").select("*").gte("date", infos.debut).lte("date", infos.fin);
    var qNotes = sbClient.from("notes").select("*").gte("date", infos.debut).lte("date", infos.fin);
    return Promise.all([qTaches, qAssignations, qJalons, qNotes]).then(function (r) {
      r.forEach(function (res) { if (res.error) throw res.error; });
      return construireDonneesSemaine(labG, {
        personnes: etat.personnesActives,
        taches: r[0].data || [],
        assignations: r[1].data || [],
        jalons: r[2].data || [],
        notes: r[3].data || []
      }, { chantiersParId: etat.chantiersParId, statutsParId: etat.statutsParId });
    });
  }

  /* ============ DÉMARRAGE ============ */
  // Remplace apiDemarrer() (WebApp.gs) : plus un seul aller-retour serveur
  // mais 4 petites requêtes Supabase en parallèle (personnes/chantiers/
  // statuts/fériés — les données "de référence", indépendantes de la
  // semaine affichée) suivies d'un premier chargement de semaine
  // (chargerSemaineDepuisServeur), au lieu d'un unique apiDemarrer() qui
  // renvoyait tout d'un bloc. Pas d'équivalent à `creation`/annoncerCreation
  // (WebApp.gs) : il n'y a plus de semaines à "créer" à l'avance (cf.
  // genererSemaines ci-dessus), ce concept disparaît avec le classeur.
  function demarrer() {
    afficherChargement();
    etat.aujourdhui = new Date().toISOString().slice(0, 10); // date du jour, UTC — même convention que le reste du chargement

    Promise.all([
      sbClient.from("personnes").select("id, nom, sous_traitant, ordre").eq("actif", true).order("ordre", { ascending: true }),
      // actif/ordre (sql/0008) : la requête reste volontairement SANS
      // .eq("actif", true) — contrairement à celle des personnes juste
      // au-dessus — pour que chantiersParId (juste en dessous) reste
      // complet, cf. commentaire de listerChantiersDepuisServeur plus bas.
      sbClient.from("chantiers").select("id, nom, couleur, actif, ordre").order("ordre", { ascending: true }),
      sbClient.from("statuts").select("id, cle, nom, couleur, ordre"),
      sbClient.from("feries").select("date, libelle, categorie"),
      // À part des 4 précédentes (cf. juste en dessous) : la table
      // `categories_feries` n'existe que depuis la migration 0005 (étape 3
      // du §6bis) — tant que Lionel ne l'a pas encore collée dans l'Éditeur
      // SQL, cette requête échoue seule ("relation does not exist"), sans
      // empêcher le reste de l'appli de démarrer (cf. plus bas).
      sbClient.from("categories_feries").select("id, nom, couleur"),
      // Round du 24.09.2026 — Lionel : « Les couleurs devrait être les
      // mêmes sur tous les appareils du même compte. Comme les chantiers. »
      // `couleurs_perso` (sql, table créée directement via l'outil Supabase
      // de cette session, pas d'étape manuelle pour Lionel cette fois)
      // remplace le localStorage "planning.couleurs" comme SOURCE DE
      // VÉRITÉ — cf. js/page-couleurs.js. Non-bloquante comme
      // categories_feries juste au-dessus, pour la même raison (ne jamais
      // empêcher le reste de l'appli de démarrer si cette table a un souci).
      sbClient.from("couleurs_perso").select("id, clair, sombre")
    ]).then(function (r) {
      r.slice(0, 4).forEach(function (res) { if (res.error) throw res.error; }); // ces 4-là restent bloquantes, comme avant
      var personnesBrutes = r[0].data || [], chantiersBruts = r[1].data || [], statutsBruts = r[2].data || [], feriesBruts = r[3].data || [];
      var categoriesFeriesBrutes = (r[4] && !r[4].error) ? (r[4].data || []) : [];
      var couleursPersoBrutes = (r[5] && !r[5].error) ? (r[5].data || []) : null; // null = requête en échec, cf. plus bas (page-couleurs.js retombe alors sur le cache local)

      etat.personnesActives = personnesBrutes;

      etat.chantiersParId = {};
      chantiersBruts.forEach(function (c) { etat.chantiersParId[c.id] = c.nom; });
      etat.statutsParId = {};
      statutsBruts.forEach(function (s) { etat.statutsParId[s.id] = s.cle; });
      // Sens inverse (étape 4 du §6bis) : gerer-serie/enregistrer-serie
      // attendent un statutId, alors que la vue ne connaît le statut que par
      // sa clé (STATUTS[cle]) — nécessaire pour traduire avant l'appel.
      etat.statutIdParCle = {};
      statutsBruts.forEach(function (s) { etat.statutIdParCle[s.cle] = s.id; });

      // .ligne = chantiers.id (Supabase) — identité utilisée par la page de
      // config "Chantiers" (CRUD direct, cf. section "CONFIG SIMPLE" plus
      // bas, étape 3 du §6bis).
      etat.chantiers = chantiersBruts.map(function (c) { return { nom: c.nom, couleur: c.couleur, ligne: c.id, actif: c.actif !== false, ordre: c.ordre || 0 }; });
      etat.chantierParNom = {};
      etat.chantiers.forEach(function (c) { etat.chantierParNom[c.nom] = c; });
      etat.palette = CHANTIER_PALETTE.slice();
      etat.statutsServeur = statutsBruts.map(function (s) { return { cle: s.cle, nom: s.nom, couleur: s.couleur, ordre: s.ordre }; });
      etat.feriesServeur = feriesBruts.map(function (f) { return { iso: f.date, libelle: f.libelle, categorie: f.categorie }; });
      // [] si la table est absente ou vide : catsFeries() (plus bas) retombe
      // alors sur CATEGORIES_FERIES_DEFAUT — jamais bloquant, cf. le
      // commentaire de la requête ci-dessus.
      etat.categoriesFeriesServeur = categoriesFeriesBrutes.map(function (c) { return { id: c.id, nom: c.nom, couleur: c.couleur }; });
      reconstruireFeriesParIso();

      // etat.couleursPerso : null tant que le serveur n'a pas répondu (page-
      // couleurs.js retombe alors sur son cache localStorage, cf. son
      // commentaire) — objet (même vide) une fois la réponse reçue, pour
      // que ce dernier devienne la SOURCE DE VÉRITÉ (comme etat.chantiers)
      // dès que possible, y compris si la table est vide (aucune couleur
      // encore choisie sur aucun appareil : {} est le bon résultat, pas
      // "pas encore su").
      if (couleursPersoBrutes) {
        etat.couleursPerso = {};
        couleursPersoBrutes.forEach(function (c) { etat.couleursPerso[c.id] = { clair: c.clair || null, sombre: c.sombre || null }; });
        if (typeof appliquerCouleursPersonnalisees === "function") appliquerCouleursPersonnalisees();
      }

      etat.cache = {}; etat.cacheTs = {};
      etat.semaines = genererSemaines(etat.aujourdhui, FENETRE_SEMAINES, FENETRE_SEMAINES);
      etat.indexSemaine = indexSemaineAujourdhui_(); // réutilise la règle existante (semaine du jour, sinon prochaine, sinon dernière)

      // Toute la fenêtre d'affichage (fenetreLabGs), et plus seulement la
      // semaine du jour : la vue "1 jour" téléphone, par défaut à
      // l'ouverture, en charge 2 (round du 24.09.2026, suite 6, cf. core.js).
      return Promise.all(fenetreLabGs().map(function (lg) { return chargerSemaineDepuisServeur(lg); }));
    }).then(function (donnees) {
      donnees.forEach(function (data) { mettreEnCache(data); });
      appliquerStatutsEtFormulaires();
      idc = 1;
      // Coquille de navigation (sidebar + 9 pages) : construite une seule
      // fois ici, APRÈS un premier chargement réussi — #racine n'existe
      // qu'à partir de maintenant, d'où le re-fetch juste après (racineEl
      // était resté null, cf. sa déclaration).
      construireCoquille();
      racineEl = document.getElementById("racine");
      construireVueDepuisCache();
      construireSelectChantier();
      render();
      // Planning déjà affiché à ce stade : le reste (formulaires rapides,
      // cf. chargerFormulairesRapides) se charge maintenant en arrière-plan,
      // sans bloquer davantage l'écran de chargement.
      chargerFormulairesRapides();
    }).catch(erreurFatale);
  }

  function appliquerStatutsEtFormulaires() {
    STATUTS = {}; STATUTS_ORDRE = [];
    etat.statutsServeur.slice().sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); }).forEach(function (s) {
      STATUTS[s.cle] = { nom: s.nom, couleur: s.couleur };
      STATUTS_ORDRE.push(s.cle);
    });
    // Bug corrigé le 03.09.2026 (retour de Lionel : "menu ajout rapide a des
    // absences en double") : ce .map() ne gardait que {nom, champs} et
    // perdait donc `typeEntree`/`assigneA` — pourtant bien renvoyés par
    // apiListerFormulairesRapides (WebApp.gs) et lus un peu partout ailleurs
    // (formulaireVisiblePour, ouvrirFormulaireDynamique, la page "Formulaires").
    // Conséquence concrète dans le menu "Ajouter" (boutonsMenuAjout) :
    // `f.typeEntree` valant toujours undefined, `aDesAbsencesConfigurees`
    // n'était jamais vrai -> les boutons "Congé"/"Vacances" historiques
    // (repli codé en dur) continuaient de s'afficher MÊME après que Lionel
    // ait configuré ses propres absences dans les formulaires rapides,
    // à côté du bouton fraîchement configuré portant le même nom : d'où le
    // doublon. Deuxième conséquence, plus grave quoique invisible depuis le
    // menu : un formulaire rapide configuré en type "Absence" (avec ou sans
    // champ) était malgré tout enregistré comme une TÂCHE (ajoutRapide/
    // ouvrirFormulaireDynamique retombent sur "tache" par défaut quand
    // typeEntree est absent).
    FORMULAIRES_RAPIDES = etat.formulairesRapidesServeur.slice().sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); })
      .map(function (f) { return { nom: f.nom, champs: f.champs || [], typeEntree: f.typeEntree, assigneA: f.assigneA || "" }; });
  }

  // PERFORMANCE (round audit, 02.09.2026 — retour de Lionel : "les temps de
  // chargement me semble long") : apiDemarrer() ne renvoie plus
  // formulairesRapides (cf. WebApp.gs, commentaire sur apiDemarrer) — cette
  // donnée ne sert que dans le menu "Ajouter" d'un intervenant et la page
  // "Entrée rapide", jamais pour afficher le planning lui-même. Chargée à
  // part ici, en ARRIÈRE-PLAN : démarrée juste après le premier rendu du
  // planning (cf. demarrer() plus bas — l'écran de chargement est déjà
  // fermé à ce moment-là, l'appel ne bloque plus rien), et de nouveau,
  // sans effet si déjà chargé/en cours (mémorisé dans promesseFormulairesRapides),
  // à l'ouverture du menu "Ajouter" d'un intervenant ou de la page "Entrée
  // rapide" — au cas rare où l'un des deux serait ouvert avant que le
  // chargement d'arrière-plan soit terminé.
  var formulairesRapidesCharges = false;
  var promesseFormulairesRapides = null;
  function chargerFormulairesRapides() {
    if (formulairesRapidesCharges || promesseFormulairesRapides) return promesseFormulairesRapides;
    promesseFormulairesRapides = listerFormulairesRapidesDepuisServeur().then(function (r) {
      etat.formulairesRapidesServeur = r || [];
      formulairesRapidesCharges = true;
      appliquerStatutsEtFormulaires();
      renderFormulaires(); // no-op si la page "Entrée rapide" n'est pas construite (zone introuvable)
    }).catch(function () {
      promesseFormulairesRapides = null; // échec : retenté au prochain appel (menu "Ajouter" ou page "Entrée rapide")
    });
    return promesseFormulairesRapides;
  }

  /* ============================================================
     CONFIG SIMPLE — LECTURE/ÉCRITURE DIRECTE DES TABLES (phase 4, étape 3
     du §6bis). Remplace les 14 apiXxx "mécaniques" de WebApp.gs
     (apiAjouterPersonne/apiRenommerPersonne/apiSupprimerPersonne/
     apiCompterTachesPersonnes, apiEnregistrerChantiers/apiRenommerChantier/
     apiCompterUtilisationsChantier/apiSupprimerChantier,
     apiEnregistrerStatuts, apiListerFormulairesRapides/
     apiEnregistrerFormulaireRapide/apiSupprimerFormulaireRapide,
     apiEnregistrerFeriesV3/apiEnregistrerCategoriesFeries) par de simples
     appels sbClient.from(...) — aucune de ces opérations n'a besoin d'une
     Edge Function (§5 du plan), toutes vivent déjà entièrement côté client
     une fois RLS + GRANT en place (sql/0002_rls.sql, sql/0004).

     Portage volontairement PAS littéral : la plupart des paramètres
     "labG"/"portée" de l'ancien contrat n'ont plus de sens une fois qu'une
     personne/un chantier est une vraie ligne de table, identifiée par un
     vrai id, au lieu d'une position de cellule partagée par toutes les
     semaines. Détail des déviations dans FRONTEND-CHANGELOG.md (étape 3).
     ============================================================ */

  // ---- PERSONNEL / INTERVENANTS --------------------------------------
  // labG n'est plus envoyé : une personne est une seule ligne `personnes`,
  // valable pour toutes les semaines passées et futures — il n'y a plus de
  // "semaine visée" à laquelle rattacher l'ajout/le renommage.
  function prochainOrdrePersonne_() {
    var max = 0;
    (etat.personnesActives || []).forEach(function (p) { if ((p.ordre || 0) > max) max = p.ordre; });
    return max + 1;
  }
  // Recharge etat.personnesActives depuis la table — même requête que
  // demarrer(), réutilisée après tout ajout/renommage/suppression pour que
  // chargerSemaineDepuisServeur (qui filtre `.in("personne_id", ...)` sur
  // cette liste) reste synchrone avec ce qui vient d'être écrit.
  function rechargerPersonnesActives_() {
    return sbClient.from("personnes").select("id, nom, sous_traitant, ordre").eq("actif", true).order("ordre", { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        etat.personnesActives = res.data || [];
      });
  }
  function ajouterPersonneServeur(nom, sousTraitant) {
    return sbClient.from("personnes").insert({ nom: nom, sous_traitant: !!sousTraitant, ordre: prochainOrdrePersonne_() })
      .then(function (res) { if (res.error) throw res.error; });
  }
  // sousTraitant repris tel quel (jamais togglé depuis l'UI actuelle, cf.
  // ouvrirModifierPersonne) — simple mise à jour de la ligne, portée = "tout"
  // par construction : plus de distinction "cette semaine"/"et les
  // suivantes" (cf. commentaire de tête ci-dessus), la personne n'a qu'un nom.
  function renommerPersonneServeur(id, nom, sousTraitant) {
    return sbClient.from("personnes").update({ nom: nom, sous_traitant: !!sousTraitant }).eq("id", id)
      .then(function (res) { if (res.error) throw res.error; });
  }
  // Désactiver/réactiver (round du 14.09.2026 — auparavant, seule la
  // désactivation existait, sous le nom desactiverPersonneServeur, jamais
  // togglable en sens inverse) : simple update actif, jamais un DELETE — la
  // personne et son historique (taches/assignations déjà écrites, passées
  // comme futures) restent en base, seulement invisibles ailleurs tant
  // qu'elle est désactivée (etat.personnesActives ne la contient plus, donc
  // plus aucune requête de semaine ne la ramène — même principe que l'ancien
  // classeur, "la feuille ne supprime jamais une ligne, seulement son
  // contenu", cf. WebApp.gs). Pour un vrai DELETE (irréversible, cascade sur
  // taches/assignations/series, cf. sql/0001 "on delete cascade"), voir
  // supprimerPersonnePermanenceServeur ci-dessous — jamais confondu avec
  // celle-ci.
  function basculerActifPersonneServeur(id, actif) {
    return sbClient.from("personnes").update({ actif: !!actif }).eq("id", id)
      .then(function (res) { if (res.error) throw res.error; });
  }
  // Vraie suppression (round du 14.09.2026, Lionel : « possibilité de
  // supprimer des éléments car certains chantier ou ouvriers peuvent ne plus
  // revenir ») — CASCADE en base sur taches/assignations/series (sql/0001 :
  // "on delete cascade" sur les 3 FK vers personnes) : contrairement à
  // basculerActifPersonneServeur, ceci efface bel et bien tout l'historique
  // de la personne, sans retour possible. Jamais proposée que sur une ligne
  // déjà désactivée (cf. cablerListePersonnes, ".lien-supprimer-def"),
  // toujours après confirmation explicite côté UI.
  function supprimerPersonnePermanenceServeur(id) {
    return sbClient.from("personnes").delete().eq("id", id)
      .then(function (res) { if (res.error) throw res.error; });
  }
  // Page de gestion (Personnel/Intervenants, cf. renderListePersonnes) :
  // liste COMPLÈTE (actifs + désactivés), triée par ordre — contrairement à
  // rechargerPersonnesActives_ ci-dessus, qui reste actifs seulement (la
  // grille elle-même ne doit jamais montrer une personne désactivée,
  // historique compris — comportement préexistant, inchangé).
  function listerPersonnesGestionServeur() {
    return sbClient.from("personnes").select("id, nom, sous_traitant, actif, ordre").order("ordre", { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        var liste = (res.data || []).map(function (p) {
          return { id: String(p.id), nom: p.nom, sousTraitant: !!p.sous_traitant, actif: p.actif !== false, ordre: p.ordre || 0 };
        });
        // Re-tri explicite côté client, en plus du .order() ci-dessus (qui
        // suffit déjà avec un vrai Supabase) : ceinture et bretelles, sans
        // coût réel sur une liste aussi courte.
        liste.sort(function (a, b) { return a.ordre - b.ordre; });
        return liste;
      });
  }

  // "Tâches en cours" par personne (cf. WebApp.gs, compterTachesParPersonne_
  // — point 101 de V3-spec-suite.md). Même règle de fusion que côté ancien
  // serveur ET que côté client (construireVueDepuisCache, section "tâches"
  // plus haut) : une même tâche reconduite sur des jours OUVRÉS consécutifs
  // (même texte/statut/important/chantier) ne compte qu'une fois — y compris
  // à cheval sur un week-end (vendredi -> lundi reste "consécutif") — sauf
  // le week-end lui-même, qui ne fusionne JAMAIS (case isolée, cf. §2 du
  // spec). "En cours" = depuis aujourd'hui inclus, jamais le passé — même
  // borne que l'ancien "depuis la semaine courante jusqu'à la fin de la
  // feuille". Logique de fusion factorisée en fonction pure (compterTachesParPersonne_
  // ci-dessous) pour être testée sans réseau, cf. test_config_simple.js.
  function estIsoWeekend_(iso) {
    var wd = new Date(iso + "T00:00:00Z").getUTCDay();
    return wd === 0 || wd === 6;
  }
  // Jour OUVRÉ suivant (saute samedi/dimanche) — sert uniquement à décider
  // si 2 lignes `taches` consécutives en base sont des jours "voisins" pour
  // la fusion ci-dessus ; n'a aucun rapport avec la navigation de semaines.
  function prochainJourOuvreIso_(iso) {
    var d = new Date(iso + "T00:00:00Z");
    do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    return d.toISOString().slice(0, 10);
  }
  // taches = lignes brutes déjà filtrées "depuisIso <= date" (cf.
  // compterTachesPersonnesServeur ci-dessous) ; renvoie {personne_id: nombre
  // de tâches "visuelles"}, même forme que l'ancien apiCompterTachesPersonnes.
  // Round du 16.09.2026 (sql/0010_taches_chantier_id.sql) : le chantier de
  // chaque ligne se lit directement sur t.chantier_id — plus besoin de
  // croiser avec `assignations` (paramètre disparu), qui n'est plus la
  // source de vérité du chantier d'une tâche.
  function compterTachesParPersonne_(taches, depuisIso) {
    var parGroupe = {};
    (taches || []).forEach(function (t) {
      if (t.date < depuisIso) return;
      var k = t.personne_id + "|" + t.demi;
      (parGroupe[k] = parGroupe[k] || []).push(t);
    });
    var out = {};
    Object.keys(parGroupe).forEach(function (k) {
      var personneId = k.slice(0, k.indexOf("|"));
      if (out[personneId] == null) out[personneId] = 0;
      var lignes = parGroupe[k].slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      var actif = null; // {jourSuivant, texte, important, statut_id, chantier} ou null
      lignes.forEach(function (t) {
        var weekend = estIsoWeekend_(t.date);
        var chantier = t.chantier_id || null;
        var suite = !weekend && actif && actif.jourSuivant === t.date && actif.texte === t.texte &&
          !!actif.important === !!t.important && (actif.statut_id || null) === (t.statut_id || null) && actif.chantier === chantier;
        if (!suite) out[personneId]++;
        actif = weekend ? null : { jourSuivant: prochainJourOuvreIso_(t.date), texte: t.texte, important: !!t.important, statut_id: t.statut_id || null, chantier: chantier };
      });
    });
    return out;
  }
  function compterTachesPersonnesServeur() {
    var idsPersonnes = (etat.personnesActives || []).map(function (p) { return p.id; });
    if (!idsPersonnes.length) return Promise.resolve({});
    var depuis = etat.aujourdhui;
    return sbClient.from("taches").select("personne_id, date, demi, texte, statut_id, important, chantier_id").in("personne_id", idsPersonnes).gte("date", depuis).then(function (res) {
      if (res.error) throw res.error;
      return compterTachesParPersonne_(res.data || [], depuis);
    });
  }

  // ---- CHANTIERS -------------------------------------------------------
  // Le nom sert de clé UNIQUE en base (sql/0001) mais n'est PLUS la clé de
  // rattachement des cases du planning (assignations.chantier_id, un vrai
  // id) : contrairement à l'ancien classeur (cf. WebApp.gs,
  // apiRenommerChantier), renommer un chantier ne touche plus aucune case —
  // c'est un simple update de la ligne `chantiers`, rien à migrer.
  // Round du 14.09.2026 (sql/0008_chantiers_actif_ordre.sql) : liste
  // COMPLÈTE (actifs + désactivés), triée par ordre — contrairement à
  // rechargerPersonnesActives_ (personnes), volontairement PAS filtrée sur
  // actif=true ici. Une personne désactivée disparaît de partout, historique
  // compris (comportement préexistant, cf. basculerActifPersonneServeur plus
  // bas) — un chantier désactivé, lui, doit rester résolvable pour les cases
  // déjà posées qui le référencent (CHANTIERS/etat.chantiersParId en ont
  // besoin, cf. construireVueDepuisCache/demarrer). Le filtrage "actifs
  // seulement" se fait donc au cas par cas, côté appelant, là où c'est
  // pertinent (légende, select "Chantier" des formulaires, page de gestion) —
  // jamais ici.
  function listerChantiersDepuisServeur() {
    return sbClient.from("chantiers").select("id, nom, couleur, actif, ordre").order("ordre", { ascending: true }).then(function (res) {
      if (res.error) throw res.error;
      var liste = (res.data || []).map(function (c) { return { nom: c.nom, couleur: c.couleur, ligne: c.id, actif: c.actif !== false, ordre: c.ordre || 0 }; });
      // Re-tri explicite côté client — cf. commentaire identique sur
      // listerPersonnesGestionServeur.
      liste.sort(function (a, b) { return a.ordre - b.ordre; });
      return liste;
    });
  }
  function resultatChantiers_() {
    return listerChantiersDepuisServeur().then(function (arr) { return { chantiers: arr }; });
  }
  // 23505 = violation de contrainte unique Postgres (chantiers.nom) —
  // message clair plutôt que le texte brut renvoyé par Postgres.
  function erreurNomChantierDuplique_(err, nom) {
    return (err && err.code === "23505") ? new Error("« " + nom + " » existe déjà.") : err;
  }
  // Même principe que prochainOrdrePersonne_ (section CONFIG SIMPLE plus
  // bas), mais calculé sur la liste COMPLÈTE (etat.chantiers n'est plus
  // filtrée aux actifs, cf. commentaire ci-dessus) : un nouveau chantier doit
  // s'ajouter après TOUS les chantiers déjà en base, désactivés compris.
  function prochainOrdreChantier_() {
    var max = 0;
    (etat.chantiers || []).forEach(function (c) { if ((c.ordre || 0) > max) max = c.ordre; });
    return max + 1;
  }
  function ajouterChantierServeur(nom, couleur) {
    return sbClient.from("chantiers").insert({ nom: nom, couleur: couleur, ordre: prochainOrdreChantier_() }).then(function (res) {
      if (res.error) throw erreurNomChantierDuplique_(res.error, nom);
      return resultatChantiers_();
    });
  }
  function majCouleurChantierServeur(id, couleur) {
    return sbClient.from("chantiers").update({ couleur: couleur }).eq("id", id).then(function (res) {
      if (res.error) throw res.error;
      return resultatChantiers_();
    });
  }
  function renommerChantierServeur(id, nouveauNom) {
    return sbClient.from("chantiers").update({ nom: nouveauNom }).eq("id", id).then(function (res) {
      if (res.error) throw erreurNomChantierDuplique_(res.error, nouveauNom);
      return resultatChantiers_();
    });
  }
  // Désactiver/réactiver (round du 14.09.2026) : un simple update actif,
  // JAMAIS un DELETE — cf. retirerChantierServeur plus bas pour la vraie
  // suppression (définitive, séparée). Contrairement à
  // basculerActifPersonneServeur, ne touche à rien d'autre : les cases déjà
  // posées sur ce chantier ne sont ni vidées ni modifiées, seule sa
  // disponibilité pour de NOUVELLES tâches/jalons change (cf. filtres
  // .actif côté appelants : champChantierHTML, champChantierJalonHTML,
  // construireLegende).
  function basculerActifChantierServeur(id, actif) {
    return sbClient.from("chantiers").update({ actif: !!actif }).eq("id", id).then(function (res) {
      if (res.error) throw res.error;
    });
  }
  // Compte TOUTES les utilisations de ce chantier, passées comprises —
  // déviation assumée par rapport à l'ancien compterUtilisationsChantier_
  // (semaine affichée + suivantes seulement) : la suppression doit de toute
  // façon vider TOUTES les lignes qui y renvoient, compter uniquement
  // l'avenir donnerait un chiffre plus petit que ce qui sera réellement
  // touché, trompeur pour la confirmation demandée à Lionel. Round du
  // 16.09.2026 (sql/0010_taches_chantier_id.sql) : `taches.chantier_id` est
  // désormais la vraie source de vérité (une par TÂCHE) — additionnée ici à
  // `assignations` (table historique, plus jamais écrite mais pouvant encore
  // contenir de vieilles lignes) pour ne rien sous-compter.
  function compterUtilisationsChantierServeur(id) {
    var qAssignations = sbClient.from("assignations").select("id", { count: "exact", head: true }).eq("chantier_id", id);
    var qTaches = sbClient.from("taches").select("id", { count: "exact", head: true }).eq("chantier_id", id);
    return Promise.all([qAssignations, qTaches]).then(function (r) {
      r.forEach(function (res) { if (res.error) throw res.error; });
      return (r[0].count || 0) + (r[1].count || 0);
    });
  }
  // Vide d'abord les cases qui l'utilisent (delete assignations — jamais les
  // tâches "détail" associées : le texte déjà tapé reste, comme avant, sans
  // chantier), puis DÉTACHE les jalons/séries qui le référencent (round du
  // 14.09.2026 : jalons.chantier_id/series.chantier_id sont apparus après
  // cette fonction — sql/0007 — en ON DELETE NO ACTION côté base, jamais mis
  // à jour ici jusqu'ici ; un chantier encore référencé par un jalon aurait
  // fait échouer le DELETE final avec une violation de contrainte. Mis à
  // null, jamais supprimés : un jalon garde son texte, simplement sans
  // couleur de chantier, comme un jalon qui n'en a jamais eu — cf. sql/0007),
  // puis retire la ligne chantiers. Toujours appelé après confirmation
  // explicite côté UI (cf. renderChantiers, ".lien-supprimer-def" —
  // uniquement proposé sur un chantier déjà désactivé), donc pas de
  // paramètre "forcer" à porter ici (contrairement à apiSupprimerChantier).
  // taches.chantier_id (round du 16.09.2026) n'a PAS besoin d'un DELETE/
  // UPDATE explicite ici : sa contrainte est `on delete set null`
  // (sql/0010_taches_chantier_id.sql) — Postgres met lui-même chaque tâche
  // concernée à chantier_id=null au moment du DELETE final sur `chantiers`,
  // exactement comme le fait déjà "à la main" ce code pour jalons/series
  // (dont la contrainte, elle, ne le fait pas automatiquement).
  function retirerChantierServeur(id) {
    return sbClient.from("assignations").delete().eq("chantier_id", id).then(function (res) {
      if (res.error) throw res.error;
      return sbClient.from("jalons").update({ chantier_id: null }).eq("chantier_id", id);
    }).then(function (res) {
      if (res.error) throw res.error;
      return sbClient.from("series").update({ chantier_id: null }).eq("chantier_id", id);
    }).then(function (res) {
      if (res.error) throw res.error;
      return sbClient.from("chantiers").delete().eq("id", id);
    }).then(function (res) {
      if (res.error) throw res.error;
      return resultatChantiers_();
    });
  }

  // ---- STATUTS -----------------------------------------------------------
  // `cle` est maintenant une vraie colonne persistée (sql/0001), stable
  // d'un enregistrement à l'autre — contrairement à l'ancien classeur où
  // elle était recalculée à la lecture depuis le nom (slugifierStatut_,
  // WebApp.gs) : renommer un statut ne change donc plus sa clé (bien pour
  // statutsParId, construit une seule fois au bootstrap et jamais invalidé
  // par un simple renommage, cf. demarrer()).
  function slugifierStatut_(nom) {
    var s = String(nom || "").trim().toLowerCase()
      .replace(/[àâä]/g, "a").replace(/[éèêë]/g, "e").replace(/[îï]/g, "i")
      .replace(/[ôö]/g, "o").replace(/[ùûü]/g, "u").replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "");
    return s || "statut";
  }
  // cle unique (sql/0001) : en cas de collision avec un statut déjà en
  // place (2 noms différents qui se slugifient pareil, ex. "Réservé"/
  // "Reserve"), suffixe numérique jusqu'à trouver une clé libre — pure,
  // testée (cf. test_config_simple.js).
  function genererCleStatut_(nom, clesExistantes) {
    var base = slugifierStatut_(nom), cle = base, n = 2;
    var vues = {}; (clesExistantes || []).forEach(function (c) { vues[c] = true; });
    while (vues[cle]) { cle = base + n; n++; }
    return cle;
  }
  function listerStatutsDepuisServeur() {
    return sbClient.from("statuts").select("id, cle, nom, couleur, ordre").then(function (res) {
      if (res.error) throw res.error;
      return (res.data || []).map(function (s) { return { cle: s.cle, nom: s.nom, couleur: s.couleur, ordre: s.ordre }; });
    });
  }
  // modifs:[{cle,nom,couleur,ordre}], nouveaux:[{nom,couleur,ordre}],
  // supprimes:[cle,...] — même signature que l'ancien apiEnregistrerStatuts,
  // 3 opérations en une seule fonction (WebApp.gs regroupait déjà ainsi,
  // "ajouter"/"modifier"/"supprimer" étant chacun un aller-retour rare).
  // Toujours modifs, PUIS supprimes, PUIS nouveaux (un appel ne mélange
  // jamais 2 catégories en pratique, cf. les 3 sites d'appel, mais l'ordre
  // est sans conséquence de toute façon).
  function enregistrerStatutsServeur(modifs, nouveaux, supprimes) {
    var chaine = Promise.all((modifs || []).map(function (m) {
      if (!m || !m.cle) return null;
      var maj = {};
      if (m.nom != null && String(m.nom).trim() !== "") maj.nom = String(m.nom).trim();
      if (m.couleur != null && estCouleurHexLocal_(m.couleur)) maj.couleur = m.couleur;
      if (m.ordre != null && !isNaN(Number(m.ordre))) maj.ordre = Number(m.ordre);
      if (!Object.keys(maj).length) return null;
      return sbClient.from("statuts").update(maj).eq("cle", m.cle).then(function (res) { if (res.error) throw res.error; });
    }));
    chaine = chaine.then(function () {
      if (!supprimes || !supprimes.length) return null;
      return sbClient.from("statuts").delete().in("cle", supprimes).then(function (res) { if (res.error) throw res.error; });
    });
    chaine = chaine.then(function () {
      var aAjouter = (nouveaux || []).filter(function (nv) { return nv && String(nv.nom || "").trim() !== ""; });
      if (!aAjouter.length) return null;
      return listerStatutsDepuisServeur().then(function (existants) {
        var clesVues = existants.map(function (s) { return s.cle; });
        var lignes = aAjouter.map(function (nv) {
          var cle = genererCleStatut_(nv.nom, clesVues);
          clesVues.push(cle);
          return { cle: cle, nom: String(nv.nom).trim(), couleur: estCouleurHexLocal_(nv.couleur) ? nv.couleur : "#e5e5e5", ordre: Number(nv.ordre) || (existants.length + 1) };
        });
        return sbClient.from("statuts").insert(lignes).then(function (res) { if (res.error) throw res.error; });
      });
    });
    return chaine.then(function () { return listerStatutsDepuisServeur(); });
  }
  function estCouleurHexLocal_(c) { return /^#[0-9a-fA-F]{6}$/.test(String(c || "")); }

  // ---- FORMULAIRES RAPIDES ------------------------------------------------
  // `nom` reste l'identité fonctionnelle côté UI (data-nom un peu partout
  // dans la page "Entrée rapide", cf. plus haut) — pas de vraie migration
  // vers l'id de `formulaires_rapides` dans ce round, périmètre volontairement
  // réduit à "faire marcher le CRUD existant sur les vraies tables" plutôt
  // qu'une refonte de l'identité côté UI. Le pattern "delete-then-append par
  // nom" de l'ancien classeur (cf. WebApp.gs, apiEnregistrerFormulaireRapide)
  // est donc repris tel quel : un enregistrement retire d'abord toute ligne
  // existante de ce nom, puis réinsère le formulaire et ses champs — c'est
  // d'ailleurs déjà ce que fait Index.html côté appelant pour un renommage
  // (apiSupprimerFormulaireRapide(ancienNom) puis
  // apiEnregistrerFormulaireRapide(nom, ...), cf. plus bas), inchangé ici.
  var TYPES_CHAMP_VALIDES_ = ["texte", "nombre", "select", "case"];
  function listerFormulairesRapidesDepuisServeur() {
    return sbClient.from("formulaires_rapides")
      .select("id, nom, ordre, assigne_a, type_entree, formulaires_rapides_champs(id, cle, label, type, options, ordre)")
      .then(function (res) {
        if (res.error) throw res.error;
        var lignes = (res.data || []).slice().sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); });
        return lignes.map(function (f) {
          var champs = (f.formulaires_rapides_champs || []).slice().sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); });
          return {
            nom: f.nom, ordre: f.ordre, assigneA: f.assigne_a || "", typeEntree: f.type_entree,
            champs: champs.map(function (c) { return { cle: c.cle, label: c.label, type: c.type, options: c.options || [] }; })
          };
        });
      });
  }
  function supprimerFormulaireRapideServeur(nom) {
    return sbClient.from("formulaires_rapides").delete().eq("nom", nom).then(function (res) {
      if (res.error) throw res.error;
      return listerFormulairesRapidesDepuisServeur();
    });
  }
  function enregistrerFormulaireRapideServeur(nom, ordre, champs, assigneA, typeEntree) {
    // 1) retire l'éventuelle ligne existante de ce nom (formulaires_rapides_champs
    //    suit par ON DELETE CASCADE, sql/0001) — même logique delete-then-append
    //    que l'ancien classeur, cf. commentaire de tête ci-dessus.
    return sbClient.from("formulaires_rapides").delete().eq("nom", nom).then(function (res) {
      if (res.error) throw res.error;
      return sbClient.from("formulaires_rapides")
        .insert({ nom: nom, ordre: Number(ordre) || 1, assigne_a: String(assigneA || "").trim(), type_entree: (typeEntree === "absence") ? "absence" : "tache" })
        .select("id").single();
    }).then(function (res) {
      if (res.error) throw res.error;
      var formulaireId = res.data.id;
      var lignesChamps = (champs || [])
        .filter(function (c) { return c && String(c.cle || "").trim() !== ""; })
        .map(function (c, i) {
          var type = TYPES_CHAMP_VALIDES_.indexOf(c.type) !== -1 ? c.type : "texte";
          var options = (type === "select" && Array.isArray(c.options) && c.options.length) ? c.options : null;
          return { formulaire_id: formulaireId, cle: String(c.cle).trim(), label: String(c.label || "").trim(), type: type, options: options, ordre: i + 1 };
        });
      // Contrairement à l'ancien classeur (une ligne "porteuse" nécessaire
      // pour survivre sans aucun champ, cf. WebApp.gs) : ici la ligne
      // formulaires_rapides ELLE-MÊME porte déjà nom/ordre/assigneA/typeEntree,
      // rien à ajouter dans formulaires_rapides_champs si la liste est vide.
      if (!lignesChamps.length) return null;
      return sbClient.from("formulaires_rapides_champs").insert(lignesChamps).then(function (res2) { if (res2.error) throw res2.error; });
    }).then(function () { return listerFormulairesRapidesDepuisServeur(); });
  }

  // ---- FÉRIÉS + CATÉGORIES ------------------------------------------------
  // `categorie` (table `feries`) stocke déjà l'id de catégorie ("ferie",
  // "vacances_entreprise", "compenses" — cf. sql/0005) directement, jamais
  // un libellé français à traduire : contrairement à l'ancien classeur (cf.
  // WebApp.gs, libelleCategorieFerie_/normaliserCategorieFerie_), plus
  // besoin de cette famille de fonctions de traduction ici.
  function enregistrerFeriesServeur(modifs, nouveaux, supprimes) {
    var chaine = Promise.all((modifs || []).map(function (m) {
      if (!m || !m.iso) return null;
      var maj = {};
      if (m.libelle != null && String(m.libelle).trim() !== "") maj.libelle = String(m.libelle).trim();
      if (m.categorie != null) maj.categorie = m.categorie;
      if (!Object.keys(maj).length) return null;
      return sbClient.from("feries").update(maj).eq("date", m.iso).then(function (res) { if (res.error) throw res.error; });
    }));
    chaine = chaine.then(function () {
      if (!supprimes || !supprimes.length) return null;
      return sbClient.from("feries").delete().in("date", supprimes).then(function (res) { if (res.error) throw res.error; });
    });
    chaine = chaine.then(function () {
      var lignes = (nouveaux || []).filter(function (nv) { return nv && nv.iso; }).map(function (nv) {
        return { date: nv.iso, libelle: String(nv.libelle || "").trim(), categorie: nv.categorie || "ferie" };
      });
      // upsert (pas un simple insert) : date est UNIQUE (sql/0001) — plus
      // robuste si le même jour a été recréé entre-temps par une autre
      // session, un simple insert échouerait sèchement sur la contrainte.
      if (!lignes.length) return null;
      return sbClient.from("feries").upsert(lignes, { onConflict: "date" }).then(function (res) { if (res.error) throw res.error; });
    });
    return chaine.then(function () {
      return sbClient.from("feries").select("date, libelle, categorie").order("date", { ascending: true });
    }).then(function (res) {
      if (res.error) throw res.error;
      return (res.data || []).map(function (f) { return { iso: f.date, libelle: f.libelle, categorie: f.categorie }; });
    });
  }
  // couleurs:[{id, couleur}] — seule la couleur est modifiable depuis l'appli
  // (les 3 catégories elles-mêmes sont fixes, cf. sql/0005 et
  // CATEGORIES_FERIES_DEFAUT plus haut) : un update ciblé par id, jamais un
  // delete-then-append (contrairement à statuts/formulaires — ici il n'y a
  // ni ajout ni suppression possible, la table reste toujours à 3 lignes).
  function enregistrerCouleursCategoriesFeriesServeur(couleurs) {
    var maj = (couleurs || []).filter(function (c) { return c && c.id && estCouleurHexLocal_(c.couleur); });
    var chaine = maj.reduce(function (p, c) {
      return p.then(function () {
        return sbClient.from("categories_feries").update({ couleur: c.couleur }).eq("id", c.id).then(function (res) { if (res.error) throw res.error; });
      });
    }, Promise.resolve());
    return chaine.then(function () {
      return sbClient.from("categories_feries").select("id, nom, couleur");
    }).then(function (res) {
      if (res.error) throw res.error;
      return res.data || [];
    });
  }

  /* ============ RECONSTRUCTION DE LA VUE DEPUIS LE CACHE SERVEUR ============
     Reconstruit PERSONNES/CHANTIERS/TACHES/JALONS/NOTES pour la fenêtre
     actuellement affichée (1 ou 2 semaines) à partir de etat.cache — jamais
     l'inverse. Appelée après chaque chargement/navigation/écriture réussie.
     `syncBaseline` capture ensuite ce même état pour servir de référence au
     moteur de diff (cf. synchroniser()). ============ */
  var idc = 1;
  function itemPlage(type, texte, giDebut, duree, opts) {
    opts = opts || {};
    // demiDebut/demiFin (round du 03.09.2026, "je peux reduire de 1 jour à 1
    // demi jour, mais je ne peux pas augmenter à 1 jour et demi") : chaque
    // BORD de la plage porte sa propre demi-journée ("matin" | "aprem" |
    // null = journée entière) ; tout jour strictement ENTRE les deux bords
    // reste toujours une journée entière (cf. WebApp.gs,
    // demiPourJourDePlage_ — même règle des 2 côtés). Pour une plage d'un
    // seul jour, demiDebut === demiFin (invariant maintenu par tous les
    // appelants). Avant ce round, un seul champ `demi` s'appliquait
    // uniformément à toute la plage, rendant "1 jour et demi" impossible à
    // représenter. Un JALON pouvait aussi porter demiDebut/demiFin — le
    // champ existait déjà sur cette fonction, partagée avec les notes —
    // mais restait toujours à null en pratique (règle "un jalon marque
    // toujours la journée entière", décidée le 02.09.2026, §10.3 du
    // FRONTEND-CHANGELOG) jusqu'au round du 08.09.2026 (suite) où Lionel a
    // explicitement demandé la parité avec les notes ("je veux que le jalon
    // utilise aussi la demi journée, comme ça toutes les bulles se
    // comportent de la même manière") — cf. §47 du FRONTEND-CHANGELOG.
    return { id: "b" + (idc++), type: type, texte: texte, important: !!opts.important, giDebut: giDebut, duree: Math.max(1, duree), serieId: opts.serieId || null, demiDebut: opts.demiDebut || null, demiFin: opts.demiFin || null };
  }
  // demiDebut/demiFin (round du 08.09.2026, suite — §49) : une tâche/absence
  // porte désormais sa demi-journée PAR BORD, exactement comme un jalon/note
  // (cf. itemPlage ci-dessus) — plus un seul champ `demi` fixe pour toute sa
  // durée. C'est ce qui permet "matin+aprem jour1, matin jour2" (1.5 jour)
  // d'être NATIVEMENT un seul item continu plutôt que 2 items collés
  // visuellement après coup (l'ancienne approche du §48, abandonnée — cf.
  // FRONTEND-CHANGELOG §49 : Lionel, "1 tâche ne peut pas être mise sur 2
  // case, elle s'étend de 1 jour").
  function itemPlageTache(type, texte, personneId, giDebut, duree, opts) {
    opts = opts || {};
    return {
      id: "b" + (idc++), type: type, texte: texte, chantier: opts.chantier || null,
      important: !!opts.important, statut: opts.statut || null,
      personneId: personneId, giDebut: giDebut, duree: Math.max(1, duree),
      demiDebut: opts.demiDebut || null, demiFin: opts.demiFin || null,
      serieId: opts.serieId || null
    };
  }

  function construireVueDepuisCache() {
    var donnees = fenetreDonnees();
    var d0 = donnees[0];

    // PERSONNES : ancre = identité stable (indépendante du nom, cf. §6 du
    // spec) ; la liste vient de la 1ère semaine affichée, chaque ligne est
    // recherchée par ancre dans l'éventuelle 2e semaine.
    PERSONNES = (d0.personnes || []).map(function (p) {
      return { id: String(p.ancre), nom: p.nom, sousTraitant: !!p.sousTraitant };
    });

    // CHANTIERS : clé = NOM (c'est la clé de reconnaissance réelle côté
    // feuille — cf. §6/§7 du spec, apiListerChantiers n'a pas d'id).
    // Round du 14.09.2026 : reconstruite depuis etat.chantiers, qui est
    // désormais la liste COMPLÈTE (actifs + désactivés, cf. commentaire de
    // listerChantiersDepuisServeur plus bas) — jamais filtrée ici : une
    // case déjà posée sur un chantier depuis désactivé doit continuer à
    // afficher son nom/sa couleur normalement. .actif porté sur chaque
    // entrée pour les quelques sites qui doivent au contraire exclure les
    // désactivés (légende, select "Chantier" des formulaires — cf.
    // construireLegende/champChantierHTML/champChantierJalonHTML).
    CHANTIERS = {};
    etat.chantiers.forEach(function (c) { CHANTIERS[c.nom] = { nom: c.nom, couleur: c.couleur, ligne: c.ligne, actif: c.actif !== false }; });

    TACHES = []; JALONS = []; NOTES = [];
    var nJoursFenetre = donnees.length * 5;

    // ---- jalons/notes : un item par jour non vide, fusionné avec ses
    // voisins immédiats de contenu strictement identique (même principe que
    // cellulesFusionnees() de V2). Jalon = 1 texte par jour ; note = liste
    // indépendante par jour, fusionnée "slot par slot" (position dans le
    // tableau du jour) — cf. FRONTEND-CHANGELOG.md pour les cas limites.
    donnees.forEach(function (data, s) {
      for (var j = 0; j < 5; j++) {
        var gi = s * 5 + j;
        var jd = jalonAuGi(donnees, gi); // {texte, serieId, demi} ou null
        var txt = jd ? jd.texte : "";
        if (txt && !dejaCouvertPlage(JALONS, gi)) {
          // Fusion d'un jalon avec sa demi-journée (round du 08.09.2026,
          // suite — parité avec les notes, cf. §47 du FRONTEND-CHANGELOG) :
          // MÊME principe que la fusion des notes juste plus bas
          // (demiN/demiCourant) — seuls les 2 BORDS de la plage fusionnée
          // peuvent porter une demi-journée, tout jour du MILIEU doit être
          // une journée entière (sinon la fusion s'arrête là, ce jour
          // devient le bord de fin du run).
          var demiJ = jd.demi || null;
          var demiCourantJ = demiJ;
          var fin = gi;
          while (fin + 1 < nJoursFenetre) {
            if (fin !== gi && demiCourantJ !== null) break;
            var jsuiv = jalonAuGi(donnees, fin + 1);
            if (!jsuiv || jsuiv.texte !== txt) break;
            fin++;
            demiCourantJ = jsuiv.demi || null;
          }
          var it = itemPlage("jalon", txt, gi, fin - gi + 1, { demiDebut: demiJ, demiFin: demiCourantJ });
          it.serieId = jd.serieId || null;
          it.dateDebutIso = isoDeGiFenetre(donnees, gi);
          JALONS.push(it);
        }
      }
    });
    // notes : jusqu'à N notes simultanées par jour (empilement) fusionnées en
    // une seule bulle continue avec le(s) jour(s) voisin(s) de même texte +
    // important.
    //
    // Round du 08.09.2026 — bug signalé par Lionel, capture d'écran à
    // l'appui : « les bulles se retrouvent scindée ou retrecie après
    // certains déplacmement ». AVANT ce correctif, la fusion appariait le
    // jour gi et le jour gi+1 en comparant le MÊME INDEX dans leur tableau
    // de notes respectif (l'ancienne noteSlotAuGi(donnees, gi, slot)) — un
    // raccourci qui suppose qu'une note à cheval sur 2 jours occupe toujours
    // le même rang parmi les notes de CHAQUE jour. Ce n'est vrai que tant
    // qu'aucune AUTRE note ne partage l'un des 2 jours avec un rang
    // différent — ce que enregistrer-plage peut désormais casser à chaque
    // déplacement en demi-journée (§38 ci-dessus) : chaque jour touché est
    // reconstruit par delete-puis-insert (cf. functions/enregistrer-plage/logic.js,
    // planPlage), donc l'ID (et donc le rang par ID croissant, cf.
    // construireDonneesSemaine un peu plus haut) d'une même note change à
    // chaque écriture, sans lien garanti avec son rang sur le jour voisin.
    // Reproduit en isolant le cas exact : une note "autre" seule sur un
    // jour, une note à cheval AUSSI présente sur ce jour-là mais avec un ID
    // plus grand (donc 2e du tableau ce jour-là) tandis qu'elle est SEULE
    // sur le jour suivant (donc 1ère, indice 0) — les 2 moitiés de la note à
    // cheval tombaient alors sur des indices différents et se rendaient
    // comme 2 bulles indépendantes d'un seul jour chacune (repliées sur
    // elles-mêmes, d'où le « rétrécie » de Lionel), au lieu d'une seule
    // bulle continue.
    //
    // Correctif : on ne suit plus un rang FIXE entre les jours — chaque jour
    // garde son propre ensemble d'indices déjà « consommés » par une bulle
    // déjà construite (consommes[gi]), et prolonger une bulle vers le jour
    // suivant cherche, PARMI LES INDICES NON ENCORE CONSOMMÉS de ce
    // jour-là, une note de même texte + même important — où qu'elle se
    // trouve dans le tableau, peu importe son rang. Le cas « 2 notes
    // indépendantes de même texte le même jour » (cf. commentaire plus haut
    // sur planPlage, "Livraison" matin/après-midi) reste géré correctement :
    // chaque note n'est consommée qu'une fois, donc si l'une sert à
    // prolonger une bulle qui vient de la veille, l'autre reste disponible
    // pour démarrer (ou prolonger) sa propre bulle indépendante.
    var consommes = {}; // gi -> Set(index) déjà utilisés par une bulle déjà construite
    function notesArrayAuGi_(gi) {
      var data = donnees[Math.floor(gi / 5)];
      return (data && data.notes && data.notes[gi % 5]) || [];
    }
    function indexNonConsommeCorrespondant_(gi, texte, important) {
      var arr = notesArrayAuGi_(gi);
      var used = consommes[gi];
      for (var i = 0; i < arr.length; i++) {
        if (used && used[i]) continue;
        if (arr[i].texte === texte && !!arr[i].important === !!important) return i;
      }
      return -1;
    }
    function marquerConsomme_(gi, idx) {
      if (!consommes[gi]) consommes[gi] = {};
      consommes[gi][idx] = true;
    }
    for (var giStart = 0; giStart < nJoursFenetre; giStart++) {
      var arrStart = notesArrayAuGi_(giStart);
      for (var idxStart = 0; idxStart < arrStart.length; idxStart++) {
        if (consommes[giStart] && consommes[giStart][idxStart]) continue;
        var entree = arrStart[idxStart];
        marquerConsomme_(giStart, idxStart);
        // demiDebut/demiFin (round du 03.09.2026) : seuls les 2 BORDS d'une
        // note fusionnée peuvent porter une demi-journée, tout jour du
        // MILIEU doit être une journée entière — sinon la fusion s'arrête
        // là (ce jour devient le bord de fin du run). `demiCourant` est la
        // demi du DERNIER jour inclus jusqu'ici ; tant qu'il n'est pas
        // encore le seul jour du run (fin2 === giStart), avoir une demi non
        // nulle ne bloque rien : ce jour-là est justement le bord de
        // départ, pas un jour du milieu.
        var demiN = entree.demi || null;
        var demiCourant = demiN;
        var fin2 = giStart;
        while (fin2 + 1 < nJoursFenetre) {
          if (fin2 !== giStart && demiCourant !== null) break;
          var idxSuiv = indexNonConsommeCorrespondant_(fin2 + 1, entree.texte, entree.important);
          if (idxSuiv === -1) break;
          var suiv = notesArrayAuGi_(fin2 + 1)[idxSuiv];
          fin2++;
          marquerConsomme_(fin2, idxSuiv);
          demiCourant = suiv.demi || null;
        }
        var itn = itemPlage("note", entree.texte, giStart, fin2 - giStart + 1, { important: entree.important, demiDebut: demiN, demiFin: demiCourant });
        itn.serieId = entree.serieId || null;
        itn.dateDebutIso = isoDeGiFenetre(donnees, giStart);
        NOTES.push(itn);
      }
    }

    // ---- tâches/absences personnel+intervenants : fusion par DEMI-SLOT
    // (round du 08.09.2026, suite, encore — §49), même principe que les
    // notes ci-dessus (appariement par CONTENU, indices "non consommés" —
    // jamais par position fixe dans le tableau) mais étendu à TOUTE la
    // séquence matin/aprem d'une personne, pas seulement une demi-journée
    // fixe. Avant ce round, la boucle groupait séparément "matin" et
    // "aprem" (2 passes indépendantes, jamais de pont entre les deux) : une
    // tâche à cheval matin/aprem ne pouvait donc JAMAIS être un seul item —
    // exactement la limite que Lionel signalait ("1 tâche ne peut pas être
    // mise sur 2 case, elle s'étend de 1 jour"). Le chantier vient désormais
    // de CHAQUE tâche directement (t.chantier, cf. tacheVue_ — round du
    // 16.09.2026, sql/0010_taches_chantier_id.sql) : deux tâches empilées sur
    // la même case peuvent donc avoir chacune leur propre chantier, sans que
    // poser la seconde ne change la couleur de la première (l'ancienne
    // limite structurelle "1 seul chantier par case", documentée dans
    // FRONTEND-CHANGELOG, est résolue par ce round).
    //
    // Un "demi-slot" numérote consécutivement les demi-journées OUVRÉES
    // d'une personne : hi=2*gi est le matin du jour gi, hi=2*gi+1 son
    // après-midi (même convention que demiSlotsDepuisBornes/
    // bornesDepuisDemiSlots, réutilisées ici pour reconvertir la paire de
    // bornes fusionnée en {giDebut, duree, demiDebut, demiFin}). Le
    // week-end (case isolée, jamais de plage) reste géré par sa propre
    // boucle séparée juste après, comme avant ce round.
    PERSONNES.forEach(function (p) {
      function tableauAuHalfSlot_(hi) {
        var gi = Math.floor(hi / 2), demi = (hi % 2 === 0) ? "matin" : "aprem";
        var data = donnees[Math.floor(gi / 5)];
        var pd = data && trouverPersonneDonnees(data, p.id);
        var cell = pd ? pd[demi][gi % 5] : null;
        return (cell && cell.taches) || [];
      }
      var consommesT = {}; // hi -> Set(index déjà utilisé par un item déjà construit)
      // ignorerChantier (round du 15.09.2026 — bug signalé par Lionel,
      // capture d'écran à l'appui : une absence en série, posée sur matin ET
      // aprem d'un même jour, se rendait en 2 bulles séparées au lieu d'une
      // seule) : le chantier d'une tâche n'est comparé que pour une VRAIE
      // tâche — une absence l'ignore déjà totalement à l'affichage
      // (`chantier: typT === "absence" ? null : chantierT` juste en dessous,
      // inchangé), mais sans ce paramètre la fusion matin/aprem (ou
      // jour-à-jour) l'exigerait quand même égal pour prolonger un run. Round
      // du 16.09.2026 (sql/0010_taches_chantier_id.sql) : chantier est
      // maintenant lu directement sur CHAQUE tâche (arr[i].chantier, cf.
      // tacheVue_) plutôt que sur la case entière — une absence ne porte de
      // toute façon jamais de chantier (champsSerie ne le pose jamais pour ce
      // type), donc ignorerChantier reste utile pour les mêmes raisons
      // qu'avant, seule la SOURCE de la comparaison a changé.
      function indexNonConsommeCorrespondantT_(hi, texte, important, statut, chantier, ignorerChantier) {
        var arr = tableauAuHalfSlot_(hi);
        var used = consommesT[hi];
        for (var i = 0; i < arr.length; i++) {
          if (used && used[i]) continue;
          if (arr[i].texte === texte && !!arr[i].important === !!important && (arr[i].statut || null) === (statut || null) &&
            (ignorerChantier || (arr[i].chantier || null) === (chantier || null))) return i;
        }
        return -1;
      }
      function marquerConsommeT_(hi, idx) { (consommesT[hi] = consommesT[hi] || {})[idx] = true; }

      var nHalfFenetre = nJoursFenetre * 2;
      for (var hiStart = 0; hiStart < nHalfFenetre; hiStart++) {
        if (estGiWeekend(Math.floor(hiStart / 2))) continue;
        var arrStart = tableauAuHalfSlot_(hiStart);
        for (var idxStart = 0; idxStart < arrStart.length; idxStart++) {
          if (consommesT[hiStart] && consommesT[hiStart][idxStart]) continue;
          var entreeT = arrStart[idxStart];
          var chantierT = entreeT.chantier || null;
          // Round du 14.09.2026 : entreeT.absence (colonne réelle
          // taches.est_absence, cf. tacheVue_) prime désormais sur
          // estAbsence(texte) — gardée en OR seulement comme filet de
          // sécurité pour les lignes antérieures à ce round, cf. commentaire
          // détaillé sur tacheVue_ plus haut. Calculé ICI (avant la fusion,
          // pas seulement après comme avant le round du 15.09.2026) pour
          // piloter ignorerChantier ci-dessous.
          var typT = (entreeT.absence || estAbsence(entreeT.texte)) ? "absence" : "tache";
          marquerConsommeT_(hiStart, idxStart);
          var finHi = hiStart;
          while (finHi + 1 < nHalfFenetre && !estGiWeekend(Math.floor((finHi + 1) / 2))) {
            var idxSuivT = indexNonConsommeCorrespondantT_(finHi + 1, entreeT.texte, entreeT.important, entreeT.statut, chantierT, typT === "absence");
            if (idxSuivT === -1) break;
            finHi++;
            marquerConsommeT_(finHi, idxSuivT);
          }
          var bornesT = bornesDepuisDemiSlots(hiStart, finHi);
          var ittT = itemPlageTache(typT, entreeT.texte, p.id, bornesT.giDebut, bornesT.duree, {
            chantier: typT === "absence" ? null : chantierT, important: entreeT.important, statut: entreeT.statut || null,
            demiDebut: bornesT.demiDebut, demiFin: bornesT.demiFin
          });
          ittT.serieId = entreeT.serieId || null;
          ittT.dateDebutIso = isoDeGiFenetre(donnees, bornesT.giDebut);
          TACHES.push(ittT);
        }
      }
    });

    // ---- week-end (colonne fusionnée jj=6/7, §2 du spec) : UNE seule
    // cellule serveur par personne, que apiChargerSemaine scinde déjà en 2
    // entrées {chantier,taches} (Samedi = weekend[0], Dimanche = weekend[1]).
    // Toujours posées avec demi:"matin" — seule ligne interactive côté
    // client pour le week-end (cf. ligneGroupePersonnes/creerCelluleWeekendInerte) :
    // si les 2 lignes matin/aprem écrivaient toutes les deux, elles
    // écraseraient alternativement la même cellule serveur. Durée toujours 1
    // (case isolée, jamais de plage sur le week-end — cf. estGiWeekend un peu
    // partout dans le moteur de drag/redim).
    PERSONNES.forEach(function (p) {
      donnees.forEach(function (data, s) {
        var pd = trouverPersonneDonnees(data, p.id);
        if (!pd || !pd.weekend) return;
        [0, 1].forEach(function (j) {
          var vueJour = pd.weekend[j];
          if (!vueJour) return;
          var giWE = giWeekend(s, j);
          (vueJour.taches || []).forEach(function (t) {
            var typ = (t.absence || estAbsence(t.texte)) ? "absence" : "tache"; // round du 14.09.2026, cf. commentaire de tacheVue_
            var itwe = itemPlageTache(typ, t.texte, p.id, giWE, 1, {
              // chantier de la TÂCHE elle-même (round du 16.09.2026, cf.
              // tacheVue_) — vueJour.chantier n'est plus qu'un repli pour une
              // case sans aucune tâche, jamais pertinent ici.
              chantier: typ === "absence" ? null : (t.chantier || null), important: t.important, statut: t.statut || null,
              demiDebut: "matin", demiFin: "matin"
            });
            itwe.serieId = t.serieId || null;
            itwe.dateDebutIso = isoDeGi(giWE);
            TACHES.push(itwe);
          });
        });
      });
    });

    syncBaseline = calculerEtatLocal();
  }
  function trouverPersonneDonnees(data, ancre) {
    var a = String(ancre);
    for (var i = 0; i < data.personnes.length; i++) if (String(data.personnes[i].ancre) === a) return data.personnes[i];
    return null;
  }
  // {texte, serieId} ou null — round "idem pour les modifications de
  // série" (01.09.2026) : le serveur renvoie désormais un objet décodé par
  // jour (cf. apiChargerSemaine, WebApp.gs) au lieu d'une simple chaîne, ce
  // qui permet enfin au client de connaître le serieId d'un jalon.
  function jalonAuGi(donnees, gi) {
    var data = donnees[Math.floor(gi / 5)];
    var j = data && data.jalons ? data.jalons[gi % 5] : null;
    return (j && j.texte) ? j : null;
  }
  function tacheSlotAuGi(donnees, ancre, demi, gi, slot) {
    var data = donnees[Math.floor(gi / 5)];
    var pd = data && trouverPersonneDonnees(data, ancre);
    var cell = pd ? pd[demi][gi % 5] : null;
    return (cell && cell.taches && cell.taches[slot]) ? cell.taches[slot] : null;
  }
  function isoDeGiFenetre(donnees, gi) {
    var data = donnees[Math.floor(gi / 5)];
    return data ? data.isoDates[gi % 5] : null;
  }
  function dejaCouvertPlage(liste, gi) {
    return liste.some(function (it) { return gi >= it.giDebut && gi < it.giDebut + it.duree; });
  }
  // Alignée sur estAbsence() de Planning_Format.gs (cf. Index.html V2) : même
  // règle de détection, pour ne jamais diverger de ce que la vraie feuille
  // colore en absence.
  function estAbsence(txt) {
    var t = (txt || "").toLowerCase();
    return t.indexOf("absent") !== -1 || t.indexOf("cong") !== -1 || t.indexOf("vacance") !== -1;
  }

  /* ============ MOTEUR DE SYNCHRONISATION (diff local <-> serveur) ============
     calculerEtatLocal() prend une "photo" de TACHES/JALONS/NOTES telle
     qu'affichée (gi -> jour réel via isoDeGi/labGDeGi/jourIdxDeGi). Après
     toute mutation locale + render(), synchroniser() compare cette photo à
     syncBaseline (la dernière photo connue du serveur) et n'envoie QUE ce qui
     a changé — cf. commentaire d'architecture en tête de fichier. ============ */
  var syncBaseline = null;
  var syncEnCours = false, syncRelance = false;

  function calculerEtatLocal() {
    var cellules = {};   // "ancre|demi|labG|jourIdx" -> {taches:[{texte,statut,important,serieId,chantier}]}
    var n = nbJoursAffiches();
    // demiDebut/demiFin par BORD (round du 08.09.2026, suite, encore — §49) :
    // une tâche/absence n'a plus un seul `demi` fixe pour toute sa durée —
    // même règle de bord que les jalons juste au-dessus (d===0 -> demiDebut,
    // d===duree-1 -> demiFin, tout jour du MILIEU reste une journée entière,
    // donc projeté sur LES 2 tableaux matin+aprem de ce jour-là). Un jalon
    // n'a qu'UN texte par jour (un seul tableau `jalonsMap`) ; une tâche a
    // une LISTE par case (empilement), d'où la projection sur "1 ou 2"
    // tableaux de cellule plutôt que sur "1 ou 2" valeurs d'un seul champ.
    PERSONNES.forEach(function (p) {
      TACHES.filter(function (t) { return t.personneId === p.id && giVisibleFenetre(t.giDebut, n); }).forEach(function (t) {
        for (var d = 0; d < t.duree; d++) {
          var gi = t.giDebut + d;
          if (!giVisibleFenetre(gi, n)) continue;
          var lab = labGDeGi(gi), ji = jourIdxDeGi(gi);
          if (lab == null) continue;
          // demiIciT (round du 11.09.2026 — bug signalé par Lionel, vidéo à
          // l'appui : « en tirant test 2 il se scinde en plusieurs ») : DOIT
          // appliquer EXACTEMENT la même règle de bord que demisOccupeesTache
          // (cf. plus bas) — sur une plage de PLUSIEURS jours, demiDebut ===
          // "matin" au 1er jour et demiFin === "aprem" au dernier jour sont
          // visuellement identiques à une journée entière (cf.
          // colonneEtSpanDemi : "matin" est déjà le bord gauche du jour,
          // "aprem" ne raccourcit jamais une fin de plage) — AVANT ce
          // correctif, cette fonction réimplémentait sa PROPRE version (sans
          // cette équivalence) au lieu d'appeler demisOccupeesTache comme le
          // documente pourtant déjà son commentaire (cf. test_grille_compacte.js,
          // "demisOccupeesTache(it, gi) est la fonction PARTAGÉE ... utilisée
          // par le moteur de synchronisation (calculerEtatLocal)" — affirmation
          // fausse dans les faits jusqu'à ce correctif). Résultat concret du
          // bug : sur le jour de bord d'une plage multi-jours, une seule des 2
          // demi-journées serveur était écrite, l'autre restant vide. Au
          // rechargement suivant (construireVueDepuisCache), cette moitié
          // manquante cassait la continuité de la plage reconstruite
          // (l'algorithme de fusion exige un contenu identique sur CHAQUE
          // demi-slot consécutif) : la tâche revenait scindée en 2+ bulles au
          // lieu d'une seule, dès sa création ou dès le premier
          // redimensionnement — sans qu'aucun geste supplémentaire ne soit
          // nécessaire pour le déclencher. Appeler directement
          // demisOccupeesTache(t, gi) élimine la duplication ET garantit qu'un
          // futur ajustement de cette règle de bord ne puisse plus diverger
          // entre affichage et écriture serveur.
          var demisAAppliquer = demisOccupeesTache(t, gi);
          demisAAppliquer.forEach(function (demi) {
            var cle = p.id + "|" + demi + "|" + lab + "|" + ji;
            if (!cellules[cle]) cellules[cle] = { taches: [] };
            // absence (round du 14.09.2026, cf. tacheVue_) : portée jusqu'au
            // payload serveur (enregistrerCellulePersonneServeur) pour écrire
            // la vraie colonne taches.est_absence, plutôt que de laisser le
            // serveur/la reconstruction suivante redéduire le type depuis le
            // seul texte. chantier (round du 16.09.2026,
            // sql/0010_taches_chantier_id.sql) : porté PAR TÂCHE désormais,
            // plus au niveau de la cellule — chaque tâche empilée garde son
            // propre chantier jusqu'à l'écriture serveur.
            cellules[cle].taches.push({ texte: t.texte, statut: t.statut || null, important: !!t.important, serieId: t.serieId || null, absence: t.type === "absence", chantier: t.chantier || null });
          });
        }
      });
    });
    // §88 (round du 17.09.2026, suite×3) — jalonsMap ("labG|jourIdx" ->
    // "demi\u0000texte", décomposé JOUR PAR JOUR dans la fenêtre visible) a
    // été remplacé par jalonsParId (par identité d'item JS, MÊME principe
    // que notesParId juste en dessous — un jalon a exactement la même forme
    // {id,texte,giDebut,duree,demiDebut,demiFin,dateDebutIso}, cf. itemPlage,
    // partagée avec les notes). Raison : la décomposition jour par jour ne
    // pouvait représenter que ce qui est VISIBLE dans la fenêtre chargée
    // (giVisibleFenetre) — un jalon dont la plage dépasse la fenêtre (permis
    // depuis §88, cf. appliquerDateChoisieFormulaire) y perdait silencieusement
    // ses jours en trop. Suivre l'id comme les notes permet à synchroniser()
    // d'envoyer une VRAIE plage (dateDebut/dateFin ISO, cf. isoDeApres) à
    // enregistrer-plage, qui sait déjà l'écrire sans dépendre de ce qui est
    // chargé côté client (cf. planPlage, functions/enregistrer-plage/logic.js).
    return { cellules: cellules, jalonsById: jalonsParId(), notesById: notesParId(), tachesSeriePayload: null };
  }
  function jalonsParId() {
    var out = {};
    JALONS.forEach(function (j) { out[j.id] = { texte: j.texte, giDebut: j.giDebut, duree: j.duree, dateDebutIso: j.dateDebutIso, demiDebut: j.demiDebut || null, demiFin: j.demiFin || null }; });
    return out;
  }
  function notesParId() {
    var out = {};
    NOTES.forEach(function (n) { out[n.id] = { texte: n.texte, important: !!n.important, giDebut: n.giDebut, duree: n.duree, dateDebutIso: n.dateDebutIso, demiDebut: n.demiDebut || null, demiFin: n.demiFin || null }; });
    return out;
  }
  // Nombre de semaines réellement chargées × 5 (et non plus deuxSemaines
  // seul) : la vue "1 jour" téléphone en charge aussi 2 (round du
  // 24.09.2026, suite 6, cf. fenetreLabGs dans core.js).
  function nbJoursAffiches() { return fenetreLabGs().length * 5; }
  function giVisibleFenetre(gi, n) {
    if (estGiWeekend(gi)) return afficherWeekends && semaineDuGiWeekend(gi) < (n / 5);
    return gi < n;
  }

  // Diffs des cellules "personne" (tâches/absences) : comparaison intégrale
  // cellule par cellule (simple et robuste — cf. FRONTEND-CHANGELOG pour le
  // choix "diff plein" plutôt qu'un suivi fin par item).
  // chantier (round du 16.09.2026, sql/0010_taches_chantier_id.sql) : plus de
  // clé "chantier" au niveau de la cellule — chaque entrée de a.taches porte
  // déjà la sienne (cf. calculerEtatLocal), le payload la transmet telle
  // quelle à enregistrerCellulePersonneServeur.
  function diffsCellulesPersonne(local, base) {
    var cles = {};
    Object.keys(local.cellules).forEach(function (k) { cles[k] = true; });
    Object.keys(base.cellules).forEach(function (k) { cles[k] = true; });
    var out = [];
    Object.keys(cles).forEach(function (cle) {
      var a = local.cellules[cle] || { taches: [] };
      var b = base.cellules[cle] || { taches: [] };
      if (JSON.stringify(a) === JSON.stringify(b)) return;
      var parts = cle.split("|");
      out.push({ ancre: +parts[0], demi: parts[1], labG: +parts[2], jourIdx: +parts[3], payload: { taches: a.taches } });
    });
    return out;
  }
  // §88 — diff des jalons, par identité d'item JS : MÊME principe que
  // diffsNotes juste en dessous (jalonsById plutôt que jalonsMap, cf. son
  // commentaire dans calculerEtatLocal). Pas de champ `important`/`chantierId`
  // comparé ici : la grille n'édite/n'envoie jamais ces 2 champs pour un
  // jalon (cf. commentaire de synchroniser() plus bas) — les comparer ici
  // déclencherait une écriture fantôme dès que la page « Jalons » les change
  // en dehors de la grille.
  function diffsJalons(local, base) {
    var out = [];
    Object.keys(local.jalonsById).forEach(function (id) {
      var a = local.jalonsById[id], b = base.jalonsById[id];
      if (b && a.texte === b.texte && a.giDebut === b.giDebut && a.duree === b.duree && (a.demiDebut || null) === (b.demiDebut || null) && (a.demiFin || null) === (b.demiFin || null)) return;
      out.push({ action: b ? "modifier" : "creer", id: id, avant: b || null, apres: a });
    });
    Object.keys(base.jalonsById).forEach(function (id) {
      if (!local.jalonsById[id]) out.push({ action: "supprimer", id: id, avant: base.jalonsById[id], apres: null });
    });
    return out;
  }
  // Diff des notes : par identité d'item JS (stable entre deux render()
  // consécutifs tant qu'aucun rechargement serveur n'a eu lieu entre-temps).
  function diffsNotes(local, base) {
    var out = [];
    Object.keys(local.notesById).forEach(function (id) {
      var a = local.notesById[id], b = base.notesById[id];
      if (b && a.texte === b.texte && !!a.important === !!b.important && a.giDebut === b.giDebut && a.duree === b.duree && (a.demiDebut || null) === (b.demiDebut || null) && (a.demiFin || null) === (b.demiFin || null)) return;
      out.push({ action: b ? "modifier" : "creer", id: id, avant: b || null, apres: a });
    });
    Object.keys(base.notesById).forEach(function (id) {
      if (!local.notesById[id]) out.push({ action: "supprimer", id: id, avant: base.notesById[id], apres: null });
    });
    return out;
  }

  // isoDeLabGJourIdx((labG, jourIdx) -> date ISO) a été retirée au §88
  // (round du 17.09.2026, suite×3) : c'était la conversion utilisée par
  // l'ancien dJal.forEach de synchroniser() pour diffuser un jalon JOUR PAR
  // JOUR — remplacée par un envoi en vraie plage (dateDebut/dateFin ISO),
  // cf. son commentaire ; le seul appelant de cette fonction a disparu avec
  // ce changement.
  // Variante "case personnel" : jourIdx y va de 0 à 7 (0..4 = lundi..vendredi,
  // 6/7 = Samedi/Dimanche — cf. commentaire de tête d'apiEnregistrerCellulePersonne,
  // WebApp.gs ; jourIdx 5 n'existe jamais, hérité de l'ancien classeur où les
  // colonnes physiques sautaient de jj=5 à jj=6 pour le bloc week-end fusionné).
  // infosSemaineDepuisLabG().weekendDates = [Samedi, Dimanche].
  function isoDeLabGJourIdxCase_(labG, jourIdx) {
    var infos = infosSemaineDepuisLabG(labG);
    if (jourIdx === 6) return infos.weekendDates[0];
    if (jourIdx === 7) return infos.weekendDates[1];
    return infos.isoDates[jourIdx];
  }

  // ---- ÉCRITURE D'UNE CASE PERSONNEL (§5 du plan : "pas de fonction dédiée,
  // écriture directe des tables taches/assignations") — remplace l'ancien
  // apiEnregistrerCellulePersonne (WebApp.gs), oublié lors de l'étape 4
  // (branchement des Edge Functions) car ce n'en est justement pas une.
  // Repéré par Lionel : "échec de la synchronisation : google is not
  // defined" à l'ajout d'une tâche (round du 07.09.2026).
  //
  // Même règle métier que l'ancien code : une case (personne, demi, jour) a
  // un état COMPLET envoyé à chaque fois par le moteur de diff (payload =
  // {chantier, taches}, cf. diffsCellulesPersonne plus haut) — jamais un
  // ajout incrémental. On remplace donc tout le contenu de la case : les
  // anciennes lignes `taches`/`assignations` de ce (personne_id, date, demi)
  // sont retirées, les nouvelles insérées à la place (ordre = position dans
  // le tableau `payload.taches`, cf. construireDonneesSemaine qui relit cet
  // ordre à la relecture). `chantier`/`statut` arrivent en NOM/CLÉ côté
  // client (comme tout le reste de la vue, cf. étape 2) : traduits ici en
  // chantier_id/statut_id via les lookups déjà construits au bootstrap
  // (etat.chantierParNom, etat.statutIdParCle).
  //
  // Ordre delete-puis-insert (pas l'inverse) : sbClient.from(...).insert()
  // ne renvoie pas les id insérés sans .select() explicite, donc aucun moyen
  // fiable d'exclure ensuite SEULEMENT les nouvelles lignes lors du nettoyage
  // — écrire d'abord aurait exigé soit ce .select() en plus (un aller-retour
  // de plus), soit vivre avec des doublons transitoires visibles. Une case a
  // rarement plus de 2-3 tâches : le risque d'un état transitoirement vide en
  // cas d'échec entre le delete et l'insert est jugé acceptable — même
  // limite déjà assumée par enregistrer-plage/enregistrer-serie/gerer-serie
  // (opérations non transactionnelles, cf. leurs en-têtes).
  //
  // Simplification permise par le nouveau schéma, pas un choix pris ici :
  // le week-end (jourIdx 6/7) n'a plus besoin de la mécanique de cellule
  // fusionnée Samedi/Dimanche de l'ancien classeur (tag [S]/[D], une seule
  // colonne physique pour les 2 jours) — chaque jour a sa propre date, donc
  // sa propre ligne, exactement comme un jour de semaine ; jourIdx 6 et 7
  // s'écrivent donc chacun indépendamment, avec la même fonction.
  // chantier (round du 16.09.2026, sql/0010_taches_chantier_id.sql — Lionel :
  // "plusieurs chantier sur la même case ... actuellement si une tâche est
  // affecté à un chantier, la tâche déjà en place change de chantier") :
  // chaque ligne `taches` porte désormais SON PROPRE chantier_id (résolu
  // depuis t.chantier, le nom, via etat.chantierParNom — même table de
  // correspondance qu'avant), au lieu d'une seule ligne `assignations`
  // partagée par toute la case. Plus aucune écriture dans `assignations` :
  // la case n'a plus qu'UNE seule source de vérité pour le chantier. La
  // ligne `assignations` existante pour cette case est quand même supprimée
  // (nettoyage best-effort d'un résidu qu'aucun code n'écrit plus depuis ce
  // round, mais qui peut encore exister pour une case jamais réécrite depuis).
  function enregistrerCellulePersonneServeur(labG, ancre, demi, jourIdx, payload) {
    if (demi !== "matin" && demi !== "aprem") return Promise.reject(new Error("Demi-journée invalide."));
    var personneId = parseInt(ancre, 10);
    var iso = isoDeLabGJourIdxCase_(labG, jourIdx);
    var taches = (payload && payload.taches) || [];
    var lignesTaches = taches.map(function (t, i) {
      var chantier = t.chantier ? etat.chantierParNom[t.chantier] : null;
      var ligne = {
        personne_id: personneId, date: iso, demi: demi, ordre: i,
        texte: t.texte, statut_id: t.statut ? (etat.statutIdParCle[t.statut] || null) : null,
        important: !!t.important, serie_id: t.serieId || null,
        // est_absence (sql/0009_taches_est_absence.sql, round du 14.09.2026) :
        // écrit tel quel depuis payload.taches[].absence (posé par
        // calculerEtatLocal ci-dessus) — sans cette colonne, une absence au
        // texte libre revenait "tâche" dès la reconstruction suivante (cf.
        // commentaire détaillé sur tacheVue_).
        est_absence: !!t.absence
      };
      if (chantier) ligne.chantier_id = chantier.ligne;
      return ligne;
    });
    return sbClient.from("taches").delete().eq("personne_id", personneId).eq("date", iso).eq("demi", demi).then(function (res) {
      if (res.error) throw res.error;
      return sbClient.from("assignations").delete().eq("personne_id", personneId).eq("date", iso).eq("demi", demi);
    }).then(function (res) {
      if (res.error) throw res.error;
      return lignesTaches.length ? sbClient.from("taches").insert(lignesTaches) : { error: null };
    }).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  // Repousse un rechargement de la grille (construireVueDepuisCache + render)
  // tant qu'un glissement/redimensionnement est ACTIF (round du 08.09.2026,
  // suite — Lionel, photo à l'appui : « la bulle fantôme apparue quand la
  // bulle s'est replacé sans que j'ai soulevé le doigt de la souris » + vidéo
  // « impossible de déplacer de 1 case une bulle qui fait 2 cases »).
  // render() (appelé ici juste après CHAQUE synchronisation réussie, y
  // compris celle d'un geste précédent qui vient tout juste de se terminer)
  // appelle construireGrille(), qui recrée TOUS les noeuds .bulle depuis
  // zéro. Si ce rechargement survient PENDANT qu'un nouveau geste de
  // glissement est en cours (l'utilisateur a démarré un 2e geste avant que
  // la synchro réseau du 1er n'ait fini de retomber — tout à fait possible
  // avec la latence réelle d'un serveur Supabase), le noeud bulleDom sur
  // lequel pointermove/pointerup sont câblés est remplacé : la spec Pointer
  // Events relâche alors SILENCIEUSEMENT la capture du pointeur dès qu'un
  // élément qui la détient quitte le DOM. Le geste en cours est abandonné
  // sans qu'onUp/onCancel ne soit jamais appelé : le fantôme de glissement
  // (.fantome-glisse, posé sous document.body, donc lui-même pas détruit
  // par le rechargement) reste alors figé à l'écran — le bug du ghost — et
  // toute résolution de cible ultérieure du même geste se fait contre un
  // état qui n'est plus le bon. document.body porte la classe
  // "en-glissement" pendant TOUT geste de ce type (armer()/armerSelection()
  // dans onPointerDownGroupeSelection, cablerPoigneeRedim,
  // demarrerSelectionRapide, etc.) : on s'en sert ici comme signal pour
  // repousser le rechargement de quelques ms plutôt que de reconstruire la
  // grille sous les pieds d'un geste en cours. Sans effet sur le geste
  // lui-même (qui continue de suivre le pointeur normalement) ; le
  // rechargement finit par s'appliquer dès que le geste se termine.
  function differerSiEnGlissement(rechargerVue) {
    if (!document.body.classList.contains("en-glissement")) { rechargerVue(); return; }
    setTimeout(function () { differerSiEnGlissement(rechargerVue); }, 120);
  }
  function synchroniser() {
    if (!fenetrePrete() || !syncBaseline) return;
    if (syncEnCours) { syncRelance = true; return; }
    var local = calculerEtatLocal();
    var dCel = diffsCellulesPersonne(local, syncBaseline);
    var dJal = diffsJalons(local, syncBaseline);
    var dNot = diffsNotes(local, syncBaseline);
    if (!dCel.length && !dJal.length && !dNot.length) return;
    syncEnCours = true;
    occupe(true);
    var chaine = Promise.resolve();
    dCel.forEach(function (d) {
      chaine = chaine.then(function () {
        return enregistrerCellulePersonneServeur(d.labG, d.ancre, d.demi, d.jourIdx, d.payload);
      });
    });
    // §88 (round du 17.09.2026, suite×3) — dJal envoie désormais une VRAIE
    // plage (dateDebut/dateFin ISO, comme dNot juste en dessous) plutôt
    // qu'un jour isolé : cf. le commentaire de jalonsParId/diffsJalons plus
    // haut pour la raison (un jalon peut maintenant dépasser la fenêtre
    // chargée, cf. appliquerDateChoisieFormulaire). `mode` reste
    // INCONDITIONNELLEMENT "remplacement" (jamais "ajout" comme pour une
    // note qui vient d'être créée) : un enregistrement de jalon représente
    // toujours l'état COMPLET du jour (cf. l'ancien apiEnregistrerJalonNote,
    // qui écrasait sans condition la cellule entière — une seule ligne
    // possible par jour, contrairement aux notes qui peuvent être plusieurs
    // sur le même jour).
    // Ni `important` ni `chantierId` ne sont envoyés ici (round du 12.09.2026
    // — page « Jalons », sql/0007_jalons_chantier.sql) : la grille ne
    // connaît/n'édite ni l'un ni l'autre pour un jalon (seul le texte l'est
    // ici), et planPlage() (functions/enregistrer-plage/logic.js) reconduit
    // alors tel quel ce qui existe déjà en base plutôt que de l'écraser à
    // false/null — un chantier ou un "important" posé depuis la nouvelle
    // page Jalons survit donc à une simple modif de texte faite ici.
    dJal.forEach(function (d) {
      chaine = chaine.then(function () {
        var dateDeb, dateFin, texte, origine;
        var demiDebJalon = d.apres ? (d.apres.demiDebut || null) : null;
        var demiFinJalon = d.apres ? (d.apres.demiFin || null) : null;
        if (d.action === "supprimer") {
          dateDeb = d.avant.dateDebutIso; dateFin = isoDeApres(d.avant); texte = "";
          origine = { dateDebut: dateDeb, dateFin: dateFin, texte: d.avant.texte, demiDebut: d.avant.demiDebut || null, demiFin: d.avant.demiFin || null };
        } else {
          dateDeb = d.apres.dateDebutIso || isoDeGi(d.apres.giDebut); dateFin = isoDeApres(d.apres); texte = d.apres.texte;
          origine = d.avant ? { dateDebut: d.avant.dateDebutIso, dateFin: isoDeApres(d.avant), texte: d.avant.texte, demiDebut: d.avant.demiDebut || null, demiFin: d.avant.demiFin || null } : null;
        }
        return invoquerFonctionServeur("enregistrer-plage", {
          kind: "jalon", dateDebut: dateDeb, dateFin: dateFin, demiDebut: demiDebJalon, demiFin: demiFinJalon,
          texte: texte, mode: "remplacement", origine: origine
        });
      });
    });
    dNot.forEach(function (d) {
      chaine = chaine.then(function () {
        var dateDeb, dateFin, texte, important, origine, mode;
        // demiDebut/demiFin (round du 03.09.2026) : l'ORIGINE porte aussi les
        // siens (nécessaires côté serveur pour ne retirer que l'entrée qui
        // portait vraiment cette demi-journée-là, cf. enregistrer-plage/logic.js
        // — planPlage lit origine.demiDebut/demiFin).
        var demiDebNote = d.apres ? (d.apres.demiDebut || null) : null;
        var demiFinNote = d.apres ? (d.apres.demiFin || null) : null;
        if (d.action === "supprimer") {
          dateDeb = d.avant.dateDebutIso; dateFin = isoDeApres(d.avant); texte = ""; important = false; mode = "remplacement";
          origine = { dateDebut: dateDeb, dateFin: dateFin, texte: d.avant.texte, important: d.avant.important, demiDebut: d.avant.demiDebut || null, demiFin: d.avant.demiFin || null };
        } else {
          dateDeb = d.apres.dateDebutIso || isoDeGi(d.apres.giDebut); dateFin = isoDeApres(d.apres); texte = d.apres.texte; important = d.apres.important;
          mode = d.action === "creer" ? "ajout" : "remplacement";
          origine = d.avant ? { dateDebut: d.avant.dateDebutIso, dateFin: isoDeApres(d.avant), texte: d.avant.texte, important: d.avant.important, demiDebut: d.avant.demiDebut || null, demiFin: d.avant.demiFin || null } : null;
        }
        return invoquerFonctionServeur("enregistrer-plage", {
          kind: "note", dateDebut: dateDeb, dateFin: dateFin, demiDebut: demiDebNote, demiFin: demiFinNote,
          texte: texte, important: important, mode: mode, origine: origine
        });
      });
    });
    chaine.then(function () {
      occupe(false);
      syncEnCours = false;
      // Ni enregistrer-plage ni apiEnregistrerCellulePersonne (une fois
      // portée) ne renvoient plus la semaine entière rafraîchie (contrairement
      // à l'ancien apiXxx, cf. commentaire de tête d'apiEnregistrerJalonNote,
      // WebApp.gs) : on relit simplement la fenêtre affichée depuis Supabase,
      // même mécanisme (oublierCache + assurerFenetreChargee) que le filet de
      // rattrapage du .catch juste en dessous — un aller-retour de plus par
      // synchronisation, mais un seul chemin de code pour "l'état affiché
      // doit refléter ce que le serveur vient d'accepter".
      oublierCache();
      differerSiEnGlissement(function () {
        assurerFenetreChargee(function () {
          construireVueDepuisCache();
          if (syncRelance) { syncRelance = false; synchroniser(); }
          else render(false);
        });
      });
    }).catch(function (err) {
      occupe(false);
      syncEnCours = false; syncRelance = false;
      toast("Échec de la synchronisation : " + (err && err.message ? err.message : err) + " — rechargement…");
      oublierCache();
      differerSiEnGlissement(function () {
        assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); });
      });
    });
  }
  function isoDeApres(item) {
    if (!item.dateDebutIso) return isoDeGi(item.giDebut + item.duree - 1);
    // §88 (round du 17.09.2026, suite×3) — item.duree compte des jours
    // OUVRÉS (jamais un week-end : le moteur de fusion des bulles,
    // construireVueDepuisCache, n'avance jamais gi à travers un week-end
    // réel), donc avancer de `duree-1` jours CALENDAIRES bruts comme le
    // faisait ce calcul avant ce round était juste tant qu'aucune bulle ne
    // traversait un week-end réel (possible seulement en mode "2 semaines",
    // rare en pratique) — et devient franchement faux dès qu'une plage peut
    // dépasser la fenêtre chargée (cf. appliquerDateChoisieFormulaire) : une
    // absence de 2 semaines saute alors 2 week-ends, pas 0. Corrigé en
    // avançant jour par jour en sautant sam/dim, comme joursOuvresDeLaPlage
    // côté serveur (functions/enregistrer-plage/logic.js).
    var d = new Date(item.dateDebutIso + "T00:00:00");
    var restant = item.duree - 1;
    while (restant > 0) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) restant--;
    }
    return isoDeDate(d);
  }
  // §88 — compte de jours OUVRÉS entre 2 dates ISO incluses (mêmes règles
  // que joursOuvresDeLaPlage côté serveur, ici on ne veut que le COMPTE, pas
  // la liste) : sert à calculer `duree` quand une borne de plage est hors de
  // la fenêtre chargée (state.debutHorsFenetreIso/finHorsFenetreIso, cf.
  // appliquerDateChoisieFormulaire) — giFin-giDebut+1 ne veut alors plus rien
  // dire, ces gi étant calés (clampés) sur le bord visible, pas la vraie
  // date.
  function nbJoursOuvresEntre(isoDebut, isoFin) {
    var d = new Date(isoDebut + "T00:00:00"), fin = new Date(isoFin + "T00:00:00");
    var n = 0;
    while (d.getTime() <= fin.getTime()) {
      var js = d.getDay();
      if (js !== 0 && js !== 6) n++;
      d.setDate(d.getDate() + 1);
    }
    return Math.max(1, n);
  }

  /* ============ TÂCHE/ABSENCE HORS DE LA FENÊTRE CHARGÉE ============
     Round du 24.09.2026 (suite 5) — Lionel, capture à l'appui (toast « Cette
     date sort de la semaine affichée… » en décalant une tâche au-delà du
     vendredi) : « J'aimerai pouvoir déplacer une tâche en dehors de la
     semaine activé. » Réponses aux questions posées avant de coder : via le
     formulaire seulement (le glisser-déposer reste limité à l'écran), et la
     grille reste sur la semaine affichée avec un message de confirmation.

     Pourquoi un chemin à part : une tâche n'existe côté serveur que sous
     forme de lignes `taches` par (personne, date, demi-journée), et le
     moteur de diff (calculerEtatLocal/synchroniser) ne sait écrire QUE les
     jours de la fenêtre chargée (giVisibleFenetre) — cf. le long commentaire
     d'appliquerDateChoisieFormulaire (formulaires-communs.js), qui notait déjà
     "un chantier séparé à faire" pour ces 2 types. Ce chemin-ci travaille en
     vraies dates ISO, directement sur la table, "serveur d'abord" comme les
     séries (gerer-serie/enregistrer-serie) : suppression des lignes de la
     tâche d'origine, insertion de la nouvelle plage, puis rechargement
     (apresEcritureSerie) — jamais une mutation de TACHES suivie d'un diff.

     Étendue RÉELLE de la tâche d'origine (lignesTacheServeur) : dans la
     grille, une tâche qui déborde de la fenêtre n'est connue que par sa
     partie visible. Sans aller chercher le reste sur le serveur, la déplacer
     ou la modifier depuis une seule semaine laisserait l'autre morceau
     orphelin. On repart donc des demi-journées visibles et on prolonge, de
     part et d'autre, tant que la demi-journée voisine (jours ouvrés) porte
     une ligne identique (même texte, même type tâche/absence, même
     chantier) — la même règle que la fusion des bulles
     (construireVueDepuisCache), qui aurait affiché ces lignes comme une
     seule bulle si elles avaient toutes été à l'écran. Prolongation tentée
     seulement du côté où la partie visible touche le bord de la fenêtre :
     une bulle qui s'arrête au milieu de l'écran s'arrête vraiment là.
     ============================================================ */
  function cleSlot_(s) { return s.date + "|" + s.demi; }
  // Demi-journée voisine (sens +1/-1), en sautant samedi/dimanche comme les
  // flèches du formulaire (isoJourOuvreVoisin) et la fusion des bulles.
  function slotVoisin_(s, sens) {
    if (sens > 0) return s.demi === "matin" ? { date: s.date, demi: "aprem" } : { date: isoJourOuvreVoisin(s.date, 1), demi: "matin" };
    return s.demi === "aprem" ? { date: s.date, demi: "matin" } : { date: isoJourOuvreVoisin(s.date, -1), demi: "aprem" };
  }
  // Demi-journées couvertes par une plage en dates réelles — même règle de
  // bord que demisOccupeesTache (grille-rendu.js), transposée des gi aux
  // dates : sur plusieurs jours, demiDebut "aprem" n'occupe que l'après-midi
  // du 1er jour et demiFin "matin" que le matin du dernier ; tout autre jour
  // est entier. Jours ouvrés seulement (sauf une borne posée elle-même un
  // week-end, gardée telle quelle).
  function slotsPlageTacheIso(isoDebut, isoFin, demiDebut, demiFin) {
    var jours = [isoDebut];
    var d = isoDebut;
    while (d < isoFin) { d = isoJourOuvreVoisin(d, 1); if (d > isoFin) break; jours.push(d); }
    if (jours[jours.length - 1] !== isoFin) jours.push(isoFin);
    var out = [];
    jours.forEach(function (j, i) {
      var demis;
      if (jours.length === 1) {
        if (demiDebut && demiDebut === demiFin) demis = [demiDebut];
        else if (demiDebut === "aprem") demis = ["aprem"];
        else if (demiFin === "matin") demis = ["matin"];
        else demis = ["matin", "aprem"];
      } else if (i === 0) demis = demiDebut === "aprem" ? ["aprem"] : ["matin", "aprem"];
      else if (i === jours.length - 1) demis = demiFin === "matin" ? ["matin"] : ["matin", "aprem"];
      else demis = ["matin", "aprem"];
      demis.forEach(function (dm) { out.push({ date: j, demi: dm }); });
    });
    return out;
  }
  function slotsVisiblesItem_(it) {
    var out = [];
    for (var gi = it.giDebut; gi < it.giDebut + it.duree; gi++) {
      var iso = isoDeGi(gi);
      if (!iso) continue;
      demisOccupeesTache(it, gi).forEach(function (dm) { out.push({ date: iso, demi: dm }); });
    }
    return out;
  }
  function chantierIdDeNom_(nom) { return nom ? ((etat.chantierParNom[nom] && etat.chantierParNom[nom].ligne) || null) : null; }
  function decalerIsoJours_(iso, n) { var d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoDeDate(d); }
  // Lignes serveur de la tâche `it` (partie visible + prolongements hors
  // fenêtre, cf. commentaire de section). Résout un tableau de lignes
  // {id, date, demi, ...} ; `debordeFenetre` indique si au moins une est
  // hors de la fenêtre chargée. Recherche plafonnée à 10 semaines de part et
  // d'autre (une tâche plus longue que ça au-delà de l'écran resterait
  // tronquée — cas jugé irréaliste pour un planning de chantier).
  // La partie visible de `it` occupe-t-elle la toute première (lundi matin)
  // ou la toute dernière (vendredi après-midi) demi-journée de la fenêtre ?
  // Sinon, elle ne peut pas continuer au-delà : pas besoin d'interroger le
  // serveur (cf. ouvrirEdition, debordementOrigine).
  function bordsTouchesFenetre_(it) {
    var seeds = slotsVisiblesItem_(it), n = nbJoursAffiches();
    if (!seeds.length) return { avant: false, apres: false, seeds: seeds };
    return {
      avant: cleSlot_(seeds[0]) === cleSlot_({ date: isoDeGi(0), demi: "matin" }),
      apres: cleSlot_(seeds[seeds.length - 1]) === cleSlot_({ date: isoDeGi(n - 1), demi: "aprem" }),
      seeds: seeds
    };
  }
  function toucheBordFenetre(it) { var b = bordsTouchesFenetre_(it); return b.avant || b.apres; }
  function lignesTacheServeur(it) {
    var bords = bordsTouchesFenetre_(it), seeds = bords.seeds;
    if (!seeds.length) return Promise.resolve({ lignes: [], debordeFenetre: false });
    var n = nbJoursAffiches();
    var prolongerAvant = bords.avant, prolongerApres = bords.apres;
    var absence = it.type === "absence", chantierId = chantierIdDeNom_(it.chantier);
    return sbClient.from("taches").select("id, date, demi, ordre, texte, est_absence, chantier_id")
      .eq("personne_id", ancreDe(it.personneId)).eq("texte", it.texte)
      .gte("date", decalerIsoJours_(seeds[0].date, -70)).lte("date", decalerIsoJours_(seeds[seeds.length - 1].date, 70))
      .then(function (res) {
        if (res.error) throw res.error;
        var parSlot = {};
        (res.data || []).filter(function (r) {
          return !!r.est_absence === absence && (r.chantier_id || null) === chantierId;
        }).sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); }).forEach(function (r) {
          (parSlot[r.date + "|" + r.demi] = parSlot[r.date + "|" + r.demi] || []).push(r);
        });
        var prises = {}, out = [];
        function prendre(s) {
          var liste = parSlot[cleSlot_(s)] || [];
          for (var i = 0; i < liste.length; i++) if (!prises[liste[i].id]) { prises[liste[i].id] = true; out.push(liste[i]); return true; }
          return false;
        }
        seeds.forEach(prendre);
        var s;
        if (prolongerAvant) { s = seeds[0]; while (prendre(s = slotVoisin_(s, -1))) { /* prolonge */ } }
        if (prolongerApres) { s = seeds[seeds.length - 1]; while (prendre(s = slotVoisin_(s, 1))) { /* prolonge */ } }
        var debut = isoDeGi(0), fin = isoDeGi(n - 1);
        return { lignes: out, debordeFenetre: out.some(function (r) { return r.date < debut || r.date > fin; }) };
      });
  }
  // Écrit une tâche/absence en vraies dates : supprime d'abord les lignes
  // `idsASupprimer` (la tâche d'origine, cf. lignesTacheServeur), puis
  // ajoute une ligne par demi-journée de `slots`, EN BOUT de la case (ordre =
  // max existant + 1) pour ne jamais écraser ni réordonner les autres tâches
  // déjà posées ce jour-là — contrairement à enregistrerCellulePersonneServeur,
  // qui réécrit la case entière depuis l'état complet connu de la grille
  // (état qu'on n'a justement pas hors de la fenêtre). serie_id toujours null :
  // une occurrence de série déplacée hors de la fenêtre en est détachée
  // (gerer-serie ne sait pas déplacer une occurrence, cf. ouvrirEdition).
  function enregistrerTacheEnDatesServeur(personneId, idsASupprimer, slots, champs) {
    var chaine = idsASupprimer.length
      ? sbClient.from("taches").delete().in("id", idsASupprimer).then(function (res) { if (res.error) throw res.error; })
      : Promise.resolve();
    if (!slots.length) return chaine;
    var dates = slots.map(function (s) { return s.date; }).sort();
    return chaine.then(function () {
      return sbClient.from("taches").select("date, demi, ordre").eq("personne_id", personneId).gte("date", dates[0]).lte("date", dates[dates.length - 1]);
    }).then(function (res) {
      if (res.error) throw res.error;
      var ordreMax = {};
      (res.data || []).forEach(function (r) {
        var k = r.date + "|" + r.demi;
        ordreMax[k] = Math.max(ordreMax[k] == null ? -1 : ordreMax[k], r.ordre || 0);
      });
      var chantierId = chantierIdDeNom_(champs.chantier);
      var lignes = slots.map(function (s) {
        var k = cleSlot_(s);
        var ligne = {
          personne_id: personneId, date: s.date, demi: s.demi, ordre: (ordreMax[k] == null ? -1 : ordreMax[k]) + 1,
          texte: champs.texte, statut_id: champs.statut ? (etat.statutIdParCle[champs.statut] || null) : null,
          important: !!champs.important, serie_id: null, est_absence: !!champs.absence
        };
        if (chantierId) ligne.chantier_id = chantierId;
        return ligne;
      });
      return sbClient.from("taches").insert(lignes);
    }).then(function (res) { if (res && res.error) throw res.error; });
  }

