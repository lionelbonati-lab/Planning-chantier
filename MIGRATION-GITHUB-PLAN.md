# Migration hors Google — plan de travail (03.09.2026)

## 0. Où on en est

Lionel a demandé comment héberger l'appli Planning Chantiers sur GitHub. Après
clarification (AskUserQuestion) : il ne veut pas juste sauvegarder le code,
il veut **faire tourner l'appli ailleurs que sur Google**, et a choisi
l'option la plus complète : **tout migrer, base de données incluse** — quitter
Google Sheets/Apps Script, remplacer `WebApp.gs` par un vrai backend,
héberger le frontend (`Index.html`) sur GitHub Pages.

C'est le plus gros chantier ouvert sur ce projet à ce jour. Ce document fixe
une direction technique par défaut pour pouvoir commencer à avancer sans
multiplier les allers-retours — **chaque choix ci-dessous est change-able**,
ils sont signalés comme tels. Rien n'est encore codé.

## 1. Bilan honnête : pourquoi c'est un gros chantier

L'appli actuelle n'est pas juste "un peu de code Google" à recopier ailleurs.
Neuf jours de travail (19 au 28.08, puis les rounds du 01 au 03.09) l'ont
fait grandir en un système assez élaboré, profondément dépendant de
Google Sheets :

- **Le classeur EST la base de données** : `WebApp.gs` (~3800 lignes, plus de
  35 fonctions `apiXxx`) lit/écrit directement des cellules, avec des
  conventions comme "la position de la ligne décide si c'est un
  sous-traitant" (`PREMIERE_LIGNE_SOUS_TRAITANT`), des blocs de 4 lignes par
  personne, des colonnes de semaine tous les 8, des cellules fusionnées
  porteuses de sens.
- **Beaucoup d'information est encodée en texte** dans les cellules plutôt
  que dans des colonnes dédiées : tags entre crochets (`[Confirmé]`,
  `[Important]`, `[S]`/`[D]` pour le week-end, `[Série:xxxxxx]`), décodés par
  des fonctions dédiées (`decoderLigneTache_`, `decoderNotesJour_`...).
- **Aucune authentification applicative** aujourd'hui : l'accès est géré au
  niveau du déploiement Google ("Exécuter en tant que Moi" + "Uniquement
  moi"), pas dans le code. Une vraie authentification sera donc un ajout net,
  pas juste un portage.
- **Le verrouillage concurrent** (`LockService`, pour que deux ouvertures
  simultanées ne se marchent pas dessus) est un service Google — il faudra
  un équivalent.

Rien de tout ça n'est un problème dans le système actuel — c'est un
historique cohérent de décisions prises pour rester compatible avec un
classeur Google réel que Lionel utilise et imprime au quotidien. Mais ça veut
dire que "migrer" = réécrire le modèle de données ET la couche serveur, pas
recopier des fichiers.

## 2. Choix techniques par défaut

Personne n'a encore validé ces choix en détail — je pars dessus pour
avancer, à ajuster sur simple demande.

**Base de données : [Supabase](https://supabase.com) (Postgres).**
Pourquoi plutôt que Firebase (l'autre option mentionnée) : les données du
planning sont fondamentalement relationnelles (une personne a des tâches, un
jour a des tâches, une tâche a un statut et éventuellement un chantier) —
Postgres modélise ça nativement avec de vraies tables et relations, là où
Firebase (base "documents") obligerait à dupliquer/dénormaliser
l'information pour obtenir les mêmes vues. Supabase ajoute, gratuitement sur
son offre de base : l'authentification, une API générée automatiquement à
partir des tables, une interface web pour consulter/modifier les données à
la main (un peu comme Google Sheets aujourd'hui, en moins visuel), et des
sauvegardes automatiques.

**Backend : Supabase lui-même pour l'essentiel + "Edge Functions" pour la
logique métier.** La plupart des lectures/écritures simples (charger une
semaine, enregistrer une case) passent directement par l'API générée par
Supabase, sécurisée par des règles d'accès par table (Row Level Security) —
pas besoin d'écrire une route serveur pour ça. Pour la logique qui ne peut
pas être une simple lecture/écriture (génération des occurrences d'une
série récurrente, décalage en masse avec résolution de conflits, fusion des
jours fériés, export PDF), des petites fonctions serveur ("Edge Functions",
en JavaScript/TypeScript) remplacent une à une les fonctions `apiXxx`
correspondantes de `WebApp.gs`. Pas de serveur à faire tourner soi-même, pas
de facture d'hébergement séparée pour ça.

**Authentification : Supabase Auth.** Un compte (email + mot de passe pour
commencer, plus simple à expliquer que OAuth) par personne qui doit modifier
le planning — a priori Lionel, à étendre à d'autres membres de l'équipe s'il
le souhaite. Peut évoluer vers un lien magique par email (sans mot de passe à
retenir) ou une connexion Google plus tard, sans tout refaire.

**Frontend : GitHub Pages**, servant une version adaptée d'`Index.html` (le
design, les fiches, la grille — tout ce que Lionel connaît déjà — ne change
pas). Seule la façon dont elle parle au serveur change : `google.script.run`
(le petit wrapper `gs()`/`gsP()` actuel) est remplacé par des appels au client
JavaScript de Supabase (`supabase-js`), qui parle en HTTPS normal.

**Dépôt : un repo GitHub privé**, qui contiendra le frontend, les fonctions
serveur, le schéma de base de données (comme fichiers "migration" versionnés,
donc reproductibles), et les tests. Premier bénéfice concret et immédiat de
ce chantier, indépendant du reste : **l'historique de tout ce travail
(9 jours, changelogs compris) devient enfin versionné et consultable**, ce
qui n'est pas le cas aujourd'hui (les fichiers `.gs`/`.html` sont recollés à
la main dans l'éditeur Apps Script à chaque envoi).

## 3. Nouveau modèle de données (proposition)

Le plus gros changement de fond : on quitte le modèle "une ligne de feuille
partagée par toutes les semaines, colonnes de semaine tous les 8" pour de
vraies tables, où chaque jour/personne/tâche est une ligne indépendante avec
une vraie date — plus besoin de "créer" une semaine à l'avance, ni de
détecter une personne par sa position.

```
personnes        (id, nom, sous_traitant, actif, ordre)
chantiers         (id, nom, couleur)
statuts           (id, cle, nom, couleur, ordre)          -- statuts sous-traitant
formulaires_rapides       (id, nom, ordre, assigne_a, type_entree)
formulaires_rapides_champs (id, formulaire_id, cle, label, type, options, ordre)
feries            (id, date, libelle, categorie)

assignations      (id, personne_id, date, demi, chantier_id)
                  -- remplace la "ligne Chantier" ; demi = matin|aprem
taches            (id, personne_id, date, demi, ordre, texte,
                   statut_id, important, serie_id)
                  -- une ligne = une tâche ; fini l'encodage [Confirmé]/
                  -- [Important] en tête de texte, ce sont de vraies colonnes

jalons            (id, date, texte, important, serie_id)   -- ligne 4
notes             (id, date, texte, important, serie_id)   -- ligne 5

series            (id, type, cible_personne_id, cible_demi, texte, statut_id,
                   important, chantier_id, date_debut, frequence, intervalle,
                   fin_type, fin_valeur)
                  -- génère des occurrences dans taches/jalons/notes,
                  -- reprend le modèle [Série:xxxxxx] déjà en place
```

Points notables :

- **Le week-end n'a plus besoin d'un tag texte `[S]`/`[D]`** : samedi et
  dimanche deviennent des dates normales comme les autres, chacune avec ses
  propres lignes `assignations`/`taches`. Le contournement mis en place pour
  respecter la cellule fusionnée du classeur (§2 de `TRANSFERT-V3-SPEC.md`)
  disparaît de lui-même.
- **Le statut et le tag "Important" deviennent de vraies colonnes**
  (`statut_id`, `important`) au lieu d'un préfixe entre crochets à
  décoder/encoder à chaque lecture/écriture — toute la famille de fonctions
  `decoderLigneTache_`/`encoderLigneTache_`/`decoderNotesJour_`/... disparaît.
- **Plus de position de ligne pour distinguer personnel/sous-traitant** :
  `sous_traitant` devient une vraie colonne booléenne. Le seuil fragile
  "ligne 22" (documenté comme point d'entretien manuel dans
  `planning-status.md`) disparaît.

## 4. Ce que la migration résout gratuitement

Deux limitations connues et déjà documentées (`FRONTEND-CHANGELOG.md` §32.4,
et le fil sur le décalage en masse) tombent d'elles-mêmes avec ce modèle,
sans travail supplémentaire dédié :

- **Deux chantiers sur une même demi-journée** — aujourd'hui impossible
  (une seule case "Chantier" partagée par cellule physique). Avec
  `assignations` comme une vraie table, plusieurs lignes
  `(personne_id, date, demi, chantier_id)` pour la même demi-journée
  deviennent possibles nativement. Reste à décider comment l'afficher
  proprement dans la grille (plusieurs bandeaux de couleur au lieu d'un
  seul) — un choix d'interface à faire le moment venu, pas une contrainte de
  données.
- **Le seuil "ligne 22" et son entretien manuel** disparaissent, comme
  indiqué au §3.

## 5. Équivalence des fonctions serveur (aperçu)

Les ~35 fonctions `apiXxx` de `WebApp.gs` seront reprises une par une. Pour
donner une idée du volume et de la répartition, sans détailler chacune ici :

| Famille | Fonctions actuelles (extrait) | Devient |
|---|---|---|
| Chargement | `apiDemarrer`, `apiChargerSemaine` | Une ou deux requêtes Supabase filtrées par plage de dates — plus de notion de "semaine" à charger, juste une fenêtre de dates |
| Écriture case | `apiEnregistrerCellulePersonne` | Écriture directe table `taches`/`assignations` (API Supabase, pas de fonction serveur dédiée) |
| Config (chantiers, statuts, fériés, formulaires) | `apiListerXxx`/`apiEnregistrerXxx` | Lecture/écriture directe des tables correspondantes |
| Jalon/note en plage | `apiEnregistrerPlage` | ✅ Edge Function `enregistrer-plage` déployée (04.09.2026) — logique pure testée (30/30, `test_enregistrer_plage.js`), pas encore testée en conditions réelles (aucun moyen d'appeler une URL Supabase depuis cet environnement — se vérifiera à l'usage une fois le frontend branché, phase 4) |
| Récurrences/série | `apiEnregistrerSerie`, `apiModifierSerie`, `apiSupprimerSerie` | ✅ Edge Functions `enregistrer-serie` (création) et `gerer-serie` (modifier/supprimer, regroupées — même logique partagée que l'ancien code) déployées (04.09.2026) — logique pure testée (26/26 + 12/12, `test_enregistrer_serie.js`/`test_gerer_serie.js`), pas encore testées en conditions réelles, même limite que ci-dessus |
| Décalage en masse | `apiApercuDecalage`, `apiAppliquerDecalage` | ✅ Edge Function `decalage-masse` (une seule fonction, actions "apercu"/"appliquer" — regroupées comme gerer-serie) déployée (04.09.2026) — logique pure testée (30/30, `test_decalage_masse.js`), pas encore testée en conditions réelles, même limite que les autres |
| PDF | `apiGenererPdf` | À revoir : Google gérait ça via une feuille d'impression + export Drive. Nouvelle approche à définir (génération HTML→PDF côté navigateur ou Edge Function) — un point ouvert, pas encore tranché |
| Verrouillage | `avecVerrou_` (`LockService`) | Transactions Postgres (`BEGIN`/`COMMIT`) ou verrou applicatif équivalent |

## 6. Feuille de route (plusieurs sessions)

Découpage pensé pour que chaque phase soit vérifiable seule, sans tout
livrer d'un bloc :

1. **Socle** — ✅ fait le 04.09.2026. Projet Supabase créé (`Planning-chantier`,
   région eu-west-2), schéma (§3) posé via `sql/0001_schema.sql` +
   `sql/0002_rls.sql` : les 11 tables existent, RLS activée sur chacune,
   vérifié directement via le connecteur Supabase (`list_tables`). Dépôt
   GitHub créé par Lionel — reste à m'y donner accès pour la suite (cf.
   message séparé sur le jeton d'accès).
2. **Pas de migration de données** — décision de Lionel (04.09.2026) :
   « je n'ai pas besoin de migration de donnée, je rentrerai mes données
   manuellement ». Les tables restent donc vides jusqu'à ce que la nouvelle
   appli soit utilisable ; aucun script de lecture du classeur Google n'est
   nécessaire. Simplifie nettement ce chantier — la partie la plus délicate
   d'une migration de données (redécoder fidèlement tous les tags historiques
   `[Confirmé]`/`[Important]`/`[S]`/`[D]`/`[Série:xxx]`) disparaît du plan.
3. **Backend** — ✅ fait pour toute la logique identifiée à ce stade (§5),
   avec des tests portés du même esprit que les fichiers `test_*.js`
   existants (extraction de la vraie fonction, jamais une copie). Quatre
   Edge Functions écrites, testées et déployées : `enregistrer-plage`,
   `enregistrer-serie`, `gerer-serie`, `decalage-masse`. Aucune n'a encore
   été testée en conditions réelles (cf. §5 — limite réseau de cet
   environnement, se vérifiera une fois le frontend branché, phase 4). Le
   PDF (§8) reste un point ouvert, à traiter séparément (pas une fonction
   `apiXxx` classique).
4. **Frontend** — adapter `Index.html` : remplacer `gs()`/`gsP()` par des
   appels Supabase, adapter l'affichage à la nouvelle forme des données
   (les tags disparaissent, remplacés par de vrais champs). L'apparence et
   les interactions ne changent pas pour Lionel.
5. **Déploiement** — GitHub Pages pour le frontend, vérification bout en
   bout en saisissant quelques données réelles à la main.
6. **Bascule** — une fois l'appli testée et jugée fiable, Lionel commence à
   saisir ses données réelles directement dans le nouveau système (pas de
   comparaison avant/après possible puisqu'il n'y a pas de donnée reprise —
   plutôt un vrai nouveau départ). L'appli actuelle (Google) continue de
   tourner en parallèle tant que ce n'est pas fait, et le classeur reste
   consultable comme archive, jamais supprimé.

Chaque phase peut être une ou plusieurs sessions de travail séparées.
Rien n'empêche de continuer à utiliser et faire évoluer l'appli actuelle
(WebApp.gs/Index.html) pendant que ce chantier avance en parallèle — les
deux ne sont pas exclusifs tant que la bascule n'a pas eu lieu.

## 6bis. Phase 4 en détail (04.09.2026, à faire)

`Index.html` fait ~6100 lignes — trop pour une seule session, d'où ce
découpage écrit avant de commencer à toucher au fichier.

**Bonne nouvelle trouvée en l'examinant** : tous les appels au serveur
passent par DEUX fonctions seulement, `gs(fn, args, onOk, onErr)` et
`gsP(fn, args)` (les seules à appeler `google.script.run`, ~40 sites
d'appel au total mais 15 noms `apiXxx` distincts). Adapter le frontend n'est
donc pas "réécrire 40 endroits" mais "écrire un module qui implémente
chaque `apiXxx` utilisé, puis rebrancher `gs`/`gsP` dessus au lieu de
`google.script.run`" — une seule couche à remplacer, pas une chasse
dispersée dans tout le fichier.

Les `apiXxx` réellement appelés par `Index.html` aujourd'hui, groupés par ce
qu'ils deviennent (cf. §5) :

- **Chargement initial — le morceau le plus gros et le plus invasif** :
  `apiDemarrer`, `apiChargerSemaine`. C'est ici que la notion de "semaine"
  (`labG`, `etat.semaines`, le cache par semaine) doit disparaître côté
  échange avec le serveur, remplacée par une fenêtre de dates — ça façonne
  la structure de données que TOUT le reste du fichier consomme ensuite.
  À faire en premier, le reste en dépend.
- **Écriture d'une case personnel** : `apiEnregistrerCellulePersonne` →
  écriture directe des tables `taches`/`assignations` (pas de fonction
  dédiée, §5).
- **Config simple** (nombreux petits sites, mécaniques mais pas
  complexes) : `apiAjouterPersonne`, `apiRenommerPersonne`,
  `apiSupprimerPersonne`, `apiCompterTachesPersonnes`,
  `apiEnregistrerChantiers`, `apiRenommerChantier`,
  `apiCompterUtilisationsChantier`, `apiSupprimerChantier`,
  `apiEnregistrerStatuts`, `apiListerFormulairesRapides`,
  `apiEnregistrerFormulaireRapide`, `apiSupprimerFormulaireRapide`,
  `apiEnregistrerCategoriesFeries`, `apiEnregistrerFeriesV3` → lecture/
  écriture directe des tables correspondantes (§5), aucune Edge Function.
- **Déjà prêt côté serveur, juste à brancher** : `apiEnregistrerJalonNote`/
  `apiEnregistrerPlage` → `enregistrer-plage` ; `apiEnregistrerSerie` →
  `enregistrer-serie` ; `apiModifierSerie`/`apiSupprimerSerie` →
  `gerer-serie` ; `apiApercuDecalage`/`apiAppliquerDecalage` →
  `decalage-masse` (pas encore appelée dans `Index.html` aujourd'hui — à
  vérifier si l'interface de décalage existe déjà côté client ou reste à
  construire). `apiAjoutLointain` réutilise déjà `apiEnregistrerPlage` côté
  ancien code pour jalon/note — même principe à reprendre pour la partie
  tâche.
- **Hors scope de cette phase** : `apiGenererPdf` (point ouvert, §8) ;
  `apiVersionServeur` disparaît probablement (plus de déploiement Apps
  Script à versionner).

**Authentification — un vrai ajout, pas un portage.** Rien dans
`Index.html` aujourd'hui ne gère de connexion (l'accès était géré au
niveau du déploiement Google, jamais dans le code, cf. §1). Comme RLS
exige un utilisateur connecté pour la moindre requête (cf.
`sql/0002_rls.sql`), un écran de connexion (email + mot de passe, Supabase
Auth) devient un préalable à tout le reste — rien ne fonctionnera avant.

**Séquencement proposé** (chaque étape vérifiable seule) :

1. ✅ Bootstrap — fait et vérifié le 04.09.2026 (Lionel a testé en conditions
   réelles, connexion confirmée) : script `supabase-js` (CDN), écran de
   connexion, client Supabase initialisé avec la session de l'utilisateur
   connecté. Volontairement pas encore relié au chargement du planning
   (écran de confirmation à la place, cf. commit) — c'est l'étape 2.
2. ✅ Chargement (`apiDemarrer`/`apiChargerSemaine`) — fait le 04.09.2026.
   `labG` redevient une pure coordonnée client (le lundi de la semaine, en
   YYYYMMDD, jamais envoyé/reçu du serveur) ; `etat.semaines` est calculé
   localement (`genererSemaines`, ~5 ans avant/après aujourd'hui, pure
   arithmétique de dates) au lieu de venir du serveur — plus de "création de
   semaines à l'avance", une date est juste une date désormais. `demarrer()`
   fait 4 petites requêtes Supabase (personnes/chantiers/statuts/fériés) puis
   charge la semaine courante ; `assurerFenetreChargee()` (navigation)
   requête `taches`/`assignations`/`jalons`/`notes` par plage de dates et
   remet tout en forme (`construireDonneesSemaine`) EXACTEMENT comme
   l'ancien `chargerSemaine_` — `construireVueDepuisCache()` et tout le
   moteur d'affichage en aval n'ont pas été touchés. `demarrerApresConnexion()`
   appelle enfin `demarrer()` (fin du message de confirmation provisoire de
   l'étape 1) : connexion et chargement du planning sont reliés. Logique pure
   (semaines, plages de dates, mise en forme des lignes) testée
   (35/35, `test_chargement.js`) + test structurel Playwright (planning
   mocké rendu sans erreur JS, écran de connexion bien quitté) ; pas encore
   testé en conditions réelles contre le vrai projet Supabase (même limite
   réseau que les Edge Functions, cf. §5 — se vérifiera une fois Lionel
   connecté pour de vrai).
3. ✅ Config simple — fait le 04.09.2026. Les 14 `apiXxx` "mécaniques"
   restants (Personnel/Intervenants, Chantiers, Statuts, Formulaires
   rapides, Fériés+catégories) passent en lecture/écriture directe des
   tables Supabase (section "CONFIG SIMPLE", `Index.html`) — aucun
   n'avait besoin d'Edge Function. Portage volontairement pas littéral :
   plusieurs concepts de l'ancien classeur disparaissent une fois qu'une
   personne/un chantier est une vraie ligne identifiée par un id (la
   "portée" cette-semaine/et-les-suivantes du personnel, la migration
   manuelle des cases au renommage d'un chantier) — détail complet des
   déviations dans `FRONTEND-CHANGELOG.md` (§33). Gap comblé au passage :
   la table `categories_feries` n'existait dans aucune migration — créée
   par `sql/0005_categories_feries.sql` (RLS + GRANT à coller par Lionel,
   comme `sql/0004`), qui corrige aussi la contrainte `feries.categorie`
   (catégorie "Compensés" manquante depuis le schéma initial). Logique
   pure testée (`test_config_simple.js`) ; pas encore testé en conditions
   réelles (même limite réseau que le reste de la phase 4).
4. ✅ Brancher les Edge Functions déjà déployées — fait le 07.09.2026, pour
   3 des 4 (`enregistrer-plage`, `enregistrer-serie`, `gerer-serie`) :
   diff jalons/notes (`synchroniser()`), création de série
   (`creerSerieServeur`), modification/suppression de série (5 sites,
   `ouvrirEdition` et sa variante jalon/note, + suppression groupée) et
   ajout lointain (`ouvrirAjoutLointain`) — jalon/note réutilisent
   `enregistrer-plage` (mode "ajout", même principe que l'ancien
   `apiAjoutLointain`), tâche/absence n'ont pas d'Edge Function dédiée et
   passent en écriture directe des tables `taches`/`assignations`, avec la
   même règle que `construireOccurrencesSerie` (chantier posé une fois,
   jamais écrasé). Un helper `invoquerFonctionServeur(nom, body)` (Index.html)
   fait l'équivalent de `gsP()` pour ces 3 fonctions : vérifié dans le code
   source de `@supabase/supabase-js`/`@supabase/functions-js` (aucun accès
   réseau direct dans cet environnement, `npm pack` a suffi) que le JWT de
   la session est bien attaché automatiquement à chaque appel, et que les 4
   fonctions renvoyant systématiquement un code HTTP non-2xx sur erreur
   métier, cette erreur arrive toujours côté `error` (jamais
   `data.ok===false` en pratique) — les deux chemins sont quand même gérés.
   **`decalage-masse` reste NON branchée** : aucune interface client pour le
   décalage en masse n'existe aujourd'hui (confirmé par grep,
   `apiApercuDecalage`/`apiAppliquerDecalage` n'apparaissent nulle part dans
   `Index.html`) — construire cette UI (formulaire portée/sens/nombre de
   jours, aperçu avec résolution de conflits) est un travail à part, pas
   fait ici (cf. §6bis, portage explicitement laissé de côté). Logique pure
   ajoutée testée (`test_edge_functions.js`) ; pas encore testé en
   conditions réelles (même limite que le reste de la phase 4, cf. §5).
5. 🔄 Vérification bout en bout, avec de vraies données saisies à la main —
   premier moment où `enregistrer-plage`/`enregistrer-serie`/`gerer-serie`
   sont enfin testées en conditions réelles (cf. §5, limite jusqu'ici).
   **Décalage en masse volontairement laissé de côté pour l'instant**
   (décision de Lionel, 07.09.2026) : pas de nouvelle UI construite pour
   `decalage-masse` dans l'immédiat — reprendra plus tard, hors de cette
   étape 5.
   **Déjà en cours de facto** : Lionel a testé jalon/note dès la livraison de
   l'étape 4 (fonctionnels) et a repéré un vrai trou de planning au passage —
   `apiEnregistrerCellulePersonne` (écriture d'une case personnel, tâches +
   chantier) n'était rattachée à AUCUNE étape numérotée (ni "config simple",
   qui ne couvre que les tables de config, ni "brancher les Edge Functions",
   qui ne couvre que les 4 fonctions déployées) — corrigé le 07.09.2026,
   `enregistrerCellulePersonneServeur` (Index.html) en écriture directe des
   tables `taches`/`assignations`, même principe que le reste de §5. Détail
   dans `FRONTEND-CHANGELOG.md` (§35).
   **Chasse aux trous restants (07.09.2026)** : grep systématique de tous
   les appels `gs(`/`gsP(` (les 2 seules portes vers `google.script.run`,
   inexistant hors Apps Script) — 2 sites restants seulement, tous deux déjà
   identifiés comme hors scope de la phase 4 (`apiVersionServeur`,
   `apiGenererPdf`), pas de nouveau trou du genre `apiEnregistrerCellulePersonne`.
   `apiVersionServeur` (diagnostic de déploiement Apps Script, obsolète et
   qui plantait silencieusement à chaque ouverture de la page Fériés) —
   supprimé. `apiGenererPdf` (bouton PDF, étape 6) — laissé en l'état
   fonctionnel mais sécurisé (message clair au lieu d'un bouton bloqué si
   cliqué avant l'étape 6). Détail dans `FRONTEND-CHANGELOG.md` (§36).
   **Reste à faire pour clore cette étape** : Lionel doit tester l'appli avec
   ses vraies données (créer des chantiers/personnes/statuts, poser des
   tâches/jalons/notes/séries, vérifier la synchronisation) — c'est le seul
   moyen de vérifier les Edge Functions en conditions réelles depuis cet
   environnement (limite réseau, cf. §5).
6. PDF, en dernier et séparément (§8, pas encore tranché).

## 7. Coûts

- **Supabase** : offre gratuite largement suffisante pour ce volume de
  données (une équipe, un planning) — projet qui se met en pause après une
  semaine d'inactivité sur ce palier (se réveille au premier accès), sans
  limite de durée. Une offre payante existe (~25$/mois) si ça devient
  gênant, mais rien n'indique que ce sera nécessaire ici.
- **GitHub Pages** : gratuit pour un repo, y compris privé.
- **Domaine personnalisé** (optionnel, ex. `planning.tonentreprise.ch` au
  lieu d'une adresse `github.io`) : à la charge de Lionel s'il le souhaite,
  quelques francs par an — pas nécessaire pour démarrer.

## 8. Points encore ouverts

- **PDF** (§5) : ✅ tranché et fait — round du 15.09.2026, cf.
  `FRONTEND-CHANGELOG.md` §64. Solution retenue : impression du NAVIGATEUR
  (choix de Lionel entre les 2 options proposées) plutôt qu'une Edge
  Function dédiée — le bouton "Générer le PDF" (renommé "Imprimer / PDF")
  déclenche `window.print()` sur l'aperçu déjà affiché ; "Enregistrer en
  PDF" comme imprimante donne le fichier voulu, sans aller-retour serveur.
  `apiGenererPdf` (WebApp.gs) n'est donc plus appelée par le client, mais
  reste en l'état côté serveur (inutile de la supprimer, elle ne gêne rien).
- **Qui doit pouvoir se connecter** : Lionel seul, ou aussi d'autres membres
  de l'équipe (avec quels droits — lecture seule pour l'équipe de chantier,
  écriture pour Lionel uniquement ?). Par défaut je pars sur "Lionel seul,
  extensible plus tard" (§2) — à confirmer quand la phase authentification
  arrivera, pas bloquant maintenant.
- **Affichage de deux chantiers sur une même demi-journée** (§4) : la donnée
  le permettra, l'interface pour le montrer proprement reste à concevoir.
- **Bugs d'interface demi-journée signalés le 07.09.2026** — ✅ 2 des 3
  corrigés le 07.09.2026 (Lionel a finalement demandé de les traiter tout de
  suite plutôt que d'attendre la fin de la migration, sans rapport avec le
  passage à Supabase, cause purement client) : le déplacement/redimensionnement
  d'une note ou d'un jalon qui « revenait » à sa position de départ après
  synchronisation (`it.dateDebutIso` périmé, cf. `FRONTEND-CHANGELOG.md` §37),
  et l'extension d'une tâche par glissement qui sautait la frontière
  matin/après-midi (`colonneEtSpanDemi` ignorait `it.demi`, nouvelle fonction
  `demiFixePourItem`). Le 3e point (jalon en demi-journée) n'a pas pu être
  reproduit — un jalon n'a jamais de demi-journée par choix assumé de Lionel
  (BACKEND-CHANGELOG.md §24) — **à revalider avec lui en conditions réelles**.
  ✅ **Suite le 07.09.2026** : ce que Lionel décrivait comme "toujours
  impossible" était en fait une vraie limitation jamais construite (pas une
  régression du correctif ci-dessus) — déplacer par GLISSEMENT une note à
  cheval sur 2 jours (ex. après-midi du jour 1 + matin du jour 2) d'une seule
  demi-journée, pour qu'elle retombe sur une journée pleine d'un seul jour.
  Le déplacement de note ne connaissait que 2 vitesses : jour entier (note
  multi-jours) ou demi-journée MAIS seulement sur un jour unique (note d'1
  jour). Ajout d'un modèle "demi-slot" (`demiSlotsDepuisBornes`/
  `bornesDepuisDemiSlots`/`bordsDeplacementNoteMultiJours`) qui généralise le
  déplacement à la demi-journée pour une note multi-jours, en mode compact à
  la souris — détail dans `FRONTEND-CHANGELOG.md` §38. Les 3 points signalés
  le 07.09.2026 sont maintenant traités ; reste à Lionel de confirmer en
  conditions réelles.

## 9. Prochaine étape

Commencer par la phase 1 (§6) : créer le projet Supabase et le schéma de
données (§3), et le repo GitHub. C'est un travail qui peut démarrer sans
attendre de nouvelles décisions de Lionel — les points ouverts (§8) ne
bloquent que des phases plus tardives.
