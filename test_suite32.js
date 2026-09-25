const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 32) — Lionel : « Est-ce-que les totaux des
// heures correspondent entre ma photos et ton onglet horaires. Tu peux
// constater que certains jours compensées (jaune) ont des heures de
// travaille. C'est pour arriver à un total de 2112 heures de travaille à
// effectuer dans l'année, sont compté dedans les vacances et jours fériés.
// Les compensées sont le supplément de heures faites »
//
// Données : les 19 périodes et les 42 jours colorés de 2026 tels qu'en
// production, plus les 2 écarts avec la feuille PMB corrigés comme sur la
// feuille : période « du 9 au 9 » janvier (1.75 h, jour compensé) et le
// 22 juin en vacances (il est « compensé » en production). On doit alors
// retrouver la feuille mois par mois et son total de 2112.03 h.
//
// Lancer : node test_suite32.js

const h = (id, du, au, md, mf, ad, af) => ({ id, date_debut: du, date_fin: au, matin_debut: md + ':00', matin_fin: mf + ':00', aprem_debut: ad ? ad + ':00' : null, aprem_fin: af ? af + ':00' : null, pause_matin: 15 });
const HORAIRES = [
  h(1, '2026-01-12', '2026-01-30', '07:45', '12:00', '13:00', '16:30'),
  h(2, '2026-02-02', '2026-02-13', '07:45', '12:00', '13:00', '16:30'),
  h(3, '2026-02-16', '2026-02-27', '07:30', '12:00', '13:00', '16:45'),
  h(4, '2026-03-02', '2026-03-31', '07:00', '12:00', '13:00', '17:00'),
  h(5, '2026-04-01', '2026-04-24', '07:00', '12:00', '13:00', '17:00'),
  h(6, '2026-04-27', '2026-04-30', '07:00', '12:00', '13:00', '17:15'),
  h(7, '2026-05-04', '2026-05-29', '07:00', '12:00', '13:00', '17:15'),
  h(8, '2026-06-01', '2026-06-30', '07:00', '12:00', '13:00', '17:15'),
  h(9, '2026-07-01', '2026-07-16', '07:00', '12:00', '13:00', '17:15'),
  h(10, '2026-07-17', '2026-07-17', '07:00', '10:15', null, null),
  h(11, '2026-08-10', '2026-08-31', '07:00', '12:00', '13:00', '17:15'),
  h(12, '2026-09-01', '2026-09-25', '07:00', '12:00', '13:00', '17:15'),
  h(13, '2026-09-28', '2026-09-30', '07:30', '12:00', '13:00', '17:00'),
  h(14, '2026-10-01', '2026-10-23', '07:30', '12:00', '13:00', '17:00'),
  h(15, '2026-10-26', '2026-10-30', '07:30', '12:00', '13:00', '16:45'),
  h(16, '2026-11-02', '2026-11-13', '07:30', '12:00', '13:00', '16:45'),
  h(17, '2026-11-17', '2026-11-30', '07:45', '12:00', '13:00', '16:45'),
  h(18, '2026-12-01', '2026-12-17', '07:45', '12:00', '13:00', '16:45'),
  h(19, '2026-12-18', '2026-12-18', '07:45', '11:00', null, null)
];
const JANV9 = h(20, '2026-01-09', '2026-01-09', '07:45', '09:45', null, null); // 2.00 − 0.25 = 1.75
const f = (d, c) => ({ date: '2026-' + d, libelle: c, categorie: c });
const FERIES = [
  ...['01-01', '01-02', '01-05', '01-06', '01-07', '01-08', '01-09', '05-15', '06-05'].map((d) => f(d, 'compenses')),
  ...['04-03', '04-06', '05-01', '05-14', '05-25', '06-04', '06-23', '12-25'].map((d) => f(d, 'ferie')),
  ...['07-20', '07-21', '07-22', '07-23', '07-24', '07-27', '07-28', '07-29', '07-30', '07-31', '08-03', '08-04', '08-05', '08-06', '08-07',
    '11-16', '12-21', '12-22', '12-23', '12-24', '12-28', '12-29', '12-30', '12-31'].map((d) => f(d, 'vacances_entreprise'))
];
const JUIN22 = (c) => f('06-22', c);

// Feuille PMB « Horaire de travail 2026 », mois par mois : J.trav. H.trav.
// J.fér. H.fér. J.vac. H.vac. — cellules vides comprises.
const FEUILLE_CELLULES = [
  ['16', '114.25', '', '', '', ''], ['20', '155.00', '', '', '', ''], ['22', '192.50', '', '', '', ''],
  ['20', '176.00', '2', '16.18', '', ''], ['17', '153.00', '3', '24.28', '', ''], ['18', '162.00', '2', '16.18', '1', '8.09'],
  ['13', '111.00', '', '', '10', '80.92'], ['16', '144.00', '', '', '5', '40.46'], ['22', '195.75', '', '', '', ''],
  ['22', '180.25', '', '', '', ''], ['20', '157.50', '', '', '1', '8.09'], ['14', '103.75', '1', '8.09', '8', '64.74']
];

const allerA = (page, nom) => page.evaluate((nom) => document.querySelector('.onglet[data-page="' + nom + '"]').click(), nom).then(() => page.waitForTimeout(250));
const lireTableau = (page) => page.evaluate(() => {
  const lignes = [...document.querySelectorAll('#ferieCalendrier tbody tr')];
  const pied = [...document.querySelectorAll('#ferieCalendrier tfoot tr')];
  const caseJour = (m, j) => lignes[m].querySelector('td.jour[data-j="' + j + '"]');
  return {
    entetes: [...document.querySelectorAll('#ferieCalendrier thead th.total')].map((x) => x.textContent),
    mois: lignes.map((tr) => [...tr.querySelectorAll('td.total')].map((x) => x.textContent)),
    total: [...pied[0].querySelectorAll('td.total')].map((x) => x.textContent),
    bilan: pied[1] ? { texte: pied[1].querySelector('td.mois').textContent, heures: pied[1].querySelector('td.total').textContent } : null,
    janv9: { txt: caseJour(0, 9).textContent, pale: !!caseJour(0, 9).querySelector('.h-non-compte') },
    mai15: { txt: caseJour(4, 15).textContent, pale: !!caseJour(4, 15).querySelector('.h-non-compte') },
    avr3: { txt: caseJour(3, 3).textContent, pale: !!caseJour(3, 3).querySelector('.h-non-compte') }
  };
});

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Données corrigées comme la feuille → mêmes chiffres, 2112.03 h ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: { horaires: [...HORAIRES, JANV9], feries: [...FERIES, JUIN22('vacances_entreprise')] } });
    await allerA(page, 'feries');
    const t = await lireTableau(page);
    verifier(t.entetes.join(' ') === 'J.trav. H.trav. J.fér. H.fér. J.vac. H.vac.', 'en-têtes des colonnes de la feuille (' + t.entetes.join(' ') + ')');
    FEUILLE_CELLULES.forEach((attendu, m) => {
      verifier(t.mois[m].join('|') === attendu.join('|'), 'mois ' + (m + 1) + ' identique à la feuille : ' + attendu.filter(Boolean).join(' ') + ' (' + t.mois[m].filter(Boolean).join(' ') + ')');
    });
    verifier(t.total.join(' ') === '220 1845.00 8 64.74 25 202.30', 'ligne « Total travaillé 2026 » = feuille : 220 1845.00 8 64.74 25 202.30 (' + t.total.join(' ') + ')');
    verifier(t.bilan && t.bilan.heures === '2112.03 h', 'Nb. d\'heures 2026 = 2112.03 h, comme l\'encadré de la feuille (' + (t.bilan && t.bilan.heures) + ')');
    verifier(t.bilan && /2112 ÷ 261 = 8\.09 h/.test(t.bilan.texte) && /8 jours compensés à 0 h/.test(t.bilan.texte), 'bilan : 1 jour payé = 2112 ÷ 261 = 8.09 h, 8 jours compensés (' + (t.bilan && t.bilan.texte) + ')');
    verifier(t.janv9.txt === '1.75' && !t.janv9.pale, '9 janvier (compensé, période d\'un jour) : 1.75 compté, pas en discret');
    verifier(t.mai15.txt === '9.00' && t.mai15.pale, '15 mai (compensé dans la période du 4 au 29) : 9.00 en discret, pas compté');
    verifier(t.avr3.txt === '8.75' && t.avr3.pale, 'Vendredi Saint : 8.75 en discret, compté en férié (8.09) pas en travaillé');

    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. Production telle quelle : les 2 écarts avec la feuille ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: { horaires: HORAIRES, feries: [...FERIES, JUIN22('compenses')] } });
    await allerA(page, 'feries');
    const t = await lireTableau(page);
    verifier(t.mois[0].filter(Boolean).join(' ') === '15 112.50', 'production sans période du 9 janvier : janvier 15 j 112.50 h (' + t.mois[0].filter(Boolean).join(' ') + ')');
    verifier(t.mois[5].filter(Boolean).join(' ') === '18 162.00 2 16.18', 'production, 22 juin compensé : juin sans le jour de vacances (' + t.mois[5].filter(Boolean).join(' ') + ')');
    verifier(t.total.join(' ') === '219 1843.25 8 64.74 24 194.21', 'production : 219 1843.25 8 64.74 24 194.21 (' + t.total.join(' ') + ')');
    verifier(t.bilan.heures === '2102.19 h' && /10 jours compensés/.test(t.bilan.texte), 'production : 1843.25 + 64.74 + 194.21 = 2102.19 h, 10 jours compensés (' + t.bilan.heures + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Téléphone : carte « Bilan 2026 » sous décembre ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, bd: { horaires: [...HORAIRES, JANV9], feries: [...FERIES, JUIN22('vacances_entreprise')] } });
    await allerA(page, 'feries');
    const m = await page.evaluate(() => {
      const c = document.querySelector('#ferieMoisMobile .mois-carte.bilan-annuel');
      if (!c) return null;
      return {
        titre: c.querySelector('.mois-carte-titre').textContent,
        lignes: [...c.querySelectorAll('.mois-liste li')].map((li) => li.textContent),
        visible: c.getBoundingClientRect().width > 0,
        deborde: document.documentElement.scrollWidth > window.innerWidth,
        janvier: document.querySelector('#ferieMoisMobile .mois-carte .mois-carte-compte').textContent
      };
    });
    verifier(m && m.titre === 'Bilan 20262112.03 h', 'téléphone : carte « Bilan 2026 » — 2112.03 h (' + (m && m.titre) + ')');
    verifier(m && m.lignes.join(' / ') === 'Travaillé220 j1845.00 h / Fériés8 j64.74 h / Vacances25 j202.30 h', 'téléphone : travaillé / fériés / vacances (' + (m && m.lignes.join(' / ')) + ')');
    verifier(m && m.visible && !m.deborde, 'téléphone : carte visible, pas de défilement horizontal');
    verifier(m && /^16 j · 114\.25 h/.test(m.janvier), 'téléphone : janvier 16 j · 114.25 h (' + (m && m.janvier) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan());
})();
