const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 27.09.2026 (suite 79). Lionel :
//   « L'option jour voisins au bord doit être placé dans la toolbar avec le
//     mode 2 semaines. Disparaît en mode mobile. »
//   « Coin arrondi planning ne doit pas apparaître aussi car la vue est bord
//     à bord. »
// Vérifie :
//   1. ordinateur : #btnJoursBords juste après « Afficher 2 semaines », éteint ;
//      plus de ligne « bords » sur la page Affichage ;
//   2. un clic : vue bord à bord, bouton actif, réglage enregistré (compte
//      et appareil) ; « Coins du planning arrondis » caché sur la page
//      Affichage (mode Ordinateur), visible en mode Téléphone ;
//   3. « Tout rétablir » (texte agrandi) : garde la vue bord à bord ;
//   4. rechargement : bouton actif, vue bord à bord ;
//   5. 2e clic : vue normale, ligne des coins revenue ;
//   6. fenêtre étroite (700 px) : le bouton part dans le menu ⋮, juste
//      après la navigation, avec son libellé ;
//   7. téléphone : bouton absent de la barre et du menu ⋮.
//
// Suite 82 : le bouton est devenu #btnModeVue (1 semaine > jours voisins >
// 2 semaines) ; « allumé » = mode « Jours voisins ».
//
// Lancer : node test_suite79.js

const etat = (page) => page.evaluate(() => {
  const b = document.getElementById('btnModeVue'), p = document.getElementById('page-affichage');
  const ligne = (id) => { const l = p && p.querySelector('.reglage-ligne[data-option="' + id + '"]'); return l ? (l.hidden ? 'cachee' : 'visible') : 'absente'; };
  return {
    // Suite 82 : dans le groupe de la navigation, à la place de « Afficher 2 semaines ».
    apres2s: !!b && b.parentElement.id === 'groupeNavSemaine' && !document.getElementById('btnJoursBords') && !document.getElementById('btnDeuxSemaines'),
    visible: !!b && b.getBoundingClientRect().width > 0, actif: !!b && b.dataset.mode === 'bords', pressed: b && (b.dataset.mode === 'bords' ? 'true' : 'false'),
    vue: !!document.querySelector('#racine.vue-bords'), opt: optionAffichage('bords'),
    local: JSON.parse(localStorage.getItem('planning.affichage') || '{}').bords || null,
    compte: ((window.__BD.reglages || []).find((x) => x.cle === 'affichage') || { valeur: {} }).valeur.bords || null,
    ligneBords: ligne('bords'), ligneCadre: ligne('cadre')
  };
});

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 800 } });
    await page.waitForTimeout(300);
    // --- 1. Éteint ---
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(200);
    let e = await etat(page);
    verifier(e.ligneBords === 'absente' && e.ligneCadre === 'visible', 'page Affichage : plus de ligne « Jours voisins aux bords », coins visibles (' + JSON.stringify(e) + ')');
    await page.evaluate(() => afficherPage('planning')); await page.waitForTimeout(200);
    e = await etat(page);
    verifier(e.apres2s && e.visible && !e.actif && e.pressed === 'false' && !e.vue, 'barre d\'outils : bouton de vue à la place de « Afficher 2 semaines », sur « 1 semaine » (' + JSON.stringify(e) + ')');
    // --- 2. Allumé ---
    await page.click('#btnModeVue'); await page.waitForTimeout(900);
    e = await etat(page);
    verifier(e.actif && e.pressed === 'true' && e.vue && e.opt === 'oui' && e.local === 'oui' && e.compte === 'oui',
      'un clic : vue bord à bord, bouton actif, enregistré sur le compte et l\'appareil (' + JSON.stringify(e) + ')');
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(200);
    e = await etat(page);
    verifier(e.ligneCadre === 'cachee', 'page Affichage, mode Ordinateur : « Coins du planning arrondis » caché (' + JSON.stringify(e) + ')');
    await page.click('.bascule-profil[data-profil="tel"]'); await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.ligneCadre === 'visible', 'mode Téléphone : les coins restent réglables (' + JSON.stringify(e) + ')');
    await page.click('.bascule-profil[data-profil="ordi"]'); await page.waitForTimeout(150);
    // --- 3. Tout rétablir ---
    await page.click('.choix-pastille[data-option="texte"][data-valeur="grand"]'); await page.waitForTimeout(200);
    await page.click('#btnAffichageDefaut'); await page.waitForTimeout(600);
    await page.evaluate(() => afficherPage('planning')); await page.waitForTimeout(400);
    e = await etat(page);
    const texte = await page.evaluate(() => optionAffichage('texte'));
    verifier(texte === 'normal' && e.actif && e.vue && e.opt === 'oui', '« Tout rétablir » : texte revenu, vue bord à bord gardée (' + JSON.stringify(e) + ')');
    // --- 4. Ouverture avec le réglage du compte ---
    {
      const o = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 800 }, bd: { reglages: [{ cle: 'affichage', valeur: { bords: 'oui' } }] } });
      await o.page.waitForTimeout(600);
      const r = await etat(o.page);
      verifier(r.actif && r.pressed === 'true' && r.vue, 'ouverture, réglage du compte allumé : bouton actif, vue bord à bord (' + JSON.stringify(r) + ')');
      toutesErreurs.push(...o.erreurs);
      await o.page.context().close();
    }
    // --- 5. Éteint (suite 82 : 2e clic = 2 semaines, sans bords) ---
    await page.click('#btnModeVue'); await page.waitForTimeout(900);
    e = await etat(page);
    verifier(!e.actif && !e.vue && e.opt === 'non' && await page.evaluate(() => deuxSemaines), '2e clic : 2 semaines, sans bords (' + JSON.stringify(e) + ')');
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(200);
    e = await etat(page);
    verifier(e.ligneCadre === 'visible', 'ligne des coins revenue (' + JSON.stringify(e) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }
  {
    // --- 6. Fenêtre étroite : dans le menu ⋮ avec la navigation ---
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 700, height: 800 } });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const b = document.getElementById('btnModeVue');
      const lbl = b.querySelector('.toolbar-btn-label');
      return { collé: b.parentElement.id === 'groupeNavSemaine', dansMenu: !!b.closest('.toolbar-secondaire'),
        libelle: lbl && getComputedStyle(lbl).display !== 'none' ? lbl.textContent : null };
    });
    verifier(m.collé && m.dansMenu && m.libelle === '1 semaine', 'fenêtre étroite : dans le menu ⋮ avec la navigation, libellé du mode (' + JSON.stringify(m) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }
  {
    // --- 7. Téléphone ---
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true });
    await page.waitForTimeout(300);
    const t = await page.evaluate(() => { const b = document.getElementById('btnModeVue'); return { display: getComputedStyle(b).display, larg: b.getBoundingClientRect().width }; });
    const btnMenu = await page.$('#btnPlusOutils, .btn-plus-outils, [aria-label="Plus d\'outils"]');
    let menu = null;
    if (btnMenu) { await btnMenu.click(); await page.waitForTimeout(200); menu = await page.evaluate(() => document.getElementById('btnModeVue').getBoundingClientRect().width); }
    verifier(t.display === 'none' && t.larg === 0 && (menu === null || menu === 0), 'téléphone : bouton absent de la barre et du menu ⋮ (' + JSON.stringify({ t, menu }) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
