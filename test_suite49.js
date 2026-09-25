const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 49) — proposition 14 retenue par Lionel :
// « Sauvegarde automatique : un export régulier des données Supabase,
// pour pouvoir revenir en arrière après une grosse erreur. »
// Section « Sauvegardes » de l'onglet Général (js/page-sauvegardes.js) ;
// la sauvegarde elle-même est côté serveur (sql/0017_sauvegardes.sql,
// testé directement sur la base : copie, dédoublonnage, restauration).
//
// Lancer : node test_suite49.js

const S = (id, cree_le, origine, lignes) => ({ id, cree_le, origine, lignes, contenu: { version: 1, tables: { personnes: [{ id: 1, nom: 'Lionel' }] } } });
const BD = { sauvegardes: [S(1, '2026-09-22T02:17:00Z', 'auto', 330), S(2, '2026-09-24T02:17:00Z', 'auto', 336), S(3, '2026-09-23T15:40:00Z', 'avant_restauration', 331)] };
const lignes = (page) => page.$$eval('#listeSauvegardes .ligne-sauvegarde', (ls) => ls.map((l) => l.querySelector('.sv-infos').textContent));
const ouvrirGeneral = (page) => page.evaluate(() => document.querySelector('.onglet[data-page="general"]').click());

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  for (const largeur of [1300, 360]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: 900 }, hasTouch: largeur < 600, bd: BD, date: '2026-09-24T10:00:00Z' });
    const consoles = [];
    page.on('console', (m) => consoles.push(m.text()));
    await ouvrirGeneral(page); await page.waitForTimeout(250);

    const l0 = await lignes(page);
    verifier(l0.length === 3 && /^Jeu\. 24 sept\. 2026, \d\d:17Automatique336 lignes$/.test(l0[0]) && /Avant restauration331 lignes$/.test(l0[1]) && /^Mar\. 22 sept\. 2026/.test(l0[2]),
      largeur + ' px : liste des sauvegardes, plus récentes en haut — date, type, nombre de lignes (' + l0.join(' | ') + ')');
    const bloc = await page.evaluate(() => ({ titre: document.querySelector('.bloc-sauvegardes .titre-liste').textContent,
      boutons: [...document.querySelectorAll('.bloc-sauvegardes button')].map((b) => b.textContent).join('|'),
      deborde: document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll('.ligne-sauvegarde')].some((l) => l.scrollWidth > l.clientWidth + 1) }));
    verifier(bloc.titre === 'Sauvegardes' && bloc.boutons === 'Importer un fichier…|Sauvegarder maintenant' && !bloc.deborde,
      largeur + ' px : section Sauvegardes de l\'onglet Général, sans débordement (' + bloc.boutons + ')');

    // Sauvegarder maintenant.
    await page.click('#btnSauvegarderMaintenant'); await page.waitForTimeout(250);
    const l1 = await lignes(page);
    verifier(l1.length === 4 && /Manuelle/.test(l1[0]) && await page.evaluate(() => window.__ECRITURES.indexOf('rpc:creer_sauvegarde') >= 0),
      largeur + ' px : « Sauvegarder maintenant » — sauvegarde manuelle en haut de la liste (' + l1[0] + ')');

    // Télécharger.
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.ligne-sauvegarde[data-id="2"] .lien-telecharger')]);
    const chemin = await dl.path();
    const fichier = JSON.parse(require('fs').readFileSync(chemin, 'utf8'));
    verifier(/^planning-sauvegarde-2026-09-24-\d{4}\.json$/.test(dl.suggestedFilename()) && fichier.version === 1 && fichier.tables.personnes[0].nom === 'Lionel',
      largeur + ' px : « Télécharger » — fichier .json de la sauvegarde (' + dl.suggestedFilename() + ')');

    // Importer : un fichier valide rejoint la liste ; un autre est refusé.
    await page.setInputFiles('#fichierSauvegarde', { name: 'planning.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fichier)) });
    await page.waitForTimeout(300);
    const l2 = await lignes(page);
    verifier(l2.length === 5 && l2.some((t) => /Importée1 ligne$/.test(t)), largeur + ' px : « Importer un fichier… » — la sauvegarde importée rejoint la liste');
    await page.setInputFiles('#fichierSauvegarde', { name: 'autre.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
    await page.waitForTimeout(300);
    const toast1 = await page.evaluate(() => [...document.querySelectorAll('.toast, #toast')].map((t) => t.textContent).join(' '));
    verifier((await lignes(page)).length === 5 && /Import impossible/.test(toast1), largeur + ' px : un fichier qui n\'est pas une sauvegarde est refusé (' + toast1.trim().slice(0, 90) + ')');

    // Restaurer : confirmation, annulable ; confirmée → appel serveur puis rechargement.
    await page.click('.ligne-sauvegarde[data-id="1"] .lien-restaurer'); await page.waitForTimeout(150);
    const conf = await page.$eval('.confirm-pop .confirm-texte', (e) => e.textContent);
    verifier(/^Restaurer la sauvegarde du Mar\. 22 sept\. 2026, \d\d:17 \? Tout le planning/.test(conf) && /« Avant restauration »/.test(conf),
      largeur + ' px : « Restaurer… » demande confirmation et rappelle la sauvegarde de l\'état actuel');
    await page.click('.confirm-pop .c-annuler'); await page.waitForTimeout(150);
    verifier(!consoles.some((c) => /restaurer_sauvegarde/.test(c)), largeur + ' px : Annuler — rien n\'est restauré');
    await page.evaluate(() => { window.__avantRechargement = true; });
    await page.click('.ligne-sauvegarde[data-id="1"] .lien-restaurer'); await page.waitForTimeout(150);
    await page.click('.confirm-pop .c-ok');
    await page.waitForFunction(() => !window.__avantRechargement, null, { timeout: 5000 }).catch(() => {});
    verifier(consoles.some((c) => c === 'RPC restaurer_sauvegarde {"p_id":1}') && await page.evaluate(() => !window.__avantRechargement),
      largeur + ' px : confirmé — restauration demandée au serveur, puis la page se recharge');

    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // Serveur injoignable : message dans la liste, pas d'erreur.
  const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD, tablesEnEchec: ['sauvegardes'] });
  await ouvrirGeneral(page); await page.waitForTimeout(250);
  const msg = await page.$eval('#listeSauvegardes', (e) => e.textContent);
  verifier(/^Sauvegardes illisibles/.test(msg), 'table illisible : message clair (' + msg + ')');
  const vide = await ouvrirPlanning(browser, { bd: { sauvegardes: [] } });
  await ouvrirGeneral(vide.page); await vide.page.waitForTimeout(250);
  verifier(/^Aucune sauvegarde pour l’instant/.test(await vide.page.$eval('#listeSauvegardes', (e) => e.textContent)), 'aucune sauvegarde : la liste le dit');
  toutesErreurs.push(...erreurs, ...vide.erreurs);

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
