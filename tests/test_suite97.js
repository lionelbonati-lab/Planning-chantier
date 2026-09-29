const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 97). Lionel, captures à l'appui :
//   « Sur mobile, plusieurs incohérences au niveau des sélections et des
//     poignées. »
// Puis : « en sélection simple, quand on change de jour, la case est
//   désélectionnée. Et en multiple, la case reste sélectionnée. »
// Vérifie :
//   1. téléphone, bulle courte (2e d'une cascade) sélectionnée : ses
//      poignées ont le haut, la hauteur et les bords de sa carte (avant :
//      la hauteur de la ligne, leur trait sous la carte) ;
//   2. jour suivant (défilement) : sélection simple -> désélectionnée ;
//      sélection multiple -> reste sélectionnée, la colonne des noms devant
//      elle et sans anneau de sélection (liseré au bord des noms) ; bulle
//      de plusieurs jours encore là au jour suivant -> reste sélectionnée ;
//   3. bulle dépliée et élargie : poignées aux bords de la carte élargie ;
//   4. ordinateur : poignées à la place de leur carte (courte, puis dépliée
//      et remontée).
//
// Lancer : node test_suite97.js

const PERS = ['Lionel', 'Mathis', 'Francois'].map((nom, i) => ({ id: i + 1, nom, sous_traitant: false, ordre: i + 1, actif: true }));
let tid = 1;
const T = (pid, date, demi, texte, ordre) => ({ id: tid++, personne_id: pid, date, demi, ordre: ordre || 0, texte, chantier_id: 1 });
const TACHES = [
  T(1, '2026-09-29', 'matin', 'Coffrage murs étage'), T(1, '2026-09-29', 'aprem', 'Coffrage murs étage'),
  T(3, '2026-09-29', 'matin', 'Coffrage murs étage'), T(3, '2026-09-29', 'aprem', 'Coffrage murs étage'),
  T(3, '2026-09-29', 'aprem', 'Rfecdxs', 1),
  T(1, '2026-10-01', 'matin', 'Transports matériel frami depuis Outremont, retour par le dépôt de Genève et contrôle du chargement'),
  T(1, '2026-10-01', 'aprem', 'Fermeture + pont murs étage'),
  T(2, '2026-09-30', 'matin', 'Banches'), T(2, '2026-09-30', 'aprem', 'Banches'), T(2, '2026-10-01', 'matin', 'Banches')
];
const BD = () => ({ personnes: PERS, taches: TACHES.map((t) => Object.assign({}, t)) });

// Carte visible d'une bulle (premier mot de son texte ; la sélectionnée
// d'abord), ses poignées et leur trait.
const etat = (page, mot) => page.evaluate((mot) => {
  const bs = [...document.querySelectorAll('#racine .scroller .bulle')].filter((x) => x.querySelector('.b-txt').textContent.trim().split(' ')[0] === mot);
  const b = bs.find((x) => x.classList.contains('selectionnee')) || bs[0];
  const sc = b.closest('.scroller').getBoundingClientRect();
  const cs = [...b.querySelectorAll(':scope > .b-carte')];
  const c = cs.find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.right > sc.left + 60 && r.left < sc.right; }) || cs[0];
  const R = (e) => { const r = e.getBoundingClientRect(); return { g: r.left, h: r.top, d: r.right, b: r.bottom }; };
  const trait = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e, '::after'); return r.top + parseFloat(s.top) ; };
  return {
    sel: b.classList.contains('selectionnee'), deplie: c.hasAttribute('data-deplie'), remonte: c.hasAttribute('data-remonte'),
    c: R(c), pg: R(b.querySelector('.poignee-g')), pd: R(b.querySelector('.poignee-d')),
    tg: trait(b.querySelector('.poignee-g')), anneau: /2\.5px/.test(getComputedStyle(c).boxShadow)
  };
}, mot);
const pres = (a, b) => Math.abs(a - b) <= 1;
const calees = (e) => pres(e.pg.h, e.c.h) && pres(e.pg.b, e.c.b) && pres(e.pd.h, e.c.h) && pres(e.pd.b, e.c.b) && pres(e.pg.g, e.c.g) && pres(e.pd.d, e.c.d);
const txt = (e) => 'carte ' + [e.c.g, e.c.h, e.c.d, e.c.b].map(Math.round).join(',') + ' / poignées ' + [e.pg.g, e.pg.h, e.pd.d, e.pd.b].map(Math.round).join(',');

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- Téléphone, vue « 1 jour » ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 360, height: 700 }, hasTouch: true, bd: BD(), date: '2026-09-29T10:00:00' });
    await page.waitForTimeout(600);
    const tap = async (mot) => { const e = await etat(page, mot); await page.touchscreen.tap(e.c.g + 20, e.c.h + 8); await page.waitForTimeout(400); };

    await tap('Rfecdxs');
    const r = await etat(page, 'Rfecdxs');
    verifier(r.sel && calees(r) && r.tg > r.c.h && r.tg < r.c.b, 'téléphone, bulle courte en cascade : poignées à la place de la carte (' + txt(r) + ')');

    await tap('Coffrage');
    const cL = await etat(page, 'Coffrage');
    verifier(cL.sel && calees(cL), 'téléphone, « Coffrage » de Lionel : poignées à la place de la carte (' + txt(cL) + ')');

    // Jour affiché par défilement (comme au doigt), jour repéré par son numéro.
    const aller = async (re) => {
      await page.evaluate((re) => {
        const sc = document.querySelector('#racine .scroller');
        const th = [...document.querySelectorAll('.th[data-gi]')].find((t) => new RegExp(re).test(t.textContent));
        sc.scrollTo({ left: sc.scrollLeft + th.getBoundingClientRect().left - sc.getBoundingClientRect().left - largeurNoms() });
      }, re);
      await page.waitForTimeout(1200);
    };
    const nbSel = () => page.evaluate(() => [Object.keys(bullesSelectionnees).length, document.querySelectorAll('#racine .bulle.selectionnee').length, !document.getElementById('panneauSelection').hidden]);

    // Sélection simple : désélectionnée au jour suivant.
    await aller('30');
    const s1 = await nbSel();
    verifier(s1[0] === 0 && s1[1] === 0 && !s1[2], 'sélection simple, jour suivant : bulle désélectionnée, barre de sélection fermée (' + s1 + ')');

    // Sélection multiple : reste sélectionnée, sous les noms, sans anneau.
    await aller('29');
    await tap('Coffrage');
    await page.evaluate(() => { modeSelectionMultiple = true; majBarreSelection(); });
    await aller('30');
    const n = await page.evaluate(() => {
      const b = document.querySelector('#racine .scroller .bulle.selectionnee');
      if (!b) return { sel: false };
      const c = b.querySelector('.b-carte').getBoundingClientRect();
      const l = [...document.querySelectorAll('.scroller .lbl')].find((x) => x.textContent.includes('Lionel')).getBoundingClientRect();
      const e = document.elementFromPoint(l.left + 20, c.top + 6);
      return { sel: true, horsJour: b.classList.contains('hors-jour'), devant: !!(e && e.closest('.lbl')), sous: c.right > l.left + 20 && c.top < l.bottom,
        anneau: /2\.5px/.test(getComputedStyle(b.querySelector('.b-carte')).boxShadow) };
    });
    verifier(n.sel && n.horsJour && n.sous && n.devant, 'sélection multiple, jour suivant : la bulle reste sélectionnée, sous la colonne des noms (' + JSON.stringify(n) + ')');
    verifier(n.sel && !n.anneau, 'sélection multiple, jour suivant : plus d\'anneau de sélection sur la carte de la veille');
    await page.evaluate(() => quitterModeSelection());

    // Bulle de plusieurs jours encore là le jour suivant : reste sélectionnée.
    await tap('Banches');
    await aller('01');
    const s2 = await nbSel();
    const quoi = await page.evaluate(() => [...document.querySelectorAll('#racine .scroller .bulle.selectionnee')].map((b) => b.querySelector('.b-txt').textContent.trim()).join(','));
    verifier(s2[0] === 1 && s2[1] >= 1 && quoi === 'Banches', 'sélection simple, bulle de plusieurs jours encore affichée le jour suivant : reste sélectionnée (' + s2 + ' ; ' + quoi + ')');
    await page.evaluate(() => quitterModeSelection());
    await tap('Transports');
    const t = await etat(page, 'Transports');
    verifier(t.sel && t.deplie && calees(t), 'téléphone, bulle dépliée et élargie : poignées aux bords de la carte élargie (' + txt(t) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- Ordinateur ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD(), date: '2026-09-29T10:00:00' });
    await page.waitForTimeout(600);
    const r = await etat(page, 'Rfecdxs');
    verifier(calees(r), 'ordinateur, bulle courte non sélectionnée : poignées à la place de la carte (' + txt(r) + ')');
    const e0 = await etat(page, 'Transports');
    await page.mouse.click(e0.c.g + 30, e0.c.h + 6);
    await page.waitForTimeout(400);
    const t = await etat(page, 'Transports');
    verifier(t.sel && t.deplie && calees(t), 'ordinateur, bulle dépliée et élargie : poignées à la place de la carte (' + txt(t) + ')');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const t2 = await etat(page, 'Transports');
    verifier(!t2.sel && calees(t2), 'ordinateur, Échap : poignées revenues avec la carte (' + txt(t2) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
