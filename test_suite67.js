const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 26.09.2026 (suite 67). Lionel :
//   « Setup affichage: * Entre 2 semaine > espace entre 2 semaine, ON/OFF
//     * Coin du planning arrondi, ON/OFF * Idem pour coin des bulles
//     * Ajouter gras, italique et taille de polices (petite,normal,grande,
//     très grande) sur jour de semaine, date, heure de travail et horaire.
//     réglage par ligne * Date sur week-end ne peut pas excéder 24 sept par
//     manque de place * Si le mois apparait dans les case du jour l'enlever
//     de la case de gauche. * Taille de police sur le planning
//     Planning: * Aouter l'année à la case de gauche »
//   « pas de barre, des icones pour gagner de la place »
//   « Ajouter une fine ligne autour des badge statuts dans les bulles »
//   « Les réglages d'affichage pourraient être différent entre desktop et
//     portable mais doivent etre conserver entre appareil de tailles
//     différentes. »
// Vérifie :
//   1. espace entre semaines, coins du planning, coins des bulles : des
//      interrupteurs (ancienne valeur « trait » = éteint) ;
//   2. icônes G / I / A par ligne (jour, date, heures, horaires) : planning
//      ET aperçu, enregistrées sur le compte, cachées si la ligne l'est ;
//      un clic sur G n'actionne pas l'interrupteur de la ligne ;
//   3. date du week-end en entier : le mois passe dessous, sans déborder ;
//   4. case de gauche : mois + année, l'année seule si le mois est déjà
//      dans les dates ;
//   5. taille des noms ; fine ligne autour des badges de statut ;
//   6. réglages de l'ordinateur et du téléphone, chacun sur le compte, le
//      téléphone reprenant ceux de l'ordinateur tant qu'il n'a rien changé ;
//   7. « chantier par défaut désélectionner mais un chantier est attribué à
//      l'ouverture du formulaire. Si aucun chantier n'est sélectionné,
//      l'entête disparait en blanc sur blanc. » : fiche d'une case déjà
//      occupée → « Aucun chantier », bandeau en texte foncé ;
//   8. « Le surlignement de la case de dépose se dessine au dessus des
//      bulles » : il passe dessous.
//
// Lancer : node test_suite67.js

const T = (id, pid, date, demi, texte, st) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1, statut_id: st || null });
const H = (id, du, au, md, mf, ad, af) => ({ id, date_debut: du, date_fin: au, matin_debut: md + ':00', matin_fin: mf + ':00', aprem_debut: ad + ':00', aprem_fin: af + ':00', pause_matin: 15 });
const BD = () => ({
  horaires: [H(1, '2026-09-01', '2026-10-31', '07:00', '12:00', '13:00', '17:00')],
  statuts: [{ id: 1, cle: 'confirme', nom: 'Confirmé', couleur: '#f7e6ab', ordre: 1 }],
  taches: [T(1, 1, '2026-09-24', 'matin', 'Bétonnage dalle'), T(2, 2, '2026-09-24', 'matin', 'Armature dalle', 1)]
});
const attr = (page, a) => page.evaluate((n) => document.documentElement.getAttribute('data-aff-' + n), a);
const pastille = async (page, id, v) => { await page.click('#page-affichage .choix-pastille[data-option="' + id + '"][data-valeur="' + v + '"]'); await page.waitForTimeout(200); };
const icone = async (page, id, v) => { await page.click('#page-affichage .style-icone[data-option="' + id + '"]' + (v ? '[data-valeur="' + v + '"]' : '')); await page.waitForTimeout(200); };
const auPlanning = (page, f, arg) => page.evaluate(([src, a]) => { afficherPage('planning'); const r = (0, eval)(src)(a); afficherPage('affichage'); return r; }, [f.toString(), arg]);
const reglage = (page, cle) => page.evaluate((c) => { const r = (window.__BD.reglages || []).find((x) => x.cle === c); return r ? JSON.parse(JSON.stringify(r.valeur)) : null; }, cle);
const style = ([sel, prop]) => { const n = document.querySelector(sel); return n ? getComputedStyle(n)[prop] : null; };

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1 à 5. Ordinateur -------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD() });
    await page.evaluate(() => basculerDeuxSemaines()); await page.waitForTimeout(400);

    // 4. Case de gauche : mois + année.
    const coin0 = await page.evaluate(() => { const m = document.querySelector('.coin-mois'), a = document.querySelector('.coin-annee'); return [m && m.textContent, a && a.textContent]; });
    verifier(coin0[1] === '2026' && /sept/.test(coin0[0] || ''), 'case de gauche : le mois et l\'année (' + coin0.join(' / ') + ')');
    const coinOct = await page.evaluate(() => htmlCoinMoisAnnee(['2026-09-28', '2026-10-09']));
    verifier(/sept\..*–.*oct\./.test(coinOct) && /2026/.test(coinOct), '2 semaines sur 2 mois : « sept. – oct. » et 2026 (' + coinOct + ')');
    const coinAn = await page.evaluate(() => htmlCoinMoisAnnee(['2026-12-28', '2027-01-08']));
    verifier(/2026/.test(coinAn) && /2027/.test(coinAn), 'à cheval sur 2 années : les 2 années (' + coinAn + ')');

    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(250);

    // 1. Interrupteurs
    const inter = await page.evaluate(() => ['separation', 'cadre', 'coins'].map((id) => { const c = document.getElementById('chkAff-' + id); return c && c.type === 'checkbox' && c.checked ? id : '-'; }).join(','));
    verifier(inter === 'separation,cadre,coins', 'espace entre semaines, coins du planning, coins des bulles : des interrupteurs allumés (' + inter + ')');
    const noms = await page.evaluate(() => ['separation', 'cadre', 'coins'].map((id) => document.querySelector('.reglage-ligne[data-option="' + id + '"] .reglage-nom b').textContent).join('|'));
    verifier(noms === 'Espace entre 2 semaines|Coins du planning arrondis|Coins des bulles arrondis', 'libellés des interrupteurs (' + noms + ')');
    await page.click('#page-affichage .reglage-ligne[data-option="cadre"] .interrupteur'); await page.waitForTimeout(200);
    const cadre = [await attr(page, 'cadre')];
    const rayon = await page.evaluate(() => { afficherPage('planning'); const r = getComputedStyle(document.querySelector('.grille-cadre')).borderTopLeftRadius; afficherPage('affichage'); return r; });
    verifier(cadre[0] === 'carres' && rayon === '0px', 'coins du planning éteints : carrés (' + cadre[0] + ', ' + rayon + ')');
    await page.click('#page-affichage .reglage-ligne[data-option="coins"] .interrupteur'); await page.waitForTimeout(200);
    verifier(await attr(page, 'coins') === 'droits', 'coins des bulles éteints : droits (' + await attr(page, 'coins') + ')');
    await page.click('#page-affichage .reglage-ligne[data-option="separation"] .interrupteur'); await page.waitForTimeout(200);
    verifier(await attr(page, 'separation') === 'rien', 'espace entre semaines éteint : un simple trait (' + await attr(page, 'separation') + ')');
    for (const id of ['separation', 'cadre', 'coins']) await page.click('#page-affichage .reglage-ligne[data-option="' + id + '"] .interrupteur');
    await page.waitForTimeout(200);
    verifier(await page.evaluate(() => ['separation', 'cadre', 'coins'].every((n) => !document.documentElement.hasAttribute('data-aff-' + n))), 'rallumés : plus d\'attribut (l\'origine)');

    // 2. Icônes par ligne
    const icones = await page.evaluate(() => ['jourSemaine', 'formatDate', 'heures', 'ligneDemi'].map((id) => {
      const l = document.querySelector('.reglage-ligne[data-option="' + id + '"] .reglage-nom .icones-style');
      return l ? l.querySelectorAll('.style-gras').length + '' + l.querySelectorAll('.style-italique').length + l.querySelectorAll('.style-taille').length : '0';
    }).join(','));
    verifier(icones === '114,114,114,114', 'icônes G, I et 4 tailles à côté du nom des 4 lignes (' + icones + ')');
    const barre = await page.evaluate(() => document.querySelectorAll('#page-affichage .reglage-ligne[data-option$="Gras"], #page-affichage .reglage-ligne[data-option$="Taille"]').length);
    verifier(barre === 0, 'pas de ligne de réglage à part pour le style (' + barre + ')');
    const grasAvant = await page.evaluate(() => [...document.querySelectorAll('.reglage-ligne[data-option="jourSemaine"] .style-gras')].map((b) => b.classList.contains('actif') + '/' + b.getAttribute('aria-pressed')).join());
    verifier(grasAvant === 'true/true', 'à l\'origine : jour en gras (' + grasAvant + ')');

    await icone(page, 'formatDateItalique');
    const ital = [await auPlanning(page, style, ['.th-date', 'fontStyle']), await page.evaluate(() => getComputedStyle(document.querySelector('#apercuAffichage .aa-date')).fontStyle)];
    verifier(ital.join() === 'italic,italic', 'I sur la date : planning et aperçu en italique (' + ital + ')');
    await icone(page, 'jourSemaineGras');
    const gras = [await auPlanning(page, style, ['.th-jour', 'fontWeight']), await page.evaluate(() => getComputedStyle(document.querySelector('#apercuAffichage .aa-jour')).fontWeight)];
    verifier(gras.join() === '400,400', 'G sur le jour : plus en gras (' + gras + ')');
    const aDuree = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#apercuAffichage .aa-duree')).fontSize));
    await icone(page, 'heuresTaille', 'tresgrande');
    const taille = [await auPlanning(page, style, ['.th-duree', 'fontSize']), await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#apercuAffichage .aa-duree')).fontSize))];
    verifier(Math.abs(parseFloat(taille[0]) - 13.3) < .05 && Math.abs(taille[1] - aDuree * 1.4) < .05, 'heures en « Très grande » : 9.5 × 1.4 = 13.3 px, l\'aperçu aussi (' + taille[0] + ', ' + taille[1] + ' / ' + aDuree + ')');
    const etatTaille = await page.evaluate(() => [...document.querySelectorAll('.style-taille[data-option="heuresTaille"]')].map((b) => b.getAttribute('aria-checked') === 'true' ? 1 : 0).join(''));
    verifier(etatTaille === '0001', 'la 4e taille est cochée (' + etatTaille + ')');
    await icone(page, 'heuresGras');
    const heures = await page.evaluate(() => [document.getElementById('chkAff-heures').checked, optionAffichage('heures'), optionAffichage('heuresGras')].join());
    verifier(heures === 'true,oui,non', 'G sur les heures : n\'éteint pas les heures de travail (' + heures + ')');
    await icone(page, 'ligneDemiTaille', 'petite');
    const demi = await auPlanning(page, style, ['.th.th-demi', 'fontSize']);
    verifier(Math.abs(parseFloat(demi) - 8.5 * .85) < .05, 'horaires en « Petite » : 8.5 × 0.85 px (' + demi + ')');
    await page.waitForTimeout(600);
    const compte = await reglage(page, 'affichage');
    verifier(compte && compte.formatDateItalique === 'oui' && compte.jourSemaineGras === 'non' && compte.heuresTaille === 'tresgrande' && compte.ligneDemiTaille === 'petite',
      'enregistré sur le compte (clé « affichage » : ' + JSON.stringify(compte) + ')');
    await pastille(page, 'jourSemaine', 'masque');
    const cachees = await page.evaluate(() => document.querySelector('.reglage-ligne[data-option="jourSemaine"] .icones-style').hidden);
    verifier(cachees === true, 'jour de la semaine masqué : ses icônes aussi');
    await pastille(page, 'jourSemaine', 'abrege');

    // 3. Date du week-end en entier
    await pastille(page, 'formatDate', 'complet');
    await page.click('#page-affichage .reglage-ligne[data-option="weekends"] .interrupteur'); await page.waitForTimeout(300);
    const we = await page.evaluate(() => {
      afficherPage('planning');
      const r = [...document.querySelectorAll('.th.th-weekend:not(.th-demi)')].map((th) => { const d = th.querySelector('.th-date'); const m = d && d.querySelector('.date-mois-we');
        return { txt: d ? d.textContent : '', mois: m ? m.textContent : '', deborde: th.scrollWidth > th.clientWidth + 1 }; });
      const semaine = [...document.querySelectorAll('.th[data-gi]:not(.th-demi):not(.th-weekend) .th-date')].map((d) => d.textContent)[0];
      afficherPage('affichage');
      return { r, semaine };
    });
    verifier(we.r.length >= 2 && we.r.every((x) => /^\d+(sept|oct)\.$/.test(x.txt) && x.txt.endsWith(x.mois) && !x.deborde),
      'week-end, date « complète » : jour puis « sept. » dessous, sans déborder (' + JSON.stringify(we.r) + ')');
    verifier(/septembre/.test(we.semaine), 'jours de semaine : toujours le mois en entier (' + we.semaine + ')');
    const apWe = await page.evaluate(() => { const b = document.querySelector('#apercuAffichage .aa-we .aa-date'); return b ? b.innerHTML : ''; });
    verifier(/date-mois-we/.test(apWe), 'aperçu : même date de week-end (' + apWe + ')');
    const coinComplet = await auPlanning(page, () => [!!document.querySelector('.coin-mois'), (document.querySelector('.coin-annee') || {}).textContent].join());
    const apCoin = await page.evaluate(() => document.querySelector('#apercuAffichage .aa-coin').textContent);
    verifier(coinComplet === 'false,2026' && apCoin === '2026', 'mois déjà dans les dates : l\'année seule à gauche (' + coinComplet + ', aperçu ' + apCoin + ')');
    await pastille(page, 'formatDate', 'numero');
    const coinNombre = await auPlanning(page, () => (document.querySelector('.coin-mois') || {}).textContent);
    verifier(/sept/.test(coinNombre || ''), 'date sans le mois : le mois revient à gauche (' + coinNombre + ')');

    // 5. Taille des noms, ligne autour des badges
    const lbl0 = await auPlanning(page, style, ['.lbl:not(.lbl-speciale) b', 'fontSize']);
    await pastille(page, 'noms', 'grand');
    const lbl1 = await auPlanning(page, style, ['.lbl:not(.lbl-speciale) b', 'fontSize']);
    verifier(lbl0 === '12.5px' && Math.abs(parseFloat(lbl1) - 12.5 * 1.15) < .05 && await attr(page, 'noms') === 'grand', 'taille des noms « Grande » : ' + lbl0 + ' → ' + lbl1);
    const badges = [await auPlanning(page, style, ['.b-statut', 'boxShadow']), await page.evaluate(() => getComputedStyle(document.querySelector('#apercuAffichage .aa-statut')).boxShadow)];
    verifier(badges.every((b) => /inset/.test(b || '') && /1px/.test(b || '')), 'fine ligne autour des badges de statut (' + badges.join(' | ') + ')');

    // Profils : sur ordinateur, le texte ; le téléphone n'a rien de propre.
    await pastille(page, 'texte', 'grand'); await page.waitForTimeout(600);
    const jeu = await page.evaluate(() => [document.getElementById('affichageJeu').textContent, document.getElementById('btnAffichageReprendre').hidden].join('|'));
    verifier(/ordinateurs et tablettes/.test(jeu) && /\|true$/.test(jeu), 'ordinateur : « Réglages des ordinateurs et tablettes du compte », pas de « Reprendre » (' + jeu + ')');
    verifier((await reglage(page, 'affichage')).texte === 'grand' && await reglage(page, 'affichage_tel') === null, 'texte « Grand » : dans les réglages de l\'ordinateur seulement');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 6. Téléphone ------------------------------------------------------
  {
    const reglages = [{ cle: 'affichage', valeur: { texte: 'grand', noms: 'grand' }, maj: '2026-09-26T08:00:00Z' }];
    const bd = Object.assign(BD(), { reglages });
    let { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, bd });
    verifier(await attr(page, 'texte') === 'grand' && await attr(page, 'noms') === 'grand', 'téléphone sans réglages propres : ceux de l\'ordinateur (texte ' + await attr(page, 'texte') + ')');
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(250);
    const jeu = await page.evaluate(() => [document.getElementById('affichageJeu').textContent, document.getElementById('btnAffichageReprendre').hidden].join('|'));
    verifier(/téléphones du compte/.test(jeu) && /pour l’instant ceux de l’ordinateur/.test(jeu) && /\|true$/.test(jeu), 'page : « Réglages des téléphones… pour l’instant ceux de l’ordinateur » (' + jeu + ')');
    await pastille(page, 'texte', 'petit'); await page.waitForTimeout(600);
    const tel = await reglage(page, 'affichage_tel'), ordi = await reglage(page, 'affichage');
    verifier(tel && tel.texte === 'petit' && tel.noms === 'grand' && !('vueTel' in tel) && ordi.texte === 'grand',
      'texte « Petit » sur le téléphone : clé « affichage_tel » (' + JSON.stringify(tel) + '), l\'ordinateur garde « Grand »');
    verifier(await attr(page, 'texte') === 'petit', 'appliqué sur le téléphone');
    await pastille(page, 'vueTel', 'semaine'); await page.waitForTimeout(600);
    const ordi2 = await reglage(page, 'affichage'), tel2 = await reglage(page, 'affichage_tel');
    verifier(ordi2.vueTel === 'semaine' && !('vueTel' in tel2), '« À l’ouverture » choisi sur le téléphone : reste dans les réglages communs (' + JSON.stringify(ordi2) + ')');
    const jeu2 = await page.evaluate(() => [document.getElementById('affichageJeu').textContent, document.getElementById('btnAffichageReprendre').textContent, document.getElementById('btnAffichageReprendre').hidden].join('|'));
    verifier(!/pour l’instant/.test(jeu2) && /Reprendre ceux de l’ordinateur\|false$/.test(jeu2), 'réglages propres : bouton « Reprendre ceux de l’ordinateur » (' + jeu2 + ')');
    const bdFin = await page.evaluate(() => JSON.parse(JSON.stringify(window.__BD.reglages)));
    toutesErreurs.push(...erreurs);
    await page.close();

    // Un autre téléphone du compte : les mêmes réglages.
    ({ page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 375, height: 700 }, hasTouch: true, bd: Object.assign(BD(), { reglages: bdFin }) }));
    verifier(await attr(page, 'texte') === 'petit', 'autre téléphone du compte : texte « Petit » (' + await attr(page, 'texte') + ')');
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(250);
    await page.click('#btnAffichageReprendre'); await page.waitForTimeout(600);
    const repris = [await attr(page, 'texte'), JSON.stringify(await reglage(page, 'affichage_tel'))];
    verifier(repris[0] === 'grand' && /"texte":"grand"/.test(repris[1]), '« Reprendre ceux de l’ordinateur » : texte « Grand » (' + repris.join(' ') + ')');
    toutesErreurs.push(...erreurs);
    await page.close();

    // Un ordinateur plus petit (tablette) : les réglages de l'ordinateur.
    ({ page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 900, height: 700 }, bd: Object.assign(BD(), { reglages: bdFin }) }));
    verifier(await attr(page, 'texte') === 'grand', 'tablette du compte : réglages de l\'ordinateur, texte « Grand » (' + await attr(page, 'texte') + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 7. Fiche tâche sans chantier -------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD() });
    const lire = () => { const p = document.querySelector('.form-pop'), b = p.querySelector('.bandeau');
      return { valeur: p.querySelector('.f-chantier').value, clair: b.classList.contains('clair'), texte: getComputedStyle(b.querySelector('.nom-grand')).color, fond: getComputedStyle(b).backgroundColor, bulles: getComputedStyle(document.querySelector('.grille .bulle')).color }; };
    const f = await page.evaluate((src) => {
      const gi = giDepuisIso('2026-09-24');
      ouvrirEdition(document.querySelector('.cell[data-kind="personne"][data-personne="1"][data-jour="' + gi + '"]'), null, 'tache', 300, 300);
      return (0, eval)(src)();
    }, lire.toString());
    verifier(f.valeur === '' && f.clair && f.texte !== 'rgb(255, 255, 255)', 'case déjà occupée (Padel), aucun chantier par défaut : « Aucun chantier », texte foncé (' + JSON.stringify(f) + ')');
    await page.selectOption('.form-pop .f-chantier', '26182 - Terrain de Padel');
    const f2 = await page.evaluate((src) => (0, eval)(src)(), lire.toString());
    verifier(f2.valeur === '26182 - Terrain de Padel' && !f2.clair && f2.texte === f2.bulles && f2.texte !== 'rgb(255, 255, 255)', 'chantier choisi : sa couleur, texte de la couleur du texte des tâches (« texte d\'entête du formulaire peu visible », ' + JSON.stringify(f2) + ')');
    await page.selectOption('.form-pop .f-chantier', '');
    const f3 = await page.evaluate((src) => (0, eval)(src)(), lire.toString());
    verifier(f3.clair && f3.texte !== 'rgb(255, 255, 255)' && f3.fond !== f2.fond, 'revenu à « Aucun chantier » : plus de blanc sur blanc (' + JSON.stringify(f3) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 8. Surlignement de dépose sous les bulles -------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD() });
    const src = await page.locator('.grille .bulle:has-text("Armature dalle")').first().boundingBox();
    const dst = await page.locator('.grille .bulle:has-text("Bétonnage dalle")').first().boundingBox();
    await page.mouse.move(src.x + 20, src.y + src.height / 2); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(src.x + 20 + (dst.x + 30 - src.x - 20) * i / 8, src.y + src.height / 2 + (dst.y + dst.height + 8 - src.y - src.height / 2) * i / 8); await page.waitForTimeout(30); }
    await page.waitForTimeout(200);
    const z = await page.evaluate(() => {
      const zi = (el) => { const v = getComputedStyle(el).zIndex; return v === 'auto' ? 0 : +v; };
      const b = [...document.querySelectorAll('.grille .bulle')].find((x) => /Bétonnage dalle/.test(x.textContent));
      const s = document.querySelector('.survol-precis') || document.querySelector('.cell.drop-hover');
      return s ? { surlignage: s.className, zS: zi(s), zB: zi(b), memeParent: s.parentElement === b.parentElement } : null;
    });
    await page.mouse.up(); await page.waitForTimeout(300);
    verifier(z && z.zS < z.zB, 'case de dépose surlignée SOUS la bulle qui l\'occupe (' + JSON.stringify(z) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JavaScript (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  bilan();
})();
