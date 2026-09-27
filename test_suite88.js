const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 27.09.2026 (suite 88). Lionel : « J'aimerai des boutons d'accès
// rapide pour enregistrer des notes rapidement. » (manifest.json :
// shortcuts ; js/page-notes.js : lancerRaccourciAppli)
// Vérifie :
//   1. manifeste : raccourcis « Nouvelle note » et « Mes notes », icônes
//      96×96 présentes ;
//   2. « Nouvelle note » : la fiche s'ouvre sur aujourd'hui, texte prêt à
//      écrire ; OK enregistre la note ; l'adresse perd « raccourci » ;
//   3. « Mes notes » : page Notes ouverte ;
//   4. sans raccourci : rien d'ouvert.
//
// Lancer : node test_suite88.js

const CAPTURES = process.env.CAPTURE_DIR || null;

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Manifeste ------------------------------------------------------
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
  const r = (m.shortcuts || []).map((s) => {
    const ic = (s.icons || [])[0] || {};
    const f = path.join(__dirname, ic.src || '');
    let taille = '';
    if (ic.src && fs.existsSync(f)) { const b = fs.readFileSync(f); taille = b.readUInt32BE(16) + 'x' + b.readUInt32BE(20); }
    return s.name + ' → ' + s.url + ' (' + taille + '/' + ic.sizes + ')';
  });
  verifier(r.join(' | ') === 'Nouvelle note → index.html?raccourci=nouvelle-note (96x96/96x96) | Mes notes → index.html?raccourci=notes (96x96/96x96)',
    'manifeste : raccourcis « Nouvelle note » et « Mes notes », icônes 96×96 (' + r.join(' | ') + ')');

  // --- 2. Nouvelle note (téléphone) -------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, query: '?raccourci=nouvelle-note' });
    await page.waitForTimeout(300);
    const f = await page.evaluate(() => {
      const pop = document.querySelector('.fiche-note');
      const champ = pop && pop.querySelector('.f-texte-note');
      return { ouverte: !!pop, focus: !!champ && document.activeElement === champ, dates: pop ? pop.querySelector('.dates-plage').textContent.replace(/\s+/g, ' ').trim() : '',
        adresse: location.search, suppr: !!(pop && pop.querySelector('.f-suppr')) };
    });
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s88-nouvelle-note.png' });
    verifier(f.ouverte && f.focus && !f.suppr && f.adresse === '', 'raccourci « Nouvelle note » : fiche ouverte, texte prêt, adresse nettoyée (' + JSON.stringify(f) + ')');
    verifier(/24/.test(f.dates) && /sept/i.test(f.dates), 'fiche sur aujourd’hui (jeu. 24 sept.) (' + f.dates + ')');
    await page.keyboard.type('Livraison béton 7h');
    await page.click('.fiche-note .f-ok');
    await page.waitForTimeout(1200);
    const n = await page.evaluate(() => ({ notes: (__BD.notes || []).map((x) => x.date + ' ' + x.texte).join(','), fiche: !!document.querySelector('.fiche-note'),
      grille: [...document.querySelectorAll('#racine .note, #racine [class*="note"]')].some((e) => /Livraison béton 7h/.test(e.textContent)) }));
    verifier(n.notes === '2026-09-24 Livraison béton 7h' && !n.fiche, 'OK : note enregistrée le 24 sept., fiche fermée (' + JSON.stringify(n) + ')');
    verifier(n.grille, 'la note apparaît dans le planning');
    await page.reload(); await page.waitForSelector('#legendeBarre'); await page.waitForTimeout(400);
    const re = await page.evaluate(() => !!document.querySelector('.fiche-note'));
    verifier(!re, 'recharger la page ne rouvre pas la fiche');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 3. Mes notes ------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, query: '?raccourci=notes',
      bd: { notes: [{ id: 1, date: '2026-09-25', texte: 'Réunion de chantier', important: false, demi: null }] } });
    await page.waitForTimeout(600);
    const p = await page.evaluate(() => ({ active: (document.querySelector('.page.actif') || {}).id, liste: (document.getElementById('listeNotesAVenir') || {}).textContent || '', adresse: location.search }));
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s88-mes-notes.png' });
    verifier(p.active === 'page-notes' && /Réunion de chantier/.test(p.liste) && p.adresse === '', 'raccourci « Mes notes » : page Notes ouverte (' + JSON.stringify(p) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 4. Sans raccourci -------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 } });
    const p = await page.evaluate(() => ({ fiche: !!document.querySelector('.fiche-note'), active: (document.querySelector('.page.actif') || {}).id }));
    verifier(!p.fiche && p.active === 'page-planning', 'ouverture normale : planning, aucune fiche (' + JSON.stringify(p) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
