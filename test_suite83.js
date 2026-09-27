const { chromium } = require('playwright');
const path = require('path');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 27.09.2026 (suite 83). Lionel, page de consultation des ouvriers :
//   « Possibilité de modifier en plus de retirer avant consultation »
//   « Faire une barre de menu en bas. Y placer le bouton pour le formulaire
//     de demande de congé. Cloche Notifications à droite pour voir l'état
//     des demande de vacances. »
//   « Possibilité de modifier (nouvelle demande d'approbation) ou annuler
//     (Notification dans console bureau) une absence validé. »
//   « Possibilité de faire une nouvelle demande ou supprimer des
//     notifications une absence supprimée. »
//   « Commentaire "recharge la page pour voir les derniers changements." en
//     haut à la place de " le planning est tenu par le bureau" »
// Puis, dans le planning :
//   « Les notifications sont un élément important, il doit toujours rester
//     dans la toolbar. placer l'icône entre annuler/refaire et imprimer.
//     "ajouter ligne" à déplacer dans le menu 3points si manque de place. »
//   « Dans setup affichage: Manque la possibilité de modifier le format de
//     la cellule des dates de gauche (Mois, Année) »
// Vérifie :
//   1. consultation : en-tête « Recharge la page… », plus de pied ; barre
//      du bas (Demander une absence + cloche), compteur = réponses pas
//      encore vues, remis à zéro à l'ouverture (et après rechargement) ;
//   2. « Mes demandes » : états et gestes (en attente : Modifier / Retirer ;
//      acceptée : Modifier / Annuler l'absence ; refusée, supprimée :
//      Nouvelle demande / Supprimer) ;
//   3. Modifier une demande en attente (corrigée sur place), une absence
//      acceptée (demande « modification », l'ancienne cachée derrière),
//      Annuler l'absence, Nouvelle demande pré-remplie, Supprimer ;
//   4. bureau : modification et annulation dans les notifications ;
//      Accepter la modification (anciennes absences retirées, nouvelles
//      posées), Accepter l'annulation (absences retirées), Refuser ;
//   5. barre d'outils : cloche entre Annuler/Refaire et Imprimer à toutes
//      les largeurs, jamais dans « ⋮ » ; « Ajouter une ligne » s'y replie ;
//   6. page Affichage : format du mois et de l'année de la case de gauche.
//
// Lancer : node test_suite83.js

const CAPTURES = process.env.CAPTURE_DIR || null;
const JETON = '0123456789abcdef0123456789abcdef';

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1 à 3. Page de consultation ---------------------------------------
  {
    const etat = {
      demandes: [
        { id: 1, debut: '2026-09-28', fin: '2026-09-29', demi_debut: 'matin', demi_fin: 'aprem', motif: 'Congé', remarque: 'mariage', statut: 'en_attente', type: 'nouvelle' },
        { id: 2, debut: '2026-10-05', fin: '2026-10-09', demi_debut: 'matin', demi_fin: 'aprem', motif: 'Vacances', remarque: null, statut: 'acceptee', type: 'nouvelle', supprimee: false },
        { id: 3, debut: '2026-10-12', fin: '2026-10-12', demi_debut: 'matin', demi_fin: 'aprem', motif: 'Congé', remarque: 'dentiste', statut: 'refusee', type: 'nouvelle' },
        { id: 4, debut: '2026-10-19', fin: '2026-10-20', demi_debut: 'matin', demi_fin: 'aprem', motif: 'Congé', remarque: null, statut: 'acceptee', type: 'nouvelle', supprimee: true }
      ],
      appels: [], prochain: 10
    };
    const semaine = (lundi) => ({ personne: { nom: 'Mathis', sous_traitant: false, equipe: false }, lundi, aujourdhui: '2026-09-24', min: '2026-08-24', max: '2027-03-22',
      feries: [], horaires: [], taches: [], peut_demander: true, motifs: ['Congé', 'Vacances', 'Maladie'], demandes: etat.demandes });
    const page = await browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    const dialogues = [];
    page.on('dialog', (d) => { dialogues.push(d.message()); d.accept(); });
    await page.clock.setFixedTime(new Date('2026-09-24T10:00:00'));
    await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await page.route(/\/rest\/v1\/rpc\//, (r) => {
      const nom = r.request().url().split('/rpc/')[1], c = JSON.parse(r.request().postData() || '{}');
      const rep = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
      if (nom === 'consultation_planning') return rep(semaine(c.p_lundi || '2026-09-21'));
      etat.appels.push(nom + ':' + JSON.stringify(c));
      const q = etat.demandes.find((x) => x.id === c.p_id);
      const nouvelle = (type, remplace) => { const id = etat.prochain++; etat.demandes.push({ id, debut: c.p_debut || q.debut, fin: c.p_fin || q.fin, demi_debut: c.p_demi_debut || q.demi_debut, demi_fin: c.p_demi_fin || q.demi_fin, motif: c.p_motif || q.motif, remarque: c.p_remarque === undefined ? q.remarque : (c.p_remarque || null), statut: 'en_attente', type, remplace_id: remplace }); return id; };
      if (nom === 'consultation_demander_absence') return rep({ ok: true, id: nouvelle('nouvelle', null) });
      if (nom === 'consultation_modifier_demande') {
        if (q.statut === 'en_attente') { Object.assign(q, { debut: c.p_debut, fin: c.p_fin, demi_debut: c.p_demi_debut, demi_fin: c.p_demi_fin, motif: c.p_motif, remarque: c.p_remarque || null }); return rep({ ok: true, id: q.id }); }
        return rep({ ok: true, id: nouvelle('modification', q.id) });
      }
      if (nom === 'consultation_annuler_absence') return rep({ ok: true, id: nouvelle('annulation', q.id) });
      if (nom === 'consultation_annuler_demande') { etat.demandes = etat.demandes.filter((x) => x.id !== c.p_id); return rep(true); }
      if (nom === 'consultation_masquer_demande') { etat.demandes = etat.demandes.filter((x) => x.id !== c.p_id); return rep(true); }
      return rep(null);
    });
    await page.goto('file://' + path.join(__dirname, 'consultation.html') + '?j=' + JETON);
    await page.waitForTimeout(500);

    // 1. En-tête, pied, barre du bas, compteur.
    const e1 = await page.evaluate(() => {
      const barre = document.getElementById('barreBas'), r = barre.getBoundingClientRect(), dem = document.getElementById('btnDemanderAbsence').getBoundingClientRect(),
        cloche = document.getElementById('btnNotifications').getBoundingClientRect();
      return { sous: document.querySelector('.entete .sous').textContent, pied: !!document.querySelector('.pied'), ancien: !!document.getElementById('blocAbsences'),
        enBas: !barre.hidden && Math.round(r.bottom) === innerHeight, clocheADroite: cloche.left > dem.right && cloche.right <= innerWidth,
        libelle: document.getElementById('btnDemanderAbsence').textContent.trim(), compte: (() => { const b = document.getElementById('compteNotifications'); return b.hidden ? '' : b.textContent; })(),
        deborde: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s83-consultation.png' });
    verifier(e1.sous === 'Recharge la page pour voir les derniers changements.' && !e1.pied && !e1.ancien, 'en-tête : « Recharge la page… » à la place de « tenu par le bureau », plus de pied ni de bloc « Mes absences » (' + JSON.stringify(e1) + ')');
    verifier(e1.enBas && e1.clocheADroite && e1.libelle === 'Demander une absence' && !e1.deborde, 'barre du bas : « Demander une absence » puis la cloche à droite (' + JSON.stringify(e1) + ')');
    verifier(e1.compte === '3', 'cloche : 3 réponses pas encore vues (acceptée, refusée, supprimée) (' + e1.compte + ')');

    // 2. Liste, états, gestes.
    const lire = () => page.evaluate(() => [...document.querySelectorAll('#feuille .demandes li')].map((l) => ({ id: +l.dataset.id, etat: l.querySelector('.etat').textContent,
      texte: l.querySelector('.dq-texte').innerText.replace(/\s+/g, ' '), gestes: [...l.querySelectorAll('[data-action]')].map((b) => b.textContent).join('/'), nonVu: l.classList.contains('non-vu') })));
    await page.click('#btnNotifications'); await page.waitForTimeout(200);
    let l = await lire();
    const f = await page.evaluate(() => ({ titre: document.getElementById('feuilleTitre').textContent, compte: document.getElementById('compteNotifications').hidden }));
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s83-mes-demandes.png' });
    verifier(f.titre === 'Mes demandes d’absence' && l.map((x) => x.etat + ':' + x.gestes).join(' | ') ===
      'En attente:Modifier/Retirer | Acceptée:Modifier/Annuler l’absence | Refusée:Nouvelle demande/Supprimer | Supprimée:Nouvelle demande/Supprimer',
      'Mes demandes : états et gestes (' + JSON.stringify(l.map((x) => x.etat + ':' + x.gestes)) + ')');
    verifier(l.filter((x) => x.nonVu).map((x) => x.id).join() === '2,3,4' && f.compte && /Retirée du planning par le bureau/.test(l[3].texte), 'réponses nouvelles signalées, compteur remis à zéro à l\'ouverture (' + JSON.stringify(l.map((x) => x.nonVu)) + ')');

    // 3a. Modifier la demande en attente : corrigée sur place.
    await page.click('#feuille li[data-id="1"] [data-action="modifier"]'); await page.waitForTimeout(150);
    const fm = await page.evaluate(() => ({ titre: document.getElementById('feuilleTitre').textContent, motif: document.getElementById('faMotif').value, debut: document.getElementById('faDebut').value,
      fin: document.getElementById('faFin').value, rq: document.getElementById('faRemarque').value, envoyer: document.getElementById('faEnvoyer').textContent }));
    verifier(fm.titre === 'Modifier la demande' && fm.motif === 'Congé' && fm.debut === '2026-09-28' && fm.fin === '2026-09-29' && fm.rq === 'mariage' && fm.envoyer === 'Enregistrer',
      'Modifier (en attente) : formulaire pré-rempli, « Enregistrer » (' + JSON.stringify(fm) + ')');
    await page.fill('#faFin', '2026-09-30'); await page.selectOption('#faDemiFin', 'matin');
    await page.click('#faEnvoyer'); await page.waitForTimeout(500);
    l = await lire();
    const a1 = etat.appels.pop() || '';
    verifier(/^consultation_modifier_demande:.*"p_fin":"2026-09-30".*"p_demi_fin":"matin".*"p_id":1/.test(a1) && etat.demandes.length === 4 &&
      /du lun\. 28 sept\. au mer\. 30 sept\. matin/.test(l.find((x) => x.id === 1).texte), 'Modifier (en attente) : corrigée sur place, retour à « Mes demandes » (' + a1 + ')');

    // 3b. Modifier l'absence acceptée : nouvelle demande « modification ».
    await page.click('#feuille li[data-id="2"] [data-action="modifier"]'); await page.waitForTimeout(150);
    const fa = await page.evaluate(() => ({ titre: document.getElementById('feuilleTitre').textContent, origine: (document.querySelector('.fa-origine') || {}).textContent, envoyer: document.getElementById('faEnvoyer').textContent }));
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s83-modifier-absence.png' });
    verifier(fa.titre === 'Modifier l’absence' && /Absence acceptée : Vacances — du lun\. 5 oct\. au ven\. 9 oct\./.test(fa.origine) && fa.envoyer === 'Envoyer la modification',
      'Modifier (acceptée) : rappel de l\'absence, « Envoyer la modification » (' + JSON.stringify(fa) + ')');
    await page.fill('#faFin', '2026-10-07');
    await page.click('#faEnvoyer'); await page.waitForTimeout(500);
    l = await lire();
    const modif = l.find((x) => x.etat === 'Modification en attente');
    verifier(modif && !l.some((x) => x.id === 2) && /du lun\. 5 oct\. au mer\. 7 oct\..*Avant : du lun\. 5 oct\. au ven\. 9 oct\./.test(modif.texte) && modif.gestes === 'Modifier/Retirer',
      'Modification envoyée : « Modification en attente », avant / après, l\'absence acceptée derrière (' + JSON.stringify(l) + ')');

    // Retirer la modification : l'absence acceptée revient ; puis l'annuler.
    await page.click('#feuille li[data-id="' + modif.id + '"] [data-action="retirer"]'); await page.waitForTimeout(500);
    await page.click('#feuille li[data-id="2"] [data-action="annuler"]'); await page.waitForTimeout(500);
    l = await lire();
    const annul = l.find((x) => x.etat === 'Annulation en attente');
    verifier(annul && annul.gestes === 'Retirer' && /Le bureau est prévenu/.test(annul.texte) && /Annuler cette absence/.test(dialogues[dialogues.length - 1]) &&
      etat.appels.some((a) => /^consultation_annuler_absence:.*"p_id":2/.test(a)),
      'Annuler l\'absence : confirmation, « Annulation en attente », bureau prévenu (' + JSON.stringify(annul) + ')');
    await page.click('#feuilleFermer'); await page.click('#btnSuivante'); await page.waitForTimeout(400);
    const pointilles = await page.evaluate(() => [...document.querySelectorAll('.tache.demande')].map((t) => t.closest('.jour').dataset.date + ' ' + t.querySelector('.details').textContent));
    await page.click('#btnSuivante'); await page.waitForTimeout(400);
    const semAnnul = await page.evaluate(() => document.querySelectorAll('.tache.demande').length);
    verifier(pointilles.length === 5 && pointilles.every((t) => /Demande d’absence en attente/.test(t)) && semAnnul === 0,
      'semaines suivantes : la demande modifiée en pointillés (5 demi-journées), rien pour l\'annulation en attente (' + JSON.stringify([pointilles, semAnnul]) + ')');

    // 3c. Refusée : Nouvelle demande pré-remplie ; supprimée : Supprimer.
    await page.click('#btnNotifications'); await page.waitForTimeout(150);
    await page.click('#feuille li[data-id="3"] [data-action="nouvelle"]'); await page.waitForTimeout(150);
    const fn = await page.evaluate(() => ({ titre: document.getElementById('feuilleTitre').textContent, debut: document.getElementById('faDebut').value, rq: document.getElementById('faRemarque').value }));
    await page.click('#faEnvoyer'); await page.waitForTimeout(500);
    const a3 = etat.appels[etat.appels.length - 1];
    verifier(fn.titre === 'Nouvelle demande' && fn.debut === '2026-10-12' && fn.rq === 'dentiste' && /^consultation_demander_absence:.*"p_debut":"2026-10-12".*"p_remarque":"dentiste"/.test(a3),
      'Nouvelle demande depuis une refusée : pré-remplie, envoyée (' + JSON.stringify(fn) + ')');
    await page.click('#feuille li[data-id="4"] [data-action="masquer"]'); await page.waitForTimeout(500);
    l = await lire();
    verifier(!l.some((x) => x.id === 4) && etat.appels.some((a) => /^consultation_masquer_demande:.*"p_id":4/.test(a)), 'Supprimer : retirée de la liste (consultation_masquer_demande)');

    // Rechargement : les réponses déjà vues ne comptent plus.
    await page.reload(); await page.waitForTimeout(500);
    const c2 = await page.evaluate(() => document.getElementById('compteNotifications').hidden);
    etat.demandes.find((x) => x.id === 1).statut = 'acceptee';
    await page.reload(); await page.waitForTimeout(500);
    const c3 = await page.evaluate(() => document.getElementById('compteNotifications').textContent);
    verifier(c2 && c3 === '1', 'après rechargement : réponses vues oubliées du compteur, une nouvelle réponse → 1 (' + JSON.stringify([c2, c3]) + ')');
    await page.keyboard.press('Escape');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Bureau : modification et annulation ---------------------------
  {
    const A = (id, date, demi, texte) => ({ id, personne_id: 2, date, demi, ordre: 0, texte, chantier_id: null, statut_id: null, important: false, serie_id: null, est_absence: true });
    const D = (id, du, au, statut, type, remplace, rq) => ({ id, personne_id: 2, date_debut: du, date_fin: au, demi_debut: 'matin', demi_fin: 'aprem', motif: 'Vacances', remarque: rq || null, statut, type, remplace_id: remplace || null, cree_le: '2026-09-20T08:00:00Z' });
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: {
      taches: [A(1, '2026-09-28', 'matin', 'Vacances'), A(2, '2026-09-28', 'aprem', 'Vacances'), A(3, '2026-09-29', 'matin', 'Vacances'), A(4, '2026-09-29', 'aprem', 'Vacances'),
        A(5, '2026-10-05', 'matin', 'Congé'), A(6, '2026-10-05', 'aprem', 'Congé'), A(7, '2026-10-05', 'matin', 'Formation')].map((t, i) => (i === 6 ? Object.assign(t, { personne_id: 1 }) : t)),
      demandes_absence: [D(20, '2026-09-28', '2026-09-29', 'acceptee', 'nouvelle'), D(21, '2026-09-29', '2026-09-30', 'en_attente', 'modification', 20),
        Object.assign(D(22, '2026-10-05', '2026-10-05', 'acceptee', 'nouvelle'), { motif: 'Congé' }), Object.assign(D(23, '2026-10-05', '2026-10-05', 'en_attente', 'annulation', 22), { motif: 'Congé' })]
    } });
    await page.waitForTimeout(700);
    await page.click('#btnNotifications'); await page.waitForTimeout(400);
    const liste = await page.evaluate(() => [...document.querySelectorAll('.notif-demandes .da-liste li')].map((l) => l.className + ' · ' + l.querySelector('.da-quoi').textContent + ' · ' + l.querySelector('.da-quand').textContent));
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s83-bureau.png' });
    verifier(liste.join(' / ') === 'da-modification · Modification : Vacances · du mar. 29 sept. au mer. 30 sept. — avant : du lun. 28 sept. au mar. 29 sept. / da-annulation · Annulation : Congé · le lun. 5 oct.',
      'notifications du bureau : modification (avant / après) et annulation (' + liste.join(' / ') + ')');
    await page.click('.da-liste li[data-id="21"] .da-accepter'); await page.waitForTimeout(1200);
    const m = await page.evaluate(() => ({ abs: __BD.taches.filter((t) => t.est_absence && t.personne_id === 2).map((t) => t.date + ' ' + t.demi).sort().join(','),
      dem: __BD.demandes_absence.map((d) => d.id + ':' + d.statut).join(','), toast: (document.querySelector('.toast') || {}).textContent }));
    verifier(m.abs === '2026-09-29 aprem,2026-09-29 matin,2026-09-30 aprem,2026-09-30 matin,2026-10-05 aprem,2026-10-05 matin' && m.dem === '20:remplacee,21:acceptee,22:acceptee,23:en_attente' && /modifiée/.test(m.toast),
      'Accepter la modification : anciennes absences retirées, nouvelles posées, ancienne « remplacee » (' + JSON.stringify(m) + ')');
    await page.click('.da-liste li[data-id="23"] .da-accepter'); await page.waitForTimeout(1200);
    const n = await page.evaluate(() => ({ abs: __BD.taches.filter((t) => t.est_absence).map((t) => t.personne_id + ' ' + t.date + ' ' + t.demi + ' ' + t.texte).sort().join(','),
      dem: __BD.demandes_absence.map((d) => d.id + ':' + d.statut).join(','), toast: (document.querySelector('.toast') || {}).textContent, compte: document.querySelector('#btnNotifications .compte-notifications').hidden }));
    verifier(n.abs === '1 2026-10-05 matin Formation,2 2026-09-29 aprem Vacances,2 2026-09-29 matin Vacances,2 2026-09-30 aprem Vacances,2 2026-09-30 matin Vacances' &&
      n.dem === '20:remplacee,21:acceptee,22:annulee,23:acceptee' && /annulée.*retirée du planning/.test(n.toast) && n.compte,
      'Accepter l\'annulation : absences retirées (pas celles d\'un autre), ancienne « annulee » (' + JSON.stringify(n) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }
  {
    // Refuser une modification : l'absence reste telle quelle.
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: {
      taches: [{ id: 1, personne_id: 2, date: '2026-09-28', demi: 'matin', ordre: 0, texte: 'Congé', est_absence: true }],
      demandes_absence: [{ id: 30, personne_id: 2, date_debut: '2026-09-28', date_fin: '2026-09-28', demi_debut: 'matin', demi_fin: 'matin', motif: 'Congé', statut: 'acceptee', type: 'nouvelle' },
        { id: 31, personne_id: 2, date_debut: '2026-10-01', date_fin: '2026-10-01', demi_debut: 'matin', demi_fin: 'matin', motif: 'Congé', statut: 'en_attente', type: 'modification', remplace_id: 30 }]
    } });
    await page.waitForTimeout(700);
    await page.click('#btnNotifications'); await page.waitForTimeout(300);
    await page.click('.da-liste li[data-id="31"] .da-refuser'); await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({ abs: __BD.taches.map((t) => t.date + ' ' + t.demi).join(), dem: __BD.demandes_absence.map((d) => d.id + ':' + d.statut).join(), toast: (document.querySelector('.toast') || {}).textContent }));
    verifier(r.abs === '2026-09-28 matin' && r.dem === '30:acceptee,31:refusee' && /Modification de Mathis refusée/.test(r.toast), 'Refuser la modification : absence inchangée (' + JSON.stringify(r) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 5. Barre d'outils : cloche toujours là, entre Annuler/Refaire et Imprimer
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: { statuts: [{ id: 1, cle: 'areserver', nom: 'à réserver', couleur: '#f9c8c8', ordre: 1 }] } });
    await page.waitForTimeout(600);
    const res = [];
    for (const w of [1400, 1100, 900, 820, 700, 620]) {
      await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(220);
      res.push(await page.evaluate((w) => {
        const b = document.getElementById('legendeBarre'), g = document.getElementById('groupeNotifications'), r = g.getBoundingClientRect();
        const prec = g.previousElementSibling, suiv = g.nextElementSibling;
        return { w, dansBarre: g.parentElement === b && r.width > 0 && r.right <= b.getBoundingClientRect().right, entre: prec && prec.id + '>' + (suiv && suiv.id),
          ajoutReplie: !!document.querySelector('#toolbarSecondaire #groupeAjoutLigne') };
      }, w));
    }
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s83-barre-620.png', clip: { x: 0, y: 0, width: 620, height: 120 } });
    const ok = res.every((x) => x.dansBarre && /^groupeAnnulerRefaire>/.test(x.entre) && (x.entre === 'groupeAnnulerRefaire>groupeImprimer' || x.w <= 700));
    verifier(ok, 'cloche dans la barre à toutes les largeurs, juste après Annuler/Refaire (avant Imprimer tant qu\'il est dans la barre) (' + JSON.stringify(res) + ')');
    verifier(!res[0].ajoutReplie && res[res.length - 1].ajoutReplie, '« Ajouter une ligne » : dans la barre à 1400 px, replié dans « ⋮ » quand la place manque (' + JSON.stringify(res.map((x) => x.w + ':' + x.ajoutReplie)) + ')');
    await page.setViewportSize({ width: 620, height: 900 }); await page.waitForTimeout(200);
    await page.click('#btnPlusOutils'); await page.waitForTimeout(150);
    await page.click('#btnAjoutLigne').catch(() => {});
    await page.waitForTimeout(200);
    const ajout = await page.evaluate(() => { const b = document.getElementById('btnAjoutLigne'); return !!b && b.getBoundingClientRect().width > 0; });
    verifier(ajout, '« Ajouter une ligne » utilisable depuis « ⋮ »');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 6. Page Affichage : case de gauche --------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 } });
    const coin = () => page.evaluate(() => { const c = document.querySelector('.entete-planning-figee .th.coin'); return [...c.querySelectorAll('span')].map((s) => s.className + '=' + s.textContent).join(' '); });
    const avant = await coin();
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(300);
    const lignes = await page.evaluate(() => ['coinMois', 'coinAnnee'].map((id) => { const l = document.querySelector('#page-affichage .reglage-ligne[data-option="' + id + '"]');
      return l && l.querySelector('b').textContent + ':' + [...l.querySelectorAll('.choix-pastille')].map((b) => b.textContent).join('/') + ':' + l.querySelectorAll('.style-icone').length; }));
    verifier(lignes.join(' | ') === 'Case de gauche : mois:sept./septembre/09/Masqué:6 | Case de gauche : année:2026/26/Masquée:6',
      'page Affichage : « Case de gauche : mois » et « année », formats + gras / italique / tailles (' + lignes.join(' | ') + ')');
    await page.click('.choix-pastille[data-option="coinMois"][data-valeur="complet"]'); await page.waitForTimeout(150);
    await page.click('.choix-pastille[data-option="coinAnnee"][data-valeur="courte"]'); await page.waitForTimeout(150);
    await page.click('#page-affichage .style-icone[data-option="coinMoisGras"]'); await page.waitForTimeout(150);
    await page.click('#page-affichage .style-icone[data-option="coinAnneeTaille"][data-valeur="grande"]'); await page.waitForTimeout(150);
    const apercu = await page.evaluate(() => document.querySelector('#apercuAffichage .aa-coin').textContent);
    await page.evaluate(() => afficherPage('planning')); await page.waitForTimeout(300);
    const apres = await coin();
    const st = await page.evaluate(() => { const m = document.querySelector('.th.coin .coin-mois'), a = document.querySelector('.th.coin .coin-annee');
      return { mois: getComputedStyle(m).fontWeight, annee: Math.round(parseFloat(getComputedStyle(a).fontSize) / parseFloat(getComputedStyle(a.parentElement).fontSize) * 100) / 100 }; });
    verifier(avant === 'coin-mois=sept. coin-annee=2026' && apercu === 'septembre26' && apres === 'coin-mois=septembre coin-annee=26' && st.mois === '400' && st.annee === 1.2,
      'case de gauche : « septembre », « 26 », mois non gras, année plus grande — aperçu et planning (' + JSON.stringify({ avant, apercu, apres, st }) + ')');
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(200);
    await page.click('.choix-pastille[data-option="coinMois"][data-valeur="chiffres"]'); await page.waitForTimeout(150);
    await page.click('.choix-pastille[data-option="coinAnnee"][data-valeur="masquee"]'); await page.waitForTimeout(150);
    await page.evaluate(() => afficherPage('planning')); await page.waitForTimeout(300);
    const chiffres = await coin();
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(200);
    await page.click('.choix-pastille[data-option="coinMois"][data-valeur="masque"]'); await page.waitForTimeout(150);
    await page.click('.choix-pastille[data-option="coinAnnee"][data-valeur="complete"]'); await page.waitForTimeout(150);
    await page.evaluate(() => afficherPage('planning')); await page.waitForTimeout(300);
    const masque = await coin();
    verifier(chiffres === 'coin-mois=09' && masque === 'coin-annee=2026', 'mois « 09 » sans année ; mois masqué, année seule (' + JSON.stringify([chiffres, masque]) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
