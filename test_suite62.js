const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 26.09.2026 (suite 62). Lionel :
//   « une bande blanche me dérange tout en bas du tableau » (capture)
//   « Ajouter d'autre options d'affichages avec aperçu. »
// Vérifie :
//   1. plus de bande sous la dernière ligne : le cadre se referme pile
//      dessous (ordinateur 1920 et 1400 en 2 semaines, téléphone) ;
//   2. page Affichage : les 18 réglages (suite 64 : 11 → 18), à l'origine rien ne change
//      (aucun attribut, mêmes tailles qu'avant), aperçu présent ;
//   3. chaque réglage, choisi à la souris ou au clavier, change le vrai
//      planning ET l'aperçu, et s'enregistre (compte + appareil) ;
//   4. relecture à l'ouverture (compte, ou copie de l'appareil si la table
//      ne répond pas) : style, week-ends, vue d'ouverture ;
//   5. « Tout rétablir », touche W.
//
// Lancer : node test_suite62.js

const T = (id, pid, date, demi, texte, st) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1, statut_id: st || null });
const BD = {
  statuts: [{ id: 1, cle: 'confirme', nom: 'confirmé', couleur: '#cdf1ea', ordre: 1 }],
  taches: [T(1, 1, '2026-09-24', 'matin', 'Bétonnage dalle piliers et muret de l’extension côté jardin nord'), T(2, 2, '2026-09-24', 'matin', 'Armature dalle', 1),
    T(3, 1, '2026-09-29', 'matin', 'Coffrage piliers')]
};
const reglageBd = (page) => page.evaluate(() => { const r = (window.__BD.reglages || []).find((x) => x.cle === 'affichage'); return r ? r.valeur : null; });
const local = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('planning.affichage') || 'null'));
const attrs = (page) => page.evaluate(() => [...document.documentElement.attributes].filter((a) => a.name.indexOf('data-aff-') === 0).map((a) => a.name.slice(9) + '=' + a.value).sort().join(' '));
const pastille = (page, id, v) => page.click('#page-affichage .choix-pastille[data-option="' + id + '"][data-valeur="' + v + '"]');
// Suite 67 : séparation, coins du planning et des bulles sont des interrupteurs.
const basculer = (page, id) => page.click('#page-affichage .reglage-ligne[data-option="' + id + '"] .interrupteur');
const style = (page, sel, prop) => page.evaluate(([s, p]) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[p] : null; }, [sel, prop]);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Plus de bande blanche sous le tableau -------------------------
  for (const [largeur, hauteur, tactile, deux] of [[1920, 1080, false, false], [1400, 900, false, true], [390, 844, true, false]]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: hauteur }, hasTouch: tactile, bd: BD });
    if (deux) { await page.evaluate(() => basculerDeuxSemaines()); await page.waitForTimeout(400); }
    const m = await page.evaluate(() => {
      const cadre = document.querySelector('.grille-cadre'), sc = cadre.querySelector('.scroller');
      const bas = [...sc.querySelectorAll('.grille > *')].reduce((x, e) => Math.max(x, e.getBoundingClientRect().bottom), 0);
      return { ecart: Math.round((cadre.getBoundingClientRect().bottom - 1 - bas) * 10) / 10, pad: getComputedStyle(sc).paddingBottom };
    });
    verifier(m.ecart <= 0.5 && m.pad === '0px', largeur + ' px' + (deux ? ', 2 semaines' : '') + ' : le cadre se referme pile sous la dernière ligne (' + JSON.stringify(m) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2 et 3. Page Affichage, chaque réglage ---------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD });
    // À l'origine : rien de changé.
    const origine = await page.evaluate(() => ({
      txt: getComputedStyle(document.querySelector('.bulle .b-txt')).fontSize, rayon: getComputedStyle(document.querySelector('.bulle .b-carte')).borderTopLeftRadius,
      haut: getComputedStyle(document.querySelector('.cell.cell-personne')).minHeight, statut: getComputedStyle(document.querySelector('.bulle .b-statut')).display,
      auj: document.querySelectorAll('.cell.cell-auj').length, fondAuj: getComputedStyle(document.querySelector('.cell.cell-auj')).backgroundImage,
      alt: getComputedStyle(document.querySelector('.cell.ligne-alt')).backgroundImage, we: afficherWeekends
    }));
    verifier((await attrs(page)) === '' && origine.txt === '12px' && origine.rayon === '9px' && origine.haut === '52px' && origine.statut !== 'none' &&
      origine.fondAuj === 'none' && origine.alt === 'none' && !origine.we, 'à l\'origine : aucun attribut, planning inchangé (' + JSON.stringify(origine) + ')');
    await page.evaluate(() => {
      afficherPage('affichage');
      // Mesure faite planning affiché (hauteurs nulles sinon), puis retour.
      window.vuPlanning = (f) => { afficherPage('planning'); const r = f(); afficherPage('affichage'); return r; };
    });
    await page.waitForTimeout(250);
    const page0 = await page.evaluate(() => ({
      options: [...document.querySelectorAll('#page-affichage .reglage-ligne[data-option]')].map((l) => l.dataset.option).join(','),
      actifs: [...document.querySelectorAll('#page-affichage .choix-pastille.actif')].map((b) => b.dataset.option + '=' + b.dataset.valeur).join(','),
      inter: ['separation', 'cadre', 'coins'].filter((id) => document.getElementById('chkAff-' + id).checked).join(','),
      we: document.getElementById('chkWeekends').checked, statut: document.getElementById('chkAff-heures').checked,
      reset: document.getElementById('btnAffichageDefaut').hidden,
      noms: [...document.querySelectorAll('#apercuAffichage .aa-nom')].map((n) => n.textContent).join(','),
      jours: [...document.querySelectorAll('#apercuAffichage .aa-th')].map((n) => n.querySelector('.aa-jour').textContent + ' ' + n.querySelector('.aa-date').textContent).join(','),
      seps: [...document.querySelectorAll('#apercuAffichage .sep-semaines')].filter((s) => !s.hidden).length
    }));
    verifier(page0.options === 'weekends,auj,zebre,teinte,separation,cadre,noms,jourSemaine,formatDate,heures,ligneDemi,texte,lignes,hauteur,coins,statut,police,vueOrdi,vueTel',
      'page Affichage : les 19 réglages (' + page0.options + ')');
    verifier(page0.actifs === 'teinte=aprem,noms=normal,jourSemaine=abrege,formatDate=numero,ligneDemi=horaires,texte=normal,lignes=2,hauteur=normale,statut=badge,police=archivo,vueOrdi=1,vueTel=jour' && page0.inter === 'separation,cadre,coins' && !page0.we && page0.statut && page0.reset,
      'valeurs d\'origine affichées, « Tout rétablir » caché (' + page0.actifs + ')');
    verifier(page0.noms === 'Lionel,Mathis,Antoine' && page0.jours === 'Jeu 24,Ven 25,Lun 28,Mar 29' && page0.seps === 2,
      'aperçu : 3 personnes, Jeu Ven | Lun Mar, espace entre les semaines (' + JSON.stringify(page0) + ')');
    // Espace de l'aperçu : 5 px à gauche du lundi, 8 px de large, comme le planning.
    const sepAp = await page.evaluate(() => {
      const lun = document.querySelector('#apercuAffichage .aa-th.aa-lun').getBoundingClientRect(), s = document.querySelector('#apercuAffichage .sep-semaines').getBoundingClientRect();
      return { ecart: Math.round(s.left - lun.left), large: Math.round(s.width) };
    });
    verifier(sepAp.ecart === -5 && sepAp.large === 8, 'aperçu : espace posé comme dans le planning (' + JSON.stringify(sepAp) + ')');

    // Taille du texte
    await pastille(page, 'texte', 'grand'); await page.waitForTimeout(150);
    verifier((await style(page, '.bulle .b-txt', 'fontSize')) === '13.5px' && (await style(page, '#apercuAffichage .aa-txt', 'fontSize')) === '13.5px' && (await attrs(page)) === 'texte=grand',
      'texte « Grand » : planning et aperçu à 13,5 px');
    await pastille(page, 'texte', 'petit'); await page.waitForTimeout(150);
    verifier((await style(page, '.bulle .b-txt', 'fontSize')) === '11px' && (await style(page, '#apercuAffichage .aa-txt', 'fontSize')) === '11px', 'texte « Petit » : 11 px');
    // Lignes de texte
    await pastille(page, 'lignes', '1'); await page.waitForTimeout(150);
    const l1 = await page.evaluate(() => vuPlanning(() => ({ p: getComputedStyle([...document.querySelectorAll('.bulle .b-txt')].find((e) => e.textContent.indexOf('Bétonnage') === 0)).webkitLineClamp, a: getComputedStyle(document.querySelector('#apercuAffichage .aa-txt')).webkitLineClamp, h: [...document.querySelectorAll('.bulle .b-txt')].find((e) => e.textContent.indexOf('Bétonnage') === 0).getBoundingClientRect().height })));
    await pastille(page, 'lignes', '3'); await page.waitForTimeout(150);
    const l3 = await page.evaluate(() => vuPlanning(() => ({ p: getComputedStyle([...document.querySelectorAll('.bulle .b-txt')].find((e) => e.textContent.indexOf('Bétonnage') === 0)).webkitLineClamp, h: [...document.querySelectorAll('.bulle .b-txt')].find((e) => e.textContent.indexOf('Bétonnage') === 0).getBoundingClientRect().height })));
    verifier(l1.p === '1' && l1.a === '1' && l3.p === '3' && l3.h > l1.h * 2, 'lignes de texte 1 puis 3 : le long texte passe de 1 à 3 lignes (' + JSON.stringify([l1, l3]) + ')');
    // Hauteur des lignes
    await pastille(page, 'hauteur', 'serree'); await page.waitForTimeout(250);
    const hs = await page.evaluate(() => vuPlanning(() => ({ c: getComputedStyle(document.querySelector('.cell.cell-personne')).minHeight, a: getComputedStyle(document.querySelector('#apercuAffichage .aa-cell')).minHeight, lbl: document.querySelector('.lbl-compacte').getBoundingClientRect().height })));
    await pastille(page, 'hauteur', 'aeree'); await page.waitForTimeout(250);
    const ha = await page.evaluate(() => vuPlanning(() => ({ c: getComputedStyle(document.querySelector('.cell.cell-personne')).minHeight, a: getComputedStyle(document.querySelector('#apercuAffichage .aa-cell')).minHeight, lbl: document.querySelector('.lbl-compacte').getBoundingClientRect().height })));
    verifier(hs.c === '34px' && hs.a === '34px' && ha.c === '66px' && ha.a === '66px' && ha.lbl > hs.lbl, 'hauteur serrée puis aérée : cases 34 puis 66 px, planning et aperçu (' + JSON.stringify([hs, ha]) + ')');
    // Coins
    await basculer(page, 'coins'); await page.waitForTimeout(150);
    verifier((await style(page, '.bulle .b-carte', 'borderTopLeftRadius')) === '2px' && (await style(page, '#apercuAffichage .aa-carte', 'borderTopLeftRadius')) === '2px', 'coins droits : planning et aperçu');
    // Statut (suite 64 : Non / Pastille / Badge)
    await pastille(page, 'statut', 'non'); await page.waitForTimeout(150);
    verifier((await style(page, '.bulle .b-statut', 'display')) === 'none' && (await style(page, '#apercuAffichage .aa-statut', 'display')) === 'none', 'statut masqué : planning et aperçu');
    // Aujourd'hui
    await page.click('#page-affichage .reglage-ligne[data-option="auj"]'); await page.waitForTimeout(150);
    const auj = await page.evaluate(() => {
      const aujs = [...document.querySelectorAll('.cell.cell-auj')];
      return { n: aujs.length, jours: [...new Set(aujs.map((c) => isoDeGi(+c.dataset.jour)))].join(','), fond: getComputedStyle(aujs[0]).backgroundImage !== 'none',
        autre: getComputedStyle(document.querySelector('.cell.cell-personne:not(.cell-auj):not(.ligne-alt)')).backgroundImage, ap: getComputedStyle(document.querySelector('#apercuAffichage .aa-cell.aa-auj')).backgroundImage !== 'none' };
    });
    verifier(auj.n > 0 && auj.jours === '2026-09-24' && auj.fond && auj.autre === 'none' && auj.ap, 'aujourd\'hui surligné : seule la colonne du 24, planning et aperçu (' + JSON.stringify(auj) + ')');
    // Lignes alternées
    await page.click('#page-affichage .reglage-ligne[data-option="zebre"]'); await page.waitForTimeout(150);
    const zb = await page.evaluate(() => ({
      mathis: getComputedStyle(document.querySelector('.cell.cell-personne[data-personne="2"]:not(.cell-auj)')).backgroundImage !== 'none',
      lionel: getComputedStyle(document.querySelector('.cell.cell-personne[data-personne="1"]:not(.cell-auj)')).backgroundImage,
      lbl: document.querySelectorAll('.lbl.ligne-alt').length > 0,
      deux: getComputedStyle(document.querySelector('.cell.cell-personne[data-personne="2"].cell-auj')).backgroundImage.split('linear-gradient').length - 1,
      ap: getComputedStyle(document.querySelectorAll('#apercuAffichage .aa-nom')[1]).backgroundImage !== 'none'
    }));
    verifier(zb.mathis && zb.lionel === 'none' && zb.lbl && zb.deux === 2 && zb.ap, 'lignes alternées : Mathis teinté, pas Lionel ; avec aujourd\'hui, les 2 teintes (' + JSON.stringify(zb) + ')');
    // Week-ends
    await page.click('#page-affichage .reglage-ligne[data-option="weekends"]'); await page.waitForTimeout(300);
    const we = await page.evaluate(() => ({ v: afficherWeekends, cases: document.querySelectorAll('.cell.case-weekend').length, ap: [...document.querySelectorAll('#apercuAffichage .aa-th')].map((n) => n.querySelector('.aa-jour').textContent + ' ' + n.querySelector('.aa-date').textContent).join(',') }));
    verifier(we.v && we.cases > 0 && we.ap === 'Jeu 24,Ven 25,Sam 26,Dim 27,Lun 28,Mar 29', 'week-ends affichés : planning et aperçu (' + JSON.stringify(we) + ')');
    // Séparation (en 2 semaines)
    await page.evaluate(() => basculerDeuxSemaines()); await page.waitForTimeout(400);
    const avantTrait = await page.evaluate(() => document.querySelectorAll('#racine .sep-semaines').length);
    // Suite 64 : « Espace ou rien », plus de trait épais.
    await basculer(page, 'separation'); await page.waitForTimeout(300);
    const trait = await page.evaluate(() => ({ seps: document.querySelectorAll('#racine .sep-semaines').length, bord: getComputedStyle(document.querySelector('.cell.sem-frontiere')).borderLeftWidth,
      ap: document.querySelectorAll('#apercuAffichage .sep-semaines').length, apBord: getComputedStyle(document.querySelector('#apercuAffichage .aa-th.aa-lun')).borderLeftWidth }));
    verifier(avantTrait === 2 && trait.seps === 0 && trait.bord === '0px' && trait.ap === 0 && trait.apBord === '0px', 'espace entre 2 semaines éteint : ni espace ni trait, planning et aperçu (' + JSON.stringify(trait) + ')');
    // Clavier : Espace sur l'interrupteur (suite 67 ; avant : flèche dans les pastilles)
    await page.focus('#chkAff-separation');
    await page.keyboard.press('Space'); await page.waitForTimeout(300);
    const cl = await page.evaluate(() => ({ v: optionAffichage('separation'), focus: document.activeElement.id, seps: document.querySelectorAll('#racine .sep-semaines').length }));
    verifier(cl.v === 'espace' && cl.focus === 'chkAff-separation' && cl.seps === 2, 'clavier : Espace rallume l\'espace entre semaines (' + JSON.stringify(cl) + ')');
    // Vue d'ouverture : enregistrée, rien ne bouge maintenant.
    await pastille(page, 'vueOrdi', '2'); await pastille(page, 'vueTel', 'semaine');
    await page.waitForTimeout(700);
    const attendu = { texte: 'petit', lignes: '3', hauteur: 'aeree', coins: 'droits', statut: 'non', auj: 'oui', zebre: 'oui', weekends: 'oui', vueOrdi: '2', vueTel: 'semaine' };
    const bd = await reglageBd(page), lc = await local(page);
    verifier(JSON.stringify(bd) === JSON.stringify(attendu) && JSON.stringify(lc) === JSON.stringify(attendu),
      'enregistré sur le compte et l\'appareil, seulement ce qui change (' + JSON.stringify(bd) + ')');
    verifier(!(await page.evaluate(() => document.getElementById('btnAffichageDefaut').hidden)), '« Tout rétablir » visible');
    // Tout rétablir
    await page.click('#btnAffichageDefaut'); await page.waitForTimeout(700);
    const rz = await page.evaluate(() => ({ we: afficherWeekends, cases: document.querySelectorAll('.cell.case-weekend').length, reset: document.getElementById('btnAffichageDefaut').hidden,
      txt: getComputedStyle(document.querySelector('.bulle .b-txt')).fontSize }));
    verifier((await attrs(page)) === '' && !rz.we && rz.cases === 0 && rz.reset && rz.txt === '12px' && JSON.stringify(await reglageBd(page)) === '{}',
      '« Tout rétablir » : tout revient à l\'origine, compte vidé (' + JSON.stringify(rz) + ')');
    // Touche W : week-ends, retenus.
    await page.evaluate(() => afficherPage('planning')); await page.waitForTimeout(200);
    await page.keyboard.press('w'); await page.waitForTimeout(700);
    verifier(await page.evaluate(() => afficherWeekends) && JSON.stringify(await reglageBd(page)) === '{"weekends":"oui"}', 'touche W : week-ends affichés et retenus');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Relecture à l'ouverture ----------------------------------------
  const valeur = { texte: 'grand', auj: 'oui', weekends: 'oui', vueOrdi: '2', vueTel: 'semaine', separation: 'trait' };
  for (const [largeur, hauteur, tactile] of [[1400, 900, false], [390, 844, true]]) {
    const lieu = largeur + ' px';
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: hauteur }, hasTouch: tactile, bd: Object.assign({ reglages: [{ cle: 'affichage', valeur, maj: '2026-09-24T10:00:00Z' }] }, BD) });
    const r = await page.evaluate(() => ({ deux: deuxSemaines, jour: vueJourMobile, we: afficherWeekends, cases: document.querySelectorAll('.cell.case-weekend').length,
      txt: getComputedStyle(document.querySelector('.bulle .b-txt')).fontSize, seps: document.querySelectorAll('#racine .sep-semaines').length }));
    verifier((await attrs(page)) === 'auj=oui separation=rien texte=grand' && r.we && r.cases > 0 && r.txt === '13.5px' && r.seps === 0, lieu + ' : réglages du compte relus à l\'ouverture (' + JSON.stringify(r) + ')');
    if (largeur > 600) verifier(r.deux === true, lieu + ' : ouvre en 2 semaines');
    else verifier(r.jour === false && r.deux === false, lieu + ' : ouvre en 1 semaine (pas 1 jour)');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  {
    // Table injoignable : la copie de l'appareil.
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD, tablesEnEchec: ['reglages'],
      localStorage: { 'planning.affichage': JSON.stringify({ coins: 'droits', lignes: '1' }) } });
    verifier((await attrs(page)) === 'coins=droits lignes=1' && (await style(page, '.bulle .b-carte', 'borderTopLeftRadius')) === '2px', 'table injoignable : copie de l\'appareil appliquée');
    toutesErreurs.push(...erreurs.filter((e) => !/reglages/i.test(e)));
    await page.close();
  }
  {
    // Téléphone : aperçu sans le mardi, rien ne déborde.
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, bd: BD });
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(250);
    const t = await page.evaluate(() => ({ jours: [...document.querySelectorAll('#apercuAffichage .aa-th')].map((n) => n.querySelector('.aa-jour').textContent + ' ' + n.querySelector('.aa-date').textContent).join(','),
      large: document.documentElement.scrollWidth, ap: Math.round(document.querySelector('#apercuAffichage .apercu-affichage').getBoundingClientRect().right) }));
    verifier(t.jours === 'Jeu 24,Ven 25,Lun 28' && t.large <= 390 && t.ap <= 390, 'téléphone : aperçu Jeu Ven | Lun, sans débordement (' + JSON.stringify(t) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
