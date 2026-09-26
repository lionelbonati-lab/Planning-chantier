const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur } = require('./aide_tests');

// Round du 26.09.2026 (suite 56). Lionel : « Sélection des couleurs, enlève
// les descriptions des couleurs. Cela allonge la liste pour aucune plus
// value. » Fenêtre « Personnaliser » (Général) : chaque ligne = le nom, les
// 2 champs et ↺, sans description ni « Clair »/« Sombre » répétés ; ces
// deux mots une seule fois en tête de liste, collés en haut quand elle
// défile, pile au-dessus des champs. Téléphone et ordinateur, deux modes.
//
// Lancer : node test_suite56.js

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  for (const [largeur, hauteur, tactile] of [[390, 844, true], [1400, 900, false]]) {
    for (const mode of ['light', 'dark']) {
      const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: hauteur }, hasTouch: tactile });
      await page.emulateMedia({ colorScheme: mode });
      const lieu = largeur + ' px, ' + mode;
      // Sur téléphone les onglets sont dans un menu : clic direct, comme test_suite54.
      await page.evaluate(() => afficherPage('couleurs')); // suite 61 : ex-onglet Général
      await page.click('#btnPersonnaliserCouleurs');
      await page.waitForSelector('.couleurs-modal .reglage-couleurs-groupe');
      await page.waitForTimeout(200);

      const m = await page.evaluate(() => {
        const pop = document.querySelector('.couleurs-modal');
        const lignes = [...pop.querySelectorAll('.cm-liste .reglage-couleurs-groupe')];
        const centre = (e) => { const r = e.getBoundingClientRect(); return Math.round(r.left + r.width / 2); };
        const cols = [...pop.querySelectorAll('.cm-colonnes .reglage-couleur-paire')];
        return {
          lignes: lignes.length,
          // Texte de chaque ligne = son nom seul.
          textes: lignes.map((l) => l.querySelector('.reglage-texte').textContent === l.querySelector('.reglage-texte b').textContent && !l.querySelector('.reglage-texte span')),
          nomsDuCode: lignes.every((l) => l.querySelector('.reglage-texte b').textContent === GROUPES_COULEURS.find((g) => g.id === l.dataset.groupe).nom),
          sansDescription: GROUPES_COULEURS.every((g) => !('description' in g)),
          mots: lignes.map((l) => l.textContent).filter((t) => /clair|sombre/i.test(t)).length,
          phrase: !!pop.querySelector('.cm-liste .page-sous'),
          entete: cols.map((c) => c.textContent).join('|'),
          hauteurs: lignes.map((l) => Math.round(l.getBoundingClientRect().height)),
          alignes: lignes.every((l) => { const i = l.querySelectorAll('input[type="color"]'); return Math.abs(centre(i[0]) - centre(cols[0])) <= 1 && Math.abs(centre(i[1]) - centre(cols[1])) <= 1; }),
          aria: lignes[0].querySelector('.rc-clair').getAttribute('aria-label') + ' / ' + lignes[0].querySelector('.rc-sombre').getAttribute('aria-label'),
          dehors: lignes.filter((l) => l.scrollWidth > l.clientWidth + 1).length
        };
      });
      verifier(m.lignes === 17 && m.textes.every(Boolean) && m.nomsDuCode && m.sansDescription, lieu + ' : 17 lignes, chacune avec son nom seul, sans description (' + m.lignes + ')');
      verifier(m.mots === 0 && m.entete === 'Clair|Sombre' && !m.phrase, lieu + ' : « Clair »/« Sombre » une seule fois en tête, plus de phrase d\'explication (' + m.entete + ', ' + m.mots + ' ligne(s) avec ces mots)');
      verifier(Math.max(...m.hauteurs) <= 52 && m.dehors === 0, lieu + ' : lignes basses (' + Math.max(...m.hauteurs) + ' px max), rien ne déborde');
      verifier(m.alignes, lieu + ' : « Clair » et « Sombre » pile au-dessus de leurs champs');
      verifier(m.aria === 'Couleur principale de l\'appli, mode clair / Couleur principale de l\'appli, mode sombre', lieu + ' : champs nommés pour les lecteurs d\'écran (' + m.aria + ')');

      // L'entête reste en haut quand la liste défile.
      const colle = await page.evaluate(() => {
        const liste = document.querySelector('.couleurs-modal .cm-liste');
        liste.scrollTop = liste.scrollHeight;
        const h = document.querySelector('.cm-colonnes').getBoundingClientRect(), l = liste.getBoundingClientRect();
        return { defile: liste.scrollTop > 0, ecart: Math.round(h.top - l.top) };
      });
      verifier(colle.defile && colle.ecart === 0, lieu + ' : liste défilée, « Clair »/« Sombre » restent en haut (' + JSON.stringify(colle) + ')');

      // Les champs marchent toujours : la couleur choisie s'applique.
      await page.evaluate(() => {
        const i = document.querySelector('.couleurs-modal .rc-clair[data-groupe="weekend"]');
        i.value = '#abcdef';
        i.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const champ = await page.evaluate(() => document.querySelector('.couleurs-modal .rc-clair[data-groupe="weekend"]').value);
      verifier(champ === '#abcdef', lieu + ' : un champ de la liste se règle toujours (' + champ + ')');
      toutesErreurs.push(...erreurs);
      await page.close();
    }
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
