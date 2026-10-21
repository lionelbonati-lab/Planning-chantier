// ============================================================
// pieces-lien — logique pure (round du 21.10.2026, suite 147). Testée par
// tests/test_suite147.js (section A) ; index.ts fait les appels réseau.
// ============================================================

var JETON_VALIDE = /^[0-9a-f]{32,}$/i;
var DATE_VALIDE = /^\d{4}-\d{2}-\d{2}$/;
// Une fiche montre au plus quelques dizaines de fichiers (vignettes
// comprises) : au-delà, la demande est refusée plutôt que coupée.
var MAX_CHEMINS = 60;

// Valide la demande { jeton, page, lundi, chemins } ; jette un message
// lisible si elle ne va pas.
function validerDemande(body) {
  var b = body || {};
  var jeton = String(b.jeton || "");
  if (!JETON_VALIDE.test(jeton)) throw new Error("Lien incomplet.");
  var page = b.page === "responsable" ? "responsable" : b.page === "consultation" ? "consultation" : "";
  if (!page) throw new Error("Page inconnue.");
  var lundi = b.lundi == null || b.lundi === "" ? null : String(b.lundi);
  if (lundi !== null && !DATE_VALIDE.test(lundi)) throw new Error("Semaine invalide.");
  if (!Array.isArray(b.chemins) || b.chemins.length === 0) throw new Error("Aucun fichier demandé.");
  if (b.chemins.length > MAX_CHEMINS) throw new Error("Trop de fichiers demandés.");
  var chemins = [];
  b.chemins.forEach(function (c) {
    if (typeof c !== "string" || c === "" || c.length > 400) throw new Error("Fichier invalide.");
    if (chemins.indexOf(c) < 0) chemins.push(c);
  });
  return { jeton: jeton, page: page, lundi: lundi, chemins: chemins };
}

// Fichiers (et vignettes) joints aux tâches que ce lien affiche cette
// semaine-là : la réponse de consultation_planning / consultation_responsable
// (sql/0041), donc exactement les mêmes règles de visibilité que la page.
// Suite 149 (sql/0043) : et aux notes (lien responsable seulement — le lien
// des ouvriers n'en renvoie pas).
function cheminsVisibles(reponse) {
  var vus = {};
  ((reponse && reponse.taches) || []).concat((reponse && reponse.notes) || []).forEach(function (t) {
    (Array.isArray(t && t.pieces) ? t.pieces : []).forEach(function (p) {
      if (p && typeof p.chemin === "string" && p.chemin) vus[p.chemin] = true;
      if (p && typeof p.vignette === "string" && p.vignette) vus[p.vignette] = true;
    });
  });
  return Object.keys(vus);
}

// Demandés ET visibles, dans l'ordre de la demande.
function cheminsASigner(demandes, visibles) {
  return demandes.filter(function (c) { return visibles.indexOf(c) >= 0; });
}

export { validerDemande, cheminsVisibles, cheminsASigner, MAX_CHEMINS };
