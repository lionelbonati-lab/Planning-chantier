const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 21.10.2026 (suite 147). Lionel : « J'aimerais pouvoir rajouter
// des détails à mes tâches
// J'aimerais pouvoir leur joindre des fichiers, photos ou PDF. » Ses choix :
// « Dans la fiche », visibles sur le « Lien des ouvriers » et le « Lien
// responsable », ajout « Seulement toi », photos « Originales ». Puis :
// « qu'il soit visible dans la vue ouvrière en cliquant sur la tâche. »
// Vérifie :
//   A. Fonction serveur pieces-lien (logique pure) : demande validée, seuls
//      les fichiers des tâches que le lien affiche sont signés ; index.ts
//      (clé de service lue sur le serveur seulement, 1 heure) ; sql/0041.
//   B. Appli : rien d'écrit au chargement ; bulle avec une icône (trombone,
//      ou lignes pour des détails seuls) ; fiche : détails sur plusieurs
//      lignes (Entrée = retour à la ligne, Ctrl+Entrée enregistre), fichiers
//      (lien signé, vignette, PDF, taille), retirer, joindre (original +
//      vignette JPEG, nom sans accents), enregistré par remplacer_case_personne,
//      Annuler ; envoi en cours, échec, fichier de plus de 50 Mo ; absence
//      sans section.
//   C. Copier / coller : la copie garde détails et fichiers (son propre tableau).
//   D. Séries : changementSerie_, fiche « Tous les événements », série créée.
//   E. Hors ligne : résumé de case à 8 valeurs, file d'avant (6 valeurs).
//   F. Secours sans remplacer_case_personne : colonnes posées s'il y en a.
//   G. Nettoyage des fichiers orphelins : une fois par jour, silencieux.
//   H. Liens ouvrier et responsable : bouton « Détails · 2 fichiers » ; vue
//      ouvrier : toucher la tâche ouvre la fiche (pas le bouton GPS) ; fiche,
//      adresses demandées à pieces-lien (jeton, page, semaine), cache, erreur,
//      feuille du bas sur téléphone ; responsable : 2 bulles quand les
//      fichiers diffèrent, flèches sans effet sous la fiche.
//   I. Ordre des scripts.
//
// Lancer : node test_suite147.js

const RACINE = path.join(__dirname, '..');
const JETON = '0123456789abcdef0123456789abcdef';
const JETON_R = 'fedcba9876543210fedcba9876543210fedcba98';
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const PDF = { chemin: 'fichiers/aaa/Plan.pdf', nom: 'Plan.pdf', type: 'application/pdf', taille: 123904 };
const PHOTO = { chemin: 'fichiers/bbb/Photo.jpg', nom: 'Photo.jpg', type: 'image/jpeg', taille: 2411724, vignette: 'vignettes/bbb.jpg' };

const ligne = (id, personne, date, demi, texte, extra) => Object.assign({ id, personne_id: personne, date, demi, ordre: 0, texte, statut_id: null, important: false,
  serie_id: null, est_absence: false, chantier_id: 1 }, extra || {});
const BD = () => ({
  series: [{ id: 7 }],
  taches: [
    ligne(1, 1, '2026-09-22', 'matin', 'Coffrage', { details: 'Ligne 1\nLigne 2', pieces: [PDF, PHOTO] }),
    ligne(2, 1, '2026-09-22', 'aprem', 'Coffrage', { details: 'Ligne 1\nLigne 2', pieces: [PDF, PHOTO] }),
    ligne(3, 1, '2026-09-23', 'matin', 'Coffrage'),
    ligne(4, 2, '2026-09-21', 'matin', 'Ferraillage', { details: 'Fers de 12' }),
    ligne(5, 2, '2026-09-24', 'aprem', 'Série béton', { serie_id: 7 }),
    ligne(6, 2, '2026-10-01', 'aprem', 'Série béton', { serie_id: 7 }),
    ligne(7, 2, '2026-09-23', 'matin', 'Congé', { est_absence: true, chantier_id: null })
  ]
});

(async () => {
  const { verifier, bilan } = verificateur();
  const erreurs = [];

  // ---- A. Fonction serveur pieces-lien ----------------------------------------
  {
    const src = fs.readFileSync(path.join(RACINE, 'functions/pieces-lien/logic.js'), 'utf8').replace(/export \{[\s\S]*?\};\s*$/, '');
    const L = new Function(src + '\nreturn { validerDemande, cheminsVisibles, cheminsASigner, MAX_CHEMINS };')();
    const refus = (b) => { try { L.validerDemande(b); return null; } catch (e) { return e.message; } };
    const ok = { jeton: JETON, page: 'consultation', lundi: '2026-10-19', chemins: ['a'] };
    const cas = [
      [{}, 'Lien incomplet.'], [Object.assign({}, ok, { jeton: 'abc' }), 'Lien incomplet.'],
      [Object.assign({}, ok, { page: 'appli' }), 'Page inconnue.'], [Object.assign({}, ok, { lundi: '19.10.2026' }), 'Semaine invalide.'],
      [Object.assign({}, ok, { chemins: [] }), 'Aucun fichier demandé.'], [Object.assign({}, ok, { chemins: 'a' }), 'Aucun fichier demandé.'],
      [Object.assign({}, ok, { chemins: Array.from({ length: 61 }, (_, i) => 'f' + i) }), 'Trop de fichiers demandés.'],
      [Object.assign({}, ok, { chemins: [5] }), 'Fichier invalide.'], [Object.assign({}, ok, { chemins: ['x'.repeat(401)] }), 'Fichier invalide.']
    ];
    const obtenus = cas.map((c) => refus(c[0]));
    verifier(cas.every((c, i) => obtenus[i] === c[1]), 'pieces-lien : demande refusée avec un message lisible (' + obtenus.join(' / ') + ')');
    const v = L.validerDemande({ jeton: JETON_R, page: 'responsable', lundi: '', chemins: ['a', 'b', 'a'] });
    verifier(JSON.stringify(v) === JSON.stringify({ jeton: JETON_R, page: 'responsable', lundi: null, chemins: ['a', 'b'] }) && L.MAX_CHEMINS === 60 &&
      L.validerDemande(Object.assign({}, ok, { chemins: Array.from({ length: 60 }, (_, i) => 'f' + i) })).chemins.length === 60,
      'pieces-lien : demande valide (semaine vide = semaine en cours, doublons retirés, 60 fichiers au plus)');
    const vis = L.cheminsVisibles({ taches: [{ pieces: [PDF, PHOTO] }, { pieces: null }, {}, null, { pieces: [PDF, null, { chemin: '' }, { chemin: 7 }] }] });
    verifier(JSON.stringify(vis) === JSON.stringify([PDF.chemin, PHOTO.chemin, PHOTO.vignette]) && L.cheminsVisibles(null).length === 0,
      'pieces-lien : fichiers visibles = ceux des tâches de la semaine, vignettes comprises (' + vis.join(', ') + ')');
    verifier(JSON.stringify(L.cheminsASigner([PHOTO.vignette, 'fichiers/zzz/Autre.pdf', PDF.chemin], vis)) === JSON.stringify([PHOTO.vignette, PDF.chemin]),
      'pieces-lien : un fichier d’une autre tâche n’est pas signé, l’ordre de la demande est gardé');
    const ts = fs.readFileSync(path.join(RACINE, 'functions/pieces-lien/index.ts'), 'utf8');
    verifier(/publique\.rpc\(rpcDeLaPage\(demande\.page\), \{\s*p_jeton: demande\.jeton,\s*p_lundi: demande\.lundi,?\s*\}\)/.test(ts) &&
      /Deno\.env\.get\("SUPABASE_ANON_KEY"\)/.test(ts) && /if \(!semaine\) return json\(\{ ok: false, erreur: "Ce lien n'existe plus\." \}, 403\)/.test(ts),
      'index.ts : jeton vérifié par la même fonction que la page (clé publique), lien supprimé → 403');
    verifier(/const DUREE_SECONDES = 3600;/.test(ts) && /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/.test(ts) &&
      /storage\.from\("pieces"\)\.createSignedUrls\(aSigner, DUREE_SECONDES\)/.test(ts) && /return json\(\{ ok: true, urls \}\);/.test(ts) && !/eyJ/.test(ts),
      'index.ts : adresses valables 1 heure, clé de service lue sur le serveur, jamais renvoyée');
    const sql = fs.readFileSync(path.join(RACINE, 'sql/0041_taches_details_pieces.sql'), 'utf8');
    verifier(/add column if not exists details text;/.test(sql) && /add column if not exists pieces jsonb not null default '\[\]'::jsonb;/.test(sql) &&
      /values \('pieces', 'pieces', false, 52428800\)/.test(sql) && (sql.match(/create policy "pieces_(lire|ajouter|supprimer)" on storage\.objects for \w+ to authenticated/g) || []).length === 3 &&
      (sql.match(/'details', t\.details, 'pieces', t\.pieces/g) || []).length === 2 && /create or replace function pieces_orphelines\(\) returns setof text/.test(sql) &&
      /interval '7 days'/.test(sql) && /notify pgrst, 'reload schema';/.test(sql),
      'sql/0041 : colonnes, dossier privé de 50 Mo, droits des seuls connectés, liens à jour, fichiers orphelins après 7 jours');
  }

  const browser = await lancerNavigateur(chromium);

  // ---- B. Appli : bulle et fiche ---------------------------------------------------
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD() });
    await page.waitForTimeout(1200);
    const ecritures = () => page.evaluate(() => window.__ECRITURES.filter((x) => !/:select$/.test(x)));
    const lignesBd = (texte) => page.evaluate((t) => window.__BD.taches.filter((r) => r.texte === t).sort((a, b) => (a.date + a.demi).localeCompare(b.date + b.demi))
      .map((r) => ({ p: r.personne_id, date: r.date, demi: r.demi, details: r.details || null, pieces: (r.pieces || []).map((x) => x.chemin), cles: (r.pieces || []).map((x) => Object.keys(x).join(',')) })), texte);
    const toast = () => page.evaluate(() => { const t = document.querySelector('.toast'); return t ? t.textContent : ''; });
    verifier((await ecritures()).length === 0, 'chargement : rien d’écrit (fichiers normalisés des deux côtés du diff)');

    const bulles = await page.evaluate(() => [...document.querySelectorAll('.grille .bulle')].map((b) => ({
      texte: b.querySelector('.b-txt').textContent, title: b.title,
      joint: !!b.querySelector('.b-joint'), trombone: !!b.querySelector('.b-joint path[d^="M21 11.5"]'), lignes: !!b.querySelector('.b-joint path[d^="M5 6h14"]'),
      avantTexte: (() => { const j = b.querySelector('.b-joint'); return !!j && j.nextSibling && j.nextSibling.nodeType === 3; })()
    })));
    const coffrage = bulles.filter((b) => b.texte === 'Coffrage');
    verifier(coffrage.length === 2 && coffrage.filter((b) => b.joint).length === 1 && coffrage.some((b) => b.trombone && b.avantTexte && / — détails, 2 fichiers$/.test(b.title)),
      'bulle : trombone devant le texte, « détails, 2 fichiers » au survol ; la demi-journée sans fichiers reste une autre bulle');
    const fer = bulles.find((b) => b.texte === 'Ferraillage'), conge = bulles.find((b) => b.texte === 'Congé'), serie = bulles.find((b) => b.texte === 'Série béton');
    verifier(fer && fer.lignes && !fer.trombone && / — détails$/.test(fer.title) && conge && !conge.joint && serie && !serie.joint,
      'bulle : détails seuls → icône de lignes ; sans rien → pas d’icône');
    verifier(await page.evaluate(() => TACHES.filter((t) => t.texte === 'Coffrage').map((t) => t.duree + ':' + t.pieces.length).sort().join(' ')) === '1:0 1:2',
      'les deux demi-journées du 22 (mêmes fichiers) forment une seule bulle');

    // Fiche de la tâche.
    await page.evaluate(() => ouvrirEdition(null, TACHES.find((t) => t.texte === 'Coffrage' && t.pieces.length), null, 300, 300));
    await page.waitForTimeout(300);
    const lireFiche = () => page.evaluate(() => {
      const pop = document.querySelector('.form-pop');
      if (!pop) return null;
      return {
        titre: (pop.querySelector('.pj-titre') || {}).textContent, details: (pop.querySelector('.details-texte') || {}).textContent,
        joindre: (pop.querySelector('.pj-ajouter') || {}).textContent, multiple: !!pop.querySelector('.pj-input[multiple]'),
        items: [...pop.querySelectorAll('.pj-item')].map((li) => ({
          nom: li.querySelector('.pj-nom').textContent, taille: li.querySelector('.pj-taille').textContent,
          href: (li.querySelector('a.pj-lien') || {}).href || null, cible: (li.querySelector('a.pj-lien') || {}).target || null,
          img: (li.querySelector('.pj-apercu img') || {}).src || null, pdf: (li.querySelector('.pj-apercu b') || {}).textContent || null,
          envoi: li.classList.contains('pj-envoi'), retirer: !!li.querySelector('.pj-retirer')
        }))
      };
    });
    let f = await lireFiche();
    verifier(f && f.titre === 'Détails' && f.details === 'Ligne 1\nLigne 2' && f.joindre === 'Joindre' && f.multiple,
      'fiche : section « Détails » (texte sur 2 lignes), « Fichiers » avec « Joindre » (plusieurs à la fois)');
    verifier(f && f.items.length === 2 && f.items[0].nom === 'Plan.pdf' && f.items[0].taille === '121 Ko' && f.items[0].pdf === 'PDF' && !f.items[0].img &&
      f.items[0].href === 'https://signe.local/pieces/fichiers/aaa/Plan.pdf' && f.items[0].cible === '_blank' &&
      f.items[1].nom === 'Photo.jpg' && f.items[1].taille === '2,3 Mo' && f.items[1].img === 'https://signe.local/pieces/vignettes/bbb.jpg' &&
      f.items[1].href === 'https://signe.local/pieces/fichiers/bbb/Photo.jpg' && f.items.every((i) => i.retirer),
      'fiche : chaque fichier s’ouvre (adresse signée, nouvel onglet) ; PDF marqué, photo en vignette, tailles lisibles (' + JSON.stringify(f && f.items.map((i) => i.taille)) + ')');

    // Détails : éditeur sur plusieurs lignes.
    await page.click('.form-pop .details-texte');
    const ed = await page.evaluate(() => ({ titre: document.querySelector('.desc-edit-box .popup-titre').textContent, long: !!document.querySelector('.desc-edit-box textarea.desc-long'),
      h: document.querySelector('.desc-edit-box textarea').getBoundingClientRect().height }));
    await page.keyboard.press('Enter');
    await page.keyboard.type('Ligne 3');
    const apresEntree = await page.evaluate(() => ({ boite: !!document.querySelector('.desc-edit-box'), fiche: !!document.querySelector('.form-pop'), val: document.querySelector('.desc-edit-box textarea').value }));
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(100);
    f = await lireFiche();
    verifier(ed.titre === 'Modifier les détails' && ed.long && ed.h >= 170, 'détails : éditeur « Modifier les détails », zone haute (' + ed.h + ' px)');
    verifier(apresEntree.boite && apresEntree.fiche && apresEntree.val === 'Ligne 1\nLigne 2\nLigne 3' && !(await page.evaluate(() => !!document.querySelector('.desc-edit-box'))) &&
      f.details === 'Ligne 1\nLigne 2\nLigne 3', 'détails : Entrée va à la ligne (ni l’éditeur ni la fiche ne se ferment), Ctrl+Entrée enregistre');

    // Retirer puis joindre.
    await page.click('.form-pop .pj-retirer[data-i="0"]');
    f = await lireFiche();
    verifier(f.items.length === 1 && f.items[0].nom === 'Photo.jpg', 'retirer : le PDF quitte la liste');
    await page.evaluate(() => { window.__ECRITURES = []; });
    const [choix] = await Promise.all([page.waitForEvent('filechooser'), page.click('.form-pop .pj-ajouter')]);
    await choix.setFiles([{ name: 'Mur été.png', mimeType: 'image/png', buffer: PNG_1PX }]);
    await page.waitForTimeout(600);
    const stock = await page.evaluate(() => window.__STOCKAGE || {});
    const cles = Object.keys(stock);
    const m = (cles.find((k) => /^pieces\/fichiers\//.test(k)) || '').match(/^pieces\/fichiers\/([0-9a-f-]{36})\/(.+)$/);
    verifier(choix.isMultiple() && m && m[2] === 'Mur ete.png' && stock['pieces/vignettes/' + m[1] + '.jpg'] && stock['pieces/vignettes/' + m[1] + '.jpg'].type === 'image/jpeg' &&
      stock['pieces/fichiers/' + m[1] + '/Mur ete.png'].type === 'image/png' && stock['pieces/fichiers/' + m[1] + '/Mur ete.png'].taille === PNG_1PX.length && cles.length === 2,
      'joindre : original envoyé tel quel (nom sans accents), vignette JPEG à côté (' + cles.join(', ') + ')');
    f = await lireFiche();
    verifier(f.items.length === 2 && f.items[1].nom === 'Mur été.png' && /^blob:/.test(f.items[1].img || '') && /signe\.local\/pieces\/fichiers\//.test(f.items[1].href || ''),
      'joindre : le fichier apparaît avec son vrai nom, son aperçu et son lien');
    const idNouveau = m && m[1];
    await page.click('.form-pop .f-ok');
    await page.waitForTimeout(1500);
    let l = await lignesBd('Coffrage');
    const attendu = [PHOTO.chemin, 'fichiers/' + idNouveau + '/Mur ete.png'];
    verifier(l.length === 3 && l.slice(0, 2).every((r) => r.details === 'Ligne 1\nLigne 2\nLigne 3' && JSON.stringify(r.pieces) === JSON.stringify(attendu) &&
      r.cles.every((c) => c === 'chemin,nom,type,taille,vignette')) && l[2].details === null && l[2].pieces.length === 0,
      'enregistrer : les 2 demi-journées portent les détails et les fichiers (forme fixe) ; le 23 n’est pas touché');
    verifier((await ecritures()).filter((x) => x === 'rpc:remplacer_case_personne').length === 2 && !(await ecritures()).some((x) => /^storage:remove/.test(x)),
      'enregistrer : une écriture par demi-journée (remplacer_case_personne), aucun fichier effacé');
    await page.evaluate(() => defaire());
    await page.waitForTimeout(1500);
    l = await lignesBd('Coffrage');
    verifier(l.slice(0, 2).every((r) => r.details === 'Ligne 1\nLigne 2' && JSON.stringify(r.pieces) === JSON.stringify([PDF.chemin, PHOTO.chemin])) &&
      !(await ecritures()).some((x) => /^storage:remove/.test(x)), 'Annuler : détails et fichiers d’avant reviennent (le fichier retiré existe encore)');

    // Envoi en cours : la fiche reste ouverte.
    await page.evaluate(() => {
      window.__orig = sbClient.storage.from;
      sbClient.storage.from = function (d) {
        const o = window.__orig(d), up = o.upload;
        o.upload = function () { const a = arguments; return new Promise((ok) => { window.__lacher = () => ok(up.apply(o, a)); }); };
        return o;
      };
      ouvrirEdition(null, TACHES.find((t) => t.texte === 'Coffrage' && t.pieces.length), null, 300, 300);
    });
    await page.waitForTimeout(200);
    const [choix2] = await Promise.all([page.waitForEvent('filechooser'), page.click('.form-pop .pj-ajouter')]);
    await choix2.setFiles([{ name: 'Devis.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }]);
    await page.waitForTimeout(150);
    f = await lireFiche();
    await page.click('.form-pop .f-ok');
    await page.waitForTimeout(150);
    const pendant = { fiche: !!(await lireFiche()), toast: await toast() };
    verifier(f.items.length === 3 && f.items[2].envoi && f.items[2].taille === 'Envoi…' && f.items[2].nom === 'Devis.pdf' && pendant.fiche && /Envoi des fichiers en cours…/.test(pendant.toast),
      'envoi en cours : « Envoi… » dans la liste ; Enregistrer garde la fiche ouverte (« ' + pendant.toast + ' »)');
    await page.evaluate(() => { window.__lacher(); sbClient.storage.from = window.__orig; });
    await page.waitForTimeout(400);
    f = await lireFiche();
    verifier(f.items.length === 3 && !f.items[2].envoi && f.items[2].pdf === 'PDF' && f.items[2].taille === '< 1 Ko', 'envoi fini : le PDF prend sa place dans la liste');

    // Échec de l'envoi, fichier trop gros.
    await page.evaluate(() => { window.__STOCKAGE_ECHEC = 'Bucket not found'; });
    const [choix3] = await Promise.all([page.waitForEvent('filechooser'), page.click('.form-pop .pj-ajouter')]);
    await choix3.setFiles([{ name: 'Métré.xlsx', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('xx') }]);
    await page.waitForTimeout(300);
    const tEchec = await toast();
    f = await lireFiche();
    verifier(/«\s*Métré\.xlsx\s*» n’a pas pu être envoyé\s*:\s*Bucket not found\./.test(tEchec) && f.items.length === 3,
      'échec de l’envoi : message, le fichier n’est pas joint (« ' + tEchec + ' »)');
    await page.evaluate(() => {
      window.__STOCKAGE_ECHEC = null; window.__ECRITURES = [];
      const fichier = new File([new Uint8Array(TAILLE_MAX_PIECE_ + 1)], 'Film.mp4', { type: 'video/mp4' });
      const dt = new DataTransfer(); dt.items.add(fichier);
      const input = document.querySelector('.form-pop .pj-input');
      input.files = dt.files; input.dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(200);
    const tGros = await toast();
    f = await lireFiche();
    verifier(/«\s*Film\.mp4\s*» dépasse 50 Mo\s*:\s*pas joint\./.test(tGros) && f.items.length === 3 && !(await ecritures()).some((x) => /^storage:upload/.test(x)),
      'plus de 50 Mo : refusé avant l’envoi (« ' + tGros + ' »)');
    await page.evaluate(() => popFermerActuel && popFermerActuel());
    await page.waitForTimeout(200);

    // Absence : pas de section.
    const abs = await page.evaluate(() => {
      ouvrirEdition(null, TACHES.find((t) => t.texte === 'Congé'), null, 300, 300);
      const pop = document.querySelector('.form-pop');
      const r = { pop: !!pop, section: !!(pop && (pop.querySelector('.pj-titre') || pop.querySelector('.pj-ajouter') || pop.querySelector('.details-texte'))) };
      if (popFermerActuel) popFermerActuel();
      return r;
    });
    verifier(abs.pop && !abs.section, 'absence : fiche sans détails ni fichiers');

    // ---- C. Copier / coller -----------------------------------------------------
    await page.evaluate(() => {
      const it = TACHES.find((t) => t.texte === 'Coffrage' && t.pieces.length);
      bullesSelectionnees = {}; bullesSelectionnees[it.id] = true;
      copierSelection();
      collerSurCase(1, giDepuisIso('2026-09-25'), 'matin');
    });
    await page.waitForTimeout(1500);
    const copie = await page.evaluate(() => {
      const c = TACHES.filter((t) => t.texte === 'Coffrage' && t.pieces.length);
      return { n: c.length, distincts: c.length === 2 && c[0].pieces !== c[1].pieces, details: c.map((t) => t.details) };
    });
    l = await lignesBd('Coffrage');
    const l25 = l.filter((r) => r.date === '2026-09-25');
    verifier(copie.n === 2 && copie.distincts && l25.length === 2 && l25.every((r) => r.details === 'Ligne 1\nLigne 2' && JSON.stringify(r.pieces) === JSON.stringify([PDF.chemin, PHOTO.chemin])),
      'copier / coller : la copie (25.09) garde détails et fichiers, dans son propre tableau');

    // ---- D. Séries ------------------------------------------------------------------
    const ch = await page.evaluate(() => {
      const av = TACHES.find((t) => t.serieId === 7);
      const p = { chemin: 'fichiers/ccc/Bon.pdf', nom: 'Bon.pdf', type: 'application/pdf', taille: 10 };
      const c1 = changementSerie_('TACHES', av, Object.assign({}, av, { details: ' Coulage ', pieces: [p] }));
      const c2 = changementSerie_('TACHES', av, Object.assign({}, av, { details: '  ', pieces: [] }));
      return { m1: c1.modifs, m2: c2.modifs, deplace: c1.deplace };
    });
    verifier(JSON.stringify(ch.m1) === JSON.stringify({ details: 'Coulage', pieces: [{ chemin: 'fichiers/ccc/Bon.pdf', nom: 'Bon.pdf', type: 'application/pdf', taille: 10, vignette: null }] }) &&
      ch.m2 === null && !ch.deplace, 'série : détails et fichiers changés = une modification (rien si le contenu est le même)');
    await page.evaluate(() => { window.__ECRITURES = []; ouvrirEdition(null, TACHES.find((t) => t.serieId === 7), null, 300, 300); });
    await page.waitForTimeout(200);
    await page.click('.form-pop .details-texte');
    await page.keyboard.type('Coulage');
    await page.keyboard.press('Control+Enter');
    await page.click('.form-pop .f-ok');
    await page.waitForSelector('.confirm-pop-serie');
    await page.click('.confirm-pop-serie input[value="serie"]');
    await page.click('.confirm-pop-serie .cs-ok');
    await page.waitForTimeout(1500);
    l = await lignesBd('Série béton');
    verifier(l.length === 2 && l.every((r) => r.details === 'Coulage') && (await ecritures()).includes('taches:update'),
      'série, « Tous les événements » : les détails passent sur toutes les occurrences, hors de l’écran aussi (' + JSON.stringify(l.map((r) => r.date + ' ' + r.details)) + ')');
    const cree = await page.evaluate(async () => {
      window.__REPONSE_SERIE = { ok: true, serieId: 9 };
      window.__BD.taches.push({ id: 9001, personne_id: 2, date: '2026-10-07', demi: 'matin', ordre: 0, texte: 'Nouvelle', serie_id: 9, chantier_id: 1 });
      window.__BD.taches.push({ id: 9002, personne_id: 2, date: '2026-10-14', demi: 'matin', ordre: 0, texte: 'Nouvelle', serie_id: 9, chantier_id: 1 });
      window.__ECRITURES = [];
      const choix = { frequence: 'hebdo', intervalle: 1, finType: 'nombre', finValeur: 2 };
      let apres = 0;
      await creerSerieServeur('tache', [{ personne: 2 }], giDepuisIso('2026-09-23'), 'Nouvelle', false, null, null, choix, () => { apres++; }, 1, null, null, undefined,
        { details: 'Avec détails', pieces: [{ chemin: 'fichiers/ddd/A.pdf', nom: 'A.pdf', type: 'application/pdf', taille: 5, extra: 1 }] });
      const avecContenu = window.__ECRITURES.filter((x) => !/:select$/.test(x));
      window.__ECRITURES = [];
      await creerSerieServeur('tache', [{ personne: 2 }], giDepuisIso('2026-09-23'), 'Nouvelle', false, null, null, choix, () => { apres++; }, 1, null, null, undefined, { details: null, pieces: [] });
      const sansContenu = window.__ECRITURES.filter((x) => !/:select$/.test(x));
      window.__REPONSE_SERIE = null;
      return { avecContenu, sansContenu, apres, lignes: window.__BD.taches.filter((r) => r.serie_id === 9).map((r) => r.details + '|' + JSON.stringify(r.pieces)) };
    });
    verifier(cree.avecContenu.length === 2 && /^fn:enregistrer-serie:/.test(cree.avecContenu[0]) && !/details|pieces/.test(cree.avecContenu[0]) && cree.avecContenu[1] === 'taches:update' &&
      cree.lignes.length === 2 && cree.lignes.every((x) => x === 'Avec détails|[{"chemin":"fichiers/ddd/A.pdf","nom":"A.pdf","type":"application/pdf","taille":5,"vignette":null}]'),
      'série créée : enregistrer-serie (inchangée) puis détails et fichiers posés sur toutes ses lignes (serie_id)');
    verifier(cree.sansContenu.length === 1 && cree.apres === 2, 'série créée sans détails ni fichiers : aucune écriture de plus');

    // ---- E. Hors ligne ------------------------------------------------------------
    const hl = await page.evaluate(async () => {
      const serveur = [{ texte: 'A', ordre: 1, statut_id: null, important: false, serie_id: null, est_absence: false, chantier_id: 1, details: 'D', pieces: [{ chemin: 'x' }] },
        { texte: 'B', ordre: 0, chantier_id: 1, pieces: [] }];
      const resume = hlResumeCase_(serveur);
      const vraiFetch = window.fetch, urls = [];
      window.fetch = (u) => { urls.push(u); return Promise.resolve(new Response(JSON.stringify(serveur), { status: 200 })); };
      const e = (avant) => ({ corps: JSON.stringify({ p_personne_id: 1, p_date: '2026-09-22', p_demi: 'matin' }), url: 'https://x.supabase.co/rest/v1/rpc/remplacer_case_personne', avant });
      const r = {
        resume,
        meme: await hlCaseInchangee_(e(resume), {}),
        autresFichiers: await hlCaseInchangee_(e(hlResumeCase_([Object.assign({}, serveur[0], { pieces: [{ chemin: 'y' }] }), serveur[1]])), {}),
        autresDetails: await hlCaseInchangee_(e(hlResumeCase_([Object.assign({}, serveur[0], { details: 'E' }), serveur[1]])), {}),
        ancienne: await hlCaseInchangee_(e(resume.map((x) => x.slice(0, 6))), {}),
        ancienneAutre: await hlCaseInchangee_(e(resume.map((x) => x.slice(0, 6)).map((x, i) => i ? x : ['Z'].concat(x.slice(1)))), {})
      };
      window.fetch = vraiFetch;
      r.url = urls[0];
      return r;
    });
    verifier(JSON.stringify(hl.resume) === JSON.stringify([['B', null, false, null, false, 1, null, []], ['A', null, false, null, false, 1, 'D', ['x']]]),
      'hors ligne : résumé de case avec détails et fichiers en fin de ligne');
    verifier(hl.meme && !hl.autresFichiers && !hl.autresDetails && /select=texte,statut_id,important,serie_id,est_absence,chantier_id,details,pieces,ordre&/.test(hl.url),
      'hors ligne : case changée ailleurs (détails ou fichiers) → pas écrasée au retour du réseau');
    verifier(hl.ancienne && !hl.ancienneAutre, 'hors ligne : changement mis en file avant cette version (6 valeurs) comparé sur ses 6 premières');

    // ---- F. Secours sans remplacer_case_personne ---------------------------------
    await page.evaluate(() => {
      rpcRemplacerCaseAbsente_ = true; window.__ECRITURES = [];
      sauvegarderUndo();
      TACHES.find((t) => t.texte === 'Ferraillage').details = 'Fers de 14';
      const c = TACHES.find((t) => t.texte === 'Coffrage' && t.pieces.length && isoDeGi(t.giDebut) === '2026-09-22');
      c.details = null;
      render();
    });
    await page.waitForTimeout(1500);
    const secours = await page.evaluate(() => ({
      e: window.__ECRITURES.filter((x) => !/:select$/.test(x)),
      fer: window.__BD.taches.filter((r) => r.texte === 'Ferraillage').map((r) => ({ details: r.details, cle: 'pieces' in r })),
      cof: window.__BD.taches.filter((r) => r.texte === 'Coffrage' && r.date === '2026-09-22').map((r) => ({ details: 'details' in r, pieces: (r.pieces || []).length }))
    }));
    verifier(secours.e.includes('taches:delete') && secours.e.includes('taches:insert') && !secours.e.includes('rpc:remplacer_case_personne') &&
      secours.fer.length === 1 && secours.fer[0].details === 'Fers de 14' && !secours.fer[0].cle && secours.cof.length === 2 && secours.cof.every((r) => !r.details && r.pieces === 2),
      'secours (base sans la fonction) : colonnes envoyées seulement s’il y a des détails ou des fichiers (' + JSON.stringify(secours) + ')');

    // ---- G. Nettoyage des fichiers orphelins ---------------------------------------
    const net = await page.evaluate(async () => {
      try { localStorage.removeItem('planning.piecesNettoyees'); } catch (x) { /* rien */ }
      window.__ORPHELINES = ['fichiers/zzz/Vieux.pdf', 'vignettes/zzz.jpg']; window.__ECRITURES = [];
      const a0 = window.__ORPHELINES_APPELS || 0;
      const n1 = await nettoyerPiecesOrphelines_();
      const n2 = await nettoyerPiecesOrphelines_();
      const e = window.__ECRITURES.slice(), a1 = window.__ORPHELINES_APPELS - a0;
      localStorage.removeItem('planning.piecesNettoyees');
      const rpc = sbClient.rpc;
      sbClient.rpc = () => { throw new Error('réseau'); };
      const n3 = await nettoyerPiecesOrphelines_();
      sbClient.rpc = rpc;
      localStorage.removeItem('planning.piecesNettoyees');
      window.__ORPHELINES = [];
      const n4 = await nettoyerPiecesOrphelines_();
      return { n1, n2, n3, n4, e, a1 };
    });
    verifier(net.n1 === 2 && JSON.stringify(net.e) === JSON.stringify(['storage:remove:["fichiers/zzz/Vieux.pdf","vignettes/zzz.jpg"]']) && net.n2 === 0 && net.a1 === 1,
      'nettoyage : fichiers orphelins effacés, une fois par jour au plus (' + JSON.stringify(net) + ')');
    verifier(net.n3 === 0 && net.n4 === 0, 'nettoyage : erreur ou rien à effacer → silencieux');
    verifier(/if \(typeof nettoyerPiecesOrphelines_ === "function"\) setTimeout\(nettoyerPiecesOrphelines_, 20000\);/.test(fs.readFileSync(path.join(RACINE, 'js/donnees-sync.js'), 'utf8')),
      'nettoyage : lancé 20 s après l’ouverture de l’appli');
    erreurs.push(...e);
    await page.context().close();
  }

  // ---- H. Liens ouvrier et responsable ----------------------------------------------
  const SEMAINE = { personne: { nom: 'Mathis', sous_traitant: false, equipe: false }, lundi: '2026-10-19', aujourdhui: '2026-10-21', min: '2026-09-01', max: '2027-03-01',
    feries: [], horaires: [], taches: [
      { date: '2026-10-21', demi: 'matin', ordre: 0, texte: 'Coffrage', important: false, absence: false, chantier: '26150 - Villa Bine', couleur: '#bfe0c9', statut: null,
        couleur_statut: null, details: 'Bien vibrer\nAttention aux angles', pieces: [PDF, PHOTO], lat: 46.2, lng: 6.1 },
      { date: '2026-10-21', demi: 'aprem', ordre: 0, texte: 'Décoffrage', important: false, absence: false, chantier: '26150 - Villa Bine', couleur: '#bfe0c9', statut: null,
        couleur_statut: null, details: null, pieces: [] }] };
  const tR = (date, demi, pieces) => ({ personne: 1, date, demi, ordre: 0, texte: 'Coffrage', important: false, absence: false, chantier: 'Villa Lac', couleur: '#cfe8c9',
    statut: null, couleur_statut: null, details: null, pieces });
  const RESPONSABLE = { nom: 'Responsable', lundi: '2026-10-19', aujourdhui: '2026-10-21', min: '2026-10-19', max: '2026-11-16',
    personnes: [{ id: 1, nom: 'Marco', section: 'personnel' }], groupes: [], ordre_groupes: [], jalons: [], notes: [], feries: [], horaires: [],
    taches: [tR('2026-10-21', 'matin', [PDF]), tR('2026-10-21', 'aprem', []), tR('2026-10-22', 'matin', [PHOTO]), tR('2026-10-22', 'aprem', [PHOTO])] };

  async function ouvrirLien(page_, o) {
    o = o || {};
    const ctx = await browser.newContext({ viewport: o.viewport || { width: 360, height: 760 } });
    const page = await ctx.newPage();
    const errs = [], demandes = [], rpc = [];
    page.on('pageerror', (x) => errs.push(String(x)));
    await page.clock.setFixedTime(new Date('2026-10-21T10:00:00'));
    await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await page.route(/\/rest\/v1\/rpc\/consultation_(planning|responsable)/, (r) => {
      const corps = JSON.parse(r.request().postData() || '{}');
      rpc.push(corps);
      r.fulfill({ contentType: 'application/json', body: JSON.stringify(/responsable/.test(r.request().url()) ? RESPONSABLE : SEMAINE) });
    });
    await page.route(/\/functions\/v1\/pieces-lien/, (r) => {
      const corps = JSON.parse(r.request().postData() || '{}');
      demandes.push({ corps, entetes: r.request().headers() });
      if (o.erreur) return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, erreur: 'panne' }) });
      const urls = {};
      corps.chemins.forEach((c) => { urls[c] = 'https://signe.local/lien/' + c; });
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, urls }) });
    });
    await page.goto('file://' + path.join(RACINE, page_ + '.html') + '?j=' + (page_ === 'responsable' ? JETON_R : JETON));
    await page.waitForTimeout(400);
    return { ctx, page, errs, demandes, rpc };
  }
  const lireLien = (page) => page.evaluate(() => {
    const fiche = document.querySelector('.dl-fiche');
    const boutons = [...document.querySelectorAll('.tache-joint')].map((b) => b.textContent);
    if (!fiche) return { boutons, fiche: null, fond: !!document.querySelector('.dl-fond'), focus: document.activeElement && document.activeElement.className };
    const r = fiche.getBoundingClientRect();
    return {
      boutons, fond: !!document.querySelector('.dl-fond'),
      fiche: {
        role: fiche.getAttribute('role') + '/' + fiche.getAttribute('aria-modal'), titre: fiche.querySelector('.dl-titre').textContent,
        details: (fiche.querySelector('.dl-details') || {}).textContent, ws: fiche.querySelector('.dl-details') && getComputedStyle(fiche.querySelector('.dl-details')).whiteSpace,
        label: (fiche.querySelector('.dl-label') || {}).textContent,
        liens: [...fiche.querySelectorAll('a.dl-fichier')].map((a) => ({ href: a.href, cible: a.target, nom: a.querySelector('.dl-nom').textContent, taille: a.querySelector('.dl-taille').textContent,
          img: (a.querySelector('.dl-apercu img') || {}).src || null, pdf: (a.querySelector('.dl-apercu b') || {}).textContent || null })),
        attente: [...fiche.querySelectorAll('span.dl-fichier.attente .dl-taille')].map((s) => s.textContent),
        erreur: fiche.querySelector('.dl-erreur') ? !fiche.querySelector('.dl-erreur').hidden : null,
        rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, focusFermer: document.activeElement === fiche.querySelector('.dl-fermer')
      }
    };
  });

  {
    const { ctx, page, errs, demandes, rpc } = await ouvrirLien('consultation');
    let s = await lireLien(page);
    verifier(JSON.stringify(s.boutons) === JSON.stringify(['Détails · 2 fichiers']) && (await page.evaluate(() => !!document.querySelector('.tache-joint svg path[d^="M21 11.5"]'))),
      'lien ouvrier : bouton « Détails · 2 fichiers » (trombone) sur la seule tâche qui en a');
    const ouvrables = await page.evaluate(() => [...document.querySelectorAll('.tache[data-fiche-tache]')].map((t) => t.querySelector('.texte').textContent + ':' + getComputedStyle(t).cursor));
    verifier(JSON.stringify(ouvrables) === '["Coffrage:pointer"]', 'lien ouvrier : la tâche entière se touche (curseur main), pas celle sans détails (' + ouvrables.join(', ') + ')');
    await page.click('.tache:has-text("Décoffrage") .texte');
    await page.waitForTimeout(150);
    const rienSansDetails = !(await lireLien(page)).fiche && demandes.length === 0;
    await page.click('.tache[data-fiche-tache] .chantier-gps');
    await page.waitForTimeout(150);
    const gps = await page.evaluate(() => ({ menu: !!document.querySelector('.gps-menu, .gps-feuille, .gps-lien'), fiche: !!document.querySelector('.dl-fiche') }));
    verifier(rienSansDetails && gps.menu && !gps.fiche && demandes.length === 0, 'lien ouvrier : le bouton GPS de la tâche ouvre son menu, pas la fiche ; une tâche sans détails ne fait rien');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    await page.click('.tache[data-fiche-tache] .texte');
    await page.waitForTimeout(300);
    s = await lireLien(page);
    verifier(s.fiche && s.fiche.titre === 'Coffrage', 'lien ouvrier : toucher le texte de la tâche ouvre sa fiche (« qu’il soit visible […] en cliquant sur la tâche »)');
    verifier(s.fiche && s.fond && s.fiche.role === 'dialog/true' && s.fiche.titre === 'Coffrage' && s.fiche.details === 'Bien vibrer\nAttention aux angles' && s.fiche.ws === 'pre-wrap' &&
      s.fiche.label === 'Fichiers' && s.fiche.focusFermer, 'lien ouvrier : fiche avec le texte de la tâche et les détails sur 2 lignes');
    verifier(s.fiche && s.fiche.liens.length === 2 && s.fiche.liens[0].href === 'https://signe.local/lien/' + PDF.chemin && s.fiche.liens[0].cible === '_blank' && s.fiche.liens[0].pdf === 'PDF' &&
      s.fiche.liens[0].taille === '121 Ko' && s.fiche.liens[1].href === 'https://signe.local/lien/' + PHOTO.chemin && s.fiche.liens[1].img === 'https://signe.local/lien/' + PHOTO.vignette &&
      s.fiche.liens[1].nom === 'Photo.jpg' && s.fiche.erreur === false, 'lien ouvrier : fichiers en original (nouvel onglet), vignette de la photo, PDF marqué');
    const d = demandes[0] || { corps: {}, entetes: {} };
    verifier(demandes.length === 1 && JSON.stringify(d.corps) === JSON.stringify({ jeton: JETON, page: 'consultation', lundi: '2026-10-19', chemins: [PDF.chemin, PHOTO.chemin, PHOTO.vignette] }) &&
      d.entetes.apikey && d.entetes.authorization === 'Bearer ' + d.entetes.apikey,
      'lien ouvrier : adresses demandées à pieces-lien avec le jeton, la page et la semaine affichée (' + JSON.stringify(d.corps) + ')');
    verifier(s.fiche && s.fiche.rect.bottom === 760 && s.fiche.rect.left === 0 && s.fiche.rect.right === 360, 'lien ouvrier (téléphone) : fiche en feuille du bas');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    s = await lireLien(page);
    verifier(!s.fiche && !s.fond && s.focus === 'tache-joint', 'lien ouvrier : Échap ferme la fiche, le focus revient au bouton');
    await page.click('.tache[data-fiche-tache] .details');
    await page.waitForTimeout(200);
    s = await lireLien(page);
    verifier(s.fiche && s.fiche.liens.length === 2 && demandes.length === 1, 'lien ouvrier : rouverte, la fiche reprend les adresses déjà reçues (pas de nouvelle demande)');
    await page.click('.dl-fermer');
    verifier(!(await lireLien(page)).fiche && rpc.length === 1, 'lien ouvrier : « Fermer » ferme ; la semaine n’est pas relue');
    errs.forEach((x) => erreurs.push(x));
    await ctx.close();
  }
  {
    const { ctx, page, errs } = await ouvrirLien('consultation', { erreur: true, viewport: { width: 1280, height: 800 } });
    await page.click('.tache-joint');
    await page.waitForTimeout(300);
    const s = await lireLien(page);
    verifier(s.fiche && s.fiche.erreur === true && s.fiche.liens.length === 0 && JSON.stringify(s.fiche.attente) === '["Indisponible","Indisponible"]' && s.fiche.details,
      'lien ouvrier, pieces-lien en panne : « Fichiers inaccessibles », la fiche montre quand même les détails');
    verifier(Math.abs((s.fiche.rect.left + s.fiche.rect.right) / 2 - 640) < 1 && Math.abs((s.fiche.rect.top + s.fiche.rect.bottom) / 2 - 400) < 1 && s.fiche.rect.right - s.fiche.rect.left === 420,
      'lien ouvrier (ordinateur) : fiche centrée, 420 px');
    errs.forEach((x) => erreurs.push(x));
    await ctx.close();
  }
  {
    const { ctx, page, errs, demandes, rpc } = await ouvrirLien('responsable', { viewport: { width: 1400, height: 800 } });
    const bulles = await page.evaluate(() => [...document.querySelectorAll('.bulle.tache')].map((b) => ({ col: b.style.gridColumn, joint: (b.querySelector('.tache-joint') || {}).textContent || '' })));
    verifier(bulles.length === 3 && bulles.filter((b) => b.joint === '1 fichier').length === 2 && bulles.filter((b) => !b.joint).length === 1,
      'lien responsable : 21 matin (un fichier) et 21 aprem (aucun) restent 2 bulles, le 22 (mêmes fichiers) une seule (' + JSON.stringify(bulles) + ')');
    verifier(await page.evaluate(() => !document.querySelector('[data-fiche-tache]')), 'lien responsable : seul le bouton ouvre la fiche (la bulle garde son comportement)');
    await page.click('.bulle.tache .tache-joint');
    await page.waitForTimeout(300);
    let s = await lireLien(page);
    verifier(s.fiche && !s.fiche.details && s.fiche.liens.length === 1 && demandes.length === 1 && demandes[0].corps.page === 'responsable' && demandes[0].corps.jeton === JETON_R &&
      demandes[0].corps.lundi === '2026-10-19', 'lien responsable : fiche (fichiers seuls), demande faite pour la page responsable');
    const n = rpc.length;
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    verifier(rpc.length === n && (await lireLien(page)).fiche, 'lien responsable : la flèche ne change pas la semaine sous la fiche');
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    s = await lireLien(page);
    verifier(!s.fiche && rpc.length === n + 1, 'lien responsable : Échap ferme, la flèche change de nouveau la semaine');
    errs.forEach((x) => erreurs.push(x));
    await ctx.close();
  }

  // ---- I. Ordre des scripts --------------------------------------------------------------
  {
    const scripts = (f) => [...fs.readFileSync(path.join(RACINE, f), 'utf8').matchAll(/<script src="([^"]+)"/g)].map((x) => x[1]);
    const app = scripts('index.html');
    verifier(app.indexOf('js/pieces-jointes.js') === app.indexOf('js/formulaires-communs.js') + 1 && app.indexOf('js/pieces-jointes.js') < app.indexOf('js/formulaires-edition.js'),
      'index.html : js/pieces-jointes.js chargé après formulaires-communs.js, avant la fiche');
    for (const p of ['consultation', 'responsable']) {
      const s = scripts(p + '.html');
      verifier(s.indexOf('js/details-lien.js') === s.indexOf('js/gps.js') + 1 && s.indexOf('js/details-lien.js') < s.indexOf('js/' + p + '.js'),
        p + '.html : js/details-lien.js chargé après gps.js, avant la page');
    }
  }

  await browser.close();
  process.exit(bilan(erreurs));
})();
