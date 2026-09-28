const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 41) — Lionel, capture du vendredi sur téléphone
// (cartes de 17 px, « B / é. », « E / v. ») : « En mode mobile, faire les
// calcul de texte et bulles sur le jour avant et après le jour affiché,
// pour éviter ce genre de petites bulles. »
// ajusterLargeurBullesJourMobile (js/grille-rendu.js) : les cartes de la
// veille et du lendemain reçoivent leur largeur définitive dès que le jour
// est posé, hors écran ; figerHauteursJourMobile les ignore.
//
// Lancer : node test_suite41.js

const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1 });
const TACHES = [
  T(1, 1, '2026-09-22', 'matin', 'Mardi'),
  T(2, 1, '2026-09-23', 'matin', 'Mercredi'),
  T(3, 1, '2026-09-24', 'matin', 'Coffrage'),
  T(4, 1, '2026-09-25', 'matin', 'Béton dalle étage et contrôle des réservations'), T(5, 1, '2026-09-25', 'aprem', 'Evacuation'),
  T(6, 2, '2026-09-25', 'matin', 'Béton dalle'), T(7, 2, '2026-09-25', 'aprem', 'Montage')
];
const etatCartes = (page) => page.evaluate(() => {
  const s = document.querySelector('.scroller'), rs = s.getBoundingClientRect();
  const o = {};
  document.querySelectorAll('.scroller .bulle').forEach((b) => {
    const c = b.querySelector('.b-carte'), r = c.getBoundingClientRect();
    o[b.textContent.trim().split(' ')[0] + (o[b.textContent.trim().split(' ')[0]] ? '2' : '')] = { cachee: c.style.display === 'none', l: Math.round(r.width), voisin: b.classList.contains('jour-voisin'),
      horsJour: b.classList.contains('hors-jour'), aEcran: r.right > rs.left + 1 && r.left < rs.right - 1, lignes: Math.round(c.querySelector('.b-txt').getBoundingClientRect().height) };
  });
  return o;
});
const hauteurLionel = (page) => page.evaluate(() => {
  const nom = [...document.querySelectorAll('.scroller .grille > *')].find((e) => e.textContent.trim() === 'Lionel');
  return Math.round(nom.getBoundingClientRect().height);
});

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 360, height: 760 }, hasTouch: true, bd: { taches: TACHES } });
    await page.waitForTimeout(400);
    const jour = await page.evaluate(() => Math.round(document.querySelector('.th[data-gi]').getBoundingClientRect().width));
    let c = await etatCartes(page);
    verifier(!c.Coffrage.voisin && c.Coffrage.aEcran && c.Coffrage.l === Math.round((jour - 1) / 2), 'jeudi posé : Coffrage (jeudi matin) à l\'écran, demi-journée (' + c.Coffrage.l + ' px)');
    verifier(!c.Béton.cachee && c.Béton.voisin && c.Béton.horsJour && !c.Béton.aEcran && c.Béton.l === c.Coffrage.l && !c.Evacuation.cachee && c.Evacuation.l === c.Coffrage.l,
      'lendemain (vendredi) : cartes déjà à leur largeur, hors écran, sans poignées (' + c.Béton.l + ' / ' + c.Evacuation.l + ' px)');
    verifier(c.Béton.lignes > 20, 'lendemain : texte déjà enroulé à sa largeur (' + c.Béton.lignes + ' px de haut)');
    verifier(!c.Mercredi.cachee && c.Mercredi.voisin && c.Mercredi.l === c.Coffrage.l, 'veille (mercredi) : carte prête elle aussi (' + c.Mercredi.l + ' px)');
    verifier(c.Mardi.cachee, '2 jours avant (mardi) : toujours masquée');
    const hJeudi = await hauteurLionel(page);

    // Glissement vers vendredi, doigt posé : aucune carte du vendredi ne change.
    const s0 = await page.evaluate(() => {
      const s = document.querySelector('.scroller');
      s.dispatchEvent(new TouchEvent('touchstart', { touches: [new Touch({ identifier: 1, target: s, clientX: 200, clientY: 400 })] }));
      s.style.scrollSnapType = 'none';
      return s.scrollLeft;
    });
    const largeurs = [];
    for (const fr of [0.03, 0.1, 0.4, 0.8]) {
      await page.evaluate(async ([s0, x]) => { document.querySelector('.scroller').scrollLeft = s0 + x; await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))); }, [s0, fr * jour]);
      await page.waitForTimeout(30);
      c = await etatCartes(page);
      largeurs.push([c.Béton.l, c.Béton2.l, c.Evacuation.l, c.Montage.l].join('/'));
    }
    const attendu = [c.Coffrage.l, c.Coffrage.l, c.Coffrage.l, c.Coffrage.l].join('/');
    verifier(largeurs.every((l) => l === attendu), 'glissement jeudi → vendredi : cartes du vendredi à leur largeur finale à 3, 10, 40 et 80 % (' + largeurs.join(' ; ') + ')');
    await page.evaluate(async ([s0, x]) => {
      const s = document.querySelector('.scroller'); s.scrollLeft = s0 + x;
      s.dispatchEvent(new TouchEvent('touchend', { touches: [] }));
    }, [s0, jour]);
    await page.waitForTimeout(700);
    c = await etatCartes(page);
    verifier(!c.Béton.voisin && c.Béton.aEcran && c.Coffrage.voisin && !c.Coffrage.cachee && !c.Coffrage.aEcran && c.Mercredi.cachee,
      'vendredi posé : jeudi devient la veille (prête), mercredi à nouveau masqué');
    verifier(c.Béton.l === c.Coffrage.l, 'vendredi posé : largeurs inchangées (' + c.Béton.l + ' px)');
    const hVendredi = await hauteurLionel(page);
    verifier(hVendredi > hJeudi, 'hauteurs : la ligne de Lionel suit le jour posé — jeudi ' + hJeudi + ' px (la longue tâche du vendredi, déjà calculée, n\'y compte pas), vendredi ' + hVendredi + ' px');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // Jour atteint en tenant une bulle (suite 26) : jour posé repris au lâcher.
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 360, height: 760 }, hasTouch: true, bd: { taches: TACHES } });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      document.body.classList.add('en-glissement');
      const s = document.querySelector('.scroller'); s.style.scrollSnapType = 'none';
      s.scrollLeft += document.querySelector('.th[data-gi]').getBoundingClientRect().width;
    });
    await page.waitForTimeout(700);
    const pendant = await etatCartes(page);
    await page.evaluate(() => document.body.classList.remove('en-glissement'));
    await page.waitForTimeout(700);
    const apres = await etatCartes(page);
    verifier(pendant.Béton.voisin && !apres.Béton.voisin && apres.Coffrage.voisin, 'bulle tenue jusqu\'au vendredi : jour posé calculé une fois la bulle lâchée (' + JSON.stringify([pendant.Béton.voisin, apres.Béton.voisin, apres.Coffrage.voisin]) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
