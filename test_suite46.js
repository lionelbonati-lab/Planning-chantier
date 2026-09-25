const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 46) — Lionel : « Mise en page : ajouter aussi
// le format de la date d'impression. Aperçu : enlever niveau de gris des
// options de couleurs car les imprimantes gèrent ça. »
// Onglet : texteDateImpression / bloc « Date d'impression »
// (js/page-mise-en-page.js) ; aperçu : openPrintSheet (js/impression.js).
//
// Lancer : node test_suite46.js

const upserts = (page) => page.evaluate(() => window.__ECRITURES.filter((e) => e.indexOf('reglages:upsert:') === 0).map((e) => JSON.parse(e.slice(16))[0]));
const aide = (page) => page.$eval('.mep-aide-date-impr', (e) => e.textContent);
const ouvrirOnglet = (page) => page.evaluate(() => { if (popFermerActuel) popFermerActuel(); document.querySelector('.onglet[data-page="mise-en-page"]').click(); });

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Onglet Mise en page : format de la date d'impression ---
  for (const largeur of [1300, 360]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: 900 }, bd: { reglages: [] } });
    await ouvrirOnglet(page); await page.waitForTimeout(200);
    const bloc = await page.evaluate(() => {
      const f = [...document.querySelectorAll('#mepFormulaire fieldset')].pop();
      return { legende: f.querySelector('legend').textContent,
        options: [...f.querySelectorAll('select[data-g="dateImpr"] option')].map((o) => o.textContent + (o.selected ? '*' : '')).join('|'),
        cases: [...f.querySelectorAll('input[type=checkbox]')].map((c) => c.dataset.k + '=' + c.checked).join(' ') };
    });
    verifier(bloc.legende === 'Date d’impression' && bloc.options === '25.09.2026*|25.09.26|25 sept. 2026|25 septembre 2026|jeudi 25 septembre 2026' && bloc.cases === 'heure=true prefixe=true',
      largeur + ' px : bloc « Date d’impression » en dernier — 5 formats, heure et « Imprimé le » cochés (' + bloc.options + ')');
    verifier(await aide(page) === 'Exemple : « Imprimé le 24.09.2026 à 10:00 » — écrite dans le pied de page.', largeur + ' px : par défaut, comme avant (' + await aide(page) + ')');

    await page.focus('select[data-g="dateImpr"][data-k="format"]');
    await page.selectOption('select[data-g="dateImpr"][data-k="format"]', 'abrege');
    verifier(await aide(page) === 'Exemple : « Imprimé le 24 sept. 2026 à 10:00 » — écrite dans le pied de page.' &&
      await page.evaluate(() => document.activeElement.dataset.k === 'format'), largeur + ' px : mois abrégé — exemple à jour, focus gardé (' + await aide(page) + ')');
    await page.click('[data-g="dateImpr"][data-k="heure"]');
    await page.click('[data-g="dateImpr"][data-k="prefixe"]');
    await page.selectOption('select[data-g="dateImpr"][data-k="format"]', 'long');
    verifier(await aide(page) === 'Exemple : « Jeudi 24 septembre 2026 » — écrite dans le pied de page.', largeur + ' px : longue, sans heure ni « Imprimé le » : majuscule en tête (' + await aide(page) + ')');
    const schema = await page.$eval('#mepApercu .mep-zone-bas .mep-z-c', (e) => e.textContent);
    verifier(schema === 'Jeudi 24 septembre 2026', largeur + ' px : aperçu schématique du pied de page à jour (' + schema + ')');
    await page.click('[data-g="entete"][data-k="date"]');
    verifier(/écrite dans l’en-tête et le pied de page\.$/.test(await aide(page)), largeur + ' px : date aussi cochée dans l\'en-tête — l\'aide le dit');
    await page.click('[data-g="entete"][data-k="date"]'); await page.click('[data-g="pied"][data-k="date"]');
    verifier(/cochée ni dans l’en-tête ni dans le pied de page : elle ne s’imprime pas\.$/.test(await aide(page)), largeur + ' px : cochée nulle part — l\'aide prévient qu\'elle ne s\'imprime pas');
    await page.click('[data-g="pied"][data-k="date"]');
    await page.waitForTimeout(700);
    const u = (await upserts(page)).pop();
    verifier(u && JSON.stringify(u.valeur.dateImpr) === '{"format":"long","heure":false,"prefixe":false}', largeur + ' px : enregistré sur le compte (' + JSON.stringify(u && u.valeur.dateImpr) + ')');
    if (largeur === 360) {
      const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll('#mepFormulaire fieldset')].some((f) => f.scrollWidth > f.clientWidth + 1));
      verifier(!deborde, '360 px : onglet sans défilement horizontal');
    }

    // Aperçu d'impression : pied simulé et vraie règle @page.
    await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(200);
    const impr = await page.evaluate(() => ({ pied: document.querySelector('.impr-pied-ecran').textContent, page: document.querySelector('.style-page-impression').textContent }));
    verifier(impr.pied.includes('Jeudi 24 septembre 2026') && impr.page.includes('@bottom-center { content: "Jeudi 24 septembre 2026";'),
      largeur + ' px : aperçu d\'impression — pied de page et règle @page au nouveau format');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. Formats, 1er du mois, valeurs illisibles ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1300, height: 900 }, bd: { reglages: [] } });
    const formats = await page.evaluate(() => {
      const m = normaliserMiseEnPage_({}), d = new Date(2026, 9, 1, 8, 5);
      return ['chiffres', 'court', 'abrege', 'complet', 'long'].map((f) => { m.dateImpr = { format: f, heure: f !== 'court', prefixe: f !== 'complet' }; return texteDateImpression(d, m); });
    });
    verifier(formats.join(' | ') === 'Imprimé le 01.10.2026 à 08:05 | Imprimé le 01.10.26 | Imprimé le 1er oct. 2026 à 08:05 | 1er octobre 2026 à 08:05 | Imprimé le jeudi 1er octobre 2026 à 08:05',
      'formats : ' + formats.join(' | '));
    const norm = await page.evaluate(() => JSON.stringify(normaliserMiseEnPage_({ dateImpr: { format: 'iso', heure: 'oui', prefixe: false } }).dateImpr));
    verifier(norm === '{"format":"chiffres","heure":true,"prefixe":false}', 'valeurs illisibles : défaut, le reste gardé (' + norm + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Aperçu : plus de « Niveaux de gris » ---
  for (const [retenu, attendu] of [['gris', 'couleurs'], ['nb', 'nb']]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1300, height: 900 },
      localStorage: { 'planning.impression.reglages': JSON.stringify({ rendu: retenu, demis: true, masques: {} }) } });
    await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ choix: [...document.querySelectorAll('[data-r="rendu"]')].map((x) => x.value).join(), coche: document.querySelector('[data-r="rendu"]:checked').value,
      gris: document.querySelector('.impr-reglages').textContent.includes('Niveaux de gris'), classe: document.querySelector('.print-doc').className }));
    verifier(r.choix === 'couleurs,nb' && !r.gris && r.coche === attendu && !/rendu-gris/.test(r.classe),
      'rendu « ' + retenu + ' » retenu : 2 choix (Couleurs des chantiers, Noir et blanc), « ' + attendu + ' » coché (' + JSON.stringify(r) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
