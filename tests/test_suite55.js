const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur } = require('./aide_tests');

// Round du 26.09.2026 (suite 55). Lionel : « Corrige aussi le mode sombre
// de la barre d'outils ». Les cases blanches de la barre (« Chantier »,
// « Sem. 39 », « 100% », boutons de vue du menu « ⋮ » sur téléphone)
// gardaient le texte var(--ink), presque blanc en mode sombre : blanc sur
// blanc. Vérifie le contraste texte/fond de chacune (4,5:1 au moins, seuil
// WCAG AA), dans les deux modes, et la pastille « aucun chantier ».
//
// Lancer : node test_suite55.js

// Contraste WCAG entre la couleur du texte et le fond de l'élément.
function mesurer(page, selecteurs) {
  return page.evaluate((sels) => {
    const lum = (c) => {
      const m = c.match(/[\d.]+/g).map(Number);
      const v = m.slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    return sels.map((s) => {
      const e = document.querySelector(s);
      if (!e || !e.getBoundingClientRect().width) return { s, absent: true };
      const st = getComputedStyle(e);
      const a = lum(st.color), b = lum(st.backgroundColor);
      return { s, fond: st.backgroundColor, texte: st.color, contraste: Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 10) / 10 };
    });
  }, selecteurs);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  for (const mode of ['dark', 'light']) {
    // Ordinateur : sélecteur de chantier, semaine, zoom.
    {
      const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 700 } });
      await page.emulateMedia({ colorScheme: mode });
      await page.waitForTimeout(200);
      const m = await mesurer(page, ['#btnSelectChantier', '#btnSemainePill', '#btnZoom']);
      m.forEach((x) => verifier(!x.absent && x.fond === 'rgb(255, 255, 255)' && x.contraste >= 4.5,
        mode + ', 1400 px, ' + x.s + ' : case blanche lisible (' + JSON.stringify(x) + ')'));
      const vide = await page.evaluate(() => { const s = document.querySelector('#btnSelectChantier .swatch'); return s.classList.contains('swatch-vide') && getComputedStyle(s).borderTopStyle; });
      verifier(vide === 'dashed', mode + ', 1400 px : aucun chantier choisi → pastille vide en pointillés (' + vide + ')');
      // Un chantier choisi : sa couleur, plus de pointillés.
      await page.click('#btnSelectChantier');
      await page.click('.select-chantier-item[data-chantier], #panneauChantier .select-chantier-item:not(.select-chantier-ajouter)');
      await page.waitForTimeout(200);
      const plein = await page.evaluate(() => { const s = document.querySelector('#btnSelectChantier .swatch'); return !s.classList.contains('swatch-vide') && s.style.background !== ''; });
      verifier(plein, mode + ', 1400 px : chantier choisi → pastille à sa couleur');
      toutesErreurs.push(...erreurs);
      await page.close();
    }
    // Téléphone : menu « ⋮ » (semaine, zoom, boutons de vue).
    {
      const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true });
      await page.emulateMedia({ colorScheme: mode });
      await page.waitForTimeout(200);
      await page.click('#btnPlusOutils');
      await page.waitForTimeout(300);
      const m = await mesurer(page, ['#btnSemainePill', '#btnZoom', '.toolbar-secondaire .ligne-vue-mobile .toolbar-btn']);
      m.forEach((x) => verifier(!x.absent && x.fond === 'rgb(255, 255, 255)' && x.contraste >= 4.5,
        mode + ', 390 px, menu ⋮, ' + x.s + ' : case blanche lisible (' + JSON.stringify(x) + ')'));
      toutesErreurs.push(...erreurs);
      await page.close();
    }
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
