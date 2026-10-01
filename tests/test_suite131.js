const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 30.09.2026 (suite 131). Lionel : « J'aimerai que les équipes
// soient plus modulable, possibilité d'ajouter/retirer une personnes un ou
// plusieurs jours/demi-jour. Propose moi des solutions. » Son choix :
// « Exceptions » — la composition de la semaine reste la base ; clic droit
// sur une ou plusieurs cases d'un membre → « Retirer de l'équipe » ; clic
// droit sur la ligne d'équipe → « Ajouter quelqu'un » pour ces
// demi-journées ; case retirée « Hors équipe », personne ajoutée
// « + Équipe » ; vue ouvrier et impression suivent (sql/0032,
// js/equipes.js). Vérifie :
//   1. la règle (estMembreEquipeLe) : composition, retrait, ajout ici,
//      ajout ailleurs ;
//   2. au chargement : case « Hors équipe », détail dans l'info-bulle de
//      l'équipe ; Round du 01.10.2026 (suite 133) : équipe repliée = tous
//      ses membres cachés (retour 6, « J'aimerai pouvoir replier
//      complètement les équipes. »), point « • » sur l'équipe pour Marc,
//      puis l'équipe est dépliée pour la suite ;
//   3. ligne d'équipe : « Ajouter quelqu'un › » → Paul → ligne « ajout »
//      en base, sa case « + Équipe A », « +Paul » dans l'étiquette ;
//   4. clic droit sur la case d'un membre : « Retirer de l'équipe » →
//      ligne « retrait » ; plage glissée : « Remettre dans l'équipe »
//      efface le retrait ;
//   5. case de Paul : « Retirer de l'équipe » efface son ajout ;
//   6. impression : « +Paul » dans l'équipe, « Hors équipe » / « + Équipe A »
//      dans les cases, lignes gardées même sans tâche ;
//   7. aucune erreur JS.
//
// Lancer : node test_suite131.js

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, ordre, actif: true }, x || {});
const X = (id, equipe_id, personne_id, date, demi, sorte) => ({ id, equipe_id, personne_id, date, demi, sorte });
const BD = (exceptions) => ({
  personnes: [P(10, 'Équipe A', 1, { equipe: true }), P(11, 'Équipe B', 2, { equipe: true }), P(4, 'Luc', 3), P(5, 'Marc', 4), P(1, 'Paul', 5), P(2, 'Anne', 6)],
  equipes_compositions: [{ id: 1, equipe_id: 10, lundi: '2026-09-21', membres: [4, 5] }],
  taches: [
    { id: 1, personne_id: 10, date: '2026-09-22', demi: 'matin', ordre: 0, texte: 'Coffrage', chantier_id: 1 },
    { id: 2, personne_id: 2, date: '2026-09-22', demi: 'matin', ordre: 0, texte: 'Métré', chantier_id: 1 }
  ],
  equipes_exceptions: exceptions
});

const point = (page, pid, iso, demi) => page.evaluate(([pid, iso, demi]) => {
  let gi = -1;
  for (let g = 0; g < 80; g++) if (isoDeGi(g) === iso) { gi = g; break; }
  const c = document.querySelector('.cell[data-kind="personne"][data-personne="' + pid + '"][data-demi="' + demi + '"][data-jour="' + gi + '"]');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  for (const fy of [0.5, 0.85, 0.15]) for (const fx of [0.5, 0.15, 0.85]) {
    const x = r.x + r.width * fx, y = r.y + r.height * fy;
    if (document.elementFromPoint(x, y) === c) return { x, y };
  }
  return null;
}, [pid, iso, demi]);
const marque = (page, pid, iso, demi) => page.evaluate(([pid, iso, demi]) => {
  const gi = giDepuisIso(iso);
  const c = document.querySelector('.cell[data-kind="personne"][data-personne="' + pid + '"][data-demi="' + demi + '"][data-jour="' + gi + '"]');
  if (!c) return 'absente';
  return (c.classList.contains('hors-equipe') ? 'hors' : c.classList.contains('ajout-equipe') ? 'ajout' : '-') + ':' + (c.dataset.exception || '') +
    (c.classList.contains('hors-equipe') || c.classList.contains('ajout-equipe') ? ':' + getComputedStyle(c, '::after').content : '');
}, [pid, iso, demi]);
const boutons = (page) => page.evaluate(() => { const m = document.querySelector('.menu-pop'); return m ? [...m.querySelectorAll('button')].map((b) => b.textContent.trim()) : null; });
const cliquerBouton = (page, texte) => page.evaluate((texte) => {
  const b = [...document.querySelectorAll('.menu-pop button')].find((x) => x.textContent.trim() === texte);
  if (!b) return false;
  b.click();
  return true;
}, texte);
const exceptionsBD = (page) => page.evaluate(() => (window.__BD.equipes_exceptions || []).map((x) => x.equipe_id + '/' + x.personne_id + '/' + x.date.slice(5) + '/' + x.demi + '/' + x.sorte).sort().join(' '));
const lignes = (page) => page.evaluate(() => [...document.querySelectorAll('#racine .grille > .lbl[data-ligne^="p"]')].map((l) => l.dataset.ligne).join(','));
const fermer = async (page) => { await page.keyboard.press('Escape'); await page.mouse.click(5, 790); await page.waitForTimeout(150); };

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD([X(50, 10, 5, '2026-09-25', 'aprem', 'retrait')]) });
    await page.waitForTimeout(200);

    // --- 1. La règle --------------------------------------------------------------
    const regle = await page.evaluate(() => {
      const avant = etat.exceptionsEquipes;
      etat.exceptionsEquipes = normaliserExceptions([
        { id: 1, equipe_id: 10, personne_id: 4, date: '2026-09-23', demi: 'matin', sorte: 'retrait' },
        { id: 2, equipe_id: 11, personne_id: 5, date: '2026-09-23', demi: 'matin', sorte: 'ajout' },
        { id: 3, equipe_id: 10, personne_id: 1, date: '2026-09-23', demi: 'aprem', sorte: 'ajout' }
      ]);
      const m = (e, p, d) => (estMembreEquipeLe(e, p, '2026-09-23', d) ? 1 : 0);
      const r = [m(10, 4, 'aprem'), m(10, 4, 'matin'), m(10, 5, 'matin'), m(11, 5, 'matin'), m(10, 1, 'aprem'), m(10, 1, 'matin'), m(10, 2, 'aprem')].join('') +
        ' ' + [equipeDuMembreLe(5, '2026-09-23', 'matin'), equipeDuMembreLe(4, '2026-09-23', 'matin'), equipeDuMembreLe(1, '2026-09-23', 'aprem')].join(',') +
        ' ' + [exceptionCase(4, '2026-09-23', 'matin'), exceptionCase(5, '2026-09-23', 'matin'), exceptionCase(4, '2026-09-23', 'aprem')].map((x) => x ? x.texte : '-').join(',');
      etat.exceptionsEquipes = avant;
      return r;
    });
    verifier(regle === '1001100 11,,10 Hors équipe,+ Équipe B,-',
      'règle : membre par la composition, sauf retiré ici ou ajouté ailleurs ; ajouté ici = membre (' + regle + ')');

    // --- 2. Chargement --------------------------------------------------------------
    let l = await lignes(page);
    const titre = await page.evaluate(() => document.querySelector('#racine .lbl-equipe[data-equipe="10"]').title);
    const pointEq = await page.evaluate(() => !!document.querySelector('#racine .lbl-equipe[data-equipe="10"] .equipe-point'));
    verifier(l === 'p10,p11,p1,p2' && pointEq && /Marc : hors équipe, ven\. 25\.09 après-midi/.test(titre) && /Membre caché avec une tâche ou une absence : Marc/.test(titre),
      'chargement : équipe repliée, Luc et Marc cachés, point « • » pour Marc, détail dans l’info-bulle (' + l + ' ; ' + JSON.stringify(titre) + ')');
    await page.evaluate(() => basculerDepliageEquipe('10'));
    await page.waitForTimeout(300);
    l = await lignes(page);
    let m = await marque(page, '5', '2026-09-25', 'aprem');
    verifier(l === 'p10,p4,p5,p11,p1,p2' && m === 'hors:Hors équipe:"Hors équipe"',
      'équipe dépliée : Luc et Marc affichés, case de Marc « Hors équipe » (' + l + ' ; ' + m + ')');

    // --- 3. Ligne d'équipe : Ajouter quelqu'un --------------------------------------------
    await page.evaluate(() => changerModeAjoutPlanning(true));
    await page.waitForTimeout(150);
    let c = await point(page, '10', '2026-09-23', 'matin');
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(200);
    let b = await boutons(page);
    verifier(b && b.includes('Ajouter quelqu’un ›') && b.includes('Retirer quelqu’un ›') && b.includes('Luc ›'),
      'menu de la ligne d’équipe : « Ajouter quelqu’un › », « Retirer quelqu’un › » (et toujours « Pour un membre ») ' + JSON.stringify(b));
    await cliquerBouton(page, 'Ajouter quelqu’un ›');
    await page.waitForTimeout(150);
    b = await boutons(page);
    const titreSous = await page.evaluate(() => document.querySelector('.menu-pop .cp-titre').textContent);
    verifier(JSON.stringify(b) === '["Paul","Anne"]' && titreSous === 'Ajouter quelqu’un — Équipe A (1 demi-journée)',
      'sous-menu : les personnes hors de l’équipe à cette demi-journée (' + titreSous + ' ' + JSON.stringify(b) + ')');
    await cliquerBouton(page, 'Paul');
    await page.waitForTimeout(400);
    let bd = await exceptionsBD(page);
    m = await marque(page, '1', '2026-09-23', 'matin');
    const etiquette = await page.evaluate(() => document.querySelector('#racine .lbl-equipe[data-equipe="10"] .equipe-membres').textContent);
    const menuFerme = await page.evaluate(() => !document.querySelector('.menu-pop'));
    verifier(bd === '10/1/09-23/matin/ajout 10/5/09-25/aprem/retrait' && m === 'ajout:+ Équipe A:"+ Équipe A"' && etiquette === 'Luc, Marc, +Paul' && menuFerme,
      'Paul ajouté : ligne « ajout » en base, sa case « + Équipe A », « +Paul » sur l’équipe (' + bd + ' ; ' + m + ' ; ' + etiquette + ')');

    // --- 4. Case d'un membre : Retirer / Remettre ------------------------------------------------
    await page.evaluate(() => changerModeAjoutPlanning(false));
    await page.waitForTimeout(150);
    c = await point(page, '5', '2026-09-24', 'matin');
    await page.mouse.click(c.x, c.y, { button: 'right' });
    await page.waitForTimeout(250);
    b = await boutons(page);
    verifier(b && b.includes('Retirer de l’équipe Équipe A') && !b.some((x) => /Remettre/.test(x)),
      'clic droit sur la case de Marc : « Retirer de l’équipe Équipe A » ' + JSON.stringify(b));
    await cliquerBouton(page, 'Retirer de l’équipe Équipe A');
    await page.waitForTimeout(400);
    bd = await exceptionsBD(page);
    m = await marque(page, '5', '2026-09-24', 'matin');
    verifier(bd === '10/1/09-23/matin/ajout 10/5/09-24/matin/retrait 10/5/09-25/aprem/retrait' && m.startsWith('hors:Hors équipe'),
      'retrait : ligne « retrait » en base, case « Hors équipe » (' + bd + ' ; ' + m + ')');

    await page.evaluate(() => changerModeAjoutPlanning(true));
    await page.waitForTimeout(150);
    const de = await point(page, '5', '2026-09-24', 'aprem'), vers = await point(page, '5', '2026-09-25', 'aprem');
    await page.mouse.move(de.x, de.y);
    await page.mouse.down();
    await page.mouse.move((de.x + vers.x) / 2, de.y, { steps: 5 });
    await page.mouse.move(vers.x, vers.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    b = await boutons(page);
    verifier(b && b.includes('Retirer de l’équipe Équipe A') && b.includes('Remettre dans l’équipe Équipe A'),
      'plage glissée (jeu. après-midi → ven. après-midi) : « Retirer » et « Remettre » ' + JSON.stringify(b));
    await cliquerBouton(page, 'Remettre dans l’équipe Équipe A');
    await page.waitForTimeout(400);
    bd = await exceptionsBD(page);
    m = await marque(page, '5', '2026-09-25', 'aprem');
    verifier(bd === '10/1/09-23/matin/ajout 10/5/09-24/matin/retrait' && m === '-:',
      'remettre : le retrait de la plage effacé, celui d’avant (jeu. matin) gardé (' + bd + ' ; ' + m + ')');
    await page.evaluate(() => changerModeAjoutPlanning(false));

    // --- 5. Case de Paul : Retirer = effacer son ajout -------------------------------------------
    c = await point(page, '1', '2026-09-23', 'matin');
    await page.mouse.click(c.x, c.y, { button: 'right' });
    await page.waitForTimeout(250);
    await cliquerBouton(page, 'Retirer de l’équipe Équipe A');
    await page.waitForTimeout(400);
    bd = await exceptionsBD(page);
    m = await marque(page, '1', '2026-09-23', 'matin');
    verifier(bd === '10/5/09-24/matin/retrait' && m === '-:', 'case de Paul, « Retirer de l’équipe » : son ajout effacé (' + bd + ' ; ' + m + ')');
    await fermer(page);
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 6. Impression ---------------------------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD([X(50, 10, 5, '2026-09-25', 'aprem', 'retrait'), X(51, 10, 1, '2026-09-23', 'matin', 'ajout')]) });
    await page.evaluate(() => openPrintSheet());
    await page.waitForTimeout(300);
    const impr = await page.evaluate(() => {
      const rangs = [...document.querySelectorAll('.print-doc tbody > tr:not([class])')];
      const rang = (nom) => rangs.find((r) => r.querySelector('td').childNodes[0].textContent === nom);
      const exc = (r) => r ? [...r.querySelectorAll('.print-exception')].map((x) => x.textContent).join(',') : 'absent';
      return {
        lignes: rangs.map((r) => r.querySelector('td').childNodes[0].textContent).join('+'),
        equipe: (document.querySelector('.print-doc .print-membres') || {}).textContent,
        marc: exc(rang('Marc')), paul: exc(rang('Paul'))
      };
    });
    verifier(impr.lignes === 'Équipe A+Marc+Paul+Anne' && impr.equipe === 'Luc, Marc, +Paul' && impr.marc === 'Hors équipe' && impr.paul === '+ Équipe A',
      'impression : « +Paul » sur l’équipe, Marc « Hors équipe » et Paul « + Équipe A », gardés sans tâche (' + JSON.stringify(impr) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
