/**
 * Test de la géométrie de la grille (round du 02.09.2026 : "2 colonnes par
 * jour ouvrable et 1 ligne par ouvrier", demande de Lionel — d'abord un mode
 * "compact" optionnel à côté du mode "classique" historique). Depuis le §49
 * (round du 08.09.2026, suite, encore — Lionel : « on reste sur la seule vue
 * compact qui devient la standard ») le mode classique a été entièrement
 * supprimé : il n'y a plus qu'UN SEUL affichage, celui qui s'appelait
 * "compact" — `modeCompact` reste une constante fixée à `true` dans
 * Index.html (cf. son commentaire) plutôt qu'un vrai réglage, donc plus
 * besoin ici de tester 2 modes ni de basculer entre eux.
 *
 * PARTICULARITÉ : ce fichier ne teste pas une COPIE de la logique, il extrait
 * les fonctions RÉELLES du `Index.html` livré (par leur nom, depuis la source)
 * et les exécute. Une divergence entre ce qui est testé et ce qui est envoyé à
 * Lionel est donc impossible — c'est tout l'intérêt, ce projet n'ayant aucun
 * test d'écran (cf. FRONTEND-CHANGELOG.md §3).
 *
 * Lancer : node test_grille_compacte.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'Index.html'), 'utf8');

// ---- Extraction des fonctions réelles depuis Index.html -----------------
function extraireFonction(nom) {
  const re = new RegExp('\\n(\\s*)function ' + nom + '\\s*\\(');
  const m = re.exec(SRC);
  if (!m) throw new Error('fonction introuvable dans Index.html : ' + nom);
  // Découpe par équilibrage des accolades à partir du corps de la fonction.
  let i = SRC.indexOf('{', m.index + m[0].length - 1);
  let profondeur = 0;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') profondeur++;
    else if (SRC[j] === '}') { profondeur--; if (profondeur === 0) return SRC.slice(m.index + 1, j + 1); }
  }
  throw new Error('accolades non équilibrées pour ' + nom);
}

const NOMS = ['colsParJour', 'colonneGrille', 'colonneDemi', 'spanColonnes',
  'estGiWeekend', 'giWeekend', 'semaineDuGiWeekend', 'jourWeekendIdx', 'assignerPistesCompact',
  'colonneEtSpanDemi', 'demiDepuisPointeur', 'demiPourRedimNote', 'demiCiblePourDeplacementNote',
  'demiSlotsDepuisBornes', 'bornesDepuisDemiSlots', 'bordsDeplacementNoteMultiJours',
  'demisOccupeesTache'];

const sandbox = { modeCompact: true, afficherWeekends: false, Object: Object, Math: Math };
vm.createContext(sandbox);
vm.runInContext(NOMS.map(extraireFonction).join('\n'), sandbox);

let total = 0, echecs = 0;
function assertEqual(recu, attendu, message) {
  total++;
  const a = JSON.stringify(recu), b = JSON.stringify(attendu);
  if (a === b) console.log('OK: ' + message);
  else { echecs++; console.error('ÉCHEC: ' + message + '\n   attendu ' + b + '\n   reçu    ' + a); }
}
function colonnesDesJours(n) {
  const out = [];
  for (let gi = 0; gi < n; gi++) out.push(sandbox.colonneGrille(gi));
  return out;
}

// =======================================================================
// 1) GÉOMÉTRIE DE LA GRILLE — 2 colonnes par jour, après-midi juste à droite
//    du matin (seul affichage existant depuis le §49).
// =======================================================================
sandbox.afficherWeekends = false;
assertEqual(colonnesDesJours(5), [2, 4, 6, 8, 10], 'compact : chaque jour occupe 2 colonnes');
assertEqual([sandbox.colonneDemi(0, 'matin'), sandbox.colonneDemi(0, 'aprem')], [2, 3],
  'compact : après-midi juste à droite du matin, dans le même jour');
assertEqual([sandbox.colonneDemi(2, 'matin'), sandbox.colonneDemi(2, 'aprem')], [6, 7],
  'compact : idem pour le 3e jour');
assertEqual(sandbox.spanColonnes(0, 1), 2, 'compact : un jour entier (jalon/note) couvre bien ses 2 colonnes');
assertEqual(sandbox.spanColonnes(0, 3), 6, 'compact : un jalon de 3 jours couvre 6 colonnes');

sandbox.afficherWeekends = true;
assertEqual(colonnesDesJours(10), [2, 4, 6, 8, 10, 14, 16, 18, 20, 22],
  'compact avec week-ends : la 2e semaine démarre après les 10 colonnes de jours + 2 de week-end');
assertEqual(sandbox.colonneGrille(sandbox.giWeekend(0, 0)), 12, 'compact : Samedi de la 1ère semaine juste après les 5 jours (10 colonnes)');
assertEqual(sandbox.colonneDemi(sandbox.giWeekend(0, 0), 'aprem'), 12,
  'compact : le week-end n’a qu’UNE case par personne (§2 du spec) — jamais scindé en 2 demi-journées');

// =======================================================================
// 2) EMPILEMENT compact : matin et après-midi doivent COHABITER sur la même
//    piste (sinon on ne gagnerait aucune hauteur, ce qui est tout l'objet
//    du mode), mais deux tâches sur la MÊME demi-journée doivent s'empiler.
// =======================================================================
(function () {
  const items = [
    { id: 'a', giDebut: 0, duree: 1, demiDebut: 'matin', demiFin: 'matin' },
    { id: 'b', giDebut: 0, duree: 1, demiDebut: 'aprem', demiFin: 'aprem' }
  ];
  const n = sandbox.assignerPistesCompact(items);
  assertEqual(n, 1, 'compact : matin + après-midi du même jour tiennent sur UNE seule piste (le gain de hauteur recherché)');
  assertEqual([items[0]._piste, items[1]._piste], [0, 0], 'compact : les deux sont bien sur la piste 0');
})();
(function () {
  const items = [
    { id: 'a', giDebut: 0, duree: 1, demiDebut: 'matin', demiFin: 'matin' },
    { id: 'b', giDebut: 0, duree: 1, demiDebut: 'matin', demiFin: 'matin' }
  ];
  assertEqual(sandbox.assignerPistesCompact(items), 2,
    'compact : deux tâches sur la MÊME demi-journée s’empilent sur 2 pistes (aucune ne peut être cachée)');
})();
(function () {
  // §49 (Lionel : "1 tâche ne peux pas etre mise sur 2 case, elle s'étent de
  // 1 jour") : une tâche/absence porte désormais demiDebut/demiFin comme une
  // note/un jalon (tout jour STRICTEMENT entre les 2 bords est une journée
  // entière, cf. demiSlotsDepuisBornes) — 'long' est une plage de 2,5 jours
  // (jour0+jour1 pleins, jour2 matin seul) ; 'court' occupe seulement
  // l'après-midi du jour2, qui n'est donc PAS pris par 'long' -> pas de
  // collision, une seule piste.
  const items = [
    { id: 'long', giDebut: 0, duree: 3, demiDebut: null, demiFin: 'matin' },
    { id: 'court', giDebut: 2, duree: 1, demiDebut: 'aprem', demiFin: 'aprem' }
  ];
  assertEqual(sandbox.assignerPistesCompact(items), 1,
    'compact : une plage de 2,5 jours et une demi-journée d’après-midi juste après son bord ne se gênent pas');
})();
(function () {
  // 'long' occupe 3 jours PLEINS (0 à 2) ; 'chevauche' occupe le matin du
  // jour 2, qui EST déjà pris par 'long' -> collision, 2 pistes.
  const items = [
    { id: 'long', giDebut: 0, duree: 3, demiDebut: null, demiFin: null },
    { id: 'chevauche', giDebut: 2, duree: 1, demiDebut: 'matin', demiFin: 'matin' }
  ];
  assertEqual(sandbox.assignerPistesCompact(items), 2,
    'compact : une plage de jours pleins et une demi-journée qui tombe dedans s’empilent');
})();
(function () {
  const items = [
    { id: 'we', giDebut: sandbox.giWeekend(0, 0), duree: 1, demiDebut: 'matin', demiFin: 'matin' },
    { id: 'lun', giDebut: 0, duree: 1, demiDebut: 'matin', demiFin: 'matin' }
  ];
  assertEqual(sandbox.assignerPistesCompact(items), 1,
    'compact : une tâche de week-end a sa propre colonne, elle ne pousse personne sur une 2e piste');
})();

// =======================================================================
// 3) colonneEtSpanDemi — round du 03.09.2026, signalé par Lionel : "je
//    n'arrive pas à étendre une bulle note sur une demi journée", puis (une
//    fois ce 1er bug réparé) "je peux reduire de 1 jour à 1 demi jour, mais
//    je ne peux pas augmenter à 1 jour et demi" — ce qui a fait passer le
//    modèle d'UNE SEULE demi-journée par note à un COUPLE demiDebut/demiFin,
//    un par bord de la plage (cf. WebApp.gs, demiPourJourDePlage_ : tout
//    jour strictement ENTRE les 2 bords reste une journée entière). Fonction
//    PARTAGÉE entre le rendu statique et l'aperçu en direct du
//    redimensionnement (cablerPoigneeRedim / appliquerPrevisu, dans
//    Index.html) : la tester ici couvre les deux à la fois, et une
//    régression future y serait détectée immédiatement.
// =======================================================================
assertEqual(sandbox.colonneEtSpanDemi(0, 1, 'matin', 'matin'), [sandbox.colonneDemi(0, 'matin'), 1],
  'compact : note du matin sur 1 jour -> colonne du matin, span 1 (sa propre demi-colonne, pas les 2 du jour)');
assertEqual(sandbox.colonneEtSpanDemi(0, 1, 'aprem', 'aprem'), [sandbox.colonneDemi(0, 'aprem'), 1],
  'compact : note de l’après-midi sur 1 jour -> colonne de l’après-midi, PAS celle du matin (c’était le bug : l’aperçu de glissement sautait toujours sur le matin)');
assertEqual(sandbox.colonneEtSpanDemi(0, 1, null, null), [sandbox.colonneGrille(0), sandbox.spanColonnes(0, 1)],
  'compact : note journée entière -> comportement plein-largeur inchangé (2 colonnes)');

// Le scénario concret de Lionel, "1 jour et demi" : un bord porte sa demi,
// l'AUTRE bord reste journée entière — exactement ce qu'il fallait pouvoir
// atteindre en glissant une poignée au-delà de son propre jour.
assertEqual(sandbox.colonneEtSpanDemi(0, 2, null, 'matin'), [sandbox.colonneGrille(0), 3],
  '"1 jour et demi" (bord de FIN) : lundi journée entière + mardi matin seulement -> 3 colonnes (2 + 1)');
assertEqual(sandbox.colonneEtSpanDemi(0, 2, 'aprem', null), [sandbox.colonneDemi(0, 'aprem'), 3],
  '"1 jour et demi" (bord de DÉPART) : lundi après-midi seulement + mardi journée entière -> démarre à la sous-colonne aprem, 3 colonnes');
assertEqual(sandbox.colonneEtSpanDemi(0, 3, null, 'matin'), [sandbox.colonneGrille(0), 5],
  '"2 jours et demi" : lundi+mardi entiers + mercredi matin seulement -> 5 colonnes');
assertEqual(sandbox.colonneEtSpanDemi(0, 2, null, null), [sandbox.colonneGrille(0), 4],
  'référence : 2 jours pleins (aucun bord en demi-journée) -> 4 colonnes, comme avant');

// "matin" comme bord de DÉPART et "aprem" comme bord de FIN n'ont pas de
// représentation contiguë possible sur plusieurs jours (cf. commentaire de
// colonneEtSpanDemi) : ils doivent rester inertes, identiques à l'absence de
// demi-journée — jamais une exception ni un décalage visuel surprenant.
assertEqual(sandbox.colonneEtSpanDemi(0, 2, 'matin', null), sandbox.colonneEtSpanDemi(0, 2, null, null),
  '"matin" comme bord de départ sur plusieurs jours est inerte (rendu identique à journée entière)');
assertEqual(sandbox.colonneEtSpanDemi(0, 2, null, 'aprem'), sandbox.colonneEtSpanDemi(0, 2, null, null),
  '"aprem" comme bord de fin sur plusieurs jours est inerte (rendu identique à journée entière)');

// =======================================================================
// 4) demiDepuisPointeur / demiPourRedimNote / demiCiblePourDeplacementNote
//    — round du 03.09.2026, signalé par Lionel (une 2e fois) : "les notes
//    sont toujours pas extensible ni déplaçable en demi journée". Le round
//    précédent n'avait réparé que l'APERÇU d'une note déjà en demi-journée
//    qu'on étend sur plusieurs jours ; il restait impossible de FAIRE
//    APPARAÎTRE une demi-journée par glissement (résize ou déplacement).
// =======================================================================
function faireCell(left, width) {
  return { getBoundingClientRect: function () { return { left: left, width: width }; } };
}
// -- demiDepuisPointeur : moitié gauche = matin, moitié droite = aprem --
assertEqual(sandbox.demiDepuisPointeur(faireCell(100, 40), 110), 'matin', 'pointeur près du bord gauche -> matin');
assertEqual(sandbox.demiDepuisPointeur(faireCell(100, 40), 138), 'aprem', 'pointeur près du bord droit -> aprem');
assertEqual(sandbox.demiDepuisPointeur(faireCell(100, 40), 119), 'matin', 'juste avant le milieu -> matin');
assertEqual(sandbox.demiDepuisPointeur(faireCell(100, 40), 120), 'aprem', 'juste après le milieu -> aprem (la coupure est stricte)');
assertEqual(sandbox.demiDepuisPointeur(faireCell(0, 0), 500), 'matin',
  'cellule de largeur 0 (rect pas encore mesurable) -> repli sur matin, jamais une exception');

// -- demiPourRedimNote : chaque poignée gouverne SON PROPRE bord (round du
//    03.09.2026, "je peux reduire de 1 jour à 1 demi jour, mais je ne peux
//    pas augmenter à 1 jour et demi") : contrairement à l'ancienne version,
//    l'AUTRE bord n'est plus jamais figé sur sa valeur de départ dès que
//    l'aperçu dépasse 1 jour — sinon "1 jour et demi" restait inatteignable.
assertEqual(sandbox.demiPourRedimNote('droite', 3, 'matin', null, 'matin'),
  { demiDebut: 'matin', demiFin: 'matin' },
  'poignée droite, encore plusieurs jours (duree=3) : demiDebut reconduit tel quel, demiFin choisi par la position du pointeur dans le NOUVEAU dernier jour — "1 jour et demi" atteint ici');
assertEqual(sandbox.demiPourRedimNote('droite', 3, 'matin', null, 'aprem'),
  { demiDebut: 'matin', demiFin: null },
  'poignée droite, encore plusieurs jours : pointeur côté droit du nouveau dernier jour -> ce jour reste entier, demiDebut inchangé');
assertEqual(sandbox.demiPourRedimNote('droite', 1, null, null, 'matin'),
  { demiDebut: 'matin', demiFin: 'matin' }, 'poignée droite, réduite à 1 jour : les 2 bords fusionnent, pointeur côté gauche -> "matin" (rogné)');
assertEqual(sandbox.demiPourRedimNote('droite', 1, null, null, 'aprem'),
  { demiDebut: null, demiFin: null }, 'poignée droite, réduite à 1 jour, pointeur côté droit -> journée entière (pas encore rogné)');
assertEqual(sandbox.demiPourRedimNote('gauche', 3, null, 'matin', 'aprem'),
  { demiDebut: 'aprem', demiFin: 'matin' },
  'poignée gauche, encore plusieurs jours : demiFin reconduit tel quel, demiDebut choisi par la position du pointeur dans le NOUVEAU premier jour');
assertEqual(sandbox.demiPourRedimNote('gauche', 1, null, null, 'aprem'),
  { demiDebut: 'aprem', demiFin: 'aprem' }, 'poignée gauche, réduite à 1 jour, pointeur côté droit -> "aprem" (rogné)');
assertEqual(sandbox.demiPourRedimNote('gauche', 1, null, null, 'matin'),
  { demiDebut: null, demiFin: null }, 'poignée gauche, réduite à 1 jour, pointeur côté gauche -> journée entière (pas encore rogné)');

// -- demiCiblePourDeplacementNote : déplacement (bulle entière) --
// round du 08.09.2026 (suite) : Lionel, « quand je déplace une note
// matin/aprem de 1/2 jour elle est retrecie en 1/2 journée » — le cas
// "même jour (delta=0)" traitait TOUJOURS la position du relâchement comme
// choisissant une demi-journée, y compris pour une note en JOURNÉE ENTIÈRE
// (contrairement au cas "jour différent" juste après, qui protège déjà la
// journée entière) : le moindre micro-glissement resté sur le même jour
// rétrécissait donc la note par accident. Les 2 cas suivent désormais
// exactement la même règle (cf. FRONTEND-CHANGELOG §42).
assertEqual(sandbox.demiCiblePourDeplacementNote(1, 0, null, null, 'aprem'),
  { demiDebut: null, demiFin: null }, 'même jour (delta=0), note en JOURNÉE ENTIÈRE -> reste en journée entière (avant ce round : rétrécie par accident en demi-journée)');
assertEqual(sandbox.demiCiblePourDeplacementNote(1, 0, 'matin', 'matin', 'aprem'),
  { demiDebut: 'aprem', demiFin: 'aprem' }, 'même jour, note déjà du matin -> passe à l’après-midi (le geste que Lionel décrivait le 03.09.2026)');
assertEqual(sandbox.demiCiblePourDeplacementNote(1, 2, 'matin', 'matin', 'aprem'),
  { demiDebut: 'aprem', demiFin: 'aprem' }, 'jour différent, note déjà en demi-journée -> la position choisit la nouvelle demi-journée sur le jour d’arrivée');
assertEqual(sandbox.demiCiblePourDeplacementNote(1, 2, null, null, 'aprem'),
  { demiDebut: null, demiFin: null }, 'jour différent, note en JOURNÉE ENTIÈRE -> reste en journée entière (jamais réduite par accident lors d’un simple déplacement)');
assertEqual(sandbox.demiCiblePourDeplacementNote(3, 2, 'aprem', 'matin', 'matin'),
  { demiDebut: 'aprem', demiFin: 'matin' },
  'note de PLUSIEURS jours : un simple déplacement conserve la forme de ses 2 bords telle quelle, quelle que soit la position du relâchement');

// =======================================================================
// 5) demiSlotsDepuisBornes / bornesDepuisDemiSlots / bordsDeplacementNoteMultiJours
//    — round du 07.09.2026 (suite), Lionel après le §37 : « toujours
//    impossible de déplacer une note qui mesure 2 demi/journée de 1 demi
//    journée », clarifié en « un après-midi et un matin [...] je veux le
//    déplacer sur matin/après-midi ». demiCiblePourDeplacementNote ci-dessus
//    reconduit TOUJOURS la forme des 2 bords telle quelle dès que duree > 1
//    — un déplacement de note multi-jours ne pouvait donc bouger que par
//    jour ENTIER. Le modèle "demi-slot" (un entier par demi-journée ouvrée :
//    2*gi = matin, 2*gi+1 = aprem) généralise le déplacement à la
//    demi-journée pour duree > 1, sans toucher au cas duree === 1 (inchangé
//    ci-dessus, cf. section 6).
// =======================================================================

// -- demiSlotsDepuisBornes / bornesDepuisDemiSlots : aller-retour cohérent --
assertEqual(sandbox.demiSlotsDepuisBornes(5, 2, 'aprem', 'matin'), { halfStart: 11, halfFinIncl: 12 },
  'note "aprem jour1 + matin jour2" (scénario exact de Lionel) -> 2 demi-slots consécutifs (11,12), soit exactement 1 journée de travail');
assertEqual(sandbox.demiSlotsDepuisBornes(2, 3, null, null), { halfStart: 4, halfFinIncl: 9 },
  '3 jours pleins (aucun bord en demi-journée) -> 6 demi-slots pleins, comme attendu');
assertEqual(sandbox.bornesDepuisDemiSlots(11, 12), { giDebut: 5, duree: 2, demiDebut: 'aprem', demiFin: 'matin' },
  'aller-retour : (11,12) redonne bien "aprem jour1 + matin jour2"');
assertEqual(sandbox.bornesDepuisDemiSlots(10, 11), { giDebut: 5, duree: 1, demiDebut: null, demiFin: null },
  '2 demi-slots du MÊME jour (10,11) -> journée entière (duree=1, aucun bord) : c’est précisément le résultat voulu par Lionel dans un sens');
assertEqual(sandbox.bornesDepuisDemiSlots(10, 10), { giDebut: 5, duree: 1, demiDebut: 'matin', demiFin: 'matin' },
  'un seul demi-slot pair -> matin seul (duree=1)');
assertEqual(sandbox.bornesDepuisDemiSlots(11, 11), { giDebut: 5, duree: 1, demiDebut: 'aprem', demiFin: 'aprem' },
  'un seul demi-slot impair -> aprem seul (duree=1)');

// -- bordsDeplacementNoteMultiJours : le scénario EXACT de Lionel --
// Note "aprem jour1 (gi=5) + matin jour2 (gi=6)" (duree=2), clic au tout
// début de la bulle (offsetHalvesClic=0, gi=5 étant le clic d'origine),
// glissée d'une demi-journée dans les 2 sens.
assertEqual(sandbox.bordsDeplacementNoteMultiJours(5, 2, 'aprem', 'matin', 0, 5, 'matin', 200),
  { giDebut: 5, duree: 1, demiDebut: null, demiFin: null },
  'scénario de Lionel, sens "vers le jour 1" : relâché sur le MATIN du jour 5 -> devient jour 5 ENTIER (matin+aprem d’UN SEUL jour)');
assertEqual(sandbox.bordsDeplacementNoteMultiJours(5, 2, 'aprem', 'matin', 0, 6, 'matin', 200),
  { giDebut: 6, duree: 1, demiDebut: null, demiFin: null },
  'scénario de Lionel, sens "vers le jour 2" : relâché sur le MATIN du jour 6 -> devient jour 6 ENTIER');

// -- non-régression : un déplacement de plusieurs JOURS ENTIERS (aucun bord
//    en demi-journée avant ni après) préserve la forme, exactement comme le
//    comportement jour-entier déjà en place avant ce round.
assertEqual(sandbox.bordsDeplacementNoteMultiJours(2, 3, null, null, 0, 4, 'matin', 200),
  { giDebut: 4, duree: 3, demiDebut: null, demiFin: null },
  'note de 3 jours pleins décalée de 2 jours entiers -> reste 3 jours pleins, juste déplacée (aucune demi-journée n’apparaît par accident)');

// -- une note DÉJÀ en "jour et demi" (jour plein + matin du jour suivant,
//    round du 03.09.2026/§25) glissée d’UNE SEULE demi-journée dans chaque
//    sens : la translation en demi-slots CONSERVE toujours son total de
//    1 jour et demi (une translation ne change jamais la durée totale de
//    travail — grossir/rétrécir est le rôle du REDIMENSIONNEMENT par
//    poignée, demiPourRedimNote ci-dessus, pas d’un déplacement) ; seule la
//    répartition entre les 2 jours calendaires bouge d’une demi-journée.
assertEqual(sandbox.bordsDeplacementNoteMultiJours(1, 2, null, 'matin', 0, 1, 'aprem', 200),
  { giDebut: 1, duree: 2, demiDebut: 'aprem', demiFin: null },
  '"1 jour et demi" (jour1 plein + matin jour2) décalée d’une demi-journée en avant -> jour1 aprem seul + jour2 plein (toujours 1,5 jour au total)');
assertEqual(sandbox.bordsDeplacementNoteMultiJours(1, 2, null, 'matin', 0, 0, 'aprem', 200),
  { giDebut: 0, duree: 2, demiDebut: 'aprem', demiFin: null },
  '"1 jour et demi" décalée d’une demi-journée en arrière -> jour0 aprem seul + jour1 plein (toujours 1,5 jour, jamais 1 jour ni 2 jours)');

// -- bornes de fenêtre : ne doit jamais sortir de [0, nTotal*2 - 1] en
//    demi-slots (équivalent, en demi-slots, du clamp [0, nTotal-duree] déjà
//    en place pour un déplacement en jours entiers).
assertEqual(sandbox.bordsDeplacementNoteMultiJours(0, 2, 'aprem', 'matin', 0, 0, 'matin', 3),
  { giDebut: 0, duree: 1, demiDebut: null, demiFin: null },
  'tentative de sortir par la GAUCHE de la fenêtre -> reclampé au tout début (demi-slot 0), jamais de position négative');
assertEqual(sandbox.bordsDeplacementNoteMultiJours(0, 2, null, null, 0, 2, 'aprem', 3),
  { giDebut: 1, duree: 2, demiDebut: null, demiFin: null },
  'tentative de sortir par la DROITE de la fenêtre (nTotal=3 jours -> 6 demi-slots, note de 2 jours pleins) -> reclampé à la toute fin, jamais au-delà de nTotal*2-1');

// -- round du 08.09.2026, suite — Lionel : « je n'arrive pas à placer ma
//    note sur lundi aprem [...] ce phénomène ne se produit que quand la
//    bulle fait un jour complet » / « une bulle de 2 case doit garder sa
//    grandeur mais doit pouvoir se déplacer de 1 case ». Avant ce round,
//    seules les notes duree > 1 passaient par bordsDeplacementNoteMultiJours
//    en mode compact ; une note d'1 SEUL jour en JOURNÉE ENTIÈRE passait par
//    demiCiblePourDeplacementNote, qui la reconduit TOUJOURS en jour entier
//    (§42) et ne peut donc la poser que sur un jour ENTIER cible — jamais à
//    cheval sur 2 jours. Une journée entière occupe pourtant exactement 2
//    demi-slots ("2 cases"), au même titre qu'une note "1 jour et demi" : ce
//    modèle doit la traiter pareil, cf. resoudreCibleGroupe (routage étendu
//    à duree === 1 en mode compact).
assertEqual(sandbox.bordsDeplacementNoteMultiJours(0, 1, null, null, 0, 0, 'aprem', 200),
  { giDebut: 0, duree: 2, demiDebut: 'aprem', demiFin: 'matin' },
  'note LUNDI journée entière (duree=1, "2 cases"), clic au tout début, relâchée sur l’APRÈS-MIDI du même jour -> lundi aprem + mardi matin, EXACTEMENT le scénario de Lionel ("je veux qu’elle se déplace à lundi aprem et mardi matin"), sans jamais rétrécir à 1 seule demi-journée');
assertEqual(sandbox.bordsDeplacementNoteMultiJours(0, 1, null, null, 0, 1, 'matin', 200),
  { giDebut: 1, duree: 1, demiDebut: null, demiFin: null },
  'même note glissée d’1 case de PLUS (relâchée sur le MATIN du jour suivant) -> retombe pile sur mardi journée entière (§42 préservé : un jour entier posé sur une frontière de jour reste un jour entier, jamais réduit à une demi-journée)');
assertEqual(sandbox.bordsDeplacementNoteMultiJours(3, 1, null, null, 1, 3, 'matin', 200),
  { giDebut: 2, duree: 2, demiDebut: 'aprem', demiFin: 'matin' },
  'note journée entière (jour 3), clic sur son DERNIER demi-slot (offsetHalvesClic=1), relâchée sur le MATIN du même jour 3 -> décalée d’1 case en arrière (jour2-aprem + jour3-matin), garde ses 2 demi-slots');

// =======================================================================
// 6) demisOccupeesTache — round du 08.09.2026, suite, encore (§49). Lionel,
//    après le §48 (fusion visuelle après coup, abandonnée) : « 1 tâche ne
//    peux pas etre mise sur 2 case, elle s'étent de 1 jour (de 1 a 3 ,5 ou
//    7 case) » — la vraie cause était que tâches/absences avaient toujours
//    UN SEUL champ `demi` fixe pour toute leur durée, contrairement aux
//    notes/jalons (demiDebut/demiFin, un par bord). Le correctif leur donne
//    exactement le même modèle : 1 tâche/absence est désormais NATIVEMENT
//    UN SEUL item continu (plus besoin de fusionner quoi que ce soit après
//    coup, cf. FRONTEND-CHANGELOG §49 — construireRunsCompacts et
//    demiFixePourItem, le pansement du §48, ont disparu avec elle).
//    demisOccupeesTache(it, gi) est la fonction PARTAGÉE qui répond
//    "quel(s) demi(s) cette tâche occupe-t-elle CE jour précis" — utilisée
//    à la fois par la projection vers les cellules serveur
//    (calculerEtatLocal) et par toute la mécanique de sélection/survol
//    (chantierExistantDansCase, selectionnerDepuisCellules).
// =======================================================================
(function () {
  // Plage de 3 jours, "aprem jour1 + jour2 plein + matin jour3" (exactement
  // la forme d'une note/un jalon "1 jour et demi", étendue à 1 jour de
  // plus) : giDebut=2 (jour1), duree=3 (jours 2,3,4), demiDebut='aprem',
  // demiFin='matin'.
  var it = { giDebut: 2, duree: 3, demiDebut: 'aprem', demiFin: 'matin' };
  assertEqual(sandbox.demisOccupeesTache(it, 1), null, 'jour hors de la plage (avant giDebut) -> null');
  assertEqual(sandbox.demisOccupeesTache(it, 5), null, 'jour hors de la plage (après giDebut+duree) -> null');
  assertEqual(sandbox.demisOccupeesTache(it, 2), ['aprem'], '1er jour de la plage -> seulement demiDebut ("de 1 a 3 case" : ici 1 seule case)');
  assertEqual(sandbox.demisOccupeesTache(it, 3), ['matin', 'aprem'], 'jour STRICTEMENT entre les 2 bords -> journée entière, quels que soient demiDebut/demiFin');
  assertEqual(sandbox.demisOccupeesTache(it, 4), ['matin'], 'dernier jour de la plage -> seulement demiFin');
})();
(function () {
  var it = { giDebut: 5, duree: 1, demiDebut: 'matin', demiFin: 'matin' };
  assertEqual(sandbox.demisOccupeesTache(it, 5), ['matin'],
    'plage d’un seul jour en demi-journée -> son unique demi (invariant demiDebut === demiFin préservé, cf. bornesDepuisDemiSlots)');
})();
(function () {
  var it = { giDebut: 5, duree: 2, demiDebut: null, demiFin: null };
  assertEqual(sandbox.demisOccupeesTache(it, 5), ['matin', 'aprem'], 'aucun bord en demi-journée -> journée entière sur le 1er jour');
  assertEqual(sandbox.demisOccupeesTache(it, 6), ['matin', 'aprem'], 'aucun bord en demi-journée -> journée entière sur le dernier jour aussi');
})();

console.log('\n' + (total - echecs) + '/' + total + ' assertions passées.');
if (echecs > 0) { console.error(echecs + ' échec(s).'); process.exit(1); }
