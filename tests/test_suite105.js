const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 105). Lionel, « Oui » à notre proposition :
// sélectionner des lignes par les noms (Ctrl / Maj) et des colonnes par les
// jours, comme dans un tableur ; les lignes choisies prennent la même
// hauteur.
// Vérifie :
//   1. Ctrl+clic sur un nom : ligne choisie, ses bulles sélectionnées, pas
//      de menu ; Maj+clic : plage ; Ctrl+clic sur une ligne choisie : retirée ;
//   2. clic sur une ligne choisie : menu « 2 lignes sélectionnées », la
//      hauteur saisie vaut pour les 2 ; le trait d'une ligne choisie aussi ;
//   3. clic sur une ligne non choisie : choix défait, menu de cette ligne,
//      « Sélectionner la ligne » ; Échap défait tout ;
//   4. clic sur un jour : ce jour et ses bulles ; Ctrl+clic ajoute, Maj+clic
//      plage ; lignes et jours ensemble au Ctrl ; clic dans une case : défait ;
//   5. téléphone : toucher un jour le choisit ; « Sélectionner la ligne »
//      du menu, puis toucher un autre nom l'ajoute (sans menu).
//
// Lancer : node test_suite105.js

const PERS = [1, 2, 3].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1 });
const TACHES = [T(1, 1, '2026-09-21', 'matin', 'A'), T(2, 1, '2026-09-24', 'matin', 'B'), T(3, 2, '2026-09-23', 'matin', 'E'),
  T(4, 3, '2026-09-24', 'aprem', 'C')];
const BD = () => ({ personnes: PERS, taches: TACHES.map((t) => Object.assign({}, t)) });

const pt = (page, sel) => page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 3 }; }, sel);
const nom = (id) => '#racine .grille > [data-ligne="' + id + '"]';
// En-tête du jour `iso` (sa colonne gi).
const jour = async (page, iso) => {
  const gi = await page.evaluate((iso) => [...document.querySelectorAll('#racine .entete-planning-figee .th[data-gi]:not(.th-demi)')].map((t) => t.dataset.gi).find((g) => isoDeGi(+g) === iso), iso);
  return '#racine .entete-planning-figee .th[data-gi="' + gi + '"]:not(.th-demi)';
};
const clic = async (page, sel, mods) => {
  const p = await pt(page, sel);
  for (const m of mods || []) await page.keyboard.down(m);
  await page.mouse.click(p.x, p.y);
  for (const m of mods || []) await page.keyboard.up(m);
  await page.waitForTimeout(150);
};
const etat = (page) => page.evaluate(() => {
  const textes = Object.keys(bullesSelectionnees).map((id) => { const t = TACHES.find((x) => String(x.id) === id); return t ? t.texte : '?'; }).sort().join('');
  const m = document.querySelector('.menu-hauteur-ligne');
  return {
    lignes: [...document.querySelectorAll('#racine .grille > .ligne-choisie')].map((l) => l.dataset.ligne).join(','),
    jours: [...document.querySelectorAll('#racine .th.jour-choisi')].map((t) => isoDeGi(+t.dataset.gi).slice(8)).join(','),
    bulles: textes,
    menu: m ? m.querySelector('.cp-titre').textContent : null
  };
});
const fermerMenu = (page) => page.evaluate(() => document.querySelectorAll('.menu-hauteur-ligne').forEach((p) => p.remove()));
const hauteur = (page, id) => page.evaluate((id) => document.querySelector('#racine .grille > [data-ligne="' + id + '"]').offsetHeight, id);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1 à 4. Ordinateur -----------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    await clic(page, nom('p1'), ['Control']);
    let e = await etat(page);
    verifier(e.lignes === 'p1' && e.bulles === 'AB' && e.menu === null, 'Ctrl+clic sur un nom : ligne choisie, ses bulles sélectionnées, pas de menu ' + JSON.stringify(e));
    await clic(page, nom('p3'), ['Shift']);
    e = await etat(page);
    verifier(e.lignes === 'p1,p2,p3' && e.bulles === 'ABCE', 'Maj+clic : de la 1re à la 3e ligne ' + JSON.stringify(e));
    await clic(page, nom('p2'), ['Control']);
    e = await etat(page);
    verifier(e.lignes === 'p1,p3' && e.bulles === 'ABC', 'Ctrl+clic sur une ligne choisie : retirée, sa bulle aussi ' + JSON.stringify(e));

    // 2. même hauteur pour les lignes choisies
    await clic(page, nom('p1'));
    e = await etat(page);
    verifier(e.menu === '2 lignes sélectionnées' && e.lignes === 'p1,p3', 'clic sur une ligne choisie : menu des 2 lignes ' + JSON.stringify(e));
    await page.fill('.menu-hauteur-ligne input', '60');
    await page.press('.menu-hauteur-ligne input', 'Enter');
    await page.waitForTimeout(150);
    const h = [await hauteur(page, 'p1'), await hauteur(page, 'p2'), await hauteur(page, 'p3')];
    verifier(h[0] === 60 && h[2] === 60 && h[1] === 117, 'hauteur saisie : les 2 lignes à 60 px, l\'autre inchangée (' + h + ')');
    const t3 = await page.evaluate(() => { const r = document.querySelector('#racine .grille > [data-ligne="p3"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 2 }; });
    await page.mouse.move(t3.x, t3.y);
    await page.mouse.down();
    await page.mouse.move(t3.x, t3.y + 40, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const h2 = [await hauteur(page, 'p1'), await hauteur(page, 'p2'), await hauteur(page, 'p3')];
    const lsH = await page.evaluate(() => localStorage.getItem('planning.hauteursLignes'));
    verifier(h2[0] === 100 && h2[2] === 100 && h2[1] === 117 && lsH === '{"p1":100,"p3":100}', 'trait d\'une ligne choisie glissé : les 2 lignes suivent (' + h2 + ' ' + lsH + ')');
    e = await etat(page);
    verifier(e.lignes === 'p1,p3' && e.menu === null, 'après le trait : choix gardé, pas de menu ' + JSON.stringify(e));

    // 3. clic sur une ligne non choisie
    await clic(page, nom('p2'));
    e = await etat(page);
    const bouton = await page.evaluate(() => { const b = document.querySelector('.menu-hauteur-ligne [data-a="choix"]'); return b && b.textContent; });
    verifier(e.lignes === '' && e.bulles === '' && e.menu === 'Personne 2' && bouton === 'Sélectionner la ligne', 'clic sur une ligne non choisie : choix défait, son menu ' + JSON.stringify(e) + ' ' + bouton);
    await page.click('.menu-hauteur-ligne [data-a="choix"]');
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.lignes === 'p2' && e.bulles === 'E' && e.menu === null, '« Sélectionner la ligne » : la ligne et sa bulle ' + JSON.stringify(e));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.lignes === '' && e.bulles === '', 'Échap : tout est défait ' + JSON.stringify(e));

    // 4. colonnes
    await clic(page, await jour(page, '2026-09-24'));
    e = await etat(page);
    verifier(e.jours === '24' && e.bulles === 'BC', 'clic sur un jour : ce jour et ses bulles ' + JSON.stringify(e));
    await clic(page, await jour(page, '2026-09-21'), ['Control']);
    e = await etat(page);
    verifier(e.jours === '21,24' && e.bulles === 'ABC', 'Ctrl+clic sur un autre jour : ajouté ' + JSON.stringify(e));
    await clic(page, await jour(page, '2026-09-23'), ['Shift']);
    e = await etat(page);
    verifier(e.jours === '21,22,23' && e.bulles === 'AE', 'Maj+clic : du dernier jour cliqué (21) jusqu\'à celui-ci ' + JSON.stringify(e));
    await clic(page, nom('p1'), ['Control']);
    e = await etat(page);
    verifier(e.jours === '21,22,23' && e.lignes === 'p1' && e.bulles === 'ABE', 'Ctrl+clic sur un nom : lignes et jours ensemble ' + JSON.stringify(e));
    await clic(page, await jour(page, '2026-09-22'));
    e = await etat(page);
    verifier(e.jours === '22' && e.lignes === '' && e.bulles === '', 'clic simple sur un jour : remplace tout (jour vide : aucune bulle) ' + JSON.stringify(e));
    await clic(page, await jour(page, '2026-09-24'));
    const vide = await page.evaluate(() => { const c = [...document.querySelectorAll('#racine .cell[data-kind="personne"][data-personne="2"]')].find((x) => isoDeGi(+x.dataset.jour) === '2026-09-25'); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(vide.x, vide.y);
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.jours === '' && e.bulles === '', 'clic dans une case vide : sélection défaite ' + JSON.stringify(e));
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 5. Téléphone ------------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD() });
    const cdp = await page.context().newCDPSession(page);
    const toucher = async (sel) => {
      const p = await pt(page, sel);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
      await page.waitForTimeout(60);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(300);
    };
    const jourVisible = await page.evaluate(() => { const t = [...document.querySelectorAll('#racine .entete-planning-figee .th[data-gi]:not(.th-demi)')].find((x) => { const r = x.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.width > 60; }); return t && isoDeGi(+t.dataset.gi); });
    await toucher(await jour(page, jourVisible));
    let e = await etat(page);
    verifier(e.jours === jourVisible.slice(8) && e.menu === null, 'téléphone : toucher un jour le choisit ' + JSON.stringify(e));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await toucher(nom('p1'));
    await page.click('.menu-hauteur-ligne [data-a="choix"]');
    await page.waitForTimeout(150);
    await toucher(nom('p3'));
    e = await etat(page);
    verifier(e.lignes === 'p1,p3' && e.menu === null, 'téléphone : « Sélectionner la ligne », puis toucher un autre nom l\'ajoute sans menu ' + JSON.stringify(e));
    await toucher(nom('p3'));
    e = await etat(page);
    verifier(e.menu === '2 lignes sélectionnées', 'téléphone : toucher une ligne choisie = menu des lignes choisies ' + JSON.stringify(e));
    await fermerMenu(page);
    await cdp.detach();
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
