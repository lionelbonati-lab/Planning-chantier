const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 26.09.2026 (suite 66). Lionel :
//   « J'arrive à changer les tâches entre intervenants alors que cela devrait
//     être interdit. » puis « une tache doit pouvoir naviguer entre
//     personnel, mais pas entre intervenant. un électricien n'est pas un
//     ehafaudeur. »
//   « J'aimerai pouvoir trier mes tâches si plusieurs tâches se
//     chevauchent. » puis « pas de bouton, un glisser déposer par dessus fait
//     monter la tâche d'un rang »
//   « Possibilité d'affecter une tâches à aucun chantier. [...] dans
//     l'impression il sera noté autre. Reste sans couleur. »
//   « Logo en haut a gauche mal centré gauche droite dans sa case »
// Vérifie :
//   1. Glisser une tâche d'intervenant sur un autre intervenant : refusé
//      (reste sur sa ligne, message) ; entre deux personnes du personnel :
//      permis ;
//   2. Déposer une tâche PAR-DESSUS une autre qui la chevauche : elle monte
//      au-dessus (surbrillance de la cible pendant le geste), ses dates ne
//      bougent pas, l'ordre est écrit dans les cases (ordre) et repris au
//      rechargement ; Ctrl+Z la redescend ; redescendre en la déposant sur
//      celle du dessous ;
//   3. Fiche tâche : option « Aucun chantier » en tête, choisie par défaut
//      sans chantier par défaut, et enregistrée sans chantier ;
//   4. Bulle sans chantier : fond neutre (pas de couleur), « Aucun chantier »
//      au survol ;
//   5. Impression : « Autre » en dernier dans la légende, et écrit en noir et
//      blanc ;
//   6. Logo centré gauche/droite dans sa case ;
//   7. « icone attention, Triangle avec point d'exclamation. » : l'icône
//      Important devient un triangle d'avertissement.
//
// Lancer : node test_suite66.js

const T = (id, personne, date, demi, ordre, texte, chantier) =>
  ({ id, personne_id: personne, date, demi, ordre, texte, statut_id: null, important: false, serie_id: null, est_absence: false, chantier_id: chantier === undefined ? 1 : chantier });
const PERSONNES = [
  { id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true },
  { id: 2, nom: 'Mathis', sous_traitant: false, ordre: 2, actif: true },
  { id: 3, nom: 'Électricien', sous_traitant: true, ordre: 3, actif: true },
  { id: 4, nom: 'Échafaudeur', sous_traitant: true, ordre: 4, actif: true }
];
const TACHES = [
  // Jeudi 24 : « Coffrage » (journée) au-dessus de « Ferraillage » (journée).
  T(1, 1, '2026-09-24', 'matin', 0, 'Coffrage'), T(2, 1, '2026-09-24', 'aprem', 0, 'Coffrage'),
  T(3, 1, '2026-09-24', 'matin', 1, 'Ferraillage'), T(4, 1, '2026-09-24', 'aprem', 1, 'Ferraillage'),
  // Mercredi 23 : une tâche sans chantier.
  T(5, 1, '2026-09-23', 'matin', 0, 'Rangement dépôt', null),
  // Vendredi 25 : tâche de l'électricien.
  T(6, 3, '2026-09-25', 'matin', 0, 'Câblage')
];
const BD = { personnes: PERSONNES, taches: TACHES };

const carte = (page, texte) => page.evaluate((t) => {
  const b = [...document.querySelectorAll('.bulle[data-id]:not(.fantome-glisse)')].find((x) => x.querySelector('.b-txt') && x.querySelector('.b-txt').textContent === t);
  if (!b) return null;
  const r = b.querySelector('.b-carte').getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}, texte);
const cellule = (page, personne, iso, demi) => page.evaluate((a) => {
  const gi = giDepuisIso(a.iso);
  const c = [...document.querySelectorAll('.cell[data-kind="personne"][data-personne="' + a.personne + '"][data-jour="' + gi + '"]')];
  const el = c.find((x) => !a.demi || x.dataset.demi === a.demi) || c[0];
  if (!el) return null;
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}, { personne, iso, demi });
const glisser = async (page, de, vers, pendant) => {
  await page.mouse.move(de.cx, de.cy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(de.cx + (vers.cx - de.cx) * i / 10, de.cy + (vers.cy - de.cy) * i / 10); await page.waitForTimeout(25); }
  const vu = pendant ? await pendant() : null;
  await page.mouse.up();
  await page.waitForTimeout(300);
  return vu;
};
const tache = (page, texte) => page.evaluate((t) => {
  const x = TACHES.find((y) => y.texte === t);
  return x ? { personne: String(x.personneId), iso: isoDeGi(x.giDebut), duree: x.duree, chantier: x.chantier || null } : null;
}, texte);
const ordreBD = (page, personne, date, demi) => page.evaluate((a) =>
  window.__BD.taches.filter((r) => String(r.personne_id) === String(a.personne) && r.date === a.date && r.demi === a.demi)
    .sort((x, y) => x.ordre - y.ordre).map((r) => r.texte).join(' > '), { personne, date, demi });

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1 et 2. Glisser ---------------------------------------------------------
  let bdApres = null;
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1500, height: 950 }, bd: BD });

    // 1. Intervenant -> autre intervenant : refusé.
    let de = await carte(page, 'Câblage');
    let vers = await cellule(page, 4, '2026-09-25', 'matin');
    de = await carte(page, 'Câblage');
    await glisser(page, de, vers);
    const cab = await tache(page, 'Câblage');
    const msg = await page.evaluate(() => document.getElementById('toast').textContent);
    verifier(cab && cab.personne === '3' && cab.iso === '2026-09-25', 'tâche de l\'électricien lâchée sur l\'échafaudeur : reste sur sa ligne (' + JSON.stringify(cab) + ')');
    verifier(/intervenant reste sur sa ligne/.test(msg), 'message « Une tâche d’intervenant reste sur sa ligne. » (' + msg + ')');
    const interdit = await page.evaluate(() => typeof changementPersonneAutorise === 'function' &&
      !changementPersonneAutorise(3, 4) && !changementPersonneAutorise(1, 3) && !changementPersonneAutorise(3, 1) && changementPersonneAutorise(1, 2) && changementPersonneAutorise(3, 3));
    verifier(interdit, 'règle : personnel ↔ personnel permis ; intervenant ↔ autre intervenant ou personnel refusé');

    // 2. Déposer « Ferraillage » par-dessus « Coffrage » : elle monte.
    const avant = [await carte(page, 'Coffrage'), await carte(page, 'Ferraillage')];
    verifier(avant[0] && avant[1] && avant[0].y < avant[1].y, 'départ : Coffrage au-dessus de Ferraillage (' + (avant[0] && avant[0].y) + ' / ' + (avant[1] && avant[1].y) + ')');
    const cible = await glisser(page, avant[1], { cx: avant[0].cx + 20, cy: avant[0].cy }, () => page.evaluate(() => {
      const b = document.querySelector('.bulle.cible-rang');
      return { cible: b ? b.querySelector('.b-txt').textContent : '', survolCase: document.querySelectorAll('.cell.drop-hover').length };
    }));
    verifier(cible.cible === 'Coffrage' && cible.survolCase === 0, 'pendant le geste : Coffrage entourée comme cible, pas de case surlignée (' + JSON.stringify(cible) + ')');
    const apres = [await carte(page, 'Coffrage'), await carte(page, 'Ferraillage')];
    verifier(apres[1].y < apres[0].y, 'lâchée par-dessus : Ferraillage passe au-dessus de Coffrage (' + apres[1].y + ' / ' + apres[0].y + ')');
    const fer = await tache(page, 'Ferraillage');
    verifier(fer.personne === '1' && fer.iso === '2026-09-24' && fer.duree === 1, 'dates et personne de Ferraillage inchangées (' + JSON.stringify(fer) + ')');
    await page.waitForTimeout(1500);
    const bdM = await ordreBD(page, 1, '2026-09-24', 'matin'), bdA = await ordreBD(page, 1, '2026-09-24', 'aprem');
    verifier(bdM === 'Ferraillage > Coffrage' && bdA === 'Ferraillage > Coffrage', 'ordre écrit dans les deux demi-cases (' + bdM + ' ; ' + bdA + ')');
    bdApres = await page.evaluate(() => JSON.parse(JSON.stringify(window.__BD.taches)));

    // Ctrl+Z : redescend.
    await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
    const annule = [await carte(page, 'Coffrage'), await carte(page, 'Ferraillage')];
    verifier(annule[0].y < annule[1].y, 'Ctrl+Z : Coffrage de nouveau au-dessus');
    await page.keyboard.press('Control+y'); await page.waitForTimeout(300);

    // Redescendre : déposer Ferraillage (en haut) sur Coffrage (en bas).
    const r2 = [await carte(page, 'Coffrage'), await carte(page, 'Ferraillage')];
    if (r2[1].y < r2[0].y) {
      await glisser(page, r2[1], { cx: r2[0].cx - 20, cy: r2[0].cy });
      const r3 = [await carte(page, 'Coffrage'), await carte(page, 'Ferraillage')];
      verifier(r3[0].y < r3[1].y, 'déposée sur celle du dessous : Ferraillage redescend sous Coffrage');
    } else verifier(false, 'Ctrl+Y n\'a pas remis Ferraillage en haut');

    // Personnel -> personnel : permis.
    de = await carte(page, 'Rangement dépôt');
    vers = await cellule(page, 2, '2026-09-23', 'matin');
    de = await carte(page, 'Rangement dépôt');
    await glisser(page, de, vers);
    const rang = await tache(page, 'Rangement dépôt');
    verifier(rang && rang.personne === '2', 'tâche du personnel lâchée sur Mathis : déplacée (' + JSON.stringify(rang) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // Rechargement : l'ordre écrit est repris.
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1500, height: 950 }, bd: { personnes: PERSONNES, taches: bdApres } });
    const r = [await carte(page, 'Coffrage'), await carte(page, 'Ferraillage')];
    verifier(r[0] && r[1] && r[1].y < r[0].y, 'rechargement : Ferraillage toujours au-dessus de Coffrage');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3 à 6. Sans chantier, impression, logo ---------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD });

    // 4. Bulle sans chantier.
    const b = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.bulle[data-id]')].find((x) => x.querySelector('.b-txt').textContent === 'Rangement dépôt');
      const c = el.querySelector('.b-carte');
      const surface = getComputedStyle(document.body).getPropertyValue('--bg').trim();
      const tmp = document.createElement('div'); tmp.style.background = surface; document.body.appendChild(tmp);
      const attendu = getComputedStyle(tmp).backgroundColor; tmp.remove();
      return { classe: el.classList.contains('sans-chantier'), fond: getComputedStyle(c).backgroundColor, attendu, titre: el.title };
    });
    verifier(b.classe && b.fond === b.attendu && /^Aucun chantier/.test(b.titre), 'bulle sans chantier : fond neutre de la page, « Aucun chantier » au survol (' + JSON.stringify(b) + ')');

    // 3. Fiche tâche.
    const f = await page.evaluate(() => {
      const gi = giDepuisIso('2026-09-22');
      const cell = document.querySelector('.cell[data-kind="personne"][data-personne="2"][data-jour="' + gi + '"]');
      ouvrirEdition(cell, null, 'tache', 300, 300);
      const s = document.querySelector('.form-pop .f-chantier');
      return s ? { premiere: s.options[0].textContent, valeurPremiere: s.options[0].value, valeur: s.value } : null;
    });
    verifier(f && f.premiere === 'Aucun chantier' && f.valeurPremiere === '' && f.valeur === '', 'fiche tâche : « Aucun chantier » en tête, choisi sans chantier par défaut (' + JSON.stringify(f) + ')');
    await page.click('.form-pop .descriptif-texte');
    await page.fill('.form-pop .desc-edit-box textarea', 'Réunion bureau');
    await page.click('.form-pop .desc-edit-box .popup-valider');
    const saisi = 'Réunion bureau';
    await page.click('.form-pop .f-ok'); await page.waitForTimeout(1500);
    const neuve = await tache(page, saisi);
    const neuveBD = await page.evaluate((t) => window.__BD.taches.filter((r) => r.texte === t).map((r) => r.chantier_id), saisi);
    verifier(neuve && neuve.chantier === null && neuveBD.length && neuveBD.every((c) => c === null), 'enregistrée sans chantier (' + JSON.stringify({ neuve, neuveBD }) + ')');
    // Avec un chantier par défaut coché, il reste proposé en premier choix.
    const f2 = await page.evaluate(() => {
      if (popFermerActuel) popFermerActuel();
      chantierParDefaut = '26182 - Terrain de Padel';
      const gi = giDepuisIso('2026-09-21');
      ouvrirEdition(document.querySelector('.cell[data-kind="personne"][data-personne="2"][data-jour="' + gi + '"]'), null, 'tache', 300, 300);
      const v = document.querySelector('.form-pop .f-chantier').value;
      if (popFermerActuel) popFermerActuel();
      chantierParDefaut = null;
      return v;
    });
    verifier(f2 === '26182 - Terrain de Padel', 'avec un chantier par défaut : il reste pré-choisi (' + f2 + ')');

    // 5. Impression.
    await page.evaluate(() => { if (popFermerActuel) popFermerActuel(); try { localStorage.removeItem('planning.impression.reglages'); } catch (e) {} openPrintSheet(); });
    await page.waitForTimeout(300);
    const leg = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.impression-modal .print-legend .legend-item')];
      const d = items[items.length - 1];
      const sw = d && d.querySelector('.sw');
      return { dernier: d ? d.textContent.trim() : '', autre: !!(sw && sw.classList.contains('sw-autre')), fond: sw ? getComputedStyle(sw).backgroundColor : '' };
    });
    verifier(leg.dernier === 'Autre' && leg.autre && leg.fond === 'rgb(255, 255, 255)', 'impression : « Autre » en dernier dans la légende, pastille blanche (' + JSON.stringify(leg) + ')');
    const fondImpr = await page.evaluate(() => {
      const cel = [...document.querySelectorAll('.impression-modal .print-doc *')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Rangement dépôt');
      let el = cel; while (el && getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)') el = el.parentElement;
      return el ? getComputedStyle(el).backgroundColor : '';
    });
    verifier(fondImpr === 'rgb(255, 255, 255)', 'impression : tâche sans chantier sans couleur (' + fondImpr + ')');
    await page.click('.impr-reglages summary').catch(() => {});
    await page.click('[data-r="rendu"][value="nb"]'); await page.waitForTimeout(300);
    const nb = await page.evaluate(() => [...document.querySelectorAll('.impression-modal .print-chantier')].map((e) => e.textContent));
    verifier(nb.indexOf('Autre') >= 0 && nb.indexOf('26182 - Terrain de Padel') >= 0, 'noir et blanc : « Autre » écrit pour la tâche sans chantier (' + [...new Set(nb)].join(' | ') + ')');
    await page.evaluate(() => { const b = document.querySelector('.impression-modal .impr-fermer, .impression-modal [data-action="fermer"]'); if (b) b.click(); });

    // 7. Icône « Important » (message suivant de Lionel : « icone attention,
    //    Triangle avec point d'exclamation. »).
    const imp = await page.evaluate(() => ({ tri: /<path d="M10 2\.8 18\.2 16\.8H1\.8Z"/.test(ICONS.important), sel: document.querySelector('#selImportant svg').innerHTML.indexOf('M10 2.8') >= 0 }));
    verifier(imp.tri && imp.sel, 'Important : triangle d\'attention avec point d\'exclamation (barre de sélection) (' + JSON.stringify(imp) + ')');

    // 6. Logo.
    const logo = await page.evaluate(() => {
      const nav = document.querySelector('.marque-nav'), img = nav.querySelector('img');
      const rn = nav.getBoundingClientRect(), ri = img.getBoundingClientRect();
      const bord = parseFloat(getComputedStyle(nav).borderRightWidth) || 0;
      return { gauche: Math.round((ri.left - rn.left) * 10) / 10, droite: Math.round((rn.right - bord - ri.right) * 10) / 10 };
    });
    verifier(logo.gauche >= 6 && Math.abs(logo.gauche - logo.droite) <= 1, 'logo centré gauche/droite dans sa case (' + JSON.stringify(logo) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // Téléphone : logo aussi centré.
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 820 }, hasTouch: true, bd: BD });
    const logo = await page.evaluate(() => {
      const nav = document.querySelector('.marque-nav'); if (!nav || !nav.offsetWidth) return { cache: true };
      const img = nav.querySelector('img'), rn = nav.getBoundingClientRect(), ri = img.getBoundingClientRect();
      const bord = parseFloat(getComputedStyle(nav).borderRightWidth) || 0;
      return { gauche: Math.round(ri.left - rn.left), droite: Math.round(rn.right - bord - ri.right) };
    });
    verifier(logo.cache || Math.abs(logo.gauche - logo.droite) <= 1, 'téléphone : logo centré (ou masqué) (' + JSON.stringify(logo) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
