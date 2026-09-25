const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 48) — propositions retenues par Lionel :
// « 8. Imprimer plusieurs semaines ou un mois » et « 9. Planning
// individuel : la feuille d'une seule personne ». Aperçu d'impression :
// choix « Période » et « Pour » en haut (openPrintSheet,
// semaineImpression_, contenuSemaines_ dans js/impression.js).
//
// Lancer : node test_suite48.js

const T = (id, pid, date, demi, texte, ch) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: ch || 1, statut_id: null });
const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, ordre, actif: true }, x || {});
const BD = {
  personnes: [P(1, 'Lionel', 1), P(2, 'Mathis', 2), P(3, 'Marc', 3), P(10, 'Équipe A', 5, { equipe: true }), P(4, 'Béton', 6, { sous_traitant: true })],
  equipes_compositions: [{ id: 1, equipe_id: 10, lundi: '2026-09-21', membres: [3] }],
  chantiers: [{ id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 }, { id: 2, nom: '26150 - Villa Bine', couleur: '#bfe0c9', actif: true, ordre: 2 }],
  taches: [
    T(1, 1, '2026-09-24', 'matin', 'Coffrage', 1), T(2, 2, '2026-09-22', 'matin', 'Ferraillage', 1),
    T(3, 10, '2026-09-23', 'matin', 'Bétonnage dalle', 2), T(4, 10, '2026-09-23', 'aprem', 'Bétonnage dalle', 2),
    T(5, 1, '2026-09-29', 'matin', 'Villa murs', 2), T(6, 1, '2026-09-29', 'aprem', 'Villa murs', 2),
    T(7, 3, '2026-09-30', 'matin', 'Vacances', 1), T(8, 4, '2026-10-01', 'matin', 'Livraison béton', 2),
    T(9, 1, '2026-10-06', 'matin', 'Grue', 1)
  ]
};

const etatApercu = (page) => page.evaluate(() => {
  const doc = document.querySelector('.print-doc');
  const semaines = [...doc.querySelectorAll('.print-semaine')];
  return {
    titre: document.querySelector('.impression-modal .cp-titre').textContent,
    coins: semaines.map((s) => s.querySelector('.coin-semaine').textContent.replace(/^.*(Semaine \d+)$/, '$1')),
    lignes: semaines.map((s) => [...s.querySelectorAll('tbody > tr:not([class]) > td:first-child')].map((td) => td.childNodes[0].textContent).join('+')),
    legendes: semaines.map((s) => s.querySelectorAll('.print-legend').length),
    legendeFin: doc.querySelectorAll(':scope > .print-legend').length,
    titrePersonne: (doc.querySelector('.print-titre-personne') || {}).textContent || '',
    texte: doc.textContent,
    notes: [...doc.querySelectorAll('.skip-note')].map((n) => n.textContent),
    individuel: doc.classList.contains('impr-individuel'),
    personnes: (document.querySelector('.impr-personnes') || {}).textContent || ''
  };
});
const choisir = async (page, sel, val) => { await page.selectOption(sel, val); await page.waitForTimeout(250); };

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  for (const largeur of [1400, 360]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: 900 }, hasTouch: largeur < 600, bd: BD });
    await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(200);

    const choix = await page.evaluate(() => ({
      periode: [...document.querySelectorAll('.f-periode option')].map((o) => o.textContent).join('|'),
      pour: [...document.querySelectorAll('.f-pour > *')].map((o) => o.tagName === 'OPTGROUP' ? o.label + ':[' + [...o.children].map((x) => x.textContent.trim()).join(',') + ']' : o.textContent).join('|')
    }));
    verifier(choix.periode === 'Semaine 39|2 semaines (sem. 39 → 40)|3 semaines (sem. 39 → 41)|4 semaines (sem. 39 → 42)|6 semaines (sem. 39 → 44)|8 semaines (sem. 39 → 46)|Septembre 2026 (sem. 36 → 39)|Octobre 2026 (sem. 40 → 44)',
      largeur + ' px : périodes proposées — semaine affichée, 2 à 8 semaines, septembre et octobre (' + choix.periode + ')');
    verifier(choix.pour === 'Tout le monde|Personnel:[Équipe A,Marc,Lionel,Mathis]|Intervenants:[Béton]', largeur + ' px : « Pour » — tout le monde ou une personne, dans l\'ordre du planning (' + choix.pour + ')');

    let e = await etatApercu(page);
    verifier(e.titre === 'Aperçu impression — semaine 39' && e.coins.join() === 'Semaine 39' && e.lignes[0] === 'Équipe A+Lionel+Mathis',
      largeur + ' px : à l\'ouverture, rien ne change — la semaine affichée, pour tout le monde (' + e.lignes.join(' / ') + ')');

    // 3 semaines : la 41 n'est pas en cache, elle est lue sur le serveur.
    await choisir(page, '.f-periode', '3');
    e = await etatApercu(page);
    verifier(e.titre === 'Aperçu impression — semaines 39 → 41' && e.coins.join() === 'Semaine 39,Semaine 40,Semaine 41',
      largeur + ' px : 3 semaines — 3 tableaux complets, titre « semaines 39 → 41 » (' + e.coins.join() + ')');
    verifier(e.lignes.join(' / ') === 'Équipe A+Lionel+Mathis / Lionel+Marc+Béton / Lionel' && /Villa murs/.test(e.texte) && /Grue/.test(e.texte) && e.legendes.join() === '1,1,1',
      largeur + ' px : chaque semaine avec ses personnes, ses tâches et sa légende (' + e.lignes.join(' / ') + ')');
    verifier(e.notes.some((n) => /^Semaine 41 : 4 personne\(s\) sans rien cette semaine/.test(n)), largeur + ' px : les mentions à l\'écran disent de quelle semaine elles parlent (' + e.notes.join(' | ') + ')');

    if (largeur === 1400) {
      await page.emulateMedia({ media: 'print' });
      const pr = await page.evaluate(() => {
        const s = [...document.querySelectorAll('.print-semaine')];
        return { sauts: s.map((x) => getComputedStyle(x).breakBefore).join(), choix: getComputedStyle(document.querySelector('.impr-periode')).display };
      });
      await page.emulateMedia({ media: 'screen' });
      verifier(pr.sauts === 'auto,page,page' && pr.choix === 'none', 'impression : une semaine par page, choix Période / Pour jamais imprimés (' + pr.sauts + ', ' + pr.choix + ')');
    }

    await choisir(page, '.f-periode', 'mois:2026-09');
    e = await etatApercu(page);
    verifier(e.coins.join() === 'Semaine 36,Semaine 37,Semaine 38,Semaine 39' && e.titre === 'Aperçu impression — semaines 36 → 39',
      largeur + ' px : mois de septembre — les 4 semaines dont le jeudi est en septembre (' + e.coins.join() + ')');

    // Planning individuel.
    await choisir(page, '.f-periode', '3');
    await choisir(page, '.f-pour', '1');
    e = await etatApercu(page);
    verifier(e.titre === 'Aperçu impression — semaines 39 → 41 — Lionel' && e.titrePersonne === 'Planning de Lionel' && e.individuel,
      largeur + ' px : planning individuel — « Planning de Lionel » en titre (' + e.titre + ')');
    verifier(e.lignes.join(' / ') === 'Lionel / Lionel / Lionel' && e.legendes.join() === '0,0,0' && e.legendeFin === 1 && !/Ferraillage|Livraison béton/.test(e.texte),
      largeur + ' px : une ligne par semaine, rien des autres, une seule légende en bas (' + e.lignes.join(' / ') + ')');
    const alignes = await page.evaluate(() => [...document.querySelectorAll('.print-semaine')].map((s) => {
      const r = s.querySelector('.print-jours th:nth-child(2)').getBoundingClientRect(); return Math.round(r.left) + ':' + Math.round(r.width);
    }));
    verifier(new Set(alignes).size === 1, largeur + ' px : semaines empilées aux mêmes colonnes, lundi sous lundi (' + alignes.join(' ') + ')');
    verifier(/Planning individuel de Lionel/.test(e.personnes) && e.notes.length === 0, largeur + ' px : la liste des personnes des réglages est remplacée par un rappel');

    if (largeur === 1400) {
      await page.emulateMedia({ media: 'print' });
      const sauts = await page.evaluate(() => [...document.querySelectorAll('.print-semaine')].map((x) => getComputedStyle(x).breakBefore + '/' + getComputedStyle(x).breakInside).join());
      await page.emulateMedia({ media: 'screen' });
      verifier(sauts === 'auto/avoid,auto/avoid,auto/avoid', 'impression individuelle : semaines à la suite, jamais coupées (' + sauts + ')');
    }

    // Membre d'équipe : la ligne de l'équipe quand elle a du travail, la
    // sienne seulement s'il a quelque chose à lui.
    await choisir(page, '.f-pour', '3');
    e = await etatApercu(page);
    verifier(e.lignes.join(' / ') === 'Équipe A / Marc / Marc' && /Bétonnage dalle/.test(e.texte) && /Vacances/.test(e.texte),
      largeur + ' px : Marc (équipe A) — ligne de l\'équipe en semaine 39, la sienne ensuite (' + e.lignes.join(' / ') + ')');
    await choisir(page, '.f-pour', '2');
    e = await etatApercu(page);
    verifier(e.lignes.join(' / ') === 'Mathis / Mathis / Mathis', largeur + ' px : Mathis — sa ligne même les semaines où il n\'a rien');

    await choisir(page, '.f-pour', '');
    e = await etatApercu(page);
    verifier(!e.individuel && e.titrePersonne === '' && e.lignes[0] === 'Équipe A+Lionel+Mathis' && /Personnel/.test(e.personnes),
      largeur + ' px : « Tout le monde » — retour à l\'aperçu complet');

    if (largeur === 360) {
      const deb = await page.evaluate(() => { const b = document.querySelector('.impr-periode'); return b.scrollWidth > b.clientWidth + 1; });
      verifier(!deb, '360 px : choix Période / Pour sans débordement');
    }
    // Réouverture : repart de la semaine affichée, pour tout le monde.
    await page.evaluate(() => { popFermerActuel(); openPrintSheet(); }); await page.waitForTimeout(200);
    e = await etatApercu(page);
    verifier(e.coins.join() === 'Semaine 39' && !e.individuel, largeur + ' px : à la réouverture, période et personne ne sont pas retenues');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
