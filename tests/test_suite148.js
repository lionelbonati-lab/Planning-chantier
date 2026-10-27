const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 21.10.2026 (suite 148) — Lionel : « J'aimerai pouvoir trier ma
// liste de machines et grouper par catégorie. Et pour les trier par lister,
// déposer, plutôt que par les petites flèches. Dans le menu, clic droit de
// la souris, on aura du coup les catégories, et ensuite, dans un sous-menu,
// les machines de la catégorie. »
// Ses choix : « Liste de catégories » ; « Machines et Transports » ; une
// machine sans catégorie : « Dans « Autres » » (sql/0042 : table
// categories_elements, elements_groupes.categorie_id).
// Vérifie :
//   A. sql/0042 : table, RLS, droits, clé « on delete set null », index,
//      sauvegardes (categories_elements avant elements_groupes, aucune table
//      perdue) ;
//   B. clic droit sur la ligne Machines : les catégories (celle sans élément
//      coché absente), « Autres » en dernier, puis « Ajouter machine… » (suite 152) ;
//      survol →
//      sous-menu à côté du menu, sans élément masqué ; survoler une autre
//      entrée le referme ; clic sur une catégorie puis une machine → bulle ;
//      Transports : catégorie → matériau → quantité ;
//   C. sans catégorie (ou rien que des éléments sans catégorie) : liste à
//      plat, comme avant ;
//   D. page Machines : un bloc par catégorie (poignée, nom, nombre, actions),
//      « Autres » en dernier sans poignée, plus de ↑/↓ ;
//   E. glisser-déposer à la souris (poignée, ligne entière, catégorie vide,
//      retour dans « Autres ») et au doigt (poignée seulement) — écrit en
//      base, rangs dans l'ordre affiché ; catégories rangées entre elles ;
//   F. « + Catégorie », renommer, « + » dans une catégorie, supprimer (ses
//      éléments passent dans « Autres ») ;
//   G. table categories_elements en échec : planning et page sans
//      catégories, rien de bloqué ;
//   H. téléphone : la catégorie touchée ouvre son sous-menu, dans l'écran ;
//   I. aucune erreur JS.
//
// Lancer : node test_suite148.js

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, groupe_id: null, ordre, actif: true, masque: false }, x || {});
const E = (id, groupe_id, nom, ordre, x) => Object.assign({ id, groupe_id, nom, ordre, masque: false, categorie_id: null }, x || {});
const C = (id, groupe_id, nom, ordre) => ({ id, groupe_id, nom, ordre });
const BD = () => ({
  personnes: [P(1, 'Paul', 1), P(30, 'Machines', 3, { groupe_id: 1 }), P(31, 'Transports', 4, { groupe_id: 2 })],
  groupes: [{ id: 1, nom: 'Machines', ordre: 1, actif: true, ligne_unique: false }, { id: 2, nom: 'Transports', ordre: 2, actif: true, ligne_unique: true }],
  categories_elements: [C(1, 1, 'Levage', 1), C(2, 1, 'Compactage', 2), C(7, 1, 'Vide', 3), C(3, 2, 'Vrac', 1)],
  elements_groupes: [E(1, 1, 'Grue', 1, { categorie_id: 1 }), E(2, 1, 'Nacelle', 2, { categorie_id: 1 }), E(3, 1, 'Plaque vibrante', 3, { categorie_id: 2 }),
    E(4, 1, 'Karcher', 5), E(5, 1, 'Pompe', 6, { masque: true }), E(6, 1, 'Rouleau', 4, { categorie_id: 7, masque: true }),
    E(10, 2, 'Gravier', 1, { categorie_id: 3 }), E(11, 2, 'Sable', 2)],
  formulaires_rapides: [],
  formulaires_rapides_champs: [],
  taches: []
});

const centreCase = (page, p, iso, demi) => page.evaluate((a) => {
  const el = document.querySelector('.cell[data-kind="personne"][data-personne="' + a[0] + '"][data-demi="' + a[2] + '"][data-jour="' + giDepuisIso(a[1]) + '"]');
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, [p, iso, demi]);
const clicDroit = async (page, c) => { await page.mouse.click(c.x, c.y, { button: 'right' }); await page.waitForTimeout(250); };
// Menu ouvert : ses entrées (hors sous-menus), les sous-menus ouverts.
const menu = (page) => page.evaluate(() => {
  const m = [...document.querySelectorAll('body > .menu-pop')].pop();
  if (!m) return null;
  const pr = m.getBoundingClientRect();
  return {
    boutons: [...m.querySelectorAll(':scope > button')].map((b) => b.textContent.trim()),
    sous: [...m.querySelectorAll('.mc-sous-menu')].filter((s) => !s.hidden).map((s) => {
      const r = s.getBoundingClientRect();
      return { titre: s.querySelector('.cp-titre').textContent, boutons: [...s.querySelectorAll('button')].map((b) => b.textContent.trim()),
        aCote: r.left >= pr.right - 1 || r.right <= pr.left + 1, dansEcran: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, visible: r.width > 0 };
    }),
    ouverts: [...m.querySelectorAll('button.mc-cat.ouvert')].map((b) => b.textContent.trim())
  };
});
const centre = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
const boutonMenu = async (page, libelle, dansSous) => {
  const c = await page.evaluate((a) => {
    const m = [...document.querySelectorAll('body > .menu-pop')].pop();
    const b = [...m.querySelectorAll(a[1] ? '.mc-sous-menu:not([hidden]) button' : ':scope > button')].find((x) => x.textContent.trim() === a[0]);
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, [libelle, dansSous]);
  return c;
};
async function allerPage(page, nom) {
  await page.evaluate((n) => document.querySelector('.onglets-liste .onglet[data-page="' + n + '"]').click(), nom);
  await page.waitForTimeout(400);
}
// Page : « Catégorie(n) : a, b | … » dans l'ordre affiché.
const pageListe = (page, g) => page.evaluate((g) => [...document.querySelectorAll('#listeElements-' + g + ' .cat-elements')].map((b) => {
  const t = b.querySelector('.cat-nom');
  return (t ? t.textContent + '(' + b.querySelector('.cat-compte').textContent + ')' : '-') + ': ' +
    ([...b.querySelectorAll('.ligne-element b')].map((x) => x.textContent).join(', ') || (b.querySelector('.cat-vide') ? '[vide]' : ''));
}).join(' | '), g);
const bdEl = (page, id) => page.evaluate((i) => { const e = window.__BD.elements_groupes.find((x) => x.id === i); return e && { cat: e.categorie_id, ordre: e.ordre }; }, id);
const bdCats = (page, g) => page.evaluate((g) => window.__BD.categories_elements.filter((c) => c.groupe_id === g).sort((a, b) => a.ordre - b.ordre).map((c) => c.nom + ':' + c.ordre).join(','), g);
// Glisser `de` (sélecteur) jusqu'au point `vers` {x, y}, à la souris.
async function glisserSouris(page, de, vers) {
  const a = await centre(page, de);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x, a.y + 8, { steps: 3 });
  await page.mouse.move(vers.x, vers.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}
const bordDe = (page, sel, bas) => page.evaluate((a) => { const r = document.querySelector(a[0]).getBoundingClientRect(); return { x: r.x + r.width / 2, y: a[1] ? r.bottom - 3 : r.top + 3 }; }, [sel, bas]);
// Même geste au doigt : événements pointeur « touch » (le navigateur de test
// ne sait pas glisser un doigt).
const glisserDoigt = (page, de, vers) => page.evaluate((a) => {
  const el = document.querySelector(a[0]), r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
  const ev = (type, cible, px, py) => cible.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: px, clientY: py }));
  ev('pointerdown', el, x, y);
  for (let k = 1; k <= 6; k++) ev('pointermove', document, x, y + (a[1].y - y) * k / 6);
  ev('pointerup', document, x, a[1].y);
}, [de, vers]);
const saisir = async (page, nom) => { await page.fill('.form-pop .f-nom', nom); await page.click('.form-pop .f-ok'); await page.waitForTimeout(500); };

(async () => {
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- A. sql/0042 ---------------------------------------------------------------------
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', '0042_categories_elements.sql'), 'utf8');
  const tableaux = (txt) => [...txt.matchAll(/select array\[([^\]]*)\]/g)].map((m) => m[1].match(/'[a-z_]+'/g).map((x) => x.slice(1, -1)));
  const avant = tableaux(fs.readFileSync(path.join(__dirname, '..', 'sql', '0036_elements_groupes.sql'), 'utf8')).pop();
  const apres = tableaux(sql).pop();
  verifier(/create table if not exists categories_elements/.test(sql) && /groupe_id bigint not null references groupes \(id\) on delete cascade/.test(sql) &&
    /enable row level security/.test(sql) && /create policy "connecte_tout" on categories_elements for all to authenticated/.test(sql) &&
    /grant select, insert, update, delete on categories_elements to authenticated/.test(sql) &&
    /add column if not exists categorie_id bigint references categories_elements \(id\) on delete set null/.test(sql) &&
    /create index if not exists elements_groupes_categorie on elements_groupes \(categorie_id\)/.test(sql) && /notify pgrst, 'reload schema'/.test(sql),
    'sql/0042 : table, RLS, droits, catégorie supprimée → élément sans catégorie, index, rechargement du schéma');
  verifier(apres.indexOf('categories_elements') === apres.indexOf('groupes') + 1 && apres.indexOf('categories_elements') < apres.indexOf('elements_groupes') &&
    avant.every((t) => apres.indexOf(t) >= 0) && apres.length === avant.length + 1 &&
    JSON.stringify(apres.filter((t) => t !== 'categories_elements')) === JSON.stringify(avant),
    'sauvegardes : categories_elements après groupes, avant elements_groupes, aucune table perdue (' + apres.join(',') + ')');

  const browser = await lancerNavigateur(chromium);
  const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
  await page.waitForTimeout(400);

  // --- B. Clic droit, catégories et sous-menus ------------------------------------------------
  await clicDroit(page, await centreCase(page, '30', '2026-09-23', 'matin'));
  let m = await menu(page);
  verifier(m && JSON.stringify(m.boutons) === JSON.stringify(['Levage›', 'Compactage›', 'Autres›', 'Ajouter machine…']) && !m.sous.length,
    'Machines : les catégories (« Vide », sans élément coché, absente), « Autres » en dernier, puis « Ajouter machine… » ; sous-menus fermés (' + JSON.stringify(m) + ')');
  let c = await boutonMenu(page, 'Levage›');
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.waitForTimeout(350);
  const survolLevage = await menu(page);
  c = await boutonMenu(page, 'Autres›');
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.waitForTimeout(350);
  const survolAutres = await menu(page);
  verifier(survolLevage.sous.length === 1 && survolLevage.sous[0].titre === 'Levage' && JSON.stringify(survolLevage.sous[0].boutons) === '["Grue","Nacelle"]' &&
    survolLevage.sous[0].aCote && survolLevage.sous[0].dansEcran && survolLevage.ouverts.join() === 'Levage›' &&
    survolAutres.sous.length === 1 && JSON.stringify(survolAutres.sous[0].boutons) === '["Karcher"]',
    'survol : sous-menu de la catégorie à côté du menu (Grue, Nacelle) ; « Autres » sans la Pompe masquée (' + JSON.stringify([survolLevage, survolAutres]) + ')');
  c = await boutonMenu(page, 'Ajouter machine…');
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.waitForTimeout(450);
  const survolAutre = await menu(page);
  verifier(survolAutre && !survolAutre.sous.length && !survolAutre.ouverts.length, 'survoler « Ajouter machine… » referme le sous-menu (' + JSON.stringify(survolAutre) + ')');
  await page.mouse.click((await boutonMenu(page, 'Compactage›')).x, (await boutonMenu(page, 'Compactage›')).y);
  await page.waitForTimeout(200);
  const clicCompactage = await menu(page);
  await page.mouse.click((await boutonMenu(page, 'Plaque vibrante', true)).x, (await boutonMenu(page, 'Plaque vibrante', true)).y);
  await page.waitForTimeout(300);
  const titreForm = await page.evaluate(() => (document.querySelector('.form-pop .cp-titre, .form-pop .nom-grand') || {}).textContent);
  await page.click('.form-pop .f-ok');
  await page.waitForTimeout(800);
  const bulle = await page.evaluate(() => TACHES.filter((t) => t.personneId === '30').map((t) => t.texte + '|' + isoDeGi(t.giDebut)).join(','));
  verifier(clicCompactage.sous.length === 1 && clicCompactage.sous[0].titre === 'Compactage' && /Plaque vibrante/.test(titreForm || '') && bulle === 'Plaque vibrante|2026-09-23',
    'clic : Compactage ouvre son sous-menu, Plaque vibrante → formulaire → bulle « Plaque vibrante » (' + JSON.stringify([clicCompactage.sous, titreForm, bulle]) + ')');

  await clicDroit(page, await centreCase(page, '31', '2026-09-25', 'matin'));
  m = await menu(page);
  await page.mouse.click((await boutonMenu(page, 'Vrac›')).x, (await boutonMenu(page, 'Vrac›')).y);
  await page.waitForTimeout(200);
  const sousVrac = await menu(page);
  await page.mouse.click((await boutonMenu(page, 'Gravier', true)).x, (await boutonMenu(page, 'Gravier', true)).y);
  await page.waitForTimeout(300);
  const quantite = await page.evaluate(() => !!document.querySelector('.form-pop .champ-dyn[data-champ="quantite"]'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  verifier(JSON.stringify(m.boutons) === JSON.stringify(['Vrac›', 'Autres›', 'Autre…']) && JSON.stringify(sousVrac.sous[0].boutons) === '["Gravier"]' && quantite,
    'Transports : Vrac / Autres, Gravier → quantité (' + JSON.stringify([m.boutons, sousVrac.sous]) + ')');

  // Bord droit de l'écran : le sous-menu passe à gauche du menu, jamais dehors.
  const droite = await page.evaluate(() => {
    const cell = document.querySelector('.cell[data-kind="personne"][data-personne="30"]');
    ouvrirAjout(cell, innerWidth - 5, 200);
    const mm = [...document.querySelectorAll('body > .menu-pop')].pop();
    mm.querySelector('button.mc-cat').click();
    const p = mm.getBoundingClientRect(), s = mm.querySelector('.mc-sous-menu:not([hidden])').getBoundingClientRect();
    const r = { gauche: s.right <= p.left + 1, dedans: s.left >= 0 && s.right <= innerWidth };
    popFermerActuel();
    return r;
  });
  verifier(droite.gauche && droite.dedans, 'menu collé au bord droit : sous-menu à gauche du menu, dans l’écran (' + JSON.stringify(droite) + ')');

  // --- C. Sans catégorie : liste à plat ---------------------------------------------------------
  const plat = await page.evaluate(() => {
    const garde = etat.elementsGroupes;
    etat.elementsGroupes = garde.map((e) => Object.assign({}, e, { masque: e.groupeId === '2' && e.nom !== 'Sable' ? true : e.masque }));
    const t = boutonsMenuAjoutGroupe_(groupeParId('2'));
    const gc = etat.categoriesElements;
    etat.elementsGroupes = garde; etat.categoriesElements = gc.filter((x) => x.groupeId !== '1');
    const m1 = boutonsMenuAjoutGroupe_(groupeParId('1'));
    etat.categoriesElements = gc;
    const lire = (h) => { const d = document.createElement('div'); d.innerHTML = h; return { cat: d.querySelectorAll('.mc-cat').length, el: [...d.querySelectorAll('button[data-element]')].map((b) => b.textContent).join(',') }; };
    return [lire(t), lire(m1)];
  });
  verifier(plat[0].cat === 0 && plat[0].el === 'Sable' && plat[1].cat === 0 && plat[1].el === 'Grue,Nacelle,Plaque vibrante,Karcher',
    'sans catégorie (ou rien que « Autres ») : liste à plat, comme avant (' + JSON.stringify(plat) + ')');

  // --- D. Page Machines -----------------------------------------------------------------------------
  await allerPage(page, 'machines');
  const struct = await page.evaluate(() => {
    const z = document.getElementById('listeElements-1');
    const blocs = [...z.querySelectorAll('.cat-elements')];
    return {
      autresDernier: blocs[blocs.length - 1].classList.contains('cat-autres'),
      poignees: blocs.map((b) => !!b.querySelector('.cat-entete > .poignee-cat')).join(),
      actions: blocs.map((b) => b.querySelectorAll('.cat-entete .cat-ajouter, .cat-entete .cat-renommer, .cat-entete .cat-supprimer').length).join(),
      fleches: z.querySelectorAll('.cf-monter, .cf-descendre').length,
      lignes: [...z.querySelectorAll('.ligne-element')].every((l) => l.firstElementChild.classList.contains('champ-afficher') && l.children[1].classList.contains('poignee-el')),
      boutons: [...z.querySelectorAll('.liste-elements-ajouts button')].map((b) => b.textContent).join(','),
      toucher: getComputedStyle(z.querySelector('.poignee-el')).touchAction
    };
  });
  const liste0 = await pageListe(page, 1);
  verifier(liste0 === 'Levage(2): Grue, Nacelle | Compactage(1): Plaque vibrante | Vide(1): Rouleau | Autres(2): Karcher, Pompe' && struct.autresDernier &&
    struct.poignees === 'true,true,true,false' && struct.actions === '3,3,3,0' && !struct.fleches && struct.lignes &&
    struct.boutons === '+ Ajouter,+ Catégorie' && struct.toucher === 'none',
    'page Machines : un bloc par catégorie, « Autres » en dernier sans poignée ni action, coche puis ⠿, plus de ↑/↓ (' + liste0 + ' ; ' + JSON.stringify(struct) + ')');

  // --- E. Glisser-déposer -------------------------------------------------------------------------------
  // Karcher (Autres) entre Grue et Nacelle, par sa poignée.
  await glisserSouris(page, '#listeElements-1 .ligne-element[data-id="4"] .poignee-el', await bordDe(page, '#listeElements-1 .ligne-element[data-id="2"]', false));
  const l1 = await pageListe(page, 1), k1 = await bdEl(page, 4), g1 = await bdEl(page, 1), n1 = await bdEl(page, 2);
  verifier(l1 === 'Levage(3): Grue, Karcher, Nacelle | Compactage(1): Plaque vibrante | Vide(1): Rouleau | Autres(1): Pompe' &&
    k1.cat === 1 && k1.ordre === 2 && g1.ordre === 1 && n1.ordre === 3,
    'poignée ⠿ : Karcher glissé de « Autres » entre Grue et Nacelle, écrit en base (' + l1 + ' ; ' + JSON.stringify([g1, k1, n1]) + ')');
  // Toute la ligne (souris, sans la poignée) : Plaque vibrante en fin d'« Autres ».
  await glisserSouris(page, '#listeElements-1 .ligne-element[data-id="3"] b', await bordDe(page, '#listeElements-1 .ligne-element[data-id="5"]', true));
  const l2 = await pageListe(page, 1), p2 = await bdEl(page, 3);
  verifier(l2 === 'Levage(3): Grue, Karcher, Nacelle | Compactage(0): [vide] | Vide(1): Rouleau | Autres(2): Pompe, Plaque vibrante' && p2.cat === null && p2.ordre === 6,
    'ligne entière à la souris : Plaque vibrante dans « Autres », Compactage vide (' + l2 + ' ; ' + JSON.stringify(p2) + ')');
  // Catégorie vide : Nacelle déposée sur « Vide : glissez un élément ici ».
  await glisserSouris(page, '#listeElements-1 .ligne-element[data-id="2"] .poignee-el', await centre(page, '#listeElements-1 .cat-elements[data-cat="2"] .cat-vide'));
  const l3 = await pageListe(page, 1), n3 = await bdEl(page, 2);
  verifier(l3 === 'Levage(2): Grue, Karcher | Compactage(1): Nacelle | Vide(1): Rouleau | Autres(2): Pompe, Plaque vibrante' && n3.cat === 2 && n3.ordre === 3,
    'catégorie vide : Nacelle y est déposée (' + l3 + ' ; ' + JSON.stringify(n3) + ')');
  // Au doigt : la ligne ne se glisse pas (la page défile), la poignée oui.
  const ecritAvant = await page.evaluate(() => window.__ECRITURES.filter((x) => !/:select$/.test(x)).length);
  await glisserDoigt(page, '#listeElements-1 .ligne-element[data-id="1"] b', await bordDe(page, '#listeElements-1 .ligne-element[data-id="5"]', true));
  await page.waitForTimeout(400);
  const l4 = await pageListe(page, 1), ecrit4 = await page.evaluate(() => window.__ECRITURES.filter((x) => !/:select$/.test(x)).length);
  await glisserDoigt(page, '#listeElements-1 .ligne-element[data-id="1"] .poignee-el', await bordDe(page, '#listeElements-1 .ligne-element[data-id="5"]', true));
  await page.waitForTimeout(600);
  const l5 = await pageListe(page, 1), g5 = await bdEl(page, 1);
  verifier(l4 === l3 && ecrit4 === ecritAvant && l5 === 'Levage(1): Karcher | Compactage(1): Nacelle | Vide(1): Rouleau | Autres(3): Pompe, Grue, Plaque vibrante' &&
    g5.cat === null && g5.ordre === 5,
    'au doigt : la ligne ne bouge pas, la poignée ⠿ glisse Grue après Pompe (' + [l4, l5, JSON.stringify(g5)].join(' ; ') + ')');
  // Catégories rangées : Compactage glissée au-dessus de Levage.
  await glisserSouris(page, '#listeElements-1 .cat-elements[data-cat="2"] .poignee-cat', await bordDe(page, '#listeElements-1 .cat-elements[data-cat="1"]', false));
  const l6 = await pageListe(page, 1), c6 = await bdCats(page, 1);
  const o6 = await page.evaluate(() => window.__BD.elements_groupes.filter((e) => e.groupe_id === 1).sort((a, b) => a.ordre - b.ordre).map((e) => e.nom + ':' + e.ordre).join(','));
  verifier(/^Compactage\(1\): Nacelle \| Levage\(1\): Karcher \| Vide/.test(l6) && c6 === 'Compactage:1,Levage:2,Vide:3' &&
    o6 === 'Nacelle:1,Karcher:2,Rouleau:3,Pompe:4,Grue:5,Plaque vibrante:6',
    'catégorie glissée par sa poignée : Compactage avant Levage ; catégories et éléments numérotés dans l’ordre affiché (' + [l6, c6, o6].join(' ; ') + ')');
  // Relâché sans bouger : rien d'écrit.
  const e7 = await page.evaluate(() => window.__ECRITURES.filter((x) => !/:select$/.test(x)).length);
  const pg = await centre(page, '#listeElements-1 .ligne-element[data-id="4"] .poignee-el');
  await page.mouse.move(pg.x, pg.y); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);
  verifier(await page.evaluate(() => window.__ECRITURES.filter((x) => !/:select$/.test(x)).length) === e7, 'clic sur la poignée sans glisser : rien d’écrit');

  // --- F. Gérer les catégories ------------------------------------------------------------------------
  await page.click('#listeElements-1 .ligne-ajouter-cat');
  const titreCat = await page.evaluate(() => document.querySelector('.form-pop .cp-titre').textContent);
  await saisir(page, 'Terrassement');
  const nouvelle = await page.evaluate(() => window.__BD.categories_elements.find((x) => x.nom === 'Terrassement'));
  const l8 = await pageListe(page, 1);
  await page.click('#listeElements-1 .cat-elements[data-cat="' + nouvelle.id + '"] .cat-renommer');
  await saisir(page, 'Terrassement lourd');
  await page.click('#listeElements-1 .cat-elements[data-cat="' + nouvelle.id + '"] .cat-ajouter');
  const titreAjout = await page.evaluate(() => document.querySelector('.form-pop .cp-titre').textContent);
  await saisir(page, 'Mini-pelle');
  const pelle = await page.evaluate(() => window.__BD.elements_groupes.find((x) => x.nom === 'Mini-pelle'));
  const l9 = await pageListe(page, 1);
  verifier(titreCat === 'Nouvelle catégorie — Machines' && nouvelle.groupe_id === 1 && nouvelle.ordre === 4 && /Vide\(1\): Rouleau \| Terrassement\(0\): \[vide\] \| Autres/.test(l8) &&
    titreAjout === 'Ajouter — Terrassement lourd' && pelle && pelle.groupe_id === 1 && pelle.categorie_id === nouvelle.id &&
    /Terrassement lourd\(1\): Mini-pelle \| Autres/.test(l9),
    '« + Catégorie », renommer, « + » dans la catégorie (' + [titreCat, JSON.stringify(nouvelle), l8, titreAjout, JSON.stringify(pelle), l9].join(' ; ') + ')');
  await page.click('#listeElements-1 .cat-elements[data-cat="' + nouvelle.id + '"] .cat-supprimer');
  await page.waitForTimeout(200);
  const confirmation = await page.evaluate(() => document.querySelector('.confirm-pop .confirm-texte').textContent);
  await page.click('.confirm-pop .c-ok');
  await page.waitForTimeout(500);
  const l10 = await pageListe(page, 1), reste = await page.evaluate(() => window.__BD.categories_elements.some((x) => x.nom === 'Terrassement lourd'));
  verifier(confirmation === 'Supprimer la catégorie « Terrassement lourd » ? Son élément passe dans « Autres ».' && !reste && /Autres\(4\): .*Mini-pelle/.test(l10),
    'supprimer une catégorie : confirmation, ses éléments dans « Autres » (' + confirmation + ' ; ' + l10 + ')');

  // Page Transports : mêmes catégories.
  await allerPage(page, 'transports');
  const lt = await pageListe(page, 2);
  verifier(lt === 'Vrac(1): Gravier | Autres(1): Sable' && await page.evaluate(() => !!document.querySelector('#listeElements-2 .ligne-ajouter-cat')),
    'page Transports : catégories, « + Catégorie » (' + lt + ')');
  toutesErreurs.push(...erreurs);
  await page.close();

  // --- G. Table des catégories en échec -------------------------------------------------------------
  {
    const { page: p2, erreurs: e2 } = await ouvrirPlanning(browser, { bd: BD(), tablesEnEchec: ['categories_elements'] });
    await p2.waitForTimeout(400);
    await clicDroit(p2, await centreCase(p2, '30', '2026-09-23', 'matin'));
    const mm = await menu(p2);
    await p2.keyboard.press('Escape');
    await allerPage(p2, 'machines');
    const lp = await pageListe(p2, 1);
    verifier(mm && JSON.stringify(mm.boutons) === JSON.stringify(['Grue', 'Nacelle', 'Plaque vibrante', 'Karcher', 'Ajouter machine…']) && lp === '-: Grue, Nacelle, Plaque vibrante, Rouleau, Karcher, Pompe',
      'catégories injoignables : menu et page à plat, rien de bloqué (' + JSON.stringify(mm) + ' ; ' + lp + ')');
    toutesErreurs.push(...e2);
    await p2.close();
  }

  // --- H. Téléphone ------------------------------------------------------------------------------------------
  {
    const { page: p3, erreurs: e3 } = await ouvrirPlanning(browser, { bd: BD(), viewport: { width: 390, height: 844 }, hasTouch: true });
    await p3.waitForTimeout(500);
    await p3.evaluate(() => {
      const cell = document.querySelector('.cell[data-kind="personne"][data-personne="30"]');
      const r = cell.getBoundingClientRect();
      ouvrirAjout(cell, r.x + 10, r.y + 10);
    });
    await p3.waitForTimeout(200);
    const cc = await boutonMenu(p3, 'Levage›');
    await p3.touchscreen.tap(cc.x, cc.y);
    await p3.waitForTimeout(250);
    const mt = await menu(p3);
    verifier(mt.sous.length === 1 && mt.sous[0].titre === 'Levage' && mt.sous[0].dansEcran && mt.sous[0].visible,
      'téléphone : toucher Levage ouvre son sous-menu, entièrement dans l’écran (' + JSON.stringify(mt.sous) + ')');
    await p3.touchscreen.tap(cc.x, cc.y);
    await p3.waitForTimeout(200);
    verifier(!(await menu(p3)).sous.length, 'téléphone : toucher à nouveau la catégorie referme son sous-menu');
    toutesErreurs.push(...e3);
    await p3.close();
  }

  // --- I. Aucune erreur JS ---------------------------------------------------------------------------------------
  verifier(!toutesErreurs.length, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
