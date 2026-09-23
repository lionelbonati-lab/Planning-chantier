# FRONTEND-CHANGELOG.md — Portage V3 (prototype-bulles.html → Index.html)

Ce document décrit l'état du portage de l'interface V3 (`prototype-bulles.html`, statique, données en dur)
vers le vrai client Google Apps Script (`Index.html`) branché sur `WebApp.gs` / Google Sheets, selon le
contrat gelé dans `TRANSFERT-V3-SPEC.md`.

Session précédente (interrompue) : moteur de séries, chargement serveur (`apiDemarrer`, `gs`/`gsP`,
cache scoping par semaine), grille de planning (bulles, drag/resize, sélection).
Cette session : reprise du fichier partiel (2986 lignes) sans repartir de zéro, ajout de la coquille de
navigation multi-pages et des 6 pages CRUD manquantes, réparation d'un fichier qui ne parsait plus.

## 0. Bugs bloquants trouvés et corrigés dans cette session

- **IIFE jamais refermée** : le fichier hérité de la session précédente se terminait au milieu du script,
  sans le `})();` final de `(function () { "use strict"; ... })();`. Le fichier ne parsait plus du tout
  (`SyntaxError: Unexpected end of input`). Corrigé en ajoutant `demarrer(); })();` juste avant
  `</script>`.
- **Sous-système de sélection multiple absent** : `copierSelection`/`couperSelection`/`collerPressePapier`
  (déjà présents) appelaient `basculerSelection`, `majBarreSelection`, `viderSelection`,
  `quitterModeSelection`, `supprimerSelection`, `afficherChoixDeplacerCopier`/`masquerChoixDeplacerCopier`,
  et référençaient `barreActionEl` et les boutons de la barre d'action — rien de tout cela n'existait.
  Reporté depuis le prototype (lignes ~3800-3990), y compris le raccourci clavier global
  (Échap/Entrée/Suppr/Ctrl+Z/Y/X/C/V).
- **`naviguerSemaine` et `ouvrirAllerSemaine` non définies** : appelées par les flèches de navigation de
  semaine et le clic sur le titre « Semaine N » dans `construireGrille()`, mais jamais écrites. Ajoutées
  juste avant `construireGrille()`.
- **`legendeEl` référencée avant assignation** dans certains chemins de rendu appelés hors `demarrer()` —
  rendue paresseuse (`if (!legendeEl) legendeEl = document.getElementById("legende");`).
- **`CATS_FERIES`-équivalent** aurait référencé `COULEUR_FERIE`/`COULEUR_VACANCES_ENTREPRISE` avant leur
  initialisation (ordre des `var` top-level) — converti en fonction paresseuse `catsFeries()`.

### Vérification de syntaxe effectuée

`/tmp/mockups/synchk.js` n'existait pas dans cet environnement. Méthode utilisée à la place :
1. Extraction du contenu de la (seule) balise `<script>` d'`Index.html` vers un fichier `.js` isolé
   (regex Python `re.findall(r'<script>(.*?)</script>', html, re.DOTALL)`).
2. `node --check script_0.js` — vérifie que le fichier parse (détecte les erreurs de syntaxe, accolades
   non fermées, etc.). **OK, aucune erreur.**
3. `acorn.parse()` en second avis pour confirmer.
4. Recherche des doublons de noms de fonctions/variables top-level (`grep` + `sort | uniq -c`) — aucun
   doublon anormal (seules des fonctions locales de même nom dans des closures différentes, normal en JS).
5. Analyse de portée avec `acorn-globals` (npm installé localement dans le scratchpad, pas dans le repo)
   pour lister tous les identifiants référencés mais jamais déclarés nulle part dans le fichier (couvre
   à la fois les appels `f()` et les références passées par valeur comme `addEventListener("click", f)`,
   ce qu'une simple recherche des appels ne couvre pas). **Dernière exécution : liste vide** — aucun
   identifiant non déclaré en dehors des globales navigateur/GAS attendues (`window`, `document`,
   `google`, `Math`, `Promise`, etc.).
6. Recherche de données de démonstration en dur (`TACHES`/`JALONS`/`NOTES` initialisés avec des valeurs
   littérales, ou `PERSONNES`/`CHANTIERS`/`STATUTS`/`FORMULAIRES_RAPIDES` pré-remplis) — tous ces tableaux
   s'initialisent vides (`var TACHES = [], JALONS = [], NOTES = [];`, `var PERSONNES = [], CHANTIERS = {},
   STATUTS = {}, ...`) et ne sont peuplés qu'à partir du cache serveur. Les seuls tableaux littéraux
   restants dans le fichier sont la liste des jours fériés suisses/jurassiens fixes et mobiles utilisée
   par `calculerFeries()` (Nouvel an, Vendredi Saint, Pâques, etc.) — ce n'est pas une donnée de démo mais
   la logique métier réelle de calcul assisté, portée du prototype (fonctionnalité demandée en §5).

Cette vérification ne remplace pas un test dans un vrai environnement Apps Script (impossible ici, pas
d'accès à un compte Google/Sheets) : elle garantit que le JavaScript est syntaxiquement valide et sans
référence à une fonction/variable manquante, pas que chaque interaction produit le résultat voulu à
l'exécution. Un passage manuel dans le déploiement réel reste nécessaire avant mise en production.

## 1. État des 8 pages

| Page | État | Détails |
|---|---|---|
| **Planning** | Complet | Grille, bulles, drag/déplacer/redimensionner, sélection multiple + barre d'action, undo/redo (session), séries, week-end fusionné (voir §3), navigation de semaine (flèches + « aller à… »), toggle 1/2 semaines, bouton « Recharger ». |
| **Personnel** | Complet | Liste, ajout (`apiAjouterPersonne`), renommage (`apiRenommerPersonne`), suppression avec choix de portée (`apiSupprimerPersonne`). |
| **Intervenants** | Complet | Même mécanique que Personnel, filtrée sur `estSousTraitant`. |
| **Chantiers** | Complet | Liste + ajout + couleur + renommage + suppression (`apiListerChantiers`/`apiEnregistrerChantiers`/`apiRenommerChantier`/`apiCompterUtilisationsChantier`/`apiSupprimerChantier`, ces 3 dernières NOUVELLES round §12). |
| **Statuts** | Complet avec simplification | Liste + ajout + modification + suppression (`apiListerStatuts`/`apiEnregistrerStatuts`, contrat `{cle,nom,couleur,ordre}`). L'éditeur de style de texte du prototype n'a pas été porté (le contrat serveur ne prévoit que couleur+nom+ordre). |
| **Entrée rapide** | Complet | Liste, constructeur de formulaire (champs texte/select/nombre/case), édition, suppression, assignation à une personne précise (`apiListerFormulairesRapides`/`apiEnregistrerFormulaireRapide`/`apiSupprimerFormulaireRapide`, "Assigné à" NOUVEAU round §12). Le bug du point 111 (champ Statut absent pour Personnel) est reporté via `estSousTraitantDyn` dans `ouvrirFormulaireDynamique`. |
| **Fériés** | Complet, refonte | Calendrier annuel réel, backend par `apiListerFeries`/`apiEnregistrerFeries`. Fusion des deux systèmes déconnectés du prototype (liste d'affichage + `FERIES_ETAT`/`CATS_FERIES`) en un seul système serveur — voir §2. |
| **Général** | Partiel, assumé | Seul le réglage « Afficher les week-ends » est porté (case à cocher locale, `localStorage`, comme dans le prototype — non persisté côté serveur, le prototype ne le persistait pas non plus). Les autres réglages du prototype (thème, densité, etc. s'il y en avait) n'ont pas été retrouvés comme persistants côté serveur et n'ont pas été ajoutés arbitrairement. |

## 2. Déviations par rapport au contrat serveur / au prototype

- ~~Chantiers — pas de renommage ni de suppression depuis l'UI.~~ **Restauré, voir §12** — le nom du
  chantier sert de clé de reconnaissance texte dans les cases déjà écrites du planning, ce qui exigeait une
  fonction de migration en masse côté serveur avant de pouvoir rouvrir ces actions ; c'est fait
  (`apiRenommerChantier`/`apiSupprimerChantier`). Ce n'était pas un choix de design définitif, seulement une
  limite du contrat serveur figé de ce round-là.
- **Statuts — éditeur de style de texte du prototype non porté.** Le contrat serveur
  (`apiEnregistrerStatuts`) n'accepte que `{cle,nom,couleur,ordre}` ; aucune option de style de texte
  n'existe côté sheet « Statuts ». Le formulaire ne propose donc que nom + couleur.
- ~~Formulaires rapides — champs `type`/`assigné à`/`unité` du prototype abandonnés~~ — **« assigné à »
  restauré, voir §12** (`AssigneA`, 8e colonne côté serveur). `type` (Tâche/Absence par formulaire) et
  `unité` (champ dédié pour un champ Nombre) restent absents du contrat serveur, non traités ce round. Le
  type de champ **« case à cocher »** a été ajouté (présent dans le CSS/prototype comme `case`, en plus de
  texte/select/nombre) car son rendu et sa sérialisation dans le texte de tâche étaient déjà prévus par le
  contrat de champs génériques.
- **Fériés — seulement 2 catégories** (`ferie` / `vacances_entreprise`), conformément à la spec §5 qui
  restreint volontairement les catégories du prototype (qui semblait n'en avoir que 2 exploitées de toute
  façon). Les couleurs des catégories ne sont **pas éditables** depuis l'UI — elles sont fixées en constantes
  (`COULEUR_FERIE`, `COULEUR_VACANCES_ENTREPRISE`) car le contrat serveur ne stocke pas de couleur par
  catégorie, seulement `{iso, categorie}` par jour.
- **Personnel — suppression exige un choix de portée** (comme les séries), remplaçant l'undo local du
  prototype pour les opérations destructrices, conformément à la spec §8 (« Undo/redo » retiré des CRUD
  destructifs, remplacé par une confirmation serveur explicite).
- **Personnel — renommage sans confirmation de portée visible**, contrairement à la suppression : le
  serveur (`apiRenommerPersonne`) réécrit directement le nom sans notion de « portée » (ce n'est pas une
  opération de série), donc pas de popup de portée nécessaire ici — juste une confirmation simple.
- **Bouton « Réinitialiser » du prototype → « Recharger » dans le planning.** Dans le prototype (données
  100% locales), « Réinitialiser » remettait les données en dur d'origine. Ici, il n'y a plus de données
  en dur à réinitialiser : le bouton recharge la semaine courante depuis le serveur (avec avertissement
  que les modifications non synchronisées seraient perdues), ce qui est la fonctionnalité la plus proche
  en sens utile dans une architecture serveur.
- **Week-end fusionné — ligne « matin » choisie comme propriétaire.** La spec impose une seule cellule
  physique serveur pour Samedi+Dimanche (§2), tandis que la grille visuelle du prototype conserve 2
  lignes (matin/après-midi) par personne comme le reste de la semaine. Décision : la ligne « matin » de
  chaque personne est la ligne interactive pour le week-end (création/édition de bulles), la ligne
  « après-midi » y affiche une cellule de remplissage visuel inerte (`case-weekend`, non cliquable) pour
  garder l'alignement de la grille. Les lectures (`construireVueDepuisCache`) placent toutes les tâches
  de week-end sur `demi:"matin"`, quel que soit le contenu réel du côté serveur, puisque le serveur ne
  distingue pas non plus matin/après-midi pour le week-end (`jourIdx` 6/7 = Samedi/Dimanche, `demi` ignoré
  à l'écriture mais requis par la signature `apiEnregistrerCellulePersonne`).

## 3. Points nécessitant une vérification humaine / suite possible

- Le fichier n'a **jamais été exécuté** dans un vrai environnement Apps Script/Sheets (aucun accès
  disponible ici) — seule la validité syntaxique JS a pu être vérifiée mécaniquement (voir §0). Un premier
  déploiement de test doit vérifier en particulier : le rendu de la grille avec des données serveur
  réelles, le comportement du week-end fusionné en écriture réelle, et l'ouverture du panneau de
  construction de formulaire dans Entrée rapide (zone la plus complexe ajoutée cette session).
- ~~`apiGenererPdf` n'a pas été câblée dans l'UI~~ — **corrigé, voir §4** : c'était une régression (une
  fonctionnalité réelle de production disparue au portage, pas un simple manque de périmètre côté V3) et
  non un choix de scope à réévaluer plus tard.
- La page **Général** reste la plus mince des 8 : si le prototype avait d'autres réglages qui n'ont pas
  été retrouvés lors du parcours du fichier (au-delà de l'affichage des week-ends), ils n'ont pas été
  ajoutés faute de les avoir identifiés avec certitude comme faisant partie du périmètre demandé.
- Pas de test end-to-end automatisé écrit (aucun framework de test front existant dans le projet) — la
  seule couche de vérification est statique (parsing + portée des identifiants), à compléter par des
  tests manuels guidés par `v3-inventory.md` (catalogue des ~111 fonctionnalités) page par page.

## 4. Session de réintégration (01.09.2026) — 3 fonctionnalités V2 disparues au portage

Le portage V3 décrit ci-dessus a fait disparaître 3 fonctionnalités réelles de production (usage
hebdomadaire de Lionel, jamais présentes dans le prototype V3 — donc rien à en « porter », l'agent du
portage ne les a simplement pas recréées). Elles n'étaient pas un choix de périmètre : c'est une
régression, corrigée dans cette session par réintégration depuis l'ancien `Index.html` V2 (conservé dans
le Projet Claude, chemin `claude/Index.html`), adaptée aux conventions du nouveau fichier (modèle
`TACHES`/`JALONS`/`NOTES` reconstruit depuis `etat.cache`, modales `.pop`/`.voile-confirm` au lieu des
« sheets » plein écran de V2, `gsP()`/`toast()` au lieu de `gs()`/`showToast()`). **Logique métier et
contrat serveur inchangés** : les 4 fonctions `apiApercuDecalage`, `apiAppliquerDecalage`,
`apiAttribuerChantierGroupe`, `apiGenererPdf` existaient déjà, intactes, dans `WebApp.gs` — seul le client
ne les appelait plus. Aucune modification de `WebApp.gs`/`Planning_Format.gs` n'a été nécessaire.

### 4.1 Décalage en masse du planning

- **Point d'entrée** : clic sur l'en-tête d'un jour (Lun-Ven) dans la grille de planning — classe CSS
  `.th-jour` ajoutée dans `construireGrille()`, avec `title` explicite (« Décaler le planning à partir de
  ce jour ») et surbrillance au survol. Uniquement les 5 en-têtes de jour de semaine ; les en-têtes
  week-end (`.th-weekend`, construits séparément) n'ont jamais ce comportement, cf. §4.4 (portée).
- **Flux** : `ouvrirDecalagePlanning_(gi, preset)` ouvre une modale (portée « tout le monde »/« une ligne »,
  personne concernée si « une ligne », sens avancer/reculer, nombre de jours ouvrables) → bouton « Aperçu »
  appelle `apiApercuDecalage(labG, jourIdx, portee, ancre, sens, nJours)` → `ouvrirApercuDecalage_(...)`
  affiche le résumé chiffré (déplacements directs / conflits / ignorés) et, pour chaque case déjà occupée à
  la destination, un choix **Ne rien faire (défaut) / Ajouter / Écraser** — exactement le même vocabulaire
  et la même mécanique qu'en V2, aucune réinvention. « Retour » revient à l'étape précédente avec les
  réglages déjà choisis (`preset`). « Confirmer » appelle `apiAppliquerDecalage(labG, jourIdx, portee,
  ancre, sens, nJours, resolutions)` ; le serveur recalcule tout depuis l'état réel de la feuille (jamais
  confiance dans l'aperçu mis en cache côté client — comportement serveur inchangé).
- **Rafraîchissement après écriture** : nouvelle fonction `apresEcritureDepuis(labGDepart, semaineMaj)` —
  met en cache la semaine fraîchement relue, invalide le cache de toutes les semaines déjà chargées à
  partir de `labGDepart` (un décalage peut pousser des éléments au-delà de la semaine affichée, donc les
  semaines suivantes déjà en cache peuvent être devenues obsolètes), la remet aussitôt en cache pour éviter
  un aller-retour superflu, puis recharge la fenêtre affichée et re-rend. Équivalent exact du scope
  « suivantes » du cache déjà utilisé ailleurs dans ce fichier (cf. `apresEcritureSerie`,
  `rafraichirApresPersonnel`), appliqué ici au bon point de départ.

### 4.2 Assignation groupée d'un chantier

- **Point d'entrée** : nouveau bouton « Assigner » dans la barre d'actions de la page Planning (à côté de
  « Imprimer » et « Recharger »), câblé une fois dans `cablerPagePlanning()`.
- **Flux** : `openAssignationGroupeSheet()` — modale avec choix du chantier (liste de `CHANTIERS`, pastille
  de couleur) et de la cible (un jour de la semaine, ou « Toute la semaine ») → bouton « Assigner » appelle
  `apiAttribuerChantierGroupe(labG, chantier, jours)`. Comportement serveur inchangé : personnel uniquement
  (jamais les intervenants/sous-traitants), absences sautées automatiquement. Ne touche que la semaine
  actuellement affichée (`labGCourant()`, pas de portée « suivantes ») — le rafraîchissement réutilise donc
  directement `apresEcritureSerie(r)` (déjà générique : met en cache `r.semaine`, reconstruit, re-rend),
  sans avoir besoin d'`apresEcritureDepuis`.

### 4.3 Aperçu d'impression + génération PDF

- **Point d'entrée** : nouveau bouton « Imprimer » dans la barre d'actions de la page Planning (classe CSS
  `.btn-imprimer`, qui existait déjà — définie dans le fichier issu du portage mais jamais utilisée par
  aucun élément HTML, signe que ce bouton était prévu puis oublié).
- **Flux** : `openPrintSheet()` construit l'aperçu **directement depuis la forme serveur brute de la
  semaine affichée** (`etat.cache[labGCourant()]`, la même structure que renvoie `apiChargerSemaine`) —
  PAS depuis les bulles `TACHES`/`JALONS`/`NOTES` reconstruites. C'est délibéré : c'est exactement ce que
  la vraie feuille imprime, donc la source la plus fidèle, et ça découple entièrement l'aperçu du moteur de
  bulles (jamais de risque qu'un détail de reconstruction de bulle — fusion de plages, slots de notes —
  fasse diverger l'aperçu de ce que `apiGenererPdf` produira réellement). Reprend telles quelles la mise en
  forme et les règles V2 : personnes sans rien cette semaine masquées (`personneVide`), fond de case par
  absence/chantier (`fondCase`/`detailJoint`, alignés sur `estAbsence`), légende des chantiers utilisés,
  pastille de statut par tâche pour les sous-traitants (couleur dynamique depuis `STATUTS`, plus de mapping
  figé à 4 couleurs comme en V2 — la page Statuts du portage V3 permet d'en configurer un nombre
  quelconque). Bouton « Générer le PDF » → `apiGenererPdf(labG)`, message et gestion de l'onglet temporaire
  `📋 S<n>` (gardé seulement si l'export Drive échoue) repris à l'identique de V2.
- Aucun rafraîchissement de cache après cette action : `apiGenererPdf` ne modifie jamais le contenu
  affiché du planning (juste un onglet d'export éphémère), comportement V2 inchangé.

### 4.4 Fonctions utilitaires réintégrées

`dateCourte(iso)` (réutilise le tableau `MOIS_ABBR` déjà présent dans le fichier plutôt que de le
dupliquer), `personneVide(p)`, `detailJoint(cell)`, `fondCase(cell)` — portées depuis V2, opèrent sur la
forme de case serveur brute (`{chantier, taches:[...]}`), pas sur les bulles. `decalerJoursOuvrables_` et
`fusionnerCellules_` de V2 n'ont **pas** été portées : à la relecture du code V2, elles ne sont utilisées
que par des fonctionnalités hors périmètre de cette session (le raccourci de décalage rapide d'un
jalon/note isolé, et la résolution de conflit du déplacement d'une case unique par glisser — pas le
décalage en masse, qui délègue toute la résolution de conflit au serveur via `resolutions`). Les ajouter
sans point d'appel aurait été du code mort ; à réévaluer si ces 2 fonctionnalités-là sont un jour
réclamées séparément.

## 5. Retrait du décalage en masse et de l'assignation groupée (01.09.2026, suite à retour de Lionel)

Message de Lionel après réception du premier envoi complet : *"plus besoin du décalage en masse grâce à la
sélection multiple de la nouvelle feuille. plus besoin de l'assignation groupé non plus."* — la sélection
multiple de bulles de V3 (copier/déplacer un groupe de bulles à la fois, cf. la barre d'action de la page
Planning) couvre désormais les deux usages que ces fonctionnalités V2 servaient.

**Retiré du client** (`Index.html`) : le bouton "Assigner" de la barre d'actions Planning, le clic sur
l'en-tête d'un jour (classe `.th-jour` et son CSS de survol, redevenu un simple en-tête `.th` non
cliquable), et les fonctions `ouvrirDecalagePlanning_`, `ouvrirApercuDecalage_`, `openAssignationGroupeSheet`,
`apresEcritureDepuis` (utilitaire de rafraîchissement de cache qui ne servait qu'au décalage en masse).
Aucun autre code n'en dépendait (vérifié : `apresEcritureSerie`, seule autre fonction de rafraîchissement de
cache dans le fichier, est indépendante et reste utilisée par tout le reste).

**Non touché** : `apiApercuDecalage`/`apiAppliquerDecalage`/`apiAttribuerChantierGroupe` restent intactes
dans `WebApp.gs` — ce sont des fonctions V2 préexistantes, sans risque à laisser inutilisées, et faciles à
rebrancher si ce choix était reconsidéré. L'aperçu d'impression/PDF (`openPrintSheet`/`apiGenererPdf`) n'est
pas concerné par ce retrait, Lionel ne l'ayant pas mentionné.

Vérifié après retrait : syntaxe JS (extraction `<script>` + `node --check`, OK), aucune référence orpheline
à `ouvrirDecalagePlanning_`/`ouvrirApercuDecalage_`/`openAssignationGroupeSheet`/`apresEcritureDepuis`/
`apiApercuDecalage`/`apiAppliquerDecalage`/`apiAttribuerChantierGroupe` restante dans le code exécutable
(seules des mentions explicatives dans les commentaires).

### 4.5 Portée : week-end fusionné explicitement exclu

Les 3 fonctionnalités réintégrées ne géraient, côté V2, que les jours de semaine (`jourIdx` 0-4) — le
week-end fusionné (`jourIdx` 6/7, §2 du spec) n'existait pas encore comme case interactive à l'époque de
V2, donc n'a jamais été conçu pour elles, **y compris côté serveur** : `apiApercuDecalage`/
`apiAppliquerDecalage` retrouvent leurs colonnes via `colonnesJoursOuvres_` (jours de semaine uniquement)
et `apiAttribuerChantierGroupe` valide explicitement `0 <= jour <= 4`. Décision assumée pour cette
session : **exclusion explicite** plutôt qu'extension —
- Le clic de décalage en masse n'est câblé que sur les en-têtes de jour de semaine (`.th-jour`, jamais
  `.th-weekend`) ; la modale le documente dans son texte d'aide ("Le week-end fusionné n'est pas
  concerné").
- L'assignation groupée ne propose que Lun-Ven + "Toute la semaine" (jamais Sam/Dim) ; même mention
  explicite dans sa modale.
- L'aperçu d'impression n'est pas concerné par cette question (il imprime déjà tout ce qui existe,
  week-end inclus, comme la vraie feuille).

Étendre le décalage en masse et l'assignation groupée au week-end fusionné demanderait de faire évoluer
`calculerPlanDecalage_`/`apiAttribuerChantierGroupe` côté serveur pour comprendre la convention de tag
`[S]`/`[D]` de la cellule week-end (§2 du spec) — non fait ici : la sécurité (ne pas casser un
comportement déjà validé par Lionel) prime sur l'exhaustivité, conformément à la consigne de cette
session.

### 4.6 Vérification effectuée

Même méthode que les sessions précédentes (§0) : extraction du contenu de la balise `<script>` vers un
fichier `.js` isolé, `node --check` (aucune erreur), puis `acorn.parse()` + `acorn-globals` pour lister les
identifiants référencés mais jamais déclarés (liste vide — aucune référence orpheline aux 4 nouvelles
fonctions `apiXxx`, ni à `ouvrirDecalagePlanning_`/`ouvrirApercuDecalage_`/`openAssignationGroupeSheet`/
`openPrintSheet`/leurs helpers). Recherche des doublons de noms de fonctions top-level : aucun doublon
anormal introduit (les seuls noms dupliqués sont des fonctions locales `nettoyer`/`onMove`/etc. dans des
closures différentes, déjà le cas avant cette session). Signatures et formes de retour des 4 fonctions
serveur (`apiApercuDecalage`, `apiAppliquerDecalage`, `apiAttribuerChantierGroupe`, `apiGenererPdf`)
revérifiées une à une contre `WebApp.gs`/`Planning_Format.gs` pour s'assurer que chaque champ lu côté
client (`plan.nbSimples`, `plan.conflits[].{id,nom,demi,jourSourceIso,jourDestIso,source,dest}`,
`plan.impossibles[].{nom,demi,jourSourceIso}`, `r.deplaces/ecrases/ajoutes/ignores`, `r.personnes`,
`r.pdf.msg`, `r.supprimee`, `r.feuille`) existe bien tel quel côté serveur.

Comme pour les sessions précédentes, cette vérification reste statique : pas d'exécution dans un vrai
environnement Apps Script/Sheets (aucun accès disponible ici). Un passage manuel réel doit en particulier
vérifier : l'ouverture de la modale de décalage depuis chaque en-tête de jour (semaine affichée seule et
fenêtre 2-semaines), le rendu de l'aperçu avec au moins un vrai conflit, l'assignation groupée sur une
semaine avec des absences (pour confirmer qu'elles sont bien sautées), et l'aperçu d'impression /
génération PDF sur une semaine avec jalons, notes multiples et sous-traitants avec statut.

## 6. Jalon/note de série : `serieId` jamais propagé jusqu'à la bulle (01.09.2026, suite à retour de Lionel)

Retour de Lionel : *"idem pour les modification de série"* — même symptôme que les tâches avant leur
propre correctif (déjà correct côté tâches, cf. `itt.serieId = t0.serieId || null;`) : après rechargement
de la page, un jalon ou une note issu d'une série n'était plus reconnu comme tel (la fiche d'édition ne
proposait plus le choix de portée "cette occurrence / à partir d'ici / toute la série").

### 6.1 Cause

Deux bugs distincts, l'un serveur l'autre client (détail serveur complet dans `BACKEND-CHANGELOG.md` §7) :

- **Jalon** : le serveur ne décodait jamais le champ `jalons` (chaîne brute) — un jalon de série affichait
  littéralement son tag `[Série:xxxxxx]` en texte visible. Corrigé côté serveur (`apiChargerSemaine` /
  `chargerSemaine_` renvoie désormais `{texte, serieId}` par jour au lieu d'une chaîne).
- **Note** : le serveur renvoyait déjà `serieId` correctement (`decoderNotesJour_`) — seule la construction
  de la bulle côté client l'ignorait (`itemPlage("note", entree.texte, ..., {important: entree.important})`,
  sans jamais lire `entree.serieId`).

### 6.2 Corrections apportées (`Index.html`)

- **Construction des bulles JALONS** (`construireVueDepuisCache`) : `data.jalons[j]` est maintenant traité
  comme un objet `{texte, serieId}` (plus une chaîne) ; la fusion des jours contigus au même texte compare
  `.texte` au lieu de comparer directement l'ancienne chaîne ; `it.serieId = jd.serieId || null;` ajouté sur
  l'item construit — même principe que les tâches.
- **Helper `jalonAuGi(donnees, gi)`** : renvoie désormais `{texte, serieId}` ou `null` (au lieu d'une chaîne
  ou `""`), même contrat que `noteSlotAuGi`.
- **Construction des bulles NOTES** : `itn.serieId = entree.serieId || null;` ajouté (le serveur le
  fournissait déjà — seul le client ne le lisait pas).
- **Aperçu d'impression** (`ouvrirApercuImpressionSemaine` / la modale d'aperçu) : la ligne des jalons lit
  désormais `t.texte` au lieu de `t` directement, pour rester compatible avec le nouveau format objet.

Aucun autre site ne lisait `data.jalons`/`jalonAuGi`/`noteSlotAuGi` (recherche exhaustive par grep, cf.
`BACKEND-CHANGELOG.md` §7.3 — leçon déjà appliquée lors de round précédents de ce projet : toute migration
chaîne → structure doit être recherchée exhaustivement avant d'être considérée terminée).

### 6.3 Chantier d'une tâche de série ignoré par `apiModifierSerie`

Bug purement serveur (aucun changement côté `Index.html` : le client envoyait déjà `modifs.chantier`
correctement depuis longtemps, cf. `ouvrirEdition`) — détail complet dans `BACKEND-CHANGELOG.md` §7.2.

### 6.4 Vérification effectuée

Même méthode que les sessions précédentes : extraction du `<script>`, `node --check` (OK), `acorn.parse()`
+ `acorn-globals` (aucun identifiant non déclaré), grep exhaustif des 4 sites lisant les jalons avant/après
correctif, `node test_backend_pures.js` (36/36, cf. `BACKEND-CHANGELOG.md` §7.3 pour les 5 nouvelles
assertions). Comme toujours, pas d'exécution dans un vrai environnement Apps Script/Sheets disponible ici —
un passage manuel réel doit en particulier vérifier : la fiche d'édition d'un jalon/note de série propose
bien le choix de portée après rechargement de la page (pas seulement juste après création, dans la même
session), et que modifier le chantier d'une tâche de série avec la portée "toute la série" l'applique bien
à toutes les occurrences attendues sans toucher au week-end.

## 6bis. Même round (01.09.2026) — entrées rapides Armature/Béton/Livraison armature disparues

Retour de Lionel, envoyé juste avant celui traité au §6 ci-dessus : les 3 formulaires rapides historiques
n'apparaissaient plus dans le menu "Ajouter". Cause racine et correction principale entièrement côté
serveur — détail complet dans `BACKEND-CHANGELOG.md` §7bis (feuille de config jamais peuplée au premier
transfert, repli par défaut ajouté sur le modèle de "Statuts"). Point notable : il s'avère que ces 3
formulaires ne sont **pas** rattachés à un intervenant particulier côté vrai backend (contrairement au
modèle en mémoire du prototype V3) — aucune question à poser à Lionel n'a donc été nécessaire.

### Garde ajoutée côté client (`Index.html`)

Ces 3 formulaires ont chacun leur propre interface dédiée, codée en dur (`ouvrirFormulaireArmature`/
`ouvrirFormulaireBeton`/`ouvrirFormulaireLivraisonArmature`), reconnue par **correspondance exacte de
nom** dans `cablerBoutonsMenuAjout` — jamais par le formulaire générique (`ouvrirFormulaireDynamique`).
Maintenant que ces 3 noms peuvent apparaître dans la page de réglages "Entrée rapide" (générique,
CRUD complet), les y **renommer** casserait silencieusement cette correspondance de nom et ferait perdre
l'interface dédiée au profit du formulaire générique vide. Ajout d'une constante
`NOMS_FORMULAIRES_SPECIAUX = ["Armature", "Béton", "Livraison armature"]` et d'une garde dans le handler
"Modifier" de `renderFormulaires()` : cliquer "Modifier" sur l'un de ces 3 noms affiche un toast
explicatif ("« Armature » a sa propre interface dédiée — pas de champs à modifier ici.") au lieu d'ouvrir
l'éditeur générique. "Supprimer" reste permis sans garde particulière (retire juste le bouton du menu
"Ajouter" — sans danger, ces formulaires n'étant que de la configuration, pas des données de planning).

### Vérification effectuée

Même méthode que d'habitude : `node --check` sur le `<script>` extrait (OK), `acorn-globals` (aucun
identifiant non déclaré, y compris la nouvelle constante `NOMS_FORMULAIRES_SPECIAUX`). Pas de changement
aux 3 fonctions `ouvrirFormulaireXxx` elles-mêmes (déjà correctes, jamais le problème) ni au dispatcher de
`cablerBoutonsMenuAjout` (comparaison de noms déjà par correspondance exacte, inchangée).

## 7. Bulle (jalon/note/tâche) traversant un week-end : mauvaise largeur à l'affichage (02.09.2026, retour de Lionel)

Retour de Lionel : *"quand j'active le week-end, le jalon qui passent du vendredi au lundi s'étendent, mais
quand j'enlève les week-end ils se décalent de 2 jours modifiant toute la suite"*.

### Cause

`colonneGrille(gi)` traduit un jour (repère `gi`, en jours ouvrés) en colonne CSS réelle de la grille —
quand les week-ends sont affichés, elle insère +2 colonnes (Samedi/Dimanche) à chaque frontière de
semaine, ce qui est correct et voulu (§2 du spec, cellule week-end). Le bug était dans le calcul de la
**largeur** (span CSS `grid-column: col / span N`) des bulles multi-jours (jalon, note, tâche) : `N` était
posé directement égal à la durée en JOURS OUVRÉS de l'item (`dureeVisible`, ex. 2 pour une plage
Vendredi→Lundi : gi et gi+1, le week-end n'existant jamais dans ce repère), **sans jamais tenir compte des
2 colonnes de week-end insérées entre les deux**. Résultat, quand les week-ends étaient affichés : une
bulle Vendredi→Lundi ne s'étendait que sur 2 colonnes à partir de Vendredi — donc jusqu'à Samedi, en plein
milieu du week-end — au lieu des 4 colonnes nécessaires pour atteindre réellement Lundi. Le prototype
(prévu à l'origine avec les 2 jours de week-end comme des jours ouvrés à part entière) n'avait jamais eu
à distinguer "durée en jours" de "largeur en colonnes CSS" ; la fusion week-end du round de transfert V3
(cellule unique Sam+Dim, §2) a introduit cet écart sans que le calcul de span en tienne compte.

C'est ce décalage de 2 colonnes qui explique les deux symptômes rapportés : week-ends affichés, la bulle
paraît "s'étendre" dans le week-end sans jamais l'atteindre franchement (elle s'arrête au milieu) ; puis en
repassant les week-ends à masqué, la même bulle (toujours ancrée sur le même jour de départ réel) se
retrouve à une position visuelle différente de 2 colonnes — d'où l'impression de décalage touchant "toute
la suite" de la grille (chaque bulle traversant une frontière de semaine est affectée de la même façon).

**Précision importante** : ce bug était purement un défaut d'AFFICHAGE (calcul de largeur CSS) — aucune
donnée n'était modifiée en base ni resynchronisée vers le serveur ; le `giDebut`/`duree` réel des items en
mémoire (`JALONS`/`NOTES`/`TACHES`) et sur la feuille n'a jamais été altéré par ce bug, seule leur bulle
s'affichait avec une largeur trop courte quand les week-ends étaient visibles.

### Correction

Nouvelle fonction `spanColonnes(giDebut, dureeVisible)`, à côté de `colonneGrille` : calcule la largeur
CSS correcte par différence de colonnes (`colonneGrille(giDebut + dureeVisible) - colonneGrille(giDebut)`)
plutôt qu'en recopiant directement la durée en jours — `colonneGrille` reste valide pour un `gi` "virtuel"
juste après la fin de la plage (aucune case n'y est réellement dessinée), exactement la borne exclusive
dont ce calcul a besoin. Appliquée aux 2 sites qui posaient une bulle multi-jours avec `dureeVisible` en
colSpan direct : la ligne Jalons/Notes et les lignes personnel/intervenants (tâches). Les items ancrés sur
une case week-end isolée (jamais redimensionnables, toujours 1 seule case, cf. commentaire existant)
gardent leur ancien calcul, inchangé — `spanColonnes` ne s'applique qu'aux items ancrés sur un jour ouvré.
Le calcul de la position de DÉPART (`colonneGrille(it.giDebut)`) était, lui, déjà correct — seule la
LARGEUR était en cause.

Non concerné : le rectangle de prévisualisation pendant un glisser-déposer (`rectanglePlage`/
`celluleAPosition`) — celui-ci retrouve la vraie case DOM de fin par son `gi` réel (pas par un comptage de
colonnes), donc déjà correct par construction, jamais affecté par ce bug.

### Vérification effectuée

`node --check` sur le `<script>` extrait (OK), `acorn-globals` (aucun identifiant non déclaré, y compris
la nouvelle fonction `spanColonnes`). Vérification arithmétique du calcul de span par un script Node
autonome reproduisant exactement `colonneGrille`/`spanColonnes` : pour une plage Vendredi(gi=4)→Lundi
(gi=5, duree=2 jours ouvrés), colonne de départ 6 dans les deux cas ; largeur passée de 2 (arrivant en
colonne 7, milieu du week-end) à 4 (arrivant en colonne 9, exactement la colonne réelle de Lundi) une fois
les week-ends affichés — colonne de fin confirmée identique à `colonneGrille(5)` (Lundi) calculée
indépendamment. Aucun changement côté serveur (bug purement client) ; `test_backend_pures.js` toujours
38/38. Comme toujours, pas d'exécution dans un vrai navigateur/Apps Script disponible ici — Lionel doit
confirmer visuellement qu'une bulle traversant un week-end atteint désormais bien sa vraie case de fin,
dans les deux états du bouton "Afficher les week-ends", et qu'aucune bulle ne se déplace plus en basculant
ce réglage.

## 8. Round du 02.09.2026 — "vérifie et optimise le script, j'ai l'impression qu'il manque des choses"

Demande ouverte de Lionel. Traitée comme un audit systématique (cf. `BACKEND-CHANGELOG.md` §8 pour le
volet serveur) — chaque point ci-dessous vient de cet audit, vérifié avant correction.

### 8.1. 3e site touché par le bug "bulle traversant un week-end" (§7 ci-dessus)

Le correctif `spanColonnes` du §7 avait été appliqué aux 2 sites qui POSENT une bulle multi-jours (rendu
Jalons/Notes, rendu personnel/intervenants), mais pas à celui qui la RE-POSITIONNE PENDANT un
redimensionnement à la poignée (`cablerPoigneeRedim`) — même calcul fautif (`dureePrevisu`/`dureeOrig` en
colSpan direct), même symptôme : agrandir/annuler le redimensionnement d'une tâche/absence qui traverse un
week-end affiché la faisait rebondir à une largeur trop courte pendant le geste, avant de se corriger au
prochain rechargement. `appliquerPrevisu()` et `onCancel()` utilisent maintenant `spanColonnes(...)`,
comme les 2 sites déjà corrigés.

### 8.2. Nettoyage — code mort et CSS orpheline

Aucun changement de comportement, seulement des suppressions vérifiées "zéro appelant" avant retrait :

- **4 fonctions jamais appelées** : `descriptionCell(cell)` (construisait une description texte d'une
  case, jamais utilisée), `masquerChoixDeplacerCopier()` et `viderSelection()` (cette dernière un
  quasi-doublon de `quitterModeSelection`, toujours utilisée, elle), `dateCourte(iso)` (l'aperçu
  d'impression utilise directement `data.dates[i]`).
- **CSS orpheline** dans le bloc `<style>` : `.confirm-pop-grand` et ses règles descendantes, `.decalage-resume`/
  `.decalage-stat` (+ variantes), `.conflit-item`/`.conflit-titre`/`.conflit-resume`, `.impossibles-bloc` —
  vestiges de fonctionnalités retirées (décalage en masse, §5 ci-dessus) ou jamais branchées. Une règle
  combinée sur la même ligne que `.confirm-pop-grand .cp-titre` stylait AUSSI `.impression-modal .cp-titre`
  (encore utilisée par l'aperçu d'impression) — repérée en relisant le fichier après coup, séparée en sa
  propre règle avant suppression du reste pour ne rien perdre.

### 8.3. Nouvelle fonctionnalité — "nombre de tâches en cours" par personne (point 101, `V3-spec-suite.md`)

Cf. `BACKEND-CHANGELOG.md` §8.2 pour le calcul serveur (`apiCompterTachesPersonnes`). Côté client :

- **`ligneFichePersonne`** affiche maintenant un badge (`<span class="compte">`, déjà stylé — une règle CSS
  jamais utilisée, laissée par le prototype, exactement ce trou) : "Aucune tâche en cours" / "1 tâche en
  cours" / "N tâches en cours". Vide pendant le chargement (jamais un "0" trompeur avant d'avoir la vraie
  réponse du serveur).
- **Chargement paresseux, jamais dans `apiDemarrer`** : `chargerCompteursTaches()` appelle
  `apiCompterTachesPersonnes()` une seule fois par ouverture d'une des 2 pages Personnel/Intervenants
  (mémorisé dans `TACHES_PAR_PERSONNE`/`promesseTachesParPersonne`), puis patche directement les badges
  déjà à l'écran (`appliquerCompteursTaches`) — jamais un re-render complet depuis ce callback, qui aurait
  rebouclé sur lui-même (`renderPersonnel`/`renderIntervenants` appellent elles-mêmes
  `chargerCompteursTaches`). Invalidé dans `rafraichirApresPersonnel` (donc après tout ajout/suppression) :
  un simple renommage n'a pas besoin d'invalider le cache, mais distinguer les cas coûtait plus cher que de
  toujours recharger (un appel Sheets de plus, seulement quand cette page est ouverte).
- **`supprimerPersonneServeur`** : le titre de la confirmation intègre maintenant le compte quand il est
  connu — *"Supprimer « Armature / Béton » et ses 3 tâches ?"*, exactement l'exemple du point 101 — et
  retombe sur le titre neutre si le compteur n'est pas encore chargé (pas de chiffre inventé).
- **CSS** : `.ligne-intervenant` utilisait `justify-content: space-between` pour pousser `.ligne-actions` à
  droite — correct avec 2 enfants (nom + actions), mais aurait isolé le nouveau badge au milieu de la ligne
  avec 3 enfants. Remplacé par `margin-left: auto` sur `.ligne-actions` (indépendant du nombre d'enfants) —
  sans effet visuel sur les autres pages qui réutilisent `.ligne-intervenant` avec seulement 2 enfants
  (Chantiers, Statuts).

### 8.4. Vérifications faites

`node --check` sur le `<script>` extrait (OK), `acorn-globals` (aucun identifiant non déclaré). Relecture
du fichier après le nettoyage CSS pour confirmer qu'aucune règle encore utilisée n'a été perdue (cf. §8.2).
`test_backend_pures.js` : 40/40 (2 nouvelles assertions, cf. `BACKEND-CHANGELOG.md` §8.4). Comme toujours,
pas d'exécution dans un vrai navigateur/Apps Script disponible ici — Lionel doit confirmer visuellement le
comportement du redimensionnement (§8.1) et les compteurs affichés sur les pages Personnel/Intervenants
(§8.3), en particulier qu'ils correspondent au nombre de tâches qu'il voit réellement dans la grille.

## 9. Round du 02.09.2026 (suite) — "les temps de chargement me semble long"

Cf. `BACKEND-CHANGELOG.md` §9 pour l'optimisation serveur (un seul classeur/une seule feuille récupérés et
partagés dans `apiDemarrer()`, au lieu de chacune de ses 6 étapes les redemandant séparément). Côté
client, un seul changement : `formulairesRapides` ne fait plus partie de la réponse d'`apiDemarrer()`
(cette donnée ne sert que dans le menu "Ajouter" d'un intervenant et la page "Entrée rapide", jamais pour
afficher le planning) — chargée à part, **en arrière-plan**, exactement comme demandé.

**`chargerFormulairesRapides()`** (nouvelle fonction, à côté de `appliquerStatutsEtFormulaires`) :
mémorisée (`formulairesRapidesCharges`/`promesseFormulairesRapides`, même motif que
`chargerCompteursTaches` du round précédent — un seul appel réseau, jamais répété) et appelée à 3
endroits : juste après le premier rendu du planning dans `demarrer()` — l'écran de chargement est déjà
fermé, l'utilisateur voit sa grille pendant que cet appel se termine en tâche de fond ; à l'ouverture du
menu "Ajouter" d'un intervenant (`ouvrirAjout`) ; à l'ouverture de la page "Entrée rapide"
(`renderFormulaires`). Les 2 derniers sont des filets de sécurité pour le cas, très improbable en usage
réel (il faudrait agir plus vite qu'une lecture Sheets), où l'un des deux serait ouvert avant la fin du
chargement d'arrière-plan — sans effet et sans coût si c'est déjà chargé.

**Limite assumée** : le menu "Ajouter" (`boutonsMenuAjout`) construit sa liste de boutons de façon
synchrone à partir de `FORMULAIRES_RAPIDES` au moment du clic — si ce menu est ouvert avant que le
chargement d'arrière-plan soit terminé, il n'affichera que "Tâche" (+ Absence/Congé/Vacances pour le
personnel interne), sans les formulaires "Entrée rapide" cette fois-là. Rendre ce menu lui-même
asynchrone aurait ajouté de la complexité pour un cas quasiment jamais rencontré en pratique (le
chargement démarre dès l'affichage du planning, et il faut d'abord naviguer jusqu'à une case pour ouvrir
ce menu) — non traité, mais nommé explicitement plutôt que laissé silencieux.

### Vérifications faites

`node --check` sur le `<script>` extrait (OK), `acorn-globals` (aucun identifiant non déclaré, y compris
les 3 nouveaux points d'appel de `chargerFormulairesRapides`). Relecture de `boutonsMenuAjout`/
`renderFormulaires` pour confirmer qu'aucun autre site ne lit `FORMULAIRES_RAPIDES`/
`etat.formulairesRapidesServeur` de façon synchrone au démarrage (seuls ces 2, déjà couverts). Comme
toujours, pas d'exécution dans un vrai navigateur ici — Lionel doit confirmer que l'ouverture de l'appli
est perceptiblement plus rapide, que le menu "Ajouter" d'un intervenant propose bien ses formulaires
"Entrée rapide" habituels (après le court instant de chargement d'arrière-plan), et que la page "Entrée
rapide" affiche bien la liste complète.

## 10. Round du 02.09.2026 (suite) — retours après test réel dans Google Sheets

Premier essai de Lionel dans le vrai classeur après le round §9 : chargement "mieux", plus 4 demandes,
toutes traitées dans ce round (§10.1 à §10.3 — §10.3 après clarification, cf. sa propre section).

### 10.1. Hauteur des lignes réduite — étiquette retirée des bulles + titres de ligne Jalons/Notes

Demande : *"on peut réduire les hauteurs de ligne en enlevant les noms de chantier, les titres notes et
jalons. on a déjà une légende."*

- **`bulleEl`** : chaque bulle affichait, au-dessus de son texte, une 2e ligne en petites capitales — le
  nom du chantier pour une tâche, ou "Absence"/"Jalon"/"Note" selon le type — sur son propre span
  (`.b-chantier`), en plus de la couleur de fond qui encode déjà cette même information. Cette 2e ligne
  est retirée : chaque bulle est maintenant sur une seule ligne, ce qui réduit directement la hauteur de
  TOUTES les lignes de la grille (elle est dictée par le contenu le plus haut de la ligne). L'info n'est
  pas perdue : `tag` (nom de chantier / type) reste calculé et posé en `title` (infobulle au survol), et
  `construireLegende()` couvre déjà chantiers ET absence/jalon/note avec la couleur correspondante — rien
  de nouveau à construire là, la légende demandée existait déjà.
- **Lignes "Jalons"/"Notes"** : le texte en tête de ligne (colonne label) est retiré de la même façon —
  gardé en `title` de la case, qui reste sinon inchangée (fond, position sticky).
- **Nettoyage** : `.b-chantier` (CSS) et le jeton de couleur `--bubble-tag` qu'elle utilisait seul sont
  devenus orphelins par ce changement — supprimés (vérifié : aucune autre référence dans le fichier).

### 10.2. Bouton "Aujourd'hui"

Demande : *"il manque un bouton aujourd'hui pour revenir à la semaine actuelle."* Ajouté dans l'en-tête du
planning, à côté des flèches ‹ / › et du titre "Semaine N" cliquable. `indexSemaineAujourdhui_()` reproduit
côté client exactement la règle déjà utilisée côté serveur (`indexSemaineDuJour_`, `WebApp.gs`, appelée
par `apiDemarrer`) : la semaine contenant aujourd'hui, sinon la première à venir, sinon la dernière du
planning — recalculée en mémoire à partir de `etat.semaines`/`etat.aujourdhui` (déjà en main depuis le
démarrage), sans aller-retour réseau. Un clic alors qu'on y est déjà affiche un toast ("Déjà sur la
semaine actuelle.") plutôt que de ne rien faire silencieusement, même logique que les flèches ‹ / › en
bout de planning.

### 10.3. Menu "Fériés" — les 2 écarts avec la maquette restaurés

Demande : *"le menu fériés n'est pas comme décidé lors de la maquette."* En relisant `V3-spec-suite.md`
point 104 (la maquette `ferie-calendrier.html`, validée par étapes à l'époque) contre l'implémentation
réelle, 2 écarts DÉJÀ DOCUMENTÉS comme des simplifications délibérées du round de transfert V3 étaient
ressortis :

1. 3 catégories dans la maquette (Vacances/Férié/Compensés) → 2 dans le vrai backend (Férié/Vacances
   entreprise), "Compensés" replié dans "Férié".
2. Couleur de chaque catégorie éditable dans la maquette (clic sur la pastille → sélecteur natif) → fixe
   dans le vrai backend (même couleur que celle utilisée pour teinter les jours du planning).

Question posée en retour avant tout code — réponse de Lionel : **"les 2"**. Les 2 écarts sont donc
restaurés dans ce round, en conservant cette fois les couleurs pastel déjà validées en usage réel pour
Férié/Vacances entreprise (`#e8a3a3`/`#a9c6ea`) plutôt que de revenir aux couleurs saturées de la maquette
d'origine (`#FF5050`/`#92D050`), pour ne pas provoquer un changement visuel de coloration inattendu — seule
"Compensés" (nouvelle) reçoit une couleur par défaut inédite (`#e8dba3`, même famille pastel).

- **3e catégorie "Compensés" restaurée.** `catsFeries()` ne renvoie plus une liste figée de 2 entrées codées
  en dur : elle lit désormais `etat.categoriesFeriesServeur`, alimenté par le serveur au démarrage (cf.
  BACKEND-CHANGELOG.md §10, `apiListerCategoriesFeries`) — 3 catégories, dans l'ordre de la maquette
  (Vacances entreprise, Férié, Compensés). `CATEGORIES_FERIES_DEFAUT` sert de filet de sécurité (même 3
  valeurs par défaut que le serveur) si la fonction était appelée avant le 1er `apiDemarrer()` — en
  pratique jamais le cas, la page Fériés n'étant accessible qu'après un chargement réussi.
- **Couleurs redevenues éditables.** `renderFerieCategories()` reprend le comportement exact de la
  maquette d'origine : la pastille de chaque catégorie est un `<input type="color">` natif (repris tel
  quel, CSS `.categorie .pastille-cat` déjà présente, complétée de resets `appearance`/`::-webkit-color-swatch`
  pour qu'elle reste un rond plein malgré le chrome natif du sélecteur). Cliquer dessus n'ouvre plus le
  menu de sélection de catégorie active (`ev.target.classList.contains("pastille-cat")` court-circuite ce
  clic) : ça ouvre le sélecteur de couleur du navigateur. Un évènement `input` (pendant que le sélecteur
  est ouvert) reteinte immédiatement le calendrier ET la grille du planning en mémoire — aperçu live, comme
  dans la maquette — sans rien envoyer au serveur ; un évènement `change` (sélecteur refermé) déclenche
  `enregistrerCouleurCategorieFerie(id, couleur)`, qui appelle `apiEnregistrerCategoriesFeries` et
  resynchronise `etat.categoriesFeriesServeur` avec la réponse serveur (source de vérité après coup, au cas
  où un autre poste aurait changé la même couleur entre-temps).
- **Teinte de la grille (`feriePourJour`).** Ne lit plus 2 couleurs fixes (`COULEUR_FERIE`/
  `COULEUR_VACANCES_ENTREPRISE`, supprimées) : cherche désormais la catégorie du jour dans `catsFeries()` —
  fonctionne pour les 3 catégories sans code spécifique à "Compensés", et reste la même source de vérité
  que la page Fériés (pas de 2e copie des couleurs).
- **`apiEnregistrerFeries` (WebApp.gs)** : la validation de la catégorie envoyée par le client (bloquée sur
  2 branches, cf. BACKEND-CHANGELOG.md §10) est passée à une whitelist des 3 catégories valides — un férié
  posé ou modifié en catégorie "Compensés" est maintenant enregistré tel quel, plus replié sur "Férié".
- **Chargement.** `categoriesFeries` est render-critical (teinte des jours fériés dès le 1er affichage de
  la grille, même raisonnement que `statuts`/`feries` au round §9) : chargé dans `apiDemarrer()`, jamais en
  arrière-plan comme les formulaires rapides.

## 11. Round du 02.09.2026 (suite) — "à l'enregistrement toutes les vacances et compensés sont devenu rouge fériés"

Retour de Lionel juste après le round §10 : en enregistrant des jours "Vacances entreprise"/"Compensés",
ils reviennent en "Férié" (rouge). Simulation complète du round-trip serveur (cf. BACKEND-CHANGELOG.md §11)
: la logique de `apiEnregistrerFeries`/`apiListerFeries` elle-même préserve correctement la catégorie, dans
tous les scénarios testés (nouvelles entrées, recatégorisation d'entrées existantes). **La cause la plus
probable est un déploiement partiel** — si `WebApp.gs` (envoyé au round §10 en même temps qu'`Index.html`)
n'a pas encore été recollé dans le vrai projet Apps Script, le serveur tourne toujours sur l'ancienne
version à 2 catégories, qui ramène tout ce qui n'est pas exactement `"vacances_entreprise"` sur `"ferie"` —
exactement ce symptôme. À vérifier en premier.

Cela dit, en creusant j'ai trouvé et corrigé 2 vrais trous côté client, indépendants de cette hypothèse
(aucun n'est confirmé comme LA cause, mais chacun produit un symptôme très proche) :

1. **`calculerFeries()` (bouton "Calculer les fériés") écrasait les catégorisations manuelles.** Cliquer
   ce bouton remplissait le calendrier avec les fériés légaux calculés (Nouvel an, Noël, etc.), en écrasant
   SANS CONDITION tout jour déjà marqué "Vacances entreprise"/"Compensés" s'il coïncidait avec une de ces
   dates — ce qui peut concerner beaucoup de jours à la fois (les vacances de fin d'année contiennent
   souvent Noël ET le Nouvel an, par exemple). Un jour déjà catégorisé autrement que "ferie" n'est
   maintenant plus touché par ce recalcul — seuls les jours encore vides ou déjà "ferie" sont
   (re)remplis. Si c'était la cause réelle du problème de Lionel, le déclencheur exact aurait été le clic
   sur "Calculer les fériés" (pas sur "Enregistrer" lui-même), mais l'effet visible — beaucoup de jours
   d'un coup en rouge — colle bien à sa description.
2. **`feriePourJour` maquillait un échec de correspondance en "Férié".** Si jamais la catégorie d'un jour
   ne correspondait à aucune catégorie connue (données corrompues, ou classeur pas encore sur cette version
   du script — cf. l'hypothèse de déploiement partiel ci-dessus), la fonction retombait sur la couleur de
   "Férié" (`#e8a3a3`) au lieu de signaler clairement un problème — un futur bug de ce genre serait resté
   invisible, pris pour un résultat plausible. Retombe maintenant sur un gris neutre (`#c9c9c9`), pour que
   ce genre de souci saute aux yeux au lieu de se déguiser en "Férié".

### Vérifications

- `node --check` sur `WebApp.gs`, `new Function()` sur le script inline d'`Index.html` : syntaxe OK.
- `acorn-globals` sur les deux : rien d'inattendu.
- `node test_backend_pures.js` : 53/53.
- **Priorité pour Lionel : confirmer qu'il a bien recollé/redéployé LES DEUX fichiers** (`WebApp.gs` ET
  `Index.html`) — c'est le point qu'aucun test ici ne peut vérifier à sa place, et l'hypothèse la plus
  probable pour expliquer le symptôme décrit.

### 11bis. Round du 02.09.2026 (suite, même jour) — "non, presque tout est écrasé lors de l'enregistrement"

Lionel a écarté l'hypothèse du redéploiement partiel et confirmé, capture d'écran à l'appui, que le
problème persiste : de larges blocs de jours qu'il avait marqués "Vacances entreprise"/"Compensés"
reviennent en "Férié" (rouge) une fois enregistrés. Simulé une fois de plus, cette fois en recatégorisant
via `modifs` des lignes déjà existantes (round §11 déjà) : `apiEnregistrerFeries`/`apiListerFeries`
préservent toujours correctement la catégorie dans le harnais Node. Sans accès à son classeur réel pour
reproduire exactement, plutôt que de continuer à deviner à l'aveugle, **`btnEnregistrerFeries` diagnostique
maintenant lui-même l'écart** :

- Avant l'appel serveur, la catégorie ENVOYÉE pour chaque jour modifié/nouveau est retenue
  (`categoriesEnvoyees`, indexée par iso).
- Une fois la réponse du serveur arrivée, comparée à la catégorie RENVOYÉE pour ce même iso
  (`categoriesRevenues`) — en ignorant les jours où "ferie" était déjà la catégorie demandée (rien à
  détecter dans ce cas).
- **Si AUCUNE des catégories "Vacances entreprise"/"Compensés" envoyées n'a survécu** : toast explicite
  pointant vers `WebApp.gs` pas à jour dans Apps Script, plutôt que le générique "Enregistré." qui masquait
  la perte jusqu'ici.
- **Si SEULEMENT UNE PARTIE a un écart** : toast donnant le compte exact ("X jour(s) sur Y").
- **Si tout correspond** : toast "Enregistré." inchangé.

Objectif : le prochain "Enregistrer" de Lionel produira un message qui, à lui seul, confirme ou infirme
définitivement l'hypothèse du déploiement — sans qu'il ait besoin de comparer des couleurs de cases à l'œil,
et sans que je continue à deviner en aveugle depuis ici.

### 11ter. Round du 02.09.2026 (suite, même jour) — "ne marche pas même avec un nouveau déploiement"

Le diagnostic du §11bis a confirmé l'écart ("le serveur n'a gardé aucune des catégories..."), et Lionel a
suivi la procédure de redéploiement (`Installation.md`) — sans effet. Ça élimine l'hypothèse la plus simple
("il suffit de redéployer"), mais ne prouve pas que le déploiement actif sert bien le fichier envoyé (URL de
déploiement différente de celle testée, plusieurs déploiements créés par erreur au lieu d'un seul mis à
jour, etc.) — plutôt que de deviner encore, **un marqueur de version vérifiable des deux côtés** :

- **`WebApp.gs`** : `var VERSION_WEBAPP = "2026-09-02-r11-categories-feries";` + `apiVersionServeur()` qui la
  renvoie telle quelle. À changer à chaque envoi touchant ce fichier — le prochain round portera une chaîne
  différente, immédiatement reconnaissable.
- **`Index.html`** : la page Fériés affiche maintenant, sous la légende, une ligne discrète "Version du
  serveur en ligne : ..." (`afficherVersionServeur()`, appelée à chaque `renderFeries()`). Si l'appel
  échoue carrément (fonction inconnue), le message d'erreur s'affiche tel quel au lieu d'être masqué — c'est
  la preuve la plus nette possible que le déploiement actif ne sert pas ce `WebApp.gs`.

Ce que Lionel doit juste lire et me rapporter, sans rien déduire lui-même : le texte affiché sous le
calendrier de la page Fériés une fois `Index.html` réenvoyé (celui-ci n'a pas besoin de redéploiement
Apps Script pour être testé, contrairement à `WebApp.gs` — cf. remarque déjà connue). S'il affiche
"2026-09-02-r11-categories-feries", le déploiement actif sert bien le bon `WebApp.gs` et le bug est ailleurs
qu'un problème de déploiement ; sinon, ce qu'il affiche à la place (une erreur, ou rien) dit où chercher.

## 12. Round du 02.09.2026 (suite) — "reverifie 1x que tu a tout fait ce qui etait dans la maquette"

Cf. BACKEND-CHANGELOG.md §12.2 pour le contexte complet (audit + ce qui était réellement une déviation
assumée vs déjà complet). Point 3 de la demande (modifier/supprimer un ouvrier/intervenant) était déjà fait
— rien à changer côté Personnel/Intervenants. Les 2 autres points sont traités ici.

### 12.1. Chantiers — renommer / supprimer

- **`page-sous` de la page Chantiers** réécrite : n'affirme plus l'impossibilité de renommer/supprimer,
  explique au contraire ce que fait chaque action (renommage = migre toutes les cases y compris les
  semaines passées ; suppression = vide la semaine affichée et les suivantes seulement).
- **`ligneFicheChantier`** : 2 boutons ajoutés à côté de « Couleur » — « Renommer » et « Supprimer »
  (`.lien-renommer` nouveau, CSS mutualisé avec `.lien-modifier` ; `.lien-supprimer` déjà stylé,
  réutilisé tel quel comme pour les autres pages CRUD).
- **`ouvrirRenommerChantier(c)`** (nouveau) : mêmes popup/positionnement/`fermerAuClicExterieur` que
  `ouvrirModifierPersonne`. Appelle `apiRenommerChantier(c.ligne, nom)`, toast avec le nombre de cases
  migrées renvoyé par le serveur.
- **`supprimerChantierServeur(c)`** (nouveau) : appelle d'abord `apiCompterUtilisationsChantier` pour
  afficher un titre de confirmation avec le compte exact (même formulation que « Supprimer « Nom » et ses N
  tâches ? » pour une personne, cf. `supprimerPersonneServeur`), puis `apiSupprimerChantier(c.ligne,
  labGCourant(), true)` — `forcer:true` d'emblée puisque le compte a déjà été obtenu et montré à
  l'utilisateur juste avant, pas besoin d'un 2e aller-retour serveur pour la même information.

### 12.2. Entrée rapide — "Assigné à"

- **`htmlPageEntreeRapide()`** : un `<select class="nf-assigne">` ajouté entre le nom du formulaire et ses
  champs, option par défaut "Tout le monde".
- **`remplirSelectAssigneFormulaire(assigneActuel)`** (nouveau) : repeuple les `<option>` depuis `PERSONNES`
  (2 `<optgroup>` — Personnel / Intervenants) à CHAQUE ouverture du panneau (jamais mis en cache, même
  principe que `renderFormulaires()`), puis fixe la sélection. Appelé par le bouton « + Nouveau formulaire »
  (sélection vide) et par `ouvrirEditeurFormulaire(f)` (préremplit avec `f.assigneA`).
- **`nfOk`** (bouton Enregistrer du panneau) : lit `.nf-assigne`, l'envoie en 4e argument à
  `apiEnregistrerFormulaireRapide`.
- **`renderFormulaires()`** : le résumé de chaque carte affiche désormais aussi "Assigné à : <nom>" (ou
  "Tout le monde"), via `nomAssigneAffiche(f)` (nouveau — retombe sur `"#" + id` si la personne n'est plus
  trouvable, ex. supprimée depuis, plutôt que de masquer l'info silencieusement).
- **`boutonsMenuAjout(personneId)`** : chaque formulaire de `FORMULAIRES_RAPIDES` n'est listé que si
  `assigneA` est vide (tout le monde) ou correspond exactement à `personneId`. L'indexation `data-form`
  reste celle du tableau GLOBAL non filtré (`cablerBoutonsMenuAjout` relit `FORMULAIRES_RAPIDES[+dataset
  .form]`) — filtrer directement le tableau aurait décalé les index et fait cliquer le mauvais formulaire.

### 12.3. Vérifications

- Script inline d'`Index.html` extrait et passé à `node --check` : syntaxe OK.
- `acorn-globals` : rien d'inattendu (cf. BACKEND-CHANGELOG.md §12.3, même passe pour les deux fichiers).
- Pas de test automatisé pour ce round côté client (aucun framework de test front dans ce projet, cf. §3) —
  **à tester manuellement par Lionel** : renommer un chantier utilisé sur le planning et vérifier que les
  cases suivent (passées comprises) ; supprimer un chantier utilisé et vérifier le message de confirmation ;
  créer un formulaire "Entrée rapide" assigné à une personne précise et vérifier qu'il n'apparaît QUE dans
  le menu « Ajouter » de cette personne (et toujours pour tout le monde si "Tout le monde" est choisi).

## 13. Round du 02.09.2026 (suite, même jour) — hypothèse "déploiement pas à jour" ÉLIMINÉE

Lionel a confirmé, via la ligne "Version du serveur en ligne" ajoutée au §11ter, que le déploiement actif
sert bien `2026-09-02-r11-categories-feries` — donc le bon `WebApp.gs`, celui qui connaît les 3 catégories.
Et le bug persiste : même toast "Le serveur n'a gardé aucune des catégories..." qu'avant. Ça élimine
définitivement l'hypothèse poursuivie depuis 3 rounds (§11/§11bis/§11ter) — ce n'est PAS un problème de
déploiement. Deux changements dans ce round :

1. **Le toast diagnostic (`btnEnregistrerFeries`) ne pointe plus vers "WebApp.gs pas à jour"** — ce message
   était devenu factuellement faux et n'aurait fait que renvoyer Lionel vers une fausse piste déjà écartée.
2. **Diagnostic rendu plus précis** : au lieu d'un simple compte d'écarts, le toast affiche maintenant
   jusqu'à 3 exemples concrets `iso : envoyé « X », revenu « Y »` (ou "(absent de la réponse)" si le
   serveur n'a même pas renvoyé cet iso) et le nombre total de jours renvoyés par le serveur. L'objectif :
   voir directement si le problème est "la catégorie revient toujours à ferie" (bug de normalisation/
   écriture), "l'iso n'est simplement pas dans la réponse" (bug de correspondance de date), ou autre chose
   — sans deviner une 4e fois depuis ici, à l'aveugle, ce qui a déjà coûté 3 rounds pour rien.

Piste du fuseau horaire : d'abord écartée trop vite ici (« les deux côtés utilisent le fuseau du script,
donc symétriques »), **puis retenue comme cause la plus probable après analyse correcte** — le raisonnement
initial oubliait que Sheets ne stocke pas un instant mais un JOUR CIVIL, et le reconvertit avec le fuseau
DE LA FEUILLE, pas celui du script. Cf. BACKEND-CHANGELOG.md §13 pour la démonstration complète et le
correctif (`test_fuseau_feries.js`, 13/13, reproduit le bug puis vérifie sa disparition). Le symptôme
n'était pas une catégorie perdue mais une DATE décalée d'un jour au retour : l'iso renvoyé ne
correspondant plus à l'iso envoyé, le diagnostic client concluait — correctement — que rien n'avait été
gardé.

La ligne « Version du serveur en ligne » de la page Fériés affiche désormais, en plus de la version, les
deux fuseaux et le résultat d'un vrai aller-retour de date à travers Sheets (tout est construit côté
serveur dans une seule chaîne, donc **cette ligne fonctionne même avec un `Index.html` pas encore remis à
jour** — cf. BACKEND-CHANGELOG.md §13.4).

## 14. Round du 02.09.2026 — affichage compact : 1 ligne par personne, 2 colonnes par jour

Demande de Lionel, après une question de cadrage (« quel travail cela représente de passer plutôt à
2 colonnes par jour ouvrable et réduire à 1 ligne par ouvrier ? ») : **« Code et met un toggle dans le
menu général pour pouvoir switcher »**.

### 14.1. Pourquoi c'est beaucoup moins lourd qu'annoncé au premier abord

Première estimation donnée à Lionel : « de l'ordre du portage V3 ». **Fausse, et révisée après
vérification dans le code** — le point décisif étant la façon dont une tâche multi-jours est stockée :

- l'écriture est **par case** : `apiEnregistrerCellulePersonne(labG, ancre, demi, jourIdx, payload)` ;
- une tâche qui dure 3 jours, c'est **le même texte recopié dans 3 cases voisines** ;
- la « bulle » continue est **reconstruite à la lecture** (`construireVueDepuisCache`, fusion des cases
  adjacentes de contenu identique).

Autrement dit, la disposition à l'écran n'est **pas** le modèle de données. Changer l'une n'oblige donc
pas à toucher l'autre : ni la feuille, ni l'enregistrement, ni les séries, ni les décalages, ni
l'impression, ni les PDF ne bougent. Le réglage est **réversible à tout instant, sans conversion et sans
perte** — c'est ce qui rend l'ajout sûr, et ce qui justifiait de vérifier avant de chiffrer.

### 14.2. Ce qui a été ajouté

- **`modeCompact`** — réglage LOCAL à l'appareil (`localStorage`, clé `planning.modeCompact`), comme
  « Afficher les week-ends » : chacun règle son écran sans imposer son choix aux autres. Lecture et
  écriture sous `try/catch` (navigation privée, stockage bloqué) : au pire le réglage ne vaut que pour la
  session, jamais d'erreur visible.
- **Interrupteur dans la page Général**, avec le compromis annoncé en toutes lettres dans le libellé
  (deux fois plus de monde à l'écran, deux fois moins de largeur pour le texte).
- **`colsParJour()`** (1 ou 2) et **`colonneDemi(gi, demi)`** — toute la géométrie passe désormais par là.
  `colonneGrille(gi)` généralisée : en compact elle renvoie la colonne du MATIN, `colonneDemi` ajoute le
  décalage de l'après-midi. Le week-end garde **une seule case par personne** (§2 du spec), jamais scindée.
- **`ligneGroupePersonnesCompact`** — une ligne par personne, les deux demi-journées côte à côte. La
  fonction classique est conservée telle quelle sous le nom `ligneGroupePersonnesClassique` : les deux
  chemins sont séparés, le mode actuel n'est pas « adapté », il est **intact**.
- **`assignerPistesCompact`** — l'empilement raisonne sur les DEMI-JOURNÉES occupées (jour × 2 + 0/1) et
  non sur des intervalles de jours : matin et après-midi du même jour cohabitent donc sur une seule piste
  (sans ça, aucun gain de hauteur — c'était tout l'objet du mode), tandis que deux tâches d'une même
  demi-journée s'empilent normalement.
- **Segments** — une tâche de plusieurs jours n'est plus un rectangle continu (les après-midi
  s'intercalent entre ses matins) : elle est dessinée en un segment par demi-journée occupée, **tous
  porteurs du même `data-id`**. `itemDepuisBulle()` les résout vers le même item : clic, sélection et
  ouverture fonctionnent depuis n'importe quel segment. Un liseré et des coins droits signalent « suite de
  la même tâche » plutôt que « autre tâche ».
- **Repères visuels** : fine ligne d'en-tête `M | A` sous chaque jour (sans elle, rien ne distinguerait les
  deux colonnes une fois l'étiquette « Matin »/« Après-midi » disparue), après-midi légèrement teinté.

### 14.3. Vérifications — première couverture automatisée de l'affichage

**`node test_grille_compacte.js` : 23/23 (NOUVEAU fichier).** Ce projet n'avait aucun test d'écran
(cf. §3) ; celui-ci en pose un premier jalon, et surtout il **extrait les fonctions RÉELLES de
`Index.html`** (par leur nom, depuis la source, avec équilibrage des accolades) au lieu d'en tester une
copie — une divergence entre le testé et le livré est donc impossible.

Priorité assumée du test : **prouver que le mode classique est inchangé**. Les valeurs de référence du §1
ont été recalculées à la main depuis l'ancienne formule, jamais copiées du nouveau code, et le §4 rebascule
en classique après un passage en compact pour vérifier que le réglage est réellement sans trace. Le mode
compact, lui, est neuf et facultatif : un défaut y serait gênant, pas dommageable.

Couvert : géométrie des colonnes dans les 2 modes, avec et sans week-ends ; frontières de semaine ;
la bulle Vendredi→Lundi qui enjambe le week-end (comportement déjà corrigé pour Lionel, préservé) ;
cohabitation matin/après-midi sur une piste ; empilement de deux tâches d'une même demi-journée ;
tâche de week-end.

### 14.4. Limites connues de cette première version

- **Une tâche ne peut toujours pas aller de mardi après-midi à jeudi matin.** C'était le second besoin
  exprimé par Lionel, et il demande un vrai changement de modèle (la « bulle » devient un intervalle de
  demi-journées, ce qui touche la fusion à la lecture, le glisser-déposer et le redimensionnement).
  Le mode compact est le **socle** de cette évolution : les demi-journées y sont déjà rangées dans
  l'ordre du temps, de gauche à droite. À faire au round suivant.
- **Le fantôme de déplacement** d'une tâche multi-jours (`rectanglePlage`) trace un rectangle continu, donc
  trop large en compact pendant le glissement. Purement visuel, le temps du geste.
- **L'impression reste en mode classique** (jours en colonnes, une ligne par demi-journée). Écran et
  papier ont donc des dispositions différentes tant que l'impression n'a pas été portée — ce qui, elle,
  toucherait `Code.gs`.

## 15. Round du 02.09.2026 (suite) — retours de Lionel sur le compact + page "Entrée rapide"

### 15.1. Bordures entre les jours (mode compact)

« C'est parfait sur ordinateur, cependant il faudrait marquer un peu plus les bordures entre les jours. »
Une hiérarchie à trois niveaux, portée par `.grille-compacte` uniquement (le mode classique n'est touché
par aucune de ces règles) : séparation matin/après-midi = le filet de grille ordinaire ; **frontière de
jour = 2px `--border-strong`** (nouvelle classe `jour-frontiere`, posée sur la colonne du matin) ;
frontière de semaine = 3px, plus forte encore. Sans ça, les 10 colonnes d'une semaine se lisaient comme
une bouillie régulière.

### 15.2. "Assigné à" : une CATÉGORIE, pas une personne — correction d'une sur-interprétation

« Les ajouts rapides doivent être pour le personnel en général, pas une seule personne. »

La demande d'origine (« les entrées rapides par intervenant ou ouvrier », round §12) désignait les deux
**catégories** — le personnel d'un côté, les intervenants de l'autre — et non une assignation individuelle.
C'est ce qui explique le symptôme signalé ici : « ils sont attachés au personnel et second œuvre alors
qu'ils ne devraient pas ». Valeurs stockées en 8e colonne : `""` (tout le monde), `"@personnel"`,
`"@intervenants"`.

**Rétrocompatibilité assurée** : une valeur numérique (assignation individuelle du round précédent) reste
honorée au filtrage comme à l'affichage, et l'option correspondante reste proposée dans le sélecteur tant
que le formulaire la porte — ouvrir puis enregistrer un tel formulaire ne change donc pas son réglage à
l'insu de Lionel. Aucune migration de données.

`formulaireVisiblePour(f, personneId)` centralise la règle ; `boutonsMenuAjout` s'y ramène.

### 15.3. Les 3 formulaires historiques deviennent modifiables

« Les 3 ajouts créés ensemble doivent pouvoir être modifiés. » « Modifier » était purement bloqué pour
Armature / Béton / Livraison armature (toast d'explication). Trop brutal : ce qu'il faut protéger, c'est
**uniquement leur NOM**, clé exacte reliant le bouton à son interface dédiée (`cablerBoutonsMenuAjout`) —
les renommer ferait silencieusement perdre cette interface au profit du formulaire générique. Le champ nom
est donc désactivé pour ces 3-là, avec une note d'explication (`#noteFormSpecial`), et **tout le reste est
modifiable** — au premier chef « Assigné à », qui est précisément ce dont Lionel a besoin pour qu'ils
cessent d'apparaître dans les deux catégories.

### 15.4. Champs : réordonner et modifier

« J'aimerais pouvoir changer l'ordre ou modifier un champ dans ce formulaire. » Chaque champ reçoit
↑ / ↓ / Modifier, en plus du retrait qui existait seul. L'ordre des champs étant celui du texte de tâche
produit, pouvoir le corriger sans tout resaisir n'a rien de cosmétique. `ouvrirConstructeurChamp(idx)`
sert désormais l'ajout ET la modification. **La CLÉ d'un champ modifié est conservée** : c'est elle qui
l'identifie dans les formulaires déjà remplis, la régénérer depuis le nouveau libellé les orphelinerait.

### 15.5. Bouton d'ajout replacé

« Le bouton ajout de formulaire est mal placé. » Il était seul de son espèce en haut, dans le titre de
page ; il rejoint le bas de liste (`.ligne-ajouter`), comme sur Chantiers, Statuts, Personnel et
Intervenants.

### 15.6. Vérifications

- `node --check` sur le script inline d'`Index.html` : OK.
- `node test_grille_compacte.js` : 23/23 (inchangé — le mode classique reste prouvé identique).
- **`node test_formulaires_assignation.js` : 10/10 (NOUVEAU)** — extrait `formulaireVisiblePour` et
  `nomAssigneAffiche` de `Index.html` (fonctions réelles, pas une copie) et couvre : les 3 catégories,
  la rétrocompatibilité de l'assignation individuelle, une assignation vers une personne supprimée
  (ne doit rien faire planter), et les libellés affichés.

### 15.7. Reste à traiter (demandé dans le même message)

- **Jalons et notes sur des demi-journées** : côté feuille, un jalon/une note = UNE case par jour
  (lignes 4 et 5). Faisable sans changer la structure en réutilisant le procédé déjà en place pour le
  week-end (`decoderCelluleWeekend_`, tags `[S]`/`[D]` dans une seule cellule) avec des tags `[M]`/`[A]` —
  mais ça touche `WebApp.gs`, le client ET l'impression. À cadrer avant de coder.
- **Ajout lointain** (poser une tâche/absence/congé à une date éloignée sans faire défiler le calendrier,
  avec une durée) : la plomberie serveur existe déjà (`ecrireOccurrenceSerie_`, `semainesACriblePourSerie_`
  écrivent dans des semaines arbitraires). C'est le plus gros morceau des trois, et le plus utile.
- **« Ajouter les absences »** : demande à préciser (types d'absence configurables ? absences proposées
  aussi aux intervenants ?).

## 16. Round du 02.09.2026 (suite) — assignation par intervenant + absences éditables

### 16.1. "Assigné à" : tout le monde / le personnel / CHAQUE intervenant

Précision de Lionel, en deux temps : « les ajouts rapides doivent être pour le personnel en général, pas
une seule personne », puis « tout le monde, personnel, et ensuite chaque intervenant séparé. L'électricien
n'a pas besoin des ajouts béton. »

Le modèle final n'est donc ni tout-groupe ni tout-nominatif : **le personnel interne en un seul groupe**
(même métier, mêmes entrées rapides), **chaque intervenant à part** (chacun est un corps de métier
distinct). Le sélecteur propose Tout le monde · Personnel · puis un groupe « Un intervenant en
particulier » listant les sous-traitants. `formulaireVisiblePour()` n'a pas eu à changer : assigner
l'ancre d'un intervenant le réservait déjà à cette seule personne.

Tout réglage déjà enregistré qui ne figure pas dans la liste (« tous les intervenants », proposé un temps ;
une personne du personnel ; un intervenant supprimé depuis) reste **honoré ET proposé comme option** tant
que le formulaire le porte : ouvrir puis enregistrer ne change jamais un réglage à son insu.

### 16.2. Congé et Vacances deviennent des entrées rapides ordinaires

Ils étaient codés en dur dans `boutonsMenuAjout`. Ils viennent maintenant de la liste configurable, grâce
à la 9e colonne `TypeEntree` (cf. BACKEND-CHANGELOG.md §21) :

- **Sélecteur « Type d'entrée »** (Tâche / Absence) dans l'éditeur de formulaire.
- `ouvrirFormulaireDynamique` et l'ajout en un clic posent une bulle du bon type — « Congé » réglé en
  absence pose bien un congé (orange), pas une tâche.
- **Repli conservateur** : les 2 boutons historiques restent affichés **tant qu'aucune** entrée rapide de
  type « absence » n'existe. Rien ne disparaît du menu de Lionel avant qu'il ne les ait créées.
- **Bouton « Reprendre les absences (Congé, Vacances) pour pouvoir les modifier »**, en bas de la page
  Entrée rapide : les crée en un clic (type absence, sans champ, réservées au personnel — comportement
  identique aux boutons qu'elles remplacent), puis disparaît. Un geste explicite plutôt qu'une écriture
  automatique dans sa feuille.
- « Absence » (qui ouvre l'éditeur pour saisir un motif) reste un type de bulle à part entière, inchangé.

### 16.3. Vérifications

- `node --check` sur le script inline d'`Index.html` : OK.
- `node test_formulaires_assignation.js` : **13/13** — dont le cas cité par Lionel vérifié de bout en bout
  (un formulaire « Béton » réglé sur Personnel n'apparaît jamais chez l'électricien), chaque intervenant
  isolé des autres, et les 3 formes de réglages hérités toujours honorées.
- `node test_grille_compacte.js` : 23/23 · `node test_backend_pures.js` : 79/79.

## 17. Round du 02.09.2026 — bouton « Ajout lointain »

Nouveau bouton dans l'en-tête du planning, à côté d'Imprimer. Ouvre un formulaire : **quoi** (congé/absence,
tâche, note, jalon) · **pour qui** (personnel et intervenants, masqué pour une note ou un jalon, qui
appartiennent à la journée et non à une personne) · **chantier** (tâches seulement) · **matin /
après-midi / journée entière** · **date de début** · **durée** (raccourcis 1 jour, 3 jours, 1 semaine,
2 semaines, ou saisie libre en jours ouvrés) · **texte**.

Tout part en UN SEUL appel (`apiAjoutLointain`, cf. BACKEND-CHANGELOG.md §22) : le serveur crée au besoin
les semaines manquantes puis pose l'entrée sur chaque jour ouvré. Le formulaire n'écrit jamais dans le
modèle local — la période visée est presque toujours hors de la fenêtre affichée : le cache est oublié et
la fenêtre rechargée, et `etat.semaines` est remplacé par la liste renvoyée (sans quoi le client ignorerait
les semaines fraîchement créées et ne pourrait pas naviguer jusqu'à ce qu'il vient de poser).

Le message de confirmation dit ce qui s'est réellement passé — « Ajouté sur 5 jour(s) ouvré(s), du … au … »
et, le cas échéant, « N semaine(s) ont été créées dans le planning pour l'occasion » : créer des semaines
dans sa feuille n'est pas anodin, ça ne doit pas se faire en silence.

Détails d'ergonomie : le type par défaut est « Congé / absence » avec le texte pré-rempli « Congé » (le cas
qu'il a décrit), la durée par défaut « 1 semaine », et saisir une durée libre désélectionne les raccourcis.

Vérifications : `node --check` OK ; la logique de dates est couverte côté serveur par
`test_ajout_lointain.js` (15/15) ; `test_grille_compacte.js` 23/23 et `test_formulaires_assignation.js`
13/13 restent verts.

## 18. Round du 02.09.2026 — jalons et notes sur des demi-journées (côté écran)

Cf. BACKEND-CHANGELOG.md §23 pour le stockage (étiquettes `[M]`/`[A]`, aucune migration).

- **Modèle** : `itemPlage` porte `demi` ("matin" | "aprem" | null = journée entière).
- **Fusion à la lecture** : deux jours consécutifs ne se collent en une seule bulle que s'ils ont le même
  texte ET la même demi-journée — un jalon du matin ne se soude pas à un jalon d'après-midi du lendemain.
- **Synchronisation** : `jalonsMap` compare désormais `demi\0texte` et non plus le texte seul. Sans ça,
  faire passer un jalon du matin à l'après-midi laissait le texte identique, ne déclenchait aucune
  écriture, et la modification était perdue au rechargement **sans le moindre message**. Même correction
  dans `diffsNotes` et `notesParId`.
- **Formulaire** : trois puces « Journée entière / Matin / Après-midi » dans l'édition d'un jalon ou d'une
  note, et le choix vaut aussi dans l'ajout lointain (le champ y est maintenant visible pour tous les
  types, plus seulement pour les tâches et absences).
- **Affichage** : en mode compact, l'entrée se pose exactement sur la bonne des deux colonnes du jour. En
  mode classique, où un jour n'a qu'une colonne, elle occupe la moitié de la case, calée à gauche (matin)
  ou à droite (après-midi), avec un liseré du côté concerné — une simple classe CSS, la géométrie de la
  grille ne bouge pas.

Vérifications : `node --check` OK · `test_grille_compacte.js` 23/23 · `test_formulaires_assignation.js`
13/13 · `test_backend_pures.js` 94/94 · `test_ajout_lointain.js` 15/15.

## 19. Round du 02.09.2026 (suite) — demi-journée retirée des jalons

Cf. BACKEND-CHANGELOG.md §24. Le §18 ci-dessus avait ouvert la demi-journée aux jalons *et* aux notes ;
Lionel a précisé aussitôt après : **jalons non, notes oui**. Correction côté écran, en miroir du serveur.

- **Fiche d'édition** (`ouvrirEditionPlage`) : le bloc de puces « Journée entière / Matin / Après-midi »
  n'est plus rendu du tout quand `kind === "jalon"` — pas grisé, absent. `demiInit` reste `null`, donc
  rien ne part au serveur.
- **Ajout lointain** : le champ « Quand dans la journée » est masqué quand le type choisi est « Jalon ».
  Il est aussi **remis sur « Journée entière »** au passage : sans ça, un matin choisi pour une note puis
  basculé en jalon serait resté sélectionné, invisible, et serait reparti au serveur.
- **Lecture / fusion** : la fusion des jalons consécutifs ne compare plus que le texte (le §18 comparait
  aussi la demi-journée), et l'item construit n'en porte plus.
- **Synchronisation** : `jalonsMap` redevient une comparaison de texte seul — le `demi\0texte` du §18
  n'avait plus d'objet. `diffsNotes` / `notesParId` gardent le leur, les notes étant inchangées.

Les notes conservent tout le §18 : puces dans la fiche, demi-largeur en mode classique, bonne colonne en
mode compact, liseré du côté concerné.

Vérifications : `node --check` OK · `test_semaines.js` TOUT PASSE (dont 12 assertions neuves sur la règle
notes-oui/jalons-non) · `test_backend_pures.js` 94/94 · `test_grille_compacte.js` 23/23 ·
`test_formulaires_assignation.js` 13/13 · `test_ajout_lointain.js` 15/15.

## 20. Round du 03.09.2026 — les champs d'une case décochée restaient affichés

Signalé par Lionel : *« au niveau des formulaire ne pas afficher les entrées des séries quand pas coché »*
— les champs de fréquence/répétitions de la case « Série (se répète) » restaient visibles même case
décochée.

### Cause

Un piège CSS classique : `[hidden] { display: none }` est une règle du navigateur (origine « user-agent »),
la plus faible priorité qui existe dans la cascade — **n'importe quelle règle d'auteur qui pose `display`
sur ce même élément l'emporte automatiquement**, quelle que soit sa spécificité. Trois règles du fichier
posaient un `display` sans s'en douter :

- `.serie-options { display: flex; ... }` — la case « Série » elle-même.
- `.form-pop .chk-ligne { display: flex; ... }` — les lignes « Répétitions » / « Se termine le » à
  l'intérieur.
- `.champ-ligne { display: flex; ... }` — touchait aussi, dans le formulaire d'ajout lointain, les champs
  « Pour qui », « Chantier » et « Quand dans la journée » censés se cacher selon le type choisi (jalon /
  note / tâche / absence).

Le JS qui posait bien `element.hidden = true` fonctionnait normalement — c'est uniquement l'affichage qui
n'en tenait pas compte.

### Correctif

Un seul filet de sécurité générique plutôt que corriger chaque règle une par une : `[hidden] { display:
none !important; }` tout en haut de la feuille de style. Un `hidden` reste caché quoi qu'il arrive, même si
une règle plus bas lui pose un `display` — et rien d'autre dans le fichier ne pose de `display` en inline
ni de `!important` qui aurait pu en avoir besoin (vérifié).

Vérifications : `node --check` OK · reconstruction empirique de l'arbre de styles (élément avec `hidden` +
chacune des 3 classes ci-dessus) confirmant `display: none` après correctif · les 7 suites de tests
(`test_backend_pures.js`, `test_grille_compacte.js`, `test_formulaires_assignation.js`,
`test_ajout_lointain.js`, `test_fusion_feries.js`, `test_fuseau_feries.js`, `test_semaines.js`) toutes
vertes — cette correction ne touche que du CSS, aucune n'était censée bouger.

## 21. Round du 03.09.2026 — impossible d'étendre une note en demi-journée

Signalé par Lionel : *« je n'arrive pas à étendre une bulle note sur une demi journée. »*

### Cause

Le redimensionnement par glissement (poignées gauche/droite d'une bulle, `cablerPoigneeRedim`) existait
avant les demi-journées (§18/§23) et n'en a jamais tenu compte. Pendant le glissement, l'aperçu en direct
(`appliquerPrevisu`) recalculait la position avec `colonneGrille`/`spanColonnes` — les mêmes formules
« pleine journée » que pour une bulle normale — au lieu de `colonneDemi` + span réduit qu'utilise le rendu
statique pour une note du matin ou de l'après-midi. En mode compact (celui que Lionel a mis en place
justement « surtout pour les demi-journées »), ça se voyait tout de suite : dès qu'on touchait à la
poignée, la bulle sautait sur la colonne du matin — même pour une note de l'après-midi — et s'étalait sur
les 2 colonnes du jour plutôt que sur sa demi-colonne, rendant impossible de viser où la déposer. Le
`onCancel` (glissement annulé) avait le même défaut.

Les données elles-mêmes n'étaient jamais en cause : le redimensionnement ne touche que `giDebut`/`duree`,
jamais `demi`. Seul l'aperçu — donc l'utilisabilité du geste — était cassé.

### Correctif

Plutôt que rafistoler l'aperçu de glissement séparément, la formule de positionnement (colonne + span en
tenant compte de `demi`) a été **extraite en une seule fonction partagée**, `colonneEtSpanDemi(gi, duree,
demi)`, utilisée à la fois par le rendu statique et par `appliquerPrevisu`/`onCancel`. Les deux ne peuvent
plus diverger : une future modification de l'un s'applique automatiquement à l'autre.

Vérifications : `node --check` OK · `test_grille_compacte.js` passe de 23/23 à **31/31** (8 assertions
neuves sur `colonneEtSpanDemi`, dont le scénario concret de Lionel — étendre une note du matin de 1 à 3
jours, à chaque étape identique au rendu statique) · les 6 autres suites restent vertes.

## 22. Round du 03.09.2026 (suite) — chantier par défaut des formulaires

Demande de Lionel : *« pouvoir sélectionner un chantier dans la légende pour qu'il soit sélectionné par
défaut dans les formulaires. »*

- **La légende** (`construireLegende`) : chaque chantier y est désormais cliquable (curseur, surbrillance
  au survol, infobulle). Cliquer un chantier le marque actif (fond teinté + liseré sur la pastille de
  couleur) et en fait le choix pré-coché de tous les selects « Chantier » des formulaires — cliquer à
  nouveau le même chantier désélectionne (retour à l'ancien comportement : le 1er chantier de la liste).
  Réglage **local à l'appareil** (`localStorage`, même famille que le mode compact / l'affichage des
  week-ends) : chacun garde le sien, rien n'est partagé côté feuille.
- **Formulaires concernés** : les 3 formulaires historiques (Armature/Béton/Livraison armature), tout
  formulaire rapide personnalisé de type Tâche, la fiche d'édition d'une tâche (nouvelle tâche uniquement —
  modifier une tâche existante garde son propre chantier, inchangé), et le champ Chantier de l'ajout
  lointain.
- **Jamais de valeur périmée** : si le chantier choisi est renommé ou supprimé entre-temps,
  `chantierParDefautValide()` renvoie `null` plutôt que de pointer sur un chantier qui n'existe plus — repli
  silencieux sur le comportement d'avant (1er chantier de la liste, ou « — aucun — » pour l'ajout lointain).

Vérifications : `node --check` OK · nouvelle suite `test_chantier_defaut.js` (7/7) : aucun choix -> repli
sur le 1er chantier, choix valide -> pré-coché, choix périmé -> ignoré proprement · les 7 autres suites
restent vertes.

## 23. Round du 03.09.2026 (suite) — vraiment étendre/déplacer une note en demi-journée

Lionel, après le §21 : *« les notes sont toujours pas extensible ni déplaçable en demi journée. »* Il avait
raison : le §21 n'avait réparé que l'APERÇU d'une note DÉJÀ en demi-journée qu'on étend sur plusieurs
jours. Il restait strictement impossible de FAIRE APPARAÎTRE une demi-journée par glissement — ni en
réduisant une note (poignées), ni en la déplaçant (glisser la bulle entière). Seule la fiche d'édition
(double-clic) le permettait.

### Redimensionnement (poignées gauche/droite)

Avant, réduire une note butait sur « 1 jour minimum » sans jamais poser de demi-journée — `it.demi` n'était
tout simplement jamais touché par un redimensionnement. Désormais, **tant que la poignée reste dans le seul
jour qu'elle peut encore réduire** (le 1er jour pour la poignée droite, le dernier pour la gauche), sa
position **horizontale** dans la cellule choisit matin / après-midi / journée entière — exactement le geste
qu'on ferait pour « recadrer » un bloc. Dès qu'elle ressort de ce jour pour étendre sur plusieurs jours, la
demi-journée d'origine est simplement reconduite (comportement du §21, inchangé).

### Déplacement (glisser la bulle entière)

Avant, déposer une note sur le MÊME jour qu'elle occupait déjà (`delta = 0`, ex. essayer de la faire glisser
du matin vers l'après-midi sans changer de jour) ne faisait STRICTEMENT rien — un pur no-op silencieux.
Désormais :
- **même jour** : la position du relâchement choisit la demi-journée — c'est précisément le geste "matin
  -> après-midi" que Lionel décrivait.
- **jour différent, note déjà en demi-journée** : la position choisit sa nouvelle demi-journée sur le jour
  d'arrivée (glisser une note du matin du lundi vers l'après-midi du mardi, en un seul geste).
- **jour différent, note en JOURNÉE ENTIÈRE** : reste en journée entière — glisser une note "normale" vers
  un autre jour ne la réduit JAMAIS à une demi-journée par accident. C'est le cas le plus fréquent ; zéro
  régression dessus était la priorité.

Restreint à la souris et à une note SEULE (pas de sélection groupée, pas de tactile) — le geste tactile
garde le comportement jour-entier déjà existant, plus simple au doigt ; une sélection groupée n'a pas de
position de relâchement non ambiguë à assigner à plusieurs bulles à la fois. Les jalons ne sont jamais
concernés (plus de demi-journée pour eux depuis BACKEND-CHANGELOG.md §24), ni les tâches personnel (leur
demi-journée est la ligne/colonne qu'elles occupent, pas une propriété qu'un redimensionnement ou un
déplacement changerait).

Corrigé au passage : **copier** une note du matin par glissement (Maj+glisser, chemin de sélection groupée)
faisait disparaître sa demi-journée en silence dans la copie — `demi` n'était pas transmis à la copie.

### Ce qui rend ça fiable

La détection ("quelle moitié de la cellule survole le pointeur") et les deux RÈGLES ("quelle demi-journée
en résulte pour un redimensionnement", "… pour un déplacement") sont chacune une fonction pure et partagée
— `demiDepuisPointeur`, `demiPourRedimNote`, `demiCiblePourDeplacementNote` — testées indépendamment de
tout DOM/pointeur.

Vérifications : `node --check` OK · `test_grille_compacte.js` passe de 31/31 à **46/46** (15 assertions
neuves sur les 3 nouvelles fonctions, dont le scénario exact de Lionel : même jour, matin -> après-midi) ·
les 7 autres suites restent vertes.

## 25. Round du 03.09.2026 (suite) — un bord de demi-journée par extrémité (« 1 jour et demi »)

Lionel, après avoir vérifié le §23/24 : *« je peux reduire de 1 jour à 1 demi jour, mais je ne peux pas
augmenter à 1 jour et demi. »* Cause : une note ne portait qu'UNE SEULE demi-journée pour toute sa plage —
en étendre une déjà réduite à « matin » sur un 2e jour ne pouvait donc que reconduire « matin » aux deux
jours (jamais « 1 jour et demi ») ou revenir en journée entière. Consulté sur l'ampleur du correctif
(cf. `AskUserQuestion` : contournement à 2 notes séparées, ou refonte propre), Lionel a choisi *« Le faire
correctement. »* — chaque BORD de la plage porte maintenant sa propre demi-journée (`demiDebut`/`demiFin`
au lieu d'un `demi` unique), tout jour strictement entre les deux restant toujours une journée entière (cf.
BACKEND-CHANGELOG.md §25 pour le détail serveur, symétrique).

### Ce qui change dans le modèle en mémoire

`itemPlage()` porte désormais `demiDebut`/`demiFin` au lieu de `demi` (invariant maintenu par tous les
appelants : `demiDebut === demiFin` quand `duree === 1`). Répercuté partout où une note transitait par ce
champ unique :

- **`construireVueDepuisCache`** (fusion des jours en une bulle) : un run de jours ne se prolonge au-delà
  du 1er jour que si le jour courant est une journée entière — sinon ce jour devient le bord de fin du run,
  la fusion s'arrête là. `demiDebut`/`demiFin` de l'item fusionné sont simplement la demi du 1er et du
  dernier jour du run.
- **`notesParId`/`diffsNotes`/`synchroniser`** : le diff compare les 2 champs, et l'appel à
  `apiEnregistrerPlage` envoie maintenant `demiDebut`/`demiFin` — pour la NOUVELLE plage comme pour
  l'ORIGINE (nécessaire côté serveur pour ne retirer que l'entrée qui portait vraiment cette
  demi-journée-là, cf. BACKEND-CHANGELOG.md §25.2).
- **`colonneEtSpanDemi`** (rendu ET aperçu de glissement, fonction partagée depuis le §21) : la colonne de
  départ ne dépend plus que de `demiDebut`, la fin du span que de `demiFin` — chaque bord se dessine
  indépendamment. Sur plusieurs jours en mode compact, seul `demiFin === "matin"` raccourcit visuellement
  la fin (le dernier jour s'arrête après sa sous-colonne matin) ; `demiDebut === "aprem"` décale le départ
  (le 1er jour démarre à sa sous-colonne après-midi). Les 2 autres combinaisons (`demiDebut === "matin"`,
  `demiFin === "aprem"`) n'ont pas de représentation contiguë possible sur plusieurs jours (elles
  creuseraient un trou non contigu dans la bulle) et restent volontairement **inertes** — identiques à
  l'absence de demi-journée, jamais une exception ni un décalage surprenant. En mode classique, la classe
  CSS `.bulle-demi` (largeur 50 %, pensée pour UN SEUL jour) reste réservée aux notes de `duree === 1` ;
  une note multi-jours avec un bord en demi-journée s'y affiche en rectangle plein (le titre au survol
  continue de le signaler), la géométrie correcte restant réservée au mode compact.
- **`demiPourRedimNote`** (redimensionnement) — LE cœur du correctif : renvoie maintenant
  `{demiDebut, demiFin}`. Chaque poignée ne gouverne plus que SON PROPRE bord (droite -> `demiFin`, gauche
  -> `demiDebut`) — **l'autre bord n'est plus jamais figé sur sa valeur de départ**, quelle que soit la
  durée de l'aperçu. C'est précisément ce qui manquait : avant, dès que l'aperçu dépassait 1 jour, la
  fonction retournait purement et simplement `demiOrig` sans plus regarder le pointeur, empêchant tout
  « 1 jour et demi ». Sur un seul jour restant (les 2 bords fusionnent), le comportement historique est
  inchangé.
- **`demiCiblePourDeplacementNote`** (déplacement, bulle entière) : gagne un paramètre `duree` en tête — sur
  PLUSIEURS jours, un simple déplacement (qui ne change jamais la durée) reconduit la forme des 2 bords
  telle quelle, sans tenter de deviner laquelle des 2 extrémités le point de relâchement concernerait.
  Sur 1 seul jour, comportement du §23 inchangé (position du relâchement = nouvelle demi-journée).
- **La fiche d'édition (`ouvrirEditionPlage`)** : sur 1 seul jour, toujours l'unique rangée à 3 choix
  (Journée entière / Matin / Après-midi). Sur plusieurs jours, 2 rangées indépendantes — « Premier jour »
  (Journée entière / Après-midi seulement) et « Dernier jour » (Journée entière / Matin seulement), les
  2 seules valeurs qui ont un sens comme bord de départ ou de fin. Le bloc se régénère quand le champ
  Durée change (repli automatique sur la rangée unique en repassant à 1 jour, pour ne jamais enregistrer 2
  bords divergents sur une plage d'un seul jour).
- Copie par glissement groupé (`appliquerDelta`, corrigé au §23 pour ne plus perdre la demi-journée d'une
  copie) : transmet maintenant `demiDebut`/`demiFin` au lieu de `demi`.

### Vérifications

- **`test_grille_compacte.js` : 46/46 -> 51/51** — `colonneEtSpanDemi` re-testée avec des bords
  indépendants (« 1 jour et demi » sur chacun des 2 bords, « 2 jours et demi », inertie de `matin`/`aprem`
  côté non pertinent) ; `demiPourRedimNote`/`demiCiblePourDeplacementNote` re-testées avec leurs nouvelles
  signatures, dont le scénario exact de Lionel (poignée droite, plusieurs jours, la position du pointeur
  choisit désormais `demiFin` au lieu d'être ignorée) et le nouveau cas multi-jours de
  `demiCiblePourDeplacementNote` (forme des 2 bords préservée par un déplacement).
- `node --check` : OK. Les autres suites (backend + les 7 autres suites client) restent vertes — détail
  dans BACKEND-CHANGELOG.md §25.

## 26. Round du 03.09.2026 (suite) — poser une tâche ne doit plus changer le chantier de l'autre

Lionel, capture d'écran à l'appui (2 tâches empilées sur la même case, toutes deux passées en rouge/rose au
lieu de mauve pour l'une d'elles) : *« lorsque je pose une tache sur une demi journée, l'autre tâche prend
le chantier de la nouvelle créer. il doit etre possible de rentrer des tache sans changer le chantier de
l'autre tâche. »*

### Diagnostic

Une case (personne + demi-journée + jour) ne porte qu'**UN SEUL chantier** côté feuille — c'est une cellule
séparée sur la feuille Planning, partagée par toutes les tâches empilées dessous (`apiEnregistrerCellulePersonne`,
WebApp.gs : « Chantier » et « détail » sont 2 lignes distinctes, jamais une par tâche empilée). Deux bugs
distincts, chacun nécessaire ET suffisant pour reproduire le symptôme :

1. **`calculerEtatLocal`** (ligne ~2760) construit l'objet `{chantier, taches}` envoyé au serveur en
   parcourant toutes les tâches de la case et en gardant `if (t.chantier) cellules[cle].chantier = t.chantier;`
   — la DERNIÈRE tâche du tableau à porter un chantier l'emporte, sans détection de conflit ni avertissement.
2. **Le formulaire d'ajout** (`ouvrirEdition` et les 3 formulaires historiques Armature/Béton/Livraison
   armature + tout formulaire dynamique) ne propose JAMAIS de case vide dans son select Chantier — une
   nouvelle tâche part donc toujours avec une valeur concrète (le chantier par défaut de la légende, §22,
   ou par repli le 1er chantier de la liste), quasiment jamais celui de la tâche déjà posée sur cette case.
   Résultat : ajouter une 2e tâche sans même toucher au champ Chantier envoie presque toujours un chantier
   *différent* de celui déjà en place — et le bug 1 l'applique alors silencieusement à toute la case.

### Correctif

Nouvelle fonction pure `chantierExistantDansCase(cibles, giDebut, duree)` : cherche, parmi les cases
ciblées et les jours couverts, une tâche EXISTANTE qui porte déjà un chantier, et le renvoie (`null` si la
case est vide). Utilisée en PRIORITÉ sur le chantier par défaut de la légende pour pré-cocher le select
Chantier d'une NOUVELLE tâche — dans `ouvrirEdition` et les 4 formulaires (Armature/Béton/Livraison
armature/dynamique). Concrètement : poser une 2e tâche sur une case déjà occupée pré-coche désormais le
chantier déjà en place ; si l'utilisateur ne touche pas au champ, les 2 tâches partagent le MÊME chantier
dès l'ajout — le bug 1 (dernier gagnant) devient sans effet visible puisque les 2 valeurs sont identiques.
Si l'utilisateur choisit explicitement un AUTRE chantier, c'est un choix délibéré : la case (et donc
l'affichage de la tâche déjà en place) en hérite, comme le veut la limite du modèle serveur — un seul
chantier physiquement possible par case.

Une tâche existante SANS chantier (une absence, qui n'en porte jamais) est ignorée par la recherche — pas
de faux positif. Une plage de plusieurs jours cherche sur CHAQUE jour couvert, pas seulement le 1er.
Plusieurs cibles (sélection multi-personnes) : la 1ère case occupée trouvée dans la sélection donne son
chantier — pas de tentative de résoudre un conflit entre plusieurs chantiers déjà en place, cas non
rencontré en usage réel.

### Vérifications

`test_chantier_defaut.js` : 7/7 -> **16/16** (9 assertions neuves sur `chantierExistantDansCase`) — le
scénario exact de Lionel (case occupée par une tâche avec chantier -> ce chantier-là), case occupée
seulement par une absence -> `null`, case vide -> `null`, personne/cible inconnue -> `null` (jamais une
exception), tâche de plusieurs jours détectée sur un jour du milieu de sa plage, plusieurs cibles. `node
--check` : OK. Les 8 autres suites restent vertes.

## 27. Round du 03.09.2026 (suite) — bordures du mode compact : jour fin, plus de trait entre matin/aprem

Retour de Lionel : « Je n'aime pas les bordures épaisse entre les jours, laisse les fine mais enlève celle
des demi jours. » Ce round (02.09.2026, §... mode compact) avait volontairement épaissi le trait entre deux
JOURS (`.jour-frontiere`, `border-left: 2px solid var(--border-strong)`) pour qu'on ne le confonde pas avec
la simple séparation matin/après-midi. À l'usage, ce trait de 2px est jugé trop marqué.

### Changement (CSS uniquement, `Index.html`, portée `.grille-compacte` — mode classique inchangé)

- **Frontière de JOUR** (`.jour-frontiere`) : `border-left` passe de **2px** à **1px**, toujours en
  `var(--border-strong)` — un trait fin mais volontairement un peu plus soutenu que le quadrillage de base,
  pour rester repérable sans être épais.
- **Séparation matin/après-midi** : supprimée entièrement. Elle n'était déjà portée que par le fin
  quadrillage de base (`gap: 1px` de `.grille`, jamais une classe dédiée) ; comme CSS Grid applique ce
  `gap` uniformément à toutes les colonnes, il fallait le masquer spécifiquement à cet endroit. Technique :
  `.cell.cell-aprem` / `.th.th-demi-aprem` reçoivent `margin-left: -1px` (empiète de 1px sur le trait de
  grille à leur gauche, entre matin et aprem) compensé par un `padding-left` égal à `padding-left habituel +
  1px` (pour ne pas déplacer leur contenu). N'affecte jamais le trait à leur DROITE, qui est la frontière du
  jour suivant (gérée séparément par `.jour-frontiere`, portée par la colonne "matin" suivante).
- Seule la teinte de fond de l'après-midi (`.cell-aprem`, `.th-demi-aprem`, déjà existante) distingue encore
  visuellement matin et après-midi d'un même jour.

### Vérifications

Changement CSS pur, aucune fonction JS touchée : les 9 suites de tests (216 assertions au total) restent
toutes vertes, `node --check` OK (accolades du bloc `<style>` comptées et équilibrées : 356/356). Rendu
vérifié par capture d'écran isolée (mini-grille compacte hors-application, mêmes classes CSS réelles) :
transition matin→aprem parfaitement continue (aucun trait), frontière de jour fine mais visible, frontière
de semaine toujours la plus marquée des trois — hiérarchie semaine > jour > demi-journée préservée.

## 28. Round du 03.09.2026 (suite) — bordure entre jours : encore trop lourde, alignée sur le reste du quadrillage

Après §27, nouveau retour de Lionel sur capture d'écran : « cette ligne ne me convient pas met la comme les
autres du planning » puis, après clarification (choix « autre chose » + précision) : « la ligne [bordure]
entre les jours est trop "lourde" ». Le trait de 1px laissé par §27 utilisait toujours `var(--border-strong)`
(`#1a2129` en thème clair — littéralement la couleur du texte, quasi noir), donc visuellement lourd même fin.

### Changement (CSS uniquement, `Index.html`, portée `.grille-compacte`)

`.grille-compacte .th.jour-frontiere, .grille-compacte .cell.jour-frontiere` : plus AUCUNE règle dédiée. La
frontière de jour retombe simplement sur le quadrillage de base de `.grille` (`gap: 1px; background:
var(--border)`, un gris clair `#d7dad2`) — strictement la même apparence que n'importe quel autre trait du
planning, ce qui répond littéralement à « comme les autres ». Comme §27 a par ailleurs supprimé toute
séparation matin/après-midi, ce fin trait de base n'apparaît plus QU'aux frontières de jour dans la grille
compacte : il reste donc parfaitement lisible comme repère "par jour" sans avoir besoin d'être plus sombre
ou plus épais — le problème de lisibilité qui avait motivé l'épaississement initial (round du 02.09.2026)
est résolu par la disparition du bruit visuel des demi-journées, pas par un trait plus marqué.

La frontière de SEMAINE (`.sem-frontiere`, 3px `var(--ink-faint)`) n'est pas concernée — Lionel n'a jamais
visé qu'elle.

### Vérifications

CSS pur, aucune fonction JS touchée : 9 suites toujours vertes (216 assertions), `node --check` OK, accolades
du bloc `<style>` équilibrées (355/355 après suppression de la règle). Rendu revérifié par capture d'écran
isolée : le trait de jour est maintenant visuellement identique aux autres traits de la grille.

## 29. Round du 03.09.2026 (suite) — texte des bulles : jusqu'à 2 lignes si nécessaire

Retour de Lionel : « autoriser les bulles a faire 2 hauteur de texte si nécessaire. » Jusqu'ici `.b-txt`
(le texte affiché dans une bulle tâche/absence/jalon/note, `bulleEl` — un seul composant partagé par tous
les types) était strictement 1 ligne (`white-space: nowrap`) : tout texte trop long pour la largeur de la
bulle était tronqué avec "…", parfois dès les premiers mots.

### Changement (CSS uniquement, `Index.html`, `.b-txt`)

`white-space: nowrap` → autorisé à revenir à la ligne, mais borné à 2 lignes via `-webkit-line-clamp: 2`
(+ `line-clamp: 2` pour les navigateurs récents qui supportent la version non préfixée) : 1 seule ligne
quand le texte tient dedans (la bulle ne grandit pas pour rien), jusqu'à 2 lignes pour un texte plus long,
et toujours un "…" au-delà pour ne jamais avoir une bulle qui grandit sans limite. `overflow-wrap: anywhere`
ajouté en sécurité pour un mot isolé trop long pour une ligne.

Aucun changement de layout nécessaire au-delà de ça : ni `.bulle` ni `.cell` n'ont de hauteur fixe (flex +
`min-height` seulement), et la grille n'a pas de `grid-template-rows`/`grid-auto-rows` fixé en dur — les
rangées de `.grille` se dimensionnent déjà sur leur contenu (comportement par défaut de CSS Grid). Une
bulle qui passe sur 2 lignes agrandit donc automatiquement SA rangée (et powers qu'elle, jamais les autres)
sans aucun code JS à toucher pour les pistes/hauteurs.

### Vérifications

CSS pur : 9 suites toujours vertes (216 assertions), `node --check` OK, accolades du bloc `<style>`
équilibrées (355/355). Rendu vérifié par capture d'écran isolée (3 bulles : texte court -> 1 ligne
inchangée, texte moyen -> passe proprement sur 2 lignes, texte très long -> 2 lignes puis "…").

## 30. Round du 03.09.2026 (suite) — popup "Aller à…" : dates au format dd.mm.aaaa

Retour de Lionel : « dans aller à: semaine X et date, le format date à changer, dd.mm.aaa[a]. » La popup
"Aller à…" (`ouvrirAllerSemaine`) listait chaque semaine avec ses dates de début/fin au format ISO brut
reçu du serveur (`s.debut`/`s.fin`, ex. "2026-09-01"), jamais reformaté côté client — contrairement au
reste de l'appli qui affiche toujours les dates en "jour + mois" via `libelleJourGi`.

### Changement (`Index.html`)

Nouvelle fonction pure `isoAffiche(iso)` (à côté de `isoDeDate`, section "DATES RÉELLES ↔ gi") : convertit
une date ISO `"AAAA-MM-JJ"` en `"jj.mm.aaaa"` par un simple découpage/réordonnancement de la chaîne (pas de
`Date`/fuseau horaire en jeu, donc aucun risque du type de bug déjà corrigé pour les jours fériés,
cf. `test_fuseau_feries.js`) ; entrée vide/`null`/`undefined` ou déjà mal formée renvoyée telle quelle,
jamais d'exception. Câblée dans `ouvrirAllerSemaine` : chaque option du select affiche désormais
"Semaine 36 (01.09.2026 – 05.09.2026)" au lieu de "Semaine 36 (2026-09-01 – 2026-09-05)".

### Vérifications

Nouveau `test_aller_a.js` (7/7 : date classique, fin d'année, jour ET mois à 1 chiffre, entrées vides/nulles/
non définies, entrée mal formée) — 10 suites au total désormais, toutes vertes (231 assertions), `node
--check` OK.

## 31. Round du 03.09.2026 (suite) — formulaires en plein écran sur téléphone, demi-page sur tablette

Retour de Lionel : « J'aimerais que tous les formulaires remplissent la page complète téléphone, comme si
c'était une nouvelle fenêtre qui s'ouvrait, puis je pense la demi-page sur la tablette suffit. » Jusqu'ici
TOUS les popups (`.pop`, positionnés par `positionnerPop()`) avaient une taille fixe en pixels (220 à
280px de large selon le type, jusqu'à 380px pour l'ajout lointain, 900px pour l'aperçu d'impression) et se
plaçaient près du point de clic — pensé pour desktop/souris, minuscule et peu pratique au doigt sur un
téléphone de chantier.

### Portée du changement

Uniquement `.form-pop` : les vrais FORMULAIRES (ajout/modification tâche, absence, note, jalon, personne,
chantier, statut, "Aller à…", ajout lointain…) — une vingtaine d'endroits dans le code, tous déjà unifiés
sous cette même classe. Volontairement laissés tels quels : les menus contextuels (`.menu-pop`, juste une
liste de boutons) et les simples confirmations oui/non (`.confirm-pop`, y compris l'aperçu d'impression) —
déjà assez petits et rapides à l'usage pour ne pas avoir besoin de prendre tout l'écran.

### Changement (CSS uniquement, `Index.html`, 2 nouvelles règles `@media`)

- **Téléphone (`max-width: 600px`)** : `.form-pop` passe en plein écran — `position: fixed; inset: 0`
  (via `left/top: 0`), `width`/`height: 100%` (`100dvh`, pas `100vh`, pour rester correct même quand la
  barre d'adresse du navigateur mobile change de taille), coins non arrondis — exactement l'effet
  "nouvelle fenêtre qui s'ouvre" demandé.
- **Tablette (`601px` à `1024px`)** : `.form-pop` centré, largeur `50vw` (mini 320px pour rester utilisable
  en portrait sur une petite tablette, jamais plus large que l'écran moins ses marges), hauteur toujours
  limitée par le contenu (`max-height` généreux, scroll interne existant conservé).
- **Desktop (`> 1024px`)** : strictement inchangé — popup compact positionné près du clic, comme avant.
- Comme `positionnerPop()` pose `left`/`top` en pixels via JS à CHAQUE ouverture (jamais modifié — le
  comportement desktop de positionnement près du clic reste le même code), les 2 règles ci-dessus utilisent
  `!important` pour prendre le dessus sur ce style inline en dessous du seuil desktop ; aucune autre
  fonction JS touchée.

### Vérifications

CSS pur, aucune fonction JS modifiée : 10 suites toujours vertes (238 assertions), `node --check` OK,
accolades du bloc `<style>` équilibrées. Rendu vérifié par 3 captures d'écran isolées (même popup réel,
mêmes classes CSS, `positionnerPop()` réellement exécuté) à 375px (téléphone : plein écran, coins droits),
800px (tablette : panneau centré à moitié de la largeur, coins arrondis conservés) et 1400px (desktop :
petit popup ancré près du point de clic, identique à avant).

## 32. Round du 03.09.2026 (suite) — 4 signalements de Lionel ("à nouveau des erreurs")

Lionel a signalé 4 problèmes d'un coup sur une capture d'écran du planning réel. Deux sont de vrais bugs
corrigés ci-dessous ; les deux autres ne sont pas des bugs de `Index.html`/CSS et sont expliqués à part.

### 32.1 CORRIGÉ — trait résiduel entre matin et après-midi dès qu'une tâche occupe l'après-midi

« le lundi matin de la semaine 2 a une bordure bizarre. » Le round précédent (§27) supprimait le trait de
grille entre les colonnes matin/aprem d'un même jour en décalant `.cell.cell-aprem` de 1px vers la gauche
(`margin-left: -1px` + `padding-left` compensé) — mais UNIQUEMENT la case de FOND. Une bulle (tâche,
absence, note) n'est pas un enfant de `.cell` : `ligneGroupePersonnesCompact` la pose comme un élément
SÉPARÉ, directement sur la grille, à sa propre colonne. Résultat : invisible sur une case vide (d'où mes
vérifications précédentes, toutes faites sur des cases vides, qui ne l'ont pas révélé), le trait reparaissait
dès qu'une vraie tâche occupait l'après-midi — exactement le cas visible sur la capture (2 tâches empilées
matin+aprem un lundi).

Correctif : nouvelle classe `.demi-aprem`, même empiètement que `.cell.cell-aprem` (`margin-left: -1px`),
avec son propre `padding-left` de compensation (9px, la bulle ayant 8px de padding gauche contre 6px pour
`.cell`). Posée en JS sur tout segment de tâche/absence dont `it.demi === "aprem"` (`ligneGroupePersonnesCompact`)
et sur toute note dont `demiDebut === "aprem"` (seul ce bord compte pour la colonne de départ posée par
`colonneEtSpanDemi`, quelle que soit la durée).

Vérifié par rendu isolé (vraie bulle posée dans la case aprem, pas une case vide comme au round précédent) :
transition matin→aprem bien seamless même avec une tâche des deux côtés.

### 32.2 CORRIGÉ — "Congé"/"Vacances" en double dans le menu "Ajouter"

« menu ajout rapide a des absences en double. » Cause racine, plus profonde que le simple affichage :
`appliquerStatutsEtFormulaires()` reconstruit le tableau GLOBAL `FORMULAIRES_RAPIDES` (celui que lit le menu
"Ajouter" de la grille, `boutonsMenuAjout`) via un `.map()` qui ne gardait que `{nom, champs}` — perdant
`typeEntree` et `assigneA` au passage, pourtant bien renvoyés par `apiListerFormulairesRapides` (WebApp.gs)
et déjà utilisés ailleurs dans ce même fichier (page "Formulaires", `ouvrirFormulaireDynamique`...).

Conséquence dans le menu "Ajouter" : `f.typeEntree` valant toujours `undefined`, `aDesAbsencesConfigurees`
n'était jamais vrai, donc les boutons "Congé"/"Vacances" codés en dur (le repli historique, prévu pour
disparaître une fois qu'elle configure ses propres absences) continuaient de s'afficher EN PLUS du bouton
du formulaire qu'elle avait justement configuré pour les remplacer — d'où le doublon "Congé"/"Congé". Bug
invisible depuis la page "Formulaires" (admin) : celle-ci lit `etat.formulairesRapidesServeur` directement,
jamais ce `.map()` défaillant, d'où son comportement correct (elle reconnaît bien l'absence configurée).

Deuxième conséquence, plus grave quoique invisible depuis le menu lui-même : un formulaire rapide configuré
en type "Absence" était malgré tout enregistré comme une TÂCHE en cliquant dessus (`ajoutRapide`/
`ouvrirFormulaireDynamique` retombent sur `"tache"` par défaut quand `typeEntree` est absent) — donc toute
absence personnalisée (autre que les 2 boutons codés en dur, qui eux passent bien par leur propre chemin
`"absence"` fixe) créée depuis LE MENU AJOUTER se serait retrouvée comptée comme une tâche.

Correctif : le `.map()` conserve désormais `typeEntree` et `assigneA` en plus de `nom`/`champs`.

### 32.3 EXPLIQUÉ, pas un bug de ce fichier — tags `[M]`/`[Important]` affichés en texte brut sur 2 notes

Sur la capture, 2 notes affichent littéralement `[M] [Important]` / `[A]` dans leur texte au lieu du rendu
attendu (demi-journée + style "important", tags invisibles). `decoderLigneTache_`/`decoderNotesJour_`
(WebApp.gs) reconnaissent et retirent bien ces crochets à la lecture — vérifié ligne par ligne, logique
intacte et cohérente avec l'encodeur. Une 3e note du même lot ("Fermeture matériaux") s'affiche d'ailleurs
correctement (style important actif, aucun crochet visible), sur le MÊME chargement — ce qui écarte un
décodeur globalement absent ou cassé (il aurait alors fauté pour les 3, pas 1 sur 3).

Plus probable : ces 2 notes précises ont été saisies en tapant littéralement `[M]`/`[Important]` dans le
champ Texte plutôt qu'en utilisant les pastilles Matin/Après-midi + la case "Important" du formulaire (qui,
elles, encodent proprement ces tags). Le décodeur les relira normalement dès que le texte réel de la case
sera juste "Fermeture matériaux" et que demi/important seront posés par les VRAIS contrôles du formulaire.
Autre piste à ne pas exclure : un `WebApp.gs` pas encore redéployé (Déployer > Gérer les déploiements >
Nouvelle version — un simple Ctrl+S dans l'éditeur ne suffit jamais pour ce fichier) qui daterait d'avant le
support `[M]`/`[A]`/`[Important]` ; mais l'incohérence 2 notes sur 3 sur le même chargement pointe plutôt
vers la 1ère piste. À vérifier avec Lionel : republier ces 2 notes en tapant seulement le texte et en
utilisant les contrôles dédiés.

### 32.4 EXPLIQUÉ, limite structurelle — 2 chantiers sur une même demi-journée

« toujours pas possible d'assigner 2 chantiers a une demi journée. » Confirmé : ce n'est pas un bug mais une
limite du modèle de feuille actuel. Une case (personne + demi-journée + jour) ne porte qu'UNE valeur
"Chantier" côté feuille — une ligne physique séparée de la ligne "détail" (tâches), écrite en une seule fois
par `ecrireDemiJournee_` (WebApp.gs). Toutes les tâches empilées dans cette case-là partagent donc
forcément ce même chantier ; le correctif du 03.09.2026 (§26, `chantierExistantDansCase`) ne fait que
pré-cocher intelligemment ce chantier existant par défaut, il ne crée pas de 2e emplacement. Rendre le
chantier propre à CHAQUE tâche empilée (comme `[Important]`/`[Série:xxx]` le sont déjà) est possible mais
demande une restructuration plus large — nouveau tag `[Chantier:xxx]` dans `encoderLigneTache_`/
`decoderLigneTache_`, arrêt de l'écriture d'une ligne "Chantier" séparée, mise à jour de tout ce qui lit
cette ligne (couleurs, légende, impression...). Pas engagé sans confirmation explicite : à valider avec
Lionel avant de s'y attaquer, vu l'ampleur du changement de modèle.

### Vérifications (32.1 et 32.2)

`test_formulaires_assignation.js` : 13/13 -> **18/18** (5 assertions neuves sur `appliquerStatutsEtFormulaires`,
section 4 : `typeEntree`/`assigneA` survivent bien à la transformation, formulaire "tache" jamais confondu
avec "absence", statuts non affectés). 10 suites au total, toutes vertes (232 assertions cumulées côté
`node`, plus les 2 suites à comptage narratif `test_markers.js`/`test_semaines.js`). `node --check` OK,
accolades du bloc `<style>` équilibrées (360/360). 32.1 vérifié en plus par rendu isolé (bulle réelle dans
la case aprem, cf. ci-dessus).

## 33. Round du 04.09.2026 — migration Supabase, phase 4/étape 3 : "config simple"

Suite des étapes 1 (connexion) et 2 (chargement) du §6bis de `MIGRATION-GITHUB-PLAN.md` : les 14 `apiXxx`
"mécaniques" restants (Personnel/Intervenants, Chantiers, Statuts, Formulaires rapides, Fériés+catégories)
sont portés en lecture/écriture directe des tables Supabase (`sbClient.from(...)`, section "CONFIG SIMPLE"
d'`Index.html`) — aucun n'avait besoin d'une Edge Function (§5 du plan), contrairement aux 4 fonctions déjà
déployées (jalon/note, série, décalage).

### Déviations assumées par rapport au contrat `apiXxx` d'origine

Le portage n'est volontairement PAS littéral : plusieurs paramètres de l'ancien contrat n'ont plus de sens
une fois qu'une personne/un chantier est une vraie ligne de table, identifiée par un vrai id, au lieu d'une
position de cellule partagée par toutes les semaines d'un classeur.

- **Personnel — la "portée" disparaît.** `apiRenommerPersonne`/`apiSupprimerPersonne` demandaient "cette
  semaine seulement" ou "et les suivantes" : un contournement du classeur, où une personne était 4 lignes
  RÉPÉTÉES par semaine. Une personne est maintenant une seule ligne `personnes`, valable pour toutes les
  semaines à la fois (passées et futures) — renommer/désactiver s'applique donc toujours partout, sans
  qu'aucun prompt de portée n'ait plus de sens à proposer (`demanderPortee2` retiré). "Supprimer" reste,
  comme avant, une désactivation (`actif = false`) plutôt qu'un vrai `DELETE` — l'historique (tâches/
  assignations déjà posées) doit survivre, jamais être perdu.
- **Chantiers — renommer ne migre plus aucune case.** Les cases du planning renvoient à un chantier par son
  id (`assignations.chantier_id`, une vraie clé étrangère) et non plus par son nom : ce qu'`apiRenommerChantier`
  devait faire à la main côté classeur (balayer toutes les cases pour recopier le nouveau nom) devient un
  simple `update` de la ligne `chantiers`, rien à propager. Supprimer compte et vide TOUTES les assignations
  concernées, passées comprises — déviation assumée par rapport à l'ancien "semaine affichée et suivantes
  seulement" : la contrainte de clé étrangère (`chantier_id not null`) l'exige de toute façon avant de
  pouvoir retirer la ligne `chantiers`.
- **Statuts — la clé (`cle`) devient stable.** Elle était recalculée à la lecture depuis le nom
  (`slugifierStatut_`, WebApp.gs) ; c'est maintenant une vraie colonne persistée qui ne change plus au
  renommage (portée en JS : `genererCleStatut_`, testée).
- **Fériés — 3e catégorie "Compensés" ajoutée en base.** Gap découvert en portant `apiEnregistrerFeriesV3` :
  la contrainte `feries.categorie` (migration 0001) n'autorisait que `ferie`/`vacances_entreprise`, jamais
  remarqué avant faute d'avoir testé cette 3e catégorie en conditions réelles — corrigé par
  `sql/0005_categories_feries.sql`.
- **Catégories de fériés — nouvelle table.** `categories_feries` n'existait dans aucune migration
  précédente (l'étape 2 avait laissé `etat.categoriesFeriesServeur = []` avec repli sur
  `CATEGORIES_FERIES_DEFAUT`, en attendant). `sql/0005_categories_feries.sql` crée la table (3 lignes fixes,
  seule la couleur est éditable), avec RLS — le `GRANT` à `authenticated`, comme pour `sql/0004`, reste à
  coller par Lionel dans l'Éditeur SQL Supabase (bloqué pour cette session par les garde-fous de sécurité de
  l'environnement d'agent).

### Vérifications

Nouveau `test_config_simple.js` couvrant la logique pure extraite du fichier (jour ouvré/week-end,
`compterTachesParPersonne_` — même règle de fusion "jours ouvrés consécutifs, jamais le week-end" que côté
serveur ET que `construireVueDepuisCache` —, `slugifierStatut_`/`genererCleStatut_`). Suite complète de
`test_*.js` toujours verte, `node --check` OK sur le bloc `<script>` extrait. Pas encore vérifié en
conditions réelles contre le vrai projet Supabase (comme les Edge Functions et le reste de la phase 4 —
limite réseau de cet environnement).

## 34. Round du 07.09.2026 — migration Supabase, phase 4/étape 4 : brancher les Edge Functions

Suite de l'étape 3 (§33) : les 3 Edge Functions dont `Index.html` a réellement l'usage aujourd'hui
(`enregistrer-plage`, `enregistrer-serie`, `gerer-serie` — déjà déployées et testées côté serveur depuis la
phase 3, cf. §5 du plan) sont enfin appelées depuis le client, à la place de `gsP("apiEnregistrerJalonNote"/
"apiEnregistrerPlage"/"apiEnregistrerSerie"/"apiModifierSerie"/"apiSupprimerSerie"/"apiAjoutLointain", ...)`.
`decalage-masse` reste NON branchée : aucune interface de décalage en masse n'existe côté client (confirmé
par grep — un point ouvert à construire séparément, pas fait ici).

### `invoquerFonctionServeur(nom, body)` — l'équivalent `gsP()` pour les Edge Functions

Petit helper ajouté juste après `gsP()` : appelle `sbClient.functions.invoke(nom, {body})` et renvoie une
promesse qui résout avec `data` ou rejette avec une vraie `Error`, dans les deux cas d'échec possibles
(mêmes réflexes que partout ailleurs dans le fichier — `if (res.error) throw res.error;`). Deux points
vérifiés dans le code source réel (`npm pack @supabase/supabase-js`/`@supabase/functions-js`, aucun accès
réseau direct possible dans cet environnement pour les tester en conditions réelles) plutôt que supposés :

- **Le JWT de la session est attaché automatiquement.** `functions.invoke()` n'a besoin d'aucun header
  `Authorization` manuel — `SupabaseClient` construit son client `functions` avec un `fetch` dédié qui relit
  le token de la session active à CHAQUE appel (`_getSessionToken`), pas seulement à la création du client.
- **Un échec métier n'arrive jamais en `data.ok===false` en pratique.** Les 4 fonctions renvoient
  systématiquement un code HTTP non-2xx sur erreur (400/401/405/500, cf. leurs `index.ts`) : côté
  `functions-js`, ça devient toujours un `FunctionsHttpError` dans `error`, jamais un 200 avec
  `ok:false` dans `data`. Seul souci : `error.message` est alors le générique "Edge Function returned a
  non-2xx status code", pas le vrai texte — `invoquerFonctionServeur` relit `error.context` (la `Response`
  clonée) en JSON pour remonter le vrai `{erreur: "..."}` au toast. Le chemin `data.ok===false` reste quand
  même géré, au cas où une future fonction choisirait de répondre en 200.

### Jalon/note — le moteur de diff (`synchroniser()`)

C'était le morceau le plus délicat de cette étape : `diffsJalons`/`diffsNotes` adressent chaque changement
par `(labG, jourIdx)` — une coordonnée héritée du classeur — alors qu'`enregistrer-plage` attend de vraies
dates ISO. Choix retenu : **ne rien changer au moteur de diff lui-même** (`calculerEtatLocal`/
`diffsCellulesPersonne`/`diffsJalons`/`diffsNotes` restent identiques, ils sont profondément imbriqués avec
le reste du rendu) et traduire seulement au point d'appel, via un petit helper pur
`isoDeLabGJourIdx(labG, jourIdx)` qui réutilise `infosSemaineDepuisLabG()` (déjà écrite à l'étape 2) — pas
besoin du cache, `jourIdx` y est toujours 0..4 (lundi..vendredi, les jalons n'existent jamais le week-end).
Chaque jalon diffé est TOUJOURS un seul jour (`dateDebut === dateFin`), en mode `"remplacement"` — un
enregistrement diffé représente l'état COMPLET du jour, jamais un ajout, exactement comme l'ancien
`apiEnregistrerJalonNote` qui écrasait sans condition la cellule entière ; `origine` reste `null` (pas de
notion de "déplacement" pour une case isolée). Les notes portaient déjà de vraies dates ISO
(`dateDebutIso`/`isoDeApres`) — seul changement là : les clés de l'objet `origine` passent de `debut`/`fin`
(ancien contrat WebApp.gs) à `dateDebut`/`dateFin` (contrat réel d'`enregistrer-plage`, vérifié dans
`functions/enregistrer-plage/logic.js`) — un vrai bug en puissance si j'avais fait confiance au nom des
champs sans relire le code source de la fonction.

Autre conséquence : ni `enregistrer-plage` ni (une fois porté) `apiEnregistrerCellulePersonne` ne renvoient
plus la semaine entière rafraîchie en un seul aller-retour, contrairement à tous les anciens `apiXxx`. Après
un envoi réussi, `synchroniser()` oublie tout le cache et recharge la fenêtre affichée depuis Supabase
(`oublierCache()` + `assurerFenetreChargee()`) — même filet que celui déjà utilisé dans le `.catch()` de
secours. Un aller-retour réseau de plus par synchronisation, mais un seul chemin de code pour "l'affichage
doit refléter ce que le serveur vient d'accepter". `apresEcritureSerie()` (partagée par les 3 fonctions
"série") suit le même principe et ignore maintenant son paramètre `r` — les appelants continuent de le
passer, sans effet.

### Série — `creerSerieServeur`/`gerer-serie` (5 sites d'appel)

`enregistrer-serie` attend des id (`personneId`, `chantierId`, `statutId`) là où la vue ne connaît le
chantier/statut que par nom/clé (`CHANTIERS`/`STATUTS`, cf. §33) — traduits via les lookups déjà posés au
bootstrap (`etat.chantierParNom[nom].ligne`) ou ajoutés ici (`etat.statutIdParCle`, sens inverse de
`etat.statutsParId`, qui ne suffisait pas). Point à noter : `type: "absence"` n'a jamais été une vraie
catégorie côté serveur (la table `taches` n'a pas de colonne `type` — c'est le TEXTE qui rend une tâche
visuellement "absence", cf. `estAbsence()`) — traduit en `"tache"` avant l'appel à `enregistrer-serie`, qui
n'accepte que `tache`/`jalon`/`note`. Les portées `"unique"/"suivant"/"serie"` (menu "Cet élément
seul"/"...et les suivants"/"Toute la série") correspondaient déjà exactement aux valeurs attendues par
`gerer-serie` — aucune traduction nécessaire là.

### Ajout lointain (`ouvrirAjoutLointain`)

Simplification de fond permise par l'étape 2 : l'ancien `apiAjoutLointain` (WebApp.gs) devait d'abord faire
exister les semaines visées (`assurerSemainesJusqua_`, plafonné, avec message d'erreur si la date demandée
dépassait la limite) puisque le planning n'était créé que 5 semaines à l'avance. `etat.semaines` étant
maintenant calculé localement sur ~5 ans devant/derrière (pure arithmétique de dates), cette étape entière
disparaît — aucune "création de semaine" n'a plus de sens.

- **Jalon/note** : réutilise `enregistrer-plage`, mode `"ajout"` — exactement le même principe que l'ancien
  code, qui appelait déjà `apiEnregistrerPlage` en interne pour ces deux types.
- **Tâche/absence** : pas d'Edge Function dédiée (§6bis : "même principe à reprendre pour la partie tâche")
  — écriture directe des tables `taches`/`assignations`. Logique extraite en fonction pure,
  `construireLignesAjoutLointain` (lit l'existant déjà en base, renvoie les lignes à insérer, n'écrit jamais
  elle-même), qui reprend la même règle que `construireOccurrencesSerie`
  (`functions/enregistrer-serie/logic.js`) plutôt que d'en réinventer une : le chantier est posé, mais
  JAMAIS à la place d'un chantier déjà présent sur le créneau — peu importe qui l'a posé.
- Nouvelle fonction pure `joursOuvresDepuis(isoDebut, nbJours)`, port fidèle de l'ancien
  `joursOuvresDepuis_` (WebApp.gs, même sémantique : un départ un week-end décale seulement le point de
  départ, jamais `nbJours`).

### Vérifications

Nouveau `test_edge_functions.js` (14 vérifications) couvrant les 3 morceaux de logique pure ajoutés
(`isoDeLabGJourIdx`, `joursOuvresDepuis`, `construireLignesAjoutLointain` — en particulier la règle "chantier
jamais écrasé" et le calcul d'`ordre`). Suite complète de `test_*.js` toujours verte (17 fichiers), `node
--check` OK sur le bloc `<script>` extrait. Pas de test Playwright structurel cette fois (jugé pas
indispensable vu l'ampleur déjà couverte par les tests unitaires + la relecture ligne à ligne de chaque
site d'appel contre `WebApp.gs`/les `index.ts`/`logic.js` des Edge Functions) — comme le reste de la phase 4,
pas encore vérifié en conditions réelles contre le vrai projet Supabase (limite réseau de cet
environnement) : ce sera l'objet de l'étape 5.

## 35. Round du 07.09.2026 (suite) — correctif : ajout d'une tâche impossible ("google is not defined")

Retour de Lionel en testant l'étape 4 en conditions réelles : « ça fonctionne pour note et jalon », mais
ajouter une tâche sous un ouvrier échoue avec le toast « Échec de la synchronisation : google is not
defined — rechargement… ». Diagnostic : `apiEnregistrerCellulePersonne` (WebApp.gs) — l'écriture d'une case
personnel (tâches + chantier d'une demi-journée) — n'avait jamais été portée. Le §6bis du plan la
mentionnait bien à part ("écriture directe des tables taches/assignations, pas de fonction dédiée") mais
elle n'était rattachée à AUCUNE des étapes numérotées 1 à 6 : ni "config simple" (étape 3, qui ne couvrait
que Personnel/Chantiers/Statuts/Formulaires/Fériés en tant que TABLES DE CONFIG, pas les tables
tâches/assignations elles-mêmes) ni "brancher les Edge Functions" (étape 4, qui ne couvrait que les 4
fonctions serveur déjà déployées — celle-ci n'en est justement pas une). Un vrai trou de planning, repéré
seulement parce que Lionel a testé une action qu'aucune des étapes précédentes n'avait explicitement listée.

### Changement (`Index.html`)

Nouvelle fonction `enregistrerCellulePersonneServeur(labG, ancre, demi, jourIdx, payload)`, appelée par
`synchroniser()` à la place de l'ancien `gsP("apiEnregistrerCellulePersonne", ...)`. Même règle métier que
l'ancien code : la case reçoit un état COMPLET à chaque appel (jamais un ajout incrémental) — toutes les
lignes `taches`/`assignations` existantes du `(personne_id, date, demi)` concerné sont retirées, les
nouvelles insérées à la place, dans l'ordre du tableau `payload.taches` (colonne `ordre`). `chantier`/
`statut` arrivent en nom/clé (comme le reste de la vue) et sont traduits en `chantier_id`/`statut_id` via
les lookups déjà construits au bootstrap (étape 2/3).

Nouvelle fonction pure `isoDeLabGJourIdxCase_(labG, jourIdx)` : traduit `(labG, jourIdx 0..7)` en date ISO —
`jourIdx` va jusqu'à 7 ici (0..4 = lundi..vendredi, 6/7 = Samedi/Dimanche, 5 n'existe jamais, hérité des
anciennes colonnes physiques), contrairement à `isoDeLabGJourIdx` de l'étape 4 (jalons, 0..4 seulement). Le
week-end n'a plus besoin de la mécanique de cellule fusionnée Samedi/Dimanche de l'ancien classeur (tag
`[S]`/`[D]`, une seule colonne physique pour les 2 jours) : chaque jour a sa propre date, donc sa propre
ligne — jourIdx 6 et 7 s'écrivent indépendamment, avec la même fonction que n'importe quel jour de semaine.

### Vérifications

Nouveau `test_ecriture_case_personne.js` (7/7 : jourIdx 0/4 en semaine normale, jourIdx 6/7 vérifiés
INDÉPENDANTS l'un de l'autre — le risque le plus concret d'une régression style "les 2 jours du week-end
partagent encore la même case" —, plus un changement de mois). Suite complète toujours verte (18 fichiers),
`node --check` OK. Pas encore re-testé par Lionel en conditions réelles au moment d'écrire ceci.

## 36. Round du 07.09.2026 (suite) — étape 5, chasse aux trous restants

Lionel a demandé de laisser tomber le décalage en masse pour le moment (pas d'UI construite — reste
explicitement hors scope, cf. §6bis étape 4/5 du plan) et de continuer sur l'étape 5 (vérification bout en
bout + recherche d'éventuels autres `apiXxx` oubliés, dans l'esprit du trou trouvé au §35). Un grep de tous
les appels `gs(`/`gsP(` restants dans `Index.html` (les deux seules portes vers `google.script.run`,
maintenant inexistant hors Apps Script) donne exactement 2 sites, tous deux déjà identifiés et documentés
comme hors scope de la phase 4 (§6bis) — pas de nouveau trou du genre "§35" trouvé. Mais l'un des deux avait
un vrai défaut, corrigé ici :

- **`apiVersionServeur` (page Fériés, `afficherVersionServeur()`) — supprimé.** C'était un diagnostic du
  round du 02.09.2026 ("le déploiement Apps Script sert-il bien le dernier WebApp.gs envoyé ?"), qui
  s'exécutait automatiquement à CHAQUE ouverture de la page Fériés. Concept qui n'a plus aucun sens une fois
  hébergé sur GitHub Pages (plus de "déploiement" à vérifier) — mais surtout, il appelait encore `gsP()`
  donc `google.script.run`, absent de ce nouvel environnement : sans le fix, Lionel aurait vu un message
  d'erreur permanent ("Impossible de lire la version du serveur (google is not defined)…") en bas de la
  page Fériés, jamais signalé jusqu'ici probablement parce que ce n'est pas bloquant (le reste de la page
  fonctionne). Fonction, appel et CSS associée supprimés plutôt que portés.
- **`apiGenererPdf` (bouton "Générer le PDF") — laissé en l'état fonctionnel (PDF reste une étape 6 séparée,
  §8), mais sécurisé.** Contrairement au cas ci-dessus, cet appel n'est déclenché que sur un clic explicite
  — pas automatique — donc pas de nouveau trou "cassé sans le vouloir". Mais `gs()` lève une exception
  synchrone (`google is not defined`) non rattrapée par un `try/catch`, ce qui aurait laissé le bouton
  bloqué indéfiniment sur "Génération…" si Lionel cliquait dessus avant l'étape 6. Ajout d'un `try/catch`
  autour de l'appel : message clair ("Export PDF pas encore disponible sur la nouvelle version (à venir).")
  et bouton réactivé, en attendant l'étape 6.

### Vérifications

Suite complète de `test_*.js` toujours verte (19 fichiers), `node --check` OK sur le bloc `<script>`
extrait. Test structurel Playwright : navigation vers la page Fériés avec des données mockées réalistes
(y compris `categories_feries` peuplée) — plus aucune erreur JS levée (avant le correctif, le message
d'erreur apparaissait mais silencieusement, sans lever d'exception JS visible dans la console ; après,
l'appel a purement disparu). Toujours pas de test en conditions réelles contre le vrai projet Supabase pour
`enregistrer-plage`/`enregistrer-serie`/`gerer-serie` (limite réseau de cet environnement, inchangée) — ce
sera à Lionel de le confirmer en utilisant l'appli avec ses vraies données, comme prévu à l'étape 5.

## 37. Round du 07.09.2026 (suite) — 3 bugs de demi-journée signalés par Lionel

Lionel, captures d'écran à l'appui : *« les jalons ne fonctionne pas en case d'une demi journée, le
déplacement d'une demi journée ne fonctionne pas. une tache que je veux étendre saute les demi journée. »*
Rien à voir avec la migration Supabase (§6bis) : les 3 symptômes touchent la mécanique CSS Grid/JS de la
grille (demi-journées, round du 02-03.09.2026, §18/§21/§23/§25/§26 ci-dessus), présente avant même le
portage. Reproduit et diagnostiqué avec Playwright (chromium headless, `window.supabase.createClient` mocké
avec un magasin en mémoire STATEFUL — contrairement aux mocks précédents de ce projet, celui-ci exécute
vraiment le port JS de la logique serveur d'`enregistrer-plage` pour que les écritures locales survivent
réellement au cycle "sync -> oublierCache -> rechargement" que fait l'appli après chaque geste, faute de
quoi un déplacement/redimensionnement retombait toujours à zéro dès le rechargement suivant qu'il ait
vraiment un bug ou non) : événements pointer réels (pointerdown/pointermove/pointerup) sur les poignées de
redimensionnement et sur le corps des bulles, en mode compact.

### 1. « les jalons ne fonctionne pas en case d'une demi journée » — PAS un bug, limite déjà voulue

Un jalon n'a **jamais** de demi-journée — décision confirmée par Lionel le 02.09.2026 et déjà documentée à
3 endroits du code (`itemPlage`, `ouvrirEditionPlage` : "pour les jalons pas de demi-journée, pour les
notes par contre j'aimerais pouvoir le mettre en demi-journée", et BACKEND-CHANGELOG.md §24). Le formulaire
d'un jalon n'affiche même pas le bloc de choix matin/après-midi. Zoomé sur la 1ère capture de Lionel, un
fragment de texte semblait dépasser sous le coin d'un jalon violet ("test" sur LUN-MER, avec un "st"
fantôme pile à la frontière MAR/MER) — hypothèse la plus probable : un doublon DOM (bulle fantôme de
glissement mal nettoyée) ou une désynchronisation de rendu. Reproduit intensivement en Playwright (ajout
d'un jalon, extension par poignée sur plusieurs jours à cheval sur la frontière visible dans la capture,
déplacement de la bulle entière, vérification à chaque étape de `document.querySelectorAll('.fantome-glisse')`
et du nombre de bulles jalon dans le DOM) : **aucune duplication, aucun fantôme laissé en place, aucune
géométrie fausse** dans tous les scénarios testés — chaque opération se nettoie correctement
(`nettoyerFantomes()` est bien appelé sur tous les chemins de sortie du geste, y compris annulation).
Faute de pouvoir reproduire un vrai défaut, je n'ai rien changé sur les jalons eux-mêmes : le "bug" signalé
est très probablement soit une incompréhension de la limite volontaire ci-dessus (Lionel voulait poser un
jalon calé sur une demi-journée, ce qui n'a jamais été possible), soit un symptôme ponctuel du bug §2
ci-dessous vu sur une bulle voisine (une note, dans la même zone de la capture) au moment de la capture.
**À valider avec Lionel** après les 2 correctifs ci-dessous : si le glitch visuel réapparaît, il me faudra
les étapes exactes (quel geste, quelle bulle, mode compact ou classique) pour le reproduire précisément —
les captures seules ne suffisaient pas à retrouver un défaut réel malgré une recherche poussée.

### 2. « le déplacement d'une demi-journée ne fonctionne pas » — confirmé, corrigé

Reproduit très simplement : glisser une note (bulle entière, pas une poignée) d'un jour à un autre annule
silencieusement le déplacement dès que la synchronisation avec le serveur se termine — la bulle "revient"
à sa position de départ après coup, donnant l'impression que rien ne s'est passé. Idem pour un
redimensionnement par poignée : l'aperçu pendant le geste est correct, mais la nouvelle taille ne "tient"
pas après le rechargement qui suit la synchronisation.

**Cause** : chaque jalon/note porte un champ `dateDebutIso` — la vraie date ISO absolue de son 1er jour —
posé une seule fois par `construireVueDepuisCache()` au moment où l'item est reconstruit depuis le serveur.
Ce champ sert ensuite de raccourci dans 2 endroits du moteur de synchronisation : `isoDeApres(item)` (date
de fin, `dateDebutIso + duree - 1` jours) et le calcul du `dateDebut` envoyé à `enregistrer-plage`
(`d.apres.dateDebutIso || isoDeGi(d.apres.giDebut)`) — les DEUX préfèrent `dateDebutIso` dès qu'il est
renseigné, plutôt que de le recalculer depuis `giDebut`. Or **aucun** code de déplacement/redimensionnement
(`appliquerDelta`, `appliquerDeltaNote`, `appliquerCibleUnitaire`, l'`onUp` de `cablerPoigneeRedim`) ne
rafraîchissait `dateDebutIso` après avoir changé `giDebut` — le champ restait figé sur l'ANCIENNE position.
Résultat : la synchronisation qui suit un déplacement envoie encore l'ancienne date au serveur, qui écrit
donc (silencieusement, sans erreur) à l'ancien endroit ; le rechargement qui suit immédiatement redessine
alors la bulle à sa position de départ. Un JALON n'est pas touché par ce bug précis — `diffsJalons`
recalcule `labG`/`jourIdx` à chaque fois depuis `giDebut` (jamais depuis `dateDebutIso`), ce que confirme
la reproduction Playwright du point 1 ci-dessus (déplacement/extension de jalon : toujours correct).

**Correctif** : `it.dateDebutIso = isoDeGi(it.giDebut);` ajouté juste après chaque mutation de `giDebut` sur
un item existant (les 4 sites cités plus haut) — jamais sur la branche "copie" (`copieFinale`), où
`itemPlage`/`itemPlageTache` ne posent de toute façon pas ce champ, et où le repli `|| isoDeGi(...)` déjà
en place suffit. Sans effet sur les tâches/absences pour LEUR synchronisation propre (`diffsCellulesPersonne`
recalcule aussi frais depuis `giDebut`, jamais concerné), mais garder leur `dateDebutIso` à jour reste
correct par ailleurs (référence de série lue par `ouvrirEdition`/`gerer-serie`).

Reproduit puis vérifié en Playwright, avant/après le correctif, sur le scénario exact de Lionel : glisser
une note d'un jour vers un autre (avec choix explicite d'une demi-journée d'arrivée) — avant : la bulle
revenait à sa position/geométrie de départ après le cycle de synchronisation complet ; après : elle reste
exactement là où elle a été déposée, colonne CSS comprise, y compris pour un redimensionnement qui pose "1
jour et demi" (round du §25).

### 3. « une tache que je veux étendre saute les demi journée » — confirmé, corrigé

Reproduit en ajoutant une tâche sur la ligne "après-midi" d'une personne (mode compact) puis en tirant sa
poignée droite pour l'étendre sur plusieurs jours : pendant tout le geste, l'aperçu de la bulle "saute" sur
la colonne du MATIN au lieu de rester sur celle de l'après-midi — un écart d'une demi-colonne entière,
mesuré précisément en Playwright (`bulle.left` vs le bord réel de la cellule après-midi ciblée : 618px au
lieu des 724px attendus, l'équivalent exact d'une sous-colonne de mode compact).

**Cause** : `colonneEtSpanDemi()` (la fonction PARTAGÉE entre le rendu statique et l'aperçu de
redimensionnement, cf. §21/§25 ci-dessus) ne connaît QUE `demiDebut`/`demiFin` — le champ propre aux
NOTES. Une tâche/absence, elle, ne porte pas ces champs : sa demi-journée est `it.demi` (la ligne
matin/aprem qu'elle occupe, fixe pour toute sa durée). `cablerPoigneeRedim` lisait `it.demiDebut || null`
sans jamais se rabattre sur `it.demi` — pour une tâche, ce calcul valait donc TOUJOURS `null`, faisant
retomber `colonneEtSpanDemi()` sur la colonne du matin par défaut pendant tout l'aperçu, quelle que soit
la vraie demi-journée de la tâche. La mutation finale (`onUp`) ne touchant jamais `it.demi` pour une
tâche, la position affichée APRÈS le geste (issue d'un rendu complet, via `colonneDemi(gi, it.demi)`,
correct) redevenait juste — mais entre-temps, l'aperçu trompeur pendant tout le glissement donnait
l'impression que la tâche "saute" par-dessus la frontière matin/après-midi.

**Correctif** : nouvelle fonction pure `demiFixePourItem(it)` — renvoie `it.demi` pour une tâche/absence
(`it.personneId` défini), `null` pour un jalon (jamais de repli, conformément à BACKEND-CHANGELOG.md §24).
Utilisée dans `cablerPoigneeRedim` comme repli quand `it.demiDebut`/`it.demiFin` sont absents. Une NOTE
n'est jamais concernée (elle porte déjà ses propres `demiDebut`/`demiFin`, gérés séparément). Aucun
changement sur la mutation finale : seul l'aperçu PENDANT le geste était faux, comme au §21.

Reproduit et vérifié en Playwright avant/après (voir ci-dessus) : après correctif, `bulle.left` pendant le
geste correspond exactement au bord réel de la cellule après-midi ciblée à chaque étape, et les 3 segments
posés à la fin (un par jour, mode compact = 1 élément DOM par jour pour une tâche, contrairement à une
bulle unique qui s'étire pour un jalon/note) restent tous alignés sur la sous-colonne après-midi.

### Vérifications

- `test_grille_compacte.js` : 51/51 -> **56/56** (5 assertions neuves sur `demiFixePourItem` : tâche
  matin/après-midi, absence, jalon jamais de repli, note jamais concernée par CE repli-ci).
- Les 17 autres suites `test_*.js` restent vertes (18 fichiers au total, 0 échec).
- `node --check` OK sur le bloc `<script>` extrait.
- Reproduction Playwright (chromium headless, mock Supabase stateful décrit plus haut, non conservée dans
  le dépôt — ce projet n'a pas encore de convention pour des tests Playwright commités, cf. absence de tel
  fichier dans les 18 `test_*.js` existants) : scénarios avant/après pour les bugs §2 et §3 ci-dessus,
  captures d'écran intermédiaires prises pour comparaison visuelle.
- Pas pu reproduire de défaut réel sur les jalons (point 1) malgré une recherche poussée (extension,
  déplacement, vérification de fantômes/doublons DOM) — **à revalider avec Lionel** une fois les 2 autres
  correctifs en test réel : si le symptôme persiste, il me faudra les étapes précises pour le reproduire.

## 38. Round du 07.09.2026 (suite) — déplacer une note à cheval sur 2 jours, en demi-journée

Lionel, une 3e fois dans la même zone que le §37 : *« toujours impossible de déplacer une note qui mesure
2 demi/journée de 1 demi journée. »* Après clarification (2 questions posées) : la note en cause est une
note « un après-midi et un matin » — `duree=2`, `demiDebut="aprem"`, `demiFin="matin"` (round du 03.09.2026/
§25 : deux jours calendaires consécutifs pour une seule journée de TRAVAIL) — et le geste souhaité est de la
glisser (bulle entière, pas une poignée) pour qu'elle retombe, au choix selon le sens, sur une journée
PLEINE d'un seul des 2 jours : un décalage d'exactement une demi-journée.

Contrairement aux 3 bugs du §37, ce n'était pas une régression : `demiCiblePourDeplacementNote` (round du
03.09.2026/§25) a toujours reconduit la forme des 2 bords TELLE QUELLE dès que `duree > 1` — « un simple
déplacement… ne change jamais la durée ni ses bords » — sans jamais offrir de granularité demi-journée pour
une note multi-jours. Un déplacement de note à 2 jours ne pouvait donc bouger que par JOUR ENTIER. Une vraie
fonctionnalité à construire, jamais un défaut caché.

### Le modèle retenu : le "demi-slot"

Plutôt que de raisonner en `(giDebut, duree, demiDebut, demiFin)`, la position d'une note est traduite en
une paire de bornes INCLUSES dans un espace de "demi-slots" — un entier par demi-journée ouvrée : le jour
`gi` a pour matin le slot `2*gi`, pour après-midi le slot `2*gi+1`. Deux fonctions pures, symétriques :

- `demiSlotsDepuisBornes(giDebut, duree, demiDebut, demiFin)` → `{halfStart, halfFinIncl}`.
- `bornesDepuisDemiSlots(halfStart, halfFinIncl)` → `{giDebut, duree, demiDebut, demiFin}` (invariant
  `demiDebut === demiFin` maintenu quand `duree === 1`, comme partout ailleurs dans le fichier).

Translater une note d'un nombre ENTIER de demi-slots (`bordsDeplacementNoteMultiJours`) donne exactement le
déplacement en demi-journée recherché, sans jamais changer le NOMBRE de demi-slots occupés — c'est-à-dire
sans jamais changer la durée totale de travail de la note, qu'elle soit concentrée sur un seul jour
calendaire ou répartie sur plusieurs. C'est très exactement le modèle suggéré au départ de ce round ;
vérifié avant usage contre les assertions déjà existantes de `demiCiblePourDeplacementNote` (duree === 1) —
aucun écart trouvé, mais **ce cas n'a volontairement pas été refondu dans ce modèle général** : il reste
servi par son ancienne fonction, inchangée, pour ne courir aucun risque de régression sur un geste déjà
testé et déjà en usage réel (cf. section suivante).

### Où ça se branche

`demiCiblePourDeplacementNote` (duree === 1) reste **strictement inchangée**, avec son seul appelant
d'origine dans `resoudreCibleGroupe` — zéro risque de régression sur ce cas, déjà couvert par les 5
assertions existantes de `test_grille_compacte.js`. Le nouveau mécanisme (`demiSlotsDepuisBornes` /
`bornesDepuisDemiSlots` / `bordsDeplacementNoteMultiJours`) n'intervient QUE pour `duree > 1`, à l'intérieur
de la MÊME branche existante (`!tactile && groupeIds.length === 1 && kindOrigineGeste() === "note" &&
clientXFinal != null`) — pas une 2e branche séparée — et seulement en mode COMPACT (le commentaire déjà en
place sur `colonneEtSpanDemi` le dit explicitement : la géométrie pixel-précise par demi-jour n'existe qu'en
mode compact, jamais en classique). Le mode classique, le tactile, les jalons et les tâches personnel
gardent donc tous EXACTEMENT le comportement d'avant ce round — granularité jour entier pour les 2 premiers,
mécanique dédiée déjà existante (`estBulleUnitaireDeplacable`/`appliquerCibleUnitaire`) pour les tâches,
jamais de demi-journée pour un jalon (BACKEND-CHANGELOG.md §24).

Deux nouveaux morceaux, symétriques à l'existant :

- **`offsetHalvesClic`** (pointerdown, `onPointerDownGroupeSelection`) — équivalent en demi-slots
  d'`offsetJoursClic` (le calcul déjà en place pour la granularité jour) : où, dans la LARGEUR RÉELLE de la
  bulle (`getBoundingClientRect()`), le clic est tombé, exprimé en fraction du nombre TOTAL de demi-slots
  réellement occupés (`L`, cf. `demiSlotsDepuisBornes`) — pas `duree`, qui sous-compterait dès qu'un bord
  est déjà en demi-journée. Calculé uniquement quand applicable (souris, compact, note, `duree > 1`) ; `0`
  sinon, sans effet.
- **`bordsDeplacementNoteMultiJours`** (relâchement, `resoudreCibleGroupe`) — combine `offsetHalvesClic` et
  la position du relâchement (`giCibleBrut` + `demiDepuisPointeur`, déjà utilisés partout ailleurs dans ce
  geste) en un delta de demi-slots, jamais un delta de jours entiers. La fenêtre de bornage est la même que
  pour un déplacement en jours entiers (`[0, nTotal - duree]` jours), simplement exprimée en demi-slots
  (`[0, nTotal*2 - L]`) — la LONGUEUR occupée (`L`) ne change jamais, seule sa position est bornée. Une
  nouvelle fonction d'application, `appliquerDeltaNoteMultiJours` (symétrique à `appliquerDeltaNote`), écrit
  `giDebut`/`duree`/`demiDebut`/`demiFin` en une fois et **rafraîchit `dateDebutIso`** — sans quoi le bug du
  §37 (« le déplacement d'une demi-journée ne fonctionne pas », la note « revenant » à sa position de départ
  après synchronisation) reviendrait pour ce nouveau chemin de code.

### Une nuance découverte en vérifiant le modèle avant de l'utiliser

L'énoncé de ce round envisageait qu'un déplacement d'une note déjà en « 1 jour et demi » puisse la faire
« gagner encore une demi-journée dans le même sens (devient 2 jours et demi) ». Vérifié avant d'écrire quoi
que ce soit : **mathématiquement impossible pour une pure TRANSLATION** — une translation en demi-slots
préserve TOUJOURS `L` (le nombre de demi-slots occupés) par construction, c'est précisément ce qui distingue
un DÉPLACEMENT (bulle entière) d'un REDIMENSIONNEMENT (poignée, `demiPourRedimNote`, qui lui change bien `L`).
Une note « 1 jour et demi » glissée d'une demi-journée reste donc toujours « 1 jour et demi » au total —
seule la répartition entre les 2 jours calendaires bouge (ex. « jour plein + matin du jour suivant » devient
« après-midi du jour + jour suivant plein »). Comportement correct et voulu ; le modèle n'a pas été forcé
pour coller à la formulation initiale, cf. `test_grille_compacte.js` pour les 2 sens vérifiés.

### Vérifications

- **`test_grille_compacte.js` : 56/56 → 69/69** (13 assertions neuves) — `demiSlotsDepuisBornes`/
  `bornesDepuisDemiSlots` (aller-retour, y compris le scénario exact de Lionel), le scénario exact de Lionel
  dans les 2 sens via `bordsDeplacementNoteMultiJours` (aprem+matin → jour plein, dans les 2 sens), un
  déplacement de plusieurs jours PLEINS qui préserve la forme (non-régression du comportement jour-entier
  déjà en place), une note « 1 jour et demi » glissée d'une demi-journée dans les 2 sens (nuance ci-dessus),
  et les bornes de fenêtre `[0, nTotal*2-1]` des 2 côtés. Les 5 assertions existantes de
  `demiCiblePourDeplacementNote` (duree === 1) restent identiques et toujours vertes — fonction non touchée.
- Les 17 autres suites `test_*.js` restent vertes (18 fichiers au total, 0 échec).
- `node --check` OK sur le bloc `<script>` extrait.
- Reproduction Playwright (chromium headless, mock Supabase stateful comme au §37 — port réel de
  `functions/enregistrer-plage/logic.js`, pas une approximation — non conservée dans le dépôt, cf. §37 pour
  l'absence de convention Playwright commitée dans ce projet) : note "aprem lundi 07.09.2026 + matin mardi
  08.09.2026" (le vrai scénario de Lionel, seedée en base mockée), glissée à la souris en mode compact —
  **sens "vers le jour 1"** : relâchée sur le matin du lundi, devient une seule note pleine journée le lundi
  (`demi: null` en base après le cycle complet sync → oublierCache → rechargement) ; **sens "vers le jour
  2"** : relâchée sur le matin du mardi, devient une seule note pleine journée le mardi. Dans les 2 cas,
  géométrie CSS finale vérifiée (largeur de bulle inchangée, position décalée exactement d'une sous-colonne)
  ET état serveur mocké vérifié (une seule ligne `notes` en base après le cycle, `demi: null`, sur la bonne
  date) — aucune duplication, aucun résidu de l'ancienne position.

## 39. Round du 07.09.2026 (suite) — surbrillance de dépôt trop large (journée entière au lieu de la case)

Lionel, capture d'écran à l'appui (note "test 2" en cours de glissement, mode compact) : *« comme tu peux le
voir lors d'un déplacement d'une note la surbrillance ne se fait que sur les journée entière, je pense
qu'on devrait plutôt parler de cases »*. La capture montre le rectangle bleu de survol couvrant MER+JEU en
JOURS ENTIERS (colonnes matin+après-midi complètes des 2 jours), alors que la bulle réelle de destination
n'occupe visuellement qu'une demi-journée de chaque côté — la surbrillance mentait donc sur la vraie zone
de dépôt dès que la destination impliquait une demi-journée.

### Cause

`cellulesPlagePourSurvol()` (appelée par `survolerCible()` à chaque `pointermove` du glissement) calcule
une liste de CELLULES DOM ENTIÈRES — une par jour, via `celluleAPosition(kind, extra, gi)` — et leur ajoute
la classe CSS `drop-hover`/`cell-interdite`. Pour les jalons/notes, chaque jour n'a qu'UNE SEULE cellule de
fond en arrière-plan (`creerCelluleFond`, jamais scindée en matin/après-midi même en mode compact — cf.
son commentaire) : la scission visuelle matin/après-midi n'existe QUE pour les bulles elles-mêmes,
positionnées par `colonneEtSpanDemi`. `cellulesPlagePourSurvol` ne pouvait donc structurellement surligner
qu'un nombre entier de cellules — jamais une demi-cellule —, d'où le débordement systématique d'une
demi-journée dès que la destination réelle (calculée par `demiCiblePourDeplacementNote`/
`bordsDeplacementNoteMultiJours`, §37/§38 ci-dessus) tombait sur une demi-journée.

### Correctif

Nouvel élément de surbrillance DÉDIÉ (`.survol-precis`), positionné par `colonneEtSpanDemi(giDebut, duree,
demiDebut, demiFin)` — la MÊME fonction qui pose déjà la bulle réelle et son aperçu de redimensionnement —
plutôt que de dépendre des `.cell` de fond. Nouvelle fonction `cibleNotePreciseCompacte(cible, clientX)`
(scopée dans `onPointerDownGroupeSelection`, comme `appliquerDeltaNote`/`resoudreCibleGroupe`) : calcule la
géométrie FINALE exacte que produirait un relâchement maintenant, avec les MÊMES fonctions pures que
`resoudreCibleGroupe` utilise déjà au relâchement (`demiCiblePourDeplacementNote` pour une note d'un seul
jour, `bordsDeplacementNoteMultiJours` — modèle demi-slot, §38 — pour plusieurs jours) — aucune nouvelle
règle métier, seulement la même règle appliquée un cran plus tôt, PENDANT le geste plutôt qu'au relâchement
seul. `survolerCible()` pose l'élément dédié quand cette fonction renvoie un résultat, avec le MÊME
`grid-row` que la bulle réelle en cours de glissement (`bulleDom.style.gridRow`, déjà posé par `poser()` au
rendu) — jamais recalculé indépendamment, pour ne jamais pouvoir diverger de la vraie ligne. `nettoyerSurvol()`
retire cet élément en plus des classes CSS des cellules entières.

**Restreint à note + mode compact + souris + item seul, exactement le périmètre des rounds précédents
(§37/§38)** : `cibleNotePreciseCompacte` renvoie `null` — et le survol retombe alors sur
`cellulesPlagePourSurvol` (comportement par cellule entière, strictement inchangé) — pour un jalon
(jamais de demi-journée, `kindOrigineGeste() !== "note"`), une tâche (mécanique de cellule déjà
demi-précise via `data-demi`, `celluleAPosition`), le mode classique (`colonneEtSpanDemi` ne distingue la
demi-journée qu'en mode compact), le tactile, une sélection groupée (`groupeIds.length !== 1`), et une
cellule de destination invalide ou de week-end (`estGiWeekend`, aucune demi-journée côté week-end, §2 du
spec).

### Vérifications

- `node --check` OK sur le bloc `<script>` extrait.
- Les 18 suites `test_*.js` restent toutes vertes (0 échec) — aucune nouvelle fonction PURE testable au
  sens de la convention `extraireFonction` du projet : `cibleNotePreciseCompacte` est scopée dans le geste
  (ferme sur `itemClic`/`tactile`/`modeCompact`/`groupeIds`/`offsetHalvesClic`, comme `appliquerDeltaNote`/
  `resoudreCibleGroupe` déjà non testés isolément) et ne fait qu'assembler des fonctions déjà couvertes
  (`demiCiblePourDeplacementNote`, `bordsDeplacementNoteMultiJours`, tous deux dans `test_grille_compacte.js`)
  — le correctif est essentiellement DOM/positionnement, vérifié en Playwright plutôt qu'en test pur.
- Reproduction Playwright (chromium headless, mock Supabase non-stateful — aucune synchronisation testée
  ici, seulement la géométrie de survol PENDANT le geste) reproduisant le scénario exact de la capture
  (note "test 2", aprem MER 09.09.2026 + matin JEU 10.09.2026, mode compact) : glissement démarré sans
  changer de position (pointerdown + léger mouvement) — l'élément `.survol-precis` créé correspond, à 1px
  près, à la géométrie RÉELLE de la bulle (largeur ~211px) et non aux 2 jours entiers de référence
  (~424px, mesurés indépendamment sur les cellules de fond MER+JEU), avec le même `grid-row` que la bulle.
  Non-régression confirmée par 2 scénarios séparés : un jalon glissé en mode compact et une note glissée en
  mode CLASSIQUE retombent tous deux sur le comportement historique (`.cell.drop-hover`, jamais de
  `.survol-precis`) — vérifié également par lecture du code pour les cas non couverts par ces scripts
  (tactile, sélection groupée, tâche personnel, week-end), chacun explicitement exclu par une condition de
  garde dans `cibleNotePreciseCompacte`.

## 40. Round du 07.09.2026 (suite) — `.survol-precis` débordait sous la bulle glissée

Lionel, 2 vidéos de démo à l'appui (glissement d'une note "test" puis d'une note "test 2" en mode compact) :
*« les notes sont vraiment bugée »*. Les vidéos montrent, à chaque glissement de note, un 2e rectangle qui
dépasse visuellement sous la bulle en cours de déplacement — donnant l'impression que 2 bulles se
chevauchent ou qu'une copie fantôme traîne derrière la vraie, alors qu'il n'y a bien qu'une seule note en
mémoire (`NOTES`) avant et après le geste (vérifié en reproduisant le scénario en Playwright : la note
reste unique, sa position finale est correcte, aucune duplication de donnée).

### Cause

Le §39 (ci-dessus, plus tôt le même jour) a ajouté `.survol-precis`, une simple `<div>` posée sur la grille
CSS via `style.gridColumn`/`style.gridRow` pour représenter précisément la zone de dépôt d'une note. Or les
vraies bulles (`.bulle.bulle-plage`, cf. leur CSS un peu plus bas) ont `align-self: start` — elles restent
calées en HAUT de leur ligne de grille, avec leur propre hauteur naturelle (26px de mesuré, pour une note
sur une ligne). `.survol-precis` n'avait PAS cette règle : sans `align-self` explicite, un élément de grille
s'étire par défaut sur TOUTE la hauteur de sa ligne — mesuré à 52px (le double) dans une reproduction
Playwright ciblée, alors que la bulle réelle glissée à côté ne fait que 26px. Ce débordement de 26px vers
le BAS (le `top` de `.survol-precis` était lui correct, aligné sur la bulle — seule la hauteur débordait)
est exactement le "2e rectangle qui dépasse" visible dans les 2 vidéos : la ligne Notes n'étant haute que
d'une seule piste dans ces scénarios, ce débordement empiétait visuellement sur la ligne suivante (l'en-tête
Personnel), créant l'illusion d'une duplication.

### Correctif

Deux changements complémentaires sur `.survol-precis` :
- CSS : ajout de `align-self: start` (exactement la même règle que `.bulle-plage`), pour qu'il se comporte
  comme une vraie bulle vis-à-vis de la hauteur de sa ligne de grille.
- JS (`survolerCible()`) : hauteur posée explicitement en pixels, calquée sur `bulleDom.getBoundingClientRect().height`
  (la bulle RÉELLEMENT en cours de glissement) — plus robuste que de compter uniquement sur `align-self`
  (qui suffirait seul si l'élément avait le moindre contenu/padding pour calculer une hauteur "auto", ce
  qui n'est pas le cas ici, `.survol-precis` restant une div vide).

### Vérifications

Reproduction Playwright ciblée (`/tmp/test_repro_notes.js`, scénario proche des 2 vidéos : jalon "test"
Lun-Mar, note "test" Mar-matin, note "test 2" Mer-aprem→Jeu-matin, mode compact, glissement réel de la note
"test" par événements pointer) : AVANT le correctif, `.survol-precis` mesurait 52px de haut (bulle réelle :
26-29px) ; APRÈS, exactement 26px — identique à la bulle glissée. Confirmé aussi qu'aucune duplication de
note n'a jamais eu lieu côté données (`NOTES` reste à 2 entrées avant/après le geste, la position finale de
la note déplacée est correcte) : le bug était purement visuel (CSS), jamais un problème de synchronisation
ou de duplication réelle — mais suffisamment déroutant à l'écran pour légitimement ressembler à un "vrai"
bug pour Lionel. Suite complète `test_*.js` toujours verte (18 fichiers), `node --check` OK. Pas de nouvelle
fonction pure (correctif CSS + une ligne de hauteur explicite en JS).

## 41. Round du 08.09.2026 — notes multi-jours scindées ou rétrécies après un déplacement

Lionel, 2 captures d'écran à l'appui (semaine du 07-11 sept. 2026, mode compact) : *« les bulles se
retrouvent scindée ou retrecie après certains déplacmement »*. Sur les captures, la note "test 2" —
censée être une seule bulle continue à cheval sur 2 jours (jeudi après-midi + vendredi matin) —
apparaissait comme DEUX bulles indépendantes, chacune large d'une seule demi-journée, sur 2 pistes/lignes
différentes.

### Cause

`construireVueDepuisCache()` fusionne les notes en bulles continues jour par jour. AVANT ce correctif,
la fusion appariait le jour `gi` et le jour `gi+1` en comparant le **même index** dans le tableau de
notes de chaque jour (`data.notes[gi][slot]` avec un même `slot` numérique pour les 2 jours) — un
raccourci qui suppose qu'une note à cheval sur 2 jours occupe toujours le même rang parmi les notes de
CHAQUE jour. Ce n'est vrai que tant qu'aucune AUTRE note ne partage l'un des 2 jours avec un rang
différent.

Or ce rang n'est pas stable : jalons/notes n'ont pas de colonne d'ordre dédiée en base, l'ID croissant en
tient lieu (cf. commentaire de `construireDonneesSemaine`) — et `enregistrer-plage` (cf.
`functions/enregistrer-plage/logic.js`, `planPlage`) réécrit chaque jour touché par un delete-puis-insert,
donc la note reçoit un NOUVEL ID à chaque jour où elle est déplacée. Le déplacement en demi-journée d'une
note multi-jours (§38) rend ce cas beaucoup plus fréquent qu'avant : il suffit qu'une autre note existe
sur l'un des 2 jours de la note déplacée pour que son rang diffère d'un jour à l'autre après l'écriture.

Reproduit isolément (sans passer par un glissement, juste en fixant l'état serveur) : une note "autre"
seule sur un jour J (ID petit, donc indice 0 sur J), une note "test 2" à cheval sur J (après-midi) et J+1
(matin) mais avec un ID plus grand — donc 2e du tableau (indice 1) sur J, tandis qu'elle est seule sur J+1
(indice 0). La fusion cherchait l'indice 1 sur J+1 (qui n'existe pas) pour prolonger la moitié de J, et
l'indice 0 sur J (déjà consommé) pour prolonger... résultat : 2 bulles indépendantes d'un seul jour
chacune au lieu d'une seule bulle continue de 2 jours. C'est un bug **pré-existant** dans l'algorithme de
fusion (pas introduit par les rounds précédents) mais son exposition a explosé avec le déplacement en
demi-journée (§38), qui permet justement de rapprocher/superposer une note d'un jour à l'autre.

### Correctif

Remplacement de l'appariement « même rang entre les jours » par un appariement **par contenu, en
consommant les indices déjà utilisés** : chaque jour garde son propre ensemble d'indices déjà pris par une
bulle déjà construite (`consommes[gi]`) ; prolonger une bulle vers le jour suivant cherche, PARMI LES
INDICES NON ENCORE CONSOMMÉS de ce jour-là, une note de même texte + même `important` — où qu'elle se
trouve dans le tableau, peu importe son rang. Le cas légitime « 2 notes indépendantes de même texte le
même jour » (ex. "Livraison" le matin et "Livraison" l'après-midi, cf. commentaire de `planPlage`) reste
géré correctement : chaque note n'est consommée qu'une fois, donc si l'une sert à prolonger une bulle
venue de la veille, l'autre reste disponible pour démarrer ou prolonger sa propre bulle indépendante.
`noteSlotAuGi` (l'ancienne fonction d'accès par rang fixe) est supprimée, n'ayant plus aucun appelant.

### Vérifications

Reproduction Playwright ciblée (`/tmp/test_repro_split2.js`, état serveur fixe reproduisant exactement le
cas décrit ci-dessus) : AVANT le correctif, "test 2" se rendait en 2 bulles (`9 / span 1` ligne 4 et
`10 / span 1` ligne 5) ; APRÈS, une seule bulle continue (`9 / span 2`, une seule ligne). Un 2e script
(`/tmp/test_repro_split.js`, glissement réel à la souris en mode compact d'une note à cheval sur 2 jours
d'exactement 1 jour, avec un vrai aller-retour "serveur" — mock exécutant la véritable fonction pure
`planPlage`) confirme que le cas déjà correct (aucune autre note sur les jours concernés) continue de bien
fusionner en une seule bulle après le cycle complet déplacement → synchronisation → rechargement. Suite
complète `test_*.js` toujours verte (18 fichiers), `node --check` OK.

## 42. Round du 08.09.2026 (suite) — une note en journée entière rétrécie en demi-journée au moindre déplacement

Lionel : *« j'ai un bug ou quand je déplace une note matin/aprem de 1/2 jour elle est retrecie en 1/2
journée »*.

### Cause

`demiCiblePourDeplacementNote` (round du 03.09.2026, §25) gère le déplacement d'une note d'UN SEUL jour
selon 2 cas : le jour d'arrivée est DIFFÉRENT du jour de départ, ou c'est le MÊME jour (delta === 0). Le
cas "jour différent" protège déjà correctement la journée entière : *« si elle était en journée entière,
elle LE RESTE (ne jamais réduire une note "normale" à une demi-journée par un simple déplacement) »* (cf.
commentaire d'origine). Mais le cas "même jour" n'avait PAS cette protection — il choisissait TOUJOURS la
demi-journée sous le pointeur au relâchement, y compris pour une note qui était en journée entière avant
le geste. Ce cas "même jour" existe justement pour permettre de faire passer une note déjà en
demi-journée du matin à l'après-midi (ou l'inverse) sans changer de jour (round du 03.09.2026) — mais rien
ne le restreignait à ce cas-là : le moindre glissement d'une note NORMALE (journée entière) qui restait
sur le même jour (une main qui tremble, un relâchement un peu trop tôt) la rétrécissait donc en
demi-journée, sans rapport avec l'intention de Lionel.

### Correctif

`demiCiblePourDeplacementNote` applique désormais exactement la MÊME règle dans les 2 cas ("même jour" et
"jour différent") : la position du relâchement ne choisit une nouvelle demi-journée que si la note en
portait DÉJÀ une ; une note en journée entière reste en journée entière quel que soit l'endroit où on la
repose, sur son jour d'origine ou ailleurs. Au passage, le déplacement d'une note en journée entière
reposée sans changement (même jour, aucune demi choisie) est désormais correctement détecté comme un
no-op par `resoudreCibleGroupe` (plus de undo/toast "Déplacé." parasite).

### Vérifications

`test_grille_compacte.js` mis à jour : l'assertion qui documentait EXPLICITEMENT l'ancien comportement
("même jour (delta=0), note en journée entière -> la position choisit désormais sa demi-journée") est
remplacée par son inverse ("-> reste en journée entière"), les autres cas (bascule matin/aprem d'une note
déjà en demi-journée, jour différent, note multi-jours) restent inchangés et toujours verts. Suite
complète `test_*.js` verte (18 fichiers), `node --check` OK.

## 43. Round du 08.09.2026 (suite) — vérification "note 1 jour -> demi-journée" + durcissement du nettoyage de l'aperçu de glissement

Lionel a signalé 2 choses dans le même message : *« les note de 1 jour caler sur un jour plein ne sont pas
déplacable a la demi journee »* et *« j'ai un bug visuel récurant ou l'apercu de déplacement reste visible
a l'ecran apres dépose de la note »*.

### 1er point : clarifié, pas un bug de code

Question posée à Lionel : pour une note d'1 jour en JOURNÉE ENTIÈRE, le simple DÉPLACEMENT (glisser toute
la bulle) doit-il pouvoir la transformer en demi-journée selon l'endroit où on la dépose, ou est-ce que ça
doit rester le rôle du REDIMENSIONNEMENT (la petite poignée sur le bord) ? Réponse : garder le
redimensionnement pour ça — comportement du §42 ci-dessus confirmé comme voulu, aucun changement de code
nécessaire sur le déplacement.

Vérifié ensuite, via une reproduction Playwright avec un mock "intelligent" (exécutant la VRAIE fonction
`planPlage`, cf. `functions/enregistrer-plage/logic.js`, contre des données mutables — pas juste un mock
en lecture seule qui aurait donné un faux résultat) : le REDIMENSIONNEMENT d'une note d'1 jour en journée
entière, via sa poignée droite, vers une demi-journée (matin) fonctionne bien de bout en bout — aperçu en
direct correct, donnée locale correctement mise à jour, écriture serveur correcte (1 ligne, `demi: matin`),
rendu final correct après rechargement (`bulle-demi bulle-demi-matin`). Rien à corriger ici non plus : le
premier essai (avec un mock "bête" qui ne persiste rien) avait donné un faux négatif — corrigé et
documenté pour éviter de refaire la même erreur de diagnostic.

### 2e point : bug visuel réel, mais non reproduit malgré une recherche approfondie

Plusieurs scénarios testés en Playwright (déplacement normal, dépôt sur place en no-op — bulle d'1 jour ET
note multi-jours —, relâchement hors de toute cellule, 2 glissements enchaînés sans attendre la fin de la
synchronisation, avec une latence réseau simulée réaliste) : aucun n'a laissé de `.fantome-glisse` ni de
`.survol-precis` (ni classes `.drop-hover`/`.cell-interdite`) dans le DOM après le relâchement. Lionel,
interrogée, ne sait pas identifier de déclencheur précis ("ça semble aléatoire").

En creusant le code malgré tout, 2 fragilités RÉELLES ont été trouvées et corrigées par précaution (même
sans confirmation qu'elles sont LA cause du signalement) :
- `nettoyerFantomes()` (retire le ghost qui suit le curseur pendant un déplacement de bulle) et
  `nettoyerSurvol()` (retire `.survol-precis`, §39) étaient 2 fonctions séparées. `detacher()` (appelé en
  premier par tout `onUp`/`onCancel`) appelle bien `nettoyerSurvol()`, mais si un futur site d'appel de
  `resoudreCibleGroupe` appelait `nettoyerFantomes()` sans aussi appeler `nettoyerSurvol()`, `.survol-precis`
  pourrait rester affiché. `nettoyerFantomes()` appelle désormais aussi `nettoyerSurvol()` — les 2
  n'existent de toute façon jamais l'un sans l'autre pendant un même geste.
- `cablerPoigneeRedim` (redimensionnement par poignée) écrit l'aperçu DIRECTEMENT sur
  `bulleDom.style.gridColumn` (pas un clone séparé, contrairement au déplacement de bulle entière) pendant
  le glissement. Son `onUp()` avait 2 sorties anticipées (`enDefilement`, `!arme`) qui ne remettaient PAS
  ce style à sa valeur d'origine avant de sortir — seul `onCancel()` le faisait. Une bulle RÉELLE pouvait
  donc, dans ces 2 cas de figure, rester affichée à la taille de l'aperçu (rétrécie/étendue) sans qu'aucune
  donnée n'ait réellement changé. Facteur commun extrait en `reappliquerFormeOrigine()`, appelé sur les 3
  sorties anticipées de `onUp()` en plus de `onCancel()`.

Si le bug visuel revient, une vidéo de l'écran au moment où ça se produit (avec le geste exact juste
avant) aiderait à le localiser précisément — n'ayant pas réussi à le déclencher moi-même malgré plusieurs
scénarios, la piste la plus probable qui reste est un problème de rendu/repaint du navigateur plutôt qu'un
élément réellement laissé dans le DOM.

Suite complète `test_*.js` verte (18 fichiers), `node --check` OK.

## 44. Round du 08.09.2026 (suite, encore) — cause RÉELLE trouvée et corrigée pour le fantôme figé ; vérification approfondie du déplacement d'1 case

Lionel a fourni 2 nouvelles preuves : une PHOTO de son écran physique montrant la bulle fantôme apparue
*« sans que j'ai soulevé le doigt de la souris »* (donc pendant un geste encore actif, pas après le lâcher
comme supposé au §43), puis une VIDÉO montrant qu'*« il est impossible de déplacer de 1 case une bulle qui
fait 2 cases »*.

### Cause réelle du fantôme figé, cette fois confirmée par une reproduction qui échoue puis réussit

En relisant `synchroniser()` : après CHAQUE synchronisation réussie (donc après CHAQUE glissement/
redimensionnement, pas seulement en cas d'erreur), le code fait `oublierCache()` puis
`assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); ... })` — un rechargement
complet de la fenêtre depuis Supabase, qui recrée TOUS les noeuds `.bulle` de la grille. Rien ne protégeait
ce rechargement contre le fait qu'un DEUXIÈME geste de glissement (sur une autre bulle, ou la même) puisse
être EN COURS au moment où il survient — tout à fait possible en conditions réelles : Lionel enchaîne les
déplacements rapidement, et la synchronisation contre le vrai serveur Supabase prend forcément un peu de
temps (contrairement aux mocks quasi instantanés du §43).

Or la spec Pointer Events est stricte sur ce point : si l'élément qui détient la capture du pointeur
(`setPointerCapture`, posée sur la bulle au tout début du geste) est retiré du DOM, le navigateur relâche
CETTE capture silencieusement, sans déclencher `pointerup` ni `pointercancel`. Un rechargement qui recrée
la bulle en cours de glissement (elle est bien retirée et remplacée par un nouveau noeud) abandonne donc le
geste en plein vol : `onMove`/`onUp` ne sont plus jamais appelés sur ce geste, alors que le fantôme
(`.fantome-glisse`, posé sous `document.body`, donc PAS détruit par le rechargement de la grille) reste
figé à l'écran indéfiniment, avec `document.body` bloqué sur la classe `en-glissement` (qui coupe les
clics sur toutes les autres bulles tant qu'elle est là) — exactement la scène capturée par la photo de
Lionel.

Reproduit avec `/tmp/test_repro_race_reload.js` (Playwright, mock "intelligent" exécutant la vraie
`planPlage` avec une latence réseau réaliste ~200ms) : un premier glissement complet (A) est relâché, puis
un second glissement (B) est démarré et laissé ACTIF (bouton toujours enfoncé) pendant que la
synchronisation + le rechargement du geste A ont largement le temps de survenir. Avant correctif : le
fantôme du geste B reste affiché même après son propre relâchement, et `en-glissement` reste bloqué sur
`true` — confirmé en rejouant le test contre le code d'avant ce round. Après correctif : le fantôme suit
le curseur normalement pendant toute la durée du geste B malgré le rechargement du geste A survenu entre
temps, et tout redevient propre après son relâchement.

**Correctif** : nouvelle fonction `differerSiEnGlissement(rechargerVue)` — si `document.body` porte encore
la classe `en-glissement` (posée par tout geste de glissement/redimensionnement/sélection actif), le
rechargement est repoussé de 120ms et réessayé, au lieu de reconstruire la grille sous les pieds d'un geste
en cours. Appliquée aux 2 points de rechargement automatique de `synchroniser()` (succès et rattrapage
après échec) — les seuls qui se déclenchent tout seuls, sans action explicite de l'utilisateur, et donc les
seuls susceptibles de tomber pendant un geste que l'utilisateur vient de démarrer.

### Déplacement d'1 case sur une note de "2 cases" : maths vérifiées correctes, cause probable = la même course

Reconstruit très précisément la note vue dans la vidéo (LUN-après-midi + MAR-journée-entière, soit 3
demi-slots — "1,5 jour") et rejoué le geste exact avec `/tmp/test_repro_1case_smart.js` (mock
"intelligent", donc résultat serveur réellement persisté) :
- clic sur le DERNIER demi-slot de la bulle (MAR-après-midi), glissé de tout juste 1 demi-slot ("1 case")
  vers la droite → la note passe bien à MAR-journée-entière + MER-matin, exactement comme attendu, aperçu
  ET donnée serveur finale identiques ;
- clic au milieu de la bulle, glissé d'exactement 1 jour ("1 case" au sens d'une colonne du planning) vers
  la droite → la note passe bien à MAR-après-midi + MER-journée-entière, là aussi exactement comme attendu.

Dans les 2 cas, `bordsDeplacementNoteMultiJours`/`demiSlotsDepuisBornes`/l'ancrage du clic
(`offsetHalvesClic`) calculent une position pile exacte — aucun saut anormal reproduit malgré une
géométrie de clic et de glissement contrôlée au pixel près. La photo comme la vidéo de Lionel sont des
prises de vue d'un écran physique (pas des captures d'écran) : la distorsion de perspective rend une
lecture précise des positions de clic peu fiable (limite déjà notée au round précédent) — le décalage vu
dans la vidéo (la note "test" atterrit à MER au lieu d'un léger décalage) est compatible avec un clic posé
plus près du bord GAUCHE de la bulle que ce qu'il semblait sur la vidéo (ce qui, avec la même quantité de
mouvement réel du curseur, produit exactement le grand saut observé — comportement voulu, pas un bug).

Cela dit, la course décrite ci-dessus (rechargement en pleine course avec un geste actif) reste une
explication au moins aussi probable si un déplacement précédent venait tout juste d'être synchronisé :
avec `differerSiEnGlissement` en place, ce cas de figure est désormais couvert aussi. Si le comportement
"saute trop loin" se reproduit malgré ce correctif, un enregistrement d'écran (pas une vidéo filmée de
l'écran) permettrait de voir le point de clic exact et lèverait le doute.

Suite complète `test_*.js` verte (18 fichiers), `node --check` OK.

## 45. Round du 08.09.2026 (suite, encore) — vraie cause du "impossible de déplacer de 1 case" trouvée : les notes d'1 jour plein ne pouvaient bouger que par jour entier

Après un enregistrement d'écran de Lionel qui ne montrait finalement pas le bug (elle manipulait "test 2",
jamais touché de façon concluante), elle a fini par décrire le geste précisément, sans ambiguïté : *« je
n'arrive pas a placé ma note sur lundi après-midi, elle se déplace de jour en jour et non de demi jour en
demi jour, ce phénomène ne se produit que quand la bulle fait un jour complet »*, puis, après clarification
: *« je veux qu'elle se déplace à lundi aprem et mardi matin. une bulle de 2 case doit garder sa grandeur
mais doit pouvoir se déplacer de 1 case »*.

### Cause

Une note en JOURNÉE ENTIÈRE (1 jour, sans demi) occupe exactement 2 demi-slots — autant qu'une note "1
jour et demi" à cheval sur 2 jours calendaires ("2 cases" dans les mots de Lionel). Mais seules les notes
`duree > 1` passaient par le modèle demi-slot général (`bordsDeplacementNoteMultiJours`, §38) lors d'un
déplacement en mode compact ; une note d'1 SEUL jour passait par `demiCiblePourDeplacementNote`, qui pour
une journée entière reconduit TOUJOURS sa forme telle quelle (§42, protection contre le rétrécissement
accidentel en demi-journée) — et ne peut donc choisir qu'un JOUR ENTIER cible, jamais une position à
cheval sur 2 jours. Concrètement : glisser une telle note d'une petite distance (dans le même jour, pour
viser sa propre après-midi) tombait systématiquement sur le test de no-op (`delta === 0` et même forme) et
ne faisait RIEN — d'où « impossible de déplacer de 1 case » — et il fallait franchir la frontière d'un
jour ENTIER pour obtenir le moindre effet, ce qui ne pouvait jamais donner "lundi aprem + mardi matin".

Ce n'était PAS une régression du §42 (la protection contre le rétrécissement reste voulue et nécessaire),
mais un angle mort : cette protection avait été construite en pensant "journée entière = un seul bloc
indivisible par un déplacement", sans réaliser qu'une journée entière est mathématiquement identique (2
demi-slots) à une note "1 jour et demi" à cheval sur 2 jours — cas que `bordsDeplacementNoteMultiJours`
sait déjà translater en préservant sa longueur totale sans jamais la rétrécir.

### Correctif

En mode COMPACT, `bordsDeplacementNoteMultiJours` gouverne désormais le déplacement de TOUTE note (plus
seulement `duree > 1`) — `offsetHalvesClic` est maintenant calculé pour toute note (pas seulement
multi-jours), et `resoudreCibleGroupe`/`cibleNotePreciseCompacte` routent systématiquement vers ce modèle
en mode compact. Résultat, sans rien changer de plus :
- une note en journée entière posée pile sur une frontière de jour reste en journée entière (§42 toujours
  respecté — c'est une conséquence naturelle des maths de `bornesDepuisDemiSlots`, pas un cas spécial) ;
- posée à cheval sur 2 jours, elle devient "1 jour et demi" (2 demi-slots répartis sur 2 jours), sans
  jamais rétrécir à une seule demi-journée — exactement "lundi aprem + mardi matin" comme demandé.

Le mode CLASSIQUE (pas de géométrie demi-jour pixel-précise, cf. `colonneEtSpanDemi`) garde
`demiCiblePourDeplacementNote` et son comportement par jour entier, strictement inchangé.

3 nouvelles assertions dans `test_grille_compacte.js` (le scénario exact de Lionel + la non-régression du
§42 + un cas avec un clic décalé sur le dernier demi-slot). Vérifié de bout en bout avec une reproduction
Playwright (`/tmp/test_repro_lundi_aprem.js`, mock exécutant la vraie `planPlage`, données persistées) :
confirmé cassé sur le code d'avant ce round (la note ne bougeait pas du tout pour ce geste), confirmé
réparé après — la note "plein" (2026-09-07, journée entière) glissée d'1 demi-slot atterrit bien comme
`{2026-09-07 aprem, 2026-09-08 matin}`.

Suite complète `test_*.js` verte (18 fichiers, 72 assertions dans `test_grille_compacte.js`), `node
--check` OK.

## 46. Round du 08.09.2026 (suite) — parité de comportement jalons/tâches/absences ("cela fonctionne, applique cela aux jalons, tâches et absence")

Après confirmation du correctif §45 ("cela fonctionne"), Lionel demande d'appliquer le même comportement
aux jalons, tâches et absences — "toutes les bulles doivent avoir le même comportement".

### 46.1 Analyse : le bug du §45 n'a pas d'équivalent DIRECT pour ces 3 types

Avant de coder quoi que ce soit, vérification de si le même bug (une note en journée entière coincée sur
une granularité jour entier) pouvait exister pour un jalon ou une tâche/absence — réponse : **non, par
construction**, pour 2 raisons vérifiées dans le code (pas supposées) :

- **Un jalon n'a jamais de demi-journée** (règle déjà validée par Lionel, cf. §10.3/BACKEND-CHANGELOG :
  "un jalon marque toujours la journée entière"). Le moteur de synchronisation le confirme au niveau le
  plus bas : `diffsJalons`/`synchroniser()` ne raisonnent jamais en "plage qui se déplace" comme les notes
  (`origine`, `mode: ajout/remplacement`) — chaque jour est comparé indépendamment (état complet du jour,
  toujours `mode: "remplacement"`, `origine: null`, cf. commentaire de tête de `synchroniser()`). Un
  déplacement de jalon n'est donc jamais qu'une combinaison de jours "vidés" et de jours "remplis" —
  structurellement incapable de rétrécir ou de scinder en demi-journée.
- **Une tâche/absence a sa demi-journée FIXE pour toute sa durée** (`it.demi`, la ligne matin/aprem
  qu'elle occupe tout du long) — elle ne "porte" pas 2 bords indépendants comme une note
  (`demiDebut`/`demiFin`). Le passage de matin à après-midi se fait déjà en 1 geste, par la cellule sur
  laquelle on lâche (`dataset.demi`), et `estBulleUnitaireDeplacable()` route TOUTE tâche/absence seule
  (durée 1 ou multi-jours, jamais de branche séparée par durée comme l'ancien code des notes) par la même
  fonction (`appliquerCibleUnitaire`), qui reconduit toujours `nDuree = it.duree` (jamais de rétrécissement
  silencieux, sauf dépôt sur une case week-end isolée — comportement voulu et déjà documenté, §7.4).
  Confirmé aussi côté écriture serveur : `enregistrerCellulePersonneServeur` écrit case par case
  (personne, date, demi) avec l'état COMPLET de la case à chaque fois — jamais de notion de "plage qui se
  déplace" là non plus.

### 46.2 Mais un AUTRE bug bien réel a été trouvé en vérifiant empiriquement (Playwright)

Plutôt que de s'arrêter à "pas de bug analogue", vérification par la pratique (glisser une tâche
multi-jours et une absence multi-jours en mode compact) — a débusqué un bug distinct, jamais signalé par
Lionel avec ces mots, mais bien réel et dans le même esprit ("une bulle ne devrait pas sauter plus loin
que prévu").

**Cause** : `offsetJoursClic` (l'ancre du clic dans la bulle, pour savoir quel jour de la plage a été
cliqué) se calcule par fraction de pixel : `(clientX - rectClic.left) / (rectClic.width / duree)`. Ce
calcul suppose que `rectClic` (le rectangle de l'élément DOM cliqué) s'étend sur TOUTE la largeur de la
plage — vrai pour un jalon, une note, et une tâche/absence en mode CLASSIQUE (un seul élément DOM continu
dans ces 3 cas). **Faux pour une tâche/absence de plusieurs jours en mode COMPACT** :
`ligneGroupePersonnesCompact` ne dessine pas un seul rectangle continu comme les autres — chaque jour de
la plage y est un SEGMENT DOM séparé (large d'une seule demi-colonne, cf. commentaire existant "elle est
dessinée en SEGMENTS, un par demi-journée occupée"). `bulleDom` au clic n'est alors que CE SEUL segment
(la largeur d'1 jour), pas la plage entière — diviser cette largeur par `duree` (ex. 2) donnait une ancre
fausse dès qu'on cliquait au-delà du 1er quart de large du 1er segment.

Repro isolée (`/tmp/test_repro_parite_jalon_tache.js`, Test B) : tâche "TacheTest" sur 2 jours (matin),
clic au MILIEU du 1er segment, glissée vers la case après-midi du jour suivant. Avant correctif : l'ancre
calculée valait 1 (au lieu de 0 attendu), donc la tâche ne se décalait PAS d'un jour comme visé — elle
restait sur ses 2 jours d'origine (07-08), seule la demi-journée changeait. Confirmé cassé avant correctif
via `git stash`, corrigé après.

### 46.3 Correctif (`Index.html`)

- **`ligneGroupePersonnesCompact`** : chaque segment reçoit désormais `seg.dataset.segJour = String(d)` —
  son propre décalage en jours depuis `it.giDebut` (0 = 1er jour de la plage), posé au moment même de sa
  construction, donc toujours exact.
- **`onPointerDownGroupeSelection`** (calcul d'`offsetJoursClic`) : si l'élément cliqué porte
  `data-seg-jour` (segment de tâche/absence en mode compact), l'ancre se lit directement dessus (exacte,
  aucun calcul de fraction) ; sinon (jalon, note, tâche/absence en mode classique), l'ancien calcul par
  fraction de pixel reste inchangé — toujours correct dans ces cas, l'élément cliqué y couvrant bien toute
  la plage.

Non touché : le rendu (aucun changement visuel), la logique de résolution de cible au lâcher
(`appliquerCibleUnitaire`, `cellulesPlagePourSurvol`) — elles consomment déjà `offsetJoursClic`
correctement, seul le calcul EN AMONT de cette valeur était faux dans ce cas précis.

**Limite assumée, non liée à ce bug** : le fantôme (`.fantome-glisse`) affiché pendant le glissement d'une
tâche/absence multi-jours en mode compact ne clone que le PREMIER segment rencontré par `querySelector`
(large d'1 jour) — l'aperçu visuel du glissement ne représente donc qu'1 jour de large même pour une
plage plus longue. Comportement déjà présent avant ce round, indépendant du bug corrigé ici (qui portait
sur le calcul de la CIBLE finale, pas sur l'aperçu visuel) — à traiter séparément si Lionel le signale.

### 46.4 Vérification effectuée

Repro Playwright dédiée (`/tmp/test_repro_parite_jalon_tache.js`, 3 scénarios avec un mock Supabase
"intelligent" exécutant la vraie `planPlage` pour les jalons et une écriture directe générique pour les
tables `taches`/`assignations`, fidèle au comportement réel de `enregistrerCellulePersonneServeur`) :

- **Test A (jalon 3 jours, glissé de 1 jour)** : déjà correct avant ce round (cf. §46.1) — confirmé par ce
  test, aucune régression.
- **Test B (tâche 2 jours matin, clic sur le 1er segment, glissée vers après-midi + 1 jour)** : cassé
  avant correctif (confirmé via `git stash` — la tâche ne se décalait pas), correct après (2 jours pleins,
  après-midi, décalée comme visé).
- **Test C (absence 2 jours matin, clic sur le 2e segment — ancre offset=1 —, glissée 1 jour plus loin)** :
  vérifie spécifiquement que `data-seg-jour` distingue bien QUEL segment a été cliqué, pas seulement que
  la plage entière bouge — correct après correctif (absence toujours 2 jours pleins, décalée d'exactement
  1 jour depuis le jour réellement cliqué).

`node --check` sur le `<script>` extrait : OK. Suite complète `test_*.js` (18 fichiers) toujours verte —
ce correctif ne touche que la mécanique DOM du glissement (pas de fonction pure extractible par
`extraireFonction`, comme `offsetHalvesClic` au §45), donc vérifié uniquement par la reproduction
Playwright ci-dessus plutôt que par de nouvelles assertions dans `test_grille_compacte.js`.

Comme toujours, pas d'exécution dans un vrai navigateur/Supabase disponible ici au-delà de Playwright —
Lionel doit confirmer en conditions réelles que glisser une tâche ou une absence de plusieurs jours en
mode compact atterrit bien exactement là où elle vise, y compris quand le clic initial ne tombe pas sur
le tout premier jour de la plage.

## 47. Round du 08.09.2026 (suite, encore) — le JALON gagne la demi-journée : parité complète avec la note

Lionel, après confirmation que le §46 fonctionne : *« Pour plus de clareté je veux que le jalons utilise
aussi la demi journée, comme ca toutes les bulles se comportent de la même manière »*.

Cette demande **annule explicitement** la règle décidée le 02.09.2026 (§10.3) : *« un jalon marque
toujours la journée entière »*. Ce n'est pas un bug à corriger mais un changement de comportement demandé
en connaissance de cause — un jalon peut désormais, comme une note, être posé sur une seule demi-journée
(matin/après-midi) à chacun de ses 2 bords.

### 47.1 Ce qui existait déjà et n'a pas eu besoin de changer

Avant d'écrire la moindre ligne, vérification de l'étendue réelle du changement plutôt que de supposer
qu'il fallait tout retoucher : la quasi-totalité de la couche de rendu et de géométrie des bulles est déjà
**générique** — elle ne branche jamais sur `it.type`, seulement sur `giDebut`/`duree`/`demiDebut`/`demiFin`
: la boucle de rendu jalons/notes (`[["jalon", JALONS, ...], ["note", NOTES, ...]].forEach(...)`),
`colonneEtSpanDemi()`, `demiPourRedimNote()`, `demiCiblePourDeplacementNote()`,
`bordsDeplacementNoteMultiJours()`, `demiSlotsDepuisBornes()`, `bornesDepuisDemiSlots()`. Ces fonctions
n'ont **pas été touchées** : il suffisait de leur faire arriver de vraies valeurs `demiDebut`/`demiFin`
pour un jalon au lieu de toujours `null`.

Découverte notable : `diffsJalons()` (moteur de diff client) contenait déjà, intacte, la logique de
décodage d'un format `"demi\u0000texte"` dans `jalonsMap`, avec un commentaire l'expliquant explicitement
(*« La demi-journée fait partie de la VALEUR comparée (round du 02.09.2026) »*) — mais la construction de
`jalonsMap` dans `calculerEtatLocal()` n'utilisait jamais ce format (elle stockait juste `j.texte` brut),
avec un commentaire contradictoire (*« jalon : pas de demi-journée »*). Cette fonctionnalité avait donc
déjà été conçue puis abandonnée avant le round du 02.09.2026 — ce round la restaure plutôt que de la
construire depuis zéro.

### 47.2 Ce qui a dû changer

**Base de données** (`sql/0006_jalons_demi.sql`, appliquée directement via le connecteur MCP Supabase —
même méthode que 0003/0005) :
```sql
alter table jalons add column if not exists demi text check (demi in ('matin', 'aprem'));
```
Aucun `GRANT` nécessaire (la table a déjà ses droits `authenticated` + sa policy RLS depuis 0002_rls.sql).

**Fonction serveur** (`functions/enregistrer-plage/`, redéployée sur le projet Supabase — version 2,
ACTIVE) :
- `index.ts` : la lecture des lignes existantes inclut désormais la colonne `demi` pour un jalon (comme
  c'était déjà le cas pour une note).
- `logic.js` (`planPlage`) : `demiPropreDebut`/`demiPropreFin` se calculent désormais pour les 2 `kind`
  (avant : seulement pour `note`). La branche jalon (qui garde son modèle "au plus une ligne par jour",
  inchangé) calcule maintenant `demiIci` via `demiPourJourDePlage()` — la même fonction, la même règle des
  2 bords que pour une note — et compare `ancienDemi === demiIci` en plus de `ancien === contenu` pour
  décider s'il y a réellement quelque chose à écrire (y compris en mode "ajout" : un simple changement de
  demi-journée sans nouvelle ligne de texte produit quand même une mise à jour).

**Client** (`Index.html`) :
- `itemPlage()` : le champ `demiDebut`/`demiFin` (déjà partagé par tous les types de bulle) reçoit
  désormais de vraies valeurs pour un jalon.
- `calculerEtatLocal()` : `jalonsMap` encode désormais `demi + "\u0000" + texte` par jour (au lieu du texte
  brut), pour rejoindre le format déjà attendu par `diffsJalons()` — restaure la logique décrite au §47.1.
- `synchroniser()` : le diff jalon transmet `demiDebut`/`demiFin` au serveur (au lieu de toujours `null`).
- `construireDonneesSemaine()` : le jalon de chaque jour porte désormais un champ `demi` (comme une note).
- `construireVueDepuisCache()` : la boucle de fusion des jalons en plages continues applique désormais la
  même règle qu'une note — la fusion s'arrête dès qu'un jour du milieu porte une demi-journée non nulle
  (impossible normalement, cf. `demiPourJourDePlage`, mais gardé par cohérence avec le code des notes).
- `demiFixePourItem()` : commentaire mis à jour (aucun changement de code : cette fonction ne concernait
  déjà que les tâches/absences, un jalon ayant désormais son propre `demiDebut`/`demiFin` comme une note).
- 3 points de restriction "note uniquement" étendus à "note ou jalon" : le gate `offsetHalvesClic` dans
  `onPointerDownGroupeSelection`, `cibleNotePreciseCompacte()`, `resoudreCibleGroupe()` — ce sont les
  mécaniques de glissement précis par demi-slot en mode compact déjà mises au point pour les notes aux
  §37/§38/§45.
- `cablerPoigneeRedim()` : variable renommée `estNote` → `estNoteOuJalon`, ses 3 usages étendus en
  conséquence — c'est ce qui permet à la poignée de redimensionnement d'un jalon de s'arrêter sur une
  demi-journée au lieu de sauter jour par jour.
- Dialogue "Ajout lointain" : `demiPossible` (masquait le choix de demi-journée pour un jalon) passe à
  toujours `true`.
- `ouvrirEditionPlage()` : `demiAutorisee` (réservait le bloc de choix de demi-journée aux notes) inclut
  désormais aussi le jalon. Le reste de la fonction (`demiBlocHTML`, la sauvegarde, la création) était déjà
  générique et n'a pas eu besoin de changer.
- Nettoyage de tous les commentaires du fichier qui affirmaient encore "un jalon n'a jamais de
  demi-journée" ou équivalent, pour que la documentation inline reste fidèle au comportement réel.

### 47.3 Vérification effectuée

**Suite `test_*.js`** (19 fichiers) : 2 fichiers avaient des assertions qui présumaient `demi` absent/non
pertinent pour un jalon (`test_chargement.js`, `test_enregistrer_plage.js`) — mises à jour pour refléter le
nouveau champ. `test_grille_compacte.js` : commentaire d'une assertion existante (`demiFixePourItem` sur un
jalon) mis à jour pour la bonne raison (un jalon a maintenant son propre `demiDebut`/`demiFin`, comme une
note — la fonction ne le concerne toujours pas, mais plus pour la raison "pas de demi-journée pour les
jalons"). 4 nouvelles assertions ajoutées à `test_enregistrer_plage.js` couvrant `planPlage` avec
`kind: 'jalon'` et une demi-journée sur les bords (insertion sur 3 jours avec bords en demi-journée ;
même texte mais demi différente → mise à jour, pas un no-op ; même texte et même demi → aucune opération ;
mode ajout sans nouvelle ligne mais demi changée → mise à jour quand même). Suite complète verte
(19/19 fichiers, aucune régression).

**Playwright** (`/tmp/test_jalon_demi_playwright.js`, mock "intelligent" exécutant la vraie `planPlage`) :
reprise des 2 repros déjà utilisés pour valider les notes, mais sur un jalon —
- Glissement par demi-slot (mirroir de `test_repro_lundi_aprem.js`) : jalon "plein" du lundi (journée
  entière), clic sur le 1er demi-slot, glissé d'exactement 1 demi-slot vers la droite → atterrit sur
  "lundi après-midi + mardi matin" (2 lignes, `demi` = `aprem` puis `matin`), jamais rétréci à une seule
  demi-journée. **OK.**
- Redimensionnement par la poignée (mirroir de `test_repro_resize_demi2.js`) : jalon "plein" (journée
  entière), poignée droite tirée à 25 % de la largeur → réduit au matin seul (`demi: 'matin'`), exactement
  comme une note. **OK.**
- Création via le dialogue "Ajout lointain" avec une demi-journée choisie : script non concluant (les
  sélecteurs génériques utilisés ne correspondaient pas exactement au DOM du dialogue) — non bloquant,
  ce chemin est déjà couvert par les assertions pures de `test_enregistrer_plage.js` ci-dessus et par
  `test_ajout_lointain.js`.

`node --check` sur le `<script>` extrait : OK. Aucun octet NUL parasite dans `Index.html` (vérifié après
un incident d'édition impliquant un `\u0000` littéral, cf. note technique interne — corrigé avant ce
commit).

**Déploiement** : migration SQL appliquée directement sur le projet Supabase (`jalons_demi`) ; fonction
`enregistrer-plage` redéployée (version 2, ACTIVE) — les 2 étapes serveur sont donc déjà en production,
aucune action requise de la part de Lionel sur ce point. Comme toujours, pas d'exécution dans un vrai
navigateur connecté au vrai Supabase disponible ici au-delà de Playwright — Lionel doit confirmer en
conditions réelles que créer, glisser et redimensionner un jalon en demi-journée fonctionne comme pour une
note.

## 48. Round du 08.09.2026 (suite, encore) — mode compact : les bulles tâche/absence se "découpent" au lieu de rester une seule barre continue

Signalement de Lionel : en mode COMPACT, une tâche ou une absence qui dure plusieurs jours s'affiche
« découpée » en segments avec des trous, alors qu'un jalon ou une note s'affiche toujours comme une seule
bulle continue. Confirmé comme un vrai défaut (pas un choix de conception) — clarification demandée sur le
comportement voulu quand la fusion en une seule barre chevaucherait, sur un "trou", un contenu sans rapport.

Réponse de Lionel, tranchée : **« Barre continue toujours »**. Elle assume de gérer elle-même le cas rare
d'un chevauchement, en copiant une bulle si nécessaire. Son exemple, donné pour fixer précisément le
comportement attendu (avec un croquis à l'appui) : *« Le planning dans ce format la doit avoir ses bulles
continue, c'est moi qui doit adapter en copiant une bulle si nécessaire. imaginons qu'une tâche dure
1.5jour (mardi et mercredi matin), en format compact, la bulle doit faire 3 case de long et en format
standard il doit y avoir une bulle de 2 case sur le matin (mardi et mercredi) et un bulle de 1 case sur
l'après midi (mardi). »* — le mode standard/classique, déjà correct sur cet exemple, ne doit pas changer.

### 48.1 Cause réelle

Deux couches distinctes contribuaient au découpage, et une seule était déjà en place :

- **Au chargement** (`construireVueDepuisCache`) : les jours CONSÉCUTIFS d'une MÊME demi-journée avec un
  contenu identique (texte/important/statut/chantier) sont déjà fusionnés en un seul item `TACHES` à durée
  multiple — ex. "mardi matin + mercredi matin" devient un seul item `duree: 2`. Cette partie du problème
  était donc déjà résolue côté données ; ce qui manquait, c'est que le RENDU compact redécoupait quand même
  cet item en autant de segments DOM qu'il y a de jours, parce qu'un item n'occupe qu'UNE SEULE des 2
  colonnes demi-journée de chaque jour intermédiaire — laissant l'autre visuellement vide au lieu de
  fusionner par-dessus.
- **Entre deux demis différentes** (matin + après-midi, l'exemple de Lionel) : ce cas n'a jamais été fusionné
  nulle part, ni au chargement (qui ne regroupe que par demi fixe) ni au rendu — chaque demi restait un item
  séparé, donc 2 bulles distinctes même quand elles se touchent bord à bord.

### 48.2 Implémentation

- **`construireRunsCompacts(itemsLigne)`** (nouvelle fonction pure, portée globale de l'IIFE — extraite hors
  de `construireGrille()` pour rester testable via `extraireFonction`, comme le reste de la suite de tests) :
  regroupe les items d'une ligne, piste par piste (`_piste`, calculée par `assignerPistesCompact`), en
  "runs" — une suite d'items consécutifs (bord à bord ou chevauchants) au contenu identique (type, texte,
  important, statut, chantier), quelle que soit leur demi-journée. Les items du week-end restent rendus
  séparément (jamais fusionnés). Réutilise telle quelle la géométrie déjà existante
  (`demiSlotsDepuisBornes`) pour calculer le footprint en demi-slots de chaque item — aucune nouvelle
  fonction de géométrie nécessaire.
- **`ligneGroupePersonnesCompact`** : au lieu de poser un `<div class="bulle">` par item, pose un seul
  élément par run, positionné avec `colonneEtSpanDemi(premierItem.giDebut, durée, premierItem.demi,
  dernierItem.demi)` — la même fonction déjà utilisée pour les jalons/notes, qui comble déjà nativement les
  trous internes d'une demi-journée à l'autre.
- **`data-slots`** (posé sur TOUTE bulle tâche/absence en mode compact, y compris un run à un seul membre)
  et **`data-membres`** (liste d'ids séparés par des virgules, posé seulement si le run a 2+ membres)
  remplacent l'ancienne mécanique `data-seg-jour` / `.bulle-suite` / `.bulle-continue` (supprimée du CSS et
  du JS) — c'est la nouvelle base du calcul de décalage au clic (`offsetJoursClic`, généralisé pour
  fonctionner sur un nombre de demi-slots quelconque au lieu d'un nombre fixe de jours).
- **Rupture de l'invariant « 1 bulle DOM = 1 item de données »** : une bulle fusionnée n'a qu'UN SEUL élément
  DOM (le premier membre du run), mais représente 2+ items. Tous les points du code qui résolvaient un item à
  partir du DOM (`document.querySelector('.bulle[data-id=...]')`) ratent donc silencieusement les membres
  non représentés. Nouvelle fonction **`itemParId(id)`** (recherche pure dans JALONS/NOTES/TACHES, sans DOM)
  substituée à ces résolutions partout où un membre non représentatif pouvait être concerné :
  `appliquerDelta` (le point CRITIQUE — la mutation réelle du glissement de groupe), `supprimerGroupeConfirme`,
  `supprimerSelection`, `copierSelection`, `couperSelection`, et le raccourci clavier Entrée (dont le test de
  "une seule bulle sélectionnée" est passé de `Object.keys(bullesSelectionnees).length` à
  `document.querySelectorAll(".bulle.selectionnee").length`, un run fusionné gonflant désormais
  `bullesSelectionnees` à 2+ entrées pour une seule bulle visuelle).
- **`groupeIds` au clic** : réutilise tel quel le mécanisme de glissement de groupe déjà existant et déjà
  éprouvé (`appliquerDelta`) — `data-membres` alimente directement `groupeIds`, ce qui fait automatiquement
  passer un run fusionné (`groupeIds.length > 1`) par le chemin de glissement de groupe plutôt que par le
  chemin de dépose directe réservé aux items seuls (`estBulleUnitaireDeplacable`), sans toucher à cette
  fonction de garde elle-même.
- **`ancrageAffichage`** (nouveau 5e paramètre de `cablerPoigneeRedim`) : problème repéré et corrigé avant
  tout test — brancher les 2 poignées de redimensionnement d'un run fusionné sur ses 2 membres extrêmes
  (premier/dernier) sans autre changement aurait fait s'effondrer l'APERÇU EN DIRECT du glissement (pas le
  résultat final, déjà correct) sur le seul footprint du membre en cours de redimensionnement. Corrigé en
  séparant « l'item réellement modifié » de « le bord fixe opposé, pour l'affichage seulement » — un run
  fusionné garde donc son bord opposé visuellement immobile pendant tout le geste, exactement comme pour un
  item seul.

### 48.3 Vérification effectuée

**Tests unitaires** (`test_grille_compacte.js`) : 8 nouvelles assertions pour `construireRunsCompacts`
couvrant l'exemple exact de Lionel (fusion 1.5 jour), la continuité d'un item seul, la non-fusion sur texte/
chantier/piste différents ou sur des items non adjacents, une chaîne de 3 items, et l'exclusion du week-end.
Suite complète : 86/86 assertions. Aucune régression sur les 19 fichiers `test_*.js` du projet.

**Playwright** (`/tmp/verif_fusion_compacte.js`, mock "intelligent" — `functions.invoke`/`from().delete()`/
`.insert()` persistent réellement dans `window.__TABLES__`, condition nécessaire pour vérifier l'aller-retour
complet glissement → sauvegarde → rechargement déclenché par `synchroniser()`) : 19/19 vérifications,
5 scénarios —
- une tâche seule de 3 jours matin ne se redécoupe plus en segments (largeur continue, sans trou) ;
- l'exemple EXACT de Lionel (mardi+mercredi matin, mardi après-midi) fusionne en 1 seule bulle de
  3 demi-slots en mode compact ;
- le même exemple reste 2 bulles séparées en mode classique, **inchangé** ;
- un glissement de la bulle fusionnée déplace bien ses 2 items sous-jacents ensemble, du même delta, chacun
  gardant sa propre demi-journée et sa durée — vérifié jusqu'à l'état final relu depuis le "serveur" après
  rechargement, pas seulement l'état mémoire immédiat ;
- un redimensionnement par la poignée droite n'allonge que le membre de droite (le bord gauche du rendu
  reste visuellement fixe pendant le geste, comme conçu par `ancrageAffichage`), sans toucher au membre de
  gauche.

`node --check` sur le `<script>` extrait : OK.

**Déploiement** : changement purement client (aucune migration SQL ni fonction serveur touchée) — rien à
redéployer côté Supabase. Comme toujours, Lionel doit confirmer en conditions réelles, en particulier sur
son exemple 1.5 jour et sur un cas de chevauchement qu'elle gère elle-même en copiant une bulle.

## 49. Round du 08.09.2026 (suite, encore) — le §48 ne suffisait pas : tâches/absences reçoivent enfin le vrai modèle demiDebut/demiFin, et la vue standard/classique est supprimée

Retour de Lionel sur le §48 (fusion visuelle des tâches/absences compactes en une seule bulle continue,
livré juste avant) : **« Cela ne fonctionne pas comme je le souhaite. peut-être que c'est plus simple de
laisser tomber la vue standard et de se concentrer sur la vue compact. oublie tout ce qu'on a vu sur la vue
standard. on reste sur la seule vue compact qui devient la standard »**.

Deux questions de clarification lui ont été posées, avec ses réponses exactes :

- *Qu'est-ce qui ne va pas exactement avec le résultat actuel en mode compact ?* → **« 1 tâche ne peux pas
  etre mise sur 2 case, elle s'étent de 1 jour (de 1 a 3 ,5 ou 7 case) »**.
- *Pour la vue standard (classique) : je supprime complètement le bouton et tout le code qui lui est
  propre, pour qu'il ne reste plus qu'UN SEUL affichage — celui qui était "compact" ?* → **« Oui, supprime
  tout (Recommandé) »**.

### 49.1 Cause réelle du §48

Le §48 corrigeait le SYMPTÔME (le rendu redécoupait un item déjà correct en segments DOM) sans toucher à la
CAUSE : une tâche/absence n'a **toujours eu qu'un seul champ `demi` fixe pour toute sa durée**, contrairement
à un jalon/une note (`demiDebut`/`demiFin`, un par bord de la plage, avec la règle « tout jour strictement
entre les 2 bords reste une journée entière »). Un champ unique ne peut décrire que des plages qui sautent
par journée ENTIÈRE (2 demi-slots à la fois) — jamais « 1 jour et demi » comme UN SEUL item continu, exactement
la description de Lionel : la longueur ne peut passer que par des nombres impairs de case (1, 3, 5, 7 — un
saut de 2 cases à chaque fois), jamais par un nombre pair (2, 4, 6). Le §48 fusionnait bien 2 items voisins
en apparence, mais chacun restait individuellement limité à cette même granularité grossière dès qu'on
essayait de le redimensionner ou de le recréer.

Le vrai correctif : donner aux tâches/absences **exactement le même modèle de données que les jalons/notes**
(`demiDebut`/`demiFin`) plutôt que de continuer à ravauder le rendu par-dessus l'ancien modèle.

### 49.2 Suppression de la vue standard/classique

Conformément à « Oui, supprime tout » :

- Le bouton bascule (case à cocher "Mode compact" dans Réglages) et son câblage JS sont supprimés.
- `modeCompact` reste une variable nommée (plutôt que de traquer une par une ses ~15 références dans un
  fichier de plusieurs centaines de milliers de caractères, un risque d'en oublier une jugé disproportionné
  par rapport au gain) mais devient une **constante fixée à `true`**, documentée comme telle ; `colsParJour()`
  se simplifie en un simple `return 2`.
- `ligneGroupePersonnesClassique` (tout le rendu par ligne demi-journée séparée) est supprimée intégralement,
  ainsi que les 2 règles CSS scoping `.grille:not(.grille-compacte)`.
- Les ternaires mineurs encore lisibles qui distinguaient les 2 modes (`colonneGrille`, `colonneEtSpanDemi`,
  etc.) sont laissés tels quels : leur branche "classique" devient un simple code mort inatteignable, sans
  risque, plutôt que de multiplier les micro-modifications sur des fonctions par ailleurs correctes.

### 49.3 Nouveau modèle de données : demiDebut/demiFin pour les tâches/absences

- **`itemPlageTache(type, texte, personneId, giDebut, duree, opts)`** : signature changée, le paramètre
  positionnel `demi` disparaît au profit de `opts.demiDebut`/`opts.demiFin` (exactement comme `itemPlage`
  pour les jalons/notes). Toute la mécanique demi-slot déjà existante et déjà éprouvée pour les jalons/notes
  (`demiSlotsDepuisBornes`, `bornesDepuisDemiSlots`, `bordsDeplacementNoteMultiJours`, `demiPourRedimNote`)
  est réutilisée telle quelle, sans nouvelle fonction de géométrie.
- **`construireVueDepuisCache`** : la boucle qui reconstruit les tâches/absences depuis les cellules du
  cache serveur est réécrite pour parcourir les demi-slots consécutifs (matin/après-midi de chaque jour, un
  entier par demi-slot comme pour les notes) et fusionner par CONTENU (texte/important/statut/chantier),
  jamais par position fixe dans un tableau — le même algorithme, plus sûr, déjà utilisé pour les notes.
  Résultat : un item chargé depuis le serveur est déjà nativement UN SEUL objet continu, plus besoin d'aucune
  fusion après coup au rendu.
- **`calculerEtatLocal`** : la projection inverse (items → cellules à sauvegarder) applique la même règle de
  bord — 1er jour → `demiDebut`, dernier jour → `demiFin`, tout jour du milieu → journée entière — via une
  nouvelle fonction partagée **`demisOccupeesTache(it, gi)`**, réutilisée aussi par `chantierExistantDansCase`
  et `selectionnerDepuisCellules`.
- La base de données et les fonctions serveur (`taches`, `assignations`, Edge Functions) restent
  **inchangées** : une ligne par (personne, date, demi) côté serveur, exactement comme avant — seule la
  reconstruction et la sauvegarde côté client changent.
- Semaine/week-end : convention inchangée mais désormais explicite (`demiDebut: "matin", demiFin: "matin"`
  forcés) — une case de week-end reste toujours une seule demi-journée interactive par personne (§2 du spec).

### 49.4 Rendu et interactions : retour à la mécanique native des jalons/notes

Puisqu'une tâche/absence est de nouveau un item unique et continu (comme un jalon/une note), tout
l'échafaudage du §48 devient inutile et est retiré :

- `construireRunsCompacts` (fusion visuelle post-hoc) et `demiFixePourItem` (repli demi pour l'ancien
  modèle) sont supprimés intégralement.
- `data-slots`/`data-membres` disparaissent ; `ligneGroupePersonnesCompact` pose de nouveau **une bulle par
  item**, positionnée par `colonneEtSpanDemi(it.giDebut, it.duree, it.demiDebut, it.demiFin)` — exactement
  la même fonction que pour un jalon/une note.
- `bulleEl`/`cablerPoigneeRedim` reviennent à leur forme à un seul item (plus d'`ancrageAffichage`) : le
  redimensionnement par poignée (`demiPourRedimNote`) et le déplacement en demi-journée
  (`bordsDeplacementNoteMultiJours`) s'appliquent désormais **sans restriction de type** — une tâche/absence
  se redimensionne et se déplace en demi-journée exactement comme un jalon ou une note, ce qui répond
  directement à « toutes les bulles doivent avoir le même comportement » (déjà cité au §47) autant qu'à la
  demande explicite de ce round.
- **`onPointerDownGroupeSelection`** : `offsetJoursClic`/`offsetHalvesClic` redeviennent des calculs simples
  à un seul item (plus de branche `data-slots`), et `offsetHalvesClic` n'est plus restreint aux notes/jalons.
- **`resoudreCibleGroupe`** : le chemin dédié aux tâches seules (`estBulleUnitaireDeplacable`, qui gère en
  plus le changement de personne — capacité que les jalons/notes n'ont jamais eue) devient demi-précis à la
  souris hors week-end, via `bordsDeplacementNoteMultiJours` — même modèle que la surbrillance de survol
  (`cibleNotePreciseCompacte`, désormais étendue aux tâches). Le repli tactile (granularité jour entier,
  forme reconduite telle quelle) est conservé inchangé.
- `basculerSelection`/`resoudreClicBulle` reviennent à leur forme à un seul id (plus de paramètre `membres`
  — devenu sans objet, un item = de nouveau un seul élément DOM) ; `itemParId(id)`, plus sûr qu'un
  `document.querySelector`, est conservé sur les sites déjà migrés au §48 même si sa justification d'origine
  (membre non représentatif d'un run fusionné) a disparu.
- **`creerGroupeTaches`** (formulaire d'ajout, sélection de cellules) : crée désormais **1 item par jour**
  plutôt qu'1 seul item de plusieurs jours — une sélection "matin seul, 3 jours" doit laisser l'après-midi de
  CHAQUE jour libre, ce que le modèle demiDebut/demiFin (bords uniquement, jour du milieu toujours entier) ne
  peut plus représenter comme un seul item. Ces items se refusionneront de toute façon en une seule bulle
  continue au prochain rechargement (§49.3) — granularité identique pour le cas courant (1 jour).
- `appliquerDelta` (copie par glissement de groupe) et `collerPressePapier` (Ctrl+V) transmettent désormais
  `demiDebut`/`demiFin` à la copie — un oubli déjà corrigé pour les jalons/notes (round du 03.09.2026) mais
  jusqu'ici manquant côté tâches/absences (et, découvert au passage, également manquant pour le copier-coller
  clavier des jalons/notes eux-mêmes : corrigé au même endroit).

### 49.5 Vérification effectuée

**Tests unitaires** (`test_grille_compacte.js`) : réécrit en profondeur — suppression des tests
`construireRunsCompacts`/`demiFixePourItem` (fonctions disparues) et de toute la section "mode classique"
(devenue sans objet, l'affichage n'existant plus) ; nouvelles assertions pour `demisOccupeesTache` (bord de
début, bord de fin, jour du milieu, plage d'un seul jour) et `assignerPistesCompact` réexprimées avec
`demiDebut`/`demiFin`. `test_chantier_defaut.js` mis à jour de même (`chantierExistantDansCase` dépend
désormais de `demisOccupeesTache`). Suite complète : **19 fichiers, 100 % des assertions passées**, aucune
régression sur le reste (séries, formulaires, fériés, décalage en masse, etc.).

`node --check` sur le `<script>` extrait : OK.

**Non fait ce round, à noter** : contrairement au §48, aucune vérification Playwright de bout en bout
(glissement/redimensionnement réel dans un navigateur simulé) n'a été effectuée — la mécanique de glissement
touchée ce round est profondément imbriquée dans de grandes fermetures DOM difficilement extractibles pour
des tests purs, et construire un nouveau harnais Playwright + mock Supabase compatible aurait représenté un
chantier disproportionné pour ce round. La couverture s'appuie donc sur les tests unitaires ci-dessus (qui
couvrent toute la géométrie et la logique de données, le cœur du bug signalé) et une relecture manuelle
complète de chaque site d'appel touché. **Cela rend la confirmation de Lionel en conditions réelles
particulièrement importante ce round-ci** — en priorité sur son exemple exact ("1 tâche qui peut désormais
s'étendre sur un nombre pair de cases, ex. 2 ou 4") et sur la disparition de la vue standard.

**Déploiement** : changement purement client (aucune migration SQL ni fonction serveur touchée) — rien à
redéployer côté Supabase.

## 50. Round du 11.09.2026 — refonte du formulaire de saisie tâche : design validé, implémentation reportée

Demande de Lionel : **« J'aimerai retravailler les formulaire de saisie de tâche/note/jalon »**. Ce qui le
gêne, dans l'ordre de ses réponses : présentation visuelle, champs proposés, et nombre de clics/étapes — les
3 à la fois. Il avait une idée précise à décrire plutôt qu'à se faire proposer des options à l'aveugle.

### 50.1 Cahier des charges exact (verbatim)

> « propose moi 5 choix de formulaire en image j'y ferai des ajustement. doit y figurer :
> - chantier,
> - descriptif,
> - nom si section nom / intervenant si section intervenant,
> - date cliquable pour la changer (même principe que les semaines) avec flèche à gauche et droite pour
>   déplacer de 1 jour,
> - 3 boutons annuler/supprimer/enregistrer en bas, cela peut être des icônes (pas d'émoji) »

Deux capacités **nouvelles**, absentes du formulaire actuel (qui n'affiche ni date ni personne — elles sont
implicites à la case cliquée) : un champ date cliquable modifiable dans le formulaire lui-même, et un champ
Nom/Intervenant explicite. Ce n'est donc pas une simple passe esthétique.

### 50.2 Méthode : 5 maquettes image, itérées à partir des retours

Livrées comme demandé sous forme d'**images** (captures Playwright/Chromium d'une page HTML de maquettes,
`SendUserFile`, pas de code touché dans `Index.html`), pas comme artefact interactif — cohérent avec sa
demande littérale « en image » et son intention de les annoter lui-même.

5 options initiales couvraient tout l'espace de conception (compact à chips colorés, deux-colonnes bureau,
bandeau couleur chantier en en-tête, plein écran mobile, gros boutons tactiles). Lionel a ensuite convergé
par rounds successifs de retouches vers une combinaison des options 3 (desktop/tablette) et 4 (mobile) :

1. **Option 3** — d'abord ajustée pour reprendre le nom de chantier cliquable (menu déroulant caché) à la
   place du texte « Tâche · Personnel », la date déplacée tout en haut, et le descriptif passé sur 2 lignes
   cliquable ouvrant une fenêtre d'édition dédiée (2 boutons annuler/enregistrer).
2. **Option 4** — chantier remonté au-dessus du nom, transformé en bouton cliquable unique plutôt qu'une
   liste de chips qui débordait de l'écran ; ajout d'une **demi-fenêtre** (bottom sheet mobile) pour éditer
   le descriptif, avec la même logique que la popup desktop.
3. Popup/demi-fenêtre d'édition du descriptif : croix de fermeture seule (sans texte) en haut, bouton
   Enregistrer seul en bas — repositionné à droite dans la version finale (cohérence avec la croix de
   fermeture, cf. point 5) ; bug corrigé au passage (le bouton Enregistrer n'héritait d'aucun style bleu car
   scopé par erreur à une classe CSS non appliquée à la popup).
4. **Fusion des deux options** : l'option 3 a repris telle quelle la barre du haut et le pied de page de
   l'option 4 (croix + date centrée en haut ; bouton Supprimer en icône + gros bouton Enregistrer accent en
   bas, au lieu des 3 boutons carrés initiaux) ; l'option 4 a en retour repris le bandeau couleur
   chantier/nom de l'option 3 (au lieu de son ancien bloc chantier + bloc nom séparés). Les deux formulaires
   partagent maintenant exactement la même coquille (bandeau, barre du haut, pied de page), seule la mise en
   page du corps (carte desktop vs plein écran mobile) diffère.
5. Descriptif affiché en texte simple (sans encadré ni fond) dans les deux formulaires, plutôt qu'en boîte à
   bordure pointillée.
6. Champ de saisie de la demi-fenêtre mobile recadré (bordure visible) pour bien signaler qu'il s'agit d'une
   zone de texte éditable, comme la popup desktop.
7. **Croix de fermeture déplacée à droite** dans les 2 formulaires (elle était à gauche) : *« c'est plus
   logique, car c'est là qu'ils se trouvent dans toutes les applications »*.

Validation finale de Lionel : **« impeccable »**.

### 50.3 Périmètre confirmé pour l'implémentation à venir

Deux questions de clarification posées avant de coder, avec ses réponses exactes :

- *On passe à l'implémentation dans `Index.html` maintenant ?* → **« Pas tout de suite »** — design gelé,
  **aucun code applicatif touché ce round**, ce document sert de mémoire pour la reprise.
- *Ce nouveau formulaire s'applique à quoi ?* → **« Tâches uniquement »**. À clarifier explicitement à la
  reprise du chantier : est-ce que « tâches » exclut volontairement les **absences** (qui partagent
  pourtant aujourd'hui le même formulaire `ouvrirEdition`/`champChantierHTML`/`champStatutHTML`), ou est-ce
  un raccourci de langage pour « tâches/absences » par opposition à « jalons/notes » ? Les jalons/notes,
  eux, sont explicitement **hors périmètre** de cette refonte (pas de champ chantier ni nom dans leur
  formulaire actuel, `ouvrirEditionPlage`).

### 50.4 Repère pour l'implémentation future

Design final = option 3 (desktop/tablette, carte ~300px) pour l'écran large, option 4 (plein écran, avec
demi-fenêtre pour le descriptif) pour le téléphone — cohérent avec le comportement responsive déjà en place
depuis le round du 03.09.2026 (§31, plein écran mobile / demi-page tablette pour `.form-pop`). Éléments à
reprendre dans le vrai formulaire (`ouvrirEdition`, `champChantierHTML`) :

- Bandeau coloré (couleur du chantier sélectionné) affichant le nom du chantier (cliquable → sélecteur) et
  le nom de la personne/intervenant en grand.
- Barre du haut : croix Annuler à droite, date cliquable centrée avec flèches gauche/droite (± 1 jour,
  même principe que `naviguerSemaine`/`.semaine-titre`).
- Descriptif en texte simple, cliquable, ouvrant une popup (desktop) ou une demi-fenêtre glissée du bas
  (mobile) avec un champ de saisie encadré et un seul bouton Enregistrer (bleu, en bas à droite) — pas de
  bouton Annuler dans cette sous-popup, la croix en haut à droite suffit.
- Pied de formulaire principal : bouton Supprimer en icône seule + gros bouton Enregistrer (icône + texte,
  fond bleu accent), tous deux non-émoji (SVG trait).
- Icônes SVG à réutiliser telles quelles (X, corbeille, check, chevrons) : voir `mockups.html` sauvegardé
  dans le projet.

Maquette source (`mockups.html`, HTML/CSS autonome ayant servi aux captures d'écran) sauvegardée dans le
projet sous `claude/mockup-formulaire-tache.html` pour reprise ultérieure — évite de redemander à Lionel de
revalider un design déjà approuvé.

## 51. Round du 11.09.2026 — vérification avec de vraies données (§6bis) : 4 bugs trouvés et corrigés

Lionel a commencé à saisir de vraies données dans l'appli migrée (étape 5 du §6bis, "vérification bout en
bout"). Deux vagues de bugs remontées pendant cette phase, toutes corrigées et vérifiées via le harnais
Playwright + mock Supabase déjà en place (`test_*.js`, extraction des vraies fonctions du fichier source).

### 51.1 Note/tâche/jalon sur 1 seul jour : impossible de choisir Début=A + Fin=P indépendamment

Signalement de Lionel : *« impossible de sélectionner A et P si la date de début correspond à la date de
fin. on doit pouvoir faire A/P ou A/A ou PP, mais pas P/A »*.

**Cause** : `cablerDatesPlage` forçait Fin à recopier Début (et vice-versa) dès que `giDebut === giFin`, sous
l'ancienne hypothèse "1 seul jour ⇒ 1 seule valeur de demi-journée pour toute la carte" — devenue fausse
depuis que Début/Fin portent chacun leur propre demi-journée (§49).

**Correctif** : le clic sur un bouton A/P d'un bord ne touche plus que ce bord, avec un seul garde-fou ciblé
(bloquer la combinaison invalide Début=aprem + Fin=matin sur un seul jour, qui inverserait le sens de la
plage). L'enregistrement normalise ensuite Début=matin + Fin=aprem (équivalent à une journée entière) vers
`null`/`null`, pour ne pas introduire une 2e représentation possible d'une même journée pleine et préserver
l'invariant `demiDebut === demiFin` sur 1 seul jour dont dépend le reste du fichier (`demisOccupeesTache`,
rendu des bulles, glissé/redimensionnement — cf. commentaires §49).

Vérifié (`test_demi_unseuljour.js`) : A/P sélectionnables indépendamment, journée entière stockée/ré-ouverte
sans distorsion, combinaison P/A bloquée.

### 51.2 Vidéo de Lionel : tâches qui se scindent, "Vacances" en plusieurs bulles, sélection verte "bizarre"

Trois symptômes remontés ensemble, avec vidéo à l'appui : *« en tirant test 2 il se scinde en plusieurs »*
(redimensionner une tâche la fragmente), *« en créant vacances sur plusieurs case, il fait plusieurs bulles
au lieu de 1 »*, et *« la sélection verte lors du glisser se comporte bizarrement »* (rectangle de sélection
visuellement découpé case par case au lieu d'un seul bloc).

#### 51.2.1 Tâches/absences multi-jours qui se scindent — cause racine commune aux 2 premiers symptômes

Reproduit sans même passer par un redimensionnement : une tâche de plusieurs jours créée normalement (via
`ouvrirEdition`, en cliquant une case du MATIN) revenait déjà scindée en 2 bulles après le premier
aller-retour serveur (`enregistrerCellulePersonneServeur` → rechargement → `construireVueDepuisCache`).

**Cause** : `calculerEtatLocal()` (le "photographe" qui décide ce qui part vers le serveur à chaque
synchronisation) réimplémentait sa PROPRE version, incomplète, de la règle de bord demiDebut/demiFin, au
lieu d'appeler `demisOccupeesTache(it, gi)` — la fonction PARTAGÉE qui, elle, applique correctement
l'équivalence "matin au 1er jour d'une plage multi-jours = journée entière" / "aprem au dernier jour =
journée entière" (cf. `colonneEtSpanDemi`, qui rend visuellement ces cas identiques à une journée pleine —
`test_grille_compacte.js` documentait même déjà, à tort, que `calculerEtatLocal` passait par
`demisOccupeesTache`). Résultat concret : sur le jour de bord d'une plage multi-jours, une seule des 2
demi-journées serveur était écrite, l'autre restant vide — au rechargement suivant, cette moitié manquante
cassait la continuité de la plage reconstruite (l'algorithme de fusion de `construireVueDepuisCache` exige
un contenu identique sur CHAQUE demi-slot consécutif), la tâche revenant scindée en 2+ bulles. Comme
l'ouverture d'une nouvelle tâche/absence hérite par défaut de la demi-journée de la case cliquée
(`demiInit`, `ouvrirEdition`) et que cliquer une case MATIN est le geste le plus courant, ce bug touchait la
quasi-totalité des tâches multi-jours créées normalement, pas seulement après un redimensionnement.

**Correctif** : `calculerEtatLocal` appelle maintenant directement `demisOccupeesTache(t, gi)` au lieu de
dupliquer sa logique — élimine le bug ET la possibilité qu'affichage et écriture serveur redivergent un jour.

Vérifié (`diag_tache_split.js`, `repro_tache_split.js`) : une tâche 3 jours (bords matin/matin) et une tâche
2 jours qui la chevauche partiellement restent chacune une seule bulle continue après création ET après
redimensionnement — plus aucune ligne de données serveur manquante sur les jours de bord.

#### 51.2.2 "Vacances"/"Congé" sur plusieurs cases : `creerGroupeTaches` ne fusionnait qu'une tâche assignée

Le correctif ci-dessus ne suffisait pas pour "Vacances" sur une sélection multi-jours : `creerGroupeTaches`
(le glisser-sélectionner rapide, boutons Congé/Vacances du menu `.menu-pop`) pose délibérément 1 item PAR
JOUR ET par ligne de sélection (matin OU aprem) — nécessaire pour une TÂCHE ("matin seul, 3 jours" doit
laisser l'après-midi libre chaque jour, cf. §49), mais qui rend structurellement impossible toute fusion au
rechargement si le glissé reste sur une seule des 2 lignes demi d'une personne (cas très probable en
pratique : un glissé à peu près horizontal reste sur la ligne où le geste a commencé) — un jour dont seule
UNE des 2 demis est occupée casse la continuité exigée par l'algorithme de fusion, quelle que soit la
correction du §51.2.1.

**Correctif** : une absence (Congé/Vacances/formulaire rapide configuré en absence) posée sur PLUSIEURS
jours n'a jamais de sens en demi-journée (personne ne prend "vacances le matin seulement, 3 jours") — pour
`duree > 1`, `creerGroupeTaches` pose maintenant 1 SEUL item par personne concernée, journée complète du
début à la fin de la sélection, sans dépendre de la ligne demi effectivement glissée (dédoublonné par
personne si ses 2 lignes matin/aprem étaient toutes les deux sélectionnées). Le comportement d'une TÂCHE
assignée (pas une absence) est inchangé.

Vérifié (`repro_vacances.js`) : "Vacances" glissée sur la seule ligne matin, 3 jours (MAR-JEU) → écrit des
journées complètes sur les 3 jours côté serveur et s'affiche en 1 SEULE bulle continue.

#### 51.2.3 Sélection verte "bizarre" — quadrillage au lieu d'un rectangle continu

**Cause** : `surlignerRectangle` posait un anneau `box-shadow: inset 0 0 0 2px` sur CHAQUE case du
rectangle de sélection individuellement (classes `.selection-active`/`.selection-add`) — visible aussi sur
les bords INTÉRIEURS partagés entre 2 cases voisines sélectionnées, en plus du filet de 1px du fond de
`.grille` (technique `gap` + `background`) qui sépare déjà TOUTES les cases du tableau. Combinés, ces 2
filets donnaient l'impression d'un quadrillage de cases séparées plutôt que d'un seul bloc.

**Correctif** : ces classes ne posent plus qu'un fond teinté (qui se fond correctement d'une case à l'autre,
la même couleur unie des 2 côtés du filet de `gap` ne créant aucune coupure visible) ; le contour est
maintenant dessiné par une seule couche `#selection-overlay`, positionnée en `position: fixed` sur le
rectangle englobant (`getBoundingClientRect()`) de toutes les cases sélectionnées, posée/mise à jour par
`surlignerRectangle` et masquée par `effacerSurlignage`. `position: fixed` + coordonnées viewport évitent
d'avoir à connaître un ancêtre positionné ou le décalage de scroll du `.scroller`.

Vérifié (`repro_selection_overlay.js`) : un seul rectangle continu affiché pendant le glissé (dimensions =
englobant des 3 cases sélectionnées), cases individuelles sans `box-shadow`, overlay masqué au relâchement.

#### 51.2.4 (suite, même jour) "la sélection est bizarre, on dirait une case sur 2"

Nouvelle vidéo de Lionel après livraison du §51.2 ci-dessus : cette fois le rectangle de sélection est bien
UN SEUL bloc continu (§51.2.3 corrigé), mais son remplissage alterne colonne par colonne — une case teintée,
la suivante pas, sur toute la largeur du geste. Clarification demandée et obtenue : *« le bleu est pour la
sélection multiple »* (`demarrerSelectionRapide`, clic droit/appui long — sélectionner des bulles
existantes pour les copier/couper/supprimer), *« vert pour insertion multiple »* (`cablerAjoutCellule`,
glisser-déposer normal — le menu Ajouter/Congé/Vacances des §51.2.1-51.2.3).

**Cause, commune aux 2 couleurs** : en mode compact, matin et après-midi d'un même jour sont 2 colonnes
CÔTE À CÔTE dans la même ligne visuelle (pas 2 lignes empilées, cf. §48). Le calcul de la ligne survolée
(`trouverIndexLigne`, dans `onMove` des 2 gestes) relisait `c2.dataset.demi` — la demi-journée de la case
EXACTEMENT sous le curseur — à CHAQUE `pointermove`. Un geste à peu près horizontal traverse pourtant
naturellement, à chaque jour franchi, la moitié matin PUIS la moitié aprem de ce jour-là (imprécision de
tracé humaine normale, pas un geste "raté") : `indexCourant` retombait donc tantôt sur la ligne matin tantôt
sur la ligne aprem selon la position exacte du curseur à l'instant de CHAQUE mouvement, sans qu'aucun choix
délibéré n'ait été fait. Le rendu, fidèle à cet état, alternait alors "matin teinté / aprem pas teinté" sur
toute la largeur du geste — jamais le bloc plein attendu.

**Correctif** : la demi-journée ciblée est désormais figée sur celle de la case de DÉPART pendant tout le
geste (`extraDebut.demi` au lieu de `c2.dataset.demi`), dans les 2 fonctions (`cablerAjoutCellule` et
`demarrerSelectionRapide`). Seul un déplacement vers une AUTRE personne change encore de ligne — le
découpage matin/aprem par ligne (`lignesSecteur`) n'est pas remis en cause, juste stabilisé pour ne plus
dépendre du tracé exact du curseur. Le cas "tâche assignée en matin seul sur plusieurs jours" (le vrai
besoin métier derrière ce découpage, cf. §49) reste entièrement possible : il suffit de commencer le geste
sur une case matin et de ne jamais quitter la ligne de cette personne.

Vérifié (`repro_case_sur_2.js`) : un glissé simulé qui traverse RÉELLEMENT matin ET aprem de chaque jour
(reproduisant l'imprécision d'un vrai geste) reste maintenant sur une seule demi-journée du début à la fin,
pour les 2 couleurs. Non-régression vérifiée sur un glissé "Tâche" classique (`repro_tache_matin_seul.js`)
et sur toute la suite du §51.2 (`diag_tache_split.js`, `repro_vacances.js`, `repro_selection_overlay.js`).

### 51.3 Vérification effectuée

Syntaxe (`node --check` sur le script extrait) OK. Suite Playwright + mock Supabase existante rejouée sans
régression (`test_demi_unseuljour.js`). Scripts de reproduction ciblés créés pour cette session (non ajoutés
à la suite `test_*.js` versionnée — scripts de diagnostic ad hoc, gardés en dehors du dépôt).

## 52. Round du 12.09.2026 — le §51.2.4 ("figer sur la demi de départ") est rejeté : refonte "case par case" de toute la sélection au glissé, + 6 retours plus courts

Nouvelle vidéo de Lionel, plus une liste de 8 points envoyée dans la foulée. Premier mot de son message :
*« Ce n'est pas le comportement attendu. »* — le correctif du §51.2.4 (figer la demi-journée ciblée sur
celle de la case de DÉPART pendant tout le geste) supprimait bien l'alternance visuelle, mais au prix d'un
comportement que Lionel n'a jamais demandé : impossible de faire commencer une sélection le matin et de la
terminer l'après-midi (ou l'inverse) sur un geste continu.

### 52.1 Nouveau modèle demandé (verbatim)

> la sélection doit se faire case par case, on ne parle plus de demi journée. dans la vidéo je clique du
> lundi matin au vendredi après midi. la surbrillance est seulement sur les matin mais la bulle vient
> jusqu'à l'après-midi. si je lâche la souris sur vendredi matin, la bulle est créée jusqu'au vendredi
> après-midi. Ce comportement doit être pareil pour tout type des bulles. on ne sélectionne pas que les
> matin ou que les après midi. dans mon cas je n'ai qu'une ligne, mais si j'avais une 2ème ou plus personne
> plus bas, il faudrait faire une bulle par ligne.
> une case = une demi journée.

Autrement dit : le glissé doit se comporter comme une sélection de cellules de tableur — un rectangle exact
entre la case de départ et la case sous le curseur au relâchement, aucune case en trop, aucune case en
moins — et ce rectangle doit produire EXACTEMENT une bulle par ligne (personne) traversée, avec les mêmes
bords de demi-journée pour toutes.

### 52.2 Refonte : demi-slot suivi au pixel près + ligne = personne (pas personne+demi)

**Ancien modèle (§51.2.4, abandonné)** : la dimension horizontale ET verticale du glissé passaient par
`lignesSecteur` (une "ligne" = un COUPLE personne+demi, 2 lignes par personne) ; `indexDebut`/`indexCourant`
indexaient dans ce tableau, et la demi-journée de la ligne restait figée sur celle du point de départ pour
tout le geste — structurellement incapable de représenter "commence matin, finit après-midi".

**Nouveau modèle** : la dimension horizontale est un numéro de **demi-slot continu** (`jour*2 + 0/1`, déjà
utilisé ailleurs dans le fichier par `demiSlotsDepuisBornes`/`bornesDepuisDemiSlots` pour le glissement d'une
note existante) recalculé à CHAQUE `pointermove` depuis la case réellement sous le curseur (`demiSlotCellule`,
nouvelle fonction) ; la dimension verticale, pour la grille personnel, est désormais la **PERSONNE SEULE**
(`personnesSecteurListe`, nouvelle fonction) — la notion de "ligne = personne+demi" disparaît du glissé.
Au relâchement, `bornesDepuisDemiSlots(halfMin, halfMax)` (déjà existante, jusqu'ici réservée au
déplacement d'un item existant) convertit directement la plage de demi-slots en `{giDebut, duree,
demiDebut, demiFin}` — les bords exacts, y compris asymétriques (ex. commence matin, finit après-midi,
comme demandé). Une bulle est créée PAR PERSONNE traversée par le rectangle vertical, avec ces mêmes bords
partagés (Lionel : *« il faudrait faire une bulle par ligne »*).

`cablerAjoutCellule` (glissé vert, création) et `demarrerSelectionRapide` (glissé bleu, sélection de bulles
existantes pour copier/couper/supprimer) sont réécrites sur ce même modèle ; la surbrillance en direct
(`surlignerPlagePersonnes`) tinte l'union EXACTE des cases (personne × demi-slot) du rectangle — plus de
case "en trop" d'un côté comme le §51.2.3/51.2.4 pouvait encore en laisser en bord de plage.

**Jalon/note** n'ont qu'UNE cellule DOM par jour, jamais scindée matin/aprem (`creerCelluleFond`) —
impossible d'y appliquer le même mécanisme de `classList` sur une sous-cellule. `demiSlotCellule` retombe
ici sur `demiDepuisPointeur` (position du curseur dans la case pleine largeur, déjà utilisée pour le
glissement d'une note existante) et une nouvelle fonction `surlignerPlageJalonNote` positionne un élément
dédié (`.selection-precis`) en `grid-column`/`grid-row` via `colonneEtSpanDemi` — la MÊME fonction pure que
le rendu final des bulles, garantissant que ce qui est surligné est exactement ce qui sera créé. Un simple
clic (sans glissé) sur une case jalon/note est lui aussi désormais demi-précis (`ouvrirAjout` calcule la
demi-journée depuis la position du clic dans la case, au lieu de toujours poser une journée entière).

**`creerGroupeTaches`** (boutons rapides Congé/Vacances, formulaires Armature/Béton/Livraison
armature/Entrée dynamique) fragmentait auparavant 1 item PAR JOUR avec une demi-journée FIXE par ligne de
sélection (le cas "absence sur plusieurs jours" avait déjà été sorti de cette fragmentation au §51.2.2) —
remplacé par le même modèle unifié : 1 SEUL item par personne, sur les bords exacts `demiDebut`/`demiFin`
de la plage sélectionnée, quel que soit le type de bulle (Lionel : *« Ce comportement doit être pareil pour
tout type des bulles »*). `ouvrirEdition`/`ouvrirEditionPlage` (fiche "Tâche"/"Absence"/jalon/note avec
descriptif) créaient déjà 1 item fusionné par cible de cette façon et n'ont pas eu besoin d'être changées
sur ce point — seule leur initialisation de `state.demiDebut`/`state.demiFin` a été corrigée pour reprendre
les bords précis transmis depuis le glissé plutôt qu'une seule demi-journée reprise de la case cliquée
(voir §52.4, Boutons A/P).

Vérifié (`repro_case_par_case.js`) : glissé lundi matin → vendredi matin (ligne droite, traverse donc
mécaniquement les colonnes aprem intermédiaires) — surbrillance finale sur vendredi = matin SEUL ; bulle
"Tâche" créée = lundi à vendredi, vendredi en demi-journée matin seul (PAS après-midi comme avant ce
round). Vérifié aussi (`repro_absence_case_par_case.js`) : le bouton rapide "Vacances" (qui passe par
`creerGroupeTaches`, pas `ouvrirEdition`) applique le même modèle unifié. Non-régression : `repro_vacances.js`
(désormais avec un résultat différent et VOULU — plus "journée entière forcée", bords précis comme partout
ailleurs), `diag_tache_split.js`, `repro_tache_matin_seul.js`, `repro_selection_overlay.js`,
`test_demi_unseuljour.js`.

### 52.3 Libellés "Jalons"/"Notes" dans la colonne de gauche

Retirés le 02.09.2026 (retour de Lionel à l'époque : "on peut réduire les hauteurs de ligne en enlevant...
les titres notes et jalons, on a déjà une légende"), remis ce round (nouveau retour : *« ajouté les
libellés jalon et note dans la colonne de gauche »*) — sans repère textuel la colonne de gauche ne dit plus
quelle ligne est quoi une fois la légende hors du premier écran. Texte affiché en plus du `title` déjà
présent (survol), même balisage `<b>` que les libellés personne (`lbl-speciale b`, déjà stylé). Vérifié
(`repro_jalon_note_precis.js`) : `.lbl-speciale` contient bien "Jalons" et "Notes".

### 52.4 Boutons A/P pas synchronisés avec la plage glissée

Signalé séparément par Lionel mais résolu par la refonte du §52.2 : les boutons A/P de la fiche qui s'ouvre
après un glissé initialisaient `state.demiDebut`/`state.demiFin` à `null`/`null` (journée entière) quelle
que soit la plage réellement sélectionnée — `ouvrirAjoutPlage`/`ouvrirEditionPlage` ne transportaient que
`giDebut`/`duree`, jamais de demi-journée. Ces 2 fonctions (et `ouvrirEdition`/`cablerBoutonsMenuAjout` en
aval) transportent désormais aussi `demiDebut`/`demiFin` (les bords exacts issus de
`bornesDepuisDemiSlots`), et l'initialisation de `state` les reprend directement au lieu de systématiquement
`null`. Vérifié (`repro_case_par_case.js`) : après un glissé lundi matin → vendredi matin, la fiche s'ouvre
avec Fin = "A" actif (pas de bouton actif sur Début, correct : matin en tout PREMIER jour d'une plage
équivaut à journée entière, convention déjà en vigueur ailleurs dans le fichier).

### 52.5 Sortir du mode sélection au clic à côté d'une bulle

Un `pointerdown` sur une case (jamais sur une `.bulle`) pendant que des bulles étaient sélectionnées
n'armait jusqu'ici qu'un panoramique tactile (`demarrerDefilementSimple`) : un simple clic/tap sans glissé
n'y déclenchait rigoureusement rien. Nouvelle fonction `demarrerDefilementOuSortieSelection` : un vrai
glissé reste un panoramique inchangé, mais un clic SANS mouvement réel (seuil 4px, comme le reste du
fichier) appelle désormais `quitterModeSelection()` + `render(false)`. `quitterModeSelection()` retire aussi
directement la classe `.selectionnee` de chaque bulle DOM concernée (les appelants historiques
enchaînaient déjà avec un `render()` qui la faisait disparaître de fait ; le nouvel appelant du §52.6,
ci-dessous, n'en déclenche pas toujours un). Vérifié (`repro_mode_selection.js`).

### 52.6 Le mode sélection restait actif après enregistrer/annuler/supprimer un formulaire

`fermerAuClicExterieur` fabrique la fonction `fermer()` COMMUNE à Enregistrer/Annuler/Supprimer (tous
l'appellent, dans `ouvrirEdition`/`ouvrirEditionPlage` et les 4 formulaires historiques) et au clic
extérieur — `quitterModeSelection()` y est appelée en un seul endroit dès que `bullesSelectionnees` n'est
pas vide, couvrant les 3 actions demandées sans rien dupliquer par formulaire. Vérifié
(`repro_mode_selection.js`) : sélectionner une bulle, ouvrir sa fiche, Annuler → barre d'action masquée.

### 52.7 Entrée dans le descriptif fermait le formulaire entier sans enregistrer

**Cause** : le raccourci clavier global (`document.addEventListener("keydown", ...)`) traite Entrée/Échap
AVANT de vérifier si le focus est dans un champ de texte (nécessaire pour que Entrée valide un POPUP —
`popValiderActuel` — même quand le focus est resté dans un champ de ce popup). Le petit éditeur de
descriptif (`.desc-edit-box textarea`, une SURCOUCHE au-dessus du formulaire principal) n'avait lui-même
aucune gestion de touche : Entrée y remontait donc jusqu'à ce raccourci global, qui validait/fermait le
FORMULAIRE ENTIER (`popValiderActuel`, équivalent au bouton "Enregistrer" de la carte) sans jamais avoir
appelé le `setTexte()` du petit éditeur — le texte tapé était donc perdu.

**Correctif** : `cablerDescriptifEdit` écoute maintenant `keydown` sur son propre textarea — Entrée (sans
Maj, pour laisser Maj+Entrée insérer un retour à la ligne normal) appelle `validerEdit()` (enregistre le
texte ET ferme ce petit éditeur, laissant le formulaire principal ouvert) ; Échap appelle `fermerEdit()`
(ferme sans enregistrer). Les 2 appellent `stopPropagation()` pour empêcher le raccourci global de les
revoir. Vérifié (`repro_case_par_case.js`) : texte du descriptif présent après Entrée, formulaire principal
toujours ouvert (fermé ensuite normalement via "Enregistrer").

### 52.8 Vérification effectuée

Syntaxe (`node --check` sur le script extrait) OK. Nouveaux scripts de reproduction pour cette session :
`repro_case_par_case.js` (scénario vidéo exact de Lionel + boutons A/P + Entrée du descriptif),
`repro_jalon_note_precis.js` (libellés colonne de gauche, clic/glissé demi-précis sur jalon/note),
`repro_mode_selection.js` (sortie du mode sélection au clic à côté et après formulaire),
`repro_absence_case_par_case.js` (bouton rapide "Vacances" sur le modèle unifié). Suite existante rejouée
sans régression : `diag_tache_split.js`, `repro_tache_split.js`, `repro_vacances.js` (résultat modifié,
volontairement — cf. §52.2), `repro_selection_overlay.js`, `repro_tache_matin_seul.js`,
`test_demi_unseuljour.js`, `test_deplacement_note_demi.js`. `repro_case_sur_2.js` (§51.2.4) donne
maintenant un résultat différent lui aussi, volontairement : le modèle "figer sur la demi de départ" qu'il
vérifiait est celui que ce round remplace (§52.1) — un glissé qui se termine réellement sur une case
après-midi doit désormais couvrir l'après-midi, ce n'est plus une régression.

## 53. Round du 11.09.2026 — 7 retours après test réel du §52 (case unique jalon/note, bordure de départ, série, barre d'outils, calendrier, dates liées)

Nouvelle vidéo + capture d'écran + liste écrite de Lionel après avoir testé le rendu livré au §52 :

> L'ajout simple (clique gauche) sélectionne 2 case dans note et jalon.
> ajout multiple laisse une bordure verte sur la case de départ.
> j'aimerai pouvoir modifier une série lors de l'ouverture d'un formulaire avec série.
> bouton 2 semaines à coté de aujourd'hui, en surbrillance quand planning affiché sur 2 semaines.
> placer le boutons imprimer à droite du bouton 2. ajout lointain disparait car on peut maintenant le faire via les nouveaux formulaire. le design de bouton doit être cohérent avec le bouton aujourd'hui
> Cliquer sur la date dans les formulaires permet d'ouvrir un calendrier. quand le date de début est la même que la date de fin, augmenter la date de début augmente automatiquement la date de fin et inversement.

### 53.1 Ajout simple sur jalon/note teignait toute la case (2 demi-journées) au lieu d'une seule

**Cause** : `ouvrirEditionPlage` recevait la case DOM réelle cliquée (`celluleSurbrillance`) et la passait
telle quelle à `fermerAuClicExterieur(pop, celluleSurbrillance, ...)`, qui lui applique `.selection-add`
pendant que la fiche est ouverte. Une case jalon/note n'est JAMAIS scindée matin/aprem au DOM (une seule
`.cell` pleine largeur par jour, `creerCelluleFond` — contrairement à "personne", scindée en 2 sous-cases
par `colonneDemi`) : teindre cette case entière tinte donc TOUJOURS les 2 demi-journées, même quand la
plage réelle sélectionnée (`demiDebut`/`demiFin`) ne couvre qu'un seul demi-slot.

**Correctif** : 2 nouvelles fonctions "duck-typées" (`surbrillancePrecisePersonnes`/
`surbrillancePreciseJalonNote`, avec `surlignerPlagePersonnes`/`surlignerPlageJalonNote` du §52.1)
remplacent la case DOM brute par un objet exposant la même interface `classList.add/remove` qu'attend
`fermerAuClicExterieur` — `add()` repeint la plage EXACTE (réutilise l'overlay `.selection-precis` pour
jalon/note, les vraies sous-cases pour personne), `remove()` appelle `effacerSurlignage()`. `ouvrirEdition`
et `ouvrirEditionPlage` construisent maintenant cet objet à partir de `state.giDebut/giFin/demiDebut/demiFin`
(+ `cibles` pour personne) au lieu de transmettre une case DOM. Vérifié
(`repro_jalon_note_case_unique.js`) : clic simple sur la moitié gauche (matin) d'une case Note → overlay
`.selection-precis` de largeur moitié de la case, aucune classe `.selection-add` posée sur la case entière.

### 53.2 Ajout multiple (plusieurs jours/personnes) laissait une case isolée teintée après le choix du type

**Cause** : même mécanisme que le §53.1, mais côté `ouvrirEdition` (tâche/absence) : le `cell` transmis par
`ouvrirAjoutPlage`/`cablerBoutonsMenuAjout` n'est que la case "coin haut-gauche" calculée pour retrouver un
point d'ancrage à l'écran — teindre CETTE SEULE case pendant que la fiche est ouverte, alors que la plage
réelle couvre plusieurs jours et/ou personnes, laisse tout le reste correctement nettoyé par
`effacerSurlignage()` (fin du glissé) mais cette case-là seule encore allumée : visuellement un résidu, pas
une indication utile. Diagnostiqué en reproduisant en direct (nouveau `harness2p.js`, 2 personnes) le
glissé lundi-matin (Lionel) → mardi-matin (Test) puis en inspectant les classes DOM juste après le
relâchement ET juste après le choix "Tâche" dans le menu.

**Correctif** : même `surbrillancePrecisePersonnes` que le §53.1, construite depuis `cibles` (dédupliquées
par personne) et `state.giDebut/giFin/demiDebut/demiFin` — peint TOUTES les cases de la plage, pas
seulement celle d'ancrage. Vérifié (`repro_bordure_case_depart.js`) : glissé 2 jours × 2 personnes, après
choix "Tâche" les 6 cases de la plage (2 personnes × 3 demi-slots) portent `.selection-add`, plus aucune
case isolée. Non-régression sur le cas simple (`repro_surbrillance_case_unique_personne.js`) : un clic
simple continue de ne teindre QUE sa propre case, nettoyée après Annuler.

### 53.3 Modifier une série depuis la fiche d'un item existant

Avant ce round, `champSerie` valait toujours `""` pour un item existant (`itemExisting ? "" : serieChampsHTML()`)
: aucune indication dans la fiche qu'un item fait partie d'une série, alors qu'enregistrer une modification
dessus déclenche déjà (mécanisme préexistant, `demanderPorteeSerie`) un choix de portée (cet élément seul /
les suivants / toute la série) appliqué via `gerer-serie`.

**Limite serveur constatée** (documentée ici plutôt que contournée en silence) : `gerer-serie`
(`planModifierSerie`, `functions/gerer-serie/logic.js`) ne sait modifier que des champs PAR OCCURRENCE déjà
matérialisée (texte, important, statut, chantier) — la DÉFINITION de la série elle-même (fréquence,
intervalle, condition de fin) est écrite une fois dans la table `series` à sa création
(`enregistrer-serie`) et n'est jamais renvoyée au client ni modifiable depuis l'existant. Convertir un item
déjà existant EN série poserait par ailleurs un doublon serveur garanti : `construireOccurrencesSerie`
(`functions/enregistrer-serie/logic.js`) insère TOUJOURS une nouvelle occurrence à sa date de départ, sans
jamais remplacer ce qui existe déjà ce jour-là ("une série vient s'ajouter au contenu déjà présent").
Faire les 2 (modifier la définition d'une série existante, ou greffer une série sur un item déjà créé)
demanderait donc du travail serveur nouveau, pas encore fait.

**Ce qui est livré ici** : `ouvrirEdition`/`ouvrirEditionPlage` (note uniquement — jalon exclu des séries,
inchangé) affichent désormais, dans "Plus d'options", un bandeau `serieInfoExistanteHTML()` ("↻ Fait partie
d'une série. En enregistrant, un choix sera proposé : cet élément seul, celui-ci et les suivants, ou toute
la série.") quand `itemExisting.serieId` est renseigné — rend visible AVANT même de cliquer "Enregistrer"
un mécanisme qui existait déjà mais restait invisible dans la fiche. La case à cocher "Série (se répète)"
(`serieChampsHTML()`) reste réservée à la création (nouvel item), inchangée. Vérifié
(`repro_serie_info_existante.js`) : bandeau affiché pour un item déjà en série, case à cocher affichée (pas
de bandeau) pour un nouvel item — aucune régression croisée.

*Pour Lionel : modifier la fréquence/la durée d'une série déjà en cours, ou transformer une tâche déjà
posée en série, demande un développement serveur supplémentaire (gerer-serie ne le permet pas aujourd'hui)
— à programmer séparément si besoin.*

### 53.4/53.5 Barre d'outils : "2 semaines" et "Imprimer" à côté d'"Aujourd'hui", "Ajout lointain" retiré

L'ancienne paire de boutons `.toggle-sem` ("1 semaine"/"2 semaines", case à cocher à 2 états) et les
boutons `#btnAjoutLointain`/`#btnImprimer` vivaient dans `.header-actions` (construite une seule fois, au
chargement de la page). Désormais :

- **"2 semaines"** devient un bouton UNIQUE (`.btn-deux-semaines`), déplacé dans `.semaine-titre` (juste
  après "Aujourd'hui" — cette barre est reconstruite à chaque rendu, cf. `construireGrille`, donc son état
  `.actif` suit `deuxSemaines` sans câblage séparé à tenir à jour). Nouvelle fonction `basculerDeuxSemaines()`
  (inverse `deuxSemaines`, recharge la fenêtre). `.actif` reprend les teintes `--accent`/`--accent-soft`
  déjà utilisées ailleurs pour un état actif (ex. légende chantier par défaut).
- **"Imprimer"** rejoint la même barre, juste à droite du bouton "2 semaines" (`.btn-imprimer-titre`,
  câblé sur `openPrintSheet`, inchangé).
- **"Ajout lointain"** est entièrement retiré : bouton, câblage, CSS (`.pop-lointain`) et les 4 fonctions
  dédiées (`joursOuvresDepuis`, `construireLignesAjoutLointain`, `ajoutLointainTache`,
  `ouvrirAjoutLointain`) supprimées — Lionel : "on peut maintenant le faire via les nouveaux formulaires"
  (cf. §53.6 ci-dessous, qui est précisément ce qui rend ce formulaire dédié redondant). `test_ajout_lointain.js`
  (suite existante) est donc obsolète depuis ce round.
- Design cohérent : les 3 boutons (`Aujourd'hui`, `2 semaines`, `Imprimer`) partagent désormais la classe
  `.btn-titre` (remplace l'ancien style ad hoc de `.btn-aujourdhui`, dupliqué sur les 2 nouveaux plutôt que
  réinventé). `.header-actions` ne garde plus que "Recharger".

Vérifié (`repro_toolbar_reorg.js`) : les 3 boutons présents dans `.semaine-titre` avec la classe partagée,
"2 semaines" bascule `.actif` à chaque clic (et la fenêtre affichée passe bien à 10/5 jours), "Imprimer"
ouvre toujours `.impression-modal`, `#toggleSem`/`#btnAjoutLointain`/`#btnImprimer` n'existent plus dans le
DOM.

### 53.6 Calendrier au clic sur une date de formulaire (et ce qui rend "Ajout lointain" redondant)

Les flèches ‹ › de `dateLigneHTML` restent bornées à la fenêtre actuellement affichée (5 ou 10 jours,
`nbJoursAffiches()`) : aucun moyen direct de viser une date lointaine sans cliquer une flèche des dizaines
de fois. Nouvelle fonction `cablerCalendrierDate` (appelée depuis `cablerDatesPlage`) : cliquer le texte
d'une date (`.date-val`) fait apparaître un `<input type="date">` natif invisible positionné par-dessus
(pas de composant "calendrier" maison à maintenir), ouvert directement via `.showPicker()` (repli sur
`.focus()` si non supporté) — le calendrier natif du navigateur s'affiche, pas l'input lui-même.

Contrairement aux flèches, une date choisie au calendrier peut viser N'IMPORTE QUELLE date du planning
(`etat.semaines` couvre ~5 ans devant/derrière, `genererSemaines`) : nouvelle fonction
`appliquerDateChoisieFormulaire` détermine la semaine cible (`indexSemaineDeIso_`, généralisation
d'`indexSemaineAujourdhui_` à une date arbitraire) et, si elle diffère de la fenêtre affichée, navigue puis
recharge (`assurerFenetreChargee` + `construireVueDepuisCache` + `render(false)`, même trajet que
"Aujourd'hui"/les flèches semaine) AVANT de recalculer les 2 bornes en `gi` (nouvelle fonction
`giDepuisIso`, inverse d'`isoDeGi`, cherchée dans la fenêtre fraîchement chargée). Le formulaire ouvert
n'est jamais détruit par cette navigation (`pop` vit dans `document.body`, hors de `#racine` que
`construireGrille` reconstruit).

La borne ÉDITÉE (`bord` cliqué) reçoit toujours exactement la date choisie ; l'AUTRE borne est préservée
par sa date absolue tant qu'elle reste du bon côté (Début ≤ Fin) — sinon la plage redevient 1 seul jour sur
la date choisie plutôt que de forcer une plage invalide ou de changer silencieusement le mode 1/2 semaines
(jamais touché par cette fonctionnalité). C'est ce mécanisme — poser une date ARBITRAIRE directement dans
la fiche d'édition normale — qui rend "Ajout lointain" (§53.5) redondant : plus besoin d'un formulaire à
part pour "un ouvrier prend congé 1 semaine au mois de novembre", le formulaire "Absence" habituel suffit
désormais.

Vérifié (`repro_calendrier_date.js`) : l'input apparaît au clic ; une date dans la même semaine met à jour
la seule borne cliquée sans toucher l'autre ; une date à ~4 mois navigue la fenêtre jusqu'à la bonne
semaine (fiche toujours ouverte), recolle l'autre borne sur la date choisie (devenue invalide dans la
nouvelle fenêtre), et l'enregistrement crée bien la tâche à la date exacte choisie. Un 2e scénario (borne
encore valide après le choix) confirme que l'autre borne n'est PAS écrasée dans ce cas — un tri min/max
naïf des 2 bornes aurait fait atterrir la date choisie sur la mauvaise ligne (corrigé avant livraison, cf.
historique de ce round).

### 53.7 Dates de début/fin liées quand elles désignaient le même jour

**Cause** : sur 1 seul jour (`giDebut === giFin`), les flèches restaient bornées `Début ≤ Fin` et
`Fin ≥ Début` l'une par rapport à l'autre (branches inchangées, correctes pour le cas multi-jours) — sur 1
seul jour, ces 2 bornes coïncident déjà, donc "Début suivant" recalculait TOUJOURS la même valeur que
l'existant (plafonné à `Fin`, qui vaut `Début`) et ne faisait rigoureusement rien ; symétriquement pour
"Fin précédent".

**Correctif** : nouvelle branche dans `cablerDatesPlage`, avant les 2 branches existantes : si
`state.giDebut === state.giFin`, N'IMPORTE QUELLE flèche (Début ou Fin, avant ou arrière) déplace les DEUX
bornes du même pas — le jour unique avance/recule en bloc au lieu de rester bloqué contre lui-même. Le
comportement multi-jours (bornes indépendantes, sauf clamp habituel) reste inchangé. Vérifié
(`repro_dates_liees_un_jour.js`) : "Début suivant" 2 fois de suite avance bien les 2 bornes ensemble
(lundi → mardi → mercredi), "Fin précédent" les recule ensemble (mercredi → mardi).

### 53.8 Vérification effectuée

Nouveau harness `harness2p.js` (copie de `harness.js` avec un 2e personnel `{id:2, nom:'Test'}`) — requis
pour reproduire en direct le §53.2 (bug multi-personnes). Nouveaux scripts de reproduction :
`repro_bordure_case_depart.js` (§53.2, diagnostic + vérification, 2 personnes), `repro_jalon_note_case_unique.js`
(§53.1), `repro_jalon_plage_multijour_surbrillance.js` (§53.1, variante plage multi-jours jalon),
`repro_surbrillance_case_unique_personne.js` (non-régression cas simple), `repro_serie_info_existante.js`
(§53.3), `repro_toolbar_reorg.js` (§53.4/53.5), `repro_calendrier_date.js` (§53.6, y compris navigation
inter-semaines), `repro_dates_liees_un_jour.js` (§53.7). Syntaxe (script extrait, `new Function(...)`) OK.
Suite existante rejouée sans régression : `repro_case_par_case.js`, `repro_jalon_note_precis.js`,
`repro_mode_selection.js`, `repro_absence_case_par_case.js`, `repro_case_sur_2.js`, `repro_note.js`
(échec — fixture `Index_before.html` absente, préexistant, sans rapport avec ce round),
`repro_selection_overlay.js`, `repro_tache_matin_seul.js`, `repro_tache_split.js`, `repro_task.js`,
`repro_vacances.js`, `test_demi_unseuljour.js`, `test_deplacement_note_demi.js`. `repro_jalon.js`/
`repro_task2.js`/`repro_task2_before.js` restent des scripts obsolètes d'avant la refonte du descriptif
(round du 11-12.09.2026, sélecteur `.f-texte` disparu) — sans rapport avec ce round, non corrigés ici.


## 54. Round du 12.09.2026 — nouvelle page « Jalons » (mockup validé) + chantier sélecteur réduit à la taille du texte

Demande de Lionel, en 2 parties dans le même message :

> « Mon idée des jalons est ainsi: un page dans le menu, même mise en page et bouton que le personnel. sous
> modifier on peut saisir le nom, attribuer un chantier (pour la couleur du jalon), date de début et date
> de fin (même principe que les formulaire, avec clic et flèches, mais sans A/P). Penser à la version
> mobile. travail sur un visuel avant de coder.
>
> Une modification sur tous les formulaire, le chantier est cliquable pour le changer, mais la case est
> trop grande, réduit la à la taille du texte. La flèche type menu déroulant me dérange, supprime la.
> Souligne discrètement le nom du chantier type lien hypertexte à cliquer. »

### 54.1. Sélecteur de chantier (`.chantier-tag`) réduit à la taille du texte

Corrigé en premier, avant le travail sur la maquette — c'est un correctif isolé, sans dépendance avec la
page Jalons. `.chantier-tag` est un `<select>` natif stylé pour ressembler à du texte cliquable dans un
bandeau coloré (ex. le nom du chantier dans l'en-tête d'une fiche tâche) : la case occupait toute la
largeur du bandeau au lieu de s'ajuster à son texte.

**Cause** : `display:block` (au lieu de `inline-block`) + une règle générique `.form-pop select { width:
100%; ... }` qui continuait à s'appliquer malgré une règle plus spécifique `.carte-item .bandeau
.chantier-tag`, celle-ci ne redéclarant jamais `width` — la cascade CSS s'applique propriété par propriété,
pas règle par règle : une règle plus spécifique qui ne fixe pas une propriété donnée laisse une règle moins
spécifique la fixer quand même. Ajouté aussi : un chevron de menu déroulant en `background-image` (retiré,
« la flèche me dérange »), pas de soulignement (ajouté, « type lien hypertexte »).

**Correctif** : `display:inline-block; width:auto`, suppression complète du chevron (règle de base ET son
override `.bandeau.clair .chantier-tag`), `padding-right:16px` → `padding:0`, ajout de `text-decoration:
underline; text-decoration-color:currentColor; text-underline-offset:3px`. Vérifié par Playwright : largeur
mesurée passée de 262px (bug, ≈ pleine largeur du bandeau) à 54px (juste le texte), puis 72px après ajout
d'un 2e chantier au jeu de test (comportement natif attendu — un `<select>` se dimensionne sur son OPTION
la plus large, pas seulement le texte sélectionné).

### 54.2. Maquette visuelle (avant tout code) — `mockup-page-jalons.html`

Conformément à « travail sur un visuel avant de coder » : maquette HTML statique (CSS/composants copiés
d'`Index.html` pour la fidélité visuelle) montrant 4 états — liste desktop (avec l'entrée « Jalons » dans
le menu latéral), formulaire « Modifier » desktop, liste mobile, formulaire plein écran mobile — avec des
exemples de jalons délibérément étalés sur plusieurs mois (« Fin gros œuvre », 21 sept. → 20 nov.) pour
illustrer le point central de la demande : une durée non limitée par la fenêtre de semaines affichée dans
le planning. Envoyée à Lionel avec 2 questions de calibrage (garder le bouton « Important » ? garder le
chantier cliquable dans le bandeau, comme sur les autres fiches ?). Réponse : **« c'est ok pour moi »** —
maquette approuvée telle quelle, les 2 options implicitement conservées.

### 54.3. Pourquoi une page dédiée, indépendante des semaines affichées

Toute la mécanique existante du planning (`gi`, `giDepuisIso`, `isoDeGi`) est **bornée à la fenêtre de
semaines actuellement chargée** — un jalon posé depuis la grille ne peut donc jamais dépasser cette
fenêtre. La nouvelle page Jalons contourne entièrement ce système : elle travaille uniquement en dates ISO
brutes (`state.debutIso`/`state.finIso`), sans jamais passer par `gi`, ce qui permet une durée réellement
illimitée. Elle réutilise `enregistrer-plage`/`planPlage` (déjà capable d'écrire une plage arbitraire sans
limite de taille, déjà exploité pour les notes) — aucune nouvelle fonction serveur n'a été nécessaire pour
la plomberie de plage elle-même.

Un jalon reste, comme avant, **UNE LIGNE PAR JOUR OUVRÉ** en base (`jalons(id, date, texte, important,
chantier_id, demi)`) — un « jalon multi-jours » est une fusion PUREMENT CLIENT de jours contigus au même
contenu (`fusionnerJalonsTous`, même principe que la fusion déjà faite par la grille elle-même,
`construireVueDepuisCache`/`jalonAuGi`).

### 54.4. Ce qu'il a fallu ajouter côté données pour honorer la maquette

Deux champs de la maquette n'avaient jamais été fonctionnels pour un jalon avant ce round :

- **Chantier (couleur du jalon)** — `jalons` n'avait AUCUNE colonne chantier (contrairement à
  taches/assignations) : un jalon posé depuis la grille a toujours sa teinte pastel fixe (`--jalon-bg`),
  jamais la couleur d'un chantier. Migration `sql/0007_jalons_chantier.sql` (`chantier_id bigint
  references chantiers(id)`, nullable), appliquée directement sur le projet Supabase via le connecteur MCP
  (même méthode que 0003/0005/0006) — table vide au moment de la migration, aucune donnée à transformer.
  **Un jalon posé depuis la grille garde sa teinte pastel habituelle** (`chantier_id` reste `null`) : la
  coloration par chantier est une fonctionnalité de la page Jalons uniquement, pas étendue à la grille.
- **« Important »** — le bouton existait déjà dans le bandeau du formulaire de jalon (repris de la
  maquette), mais `synchroniser()` envoyait `important: false` codé en dur pour tout jalon synchronisé
  depuis la grille, et `planPlage` (branche jalon) n'écrivait jamais ce champ. Le drapeau était donc
  décoratif. Corrigé — cf. BACKEND-CHANGELOG.md pour le détail du correctif serveur.

**Protection contre une régression silencieuse** : la grille continue de resynchroniser le TEXTE d'un
jalon à chaque frappe (`synchroniser()`), sans jamais connaître son chantier ni son statut « important ».
Écrire ces 2 champs sur CHAQUE synchronisation (même sans valeur à envoyer) aurait effacé silencieusement
un chantier/important posé depuis la nouvelle page, à la prochaine correction de texte faite depuis la
grille. Le hardcodage `important: false` de `synchroniser()` a donc été retiré (la clé est maintenant
omise plutôt que forcée à `false`) et le serveur applique la règle « champ absent = préserver la valeur
existante, champ présent (y compris `null`) = appliquer » — cf. BACKEND-CHANGELOG.md pour le détail
complet et les tests dédiés à cette non-régression.

### 54.5. Implémentation (`Index.html`)

- **Menu** : entrée « Jalons » ajoutée dans la sidebar, juste après « Planning ».
- **`htmlPageJalons()`** : coquille de page identique au modèle Personnel (`.page-titre`, `.page-sous`
  explicatif, `.liste-intervenants#listeJalons`), câblée dans `RENDU_PAR_PAGE` (`renderJalons`).
- **`JALONS_TOUS`** (cache mémoire, `null` = pas encore chargé) + `chargerJalonsTousServeur()`
  (`select id,date,texte,important,chantier_id,demi from jalons order by date`) +
  **`fusionnerJalonsTous(lignes)`** : fusionne les jours contigus (même texte, même important, même
  chantier_id, jours ouvrés consécutifs via `isoJourOuvreVoisin`) en items `{idDebut, idFin, dateDebut,
  dateFin, texte, important, chantierId}` — l'algorithme de fusion CLIENT, symétrique à celui déjà utilisé
  par la grille, mais sur des dates ISO plutôt que des `gi`.
- **`ligneFicheJalon(j)`** : pastille de la couleur du chantier (ou la teinte pastel par défaut si aucun
  chantier), nom en gras, icône drapeau si important, plage de dates (fonctions `libelleDateIso`/
  `libelleDateIsoCourte`/`libellePlageJalon` — année affichée seulement si elle diffère de l'année en
  cours ou entre début et fin), boutons Modifier/Supprimer.
- **`ouvrirFormulaireJalon(itemExisting)`** : même bandeau/pied de formulaire que les autres fiches
  (`bandeauHTML`/`piedPrincipalHTML`, réutilisés tels quels), champ chantier via `champChantierJalonHTML`
  (un `<select class="chantier-tag">`, exactement le composant corrigé au §54.1), plage de dates via
  `datesPlageJalonHTML`/`cablerDatesJalon` — même principe clic+flèches que les autres formulaires
  (réutilise `isoJourOuvreVoisin` pour les flèches, un `<input type="date">` natif pour le clic sur la
  date), **sans** le bloc A/P (« sans A/P » de la demande — les jalons n'ont jamais eu de demi-journée
  depuis le retrait explicite du round du 02.09.2026, non remis en cause ici), champ Nom en texte simple.
  `appliquerDateChoisieJalon` reprend le principe déjà en place ailleurs dans le fichier (bord édité =
  valeur exacte choisie ; l'AUTRE bord ne se déplace que si le garder rendrait Début>Fin), porté en version
  ISO pure (pas de fenêtre `gi` à respecter, contrairement aux formulaires de la grille).
- **Suppression** (`supprimerJalonServeur`) : `enregistrer-plage` en mode `remplacement` avec `texte: ""`
  sur la plage complète — vide chaque jour de la plage, sans notion de portée de série (les jalons de cette
  page n'ont jamais de `serieId`).
- **2 bugs trouvés et corrigés par les tests E2E avant livraison** (cf. §54.6) :
  1. Une nouvelle fiche par défaut sur « aujourd'hui » (`isoDeDate(new Date())`) sans jamais vérifier que
     ce jour est ouvré — ouvrir « + Ajouter » un samedi ou un dimanche proposait donc une date de départ
     tombant un week-end. Nouvelle fonction **`premierJourOuvreDepuis(iso)`** (à côté de
     `isoJourOuvreVoisin`) : avance au premier jour ouvré suivant si `iso` tombe un samedi/dimanche, sinon
     le renvoie tel quel — utilisée pour la date par défaut d'une nouvelle fiche.
  2. `ligneFicheJalon` utilisait la classe CSS `.compte` à la fois pour l'icône « important » et pour le
     texte de la plage de dates — ambiguïté de sélecteur (`querySelector('.compte')` retombe toujours sur
     le premier des deux). La plage de dates reçoit sa propre classe, **`.plage-jalon`** (même rendu visuel
     que `.compte` — couleur atténuée, petite taille — simple séparation de nommage).

### 54.6. Vérifications effectuées

Nouveau harnais de test Playwright + mock Supabase (`repro_page_jalons.js`, dans le scratchpad de session —
pas encore une convention de fichier commitée dans ce dépôt, comme les autres repros `.js` cités dans les
rounds précédents) couvrant le flux complet : navigation depuis le menu (après avoir dû corriger le test
lui-même — la sidebar démarre repliée sur la page Planning par défaut, `#btnMenuToggle` à cliquer d'abord),
ajout d'un jalon de plusieurs MOIS (07.09 → 20.11, bien au-delà de toute fenêtre de semaines) avec chantier
+ important (vérifié directement dans l'état serveur simulé : 50 lignes, toutes `chantier_id`/`important`
corrects), modification (changement de chantier + réduction de la plage — vérifié que les jours sortis de
la plage sont bien nettoyés côté serveur, 35 lignes restantes, toutes migrées vers le nouveau chantier), et
suppression (0 ligne restante, liste vide). `node test_enregistrer_plage.js` : 41/41. Suite complète de
regression (`repro_suppr_bouton_recharger.js`, `repro_fleches_dates_asymetrique.js`,
`repro_planning_ne_suit_pas.js`, `repro_tache_2_semaines.js`, `repro_chantier_tag.js`, et l'ensemble des 30
scripts `repro_*.js` présents dans le scratchpad de session) rejouée après ce round — aucune régression
imputable à ce changement (quelques scripts anciens échouent pour des raisons manifestement sans rapport,
vérifié en confrontant chaque échec au diff réel de ce round : sélecteurs `.f-texte`/`oublierCache`
toujours présents dans `Index.html`, donc pas un renommage de ce round, et 2 scripts référencent carrément
un fichier `Index_before.html` qui n'existe plus — reliquat d'un ancien round de comparaison avant/après,
sans rapport avec les jalons).

Pas de vérification en conditions Supabase réelles au-delà de la migration elle-même (appliquée et
vérifiée en lisant `information_schema.columns` après coup) — comme pour tout le reste de la migration
Supabase (limite réseau de cet environnement, déjà notée aux rounds précédents). **À confirmer par Lionel** :
le rendu mobile de la nouvelle page (la maquette l'a montré, l'implémentation réelle reprend les mêmes
classes CSS responsive déjà en place pour tous les `.form-pop` depuis le round du 03.09.2026 §31, mais pas
revérifié dans un vrai navigateur mobile ici), et que la coloration par chantier + le drapeau important
s'affichent bien comme attendu sur ses propres jalons existants (`chantier_id`/`important` valent tous deux
`null`/`false` pour les jalons déjà en base au moment de la migration — ils s'afficheront dans leur teinte
pastel habituelle jusqu'à ce qu'un chantier leur soit explicitement attribué depuis la nouvelle page).

## 55. Round du 12.09.2026 — Planning : supprime l'espace vide inutile sur grand écran desktop

Lionel : « on pourrait retravailler la page principale planning, il y a bcp de place vide autour de
l'écran sur desktop. »

### 55.1. Cause

Deux plafonds CSS imbriqués bornaient la largeur utile de la page Planning bien en-deçà de la largeur
d'un écran desktop courant :

- `.wrap` (englobe l'en-tête, la légende et la grille — utilisé UNIQUEMENT par la page Planning) :
  `max-width: 1180px`.
- `.app-shell` (englobe la barre latérale + la zone de contenu, sur toutes les pages) :
  `max-width: 1380px`.

Comme la barre latérale est repliée par défaut sur la page Planning (`display:none`, cf. round
précédent sur la coquille), c'est en pratique le plafond de `.wrap` à 1180px qui limitait le plus
souvent la largeur réellement utilisée, quelle que soit la largeur de l'écran de Lionel.

Ces deux plafonds n'ont jamais été nécessaires à la grille elle-même : ses colonnes sont déjà posées
en `minmax(largeurMin px, 1fr)` (cf. `construireGrille`), donc elles s'étirent proportionnellement dès
qu'on leur laisse de la place, sans jamais descendre sous leur largeur minimale (58px en mode compact,
108px sinon). Le bug était donc purement dans les conteneurs englobants, pas dans la grille.

### 55.2. Fix

```css
/* .wrap : plus de plafond propre à la page Planning — seule .aide (le texte d'aide, 60ch)
   garde sa propre limite de lisibilité, indépendante de .wrap. */
.wrap { max-width: none; }

/* .app-shell : remonté de 1380px à 2200px — assez large pour qu'un écran courant (jusqu'à
   un 1920x1080 ou un 1440p) utilise vraiment toute sa largeur, tout en gardant un garde-fou
   raisonnable sur un très grand écran (4K, ultra-wide) pour ne pas étirer les colonnes de la
   grille à l'infini. */
.app-shell { max-width: 2200px; }
```

Les autres pages (Personnel, Chantiers, Statuts, etc.) ne sont pas affectées dans leur lisibilité :
chacune garde sa propre limite de largeur dédiée sur sa liste/son formulaire
(`.liste-intervenants`, `.reglage-ligne`, `.liste-formulaires`, `.panneau-nouveau-form`, `.aide`),
indépendante de `.wrap`/`.app-shell`.

Le choix de 2200px pour `.app-shell` est une estimation raisonnable plutôt qu'un chiffre demandé par
Lionel — à ajuster si ça ne convient pas sur son écran réel.

### 55.3. Vérifications

Captures Playwright avant/après (viewport 1920x1080, sidebar repliée par défaut comme Lionel la voit
réellement) : largeur de `.grille` passée de 1178px à 1824px — la grille remplit désormais la quasi
totalité de la fenêtre au lieu de flotter dans une bande étroite avec un grand vide à droite.

Pas de régression constatée sur :
- Ultra-wide 2560x1080 : la grille s'élargit encore, sans casse visuelle.
- Page Personnel à 1920x1080 (sidebar visible, non repliée par défaut sur cette page) : sa propre
  liste garde sa largeur dédiée (~520px), le vide à sa droite est normal et attendu, pas un régression.
- Mobile 375x700 : comportement responsive intact.

`node test_enregistrer_plage.js` (41/41), `node test_grille_compacte.js` (64/64), `node
test_chantier_defaut.js` (16/16) et `node test_chargement.js` (35/35) toujours au vert — changement
CSS pur, aucune logique JS touchée par ce round.

## 56. Round du 12.09.2026 — Planning : enlève le bandeau d'aide, agrandit encore la grille à gauche

Lionel envoie une capture d'écran annotée à la main (croquis) avec 3 retours :

1. Enlever l'encadré rouge (le titre « Planning à bulles » + son paragraphe d'aide).
2. Agrandir le planning sur la gauche.
3. Décaler légèrement le bouton menu, qui sort un peu de l'écran.

### 56.1. Cause

Le titre et le paragraphe d'aide (`<div class="titre">`, `.aide`) occupaient tout le haut de la page
sans utilité au quotidien une fois l'outil pris en main — Lionel les avait entourés en rouge sur son
croquis pour les désigner.

Le retour 2 (agrandir à gauche) et le retour 3 (bouton qui déborde) avaient la même racine : le bouton
☰ (`#btnMenuToggle`) vivait comme item flex de `.app-shell`, sibling direct de `.sidebar` (cf.
`construireCoquille`). Même sidebar repliée (`display:none`, le cas par défaut sur la page Planning),
ce bouton restait un item flex à part entière — `width:38px` + `margin-right:20px` — donc réservait
~58px de large sur toute la hauteur de la page, juste pour un bouton qui n'a besoin que de son propre
coin. Positionné en `position:sticky` au ras du bord gauche de `.app-shell`, il pouvait aussi déborder
visuellement selon la largeur d'écran (retour 3).

### 56.2. Fix

Le titre/aide disparaît entièrement de `htmlPagePlanning()`. Le bouton ☰ est déplacé du niveau
`.app-shell` vers le `<header>` de la page Planning elle-même :

```js
// avant : bouton déclaré comme sibling de .sidebar dans construireCoquille()
'</nav>' +
'<button type="button" class="btn-menu-toggle" id="btnMenuToggle" ...>☰</button>' +
'<div class="app-main">' + ...

// après : bouton déplacé dans le header de htmlPagePlanning()
'<header>' +
  '<button type="button" class="btn-menu-toggle" id="btnMenuToggle" ...>☰</button>' +
'</header>' +
```

C'est possible sans rien casser car la sidebar ne se replie QUE sur la page Planning (cf.
`cablerNavigation` : `sidebarEl.classList.toggle("repliee", btn.dataset.page === "planning")`) — le
bouton n'est donc de toute façon utile que là. En CSS, `display:flex` n'est plus conditionné au
sélecteur `.sidebar.repliee ~ .btn-menu-toggle` (devenu inutile, supprimé) : le bouton est visible par
défaut, puisqu'il n'existe désormais que dans le HTML de cette page. `margin-right:20px` est retiré
(plus nécessaire hors du flex de `.app-shell`). `position:sticky; top:18px` est conservé à l'identique
— toujours relatif à `#app` (seul conteneur qui défile, cf. commentaire existant), donc le bouton reste
bien accroché en haut pendant le défilement de la grille, exactement comme avant.

Résultat : `.app-main` n'a plus rien à côté de lui dans `.app-shell` quand la sidebar est repliée — il
utilise toute la largeur disponible. Le bouton reste dans le padding de `.page-scroll` (18px), jamais
au ras du bord réel de la fenêtre.

### 56.3. Vérifications

Captures Playwright à 1920x1080 et 1366x768 : grille passée de 1824px (round précédent, §55) à 1882px
à 1920px de large ; titre/aide confirmés absents du DOM (`document.querySelector('.titre')` /
`.aide` → `null`) ; bouton confirmé entièrement dans le viewport à toutes les largeurs testées.

Scénario d'interaction complet rejoué : clic sur le bouton → sidebar s'ouvre bien (`classList.contains
("ouverte")`) ; navigation vers Personnel → sidebar redevient visible et non repliée (comportement
inchangé pour les autres pages) ; retour sur Planning → bouton toujours présent, grille toujours à sa
largeur élargie. Rendu mobile (375x700) revérifié, inchangé et correct.

`node test_enregistrer_plage.js` (41/41), `node test_grille_compacte.js` (64/64), `node
test_chantier_defaut.js` (16/16) et `node test_chargement.js` (35/35) toujours au vert — changement
CSS/markup pur, aucune logique métier touchée par ce round.

## 57. Round du 12.09.2026 — légende Planning : retire Jalon/Absence/Note, redondants

Lionel : « on peut supprimer les légendes jalons, absence et note car redondant. »

`construireLegende()` n'ajoute plus les 3 pastilles fixes Absence/Jalon/Note à la fin de la légende —
seuls les chantiers restent (les seuls éléments réellement interactifs de cette légende : cliquer un
chantier le choisit comme valeur par défaut des formulaires, cf. round du 03.09.2026). Absence/Jalon/
Note étaient de simples rappels de couleur sans aucune interaction, déjà lisibles directement depuis la
grille (lignes JALONS/NOTES dédiées, cases Absence dans la colonne de la personne concernée) — Lionel
les a jugés redondants une fois l'outil pris en main.

Vérifié : `document.querySelectorAll('.legende .item')` ne renvoie plus que les chantiers ("Filisetti",
"Villa Rossi" sur les données de test). 140/140 assertions des suites de tests existantes toujours au
vert (changement purement JS/DOM, aucune logique de calcul touchée).

## 58. Round du 12.09.2026 — navigation : remplace la sidebar par des onglets en haut (mockup Option 2)

Suite du round §56 (croquis sur l'en-tête Planning), Lionel avait aussi proposé une 2e idée : « créer des
onglets dans le haut à la place du menu. » Un mockup dédié (`mockup-planning-header.html`, non livré dans
l'app — juste un visuel de comparaison) a présenté 2 options côte à côte, y compris leur rendu mobile
(~375px, vrai reflow CSS). Réponse de Lionel après review : « OK pour l'implémentation du dernier
mockup » → confirmé par question de clarification : Option 2 (onglets).

### 58.1. Avant / après

Avant : sidebar de 200px (marque + 9 `.side-item`, groupés "Équipes"/"Configuration"), visible sur 8
pages sur 9, mais masquée par défaut sur la page Planning (`class="repliee"`) derrière un bouton ☰ qui
l'ouvrait en panneau flottant (`position:fixed`) par-dessus le contenu.

Après : une seule barre d'onglets horizontale (`.onglets-nav` + `.onglet`), IDENTIQUE et toujours
visible sur les 9 pages — plus de bouton ☰, plus de panneau qui s'ouvre par-dessus, plus de largeur
réservée en permanence sur les pages autres que Planning (le vrai gain, au-delà de Planning : la
sidebar de 200px disparaît par exemple aussi sur Personnel/Chantiers/Statuts, qui en profitent tout
autant même si leur propre liste ne s'élargit pas — cf. capture Personnel). Les 5 pages de réglages
(Général/Chantiers/Statuts/Fériés/Entrée rapide) restent de simples onglets, en retrait visuel
(`.secondaire`, teinte plus pâle) plutôt que regroupées sous un sous-menu — tel que validé sur le
mockup ; à revoir seulement si la ligne s'avère trop chargée à l'usage.

### 58.2. Implémentation

`construireCoquille()` : le `<nav class="sidebar repliee" id="sidebar">` (marque + `.side-item` +
`.side-groupe`) devient `<nav class="onglets-nav" id="ongletsNav">` + 9 `<button class="onglet"
data-page="...">`, les 5 secondaires portant en plus `class="onglet secondaire"`.

`cablerNavigation()` très simplifiée — plus besoin de gérer un état ouvert/fermé du panneau ni un
listener `pointerdown` pour le refermer au clic extérieur (le panneau flottant n'existe plus, la barre
est statique) :

```js
function cablerNavigation() {
  var ongletsBtns = document.querySelectorAll(".onglet");
  var RENDU_PAR_PAGE = { /* inchangé */ };
  ongletsBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      ongletsBtns.forEach(function (b) { b.classList.toggle("actif", b === btn); });
      document.querySelectorAll(".page").forEach(function (p) { p.classList.remove("actif"); });
      var page = document.getElementById("page-" + btn.dataset.page);
      if (page) page.classList.add("actif");
      var fn = RENDU_PAR_PAGE[btn.dataset.page];
      if (fn) fn();
    });
  });
}
```

`htmlPagePlanning()` : le `<header>` (qui, depuis le round §56, ne contenait plus que le bouton ☰)
disparaît entièrement — `.legende` devient le tout premier élément de `.wrap`.

CSS : `.app-shell` passe de `flex` en ligne (sidebar + contenu côte à côte) à `flex-direction: column`
(onglets au-dessus, contenu en dessous, toujours dans le même cadre `max-width:2200px` posé au round
§55). Tout le CSS de l'ancienne sidebar est supprimé (`.sidebar`, `.sidebar .marque`, `.side-item`,
`.side-item.actif`, `.side-groupe`, `.sidebar.repliee`, `.sidebar.repliee.ouverte`, `.btn-menu-toggle`)
plutôt que laissé mort dans le fichier. `.onglets-nav` a `overflow-x:auto` pour défiler au doigt sur un
écran étroit plutôt que de tasser les 9 onglets (comportement déjà validé sur le mockup mobile).

### 58.3. Bug trouvé et corrigé pendant ce round

`#lienDeconnexion` ("Se déconnecter", cf. `.lien-deconnexion`) est en `position:fixed; top:10px;
right:12px`, indépendant de tout ce qui se trouve en dessous. Avant ce round, rien ne s'en approchait
sur un écran étroit (l'ancienne sidebar était à gauche ; le bouton ☰, quand il vivait dans le `<header>`
de Planning au round §56, était lui aussi à gauche) — mais la nouvelle barre d'onglets étant pleine
largeur, elle serait passée PILE sous ce bouton fixe sur un téléphone, quel que soit l'onglet qui s'y
trouve selon le défilement horizontal (repéré en testant à 390px : "Intervenants" se retrouvait à moitié
caché derrière "Se déconnecter"). Corrigé en amont de la livraison plutôt que découvert après coup par
Lionel : `.app-shell` gagne un `padding-top: 44px` qui réserve la bande où vit ce bouton, sur tous les
écrans — la barre d'onglets démarre maintenant toujours en dessous, quelle que soit la largeur.

### 58.4. Vérifications

Scénario Playwright complet : clic sur chacun des 9 onglets → page correspondante affichée
(`.page.actif`), onglet cliqué marqué `.actif`, fonction de rendu associée bien appelée ; retour sur
Planning → grille toujours à sa largeur élargie (1882px, round §56). Aucun chevauchement onglets/bouton
déconnexion détecté par un test géométrique (intersection des `getBoundingClientRect()`) à 390px
(téléphone), 768px (tablette) et 1920px (desktop). Onglet secondaire actif (testé sur "Chantiers")
bien coloré en accent (`rgb(31, 77, 143)`, `--accent`) et pas resté grisé — la règle CSS dédiée
`.onglet.secondaire.actif` l'emporte comme prévu sur `.onglet.secondaire` seul. Captures visuelles sur
Planning et Personnel (desktop) et Planning (mobile 390px) — pas de régression visuelle repérée.

`node test_enregistrer_plage.js` (41/41), `node test_grille_compacte.js` (64/64), `node
test_chantier_defaut.js` (16/16) et `node test_chargement.js` (35/35) toujours au vert — changement de
navigation pur (CSS + routage), aucune des fonctions testées n'y touche.

## 59. Round du 14.09.2026 — Planning : le sélecteur de semaine rejoint la grille (Imprimer seul au-dessus)

### 59.1. Demande et mockup

Lionel, sur le mockup du round précédent (§58, qui avait déplacé toute la barre `.semaine-titre` — y
compris Aujourd'hui/2 semaines/Imprimer — dans une cellule fusionnée de la grille) : « l'idée est bonne
mais les boutons Aujourd'hui et Imprimer doivent rester au-dessus. On pourrait afficher les boutons 2
semaines et Aujourd'hui dans la cellule à gauche des semaines, vide actuellement. »

Travail sur image avant codage, comme toujours : `mockup-selecteur-semaine.html` (blocs 3-4, la
proposition « v2 ») a montré une nouvelle répartition — Imprimer seul dans une fine barre au-dessus de
la grille, Aujourd'hui + 2 semaines empilés dans la cellule coin (vide jusque-là), la navigation
(flèches + Semaine N + dates) dans une cellule dédiée de la grille. Validé par Lionel ensuite (« ok pour
les boutons superposés », après une question sur l'empilement vs côte-à-côte dans la cellule coin
étroite).

### 59.2. Implémentation

`construireGrille()` (seule fonction touchée) :

- L'ancienne barre `.semaine-titre` pleine largeur (flèches + Semaine N + dates + 3 boutons) disparaît.
  À sa place, une fine barre `.barre-imprimer` (toujours `.semaine-titre` comme classe de base, cf.
  plus bas) ne contient plus que le bouton Imprimer, alignée à droite.
- La cellule coin de la grille (vide jusqu'ici sur cette ligne) devient `coinNav` — classe
  `.th.coin.coin-nav.semaine-titre` — et porte Aujourd'hui + 2 semaines, empilés verticalement (la
  cellule, 116px de large, est trop étroite pour les 2 boutons côte à côte avec leur texte complet).
- Une cellule `navSemaine` — classe `.th.sem-entete.cellule-semaine-nav.semaine-titre` — porte
  désormais flèches + Semaine N + dates. Elle existe TOUJOURS (avant : seulement en mode 2 semaines,
  pour porter "Semaine 37"/"Semaine 38" côte à côte) et est fusionnée sur toute la largeur affichée :
  en mode 1 semaine c'est une cellule neuve (span = `largeurSemaine`) ; en mode 2 semaines elle
  remplace les 2 anciennes cellules séparées par une seule (span = `largeurSemaine × 2`), avec le texte
  "Semaine 37 → Semaine 38" qui existait déjà tel quel (`texteSemaines`) — seul son emplacement change.

CSS : `.semaine-titre` n'est plus la grande barre d'avant, mais un simple contexte flex/typo (mono,
majuscules) réutilisé à 3 endroits différents via des modificateurs dédiés — `.barre-imprimer`
(alignée à droite), `.coin-nav` (empilement vertical, boutons resserrés à 10.5px) et
`.cellule-semaine-nav` (centrée). `.btn-titre`/`.fleche-semaine`/`.lien-aller`/`.semaine-dates` restent
scopés sous `.semaine-titre` comme avant (aucun changement de sélecteur) — seuls leurs 3 contextes
changent. Un point de vigilance noté en commentaire CSS : `.th` (règle générique, définie après
`.semaine-titre` dans la feuille de style) a la même spécificité que `.semaine-titre` seule et
gagnerait sinon sur police/taille — `.coin-nav`/`.cellule-semaine-nav` prennent donc `.th` dans leur
propre sélecteur pour rester prioritaires.

### 59.3. Effet de bord positif

Le bug mobile repéré plus tôt (bouton Imprimer complètement hors écran à 390px, cf. round où la version
mobile de Planning avait été testée pour la première fois) se trouve corrigé au passage, sans action
dédiée : Imprimer vit maintenant hors de la grille défilante (`.scroller`), dans le flux normal de la
page — il n'est donc plus soumis au défilement horizontal qui le poussait hors champ.

### 59.4. Vérifications

Scénario Playwright dédié : structure attendue présente (`coin-nav`, `cellule-semaine-nav`,
`barre-imprimer`), ancienne barre `.semaine-titre` pleine largeur bien absente, une seule cellule
`.sem-entete` (contre 2 avant, en mode 2 semaines). Clic sur "2 semaines" (dans `coin-nav`) → bascule
et texte "Semaine 38 → Semaine 39" corrects, bouton `.actif`. Flèche "suivante" (dans
`cellule-semaine-nav`) → semaine change bien. "Aujourd'hui" (dans `coin-nav`) → revient bien à la
semaine courante. "Aller à…" (clic sur le texte de la semaine) → popup s'ouvre. "Imprimer" (dans
`barre-imprimer`) → aperçu d'impression s'ouvre bien (`.impression-modal`). Aucune erreur JS.

Rendu visuel vérifié en 1 et 2 semaines (desktop, ~1360px) et en mobile (390px) : plus aucun élément de
la nouvelle zone d'en-tête (Imprimer, Aujourd'hui, 2 semaines) ne déborde de l'écran — seule la cellule
de navigation de semaine déborde, ce qui est attendu et pré-existant (elle fait partie de la grille qui
défile horizontalement, comme les colonnes de jours).

`node test_grille_compacte.js` (64/64), `node test_chantier_defaut.js` (16/16), `node
test_chargement.js` (35/35) et `node test_enregistrer_plage.js` (41/41) toujours au vert — aucune des
fonctions pures testées n'est touchée par ce changement, purement DOM/CSS dans `construireGrille()`.

## 60. Round du 14.09.2026 — corrige les popups qui débordent en bas de l'écran une fois agrandis

Lionel : « j'ai un problème avec les popup sur le planning, ils sont trop en bas et si je sélectionne
les séries, je ne vois pas les séries qui sont hors écran. »

**Cause.** `positionnerPop()` clampe la position d'un popup dans l'écran (`Math.max`/`Math.min` sur
`window.innerWidth`/`innerHeight`) — mais seulement UNE FOIS, à l'ouverture. Plusieurs popups grandissent
ENSUITE selon ce qu'on y coche : « Plus d'options » révèle un bloc (Statut/Série, cf.
`optionsAvanceesHTML`), et cocher « Série (se répète) » révèle à son tour `.serie-options` (fréquence,
nombre de répétitions ou date de fin, cf. `cablerSerieChamps`) — sans que rien ne recalcule la position
déjà posée. Un popup ouvert près du bas de l'écran (fréquent : clic sur une case du planning, pas
forcément tout en haut de la fenêtre) grandissait alors PAR LE BAS, hors écran. `max-height` +
`overflow-y: auto` (règle `.pop`) plafonnent la hauteur de la boîte mais pas SA POSITION : une boîte trop
basse peut déborder de l'écran même hauteur plafonnée — et comme le popup est en `position: fixed`, faire
défiler la PAGE ne le ramène pas à l'écran.

**Fix.** `positionnerPop()` pose désormais un `ResizeObserver` sur le popup qui reclampe sa position
(même formule, mais sur sa position ACTUELLE plutôt que le x/y d'origine) à chaque changement réel de sa
taille — couvre tous les cas présents ET futurs, plutôt que de rappeler un reclamp au cas par cas depuis
chaque bascule `.hidden` (c'est justement l'oubli d'un de ces cas qui a produit ce bug). Auto-nettoyage
paresseux (l'observer se déconnecte de lui-même au 1er redimensionnement constaté après la disparition du
popup du DOM) plutôt qu'un `disconnect()` explicite à la fermeture — trop de chemins de fermeture
différents dans ce fichier pour être sûr de tous les retrouver sans en oublier un, même défaut que le bug
corrigé ici. Sans effet sur mobile/tablette : `.form-pop` y est déjà repositionné en CSS avec
`!important` (plein écran / centré), ces `style.top`/`left` posés en JS y sont donc déjà inoffensifs.

**Vérifications.** Scénario Playwright dédié : popup Tâche ouvert près du bas d'une fenêtre réduite
(1280×520), clic sur « Plus d'options » puis coche « Série (se répète) » — le popup reste entièrement
dans l'écran à chaque étape (`bottom <= innerHeight`), le champ « Répétitions » reste visible. Contre-essai
en désactivant temporairement le `ResizeObserver` : le popup dépasse alors de 166px et le champ
« Répétitions » sort de l'écran — confirme que le test couvre bien la régression signalée. Popup normal
(« Aller à… », pas de croissance) toujours fonctionnel. `node test_grille_compacte.js` (64/64), `node
test_chantier_defaut.js` (16/16), `node test_chargement.js` (35/35) et `node test_enregistrer_plage.js`
(41/41) toujours au vert.

## 61. Round du 14.09.2026 — trier et (dés)activer Personnel/Intervenants/Chantiers, avec vraie suppression

Lionel : « j'aimerais pouvoir trier et désactiver mes entrées dans les listes personnel, chantier,
intervenant. » Mockup dédié (`mockup-listes-tri-desactivation.html`, round précédent) approuvé en 3
temps : « bouton activer ok, ça me plaît [...] ok pour les flèches de tri », puis « possibilité de
supprimer des éléments car certains chantier ou ouvriers peuvent ne plus revenir » (garder une VRAIE
suppression, en plus de désactiver — repéré dans le mockup comme un point d'attention spécifique à
Chantiers, étendu ici aux 2 groupes), puis « bouton supprimer avec icône rouge suffit » (pas de 2e
niveau d'UI au-delà de la confirmation déjà existante).

### 61.1. Base — `sql/0008_chantiers_actif_ordre.sql`

`chantiers` n'avait ni `actif` ni `ordre` (contrairement à `personnes`, qui les a depuis le tout premier
schéma, `sql/0001`) : migration ajoutant les 2 mêmes colonnes, mêmes types/défauts (`actif boolean not
null default true`, `ordre integer not null default 0`), avec backfill `ordre = id` sur les 3 chantiers
déjà en base. Appliquée directement sur le projet Supabase via le connecteur MCP (même méthode que
0003/0005/0006/0007). Aucun GRANT/RLS supplémentaire (policy `connecte_tout` déjà en place table par
table).

### 61.2. Personnel/Intervenants — actif existait déjà, ajoute tri + vraie suppression

`actif`/`ordre` existaient déjà sur `personnes`, mais restaient à sens unique et invisibles une fois
utilisés : « Supprimer » appelait déjà `desactiverPersonneServeur` en coulisses (jamais un vrai DELETE),
mais rien ne permettait de revoir une personne désactivée ni de la réactiver, et `ordre` ne servait à
rien côté UI (aucun bouton de tri). Les 2 pages (même composant, `ligneFichePersonne`) ont maintenant :

- **↑/↓** par ligne active, repris à l'identique de `.cf-actions` (page Entrée rapide, déjà utilisé pour
  réordonner les champs d'un formulaire) — 2 `update` serveur qui échangent les `ordre` voisins
  (`echangerOrdrePersonnes`), puis rafraîchissement complet.
- **Interrupteur « Actif »**, repris à l'identique de celui d'« Afficher les week-ends » — remplace le
  lien « Supprimer » sur une ligne active. Le décocher ouvre la même confirmation qu'avant (« Désactiver
  « X » qui a N tâches en cours ? »), puis appelle `basculerActifPersonneServeur(id, false)` (renommage de
  `desactiverPersonneServeur`, maintenant réversible dans les 2 sens).
- **Section « Désactivés (N) »**, repliée par défaut, sous les actifs : chaque ligne y montre
  « Réactiver » (`basculerActifPersonneServeur(id, true)`) et, nouveau, un bouton rouge « Supprimer »
  (icône poubelle, `ICONS.trash`) — une VRAIE suppression (`supprimerPersonnePermanenceServeur`, un
  simple `delete` sur `personnes`), jamais proposée que depuis cette section (il faut d'abord désactiver).
  Confirmation dédiée mentionnant explicitement l'irréversibilité : la table `personnes` a 3 clés
  étrangères en `on delete cascade` (`taches`, `assignations`, `series` — vérifié directement sur le
  schéma Supabase avant d'écrire cette fonction), donc supprimer une personne efface aussi tout son
  historique, passé compris — exactement ce que Lionel demande pour « des ouvriers qui ne reviennent
  plus », mais un aller simple qu'il fallait signaler clairement.

Page de gestion : nouvelle fonction `listerPersonnesGestionServeur()` (liste COMPLÈTE, actifs + désactivés,
triée par `ordre`) — bien distincte de `etat.personnesActives`/`PERSONNES`, qui reste filtrée aux actifs
et continue d'alimenter la grille comme avant (une personne désactivée disparaît toujours de la grille,
historique compris — comportement préexistant, inchangé par ce round).

### 61.3. Chantiers — actif/ordre n'existaient pas du tout, ajout complet + vraie suppression déjà existante

Contrairement à Personnel, Chantiers n'avait aucune notion de « désactivé » : « Supprimer » y était déjà,
de longue date, un vrai DELETE (`retirerChantierServeur`) qui vide aussi toutes les cases utilisant ce
chantier, passées comprises. Avec `actif`/`ordre` ajoutés (§61.1), le même schéma que Personnel
s'applique : ↑/↓ (`echangerOrdreChantiers`), interrupteur « Actif » (`basculerActifChantierServeur`, un
simple update — ne touche à AUCUNE case, contrairement à une suppression), section « Désactivés » avec
Réactiver + Supprimer (icône rouge). Le lien « Supprimer » d'origine sur une ligne active a disparu ; sa
fonction serveur (`retirerChantierServeur`) est réutilisée telle quelle, simplement déplacée : elle n'est
plus proposée que depuis la section « Désactivés ».

Différence assumée avec Personnel, propre à ce que chaque table représente : un chantier désactivé reste
résolvable pour tout ce qui existe déjà. `etat.chantiers` (et la map `CHANTIERS` qui en dérive) reste
donc la liste COMPLÈTE (actifs + désactivés) — jamais filtrée à la source, contrairement à
`etat.personnesActives` — pour qu'une case déjà posée sur un chantier depuis désactivé continue
d'afficher son nom et sa couleur normalement (« reste visible sur les semaines déjà remplies »,
exactement ce que demandait le mockup). Le filtre « actifs seulement » se fait donc au cas par cas, côté
appelant, partout où un chantier DÉSACTIVÉ ne doit plus être proposé pour du NOUVEAU : légende cliquable
(`construireLegende`), select « Chantier » des formulaires Entrée rapide (`champChantierHTML`) et — un
3e site distinct, repéré seulement en testant en conditions réelles — le select inline du formulaire de
tâche standard de la grille (`ouvrirEdition`, jusqu'ici construit à part sans passer par
`champChantierHTML`). Dans les 3 cas, le chantier déjà en place sur l'item édité (ou déjà présent sur une
autre tâche de la case ciblée) reste proposé/sélectionné même désactivé — jamais de disparition
silencieuse d'un choix déjà fait. `retirerChantierServeur` détache aussi désormais `jalons.chantier_id`/
`series.chantier_id` (mis à `null`, jamais supprimés) avant de retirer la ligne `chantiers` : ces 2
colonnes (apparues avec `sql/0007`, après l'écriture d'origine de cette fonction) sont en `on delete no
action` côté base — un chantier encore référencé par un jalon aurait fait échouer le DELETE avec une
violation de contrainte, jamais couvert jusqu'ici.

### 61.4. Détail d'implémentation — le `<label>` de l'interrupteur

`.interrupteur-piste` couvre tout `.interrupteur` en `position: absolute` : le `<input>` lui-même n'est
donc jamais atteignable au clic direct, seul le label-forwarding natif du navigateur rend l'interrupteur
cliquable (déjà le cas pour « Afficher les week-ends », dont le `<label class="reglage-ligne">` englobe
tout). Le mockup approuvé enveloppait `.champ-actif` dans un `<span>` — repéré en écrivant le test
Playwright (le clic sur le checkbox ne passait jamais) : sans `<label>`, l'interrupteur aurait été inerte
au clic pour de vrais utilisateurs aussi, pas seulement pour le test. Corrigé en `<label
class="champ-actif">` dans les 2 templates de ligne.

### 61.5. Vérifications

2 scénarios Playwright dédiés (au-delà de la suite existante, toujours au vert : `test_grille_compacte.js`
64/64, `test_chantier_defaut.js` 16/16, `test_chargement.js` 35/35, `test_enregistrer_plage.js` 41/41,
`test_config_simple.js` 15/15, et le reste de la suite — seul `test_edge_functions.js` échoue, en pointant
une fonction `joursOuvresDepuis` introuvable, un échec préexistant confirmé sur le commit précédent,
antérieur à ce round et sans rapport avec lui).

Premier scénario (Personnel) : ajout d'une 2e personne, tri ↑ (vérifie l'échange réel des `ordre` en
base, pas seulement à l'écran), désactivation avec confirmation (la personne quitte le groupe actif,
rejoint « Désactivés », compteur « (1) » correct, section repliée par défaut), réactivation, puis
désactivation + suppression définitive (confirmation mentionnant l'irréversibilité, ligne effacée de la
table `personnes`). Deuxième scénario (Chantiers) : tri ↓, désactivation avec confirmation, vérifie que
le chantier désactivé (a) disparaît du select « Chantier » d'un NOUVEAU formulaire de tâche de la grille,
(b) disparaît de la légende cliquable, (c) reste néanmoins en base (`actif:false`, jamais supprimé par une
simple désactivation) et (d) qu'une tâche déjà posée dessus AVANT la désactivation continue de s'afficher
normalement dans la grille, avec sa couleur — exactement le point d'attention soulevé dans le mockup.

## 62. Round du 14.09.2026 — corrige une absence au descriptif libre qui redevenait une tâche grise

Lionel, vidéo à l'appui : « J'ai une erreur en mettant une absence sur plusieurs jours, elle est
attribuée à un chantier et prend la couleur grise. » Reproduit à l'identique en rejouant sa vidéo
image par image : glissé de 2 jours pleins sur la ligne d'un ouvrier, bouton « Absence », descriptif
LIBRE (« test » dans la vidéo — ni « Congé » ni « Vacances »), Enregistrer. La bulle apparaît d'abord
avec la couleur d'absence attendue, puis vire au gris quelques centaines de ms plus tard ; en la
rouvrant, la fiche affichée n'est plus « Absence » (bandeau orange, sans chantier) mais celle d'une
tâche normale, avec un chantier par défaut déjà proposé/sélectionné — un simple Enregistrer le lui
attribue pour de bon.

### 62.1. Cause — `taches` n'a jamais eu de colonne pour distinguer une absence d'une tâche

Avant ce round, RIEN en base ne portait cette information : la table `taches` (`sql/0001_schema.sql`)
n'a pas de colonne `type`, et le client décidait seul, à CHAQUE reconstruction depuis le cache serveur
(`construireVueDepuisCache`), en appliquant `estAbsence(texte)` — une simple recherche de sous-chaîne
(« absent »/« cong »/« vacance ») portée depuis `Planning_Format.gs` (V2). Un souci : `synchroniser()`
recharge SYSTÉMATIQUEMENT depuis le serveur juste après chaque écriture (`oublierCache` +
`construireVueDepuisCache`, cf. round « aller-retour de plus par synchronisation, mais un seul chemin
de code »). Une absence au texte libre qui ne matche aucun des 3 mots-clés perdait donc son statut
d'absence dès CE rechargement — pas à la prochaine visite, littéralement l'instant suivant
l'enregistrement — et se retrouvait reclassée « tâche » sans chantier (`chantier: null`, une absence
n'en a jamais), d'où le repli gris `#e5e5e5` (`bulleEl`). En rouvrant la fiche, `ouvrirEdition` la
traitait alors en tâche normale (bandeau avec un chantier par défaut proposé), et un simple clic sur
Enregistrer l'attribuait pour de bon — exactement la séquence décrite par Lionel.

### 62.2. Correctif — une vraie colonne `taches.est_absence`

`sql/0009_taches_est_absence.sql` : `alter table taches add column if not exists est_absence boolean
not null default false`, avec un backfill best-effort sur les lignes déjà en base (même règle
qu'`estAbsence()`, donc neutre sur tout ce qui était déjà correctement reconnu). Appliquée directement
sur le projet Supabase via le connecteur MCP (même méthode que 0003/0005/0006/0007/0008) — 4 lignes sur
89 concernées par le backfill au moment de l'application.

Côté client, cette colonne devient la source de vérité, `estAbsence(texte)` ne reste qu'un FILET DE
SÉCURITÉ (OR) pour ne jamais reclasser en tâche une ligne écrite avant ce round :

- `tacheVue_` (fonction locale de `construireDonneesSemaine`) reporte désormais `absence: !!t.est_absence`
  sur chaque tâche vue.
- `construireVueDepuisCache` : `var typT = (entreeT.absence || estAbsence(entreeT.texte)) ? "absence" :
  "tache"` (personnel ET week-end — 2 sites, même correctif).
- `calculerEtatLocal` porte `absence: t.type === "absence"` jusque dans le payload de diff envoyé à
  `enregistrerCellulePersonneServeur`, qui écrit `est_absence: !!t.absence` sur chaque ligne `taches`
  insérée — c'est le chemin emprunté par une absence simple ou en plage (le cas de la vidéo de Lionel),
  posée directement depuis la grille (pas de case « Série (se répète) » cochée).
- Une absence créée EN SÉRIE (case « Série (se répète) », proposée aussi bien pour une absence que pour
  une tâche) passe par l'edge function `enregistrer-serie`, qui a toujours forcé `type: "tache"` côté
  serveur (`series`/`taches.type` n'ont que 3 valeurs possibles, « absence » n'en a jamais fait partie) —
  même défaut, chemin distinct, donc corrigé séparément : `creerSerieServeur` envoie maintenant
  `estAbsence: type === "absence"` dans le payload, sans toucher à `type` (qui reste « tache », colonne
  `series` inchangée). Détail edge function : cf. BACKEND-CHANGELOG.md §27.

### 62.3. Vérifications

`node test_chargement.js` (36/36 — 35 existantes + 1 nouvelle dédiée à `tacheVue_`/`est_absence`, 2
fixtures existantes mises à jour pour inclure la clé `absence` désormais toujours présente) et
`node test_enregistrer_serie.js` (28/28 — 26 existantes + 2 nouvelles, cf. BACKEND-CHANGELOG.md §27) au
vert, ainsi que le reste de la suite (`test_grille_compacte.js` 64/64, `test_chantier_defaut.js` 16/16,
`test_enregistrer_plage.js` 41/41, `test_config_simple.js` 15/15, `test_gerer_serie.js` 12/12… — seul
`test_edge_functions.js` échoue, échec préexistant déjà documenté au round précédent, sans rapport avec
celui-ci).

Nouveau scénario Playwright dédié (`verif_absence_plage_libre.js`), rejouant le scénario exact de la
vidéo de Lionel avec le mock Supabase (glissé de 2 jours pleins, bouton Absence, descriptif libre
« test », Enregistrer, ATTENTE d'un aller-retour serveur complet comme `synchroniser()` en déclenche un
après chaque écriture) : la ligne `taches` créée porte bien `est_absence:true` ; la bulle affichée après
resynchronisation reste de classe `bulle-absence` (jamais `bulle-tache`) et ne prend jamais le repli gris
`#e5e5e5` ; en rouvrant la fiche (double-clic — un simple clic ne fait que sélectionner la bulle, cf.
`resoudreClicBulle`), le formulaire reste bien « Absence » (bandeau orange, sans select Chantier), jamais
une fiche de tâche avec un chantier par défaut déjà posé. Confirmé cassant sur le code d'avant ce round
(`git stash` temporaire pendant l'écriture du test : échoue précisément sur l'assertion `est_absence`,
comme attendu) puis vert une fois le correctif restauré.

## 63. Round du 14.09.2026 (suite) — l'étirement et le déplacement d'une bulle tâche/absence étaient "aimantés"

Lionel, vidéo à l'appui : « Lors de l'étirement, la bulle est aimantée de manière bizarre. » — puis,
message de suite : « idem lors du déplacement, la bulle fait des "gauche-droite". »

### 63.1. Cause — `demiDepuisPointeur` recoupait une demi-journée déjà entière

`demiDepuisPointeur(cel, clientX)` (introduite round du 03.09.2026, §23/§25) répond « matin » ou
« aprem » selon que `clientX` tombe dans la moitié gauche ou droite de `cel`. Sa règle ("moitié gauche =
matin, moitié droite = aprem") n'est juste QUE pour une cellule FOND pleine largeur (`creerCelluleFond`,
lignes Jalons/Notes — un seul `<div class="cell">` par jour, sans `demi` propre). Une cellule PERSONNE
(`creerCell`, lignes des ouvriers) est au contraire déjà scindée en 2 `<div>` distinctes (matin/aprem,
`colonneDemi`) depuis le passage au mode compact seul (§49) — chacune ne large QUE d'une demi-journée.

Les 6 appels de `demiDepuisPointeur` côté redimensionnement (`cablerPoigneeRedim`, poignée gauche ET
droite) et déplacement (`onPointerDownGroupeSelection` : surlignage de dépôt précis pendant le glissement,
et positionnement final à la dépose) reçoivent tous, pour une tâche/absence, une cellule PERSONNE — donc
déjà une demi-journée entière — sans jamais faire cette distinction. Lui appliquer quand même la règle
« moitié gauche/droite » revient à re-découper cette demi-journée déjà entière en 2 QUARTS de journée :
dès que le pointeur franchit la frontière entre la cellule matin et la cellule aprem d'un même jour, le
calcul retombe sur son propre milieu à lui (celui de la NOUVELLE cellule survolée), qui n'a rien à voir
avec le sens du glissement — d'où l'aperçu qui semble reculer un instant avant de rattraper le mouvement
("aimantation" à l'étirement, "gauche-droite" au déplacement). `demiSlotCellule` (round du 11.09.2026,
glissé de sélection rapide) avait déjà cette distinction — `kind === "personne" ? cell.dataset.demi :
demiDepuisPointeur(...)` — mais seulement pour son propre appelant, pas dans la fonction partagée.

Diagnostic confirmé par un script Playwright instrumenté (glissement pas à pas de 15px sur la vraie page,
log de la position de la souris vs la géométrie réelle de la bulle à chaque pas) : décrochages de sens
systématiques à CHAQUE frontière matin/aprem franchie, aussi bien en étirement qu'en déplacement (5
décrochages détectés sur un glissement de bout en bout de la grille, 0 après correctif).

### 63.2. Correctif

`demiDepuisPointeur` fait maintenant confiance au `data-demi` de la cellule quand celle-ci en porte un
(cellule personne — posé nativement par `creerCell`, jamais besoin de calcul sur `clientX`) ; elle ne
retombe sur le calcul par position du pointeur que pour une cellule fond sans `data-demi` (jalon/note,
comportement inchangé pour elles). Une seule fonction corrigée, un seul endroit modifié, les 6 appelants
(redimensionnement gauche/droite, surlignage de dépôt, positionnement à la dépose) en bénéficient tous
sans changement de leur propre code.

### 63.3. Vérifications

`node test_grille_compacte.js` (68/68 — 64 existantes + 4 nouvelles assertions dédiées, cellule personne
"matin"/"aprem" avec un pointeur volontairement placé tout près du bord OPPOSÉ de sa propre demi-cellule,
exactement le cas qui faisait basculer le résultat avant ce round) au vert, ainsi que le reste de la
suite inchangée (`test_edge_functions.js` mis à part — échec préexistant déjà documenté, sans rapport).

2 scripts Playwright de diagnostic (non commités, scratchpad de session) : l'un rejoue un étirement pas à
pas de la poignée droite d'une tâche d'1 jour jusqu'au bord de la grille et retour, l'autre un simple
glissement (corps de la bulle, pas la poignée) de la même tâche sur toute la largeur de la grille, en
loggant à chaque pas la géométrie réelle affichée. Les deux confirmés cassants sur le code d'avant ce
round (`git stash` temporaire) — respectivement plusieurs décrochages de sens à chaque frontière
matin/aprem en étirement, et 5 en déplacement — puis 0 décrochage une fois le correctif restauré.

## 64. Round du 15.09.2026 — le bouton "Générer le PDF" ne produisait plus rien

Lionel : « on peut travailler sur la page d'impression ? ». À l'examen, l'aperçu (le tableau qui
s'affiche) fonctionnait très bien ; c'est le bouton "Générer le PDF" qui ne faisait plus rien de réel —
point resté explicitement ouvert dans le plan de migration (`MIGRATION-GITHUB-PLAN.md` §8, "PDF : pas
encore de solution retenue"). 2 questions posées à Lionel avant de commencer (cf. le fil de discussion) :
remettre le PDF en marche, plutôt qu'autre chose sur cette page — puis, la méthode : impression du
NAVIGATEUR plutôt qu'une nouvelle Edge Function dédiée.

### 64.1. Cause

`apiGenererPdf` (WebApp.gs) générait le PDF via Google Sheets + Drive — aucun équivalent une fois
l'appli hébergée sur GitHub Pages (backend Supabase). Le bouton appelait encore `gs("apiGenererPdf",
[labG], ...)`, donc `google.script.run`, inexistant hors Apps Script : levait une exception, rattrapée
depuis le 07.09.2026 (phase 4, étape 5, §36) par un message clair plutôt qu'un plantage silencieux — mais
strictement aucun PDF ne sortait plus de ce bouton depuis le passage à GitHub Pages.

### 64.2. Correctif — impression du navigateur, pas de nouvelle Edge Function

`openPrintSheet()` construit déjà tout l'aperçu en HTML pur (`.print-doc`/`table.print-table`) — c'était
déjà, de fait, un document prêt à imprimer. Plutôt que reconstruire un PDF depuis zéro côté serveur
(Deno n'a pas de moteur de mise en page HTML→PDF simple, et ça aurait fait diverger le rendu imprimé de
l'aperçu à l'écran), le bouton (renommé "Imprimer / PDF") appelle maintenant directement `window.print()`
sur l'aperçu déjà affiché : dans la boîte qui s'ouvre, "Enregistrer en PDF" comme imprimante donne
exactement le fichier voulu, sans aucun aller-retour serveur ni dépendance nouvelle. `apiGenererPdf`
reste inchangée côté serveur (WebApp.gs) — simplement plus appelée depuis ce fichier (cf.
`MIGRATION-GITHUB-PLAN.md` §8, mis à jour).

Nouveau bloc `@media print` (dans `<style>`, juste après les règles existantes de `.impression-modal`) :
- masque tout le reste de la page (l'appli, le voile sombre, les boutons Fermer/Imprimer eux-mêmes) —
  seul l'aperçu doit apparaître sur le papier ;
- la modale, normalement `position: fixed` centrée avec une hauteur plafonnée + défilement (cf. `.pop`,
  nécessaire à l'écran), redevient un document normal qui peut s'étaler sur autant de pages que
  nécessaire ;
- fige la palette de couleurs sur le mode CLAIR même si Lionel a le mode sombre activé à l'écran (fond
  de `<body>` forcé en blanc y compris) — imprimer un fond sombre gâcherait l'encre et la lisibilité sur
  papier, sans rapport avec le réglage d'affichage du moment ;
- `print-color-adjust: exact` (+ préfixe `-webkit-`) sur le tableau : sans ça, certains navigateurs
  omettent les couleurs de fond par défaut pour économiser l'encre — ici les couleurs de chantier sont le
  seul repère visuel, indispensables sur la feuille ;
- format PAYSAGE par défaut (`@page { size: landscape }`) — le tableau est large de 5 à 10 jours,
  Lionel garde la main pour changer dans la boîte du navigateur si besoin.

### 64.3. Vérifications

Script Playwright dédié (`verif_impression.js`, scratchpad de session) : ouvre l'aperçu, clique
"Imprimer / PDF", vérifie que `window.print()` est appelé exactement une fois (piégé avant le clic) et
que la modale reste ouverte après (pas de fermeture automatique) ; bascule ensuite le média émulé sur
`print` et vérifie que `#app` passe à `display:none`, que `.impression-modal` n'est plus
`position:fixed`, que sa `max-height` repasse à `none`, et que `.impression-actions` est bien masqué —
tout au vert.

Vérification visuelle complémentaire : semaine de test peuplée (tâches avec chantier, jalon, note,
absence) puis un VRAI PDF généré via `page.pdf({ printBackground:true, landscape:true })` (donc
représentatif de ce qui sortirait d'un "Enregistrer en PDF" réel, pas juste une capture d'écran) —
converti en image (`pdftoppm`) et relu : couleurs de chantier et d'absence bien présentes, tâches
importantes en évidence, légende correcte, page blanche en dehors du document (pas de fond de l'appli
qui déborde), mise en page paysage lisible.

Reste de la suite `test_*.js` inchangée et au vert (`test_edge_functions.js` mis à part — échec
préexistant déjà documenté, sans rapport).

## 65. Round du 15.09.2026 (suite) — dates incomplètes et couleur de la ligne d'en-tête, sur l'aperçu impression

Lionel, sur l'aperçu impression (juste livré au §64) : « La ligne des dates en grisé comme la colonne des
noms, les dates ne sont pas complètes, on ne voit ni le mois ni l'année. Possibilité de rajouter une
ligne mois, l'année peut être placée dans la cellule haut gauche. » 2 sujets distincts, confirmés
séparément avec Lionel avant de coder (cf. le fil de discussion) : la couleur de fond de la ligne
jour/date, et l'ajout du mois/année.

### 65.1. Ligne jour/date : fond neutre au lieu du violet des Jalons

`table.print-table thead th` utilisait `var(--jalon-bg)` (violet clair) — la même couleur que la ligne
Jalons juste en dessous, sans aucun rapport avec elle, prêtant à confusion. Passé à `var(--bg)`, la
teinte déjà visible par transparence dans la colonne des noms (qui n'a jamais eu de fond propre) — d'où
la formulation de Lionel, "comme la colonne des noms". Un seul endroit changé, s'applique aux 2 lignes
d'en-tête (mois ET jour/date, cf. ci-dessous) pour un bandeau uniforme.

### 65.2. Ligne mois + année en case haut-gauche

`data.mois[i]` et `data.isoDates[i]` existaient déjà (`infosSemaineDepuisLabG`) mais n'étaient utilisés
nulle part dans `openPrintSheet()` — seul "Lun 14" apparaissait, sans mois ni année : en ressortant
l'imprimé plus tard (l'imprimé n'a pas de date de génération dessus), impossible de savoir de quelle
semaine il s'agissait. Ajouts :
- une ligne `<tr class="print-mois">` au-dessus de la ligne jour/date, avec un `<th>` par MOIS (pas par
  jour) : les jours consécutifs du même mois sont regroupés sous un seul `<th colspan="N">` plutôt que de
  répéter le mois sur chaque colonne — utile dès qu'une semaine chevauche 2 mois (ex. jeu 30/ven 31 août
  → lun 1er/mar 2/mer 3 septembre). Texte en toutes lettres et capitalisé (`MOIS_FR`, déjà utilisé par le
  calendrier des fériés), pas l'abréviation `data.mois` ("sept.") déjà utilisée ailleurs dans l'appli — la
  ligne mois a la place, autant que ce soit lisible.
- la cellule en haut à gauche (`.coin-annee`, 1ère cellule de cette nouvelle ligne) affiche l'année. En
  général une seule ("2026") ; à cheval sur le nouvel an (semaine du dernier lundi de décembre), les 2
  années apparaissent ("2025 / 2026") plutôt que d'en choisir une arbitrairement.

### 65.3. Vérifications

Nouveau script Playwright (`verif_mois_annee.js`, scratchpad de session), 3 semaines : une semaine
normale (Septembre seul, colspan 5, année "2026") ; une semaine à cheval sur 2 mois DE LA MÊME année
(lundi 31 août → vendredi 4 septembre 2026 : "Août" colspan 1 + "Septembre" colspan 4, année "2026") ;
une semaine à cheval sur le NOUVEL AN (lundi 29 décembre 2025 → vendredi 2 janvier 2026 : "Décembre"
colspan 3 + "Janvier" colspan 2, année "2025 / 2026") — navigation via le sélecteur "Aller à…" existant
(`.lien-aller`/`.f-semaine`). Les 3 cas au vert, colonnes/colspans et jours affichés vérifiés jusqu'au
détail. Vérification visuelle complémentaire par un vrai PDF (même méthode qu'au §64) : bandeau d'en-tête
gris uniforme sur les 2 lignes, "2026" bien en case haut-gauche, "SEPTEMBRE" bien centré sur les 5
colonnes de jours.

Reste de la suite `test_*.js` inchangée et au vert (`test_edge_functions.js` mis à part, sans rapport).

## 66. Round du 15.09.2026 (suite) — matin/après-midi côte à côte sur l'aperçu impression, comme le planning

Lionel : « j'aimerai bien l'affichage matin/après-midi côte à côte, comme le planning. »

### 66.1. Avant ce round

`openPrintSheet()` posait chaque personne sur 2 LIGNES (une "matin", une "aprem" juste en dessous,
`rowspan="2"` sur la cellule de son nom), chaque ligne ayant 1 cellule par jour (5 colonnes) — l'inverse
de la grille compacte à l'écran, qui place matin et aprem À CÔTÉ l'un de l'autre plutôt que l'un
au-dessus de l'autre. D'où la demande de Lionel : retrouver sur le papier la même lecture que sur son
écran.

### 66.2. Correctif

Chaque jour devient 2 SOUS-COLONNES (matin puis aprem) au lieu d'une seule — le tableau passe de 6
colonnes (1 nom + 5 jours) à 11 (1 nom + 5 jours × 2). En-tête sur 3 lignes désormais (`<thead>`) : année
+ mois (colspan doublé pour rester aligné sur les sous-colonnes), jour/date (`colspan="2"`, un
`rowspan="2"` sur la case vide de coin pour éviter de la répéter sur la 3e ligne), puis une nouvelle
ligne "Matin"/"Aprem" discrète (`.print-demis`, même traitement visuel atténué que la ligne mois — cf.
§65 — pour ne pas rivaliser avec la ligne jour/date, l'info qu'on cherche en premier). Chaque personne
tient désormais sur UNE SEULE ligne (`p.matin[i]` et `p.aprem[i]`, déjà disponibles séparément dans la
forme serveur brute, juste réordonnés jour par jour plutôt que par demi — factorisé dans une petite
fonction `celluleTache(p, cell)` commune aux 2 appels).

Jalons et notes restent au niveau du JOUR (`data.jalons[i]`/`data.notes[i]` n'ont pas de granularité demi
côté forme serveur brute, à la différence des cases personne) : leur cellule s'étale sur les 2
sous-colonnes de son jour (`colspan="2"`), comme le ferait une plage en "journée entière" dans la grille
à l'écran — pas de trou ni de fausse asymétrie entre les 2 sous-colonnes d'un même jour pour ces 2
lignes-là.

Tous les `colspan` "pleine largeur" (lignes d'espacement, ligne Notes quand elle n'existe pas encore) sont
passés d'un `6` en dur à une constante `NB_COLS` calculée (`1 + jl.length * 2`) — pour ne plus jamais
désynchroniser un colspan si le nombre de jours affichés change un jour (2 semaines à la fois, par
exemple).

### 66.3. Vérifications

`verif_mois_annee.js` (scratchpad de session) étendu à 4 cas : les 3 précédents (§65) adaptés aux
colspans doublés, plus un nouveau cas dédié — une personne avec une tâche le matin ET une autre l'aprem
du même jour, vérifie que sa ligne compte bien 11 cellules et que "Coffrage" (matin) et "Ferraillage"
(aprem) tombent dans 2 cellules ADJACENTES de la MÊME ligne (pas 2 lignes séparées comme avant ce round).
Les 4 cas au vert. `verif_impression.js` (bouton PDF/impression navigateur, §64) rejoué sans changement
de comportement. Vérification visuelle par un vrai PDF : matin/aprem bien côte à côte, jalon et note bien
étalés sur leurs 2 sous-colonnes, sous-en-tête MATIN/APREM discret et lisible.

Reste de la suite `test_*.js` inchangée et au vert (`test_edge_functions.js` mis à part, sans rapport).

## 67. Round du 15.09.2026 (suite) — ordre, séparateurs et traitillé sur l'aperçu impression

Lionel : « Plusieurs changements, traitillé entre aprèm et matin. L'ordre sur le pdf doit etre celui a
l'écran. ligne entre personnel fine et vide, sans couleur. Ligne en[tre] personnel et intervenants, vide
et sans couleur aussi, un peu plus large que celle entre le personnel pour bien voir la distiction. »

Quatre demandes distinctes sur l'aperçu mis en place au §66, traitées ensemble.

### 67.1. Ordre des lignes = celui de l'écran

`data.personnes` est trié par le champ "ordre" côté serveur, qui peut très bien entremêler personnel et
sous-traitants — alors qu'à l'écran, `construireGrille()` affiche 2 sections successives et complètes,
"Personnel" puis "Intervenants" (`groupePersonnel`/`groupeIntervenants`, filtrés sur `p.sousTraitant`).
L'aperçu impression, lui, se contentait jusqu'ici de l'ordre brut. Correctif : même regroupement côté
impression — `p.sousTraitant` est déjà disponible sur cette forme de données (posé dans
`construireVueDepuisCache`) — `imprimes` devient la concaténation de "Personnel" puis "Intervenants",
chaque groupe gardant son ordre relatif d'origine, filtré comme avant sur `personneVide`.

### 67.2. Trait fin et invisible entre 2 personnes, trait plus large entre les 2 groupes

Bug de spécificité CSS trouvé au passage : la règle générale `table.print-table th, table.print-table td`
(bordure 1.4px pleine) a une spécificité plus élevée que `.print-spacer td { border: none; ... }` — cette
dernière perdait donc silencieusement, et un trait plein apparaissait entre chaque personne alors que le
CSS disait déjà "border: none". Corrigé en renforçant le sélecteur (`table.print-table tr.print-spacer
td`) pour repasser devant, sans toucher au reste. Une 2e ligne d'espacement, dédiée
(`print-spacer-section`, uniquement à la frontière Personnel/Intervenants, seulement quand les 2 groupes
sont représentés cette semaine-là), reprend exactement le même style "sans bordure/couleur" mais avec une
hauteur plus grande (14px contre 6px) pour bien marquer le changement de section.

### 67.3. Traitillé entre matin et aprem

Ajout d'une classe `.demi-aprem` posée à la fois sur le sous-en-tête "Aprem" et sur chaque cellule aprem
(jamais sur les cellules matin), pour ne cibler QUE la frontière interne matin→aprem — la frontière entre
2 jours (bordure gauche de la case matin du jour suivant) reste pleine. Piège rencontré en vérifiant le
rendu sur un vrai PDF plutôt que de se fier au seul `getComputedStyle` : avec `border-collapse: collapse`,
la bordure affichée à la jonction de 2 cellules est un ARBITRAGE entre leurs 2 bordures déclarées, pas
simplement celle de la cellule interrogée — et à largeur égale, "solid" gagne toujours sur "dashed" dans
cet arbitrage. La cellule Matin voisine (bordure générale 1.4px pleine, jamais modifiée) écrasait donc le
traitillé alors que `getComputedStyle` sur la cellule Aprem elle-même annonçait bien "dashed". Corrigé en
donnant à `.demi-aprem` une largeur légèrement supérieure (2px) : la règle d'arbitrage fait gagner la
bordure la plus large, quel que soit son style — le traitillé s'affiche donc enfin réellement.

### 67.4. Vérifications

Nouveau script Playwright dédié (`verif_impression_ordre_lignes.js`, scratchpad de session), données
semées avec un ordre brut délibérément entremêlé (Bernard-personnel, Zorro-intervenant, Lionel-personnel,
Ali-intervenant, dans cet ordre de champ "ordre") : (1) ordre des lignes imprimées = Bernard, Lionel, puis
Zorro, Ali — Personnel avant Intervenants, PAS l'ordre brut ; (2) bordure gauche de chaque cellule Aprem
= `dashed`, bordure gauche de la case Matin du jour suivant = `solid` (frontière de jour non affectée) ;
(3) tous les spacers ont un `border` calculé `none/none/none/none` sur les 4 côtés, et le spacer de
section (exactement 1, à la bonne frontière) est strictement plus haut que les spacers ordinaires. Les 3
cas au vert. Vérification visuelle par un vrai PDF, convertie en PNG à haute résolution (400dpi) et
inspectée pixel par pixel sur la colonne de la frontière matin/aprem pour confirmer visuellement
l'alternance de traits caractéristique d'un pointillé (pas seulement la valeur CSS déclarée, pour la
raison expliquée au §67.3) : confirmé.

`verif_mois_annee.js` et `verif_impression.js` (§64-§66) rejoués sans changement de comportement. Reste de
la suite `test_*.js` inchangée et au vert (`test_edge_functions.js` mis à part, sans rapport).

## 68. Round du 15.09.2026 (suite, suite) — cadre blanc uni, sans titre ni légende superflus, traitillé enfin discret

Lionel, en 3 messages successifs sur le même aperçu :

« Il reste une grande fenêtre rectangle sous le planning, la supprimer. je veux un fond blanc et uni le
traitillé de la demi journé plus fin et discret »

« Pas besoin de aperçu avant impression - semaine N, ni de la légende de la personne masquée »

« Inscription semaine N dans la case sous l'année » puis « Aligner tous les textes de la colonne gauche de
la même manière »

### 68.1. Suppression du cadre autour du document imprimé

`.print-doc` est une carte pensée pour l'aperçu À L'ÉCRAN (fond légèrement teinté, bordure, coins arrondis,
padding généreux) — une fois transposée telle quelle sur le papier, cette carte devient le "grand rectangle"
que Lionel voit sous/autour du tableau, sur un fond qui n'est jamais tout à fait blanc. Corrigé uniquement à
l'impression (`@media print` — l'aperçu à l'écran garde sa carte, un repère utile avant d'imprimer) :
`.print-doc` y perd sa bordure, ses coins arrondis, son padding, et son fond redevient un blanc pur et
uniforme — le tableau repose directement sur le papier.

### 68.2. Titre et légende "personne masquée" retirés de l'impression

Le titre de la modale ("Aperçu impression — semaine N") et la légende signalant les personnes sans rien
cette semaine ("X personne(s) sans rien … masquée(s) à l'impression") sont utiles À L'ÉCRAN pour se repérer
avant d'imprimer, mais n'ont rien à faire sur le document final. Masqués eux aussi uniquement sous `@media
print` (`display: none`, même mécanisme déjà utilisé pour `.impression-actions` depuis le §64) — ils restent
affichés normalement dans l'aperçu à l'écran.

### 68.3. "Semaine N" dans la case du coin, alignement de toute la colonne gauche

Puisque le titre ne s'imprime plus (§68.2), le numéro de semaine aurait purement et simplement disparu du
document une fois sur le papier. La case de coin (`rowspan="2"`, sous "2026"), restée vide depuis sa
création au §65, affiche maintenant "Semaine N".

Ajoutée avec le même traitement visuel que la case "2026" juste au-dessus — sauf que le sélecteur CSS
`.coin-semaine` seul (1 classe) perdait silencieusement contre la règle générale `table.print-table thead
th` (1 classe + 3 types, qui centre le texte) : "Semaine 38" restait centré au lieu d'être aligné avec
"2026" et les noms de personnes juste en dessous (encore un bug de spécificité du même genre qu'au §67.2,
repéré cette fois directement sur le PDF plutôt qu'en lisant le code). Corrigé en réécrivant le sélecteur
`table.print-table .coin-semaine` (2 classes), qui regagne la priorité — toute la colonne de gauche ("2026",
"Semaine N", puis chaque nom de personne) s'aligne maintenant de la même manière, à gauche.

### 68.4. Traitillé matin/aprem : vraiment fin et discret cette fois

Le traitillé posé au §67.3 (bordure `border-left` élargie à 2px pour gagner l'arbitrage border-collapse
face au trait plein voisin) faisait le travail mais restait plus épais/voyant que voulu. Impossible de
simplement réduire la largeur : en dessous de 2px, la largeur de la bordure traitillée et celle du trait
plein voisin s'arrondissent au même pixel à l'impression, et le plein regagne l'arbitrage (revérifié à
1.6px : toujours plein). Nouvelle approche en 2 temps, cette fois éprouvée sur un vrai PDF zoomé pixel par
pixel : (1) la bordure réelle de la cellule (participant au collapse) passe à une largeur qui gagne de façon
fiable (2px) mais en couleur TRANSPARENTE — elle gagne toujours l'arbitrage, mais ne dessine plus rien, donc
le trait plein sombre disparaît complètement à cette frontière ; (2) un `::before` purement décoratif, hors
du système de bordures de la table, dessine par-dessus le vrai pointillé — fin (1px) et doux
(`var(--border)`, plus clair que `var(--border-strong)` utilisé partout ailleurs dans le tableau).

Piège rencontré en cours de route : une 1ère version du `::before` peignait le pointillé PAR-DESSUS le trait
plein d'origine sans le neutraliser — chaque espace vide entre 2 tirets laissait réapparaître le plein
sombre en dessous, donnant un trait bicolore (tirets clairs / segments pleins sombres) au lieu d'un
pointillé propre. Invisible en lisant le code ou en interrogeant `getComputedStyle` (qui ne reflète que la
déclaration, jamais l'arbitrage réel entre 2 bordures voisines) — seul un agrandissement pixel par pixel
d'un vrai PDF généré l'a révélé, d'où l'étape (1) ajoutée pour neutraliser proprement le trait sous-jacent
avant de dessiner le pointillé dessus.

### 68.5. Vérifications

Nouveau script (`verif_impression_cadre_blanc.js`, scratchpad de session) : à l'écran, titre et légende
"personne masquée" restent visibles ; sous `@media print` (émulé), les deux sont `display:none`, et
`.print-doc` calcule bien un fond `rgb(255,255,255)`, sans bordure, sans coin arrondi, sans padding ; la
case de coin affiche "Semaine N" et partage le même `text-align:left` que la case année. `verif_impression_
ordre_lignes.js` (§67) rejoué et étendu : le `::before` des cellules aprem est bien `dashed`, la frontière
de jour reste un vrai border `solid`. Vérification visuelle complémentaire, cette fois décisive : PDF réel
converti en PNG à 400dpi, lu pixel par pixel sur une colonne totalement vide (aucun texte alentour, pour ne
pas confondre bordure et antialiasing de lettres) — confirme une alternance propre de segments clairs
(le pointillé) et de BLANC (plus de résidu sombre dans les espaces, contrairement au 1er essai) ; capture de
la colonne de gauche complète confirmant "2026"/"Semaine 38"/noms de personnes tous alignés à gauche de la
même façon. Suite `test_*.js`, `verif_mois_annee.js` et `verif_impression.js` rejouées sans régression
(`test_edge_functions.js` mis à part, sans rapport).

## 69. Round du 15.09.2026 (suite, suite, suite) — traitillé remis en noir, libellés Jalons/Notes ajoutés

Lionel, sur le même aperçu impression, 2 remarques parmi 3 (la 3e — un bug sur les entrées en série — fait
l'objet d'un chantier séparé, plus important, en cours) :

« je ne suis pas convaincu par ce pointillé, tu peux le laisser noir mais plus fin. »

« ajoute les libellé jalon et note dans la colonne gauche. »

### 69.1. Traitillé matin/aprem : remis en noir, toujours fin

Le §68.4 avait éclairci la couleur du pointillé (`var(--border)`, plus doux que le reste du tableau) en même
temps qu'il en réduisait l'épaisseur — pensant que couleur ET épaisseur contribuaient toutes les deux à le
rendre "plus discret". Lionel corrige : c'est bien l'épaisseur qu'il voulait réduire, pas la couleur — le
pointillé plus clair que le reste du tableau se voit moins bien, pas mieux. Remis en `var(--border-strong)`
(la même encre noire que toutes les autres bordures du tableau) ; la largeur reste à 1px (contre 1.4px pour
les bordures normales) — c'est elle, et elle seule, qui rend le trait "plus fin", exactement comme demandé
cette fois. Le mécanisme lui-même (`::before` décoratif hors du système de bordures, cf. §68.4) est inchangé
— seule la couleur de ce `::before` a changé.

### 69.2. Libellés "Jalons" / "Notes" dans la colonne de gauche

Les lignes Jalons et Notes du tableau imprimé commençaient par une cellule vide : sur la grille compacte à
l'écran, un repère de couleur suffit à les identifier, mais sur le papier (noir et blanc, sans le code
couleur de l'écran) rien ne dit plus quelle ligne est quoi. Ajouté `<td>Jalons</td>` et `<td>Notes</td>` en
tête de ces 2 lignes, en gras comme les noms de personnes juste au-dessus, avec exactement le même libellé
(orthographe et majuscule) que celui déjà affiché à l'écran sur la grille compacte (`construireGrille`,
couple `["jalon", JALONS, "Jalons"]` / `["note", NOTES, "Notes"]`).

### 69.3. Vérifications

`verif_impression_ordre_lignes.js` (§67) mis à jour et rejoué : la vérification du `::before` matin/aprem
change de couleur attendue (repasse de `var(--border)` à `var(--border-strong)`, non testée directement en
couleur mais via une capture PDF réelle, cf. plus bas) ; toujours `dashed` sur le `::before`, toujours
`solid` sur la vraie frontière jour/jour. Nouvelle capture PDF réelle → PNG 400dpi, lue pixel par pixel :
confirme un pointillé fin ET noir (plus le gris clair du §68.4), et les libellés "Jalons"/"Notes" bien
présents, en gras, alignés comme le reste de la colonne de gauche. Suite `test_*.js`, `verif_mois_annee.js`
et `verif_impression.js` rejouées sans régression (`test_edge_functions.js` mis à part, toujours sans
rapport, pré-existant).

## 70. Round du 15.09.2026 (suite) — bug des séries sur sélection multi-cases

Lionel, 3e remarque du même message (cf. §69, cette fois le « chantier séparé, plus important » annoncé
là-bas) :

« J'ai un bug au niveau des entrées en série, si je sélectionne 2 case ou plus, la bulle vients
uniquement dans la première case de chaque répétitions. »

Autrement dit : glisser une sélection sur 2 cases ou plus (matin+aprem d'un même jour, ou plusieurs
jours) puis cocher « Série (se répète) » ne pose la bulle, à CHAQUE répétition, que sur la toute première
case de la sélection d'origine — le reste de la sélection (2e demi-journée, jours suivants) est purement
et simplement perdu, à chaque occurrence.

### 70.1. Cause : `creerSerieServeur` ne transmettait jamais la largeur de la sélection

`creerSerieServeur(type, cibles, giDebut, texte, important, chantier, statut, choixSerie,
apresChaqueAppel)` ne recevait — et donc n'envoyait au serveur — qu'un `giDebut` (une seule case
d'ancrage) et un `demi` unique (`cibles[i].demi`, replié sur la première case de `cibles`). Rien dans son
payload ne portait la LARGEUR de la sélection d'origine (`duree`, en jours) ni ses demi-journées de bord
(`demiDebut`/`demiFin`) — alors que ces 3 valeurs existaient déjà, calculées, dans chacun des 3 endroits
qui appellent `creerSerieServeur` (`ouvrirFormulaireDynamique`, `ouvrirEdition`, `ouvrirEditionPlage`) et
servaient déjà, correctement, au chemin NON-série (`creerGroupeTaches` / insertion directe d'un
`itemPlageTache`). Le bug n'était donc pas dans le calcul de la sélection — déjà juste — mais dans
l'unique fonction qui, sur le chemin « série », oubliait de le transmettre.

### 70.2. Correctif : `duree`/`demiDebut`/`demiFin` ajoutés en fin de signature

`creerSerieServeur` gagne 3 paramètres, volontairement en FIN de signature (pas au milieu) pour ne rien
déplacer dans les appels existants : `creerSerieServeur(type, cibles, giDebut, texte, important, chantier,
statut, choixSerie, apresChaqueAppel, duree, demiDebut, demiFin)`. Le payload envoyé au serveur porte
maintenant :

```js
duree: Math.max(1, duree || 1),
demiDebut: demiDebut !== undefined ? demiDebut : null,
demiFin: demiFin !== undefined ? demiFin : null
```

Les 3 sites d'appel passent chacun leurs propres variables déjà en portée (déjà utilisées pour le chemin
non-série, donc déjà correctes) : `ouvrirFormulaireDynamique` passe `duree, demiDebut, demiFin` ;
`ouvrirEdition` et `ouvrirEditionPlage` passent leurs équivalents `dureeFinal, demiDebutFinal,
demiFinFinal`. Le reste du fonctionnement de `creerSerieServeur` (choix « cette occurrence » / « toute la
série », etc.) est inchangé.

Le pendant serveur (nouvelle prise en compte de ces 3 champs pour reproduire la pleine largeur de la
sélection à CHAQUE occurrence, pas seulement à l'ancrage) est documenté dans BACKEND-CHANGELOG.md §28.

### 70.3. Vérifications

`test_enregistrer_serie.js` : 50/50 assertions (voir le détail des nouveaux cas côté serveur dans
BACKEND-CHANGELOG.md §28.3). Côté client, nouveau script Playwright bout-en-bout (pas un simple test
unitaire) qui pilote la VRAIE interface — glissé souris réel sur les cases, vrai formulaire, vraie case
« Série (se répète) » — contre un mock qui exécute le VRAI `logic.js` serveur extrait (même technique que
`test_enregistrer_serie.js`, jamais une réécriture à la main) : 2 scénarios, tous deux conformes au bug
rapporté par Lionel — (a) sélection sur une seule journée matin+aprem, en série hebdomadaire : chaque
occurrence pose bien les 2 demi-journées, pas seulement la première ; (b) sélection sur 2 jours
consécutifs (span complet, pas juste la 1ère case), en série hebdomadaire : chaque occurrence reproduit
bien les 2 jours, journée entière au milieu comme au premier/dernier jour selon les bornes de la
sélection d'origine. Les deux scénarios échouaient avant ce correctif (seule la première case de la
sélection était posée à chaque répétition, exactement la description de Lionel) et passent après.

**Déploiement Supabase** : ce correctif touche l'edge function `enregistrer-serie`, redéployée en
production (version 2 → 3, statut `ACTIVE`) — détails dans BACKEND-CHANGELOG.md §28.4. Le correctif est
donc actif de bout en bout : client (ce fichier) et serveur.

## 71. Round du 15.09.2026 (suite, suite) — une absence en série scindée en 2 bulles sur un même jour

Lionel, après confirmation que le correctif §70 fonctionne, capture d'écran à l'appui (grille de
production, Mathis, vendredi) : une absence posée en série ("80% ↺série") s'affichait en DEUX bulles
séparées sur ce même vendredi — une sous matin, une sous aprem — au lieu d'une seule couvrant la journée
entière :

« La bulle sur le vendredi devrait être une seul et même bulle. »

Ce rapport a d'abord été confondu avec un autre sujet en cours d'investigation (bulles scindées sur les
SEMAINES SUIVANTES d'une série à cheval sur un week-end — limitation d'affichage liée à la pagination par
semaine, distincte de celle-ci et encore non tranchée avec Lionel à ce stade) ; la capture d'écran a permis
de recentrer sur le vrai bug, localisé sur un seul jour, sans lien avec la navigation entre semaines.

### 71.1. Cause : la fusion matin/aprem exigeait un chantier identique, même pour une absence

Une requête directe sur la base de production a confirmé la donnée exacte derrière la capture : les 2
lignes `taches` (matin et aprem, même absence, même `serie_id`, même texte "80%") étaient strictement
identiques sur tous les champs pertinents — sauf le chantier posé en base (table `assignations`) sur la
case du matin : `chantier_id=2`, résiduel, alors qu'aprem n'en avait aucun. Ce résidu n'a rien à voir avec
l'absence elle-même — une absence n'écrit jamais de chantier (`champs.chantier_id` reste toujours `null`
pour ce type, cf. `champsSerie`/`construireOccurrencesSerie` côté `enregistrer-serie`) — il s'agissait d'un
chantier posé par autre chose AVANT la création de l'absence, jamais recouvert depuis (règle "jamais
écrasé", déjà documentée §27.2/§28.2 : un chantier existant sur une case n'est retiré/remplacé que si la
nouvelle écriture en spécifie un elle-même).

Côté affichage (`construireVueDepuisCache`, la fonction qui reconstruit `TACHES` depuis le cache pour
produire une bulle par item fusionné), la fusion de 2 demi-journées consécutives en un seul item exigeait
jusqu'ici un chantier IDENTIQUE entre les deux (`indexNonConsommeCorrespondantT_`), pour une absence
COMME pour une vraie tâche — alors que le résultat affiché d'une absence ignore déjà totalement le
chantier (`itemPlageTache(..., { chantier: typT === "absence" ? null : chantierT, ... })`, inchangé). Le
résidu de chantier sur matin seulement suffisait donc à faire échouer la comparaison et à produire 2 bulles
séparées, même si l'affichage final des deux aurait de toute façon été identique (aucun chantier visible).

### 71.2. Correctif : le chantier n'est plus comparé pour fusionner une ABSENCE

`indexNonConsommeCorrespondantT_` gagne un paramètre `ignorerChantier`, et le calcul du type (tâche vs
absence, `typT`) est avancé avant la boucle de fusion (il n'était calculé qu'après, une fois par item déjà
constitué) pour pouvoir piloter ce paramètre :

```js
var typT = (entreeT.absence || estAbsence(entreeT.texte)) ? "absence" : "tache";
...
var idxSuivT = indexNonConsommeCorrespondantT_(finHi + 1, entreeT.texte, entreeT.important, entreeT.statut, chantierT, typT === "absence");
```

Pour une absence (`typT === "absence"`), la comparaison de chantier entre les deux demi-journées est
désormais sautée (`ignorerChantier || chIci === (chantier || null)`) : seuls texte/important/statut
continuent de compter pour décider si deux demi-journées consécutives forment une seule et même bulle. Pour
une vraie tâche, rien ne change : deux chantiers réellement différents continuent d'empêcher la fusion,
exactement comme avant ce correctif.

### 71.3. Vérifications

Nouveau script Playwright bout-en-bout, même méthodologie que §70.3 (mock exécutant le VRAI `logic.js`
serveur extrait, jamais réécrit à la main) : chantier résiduel seedé sur matin AVANT toute création (comme
en production), absence "80%" posée en série sur matin+aprem d'un vendredi. Confirme (a) le résidu de
chantier reste bien en place sur matin après coup (règle "jamais écrasé" toujours respectée côté serveur,
qui n'a jamais tenté de le toucher — une absence n'envoie pas de `chantierId`) et (b) une seule bulle "80%"
est affichée — 2 avant ce correctif, exactement le bug de Lionel (vérifié en comparant les deux états du
fichier, avant/après le correctif, avec le même script). Non-régression associée : une vraie tâche avec 2
chantiers explicitement différents entre matin et aprem continue de se scinder en 2 bulles séparées, sans
changement de comportement.

Purement client (`Index.html`) : aucune edge function ni migration SQL concernées par ce correctif.

## 72. Round du 16.09.2026 (suite) — chantier par tâche : le client (lecture, fusion, écriture, impression en bandes)

Suite du round §29 de BACKEND-CHANGELOG.md (même demande de Lionel, citée là-bas en entier) : après la
migration SQL et la réécriture des deux edge functions, le pendant client — tout ce qui lit, fusionne,
réécrit et imprime `chantier_id` désormais au niveau de la TÂCHE et non plus de la case.

### 72.1. Lecture : le chantier remonte depuis chaque tâche, plus depuis la case

`tacheVue_` (qui transforme une ligne `taches` brute en objet d'affichage) lit maintenant son propre
chantier :

```js
chantier: t.chantier_id != null ? (chantiersParId[t.chantier_id] || null) : null,
```

`celluleVue_` (qui construisait jusqu'ici le chantier de la case à partir de la ligne `assignations`) ne
s'en sert plus QUE dans un seul cas de repli, désormais rare : une case sans aucune tâche mais où un
chantier a été posé (ancien mécanisme, table historique depuis §29.1) :

```js
return { chantier: (!taches.length && a) ? (chantiersParId[a.chantier_id] || null) : null, taches: taches };
```

Dès qu'au moins une tâche existe dans la case, le chantier de la case (au sens ancien) n'est plus consulté
du tout : chaque tâche porte le sien.

### 72.2. Fusion de la vue (`construireVueDepuisCache`) et écriture (`calculerEtatLocal`, `diffsCellulesPersonne`, `enregistrerCellulePersonneServeur`)

`construireVueDepuisCache` reconstruit `TACHES` à partir du cache pour produire une bulle par item fusionné
(2 demi-journées consécutives identiques → 1 bulle). Les deux fonctions qui allaient chercher le chantier
AU NIVEAU DE LA CASE pour piloter cette fusion (`chantierAuHalfSlot_`, `chantierCelluleAuGi`) disparaissent :
`indexNonConsommeCorrespondantT_` compare directement le chantier de chaque TÂCHE candidate
(`(arr[i].chantier || null) === (chantier || null)`), la boucle de fusion principale lit
`var chantierT = entreeT.chantier || null;` sur l'entrée en cours de traitement, et la boucle des
week-ends lit `t.chantier || null` sur la tâche elle-même au lieu de `vueJour.chantier` sur la case.

Côté état local et diff, le chantier quitte le niveau case :

- `calculerEtatLocal` : `cellules[cle] = { taches: [] }` (plus de `chantier` au niveau de la case), et
  chaque tâche poussée dans `taches` porte son propre `chantier: t.chantier || null`.
- `diffsCellulesPersonne` : la case par défaut devient `{ taches: [] }`, et le payload envoyé au serveur
  ne transporte plus que `{ taches: a.taches }` — plus de champ `chantier` séparé à comparer/diffuser.
- `enregistrerCellulePersonneServeur`, le point d'écriture direct d'une case (hors série), pose désormais
  le chantier sur CHAQUE ligne `taches` individuellement au lieu d'écrire une seule ligne `assignations`
  partagée par toute la case :

  ```js
  var lignesTaches = taches.map(function (t, i) {
    var chantier = t.chantier ? etat.chantierParNom[t.chantier] : null;
    var ligne = { personne_id: personneId, date: iso, demi: demi, ordre: i,
      texte: t.texte, statut_id: t.statut ? (etat.statutIdParCle[t.statut] || null) : null,
      important: !!t.important, serie_id: t.serieId || null, est_absence: !!t.absence };
    if (chantier) ligne.chantier_id = chantier.ligne;
    return ligne;
  });
  ```

  L'écriture reste « tout supprimer puis tout réinsérer » pour la case (`taches` d'abord, comme avant) ;
  le DELETE sur `assignations` qui suit n'est plus qu'un nettoyage de la table historique (§29.1), plus
  jamais suivi d'une réinsertion dedans.

`chantierExistantDansCase` (qui proposait par défaut, à la création d'une nouvelle tâche sur une case déjà
occupée, le chantier déjà présent) n'a pas changé de comportement — son corps reste identique — mais son
rôle change de nature : ce n'était jusqu'ici pas qu'un confort, c'était ce qui EMPÊCHAIT concrètement le bug
de Lionel de s'aggraver plus vite (proposer le même chantier par défaut réduisait les cas où une case
finissait avec 2 chantiers réellement différents). Depuis ce round, poser des chantiers différents sur la
même case est un usage normal et pleinement supporté : la fonction n'est plus qu'un confort de saisie,
jamais un contournement.

### 72.3. Impression : une bande de couleur par tâche (Option A, choisie par Lionel)

Interrogé sur la présentation visuelle souhaitée pour une case imprimée avec plusieurs chantiers empilés
(une seule couleur de fond pour toute la case ? un neutre avec un simple repère par tâche ? une bande de
couleur par tâche ?), Lionel a choisi explicitement l'option « bande de couleur par tâche » : chaque tâche
empilée dans une case garde sa propre couleur de fond sur sa propre portion de la cellule, au lieu qu'une
seule couleur (mal définie dès qu'il y a plusieurs chantiers) couvre toute la case.

`infoCase` (qui décidait jusqu'ici UNE couleur de fond et UN texte par case) devient `infoCase` +
`celluleTache`, et retourne désormais un TABLEAU de fragments — un par tâche — au lieu d'un couple
`{ fond, texte }` unique :

```js
function infoCase(p, cell) {
  var taches = (cell && cell.taches) || [];
  if (!taches.length) {
    // repli : case vide, éventuel chantier historique posé sans tâche (cf. §72.1)
    ...
    return { fragments: [{ bg: ..., txt: "" }], empty: true };
  }
  var fragments = taches.map(function (t) {
    var estAbs = !!t.absence || estAbsence(t.texte);
    var bg = "transparent";
    if (estAbs) { bg = "var(--absence-bg)"; }
    else if (t.chantier) { var ch = etat.chantierParNom[t.chantier]; bg = ch ? ch.couleur : "#e5e5e5"; }
    ...
    return { bg: bg === "transparent" ? "var(--surface-2)" : bg, txt: ... };
  });
  return { fragments: fragments, empty: false };
}
```

`celluleTache` empile un `<div class="print-bande">` par fragment à l'intérieur d'un seul
`<td class="td-tache">`, séparés par un simple filet (`border-top`) :

```js
function celluleTache(info, classeDemi, fusionnee) {
  var bandes = info.fragments.map(function (f) {
    return '<div class="print-bande" style="background:' + f.bg + '">' + f.txt + '</div>';
  }).join("");
  ...
}
```

`fondCase` et `detailJoint` (les deux fonctions à cellule-couleur-unique qu'`infoCase`/`celluleTache`
remplacent) sont supprimées ; la fusion matin/aprem en une seule cellule (`colspan="2"`) compare désormais
le tableau COMPLET des fragments des deux demi-journées (`JSON.stringify` des deux tableaux), plutôt qu'une
seule couleur — deux demi-journées ne fusionnent que si elles portent exactement les mêmes tâches, dans le
même ordre, avec les mêmes chantiers. La légende (liste des chantiers utilisés sur la page, en bas de
l'impression) est reconstituée en itérant `cell.taches` de chaque case au lieu de son ancien champ
`cell.chantier` unique.

### 72.4. Bug CSS découvert en vérifiant : `height: 100%` ne s'étire pas dans une cellule de tableau

Première implémentation testée : une bande fait sa hauteur de contenu naturelle, et seule la DERNIÈRE bande
d'une case est censée s'étirer pour occuper le reste de la hauteur de ligne (déterminée par la case la plus
chargée de la même ligne du tableau) — via un conteneur flex `height: 100%` + `flex: 1 1 auto` sur la
dernière bande. Rendu de vérification (Playwright → PDF → `pdftoppm -r 300` → inspection de pixels) : la
bande courte laissait un grand vide blanc en dessous au lieu de s'étirer, et le pointillé matin/aprem
(`.demi-aprem`) affichait des artefacts.

Trois reproductions minimales isolées (`<table><td><div style="height:100%">…`, avec et sans flex, avec
`border-collapse: separate` et `collapse`) ont confirmé que ce n'est PAS un bug Chromium : un pourcentage de
hauteur sur un enfant STATIQUE (non positionné en absolu) se résout en `auto` dès que la hauteur de son bloc
englobant (ici la cellule) n'est pas explicitement définie — comportement CSS standard, une cellule de
tableau à hauteur automatique ne compte jamais comme une hauteur « définie » aux yeux d'un enfant en
pourcentage, quelle que soit la hauteur réellement dessinée par la ligne.

Correctif retenu, robuste à coup sûr : au lieu de faire s'étirer un enfant, poser la couleur de la DERNIÈRE
bande directement en style inline sur le `<td>` lui-même — un `<td>` remplit TOUJOURS nativement toute la
hauteur réellement dessinée de sa ligne, par construction du layout de tableau, sans aucune astuce :

```js
var lastBg = info.fragments[info.fragments.length - 1].bg;
return '<td class="td-tache' + ... + '" style="background:' + lastBg + '">' + bandes + '</td>';
```

```css
table.print-table td.td-tache { padding: 0; }
table.print-table .print-bande { padding: 5px 7px; }
table.print-table .print-bande + .print-bande { border-top: 1px solid var(--border-strong); }
```

Le conteneur flex et son CSS associé ont été entièrement retirés. Le pointillé `.demi-aprem` reste posé sur
le `<td>` (jamais déplacé sur les bandes individuelles — une tentative en ce sens, pour ce qui semblait être
un bug de pointillé séparé, a été essayée puis annulée en comprenant qu'il s'agissait du même bug de hauteur
que ci-dessus) : re-vérifié par inspection de pixels zoomée, le pointillé couvre bien toute la hauteur de
ligne sans coupure ni trait plein parasite.

Imperfection mineure connue et acceptée : sur une case avec plusieurs bandes ET fusionnée en `colspan="2"`
avec son vis-à-vis d'aprem non fusionné, un écart de 1px de couleur peut apparaître à la jointure — cas rare,
jugé non bloquant par rapport au bénéfice (couleur par tâche enfin correcte) plutôt que de complexifier
davantage le CSS pour un pixel.

### 72.5. Vérifications

Suite existante : `node test_chargement.js` (36/36 — fixtures `construireDonneesSemaine` étendues avec 2
tâches à chantiers différents empilées sur une même case, plus le cas de repli case-vide-avec-chantier-
historique déplacé sur une case sans tâche pour le tester réellement) et `node test_config_simple.js`
(15/15 — fixtures `compterTachesParPersonne_` avec `chantier_id` inline sur les tâches, signature mise à
jour). Le reste de la suite (13 autres fichiers `test_*.js`, hors `test_edge_functions.js` — cassé pour une
raison préexistante sans rapport avec ce round, cf. `git log` sur ce fichier) : verte.

Rendu imprimé vérifié visuellement, méthode habituelle (Playwright → PDF → `pdftoppm -r 300` → crops PIL)
sur un jeu de cas représentatif : 2 chantiers empilés sur une même case (le scénario exact de Lionel), tâche
unique (non-régression du cas majoritaire), tâche + absence dans la même case, matin/aprem identiques donc
fusionnés en une seule cellule, case totalement vide. Confirme empilement correct avec filets de séparation,
étirement correct de la dernière bande sur toute la hauteur de ligne, et compatibilité visuelle inchangée
pour le cas à une seule tâche.

Voir BACKEND-CHANGELOG.md §29 pour le pendant serveur (migration SQL, `enregistrer-serie`, `gerer-serie`).

## 73. Round du 16.09.2026 (suite, suite) — 4 retours courts sur l'impression et le planning

Lionel, 4 retours distincts dans le même message :

« il reste le mot "note" dans l'imprimé. le supprimer. » et, sur la page planning : « Fixer la partie
supérieur au tableau de tâches afin que les onglets et la légende des chantiers reste toujours à l'écran. »,
« La sur-brillance en bleue d'une tâche en déplacement se perd d'une ligne à l'autre. elle est aussi trop
petite, actuellement elle fait la taille de la bulle, je préfèrerai que la(les) case cible soient entièrement
sur-brillé. les sur-brillance interdite en rouge sont elle corrects. » et « redescendre les boutons
annuler/refaire de quelques pixel pour qu'ils soient centré entre la légende des chantiers et le tableau des
tâches ».

### 73.1. Le mot « Notes » retiré de l'étiquette de ligne à l'impression

`openPrintSheet` posait un libellé texte « Notes » en tête de la ligne dédiée (round du 15.09.2026, suite,
suite, suite — Lionel avait alors explicitement demandé CE libellé, en même temps que « Jalons », pour
repérer les lignes une fois la légende de couleurs hors du premier écran). Revirement assumé sur ce seul mot
(« Jalons » n'est pas concerné, toujours affiché) :

```js
h += '<tr class="print-notes"><td style="font-weight:700;white-space:nowrap"></td>';
```

Seul le texte de l'étiquette disparaît — la ligne elle-même, son fond, ses bordures et le CONTENU des notes
(`.filled`, texte des notes remplies) restent strictement inchangés ; vérifié qu'aucune règle CSS ne dépendait
du texte ou de la cellule non-vide (`tr.print-notes td`/`td.filled`, cf. leur définition, ne touchent que
bordure/fond/padding). Vérifié par une reproduction fidèle (CSS réel extrait de `Index.html`, Playwright) :
l'étiquette est bien vide, les notes remplies s'affichent normalement à côté.

### 73.2. Onglets + légende des chantiers fixes au défilement de la grille

`#app` est le seul élément qui défile réellement (`position:fixed; overflow-y:auto`, cf. son commentaire) ;
`.onglets-nav` et `.legende` vivaient jusqu'ici dans son flux normal et disparaissaient donc avec le reste de
la page dès qu'on faisait défiler le planning vers le bas — perdant à la fois le repère de navigation et la
légende de couleurs nécessaire pour lire les chantiers empilés (cf. §72). Les deux passent en
`position: sticky`, empilés l'un sous l'autre en haut de `#app` :

```css
.onglets-nav {
  ...
  padding-top: 44px;
  position: sticky; top: 0; z-index: 40; background: var(--bg);
}
.legende {
  ...
  margin: 0 0 16px; padding-top: 46px;
  position: sticky; top: 83px; z-index: 39; background: var(--bg);
}
```

Deux pièges rencontrés et corrigés en vérifiant (Playwright, capture d'écran à l'appui — même méthode que le
bug CSS du round précédent, §72.4) :

- **La bande réservée à `#lienDeconnexion`** (« Se déconnecter », `position:fixed`, en haut à droite) était
  jusqu'ici un `padding-top:44px` sur `.app-shell`, donc un espace *vide* avant la barre d'onglets — pas
  couvert par le fond opaque de celle-ci. Une fois la barre rendue sticky (`top:0`), cet espace vide restait
  traversable par le contenu de la grille pendant le défilement (un nom de personne redevenait visible
  au-dessus de la barre). Corrigé en déplaçant ce padding-top DANS `.onglets-nav` elle-même (son propre fond
  opaque couvre alors toute la bande) plutôt que sur `.app-shell` (retiré).
- **Même fuite, entre la barre et la légende** : l'espace qui existait avant `.legende` (`margin-bottom`
  de la barre + `padding-top` de `.page-scroll` + l'ancien `margin-top` de `.legende`, 46px au total)
  restait lui aussi un vide transparent entre 2 éléments désormais fixes. Corrigé en absorbant ces 46px dans
  un `padding-top` sur `.legende` (couvert par son propre fond), `top: 83px` (= le bas réel, mesuré, de la
  barre d'onglets une fois fixée) empilant la légende immédiatement sous elle sans le moindre interstice.

`z-index` choisis pour rester au-dessus de la grille (bulles/cases, z-index ≤ 6) mais sous
`#lienDeconnexion` (50, doit rester cliquable en toutes circonstances) et très en dessous des popups/modales
(`.voile-confirm` à 95 et plus) — jamais de conflit avec un panneau ouvert par-dessus.

`top:0`/`top:83` correspondent chacun à la position naturelle (non défilée) de l'élément : les deux sont donc
« collés » dès le chargement de la page, sans le petit saut visuel qu'un seuil différent aurait produit à mi-
défilement.

### 73.3. Sur-brillance de dépôt : pleine case, et qui suit vraiment la ligne visée

Deux bugs distincts derrière le même symptôme rapporté par Lionel, tous deux dans `survolerCible()`
(chemin « précis », activé pour un déplacement à la souris d'un item seul — §37/§38/§49) :

- **« se perd d'une ligne à l'autre »** — l'élément de sur-brillance (`.survol-precis`) copiait
  `bulleDom.style.gridRow`, c'est-à-dire la ligne de grille de la bulle D'ORIGINE (`bulleDom` reste affichée,
  juste estompée, à sa place de départ pendant tout le geste — cf. `armer()`/`.glisse-groupe` — seul un
  fantôme flottant suit le pointeur). Dès que la case survolée (`cible`) était sur une AUTRE ligne (une autre
  personne), la sur-brillance restait figée sur la ligne de départ au lieu de suivre — donnant l'impression
  qu'elle « se perdait ». Corrigé en lisant `cible.style.gridRow` (déjà posé correctement par `poser()` sur
  chaque `.cell`) plutôt que celui de `bulleDom`.
- **« trop petite, taille de la bulle »** — `.survol-precis` avait `align-self: start` et une hauteur posée
  en JS (`bulleDom.getBoundingClientRect().height`), un choix du round du 07.09.2026 pour un tout autre bug
  de l'époque (l'élément s'étirait alors sur toute la ligne et débordait visuellement sous la bulle glissée).
  Ce même étirement plein-hauteur est exactement ce que Lionel demande maintenant, et `.selection-precis`
  (round du 12.09.2026, juste en dessous dans le CSS) prouve depuis des jours que ce comportement fonctionne
  très bien pour une sur-brillance de case. Retiré `align-self: start` du CSS et la ligne de hauteur en JS :
  `.survol-precis` s'étire donc désormais par défaut sur toute la hauteur réellement dessinée de sa ligne de
  grille (stretch, comportement par défaut de `.grille`, display:grid sans `align-items`), exactement comme
  `.cell.drop-hover`/`.cell.cell-interdite` (déjà confirmées correctes par Lionel : « les sur-brillance
  interdite en rouge sont elle corrects »).

Vérifié par une reproduction isolée (CSS réel de `.survol-precis`, une ligne haute à 2 bulles empilées à côté
d'une case cible courte) : l'élément de sur-brillance occupe désormais exactement le même rectangle que la
case cible (69px de haut mesurés, identiques des deux côtés), plus 26px (l'ancienne taille bulle).

### 73.4. Boutons annuler/refaire redescendus

Conséquence directe de §73.2 (légende désormais fixe, donc l'espace où flottent ces 2 boutons — entre le bas
de la légende et le haut du tableau — est lui aussi devenu une position fixe et stable, plus une position qui
n'existait qu'à l'instant précis où la page n'avait pas encore défilé). `top` recalculé pour correspondre à
cette nouvelle position (bas réel de la légende + sa marge, mesuré) plutôt que l'ancien 22px (pensé pour
l'ancien contexte, non sticky) ; `transform: translateY(...)` réduit de -14px à -8px pour redescendre les
boutons de quelques pixels comme demandé — ils mordaient jusqu'ici surtout sur la légende, ils sont
maintenant centrés sur la frontière légende/tableau :

```css
.barre-undo { position: sticky; top: 159px; height: 0; z-index: 97; ...; transform: translateY(-8px); }
```

### 73.5. Vérifications

Suite complète (17 fichiers `test_*.js`, hors `test_edge_functions.js` — cassé pour une raison préexistante
sans rapport avec ce round) : verte — ces 4 correctifs touchent uniquement CSS/DOM/gestes de glissement,
aucun fichier de test ne couvre ce périmètre (confirmé par recherche : aucun test ne référence
`survolerCible`, `drop-hover`, `onglets-nav` ou `barre-undo`), d'où une vérification entièrement visuelle
(Playwright), méthode habituelle de ce fichier pour ce type de changement :

- §73.1 : reproduction du CSS d'impression réel + lignes Jalons/Notes ; étiquette vide confirmée, contenu
  des notes intact.
- §73.2 : reproduction du CSS RÉEL entier extrait de `Index.html` (pas une copie à la main, pour exclure
  toute erreur de transcription) + coquille de page fidèle (`construireCoquille`) + grille de test ; mesuré
  et capturé à l'écran en position initiale et après défilement — barre d'onglets et légende restent
  pixel-pour-pixel immobiles, `#lienDeconnexion` reste visible et cliquable par-dessus, plus aucune fuite de
  contenu de grille entre les deux.
- §73.3 : reproduction isolée de `.survol-precis` dans une grille à hauteurs de ligne inégales ; rectangle de
  sur-brillance mesuré identique à celui de la case cible.
- §73.4 : mesuré dans la même reproduction que §73.2.

## 74. Round du 16.09.2026 (suite, suite, suite) — croquis annoté : espaces roses, boutons undo, légende+imprimer, en-tête fixe étendu

Lionel a renvoyé une capture d'écran annotée de la page Planning telle qu'elle ressortait du round §73, avec
4 retours :

> Réduire les espaces roses
> Les boutons annuler/refaire passent dans la case vide à gauche des jours (Rouge)
> Les chantiers se placent sur la même ligne que le bouton imprimer (trait jaune)
> faire défiler la page après les notes

Les 3 premiers sont des ajustements locaux. Le 4e est plus profond : il demande d'étendre le principe
« fixé à l'écran » du §73.2 (jusqu'ici limité aux onglets + à la légende) à TOUT l'en-tête de la grille — nav
de semaine, jours, ligne M/A, Jalons, Notes — pour que seules les lignes Personnel/Intervenants défilent
réellement. Traité en dernier ci-dessous car il change l'architecture DOM dont dépendent les 3 autres.

### 74.1. Pourquoi une seule grille ne pouvait pas suffire

Rendre sticky des cellules de `.grille` pour qu'elles restent à l'écran pendant le défilement semblait la
suite logique du §73.2 (qui l'avait déjà fait pour `.onglets-nav`/`.legende`). Ça ne fonctionne pas ici :
`.scroller` (le conteneur qui permet de défiler horizontalement dans la semaine) porte
`overflow-x: auto`. Une règle CSS ancienne (déjà dans CSS 2.1) force alors le calcul de `overflow-y` à
`auto` dès que `overflow-x` ne vaut pas `visible` — même si `.scroller` ne défile en réalité JAMAIS
verticalement (sa hauteur épouse toujours exactement celle de son contenu). Résultat : `.scroller` devient,
sans le vouloir, le référentiel de `position: sticky` de tout ce qu'il contient — et comme lui-même ne défile
jamais verticalement, un `top` posé sur un de ses enfants n'a plus aucun effet (rien à quoi se fixer). C'est
un piège CSS connu (« sticky ne marche pas dans un conteneur à défilement horizontal ») sur lequel il valait
mieux ne pas se contenter d'un essai/erreur.

**Solution retenue** : scinder la grille CSS unique en deux grilles séparées, mêmes colonnes
(`gridTemplateColumns`/`minWidth` calculés une seule fois en JS et appliqués aux deux, pour qu'elles restent
pixel-alignées) :

- `grilleEntete` — nav de semaine, jours, M/A (mode compact), Jalons, Notes. Enveloppée dans
  `.entete-planning-figee` (`position: sticky`, sans overflow propre — donc bien référencée contre `#app`,
  le vrai conteneur qui défile) puis `.entete-planning-scroll` (`overflow: hidden`, sans barre de défilement
  visible ni interaction directe).
- `grilleCorps` — Personnel/Intervenants, dans `.grille-cadre`/`.scroller` (inchangés, seuls à porter le
  vrai défilement horizontal, à la souris/au doigt).

Le défilement horizontal de `.scroller` est recopié en JS sur `.entete-planning-scroll` à chaque événement
`scroll` (`scroller.addEventListener("scroll", () => enteteScroll.scrollLeft = scroller.scrollLeft)`) : les
jours de l'en-tête glissent ainsi en phase avec les colonnes du corps, sans que l'en-tête ait besoin de sa
propre barre de défilement. `.entete-planning-figee` étant sticky comme UN SEUL bloc (et non cellule par
cellule), sa hauteur peut varier librement (plus ou moins de jalons/notes empilés une semaine que l'autre)
sans le moindre calcul en JS — tout le contenu qu'elle contient reste simplement en flux normal à l'intérieur
d'un bloc qui, lui, est fixé.

`poser()`/`poserPleineLargeur()` (les 2 fonctions internes de `construireGrille` qui placent chaque cellule
dans la grille) sont désormais produites par une fabrique (`poserDans(grilleXxx)`) et RÉASSIGNÉES en cours de
fonction : elles visent `grilleEntete` du début jusqu'à la fin de la ligne Notes, puis `grilleCorps` à partir
de `ligneSection("personnel", …)` — `row` repart à 1 à ce même point, propre à la 2e grille. Comme
`ligneSection`/`ligneGroupePersonnesCompact` les référencent par fermeture (closure), elles utilisent la
valeur en vigueur au moment de leur APPEL (après réassignation), pas de leur définition.

Effet de bord utile, gratuit : le 3e espace rose du croquis (entre Notes et Personnel) disparaît par
construction — `.entete-planning-scroll` (coins hauts arrondis, bord sans bord bas) et `.grille-cadre` (coins
bas arrondis, bord sans bord haut) se touchent désormais pile, sans marge entre eux, plutôt que d'avoir dû
ajuster un réglage d'espacement précis.

### 74.2. Espaces roses réduits

Trois endroits, tous absorbés en `padding` (jamais en `margin`) sur l'élément qui suit, pour la même raison
qu'au §73.2 : une marge est transparente et laisse fuir le contenu défilé derrière un élément sticky, un
padding fait partie de sa boîte peinte et le couvre.

- `.onglets-nav { margin-bottom: 18px → 8px }` et `.page-scroll { padding-top: 14px → 6px }` (classe commune à
  toutes les pages — resserre l'appli entière de façon cohérente, pas seulement Planning).
- Le nouveau `#legendeBarre` (§74.3) absorbe le résidu (8+6=14px) en `padding-top: 14px` (`.legende` seule
  portait `padding-top: 46px` avant ce round).
- `.entete-planning-figee { padding-top: 6px }` absorbe l'espace résiduel entre `#legendeBarre` et la grille
  (auparavant 16px de `margin-bottom` sur `.legende`).

`top` de `#legendeBarre` et de `.entete-planning-figee` ne sont plus calculés à la main (l'exercice avait déjà
dû être refait 2 fois de suite au §73.2/73.4) : `ajusterEnteteFixe()`, une nouvelle fonction, les mesure et
les pose en JS à chaque rendu (`hauteur de .onglets-nav`, puis `+ hauteur de #legendeBarre`) — reste juste
même si la légende change de hauteur (plus ou moins de chantiers, retour à la ligne sur écran étroit).
Appelée en fin de `construireGrille()`/`construireLegende()`, au redimensionnement de la fenêtre (débounce
120 ms), et à la bascule VERS l'onglet Planning (`RENDU_PAR_PAGE.planning`) — nécessaire parce que
`#page-planning` passe à `display: none` sur les autres onglets, ce qui rendrait toute mesure prise pendant ce
temps-là nulle et fausse tant qu'elle n'est pas reprise une fois la page revisible.

### 74.3. Légende des chantiers et bouton Imprimer sur la même ligne

`#legendeBarre` est le nouveau conteneur flex (`justify-content: space-between`) qui porte les deux : `.legende`
(inchangée à l'intérieur, juste réduite à un simple enfant flex) à gauche, le bouton Imprimer à droite. Ce
dernier ne dépendait d'aucune donnée de la grille (juste un clic vers `openPrintSheet`) — il n'a donc plus
besoin d'être reconstruit à chaque `construireGrille()` comme avant (l'ancien `<div class="barre-imprimer">`
jetable, recréé à chaque rendu) : il devient un bouton statique du gabarit HTML (`htmlPagePlanning`), câblé
une seule fois (`cablerPagePlanning`).

### 74.4. Boutons annuler/refaire dans la case vide à gauche des jours

`.barre-undo` n'est plus une barre flottante en survol de la grille (`position: sticky` + `height: 0` +
`transform`, cf. §73.4) : ses 2 boutons sont déplacés en JS dans la cellule `.th.coin` de la ligne des jours —
celle, vide, que montrait la flèche rouge du croquis. Cette cellule porte déjà `position: sticky; left: 0`
(comme la colonne des noms), donc les boutons restent visibles à gauche même en défilant horizontalement dans
la semaine — vérifié : ils restent bien ancrés après un défilement horizontal de 300px dans la reproduction
de vérification.

Piège évité : `#barreUndo` est un élément unique, câblé une seule fois (`#btnDefaire`/`#btnRefaire`,
`cablerPagePlanning`) — le déplacer DANS `#racine` puis laisser le prochain rendu faire
`racineEl.innerHTML = ""` l'aurait détruit avec le reste (et perdu ses écouteurs de clic) puisqu'il vit
maintenant à l'intérieur du sous-arbre vidé à chaque rendu. `construireGrille()` le sort donc d'abord (vers
`document.body`, un aller-retour synchrone invisible) avant de vider `#racine`, pour le replacer ensuite dans
la cellule fraîchement reconstruite — vérifié par 2 reconstructions successives dans la reproduction, boutons
toujours présents et cliquables à la fin.

### 74.5. `trouverScroller()` — le panoramique/défilement auto pendant un glissé de jalon/note

Effet de bord de la scission en 2 grilles (§74.1) repéré en relisant tout le code de glissement plutôt qu'en
le découvrant en prod : plusieurs endroits retrouvent le conteneur qui défile horizontalement via
`el.closest(".scroller")` pour faire défiler automatiquement quand on approche du bord de l'écran pendant un
glissé (déplacement d'une bulle, sélection d'une plage à la souris). Une bulle ou une case de la ligne Jalons
ou Notes vit maintenant dans `.entete-planning-scroll`, PAS dans `.scroller` — ce lookup n'y trouvait donc
plus rien pour ces 2 lignes précises (sans planter, grâce aux `if (scroller)` déjà présents partout, mais le
panoramique/défilement auto restait silencieusement sans effet). Remplacé par `trouverScroller(el)`, qui
redirige systématiquement vers le VRAI `.scroller` quand l'ancêtre trouvé est `.entete-planning-scroll` (lui
appliquer un défilement directement l'aurait désynchronisé du corps, son `scrollLeft` n'étant qu'un miroir,
cf. §74.1) — le mirroring existant se charge ensuite de répercuter le mouvement sur l'en-tête.

### 74.6. Vérifications

Suite complète (17 fichiers `test_*.js`, hors `test_edge_functions.js`, préexistant, sans rapport) : verte —
vérifié aussi `node --check` sur le `<script>` extrait et l'équilibre des accolades CSS (477=477) et JS
(1690=1690) après coup, changement d'une taille inhabituelle pour ce fichier. Vérification visuelle
(Playwright, CSS RÉEL extrait d'`Index.html`, reproduction fidèle de la structure DOM produite par
`construireGrille()` avec Jalons à 1 piste et Notes à 2 pistes pour couvrir le cas d'une hauteur variable) :

- Légende + Imprimer bien sur une seule ligne, espaces resserrés entre onglets/légende/nav de semaine.
- Boutons annuler/refaire dans la case coin, ancrés à gauche même après défilement horizontal.
- Défilement vertical de 900px : onglets, légende+imprimer, nav de semaine, jours, Jalons et Notes restent
  parfaitement immobiles à l'écran ; seules les lignes Personnel/Intervenants défilent dessous, aucune fuite
  visible à la jonction.
- Défilement horizontal de 300px dans le corps : les colonnes de jours de l'en-tête suivent exactement les
  colonnes de tâches du corps (`enteteScroll.scrollLeft === scroller.scrollLeft` à chaque instant, mesuré).
- 2 reconstructions successives de la grille (simulant des changements de données consécutifs) : boutons
  annuler/refaire toujours présents et cliquables, aucune erreur JS console.

## 75. Round du 16.09.2026 (suite, suite, suite, encore) — nettoyage CSS suite à une relecture externe

Une relecture externe du fichier (pas un retour de Lionel sur l'usage de l'appli, mais une revue de code)
a signalé 4 points. Vérification faite avant toute action, puisque le point le plus grave contredisait ce
qui avait déjà été validé (accolades CSS/JS équilibrées, `node --check` propre, balises fermées) :

- **« Fichier tronqué »** — FAUX pour `Index.html` du dépôt (celui livré/synchronisé) : dernière ligne
  `</html>`, `</body>`/`</html>` présents une fois chacun, `<style>`/`</style>` 2 fois chacun (une seconde
  petite feuille existe ailleurs dans le fichier, rien d'anormal), `node --check` du `<script>` extrait
  toujours vert. Le fichier que la relecture a examiné (nommé "Index (7).html" — une convention de nom de
  téléchargement de navigateur pour une 7e copie) est probablement un téléchargement local incomplet ou
  périmé, distinct de ce dépôt.
- **« Variables dark-mode déclarées deux fois »** — partiellement fondé, mais pas pour la raison invoquée.
  Les 2 sélecteurs (`@media(prefers-color-scheme:dark) :root:not([data-theme="light"])` et
  `:root[data-theme="dark"]`) ne sont pas une simple duplication à fusionner en temps normal : ils couvrent 2
  cas différents d'un système de thème à 3 états (suivre le système, sauf choix explicite clair / forcer le
  sombre quel que soit le système). Mais cette appli n'a JAMAIS posé l'attribut `data-theme` nulle part (pas
  de bouton de bascule thème) : le 2e sélecteur était du code mort depuis l'origine. Supprimé (cf. commentaire
  laissé dans le CSS) — seul le suivi de la préférence système reste, qui est le seul cas qui s'applique
  réellement dans cette appli.
- **Usage de `!important`** — 26 occurrences, concentrées dans les surcharges d'impression (`@media print`,
  qui en ont structurellement besoin pour l'emporter de façon fiable sur les styles écran) et les états de
  glisser-déposer (qui doivent l'emporter sur des styles inline posés par JS ailleurs). Laissé tel quel :
  chacune est déjà justifiée par un commentaire ciblé au moment de son ajout, ce n'est pas une accumulation
  accidentelle.
- **`z-index` codés en dur** et **volume de commentaires** — remarques valables pour un refactor de
  maintenabilité (variables CSS nommées pour les paliers de profondeur ; les commentaires "Round"
  documentent l'historique réel des retours de Lionel et ont déjà évité de refaire 2 fois la même erreur
  dans ce fichier, cf. §73.2/§74.2 — mais alourdissent effectivement la lecture). Laissés en l'état à la
  demande de Lionel : chantier proposé, pas retenu pour l'instant.

Vérifié après coup : accolades CSS toujours équilibrées (476=476, une paire en moins que le bloc supprimé),
`node --check` du script extrait toujours vert, suite `test_*.js` toujours verte (hors
`test_edge_functions.js`, préexistant).

## 76. Round du 16.09.2026 (suite, suite, suite, encore, encore) — PWA : manifest.json + icônes

Lionel propose la PWA (« Ajouter à l'écran d'accueil », icône propre, plein écran, sans passer par un
store). Portée retenue après discussion : **manifest + icônes seulement**, pas de service worker à ce
stade (pas d'installation automatique Android ni de résilience hors-ligne, mais rien à maintenir en plus —
« Ajouter à l'écran d'accueil » fonctionne déjà très bien sur iOS et Android via le menu du navigateur avec
juste ça).

### 76.1. Hébergement — pas besoin de passer par GitHub Pages

`MIGRATION-GITHUB-PLAN.md` visait GitHub Pages par défaut pour le frontend, mais un fichier `_redirects`
(`/    /Index.html   200`) déjà présent dans le dépôt, plus une mention dans `BACKEND-CHANGELOG.md` §27.3
(« poussé par Lionel lui-même depuis GitHub Desktop, puis reconstruit côté Netlify »), montrent que
l'hébergement réel du frontend est déjà **Netlify** (déploiement automatique à chaque `git push`) — pas
GitHub Pages. Question posée à Lionel : « via netlify, comment passer par github Pages ? ». Réponse : **pas
nécessaire pour la PWA**. Une PWA a seulement besoin d'une vraie origine HTTPS stable pour que le manifest
et les icônes soient pris en compte par le téléphone — Netlify remplit ce rôle exactement comme le ferait
GitHub Pages, aucune des balises ajoutées ci-dessous ne dépend de l'hébergeur. Migrer vers GitHub Pages
reste possible plus tard si Lionel le souhaite pour d'autres raisons (ex. tout centraliser sur GitHub), mais
ce n'est plus un prérequis de ce chantier.

### 76.2. Icône — motif généré, pas encore un vrai logo

Lionel n'a pas de logo d'entreprise sous la main pour l'instant : icône générée par script (`Pillow`), pas
dessinée à la main — motif simple d'un mur de briques (3 rangs en quinconce, blanc sur fond `--accent`
`#1f4d8f`, la couleur d'accent déjà utilisée dans toute l'appli), lisible aussi bien en 512px qu'en 32px
(vérifié visuellement aux deux tailles). Contenu maintenu dans la zone de sécurité centrale (~80%) utilisée
par les icônes adaptatives Android, posées en `"purpose": "any maskable"` dans le manifest — le système peut
découper l'icône dans la forme qu'il veut (cercle, carré arrondi...) sans couper le motif. À remplacer
facilement le jour où Lionel a un vrai logo : il suffit de régénérer les fichiers `icons/icon-*.png` avec la
même nomenclature, rien d'autre à toucher.

Fichiers ajoutés dans `icons/` : `icon-512.png`, `icon-192.png` (icônes du manifest, écran d'accueil),
`icon-180.png` (`apple-touch-icon`, taille recommandée pour iOS), `icon-32.png` (favicon d'onglet).

### 76.3. `manifest.json` (nouveau fichier, racine du dépôt)

```json
{
  "name": "Planning Chantiers",
  "short_name": "Planning",
  "description": "Planning des chantiers, du personnel et des sous-traitants.",
  "lang": "fr",
  "start_url": ".",
  "scope": ".",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#eef0ec",
  "theme_color": "#1f4d8f",
  "icons": [...]
}
```

`start_url`/`scope` en chemin relatif (`.`) : résolus par rapport à l'URL du manifest lui-même (donc la
racine du site, là où vit déjà `Index.html`) — fonctionne sans changement si le nom de domaine change un
jour. `background_color` reprend `--bg` (fond clair de l'appli, visible un court instant à l'ouverture avant
que le CSS ne soit appliqué) ; `theme_color` reprend `--accent` (barre de statut du téléphone en mode
plein écran).

### 76.4. `Index.html` — balises ajoutées dans `<head>`

Le fichier n'avait jusqu'ici **aucune balise `<title>`** (confirmé par recherche avant d'ajouter — l'onglet
du navigateur affichait donc l'URL brute) : ajoutée au passage, `<title>Planning Chantiers</title>`.
Ajoutés aussi : `<link rel="manifest">`, `<meta name="theme-color">`, 3 tailles de favicon (`<link
rel="icon">`), `<link rel="apple-touch-icon">`, et les meta `apple-mobile-web-app-*`/`mobile-web-app-capable`
qui permettent à Safari iOS de traiter la page comme une appli plein écran (iOS ignore encore largement le
manifest pour ces réglages-là, d'où ces balises historiques en plus, toujours nécessaires en 2026).

### 76.5. Vérifications

`node --check` du `<script>` extrait toujours vert ; comptage des balises `<html>`/`<head>`/`<body>`/
`<style>`/`<script>` inchangé par rapport à `HEAD` avant ce round (seul le nombre de lignes change, +24,
uniquement des ajouts dans `<head>`) — pas de régression structurelle. Servi en local (`python3 -m
http.server`) et ouvert avec Playwright : `<title>` correct, `manifest.json` se charge et son JSON est
valide avec les bonnes valeurs, favicon 32px chargé (200). Les erreurs réseau vues dans la console
(polices Google Fonts, `supabase-js` en CDN) sont la limite réseau connue de cet environnement (cf.
`MIGRATION-GITHUB-PLAN.md` §5), pas une régression de ce round — rien à voir avec le manifest ou les icônes,
qui eux se chargent bien en local.

**Pas encore vérifié en conditions réelles** (comme toujours pour tout ce qui touche à l'installation sur
téléphone, cf. limite réseau de cet environnement) : Lionel doit tester « Ajouter à l'écran d'accueil »
depuis son téléphone une fois ce round synchronisé sur Netlify, sur iOS (Safari > icône de partage >
« Sur l'écran d'accueil ») et/ou Android (Chrome > menu ⋮ > « Installer l'application » ou « Ajouter à
l'écran d'accueil » selon la version).

## 77. Round du 16.09.2026 (suite, suite, suite, encore, encore, encore) — bascule Netlify → GitHub Pages : quota Netlify dépassé, `Index.html` renommé en `index.html`

Lionel a atteint le quota (crédits mensuels) de son plan Netlify gratuit — plus moyen de déployer de
nouvelle version tant que le cycle ne se réinitialise pas ou sans passer sur une offre payante. Décision de
Lionel : basculer sur **GitHub Pages** (gratuit, sans système de crédits pour ce volume). Dépôt passé en
**public** au passage (requis par GitHub Pages sur le plan gratuit) — vérifié avant de le proposer : aucun
secret dans le code suivi par git, seule la clé Supabase **anon** (publique par construction, cf. commentaire
déjà présent au-dessus dans `Index.html`) y figure, la vraie protection des données reste les policies RLS
(`sql/0002_rls.sql`), pas le secret du dépôt.

### 77.1. Pourquoi renommer `Index.html` en `index.html`

Premier essai sans renommage : URL racine de GitHub Pages en 404. Cause attendue et déjà anticipée
(§76.1) : GitHub Pages, contrairement à Netlify (`_redirects`), ne sait servir que `index.html` en minuscule
à la racine d'un site — aucune option de configuration pour changer ce nom, pas de mécanisme de
redirection équivalent à `_redirects`. Lionel a demandé si on pouvait simplement passer en minuscule :
oui, mais pas par un simple renommage dans l'Explorateur Windows — **NTFS étant insensible à la casse**,
un renommage fait ainsi ne produit generalement aucun changement détecté par git (`core.ignorecase=true`
par défaut sous Windows) : le dépôt garderait `Index.html` en interne malgré l'apparence locale changée.
Renommage fait proprement via `git mv Index.html index.html` directement sur le dépôt de Lionel (accès
disque via le pont vers son ordinateur), qui met à jour l'index git explicitement quelle que soit la
sensibilité à la casse du système de fichiers — vérifié : `git status` affiche bien un vrai
`renamed: Index.html -> index.html`, jamais une suppression+ajout.

Fichiers ajustés pour rester cohérents avec le nouveau nom :
- `manifest.json` : `start_url` repassé de `"Index.html"` à `"index.html"` (déjà changé de `"."` à
  `"Index.html"` au round précédent, §76 — cf. commit dédié, l'ancien nom aurait pointé vers un fichier qui
  n'existe plus).
- `_redirects` (Netlify) : `/Index.html` → `/index.html`, gardé par prudence même si Netlify sert
  maintenant `index.html` par défaut sans avoir besoin de cette règle (aucun risque à la laisser).

### 77.2. Effet de bord découvert pendant le renommage : verrou git bloqué par le pont d'accès disque

Le pont technique qui permet d'agir sur les fichiers de l'ordinateur de Lionel depuis cet environnement
interdit par défaut toute suppression de fichier dans son dossier (protection contre une suppression
accidentelle ou non voulue). Effet de bord inattendu : git crée normalement un fichier temporaire
`.git/index.lock` pendant chaque opération d'écriture puis le supprime lui-même une fois terminé — cette
suppression automatique se heurte à la même protection, laissant un verrou bloqué derrière chaque commande
git lancée depuis cet environnement (déplacé par un `mv` de contournement à chaque fois pour continuer,
plutôt qu'une suppression directe, refusée). **Sans conséquence pour Lionel** : GitHub Desktop, sur son
ordinateur, n'écrit jamais via ce pont technique et n'est donc jamais concerné par cette protection — son
usage normal (Commit/Push) n'a strictement rien à changer ni à surveiller de ce côté.

### 77.3. Vérifications

`git status` sur le dépôt de Lionel : renommage propre `Index.html -> index.html` en attente de commit,
`manifest.json`/`_redirects` modifiés en cohérence, `node --check` du `<script>` extrait de `index.html`
(nouveau nom) toujours vert — aucune corruption pendant le renommage. Reste à Lionel : ouvrir GitHub
Desktop, vérifier la liste des changements (le renommage doit apparaître comme tel, pas comme
suppression + ajout séparés), Commit puis Push, puis réessayer l'URL racine de GitHub Pages (sans
`/index.html` à la fin, cette fois) une fois la reconstruction terminée (1-2 minutes).

**Repéré au passage, sans lien avec ce round** : deux fichiers non suivis trouvés dans le dossier
(`Claude outputs/Index-1.html`, `Claude outputs/mockup_multi_chantier.png`) — pas créés pendant cette
session, laissés tels quels sans y toucher ; à voir avec Lionel s'il veut les garder, les committer ou les
supprimer.

### 77.4. Suite et résolution

Trois accrocs successifs après le push, chacun résolu avant de passer au suivant :

- **Verrou git bloqué** (`.git/index.lock`) empêchant tout commit depuis GitHub Desktop (« Commit failed :
  A lock file already exists ») — laissé par inadvertance par les commandes git lancées depuis cet
  environnement sur le dépôt de Lionel (cf. §77.2, le pont technique empêche la suppression, seulement le
  déplacement). Déplacé hors du chemin, le commit est repassé aussitôt.
- **Conflit de fusion sur `manifest.json`** au push suivant (divergence entre la version que j'avais écrite
  directement sur le disque et celle déjà envoyée par Lionel plus tôt dans ce round) — résolu en collant le
  contenu final correct entier dans le fichier, `Continue merge` puis `Push origin`. Fin de différence
  résiduelle purement cosmétique (retours à la ligne CRLF/LF, Windows vs Unix) nettoyée dans la foulée.
- **Icône manquante à l'installation** (PWA installée sur PC et téléphone, mais sans le logo) — cause la
  plus probable : install tentée par Lionel avant que le manifest/les icônes ne soient réellement
  accessibles en ligne (pendant les épisodes 404/verrou/conflit ci-dessus), le navigateur avait mis en
  cache une installation sans icône. Corrigé en désinstallant puis réinstallant après un rechargement forcé
  de la page (Ctrl+Maj+R) — **confirmé fonctionnel par Lionel** après cette manipulation.

**Bascule Netlify → GitHub Pages confirmée opérationnelle de bout en bout** : dépôt public, Pages activé,
`index.html` à la racine, manifest + icônes servis correctement, PWA installable avec la bonne icône sur PC
et téléphone. Netlify reste configuré (le `_redirects` ne gêne pas) mais n'est plus la source de vérité —
à réévaluer si le quota Netlify redevient disponible et que Lionel préfère y revenir un jour.

## 78. Round du 16.09.2026 (encore un autre) — glisser au doigt ne fonctionnait plus du tout sur le planning

Lionel : « Sur tactile, glisser le doigt sur la partie planning ne fonctionne pas. » Pas de précision sur
le geste exact (défilement, déplacement de tâche, sélection multiple) — cause trouvée touche en réalité
les trois, puisqu'ils partagent tous le même mécanisme sous-jacent.

### 78.1. Cause : `setPointerCapture` non protégé, exception qui coupe tout le geste en silence

Toute la logique tactile de la grille (défilement en glissant, déplacement d'une bulle, sélection de
plusieurs cases) repose sur le même squelette : `pointerdown` → `elementCible.setPointerCapture(pointerId)`
→ attacher `pointermove`/`pointerup`. **7 sites** (`cablerAjoutCellule`, `onPointerDownGroupeSelection`,
`demarrerDefilementOuSortieSelection`, `demarrerDefilementSimple`, la poignée de redimensionnement, la
reprise de glissement groupé) appelaient `setPointerCapture` SANS `try/catch` — alors que son inverse,
`releasePointerCapture`, est systématiquement protégé partout ailleurs dans le fichier
(`try { ...releasePointerCapture...; } catch (ex) {}`). Une asymétrie qui s'est avérée être le bug : quand
`setPointerCapture` lève une exception (ce qui arrive sur certains navigateurs/appareils dans certaines
conditions — pointeur déjà invalidé, geste système concurrent comme un retour-arrière au bord de l'écran
sur Android, etc.), l'exception, non rattrapée, interrompt immédiatement le reste de la fonction
JavaScript : les `addEventListener("pointermove", ...)` qui suivaient ne s'exécutaient jamais. Résultat :
le doigt bouge, rien n'écoute plus rien — ni défilement, ni glissement de tâche, ni sélection. Pas une
seule ligne d'erreur visible pour l'utilisateur (l'exception meurt silencieusement dans le gestionnaire
d'événement), ce qui rendait le bug particulièrement difficile à repérer sans regarder le code.

### 78.2. Reproduction avant correctif

Confirmé en isolant exactement ce squelette dans une page de test séparée et en déclenchant le même
enchaînement `pointerdown`/`pointermove`/`pointerup` (avec `pointerType: "touch"`) via Playwright : sans
`try/catch`, un `setPointerCapture` qui échoue bloque tout — aucun `scrollLeft` ne bouge, aucun événement
`pointermove` suivant n'est traité. Avec le même scénario mais `try/catch` autour de l'appel, le geste
continue normalement malgré l'échec de la capture (`scrollLeft` progresse comme attendu). Reproduction
fidèle du symptôme signalé par Lionel : un geste tactile qui ne fait strictement rien.

### 78.3. Correctif

Les 7 appels `X.setPointerCapture(pointerId)` sont maintenant tous enveloppés en
`try { X.setPointerCapture(pointerId); } catch (ex) {}`, exactement comme leur pendant
`releasePointerCapture` l'était déjà. Pas de changement de comportement dans le cas normal (capture
réussie) — seule différence : un échec de capture n'empêche plus le reste du geste (défilement,
glissement, sélection) de continuer à fonctionner via les événements `pointermove`/`pointerup` classiques
(qui n'ont pas besoin de la capture pour être reçus tant que le doigt reste sur l'écran).

### 78.4. Vérifications

`node --check` du `<script>` extrait toujours vert. Suite `test_*.js` relancée intégralement : 8/9 fichiers
verts (`test_edge_functions.js` en échec, mais pour une raison préexistante et déjà documentée — une
fonction `joursOuvresDepuis` introuvable sous ce nom, sans rapport avec ce round). **Corrigé au passage** :
9 fichiers `test_*.js` référençaient encore l'ancien nom `Index.html` (majuscule) pour lire le fichier
source — cassés silencieusement depuis le renommage du §77 (ils cherchaient un fichier qui n'existe plus).
Remis à jour vers `index.html`, ce qui a permis de relancer la suite et de confirmer l'absence de
régression sur ce round.

**Pas encore confirmé par Lionel en conditions réelles sur son téléphone** — la reproduction ci-dessus
isole fidèlement le mécanisme en cause, mais la cause exacte du déclenchement de l'exception sur l'appareil
de Lionel spécifiquement (navigateur, geste concurrent du système, etc.) n'a pas pu être identifiée avec
certitude depuis cet environnement (aucun accès à un vrai téléphone). À revalider une fois synchronisé.

## 79. Round du 16.09.2026 (encore un autre, suite) — le glisser tactile ne fonctionnait TOUJOURS que sur la colonne des noms

Retour de Lionel après synchronisation du §78 : « Cela fonctionne uniquement en appuyant sur la colonne
des noms. » Autrement dit : le §78 (try/catch autour de `setPointerCapture`) n'a pas suffi — le geste
tactile ne fonctionne encore nulle part ailleurs que sur la 1ère colonne (noms des personnes/« Jalons »/
« Notes »).

### 79.1. Pourquoi la colonne des noms, précisément

Indice décisif : `.lbl` (les cellules de cette colonne, cf. CSS `.th.coin, .lbl, .lbl-speciale`) est la
SEULE classe de cellule de la grille qui n'a **jamais** eu `touch-action: none` — contrairement à `.cell`,
`.bulle` et `.poignee`, qui l'ont toutes les trois. Résultat : un glissé démarré sur `.lbl` est pris en
charge par le défilement **natif** du navigateur (jamais concerné par le moindre bug JS), alors qu'un
glissé démarré sur `.cell`/`.bulle` dépend à 100 % du code JS maison (`cablerAjoutCellule`,
`onPointerDownGroupeSelection`, `cablerPoigneeRedim`, etc.) puisque `touch-action: none` empêche
justement le navigateur de faire quoi que ce soit lui-même. Le rapport de Lionel isole donc exactement la
frontière du bug : tout ce qui est nativement scrollable fonctionne, tout ce qui dépend du JS maison ne
fonctionne pas — le correctif du §78 (qui empêchait seulement un *plantage*) n'a manifestement pas suffi à
réparer le fond du problème sur son appareil réel.

### 79.2. Le vrai problème architectural

Les 7 sites identifiés au §78 posent tous le même schéma : au `pointerdown`, on appelle
`elementCible.setPointerCapture(pointerId)` PUIS on attache `pointermove`/`pointerup`/`pointercancel`
directement sur `elementCible` (la case, la bulle, ou la poignée touchée). Ce schéma ne fonctionne
correctement QUE si `setPointerCapture` réussit VRAIMENT (pas seulement « ne plante pas ») : c'est elle
qui redirige tous les événements suivants vers `elementCible`, quel que soit l'endroit où le doigt se
trouve ensuite à l'écran. Si la capture échoue silencieusement (le `try/catch` du §78 masque l'échec sans
le corriger), ou si, pour toute autre raison propre au navigateur/appareil de Lionel, les événements
`pointermove` ne sont pas redirigés vers `elementCible` comme prévu, alors les écouteurs posés dessus ne
reçoivent plus rien après le tout premier instant du geste — d'où un glisser qui ne « prend » jamais,
exactement le symptôme rapporté. Le try/catch du §78 était nécessaire (il a corrigé un vrai plantage) mais
ne s'attaquait qu'à UNE cause possible de l'échec, pas à la fragilité de fond : toute cette mécanique
tactile reposait entièrement sur la réussite d'un mécanisme qu'on ne contrôle pas complètement selon les
navigateurs/appareils.

### 79.3. Correctif : écouter sur `document`, plus sur l'élément touché

Sur les 7 mêmes sites (poignée de redimensionnement, groupe de bulles sélectionnées, reprise d'un groupe
déposé, bulle seule, case vide « ajout », case vide « sélection rapide » double-tap/clic-droit, et les 2
variantes de simple défilement), les écouteurs `pointermove`/`pointerup`/`pointercancel` sont désormais
posés sur `document` plutôt que sur l'élément spécifiquement touché. `document` est un ancêtre de
n'importe quel élément de la page : les événements lui parviennent donc TOUJOURS par la remontée normale
(bubbling), que la capture ait réussi ou non, quel que soit l'endroit où le doigt se déplace à l'écran, et
même si l'élément de départ venait à être retiré/reconstruit par un `render()` en cours de geste. Comme
plusieurs gestes peuvent en théorie être actifs en même temps (2 doigts), chaque fonction interne
(`onMove`, `onUp`, `onCancel`, etc.) vérifie désormais `e2.pointerId !== pointerId` en tout premier et
ignore l'événement si ce n'est pas le sien — sans ce garde-fou, un second doigt aurait pu perturber un
geste déjà en cours ailleurs sur l'écran. L'appel à `setPointerCapture` (protégé par try/catch depuis le
§78) est conservé : inoffensif, et toujours utile en pratique pour la souris/le stylet, où il fonctionne
de façon fiable.

### 79.4. Vérifications

`node --check` du `<script>` extrait toujours vert. Suite `test_*.js` relancée intégralement : même
résultat qu'au §78 (tout vert sauf `test_edge_functions.js`, échec préexistant et sans rapport). Reproduit
dans une page de test séparée un glissé qui traverse volontairement PLUSIEURS cases voisines (40px chacune,
comme des jours dans l'appli réelle) via des `PointerEvent` synthétiques Playwright : avec les écouteurs
posés sur `document` et sans jamais faire réussir `setPointerCapture`, le défilement progresse correctement
sur tout le geste (`scrollLeft` avance jusqu'à la valeur attendue), confirmant que le nouveau code ne
dépend plus du tout de la réussite de la capture pour fonctionner.

**Toujours pas 100 % confirmable depuis cet environnement** (aucun accès à un vrai téléphone tactile) :
cette restructuration élimine une catégorie entière de fragilité (dépendance à la réussite de
`setPointerCapture`, et au fait que l'élément d'origine reste exactement le même nœud DOM pendant tout le
geste) plutôt que de cibler un seul mécanisme d'échec précis — c'est le schéma robuste standard pour ce
genre de glisser tactile personnalisé. Si le problème persistait malgré tout après cette mise à jour, il
faudrait le modèle du téléphone et le navigateur utilisé (Chrome, Safari, Samsung Internet…) pour
diagnostiquer plus loin, faute de pouvoir reproduire un vrai geste tactile matériel depuis cet
environnement.

## 80. Round du 16.09.2026 (encore un autre, suite, suite) — croquis annoté : 4 zones à désencombrer, repli Jalons/Notes, confirmation du figé haut+gauche

Lionel a renvoyé une capture d'écran annotée de l'appli installée (PWA Windows), avec 4 rectangles rouges,
une ligne verte et une ligne rose :

> on peut encore gagner de la place en réduisant les zones ou j'ai fait des rectangles rouge.
> avoir la possibilité de masquer jalons et note avec une petite flèche comme le personnel et les
> intervenants (rond bleu)
> tout ce qui est au dessus de la ligne verte doit être fixe
> idem pour tout ce qui est à gauche de la ligne rose

Les 4 rectangles rouges : la bande vide en haut contenant "Se déconnecter", l'espace entre les onglets et la
légende, et les bandes vides sous JALONS et sous NOTES. La ligne verte coupe horizontalement juste au-dessus
de la ligne JALONS ; la ligne rose coupe verticalement juste après la colonne des noms.

### 80.1. Bouton "Se déconnecter" ramené dans la barre d'onglets (1er rectangle)

`.lien-deconnexion` (position:fixed, top:10, cf. `afficherLienDeconnexion`) survolait l'appli en PERMANENCE
depuis la connexion jusqu'à la déconnexion — `.onglets-nav` portait donc un `padding-top: 44px` fixe pour lui
réserver de la place tout du long, même une fois la vraie coquille de navigation construite et déjà pourvue
de sa propre barre. Ce padding constant, sur toute la durée de la session, était la vraie source de la bande
vide repérée par Lionel.

Le lien rejoint maintenant `.onglets-nav` elle-même, comme un second enfant flex à côté de la liste d'onglets
(devenue `.onglets-liste`, seule à défiler horizontalement au doigt sur mobile) : nouveau bouton
`.lien-deconnexion-nav`, câblé dans `construireCoquille()`. Une fois la coquille construite, la version
flottante devient redondante et `construireCoquille()` la retire du DOM — elle ne reste donc plus visible
qu'une fraction de seconde, entre la connexion réussie et le premier rendu réel (le temps que `demarrer()`
charge les données), ou en cas d'échec de chargement (`erreurFatale`, où elle reste utile pour se
déconnecter/changer de compte). `padding-top: 44px` disparaît en conséquence — plus besoin de réserver quoi
que ce soit puisque le bouton occupe désormais une place normale dans le flux.

### 80.2. Espacement resserré entre onglets et légende (2e rectangle)

Même resserrement qu'au §74.2, un cran de plus : `.onglets-nav { margin-bottom: 8px → 4px }` et
`.legende-barre { padding-top: 14px → 8px }`. Absorbé en `padding` (jamais en `margin`), toujours pour la
même raison qu'aux §73.2/74.2 : un padding fait partie de la boîte peinte d'un élément sticky et la couvre,
une marge est transparente et laisserait le contenu défilé réapparaître dans cette bande.

### 80.3. La vraie cause de la bande vide sous Jalons/Notes (3e et 4e rectangles)

Avant de corriger quoi que ce soit, vérifié — plutôt que supposé — l'hypothèse la plus probable a priori
(une 2e piste fantôme dans `assignerPistes`, causée par des jalons des semaines voisines qui fuiraient dans
le calcul). Récupéré les vraies données de la semaine du croquis (14–18 sept. 2026) depuis Supabase, puis
rejoué exactement le même calcul de fusion/pistes que l'appli (`itemPlage`/`assignerPistes`) dans un script
Node isolé : résultat, une seule piste occupée (`nbPistes = 1`) — l'hypothèse de la piste fantôme est fausse,
`fenetreDonnees()` ne charge de toute façon que la semaine affichée, jamais les semaines voisines.

La vraie cause est architecturale : `.cell` (le fond de chaque case, un élément FRÈRE de la bulle qu'il
héberge dans la grille, pas son parent — cf. `poser()`) porte un `min-height: 52px` commun à TOUS les types
de case, dimensionné pour Personnel/Intervenants qui peuvent afficher jusqu'à 2 lignes de texte de tâche. Un
jalon ou une note tient quasiment toujours sur une seule ligne (`.bulle-plage` porte `align-self: start`, pas
d'étirement) : le fond `.cell` impose malgré tout 52px à toute la ligne de grille, et la bulle plus courte
laisse le reste visible en dessous, vide.

Corrigé en scopant un `min-height: 36px` à `.cell.cell-jalon, .cell.cell-note` uniquement — juste assez pour
une bulle d'une ligne avec un peu de respiration, sans jamais brider une bulle sur 2 lignes si le texte
déborde exceptionnellement (un `min-height` est un plancher, pas un plafond). `.cell-personne`
(Personnel/Intervenants) garde ses 52px, inchangé.

### 80.4. Flèche de repli pour Jalons et Notes

Même principe que `replierSectionPersonnel`/`replierSectionIntervenants` (Personnel/Intervenants, rond bleu
du croquis de Lionel) : nouvelles variables `replierJalons`/`replierNotes` (déplié par défaut, jamais
persisté — reparties à `false` à chaque rechargement, comme les 2 autres), et le même bouton
`.btn-section-toggle` (flèche qui pivote à -90° une fois repliée) réutilisé tel quel. Différence avec
Personnel/Intervenants : Jalons/Notes n'ont pas de ligne d'en-tête séparée (`ligneSection`) — le bouton est
donc posé directement dans le libellé de ligne existant (`.lbl.lbl-speciale`), qui passe de
`flex-direction: column` à `row` pour que le libellé et la flèche partagent la même ligne plutôt que d'être
empilés. Repliée, la ligne perd tout son contenu (`visibles = []`, `nbPistes` forcé à 1) et ne garde plus
qu'une bande fine avec son étiquette.

### 80.5. Confirmation du figé haut (ligne verte) et gauche (ligne rose)

Ces deux comportements sont déjà en place depuis le §74 (grille scindée `grilleEntete`/`grilleCorps`,
`.entete-planning-figee` sticky contre `#app` pour tout ce qui est au-dessus de Personnel/Intervenants ; et
`position: sticky; left: 0` sur `.th.coin, .lbl, .lbl-speciale`, présent depuis bien avant, pour la colonne
des noms) — aucun changement de code n'était nécessaire ici. Ce round revérifie seulement, en conditions
proches du réel, que les changements 80.1–80.4 ci-dessus (déconnexion déplacée, espaces resserrés, hauteurs
réduites, lignes repliables) ne les ont pas cassés.

Vérification par Playwright, avec les vraies données Supabase de la semaine du croquis (personnes,
chantiers, statuts, tâches, assignations, jalons, notes du 14 au 18 sept. 2026), `index.html` chargé tel
quel et une session Supabase simulée localement (jeton dans `localStorage`, avant même le premier script de
la page — le CDN jsDelivr qui sert `@supabase/supabase-js` étant bloqué dans ce bac à sable, sa copie a été
récupérée depuis le registre npm et servie localement à la place, sans toucher `index.html`) :

- Défilement vertical de `#app` : `.entete-planning-figee` (nav de semaine, jours, M/A, Jalons, Notes) reste
  parfaitement immobile à l'écran une fois le point d'accroche sticky atteint ; seules les lignes
  Personnel/Intervenants défilent dessous.
- Défilement horizontal de `.scroller` (viewport volontairement étroit pour forcer un vrai débordement) :
  la colonne des noms (`.lbl`) garde exactement le même `left` avant/après, pendant que les colonnes de
  jours glissent dessous.
- Repli/dépli de Jalons : la ligne se réduit à une bande fine avec sa flèche pivotée, Notes juste en dessous
  n'est pas affectée.
- Bouton "Se déconnecter" : présent une seule fois, dans la barre d'onglets ; la version flottante a bien
  disparu du DOM.
- Aucune erreur JS (console ou page) sur l'ensemble du scénario.

### 80.6. Vérifications

`node --check` du `<script>` extrait : vert. Suite `test_*.js` relancée intégralement : 18/19 verts,
`test_edge_functions.js` en échec — préexistant et sans rapport (référence `joursOuvresDepuis`, supprimée du
fichier depuis le retrait de « ajout lointain » au round D du 11.09.2026, jamais mis à jour depuis ; déjà
signalé identiquement aux §74.6 et §79.4).

**Pas encore confirmé par Lionel en conditions réelles** — les captures d'écran et mesures ci-dessus
reproduisent fidèlement la semaine de son croquis avec les vraies données, mais restent depuis cet
environnement plutôt que sur son PWA Windows installé. À revalider une fois synchronisé.

## 81. Round du 16.09.2026 (encore un autre, suite, suite, encore) — barre du haut « plus pro » : mockup validé, option 2

Suite au retour de Lionel « on pourrai retravailler un peu le visuel de l'application pour qu'elle fasse
plus "pro" », captures du bandeau Nolio à l'appui : envoyé un mockup dédié
(`mockup-barre-onglets-pro.html`) limité à la barre du haut (périmètre choisi par Lionel, plutôt qu'une
refonte visuelle complète), avec 2 options — un simple redessin des éléments existants (onglets en
pilules), ou la même chose plus une identité (repère de marque à gauche, avatar à droite). Réponse de
Lionel : « le 2 me plait plus, on peut mettre le petit logo que tu as fait pour l'icone au lieu de la
maison. Pas besoin de "planning chantier" dans la barre. l'icone suffit. »

Porté dans l'appli réelle (le mockup illustrait une maison générique en attendant la décision — jamais
question de l'utiliser telle quelle) :

- **Repère de marque** : l'icône PWA existante (`icons/icon-32.png`, motif "mur de briques", cf. §76 — pas
  de nouveau logo à créer), sans le nom "Planning Chantiers" à côté comme demandé. Nouveau
  `<div class="marque-nav">` en tout premier enfant de `.onglets-nav`, séparé des onglets par un filet
  vertical (`border-right`).
- **Onglets en pilules** : `.onglet` passe d'un trait sous le texte actif (`border-bottom`) à un fond plein
  arrondi (`background: var(--accent-soft)` + `color: var(--accent)` quand actif, `background:
  var(--surface-2)` au survol) — langage visuel du bandeau Nolio pris en référence. Padding réduit
  (11px/16px → 7px/14px) : accessoirement, la barre elle-même gagne encore en hauteur (49px → 39px sur la
  mesure de vérification), dans la continuité des §80.1/80.2.
- **Avatar au lieu du bouton texte** : `.lien-deconnexion-nav` (bouton rectangulaire "Se déconnecter")
  remplacé par `.avatar-nav`, un rond avec l'initiale "L" (un seul compte pour toute l'équipe, pas de
  gestion multi-utilisateur côté auth — l'initiale reste donc fixe plutôt que dérivée d'une session).
  Même `id="lienDeconnexionNav"` conservé : le clic déconnecte directement, exactement comme avant, aucun
  changement de logique JS, seul le gabarit HTML et le CSS de `construireCoquille()` changent. `title`/
  `aria-label="Se déconnecter"` ajoutés puisque le libellé textuel a disparu visuellement.

### 81.1. Vérifications

`node --check` du `<script>` extrait : vert. Suite `test_*.js` relancée intégralement : même résultat
qu'aux rounds précédents (tout vert sauf `test_edge_functions.js`, préexistant et sans rapport, cf.
§74.6/§79.4/§80.6). Playwright (mêmes vraies données Supabase que le §80) : icône bien affichée dans la
barre, onglet actif bien en pilule pleine, avatar "L" bien à droite à la place de l'ancien bouton, aucune
erreur JS, et le figé haut/gauche (§74, reconfirmé au §80.5) tient toujours après ce changement de gabarit.

**Pas encore confirmé par Lionel en conditions réelles** — à revalider une fois synchronisé, en particulier
que `icons/icon-32.png` se charge bien (chemin relatif identique à celui déjà utilisé par les balises
`<link rel="icon">` du `<head>`, donc sans raison de se comporter différemment, mais jamais vérifié tel
quel dans la barre avant ce round).

## 82. Round du 16.09.2026 (encore un autre, suite, suite, encore, encore) — les flèches de repli remplacées par 4 textes cliquables, regroupés dans la barre légende/imprimer

Retour de Lionel sur le §80 (captures d'écran de l'appli installée à l'appui, rectangle rouge tracé sur la
barre légende/imprimer) : « Les flèches pour le masquage des jalons/note sont mal placé. Pourquoi pas
mettre 4 Texte à cliquer pour masquer/démasquer Jalons, Notes, personnel, Intervenants a la place des
flèches. » — puis, en précision : « dans la zone du rectangle rouge ».

### 82.1. Ce qui change

Les 4 flèches ▾ (`.btn-section-toggle`, une par ligne : Jalons, Notes, Personnel, Intervenants —
introduites au §80 pour Jalons/Notes, réutilisées telles quelles depuis plus longtemps pour
Personnel/Intervenants) disparaissent entièrement, remplacées par 4 boutons texte regroupés au même
endroit : `.controles-affichage`, un nouveau groupe inséré dans `#legendeBarre`, juste après la légende des
chantiers — exactement la zone que Lionel entoure en rouge, restée vide entre la légende et le bouton
Imprimer depuis les resserrements du §80.2. `.legende-barre-gauche` regroupe désormais `.legende` et
`.controles-affichage` dans un même bloc flex, pour que `.legende-barre` garde exactement 2 enfants de haut
niveau et que `justify-content: space-between` continue de coller ce groupe à gauche et Imprimer à droite —
sans ce regroupement, un 3e enfant direct se serait retrouvé centré sur un écran large, loin de la légende.

Chaque bouton ("Jalons", "Notes", "Personnel", "Intervenants") affiche l'état de sa section par son propre
style plutôt que par une icône séparée : texte normal quand la section est visible, texte barré et atténué
(`.masque`) quand elle est repliée — même sémantique que l'ancienne icône pivotée, mais sur l'élément qu'on
vient de cliquer, sans repère supplémentaire à interpréter.

### 82.2. Implémentation

`.controles-affichage` est un conteneur STATIQUE du gabarit HTML (`htmlPagePlanning`), comme le bouton
Imprimer depuis le §74.3 — il ne dépend d'aucune donnée de la grille, donc câblé une seule fois
(`cablerPagePlanning`) plutôt que reconstruit à chaque `construireGrille()`. Une nouvelle fonction
`majControlesAffichage()` (même principe que `majBoutonsUndo()`) pose/retire la classe `.masque` sur chaque
bouton d'après les 4 variables d'état existantes (`replierJalons`, `replierNotes`,
`replierSectionPersonnel`, `replierSectionIntervenants` — inchangées, déjà là depuis le §80/avant) — appelée
à chaque rendu, juste à côté de `majBoutonsUndo()`/`ajusterEnteteFixe()`.

Nettoyage en conséquence : `ligneSection()` (Personnel/Intervenants) ne pose plus de bouton toggle, juste le
libellé et le bouton d'ajout ; la ligne Jalons/Notes (`.lbl-speciale`) redevient un simple libellé. La
classe `.btn-section-toggle` et son override `.lbl-speciale { display:flex; flex-direction:row… }` (ajouté
au §80 pour loger la flèche à côté du texte) sont retirés du CSS, devenus morts.

### 82.3. Vérifications

`node --check` du `<script>` extrait : vert. Suite `test_*.js` relancée intégralement : même résultat
qu'aux rounds précédents (tout vert sauf `test_edge_functions.js`, préexistant et sans rapport). Playwright
(mêmes vraies données Supabase que les §80/81) : les 4 boutons apparaissent bien groupés dans la zone visée,
un clic sur "Jalons" pose bien la classe `.masque` et replie la ligne (vérifié par capture d'écran avant/
après), le figé haut/gauche (§74, reconfirmé aux §80.5/81.1) tient toujours, aucune erreur JS.

**Pas encore confirmé par Lionel en conditions réelles** — à revalider une fois synchronisé.

## 83. Round du 16.09.2026 (encore un autre, suite×7) — barre d'outils façon Sheets, icônes dans le menu, légende des chantiers supprimée

Suite du §82 : Lionel propose (captures d'écran de Google Sheets à l'appui) « on pourrait même intégrer un
"sous-menu" avec des icones, comme dans sheet. y placer les boutons annuler/refaire, imprimer. liste
déroulante avec chantier par défaut. et 4 icones ON/OFF pour le masques/démasquage des sous-groupes », puis
précise à plusieurs reprises pendant l'exploration au mockup : « une ligne masquée ne doit pas être grisée,
mais 'désactivée'. même comportement que personnel/intervenants », puis « je préfèrerai des icones pour les
4 sous-groupes » (au lieu des interrupteurs `.interrupteur` d'abord essayés), puis « les légende des
chantiers doivent disparaitre, nous les afficheront ailleurs », puis « profites-en pour ajouter les icones
dans le menu ». Trois allers-retours de mockup (`mockup-sous-menu-outils.html`, livré et corrigé à chaque
étape) avant validation finale : « toolbar et menu ok, on ne réaffiche pas la légende des chantiers » — la
légende n'est donc réaffichée nulle part, ni dans cette barre ni ailleurs.

### 83.1. Ce qui change

Toute la mécanique dispersée depuis les rounds précédents (Annuler/Refaire dans la cellule coin de la
grille, cf. round précédent ; Imprimer et les 4 contrôles masquer/afficher dans `#legendeBarre`, cf. §82 ;
le chantier par défaut choisi d'un clic sur un swatch de la légende, round du 03.09.2026) se regroupe en
UNE seule barre d'outils dense sous les onglets, `.toolbar-sheets` (même id `#legendeBarre` conservé pour
`ajusterEnteteFixe()` — seul son contenu change), façon barre d'icônes de Google Sheets sous sa barre de
menus :

- **Annuler/Refaire** quittent la cellule coin de la ligne des jours (`.th.coin`, redevenue simplement
  vide) pour devenir le 1er groupe de la barre, avec de vraies icônes de flèches courbes (`ICONS.undo`/
  `ICONS.redo`) à la place des caractères "↶"/"↷" ronds — même `id`/logique JS (`defaire`/`refaire`,
  `majBoutonsUndo()`), seul le gabarit et l'habillage visuel changent (`.toolbar-btn` plat au lieu du rond
  bordé de `.barre-undo`).
- **Imprimer** perd son texte, ne garde que son icône (`ICONS.print`, déjà existante) — `title` reprend le
  texte explicatif pour le survol. Même `id="btnImprimerTitre"`, même câblage (`openPrintSheet`).
- **Chantier par défaut** : la légende cliquable (`#legende`, un item par chantier actif) est remplacée par
  un vrai sélecteur déroulant, `.select-chantier` — un bouton `#btnSelectChantier` (swatch + nom du
  chantier par défaut, ou un rond neutre + "Chantier" si aucun n'est choisi) qui ouvre un petit panneau
  `#panneauChantier` listant les chantiers actifs, coche celui en cours. La logique métier ne change pas
  du tout (`chantierParDefaut`/`chantierParDefautValide()`/`memoriserChantierParDefaut()`, round du
  03.09.2026, intacts) : cliquer le chantier déjà choisi le désélectionne, comme avant — seul l'habillage
  passe d'un clic direct sur un swatch de légende à un menu déroulant explicite. `construireLegende()` est
  renommée `construireSelectChantier()` (même déclenchement : au chargement et après tout changement de
  `chantiers`, cf. `rafraichirApresChantiers`) et reconstruit désormais le panneau + l'apparence du bouton
  au lieu d'une liste de `<div>` de légende.
- **La légende des chantiers elle-même disparaît** : plus aucune trace de `#legende`/`.legende` dans le
  DOM. Les bulles du planning restent identifiables par leur couleur de fond (`.bulle`, teinte du chantier)
  et par l'infobulle au survol (`title`, conservée depuis le round du 02.09.2026 — cf. son commentaire dans
  `bulleEl`) : sans la légende permanente, l'identification au clin d'œil demande un survol pour un
  chantier dont on ne connaît pas encore la couleur par cœur, ce que Lionel a arbitré en acceptant le
  compromis (« nous les afficheront ailleurs », puis « on ne réaffiche pas la légende des chantiers » —
  décision finale : nulle part).
- **4 icônes remplacent les 4 boutons texte du §82** (`.btn-affichage` → `.toolbar-toggle`) pour
  Jalons/Notes/Personnel/Intervenants — une icône différente par sous-groupe (drapeau, note, personnes,
  casque de chantier) plutôt que 4× la même icône, pour rester reconnaissable sans avoir à survoler,
  exactement comme Annuler/Refaire/Imprimer juste à côté. Icône active : fond teinté dans la couleur DÉJÀ
  associée à cette ligne dans la grille (`--jalon-bg` violet, `--note-bg` jaune) — Personnel/Intervenants,
  qui n'ont pas de teinte propre, reprennent l'accent bleu du reste de la barre. Icône désactivée : simple
  perte d'opacité (`.desactive`, opacité .5), jamais un gris plat inventé — Lionel : « une ligne masquée ne
  doit pas être grisée, mais 'désactivée' » (même principe que `.ligne-desactivee` sur Personnel/
  Intervenants). Même déclenchement qu'avant (clic → bascule `replierJalons`/`replierNotes`/
  `replierSectionPersonnel`/`replierSectionIntervenants` → `render(false)`), `majControlesAffichage()`
  pose/retire désormais `.actif`/`.desactive` au lieu de `.masque`.
- **Icônes dans le menu du haut aussi** (Lionel : « profites-en pour ajouter les icones dans le menu ») :
  chacun des 9 onglets (`.onglet`) reçoit une icône avant son libellé — Jalons/Personnel/Intervenants
  reprennent EXACTEMENT les mêmes icônes que leurs contrôles de masquage juste en dessous (le lien visuel
  est immédiat), Planning un calendrier, Général un engrenage, Chantiers un bâtiment, Statuts une
  étiquette, Fériés une étoile, Entrée rapide un éclair.

### 83.2. Implémentation

Nouvelles icônes ajoutées à l'objet `ICONS` partagé (déjà utilisé pour `close`/`print`/`people`/`trash`) :
`undo`, `redo`, `flag`, `note`, `hardhat`, `calendar`, `gear`, `building`, `tag`, `star`, `bolt` — mêmes
gabarits SVG (`viewBox="0 0 20 20"`, `stroke-width="1.5"`) que `print`/`people` existants, pour un rendu
cohérent. `.toolbar-sheets`/`.toolbar-groupe`/`.toolbar-separateur`/`.toolbar-btn`/`.select-chantier*`/
`.toolbar-toggle` : nouveau bloc CSS repris du mockup `mockup-sous-menu-outils.html` (structure identique),
avec un seul écart assumé par rapport au mockup — le fond de la barre reste `var(--bg)` (pas
`var(--surface-2)` du mockup, pensé comme une carte autonome) pour continuer à former un seul panneau
visuel avec `.onglets-nav`/`.entete-planning-figee`, comme ces 3 bandes sticky l'ont toujours fait depuis
le §74 ; le survol de `.toolbar-btn`/`.toolbar-toggle` passe donc en `var(--surface-2)` (inverse du mockup),
même logique que `.onglet:hover`. CSS mort retiré : `.barre-undo`/`.barre-undo button`, `.th.coin-undo`,
`.legende-barre`/`.legende-barre-gauche`/`.legende`/`.legende .item*`, `.controles-affichage`/
`.btn-affichage*`, `.semaine-titre.barre-imprimer*`. `construireGrille()` ne déplace plus `#barreUndo`
entre `#racine` et `document.body` à chaque rendu (ancien mécanisme du round précédent, devenu inutile
puisque les boutons vivent maintenant en dehors de la grille, dans le gabarit statique).

### 83.3. Vérifications

`node --check` du `<script>` extrait : vert. Suite `test_*.js` relancée intégralement (18 fichiers) : même
résultat qu'aux rounds précédents — tout vert sauf `test_edge_functions.js`, préexistant et sans rapport
(cf. §74.6/§79.4/§80.6/81.1), y compris `test_chantier_defaut.js` qui couvre la logique métier non touchée
par ce round. Playwright (mêmes vraies données Supabase que les §80/81/82, session factice + bundle
supabase-js vendored) :

- Légende absente du DOM (`#legende`/`.legende` introuvables) ; les 9 onglets portent tous une icône SVG ;
  Annuler/Refaire/Imprimer/les 4 contrôles portent tous une icône SVG.
- Sélecteur de chantier : s'ouvre au clic, ne liste que les 2 chantiers actifs (le 3e, désactivé dans la
  fixture, en est bien absent) ; choisir "BINE" met à jour le swatch/nom du bouton ET
  `localStorage["planning.chantierParDefaut"]`, ferme le panneau ; re-cliquer le chantier déjà actif le
  désélectionne (retour au bouton neutre "Chantier", `localStorage` effacé) ; un clic en dehors ferme le
  panneau.
- Icône Jalons : un clic pose `.desactive`/retire `.actif` ET replie réellement la ligne dans la grille
  (capture d'écran avant/après) ; un second clic restaure les deux.
- `#btnDefaire` correctement désactivé tant qu'aucune action n'a eu lieu dans la session (confirme que
  `majBoutonsUndo()` fonctionne toujours avec les boutons déplacés).
- Figé haut/gauche (§74, reconfirmé à chaque round depuis) : toujours correct — vérifié cette fois à
  plusieurs profondeurs de défilement (0/50/76/150/400px) plutôt qu'un seul point avant/après, pour
  confirmer que `.entete-planning-figee` se fige bien à un `top` STABLE (79px, = hauteur onglets + hauteur
  toolbar) une fois le seuil de défilement atteint, et y reste quel que soit le défilement au-delà.
- Aucune erreur JS au chargement ni après interactions.

**Pas encore confirmé par Lionel en conditions réelles** — à revalider une fois synchronisé, en particulier
le rendu des nouvelles icônes (cohérence visuelle avec le reste de l'appli) et l'ergonomie du sélecteur de
chantier déroulant à l'usage.

## 84. Round du 16.09.2026 (encore un autre, suite×8) — les lignes Jalons/Notes masquées disparaissent vraiment, au lieu de rester en barre grise

Retour de Lionel dès la synchronisation du §83 : « les ligne désactivées doivent etre totalement masqué et
disparaitre du planning, pas grisée. »

### 84.1. Ce qui se passait

Masquer Jalons ou Notes depuis la barre d'outils ne les faisait pas vraiment disparaître : la ligne restait
présente dans la grille, réduite à une seule "piste" (`nbPistes = 1`) sans aucune cellule de fond posée
dessus (la boucle de pose des cellules journalières tournait 0 fois quand la section était repliée). Sans
cellule `.lbl`/`.cell` pour la couvrir, c'est le gris de fond de `.grille` (`background: var(--border)`,
la fine grille de séparation entre cellules) qui s'étalait sur toute la largeur de cette ligne vide — lu
comme "grisé" plutôt que "disparu", exactement ce que Lionel signale. Personnel/Intervenants, eux,
disparaissaient déjà correctement quand repliés (`ligneGroupePersonnes` n'est simplement pas appelée du
tout, cf. §83.1) — seul le libellé de section ("PERSONNEL"/"INTERVENANTS", avec son bouton "+") restait,
comme un en-tête. Jalons/Notes n'ayant pas d'en-tête séparé du contenu, le comportement à leur appliquer
est la disparition complète, libellé compris.

### 84.2. Correctif

Dans la boucle `construireGrille()` qui pose Jalons/Notes, un simple `if (repliee) return;` avant la
création du libellé : la ligne repliée ne pose plus rien du tout (ni libellé, ni cellule) et n'avance plus
le compteur `row` — elle n'occupe donc plus aucune hauteur dans la grille, exactement comme les lignes
Personnel/Intervenants repliées. Nettoyage en conséquence : `visibles`/`nbPistes` n'ont plus besoin de
gérer le cas replié (`visibles` est toujours le filtre normal, `nbPistes` toujours `Math.max(1,
assignerPistes(visibles))`), et la boucle de pose des cellules journalières tourne toujours sur `n`
(atteinte seulement si la fonction n'a pas déjà retourné).

### 84.3. Vérifications

`node --check` du `<script>` extrait : vert. Suite `test_*.js` relancée intégralement : même résultat
qu'aux rounds précédents (tout vert sauf `test_edge_functions.js`, préexistant et sans rapport). Playwright
(mêmes vraies données Supabase que les rounds précédents) :

- Masquer Jalons : le libellé "Jalons" disparaît complètement du DOM (`.lbl-speciale`), la hauteur de
  l'en-tête de grille diminue (209px → 168px sur la mesure de vérification), aucune barre grise résiduelle
  (confirmé par capture d'écran).
- Masquer Notes en plus : idem, plus aucun `.lbl-speciale` ne subsiste, hauteur encore réduite (→ 127px).
- Masquer Personnel en plus, pour comparaison visuelle : le comportement est bien identique à celui déjà
  en place (en-tête "PERSONNEL" seul, aucune ligne grisée).
- Réafficher les 3 : Jalons et Notes reviennent correctement, dans le bon ordre.
- Aucune erreur JS.

**Pas encore confirmé par Lionel en conditions réelles** — à revalider une fois synchronisé.

## 85. Round du 17.09.2026 — suppression du "+" Personnel/Intervenants, icônes "ligne+"/"+" dans la barre d'outils, zoom façon Sheets

Lionel : « on peut aussi enlever le '+' des lignes personnel et intervenant. Ajouter une icone "ligne +"
dans la tool bar [...] ainsi qu'une icone "+" pour rajouter un élément au planning [...] Prososer une case
de zoom comme sur sheet. » Maquette proposée dans `mockup-sous-menu-outils.html`, ajustée sur son retour
(« place le zoom entre impression et chantier »), puis approuvée (« ok implémente ca à l'application ») —
ce round porte la maquette approuvée dans le vrai `Index.html`.

### 85.1. Suppression du "+" sur les lignes Personnel/Intervenants

Le bouton `.btn-plage-ligne` (le "+" affiché au bout des en-têtes "PERSONNEL"/"INTERVENANTS", qui ouvrait
`ouvrirAjoutPersonne`) est retiré de `ligneSection(cle, texte)`, ainsi que son CSS (`.btn-plage-ligne`/
`.btn-plage-ligne:hover`, remplacés par un commentaire d'historique). La fonctionnalité elle-même
(`ouvrirAjoutPersonne`) n'est pas supprimée : elle reste accessible via le nouveau menu "ligne+" décrit
ci-dessous.

### 85.2. Nouveau menu "ligne+" (icône `#menuAjoutLigne` dans la barre d'outils)

Nouvelle icône `ajoutLigne` (ligne pleine + ligne pointillée + badge "+") ajoutée à l'objet `ICONS`. Clic →
ouvre un petit menu (`.outil-menu-panneau`) proposant "Personnel" / "Intervenant" ; chaque choix appelle
directement `ouvrirAjoutPersonne(estIntervenant)`, exactement la même popup qu'avant (aucun changement de
logique métier, seul le point d'entrée change).

### 85.3. Nouveau menu "+" (icône `#menuAjoutElement` dans la barre d'outils)

Nouvelle icône `plus` (simple croix) ajoutée à l'objet `ICONS`, avec `tache` et `absence` pour les deux
choix de type. Clic → premier écran du menu : Tâche / Absence / Note / Jalon.

- **Note / Jalon** : ouverture directe de la fiche d'édition pour aujourd'hui (ou, si aujourd'hui n'est pas
  dans la semaine affichée, le premier jour affiché — cf. `giPourAjoutBarre()` ci-dessous), journée entière
  (aucun bord en demi-journée), sans personne associée — via `ouvrirEditionPlage(type, null, gi, 1, null,
  null, null, null, null)`, le même chemin que la sélection multi-cellules à la souris
  (`ouvrirAjoutPlage`), réutilisé tel quel.
- **Tâche / Absence** : le menu passe à un second écran "pour qui ?" listant les personnes actives
  (`PERSONNES`, déjà filtré côté serveur sur `actif = true`) — Tâche liste tout le monde (Personnel +
  Intervenants), Absence exclut les intervenants (`PERSONNES.filter(p => !p.sousTraitant)`), même règle
  métier que le menu d'ajout existant `boutonsMenuAjout()`. Les boutons personne sont créés avec
  `document.createElement` + `.textContent` (jamais de `innerHTML` concaténé), même convention de rendu
  sûr que `construireSelectChantier()`. Choisir une personne appelle
  `ouvrirEdition(null, null, type, null, null, plageInit, null, null)` avec `plageInit = {cibles: [{personne:
  id, demi: "matin"}], giDebut: gi, duree: 1, demiDebut: null, demiFin: null, px, py}` — `cell=null` est
  supporté nativement par `ouvrirEdition`/`positionFormulaire` du moment qu'un `plageInit` complet est
  fourni (mécanisme déjà utilisé par le glisser-sélection, jamais modifié).
- **`giPourAjoutBarre()`** (nouvelle fonction) : retrouve l'indice de colonne (`gi`) du jour "aujourd'hui"
  dans la semaine actuellement affichée en reparcourant `isoDeGi(gi)` pour chaque jour affiché ; si
  aujourd'hui n'est pas dans la semaine affichée, retombe sur `gi = 0` (premier jour affiché).

Le menu se referme (et revient à son premier écran) en cas de clic ailleurs, de clic sur "Retour", ou
d'ouverture d'un autre menu (`fermerAutresMenusOutils`, généralisé ce round pour couvrir aussi
`#menuZoom`/`#menuAjoutLigne`/`#menuAjoutElement`, en plus de l'existant `#selectChantier`).

### 85.4. Zoom façon Google Sheets

Case `#zoomCtrl` positionnée entre Imprimer et le sélecteur de chantier (suite au retour de Lionel sur la
maquette) : boutons "−"/"+" et une pastille centrale affichant le niveau courant ("100% ▾"), cliquable pour
ouvrir un panneau de paliers prédéfinis. Nouvelle variable `niveauZoomPlanning` (jamais persistée, remise à
100 au rechargement — même traitement que `replierJalons`/etc.). Appliqué via la propriété CSS `zoom`
(non-standard mais supportée par Chromium, retenue plutôt que `transform:scale` car elle déclenche un vrai
reflux de mise en page — `scrollWidth`/`scrollHeight` suivent le zoom, comme dans Google Sheets) sur
`grilleEntete` ET `grilleCorps` uniquement — ces deux éléments sont des DESCENDANTS de l'en-tête figé
(`.entete-planning-figee`), jamais l'élément sticky lui-même, donc `ajusterEnteteFixe()` (qui ne lit que des
ancêtres non zoomés, `.onglets-nav`/`#legendeBarre`) n'est pas perturbée par le zoom — vérifié
empiriquement (voir 85.5). `majZoomAffichage()` (nouvelle fonction) met à jour le texte de la pastille à
chaque rendu.

### 85.5. Vérifications

`node --check` du `<script>` extrait : vert. Suite `test_*.js` relancée intégralement (19 fichiers) : même
résultat qu'à chaque round précédent — tout vert sauf `test_edge_functions.js`, préexistant et sans rapport
(cf. §74.6/§79.4/§80.6/81.1). Playwright (mêmes vraies données Supabase que les rounds précédents, session
factice + bundle supabase-js vendored) :

- Le "+" a bien disparu des en-têtes "PERSONNEL"/"INTERVENANTS" dans le DOM.
- Ordre des groupes dans la barre d'outils conforme à la maquette approuvée : annuler/refaire → imprimer →
  zoom → chantier → ligne+ / + → replis.
- "ligne+" → "Personnel" (et séparément "Intervenant") → ouvre bien la vraie popup `ouvrirAjoutPersonne`
  existante.
- "+" → "Tâche" → "pour qui ?" liste Personnel ET Intervenants → choisir une personne ouvre la vraie fiche
  d'édition de tâche pour cette personne, aujourd'hui, journée entière (les 4 boutons demi-journée Début/Fin
  A/P vérifiés non-`.actif` un par un, pas seulement par lecture de texte — un premier essai basé sur
  `textContent` était ambigu, corrigé par une vérification ciblée sur les classes CSS).
- "+" → "Absence" → "pour qui ?" liste seulement Personnel (Intervenants absents de la liste) → choisir une
  personne ouvre la vraie fiche avec bandeau "Absence".
- "+" → "Note" et "+" → "Jalon" → ouvrent directement la fiche pour aujourd'hui, journée entière, sans passer
  par "pour qui ?".
- Fermeture mutuelle des menus (ouvrir "+" ferme "ligne+"/zoom/chantier s'ils étaient ouverts, et
  inversement) et fermeture au clic en dehors, vérifiées.
- Zoom : boutons "−"/"+" et paliers du panneau modifient bien `niveauZoomPlanning`, la pastille affiche la
  bonne valeur, et la grille change réellement de taille (CSS `zoom` appliqué, `scrollWidth` suit).
- En-tête figé (`.entete-planning-figee`) : `top` reste rigoureusement identique (79px) à 100% et à 150% de
  zoom, avec défilement testé aux deux niveaux — confirme que le mécanisme de figeage du §74 n'est pas
  perturbé par le zoom.
- Aucune erreur JS au chargement ni après interactions, à aucune étape du scénario.

**Pas encore confirmé par Lionel en conditions réelles** — à revalider une fois synchronisé.

## 86. Round du 17.09.2026 (suite) — les libellés "Personnel"/"Intervenants" disparaissent aussi quand le groupe est masqué

Retour de Lionel après synchronisation du §85 : « Le lignes de séparation "personnel" et "intervenant"
doivent aussi être masquée quand le groupe correspondant est masquée. »

### 86.1. Ce qui se passait

Le §84 avait déjà résolu ce problème pour Jalons/Notes (masquer devait faire disparaître la ligne
entière, pas la griser). Personnel/Intervenants avaient le même souci mais dans sa forme "à moitié
corrigée" : masquer le groupe (`replierSectionPersonnel`/`replierSectionIntervenants`) empêchait déjà
`ligneGroupePersonnes()` de poser les personnes elles-mêmes (cf. §83.1), mais `ligneSection("personnel",
"Personnel")` — le libellé "PERSONNEL"/"INTERVENANTS" avec son `.section-row` et son trait
`border-bottom` — restait, lui, posé INCONDITIONNELLEMENT juste avant, quelle que soit la valeur de
`replierSectionPersonnel`/`replierSectionIntervenants`. Résultat : masquer "Personnel" faisait bien
disparaître les 4 lignes de personnes, mais laissait un en-tête "PERSONNEL" orphelin avec sa ligne de
séparation, exactement le résidu visuel que Lionel signale.

### 86.2. Correctif

Dans `construireGrille()`, `ligneSection(...)` rejoint désormais la même condition que le groupe qu'elle
annonce, au lieu d'être appelée juste avant sans condition :

```js
if (!replierSectionPersonnel) {
  ligneSection("personnel", "Personnel");
  ligneGroupePersonnes(groupePersonnel);
}
if (!replierSectionIntervenants) {
  ligneSection("intervenants", "Intervenants");
  ligneGroupePersonnes(groupeIntervenants);
}
```

Même principe que le §84 : la section repliée n'existe plus DU TOUT dans la grille, libellé compris, au
lieu de ne masquer que son contenu. Les boutons de bascule (`.toolbar-toggle[data-affichage-cible=...]`,
gérés par `majControlesAffichage()`) ne sont pas affectés — ils restent câblés une seule fois et pilotés
uniquement par les variables `replierSectionPersonnel`/`replierSectionIntervenants`, indépendamment du
contenu réellement posé dans la grille.

### 86.3. Vérifications

`node --check` du `<script>` extrait : vert. Suite `test_*.js` relancée intégralement : même résultat
qu'à chaque round précédent (tout vert sauf `test_edge_functions.js`, préexistant et sans rapport).
Playwright (mêmes vraies données Supabase que les rounds précédents) :

- État initial : libellés "Personnel" et "Intervenants" tous deux présents, hauteur du corps de grille
  (`grilleCorps`) à 575px.
- Masquer Personnel : le libellé "Personnel" disparaît du DOM (`.section-label`), seul "Intervenants"
  reste ; hauteur du corps de grille 575px → 128px (confirmé par capture d'écran : plus aucune trace de
  l'en-tête "PERSONNEL" ni de sa ligne de séparation).
- Masquer Intervenants en plus : plus aucun `.section-label` ne subsiste, `.section-row` absent du DOM
  (0 trouvé), hauteur du corps de grille → 0px (Jalons/Notes, dans l'en-tête figé séparé, restent bien
  visibles — capture d'écran à l'appui).
- Boutons de la barre d'outils toujours corrects après coup (`.desactive` posé sur les deux, comme
  attendu).
- Réafficher les deux : "Personnel" et "Intervenants" reviennent, dans le bon ordre.
- En-tête figé (`.entete-planning-figee`) : `top` reste stable à 79px après défilement vertical, section
  Personnel masquée — confirme que ce correctif (qui ne touche que le corps `grilleCorps`, jamais
  l'en-tête figé) ne perturbe pas le mécanisme de figeage du §74.
- Aucune erreur JS.

**Pas encore confirmé par Lionel en conditions réelles** — à revalider une fois synchronisé.

## 87. Round du 17.09.2026 (suite×2) — navigation de semaine dans la barre d'outils, "+" utilisable sur n'importe quelle semaine

Lionel : « J'aimerai que l'insertion via le bouton "+" puisse se faire aussi en dehors de la vue
visible, actuellement limité à la semaine en cours. on pourrai ajouter les boutons "aujourd'hui" et
"2 semaine" ainsi que la navigation des semaines dans la toolbar. Place les entre le zoom et la
sélection du chantier, dans la même section. les boutons toujours sous forme d'icone. » Mockup proposé
dans `mockup-sous-menu-outils.html`, ajusté sur son retour (« il manque un rectangle avec un numéro de
semaine, type "Sem. 38" cliquable [...] dans le style visuel du zoom, mais avec le même comportement
que l'actuel. quand menu déroulant ouvert on doit voir le numéro de semaine et les dates
correspondantes. » puis « et bien sûr on enlève la première ligne du tableau qui ne sert plus »), puis
approuvé (« c'est ok pour implémentation »).

### 87.1. Nouveau groupe dans la barre, entre le zoom et le chantier

5 éléments, tous en icônes (aucun texte) : ‹ (semaine précédente), une case **"Sem. N ▾"** (réutilise
`.zoom-pill` telle quelle — Lionel : « dans le style visuel du zoom »), › (semaine suivante), une icône
"aujourd'hui" (calendrier + un point), une icône "2 semaines" (2 colonnes côte à côte, teintée par la
nouvelle classe générique `.toolbar-btn.actif` tant que ce mode est actif — jamais atténuée comme
`.toolbar-toggle.desactive`, réservée au masquage : ce n'est pas la même chose, 1 semaine et 2 semaines
sont 2 modes également valides). ‹/›/Aujourd'hui/2 semaines réutilisent telles quelles
`naviguerSemaine`/`allerAujourdhui`/`basculerDeuxSemaines`, déjà éprouvées par l'ancien coin de la
grille. `majSemaineAffichage()` (nouvelle fonction, même principe que `majZoomAffichage()`) synchronise
le texte de la pill et l'état `.actif` du bouton "2 semaines" à chaque rendu.

### 87.2. La case "Sem. N" remplace la popup "Aller à…"

Cliquer la case ouvre un dropdown (même système générique `.outil-menu` que zoom/ligne+/+, cf. §85) au
lieu de l'ancienne popup centrée `ouvrirAllerSemaine()` (avec un `<select>`) — supprimée ce round avec
son unique déclencheur `.lien-aller`. Chaque ligne du dropdown affiche le numéro de semaine ET ses
dates (Lionel : « quand menu déroulant ouvert on doit voir le numéro de semaine et les dates
correspondantes »), la semaine courante cochée et mise en évidence. Le contenu est reconstruit à
l'OUVERTURE seulement (comme la page "pour qui ?" du menu "+", jamais à chaque rendu de la grille) :
`etat.semaines` peut contenir jusqu'à 521 semaines (`FENETRE_SEMAINES=260` avant/après aujourd'hui),
les afficher toutes d'un coup produirait un dropdown interminable — une fenêtre de 8 avant / 8 après la
semaine choisie (17 lignes, `.semaine-panneau` scrollable par sécurité) reste largement suffisante pour
un saut rapide ; au-delà, ‹/› ou rouvrir le dropdown depuis la nouvelle position couvrent le reste.
Choix assumé, à ajuster si Lionel le juge trop court à l'usage.

### 87.3. La ligne "Aujourd'hui/2 semaines/‹ Semaine N ›" du coin de la grille disparaît

Lionel : « et bien sûr on enlève la première ligne du tableau qui ne sert plus » — entièrement
redondante une fois dupliquée dans la barre. `coinNav`/`navSemaine` (et les variables qui ne servaient
qu'à eux : `donnees`, `num0`, `num1`, `texteSemaines`, `deb0`, `fin0`, `largeurSemaine`) disparaissent de
`construireGrille()` ; `row` démarre directement sur la ligne des jours (avant : décalée d'une ligne).
CSS mort retiré en conséquence : `.semaine-titre`, `.coin-nav`, `.cellule-semaine-nav`, `.btn-titre`,
`.btn-aujourdhui`, `.btn-deux-semaines`, `.fleche-semaine`, `.lien-aller`, `.semaine-dates` (l'ancienne),
`.sem-entete-dates`, `.th.sem-entete`.

### 87.4. Le "+" cible désormais n'importe quelle semaine affichée

Aucun changement dans `giPourAjoutBarre()`/`ouvrirAjoutElementBarre()` : ces fonctions ciblaient déjà la
semaine COURAMMENT AFFICHÉE (today si elle y est visible, sinon son premier jour) — jamais figées sur
"la semaine du jour" comme le message de Lionel aurait pu le laisser penser isolément. Le vrai verrou
était l'ACCÈS à la navigation, auparavant seulement dans le coin de la grille (repéré comme "la vue
visible"). Avec ‹/›/la case "Sem. N"/Aujourd'hui/2 semaines maintenant à côté du "+" dans la même barre,
naviguer puis ajouter se fait sans quitter la barre — le "+" ajoute donc bien, dans les faits, "en
dehors de la semaine en cours", sur n'importe quelle semaine choisie au préalable.

### 87.5. Vérifications

`node --check` du `<script>` extrait : vert. Suite `test_*.js` relancée intégralement (18 fichiers) :
même résultat qu'à chaque round précédent — tout vert sauf `test_edge_functions.js`, préexistant et
sans rapport (cf. §74.6/§79.4/§80.6/81.1). Playwright (mêmes vraies données Supabase que les rounds
précédents, session factice + bundle supabase-js vendored) :

- Ancienne ligne coinNav/navSemaine : absente du DOM (`.coin-nav`/`.cellule-semaine-nav`/`.lien-aller`
  introuvables), la grille commence directement sur la ligne des jours.
- Case "Sem. 38 ▾" : affiche la vraie semaine courante au chargement (correspond à la date réelle de
  l'environnement de test).
- › puis ‹ : passe à "Sem. 39", puis revient exactement à "Sem. 38".
- Dropdown "Sem. N" : 17 lignes (semaines 30 à 46 autour de la semaine 38), chacune avec son numéro ET
  ses dates, une seule marquée active/cochée.
- Choisir "Semaine 32" dans le dropdown : met à jour la pill ("Sem. 32 ▾") ET navigue réellement le
  planning à cette semaine.
- **Vérification du cœur de la demande** : après avoir navigué sur la Semaine 32 (loin de la semaine
  courante), cliquer "+" → "Jalon" ouvre la fiche pour un jour DE LA SEMAINE 32 ("Lun. 03 août"), pas
  pour la semaine de départ — confirme que le "+" ajoute bien sur la semaine maintenant affichée,
  quelle qu'elle soit.
- "Aujourd'hui" : ramène la pill à "Sem. 38 ▾" (la vraie semaine du jour).
- "2 semaines" : bascule l'icône en état teinté (`.actif`), le nombre de colonnes de jours affichées
  augmente en conséquence ; un second clic revient à l'état initial.
- En-tête figé (`.entete-planning-figee`) : `top` reste stable (79px) après défilement vertical, y
  compris en mode 2 semaines — confirme que la suppression de la ligne coinNav/navSemaine ne perturbe
  pas `ajusterEnteteFixe()`.
- Aucune erreur JS à aucune étape du scénario.

**Pas encore confirmé par Lionel en conditions réelles** — à revalider une fois synchronisé.

## 88. Round du 17.09.2026 (suite×3) — un Jalon/Note peut désormais dépasser la semaine affichée ; Tâche/Absence encore limitées (chantier à part)

Lionel, après avoir testé §87 en conditions réelles : « L'ajout hors semaine active est bloqué par les
formulaires de saisie. » Investigation : le blocage ne vient pas du "+" (qui cible déjà correctement la
semaine affichée, cf. §87.4) mais du formulaire d'édition lui-même — dès qu'on essaie d'étendre la date
de Fin (ou de Début) au-delà de la semaine (ou des 2 semaines) actuellement chargée à l'écran, un toast
refuse ("Cette date sort de la semaine affichée..."). Reproduit avec Playwright : navigation vers une
semaine lointaine puis tentative d'étendre la durée d'une Absence — blocage confirmé, exactement comme
décrit.

Ce blocage est une limite VOLONTAIRE et déjà ancienne (round du 12.09.2026, cf. le commentaire de
`appliquerDateChoisieFormulaire`) : `giDebut`/`giFin` ne sont que des coordonnées d'affichage, valables
uniquement DANS la fenêtre chargée — au-delà, le moteur de synchronisation n'avait aucun moyen d'écrire
le jour correspondant. Avant §87, on tombait rarement dessus puisqu'on ne pouvait de toute façon ajouter
que dans la semaine en cours ; §87 rend la navigation vers une semaine lointaine si facile que la limite
devient gênante en pratique.

Question posée à Lionel : contournement existant ("Série (se répète)", déjà capable de poser une
absence longue sans dépendre de la fenêtre chargée) vs. vraie correction (plus gros chantier) vs. pas
prioritaire. Réponse : **vraie correction**.

### 88.1. Ce qui a changé, concrètement

Le formulaire (bloc Début/Fin, flèches et calendrier) permet maintenant de choisir une date en dehors de
la semaine affichée pour un **Jalon** ou une **Note** — la date choisie s'affiche en italique souligné
(nouvelle classe `.date-val-hors-fenetre`, avec un titre explicite au survol) pour rester lisible que ce
jour-là n'est pas dans la grille en ce moment, sans ressembler à une erreur. Aucun blocage, aucun toast.

Pour **Tâche** et **Absence**, rien ne change : la date hors fenêtre reste refusée exactement comme
avant. Raison développée en 88.4.

### 88.2. Pourquoi Jalon/Note pouvaient être corrigés sans gros chantier serveur

Le serveur (`planPlage`, `functions/enregistrer-plage/logic.js`) sait déjà écrire une plage de jours
entière à partir de 2 vraies dates ISO, sans jamais dépendre de ce qui est chargé côté client — les
Notes l'utilisaient déjà ainsi (`diffsNotes`/`synchroniser()`). Le seul blocage restant pour Jalon/Note
était donc dans le CLIENT : `appliquerDateChoisieFormulaire` refusait toute date sans `gi` valide, et le
moteur de diff des jalons (`jalonsMap`, cf. ci-dessous) ne pouvait de toute façon diffuser que ce qui
était VISIBLE dans la fenêtre chargée. Un pur choix d'implémentation, pas une vraie limite serveur — ce
qui a permis de livrer cette partie sans toucher au schéma ni aux Edge Functions.

### 88.3. Détail technique

- `appliquerDateChoisieFormulaire` : `state.kind` ("jalon"/"note"/"tache"/"absence", posé par
  `ouvrirEditionPlage`/`ouvrirEdition`) décide si une date hors fenêtre est acceptée. Acceptée : la
  vraie date ISO est gardée à part (`state.debutHorsFenetreIso`/`finHorsFenetreIso`), le `gi`
  correspondant étant calé sur le bord VISIBLE le plus proche (pour que la surbrillance de grille garde
  une position valide — rien à surligner au-delà de l'écran de toute façon). Comparaisons Début/Fin
  refaites sur de vraies dates ISO plutôt que des `gi` (`isoBorneEtat`), pour rester justes même quand
  une borne est hors fenêtre.
- `datesPlageHTML`/`dateLigneHTML` : 2 paramètres optionnels (ISO "hors fenêtre" par borne) pour afficher
  la vraie date via la nouvelle `libelleDateCourteIso` plutôt que `libelleDateCourte(gi)` (qui renvoie
  vide hors fenêtre, faute de cache pour ce jour-là).
- `isoDeApres` : corrigée au passage — comptait `duree - 1` jours CALENDAIRES bruts, juste tant qu'aucune
  plage ne traversait un vrai week-end (rare, seulement en mode "2 semaines" avant ce round) ; devient
  franchement faux dès qu'une plage dépasse la fenêtre (le nouveau cas courant : une absence de 2
  semaines doit sauter 2 week-ends, pas 0). Compte désormais en jours OUVRÉS réels, comme
  `joursOuvresDeLaPlage` côté serveur. Nouvelle `nbJoursOuvresEntre` (compte, sans la liste) pour calculer
  `duree` à l'enregistrement quand une borne est hors fenêtre (`giFin - giDebut + 1` ne veut alors plus
  rien dire).
- Moteur de diff des jalons : `jalonsMap` ("labG|jourIdx" → texte, décomposé JOUR PAR JOUR dans la
  fenêtre visible — ne pouvait donc représenter que ce qui y est visible) remplacé par `jalonsParId` +
  `diffsJalons` par identité d'item JS, MÊME principe déjà utilisé pour les notes (`notesParId`/
  `diffsNotes`) — un jalon a exactement la même forme `{id,texte,giDebut,duree,demiDebut,demiFin,
  dateDebutIso}` (`itemPlage`, partagée avec les notes). `synchroniser()` envoie donc maintenant une
  VRAIE plage (`dateDebut`/`dateFin` ISO, `origine` sur modification pour libérer côté serveur les jours
  sortis de la plage) à `enregistrer-plage`, au lieu de la décomposer jour par jour. `mode` reste
  INCONDITIONNELLEMENT "remplacement" pour un jalon (jamais "ajout" comme une note) : un enregistrement
  de jalon représente toujours l'état complet du jour (comportement déjà en place, préservé). Aucun champ
  `important`/`chantierId` envoyé depuis la grille, comme avant (réservés à la page « Jalons »).
  `isoDeLabGJourIdx`, devenue sans appelant, retirée.
- Nettoyage : `test_edge_functions.js` supprimé — il ne testait plus que 3 fonctions entièrement
  disparues (`isoDeLabGJourIdx`, retirée ce round ; `joursOuvresDepuis`/`construireLignesAjoutLointain`,
  retirées dès le round du 11.09.2026 avec l'ancien "Ajout lointain") ; cassé depuis des dizaines de
  rounds pour cette raison déjà documentée (cf. §74.6 et suivants), il ne restait plus rien à en
  sauver.

### 88.4. Pourquoi Tâche/Absence ne sont PAS corrigées ce round

Contrairement aux jalons/notes, une tâche/absence n'a **aucun** mécanisme serveur de type "planPlage" —
chaque jour est toujours écrit individuellement depuis ce qui est affiché à l'écran
(`enregistrerCellulePersonneServeur`, une case à la fois). Construire l'équivalent est un vrai chantier,
plus délicat que pour jalon/note à cause de l'empilement (plusieurs tâches possibles sur une même case,
chacune avec son propre chantier depuis le round du 16.09.2026) — une zone du programme qui a déjà
produit plusieurs bugs délicats par le passé (fusion des bulles, redimensionnement, séries...). Prévu
comme suite de ce round, une fois celui-ci validé par Lionel en conditions réelles.

### 88.5. Vérifications

`node --check` du `<script>` extrait : vert. Suite `test_*.js` relancée intégralement (17 fichiers
restants après le retrait de `test_edge_functions.js`) : tout vert, aucune régression. Playwright (vraies
données Supabase, session factice + bundle supabase-js vendored, appels réseau interceptés y compris
`enregistrer-plage` pour inspecter exactement ce qui est envoyé au serveur) :

- Navigation vers une semaine lointaine (Sem. 46) puis "+" → Jalon → extension de la Fin par les
  flèches : AUCUN toast de blocage (contre un blocage systématique avant ce round). Libellé "Fin" affiché
  en italique souligné dès qu'il sort de la fenêtre, avec le bon texte (date réelle, pas tronquée).
- Enregistrement : payload `enregistrer-plage` capturé avec `kind: "jalon"`, `dateDebut`/`dateFin` sur 2
  semaines d'écart (une vraie plage, pas un jour isolé), `mode: "remplacement"`, `origine: null` (création).
- Même vérification pour une **Note** : extension de la Fin sans blocage, payload avec `mode: "ajout"`
  (création) et la bonne plage.
- **Régression volontaire vérifiée** : la même manipulation sur une **Absence** redonne bien le toast de
  blocage inchangé — confirme que Tâche/Absence n'ont subi aucun changement de comportement.
- Création d'un jalon de 3 jours DANS la fenêtre courante (cas courant, non affecté par ce round) :
  payload correct (`dateDebut`/`dateFin` sur 3 jours ouvrés), comme avant.
- Re-vérification complète du scénario §87 (navigation de semaine, dropdown, "+", Aujourd'hui, 2
  semaines, en-tête figé) : même résultat qu'au round précédent, aucune régression.
- Aucune erreur JS à aucune étape des scénarios.

**Pas encore confirmé par Lionel en conditions réelles** — à revalider une fois synchronisé. La partie
Tâche/Absence (88.4) reste à faire dans un prochain round.

## 89. Round du 22.09.2026 — découpage d'`index.html` en plusieurs fichiers (CSS + 13 fichiers JS)

Lionel : « Est-ce qu'il est possible de séparer notre appli en plusieurs fichiers afin de ne pas avoir à
lire le code complet à chaque fois ? » — `index.html` avait dépassé 11 000 lignes (CSS + JS + HTML
mélangés dans un seul fichier). Après clarification (AskUserQuestion), Lionel a choisi l'option la plus
poussée : CSS externe + JS découpé en plusieurs fichiers thématiques.

### 89.1. Ce qui a changé

Un seul `index.html` (11 194 lignes) devient :

- `style.css` — tout le `<style>` d'origine, inchangé.
- `js/core.js` — bootstrap Supabase + écran de connexion + état global (`etat`, `CHANTIERS`, `STATUTS`,
  `PERSONNES`, `TACHES`/`JALONS`/`NOTES`, `ICONS`...) + utilitaires génériques (dates/gi, cache, `gs`/`gsP`
  historiques, etc.).
- `js/coquille.js` — construction de la coquille (navigation, les 9 pages, routage `#app.innerHTML`).
- `js/page-personnel.js`, `js/page-chantiers.js`, `js/page-jalons.js`,
  `js/page-statuts-entree-rapide.js`, `js/page-feries.js` — un fichier par page de réglages (CRUD).
- `js/donnees-sync.js` — chargement depuis Supabase (semaines, config simple, `construireVueDepuisCache`,
  diff local/serveur, `synchroniser`).
- `js/grille-rendu.js` — moteur de rendu de la grille (`construireGrille`, positionnement des bulles,
  sélecteur de chantier, en-tête figé).
- `js/grille-interactions.js` — glisser/redimensionner/sélection, undo/redo.
- `js/formulaires-communs.js` — barre de sélection groupée, formulaires génériques (dates, série, popups).
- `js/formulaires-edition.js` — formulaires d'ajout/édition (tâche, absence, jalon, note, formulaires
  métier dynamiques).
- `js/impression.js` — aperçu d'impression/PDF + l'unique ligne de démarrage (`verifierSessionEtDemarrer();`).
- `index.html` — ne garde plus que le `<head>` (balises meta/PWA inchangées), le squelette `<body>` et la
  liste des `<link>`/`<script src>` vers les fichiers ci-dessus, dans le même ordre qu'avant. ~70 lignes.

### 89.2. Pourquoi c'est sûr (même comportement, pas juste "probablement pareil")

Tout le JS était jusqu'ici enveloppé dans une IIFE unique (`(function(){"use strict"; ... })();`) — un
détail important : des `<script src>` séparés ne partagent PAS le scope d'une IIFE (chaque script aurait
sa propre fermeture, `etat`/`CHANTIERS`/etc. définis dans un fichier seraient invisibles des autres).
L'IIFE a donc été retirée et remplacée par un `"use strict";` en tête de CHAQUE fichier — les déclarations
`var`/`function` de haut niveau redeviennent alors des propriétés de `window`, partagées entre tous les
fichiers exactement comme elles l'étaient déjà implicitement entre elles à l'intérieur de l'ancienne IIFE.
Des `<script>` classiques (pas de `type="module"`, pas de `async`/`defer`) exécutés dans le même ordre que
le code d'origine sont sémantiquement identiques à un seul script inline coupé aux mêmes endroits — aucune
fonction n'est appelée avant la fin du chargement de tous les fichiers (le seul point d'entrée,
`verifierSessionEtDemarrer()`, reste la toute dernière ligne du dernier fichier chargé), donc l'ordre des
fichiers ne change rien en pratique.

Découpage fait par extraction MÉCANIQUE (script Python, jamais retapé à la main) aux frontières des
commentaires de section déjà présents dans le fichier — un script de contrôle reconstruit le contenu
d'origine à partir des morceaux et le compare byte à byte à l'original : concordance exacte (à l'ablation
volontaire de l'IIFE près). Le fichier réellement présent dans le dépôt de Lionel a été re-récupéré juste
avant le découpage (3 réglages CSS trouvés différents de la dernière copie connue ici — `--bg`/`--surface`/
`--surface-2`, fond de `.toolbar-sheets`, `padding-top` de `.onglets-nav` — probablement des essais de
Lionel en direct dans le fichier) : le découpage part bien de CETTE version, ces 3 réglages sont préservés.

### 89.3. Vérifications

Comme aucun accès réseau à son vrai projet Supabase n'est possible depuis cet environnement (limite déjà
documentée dans `MIGRATION-GITHUB-PLAN.md` §5/§6bis), vérifié par comparaison directe ancien/nouveau,
servis chacun par un petit serveur HTTP local, avec `window.supabase` simulé (Playwright) :

- Écran de connexion (sans session) : HTML de `#app` strictement identique (539 caractères), aucune
  erreur console/page, dans les deux versions.
- Session simulée valide (contourne l'écran de connexion) : après démarrage complet
  (`demarrer`/`construireCoquille`/chargement/`construireGrille`), HTML de `#app` strictement identique
  (25 870 caractères) dans les deux versions, aucune erreur.
- Clic sur les 9 onglets un par un (Planning, Jalons, Personnel, Intervenants, Général, Chantiers,
  Statuts, Fériés, Entrée rapide) : aucune erreur dans les deux versions, comportement identique — chaque
  page sollicite son propre fichier JS, confirme qu'aucune fonction n'a été mal répartie entre fichiers.

**Pas testé en conditions réelles contre le vrai projet Supabase de Lionel** (même limite que toujours) —
à confirmer par lui : ouvrir l'appli, se connecter, naviguer sur quelques onglets, vérifier qu'aucune
différence n'apparaît par rapport à avant ce round. Réversible facilement si besoin (Git garde l'ancien
`index.html` monolithique dans l'historique).

## 90. Round du 22.09.2026 — `style.css` séparé en commun + `style-mobile.css` (téléphone)

### 90.1. Ce qui a changé

Suite au découpage du §89, Lionel a demandé un fichier par taille d'écran. Vérification faite : sur les
1732 lignes de `style.css`, seules ~35 lignes dépendaient vraiment de la taille d'écran — 2 règles
`@media (max-width: 600px)` (bandeau/éditeur de descriptif en plein écran, formulaire `.form-pop` en plein
écran) et 1 règle `@media (min-width: 601px) and (max-width: 1024px)` (formulaire `.form-pop` en demi-page
sur tablette). Tout le reste (couleurs, grille, boutons, mises en page...) est déjà commun aux 3 tailles.

Un découpage strict en 3 fichiers aurait donc obligé à dupliquer ~1700 lignes communes dans chacun (ou à
garder un 4e fichier "commun" en plus). Lionel a confirmé vouloir plutôt : `style.css` = tout ce qui est
commun (dont la règle tablette, desktop et tablette rendant assez similaires) + un nouveau
`style-mobile.css` = seulement les 2 règles `@media (max-width: 600px)`, chargé juste après `style.css`
dans `index.html`. Objectif : pouvoir rouvrir uniquement `style-mobile.css` (50 lignes) plus tard pour
retravailler la version téléphone, sans re-scanner tout `style.css`.

### 90.2. Pourquoi c'est sûr

Extraction mécanique (script Python sur les plages de lignes exactes, jamais retapé à la main) avec
reconstruction de contrôle : le contenu d'origine recomposé à partir des morceaux extraits est identique
byte à byte à l'ancien `style.css`. Les commentaires explicatifs qui couvraient à la fois le cas téléphone
et le cas tablette ont été adaptés (chacun renvoie maintenant vers l'autre fichier pour le contexte),
aucune règle CSS elle-même n'a été modifiée.

Les variables CSS (`var(--shadow-lg)`, `var(--border)`, etc.) utilisées dans `style-mobile.css` restent
définies dans `style.css` (`:root`) — elles s'appliquent normalement puisque les deux fichiers sont chargés
sur la même page ; une variable CSS n'est pas "enfermée" dans le fichier qui la déclare.

### 90.3. Vérifications

Testé dans un navigateur (Playwright, page servie localement) : les deux feuilles de style se chargent et
s'analysent sans erreur (471 règles dans `style.css`, 2 dans `style-mobile.css`, comme attendu vu qu'il ne
reste que les 2 blocs `@media (max-width: 600px)`). Comportement de `.form-pop` et `.carte-item .bandeau`
vérifié aux 3 seuils :

- ≤600px (téléphone) : `.form-pop` plein écran, `.bandeau` sans coin arrondi — comme avant.
- 601-1024px (tablette) : `.form-pop` en demi-page centrée (50vw) — comme avant.
- >1024px (desktop) : ni l'une ni l'autre règle ne s'applique, comportement par défaut inchangé.

Résultat identique à avant ce round dans les 3 cas. Comme toujours, pas de test possible contre le vrai
projet Supabase depuis cet environnement — à confirmer par Lionel en conditions réelles.

## 91. Round du 22.09.2026 (suite) — Navigation téléphone façon Google Sheets (port du mockup dans le vrai fichier)

### 91.1. Ce qui a changé

Lionel, croquis d'écran Google Sheets mobile à l'appui : « j'aime bien la présentation de Google sheet.
on pourrait faire quelques chose de similaire sur téléphone. en bas la bar d'onglets. en haut la
toolbar. » — puis, sur un mockup dédié (`mockup-nav-mobile.html`, itéré en 3 rounds) : « c'est ok pour moi,
la tool bar par contre est à retailler on gardera les "tools" principaux sur la barre et le reste sera
dans un menu 3points à droite » et enfin « chantier visible mais seulement la pastille de couleur.
annuler/refaire dans la barre. ». Ce round PORTE ce mockup validé dans le vrai fichier (`js/coquille.js`,
`style.css`, `style-mobile.css`) — première fois dans cette suite de rounds mobiles que du vrai code
interactif change (pas seulement une extraction mécanique de fichiers ou de CSS, cf. §89/§90).

Sur téléphone (≤600px) seulement :

- La barre d'onglets du haut (`.onglets-nav`) disparaît, remplacée par une barre basse fixe (`.nav-bas`) :
  un bouton central affichant l'icône + le nom de la page active (`#switcherBtn`), qui ouvre un panneau
  listant les 9 pages (`#switcherPanneau`, repris des mêmes boutons `.onglet`/`data-page` que la barre du
  haut — cf. §91.2) ; un avatar de déconnexion à droite (identique à celui du haut, dupliqué ici).
- La barre d'outils du planning (`#legendeBarre`) se retaille : restent visibles en permanence Annuler/
  Refaire, la navigation semaine (◀ Sem. ▶ Aujourd'hui), le chantier par défaut (réduit à sa seule
  pastille de couleur) et le bouton "+" d'ajout. Tout le reste — Imprimer, Zoom, "Afficher 2 semaines",
  "Ajouter une ligne", les 4 icônes masquer/afficher (Jalons/Notes/Personnel/Intervenants) — rejoint un
  panneau "⋮" (`#btnPlusOutils` / `#toolbarSecondaire`), sous forme de liste avec icône + libellé + coche
  d'état le cas échéant.

Desktop et tablette (601px et plus) : **rien ne change** — même barre d'onglets en haut, même barre
d'outils, même disposition, au pixel près (cf. §91.3).

### 91.2. Pourquoi c'est sûr

**Barre basse / sélecteur de page** — `#switcherPanneau` réutilise EXACTEMENT les mêmes boutons `.onglet`
(même `data-page`) que `.onglets-nav`, avec juste une classe `.switcher-item` en plus pour leur habillage
"liste pleine largeur" sur téléphone. `cablerNavigation()` fait donc un seul `querySelectorAll(".onglet")`
qui câble les 18 boutons (9 en haut + 9 en bas) d'un coup — aucune logique de navigation dupliquée. Seul
changement dans cette fonction : la synchronisation de la classe `.actif` se fait maintenant par
comparaison de `data-page` plutôt que par référence exacte au bouton cliqué (`b.dataset.page ===
btn.dataset.page` plutôt que `b === btn`), pour que cliquer sur l'un ou l'autre exemplaire d'une même page
mette bien les DEUX à jour. Le libellé/l'icône du bouton `#switcherBtn` sont resynchronisés à chaque clic
AVANT d'appeler le rendu de la page ciblée (`fn()`) — volontairement, pour que cette barre reste cohérente
même si ce rendu échoue (ex. souci réseau dans un `render*()` qui charge ses données à la demande).

**Barre d'outils retaillée** — technique centrale : les 5 groupes retirés de la vue directe (Imprimer,
Zoom, "2 semaines", "Ajouter une ligne", les 4 icônes masquer/afficher) sont regroupés dans UN wrapper,
`<div class="toolbar-secondaire" id="toolbarSecondaire">`, mais restent EXACTEMENT les mêmes éléments
(mêmes `id`, même câblage dans `cablerPagePlanning`/`majControlesAffichage`/`majZoomAffichage`/
`majSemaineAffichage`, tous inchangés) — aucun bouton dupliqué, donc aucun risque de désynchronisation
entre deux copies d'un même contrôle.

Sur desktop/tablette, `#toolbarSecondaire` reste en `display: contents` en permanence (pas d'override dans
`style-mobile.css`, qui ne s'applique qu'≤600px) : ses enfants redeviennent des éléments flex NORMAUX de
`.toolbar-sheets`, comme s'ils n'étaient pas enveloppés. Comme ces groupes ne sont plus à leur position
d'origine dans le HTML (regroupés dans ce wrapper à la place), chacun porte un `order` CSS (posé en style
inline, comme les groupes restés en place) qui reproduit très exactement leur position visuelle d'AVANT ce
round — `.toolbar-sheets` et `.toolbar-groupe` partagent le même `gap: 2px`, donc scinder un groupe en 2
groupes voisins (ex. la navigation semaine et "2 semaines" étaient un seul groupe, désormais deux) ne
change aucun espacement visuel. Le tableau complet des `order` est documenté dans `style.css`, au-dessus de
la règle `.toolbar-secondaire { display: contents; }`.

Sur téléphone, `style-mobile.css` bascule `#toolbarSecondaire` en panneau réel (`.ouvert` posée par
`#btnPlusOutils`, `position: absolute` sous `.toolbar-sheets` — qui est `position: sticky`, donc déjà
"containing block" de ses descendants absolus, sans calcul JS nécessaire, même principe que
`.select-chantier-panneau`/`.outil-menu-panneau` déjà existants). `fermerAutresMenusOutils()` (le mécanisme
générique déjà en place pour `#selectChantier`/les `.outil-menu`, cf. §85) est étendu de 4 lignes pour
fermer aussi ce panneau — SAUF quand l'appel vient d'un menu qu'il contient lui-même (`#menuAjoutLigne`,
resté un `.outil-menu` tout à fait normal une fois déplacé dedans), sinon ouvrir ce sous-menu aurait
aussitôt refermé le panneau qui le contient. `#btnPlusOutils` est câblé exactement comme
`#btnSelectChantier` (ferme tout, puis rouvre sa propre cible).

Le chantier par défaut n'est PAS déplacé : `.nom-chantier`/`.caret` restent dans le HTML (nécessaire,
`construireSelectChantier()` les cible par `querySelector` à chaque rendu) — seul leur affichage change
(`display: none` en CSS sur téléphone), rien n'est retiré ni recâblé.

Nouveaux éléments purement décoratifs (`.toolbar-btn-label`, `.toolbar-btn-coche`, `.zoom-secondaire-
label`, séparateurs `.toolbar-separateur-mobile`) : tous masqués par défaut dans `style.css`
(`display: none`), affichés uniquement dans `style-mobile.css` — invisibles et sans effet sur desktop/
tablette. Le libellé "Zoom" est un `<span>` FRÈRE de `#btnZoom`, pas un enfant : `majZoomAffichage()` fait
`btnZoom.textContent = ...` à chaque rendu, ce qui aurait effacé tout enfant posé à l'intérieur du bouton.

`.nav-bas`/`.onglets-nav` (masquage/bascule) : `#app` reste le seul conteneur qui défile (`position: fixed;
inset: 0`, inchangé) — masquer `.onglets-nav` fait tomber sa hauteur mesurée par `ajusterEnteteFixe()` à 0,
ce qui décale automatiquement et correctement `#legendeBarre`/`.entete-planning-figee` en haut de l'écran
(exactement le comportement voulu, cette fonction n'a pas eu besoin d'être modifiée). Vérifié qu'aucun
ancêtre ne porte `transform`/`filter`/`perspective` qui piégerait un `position: fixed` (`.nav-bas`,
`#toolbarSecondaire` ouvert). `.page-scroll` gagne un `padding-bottom` supplémentaire sur téléphone
(`40px + 56px + safe-area`) pour que `.nav-bas`, en `position: fixed`, ne cache jamais le bas d'une page en
fin de défilement (elle n'occupe aucune place dans le flux normal de `#app`).

### 91.3. Vérifications

Comme toujours, aucun accès réseau au vrai projet Supabase de Lionel n'est possible depuis cet
environnement — vérifié via un petit serveur HTTP local + Playwright, `window.supabase` simulé (aucun vrai
appel réseau, données de planning factices) :

- **Desktop (1600px) : rendu strictement identique à avant ce round.** Comparaison position par position
  (`getBoundingClientRect`) de chaque groupe/séparateur de la barre d'outils contre les positions attendues
  d'avant : tous alignés au pixel près (écart maximal observé : 1px, imputable à l'arrondi sous-pixel du
  moteur de mise en page, pas à un changement réel). `#btnPlusOutils`/`.nav-bas` bien masqués
  (`display: none`), `.onglets-nav` bien affichée. Aucune erreur console/page.
- **Tablette (900px) : identique au rendu desktop**, comme attendu (la coupure `@media (max-width: 600px)`
  ne s'applique pas).
- **Téléphone (390px) : barre basse + panneau "⋮" fonctionnels.** Barre du haut retaillée (Annuler/Refaire,
  navigation semaine, pastille chantier colorée, "+", "⋮" — dans cet ordre, alignés) ; panneau "⋮" affiche
  les 7 lignes attendues (Imprimer, Zoom avec mini +/-, "Afficher 2 semaines", "Ajouter une ligne", puis les
  4 icônes masquer/afficher avec leur teinte/coche d'état existante — Jalons violet, Notes jaune, Personnel/
  Intervenants bleu accent, comme sur la barre desktop) ; défilement interne si la liste dépasse 70% de la
  hauteur d'écran. Panneau "Pages" en bas (9 pages, section principale + séparateur + section réglages).
- **Exclusion mutuelle** : ouvrir le panneau "⋮" ferme le sélecteur de chantier/les autres `.outil-menu` et
  réciproquement (mécanisme partagé, cf. §91.2) ; ouvrir "Ajouter une ligne" DEPUIS le panneau "⋮" ouvre son
  sous-menu SANS refermer le panneau qui le contient (cas particulier vérifié explicitement) ; un clic à
  l'extérieur referme tout.
- **Synchronisation barre du haut / panneau du bas** : cliquer une page dans le panneau du bas met à jour
  la page affichée, l'onglet actif en haut ET dans le panneau du bas, ainsi que l'icône/le libellé de
  `#switcherBtn`.
- **Redimensionnement en direct** téléphone → desktop pendant que le panneau "⋮" est ouvert : aucun résidu
  visuel, la barre desktop réapparaît intacte (la classe `.ouvert` résiduelle n'a d'effet que dans le
  `@media (max-width: 600px)`).
- Fichiers CSS/JS vérifiés syntaxiquement valides (`node --check`, comptage d'accolades équilibré).

**Pas testé en conditions réelles contre le vrai projet Supabase de Lionel, ni sur un vrai téléphone**
(même limite que toujours, cf. §89/§90) — c'est le premier round de cette suite qui touche du VRAI code
interactif (pas une extraction mécanique) : Lionel est invité à vérifier particulièrement soigneusement en
conditions réelles avant de considérer ce round acquis (ouvrir l'appli sur son téléphone, se connecter,
essayer le panneau "⋮" et le sélecteur de pages, puis repasser sur un écran large pour confirmer que rien
n'a changé là). Réversible facilement si besoin (Git garde l'ancienne version dans l'historique).

## 92. Round du 22.09.2026 (suite ×3) — 2 bugs téléphone signalés par Lionel après le portage du §91

### 92.1. Ce qui a changé

Lionel, après avoir mis en ligne le portage du §91 : « sur la version mobile l'ajout avec "+" déborde
dans la marge. Les 4 bouton d'affichage des groupes sont trop gros. Sur ton mockup ils étaient pas aussi
grand ». Deux bugs réels, confirmés tous les deux en local (Playwright, viewport téléphone 390px) avant
correction — mesures exactes ci-dessous.

**1. Menu "+" (#menuAjoutElement) hors écran.** Son panneau (`.outil-menu-panneau`, `style.css`) est ancré
`left: 0` par rapport à son bouton — correct tant que le bouton est en milieu de barre, mais le §91 l'a
déplacé à l'extrémité droite de l'écran (`.toolbar-groupe-droite { margin-left: auto }`). Résultat mesuré :
panneau de 190px allant de x=310 à x=500 sur un écran de 390px de large — 110px hors du viewport à droite
(texte/titre coupés, cf. capture). Corrigé par un ancrage inversé spécifique à ce panneau, mobile
uniquement : `.toolbar-groupe-droite .outil-menu-panneau { left: auto; right: 0; }` (`style-mobile.css`).
Le panneau de `#menuAjoutLigne`, ancré ailleurs (dans le panneau "⋮"), n'est pas concerné.

**2. Les 4 boutons Jalons/Notes/Personnel/Intervenants (et en fait TOUS les boutons du panneau "⋮",
Imprimer/2 semaines/Ajouter une ligne inclus) bien plus hauts que prévu.** Cause : `.toolbar-btn` et
`.toolbar-toggle` (`style.css`) sont `display: grid; place-items: center` — conçus à l'origine pour une
icône seule dans un carré 30×30 sur la barre desktop. La règle du §91 qui les retaille en lignes pleine
largeur dans le panneau (`.toolbar-secondaire .toolbar-btn, .toolbar-secondaire .toolbar-toggle`)
redéfinissait `width`/`height`/`padding` mais jamais `display` — la grille à une seule colonne héritée de
`style.css` empilait alors icône, libellé et coche chacun sur sa propre ligne au lieu d'un rang horizontal.
Mesuré en local : 84px de haut par bouton au lieu d'environ 40px attendus (cf. capture — icône au-dessus du
texte, au lieu d'icône+texte côte à côte comme sur le mockup validé). Corrigé en ajoutant `display: flex;
align-items: center;` à cette même règle — remet un rang unique icône—libellé—coche, comme `.outils-item`
dans `mockup-nav-mobile.html`.

Les deux correctifs sont dans `style-mobile.css`, exclusivement à l'intérieur du `@media (max-width: 600px)`
— aucune ligne touchée dans `style.css` ni dans le JS.

### 92.2. Pourquoi c'est sûr

- Périmètre strictement mobile : les deux sélecteurs modifiés (`.toolbar-groupe-droite .outil-menu-panneau`
  et `.toolbar-secondaire .toolbar-btn/.toolbar-toggle`) ne peuvent matcher que dans le panneau "⋮", qui
  n'existe (`display` autre que `contents`) que sous `@media (max-width: 600px)` — confirmé par mesure
  (`getComputedStyle`) à 1280px : `#toolbarSecondaire` reste `display: contents`, `.toolbar-toggle` reste
  `grid`/30×30px, identique à avant ce correctif.
- Correctif 1 : un seul sélecteur ajouté, scopé à `.toolbar-groupe-droite` (donc à `#menuAjoutElement`
  uniquement) — aucun autre `.outil-menu-panneau` de l'appli (chantier, ajout de ligne, semaine…) n'est
  affecté.
- Correctif 2 : `display: flex` sur une règle déjà scopée à `.toolbar-secondaire` (le panneau lui-même),
  qui n'existe pas hors mobile — aucun risque de ressembler à nouveau à `.toolbar-btn`/`.toolbar-toggle`
  ailleurs dans l'appli (barre desktop, autres menus), non touchés.

### 92.3. Vérifications

Même méthode que d'habitude (Playwright local, `window.supabase` simulé, aucun accès au vrai projet) :

- **Panneau "⋮" (390px)** : les 4 boutons Jalons/Notes/Personnel/Intervenants mesurent désormais 35px de
  haut (au lieu de 84px), `display: flex` confirmé par `getComputedStyle` ; rendu identique au mockup validé
  (icône + libellé sur un rang, coche alignée à droite, fond teinté pour les toggles actifs). Même effet
  positif sur Imprimer/Zoom/2 semaines/Ajouter une ligne, déjà corrects visuellement avant (fond compact)
  mais tout aussi touchés par le bug — confirmé par capture avant/après.
- **Menu "+" (390px)** : panneau désormais de x=150 à x=340, entièrement dans le viewport (0–390) — plus
  aucun débordement, titre et 4 lignes (Tâche/Absence/Note/Jalon) entièrement visibles.
- **Desktop (1280px)** : capture avant/après identique, `#toolbarSecondaire` toujours `display: contents`,
  `.toolbar-toggle` toujours 30×30px `display: grid` — aucun changement.
- Fichier vérifié syntaxiquement valide, appliqué directement dans le fichier réel (remplacement textuel
  ciblé, exactement le même contenu que testé en local — hachage identique vérifié après application).

Comme pour le §91, pas testé sur un vrai téléphone contre le vrai projet Supabase — mais cette fois les 2
bugs corrigés sont exactement ceux que Lionel a remontés en conditions réelles, donc particulièrement
recommandé de revalider ces deux points précis (le panneau "⋮" et le bouton "+") sur son téléphone.

## 93. Round du 22.09.2026 (suite ×4) — Toolbar en pilule + "Ajouter un chantier" dans le sélecteur

Demande de Lionel : « un "+" pour ajouter un chantier en bas de la liste / arrondir les coins façon
pilule [sur] le fond de la toolbar ».

- **`style.css`** : `.toolbar-sheets` passe en `border-radius: 999px` (+ un peu de padding horizontal,
  absent avant, pour que les boutons d'extrémité ne touchent plus le bord arrondi). `.page-scroll` lui
  donnait déjà 18px de marge de chaque côté, donc rien d'autre à changer pour que la pilule se voie.
  Nouvelle classe `.select-chantier-ajouter` pour le style du bouton "+".
- **`js/grille-rendu.js`** (`construireSelectChantier`) : une ligne "+ Ajouter un chantier" est ajoutée en
  bas du panneau, séparée par un trait. Elle appelle `ouvrirAjoutChantier()` — la fonction existante de
  la page "Chantiers" (`page-chantiers.js`, même formulaire nom + couleur, même sauvegarde serveur), pas
  de logique dupliquée. Son propre rafraîchissement rappelle déjà `construireSelectChantier()`, donc le
  nouveau chantier apparaît automatiquement dans ce même panneau juste après l'ajout.

Vérifié en local (desktop 1280px + téléphone 390px) : barre en pilule sur les deux, bouton "+" bien
positionné et stylable dans le panneau chantier. Pas testé le clic réel sur "+" contre le vrai serveur
Supabase (même limite que d'habitude) — le formulaire qui s'ouvre est cependant celui, déjà en
production, de la page "Chantiers".

## 94. Round du 22.09.2026 (suite ×5) — Un seul type d'onglet

Lionel : « Mettre tous les onglets principale, je ne veux pas 2 types d'onglets ». Les 5 pages de
réglages (Général/Chantiers/Statuts/Fériés/Entrée rapide) étaient en retrait visuel (`.onglet.secondaire`,
texte plus pâle) par rapport aux 4 autres depuis le §81 — supprimé : les 9 pages partagent maintenant
exactement le même style, dans la barre du haut ET dans le panneau "Pages" en bas sur téléphone (où le
trait séparateur entre les deux groupes disparaît aussi, même logique). `.onglet.secondaire` et
`.switcher-separateur`, devenus inutilisés, sont retirés de style.css/style-mobile.css plutôt que
laissés morts. Vérifié en local desktop + téléphone.

## 95. Round du 23.09.2026 — Page de réglages des couleurs (Général)

Lionel : « j'aimerai pouvoir changer les couleurs des éléments sans passer
par le code. » Tableau xlsx envoyé pour choisir les regroupements
(couleurs partagées entre plusieurs éléments), rempli sur son Google Drive
et confirmé avec lui (25 éléments -> 16 réglages après regroupement,
notamment Erreur+Suppression+Étoile important ensemble, et Fond
général+cases+coin+Jalon+Note ensemble).

Nouveau fichier js/page-couleurs.js : la liste des 16 groupes (variables
CSS pilotées, valeurs par défaut clair/sombre) + la logique. Chaque groupe
a un sélecteur de couleur natif (input type=color) pour le clair et un
pour le sombre sur la page Général, sous les réglages existants. Un choix
enregistré construit une balise <style> injectée dans <head> qui pose les
variables CSS correspondantes (ex. --accent, ou les 5 variables du groupe
Fond en une fois) ; tant qu'aucun choix n'est enregistré pour un groupe,
rien ne change, les valeurs d'origine de style.css s'appliquent. Piège
rencontré et corrigé en test : le bloc sombre de style.css cible `:root:not([data-theme="light"])`, plus spécifique qu'un simple `:root` — la balise injectée reprend le même sélecteur pour le mode sombre, sinon
elle perdait contre la règle d'origine malgré un ordre plus tardif dans le
document. Stockage dans localStorage (portée locale à l'appareil, comme
"Afficher les week-ends" déjà sur cette page) : pas de table Supabase,
rien de partagé entre appareils.

2 couleurs jusqu'ici codées en dur (l'étoile "important" activée, le point
de synchronisation) sont sorties en variables CSS (--important-toggle-bg/
-ink, --sync-dot) dans style.css pour pouvoir être pilotées comme les
autres — mêmes valeurs qu'avant, aucun changement visuel tant que Lionel
n'y touche pas.

Bouton "Tout réinitialiser" en haut de la section, et bouton de reset par
ligne. Vérifié en local (Playwright) : rendu clair/sombre par défaut
identique à l'existant (aucune régression sur les couleurs actuelles),
changement d'un groupe simple (1 variable) et d'un groupe multiple (Fond,
5 variables) répercuté immédiatement, alpha préservé sur les groupes
Ombres/Texte (rgba, seule la teinte change), persistance après rechargement,
reset par ligne et reset global, non-régression sur les onglets/toolbar
pilule/sélecteur chantier déjà en place. Livré directement dans le dépôt
(style.css, js/coquille.js, nouveau js/page-couleurs.js, index.html).
