const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 95). Lionel :
//   « Ajoute l'ombre à toute les bulles.
//     En multi-sélection ne pas agrandir la bulle sélectionnée.
//     J'ai l'impression que la hauteur des bulles n'est plus dynamique.
//     En mode portable, sélectionner la date du jour actif dans les
//     formulaire à l'ajout par la touche "+".
//     L'agrandissement d'une bulle sélectionnée peut se faire d'une demi
//     case à droite ou à gauche (dans sa demi journée opposée) pour éviter
//     qu'elle ne prenne trop de hauteur, la décaler contre le haut si elle
//     passe dessous une ligne de séparation.
//     Ajoute ligne de texte bulle au bouton hauteur de ligne.
//     Trille correctement le menu affichage. »
//   Puis : « il serait plutôt judicieux d'élargir la bulle de quelques
//     pixels et la centrer sur sa case quand c'est possible, sinon […] la
//     faire déborder à gauche ou à droite si elle est en bout de
//     planning. »
// Vérifie :
//   1. bulle à la taille du texte : un texte court fait une carte plus
//      basse que U, un long une carte de U ; lignes à leur hauteur fixe ;
//      toutes les cartes ombrées ;
//   2. ordinateur, dépliage : bulle au milieu du planning -> élargie de
//      12 px de chaque côté, centrée ; lundi (bord gauche) -> les 24 px à
//      droite ; vendredi (bord droit) -> à gauche ; 2e d'une cascade ->
//      remontée, son bas au-dessus de la séparation du bas de sa ligne ;
//      Échap -> tout reprend sa place ; multi-sélection -> ni dépliage ni
//      élargissement ;
//   3. téléphone, vue « 1 jour » : carte du matin, contre la colonne des
//      noms -> les 24 px à droite ;
//   4. « + » : formulaire à la date du jour affiché (téléphone), à
//      aujourd'hui (ordinateur) ;
//   5. panneau « Hauteur des lignes » : « Lignes de texte » (ordinateur et
//      téléphone), qui change la hauteur des cartes ; page Affichage rangée
//      par sujet.
//
// Lancer : node test_suite95.js

const PERS = ['Lionel', 'Mathis', 'Antoine'].map((nom, i) => ({ id: i + 1, nom, sous_traitant: false, ordre: i + 1, actif: true }));
let tid = 1;
const T = (pid, date, demi, texte, ordre) => ({ id: tid++, personne_id: pid, date, demi, ordre: ordre || 0, texte, chantier_id: 1 });
const LONG = 'Coffrage des voiles du sous-sol côté nord, reprise des banches, contrôle des aplombs et réservations des gaines électriques';
const TACHES = [
  // Mathis : mardi matin, une courte puis une longue (cascade) ; mercredi
  // matin, jeudi après-midi, vendredi journée : longues.
  T(2, '2026-09-22', 'matin', 'Court', 0), T(2, '2026-09-22', 'matin', 'Cascade ' + LONG, 1),
  T(2, '2026-09-23', 'matin', 'Matin ' + LONG), T(2, '2026-09-24', 'aprem', 'Aprem ' + LONG),
  T(2, '2026-09-25', 'matin', 'Journee ' + LONG), T(2, '2026-09-25', 'aprem', 'Journee ' + LONG),
  T(1, '2026-09-24', 'matin', 'Seule'), T(1, '2026-09-21', 'matin', 'Lundi ' + LONG)
];
const BD = () => ({ personnes: PERS, taches: TACHES.map((t) => Object.assign({}, t)) });

// Carte visible d'une bulle (repérée par le premier mot de son texte).
const carte = (page, mot) => page.evaluate((mot) => {
  const b = [...document.querySelectorAll('#racine .scroller .bulle')].find((x) => x.querySelector('.b-txt').textContent.trim().split(' ')[0] === mot);
  if (!b) return null;
  const sc = b.closest('.scroller').getBoundingClientRect();
  const cs = [...b.querySelectorAll(':scope > .b-carte')];
  const c = cs.find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.right > sc.left + 60 && r.left < sc.right; }) || cs[0];
  const r = c.getBoundingClientRect(), t = c.querySelector('.b-txt');
  const lbl = [...document.querySelectorAll('.scroller .lbl')].find((l) => l.textContent.includes('Mathis')).getBoundingClientRect();
  const css = (v) => parseFloat(getComputedStyle(racineEl).getPropertyValue(v));
  return {
    sel: b.classList.contains('selectionnee'), g: r.left, d: r.right, h: r.top, b: r.bottom, larg: r.width, haut: r.height,
    coupe: t.scrollHeight > t.clientHeight + 1, deplie: c.hasAttribute('data-deplie'), ombre: /drop-shadow/.test(getComputedStyle(c).filter),
    ligneH: lbl.top, ligneB: lbl.bottom, u: css('--mob-carte-pers'), H: css('--mob-h-pers')
  };
}, mot);
const clic = async (page, mot, ctrl) => {
  const p = await page.evaluate((mot) => {
    const b = [...document.querySelectorAll('#racine .scroller .bulle')].find((x) => x.querySelector('.b-txt').textContent.trim().split(' ')[0] === mot);
    const sc = b.closest('.scroller').getBoundingClientRect();
    const c = [...b.querySelectorAll(':scope > .b-carte')].find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.right > sc.left + 60 && r.left < sc.right; });
    const r = c.getBoundingClientRect();
    return [r.left + Math.min(30, r.width / 2), r.top + 6];
  }, mot);
  if (ctrl) await page.keyboard.down('Control');
  await page.mouse.click(p[0], p[1]);
  if (ctrl) await page.keyboard.up('Control');
  await page.waitForTimeout(200);
};
const echap = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(200); };

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- Ordinateur ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD() });
    await page.waitForTimeout(500);
    // 1. Taille au texte, ombre partout.
    const court = await carte(page, 'Court'), long = await carte(page, 'Matin');
    // Longue : coupée à « Lignes de texte » (2), au plus U — U garde aussi la
    // place du badge de statut, absent ici.
    verifier(court.haut < long.haut - 8 && long.haut <= long.u + 1 && long.coupe && Math.abs((court.ligneB - court.ligneH) - court.H) <= 1,
      'bulle à la taille du texte : courte ' + Math.round(court.haut) + ' px, longue ' + Math.round(long.haut) + ' px (U ' + court.u + '), ligne à ' + Math.round(court.ligneB - court.ligneH) + ' px (H ' + court.H + ')');
    verifier(court.ombre && long.ombre, 'toutes les cartes ombrées, même seules');

    // 2. Milieu du planning -> 12 px de chaque côté, centrée sur sa case.
    const E = 12; // ELARGI_SEL_ (grille-rendu.js)
    let a = await carte(page, 'Matin');
    await clic(page, 'Matin');
    let e = await carte(page, 'Matin');
    verifier(e.sel && e.deplie && Math.abs(e.g - (a.g - E)) <= 1 && Math.abs(e.d - (a.d + E)) <= 1 && e.haut > e.u,
      'mercredi matin : élargie de ' + E + ' px de chaque côté, centrée (' + Math.round(a.g) + '–' + Math.round(a.d) + ' -> ' + Math.round(e.g) + '–' + Math.round(e.d) + ')');
    verifier(e.b <= e.ligneB - 2 || Math.abs(e.h - (e.ligneH + 3)) <= 1, 'matin : sous la séparation du bas de sa ligne, ou calée en haut de la ligne (bas ' + Math.round(e.b) + ', ligne ' + Math.round(e.ligneB) + ')');
    await echap(page);
    e = await carte(page, 'Matin');
    verifier(!e.sel && !e.deplie && Math.abs(e.larg - a.larg) <= 1 && Math.abs(e.haut - a.haut) <= 1, 'Échap : largeur et hauteur d\'avant');

    a = await carte(page, 'Aprem');
    await clic(page, 'Aprem');
    e = await carte(page, 'Aprem');
    verifier(e.sel && e.deplie && Math.abs(e.g - (a.g - E)) <= 1 && Math.abs(e.d - (a.d + E)) <= 1,
      'jeudi après-midi : centrée aussi (' + Math.round(a.g) + '–' + Math.round(a.d) + ' -> ' + Math.round(e.g) + '–' + Math.round(e.d) + ')');
    await echap(page);

    // Lundi, contre la colonne des noms : tout le débordement à droite.
    a = await carte(page, 'Lundi');
    await clic(page, 'Lundi');
    e = await carte(page, 'Lundi');
    const noms = await page.evaluate(() => document.querySelector('#racine .scroller').getBoundingClientRect().left + largeurNoms());
    verifier(e.sel && e.deplie && e.g >= noms - 0.5 && e.g <= a.g + 0.5 && Math.abs(e.larg - (a.larg + 2 * E)) <= 1,
      'lundi (bord gauche) : pas sous la colonne des noms, déborde à droite (' + Math.round(a.g) + '–' + Math.round(a.d) + ' -> ' + Math.round(e.g) + '–' + Math.round(e.d) + ', noms ' + Math.round(noms) + ')');
    await echap(page);

    // Vendredi, bord droit du planning : le débordement à gauche.
    a = await carte(page, 'Journee');
    await clic(page, 'Journee');
    e = await carte(page, 'Journee');
    const bordD = await page.evaluate(() => Math.min(document.querySelector('#racine .scroller').getBoundingClientRect().right, document.querySelector('#racine .scroller .grille').getBoundingClientRect().right));
    verifier(e.sel && e.deplie && e.d <= Math.max(a.d, bordD - 2) + 0.5 && e.g <= a.g - 2 * E + 1 && e.larg >= a.larg + 2 * E - 1,
      'vendredi (bord droit) : déborde à gauche (' + Math.round(a.g) + '–' + Math.round(a.d) + ' -> ' + Math.round(e.g) + '–' + Math.round(e.d) + ', bord ' + Math.round(bordD) + ')');
    await echap(page);

    // 2e d'une cascade : remontée au-dessus de la séparation.
    a = await carte(page, 'Cascade');
    await clic(page, 'Cascade');
    e = await carte(page, 'Cascade');
    const remonte = await page.evaluate(() => !!document.querySelector('.b-carte[data-remonte]'));
    verifier(e.sel && e.deplie && remonte && e.h < a.h && e.h >= e.ligneH + 2 && (e.b <= e.ligneB - 2 || Math.abs(e.h - (e.ligneH + 3)) <= 1),
      '2e de la cascade : élargie et remontée contre le haut, au-dessus de la séparation (haut ' + Math.round(a.h - a.ligneH) + ' -> ' + Math.round(e.h - e.ligneH) + ', bas ' + Math.round(e.b) + ' / ligne ' + Math.round(e.ligneB) + ')');
    await echap(page);
    e = await carte(page, 'Cascade');
    verifier(Math.abs(e.h - a.h) <= 1 && Math.abs(e.larg - a.larg) <= 1 && await page.evaluate(() => !document.querySelector('.b-carte[data-remonte], .b-carte[data-deplie]')), 'Échap : la 2e de la cascade reprend sa place');

    // Multi-sélection : ni dépliage ni élargissement.
    a = await carte(page, 'Matin');
    await clic(page, 'Matin');
    await clic(page, 'Seule', true);
    e = await carte(page, 'Matin');
    const multi = await page.evaluate(() => document.body.classList.contains('selection-multiple') && Object.keys(bullesSelectionnees).length === 2 && !document.querySelector('.b-carte[data-deplie], .b-carte[data-remonte]'));
    verifier(e.sel && multi && e.coupe && Math.abs(e.larg - a.larg) <= 1 && Math.abs(e.haut - a.haut) <= 1, 'multi-sélection : bulle ni dépliée ni élargie');
    await echap(page);

    // 4. « + » sur ordinateur : aujourd'hui.
    const dOrdi = await page.evaluate(() => { ouvrirAjoutElementBarre('tache', 1); return document.querySelector('.form-pop .date-val').textContent; });
    verifier(/24 sept/.test(dOrdi), '« + » sur ordinateur : aujourd\'hui (' + dOrdi + ')');
    await echap(page);

    // 5. Panneau : « Lignes de texte » entre les bulles par personne et les Jalons.
    await page.click('#btnHauteurs');
    await page.waitForTimeout(150);
    const pan = await page.evaluate(() => [...document.querySelectorAll('#panneauHauteurs .reglage-ligne[data-option]')].map((l) => l.dataset.option).join(','));
    verifier(pan === 'lignesOrdi,lignes,jalonsOrdi,jalonsLignesOrdi', 'panneau « Hauteur des lignes » : ' + pan);
    const u2 = await page.evaluate(() => parseFloat(getComputedStyle(racineEl).getPropertyValue('--mob-carte-pers')));
    await page.click('#panneauHauteurs .choix-pastille[data-option="lignes"][data-valeur="3"]');
    await page.waitForTimeout(300);
    const r3 = await page.evaluate(() => ({ u: parseFloat(getComputedStyle(racineEl).getPropertyValue('--mob-carte-pers')), actif: !!document.querySelector('#panneauHauteurs .choix-pastille.actif[data-option="lignes"][data-valeur="3"]'), opt: optionAffichage('lignes') }));
    verifier(r3.opt === '3' && r3.actif && r3.u > u2 + 8, 'panneau : « Lignes de texte » à 3, cartes plus hautes (U ' + u2 + ' -> ' + r3.u + ')');
    await page.click('#btnHauteurs');
    // Page Affichage rangée par sujet.
    await page.evaluate(() => afficherPage('affichage'));
    await page.waitForTimeout(250);
    const groupes = await page.evaluate(() => [...document.querySelectorAll('#page-affichage .titre-liste')].map((h) => h.textContent).join('|'));
    verifier(groupes === 'Planning|Dates|Hauteur des lignes|Bulles|Police|À l’ouverture', 'page Affichage : ' + groupes);
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- Téléphone, vue « 1 jour » ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD() });
    await page.waitForTimeout(500);
    await page.evaluate(() => allerAuJour('2026-09-23')); await page.waitForTimeout(600);
    const a = await carte(page, 'Matin');
    const p = [a.g + Math.min(30, a.larg / 2), a.h + 6];
    await page.touchscreen.tap(p[0], p[1]);
    await page.waitForTimeout(300);
    const e = await carte(page, 'Matin');
    const Et = 12, nomsT = await page.evaluate(() => document.querySelector('#racine .scroller').getBoundingClientRect().left + largeurNoms());
    verifier(e.sel && e.deplie && e.g >= nomsT - 0.5 && Math.abs(e.larg - (a.larg + 2 * Et)) <= 1 && e.d >= a.d + Et,
      'téléphone : carte du matin, contre les noms, élargie de ' + 2 * Et + ' px vers la droite (' + Math.round(a.g) + '–' + Math.round(a.d) + ' -> ' + Math.round(e.g) + '–' + Math.round(e.d) + ')');
    await echap(page);
    // « + » : le jour affiché, pas aujourd'hui.
    const d = await page.evaluate(() => { ouvrirAjoutElementBarre('tache', 1); return [jourMobileIso, document.querySelector('.form-pop .date-val').textContent]; });
    verifier(d[0] === '2026-09-23' && /23 sept/.test(d[1]), '« + » sur téléphone : la date du jour affiché (' + d.join(' / ') + ')');
    await echap(page);
    const dj = await page.evaluate(() => { ouvrirAjoutElementBarre('jalon'); return document.querySelector('.form-pop .date-val').textContent; });
    verifier(/23 sept/.test(dj), '« + » jalon sur téléphone : le jour affiché (' + dj + ')');
    await echap(page);
    // Panneau du téléphone.
    const pan = await page.evaluate(() => { majPanneauHauteurs(); return [...document.querySelectorAll('#panneauHauteurs .reglage-ligne[data-option]')].map((l) => l.dataset.option).join(','); });
    verifier(pan === 'lignesTel,lignes,jalonsTel', 'téléphone, panneau « Hauteur des lignes » : ' + pan);
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
