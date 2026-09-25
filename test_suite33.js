const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 33) — Lionel : « J'aimerai pouvoir gérer mon
// personnel par équipe sur de plus grands chantiers. Plusieurs personnes
// auront les mêmes tâches sur toute la semaine. » Ses choix : une ligne
// d'équipe dans le planning, une composition par semaine, une ligne par
// équipe à l'impression (cf. js/equipes.js, sql/0015_equipes.sql).
//
// Semaine de test : 39 (lundi 21.09.2026, date figée jeudi 24).
//
// Lancer : node test_suite33.js

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, ordre, actif: true }, x || {});
const PERSONNES = [
  P(1, 'Lionel', 1), P(2, 'Marc', 2), P(3, 'Luc', 3), P(4, 'Paul', 4), P(5, 'Pierre', 5), P(6, 'Jean', 6),
  P(10, 'Équipe A', 7, { equipe: true }), P(11, 'Équipe B', 8, { equipe: true }),
  P(20, 'Électricien', 9, { sous_traitant: true })
];
const COMPOS = [
  { id: 1, equipe_id: 10, lundi: '2026-09-14', membres: [2, 3, 4] }, // A : Marc, Luc, Paul depuis la semaine 38
  { id: 2, equipe_id: 11, lundi: '2026-09-21', membres: [6] }          // B : Jean depuis la 39
];
const TACHES = [
  { id: 1, personne_id: 10, date: '2026-09-21', demi: 'matin', ordre: 0, texte: 'Coffrage dalle N2', chantier_id: 1 },
  { id: 2, personne_id: 10, date: '2026-09-21', demi: 'aprem', ordre: 0, texte: 'Coffrage dalle N2', chantier_id: 1 },
  { id: 3, personne_id: 3, date: '2026-09-22', demi: 'matin', ordre: 0, texte: 'Congé', est_absence: true },
  { id: 4, personne_id: 1, date: '2026-09-23', demi: 'matin', ordre: 0, texte: 'Bureau', chantier_id: 1 }
];
const BD = { personnes: PERSONNES, equipes_compositions: COMPOS, taches: TACHES };

const etiquettes = (page) => page.evaluate(() => [...document.querySelectorAll('.lbl.lbl-compacte')].map((l) => (l.classList.contains('lbl-equipe') ? 'E:' : l.classList.contains('lbl-membre') ? 'M:' : '') + l.querySelector('b').textContent));

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Calcul des compositions (fonction pure) ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD });
    const r = await page.evaluate(() => {
      const c = (e, l, m) => ({ equipeId: String(e), lundi: l, membres: m.map(String) });
      const txt = (plan) => plan.lignes.map((l) => l.equipeId + '@' + l.lundi.slice(5) + '=' + l.membres.join('+')).sort().join(' ');
      const base = [c(10, '2026-09-14', [2, 3, 4]), c(11, '2026-09-21', [6])];
      return {
        suivantes: txt(planCompositionEquipe(base, 10, '2026-09-21', ['2', '3'], 'suivantes')),
        semaine: txt(planCompositionEquipe(base, 10, '2026-09-21', ['2', '3'], 'semaine')),
        deplacerSemaine: planCompositionEquipe(base, 11, '2026-09-21', ['6', '4'], 'semaine'),
        deplacerSuivantes: txt(planCompositionEquipe(base.concat([c(10, '2026-10-05', [2, 3, 4, 5])]), 11, '2026-09-21', ['6', '5'], 'suivantes')),
        effaceFutur: txt(planCompositionEquipe(base.concat([c(10, '2026-10-05', [2])]), 10, '2026-09-21', ['2', '3', '4', '5'], 'suivantes')),
        identique: txt(planCompositionEquipe(base, 10, '2026-09-21', ['2', '3', '4'], 'semaine')),
        vide: txt(planCompositionEquipe([], 10, '2026-09-21', ['2'], 'semaine'))
      };
    });
    verifier(r.suivantes === '10@09-14=2+3+4 10@09-21=2+3', '« et les suivantes » : A = Marc+Luc à partir de la 39, la 38 inchangée (' + r.suivantes + ')');
    verifier(r.semaine === '10@09-14=2+3+4 10@09-21=2+3 10@09-28=2+3+4', '« cette semaine » : la 40 reprend Marc+Luc+Paul (' + r.semaine + ')');
    const dep = r.deplacerSemaine.lignes.map((l) => l.equipeId + '@' + l.lundi.slice(5) + '=' + l.membres.join('+')).sort().join(' ');
    verifier(r.deplacerSemaine.equipes.sort().join(',') === '10,11' && dep === '10@09-14=2+3+4 10@09-21=2+3 10@09-28=2+3+4 11@09-21=6+4 11@09-28=6',
      'Paul passe de A à B pour la seule semaine 39 : retiré de A cette semaine-là, revenu dans A en 40 (' + dep + ')');
    // L'instantané du 05.10 de A, une fois Pierre retiré, redevient
    // identique au précédent (Marc+Luc+Paul) : il est retiré.
    verifier(r.deplacerSuivantes === '10@09-14=2+3+4 11@09-21=6+5', '« et les suivantes » : Pierre rejoint B, retiré du futur instantané de A (devenu inutile) (' + r.deplacerSuivantes + ')');
    verifier(r.effaceFutur === '10@09-14=2+3+4 10@09-21=2+3+4+5', '« et les suivantes » efface les changements futurs de l\'équipe (' + r.effaceFutur + ')');
    verifier(r.identique === '10@09-14=2+3+4', 'même composition qu\'avant : aucun instantané en plus (' + r.identique + ')');
    verifier(r.vide === '10@09-21=2 10@09-28=', 'équipe sans composition, « cette semaine » : Marc en 39, équipe vide de nouveau en 40 (' + r.vide + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. Planning : ligne d'équipe, membres repliés, ordre ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD });
    let e = await etiquettes(page);
    verifier(e.join(' | ') === 'E:Équipe A | M:Luc | E:Équipe B | Lionel | Pierre | Électricien',
      'repliées : chaque équipe en tête, seul Luc (absent mardi) visible sous A, Marc/Paul/Jean cachés (' + e.join(' | ') + ')');
    const lbl = await page.evaluate(() => {
      const l = document.querySelector('.lbl-equipe[data-equipe="10"]');
      return { membres: l.querySelector('.equipe-membres').textContent, repli: l.querySelector('.equipe-repli').textContent, titre: l.title };
    });
    verifier(lbl.membres === 'Marc, Luc, Paul' && lbl.repli === '▸', 'étiquette : « Équipe A », membres « Marc, Luc, Paul », ▸ (' + JSON.stringify(lbl) + ')');
    const bulle = await page.evaluate(() => [...document.querySelectorAll('.bulle')].some((b) => b.textContent.includes('Coffrage dalle N2')));
    verifier(bulle, 'la tâche de l\'équipe s\'affiche sur sa ligne');
    const ordreLignes = await page.evaluate(() => personnesSecteurListe('personnel').join(','));
    verifier(ordreLignes === '10,3,11,1,5', 'sélection au glissé : même ordre que l\'écran (' + ordreLignes + ')');

    await page.click('.lbl-equipe[data-equipe="10"] .equipe-repli');
    await page.waitForTimeout(150);
    e = await etiquettes(page);
    verifier(e.join(' | ') === 'E:Équipe A | M:Marc | M:Luc | M:Paul | E:Équipe B | Lionel | Pierre | Électricien', '▸ déplie A : ses 3 membres dessous, B reste repliée (' + e.join(' | ') + ')');
    const memo = await page.evaluate(() => localStorage.getItem('planning.equipesDepliees'));
    verifier(memo === '{"10":true}', 'dépliage retenu sur l\'appareil (' + memo + ')');

    // Menu d'une case de l'équipe : pas d'absence.
    const boite = await page.evaluate(() => { const gi = giDepuisIso('2026-09-24'); const r = document.querySelector('.cell[data-kind="personne"][data-jour="' + gi + '"][data-personne="10"][data-demi="matin"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.click(boite.x, boite.y);
    await page.waitForTimeout(300);
    const menu = await page.evaluate(() => { const p = document.querySelector('.pop'); return p ? [...p.querySelectorAll('button')].map((b) => b.textContent) : null; });
    verifier(menu && menu.includes('Tâche') && !menu.includes('Absence') && !menu.includes('Congé'), 'case d\'équipe : « Tâche » proposée, jamais « Absence »/« Congé » (' + JSON.stringify(menu) + ')');
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 895);
    await page.waitForTimeout(150);

    // --- 3. Composition : « cette semaine » ---
    await page.evaluate(() => document.querySelector('.lbl-equipe[data-equipe="10"] b').click());
    await page.waitForTimeout(150);
    const pop = await page.evaluate(() => {
      const p = document.querySelector('.composition-equipe');
      return p && { titre: p.querySelector('.cp-titre').textContent, lignes: [...p.querySelectorAll('.composition-membre')].map((l) => (l.querySelector('input').checked ? '✓' : '·') + l.textContent) };
    });
    verifier(pop && pop.titre === 'Équipe A — semaine 39', 'clic sur l\'équipe : fenêtre « Équipe A — semaine 39 » (' + (pop && pop.titre) + ')');
    verifier(pop && pop.lignes.join(' ') === '·Lionel ✓Marc ✓Luc ✓Paul ·Pierre ·JeanÉquipe B', 'personnel proposé, membres cochés, Jean signalé dans l\'équipe B, ni équipes ni intervenants (' + (pop && pop.lignes.join(' ')) + ')');
    await page.evaluate(() => {
      const coche = (id, v) => { const i = document.querySelector('.composition-equipe input[value="' + id + '"]'); i.checked = v; };
      coche(4, false); coche(6, true); // Paul sort, Jean vient de B
    });
    await page.click('.composition-equipe .f-semaine');
    await page.waitForTimeout(300);
    const apres = await page.evaluate(() => ({
      rpc: window.__ECRITURES.filter((x) => x.startsWith('rpc:remplacer_compositions_equipes')).length,
      bd: window.__BD.equipes_compositions.map((c) => c.equipe_id + '@' + c.lundi.slice(5) + '=' + c.membres.join('+')).sort().join(' '),
      toast: document.getElementById('toast').textContent
    }));
    verifier(apres.rpc === 1 && apres.bd === '10@09-14=2+3+4 10@09-21=2+3+6 10@09-28=2+3+4 11@09-28=6',
      'une seule écriture atomique : A = Marc+Luc+Jean en 39 seulement, B vide en 39 et retrouve Jean en 40 (' + apres.bd + ')');
    verifier(/semaine 39/.test(apres.toast), 'message « Équipe modifiée pour la semaine 39 » (' + apres.toast + ')');
    e = await etiquettes(page);
    verifier(e.join(' | ') === 'E:Équipe A | M:Marc | M:Luc | M:Jean | E:Équipe B | Lionel | Paul | Pierre | Électricien', 'grille mise à jour : Jean sous A, Paul redevient seul (' + e.join(' | ') + ')');
    const nomsB = await page.evaluate(() => document.querySelector('.lbl-equipe[data-equipe="11"] .equipe-membres').textContent);
    verifier(nomsB === 'Aucun membre', 'équipe B vide cette semaine : « Aucun membre » (' + nomsB + ')');

    // Semaine suivante : l'ancienne composition revient.
    await page.evaluate(() => naviguerSemaine(1));
    await page.waitForTimeout(400);
    const s40 = await page.evaluate(() => ({ a: document.querySelector('.lbl-equipe[data-equipe="10"] .equipe-membres').textContent, b: document.querySelector('.lbl-equipe[data-equipe="11"] .equipe-membres').textContent }));
    verifier(s40.a === 'Marc, Luc, Paul' && s40.b === 'Jean', 'semaine 40 : A = Marc, Luc, Paul ; B = Jean (' + JSON.stringify(s40) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Impression : une ligne par équipe ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD });
    await page.evaluate(() => openPrintSheet());
    await page.waitForTimeout(200);
    const impr = await page.evaluate(() => [...document.querySelectorAll('.print-table tbody tr:not(.print-spacer)')].map((tr) => {
      const td = tr.querySelector('td');
      return (td.classList.contains('print-nom-equipe') ? 'E:' : td.classList.contains('print-nom-membre') ? 'M:' : '') + td.textContent;
    }).filter((x) => x && !/^(Jalons|Notes)$/.test(x)));
    verifier(impr.join(' | ') === 'E:Équipe AMarc, Luc, Paul | M:Luc | Lionel', 'impression : « Équipe A » + ses membres, Luc (absent) décalé dessous, équipe B et personnes sans rien sautées (' + impr.join(' | ') + ')');
    const taches = await page.evaluate(() => document.querySelector('.print-table tbody tr td.print-nom-equipe').parentElement.textContent);
    verifier(taches.includes('Coffrage dalle N2'), 'la ligne d\'équipe imprime la tâche de l\'équipe');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 5. Page Personnel : liste des équipes, création ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD });
    await page.evaluate(() => document.querySelector('.onglet[data-page="personnel"]').click());
    await page.waitForTimeout(300);
    const listes = await page.evaluate(() => ({
      equipes: [...document.querySelectorAll('#listeEquipes .ligne-intervenant b')].map((b) => b.textContent),
      personnes: [...document.querySelectorAll('#listePersonnel .ligne-intervenant b')].map((b) => b.textContent),
      bouton: (document.querySelector('#listeEquipes .ligne-ajouter') || {}).textContent
    }));
    verifier(listes.equipes.join(',') === 'Équipe A,Équipe B' && listes.bouton === '+ Nouvelle équipe', 'page Personnel : liste « Équipes » avec « + Nouvelle équipe » (' + JSON.stringify(listes) + ')');
    verifier(listes.personnes.join(',') === 'Lionel,Marc,Luc,Paul,Pierre,Jean', 'les équipes ne sont pas dans la liste des personnes (' + listes.personnes.join(',') + ')');
    await page.click('#listeEquipes .ligne-ajouter');
    await page.fill('.form-pop .f-nom', 'Équipe C');
    await page.click('.form-pop .f-ok');
    await page.waitForTimeout(500);
    const cree = await page.evaluate(() => { const r = window.__BD.personnes.find((p) => p.nom === 'Équipe C'); return r && { equipe: r.equipe, st: r.sous_traitant }; });
    verifier(cree && cree.equipe === true && cree.st === false, 'nouvelle équipe enregistrée avec equipe = true (' + JSON.stringify(cree) + ')');
    const apres = await page.evaluate(() => [...document.querySelectorAll('#listeEquipes .ligne-intervenant b')].map((b) => b.textContent).join(','));
    verifier(apres === 'Équipe A,Équipe B,Équipe C', 'elle apparaît dans la liste des équipes (' + apres + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 6. Téléphone : la ligne d'équipe tient dans la colonne des noms ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, bd: BD });
    const m = await page.evaluate(() => {
      const l = document.querySelector('.lbl-equipe[data-equipe="10"]');
      return l && { larg: l.getBoundingClientRect().width, deborde: l.scrollWidth > l.clientWidth + 1 };
    });
    verifier(m && !m.deborde, 'téléphone : étiquette d\'équipe sans débordement (' + JSON.stringify(m) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan());
})();
