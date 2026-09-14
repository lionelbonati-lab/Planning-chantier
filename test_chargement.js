/**
 * Test de la logique pure de chargement du planning (phase 4, étape 2 du
 * §6bis) — port de apiDemarrer()/apiChargerSemaine()/chargerSemaine_()
 * (WebApp.gs) vers le nouveau schéma Supabase (une ligne par date, plus de
 * notion de "semaine" côté serveur).
 *
 * Contrairement aux autres test_*.js de ce projet (qui extraient depuis un
 * fichier functions/xxx/logic.js), les fonctions testées ici vivent directement dans
 * le <script> principal d'Index.html — cf. section "CHARGEMENT DEPUIS
 * SUPABASE (phase 4, étape 2)". Même principe d'extraction (regex +
 * équilibrage d'accolades), juste une source différente : le contenu du
 * <script> inline (pas celui qui charge supabase-js depuis le CDN).
 *
 * Lancer : node test_chargement.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, 'Index.html'), 'utf8');
// 2 balises <script> dans le fichier : la 1ère charge supabase-js par CDN
// (src="..."), la 2ème est le script inline principal — c'est celle-là
// qu'on veut. On prend le dernier <script>...</script> du fichier.
const blocs = [...HTML.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g)];
if (blocs.length === 0) throw new Error('aucun <script> trouvé dans Index.html');
const SRC = blocs[blocs.length - 1][1];

function extraireFonction(nom) {
  const re = new RegExp('\\n(\\s*)function ' + nom + '\\s*\\(');
  const m = re.exec(SRC);
  if (!m) throw new Error('fonction introuvable dans le <script> d\'Index.html : ' + nom);
  let i = SRC.indexOf('{', m.index + m[0].length - 1);
  let profondeur = 0;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') profondeur++;
    else if (SRC[j] === '}') { profondeur--; if (profondeur === 0) return SRC.slice(m.index + 1, j + 1); }
  }
  throw new Error('accolades non équilibrées pour ' + nom);
}
// var MOIS_ABBR_WEB = [...]; -- pas une fonction, extraite à part (nécessaire
// à infosSemaineDepuisLabG/construireDonneesSemaine).
function extraireVar(nom) {
  const re = new RegExp('\\n\\s*var ' + nom + '\\s*=\\s*(\\[[\\s\\S]*?\\]);');
  const m = re.exec(SRC);
  if (!m) throw new Error('variable introuvable dans le <script> d\'Index.html : ' + nom);
  return 'var ' + nom + ' = ' + m[1] + ';';
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  extraireVar('MOIS_ABBR_WEB') + '\n' +
  ['pad2_', 'dateUTCDepuisIso_', 'isoDepuisDateUTC_', 'ajouterJoursUTC_', 'labGVersIso_', 'isoVersLabG',
    'numeroSemaineIsoUTC', 'lundiDeSemaineUTC', 'genererSemaines', 'infosSemaineDepuisLabG', 'construireDonneesSemaine']
    .map(extraireFonction).join('\n'),
  sandbox
);

let total = 0, echecs = 0;
function assertEqual(recu, attendu, message) {
  total++;
  const a = JSON.stringify(recu), b = JSON.stringify(attendu);
  if (a === b) console.log('OK: ' + message);
  else { echecs++; console.error('ÉCHEC: ' + message + '\n   attendu ' + b + '\n   reçu    ' + a); }
}

// =======================================================================
// 1) numeroSemaineIsoUTC / lundiDeSemaineUTC — cas limite : la semaine ISO 1
//    d'une année peut commencer en décembre de l'année précédente.
// =======================================================================
// Lundi 28 décembre 2026 -> jeudi 31 décembre 2026, encore dans l'année
// civile 2026 mais bien semaine ISO 1 de 2026... vérifions plutôt l'exemple
// canonique : lundi 29 décembre 2025 est le lundi de la semaine ISO 1 de
// 2026 (le jeudi de cette semaine, 1er janvier 2026, tombe en 2026).
assertEqual(sandbox.numeroSemaineIsoUTC('2025-12-29'), 1, 'lundi 29.12.2025 -> semaine ISO 1 (de 2026, le jeudi tombe en janvier)');
assertEqual(sandbox.numeroSemaineIsoUTC('2026-01-01'), 1, 'jeudi 01.01.2026 -> semaine ISO 1');
assertEqual(sandbox.numeroSemaineIsoUTC('2025-12-22'), 52, 'lundi 22.12.2025 -> encore semaine ISO 52 de 2025');
assertEqual(sandbox.numeroSemaineIsoUTC('2026-09-07'), 37, 'lundi 07.09.2026 -> semaine ISO 37 (vérifié indépendamment)');

assertEqual(sandbox.lundiDeSemaineUTC('2026-09-09'), '2026-09-07', 'mercredi 09.09.2026 -> lundi 07.09.2026 de sa semaine');
assertEqual(sandbox.lundiDeSemaineUTC('2026-09-07'), '2026-09-07', 'un lundi est le lundi de sa propre semaine (idempotent)');
assertEqual(sandbox.lundiDeSemaineUTC('2026-09-13'), '2026-09-07', 'dimanche 13.09.2026 -> lundi 07.09.2026 (toujours la même semaine ISO, jamais la suivante)');

// =======================================================================
// 2) genererSemaines — fenêtre contiguë, ordonnée, ancrée sur le lundi
//    d'aujourd'hui, à cheval sur un changement d'année.
// =======================================================================
(function () {
  const semaines = sandbox.genererSemaines('2025-12-31', 2, 2); // mercredi 31.12.2025 -> semaine du 29.12.2025
  assertEqual(semaines.length, 5, '2 avant + 1 courante + 2 après = 5 semaines');
  assertEqual(semaines.map(function (s) { return s.debut; }),
    ['2025-12-15', '2025-12-22', '2025-12-29', '2026-01-05', '2026-01-12'],
    'lundis contigus, ordre chronologique, à cheval sur le changement d\'année');
  assertEqual(semaines.map(function (s) { return s.fin; }),
    ['2025-12-21', '2025-12-28', '2026-01-04', '2026-01-11', '2026-01-18'],
    'fin = dimanche de chaque semaine (7 jours pile après le début)');
  assertEqual(semaines.map(function (s) { return s.num; }), ['51', '52', '1', '2', '3'],
    'numéros de semaine ISO corrects de part et d\'autre du changement d\'année (52 -> 1, pas de saut ni de doublon)');
  assertEqual(semaines.map(function (s) { return s.labG; }), [20251215, 20251222, 20251229, 20260105, 20260112],
    'labG = YYYYMMDD entier du lundi de chaque semaine');
})();
(function () {
  const semaines = sandbox.genererSemaines('2026-09-04', 1, 1);
  assertEqual(semaines[1].debut, sandbox.lundiDeSemaineUTC('2026-09-04'), 'semaine du milieu = lundi de la semaine contenant aujourd\'hui');
})();

// =======================================================================
// 3) infosSemaineDepuisLabG — plage Monday..Sunday d'un labG donné.
// =======================================================================
(function () {
  const infos = sandbox.infosSemaineDepuisLabG(20260907); // lundi 7 septembre 2026
  assertEqual(infos.debut, '2026-09-07', 'début = le lundi lui-même');
  assertEqual(infos.fin, '2026-09-13', 'fin = le dimanche suivant (6 jours après)');
  assertEqual(infos.isoDates, ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'], 'isoDates = Lundi..Vendredi');
  assertEqual(infos.weekendDates, ['2026-09-12', '2026-09-13'], 'weekendDates = [Samedi, Dimanche]');
  assertEqual(infos.dates, ['07', '08', '09', '10', '11'], 'dates = jour du mois, 2 chiffres');
  assertEqual(infos.mois, ['sept.', 'sept.', 'sept.', 'sept.', 'sept.'], 'mois = abréviation française (MOIS_ABBR_WEB)');
})();
(function () {
  // Cas limite supplémentaire : semaine à cheval sur un changement de mois.
  const infos = sandbox.infosSemaineDepuisLabG(20260928); // lundi 28 septembre 2026 -> vendredi 2 octobre
  assertEqual(infos.dates, ['28', '29', '30', '01', '02'], 'jours à cheval sur septembre/octobre');
  assertEqual(infos.mois, ['sept.', 'sept.', 'sept.', 'oct.', 'oct.'], 'mois change bien au bon endroit dans la semaine');
})();

// =======================================================================
// 4) construireDonneesSemaine — bucketing taches/assignations/jalons/notes,
//    traduction statut_id -> cle et chantier_id -> nom, tri par `ordre`,
//    cases vides bien formées.
// =======================================================================
(function () {
  const labG = 20260907; // lundi 07.09.2026 .. dimanche 13.09.2026
  const lookups = { chantiersParId: { 1: 'Chantier Rue du Lac' }, statutsParId: { 10: 'confirme', 11: 'a_reserver' } };
  const brut = {
    personnes: [
      { id: 100, nom: 'Alice', sous_traitant: false, ordre: 0 },
      { id: 200, nom: 'Bob', sous_traitant: true, ordre: 1 }
    ],
    assignations: [
      { id: 1, personne_id: 100, date: '2026-09-07', demi: 'matin', chantier_id: 1 },
      // 2e assignation sur la MÊME case (personne,date,demi) — la donnée
      // l'autorise (cf. §4/§8 du plan), on ne doit garder que la 1ère par id.
      { id: 2, personne_id: 100, date: '2026-09-07', demi: 'matin', chantier_id: 999 }
    ],
    taches: [
      // ordre volontairement inversé en entrée pour vérifier le tri par `ordre`.
      { id: 50, personne_id: 100, date: '2026-09-07', demi: 'matin', ordre: 2, texte: 'Nettoyage', statut_id: null, important: false, serie_id: null },
      { id: 51, personne_id: 100, date: '2026-09-07', demi: 'matin', ordre: 1, texte: 'Coffrage', statut_id: 10, important: true, serie_id: 7 },
      // Case week-end (Samedi 12.09.2026), toujours demi="matin" par convention.
      { id: 52, personne_id: 200, date: '2026-09-12', demi: 'matin', ordre: 0, texte: 'Astreinte', statut_id: 11, important: false, serie_id: null }
    ],
    jalons: [
      { id: 900, date: '2026-09-08', texte: 'Livraison béton', serie_id: null }
    ],
    notes: [
      { id: 800, date: '2026-09-09', texte: 'Contrôle chantier', important: false, serie_id: null, demi: 'aprem' },
      { id: 801, date: '2026-09-09', texte: 'RDV client', important: true, serie_id: null, demi: null }
    ]
  };
  const d = sandbox.construireDonneesSemaine(labG, brut, lookups);

  assertEqual(d.labG, labG, 'labG reporté tel quel');
  assertEqual(d.numero, String(sandbox.numeroSemaineIsoUTC('2026-09-07')), 'numero = n° de semaine ISO du lundi');
  assertEqual(d.isoDates, ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'], 'isoDates Lundi..Vendredi');

  // Case Lundi matin d'Alice : chantier de la 1ère assignation (id=1, pas
  // id=2), 2 tâches triées par `ordre` (Coffrage avant Nettoyage), statut_id
  // traduit en cle, important reporté.
  const caseAliceLundiMatin = d.personnes[0].matin[0];
  assertEqual(caseAliceLundiMatin.chantier, 'Chantier Rue du Lac', 'chantier = nom traduit depuis chantier_id, 1ère assignation par id');
  assertEqual(caseAliceLundiMatin.taches, [
    { texte: 'Coffrage', statut: 'confirme', important: true, serieId: 7, absence: false },
    { texte: 'Nettoyage', statut: null, important: false, serieId: null, absence: false }
  ], 'tâches triées par `ordre` croissant, statut_id -> cle, statut absent -> null');

  // Case vide (Mardi matin d'Alice, aucune donnée) : bien formée, jamais undefined.
  assertEqual(d.personnes[0].matin[1], { chantier: null, taches: [] }, 'case sans donnée -> {chantier:null, taches:[]}, jamais undefined');
  assertEqual(d.personnes[0].aprem[0], { chantier: null, taches: [] }, 'aprem non renseigné -> case vide bien formée');

  // Jalon du mardi (index 1), reste des jours vides mais bien formés.
  // demi (round du 08.09.2026, §47 du FRONTEND-CHANGELOG) : un jalon porte
  // désormais lui aussi sa propre demi-journée, comme une note — ici la
  // fixture n'en fournit pas, donc null.
  assertEqual(d.jalons[1], { texte: 'Livraison béton', serieId: null, demi: null }, 'jalon du mardi correctement bucketé');
  assertEqual(d.jalons[0], { texte: '', serieId: null, demi: null }, 'jour sans jalon -> {texte:"", serieId:null, demi:null}, jamais undefined');

  // Notes du mercredi (index 2) : 2 entrées, demi reporté tel quel (y compris null).
  assertEqual(d.notes[2], [
    { texte: 'Contrôle chantier', important: false, serieId: null, demi: 'aprem' },
    { texte: 'RDV client', important: true, serieId: null, demi: null }
  ], 'notes du mercredi : 2 entrées indépendantes, ordre = ordre d\'id croissant');
  assertEqual(d.notes[0], [], 'jour sans note -> tableau vide, jamais undefined');

  // Bob (sous-traitant) : case week-end Samedi (weekend[0]) peuplée, avec
  // statut traduit ; Dimanche (weekend[1]) vide mais bien formée.
  assertEqual(d.personnes[1].sousTraitant, true, 'sousTraitant reporté depuis sous_traitant');
  assertEqual(d.personnes[1].weekend[0], { chantier: null, taches: [{ texte: 'Astreinte', statut: 'a_reserver', important: false, serieId: null, absence: false }] },
    'case week-end Samedi peuplée depuis une tâche demi="matin" sur weekendDates[0]');
  assertEqual(d.personnes[1].weekend[1], { chantier: null, taches: [] }, 'case week-end Dimanche vide mais bien formée');
})();

// =======================================================================
// 5) tacheVue_ (fonction locale de construireDonneesSemaine) — colonne
//    taches.est_absence (sql/0009_taches_est_absence.sql, round du
//    14.09.2026 — bug Lionel : une absence au descriptif libre repassait
//    "tâche" dès la reconstruction suivante, faute de colonne dédiée).
// =======================================================================
(function () {
  const labG = 20260907;
  const lookups = { chantiersParId: {}, statutsParId: {} };
  const brut = {
    personnes: [{ id: 100, nom: 'Alice', sous_traitant: false, ordre: 0 }],
    assignations: [],
    // Mercredi (index 2) matin : une tâche normale et une absence au
    // descriptif libre ("RDV perso", ne matche aucun mot-clé d'estAbsence)
    // sur la même case, pour vérifier que seule celle marquée en base
    // ressort avec absence:true.
    taches: [
      { id: 60, personne_id: 100, date: '2026-09-09', demi: 'matin', ordre: 0, texte: 'Coffrage', statut_id: null, important: false, serie_id: null, est_absence: false },
      { id: 61, personne_id: 100, date: '2026-09-09', demi: 'matin', ordre: 1, texte: 'RDV perso', statut_id: null, important: false, serie_id: null, est_absence: true }
    ],
    jalons: [], notes: []
  };
  const d = sandbox.construireDonneesSemaine(labG, brut, lookups);
  assertEqual(d.personnes[0].matin[2].taches, [
    { texte: 'Coffrage', statut: null, important: false, serieId: null, absence: false },
    { texte: 'RDV perso', statut: null, important: false, serieId: null, absence: true }
  ], 'taches.est_absence -> absence:true/false reporté fidèlement par tacheVue_, indépendamment du texte');
})();

console.log('\n' + (total - echecs) + '/' + total + ' assertions réussies.');
if (echecs > 0) process.exit(1);
