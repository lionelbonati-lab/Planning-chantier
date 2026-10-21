const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 21.10.2026 (suite 149). Lionel : « Les notes  peuvent aussi avoir
// des descriptifs avec les photos et des fichiers liés, même si je les
// utiliserai sûrement moins souvent. » Ses choix : comme les tâches (suite
// 147), dans la fiche ; dans la fiche du planning ET le formulaire de la page
// Notes ; visibles sur le lien responsable (le lien des ouvriers n'affiche
// pas les notes) ; pas les jalons.
// Vérifie :
//   A. Serveur : sql/0043 (colonnes, lien responsable, fichiers orphelins) ;
//      enregistrer-plage (fournis, gardés pour l'ancienne appli, jour ajouté,
//      rien écrit sans détails, retirés) ; pieces-lien (fichiers des notes).
//   B. Planning : rien d'écrit au chargement ; icône sur la bulle de la
//      note ; mêmes détails et fichiers exigés pour réunir deux jours ; fiche
//      (section, modifier, retirer, joindre, enregistrer, Annuler, envoi en
//      cours, nouvelle note) ; jalon sans section.
//   C. Copier / coller : la copie garde détails et fichiers.
//   D. Séries : changementSerie_, « Tous les événements », série créée.
//   E. Page Notes : icône dans la liste, fiche Modifier avec la section,
//      Ajouter avec un fichier, envoi en cours.
//   F. Lien responsable : bouton sur la note, fiche, adresses signées.
//
// Lancer : node test_suite149.js

const RACINE = path.join(__dirname, '..');
const JETON_R = 'fedcba9876543210fedcba9876543210fedcba98';
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const PDF = { chemin: 'fichiers/aaa/Plan.pdf', nom: 'Plan.pdf', type: 'application/pdf', taille: 123904 };
const PHOTO = { chemin: 'fichiers/bbb/Photo.jpg', nom: 'Photo.jpg', type: 'image/jpeg', taille: 2411724, vignette: 'vignettes/bbb.jpg' };
const D1 = 'Arrivée 7h\nAccès nord';
const D2 = D1 + '\nGrue 50 t';

// Note 3 sans les colonnes details/pieces : une base sans la 0043.
const note = (id, date, texte, extra) => Object.assign({ id, date, demi: null, texte, important: false, chantier_id: null, serie_id: null }, extra || {});
const BD = () => ({
  series: [{ id: 7 }],
  jalons: [{ id: 1, date: '2026-09-22', texte: 'Livraison', demi: null, important: false, chantier_id: null, serie_id: null }],
  notes: [
    note(1, '2026-09-22', 'Grue', { details: D1, pieces: [PDF, PHOTO] }),
    note(2, '2026-09-23', 'Grue', { details: D1, pieces: [PDF, PHOTO] }),
    note(3, '2026-09-24', 'Grue', { demi: 'matin' }),
    note(4, '2026-09-25', 'Tri', { details: 'Bennes', pieces: [PDF] }),
    note(5, '2026-09-24', 'Accès', { demi: 'aprem', details: 'Par le nord', pieces: [] }),
    note(6, '2026-09-21', 'Réunion', { serie_id: 7, details: null, pieces: [] }),
    note(7, '2026-09-28', 'Réunion', { serie_id: 7, details: null, pieces: [] })
  ]
});

const ecritures = (page) => page.evaluate(() => window.__ECRITURES.filter((x) => !/:select$/.test(x)));
const lignesBd = (page, texte) => page.evaluate((t) => window.__BD.notes.filter((r) => r.texte === t).sort((a, b) => (a.date + (a.demi || '')).localeCompare(b.date + (b.demi || '')))
  .map((r) => ({ date: r.date, demi: r.demi || null, details: r.details || null, pieces: (r.pieces || []).map((x) => x.chemin), cles: (r.pieces || []).map((x) => Object.keys(x).join(',')), serie: r.serie_id || null })), texte);
const toast = (page) => page.evaluate(() => { const t = document.querySelector('.toast'); return t ? t.textContent : ''; });
const lireFiche = (page) => page.evaluate(() => {
  const pop = document.querySelector('.form-pop');
  if (!pop) return null;
  return {
    note: pop.classList.contains('fiche-note'), descriptif: (pop.querySelector('.descriptif-texte') || {}).textContent,
    titre: (pop.querySelector('.pj-titre') || {}).textContent, details: (pop.querySelector('.details-texte') || {}).textContent,
    joindre: (pop.querySelector('.pj-ajouter') || {}).textContent, multiple: !!pop.querySelector('.pj-input[multiple]'),
    items: [...pop.querySelectorAll('.pj-item')].map((li) => ({
      nom: li.querySelector('.pj-nom').textContent, href: (li.querySelector('a.pj-lien') || {}).href || null,
      img: (li.querySelector('.pj-apercu img') || {}).src || null, pdf: (li.querySelector('.pj-apercu b') || {}).textContent || null, envoi: li.classList.contains('pj-envoi')
    }))
  };
});
// Appels aux fonctions serveur (corps copié), journalisés dans __APPELS.
const suivreAppels = (page) => page.evaluate(() => {
  window.__APPELS = [];
  const inv = sbClient.functions.invoke;
  sbClient.functions.invoke = function (nom, o) { window.__APPELS.push({ nom, body: JSON.parse(JSON.stringify((o && o.body) || {})) }); return inv.apply(this, arguments); };
});
const appelsPlage = (page) => page.evaluate(() => window.__APPELS.filter((a) => a.nom === 'enregistrer-plage').map((a) => a.body));
// Envoi de fichier retenu jusqu'à lacherEnvoi().
const retenirEnvoi = (page) => page.evaluate(() => {
  window.__orig = sbClient.storage.from;
  sbClient.storage.from = function (d) {
    const o = window.__orig(d), up = o.upload;
    o.upload = function () { const a = arguments; return new Promise((ok) => { window.__lacher = () => ok(up.apply(o, a)); }); };
    return o;
  };
});
const lacherEnvoi = (page) => page.evaluate(() => { window.__lacher(); sbClient.storage.from = window.__orig; });
async function joindre(page, fichier) {
  const [choix] = await Promise.all([page.waitForEvent('filechooser'), page.click('.form-pop .pj-ajouter')]);
  await choix.setFiles([fichier]);
}
async function ajouterLigneDetails(page, texte) {
  await page.click('.form-pop .details-texte');
  await page.keyboard.press('Enter');
  await page.keyboard.type(texte);
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(100);
}

(async () => {
  const { verifier, bilan } = verificateur();
  const erreurs = [];

  // ---- A. Serveur -------------------------------------------------------------------
  {
    const sql = fs.readFileSync(path.join(RACINE, 'sql/0043_notes_details_pieces.sql'), 'utf8');
    verifier(/alter table notes add column if not exists details text;/.test(sql) && /alter table notes add column if not exists pieces jsonb not null default '\[\]'::jsonb;/.test(sql) &&
      /add constraint notes_pieces_tableau check \(jsonb_typeof\(pieces\) = 'array'\);/.test(sql),
      'sql/0043 : colonnes details et pieces des notes (tableau, vide par défaut)');
    verifier(/create or replace function consultation_responsable\(p_jeton text, p_lundi date default null\) returns jsonb/.test(sql) && /'details', n\.details, 'pieces', n\.pieces\)/.test(sql) &&
      (sql.match(/'details', t\.details, 'pieces', t\.pieces/g) || []).length === 1 && !/create or replace function consultation_planning/.test(sql) &&
      /grant execute on function consultation_responsable\(text, date\) to anon, authenticated;/.test(sql),
      'sql/0043 : le lien responsable renvoie détails et fichiers des notes (tâches inchangées) ; le lien des ouvriers ne change pas');
    verifier(/from notes n, jsonb_array_elements\(n\.pieces\) p/.test(sql) && /unnest\(array\['taches', 'notes'\]\) as tb\(nom\)/.test(sql) && /interval '7 days'/.test(sql) &&
      /notify pgrst, 'reload schema';/.test(sql), 'sql/0043 : un fichier joint à une note (en base ou dans une sauvegarde) n’est jamais effacé comme orphelin');

    const src = fs.readFileSync(path.join(RACINE, 'functions/enregistrer-plage/logic.js'), 'utf8').replace(/export \{[\s\S]*?\};\s*$/, '');
    const P = new Function(src + '\nreturn { planPlage, detailsNote, piecesNote };')();
    const poses = (plan) => plan.ops.filter((o) => o.type === 'insert').map((o) => o.date + ':' + ('details' in o ? o.details : '-') + ':' + ('pieces' in o ? o.pieces.map((p) => p.chemin).join('+') : '-'));
    const base = { kind: 'note', texte: 'Grue', important: false, mode: 'remplacement', demiDebut: null, demiFin: null };
    const p1 = P.planPlage(Object.assign({}, base, { dateDebut: '2026-10-19', dateFin: '2026-10-20', details: '  Accès nord  ',
      pieces: [PHOTO, { chemin: '' }, null, { chemin: 'fichiers/ccc/X.pdf', extra: 1 }] }), []);
    verifier(JSON.stringify(poses(p1)) === JSON.stringify(['2026-10-19:Accès nord:' + PHOTO.chemin + '+fichiers/ccc/X.pdf', '2026-10-20:Accès nord:' + PHOTO.chemin + '+fichiers/ccc/X.pdf']) &&
      JSON.stringify(p1.ops[0].pieces[1]) === JSON.stringify({ chemin: 'fichiers/ccc/X.pdf', nom: 'X.pdf', type: '', taille: 0, vignette: null }),
      'enregistrer-plage : détails et fichiers fournis posés sur chaque jour (texte nettoyé, fichiers à la forme fixe) (' + poses(p1).join(' / ') + ')');
    const ex = [
      { id: 1, date: '2026-10-19', texte: 'Grue', important: false, demi: null, chantier_id: null, details: 'D', pieces: [PDF] },
      { id: 2, date: '2026-10-20', texte: 'Grue', important: false, demi: null, chantier_id: null, details: 'D', pieces: [PDF] }
    ];
    const origine = { dateDebut: '2026-10-19', dateFin: '2026-10-20', texte: 'Grue', important: false, demiDebut: null, demiFin: null };
    const p2 = P.planPlage(Object.assign({}, base, { texte: 'Grue 50 t', dateDebut: '2026-10-19', dateFin: '2026-10-21', origine }), ex);
    verifier(JSON.stringify(poses(p2)) === JSON.stringify(['2026-10-19:D:' + PDF.chemin, '2026-10-20:D:' + PDF.chemin, '2026-10-21:D:' + PDF.chemin]) &&
      p2.ops.filter((o) => o.type === 'delete').length === 2,
      'enregistrer-plage : demande sans détails (ancienne appli) → ceux de la note sont gardés, aussi sur le jour ajouté (' + poses(p2).join(' / ') + ')');
    const p3 = P.planPlage(Object.assign({}, base, { dateDebut: '2026-10-19', dateFin: '2026-10-19' }), []);
    const p4 = P.planPlage(Object.assign({}, base, { texte: 'Grue 2', dateDebut: '2026-10-19', dateFin: '2026-10-19', origine: Object.assign({}, origine, { dateFin: '2026-10-19' }) }),
      [{ id: 1, date: '2026-10-19', texte: 'Grue', important: false, demi: null }]);
    verifier(JSON.stringify(poses(p3)) === '["2026-10-19:-:-"]' && JSON.stringify(poses(p4)) === '["2026-10-19:-:-"]' && p4.ops[0].type === 'delete',
      'enregistrer-plage : note sans détails ni fichiers → colonnes pas écrites (une base sans la 0043 l’accepte)');
    const p5 = P.planPlage(Object.assign({}, base, { dateDebut: '2026-10-19', dateFin: '2026-10-20', origine, details: ' ', pieces: [] }), ex);
    verifier(JSON.stringify(poses(p5)) === '["2026-10-19:-:-","2026-10-20:-:-"]' && p5.ops.filter((o) => o.type === 'delete').length === 2,
      'enregistrer-plage : détails et fichiers retirés dans la fiche → jours réécrits sans eux');
    verifier(P.detailsNote(null) === null && P.detailsNote(' \n ') === null && P.detailsNote(' a\nb ') === 'a\nb' && P.piecesNote('x').length === 0 && P.piecesNote(null).length === 0,
      'enregistrer-plage : détails vides = null, fichiers absents = aucun');
    const ts = fs.readFileSync(path.join(RACINE, 'functions/enregistrer-plage/index.ts'), 'utf8');
    verifier(/const colonnes = params\.kind === "jalon" \? "id, date, texte, demi, important, chantier_id" : "\*";/.test(ts),
      'enregistrer-plage (index.ts) : toutes les colonnes d’une note relues (détails à garder)');

    const lsrc = fs.readFileSync(path.join(RACINE, 'functions/pieces-lien/logic.js'), 'utf8').replace(/export \{[\s\S]*?\};\s*$/, '');
    const L = new Function(lsrc + '\nreturn { cheminsVisibles };')();
    const vis = L.cheminsVisibles({ taches: [{ pieces: [PDF] }], notes: [{ pieces: [PHOTO] }, { pieces: null }, {}, null] });
    verifier(JSON.stringify(vis) === JSON.stringify([PDF.chemin, PHOTO.chemin, PHOTO.vignette]) && JSON.stringify(L.cheminsVisibles({ taches: [{ pieces: [PDF] }] })) === JSON.stringify([PDF.chemin]),
      'pieces-lien : les fichiers des notes de la semaine (lien responsable) sont signés aussi (' + vis.join(', ') + ')');
  }

  const browser = await lancerNavigateur(chromium);

  // ---- B. Planning : bulle et fiche --------------------------------------------------
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD() });
    await page.waitForTimeout(1200);
    await suivreAppels(page);
    verifier((await ecritures(page)).length === 0 && (await appelsPlage(page)).length === 0, 'chargement : rien d’écrit (détails et fichiers des notes normalisés des deux côtés du diff)');

    const bulles = await page.evaluate(() => NOTES.concat(JALONS).map((it) => {
      const b = document.querySelector('#racine .bulle[data-id="' + it.id + '"]');
      return { texte: it.texte, type: it.type, duree: it.duree, n: (it.pieces || []).length, el: !!b, title: b ? b.title : '', joint: !!(b && b.querySelector('.b-joint')),
        trombone: !!(b && b.querySelector('.b-joint path[d^="M21 11.5"]')), lignes: !!(b && b.querySelector('.b-joint path[d^="M5 6h14"]')),
        avantTexte: (() => { const j = b && b.querySelector('.b-joint'); return !!j && j.nextSibling && j.nextSibling.nodeType === 3; })() };
    }));
    const grue = bulles.filter((b) => b.texte === 'Grue').sort((a, b) => b.duree - a.duree);
    verifier(grue.length === 2 && grue[0].duree === 2 && grue[0].n === 2 && grue[0].el && grue[0].trombone && grue[0].avantTexte && / — détails, 2 fichiers$/.test(grue[0].title) &&
      grue[1].duree === 1 && grue[1].n === 0 && grue[1].el && !grue[1].joint,
      'bulle de note : trombone devant le texte, « détails, 2 fichiers » au survol ; le 24 (sans détails) reste une autre bulle (' + JSON.stringify(grue.map((b) => b.duree + ':' + b.n)) + ')');
    const tri = bulles.find((b) => b.texte === 'Tri'), acces = bulles.find((b) => b.texte === 'Accès'), reunion = bulles.find((b) => b.texte === 'Réunion' && b.el), jal = bulles.find((b) => b.type === 'jalon');
    verifier(tri && tri.trombone && / — détails, 1 fichier$/.test(tri.title) && acces && acces.lignes && !acces.trombone && / — détails — Après-midi$/.test(acces.title) &&
      reunion && !reunion.joint && jal && jal.el && !jal.joint, 'bulle de note : détails seuls → icône de lignes (« détails » avant la demi-journée au survol) ; sans rien → pas d’icône ; jalon sans icône');

    // Fiche de la note.
    await page.evaluate(() => ouvrirEditionPlage('note', NOTES.find((n) => n.texte === 'Grue' && n.pieces.length), null, null, 300, 300));
    await page.waitForTimeout(300);
    let f = await lireFiche(page);
    verifier(f && f.descriptif === 'Grue' && f.titre === 'Détails' && f.details === D1 && f.joindre === 'Joindre' && f.multiple,
      'fiche de la note : sous le descriptif, « Détails » (texte sur 2 lignes) et « Fichiers » avec « Joindre »');
    verifier(f && f.items.length === 2 && f.items[0].nom === 'Plan.pdf' && f.items[0].pdf === 'PDF' && f.items[0].href === 'https://signe.local/pieces/fichiers/aaa/Plan.pdf' &&
      f.items[1].nom === 'Photo.jpg' && f.items[1].img === 'https://signe.local/pieces/vignettes/bbb.jpg' && f.items[1].href === 'https://signe.local/pieces/fichiers/bbb/Photo.jpg',
      'fiche de la note : fichiers avec leur lien signé, PDF marqué, vignette de la photo');
    await ajouterLigneDetails(page, 'Grue 50 t');
    await page.click('.form-pop .pj-retirer[data-i="0"]');
    await joindre(page, { name: 'Accès.png', mimeType: 'image/png', buffer: PNG_1PX });
    await page.waitForTimeout(600);
    const chemin = ((await page.evaluate(() => Object.keys(window.__STOCKAGE || {}).find((k) => /^pieces\/fichiers\//.test(k)))) || '').replace(/^pieces\//, '');
    f = await lireFiche(page);
    verifier(f.details === D2 && f.items.length === 2 && f.items[0].nom === 'Photo.jpg' && f.items[1].nom === 'Accès.png' && /^fichiers\/[0-9a-f-]{36}\/Acces\.png$/.test(chemin),
      'fiche de la note : une ligne de détails ajoutée, le PDF retiré, une photo jointe (' + chemin + ')');
    await page.evaluate(() => { window.__ECRITURES = []; window.__APPELS = []; });
    await page.click('.form-pop .f-ok');
    await page.waitForTimeout(1500);
    let a = await appelsPlage(page);
    verifier(a.length === 1 && a[0].kind === 'note' && a[0].dateDebut === '2026-09-22' && a[0].dateFin === '2026-09-23' && a[0].texte === 'Grue' && a[0].details === D2 &&
      JSON.stringify(a[0].pieces.map((p) => p.chemin)) === JSON.stringify([PHOTO.chemin, chemin]) && a[0].origine && a[0].origine.texte === 'Grue',
      'enregistrer : enregistrer-plage reçoit les détails et les fichiers de la note (' + JSON.stringify(a.map((x) => x.details)) + ')');
    let l = await lignesBd(page, 'Grue');
    verifier(l.length === 3 && l.slice(0, 2).every((r) => r.details === D2 && JSON.stringify(r.pieces) === JSON.stringify([PHOTO.chemin, chemin]) &&
      r.cles.every((c) => c === 'chemin,nom,type,taille,vignette')) && l[2].date === '2026-09-24' && l[2].details === null && l[2].pieces.length === 0,
      'enregistrer : les 2 jours de la note portent les nouveaux détails et fichiers (forme fixe) ; le 24 n’est pas touché');
    await page.evaluate(() => { window.__APPELS = []; defaire(); });
    await page.waitForTimeout(1500);
    l = await lignesBd(page, 'Grue');
    verifier(l.slice(0, 2).every((r) => r.details === D1 && JSON.stringify(r.pieces) === JSON.stringify([PDF.chemin, PHOTO.chemin])) && !(await ecritures(page)).some((x) => /^storage:remove/.test(x)),
      'Annuler : détails et fichiers d’avant reviennent (rien d’effacé du dossier)');

    // Envoi en cours : la fiche reste ouverte.
    await retenirEnvoi(page);
    await page.evaluate(() => ouvrirEditionPlage('note', NOTES.find((n) => n.texte === 'Grue' && n.pieces.length), null, null, 300, 300));
    await page.waitForTimeout(200);
    await joindre(page, { name: 'Devis.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await page.waitForTimeout(150);
    await page.evaluate(() => { window.__APPELS = []; });
    await page.click('.form-pop .f-ok');
    await page.waitForTimeout(150);
    f = await lireFiche(page);
    const tEnvoi = await toast(page);
    verifier(f && f.items.length === 3 && f.items[2].envoi && /Envoi des fichiers en cours…/.test(tEnvoi) && (await appelsPlage(page)).length === 0,
      'envoi en cours : Enregistrer garde la fiche de la note ouverte (« ' + tEnvoi + ' »)');
    await lacherEnvoi(page);
    await page.waitForTimeout(400);
    await page.click('.form-pop .f-annuler');
    await page.waitForTimeout(800);
    verifier(!(await lireFiche(page)) && (await appelsPlage(page)).length === 0, 'fiche de la note : « Annuler » ferme sans rien enregistrer');

    // Jalon : pas de section.
    const fj = await page.evaluate(() => {
      ouvrirEditionPlage('jalon', JALONS.find((j) => j.texte === 'Livraison'), null, null, 300, 300);
      const pop = document.querySelector('.form-pop');
      const r = { pop: !!pop, section: !!(pop && (pop.querySelector('.pj-titre') || pop.querySelector('.pj-ajouter') || pop.querySelector('.details-texte'))) };
      if (pop) pop.querySelector('.f-annuler').click();
      return r;
    });
    verifier(fj.pop && !fj.section, 'jalon : fiche sans détails ni fichiers');

    // Nouvelle note avec des détails.
    await page.evaluate(() => ouvrirEditionPlage('note', null, giDepuisIso('2026-09-21'), 1, 300, 300, null, null, null));
    await page.waitForTimeout(200);
    await page.click('.form-pop .descriptif-texte');
    await page.keyboard.type('Benne');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.click('.form-pop .details-texte');
    await page.keyboard.type('Côté rue');
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(100);
    await page.evaluate(() => { window.__APPELS = []; });
    await page.click('.form-pop .f-ok');
    await page.waitForTimeout(1500);
    a = await appelsPlage(page);
    l = await lignesBd(page, 'Benne');
    verifier(a.length === 1 && a[0].texte === 'Benne' && a[0].details === 'Côté rue' && Array.isArray(a[0].pieces) && a[0].pieces.length === 0 &&
      l.length === 1 && l[0].date === '2026-09-21' && l[0].details === 'Côté rue' && l[0].pieces.length === 0,
      'nouvelle note : enregistrée avec ses détails (' + JSON.stringify(l) + ')');

    // ---- C. Copier / coller -------------------------------------------------------
    await page.evaluate(() => {
      const it = NOTES.find((n) => n.texte === 'Tri');
      bullesSelectionnees = {}; bullesSelectionnees[it.id] = true;
      copierSelection();
      collerSurCase(null, giDepuisIso('2026-09-22'), 'matin');
    });
    await page.waitForTimeout(1500);
    const copie = await page.evaluate(() => {
      const c = NOTES.filter((n) => n.texte === 'Tri');
      return { n: c.length, distincts: c.length === 2 && c[0].pieces !== c[1].pieces };
    });
    l = await lignesBd(page, 'Tri');
    verifier(copie.n === 2 && copie.distincts && l.length === 2 && l[0].date === '2026-09-22' && l.every((r) => r.details === 'Bennes' && JSON.stringify(r.pieces) === JSON.stringify([PDF.chemin])),
      'copier / coller : la note collée (22.09) garde détails et fichiers, dans son propre tableau (' + JSON.stringify(l.map((r) => r.date)) + ')');

    // ---- D. Séries --------------------------------------------------------------------
    const ch = await page.evaluate(() => {
      const av = NOTES.find((n) => n.serieId === 7);
      const p = { chemin: 'fichiers/ccc/Ordre.pdf', nom: 'Ordre.pdf', type: 'application/pdf', taille: 10 };
      const c1 = changementSerie_('NOTES', av, Object.assign({}, av, { details: ' Ordre du jour ', pieces: [p] }));
      const c2 = changementSerie_('NOTES', av, Object.assign({}, av, { details: '  ', pieces: [] }));
      return { table: c1.table, m1: c1.modifs, m2: c2.modifs, deplace: c1.deplace };
    });
    verifier(ch.table === 'notes' && JSON.stringify(ch.m1) === JSON.stringify({ details: 'Ordre du jour', pieces: [{ chemin: 'fichiers/ccc/Ordre.pdf', nom: 'Ordre.pdf', type: 'application/pdf', taille: 10, vignette: null }] }) &&
      ch.m2 === null && !ch.deplace, 'série de notes : détails et fichiers changés = une modification (rien si le contenu est le même) (' + JSON.stringify(ch.m1) + ')');
    await page.evaluate(() => { window.__ECRITURES = []; ouvrirEditionPlage('note', NOTES.find((n) => n.serieId === 7), null, null, 300, 300); });
    await page.waitForTimeout(200);
    await page.click('.form-pop .details-texte');
    await page.keyboard.type('Ordre du jour');
    await page.keyboard.press('Control+Enter');
    await page.click('.form-pop .f-ok');
    await page.waitForSelector('.confirm-pop-serie');
    await page.click('.confirm-pop-serie input[value="serie"]');
    await page.click('.confirm-pop-serie .cs-ok');
    await page.waitForTimeout(1500);
    l = await lignesBd(page, 'Réunion');
    verifier(l.length === 2 && l.every((r) => r.details === 'Ordre du jour' && r.serie === 7) && (await ecritures(page)).includes('notes:update'),
      'série de notes, « Tous les événements » : les détails passent sur toutes les occurrences, hors de l’écran aussi (' + JSON.stringify(l.map((r) => r.date + ' ' + r.details)) + ')');
    const cree = await page.evaluate(async () => {
      window.__REPONSE_SERIE = { ok: true, serieId: 9 };
      window.__BD.notes.push({ id: 9001, date: '2026-10-07', demi: null, texte: 'Nouvelle', important: false, chantier_id: null, serie_id: 9 });
      window.__BD.notes.push({ id: 9002, date: '2026-10-14', demi: null, texte: 'Nouvelle', important: false, chantier_id: null, serie_id: 9 });
      window.__ECRITURES = [];
      const choix = { frequence: 'hebdo', intervalle: 1, finType: 'nombre', finValeur: 2 };
      let apres = 0;
      await creerSerieServeur('note', [{}], giDepuisIso('2026-09-23'), 'Nouvelle', false, null, null, choix, () => { apres++; }, 1, null, null, undefined,
        { details: 'Avec détails', pieces: [{ chemin: 'fichiers/ddd/A.pdf', nom: 'A.pdf', type: 'application/pdf', taille: 5, extra: 1 }] });
      const avecContenu = window.__ECRITURES.filter((x) => !/:select$/.test(x));
      window.__ECRITURES = [];
      await creerSerieServeur('note', [{}], giDepuisIso('2026-09-23'), 'Nouvelle', false, null, null, choix, () => { apres++; }, 1, null, null, undefined, { details: null, pieces: [] });
      const sansContenu = window.__ECRITURES.filter((x) => !/:select$/.test(x));
      window.__REPONSE_SERIE = null;
      return { avecContenu, sansContenu, apres, lignes: window.__BD.notes.filter((r) => r.serie_id === 9).map((r) => r.details + '|' + JSON.stringify(r.pieces)) };
    });
    verifier(cree.avecContenu.length === 2 && /^fn:enregistrer-serie:/.test(cree.avecContenu[0]) && !/details|pieces/.test(cree.avecContenu[0]) && cree.avecContenu[1] === 'notes:update' &&
      cree.lignes.length === 2 && cree.lignes.every((x) => x === 'Avec détails|[{"chemin":"fichiers/ddd/A.pdf","nom":"A.pdf","type":"application/pdf","taille":5,"vignette":null}]'),
      'série de notes créée : enregistrer-serie (inchangée) puis détails et fichiers posés sur ses lignes de la table notes (' + JSON.stringify(cree.avecContenu) + ')');
    verifier(cree.sansContenu.length === 1 && cree.apres === 2, 'série de notes créée sans détails ni fichiers : aucune écriture de plus');
    erreurs.push(...e);
    await page.context().close();
  }

  // ---- E. Page Notes -------------------------------------------------------------------
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD() });
    await page.waitForTimeout(800);
    await suivreAppels(page);
    await page.click('.onglets-liste .onglet[data-page="notes"]');
    await page.waitForTimeout(600);
    const liste = () => page.evaluate(() => [...document.querySelectorAll('#listeNotes .ligne-note')].map((li) => {
      const j = li.querySelector('b .b-joint');
      return { id: li.dataset.idDebut, texte: li.querySelector('b').textContent, trombone: !!(j && j.querySelector('path[d^="M21 11.5"]')), lignes: !!(j && j.querySelector('path[d^="M5 6h14"]')), title: j ? j.title : '' };
    }));
    let li = await liste();
    const par = (id) => li.find((x) => x.id === String(id)) || {};
    verifier(par(1).texte === 'Grue' && par(1).trombone && par(1).title === 'détails, 2 fichiers' && par(3).texte === 'Grue' && !par(3).title && par(4).trombone && par(5).lignes && !par(5).trombone &&
      li.filter((x) => x.texte === 'Grue').length === 2,
      'page Notes : la petite icône devant le texte ; la note du 24 (sans détails) reste une autre ligne (' + JSON.stringify(li.map((x) => x.id + ':' + x.title)) + ')');
    await page.click('#listeNotes .ligne-note[data-id-debut="1"] .lien-modifier');
    await page.waitForTimeout(300);
    let f = await lireFiche(page);
    verifier(f && f.note && f.titre === 'Détails' && f.details === D1 && f.joindre === 'Joindre' && f.items.length === 2 && f.items[1].img === 'https://signe.local/pieces/vignettes/bbb.jpg' &&
      f.items[0].href === 'https://signe.local/pieces/fichiers/aaa/Plan.pdf', 'page Notes : la fiche Modifier a la même section (détails, fichiers avec leurs liens)');
    await page.click('.form-pop .pj-retirer[data-i="0"]');
    await ajouterLigneDetails(page, 'Grue 50 t');
    await page.evaluate(() => { window.__APPELS = []; });
    await page.click('.form-pop .f-ok');
    await page.waitForTimeout(1200);
    let a = await appelsPlage(page);
    let l = await lignesBd(page, 'Grue');
    verifier(a.length === 1 && a[0].details === D2 && JSON.stringify(a[0].pieces.map((p) => p.chemin)) === JSON.stringify([PHOTO.chemin]) && a[0].origine &&
      a[0].origine.dateDebut === '2026-09-22' && a[0].origine.dateFin === '2026-09-23' && a[0].chantierId === null &&
      l.length === 3 && l.slice(0, 2).every((r) => r.details === D2 && JSON.stringify(r.pieces) === JSON.stringify([PHOTO.chemin])) && l[2].details === null && /Modifiée\./.test(await toast(page)),
      'page Notes, Modifier : détails et fichiers envoyés à enregistrer-plage, posés sur les 2 jours (' + JSON.stringify(a.map((x) => x.details)) + ')');
    li = await liste();
    verifier(par(li.find((x) => x.texte === 'Grue' && x.title) ? li.find((x) => x.texte === 'Grue' && x.title).id : 0).title === 'détails, 1 fichier',
      'page Notes : la liste relue montre « détails, 1 fichier »');

    // Ajouter, avec un fichier encore en route au premier clic.
    await page.click('#listeNotes .ligne-ajouter');
    await page.waitForTimeout(300);
    f = await lireFiche(page);
    verifier(f && f.titre === 'Détails' && f.items.length === 0 && f.details !== null, 'page Notes, Ajouter : la section est là, vide');
    await page.fill('.form-pop .f-texte-note', 'Benne');
    await retenirEnvoi(page);
    await joindre(page, { name: 'Bon.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await page.waitForTimeout(150);
    await page.evaluate(() => { window.__APPELS = []; });
    await page.click('.form-pop .f-ok');
    await page.waitForTimeout(150);
    const pendant = { fiche: !!(await lireFiche(page)), toast: await toast(page), appels: (await appelsPlage(page)).length };
    verifier(pendant.fiche && /Envoi des fichiers en cours…/.test(pendant.toast) && pendant.appels === 0, 'page Notes, envoi en cours : Enregistrer garde la fiche ouverte (« ' + pendant.toast + ' »)');
    await lacherEnvoi(page);
    await page.waitForTimeout(400);
    await page.click('.form-pop .f-ok');
    await page.waitForTimeout(1200);
    a = await appelsPlage(page);
    l = await lignesBd(page, 'Benne');
    verifier(a.length === 1 && a[0].details === null && a[0].pieces.length === 1 && a[0].pieces[0].nom === 'Bon.pdf' && !a[0].origine &&
      l.length === 1 && l[0].date === '2026-09-24' && l[0].details === null && l[0].pieces.length === 1 && /\/Bon\.pdf$/.test(l[0].pieces[0]),
      'page Notes, Ajouter : la note est enregistrée avec son fichier, sans détails (' + JSON.stringify(l) + ')');
    erreurs.push(...e);
    await page.context().close();
  }

  // ---- F. Lien responsable -----------------------------------------------------------
  {
    const nR = (date, texte, details, pieces) => ({ date, demi: null, texte, important: false, chantier: 'Villa Lac', couleur: '#cfe8c9', lat: null, lng: null, details, pieces });
    const RESPONSABLE = { nom: 'Responsable', lundi: '2026-10-19', aujourdhui: '2026-10-21', min: '2026-10-19', max: '2026-11-16',
      personnes: [{ id: 1, nom: 'Marco', section: 'personnel' }], groupes: [], ordre_groupes: [], jalons: [], feries: [], horaires: [], taches: [],
      notes: [nR('2026-10-20', 'Grue', 'Accès nord', [PHOTO]), nR('2026-10-21', 'Grue', null, []), nR('2026-10-22', 'Tri', 'Bennes', [])] };
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 800 } });
    const page = await ctx.newPage();
    const errs = [], demandes = [];
    page.on('pageerror', (x) => errs.push(String(x)));
    await page.clock.setFixedTime(new Date('2026-10-21T10:00:00'));
    await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await page.route(/\/rest\/v1\/rpc\/consultation_responsable/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(RESPONSABLE) }));
    await page.route(/\/functions\/v1\/pieces-lien/, (r) => {
      const corps = JSON.parse(r.request().postData() || '{}');
      demandes.push(corps);
      const urls = {};
      corps.chemins.forEach((c) => { urls[c] = 'https://signe.local/lien/' + c; });
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, urls }) });
    });
    await page.goto('file://' + path.join(RACINE, 'responsable.html') + '?j=' + JETON_R);
    await page.waitForTimeout(400);
    const bulles = await page.evaluate(() => [...document.querySelectorAll('.bulle.note')].map((b) => b.querySelector('.texte').textContent + ':' + ((b.querySelector('.tache-joint') || {}).textContent || '')));
    verifier(JSON.stringify(bulles) === JSON.stringify(['Grue:Détails · 1 fichier', 'Grue:', 'Tri:Détails']),
      'lien responsable : bouton « Détails · 1 fichier » sur la note qui en a, « Détails » pour des détails seuls ; le 21 (sans) reste une autre bulle (' + bulles.join(' / ') + ')');
    await page.click('.bulle.note .tache-joint');
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => {
      const fiche = document.querySelector('.dl-fiche');
      return fiche && { titre: fiche.querySelector('.dl-titre').textContent, details: (fiche.querySelector('.dl-details') || {}).textContent,
        liens: [...fiche.querySelectorAll('a.dl-fichier')].map((x) => x.href + '|' + ((x.querySelector('.dl-apercu img') || {}).src || '')) };
    });
    verifier(s && s.titre === 'Grue' && s.details === 'Accès nord' && JSON.stringify(s.liens) === JSON.stringify(['https://signe.local/lien/' + PHOTO.chemin + '|https://signe.local/lien/' + PHOTO.vignette]),
      'lien responsable : la fiche de la note montre ses détails et sa photo (vignette, original en lien)');
    verifier(demandes.length === 1 && JSON.stringify(demandes[0]) === JSON.stringify({ jeton: JETON_R, page: 'responsable', lundi: '2026-10-19', chemins: [PHOTO.chemin, PHOTO.vignette] }),
      'lien responsable : adresses demandées à pieces-lien pour la page responsable (' + JSON.stringify(demandes[0]) + ')');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    verifier(!(await page.evaluate(() => !!document.querySelector('.dl-fiche'))), 'lien responsable : Échap ferme la fiche de la note');
    errs.forEach((x) => erreurs.push(x));
    await ctx.close();
  }

  await browser.close();
  process.exit(bilan(erreurs));
})();
