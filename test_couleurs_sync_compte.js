const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur } = require('./aide_tests');

// Round du 24.09.2026 — Lionel : « Les couleurs devrait être les mêmes sur
// tous les appareils du même compte. Comme les chantiers. » La table
// Supabase `couleurs_perso` est la source de vérité (js/page-couleurs.js),
// le localStorage "planning.couleurs" n'est plus qu'un cache anti-flash.
// Vérifie ce qu'un seul appareil ne montre pas :
//  1. une couleur venue du serveur (posée depuis un AUTRE appareil) gagne
//     sur un cache local périmé, et s'affiche dans la page Général ;
//  2. changer une couleur ici écrit sur `couleurs_perso` (seulement le
//     thème modifié), et la réinitialiser supprime la ligne ;
//  3. serveur injoignable : repli sur le dernier cache local, pas sur les
//     couleurs par défaut du code.
//
// Réécrit à la suite 24 (Lionel : « Réécrire les 4 tests périmés ») : vraie
// page + faux Supabase (aide_tests.js), l'appli charge `couleurs_perso` par
// son propre chemin au lieu d'un espion posé après coup.
//
// Lancer : node test_couleurs_sync_compte.js

const accent = (page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase());

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // 1. + 2. Serveur joignable, cache local périmé.
  {
    const { page, erreurs } = await ouvrirPlanning(browser, {
      bd: { couleurs_perso: [{ id: 'principale', clair: '#112233', sombre: null }] },
      localStorage: { 'planning.couleurs': JSON.stringify({ principale: { clair: '#999999' } }) }
    });
    await page.emulateMedia({ colorScheme: 'light' });
    verifier(await accent(page) === '#112233', 'couleur du serveur appliquée, pas le cache local périmé (' + await accent(page) + ')');
    const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('planning.couleurs') || '{}'));
    verifier(cache.principale && cache.principale.clair === '#112233', 'cache local remis à jour depuis le serveur');

    await page.click('.onglet[data-page="general"]');
    await page.waitForSelector('.rc-clair[data-groupe="principale"]');
    const champ = await page.inputValue('.rc-clair[data-groupe="principale"]');
    verifier(champ === '#112233', 'page Général : le champ « principale » affiche la couleur du serveur (' + champ + ')');

    await page.evaluate(() => {
      var input = document.querySelector('.rc-clair[data-groupe="fond"]');
      input.value = '#aabbcc';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const fond = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().toLowerCase());
    verifier(fond === '#aabbcc', 'aperçu immédiat de la couleur de fond (' + fond + ')');
    await page.waitForTimeout(700); // > 400 ms d'attente avant l'écriture serveur
    const ligne = await page.evaluate(() => JSON.stringify(window.__BD.couleurs_perso.find((r) => r.id === 'fond') || null));
    verifier(ligne === '{"id":"fond","clair":"#aabbcc"}', 'écriture sur couleurs_perso, seulement le thème clair (' + ligne + ')');

    await page.click('.reglage-couleur-reset[data-groupe="fond"]');
    await page.waitForTimeout(200);
    const apresReset = await page.evaluate(() => window.__BD.couleurs_perso.map((r) => r.id).join(','));
    verifier(apresReset === 'principale', 'réinitialiser supprime la ligne « fond » côté serveur (' + apresReset + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // 3. Serveur injoignable pour couleurs_perso : repli sur le cache local.
  {
    const { page, erreurs } = await ouvrirPlanning(browser, {
      bd: { couleurs_perso: [{ id: 'principale', clair: '#112233', sombre: null }] },
      localStorage: { 'planning.couleurs': JSON.stringify({ principale: { clair: '#654321' } }) },
      tablesEnEchec: ['couleurs_perso']
    });
    await page.emulateMedia({ colorScheme: 'light' });
    verifier(await accent(page) === '#654321', 'serveur injoignable : repli sur le cache local, pas le défaut du code (' + await accent(page) + ')');
    toutesErreurs.push(...erreurs);
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
