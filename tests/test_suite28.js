const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 28) — Lionel : « Possibilité de copier les
// horaires d'une année à l'autre pour éviter de tout rentrer. »
//
// Données : les 19 périodes de la feuille PMB « Horaire de travail 2026 »
// (telles qu'insérées en production), les fériés 2026 du 1er mai et du
// lundi de Pâques. Copie vers 2027 : mêmes dates au calendrier, coupures de
// week-end/férié refermées, vacances gardées, jours seuls surlignés.
//
// Lancer : node test_suite28.js

const P2026 = [
  ['2026-01-12', '2026-01-30', '07:45', '12:00', '13:00', '16:30'],
  ['2026-02-02', '2026-02-13', '07:45', '12:00', '13:00', '16:30'],
  ['2026-02-16', '2026-02-27', '07:30', '12:00', '13:00', '16:45'],
  ['2026-03-02', '2026-03-31', '07:00', '12:00', '13:00', '17:00'],
  ['2026-04-01', '2026-04-24', '07:00', '12:00', '13:00', '17:00'],
  ['2026-04-27', '2026-04-30', '07:00', '12:00', '13:00', '17:15'],
  ['2026-05-04', '2026-05-29', '07:00', '12:00', '13:00', '17:15'],
  ['2026-06-01', '2026-06-30', '07:00', '12:00', '13:00', '17:15'],
  ['2026-07-01', '2026-07-16', '07:00', '12:00', '13:00', '17:15'],
  ['2026-07-17', '2026-07-17', '07:00', '10:15', null, null],
  ['2026-08-10', '2026-08-31', '07:00', '12:00', '13:00', '17:15'],
  ['2026-09-01', '2026-09-25', '07:00', '12:00', '13:00', '17:15'],
  ['2026-09-28', '2026-09-30', '07:30', '12:00', '13:00', '17:00'],
  ['2026-10-01', '2026-10-23', '07:30', '12:00', '13:00', '17:00'],
  ['2026-10-26', '2026-10-30', '07:30', '12:00', '13:00', '16:45'],
  ['2026-11-02', '2026-11-13', '07:30', '12:00', '13:00', '16:45'],
  ['2026-11-17', '2026-11-30', '07:45', '12:00', '13:00', '16:45'],
  ['2026-12-01', '2026-12-17', '07:45', '12:00', '13:00', '16:45'],
  ['2026-12-18', '2026-12-18', '07:45', '11:00', null, null]
];
const ligne = (id, [du, au, md, mf, ad, af]) => ({ id, date_debut: du, date_fin: au, matin_debut: md + ':00', matin_fin: mf + ':00', aprem_debut: ad ? ad + ':00' : null, aprem_fin: af ? af + ':00' : null, pause_matin: 15 });
const HORAIRES = P2026.map((p, i) => ligne(i + 1, p));
const FERIES = [
  { date: '2026-05-01', libelle: '1er mai', categorie: 'ferie' },
  { date: '2026-04-06', libelle: 'Lundi de Pâques', categorie: 'ferie' },
  { date: '2026-07-20', libelle: 'Vacances', categorie: 'vacances_entreprise' }
];

const allerA = (page, nom) => page.evaluate((nom) => document.querySelector('.onglet[data-page="' + nom + '"]').click(), nom).then(() => page.waitForTimeout(250));
const toastTexte = (page) => page.evaluate(() => document.getElementById('toast').textContent);
const lignes = (page) => page.evaluate(() => [...document.querySelectorAll('#horairesListe .horaire-ligne')].map((l) => {
  const v = (c) => l.querySelector('[data-champ="' + c + '"]').value;
  return { txt: v('du') + '→' + v('au'), h: v('matinDebut') + '-' + v('matinFin') + ' ' + (v('apremDebut') ? v('apremDebut') + '-' + v('apremFin') : '·') + ' p' + v('pause'), verif: l.classList.contains('a-verifier') };
}));

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Bureau : 2027 vide, copie depuis 2026 ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: { horaires: HORAIRES, feries: FERIES } });
    await allerA(page, 'horaires');
    verifier(await page.evaluate(() => document.getElementById('btnCopierHoraires').textContent) === 'Copier depuis 2025', 'bouton « Copier depuis 2025 » sur l\'année 2026');
    await page.click('#horaireAnneeSuiv');
    verifier(await page.evaluate(() => document.getElementById('btnCopierHoraires').textContent) === 'Copier depuis 2026', 'année 2027 : le bouton devient « Copier depuis 2026 »');
    verifier((await lignes(page)).length === 0, '2027 est vide au départ');
    const ecrituresAvant = await page.evaluate(() => window.__ECRITURES.length);
    await page.click('#btnCopierHoraires');
    await page.waitForTimeout(150);
    verifier(await page.evaluate(() => !document.querySelector('.confirm-pop')), '2027 vide : copie sans demander de confirmation');
    const l = await lignes(page);
    const dates = l.map((x) => x.txt);
    verifier(l.length === 19, '19 périodes copiées (' + l.length + ')');
    verifier(dates[0] === '2027-01-12→2027-01-30', 'janvier : mêmes dates au calendrier (' + dates[0] + ')');
    verifier(dates[1] === '2027-02-01→2027-02-13', 'février : la coupure de week-end (sam. 31 - dim. 1er en 2026) est refermée, départ lundi 1er février 2027 (' + dates[1] + ')');
    verifier(dates[2] === '2027-02-15→2027-02-27', '2e quinzaine de février : départ lundi 15 (le 16 serait un mardi) (' + dates[2] + ')');
    verifier(dates[3] === '2027-03-01→2027-03-31', 'mars : départ lundi 1er mars 2027 et non le mardi 2 (' + dates[3] + ')');
    verifier(dates[5] === '2027-04-26→2027-04-30', 'fin avril : départ lundi 26 (après le samedi 24) (' + dates[5] + ')');
    verifier(dates[6] === '2027-05-03→2027-05-29', 'mai : la coupure du 1er mai (férié, vendredi en 2026) est refermée → lundi 3 mai 2027 (' + dates[6] + ')');
    verifier(dates[10] === '2027-08-10→2027-08-31', 'vacances d\'été (catégorie « Vacances entreprise ») : la coupure reste aux mêmes dates (' + dates[10] + ')');
    verifier(dates[16] === '2027-11-17→2027-11-30', 'novembre : coupure du lundi 16 (jour ouvré) gardée (' + dates[16] + ')');
    verifier(l[3].h === '07:00-12:00 13:00-17:00 p15' && l[9].h === '07:00-10:15 · p15', 'horaires et pause recopiés, matin seul compris (' + l[3].h + ' / ' + l[9].h + ')');
    const aVerifier = l.filter((x) => x.verif).map((x) => x.txt);
    verifier(aVerifier.length === 2 && aVerifier[0] === '2027-07-17→2027-07-17' && aVerifier[1] === '2027-12-18→2027-12-18', 'jours seuls (17 juillet, 18 décembre : samedis en 2027) surlignés à vérifier (' + aVerifier.join(', ') + ')');
    verifier(/19 périodes copiées depuis 2026\. 2 à vérifier/.test(await toastTexte(page)), 'message : « 19 périodes copiées depuis 2026. 2 à vérifier … » (' + await toastTexte(page) + ')');
    verifier(await page.evaluate((n) => window.__ECRITURES.length === n, ecrituresAvant), 'rien n\'est écrit en base avant Enregistrer');
    verifier(await page.evaluate(() => document.getElementById('btnEnregistrerHoraires').textContent) === 'Enregistrer 19', 'bouton « Enregistrer 19 »');
    await page.click('#horaireAnneePrec');
    verifier((await lignes(page)).length === 19 && (await lignes(page))[0].txt === '2026-01-12→2026-01-30', '2026 reste intact');
    await page.click('#horaireAnneeSuiv');
    await page.click('#btnEnregistrerHoraires');
    await page.waitForTimeout(300);
    verifier(/Horaires enregistrés/.test(await toastTexte(page)), 'Enregistrer passe (pas de chevauchement) (' + await toastTexte(page) + ')');
    const base = await page.evaluate(() => window.__BD.horaires.filter((r) => r.date_debut >= '2027').map((r) => r.date_debut + '→' + r.date_fin).sort());
    verifier(base.length === 19 && base[3] === '2027-03-01→2027-03-31', 'les 19 périodes 2027 sont en base (' + base.length + ')');
    // Planning : le lundi 1er mars 2027 a bien son horaire.
    verifier(await page.evaluate(() => (horaireDuJour('2027-03-01') || {}).matin === '07:00–12:00'), 'planning : le lundi 1er mars 2027 a son horaire 07:00–12:00');

    // --- 2. Recopier sur une année déjà remplie : confirmation, remplacement ---
    await page.evaluate(() => { const l = document.querySelector('#horairesListe .horaire-ligne'); const i = l.querySelector('[data-champ="matinDebut"]'); i.value = '06:30'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('#btnCopierHoraires');
    await page.waitForTimeout(150);
    const texteConfirm = await page.evaluate(() => (document.querySelector('.confirm-pop .confirm-texte') || {}).textContent);
    verifier(/Remplacer les 19 périodes de 2027 par celles de 2026/.test(texteConfirm || ''), '2027 déjà rempli : confirmation « Remplacer les 19 périodes… » (' + texteConfirm + ')');
    await page.click('.confirm-pop .c-annuler');
    verifier((await lignes(page))[0].h.startsWith('06:30'), 'Annuler : rien n\'est remplacé');
    await page.click('#btnCopierHoraires');
    await page.click('.confirm-pop .c-ok');
    await page.waitForTimeout(150);
    const apres = await lignes(page);
    verifier(apres.length === 19 && apres[0].h.startsWith('07:45'), 'Confirmer : les 19 périodes 2027 sont remplacées par la copie (' + apres.length + ', ' + apres[0].h + ')');
    verifier(await page.evaluate(() => document.getElementById('btnEnregistrerHoraires').textContent) === 'Enregistrer 38', 'remplacement = 19 suppressions + 19 nouvelles (« Enregistrer 38 »)');
    // Année source vide.
    await page.click('#horaireAnneePrec'); await page.click('#horaireAnneePrec');
    await page.click('#btnCopierHoraires');
    verifier(/Aucun horaire en 2024/.test(await toastTexte(page)), '2025 depuis 2024 vide : « Aucun horaire en 2024 à copier. »');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Période à cheval sur 2 années : raccourcie, pas effacée ---
  {
    const bd = { horaires: [ligne(1, ['2025-03-03', '2025-03-31', '07:00', '12:00', '13:00', '17:00']), ligne(2, ['2025-12-22', '2026-01-09', '07:45', '12:00', '13:00', '16:30']), ligne(3, ['2026-06-01', '2026-06-30', '07:00', '12:00', '13:00', '17:15'])], feries: [] };
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd });
    await allerA(page, 'horaires');
    await page.click('#btnCopierHoraires');
    await page.click('.confirm-pop .c-ok');
    await page.waitForTimeout(150);
    const l2026 = (await lignes(page)).map((x) => x.txt);
    // 1re période de l'année : rien avant elle, donc mêmes dates (règle 1).
    verifier(l2026.join(',') === '2026-03-03→2026-03-31,2026-12-22→2026-12-31', '2026 depuis 2025 : mars aux mêmes dates + la partie 2025 de la période à cheval (' + l2026.join(', ') + ')');
    await page.click('#horaireAnneePrec');
    const l2025 = (await lignes(page)).map((x) => x.txt);
    verifier(l2025.join(',') === '2025-03-03→2025-03-31,2025-12-22→2025-12-31', '2025 : la période à cheval est raccourcie au 31.12.2025, pas effacée (' + l2025.join(', ') + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Téléphone : 3 boutons dans la barre du bas, pas de débordement ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: { horaires: HORAIRES, feries: FERIES } });
    await allerA(page, 'horaires');
    const barre = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, textes: [...document.querySelectorAll('#blocHoraires .actions-feries button')].map((b) => b.innerText.trim()), debord: [...document.querySelectorAll('#blocHoraires .actions-feries button')].some((b) => b.scrollWidth > b.clientWidth + 1) }));
    verifier(barre.page <= 390 && !barre.debord && barre.textes[0] === 'Copier 2025', 'téléphone : « Copier 2025 | Ajouter | Enregistrer » tiennent sans déborder (' + JSON.stringify(barre) + ')');
    await page.click('#horaireAnneeSuiv');
    await page.click('#btnCopierHoraires');
    await page.waitForTimeout(150);
    const cartes = await page.evaluate(() => ({ n: document.querySelectorAll('.horaire-ligne').length, verif: document.querySelectorAll('.horaire-ligne.a-verifier').length, largeur: document.documentElement.scrollWidth }));
    verifier(cartes.n === 19 && cartes.verif === 2 && cartes.largeur <= 390, 'téléphone : 19 cartes copiées, 2 surlignées, pas de défilement de côté (' + JSON.stringify(cartes) + ')');
    await page.screenshot({ path: process.env.CAPTURE_DIR ? process.env.CAPTURE_DIR + '/s28-390.png' : '/dev/null' }).catch(() => {});
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exitCode = bilan(toutesErreurs);
})();
