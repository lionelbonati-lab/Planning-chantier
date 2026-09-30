const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 30.09.2026 (suite 129). Lionel : « J'aimerai avoir un endroit
// où je peux prendre des notes pour améliorer et signaler des bugs. 2
// cases, améliorations et bug. Quand j'ai quelque chose à noter, je le note
// dans la case correspondante et j'envoie avec un bouton. Quand j'ai du
// temps pour discuter des améliorations et bug tu devras lire ce que j'ai
// envoyé. Idéalement il faudrait faire la distinction entre mobile,
// tablette et deskop. »
// Vérifie la page Réglages › Améliorations et bugs (js/page-retours.js) :
//   1. l'appareil reconnu (ordinateur, téléphone, tablette) est choisi
//      d'office dans « Concerne » ;
//   2. « Envoyer » grisé tant que la case est vide ; texte pas envoyé
//      gardé en brouillon ;
//   3. envoi : ligne dans la table retours (sorte, texte, appareil,
//      détails de l'écran et page d'où l'on vient), case vidée, note
//      listée sous SA case ; « Tous » et Ctrl + Entrée ;
//   4. notes déjà envoyées relues, « Traité » et la réponse affichés ;
//      « Retirer » l'efface après confirmation ;
//   5. 3 notes par case, « Voir les N autres » / « Réduire » ;
//   6. téléphone : les 2 cases l'une sous l'autre, rien ne déborde, texte
//      en 16 px (pas d'agrandissement de l'iPhone).
//
// Lancer : node test_suite129.js

const ANCIENNES = [
  { id: 1, sorte: 'bug', texte: 'La bulle saute au changement de jour', appareil: 'telephone', details: {}, statut: 'traite', reponse: 'Corrigé (suite 130).', cree_le: '2026-09-28T09:15:00Z' },
  { id: 2, sorte: 'amelioration', texte: 'Couleur par équipe', appareil: 'ordinateur', details: {}, statut: 'lu', reponse: null, cree_le: '2026-09-29T16:40:00Z' }
];

const etatPage = (page) => page.evaluate(() => {
  const liste = (s) => [...document.querySelectorAll('#retoursListe-' + s + ' .retour')].map((r) =>
    r.querySelector('.retour-appareil').textContent + '/' + r.querySelector('.retour-statut').textContent + '/' + r.querySelector('.retour-texte').textContent +
    (r.querySelector('.retour-reponse') ? '/' + r.querySelector('.retour-reponse').textContent : ''));
  return {
    actif: (document.querySelector('.retours-appareils .actif') || { dataset: {} }).dataset.appareil,
    reconnu: document.getElementById('retoursReconnu').textContent,
    ameliorations: liste('amelioration'), bugs: liste('bug'),
    boutons: ['amelioration', 'bug'].map((s) => document.getElementById('btnRetour-' + s).disabled).join(','),
    deborde: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
});

(async () => {
  const { verifier, bilan } = verificateur();
  const browser = await lancerNavigateur(chromium);
  const erreurs = [];

  // ---- Ordinateur ----------------------------------------------------------
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 1280, height: 900 }, bd: { retours: ANCIENNES.map((r) => Object.assign({}, r)) } });
    await page.evaluate(() => afficherPage('jalons'));
    await page.evaluate(() => afficherPage('retours'));
    await page.waitForTimeout(300);
    let etat = await etatPage(page);
    verifier(etat.actif === 'ordinateur' && etat.reconnu === 'Cet appareil : ordinateur' && etat.boutons === 'true,true',
      'ordinateur : « Ordinateur » choisi d’office, « Envoyer » grisé tant que les cases sont vides (' + JSON.stringify(etat) + ')');
    verifier(JSON.stringify(etat.ameliorations) === '["Ordinateur/Lu/Couleur par équipe"]' && JSON.stringify(etat.bugs) === '["Téléphone/Traité/La bulle saute au changement de jour/Corrigé (suite 130)."]',
      'notes déjà envoyées relues sous leur case, avec l’appareil, « Lu » / « Traité » et la réponse (' + JSON.stringify([etat.ameliorations, etat.bugs]) + ')');

    await page.fill('#retoursTexte-amelioration', '  Pouvoir trier les chantiers\npar date  ');
    etat = await etatPage(page);
    const brouillon = await page.evaluate(() => localStorage.getItem('retours.brouillon.amelioration'));
    verifier(etat.boutons === 'false,true' && brouillon === '  Pouvoir trier les chantiers\npar date  ',
      'texte tapé : son « Envoyer » s’allume (pas l’autre), brouillon gardé sur l’appareil (' + etat.boutons + ')');

    await page.click('#btnRetour-amelioration');
    await page.waitForTimeout(250);
    const envoi = await page.evaluate(() => ({
      ligne: __BD.retours.find((r) => r.id >= 1000), case: document.getElementById('retoursTexte-amelioration').value,
      brouillon: localStorage.getItem('retours.brouillon.amelioration')
    }));
    etat = await etatPage(page);
    const l = envoi.ligne || {};
    verifier(l.sorte === 'amelioration' && l.texte === 'Pouvoir trier les chantiers\npar date' && l.appareil === 'ordinateur' &&
      l.details && l.details.fenetre === '1280×900' && l.details.reconnu === 'ordinateur' && l.details.page === 'jalons' && /Chrome/.test(l.details.ua),
      'envoi : une ligne dans retours — sorte, texte, appareil, détails (fenêtre, page d’où l’on vient, navigateur) (' + JSON.stringify(l) + ')');
    verifier(envoi.case === '' && envoi.brouillon === null && etat.ameliorations[0] === 'Ordinateur/Envoyé/Pouvoir trier les chantiers\npar date' && etat.ameliorations.length === 2 && etat.bugs.length === 1 && etat.boutons === 'true,true',
      'case vidée, brouillon effacé, note en tête de SA liste « Envoyé » (' + JSON.stringify(etat.ameliorations) + ')');

    await page.click('.retours-appareils [data-appareil="tous"]');
    await page.fill('#retoursTexte-bug', 'Le bouton Imprimer ne répond pas');
    await page.press('#retoursTexte-bug', 'Control+Enter');
    await page.waitForTimeout(250);
    etat = await etatPage(page);
    const bug = await page.evaluate(() => __BD.retours.filter((r) => r.sorte === 'bug').map((r) => r.appareil).join());
    verifier(etat.actif === 'tous' && bug === 'telephone,tous' && etat.bugs[0] === 'Tous/Envoyé/Le bouton Imprimer ne répond pas' && etat.ameliorations.length === 2,
      '« Tous » puis Ctrl + Entrée dans « Bugs » : envoyé comme bug pour tous les appareils (' + bug + ' ; ' + JSON.stringify(etat.bugs) + ')');

    await page.click('#retoursListe-bug [data-retirer-retour="1"]');
    await page.waitForTimeout(150);
    await page.click('.confirm-pop .c-ok');
    await page.waitForTimeout(250);
    etat = await etatPage(page);
    const reste = await page.evaluate(() => __BD.retours.map((r) => r.id).sort((a, b) => a - b).join());
    verifier(reste === '2,1000,1001' && etat.bugs.length === 1,
      '« Retirer » + confirmation : la note est effacée de la base et de la liste (' + reste + ')');

    erreurs.push(...e);
    await page.close();
  }

  // ---- 3 notes par case, « Voir les N autres » ---------------------------------
  {
    const cinq = [1, 2, 3, 4, 5].map((i) => ({ id: i, sorte: 'amelioration', texte: 'Idée ' + i, appareil: 'tablette', details: {}, statut: 'nouveau', reponse: null, cree_le: '2026-09-2' + i + 'T08:00:00Z' }));
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 1280, height: 900 }, bd: { retours: cinq } });
    await page.evaluate(() => afficherPage('retours'));
    await page.waitForTimeout(300);
    const vues = [];
    const lire = () => page.evaluate(() => [...document.querySelectorAll('#retoursListe-amelioration .retour-texte')].map((t) => t.textContent).join(',') + ' | ' +
      ((document.querySelector('#retoursListe-amelioration [data-deplier-retours]') || {}).textContent || ''));
    vues.push(await lire());
    await page.click('#retoursListe-amelioration [data-deplier-retours]');
    vues.push(await lire());
    await page.click('#retoursListe-amelioration [data-deplier-retours]');
    vues.push(await lire());
    verifier(vues.join(' / ') === 'Idée 5,Idée 4,Idée 3 | Voir les 2 autres / Idée 5,Idée 4,Idée 3,Idée 2,Idée 1 | Réduire / Idée 5,Idée 4,Idée 3 | Voir les 2 autres',
      'les 3 plus récentes, « Voir les 2 autres » déplie, « Réduire » replie (' + vues.join(' / ') + ')');
    erreurs.push(...e);
    await page.close();
  }

  // ---- Téléphone -----------------------------------------------------------
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, localStorage: { 'retours.brouillon.bug': 'Noté hier soir' } });
    await page.evaluate(() => afficherPage('retours'));
    await page.waitForTimeout(300);
    const etat = await etatPage(page);
    const mise = await page.evaluate(() => {
      const [a, b] = [...document.querySelectorAll('.retours-case')].map((c) => c.getBoundingClientRect());
      return { dessous: b.top >= a.bottom - 1, largeur: Math.round(a.width), police: getComputedStyle(document.getElementById('retoursTexte-bug')).fontSize,
        brouillon: document.getElementById('retoursTexte-bug').value };
    });
    verifier(etat.actif === 'telephone' && etat.reconnu === 'Cet appareil : téléphone',
      'téléphone : « Téléphone » choisi d’office (' + JSON.stringify(etat) + ')');
    verifier(mise.dessous && mise.largeur > 300 && !etat.deborde && mise.police === '16px',
      'téléphone : les 2 cases l’une sous l’autre, pleine largeur, rien ne déborde, texte en 16 px (' + JSON.stringify(mise) + ')');
    verifier(mise.brouillon === 'Noté hier soir' && etat.boutons === 'true,false',
      'brouillon d’avant retrouvé dans sa case, son « Envoyer » allumé (' + etat.boutons + ')');
    await page.click('#btnRetour-bug');
    await page.waitForTimeout(250);
    const l = await page.evaluate(() => __BD.retours[0]);
    verifier(l && l.appareil === 'telephone' && l.details.fenetre === '390×844' && l.details.tactile > 0,
      'téléphone : envoyé avec l’appareil « telephone » et l’écran tactile (' + JSON.stringify(l && l.details) + ')');
    erreurs.push(...e);
    await page.close();
  }

  // ---- Tablette ------------------------------------------------------------
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 820, height: 1180 }, hasTouch: true });
    await page.evaluate(() => afficherPage('retours'));
    await page.waitForTimeout(300);
    const etat = await etatPage(page);
    verifier(etat.actif === 'tablette' && !etat.deborde, 'tablette (820 px, tactile) : « Tablette » choisi d’office (' + JSON.stringify(etat) + ')');
    erreurs.push(...e);
    await page.close();
  }

  verifier(erreurs.length === 0, 'aucune erreur JS (' + erreurs.join(' | ') + ')');
  await browser.close();
  process.exitCode = bilan();
})();
