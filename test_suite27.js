const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 27) — Lionel : « J'aimerai une nouvelle page
// horaires de travail. Pouvoir entrer les horaires comme le tableau en bas à
// gauche. Les heures de travail viennent s'afficher dans le tableau des
// fériés. On affichera dans les case des jour du planning les heures de
// travail, l'heure de début et l'heure de fin de la journée de travail. [...]
// Sur la page d'impression. On rajoute une ligne sous matin et après-midi
// pour afficher les horaires du matin et de l'après-midi. Une case à cocher
// sur la page impression permet d'afficher ou non les horaires. »
//
// Données : périodes de la feuille PMB « Horaire de travail 2026 » (mars,
// avril), plus une semaine de septembre découpée pour couvrir les cas
// particuliers (jour sans après-midi, jour sans horaire).
//
// Lancer : node test_suite27.js

const h = (id, du, au, md, mf, ad, af) => ({ id, date_debut: du, date_fin: au, matin_debut: md + ':00', matin_fin: mf + ':00', aprem_debut: ad ? ad + ':00' : null, aprem_fin: af ? af + ':00' : null, pause_matin: 15 });
const HORAIRES = [
  h(1, '2026-03-02', '2026-03-31', '07:00', '12:00', '13:00', '17:00'),
  h(2, '2026-04-01', '2026-04-24', '07:00', '12:00', '13:00', '17:00'),
  h(3, '2026-04-27', '2026-04-30', '07:00', '12:00', '13:00', '17:15'),
  h(4, '2026-09-21', '2026-09-23', '07:00', '12:00', '13:00', '17:15'),
  h(5, '2026-09-24', '2026-09-24', '07:00', '10:15', null, null) // matin seul, comme le 17 juillet de la feuille
  // vendredi 25 : aucun horaire
];
const FERIES = [{ date: '2026-04-03', libelle: 'Vendredi Saint', categorie: 'ferie' }, { date: '2026-04-06', libelle: 'Lundi de Pâques', categorie: 'ferie' }];
const BD = { horaires: HORAIRES, feries: FERIES };

const allerA = (page, nom) => page.evaluate((nom) => document.querySelector('.onglet[data-page="' + nom + '"]').click(), nom).then(() => page.waitForTimeout(250));
const toastTexte = (page) => page.evaluate(() => document.getElementById('toast').textContent);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Planning : durée dans l'en-tête, horaires dans la ligne M | A ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD });
    const entetes = await page.evaluate(() => {
      const r = {};
      ['2026-09-21', '2026-09-24', '2026-09-25'].forEach((iso) => {
        const gi = giDepuisIso(iso);
        const th = document.querySelector('.th[data-gi="' + gi + '"]:not(.th-demi)');
        r[iso] = { duree: (th.querySelector('.th-duree') || {}).textContent || null };
      });
      // Ligne M | A : dans l'ordre des colonnes, 2 cases par jour ouvré.
      const cases = [...document.querySelectorAll('.th.th-demi:not(.coin):not(.th-weekend)')].map((x) => x.textContent);
      r.demis = cases;
      return r;
    });
    verifier(entetes['2026-09-21'].duree === '9.00 h', 'lundi 21 : « 9.00 h » sous la date — 07:00-12:00 moins 15 min de pause + 13:00-17:15 (' + entetes['2026-09-21'].duree + ')');
    verifier(entetes['2026-09-24'].duree === '3.00 h', 'jeudi 24, matin seul 07:00-10:15 : « 3.00 h » (' + entetes['2026-09-24'].duree + ')');
    verifier(entetes['2026-09-25'].duree === null, 'vendredi 25 sans horaire : pas de durée');
    const d = entetes.demis;
    verifier(d[0] === '07:00–12:00' && d[1] === '13:00–17:15', 'ligne M | A du lundi : « 07:00–12:00 » | « 13:00–17:15 » (' + d.slice(0, 2).join(' | ') + ')');
    verifier(d[6] === '07:00–10:15' && d[7] === '—', 'jeudi (matin seul) : « 07:00–10:15 » | « — » (' + d.slice(6, 8).join(' | ') + ')');
    verifier(d[8] === 'M' && d[9] === 'A', 'vendredi sans horaire : lettres M | A comme avant (' + d.slice(8, 10).join(' | ') + ')');

    // --- 2. Impression : ligne des horaires + case à cocher ---
    await page.evaluate(() => openPrintSheet());
    await page.waitForTimeout(200);
    const impr = await page.evaluate(() => {
      const tr = document.querySelector('.print-horaires');
      return { cellules: tr ? [...tr.querySelectorAll('th')].map((x) => x.textContent) : null, visible: tr ? getComputedStyle(tr).display !== 'none' : false, coche: document.querySelector('.f-horaires').checked };
    });
    verifier(impr.cellules && impr.cellules[0] === 'Horaires' && impr.cellules[1] === '07:00–12:00' && impr.cellules[2] === '13:00–17:15', 'impression : ligne « Horaires » sous Matin/Aprem (' + JSON.stringify(impr.cellules && impr.cellules.slice(0, 3)) + ')');
    verifier(impr.cellules[7] === '07:00–10:15' && impr.cellules[8] === '—' && impr.cellules[9] === '' && impr.cellules[10] === '', 'impression : jeudi matin seul, vendredi vide (' + JSON.stringify(impr.cellules.slice(7)) + ')');
    verifier(impr.visible && impr.coche, 'impression : case « Afficher les horaires » cochée par défaut, ligne visible');
    await page.click('.impr-reglages summary'); // replié à l'ouverture (suite 40)
    await page.click('.f-horaires');
    const masquee = await page.evaluate(() => getComputedStyle(document.querySelector('.print-horaires')).display === 'none');
    verifier(masquee, 'impression : décocher masque la ligne des horaires');
    await page.click('.impression-modal .f-fermer');
    await page.evaluate(() => openPrintSheet());
    await page.waitForTimeout(200);
    const retenu = await page.evaluate(() => ({ coche: document.querySelector('.f-horaires').checked, masquee: getComputedStyle(document.querySelector('.print-horaires')).display === 'none' }));
    verifier(!retenu.coche && retenu.masquee, 'impression : le choix est retenu à la réouverture (' + JSON.stringify(retenu) + ')');
    await page.click('.impression-modal .f-fermer');

    // --- 3. Tableau des Fériés : heures dans les cases, totaux du mois ---
    await allerA(page, 'feries');
    const fer = await page.evaluate(() => {
      const ligne = (m) => [...document.querySelectorAll('#ferieCalendrier tbody tr')][m];
      const avril = ligne(3), mars = ligne(2);
      const caseJour = (tr, j) => tr.querySelector('td.jour[data-j="' + j + '"]');
      // 2 premières colonnes (J.trav., H.trav.) : fériés/vacances ajoutés en suite 32.
      const totaux = (tr) => [...tr.querySelectorAll('td.total')].slice(0, 2).map((x) => x.textContent);
      return {
        mars1: caseJour(mars, 2).textContent, mars7: caseJour(mars, 7).textContent,
        avril3: caseJour(avril, 3).textContent, avril3Pale: !!caseJour(avril, 3).querySelector('.h-non-compte'),
        avril27: caseJour(avril, 27).textContent,
        totMars: totaux(mars), totAvril: totaux(avril), totMai: totaux(ligne(4)),
        annee: [...document.querySelectorAll('#ferieCalendrier tfoot tr:first-child td.total')].slice(0, 2).map((x) => x.textContent)
      };
    });
    verifier(fer.mars1 === '8.75' && fer.mars7 === '', 'Fériés : lundi 2 mars « 8.75 », samedi 7 vide (' + fer.mars1 + ' / « ' + fer.mars7 + ' »)');
    verifier(fer.avril3 === '8.75' && fer.avril3Pale, 'Fériés : Vendredi Saint (coloré) montre quand même 8.75, en discret');
    verifier(fer.avril27 === '9.00', 'Fériés : 27 avril, 13:00-17:15 → 9.00 (' + fer.avril27 + ')');
    verifier(fer.totMars.join(' ') === '22 192.50', 'Fériés : mars 22 jours, 192.50 h — comme la feuille PMB (' + fer.totMars.join(' ') + ')');
    verifier(fer.totAvril.join(' ') === '20 176.00', 'Fériés : avril 20 jours, 176.00 h sans Vendredi Saint ni Lundi de Pâques — comme la feuille (' + fer.totAvril.join(' ') + ')');
    verifier(fer.totMai.join('|') === '|', 'Fériés : mai sans horaire → totaux vides');
    verifier(fer.annee.join(' ') === '46 398.50', 'Fériés : total de l\'année — 22 + 20 + 4 jours, 192.50 + 176.00 + 27.00 + 3.00 h (' + fer.annee.join(' ') + ')');

    // --- 4. Page Horaires : liste, ajout, erreurs, enregistrement ---
    await allerA(page, 'horaires');
    const liste = await page.evaluate(() => [...document.querySelectorAll('#horairesListe .horaire-ligne')].map((l) => l.querySelector('[data-champ="du"]').value + '→' + l.querySelector('[data-champ="au"]').value + ' ' + l.querySelector('.hc-total b').textContent));
    verifier(liste.length === 5 && liste[0] === '2026-03-02→2026-03-31 8.75' && liste[4] === '2026-09-24→2026-09-24 3.00', 'page Horaires : les 5 périodes de 2026, triées, avec leur durée par jour (' + liste.join(', ') + ')');
    const matinMars = await page.evaluate(() => document.querySelector('#horairesListe .horaire-ligne [data-duree="matin"] b').textContent);
    verifier(matinMars === '04:45', 'page Horaires : durée du matin 07:00-12:00 = 04:45 (pause de 15 min déduite, comme la feuille) (' + matinMars + ')');

    await page.click('#btnAjouterHoraire');
    const nouvelle = await page.evaluate(() => { const l = [...document.querySelectorAll('#horairesListe .horaire-ligne')].pop(); const v = (c) => l.querySelector('[data-champ="' + c + '"]').value; return [v('du'), v('au'), v('matinDebut'), v('matinFin'), v('apremDebut'), v('apremFin'), v('pause')].join(' '); });
    verifier(nouvelle === '2026-09-25 2026-09-30 07:00 10:15   15', 'Ajouter : commence le lendemain de la dernière période, jusqu\'à la fin du mois, horaires repris (' + nouvelle + ')');
    const remplir = (sel, val) => page.evaluate(([sel, val]) => { const l = [...document.querySelectorAll('#horairesListe .horaire-ligne')].pop(); const i = l.querySelector('[data-champ="' + sel + '"]'); i.value = val; i.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, val]);
    await remplir('du', '2026-09-24'); // chevauche le jeudi 24
    await remplir('matinFin', '12:00'); await remplir('apremDebut', '13:00'); await remplir('apremFin', '17:00');
    const ecrituresAvant = await page.evaluate(() => window.__ECRITURES.length);
    await page.click('#btnEnregistrerHoraires');
    await page.waitForTimeout(200);
    verifier(/se chevauchent/.test(await toastTexte(page)), 'Enregistrer refuse 2 périodes qui se chevauchent (' + await toastTexte(page) + ')');
    verifier(await page.evaluate((n) => window.__ECRITURES.length === n, ecrituresAvant), '… sans rien écrire en base');
    verifier(await page.evaluate(() => document.querySelectorAll('#horairesListe .horaire-ligne.erreur').length === 2), '… et les 2 lignes en cause sont marquées');

    await remplir('du', '2026-09-28');
    await remplir('apremFin', '');
    await page.click('#btnEnregistrerHoraires');
    await page.waitForTimeout(200);
    verifier(/après-midi est incomplet/.test(await toastTexte(page)), 'après-midi à moitié rempli : refusé (' + await toastTexte(page) + ')');
    await remplir('apremFin', '17:00');
    await remplir('pause', '20');
    // Supprimer la période du jeudi 24 (matin seul).
    await page.evaluate(() => { const l = [...document.querySelectorAll('#horairesListe .horaire-ligne')].find((x) => x.querySelector('[data-champ="du"]').value === '2026-09-24'); l.querySelector('.hc-suppr').click(); });
    const compte = await page.evaluate(() => document.getElementById('btnEnregistrerHoraires').textContent);
    verifier(compte === 'Enregistrer 2', 'compteur de modifications : 1 ajout + 1 suppression (' + compte + ')');
    await page.click('#btnEnregistrerHoraires');
    await page.waitForTimeout(400);
    verifier(/Horaires enregistrés/.test(await toastTexte(page)), 'Enregistrer : « Horaires enregistrés. » (' + await toastTexte(page) + ')');
    const base = await page.evaluate(() => window.__BD.horaires.map((r) => r.date_debut + '→' + r.date_fin + ' ' + r.matin_debut.slice(0, 5) + '-' + r.matin_fin.slice(0, 5) + ' ' + (r.aprem_debut ? r.aprem_debut.slice(0, 5) + '-' + r.aprem_fin.slice(0, 5) : '·') + ' p' + r.pause_matin).sort());
    verifier(base.length === 5 && base.indexOf('2026-09-28→2026-09-30 07:00-12:00 13:00-17:00 p20') >= 0 && !base.some((x) => x.startsWith('2026-09-24')), 'base : nouvelle période écrite (pause 20 min), période du 24 supprimée (' + base.join(' ; ') + ')');

    await allerA(page, 'planning');
    const apres = await page.evaluate(() => { const th = document.querySelector('.th[data-gi="' + giDepuisIso('2026-09-24') + '"]:not(.th-demi)'); return th.querySelector('.th-duree') ? th.querySelector('.th-duree').textContent : null; });
    verifier(apres === null, 'planning mis à jour : le jeudi 24 n\'a plus d\'horaire');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 5. Téléphone : page Fériés (mois) et page Horaires (cartes) ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD });
    await allerA(page, 'feries');
    const carte = await page.evaluate(() => {
      const c = [...document.querySelectorAll('#ferieMoisMobile .mois-carte')][3];
      const b = c.querySelector('button.jm[data-j="1"]');
      return { compte: c.querySelector('.mois-carte-compte').textContent, jour1: b.textContent };
    });
    verifier(carte.compte === '20 j · 176.00 h — 2 jours colorés', 'téléphone, Fériés : carte d\'avril « 20 j · 176.00 h — 2 jours colorés » (' + carte.compte + ')');
    verifier(carte.jour1 === '18.75', 'téléphone, Fériés : le 1er avril montre 8.75 sous son numéro (' + carte.jour1 + ')');
    await allerA(page, 'horaires');
    const largeur = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, carte: Math.round(document.querySelector('.horaire-ligne').getBoundingClientRect().right) }));
    verifier(largeur.page <= 390 && largeur.carte <= 390, 'téléphone, Horaires : les cartes tiennent dans l\'écran, pas de défilement de côté (' + JSON.stringify(largeur) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 6. Table `horaires` injoignable : le planning démarre quand même ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD, tablesEnEchec: ['horaires'] });
    const etatPage = await page.evaluate(() => ({ lignes: document.querySelectorAll('.grille .lbl').length, demis: [...document.querySelectorAll('.th.th-demi:not(.coin):not(.th-weekend)')].slice(0, 2).map((x) => x.textContent).join(' | ') }));
    verifier(etatPage.lignes > 0 && etatPage.demis === 'M | A', 'horaires injoignables : planning affiché, lettres M | A (' + JSON.stringify(etatPage) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  bilan(toutesErreurs);
})();
