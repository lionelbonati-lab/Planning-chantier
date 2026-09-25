# Handoff — Planning Chantiers (repo GitHub Planning-chantier)

Contexte : ce travail a été fait dans une session Cowork (pas d'accès direct
au repo GitHub, seulement un pont vers l'ordinateur de Lionel qui est resté
déconnecté tout le long — rien n'a pu être livré). Tout a été développé et
testé (Playwright) dans un environnement de dev isolé (`testenv/`, copie du
repo). On bascule maintenant sur une session Claude Code liée à GitHub pour
livrer proprement (commits + push).

4 chantiers ("rounds"), dans l'ordre chronologique :

- **Round A — bug swipe semaine desktop/tablette** : TERMINÉ, testé.
- **Round B — sync des couleurs perso entre appareils** : TERMINÉ, testé.
  Nécessite une migration Supabase déjà appliquée EN DIRECT en prod (voir
  plus bas — ne pas la re-jouer).
- **Round C — réorganisation de la barre d'outils** : PAS COMMENCÉ (specs
  complètes ci-dessous, confirmées par Lionel).
- **Round D — 3 bugs visuels signalés en cours de route** : TERMINÉ, testé.

Fichiers de référence testés fournis à côté de ce document (`js/*.js`,
`style.css`, `test_*.js`) : contenu ACTUEL de `testenv/` après application
des rounds A, B et D (round C pas encore appliqué). Compare-les au repo réel
et applique les différences (ou remplace directement après avoir vérifié
qu'ils partent bien de la même base — le repo n'a normalement pas bougé
depuis, personne d'autre n'y touche).

---

## Round A — Le changement de semaine par swipe/molette ne marche pas sur desktop/tablette

Signalé par Lionel : « Le changement de semaine en suivant gauche/droite ne
fonctionne pas sur ordinateur et tablettes, fonctionne sur mobile. »

Deux causes RACINE distinctes, chacune corrigée séparément :

**1. Desktop (trackpad/molette)** — `js/grille-rendu.js`, le listener
`wheel` posé sur `.scroller` (cherche `seuilMolette`/`accumulMolette`) :
Chrome interceptait le geste comme un retour/avance de navigation
navigateur (swipe horizontal qui dépasse la limite de scroll) parce que
`e.preventDefault()` n'était appelé qu'une fois `accumulMolette` dépassait
le seuil, jamais avant — trop tard, le navigateur avait déjà pris la main
sur le geste et avalait les événements `wheel` suivants. Fix : appeler
`e.preventDefault()` dès que la direction de la molette correspond au bord
déjà atteint (`auDebut`/`aLaFin`), avant même le test de seuil. Renforcé
côté CSS (`style.css`, règle `.scroller`) par
`overscroll-behavior-x: contain;`.

**2. Tablette (swipe tactile)** — même fichier, listeners `touchstart`/
`touchmove`/`touchend` posés sur `.scroller` (cherche `toucheDebutX`,
`toucheBord`, `seuilBordSemaine=46`) : le détecteur de swipe-au-bord
n'était armé que si `enModeJourMobile` était vrai (vue "1 jour" mobile
uniquement) — sur tablette, ce mode n'est jamais actif, le détecteur ne se
déclenchait donc jamais. Fix : retiré cette condition, le détecteur est
actif dans TOUS les modes d'affichage.

**Effet de bord anticipé et corrigé dans la foulée** : en généralisant à
tous les modes, un vrai risque de régression est apparu en vue "1 semaine"/
"2 semaines" — `scroller.scrollLeft` peut y valoir 0 en permanence
(`maxScroll=0`, rien à faire défiler), ce qui rend le test "on est au bord"
trivialement toujours vrai. Une sélection multi-jours à la souris/au doigt
(glisser pour sélectionner plusieurs cases) aurait donc pu être
interprétée à tort comme un swipe de changement de semaine. Fix : garde
sur le flag body déjà existant `en-glissement` (posé par le système de
sélection/glisser-déposer de cellules dès qu'une interaction de ce type est
reconnue, jamais pour un pur défilement) — si présent, le détecteur de
swipe-bord se désarme et ne déclenche rien.

Tests fournis : `test_swipe_tablette_1semaine.js` (reproduit le bug puis
confirme le fix, tablette 820×1100 hasTouch), `test_selection_multijour_
tablette.js` (vérifie la garde `en-glissement` dans les 2 sens).

---

## Round B — Couleurs personnalisées synchronisées entre appareils du même compte

Signalé par Lionel : « Les couleurs devrait être les mêmes sur tous les
appareils du même compte. Comme les chantiers. »

Avant ce round, les couleurs perso (page Réglages > Couleurs) vivaient
uniquement en `localStorage`, donc différentes par appareil. Objectif :
même modèle que `chantiers`/`categories_feries` — le serveur (table
Supabase) devient la source de vérité, `localStorage` ne reste qu'un cache
anti-flash local (peint immédiatement au chargement, avant que
`donnees-sync.js` ait fini de charger le reste, pour éviter un flash des
couleurs par défaut).

**Nouvelle table Supabase `couleurs_perso`** (déjà créée et vivante en prod
— cf. `sql/0011_couleurs_perso.sql` fourni, qui documente la migration déjà
appliquée, à NE PAS rejouer) : `id text primary key` (le "groupe" de
couleur, ex. "principale", "fond", "jalons"...), `clair text`, `sombre
text`, tous les deux nullable. RLS + grants standard de l'appli (policy
`connecte_tout`, grants complets à `authenticated`).

**`js/donnees-sync.js`** — `demarrer()` : ajout de
`sbClient.from("couleurs_perso").select("id, clair, sombre")` dans le
`Promise.all([...])` existant (même position que les autres tables de
réglages, non bloquant si erreur), puis remplissage de
`etat.couleursPerso` (objet indexé par id) et appel de
`appliquerCouleursPersonnalisees()` si la fonction existe.

**`js/page-couleurs.js`** — réécrit en profondeur. Fonctions clés :
- `lireCacheLocal_()` / `ecrireCacheLocal_()` : lecture/écriture
  localStorage (le cache anti-flash).
- `couleursPersoServeur_()` : lit `window.etat.couleursPerso` (toujours en
  passant par `window.etat` et jamais `etat` nu — ce fichier est chargé
  AVANT `core.js` qui déclare `var etat`, un accès direct planterait avant
  que `core.js` ait tourné).
- `lireReglages()` : désormais server-first — utilise
  `couleursPersoServeur_()` si dispo, sinon retombe sur le cache local.
- `appliquerCouleursPersonnalisees()` : peint le CSS (`--accent` etc.) ET
  resynchronise le cache local depuis les données serveur quand elles sont
  disponibles — appelée au chargement (anti-flash, avec le cache) ET après
  le fetch serveur (donnees-sync.js).
- `enregistrerCouleurServeur_()` / `reinitialiserCouleurServeur_()` /
  `reinitialiserToutesCouleursServeur_()` : écriture optimiste locale
  immédiate (CSS + cache) puis écriture serveur (`upsert`/`delete` sur
  `couleurs_perso`), DÉBOUNCÉE 400ms par champ (clé `groupeId+":"+theme`)
  via `planifierEcritureServeur_()` — un glissé continu sur un
  `<input type="color">` (événement `input` en rafale) ne spamme donc pas
  le réseau, et 2 champs différents ne s'annulent pas mutuellement leur
  debounce.
- `notifierEchecSync_()` / `marquerCommeSourceDeVerite_()` : gestion
  d'erreur réseau (toast) sans perdre la valeur déjà appliquée localement.
- Les 3 handlers d'événements (`.rc-clair`/`.rc-sombre` input, `.reglage-
  couleur-reset` click, `#btnResetToutesCouleurs` click) suivent tous le
  même schéma : mise à jour optimiste locale + sync serveur
  debouncée/immédiate.

Point technique important côté `supabase-js` exploité ici : `upsert({id,
clair}, {onConflict:"id"})` ne touche QUE les colonnes présentes dans le
payload (`ON CONFLICT ... DO UPDATE SET` généré dynamiquement) — écrire
`clair` seul sur une ligne existante ne touche jamais `sombre`, pas besoin
de read-modify-write.

Test fourni : `test_couleurs_sync_compte.js` — vérifie (1) une couleur déjà
connue du "serveur" (simulé) s'applique même si le localStorage local ne la
connaît pas, (2) un changement local écrit bien sur `couleurs_perso`
(espion posé directement sur le `sbClient` déjà créé — PAS via
`page.addInitScript`, qui serait de toute façon écrasé par le stub Supabase
inline du harnais de test, exécuté après), (3) une réinitialisation déclenche
un DELETE serveur, (4) sans réponse serveur du tout, repli sur le dernier
cache local connu (pas les couleurs par défaut du code).

---

## Round C — Réorganisation de la barre d'outils (PAS ENCORE IMPLÉMENTÉ)

Demande verbatim de Lionel :

> toolbar modifications:
> * mode compact, dans le menu 3 points, placer "<" N° semaine ">" sur la
>   même ligne, plus de texte semaine précédente et semaine suivante.
> * mode compact, sur la barre, annuler/refaire | Chantier | Insertions
> * Mode normal, modifier l'ordre des éléments afin de rendre logique le
>   déplacement dans le menu 3 points -> annuler/refaire | imprimer |
>   Chantier | navigation semaines | Zoom | Insertions | Masquages
> * Menu 3 points, ordre du haut en bas: Imprimer > Zoom > Navigation
>   semaine > Affichage 1 ou 2 semaine > Masquages (4 icones sur la même
>   ligne suffisent)
> * En réduisant la largeur d'écran, placer un groupe d'élément dans le
>   menu 3 points quand il sort de la tool barre. Attention éviter que
>   certains éléments se superposent (chantier et navigation débordent
>   sous leur voisins de droites, pour chantier par exemple, une largeur
>   fixe de 25 caractère, la partie du texte dépasse sera caché)
> * Style visuel du chantier comme zoom et sem.N

4 questions de clarification ont été posées, réponses de Lionel (à suivre
littéralement, pas d'approximation) :

1. **Ordre Zoom/Navigation semaine différent entre la barre et le menu ⋮** :
   confirmé intentionnel — « Ordres différents, comme écrit ». Dans la
   barre (mode normal) : navigation semaines AVANT Zoom. Dans le menu ⋮ :
   Zoom AVANT navigation semaine.
2. **Placement d'"Aujourd'hui"** : « dans navigation en mode desktop et à
   côté de annuler/refaire en mode compact. dès que navigation sort de la
   barre, garder tout de même aujourd'hui sur la barre. » — donc :
   - Mode normal (large) : Aujourd'hui fait partie du groupe navigation
     semaines (à côté de ‹ Sem. N ›).
   - Dès que la navigation semaines quitte la barre pour le menu ⋮
     (peu importe la largeur exacte), Aujourd'hui s'en détache et RESTE
     visible sur la barre, à côté d'Annuler/Refaire.
3. **Placement d'"Ajouter une ligne"** : « dans le menu, avant masquage »
   — positionné juste AVANT Masquages dans le menu ⋮ (pas après).
4. **Profondeur du système de repli** : « Système dynamique complet
   (Recommandé) » — un vrai système mesuré en JS, PROGRESSIF (un groupe à
   la fois rejoint le menu ⋮ à mesure que la largeur diminue), PAS un
   simple binaire tout-ou-rien.

### Mécanisme actuel à REMPLACER

`js/grille-rendu.js`, fonction `ajusterDebordementToolbar()` (~ligne 172,
appelée à la fin de `construireGrille()`, sur resize débouncé 120ms, et
après reconstruction du sélecteur de chantier) : mesure UNE SEULE FOIS si
`#legendeBarre.scrollWidth > clientWidth` une fois tout affiché en entier,
et si oui bascule TOUT `#toolbarSecondaire` (5 groupes : Imprimer, Zoom,
navigation semaines, 2 semaines/1 jour, Ajouter une ligne, Masquages — cf.
CSS `#legendeBarre.toolbar-compacte`, style.css ~ligne 686-734) d'un coup
dans le menu ⋮. Binaire, pas progressif — exactement ce que Lionel demande
de remplacer.

`#toolbarSecondaire` est `display:contents` par défaut (desktop/tablette) :
ses enfants deviennent des flex-siblings normaux de `.toolbar-sheets`,
positionnés par leur `order` inline. Quand `.toolbar-compacte` est posée,
il devient un vrai panneau dropdown (`display:flex; flex-direction:
column`), suivant alors l'ordre naturel du DOM (plus l'`order` CSS) pour
l'affichage vertical liste.

### Structure HTML actuelle (`js/coquille.js`, fonction `htmlPagePlanning`,
`#legendeBarre` ~ligne 174-374)

Enfants directs de `.toolbar-sheets` (avec leur `order` actuel) :
- 10 : Annuler/Refaire
- 20/15 : séparateurs
- 90 : séparateur
- 100 : Chantier (`#selectChantier`)
- 110/115 : séparateurs
- 130 : groupe droite = "+" (`#menuAjoutElement`, = "Insertions") +
  `#btnPlusOutils` ("⋮")
- 75 : Aujourd'hui (`#btnAujourdhui`), seul, seul groupe
- `#toolbarSecondaire` (display:contents) contenant :
  - 30 : Imprimer
  - 40/35 : séparateurs
  - 50 : Zoom (`#zoomCtrl`)
  - 60/65 : séparateurs
  - 70 : navigation semaines (`#btnSemainePrec`, `#btnSemainePill`/
    `#menuSemaine`, `#btnSemaineSuiv`) — SANS Aujourd'hui
  - 80 : `#groupeDeuxSemaines` (`#btnDeuxSemaines`) — desktop/tablette ;
    `#groupeVueJourMobile` (même order, `.mobile-seulement`) le remplace
    sur téléphone
  - 100 : séparateur (mobile uniquement)
  - 120 : Ajouter une ligne (`#menuAjoutLigne`)
  - 140/135 : séparateurs
  - 150 : Masquages (`#controlesAffichage`, 4 icônes Jalons/Notes/
    Personnel/Intervenants)

### Ce qui doit changer

1. **Ordre en mode normal (bar complète)** :
   Annuler/Refaire → Imprimer → **Chantier** (déplacé tout en haut, juste
   après Imprimer) → navigation semaines (+ Aujourd'hui accolé) → Zoom →
   Insertions ("+") → Masquages.
   Point d'attention : "Insertions" ("+") ne doit JAMAIS rejoindre le menu
   ⋮ (reste toujours visible sur la barre, quelle que soit la largeur) —
   il garde sa position fixe entre Zoom et Masquages dans l'ordre visuel,
   mais n'est PAS un "groupe repliable" du système progressif.

2. **Ordre dans le menu ⋮ une fois REPLIÉ** (haut → bas) : Imprimer > Zoom
   > navigation semaine > Affichage 1/2 semaine > **Ajouter une ligne** >
   Masquages (4 icônes sur une seule ligne). Noter l'inversion Zoom/nav.
   semaine par rapport à l'ordre de la barre (point 1 des réponses de
   Lionel, confirmé intentionnel).
   Ce sous-ordre correspond déjà, par pure coïncidence, à peu près à
   l'ordre `order` ACTUEL de `#toolbarSecondaire` (30, 50, 70, 80, 120,
   150) — probablement rien à changer de ce côté-là, à vérifier quand même
   une fois Chantier/Aujourd'hui sortis de leurs positions actuelles.

3. **Bar réduite au minimum ("mode compact" au sens de Lionel)** : Annuler/
   Refaire | Aujourd'hui (accolé, cf. réponse 2) | Chantier | Insertions
   ("+") | ⋮. Dans le menu ⋮, la ligne navigation semaines doit se
   présenter comme "‹ Sem. N ▾ ›" SUR UNE SEULE LIGNE (pas 3 lignes/pas de
   texte "Semaine précédente"/"Semaine suivante" — actuellement ces
   libellés existent via `.toolbar-btn-label`, à supprimer ou masquer pour
   CE groupe précis une fois dans le menu ⋮, tout en les gardant pour les
   autres boutons du menu qui eux gardent leur libellé texte).

4. **Système de repli progressif (JS, remplace `ajusterDebordementToolbar`
   binaire)** : au lieu d'un seul test scrollWidth>clientWidth global, il
   faut mesurer/replier un groupe à la fois. Groupes "repliables" dans le
   menu ⋮, PROPOSITION de priorité de repli (rien d'explicite de la part
   de Lionel là-dessus — à valider avec lui si possible, sinon assumer et
   documenter clairement dans le code) : le groupe le MOINS prioritaire
   (qui rejoint le menu EN PREMIER quand ça manque de place) en premier :
   1. Masquages (repli en premier)
   2. Ajouter une ligne
   3. Affichage 1/2 semaine
   4. Zoom
   5. Imprimer
   6. Navigation semaines (repli en DERNIER parmi les repliables — c'est
      l'outil le plus utilisé au quotidien)
   Groupes JAMAIS repliables (toujours sur la barre, même à la largeur
   minimale) : Annuler/Refaire, Aujourd'hui, Chantier, Insertions ("+").
   Algorithme suggéré : à chaque mesure (construireGrille, resize
   débouncé, changement de nom de chantier par défaut — mêmes points
   d'appel que l'actuel `ajusterDebordementToolbar`), repartir de l'état
   pleinement étendu, mesurer si `scrollWidth > clientWidth`, et si oui
   replier le groupe de plus basse priorité restant encore dans la barre,
   répéter jusqu'à ce que ça tienne (ou qu'il ne reste plus que les 4
   groupes non-repliables). Symétriquement, si de la place se libère
   (fenêtre agrandie), redéplier dans l'autre sens (priorité la plus
   haute d'abord) — repartir toujours de l'état étendu avant de mesurer,
   comme le fait déjà le code actuel, pour ne jamais rester bloqué en
   compact après un agrandissement.
   Chaque groupe replié individuellement doit rejoindre `#toolbarSecondaire`
   (ou un mécanisme équivalent) et y suivre l'ordre du menu ⋮ du point 2
   ci-dessus, PAS l'ordre dans lequel il a été replié.

5. **Bug de superposition à corriger** : "Chantier" et les éléments de
   navigation débordent visuellement sous leurs voisins de droite quand la
   barre devient trop étroite (avant que le mécanisme de repli n'ait agi,
   ou à cause d'un nom de chantier trop long). Fix suggéré par Lionel :
   largeur fixe d'environ 25 caractères sur le bouton Chantier
   (`#btnSelectChantier`/`.nom-chantier`), texte débordant cladé
   (`overflow:hidden; text-overflow:ellipsis; white-space:nowrap` sur
   `.nom-chantier`, avec une largeur fixe en `ch` plutôt qu'en px pour
   suivre "25 caractères" au pied de la lettre — `max-width: 25ch`).

6. **Restyle visuel du bouton Chantier** : doit ressembler à `.zoom-pill`/
   `#btnSemainePill` (même classe/habillage visuel — border 1px
   `var(--border)`, fond `var(--case-fixe-bg)`, hover accent, cf. `style.css`
   ~ligne 542-547). `#btnSelectChantier` a aujourd'hui son propre style
   `.select-chantier-btn` (~ligne 429-436) — soit lui ajouter la classe
   `.zoom-pill` en plus (en adaptant le padding/layout interne pour garder
   la pastille de couleur + le texte + le caret), soit aligner
   `.select-chantier-btn` sur les mêmes valeurs. Attention à la variante
   téléphone (pastille seule, `.nom-chantier`/`.caret` masqués en CSS,
   cf. `style-mobile.css`) à ne pas casser.

### Pièges déjà identifiés (à ne pas re-découvrir)
- `#toolbarSecondaire` est réutilisé tel quel pour le panneau mobile
  (`style-mobile.css`, ≤600px, mécanisme séparé et INCHANGÉ par ce round)
  ET pour le nouveau panneau desktop/tablette progressif — bien vérifier
  qu'un groupe qui rejoint dynamiquement `#toolbarSecondaire` en JS ne
  casse pas le rendu mobile (qui, lui, affiche TOUJOURS tous les 6 groupes
  dans le panneau, jamais une bar réduite progressive).
- Les séparateurs `.toolbar-separateur`/`.toolbar-separateur-mobile`
  actuels sont posés en dur avec des `order` fixes pour matcher l'ancien
  système binaire — le nouveau système progressif va probablement
  nécessiter de les gérer dynamiquement aussi (ne pas laisser un
  séparateur orphelin en bord de barre une fois un groupe reployé).
- `window.matchMedia("(max-width: 600px)")` : le système progressif ne
  doit jamais s'activer sous cette largeur (le panneau mobile fixe de
  `style-mobile.css` prend déjà le relais, cf. code actuel de
  `ajusterDebordementToolbar`).

---

## Round D — 3 bugs visuels signalés par Lionel en cours de route

> * En mode 2 semaines, j'ai une mauvaise bordure au niveau du lundi midi.
> * Le contour du bouton 2 semaine ne se colore plus en passant la souris.
> * Quand actif, le bouton 2 semaine doit se colorer de la même manière
>   que les autres bouton actifs (onglet).

**1. Bordure au lundi midi** — `js/grille-rendu.js`, fonction `creerCell(gi,
extra)` (~ligne 591) : en mode compact (`modeCompact`, constante toujours
vraie désormais, cf. `core.js`), chaque jour d'une ligne Personnel/
Intervenants pose 2 cellules DOM côte à côte (matin + après-midi,
`ligneGroupePersonnesCompact`) — `creerCell` posait la classe
`sem-frontiere` (bordure épaisse marquant le début d'une semaine)
uniquement selon `gi` (index de jour), sans regarder `extra.demi` : le 1er
jour de chaque semaine recevait donc la bordure sur SES DEUX cellules
(matin ET après-midi) au lieu de la seule cellule du matin — d'où une 2e
bordure parasite en plein milieu du lundi. Fix : condition
`extra.demi !== "aprem"` ajoutée avant `cell.classList.add("sem-frontiere")`.
Test fourni : `test_bordure_lundi_2semaines.js`.

**2 et 3. Contour/couleur du bouton "2 semaines"** — même cause racine
pour les deux. `style.css`, règle `.toolbar-btn.actif` (~ligne 577,
utilisée par `#btnDeuxSemaines` et son pendant mobile
`#btnVueJourMobile`) : son fond `var(--accent-soft)` est devenu, à un
round précédent (23.09.2026), EXACTEMENT la même teinte que le nouveau
fond de `#legendeBarre`/`.toolbar-sheets` lui-même — le remplissage
"actif" restait bien appliqué en JS (`classList.toggle("actif",
deuxSemaines)`, `majSemaineAffichage()`) mais devenait invisible, fondu
dans le fond de la barre. Fix : ajout d'un contour `1.5px solid
var(--accent)` (teinte pleine, jamais fondue, contrairement à
`--accent-soft`) sur `.toolbar-btn.actif`, et un vrai changement de teinte
au survol via `color-mix()` (`.toolbar-btn.actif:hover`, qui ne changeait
rien avant — même fond qu'au repos). Pas de changement sur l'état non-actif
(aucun autre bouton de la barre affecté).

---

## Conventions du repo à respecter

- Tests : fichiers `test_*.js` à la racine, Playwright, lancés directement
  via `node test_xxx.js` (pas de runner/harness dédié). Chromium préinstallé
  à `/opt/pw-browsers/chromium` dans l'environnement de dev utilisé
  jusqu'ici — vérifier le chemin équivalent une fois sur Claude Code/CI.
  Chaque test seed l'état (`etat.*`, `PERSONNES`, `CHANTIERS`, `TACHES`...)
  directement en JS via `page.evaluate`, sans backend réel (un stub
  `window.supabase.createClient` minimal est injecté dans le HTML de test).
- 3 échecs de tests PRÉ-EXISTANTS, sans rapport avec ces 4 rounds (confirmé
  par inspection du code) : `test_couleurs2.js`, `test_couleurs3.js`,
  `test_toolbar_onglet_couleur.js` — tous les 3 réfèrent un réglage "Fond
  de la barre d'outils" retiré intentionnellement à un round antérieur
  (cf. `test_toolbar_retrait_reglage.js`, qui passe et vérifie
  explicitement son absence). Ne pas chercher à les corriger sauf demande
  explicite de Lionel.
- Changelogs : `FRONTEND-CHANGELOG.md` / `BACKEND-CHANGELOG.md` à la racine
  du repo — chaque round y est documenté, à continuer sur le même format.
- Commentaires de code très denses et systématiques dans tout le repo,
  toujours en français, datés ("Round du JJ.MM.AAAA — Lionel : « citation
  verbatim »"), expliquant le POURQUOI (pas juste le quoi) — convention à
  perpétuer pour toute nouvelle modification.
- Projet Supabase : `mvqvznohgtpulpgalvxl` ("Planning-chantier", région
  eu-west-2). RLS mono-tenant partout : policy `connecte_tout` (`for all
  to authenticated using (true) with check (true)`) + grants explicites
  (les tables créées hors Table Editor n'ont pas de grants par défaut).

## Ce qu'il reste à faire, dans l'ordre suggéré

1. Cloner/ouvrir le repo réel, comparer aux fichiers de référence fournis
   (rounds A/B/D), appliquer les différences.
2. Ajouter `sql/0011_couleurs_perso.sql` au repo (documentation seule, la
   migration est déjà vivante en prod — ne PAS la ré-exécuter sans
   vérifier d'abord qu'elle n'existe pas déjà).
3. Faire tourner toute la suite `test_*.js`, confirmer seulement les 3
   échecs pré-existants connus, aucun nouveau.
4. Implémenter le Round C (specs complètes ci-dessus) : lecture de
   `js/coquille.js` (structure HTML de la barre) et `js/grille-rendu.js`
   (`ajusterDebordementToolbar`) en premier, puis nouveau système JS de
   repli progressif + CSS + restyle Chantier + fix superposition. Tests
   Playwright dédiés à écrire (mesures de largeur à différents viewports,
   contenu du menu ⋮ à chaque palier, style visuel du bouton Chantier).
5. Committer (un commit par round, ou groupés si Lionel préfère), mettre à
   jour `FRONTEND-CHANGELOG.md`, pousser sur GitHub.
6. Rendre compte à Lionel en français, dans le même style concis que les
   rounds précédents (ce qui a été fait, pas une liste à puces de détails
   techniques).
