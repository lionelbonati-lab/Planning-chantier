const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 30.09.2026 (suite 132). Lionel (retour n° 4) : « Les groupes
// machines et transports font leur apparitions.
// J'aimerai pouvoir réorganiser mes groupes dans le planning.
// Pas besoin du type d'absence dans le nouveau formulaire arrivée/départ. »
// Ses choix : lignes Machines / Transports « Comme le personnel » ;
// « Glisser les titres » des sections du planning, ordre enregistré pour
// le compte et suivi à l'impression (sql/0033, js/groupes.js). Vérifie :
//   1. sections Personnel, Intervenants, Machines, Transports avec leur
//      poignée ⠿, chaque ligne dans son groupe ;
//   2. glisser le titre « Machines » au-dessus de « Personnel » : ordre
//      affiché et réglage « ordre_groupes » écrit en base ; « Intervenants »
//      glissé tout en bas ;
//   3. rechargement : l'ordre enregistré est repris ;
//   4. glisser une tâche : dans le même groupe seulement ;
//   5. menu d'ajout sur une machine : « Absence » proposée (panne, révision) ;
//   6. page Personnel : une liste par groupe, « + Ajouter » crée une ligne
//      avec groupe_id ; les machines ne sont plus dans « Personnes » ;
//   7. impression : sections dans l'ordre du planning, séparation entre
//      chacune, case et groupe d'options par groupe ;
//   8. formulaire arrivée / départ sans type d'absence ;
//   9. aucune erreur JS (bilan).
//
// Lancer : node test_suite132.js

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, groupe_id: null, ordre, actif: true }, x || {});
const T = (id, personne_id, date, texte) => ({ id, personne_id, date, demi: 'matin', ordre: 0, texte, chantier_id: 1 });
const BD = (reglages) => ({
  personnes: [P(1, 'Paul', 1), P(20, 'Pelle', 2, { groupe_id: 1 }), P(3, 'Béton SA', 3, { sous_traitant: true }), P(21, 'Camion', 4, { groupe_id: 2 }),
    P(2, 'Anne', 5), P(22, 'Grue', 6, { groupe_id: 1 })],
  groupes: [{ id: 1, nom: 'Machines', ordre: 1, actif: true }, { id: 2, nom: 'Transports', ordre: 2, actif: true }],
  taches: [T(1, 1, '2026-09-22', 'Coffrage'), T(2, 20, '2026-09-22', 'Terrassement'), T(3, 3, '2026-09-23', 'Dalle'), T(4, 21, '2026-09-23', 'Livraison')],
  reglages: reglages || []
});

const sections = (page) => page.evaluate(() => [...document.querySelectorAll('#racine .section-row[data-section]')]
  .map((s) => s.dataset.section + (s.querySelector('.section-poignee') ? '⠿' : '') + ':' + s.querySelector('.section-label').textContent).join(' '));
const lignes = (page) => page.evaluate(() => [...document.querySelectorAll('#racine .grille > .lbl[data-ligne^="p"]')].map((l) => l.dataset.ligne).join(','));
const glisserTitre = async (page, cle, versCle, dessous) => {
  const [a, b] = await page.evaluate(([cle, versCle]) => [cle, versCle].map((k) => {
    const s = document.querySelector('#racine .section-row[data-section="' + k + '"]');
    const r = (k === cle ? s.querySelector('.section-poignee') : s).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, haut: r.top, bas: r.bottom };
  }), [cle, versCle]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x, a.y + 10, { steps: 3 });
  const y = dessous ? b.bas + 40 : b.haut + 2;
  await page.mouse.move(a.x, y, { steps: 8 });
  const trait = await page.evaluate(() => !!document.querySelector('.section-trait'));
  await page.mouse.up();
  await page.waitForTimeout(300);
  return trait;
};

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    await page.waitForTimeout(200);

    // --- 1. Sections ------------------------------------------------------------------
    let s = await sections(page), l = await lignes(page);
    verifier(s === 'personnel⠿:Personnel intervenants⠿:Intervenants groupe-1⠿:Machines groupe-2⠿:Transports' && l === 'p1,p2,p3,p20,p22,p21',
      'sections Personnel, Intervenants, Machines, Transports avec poignée ; chaque ligne dans son groupe (' + s + ' ; ' + l + ')');

    // --- 2. Glisser les titres ---------------------------------------------------------
    const trait = await glisserTitre(page, 'groupe-1', 'personnel', false);
    s = await sections(page); l = await lignes(page);
    const ecrit = await page.evaluate(() => JSON.stringify(((window.__BD.reglages || []).find((r) => r.cle === 'ordre_groupes') || {}).valeur));
    const toast1 = await page.evaluate(() => (document.querySelector('.toast') || {}).textContent);
    verifier(trait && s.startsWith('groupe-1⠿:Machines personnel⠿:Personnel intervenants') && l === 'p20,p22,p1,p2,p3,p21' &&
      ecrit === '["groupe-1","personnel","intervenants","groupe-2"]' && /Ordre des groupes enregistré/.test(toast1 || ''),
      '« Machines » glissé au-dessus de « Personnel » : trait de dépôt, ordre affiché, réglage « ordre_groupes » en base (' + s + ' ; ' + l + ' ; ' + ecrit + ' ; ' + toast1 + ')');
    await glisserTitre(page, 'intervenants', 'groupe-2', true);
    s = await sections(page);
    const ecrit2 = await page.evaluate(() => JSON.stringify(((window.__BD.reglages || []).find((r) => r.cle === 'ordre_groupes') || {}).valeur));
    verifier(ecrit2 === '["groupe-1","personnel","groupe-2","intervenants"]' && /groupe-2⠿:Transports intervenants⠿:Intervenants$/.test(s),
      '« Intervenants » glissé sous la dernière section : tout en bas (' + ecrit2 + ')');

    // --- 4. Glisser une tâche : dans le groupe seulement ----------------------------------
    const regle = await page.evaluate(() => [['20', '22'], ['20', '21'], ['20', '1'], ['1', '20'], ['1', '2'], ['21', '3']]
      .map(([a, b]) => (changementPersonneAutorise(a, b) ? 1 : 0)).join(''));
    verifier(regle === '100010', 'tâche d’une machine : vers une autre machine oui, vers un transport ou le personnel non (' + regle + ')');

    // --- 5. Absence sur une machine ----------------------------------------------------------
    await page.evaluate(() => changerModeAjoutPlanning(true));
    await page.waitForTimeout(150);
    const c = await page.evaluate(() => {
      const el = document.querySelector('.cell[data-kind="personne"][data-personne="22"][data-demi="matin"][data-jour="' + giDepuisIso('2026-09-24') + '"]');
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(250);
    const b = await page.evaluate(() => { const m = document.querySelector('.menu-pop'); return m ? [...m.querySelectorAll('button')].map((x) => x.textContent.trim()) : null; });
    verifier(b && b.includes('Tâche') && b.includes('Absence') && b.includes('Arrivée / départ'),
      'menu d’ajout sur la Grue : « Tâche », « Absence », « Arrivée / départ », comme le personnel ' + JSON.stringify(b));

    // --- 8. Arrivée / départ sans type ------------------------------------------------------
    await page.click('.menu-pop button[data-partielle]');
    await page.waitForTimeout(200);
    await page.fill('.form-arrivee-depart .f-motif', 'Révision');
    const f = await page.evaluate(() => ({ type: !!document.querySelector('.form-arrivee-depart .f-type'),
      labels: [...document.querySelectorAll('.form-arrivee-depart .label-champ')].map((x) => x.textContent).join(','),
      apercu: document.querySelector('.form-arrivee-depart .apercu-texte').textContent }));
    verifier(!f.type && !/Type/.test(f.labels) && f.apercu === 'Arrivée 9h00 - Révision',
      'arrivée / départ : plus de type d’absence, texte « Arrivée 9h00 - Motif » (' + JSON.stringify(f) + ')');
    await page.keyboard.press('Escape');
    await page.evaluate(() => changerModeAjoutPlanning(false));
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Rechargement : ordre repris --- 6. page Personnel --- 7. impression ----------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD([{ cle: 'ordre_groupes', valeur: ['groupe-2', 'personnel', 'groupe-1', 'intervenants'] }]) });
    await page.waitForTimeout(200);
    const s = await sections(page), l = await lignes(page);
    verifier(s === 'groupe-2⠿:Transports personnel⠿:Personnel groupe-1⠿:Machines intervenants⠿:Intervenants' && l === 'p21,p1,p2,p20,p22,p3',
      'au chargement : l’ordre enregistré pour le compte est repris (' + s + ' ; ' + l + ')');

    // Impression.
    await page.evaluate(() => openPrintSheet());
    await page.waitForTimeout(300);
    const impr = await page.evaluate(() => ({
      lignes: [...document.querySelectorAll('.print-doc tbody > tr:not([class])')].map((r) => r.querySelector('td').childNodes[0].textContent).join('+'),
      separations: document.querySelectorAll('.print-doc .print-spacer-fin.print-spacer-section').length,
      cases: [...document.querySelectorAll('.impr-groupe-tete input[data-r]')].map((i) => i.dataset.r + (i.checked ? '✓' : '')).join(' '),
      pour: [...document.querySelectorAll('.f-pour optgroup')].map((g) => g.label + ':' + [...g.querySelectorAll('option')].map((o) => o.textContent.trim()).join('/')).join(' ')
    }));
    verifier(impr.lignes === 'Camion+Paul+Pelle+Béton SA' && impr.separations === 3 &&
      impr.cases === 'groupe-2✓ personnel✓ groupe-1✓ intervenants✓' &&
      impr.pour === 'Transports:Camion Personnel:Paul/Anne Machines:Pelle/Grue Intervenants:Béton SA',
      'impression : sections dans l’ordre du planning, séparées ; une case et un groupe « Pour » par groupe (' + JSON.stringify(impr) + ')');
    await page.evaluate(() => { const i = document.querySelector('.impr-groupe-tete input[data-r="groupe-1"]'); i.checked = false; i.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(300);
    const sansMachines = await page.evaluate(() => [...document.querySelectorAll('.print-doc tbody > tr:not([class])')].map((r) => r.querySelector('td').childNodes[0].textContent).join('+'));
    verifier(sansMachines === 'Camion+Paul+Béton SA', 'case « Machines » décochée : la Pelle n’est plus imprimée (' + sansMachines + ')');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const f = document.querySelector('.print-sheet .f-annuler, .impr-fermer'); if (f) f.click(); });
    await page.waitForTimeout(200);

    // Page Personnel. Suite 134 : les groupes sont sur la page Machines (ici
    // « Transports » n'a pas ligne_unique : c'est un groupe comme Machines).
    await page.evaluate(() => document.querySelector('.onglet[data-page="personnel"]').click());
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('.onglet[data-page="machines"]').click());
    await page.waitForTimeout(400);
    const pageP = await page.evaluate(() => ({
      titres: [...document.querySelectorAll('#listesGroupes h2')].map((h) => h.textContent).join(','),
      personnes: [...document.querySelectorAll('#listePersonnel .ligne-intervenant b')].map((x) => x.textContent).join(','),
      machines: [...document.querySelectorAll('#listeGroupe-1 .ligne-intervenant b')].map((x) => x.textContent).join(','),
      transports: [...document.querySelectorAll('#listeGroupe-2 .ligne-intervenant b')].map((x) => x.textContent).join(',')
    }));
    verifier(pageP.titres === 'Transports,Machines' && pageP.personnes === 'Paul,Anne' && pageP.machines === 'Pelle,Grue' && pageP.transports === 'Camion',
      'page Machines : une liste par groupe (ordre du planning), machines hors de « Personnes » (' + JSON.stringify(pageP) + ')');
    await page.click('#listeGroupe-1 .ligne-ajouter');
    const titreAjout = await page.evaluate(() => document.querySelector('.form-pop .cp-titre').textContent);
    await page.fill('.form-pop .f-nom', 'Mini-pelle');
    await page.click('.form-pop .f-ok');
    await page.waitForTimeout(600);
    const cree = await page.evaluate(() => { const r = window.__BD.personnes.find((p) => p.nom === 'Mini-pelle'); return r && { g: r.groupe_id, st: r.sous_traitant, eq: r.equipe }; });
    const apres = await page.evaluate(() => [...document.querySelectorAll('#listeGroupe-1 .ligne-intervenant b')].map((x) => x.textContent).join(','));
    verifier(titreAjout === 'Ajouter — Machines' && cree && cree.g === 1 && cree.st === false && cree.eq === false && apres === 'Pelle,Grue,Mini-pelle',
      '« + Ajouter » sous Machines : ligne avec groupe_id = 1, listée dans Machines (' + titreAjout + ' ; ' + JSON.stringify(cree) + ' ; ' + apres + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
