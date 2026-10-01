const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 01.10.2026 (suite 134).
// Retour 7 — Lionel : « raccourcis mode sélection » → touche « M » (modifiable)
// qui passe du mode ajout au mode sélection et inversement.
// Retour 8 — « Affichée note importante comme passée dès que l'horaire de la
// tâche est dépassé. » → retirée de la cloche à la fin de sa demi-journée.
// Retour 9 — « Machine et transports doivent avoir leurs propre onglet. […]
// Transport ne sera q'une ligne comme note et jalons. […] On déplace les
// ajouts rapides de chaques type dans leurs onglets correspondant 2 onglet en
// haut des pages […] Ajouter une coche pour masquer une ligne
// personnel/intervenant et machine sans les désactiver. »
// Retour 10 — « Pouvoir masquer et choisir les couleurs de séparation de
// machine et transport ».
// Vérifie :
//   1. planning : ligne Transports seule, en haut sous les notes, sans titre
//      de section ; ligne masquée (Anne) absente ;
//   2. boutons camion / pelle de la barre : masquent Transports / Machines ;
//   3. couleurs : réglages sur les pages Machines / Transports, appliqués ;
//   4. onglets Machines / Transports, plus d'« Entrée rapide » ; 2
//      sous-onglets par page, entrées rapides filtrées par type, choix
//      « Assigné à » du type, pas d'absence pour Transports ;
//   5. menu « Ajouter » : chaque ligne n'a que les entrées de son type ;
//   6. coche « Afficher » : masque / réaffiche sans désactiver ;
//   7. impression : Transports en tête, lignes masquées absentes ;
//   8. touche « M » ;
//   9. cloche : importants retirés une fois leur horaire passé ;
//  10. aucune erreur JS.
//
// Lancer : node test_suite134.js

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, groupe_id: null, ordre, actif: true, masque: false }, x || {});
const T = (id, personne_id, date, demi, texte, x) => Object.assign({ id, personne_id, date, demi, ordre: 0, texte, chantier_id: 1 }, x || {});
const F = (id, nom, assigne_a, type_entree) => ({ id, nom, ordre: id, assigne_a, type_entree: type_entree || 'tache' });
const BD = () => ({
  personnes: [P(1, 'Paul', 1), P(2, 'Anne', 2, { masque: true }), P(3, 'Béton SA', 3, { sous_traitant: true }), P(20, 'Pelle', 4, { groupe_id: 1 }), P(21, 'Transports', 5, { groupe_id: 2 })],
  groupes: [{ id: 1, nom: 'Machines', ordre: 1, actif: true, ligne_unique: false }, { id: 2, nom: 'Transports', ordre: 2, actif: true, ligne_unique: true }],
  taches: [T(1, 1, '2026-09-22', 'matin', 'Coffrage'), T(2, 2, '2026-09-22', 'matin', 'Chape'), T(3, 3, '2026-09-22', 'matin', 'Dalle'),
    T(4, 20, '2026-09-22', 'matin', 'Terrassement'), T(5, 21, '2026-09-23', 'matin', 'Livraison gravier'),
    T(6, 1, '2026-09-24', 'matin', 'Réception', { important: true }), T(7, 3, '2026-09-24', 'aprem', 'Contrôle', { important: true }),
    T(8, 1, '2026-09-25', 'matin', 'Visite', { important: true })],
  formulaires_rapides: [F(1, 'Béton', '@personnel'), F(2, 'Plein', '@machines'), F(3, 'Benne', '@transports'), F(4, 'Câblage', '3'), F(5, 'Commun', '')],
  formulaires_rapides_champs: [],
  horaires: [{ id: 1, date_debut: '2026-09-01', date_fin: '2026-12-31', matin_debut: '07:00:00', matin_fin: '12:00:00', aprem_debut: '13:00:00', aprem_fin: '17:00:00', pause_matin: 15 }]
});

const lignes = (page) => page.evaluate(() => [...document.querySelectorAll('#racine .grille > .lbl[data-ligne^="p"]')].map((l) => l.dataset.ligne).join(','));
const corps = (page) => page.evaluate(() => [...document.querySelectorAll('#racine .grille > .lbl[data-ligne], #racine .grille > .section-row[data-section]')]
  .map((e) => e.dataset.section ? '§' + e.dataset.section : e.dataset.ligne).join(' '));
async function allerPage(page, nom) {
  await page.evaluate((n) => document.querySelector('.onglets-liste .onglet[data-page="' + n + '"]').click(), nom);
  await page.waitForTimeout(400);
}
async function sousOnglet(page, type, sous) {
  await page.evaluate((a) => document.querySelector('#page-' + a[0] + ' .sous-onglet[data-sous="' + a[1] + '"]').click(), [type, sous]);
  await page.waitForTimeout(300);
}
const cartes = (page) => page.evaluate(() => [...document.querySelectorAll('.page.actif #listeFormulaires .carte-form')].map((c) => c.dataset.nom).join(','));

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    await page.waitForTimeout(300);

    // --- 1. Planning --------------------------------------------------------
    const c = await corps(page);
    verifier(/^(n\S* )*p21 §personnel p1 §intervenants p3 §groupe-1 p20$/.test(c.replace(/^.*?(?=p21)/, '')) && !/§groupe-2/.test(c) && c.indexOf('p21') < c.indexOf('§personnel'),
      'ligne Transports seule, au-dessus des sections, sans titre ; Anne (masquée) absente (' + c + ')');
    const t = await page.evaluate(() => {
      const l = document.querySelector('#racine .grille > .lbl[data-ligne="p21"]');
      const notes = document.querySelector('#racine .grille > .lbl-notes, #racine .grille > [data-ligne="notes"]');
      return { classe: l.classList.contains('lbl-transports'), apresNotes: !notes || !!(notes.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    verifier(t.classe && t.apresNotes, 'ligne Transports sous les notes, avec sa classe de couleur ' + JSON.stringify(t));

    // --- 2. Boutons de la barre ---------------------------------------------
    const bascule = (cible) => page.evaluate((c) => document.querySelector('#controlesAffichage .toolbar-toggle[data-affichage-cible="' + c + '"]').click(), cible);
    await bascule('transports'); await page.waitForTimeout(250);
    const sansT = await lignes(page);
    await bascule('transports'); await bascule('machines'); await page.waitForTimeout(250);
    const sansM = await corps(page);
    await bascule('machines'); await page.waitForTimeout(250);
    const retour = await lignes(page);
    verifier(sansT === 'p1,p3,p20' && !/p20|groupe-1/.test(sansM) && retour === 'p21,p1,p3,p20',
      'camion : masque Transports ; pelle : masque Machines (' + sansT + ' | ' + sansM + ' | ' + retour + ')');

    // --- 3. Couleurs ----------------------------------------------------------
    await allerPage(page, 'machines');
    const regM = await page.evaluate(() => !!document.querySelector('#page-machines .reglage-couleur-compacte[data-groupe="section-machines"]'));
    await allerPage(page, 'transports');
    const regT = await page.evaluate(() => !!document.querySelector('#page-transports .reglage-couleur-compacte[data-groupe="ligne-transports"]'));
    await allerPage(page, 'planning');
    const fonds = await page.evaluate(() => {
      document.documentElement.style.setProperty('--section-machines-bg', 'rgb(1, 2, 3)');
      document.documentElement.style.setProperty('--transports-bg', 'rgb(4, 5, 6)');
      const r = { m: getComputedStyle(document.querySelector('#racine .section-row[data-section="groupe-1"]')).backgroundColor,
        t: getComputedStyle(document.querySelector('#racine .grille > .lbl[data-ligne="p21"]')).backgroundColor };
      document.documentElement.style.removeProperty('--section-machines-bg');
      document.documentElement.style.removeProperty('--transports-bg');
      return r;
    });
    verifier(regM && regT && fonds.m === 'rgb(1, 2, 3)' && fonds.t === 'rgb(4, 5, 6)',
      'couleurs de la séparation Machines et de la ligne Transports : réglables sur leur page, appliquées ' + JSON.stringify({ regM, regT, fonds }));

    // --- 4. Onglets, sous-onglets, entrées rapides ------------------------------
    const onglets = await page.evaluate(() => [...document.querySelectorAll('#ongletsNav .onglets-liste:not(.onglets-reglages) .onglet')].map((o) => o.dataset.page).join(','));
    const bas = await page.evaluate(() => [...document.querySelectorAll('#switcherPanneau .switcher-groupe-pages .onglet')].map((o) => o.dataset.page).join(','));
    verifier(onglets === 'planning,jalons,notes,personnel,intervenants,machines,transports,chantiers,statuts,horaires' && bas === onglets,
      'onglets Machines et Transports après Intervenants, plus d’« Entrée rapide » (haut et bas) (' + onglets + ')');
    const listes = {};
    for (const type of ['personnel', 'intervenants', 'machines', 'transports']) {
      await allerPage(page, type);
      const sous = await page.evaluate((ty) => [...document.querySelectorAll('#page-' + ty + ' .sous-onglet')].map((b) => b.textContent.trim() + (b.classList.contains('actif') ? '*' : '')).join('|'), type);
      await sousOnglet(page, type, 'rapides');
      listes[type] = { sous, cartes: await cartes(page) };
      await page.evaluate(() => document.querySelector('.page.actif #listeFormulaires .ligne-ajouter').click());
      await page.waitForTimeout(200);
      listes[type].assigne = await page.evaluate(() => { const s = document.querySelector('.page.actif .nf-assigne'); return s.value + ':' + [...s.options].map((o) => o.value).join('/'); });
      listes[type].absence = await page.evaluate(() => !document.querySelector('.page.actif .nf-type option[value="absence"]').hidden);
      await page.evaluate(() => document.querySelector('.page.actif .nf-annuler').click());
      await sousOnglet(page, type, 'lignes');
    }
    verifier(listes.personnel.sous === 'Personnes*|Entrées rapides' && listes.machines.sous === 'Machines*|Entrées rapides',
      '2 sous-onglets en haut des pages : les lignes (ouvert), les entrées rapides ' + JSON.stringify([listes.personnel.sous, listes.machines.sous]));
    verifier(listes.personnel.cartes === 'Béton,Commun' && listes.intervenants.cartes === 'Câblage,Commun' && listes.machines.cartes === 'Plein' && listes.transports.cartes === 'Benne',
      'entrées rapides de chaque type sur sa page ' + JSON.stringify([listes.personnel.cartes, listes.intervenants.cartes, listes.machines.cartes, listes.transports.cartes]));
    verifier(listes.personnel.assigne === '@personnel:/@personnel' && listes.intervenants.assigne === '@intervenants:/@intervenants/3' &&
      listes.machines.assigne === '@machines:@machines/20' && listes.transports.assigne === '@transports:@transports',
      '« Assigné à » : choix du type de la page, toute la catégorie par défaut ' + JSON.stringify([listes.personnel.assigne, listes.intervenants.assigne, listes.machines.assigne, listes.transports.assigne]));
    verifier(listes.personnel.absence && listes.machines.absence && !listes.transports.absence, 'type « Absence » proposé partout sauf pour Transports');
    const personnelSous = await page.evaluate(() => document.querySelectorAll('#page-personnel .page-sous').length);
    verifier(personnelSous === 2, 'page Personnel : toujours 2 descriptions (' + personnelSous + ')');

    // --- 5. Menu « Ajouter » ------------------------------------------------------
    await allerPage(page, 'planning');
    const menus = await page.evaluate(() => {
      const noms = (id) => { const d = document.createElement('div'); d.innerHTML = boutonsMenuAjout(id); return [...d.querySelectorAll('button')].map((b) => b.textContent).join(','); };
      return { paul: noms('1'), beton: noms('3'), pelle: noms('20'), transports: noms('21') };
    });
    verifier(/Béton/.test(menus.paul) && /Commun/.test(menus.paul) && !/Plein|Benne|Câblage/.test(menus.paul) &&
      /Câblage/.test(menus.beton) && /Commun/.test(menus.beton) && !/Béton,|Plein|Benne/.test(menus.beton) &&
      /Plein/.test(menus.pelle) && !/Commun|Béton|Benne/.test(menus.pelle) &&
      /Benne/.test(menus.transports) && !/Commun|Béton|Plein|Absence|Arrivée/.test(menus.transports),
      'menu « Ajouter » : chaque ligne n’a que les entrées de son type, pas d’absence sur Transports ' + JSON.stringify(menus));

    // --- 6. Coche « Afficher » ------------------------------------------------------
    await allerPage(page, 'personnel');
    const coches = await page.evaluate(() => [...document.querySelectorAll('#listePersonnel .ligne-intervenant')].map((l) => l.querySelector('b').textContent + (l.querySelector('.chk-afficher').checked ? '✓' : '')).join(','));
    await page.evaluate(() => { const c = document.querySelector('#listePersonnel .ligne-intervenant[data-id="2"] .chk-afficher'); c.click(); });
    await page.waitForTimeout(700);
    await page.evaluate(() => { const c = document.querySelector('#listePersonnel .ligne-intervenant[data-id="1"] .chk-afficher'); c.click(); });
    await page.waitForTimeout(700);
    const bd = await page.evaluate(() => window.__BD.personnes.filter((p) => p.id === 1 || p.id === 2).map((p) => p.nom + ':' + p.masque + ':' + p.actif).join(','));
    await allerPage(page, 'machines');
    const cocheMachine = await page.evaluate(() => !!document.querySelector('#listeGroupe-1 .ligne-intervenant[data-id="20"] .chk-afficher'));
    await allerPage(page, 'planning');
    const apresCoche = await lignes(page);
    verifier(coches === 'Paul✓,Anne' && /Paul:true:true/.test(bd) && /Anne:false:true/.test(bd) && apresCoche === 'p21,p2,p3,p20' && cocheMachine,
      'coche « Afficher » (personnel, machines) : Anne réaffichée, Paul masqué, tous deux restent actifs (' + coches + ' ; ' + bd + ' ; ' + apresCoche + ')');

    // --- 7. Impression ------------------------------------------------------------
    await page.evaluate(() => openPrintSheet());
    await page.waitForTimeout(400);
    const impr = await page.evaluate(() => ({
      lignes: [...document.querySelectorAll('.print-doc tbody > tr:not([class])')].map((r) => r.querySelector('td').childNodes[0].textContent).join('+'),
      cases: [...document.querySelectorAll('.impr-groupe-tete input[data-r]')].map((i) => i.dataset.r + (i.checked ? '✓' : '')).join(' '),
      pour: [...document.querySelectorAll('.f-pour optgroup')].map((g) => g.label + ':' + [...g.querySelectorAll('option')].map((o) => o.textContent.trim()).join('/')).join(' ')
    }));
    verifier(impr.lignes === 'Transports+Anne+Béton SA+Pelle' && impr.cases === 'transports✓ personnel✓ intervenants✓ groupe-1✓' &&
      impr.pour === 'Transports:Transports Personnel:Anne Intervenants:Béton SA Machines:Pelle',
      'impression : Transports en tête, Paul (masqué) ni imprimé ni proposé ' + JSON.stringify(impr));
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const f = document.querySelector('.print-sheet .f-fermer, .print-sheet .f-annuler'); if (f) f.click(); });
    await page.waitForTimeout(300);

    // --- 8. Touche « M » ----------------------------------------------------------
    const m0 = await page.evaluate(() => modeAjoutPlanning);
    await page.keyboard.press('m'); await page.waitForTimeout(150);
    const m1 = await page.evaluate(() => modeAjoutPlanning);
    await page.keyboard.press('m'); await page.waitForTimeout(150);
    const m2 = await page.evaluate(() => modeAjoutPlanning);
    const listee = await page.evaluate(() => ACTIONS_CLAVIER.some((a) => a.id === 'modeAjout' && a.defaut.join() === 'M') && !ACTIONS_CLAVIER.some((a) => a.id === 'pageEntreeRapide'));
    verifier(m0 === false && m1 === true && m2 === false && listee, 'touche « M » : mode ajout ↔ mode sélection, listée dans les raccourcis (' + [m0, m1, m2, listee] + ')');

    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 9. Cloche : importants passés retirés ----------------------------------------
  const cloche = {};
  for (const heure of ['10:00', '12:30', '17:30']) {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD(), date: '2026-09-24T' + heure + ':00' });
    await page.waitForTimeout(2200);
    await page.evaluate(() => document.getElementById('btnNotifications').click());
    await page.waitForTimeout(300);
    cloche[heure] = await page.evaluate(() => nbNotifications_().importants + ':' + [...document.querySelectorAll('.notif-importants .imp-ligne .ar-quoi')].map((x) => x.textContent).join('/'));
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  verifier(cloche['10:00'] === '3:Réception/Contrôle/Visite' && cloche['12:30'] === '2:Contrôle/Visite' && cloche['17:30'] === '1:Visite',
    'cloche : un important quitte la liste à la fin de sa demi-journée (horaires 7-12 / 13-17) ' + JSON.stringify(cloche));

  // --- 10. Erreurs JS ---------------------------------------------------------------
  verifier(!toutesErreurs.length, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
