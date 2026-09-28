const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 44) — Lionel, onglet Mise en page :
//   « - Ajouter des petites flèches haut/bas pour pouvoir changer des
//       réglages au MM.
//     - Accolades pour lier les marges, gauche/droite, haut/bas ou les 4.
//     - Possibilité de pouvoir rendre fixe la largeur des colonnes des jours
//       avec option pour qu'elles soient dynamiques (comportement actuel)
//     - Idem pour la colonne des noms »
// js/page-mise-en-page.js (formulaire, aperçu), js/impression.js + style.css
// (largeurs des <col> du tableau imprimé).
//
// Lancer : node test_suite44.js

const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1, statut_id: null });
const P = (id, nom, ordre, st) => ({ id, nom, sous_traitant: !!st, equipe: false, ordre, actif: true });
const BD = {
  personnes: [P(1, 'Lionel', 1), P(2, 'Mathis', 2), P(3, 'Béton/Armature', 3, 1)],
  taches: [T(1, 1, '2026-09-21', 'matin', 'Gabarits'), T(2, 2, '2026-09-22', 'matin', 'Décoffrage des balcons et de la dalle'), T(3, 3, '2026-09-23', 'matin', 'Livraison')]
};
const MM = 96 / 25.4;
const ouvrirOnglet = async (page) => { await page.evaluate(() => afficherPage('mise-en-page')); await page.waitForTimeout(200); };
const upserts = (page) => page.evaluate(() => window.__ECRITURES.filter((e) => e.indexOf('reglages:upsert:') === 0).map((e) => JSON.parse(e.slice(16))[0]));
const valeurs = (page) => page.evaluate(() => {
  const o = {};
  document.querySelectorAll('#mepFormulaire input[type=number]').forEach((e) => { o[e.dataset.k] = parseFloat(e.value); });
  return o;
});
const fleche = (page, k, sens) => page.click('#mepFormulaire .mep-champ:has([data-k="' + k + '"]) .mep-fleche[data-sens="' + sens + '"]');
const accolades = (page) => page.evaluate(() => {
  const o = {};
  document.querySelectorAll('.mep-accolade').forEach((b) => { o[b.dataset.lien] = (b.getAttribute('aria-pressed') === 'true' ? 'lié' : 'libre') + (b.disabled ? '/inclus' : ''); });
  return o;
});
const colonnesImpression = (page) => page.evaluate((MM) => {
  const t = document.querySelector('.impression-modal .print-table'), doc = t.closest('.print-doc');
  const demis = [...t.querySelector('tr.print-demis').children].map((c) => c.getBoundingClientRect().width / MM);
  return { table: t.getBoundingClientRect().width / MM, dispo: (doc.clientWidth - 32) / MM, noms: t.querySelector('.coin-semaine').getBoundingClientRect().width / MM,
    jours: [0, 2, 4, 6, 8].map((i) => demis[i] + demis[i + 1]) };
}, MM);
const pres = (a, b, tol) => Math.abs(a - b) <= (tol || 0.6);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1300, height: 900 }, bd: BD });
    await ouvrirOnglet(page);

    // --- 1. Flèches ---
    const nb = await page.evaluate(() => ({ champs: document.querySelectorAll('#mepFormulaire input[type=number]').length,
      fleches: document.querySelectorAll('#mepFormulaire .mep-nombre .mep-fleche').length,
      natives: getComputedStyle(document.querySelector('#mepFormulaire input[type=number]')).appearance }));
    verifier(nb.champs === 10 && nb.fleches === 20 && nb.natives === 'textfield', 'une paire de flèches haut/bas sur chacun des 10 champs en mm, flèches natives masquées (' + JSON.stringify(nb) + ')');
    await fleche(page, 'haut', 1); await fleche(page, 'haut', 1);
    await fleche(page, 'personnes', -1);
    let v = await valeurs(page);
    verifier(v.haut === 14 && v.bas === 12 && v.personnes === 1.5, 'flèches : marge du haut +2 mm (1 mm par appui), espacement −0,1 mm (' + v.haut + ' / ' + v.personnes + ')');
    await page.fill('[data-g="marges"][data-k="bas"]', '1'); await page.press('[data-g="marges"][data-k="bas"]', 'Tab');
    await fleche(page, 'bas', -1); await fleche(page, 'bas', -1);
    verifier((await valeurs(page)).bas === 0, 'flèche du bas bornée à 0 mm');
    // Appui maintenu : répétition.
    const bb = await (await page.$('.mep-champ:has([data-k="gauche"]) .mep-fleche[data-sens="1"]')).boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(1000); await page.mouse.up();
    const g = (await valeurs(page)).gauche;
    verifier(g >= 17 && g <= 24, 'flèche maintenue 1 s : la valeur défile (gauche 12 → ' + g + ' mm)');
    await page.waitForTimeout(300);
    const figee = (await valeurs(page)).gauche;
    verifier(figee === g, 'relâchée : la répétition s\'arrête');
    await page.focus('[data-g="marges"][data-k="gauche"]');
    await page.keyboard.press('ArrowUp');
    verifier((await valeurs(page)).gauche === g + 1, 'flèche ↑ du clavier toujours active dans le champ');

    // --- 2. Accolades ---
    let a = await accolades(page);
    verifier(a.hautBas === 'libre' && a.gaucheDroite === 'libre' && a.toutes === 'libre', 'accolades haut/bas, gauche/droite, les 4 : libres par défaut');
    await page.click('.mep-accolade[data-lien="hautBas"]');
    v = await valeurs(page);
    verifier((await accolades(page)).hautBas === 'lié' && v.bas === v.haut && v.haut === 14, 'haut/bas liés : le bas s\'aligne sur le haut (' + v.haut + '/' + v.bas + ')');
    await fleche(page, 'bas', 1);
    await page.fill('[data-g="marges"][data-k="droite"]', '9');
    v = await valeurs(page);
    verifier(v.haut === 15 && v.bas === 15 && v.gauche === g + 1 && v.droite === 9, 'flèche sur le bas : le haut suit ; gauche et droite restent libres (' + JSON.stringify(v) + ')');
    await page.click('.mep-accolade[data-lien="toutes"]');
    a = await accolades(page); v = await valeurs(page);
    verifier(a.toutes === 'lié' && a.hautBas === 'lié/inclus' && a.gaucheDroite === 'lié/inclus' && [v.haut, v.bas, v.gauche, v.droite].every((x) => x === 15),
      'les 4 liées : alignées sur le haut, accolades des paires incluses (' + JSON.stringify(a) + ')');
    await page.fill('[data-g="marges"][data-k="droite"]', '10');
    v = await valeurs(page);
    verifier([v.haut, v.bas, v.gauche, v.droite].every((x) => x === 10), 'saisie dans « Droite » : les 4 marges suivent pendant la frappe');
    await page.click('.mep-accolade[data-lien="toutes"]');
    a = await accolades(page);
    verifier(a.toutes === 'libre' && a.hautBas === 'lié' && a.gaucheDroite === 'libre', 'les 4 déliées : la paire haut/bas reste liée, gauche/droite libre');
    await page.waitForTimeout(800);
    let u = await upserts(page);
    verifier(u.length >= 1 && JSON.stringify(u[u.length - 1].valeur.liens) === '{"hautBas":true,"gaucheDroite":false,"toutes":false}' && u[u.length - 1].valeur.marges.droite === 10,
      'accolades enregistrées sur le compte avec les marges (' + JSON.stringify(u[u.length - 1].valeur.liens) + ')');

    // --- 3. Colonnes ---
    await page.click('#btnReinitMep');
    let c = await page.evaluate(() => ({ jours: document.querySelector('[data-g="colonnes"][data-k="jours"]').value, noms: document.querySelector('[data-g="colonnes"][data-k="noms"]').value,
      offJour: document.querySelector('[data-k="largeurJour"]').disabled, offNoms: document.querySelector('[data-k="largeurNoms"]').disabled,
      aide: document.querySelector('.mep-aide-colonnes').textContent }));
    verifier(c.jours === 'dynamique' && c.noms === 'dynamique' && c.offJour && c.offNoms && /selon leur contenu/.test(c.aide),
      'colonnes dynamiques par défaut (comportement actuel), largeurs grisées (' + c.aide + ')');
    await page.evaluate(() => { document.querySelector('.onglet[data-page="planning"]').click(); openPrintSheet(); }); await page.waitForTimeout(200);
    let k = await colonnesImpression(page);
    verifier(pres(k.table, k.dispo, 1) && !k.jours.every((j) => pres(j, k.jours[0], 0.3)), 'impression, dynamique : tableau sur toute la largeur, jours inégaux selon leur contenu (' + k.jours.map((j) => j.toFixed(1)).join(' / ') + ' mm)');
    await page.click('.impression-modal .f-fermer');

    await ouvrirOnglet(page);
    await page.focus('[data-g="colonnes"][data-k="jours"]');
    await page.selectOption('[data-g="colonnes"][data-k="jours"]', 'fixe');
    c = await page.evaluate(() => ({ off: document.querySelector('[data-k="largeurJour"]').disabled, focus: document.activeElement && document.activeElement.dataset.k, aide: document.querySelector('.mep-aide-colonnes').textContent }));
    verifier(!c.off && c.focus === 'jours' && /5 × 48 = 240 mm ; il reste 33 mm pour les noms/.test(c.aide), 'jours en largeur fixe : champ actif (focus gardé), aide « ' + c.aide + ' »');
    await page.evaluate(() => { document.querySelector('.onglet[data-page="planning"]').click(); openPrintSheet(); }); await page.waitForTimeout(200);
    k = await colonnesImpression(page);
    verifier(k.jours.every((j) => pres(j, 48)), 'impression, jours fixes : 5 jours de 48 mm (' + k.jours.map((j) => j.toFixed(1)).join(' / ') + ')');
    await page.emulateMedia({ media: 'print' });
    const papierJours = await colonnesImpression(page);
    await page.emulateMedia({ media: 'screen' });
    verifier(pres(papierJours.table, papierJours.noms + 5 * 48, 1) && papierJours.table < 273 - 3 && papierJours.jours.every((j) => pres(j, 48)),
      'au papier : tableau à sa largeur (noms selon leur contenu ' + papierJours.noms.toFixed(1) + ' mm + 240 mm = ' + papierJours.table.toFixed(1) + ' mm), plus étiré sur les 273 mm utiles');
    await page.click('.impression-modal .f-fermer');

    await ouvrirOnglet(page);
    await page.selectOption('[data-g="colonnes"][data-k="noms"]', 'fixe');
    for (let i = 0; i < 5; i++) await fleche(page, 'largeurNoms', 1);
    c = await page.evaluate(() => document.querySelector('.mep-aide-colonnes').textContent);
    verifier(/35 \+ 5 × 48 = 275 mm, sur 273 mm/.test(c) || /275 mm pour 273 mm utiles — dépasse de 2 mm/.test(c), 'noms fixes 35 mm : aide « ' + c + ' »');
    const alerte = await page.evaluate(() => ({ alerte: document.querySelector('.mep-aide-colonnes').classList.contains('alerte'), coupe: !!document.querySelector('.mep-coupe') }));
    verifier(alerte.alerte && alerte.coupe, 'tableau plus large que la page : aide en alerte, bord coupé hachuré dans l\'aperçu');
    await fleche(page, 'largeurJour', -1);
    const ok = await page.evaluate(() => ({ alerte: document.querySelector('.mep-aide-colonnes').classList.contains('alerte'), coupe: !!document.querySelector('.mep-coupe'), aide: document.querySelector('.mep-aide-colonnes').textContent }));
    verifier(!ok.alerte && !ok.coupe && /35 \+ 5 × 47 = 270 mm, sur 273 mm utiles/.test(ok.aide), 'jours à 47 mm : ça tient (' + ok.aide + ')');
    const cols = await page.evaluate(() => ({ n: document.querySelectorAll('.mep-col').length, l: [...document.querySelectorAll('.mep-col')].map((e) => parseFloat(e.style.left)) }));
    const ecart = cols.l[2] - cols.l[1];
    verifier(cols.n === 6 && pres(cols.l[0] / ecart, 35 / 47, 0.02), 'aperçu : 6 traits de colonnes, noms/jour dans le rapport 35/47 (' + (cols.l[0] / ecart).toFixed(3) + ')');
    await page.evaluate(() => { document.querySelector('.onglet[data-page="planning"]').click(); openPrintSheet(); }); await page.waitForTimeout(200);
    k = await colonnesImpression(page);
    verifier(pres(k.noms, 35) && k.jours.every((j) => pres(j, 47)), 'impression, tout fixe : noms 35 mm, jours 47 mm (' + k.noms.toFixed(1) + ' / ' + k.jours.map((j) => j.toFixed(1)).join(' / ') + ')');
    const long = await page.evaluate(() => [...document.querySelectorAll('.impression-modal .print-table td')].some((td) => td.scrollWidth > td.clientWidth + 1));
    verifier(!long, 'texte long (« Décoffrage des balcons et de la dalle ») enroulé dans sa colonne fixe, rien ne déborde');
    await page.click('.impression-modal .f-fermer');

    await ouvrirOnglet(page);
    await page.selectOption('[data-g="colonnes"][data-k="jours"]', 'dynamique');
    await page.evaluate(() => { document.querySelector('.onglet[data-page="planning"]').click(); openPrintSheet(); }); await page.waitForTimeout(200);
    k = await colonnesImpression(page);
    verifier(pres(k.noms, 35) && pres(k.table, k.dispo, 1), 'noms fixes seuls : noms 35 mm, tableau toujours sur toute la largeur (' + k.table.toFixed(1) + ' / ' + k.dispo.toFixed(1) + ' mm)');
    await page.emulateMedia({ media: 'print' });
    const papier = await page.evaluate((MM) => ({ noms: document.querySelector('.impression-modal .coin-semaine').getBoundingClientRect().width / MM }), MM);
    await page.emulateMedia({ media: 'screen' });
    verifier(pres(papier.noms, 35), 'au papier aussi : colonne des noms à 35 mm (' + papier.noms.toFixed(1) + ')');
    await page.click('.impression-modal .f-fermer');
    await page.waitForTimeout(700);
    u = await upserts(page);
    verifier(JSON.stringify(u[u.length - 1].valeur.colonnes) === '{"jours":"dynamique","largeurJour":47,"noms":"fixe","largeurNoms":35}', 'colonnes enregistrées sur le compte (' + JSON.stringify(u[u.length - 1].valeur.colonnes) + ')');

    // --- 4. Mise en page enregistrée avant cette suite : complétée par défaut ---
    const ancien = await page.evaluate(() => {
      etat.reglages.mise_en_page = { orientation: 'portrait', marges: { haut: 9, bas: 9, gauche: 9, droite: 9 } };
      const m = lireMiseEnPage();
      return { o: m.orientation, h: m.marges.haut, liens: m.liens, col: m.colonnes };
    });
    verifier(ancien.o === 'portrait' && ancien.h === 9 && !ancien.liens.toutes && ancien.col.jours === 'dynamique' && ancien.col.largeurJour === 48,
      'réglage enregistré avant la suite 44 : repris, accolades libres et colonnes dynamiques');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 5. Téléphone ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, bd: BD });
    await ouvrirOnglet(page);
    await page.tap('.mep-accolade[data-lien="gaucheDroite"]');
    await page.tap('.mep-champ:has([data-k="droite"]) .mep-fleche[data-sens="1"]');
    const v = await valeurs(page);
    const m = await page.evaluate(() => {
      const f = document.querySelector('.mep-fleche').getBoundingClientRect(), s = document.querySelector('#page-mise-en-page .page-scroll');
      const acc = document.querySelector('.mep-accolade[data-lien="toutes"]').getBoundingClientRect();
      return { l: Math.round(f.width), h: Math.round(f.height), deborde: s.scrollWidth > s.clientWidth + 1, acc: [Math.round(acc.width), Math.round(acc.height)] };
    });
    verifier(v.gauche === 13 && v.droite === 13 && v.haut === 12, 'téléphone : flèche au doigt, gauche/droite liées (' + JSON.stringify(v) + ')');
    verifier(m.l >= 26 && m.h >= 15 && !m.deborde && m.acc[1] > 100, 'téléphone : flèches de ' + m.l + '×' + m.h + ' px, accolade des 4 sur toute la hauteur (' + m.acc.join('×') + '), pas de défilement horizontal');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
