const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur } = require('./aide_tests');

// Round du 26.09.2026 (suite 54). Lionel :
// - « jalons, modifier la description en "phases du projet". Et juste
//   "couleur" pour le choix de la couleur. »
// - « personnel, description équipe plus brève. Et uniquement "Couleur"
//   pour la couleur. Enlever le nombre de taches attribuée, cela n'a aucune
//   valeur. » ; « intervenant, idem que personnel. »
// - « General, [...] j'aimerais que les réglages de couleurs disparaissent
//   des réglages. Proposer des thèmes de couleurs à la place avec juste une
//   liste déroulante. [...] Une autre alternative qui peut me plaire serai
//   d'ouvrir une page de réglages avec un petit aperçu. »
// - « statuts et chantier, modifications de la couleur se fait par appuis
//   sur la pastille. Description plus brève. »
//
// Lancer : node test_suite54.js   (CAPTURE_DIR=… pour les captures)

const CAPTURES = process.env.CAPTURE_DIR || null;
// Couleurs enregistrées par Lionel (couleurs_perso, relevé du 26.09.2026).
const MES_COULEURS = [
  { id: 'fond', clair: '#ffffff', sombre: null },
  { id: 'section-intervenants', clair: '#e7f3e2', sombre: null },
  { id: 'section-personnel', clair: '#f3f4e6', sombre: null }
];
const BD = {
  personnes: [
    { id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true },
    { id: 2, nom: 'Mathis', sous_traitant: false, ordre: 2, actif: true },
    { id: 3, nom: 'Électricité Rossier SA', sous_traitant: true, ordre: 3, actif: true }],
  chantiers: [
    { id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 },
    { id: 2, nom: '26150 - Villa Bine', couleur: '#bfe0c9', actif: true, ordre: 2 }],
  statuts: [{ id: 1, cle: 'areserver', nom: 'à réserver', couleur: '#f9c8c8', ordre: 1 }, { id: 2, cle: 'confirme', nom: 'confirmé', couleur: '#c8e6c9', ordre: 2 }],
  jalons: [{ id: 1, date: '2026-09-24', texte: 'Réception gros œuvre', important: true, chantier_id: 1 }],
  taches: [
    { id: 1, personne_id: 1, date: '2026-09-24', demi: 'matin', ordre: 0, texte: 'Grue', statut_id: null, chantier_id: 1 },
    { id: 2, personne_id: 3, date: '2026-09-25', demi: 'aprem', ordre: 0, texte: 'Tableau', statut_id: 2, chantier_id: 2 }],
  couleurs_perso: MES_COULEURS
};

const allerPage = (page, p) => page.evaluate((p) => document.querySelector('.onglet[data-page="' + p + '"]').click(), p);
const variable = (page, v) => page.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim().toLowerCase(), v);
const bdCouleurs = (page) => page.evaluate(() => JSON.stringify(__BD.couleurs_perso.slice().sort((a, b) => a.id < b.id ? -1 : 1).map((r) => r.id + '=' + (r.clair || '-') + '/' + (r.sombre || '-'))));
// Change la valeur d'un <input type="color"> comme le sélecteur du système.
const choisirCouleur = (page, sel, hex, evt) => page.evaluate(([s, h, e]) => {
  const i = document.querySelector(s); i.value = h; i.dispatchEvent(new Event(e, { bubbles: true }));
}, [sel, hex, evt]);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  for (const [largeur, hauteur] of [[1400, 900], [390, 844]]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: hauteur }, hasTouch: largeur < 600, bd: BD });
    await page.emulateMedia({ colorScheme: 'light' });

    // --- Descriptions raccourcies ---------------------------------------
    const sous = await page.evaluate(() => {
      const t = (id) => [...document.querySelectorAll('#page-' + id + ' .page-sous')].map((p) => p.textContent);
      return { jalons: t('jalons'), personnel: t('personnel'), intervenants: t('intervenants'), chantiers: t('chantiers'), statuts: t('statuts') };
    });
    verifier(sous.jalons.join('|') === 'Phases du projet.', largeur + ' px, Jalons : description « Phases du projet. » (' + sous.jalons + ')');
    verifier(sous.personnel.length === 2 && sous.personnel[1].length <= 90, largeur + ' px, Personnel : description des équipes brève (' + sous.personnel[1] + ')');
    verifier(sous.intervenants.join('|') === 'Les sous-traitants.', largeur + ' px, Intervenants : description brève (' + sous.intervenants + ')');
    verifier(sous.chantiers[0].length <= 110 && /pastille/.test(sous.chantiers[0]), largeur + ' px, Chantiers : description brève qui parle de la pastille (' + sous.chantiers[0].length + ' car.)');
    verifier(sous.statuts[0].length <= 110 && /pastille/.test(sous.statuts[0]), largeur + ' px, Statuts : description brève qui parle de la pastille (' + sous.statuts[0].length + ' car.)');

    // --- Lignes « Couleur » réduites ------------------------------------
    for (const [p, groupe] of [['jalons', 'jalon'], ['personnel', 'section-personnel'], ['intervenants', 'section-intervenants']]) {
      await allerPage(page, p);
      await page.waitForTimeout(250);
      const l = await page.evaluate((g) => {
        const ligne = document.querySelector('.page.actif .reglage-couleur-compacte[data-groupe="' + g + '"]');
        if (!ligne) return null;
        const visibles = [...ligne.querySelectorAll('input[type=color]')].filter((i) => i.getBoundingClientRect().width > 0);
        const r = ligne.getBoundingClientRect();
        return { texte: ligne.textContent.replace('↺', '').trim(), visibles: visibles.map((i) => i.className.split(' ')[0] + '=' + i.value), hauteur: Math.round(r.height), dehors: r.right > window.innerWidth };
      }, groupe);
      verifier(l && l.texte === 'Couleur' && l.visibles.length === 1 && /^rc-clair=/.test(l.visibles[0]) && l.hauteur <= 52 && !l.dehors,
        largeur + ' px, ' + p + ' : ligne réduite à « Couleur » + une pastille (mode clair) (' + JSON.stringify(l) + ')');
      if (p !== 'jalons') {
        const compte = await page.evaluate(() => [...document.querySelectorAll('.page.actif .ligne-intervenant')].map((x) => x.textContent).filter((t) => /tâche/.test(t)).length);
        const spans = await page.evaluate(() => document.querySelectorAll('.page.actif .ligne-intervenant .compte').length);
        verifier(compte === 0 && spans === 0, largeur + ' px, ' + p + ' : plus de nombre de tâches (' + compte + ', ' + spans + ')');
      }
    }
    // Lionel avait réglé la ligne Personnel (#f3f4e6) : la pastille la montre.
    await allerPage(page, 'personnel');
    await page.waitForTimeout(200);
    verifier(await page.inputValue('#page-personnel .rc-clair[data-groupe="section-personnel"]') === '#f3f4e6', largeur + ' px, Personnel : la pastille montre la couleur enregistrée');
    await choisirCouleur(page, '#page-personnel .rc-clair[data-groupe="section-personnel"]', '#ddeeff', 'input');
    verifier(await variable(page, '--section-personnel-bg') === '#ddeeff', largeur + ' px, Personnel : nouvelle couleur appliquée tout de suite');
    await page.waitForTimeout(600);
    verifier(/section-personnel=#ddeeff\/-/.test(await bdCouleurs(page)), largeur + ' px, Personnel : couleur enregistrée sur le compte (' + await bdCouleurs(page) + ')');
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s54-personnel-' + largeur + '.png' });
    // Mode sombre : c'est le champ sombre qui se montre.
    await page.emulateMedia({ colorScheme: 'dark' });
    const sombre = await page.evaluate(() => [...document.querySelectorAll('#page-personnel .reglage-couleur-compacte input')].filter((i) => i.getBoundingClientRect().width > 0).map((i) => i.className.split(' ')[0]).join());
    verifier(sombre === 'rc-sombre', largeur + ' px, mode sombre : la pastille règle la couleur du mode sombre (' + sombre + ')');
    await page.emulateMedia({ colorScheme: 'light' });

    // --- Chantiers : la pastille change la couleur ------------------------
    await allerPage(page, 'chantiers');
    await page.waitForTimeout(250);
    const ch = await page.evaluate(() => {
      const l = document.querySelector('#page-chantiers .ligne-intervenant[data-ligne="1"]');
      const i = l.querySelector('.pastille-chantier'), r = i.getBoundingClientRect();
      return { type: i.type, valeur: i.value, taille: Math.round(r.width) + 'x' + Math.round(r.height), palette: !!l.querySelector('.lien-modifier'), boutons: [...l.querySelectorAll('.ligne-actions button')].map((b) => b.title).join() };
    });
    verifier(ch.type === 'color' && ch.valeur === '#f7d9a8' && ch.taille === '34x34' && !ch.palette && ch.boutons === 'Renommer',
      largeur + ' px, Chantiers : pastille = sélecteur de couleur (34 px à toucher), plus de bouton palette (' + JSON.stringify(ch) + ')');
    await choisirCouleur(page, '#page-chantiers .ligne-intervenant[data-ligne="1"] .pastille-chantier', '#a0c4ff', 'change');
    await page.waitForTimeout(400);
    const apresCh = await page.evaluate(() => ({ bd: __BD.chantiers.find((c) => c.id === 1).couleur, grille: CHANTIERS['26182 - Terrain de Padel'] && CHANTIERS['26182 - Terrain de Padel'].couleur, pastille: document.querySelector('#page-chantiers .ligne-intervenant[data-ligne="1"] .pastille-chantier').value }));
    verifier(apresCh.bd === '#a0c4ff' && apresCh.pastille === '#a0c4ff', largeur + ' px, Chantiers : couleur enregistrée dès le sélecteur refermé (' + JSON.stringify(apresCh) + ')');
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s54-chantiers-' + largeur + '.png' });

    // --- Statuts : pastille + crayon « Renommer » -------------------------
    await allerPage(page, 'statuts');
    await page.waitForTimeout(250);
    await choisirCouleur(page, '#page-statuts [data-cle="confirme"] .pastille-statut', '#88dd99', 'change');
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => ({ bd: __BD.statuts.find((s) => s.cle === 'confirme').couleur, nom: __BD.statuts.find((s) => s.cle === 'confirme').nom }));
    verifier(st.bd === '#88dd99' && st.nom === 'confirmé', largeur + ' px, Statuts : la pastille change la couleur, le nom reste (' + JSON.stringify(st) + ')');
    await page.click('#page-statuts [data-cle="confirme"] .lien-modifier');
    await page.waitForSelector('.pop .f-nom');
    const pop = await page.evaluate(() => ({ titre: document.querySelector('.pop .cp-titre').textContent, couleur: !!document.querySelector('.pop input[type=color]'), bouton: document.querySelector('#page-statuts [data-cle="confirme"] .lien-modifier').title }));
    verifier(pop.bouton === 'Renommer' && /^Renommer/.test(pop.titre) && !pop.couleur, largeur + ' px, Statuts : le crayon renomme seulement (' + JSON.stringify(pop) + ')');
    await page.fill('.pop .f-nom', 'confirmé ✓');
    await page.click('.pop .f-ok');
    await page.waitForTimeout(400);
    const st2 = await page.evaluate(() => { const s = __BD.statuts.find((x) => x.cle === 'confirme'); return s.nom + ' ' + s.couleur; });
    verifier(st2 === 'confirmé ✓ #88dd99', largeur + ' px, Statuts : renommer garde la couleur (' + st2 + ')');

    // --- Général : thème + fenêtre Personnaliser ------------------------
    await allerPage(page, 'general');
    await page.waitForTimeout(250);
    const gen = await page.evaluate(() => {
      const sel = document.getElementById('selThemeCouleurs'), btn = document.getElementById('btnPersonnaliserCouleurs');
      const r = document.querySelector('.reglage-theme').getBoundingClientRect(), rb = btn.getBoundingClientRect();
      return { champs: document.querySelectorAll('#page-general input[type=color]').length, options: [...sel.options].filter((o) => !o.hidden).map((o) => o.textContent).join(', '), valeur: sel.value,
        hauteur: Math.round(r.height), dehors: rb.right > window.innerWidth || r.right > window.innerWidth };
    });
    verifier(gen.champs === 0, largeur + ' px, Général : plus aucun réglage de couleur dans l\'onglet (' + gen.champs + ')');
    verifier(gen.options === 'Mes couleurs, Classique, Ardoise, Forêt, Terre cuite, Contraste fort' && gen.valeur === 'mes-couleurs',
      largeur + ' px, Général : liste de thèmes, « Mes couleurs » reconnu dans les couleurs enregistrées (' + gen.valeur + ' ; ' + gen.options + ')');
    verifier(gen.hauteur <= 120 && !gen.dehors, largeur + ' px, Général : ligne Thème compacte et dans l\'écran (' + gen.hauteur + ' px)');
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s54-general-' + largeur + '.png' });

    await page.selectOption('#selThemeCouleurs', 'foret');
    await page.waitForTimeout(300);
    const foret = { accent: await variable(page, '--accent'), bg: await variable(page, '--bg'), perso: await variable(page, '--section-personnel-bg'), bd: await bdCouleurs(page) };
    verifier(foret.accent === '#2e6b3c' && foret.bg === '#fbfdf9' && foret.perso === '#ddeeff', largeur + ' px, thème Forêt appliqué, couleur Personnel gardée (' + JSON.stringify(foret) + ')');
    verifier(foret.bd === '["fond=#fbfdf9/#0f1511","onglet-fond=#e0efe2/#1e3324","principale=#2e6b3c/#7dc58c","section-intervenants=#e7f3e2/-","section-personnel=#ddeeff/-","weekend=#d2dccd/#1f2a21"]',
      largeur + ' px, thème Forêt enregistré sur le compte (' + foret.bd + ')');
    await page.selectOption('#selThemeCouleurs', 'classique');
    await page.waitForTimeout(300);
    verifier(await bdCouleurs(page) === '["section-intervenants=#e7f3e2/-","section-personnel=#ddeeff/-"]' && await variable(page, '--accent') === '#1f4d8f',
      largeur + ' px, thème Classique : couleurs d\'origine, seules les couleurs de page restent (' + await bdCouleurs(page) + ')');
    await page.selectOption('#selThemeCouleurs', 'mes-couleurs');
    await page.waitForTimeout(300);
    verifier(await bdCouleurs(page) === '["fond=#ffffff/-","section-intervenants=#e7f3e2/-","section-personnel=#ddeeff/-"]', largeur + ' px, retour à « Mes couleurs » (' + await bdCouleurs(page) + ')');

    await page.click('#btnPersonnaliserCouleurs');
    await page.waitForSelector('.couleurs-modal');
    const modal = await page.evaluate(() => {
      const m = document.querySelector('.couleurs-modal'), r = m.getBoundingClientRect();
      const a = m.querySelector('.apercu-couleurs').getBoundingClientRect();
      return { lignes: m.querySelectorAll('.reglage-couleurs-groupe').length, attendues: GROUPES_COULEURS.filter((g) => !g.page).length, apercu: Math.round(a.height), dedans: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight,
        theme: m.querySelector('.sel-theme-couleurs').value, largeur: Math.round(r.width) };
    });
    verifier(modal.lignes === modal.attendues && modal.lignes === 17 && modal.apercu > 150 && modal.dedans && modal.theme === 'mes-couleurs',
      largeur + ' px, Personnaliser : fenêtre dans l\'écran, aperçu + ' + modal.lignes + ' réglages (' + JSON.stringify(modal) + ')');
    // L'aperçu suit la couleur réglée, et le thème devient « Personnalisé ».
    await choisirCouleur(page, '.couleurs-modal .rc-clair[data-groupe="onglet-fond"]', '#ffe0b0', 'input');
    const apercu = await page.evaluate(() => ({ onglet: getComputedStyle(document.querySelector('.apercu-couleurs .ac-actif')).backgroundColor, themes: [...document.querySelectorAll('.sel-theme-couleurs')].map((s) => s.value + ':' + s.selectedOptions[0].textContent).join() }));
    verifier(apercu.onglet === 'rgb(255, 224, 176)' && apercu.themes === 'perso:Personnalisé,perso:Personnalisé',
      largeur + ' px, Personnaliser : l\'aperçu suit la couleur, le thème passe à « Personnalisé » (' + JSON.stringify(apercu) + ')');
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s54-modal-' + largeur + '.png' });
    // Quitter « Personnalisé » demande confirmation.
    await page.selectOption('.couleurs-modal .sel-theme-couleurs', 'ardoise');
    await page.waitForSelector('.confirm-pop .c-annuler');
    await page.click('.confirm-pop .c-annuler');
    await page.waitForTimeout(200);
    verifier(await variable(page, '--accent-soft') === '#ffe0b0' && await page.inputValue('.couleurs-modal .sel-theme-couleurs') === 'perso',
      largeur + ' px, Personnalisé → thème annulé : couleurs gardées');
    await page.selectOption('.couleurs-modal .sel-theme-couleurs', 'ardoise');
    await page.waitForSelector('.confirm-pop .c-ok');
    await page.click('.confirm-pop .c-ok');
    await page.waitForTimeout(300);
    verifier(await variable(page, '--accent') === '#44576d' && await page.inputValue('.couleurs-modal .rc-clair[data-groupe="principale"]') === '#44576d' && await page.inputValue('#selThemeCouleurs') === 'ardoise',
      largeur + ' px, Personnalisé → Ardoise confirmé : thème appliqué, champs et listes à jour');
    // Échap ferme la fenêtre, même après la confirmation.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    verifier(!(await page.$('.couleurs-modal')), largeur + ' px, Échap ferme la fenêtre Personnaliser');
    await page.waitForTimeout(500);
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // Aucune couleur enregistrée : « Classique ».
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: Object.assign({}, BD, { couleurs_perso: [] }) });
    await allerPage(page, 'general');
    await page.waitForTimeout(200);
    verifier(await page.inputValue('#selThemeCouleurs') === 'classique', 'sans couleur enregistrée : thème « Classique »');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
