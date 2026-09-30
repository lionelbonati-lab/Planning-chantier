const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 126). Lionel : « Notification Push sur le
// téléphone et l'ordinateur avec différents paramètre à régler dans
// l'appli. », puis les 4 sortes, chacune avec son interrupteur : demandes
// d'absence, importants (la veille et le matin), à réserver, modifications
// faites sur un autre appareil.
// Vérifie :
//   A. la logique d'envoi (functions/envoyer-push/logic.js, la VRAIE,
//      chargée telle quelle) : heure de Zurich, demandes, modifications
//      d'un autre appareil, veille, matin, fenêtre de 4 h, interrupteurs,
//      regroupement des importants et des « à réserver » ;
//   B. la page Réglages › Notifications (navigateur, service push simulé) :
//      activer / désactiver cet appareil, les 4 interrupteurs, les heures,
//      l'essai, les autres appareils, l'appareil remis à jour à
//      l'ouverture, navigateur sans notifications, clic sur une
//      notification (#notifications) ;
//   C. sw.js : affichage d'un message reçu et clic.
//
// Lancer : node test_suite126.js

const SRC = fs.readFileSync(path.join(__dirname, '..', 'functions/envoyer-push/logic.js'), 'utf8').replace(/export \{[\s\S]*?\};\s*$/, '');
const L = new Function(SRC + '; return { heureLocale, decalerIso, dateCourte, importantsDuJour, groupesAReserver, messageDemandes, planEnvois };')();

// Heures de Zurich (été : UTC+2) → instant UTC.
const zurich = (iso, h, m) => new Date(iso + 'T' + String(h - 2).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0') + ':00Z');
const PERS = [{ id: 1, nom: 'Lionel', ordre: 2 }, { id: 2, nom: 'Marco', ordre: 1 }];
const base = (plus) => Object.assign({
  abonnements: [], demandes: [], modifs: [], personnes: PERS, chantiers: [{ id: 7, nom: 'Padel' }],
  statuts: [{ id: 9, cle: 'areserver', nom: 'à réserver', ordre: 2 }, { id: 8, cle: 'confirme', nom: 'confirmé', ordre: 1 }],
  taches: [], jalons: [], notes: [], aReserver: []
}, plus);
const resume = (plan) => plan.envois.map((e) => e.abonnement.id + ':' + e.message.tag).join(' ');

async function partieLogique(verifier) {
  // Heure de Zurich, été et hiver.
  const ete = L.heureLocale(new Date('2026-09-30T05:30:00Z')), hiver = L.heureLocale(new Date('2026-12-31T23:30:00Z'));
  verifier(ete.iso === '2026-09-30' && ete.heure === 7 && hiver.iso === '2027-01-01' && hiver.heure === 0, 'heure de Zurich : été UTC+2, hiver UTC+1, changement de jour (' + JSON.stringify([ete, hiver]) + ')');

  // Demandes d'absence : une, puis plusieurs ; notées même sans abonné.
  const q1 = { id: 5, personne_id: 1, date_debut: '2026-10-01', date_fin: '2026-10-02', demi_debut: 'matin', demi_fin: 'aprem', motif: 'Vacances', type: 'nouvelle' };
  const q2 = { id: 6, personne_id: 2, date_debut: '2026-10-05', date_fin: '2026-10-05', demi_debut: 'matin', demi_fin: 'matin', motif: 'Médecin', type: 'nouvelle' };
  let p = L.planEnvois(base({ abonnements: [{ id: 1 }], demandes: [q1] }), zurich('2026-09-30', 15));
  let m = p.envois[0] && p.envois[0].message;
  verifier(m && m.titre === 'Demande d’absence' && m.corps === 'Lionel · Vacances · Jeu. 1 oct. → Ven. 2 oct.' && p.demandesAnnoncees.join() === '5', 'une demande : « Demande d’absence », qui · motif · dates (' + JSON.stringify(m) + ')');
  p = L.planEnvois(base({ abonnements: [{ id: 1 }], demandes: [q2, q1] }), zurich('2026-09-30', 15));
  m = p.envois[0].message;
  verifier(p.envois.length === 1 && m.titre === '2 demandes d’absence' && m.corps === 'Lionel · Vacances · Jeu. 1 oct. → Ven. 2 oct.\nMarco · Médecin · Lun. 5 oct., matin', 'deux demandes : une seule notification, une ligne par demande (' + JSON.stringify(m) + ')');
  m = L.messageDemandes([Object.assign({}, q1, { type: 'annulation' })], { 1: 'Lionel' });
  verifier(m.titre === 'Annulation d’absence demandée', 'annulation demandée : titre à part');
  p = L.planEnvois(base({ demandes: [q1] }), zurich('2026-09-30', 15));
  verifier(!p.envois.length && p.demandesAnnoncees.join() === '5', 'sans abonné : rien envoyé, la demande est quand même notée annoncée');
  p = L.planEnvois(base({ abonnements: [{ id: 1, types: { demandes: false } }], demandes: [q1] }), zurich('2026-09-30', 15));
  verifier(!p.envois.length, 'interrupteur « Demandes d’absence » éteint : rien');

  // Modifications : aux autres appareils seulement, après 1 minute de calme.
  const abos = [{ id: 1, session_id: 'A' }, { id: 2, session_id: 'B' }, { id: 3, session_id: 'C', types: { modifs: false } }];
  p = L.planEnvois(base({ abonnements: abos, modifs: [{ session_id: 'A', derniere: zurich('2026-09-30', 15, 0).toISOString() }] }), zurich('2026-09-30', 15, 2));
  verifier(resume(p) === '2:modifs' && p.modifsTraitees.join() === 'A', 'modifié sur l’appareil A : seul B est prévenu (C a éteint l’interrupteur) (' + resume(p) + ')');
  p = L.planEnvois(base({ abonnements: abos, modifs: [{ session_id: 'A', derniere: new Date(zurich('2026-09-30', 15, 2).getTime() - 30000).toISOString() }] }), zurich('2026-09-30', 15, 2));
  verifier(!p.envois.length && !p.modifsTraitees.length, 'dernier changement il y a 30 s : on attend (rien envoyé, rien traité)');
  p = L.planEnvois(base({ abonnements: abos, modifs: [{ session_id: '', derniere: zurich('2026-09-30', 15, 0).toISOString() }] }), zurich('2026-09-30', 15, 2));
  verifier(resume(p) === '1:modifs 2:modifs', 'écriture sans appareil connu (base) : tous les abonnés prévenus (' + resume(p) + ')');

  // Importants : veille (demain) et matin (aujourd'hui).
  const imp = {
    jalons: [{ date: '2026-10-01', texte: 'Réception', chantier_id: 7, important: true }],
    notes: [{ date: '2026-10-01', texte: 'Appeler le géomètre', chantier_id: null, important: true }],
    taches: [
      { personne_id: 1, date: '2026-10-01', demi: 'matin', texte: 'Grue', chantier_id: 7, important: true },
      { personne_id: 1, date: '2026-10-01', demi: 'aprem', texte: 'Grue', chantier_id: 7, important: true },
      { personne_id: 2, date: '2026-10-01', demi: 'matin', texte: 'Congé', chantier_id: null, important: true, est_absence: true },
      { personne_id: 99, date: '2026-10-01', demi: 'matin', texte: 'Personne cachée', important: true },
      { personne_id: 1, date: '2026-09-30', demi: 'matin', texte: 'Coffrage', chantier_id: 7, important: true }
    ]
  };
  const lignes = L.importantsDuJour('2026-10-01', base(imp));
  verifier(lignes.join(' | ') === 'Jalon — Réception (Padel) | Note — Appeler le géomètre | Marco · absence — Congé | Lionel — Grue (Padel)',
    'importants d’un jour : jalons, notes, puis personnes dans l’ordre du planning ; matin + après-midi = une ligne ; personne masquée ignorée (' + lignes.join(' | ') + ')');
  p = L.planEnvois(base(Object.assign({ abonnements: [{ id: 1, heure_veille: 18, heure_matin: 7, dernier_matin: '2026-09-30' }] }, imp)), zurich('2026-09-30', 18, 5));
  m = p.envois[0] && p.envois[0].message;
  verifier(m && m.tag === 'veille' && m.titre === 'Demain, jeu. 1 oct. : 4 importants' && m.corps.split('\n').length === 4 && JSON.stringify(p.majAbonnements) === '[{"id":1,"derniere_veille":"2026-09-30"}]',
    'veille à 18 h 05 : importants de demain, jour noté (' + JSON.stringify(m) + ')');
  p = L.planEnvois(base(Object.assign({ abonnements: [{ id: 1, heure_veille: 18, derniere_veille: '2026-09-30', dernier_matin: '2026-09-30' }] }, imp)), zurich('2026-09-30', 19));
  verifier(!p.envois.length && !p.majAbonnements.length, 'veille déjà envoyée aujourd’hui : rien de plus');
  p = L.planEnvois(base(Object.assign({ abonnements: [{ id: 1, heure_veille: 18, dernier_matin: '2026-09-30' }] }, imp)), zurich('2026-09-30', 17, 59));
  verifier(!p.envois.length && !p.majAbonnements.length, 'avant l’heure de la veille : rien');
  p = L.planEnvois(base(Object.assign({ abonnements: [{ id: 1, heure_matin: 7, derniere_veille: '2026-10-01' }] }, imp)), zurich('2026-10-01', 7, 1));
  m = p.envois[0] && p.envois[0].message;
  verifier(resume(p) === '1:matin' && m.titre === 'Aujourd’hui : 4 importants', 'matin à 7 h 01 : importants du jour (' + JSON.stringify(m) + ')');
  p = L.planEnvois(base(Object.assign({ abonnements: [{ id: 1, heure_matin: 7, derniere_veille: '2026-10-01' }] }, imp)), zurich('2026-10-01', 11, 30));
  verifier(!p.envois.length && JSON.stringify(p.majAbonnements) === '[{"id":1,"dernier_matin":"2026-10-01"}]', 'matin, mais abonné à 11 h 30 (plus de 4 h après) : rien envoyé, jour noté');
  p = L.planEnvois(base(Object.assign({ abonnements: [{ id: 1, heure_veille: 18, dernier_matin: '2026-09-30', types: { importants: false } }] }, imp)), zurich('2026-09-30', 18, 5));
  verifier(!p.envois.length && p.majAbonnements.length === 1, 'interrupteur « Importants » éteint : rien, le jour est quand même noté');

  // À réserver : le matin, regroupé comme dans l'appli.
  const ar = { aReserver: [
    { personne_id: 1, date: '2026-10-02', texte: 'Pelle', chantier_id: 7, statut_id: 9 },
    { personne_id: 1, date: '2026-10-05', texte: 'Pelle', chantier_id: 7, statut_id: 9 },
    { personne_id: 2, date: '2026-10-01', texte: 'Nacelle', chantier_id: 7, statut_id: 9 },
    { personne_id: 2, date: '2026-10-01', texte: 'Béton', chantier_id: 7, statut_id: 8 },
    { personne_id: 99, date: '2026-10-01', texte: 'Cachée', statut_id: 9 },
    { personne_id: 1, date: '2026-09-29', texte: 'Passée', statut_id: 9 }
  ] };
  const g = L.groupesAReserver(base(ar), '2026-10-01');
  verifier(g.length === 2 && g[0].texte === 'Nacelle' && g[1].du === '2026-10-02' && g[1].au === '2026-10-05', 'à réserver : vendredi + lundi = une tâche ; autre statut, personne masquée et jours passés ignorés (' + JSON.stringify(g.map((x) => [x.texte, x.du, x.au])) + ')');
  p = L.planEnvois(base(Object.assign({ abonnements: [{ id: 1, derniere_veille: '2026-10-01' }, { id: 2, derniere_veille: '2026-10-01', types: { a_reserver: false } }] }, ar)), zurich('2026-10-01', 7, 1));
  m = p.envois[0] && p.envois[0].message;
  verifier(resume(p) === '1:a-reserver' && m.titre === 'À réserver : 2 tâches' && m.corps === 'Jeu. 1 oct. · Marco · Nacelle\nVen. 2 oct. · Lionel · Pelle', 'à réserver le matin, nom du statut en titre ; interrupteur éteint : rien (' + JSON.stringify(m) + ')');
  const beaucoup = { aReserver: Array.from({ length: 7 }, (_, i) => ({ personne_id: 1, date: '2026-10-01', texte: 'T' + i, statut_id: 9 })) };
  p = L.planEnvois(base(Object.assign({ abonnements: [{ id: 1, derniere_veille: '2026-10-01' }] }, beaucoup)), zurich('2026-10-01', 8));
  verifier(p.envois[0].message.corps.split('\n').length === 5 && /… et 3 autres$/.test(p.envois[0].message.corps), '7 lignes : 4 affichées puis « … et 3 autres »');
}

// Service push simulé : navigator.serviceWorker, PushManager, Notification.
function fauxPush(options) {
  return (o) => {
    const faux = { sub: null, desabonne: 0, cle: null, permission: o.permission };
    if (o.dejaAbonne) faux.sub = null; // posé plus bas (fonction)
    const fabriquer = (endpoint) => ({
      endpoint,
      toJSON() { return { endpoint, keys: { p256dh: 'CLE-P256DH', auth: 'CLE-AUTH' } }; },
      unsubscribe() { faux.sub = null; faux.desabonne++; return Promise.resolve(true); }
    });
    if (o.dejaAbonne) faux.sub = fabriquer(o.dejaAbonne);
    const pushManager = {
      getSubscription() { return Promise.resolve(faux.sub); },
      subscribe(opts) { faux.cle = opts.applicationServerKey && opts.applicationServerKey.length; faux.sub = fabriquer('https://push.exemple/cet-appareil'); return Promise.resolve(faux.sub); }
    };
    const ecouteurs = [];
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      ready: Promise.resolve({ pushManager }), register() { return Promise.resolve({}); }, getRegistration() { return Promise.resolve(null); },
      controller: null, addEventListener(t, f) { if (t === 'message') ecouteurs.push(f); }
    } });
    window.PushManager = function () {};
    window.Notification = { permission: faux.permission, requestPermission() { faux.permission = 'granted'; this.permission = 'granted'; return Promise.resolve('granted'); } };
    window.__FAUX_PUSH = faux;
    window.__MESSAGE_SW = (data) => ecouteurs.forEach((f) => f({ data }));
  };
}

async function partieNavigateur(browser, verifier, erreursTout) {
  const autre = { id: 900, endpoint: 'https://push.exemple/telephone', p256dh: 'x', auth: 'y', nom_appareil: 'iPhone · Safari', cree_le: '2026-09-20T08:00:00Z', types: {} };
  // 1. Ordinateur, notifications jamais activées.
  let { page, erreurs } = await ouvrirPlanning(browser, { bd: { abonnements_push: [autre] }, init: fauxPush(), initArg: { permission: 'default' } });
  await page.evaluate(() => afficherPage('notifications-push'));
  await page.waitForTimeout(300);
  let etat = await page.evaluate(() => ({
    onglet: !!document.querySelector('.onglet[data-page="notifications-push"]'), actif: document.getElementById('chkPushActif').checked,
    details: !document.getElementById('pushDetails').hidden, autres: [...document.querySelectorAll('#pushListeAutres .push-appareil-nom')].map((e) => e.textContent)
  }));
  verifier(etat.onglet && !etat.actif && !etat.details && etat.autres.join() === 'iPhone · Safari', 'page Réglages › Notifications : pas encore activée ici, réglages cachés, l’iPhone listé (' + JSON.stringify(etat) + ')');

  await page.click('label[for="chkPushActif"]');
  await page.waitForTimeout(400);
  etat = await page.evaluate(() => {
    const l = (__BD.abonnements_push || []).find((a) => a.endpoint === 'https://push.exemple/cet-appareil');
    return { ligne: l ? { p: l.p256dh, a: l.auth, nom: l.nom_appareil } : null, cle: __FAUX_PUSH.cle, actif: document.getElementById('chkPushActif').checked,
      details: !document.getElementById('pushDetails').hidden, types: [...document.querySelectorAll('#pushDetails input[data-type]')].map((c) => c.dataset.type + '=' + c.checked).join(','),
      veille: document.getElementById('selPushVeille').value, matin: document.getElementById('selPushMatin').value };
  });
  verifier(etat.ligne && etat.ligne.p === 'CLE-P256DH' && etat.ligne.a === 'CLE-AUTH' && etat.cle === 65 && etat.actif && etat.details,
    'activer : permission, abonnement avec la clé VAPID (65 octets), adresse rangée en base (' + JSON.stringify(etat.ligne) + ')');
  verifier(etat.types === 'demandes=true,importants=true,a_reserver=true,modifs=true' && etat.veille === '18' && etat.matin === '7', 'réglages par défaut : les 4 sortes, veille 18 h, matin 7 h (' + etat.types + ' ' + etat.veille + '/' + etat.matin + ')');

  await page.click('label[for="chkPush-modifs"]');
  await page.selectOption('#selPushVeille', '20');
  await page.selectOption('#selPushMatin', '6');
  await page.waitForTimeout(200);
  etat = await page.evaluate(() => { const l = __BD.abonnements_push.find((a) => a.endpoint === 'https://push.exemple/cet-appareil'); return { types: l.types, veille: l.heure_veille, matin: l.heure_matin }; });
  verifier(etat.types.modifs === false && etat.types.demandes === true && etat.veille === 20 && etat.matin === 6, 'interrupteur et heures enregistrés pour cet appareil (' + JSON.stringify(etat) + ')');

  await page.click('#btnPushEssai');
  await page.waitForTimeout(200);
  etat = await page.evaluate(() => __ECRITURES.filter((e) => e.startsWith('fn:envoyer-push')));
  verifier(etat.join() === 'fn:envoyer-push:{"test":"https://push.exemple/cet-appareil"}', 'essai : la fonction envoyer-push est appelée pour cet appareil (' + etat.join() + ')');

  await page.click('#pushListeAutres [data-retirer]');
  await page.waitForTimeout(200);
  etat = await page.evaluate(() => ({ reste: __BD.abonnements_push.map((a) => a.endpoint), cache: document.getElementById('pushAutres').hidden }));
  verifier(etat.reste.join() === 'https://push.exemple/cet-appareil' && etat.cache, '« Retirer » un autre appareil : effacé de la liste et de la base (' + JSON.stringify(etat) + ')');

  await page.click('label[for="chkPushActif"]');
  await page.waitForTimeout(300);
  etat = await page.evaluate(() => ({ lignes: __BD.abonnements_push.length, desabonne: __FAUX_PUSH.desabonne, details: !document.getElementById('pushDetails').hidden }));
  verifier(etat.lignes === 0 && etat.desabonne === 1 && !etat.details, 'désactiver : désabonné du navigateur, ligne effacée, réglages cachés (' + JSON.stringify(etat) + ')');
  erreursTout.push(...erreurs);
  await page.close();

  // 2. Appareil déjà abonné (permission donnée) : ligne remise à l'ouverture.
  ({ page, erreurs } = await ouvrirPlanning(browser, { bd: { abonnements_push: [] }, init: fauxPush(), initArg: { permission: 'granted', dejaAbonne: 'https://push.exemple/deja' } }));
  await page.waitForTimeout(300);
  etat = await page.evaluate(() => (__BD.abonnements_push || []).map((a) => a.endpoint + ' ' + a.nom_appareil));
  verifier(etat.length === 1 && /^https:\/\/push\.exemple\/deja /.test(etat[0]), 'à l’ouverture de l’appli, un appareil abonné remet sa ligne (session) (' + etat.join() + ')');
  // Message du service worker après un clic sur une notification.
  await page.evaluate(() => __MESSAGE_SW({ type: 'ouvrir-notifications' }));
  await page.waitForTimeout(200);
  verifier(await page.evaluate(() => !!document.querySelector('.pop-notifications')), 'clic sur une notification, appli ouverte : fenêtre Notifications ouverte');
  erreursTout.push(...erreurs);
  await page.close();

  // 3. Appli ouverte PAR le clic (#notifications).
  ({ page, erreurs } = await ouvrirPlanning(browser, { query: '#notifications', init: fauxPush(), initArg: { permission: 'default' } }));
  await page.waitForTimeout(400);
  etat = await page.evaluate(() => ({ pop: !!document.querySelector('.pop-notifications'), hash: location.hash }));
  verifier(etat.pop && etat.hash === '', 'appli ouverte par le clic (#notifications) : fenêtre Notifications ouverte, adresse nettoyée (' + JSON.stringify(etat) + ')');
  erreursTout.push(...erreurs);
  await page.close();

  // 4. Navigateur sans notifications (iPhone hors écran d'accueil).
  ({ page, erreurs } = await ouvrirPlanning(browser, { init: (o) => { delete window.PushManager; Object.defineProperty(navigator, 'userAgent', { get: () => o.ua }); }, initArg: { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' } }));
  await page.evaluate(() => afficherPage('notifications-push'));
  await page.waitForTimeout(300);
  etat = await page.evaluate(() => ({ desactive: document.getElementById('chkPushActif').disabled, texte: document.getElementById('pushEtat').textContent }));
  verifier(etat.desactive && /écran d’accueil/.test(etat.texte), 'iPhone dans Safari : interrupteur grisé, explication « écran d’accueil » (' + etat.texte + ')');
  erreursTout.push(...erreurs);
  await page.close();
}

// sw.js : les écouteurs push / notificationclick, exécutés hors navigateur.
async function partieSw(verifier) {
  const ecouteurs = {}, montrees = [], ouvertes = [], messages = [];
  let focus = 0;
  const clients = { liste: [], matchAll() { return Promise.resolve(this.liste); }, openWindow(u) { ouvertes.push(u); return Promise.resolve(); }, claim() { return Promise.resolve(); } };
  const self = {
    location: { origin: 'https://exemple.github.io' }, clients,
    registration: { scope: 'https://exemple.github.io/Planning-chantier/', showNotification(t, o) { montrees.push({ t, o }); return Promise.resolve(); } },
    addEventListener(t, f) { ecouteurs[t] = f; }, skipWaiting() { return Promise.resolve(); }
  };
  new Function('self', 'caches', 'fetch', fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'))(self, {}, () => Promise.reject(new Error('hors ligne')));
  let attente = null;
  ecouteurs.push({ data: { json: () => ({ titre: 'Planning modifié', corps: 'Des changements…', tag: 'modifs' }) }, waitUntil(p) { attente = p; } });
  await attente;
  verifier(montrees.length === 1 && montrees[0].t === 'Planning modifié' && montrees[0].o.tag === 'modifs' && montrees[0].o.renotify && montrees[0].o.body === 'Des changements…',
    'sw.js : message reçu → notification affichée (titre, texte, tag) (' + JSON.stringify(montrees[0]) + ')');
  const clic = (tag) => { let p = null; ecouteurs.notificationclick({ notification: { data: { tag }, close() {} }, waitUntil(x) { p = x; } }); return p; };
  await clic('demandes');
  clients.liste = [{ url: 'https://exemple.github.io/Planning-chantier/', focus() { focus++; return Promise.resolve(); }, postMessage(m) { messages.push(m.type); } }];
  await clic('veille');
  await clic('modifs');
  verifier(ouvertes.join() === 'https://exemple.github.io/Planning-chantier/#notifications' && focus === 2 && messages.join() === 'ouvrir-notifications',
    'sw.js : clic → appli ouverte (#notifications) ou ramenée au premier plan ; fenêtre Notifications pour demandes/importants, pas pour une modification (' + JSON.stringify({ ouvertes, focus, messages }) + ')');
}

(async () => {
  const { verifier, bilan } = verificateur();
  await partieLogique(verifier);
  await partieSw(verifier);
  const browser = await lancerNavigateur(chromium);
  const erreurs = [];
  await partieNavigateur(browser, verifier, erreurs);
  verifier(erreurs.length === 0, 'aucune erreur JS (' + erreurs.join(' | ') + ')');
  await browser.close();
  bilan();
})();
