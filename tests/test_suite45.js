const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 45) — Lionel : « Aperçu avant impression :
// - option pour afficher/masquer le ligne matin | aprem - impression noir
// et blanc à la place de couleurs chantiers. Mise en page : - Possibilité
// de choisir d'afficher les dates sous différentes formes, différents
// formats. » Ses réponses (questions posées) : noir et blanc « Les deux au
// choix » (niveaux de gris ou noir et blanc pur — niveaux de gris retiré
// en suite 46, « les imprimantes gèrent ça ») ; dates : « En-têtes des
// jours, Afficher le mois dans la case du jour enlève la ligne du mois car
// redondant. Idem pour l'année ».
// Aperçu : openPrintSheet (js/impression.js) ; onglet : js/page-mise-en-page.js.
//
// Lancer : node test_suite45.js

const T = (id, pid, date, demi, texte, ch, st, imp) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: ch || 1, statut_id: st || null, important: !!imp });
const P = (id, nom, ordre, st) => ({ id, nom, sous_traitant: !!st, equipe: false, ordre, actif: true });
const BD = {
  personnes: [P(1, 'Lionel', 1), P(2, 'Mathis', 2), P(3, 'Antoine', 3), P(4, 'Béton/Armature', 4, 1)],
  chantiers: [{ id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 }, { id: 2, nom: '26150 - Villa Bine', couleur: '#bfe0c9', actif: true, ordre: 2 }],
  statuts: [{ id: 1, cle: 'reserve', nom: 'Réservé', couleur: '#f3c6c6', ordre: 1 }],
  taches: [T(1, 1, '2026-09-21', 'matin', 'Gabarits'), T(2, 1, '2026-09-21', 'aprem', 'Gabarits'), T(3, 2, '2026-09-22', 'matin', 'Décoffrage dalle', 2, null, true),
    T(4, 4, '2026-09-23', 'matin', 'Livraison armature', 2, 1), T(5, 1, '2026-09-24', 'aprem', 'Congé')],
  jalons: [{ id: 1, date: '2026-09-22', demi: null, texte: 'Murs BA étage' }],
  notes: [{ id: 1, date: '2026-09-23', demi: null, texte: 'Grue' }]
};

// Fonds (couleur calculée) de tout ce qui est dessiné dans le tableau et la
// légende : neutre = gris (r = g = b) ou transparent.
const fonds = (page) => page.evaluate(() => {
  const doc = document.querySelector('.impression-modal .print-doc');
  const lus = [...doc.querySelectorAll('.print-table *, .print-legend *')].map((e) => getComputedStyle(e).backgroundColor);
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const neutre = (c) => { const v = rgb(c); return v[3] === 0 || (v[0] === v[1] && v[1] === v[2]); };
  const imp = doc.querySelector('.print-important'), nom = doc.querySelector('.print-table tbody td');
  return {
    colores: [...new Set(lus.filter((c) => !neutre(c)))],
    distincts: [...new Set(lus.filter((c) => rgb(c)[3] !== 0))],
    importantNoir: !!imp && getComputedStyle(imp).color === getComputedStyle(nom).color,
    chantiers: [...doc.querySelectorAll('.print-chantier')].map((c) => c.textContent),
    legende: !!doc.querySelector('.print-legend'),
    absence: getComputedStyle([...doc.querySelectorAll('.print-bande')].find((b) => b.textContent === 'Congé')).backgroundColor,
    jalon: getComputedStyle(doc.querySelector('.print-jalons td.filled')).backgroundColor
  };
});
const entete = (page) => page.evaluate(() => {
  const doc = document.querySelector('.impression-modal .print-doc');
  const coin = doc.querySelector('.coin-semaine');
  return {
    demis: doc.querySelectorAll('tr.print-demis').length, mois: doc.querySelectorAll('tr.print-mois').length, rowspan: coin.rowSpan,
    coin: coin.textContent, annee: (coin.querySelector('.coin-annee-semaine') || {}).textContent || '',
    jours: [...doc.querySelectorAll('tr.print-jours th:not(.coin-semaine)')].map((t) => t.textContent),
    demiCols: [...doc.querySelectorAll('col.col-demi')].map((c) => c.getBoundingClientRect().width),
    cale: (() => { const c = doc.querySelector('tfoot.print-cale'); return c ? { h: c.getBoundingClientRect().height, vis: getComputedStyle(c.querySelector('td:nth-child(2)')).visibility } : null; })(),
    hauteur: doc.querySelector('.print-table').getBoundingClientRect().height
  };
});
const ouvrirApercu = async (page) => {
  await page.evaluate(() => { if (popFermerActuel) popFermerActuel(); openPrintSheet(); });
  await page.waitForTimeout(200);
  await page.click('.impr-reglages summary');
};

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Aperçu : ligne Matin / Aprem, rendus ---
  for (const largeur of [1300, 360]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: 900 }, bd: BD });
    await page.evaluate(() => { try { localStorage.removeItem('planning.impression.reglages'); } catch (e) {} });
    await ouvrirApercu(page);
    const panneau = await page.evaluate(() => ({
      legendes: [...document.querySelectorAll('.impr-reglages fieldset legend')].map((l) => l.textContent),
      demis: document.querySelector('[data-r="demis"]').checked,
      rendus: [...document.querySelectorAll('[data-r="rendu"]')].map((r) => r.value + (r.checked ? '*' : '') + ':' + r.closest('label').textContent.replace(/\s+/g, ' ').trim()),
      ancienneCase: !!document.querySelector('[data-r="couleurs"]')
    }));
    verifier(panneau.legendes.join() === 'Afficher,Couleurs,Personnes' && panneau.demis && !panneau.ancienneCase &&
      panneau.rendus.join(' | ') === 'couleurs*:Couleurs des chantiers | nb:Noir et blanc(sans fond, nom du chantier écrit)',
      largeur + ' px : « Ligne Matin / Aprem » cochée, fieldset Couleurs à 2 choix (Niveaux de gris retiré en suite 46), « Couleurs des chantiers » par défaut (' + panneau.rendus.join(' | ') + ')');

    // Ligne Matin / Aprem.
    let e = await entete(page);
    const avec = e;
    verifier(e.demis === 1 && e.rowspan === 2 && !e.cale, largeur + ' px : par défaut, ligne Matin / Aprem sous les jours (coin sur 2 lignes)');
    await page.click('[data-r="demis"]');
    e = await entete(page);
    const garde = e.demiCols.every((w, i) => w >= avec.demiCols[i] * 0.9);
    verifier(e.demis === 0 && e.rowspan === 1 && e.hauteur < avec.hauteur - 10,
      largeur + ' px : décochée — plus de ligne Matin / Aprem, coin sur 1 ligne, tableau moins haut (' + Math.round(avec.hauteur) + ' → ' + Math.round(e.hauteur) + ' px)');
    verifier(garde && e.cale && e.cale.h <= 2 && e.cale.vis === 'hidden',
      largeur + ' px : demi-colonnes gardent leur largeur (' + avec.demiCols.map(Math.round).join('/') + ' → ' + e.demiCols.map(Math.round).join('/') + '), ligne de calage invisible (' + JSON.stringify(e.cale) + ')');
    verifier(await page.evaluate(() => document.activeElement && document.activeElement.dataset.r === 'demis'), largeur + ' px : focus resté sur la case après reconstruction du panneau');

    // Couleurs (défaut) : fonds colorés.
    let f = await fonds(page);
    verifier(f.colores.length >= 4 && f.legende && f.chantiers.length === 0 && !f.importantNoir,
      largeur + ' px : Couleurs des chantiers — fonds colorés (' + f.colores.length + '), légende, pas de nom écrit, important en rouge');

    // Noir et blanc.
    await page.click('[data-r="rendu"][value="nb"]');
    f = await fonds(page);
    const leg = await page.evaluate(() => { const c = document.querySelector('[data-r="legende"]'); return { grise: c.disabled, note: c.closest('label').textContent }; });
    verifier(f.colores.length === 0 && !f.legende && leg.grise && /inutile en noir et blanc/.test(leg.note) && f.chantiers.length === 3 && f.importantNoir,
      largeur + ' px : Noir et blanc — aucun fond coloré, noms écrits, légende retirée et grisée (' + leg.note.trim() + ')');
    verifier(await page.evaluate(() => { const a = document.activeElement; return a && a.dataset.r === 'rendu' && a.value === 'nb' && a.checked; }), largeur + ' px : focus sur « Noir et blanc » après reconstruction');
    await page.emulateMedia({ media: 'print' });
    const np = await fonds(page);
    await page.emulateMedia({ media: 'screen' });
    verifier(np.distincts.every((c) => c === 'rgb(255, 255, 255)'),
      largeur + ' px : Noir et blanc à l\'impression — seulement du blanc (' + np.distincts.join(' ; ') + ')');

    // Retenu, puis Réinitialiser.
    await ouvrirApercu(page);
    const retenu = await page.evaluate(() => ({ demis: document.querySelector('[data-r="demis"]').checked, rendu: document.querySelector('[data-r="rendu"]:checked').value, lignes: document.querySelectorAll('tr.print-demis').length }));
    verifier(!retenu.demis && retenu.rendu === 'nb' && retenu.lignes === 0, largeur + ' px : réouverture — ligne masquée et noir et blanc retenus (' + JSON.stringify(retenu) + ')');
    await page.click('.impr-reglages .f-reinit');
    const reinit = await page.evaluate(() => ({ demis: document.querySelector('[data-r="demis"]').checked, rendu: document.querySelector('[data-r="rendu"]:checked').value, lignes: document.querySelectorAll('tr.print-demis').length }));
    verifier(reinit.demis && reinit.rendu === 'couleurs' && reinit.lignes === 1, largeur + ' px : Réinitialiser — ligne Matin / Aprem et couleurs revenues');
    if (largeur === 360) {
      const deborde = await page.evaluate(() => { const m = document.querySelector('.impr-reglages'); return m.scrollWidth > m.clientWidth + 1; });
      verifier(!deborde, '360 px : panneau sans défilement horizontal');
    }
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. Ancien réglage « Couleurs des chantiers » décoché (suite 38) ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1300, height: 900 }, bd: BD,
      localStorage: { 'planning.impression.reglages': JSON.stringify({ horaires: true, jalons: true, notes: true, intervenants: true, legende: true, statuts: true, couleurs: false, vides: false, masques: {} }) } });
    await ouvrirApercu(page);
    const r = await page.evaluate(() => ({ rendu: document.querySelector('[data-r="rendu"]:checked').value, demis: document.querySelector('[data-r="demis"]').checked }));
    verifier(r.rendu === 'nb' && r.demis, 'ancien réglage « Couleurs des chantiers » décoché : repris en Noir et blanc, ligne Matin / Aprem affichée (' + JSON.stringify(r) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Mise en page : dates des en-têtes de jours ---
  const upserts = (page) => page.evaluate(() => window.__ECRITURES.filter((e) => e.indexOf('reglages:upsert:') === 0).map((e) => JSON.parse(e.slice(16))[0]));
  for (const largeur of [1300, 360]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: 900 }, bd: Object.assign({ reglages: [] }, BD) });
    await ouvrirApercu(page);
    let e = await entete(page);
    verifier(e.mois === 1 && e.jours.join() === 'Lun 21,Mar 22,Mer 23,Jeu 24,Ven 25' && e.coin === 'Semaine 39',
      largeur + ' px : par défaut, comme avant — ligne des mois, « Lun 21 », « Semaine 39 » (' + e.jours.join() + ')');
    await page.evaluate(() => { if (popFermerActuel) popFermerActuel(); afficherPage('mise-en-page'); });
    await page.waitForTimeout(200);
    let o = await page.evaluate(() => ({
      legendes: [...document.querySelectorAll('#mepFormulaire legend')].map((l) => l.textContent).join(),
      options: [...document.querySelectorAll('select[data-g="dates"]')].map((s) => s.dataset.k + '=' + [...s.options].map((x) => x.textContent).join('|')),
      annee: document.querySelector('[data-g="dates"][data-k="annee"]').disabled,
      aide: document.querySelector('.mep-aide-dates').textContent
    }));
    verifier(/Colonnes,Dates,Espacements/.test(o.legendes) && o.options.join(' ; ') === 'jour=Abrégé : Lun|Complet : Lundi|Initiale : L|Masqué ; mois=Ligne au-dessus des jours|Dans la case : 21.09|Dans la case : 21 sept.|Dans la case : 21 septembre' &&
      o.annee && /« Lun 21 » — mois et année sur la ligne au-dessus des jours/.test(o.aide),
      largeur + ' px : onglet — fieldset Dates après Colonnes, Année grisée tant que le mois est sur sa ligne (' + o.aide + ')');
    await page.focus('select[data-g="dates"][data-k="mois"]');
    await page.selectOption('select[data-g="dates"][data-k="mois"]', 'abrege');
    await page.waitForTimeout(100);
    o = await page.evaluate(() => ({ annee: document.querySelector('[data-g="dates"][data-k="annee"]').disabled, aide: document.querySelector('.mep-aide-dates').textContent,
      focus: document.activeElement.dataset.k }));
    verifier(!o.annee && o.focus === 'mois' && /« Lun 21 sept\. » — plus de ligne des mois ; l’année passe dans le coin, avec la semaine\./.test(o.aide),
      largeur + ' px : mois dans la case — case Année active, exemple à jour, focus gardé (' + o.aide + ')');
    await page.waitForTimeout(700);
    const u = (await upserts(page)).pop();
    verifier(u && u.cle === 'mise_en_page' && JSON.stringify(u.valeur.dates) === '{"jour":"abrege","mois":"abrege","annee":false}', largeur + ' px : enregistré sur le compte (' + JSON.stringify(u && u.valeur.dates) + ')');
    if (largeur === 360) {
      const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll('#mepFormulaire fieldset')].some((f) => f.scrollWidth > f.clientWidth + 1));
      verifier(!deborde, '360 px : onglet sans défilement horizontal');
    }

    await ouvrirApercu(page);
    e = await entete(page);
    verifier(e.mois === 0 && e.jours.join() === 'Lun 21 sept.,Mar 22 sept.,Mer 23 sept.,Jeu 24 sept.,Ven 25 sept.' && e.annee === '2026' && e.coin === '2026Semaine 39',
      largeur + ' px : mois dans la case — ligne des mois retirée, année dans le coin au-dessus de la semaine (' + e.jours.join() + ' / ' + e.coin + ')');
    await page.evaluate(() => { if (popFermerActuel) popFermerActuel(); });
    await page.click('[data-g="dates"][data-k="annee"]');
    await ouvrirApercu(page);
    e = await entete(page);
    verifier(e.mois === 0 && e.jours[0] === 'Lun 21 sept. 2026' && e.coin === 'Semaine 39' && !e.annee,
      largeur + ' px : année dans la case aussi — plus d\'année dans le coin (' + e.jours[0] + ' / ' + e.coin + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Formats, 1er du mois, semaine à cheval sur 2 années ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1300, height: 900 }, date: '2026-12-30T10:00:00', bd: { reglages: [] } });
    const formats = await page.evaluate(() => {
      const m = normaliserMiseEnPage_({});
      const f = (jour, mois, annee, iso) => { m.dates = { jour, mois, annee }; return libelleJourImpression(m, iso); };
      return [f('abrege', 'masque', false, '2026-09-01'), f('complet', 'chiffres', true, '2026-09-21'), f('initiale', 'complet', false, '2026-10-01'),
        f('masque', 'abrege', true, '2027-01-01'), f('complet', 'masque', true, '2026-09-24'), f('abrege', 'abrege', false, '2026-02-02')];
    });
    verifier(formats.join(' | ') === 'Mar 01 | Lundi 21.09.2026 | J 1er octobre | 1er janv. 2027 | Jeudi 24 | Lun 2 févr.',
      'formats : ' + formats.join(' | ') + ' (année jamais sans le mois dans la case)');
    const norm = await page.evaluate(() => JSON.stringify(normaliserMiseEnPage_({ dates: { jour: 'x', mois: 12, annee: 'oui' } }).dates));
    verifier(norm === '{"jour":"abrege","mois":"masque","annee":false}', 'valeurs illisibles : dates par défaut (' + norm + ')');
    await page.evaluate(() => { const m = lireMiseEnPage(); m.dates = { jour: 'abrege', mois: 'chiffres', annee: false }; enregistrerMiseEnPage(m); });
    await ouvrirApercu(page);
    const e = await entete(page);
    verifier(e.mois === 0 && e.jours.join() === 'Lun 28.12,Mar 29.12,Mer 30.12,Jeu 31.12,Ven 01.01' && e.annee === '2026 / 2027',
      'semaine du nouvel an, mois en chiffres : les 2 années dans le coin (' + e.jours.join() + ' / ' + e.annee + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
