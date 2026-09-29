const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 107). Lionel : « En mode ajout, les bulles
// seront légèrement visibles, transparentes et insélectionnables afin de
// pouvoir cliquer sur une case sans cliquer sur la bulle. »
// Vérifie :
//   1. mode ajout : bulles transparentes, le pointeur les traverse (la
//      case est dessous) ; un clic sur une bulle ouvre l'ajout de SA case,
//      sans la sélectionner ;
//   2. mode sélection : bulles opaques, un clic la sélectionne ; repasser
//      en mode ajout défait la sélection ;
//   3. téléphone, mode ajout : appui long sur une bulle = ajout dans la case.
//
// Suite 112 : le mode ajout a sa propre icône, #btnModeAjout ; le « + »
// (#btnAjoutElement) est redevenu le menu d'ajout rapide.
//
// Lancer : node test_suite107.js

const PERS = [1, 2].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1 });
const BD = () => ({ personnes: PERS, taches: [T(1, 1, '2026-09-24', 'matin', 'Un'), T(2, 2, '2026-09-23', 'matin', 'Deux')] });

// Centre de la bulle `texte`, son style, et ce qui est sous le pointeur.
const bulle = (page, texte) => page.evaluate((texte) => {
  const b = [...document.querySelectorAll('#racine .bulle')].find((x) => x.textContent.includes(texte));
  const r = b.querySelector('.b-carte').getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const sous = document.elementFromPoint(x, y), cs = getComputedStyle(b);
  return { x, y, opacite: +cs.opacity, pe: cs.pointerEvents, sous: sous && sous.closest('.cell') ? 'case ' + sous.closest('.cell').dataset.personne + ' ' + isoDeGi(+sous.closest('.cell').dataset.jour) : sous && sous.closest('.bulle') ? 'bulle' : String(sous && sous.className) };
}, texte);
const selection = (page) => page.evaluate(() => TACHES.filter((t) => bullesSelectionnees[t.id]).map((t) => t.texte).sort().join(','));
const popup = (page) => page.evaluate(() => { const m = document.querySelector('.menu-pop, .form-pop'); return m ? m.className : null; });

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1 et 2. Ordinateur ------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD(), localStorage: { 'planning.modeAjout': '1' } });
    let b = await bulle(page, 'Un');
    verifier(b.opacite < 0.5 && b.pe === 'none' && b.sous === 'case 1 2026-09-24', 'mode ajout : bulle transparente, la case est sous le pointeur ' + JSON.stringify(b));
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(200);
    const p = await popup(page);
    verifier(!!p && (await selection(page)) === '', 'clic sur la bulle : ajout dans sa case, bulle non sélectionnée (' + p + ')');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await page.evaluate(() => document.querySelectorAll('.menu-pop, .form-pop').forEach((x) => x.remove()));

    await page.click('#btnModeAjout');
    await page.waitForTimeout(150);
    b = await bulle(page, 'Un');
    // (.bulle elle-même est toujours « none » : ses cartes captent le clic.)
    verifier(b.opacite === 1 && b.sous === 'bulle', 'mode sélection : bulle opaque, sous le pointeur ' + JSON.stringify(b));
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(200);
    verifier((await selection(page)) === 'Un', 'mode sélection : clic = bulle sélectionnée (' + await selection(page) + ')');
    await page.click('#btnModeAjout');
    await page.waitForTimeout(150);
    const apres = await page.evaluate(() => ({ n: document.querySelectorAll('.bulle.selectionnee').length, pilule: document.getElementById('panneauSelection').hidden }));
    verifier((await selection(page)) === '' && apres.n === 0 && apres.pilule, 'retour en mode ajout : sélection défaite ' + JSON.stringify(apres));
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Téléphone ------------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD(), localStorage: { 'planning.modeAjout': '1' } });
    const b = await bulle(page, 'Un');
    verifier(b.opacite < 0.5 && b.sous === 'case 1 2026-09-24', 'téléphone, mode ajout : bulle transparente au-dessus de sa case ' + JSON.stringify(b));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y }] });
    await page.waitForTimeout(700);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    const p = await popup(page);
    verifier(!!p && (await selection(page)) === '', 'appui long sur la bulle : ajout dans sa case, rien de sélectionné (' + p + ')');
    await cdp.detach();
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
