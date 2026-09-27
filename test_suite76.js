const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 27.09.2026 (suite 76). Lionel :
//   « Setup affichage: toggle au-dessus de l'aperçu afin de pouvoir switcher
//     entre le mode desktop et mobile. L'aperçu doit refléter le mode
//     desktop ou mobile. quand nous ouvrirons les setups d'affichage, la vue
//     par défaut est celle où l'on est. Si on est sur ordinateur, ce sera
//     desktop, ou si on est sur mobile, ce sera mobile. »
// Vérifie :
//   1. ordinateur : la page s'ouvre sur « Ordinateur » (aperçu large, avec
//      le mardi ; lignes « Coins du planning arrondis » et « Ordinateur,
//      tablette » visibles, « Téléphone » cachée — « Jours voisins aux
//      bords » est dans la barre d'outils depuis la suite 79) ;
//   2. « Téléphone » : aperçu de la largeur d'un téléphone, sans le mardi ;
//      réglages du téléphone (texte, lignes propres au téléphone) ;
//   3. un réglage changé en mode Téléphone va dans le jeu du téléphone :
//      l'aperçu le montre, le jeu de l'ordinateur et le planning de cet
//      ordinateur ne changent pas (week-ends compris) ; en quittant la
//      page, le style revient à celui de l'ordinateur ;
//   4. rouverte : de nouveau sur « Ordinateur » ;
//   5. téléphone : la page s'ouvre sur « Téléphone » ; « Ordinateur »
//      donne l'aperçu large, qui défile de côté.
//
// Lancer : node test_suite76.js

const etatPage = (page) => page.evaluate(() => {
  const p = document.getElementById('page-affichage'), ap = p.querySelector('.apercu-affichage');
  const vis = (id) => { const l = p.querySelector('.reglage-ligne[data-option="' + id + '"]'); return !!l && !l.hidden && l.getBoundingClientRect().height > 0; };
  // Suite 79 : plus de ligne « bords » (barre d'outils) ; « cadre » à sa place.
  return {
    actif: [...p.querySelectorAll('.bascule-profil.actif')].map((b) => b.dataset.profil).join(','),
    tel: ap.classList.contains('aa-tel'), largeur: Math.round(ap.getBoundingClientRect().width),
    jours: [...ap.querySelectorAll('.aa-th')].map((t) => t.textContent.trim().slice(0, 3).toLowerCase()),
    cadre: vis('cadre'), vueOrdi: vis('vueOrdi'), vueTel: vis('vueTel'),
    jeu: document.getElementById('affichageJeu').textContent,
    texte: document.documentElement.getAttribute('data-aff-texte'),
    txtApercu: getComputedStyle(ap.querySelector('.aa-txt')).fontSize,
    defile: document.getElementById('apercuAffichage').scrollWidth > document.getElementById('apercuAffichage').clientWidth + 1
  };
});

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 800 } });
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(300);
    // --- 1. Ordinateur par défaut ---
    let e = await etatPage(page);
    verifier(e.actif === 'ordi' && !e.tel && e.jours.includes('mar') && e.cadre && e.vueOrdi && !e.vueTel && /ordinateurs/.test(e.jeu),
      'ordinateur : la page s\'ouvre sur « Ordinateur », aperçu large avec le mardi (' + JSON.stringify(e) + ')');
    // --- 2. Téléphone ---
    await page.click('.bascule-profil[data-profil="tel"]'); await page.waitForTimeout(200);
    e = await etatPage(page);
    // Suite 77 : un seul jour, comme le planning du téléphone.
    verifier(e.actif === 'tel' && e.tel && e.largeur <= 360 && e.jours.join() === 'jeu' && e.cadre && !e.vueOrdi && e.vueTel && /téléphones/.test(e.jeu),
      '« Téléphone » : aperçu de la largeur d\'un téléphone, un seul jour, réglages du téléphone (' + JSON.stringify(e) + ')');
    // --- 3. Réglage du téléphone ---
    const txtAvant = e.txtApercu;
    await page.click('.choix-pastille[data-option="texte"][data-valeur="grand"]'); await page.waitForTimeout(200);
    await page.click('#page-affichage .reglage-ligne[data-option="weekends"] .interrupteur'); await page.waitForTimeout(300);
    e = await etatPage(page);
    let jeux = await page.evaluate(() => ({ tel: optionAffichage('texte', 'tel'), ordi: optionAffichage('texte', 'ordi'), weTel: optionAffichage('weekends', 'tel'), weOrdi: optionAffichage('weekends', 'ordi'), live: afficherWeekends }));
    verifier(jeux.tel === 'grand' && jeux.ordi === 'normal' && jeux.weTel === 'oui' && jeux.weOrdi === 'non' && !jeux.live,
      'mode Téléphone : texte et week-ends vont dans le jeu du téléphone, pas dans celui de l\'ordinateur ni son planning (' + JSON.stringify(jeux) + ')');
    verifier(e.texte === 'grand' && e.txtApercu !== txtAvant && e.jours.join() === 'jeu',
      'l\'aperçu montre le texte agrandi du téléphone, toujours sur un seul jour (' + txtAvant + ' → ' + e.txtApercu + ', ' + JSON.stringify(e.jours) + ')');
    await page.evaluate(() => afficherPage('planning')); await page.waitForTimeout(400);
    const planning = await page.evaluate(() => ({ attr: document.documentElement.getAttribute('data-aff-texte'), we: document.querySelectorAll('#racine .th.th-weekend').length }));
    verifier(planning.attr === null && planning.we === 0, 'page quittée : style et planning de l\'ordinateur (' + JSON.stringify(planning) + ')');
    // --- 4. Rouverte ---
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(300);
    e = await etatPage(page);
    verifier(e.actif === 'ordi' && !e.tel && e.texte === null, 'rouverte : de nouveau sur « Ordinateur » (' + JSON.stringify(e) + ')');
    // Mode Ordinateur : le planning de cet ordinateur suit, comme avant.
    await page.click('#page-affichage .reglage-ligne[data-option="weekends"] .interrupteur'); await page.waitForTimeout(300);
    jeux = await page.evaluate(() => ({ weOrdi: optionAffichage('weekends', 'ordi'), weTel: optionAffichage('weekends', 'tel'), live: afficherWeekends }));
    verifier(jeux.weOrdi === 'oui' && jeux.live && jeux.weTel === 'oui', 'mode Ordinateur : week-ends allumés sur ce planning (' + JSON.stringify(jeux) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 5. Téléphone ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true });
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(300);
    let e = await etatPage(page);
    verifier(e.actif === 'tel' && e.tel && !e.jours.includes('mar') && !e.defile, 'téléphone : la page s\'ouvre sur « Téléphone » (' + JSON.stringify(e) + ')');
    await page.tap('.bascule-profil[data-profil="ordi"]'); await page.waitForTimeout(200);
    e = await etatPage(page);
    verifier(e.actif === 'ordi' && !e.tel && e.jours.includes('mar') && e.defile && e.cadre, '« Ordinateur » sur téléphone : aperçu large, qui défile de côté (' + JSON.stringify(e) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
