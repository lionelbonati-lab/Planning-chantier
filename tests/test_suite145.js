const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 21.10.2026 (suite 145). Lionel : « J'aimerai pouvoir ajouter une
// adresse, sur un chantier, afin que mes ouvriers puisse cliquer sur le nom
// du chantier et que ça leur ouvre leur navigation gps. » Ses choix : appli
// « Au choix » ; « Lien des ouvriers,Lien responsable » ; saisie par « un
// pin sur une carte ».
// Vérifie :
//   A. sql/0040 : chantiers.latitude / longitude (contrainte : les deux ou
//      aucune, bornes), lat / lng dans consultation_planning (tâches) et
//      consultation_responsable (tâches, jalons, notes), droits inchangés,
//      le reste de 0039 gardé (tâches d'équipe recopiées sur les membres).
//   B. Réglages › Chantiers : bouton pin (bleu quand posé) ; la carte
//      (Leaflet local, tuiles et Nominatim simulés) — toucher la carte pose
//      le pin, glisser le déplace, recherche à plusieurs résultats,
//      coordonnées collées, Plan / Photo gardé par l'appareil, Enregistrer
//      → chantiers.latitude / longitude, Retirer le pin → null, Échap ;
//      plein écran sur téléphone.
//   C. Lien ouvrier (téléphone) : nom du chantier avec pin = bouton ; menu
//      Google Maps / Waze (+ Plans sur iPhone) avec les bons liens, feuille
//      en bas ; Annuler, Échap, fond, et un lien touché le referment.
//   D. Lien responsable (ordinateur) : pareil pour tâches et jalons ; menu
//      centré ; les flèches ne changent pas la semaine sous le menu.
//
// Lancer : node test_suite145.js

const JETON = '0123456789abcdef0123456789abcdef';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const BD = {
  chantiers: [
    { id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1, latitude: null, longitude: null },
    { id: 2, nom: '26150 - Villa Bine', couleur: '#bfe0c9', actif: true, ordre: 2, latitude: 46.5197, longitude: 6.6323 }]
};
// Nominatim simulé : « Lausanne » → 2 résultats, « Nulle part » → aucun.
const NOMINATIM = {
  lausanne: [{ display_name: 'Lausanne, District de Lausanne, Vaud, Suisse', lat: '46.5218269', lon: '6.6327025' },
    { display_name: 'Rue de Lausanne, Genève, Suisse', lat: '46.2154', lon: '6.1440' }],
  'nulle part': []
};

async function simulerReseauCarte(page, journal) {
  await page.route(/tile\.openstreetmap\.org|wmts\.geo\.admin\.ch/, (r) => { journal.tuiles.push(r.request().url()); r.fulfill({ contentType: 'image/png', body: PNG }); });
  await page.route(/nominatim\.openstreetmap\.org/, (r) => {
    const q = new URL(r.request().url()).searchParams.get('q');
    journal.recherches.push(r.request().url());
    r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(NOMINATIM[q.toLowerCase()] || []) });
  });
}
const etatCarte = (page) => page.evaluate(() => {
  const pop = document.querySelector('.carte-pop');
  if (!pop) return null;
  return {
    titre: pop.querySelector('.cp-titre').textContent, aide: pop.querySelector('.carte-aide').textContent,
    ok: !pop.querySelector('.carte-ok').disabled, retirer: !pop.querySelector('.carte-retirer').hidden,
    leaflet: !!pop.querySelector('.leaflet-container'), pins: pop.querySelectorAll('.carte-pin').length,
    resultats: pop.querySelector('.carte-resultats').hidden ? [] : [...pop.querySelectorAll('.carte-resultats button')].map((b) => b.textContent),
    couche: (pop.querySelector('.carte-couches button.actif') || {}).dataset ? pop.querySelector('.carte-couches button.actif').dataset.couche : null
  };
});
const boutonPin = (page, id) => page.evaluate((id) => {
  const b = document.querySelector('#page-chantiers .ligne-intervenant[data-ligne="' + id + '"] .lien-emplacement');
  return b ? { pose: b.classList.contains('a-emplacement'), titre: b.title } : null;
}, id);
const ouvrirCarte = async (page, id) => {
  await page.evaluate((id) => document.querySelector('#page-chantiers .ligne-intervenant[data-ligne="' + id + '"] .lien-emplacement').click(), id);
  await page.waitForSelector('.carte-pop .leaflet-container');
  await page.waitForTimeout(250);
};

(async () => {
  const { verifier, bilan } = verificateur();
  const erreurs = [];

  // ---- A. sql/0040 ---------------------------------------------------------
  {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', '0040_chantiers_emplacement.sql'), 'utf8');
    const ouvrier = sql.slice(sql.indexOf('create or replace function consultation_planning'), sql.indexOf('create or replace function consultation_responsable'));
    const resp = sql.slice(sql.indexOf('create or replace function consultation_responsable'));
    verifier(/alter table chantiers add column if not exists latitude double precision;/.test(sql) && /alter table chantiers add column if not exists longitude double precision;/.test(sql) &&
      /\(latitude is null and longitude is null\)\s+or \(latitude between -90 and 90 and longitude between -180 and 180\)/.test(sql),
      'sql/0040 : colonnes latitude / longitude, les deux ou aucune, dans les bornes');
    const lat = "'lat', ch.latitude, 'lng', ch.longitude";
    verifier(ouvrier.split(lat).length === 2 && resp.split(lat).length === 4,
      'sql/0040 : lat / lng avec chaque tâche de l’ouvrier, chaque tâche, jalon et note du responsable');
    verifier(/grant execute on function consultation_planning\(text, date\) to anon, authenticated;/.test(sql) && /grant execute on function consultation_responsable\(text, date\) to anon, authenticated;/.test(sql) &&
      /security definer set search_path = public/.test(ouvrier) && /security definer set search_path = public/.test(resp) &&
      /equipe_membre_\(e\.id, m\.id, t\.date, t\.demi\)/.test(resp) && !/'equipe', e\.nom|'membres'/.test(resp) && /notify pgrst, 'reload schema';/.test(sql),
      'sql/0040 : droits et sécurité inchangés, responsable toujours sans équipes (0039)');
  }

  const browser = await lancerNavigateur(chromium);

  // ---- B. Réglages › Chantiers : la carte --------------------------------
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { bd: BD });
    const journal = { tuiles: [], recherches: [] };
    await simulerReseauCarte(page, journal);
    await page.evaluate(() => document.querySelector('.onglet[data-page="chantiers"]').click());
    await page.waitForTimeout(300);

    const avant = { p1: await boutonPin(page, 1), p2: await boutonPin(page, 2),
      etat: await page.evaluate(() => etat.chantiers.map((c) => c.ligne + ':' + c.lat + ',' + c.lng).join(' ')) };
    verifier(avant.p1 && !avant.p1.pose && avant.p1.titre === 'Emplacement' && avant.p2 && avant.p2.pose && avant.p2.titre === 'Emplacement (posé)' &&
      avant.etat === '1:null,null 2:46.5197,6.6323',
      'liste des chantiers : bouton pin, bleu quand le pin est posé ; lat / lng chargés (' + JSON.stringify(avant) + ')');

    await ouvrirCarte(page, 1);
    const c0 = await etatCarte(page);
    verifier(c0 && c0.titre === 'Emplacement — 26182 - Terrain de Padel' && c0.leaflet && c0.pins === 0 && !c0.ok && !c0.retirer &&
      /Touche la carte pour poser le pin/.test(c0.aide) && c0.couche === 'plan' && journal.tuiles.some((u) => /tile\.openstreetmap\.org/.test(u)),
      'carte ouverte : Leaflet chargé, fond Plan (OpenStreetMap), sans pin, Enregistrer grisé (' + JSON.stringify(c0) + ')');

    // Toucher la carte pose le pin.
    const zone = await page.evaluate(() => { const r = document.querySelector('.carte-zone').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(zone.x - 60, zone.y + 40);
    await page.waitForTimeout(200);
    const c1 = await etatCarte(page);
    verifier(c1.pins === 1 && c1.ok && c1.retirer && /^Pin : \d+\.\d{5}, \d+\.\d{5}\. Glisse-le pour l’ajuster\.$/.test(c1.aide),
      'toucher la carte pose le pin ; Enregistrer et Retirer le pin actifs (' + c1.aide + ')');

    // Glisser le pin le déplace.
    const pin = await page.evaluate(() => { const r = document.querySelector('.carte-pin').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(pin.x, pin.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) { await page.mouse.move(pin.x + i * 15, pin.y - i * 8); await page.waitForTimeout(16); }
    await page.mouse.up();
    await page.waitForTimeout(200);
    const c2 = await etatCarte(page);
    verifier(c2.pins === 1 && c2.aide !== c1.aide && /^Pin : /.test(c2.aide), 'glisser le pin le déplace (' + c1.aide + ' → ' + c2.aide + ')');

    // Recherche : plusieurs résultats → liste ; un résultat touché pose le pin.
    await page.fill('.carte-texte', 'Lausanne');
    await page.press('.carte-texte', 'Enter');
    await page.waitForTimeout(300);
    const c3 = await etatCarte(page);
    verifier(journal.recherches.length === 1 && /format=jsonv2&limit=5&accept-language=fr&q=Lausanne$/.test(journal.recherches[0]) &&
      c3.resultats.join(' | ') === 'Lausanne, District de Lausanne, Vaud, Suisse | Rue de Lausanne, Genève, Suisse' && !!(await page.$('.carte-pop')),
      'Chercher (Entrée) : une seule recherche Nominatim, 2 résultats en liste, la boîte reste ouverte (' + JSON.stringify(c3.resultats) + ')');
    await page.click('.carte-resultats button[data-i="1"]');
    await page.waitForTimeout(300);
    const c4 = await etatCarte(page);
    verifier(c4.resultats.length === 0 && c4.aide === 'Pin : 46.21540, 6.14400. Glisse-le pour l’ajuster.', 'résultat touché : la liste se ferme, pin sur le lieu (' + c4.aide + ')');
    await page.fill('.carte-texte', 'Nulle part');
    await page.click('.carte-chercher');
    await page.waitForTimeout(300);
    const toastVide = await page.evaluate(() => document.querySelector('.toast').textContent);
    verifier(toastVide === 'Aucun résultat pour « Nulle part ».' && (await etatCarte(page)).aide === c4.aide, 'aucun résultat : message, le pin ne bouge pas (' + toastVide + ')');

    // Coordonnées collées (virgule décimale comme copiées à la main).
    await page.fill('.carte-texte', '46,2044, 6,1432');
    await page.press('.carte-texte', 'Enter');
    await page.waitForTimeout(250);
    const c5 = await etatCarte(page);
    verifier(c5.aide === 'Pin : 46.20440, 6.14320. Glisse-le pour l’ajuster.' && journal.recherches.length === 2, 'coordonnées collées : pin posé sans recherche (' + c5.aide + ')');

    // Fond Photo, gardé par l'appareil.
    await page.click('.carte-couches button[data-couche="photo"]');
    await page.waitForTimeout(300);
    const photo = { couche: (await etatCarte(page)).couche, memoire: await page.evaluate(() => localStorage.getItem('planning.carte.couche')),
      tuile: journal.tuiles.some((u) => /wmts\.geo\.admin\.ch\/1\.0\.0\/ch\.swisstopo\.swissimage\/default\/current\/3857\/\d+\/\d+\/\d+\.jpeg$/.test(u)) };
    verifier(photo.couche === 'photo' && photo.memoire === 'photo' && photo.tuile, 'fond Photo (swisstopo), gardé par l’appareil (' + JSON.stringify(photo) + ')');

    // Enregistrer.
    await page.click('.carte-ok');
    await page.waitForTimeout(400);
    const apres = await page.evaluate(() => ({ bd: __BD.chantiers.map((c) => c.id + ':' + c.latitude + ',' + c.longitude).join(' '), pop: !!document.querySelector('.carte-pop, .voile-confirm'),
      toast: document.querySelector('.toast').textContent, etat: etat.chantiers.find((c) => c.ligne === 1).lat }));
    const p1 = await boutonPin(page, 1);
    verifier(apres.bd === '1:46.2044,6.1432 2:46.5197,6.6323' && !apres.pop && apres.toast === 'Emplacement de « 26182 - Terrain de Padel » enregistré.' && apres.etat === 46.2044 && p1.pose,
      'Enregistrer : chantiers.latitude / longitude écrits, boîte fermée, pin bleu dans la liste (' + JSON.stringify(apres) + ')');

    // Chantier déjà placé : carte sur son pin, fond Photo retrouvé ; Retirer le pin.
    await ouvrirCarte(page, 2);
    const c6 = await etatCarte(page);
    const centre = await page.evaluate(() => { const r = document.querySelector('.carte-zone').getBoundingClientRect(), p = document.querySelector('.carte-pin').getBoundingClientRect();
      return Math.round(p.left + p.width / 2 - (r.left + r.width / 2)) + ',' + Math.round(p.bottom - 2 - (r.top + r.height / 2)); });
    verifier(c6.pins === 1 && c6.retirer && !c6.ok && c6.couche === 'photo' && c6.aide === 'Pin : 46.51970, 6.63230. Glisse-le pour l’ajuster.' && /^-?[0-2],-?[0-3]$/.test(centre),
      'chantier déjà placé : carte centrée sur son pin, fond Photo retrouvé, Enregistrer grisé (' + JSON.stringify(c6) + ' ; écart ' + centre + ')');
    await page.click('.carte-retirer');
    await page.waitForTimeout(150);
    const c7 = await etatCarte(page);
    verifier(c7.pins === 0 && !c7.retirer && c7.ok && /Touche la carte/.test(c7.aide), 'Retirer le pin : pin retiré, Enregistrer actif');
    await page.click('.carte-ok');
    await page.waitForTimeout(400);
    const retire = await page.evaluate(() => ({ bd: __BD.chantiers.find((c) => c.id === 2), toast: document.querySelector('.toast').textContent }));
    verifier(retire.bd.latitude === null && retire.bd.longitude === null && retire.toast === 'Pin de « 26150 - Villa Bine » retiré.' && !(await boutonPin(page, 2)).pose,
      'Enregistrer sans pin : latitude / longitude remis à vide (' + retire.toast + ')');

    // Échap et Annuler ferment sans rien écrire.
    const ecrituresAvant = await page.evaluate(() => __ECRITURES.length);
    await ouvrirCarte(page, 1);
    await page.mouse.click(zone.x + 50, zone.y - 30);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const ferme = await page.evaluate(() => !document.querySelector('.carte-pop, .voile-confirm'));
    await ouvrirCarte(page, 1);
    await page.click('.carte-annuler');
    await page.waitForTimeout(150);
    const ferme2 = await page.evaluate(() => !document.querySelector('.carte-pop, .voile-confirm'));
    // (__ECRITURES note aussi les lectures : seules les écritures comptent.)
    const ecrites = await page.evaluate((n) => __ECRITURES.slice(n).filter((x) => !/:select$/.test(x)), ecrituresAvant);
    verifier(ferme && ferme2 && ecrites.length === 0 && (await page.evaluate(() => __BD.chantiers[0].latitude)) === 46.2044,
      'Échap et Annuler ferment la carte sans rien enregistrer (' + JSON.stringify([ferme, ferme2, ecrites]) + ')');
    erreurs.push(...e);
    await page.close();
  }

  // ---- B'. Téléphone : la carte en plein écran ---------------------------
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { bd: BD, viewport: { width: 390, height: 844 }, hasTouch: true });
    await simulerReseauCarte(page, { tuiles: [], recherches: [] });
    await page.evaluate(() => { const o = document.querySelector('.onglet[data-page="chantiers"]'); if (o) o.click(); else afficherPage('chantiers'); });
    await page.waitForTimeout(300);
    await ouvrirCarte(page, 2);
    const r = await page.evaluate(() => {
      const b = (s) => { const x = document.querySelector(s).getBoundingClientRect(); return [Math.round(x.left), Math.round(x.top), Math.round(x.width), Math.round(x.height)]; };
      return { pop: b('.carte-pop'), cadre: b('.carte-cadre'), ok: b('.carte-ok'), deborde: document.querySelector('.carte-actions').scrollWidth > document.querySelector('.carte-actions').clientWidth };
    });
    verifier(r.pop.join() === '0,0,390,844' && r.cadre[3] > 450 && r.ok[1] + r.ok[3] <= 844 && !r.deborde,
      'téléphone : carte en plein écran, grande zone de carte, boutons visibles sans débordement (' + JSON.stringify(r) + ')');
    erreurs.push(...e);
    await page.close();
  }

  // ---- C. Lien ouvrier ------------------------------------------------------
  const T = (date, demi, texte, extra) => Object.assign({ date, demi, ordre: 0, texte, important: false, absence: false, partielle: false, chantier: null, couleur: null,
    statut: null, couleur_statut: null, equipe: null, lat: null, lng: null }, extra || {});
  const semaineOuvrier = { personne: { nom: 'Mathis', sous_traitant: false, equipe: false }, lundi: '2026-10-19', aujourdhui: '2026-10-21', min: '2026-09-21', max: '2027-04-19',
    feries: [], horaires: [], peut_demander: true, motifs: ['Congé'], demandes: [], absences: [],
    taches: [T('2026-10-21', 'matin', 'Coffrage dalle', { chantier: '26150 - Villa Bine', couleur: '#bfe0c9', statut: 'confirmé', couleur_statut: '#c8e6c9', lat: 46.5197, lng: 6.6323 }),
      T('2026-10-21', 'aprem', 'Rangement dépôt', { chantier: 'Dépôt', couleur: '#dddddd' }), T('2026-10-22', 'matin', 'Congé', { absence: true })] };
  async function ouvrirOuvrier(ua) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: ua });
    const page = await ctx.newPage();
    const e = [];
    page.on('pageerror', (x) => e.push(String(x)));
    await page.clock.setFixedTime(new Date('2026-10-21T10:00:00'));
    await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await page.route(/\/rest\/v1\/rpc\//, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(semaineOuvrier) }));
    await page.goto('file://' + path.join(__dirname, '..', 'consultation.html') + '?j=' + JETON);
    await page.waitForTimeout(500);
    // Un lien touché ne quitte pas la page de test (le menu se referme quand même).
    await page.evaluate(() => window.addEventListener('click', (x) => { if (x.target.closest('.gps-lien')) x.preventDefault(); }, true));
    return { ctx, page, e };
  }
  const menuGps = (page) => page.evaluate(() => {
    const m = document.querySelector('.gps-menu');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { titre: m.querySelector('.gps-titre').textContent, fond: !!document.querySelector('.gps-fond'),
      liens: [...m.querySelectorAll('.gps-lien')].map((a) => a.textContent + '=' + a.href + (a.target === '_blank' ? '' : ' (même onglet)')),
      boite: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], focus: document.activeElement && document.activeElement.textContent };
  });
  const GOOGLE = 'Google Maps=https://www.google.com/maps/dir/?api=1&destination=46.5197,6.6323&travelmode=driving';
  const WAZE = 'Waze=https://waze.com/ul?ll=46.5197,6.6323&navigate=yes';
  const PLANS = 'Plans=https://maps.apple.com/?daddr=46.5197,6.6323&dirflg=d';
  {
    const { ctx, page, e } = await ouvrirOuvrier(UA_ANDROID);
    const taches = await page.evaluate(() => [...document.querySelectorAll('.tache')].map((t) => ({ texte: t.querySelector('.texte').textContent,
      details: (t.querySelector('.details') || {}).textContent || '', gps: t.querySelectorAll('.chantier-gps').length })));
    verifier(taches.map((t) => t.texte + ':' + t.details + ':' + t.gps).join(' | ') === 'Coffrage dalle:26150 - Villa Bineconfirmé:1 | Rangement dépôt:Dépôt:0 | Congé::0',
      'ouvrier : seul le chantier avec un pin est un bouton, textes inchangés (' + JSON.stringify(taches) + ')');
    await page.tap('.chantier-gps');
    await page.waitForTimeout(200);
    const m = await menuGps(page);
    verifier(m && m.titre === 'Itinéraire vers « 26150 - Villa Bine »' && m.liens.join(' | ') === GOOGLE + ' | ' + WAZE && m.fond && m.boite[0] === 0 && m.boite[2] === 390 && m.boite[3] === 844 && m.focus === 'Google Maps',
      'ouvrier (Android) : menu en bas de l’écran, Google Maps et Waze vers le pin, sans Plans (' + JSON.stringify(m) + ')');
    await page.click('.gps-annuler');
    await page.waitForTimeout(100);
    const f1 = !(await menuGps(page));
    await page.tap('.chantier-gps'); await page.waitForTimeout(100);
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    const f2 = !(await menuGps(page));
    await page.tap('.chantier-gps'); await page.waitForTimeout(100);
    await page.mouse.click(195, 60); await page.waitForTimeout(100);
    const f3 = !(await menuGps(page)) && !(await page.$('.gps-fond'));
    await page.tap('.chantier-gps'); await page.waitForTimeout(100);
    await page.click('.gps-lien >> nth=1'); await page.waitForTimeout(100);
    const f4 = !(await menuGps(page));
    const feuille = await page.evaluate(() => document.getElementById('feuille').hidden);
    verifier(f1 && f2 && f3 && f4 && feuille, 'ouvrier : Annuler, Échap, le fond et un lien touché referment le menu (' + [f1, f2, f3, f4] + ')');
    erreurs.push(...e);
    await ctx.close();
  }
  {
    const { ctx, page, e } = await ouvrirOuvrier(UA_IPHONE);
    await page.tap('.chantier-gps');
    await page.waitForTimeout(200);
    const m = await menuGps(page);
    verifier(m && m.liens.join(' | ') === GOOGLE + ' | ' + WAZE + ' | ' + PLANS, 'ouvrier (iPhone) : Plans en plus (' + JSON.stringify(m && m.liens) + ')');
    erreurs.push(...e);
    await ctx.close();
  }

  // ---- D. Lien responsable --------------------------------------------------
  {
    const LUNDI = '2026-10-19';
    const appels = [];
    const reponse = { nom: 'Responsable', lundi: LUNDI, aujourdhui: '2026-10-21', min: LUNDI, max: '2026-11-16',
      personnes: [{ id: 1, nom: 'Marco', section: 'personnel' }, { id: 2, nom: 'Jean', section: 'personnel' }], groupes: [], ordre_groupes: [],
      taches: [{ personne: 1, date: '2026-10-20', demi: 'matin', ordre: 0, texte: 'Coffrage dalle', important: false, absence: false, chantier: '26150 - Villa Bine', couleur: '#bfe0c9',
        lat: 46.5197, lng: 6.6323, statut: null, couleur_statut: null },
      { personne: 2, date: '2026-10-20', demi: 'matin', ordre: 0, texte: 'Rangement', important: false, absence: false, chantier: 'Dépôt', couleur: '#dddddd', lat: null, lng: null, statut: null, couleur_statut: null }],
      jalons: [{ date: '2026-10-22', demi: null, texte: 'Réception', important: true, chantier: '26182 - Terrain de Padel', couleur: '#f7d9a8', lat: 46.2044, lng: 6.1432 }],
      notes: [{ date: '2026-10-23', demi: null, texte: 'Livraison', important: false, chantier: 'Dépôt', couleur: '#dddddd', lat: null, lng: null }], feries: [], horaires: [] };
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36' });
    const e = [];
    page.on('pageerror', (x) => e.push(String(x)));
    await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await page.route(/\/rest\/v1\/rpc\//, (r) => { appels.push(r.request().postData()); r.fulfill({ contentType: 'application/json', body: JSON.stringify(reponse) }); });
    await page.goto('file://' + path.join(__dirname, '..', 'responsable.html') + '?j=' + JETON);
    await page.waitForTimeout(400);
    const bulles = await page.evaluate(() => [...document.querySelectorAll('.bulle')].map((b) => b.querySelector('.texte').textContent + ':' + ((b.querySelector('.details') || {}).textContent || '') + ':' + b.querySelectorAll('.chantier-gps').length));
    verifier(bulles.sort().join(' | ') === 'Coffrage dalle:26150 - Villa Bine:1 | Livraison:Dépôt:0 | Rangement:Dépôt:0 | ⚑ Réception:26182 - Terrain de Padel:1',
      'responsable : tâches et jalons avec un pin = bouton, textes inchangés (' + bulles.join(' | ') + ')');
    await page.click('.bulle.jalon .chantier-gps');
    await page.waitForTimeout(200);
    const m = await menuGps(page);
    const milieu = m && [(m.boite[0] + m.boite[2]) / 2, (m.boite[1] + m.boite[3]) / 2];
    verifier(m && m.titre === 'Itinéraire vers « 26182 - Terrain de Padel »' &&
      m.liens.join(' | ') === 'Google Maps=https://www.google.com/maps/dir/?api=1&destination=46.2044,6.1432&travelmode=driving | Waze=https://waze.com/ul?ll=46.2044,6.1432&navigate=yes' &&
      Math.abs(milieu[0] - 700) <= 1 && Math.abs(milieu[1] - 450) <= 1,
      'responsable (ordinateur) : menu centré, liens vers le pin du jalon (' + JSON.stringify(m) + ')');
    const nAppels = appels.length;
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    const ouvert = !!(await menuGps(page));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const focus = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('chantier-gps'));
    verifier(ouvert && appels.length === nAppels && !(await menuGps(page)) && focus,
      'responsable : la flèche ne change pas la semaine sous le menu ; Échap le ferme, le focus revient au chantier');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    verifier(appels.length === nAppels + 1, 'responsable : menu fermé, la flèche change de nouveau la semaine');
    erreurs.push(...e);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(erreurs));
})();
