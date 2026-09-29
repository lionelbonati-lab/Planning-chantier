const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 112). Lionel : « Le bouton "+" doit revenir un
// ajout rapide comme avant, mais ajoute une nouvelle icone pour ce mode
// ajout. dans la tool-bar, pas important, peut disparaitre en mode portable
// car moins utile. »
// Vérifie :
//   1. ordinateur : le « + » ouvre le menu Tâche/Absence/Note/Jalon sans
//      toucher au mode ; Tâche -> « pour qui ? » -> une personne = fenêtre
//      d'ajout ouverte, menu refermé ;
//   2. l'icône #btnModeAjout allume puis éteint le mode ajout ;
//   3. téléphone : l'icône, rangée dans « ⋮ », y est masquée éteinte et
//      visible allumée (pour en sortir) ; « + » toujours dans la barre.
//
// Lancer : node test_suite112.js

const PERS = [1, 2].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const BD = () => ({ personnes: PERS, taches: [] });
const etat = (page) => page.evaluate(() => {
  const m = document.getElementById('menuAjoutElement'), b = document.getElementById('btnModeAjout');
  const vis = (x) => !!(x && x.offsetWidth && !x.closest('[hidden]'));
  return {
    menu: m.classList.contains('ouvert'), ajout: modeAjoutPlanning, icone: b.classList.contains('actif'), iconeVisible: vis(b),
    plusVisible: vis(document.getElementById('btnAjoutElement')),
    choix: [...m.querySelectorAll('[data-page="choix"] [data-type]')].filter(vis).map((x) => x.dataset.type).join(','),
    pourQui: [...m.querySelectorAll('#pageAjoutPersonne [data-personne]')].filter(vis).map((x) => x.textContent).join(','),
    popup: !!document.querySelector('.menu-pop, .form-pop, .modal-overlay:not([hidden])'),
  };
});

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1 et 2. Ordinateur -------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    let e = await etat(page);
    verifier(!e.menu && !e.ajout && !e.icone && e.iconeVisible && e.plusVisible, 'départ : mode sélection, les 2 icônes affichées ' + JSON.stringify(e));
    await page.click('#btnAjoutElement');
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.menu && e.choix === 'tache,absence,note,jalon' && !e.ajout, '« + » : menu Tâche/Absence/Note/Jalon, mode inchangé ' + JSON.stringify(e));
    await page.click('#menuAjoutElement [data-type="tache"]');
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.menu && e.pourQui === 'Personne 1,Personne 2', 'Tâche : page « pour qui ? » ' + JSON.stringify(e));
    await page.click('#pageAjoutPersonne [data-personne="1"]');
    await page.waitForTimeout(300);
    e = await etat(page);
    verifier(!e.menu && e.popup, 'personne choisie : menu refermé, fenêtre d\'ajout ouverte ' + JSON.stringify(e));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    await page.click('#btnModeAjout');
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.ajout && e.icone && !e.menu && await page.evaluate(() => document.body.classList.contains('planning-mode-ajout')), 'icône du mode ajout : allumée ' + JSON.stringify(e));
    await page.click('#btnModeAjout');
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(!e.ajout && !e.icone, 'rappuyée : mode sélection ' + JSON.stringify(e));
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Téléphone ---------------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD() });
    await page.click('#btnPlusOutils');
    await page.waitForTimeout(150);
    let e = await etat(page);
    verifier(!e.iconeVisible && e.plusVisible, 'téléphone, « ⋮ » ouvert : icône du mode ajout masquée, « + » affiché ' + JSON.stringify(e));
    await page.click('#btnPlusOutils');
    await page.evaluate(() => changerModeAjoutPlanning(true));
    await page.waitForTimeout(150);
    await page.click('#btnPlusOutils');
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.iconeVisible, 'téléphone, mode ajout allumé : icône affichée dans « ⋮ » pour en sortir ' + JSON.stringify(e));
    await page.click('#btnModeAjout');
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(!e.ajout && !e.iconeVisible, 'téléphone : touchée = mode sélection, icône de nouveau masquée ' + JSON.stringify(e));
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
