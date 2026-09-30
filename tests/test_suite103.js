const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 103). Lionel : « pour plus de maniabilité
// j'aimerai pouvoir changer chaques hauteurs de ligne séparément [...]
// excel est un bon exemple », puis « Hauteur sur chaque appareil ».
// Vérifie :
//   1. ordinateur : un trait (.poignee-ligne) sous chaque nom et sous
//      Jalons / Notes ; le glisser règle la hauteur de CETTE ligne seule,
//      retenue par l'appareil (planning.hauteursLignes) ;
//   2. double-clic sur le trait : ligne ajustée au contenu, ses 4 bulles
//      l'une sous l'autre sans chevauchement ;
//   3. clic droit sur un nom (clic gauche aux suites 104-105) : menu « Hauteur » — valeur en pixels,
//      « Hauteur par défaut » (grisé tant que la ligne n'est pas réglée) ;
//      ligne Jalons réglée de même ;
//   4. rouvert : hauteurs gardées ; téléphone : ses propres hauteurs
//      (planning.hauteursLignes.tel), appui long sur un nom = menu (simple
//      toucher aux suites 104-105), trait
//      glissé au doigt ;
//   5. « Rétablir les N lignes réglées à part » (panneau « Hauteur des
//      lignes » de la barre ; page Affichage depuis la suite 122).
//
// Lancer : node test_suite103.js

const PERS = [1, 2, 3].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1 });
const TACHES = [T(1, 1, '2026-09-24', 'matin', 'A'), T(2, 1, '2026-09-24', 'matin', 'B'), T(3, 1, '2026-09-24', 'matin', 'C'), T(4, 1, '2026-09-24', 'matin', 'D'),
  T(5, 2, '2026-09-23', 'matin', 'E')];
const BD = () => ({ personnes: PERS, taches: TACHES.map((t) => Object.assign({}, t)) });

const hauteur = (page, id) => page.evaluate((id) => { const l = document.querySelector('#racine .grille > [data-ligne="' + id + '"]'); return l ? l.offsetHeight : null; }, id);
const ls = (page, cle) => page.evaluate((cle) => localStorage.getItem(cle), cle);
// Point sur le trait sous le nom (2 px au-dessus du bas de l'étiquette).
const trait = (page, id) => page.evaluate((id) => {
  const l = document.querySelector('#racine .grille > [data-ligne="' + id + '"]'), r = l.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.bottom - 2, sous = document.elementFromPoint(x, y);
  return { x, y, ok: !!(sous && sous.classList.contains('poignee-ligne') && sous.parentNode === l) };
}, id);
const nom = (page, id) => page.evaluate((id) => { const r = document.querySelector('#racine .grille > [data-ligne="' + id + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];
  let lsOrdi;

  // --- 1 à 3. Ordinateur -----------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    const n = await page.evaluate(() => ['p1', 'p2', 'p3', 'jalon', 'note'].map((id) => !!document.querySelector('[data-ligne="' + id + '"] > .poignee-ligne')));
    verifier(n.every(Boolean), 'un trait sous chaque nom et sous Jalons / Notes : ' + JSON.stringify(n));
    const h2 = await hauteur(page, 'p2'), h3 = await hauteur(page, 'p3');
    verifier(h2 === 117 && h3 === 117, 'hauteur commune d\'origine : ' + h2 + ' / ' + h3);

    const t2 = await trait(page, 'p2');
    verifier(t2.ok, 'le trait est sous le pointeur au bas du nom');
    await page.mouse.move(t2.x, t2.y);
    await page.mouse.down();
    await page.mouse.move(t2.x, t2.y + 30, { steps: 4 });
    const info = await page.evaluate(() => { const i = document.querySelector('.info-hauteur-ligne'); return i ? i.textContent : ''; });
    await page.mouse.move(t2.x, t2.y + 60, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const h2b = await hauteur(page, 'p2'), h3b = await hauteur(page, 'p3'), h1b = await hauteur(page, 'p1');
    verifier(info === '147 px', 'pendant le glisser, la hauteur s\'affiche : ' + info);
    verifier(h2b === 177 && h3b === 117 && h1b === 117, 'glisser de 60 px : seule la ligne glissée change (' + [h1b, h2b, h3b] + ')');
    verifier(await ls(page, 'planning.hauteursLignes') === '{"p2":177}', 'retenue par l\'appareil : ' + await ls(page, 'planning.hauteursLignes'));
    const e = await page.evaluate(() => ({ perso: document.querySelector('[data-ligne="p2"]').classList.contains('ligne-perso'), v: document.querySelector('.bulle[data-id] .b-txt') && [...document.querySelectorAll('.bulle')].filter((b) => b.textContent.includes('E')).map((b) => b.style.getPropertyValue('--mob-h-pers'))[0] }));
    verifier(e.perso && e.v === '177px', 'ligne marquée, sa bulle rognée à sa hauteur : ' + JSON.stringify(e));

    // 2. double-clic : ajustée au contenu
    const t1 = await trait(page, 'p1');
    await page.mouse.dblclick(t1.x, t1.y);
    await page.waitForTimeout(200);
    const c = await page.evaluate(() => {
      const u = grilleCourante_.mesuresMob_.pers.u;
      const ys = [...document.querySelectorAll('.bulle')].filter((b) => /^[ABCD]/.test(b.textContent.trim())).map((b) => b.querySelector('.b-carte').getBoundingClientRect()).map((r) => [Math.round(r.top), Math.round(r.bottom)]).sort((a, b) => a[0] - b[0]);
      const haut = document.querySelector('[data-ligne="p1"]').getBoundingClientRect().top;
      const bas = Math.max(...[...document.querySelectorAll('.bulle')].filter((b) => /^[ABCD]/.test(b.textContent.trim())).map((b) => b.querySelector('.b-carte').getBoundingClientRect().bottom));
      return { u, h: document.querySelector('[data-ligne="p1"]').offsetHeight, ys, bas: bas - haut };
    });
    // Suite 113 : bas réel de la pile + 3 px (avant : 4 cartes pleines U).
    const attendu = Math.ceil(c.bas + 3);
    const sansChevauchement = c.ys.every((y, i) => i === 0 || y[0] >= c.ys[i - 1][1]);
    verifier(Math.abs(c.h - attendu) <= 1 && sansChevauchement, 'double-clic : ajustée au contenu (' + c.h + ' = ' + attendu + ' px), 4 bulles sans chevauchement ' + JSON.stringify(c.ys));

    // 3. menu du nom
    const n3 = await nom(page, 'p3');
    // Suite 106 : le menu s'ouvre au clic droit (suite 104 : clic gauche).
    await page.mouse.click(n3.x, n3.y, { button: 'right' });
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => { const p = document.querySelector('.menu-hauteur-ligne'); return p && { titre: p.querySelector('.cp-titre').textContent, val: p.querySelector('input').value, defaut: p.querySelector('[data-a="defaut"]').disabled }; });
    verifier(m && /Personne 3/.test(m.titre) && m.val === '117' && m.defaut, 'clic droit : menu Hauteur (valeur 117, « par défaut » grisé) ' + JSON.stringify(m));
    await page.fill('.menu-hauteur-ligne input', '60');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    verifier(await hauteur(page, 'p3') === 60 && !(await page.$('.menu-hauteur-ligne')), 'valeur saisie (Entrée) : ligne à 60 px, menu fermé');

    const n2 = await nom(page, 'p2');
    await page.mouse.click(n2.x, n2.y, { button: 'right' });
    await page.waitForTimeout(150);
    await page.click('.menu-hauteur-ligne [data-a="defaut"]');
    await page.waitForTimeout(150);
    const lsApres = JSON.parse(await ls(page, 'planning.hauteursLignes'));
    verifier(await hauteur(page, 'p2') === 117 && !('p2' in lsApres), '« Hauteur par défaut » : retour à la hauteur commune ' + JSON.stringify(lsApres));

    const nj = await nom(page, 'jalon');
    await page.mouse.click(nj.x, nj.y, { button: 'right' });
    await page.waitForTimeout(150);
    await page.fill('.menu-hauteur-ligne input', '50');
    await page.click('.menu-hauteur-ligne [data-a="ok"]');
    await page.waitForTimeout(150);
    verifier(await hauteur(page, 'jalon') === 50 && await hauteur(page, 'note') === 32, 'ligne Jalons à 50 px, Notes inchangée');

    await page.evaluate(() => render(false));
    await page.waitForTimeout(200);
    verifier(await hauteur(page, 'p3') === 60 && await hauteur(page, 'jalon') === 50, 'nouveau rendu : hauteurs gardées');
    lsOrdi = await ls(page, 'planning.hauteursLignes');

    // Rétablir les lignes réglées à part : page Affichage (suite 122).
    await page.evaluate(() => afficherPage('affichage'));
    await page.waitForTimeout(200);
    const br = await page.evaluate(() => { const b = document.getElementById('btnHauteursRetablir'); return b && !b.hidden && b.textContent; });
    verifier(br === 'Rétablir les 3 lignes réglées à part', 'page Affichage : ' + br);
    await page.click('#btnHauteursRetablir');
    await page.waitForTimeout(150);
    const cache = await page.evaluate(() => document.getElementById('btnHauteursRetablir').hidden);
    await page.evaluate(() => afficherPage('planning'));
    await page.waitForTimeout(300);
    const apres = await page.evaluate((cache) => [['p1', 'p3', 'jalon'].map((id) => document.querySelector('[data-ligne="' + id + '"]').offsetHeight), localStorage.getItem('planning.hauteursLignes'), cache], cache);
    verifier(JSON.stringify(apres) === '[[117,117,32],"{}",true]', 'tout rétabli : hauteurs communes, bouton caché ' + JSON.stringify(apres));
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Rouvert, puis téléphone ------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD(), localStorage: { 'planning.hauteursLignes': lsOrdi } });
    verifier(await hauteur(page, 'p3') === 60 && await hauteur(page, 'jalon') === 50, 'rouvert : hauteurs gardées');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD(), localStorage: { 'planning.hauteursLignes': lsOrdi } });
    verifier(await hauteur(page, 'p3') === 89, 'téléphone : ses propres hauteurs (réglages de l\'ordinateur sans effet) : ' + await hauteur(page, 'p3'));
    const n2 = await nom(page, 'p2');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: n2.x, y: n2.y }] });
    // Suite 106 : l'appui long ouvre le menu (suite 104 : le simple toucher).
    await page.waitForTimeout(700);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    verifier(!!(await page.$('.menu-hauteur-ligne')), 'appui long sur un nom : menu Hauteur');
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelectorAll('.menu-hauteur-ligne').forEach((p) => p.remove()));

    const t2 = await trait(page, 'p2');
    verifier(t2.ok, 'téléphone : trait sous le nom');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: t2.x, y: t2.y }] });
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: t2.x, y: t2.y + 5 * i }] }); await page.waitForTimeout(30); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(250);
    const lsTel = await ls(page, 'planning.hauteursLignes.tel');
    verifier(await hauteur(page, 'p2') === 129 && lsTel === '{"p2":129}' && await ls(page, 'planning.hauteursLignes') === lsOrdi,
      'trait glissé au doigt : 129 px, retenu pour le téléphone seul ' + lsTel);
    await cdp.detach();
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
