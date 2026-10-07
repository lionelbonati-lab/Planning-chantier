const { chromium } = require('playwright');
const path = require('path');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 07.10.2026 (suite 143). Lionel : « J'aimerai pouvoir envoyer le
// planning à mon responsable, en lecture seul. » Ses choix : « Lien sans
// connexion » ; personnel et équipes plus « Jalons, Notes, Machines et
// transports, Intervenants » ; « Vue simplifiée » ; « Surtout
// l'ordinateur » ; « Dans le menu Réglages » ; « Un lien par personne » ;
// congés « Le texte complet » ; période « Moins loin » (semaine en cours +
// 4 suivantes).
// Vérifie :
//   A. Réglages › Liens responsables (js/page-liens-responsables.js) :
//      liens relus (nom, adresse responsable.html?j=…, dernière
//      consultation) ; « Créer le lien » grisé sans nom, puis ligne en
//      base (nom, jeton de 32 caractères hexadécimaux) ; « Nouveau lien »
//      et « Supprimer » après confirmation, chacun sur SON lien ;
//      téléphone sans débordement.
//   B. responsable.html (js/responsable.js) : un seul appel
//      consultation_responsable (jeton, lundi) ; lignes dans l'ordre de
//      l'appli (Jalons, Notes, Transports, sections selon ordre_groupes,
//      Machines sans titre ; suite 144 : plus d'équipe, réponse de
//      sql/0039 — la tâche d'équipe arrive sur le membre) ; bulles identiques qui se suivent fusionnées,
//      bulles d'une case empilées ; congé en texte complet ; week-end
//      seulement s'il est occupé ; ‹ › bornés par min / max ; lien
//      supprimé, lien incomplet ; téléphone : la grille défile seule.
//
// Lancer : node test_suite143.js

const JETON = '0123456789abcdef0123456789abcdef';
const MIN = '2026-10-05', MAX = '2026-11-02';

function plus(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function semaine(lundi, opts) {
  opts = opts || {};
  const p = (n) => plus(lundi, n);
  const t = (personne, n, demi, texte, o) => Object.assign({ personne, date: p(n), demi, ordre: 0, texte, important: false, absence: false,
    chantier: 'Villa Lac', couleur: '#cfe8c9', statut: null, couleur_statut: null }, o || {});
  return {
    nom: 'Responsable', lundi, aujourdhui: '2026-10-07', min: MIN, max: MAX,
    personnes: [
      { id: 16, nom: 'Transports', section: 'transports' },
      { id: 1, nom: 'Marco', section: 'personnel' }, { id: 3, nom: 'Luis', section: 'personnel' },
      { id: 5, nom: 'Jean', section: 'personnel' }, { id: 7, nom: 'Sami', section: 'personnel' },
      { id: 18, nom: 'Machines', section: 'groupe-1' },
      { id: 2, nom: 'Électricité Dubois', section: 'intervenants' }
    ],
    groupes: [{ id: 1, nom: 'Machines' }],
    ordre_groupes: opts.ordre || ['personnel', 'groupe-1', 'intervenants'],
    taches: [
      t(1, 0, 'matin', 'Coffrage dalle'), t(1, 0, 'aprem', 'Coffrage dalle'), t(1, 1, 'matin', 'Coffrage dalle'),
      t(1, 1, 'aprem', 'Ferraillage'),
      t(3, 3, 'matin', 'Congé - Mariage', { absence: true, chantier: null, couleur: null }),
      t(3, 3, 'aprem', 'Congé - Mariage', { absence: true, chantier: null, couleur: null }),
      t(5, 0, 'matin', 'Maçonnerie', { chantier: 'Immeuble Gare', couleur: '#f6d7a7' }),
      t(5, 0, 'matin', 'Livraison briques', { chantier: 'Immeuble Gare', couleur: '#f6d7a7', ordre: 1 }),
      t(16, 1, 'matin', 'Ciment - 20 sacs'),
      t(18, 2, 'matin', 'Karcher - Décoffrage'),
      t(2, 3, 'aprem', 'Tirage câbles', { statut: 'Réservé', couleur_statut: '#ffd34d' })
    ].concat(opts.samedi ? [t(5, 5, 'matin', 'Nettoyage')] : []),
    jalons: [{ date: p(4), demi: null, texte: 'Réception dalle', important: true, chantier: 'Villa Lac', couleur: '#cfe8c9' }],
    notes: [{ date: p(1), demi: 'matin', texte: 'Réunion chantier 8h', important: false, chantier: null, couleur: null }],
    feries: [], horaires: [{ debut: '2026-01-01', fin: '2026-12-31', matin: '07:00–12:00', aprem: '13:00–17:00' }]
  };
}

async function ouvrirResponsable(browser, opts) {
  const page = await browser.newPage({ viewport: opts.viewport || { width: 1400, height: 900 }, hasTouch: !!opts.hasTouch });
  const erreurs = [], appels = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await page.route(/\/rest\/v1\/rpc\//, async (r) => {
    const corps = JSON.parse(r.request().postData() || '{}');
    appels.push({ url: r.request().url(), corps, entetes: r.request().headers() });
    if (corps.p_jeton !== JETON) return r.fulfill({ contentType: 'application/json', body: 'null' });
    let lundi = corps.p_lundi || MIN;
    if (lundi < MIN) lundi = MIN;
    if (lundi > MAX) lundi = MAX;
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(semaine(lundi, opts)) });
  });
  await page.goto('file://' + path.join(__dirname, '..', 'responsable.html') + (opts.query != null ? opts.query : '?j=' + JETON));
  await page.waitForTimeout(400);
  return { page, erreurs, appels };
}

const lireGrille = (page) => page.evaluate(() => {
  const g = document.querySelector('.grille');
  if (!g) return null;
  const lignes = [...g.querySelectorAll('.nom, .titre-section')].map((n) => n.classList.contains('titre-section') ? '#' + n.textContent
    : n.firstChild.textContent + (n.querySelector('small') ? '(' + n.querySelector('small').textContent + ')' : ''));
  const bulles = [...g.querySelectorAll('.bulle')].map((b) => ({ texte: b.querySelector('.texte').textContent, col: b.style.gridColumn, row: b.style.gridRow,
    classe: b.className, details: (b.querySelector('.details') || {}).textContent || '' }));
  return {
    lignes, bulles,
    jours: [...g.querySelectorAll('.tete-jour')].map((j) => j.firstChild.textContent),
    titre: document.getElementById('titreSemaine').textContent,
    boutons: ['btnPrecedente', 'btnSuivante', 'btnAujourdhui'].map((id) => document.getElementById(id).disabled ? 'off' : 'on').join(','),
    deborde: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    cadreDefile: (() => { const c = document.querySelector('.cadre'); return c.scrollWidth > c.clientWidth; })()
  };
});

(async () => {
  const { verifier, bilan } = verificateur();
  const browser = await lancerNavigateur(chromium);
  const erreurs = [];

  // ---- A. Réglages › Liens responsables -----------------------------------
  {
    const LIENS = [
      { id: 1, nom: 'Responsable', jeton: 'aa'.repeat(16), cree_le: '2026-10-01T08:00:00Z', vu_le: '2026-10-06T07:05:00Z' },
      { id: 2, nom: 'Patron', jeton: 'bb'.repeat(16), cree_le: '2026-10-02T08:00:00Z', vu_le: null }
    ];
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 1280, height: 900 }, bd: { liens_responsables: LIENS.map((l) => Object.assign({}, l)) } });
    const onglet = await page.evaluate(() => PAGES_REGLAGES.some((r) => r.page === 'liens-responsables' && r.nom === 'Liens responsables') &&
      !!document.querySelector('.onglet[data-page="liens-responsables"]'));
    await page.evaluate(() => afficherPage('liens-responsables'));
    await page.waitForTimeout(300);
    const lire = () => page.evaluate(() => [...document.querySelectorAll('.lien-responsable')].map((c) => ({
      nom: c.querySelector('.lr-titre').textContent, url: c.querySelector('.lr-url').value, vu: c.querySelector('.lr-vu').textContent,
      ouvrir: c.querySelector('a.btn-calculer').getAttribute('href')
    })));
    let cartes = await lire();
    verifier(onglet, 'onglet « Liens responsables » dans le menu Réglages');
    verifier(cartes.length === 2 && cartes[0].nom === 'Responsable' && /\/responsable\.html\?j=(aa){16}$/.test(cartes[0].url) && cartes[0].ouvrir === cartes[0].url &&
      /^Dernière consultation : .+, \d\d:\d\d\.$/.test(cartes[0].vu) && cartes[1].nom === 'Patron' && cartes[1].vu === 'Pas encore ouvert.',
      'liens relus : nom, adresse responsable.html?j=…, « Ouvrir », dernière consultation (' + JSON.stringify(cartes) + ')');

    const grise = await page.evaluate(() => document.getElementById('btnCreerLienResponsable').disabled);
    await page.fill('#nomLienResponsable', '  Chef de projet ');
    const allume = await page.evaluate(() => !document.getElementById('btnCreerLienResponsable').disabled);
    await page.press('#nomLienResponsable', 'Enter');
    await page.waitForTimeout(250);
    const nouveau = await page.evaluate(() => __BD.liens_responsables.find((l) => l.nom === 'Chef de projet'));
    cartes = await lire();
    verifier(grise && allume && nouveau && /^[0-9a-f]{32}$/.test(nouveau.jeton) && cartes.length === 3 && cartes[2].nom === 'Chef de projet' &&
      cartes[2].url.endsWith('?j=' + nouveau.jeton) && await page.inputValue('#nomLienResponsable') === '',
      '« Créer le lien » grisé sans nom ; Entrée : ligne en base (nom, jeton 32 hex), carte ajoutée, case vidée (' + JSON.stringify(nouveau) + ')');

    await page.click('.lien-responsable[data-id="1"] [data-action="nouveau"]');
    await page.waitForTimeout(150);
    await page.click('.confirm-pop .c-ok');
    await page.waitForTimeout(250);
    const apres = await page.evaluate(() => __BD.liens_responsables.map((l) => ({ id: l.id, jeton: l.jeton, vu_le: l.vu_le })));
    cartes = await lire();
    const l1 = apres.find((l) => l.id === 1), l2 = apres.find((l) => l.id === 2);
    verifier(l1.jeton !== 'aa'.repeat(16) && /^[0-9a-f]{32}$/.test(l1.jeton) && l1.vu_le === null && l2.jeton === 'bb'.repeat(16) &&
      cartes[0].url.endsWith('?j=' + l1.jeton) && cartes[0].vu === 'Pas encore ouvert.',
      '« Nouveau lien » + confirmation : nouveau jeton pour CE lien seulement, dernière consultation remise à zéro (' + JSON.stringify(apres) + ')');

    await page.click('.lien-responsable[data-id="2"] [data-action="supprimer"]');
    await page.waitForTimeout(150);
    await page.click('.confirm-pop .c-ok');
    await page.waitForTimeout(250);
    const restent = await page.evaluate(() => __BD.liens_responsables.map((l) => l.nom).join(','));
    cartes = await lire();
    verifier(restent === 'Responsable,Chef de projet' && cartes.map((c) => c.nom).join(',') === restent,
      '« Supprimer » + confirmation : seul ce lien disparaît (' + restent + ')');
    erreurs.push(...e);
    await page.close();
  }
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true,
      bd: { liens_responsables: [{ id: 1, nom: 'Responsable', jeton: 'cd'.repeat(16), cree_le: '2026-10-01T08:00:00Z', vu_le: null }] } });
    await page.evaluate(() => afficherPage('liens-responsables'));
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({
      deborde: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      carte: Math.round(document.querySelector('.lien-responsable').getBoundingClientRect().right),
      police: getComputedStyle(document.getElementById('nomLienResponsable')).fontSize
    }));
    verifier(!m.deborde && m.carte <= 390 && m.police === '16px', 'téléphone : rien ne déborde, nom en 16 px (' + JSON.stringify(m) + ')');
    erreurs.push(...e);
    await page.close();
  }

  // ---- B. responsable.html -----------------------------------------------
  {
    const { page, erreurs: e, appels } = await ouvrirResponsable(browser, {});
    let g = await lireGrille(page);
    const a = appels[0] || { corps: {}, entetes: {} };
    verifier(appels.length === 1 && /\/rest\/v1\/rpc\/consultation_responsable$/.test(a.url) && a.corps.p_jeton === JETON && a.corps.p_lundi === null &&
      /^Bearer ey/.test(a.entetes.authorization || ''),
      'un seul appel consultation_responsable (jeton, lundi null), clé publique (' + JSON.stringify(a.corps) + ')');
    verifier(g && g.lignes.join(' / ') === 'Jalons / Notes / Transports / #Personnel / Marco / Luis / Jean / Sami / Machines / #Intervenants / Électricité Dubois',
      'lignes : Jalons, Notes, Transports, Personnel, Machines sans titre, Intervenants (' + (g && g.lignes.join(' / ')) + ')');
    verifier(g.jours.join(',') === 'Lundi 5 oct.,Mardi 6 oct.,Mercredi 7 oct.,Jeudi 8 oct.,Vendredi 9 oct.' && g.titre === 'Semaine 415 oct. – 9 oct. 2026' && g.boutons === 'off,on,off',
      'lundi → vendredi (week-end vide caché), semaine 41, ‹ et « Auj. » grisés sur la semaine en cours (' + g.jours.join(',') + ' ; ' + g.titre + ' ; ' + g.boutons + ')');
    const b = (texte) => g.bulles.filter((x) => x.texte.replace(/^⚑ /, '') === texte);
    const coffrage = b('Coffrage dalle'), jean = [b('Maçonnerie')[0], b('Livraison briques')[0]], conge = b('Congé - Mariage'), jalon = b('Réception dalle')[0];
    verifier(coffrage.length === 1 && coffrage[0].col === '2 / 5' && b('Ferraillage')[0].col === '5 / 6',
      'bulles identiques qui se suivent fusionnées : « Coffrage dalle » lundi → mardi matin d’une seule bulle (' + JSON.stringify(coffrage) + ')');
    verifier(jean[0].col === '2 / 3' && jean[1].col === '2 / 3' && Number(jean[1].row) === Number(jean[0].row) + 1,
      'deux bulles dans la même case : empilées (' + JSON.stringify(jean) + ')');
    verifier(conge.length === 1 && /absence/.test(conge[0].classe) && conge[0].col === '8 / 10',
      'congé en texte complet « Congé - Mariage », hachuré, jeudi entier (' + JSON.stringify(conge) + ')');
    verifier(jalon && jalon.col === '10 / 12' && /jalon/.test(jalon.classe) && jalon.details === 'Villa Lac' &&
      b('Tirage câbles')[0].details === 'Villa LacRéservé' && /neutre/.test(b('Réunion chantier 8h')[0].classe),
      'jalon d’une journée sur matin + après-midi, chantier et statut affichés, note sans chantier en fond neutre');

    await page.click('#btnSuivante');
    await page.waitForTimeout(300);
    g = await lireGrille(page);
    verifier(appels[appels.length - 1].corps.p_lundi === '2026-10-12' && g.titre.indexOf('Semaine 42') === 0 && g.boutons === 'on,on,on',
      '› : semaine suivante demandée (2026-10-12), ‹ et « Auj. » rallumés (' + g.titre + ' ; ' + g.boutons + ')');
    for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250); }
    g = await lireGrille(page);
    const demandes = appels.map((x) => x.corps.p_lundi).join(',');
    verifier(g.titre.indexOf('Semaine 45') === 0 && g.boutons === 'on,off,on' && demandes === ',2026-10-12,2026-10-19,2026-10-26,2026-11-02',
      'flèche → du clavier jusqu’à la 4e semaine suivante, puis › grisé et plus rien demandé (' + demandes + ' ; ' + g.boutons + ')');
    await page.click('#btnAujourdhui');
    await page.waitForTimeout(300);
    g = await lireGrille(page);
    verifier(appels[appels.length - 1].corps.p_lundi === MIN && g.titre.indexOf('Semaine 41') === 0, '« Auj. » revient à la semaine en cours');
    erreurs.push(...e);
    await page.close();
  }
  {
    const { page, erreurs: e } = await ouvrirResponsable(browser, { samedi: true, ordre: ['intervenants', 'personnel'] });
    const g = await lireGrille(page);
    verifier(g.jours.length === 6 && g.jours[5] === 'Samedi 10 oct.' && g.lignes.slice(3, 5).join(' / ') === '#Intervenants / Électricité Dubois' &&
      g.lignes[g.lignes.length - 1] === 'Machines',
      'samedi occupé : affiché ; ordre_groupes suivi (Intervenants avant Personnel, Machines absent du réglage à la fin) (' + g.lignes.join(' / ') + ')');
    erreurs.push(...e);
    await page.close();
  }
  {
    const { page, erreurs: e } = await ouvrirResponsable(browser, { query: '?j=ffffffffffffffffffffffffffffffff' });
    const m = await page.evaluate(() => ({ texte: document.getElementById('contenu').textContent, boutons: [...document.querySelectorAll('.nav button')].every((b) => b.disabled) }));
    verifier(/Ce lien ne marche plus\./.test(m.texte) && m.boutons, 'lien supprimé ou renouvelé (null) : « Ce lien ne marche plus. », navigation grisée');
    erreurs.push(...e);
    await page.close();
  }
  {
    const { page, erreurs: e, appels } = await ouvrirResponsable(browser, { query: '?j=abc' });
    const texte = await page.evaluate(() => document.getElementById('contenu').textContent);
    verifier(/Lien incomplet\./.test(texte) && appels.length === 0, 'lien coupé (jeton trop court) : « Lien incomplet. », aucun appel');
    erreurs.push(...e);
    await page.close();
  }
  {
    const { page, erreurs: e } = await ouvrirResponsable(browser, { viewport: { width: 390, height: 844 }, hasTouch: true });
    const g = await lireGrille(page);
    const noms = await page.evaluate(() => getComputedStyle(document.querySelector('.nom')).position);
    verifier(!g.deborde && g.cadreDefile && noms === 'sticky', 'téléphone : la page ne déborde pas, la grille défile seule, noms collés à gauche');
    erreurs.push(...e);
    await page.close();
  }

  verifier(erreurs.length === 0, 'aucune erreur JS (' + erreurs.join(' | ') + ')');
  await browser.close();
  process.exitCode = bilan();
})();
