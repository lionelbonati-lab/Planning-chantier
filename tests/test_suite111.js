const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 111). Lionel : « esc doit pouvoir faire sortir
// du mode ajout ».
// Vérifie :
//   1. mode ajout, popup d'ajout ouvert : Échap ferme d'abord le popup, le
//      mode ajout reste ;
//   2. Échap suivant : retour au mode sélection (« + » relâché, retenu) ;
//   3. Échap en mode sélection : rien ne change.
//
// Lancer : node test_suite111.js

const PERS = [1, 2].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const BD = () => ({ personnes: PERS, taches: [] });
const etat = (page) => page.evaluate(() => ({
  ajout: modeAjoutPlanning, bouton: document.getElementById('btnAjoutElement').classList.contains('actif'),
  corps: document.body.classList.contains('planning-mode-ajout'), ls: localStorage.getItem('planning.modeAjout'),
  popup: !!document.querySelector('.menu-pop, .form-pop'),
}));

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];
  const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD(), localStorage: { 'planning.modeAjout': '1' } });

  const p = await page.evaluate(() => {
    let gi = -1;
    for (let g = 0; g < 80; g++) if (isoDeGi(g) === '2026-09-23') { gi = g; break; }
    const r = document.querySelector('.cell[data-kind="personne"][data-personne="1"][data-demi="matin"][data-jour="' + gi + '"]').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(200);
  let e = await etat(page);
  verifier(e.ajout && e.popup, 'mode ajout : clic sur une case = popup d\'ajout ' + JSON.stringify(e));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  e = await etat(page);
  verifier(e.ajout && !e.popup, '1er Échap : popup fermé, mode ajout gardé ' + JSON.stringify(e));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  e = await etat(page);
  verifier(!e.ajout && !e.bouton && !e.corps && e.ls === '0', '2e Échap : mode sélection, « + » relâché et retenu ' + JSON.stringify(e));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  e = await etat(page);
  verifier(!e.ajout && !e.popup, 'Échap en mode sélection : rien ne change ' + JSON.stringify(e));

  toutesErreurs.push(...erreurs);
  await page.close();
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
