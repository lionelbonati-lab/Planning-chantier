const { chromium } = require('playwright');

// Round du 24.09.2026 — Lionel : « Les couleurs devrait être les mêmes sur
// tous les appareils du même compte. Comme les chantiers. » js/page-
// couleurs.js passe du localStorage (par appareil) a une vraie table
// Supabase `couleurs_perso`, sur le meme modele que chantiers/statuts :
// window.etat.couleursPerso (rempli par js/donnees-sync.js au demarrage)
// devient la source de verite, le localStorage ne restant qu'un cache
// anti-flash. Ce test verifie les 3 aspects qui ne peuvent pas se voir sur
// un seul appareil isole :
//  1. une couleur deja connue du "serveur" (etat.couleursPerso, simule ici)
//     est appliquee ET affichee dans les champs de la page Couleurs, meme
//     si le localStorage local ne la connait pas encore ;
//  2. changer une couleur sur CET appareil ecrit bien sur `couleurs_perso`
//     (verifie via un espion pose SUR LE CLIENT SUPABASE DEJA CREE — pas
//     via addInitScript, qui serait de toute facon ecrase par le stub
//     Supabase inline de index.html, lui-meme execute apres) ;
//  3. sans reponse serveur du tout (etat.couleursPerso absent), l'appli
//     retombe sur le dernier cache local connu (anti-flash), pas sur les
//     couleurs par defaut du code.

const INSTALLER_ESPION = function () {
  window.__spy = { upserts: [], deletes: [] };
  var from0 = sbClient.from.bind(sbClient);
  sbClient.from = function (nomTable) {
    if (nomTable !== 'couleurs_perso') return from0(nomTable);
    return {
      select: function () { return from0(nomTable).select.apply(null, arguments); },
      upsert: function (payload, opts) {
        window.__spy.upserts.push({ table: nomTable, payload: payload, opts: opts });
        return { then: function (resolve) { return Promise.resolve(resolve({ data: [payload], error: null })); } };
      },
      delete: function () {
        var c = {};
        c.eq = function (col, val) { window.__spy.deletes.push({ table: nomTable, col: col, val: val }); return c; };
        c.in = function (col, vals) { window.__spy.deletes.push({ table: nomTable, col: col, vals: vals }); return c; };
        c.then = function (resolve) { return Promise.resolve(resolve({ data: [], error: null })); };
        return c;
      }
    };
  };
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const erreurs = [];
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + String(e && e.stack || e)));
  page.on('console', (msg) => { if (msg.type() === 'error') erreurs.push('console: ' + msg.text()); });
  await page.goto('file:///home/claude/work/testenv/index.html');
  await page.waitForTimeout(150);
  await page.evaluate(INSTALLER_ESPION); // pose l'espion SUR sbClient deja cree par core.js, pas avant

  // --- 1. Couleur deja connue du "serveur" (autre appareil) ---
  await page.evaluate(() => {
    localStorage.removeItem('planning.couleurs'); // ce PC n'a jamais rien enregistre localement
    etat.couleursPerso = { principale: { clair: '#112233', sombre: null } }; // simule la reponse Supabase
    appliquerCouleursPersonnalisees();
  });
  const accentApresServeur = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  console.log('--accent applique depuis etat.couleursPerso (simule "autre appareil") :', accentApresServeur, '- ok ?', accentApresServeur === '#112233');

  // Construit la page Couleurs dans un conteneur, comme le ferait coquille.js.
  await page.evaluate(() => {
    var zone = document.createElement('div');
    zone.id = 'zoneTestCouleurs';
    zone.innerHTML = htmlReglagesCouleurs('general');
    document.body.appendChild(zone);
    initReglagesCouleurs();
  });
  const champPrincipaleClair = await page.evaluate(() => document.querySelector('.rc-clair[data-groupe="principale"]').value);
  console.log('Champ "principale/clair" affiche la valeur venue du serveur (pas le defaut du code) :', champPrincipaleClair, '- ok ?', champPrincipaleClair === '#112233');

  // --- 2. Changer une couleur sur CET appareil -> ecrit sur couleurs_perso ---
  await page.evaluate(() => {
    var input = document.querySelector('.rc-clair[data-groupe="fond"]');
    input.value = '#aabbcc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const bgImmediat = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  console.log('Apercu CSS immediat (avant meme l ecriture serveur) :', bgImmediat, '- ok ?', bgImmediat === '#aabbcc');
  await page.waitForTimeout(600); // > 400ms de debounce
  const spyApres = await page.evaluate(() => window.__spy);
  const upsertFond = spyApres.upserts.find((u) => u.table === 'couleurs_perso' && u.payload.id === 'fond');
  console.log('Ecriture Supabase differee (couleurs_perso, id=fond, clair=#aabbcc) :', JSON.stringify(upsertFond), '- ok ?', !!upsertFond && upsertFond.payload.clair === '#aabbcc' && !('sombre' in upsertFond.payload));

  // --- Reinitialisation -> DELETE cote serveur ---
  await page.evaluate(() => {
    document.querySelector('.reglage-couleur-reset[data-groupe="fond"]').click();
  });
  const spyApresReset = await page.evaluate(() => window.__spy);
  const deleteFond = spyApresReset.deletes.find((d) => d.table === 'couleurs_perso' && d.col === 'id' && d.val === 'fond');
  console.log('Reinitialisation -> DELETE Supabase (couleurs_perso, id=fond) :', JSON.stringify(deleteFond), '- ok ?', !!deleteFond);

  // --- 3. Aucune reponse serveur du tout -> repli sur le cache local ---
  await page.evaluate(() => {
    localStorage.setItem('planning.couleurs', JSON.stringify({ principale: { clair: '#654321' } }));
    delete etat.couleursPerso; // "avant que le serveur ait repondu" / hors-ligne
    appliquerCouleursPersonnalisees();
  });
  const accentHorsLigne = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  console.log('Sans etat.couleursPerso, repli sur le cache local (#654321, pas le defaut du code) :', accentHorsLigne, '- ok ?', accentHorsLigne === '#654321');

  console.log('ERREURS JS:', JSON.stringify(erreurs, null, 2));
  await browser.close();
})();
