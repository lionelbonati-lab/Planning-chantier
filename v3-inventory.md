# Inventaire complet — prototype-bulles.html (V3)

Source : `/home/claude/work/webapp/prototype-bulles.html` (4933 lignes, ~275 Ko), lu intégralement.
Fichier HTML unique, autonome : `<style>` inline (lignes 3–777) + `<script>` inline (lignes 1004–4933) enveloppé dans une IIFE `(function () { "use strict"; ... })();`. Aucune dépendance externe hormis la police Google Fonts (Archivo / IBM Plex Mono). **Aucune persistance : ni `localStorage`, ni `fetch`, ni backend — tout l'état vit dans des variables JS en mémoire, remis à zéro au rechargement de la page.** Ce document sert de référence exhaustive pour le portage vers un backend Google Apps Script / Google Sheets, en remplacement de V2 (Index.html/WebApp.gs/Planning_Format.gs).

Tout au long du fichier, des commentaires datés ("demande de Lionel, JJ.MM.2026") documentent l'historique des décisions produit — je les cite car ils expliquent le POURQUOI de choix qui semblent sinon arbitraires (ex. teinte des week-ends, suppression du bouton "+", etc.).

---

## 1. Data model

### 1.1 Vue d'ensemble des structures top-level (`var` déclarées dans l'IIFE)

| Variable | Ligne | Réinitialisée par "Réinitialiser" ? | Rôle |
|---|---|---|---|
| `CHANTIERS` | 1012 | Oui (`seedChantiers()`) | dict id→{nom,couleur} |
| `PALETTE_CHANTIERS` | 1024 | constante | palette de 8 couleurs proposées |
| `JOURS` | 1033 | constante | `["Lun","Mar","Mer","Jeu","Ven"]` |
| `MOIS_ABBR` | 1051 | constante | abréviations de mois pour affichage date |
| `ANCRE_LUNDI_S36` | 1052 | constante | `new Date(2026,7,31)` — lundi semaine 36, ancre de toute la navigation par semaine |
| `semaineOffset` | 1053 | Oui (remis à 0 dans `seedTout()`) | décalage en semaines depuis l'ancre |
| `PERSONNES` | 1082 | Oui (`seedPersonnes()`) | tableau de personnes (personnel + intervenants) |
| `DEMIS` | 1091 | constante | `["matin","aprem"]` |
| `STATUTS` / `STATUTS_ORDRE` | 1103–1104 | Oui (`seedStatuts()`) | dict id→statut + tableau d'ordre |
| `PALETTE_STATUTS` | 1124 | constante | palette de 8 couleurs proposées |
| `FERIES` | 1156 | **Non** | 2 entrées fixes de démo (fériés/vacances "planning") — jamais réinitialisées, considérées comme données d'entreprise |
| `idc` | 1203 | Oui (remis à 1 dans `seedTout()`) | compteur global d'ID d'item (`"b" + idc++`) |
| `serieIdc` | 1271 | **Non remis à zéro explicitement** (mais les séries elles-mêmes disparaissent avec `seedTout()`) | compteur d'ID de série (`"serie" + serieIdc++`) |
| `SEMAINES`, `JALONS`, `NOTES`, `TACHES` | 1489 | Oui (`seedTout()`) | données du planning courant |
| `deuxSemaines` | 1623 | **Non** (préférence de vue) | affichage 1 ou 2 semaines |
| `afficherWeekends` | 1628 | **Non** (préférence de vue) | toggle "Afficher les week-ends" (page Général) |
| `replierSectionPersonnel` / `replierSectionIntervenants` | 1629–1630 | **Non** (préférence de vue) | état replié/déplié des sections |
| `bullesSelectionnees` | 1637 | Oui (`viderSelection()` appelé au reset) | dict id→true, sélection multi-bulles courante |
| `pressePapier` | 1641 | Oui | tableau d'items copiés (Ctrl+C/X) |
| `pileUndo`, `pileRedo` | 1642 | Oui (vidées) | piles d'annulation/rétablissement |
| `LIMITE_UNDO` | 1643 | constante | 50 |
| `FORMULAIRES_RAPIDES` | 4415 | Oui (`seedFormulairesRapides()`) | formulaires "Entrée rapide" |
| `champsEnConstruction`, `formulaireEnEdition`, `typeChampActuel`, `typeFormulaireActuel` | 4506–4513 | état UI transitoire du constructeur de formulaire | |
| `MOIS_FR`, `JOURS_PAR_MOIS` | 4769–4770 | constantes | |
| `CATS_FERIES` | 4771 | **Non** | 3 catégories (Vacances/Férié/Compensés) avec couleur éditable |
| `ferieAnnee`, `ferieCategorieActive` | 4776–4777 | état UI page Fériés | |
| `FERIES_ETAT` | 4780 | **Non, jamais** | `FERIES_ETAT[année]["mois-jour"] = catId`, calendrier annuel des fériés |

### 1.2 PERSONNES

```js
var PERSONNES = [];
function seedPersonnes() {
  PERSONNES = [
    { id: "lionel", nom: "Lionel", sousTraitant: false },
    { id: "mathis", nom: "Mathis", sousTraitant: false },
    { id: "armature", nom: "Armature / Béton", sousTraitant: true }
  ];
}
```
Champs : `id` (string, slug généré depuis le nom via `idDepuisNom`), `nom` (string libre), `sousTraitant` (bool — détermine secteur "personnel" vs "sous-traitant"/Intervenant).

- Lu par : quasiment tout le rendu de grille (`lignesSecteur`, `secteurPersonne`, `renderPersonnel`, `renderIntervenants`, sélecteurs de formulaires, `boutonsMenuAjout`, `nomIntervenant`).
- Écrit par : `ouvrirAjoutPersonne` (push), `ouvrirModifierPersonne` (renomme `p.nom` en place), `supprimerPersonne` (filter + supprime aussi toutes les `TACHES` de cette personne — cascade delete).
- Pas d'ID stable indépendant du nom : `idDepuisNom(nom, existeDeja)` slugifie (minuscule, accents supprimés via NFD, non-alphanumérique → `-`), avec suffixe `-2`, `-3`… en cas de collision. **Le renommage NE change PAS l'id** (seul `nom` change), donc l'id reste stable après un renommage — important pour une migration où l'id doit devenir une clé de ligne Sheet stable.
- "Personnel" = tri `sousTraitant:false` ; "Intervenants" (UI) = `sousTraitant:true` (le nom interne reste `sousTraitant` malgré le renommage d'affichage en "Intervenant" — note explicite dans le code, ligne 543-546).

### 1.3 CHANTIERS

```js
var CHANTIERS = {};
function seedChantiers() {
  CHANTIERS = {
    filisetti: { nom: "Filisetti", couleur: "#adcbef" },
    bine: { nom: "BINE", couleur: "#f8c8b5" },
    perrin: { nom: "Chantier Perrin", couleur: "#aee3d0" }
  };
}
```
Dict clé = id slug (identique au principe `idDepuisNom`), valeur = `{nom, couleur}` (couleur = hex CSS, ex `#adcbef`). `PALETTE_CHANTIERS` (8 couleurs pastel) sert à `couleurProposeeChantier()` qui retourne la première couleur de la palette non encore utilisée.
- Lu par : `bulleEl` (couleur de fond de bulle tâche + tag texte), `construireLegende`, tous les formulaires (`champChantierHTML`).
- Écrit par : `ouvrirAjoutChantier` (nouvel id via `idDepuisNom`), `ouvrirModifierChantier` (mute `nom`/`couleur` en place), `supprimerChantier` (delete + met `t.chantier = null` sur toutes les TACHES qui l'utilisaient — **pas de cascade delete**, contrairement à PERSONNES).

### 1.4 STATUTS / STATUTS_ORDRE

```js
var STATUTS = {};
var STATUTS_ORDRE = [];
function seedStatuts() {
  STATUTS = {
    areserver: { nom: "À réserver", couleur: "#e2e6ea", texteGras: false, texteItalique: false, texteSouligne: false, texteCouleur: null },
    reserve:   { nom: "Réservé",     couleur: "#dbe6f7", texteGras: false, texteItalique: false, texteSouligne: false, texteCouleur: null },
    confirme:  { nom: "Confirmé",    couleur: "#cdf1ea", texteGras: false, texteItalique: false, texteSouligne: false, texteCouleur: null },
    annule:    { nom: "Annulé",      couleur: "#f6dcd7", texteGras: false, texteItalique: true,  texteSouligne: false, texteCouleur: "#93362b" }
  };
  STATUTS_ORDRE = ["areserver", "reserve", "confirme", "annule"];
}
```
Champs par statut : `nom`, `couleur` (fond du badge `.b-statut`), `texteGras`/`texteItalique`/`texteSouligne` (bool), `texteCouleur` (hex ou `null` = couleur normale). `STATUTS_ORDRE` fixe l'ordre d'affichage/chips — nécessaire car un objet JS ne garantit pas d'ordre stable après suppr/réinsertion.
- N'existe QUE pour les tâches d'intervenants (`sousTraitant:true`) — jamais pour le personnel, jamais pour une absence (règle imposée partout où `champStatutHTML` est invoquée).
- `styleTexteStatutCSS(id)` (ligne 1137) génère la chaîne CSS inline (`font-weight:700;font-style:italic;...`) appliquée à la fois sur `.b-txt` de la bulle (grille), sur l'aperçu-live des popups, et sur la fiche de la page Statuts — une seule fonction pour ne jamais désynchroniser les 3 usages.
- Écrit par : `ouvrirAjoutStatut` (push id à `STATUTS_ORDRE`), `ouvrirModifierStatut` (mute en place), `supprimerStatut` (delete + filter de `STATUTS_ORDRE` + met `t.statut = null` sur les TACHES concernées — pas de cascade delete, comme les chantiers).
- `PALETTE_STATUTS` / `couleurProposeeStatut()` : même mécanique que pour les chantiers.

### 1.5 Le modèle d'item : `item()`, `itemPlage()`, `itemPlageTache()`

Trois constructeurs partagés, tous préfixant l'id par `"b" + (idc++)` (compteur global, PAS de compteur séparé par type) :

```js
// item() — non utilisé pour les bulles finales de la maquette (résidu ancien modèle "1 bulle par créneau"), 
// gardé pour ecrirePlageRectangle (jamais appelé dans les chemins actifs modernes)
function item(type, texte, opts) {
  return { id:"b"+(idc++), type, chantier: opts.chantier||null, texte, important: !!opts.important, statut: opts.statut||null };
}

// itemPlage() — Jalons/Notes : 1 bulle = 1 plage giDebut..giDebut+duree-1, PAS de ligne dédiée
function itemPlage(type, texte, giDebut, duree, opts) {
  return {
    id: "b"+(idc++), type, texte, important: !!opts.important,
    giDebut, duree: Math.max(1, duree),
    serieId: opts.serieId || null, serieOrdre: opts.serieId ? opts.serieOrdre : null
  };
}

// itemPlageTache() — Tâches/Absences personnel & intervenants : 1 bulle = 1 plage sur UNE ligne (personne+demi)
function itemPlageTache(type, texte, personneId, demi, giDebut, duree, opts) {
  return {
    id: "b"+(idc++), type, texte, chantier: opts.chantier||null,
    important: !!opts.important, statut: opts.statut||null,
    personneId, demi, giDebut, duree: Math.max(1, duree),
    serieId: opts.serieId || null, serieOrdre: opts.serieId ? opts.serieOrdre : null
  };
}
```

**Champ shape complet par liste :**

- **`TACHES`** (tableau, tous les items `itemPlageTache`) — `{id, type:"tache"|"absence", texte, chantier, important, statut, personneId, demi:"matin"|"aprem", giDebut, duree, serieId, serieOrdre}`.
  - Une bulle par demi-journée UTILISÉE : matin et aprem d'une même tâche sont **complètement indépendantes** (pas de `groupeId` liant les deux — testé puis explicitement rejeté par Lionel, voir commentaire ligne 1225-1230), y compris pour la suppression et le redimensionnement.
  - `chantier` : uniquement pour `type==="tache"` (jamais pour `type==="absence"`).
  - `statut` : uniquement pour tâche ET personne `sousTraitant:true`.
- **`JALONS`** (tableau d'`itemPlage`, `type:"jalon"`) — pas de ligne personne, 1 ligne globale "Jalons" dans la grille.
- **`NOTES`** (tableau d'`itemPlage`, `type:"note"`) — idem, ligne globale "Notes".
- **Données seed exactes (`seedTout()`, ligne 1496)** :
```js
TACHES = [
  itemPlageTache("tache","Bétonnage radier","lionel","matin",0,1,{chantier:"filisetti"}),
  itemPlageTache("tache","Coffrage voile","lionel","matin",1,1,{chantier:"filisetti"}),
  itemPlageTache("tache","Armature","lionel","matin",2,1,{chantier:"bine"}),
  itemPlageTache("tache","Ferraillage poutre","lionel","matin",2,1,{chantier:"bine"}),
  itemPlageTache("tache","Second œuvre","mathis","matin",0,1,{chantier:"perrin"}),
  itemPlageTache("absence","Congés","mathis","aprem",1,1,{}),
  itemPlageTache("tache","Étanchéité toiture","mathis","aprem",3,1,{chantier:"filisetti",important:true}),
  itemPlageTache("tache","Ferraillage dalle","armature","matin",4,1,{chantier:"perrin",statut:"confirme"}),
  itemPlageTache("tache","Coffrage dalle","armature","matin",5,3,{chantier:"filisetti",statut:"confirme"}),
  itemPlageTache("tache","Coffrage dalle","armature","aprem",5,3,{chantier:"filisetti",statut:"confirme"}),
  itemPlageTache("tache","Chape","lionel","matin",5,1,{chantier:"bine"})
];
JALONS = [
  itemPlage("jalon","Livraison béton",2,1),
  itemPlage("jalon","Réunion chantier",5,1)
];
NOTES = [
  itemPlage("note","Livraison sable",2,2),
  itemPlage("note","Contrôle sécurité",2,1,{important:true}),
  itemPlage("note","Fermeture chantier",4,3)
];
```

### 1.6 Le schéma d'index de jour `giDebut` — CENTRAL, à bien comprendre pour le portage

- **Espace "jours de semaine"** : `gi` entier, `0..4` = lundi..vendredi de la semaine 1 affichée (index `SEMAINES[0]`), `5..9` = lundi..vendredi de la semaine 2 (`SEMAINES[1]`), uniquement pertinent quand `deuxSemaines===true`. `gi % 5` = jour de semaine (0=Lun..4=Ven), `Math.floor(gi/5)` = index de semaine (0 ou 1).
- **Espace "week-end"** (ligne 1846-1863, ajouté 01.09.2026) : `estGiWeekend(gi) = gi >= 1000`. `giWeekend(semaineIdx, jourIdx) = 1000 + semaineIdx*2 + jourIdx` (jourIdx 0=Samedi, 1=Dimanche). `semaineDuGiWeekend(gi) = Math.floor((gi-1000)/2)`, `jourWeekendIdx(gi) = (gi-1000)%2`. Choisi plutôt que de migrer tout le modèle vers 7 jours/semaine, pour ne jamais devoir toucher les `giDebut` existants (toujours `<10` pour 2 semaines). **Contrainte impérative documentée dans le code : tout calcul numérique de plage (giMax-giMin etc.) doit rester dans UN SEUL des deux espaces à la fois — jamais mélanger semaine et week-end dans un même geste.**
- `giVisible(gi, n)` : un item est affiché si (semaine) `gi < n` (n = 5 ou 10 selon `deuxSemaines`), ou (week-end) `afficherWeekends && semaineDuGiWeekend(gi) < n/5`.
- `colonneGrille(gi)` : traduit un `gi` en numéro de colonne CSS Grid réel — `gi + 2 + (afficherWeekends ? floor(gi/5)*2 : 0)` pour semaine (2 colonnes = label + décalage 1-based), et `2 + s*7 + 5 + j` pour week-end (les 2 colonnes week-end suivent les 5 colonnes ouvrées de LEUR semaine).
- **`dateReelleDuGi(gi)`** (ligne 1279) : traduit un `gi` en vraie `Date` JS, EN PARTANT DE `SEMAINES` (la fenêtre actuellement affichée) comme ancre — donc "la date de ce jour" n'a de sens QUE relativement à la semaine affichée au moment de la création de l'item. **Portée assumée explicitement documentée (ligne 1044-1050, 1265-1269) : ce n'est PAS un vrai calendrier continu.** Naviguer entre semaines change seulement les libellés affichés — les bulles existantes ne "suivent" pas une vraie semaine différente. C'est le point le plus important à corriger dans le portage réel : le vrai backend doit avoir un giDebut ancré à une VRAIE date calendaire absolue, pas relative à la fenêtre affichée.

### 1.7 FORMULAIRES_RAPIDES

```js
var FORMULAIRES_RAPIDES = [];
function seedFormulairesRapides() {
  FORMULAIRES_RAPIDES = [
    { id:"armature", nom:"Armature", champs:"zone · précision · étape · statut", intervenantId:"armature", type:"tache" },
    { id:"beton", nom:"Béton", champs:"zone · quantité · formule · heure · étape · statut", intervenantId:"armature", type:"tache" },
    { id:"livraison", nom:"Livraison armature", champs:"zone · statut", intervenantId:"armature", type:"tache" },
    { id:"conge", nom:"Congé", intervenantId:"personnel", type:"absence", champsDef: [] },
    { id:"vacances", nom:"Vacances", intervenantId:"personnel", type:"absence", champsDef: [] }
  ];
}
```
Deux catégories très différentes de formulaires, distinguées par la présence de `champsDef` :
1. **3 formulaires "historiques" codés en dur** (`armature`, `beton`, `livraison`) — pas de `champsDef`, ont un champ texte legacy `champs` (résumé affiché), et s'ouvrent via 3 fonctions dédiées (`ouvrirFormulaireArmature/Beton/LivraisonArmature`). **Non modifiables via le constructeur de champs** — cliquer "Modifier" sur ceux-ci affiche juste un toast d'avertissement (ligne 4473). Ils n'implémentent PAS le mécanisme "Série" (voir §4.2, portée assumée).
2. **Formulaires "dynamiques" créés par l'utilisateur** — ont `champsDef` (array, éventuellement vide), `intervenantId` (assignation : `"personnel"` ou l'id d'une personne `sousTraitant:true`), `type:"tache"|"absence"`. S'ouvrent via `ouvrirFormulaireDynamique()` générique. **Champs `champsDef[i]`** : `{id, label, type:"texte"|"choix"|"nombre", options?:[...], unite?:string}` — voir §3 "Entrée rapide CRUD" pour le détail des 3 types.
   - Cas spécial : `champsDef` vide (`[]`) → s'ajoute directement en 1 clic sans ouvrir de popup (`ajoutRapide`), comme "Congé"/"Vacances".
- Écrit par : `ouvrirEditeurFormulaire`/panneau "Nouveau/Modifier formulaire" (push ou mute en place), suppression via `renderFormulaires` → filter.
- Pas de cascade delete : supprimer un formulaire ne touche pas les tâches déjà créées avec lui (le texte est déjà "figé" dans la bulle au moment de la création).

### 1.8 FERIES / FERIES_ETAT / CATS_FERIES — DEUX systèmes de fériés distincts et non reliés

Point important pour le portage : le prototype contient **DEUX** mécanismes de "jour férié" complètement séparés qui ne communiquent pas entre eux :

1. **`FERIES`** (tableau, 2 entrées fixes de démo) : `{label, couleur, giDebut, duree}` — indexé en `gi` (espace semaine affichée), sert UNIQUEMENT à teinter les cases du planning (`feriePourJour`, `appliquerTeinteFerie`) et à afficher un libellé sous le nom du jour en en-tête de colonne (`.th-ferie-label`). Purement décoratif/informatif dans le planning, aucune vraie donnée calendaire.
2. **`FERIES_ETAT[année]["mois-jour"] = catId`** + **`CATS_FERIES`** (page "Fériés" dédiée, calendrier annuel complet Jan-Déc, tous les jours 1-31) : un vrai calendrier annuel où l'utilisateur clique des dates pour les peindre avec 1 de 3 catégories (`vacances` #92D050 vert, `ferie` #FF5050 rouge, `compenses` #FFFF00 jaune — couleurs reprises de la feuille "Heures 2026" existante). Le bouton "Calculer les fériés" (`calculerFeries(annee)`, ligne 4816) calcule algorithmiquement :
   - Pâques (algorithme grégorien standard, `pasquesDate`), et 6 fêtes mobiles dérivées (Vendredi Saint = Pâques-2, Lundi de Pâques = +1, Ascension = +39, Pentecôte = +50, Fête-Dieu = +60).
   - 5 fêtes fixes (Nouvel an 1/1, Fête du travail 1/5, Indépendance jurassienne 23/6, Fête nationale suisse 1/8, Toussaint 1/11, Noël 25/12).
   - Lundi de St-Martin = `lundiSurOuApres(11 novembre)` — PAS une date fixe (corrige un bug de la feuille Sheets existante qui utilisait le 16 novembre fixe).
   - Règle "pont" (uniquement pour Ascension, Fête-Dieu, Indépendance jurassienne, marquées `pont:true`) : si le férié tombe un mardi → la veille (lundi) devient "compensés" ; s'il tombe un jeudi → le lendemain (vendredi) devient "compensés" ; jamais de pont un mercredi.
   - Règle "week-end" : un férié tombant samedi/dimanche n'est PAS marqué (déjà chômé).
   - **Le bouton "Enregistrer" (`btnEnregistrerFeries`) ne fait RIEN de réel — juste `toast("Enregistré.")` (ligne 4926-4928) — preuve explicite qu'il n'y a aucune persistance dans ce prototype**, même l'apparence d'un "enregistrement" est feinte.
3. **Ni `FERIES` ni `FERIES_ETAT` ne sont réinitialisés par "Réinitialiser"** — considérés comme des données pérennes indépendantes du planning de démo.

### 1.9 SEMAINES

```js
function appliquerSemaines() {
  SEMAINES = [0, 1].map(function (k) {
    var off = semaineOffset + k;
    return { numero: numeroSemaineISO(lundiSemaine(off)), offset: off };
  });
}
```
Toujours 2 entrées calculées (même en mode "1 semaine" — seule `SEMAINES[0]` est utilisée alors). `numero` = numéro de semaine ISO 8601 réel (`numeroSemaineISO`, calcul standard via jeudi de la semaine). `offset` = décalage en semaines depuis `ANCRE_LUNDI_S36` (utilisé par `lundiSemaine(offset)` pour obtenir le vrai lundi). Recalculé à chaque navigation (flèches ‹ ›) et au reset.

---

## 2. Pages / UI surfaces

Navigation par sidebar gauche (`<nav class="sidebar" id="sidebar">`, boutons `data-page="..."`), un seul `.page.actif` visible à la fois. La sidebar se **replie automatiquement** (display:none) sur la page "planning" pour gagner de la place (demande 01.09.2026), rouvrable en survol via `#btnMenuToggle` (☰) sans changer de page tant qu'on ne clique pas un item.

### 2.1 `data-page="planning"` — page principale (Planning à bulles)
Contenu : titre + aide, toggle "1 semaine"/"2 semaines" (`#toggleSem`), bouton "↺ Réinitialiser" (`#btnReset`), légende des chantiers/types (`#legende`, `construireLegende()`), flèches Annuler/Refaire flottantes (`#barreUndo`), la grille elle-même (`#racine`, reconstruite entièrement par `construireGrille()`/`render()`), barre d'action flottante en bas (`#barreAction`, Annuler/Supprimer ou Annuler/Copier/Déplacer selon contexte), note d'aide statique en bas.
Actions : voir §3 en entier — quasiment toutes les mutations de données se produisent ici (ajout/édition/suppr/déplacement/redim/sélection/série de tâches, absences, jalons, notes).
Fonctions clé : `construireGrille`, `render`, `bulleEl`, `onPointerDownBulle`/`onPointerDownGroupeSelection`, `cablerAjoutCellule`, `cablerPoigneeRedim`, tous les `ouvrirXxx` de formulaire.

### 2.2 `data-page="general"` — réglages d'affichage
Un seul réglage : toggle "Afficher les week-ends" (`#chkWeekends`) → `afficherWeekends`. Câblé une fois (`chkWeekends.addEventListener("change", ...)`), pas de re-render de page nécessaire (contenu statique).

### 2.3 `data-page="chantiers"` — CRUD Chantiers
Liste (`#listeChantiers`, `renderChantiers()`) : pastille couleur + nom + compteur "N tâche(s)" + Modifier/Supprimer, "+ Ajouter" en dernière ligne de liste (`ligne-ajouter`). Popup Ajouter/Modifier : nom (texte) + `<input type="color">`. Suppression avec confirmation, préservant les tâches (juste `chantier=null`).

### 2.4 `data-page="statuts"` — CRUD Statuts
Structure identique à Chantiers, `renderStatuts()`, ordre selon `STATUTS_ORDRE`. Popup Ajouter/Modifier a EN PLUS l'éditeur de style de texte (`editeurTexteStatutHTML`/`cablerEditeurTexteStatut`) : 3 chips à bascule Gras/Italique/Souligné + case "Couleur du texte" (checkbox qui active/désactive un `<input type="color">`) + aperçu live.

### 2.5 `data-page="personnel"` — CRUD Personnel (sousTraitant=false)
`renderPersonnel()` : liste filtrée + Modifier(renommer)/Supprimer + "+ Ajouter". Supprimer cascade-supprime les TACHES de cette personne.

### 2.6 `data-page="intervenants"` — CRUD Intervenants (sousTraitant=true)
`renderIntervenants()` : structure identique à Personnel, filtre inversé. Le libellé UI est "Intervenant" mais le champ interne reste `sousTraitant`.

### 2.7 `data-page="entree-rapide"` — CRUD Formulaires "Entrée rapide"
`renderFormulaires()` : cartes (`.carte-form`) avec nom, résumé des champs (`champsResumeAffiche`), badge "Absence" si type absence, badge intervenant assigné, Modifier (ouvre le constructeur SAUF pour les 3 formulaires historiques sans `champsDef` → toast bloquant) / Supprimer. Bouton "+ Nouveau formulaire" ouvre un panneau (`#panneauNouveauForm`, pas une popup flottante) avec : nom, chip Type (Tâche/Absence), select "Assigné à" (Personnel ou un intervenant précis), constructeur de champs (liste + bouton "+ Ajouter un champ" → mini-formulaire label + type de champ + options/unité selon type), Annuler/Enregistrer.

### 2.8 `data-page="feries"` — calendrier annuel des fériés
Navigation année (‹ / ›), 3 catégories cliquables avec pastille couleur éditable, actions "Calculer les fériés"/"Effacer"/"Enregistrer" (ce dernier factice), tableau calendrier 12 mois × 31 jours (`renderFerieCalendrier`), clic sur une case = peint/dépeint avec la catégorie active.

---

## 3. Chaque action utilisateur qui MUTE des données

### 3.1 Tâches / Absences (TACHES)
- **Créer (clic simple 1 case)** → `ouvrirAjout(cell,x,y)` → popup menu (Tâche / Absence / formulaires assignés) → `ouvrirEdition(cell,null,type,x,y,null)` → `creerGroupeTaches` (ou `creerSerieTaches` si case "Série" cochée). Champs saisis : texte, important (bool), chantier (si type tâche), statut (si intervenant), Série.
- **Créer (glisser multi-cases/lignes)** → `cablerAjoutCellule` détecte le glisser → `ouvrirAjoutPlage(kind,cibles,giDebut,duree)` → même popup, `creerGroupeTaches`/`creerSerieTaches` crée **1 bulle par ligne (personne+demi) touchée**, chacune avec `giDebut/duree` identiques (pas de choix "grouper" — automatique depuis le 29.08.2026).
- **Créer via formulaires spécialisés** Armature/Béton/Livraison armature (`ouvrirFormulaireArmature/Beton/LivraisonArmature`) : construisent un texte concaténé depuis des chips (zone, précision, étape) + champs texte (quantité/formule/heure pour Béton), toujours avec Chantier + Statut. Pas de case "Série" sur ces 3-là (portée assumée du prototype).
- **Créer via formulaire dynamique** (`ouvrirFormulaireDynamique(f,...)`) : pour tout `FORMULAIRES_RAPIDES` avec `champsDef` non-vide — génère les champs selon leur `type` (texte/choix/nombre), concatène en texte final `nomFormulaire - valeur1 - valeur2...` (segments vides omis), propose Chantier (si pas absence) + Statut (si intervenant, pas absence) + Série.
- **Créer via "Ajout rapide" (1 clic, pas de popup)** — `ajoutRapide(cibles,giDebut,duree,texte,type)` : cas des formulaires sans `champsDef` (ex Congé/Vacances).
- **Modifier** — double-clic/double-tap sur bulle ou touche Entrée sur bulle sélectionnée → `ouvrirEdition(null,itemExisting,null,x,y)`. Champs modifiables : texte, important, chantier, statut. Si l'item fait partie d'une série → `demanderPorteeSerie` (3 choix) avant d'appliquer.
- **Supprimer** — bouton "Supprimer" dans le formulaire d'édition, ou sélection + bouton rouge "Supprimer"/touche Suppr, ou glisser-déposer sur le bouton Supprimer. Toujours confirmé (`demanderConfirmation`) SAUF suppression unitaire via le formulaire d'édition (pas de confirmation là — juste le popup se ferme). Si série → `demanderPorteeSerie` d'abord.
- **Déplacer (drag)** — `onPointerDownGroupeSelection` : bulle seule TACHES peut changer de personne ET/OU de demi-journée ET de jour en la déposant n'importe où dans le MÊME secteur (personnel↔personnel, intervenant↔intervenant, jamais l'un vers l'autre). Un groupe multi-sélection ne change que le décalage de jour (`delta`), chaque bulle restant sur sa ligne d'origine. Copie via Maj (souris) ou menu Déplacer/Copier post-geste (tactile).
- **Copier (drag+Maj ou menu tactile)** — mêmes fonctions que déplacer, avec `copieFinale=true` : pousse une nouvelle bulle plutôt que de muter `giDebut` de l'existante.
- **Redimensionner (poignées gauche/droite)** — `cablerPoigneeRedim` : étire/rétrécit `giDebut`/`duree` en tirant un bord ; ne franchit jamais la frontière semaine↔week-end ; jamais de propagation à la ligne jumelle (matin/aprem indépendants).
- **Copier/Couper/Coller (Ctrl+C/X/V)** — `copierSelection`/`couperSelection`/`collerPressePapier` : clonage superficiel (`Object.assign({}, item)`), recrée un item neuf (nouvel id) à la même position lors du collage.

### 3.2 Jalons / Notes (JALONS / NOTES)
Mêmes mécanismes que les tâches mais SANS notion de personne/ligne — 1 seule ligne globale par kind. Formulaire dédié `ouvrirEditionPlage(kind,itemExisting,giDebut,duree,x,y,celluleSurbrillance)` : champs texte, **durée en jours (champ numérique explicite, contrairement aux tâches)**, important, Série. Suppression/modification en série passent aussi par `demanderPorteeSerie`. Drag/resize/multi-select fonctionnent pareil (via le mécanisme générique `itemDepuisBulle`/plage puisque toutes les listes partagent le même shape `{giDebut,duree}`).

### 3.3 Sélection multi-bulles et actions de groupe
- **Sélectionner/désélectionner une bulle** — simple clic/tap (`basculerSelection`).
- **Sélection rapide rectangle** — clic droit (souris) ou double-tap (tactile) + tirer sur une case vide → `demarrerSelectionRapide` → `selectionnerDepuisCellules` (coche toute bulle dont la plage touche au moins 1 jour sélectionné, sur SA ligne).
- **Déplacer/Copier/Supprimer le groupe** — via drag (voir 3.1) ou barre d'action (`baSupprimerEl`/`baCopierEl`/`baDeplacerEl`/`baAnnulerEl`).
- **Vider la sélection** — Échap, ou bouton "Annuler" de la barre, ou fin d'action.

### 3.4 Série (récurrence) — voir détail complet en §4.2
- Case "Série" cochée à la création (jamais en modification directe — voir `demanderPorteeSerie`).
- Modification/suppression d'un item en série → popup 3 choix **unique / suivant / série** (`demanderPorteeSerie`).

### 3.5 Personnes (PERSONNES)
- **Ajouter** — `ouvrirAjoutPersonne(sousTraitant)` : nom → `PERSONNES.push({id:idDepuisNom(nom), nom, sousTraitant})`.
- **Modifier (renommer)** — `ouvrirModifierPersonne(id, apresChangement)` : mute `p.nom` en place, id inchangé.
- **Supprimer** — `supprimerPersonne(id, apresChangement)` : confirmation (affiche le nb de tâches concernées), puis `PERSONNES = filter(...)` **et** `TACHES = filter(t.personneId !== id)` — cascade delete des tâches.

### 3.6 Chantiers (CHANTIERS)
- **Ajouter** — `ouvrirAjoutChantier()` : nom + couleur (`<input type="color">`, pré-rempli par `couleurProposeeChantier()`) → `CHANTIERS[id] = {nom, couleur}`.
- **Modifier** — `ouvrirModifierChantier(id)` : mute `nom`/`couleur` en place.
- **Supprimer** — `supprimerChantier(id)` : confirmation, `delete CHANTIERS[id]` + `TACHES.forEach(t => t.chantier===id && (t.chantier=null))` (pas de cascade delete, juste orphelinage).

### 3.7 Statuts (STATUTS / STATUTS_ORDRE)
- **Ajouter** — `ouvrirAjoutStatut()` : nom, couleur du badge, + éditeur de style texte (gras/italique/souligné/couleur texte) → `STATUTS[id] = {...}` + `STATUTS_ORDRE.push(id)`.
- **Modifier** — `ouvrirModifierStatut(id)` : mute tous les champs en place, ordre inchangé.
- **Supprimer** — `supprimerStatut(id)` : confirmation, `delete STATUTS[id]` + retire de `STATUTS_ORDRE` + `TACHES.forEach(t => t.statut===id && (t.statut=null))`.

### 3.8 Formulaires "Entrée rapide" (FORMULAIRES_RAPIDES)
- **Ajouter** — panneau (pas popup) : nom, type (Tâche/Absence via chips), assigné à (select "personnel" ou un intervenant), construction de champs (voir 3.9) → `FORMULAIRES_RAPIDES.push({id, nom, intervenantId, champsDef, type})`.
- **Modifier** — même panneau pré-rempli (`ouvrirEditeurFormulaire(f)`), sauf pour les 3 formulaires historiques (bloqué par toast).
- **Supprimer** — confirmation puis `FORMULAIRES_RAPIDES = filter(...)`.
- **Construction de champs (champsDef)** — sous-CRUD imbriqué au sein du panneau :
  - **Ajouter un champ** — mini-formulaire (`#constructeurChamp`) : label (texte libre), type (chip Texte/Liste de choix/Nombre) :
    - `texte` : rien d'autre.
    - `choix` : champ `options` (texte "séparé par une virgule" → array trim/filtré, au moins 1 obligatoire).
    - `nombre` : champ `unite` optionnel (ex "m³").
    - Validation : label obligatoire (toast sinon), au moins 1 option pour "choix" (toast sinon).
  - **Retirer un champ** — bouton ✕ sur chaque ligne (`champsEnConstruction.splice(idx,1)`).
  - Les champs vivent en mémoire tampon (`champsEnConstruction`) jusqu'à "Enregistrer" du formulaire parent.

### 3.9 Fériés (page dédiée)
- **Peindre/effacer une date** — clic sur une case du calendrier (sauf week-end, non cliquable) : toggle `FERIES_ETAT[annee][m+"-"+j]` entre la catégorie active et suppression (reclic sur la même catégorie efface).
- **Changer la couleur d'une catégorie** — clic sur la pastille (`<input type="color">`) d'une des 3 catégories → mute `CATS_FERIES[i].couleur`.
- **Changer la catégorie active** — clic sur le nom/carte de la catégorie (hors pastille).
- **"Calculer les fériés"** — remplit `FERIES_ETAT[annee]` avec le résultat de `calculerFeries(annee)` (fusion, écrase les dates déjà peintes qui coïncident).
- **"Effacer"** — confirmation puis `FERIES_ETAT[annee] = {}`.
- **"Enregistrer"** — **NE FAIT RIEN** de réel (juste un toast) — à implémenter réellement côté backend.
- **Navigation année** — `ferieAnnee++`/`ferieAnnee--`.

### 3.10 Undo/Redo
- `defaire()`/`refaire()` (Ctrl+Z/Ctrl+Y ou boutons ↶/↷) — opèrent sur `pileUndo`/`pileRedo` de snapshots `{TACHES,JALONS,NOTES}` (clonage superficiel par item). Voir §4.4.

### 3.11 Réinitialiser
Bouton `#btnReset` : `seedPersonnes(); seedChantiers(); seedStatuts(); seedFormulairesRapides(); seedTout();` (qui remet `idc=1`, `semaineOffset=0`, `appliquerSemaines()`, et réinitialise TACHES/JALONS/NOTES) + `viderSelection()` + vide `pileUndo`/`pileRedo`/`pressePapier`. **NE réinitialise PAS** : `FERIES`, `FERIES_ETAT`, `CATS_FERIES`, `deuxSemaines`, `afficherWeekends`, `replierSectionPersonnel/Intervenants` (préférences de vue, considérées non-données).

### 3.12 Autres actions non-data (préférences de vue, pas de mutation de "données métier")
- Toggle "1 semaine"/"2 semaines" → `deuxSemaines`.
- Toggle "Afficher les week-ends" (page Général) → `afficherWeekends`.
- Replier/déplier sections Personnel/Intervenants → `replierSectionPersonnel`/`replierSectionIntervenants`.
- Navigation semaine (flèches ‹ › du titre planning) → `semaineOffset`.
- Ouverture/fermeture sidebar (`.ouverte`) — état DOM pur, pas de variable JS dédiée.

---

## 4. Mécanismes transversaux

### 4.1 Encodage week-end `giWeekend` et `colonneGrille`/`giVisible`
Voir §1.6 pour le détail complet du schéma numérique. Résumé des points d'implémentation :
- `estGiWeekend(gi) = gi >= 1000` — test de garde omniprésent avant tout calcul de plage contiguë.
- `giWeekend(semaineIdx, jourIdx) = 1000 + semaineIdx*2 + jourIdx`.
- Une case week-end est TOUJOURS traitée comme "isolée" : pas de redimensionnement (poignées désactivées via garde dans `cablerPoigneeRedim`), pas d'extension multi-cases (bloqué dans `cablerAjoutCellule`/`demarrerSelectionRapide`), et une tâche qui s'y dépose voit sa `duree` forcée à 1 (`appliquerCibleUnitaire`).
- `colonneGrille(gi)` place les colonnes week-end APRÈS les 5 colonnes ouvrées de leur semaine respective dans la grille CSS, uniquement si `afficherWeekends===true` (sinon elles n'existent tout simplement pas dans le DOM).
- La teinte de fond `.case-weekend` (`--weekend-bg`) est purement visuelle et indépendante de `FERIES`.

### 4.2 Le moteur de récurrence "Série" — description complète

**Modèle de données** : `serieId` (string, `"serie"+n`) + `serieOrdre` (int, 0-based, rang dans la série) sur chaque item concerné (TACHES/JALONS/NOTES). `null`/`null` pour un item isolé. Tous les items d'une même occurrence de série partagent le même `serieId`.

**Portée d'application** : Tâche/Absence (`ouvrirEdition`), Jalon/Note (`ouvrirEditionPlage`), formulaires "Entrée rapide" personnalisés (`ouvrirFormulaireDynamique`). **PAS** les 3 formulaires historiques dédiés Armature/Béton/Livraison — non étendus (limitation assumée du prototype).

**UI de saisie** (`serieChampsHTML()`, injecté dans les formulaires de CRÉATION uniquement, jamais en modification d'un item existant) :
1. Case à cocher "Série (se répète)" — révèle un bloc `.serie-options`.
2. **Fréquence** : "Tous les [N] [jour(s)/semaine(s)/mois/année(s)]" — un `<input type=number min=1 max=365>` + `<select>` (`freq` ∈ `jour|semaine|mois|annee`, défaut `semaine`, intervalle défaut `1`).
3. **Fin de série** — 2 chips exclusifs : "Nombre de répétitions" (défaut actif, `<input type=number min=2 max=366 value=4>`, "dont celle-ci") ou "Jusqu'à une date" (`<input type=date>`, pré-rempli intelligemment via `majDateDefaut()` : ajoute `JOURS_DEFAUT_PAR_OCCURRENCE[freq] * intervalle * 4` jours à la date de base — table `{jour:3.5, semaine:7, mois:30, annee:365}`).

**Calcul des occurrences** (`calculerGisSerie(giBase, choix)`, `choix = {finType, finValeur, freq, intervalle}`) :
1. `pas = pasPourFrequence(giBase, freq, intervalle)` :
   - `freq==="semaine"` → `pasHebdomadaire(giBase) * intervalle` où `pasHebdomadaire(gi) = estGiWeekend(gi) ? 2 : 5` (avance d'1 semaine dans l'espace gi correspondant).
   - `freq==="jour"` (ou défaut) → simplement `intervalle` (avance directement dans l'espace gi — enchaîne les jours OUVRÉS d'une semaine à l'autre, ex Ven→Lun, ou boucle Sam/Dim en espace week-end).
   - `freq==="mois"|"annee"` → PAS de vrai calcul calendaire répété par occurrence (limitation assumée) : calcule la date cible réelle (`ajouterMois`/`ajouterAnnee` sur `dateReelleDuGi(giBase)`), puis cherche par itération gi-par-gi (dans le même espace, garde-fou 2000 itérations) le premier gi dont la date réelle atteint cette cible, et **réutilise ce même pas fixe pour toute la série** (approximation, pas un recalcul occurrence par occurrence).
2. `nb` = soit `choix.finValeur` clampé `[1,366]` si `finType==="occurrences"`, soit `nbOccurrencesJusqua(giBase, pas, dateFin)` (compte les occurrences dont `dateReelleDuGi` ne dépasse pas `dateFin`, garde-fou 400 itérations) si `finType==="date"`.
3. Retourne `[giBase, giBase+pas, giBase+2*pas, ..., giBase+(nb-1)*pas]`.

**Création** :
- `creerSerieTaches(cibles, giBase, duree, payload, choix)` : pour chaque `gi` du résultat, `creerGroupeTaches(cibles, gi, duree, {...payload, serieId, serieOrdre:i})` (donc encore 1 bulle par ligne cible × par occurrence).
- `creerSeriePlage(liste, kind, giBase, duree, texte, important, choix)` : idem pour Jalons/Notes, 1 item par occurrence.
- Un seul `serieId` neuf (`nouveauSerieId()`) par série créée.

**Modification/suppression d'un item en série — popup 3 choix** (`demanderPorteeSerie(titre, callback)`) :
- Affiche 3 boutons empilés : "Cet élément seul" (unique) / "Cet élément et les suivants" (suivant) / "Toute la série" (serie), + Annuler.
- `itemsDeLaSerie(item, liste, portee)` résout la portée : `unique` → `[item]` ; `suivant` → tous les items du même `serieId` avec `serieOrdre >= item.serieOrdre` ; `serie` → tous les items du `serieId` sans condition d'ordre.
- La modification/suppression est ensuite appliquée à tous les items résolus (boucle `.forEach`).

**Portée assumée (limitation documentée)** : `dateReelleDuGi` utilise `SEMAINES` (la fenêtre actuellement affichée) comme ancre — donc seules les occurrences dans la fenêtre actuellement affichée (1 ou 2 semaines) sont VISIBLES à l'écran ; les occurrences suivantes existent bien dans les données mais n'apparaîtront qu'avec une vraie persistance par semaine (calendrier continu réel) côté backend. **C'est un point de portage crucial : le backend réel doit ancrer `giBase`/la récurrence sur une vraie date calendaire absolue, indépendante de la fenêtre affichée au moment de la création.**

### 4.3 Navigation par semaine (`SEMAINES`, `semaineOffset`, `dateReelleDuGi`, toggle 1/2 semaines)
- `ANCRE_LUNDI_S36 = new Date(2026,7,31)` — point de départ fixe (lundi de la semaine ISO 36, 2026).
- `lundiSemaine(offset)` : `ANCRE_LUNDI_S36 + offset*7 jours`.
- `numeroSemaineISO(d)` : calcul standard ISO 8601 (jeudi de la semaine courante détermine l'année/semaine).
- `semaineOffset` incrémenté/décrémenté par les flèches ‹ › du titre (`.fleche-semaine`, `data-dir="-1"|"1"`), puis `appliquerSemaines(); render();`.
- `libelleJour(offset, jourIdx)` : `{jour: d.getDate(), mois: MOIS_ABBR[...]}` pour affichage "31 août" etc.
- Toggle "1 semaine"/"2 semaines" (`#toggleSem`) : `deuxSemaines = (data-n==="2")`, change `nbJoursAffiches()` (5 ou 10) et le nombre de colonnes de la grille, mais NE change PAS `semaineOffset`.
- **Limitation assumée (répétée à plusieurs endroits, ligne 1044-1050)** : naviguer ne change QUE les libellés numéro/dates affichés en haut et sur les colonnes — les bulles (TACHES/JALONS/NOTES) restent identiques, elles ne "suivent" pas une vraie semaine différente (pas de vraies données par semaine dans ce prototype isolé). C'est le point #1 à corriger structurellement dans le portage réel.
- "Réinitialiser" remet `semaineOffset` à 0.

### 4.4 Repli de section (Personnel/Intervenants)
Ligne diviseur pleine largeur (`ligneSection`, `.section-row`) avec un petit bouton chevron (`.btn-section-toggle`, pivote -90° si replié) — état dans `replierSectionPersonnel`/`replierSectionIntervenants` (bool), PAS réinitialisé par "Réinitialiser" (considéré préférence de vue). Repliée = la fonction `ligneGroupePersonnes(groupe)` correspondante n'est simplement pas appelée (aucune ligne DOM créée).

### 4.5 Undo/Redo
- `sauvegarderUndo()` — À APPELER EN TOUT PREMIER dans chaque fonction de mutation (convention stricte dans le code) : pousse un snapshot `{TACHES: clonerListe(TACHES), JALONS: clonerListe(JALONS), NOTES: clonerListe(NOTES)}` sur `pileUndo` (clonage superficiel par item via `Object.assign({}, x)` — suffisant car aucun champ n'est lui-même un objet imbriqué muté en place), tronque à `LIMITE_UNDO=50` (FIFO shift), vide `pileRedo`.
- `defaire()`/`refaire()` : pop/push entre les 2 piles, `restaurerEtat(snap)` réassigne directement `TACHES=snap.TACHES` etc. (pas de merge), vide la sélection courante, `render()`.
- Portée : **UNIQUEMENT** TACHES/JALONS/NOTES — ne couvre PAS PERSONNES/CHANTIERS/STATUTS/FORMULAIRES_RAPIDES/FERIES_ETAT (les CRUD de ces pages n'appellent jamais `sauvegarderUndo()`... **sauf** exceptions notables : `supprimerPersonne`, `supprimerChantier`, `supprimerStatut` appellent bien `sauvegarderUndo()` avant de muter, mais comme `restaurerEtat` ne restaure QUE TACHES/JALONS/NOTES, annuler après une suppression de personne/chantier/statut restaurerait les tâches supprimées en cascade mais PAS la personne/le chantier/le statut lui-même — **bug latent** du prototype à corriger côté vrai backend, ou au moins à ne pas reproduire).
- Raccourcis clavier globaux : Ctrl+Z (Maj+Z = refaire), Ctrl+Y, Ctrl+X/C/V, Suppr/Retour arrière (supprime sélection), Entrée (valide popup ouvert OU ouvre édition si 1 seule bulle sélectionnée), Échap (ferme popup sans enregistrer, ou vide la sélection). Tous désactivés quand le focus est dans un `<input>`/`<textarea>`/contentEditable, SAUF Échap et Entrée-pour-valider-popup qui marchent toujours (vérifiés avant le garde-fou `dansChamp`).

### 4.6 Persistance — **AUCUNE**
Confirmation explicite après lecture intégrale : **aucun `localStorage`, `sessionStorage`, `fetch`, `XMLHttpRequest`, `IndexedDB` nulle part dans le fichier.** Toutes les données (`PERSONNES`, `CHANTIERS`, `STATUTS`, `TACHES`, `JALONS`, `NOTES`, `FORMULAIRES_RAPIDES`, `FERIES_ETAT`, `CATS_FERIES`, préférences de vue) vivent uniquement en mémoire JS et sont **perdues intégralement à tout rechargement de la page**. Le bouton "Enregistrer" de la page Fériés est un placeholder pur (toast seul, aucune écriture). C'est LE point central du portage : chaque mutation listée au §3 doit être reliée à un vrai appel serveur (Apps Script `google.script.run` ou équivalent) qui persiste dans Google Sheets, et le chargement initial de la page doit lire l'état depuis Sheets au lieu d'appeler les fonctions `seedXxx()`.

---

## 5. Tout ce qui est actuellement FAKE / codé en dur et nécessitera un vrai équivalent backend

| Élément fake/seedé | Où | Équivalent réel nécessaire |
|---|---|---|
| `seedPersonnes()` — 3 personnes fixes | ligne 1083 | Table Sheets "Personnel"/"Intervenants" |
| `seedChantiers()` — 3 chantiers fixes | ligne 1013 | Table Sheets "Chantiers" (existe déjà côté V2, cf. `Planning_Format.gs`/`CHANTIER_PALETTE`) |
| `seedStatuts()` — 4 statuts fixes + `STATUTS_ORDRE` | ligne 1114 | Table Sheets "Statuts" (V2 a `STATUT_ORDER_WEB`/`STATUTS_WEB` en dur dans `WebApp.gs` — même limitation côté V2 actuellement, à généraliser) |
| `seedFormulairesRapides()` — 5 formulaires (3 historiques codés en dur + 2 dynamiques) | ligne 4416 | Table Sheets "Formulaires rapides" + définition de champs (`champsDef`) sérialisée (JSON en cellule, ou sous-table) |
| `seedTout()` — TACHES/JALONS/NOTES de démo | ligne 1496 | Les vraies données de planning provenant des feuilles Sheets existantes (par semaine/date réelle) |
| `FERIES` — 2 entrées fixes ("Ascension" gi=3, "Vacances d'été" gi=7) | ligne 1156 | Devrait fusionner avec / être remplacé par le vrai calendrier `FERIES_ETAT` (voir ligne suivante) — actuellement 2 systèmes disjoints à unifier |
| `FERIES_ETAT`/`CATS_FERIES` — calendrier annuel en mémoire, bouton Enregistrer factice | ligne 4780/4771 | Table Sheets "Fériés" (le vrai V2 a déjà une feuille "Fériés" avec libellé+couleur, mentionnée en commentaire ligne 1147-1155 — à réconcilier) |
| `idc` (compteur global d'ID `"b1","b2"`...) | ligne 1203 | ID réels : ligne de spreadsheet, UUID, ou clé composite stable côté Sheets — jamais un compteur en mémoire remis à 1 |
| `serieIdc` (compteur `"serie1","serie2"`...) | ligne 1271 | Idem — identifiant de série stable et persistant |
| `ANCRE_LUNDI_S36` (ancre de date fixe codée en dur dans le JS) | ligne 1052 | Le vrai calcul de semaine doit être piloté par la date système réelle + une vraie table de semaines/dates persistée (le prototype ancre tout sur une constante figée au 31/08/2026) |
| `dateReelleDuGi` ancré sur `SEMAINES` (fenêtre affichée) plutôt que sur une vraie date absolue par item | ligne 1279 | Chaque TACHE/JALON/NOTE doit porter une vraie date absolue (ou couple date+semaine ISO), pas un `giDebut` relatif à la fenêtre de rendu courante — **c'est LE changement structurel principal du modèle de données pour le portage** |
| `PALETTE_CHANTIERS`/`PALETTE_STATUTS` (8 couleurs pastel codées en dur) | lignes 1024/1124 | Peuvent rester des constantes de config côté script, mais actuellement dupliquées dans le HTML — à externaliser proprement (le commentaire ligne 1021-1023 note explicitement le parallèle avec `CHANTIER_PALETTE` de `Planning_Format.gs` côté V2 réel) |
| Bouton "Enregistrer" (page Fériés) — `toast("Enregistré.")` sans effet | ligne 4926 | Doit réellement écrire `FERIES_ETAT`/`CATS_FERIES` en base |
| "Réinitialiser" — recharge les données seed en mémoire | ligne 3972 | N'a plus de sens tel quel une fois connecté à un vrai backend (à redéfinir : "recharger depuis le serveur" ? à retirer ?) |
| Toute navigation/résolution de secteur (`secteurPersonne`) déduite dynamiquement du flag `sousTraitant` en mémoire | — | Reste valide comme logique, mais la source de vérité doit être la ligne Sheets, pas un tableau JS statique |
| Aucune notion d'utilisateur/permissions/concurrence (single-user implicite, tout mutable localement) | — | Le vrai backend Sheets multi-utilisateur devra gérer les conflits d'édition concurrente, verrouillage, journalisation — totalement absent du prototype |
| Aucune validation serveur (tous les champs texte sont libres, pas de contrôle de cohérence hors JS client) | — | À ajouter côté Apps Script (validation, échappement, limites) |

---

## Annexe — Index rapide des fonctions par domaine (pour navigation dans le fichier source)

- **Setup/constantes/dates** : `seedChantiers` (1013), `couleurProposeeChantier` (1025), `lundiSemaine` (1054), `numeroSemaineISO` (1059), `libelleJour` (1066), `appliquerSemaines` (1071), `seedPersonnes` (1083), `seedStatuts` (1114), `couleurProposeeStatut` (1125), `styleTexteStatutCSS` (1137), `feriePourJour` (1160), `hexToRgba` (1167), `creerAutoDefilement` (1184).
- **Constructeurs d'item / série** : `item` (1204), `itemPlage` (1218), `itemPlageTache` (1231), `creerGroupeTaches` (1244), `nouveauSerieId` (1272), `dateReelleDuGi` (1279), `pasHebdomadaire` (1292), `pasPourFrequence` (1315), `nbOccurrencesJusqua` (1329), `calculerGisSerie` (1338), `creerSerieTaches` (1347), `creerSeriePlage` (1360), `itemsDeLaSerie` (1371), `demanderPorteeSerie` (1383), `serieChampsHTML` (1417), `cablerSerieChamps` (1440).
- **Seed données + undo/redo/clipboard** : `seedTout` (1496), `clonerListe`/`snapshotEtat`/`restaurerEtat` (1533-1535), `sauvegarderUndo` (1536), `defaire` (1542), `refaire` (1550), `majBoutonsUndo` (1563), `copierSelection` (1573), `couperSelection` (1583), `collerPressePapier` (1601).
- **Rendu grille** : `construireLegende` (1678), `nbJoursAffiches` (1695), `secteurPersonne` (1696), `lignesSecteur` (1700), `assignerPistes` (1711), `itemDepuisBulle` (1722), `celluleAPosition`/`poserSurCellule`/`rectanglePlage` (1737-1776), `creerCell`/`creerCelluleFond` (1818/1835), `estGiWeekend`/`giWeekend`/`colonneGrille`/`giVisible` (1860-1881), `construireGrille` (1883), `render` (2107), `bulleEl` (2109).
- **Drag/resize/sélection** : `cablerPoigneeRedim` (2155), `ouvrirBulle`/`resoudreClicBulle` (2249/2253), `onPointerDownGroupeSelection` (2270), `onPointerDownBulle` (2767), `supprimerBulle` (2778), `cablerAjoutCellule` (2848), `demarrerSelectionRapide` (2988), `selectionnerDepuisCellules` (3053), `demarrerDefilementSimple` (3089).
- **Popups génériques** : `demanderConfirmation` (3113), `positionnerPop` (3143), `fermerAuClicExterieur` (3156).
- **Formulaires ajout/édition** : `ajoutRapide` (3183), `boutonsMenuAjout`/`cablerBoutonsMenuAjout` (3203/3213), `ouvrirAjout`/`ouvrirAjoutPlage` (3241/3254), `champChantierHTML`/`champStatutHTML` (3317/3333), `ouvrirFormulaireArmature` (3341), `ouvrirFormulaireBeton` (3424), `ouvrirFormulaireLivraisonArmature` (3507), `ouvrirEdition` (3554), `ouvrirEditionPlage` (3701).
- **Sélection multiple / barre d'action** : `basculerSelection`/`majBarreSelection` (3816/3827), `afficherChoixDeplacerCopier`/`masquerChoixDeplacerCopier` (3842/3854), `quitterModeSelection`/`supprimerSelection` (3867/3874), raccourcis clavier (3921).
- **Personnel/Intervenants CRUD** : `idDepuisNom` (3996), `ouvrirAjoutPersonne` (4005), `ouvrirModifierPersonne` (4033), `supprimerPersonne` (4055), `renderPersonnel`/`renderIntervenants` (4143/4149).
- **Chantiers CRUD** : `ouvrirAjoutChantier` (4176), `ouvrirModifierChantier` (4197), `supprimerChantier` (4219), `renderChantiers` (4230).
- **Statuts CRUD** : `editeurTexteStatutHTML`/`cablerEditeurTexteStatut` (4265/4282), `ouvrirAjoutStatut` (4322), `ouvrirModifierStatut` (4351), `supprimerStatut` (4378), `renderStatuts` (4390).
- **Formulaires rapides CRUD** : `seedFormulairesRapides` (4416), `champsResumeAffiche`/`renderFormulaires` (4448/4456), constructeur de champs (4515-4600), `ouvrirEditeurFormulaire` (4618), `ouvrirFormulaireDynamique` (4663).
- **Fériés** : `calculerFeries` (4816), `renderFerieCategories` (4845), `renderFerieCalendrier` (4869), `renderFeries` (4906).
