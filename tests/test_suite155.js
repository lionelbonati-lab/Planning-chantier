const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 09.11.2026 (suite 155) — plusieurs plannings, étape 3 : les
// comptes. Lionel : « Un collègue aimerait utiliser mon planning pour ses
// propres besoins. Il doit pouvoir un compte et gérer son propre planning. »
// Ses choix : compte créé « Toi, depuis l'appli » ; invitations « Toi seul »,
// dans « un nouveau, ou le tien pour le partager ». Puis : « Fait toutes les
// étapes sans me redemander ».
// Vérifie :
//   A. functions/inviter-compte/logic.js : demande validée, mot de passe
//      provisoire (12 caractères sans ambiguïté, en 3 groupes).
//   B. functions/inviter-compte/index.ts : administrateur seul, planning de
//      son entreprise, compte confirmé avec changer_mot_de_passe, rien à
//      moitié fait, clé de service jamais renvoyée.
//   C. sql/0046 : clés par planning, creer_planning_ (fonction serveur
//      seule), comptes et plannings de l'entreprise, retirer un compte, le
//      dernier administrateur garde son compte. (Comportement testé sur une
//      copie locale de la base : tests/sql/test_0046_comptes.sql.)
//   D. Page Réglages › Comptes (administrateur) : liste, invitation (nouveau
//      planning ou planning partagé), message à envoyer, échec, retirer.
//   E. Compte membre : pas d'onglet Comptes.
//   F. Première connexion : choix du mot de passe avant le planning.
//   G. Fichiers joints : dans le dossier du planning.
//   H. Téléphone : rien ne déborde.
//
// Lancer : node test_suite155.js

const RACINE = path.join(__dirname, '..');
const SQL = fs.readFileSync(path.join(RACINE, 'sql/0046_comptes.sql'), 'utf8');
const INDEX = fs.readFileSync(path.join(RACINE, 'functions/inviter-compte/index.ts'), 'utf8');
const P1 = '11111111-2222-4333-8444-555555555555';
const P2 = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const COMPTES = [
  { user_id: 'u-lionel', email: 'lionel@exemple.ch', prenom: 'Lionel', nom: 'Bonati', planning_id: P1, planning: 'Lionel BONATI', role: 'admin',
    cree_le: '2026-09-01T08:00:00Z', derniere_connexion: '2026-09-24T07:30:00Z', moi: true, provisoire: false },
  { user_id: 'u-marc', email: 'marc@exemple.ch', prenom: 'Marc', nom: 'Rey', planning_id: P2, planning: 'Marc Rey', role: 'membre',
    cree_le: '2026-09-20T08:00:00Z', derniere_connexion: null, moi: false, provisoire: true }
];
const PLANNINGS = [
  { id: P1, nom: 'Lionel BONATI', comptes: 1, le_mien: true },
  { id: P2, nom: 'Marc Rey', comptes: 1, le_mien: false }
];

(async () => {
  const { verifier, bilan } = verificateur();
  const erreurs = [];

  // ---- A. logic.js --------------------------------------------------------------------------
  {
    const src = fs.readFileSync(path.join(RACINE, 'functions/inviter-compte/logic.js'), 'utf8').replace(/export \{[\s\S]*?\};\s*$/, '');
    const L = new Function(src + '; return { validerInvitation, motDePasseProvisoire, ALPHABET };')();
    const d = L.validerInvitation({ prenom: ' Paul ', nom: ' Muller ', email: ' Paul.Muller@Exemple.CH ', planning: 'nouveau', nom_planning: '' });
    const d2 = L.validerInvitation({ prenom: 'Paul', nom: '', email: 'p@e.ch', planning: P1, nom_planning: 'Équipe Paul' });
    verifier(d.prenom === 'Paul' && d.nom === 'Muller' && d.email === 'paul.muller@exemple.ch' && d.planning === 'nouveau' && d.nomPlanning === 'Paul Muller' &&
      d2.planning === P1 && d2.nomPlanning === 'Équipe Paul',
      'validerInvitation : noms et e-mail nettoyés (e-mail en minuscules), planning « nouveau » ou un id, nom du planning (' + JSON.stringify(d) + ')');
    const refus = (b) => { try { L.validerInvitation(b); return null; } catch (e) { return e.message; } };
    const r = [
      refus({ prenom: 'A', email: 'pas-une-adresse', planning: 'nouveau' }),
      refus({ email: 'a@b.ch', planning: 'nouveau' }),
      refus({ prenom: 'A', email: 'a@b.ch', planning: 'tous' }),
      refus({ prenom: 'A'.repeat(61), email: 'a@b.ch', planning: 'nouveau' }),
      refus(null)
    ];
    verifier(r[0] === 'Adresse e-mail invalide.' && r[1] === 'Indique au moins le prénom ou le nom.' && r[2] === 'Planning inconnu.' && r[3] === 'Nom trop long.' && r[4] === 'Adresse e-mail invalide.',
      'validerInvitation : e-mail invalide, sans nom, planning inconnu, nom trop long refusés (' + JSON.stringify(r) + ')');
    const fixe = L.motDePasseProvisoire([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const vus = new Set();
    let formes = true;
    for (let k = 0; k < 500; k++) {
      const o = Array.from({ length: 12 }, () => Math.floor(Math.random() * 256));
      const m = L.motDePasseProvisoire(o);
      if (!/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/.test(m) || /[01OIl]/.test(m)) formes = false;
      m.replace(/-/g, '').split('').forEach((c) => vus.add(c));
    }
    verifier(fixe === 'abcd-efgh-jkmn' && formes && vus.size === L.ALPHABET.length && !/[01OIl]/.test(L.ALPHABET),
      'mot de passe provisoire : « xxxx-xxxx-xxxx », sans 0 / O / 1 / l / I, tout l\'alphabet utilisé (' + fixe + ', ' + vus.size + ' caractères)');
  }

  // ---- B. index.ts --------------------------------------------------------------------------
  verifier(/const appelant = createClient\(url, Deno\.env\.get\("SUPABASE_ANON_KEY"\)[^;]*\{\s+global: \{ headers: \{ Authorization: authHeader \} \}/.test(INDEX) &&
    /await appelant\.rpc\("suis_admin"\);\s+if \(errAdmin \|\| admin !== true\) return json\(\{ ok: false, erreur: "Réservé à l’administrateur\." \}, 403\);/.test(INDEX) &&
    /\.from\("plannings"\)\.select\("id"\)\.eq\("id", planningId\)\.eq\("entreprise_id", entreprise\)/.test(INDEX),
    'inviter-compte : réservé à l\'administrateur (ses propres droits), planning partagé de son entreprise seulement');
  verifier(/email_confirm: true,\s+user_metadata: \{ changer_mot_de_passe: true, prenom: demande\.prenom, nom: demande\.nom \}/.test(INDEX) &&
    /service\.rpc\("creer_planning_", \{ p_entreprise: entreprise, p_nom: demande\.nomPlanning \}\)/.test(INDEX) &&
    /\.from\("membres"\)\.insert\(\{ user_id: userId, planning_id: planningId, role: "membre" \}\)/.test(INDEX) &&
    /catch \(e\) \{\s+await service\.auth\.admin\.deleteUser\(userId\);\s+if \(demande\.planning === "nouveau" && planningId !== "nouveau"\) await service\.from\("plannings"\)\.delete\(\)\.eq\("id", planningId\);/.test(INDEX),
    'inviter-compte : compte confirmé, mot de passe à changer, nouveau planning ou partagé, compte membre ; un échec efface le compte et le planning créés');
  verifier(/return json\(\{ ok: true, email: demande\.email, mot_de_passe: motDePasse \}\);/.test(INDEX) && (INDEX.match(/SUPABASE_SERVICE_ROLE_KEY/g) || []).length === 1 &&
    /crypto\.getRandomValues\(octets\)/.test(INDEX) && /deja \? "Cette adresse a déjà un compte\."/.test(INDEX),
    'inviter-compte : renvoie e-mail et mot de passe provisoire seulement (clé de service lue sur le serveur), hasard cryptographique, adresse déjà prise');

  // ---- C. sql/0046 --------------------------------------------------------------------------
  verifier(/alter table reglages add constraint reglages_pkey primary key \(planning_id, cle\);/.test(SQL) && /alter table couleurs_perso add constraint couleurs_perso_pkey primary key \(planning_id, id\);/.test(SQL),
    'sql/0046 : réglages et couleurs, clé par planning');
  verifier(/revoke all on function creer_planning_\(uuid, text\) from public, anon, authenticated;\s+grant execute on function creer_planning_\(uuid, text\) to service_role;/.test(SQL) &&
    /select pl, p\.id, p\.groupe_id is null from personnes p where p\.entreprise_id = p_entreprise and p\.planning_id is null/.test(SQL),
    'sql/0046 : creer_planning_ réservé à la fonction serveur ; personnel masqué dans le nouveau planning, Machines / Transports affichés');
  verifier(/where pl\.entreprise_id = mon_entreprise\(\) and \(suis_admin\(\) or m\.user_id = auth\.uid\(\)\)/.test(SQL) && /from plannings pl where pl\.entreprise_id = mon_entreprise\(\) and suis_admin\(\)/.test(SQL) &&
    /if not suis_admin\(\) then raise exception 'Réservé à l''administrateur\.'; end if;/.test(SQL) &&
    /if p_user = auth\.uid\(\) or cible\.role = 'admin' then raise exception/.test(SQL) &&
    /raise exception 'Tu es le seul administrateur : ton compte ne peut pas être supprimé\.';/.test(SQL) &&
    /revoke all on function comptes_entreprise\(\), plannings_entreprise\(\), retirer_compte\(uuid\) from public, anon;/.test(SQL),
    'sql/0046 : comptes (administrateur : tous ; les autres : le leur), plannings, retirer (ni soi, ni un administrateur), dernier administrateur protégé');
  verifier(!/^create (table|index|policy|trigger)(?! if not exists)/m.test(SQL) && /drop constraint if exists reglages_pkey/.test(SQL),
    'sql/0046 : rejouable');

  const browser = await lancerNavigateur(chromium);
  const init = (d) => {
    window.__ADMIN = d.admin; window.__PLANNING_ID = d.planning; window.__COMPTES = d.comptes; window.__PLANNINGS = d.plannings;
    if (d.auth) window.__AUTH_INITIALE = d.auth;
  };
  const lireCartes = (page) => page.evaluate(() => [...document.querySelectorAll('#listeComptes .compte')].map((c) => ({
    id: c.dataset.id, titre: c.querySelector('.lr-titre').textContent, email: c.querySelector('.cpt-email').textContent,
    planning: c.querySelector('.cpt-planning').textContent, vu: c.querySelector('.lr-vu').textContent, retirer: !!c.querySelector('[data-action="retirer"]')
  })));
  const journal = (page) => page.evaluate(() => window.__ECRITURES.filter((x) => /^(fn:inviter-compte|rpc:retirer_compte)/.test(x)));

  // ---- D. Administrateur --------------------------------------------------------------------
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 1280, height: 900 }, init,
      initArg: { admin: true, planning: P1, comptes: COMPTES, plannings: PLANNINGS } });
    const onglets = await page.evaluate(() => ({
      admin: etat.admin, planning: etat.planningId,
      cache: [...document.querySelectorAll('[data-page="comptes"]')].map((b) => b.hidden),
      entree: PAGES_REGLAGES.some((r) => r.page === 'comptes' && r.nom === 'Comptes' && r.admin)
    }));
    verifier(onglets.admin === true && onglets.planning === P1 && onglets.cache.length === 2 && onglets.cache.every((h) => !h) && onglets.entree,
      'administrateur : rôle et planning lus au démarrage, onglet « Comptes » affiché (barre du haut et liste du téléphone) (' + JSON.stringify(onglets) + ')');

    await page.evaluate(() => afficherPage('comptes'));
    await page.waitForTimeout(300);
    let cartes = await lireCartes(page);
    const options = await page.evaluate(() => [...document.querySelectorAll('#cptPlanning option')].map((o) => o.value + '|' + o.textContent));
    verifier(cartes.length === 2 && /^Lionel Bonati Administrateur Toi$/.test(cartes[0].titre) && !cartes[0].retirer && /^Dernière connexion : .+, \d\d:\d\d\.$/.test(cartes[0].vu) &&
      cartes[1].titre === 'Marc Rey' && cartes[1].email === 'marc@exemple.ch' && cartes[1].planning === 'Planning : Marc Rey' && cartes[1].retirer && cartes[1].vu === 'Pas encore connecté.',
      'liste : nom, rôle, e-mail, planning, dernière connexion ; « Retirer » sur un compte membre seulement (' + JSON.stringify(cartes) + ')');
    verifier(options.length === 3 && options[0] === 'nouveau|Un nouveau planning, à son nom' && options[1] === P1 + '|Partager « Lionel BONATI » (le tien)' &&
      options[2] === P2 + '|Partager « Marc Rey »',
      'planning du nouveau compte : un nouveau, ou un planning existant à partager (' + JSON.stringify(options) + ')');

    const grise = await page.evaluate(() => document.getElementById('btnInviterCompte').disabled);
    await page.fill('#cptPrenom', ' Paul ');
    await page.fill('#cptEmail', 'paul.muller@');
    const griseEmail = await page.evaluate(() => document.getElementById('btnInviterCompte').disabled);
    await page.fill('#cptNom', 'Muller');
    await page.fill('#cptEmail', ' Paul.Muller@Exemple.ch ');
    const allume = await page.evaluate(() => !document.getElementById('btnInviterCompte').disabled);
    await page.click('#btnInviterCompte');
    await page.waitForTimeout(300);
    let j = await journal(page);
    const cree = await page.evaluate(() => {
      const s = document.querySelector('#cptResultat .cpt-cree');
      return s && { titre: s.querySelector('.lr-titre').textContent, mdp: s.querySelector('.cpt-mdp').textContent, message: s.querySelector('.cpt-message').value,
        mailto: s.querySelector('a.btn-enregistrer').getAttribute('href'), copier: !!s.querySelector('[data-action="copier-message"]'),
        vides: ['cptPrenom', 'cptNom', 'cptEmail'].every((id) => document.getElementById(id).value === ''),
        grise: document.getElementById('btnInviterCompte').disabled, toast: document.getElementById('toast').textContent };
    });
    const corps = j[0] ? JSON.parse(j[0].replace(/^fn:inviter-compte:/, '')) : {};
    verifier(grise && griseEmail && allume && j.length === 1 && corps.prenom === 'Paul' && corps.nom === 'Muller' && corps.email === 'Paul.Muller@Exemple.ch' &&
      corps.planning === 'nouveau' && corps.nom_planning === 'Paul Muller',
      '« Créer le compte » grisé sans nom ou sans e-mail valable ; demande à inviter-compte : nom, e-mail, nouveau planning à son nom (' + JSON.stringify(corps) + ')');
    verifier(cree && cree.titre === 'Compte créé : Paul Muller' && cree.mdp === 'abcd-efgh-jkmn' &&
      /^Bonjour Paul,\n\nTon compte pour le planning chantiers est prêt :\nfile:\/\/.+\/index\.html\n\nAdresse e-mail : Paul\.Muller@Exemple\.ch\nMot de passe provisoire : abcd-efgh-jkmn\n\nÀ ta première connexion, tu choisiras ton propre mot de passe\.\n$/.test(cree.message) &&
      cree.mailto.startsWith('mailto:Paul.Muller%40Exemple.ch?subject=Ton%20compte%20pour%20le%20planning%20chantiers&body=Bonjour%20Paul') && cree.copier &&
      cree.vides && cree.grise && cree.toast === 'Compte créé pour Paul.Muller@Exemple.ch.',
      'compte créé : mot de passe provisoire, message prêt (adresse de l\'appli, e-mail, mot de passe), « Envoyer par e-mail », « Copier », cases vidées (' + JSON.stringify(cree) + ')');

    await page.click('[data-action="copier-message"]');
    await page.waitForTimeout(200);
    verifier(await page.evaluate(() => document.getElementById('toast').textContent) === 'Message copié.', '« Copier le message » : message copié');

    await page.fill('#cptPrenom', 'Anna');
    await page.fill('#cptEmail', 'anna@exemple.ch');
    await page.selectOption('#cptPlanning', P1);
    await page.click('#btnInviterCompte');
    await page.waitForTimeout(300);
    j = await journal(page);
    const corps2 = j[1] ? JSON.parse(j[1].replace(/^fn:inviter-compte:/, '')) : {};
    verifier(j.length === 2 && corps2.planning === P1 && corps2.prenom === 'Anna' && corps2.nom === '',
      'planning partagé : l\'id du planning choisi est envoyé (' + JSON.stringify(corps2) + ')');

    await page.evaluate(() => { window.__REPONSE_INVITER = { data: { ok: false, erreur: 'Cette adresse a déjà un compte.' }, error: null }; });
    await page.fill('#cptPrenom', 'Marc');
    await page.fill('#cptEmail', 'marc@exemple.ch');
    await page.click('#btnInviterCompte');
    await page.waitForTimeout(300);
    const echec = await page.evaluate(() => ({ toast: document.getElementById('toast').textContent, email: document.getElementById('cptEmail').value,
      actif: !document.getElementById('btnInviterCompte').disabled }));
    verifier(echec.toast === 'Échec : Cette adresse a déjà un compte.' && echec.email === 'marc@exemple.ch' && echec.actif,
      'échec : message du serveur, cases gardées, bouton de nouveau actif (' + JSON.stringify(echec) + ')');

    await page.click('.compte[data-id="u-marc"] [data-action="retirer"]');
    await page.waitForTimeout(150);
    const texte = await page.evaluate(() => document.querySelector('.confirm-pop .confirm-texte').textContent);
    await page.click('.confirm-pop .c-ok');
    await page.waitForTimeout(300);
    j = await journal(page);
    cartes = await lireCartes(page);
    verifier(/^Retirer le compte de Marc Rey \? Il ne pourra plus se connecter\. Son planning \(« Marc Rey »\) et ses données restent\.$/.test(texte) &&
      j[j.length - 1] === 'rpc:retirer_compte:u-marc' && cartes.length === 1 && cartes[0].id === 'u-lionel',
      '« Retirer le compte » + confirmation : retirer_compte, carte enlevée (' + texte + ')');

    const dossier = await page.evaluate(() => dossierPieces_());
    verifier(dossier === P1 + '/', 'fichiers joints : rangés dans le dossier du planning (' + dossier + ')');
    erreurs.push(...e);
    await page.close();
  }

  // ---- E. Compte membre ---------------------------------------------------------------------
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 1280, height: 900 }, init, initArg: { admin: false, planning: null } });
    const r = await page.evaluate(() => ({ admin: etat.admin, cache: [...document.querySelectorAll('[data-page="comptes"]')].map((b) => b.hidden) }));
    const dossier = await page.evaluate(() => dossierPieces_());
    verifier(r.admin === false && r.cache.length === 2 && r.cache.every(Boolean) && dossier === '',
      'compte membre : onglet « Comptes » caché ; planning inconnu : fichiers à la racine comme avant (' + JSON.stringify(r) + ')');
    erreurs.push(...e);
    await page.close();
  }

  // ---- F. Première connexion ----------------------------------------------------------------
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, init, attendre: '#formChoixMdp',
      initArg: { admin: false, planning: P2, auth: { motDePasse: 'abcd-efgh-jkmn', metadata: { changer_mot_de_passe: true, prenom: 'Paul', nom: 'Muller' } } } });
    const ecran = await page.evaluate(() => ({ texte: document.querySelector('.login-card .sous-titre').textContent, planning: !!document.getElementById('legendeBarre'),
      deconnexion: !!document.getElementById('btnChoixMdpDeconnexion') }));
    verifier(/^Bienvenue Paul\. Choisis ton mot de passe \(8 caractères au moins\) : il remplace le mot de passe provisoire\.$/.test(ecran.texte) && !ecran.planning && ecran.deconnexion,
      'première connexion : choix du mot de passe avant le planning, « Se déconnecter » possible (' + JSON.stringify(ecran) + ')');
    const essai = async (a, b) => {
      await page.fill('#champNouveauMdp', a); await page.fill('#champNouveauMdp2', b);
      await page.click('#btnChoixMdp'); await page.waitForTimeout(250);
      return page.evaluate(() => (document.getElementById('erreurChoixMdp') || {}).textContent || '');
    };
    const m = [await essai('court', 'court'), await essai('NouveauMdp2026', 'NouveauMdp2025'), await essai('abcd-efgh-jkmn', 'abcd-efgh-jkmn')];
    verifier(m[0] === 'Le mot de passe doit faire au moins 8 caractères.' && m[1] === 'Les deux mots de passe ne sont pas les mêmes.' &&
      m[2] === 'Choisis un autre mot de passe que le provisoire.',
      'trop court, différents, ou le provisoire : refusés avec un message (' + JSON.stringify(m) + ')');
    await essai('NouveauMdp2026', 'NouveauMdp2026');
    await page.waitForSelector('#legendeBarre', { state: 'attached', timeout: 5000 }).catch(() => {});
    const apres = await page.evaluate(() => ({ mdp: window.__AUTH.motDePasse, meta: window.__AUTH.metadata, planning: !!document.getElementById('legendeBarre') }));
    verifier(apres.mdp === 'NouveauMdp2026' && apres.meta.changer_mot_de_passe === false && apres.meta.prenom === 'Paul' && apres.planning,
      'mot de passe enregistré, « changer_mot_de_passe » effacé, puis le planning s\'ouvre (' + JSON.stringify(apres) + ')');
    erreurs.push(...e);
    await page.close();
  }

  // ---- H. Téléphone -------------------------------------------------------------------------
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, init,
      initArg: { admin: true, planning: P1, comptes: COMPTES, plannings: PLANNINGS } });
    await page.evaluate(() => afficherPage('comptes'));
    await page.waitForTimeout(300);
    await page.fill('#cptPrenom', 'Paul');
    await page.fill('#cptEmail', 'paul@exemple.ch');
    await page.click('#btnInviterCompte');
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({
      deborde: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      droite: Math.max(...[...document.querySelectorAll('#page-comptes .lien-responsable, #formInviterCompte')].map((x) => Math.round(x.getBoundingClientRect().right))),
      police: getComputedStyle(document.getElementById('cptEmail')).fontSize,
      cree: !!document.querySelector('.cpt-cree')
    }));
    verifier(!m.deborde && m.droite <= 390 && m.police === '16px' && m.cree, 'téléphone : rien ne déborde, cases en 16 px (' + JSON.stringify(m) + ')');
    erreurs.push(...e);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(erreurs));
})();
