/**
 * gerer-serie — logique pure (sans Supabase, sans Deno).
 *
 * Port de apiModifierSerie ET apiSupprimerSerie (WebApp.gs) : les deux
 * actions partagent tout leur cœur dans l'ancien code (une seule fonction
 * privée traiterOccurrencesSerie_, transformer différent selon le cas), donc
 * regroupées ici aussi, comme une seule fonction serveur prenant une action
 * ('modifier' | 'supprimer'), plutôt que deux Edge Functions quasi
 * identiques à maintenir séparément.
 *
 * Simplification de fond permise par le nouveau schéma (à mettre au crédit
 * de la table `series`/`serie_id`, pas un choix pris ici) : l'ancien code
 * devait PARCOURIR chaque semaine de la feuille, décoder chaque case, et
 * filtrer à la main les lignes taguées [Série:xxxxxx] dans la portée voulue
 * (semainesACriblePourSerie_/occurrenceEstDansPortee_, ~90 lignes). Ici, une
 * occurrence est une ligne de table avec une vraie colonne serie_id et une
 * vraie colonne date : la "portée" (unique/suivant/serie) devient un simple
 * filtre SQL (`date = X` / `date >= X` / pas de filtre), posé par index.ts
 * AVANT d'appeler les fonctions pures ci-dessous — qui n'ont donc plus à
 * connaître ni la portée ni la date de référence, seulement la liste déjà
 * filtrée des lignes à traiter.
 *
 * Convention du projet (cf. test_gerer_serie.js) : chaque fonction est
 * extraite du VRAI fichier source par regex+équilibrage d'accolades, jamais
 * copiée — d'où `function nom(...)` sans export inline, export en bloc à la
 * toute fin.
 */
'use strict';

// action = 'supprimer' : chaque ligne matchée (déjà filtrée par portée+
// serie_id côté index.ts) est retirée.
function planSupprimerSerie(table, lignes) {
  return { ops: lignes.map(function (l) { return { type: "delete", table: table, id: l.id }; }) };
}

// action = 'modifier' : modifs = { texte?, statutId?, important?, chantierId? }
// (undefined = inchangé, comme l'ancien code). Chaque ligne matchée reçoit
// les champs fournis ; si le texte fourni est vide une fois trimé, la ligne
// est SUPPRIMÉE plutôt que mise à jour avec un texte vide (traduction fidèle
// de l'ancien comportement : une case de feuille vidée équivaut à "plus rien
// ici", ce qui devient "pas de ligne" dans une vraie table plutôt qu'une
// ligne avec un texte vide qui ne voudrait rien dire).
//
// statutId : uniquement pour `table === 'taches'` — jalons/notes n'ont pas
// cette colonne (sql/0001_schema.sql), cohérent avec le comportement réel de
// l'ancien code (encoderNotesJour_ supprimait déjà le champ "statut" à
// l'écriture d'une note ; un jalon n'a jamais eu de colonne dédiée non plus).
//
// chantierId : remplacement intégral (jamais un ajout) de l'assignation du
// jour, sur CHAQUE (personne, date, demi) parmi les lignes matchées — même
// sémantique que l'ancien code ("écrasé sur chaque jour où au moins une
// tâche de cette série a été effectivement touchée"), étendue ici à TOUS les
// jours, week-end compris : l'ancienne exception "jamais le week-end" était
// un contournement de la cellule fusionnée du classeur (cf. §3 de
// MIGRATION-GITHUB-PLAN.md), qui n'a plus lieu d'être avec une vraie ligne
// par date — n'a de sens que pour `table === 'taches'`.
function planModifierSerie(table, lignes, modifs) {
  var ops = [];
  var texteFourni = modifs && modifs.texte !== undefined;
  var texteTrim = texteFourni ? String(modifs.texte == null ? "" : modifs.texte).trim() : null;
  var importantFourni = modifs && modifs.important !== undefined;
  var statutFourni = table === "taches" && modifs && modifs.statutId !== undefined;

  lignes.forEach(function (l) {
    if (texteFourni && texteTrim === "") {
      ops.push({ type: "delete", table: table, id: l.id });
      return;
    }
    var champs = {};
    if (texteFourni) champs.texte = texteTrim;
    if (importantFourni) champs.important = !!modifs.important;
    if (statutFourni) champs.statut_id = modifs.statutId || null;
    if (Object.keys(champs).length === 0) return; // rien à changer sur cette ligne
    ops.push({ type: "update", table: table, id: l.id, champs: champs });
  });

  if (table === "taches" && modifs && modifs.chantierId !== undefined && modifs.chantierId !== null) {
    var vues = {};
    lignes.forEach(function (l) {
      vues[l.personne_id + "|" + l.date + "|" + l.demi] = { personne_id: l.personne_id, date: l.date, demi: l.demi };
    });
    Object.keys(vues).forEach(function (cle) {
      var v = vues[cle];
      ops.push({ type: "replace_assignation", personne_id: v.personne_id, date: v.date, demi: v.demi, chantier_id: modifs.chantierId });
    });
  }

  return { ops: ops };
}

export {
  planSupprimerSerie,
  planModifierSerie,
};
