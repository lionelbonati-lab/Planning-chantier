const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 01.10.2026 (suite 140). Lionel : « J'ai toujour 2 messages qui
// s'affichent a chaque mise à jours. recharger et mise à jour ». Son
// choix : « Un seul message ».
// Vérifie :
//   1. nouvelle version : un seul bandeau, un bouton « Recharger » ;
//   2. « Recharger » : le bandeau s'efface, l'écran de chargement ordinaire
//      (« Chargement du planning… »), aucun texte « Mise à jour » ;
//   3. aucune erreur JS.
// (Le parcours complet avec le service worker : test_suite96, 100, 120_sw.)
//
// Lancer : node test_suite140.js

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const { page, erreurs } = await ouvrirPlanning(browser, {});
  await page.waitForTimeout(400);

  // Recopie + rechargement remplacés par un témoin (pas de service worker ici).
  await page.evaluate(() => { window.rechargerAppliNeuve_ = () => { window.__recharge = true; }; proposerNouvelleVersion(); proposerNouvelleVersion(); });
  const b = await page.evaluate(() => ({ n: document.querySelectorAll('.maj-appli').length, texte: document.querySelector('#majAppli span').textContent, boutons: [...document.querySelectorAll('#majAppli button')].map((x) => x.textContent.trim() || x.title).join('/') }));
  verifier(b.n === 1 && /Nouvelle version/.test(b.texte) && b.boutons === 'Recharger/×', 'nouvelle version : un seul bandeau « Recharger » (' + JSON.stringify(b) + ')');

  await page.click('#majAppli .maj-recharger');
  await page.waitForTimeout(200);
  const apres = await page.evaluate(() => ({ bandeau: !!document.getElementById('majAppli'), chargement: (document.querySelector('.loading-screen .msg') || {}).textContent || '', majTexte: /Mise à jour/.test(document.body.innerText), recharge: !!window.__recharge }));
  verifier(!apres.bandeau && apres.chargement === 'Chargement du planning…' && !apres.majTexte && apres.recharge,
    '« Recharger » : bandeau effacé, écran de chargement ordinaire, plus de « Mise à jour… » (' + JSON.stringify(apres) + ')');

  verifier(erreurs.length === 0, 'aucune erreur JS (' + erreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan(erreurs));
})();
