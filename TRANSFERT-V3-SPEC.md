# Spec de transfert V3 → backend réel (Google Sheets)

Contexte : Lionel a demandé le transfert de TOUT le prototype V3 (bulles,
`prototype-bulles.html`, ~111 points documentés dans `V3-spec-suite.md`)
dans le vrai webapp connecté à Google Sheets, en remplacement de l'actuel
`Index.html`/`WebApp.gs` (V2), **en une seule fois** (pas de validation
intermédiaire — décision explicite de Lionel, cf. AskUserQuestion : "Tout le
prototype V3" + "Tout d'un coup").

Ce document fige les décisions d'architecture (tensions identifiées par les
deux inventaires `v3-inventory.md` / `v2-backend-inventory.md`) et sert de
contrat entre le travail backend (WebApp.gs + Planning_Format.gs) et le
travail client (Index.html). **Ne pas dévier de ce contrat sans le mettre à
jour** — l'autre côté en dépend.

Philosophie générale (héritée de `architecture-donnees-v3.md`, décision déjà
actée par Lionel) : **pas de refonte du modèle de données**. On réutilise la
feuille "Planning" ligne-par-personne telle quelle, on étend les conventions
texte existantes (crochets `[Confirmé]`, `[Important]`, tirets), on ajoute
des feuilles de config quand c'est vraiment nécessaire. Toujours préserver le
mode "impression PDF propre" qui est un usage opérationnel quotidien de
Lionel.

## 1. Dates : window-relative (V3) → dates réelles (backend)

Le backend réel est déjà ancré sur des dates absolues (chaque bloc de
colonnes = une vraie semaine calendaire, via `labG`/`semaineDepuisLabel`).
Le problème (`gi` window-relative dans V3) est **uniquement côté client** :
V3 recalculait tout par rapport à la fenêtre affichée (`SEMAINES`).

Décision : le nouvel `Index.html` garde en mémoire, pour chaque cellule/tâche
chargée depuis le serveur, sa **date ISO réelle** (le serveur les fournit).
`gi` redevient une simple coordonnée d'affichage recalculée à chaque
chargement de semaine(s) — jamais stockée comme identité d'un item. Les
opérations (décalage, série, etc.) raisonnent en dates ISO, pas en `gi`.

## 2. Week-end : encodage en texte dans la cellule fusionnée existante

Le vrai classeur a **une seule colonne fusionnée** par bloc personne pour
Sam+Dim (`LARGEUR_WEEKEND`, pas de distinction Sam/Dim, pas de dropdown
Chantier) — contrairement à V3 qui promet 2 jours pleinement interactifs
(`giWeekend`). Restructurer la feuille (séparer physiquement en 2 colonnes)
casserait la mise en page d'impression PDF (usage quotidien réel) et tout le
code de génération de semaine — trop risqué pour un gain marginal.

**Décision : compromis par tag texte**, pas de changement structurel de la
feuille. Convention ajoutée aux lignes de tâche/note de la cellule
week-end UNIQUEMENT (colonne jj=6) :

- Une ligne préfixée `[S]` = Samedi seulement.
- Une ligne préfixée `[D]` = Dimanche seulement.
- Une ligne SANS préfixe jour = les deux jours (raccourci — c'est ce que
  Lionel tape déjà aujourd'hui à la main ; rétrocompatible à 100%).

Ordre des crochets en tête de ligne (tous facultatifs, dans cet ordre) :
`[S]`/`[D]` (jour, colonne week-end seulement) → statut (`[Confirmé]` etc.,
sous-traitants) → `[Important]` → `[Série:xxxxxx]` (voir §4). Reconnus dans
n'importe quel ordre à la RELECTURE (comme aujourd'hui), écrits dans CET
ordre à l'ENREGISTREMENT.

Le client V3 affiche 2 sous-colonnes Sam/Dim (comme le prototype), mais les
DEUX écrivent dans la même cellule serveur (colonne jj=6) via
`apiEnregistrerCellulePersonne` avec `jourIdx` 6 (Samedi) ou 7 (Dimanche) —
tous deux routés côté serveur vers la même colonne physique. Le serveur
fait un **merge sur les lignes taguées** :
  - Écriture jourIdx=6 (Samedi) : les lignes déjà taguées `[D]` dans la
    cellule sont préservées telles quelles ; toutes les autres lignes
    (untagged + taguées `[S]`) sont remplacées par le nouveau contenu envoyé.
    Chaque nouvelle ligne est taguée `[S]` SEULEMENT si la cellule contient
    par ailleurs du contenu `[D]` distinct (sinon elle reste sans tag — cas
    simple "même chose les 2 jours").
  - Symétrique pour jourIdx=7 (Dimanche) avec `[D]`.
`chargerSemaine_` doit désormais aussi lire jj===6 (actuellement ignoré —
c'était le trou #4 identifié dans `v2-backend-inventory.md`) et retourner un
objet week-end scindé en 2 entrées (jour 6 et 7) côté payload JSON pour que
le client puisse les afficher séparément.

Chantier week-end : même logique de merge, mais une seule valeur "chantier"
par jour (pas une liste) — 2 lignes possibles dans la cellule chantier-WE
(`[S] NomChantier` / `[D] NomChantier`, ou 1 ligne sans tag si identique les
2 jours).

## 3. Statuts & Formulaires rapides : 2 nouvelles feuilles de config

Comblent les lacunes #1 et #2 déjà identifiées dans `architecture-donnees-v3.md`
(actuellement codés en dur des deux côtés — Index.html ET WebApp.gs).

**Feuille "Statuts"** (même esprit que la feuille "Chantier" existante) :
- Ligne d'en-tête (1 ligne, comme "Chantier").
- Col A = Nom affiché (ex. "Confirmé"), Col B = Couleur (hex, fond de puce),
  Col C = Ordre (nombre).
- `apiListerStatuts()` → `[{cle, nom, couleur, ordre}]`, `cle` = nom slugifié
  (ex. "confirme") pour rester compatible avec les crochets `[Confirmé]`
  déjà écrits partout (le NOM affiché reste la clé de reconnaissance texte,
  comme aujourd'hui — seule la LISTE des statuts possibles + leur couleur
  devient éditable, pas le mécanisme de tag lui-même).
- `apiEnregistrerStatuts(modifs, nouveaux, supprimes)` — miroir de
  `apiEnregistrerChantiers`.
- `STATUT_ORDER_WEB`/`STATUTS_WEB` (actuellement en dur, lignes 144-145 de
  WebApp.gs) deviennent calculés depuis cette feuille au démarrage (avec les
  4 valeurs actuelles comme contenu par défaut si la feuille est vide/absente
  — ne jamais casser une feuille existante qui n'a pas encore cette feuille).

**Feuille "Formulaires rapides"** (une ligne par champ) :
- Col A = Nom du formulaire, B = Ordre du formulaire, C = Ordre du champ,
  D = Clé du champ, E = Label, F = Type (`texte`/`nombre`/`select`/`case`),
  G = Options (JSON, pour `select`).
- `apiListerFormulairesRapides()` regroupe par nom de formulaire →
  `[{nom, ordre, champs:[{cle,label,type,options}]}]`.
- `apiEnregistrerFormulaireRapide(nom, ordre, champs)` : supprime les lignes
  existantes pour ce nom puis réinsère le bloc (comme un mini
  delete-then-append, pas de diff ligne à ligne — plus simple et suffisant
  vu le faible volume).
- `apiSupprimerFormulaireRapide(nom)`.
- Remplace `TEXTES_METIER` (Index.html ligne ~632, en dur) et le concept V3
  de `FORMULAIRES_RAPIDES` (en mémoire, prototype).

## 4. Série (récurrence) : occurrences matérialisées, pas de règle "live"

L'actuelle feuille "Récurrences" (hebdo fixe, sans intervalle, sans fin) est
un modèle totalement différent de celui de V3 (`serieId`+`serieOrdre`,
intervalle N jours/semaines/mois/années, fin par occurrences ou par date,
édition/suppression à 3 portées). On n'essaie pas de faire évoluer
"Récurrences" vers ce modèle — **on adopte directement l'approche V3** :
une série est immédiatement développée en occurrences concrètes, écrites
comme des lignes de tâche/jalon/note normales, taguées `[Série:xxxxxx]`
(id court, ex. `s` + 6 caractères base36 aléatoires). La feuille
"Récurrences" existante n'est pas touchée/supprimée (compat descendante) mais
n'est plus utilisée par la nouvelle UI.

Nouveau tag reconnu par `decoderLigneTache_`/`decoderNotesJour_` (étendu) :
`[Série:xxxxxx]`, exposé comme champ `serieId` sur chaque tâche/note décodée.
Écrit en dernière position des crochets (après `[Important]`).

Calcul des dates d'occurrence (`pasCalendaire_(dateDebutIso, frequence,
intervalle, index)` côté serveur) : contrairement à V3 (qui travaille en
espace `gi` de grille affichée), le serveur manipule directement des
`Date` réelles — plus simple :
- `jour` : `dateDebut + index*intervalle` jours calendaires (aucun saut de
  week-end : le week-end EXISTE comme cellule cible, cf. §2).
- `semaine` : `dateDebut + index*intervalle*7` jours.
- `mois` : `dateDebut` avec `setMonth(mois + index*intervalle)` (comme
  `ajouterMois` de V3, même gestion de fin de mois par débordement naturel
  de `Date`).
- `annee` : `setFullYear(annee + index*intervalle)`.

Nouvelles fonctions :
- `apiEnregistrerSerie(payload, labGCourant)` où `payload = {type:
  'tache'|'jalon'|'note', cible:{ancre,demi} (tache) | {} (jalon/note),
  texte, statut, important, chantier, dateDebutIso, frequence, intervalle,
  finType:'occurrences'|'date', finValeur}`. Calcule les dates d'occurrence
  (garde-fou : max 366 occurrences, comme V3), génère un `serieId`, et pour
  chaque date, localise/écrit dans la bonne colonne de semaine (réutiliser
  `semaineDepuisLabel`/l'énumération des blocs de semaine déjà présente dans
  Planning_Format.gs — NE PAS réinventer la recherche de colonne). Retourne,
  pattern écrire-puis-relire habituel, la semaine `labGCourant` fraîchement
  relue + la liste des labels de semaines effectivement touchées (pour que
  le client invalide son cache sur ces semaines-là, cf. son cache scopé
  existant `"semaine"`/`"suivantes"`/`"tout"`).
- `apiModifierSerie(serieId, portee, dateRefIso, modifs, labGCourant)` —
  `portee`: `'unique'` (seule l'occurrence à `dateRefIso`), `'suivant'`
  (`dateRefIso` et toutes les occurrences de ce `serieId` à une date
  ultérieure), `'serie'` (toutes). Parcourt les blocs de semaine existants
  (bornés : pas la peine de scanner au-delà de la plage réellement générée),
  décode chaque cellule candidate, filtre celles taguées `serieId`,
  applique `modifs` (texte/statut/important/chantier), ré-encode, écrit.
- `apiSupprimerSerie(serieId, portee, dateRefIso, labGCourant)` — même
  parcours, retire les lignes taguées au lieu de les modifier.

Portée UI (3 choix, cf. `demanderPorteeSerie()` de V3) : inchangé, transposé
tel quel côté client, qui appelle la bonne fonction serveur au lieu de
manipuler son tableau `TACHES` en mémoire.

## 5. Fériés : une seule feuille, devient la source éditable

La feuille "Fériés" réelle existe déjà (actuellement : source de couleur
d'affichage uniquement, jamais validée à l'écriture). V3 a 2 systèmes
déconnectés (`FERIES` demo 2 entrées + `FERIES_ETAT`/`CATS_FERIES` page
calendrier annuel avec faux bouton "Enregistrer"). **Décision : les deux
fusionnent sur la feuille réelle.**

- Colonnes (étendre si besoin, défensif — ne pas casser une feuille
  existante) : Date (iso), Libellé, Catégorie (`ferie` | `vacances_entreprise`).
  Si la feuille actuelle n'a pas de colonne Catégorie, l'ajouter avec
  `ferie` comme valeur par défaut pour les lignes existantes.
- `apiListerFeries()` / `apiEnregistrerFeries(modifs, nouveaux, supprimes)`.
- La page "calendrier annuel" de V3 (actuellement un no-op côté maquette)
  devient réelle : son bouton "Enregistrer" appelle
  `apiEnregistrerFeries(...)` pour de vrai.
- Ne PAS ajouter de validation bloquante à l'écriture d'une tâche sur un
  jour férié (non demandé, hors scope) — juste la persistance + l'affichage
  couleur, comme documenté.

## 6. Personnel / sous-traitant

Inchangé : on garde la convention par position de ligne
(`PREMIERE_LIGNE_SOUS_TRAITANT`) déjà en place. Le serveur continue de
renvoyer un booléen `sousTraitant` par personne (déjà le cas,
`apiChargerSemaine`/`apiRenommerPersonne`) ; le client V3
(`secteurPersonne()`) l'utilise tel quel pour ses décisions d'UI (Statut
visible uniquement pour un sous-traitant, etc. — le bugfix du point 111 déjà
livré). Aucun changement serveur nécessaire ici au-delà de s'assurer que ce
champ est bien présent dans tous les payloads que le nouveau client consomme.

## 7. Ce qui NE change PAS côté backend

Gardés tels quels, réutilisés par toutes les nouvelles fonctions ci-dessus :
`avecVerrou_`, le pattern écrire-puis-relire, `tirets()`, `estAbsence()`,
`detecterPersonnes()`, `CONFIG`, `decoderNom_`/`encoderNom_`,
`isLabelCol`/`semaineDepuisLabel`/`listerSemainesPlanning`,
`apiListerChantiers`/`apiEnregistrerChantiers` (modèle à suivre pour Statuts
et Fériés), `apiApercuDecalage`/`apiAppliquerDecalage`,
`apiAttribuerChantierGroupe`, `apiGenererPdf`, verrouillage LockService.

## 8. Contrat côté client (Index.html)

Le nouvel `Index.html` est un portage complet de l'UI/UX de
`prototype-bulles.html` (8 pages, ~111 points), mais :
- Zéro tableau en mémoire comme source de vérité (`TACHES`, `JALONS`,
  `NOTES`, `PERSONNES`, `CHANTIERS`, `STATUTS`, `FERIES_ETAT` en dur) —
  tout vient de `google.script.run` via le wrapper `gs(fn,args,onOk,onErr)`
  existant, avec le cache semaine scopé déjà en place (`FRAICHEUR_MS=90000`,
  invalidation `"semaine"`/`"suivantes"`/`"tout"`).
- `#progress`/`#toast` restent EN DEHORS de `#app` (bug déjà corrigé une
  fois côté V2 — ne pas régresser).
- Convention double-clic pour éditer / simple clic pour sélectionner une
  bulle (`resoudreClicBulle`, `DELAI_DOUBLE_CLIC=400`) : conservée telle
  quelle depuis V3.
- Auto-repli de la sidebar sur la page planning (`.repliee` /
  `.btn-menu-toggle`) : conservé tel quel depuis V3.
- `giWeekend(s,j)=1000+s*2+j` etc. : conservé côté client pour la mise en
  page (c'est un pur détail de rendu maintenant, cf. §1) — mais les 2
  sous-colonnes Sam/Dim s'alimentent désormais depuis les 2 entrées (jour 6
  et 7) que retourne le serveur pour la colonne week-end fusionnée (§2), pas
  depuis un tableau en mémoire.
- Toutes les actions CRUD (personnel, chantiers, statuts, formulaires
  rapides, fériés, entrée rapide, série) appellent les fonctions
  `apiXxx` correspondantes (existantes ou nouvelles, §2-§5) au lieu de
  muter un état local.
- Undo/redo : le bug latent déjà repéré dans `v3-inventory.md`
  (`supprimerPersonne`/`supprimerChantier`/`supprimerStatut` sauvegardent un
  état undo que `restaurerEtat()` ne restaure pas complètement) doit être
  soit corrigé soit — plus simple et plus sûr pour un premier portage
  serveur — le undo/redo est **retiré des actions destructives CRUD**
  (suppression personne/chantier/statut) qui n'ont de toute façon plus de
  sens en mode serveur multi-utilisateur (un autre utilisateur peut avoir
  modifié la feuille entre-temps). Undo/redo reste disponible pour les
  actions de grille (tâche/jalon/note/décalage) comme avant, tant qu'il
  s'agit d'annuler la DERNIÈRE action de CETTE session (pas une garantie
  cross-utilisateur — à documenter clairement pour Lionel).

## 9. Statut de ce document

Rédigé au moment de démarrer le portage complet (01.09.2026), après lecture
complète de `v3-inventory.md` et `v2-backend-inventory.md`. Sert de contrat
figé pour le travail simultané sur WebApp.gs/Planning_Format.gs (backend) et
Index.html (client) — toute déviation doit être répercutée ici avant d'être
codée, pour que les deux côtés restent cohérents.
