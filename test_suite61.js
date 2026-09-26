const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 26.09.2026 (suite 61). Lionel :
//   « Il me faut une page capable de gérer les raccourcis claviers.
//     Mettre les réglages de l'onglet "Général" dans le pastille de
//     déconnexion. Une page par type de réglage. y mettre les raccourcis
//     claviers. ôter l'onglet général.
//     Lorsqu'on ouvre l'appli en mode mobile un jour de week-end, ouvrir
//     l'appli sur le jour le plus proche.
//     Possibilité d'enregistrer sa palette de couleur. »
//   « Ajouter une page info personnel, pour entrée ses donnée comme Nom,
//     Prénom, Entreprise, modification du mot de passe, suppression du
//     compte et déconnexion. a mettre dans le menu setup »
//   « Possibilté d'ajouter une photo de profile »
// Vérifie :
//   1. menu de la pastille (ordinateur et téléphone) : plus d'onglet
//      Général ni Mise en page (« Mise en page impression passe aussi dans
//      le menu réglage »), une page par réglage, rangée pour passer de l'une à l'autre,
//      rien ne déborde, Échap et clic dehors ferment le menu ;
//   2. raccourcis : touches d'origine, ajout par capture, conflit,
//      retrait, « Tout rétablir », enregistrement sur le compte, relecture ;
//   3. téléphone ouvert un samedi → vendredi, un dimanche → lundi ;
//   4. palettes : enregistrer (page et fenêtre Personnaliser), choisir,
//      supprimer ;
//   5. Mon compte : infos, photo (pastille), mot de passe, suppression,
//      déconnexion ;
//   6. espace arrondi entre deux semaines (« comme si on voyait 2 fenêtres
//      côte à côte ») ; Maj après un clic ne fait plus apparaître de
//      contour (« appuyer sur la touche shift fait apparaître une
//      sélection ») ;
//   7. résumé des statuts : la tâche choisie est sélectionnée et montrée.
//
// Lancer : node test_suite61.js

const REGLAGES = ['compte', 'affichage', 'couleurs', 'mise-en-page', 'raccourcis', 'sauvegardes'];
const semaine = (page) => page.evaluate(() => etat.semaines[etat.indexSemaine].debut);
const presser = async (page, touche) => { await page.keyboard.press(touche); await page.waitForTimeout(150); };
const ecritures = (page, motif) => page.evaluate((m) => window.__ECRITURES.filter((e) => e.indexOf(m) === 0), motif);
const combos = (page, id) => page.$$eval('.ligne-raccourci[data-action="' + id + '"] .rc-combo', (cs) => cs.map((c) => c.dataset.combo));
const toastTexte = (page) => page.evaluate(() => document.getElementById('toast').textContent);
// Petite image PNG 300×200 (moitié gauche rouge, droite bleue), dessinée
// par Chromium lui-même.
async function imagePng(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 200;
    const x = c.getContext('2d'); x.fillStyle = '#d02020'; x.fillRect(0, 0, 150, 200); x.fillStyle = '#2040d0'; x.fillRect(150, 0, 150, 200);
    return c.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(b64, 'base64');
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Menu de la pastille ------------------------------------------
  for (const [largeur, hauteur, tactile] of [[1400, 900, false], [390, 844, true]]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: hauteur }, hasTouch: tactile });
    const lieu = largeur + ' px';
    const general = await page.evaluate(() => document.querySelectorAll('[data-page="general"], #page-general, #ongletsNav .onglets-liste:not(.onglets-reglages) [data-page="mise-en-page"], .switcher-groupe-pages [data-page="mise-en-page"]').length);
    verifier(general === 0, lieu + ' : plus d\'onglet Général ni Mise en page (' + general + ')');

    // Suite 63 : plus de petit menu — la pastille fait basculer la barre
    // d'onglets sur les réglages (cf. test_suite63.js pour le détail).
    const avatarVisible = () => page.evaluate(() => {
      const a = [...document.querySelectorAll('.avatar-nav')].filter((x) => x.offsetParent !== null && x.getBoundingClientRect().width > 0)[0];
      return a ? '#' + a.id : null;
    });
    const avatar = await avatarVisible();
    verifier(!!avatar && await page.getAttribute(avatar, 'aria-label') === 'Compte et réglages', lieu + ' : pastille « Compte et réglages » visible (' + avatar + ')');
    await page.click(avatar);
    await page.waitForTimeout(150);
    const croix = largeur < 600 ? '#btnFermerReglagesBas' : '#btnFermerReglages';
    for (const nom of REGLAGES) {
      if (largeur < 600) { await page.click('#switcherBtn'); await page.click('#switcherPanneau .switcher-item[data-page="' + nom + '"]'); }
      else await page.click('#ongletsReglages .onglet[data-page="' + nom + '"]');
      await page.waitForTimeout(200);
      const p = await page.evaluate((nom) => ({
        actif: document.getElementById('page-' + nom).classList.contains('actif'),
        seule: document.querySelectorAll('.page.actif').length,
        onglet: [...document.querySelectorAll('.onglet.actif')].every((b) => b.dataset.page === nom),
        deborde: document.documentElement.scrollWidth > innerWidth + 1 ||
          [...document.querySelectorAll('#page-' + nom + ' *')].some((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1; }),
        titre: (document.querySelector('#page-' + nom + ' h1') || {}).textContent
      }), nom);
      verifier(p.actif && p.seule === 1 && p.onglet && !p.deborde,
        lieu + ' : onglet → page « ' + p.titre + ' », onglet marqué, rien ne déborde (' + JSON.stringify({ actif: p.actif, deborde: p.deborde }) + ')');
      if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/s61-' + nom + '-' + largeur + '.png' });
    }
    // La croix ramène au planning, la pastille revient.
    await page.click(croix);
    await page.waitForTimeout(150);
    verifier(await page.evaluate(() => document.getElementById('page-planning').classList.contains('actif')) && await avatarVisible() === avatar, lieu + ' : la croix ramène au planning, la pastille revient');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. Raccourcis clavier --------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: { reglages: [] } });
    const s0 = await semaine(page);
    await presser(page, 's');
    const s1 = await semaine(page);
    await presser(page, 'p');
    const s2 = await semaine(page);
    verifier(s0 === '2026-09-21' && s1 === '2026-09-28' && s2 === '2026-09-21', 'touches d\'origine : S semaine suivante, P précédente (' + [s0, s1, s2].join(' → ') + ')');
    await presser(page, 's'); await presser(page, 'a');
    verifier(await semaine(page) === '2026-09-21', 'touche A : retour à aujourd\'hui');
    await presser(page, 'w');
    const we = await page.evaluate(() => afficherWeekends);
    await presser(page, 'w');
    verifier(we === true && await page.evaluate(() => !afficherWeekends), 'touche W : week-ends affichés puis masqués');
    await presser(page, '+');
    const z = await page.evaluate(() => niveauZoomPlanning);
    await presser(page, '0');
    verifier(z === 110 && await page.evaluate(() => niveauZoomPlanning) === 100, 'touches + et 0 : zoom 110 % puis 100 % (' + z + ')');
    await presser(page, '?');
    verifier(await page.evaluate(() => document.getElementById('page-raccourcis').classList.contains('actif')), 'touche ? : page Raccourcis clavier');
    // Hors du planning, les touches du planning ne font rien.
    await presser(page, 's');
    verifier(await semaine(page) === '2026-09-21', 'hors du planning, S ne change pas de semaine');

    const liste = await page.evaluate(() => ({
      groupes: [...document.querySelectorAll('#listeRaccourcis .titre-liste')].map((h) => h.textContent).join('|'),
      suivante: [...document.querySelectorAll('.ligne-raccourci[data-action="semaineSuivante"] kbd')].map((k) => k.textContent).join(' '),
      refaire: [...document.querySelectorAll('.ligne-raccourci[data-action="refaire"] .rc-combo')].map((c) => c.textContent.replace('×', '')).join(' / '),
      fixes: document.querySelectorAll('.rc-fixe').length, resetCache: document.getElementById('btnRaccourcisDefaut').hidden
    }));
    verifier(liste.groupes === 'Modifier|Naviguer|Afficher|Pages|Touches fixes' && liste.suivante === 'S' && liste.refaire === 'Ctrl+Y / Ctrl+Maj+Z' && liste.fixes === 2 && liste.resetCache,
      'page Raccourcis : groupes, touches affichées, touches fixes, « Tout rétablir » caché (' + JSON.stringify(liste) + ')');

    // Ajouter N à « Semaine suivante ».
    await page.click('.ligne-raccourci[data-action="semaineSuivante"] .rc-ajouter');
    verifier(await page.isVisible('.ligne-raccourci[data-action="semaineSuivante"] .rc-capture'), '« + » : la ligne attend la combinaison');
    await presser(page, 'Escape');
    verifier(await page.isVisible('.ligne-raccourci[data-action="semaineSuivante"] .rc-ajouter') && (await combos(page, 'semaineSuivante')).join() === 'S', 'Échap pendant la saisie : rien ne change');
    await page.click('.ligne-raccourci[data-action="semaineSuivante"] .rc-ajouter');
    await presser(page, 'n');
    await page.waitForTimeout(500);
    const ecr1 = (await ecritures(page, 'reglages:upsert')).filter((e) => e.indexOf('"cle":"raccourcis"') >= 0); // la touche W retient aussi les week-ends (clé « affichage », suite 62)
    verifier((await combos(page, 'semaineSuivante')).join() === 'S,N' && ecr1.length === 1 && /"cle":"raccourcis","valeur":\{"semaineSuivante":\["S","N"\]\}/.test(ecr1[0]),
      'N ajouté à « Semaine suivante », seule la modification est enregistrée sur le compte (' + ecr1[0] + ')');
    verifier(await page.isVisible('.ligne-raccourci[data-action="semaineSuivante"] .rc-defaut') && await page.isVisible('#btnRaccourcisDefaut'), '↺ et « Tout rétablir » apparaissent');

    // Conflit : N pour « Semaine précédente ».
    await page.click('.ligne-raccourci[data-action="semainePrecedente"] .rc-ajouter');
    await presser(page, 'n');
    const conf = await page.evaluate(() => (document.querySelector('.confirm-pop .confirm-texte') || {}).textContent);
    verifier(/« N » sert déjà à « Semaine suivante »/.test(conf || ''), 'combinaison déjà prise : question avant de la déplacer (' + conf + ')');
    await page.click('.confirm-pop .c-ok');
    await page.waitForTimeout(500);
    verifier((await combos(page, 'semainePrecedente')).join() === 'P,N' && (await combos(page, 'semaineSuivante')).join() === 'S',
      'confirmé : N passe à « Semaine précédente », « Semaine suivante » garde S');
    // Retirer P.
    await page.click('.ligne-raccourci[data-action="semainePrecedente"] .rc-combo[data-combo="P"] .rc-retirer');
    await page.waitForTimeout(500);
    const ecr2 = (await ecritures(page, 'reglages:upsert')).filter((e) => e.indexOf('"cle":"raccourcis"') >= 0); // la touche W retient aussi les week-ends (clé « affichage », suite 62)
    verifier((await combos(page, 'semainePrecedente')).join() === 'N' && /"valeur":\{"semainePrecedente":\["N"\]\}/.test(ecr2[ecr2.length - 1]),
      '× : P retiré, enregistré (' + ecr2[ecr2.length - 1] + ')');
    // Combinaison avec modificateur, pour une page.
    await page.click('.ligne-raccourci[data-action="pageChantiers"] .rc-ajouter');
    await presser(page, 'Alt+c');
    verifier((await combos(page, 'pageChantiers')).join() === 'Alt+C', 'Alt+C attribué à la page Chantiers');

    // Retour au planning : les nouvelles touches servent.
    await page.evaluate(() => afficherPage('planning'));
    await presser(page, 'n');
    const sN = await semaine(page);
    await presser(page, 'p');
    const sP = await semaine(page);
    await presser(page, 's');
    verifier(sN === '2026-09-14' && sP === '2026-09-14' && await semaine(page) === '2026-09-21', 'planning : N recule d\'une semaine, P ne fait plus rien, S avance (' + [sN, sP].join(', ') + ')');
    await presser(page, 'Alt+c');
    verifier(await page.evaluate(() => document.getElementById('page-chantiers').classList.contains('actif')), 'Alt+C ouvre la page Chantiers');
    // Tapées dans un champ, les touches restent du texte.
    await page.evaluate(() => afficherPage('compte'));
    await page.fill('#comptePrenom', '');
    await page.type('#comptePrenom', '?n');
    verifier(await page.inputValue('#comptePrenom') === '?n' && await page.evaluate(() => document.getElementById('page-compte').classList.contains('actif')), 'dans un champ, « ? » et « n » s\'écrivent');
    await page.fill('#comptePrenom', '');
    await page.evaluate(() => { delete document.getElementById('comptePrenom').dataset.modifie; });

    // ↺ sur « Semaine précédente » : P revient ; « Tout rétablir ».
    await page.evaluate(() => afficherPage('raccourcis'));
    await page.click('.ligne-raccourci[data-action="semainePrecedente"] .rc-defaut');
    await page.waitForTimeout(100);
    verifier((await combos(page, 'semainePrecedente')).join() === 'P', '↺ : « Semaine précédente » revient à P');
    await page.click('#btnRaccourcisDefaut');
    await page.click('.confirm-pop .c-ok');
    await page.waitForTimeout(500);
    const ecr3 = (await ecritures(page, 'reglages:upsert')).filter((e) => e.indexOf('"cle":"raccourcis"') >= 0); // la touche W retient aussi les week-ends (clé « affichage », suite 62)
    verifier((await combos(page, 'pageChantiers')).length === 0 && /"valeur":\{\}/.test(ecr3[ecr3.length - 1]) && await page.isHidden('#btnRaccourcisDefaut'),
      '« Tout rétablir » : toutes les touches d\'origine, plus rien d\'enregistré (' + ecr3[ecr3.length - 1] + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  // Touches enregistrées sur le compte : reprises à l'ouverture.
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: { reglages: [{ cle: 'raccourcis', valeur: { semaineSuivante: ['N'], annuler: [] } }] } });
    await presser(page, 's');
    const s1 = await semaine(page);
    await presser(page, 'n');
    verifier(s1 === '2026-09-21' && await semaine(page) === '2026-09-28', 'touches du compte reprises à l\'ouverture : N avance, S ne fait plus rien');
    await page.evaluate(() => afficherPage('raccourcis'));
    const aucune = await page.evaluate(() => document.querySelector('.ligne-raccourci[data-action="annuler"] .rc-aucune') !== null);
    verifier(aucune, 'une action sans touche affiche « Aucune touche »');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Téléphone ouvert un week-end -----------------------------------
  for (const [date, jour, lundi, nom] of [['2026-09-26T09:00:00', '2026-09-25', '2026-09-21', 'samedi 26 → vendredi 25'], ['2026-09-27T09:00:00', '2026-09-28', '2026-09-28', 'dimanche 27 → lundi 28']]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, date });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ jour: jourMobileIso, semaine: etat.semaines[etat.indexSemaine].debut, courant: jourMobileCourant() }));
    verifier(r.jour === jour && r.courant === jour && r.semaine === lundi, 'téléphone, ' + nom + ' (' + JSON.stringify(r) + ')');
    // « Aujourd'hui » après être parti ailleurs : même jour ouvré.
    await page.evaluate(() => naviguerSemaine(2));
    await page.waitForTimeout(200);
    await page.evaluate(() => allerAujourdhui());
    await page.waitForTimeout(300);
    const r2 = await page.evaluate(() => jourMobileCourant());
    verifier(r2 === jour, 'téléphone, ' + nom + ' : « Aujourd\'hui » revient au même jour (' + r2 + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  {
    // Ordinateur un samedi : la semaine en cours, comme avant.
    const { page, erreurs } = await ouvrirPlanning(browser, { date: '2026-09-26T09:00:00' });
    verifier(await semaine(page) === '2026-09-21', 'ordinateur, samedi : la semaine en cours (inchangé)');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Palettes -------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: { reglages: [], couleurs_perso: [] } });
    await page.evaluate(() => afficherPage('couleurs'));
    await page.waitForTimeout(150);
    verifier(/Aucune palette/.test(await page.textContent('#listePalettes')), 'Couleurs : aucune palette au départ');
    // Couleurs personnalisées dans la fenêtre, puis « Enregistrer comme palette… ».
    await page.click('#btnPersonnaliserCouleurs');
    await page.waitForSelector('.couleurs-modal .rc-clair[data-groupe="principale"]');
    await page.evaluate(() => {
      const i = document.querySelector('.couleurs-modal .rc-clair[data-groupe="principale"]');
      i.value = '#884422'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(200);
    await page.click('.couleurs-modal .cm-enregistrer-palette');
    await page.fill('.pop-nom-palette .np-nom', 'Brique');
    await presser(page, 'Enter');
    await page.waitForTimeout(300);
    const pal1 = await page.evaluate(() => ({
      liste: JSON.parse(JSON.stringify(etat.reglages.palettes)), modal: !!document.querySelector('.couleurs-modal'),
      selModal: document.querySelector('.couleurs-modal .sel-theme-couleurs').value,
      options: [...document.querySelectorAll('#selThemeCouleurs optgroup option')].map((o) => o.textContent).join('|')
    }));
    const ecrP = await ecritures(page, 'reglages:upsert');
    verifier(pal1.liste.length === 1 && pal1.liste[0].nom === 'Brique' && pal1.liste[0].valeurs.principale.clair === '#884422' && /"cle":"palettes"/.test(ecrP[ecrP.length - 1]),
      'fenêtre Personnaliser : « Brique » enregistrée sur le compte (' + JSON.stringify(pal1.liste[0].valeurs) + ')');
    verifier(pal1.modal && pal1.selModal === 'pal:' + pal1.liste[0].id && pal1.options === 'Brique', 'la fenêtre reste ouverte, la liste Thème montre « Brique » sous « Mes palettes »');
    await presser(page, 'Escape');
    // Thème Forêt, puis revenir à Brique depuis la liste des palettes.
    await page.selectOption('#selThemeCouleurs', 'foret');
    await page.waitForTimeout(200);
    const lignePal = await page.evaluate(() => [...document.querySelectorAll('.ligne-palette')].map((l) => l.querySelector('.palette-nom').textContent + ':' + !!l.querySelector('.lien-appliquer-palette')).join());
    verifier(lignePal === 'Brique:true', 'thème Forêt choisi : « Brique » proposée avec « Appliquer » (' + lignePal + ')');
    await page.click('.ligne-palette .lien-appliquer-palette');
    await page.waitForTimeout(300);
    const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    verifier(accent === '#884422' && await page.inputValue('#selThemeCouleurs') === 'pal:' + pal1.liste[0].id && await page.isVisible('.ligne-palette .palette-actuelle'),
      '« Appliquer » : couleurs de la palette remises, « Actuelle » (' + accent + ')');
    // Enregistrer depuis la page, sous un nom déjà pris → remplacement confirmé.
    await page.selectOption('#selThemeCouleurs', 'ardoise');
    await page.waitForTimeout(200);
    await page.click('#btnEnregistrerPalette');
    await page.fill('.pop-nom-palette .np-nom', 'Ardoise perso');
    await page.click('.pop-nom-palette .c-ok');
    await page.waitForTimeout(200);
    const noms = await page.$$eval('.ligne-palette .palette-nom', (ns) => ns.map((n) => n.textContent).join('|'));
    verifier(noms === 'Brique|Ardoise perso' && await page.inputValue('#selThemeCouleurs') === 'pal:' + (await page.evaluate(() => etat.reglages.palettes[1].id)),
      'page Couleurs : « Ardoise perso » enregistrée, la liste Thème la montre (même couleurs qu\'Ardoise) (' + noms + ')');
    await page.click('#btnEnregistrerPalette');
    await page.fill('.pop-nom-palette .np-nom', 'brique');
    await page.click('.pop-nom-palette .c-ok');
    const q = await page.evaluate(() => (document.querySelector('.confirm-pop .confirm-texte') || {}).textContent);
    await page.click('.confirm-pop .c-ok');
    await page.waitForTimeout(200);
    const brique = await page.evaluate(() => etat.reglages.palettes.filter((p) => p.nom === 'Brique').map((p) => (p.valeurs.principale || {}).clair || 'défaut'));
    verifier(/Remplacer la palette « brique »/.test(q || '') && brique.length === 1 && brique[0] !== '#884422', 'nom déjà pris : remplacement demandé puis fait (' + brique + ')');
    // Supprimer.
    await page.click('.ligne-palette[data-id="' + pal1.liste[0].id + '"] .lien-supprimer');
    await page.click('.confirm-pop .c-ok');
    await page.waitForTimeout(200);
    const apres = await page.evaluate(() => ({ lignes: [...document.querySelectorAll('.ligne-palette .palette-nom')].map((n) => n.textContent).join('|'), bd: etat.reglages.palettes.map((p) => p.nom).join('|'),
      options: [...document.querySelectorAll('#selThemeCouleurs optgroup option')].map((o) => o.textContent).join('|') }));
    verifier(apres.lignes === 'Ardoise perso' && apres.bd === 'Ardoise perso' && apres.options === 'Ardoise perso', 'palette supprimée : liste et liste Thème à jour (' + JSON.stringify(apres) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 5. Mon compte -----------------------------------------------------
  for (const [largeur, hauteur, tactile] of [[1400, 900, false], [390, 844, true]]) {
    const lieu = largeur + ' px';
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: hauteur }, hasTouch: tactile, bd: { profils: [] } });
    const consoles = [];
    page.on('console', (m) => consoles.push(m.text()));
    await page.evaluate(() => afficherPage('compte'));
    await page.waitForTimeout(150);
    const init = await page.evaluate(() => ({ email: document.getElementById('compteEmail').textContent, lettre: [...document.querySelectorAll('.avatar-nav')].map((a) => a.textContent).join('') }));
    verifier(init.email === 'test@local' && /^L+$/.test(init.lettre), lieu + ' : Mon compte rappelle l\'adresse, pastille « L » par défaut (' + JSON.stringify(init) + ')');

    await page.fill('#comptePrenom', 'Lionel');
    await page.fill('#compteNom', 'Bonati');
    await page.fill('#compteEntreprise', 'Bonati SA');
    await page.click('#btnEnregistrerInfos');
    await page.waitForTimeout(250);
    // Suite 63 : plus de petit menu (qui rappelait le nom) — l'initiale de la pastille.
    const prof = await page.evaluate(() => ({ bd: window.__BD.profils[0], lettre: document.getElementById('lienDeconnexionNav').textContent, local: JSON.parse(localStorage.getItem('planning.profil')) }));
    verifier(prof.bd && prof.bd.user_id === 'u-test' && prof.bd.prenom === 'Lionel' && prof.bd.nom === 'Bonati' && prof.bd.entreprise === 'Bonati SA' && prof.lettre === 'L' && prof.local.email === 'test@local',
      lieu + ' : prénom, nom, entreprise enregistrés (profils, copie sur l\'appareil), initiale dans la pastille (' + prof.lettre + ')');

    // Photo : recadrée en carré 256 px, dans les pastilles.
    await page.setInputFiles('#fichierPhoto', { name: 'moi.png', mimeType: 'image/png', buffer: await imagePng(page) });
    await page.waitForTimeout(600);
    const photo = await page.evaluate(() => {
      const p = window.__BD.profils[0].photo || '';
      return new Promise((ok) => { const i = new Image(); i.onload = () => ok({ debut: p.slice(0, 23), taille: p.length, l: i.naturalWidth, h: i.naturalHeight,
        pastilles: [...document.querySelectorAll('.avatar-nav')].every((a) => a.classList.contains('avec-photo') && a.querySelector('img') && a.querySelector('img').src === p),
        retirer: !document.getElementById('btnRetirerPhoto').hidden }); i.onerror = () => ok({ debut: p.slice(0, 23) }); i.src = p; });
    });
    verifier(photo.debut === 'data:image/jpeg;base64,' && photo.l === 256 && photo.h === 256 && photo.taille < 400000 && photo.pastilles && photo.retirer,
      lieu + ' : photo recadrée 256×256 JPEG (' + photo.taille + ' car.), affichée dans toutes les pastilles');
    if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/s61-compte-photo-' + largeur + '.png' });
    await page.click('#btnRetirerPhoto');
    await page.click('.confirm-pop .c-ok');
    await page.waitForTimeout(250);
    const sans = await page.evaluate(() => ({ bd: window.__BD.profils[0].photo, lettre: [...document.querySelectorAll('.avatar-nav')].map((a) => a.textContent).join('') }));
    verifier(sans.bd === null && /^L+$/.test(sans.lettre), lieu + ' : photo retirée, retour à l\'initiale du prénom');
    // Un fichier qui n'est pas une image.
    await page.setInputFiles('#fichierPhoto', { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('bonjour') });
    await page.waitForTimeout(250);
    const t = await toastTexte(page);
    verifier(/Photo non enregistrée : ce fichier n’est pas une image/.test(t) && await page.evaluate(() => window.__BD.profils[0].photo === null), lieu + ' : un fichier qui n\'est pas une image est refusé (' + t + ')');

    // Mot de passe.
    await page.fill('#compteMdpActuel', 'faux');
    await page.fill('#compteMdpNouveau', 'nouveau-1234');
    await page.fill('#compteMdpConfirme', 'nouveau-1234');
    await page.click('#btnChangerMotDePasse');
    await page.waitForTimeout(200);
    verifier(await page.textContent('#erreurMotDePasse') === 'Mot de passe actuel incorrect.' && (await ecritures(page, 'auth:updateUser')).length === 0,
      lieu + ' : mot de passe actuel faux → refusé, rien de changé');
    await page.fill('#compteMdpActuel', 'secret');
    await page.fill('#compteMdpConfirme', 'autre-1234');
    await page.click('#btnChangerMotDePasse');
    verifier(/pas identiques/.test(await page.textContent('#erreurMotDePasse')), lieu + ' : confirmation différente → refusée');
    await page.fill('#compteMdpNouveau', 'court');
    await page.fill('#compteMdpConfirme', 'court');
    await page.click('#btnChangerMotDePasse');
    verifier(/au moins 8 caractères/.test(await page.textContent('#erreurMotDePasse')), lieu + ' : moins de 8 caractères → refusé');
    await page.fill('#compteMdpNouveau', 'nouveau-1234');
    await page.fill('#compteMdpConfirme', 'nouveau-1234');
    await page.click('#btnChangerMotDePasse');
    await page.waitForTimeout(200);
    const mdp = await page.evaluate(() => ({ auth: window.__AUTH.motDePasse, champ: document.getElementById('compteMdpActuel').value, err: document.getElementById('erreurMotDePasse').textContent }));
    verifier(mdp.auth === 'nouveau-1234' && mdp.champ === '' && mdp.err === '' && /Mot de passe changé/.test(await toastTexte(page)), lieu + ' : mot de passe changé, champs vidés');

    // Suppression : mot de passe + SUPPRIMER, sinon le bouton reste grisé.
    await page.click('#btnSupprimerCompte');
    await page.waitForSelector('.pop-suppression-compte');
    const grise0 = await page.isDisabled('.pop-suppression-compte .c-ok');
    await page.fill('.pop-suppression-compte .sc-mdp', 'secret');
    await page.fill('.pop-suppression-compte .sc-mot', 'supprime');
    const grise1 = await page.isDisabled('.pop-suppression-compte .c-ok');
    await page.fill('.pop-suppression-compte .sc-mot', 'supprimer');
    const grise2 = await page.isDisabled('.pop-suppression-compte .c-ok');
    verifier(grise0 && grise1 && !grise2, lieu + ' : suppression possible seulement avec le mot de passe et « SUPPRIMER »');
    await page.click('.pop-suppression-compte .c-ok');
    await page.waitForTimeout(200);
    const refus = await page.evaluate(() => ({ err: document.querySelector('.pop-suppression-compte .erreur-compte').textContent, rpc: window.__ECRITURES.filter((e) => e === 'rpc:supprimer_mon_compte').length }));
    verifier(/ancien|incorrect/.test(refus.err) && refus.rpc === 0, lieu + ' : ancien mot de passe → compte non supprimé (' + refus.err + ')');
    await presser(page, 'Escape');
    verifier(await page.evaluate(() => !document.querySelector('.pop-suppression-compte')), lieu + ' : Échap ferme la fenêtre de suppression');

    // Suppression confirmée, puis déconnexion (la page se recharge).
    await page.evaluate(() => { const so = sbClient.auth.signOut; sbClient.auth.signOut = function () { console.log('ÉCRITURES ' + window.__ECRITURES.filter((e) => /^(rpc:supprimer|auth:)/.test(e)).join(',')); return so.apply(this, arguments); }; });
    await page.click('#btnSupprimerCompte');
    await page.fill('.pop-suppression-compte .sc-mdp', 'nouveau-1234');
    await page.fill('.pop-suppression-compte .sc-mot', 'SUPPRIMER');
    await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
    const trace = consoles.filter((c) => /^ÉCRITURES/.test(c)).pop() || '';
    // La trace est écrite à l'appel de signOut : supprimer_mon_compte() juste avant.
    verifier(/auth:signIn:ok,rpc:supprimer_mon_compte$/.test(trace), lieu + ' : Entrée → mot de passe vérifié, supprimer_mon_compte(), déconnexion, rechargement (' + trace + ')');
    await page.waitForSelector('#legendeBarre');
    const local = await page.evaluate(() => localStorage.getItem('planning.profil'));
    verifier(local === null, lieu + ' : la copie du profil sur l\'appareil est effacée');
    // Se déconnecter depuis le menu.
    await page.evaluate(() => { const so = sbClient.auth.signOut; sbClient.auth.signOut = function () { console.log('DÉCONNEXION'); return so.apply(this, arguments); }; });
    // Suite 63 : « Se déconnecter » de la page Mon compte (plus de petit menu).
    const avatar = largeur < 600 ? '#lienDeconnexionNavBas' : '#lienDeconnexionNav';
    await page.click(avatar);
    await Promise.all([page.waitForEvent('load'), page.click('#btnDeconnexionCompte')]);
    verifier(consoles.indexOf('DÉCONNEXION') >= 0, lieu + ' : pastille → Mon compte → « Se déconnecter » → déconnexion et rechargement');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  // Profil déjà enregistré : photo et nom dès l'ouverture.
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: { profils: [{ user_id: 'u-test', prenom: 'Marc', nom: 'Rey', entreprise: 'X', photo: null }] } });
    await page.waitForTimeout(200);
    const r = { lettre: await page.textContent('#lienDeconnexionNav') };
    await page.evaluate(() => afficherPage('compte'));
    r.nom = await page.inputValue('#comptePrenom') + ' ' + await page.inputValue('#compteNom');
    verifier(r.lettre === 'M' && r.nom === 'Marc Rey' && await page.inputValue('#compteEntreprise') === 'X', 'profil existant : initiale, nom et entreprise repris (' + JSON.stringify(r) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  {
    // Table profils injoignable : pas d'erreur, pastille « L ».
    const { page, erreurs } = await ouvrirPlanning(browser, { tablesEnEchec: ['profils'] });
    verifier(await page.textContent('#lienDeconnexionNav') === 'L', 'table profils injoignable : pastille « L », pas d\'erreur');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 6. Espace entre deux semaines ------------------------------------
  // « Entre 2 semaines, il y a une bordure épaisse. A remplacer par un
  // petite espace de quelque pixel. Mêmes arrondis en haut et bas que sur
  // les bord du cadrillage, comme si on voyais 2 fenêtres côtes à côte. »
  {
    const T = [{ id: 1, personne_id: 2, date: '2026-09-25', demi: 'matin', ordre: 0, texte: 'À cheval', chantier_id: 1 },
      { id: 2, personne_id: 2, date: '2026-09-25', demi: 'aprem', ordre: 0, texte: 'À cheval', chantier_id: 1 },
      { id: 3, personne_id: 2, date: '2026-09-28', demi: 'matin', ordre: 0, texte: 'À cheval', chantier_id: 1 }];
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: { taches: T } });
    verifier(await page.evaluate(() => document.querySelectorAll('#racine .sep-semaines').length) === 0, '1 semaine : pas d\'espace');
    await page.evaluate(() => basculerDeuxSemaines());
    await page.waitForTimeout(400);
    const mesure = () => page.evaluate(() => {
      const th = document.querySelector('.grille .th.sem-frontiere:not(.th-demi)').getBoundingClientRect();
      const h = document.querySelector('#racine .sep-haut'), b = document.querySelector('#racine .sep-bas');
      const rh = h.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const e = document.querySelector('.entete-planning-scroll').getBoundingClientRect(), c = document.querySelector('.grille-cadre').getBoundingClientRect();
      const cs = getComputedStyle(h), coin = getComputedStyle(h.querySelector('.sep-coin-g'), '::before');
      const bordures = [...document.querySelectorAll('.sem-frontiere')].map((x) => getComputedStyle(x).borderLeftWidth).filter((w) => w !== '0px');
      // Le point du milieu de la bande : fond de page, pas la bulle à cheval dessous.
      const bulle = [...document.querySelectorAll('.bulle')].find((x) => /À cheval/.test(x.textContent)).getBoundingClientRect();
      const dessus = document.elementFromPoint(rb.left + 4, bulle.top + bulle.height / 2);
      return { n: document.querySelectorAll('#racine .sep-semaines').length, ecart: rh.left - th.left, largeur: rh.width, fond: cs.backgroundColor === getComputedStyle(document.body).backgroundColor,
        traits: cs.borderLeftWidth + '/' + cs.borderRightWidth, rayon: coin.borderTopRightRadius, alignes: rh.left === rb.left,
        haut: rh.top - e.top, jonction: rb.top - rh.bottom, bas: rb.bottom - c.bottom, bordures: bordures.length,
        bulleTraverse: bulle.left < rb.left && bulle.right > rb.right, clicDessous: dessus && !dessus.closest('.sep-semaines') };
    });
    const m = await mesure();
    verifier(m.n === 2 && m.ecart === -5 && m.largeur === 8 && m.fond && m.traits === '1px/1px' && m.alignes && m.bordures === 0,
      '2 semaines : la bordure épaisse est remplacée par un espace de 6 px bordé des deux côtés, fond de page (' + JSON.stringify(m) + ')');
    verifier(m.rayon === '12px' && m.haut === 0 && m.jonction === 0 && m.bas === 0, 'l\'espace va du bord du haut au bord du bas, arrondis de 12 px comme le cadre');
    verifier(m.bulleTraverse && m.clicDessous, 'une bulle à cheval passe derrière l\'espace ; un clic y atteint la grille dessous');
    if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/s61-deux-semaines.png' });
    // Zoom 125 % (cadre plus haut et plus large) : l'espace suit.
    await page.evaluate(() => { niveauZoomPlanning = 125; render(false); });
    await page.waitForTimeout(300);
    const m2 = await mesure();
    verifier(m2.bas === 0 && m2.haut === 0 && Math.abs(m2.ecart + 5) <= 1, 'zoom 125 % : l\'espace suit le cadre et la frontière (' + JSON.stringify({ haut: m2.haut, bas: m2.bas, ecart: m2.ecart }) + ')');
    await page.evaluate(() => { niveauZoomPlanning = 100; render(false); });
    // Maj après un clic sur un onglet : pas de contour (« fait apparaître une sélection »).
    await page.click('.onglet[data-page="jalons"]');
    await presser(page, 'Shift');
    const contour1 = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    await presser(page, 'Tab');
    const contour2 = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    await page.mouse.click(700, 500);
    const classe = await page.evaluate(() => document.documentElement.classList.contains('nav-clavier'));
    verifier(contour1 === 'none' && contour2 === 'solid' && !classe, 'Maj après un clic sur un onglet : pas de contour ; Tab : contour ; clic : plus de contour (' + contour1 + ', ' + contour2 + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  {
    // Téléphone, vue « 1 jour » : pas de bande, le trait d'avant reste.
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true });
    const t = await page.evaluate(() => ({ n: document.querySelectorAll('#racine .sep-semaines').length, bord: getComputedStyle(document.querySelector('.cell.sem-frontiere')).borderLeftWidth }));
    verifier(t.n === 0 && t.bord === '3px', 'téléphone, vue 1 jour : inchangé (' + JSON.stringify(t) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 7. Résumé des statuts : la tâche choisie est sélectionnée --------
  // « Quand on appuis sur une tâches dans le résumé des statut, le planning
  // se place sur la semaine de la tâche […] ajoute la sélection automatique
  // de la tâches pour la retrouver plus vite »
  {
    const T = (id, pid, date, demi, texte, ch, st) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: ch, statut_id: st });
    const PERS = [{ id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true }, { id: 2, nom: 'Mathis', sous_traitant: false, ordre: 2, actif: true }];
    for (let i = 3; i < 16; i++) PERS.push({ id: i, nom: 'Personne ' + i, sous_traitant: false, ordre: i, actif: true });
    PERS.push({ id: 20, nom: 'Echafaudage', sous_traitant: true, ordre: 20, actif: true });
    const BD7 = {
      personnes: PERS,
      statuts: [{ id: 1, cle: 'areserver', nom: 'à réserver', couleur: '#f9c8c8', ordre: 1 }, { id: 2, cle: 'reserve', nom: 'réservé', couleur: '#eec79b', ordre: 2 }],
      taches: [T(1, 20, '2026-10-01', 'matin', 'Montage échafaudage', 1, 1), T(2, 20, '2026-10-01', 'aprem', 'Montage échafaudage', 1, 1), T(3, 20, '2026-10-02', 'matin', 'Montage échafaudage', 1, 1),
        T(4, 20, '2026-10-01', 'matin', 'Montage échafaudage', 1, null), // même texte, sans statut : pas elle
        T(5, 2, '2026-09-25', 'matin', 'Livraison armature', 1, 2)]
    };
    for (const [largeur, hauteur, tactile] of [[1400, 620, false], [390, 700, true]]) {
      const lieu = largeur + ' px';
      const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: hauteur }, hasTouch: tactile, bd: BD7 });
      await page.waitForTimeout(1800);
      const bouton = tactile ? '#btnAReserverNavBas' : '#btnAReserver';
      const choisir = async (statut, n) => {
        await page.click(bouton); await page.waitForTimeout(300);
        await page.click('.pop-a-reserver .ar-statuts .chip[data-statut="' + statut + '"]');
        await page.click('.pop-a-reserver .ar-ligne >> nth=' + n);
        await page.waitForTimeout(700);
      };
      const etatSel = () => page.evaluate(() => {
        const ids = Object.keys(bullesSelectionnees), dom = ids.length === 1 && document.querySelector('.bulle[data-id="' + ids[0] + '"]');
        const it = ids.length === 1 && itemParId(ids[0]);
        const r = dom && dom.getBoundingClientRect(), haut = document.querySelector('.entete-planning-figee').getBoundingClientRect().bottom;
        const nav = document.getElementById('navBas'), bas = nav && nav.offsetParent !== null ? nav.getBoundingClientRect().top : innerHeight;
        return { n: ids.length, texte: it && it.item.texte, statut: it && it.item.statut, personne: it && it.item.personneId, classe: dom && dom.classList.contains('selectionnee'),
          clignote: dom && dom.classList.contains('bulle-retrouvee'), visible: !!r && r.top >= haut - 1 && r.top < bas && r.left < innerWidth && r.right > 0,
          semaine: etat.semaines[etat.indexSemaine].debut };
      });
      await choisir('areserver', 0);
      const a = await etatSel();
      verifier(a.n === 1 && a.texte === 'Montage échafaudage' && a.statut === 'areserver' && String(a.personne) === '20' && a.classe && a.clignote && a.visible && a.semaine === '2026-09-28',
        lieu + ' : autre semaine — planning sur sa semaine, la tâche seule sélectionnée, à l\'écran, qui clignote (' + JSON.stringify(a) + ')');
      if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/s61-resume-selection-' + largeur + '.png' });
      if (!tactile) {
        await presser(page, 'Enter');
        verifier(await page.evaluate(() => !!popFermerActuel), lieu + ' : Entrée ouvre aussitôt la tâche sélectionnée');
        await presser(page, 'Escape');
      }
      await page.evaluate(() => allerAujourdhui());
      await page.waitForTimeout(500);
      await choisir('reserve', 0);
      const b = await etatSel();
      verifier(b.n === 1 && b.texte === 'Livraison armature' && b.classe && b.visible, lieu + ' : semaine déjà affichée — la tâche est sélectionnée aussi (' + JSON.stringify(b) + ')');
      await page.waitForTimeout(1400);
      verifier(await page.evaluate(() => !document.querySelector('.bulle-retrouvee')), lieu + ' : le clignotement s\'arrête');
      toutesErreurs.push(...erreurs);
      await page.close();
    }
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
