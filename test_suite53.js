const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 53). Lionel :
// - « La fenêtre d'aperçu avant impression doit être plus large sur
//   tablette et deskop. »
// - « A réservé pourrait être placer sur la barre du bas en mode mobile. »
// - « Onglets jalons, personnel, intervenants, chantier et statut à
//   reprendre. Des icônes seront mieux que des textes car sur mobile les
//   textes sortent de l'écran. »
//
// Lancer : node test_suite53.js   (CAPTURE_DIR=… pour les captures)

const CAPTURES = process.env.CAPTURE_DIR || null;
const BD = {
  personnes: [
    { id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true },
    { id: 2, nom: 'Mathis Dupont-Lefèvre', sous_traitant: false, ordre: 2, actif: true },
    { id: 3, nom: 'Électricité Rossier SA', sous_traitant: true, ordre: 3, actif: true },
    { id: 4, nom: 'Ancien ouvrier', sous_traitant: false, ordre: 4, actif: false }],
  chantiers: [
    { id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 },
    { id: 2, nom: '26150 - Villa Bine, transformation complète', couleur: '#bfe0c9', actif: true, ordre: 2 },
    { id: 3, nom: '25011 - Ancien chantier', couleur: '#dddddd', actif: false, ordre: 3 }],
  statuts: [{ id: 1, cle: 'areserver', nom: 'à réserver', couleur: '#f9c8c8', ordre: 1 }, { id: 2, cle: 'confirme', nom: 'confirmé', couleur: '#c8e6c9', ordre: 2 }],
  jalons: [{ id: 1, date: '2026-09-24', texte: 'Réception gros œuvre', important: true, chantier_id: 1 }],
  taches: [
    { id: 1, personne_id: 1, date: '2026-09-24', demi: 'matin', ordre: 0, texte: 'Grue', statut_id: 1, chantier_id: 1 },
    { id: 2, personne_id: 3, date: '2026-10-06', demi: 'aprem', ordre: 0, texte: 'Tableau électrique', statut_id: 1, chantier_id: 2 }]
};
const PAGES = ['jalons', 'personnel', 'intervenants', 'chantiers', 'statuts'];

const allerPage = (page, p) => page.evaluate((p) => document.querySelector('.onglet[data-page="' + p + '"]').click(), p);

// Lignes de la page active : boutons de .ligne-actions tous en icônes,
// dans la ligne et dans l'écran ; nom pas écrasé.
function mesurerLignes(page) {
  return page.evaluate(() => {
    const pageEl = document.querySelector('.page.actif');
    const lignes = [...pageEl.querySelectorAll('.ligne-intervenant')].filter((l) => l.getBoundingClientRect().width > 0 && l.querySelector('.ligne-actions'));
    const pb = [], lignesNoms = [];
    let boutons = 0;
    lignes.forEach((l) => {
      const r = l.getBoundingClientRect();
      [...l.querySelectorAll('.ligne-actions button')].forEach((b) => {
        boutons++;
        const rb = b.getBoundingClientRect();
        if (!b.classList.contains('btn-icone-ligne') || b.textContent.trim() !== '' || !b.title || !b.querySelector('svg')) pb.push('texte:' + (b.title || b.textContent));
        if (rb.right > r.right + 1 || rb.right > window.innerWidth) pb.push('dehors:' + b.title);
        if (rb.width < 30 || rb.height < 30) pb.push('petit:' + b.title);
      });
      // Nom pas écrasé : plus un mot par ligne (« 26182 / - / Terrain / de /
      // Padel » avant la suite 53) — 3 lignes au plus.
      const nom = l.querySelector('b');
      if (nom) {
        const st = getComputedStyle(nom), hl = st.lineHeight === 'normal' ? parseFloat(st.fontSize) * 1.2 : parseFloat(st.lineHeight);
        const nbLignes = Math.round(nom.getBoundingClientRect().height / hl);
        lignesNoms.push(nbLignes);
        if (nbLignes > 3) pb.push('nom écrasé:' + nom.textContent + ' (' + nbLignes + ' lignes)');
      }
    });
    const actifTexte = [...pageEl.querySelectorAll('.champ-actif-texte')].filter((e) => e.getBoundingClientRect().width > 0).length;
    return { lignes: lignes.length, boutons, pb, lignesNoms: lignesNoms.join(), actifTexte, deborde: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Onglets en icônes (téléphone 360/390, ordinateur 1400) ---
  for (const largeur of [360, 390, 1400]) {
    const tel = largeur < 600;
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: 820 }, hasTouch: tel, bd: BD });
    for (const p of PAGES) {
      await allerPage(page, p);
      await page.waitForTimeout(300);
      // Désactivés dépliés : Réactiver / Supprimer définitivement aussi.
      const repli = await page.$('.page.actif .repli-desactives:not(.ouvert)');
      if (repli) { await repli.click(); await page.waitForTimeout(150); }
      const m = await mesurerLignes(page);
      verifier(m.lignes > 0 && m.boutons > 0 && m.pb.length === 0 && !m.deborde,
        largeur + ' px, ' + p + ' : ' + m.boutons + ' boutons en icônes, dans la ligne et dans l\'écran (' + JSON.stringify(m) + ')');
      if (['personnel', 'chantiers'].includes(p)) {
        verifier(tel ? m.actifTexte === 0 : m.actifTexte > 0, largeur + ' px, ' + p + ' : libellé « Actif » ' + (tel ? 'masqué' : 'affiché') + ' (' + m.actifTexte + ')');
      }
      if (CAPTURES && largeur !== 360) await page.screenshot({ path: CAPTURES + '/s53-' + p + '-' + largeur + '.png' });
    }
    // Les icônes font toujours la même chose que les anciens liens.
    await allerPage(page, 'chantiers');
    await page.waitForTimeout(200);
    // Suite 54 : plus de bouton palette, la pastille est le sélecteur de
    // couleur (vérifié en détail dans test_suite54.js).
    const pastille = await page.evaluate(() => { const i = document.querySelector('#page-chantiers .ligne-intervenant:not(.ligne-desactivee) .pastille-chantier'); return i ? i.type + ' ' + i.value : null; });
    verifier(pastille === 'color #f7d9a8', largeur + ' px, Chantiers : la pastille est le sélecteur de couleur (' + pastille + ')');
    await allerPage(page, 'personnel');
    await page.waitForTimeout(200);
    await page.click('#page-personnel .ligne-intervenant[data-id] .lien-consultation');
    await page.waitForSelector('.pop-lien-consultation');
    verifier(/Lien de consultation — Lionel/.test(await page.$eval('.pop-lien-consultation .cp-titre', (e) => e.textContent)), largeur + ' px, Personnel : l\'icône maillons ouvre le lien de consultation');
    await page.click('.pop-lien-consultation .f-annuler');
    await allerPage(page, 'jalons');
    await page.waitForTimeout(300);
    const drapeau = await page.evaluate(() => { const d = document.querySelector('#page-jalons .jalon-important svg'); return d ? Math.round(d.getBoundingClientRect().width) : 0; });
    verifier(drapeau === 14, largeur + ' px, Jalons : drapeau « important » lisible (' + drapeau + ' px)');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. « À réserver » dans la barre du bas (téléphone) ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 820 }, hasTouch: true, bd: BD });
    await page.waitForTimeout(1800);
    const m = await page.evaluate(() => {
      const bas = document.getElementById('btnAReserverNavBas'), r = bas.getBoundingClientRect(), badge = bas.querySelector('.compte-a-reserver');
      const nav = document.getElementById('navBas').getBoundingClientRect();
      return { visible: r.width > 0 && r.top >= nav.top && r.bottom <= nav.bottom, compte: badge.hidden ? '' : badge.textContent, fond: getComputedStyle(badge).backgroundColor,
        titre: bas.title, barreOutils: document.getElementById('groupeAReserver').getBoundingClientRect().width,
        menu: !!document.querySelector('#toolbarSecondaire #groupeAReserver') };
    });
    verifier(m.visible && m.compte === '2' && m.fond === 'rgb(249, 200, 200)' && m.titre === 'À réserver — 2 tâches à partir d’aujourd’hui',
      '390 px : « À réserver » dans la barre du bas, compteur 2 à la couleur du statut (' + JSON.stringify(m) + ')');
    verifier(m.barreOutils === 0 && !m.menu, '390 px : plus dans la barre d\'outils du planning ni dans « ⋮ »');
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s53-a-reserver-bas.png' });
    // Depuis une autre page : ouvert, puis clic sur une ligne → planning, ce jour.
    await allerPage(page, 'chantiers');
    await page.waitForTimeout(300);
    verifier(await page.$eval('#btnAReserverNavBas', (b) => b.getBoundingClientRect().width > 0), '390 px : visible aussi sur l\'onglet Chantiers');
    await page.click('#btnAReserverNavBas');
    await page.waitForSelector('.pop-a-reserver .ar-ligne');
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s53-a-reserver-resume.png' });
    const lignes = await page.$$eval('.pop-a-reserver .ar-ligne', (ls) => ls.map((l) => l.textContent));
    verifier(lignes.length === 2 && /Tableau électrique/.test(lignes[1]), '390 px : le résumé s\'ouvre depuis la barre du bas (' + lignes.join(' ‖ ') + ')');
    await page.click('.pop-a-reserver .ar-ligne >> nth=1');
    await page.waitForTimeout(700);
    const apres = await page.evaluate(() => ({ planning: document.getElementById('page-planning').classList.contains('actif'), nom: document.getElementById('switcherNom').textContent,
      semaine: etat.semaines[etat.indexSemaine].debut, jour: typeof jourMobileIso !== 'undefined' ? jourMobileIso : null, pop: !!document.querySelector('.pop-a-reserver') }));
    verifier(apres.planning && apres.nom === 'Planning' && apres.semaine === '2026-10-05' && apres.jour === '2026-10-06' && !apres.pop,
      '390 px : clic sur une ligne depuis Chantiers — retour au planning, sur ce jour (' + JSON.stringify(apres) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  // Ordinateur : toujours dans la barre d'outils, rien en bas.
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD });
    await page.waitForTimeout(1800);
    const m = await page.evaluate(() => ({ barre: document.getElementById('btnAReserver').getBoundingClientRect().width > 0, bas: document.getElementById('btnAReserverNavBas').getBoundingClientRect().width }));
    verifier(m.barre && m.bas === 0, '1400 px : « À réserver » reste dans la barre d\'outils, pas de barre du bas (' + JSON.stringify(m) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Barre d'onglets du haut : icônes seules quand elle déborde ---
  for (const vp of [{ width: 1400, height: 900 }, { width: 1024, height: 768 }, { width: 844, height: 390 }]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: vp, bd: BD });
    const onglets = () => page.evaluate(() => {
      const nav = document.getElementById('ongletsNav'), liste = nav.querySelector('.onglets-liste');
      const noms = [...liste.querySelectorAll('.onglet')].filter((o) => o.querySelector('.onglet-nom').getBoundingClientRect().width > 0).map((o) => o.dataset.page);
      const dedans = [...liste.querySelectorAll('.onglet')].every((o) => { const r = o.getBoundingClientRect(), rl = liste.getBoundingClientRect(); return r.width > 0 && r.right <= rl.right + 1; });
      return { compact: nav.classList.contains('onglets-compacts'), noms, dedans, titres: [...liste.querySelectorAll('.onglet')].every((o) => !!o.title) };
    });
    const a = await onglets();
    // Suite 61 : Général et Mise en page passés dans le menu de la pastille —
    // 8 onglets, leurs noms tiennent dès 1024 px.
    const large = vp.width >= 1024;
    // Suite 65 : 9 onglets avec Notes — à 1024 px, resserrés, noms gardés.
    verifier(a.dedans && a.titres && (large ? !a.compact && a.noms.length === 9 : a.compact && a.noms.join() === 'planning'),
      vp.width + ' px : ' + (large ? 'onglets avec leur nom' : 'onglets en icônes, nom de l\'onglet actif seul') + ', tous visibles (' + JSON.stringify(a) + ')');
    if (!large) {
      await allerPage(page, 'horaires'); // suite 61 : Mise en page est passée dans le menu de la pastille
      await page.waitForTimeout(200);
      const b = await onglets();
      verifier(b.dedans && b.noms.join() === 'horaires', vp.width + ' px : l\'onglet choisi prend son nom, les autres restent en icônes (' + JSON.stringify(b) + ')');
      if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s53-onglets-' + vp.width + '.png' });
    }
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Aperçu avant impression plus large (tablette, ordinateur) ---
  for (const [vp, min, max] of [[{ width: 1400, height: 900 }, 1340, 1352], [{ width: 1920, height: 1080 }, 1600, 1600], [{ width: 1024, height: 768 }, 1000, 1000], [{ width: 820, height: 1180 }, 796, 796], [{ width: 390, height: 820 }, 358, 358]]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: vp, hasTouch: vp.width < 600, bd: BD });
    await page.evaluate(() => openPrintSheet());
    await page.waitForSelector('.impression-modal .print-doc table');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const m = document.querySelector('.impression-modal').getBoundingClientRect(); return { l: Math.round(m.width), gauche: Math.round(m.left), droite: Math.round(window.innerWidth - m.right) }; });
    verifier(r.l >= min && r.l <= max && Math.abs(r.gauche - r.droite) <= 2,
      vp.width + ' px : aperçu de ' + r.l + ' px de large (attendu ' + min + (max !== min ? '–' + max : '') + '), centré (' + JSON.stringify(r) + ')');
    if (CAPTURES && vp.width !== 1920) await page.screenshot({ path: CAPTURES + '/s53-impression-' + vp.width + '.png' });
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exitCode = bilan();
})();
