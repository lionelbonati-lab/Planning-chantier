const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 99). Lionel : « Ne serait-il pas plus
// judicieux de faire 2 application différente pour portable et pour
// deskop? », puis « Allons-y » au plan proposé : une seule appli,
// l'affichage du planning découpé en commun / ordinateur / téléphone.
// Étape 1 : les fonctions imbriquées dans construireGrille (js/grille-
// rendu.js) en sortent ; ce qu'elles lisaient par fermeture leur arrive
// dans G (l'objet du rendu), grilleCourante_ = le G du dernier rendu.
// Vérifie :
//   1. construireGrille ne définit plus que la construction commune des
//      lignes (poserDans, ligneSection…) ;
//   2. téléphone : grilleCourante_ suit chaque rendu (même .scroller que
//      l'écran), majHauteursLignes() remesure, suivreDefilementJourMobile
//      fait suivre la case coin, et ignore un autre .scroller ;
//   3. un ancien G (rendu remplacé) ne touche plus à rien ;
//   4. ordinateur : grilleCourante_ hors vue « 1 jour », hauteurs
//      remesurées.
//
// Lancer : node test_suite99.js

const AUTORISEES = ['poserDans', 'poserPleineLargeurDans', 'nomJourHTML_', 'ligneSection', 'ligneGroupePersonnesCompact', 'ligneGroupePersonnes'];

(async () => {
  const { verifier, bilan } = verificateur();
  const erreurs = [];

  // 1. Fonctions encore définies dans construireGrille.
  const lignes = fs.readFileSync(path.join(__dirname, '..', 'js', 'grille-rendu.js'), 'utf8').split('\n');
  const debut = lignes.findIndex((l) => l === '  function construireGrille() {');
  const fin = lignes.findIndex((l, i) => i > debut && l === '  }');
  const imbriquees = lignes.slice(debut + 1, fin).map((l) => (/\bfunction\s+(\w+)\s*\(/.exec(l) || [])[1]).filter(Boolean);
  verifier(debut > 0 && fin > debut, 'construireGrille trouvée (' + (fin - debut) + ' lignes)');
  const enTrop = imbriquees.filter((f) => AUTORISEES.indexOf(f) < 0);
  verifier(enTrop.length === 0, 'construireGrille ne définit que la construction commune' + (enTrop.length ? ' — en trop : ' + enTrop.join(', ') : ''));

  const browser = await lancerNavigateur(chromium);

  // 2. et 3. Téléphone, vue « 1 jour ».
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 360, height: 760 }, hasTouch: true });
    const r = await page.evaluate(() => {
      var G1 = grilleCourante_, sc1 = document.querySelector('#racine .scroller');
      var avant = { meme: !!G1 && G1.scroller === sc1, jour: G1 && G1.enModeJourMobile, mesures: !!(G1 && G1.mesuresMob_) };
      render(false);
      var G2 = grilleCourante_, sc2 = document.querySelector('#racine .scroller');
      var apres = { nouveau: G2 !== G1 && G2.scroller === sc2, ancienDeconnecte: !G1.scroller.isConnected };
      var hauteurs = majHauteursLignes();
      // Jour suivant : case coin suivie par suivreDefilementJourMobile.
      var ths = [].slice.call(G2.grilleEntete.querySelectorAll('.th[data-gi]:not(.th-weekend)'));
      var i = ths.findIndex(function (th) { return isoDeGi(+th.dataset.gi) === G2.isoCoinJour_; });
      var th = ths[i + 1], x = decalerSurColonne_(G2, th), iso = isoDeGi(+th.dataset.gi);
      suivreDefilementJourMobile(document.createElement('div'), x);
      var ignore = G2.isoCoinJour_ !== iso;
      sc2.scrollLeft = x;
      suivreDefilementJourMobile(sc2, x);
      // Ancien G : plus rien (grille remplacée).
      var coinAvant = G1.coin.innerHTML;
      majCoinJourMobile_(G1, 0); planifierDecoupeJourMobile_(G1);
      return { avant: avant, apres: apres, hauteurs: hauteurs, ignore: ignore, coin: G2.isoCoinJour_ === iso, iso: iso, ancienIntact: G1.coin.innerHTML === coinAvant };
    });
    await page.waitForTimeout(100);
    verifier(r.avant.meme && r.avant.jour && r.avant.mesures, 'téléphone : grilleCourante_ = la grille à l\'écran, vue « 1 jour », hauteurs mesurées');
    verifier(r.apres.nouveau && r.apres.ancienDeconnecte, 'nouveau rendu : grilleCourante_ suit la nouvelle grille');
    verifier(r.hauteurs === true, 'majHauteursLignes() remesure la grille courante');
    verifier(r.ignore, 'suivreDefilementJourMobile ignore un autre .scroller');
    verifier(r.coin, 'suivreDefilementJourMobile fait suivre la case coin (' + r.iso + ')');
    verifier(r.ancienIntact, 'un ancien G ne touche plus à rien');
    erreurs.push(...e);
    await page.close();
  }

  // 4. Ordinateur.
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, {});
    const r = await page.evaluate(() => ({
      jour: grilleCourante_.enModeJourMobile, meme: grilleCourante_.scroller === document.querySelector('#racine .scroller'),
      hauteurs: majHauteursLignes(), mesures: !!grilleCourante_.mesuresMob_
    }));
    verifier(r.meme && r.jour === false, 'ordinateur : grilleCourante_ hors vue « 1 jour »');
    verifier(r.hauteurs === true && r.mesures, 'ordinateur : hauteurs remesurées');
    erreurs.push(...e);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(erreurs));
})();
