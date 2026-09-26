const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 26.09.2026 (suite 64). Lionel :
//   « Setup affichage planning : Proposer divers option d'affichage des
//     dates. afficher ou non les heures de travaille. Afficher ou non la
//     ligne des horaires, pouvoir choisir entre horaire ou M|A. Colorier ou
//     non les colonnes matin ou après-midi. Entre 2 semaines, proposer
//     espace ou rien. plus de ligne épaisse. Coins du planning arrondi ou
//     carré. Afficher statuts: non, pastille, badge. taille du texte
//     planning. police pour l'ensemble du document »
//   « Setup couleur : Enlever thème classique. Enlever le choix de la
//     couleur du statuts à confirmé, déjà dans les statuts. Ajoute d'autres
//     thèmes. Aperçu sur la page aussi »
//   « Ajouter les touches souris aux raccourcis »
// Vérifie :
//   1. Affichage : nom du jour et format de date (dont « 1er »), heures de
//      travail, ligne des horaires (horaires, M | A, masquée), colonnes
//      teintées (aucune, matin, après-midi), cadre carré, statut en
//      pastille, texte très grand, police — planning ET aperçu ;
//   2. Couleurs : plus de « Classique » ni de couleur « confirmé », les
//      nouveaux thèmes, l'aperçu sur la page qui suit le thème et prend la
//      couleur du statut ;
//   3. Raccourcis : boutons précédent/suivant de la souris = semaines (le
//      navigateur ne recule pas), un bouton attribué à la souris sur la
//      page, la liste des gestes de la souris.
//
// Lancer : node test_suite64.js   (CAPTURES=dossier pour les captures)

const T = (id, pid, date, demi, texte, st) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1, statut_id: st || null });
const H = (id, du, au, md, mf, ad, af) => ({ id, date_debut: du, date_fin: au, matin_debut: md + ':00', matin_fin: mf + ':00', aprem_debut: ad + ':00', aprem_fin: af + ':00', pause_matin: 15 });
const BD = {
  horaires: [H(1, '2026-09-01', '2026-10-31', '07:00', '12:00', '13:00', '17:00')],
  statuts: [{ id: 1, cle: 'confirme', nom: 'Confirmé', couleur: '#f7e6ab', ordre: 1 }],
  taches: [T(1, 1, '2026-09-24', 'matin', 'Bétonnage dalle'), T(2, 2, '2026-09-24', 'matin', 'Armature dalle', 1)]
};
const attrs = (page) => page.evaluate(() => [...document.documentElement.attributes].filter((a) => a.name.indexOf('data-aff-') === 0).map((a) => a.name.slice(9) + '=' + a.value).sort().join(' '));
const pastille = async (page, id, v) => { await page.click('#page-affichage .choix-pastille[data-option="' + id + '"][data-valeur="' + v + '"]'); await page.waitForTimeout(200); };
// Mesure sur le vrai planning (la page Affichage reste ouverte).
const auPlanning = (page, f, arg) => page.evaluate(([src, a]) => { afficherPage('planning'); const r = (0, eval)(src)(a); afficherPage('affichage'); return r; }, [f.toString(), arg]);
const entete = (iso) => { const th = [...document.querySelectorAll('.th[data-gi]:not(.th-demi)')].find((t) => isoDeGi(+t.dataset.gi) === iso);
  return th ? { nom: (th.querySelector('.th-jour') || {}).textContent || '', date: (th.querySelector('.th-date') || {}).textContent, duree: !!th.querySelector('.th-duree') } : null; };
const semaine = (page) => page.evaluate(() => etat.semaines[etat.indexSemaine].debut);
const combos = (page, id) => page.$$eval('.ligne-raccourci[data-action="' + id + '"] .rc-combo', (cs) => cs.map((c) => c.dataset.combo));
// Bouton de souris « à la main » (Playwright ne connaît que gauche/milieu/droit).
const souris = (page, type, button, opts) => page.evaluate(([t, b, o]) => {
  const ev = new MouseEvent(t, Object.assign({ bubbles: true, cancelable: true, button: b }, o || {}));
  (document.querySelector('.grille-cadre') || document.body).dispatchEvent(ev);
  return ev.defaultPrevented;
}, [type, button, opts]);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Affichage --------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD });
    await page.evaluate(() => basculerDeuxSemaines()); await page.waitForTimeout(400);
    const e0 = await page.evaluate((src) => (0, eval)(src)('2026-09-24'), entete.toString());
    verifier(JSON.stringify(e0) === '{"nom":"Jeu","date":"24","duree":true}', 'à l\'origine : « Jeu 24 » et la durée de travail (' + JSON.stringify(e0) + ')');
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(250);
    const groupes = await page.evaluate(() => [...document.querySelectorAll('#page-affichage .titre-liste')].map((h) => h.textContent).join('|'));
    verifier(groupes === 'Planning|Dates|Bulles|Police|À l’ouverture', 'page Affichage : groupes Planning, Dates, Bulles, Police, À l’ouverture (' + groupes + ')');

    // Dates
    const essais = [['jourSemaine', 'complet', 'formatDate', 'complet', '2026-09-24', 'Jeudi', '24 septembre'],
      ['jourSemaine', 'initiale', 'formatDate', 'abrege', '2026-10-01', 'J', '1er oct.'],
      ['jourSemaine', 'masque', 'formatDate', 'chiffres', '2026-10-01', '', '01.10']];
    for (const [o1, v1, o2, v2, iso, nom, date] of essais) {
      await pastille(page, o1, v1); await pastille(page, o2, v2);
      const e = await auPlanning(page, entete, iso);
      const ap = await page.evaluate(() => { const t = document.querySelector('#apercuAffichage .aa-th'); return [(t.querySelector('.aa-jour') || { textContent: '' }).textContent, t.querySelector('.aa-date').textContent]; });
      verifier(e && e.nom === nom && e.date === date && ap[0] === nom && ap[1] === (iso === '2026-10-01' ? date.replace('1er', '24').replace('01.10', '24.09').replace('oct.', 'sept.') : date), 'dates « ' + v1 + ' / ' + v2 + ' » : ' + iso + ' → « ' + [nom, date].join(' ').trim() + ' » (' + JSON.stringify(e) + ', aperçu ' + ap.join(' ') + ')');
    }
    // Heures de travail
    await page.click('#page-affichage .reglage-ligne[data-option="heures"] .interrupteur'); await page.waitForTimeout(200);
    const sansH = await auPlanning(page, () => document.querySelectorAll('.th-duree').length);
    const apH = await page.evaluate(() => document.querySelectorAll('#apercuAffichage .aa-duree').length);
    verifier(sansH === 0 && apH === 0, 'heures de travail masquées : plus de durée, planning et aperçu (' + sansH + ', ' + apH + ')');
    // Ligne des horaires
    const demi = () => { const d = [...document.querySelectorAll('.th.th-demi:not(.coin):not(.th-weekend)')]; return { n: d.length, txt: d.slice(0, 2).map((x) => x.textContent.trim()).join('|') }; };
    const d0 = await auPlanning(page, demi);
    await pastille(page, 'ligneDemi', 'ma');
    const dMA = await auPlanning(page, demi);
    const apMA = await page.evaluate(() => [...document.querySelectorAll('#apercuAffichage .aa-demi:not(.aa-coin):not(.aa-we)')].slice(0, 2).map((x) => x.textContent).join('|'));
    await pastille(page, 'ligneDemi', 'masquee');
    const dM = await auPlanning(page, demi);
    const apM = await page.evaluate(() => document.querySelectorAll('#apercuAffichage .aa-demi').length);
    verifier(/\d\d:\d\d/.test(d0.txt) && dMA.txt === 'M|A' && apMA === 'M|A' && dM.n === 0 && apM === 0,
      'ligne des horaires : horaires, puis « M | A », puis masquée — planning et aperçu (' + JSON.stringify([d0, dMA, apMA, dM, apM]) + ')');
    await pastille(page, 'ligneDemi', 'horaires');
    // Colonnes teintées
    const fonds = () => { const c = (d) => getComputedStyle(document.querySelector('.cell.cell-personne.cell-' + d + ':not(.cell-auj):not(.ligne-alt):not(.selection-add)')).backgroundColor; return { matin: c('matin'), aprem: c('aprem') }; };
    const tAprem = await auPlanning(page, fonds);
    await pastille(page, 'teinte', 'aucune');
    const tAucune = await auPlanning(page, fonds);
    await pastille(page, 'teinte', 'matin');
    const tMatin = await auPlanning(page, fonds);
    const apT = await page.evaluate(() => { const c = (d) => getComputedStyle(document.querySelector('#apercuAffichage .aa-cell.aa-' + d)).backgroundColor; return { matin: c('matin'), aprem: c('aprem') }; });
    verifier(tAprem.matin !== tAprem.aprem && tAucune.matin === tAucune.aprem && tMatin.matin !== tMatin.aprem && tMatin.aprem === tAucune.aprem && apT.matin !== apT.aprem,
      'colonnes teintées : après-midi (origine), aucune, matin — planning et aperçu (' + JSON.stringify([tAprem, tAucune, tMatin, apT]) + ')');
    // Cadre carré
    await page.click('#page-affichage .reglage-ligne[data-option="cadre"] .interrupteur'); await page.waitForTimeout(200);
    const cadre = await auPlanning(page, () => getComputedStyle(document.querySelector('.grille-cadre')).borderTopLeftRadius);
    const apCadre = await page.evaluate(() => getComputedStyle(document.querySelector('#apercuAffichage .aa-cadre')).borderTopLeftRadius);
    verifier(cadre === '0px' && apCadre === '0px', 'coins du planning carrés : planning et aperçu (' + cadre + ', ' + apCadre + ')');
    // Statut en pastille
    await pastille(page, 'statut', 'pastille');
    const st = await auPlanning(page, () => { const b = document.querySelector('.bulle .b-statut'), r = b.getBoundingClientRect(); return { pos: getComputedStyle(b).position, l: Math.round(r.width), h: Math.round(r.height), fond: getComputedStyle(b).backgroundColor }; });
    verifier(st.pos === 'absolute' && st.l === 9 && st.h === 9 && st.fond === 'rgb(247, 230, 171)', 'statut en pastille : un point de sa couleur dans le coin (' + JSON.stringify(st) + ')');
    // Texte très grand
    await pastille(page, 'texte', 'tresgrand');
    const tg = await auPlanning(page, () => getComputedStyle(document.querySelector('.bulle .b-txt')).fontSize);
    verifier(tg === '15px' && (await page.evaluate(() => getComputedStyle(document.querySelector('#apercuAffichage .aa-txt')).fontSize)) === '15px', 'texte « Très grand » : 15 px, planning et aperçu (' + tg + ')');
    // Police de tout le document
    await pastille(page, 'police', 'inter');
    const pol = await page.evaluate(() => ({ corps: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g, ''), mono: getComputedStyle(document.querySelector('#apercuAffichage .aa-date')).fontFamily.split(',')[0].replace(/["']/g, ''),
      lien: !!document.querySelector('link[data-polices]'), pastilles: getComputedStyle(document.querySelector('.choix-pastille[data-option="police"][data-valeur="roboto"]')).fontFamily.split(',')[0].replace(/["']/g, '') }));
    verifier(pol.corps === 'Inter' && pol.mono === 'Inter' && pol.lien && pol.pastilles === 'Roboto', 'police « Inter » : tout le document (chiffres compris), chaque pastille dans sa police (' + JSON.stringify(pol) + ')');
    if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/s64-affichage.png', fullPage: false });
    const a = await attrs(page);
    verifier(a === 'cadre=carres police=inter statut=pastille teinte=matin texte=tresgrand', 'attributs posés seulement pour ce qui change (' + a + ')');
    await page.waitForTimeout(600);
    const bd = await page.evaluate(() => { const r = (__BD.reglages || []).find((x) => x.cle === 'affichage'); return r ? Object.keys(r.valeur).sort().join(',') : ''; });
    verifier(bd === 'cadre,formatDate,heures,jourSemaine,police,statut,teinte,texte', 'enregistré sur le compte (' + bd + ')');
    // Tout rétablir : police d'origine, plus de variable.
    await page.click('#btnAffichageDefaut'); await page.waitForTimeout(400);
    verifier((await attrs(page)) === '' && await page.evaluate(() => !document.documentElement.style.getPropertyValue('--police') && getComputedStyle(document.body).fontFamily.indexOf('Archivo') >= 0), '« Tout rétablir » : Archivo et tout le reste d\'origine');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. Couleurs ----------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: Object.assign({ couleurs_perso: [] }, BD) });
    await page.evaluate(() => afficherPage('couleurs')); await page.waitForTimeout(250);
    const c = await page.evaluate(() => {
      const sel = document.getElementById('selThemeCouleurs'), ap = document.querySelector('#apercuCouleursPage .apercu-couleurs');
      return { options: [...sel.options].filter((o) => !o.hidden).map((o) => o.value).join(','), valeur: sel.value, texte: sel.selectedOptions[0].textContent,
        apercu: !!ap && ap.getBoundingClientRect().height > 150, statut: ap && ap.querySelector('.ac-statut').textContent, fondStatut: ap && getComputedStyle(ap.querySelector('.ac-statut')).backgroundColor,
        groupe: GROUPES_COULEURS.some((g) => g.id === 'statut-confirme') };
    });
    verifier(c.options === 'mes-couleurs,ardoise,foret,terre-cuite,contraste,ocean,lavande,sable,bordeaux,chantier,graphite,origine' && c.valeur === 'origine' && c.texte === 'Couleurs d’origine',
      'liste des thèmes : plus de « Classique », 6 nouveaux, « Couleurs d’origine » affiché sans couleur enregistrée (' + JSON.stringify(c) + ')');
    verifier(c.apercu && c.statut === 'Confirmé' && c.fondStatut === 'rgb(247, 230, 171)' && !c.groupe,
      'aperçu sur la page, badge à la couleur du statut « Confirmé » de la page Statuts, plus de réglage « confirmé » (' + JSON.stringify(c) + ')');
    await page.selectOption('#selThemeCouleurs', 'bordeaux'); await page.waitForTimeout(300);
    const b = await page.evaluate(() => ({ onglet: getComputedStyle(document.querySelector('#apercuCouleursPage .ac-onglet.ac-actif')).color, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      bd: __BD.couleurs_perso.map((r) => r.id).sort().join(',') }));
    verifier(b.accent === '#7c213f' && b.onglet === 'rgb(124, 33, 63)' && b.bd === 'fond,onglet-fond,principale,weekend', 'thème « Bordeaux » : l\'aperçu de la page suit, enregistré (' + JSON.stringify(b) + ')');
    await page.click('#btnPersonnaliserCouleurs'); await page.waitForSelector('.couleurs-modal');
    const m = await page.evaluate(() => [...document.querySelectorAll('.couleurs-modal .reglage-couleurs-groupe b')].map((x) => x.textContent).filter((t) => /statut|confirm/i.test(t)).length);
    verifier(m === 0, 'Personnaliser : plus de ligne « Statut confirmé » (' + m + ')');
    if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/s64-couleurs.png' });
    await page.keyboard.press('Escape');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  {
    // Téléphone : l'aperçu tient dans l'écran.
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, bd: BD });
    await page.evaluate(() => afficherPage('couleurs')); await page.waitForTimeout(250);
    const t = await page.evaluate(() => ({ large: document.documentElement.scrollWidth, ap: Math.round(document.querySelector('#apercuCouleursPage .apercu-couleurs').getBoundingClientRect().right) }));
    verifier(t.large <= 390 && t.ap <= 390, 'téléphone : aperçu de la page Couleurs sans débordement (' + JSON.stringify(t) + ')');
    if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/s64-couleurs-390.png' });
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Souris dans les raccourcis -----------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD });
    const s0 = await semaine(page);
    const bloqueBas = await souris(page, 'mousedown', 3), bloqueHaut = await souris(page, 'mouseup', 3), bloqueAux = await souris(page, 'auxclick', 3);
    const s1 = await semaine(page);
    await souris(page, 'mousedown', 4); await souris(page, 'mouseup', 4);
    const s2 = await semaine(page);
    verifier(s0 === '2026-09-21' && s1 === '2026-09-14' && s2 === '2026-09-21' && bloqueBas && bloqueHaut && bloqueAux,
      'bouton « précédent » de la souris : semaine précédente, sans « Page précédente » du navigateur ; « suivant » : semaine suivante (' + [s0, s1, s2, bloqueBas, bloqueHaut].join(', ') + ')');
    const libre = await souris(page, 'mousedown', 1);
    await souris(page, 'mouseup', 1);
    verifier(!libre, 'bouton du milieu sans raccourci : effet normal gardé');

    await page.evaluate(() => afficherPage('raccourcis')); await page.waitForTimeout(200);
    const l = await page.evaluate(() => ({
      prec: [...document.querySelectorAll('.ligne-raccourci[data-action="semainePrecedente"] kbd')].map((k) => k.textContent + (k.classList.contains('kbd-souris') && k.querySelector('svg') ? '🖱' : '')).join(' '),
      gestes: document.querySelectorAll('.liste-gestes-souris .ligne-raccourci').length,
      titres: [...document.querySelectorAll('#listeRaccourcis .titre-liste')].map((h) => h.textContent).join('|'),
      sous: document.querySelector('#page-raccourcis .page-sous').textContent
    }));
    verifier(l.prec === 'P Souris précédent🖱' && l.gestes === 9 && /\|Souris$/.test(l.titres) && /souris/.test(l.sous),
      'page Raccourcis : bouton de souris avec sa petite souris, section « Souris » des gestes (' + JSON.stringify(l) + ')');
    await page.click('.ligne-raccourci[data-action="pageChantiers"] .rc-ajouter');
    const invite = await page.textContent('.ligne-raccourci[data-action="pageChantiers"] .rc-capture');
    const prise = await souris(page, 'mousedown', 1, { ctrlKey: true });
    await souris(page, 'mouseup', 1, { ctrlKey: true });
    await page.waitForTimeout(600);
    const bdR = await page.evaluate(() => { const r = (__BD.reglages || []).find((x) => x.cle === 'raccourcis'); return r ? JSON.stringify(r.valeur) : ''; });
    verifier(/souris/.test(invite) && prise && (await combos(page, 'pageChantiers')).join() === 'Ctrl+Clic milieu' && bdR === '{"pageChantiers":["Ctrl+Clic milieu"]}',
      '« + » puis Ctrl + bouton du milieu : attribué à la page Chantiers, enregistré (' + invite + ' ; ' + bdR + ')');
    if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/s64-raccourcis.png', fullPage: true });
    await page.evaluate(() => afficherPage('planning')); await page.waitForTimeout(200);
    await souris(page, 'mousedown', 1, { ctrlKey: true }); await souris(page, 'mouseup', 1, { ctrlKey: true });
    verifier(await page.evaluate(() => document.getElementById('page-chantiers').classList.contains('actif')), 'Ctrl + bouton du milieu ouvre la page Chantiers');
    // Hors du planning, les boutons de côté ne changent pas de semaine (et gardent leur effet).
    const avant = await semaine(page);
    const libre2 = await souris(page, 'mousedown', 3);
    verifier(await semaine(page) === avant && !libre2, 'hors du planning : bouton « précédent » sans effet sur les semaines');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
