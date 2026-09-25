const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 47) — Lionel : « Un résumé facilement
// accessible des statuts à réserver serait bien aussi. Regrouper les
// onglets fériés et horaires. Nom d'onglet horaires, placer le calendrier
// en haut de page et les horaires en bas de page. »
// Résumé : js/a-reserver.js (#btnAReserver) ; onglet : htmlPageHoraires
// (js/coquille.js), page-feries.js, page-horaires.js.
//
// Lancer : node test_suite47.js

const CAPTURES = process.env.CAPTURE_DIR || null;
const T = (id, pid, date, demi, texte, ch, st) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: ch || 1, statut_id: st || null });
const P = (id, nom, ordre, st) => ({ id, nom, sous_traitant: !!st, equipe: false, ordre, actif: true });
const BD = {
  personnes: [P(1, 'Lionel', 1), P(2, 'Mathis', 2), P(4, 'Béton/Armature', 4, 1), P(5, 'Echafaudage', 5, 1)],
  chantiers: [{ id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 }, { id: 2, nom: '26150 - Villa Bine', couleur: '#bfe0c9', actif: true, ordre: 2 }],
  statuts: [{ id: 1, cle: 'areserver', nom: 'à réserver', couleur: '#f9c8c8', ordre: 1 }, { id: 2, cle: 'reserve', nom: 'réservé', couleur: '#eec79b', ordre: 2 }, { id: 3, cle: 'confirme', nom: 'Confirmé', couleur: '#aee1a8', ordre: 3 }],
  taches: [
    T(1, 1, '2026-09-21', 'matin', 'Grue', 1, 1), // passée : pas comptée
    T(2, 4, '2026-09-28', 'matin', 'Pompe à béton', 2, 1),
    T(3, 5, '2026-10-01', 'matin', 'Montage échafaudage', 1, 1), T(4, 5, '2026-10-01', 'aprem', 'Montage échafaudage', 1, 1),
    T(5, 5, '2026-10-02', 'matin', 'Montage échafaudage', 1, 1), T(6, 5, '2026-10-02', 'aprem', 'Montage échafaudage', 1, 1),
    T(7, 5, '2026-10-05', 'matin', 'Montage échafaudage', 1, 1), // lundi suivant : même plage
    T(8, 2, '2026-11-16', 'aprem', 'Location nacelle', 1, 1),
    T(9, 4, '2026-09-25', 'matin', 'Livraison armature', 2, 2),
    T(10, 1, '2026-09-24', 'matin', 'Coffrage', 1, null)
  ]
};

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Résumé « À réserver » ---
  for (const largeur of [1400, 360]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: 820 }, hasTouch: largeur < 600, bd: BD });
    await page.waitForTimeout(1800);
    const b = await page.evaluate(() => {
      const btn = document.getElementById('btnAReserver'), r = btn.getBoundingClientRect(), badge = btn.querySelector('.compte-a-reserver');
      return { visible: r.width > 0 && !!btn.closest('#legendeBarre') && !btn.closest('#toolbarSecondaire'), compte: badge.hidden ? '' : badge.textContent,
        fond: getComputedStyle(badge).backgroundColor, titre: btn.title, deborde: document.documentElement.scrollWidth > window.innerWidth + 1 };
    });
    verifier(b.visible && b.compte === '3' && b.fond === 'rgb(249, 200, 200)' && b.titre === 'À réserver — 3 tâches à partir d’aujourd’hui' && !b.deborde,
      largeur + ' px : bouton dans la barre, compteur 3 à la couleur du statut (' + JSON.stringify(b) + ')');
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s47-barre-' + largeur + '.png' });

    await page.click('#btnAReserver');
    await page.waitForTimeout(300);
    const l = await page.evaluate(() => ({
      chips: [...document.querySelectorAll('.pop-a-reserver .ar-statuts .chip')].map((c) => c.textContent.trim() + (c.classList.contains('actif') ? '*' : '')).join(' | '),
      lignes: [...document.querySelectorAll('.pop-a-reserver .ar-ligne')].map((li) => [...li.children].map((c) => c.textContent).join(' / ')),
      dansEcran: (() => { const r = document.querySelector('.pop-a-reserver').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight; })()
    }));
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s47-resume-' + largeur + '.png' });
    verifier(l.chips === 'À réserver 3* | Réservé 1 | Confirmé 0', largeur + ' px : pastilles par statut avec leurs nombres (' + l.chips + ')');
    verifier(l.lignes.join(' ‖ ') === 'Lun. 28 sept., matin / Béton/Armature / Pompe à béton / 26150 - Villa Bine ‖ ' +
      'Jeu. 1 oct. → Lun. 5 oct. / Echafaudage / Montage échafaudage / 26182 - Terrain de Padel ‖ ' +
      'Lun. 16 nov., après-midi / Mathis / Location nacelle / 26182 - Terrain de Padel',
      largeur + ' px : 3 lignes triées par date, plage sur le week-end regroupée, passée exclue (' + l.lignes.join(' ‖ ') + ')');
    verifier(l.dansEcran, largeur + ' px : liste entièrement à l\'écran');

    await page.click('.pop-a-reserver .ar-statuts .chip[data-statut="reserve"]');
    const reserve = await page.$$eval('.pop-a-reserver .ar-ligne', (ls) => ls.map((l) => l.textContent));
    verifier(reserve.length === 1 && /Ven\. 25 sept\., matin.*Livraison armature/.test(reserve[0]), largeur + ' px : pastille « Réservé » — sa liste (' + reserve.join() + ')');
    await page.click('.pop-a-reserver .ar-statuts .chip[data-statut="confirme"]');
    verifier(await page.$eval('.pop-a-reserver .ar-vide', (e) => e.textContent) === 'Aucune tâche « Confirmé » à partir d’aujourd’hui.', largeur + ' px : statut vide — message');
    await page.click('.pop-a-reserver .ar-statuts .chip[data-statut="areserver"]');
    await page.click('.pop-a-reserver .ar-ligne >> nth=1');
    await page.waitForTimeout(600);
    const apres = await page.evaluate(() => ({ ouvert: !!document.querySelector('.pop-a-reserver'), semaine: etat.semaines[etat.indexSemaine].debut, jour: typeof jourMobileIso !== 'undefined' ? jourMobileIso : null }));
    verifier(!apres.ouvert && apres.semaine === '2026-09-28' && (largeur > 600 || apres.jour === '2026-10-01'),
      largeur + ' px : clic sur une ligne — liste fermée, planning sur ce jour (' + JSON.stringify(apres) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // Tablette (820 px) : « À réserver » replié dans « ⋮ » après Zoom et
  // Masquages — la navigation des semaines reste dans la barre ; pastille
  // sur « ⋮ », résumé ouvert depuis le menu.
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 820, height: 1000 }, bd: BD });
    await page.waitForTimeout(1800);
    const t = await page.evaluate(() => ({
      replie: !!document.querySelector('#toolbarSecondaire #groupeAReserver'), nav: !!document.querySelector('#legendeBarre > #groupeNavSemaine'),
      point: getComputedStyle(document.getElementById('btnPlusOutils'), '::after').backgroundColor
    }));
    verifier(t.replie && t.nav && t.point === 'rgb(249, 200, 200)', '820 px : replié dans « ⋮ », navigation gardée dans la barre, pastille sur « ⋮ » (' + JSON.stringify(t) + ')');
    await page.click('#btnPlusOutils');
    const ligne = await page.$eval('#btnAReserver', (b) => b.innerText.replace(/\s+/g, ' ').trim());
    await page.click('#btnAReserver');
    await page.waitForTimeout(300);
    verifier(ligne === 'À réserver 3' && await page.$$eval('.pop-a-reserver .ar-ligne', (l) => l.length) === 3, '820 px : ligne « À réserver 3 » du menu, résumé ouvert (' + ligne + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. Onglet Horaires = calendrier (ex-Fériés) + horaires ---
  const HORAIRES = [{ id: 1, date_debut: '2026-09-01', date_fin: '2026-09-30', matin_debut: '07:00:00', matin_fin: '12:00:00', aprem_debut: '13:00:00', aprem_fin: '17:15:00', pause_matin: 15 }];
  const FERIES = [{ date: '2026-09-21', libelle: 'Lundi du Jeûne fédéral', categorie: 'ferie' }];
  const allerHoraires = (page) => page.evaluate(() => document.querySelector('.onglet[data-page="horaires"]').click()).then(() => page.waitForTimeout(300));
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: { horaires: HORAIRES, feries: FERIES } });
    const onglets = await page.evaluate(() => [...document.querySelectorAll('.onglets-liste .onglet')].map((o) => o.textContent.trim()).join(','));
    verifier(!/Fériés/.test(onglets) && (onglets.match(/Horaires/g) || []).length === 1,
      'plus d\'onglet Fériés, un seul onglet Horaires (' + onglets + ')');
    await allerHoraires(page);
    const pg = await page.evaluate(() => {
      const top = (s) => document.querySelector(s).getBoundingClientRect().top;
      return { h1: document.querySelector('#page-horaires h1').textContent, blocs: [...document.querySelectorAll('#page-horaires .bloc-horaires h2')].map((h) => h.textContent).join(','),
        ordre: top('#ferieCalendrier') < top('#horairesListe'), annee: document.getElementById('horaireAnneeLabel').textContent,
        total: document.querySelector('#ferieCalendrier tfoot td.mois').textContent, h24: document.querySelector('#ferieCalendrier td[data-m="8"][data-j="24"]').textContent,
        periodes: document.querySelectorAll('#horairesListe .horaire-ligne').length, anciens: !!document.getElementById('page-feries') };
    });
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s47-horaires-1400.png', fullPage: true });
    verifier(pg.h1 === 'Horaires' && pg.blocs === 'Calendrier,Horaires de travail' && pg.ordre && !pg.anciens,
      'onglet Horaires : calendrier en haut, horaires de travail en bas (' + JSON.stringify(pg) + ')');
    verifier(pg.annee === '2026' && pg.total === 'Total travaillé 2026' && pg.h24 === '9.00' && pg.periodes === 1, 'même année 2026 pour les 2 blocs, 9.00 h le jeudi 24 septembre');
    await page.click('#horaireAnneeSuiv');
    const a27 = await page.evaluate(() => ({ annee: document.getElementById('horaireAnneeLabel').textContent, total: document.querySelector('#ferieCalendrier tfoot td.mois').textContent, copier: document.getElementById('btnCopierHoraires').textContent, vide: !!document.querySelector('#horairesListe .horaires-vide') }));
    verifier(a27.annee === '2027' && a27.total === 'Total travaillé 2027' && a27.copier === 'Copier depuis 2026' && a27.vide, '→ : calendrier ET horaires passent en 2027 (' + JSON.stringify(a27) + ')');
    await page.click('#horaireAnneePrec');
    await page.fill('#horairesListe [data-champ="matinDebut"]', '07:30');
    await page.click('#btnEnregistrerHoraires');
    await page.waitForTimeout(500);
    const h24 = await page.$eval('#ferieCalendrier td[data-m="8"][data-j="24"]', (e) => e.textContent);
    verifier(h24 === '8.50', 'horaires enregistrés : le calendrier juste au-dessus suit tout de suite (8.50 h, ' + h24 + ')');
    await page.click('#ferieCalendrier td[data-m="8"][data-j="25"]');
    await page.click('#btnEnregistrerFeries');
    await page.waitForTimeout(500);
    const f = await page.evaluate(() => __BD.feries.map((x) => x.date).sort().join(','));
    verifier(f === '2026-09-21,2026-09-25', 'calendrier : un jour coloré puis Enregistrer — écrit en base comme avant (' + f + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: { horaires: HORAIRES, feries: FERIES } });
    await allerHoraires(page);
    const barres = () => page.evaluate(() => {
      const nav = document.querySelector('.nav-bas').getBoundingClientRect().top;
      const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { colle: Math.abs(b.bottom - nav) <= 1, visible: b.bottom > 0 && b.top < nav, entiere: b.top >= 0 && b.bottom <= nav + 1 }; };
      return { cal: r('#blocCalendrier .actions-feries'), hor: r('#blocHoraires .actions-feries'), largeur: document.documentElement.scrollWidth };
    });
    const haut = await barres();
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s47-horaires-390-haut.png' });
    verifier(haut.cal.colle && haut.cal.visible && !haut.hor.visible && haut.largeur <= 390, 'téléphone, en haut : barre du calendrier collée au-dessus de la barre du bas (' + JSON.stringify(haut) + ')');
    await page.evaluate(() => document.getElementById('blocHoraires').scrollIntoView());
    await page.waitForTimeout(200);
    const bas = await barres();
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s47-horaires-390-bas.png' });
    // Bas de page : chaque barre à sa place, sous son bloc — celle des
    // horaires entière, au-dessus de la barre du bas.
    verifier(bas.hor.entiere && bas.hor.visible, 'téléphone, sur les horaires : leur barre (Copier / Ajouter / Enregistrer) entière au-dessus de la barre du bas (' + JSON.stringify(bas) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Tâche existante hors série → série (reste non câblé jusqu'ici) ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD });
    await page.evaluate(() => {
      window.__SERIES = [];
      const inv = sbClient.functions.invoke;
      sbClient.functions.invoke = function (nom, opts) { if (nom === 'enregistrer-serie') window.__SERIES.push(opts.body); return inv.apply(this, arguments); };
      ouvrirEdition(null, TACHES.find((t) => t.texte === 'Coffrage'), null, 200, 200);
    });
    await page.waitForTimeout(150);
    verifier(await page.evaluate(() => !!document.querySelector('.form-pop .f-serie') && !document.querySelector('.form-pop .serie-info-existante')),
      'fiche d\'une tâche existante hors série : case « Série (se répète) » proposée');
    await page.click('.form-pop .f-lien-plus');
    await page.check('.form-pop .f-serie');
    await page.fill('.form-pop .serie-nb', '3');
    await page.click('.form-pop .f-ok');
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => ({ coffrage: __BD.taches.filter((t) => t.texte === 'Coffrage').length, series: window.__SERIES,
      toast: document.getElementById('toast').textContent }));
    const p0 = r.series[0] || {};
    verifier(r.coffrage === 0 && r.series.length === 1 && p0.personneId === 1 && p0.texte === 'Coffrage' && p0.dateDebutIso === '2026-09-24' &&
      p0.frequence === 'semaine' && p0.finType === 'occurrences' && p0.finValeur === 3 && p0.chantierId === 1 && p0.duree === 1 && p0.demiDebut === 'matin',
      'Enregistrer : tâche d\'origine retirée de la base, puis série créée à sa date (' + JSON.stringify(r) + ')');
    verifier(r.toast === 'Série créée à partir de cette tâche.', 'message : ' + r.toast);
    // Une tâche déjà en série garde son bandeau, pas de 2e case.
    await page.evaluate(() => { const t = TACHES.find((x) => x.texte === 'Pompe à béton') || TACHES[0]; t.serieId = 99; ouvrirEdition(null, t, null, 200, 200); });
    await page.waitForTimeout(150);
    verifier(await page.evaluate(() => !document.querySelector('.form-pop .f-serie') && !!document.querySelector('.form-pop .serie-info-existante')),
      'tâche déjà en série : bandeau « Événement récurrent », pas de case');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
