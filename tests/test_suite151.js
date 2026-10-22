const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 22.10.2026 (suite 151). Lionel, après la suite 150 (le PDF du
// lien des ouvriers s'ouvre) : « C'est ok.
// Rend le fichier téléchargeable, avec une icône de téléchargement. »
// Vérifie :
//   A. Liens ouvrier et responsable (js/details-lien.js) : à droite de chaque
//      fichier, un bouton flèche « Télécharger » : la même adresse signée
//      avec « download=<vrai nom> » (Supabase la renvoie en pièce à
//      enregistrer), nouvel onglet, attribut download ; rien tant que
//      l'adresse n'est pas là ou si elle manque ; taille au doigt sur
//      téléphone ; toucher la flèche ne ferme pas la fiche.
//   B. Appli (js/pieces-jointes.js) : même flèche dans la fiche, avant
//      « Retirer » ; la toucher ne retire rien.
//
// Lancer : node test_suite151.js

const RACINE = path.join(__dirname, '..');
const JETON = '0123456789abcdef0123456789abcdef';
const JETON_R = 'fedcba9876543210fedcba9876543210fedcba98';
const PDF = { chemin: 'fichiers/aaa/25152 - Domball.pdf', nom: '25152 - Domball.pdf', type: 'application/pdf', taille: 123904 };
const PHOTO = { chemin: 'fichiers/bbb/Photo ete.jpg', nom: 'Photo été.jpg', type: 'image/jpeg', taille: 2411724, vignette: 'vignettes/bbb.jpg' };
const signeLien = (c) => 'https://signe.local/lien/' + c + '?token=t' + c.length;
const telechargerLien = (p) => signeLien(p.chemin) + '&download=' + encodeURIComponent(p.nom);

(async () => {
  const { verifier, bilan } = verificateur();
  const erreurs = [];
  const browser = await lancerNavigateur(chromium);

  // ---- A. Liens ouvrier et responsable ------------------------------------------
  const SEMAINE = { personne: { nom: 'Mathis', sous_traitant: false, equipe: false }, lundi: '2026-10-19', aujourdhui: '2026-10-21', min: '2026-09-01', max: '2027-03-01',
    feries: [], horaires: [], taches: [
      { date: '2026-10-21', demi: 'matin', ordre: 0, texte: 'Aménagement extérieurs', important: false, absence: false, chantier: '25152 - Domball', couleur: '#bfe0c9',
        statut: null, couleur_statut: null, details: 'Voir le plan', pieces: [PDF, PHOTO] }] };
  const RESPONSABLE = { nom: 'Responsable', lundi: '2026-10-19', aujourdhui: '2026-10-21', min: '2026-10-19', max: '2026-11-16',
    personnes: [{ id: 1, nom: 'Marco', section: 'personnel' }], groupes: [], ordre_groupes: [], jalons: [], notes: [], feries: [], horaires: [],
    taches: [{ personne: 1, date: '2026-10-21', demi: 'matin', ordre: 0, texte: 'Coffrage', important: false, absence: false, chantier: 'Villa Lac', couleur: '#cfe8c9',
      statut: null, couleur_statut: null, details: null, pieces: [PDF] }] };

  async function ouvrirLien(page_, o) {
    const ctx = await browser.newContext({ viewport: o.viewport });
    const page = await ctx.newPage();
    const errs = [], fichiers = [];
    let lacher = null;
    page.on('pageerror', (x) => errs.push(String(x)));
    await page.clock.setFixedTime(new Date('2026-10-21T10:00:00'));
    await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await page.route(/\/rest\/v1\/rpc\/consultation_(planning|responsable)/, (r) =>
      r.fulfill({ contentType: 'application/json', body: JSON.stringify(/responsable/.test(r.request().url()) ? RESPONSABLE : SEMAINE) }));
    await page.route(/\/functions\/v1\/pieces-lien/, async (r) => {
      const corps = JSON.parse(r.request().postData() || '{}');
      if (o.retenir) await new Promise((ok) => { lacher = ok; });
      const urls = {};
      corps.chemins.forEach((c) => { if (!(o.sauf && o.sauf === c)) urls[c] = signeLien(c); });
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, urls }) });
    });
    // Le « Supabase Storage » des adresses signées : pièce à enregistrer.
    await ctx.route(/signe\.local/, (r) => {
      fichiers.push(r.request().url());
      r.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'Content-Disposition': 'attachment' }, body: '%PDF-1.4' });
    });
    await page.goto('file://' + path.join(RACINE, page_ + '.html') + '?j=' + (page_ === 'responsable' ? JETON_R : JETON));
    await page.waitForTimeout(400);
    return { ctx, page, errs, fichiers, lacher: () => lacher && lacher() };
  }
  const lireFiche = (page) => page.evaluate(() => {
    const f = document.querySelector('.dl-fiche');
    if (!f) return null;
    return [...f.querySelectorAll('.dl-liste li')].map((li) => {
      const ouvrir = li.querySelector('.dl-fichier'), t = li.querySelector('a.dl-telecharger');
      const ro = ouvrir.getBoundingClientRect(), rl = li.getBoundingClientRect(), rt = t && t.getBoundingClientRect();
      return {
        nom: li.querySelector('.dl-nom').textContent, ouvrir: ouvrir.tagName === 'A' ? ouvrir.getAttribute('href') : null,
        t: t && { href: t.getAttribute('href'), download: t.getAttribute('download'), cible: t.target, rel: t.rel, titre: t.title, aria: t.getAttribute('aria-label'),
          fleche: !!t.querySelector('svg path[d="M12 4v11"]'), w: rt.width, h: rt.height, droite: rl.right - rt.right, ecart: rt.left - ro.right, memeLigne: Math.abs(rt.top - ro.top) < 1 && Math.abs(rt.bottom - ro.bottom) < 1 }
      };
    });
  });

  {
    const { ctx, page, errs, fichiers } = await ouvrirLien('consultation', { viewport: { width: 360, height: 760 } });
    await page.click('.tache[data-fiche-tache] .texte');
    await page.waitForTimeout(300);
    const l = await lireFiche(page);
    verifier(l && l.length === 2 && l.every((x) => x.t && x.t.fleche && x.t.titre === 'Télécharger' && x.t.aria === 'Télécharger ' + x.nom),
      'lien ouvrier : une flèche « Télécharger » à côté de chaque fichier (« Télécharger 25152 - Domball.pdf » pour les lecteurs d’écran)');
    verifier(l && l[0].t.href === telechargerLien(PDF) && l[1].t.href === telechargerLien(PHOTO) && l[0].ouvrir === signeLien(PDF.chemin) &&
      l.every((x) => x.t.download === x.nom && x.t.cible === '_blank' && x.t.rel === 'noopener'),
      'lien ouvrier : même adresse signée avec « &download=<vrai nom> » (accents compris), nouvel onglet ; toucher le fichier l’ouvre toujours (' + (l && l[1].t.href) + ')');
    verifier(l && l.every((x) => x.t.w === 52 && x.t.h >= 48 && x.t.droite === 0 && x.t.ecart === 4 && x.t.memeLigne),
      'lien ouvrier (téléphone) : bouton de 52 × ' + (l && l[0].t.h) + ' px au bord droit, sur la ligne du fichier, 4 px d’écart');
    await page.click('.dl-liste li:first-child a.dl-telecharger');
    await page.waitForTimeout(500);
    verifier(fichiers.some((u) => u === 'https://signe.local/lien/fichiers/aaa/25152%20-%20Domball.pdf?token=t' + PDF.chemin.length + '&download=25152%20-%20Domball.pdf') &&
      (await page.evaluate(() => !!document.querySelector('.dl-fiche'))),
      'lien ouvrier : toucher la flèche demande le fichier en téléchargement ; la fiche reste ouverte (' + fichiers.join(', ') + ')');
    errs.forEach((x) => erreurs.push(x));
    await ctx.close();
  }
  {
    const o = await ouvrirLien('consultation', { viewport: { width: 1280, height: 800 }, retenir: true, sauf: PHOTO.chemin });
    await o.page.click('.tache-joint');
    await o.page.waitForTimeout(200);
    const avant = await lireFiche(o.page);
    o.lacher();
    await o.page.waitForTimeout(300);
    const apres = await lireFiche(o.page);
    verifier(avant && avant.every((x) => !x.t) && apres && apres[0].t && apres[0].t.href === telechargerLien(PDF) && !apres[1].t && apres[0].t.w === 52,
      'lien ouvrier : pas de flèche avant l’adresse, ni pour un fichier sans adresse ; ordinateur : même bouton');
    o.errs.forEach((x) => erreurs.push(x));
    await o.ctx.close();
  }
  {
    const { ctx, page, errs } = await ouvrirLien('responsable', { viewport: { width: 1400, height: 800 } });
    await page.click('.bulle.tache .tache-joint');
    await page.waitForTimeout(300);
    const l = await lireFiche(page);
    verifier(l && l.length === 1 && l[0].t && l[0].t.href === telechargerLien(PDF) && l[0].t.download === PDF.nom,
      'lien responsable : même flèche « Télécharger »');
    errs.forEach((x) => erreurs.push(x));
    await ctx.close();
  }

  // ---- B. Appli : fiche de la tâche ---------------------------------------------------
  {
    const ligne = (id, date, demi) => ({ id, personne_id: 1, date, demi, ordre: 0, texte: 'Aménagement', statut_id: null, important: false, serie_id: null, est_absence: false,
      chantier_id: 1, details: null, pieces: [PDF, PHOTO] });
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: { taches: [ligne(1, '2026-09-22', 'matin'), ligne(2, '2026-09-22', 'aprem')] } });
    await page.waitForTimeout(1200);
    const demandes = [];
    await page.context().route(/signe\.local/, (r) => {
      demandes.push(r.request().url());
      r.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'Content-Disposition': 'attachment' }, body: '%PDF-1.4' });
    });
    await page.evaluate(() => ouvrirEdition(null, TACHES.find((t) => t.texte === 'Aménagement'), null, 300, 300));
    await page.waitForTimeout(300);
    const lire = () => page.evaluate(() => [...document.querySelectorAll('.form-pop .pj-item')].map((li) => {
      const t = li.querySelector('a.pj-telecharger'), r = li.querySelector('.pj-retirer');
      return { nom: li.querySelector('.pj-nom').textContent, t: t && { href: t.getAttribute('href'), download: t.getAttribute('download'), cible: t.target, titre: t.title,
        aria: t.getAttribute('aria-label'), fleche: !!t.querySelector('svg path[d="M12 4v11"]'), w: t.getBoundingClientRect().width, h: t.getBoundingClientRect().height,
        avantRetirer: t.nextElementSibling === r, gauche: r.getBoundingClientRect().left - t.getBoundingClientRect().right } };
    }));
    const l = await lire();
    verifier(l.length === 2 && l.every((x) => x.t && x.t.fleche && x.t.titre === 'Télécharger' && x.t.aria === 'Télécharger ' + x.nom && x.t.avantRetirer && x.t.gauche === 6 &&
      x.t.w === 26 && x.t.h === 26), 'appli : flèche « Télécharger » (26 px) juste avant « Retirer » sur chaque fichier');
    verifier(l.length === 2 && l[0].t.href === 'https://signe.local/pieces/' + PDF.chemin + '?download=' + encodeURIComponent(PDF.nom) &&
      l[1].t.href === 'https://signe.local/pieces/' + PHOTO.chemin + '?download=' + encodeURIComponent(PHOTO.nom) && l.every((x) => x.t.download === x.nom && x.t.cible === '_blank'),
      'appli : adresse signée avec « ?download=<vrai nom> », nouvel onglet (' + (l[1] && l[1].t.href) + ')');
    await page.click('.form-pop .pj-item:first-child a.pj-telecharger');
    await page.waitForTimeout(500);
    const apres = await lire();
    verifier(demandes.some((u) => /\/pieces\/fichiers\/aaa\/25152%20-%20Domball\.pdf\?download=25152%20-%20Domball\.pdf$/.test(u)) && apres.length === 2 &&
      (await page.evaluate(() => !!document.querySelector('.form-pop'))), 'appli : la flèche télécharge, ne retire rien et laisse la fiche ouverte');
    erreurs.push(...e);
    await page.context().close();
  }

  await browser.close();
  process.exit(bilan(erreurs));
})();
