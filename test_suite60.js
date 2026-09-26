const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 26.09.2026 (suite 60). Lionel, sur son téléphone, après la
// suite 59 : « On remarque encore des bulles dans les bordures entre Mathis
// et Antoine. »
// Le trait de 1 px entre deux noms est l'espace de la grille : l'étiquette
// sticky ne le couvrait pas. En vue « 1 jour », la carte de la veille est
// rangée sous la colonne des noms, et son ombre dépassait de 1 px au-dessus
// de sa piste, dans ce trait (idem sous la ligne « Personnel »). Invisible
// à densité 1, nette sur un écran de téléphone (densité 3).
// Vérifie, téléphone 390 px densité 3, vue « 1 jour », sur des semaines
// calquées sur le planning de Lionel (journées entières qui se suivent) :
// la colonne des noms est identique au pixel près avec et sans les bulles,
// au jour posé et doigt posé en plein glissement.
//
// Lancer : node test_suite60.js

const P = (id, nom, st, ordre) => ({ id, nom, sous_traitant: st, ordre, actif: true });
const PERS = [P(1, 'Lionel', false, 1), P(3, 'Mathis', false, 3), P(4, 'Antoine', false, 4), P(5, 'François', false, 5), P(2, 'Béton/Armature', true, 2), P(8, 'Echafaudage', true, 7)];
let tid = 1;
const TACHES = [];
const JOUR = (pid, date, texte, ch, extra) => ['matin', 'aprem'].forEach((demi) => TACHES.push(Object.assign({ id: tid++, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: ch }, extra || {})));
const TEXTES = { '2026-09-21': 'Décoffrage tours de dalle, et piliers', '2026-09-22': 'Coffrage murs étage', '2026-09-23': 'Descendre matériel coffrage de dalle', '2026-09-24': 'Fermeture + pont murs étage', '2026-09-25': 'Bétonnage mur étage' };
for (const p of [1, 3, 4, 5]) for (const d in TEXTES) {
  if (p === 3 && d === '2026-09-25') JOUR(p, d, '80%', null, { est_absence: true });
  else JOUR(p, d, TEXTES[d], d === '2026-09-23' ? 2 : 1);
}
JOUR(2, '2026-09-21', 'Livraison armature murs étage', 1);
JOUR(8, '2026-09-23', 'Echafaudage pour mur M4 étage', 1);

let horloge = Date.parse('2026-09-24T10:00:00');
(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 760 }, hasTouch: true, dpr: 3, bd: { personnes: PERS, taches: TACHES } });
  await page.waitForTimeout(500);
  const decodeur = await browser.newPage();

  // Colonne des noms avec puis sans les bulles (visibility:hidden, la mise
  // en page ne bouge pas) : le nombre de pixels d'écran qui diffèrent.
  const fuites = async () => {
    const zone = await page.evaluate(() => {
      const g = document.querySelector('.scroller').getBoundingClientRect();
      return { x: 0, y: Math.max(0, g.top), width: largeurNoms(), height: Math.min(innerHeight, g.bottom) - Math.max(0, g.top) };
    });
    const avec = await page.screenshot({ clip: zone });
    await page.addStyleTag({ content: '.scroller .bulle { visibility: hidden !important; }' }).then((h) => h.evaluate((s) => s.setAttribute('id', '__sans')));
    const sans = await page.screenshot({ clip: zone });
    await page.evaluate(() => document.getElementById('__sans').remove());
    return decodeur.evaluate(async ([a, b]) => {
      const lire = async (b64) => {
        const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        return x.getImageData(0, 0, c.width, c.height).data;
      };
      const p = await lire(a), q = await lire(b);
      let n = 0;
      for (let k = 0; k < p.length; k += 4) if (Math.abs(p[k] - q[k]) + Math.abs(p[k + 1] - q[k + 1]) + Math.abs(p[k + 2] - q[k + 2]) > 6) n++;
      return n;
    }, [avec.toString('base64'), sans.toString('base64')]);
  };
  const jour = () => page.evaluate(() => {
    const t = [...document.querySelectorAll('.th-date')].find((x) => { const r = x.getBoundingClientRect(); return r.left > largeurNoms() && r.right < innerWidth; });
    return t ? t.textContent.trim() : '?';
  });
  // Glissé au doigt sur la ligne vide d'Echafaudage le jeudi ; relevé
  // doigt encore posé (à mi-chemin), puis une fois le jour posé.
  const glisser = async (dx) => {
    horloge += 1000; await page.clock.setFixedTime(new Date(horloge));
    const de = await page.evaluate(() => {
      const l = [...document.querySelectorAll('.scroller .lbl')].find((x) => x.textContent.includes('Echafaudage')).getBoundingClientRect();
      return { x: 300, y: l.top + l.height / 2 };
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [de] });
    for (let i = 1; i <= 6; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: de.x + dx * i / 6, y: de.y }] });
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(100);
    const enCours = await fuites();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(900);
    return enCours;
  };

  const releves = [['jeudi posé', await jour(), await fuites()]];
  for (const dx of [150, 150, -150, -150, -150]) {
    const enCours = await glisser(dx);
    const j = await jour();
    releves.push(['doigt posé vers le ' + j, j, enCours], ['posé', j, await fuites()]);
  }
  const jours = releves.filter((r) => r[0] === 'posé').map((r) => r[1]);
  verifier(jours.join(' ') === '23 22 23 24 25', 'le glissé change bien de jour (' + jours.join(' ') + ')');
  for (const [quand, j, n] of releves) verifier(n === 0, quand + (quand === 'posé' ? ' (' + j + ')' : '') + ' : colonne des noms identique avec et sans les bulles (' + n + ' pixels différents)');

  verifier(erreurs.length === 0, 'aucune erreur JS (' + erreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan());
})();
