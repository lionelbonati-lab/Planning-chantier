const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 92). Lionel :
//   « La hauteur de ligne est fixe aussi sur ordinateur. Proposer les même
//     réglage que sur portable. Un raccourcis dans la toolbar serait un
//     plus. Passer hauteur de ligne à un curseur sur ordinateur.
//     Quand une bulle est sélectionnée, synchroniser la case chantier de la
//     toolbar afin de pouvoir changer de chantier sans entrer dans l'édition
//     de formulaire, fonctionne en multi-selection tous les chantier
//     selectionné prendront le chantier. Si chantier différent lors de la
//     multiselection mettre la case sur aucun chantier. une foit terminé le
//     chantier par défaut reviens comme il était avant l'édition. »
// Réponses : curseur « continu, au pixel » ; raccourci « bouton + petit
// panneau » ; tablette « comme l'ordinateur » ; une tâche de plusieurs
// jours reste « une seule bulle ».
// Vérifie, ordinateur 1400 px :
//   1. toutes les lignes de personnes à la même hauteur (2 bulles à
//      l'origine), Jalons/Notes : 1 bulle d'1 ligne ;
//   2. cascade par amas : 2 bulles l'une sous l'autre, 4 en cascade
//      régulière, une bulle seule un autre jour en haut de sa ligne ; une
//      tâche de 3 jours : une seule carte ; « ↻ série » en petit ↻ ;
//   3. bouton « Hauteur des lignes » de la barre : panneau à curseurs ;
//      le curseur change la hauteur sans reconstruire la grille, libellé
//      en bulles et en pixels ; page Affichage : même curseur, même valeur,
//      ancien réglage « Serrée / Normale / Aérée » retiré ;
//   4. case chantier synchronisée avec la sélection : une tâche, deux de
//      chantiers différents (« Aucun chantier »), changement appliqué à
//      toutes, « Aucun chantier » appliqué, chantier par défaut inchangé et
//      réaffiché après Échap, Ctrl+Z ;
//   5. tablette : hauteurs fixes aussi.
//
// Lancer : node test_suite92.js

const PERS = ['Lionel', 'Mathis', 'Antoine'].map((nom, i) => ({ id: i + 1, nom, sous_traitant: false, ordre: i + 1, actif: true }));
const CHANTIERS = [
  { id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 },
  { id: 2, nom: '26190 - Villa Rochat', couleur: '#b9d3f0', actif: true, ordre: 2 }
];
const PADEL = CHANTIERS[0].nom, VILLA = CHANTIERS[1].nom;
let tid = 1;
const T = (pid, date, demi, texte, ordre, ch, serie) => ({ id: tid++, personne_id: pid, date, demi, ordre: ordre || 0, texte, chantier_id: ch || 1, serie_id: serie || null });
const LONG = 'Coffrage des voiles du sous-sol';
const TACHES = [
  // Lionel : mercredi après-midi → vendredi matin (une seule carte) ;
  // lundi : une tâche d'une série (↻).
  T(1, '2026-09-23', 'aprem', LONG), T(1, '2026-09-24', 'matin', LONG), T(1, '2026-09-24', 'aprem', LONG), T(1, '2026-09-25', 'matin', LONG),
  T(1, '2026-09-21', 'matin', 'S', 0, 1, 5),
  // Mathis, jeudi matin : A (Padel) et B (Villa) ; mardi : M seule.
  T(2, '2026-09-24', 'matin', 'A', 0, 1), T(2, '2026-09-24', 'matin', 'B', 1, 2), T(2, '2026-09-22', 'matin', 'M'),
  // Antoine, jeudi matin : 4 bulles (en cascade) ; mardi : Q seule.
  T(3, '2026-09-24', 'matin', 'X', 0), T(3, '2026-09-24', 'matin', 'Y', 1), T(3, '2026-09-24', 'matin', 'Z', 2), T(3, '2026-09-24', 'matin', 'W', 3),
  T(3, '2026-09-22', 'matin', 'Q')
];
const JALONS = [{ id: 900, date: '2026-09-24', texte: 'Coulage de la dalle du premier étage avec la pompe', serie_id: null }];
const BD = () => ({ personnes: PERS, chantiers: CHANTIERS, series: [{ id: 5 }], taches: TACHES.map((t) => Object.assign({}, t)), jalons: JALONS.map((j) => Object.assign({}, j)) });
const M = 3; // MARGE_MOB_ (grille-rendu.js)

// Lignes, cartes (haut et bas) et variables posées.
const releve = (page) => page.evaluate(() => {
  const sc = document.querySelector('.scroller');
  const lbl = (nom) => [...sc.querySelectorAll('.lbl')].find((l) => l.textContent.includes(nom)).getBoundingClientRect();
  const lignes = {};
  ['Lionel', 'Mathis', 'Antoine'].forEach((n) => { const r = lbl(n); lignes[n] = { h: r.top, b: r.bottom, hauteur: r.height }; });
  const cartes = {};
  document.querySelectorAll('#racine .scroller .bulle').forEach((b) => {
    const t = b.querySelector('.b-txt').textContent.trim().split(' ')[0];
    cartes[t] = [...b.querySelectorAll(':scope > .b-carte')].map((c) => { const r = c.getBoundingClientRect(); return { h: r.top, b: r.bottom, l: r.width }; });
  });
  const jal = [...document.querySelectorAll('.lbl-speciale')].find((l) => /Jalon/i.test(l.textContent));
  const css = (v) => parseFloat(getComputedStyle(racineEl).getPropertyValue(v));
  return { lignes, cartes, jal: jal ? jal.getBoundingClientRect().height : null, u: css('--mob-carte-pers'), H: css('--mob-h-pers'), uJal: css('--mob-carte-jal'), hJal: css('--mob-h-jal') };
});
const proche = (a, b, tol) => Math.abs(a - b) <= (tol || 1.5);
const pasCascade = (U, H, n, k) => k <= n ? U + M : Math.max(Math.min(20, U + M), (H - 2 * M - U) / (k - 1));

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, {
      viewport: { width: 1400, height: 900 }, bd: BD(),
      localStorage: { 'planning.chantierParDefaut': VILLA }
    });
    await page.waitForTimeout(500);
    let r = await releve(page);

    // --- 1. Hauteurs fixes ---
    const hs = Object.values(r.lignes).map((l) => l.hauteur);
    verifier(r.u > 20 && proche(r.H, 2 * r.u + 3 * M) && hs.every((h) => proche(h, r.H)),
      'ordinateur : les 3 lignes de personnes à la même hauteur, 2 bulles (H ' + r.H + ', U ' + r.u + ', lignes ' + hs.map(Math.round).join('/') + ')');
    verifier(r.uJal > 10 && proche(r.hJal, r.uJal + 2 * M) && proche(r.jal, r.hJal),
      'ordinateur : ligne Jalons à 1 bulle d\'1 ligne (' + r.jal + ' px, U ' + r.uJal + ')');
    verifier(await page.evaluate(() => racineEl.classList.contains('hauteurs-fixes') && !racineEl.classList.contains('vue-jour-mobile')),
      'ordinateur : #racine.hauteurs-fixes, sans la vue 1 jour du téléphone');

    // --- 2. Cascade par amas ---
    const lm = r.lignes.Mathis, la = r.lignes.Antoine, c = r.cartes;
    verifier(proche(c.A[0].h, lm.h + M) && proche(c.B[0].h, c.A[0].h + r.u + M),
      'Mathis jeudi : B sous A sans recouvrement (A +' + Math.round(c.A[0].h - lm.h) + ', B +' + Math.round(c.B[0].h - lm.h) + ')');
    const pas = pasCascade(r.u, r.H, 2, 4), hX = ['X', 'Y', 'Z', 'W'].map((t) => c[t][0].h - la.h);
    verifier(hX.every((h, i) => proche(h, M + i * pas)) && pas >= 20,
      'Antoine jeudi : 4 bulles en cascade régulière, haut de chacune visible (pas ' + pas.toFixed(1) + ', hauts ' + hX.map(Math.round).join('/') + ')');
    verifier(proche(c.M[0].h, lm.h + M) && proche(c.Q[0].h, la.h + M),
      'un autre jour, une bulle seule reste en haut de sa ligne (amas séparés) (M +' + Math.round(c.M[0].h - lm.h) + ', Q +' + Math.round(c.Q[0].h - la.h) + ')');
    const jour = await page.evaluate(() => document.querySelector('.th[data-gi]').getBoundingClientRect().width);
    verifier(c.Coffrage.length === 1 && c.Coffrage[0].l > 1.5 * jour && proche(c.Coffrage[0].h - r.lignes.Lionel.h, M),
      'tâche de 3 jours : une seule carte, sur toute sa largeur (' + c.Coffrage.length + ' carte, ' + Math.round(c.Coffrage[0].l) + ' px)');
    const serie = await page.evaluate(() => {
      const s = [...document.querySelectorAll('.bulle .b-serie')][0];
      if (!s) return null;
      const cs = getComputedStyle(s), av = getComputedStyle(s, '::before');
      const carte = s.closest('.b-carte').getBoundingClientRect(), rs = s.getBoundingClientRect();
      return { pos: cs.position, taille: cs.fontSize, avant: av.content, dedans: rs.bottom <= carte.bottom + 0.5 && rs.right <= carte.right + 0.5 };
    });
    verifier(serie && serie.pos === 'absolute' && serie.taille === '0px' && serie.avant === '"↻"' && serie.dedans,
      '« ↻ série » : petit ↻ dans le coin bas de la carte (' + JSON.stringify(serie) + ')');

    // --- 3. Bouton de la barre, curseurs, page Affichage ---
    await page.click('#btnHauteurs');
    await page.waitForTimeout(150);
    // Suite 101 — Lionel : « réglage maintenant en pixels. même chose pour
    // jalons et notes. » Curseurs en pixels (hauteurLigneOrdi,
    // hauteurJalOrdi) ; lignes de texte des jalons : lignesJal.
    const pan = await page.evaluate(() => ({
      ouvert: document.getElementById('menuHauteurs').classList.contains('ouvert'),
      curseurs: [...document.querySelectorAll('#panneauHauteurs .curseur-option')].map((e) => e.dataset.option + '=' + e.value),
      lignesJal: !!document.querySelector('#panneauHauteurs [data-option="lignesJal"]'),
      libelle: document.querySelector('#panneauHauteurs .curseur-valeur[data-pour="hauteurLigneOrdi"]').textContent,
      tous: !!document.querySelector('#panneauHauteurs .hauteurs-tous')
    }));
    verifier(pan.ouvert && pan.curseurs.join(',') === 'hauteurLigneOrdi=117,hauteurJalOrdi=32' && pan.lignesJal && pan.tous,
      'bouton « Hauteur des lignes » : panneau avec les curseurs Personnes et Jalons/Notes, les lignes de texte des jalons, le lien vers tous les réglages (' + JSON.stringify(pan) + ')');
    verifier(pan.libelle === Math.round(r.H) + ' px', 'libellé du curseur en pixels (« ' + pan.libelle + ' »)');
    // Curseur tiré à la place de 3 bulles : événement « input » comme au glisser du pouce.
    const marque = async () => page.evaluate(() => document.querySelector('#racine .scroller .grille').dataset.marque === '1');
    await page.evaluate(() => { document.querySelector('#racine .scroller .grille').dataset.marque = '1'; });
    const tirer = (id, v) => page.evaluate(([id, v]) => {
      const e = document.querySelector('#panneauHauteurs .curseur-option[data-option="' + id + '"]');
      e.value = v; e.dispatchEvent(new Event('input', { bubbles: true }));
    }, [id, v]);
    const px3 = String(Math.round(3 * r.u + 4 * M));
    await tirer('hauteurLigneOrdi', px3);
    await page.waitForTimeout(150);
    r = await releve(page);
    const lib3 = await page.evaluate(() => [optionAffichage('hauteurLigneOrdi'), document.querySelector('#panneauHauteurs .curseur-valeur[data-pour="hauteurLigneOrdi"]').textContent]);
    verifier(proche(r.H, 3 * r.u + 4 * M) && Object.values(r.lignes).every((l) => proche(l.hauteur, r.H)) && await marque(),
      'curseur à ' + px3 + ' px (3 bulles) : lignes de 3 bulles tout de suite, sans reconstruire la grille (H ' + r.H + ')');
    const pas3 = pasCascade(r.u, r.H, 3, 4), hX3 = ['X', 'Y', 'Z', 'W'].map((t) => r.cartes[t][0].h - r.lignes.Antoine.h);
    verifier(hX3.every((h, i) => proche(h, M + i * pas3)), 'cascade refaite à la nouvelle hauteur (pas ' + pas3.toFixed(1) + ', hauts ' + hX3.map(Math.round).join('/') + ')');
    verifier(lib3[0] === px3 && lib3[1] === px3 + ' px', 'valeur enregistrée et libellé à jour (' + lib3.join(' | ') + ')');
    await tirer('hauteurLigneOrdi', '88');
    await page.waitForTimeout(150);
    r = await releve(page);
    verifier(proche(r.H, 88) && await marque(), 'curseur au pixel : 88 px (H ' + r.H + ')');
    const pxJ = String(Math.round(2 * r.uJal + 3 * M));
    await tirer('hauteurJalOrdi', pxJ);
    await page.waitForTimeout(150);
    r = await releve(page);
    verifier(proche(r.hJal, 2 * r.uJal + 3 * M) && proche(r.jal, r.hJal) && await marque(), 'curseur Jalons/Notes à ' + pxJ + ' px : ligne Jalons de 2 bulles (' + r.jal + ' px)');
    // Page Affichage : même curseur, même valeur ; anciens réglages retirés.
    // Le panneau recouvre une partie de la grille : refermé par son bouton.
    await page.click('#btnHauteurs');
    await page.waitForTimeout(100);
    verifier(await page.evaluate(() => !document.getElementById('menuHauteurs').classList.contains('ouvert')), 'le bouton referme le panneau');
    await page.evaluate(() => afficherPage('affichage'));
    await page.waitForTimeout(300);
    const pa = await page.evaluate(() => {
      const e = document.querySelector('#page-affichage .curseur-option[data-option="hauteurLigneOrdi"]');
      return { valeur: e && e.value, libelle: e && e.parentNode.querySelector('.curseur-valeur').textContent, ancien: !!document.querySelector('[data-option="hauteur"], [data-option="lignesOrdi"]') };
    });
    verifier(pa.valeur === '88' && pa.libelle === '88 px' && !pa.ancien,
      'page Affichage : curseur « Hauteur des lignes » à la même valeur, anciens réglages retirés (' + JSON.stringify(pa) + ')');
    await page.evaluate(() => afficherPage('planning'));
    await page.waitForTimeout(300);
    r = await releve(page);
    verifier(proche(r.H, 88) && Object.values(r.lignes).every((l) => proche(l.hauteur, r.H)), 'retour au planning : hauteur gardée (H ' + r.H + ')');
    await tirer('hauteurLigneOrdi', '117');
    await tirer('hauteurJalOrdi', '32');
    await page.waitForTimeout(150);

    // --- 4. Case chantier synchronisée avec la sélection ---
    const caseCh = () => page.evaluate(() => ({
      nom: document.querySelector('#btnSelectChantier .nom-chantier').textContent,
      sel: document.getElementById('selectChantier').classList.contains('mode-selection'),
      titre: (document.querySelector('#panneauChantier .select-chantier-titre') || {}).textContent || '',
      actif: [...document.querySelectorAll('#panneauChantier .select-chantier-item.actif')].map((e) => e.dataset.chantier).join(','),
      defaut: chantierParDefaut
    }));
    const chantierDe = (t) => page.evaluate((t) => TACHES.filter((x) => x.texte === t).map((x) => x.chantier === null ? 'aucun' : x.chantier).join(','), t);
    const bdChantier = (t) => page.evaluate((t) => window.__BD.taches.filter((x) => x.texte === t).map((x) => x.chantier_id).join(','), t);
    const clicCarte = async (t, mods) => {
      const p = await page.evaluate((t) => {
        const b = [...document.querySelectorAll('#racine .scroller .bulle')].find((x) => x.querySelector('.b-txt').textContent.trim() === t);
        const r = b.querySelector('.b-carte').getBoundingClientRect();
        return [r.left + r.width / 2, r.top + Math.min(10, r.height / 2)];
      }, t);
      for (const m of mods || []) await page.keyboard.down(m);
      await page.mouse.click(p[0], p[1]);
      for (const m of mods || []) await page.keyboard.up(m);
      await page.waitForTimeout(150);
    };
    let k = await caseCh();
    verifier(k.nom === VILLA && !k.sel, 'sans sélection : la case montre le chantier par défaut (« ' + k.nom + ' »)');
    await clicCarte('A');
    k = await caseCh();
    verifier(k.nom === PADEL && k.sel && k.titre === 'Chantier de la tâche' && k.actif === PADEL,
      'A sélectionnée : la case montre son chantier (' + JSON.stringify(k) + ')');
    await clicCarte('B', ['Control']);
    k = await caseCh();
    verifier(k.nom === 'Aucun chantier' && k.sel && /\(différents\)/.test(k.titre) && k.actif === '',
      'A + B de chantiers différents : « Aucun chantier », rien de coché (' + JSON.stringify(k) + ')');
    await page.click('#btnSelectChantier');
    await page.waitForTimeout(100);
    await page.click('#panneauChantier .select-chantier-item[data-chantier="' + PADEL + '"]');
    await page.waitForTimeout(800);
    k = await caseCh();
    verifier(await chantierDe('A') === PADEL && await chantierDe('B') === PADEL && await bdChantier('B') === '1' && k.nom === PADEL && k.actif === PADEL && !/différents/.test(k.titre),
      'choix « Padel » : A et B passent sur Padel, enregistré (B chantier_id ' + await bdChantier('B') + ', case « ' + k.nom + ' »)');
    verifier(k.defaut === VILLA, 'le chantier par défaut des formulaires n\'a pas bougé (' + k.defaut + ')');
    await page.click('#btnSelectChantier');
    await page.waitForTimeout(100);
    await page.click('#panneauChantier .select-chantier-aucun');
    await page.waitForTimeout(800);
    k = await caseCh();
    verifier(await chantierDe('A') === 'aucun' && await chantierDe('B') === 'aucun' && await bdChantier('A') === '' && k.nom === 'Aucun chantier' && k.actif === '' && !/différents/.test(k.titre),
      '« Aucun chantier » : appliqué à A et B, la case ne dit plus « différents » (' + JSON.stringify(k) + ')');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    k = await caseCh();
    verifier(k.nom === VILLA && !k.sel && k.defaut === VILLA && k.titre === '', 'Échap : la case revient au chantier par défaut (« ' + k.nom + ' »)');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(800);
    verifier(await chantierDe('A') === PADEL && await chantierDe('B') === VILLA && await bdChantier('B') === '2',
      'Ctrl+Z deux fois : A sur Padel, B sur Villa, comme au départ (' + await chantierDe('A') + ' / ' + await chantierDe('B') + ')');
    // Un jalon sélectionné seul : la case garde le chantier par défaut.
    await page.evaluate(() => { const b = document.querySelector('#racine .bulle-jalon'); const r = b.querySelector('.b-carte').getBoundingClientRect(); window.__pJal = [r.left + 20, r.top + r.height / 2]; });
    const pj = await page.evaluate(() => window.__pJal);
    await page.mouse.click(pj[0], pj[1]);
    await page.waitForTimeout(150);
    k = await caseCh();
    verifier(await page.evaluate(() => Object.keys(bullesSelectionnees).length) === 1 && k.nom === VILLA && !k.sel,
      'jalon seul sélectionné : la case garde le chantier par défaut (« ' + k.nom + ' »)');
    await page.keyboard.press('Escape');

    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 5. Tablette : comme l'ordinateur ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 820, height: 1180 }, hasTouch: true, bd: BD() });
    await page.waitForTimeout(500);
    const r = await releve(page);
    const hs = Object.values(r.lignes).map((l) => l.hauteur);
    verifier(proche(r.H, 2 * r.u + 3 * M) && hs.every((h) => proche(h, r.H)) && r.cartes.Coffrage.length === 1 && await page.evaluate(() => !!document.getElementById('btnHauteurs')),
      'tablette : hauteurs fixes de 2 bulles, une seule carte, bouton des hauteurs (H ' + r.H + ', lignes ' + hs.map(Math.round).join('/') + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
