/**
 * enregistrer-plage — logique pure (sans Supabase, sans Deno).
 *
 * Port de apiEnregistrerPlage (WebApp.gs) vers le nouveau schéma
 * relationnel (§3 de MIGRATION-GITHUB-PLAN.md) : jalons/notes ne sont plus
 * une case de feuille par semaine mais une vraie ligne par date. Beaucoup de
 * la complexité d'origine (colMap, position de colonne, comparaison de la
 * cellule entière comme une chaîne) disparaît — ce qui reste : les règles
 * MÉTIER (jours ouvrés uniquement, mode ajout/remplacement, ne retirer que
 * l'entrée d'origine sur un jour à plusieurs notes indépendantes).
 *
 * Convention suivie par TOUS les fichiers test_*.js de ce projet : chaque
 * fonction ici est extraite du VRAI fichier source par regex+équilibrage
 * d'accolades (jamais une copie collée dans le test) — cf. test_enregistrer_plage.js.
 * D'où la déclaration `function nom(...)` sans `export` inline : l'export se
 * fait en bloc à la toute fin du fichier, pour ne pas casser ce motif
 * d'extraction (`\nfunction nom(`).
 */
'use strict';

// Jours ouvrés (lundi à vendredi) entre d1 et d2 inclus, en ISO yyyy-mm-dd.
// Jamais conscient des jours fériés — comme l'ancien code (seuls les
// week-ends sont sautés, cf. commentaire d'origine d'apiEnregistrerPlage).
function joursOuvresDeLaPlage(d1, d2) {
  var jours = [];
  var cur = new Date(d1 + "T00:00:00Z");
  var fin = new Date(d2 + "T00:00:00Z");
  while (cur.getTime() <= fin.getTime()) {
    var jourSemaine = cur.getUTCDay(); // 0 = dimanche, 6 = samedi
    if (jourSemaine !== 0 && jourSemaine !== 6) {
      jours.push(cur.toISOString().slice(0, 10));
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return jours;
}

// Reprise à l'identique de demiPourJourDePlage_ (WebApp.gs) : les jours de
// BORD d'une plage peuvent porter une demi-journée propre (matin/aprem),
// tout jour strictement à l'intérieur reste "journée entière" (null).
function demiPourJourDePlage(iso, b1, b2, demiB1, demiB2) {
  if (!b1) return null;
  if (iso === b1) return demiB1;
  if (iso === b2) return demiB2;
  return null;
}

// Lignes non vides d'un texte multi-ligne, trimées. Contrairement à
// l'ancien lignesDe_ (WebApp.gs), pas besoin de retirer un tiret "- " en
// tête : ce tiret était ajouté par tirets()/Planning_Format.gs au moment du
// reformatage de la feuille — un artefact du classeur qui n'existe plus ici.
function lignesDe(texte) {
  return String(texte == null ? "" : texte)
    .split("\n")
    .map(function (l) { return l.trim(); })
    .filter(function (l) { return l !== ""; });
}

// Remet une plage dans l'ordre si les dates sont inversées — les bords
// (demiDebut/demiFin) suivent le swap, exactement comme l'ancien code.
function normaliserPlage(dateDebut, dateFin, demiDebut, demiFin) {
  var d1 = String(dateDebut || "").trim();
  var d2 = String(dateFin || "").trim() || d1;
  if (d2 < d1) {
    return { d1: d2, d2: d1, demi1: demiFin, demi2: demiDebut };
  }
  return { d1: d1, d2: d2, demi1: demiDebut, demi2: demiFin };
}

// ============================================================
// planPlage — le cœur métier. Fonction PURE : ne touche à aucune base de
// données, prend en entrée les lignes déjà existantes pour les dates
// concernées (jalons ou notes) et renvoie la liste des opérations à
// appliquer (upsert/delete), jamais les opérations elles-mêmes. C'est
// index.ts qui lit ces lignes depuis Supabase et applique le résultat.
//
// params = { kind: 'jalon'|'note', dateDebut, dateFin, texte, important,
//            mode: 'remplacement'|'ajout', demiDebut, demiFin,
//            origine: null | { dateDebut, dateFin, texte, important,
//                               demiDebut, demiFin } }
// existantes = lignes déjà en base pour toutes les dates concernées
//   (jalon)  : [{ id, date, texte, demi }]
//   (note)   : [{ id, date, texte, important, demi }]
// ============================================================
function planPlage(params, existantes) {
  var kind = params.kind;
  if (kind !== "jalon" && kind !== "note") throw new Error("Type de case invalide.");
  var estNote = kind === "note";

  var norm = normaliserPlage(params.dateDebut, params.dateFin, params.demiDebut, params.demiFin);
  var d1 = norm.d1, d2 = norm.d2;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d1)) throw new Error("Choisis une date de début.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d2)) throw new Error("Date de fin invalide.");

  // Demi-journée propre : notes ET jalons (round du 08.09.2026, suite —
  // Lionel : "je veux que le jalon utilise aussi la demi journée, comme ça
  // toutes les bulles se comportent de la même manière"). Annule la
  // restriction précédente ("notes uniquement, jamais un jalon") : les 2
  // bords de la plage peuvent désormais porter une demi-journée pour les 2
  // types, cf. sql/0006_jalons_demi.sql.
  var demiPropreDebut = (norm.demi1 === "matin" || norm.demi1 === "aprem") ? norm.demi1 : null;
  var demiPropreFin = (norm.demi2 === "matin" || norm.demi2 === "aprem") ? norm.demi2 : null;

  var texteTrim = String(params.texte == null ? "" : params.texte).trim();
  var important = !!params.important;
  var ajout = params.mode === "ajout";
  if (ajout && texteTrim === "") throw new Error("Écris un texte.");

  // chantier_id/important d'un JALON (round du 12.09.2026 — page « Jalons »,
  // sql/0007_jalons_chantier.sql) : contrairement à une note, où l'appelant
  // (le formulaire de la fiche) envoie TOUJOURS une vraie valeur pour
  // `important`, le moteur de synchro de la grille (synchroniser(), cf.
  // Index.html) diffuse un jalon CASE PAR CASE sans jamais connaître ni son
  // chantier ni (avant ce round) une vraie valeur d'`important` — il
  // n'envoie donc PAS ces 2 champs du tout. D'où la règle : absent des
  // paramètres => on garde tel quel ce qui existait déjà sur la ligne
  // (jamais écrasé silencieusement par la grille) ; présent (la nouvelle
  // page Jalons envoie toujours les 2) => on applique la valeur demandée,
  // identique sur tous les jours de la plage. hasOwnProperty (pas juste
  // "!= null") car `chantierId: null` doit pouvoir signifier "retirer le
  // chantier", une valeur volontaire à distinguer de "champ absent".
  var jalonImportantFourni = !estNote && Object.prototype.hasOwnProperty.call(params, "important");
  var jalonChantierIdFourni = !estNote && Object.prototype.hasOwnProperty.call(params, "chantierId");
  var jalonChantierIdVoulu = jalonChantierIdFourni ? (params.chantierId || null) : null;

  var origine = params.origine || null;
  var oNorm = origine ? normaliserPlage(origine.dateDebut, origine.dateFin, origine.demiDebut, origine.demiFin) : null;
  var o1 = oNorm ? oNorm.d1 : null;
  var o2 = oNorm ? oNorm.d2 : null;
  var oTexteBrut = origine ? String(origine.texte == null ? "" : origine.texte).trim() : "";
  var oImportant = origine ? !!origine.important : false;
  var oChantierId = origine && origine.chantierId != null ? origine.chantierId : null;

  var joursNouveaux = joursOuvresDeLaPlage(d1, d2);
  if (joursNouveaux.length === 0) throw new Error("Aucun jour ouvré de cette plage n'existe dans le planning.");

  var ops = [];
  var poses = 0, remplaces = 0, liberes = 0, ajoutes = 0;

  function lignesExistantesDuJour(iso) {
    return existantes.filter(function (e) { return e.date === iso; });
  }

  if (estNote) {
    // Une case peut contenir plusieurs notes indépendantes (round du
    // 28.08.2026 côté ancienne appli) — chaque entrée est maintenant sa
    // propre ligne de table, donc plus besoin de décoder/comparer une
    // cellule entière : on retire précisément l'entrée d'origine (si ce
    // jour en faisait partie), on ajoute les nouvelles lignes non déjà
    // présentes (si ce jour est dans la nouvelle plage), jour par jour.
    var joursConcernes = {};
    joursNouveaux.forEach(function (iso) { joursConcernes[iso] = true; });
    if (o1) joursOuvresDeLaPlage(o1, o2).forEach(function (iso) { joursConcernes[iso] = true; });

    Object.keys(joursConcernes).sort().forEach(function (iso) {
      var dansNouvelle = iso >= d1 && iso <= d2;
      var dansOrigine = !!(o1 && iso >= o1 && iso <= o2);
      var retireId = null;

      if (dansOrigine && oTexteBrut !== "") {
        var demiOrigineIci = demiPourJourDePlage(iso, o1, o2, oNorm.demi1, oNorm.demi2);
        var match = lignesExistantesDuJour(iso).find(function (e) {
          return e.texte === oTexteBrut && !!e.important === oImportant && (e.demi || null) === (demiOrigineIci || null);
        });
        if (match) { ops.push({ type: "delete", table: "notes", id: match.id }); retireId = match.id; }
      }

      var ajouteIci = false;
      if (dansNouvelle) {
        poses++;
        var demiIci = demiPourJourDePlage(iso, d1, d2, demiPropreDebut, demiPropreFin);
        // Le doublon se juge sur (texte + demi-journée) : "Livraison" le
        // matin et "Livraison" l'après-midi sont deux notes distinctes.
        var restantes = lignesExistantesDuJour(iso).filter(function (e) { return e.id !== retireId; });
        var dejaLa = restantes.map(function (e) { return e.texte + "|" + (e.demi || ""); });
        lignesDe(texteTrim).forEach(function (l) {
          var cle = l + "|" + (demiIci || "");
          if (dejaLa.indexOf(cle) === -1) {
            ops.push({ type: "insert", table: "notes", date: iso, texte: l, important: important, demi: demiIci });
            dejaLa.push(cle);
            ajouteIci = true;
          }
        });
      }

      if (retireId != null && ajouteIci) remplaces++;
      else if (ajouteIci) ajoutes++;
      else if (retireId != null && !dansNouvelle) liberes++;
    });
  } else {
    // Jalon : une date = au plus une ligne (texte pouvant tenir plusieurs
    // lignes) — comportement historique inchangé, cf. commentaire
    // d'apiEnregistrerPlage ("une case = un texte unique"). Round du
    // 08.09.2026 (suite) : cette ligne unique porte désormais AUSSI sa
    // propre demi-journée, avec exactement la même règle de bord que les
    // notes (demiPourJourDePlage : seuls les 2 bords de la plage peuvent en
    // porter une, tout jour du milieu reste toujours une journée entière) —
    // "au plus une ligne par jour" reste vrai, seule sa granularité change.
    var contenu = texteTrim;

    joursNouveaux.forEach(function (iso) {
      poses++;
      var demiIci = demiPourJourDePlage(iso, d1, d2, demiPropreDebut, demiPropreFin);
      var existante = lignesExistantesDuJour(iso)[0] || null;
      var ancien = existante ? String(existante.texte || "") : "";
      var ancienDemi = existante ? (existante.demi || null) : null;
      // chantier_id/important : valeur demandée si fournie par l'appelant,
      // sinon celle déjà en base est reconduite telle quelle (cf. commentaire
      // de tête de fonction) — jamais effacée par un appel qui n'en parle pas.
      var ancienImportant = existante ? !!existante.important : false;
      var ancienChantierId = existante ? (existante.chantier_id || null) : null;
      var importantIci = jalonImportantFourni ? important : ancienImportant;
      var chantierIdIci = jalonChantierIdFourni ? jalonChantierIdVoulu : ancienChantierId;

      if (ajout) {
        if (ancien === "") {
          ops.push({ type: "insert", table: "jalons", date: iso, texte: contenu, demi: demiIci, important: importantIci, chantier_id: chantierIdIci });
          ajoutes++;
          return;
        }
        var dejaLa = lignesDe(ancien);
        var aAjouter = lignesDe(contenu).filter(function (l) { return dejaLa.indexOf(l) === -1; });
        // La demi-journée de la ligne suit la valeur demandée par CET appel
        // (mode "ajout" n'a jamais eu de notion de fusion entre 2
        // demi-journées différentes sur une même ligne de texte concaténée) :
        // si le texte ne change pas ET que la demi-journée/important/chantier
        // non plus, rien à écrire.
        if (aAjouter.length === 0 && demiIci === ancienDemi && importantIci === ancienImportant && chantierIdIci === ancienChantierId) return;
        var texteMaj = aAjouter.length > 0 ? (ancien + "\n" + aAjouter.join("\n")) : ancien;
        ops.push({ type: "update", table: "jalons", id: existante.id, texte: texteMaj, demi: demiIci, important: importantIci, chantier_id: chantierIdIci });
        ajoutes++;
        return;
      }

      // Remplacement.
      if (ancien === contenu && ancienDemi === demiIci && importantIci === ancienImportant && chantierIdIci === ancienChantierId) return;
      if (contenu === "") {
        if (existante) { ops.push({ type: "delete", table: "jalons", id: existante.id }); liberes++; }
        return;
      }
      if (ancien !== "") remplaces++;
      if (existante) ops.push({ type: "update", table: "jalons", id: existante.id, texte: contenu, demi: demiIci, important: importantIci, chantier_id: chantierIdIci });
      else ops.push({ type: "insert", table: "jalons", date: iso, texte: contenu, demi: demiIci, important: importantIci, chantier_id: chantierIdIci });
    });

    // Jour sorti de la plage (présent dans l'origine, plus dans la
    // nouvelle) : on ne retire que si texte, demi-journée, important ET
    // chantier n'ont pas changé entre-temps (même garde étendue que les
    // notes, cf. branche estNote ci-dessus) — exactement la garde de
    // l'ancien code, complétée pour ne pas retirer une ligne qui a en fait
    // déjà été réécrite avec une autre demi-journée/chantier depuis.
    if (o1 && oTexteBrut !== "") {
      joursOuvresDeLaPlage(o1, o2).forEach(function (iso) {
        if (iso >= d1 && iso <= d2) return; // encore dans la nouvelle plage
        var demiOrigineIci = demiPourJourDePlage(iso, o1, o2, oNorm.demi1, oNorm.demi2);
        var existante = lignesExistantesDuJour(iso)[0] || null;
        if (existante && String(existante.texte || "") === oTexteBrut && (existante.demi || null) === (demiOrigineIci || null) &&
            !!existante.important === oImportant && (existante.chantier_id || null) === oChantierId) {
          ops.push({ type: "delete", table: "jalons", id: existante.id });
          liberes++;
        }
      });
    }
  }

  return { ops: ops, poses: poses, remplaces: remplaces, liberes: liberes, ajoutes: ajoutes };
}

export {
  joursOuvresDeLaPlage,
  demiPourJourDePlage,
  lignesDe,
  normaliserPlage,
  planPlage,
};
