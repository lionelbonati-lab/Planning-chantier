const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 123). Lionel : « Si Sélection/multi avec la
// souris, pas de menu sélection, par contre, il faut ajouter les éléments
// suivants au menu du clic droit: important, et statut si intervenant. »
// Vérifie :
//   1. ordinateur, clic sur une bulle puis Ctrl+clic : sélection faite,
//      pilule de sélection cachée (body sans selection-active) ;
//   2. clic droit sur une bulle d'une sélection de tâches d'intervenant :
//      « Marquer important », groupe « Statut » (Aucun + statuts, pastilles),
//      aucun coché quand les statuts diffèrent ;
//   3. un statut choisi : appliqué aux 2 tâches, sélection gardée, une
//      étape d'annulation ; rouvert : ce statut coché (✓) ;
//   4. « Marquer important » : les 2 marquées ; rouvert : « Retirer
//      important » coché ; le choisir retire le drapeau ;
//   5. clic droit sur une case vide avec une sélection : Important et Statut
//      aussi, et ils agissent sur la sélection ;
//   6. tâche du personnel seule : Important, pas de Statut ; jalon seul :
//      ni l'un ni l'autre ;
//   7. écran tactile : toucher une bulle montre la pilule ; un appui de la
//      souris ensuite la cache, un appui du doigt la remontre.
//
// Lancer : node test_suite123.js

const T = (id, pid, date, demi, texte, st) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1, statut_id: st || null, important: false, serie_id: null, est_absence: false });
const PERSONNES = [
  { id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true },
  { id: 3, nom: 'Électricien', sous_traitant: true, ordre: 3, actif: true },
  { id: 4, nom: 'Échafaudeur', sous_traitant: true, ordre: 4, actif: true }
];
const STATUTS = [{ id: 1, cle: 'confirme', nom: 'Confirmé', couleur: '#f7e6ab', ordre: 1 }, { id: 2, cle: 'attente', nom: 'En attente', couleur: '#cfe3f7', ordre: 2 }];
const BD = () => ({
  personnes: PERSONNES, statuts: STATUTS,
  taches: [T(1, 1, '2026-09-24', 'matin', 'Coffrage'), T(2, 3, '2026-09-24', 'matin', 'Câblage'), T(3, 4, '2026-09-25', 'matin', 'Montage', 1)],
  jalons: [{ id: 9, date: '2026-09-23', demi: 'matin', texte: 'Réception', chantier_id: null, important: false }]
});

const centre = async (page, sel) => {
  const r = await page.locator(sel).first().boundingBox();
  return { x: r.x + Math.min(20, r.width / 2), y: r.y + r.height / 2 };
};
const bulle = (t) => '#racine .scroller .bulle:has-text("' + t + '") .b-carte';
const pilule = (page) => page.evaluate(() => ({ visible: !document.getElementById('panneauSelection').hidden, classe: document.body.classList.contains('selection-active'), n: Object.keys(bullesSelectionnees).length }));
const clicDroit = async (page, p) => { await page.mouse.click(p.x, p.y, { button: 'right' }); await page.waitForTimeout(200); };
const menu = (page) => page.evaluate(() => {
  const m = [...document.querySelectorAll('body > .menu-pop')].pop();
  if (!m) return null;
  return {
    boutons: [...m.querySelectorAll('button')].map((b) => b.querySelector('.mc-libelle') ? b.querySelector('.mc-libelle').textContent.trim() : b.textContent.trim()),
    coches: [...m.querySelectorAll('button.actif')].map((b) => b.querySelector('.mc-libelle').textContent.trim() + (b.querySelector('.mc-coche') ? '✓' : '')),
    sections: [...m.querySelectorAll('.mc-section')].map((d) => d.textContent.trim()),
    ronds: [...m.querySelectorAll('.mc-rond')].map((r) => r.classList.contains('mc-rond-vide') ? 'vide' : getComputedStyle(r).backgroundColor)
  };
});
const choisir = (page, libelle) => page.evaluate((l) => {
  const m = [...document.querySelectorAll('body > .menu-pop')].pop();
  [...m.querySelectorAll('button')].find((b) => (b.querySelector('.mc-libelle') || b).textContent.trim() === l).click();
}, libelle);
const etat = (page) => page.evaluate(() => TACHES.map((t) => t.texte + ':' + (t.statut || '-') + (t.important ? '!' : '')).sort().join(' '));
const selection = (page) => page.evaluate(() => TACHES.filter((t) => bullesSelectionnees[t.id]).map((t) => t.texte).sort().join(','));

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD() });

    // 1. Sélection à la souris : pas de pilule.
    await page.click(bulle('Câblage')); await page.waitForTimeout(150);
    let p = await pilule(page);
    verifier(p.n === 1 && !p.visible && !p.classe, 'clic sur une bulle : sélectionnée, pilule cachée ' + JSON.stringify(p));
    await page.click(bulle('Montage'), { modifiers: ['Control'] }); await page.waitForTimeout(150);
    p = await pilule(page);
    verifier(p.n === 2 && !p.visible && !p.classe, 'Ctrl+clic (multi) : 2 bulles, pilule toujours cachée ' + JSON.stringify(p));

    // 2. Clic droit sur une bulle de la sélection.
    await clicDroit(page, await centre(page, bulle('Montage')));
    let m = await menu(page);
    verifier(m && m.boutons.includes('Marquer important') && m.sections.join() === 'Statut', 'clic droit : « Marquer important » et groupe « Statut » ' + JSON.stringify(m && m.boutons));
    const iAucun = m ? m.boutons.indexOf('Aucun') : -1;
    verifier(m && JSON.stringify(m.boutons.slice(iAucun, iAucun + 3)) === JSON.stringify(['Aucun', 'Confirmé', 'En attente']), 'Statut : Aucun puis les statuts de la page Statuts');
    verifier(m && JSON.stringify(m.ronds) === JSON.stringify(['vide', 'rgb(247, 230, 171)', 'rgb(207, 227, 247)']), 'pastilles : rond vide pour Aucun, couleur de chaque statut ' + JSON.stringify(m && m.ronds));
    verifier(m && m.coches.length === 0, 'statuts différents (aucun / Confirmé) : rien de coché ' + JSON.stringify(m && m.coches));
    verifier(m && m.boutons.indexOf('Marquer important') < iAucun && m.boutons.indexOf('Supprimer (2)') > iAucun, 'ordre : Couper/Copier, Important, Statut, puis Supprimer ' + JSON.stringify(m && m.boutons));

    // 3. Choisir un statut.
    const undoAvant = await page.evaluate(() => pileUndo.length);
    await choisir(page, 'En attente'); await page.waitForTimeout(200);
    verifier(await etat(page) === 'Coffrage:- Câblage:attente Montage:attente', 'statut « En attente » posé sur les 2 tâches (' + await etat(page) + ')');
    verifier(await selection(page) === 'Câblage,Montage' && !(await pilule(page)).visible, 'sélection gardée, pilule toujours cachée');
    verifier(await page.evaluate(() => pileUndo.length) === undoAvant + 1, 'une seule étape d\'annulation');
    verifier(await page.evaluate(() => !document.querySelector('body > .menu-pop')), 'menu fermé après le choix');
    await clicDroit(page, await centre(page, bulle('Câblage')));
    m = await menu(page);
    verifier(m && JSON.stringify(m.coches) === JSON.stringify(['En attente✓']), 'rouvert : « En attente » coché (✓) ' + JSON.stringify(m && m.coches));
    verifier(await selection(page) === 'Câblage,Montage', 'clic droit sur une bulle déjà sélectionnée : la sélection de 2 reste');

    // 4. Important.
    await choisir(page, 'Marquer important'); await page.waitForTimeout(200);
    verifier(await etat(page) === 'Coffrage:- Câblage:attente! Montage:attente!', '« Marquer important » : les 2 marquées (' + await etat(page) + ')');
    await clicDroit(page, await centre(page, bulle('Montage')));
    m = await menu(page);
    verifier(m && m.boutons.includes('Retirer important') && m.coches.includes('Retirer important✓'), 'rouvert : « Retirer important », coché ' + JSON.stringify(m && m.coches));
    await choisir(page, 'Retirer important'); await page.waitForTimeout(200);
    verifier(await etat(page) === 'Coffrage:- Câblage:attente Montage:attente', '« Retirer important » : drapeau retiré aux 2');

    // 5. Case vide avec une sélection.
    const caseVide = '.cell[data-kind="personne"][data-personne="1"][data-demi="aprem"][data-jour="' + await page.evaluate(() => { for (let g = 0; g < 80; g++) if (isoDeGi(g) === '2026-09-22') return g; }) + '"]';
    await clicDroit(page, await centre(page, caseVide));
    m = await menu(page);
    verifier(m && m.boutons.includes('Tâche') && m.boutons.includes('Couper la sélection (2)') && m.boutons.includes('Marquer important') && m.sections.join() === 'Statut' && m.boutons.includes('Confirmé'),
      'clic droit sur une case vide : menu Ajouter + Couper/Copier + Important + Statut ' + JSON.stringify(m && m.boutons));
    await choisir(page, 'Aucun'); await page.waitForTimeout(200);
    verifier(await etat(page) === 'Coffrage:- Câblage:- Montage:-' && await selection(page) === 'Câblage,Montage', 'case vide → « Aucun » : statut retiré aux 2, sélection gardée (' + await etat(page) + ')');
    await clicDroit(page, await centre(page, caseVide));
    await choisir(page, 'Marquer important'); await page.waitForTimeout(200);
    verifier(await etat(page) === 'Coffrage:- Câblage:-! Montage:-!', 'case vide → « Marquer important » : les 2 marquées');

    // 6. Personnel seul, jalon seul.
    await page.keyboard.press('Escape');
    await clicDroit(page, await centre(page, bulle('Coffrage')));
    m = await menu(page);
    verifier(m && m.boutons.includes('Marquer important') && !m.sections.length && !m.boutons.includes('Confirmé'), 'tâche du personnel : Important, pas de Statut ' + JSON.stringify(m && m.boutons));
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await clicDroit(page, await centre(page, '#racine .bulle-jalon:has-text("Réception")'));
    m = await menu(page);
    verifier(m && !m.boutons.some((b) => /important/i.test(b)) && !m.sections.length, 'jalon seul : ni Important ni Statut ' + JSON.stringify(m && m.boutons));
    await page.keyboard.press('Escape');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // 7. Écran tactile (avec souris) : la pilule suit le dernier pointeur.
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1180, height: 820 }, hasTouch: true, bd: BD() });
    const c = await centre(page, bulle('Câblage'));
    await page.touchscreen.tap(c.x, c.y); await page.waitForTimeout(400);
    let p = await pilule(page);
    verifier(p.n === 1 && p.visible && p.classe, 'toucher une bulle : sélectionnée, pilule visible ' + JSON.stringify(p));
    await page.click('#selImportant'); await page.waitForTimeout(200);
    p = await pilule(page);
    verifier(await etat(page) === 'Coffrage:- Câblage:-! Montage:confirme' && p.visible, 'la pilule marche toujours (clic de la souris DANS la pilule : elle reste) : ⚑ pose le drapeau (' + await etat(page) + ')');
    await page.mouse.click(c.x, c.y, { modifiers: ['Control'] }); await page.mouse.click(c.x, c.y, { modifiers: ['Control'] }); await page.waitForTimeout(200);
    p = await pilule(page);
    verifier(p.n === 1 && !p.visible, 'puis la souris (Ctrl+clic ×2 sur la même bulle) : pilule cachée ' + JSON.stringify(p));
    const m2 = await centre(page, bulle('Montage'));
    await page.touchscreen.tap(m2.x, m2.y); await page.waitForTimeout(400);
    p = await pilule(page);
    verifier(p.visible, 'de nouveau au doigt : pilule revenue ' + JSON.stringify(p));
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  bilan();
})();
