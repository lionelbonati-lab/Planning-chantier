const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur, glisserBulleDoigt } = require('./aide_tests');

// Round du 25.09.2026 (suite 25) — Lionel : « j'ai trouvé un bug.
// décaler un note de 1/2 jour de 1 jour complet crée une bulle de 1.5jour.
// déplacer une note de 1/2jours sur mobile n'est pas possible ».
//
// 1. Une bulle d'une seule demi-journée (~58 à 100 px) avait 12 px de
//    poignée d'étirement de chaque côté : attrapée près du bord droit et
//    glissée d'un jour, elle s'ÉTIRAIT jusqu'au lendemain (mardi matin →
//    mardi + mercredi matin = 1,5 jour) au lieu de se déplacer. Poignées
//    réduites à 5 px sur ces bulles (.une-case, style.css).
// 2. Au doigt, le glisser ne connaissait que le jour entier (reste de
//    l'ancien mode classique) : impossible de passer une note du matin à
//    l'après-midi. Il suit désormais la demi-journée sous le doigt, comme la
//    souris — l'aperçu et le dépôt.
//
// Lancer : node test_suite25.js

const note = (date, demi) => ({ notes: [{ id: 700, date: date, texte: 'Reunion', important: false, serie_id: null, demi: demi }] });
const etatNotes = (page) => page.evaluate(() => NOTES.map((n) => isoDeGi(n.giDebut) + (n.duree > 1 ? '+' + n.duree + 'j' : '') + ' ' + (n.demiDebut || '·') + '/' + (n.demiFin || '·')).join(', '));
const notesBD = (page) => page.evaluate(() => window.__BD.notes.map((r) => r.date + ' ' + (r.demi || 'journée')).sort().join(', '));
const celluleNote = (page, iso) => page.evaluate((iso) => {
  const gi = giDepuisIso(iso);
  const c = [...document.querySelectorAll('.cell')].find((x) => x.dataset.kind === 'note' && x.dataset.jour === String(gi));
  c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}, iso);

async function glisserSouris(page, de, vers) {
  await page.mouse.move(de.x, de.y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(de.x + (vers.x - de.x) * i / 8, de.y + (vers.y - de.y) * i / 8);
  await page.mouse.up(); await page.waitForTimeout(300);
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Souris : note d'une demi-journée attrapée près du bord droit ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: note('2026-09-22', 'matin') });
    const poignees = await page.evaluate(() => {
      const b = document.querySelector('.bulle-note');
      return { uneCase: b.classList.contains('une-case'), largeur: Math.round(b.getBoundingClientRect().width), poignee: getComputedStyle(b.querySelector('.poignee-d')).width };
    });
    verifier(poignees.uneCase && poignees.poignee === '5px', 'bulle d\'une demi-journée : poignées de 5 px (' + JSON.stringify(poignees) + ')');
    const b = await page.locator('.bulle-note').boundingBox();
    const mer = await celluleNote(page, '2026-09-23');
    await glisserSouris(page, { x: b.x + b.width - 8, y: b.y + b.height / 2 }, { x: mer.x + mer.w * 0.25 - 8 + b.width / 2, y: mer.y + mer.h / 2 });
    verifier(await etatNotes(page) === '2026-09-23 matin/matin', 'attrapée à 8 px du bord droit, glissée d\'un jour : DÉPLACÉE au mercredi matin, pas étirée (' + await etatNotes(page) + ')');
    await page.evaluate(() => synchroniser()); await page.waitForTimeout(600);
    verifier(await notesBD(page) === '2026-09-23 matin', 'base : mercredi matin seulement (' + await notesBD(page) + ')');

    // La poignée existe toujours : tout au bord, on étire.
    const b2 = await page.locator('.bulle-note').boundingBox();
    const jeu = await celluleNote(page, '2026-09-24');
    await glisserSouris(page, { x: b2.x + b2.width - 2, y: b2.y + b2.height / 2 }, { x: jeu.x + jeu.w * 0.25, y: jeu.y + jeu.h / 2 });
    verifier(await etatNotes(page) === '2026-09-23+2j ·/matin', 'tout au bord (2 px) : la poignée étire toujours (' + await etatNotes(page) + ')');

    const large = await page.evaluate(() => { const b = document.querySelector('.bulle-note'); return { uneCase: b.classList.contains('une-case'), poignee: getComputedStyle(b.querySelector('.poignee-d')).width }; });
    verifier(!large.uneCase && large.poignee === '12px', 'bulle de plusieurs cases : poignées de 12 px inchangées (' + JSON.stringify(large) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. Tablette tactile (820 px, vue 1 semaine) ---
  for (const [depart, cibleIso, fraction, attendu, libelle] of [
    ['matin', '2026-09-24', 0.75, '2026-09-24 aprem/aprem', 'jeudi matin → jeudi après-midi'],
    ['aprem', '2026-09-24', 0.25, '2026-09-24 matin/matin', 'jeudi après-midi → jeudi matin'],
    ['matin', '2026-09-25', 0.75, '2026-09-25 aprem/aprem', 'jeudi matin → vendredi après-midi'],
    ['matin', '2026-09-25', 0.25, '2026-09-25 matin/matin', 'jeudi matin → vendredi matin (jour entier, inchangé)']
  ]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 820, height: 1100 }, hasTouch: true, bd: note('2026-09-24', depart) });
    const b = await page.locator('.bulle-note').boundingBox();
    const c = await celluleNote(page, cibleIso);
    await glisserBulleDoigt(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, { x: c.x + c.w * fraction, y: c.y + c.h / 2 });
    verifier(await etatNotes(page) === attendu, 'tablette, au doigt : ' + libelle + ' (' + await etatNotes(page) + ')');
    await page.evaluate(() => synchroniser()); await page.waitForTimeout(600);
    verifier(await notesBD(page) === attendu.replace(/ (\w+)\/\w+$/, ' $1'), '  → écrit en base (' + await notesBD(page) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Téléphone (390 px, vue 1 jour) : matin ↔ après-midi du même jour ---
  for (const [depart, fraction, attendu] of [['matin', 0.75, '2026-09-24 aprem/aprem'], ['aprem', 0.25, '2026-09-24 matin/matin']]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: note('2026-09-24', depart) });
    const b = await page.locator('.bulle-note').boundingBox();
    const c = await celluleNote(page, '2026-09-24');
    await glisserBulleDoigt(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, { x: c.x + c.w * fraction, y: c.y + c.h / 2 });
    verifier(await etatNotes(page) === attendu, 'téléphone, au doigt : ' + depart + ' → ' + attendu.split(' ')[1].split('/')[0] + ' du même jour (' + await etatNotes(page) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Tablette : tâche d'une demi-journée, au doigt, vers une autre personne l'après-midi ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 820, height: 1100 }, hasTouch: true, bd: {
      taches: [{ id: 1, personne_id: 1, date: '2026-09-23', demi: 'matin', ordre: 0, texte: 'Coffrage', statut_id: null, important: false, serie_id: null, est_absence: false, chantier_id: 1 }]
    } });
    const b = await page.locator('.bulle', { hasText: 'Coffrage' }).boundingBox();
    const c = await page.evaluate(() => { const gi = giDepuisIso('2026-09-24'); const x = document.querySelector('.cell[data-kind="personne"][data-personne="2"][data-jour="' + gi + '"][data-demi="aprem"]'); const r = x.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await glisserBulleDoigt(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, c);
    const t = await page.evaluate(() => TACHES.map((t) => t.personneId + ':' + isoDeGi(t.giDebut) + ' ' + t.demiDebut + '/' + t.demiFin).join(', '));
    verifier(t === '2:2026-09-24 aprem/aprem', 'tablette, au doigt : tâche de Lionel mercredi matin → Mathis jeudi après-midi (' + t + ')');
    await page.evaluate(() => synchroniser()); await page.waitForTimeout(600);
    const tBD = await page.evaluate(() => window.__BD.taches.map((r) => r.personne_id + ':' + r.date + ' ' + r.demi).join(', '));
    verifier(tBD === '2:2026-09-24 aprem', '  → écrit en base (' + tBD + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
