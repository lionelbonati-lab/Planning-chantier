const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 30.09.2026 (suite 128). Lionel : « Notifications, notification
// différents pour chaque groupe de libellé différents. Possibilité de pour
// régler x jours avant et en fonction des horaires de travail. », puis, à
// nos questions : chaque sorte actuelle a ses propres réglages ; l'heure
// d'envoi est le « Début de demi journée ».
// Vérifie :
//   A. la logique d'envoi (functions/envoyer-push/logic.js, la VRAIE) :
//      jours de travail (week-end, férié, vacances, compensé), jour et
//      demi-journée d'envoi (période « matin seul »), importants, à
//      réserver et rappel des demandes par créneau, réglage par appareil,
//      titres « Demain après-midi », « … à venir », 5 lignes au plus ;
//   B. la page Réglages › Notifications : une ligne « Quand » / « Rappel »
//      sous chaque sorte, cachée quand la sorte est éteinte, rien qui
//      déborde sur téléphone.
// Les créneaux eux-mêmes (heure de début du matin / de l'après-midi, 4 h
// pour partir, une seule fois) sont calculés par la base (push_creneaux_,
// sql/0029), vérifiés sur le projet à la mise en place.
//
// Lancer : node test_suite128.js

const SRC = fs.readFileSync(path.join(__dirname, '..', 'functions/envoyer-push/logic.js'), 'utf8').replace(/export \{[\s\S]*?\};\s*$/, '');
const L = new Function(SRC + '; return { calendrier, jourTravaille, jourEnvoi, creneauEnvoi, planEnvois };')();

// Horaires comme la page Horaires : octobre complet (07:45 / 13:00), le
// 18 décembre matin seul, le 24 décembre (compensé) sur sa propre période.
const HORAIRES = [
  { id: 1, date_debut: '2026-09-01', date_fin: '2026-12-17', matin_debut: '07:45:00', aprem_debut: '13:00:00', aprem_fin: '16:45:00' },
  { id: 2, date_debut: '2026-12-18', date_fin: '2026-12-18', matin_debut: '07:45:00', aprem_debut: null, aprem_fin: null },
  { id: 3, date_debut: '2026-12-24', date_fin: '2026-12-24', matin_debut: '07:45:00', aprem_debut: null, aprem_fin: null }
];
const FERIES = [
  { date: '2026-10-05', categorie: 'ferie' },
  { date: '2026-10-12', categorie: 'vacances_entreprise' },
  { date: '2026-10-13', categorie: 'vacances_entreprise' },
  { date: '2026-12-23', categorie: 'compenses' },
  { date: '2026-12-24', categorie: 'compenses' }
];
const PERS = [{ id: 1, nom: 'Lionel', ordre: 2 }, { id: 2, nom: 'Marco', ordre: 1 }];
const base = (plus) => Object.assign({
  abonnements: [], demandes: [], demandesEnAttente: [], modifs: [], personnes: PERS, chantiers: [{ id: 7, nom: 'Padel' }],
  statuts: [{ id: 9, cle: 'areserver', nom: 'à réserver', ordre: 2 }, { id: 8, cle: 'confirme', nom: 'confirmé', ordre: 1 }],
  taches: [], jalons: [], notes: [], aReserver: [], horaires: HORAIRES, feries: FERIES, creneaux: []
}, plus);
const creneau = (jour, demi) => ({ cle: jour + ':' + demi, jour, demi });
const MAINTENANT = new Date('2026-09-30T12:00:00Z');
const resume = (plan) => plan.envois.map((e) => e.abonnement.id + ':' + e.message.tag).join(' ');

function partieLogique(verifier) {
  const cal = L.calendrier(base({}));
  const trav = ['2026-10-02', '2026-10-03', '2026-10-05', '2026-10-12', '2026-12-23', '2026-12-24'].map((d) => d.slice(5) + '=' + L.jourTravaille(d, cal)).join(' ');
  verifier(trav === '10-02=true 10-03=false 10-05=false 10-12=false 12-23=false 12-24=true',
    'jours de travail : samedi, férié, vacances d’entreprise non ; compensé seulement avec sa propre période d’un jour, comme la page Fériés (' + trav + ')');

  const env = [
    L.creneauEnvoi('2026-10-01', 'aprem', 1, cal), L.creneauEnvoi('2026-10-01', 'matin', 1, cal), L.creneauEnvoi('2026-10-01', null, 1, cal),
    L.creneauEnvoi('2026-10-06', 'matin', 1, cal), L.creneauEnvoi('2026-10-03', 'aprem', 1, cal), L.creneauEnvoi('2026-10-03', 'matin', 0, cal),
    L.creneauEnvoi('2026-10-14', 'matin', 2, cal), L.creneauEnvoi('2026-10-01', 'aprem', 0, cal), L.creneauEnvoi('2026-12-21', 'aprem', 1, cal)
  ];
  verifier(env.join(' ') === '2026-09-30:aprem 2026-09-30:matin 2026-09-30:matin 2026-10-02:matin 2026-10-02:aprem 2026-10-02:matin 2026-10-08:matin 2026-10-01:aprem 2026-12-18:matin',
    'jour d’envoi : jeudi après-midi « 1 jour avant » → mercredi au début de l’après-midi ; matin / journée → mercredi matin ; mardi après un lundi férié → vendredi ; samedi → vendredi ; 2 jours avant, vacances sautées ; le jour même ; vendredi 18.12 sans après-midi → au début du matin (' + env.join(' ') + ')');

  // Importants : un créneau, ce qui y tombe selon le réglage de l'appareil.
  const imp = {
    jalons: [{ date: '2026-10-01', texte: 'Réception', chantier_id: 7, important: true }],
    notes: [{ date: '2026-10-01', demi: 'aprem', texte: 'Appeler le géomètre', chantier_id: null, important: true }],
    taches: [
      { personne_id: 1, date: '2026-10-01', demi: 'aprem', texte: 'Grue', chantier_id: 7, important: true },
      { personne_id: 2, date: '2026-10-01', demi: 'matin', texte: 'Béton', chantier_id: 7, important: true },
      { personne_id: 2, date: '2026-09-30', demi: 'aprem', texte: 'Coffrage', chantier_id: 7, important: true },
      { personne_id: 1, date: '2026-10-06', demi: 'matin', texte: 'Livraison', chantier_id: 7, important: true },
      { personne_id: 1, date: '2026-10-06', demi: 'aprem', texte: 'Livraison', chantier_id: 7, important: true }
    ]
  };
  let p = L.planEnvois(base(Object.assign({ abonnements: [{ id: 1 }], creneaux: [creneau('2026-09-30', 'aprem')] }, imp)), MAINTENANT);
  let m = p.envois[0] && p.envois[0].message;
  verifier(resume(p) === '1:importants-aprem' && m.titre === 'Demain après-midi : 2 importants' && m.corps === 'Note — Appeler le géomètre\nLionel — Grue (Padel)' && p.passages.join() === '2026-09-30:aprem',
    'mercredi, début de l’après-midi, réglage par défaut (1 jour avant) : les importants de jeudi après-midi seulement ; créneau rendu pour être noté (' + JSON.stringify(m) + ')');
  p = L.planEnvois(base(Object.assign({ abonnements: [{ id: 1 }], creneaux: [creneau('2026-09-30', 'matin')] }, imp)), MAINTENANT);
  m = p.envois[0] && p.envois[0].message;
  verifier(m && m.titre === '2 importants à venir' && m.corps === 'Demain · Jalon — Réception (Padel)\nDemain matin · Marco — Béton (Padel)',
    'mercredi matin : jalon de jeudi (journée) et tâche de jeudi matin, chaque ligne avec son moment (' + JSON.stringify(m) + ')');
  p = L.planEnvois(base(Object.assign({ abonnements: [{ id: 1, reglages: { importants: 0 } }, { id: 2, reglages: { importants: 2 } }, { id: 3, types: { importants: false } }], creneaux: [creneau('2026-09-30', 'aprem')] }, imp)), MAINTENANT);
  m = p.envois[0] && p.envois[0].message;
  verifier(resume(p) === '1:importants-aprem' && m.titre === 'Aujourd’hui après-midi : 1 important' && m.corps === 'Marco — Coffrage (Padel)',
    'réglé « le jour même » : ceux de cet après-midi ; réglé 2 jours avant : rien à ce créneau ; sorte éteinte : rien (' + resume(p) + ' ' + JSON.stringify(m) + ')');
  p = L.planEnvois(base(Object.assign({ abonnements: [{ id: 1 }], creneaux: [creneau('2026-10-02', 'matin'), creneau('2026-10-02', 'aprem')] }, imp)), MAINTENANT);
  verifier(resume(p) === '1:importants-matin' && p.envois[0].message.titre === 'Mar. 6 oct. : 1 important',
    'vendredi (lundi férié) : la tâche de mardi matin + après-midi = une ligne, au début du matin (' + resume(p) + ' ' + JSON.stringify(p.envois[0] && p.envois[0].message) + ')');
  p = L.planEnvois(base(Object.assign({ abonnements: [{ id: 1 }] }, imp)), MAINTENANT);
  verifier(!p.envois.length && !p.passages.length, 'aucun créneau dû : aucun important envoyé');

  // À réserver : même regroupement que l'appli, parti au début de la
  // demi-journée du premier jour.
  const ar = { aReserver: [
    { personne_id: 2, date: '2026-10-01', demi: 'matin', texte: 'Nacelle', chantier_id: 7, statut_id: 9 },
    { personne_id: 1, date: '2026-10-02', demi: 'aprem', texte: 'Pelle', chantier_id: 7, statut_id: 9 },
    { personne_id: 1, date: '2026-10-06', demi: 'matin', texte: 'Pelle', chantier_id: 7, statut_id: 9 },
    { personne_id: 2, date: '2026-10-01', demi: 'matin', texte: 'Béton', chantier_id: 7, statut_id: 8 }
  ] };
  p = L.planEnvois(base(Object.assign({ abonnements: [{ id: 1 }, { id: 2, reglages: { a_reserver: 2 } }, { id: 3, types: { a_reserver: false } }], creneaux: [creneau('2026-09-30', 'matin')] }, ar)), MAINTENANT);
  m = p.envois[0] && p.envois[0].message;
  verifier(resume(p) === '1:a-reserver-matin' && m.titre === 'À réserver : 1 tâche' && m.corps === 'Demain matin · Marco · Nacelle',
    'à réserver, mercredi matin, 1 jour avant : la nacelle de jeudi matin ; autre statut ignoré ; réglé 2 jours avant ou éteint : rien (' + resume(p) + ' ' + JSON.stringify(m) + ')');
  p = L.planEnvois(base(Object.assign({ abonnements: [{ id: 1 }], creneaux: [creneau('2026-10-01', 'aprem')] }, ar)), MAINTENANT);
  m = p.envois[0] && p.envois[0].message;
  verifier(resume(p) === '1:a-reserver-aprem' && m.corps === 'Demain après-midi · Lionel · Pelle',
    'pelle vendredi après-midi → mardi (lundi férié = même tâche) : une seule, jeudi au début de l’après-midi (' + JSON.stringify(m) + ')');

  // Rappel des demandes encore en attente.
  const q = { id: 5, personne_id: 1, date_debut: '2026-10-02', date_fin: '2026-10-02', demi_debut: 'aprem', demi_fin: 'aprem', motif: 'Médecin', type: 'nouvelle' };
  p = L.planEnvois(base({ abonnements: [{ id: 1 }, { id: 2, reglages: { rappel_demandes: 1 } }, { id: 3, reglages: { rappel_demandes: 1 }, types: { demandes: false } }], demandesEnAttente: [q], creneaux: [creneau('2026-10-01', 'aprem')] }), MAINTENANT);
  m = p.envois[0] && p.envois[0].message;
  verifier(resume(p) === '2:rappel-demandes-aprem' && m.titre === 'Rappel : demande d’absence en attente' && m.corps === 'Lionel · Médecin · Ven. 2 oct., après-midi' && !p.demandesAnnoncees.length,
    'rappel 1 jour avant une absence de vendredi après-midi : jeudi au début de l’après-midi ; pas de rappel par défaut ; sorte éteinte : rien (' + resume(p) + ' ' + JSON.stringify(m) + ')');

  // 5 lignes au plus.
  const beaucoup = { taches: Array.from({ length: 7 }, (_, i) => ({ personne_id: 1, date: '2026-10-01', demi: 'matin', texte: 'T' + i, important: true })) };
  p = L.planEnvois(base(Object.assign({ abonnements: [{ id: 1 }], creneaux: [creneau('2026-09-30', 'matin')] }, beaucoup)), MAINTENANT);
  verifier(p.envois[0].message.titre === 'Demain matin : 7 importants' && p.envois[0].message.corps.split('\n').length === 5 && /… et 3 autres$/.test(p.envois[0].message.corps), '7 lignes : 4 affichées puis « … et 3 autres »');
}

// Service push simulé (comme test_suite126.js), déjà autorisé et abonné.
function fauxPushAbonne() {
  return () => {
    const sub = { endpoint: 'https://push.exemple/cet-appareil', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'P', auth: 'A' } }; }, unsubscribe() { return Promise.resolve(true); } };
    const pushManager = { getSubscription() { return Promise.resolve(sub); }, subscribe() { return Promise.resolve(sub); } };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      ready: Promise.resolve({ pushManager }), register() { return Promise.resolve({}); }, getRegistration() { return Promise.resolve(null); },
      controller: null, addEventListener() {}
    } });
    window.PushManager = function () {};
    window.Notification = { permission: 'granted', requestPermission() { return Promise.resolve('granted'); } };
  };
}

async function partieNavigateur(browser, verifier, erreursTout) {
  const ligne = { id: 1, endpoint: 'https://push.exemple/cet-appareil', p256dh: 'P', auth: 'A', nom_appareil: 'Android · Chrome', cree_le: '2026-09-20T08:00:00Z', types: { importants: false }, reglages: { importants: 3, a_reserver: 0, rappel_demandes: 2 } };
  for (const ecran of [{ nom: 'ordinateur', viewport: { width: 1280, height: 900 } }, { nom: 'téléphone', viewport: { width: 390, height: 844 }, hasTouch: true }]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: ecran.viewport, hasTouch: ecran.hasTouch, bd: { abonnements_push: [Object.assign({}, ligne)] }, init: fauxPushAbonne() });
    await page.evaluate(() => afficherPage('notifications-push'));
    await page.waitForTimeout(400);
    let etat = await page.evaluate(() => ({
      lignes: [...document.querySelectorAll('.push-quand')].map((l) => l.dataset.pour + (l.hidden ? ':cachée' : ':visible')).join(','),
      valeurs: [...document.querySelectorAll('select[data-reglage]')].map((s) => s.dataset.reglage + '=' + s.value + ' (' + s.selectedOptions[0].textContent + ')').join(', '),
      deborde: document.documentElement.scrollWidth > document.documentElement.clientWidth
    }));
    verifier(etat.lignes === 'demandes:visible,importants:cachée,a_reserver:visible' && etat.valeurs === 'rappel_demandes=2 (2 jours avant), importants=3 (3 jours avant), a_reserver=0 (Le jour même)' && !etat.deborde,
      ecran.nom + ' : « Rappel » sous les demandes, « Quand » sous importants (cachée : sorte éteinte) et à réserver, réglages de l’appareil relus, rien ne déborde (' + JSON.stringify(etat) + ')');
    if (ecran.nom === 'ordinateur') {
      await page.click('label[for="chkPush-importants"]');
      await page.selectOption('#selPush-rappel_demandes', '');
      await page.waitForTimeout(200);
      etat = await page.evaluate(() => ({ cachee: document.querySelector('.push-quand[data-pour="importants"]').hidden, ligne: __BD.abonnements_push[0] }));
      verifier(!etat.cachee && etat.ligne.types.importants === true && JSON.stringify(etat.ligne.reglages) === '{"rappel_demandes":null,"importants":3,"a_reserver":0}',
        'rallumer « Importants » montre son « Quand » ; « Pas de rappel » enregistré (null) (' + JSON.stringify(etat) + ')');
    }
    erreursTout.push(...erreurs);
    await page.close();
  }
}

(async () => {
  const { verifier, bilan } = verificateur();
  partieLogique(verifier);
  const browser = await lancerNavigateur(chromium);
  const erreurs = [];
  await partieNavigateur(browser, verifier, erreurs);
  verifier(erreurs.length === 0, 'aucune erreur JS (' + erreurs.join(' | ') + ')');
  await browser.close();
  bilan();
})();
