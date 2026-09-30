const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 122). Lionel :
//   « Enlever le bouton pour ajuster les hauteur de ligne. »
//   « Pastille de couleur pour le chantier dans les notes et jalons, pas de
//     chantier = pas de pastille . ajouter le chantier aux formulaires note
//     et jalons. »
// Vérifie :
//   1. plus de bouton « Hauteur des lignes » dans la barre ; « Rétablir »
//      des lignes réglées à part dans la page Affichage ;
//   2. jalon et note avec chantier : fond du type, pastille à la couleur du
//      chantier ; sans chantier : aucune pastille ;
//   3. fiche note de la grille : choix du chantier (« Aucun chantier » par
//      défaut), pastille dans la fiche, chantier enregistré en base ;
//      changer le chantier d'une note existante l'enregistre aussi ;
//   4. fiche jalon de la grille : même choix, enregistré ;
//   5. pages Jalons et Notes : pastille dans la liste, champ chantier de la
//      fiche Notes enregistré ;
//   6. impression : pastille devant le jalon / la note avec chantier.
//
// Lancer : node test_suite122.js

const CH = [
  { id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 },
  { id: 2, nom: '26190 - Villa Bleue', couleur: '#3a7bd5', actif: true, ordre: 2 }
];
const BD = () => ({
  chantiers: CH,
  jalons: [
    { id: 1, date: '2026-09-22', texte: 'Livraison', demi: null, important: false, chantier_id: 2, serie_id: null },
    { id: 2, date: '2026-09-23', texte: 'Réception', demi: null, important: false, chantier_id: null, serie_id: null }
  ],
  notes: [
    { id: 1, date: '2026-09-24', texte: 'Grue', demi: null, important: false, chantier_id: 2, serie_id: null },
    { id: 2, date: '2026-09-25', texte: 'Tri', demi: null, important: false, chantier_id: null, serie_id: null }
  ]
});
const bulle = (page, liste, texte) => page.evaluate(([liste, texte]) => {
  const it = window[liste].find((x) => x.texte === texte);
  if (!it) return null;
  const el = document.querySelector('#racine .bulle[data-id="' + it.id + '"]');
  if (!el) return { it: true, el: false };
  const p = el.querySelector('.b-carte .b-pastille');
  return { chantierId: it.chantierId, fond: getComputedStyle(el.querySelector('.b-carte')).backgroundColor, pastille: p ? getComputedStyle(p).backgroundColor : null, titre: el.title };
}, [liste, texte]);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Bouton des hauteurs retiré, « Rétablir » dans la page Affichage ----
  {
    const { page, erreurs } = await ouvrirPlanning(browser);
    const barre = await page.evaluate(() => ({ groupe: !!document.getElementById('groupeHauteurs'), panneau: !!document.querySelector('.hauteurs-panneau') }));
    verifier(!barre.groupe && !barre.panneau, 'barre : plus de bouton ni de panneau « Hauteur des lignes » (' + JSON.stringify(barre) + ')');
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(250);
    const avant = await page.evaluate(() => document.getElementById('btnHauteursRetablir').hidden);
    await page.evaluate(() => changerHauteursLignes(['1'], 90)); await page.waitForTimeout(200);
    const regle = await page.evaluate(() => { const b = document.getElementById('btnHauteursRetablir'); return { hidden: b.hidden, texte: b.textContent }; });
    verifier(avant && !regle.hidden && /Rétablir la ligne/.test(regle.texte), 'page Affichage : « Rétablir » caché sans ligne réglée, visible après (' + JSON.stringify({ avant, regle }) + ')');
    await page.click('#btnHauteursRetablir'); await page.waitForTimeout(200);
    const apres = await page.evaluate(() => ({ n: Object.keys(hauteursLignesPerso_()).length, hidden: document.getElementById('btnHauteursRetablir').hidden }));
    verifier(apres.n === 0 && apres.hidden, 'clic sur « Rétablir » : plus aucune ligne réglée à part (' + JSON.stringify(apres) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 2 à 6. Chantier des jalons et des notes ------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    await page.waitForTimeout(300);
    const fondJalon = await page.evaluate(() => { const d = document.createElement('div'); d.style.background = 'var(--jalon-bg)'; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
    const fondNote = await page.evaluate(() => { const d = document.createElement('div'); d.style.background = 'var(--note-bg)'; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
    const bleu = 'rgb(58, 123, 213)';
    const jAvec = await bulle(page, 'JALONS', 'Livraison'), jSans = await bulle(page, 'JALONS', 'Réception');
    verifier(jAvec && jAvec.fond === fondJalon && jAvec.pastille === bleu && /Villa Bleue/.test(jAvec.titre), 'jalon avec chantier : fond des jalons, pastille du chantier (' + JSON.stringify(jAvec) + ')');
    verifier(jSans && jSans.fond === fondJalon && jSans.pastille === null, 'jalon sans chantier : pas de pastille (' + JSON.stringify(jSans) + ')');
    const nAvec = await bulle(page, 'NOTES', 'Grue'), nSans = await bulle(page, 'NOTES', 'Tri');
    verifier(nAvec && nAvec.chantierId === 2 && nAvec.fond === fondNote && nAvec.pastille === bleu, 'note avec chantier : fond des notes, pastille du chantier (' + JSON.stringify(nAvec) + ')');
    verifier(nSans && nSans.pastille === null, 'note sans chantier : pas de pastille (' + JSON.stringify(nSans) + ')');

    // 3. Fiche note de la grille : nouvelle note avec chantier.
    const fiche = await page.evaluate(() => {
      ouvrirEditionPlage('note', null, giDepuisIso('2026-09-21'), 1, 300, 300);
      const s = document.querySelector('.form-pop .f-chantier-jalon');
      return s ? { premiere: s.options[0].textContent, valeur: s.value, pastille: !!document.querySelector('.form-pop .pastille-chantier-fiche') } : null;
    });
    verifier(fiche && fiche.premiere === 'Aucun chantier' && fiche.valeur === '' && !fiche.pastille, 'fiche note : choix du chantier, « Aucun chantier » par défaut, sans pastille (' + JSON.stringify(fiche) + ')');
    await page.selectOption('.form-pop .f-chantier-jalon', '2'); await page.waitForTimeout(100);
    const pastFiche = await page.evaluate(() => { const p = document.querySelector('.form-pop .pastille-chantier-fiche'); return p ? getComputedStyle(p).backgroundColor : null; });
    verifier(pastFiche === bleu, 'fiche note : la pastille suit le chantier choisi (' + pastFiche + ')');
    await page.click('.form-pop .descriptif-texte');
    await page.fill('.form-pop .desc-edit-box textarea', 'Béton');
    await page.click('.form-pop .desc-edit-box .popup-valider');
    await page.click('.form-pop .f-ok'); await page.waitForTimeout(1500);
    const bdNote = await page.evaluate(() => window.__BD.notes.filter((n) => n.texte === 'Béton').map((n) => n.chantier_id));
    verifier(bdNote.length === 1 && bdNote[0] === 2, 'nouvelle note : chantier enregistré (' + JSON.stringify(bdNote) + ')');
    const nNeuve = await bulle(page, 'NOTES', 'Béton');
    verifier(nNeuve && nNeuve.pastille === bleu, 'nouvelle note : pastille dans la grille (' + JSON.stringify(nNeuve) + ')');

    // Note existante sans chantier -> chantier 1.
    await page.evaluate(() => ouvrirEditionPlage('note', NOTES.find((n) => n.texte === 'Tri'), null, null, 300, 300));
    await page.selectOption('.form-pop .f-chantier-jalon', '1');
    await page.click('.form-pop .f-ok'); await page.waitForTimeout(1500);
    const bdTri = await page.evaluate(() => window.__BD.notes.filter((n) => n.texte === 'Tri').map((n) => n.chantier_id));
    verifier(bdTri.length === 1 && bdTri[0] === 1, 'note modifiée : nouveau chantier enregistré, sans doublon (' + JSON.stringify(bdTri) + ')');

    // 4. Fiche jalon : retirer le chantier de « Livraison ».
    await page.evaluate(() => ouvrirEditionPlage('jalon', JALONS.find((j) => j.texte === 'Livraison'), null, null, 300, 300));
    const valJ = await page.evaluate(() => document.querySelector('.form-pop .f-chantier-jalon').value);
    await page.selectOption('.form-pop .f-chantier-jalon', '');
    await page.click('.form-pop .f-ok'); await page.waitForTimeout(1500);
    const bdLiv = await page.evaluate(() => window.__BD.jalons.filter((j) => j.texte === 'Livraison').map((j) => j.chantier_id));
    const jLiv = await bulle(page, 'JALONS', 'Livraison');
    verifier(valJ === '2' && bdLiv.length === 1 && bdLiv[0] === null && jLiv && jLiv.pastille === null, 'fiche jalon : chantier affiché (' + valJ + '), retiré et enregistré (' + JSON.stringify(bdLiv) + '), plus de pastille');

    // Déplacer une note avec chantier (Ctrl+flèche équivalent : modifier la
    // date par l'état) garde son chantier.
    await page.evaluate(() => { sauvegarderUndo(); const n = NOTES.find((x) => x.texte === 'Grue'); n.giDebut += 1; n.dateDebutIso = isoDeGi(n.giDebut); render(); });
    await page.waitForTimeout(1500);
    const bdGrue = await page.evaluate(() => window.__BD.notes.filter((n) => n.texte === 'Grue').map((n) => n.date + ':' + n.chantier_id));
    verifier(JSON.stringify(bdGrue) === JSON.stringify(['2026-09-25:2']), 'note déplacée : garde son chantier (' + JSON.stringify(bdGrue) + ')');

    // 5. Pages Jalons et Notes.
    await page.evaluate(() => afficherPage('notes')); await page.waitForTimeout(500);
    const listeNotes = await page.evaluate(() => [...document.querySelectorAll('#listeNotes .ligne-note')].map((l) => l.querySelector('b').textContent + ':' + (l.querySelector('.pastille-chantier-liste') ? getComputedStyle(l.querySelector('.pastille-chantier-liste')).backgroundColor : '-')));
    verifier(listeNotes.includes('Grue:' + bleu) && listeNotes.includes('Tri:rgb(247, 217, 168)'), 'page Notes : pastille du chantier dans la liste (' + JSON.stringify(listeNotes) + ')');
    await page.click('#listeNotes .ligne-ajouter'); await page.waitForTimeout(200);
    const ficheNotes = await page.evaluate(() => { const s = document.querySelector('.fiche-note .f-chantier-jalon'); return s ? s.value : null; });
    await page.selectOption('.fiche-note .f-chantier-jalon', '2');
    await page.fill('.fiche-note .f-texte-note', 'Échafaudage');
    await page.click('.fiche-note .f-ok'); await page.waitForTimeout(800);
    const bdEch = await page.evaluate(() => window.__BD.notes.filter((n) => n.texte === 'Échafaudage').map((n) => n.chantier_id));
    verifier(ficheNotes === '' && bdEch.length >= 1 && bdEch.every((c) => c === 2), 'page Notes : fiche avec chantier (vide par défaut), enregistré (' + JSON.stringify({ ficheNotes, bdEch }) + ')');
    await page.evaluate(() => afficherPage('jalons')); await page.waitForTimeout(500);
    const listeJalons = await page.evaluate(() => [...document.querySelectorAll('#page-jalons .ligne-intervenant')].map((l) => l.querySelector('b').textContent + ':' + (l.querySelector('.pastille-chantier-liste') ? 'p' : '-')));
    verifier(listeJalons.some((x) => x === 'Livraison:-') && listeJalons.some((x) => x === 'Réception:-'), 'page Jalons : pas de pastille sans chantier (' + JSON.stringify(listeJalons) + ')');
    await page.click('#page-jalons .ligne-ajouter'); await page.waitForTimeout(200);
    const ficheJalons = await page.evaluate(() => { const s = document.querySelector('.form-pop .f-chantier-jalon'); return s ? { v: s.value, premiere: s.options[0].textContent } : null; });
    verifier(ficheJalons && ficheJalons.v === '' && ficheJalons.premiere === 'Aucun chantier', 'page Jalons : nouveau jalon sans chantier par défaut (' + JSON.stringify(ficheJalons) + ')');
    await page.evaluate(() => { if (popFermerActuel) popFermerActuel(); afficherPage('planning'); });
    await page.waitForTimeout(400);

    // 6. Impression : pastille devant la note / le jalon avec chantier.
    await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(400);
    const impr = await page.evaluate(() => [...document.querySelectorAll('table.print-table tr.print-jalons td.filled, table.print-table tr.print-notes td.filled')].map((td) => {
      const p = td.querySelector('.print-pastille');
      return td.textContent.trim() + ':' + (p ? getComputedStyle(p).backgroundColor : '-');
    }));
    verifier(impr.includes('Grue:' + bleu) && impr.includes('Réception:-') && impr.includes('Livraison:-'), 'impression : pastille du chantier devant la note, rien sans chantier (' + JSON.stringify(impr) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan());
})();
