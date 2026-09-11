# Inventaire du backend V2 — référence pour le portage V3

Sources lues intégralement : `Planning_Format.gs` (2111 lignes), `WebApp.gs` (1646
lignes), `Index.html` (2693 lignes, uniquement pour le câblage client). Complété par
`architecture-donnees-v3.md` (réponse déjà donnée à Lionel sur les données) et un
sondage ciblé de `planning-status.md` (changelog) et `V3-spec.md`/`prototype-bulles.html`
(pour cadrer la section 5).

Le script est **bound** (lié) au Google Sheet "Planning 2026" — deux fichiers `.gs`
(`Planning_Format.gs` = formatage/menu, historique, autonome ; `WebApp.gs` = additif,
réutilise les fonctions du premier) + `Index.html` (webapp actuelle, à remplacer par V3).
Déployé via Extensions > Apps Script > Déployer > Application Web (`doGet`).

---

## 1. Sheet structure & conventions

### Feuille "Planning" (CONFIG.NOM_FEUILLE)

**Colonnes** — blocs de 8 colonnes par semaine, répétés horizontalement :
- Col 1, 9, 17, 25, 33… = colonne **label** (`isLabelCol(c) ⇔ (c-1) % 8 === 0`).
- Les 7 colonnes suivantes = les 7 jours de la semaine : **5 jours ouvrés (Lun-Ven) + 2
  colonnes week-end (Sam, Dim)**, dans cet ordre, contiguës. `semaineDepuisLabel()` :
  `semS = labG+1`, `semE = min(labG+7, lc)`.
- Largeur : colonne label = `LARGEUR_LABEL_DATE` (40px) ; jour ouvré =
  `LARGEUR_DATE` (200px) ; colonne week-end = `LARGEUR_WEEKEND` (20px, très étroite).
- Les 2 colonnes week-end de chaque bloc "personne" sont **fusionnées** en une seule
  cellule 2×4 (`fusionnerWeekends`) — une seule valeur pour tout le bloc, saisie
  possible mais **sans liste déroulante Chantier** (`appliquerValidationChantier`
  exclut explicitement `colMap[c].we`) et sans distinction Sam/Dim dans la donnée
  (une seule cellule couvre les deux jours). Fond gris foncé (`GRIS_FONCE_WE`,
  `#999999`) toujours, quel que soit le contenu.

**Lignes** (fixes, `PREMIERE_LIGNE_PERSO = 6`) :
- Lignes 1-3 : en-tête — 1 = Mois, 2 = Sem (n° de semaine, cellule fusionnée sur les 7
  jours), 3 = Date (objet `Date` par jour, `dd`). Ne jamais modifier après création.
- Ligne 4 : **jalons** du planning d'architecte — texte libre par jour, fond gris clair
  (`GRIS_JALONS #d9d9d9`), **toujours imprimée même vide**. Le nom d'un jour férié n'y
  est plus écrit : il est en commentaire (note) sur la cellule de date (ligne 3), et
  le jour se repère par la couleur de sa colonne (feuille "Fériés").
- Ligne 5 : **notes** libres (`CONFIG.LIGNE_NOTES = 5`), fond jaune pâle
  (`JAUNE_NOTES #fff2cc`). Contrairement à la ligne 4, **omise à l'impression si
  entièrement vide** cette semaine-là. (Historique : cette ligne a été ajoutée par
  migration — `migrerLigneNotes()` — sur un planning "ancien" qui n'avait que 4 lignes
  d'en-tête ; `ligneNotesAMigrer()` détecte l'état pré-migration.)
- Ligne 6+ : **personnel/sous-traitants**, blocs de **4 lignes par personne**
  (`LIGNES_PAR_PERSONNE = 4`) = 2 demi-journées × (ligne "Chantier" + ligne détail) :
  - offset 0 : Chantier matin — hauteur compacte 15px (`HAUTEUR_LIGNE_CHANTIER`), fond =
    couleur du chantier saisi (recherchée dans "Chantier").
  - offset 1 : Détail matin — hauteur normale 30px (`HAUTEUR_LIGNE_DEFAUT`).
  - offset 2 : Chantier après-midi — indépendant du matin (chantier différent possible).
  - offset 3 : Détail après-midi.
  - La colonne label (col 1 pour repère global, ou colonne de la semaine affichée pour
    un remplacement ponctuel) porte le **nom**, fusionné verticalement sur les 4 lignes.
  - Bloc "vide" = nom vide en colonne 1 : reste détecté comme emplacement libre
    réutilisable (par `apiAjouterPersonne`/`ajouterPersonnel`), toute mise en forme
    spéciale y disparaît, mais bordures + hauteurs restent identiques à un bloc occupé
    (pour rester remplissable à la main sur une feuille imprimée).

**Détection des personnes** (`detecterPersonnes(sh, fr, lr)`) : lit la colonne A une
seule fois ; si des `getMergedRanges()` existent, chaque fusion = une personne (bornes
= la fusion elle-même) et les intervalles non couverts sont découpés en blocs de 4
lignes ; sinon (feuille jamais fusionnée), découpage pur en blocs de 4 depuis `fr`.
Retourne `[{nom, startRow, endRow}]`. `startRow` = **l'"ancre"** utilisée partout
côté API (`apiEnregistrerCellulePersonne`, `apiRenommerPersonne`, etc.) pour identifier
une ligne de façon stable même après insertion/suppression de lignes ailleurs.

**`PREMIERE_LIGNE_SOUS_TRAITANT = 22`** (WebApp.gs, "LE SEUL RÉGLAGE À CONNAÎTRE") —
convention de **position** : tout bloc dont `startRow >= 22` est un sous-traitant,
tout ce qui est au-dessus est du personnel. Avec 4 lignes/personne à partir de la
ligne 6, ça correspond à la **5ᵉ personne** (les 4 premières lignes = personnel). Rien
n'est physiquement écrit pour marquer la section — c'est une pure convention de
seuil, fragile si le personnel est modifié directement dans Sheets (il faudrait
ajuster cette constante à la main, cf. commentaire du code). Deux marqueurs texte
existent pour les cas limites où la position mentirait (`🔧 ` = sous-traitant forcé,
`👷 ` = personnel forcé) — cf. section 2.

### Feuille "Chantier" (CONFIG.FEUILLE_CHANTIER)

- Col A (`CHANTIER_COL_NOM`) = nom du chantier.
- Col B (`CHANTIER_COL_COULEUR`) = **jamais un code texte** — uniquement le **fond**
  (background) de la cellule qui fait foi ; la valeur textuelle est systématiquement
  vidée (`setValue("")`) après coloration, pour ne jamais laisser un hexa périmé.
  La couleur est choisie automatiquement (palette `CHANTIER_PALETTE`, 20 teintes,
  round-robin sur les couleurs déjà utilisées) dès qu'un nom est saisi dans une case
  encore blanche, via `onEditChantier` — jamais écrasée si déjà colorée (auto ou
  choisie à la main au pot de peinture).
- `CHANTIER_HEADER_ROWS = 1` (1 ligne d'en-tête).
- Une liste déroulante de validation sur chaque ligne "Chantier" du Planning pointe
  vers `Chantier!A2:A501` (plage dynamique, 500 lignes).

### Feuille "Fériés" (CONFIG.FEUILLE_FERIES)

- Col A = libellé (texte libre : "Noël", "Vacances été", "Pont fête dieu"…).
- Col B = date (objet `Date`, ou texte `jj/mm/aaaa` en repli).
- Col C = catégorie visuelle libre ajoutée par Lionel (Compensés / Fériés / Vacances)
  — **purement décorative, jamais lue par le code**.
- La **couleur de fond de la cellule A** (le libellé) est la couleur d'affichage/
  impression de ce jour dans le Planning (`lireFeries()` lit `getBackgrounds()` sur
  la colonne A) — blanc/vide = pas de couleur spéciale.
- Clé de recherche : `fmtDK(d) = "j/m/aaaa"` (sans zéro-padding), pas de format ISO.
- **Toutes les lignes sont traitées à l'identique** qu'il s'agisse d'un jour férié
  officiel ou d'une semaine de vacances d'entreprise — aucune distinction de
  catégorie dans le code, et cette donnée ne sert **que** de couleur d'affichage/
  impression : pas d'avertissement de saisie, pas d'exclusion du calcul "jours
  ouvrables" du décalage en masse (qui ne saute que les vrais week-ends).

### Feuille "Récurrences" (créée à la volée par `feuilleRecurrences_()`, WebApp.gs)

Colonnes fixes (créées avec en-tête au premier besoin) :
1. ID (texte, `"r" + timestamp`)
2. Actif (bool)
3. Type (`"jalon" | "note" | "personne"`)
4. Jour (0=lundi..4=vendredi)
5. Ligne personne (= l'ancre `startRow`, vide pour jalon/note)
6. Demi-journée (`"matin" | "aprem" | "journee"`, vide pour jalon/note)
7. Texte
8. Repère (libellé lisible : nom de la personne, ou "Jalon"/"Note")

Une récurrence hebdomadaire **fixe** ne porte qu'un texte sur un jour de semaine
donné ; appliquée automatiquement à chaque nouvelle semaine créée
(`creerSemaineWeb_`) et, à l'enregistrement, à la semaine affichée + toutes celles à
venir (jamais les passées). C'est **le seul mécanisme de récurrence qui existe** —
purement hebdomadaire, sans notion d'intervalle configurable ni de fin.

### Feuille "📱 Imprimer" (CONFIG.FEUILLE_MOBILE)

Feuille utilitaire (créée par `assurerFeuilleMobile`) : une cellule de saisie
(ligne 4, col 2) où taper un n° de semaine déclenche impression + export PDF via un
trigger installable dédié (`onEditMobile`, séparé du `onEdit` simple car il a besoin
de Drive). Ligne 7 col 1 = statut/horodatage du dernier essai. Sans rapport avec
l'API web (`WebApp.gs`) — mécanisme parallèle pour l'app Sheets mobile qui n'affiche
pas les menus personnalisés.

### Feuilles d'impression jetables "📋 S\<n\>"

Générées par `imprimerSemaine()`, une par semaine imprimée, supprimées automatiquement
après un export PDF réussi (sinon laissées pour impression/export manuel). Toutes les
couleurs y sont **recalculées depuis les valeurs brutes** au moment de l'impression
(jamais copiées depuis la vraie feuille) — cf. section 2.

---

## 2. Data encoding conventions in cell text

Tout est encodé en texte dans les cellules — aucune structure de données annexe pour
le contenu des cases elles-mêmes (hormis "Chantier"/"Fériés"/"Récurrences" ci-dessus).

### Tirets (`tirets()`, Planning_Format.gs)

Chaque ligne non vide d'une case détail reçoit un préfixe `"- "` si elle n'en a pas
déjà un — appliqué par `onEditPlanning`/`reformaterZone` à la saisie manuelle dans
Sheets, et explicitement par `apiEnregistrerCellulePersonne` côté webapp (la valeur
écrite doit être définitive puisqu'elle est relue et renvoyée au client). Toute
fonction qui doit reconnaître une ligne existante doit donc **tolérer un tiret
optionnel en tête** — `decoderLigneTache_`, `lignesDe_()` le retirent avant
comparaison (`replace(/^-\s+/, "")`).

### Statut sous-traitant (préfixe crochet en tête de ligne)

`STATUT_ORDER_WEB = ["areserver","reserve","confirme","annule"]`,
`STATUTS_WEB = {areserver:"À réserver", reserve:"Réservé", confirme:"Confirmé", annule:"Annulé"}`
— codé en dur dans `WebApp.gs` (et dupliqué à l'identique côté client dans
`Index.html`, `STATUT_ORDER`/`STATUTS`). Encodage : `"[Confirmé] " + texte`. Pertinent
uniquement pour les sous-traitants (mais rien n'empêche techniquement de le poser sur
une ligne personnel — juste jamais fait par l'UI actuelle).

### Tag `[Important]`

Marque une ligne (tâche OU note) à afficher en rouge — personnel ET sous-traitant.
Reconnu par `couleurTexteDetail()` (case entière, ancienne règle "1 statut par case",
toujours utilisée pour la VRAIE feuille Planning puisqu'elle n'est plus repeinte à
la saisie) et, séparément, par `preparerLignesImpression_()`/`retirerTagImportant_()`
qui recalculent le rouge **ligne par ligne** au moment de l'impression (le tag
`[Important]` est retiré du texte affiché à l'impression — il ne pilote que la
couleur). Le mot "urgent" déclenche la même couleur rouge sans tag explicite
(test textuel `important|urgent`, insensible à la casse).

### Un ou plusieurs crochets en tête, dans n'importe quel ordre

`decoderLigneTache_(ligne)` consomme des crochets `[...]` en boucle en tête de ligne :
chacun est soit `[Important]` (met `important=true`), soit un statut connu (met
`statut=...`), soit **inconnu** — dans ce dernier cas la boucle s'arrête et le texte
restant (crochet inconnu compris) est conservé tel quel, jamais d'erreur/perte.
`encoderTaches_` réécrit toujours dans l'ordre `[Statut] [Important] texte`, mais le
décodeur accepte les deux ordres (une ligne ressaisie à la main reste reconnue).

### Multi-tâches par case (`decoderTaches_`/`encoderTaches_`)

Une case détail peut contenir **plusieurs tâches indépendantes**, une par ligne non
vide, chacune avec son propre `{texte, statut, important}`. `decoderTaches_(brut)` :
split sur `\n`, trim, filtre les lignes vides, décode chacune. `encoderTaches_(taches)`
: filtre les tâches à texte vide, préfixe `[Statut] `/`[Important] ` si présents,
rejoint par `\n`. C'est la structure renvoyée au client dans
`personne[demi][jour].taches`.

### Multi-notes par jour (`decoderNotesJour_`/`encoderNotesJour_`)

Même principe pour la ligne "notes" (ligne 5) : une case peut contenir plusieurs
notes indépendantes par jour, chacune `{texte, important}` (pas de notion de statut
pour une note). Réutilise `decoderTaches_`/`encoderTaches_` en ne gardant que
`{texte, important}`.

### Marqueurs de section sur le nom (`🔧 ` / `👷 `)

`MARQUEUR_SOUS_TRAITANT = "🔧 "`, `MARQUEUR_PERSONNEL = "👷 "` — préfixes sur le nom
en colonne label, utilisés **uniquement dans les cas limites** où la position de la
ligne (au-dessus/en dessous de `PREMIERE_LIGNE_SOUS_TRAITANT`) contredirait la
section voulue (ex. sous-traitant ajouté depuis l'appli sur une ligne libre
au-dessus du seuil). `decoderNom_(brut, startRow)` : marqueur explicite prioritaire,
sinon déduit de la position. `encoderNom_(nom, sousTraitant, startRow)` : n'écrit le
marqueur que si la position seule dirait le contraire — dans le cas normal, rien
n'est ajouté au nom.

### Détection d'absence (`estAbsence`)

`vl.indexOf("absent") !== -1 || "congé"/"conge" !== -1 || "vacances" !== -1` (texte
déjà en minuscules). Utilisée pour : colorer la ligne "Chantier" en orange
(`ORANGE_CLAIR_3`) même si un chantier y est saisi ; **sauter** la case dans
l'assignation groupée (`apiAttribuerChantierGroupe`, ne jamais écraser une absence).
Dupliquée à l'identique côté client (`Index.html`, `estAbsence()`) — commentaire
explicite : les deux DOIVENT rester alignées. Pas de notion de "maladie" séparée
malgré `TEXTES_RAPIDES` client qui propose "Maladie" comme texte rapide — un texte
"Maladie" ne déclenche PAS `estAbsence()` (aucune des 3 sous-chaînes n'y est
contenue), donc n'a pas le fond orange automatique. **Piège potentiel pour V3** si le
prototype suppose "Maladie" = absence.

### Cases week-end

Une seule cellule fusionnée par bloc "personne" pour les 2 colonnes Sam+Dim — texte
libre, pas de décodage tâches/statut particulier côté serveur (le code de lecture
`apiChargerSemaine`/`chargerSemaine_` s'arrête d'ailleurs à `jj <= 5`, c'est-à-dire
**ne lit jamais les colonnes week-end du tout** — cf. section 5).

---

## 3. Every apiXxx function in WebApp.gs

Toutes protégées par `avecVerrou_(fn)` (LockService, 15s de timeout) sauf les lectures
pures. Motif récurrent : chaque écriture renvoie `{ok, ..., semaine: <ré-lecture
fraîche>}` pour que le client n'ait jamais besoin d'un 2ᵉ aller-retour
(`apiChargerSemaine`/`chargerSemaine_`).

- **`apiListerChantiers()`** *(lecture)* — Lit "Chantier" : `[{nom, couleur, ligne}]`.
  `couleur` = fond de la cellule B (repli `#e5e5e5` si blanc/vide) ; `ligne` = ligne
  réelle, réutilisée pour réécrire ensuite.

- **`apiEnregistrerChantiers(modifs, nouveau, labGCourant)`** — `modifs =
  [{ligne, couleur}]` (recolore des chantiers existants), `nouveau = {nom, couleur?}`
  (optionnel, ajoute un chantier — erreur si le nom existe déjà, insensible
  casse/espaces). Répercute sur le Planning via `recolorerChantiers()` si quelque
  chose a changé. Retourne `{ok, chantiers, semaine}` (recharge la semaine affichée).

- **`apiChargerSemaine(labG)`** *(lecture)* — Point d'entrée public de
  `chargerSemaine_()` (ci-dessous). Recalcule `detecterPersonnes` à chaque appel (donc
  toujours à jour si la structure a changé).

- **`chargerSemaine_(sh, labG, lc, lr, pers)`** *(interne, réutilisée partout)* — Cœur
  de lecture : lit lignes 2-5 (numéro, dates, jalons, notes) + toute la zone
  personnel en 2 appels Sheets. Retourne :
  ```
  { labG, numero, dates:[jj×5], mois:[abr×5], isoDates:[iso×5],
    jalons:[texte×5],
    notes:[ [{texte,important}], ×5 ],   // decoderNotesJour_ par jour
    personnes: [
      { ancre, nom, sousTraitant,
        matin: [ {chantier, taches:[{texte,statut,important}]} ×5 ],
        aprem: [ ... ×5 ] }
    ] }
  ```
  **N'inclut jamais les colonnes week-end** (boucle `jj <= 5` uniquement, jours 1-5).
  Une personne dont le nom est vide CETTE semaine précisément est omise du tableau
  (mais reste dans `pers` structurellement).

- **`apiDemarrer()`** — Point d'entrée unique de démarrage de l'appli (remplace 3
  anciens appels). Sous verrou : appelle `assurerSemainesAvance_()` (crée
  automatiquement jusqu'à `SEMAINES_AVANCE=5` semaines futures, plafonné à
  `MAX_CREATIONS_PAR_OUVERTURE=6` par ouverture). Retourne `{semaines, aujourdhui,
  index, chantiers, palette, semaine, creation}` — `index` = position de la semaine
  d'aujourd'hui (ou la plus proche), `palette` = `CHANTIER_PALETTE` complète (pour
  proposer une couleur à un nouveau chantier), `creation` = `{creees, numeros,
  incomplet}` ou `{creees:0, erreur}` en cas d'échec silencieux.

- **`apiEnregistrerJalonNote(labG, kind, jourIdx, texte)`** — Écrit une case brute
  (ligne 4 ou 5) pour UN jour. `kind ∈ {"jalon","note"}`, `jourIdx ∈ [0,4]`. Pas de
  décodage/encodage tâches ici (jalon = texte brut trim ; **note = texte brut aussi**,
  contrairement à `apiEnregistrerPlage` qui encode en entrées multiples — incohérence
  db à connaître si V3 doit unifier les deux chemins d'écriture de note).

- **`apiEnregistrerPlage(kind, isoDebut, isoFin, texte, labGCourant, origine, mode,
  important)`** — Pose le même texte sur tous les jours ouvrés d'une plage de dates
  (peut traverser plusieurs semaines). `mode: "ajout"` (complète sans écraser, bouton
  "+") vs `"remplacement"` (modifie une plage existante — `origine = {debut, fin,
  texte, important}` décrit l'état AVANT, sert à libérer les jours sortis de la
  plage raccourcie). Pour les notes : ajoute/retire des **entrées individuelles**
  (`decoderNotesJour_`/comparaison par texte), jamais la case entière. Pour les
  jalons : comportement historique, case entière comparée/écrasée. `important`
  s'applique seulement aux notes. Retourne `{ok, jours, remplaces, liberes, ajoutes,
  semaine}`.

- **`apiRenommerPersonne(labG, ancre, nom, sousTraitant, portee)`** — `portee:
  "semaine"` (seule la colonne de la semaine affichée) ou `"suivantes"` (semaine
  affichée + toutes celles d'après, jamais les passées). Écrit via `parLots`+
  `RangeList` en un seul appel groupé sur toutes les colonnes cibles. Recalcule la
  colonne 1 si elle était vide (garde le repère "occupé" pour le formatage).
  Reformate le bloc (`reformaterZone`). Retourne `{ok, semaines: n, semaine}`.

- **`apiEnregistrerCellulePersonne(labG, ancre, demi, jourIdx, payload)`** — Écriture
  d'UNE case (chantier + tâches) pour une personne. `payload = {chantier, taches}`.
  `ancre` **revalidée** contre l'état frais de la feuille (`trouverBloc_`, jamais fait
  confiance à ce que le client affichait). Applique `tirets()` + `encoderTaches_()`
  avant écriture. **Aucune peinture de couleur** (cf. `ecrireDemiJournee_` : 1 seul
  appel `setValues`, plus de repeinte à chaque saisie depuis fin août 2026 — les
  couleurs de la vraie feuille peuvent donc rester "en retard" jusqu'à la prochaine
  création de semaine ou passage du menu 🎨/🔧 desktop ; assumé et communiqué à
  Lionel). Retourne `{ok, semaine}`.

- **`apiApercuDecalage(labG, jourIdx, portee, ancre, sens, nJours)`** /
  **`apiAppliquerDecalage(labG, jourIdx, portee, ancre, sens, nJours, resolutions)`**
  — Décalage en masse ("décaler le planning de X jours ouvrables"). `portee:
  "ligne"|"tous"`, `sens: "avancer"|"reculer"`. Les deux passent par
  `calculerPlanDecalage_()` (jamais dupliqué, pour ne jamais diverger) qui construit
  la liste ordonnée des colonnes "jour ouvré" (jours fériés inclus, week-ends
  exclus) et calcule `{simples, conflits, impossibles, enAttente}` :
  - `simples` : case destination vide, déplacée directement.
  - `conflits` : case destination occupée — `resolutions[id] ∈
    {"ecraser","ajouter"}`, défaut = ne rien faire.
  - `impossibles` : reculerait avant aujourd'hui.
  - `enAttente` : dépasse la dernière semaine existante → crée jusqu'à 10 semaines
    au besoin (`creerSemaineWeb_`), sinon erreur explicite.
  L'aperçu ne modifie rien ; l'application recalcule tout depuis zéro (jamais
  confiance dans l'état de l'aperçu, la feuille a pu changer entre-temps).
  Retourne `{ok, deplaces, ecrases, ajoutes, ignores, semaine}`.

- **`apiAjouterPersonne(labG, nom, sousTraitant)`** — Scopé à la semaine affichée
  (cf. note d'en-tête du fichier) : réutilise un emplacement libre du bon côté du
  seuil sous-traitant si disponible (reformatage ciblé seulement, rapide), sinon crée
  un nouveau bloc de 4 lignes visible sur **toutes** les semaines (nom posé en col.1)
  — juste avant le premier sous-traitant pour du personnel, tout en bas pour un
  sous-traitant — et relance `formaterPlanning(true)` complet (plus lent, cas rare).
  Retourne `{ok, ancre, reutilise, semaine}`.

- **`apiSupprimerPersonne(labG, ancre, portee)`** — **Vide, ne supprime jamais la
  ligne**. `portee: "semaine"|"suivantes"`. Vide colonne(s) label + 4 lignes ×
  largeur. Si `labG===1`, redevient un emplacement libre réutilisable
  (`bloc.nom=""`). Retourne `{ok, semaines, semaine}`.

- **`apiAttribuerChantierGroupe(labG, chantier, jours)`** — Assigne un chantier à
  **tout le personnel** (jamais les sous-traitants — exclusion explicite via
  `decoderNom_(...).sousTraitant`) pour un ou plusieurs jours (0-4), matin ET
  après-midi. Saute toute case déjà en absence (`estAbsence`). N'écrit QUE la ligne
  "Chantier" (jamais le détail). Tout lu/modifié/réécrit en mémoire en 2 appels
  Sheets pour toute la zone. Retourne `{ok, personnes, cellules, semaine}`.

- **`apiGenererPdf(labG)`** — Appelle `imprimerSemaine(labG)` (Planning_Format.gs) —
  même résultat que le menu desktop. Retourne `{ok, feuille, pdf, supprimee}`.

- **`apiListerRecurrences()`** *(lecture)* — Toutes les lignes de "Récurrences"
  décodées, filtrées sur `id !== ""`.

- **`apiEnregistrerRecurrence(rec, labGCourant)`** — `rec = {id?, type, jour, texte,
  ancre?, demi?, nomPersonne?}`. Crée ou met à jour la ligne (par `id`). Applique
  IMMÉDIATEMENT (`appliquerRecurrenceDepuis_`) à la semaine affichée + toutes les
  suivantes. Retourne `{ok, jours, recurrences, semaine}`.

- **`apiBasculerRecurrence(id, actif, labGCourant)`** — Active/désactive SANS
  retoucher ce qui est déjà posé (arrête seulement les applications futures).

- **`apiSupprimerRecurrence(id, labGCourant)`** — Supprime la règle ET retire, sur la
  semaine affichée + suivantes, le texte qu'elle avait posé — **seulement s'il est
  encore identique** à ce qu'elle avait écrit (une case modifiée depuis n'est jamais
  touchée). Retourne `{ok, jours, recurrences, semaine}`.

### Exposées côté Planning_Format.gs, réutilisées par la webapp

- **`apiListerSemaines()`** — Toutes les semaines `{labG, num, debut, fin}` (dates
  ISO), + présélection de la semaine active (dialogue desktop uniquement) — WebApp.gs
  n'appelle jamais celle-ci directement pour l'appli mobile (son propre calcul
  `apiDemarrer`/`indexSemaineDuJour_` s'en charge), mais reste dans le même projet et
  potentiellement réutilisable pour V3.
- **`apiImprimerSemaine(labG)`** = `imprimerSemaine(labG)` — dialogue desktop.

### Helpers partagés (Planning_Format.gs) utilisés par WebApp.gs

- **`detecterPersonnes(sh, fr, lr)`** — cf. section 1, structure de base réutilisée
  par presque toutes les fonctions api*.
- **`reformaterZone(sheet, startRow, startCol, numRows, numCols, lastCol, lastRow,
  persConnues?)`** — reformate en mémoire les blocs "personne" touchés par une
  modification (couleurs, bordures, fusions, largeurs de colonne concernées),
  strictement la même logique que le formatage complet.
- **`formaterPlanning(sil)`** — reformatage complet de toute la feuille (coûteux,
  utilisé seulement à la création de semaine ou l'ajout d'un tout nouveau bloc).
- **`tirets(v)`** — cf. section 2.
- **`estAbsence(vl)`** — cf. section 2.
- **`calcFondChantier(val, isWE, couleursChantier, vlDetail)`** — couleur de fond
  d'une ligne "Chantier" : gris WE > orange absence > couleur du chantier (recherche
  insensible casse/espaces dans `couleursChantier`) > blanc.
- **`couleurTexteDetail(vl)`** — rouge si "important"/"urgent" dans le texte (case
  entière — règle utilisée pour la VRAIE feuille, distincte du recalcul ligne-par-
  ligne à l'impression).
- **`lireFeries(ss)`** — cf. section 1, retourne `{ "j/m/aaaa": {label, couleur} }`.
- **`lireCouleursChantier(ss)`** — cf. section 1, retourne `{ nomMinuscule: hexa }`.
- **`imprimerSemaine(labGForce?, tenterPdf=true)`** — génère la feuille imprimable +
  export PDF Drive (`Boulot/plannings/Planning sem. <n>_<année>.pdf`, remplace un
  export existant), supprime l'onglet si l'export réussit.
- **`construireCarteColonnes(sheet, lc, feries?)`** — carte indexée par colonne
  `{we, date, ferie}`, lue une seule fois pour toute la largeur utile.
- **`isLabelCol(col)`, `isoJour(d)`, `fmtDK(d)`, `semaineDepuisLabel`,
  `listerSemainesPlanning`** — utilitaires structurels/format de date partagés.
- **`appliquerHauteursBloc`, `appliquerValidationChantier`, `bordBloc`,
  `fusionnerNomsColonne`, `fusionnerWeekends`** — mise en forme bas niveau, invoqués
  ponctuellement par les fonctions api* qui modifient la structure
  (`apiAjouterPersonne`) plutôt qu'un simple contenu de case.
- **`CHANTIER_PALETTE`** (var globale, 20 couleurs) et **`pickNextColorChantier`,
  `getUsedColorsChantier`** — attribution automatique de couleur à un nouveau
  chantier, réutilisés par `apiEnregistrerChantiers`.

### Caching / mémoisation

- **`_memoFeries` / `feriesMemo_(ss)`** — mémoïse `lireFeries()` **le temps d'une
  seule requête** google.script.run (chaque appel repart d'un contexte JS neuf côté
  Apps Script — pas de rémanence entre requêtes). Utilisé uniquement dans
  `calculerPlanDecalage_` (seule fonction qui relit les jours fériés plusieurs fois
  dans le même appel, à cause de la boucle de création de semaines).
- Pas d'équivalent pour les couleurs de chantier côté WebApp.gs — supprimé
  volontairement (commentaire explicite) car plus rien ne peint la feuille au fil de
  l'eau depuis fin août 2026 (`ecrireDemiJournee_` ne fait plus qu'un `setValues`).
- **Pattern "réponse = écriture + relecture fraîche"** : chaque `apiXxx` d'écriture
  se termine par `semaine: apiChargerSemaine(labG)` ou
  `chargerSemaine_(sh, labG, lc, lr, pers)` (variante qui réutilise `pers` déjà en
  main pour épargner 3 appels Sheets — valable uniquement si aucune ligne n'a été
  insérée/décalée par cette écriture).
- **Verrou global** `avecVerrou_()` (LockService, `waitLock(15000)`) sur toute
  écriture — sérialise les accès concurrents (plusieurs personnes sur l'appli en
  même temps).

---

## 4. Client-side wiring pattern (Index.html)

### Appel serveur générique

```js
function gs(fn, args, onOk, onErr) {
  google.script.run
    .withSuccessHandler(onOk)
    .withFailureHandler(onErr || erreurFatale)
    [fn].apply(null, args || []);
}
```
`erreurFatale(err)` par défaut remplace `#app` par un écran d'erreur avec bouton
"Réessayer" (relance `demarrer()`). Chaque appel d'écriture passe son propre `onErr`
(généralement un `showToast("Échec : " + err.message)`, sans reset de l'UI).

### Barre de progression (`#progress`, hors de `#app`)

`occupe(true/false)` incrémente/décrémente un compteur `occupations` et bascule la
classe CSS `.on` sur `#progress` — fine barre en haut d'écran, jamais un écran de
chargement plein, pour les allers-retours qui n'ont pas besoin de remplacer la vue
(ex. revalidation silencieuse du cache).

### Cache client + fraîcheur (`etat.cache`, `etat.cacheTs`, `FRAICHEUR_MS = 90_000`)

- `etat.cache[labG]` = dernière semaine reçue pour cette colonne label ; `cacheTs`
  l'horodatage de réception.
- `chargerSemaineActive(force?)` : si en cache et pas `force`, affichage **instantané
  sans appel serveur** ; si l'âge dépasse `FRAICHEUR_MS`, revalidation silencieuse en
  arrière-plan (`occupe(true)`, `apiChargerSemaine`, re-rendu seulement si
  `JSON.stringify(data) !== JSON.stringify(enCache)` diffère réellement).
- **Pattern "la réponse d'écriture EST la revalidation"** : `apresEcriture(data,
  portee)` applique directement la semaine renvoyée par le serveur (jamais un 2ᵉ
  aller-retour) et invalide le cache selon la portée de l'effet de bord :
  - `"semaine"` (défaut) : rien d'autre invalidé.
  - `"suivantes"` : `oublierCache(data.labG)` — vide le cache pour cette colonne et
    toutes celles à droite (récurrences, renommage/suppression "suivantes").
  - `"tout"` : `oublierCache()` sans argument — vide tout le cache (une insertion de
    lignes décale les ancres de TOUTES les semaines, y compris passées).

### Toast (`#toast`, hors de `#app`)

`#toast` et `#progress` vivent dans le HTML statique du `<body>`, **jamais recréés**
par `render()`/`afficherChargement()` — contrairement à `#app`, entièrement
réécrit en `innerHTML` à chaque rendu. `showToast(msg)` : `textContent` + classe
`.show` 3.6s. Piège documenté dans `planning-status.md` : un toast déclenché juste
avant un rechargement de semaine doit survivre au remplacement de `#app` — d'où son
emplacement hors de ce conteneur.

### Démarrage

Un seul appel `apiDemarrer()` au chargement (remplace 3 anciens allers-retours) :
peuple `etat.semaines/aujourdhui/chantiers/chantierParNom/palette`, vide le cache,
applique la semaine reçue (`appliquerSemaine`), annonce les créations automatiques de
semaines s'il y en a eu (`showToast`).

### Échappement HTML

`esc(s)` échappe systématiquement tout texte injecté en `innerHTML` (les textes
viennent de saisies libres dans la vraie feuille).

---

## 5. What does NOT exist yet in this backend

Cette section est la synthèse la plus importante pour cadrer le travail à venir.
Confirmé à la fois par relecture du code et par `architecture-donnees-v3.md`
(réponse déjà donnée à Lionel le 29.08.2026 sur ce sujet précis).

### 5.1 Pas de feuille "Statuts"

La liste des statuts sous-traitant (`STATUT_ORDER_WEB`/`STATUTS_WEB` côté
`WebApp.gs`, dupliquée à l'identique côté `Index.html` en `STATUT_ORDER`/`STATUTS`)
est **codée en dur, à deux endroits qui doivent être maintenus manuellement en
synchronisation**. Aucune feuille de config, aucune fonction `apiListerStatuts`.
Lionel ne peut aujourd'hui ni renommer, ni réordonner, ni ajouter/retirer un statut
sans passer par une session Claude qui édite le code des deux fichiers. C'est un
"vrai trou" explicitement identifié dans `architecture-donnees-v3.md`.

### 5.2 Pas de feuille "Textes rapides" — `TEXTES_METIER` codé en dur côté client

`TEXTES_METIER` (tableau `{titre, motsCles[], textes[]}`) et `TEXTES_RAPIDES`
(absences génériques) vivent entièrement dans `Index.html` (lignes ~622-647), câblés
sur une correspondance de mots-clés dans le **nom** de la personne
(`metierDe(nom)`, comparaison sans accents). Aucun équivalent serveur. Pour ajouter
un métier ou une proposition de texte, il faut recopier un bloc JS dans le code
source et redéployer — pas de self-service pour Lionel.

### 5.3 Pas de vraie "récurrence en série" (au sens calendrier) — seulement une
récurrence hebdomadaire fixe

La feuille "Récurrences" (section 1) ne modélise qu'**un texte fixe sur un jour de
semaine donné, répété chaque semaine, sans fin ni intervalle configurable** — pas de
notion de "tous les 2 lundis", pas de date de fin, pas d'édition
"cette occurrence/toute la série/celle-ci et les suivantes" comme le prototype
`prototype-bulles.html` l'introduit (`serieId`/`serieOrdre`, popup "portée d'une
série" à 3 choix, `demanderPorteeSerie`, boutons "Série" avec case à cocher +
intervalle + choix de fin dans les formulaires — cf. `.serie-options`,
`calculerGisSerie`). **C'est un concept entièrement nouveau côté V3, sans aucun
équivalent serveur aujourd'hui** — ni structure de données, ni API. Le portage devra
soit étendre la feuille "Récurrences" existante (nouvelles colonnes : intervalle,
date de fin, ancrage sur une date précise plutôt qu'un jour de semaine relatif),
soit créer un mécanisme parallèle. À noter : `architecture-donnees-v3.md` ne
mentionne PAS ce point — la question n'avait pas encore été posée à ce moment-là ;
c'est une divergence découverte en confrontant le prototype au backend réel.

### 5.4 Colonnes week-end : présentes dans la structure de la feuille, mais
totalement invisibles pour l'API web actuelle

Le vrai Planning **a bien** 2 colonnes Sam/Dim par semaine, fusionnées par bloc
personne, avec fond gris et saisie libre possible directement dans Google Sheets
(section 1). Mais :
- `chargerSemaine_()` ne lit jamais au-delà de `jj <= 5` (jours 1 à 5) — les valeurs
  des colonnes week-end **ne sont jamais renvoyées au client**, quel que soit leur
  contenu.
- Aucune fonction `apiXxx` n'écrit dans une colonne week-end.
- Pas de liste déroulante Chantier sur ces colonnes (exclu explicitement dans
  `appliquerValidationChantier`).
- Pas de distinction Sam vs Dim dans la donnée (une seule cellule fusionnée pour les
  deux).

Le prototype V3 (`prototype-bulles.html`) introduit un **toggle "Afficher les
week-ends"** (page Général, demande de Lionel du 01.09.2026 : *"met 2 jours sous
week-end, ça me permet d'y ajouter une tâche si un jour je dois travailler le
week-end"*) avec Samedi et Dimanche **séparés et pleinement interactifs**
(`case-weekend`, `giWeekend`, `estGiWeekend` dans le code prototype) — un modèle de
données par-jour, alors que la vraie feuille n'a qu'une seule cellule fusionnée par
demi-semaine. **Écart structurel à trancher avant le portage** : soit démerger les 2
colonnes week-end dans la vraie feuille (rupture avec `fusionnerWeekends`, tout le
formatage existant, l'impression), soit accepter que "Samedi" et "Dimanche" du
prototype partagent en réalité la même cellule côté backend (perte de la
distinction promise à Lionel), soit étendre le format de cellule pour encoder 2
jours dans le texte d'une seule case (nouvelle convention à inventer, dans l'esprit
de `decoderTaches_`).

### 5.5 "Fériés" est déjà exploitable comme vacances d'entreprise — mais seulement
comme couleur d'affichage

Contrairement à une intuition initiale (corrigée dans `architecture-donnees-v3.md`
après vérification du vrai fichier), il n'y a **pas besoin** d'une nouvelle feuille
"Vacances entreprise" : "Fériés" contient déjà toutes les dates pertinentes (fériés
officiels ET vacances d'entreprise), simplement mélangées avec une colonne C
décorative non lue par le code. Ce qui manque réellement :
- **Aucun avertissement/blocage** si quelqu'un est planifié un jour classé "Fériés"
  (aucune des fonctions d'écriture ne consulte `lireFeries()` pour valider une
  saisie — elle sert uniquement au calcul de couleur d'affichage/impression).
  Précision : `calculerPlanDecalage_` interroge bien `feriesMemo_`/`lireFeries()`,
  mais uniquement pour la mémoïsation générique — la fonction elle-même ne fait
  aucune distinction jour férié/ouvré dans son calcul.
- **Le calcul "jours ouvrables"** (décalage en masse, plage jalon/note) ne saute que
  les vrais week-ends (`colMap[c].we`) — un jour dans "Fériés" compte comme un jour
  ouvré normal pour ces deux fonctionnalités. Question explicitement laissée ouverte
  à Lionel dans `architecture-donnees-v3.md`, jamais tranchée : faut-il exclure ces
  jours du décompte, avertir/bloquer une saisie dessus ?

### 5.6 Liste du personnel : convention de position, pas une vraie table

Le statut "personnel" vs "sous-traitant" d'une ligne dépend uniquement de sa
position (`startRow >= PREMIERE_LIGNE_SOUS_TRAITANT = 22`), pas d'un champ dédié —
fragile si la structure brute est modifiée directement dans Sheets sans repasser par
l'appli (il faut alors éditer la constante à la main et recoller le script).
`architecture-donnees-v3.md` note cette limite explicitement comme un point à
"faire sortir vers une vraie petite liste" **à l'occasion du chantier V3**, mais
non urgent — pas encore fait, aucune structure alternative n'existe aujourd'hui.

### 5.7 Aucun concept de "formulaire rapide" configurable côté serveur

Le prototype V3 introduit des mini-formulaires spécifiques par métier (Armature,
Béton avec quantité + unité m³ automatique, Livraison armature avec pilules
Murs/Radier/Dalle, étape optionnelle E2/E3…) — cf. `V3-spec.md` points 88-93.
Aujourd'hui, `TEXTES_METIER` côté client n'est qu'une **liste de textes suggérés**
(insertion de texte brut), pas un système de formulaire structuré avec champs
typés (quantité numérique, unité, pilules à choix). Aucun équivalent serveur, aucune
structure de données pour stocker "ce chantier/cette tâche a une quantité de X m³
de béton" au-delà du texte libre encodé dans la case (donc pas de champ numérique
interrogeable/agrégeable pour un futur rapport de quantités).

### 5.8 Pas de champ "quantité"/donnée structurée dans une tâche

Toute la donnée métier (quantité de béton, étape de mur E2/E3, type d'armature)
finit encodée comme **texte libre concaténé** dans la ligne de détail (ex.
"Armature radier supérieure"), pas comme des champs séparés relisibles. Une tâche
créée par un futur formulaire structuré V3 devra soit continuer ce même encodage
texte (perte de structure côté relecture — pas de requête possible sur "tous les m³
de béton coulés ce mois"), soit le backend devra apprendre un nouveau format de
sérialisation par tâche (extension de `decoderLigneTache_`/`encoderTaches_`).

### 5.9 Pas de notion de "série" pour les tâches personnel/absence

Voir 5.3 — le même constat "aucune série calendrier" s'applique aux tâches et
absences du prototype (pas seulement jalons/notes) : `serieId`/`serieOrdre` sur
n'importe quel item (tâche, absence, jalon, note) n'a aucune contrepartie serveur.

### 5.10 Résumé — ce qui EXISTE déjà et peut être réutilisé tel quel

Pour éviter toute confusion : ne PAS considérer comme manquants — "Chantier"
(nom+couleur, déjà éditable via `apiEnregistrerChantiers`), "Fériés" (déjà la bonne
donnée pour vacances d'entreprise, juste sous-exploitée, cf. 5.5), personnel/
sous-traitants scopé à la semaine (ajout/renommage/suppression déjà en place),
création automatique de semaines à l'avance, décalage en masse avec aperçu/conflits,
export PDF, récurrence hebdomadaire simple (à étendre, pas à recréer).
