const { chromium } = require('playwright');
const path = require('path');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 51) — proposition 10 de Lionel : « Lien de
// consultation : un lien en lecture seule à donner aux ouvriers ou aux
// sous-traitants pour qu'ils voient leur planning sur leur téléphone, sans
// pouvoir rien modifier. »
// - consultation.html + js/consultation.js : page autonome, un seul appel
//   à consultation_planning (sql/0018), ici simulé par page.route ;
// - bouton « Lien » de l'onglet Personnel (js/liens-consultation.js).
//
// Lancer : node test_suite51.js

const CAPTURES = process.env.CAPTURE_DIR || null;
const JETON = '0123456789abcdef0123456789abcdef';
const tache = (date, demi, texte, o) => Object.assign({ date, demi, ordre: 0, texte, important: false, absence: false, chantier: '26182 - Terrain de Padel', couleur: '#f7d9a8', statut: null, couleur_statut: null, equipe: null }, o || {});
function semaine(lundi) {
  const base = { personne: { nom: 'Mathis', sous_traitant: false, equipe: false }, lundi, aujourdhui: '2026-09-24', min: '2026-08-24', max: '2026-03-22'.replace('2026', '2027'), feries: [], horaires: [], taches: [] };
  if (lundi === '2026-09-21') {
    base.taches = [
      tache('2026-09-21', 'matin', 'Coffrage <b>dalle</b>', { important: true }),
      tache('2026-09-21', 'aprem', 'Pompe à béton', { statut: 'réservé', couleur_statut: '#eec79b' }),
      tache('2026-09-22', 'matin', 'Montage', { equipe: 'Équipe Gros-œuvre', chantier: '26150 - Villa Bine', couleur: '#bfe0c9' }),
      tache('2026-09-24', 'matin', 'Congé', { absence: true, chantier: null, couleur: null }),
      tache('2026-09-26', 'matin', 'Nettoyage chantier')
    ];
    base.feries = [{ date: '2026-09-25', libelle: 'Jeûne fédéral (test)' }];
    base.horaires = [
      { debut: '2026-01-01', fin: '2026-12-31', matin: '07:00–12:00', aprem: '13:00–17:00' },
      { debut: '2026-09-23', fin: '2026-09-23', matin: '07:30–12:00', aprem: null }
    ];
  }
  return base;
}

async function ouvrirConsultation(browser, opts) {
  const page = await browser.newPage({ viewport: opts.viewport || { width: 360, height: 780 }, hasTouch: true });
  const erreurs = [], appels = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.clock.setFixedTime(new Date('2026-09-24T10:00:00'));
  await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await page.route(/\/rest\/v1\/rpc\/consultation_planning/, async (r) => {
    const corps = JSON.parse(r.request().postData() || '{}');
    appels.push({ corps, entetes: r.request().headers() });
    if (opts.panne) return r.abort();
    if (corps.p_jeton !== JETON) return r.fulfill({ contentType: 'application/json', body: 'null' });
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(semaine(corps.p_lundi || '2026-09-21')) });
  });
  await page.goto('file://' + path.join(__dirname, 'consultation.html') + (opts.query != null ? opts.query : '?j=' + JETON));
  await page.waitForTimeout(400);
  return { page, erreurs, appels };
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Page de consultation ---
  {
    const { page, erreurs, appels } = await ouvrirConsultation(browser, {});
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s51-consultation.png', fullPage: true });
    verifier(appels.length === 1 && appels[0].corps.p_jeton === JETON && appels[0].corps.p_lundi === null && /^eyJ/.test(appels[0].entetes.apikey || ''),
      'un seul appel, jeton + semaine courante, clé publique (' + JSON.stringify(appels.map((a) => a.corps)) + ')');
    const r = await page.evaluate(() => ({
      nom: document.getElementById('nom').textContent, titre: document.getElementById('titreSemaine').textContent,
      jours: [...document.querySelectorAll('.jour')].map((j) => j.dataset.date + (j.classList.contains('aujourdhui') ? '*' : '')),
      heures: [...document.querySelectorAll('.jour')].map((j) => (j.querySelector('.heures') || { textContent: '' }).textContent),
      lundi: [...document.querySelectorAll('.jour[data-date="2026-09-21"] .tache')].map((t) => t.textContent),
      htmlLundi: document.querySelector('.jour[data-date="2026-09-21"] .tache .texte').innerHTML,
      fondLundi: getComputedStyle(document.querySelector('.jour[data-date="2026-09-21"] .tache')).backgroundColor,
      mardi: document.querySelector('.jour[data-date="2026-09-22"] .tache').textContent,
      mardiAprem: document.querySelector('.jour[data-date="2026-09-22"] .demi-aprem .vide') !== null,
      jeudi: document.querySelector('.jour[data-date="2026-09-24"] .tache').className,
      vendredi: document.querySelector('.jour[data-date="2026-09-25"] .ferie') && document.querySelector('.jour[data-date="2026-09-25"] .ferie').textContent,
      vendrediDemis: document.querySelectorAll('.jour[data-date="2026-09-25"] .demi').length,
      prec: document.getElementById('btnPrecedente').disabled, auj: document.getElementById('btnAujourdhui').disabled,
      deborde: document.documentElement.scrollWidth > window.innerWidth + 1,
      champs: document.querySelectorAll('input, textarea, [contenteditable]').length
    }));
    verifier(r.nom === 'Mathis' && r.titre === 'Semaine 3921 sept. – 27 sept. 2026', 'nom et semaine (' + r.nom + ' / ' + r.titre + ')');
    verifier(r.jours.join() === '2026-09-21,2026-09-22,2026-09-23,2026-09-24*,2026-09-25,2026-09-26',
      'lundi → vendredi, samedi seulement parce qu\'il a une tâche, aujourd\'hui marqué (' + r.jours.join() + ')');
    verifier(r.heures.join('|') === '07:00–12:00 · 13:00–17:00|07:00–12:00 · 13:00–17:00|07:30–12:00|07:00–12:00 · 13:00–17:00||07:00–12:00 · 13:00–17:00',
      'horaires du jour : la dernière période qui contient la date l\'emporte, rien un jour férié (' + r.heures.join('|') + ')');
    verifier(r.lundi.length === 2 && /⚑/.test(r.lundi[0]) && r.htmlLundi.indexOf('&lt;b&gt;') >= 0 && /réservé/.test(r.lundi[1]) && r.fondLundi === 'rgb(247, 217, 168)',
      'lundi : matin important (texte échappé), après-midi avec statut, couleur du chantier (' + JSON.stringify(r.lundi) + ')');
    verifier(/Montage.*26150 - Villa Bine.*Équipe Équipe Gros-œuvre/.test(r.mardi) && r.mardiAprem, 'mardi : tâche d\'équipe signalée, après-midi vide « — » (' + r.mardi + ')');
    verifier(/absence/.test(r.jeudi), 'jeudi : absence');
    verifier(/Férié — Jeûne fédéral/.test(r.vendredi || '') && r.vendrediDemis === 0, 'vendredi férié : bandeau, pas de Matin/Après-midi vides (' + r.vendredi + ')');
    verifier(!r.prec && r.auj && !r.deborde && r.champs === 0, '‹ actif, « Auj. » grisé, pas de débordement à 360 px, aucun champ modifiable');

    await page.click('#btnSuivante');
    await page.waitForTimeout(300);
    const s2 = await page.evaluate(() => ({ titre: document.getElementById('titreSemaine').textContent, jours: document.querySelectorAll('.jour').length,
      vides: document.querySelectorAll('.vide').length, auj: document.getElementById('btnAujourdhui').disabled }));
    verifier(appels[1] && appels[1].corps.p_lundi === '2026-09-28' && /^Semaine 40/.test(s2.titre) && s2.jours === 5 && s2.vides === 10 && !s2.auj,
      '› : semaine 40 demandée et affichée, 5 jours vides, « Auj. » actif (' + JSON.stringify(s2) + ')');
    // Glissement vers la droite : semaine précédente.
    await page.evaluate(() => {
      const t = (x) => [new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 300 })];
      document.dispatchEvent(new TouchEvent('touchstart', { touches: t(60), changedTouches: t(60) }));
      document.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: t(260) }));
    });
    await page.waitForTimeout(300);
    verifier(appels[2] && appels[2].corps.p_lundi === '2026-09-21', 'glissement vers la droite : semaine précédente (' + (appels[2] && appels[2].corps.p_lundi) + ')');
    await page.click('#btnSuivante'); await page.waitForTimeout(250);
    await page.click('#btnAujourdhui'); await page.waitForTimeout(250);
    verifier(appels[appels.length - 1].corps.p_lundi === null && /^Semaine 39/.test(await page.textContent('#titreSemaine')), '« Auj. » : retour à la semaine courante');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  // Bornes : première semaine consultable → ‹ grisé.
  {
    const { page, erreurs } = await ouvrirConsultation(browser, {});
    await page.evaluate(() => { document.getElementById('btnPrecedente').disabled = false; });
    await page.route(/\/rest\/v1\/rpc\/consultation_planning/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(Object.assign(semaine('2026-08-24'), { lundi: '2026-08-24' })) }));
    await page.click('#btnPrecedente'); await page.waitForTimeout(300);
    verifier(await page.$eval('#btnPrecedente', (b) => b.disabled), 'première semaine consultable : ‹ grisé');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  // Lien supprimé, lien incomplet, réseau coupé.
  for (const [cas, opts, attendu, nbAppels] of [
    ['lien supprimé', { query: '?j=ffffffffffffffffffffffffffffffff' }, /Ce lien ne marche plus/, 1],
    ['lien incomplet', { query: '?j=0123' }, /Lien incomplet/, 0],
    ['sans jeton', { query: '' }, /Lien incomplet/, 0],
    ['réseau coupé', { panne: true }, /Planning inaccessible/, 1]
  ]) {
    const { page, erreurs, appels } = await ouvrirConsultation(browser, opts);
    const t = await page.textContent('#contenu');
    const grises = await page.$$eval('.nav button', (bs) => bs.every((b) => b.disabled));
    verifier(attendu.test(t) && appels.length === nbAppels && (cas === 'réseau coupé' || grises), cas + ' : message clair (' + t + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. Onglet Personnel : bouton « Lien » ---
  for (const largeur of [1400, 360]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: 820 }, hasTouch: largeur < 600,
      bd: { liens_consultation: [{ id: 7, personne_id: 2, jeton: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', cree_le: '2026-09-20T08:00:00Z', vu_le: '2026-09-23T16:05:00' }] } });
    await page.evaluate(() => document.querySelector('.onglet[data-page="personnel"]').click());
    await page.waitForTimeout(400);
    const ligne = (nom) => '#listePersonnel .ligne-intervenant:has(b:text-is("' + nom + '"))';
    const tient = await page.$eval(ligne('Lionel'), (l) => { const r = l.getBoundingClientRect(), b = l.querySelector('.lien-consultation').getBoundingClientRect(); return b.width > 0 && b.right <= r.right + 1 && b.right <= window.innerWidth; });
    verifier(tient, largeur + ' px : bouton « Lien » sur la ligne, à l\'écran');

    // Mathis a déjà un lien.
    await page.click(ligne('Mathis') + ' .lien-consultation');
    await page.waitForSelector('.pop-lien-consultation .lc-url');
    const m = await page.evaluate(() => ({ url: document.querySelector('.lc-url').value, vu: document.querySelector('.lc-vu').textContent, titre: document.querySelector('.pop-lien-consultation .cp-titre').textContent,
      ouvrir: document.querySelector('.lc-ouvrir').getAttribute('href') }));
    verifier(/consultation\.html\?j=a{32}$/.test(m.url) && m.ouvrir === m.url && /^Dernière consultation : Mer\. 23 sept\., 16:05\.$/.test(m.vu) && /Mathis/.test(m.titre),
      largeur + ' px : lien existant — adresse, « Ouvrir », dernière consultation (' + JSON.stringify(m) + ')');
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s51-lien-' + largeur + '.png' });
    await page.click('.lc-copier');
    await page.waitForTimeout(200);
    verifier(/Lien copié/.test(await page.evaluate(() => (document.querySelector('.toast') || {}).textContent || '')), largeur + ' px : « Copier » → message');

    await page.click('.lc-nouveau');
    await page.click('.confirm-pop .c-ok');
    await page.waitForSelector('.pop-lien-consultation .lc-url');
    await page.waitForTimeout(200);
    const n = await page.evaluate(() => ({ url: document.querySelector('.lc-url').value, vu: document.querySelector('.lc-vu').textContent, bd: __BD.liens_consultation.map((l) => l.personne_id + ':' + l.jeton + ':' + l.vu_le) }));
    const nouveau = (n.url.match(/j=([0-9a-f]+)$/) || [])[1] || '';
    verifier(/^[0-9a-f]{32}$/.test(nouveau) && nouveau !== 'a'.repeat(32) && n.bd.join() === '2:' + nouveau + ':null' && n.vu === 'Pas encore ouvert.',
      largeur + ' px : « Nouveau lien » — nouveau jeton en base et à l\'écran, l\'ancien remplacé (' + JSON.stringify(n) + ')');

    await page.click('.lc-supprimer');
    await page.click('.confirm-pop .c-ok');
    await page.waitForSelector('.pop-lien-consultation .lc-creer');
    verifier(await page.evaluate(() => __BD.liens_consultation.length) === 0, largeur + ' px : « Supprimer le lien » — plus rien en base, « Créer le lien » proposé');
    await page.click('.pop-lien-consultation .f-annuler');

    // Lionel n'a pas de lien : création.
    await page.click(ligne('Lionel') + ' .lien-consultation');
    await page.waitForSelector('.pop-lien-consultation .lc-creer');
    await page.click('.lc-creer');
    await page.waitForSelector('.pop-lien-consultation .lc-url');
    const c = await page.evaluate(() => ({ url: document.querySelector('.lc-url').value, bd: __BD.liens_consultation.map((l) => l.personne_id + ':' + l.jeton) }));
    const cree = (c.url.match(/j=([0-9a-f]+)$/) || [])[1] || '';
    verifier(/^[0-9a-f]{32}$/.test(cree) && c.bd.join() === '1:' + cree, largeur + ' px : « Créer le lien » — jeton aléatoire de 32 caractères, en base (' + JSON.stringify(c) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  bilan();
})();
