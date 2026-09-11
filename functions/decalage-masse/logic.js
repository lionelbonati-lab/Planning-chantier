/**
 * decalage-masse — logique pure (sans Supabase, sans Deno).
 *
 * Port de calculerPlanDecalage_/apiApercuDecalage/apiAppliquerDecalage
 * (WebApp.gs) vers le nouveau schéma relationnel. Une seule fonction serveur
 * ici (action = 'apercu' | 'appliquer'), comme gerer-serie : les deux
 * actions REFONT LE MÊME CALCUL depuis un état frais de la base à chaque
 * appel (jamais de confiance en un plan mis en cache côté client, cf.
 * calculerPlanDecalage — même principe que l'ancien code, "toujours
 * revalider contre l'état réel de la feuille").
 *
 * Simplification de fond permise par le nouveau schéma (à mettre au crédit
 * du modèle une-ligne-par-date, pas un choix pris ici) : l'ancien code devait
 * construire la liste ORDONNÉE de toutes les colonnes "jour ouvré" de la
 * feuille entière (colonnesJoursOuvres_) pour décaler un INDEX dans cette
 * liste, et devait créer des semaines à la volée quand le décalage dépassait
 * la dernière colonne existante ("en attente", ~30 lignes dans l'ancien
 * code). Ici, une case est déjà une vraie date : décaler = calculer la date à
 * N jours ouvrés de distance (decalerJourOuvre ci-dessous), indépendamment
 * pour chaque case — plus besoin de connaître "la largeur de la feuille", eT
 * donc plus de notion de semaines à créer d'avance.
 *
 * Jalons/notes/définitions de série restent HORS SCOPE (comme l'ancien
 * code) : seules les tables `taches`/`assignations` sont concernées. Le
 * contenu déjà posé par une série (une ligne `taches` avec un serie_id) est
 * une case comme une autre et PEUT être décalée — seule la définition de la
 * série elle-même (table `series`) n'est jamais touchée ; fidèle à l'ancien
 * commentaire ("les récurrences n'ont besoin d'aucun traitement particulier").
 *
 * Convention du projet (cf. test_decalage_masse.js) : chaque fonction est
 * extraite du VRAI fichier source par regex+équilibrage d'accolades, jamais
 * copiée — d'où `function nom(...)` sans export inline, export en bloc à la
 * toute fin.
 */
'use strict';

function dateUTC(dateIso) {
  var p = String(dateIso || "").split("-");
  if (p.length !== 3) throw new Error("Date invalide.");
  var d = new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)));
  if (isNaN(d.getTime())) throw new Error("Date invalide.");
  return d;
}

// Samedi/dimanche ignorés (même convention que joursOuvresDeLaPlage,
// enregistrer-plage/logic.js) — un jour férié compte comme un jour ouvré
// normal, fidèle à l'ancien colonnesJoursOuvres_ ("un jour férié compte comme
// un jour ouvré normal, rien sur les fériés").
function estJourOuvre(dateIso) {
  var jourSemaine = dateUTC(dateIso).getUTCDay();
  return jourSemaine !== 0 && jourSemaine !== 6;
}

// Avance/recule dateIso de |pas| jours OUVRÉS dans le sens de son signe.
// Contrairement à l'ancien code (un index dans une liste de colonnes déjà
// construite pour toute la feuille), chaque case se décale ici indépendamment
// par rapport à SA PROPRE date — même résultat final, sans avoir besoin de
// connaître "toutes les colonnes jour ouvré" au préalable.
function decalerJourOuvre(dateIso, pas) {
  var d = dateUTC(dateIso);
  var dir = pas < 0 ? -1 : 1;
  var restant = Math.abs(pas);
  while (restant > 0) {
    d.setUTCDate(d.getUTCDate() + dir);
    var jourSemaine = d.getUTCDay();
    if (jourSemaine !== 0 && jourSemaine !== 6) restant--;
  }
  return d.toISOString().slice(0, 10);
}

function cleCase(personneId, date, demi) { return personneId + "|" + date + "|" + demi; }

// Une "case" (personne, date, demi) est vide si elle n'a ni tâche ni
// assignation — jumeau de l'ancien celluleVide_ (!chantier && aucune tâche),
// généralisé à plusieurs assignations possibles (cf. §4 de
// MIGRATION-GITHUB-PLAN.md, plusieurs chantiers sur une même demi-journée).
function celluleVide(c) {
  return (!c || !c.taches || c.taches.length === 0) && (!c || !c.assignations || c.assignations.length === 0);
}

// Fusionne le contenu qui ARRIVE (source) dans une case déjà occupée
// (destination), sans jamais rien perdre côté destination — jumeau de
// l'ancien fusionnerCellulesServeur_ : tâches combinées sans doublon exact
// (comparaison sur le texte seul, comme l'ancien code). Chantier(s) : la
// destination garde TOUJOURS les siens si elle en avait déjà au moins un —
// reprise à l'identique de l'ancien "existant.chantier || venant.chantier"
// (une seule valeur possible côté ancien classeur, donc déjà-là = gagnant,
// jamais fusionné) ; les chantiers du source ne sont repris QUE si la
// destination n'en avait encore aucun. Ce n'est PAS le lieu d'anticiper
// l'affichage de plusieurs chantiers (point encore ouvert, §8 du plan).
function fusionnerCellules(destination, source) {
  var taches = ((destination && destination.taches) || []).slice();
  ((source && source.taches) || []).forEach(function (t) {
    var dejaLa = taches.some(function (u) { return u.texte === t.texte; });
    if (!dejaLa) taches.push(t);
  });
  var assignationsDestination = (destination && destination.assignations) || [];
  var assignations = assignationsDestination.length > 0
    ? assignationsDestination.slice()
    : ((source && source.assignations) || []).slice();
  return { taches: taches, assignations: assignations };
}

// ============================================================
// calculerPlanDecalage — le cœur métier, PARTAGÉ par l'aperçu et
// l'application (même fonction, jamais deux calculs qui pourraient
// diverger — fidèle à l'ancien calculerPlanDecalage_). Fonction PURE.
//
// params = { personneIds: [id...] (déjà résolus par index.ts selon la
//            portée — 'ligne' : [ancre] ; 'tous' : tous les id personnes),
//            dateDepartIso, sens: 'avancer'|'reculer', nJours }
// sourcesCandidates = [{ personneId, date, demi }, ...] — cases NON VIDES
//   trouvées par index.ts à partir de dateDepartIso (bornes ouvertes vers le
//   futur, jamais de plafond — contrairement à l'ancien code qui s'arrêtait à
//   la dernière colonne existante).
// cellesParCle = { "personneId|date|demi": { taches, assignations } } — TOUT
//   ce qui a été lu par index.ts, sources ET destinations (y compris des
//   dates AVANT dateDepartIso quand sens = 'reculer', nécessaires pour
//   détecter un conflit à une destination antérieure au point de départ,
//   même fenêtre de lecture élargie que l'ancien iMin/cDebut).
// aujourdhuiIso : date du jour (reculer au-delà d'aujourd'hui = impossible,
//   comme l'ancien code — jamais de restriction équivalente pour avancer).
// ============================================================
function calculerPlanDecalage(params, sourcesCandidates, cellesParCle, aujourdhuiIso) {
  if (!params.personneIds || params.personneIds.length === 0) {
    throw new Error("Personne à décaler — la portée choisie est vide.");
  }
  if (!estJourOuvre(params.dateDepartIso)) throw new Error("Jour de départ invalide.");
  var n = parseInt(params.nJours, 10);
  if (!n || n < 1) throw new Error("Nombre de jours invalide.");
  var pas = (params.sens === "reculer") ? -n : n;

  var simples = [], conflits = [], impossibles = [];

  sourcesCandidates.forEach(function (s) {
    var source = cellesParCle[cleCase(s.personneId, s.date, s.demi)] || { taches: [], assignations: [] };
    if (celluleVide(source)) return; // défensif : sourcesCandidates ne devrait déjà contenir que du non-vide

    var dateDest = decalerJourOuvre(s.date, pas);
    if (pas < 0 && dateDest < aujourdhuiIso) {
      impossibles.push({ personneId: s.personneId, demi: s.demi, dateSource: s.date });
      return;
    }

    var dest = cellesParCle[cleCase(s.personneId, dateDest, s.demi)] || { taches: [], assignations: [] };
    var entree = { id: cleCase(s.personneId, s.date, s.demi), personneId: s.personneId, demi: s.demi, dateSource: s.date, dateDest: dateDest, source: source };
    if (celluleVide(dest)) {
      simples.push(entree);
    } else {
      entree.dest = dest;
      conflits.push(entree);
    }
  });

  return { simples: simples, conflits: conflits, impossibles: impossibles };
}

// Opérations DB pour déplacer UNE case (entree) vers sa destination, avec le
// contenu FINAL désiré à cette destination (contenuDest). Marche pour les 3
// cas (simple, écraser, ajouter) — seul contenuDest change d'un cas à
// l'autre, cf. construireOpsDecalage. Ordre des opérations : la destination
// est ÉCRITE EN PREMIER (le nouveau contenu inséré avant que l'ancien
// contenu de la destination et de la source ne soient effacés) — en cas
// d'échec en cours de route, on risque au pire un doublon transitoire,
// jamais une perte du contenu déplacé (même intention que l'ancien code,
// "destination d'abord, source vidée seulement une fois cette 1re écriture
// faite", adaptée à plusieurs opérations non-transactionnelles au lieu d'un
// seul setValues() atomique).
function opsPourDeplacement(entree, contenuDest) {
  var ops = [];
  contenuDest.taches.forEach(function (t, i) {
    ops.push({
      type: "insert", table: "taches",
      personne_id: entree.personneId, date: entree.dateDest, demi: entree.demi, ordre: i,
      texte: t.texte, statut_id: t.statut_id || null, important: !!t.important, serie_id: t.serie_id || null,
    });
  });
  contenuDest.assignations.forEach(function (a) {
    ops.push({ type: "insert", table: "assignations", personne_id: entree.personneId, date: entree.dateDest, demi: entree.demi, chantier_id: a.chantier_id });
  });
  ((entree.dest && entree.dest.taches) || []).forEach(function (t) { ops.push({ type: "delete", table: "taches", id: t.id }); });
  ((entree.dest && entree.dest.assignations) || []).forEach(function (a) { ops.push({ type: "delete", table: "assignations", id: a.id }); });
  entree.source.taches.forEach(function (t) { ops.push({ type: "delete", table: "taches", id: t.id }); });
  entree.source.assignations.forEach(function (a) { ops.push({ type: "delete", table: "assignations", id: a.id }); });
  return ops;
}

// resolutions = { [id]: "ecraser"|"ajouter" } — un id ABSENT (ou une valeur
// différente) est traité comme "ne rien faire" (défaut le plus sûr), comme
// l'ancien code.
function construireOpsDecalage(plan, resolutions) {
  var res = resolutions || {};
  var ops = [];
  var deplaces = 0, ecrases = 0, ajoutes = 0, ignores = plan.impossibles.length;

  plan.simples.forEach(function (e) {
    ops = ops.concat(opsPourDeplacement(e, e.source));
    deplaces++;
  });

  plan.conflits.forEach(function (e) {
    var choix = res[e.id];
    if (choix === "ecraser") {
      ops = ops.concat(opsPourDeplacement(e, e.source));
      ecrases++;
    } else if (choix === "ajouter") {
      ops = ops.concat(opsPourDeplacement(e, fusionnerCellules(e.dest, e.source)));
      ajoutes++;
    } else {
      ignores++; // "ne rien faire" (défaut) : ni source ni destination touchées
    }
  });

  return { ops: ops, deplaces: deplaces, ecrases: ecrases, ajoutes: ajoutes, ignores: ignores };
}

export {
  estJourOuvre,
  decalerJourOuvre,
  cleCase,
  celluleVide,
  fusionnerCellules,
  calculerPlanDecalage,
  opsPourDeplacement,
  construireOpsDecalage,
};
