const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 35) — retours de Lionel :
//   1. « Rétréci la largeur des colonnes nom. Un nom composé ou avec / peut
//      être mis sur 2 lignes. » : --largeur-noms (92 px, style.css),
//      largeurNoms()/nomSurDeuxLignes() (js/core.js) ;
//   2. « Changer de jour en glissant une bulle contre le bord du jour ne
//      fonctionne pas sur mobile. » : saut d'un jour après un appui
//      maintenu contre le bord (creerAutoDefilement, js/grille-interactions.js) ;
//   3. « Je n'arrive pas à actionner les poignées gauche et droite sur
//      mobile » : poignées affichées en vue « 1 jour », tap = sélection,
//      appui maintenu = étirer (cablerPoigneeRedim) — depuis la suite 37,
//      visibles et actives seulement sur une bulle sélectionnée ;
//   4. « Comportement anormal des notes qui se trouvent sur des lignes
//      différentes sur le planning. En impression les notes sont regroupées
//      sous le même jour. » : pistes à la demi-journée (assignerPistesCompact)
//      et impression matin/après-midi (segmentsDemiImpression_, js/impression.js) ;
//   5. « Sur mobile, lors du défilement, la hauteur pourrait être calculée
//      lors de la fixation du jour » : figerHauteursJourMobile (js/grille-rendu.js).
//
// Lancer : node test_suite35.js

const T = (id, pid, date, demi, texte, ordre) => ({ id, personne_id: pid, date, demi, ordre: ordre || 0, texte, chantier_id: 1 });
const TELEPHONE = { width: 390, height: 844 };

// Doigt réel (CDP) : appui, attente, glissé en 10 pas, maintien, relâché.
async function doigt(page, a, b, tenir, attente) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  await page.waitForTimeout(attente == null ? 500 : attente);
  if (b) {
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * i / 10, y: a.y + (b.y - a.y) * i / 10 }] });
      await page.waitForTimeout(30);
    }
  }
  await page.waitForTimeout(tenir);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
  await cdp.detach();
}
const tache = (page, texte) => page.evaluate((x) => {
  const t = TACHES.find((t) => t.texte === x);
  return t && (isoDeGi(t.giDebut) + ' ' + (t.demiDebut || '-') + ' d' + t.duree + ' ' + (t.demiFin || '-'));
}, texte);
const jourVisible = (page) => page.evaluate(() => {
  const g = document.querySelector('.scroller').getBoundingClientRect().left + largeurNoms();
  return [...document.querySelectorAll('.entete-planning-figee .th[data-gi]')]
    .map((t) => ({ t, e: Math.abs(t.getBoundingClientRect().left - g) })).sort((a, b) => a.e - b.e)[0].t.textContent.slice(0, 5);
});
const centreCarte = (page, texte) => page.evaluate((x) => {
  const b = [...document.querySelectorAll('.scroller .bulle')].find((e) => e.textContent.includes(x));
  const r = b.querySelector('.b-carte').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, texte);
const poignee = (page, texte, cote) => page.evaluate(([x, c]) => {
  const b = [...document.querySelectorAll('.scroller .bulle')].find((e) => e.textContent.includes(x));
  const r = b.querySelector('.poignee-' + c).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, largeur: r.width, affichee: getComputedStyle(b.querySelector('.poignee-' + c)).display !== 'none' };
}, [texte, cote]);
// Attend que .scroller ne bouge plus (2 relevés identiques à 150 ms
// d'écart, au plus 3 s).
async function defilementArrete(page) {
  let avant = null;
  for (let i = 0; i < 20; i++) {
    const x = await page.evaluate(() => document.querySelector('.scroller').scrollLeft);
    if (x === avant) return;
    avant = x;
    await page.waitForTimeout(150);
  }
}
const revenirJeudi = (page) => page.evaluate(() => {
  const s = document.querySelector('.scroller');
  const th = document.querySelector('.entete-planning-figee .th.today');
  s.scrollLeft = th.getBoundingClientRect().left - document.querySelector('.entete-planning-figee .grille').getBoundingClientRect().left - largeurNoms();
});

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Colonne des noms : 92 px, noms à « / » sur 2 lignes ---
  {
    const P = (id, nom, ordre, st) => ({ id, nom, sous_traitant: !!st, equipe: false, ordre, actif: true });
    const PERS = [P(1, 'Lionel', 1), P(3, 'Mathis', 2), P(4, 'François', 3), P(2, 'Béton/Armature', 4, 1), P(7, 'Echafaudage', 5, 1)];
    const TACHES = [T(1, 1, '2026-09-24', 'matin', 'Gabarits'), T(2, 2, '2026-09-24', 'aprem', 'Armature dalle'), T(3, 7, '2026-09-24', 'matin', 'Montage')];
    for (const [nom, vp] of [['téléphone', TELEPHONE], ['ordinateur', { width: 1300, height: 700 }]]) {
      const { page, erreurs } = await ouvrirPlanning(browser, { viewport: vp, hasTouch: nom === 'téléphone', bd: { personnes: PERS, taches: TACHES } });
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const lbls = [...document.querySelectorAll('.scroller .lbl b')];
        const h = (n) => { const b = lbls.find((x) => x.textContent === n); return b ? Math.round(b.getBoundingClientRect().height) : 0; };
        const lbl = document.querySelector('.scroller .lbl');
        return { ln: largeurNoms(), largeur: Math.round(lbl.getBoundingClientRect().width / ((niveauZoomPlanning / 100) || 1)),
          lionel: h('Lionel'), beton: h('Béton/Armature'), echaf: h('Echafaudage'),
          wbr: !!lbls.find((x) => x.textContent === 'Béton/Armature').querySelector('wbr'),
          deborde: lbls.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent) };
      });
      verifier(r.ln === 92 && Math.abs(r.largeur - 92) <= 1, nom + ' : colonne des noms à 92 px (' + r.largeur + ')');
      verifier(r.wbr && r.beton >= 2 * r.lionel - 2, nom + ' : « Béton/Armature » coupé après le « / », sur 2 lignes (' + r.beton + ' px contre ' + r.lionel + ')');
      verifier(r.echaf === r.lionel && r.deborde.length === 0, nom + ' : mot le plus long (« Echafaudage ») sur 1 ligne, aucun nom qui déborde (' + r.deborde.join(', ') + ')');
      toutesErreurs.push(...erreurs);
      await page.close();
    }
  }

  // --- 2. Téléphone : glisser une bulle contre le bord pour changer de jour ---
  {
    const TACHES = [T(1, 1, '2026-09-24', 'matin', 'Gabarits'), T(2, 2, '2026-09-24', 'matin', 'Coffrage')];
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: TELEPHONE, hasTouch: true, bd: { taches: TACHES } });
    await page.waitForTimeout(400);
    verifier(await jourVisible(page) === 'Jeu24', 'départ : jeudi 24 affiché');
    let b = await centreCarte(page, 'Gabarits');
    await doigt(page, b, { x: 385, y: b.y }, 1000);
    verifier(await jourVisible(page) === 'Ven25' && await tache(page, 'Gabarits') === '2026-09-25 aprem d1 aprem', 'bulle maintenue contre le bord droit : vendredi affiché, tâche posée vendredi (' + await tache(page, 'Gabarits') + ')');
    b = await centreCarte(page, 'Gabarits');
    await doigt(page, b, { x: 40, y: b.y }, 1900);
    verifier(await jourVisible(page) === 'Mer23' && /^2026-09-23 /.test(await tache(page, 'Gabarits')), 'contre le bord gauche (sur la colonne des noms), 2 sauts : mercredi (' + await tache(page, 'Gabarits') + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Téléphone : poignées gauche/droite ---
  {
    const TACHES = [T(1, 1, '2026-09-24', 'matin', 'Gabarits'), T(2, 2, '2026-09-24', 'aprem', 'Coffrage')];
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: TELEPHONE, hasTouch: true, bd: { taches: TACHES } });
    await page.waitForTimeout(400);
    let p = await poignee(page, 'Gabarits', 'd');
    verifier(p.affichee && Math.round(p.largeur) === 22, 'poignées affichées en vue « 1 jour », 22 px de large (' + p.largeur + ')');
    await doigt(page, p, null, 0, 60);
    verifier(await page.evaluate(() => Object.keys(bullesSelectionnees).length) === 1, 'tap bref sur une poignée : la bulle est sélectionnée');
    p = await poignee(page, 'Gabarits', 'd');
    await doigt(page, p, { x: 300, y: p.y }, 0);
    verifier(await tache(page, 'Gabarits') === '2026-09-24 - d1 -', 'poignée droite étirée sur l\'après-midi : jeudi entier (' + await tache(page, 'Gabarits') + ')');
    p = await poignee(page, 'Gabarits', 'd');
    await doigt(page, p, { x: 386, y: p.y }, 1000);
    verifier(/^2026-09-24 - d2 /.test(await tache(page, 'Gabarits')), 'poignée droite maintenue contre le bord : étirée sur vendredi (' + await tache(page, 'Gabarits') + ')');
    await revenirJeudi(page);
    await page.waitForTimeout(600);
    // Suite 47 (fiabilisation — ce contrôle échouait de temps en temps sous
    // charge, jamais reproduit seul : tâche DÉPLACÉE sur mercredi au lieu
    // d'étirée, signe que la poignée n'était pas active, donc que le tap de
    // sélection n'avait pas pris). Le défilement doit être arrêté avant le
    // tap, et la sélection est vérifiée avant de tirer la poignée : un échec
    // dit désormais lequel des deux gestes n'a pas pris.
    await defilementArrete(page);
    // Suite 37 : poignées actives seulement sur une bulle sélectionnée —
    // tap sur Coffrage d'abord.
    await doigt(page, await centreCarte(page, 'Coffrage'), null, 0, 60);
    const selection = await page.waitForFunction(() => Object.keys(bullesSelectionnees).length === 1, null, { timeout: 3000 }).then(() => true, () => false);
    verifier(selection, 'tap sur Coffrage : bulle sélectionnée, poignées actives');
    p = await poignee(page, 'Coffrage', 'g');
    await doigt(page, p, { x: 40, y: p.y }, 1000);
    verifier(/^2026-09-23 .* d2 /.test(await tache(page, 'Coffrage')), 'poignée gauche maintenue contre la colonne des noms : étirée sur mercredi (' + await tache(page, 'Coffrage') + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Notes à la demi-journée : planning et impression ---
  {
    const N = (id, date, demi, texte, important) => ({ id, date, demi, texte, important: !!important });
    const NOTES = [
      N(1, '2026-09-23', 'matin', 'Remorque plateau'), N(2, '2026-09-23', 'aprem', 'Tri déchets dépôt'),
      N(3, '2026-09-24', 'matin', 'Libérer garage BINE', true),
      N(4, '2026-09-21', null, 'Grue'), N(5, '2026-09-22', 'matin', 'Grue'),
      N(6, '2026-09-23', null, 'Livraison acier')
    ];
    const JALONS = [
      { id: 1, date: '2026-09-21', demi: 'aprem', texte: 'Maçonnerie' }, { id: 2, date: '2026-09-22', demi: null, texte: 'Maçonnerie' },
      { id: 3, date: '2026-09-23', demi: 'matin', texte: 'Maçonnerie' }, { id: 4, date: '2026-09-25', demi: 'matin', texte: 'Réception' }
    ];
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: { notes: NOTES, jalons: JALONS } });
    await page.waitForTimeout(300);
    const lignes = await page.evaluate(() => {
      const o = {};
      document.querySelectorAll('.bulle-note').forEach((b) => { o[b.textContent.trim()] = b.style.gridRow; });
      return o;
    });
    verifier(lignes['Remorque plateau'] === lignes['Tri déchets dépôt'] && lignes['Tri déchets dépôt'] === lignes['Libérer garage BINE'] && lignes['Grue'] === lignes['Remorque plateau'],
      'planning : notes de demi-journées différentes sur la même ligne (' + JSON.stringify(lignes) + ')');
    verifier(lignes['Livraison acier'] !== lignes['Remorque plateau'], 'planning : la note de journée entière du mercredi passe sur une 2e ligne');
    await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(300);
    const impr = await page.evaluate(() => [...document.querySelectorAll('table.print-table tbody tr.print-jalons, table.print-table tbody tr.print-notes')].map((tr) => tr.className + ': '
      + [...tr.children].map((td) => td.colSpan + (td.rowSpan > 1 ? 'r' + td.rowSpan : '') + (td.textContent ? '[' + td.textContent + (td.querySelector('.print-important') ? '!' : '') + ']' : '')).join(' ')));
    verifier(impr[0] === 'print-jalons: 1[Jalons] 1 4[Maçonnerie] 1 2 1[Réception] 1',
      'impression, jalons : du lundi après-midi au mercredi matin, puis vendredi matin seul (' + impr[0] + ')');
    verifier(impr[1] === 'print-notes: 1r2 3[Grue] 1 1[Remorque plateau] 1[Tri déchets dépôt] 1[Libérer garage BINE!] 1 2',
      'impression, notes 1re ligne : mercredi matin / après-midi séparés, jeudi matin seul, Grue lundi → mardi matin (' + impr[1] + ')');
    verifier(impr[2] === 'print-notes: 2 2 2[Livraison acier] 2 2' && impr.length === 3,
      'impression, notes 2e ligne : la journée entière du mercredi (' + impr[2] + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 5. Téléphone : hauteurs calculées pour le jour posé, figées pendant le glissement ---
  {
    const TACHES = [
      T(1, 1, '2026-09-24', 'matin', 'Gabarits'), T(2, 1, '2026-09-24', 'aprem', 'Armature dalle'),
      T(4, 2, '2026-09-23', 'aprem', 'Ouvertures murs', 0), T(5, 2, '2026-09-23', 'aprem', 'Contrôle armature', 1),
      T(6, 2, '2026-09-24', 'matin', 'Gabarits')
    ];
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: TELEPHONE, hasTouch: true, bd: { taches: TACHES } });
    await page.waitForTimeout(400);
    const hauteurs = () => page.evaluate(() => {
      const o = {};
      document.querySelectorAll('.scroller .lbl').forEach((l) => { o[l.textContent.trim()] = Math.round(l.getBoundingClientRect().height); });
      o.coupes = [...document.querySelectorAll('.scroller .bulle .b-carte')].filter((c) => c.style.display !== 'none' && parseFloat(c.style.width) >= 30 && c.scrollHeight > c.clientHeight + 1).length;
      return o;
    });
    const aller = (dec, poser) => page.evaluate(async ([dec, poser]) => {
      const s = document.querySelector('.scroller');
      if (poser) s.dispatchEvent(new TouchEvent('touchstart', { touches: [new Touch({ identifier: 1, target: s, clientX: 200, clientY: 400 })] }));
      s.style.scrollSnapType = 'none';
      const th = document.querySelector('.entete-planning-figee .th.today');
      const g = document.querySelector('.entete-planning-figee .grille');
      // Suite 58 : les hauteurs suivent l'événement « scroll », que Chrome
      // sans écran livre parfois après 2 images — on l'attend (300 ms max).
      const defile = new Promise((ok) => { s.addEventListener('scroll', ok, { once: true }); setTimeout(ok, 300); });
      const x = Math.round(th.getBoundingClientRect().left - g.getBoundingClientRect().left - largeurNoms() + dec * th.getBoundingClientRect().width);
      const bouge = Math.abs(s.scrollLeft - x) >= 1;
      s.scrollLeft = x;
      if (bouge) await defile;
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    }, [dec, poser]);
    // 200 ms d'arrêt, puis (suite 57) 220 ms de glissement des hauteurs
    // vers celles du jour posé : on mesure une fois arrivées.
    const lacher = async () => {
      await page.evaluate(() => document.querySelector('.scroller').dispatchEvent(new TouchEvent('touchend', { touches: [] })));
      await page.waitForTimeout(700);
    };
    const jeudi = await hauteurs();
    verifier(jeudi.Mathis === jeudi.Lionel, 'jeudi posé : Mathis n\'a qu\'une bulle ce jour-là, sa ligne a la hauteur de celle de Lionel (' + jeudi.Mathis + ' / ' + jeudi.Lionel + ')');
    // Suite 58 (round du 26.09.2026) — Lionel : « quand une hauteur de
    // bulle change, il faudrait que ce soit progressif, durant le switch ».
    // La ligne de Mathis grandit avec le geste au lieu d'attendre le lâcher.
    const suite = [];
    for (const d of [-0.25, -0.5, -0.75, -1]) { await aller(d, true); const h = await hauteurs(); suite.push(h.Mathis); }
    verifier(suite.every((h, i) => h > (i ? suite[i - 1] : jeudi.Mathis)), 'doigt posé, glissement vers mercredi : la ligne de Mathis grandit avec le geste (' + jeudi.Mathis + ' ' + suite.join(' ') + ')');
    await lacher();
    const mercredi = await hauteurs();
    verifier(mercredi.Mathis > jeudi.Mathis + 20 && mercredi.coupes === 0 && mercredi.Mathis === suite[3], 'mercredi posé : la ligne de Mathis a ses 2 bulles empilées, rien de coupé, rien ne bouge au lâcher (' + jeudi.Mathis + ' → ' + mercredi.Mathis + ')');
    await aller(-0.5, true);
    const miRetour = (await hauteurs()).Mathis;
    await aller(0, true);
    verifier(miRetour < mercredi.Mathis && miRetour > jeudi.Mathis && (await hauteurs()).Mathis === jeudi.Mathis, 'retour vers jeudi, doigt posé : la hauteur redescend avec le geste (' + mercredi.Mathis + ' → ' + miRetour + ' → ' + jeudi.Mathis + ')');
    await lacher();
    verifier((await hauteurs()).Mathis === jeudi.Mathis, 'jeudi reposé : la ligne de Mathis reprend sa hauteur du jeudi');
    await page.evaluate(() => { niveauZoomPlanning = 80; render(false); });
    await page.waitForTimeout(300);
    const z = await hauteurs();
    verifier(z.Mathis === z.Lionel && z.coupes === 0, 'zoom 80 % : même calcul au jour posé, la lamelle de la veille ne compte pas (' + z.Mathis + ' / ' + z.Lionel + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan());
})();
