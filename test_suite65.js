const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 26.09.2026 (suite 65). Lionel :
//   « Jalon et Important ont la même icone, ca prête à confusion. trouve
//     une autre icone pour important »
//   « Ajoute un onglet note entre jalon et personnel. Mets y la couleur et
//     d'autres choses. »
//   « une barre de défilement est apparu a droite sur mon planning alors
//     qu'il y a encore de la place. Fait en sorte que toutes les barres de
//     défilement soient des barres discrètes, visibles unique si il y a
//     déplacement. »
// Vérifie :
//   1. Important : une icône (cercle « ! ») différente du drapeau des
//      jalons — barre de sélection, fiche, liste des jalons ;
//   2. Onglet Notes entre Jalons et Personnel (barre du haut et menu des
//      pages), raccourci « page Notes » ;
//   3. Page Notes : la couleur (plus dans « Personnaliser »), « Afficher
//      dans le planning » lié à la ligne Notes, la liste (plages fusionnées,
//      deux notes du même jour séparées, passées à part), ajouter,
//      modifier, supprimer sans toucher l'autre note du même jour ;
//   4. Barres de défilement : natives masquées, .scroller sans défilement
//      vertical, fine poignée seulement pendant le défilement, qui se saisit
//      à la souris ;
//   5. Téléphone : page Notes sans débordement.
//
// Lancer : node test_suite65.js   (CAPTURES=dossier pour les captures)

const N = (id, date, texte, important, demi) => ({ id, date, texte, important: !!important, demi: demi || null });
const BD = {
  jalons: [{ id: 1, date: '2026-09-25', texte: 'Réception', important: true, demi: null, chantier_id: 1 }],
  notes: [N(1, '2026-09-24', 'Réunion de chantier'), N(2, '2026-09-25', 'Réunion de chantier'),
    N(3, '2026-09-24', 'Livraison grue', true), N(4, '2026-09-10', 'Ancienne note')],
  taches: []
};
const lignesNotes = (page) => page.evaluate(() => ['#listeNotesAVenir', '#listeNotesPassees'].map((s) =>
  [...document.querySelectorAll(s + ' .ligne-note')].map((l) => l.querySelector('b').textContent + (l.querySelector('.jalon-important') ? '!' : '') + ' @ ' + l.querySelector('.plage-jalon').textContent).join(' | ')));
const svg = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); const g = e && e.querySelector('svg'); return g ? g.innerHTML : ''; }, sel);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1 à 4. Ordinateur ------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD });

    // 1. Icône « Important »
    const ic = await page.evaluate(() => ({ diff: ICONS.important !== ICONS.flag, rond: /<circle/.test(ICONS.important) }));
    const iSel = await svg(page, '#selImportant'), iJalons = await svg(page, '.onglet[data-page="jalons"]');
    verifier(ic.diff && ic.rond && iSel && iSel !== iJalons && /circle/.test(iSel),
      'Important : icône en cercle « ! », différente du drapeau des jalons (barre de sélection)');
    await page.evaluate(() => afficherPage('jalons')); await page.waitForTimeout(300);
    const iListe = await svg(page, '#listeJalons .jalon-important');
    verifier(/circle/.test(iListe) && iListe !== iJalons, 'page Jalons : le jalon important porte l\'icône « Important », pas le drapeau');

    // 2. Onglets
    const ordre = await page.evaluate(() => [
      [...document.querySelectorAll('.onglets-liste .onglet')].map((o) => o.dataset.page).slice(0, 4).join('|'),
      [...document.querySelectorAll('.switcher-item')].map((o) => o.dataset.page).filter((p) => /^(planning|jalons|notes|personnel)$/.test(p)).join('|')]);
    verifier(ordre[0] === 'planning|jalons|notes|personnel' && ordre[1] === ordre[0], 'onglet Notes entre Jalons et Personnel, en haut et dans le menu des pages (' + ordre.join(' ; ') + ')');
    await page.evaluate(() => afficherPage('raccourcis')); await page.waitForTimeout(200);
    const rc = await page.evaluate(() => { const l = document.querySelector('.ligne-raccourci[data-action="pageNotes"]'); return l ? l.textContent : ''; });
    verifier(/Notes/.test(rc), 'raccourci « page Notes » dans la page Raccourcis (' + rc + ')');
    await page.evaluate(() => afficherPage('planning')); await page.waitForTimeout(200);
    await page.click('.onglets-liste .onglet[data-page="notes"]'); await page.waitForTimeout(400);
    verifier(await page.evaluate(() => document.getElementById('page-notes').classList.contains('actif')), 'clic sur l\'onglet Notes : la page Notes s\'ouvre');

    // 3. Page Notes
    const couleur = await page.evaluate(() => ({
      ici: !!document.querySelector('#page-notes .reglage-couleur-compacte[data-groupe="note"] .rc-clair'),
      general: GROUPES_COULEURS.filter((g) => !g.page).some((g) => g.id === 'note')
    }));
    verifier(couleur.ici && !couleur.general, 'page Notes : la couleur des notes, qui n\'est plus dans « Personnaliser » (' + JSON.stringify(couleur) + ')');
    const [aVenir, passees] = await lignesNotes(page);
    verifier(aVenir === 'Livraison grue! @ jeu. 24 sept. | Réunion de chantier @ jeu. 24 → ven. 25 sept.' || /^Livraison grue! @ .*24.* \| Réunion de chantier @ .*24.*25/.test(aVenir),
      'liste : « Réunion » sur 2 jours en une ligne, « Livraison grue » (important) séparée le même jour (' + aVenir + ')');
    verifier(/^Ancienne note @ .*10/.test(passees), 'liste : les notes passées à part (' + passees + ')');
    const titres = await page.evaluate(() => [...document.querySelectorAll('#listeNotes .titre-liste')].map((h) => h.textContent).join('|'));
    verifier(titres === 'En cours et à venir 2|Passées 1', 'sections « En cours et à venir » et « Passées » avec leur nombre (' + titres + ')');

    // Afficher dans le planning ↔ ligne Notes
    const ligneNotes = () => page.evaluate(() => [...document.querySelectorAll('.lbl-speciale')].some((l) => l.textContent === 'Notes'));
    verifier(await page.isChecked('#chkNotesPlanning') && await ligneNotes(), '« Afficher dans le planning » coché : la ligne Notes est au planning');
    await page.click('#page-notes .reglage-notes-planning .interrupteur'); await page.waitForTimeout(300);
    const masquee = await page.evaluate(() => replierNotes);
    verifier(masquee && !(await ligneNotes()), 'décoché : plus de ligne Notes au planning');
    await page.click('#page-notes .reglage-notes-planning .interrupteur'); await page.waitForTimeout(300);
    verifier(!(await page.evaluate(() => replierNotes)) && await ligneNotes(), 'recoché : la ligne Notes revient');

    // Ajouter
    await page.click('#listeNotesAVenir .ligne-ajouter'); await page.waitForTimeout(250);
    const fiche = await page.evaluate(() => ({ nom: (document.querySelector('.fiche-note .bandeau') || {}).textContent || '', imp: !!document.querySelector('.fiche-note .f-important svg circle') }));
    verifier(/Note/.test(fiche.nom) && fiche.imp, 'fiche « Note » avec le bouton Important en cercle « ! » (' + JSON.stringify(fiche) + ')');
    await page.fill('.fiche-note .f-texte-note', 'Visite du bureau de contrôle');
    await page.click('.fiche-note .f-ok'); await page.waitForTimeout(600);
    const bdAjout = await page.evaluate(() => __BD.notes.filter((n) => n.texte === 'Visite du bureau de contrôle').map((n) => n.date).join());
    verifier(bdAjout === '2026-09-24' && /Visite du bureau de contrôle/.test((await lignesNotes(page))[0]), 'Ajouter : note enregistrée aujourd\'hui et listée (' + bdAjout + ')');

    // Modifier le texte de « Réunion de chantier » (2 jours)
    await page.click('#listeNotesAVenir .ligne-note[data-id-debut="1"] .lien-modifier'); await page.waitForTimeout(250);
    await page.fill('.fiche-note .f-texte-note', 'Réunion de chantier n°12');
    await page.click('.fiche-note .f-ok'); await page.waitForTimeout(600);
    const bdModif = await page.evaluate(() => __BD.notes.filter((n) => /^Réunion/.test(n.texte)).map((n) => n.date + ' ' + n.texte).sort().join(' ; '));
    const grue = await page.evaluate(() => __BD.notes.filter((n) => n.texte === 'Livraison grue').length);
    verifier(bdModif === '2026-09-24 Réunion de chantier n°12 ; 2026-09-25 Réunion de chantier n°12' && grue === 1,
      'Modifier : le texte change sur les 2 jours, « Livraison grue » du même jour intacte (' + bdModif + ')');

    // Supprimer « Livraison grue » : les autres notes du 24 restent
    const idGrue = await page.evaluate(() => NOTES_TOUTES.find((n) => n.texte === 'Livraison grue').idDebut);
    await page.click('#listeNotesAVenir .ligne-note[data-id-debut="' + idGrue + '"] .lien-supprimer'); await page.waitForTimeout(200);
    const q = await page.evaluate(() => (document.querySelector('.confirm-pop .confirm-texte') || {}).textContent);
    await page.click('.confirm-pop .c-ok'); await page.waitForTimeout(600);
    const reste24 = await page.evaluate(() => __BD.notes.filter((n) => n.date === '2026-09-24').map((n) => n.texte).sort().join(' | '));
    verifier(/Livraison grue/.test(q || '') && reste24 === 'Réunion de chantier n°12 | Visite du bureau de contrôle',
      'Supprimer (après confirmation) : seule « Livraison grue » part, les autres notes du 24 restent (' + reste24 + ')');
    if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/s65-notes.png', fullPage: true });

    // 4. Barres de défilement discrètes
    await page.evaluate(() => afficherPage('planning')); await page.waitForTimeout(300);
    const css = await page.evaluate(() => {
      const s = document.querySelector('.scroller'), app = document.getElementById('app');
      return { sc: getComputedStyle(s).overflowY, largeur: getComputedStyle(app).scrollbarWidth, liste: getComputedStyle(document.body).scrollbarWidth };
    });
    verifier(css.sc === 'hidden' && css.largeur === 'none' && css.liste === 'none', 'barres natives masquées, .scroller sans défilement vertical (' + JSON.stringify(css) + ')');
    // Page qui défile : on rend #app plus haut que l'écran.
    await page.setViewportSize({ width: 1400, height: 420 }); await page.waitForTimeout(300);
    const avant = await page.evaluate(() => document.querySelectorAll('.barre-defilement.visible').length);
    await page.evaluate(() => { document.getElementById('app').scrollTop = 120; }); await page.waitForTimeout(120);
    const pendant = await page.evaluate(() => {
      const app = document.getElementById('app'), p = [...document.querySelectorAll('.barre-defilement-v.visible.utile')][0];
      if (!p) return null;
      const r = p.getBoundingClientRect(), ra = app.getBoundingClientRect();
      return { l: Math.round(r.width), h: Math.round(r.height), droite: Math.round(ra.right - r.right), op: +getComputedStyle(p).opacity > 0, dans: r.top >= ra.top && r.bottom <= ra.bottom };
    });
    verifier(avant === 0 && pendant && pendant.l <= 8 && pendant.droite <= 4 && pendant.h >= 24 && pendant.dans,
      'pendant le défilement : fine poignée (≤ 8 px) au bord droit (' + avant + ', ' + JSON.stringify(pendant) + ')');
    await page.waitForTimeout(1300);
    const apres = await page.evaluate(() => document.querySelectorAll('.barre-defilement.visible').length);
    verifier(apres === 0, 'à l\'arrêt : la poignée disparaît (' + apres + ')');
    // Saisie de la poignée : glisser vers le bas fait défiler #app.
    await page.evaluate(() => { document.getElementById('app').scrollTop = 0; }); await page.waitForTimeout(120);
    const r = await page.evaluate(() => { const p = document.querySelector('.barre-defilement-v.visible.utile'); const b = p.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + 10 }; });
    await page.mouse.move(r.x, r.y); await page.mouse.down(); await page.mouse.move(r.x, r.y + 80, { steps: 4 }); await page.mouse.up();
    const glisse = await page.evaluate(() => document.getElementById('app').scrollTop);
    verifier(glisse > 40, 'poignée saisie et glissée : la page défile (' + glisse + ')');
    // Débordement horizontal de .scroller : poignée horizontale au bas de la partie visible.
    await page.setViewportSize({ width: 1000, height: 420 }); await page.evaluate(() => basculerDeuxSemaines()); await page.waitForTimeout(500);
    const h = await page.evaluate(async () => {
      const s = document.querySelector('.scroller');
      if (s.scrollWidth - s.clientWidth <= 2) return 'pas de débordement';
      s.scrollLeft = 30; await new Promise((f) => setTimeout(f, 100));
      const p = [...document.querySelectorAll('.barre-defilement-h.visible.utile')][0];
      if (!p) return null;
      const b = p.getBoundingClientRect();
      return { dansEcran: b.bottom <= innerHeight && b.top >= 0, l: Math.round(b.height) };
    });
    verifier(h && h.dansEcran && h.l <= 8, 'défilement horizontal du planning : poignée horizontale fine, dans l\'écran (' + JSON.stringify(h) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 5. Téléphone ----------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, bd: BD });
    await page.evaluate(() => afficherPage('notes')); await page.waitForTimeout(500);
    const deb = await page.evaluate(() => {
      const pg = document.getElementById('page-notes');
      return [...pg.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).map((e) => e.className).slice(0, 4);
    });
    verifier(deb.length === 0 && (await lignesNotes(page))[0].split(' | ').length === 2, '390 px : page Notes sans débordement, 2 lignes à venir (' + JSON.stringify(deb) + ')');
    if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/s65-notes-390.png', fullPage: true });
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
