const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 94). Lionel :
//   « Ajoute une ombre ou quelque chose d'autre qui permet de mieux voir 2
//     bulles empilé de la même couleurs. »
// Vérifie, ordinateur et téléphone (vue « 1 jour ») :
//   1. dans une pile, chaque carte posée sur une autre porte data-empile,
//      la première de la pile et une bulle seule non ;
//   2. carte empilée : ombre portée vers le haut (filter drop-shadow) et
//      liseré en haut (::before, box-shadow inset) ; les autres sans ;
//   3. la pile se refait au curseur « Hauteur des lignes » : marques
//      inchangées.
//
// Lancer : node test_suite94.js

const PERS = ['Lionel', 'Mathis', 'Antoine'].map((nom, i) => ({ id: i + 1, nom, sous_traitant: false, ordre: i + 1, actif: true }));
let tid = 1;
const T = (pid, date, demi, texte, ordre) => ({ id: tid++, personne_id: pid, date, demi, ordre: ordre || 0, texte, chantier_id: 1 });
const TACHES = [
  T(2, '2026-09-24', 'matin', 'A1', 0), T(2, '2026-09-24', 'matin', 'A2', 1),
  T(3, '2026-09-24', 'matin', 'X1', 0), T(3, '2026-09-24', 'matin', 'X2', 1), T(3, '2026-09-24', 'matin', 'X3', 2),
  T(1, '2026-09-24', 'matin', 'Seule')
];
const BD = () => ({ personnes: PERS, taches: TACHES.map((t) => Object.assign({}, t)) });

const releve = (page) => page.evaluate(() => {
  const out = {};
  document.querySelectorAll('#racine .scroller .bulle').forEach((b) => {
    const t = b.querySelector('.b-txt').textContent.trim();
    const c = [...b.querySelectorAll(':scope > .b-carte')].find((x) => x.getBoundingClientRect().width > 0) || b.querySelector('.b-carte');
    const cs = getComputedStyle(c), av = getComputedStyle(c, '::before');
    out[t] = { empile: c.hasAttribute('data-empile'), ombre: /drop-shadow/.test(cs.filter), lisere: av.content !== 'none' && /inset/.test(av.boxShadow) };
  });
  return out;
});
const attendu = { A1: false, A2: true, X1: false, X2: true, X3: true, Seule: false };
const conforme = (r) => Object.keys(attendu).every((k) => r[k] && r[k].empile === attendu[k] && r[k].ombre === attendu[k] && r[k].lisere === attendu[k]);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];
  for (const [nom, opts] of [['ordinateur', { viewport: { width: 1400, height: 900 } }], ['téléphone', { viewport: { width: 390, height: 800 }, hasTouch: true }]]) {
    const { page, erreurs } = await ouvrirPlanning(browser, Object.assign({ bd: BD() }, opts));
    await page.waitForTimeout(500);
    let r = await releve(page);
    verifier(conforme(r), nom + ' : cartes posées sur une autre marquées, ombrées et liserées ; première de la pile et bulle seule sans (' + JSON.stringify(r) + ')');
    await page.evaluate(() => changerOptionAffichage(profilAppareil_() === 'tel' ? 'lignesTel' : 'lignesOrdi', '3', undefined, true));
    await page.waitForTimeout(200);
    r = await releve(page);
    verifier(conforme(r), nom + ' : pile refaite à 3 bulles, mêmes marques');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
