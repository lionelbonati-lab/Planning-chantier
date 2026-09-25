const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 39) — Lionel : « Je pensais aussi à une mise
// en page. En-tête, pied de pages, marges, espaces entre les éléments.
// C'est peut-être plus judicieux de faire un onglet mise en pages. Et garde
// que les réglage à cocher dans la feuille impression. » Ses choix :
//   - en-tête : texte libre, chantier (« Chantier filtré »), date d'impression ;
//   - pied de page : numéro de page, date d'impression, texte libre ;
//   - « Aperçu simplifié sans données » dans l'onglet ;
//   - « Liés au compte » : table `reglages` (sql/0016).
// Onglet Mise en page (js/page-mise-en-page.js), appliqué par l'aperçu
// d'impression (js/impression.js).
//
// Lancer : node test_suite39.js

const T = (id, pid, date, demi, texte, ch) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: ch || 1, statut_id: null });
const P = (id, nom, ordre, st) => ({ id, nom, sous_traitant: !!st, equipe: false, ordre, actif: true });
const BD = {
  personnes: [P(1, 'Lionel', 1), P(2, 'Mathis', 2), P(3, 'Béton/Armature', 3, 1)],
  chantiers: [{ id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 }],
  statuts: [],
  taches: [T(1, 1, '2026-09-21', 'matin', 'Gabarits'), T(2, 2, '2026-09-22', 'matin', 'Décoffrage'), T(3, 3, '2026-09-23', 'matin', 'Livraison')]
};
const CHANTIER = { 'planning.chantierParDefaut': '26182 - Terrain de Padel' };

const ouvrirOnglet = (page) => page.evaluate(() => document.querySelector('.onglet[data-page="mise-en-page"]').click());
const upserts = (page) => page.evaluate(() => window.__ECRITURES.filter((e) => e.indexOf('reglages:upsert:') === 0).map((e) => JSON.parse(e.slice(16))[0]));
const feuille = (page) => page.evaluate(() => {
  const f = document.querySelector('.mep-feuille'), r = f.getBoundingClientRect();
  const z = (c) => [...document.querySelectorAll('.mep-zone-' + c + ' span')].map((s) => s.textContent);
  return { ratio: r.width / r.height, haut: z('haut'), bas: z('bas'), cadre: document.querySelector('.mep-cadre').style.top };
});
const champ = (page, g, k) => page.evaluate(([g, k]) => { const e = document.querySelector('#mepFormulaire [data-g="' + g + '"][data-k="' + k + '"]'); return e.type === 'checkbox' ? e.checked : e.value; }, [g, k]);
const apercu = (page) => page.evaluate(() => {
  const doc = document.querySelector('.impression-modal .print-doc');
  const ecran = (c) => { const e = doc.querySelector('.' + c); return e ? [...e.children].map((s) => s.textContent) : null; };
  return { page: document.querySelector('.style-page-impression').textContent, entete: ecran('impr-entete-ecran'), pied: ecran('impr-pied-ecran'),
    police: parseFloat(getComputedStyle(doc.querySelector('td.td-tache')).fontSize), resume: doc.parentNode.querySelector('.impr-resume-mep').textContent };
});

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1 à 6. Ordinateur : onglet, enregistrement, impression ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1300, height: 900 }, bd: BD, localStorage: CHANTIER });
    const onglets = await page.evaluate(() => [...document.querySelectorAll('.onglet[data-page="mise-en-page"]')].map((b) => b.textContent.trim() + (b.querySelector('svg') ? '+icône' : '')));
    verifier(onglets.join() === 'Mise en page+icône,Mise en page+icône', 'onglet « Mise en page » dans la barre du haut et dans le sélecteur du bas (' + onglets.join() + ')');
    await ouvrirOnglet(page); await page.waitForTimeout(200);
    const blocs = await page.evaluate(() => ({ actif: document.getElementById('page-mise-en-page').classList.contains('actif'),
      legendes: [...document.querySelectorAll('#mepFormulaire legend')].map((l) => l.textContent) }));
    verifier(blocs.actif && blocs.legendes.join() === 'Page,Marges,Colonnes,Dates,Espacements,En-tête,Pied de page', 'onglet : Page, Marges, Colonnes (suite 44), Dates (suite 45), Espacements, En-tête, Pied de page (' + blocs.legendes.join() + ')');
    const defauts = await page.evaluate(() => [...document.querySelectorAll('#mepFormulaire [data-k]')].map((e) => (e.dataset.g ? e.dataset.g + '.' : '') + e.dataset.k + '=' + (e.type === 'checkbox' ? e.checked : e.value)).join(' '));
    verifier(defauts === 'orientation=paysage taille=normale marges.haut=12 marges.bas=12 marges.gauche=12 marges.droite=12 colonnes.jours=dynamique colonnes.largeurJour=48 colonnes.noms=dynamique colonnes.largeurNoms=30 dates.jour=abrege dates.mois=masque dates.annee=false espaces.personnes=1.6 espaces.sections=3.7 espaces.cases=1.3 espaces.legende=3.7 entete.texte= entete.chantier=true entete.date=false pied.page=true pied.date=true pied.texte=',
      'valeurs par défaut = impression d\'avant (paysage, 12 mm, 6/14/5/14 px) + chantier, numéro de page, date (' + defauts + ')');
    let f = await feuille(page);
    verifier(Math.abs(f.ratio - 297 / 210) < 0.02 && f.haut.join('|') === '|26182 - Terrain de Padel|' && f.bas.join('|') === '|Imprimé le 24.09.2026 à 10:00|Page 1 / 1',
      'aperçu simplifié : A4 paysage, chantier choisi en haut au centre, date et « Page 1 / 1 » en bas (' + JSON.stringify(f) + ')');
    verifier(await page.evaluate(() => !document.querySelector('#mepApercu').textContent.includes('Gabarits')), 'aperçu sans données du planning (aucune tâche écrite)');

    // Changements : aperçu en direct, une seule écriture après la rafale.
    await page.selectOption('#mepFormulaire [data-k="orientation"]', 'portrait');
    await page.selectOption('#mepFormulaire [data-k="taille"]', 'grande');
    await page.fill('#mepFormulaire [data-g="marges"][data-k="haut"]', '20');
    await page.fill('#mepFormulaire [data-g="entete"][data-k="texte"]', 'PMB "Version" du 25.09');
    await page.click('#mepFormulaire [data-g="entete"][data-k="date"]');
    await page.click('#mepFormulaire [data-g="pied"][data-k="date"]');
    await page.fill('#mepFormulaire [data-g="pied"][data-k="texte"]', 'Document interne');
    await page.fill('#mepFormulaire [data-g="espaces"][data-k="personnes"]', '4');
    await page.fill('#mepFormulaire [data-g="espaces"][data-k="cases"]', '2');
    f = await feuille(page);
    verifier(Math.abs(f.ratio - 210 / 297) < 0.02 && f.haut.join('|') === 'PMB "Version" du 25.09|26182 - Terrain de Padel|Imprimé le 24.09.2026 à 10:00' && f.bas.join('|') === 'Document interne||Page 1 / 1',
      'aperçu mis à jour en direct : portrait, en-tête texte / chantier / date, pied texte / page (' + JSON.stringify(f) + ')');
    verifier((await upserts(page)).length === 0, 'rien d\'écrit pendant la rafale de changements');
    await page.waitForTimeout(800);
    let u = await upserts(page);
    verifier(u.length === 1 && u[0].cle === 'mise_en_page' && u[0].valeur.orientation === 'portrait' && u[0].valeur.marges.haut === 20 && u[0].valeur.entete.texte === 'PMB "Version" du 25.09' && u[0].valeur.espaces.personnes === 4,
      'une seule écriture dans `reglages` (clé mise_en_page), 0,5 s après le dernier changement (' + u.length + ')');
    verifier(await page.evaluate(() => document.getElementById('mepEtat').textContent) === 'Enregistré', 'mention « Enregistré »');
    await page.fill('#mepFormulaire [data-g="marges"][data-k="bas"]', '99');
    await page.press('#mepFormulaire [data-g="marges"][data-k="bas"]', 'Tab');
    verifier(await champ(page, 'marges', 'bas') === '40', 'marge hors bornes (99 mm) ramenée à 40 mm à la sortie du champ');
    await page.fill('#mepFormulaire [data-g="marges"][data-k="bas"]', '12');
    await page.press('#mepFormulaire [data-g="marges"][data-k="bas"]', 'Tab');
    await page.waitForTimeout(700);

    // --- Aperçu d'impression ---
    await page.evaluate(() => { document.querySelector('.onglet[data-page="planning"]').click(); openPrintSheet(); });
    await page.waitForTimeout(200);
    let a = await apercu(page);
    verifier(/size: portrait; margin: 20mm 12mm 12mm 12mm;/.test(a.page), 'impression : portrait, marges 20/12/12/12 mm (' + a.page.slice(0, 80) + ')');
    verifier(a.page.includes('@top-left { content: "PMB \\"Version\\" du 25.09";') && a.page.includes('@top-center { content: "26182 - Terrain de Padel";') && a.page.includes('@top-right { content: "Imprimé le 24.09.2026 à 10:00";'),
      'en-tête dans les marges de chaque page : texte libre (guillemets échappés), chantier, date');
    verifier(a.page.includes('@bottom-left { content: "Document interne";') && a.page.includes('@bottom-right { content: "Page " counter(page) " / " counter(pages);') && !a.page.includes('@bottom-center'),
      'pied de page : texte libre à gauche, « Page n / N » à droite, plus de date (décochée)');
    const regle = await page.evaluate(() => { const r = document.querySelector('.style-page-impression').sheet.cssRules[0]; return r && r.cssRules && r.cssRules[0] ? r.cssRules[0].cssText : null; });
    verifier(regle && /@page/.test(regle) && /size: portrait/.test(regle), 'la règle @page est comprise par le navigateur (' + (regle || '').slice(0, 60) + ')');
    verifier(a.entete.join('|') === 'PMB "Version" du 25.09|26182 - Terrain de Padel|Imprimé le 24.09.2026 à 10:00' && a.pied.join('|') === 'Document interne||Page 1 / …',
      'aperçu à l\'écran : en-tête et pied de page simulés (' + JSON.stringify([a.entete, a.pied]) + ')');
    verifier(Math.abs(a.police - 13.2) < 0.1, 'taille du texte « Grande » reprise de l\'onglet : 13,2 px (' + a.police + ')');
    verifier(a.resume === 'Portrait, marges 20/12/12/12 mm', 'résumé de la mise en page à côté du lien (' + a.resume + ')');
    const esp = await page.evaluate(() => {
      const fin = document.querySelector('tr.print-spacer-fin');
      return { personnes: fin.getBoundingClientRect().height + fin.nextElementSibling.getBoundingClientRect().height,
        cases: getComputedStyle(document.querySelector('.print-bande')).paddingTop };
    });
    verifier(esp.personnes === 15 && esp.cases === '8px', 'espacements : 4 mm = 15 px entre 2 personnes, 2 mm = 8 px dans les cases (' + JSON.stringify(esp) + ')');
    await page.emulateMedia({ media: 'print' });
    const papier = await page.evaluate(() => ['.impr-entete-ecran', '.impr-pied-ecran'].map((s) => getComputedStyle(document.querySelector(s)).display));
    await page.emulateMedia({ media: 'screen' });
    verifier(papier.join() === 'none,none', 'en-tête/pied simulés jamais imprimés (le navigateur écrit les vrais)');

    // Date remise à l'heure au moment d'imprimer.
    await page.clock.setFixedTime(new Date('2026-09-24T11:42:00'));
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    verifier((await apercu(page)).page.includes('Imprimé le 24.09.2026 à 11:42'), 'date d\'impression recalculée au moment d\'imprimer (beforeprint)');

    // Lien vers l'onglet.
    await page.click('.impr-reglages summary'); // replié à l'ouverture (suite 40)
    await page.click('.impr-reglages .lien-mep');
    const apres = await page.evaluate(() => ({ modale: !!document.querySelector('.impression-modal'), regle: !!document.querySelector('.style-page-impression'),
      onglet: document.getElementById('page-mise-en-page').classList.contains('actif') }));
    verifier(!apres.modale && !apres.regle && apres.onglet, 'lien « Mise en page › » : ferme l\'aperçu et ouvre l\'onglet (' + JSON.stringify(apres) + ')');

    // Réinitialiser.
    await page.click('#btnReinitMep');
    await page.waitForTimeout(700);
    u = await upserts(page);
    const dernier = u[u.length - 1].valeur;
    verifier(await champ(page, 'marges', 'haut') === '12' && await champ(page, 'entete', 'texte') === '' && dernier.orientation === 'paysage' && dernier.pied.date === true,
      'Réinitialiser : valeurs par défaut, enregistrées sur le compte');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 7. Liés au compte : réglage lu depuis le serveur sur un autre appareil ---
  const MEP = { orientation: 'portrait', taille: 'petite', marges: { haut: 15, bas: 10, gauche: 8, droite: 8 }, espaces: { personnes: 1.6, sections: 3.7, cases: 1.3, legende: 3.7 },
    entete: { texte: 'Planning PMB', chantier: false, date: true }, pied: { page: true, date: false, texte: '' } };
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1300, height: 900 }, bd: Object.assign({ reglages: [{ cle: 'mise_en_page', valeur: MEP }] }, BD) });
    await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(200);
    const a = await apercu(page);
    verifier(/size: portrait; margin: 15mm 8mm 10mm 8mm;/.test(a.page) && a.page.includes('@top-left { content: "Planning PMB";') && a.police < 9.2,
      'autre appareil : mise en page du compte appliquée (portrait, marges, en-tête, petite taille)');
    verifier((await upserts(page)).length === 0, 'simple lecture : aucune écriture');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 8. Table injoignable : copie de l'appareil ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1300, height: 900 }, bd: BD, tablesEnEchec: ['reglages'],
      localStorage: { 'planning.mise-en-page': JSON.stringify(Object.assign({}, MEP, { entete: { texte: 'Copie locale', chantier: false, date: false } })) } });
    await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(200);
    const a = await apercu(page);
    verifier(a.page.includes('"Copie locale"') && /size: portrait/.test(a.page), '`reglages` injoignable : dernier réglage de l\'appareil appliqué, planning affiché quand même');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 9. Reprise des réglages de la suite 38 (orientation, taille, titre) ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1300, height: 900 }, bd: BD,
      localStorage: { 'planning.impression.reglages': JSON.stringify({ jalons: false, orientation: 'portrait', taille: 'grande', titre: 'Ancien titre' }) } });
    await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(700);
    const a = await apercu(page);
    const u = await upserts(page);
    verifier(/size: portrait/.test(a.page) && a.page.includes('@top-left { content: "Ancien titre";') && Math.abs(a.police - 13.2) < 0.1,
      'suite 38 : orientation, taille et titre retenus sur l\'appareil repris (titre -> texte libre de l\'en-tête)');
    verifier(u.length === 1 && u[0].valeur.entete.texte === 'Ancien titre', 'reprise enregistrée une fois sur le compte (' + u.length + ')');
    verifier(await page.evaluate(() => !document.querySelector('[data-r="jalons"]').checked), 'les cases à cocher de la suite 38 restent retenues');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 10. Téléphone : onglet par le sélecteur du bas, aperçu sous les réglages ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, bd: BD });
    await page.click('#switcherBtn');
    await page.click('#switcherPanneau .onglet[data-page="mise-en-page"]');
    await page.waitForTimeout(200);
    const m = await page.evaluate(() => {
      const f = document.getElementById('mepFormulaire').getBoundingClientRect(), a = document.querySelector('.mep-feuille').getBoundingClientRect();
      return { dessous: a.top >= f.bottom - 1, largeur: a.width, debord: document.documentElement.scrollWidth > window.innerWidth, nom: document.getElementById('switcherNom').textContent };
    });
    verifier(m.dessous && m.largeur <= 390 && !m.debord && m.nom === 'Mise en page', 'téléphone : aperçu sous les réglages, sans débordement (' + JSON.stringify(m) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
