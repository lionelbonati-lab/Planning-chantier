# Changelog backend — round de transfert V3 (WebApp.gs / Planning_Format.gs)

Rédigé au moment de finir/vérifier le travail backend du transfert V3 (cf.
`TRANSFERT-V3-SPEC.md`), après une relecture complète de `WebApp.gs`
(2615 lignes) et de `Planning_Format.gs` (2111 lignes, inchangé). Sert de
trace : ce qui a été ajouté, ce qui a été corrigé, ce qui a été testé.

## 1. Statut de la vérification

`WebApp.gs` a été relu **intégralement**, ligne par ligne (2605 lignes au
départ, 2614 après les 2 corrections du §3), en confrontant
chaque fonction nouvelle au contrat figé (`TRANSFERT-V3-SPEC.md` §2 à §7).
Aucune trace d'interruption : le fichier se termine proprement sur
`apiSupprimerSerie`, aucune fonction tronquée, aucun marqueur `TODO`/`FIXME`,
aucune fonction dupliquée, aucune collision de nom entre `WebApp.gs` et
`Planning_Format.gs` (vérifié par diff des symboles `function`/`var` de tête
de ligne des deux fichiers).

**Un bug réel a été trouvé et corrigé** (cf. §3). Le reste de
l'implémentation est conforme au contrat, y compris sur les points les plus
délicats explicitement signalés dans la consigne (fusion week-end, portées de
série, ordre des crochets).

## 2. Nouvelles fonctions — signatures exactes

### Statuts (feuille "Statuts", §3 du contrat)

- `apiListerStatuts()` → `[{cle, nom, couleur, ordre}]`, triée par `ordre`.
  Ne crée jamais la feuille ; absente/vide → 4 valeurs par défaut
  (`STATUT_ORDER_WEB_DEFAUT` / `STATUTS_WEB_DEFAUT` / `STATUT_COULEUR_DEFAUT`,
  ligne ~162 de `WebApp.gs`) — jamais de planning sans statut utilisable.
- `apiEnregistrerStatuts(modifs, nouveaux, supprimes)` — `modifs:
  [{cle,nom,couleur,ordre}]`, `nouveaux: [{nom,couleur,ordre}]`,
  `supprimes: [cle,...]`. Crée la feuille avec le contenu par défaut au tout
  premier appel. Miroir d'`apiEnregistrerChantiers`.

**Feuille "Statuts"** — colonnes exactes (1 ligne d'en-tête) :
| Col | Nom          | Contenu                          |
|-----|--------------|-----------------------------------|
| A   | Nom affiché  | ex. "Confirmé"                    |
| B   | Couleur      | hex, fond de la puce               |
| C   | Ordre        | nombre                            |

`cle` = nom slugifié (`slugifierStatut_`, sans accent/espace, minuscules) —
reste la clé de reconnaissance TEXTE dans les crochets (`[Confirmé]` etc.),
jamais la clé technique elle-même écrite en feuille "Planning".

### Formulaires rapides (feuille "Formulaires rapides", §3 du contrat)

- `apiListerFormulairesRapides()` → `[{nom, ordre, champs:[{cle,label,type,
  options}]}]`, regroupé par formulaire, champs triés par ordre.
- `apiEnregistrerFormulaireRapide(nom, ordre, champs)` — delete-then-append
  pour ce nom (jamais de diff ligne à ligne).
- `apiSupprimerFormulaireRapide(nom)`.

**Feuille "Formulaires rapides"** — colonnes exactes (1 ligne d'en-tête, une
ligne PAR CHAMP) :
| Col | Constante            | Contenu                              |
|-----|----------------------|---------------------------------------|
| A   | `FR_COL_NOM`         | Nom du formulaire                     |
| B   | `FR_COL_ORDRE_FORM`  | Ordre du formulaire                   |
| C   | `FR_COL_ORDRE_CHAMP` | Ordre du champ dans le formulaire     |
| D   | `FR_COL_CLE`         | Clé du champ                          |
| E   | `FR_COL_LABEL`       | Label affiché                         |
| F   | `FR_COL_TYPE`        | `texte`\|`nombre`\|`select`\|`case`   |
| G   | `FR_COL_OPTIONS`     | JSON (tableau), utilisé si `select`   |

### Fériés (feuille "Fériés" existante, étendue — §5 du contrat)

- `apiListerFeries()` → `[{iso, libelle, categorie}]`. `categorie` défaut
  `'ferie'` en mémoire si colonne C absente/vide — **lecture pure, n'écrit
  jamais la colonne** (seule `apiEnregistrerFeries` le fait).
- `apiEnregistrerFeries(modifs, nouveaux, supprimes)` — matché par `iso`
  (`modifs`/`nouveaux`: `{iso, libelle, categorie}`, `supprimes`: `[iso,...]`).
  Ajoute la colonne C ("Catégorie") de façon défensive si absente
  (`assurerColonneCategorieFeries_`), avec `ferie` comme valeur par défaut
  pour toutes les lignes déjà existantes.

**Feuille "Fériés"** — colonnes exactes après extension :
| Col | Contenu                                  |
|-----|-------------------------------------------|
| A   | Libellé                                   |
| B   | Date (Date Sheets, ou texte `jj/mm/aaaa`) |
| C   | Catégorie : `ferie` \| `vacances_entreprise` (**nouvelle**) |

### Semaine / week-end (§2 du contrat)

- `apiChargerSemaine(labG)` — inchangée en signature, payload étendu : lit
  désormais jj=6 (colonne physique fusionnée Sam/Dim) et renvoie
  `personnes[].weekend = [vueS, vueD]` (`vueX = {chantier, taches}`, même
  forme que jours 1-5) + `weekendDates: [isoSamedi, isoDimanche]` dans le
  payload racine (additif, nécessaire côté client pour construire ses appels
  et les dates de départ d'une série sur le week-end).
- `apiEnregistrerCellulePersonne(labG, ancre, demi, jourIdx, payload)` —
  `jourIdx` 0-4 inchangé (jours 1-5) ; **`jourIdx` 6 (Samedi) et 7 (Dimanche)
  nouveaux**, tous deux routés vers la même colonne physique fusionnée
  (`labG+6`, cf. bugfix §3). `payload = {chantier, taches}`.
- `pasCalendaire_`/`apiEnregistrerSerie` etc. réutilisent la même convention
  jourIdx 6/7 → colonne `labG+6` pour le week-end (`ecrireOccurrenceSerie_`).

### Série (§4 du contrat)

- `pasCalendaire_(dateDebutIso, frequence, intervalle, index)` → `Date` —
  arithmétique de dates réelle (`jour`/`semaine`: `setDate`, `mois`:
  `setMonth`, `annee`: `setFullYear`, débordement JS natif assumé pour fin de
  mois). Lève une erreur sur fréquence inconnue.
- `apiEnregistrerSerie(payload, labGCourant)` — `payload = {type:
  'tache'|'jalon'|'note', ancre, demi, texte, statut, important, chantier,
  dateDebutIso, frequence, intervalle, finType:'occurrences'|'date',
  finValeur}`. Garde-fou `MAX_OCCURRENCES_SERIE = 366`. Génère `serieId`
  (`genererSerieId_()`, format `s` + 6 car. base36). Localise la colonne de
  semaine via `positionSemaine_` (réutilise `listerSemainesPlanning`,
  Planning_Format.gs — **aucune recherche de colonne réinventée**, conforme
  au contrat). Crée les semaines manquantes au besoin (plafonné
  `SERIE_MAX_SEMAINES_CREEES = 60`). Retourne `{semaine, semainesTouchees:
  [labG,...], serieId}`.
- `apiModifierSerie(serieId, portee, dateRefIso, modifs, labGCourant)` —
  `portee: 'unique'|'suivant'|'serie'`. `modifs: {texte, statut, important,
  chantier}` — **le champ `chantier` est appliqué** depuis le round du
  01.09.2026 (§7 ci-dessous) aux occurrences de type "tache" en semaine
  (jours 1-5 uniquement, jamais le week-end) ; avant ce round il était
  silencieusement ignoré, cf. §7.
- `apiSupprimerSerie(serieId, portee, dateRefIso, labGCourant)` — même
  parcours (`traiterOccurrencesSerie_`), transformer qui retourne `null`
  (retire la ligne au lieu de la modifier).

### Décodeurs/encodeurs de tags (étendus, §2 et §4)

- `decoderLigneTache_(ligne)` → `{statut, texte, important, serieId, jour}` —
  reconnaît `[S]`/`[D]`/statut/`[Important]`/`[Série:xxxxxx]` **dans
  n'importe quel ordre**, tiret `tirets()` retiré une seule fois en tête.
- `encoderLigneTache_(t)` → texte, écrit **dans l'ordre fixé par le contrat**
  : `[S]`/`[D]` → statut → `[Important]` → `[Série:xxx]`.
- `decoderTaches_`/`encoderTaches_`, `decoderNotesJour_`/`encoderNotesJour_`
  — mêmes règles, appliquées ligne à ligne à une cellule multi-lignes.

## 3. Bug réel trouvé et corrigé

**Colonne physique de la cellule week-end fusionnée : off-by-one à
l'écriture.**

- Fichier : `WebApp.gs`
- Fonctions touchées : `apiEnregistrerCellulePersonne` (ligne ~1472) et
  `ecrireOccurrenceSerie_` (ligne ~2372, chemin série sur le week-end).
- Symptôme : les deux fonctions calculaient `colWE = labG + 1 + 6` (=
  `labG+7`), alors que **tous les sites de LECTURE** (`chargerSemaine_` :
  `zVals[iAncre][6]` et `entete[1][6]`, tous deux offset 6 depuis `labG` →
  colonne absolue `labG+6`) utilisent la colonne `labG+6`. Confirmé
  indépendamment par `creerSemaineWeb_` (`insertCol + 1 + 5` pour Samedi =
  `labG+6`) et par `fusionnerWeekends` (Planning_Format.gs) qui fusionne les
  colonnes week-end 2 par 2 sur les lignes personnel, l'ANCRE de la fusion
  (celle qui garde sa valeur en lecture Sheets) étant la première des deux,
  donc `labG+6` (Samedi), la seconde (`labG+7`, Dimanche) restant toujours
  vide en lecture.
- Effet réel : `sh.getRange(bloc.startRow, labG+7)` écrit dans la colonne de
  Dimanche, qui fait partie de la même fusion 2×N mais n'est **jamais**
  l'ancre — en lecture Sheets standard, une cellule fusionnée non-ancre
  renvoie toujours une valeur vide, quoi qu'on y ait écrit. Résultat concret :
  toute case week-end enregistrée depuis la fiche personne (Samedi ou
  Dimanche) ou posée par une série disparaissait immédiatement à la relecture
  — y compris dans la réponse `semaine` renvoyée par le MÊME appel
  (`chargerSemaine_` juste après, qui lit `labG+6`, jamais écrit). C'était un
  bug bloquant pour toute la fonctionnalité week-end du round V3 (§2 et la
  branche week-end de §4), qui n'aurait donné strictement AUCUN retour visible
  à l'usage réel (case qui semble ne jamais s'enregistrer).
- Correction : `colWE = labG + 6` dans les deux fonctions (le littéral `+ 1`
  en trop retiré). Vérifié par le harnais de test §4 ci-dessous
  (`fusionnerRemplacementWeekend_`, testé en isolation de la lecture/écriture
  Sheets — la correction de colonne elle-même n'est pas mockable sans un mock
  complet de `SpreadsheetApp`/fusion de cellules, hors de portée d'un test
  Node autonome ; revérifiée manuellement ligne par ligne contre les 4 sites
  de lecture indépendants cités ci-dessus, qui concordent tous entre eux et
  divergeaient uniquement des 2 sites d'écriture, désormais alignés).

Aucun autre bug fonctionnel trouvé. Une **limite connue, documentée mais non
corrigée** (comportement conforme à la lettre du contrat, pas une erreur
d'implémentation) :

- **Coïncidence de texte après distinction déjà actée (cellule week-end).**
  Le contrat (§2) ne définit le tag `[S]`/`[D]` que pour les NOUVELLES lignes
  écrites ("chaque nouvelle ligne est taguée [S] SEULEMENT si..."), jamais de
  fusion rétroactive des lignes déjà préservées. Scénario concret : Samedi et
  Dimanche sont d'abord rendus explicitement distincts (`[S] X` / `[D] Y`),
  puis Dimanche est réécrit avec un texte qui coïncide avec X (celui du
  Samedi) — la ligne `[S] X` préservée n'est jamais rétroactivement
  fusionnée avec la nouvelle ligne (untagged, puisque non distincte du point
  de vue de l'écriture en cours) : la cellule contient alors `[S] X` + `X`
  (2 lignes), et Samedi affiche ce texte en double à la lecture
  (`vueJourWeekend_` inclut les deux, `jour==="S"` ET `jour===null`
  correspondent tous deux). Cas rare (nécessite une coïncidence de texte
  après une distinction déjà actée), effet cosmétique (doublon visuel d'une
  ligne, aucune perte de données), non corrigé délibérément : improviser une
  règle de fusion rétroactive non demandée par le contrat aurait été plus
  risqué qu'utile pour ce round. Caractérisé et figé par un test dédié dans
  `test_backend_pures.js` (dernière assertion) pour qu'une future évolution
  du comportement soit un choix conscient, pas une régression silencieuse.
- **Premier write "untagged" écrasé par le jour opposé.** Toujours §2 : une
  ligne SANS tag jour (cas "même chose les 2 jours", y compris la toute
  première écriture d'une cellule vide, qui reste untagged faute de contenu à
  distinguer) est, par construction du contrat, traitée comme faisant partie
  des lignes "remplacées" par toute écriture day-specific SUIVANTE (elle
  n'est jamais dans l'ensemble `preserve`, qui ne retient que les lignes
  taguées explicitement pour l'AUTRE jour). Concrètement : écrire Samedi seul
  sur une cellule vide (untagged), puis écrire Dimanche avec un texte
  DIFFÉRENT fait disparaître le contenu du Samedi (jamais retrouvé comme
  "Samedi seulement", puisqu'il n'a jamais été explicitement tagué). C'est le
  comportement littéralement spécifié par le contrat (§2 : "toutes les autres
  lignes [untagged + taguées jour opposé] sont remplacées") — pas un bug
  d'implémentation, mais un compromis assumé par le contrat lui-même, à
  connaître côté UI : afficher clairement à Lionel, au moment de l'édition
  d'un seul des deux jours, que le contenu affiché pour l'AUTRE jour risque
  d'être perdu s'il n'a jamais été explicitement distingué.

## 4. Harnais de test — `test_backend_pures.js`

Fichier : `/home/claude/work/webapp/test_backend_pures.js`. Charge
`WebApp.gs` en entier dans un contexte Node `vm` avec des stubs minimaux
(`SpreadsheetApp.getActiveSpreadsheet().getSheetByName` → `null`,
`LockService`/`Utilities`/`HtmlService` no-op, `tirets()` copiée à
l'identique depuis `Planning_Format.gs` — seule dépendance externe des
fonctions testées). Teste en isolation :

- `pasCalendaire_` — 10 assertions : jour/semaine/mois/année, intervalle > 1,
  débordement de fin de mois (31 janvier + 1 mois), année bissextile
  (29 février + 1 an), rejet d'une fréquence inconnue.
- `decoderLigneTache_`/`encoderLigneTache_` — tags dans l'ordre canonique,
  tags dans un ordre INVERSÉ (rétrocompatibilité), tiret `tirets()` en tête,
  texte libre sans crochet, crochet inconnu conservé tel quel, ordre
  d'écriture canonique vérifié explicitement.
- `decoderTaches_`/`encoderTaches_` — round-trip exact sur 4 tâches combinant
  tous les tags à la fois (`[S]`+statut+`[Important]`+`[Série:xxx]`), y
  compris round-trip après passage par `tirets()` (simulé).
- `decoderNotesJour_`/`encoderNotesJour_` — round-trip avec `[Important]` et
  `[Série:xxx]` (jamais de statut), cellule vide.
- `fusionnerRemplacementWeekend_` (§2) — le scénario exact demandé dans la
  consigne de vérification (écrire Samedi seul sur une cellule contenant déjà
  `[D] Dimanche existant` → Dimanche préservé, Samedi tagué `[S]`, rien
  perdu/doublé), le cas "cellule vide → untagged", le cas "écritures
  séquentielles avec le même texte → jamais de doublon", et la limite connue
  documentée en §3 ci-dessus (caractérisée, pas assertée comme "correcte").

**Résultat au moment d'écrire ce changelog : 31/31 assertions passées, code
de sortie 0.**

```
$ node test_backend_pures.js
[...]
31/31 assertions passées.
```

## 5. `Planning_Format.gs` — confirmation explicite : **non modifié**

`Planning_Format.gs` n'a **pas eu besoin d'être modifié**, et n'a pas été
touché (2111 lignes, identique à avant le round — confirmé par sa date de
dernière modification, antérieure à `TRANSFERT-V3-SPEC.md`).

Raison : le contrat (§4) demandait explicitement de réutiliser
`semaineDepuisLabel`/l'énumération des blocs de semaine déjà présente dans
`Planning_Format.gs` pour qu'`apiEnregistrerSerie` localise la bonne colonne
de semaine, **sans réinventer la recherche de colonne**. Vérification faite :
`listerSemainesPlanning(sh)` (Planning_Format.gs, ligne ~957) renvoie déjà
`{labG, num, dateDebut, dateFin}` avec `dateDebut`/`dateFin` en objets `Date`
réels couvrant TOUTE la semaine (Lundi à Dimanche inclus — la ligne 3, ligne
des dates, n'est PAS fusionnée pour le week-end : `fusionnerWeekends` ne
fusionne que les 4 lignes du bloc PERSONNEL, jamais les lignes d'en-tête 1-5
— vérifié en lisant `fusionnerWeekends`/`formaterPlanning`). C'est
EXACTEMENT ce dont `positionSemaine_`/`semainesACriblePourSerie_`
(nouvelles fonctions, `WebApp.gs`) avaient besoin pour localiser une date ISO
quelconque (y compris un Samedi/Dimanche) dans le bon bloc de semaine — elles
la réutilisent telle quelle, sans aucune extension. De même,
`isLabelCol`/`CONFIG.*` (feuille "Chantier", "Fériés", lignes/colonnes
personnel) étaient déjà exactement ce qu'il fallait pour les nouvelles
feuilles "Statuts"/"Formulaires rapides" (créées et gérées entièrement dans
`WebApp.gs`, sur le modèle de la feuille "Chantier" existante — cf. §3 du
contrat, "modèle à suivre").

Aucune collision de nom entre les deux fichiers (vérifié par diff des
symboles de tête de ligne `function`/`var`) — les deux se partagent le même
scope global Apps Script mais ne se marchent jamais dessus.

## 6. Récapitulatif des fichiers touchés par cette vérification

- `WebApp.gs` — **2 corrections** (bug §3, colonne week-end), le reste
  inchangé (2605 → 2614 lignes, +9 lignes de commentaires de bugfix).
- `Planning_Format.gs` — **non touché**.
- `test_backend_pures.js` — **nouveau**, harnais de test Node autonome.
- `BACKEND-CHANGELOG.md` — **nouveau**, ce document.

*(Mis à jour ensuite par le round du 01.09.2026, §7 ci-dessous : nouvelles
corrections dans `WebApp.gs` et 5 nouvelles assertions dans
`test_backend_pures.js`, 31 → 36.)*

## 7. Round du 01.09.2026 — "idem pour les modifications de série"

Retour de Lionel, après le retrait décalage-en-masse/assignation-groupée
(cf. `V3-spec-suite2.md`, point 112) : *"Les entrées rapide que nous avons
faite ensemble ont disparue"* (traité séparément, cf. §8 ci-dessous) puis,
en cours d'investigation, *"idem pour les modification de série"*. Deux bugs
réels trouvés et corrigés, tous deux dans le sous-système série
(`apiChargerSemaine`/`apiEnregistrerJalonNote`/`ecrireOccurrenceSerie_`/
`traiterOccurrencesSerie_`/`apiModifierSerie`, `WebApp.gs`).

### 7.1. Jalon d'une série : tag visible en texte + `serieId` jamais reçu par le client

**Symptôme rapporté** : après rechargement de la page, un jalon créé via une
série n'était plus reconnu comme faisant partie de cette série (la fiche
d'édition ne proposait plus le choix de portée "cette occurrence / à partir
d'ici / toute la série").

**Cause racine, double** :
1. Côté serveur, `ecrireOccurrenceSerie_` posait déjà un tag `[Série:xxxxxx]`
   en tête du texte du jalon (via `decoderNotesJour_`/`encoderNotesJour_`,
   réutilisés tels quels), mais `apiChargerSemaine` (→ `chargerSemaine_`)
   renvoyait le champ `jalons` comme une **chaîne brute jamais décodée**
   (`texteLigne(entete[2])`) — un jalon issu d'une série affichait donc
   littéralement `"[Série:xxxxxx] Livraison ferraille"` comme texte visible
   à l'écran, et aucun `serieId` structuré n'était jamais transmis au client.
2. Côté client, même en imaginant le serveur corrigé, la construction des
   bulles JALONS (`construireVueDepuisCache`, `Index.html`) ne lisait que la
   chaîne de texte — aucun champ `serieId` n'était propagé sur l'item
   construit (contrairement aux tâches, qui le font déjà via
   `itt.serieId = t0.serieId || null;`).

**Décision d'architecture** : le jalon reste, comme avant ce round, une
**case à valeur UNIQUE** — jamais de liste de plusieurs entrées
indépendantes comme les notes (confirmé par `apiEnregistrerJalonNote`/
`apiEnregistrerPlage`, dont le commentaire "Jalon : INCHANGÉ" n'a pas été
touché). Le fix ne migre donc PAS les jalons vers le format multi-entrées
des notes (`decoderNotesJour_`/`encoderNotesJour_`) — il les décode plutôt
avec `decoderLigneTache_`/`encoderLigneTache_` (déjà utilisées pour une
LIGNE de tâche unique) appliqués directement à la case entière, ce qui
permet de reconnaître un éventuel tag `[Série:xxxxxx]` en tête sans changer
la nature "valeur unique" de la case ni toucher aux chemins existants
(`apiEnregistrerJalonNote`/`apiEnregistrerPlage`) pour un jalon normal (sans
série).

**Corrections apportées** :
- `chargerSemaine_` : `jalons` devient `texteLigne(entete[2]).map(...)` →
  `[{texte, serieId}, ...]` par jour (au lieu de `[string, ...]`).
- `apiEnregistrerJalonNote` : une frappe directe dans la case (le raccourci
  le plus simple, hors fiche d'édition) relit désormais le tag existant
  avant d'écraser la case, pour ne pas casser silencieusement le lien avec
  une série lors d'une simple correction de texte.
- `ecrireOccurrenceSerie_` : la branche jalon est désormais distincte de la
  branche note — écrit via `encoderLigneTache_({texte, serieId})`,
  **jamais** si la case du jour est déjà occupée (pas d'écrasement, cohérent
  avec le principe "jamais 2 jalons le même jour").
- `traiterOccurrencesSerie_` : la ligne 4 (jalons) est scannée séparément de
  la ligne 5 (notes), avec `decoderLigneTache_`/`encoderLigneTache_` au lieu
  de `decoderNotesJour_`/`encoderNotesJour_` — c'est ce qui permet à
  `apiModifierSerie`/`apiSupprimerSerie` de retrouver et modifier/supprimer
  un jalon de série correctement.
- `apiEnregistrerPlage` (branche jalon) : **non touchée** — inutilisée par
  le client actuel (aucun appel `kind==="jalon"` trouvé, cf. grep), mais un
  commentaire documente désormais explicitement la limite (perdrait un tag
  de série si jamais rebranchée) pour éviter une régression silencieuse
  future.
- Note (ligne 5) : **aucun changement de comportement** — elle utilisait
  déjà `decoderNotesJour_`/`encoderNotesJour_` de bout en bout côté serveur ;
  seul le client ne propageait pas `entree.serieId` sur l'item construit,
  corrigé côté `Index.html` (cf. `FRONTEND-CHANGELOG.md`).

### 7.2. `apiModifierSerie` : le champ `chantier` n'était jamais appliqué

**Symptôme rapporté** : modifier le chantier d'une tâche de série depuis la
fiche d'édition (portée "cette occurrence"/"à partir d'ici"/"toute la
série") n'avait aucun effet visible — le chantier restait celui d'origine.

**Cause racine** : `traiterOccurrencesSerie_` ne connaissait, pour chaque
occurrence matchée, que la ligne de tâche elle-même (`{texte, statut,
important, serieId, jour}`) — le chantier vit dans une cellule SÉPARÉE
(`chantierRow`, une par jour, cf. `apiChargerSemaine`/
`apiEnregistrerCellulePersonne`), jamais taguée `[Série:xxxxxx]` (ce n'est
pas une ligne de tâche). `apiModifierSerie` recevait pourtant déjà
`modifs.chantier` du client (`Index.html` l'envoie depuis longtemps) — sans
jamais s'en servir. Documenté comme "limite assumée" avant ce round ; le
retour de Lionel montre qu'il s'agit en pratique d'un manque gênant à
l'usage plutôt que d'un non-besoin.

**Correction** : `traiterOccurrencesSerie_` accepte un paramètre optionnel
`chantierAAppliquer` ; quand fourni (non vide), il écrase le chantier du
jour pour CHAQUE case de tâche où au moins une occurrence de la série a
effectivement été touchée par cette modification — même sémantique de
remplacement intégral qu'une case éditée normalement
(`apiEnregistrerCellulePersonne`), plutôt que le "jamais écrasé" qui
s'applique lors de la CRÉATION d'une nouvelle occurrence
(`ecrireOccurrenceSerie_`). `apiModifierSerie` calcule ce paramètre depuis
`modifs.chantier` (trim, vide → pas d'application) et le transmet ;
`apiSupprimerSerie` ne le passe pas (undefined → aucun effet, comportement
inchangé).

**Limite qui reste assumée, documentée explicitement** : le chantier du
week-end (cellule fusionnée Samedi/Dimanche) et celui des jalons/notes (sans
objet, pas de chantier pour ces 2 types) ne sont **pas** concernés par ce
fix — seules les occurrences de type "tache" en semaine (jours 1-5).

### 7.3. Vérifications faites

- `node --check` sur `WebApp.gs` (chargement `new Function()`) et sur le
  `<script>` extrait de `Index.html` : OK.
- `node test_backend_pures.js` : **36/36 assertions passées** (31
  précédentes + 5 nouvelles couvrant spécifiquement le round-trip
  `decoderLigneTache_`/`encoderLigneTache_` appliqué à un jalon — tag seul
  sans statut/important, rétrocompatibilité texte brut sans tag, cellule
  vide, texte vidé avec un `serieId` résiduel → `null`). Passé à **38/38**
  après le fix §7bis ci-dessous (2 assertions supplémentaires).
- Grep exhaustif de tous les sites lisant `data.jalons`/`jalonAuGi`/
  `noteSlotAuGi` côté `Index.html` (leçon du projet : toute migration
  chaîne→structure doit être recherchée exhaustivement) — 4 sites trouvés,
  tous les 4 mis à jour (construction des bulles, helper `jalonAuGi`, aperçu
  d'impression).
- Grep de tous les appelants de `traiterOccurrencesSerie_` (2 :
  `apiModifierSerie`, `apiSupprimerSerie`) et `ecrireOccurrenceSerie_` (1 :
  `apiEnregistrerSerie`) — signatures cohérentes des deux côtés.

## 7bis. Même round (01.09.2026) — "Les entrées rapide que nous avons faite ensemble ont disparue"

Retour de Lionel, envoyé juste avant "idem pour les modifications de série" (§7 ci-dessus) : les 3
formulaires rapides historiques — **Armature**, **Béton**, **Livraison armature**, construits ensemble
lors de sessions précédentes — n'apparaissaient plus dans le menu "Ajouter".

### Cause racine

Chacun de ces 3 formulaires a sa propre interface dédiée, entièrement codée en dur dans `Index.html`
(`ouvrirFormulaireArmature`/`ouvrirFormulaireBeton`/`ouvrirFormulaireLivraisonArmature`) et reconnue par
**correspondance exacte de nom** (`f.nom === "Armature"`, etc.) dans `cablerBoutonsMenuAjout` — ce code
était toujours intact après le transfert. Le menu "Ajouter" affiche un bouton par entrée de
`FORMULAIRES_RAPIDES` (venant de `apiListerFormulairesRapides`), qui lit la feuille de config
"Formulaires rapides" — **une feuille qui partait entièrement vide au premier transfert**, contrairement à
"Statuts" qui a de vrais défauts universels (4 statuts) déjà codés en dur (`STATUT_ORDER_WEB_DEFAUT`).
Sans ligne portant leur nom exact dans cette feuille, les 3 boutons ne pouvaient tout simplement plus
apparaître — alors même que leur code de formulaire était toujours là, prêt à fonctionner.

**Point clarifié en cours d'investigation** : contrairement à une hypothèse initiale, ces formulaires ne
sont **pas** rattachés à un intervenant particulier côté vrai backend — ni la feuille de config (schéma à 7
colonnes, aucune colonne "Assigné à") ni le rendu du menu "Ajouter" (`boutonsMenuAjout`, qui affiche tous
les `FORMULAIRES_RAPIDES` identiquement pour tout le monde) ne portent cette notion, qui n'existait que
dans le modèle en mémoire du prototype V3. Aucune question à poser à Lionel sur un intervenant réel :
ces 3 formulaires sont globaux, comme tous les autres.

### Correction

Même principe que "Statuts" — un repli par défaut en mémoire, jamais d'erreur si la feuille n'existe pas
encore :

- `FR_NOMS_DEFAUT`/`FR_CHAMPS_DEFAUT` (nouvelles constantes) : les 3 formulaires historiques, chacun avec
  un unique champ `"info"` explicatif (`"Formulaire intégré (zone / ...) — champs fixes, non modifiables
  ici"`) — **jamais** les vrais champs (zone/précision/étape/quantité/...), volontairement, puisque
  l'interface dédiée de ces 3 formulaires ne lit de toute façon jamais leurs `champs` déclarés ici (ce
  contenu ne sert qu'à l'affichage dans la page de réglages "Entrée rapide" générique).
- `apiListerFormulairesRapides()` : replie désormais sur ces 3 formulaires par défaut quand la feuille est
  absente OU vide (au lieu de `[]`).
- `feuilleFormulairesRapides_(true)` : seed la feuille avec ces 3 mêmes formulaires à sa toute première
  création réelle (premier enregistrement depuis la page "Entrée rapide") — même principe que
  `feuilleStatuts_(true)`.
- `apiSupprimerFormulaireRapide` : passait `creerSiAbsente=false` (donc un no-op silencieux si Lionel
  supprimait l'un des 3 par défaut avant toute autre écriture — la feuille absente n'avait "rien à
  supprimer", et le formulaire réapparaissait tel quel au rechargement suivant). Corrigé en
  `creerSiAbsente=true`, cohérent avec `apiEnregistrerStatuts`/`apiEnregistrerFormulaireRapide` qui
  créent déjà systématiquement.

### Limite assumée, garde ajoutée côté client

Ces 3 noms peuvent désormais apparaître dans la page de réglages "Entrée rapide" générique (avant, la
feuille vide faisait qu'ils n'y apparaissaient jamais). Les y **renommer** via l'éditeur générique
casserait silencieusement la correspondance exacte de nom et ferait perdre leur interface dédiée au profit
du formulaire générique (vide, seul le placeholder "info"). Plutôt que de redessiner l'éditeur générique
pour gérer ce cas spécial, `Index.html` désactive simplement "Modifier" pour ces 3 noms (toast explicatif
à la place) — "Supprimer" reste permis (retire juste le bouton du menu "Ajouter", sans danger, facile à
reconstruire en resauvegardant n'importe quel autre formulaire qui réutilise la même feuille). Détail
côté client dans `FRONTEND-CHANGELOG.md` §6bis.

### Vérifications faites

- `node --check`/`new Function()` : OK.
- `node test_backend_pures.js` : 2 nouvelles assertions — `apiListerFormulairesRapides()` renvoie bien les
  3 formulaires dans l'ordre quand la feuille est absente (chemin exact emprunté par le stub
  `getSheetByName` de ce harnais), et chacun porte bien son unique champ `"info"` — 38/38 au total.

## 8. Round du 02.09.2026 — "vérifie et optimise le script, j'ai l'impression qu'il manque des choses"

Demande ouverte de Lionel, sans autre précision. Traitée comme un audit systématique (complétude
fonctionnelle vs les specs V3, performance des appels Sheets, qualité du code) via 3 agents dédiés
lancés en parallèle, résultats vérifiés un par un avant correction — jamais appliqués tels quels. Rien de
tout cela n'a été demandé explicitement ; chaque point ci-dessous est documenté pour que Lionel puisse
juger si le comportement corrigé lui convient.

### 8.1. Performance — 3 appels Sheets superflus supprimés

Trouvés par l'audit dédié à `WebApp.gs`, chacun vérifié manuellement (tous les appelants tracés) avant
correction — cf. philosophie du projet, "un appel API coûte cher quelle que soit la quantité de données".

- **`creerSemaineWeb_`** appelait `SpreadsheetApp.flush()` inconditionnellement à la fin, alors que ses 3
  appelants (`assurerSemainesAvance_`, `apiEnregistrerSerie`, `calculerPlanDecalage_`) flushent déjà
  eux-mêmes après leur propre boucle (directement, ou via `formaterPlanning` qui flush systématiquement à
  la fin — vérifié ligne par ligne). Le flush était donc répété une fois par semaine créée en rafale
  (jusqu'à `MAX_CREATIONS_PAR_OUVERTURE` = 6) sans aucun effet utile. Retiré, remplacé par un commentaire
  expliquant pourquoi c'est sûr.
- **`apiAjouterPersonne`**, branche "réutilisation d'un emplacement libre" : renvoyait
  `apiChargerSemaine(labG)`, qui refait `getLastColumn`/`getLastRow`/`detecterPersonnes` (3 appels Sheets)
  pour retrouver une structure que la fonction avait déjà sous la main. Remplacé par
  `chargerSemaine_(sh, labG, lc, lr, pers)` — légitime ici : seules des VALEURS ont changé (aucune ligne
  insérée/décalée), exactement la condition documentée en tête de `chargerSemaine_`.
- **`apiAjouterPersonne`**, branche "nouveau bloc" : posait le nom de la nouvelle personne colonne par
  colonne (`sh.getRange(insertRow, c).setValue(...)` dans une boucle `for`, un appel par colonne label).
  Remplacé par le motif `parLots`/`refA1` déjà utilisé ailleurs dans ce fichier (`apiRenommerPersonne`,
  entre autres) : toutes les colonnes label posées en un seul appel batché via `RangeList`.

### 8.2. Nouvelle fonctionnalité — "nombre de tâches en cours" par personne (point 101, `V3-spec-suite.md`)

Gap trouvé par l'audit de complétude fonctionnelle : le point 101 du spec (déjà en partie implémenté —
liste, Modifier, Supprimer) prévoit aussi que chaque fiche Personnel/Intervenants affiche son nombre de
tâches en cours, et que la confirmation de suppression prévienne explicitement si la personne en a (ex.
*"Supprimer « Armature / Béton » et ses 3 tâches ?"*, car elles sont supprimées avec elle). Ce morceau
n'avait jamais été reporté depuis le prototype vers le vrai backend — rien ne calculait ce chiffre côté
serveur. Un indice concret confirmait le manque : `Index.html` contenait déjà une règle CSS
`.ligne-intervenant > span.compte` jamais utilisée par aucun JS — le crochet d'accueil du prototype, resté
vide après le transfert.

**Nouvelles fonctions (`WebApp.gs`)** :

- `compterTachesParPersonne_(sh, lc, lr, pers, labGDepart)` — cœur du calcul, fonction "presque pure"
  (prend `sh` en paramètre, ne fait qu'un seul `getRange(...).getValues()` dessus, aucune écriture).
  Renvoie `{ [ancre]: nombre }`. Portée : **jamais les semaines passées** (même convention que
  renommer/retirer une ligne, cf. `apiRenommerPersonne`/`apiSupprimerPersonne`) — de la semaine courante à
  la fin de la feuille. Une même tâche reconduite sur des jours ouvrés consécutifs (même
  texte/statut/important/chantier) ne compte qu'UNE fois, y compris quand elle enjambe un week-end
  (continuité délibérée, alignée sur `spanColonnes`/le modèle `gi` continu côté client, cf.
  `FRONTEND-CHANGELOG.md` §7) — sans cette fusion, une absence de 2 semaines afficherait "10 tâches" au
  lieu de "1", ce qui aurait été trompeur. Le week-end (case isolée, jamais de plage) ne fusionne jamais :
  chaque ligne y compte pour une tâche, à l'identique de la construction de `TACHES` côté client
  (`construireVueDepuisCache`).
- `apiCompterTachesPersonnes()` — point d'entrée exposé au client, calcule la semaine de départ (même
  logique que `apiDemarrer`/`indexSemaineDuJour_`) puis délègue à la fonction ci-dessus.

**Volontairement PAS appelée depuis `apiDemarrer`** : coûteuse par nature (elle doit lire toute la zone
personnel jusqu'à la fin de la feuille, potentiellement des dizaines de semaines), pour une donnée qui
n'est utile que sur 2 pages secondaires (Personnel/Intervenants). L'appeler à chaque ouverture de l'appli
aurait ralenti le chemin critique (le Planning, consulté à chaque usage) pour une fonctionnalité rarement
regardée. Côté client, `Index.html` la charge une seule fois par ouverture d'une de ces 2 pages et la met
en cache — détail dans `FRONTEND-CHANGELOG.md` §8.

**Définition de "tâche" retenue** : chaque ligne décodée non vide dans la case détail (matin/aprem/
week-end), fusionnée sur les jours consécutifs identiques — donc alignée sur ce qu'un humain voit comme
"une tâche" dans la grille (une plage colorée = une tâche), pas sur un nombre de cases ni de jours. Les
absences/congés/vacances sont comptées de la même façon que les vraies tâches (aucun champ ne les
distingue dans le modèle de données actuel, cf. `decoderTaches_`) — cohérent avec "TACHES filtré en même
temps que PERSONNES" du point 101, qui ne fait pas cette distinction non plus.

### 8.3. Trouvé, documenté, **volontairement pas corrigé** ce round

- **`calculerPlanDecalage_`** (décalage en masse) : l'audit l'a signalée comme non batchée. Vérification
  manuelle : elle l'est déjà ("par (personne, demi)", commentaire explicite dans le code) — pas de
  correction nécessaire. Fonctionnalité de toute façon retirée côté client (§5 de `FRONTEND-CHANGELOG.md`,
  demande explicite de Lionel) : reste du code mort en pratique, priorité basse.
- **`apiEnregistrerSerie`/`ecrireOccurrenceSerie_`/`positionSemaine_`** : jusqu'à 366 occurrences (une
  série longue) × jusqu'à 4 appels Sheets chacune. Optimisation réelle possible (regrouper par semaine),
  mais ce code a déjà été modifié 2 fois ce mois-ci (le fix "série" du 01.09.2026, cf. §7 ci-dessus) et
  aucun environnement réel n'est disponible ici pour tester une réécriture aussi profonde du cœur du
  système de séries sans risque de régression silencieuse. Signalé pour discussion future, pas touché ce
  round.

### 8.4. Vérifications faites

- `node --check`/`new Function()` sur `WebApp.gs` : OK.
- `node test_backend_pures.js` : **40/40 assertions** — 2 nouvelles couvrant `compterTachesParPersonne_`
  (fusion Vendredi→Lundi par-dessus un week-end affiché, rupture de fusion sur changement de chantier,
  empilement de plusieurs tâches dans une même case avec fermeture/réouverture d'une pile), testées via un
  stub `sh` minimal en mémoire (`fakeSheet()`, tout en bas du fichier) plutôt qu'un vrai mock
  SpreadsheetApp — seule fonction du harnais qui touche une "feuille", même fictive.
- Aucun changement de logique pure sur les 3 fixes de performance (§8.1) — seul le nombre/la forme des
  appels Sheets change, jamais le résultat renvoyé à l'appelant. Chaque appelant retracé manuellement
  avant modification (jamais sur la seule foi du rapport d'audit).
- Comme toujours, pas d'exécution possible dans un vrai classeur Google Sheets ici — Lionel doit confirmer
  que l'ajout/suppression de personnel reste correct après §8.1, et que les compteurs affichés en §8.2
  correspondent à ce qu'il voit dans la grille.

## 9. Round du 02.09.2026 (suite) — "les temps de chargement me semble long"

Retour de Lionel après le round §8 : l'ouverture de l'appli lui paraît lente, demande explicite
d'optimiser et de "mettre en arrière-plan" ce qui peut l'être. Deux optimisations ciblées sur
`apiDemarrer()`, seule fonction concernée (c'est elle, et uniquement elle, qui s'exécute à CHAQUE
ouverture de l'appli).

### 9.1. Un seul classeur/une seule feuille récupérés, partagés par toute la chaîne

`apiDemarrer()` enchaîne 6 étapes en série avant de répondre au client (compléter les semaines
manquantes, charger la semaine affichée, lister chantiers/statuts/fériés) — déjà regroupées en UN SEUL
aller-retour réseau par un round précédent (cf. §"DÉMARRAGE" plus haut dans ce fichier), mais chacune de
ces 6 étapes allait chercher SA feuille de son côté
(`SpreadsheetApp.getActiveSpreadsheet().getSheetByName(...)`) au lieu de réutiliser celle que
`apiDemarrer` avait déjà en main. Coût réel même DANS une seule exécution Apps Script — exactement le
principe qui gouverne déjà tout ce fichier ("un appel API coûte cher quelle que soit la quantité de
données"), jamais appliqué jusqu'ici au démarrage lui-même.

**Fonctions rendues capables de recevoir un classeur/une feuille déjà connus, au lieu de les redemander**
— toutes avec repli automatique sur l'ancien comportement (paramètre optionnel, en dernière position,
jamais fourni par un appelant existant = comportement strictement inchangé) :

- `feuillePlanning_(ss)`, `feuilleStatuts_(creerSiAbsente, ssConnu)`, `feuilleFeries_(creerSiAbsente,
  ssConnu)` — acceptent maintenant un classeur déjà obtenu.
- `apiListerChantiers(ss)`, `apiListerStatuts(ss)`, `apiListerFeries(ss)` — même principe ; leur contrat
  public (appelées sans argument par le client ou par d'autres fonctions de ce fichier) est identique.
- `assurerSemainesAvance_(isoAujourdhui, shConnue)` — un seul appelant (`apiDemarrer`), vérifié par grep
  avant modification.
- `creerSemaineWeb_(shConnue)` — **3 appelants** (`assurerSemainesAvance_`, `apiEnregistrerSerie`,
  `calculerPlanDecalage_`), tous les 3 vérifiés : chacun avait déjà sa feuille en main au moment de
  l'appel, potentiellement dans une boucle de plusieurs itérations (jusqu'à 60 pour une série longue) —
  chaque itération refaisait la même recherche pour rien. Les 3 appels mis à jour pour passer leur `sh`.

`apiDemarrer()` récupère maintenant `ss`/`sh` une seule fois tout en haut et les transmet à chacune des
étapes ci-dessus. Elle appelle aussi directement `chargerSemaine_(sh, labG, lc, lr, pers)` — comme le
faisait déjà `apiChargerSemaine()` en interne — au lieu de passer par `apiChargerSemaine(labG)`, qui
aurait refait exactement la même recherche de feuille pour rien (`lc`/`lr` recalculés APRÈS
`assurerSemainesAvance_`, qui a pu ajouter des colonnes — donc toujours à jour).

**Aucun changement de résultat** : uniquement le nombre d'appels Sheets, jamais la donnée renvoyée à
l'appelant (client comme autres fonctions serveur).

### 9.2. `formulairesRapides` retiré du chemin critique de démarrage

Cette donnée ne sert QUE dans le menu "Ajouter" d'un intervenant et la page "Entrée rapide" — jamais pour
afficher le planning. Elle était pourtant chargée à CHAQUE ouverture de l'appli, y compris pour le cas de
très loin le plus fréquent (aller directement au planning). Retirée de la réponse de `apiDemarrer()` (les
2 branches — planning vide et planning normal) ; `apiListerFormulairesRapides()` elle-même n'a pas changé
— elle reste appelable telle quelle, simplement plus appelée depuis `apiDemarrer`. Chargée à part côté
client, en arrière-plan (cf. `FRONTEND-CHANGELOG.md` §9).

**`statuts` et `feries` restent, eux, dans `apiDemarrer()`** — décision délibérée, pas un oubli : les deux
colorent directement des cases du planning dès le premier affichage (pastilles de statut sur les tâches
des sous-traitants, teintes des jours fériés). Les différer aurait fait apparaître la grille dans une
couleur transitoire fausse, corrigée un instant plus tard — un "flash" visible, plus gênant que le gain de
performance. Vérifié en lisant `Index.html` (où `STATUTS`/`feriesParIso` sont utilisés dans le rendu de la
grille) avant de décider, pas juste supposé.

### 9.3. Vérifications faites

- `node --check`/`new Function()` sur `WebApp.gs` : OK.
- `node test_backend_pures.js` : 40/40, inchangé — aucune fonction pure testée n'a vu sa logique changer,
  uniquement le nombre/la provenance des appels Sheets internes à `apiDemarrer` et ses sous-fonctions
  (non testables sans un vrai classeur, cf. limite déjà assumée par ce harnais).
- Chaque paramètre optionnel ajouté vérifié à la main contre TOUS ses appelants existants (grep exhaustif
  avant modification, jamais juste le site qu'on modifie) pour confirmer qu'aucun ne serait affecté par le
  changement de signature.
- Comme toujours, pas de mesure réelle possible ici (pas de classeur Google Sheets connecté) — Lionel doit
  confirmer que l'ouverture de l'appli est perceptiblement plus rapide, et que rien ne s'affiche de
  travers (statuts/fériés toujours corrects dès le premier affichage, formulaires rapides bien présents
  dans le menu "Ajouter" et sur la page "Entrée rapide" après un court instant).

## 10. Round du 02.09.2026 (suite) — "le menu fériés n'est pas comme décidé lors de la maquette"

Suite du round §9 : Lionel a testé l'appli en conditions réelles et remonté 4 points (cf.
FRONTEND-CHANGELOG.md §10) ; le seul touchant le backend est le menu Fériés. Après relecture de la
maquette d'origine (`V3-spec-suite.md` point 104) contre l'implémentation réelle, 2 écarts délibérés du
round de transfert V3 avaient été identifiés et soumis à Lionel : 3 catégories → 2, couleur par catégorie
fixe plutôt qu'éditable. Sa réponse : **"les 2"**. Les 2 sont restaurés.

### 10.1. `apiEnregistrerFeries` : la 3e catégorie "compenses" n'est plus repliée sur "ferie"

`CATEGORIES_FERIES_IDS = ["ferie", "vacances_entreprise", "compenses"]` + `normaliserCategorieFerie_(cat)`
remplacent les 2 ternaires à 2 branches (`apiListerFeries` et `apiEnregistrerFeries`, modifs ET nouveaux)
qui ramenaient toute valeur autre que `"vacances_entreprise"` sur `"ferie"` — c'est cette normalisation qui
repliait silencieusement "Compensés" dans "Férié" depuis le transfert V3. Whitelist plutôt que ternaire :
un seul endroit qui connaît la liste des catégories valides, réutilisé aussi par la nouvelle feuille de
config ci-dessous ; une valeur inconnue (feuille modifiée à la main, ancienne donnée) retombe sur `"ferie"`
— même filet de sécurité qu'avant, juste plus de simplification arbitraire du contrat à 2 catégories.

### 10.2. Nouvelle feuille de config "Catégories fériés" — couleurs éditables

Même esprit que la feuille "Statuts" (§3 du round de transfert V3, cf. plus haut dans ce fichier) : 1 ligne
d'en-tête (`Clé`/`Nom affiché`/`Couleur`), une ligne par catégorie (3, dans l'ordre de la maquette —
Vacances entreprise, Férié, Compensés), jamais créée par une simple lecture
(`feuilleCategoriesFeries_(false, ss)` renvoie `null` si absente), créée avec son contenu par défaut au 1er
besoin réel d'écriture.

- **`apiListerCategoriesFeries(ss)`** — `[{id, nom, couleur}]`, dans l'ordre de la feuille. Feuille
  absente ou vide → les 3 valeurs par défaut (`CATEGORIES_FERIES_*_DEFAUT`) : jamais de pilule fériés sans
  couleur. Les couleurs par défaut de `ferie`/`vacances_entreprise` reprennent EXACTEMENT les teintes déjà
  utilisées en usage réel côté client (`#e8a3a3`/`#a9c6ea`, cf. FRONTEND-CHANGELOG.md) plutôt que les
  couleurs saturées de la maquette d'origine (`#FF5050`/`#92D050`) : aucun changement visuel de coloration
  au moment de ce round pour ces 2-là. `compenses` (nouvelle) reçoit une 3e teinte pastel inédite de la même
  famille (`#e8dba3`) — modifiable depuis l'appli dès ce round.
- **`apiEnregistrerCategoriesFeries(couleurs)`** — `couleurs:[{id, couleur}]`. Seule la couleur est
  éditable depuis l'appli : les 3 catégories elles-mêmes (id/nom) restent fixes, pas de
  renommage/ajout/suppression de catégorie prévu ici — même limite assumée que pour la colonne "Catégorie"
  de la feuille "Fériés" (contrat à identifiants fixes). Entrée à id inconnu ou couleur invalide (pas un
  hex à 6 chiffres, `estCouleurHex_`) ignorée, jamais bloquant.
- **`apiDemarrer()`** : `categoriesFeries: apiListerCategoriesFeries(ss)` ajouté aux 2 branches de la
  réponse (semaines vides / cas normal), au même titre que `statuts`/`feries` — ces couleurs sont
  render-critical (teinte des jours fériés dès le 1er affichage de la grille, cf. `feriePourJour` côté
  client), donc chargées ici et jamais en arrière-plan comme les formulaires rapides (même raisonnement
  qu'au round §9).

### 10.3. Vérifications

- `node --check` sur `WebApp.gs` : syntaxe OK.
- `acorn-globals` sur `WebApp.gs` et sur le script inline d'`Index.html` : aucun identifiant non déclaré
  inattendu (uniquement les fonctions déjà connues de `Planning_Format.gs` côté serveur, et les globals
  navigateur/JS standards côté client).
- `node test_backend_pures.js` : 48/48 (40 déjà existantes + 8 nouvelles pour
  `normaliserCategorieFerie_`/`apiListerCategoriesFeries`, cf. `test_backend_pures.js` §8).
- Comme toujours, pas de mesure/vérification visuelle réelle possible ici (pas de classeur Google Sheets
  connecté) — Lionel doit confirmer que la page Fériés affiche bien 3 pilules, que cliquer sur une pastille
  ouvre le sélecteur de couleur natif (et non le changement de catégorie active), et que la couleur choisie
  se retrouve à la fois dans le calendrier annuel ET dans la teinte des jours fériés de la grille.

## 11. Round du 02.09.2026 (suite) — "à l'enregistrement toutes les vacances et compensés sont devenu rouge fériés"

Retour de Lionel juste après avoir testé le round §10 : en enregistrant des jours "Vacances entreprise"/
"Compensés", ils reviennent en "Férié" (rouge). Simulé de bout en bout dans le harnais Node (écriture de
nouvelles entrées, ET recatégorisation d'entrées existantes déjà "ferie" vers "vacances_entreprise"/
"compenses" via `modifs`) : dans les deux cas, `apiEnregistrerFeries`/`apiListerFeries` préservent
correctement la catégorie — la logique de normalisation elle-même (§10.1) n'est PAS en cause.

**Cause la plus probable : un déploiement partiel.** `apiEnregistrerFeries`/`apiListerFeries` AVANT ce
round (2 catégories seulement) ramènent tout ce qui n'est pas exactement `"vacances_entreprise"` sur
`"ferie"` — exactement le symptôme décrit. Si le fichier `WebApp.gs` envoyé au round §10 n'a pas encore
été recollé/redéployé dans le projet Apps Script réel de Lionel (seul `Index.html` l'aurait été), c'est très
exactement ce comportement qui réapparaît côté serveur, alors que le client (à jour) affiche bien 3
catégories. À vérifier en priorité avant tout autre correctif.

Indépendamment de cette hypothèse, 3 renforcements défensifs trouvés en creusant, tous livrés dans ce
round (aucun n'est LA cause confirmée, mais chacun comble un vrai trou) :

1. **`isoDeCelluleFerie_`** ne reconnaissait que les dates texte au format `DD/MM/YYYY`. Une cellule Date
   jamais reformatée en type Date réel (collée à la main, héritée d'un import) au format suisse
   `DD.MM.YYYY` (séparateur point) tombait sur aucun des deux cas gérés (ni `instanceof Date`, ni un
   `split("/")` de longueur 3) : `isoDeCelluleFerie_` renvoyait `null`, et la ligne entière devenait
   invisible pour l'appli (ni lue par `apiListerFeries`, ni modifiable par `apiEnregistrerFeries` — un
   `modifs` la ciblant serait silencieusement ignoré, `index[m.iso]` restant `undefined`). Accepte
   maintenant aussi le `.` comme séparateur.
2. **`calculerFeries()` (bouton "Calculer les fériés", `Index.html`)** écrasait sans condition tout jour
   déjà catégorisé manuellement s'il coïncidait avec un férié calculé (Noël, Nouvel an, etc.) — cf.
   FRONTEND-CHANGELOG.md §11 pour le détail, c'est un correctif client mais qui a le même effet visible
   que ce que Lionel a décrit.
3. **`feriePourJour` (`Index.html`)** retombait, en cas d'échec de correspondance de catégorie, sur la
   couleur de "Férié" (`#e8a3a3`) — un filet de sécurité qui maquillait tout futur bug de ce genre en
   "c'est bien un jour férié" plutôt que de le rendre visible. Retombe maintenant sur un gris neutre.

### Vérifications

- `node --check` sur `WebApp.gs` : syntaxe OK.
- `acorn-globals` sur `WebApp.gs` et sur le script inline d'`Index.html` : rien d'inattendu.
- `node test_backend_pures.js` : 53/53 (48 déjà existantes + 5 nouvelles pour `isoDeCelluleFerie_`, cf.
  `test_backend_pures.js` §9 — y compris le format suisse `DD.MM.YYYY`).
- **Lionel doit en priorité confirmer qu'il a bien recollé/redéployé LES DEUX fichiers** (`WebApp.gs` ET
  `Index.html`) dans son projet Apps Script — c'est le point qu'aucun test ici ne peut vérifier à sa place.

## 12. Round du 02.09.2026 (suite) — diagnostic de version + "reverifie 1x que tu a tout fait"

Deux demandes distinctes de Lionel dans ce round, traitées l'une après l'autre.

### 12.1. `apiVersionServeur()` — diagnostic de déploiement

Le round §11 n'a pas résolu le bug ("ne marche pas même avec un nouveau déploiement" — retour de Lionel
après avoir tenté de redéployer). Plutôt que reformuler une 3e hypothèse à l'aveugle, ajout d'un marqueur
de version imprimé en clair sur la page Fériés (cf. FRONTEND-CHANGELOG.md), pour trancher objectivement si
le déploiement actif sert bien ce fichier :

```js
var VERSION_WEBAPP = "2026-09-02-r11-categories-feries";
function apiVersionServeur() { return VERSION_WEBAPP; }
```

Si l'appel échoue côté client (fonction inconnue de l'`.exec` actif), c'est la preuve la plus nette
possible que le déploiement actif ne sert PAS ce `WebApp.gs` — indépendamment de tout ce qui a été
corrigé au round §11. **`VERSION_WEBAPP` est à incrémenter à chaque futur envoi non trivial de ce
fichier**, pour que ce marqueur reste utile dans la durée.

### 12.2. "reverifie 1x que tu a tout fait ce qui etait dans la maquette"

Lionel a demandé une revérification complète face à la maquette (`prototype-bulles.html`) après avoir
remarqué l'absence de 3 fonctionnalités : entrée rapide assignable par intervenant/ouvrier, modification/
suppression d'un chantier, modification/suppression d'un ouvrier/intervenant. Audit (agent dédié + contre-
vérification directe par grep sur les fichiers réels et par `Projects.project_search` sur
`V3-spec-suite2.md`) : le 3e point était déjà complet (`apiRenommerPersonne`/`apiSupprimerPersonne`,
portée "semaine"/"suivantes"). Les 2 premiers étaient de VRAIES régressions de périmètre — documentées
comme des "déviations assumées" dans FRONTEND-CHANGELOG.md §2 lors du portage V3, faute d'extension du
contrat serveur à l'époque, mais bien présentes et validées dans la maquette. Restaurées ici.

#### 12.2.1. Chantiers — renommer / supprimer

Le NOM d'un chantier est la clé de reconnaissance texte dans chaque case "chantier" déjà écrite du
planning (`chantierRow` = `bloc.startRow` matin / `+2` après-midi, cf. `apiEnregistrerCellulePersonne`),
donc renommer/supprimer sans migrer ces cases les orphelinerait silencieusement — c'est précisément cette
migration qui manquait avant ce round.

- **`apiRenommerChantier(ligne, nouveauNom)`** : vérifie l'unicité du nouveau nom (insensible à la casse),
  réécrit le nom sur la feuille "Chantier", puis balaie TOUTES les semaines de la feuille "Planning" (les 2
  lignes "chantier" — matin/après-midi — de chaque personne détectée, sur toute la largeur en un seul
  `getRange`/`setValues` par ligne concernée) pour remplacer l'ancien nom par le nouveau partout où il
  apparaît EXACTEMENT. **Migre aussi les semaines passées**, volontairement différent de
  `apiRenommerPersonne` (qui respecte "les semaines passées ne sont jamais modifiées") : ce principe
  protège un FAIT historique, alors qu'ici il ne s'agit que de corriger une clé de référence après coup —
  ne pas migrer le passé casserait sa coloration pour aucun bénéfice. Termine par `recolorerChantiers()`.
  Renvoie `casesMigrees` (compte informatif pour le toast client).
- **`compterUtilisationsChantier_(shP, lc, lr, pers, labGDepart, nom)`** + **`apiCompterUtilisationsChantier
  (ligne, labGCourant)`** : compte brut des cases "chantier" portant ce nom, **semaine affichée et
  suivantes seulement** (jamais les passées, même principe que `apiSupprimerPersonne`) — sert de base à la
  confirmation avant suppression côté client.
- **`apiSupprimerChantier(ligne, labGCourant, forcer)`** : `forcer` absent/faux + au moins une case
  utilisée → ne touche rien, renvoie `{ ok:false, utilisations:n }` (au client de reproposer avec
  `forcer:true` après confirmation explicite — même principe que "tâches en cours" pour une personne).
  Sinon : vide (texte seul, jamais la ligne "détail" juste en dessous, pour ne pas perdre un texte de tâche
  déjà tapé) les cases "chantier" de la semaine affichée et des suivantes, puis `sh.deleteRow(ligne)` sur la
  petite feuille "Chantier" (contrairement à "Planning", où une ligne n'est jamais supprimée).

#### 12.2.2. Formulaires rapides — "Assigné à" (8e colonne `AssigneA`)

`FR_COL_ASSIGNE = 8` / `FR_NB_COLONNES = 8` ajoutés (`FR_COL_NOM..FR_COL_OPTIONS` inchangés, 1-7).
`""` = tout le monde, sinon l'ancre (ligne Planning, même convention que `personneId`/`ancreDe()` côté
client) de la personne à qui ce formulaire est réservé. Répercuté dans `feuilleFormulairesRapides_`
(en-tête + seed des 3 formulaires historiques, `AssigneA` vide = comportement identique à avant),
`apiListerFormulairesRapides` (lit la 8e colonne, `assigneA` porté par l'objet formulaire — lu sur la 1ère
ligne rencontrée pour ce nom, puisque répétée sur chaque ligne-champ comme `NomFormulaire`/
`OrdreFormulaire`) et `apiEnregistrerFormulaireRapide(nom, ordre, champs, assigneA)` (nouveau 4e
paramètre, écrit sur chaque ligne-champ réinsérée).

**Corrigé au passage** : un formulaire enregistré SANS AUCUN champ (cas valide, cf. note du panneau côté
client — "l'entrée s'ajoute directement en un clic, sans formulaire") n'écrivait auparavant AUCUNE ligne
sur la feuille, donc disparaissait silencieusement au 1er enregistrement — bug latent préexistant, mis en
lumière en touchant cette fonction pour `assigneA`. `apiEnregistrerFormulaireRapide` écrit maintenant une
ligne "porteuse" (`Cle`/`Label`/`Type`/`OptionsJSON` vides, `NomFormulaire`/`OrdreFormulaire`/`AssigneA`
renseignés) pour ce cas ; `apiListerFormulairesRapides` reconnaît cette ligne (`Cle` vide) et n'en tire
PAS un faux champ dans `champs[]`.

### 12.3. Vérifications

- `node --check` sur `WebApp.gs` et sur le script inline d'`Index.html` : syntaxe OK.
- `acorn-globals` sur `WebApp.gs` : aucun identifiant non déclaré inattendu (uniquement les globals déjà
  connus de `Planning_Format.gs` — `CONFIG`, `detecterPersonnes`, `recolorerChantiers`, etc.)
- `node test_backend_pures.js` : 59/59 (53 déjà existantes + 6 nouvelles pour `apiListerFormulairesRapides`
  / colonne `AssigneA`, cf. `test_backend_pures.js` §10 — feuille peuplée simulée via un swap temporaire de
  `SpreadsheetApp.getActiveSpreadsheet()`, formulaire assigné + ligne "porteuse" + formulaire global).
- `apiRenommerChantier`/`apiCompterUtilisationsChantier`/`apiSupprimerChantier` **ne sont PAS couvertes par
  un test automatisé** (touchent `SpreadsheetApp`/`recolorerChantiers`, hors de la portée volontairement
  minimale du harnais Node, cf. son propre commentaire d'intro) — vérifiées par relecture ligne par ligne
  uniquement (signatures/ordre d'arguments croisés avec `chargerSemaine_`/`detecterPersonnes`/
  `apiListerChantiers` existants), même limite déjà assumée pour `apiEnregistrerChantiers`/
  `apiRenommerPersonne`/`apiSupprimerPersonne`. **Premier test réel en conditions Apps Script à faire par
  Lionel** : renommer un chantier utilisé sur plusieurs semaines (passées comprises) et vérifier la
  coloration ; supprimer un chantier utilisé et vérifier le message de confirmation avec le bon chiffre.

## 13. Round du 02.09.2026 (r13) — bug fériés : cause identifiée (décalage de fuseau horaire)

### 13.1. Ce qui a éliminé les 3 hypothèses précédentes

Lionel a confirmé, capture à l'appui, que la page Fériés affiche
`Version du serveur en ligne : 2026-09-02-r11-categories-feries` — le déploiement actif sert donc bien le
`WebApp.gs` à jour, celui qui connaît les 3 catégories — **et le bug persiste malgré tout**. Toute la
piste "déploiement pas à jour" suivie aux §11/§11bis/§11ter est donc morte. Ce round part de zéro sur la
cause réelle.

### 13.2. La cause : Sheets stocke des JOURS, le script lit des INSTANTS

Une cellule date de Google Sheets ne contient ni heure ni fuseau : c'est un numéro de jour. Deux fuseaux
distincts entrent alors en jeu :

- `getValues()` rend cette cellule sous forme d'objet `Date` = **minuit ce jour-là dans le fuseau DE LA
  FEUILLE** (`ss.getSpreadsheetTimeZone()`, ex. Europe/Zurich) ;
- `isoJour(d)` (Planning_Format.gs) la relit avec `d.getFullYear()/getMonth()/getDate()`, donc **dans le
  fuseau DU SCRIPT** (`Session.getScriptTimeZone()`) — un projet Apps Script garde très souvent le fuseau
  américain par défaut, jamais aligné à la main sur le classeur.

Si le fuseau du script est EN RETARD sur celui de la feuille (tout fuseau américain vs Europe/Zurich), la
conversion recule d'un jour : une cellule affichant `20.07.2026` est relue `2026-07-19`. Les écritures,
elles, tombent sur le bon jour (Sheets normalise l'instant en jour civil au moment de stocker) — **l'aller
est juste, le retour décale**. D'où exactement le symptôme de Lionel : ce qu'il enregistre est correctement
écrit dans la feuille, mais `apiListerFeries()` le renvoie sous un iso décalé d'un jour ; côté client,
`categoriesRevenues[iso]` ne trouve donc jamais l'iso envoyé, et le diagnostic conclut — à juste titre —
que « le serveur n'a gardé aucune des catégories ». Ce n'était pas la catégorie qui se perdait, c'était la
DATE qui ne correspondait plus.

C'est aussi pourquoi aucun test du harnais Node ne pouvait l'attraper : dans Node il n'y a qu'un seul
fuseau, donc écriture et relecture sont symétriques par construction.

### 13.3. Le correctif

- **`isoDeCelluleFerie_(dv, tz)`** — nouveau 2e paramètre : une cellule de type `Date` est convertie par
  `Utilities.formatDate(dv, tz, "yyyy-MM-dd")` avec le fuseau DE LA FEUILLE, c'est-à-dire exactement le
  jour que la feuille affiche. Sans `tz` (autres appelants, tests), repli sur l'ancien comportement.
- **`fuseauFeuille_(sh)`** (nouvelle) — `sh.getParent().getSpreadsheetTimeZone()`, sous `try/catch`
  (un stub de test n'a pas forcément `getParent()` : renvoie `null`, donc repli propre).
- **`apiListerFeries`** et **`apiEnregistrerFeries`** passent désormais ce `tz` à chaque lecture de date
  (y compris pour construire l'`index` par iso, celui-là même qui faisait échouer silencieusement les
  `modifs`).
- **`dateCelluleFerie_(iso)`** (nouvelle) — les dates ÉCRITES dans une cellule sont ancrées à **midi** et
  non à minuit : quel que soit l'écart entre les deux fuseaux (±13 h en pratique), midi reste le même jour
  civil des deux côtés, donc aucune écriture ne peut basculer sur le jour voisin. `dateDepuisIso_` (minuit)
  reste inchangée : elle sert au calcul de dates pur (séries, décalages), jamais à écrire en cellule.
  La colonne date reçoit un `setNumberFormat("dd.MM.yyyy")` pour que midi ne s'affiche pas comme une heure.
- **Aucune migration de données nécessaire** dans le sens le plus probable (script en retard sur la
  feuille) : les dates étaient déjà stockées sur le bon jour, seule la relecture décalait.

### 13.4. `apiVersionServeur()` enrichie — pour confirmer ou infirmer sans deviner

Comme l'hypothèse ci-dessus reste à confirmer sur le classeur réel (les deux fuseaux sont peut-être
identiques chez Lionel, auquel cas le correctif est neutre et la cause est ailleurs), `apiVersionServeur()`
renvoie maintenant, **en une seule chaîne** : la version, le fuseau de la feuille, le fuseau du script,
et un VRAI aller-retour de date à travers Sheets (écriture de `2026-07-20` dans une cellule de test hors
zone de données — colonne J, jamais lue par `apiListerFeries` ni `lireFeries` — relecture des deux façons,
puis remise à blanc). Renvoyer une chaîne plutôt qu'un objet est délibéré : la ligne « Version du serveur
en ligne » de la page Fériés l'affiche telle quelle, donc **le diagnostic fonctionne même si `Index.html`
n'est pas encore à jour** — ce qui était précisément le cas sur la dernière capture de Lionel.

### 13.5. Même classe de bug ailleurs — repéré, PAS encore corrigé

`apiChargerSemaine` lit les dates d'en-tête de semaine avec `isoJour(v)` et `v.getDate()/getMonth()`
(mêmes méthodes "fuseau script"), alors que `aujourdhui` est calculé avec `ss.getSpreadsheetTimeZone()`
(cf. lignes déjà existantes). Si les deux fuseaux diffèrent réellement, la grille afficherait les numéros
de jour décalés d'un jour et la colonne « aujourd'hui » serait mal repérée. `lireFeries`/`fmtDK`
(Planning_Format.gs) ont le même défaut. **Volontairement non touchés ce round** : le correctif fériés
ci-dessus est prouvé neutre si les fuseaux sont identiques, alors qu'un refactor de la lecture des dates
de la grille ne l'est pas — à faire une fois que la ligne de diagnostic aura confirmé que les fuseaux
diffèrent bien. À noter que Lionel n'a jamais signalé de dates fausses dans la grille, ce qui est un
indice CONTRE l'hypothèse et une raison de plus d'attendre la confirmation avant d'élargir.

### 13.6. Vérifications

- `node --check` sur `WebApp.gs` : syntaxe OK. `acorn-globals` : rien d'inattendu.
- `node test_backend_pures.js` : 59/59 (inchangé — `isoDeCelluleFerie_` sans `tz` garde l'ancien
  comportement, donc les tests §9 passent tels quels).
- (Round r14, ci-dessous : l'hypothèse du fuseau a été INFIRMÉE sur le classeur réel — conservée ici
  telle quelle, correctif compris, parce qu'elle corrige un vrai défaut latent et qu'elle est neutre.)
- **`node test_fuseau_feries.js` : 13/13 (NOUVEAU fichier)** — modélise le comportement réel de Sheets
  (jour civil sans fuseau, converti avec le fuseau de la feuille) avec feuille en Europe/Zurich et script
  en America/Los_Angeles. Reproduit le bug AVANT le correctif (`20.07.2026` relu `2026-07-19`,
  `2026-01-01` envoyé → relu `2025-12-31`), vérifie l'aller-retour propre APRÈS, et vérifie que le
  correctif est **neutre quand les deux fuseaux sont identiques** (donc sans risque si l'hypothèse est
  fausse) ainsi que la robustesse de l'ancrage à midi sur ±13 h d'écart.

## 14. Round du 02.09.2026 (r14) — fuseau infirmé ; le suspect devient une COPIE FANTÔME des fonctions

### 14.1. Ce que le diagnostic r13 a réellement montré

Ligne affichée sur le classeur de Lionel :

```
2026-09-02-r13-fuseau-feries · fuseaux : feuille Europe/Vaduz / script Europe/Zurich (DIFFÉRENTS)
· écrit 2026-07-20, relu 2026-07-20 (fuseau script) / 2026-07-20 (fuseau feuille)
```

Les deux fuseaux portent des noms différents (Vaduz / Zurich) mais **le même décalage** : l'aller-retour de
date est propre des deux côtés. **L'hypothèse du §13 est donc infirmée** — c'est la 2e hypothèse fausse
d'affilée (après celle du déploiement). Le correctif r13 est conservé : il est prouvé neutre quand les
fuseaux coïncident (cf. `test_fuseau_feries.js`) et il ferme un vrai défaut latent pour tout classeur dont
les fuseaux, eux, différeraient vraiment.

### 14.2. Le message client, lui, a tranché

```
Enregistré, mais 6 jour(s) sur 6 n'ont pas gardé la catégorie demandée (réponse : 42 jour(s) au total).
Exemples — 2026-01-02 : envoyé « vacances_entreprise », revenu « ferie » ; 2026-01-05 : … ; 2026-01-06 : …
```

Deux informations décisives : (1) l'iso envoyé est **bien présent** dans la réponse — donc la
correspondance de date fonctionne, plus rien à chercher de ce côté ; (2) c'est la **catégorie** qui revient
en `ferie`. Or, relu ligne par ligne, le code de CE fichier ne peut pas produire ça :
`normaliserCategorieFerie_("vacances_entreprise")` renvoie `"vacances_entreprise"` (whitelist
`CATEGORIES_FERIES_IDS`), le `modifs` écrit bien en colonne C, et `apiListerFeries` relit cette colonne.
Vérifié aussi : `gs()` transmet correctement les arguments (`[fn].apply(null, args)`), et `feriesMemo_`
(mémo de requête) ne concerne que `lireFeries` pour la teinte de la grille, jamais `apiListerFeries`.

### 14.3. Hypothèse retenue : une 2e copie de ces fonctions dans un autre fichier .gs

**Tous les fichiers `.gs` d'un projet Apps Script partagent UN SEUL espace de noms**, et la dernière
définition chargée écrase les précédentes, sans le moindre avertissement. Si le projet de Lionel contient
un autre fichier (`Code.gs`, une copie de `WebApp` collée dans un nouveau fichier au lieu de remplacer
l'existant…) portant une ancienne version de `apiEnregistrerFeries`/`apiListerFeries`/
`normaliserCategorieFerie_`, c'est CELLE-LÀ qui s'exécute. Ça expliquerait tout :

- `apiVersionServeur` n'existe QUE dans le fichier neuf → aucune copie concurrente → la version affichée
  est bien `r13`, ce qui donne l'illusion que tout le fichier est actif ;
- une version ancienne d'`apiEnregistrerFeries` (celle d'avant la colonne "Catégorie", qui n'écrivait que
  2 colonnes) laisserait la colonne C intacte → la catégorie resterait éternellement `ferie` quoi qu'on
  envoie — exactement le symptôme, et exactement son entêtement à travers 4 rounds de correctifs.

Vérifié côté dépôt : aucune de ces fonctions n'est définie en double dans `WebApp.gs`,
`Planning_Format.gs` ni `Chantier_AutoColor.gs` — la copie fantôme serait donc un fichier présent
uniquement dans le projet Apps Script de Lionel, jamais vu ici.

### 14.4. Diagnostic r14 (temporaire, à retirer une fois la cause confirmée)

`apiVersionServeur()` remplace le test de fuseau par trois vérifications ciblées, toujours rendues en une
seule chaîne (donc lisibles même avec un `Index.html` pas à jour) :

1. `normalise(vacances_entreprise)=…` et `ids=…` — la normalisation réellement appelée et sa whitelist ;
2. `enregistrer=ok|AUTRE COPIE` / `lister=ok|AUTRE COPIE` — **introspection** : `String(fn)` contient-il un
   marqueur propre à cette version (`dateCelluleFerie_`, `fuseauFeuille_`) ? Si non, la fonction exécutée
   vient d'ailleurs : la copie fantôme est prouvée ;
3. `aller-retour réel : envoyé vacances_entreprise -> revenu …` puis `cellule catégorie écrite = "…"` —
   un vrai passage par le pipeline complet sur un jour bidon (`2099-01-02`), avec lecture BRUTE de la
   cellule avant toute normalisation (distingue « jamais écrit » de « écrit puis mal relu »), suivi de la
   suppression de ce jour de test dans un `finally` (nettoyage garanti même en cas d'erreur).

Coût assumé : deux écritures + une suppression dans la feuille "Fériés" à chaque ouverture de la page
Fériés, le temps de ce round seulement.

### 14.5. Vérifications

- `node --check` sur `WebApp.gs` : syntaxe OK. `node test_backend_pures.js` : 59/59.
  `node test_fuseau_feries.js` : 13/13 (le correctif r13, conservé, reste vert).

## 15. Round du 02.09.2026 (r15) — LA cause : la colonne "Catégorie" est en français, écrite à la main

### 15.1. La découverte

Capture de la liste des fichiers Apps Script de Lionel : `Code.gs`, `WebApp.gs`, `Index.html` — pas de
`Planning_Format.gs` (son contenu est donc dans `Code.gs`). En cherchant une éventuelle copie fantôme des
fonctions fériés, relecture de `v2-backend-inventory.md`, §feuille "Fériés" :

> **Col C = catégorie visuelle libre ajoutée par Lionel (Compensés / Fériés / Vacances)**

La colonne "Catégorie" n'a jamais contenu d'identifiants techniques : elle contient **les libellés français
que Lionel y tape lui-même depuis des années**, avec accents, majuscules et pluriels. Or
`normaliserCategorieFerie_` ne connaissait que la whitelist `["ferie","vacances_entreprise","compenses"]`
et renvoyait `"ferie"` pour tout le reste :

| Contenu réel de la cellule | Avant (r14) | Après (r15) |
|---|---|---|
| `Vacances` | `ferie` ❌ | `vacances_entreprise` ✓ |
| `Compensés` | `ferie` ❌ | `compenses` ✓ |
| `Fériés` | `ferie` ✓ (par accident) | `ferie` ✓ |

**Toute la feuille de Lionel se relisait donc en "férié"** — d'où un calendrier intégralement rouge, ses
vacances d'entreprise et ses compensés écrasés à chaque rechargement. Ce n'était pas l'enregistrement qui
perdait la catégorie : c'était la LECTURE qui ne savait pas lire ce qui était déjà écrit. Toutes les
hypothèses précédentes (déploiement §11, fuseau §13, copie fantôme §14) cherchaient un mécanisme de perte
là où il n'y avait qu'une incompréhension de vocabulaire.

### 15.2. Le correctif

- **`sansAccents_(s)`** (nouvelle) — repli manuel plutôt que `normalize("NFD")`, sans dépendance.
- **`SYNONYMES_CATEGORIES_FERIES`** (nouvelle) — table des libellés acceptés en LECTURE : `Vacances`,
  `Vacances entreprise`, `Vacances d'entreprise`, `Compensés`, `Compensé`, `Récupération`, `Fériés`,
  `Férié`… comparés sans accents, sans casse, singulier comme pluriel. Les 3 identifiants techniques
  restent acceptés (rétrocompatibilité des lignes déjà écrites par l'appli).
- **`normaliserCategorieFerie_`** applique la whitelist puis la table de synonymes ; tout ce qui reste
  inconnu retombe sur `"ferie"` comme avant — jamais bloquant.
- **`libelleCategorieFerie_(id)`** (nouvelle) — ce que l'appli ÉCRIT désormais en colonne C est le
  **libellé français** (`Vacances entreprise` / `Férié` / `Compensés`), plus l'identifiant technique : la
  feuille reste lisible et modifiable à la main exactement comme avant l'appli, ce qui est le mode de
  travail réel de Lionel. Utilisé par `apiEnregistrerFeries` (modifs et nouveaux) et par
  `assurerColonneCategorieFeries_` (remplissage des cases vides). L'aller-retour
  `id -> libellé écrit -> id relu` est couvert par les tests.

### 15.3. Ce que ça n'explique pas encore

Le message client signalait 6 jours sur 6 revenus en `ferie` **après** enregistrement. Sur ces jours-là,
le `modifs` aurait dû écrire la bonne valeur puis la relire correctement, même avant r15. Ce point reste
donc ouvert, et le diagnostic r14 est conservé pour le trancher : contrôle d'introspection (les fonctions
exécutées sont-elles bien celles de ce fichier, ou une copie chargée depuis `Code.gs` ?) + aller-retour
réel sur un jour bidon avec **lecture brute de la cellule écrite**. Si tout revient `ok`, la seule cause
était bien celle du §15.1 et le diagnostic sera retiré au prochain round.

### 15.4. Vérifications

- `node --check` : OK. `acorn-globals` : rien d'inattendu.
- `node test_backend_pures.js` : **79/79** (dont 20 nouvelles au §11 : libellés manuscrits avec accents/
  pluriels/majuscules, identifiants techniques, valeurs inconnues, et l'aller-retour complet).
- **Une assertion existante a été retournée volontairement** : `normaliserCategorieFerie_('vacances')`
  attendait `'ferie'` (analyse d'un round précédent : « ancien id de maquette à jeter »). C'était l'erreur
  d'analyse à l'origine du bug — `Vacances` est le mot que Lionel écrit dans sa feuille. L'assertion
  attend désormais `vacances_entreprise`, avec le commentaire expliquant le retournement.
- `node test_fuseau_feries.js` : 13/13 (correctif r13 conservé, toujours vert).

## 16. Round du 02.09.2026 (r16) — CAUSE CONFIRMÉE : une ancienne copie dans `Code.gs`

### 16.1. La preuve

Diagnostic r15 exécuté sur le classeur de Lionel :

```
2026-09-02-r15-categories-francais · normalise(vacances_entreprise)=vacances_entreprise
· ids=ferie/vacances_entreprise/compenses · e…  lister=ok
· aller-retour réel : envoyé vacances_entreprise -> revenu ferie
· cellule catégorie écrite = ""
```

`normalise(...)` correct, `ids` corrects, `lister=ok` — le code de ce fichier EST bien chargé. Et pourtant
l'écriture d'un jour neuf via le vrai pipeline ressort avec **une cellule catégorie VIDE**. Or
`enregistrerFeriesV3_` écrit systématiquement les 3 colonnes (`[libellé, date, catégorie]`) : il est
impossible qu'elle produise une colonne C vide. **Ce n'est donc pas elle qui s'exécute.**

Le projet Apps Script de Lionel contient `Code.gs`, `WebApp.gs`, `Index.html` — et pas de
`Planning_Format.gs` (son contenu est donc dans `Code.gs`). Tous les fichiers `.gs` partagent **un seul
espace de noms** et la dernière définition chargée gagne, sans avertissement. `Code.gs` embarque une
ancienne version d'`apiEnregistrerFeries`, d'avant l'existence de la colonne "Catégorie" — celle qui
n'écrivait que Libellé + Date, laissant la colonne C vide après le `clearContent()`. D'où :

- la catégorie perdue à chaque enregistrement, quelle que soit celle envoyée ;
- le calendrier intégralement rouge (colonne C vidée -> tout relu en `ferie`) ;
- **et surtout : les quatre correctifs précédents sans le moindre effet, puisqu'ils corrigeaient du code
  qui ne s'exécutait pas.** `apiVersionServeur` n'existant que dans le fichier neuf, aucune copie
  concurrente ne la masquait : elle affichait fidèlement la bonne version, ce qui a entretenu l'illusion
  que tout le fichier était actif. Le marqueur de version était juste, mais il ne prouvait rien sur les
  autres fonctions.

### 16.2. Le correctif : des noms qui ne peuvent pas être écrasés

Plutôt que de faire supprimer du code à la main dans `Code.gs` — fichier jamais vu d'ici, et qui contient
par ailleurs tout le moteur de mise en forme du planning : une fausse manœuvre y casserait bien plus que
les fériés — la vraie implémentation prend des noms qu'aucune version ancienne ne peut porter :

- **`listerFeriesV3_(ss)`** et **`enregistrerFeriesV3_(modifs, nouveaux, supprimes)`** — les
  implémentations réelles (ex-`apiListerFeries` / `apiEnregistrerFeries`, inchangées sur le fond).
- **`apiEnregistrerFeriesV3(...)`** — le point d'entrée que le client appelle désormais
  (`Index.html`, `btnEnregistrerFeries`).
- `apiListerFeries` / `apiEnregistrerFeries` restent définies et **délèguent** aux V3 : si elles sont
  écrasées par `Code.gs`, plus aucune conséquence, personne d'important ne les appelle.
- Tous les appels internes (`apiDemarrer` × 2, le retour d'`enregistrerFeriesV3_`, le diagnostic) passent
  par les noms V3 — **aucun chemin critique ne dépend plus d'un nom écrasable**.
- **`libelleCategorieFerie_`** n'utilise plus la constante globale `CATEGORIES_FERIES_NOMS_DEFAUT` mais
  une table locale : cette constante aussi pourrait être écrasée par un autre fichier, ce qui ferait
  écrire une cellule vide sans lever la moindre erreur. Une fonction sans dépendance externe ne peut pas
  tomber dans ce piège.

### 16.3. Diagnostic mis à jour

- Le verdict passe **en tête** de la chaîne : sur l'écran de Lionel, la ligne débordait à droite et c'est
  précisément le `enregistrer=AUTRE COPIE` qui tombait hors champ. Il annonce maintenant, d'emblée,
  `⚠ ANCIENNE COPIE PRÉSENTE dans un autre fichier .gs (…) — sans effet désormais`.
- Côté client, `.version-serveur` reçoit `overflow-wrap: anywhere` / `white-space: normal` : plus rien ne
  peut être coupé hors écran.
- L'aller-retour de test emprunte maintenant le chemin V3, exactement celui du client.

### 16.4. Suite

Une fois confirmé côté Lionel (`test V3 : … -> cellule "Vacances entreprise" -> relu vacances_entreprise`),
il restera à **nettoyer `Code.gs`** de ses fonctions fériés obsolètes — à faire en lui demandant d'abord le
contenu du fichier, jamais à l'aveugle. Le diagnostic pourra alors être retiré.

### 16.5. Vérifications

- `node --check` sur `WebApp.gs` et sur le script inline d'`Index.html` : syntaxe OK.
- `node test_backend_pures.js` : 79/79. `node test_fuseau_feries.js` : 13/13.
- Les correctifs r13 (fuseau) et r15 (libellés français) sont conservés : tous deux restent nécessaires et
  n'étaient simplement pas suffisants tant que le vrai code ne s'exécutait pas.

## 17. Round du 02.09.2026 (r17) — §16 INFIRMÉ : `Code.gs` est propre

Lionel a envoyé le contenu intégral de `Code.gs`. Vérification faite : **aucune fonction fériés dedans**.
Le fichier contient exactement le moteur de mise en forme — `CONFIG`, `CHANTIER_PALETTE`, `isLabelCol`,
`construireCarteColonnes`, `detecterPersonnes`, `formaterPlanning`, `reformaterZone`, `recolorerChantiers`,
`imprimerSemaine`, `creerSemaine`, `lireFeries`, `fmtDK`, `isoJour`, `listerSemainesPlanning`,
`onEdit`/`onEditPlanning`/`onEditChantier`/`onEditMobile`, l'export PDF, le sélecteur de semaine HTML —
c'est-à-dire l'ancien `Planning_Format.gs`, renommé. Sa liste de fonctions correspond exactement, une à
une, aux identifiants qu'`acorn-globals` signale comme "non déclarés" dans `WebApp.gs`. **Aucun doublon,
rien à supprimer chez lui.**

L'hypothèse du §16 (copie fantôme) est donc fausse — la 4e hypothèse fausse de cette enquête, après le
déploiement (§11), le fuseau horaire (§13) et les libellés français (§15, réel mais insuffisant).

**Ce qui est conservé du §16, et pourquoi** : le renommage `listerFeriesV3_`/`enregistrerFeriesV3_` +
point d'entrée `apiEnregistrerFeriesV3` ne coûte rien, protège réellement contre cette classe de panne
(un projet Apps Script multi-fichiers y reste exposé) et rend le circuit fériés indépendant de tout nom
partagé. Mais il ne faut PAS lui attribuer la correction du bug : la cause n'est pas établie. Le
commentaire d'en-tête dans `WebApp.gs` a été réécrit en ce sens plutôt que laissé à affirmer du faux.

**Reste à expliquer** : la cellule catégorie écrite VIDE alors que `enregistrerFeriesV3_` écrit toujours
`[libellé, date, catégorie]` et que `libelleCategorieFerie_('vacances_entreprise')` renvoie
`"Vacances entreprise"` — vérifié par test (`test_backend_pures.js` §11, 79/79). Il manque une donnée :
ce que cette fonction renvoie **sur son serveur**.

### 17.1. Diagnostic r17

Trois ajouts à `apiVersionServeur()`, tous destinés à isoler ce point :

- `libelle(vacances_entreprise)="…"` — la fonction d'étiquetage appelée seule, hors de tout contexte. Si
  elle ne renvoie pas `Vacances entreprise` là-bas, c'est elle qui écrivait une cellule vide, et l'enquête
  s'arrête là.
- `feuille Fériés : N lignes × M colonnes` — une feuille à moins de 3 colonnes expliquerait aussi une
  colonne C perdue.
- La **ligne entière** écrite (`[A="…" | B="…" | C="…"]`) au lieu de la seule colonne C : si les colonnes
  sont décalées par rapport à ce qu'on croit, ça se voit immédiatement.

À noter : `libelleCategorieFerie_` n'utilise plus `CATEGORIES_FERIES_NOMS_DEFAUT` depuis r16 (table locale)
— si la cause était une valeur globale indisponible côté serveur, r16 la corrige déjà, incidemment. Le
diagnostic r17 permettra de le confirmer plutôt que de le supposer.

### 17.2. Vérifications

- `node --check` : OK. `node test_backend_pures.js` : 79/79. `node test_fuseau_feries.js` : 13/13.

## 18. Round du 02.09.2026 (r18) — blindage de l'étiquette + diagnostic rapatrié dans le message

Nouveau retour de Lionel : même message (`6 jour(s) sur 6`, `réponse : 42 jour(s) au total`), cette fois
sur des jours d'août (`2026-08-03/04/05`) au lieu de janvier — donc reproductible à volonté, sur
n'importe quelle plage. Sans la ligne de diagnostic (non transmise), impossible de savoir ce que
`libelleCategorieFerie_` renvoie sur son serveur. Deux décisions plutôt qu'une 5e hypothèse :

### 18.1. Rendre la panne impossible depuis cette fonction

Tout converge vers une cellule "Catégorie" écrite VIDE. Le seul endroit qui produit cette valeur est
`libelleCategorieFerie_`. Elle ne peut désormais plus renvoyer `""`, `undefined` ni `null` : repli en
cascade sur la table locale → l'identifiant brut reçu → `"Férié"`, le tout sous `try/catch`. Quelle que
soit la cause en amont (normalisation inattendue, valeur exotique, table indisponible), **la cellule ne
peut plus sortir vide d'ici**. Vérifié par un test dédié : aucune entrée testée (`vacances_entreprise`,
`Vacances`, `Compensés`, `""`, `null`, `undefined`, `0`, `false`, `{}`, `[]`, texte inconnu) ne produit de
valeur vide.

### 18.2. Faire remonter le diagnostic là où il est lu

La ligne "Version du serveur en ligne" sous le calendrier est discrète, grise, et débordait de l'écran :
elle n'a jamais été transmise. Le message d'erreur, lui, est systématiquement lu et photographié. En cas
d'écart, le client rappelle donc maintenant `apiVersionServeur()` et **réaffiche le message complété** par
`|| DIAGNOSTIC SERVEUR : …`. Le message de base s'affiche immédiatement, sans attendre cet appel, et un
échec de celui-ci ne peut pas l'effacer.

C'est le principe déjà appliqué aux rounds précédents — instrumenter plutôt que deviner — mais appliqué
cette fois au **canal** : un diagnostic que personne ne lit ne vaut rien, aussi juste soit-il.

### 18.3. Vérifications

- `node --check` sur `WebApp.gs` et sur le script inline d'`Index.html` : OK.
- `node test_backend_pures.js` : 79/79. Test dédié r18 : `libelleCategorieFerie_` ne renvoie jamais de
  valeur vide, sur 14 entrées dont les cas limites.

## 19. Round du 02.09.2026 (r19) — **CAUSE TROUVÉE** : cellules fusionnées en colonne "Catégorie"

### 19.1. La preuve

Diagnostic r17 sur le classeur de Lionel, en entier :

```
2026-09-02-r17-diag-libelle · aucun doublon détecté sur les anciens noms
· libelle(vacances_entreprise)="Vacances entreprise"
· feuille Fériés : 41 lignes × 26 colonnes
· test V3 : envoyé vacances_entreprise -> ligne écrite
    [A="TEST DIAGNOSTIC" | B="Fri Jan 02 2099 12:00:00 GMT+0100" | C=""] -> relu ferie
```

Trois faits, tous décisifs :

1. `libelle(vacances_entreprise)="Vacances entreprise"` — **la fonction d'étiquetage est correcte** : le
   §18 (blindage) était une précaution utile, pas la cause.
2. `aucun doublon` — pas de copie fantôme (§16/§17 déjà infirmés).
3. `[A=… | B=… | C=""]` — dans la MÊME écriture, A et B arrivent, **C non**.

Une seule mécanique de Google Sheets produit ça : dans une plage **fusionnée**, seule la cellule
d'**ancrage** reçoit la valeur ; les cellules "couvertes" ignorent `setValues()` **sans lever d'erreur** et
se relisent vides. Une fusion verticale dans la colonne C rend donc toute écriture de catégorie sans effet
sur les lignes couvertes, pendant que Libellé (A) et Date (B), hors fusion, s'écrivent normalement.

### 19.2. Le détail qui a emporté le diagnostic — trouvé par Lionel

> « comme tu peux le voir 1 case reste en vert, le 8 janvier » … « avant cela c'était le 20 juillet qui
> restait en vert »

**Une seule case survit, et elle se déplace.** C'est à chaque fois le DERNIER jour saisi : les nouveaux
jours sont ajoutés à la fin du bloc, donc le dernier tombe **après** la zone fusionnée et reçoit bien sa
catégorie. Aucune autre hypothèse de cette enquête n'explique ce comportement ; la fusion l'explique
exactement. C'est cette observation, faite par Lionel de lui-même, qui a transformé une hypothèse en
certitude.

### 19.3. Le correctif

**`defusionnerZoneFeries_(sh)`** (nouvelle) — appelée au tout début d'`enregistrerFeriesV3_`, **avant**
toute lecture comme toute écriture (lire une cellule couverte renvoie `""` : défusionner d'abord évite de
réécrire ce vide par-dessus les données). Retire toutes les fusions de la zone A:C. Sans perte : la valeur
de l'ancrage est conservée, les cellules couvertes étaient déjà vides. Idempotente — sans aucun effet sur
une feuille saine, donc sans risque pour un autre classeur.

Le diagnostic affiche en plus `fusions restantes en A:C = N` : doit valoir 0 après passage. Si ce n'est
pas 0, c'est la défusion elle-même qu'il faut regarder.

**À dire à Lionel** : les catégories des jours couverts n'ont jamais été écrites dans la feuille — elles ne
sont pas récupérables. Après ce correctif, il faut les ressaisir **une fois** ; ensuite elles tiendront.

### 19.4. Vérifications

- **`node test_fusion_feries.js` : 10/10 (NOUVEAU fichier)** — modélise le comportement réel d'une cellule
  couverte (écriture ignorée, relecture vide), que le harnais habituel ne pouvait pas attraper puisqu'il
  écrit dans un tableau JS où toute cellule accepte toujours l'écriture. Reproduit le symptôme r17
  (A et B écrits, C vide), **reproduit le "1 seule case verte, la dernière saisie"**, vérifie qu'après
  défusion chaque ligne garde sa catégorie, et qu'une feuille sans fusion est strictement inchangée.
- `node --check` : OK. `node test_backend_pures.js` : 79/79. `node test_fuseau_feries.js` : 13/13.

### 19.5. Bilan de l'enquête (6 hypothèses, 1 cause)

| # | Hypothèse | Verdict | Correctif conservé ? |
|---|---|---|---|
| §11 | Déploiement pas à jour | Infirmée (marqueur de version) | — (diagnostic) |
| §13 | Décalage de fuseau horaire | Infirmée (Vaduz/Zurich = même heure) | Oui — vrai défaut latent, neutre ici |
| §15 | Libellés français non reconnus | **Vrai défaut**, mais pas la cause | Oui — nécessaire |
| §16 | Copie fantôme dans `Code.gs` | Infirmée (`Code.gs` envoyé et vérifié) | Oui — noms blindés, précaution |
| §18 | Étiquette renvoyant du vide | Infirmée (`libelle()` correcte) | Oui — blindage, précaution |
| §19 | **Cellules fusionnées en colonne C** | **CONFIRMÉE** | **Oui — LE correctif** |

Leçon pour la suite : le tournant n'a pas été une idée de plus, mais le fait d'avoir enfin fait remonter
une donnée BRUTE (le contenu réel de la ligne écrite, colonne par colonne) au lieu d'un verdict calculé.
Les cinq premiers rounds interprétaient ; le sixième a montré. À faire beaucoup plus tôt la prochaine fois.

## 20. Round du 02.09.2026 (r20) — confirmation de Lionel + retrait de l'échafaudage

**« cela fonctionne »** — le correctif §19 (défusion de la colonne "Catégorie" avant écriture) est
confirmé en conditions réelles. Cause close.

Retiré, puisque l'enquête est terminée :

- **l'aller-retour d'écriture du diagnostic** — il créait puis supprimait un jour de test (02.01.2099)
  dans la feuille "Fériés" **à chaque ouverture de la page**. `apiVersionServeur()` ne touche plus jamais
  au classeur : elle renvoie la seule chaîne de version.
- l'introspection des doublons de noms, le rapport de fuseaux horaires, le comptage de fusions restantes,
  et le rapatriement du diagnostic serveur dans le toast côté client.

Conservé, et pourquoi :

- **`defusionnerZoneFeries_`** — LE correctif.
- **le marqueur de version** (`VERSION_WEBAPP` + ligne discrète sous le calendrier) : il a tranché à lui
  seul l'hypothèse du déploiement, et il tranchera la même question à chaque envoi futur. **À incrémenter
  systématiquement.**
- **les correctifs r13 (fuseau) et r15 (libellés français)** : de vrais défauts, indépendants de la cause
  finale.
- **les noms V3 non écrasables** (r16) et le **blindage de `libelleCategorieFerie_`** (r18) : précautions
  sans coût, contre des classes de panne réelles.
- **l'avertissement client "N jour(s) n'ont pas gardé la catégorie demandée"** (sans le diagnostic
  serveur) : c'est le silence d'un simple "Enregistré." qui avait laissé ce bug s'installer des semaines.
  Une perte de données doit se voir.

À signaler à Lionel : si une ligne « TEST DIAGNOSTIC » datée du **02.01.2099** subsiste dans la feuille
"Fériés" (une exécution interrompue entre l'écriture et son nettoyage), elle peut être supprimée à la
main — elle est sans effet, l'année 2099 n'étant jamais affichée.

### Vérifications

- `node --check` sur `WebApp.gs` et sur le script inline d'`Index.html` : OK.
- `acorn-globals` : rien d'inattendu. `test_backend_pures.js` : 79/79 ·
  `test_fusion_feries.js` : 10/10 · `test_fuseau_feries.js` : 13/13.

## 21. Round du 02.09.2026 (suite) — 9e colonne "TypeEntree" : une entrée rapide peut être une ABSENCE

Demande de Lionel : « il faut ajouter les absences aux ajouts rapides à éditer ». Jusqu'ici, Congé et
Vacances étaient **codés en dur** dans le menu « Ajouter » du planning : ni renommables, ni assignables,
ni supprimables. Les rendre configurables suppose de savoir qu'un formulaire produit une ABSENCE et non
une tâche — c'est la notion de « type » du prototype, abandonnée au portage V3 faute de place dans le
contrat serveur de l'époque (cf. FRONTEND-CHANGELOG.md §2). Elle est restaurée ici.

- **`FR_COL_TYPE_ENTREE = 9`**, `FR_NB_COLONNES` passe de 8 à 9, en-tête `TypeEntree`.
- **`FR_TYPES_ENTREE = ["tache", "absence"]`** + `normaliserTypeEntree_()` : toute valeur inconnue ou
  absente retombe sur `"tache"` — une ligne écrite avant ce round reste donc une tâche, exactement comme
  avant, sans migration.
- `apiListerFormulairesRapides` renvoie `typeEntree` ; `apiEnregistrerFormulaireRapide(nom, ordre, champs,
  assigneA, typeEntree)` prend un 5e paramètre.

### Vérifications

- `node --check` sur `WebApp.gs` : OK. `node test_backend_pures.js` : 79/79 (inchangé — les tests de la
  feuille "Formulaires rapides" passent tels quels, la 9e colonne étant optionnelle par construction).

## 22. Round du 02.09.2026 — AJOUT LOINTAIN : poser une entrée à une date éloignée

Demande de Lionel : « j'ai besoin d'un bouton pour un formulaire qui me permettrait d'entrer une
note/jalon/tâche/congé à n'importe qui […] plus loin dans le temps sans défiler tout le calendrier,
avec durée. Exemple : un ouvrier prend congé 1 semaine au mois de novembre. »

### 22.1. Les deux vrais obstacles

1. **Les semaines visées n'existent pas.** Le planning n'est créé qu'à `SEMAINES_AVANCE` (5) semaines
   devant : en septembre, novembre n'a aucune colonne. Sans traitement, l'entrée serait simplement
   ignorée — silencieusement, ce qui est le pire des cas.
2. **Le volume d'allers-retours.** Une semaine de congé sur les deux demi-journées = 10 cases. Les écrire
   depuis le client ferait 10 appels serveur. Le client envoie donc l'intention (qui, quoi, quand, combien
   de temps), le serveur pose tout.

### 22.2. Ce qui a été ajouté

- **`assurerSemainesJusqua_(sh, isoCible)`** — crée les semaines manquantes jusqu'à couvrir la date visée,
  puis UNE seule passe de `formaterPlanning` (même principe qu'`assurerSemainesAvance_`). Plafonné à
  `MAX_CREATIONS_AJOUT_LOINTAIN = 60` (~14 mois) : une faute de frappe sur l'année ne doit pas partir en
  boucle et faire expirer le script. Au-delà, message explicite plutôt qu'échec obscur.
- **`joursOuvresDepuis_(isoDebut, nbJours)`** — les N premiers jours OUVRÉS : « 1 semaine de congé » = 5
  jours, samedi et dimanche ni comptés ni remplis, même si la période démarre un mercredi ou un samedi.
- **`positionDuJour_(semaines, iso)`** — (labG, jourIdx 0-4) d'une date, ou `null` (week-end, ou date hors
  planning) : jamais d'écriture dans une colonne devinée.
- **`ajouterLignePersonne_`** — pose une ligne dans une case sans rien écraser (la ligne s'ajoute aux
  existantes) ; le chantier n'est posé que si la case n'en a pas déjà un, jamais recouvert — même règle que
  `ecrireOccurrenceSerie_`.
- **`apiAjoutLointain(payload, labGCourant)`** — point d'entrée unique. Jalons et notes réutilisent
  `apiEnregistrerPlage`, qui savait DÉJÀ écrire un même texte sur une plage traversant plusieurs semaines :
  rien à réinventer, seules les semaines manquaient. Renvoie la liste des semaines à jour, sans quoi le
  client ignorerait celles qui viennent d'être créées.

### 22.3. Le piège évité : verrous imbriqués

`apiAjoutLointain` devait prendre le verrou de script… et `apiEnregistrerPlage` le prend aussi. Les
emboîter aurait fait attendre à l'exécution un verrou **qu'elle détient déjà** : échec systématique au bout
de 15 s, sur du code d'apparence correcte, et impossible à reproduire dans le harnais Node (aucun
`LockService` réel). Repéré à la relecture avant livraison ; la fonction est donc découpée en **étapes
séquentielles**, chacune avec son propre verrou, jamais l'une dans l'autre. Un commentaire en capitales le
signale sur place, pour que personne ne « simplifie » ça plus tard.

### 22.4. Vérifications

- **`node test_ajout_lointain.js` : 15/15 (NOUVEAU)** — extrait `joursOuvresDepuis_`, `positionDuJour_` et
  `dateDepuisIso_` du vrai `WebApp.gs`. Couvre les cas où ce type de fonctionnalité se casse en silence :
  départ en milieu de semaine (le congé enjambe le week-end et déborde sur la semaine suivante), départ un
  samedi, bascule d'une semaine de planning à la suivante, week-end et dates hors planning renvoyant
  `null`. **Le scénario exact de Lionel est vérifié bout à bout** : congé de 5 jours à partir d'un jeudi de
  novembre, réparti sur 2 semaines, jours 3-4 puis 0-1-2.
- `node --check` : OK · `acorn-globals` : rien d'inattendu · `test_backend_pures.js` : 79/79.

## 23. Round du 02.09.2026 — jalons et notes sur des DEMI-JOURNÉES

Demande de Lionel : « j'aimerais avoir la possibilité de mettre jalons et notes sur des demi-journées
aussi ». Difficulté : une case de jalon (ligne 4) ou de note (ligne 5) correspond à UN JOUR dans la
feuille. Il faut donc y loger deux valeurs sans changer la structure.

### 23.1. Le procédé : une étiquette, pas une colonne

Réemploi exact de ce qui existe déjà pour le week-end — deux jours dans une seule cellule, distingués par
les tags `[S]`/`[D]` — avec les étiquettes **`[M]`** (matin) et **`[A]`** (après-midi). Le mécanisme de
tags de `decoderLigneTache_` était déjà générique : il a suffi de deux lignes pour les reconnaître, et de
deux pour les écrire dans `encoderLigneTache_`.

**Aucune étiquette = la journée entière.** Tout ce qui existe déjà se relit donc exactement comme avant :
**zéro migration**, et une feuille reprise par une ancienne version du script resterait lisible.

- `decoderLigneTache_` renvoie `demi: "matin"|"aprem"|null` ; `encoderLigneTache_` pose `[M]`/`[A]`.
- `decoderNotesJour_` / `encoderNotesJour_` font transiter le champ.
- `chargerSemaine_` expose `demi` sur chaque jalon et chaque note.
- `apiEnregistrerPlage(..., important, demi)` et `apiEnregistrerJalonNote(..., texte, demi)` l'acceptent ;
  `apiAjoutLointain` le transmet.
- **Dédoublonnage des notes corrigé en conséquence** : le doublon se juge désormais sur (texte +
  demi-journée). « Livraison » le matin et « Livraison » l'après-midi sont deux notes distinctes, pas une
  répétition à écarter — sans ça, la seconde aurait été silencieusement ignorée.

### 23.2. Portée assumée

Les **notes** acceptent déjà plusieurs entrées par jour : matin ET après-midi le même jour fonctionnent
donc pleinement. Un **jalon** reste une valeur unique par jour (modèle inchangé) : il peut être marqué
matin ou après-midi, mais on ne peut pas en avoir deux différents le même jour. C'est ce que demandait
Lionel ; en faire une liste changerait le modèle du jalon côté serveur ET client, sans besoin exprimé.

### 23.3. Vérifications

- **`node test_backend_pures.js` : 94/94** (79 + 15 nouvelles, §12) — étiquette absente = journée entière
  (le point le plus important : la rétrocompatibilité), `[M]`/`[A]` reconnues, cohabitation avec
  `[Important]` et `[Série:…]` dans n'importe quel ordre, étiquette retirée du texte affiché, aller-retour
  complet écriture → relecture, et **deux notes le même jour (une le matin, une l'après-midi) qui gardent
  chacune sa demi-journée**.
- 9 assertions existantes ont dû être mises à jour : elles comparaient l'objet décodé en entier, qui a
  légitimement gagné un champ `demi`. Valeurs inchangées par ailleurs.
- `node --check` : OK · `acorn-globals` : rien d'inattendu.

## 24. Round du 02.09.2026 (suite) — la demi-journée est réservée aux NOTES

Précision de Lionel juste après la livraison du §23 : *« pour les jalons pas de demi-journée, pour les
notes par contre j'aimerais pouvoir le mettre en demi-journée. »* Le §23 avait ouvert la demi-journée aux
deux ; ce round la **retire des jalons** et la laisse aux notes.

### 24.1. Ce qui change

Quatre points, tous côté écriture ou relecture d'un jalon :

- `chargerSemaine_` ne renvoie plus de champ `demi` sur un jalon (`{ texte, serieId }` comme avant le §23).
- `apiEnregistrerPlage` : `demiPropre` est désormais conditionné à `estNote`. Pour `kind === "jalon"` la
  valeur reçue est **ignorée en silence** — pas d'erreur levée, rien d'écrit.
- La branche jalon de l'encodage n'envoie plus `demi` à `encoderLigneTache_`.
- `apiEnregistrerJalonNote` (la frappe directe dans la case) ignore de même son paramètre `demi`.

Le décodeur, lui, **sait toujours reconnaître `[M]`/`[A]`**, et c'est volontaire : c'est ce qui garantit
qu'un jalon qui porterait déjà une étiquette (posé pendant la courte fenêtre du §23) soit relu avec un
texte **propre**, plutôt qu'avec un « [M] » affiché en clair. C'est le seul effet visible sur l'existant.

Le serveur est la vraie barrière, pas seulement l'écran : un client resté sur une ancienne version
d'`Index.html` ne peut pas contourner la règle.

### 24.2. Ce qui ne change pas

Les notes gardent tout le §23 : étiquettes `[M]`/`[A]`, champ `demi` remonté au client, dédoublonnage sur
(texte + demi-journée), matin ET après-midi le même jour.

### 24.3. Vérifications

- **`node test_semaines.js` : TOUT PASSE**, avec un bloc neuf de 12 assertions contre les *vrais*
  `apiEnregistrerPlage` / `apiEnregistrerJalonNote` / `apiChargerSemaine` : une note du matin écrit bien
  `[M]` et le relit ; un jalon envoyé avec `demi: "matin"` s'écrit **texte nu, sans étiquette** (par les
  deux chemins d'écriture) ; un jalon relu n'a **aucun** champ `demi` ; et un vieux jalon étiqueté `[M]`
  est relu nettoyé.
- Deux assertions de ce fichier étaient rouges *avant* ce round (elles comparaient l'objet note entier,
  qui avait gagné `serieId`/`jour` puis `demi` au fil des rounds précédents) : corrigées, valeurs
  inchangées.
- Reste vert : `test_backend_pures.js` 94/94 · `test_grille_compacte.js` 23/23 ·
  `test_formulaires_assignation.js` 13/13 · `test_ajout_lointain.js` 15/15 · `test_fusion_feries.js` 10/10
  · `test_fuseau_feries.js` 13/13.
- `node --check` : OK. `VERSION_WEBAPP` = `2026-09-02-r24-demi-notes-seulement`.

## 25. Round du 03.09.2026 (suite) — un bord de demi-journée par extrémité (« 1 jour et demi »)

Lionel, après avoir vérifié le §23/24 (extension/déplacement en demi-journée) : *« je peux reduire de 1
jour à 1 demi jour, mais je ne peux pas augmenter à 1 jour et demi. »* Diagnostic : le modèle d'une note
portait **une seule** valeur `demi`, appliquée **uniformément à tous les jours de sa plage**. Réduire à 1
jour puis choisir « matin » fonctionnait très bien (plage d'un seul jour). Mais étendre ensuite cette note
sur un 2e jour n'avait qu'une seule case à cocher pour toute la plage : impossible de représenter « lundi
entier + mardi matin seulement » — le client ne pouvait qu'appliquer « matin » aux deux jours ou revenir à
« journée entière » pour les deux. Lionel a choisi de le faire correctement plutôt qu'un contournement (2
notes adjacentes) : chaque **bord** de la plage porte désormais SA PROPRE demi-journée.

### 25.1. `apiEnregistrerPlage` : `demiDebut`/`demiFin` au lieu d'un `demi` unique

Signature étendue en fin de liste (compatible avec tout appelant existant) :

```
apiEnregistrerPlage(kind, isoDebut, isoFin, texte, labGCourant, origine, mode, important, demiDebut, demiFin)
```

`demiFin` est optionnel : `if (demiFin === undefined) demiFin = demiDebut;` — un appelant qui n'envoie
qu'UN seul paramètre de demi-journée (l'ajout à distance, `apiAjoutLointain`, n'a jamais eu besoin de plus
et n'a pas été touché) continue de fonctionner à l'identique, la valeur unique s'appliquant alors aux DEUX
bords (ce qui, combiné à la règle ci-dessous, donne : 1er et dernier jour marqués, jours du milieu en
journée entière — cohérent avec le reste du système, cf. §25.4).

Nouvelle fonction pure, top-level (donc testable seule, indépendamment de toute feuille) :

```js
function demiPourJourDePlage_(iso, b1, b2, demiB1, demiB2) {
  if (!b1) return null;
  if (iso === b1) return demiB1;
  if (iso === b2) return demiB2;
  return null;
}
```

Appelée **une fois par colonne** dans la boucle d'écriture existante (celle qui parcourait déjà chaque jour
de la feuille) — le jour en cours (`iso`) reçoit `demiPropreDebut` s'il est le 1er jour de la nouvelle
plage, `demiPropreFin` s'il en est le dernier, `null` (journée entière) sinon. **Aucun autre changement
n'a été nécessaire côté stockage** : `decoderLigneTache_`/`encoderLigneTache_`/`decoderNotesJour_`/
`encoderNotesJour_`/`chargerSemaine_` géraient déjà, sans le savoir, une demi-journée arbitraire PAR JOUR —
c'est uniquement le calcul en amont (« quelle demi-journée écrire sur CE jour ») qui appliquait
uniformément une seule valeur à toute la plage. Portée du changement bien plus réduite que redouté au
départ.

### 25.2. Retrait de l'origine : `oDemiDebut`/`oDemiFin`

Le retrait de l'entrée d'origine (`dansOrigine`, quand une note est modifiée ou déplacée) comparait déjà
texte + important pour décider quelle entrée effacer d'un jour donné. Avec plusieurs demi-journées
possibles par plage, un jour pourrait en théorie porter 2 notes au texte et à l'importance identiques mais
des demi-journées différentes (« Livraison » le matin ET « Livraison » l'après-midi, cf. §23.2) — retirer
sans comparer la demi-journée risquerait alors de supprimer la mauvaise entrée (ou les deux, ou aucune par
malchance de filtre). Le filtre de retrait compare donc maintenant aussi `(e.demi || null)` à la
demi-journée que CE jour portait dans la plage d'ORIGINE (`demiPourJourDePlage_(iso, o1, o2, oDemiDebut,
oDemiFin)`).

`oDemiDebut`/`oDemiFin` sont lus depuis `origine.demiDebut`/`origine.demiFin` avec repli sur
`origine.demi` (ancienne forme, un seul champ, round du 02.09.2026) puis sur `null` — un client resté sur
une version antérieure d'`Index.html` continue donc de fonctionner, avec l'ancien comportement uniforme.

### 25.3. Ce qui n'a PAS changé

`apiEnregistrerJalonNote` (frappe directe dans une case) : une case = un seul jour, donc rien à scinder en
bords — inchangé. Un jalon : la demi-journée reste ignorée pour lui, quel que soit le bord (`demiPropreDebut`/
`demiPropreFin` valent toujours `null` pour `kind === "jalon"`, cf. §24). `apiAjoutLointain` : toujours un
seul paramètre `demi`, cf. §25.1.

### 25.4. Limite assumée : pas de demi-journée sur un jour du milieu

Le modèle ne permet toujours pas à un jour STRICTEMENT ENTRE les deux bords d'une plage d'être autre chose
qu'une journée entière (ex. « lundi matin, mardi ENTIER, mercredi après-midi » sur une seule note reste
impossible). C'est une simplification délibérée, alignée sur le geste réel qui produit ces états (glisser
une poignée depuis un bord) : rien, ni côté serveur ni côté client, ne peut de toute façon produire un tel
état en usage normal. Si le besoin apparaît un jour, il faudrait un vrai tableau de demi-journées par jour
plutôt que 2 bords — pas fait ici, aucun usage réel ne le demande.

### 25.5. Vérifications

- **`node test_backend_pures.js` : 102/102** (94 + 8 nouvelles) — `demiPourJourDePlage_` testée seule :
  plage absente, plage d'un seul jour (repli sur `demiB1`), 1er jour, dernier jour, jour du milieu (toujours
  `null` même si les 2 bords sont en demi-journée), jour hors plage.
- **`node test_semaines.js` : TOUT PASSE**, avec un bloc neuf contre le VRAI `apiEnregistrerPlage` /
  `apiChargerSemaine` (feuille réelle) : « lundi entier + mardi matin » écrit exactement `[M]` sur mardi et
  rien sur lundi ; extension à 3 jours (toujours `matin` en dernier jour) fait retomber le jour du milieu
  (mardi) à journée entière SANS étiquette résiduelle, en une seule opération de remplacement qui retire
  proprement l'ancienne entrée à 2 jours ; cas symétrique (« lundi après-midi + mardi entier ») vérifié
  aussi.
- Reste vert : `test_grille_compacte.js` 51/51 (voir FRONTEND-CHANGELOG.md §25 pour le détail des
  fonctions client mises à jour) · `test_ajout_lointain.js` 15/15 · `test_chantier_defaut.js` 7/7 ·
  `test_formulaires_assignation.js` 13/13 · `test_fuseau_feries.js` 13/13 · `test_fusion_feries.js` 10/10 ·
  `test_markers.js`.
- `node --check` : OK. `VERSION_WEBAPP` = `2026-09-03-r25-demi-debut-fin`.


## 26. Round du 12.09.2026 — jalons : chantier (couleur) + drapeau « important » enfin fonctionnel

Cf. FRONTEND-CHANGELOG.md §54 pour la demande complète (nouvelle page « Jalons », maquette validée). Cette
section couvre uniquement le volet base de données / `enregistrer-plage` nécessaire pour que cette page
puisse réellement enregistrer un chantier et un statut « important » sur un jalon.

### 26.1. Migration 0007 — `jalons.chantier_id`

`sql/0007_jalons_chantier.sql` :

```sql
alter table jalons add column if not exists chantier_id bigint references chantiers(id);
```

Appliquée directement sur le projet Supabase (`mvqvznohgtpulpgalvxl`) via le connecteur MCP — même méthode
que 0003/0005/0006. Table `jalons` vide au moment de la migration (confirmé par une requête `list_tables`
avant d'appliquer) : aucune donnée existante à migrer, colonne nullable pour que tout jalon posé depuis la
grille (qui ne connaît pas ce champ) ou déjà existant continue de fonctionner sans y toucher. Aucun `GRANT`
supplémentaire nécessaire — `jalons` a déjà ses droits `authenticated` + sa policy RLS `connecte_tout`
depuis `0002_rls.sql`, un nouveau champ sur une table déjà autorisée n'en a pas besoin. Vérifié après coup
par une requête sur `information_schema.columns` : `chantier_id bigint`, nullable, bien présente.

### 26.2. `enregistrer-plage`/`planPlage` : `chantier_id` et `important` réellement écrits pour un jalon

Avant ce round, la branche jalon de `planPlage` (`functions/enregistrer-plage/logic.js`) n'écrivait ni
`important` ni `chantier_id` sur aucune opération d'insertion/mise à jour — le bouton « Important » du
formulaire de jalon (déjà présent dans le bandeau réutilisé d'autres formulaires) était donc purement
décoratif pour un jalon, et il n'existait de toute façon aucun champ chantier avant la migration 0007.

**Le piège à éviter** : la grille elle-même resynchronise le TEXTE d'un jalon à chaque frappe
(`synchroniser()`, côté client) sans jamais connaître son chantier ni son statut important — avant ce
round, elle envoyait même `important: false` codé en dur sur chaque appel. Si `planPlage` s'était mis à
toujours écrire `chantier_id`/`important` sur CHAQUE opération jalon (comme le fait déjà `important` pour
une note, cf. round du 02.09.2026), une simple correction de texte faite depuis la grille aurait
silencieusement EFFACÉ un chantier ou un « important » posé depuis la nouvelle page Jalons — une
régression aussi discrète que gênante, découverte en amont plutôt qu'en la testant après coup.

**Le principe retenu** : « champ absent du payload = préserver la valeur déjà en base ; champ présent
(y compris explicitement `null`) = l'appliquer. » Distinction faite via `Object.prototype.hasOwnProperty`,
pas via une simple vérité JS (`params.important === undefined` aurait mal distingué un `false` explicite
d'une absence) :

```js
var jalonImportantFourni = !estNote && Object.prototype.hasOwnProperty.call(params, "important");
var jalonChantierIdFourni = !estNote && Object.prototype.hasOwnProperty.call(params, "chantierId");
var jalonChantierIdVoulu = jalonChantierIdFourni ? (params.chantierId || null) : null;
```

Dans la boucle par jour, pour un jalon : `importantIci`/`chantierIdIci` valent la valeur fournie si le
payload la porte, sinon la valeur déjà existante sur ce jour (`ancienImportant`/`ancienChantierId`) — un
appel de la grille (qui n'envoie ni l'une ni l'autre clé) reconduit donc tel quel ce qu'une fiche Jalons a
pu poser auparavant. Les opérations d'insertion/mise à jour incluent désormais ces 2 champs dans tous les
cas (mode `ajout` et `remplacement`) ; les vérifications de no-op (« rien à faire, la ligne est déjà
identique ») et le garde-fou de nettoyage en sortie de plage (« un jour sorti de la plage n'est supprimé
QUE s'il n'a pas changé depuis ») ont été étendus pour comparer aussi ces 2 champs, en plus du texte —
sinon, réduire une plage de jalon aurait pu supprimer un jour dont le chantier avait entre-temps été changé
ailleurs, ou au contraire échouer à nettoyer un jour réellement inchangé.

`functions/enregistrer-plage/index.ts` : la sélection des lignes `jalons` existantes inclut désormais
`important, chantier_id` (déjà le cas pour les notes) — sans quoi la fonction n'aurait jamais pu comparer
« ancien » et « voulu » sur ces 2 champs.

Côté client, `synchroniser()` n'envoie plus `important: false` codé en dur pour un jalon — la clé est
simplement omise, ce qui déclenche la préservation ci-dessus plutôt qu'un écrasement.

### 26.3. Vérifications

`node test_enregistrer_plage.js` : 41/41 assertions — 7 assertions existantes mises à jour pour inclure
`important: false, chantier_id: null` sur chaque opération jalon (comparaison stricte par
`JSON.stringify`), et 6 nouveaux cas dédiés au principe de préservation : insertion avec chantier +
important fournis (écrits tels quels) ; appel « façon grille » sans ces 2 clés sur une ligne qui en portait
déjà — reconduits tels quels, jamais écrasés à `false`/`null` ; `chantierId: null` fourni EXPLICITEMENT
(retrait volontaire) — bien appliqué, pas traité comme une absence ; changement de chantier seul (texte et
demi identiques) — détecté comme une vraie mise à jour, pas un no-op ; jalon reposé strictement à
l'identique (texte + important + chantier) — bien un no-op ; et le garde-fou de nettoyage en sortie de
plage, dans ses 2 variantes (chantier inchangé depuis → le jour sorti de la plage est libéré ; chantier
changé depuis, ailleurs → jamais touché).

Testé de bout en bout via Playwright + un mock Supabase exécutant une réimplémentation fidèle de
`planPlage` (cf. FRONTEND-CHANGELOG.md §54.6 pour le détail du scénario E2E) — ajout d'un jalon de
plusieurs mois avec chantier + important, modification (changement de chantier + réduction de plage, avec
vérification que les jours sortis sont bien nettoyés), suppression. Pas de vérification contre le vrai
projet Supabase au-delà de l'application de la migration elle-même (limite réseau de cet environnement,
déjà notée pour tout le reste de la migration Supabase) — à confirmer par Lionel en conditions réelles.
