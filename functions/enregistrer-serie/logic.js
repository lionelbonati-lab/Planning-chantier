/**
 * enregistrer-serie — logique pure (sans Supabase, sans Deno).
 *
 * Port de apiEnregistrerSerie (WebApp.gs) vers le nouveau schéma relationnel
 * (§3 de MIGRATION-GITHUB-PLAN.md). Différence de fond avec l'ancien code :
 * là où une série n'existait AVANT nulle part en tant que telle (juste un id
 * aléatoire de 6 caractères posé en tag [Série:xxxxxx] sur chaque case
 * générée, sans qu'aucune des paramètres de génération — fréquence, date de
 * fin... — ne soit jamais conservée), la table `series` (sql/0001_schema.sql)
 * garde maintenant cette définition. Deux temps distincts, comme dans
 * apiEnregistrerSerie d'origine : d'abord générer les dates et VALIDER la
 * définition (ici, tout se fait sans toucher à la base), puis écrire une
 * ligne série + une occurrence par date (ça, c'est index.ts, avec le vrai id
 * de série auto-incrémenté par Postgres une fois la ligne insérée).
 *
 * Simplifications qui tombent d'elles-mêmes avec le nouveau modèle (déjà
 * documentées §3/§4 du plan, pas des choix nouveaux pris ici) :
 *  - Plus de notion de "semaine à créer d'avance" (SERIE_MAX_SEMAINES_CREEES
 *    de l'ancien code) : une occurrence, c'est une ligne insérée à une vraie
 *    date, jamais une case de feuille qu'il faut d'abord faire exister.
 *  - Le week-end n'a plus de traitement à part (ancien
 *    ecrireOccurrenceSerie_ : cellule fusionnée Sam+Dim, tag [S]/[D], pas de
 *    demi-journée propre) : samedi et dimanche sont des dates normales,
 *    traitées exactement comme un jour de semaine.
 *
 * Convention du projet (cf. test_enregistrer_serie.js) : chaque fonction est
 * extraite du VRAI fichier source par regex+équilibrage d'accolades, jamais
 * copiée — d'où `function nom(...)` sans export inline, export en bloc à la
 * toute fin.
 */
'use strict';

// Borne défensive (identique à l'ancien MAX_OCCURRENCES_SERIE) : une série
// mal définie (ex. fin par date très lointaine avec fréquence "jour") ne doit
// jamais générer un nombre d'occurrences absurde.
var MAX_OCCURRENCES_SERIE = 366;

// Une occurrence, "index" pas de la définition, en ISO yyyy-mm-dd. Dates
// calculées en UTC (comme le reste des fonctions serveur de ce projet,
// cf. enregistrer-plage/logic.js) — pas de fuseau "du script" ici contrairement
// à l'ancien dateDepuisIso_ (Apps Script), Deno n'en a pas d'équivalent fiable.
function pasCalendaire(dateDebutIso, frequence, intervalle, index) {
  var p = String(dateDebutIso || "").split("-");
  if (p.length !== 3) throw new Error("Date de départ de série invalide.");
  var d = new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)));
  if (isNaN(d.getTime())) throw new Error("Date de départ de série invalide.");
  var n = (parseInt(intervalle, 10) || 1) * index;
  if (frequence === "jour") d.setUTCDate(d.getUTCDate() + n);
  else if (frequence === "semaine") d.setUTCDate(d.getUTCDate() + n * 7);
  // "mois"/"annee" : débordement de fin de mois natif à JS (ex. 31 janvier +
  // 1 mois déborde sur début mars si février n'a pas 31 jours) — assumé tel
  // quel, même comportement que l'ancien code (setMonth/setFullYear JS).
  else if (frequence === "mois") d.setUTCMonth(d.getUTCMonth() + n);
  else if (frequence === "annee") d.setUTCFullYear(d.getUTCFullYear() + n);
  else throw new Error("Fréquence de série invalide.");
  return d.toISOString().slice(0, 10);
}

// Jours OUVRÉS (lun-ven) à partir d'une date ISO ancre, en comptant `duree`
// jours — round du 15.09.2026, bug Lionel : « si je sélectionne 2 case ou
// plus, la bulle vient uniquement dans la première case de chaque
// répétition ». Une case de tâche ne peut jamais être sélectionnée à
// cheval sur le week-end (le glissé s'arrête net dès qu'il atteint la
// colonne week-end, cf. Index.html : cablerAjoutCellule/estGiWeekend), donc
// la largeur d'une plage de tâche se compte toujours en jours OUVRÉS —
// même principe que joursOuvresDeLaPlage (enregistrer-plage/logic.js), mais
// borné par un COMPTE de jours plutôt que par une date de fin : une série ne
// connaît que la durée de la sélection d'origine, jamais sa date de fin
// exacte (qui change à chaque occurrence re-ancrée par pasCalendaire
// ci-dessous). Le 1er jour est toujours inclus tel quel, même s'il tombe
// exceptionnellement un week-end (une occurrence de série PEUT retomber un
// samedi/dimanche, cf. commentaire de tête de fichier — seul le RESTE de la
// plage saute alors le week-end suivant).
function joursOuvresDepuisCompte(dateDebutIso, duree) {
  var p = String(dateDebutIso || "").split("-");
  var d = new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)));
  var jours = [d.toISOString().slice(0, 10)];
  var restants = Math.max(1, parseInt(duree, 10) || 1) - 1;
  while (restants > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    var jourSemaine = d.getUTCDay(); // 0 = dimanche, 6 = samedi
    if (jourSemaine === 0 || jourSemaine === 6) continue;
    jours.push(d.toISOString().slice(0, 10));
    restants--;
  }
  return jours;
}

// Demi-journée(s) occupée(s) par le jour d'index `index` (sur `total`, le
// nombre de jours OUVRÉS de CETTE occurrence, cf. joursOuvresDepuisCompte)
// d'une plage de TÂCHE en série — même règle de bord que demisOccupeesTache
// (Index.html) : seuls le 1er et le dernier jour d'une plage de PLUSIEURS
// jours peuvent porter une vraie demi-journée (le reste, y compris tout
// jour du milieu, reste une journée entière, donc les 2 demis). `demiRepli`
// : compatibilité avec l'ancien appel à 1 seule demi (cible_demi) — utilisé
// UNIQUEMENT si demiDebut ET demiFin ne sont même pas fournis à l'appel
// (undefined, pas juste `null`, qui lui signifie explicitement "journée
// entière") ; jamais le cas depuis Index.html (qui envoie toujours les 2
// explicitement, cf. creerSerieServeur), mais reste le comportement de
// test_enregistrer_serie.js pour tout appel direct qui ne les fournit pas.
function demisTacheParJour(index, total, demiDebut, demiFin, demiRepli) {
  if (total <= 1) {
    if (demiDebut === undefined && demiFin === undefined) return [demiRepli];
    var demiUnique = demiDebut || demiFin || null;
    return demiUnique ? [demiUnique] : ["matin", "aprem"];
  }
  if (index === 0) return demiDebut === "aprem" ? ["aprem"] : ["matin", "aprem"];
  if (index === total - 1) return demiFin === "matin" ? ["matin"] : ["matin", "aprem"];
  return ["matin", "aprem"];
}

// Même règle de bord que demisTacheParJour ci-dessus, mais pour un JALON ou
// une NOTE (une seule ligne par jour, colonne `demi` nullable = journée
// entière au lieu de 2 lignes matin+aprem) — reprend exactement
// demiPourJourDePlage (enregistrer-plage/logic.js), adaptée à un index de
// jour plutôt qu'à 2 dates de bord (une série ne connaît que la durée de la
// sélection d'origine, pas ses 2 dates de bord — qui changent à chaque
// occurrence re-ancrée).
function demiJalonNoteParJour(index, total, demiDebut, demiFin) {
  if (total <= 1) return (demiDebut !== undefined || demiFin !== undefined) ? (demiDebut || demiFin || null) : null;
  if (index === 0) return demiDebut || null;
  if (index === total - 1) return demiFin || null;
  return null;
}

// Développe la définition d'une série en tableau de dates ISO, borné à
// MAX_OCCURRENCES_SERIE.
function genererDatesSerie(dateDebutIso, frequence, intervalle, finType, finValeur) {
  var dates = [];
  if (finType === "occurrences") {
    var total = Math.max(1, Math.min(parseInt(finValeur, 10) || 1, MAX_OCCURRENCES_SERIE));
    for (var i = 0; i < total; i++) dates.push(pasCalendaire(dateDebutIso, frequence, intervalle, i));
  } else if (finType === "date") {
    var finIso = String(finValeur || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(finIso)) throw new Error("Date de fin de série invalide.");
    for (var j = 0; j < MAX_OCCURRENCES_SERIE; j++) {
      var iso = pasCalendaire(dateDebutIso, frequence, intervalle, j);
      if (iso > finIso) break;
      dates.push(iso);
    }
  } else {
    throw new Error("Type de fin de série invalide.");
  }
  if (dates.length === 0) throw new Error("Cette définition de série ne produit aucune occurrence.");
  return dates;
}

// Valide le payload et construit les champs de la future ligne `series`
// (sans id — Postgres l'attribue à l'insertion, cf. index.ts). Ordre des
// vérifications repris tel quel de l'ancien apiEnregistrerSerie : type,
// texte, puis ancre (désormais personneId) pour une série de tâche.
function champsSerie(payload) {
  var type = String((payload && payload.type) || "");
  if (["tache", "jalon", "note"].indexOf(type) === -1) throw new Error("Type de série invalide.");
  var texteTrim = String(payload.texte == null ? "" : payload.texte).trim();
  if (texteTrim === "") throw new Error("Écris un texte.");
  var estTache = type === "tache";
  if (estTache && !payload.personneId) throw new Error("Choisis une case.");

  return {
    type: type,
    cible_personne_id: estTache ? payload.personneId : null,
    cible_demi: estTache ? ((payload.demi === "aprem") ? "aprem" : "matin") : null,
    texte: texteTrim,
    // Un jalon/une note n'a pas de statut (la table jalons/notes n'a même
    // pas cette colonne, cf. sql/0001_schema.sql) : cohérent avec le
    // comportement RÉEL de l'ancien code (decoderNotesJour_/encoderNotesJour_
    // supprimaient déjà le champ "statut" pour une note à l'écriture ; une
    // note ligne 4/5 n'a jamais eu de colonne dédiée pour ça non plus).
    statut_id: estTache ? (payload.statutId || null) : null,
    important: !!payload.important,
    chantier_id: estTache ? (payload.chantierId || null) : null,
    date_debut: String(payload.dateDebutIso || "").trim(),
    frequence: String(payload.frequence || ""),
    intervalle: parseInt(payload.intervalle, 10) || 1,
    fin_type: String(payload.finType || ""),
    fin_valeur: String(payload.finValeur == null ? "" : payload.finValeur),
  };
}

// ============================================================
// construireOccurrencesSerie — le cœur métier. Fonction PURE : prend en
// entrée les dates déjà générées, le nouvel id de série (déjà connu — la
// ligne `series` a déjà été insérée par index.ts), et ce qui existe déjà en
// base pour la fenêtre de dates concernée (occurrences ET, pour une série de
// tâche, assignations) ; renvoie la liste des opérations à appliquer, jamais
// les opérations elles-mêmes.
//
// existantes         : lignes déjà en base dans la table cible (jalons/
//                       notes/taches) pour les dates concernées.
//   (jalon) [{ date, texte }]   (note) [{ date }]   (tache) [{ date, personne_id, demi }]
// existantesAssignations : lignes déjà en base dans `assignations`, pour la
//                       même fenêtre de dates (tache uniquement — [] sinon).
//   [{ date, personne_id, demi }]
// duree/demiDebut/demiFin (round du 15.09.2026, bug Lionel : « si je
//                       sélectionne 2 case ou plus, la bulle vient
//                       uniquement dans la première case de chaque
//                       répétition ») : largeur de la sélection D'ORIGINE
//                       (1 seule fois pour toute la série, PAS par
//                       occurrence — chaque occurrence reproduit la même
//                       largeur, réancrée à sa propre date par
//                       genererDatesSerie/pasCalendaire). `duree` en jours
//                       OUVRÉS (cf. joursOuvresDepuisCompte) ; demiDebut/
//                       demiFin "matin"|"aprem"|null, avec la même
//                       signification que côté client
//                       (bornesDepuisDemiSlots) : sur 1 seul jour (duree<=1)
//                       une vraie demi-journée UNIQUE ou (si les 2 sont
//                       null) une journée entière ; sur plusieurs jours,
//                       seuls le 1er/dernier jour peuvent être partiels,
//                       tout le reste est toujours une journée entière.
//                       Tous 3 optionnels — absents (undefined), le
//                       comportement retombe sur l'ancien (1 seule date, 1
//                       seule demi = cible_demi), cf.
//                       demisTacheParJour/demiJalonNoteParJour ci-dessus.
// ============================================================
function construireOccurrencesSerie(champs, dates, serieId, existantes, existantesAssignations, estAbsence, duree, demiDebut, demiFin) {
  var ops = [];
  var posees = 0, ignorees = 0;
  var largeur = Math.max(1, parseInt(duree, 10) || 1);

  if (champs.type === "tache") {
    var personneId = champs.cible_personne_id;
    dates.forEach(function (ancre) {
      var jours = largeur > 1 ? joursOuvresDepuisCompte(ancre, largeur) : [ancre];
      jours.forEach(function (iso, index) {
        demisTacheParJour(index, jours.length, demiDebut, demiFin, champs.cible_demi).forEach(function (demi) {
          // Toujours AJOUTÉE, jamais de remplacement ni de déduplication —
          // une série vient s'ajouter au contenu déjà présent ce jour-là,
          // comme l'ancien ecrireOccurrenceSerie_ (push() en fin de case).
          // `ordre` place la nouvelle tâche après celles déjà présentes sur
          // ce (personne, date, demi), pour un affichage stable.
          var dejaLa = existantes.filter(function (t) {
            return t.date === iso && t.personne_id === personneId && t.demi === demi;
          });
          var ligneTache = {
            type: "insert", table: "taches",
            personne_id: personneId, date: iso, demi: demi, ordre: dejaLa.length,
            texte: champs.texte, statut_id: champs.statut_id, important: champs.important,
            serie_id: serieId,
          };
          // est_absence (sql/0009_taches_est_absence.sql, round du 14.09.2026) :
          // paramètre séparé plutôt qu'un champ de `champs` — `champs` sert
          // aussi tel quel à l'insertion dans `series` (cf. index.ts), qui n'a
          // pas cette colonne. Omis quand faux : le défaut colonne (false)
          // suffit, et ça garde inchangée la forme des ops pour toute série de
          // tâche normale (cf. test_enregistrer_serie.js).
          if (estAbsence) ligneTache.est_absence = true;
          ops.push(ligneTache);
          posees++;

          // Chantier : posé une fois, JAMAIS écrasé (même règle que l'ancien
          // code — "ne recouvre jamais un chantier déjà présent"), donc ignoré
          // s'il existe déjà une assignation quelconque sur ce (personne, date,
          // demi), même posée par autre chose que cette série.
          if (champs.chantier_id) {
            var dejaAssigne = existantesAssignations.some(function (a) {
              return a.date === iso && a.personne_id === personneId && a.demi === demi;
            });
            if (!dejaAssigne) {
              ops.push({ type: "insert", table: "assignations", personne_id: personneId, date: iso, demi: demi, chantier_id: champs.chantier_id });
            }
          }
        });
      });
    });
  } else if (champs.type === "jalon") {
    dates.forEach(function (ancre) {
      var jours = largeur > 1 ? joursOuvresDepuisCompte(ancre, largeur) : [ancre];
      jours.forEach(function (iso, index) {
        // Case à VALEUR UNIQUE (comme l'ancien code) : une occurrence de série
        // n'est posée QUE si aucun jalon n'existe encore ce jour-là — jamais
        // deux jalons le même jour, jamais d'écrasement. Note : un jalon posé
        // par une série n'a jamais d'étiquette "important", fidèle au
        // comportement réel de l'ancien encoderLigneTache_({texte, serieId})
        // (le champ n'y était pas transmis pour un jalon).
        var occupe = existantes.some(function (j) { return j.date === iso; });
        if (occupe) { ignorees++; return; }
        var ligneJalon = { type: "insert", table: "jalons", date: iso, texte: champs.texte, serie_id: serieId };
        var demiIci = demiJalonNoteParJour(index, jours.length, demiDebut, demiFin);
        if (demiIci) ligneJalon.demi = demiIci;
        ops.push(ligneJalon);
        posees++;
      });
    });
  } else {
    // note : plusieurs notes indépendantes par jour restent possibles (table
    // `notes`, une ligne = une note) — une occurrence de série s'ajoute
    // toujours, sans jamais vérifier ce qui existe déjà ce jour-là (fidèle à
    // l'ancien ecrireOccurrenceSerie_, qui ne dédoublonnait pas non plus à
    // l'écriture d'une série).
    dates.forEach(function (ancre) {
      var jours = largeur > 1 ? joursOuvresDepuisCompte(ancre, largeur) : [ancre];
      jours.forEach(function (iso, index) {
        var ligneNote = { type: "insert", table: "notes", date: iso, texte: champs.texte, important: champs.important, serie_id: serieId };
        var demiIci = demiJalonNoteParJour(index, jours.length, demiDebut, demiFin);
        if (demiIci) ligneNote.demi = demiIci;
        ops.push(ligneNote);
        posees++;
      });
    });
  }

  return { ops: ops, posees: posees, ignorees: ignorees };
}

export {
  MAX_OCCURRENCES_SERIE,
  pasCalendaire,
  joursOuvresDepuisCompte,
  demisTacheParJour,
  demiJalonNoteParJour,
  genererDatesSerie,
  champsSerie,
  construireOccurrencesSerie,
};
