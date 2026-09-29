const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 101). Lionel :
//   « Les lignes de texte des bulles influe sur la hauteur des lignes, je
//     n'aime pas cette approche. au niveau des réglages, hauteur de ligne
//     doit etre ranger dans planning. les hauteurs ne doivent pas etre
//     calculer en fonction du réglage texte dans les bulles. réglage
//     maintenant en pixels. même chose pour jalons et notes. »
// Vérifie, ordinateur puis téléphone :
//   1. page Affichage : « Hauteur des lignes » et « Hauteur Jalons et
//      Notes » dans Planning, en pixels (curseur, « 117 px ») ; « Lignes de
//      texte » dans Bulles ;
//   2. « Lignes de texte » 1 puis 3 : bulles plus hautes, lignes de
//      personnes et Jalons/Notes inchangées ; idem pour les lignes de texte
//      des Jalons et Notes ;
//   3. hauteur réglée au pixel (personnes, Jalons/Notes) ;
//   4. anciens réglages (nombre de bulles) convertis en pixels, à la
//      hauteur qu'ils donnaient.
//
// Lancer : node test_suite101.js

const PERS = ['Lionel', 'Mathis'].map((nom, i) => ({ id: i + 1, nom, sous_traitant: false, ordre: i + 1, actif: true }));
const LONG = 'Coffrage des voiles du sous-sol et reprise des banches';
const BD = () => ({ personnes: PERS, taches: [{ id: 1, personne_id: 1, date: '2026-09-29', demi: 'matin', ordre: 0, texte: LONG, chantier_id: 1 }] });

const releve = (page) => page.evaluate(() => {
  const css = (v) => parseFloat(getComputedStyle(racineEl).getPropertyValue(v));
  const lbl = [...document.querySelectorAll('#racine .scroller .lbl')].find((l) => l.textContent.includes('Mathis'));
  const jal = [...document.querySelectorAll('#racine .lbl')].find((l) => /Jalons/.test(l.textContent));
  return { u: css('--mob-carte-pers'), uJal: css('--mob-carte-jal'), ligne: Math.round(lbl.getBoundingClientRect().height), jal: Math.round(jal.getBoundingClientRect().height) };
});

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  for (const [nom, opts, suffixe, defaut] of [['ordinateur', { viewport: { width: 1400, height: 900 } }, 'Ordi', 117], ['téléphone', { viewport: { width: 390, height: 800 }, hasTouch: true }, 'Tel', 89]]) {
    const { page, erreurs } = await ouvrirPlanning(browser, Object.assign({ bd: BD(), date: '2026-09-29T10:00:00' }, opts));
    await page.waitForTimeout(500);

    // --- 1. Page Affichage ---
    await page.evaluate(() => afficherPage('affichage'));
    await page.waitForTimeout(300);
    const pa = await page.evaluate((sfx) => {
      // Groupe : titre (h2.titre-liste) qui précède la ligne du réglage.
      const groupeDe = (id) => { let t = document.querySelector('#page-affichage .reglage-ligne[data-option="' + id + '"]'); while (t && !t.matches('.titre-liste')) t = t.previousElementSibling; return t ? t.textContent : '?'; };
      const c = document.querySelector('#page-affichage .curseur-option[data-option="hauteurLigne' + sfx + '"]');
      return { h: groupeDe('hauteurLigne' + sfx), j: groupeDe('hauteurJal' + sfx), l: groupeDe('lignes'), lj: groupeDe('lignesJal'), min: c && c.min, max: c && c.max, lib: c && c.parentNode.querySelector('.curseur-valeur').textContent, visible: c && !c.closest('.reglage-ligne').hidden };
    }, suffixe);
    verifier(pa.h === 'Planning' && pa.j === 'Planning' && pa.l === 'Bulles' && pa.lj === 'Bulles' && pa.visible && pa.lib === defaut + ' px',
      nom + ' : hauteurs dans Planning, en pixels (« ' + pa.lib + ' »), lignes de texte dans Bulles (' + JSON.stringify(pa) + ')');
    await page.evaluate(() => afficherPage('planning'));
    await page.waitForTimeout(400);

    // --- 2. Lignes de texte sans effet sur les hauteurs ---
    const r0 = await page.evaluate(() => { changerOptionAffichage('lignes', '1'); }).then(() => page.waitForTimeout(400)).then(() => releve(page));
    await page.evaluate(() => changerOptionAffichage('lignes', '3'));
    await page.waitForTimeout(400);
    const r3 = await releve(page);
    verifier(r3.u > r0.u + 20 && r0.ligne === defaut && r3.ligne === defaut && r0.jal === r3.jal,
      nom + ' : lignes de texte 1 puis 3 — bulles de ' + r0.u + ' puis ' + r3.u + ' px, lignes toujours de ' + r3.ligne + ' px (Jalons ' + r0.jal + ' / ' + r3.jal + ')');
    await page.evaluate(() => { changerOptionAffichage('lignes', '2'); changerOptionAffichage('lignesJal', '2'); });
    await page.waitForTimeout(400);
    const rj = await releve(page);
    verifier(rj.uJal > r0.uJal + 8 && rj.jal === 32 && rj.ligne === defaut,
      nom + ' : lignes de texte des Jalons à 2 — bulles de ' + r0.uJal + ' puis ' + rj.uJal + ' px, ligne Jalons toujours de ' + rj.jal + ' px');
    await page.evaluate(() => changerOptionAffichage('lignesJal', '1'));

    // --- 3. Au pixel ---
    await page.evaluate((sfx) => { changerOptionAffichage('hauteurLigne' + sfx, '73', undefined, true); changerOptionAffichage('hauteurJal' + sfx, '47', undefined, true); }, suffixe);
    await page.waitForTimeout(300);
    const rp = await releve(page);
    verifier(rp.ligne === 73 && rp.jal === 47, nom + ' : hauteurs réglées à 73 et 47 px (' + rp.ligne + ', ' + rp.jal + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Anciens réglages convertis ---
  {
    const ls = { 'planning.affichage': JSON.stringify({ lignesOrdi: '3', lignes: '2', jalonsOrdi: '2', jalonsLignesOrdi: '2' }) };
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD(), date: '2026-09-29T10:00:00', localStorage: ls });
    await page.waitForTimeout(500);
    const o = await page.evaluate(() => ['hauteurLigneOrdi', 'hauteurJalOrdi', 'lignesJal'].map((id) => optionAffichage(id)).join(','));
    const r = await releve(page);
    // 3 bulles de 2 lignes (54 px avec le badge) : 3 + 3·57 ; Jalons, 2 bulles de 2 lignes (40 px) : 3 + 2·43.
    verifier(o === '174,89,2' && r.ligne === 174 && r.jal === 89, 'ordinateur : ancien « 3 bulles », Jalons « 2 bulles de 2 lignes » -> 174 et 89 px (' + o + ' ; ' + r.ligne + ', ' + r.jal + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  {
    const ls = { 'planning.affichage.tel': JSON.stringify({ lignesTel: '1', lignes: '1', jalonsTel: '2x1' }) };
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD(), date: '2026-09-29T10:00:00', localStorage: ls });
    await page.waitForTimeout(500);
    const o = await page.evaluate(() => ['hauteurLigneTel', 'hauteurJalTel', 'lignesJal'].map((id) => optionAffichage(id)).join(','));
    const r = await releve(page);
    // 1 bulle d'1 ligne (26 px) : 3 + 29 ; Jalons, 2 bulles d'1 ligne : 3 + 2·29.
    verifier(o === '32,61,1' && r.ligne === 32 && r.jal === 61, 'téléphone : ancien « 1 bulle », Jalons « 2 bulles d\'1 ligne » -> 32 et 61 px (' + o + ' ; ' + r.ligne + ', ' + r.jal + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
