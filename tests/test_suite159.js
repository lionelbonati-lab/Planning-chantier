const path = require('path');
const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 10.11.2026 (suite 159) — Lionel : « J'aimerais que tu écrives
// une page, comment ça marche, pour ceux qui se connectent la première
// fois, afin d'expliquer un peu toutes les fonctionnalités de
// l'application. Si jamais sur la tablette qu'on a au travail, on a un
// stylet, ce stylet agit comme un de gauche souris. Et quand on appuie
// avec le doigt, ce sera plutôt un clic droit. » Ses choix : « L'expliquer
// dans la page », « 1re connexion + Réglages », « Une page à sections ».
// Vérifie :
//   A. Réglages › Comment ça marche : onglet, sections dépliables, la
//      première ouverte.
//   B. Gestes selon l'appareil : celui de l'appareil choisi d'office ;
//      tablette : encadré stylet (clic gauche) / doigt (appui long = clic
//      droit) ; passer d'un appareil à l'autre.
//   C. Première connexion (mot de passe provisoire remplacé) : la page
//      s'ouvre ; connexion ordinaire : le planning.
//   D. Téléphone : rien ne déborde.
//   E. Rangée des réglages resserrée (1280 px) : noms courts (« Aide »,
//      « Impression »…), nom entier dans l'infobulle.
//
// Lancer : node test_suite159.js

(async () => {
  const { verifier, bilan } = verificateur();
  const browser = await lancerNavigateur(chromium);
  const erreurs = [];
  const lire = (page) => page.evaluate(() => {
    const vis = (e) => !!e && !e.closest('[hidden]') && e.getClientRects().length > 0;
    const p = document.getElementById('page-aide');
    return {
      active: p.classList.contains('actif'),
      sections: [...p.querySelectorAll('.aide-section > summary')].map((s) => s.textContent),
      ouvertes: [...p.querySelectorAll('.aide-section[open] > summary')].map((s) => s.textContent),
      appareil: (p.querySelector('[data-appareil-aide].actif') || {}).textContent || '',
      encadre: vis(p.querySelector('.aide-encadre')) ? p.querySelector('.aide-encadre').textContent : '',
      gestes: [...p.querySelectorAll('.aide-gestes')].filter(vis).map((t) => [...t.querySelectorAll('th')].map((th) => th.textContent)).flat(),
      deborde: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });

  // ---- A + B. Ordinateur --------------------------------------------------------------------
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 1280, height: 900 } });
    const onglet = await page.evaluate(() => PAGES_REGLAGES[PAGES_REGLAGES.length - 1].page === 'aide' && !!document.querySelector('.onglet[data-page="aide"]') &&
      !document.querySelector('.onglet[data-page="aide"]').hidden && document.querySelector('.page.actif').id);
    await page.evaluate(() => afficherPage('aide'));
    await page.waitForTimeout(200);
    let r = await lire(page);
    verifier(onglet === 'page-planning' && r.active && r.sections.length === 13 && r.sections[0] === 'Pour commencer' && r.sections[1] === 'Les gestes' &&
      JSON.stringify(r.ouvertes) === '["Pour commencer"]',
      'Réglages › Comment ça marche : onglet (dernier), 13 sections, « Pour commencer » ouverte ; connexion ordinaire : le planning (' + JSON.stringify(r.sections) + ')');
    verifier(r.appareil === 'Ordinateur' && !r.encadre && r.gestes.includes('Clic droit') && r.gestes.includes('Glisser le bord d’une bulle') && !r.gestes.includes('Toucher une bulle'),
      'ordinateur : gestes de la souris, pas ceux du doigt (' + r.gestes.length + ' gestes)');
    await page.click('[data-appareil-aide="tablette"]');
    r = await lire(page);
    verifier(r.appareil === 'Tablette' && /Avec un stylet, la pointe fait le clic gauche de la souris/.test(r.encadre) && /Avec le doigt, l’appui long fait le clic droit/.test(r.encadre) &&
      r.gestes.includes('Appui long sur une bulle') && r.gestes.includes('Double toucher une case vide') && !r.gestes.includes('Clic droit'),
      'tablette : stylet = clic gauche, appui long du doigt = clic droit, gestes du doigt (' + r.encadre + ')');
    const rangee = await page.evaluate(() => ({ serres: document.getElementById('ongletsNav').classList.contains('onglets-serres'),
      noms: [...document.querySelectorAll('#ongletsReglages .onglet:not([hidden])')].map((b) => b.textContent + '=' + b.title).filter((x) => !/^(.+)=\1$/.test(x)) }));
    verifier(rangee.serres && JSON.stringify(rangee.noms) === JSON.stringify(['Compte=Mon compte', 'Impression=Mise en page d’impression', 'Raccourcis=Raccourcis clavier', 'Liens=Liens responsables', 'Aide=Comment ça marche']),
      '1280 px : rangée des réglages resserrée, noms courts, nom entier en infobulle (' + JSON.stringify(rangee) + ')');
    await page.click('.aide-section:nth-child(4) > summary');
    const plie = await page.evaluate(() => document.querySelectorAll('.aide-section[open]').length);
    verifier(plie === 2, 'une section se déplie d\'un toucher (' + plie + ' ouvertes)');
    erreurs.push(...e);
    await page.close();
  }

  // ---- B + D. Téléphone ---------------------------------------------------------------------
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true });
    await page.evaluate(() => afficherPage('aide'));
    await page.waitForTimeout(200);
    await page.evaluate(() => document.querySelectorAll('.aide-section').forEach((d) => { d.open = true; }));
    const r = await lire(page);
    verifier(r.appareil === 'Téléphone' && !r.encadre && r.gestes.includes('Toucher une bulle') && !r.deborde,
      'téléphone : appareil reconnu, gestes du doigt, rien ne déborde, toutes sections ouvertes (' + JSON.stringify({ appareil: r.appareil, deborde: r.deborde }) + ')');
    erreurs.push(...e);
    await page.close();
  }

  // ---- C. Première connexion ----------------------------------------------------------------
  {
    const init = (d) => { window.__AUTH_INITIALE = d.auth; };
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 1280, height: 900 }, init, attendre: '#formChoixMdp',
      initArg: { auth: { motDePasse: 'abcd-efgh-jkmn', metadata: { changer_mot_de_passe: true, prenom: 'Paul' } } } });
    await page.fill('#champNouveauMdp', 'NouveauMdp2026');
    await page.fill('#champNouveauMdp2', 'NouveauMdp2026');
    await page.click('#btnChoixMdp');
    await page.waitForSelector('#page-aide.actif', { timeout: 8000 }).catch(() => {});
    const r = await page.evaluate(() => ({ page: (document.querySelector('.page.actif') || {}).id, reglages: document.querySelector('.app-shell').classList.contains('mode-reglages'), plus: aideAOuvrir_ }));
    verifier(r.page === 'page-aide' && r.reglages && r.plus === false,
      'première connexion : après le choix du mot de passe, « Comment ça marche » s\'ouvre (une fois) (' + JSON.stringify(r) + ')');
    erreurs.push(...e);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(erreurs));
})();
