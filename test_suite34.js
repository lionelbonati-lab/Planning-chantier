const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 34) — trois retours de Lionel :
//   1. « Erreur récurente au démarrage » (« JWT issued at future ») : la
//      requête refusée juste après un renouvellement de session est
//      rejouée toute seule (fetchAvecRejeuJwt_, js/core.js) ;
//   2. « Il reste un horaire qui s'affiche dans la première colonne » :
//      la case de gauche de la ligne M | A est opaque (style.css) ;
//   3. « Sur mobile, éviter que les hauteurs de cellules ne change pendant
//      un changement de jour » : hauteurs figées en vue « 1 jour ». Depuis
//      la suite 35 (« la hauteur pourrait être calculée lors de la fixation
//      du jour »), elles sont mesurées pour le jour POSÉ et restent figées
//      pendant le glissement (figerHauteursJourMobile, js/grille-rendu.js) :
//      ce test garde la stabilité EN PLEIN geste (doigt posé), la
//      remesure à l'arrêt est couverte par test_suite35.js.
//
// Lancer : node test_suite34.js

const T = (id, pid, date, demi, texte, ordre) => ({ id, personne_id: pid, date, demi, ordre: ordre || 0, texte, chantier_id: 1 });
const TACHES = [
  T(1, 1, '2026-09-24', 'matin', 'Gabarits'), T(2, 1, '2026-09-24', 'aprem', 'Armature dalle'),
  T(3, 1, '2026-09-25', 'matin', 'Préparation coffrage dalle niveau 2 côté nord'),
  T(4, 2, '2026-09-23', 'aprem', 'Ouvertures murs', 0), T(5, 2, '2026-09-23', 'aprem', 'Contrôle armature', 1),
  T(6, 2, '2026-09-24', 'matin', 'Gabarits')
];
const HORAIRES = [{ id: 1, date_debut: '2026-09-01', date_fin: '2026-10-31', matin_debut: '07:00', matin_fin: '12:00', aprem_debut: '13:00', aprem_fin: '17:15', pause_matin: 15 }];
const BD = { taches: TACHES, horaires: HORAIRES };
const TELEPHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, bd: BD };

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Rejeu « JWT issued at future » ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD });
    // Faux serveur : les N premiers appels de /essai-<cas> répondent 401.
    const appels = {};
    await page.route(/exemple\.test/, (r) => {
      const cas = new URL(r.request().url()).pathname.slice(1);
      appels[cas] = (appels[cas] || 0) + 1;
      const [message, nbRefus] = { futur: ['JWT issued at future', 1], expire: ['JWT expired', 1], tenace: ['JWT issued at future', 9] }[cas];
      const refus = appels[cas] <= nbRefus;
      r.fulfill({ status: refus ? 401 : 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        body: JSON.stringify(refus ? { code: 'PGRST303', message } : [{ ok: 1 }]) });
    });
    const r = await page.evaluate(async () => {
      // Suite 52 (mode hors ligne) : global.fetch passe d'abord par
      // fetchHorsLigne, qui fait le vrai envoi avec fetchAvecRejeuJwt_.
      const f = window.__OPTIONS_CLIENT && window.__OPTIONS_CLIENT.global && window.__OPTIONS_CLIENT.global.fetch;
      const passe = f === fetchAvecRejeuJwt_ || (typeof fetchHorsLigne === 'function' && /fetchHorsLigne\(entree, options, fetchAvecRejeuJwt_\)/.test(String(f)));
      const t0 = performance.now();
      const futur = await fetchAvecRejeuJwt_('https://exemple.test/futur', { method: 'GET' });
      const duree = performance.now() - t0;
      const corps = await futur.json();
      const expire = await fetchAvecRejeuJwt_('https://exemple.test/expire');
      DELAIS_REJEU_JWT_ = [10, 10, 10];
      const tenace = await fetchAvecRejeuJwt_('https://exemple.test/tenace');
      const tenaceCorps = await tenace.json();
      return { passe, futur: futur.status, corps, duree, expire: expire.status, tenace: tenace.status, tenaceMsg: tenaceCorps.message };
    });
    verifier(r.passe, 'le client Supabase reçoit fetchAvecRejeuJwt_ (global.fetch)');
    verifier(r.futur === 200 && r.corps[0].ok === 1 && appels.futur === 2 && r.duree >= 900, '401 « issued at future » : rejoué 1 s plus tard, la réponse 200 arrive à l\'appelant (' + appels.futur + ' appels, ' + Math.round(r.duree) + ' ms)');
    verifier(r.expire === 401 && appels.expire === 1, 'autre 401 (« JWT expired ») : pas rejoué (' + appels.expire + ' appel)');
    verifier(r.tenace === 401 && appels.tenace === 4 && r.tenaceMsg === 'JWT issued at future', 'refus qui dure : 3 rejeux au plus, puis le 401 est rendu (' + appels.tenace + ' appels)');
    const msg = await page.evaluate(() => { erreurFatale(new Error('JWT issued at future')); return document.querySelector('.error-screen p').textContent; });
    verifier(/Réessaie dans quelques secondes/.test(msg), 'écran d\'erreur : message en français si les rejeux n\'ont pas suffi (' + msg + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. et 3. Téléphone, vue « 1 jour » ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, TELEPHONE);
    await page.waitForTimeout(300);
    const coin = await page.evaluate(() => {
      const c = document.querySelector('.th.coin.th-demi');
      return { opacite: getComputedStyle(c).opacity, fond: getComputedStyle(c).backgroundColor };
    });
    verifier(coin.opacite === '1' && !/rgba\(.*, 0\)|transparent/.test(coin.fond), 'case de gauche de la ligne M | A opaque (opacity ' + coin.opacite + ', fond ' + coin.fond + ')');

    // Hauteurs des lignes à différents moments d'un changement de jour
    // (aimantation coupée pour pouvoir s'arrêter à mi-chemin).
    // Doigt posé pendant tout le relevé (suite 35) : sans lui, l'arrêt du
    // défilement remesurerait les lignes pour le jour atteint.
    const releve = (decalage) => page.evaluate(async (dec) => {
      const s = document.querySelector('.scroller');
      s.dispatchEvent(new TouchEvent('touchstart', { touches: [new Touch({ identifier: 1, target: s, clientX: 200, clientY: 400 })] }));
      s.style.scrollSnapType = 'none';
      const th = document.querySelector('.entete-planning-figee .th.today');
      const grille = document.querySelector('.entete-planning-figee .grille');
      const w = th.getBoundingClientRect().width;
      // Suite 58 : les hauteurs suivent l'événement « scroll », que Chrome
      // sans écran livre parfois après 2 images — on l'attend (300 ms max).
      const defile = new Promise((ok) => { s.addEventListener('scroll', ok, { once: true }); setTimeout(ok, 300); });
      const x = Math.round(th.getBoundingClientRect().left - grille.getBoundingClientRect().left - largeurNoms() + dec * w);
      const bouge = Math.abs(s.scrollLeft - x) >= 1;
      s.scrollLeft = x;
      if (bouge) await defile;
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      // Texte visible au travers de la case de gauche : l'élément au point
      // (60, milieu de la ligne M | A) doit être cette case elle-même.
      const coinDemi = document.querySelector('.th.coin.th-demi').getBoundingClientRect();
      const auPoint = document.elementFromPoint(60, coinDemi.top + coinDemi.height / 2);
      return {
        lignes: [...document.querySelectorAll('.lbl')].map((l) => l.textContent.trim() + '=' + Math.round(l.getBoundingClientRect().height)).join(' '),
        coinDessus: auPoint && auPoint.classList.contains('coin'),
        debord: [...document.querySelectorAll('.scroller .bulle .b-carte')].filter((c) => dec === Math.round(dec) && c.style.display !== 'none' && c.scrollHeight > c.clientHeight + 1).map((c) => c.textContent.trim())
      };
    }, decalage);
    const jeudi = await releve(0);
    const etapes = [];
    for (const d of [-0.25, -0.5, -0.75, -1, 0.5, 1]) etapes.push([d, await releve(d)]);
    // Suite 58 (round du 26.09.2026) — Lionel : « quand une hauteur de
    // bulle change, il faudrait que ce soit progressif, durant le switch ».
    // Les lignes ne restent plus figées sur jeudi le temps du geste : elles
    // vont de la hauteur du jeudi à celle du jour qui arrive, au prorata du
    // chemin parcouru (à ±1,5 px près).
    const lignesEn = (e) => Object.fromEntries(e.lignes.split(' ').map((x) => x.split('=')).map(([k, v]) => [k, +v]));
    const hJeudi = lignesEn(jeudi), hMercredi = lignesEn(etapes.find(([d]) => d === -1)[1]), hVendredi = lignesEn(etapes.find(([d]) => d === 1)[1]);
    etapes.forEach(([d, e]) => {
      const h = lignesEn(e), cible = d < 0 ? hMercredi : hVendredi, f = Math.abs(d);
      const ecarts = Object.keys(hJeudi).filter((k) => Math.abs(h[k] - (hJeudi[k] + (cible[k] - hJeudi[k]) * f)) > 1.5);
      verifier(ecarts.length === 0, 'doigt posé, décalage ' + d + ' jour : hauteurs au prorata entre jeudi et le jour qui arrive (' + e.lignes + ')');
    });
    verifier(hMercredi.Mathis > hJeudi.Mathis + 20, 'doigt posé sur mercredi : la ligne de Mathis y a déjà sa hauteur du mercredi, avant même le lâcher (' + hJeudi.Mathis + ' → ' + hMercredi.Mathis + ')');
    verifier([jeudi].concat(etapes.map((e) => e[1])).every((e) => e.coinDessus), 'la case de gauche de la ligne M | A reste au-dessus des jours qui défilent');
    verifier(jeudi.debord.length === 0, 'jour posé : aucun texte de bulle coupé par la hauteur figée');
    const figees = await page.evaluate(() => [...document.querySelectorAll('.planning-racine .grille, .grille')].filter((g) => g.classList.contains('hauteurs-figees') && g.style.gridTemplateRows).length);
    verifier(figees === 2, 'en-tête et corps : lignes de hauteur figée en vue « 1 jour » (' + figees + ')');
    await page.evaluate(() => document.querySelector('.scroller').dispatchEvent(new TouchEvent('touchend', { touches: [] })));

    // Zoom 80 % : même stabilité.
    await page.evaluate(() => { niveauZoomPlanning = 80; render(false); });
    await page.waitForTimeout(150);
    const z0 = await releve(0), z1 = await releve(-0.5), z2 = await releve(-1);
    verifier(z0.lignes === z1.lignes && z1.lignes === z2.lignes && z0.debord.length === 0, 'zoom 80 % : hauteurs stables pendant le geste, rien de coupé au jour posé (' + z0.lignes + ')');
    await page.evaluate(() => document.querySelector('.scroller').dispatchEvent(new TouchEvent('touchend', { touches: [] })));
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- Ordinateur : rien de figé (vue semaine inchangée) ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD });
    const figees = await page.evaluate(() => document.querySelectorAll('.grille.hauteurs-figees').length);
    verifier(figees === 0, 'ordinateur : aucune hauteur figée (' + figees + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan());
})();
