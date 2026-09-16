// Teste isoDeLabGJourIdxCase_ (index.html) — le point le plus risqué du
// correctif du 07.09.2026 (bug "google is not defined" à l'ajout d'une
// tâche, cf. FRONTEND-CHANGELOG.md) : traduire un (labG, jourIdx 0..7) en la
// bonne date ISO, y compris pour le week-end (jourIdx 6/7), qui n'a plus de
// cellule fusionnée côté nouveau schéma — chaque jour est une vraie date
// indépendante, cf. commentaire de tête d'enregistrerCellulePersonneServeur.
//
// Convention du projet : la fonction réelle est extraite d'index.html par
// regex + équilibrage d'accolades, jamais copiée à la main (cf. les autres
// test_*.js).
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function extraireFonction(src, nom) {
  const re = new RegExp("\\n(\\s*)function " + nom + "\\s*\\(");
  const m = re.exec(src);
  if (!m) throw new Error("Fonction introuvable : " + nom);
  let i = src.indexOf("{", m.index);
  let profondeur = 0, fin = -1;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") profondeur++;
    else if (src[j] === "}") { profondeur--; if (profondeur === 0) { fin = j + 1; break; } }
  }
  if (fin === -1) throw new Error("Accolade fermante introuvable pour : " + nom);
  return src.slice(m.index + 1, fin);
}

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

const source = [
  extraireFonction(html, "pad2_"),
  extraireFonction(html, "dateUTCDepuisIso_"),
  extraireFonction(html, "isoDepuisDateUTC_"),
  extraireFonction(html, "ajouterJoursUTC_"),
  extraireFonction(html, "labGVersIso_"),
  "var MOIS_ABBR_WEB = " + JSON.stringify(["", "jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]) + ";",
  extraireFonction(html, "infosSemaineDepuisLabG"),
  extraireFonction(html, "isoDeLabGJourIdxCase_"),
].join("\n");

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

let ok = 0, total = 0;
function assert(cond, msg) {
  total++;
  if (cond) { ok++; console.log("OK: " + msg); }
  else console.log("ÉCHEC: " + msg);
}

// labG = lundi 07.09.2026 (semaine 37, cf. discussions récentes avec Lionel).
const labG = 20260907;

assert(sandbox.isoDeLabGJourIdxCase_(labG, 0) === "2026-09-07", "jourIdx 0 (lundi) -> 2026-09-07");
assert(sandbox.isoDeLabGJourIdxCase_(labG, 4) === "2026-09-11", "jourIdx 4 (vendredi) -> 2026-09-11");
assert(sandbox.isoDeLabGJourIdxCase_(labG, 6) === "2026-09-12", "jourIdx 6 (Samedi) -> 2026-09-12, pas la même case que Dimanche");
assert(sandbox.isoDeLabGJourIdxCase_(labG, 7) === "2026-09-13", "jourIdx 7 (Dimanche) -> 2026-09-13, indépendant du Samedi");

// À cheval sur un changement de mois — même vérification que test_chargement.js,
// pour ce chemin de code spécifique (le week-end traverse rarement une
// frontière de semaine ISO différemment du lundi-vendredi, mais autant vérifier).
const labG2 = 20260928; // lundi 28.09.2026
assert(sandbox.isoDeLabGJourIdxCase_(labG2, 0) === "2026-09-28", "changement de mois : lundi 28.09.2026");
assert(sandbox.isoDeLabGJourIdxCase_(labG2, 6) === "2026-10-03", "changement de mois : Samedi 03.10.2026");
assert(sandbox.isoDeLabGJourIdxCase_(labG2, 7) === "2026-10-04", "changement de mois : Dimanche 04.10.2026");

console.log("\n" + ok + "/" + total + " assertions réussies.");
process.exit(ok === total ? 0 : 1);
