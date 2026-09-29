const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 98). Lionel, capture à l'appui :
//   « Sur portable, J'ai un cas particulier ou sur un demi jour je ne vois
//     pas une bulle car la ligne est trop petite. J'ai une bulle verte
//     cachée derrière la bulle bleu. As-tu une solution à me proposer? »
//   Puis, à notre question : « La pastille, mais un appuis sur la pastille
//     montre les bulles du jour sans changer la hauteur des lignes. Un
//     nouvel appuis replace les bulles. »
// Vérifie (téléphone, « Bulles par ligne » = 1) :
//   1. pastille « +2 » au coin bas droit de l'après-midi de François (2
//      bulles cachées sous la 1re) ; aucune ailleurs ;
//   2. appui : bulles étalées sans chevauchement, chacune visible (devant
//      la bande « Intervenants » et les lignes suivantes), hauteur des
//      lignes inchangée, pastille « − », aucun formulaire ouvert ;
//   3. appui sur une bulle étalée : sélectionnée, les autres restent
//      étalées ;
//   4. nouvel appui sur la pastille : bulles replacées en cascade, « +2 » ;
//   5. étalées puis jour suivant et retour : replacées ;
//   6. dernière ligne du planning : bulles étalées remontées pour rester
//      dans le planning ;
//   7. ordinateur (1 bulle par ligne) : pastille et étalement aussi.
//
// Lancer : node test_suite98.js

const PERS = ['Lionel', 'Mathis', 'Francois'].map((nom, i) => ({ id: i + 1, nom, sous_traitant: false, ordre: i + 1, actif: true }))
  .concat(['Beton', 'Echafaudage'].map((nom, i) => ({ id: i + 4, nom, sous_traitant: true, ordre: i + 4, actif: true })));
let tid = 1;
const T = (pid, date, demi, texte, ordre) => ({ id: tid++, personne_id: pid, date, demi, ordre: ordre || 0, texte, chantier_id: 1 });
const TACHES = [
  T(1, '2026-09-29', 'matin', 'Coffrage murs étage'), T(1, '2026-09-29', 'aprem', 'Coffrage murs étage'),
  T(3, '2026-09-29', 'matin', 'Coffrage murs étage'), T(3, '2026-09-29', 'aprem', 'Coffrage murs étage'),
  T(3, '2026-09-29', 'aprem', 'Rfecdxs', 1), T(3, '2026-09-29', 'aprem', 'Verte cachée', 2),
  T(5, '2026-09-29', 'aprem', 'Echaf un', 0), T(5, '2026-09-29', 'aprem', 'Echaf deux', 1), T(5, '2026-09-29', 'aprem', 'Echaf trois', 2)
];
const BD = () => ({ personnes: PERS, taches: TACHES.map((t) => Object.assign({}, t)) });

// Cartes visibles d'une ligne (nom de la personne), pastilles, ligne.
const etat = (page, nom) => page.evaluate((nom) => {
  const sc = document.querySelector('#racine .scroller'), rs = sc.getBoundingClientRect();
  const lbl = [...sc.querySelectorAll('.lbl')].find((l) => l.textContent.includes(nom)), rl = lbl.getBoundingClientRect();
  const row = lbl.style.gridRow.split(' ')[0];
  const cartes = [...sc.querySelectorAll('.bulle')].filter((b) => b.style.gridRow.split(' ')[0] === row).flatMap((b) => [...b.querySelectorAll(':scope > .b-carte')])
    .map((c) => ({ c, r: c.getBoundingClientRect() })).filter((x) => x.r.width > 0 && x.r.right > rs.left + 60 && x.r.left < rs.right)
    .map(({ c, r }) => {
      const e = document.elementFromPoint(r.left + r.width / 2, r.top + 8);
      return { txt: c.querySelector('.b-txt').textContent.trim(), dansLigne: Math.min(r.bottom, rl.bottom) - r.top, h: r.top, b: r.bottom, g: r.left, d: r.right, vue: !!(e && e.closest('.b-carte') === c), sel: c.closest('.bulle').classList.contains('selectionnee') };
    }).sort((a, b) => a.h - b.h);
  const ps = [...sc.querySelectorAll('.pastille-cachees')].filter((p) => p.style.gridRow === row).map((p) => { const r = p.getBoundingClientRect(); return { txt: p.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2, g: r.left, d: r.right, b: r.bottom }; });
  const g = sc.querySelector('.grille').getBoundingClientRect();
  return { cartes, ps, ligneH: rl.top, ligneB: rl.bottom, grilleB: g.bottom, pop: !!document.querySelector('.pop, .form-pop'), toutes: sc.querySelectorAll('.pastille-cachees').length };
}, nom);
const empilees = (cs) => cs.every((c, i) => i === 0 || c.h >= cs[i - 1].b - 1);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 360, height: 760 }, hasTouch: true, bd: BD(), date: '2026-09-29T10:00:00' });
    await page.evaluate(() => { changerOptionAffichage('lignesTel', '1'); changerOptionAffichage('lignes', '1'); });
    await page.waitForTimeout(800);

    const f0 = await etat(page, 'Francois'), l0 = await etat(page, 'Lionel');
    const p0 = f0.ps[0];
    verifier(f0.ps.length === 1 && p0.txt === '+2' && p0.b <= f0.ligneB + 1 && p0.b >= f0.ligneB - 8 && Math.abs(p0.d - f0.cartes[0].d) <= 8 && l0.ps.length === 0,
      'pastille « +2 » au coin bas droit de l\'après-midi de François, aucune chez Lionel (' + JSON.stringify(p0) + ')');
    // Cachée : moins de 10 px au-dessus du bas de la ligne (rognée dessous).
    const lisibles = (f) => f.cartes.filter((c) => c.dansLigne >= 10).map((c) => c.txt).join(',');
    verifier(lisibles(f0) === 'Coffrage murs étage', 'avant : seule la 1re des 3 cartes dépasse de plus de 10 px dans la ligne (' + f0.cartes.map((c) => c.txt + ':' + Math.round(c.dansLigne)).join(', ') + ')');

    await page.touchscreen.tap(p0.x, p0.y);
    await page.waitForTimeout(400);
    const f1 = await etat(page, 'Francois');
    verifier(f1.cartes.length === 3 && empilees(f1.cartes) && f1.cartes.every((c) => c.vue), 'appui : les 3 bulles étalées, sans chevauchement, toutes visibles (' + f1.cartes.map((c) => c.txt + ' ' + Math.round(c.h) + '-' + Math.round(c.b) + ':' + c.vue).join(', ') + ')');
    verifier(f1.ligneH === f0.ligneH && f1.ligneB === f0.ligneB && f1.cartes[2].b > f1.ligneB + 10, 'appui : ligne de même hauteur, les bulles passent sur les lignes suivantes');
    verifier(f1.ps[0] && f1.ps[0].txt === '−' && !f1.pop, 'appui : pastille « − », aucun formulaire ouvert');

    // Appui sur une bulle étalée : sélection, bulles toujours étalées.
    const v = f1.cartes.find((c) => c.txt === 'Verte cachée');
    await page.touchscreen.tap(v.g + 20, v.h + 8);
    await page.waitForTimeout(400);
    const f2 = await etat(page, 'Francois');
    const v2 = f2.cartes.find((c) => c.txt === 'Verte cachée');
    verifier(v2.sel && Math.abs(v2.h - v.h) <= 1 && f2.ps[0].txt === '−', 'appui sur « Verte cachée » étalée : sélectionnée, à sa place (' + Math.round(v.h) + ' -> ' + Math.round(v2.h) + ')');
    await page.evaluate(() => quitterModeSelection());
    await page.waitForTimeout(200);

    // Nouvel appui : replacées.
    const pz = (await etat(page, 'Francois')).ps[0];
    await page.touchscreen.tap(pz.x, pz.y);
    await page.waitForTimeout(400);
    const f3 = await etat(page, 'Francois');
    verifier(f3.ps[0] && f3.ps[0].txt === '+2' && f3.cartes.map((c) => Math.round(c.h)).join() === f0.cartes.map((c) => Math.round(c.h)).join(), 'nouvel appui : bulles replacées en cascade, « +2 »');

    // Étalées, jour suivant, retour : replacées.
    await page.touchscreen.tap(f3.ps[0].x, f3.ps[0].y);
    await page.waitForTimeout(300);
    const aller = async (re) => {
      await page.evaluate((re) => {
        const sc = document.querySelector('#racine .scroller');
        const th = [...document.querySelectorAll('.th[data-gi]')].find((t) => new RegExp(re).test(t.textContent));
        sc.scrollTo({ left: sc.scrollLeft + th.getBoundingClientRect().left - sc.getBoundingClientRect().left - largeurNoms() });
      }, re);
      await page.waitForTimeout(1200);
    };
    await aller('30'); await aller('29');
    const f4 = await etat(page, 'Francois');
    verifier(f4.ps[0] && f4.ps[0].txt === '+2' && lisibles(f4) === 'Coffrage murs étage', 'étalées, jour suivant puis retour : bulles replacées');

    // Dernière ligne du planning : remontées pour rester dedans.
    const e0 = await etat(page, 'Echafaudage');
    await page.touchscreen.tap(e0.ps[0].x, e0.ps[0].y);
    await page.waitForTimeout(400);
    const e1 = await etat(page, 'Echafaudage');
    verifier(e1.cartes.length === 3 && empilees(e1.cartes) && e1.cartes.every((c) => c.vue) && e1.cartes[2].b <= e1.grilleB + 0.5,
      'dernière ligne : bulles étalées remontées, la dernière dans le planning (' + Math.round(e1.cartes[2].b) + ' <= ' + Math.round(e1.grilleB) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- Ordinateur ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD(), date: '2026-09-29T10:00:00' });
    await page.evaluate(() => { changerOptionAffichage('lignesOrdi', '1'); changerOptionAffichage('lignes', '1'); });
    await page.waitForTimeout(800);
    const f0 = await etat(page, 'Francois');
    verifier(f0.ps.length === 1 && /^\+[12]$/.test(f0.ps[0].txt), 'ordinateur (cartes plus hautes, la 2e dépasse assez) : pastille « +1 » ou « +2 » chez François (' + f0.ps.map((p) => p.txt) + ')');
    await page.mouse.click(f0.ps[0].x, f0.ps[0].y);
    await page.waitForTimeout(400);
    const f1 = await etat(page, 'Francois');
    verifier(f1.cartes.length === 3 && empilees(f1.cartes) && f1.cartes.every((c) => c.vue) && f1.ps[0].txt === '−' && !f1.pop, 'ordinateur : clic, bulles étalées et visibles, pastille « − »');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
