const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur, sansViewTransitions } = require('./aide_tests');

// Round du 27.09.2026 (suite 78). Lionel, capture à l'appui (téléphone, en
// plein glissement d'un jour à l'autre) :
//   « Certaines bulle passent encore la colonne des en-têtes. »
//   « Les séparations doivent être dessinée au dessus du planning car c'est
//     des élément principaux. »
// Téléphone, vue 1 jour, doigt posé au milieu du glissement jeudi 24 →
// vendredi 25. Lionel a 3 bulles empilées le jeudi, une seule le vendredi ;
// François 2 le jeudi, rien le vendredi (sa ligne rapetisse : sa 2e bulle,
// tenue à sa place du jeudi, arrive sur la bande « Intervenants »).
// Vérifie, au pixel :
//   1. la bande « Intervenants » est peinte par-dessus la bulle de François,
//      côté jours comme sous la colonne des noms ;
//   2. le trait entre Lionel et Mathis passe par-dessus la 3e bulle de
//      Lionel, tenue à sa place du jeudi ;
//   3. rien ne bouge au repos : largeur de défilement, traits de la colonne
//      des noms ; sur ordinateur, les traits restent ceux de la grille.
//
// Round du 28.09.2026 (suite 90) : au doigt, le téléphone photographie
// maintenant les deux jours (chacun avec ses hauteurs) ; la grille est déjà
// sur le vendredi et aucune bulle n'est plus « tenue » sur la bande. Ce test
// mesure l'interpolation d'avant, toujours utilisée quand les animations
// sont réduites ou sans View Transitions : il tourne sans elles
// (sansViewTransitions). La page photographiée est vérifiée par test_suite90.
//
// Round du 28.09.2026 (suite 91) — Lionel : « passer à des hauteur de ligne
// fixe sur mobile. Plus de calculs de hauteur de ligne. Si pas assez de
// place les bulles se chevaucheront telle des post'it. » Plus de ligne qui
// rapetisse, ni de bulle « tenue » à sa place de la veille : les 3 bulles
// de Lionel du jeudi sont en cascade DANS sa ligne, celles de François
// restent dans la sienne, rognées au bas de la ligne (clip-path). Les
// traits prolongés sur toute la largeur (ombre 100vw) sont retirés : plus
// rien à couvrir. Le test vérifie désormais, en plein glissement, que la
// bande « Intervenants » et le trait Lionel | Mathis restent visibles, les
// bulles entières au-dessus.
//
// Lancer : node test_suite78.js

const noms = ['Lionel', 'Mathis', 'Antoine', 'François', 'Béton'];
const PERS = noms.map((nom, i) => ({ id: i + 1, nom, sous_traitant: i === 4, ordre: i + 1, actif: true }));
const TACHES = [];
let id = 1;
const t = (p, date, texte, ordre) => { for (const demi of ['matin', 'aprem']) TACHES.push({ id: id++, personne_id: p, date, demi, ordre: ordre || 0, texte, chantier_id: 1 }); };
t(1, '2026-09-24', 'Coffrage de dalle'); t(1, '2026-09-24', 'Transports matériel', 1); t(1, '2026-09-24', 'Gabarits', 2);
t(4, '2026-09-24', 'Coffrage de dalle'); t(4, '2026-09-24', 'Descendre matériel coffrage', 1);
t(1, '2026-09-25', 'Fermeture + pont'); t(2, '2026-09-25', 'Fermeture + pont'); t(5, '2026-09-25', 'Contrôle armature');

// Pixels de l'écran, lus dans une image de la page (canvas).
async function pixels(page) {
  const png = (await page.screenshot()).toString('base64');
  await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    window.__px = (x, y) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3));
  }, png);
}
const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
const ecart = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 360, height: 740 }, hasTouch: true, bd: { personnes: PERS, taches: TACHES } });
    await sansViewTransitions(page);
    await page.waitForTimeout(400);
    // 3. Au repos : défilement inchangé (les traits prolongés ne l'élargissent pas).
    const repos = await page.evaluate(() => {
      const s = document.querySelector('.scroller');
      const lbl = s.querySelector('.lbl'), apres = getComputedStyle(lbl, '::after');
      // Largeur de défilement sans les traits prolongés, pour comparer.
      const sw = s.scrollWidth, st = document.createElement('style');
      st.textContent = '#racine .lbl::before, #racine .lbl::after, #racine .lbl-speciale::before, #racine .lbl-speciale::after { box-shadow: none !important; clip-path: none !important; }';
      document.head.appendChild(st); const sans = s.scrollWidth; st.remove();
      return { sw, sans, deborde: lbl.scrollWidth > lbl.clientWidth + 1, prolonge: /100vw|360px/.test(apres.boxShadow) || parseFloat(apres.boxShadow.split(' ').slice(-1)[0]) >= 300, vw: innerWidth,
        zLbl: getComputedStyle(lbl).zIndex, zSection: getComputedStyle(s.querySelector('.section-row')).zIndex };
    });
    // Suite 91 : traits plus prolongés (repos.prolonge faux).
    verifier(repos.sw === repos.sans && !repos.deborde && !repos.prolonge && repos.zLbl === '3' && repos.zSection === '3',
      'téléphone au repos : bandes et noms au-dessus des bulles, traits non prolongés (suite 91), défilement inchangé (' + JSON.stringify(repos) + ')');

    // Doigt posé au milieu du glissement jeudi → vendredi.
    const de = await page.evaluate(() => { const r = document.querySelectorAll('.scroller .lbl')[1].getBoundingClientRect(); return { x: 250, y: r.top + r.height / 2 }; });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: de.x, y: de.y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: de.x - 130 * i / 8, y: de.y }] });
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(150);
    await pixels(page);
    const r = await page.evaluate(() => {
      const s = document.querySelector('.scroller'), LN = largeurNoms();
      const carte = (txt) => [...s.querySelectorAll('.bulle')].find((b) => b.querySelector('.b-txt').textContent.trim() === txt);
      const bande = s.querySelector('.section-row-intervenants').getBoundingClientRect();
      const fr = carte('Descendre matériel coffrage'), frc = fr.querySelector('.b-carte').getBoundingClientRect();
      const lbls = [...s.querySelectorAll('.lbl')], lio = lbls.find((l) => /Lionel/.test(l.textContent)).getBoundingClientRect();
      const gab = carte('Gabarits'), gc = gab.querySelector('.b-carte').getBoundingClientRect();
      const coul = { bande: getComputedStyle(s.querySelector('.section-row-intervenants')).backgroundColor, bulle: getComputedStyle(fr.querySelector('.b-carte')).backgroundColor,
        trait: getComputedStyle(s.querySelector('.lbl'), '::after').backgroundColor };
      // 1. Suite 91 : bulle de François au-dessus de la bande (dans sa
      // ligne) ; bande relevée en son milieu, côté jours et sous les noms.
      const yB = (bande.top + bande.bottom) / 2;
      const surBande = frc.bottom > bande.top + 0.5;
      // 2. 3e bulle de Lionel (Gabarits) à cheval sur le trait Lionel | Mathis.
      const yT = lio.bottom, xT = Math.max(gc.left, LN) + 20;
      const colonne = [-1, 0, 1].map((d) => window.__px(xT, Math.floor(yT) + d - 0.5));
      return { surBande, bandeJour: window.__px(Math.max(frc.left, LN) + 20, yB), bandeNoms: window.__px(4, yB), aCheval: gc.top < yT - 2 && gc.bottom > yT + 0.5,
        colonne, coul, ctx: { bande: [bande.top, bande.bottom], fr: [frc.top, frc.bottom, frc.left], gab: [gc.top, gc.bottom], yT } };
    });
    const cB = rgb(r.coul.bande), cBu = rgb(r.coul.bulle), cT = rgb(r.coul.trait);
    verifier(!r.surBande && ecart(r.bandeJour, cB) <= 3 && ecart(r.bandeNoms, cB) <= 3,
      'en plein glissement : la 2e bulle de François reste dans sa ligne, la bande « Intervenants » entière, côté jours et sous les noms (' + JSON.stringify({ jour: r.bandeJour, noms: r.bandeNoms, bande: cB, bulle: cBu, ctx: r.ctx }) + ')');
    const auPlusPres = Math.min(...r.colonne.map((p) => ecart(p, cT)));
    verifier(!r.aCheval && r.ctx.gab[0] > r.ctx.yT - 60 && auPlusPres < ecart(cT, cBu) / 2,
      'en plein glissement : la 3e bulle de Lionel (cascade) finit dans sa ligne, le trait Lionel | Mathis visible sous elle (' + JSON.stringify({ colonne: r.colonne, trait: cT, bulle: cBu, ctx: r.ctx }) + ')');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  {
    // Ordinateur : les traits de la colonne des noms ne sont pas prolongés.
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 800 }, bd: { personnes: PERS, taches: TACHES } });
    const o = await page.evaluate(() => { const lbl = document.querySelector('.scroller .lbl'); return { ombre: getComputedStyle(lbl, '::after').boxShadow, z: getComputedStyle(lbl).zIndex }; });
    verifier(o.ombre === 'none' && o.z === '2', 'ordinateur : traits de la colonne des noms inchangés (' + JSON.stringify(o) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  verifier(toutesErreurs.length === 0, 'aucune erreur console (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
