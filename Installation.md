# Installer l'appli mobile connectée — Planning Chantiers

Trois fichiers composent le projet Apps Script de **Planning 2026** (le vrai fichier, pas la copie de sauvegarde) : `Planning_Format.gs`, `WebApp.gs`, `Index.html`. Cette page couvre l'installation complète des 3 — pratique la toute première fois, ou pour t'y retrouver si tu veux tout revérifier — mais **à chaque envoi, seuls les fichiers qui ont vraiment changé ont besoin d'être recollés.**

**⚠️ Cet envoi (01.09.2026) est le plus gros depuis le début : c'est le transfert complet de la nouvelle interface (celle des maquettes à bulles que tu as validées, menu de gauche/Personnel/Intervenants/Chantiers/Statuts/Fériés/Entrée rapide/Série) dans le vrai fichier, à la place de l'ancienne appli.** `Index.html` est **entièrement remplacé** (nouveau design, nouvelles pages) et `WebApp.gs` est **étendu** (nouvelles fonctions, 2 nouvelles feuilles créées automatiquement au premier usage : "Statuts" et "Formulaires rapides" — rien à créer toi-même). `Planning_Format.gs` **ne change pas cette fois** — inutile de le recoller, passe directement à l'étape 3 puis 4. Détail complet des choix faits et des points à surveiller : voir le point 112 de `V3-spec-suite2.md`.

**Recommandation forte, vu l'ampleur du changement : teste d'abord sur une copie du classeur** (comme tu l'avais fait avant le round du 28.08.2026 — Fichier > Créer une copie), avant de coller ces fichiers dans "Planning 2026" lui-même. Ce round n'a pas pu être testé dans un vrai Google Sheets de mon côté (comme toujours, aucun accès direct) — la relecture a été faite ligne par ligne et un bug bloquant a déjà été trouvé et corrigé avant cet envoi (cf. `V3-spec-suite2.md`), mais un premier passage réel reste la meilleure garantie avant de toucher au fichier de tous les jours.

**Point d'attention particulier à tester en premier sur la copie** : les cases week-end (Samedi/Dimanche), qui partagent une seule cellule réelle par personne en coulisses (cf. point 112) — remplis Samedi et Dimanche avec des textes différents sur quelques cases et vérifie que les deux jours s'affichent bien séparément après avoir rechargé la page.

---

**Envoi précédent (28.08.2026, décalage en masse)** touchait `Planning_Format.gs` ET `WebApp.gs` — `Index.html` ne changeait pas à ce moment-là. C'est l'optimisation que tu as demandée (« optimise le projet ») : l'appli n'écrit plus aucune mise en forme sur la feuille à chaque saisie — enregistrer une case, assigner un chantier à toute l'équipe et surtout décaler le planning font nettement moins d'allers-retours vers Google Sheets (le décalage écrit 4× moins d'appels par case déplacée). Le PDF, lui, calcule maintenant toutes ses couleurs tout seul à partir des valeurs, il ne dépend plus de ce qui est peint sur la feuille (cf. « La feuille n'est plus repeinte à chaque saisie » plus bas — dont un vrai changement visible si tu ouvres encore la feuille brute). Passe par les **étapes 2 et 3** ci-dessous ; `Index` reste celui de l'envoi précédent, inutile de le rouvrir.

## 1. Ouvrir l'éditeur Apps Script

Dans Planning 2026 : **Extensions > Apps Script**.

## 2. Mettre à jour Planning_Format.gs

- Dans la liste des fichiers à gauche, ouvre **Planning_Format.gs** — il existe déjà, ce n'est pas un nouveau fichier à créer.
- Sélectionne tout son contenu (`Ctrl+A` / `Cmd+A`) et remplace-le par le contenu à jour fourni cette fois-ci.

## 3. Coller WebApp.gs

- Clique sur le **+** à côté de « Fichiers », choisis **Script** (si `WebApp` existe déjà d'un envoi précédent, ouvre-le directement au lieu d'en recréer un).
- Nomme-le `WebApp` (l'extension `.gs` est ajoutée automatiquement).
- Sélectionne tout son contenu existant et remplace-le par celui de `WebApp.gs`.

Ce fichier reste additif : il ne touche à rien du reste de ton script, à part les changements ciblés dans `Planning_Format.gs` de l'étape précédente.

## 4. Coller Index.html

- Même bouton **+**, choisis cette fois **HTML** (ou ouvre directement `Index` s'il existe déjà).
- Nomme-le **exactement** `Index` (sans le `.html` — Apps Script l'ajoute tout seul). C'est important : le nom doit correspondre pile, sinon l'appli ne trouvera pas sa page.
- Sélectionne tout son contenu existant et remplace-le par celui de `Index.html`.

## 5. Enregistrer

Icône disquette en haut, ou `Ctrl+S` / `Cmd+S` (enregistre les 3 fichiers d'un coup).

## 6. Déployer comme application web

- Bouton bleu **Déployer** (en haut à droite) > **Nouveau déploiement**.
- Clique sur l'icône en forme d'engrenage à côté de « Sélectionner le type » et choisis **Application Web**.
- Réglages recommandés pour commencer :
  - **Exécuter en tant que** : Moi (ton compte)
  - **Qui a accès** : Uniquement moi
- Clique sur **Déployer**.
- La première fois, Google va demander d'autoriser le script à accéder à ta feuille (et à Drive, pour le PDF) — c'est normal, accepte comme tu l'as déjà fait pour le reste du script.

Tu obtiens une URL du genre `https://script.google.com/macros/s/AKfycb.../exec`. **Copie-la.**

## 7. Ouvrir l'appli sur ton téléphone

Colle cette URL dans le navigateur de ton téléphone (Safari/Chrome), puis ajoute la page à l'écran d'accueil (« Ajouter à l'écran d'accueil » / « Add to Home Screen ») pour l'avoir comme une vraie appli, en un clic.

## ⚠️ Mettre à jour l'appli après un futur envoi (à faire à CHAQUE FOIS)

Ce point a causé un vrai bug le 02.09.2026 (le menu Fériés qui n'enregistrait pas les bonnes catégories) :
**coller du nouveau code dans `WebApp.gs` ou `Index.html` et l'enregistrer (`Ctrl+S`) ne suffit PAS pour que
ton appli sur ton téléphone en tienne compte.** L'URL `.../exec` que tu as sur ton téléphone reste figée sur
la version qui était déployée au moment où tu as cliqué "Déployer" — même après avoir collé et sauvegardé du
code plus récent dans l'éditeur.

Donc, à chaque fois que je t'envoie un `WebApp.gs` et/ou un `Index.html` mis à jour (pas seulement la toute
première fois) :

1. Colle le nouveau contenu (étapes 3/4 ci-dessus) et enregistre (`Ctrl+S`/`Cmd+S`).
2. **Bouton bleu Déployer > Gérer les déploiements.**
3. Clique sur l'icône **crayon** (modifier) à côté du déploiement actif.
4. Dans le menu déroulant **"Version"**, choisis **"Nouvelle version"** (pas un numéro déjà existant).
5. Clique **Déployer**.

C'est tout — **l'URL `.../exec` reste exactement la même**, donc ton raccourci sur l'écran d'accueil de ton
téléphone continue de marcher sans rien reconfigurer là-bas. Cette étape (2 à 5) est différente du tout
premier déploiement (étape 6 plus haut, qui crée l'URL) : ici tu ne crées rien de nouveau, tu mets juste à
jour ce qui tourne déjà derrière la même adresse.

**`Planning_Format.gs` fait exception** : lui, l'enregistrer (`Ctrl+S`) suffit et prend effet tout de suite
pour le menu 🔧 Planning et les triggers — cf. "Si quelque chose ne va pas" plus bas. Seuls `WebApp.gs` et
`Index.html` (le code qui tourne DERRIÈRE l'URL déployée) ont besoin de cette étape de redéploiement.

## Élargir l'accès plus tard (optionnel)

Si toute l'équipe doit pouvoir l'utiliser, pas seulement toi : **Déployer > Gérer les déploiements** > icône crayon > change « Qui a accès » (par exemple à « Toute personne possédant le lien », ou limité à votre organisation Google si vous en avez une), puis redéploie. Aucune limite technique de mon côté à ça — c'est un réglage que tu peux changer à tout moment, sans repasser par moi.

## Si quelque chose ne va pas

La sauvegarde faite avant de commencer (« Planning 2026 — copie de sauvegarde 2026-08-27 ») est toujours là, intacte — tu peux toujours y recopier l'ancien contenu d'un fichier si besoin. Pour `WebApp.gs` et `Index.html`, ce sont des fichiers additifs qui ne remplacent rien : rien de risqué avant que tu les colles ET déploies toi-même (étape 6). Pour `Planning_Format.gs`, comme c'est ton script d'origine, le coller puis l'enregistrer (étapes 2 et 5) le met à jour tout de suite pour le menu 🔧 Planning et les triggers — exactement comme à chaque fois que tu colles une évolution de ce fichier, bien avant même la webapp. Le changement de cet envoi dans ce fichier ne concerne que la feuille d'impression : ses couleurs de fond sont maintenant recalculées depuis les valeurs au moment d'imprimer, au lieu d'être copiées depuis la feuille — les PDF sortent identiques (mêmes couleurs de chantier, même orange d'absence, mêmes fériés), c'est même un peu plus juste qu'avant (une absence posée par une récurrence s'imprimait sur fond blanc, elle sort maintenant en orange comme les autres).

Si une action dans l'appli échoue une fois déployée (perte de connexion, etc.), elle te le dit clairement et n'enregistre rien à moitié — ce que tu avais tapé reste affiché pour que tu puisses réessayer.

---

## Pour info : ce que les fichiers font, en bref

- **WebApp.gs** : sert la page (`doGet`) et lit/écrit directement la feuille « Planning » réelle — charger une semaine, enregistrer une case, ajouter/supprimer une ligne, assigner un chantier à toute l'équipe, générer le PDF (réutilise `imprimerSemaine()`, donc mêmes PDF, et le même ménage automatique de la feuille d'impression, que depuis le menu desktop — cf. `Planning_Format.gs` ci-dessous). **Depuis le 28.08.2026**, il calcule aussi l'aperçu et applique le décalage en masse — une ligne ou tout le planning (cf. « Décaler le planning » plus bas) — toujours en 2 temps : lecture seule pour l'aperçu, écriture réelle seulement une fois tes choix connus, recalculé depuis la feuille à chaque fois plutôt que de faire confiance à un résultat déjà affiché à l'écran. **Et depuis le même soir**, il n'écrit plus que les valeurs — plus aucune mise en forme — à chaque saisie (cf. « La feuille n'est plus repeinte à chaque saisie » plus bas).
- **Index.html** : l'appli elle-même — même design que la maquette que tu avais validée, maintenant branchée sur tes vraies données au lieu d'exemples fixes. Le titre de la fiche affiche la date complète du jour concerné (tâche, sous-traitant, note, jalon), et dans la fiche tâche/sous-traitant, le nom et la date de ce titre sont cliquables pour déplacer la case (cf. « Déplacer une case » plus bas). **Depuis le 28.08.2026**, toucher l'en-tête d'un jour dans la grille ouvre l'outil de décalage en masse (cf. « Décaler le planning » plus bas).
- **Planning_Format.gs** : ton script d'origine, celui de toujours. La webapp lui emprunte des fonctions ; depuis le 28.08.2026, elle y entraîne aussi de vrais changements de comportement — **qui concernent le menu 🔧 Planning et le trigger mobile autant que l'appli, pas seulement l'appli** : couleur automatique verte sur « béton » retirée ; l'impression du PDF reprend la couleur rouge d'une note « Important » ligne par ligne, jamais toute la case (cf. plus bas) ; la feuille d'impression « 📋 S... » se supprime toute seule, sur les 3 chemins à la fois, dès que le PDF correspondant est bien enregistré dans Drive (cf. « Feuille d'impression » plus bas) ; et depuis le dernier envoi, l'impression recalcule TOUTES ses couleurs (fonds compris) depuis les valeurs, au lieu de copier ce qui est peint sur la feuille (cf. « La feuille n'est plus repeinte à chaque saisie » plus haut). Le reste (migrations, etc.) continue à fonctionner exactement pareil.

À l'ouverture, l'appli se place toute seule sur la **semaine en cours** (ou la prochaine si celle-ci n'existe pas encore dans le planning), et la colonne du jour est mise en évidence.

### Les semaines se créent toutes seules

À chaque ouverture, l'appli vérifie que le planning a bien **5 semaines d'avance** et crée celles qui manquent — exactement comme « ➕ Ajouter semaine suivante » au menu (noms et chantiers repris de la semaine précédente, jamais les détails ni les congés). Elle te dit ce qu'elle a créé.

### Vitesse

L'appli garde en mémoire les semaines déjà consultées : y revenir est **instantané et ne redemande rien au serveur** pendant 90 secondes. Passé ce délai, elle revérifie discrètement en arrière-plan. Concrètement, ça ne change quelque chose que si le planning est modifié **ailleurs** pendant que tu l'utilises (directement dans Google Sheets, ou par quelqu'un d'autre) : au pire, tu vois ce changement avec ce petit retard sur une semaine que tu avais déjà ouverte. Tout ce que tu enregistres depuis l'appli, lui, s'affiche évidemment tout de suite.

Pour changer ce délai, en tête d'`Index.html` :

```
var FRAICHEUR_MS = 90 * 1000;   // 0 = revérifier à chaque fois (comme avant)
```

Deux réglages, en tête de `WebApp.gs`, si tu veux changer ça :

```
var SEMAINES_AVANCE = 5;                 // combien de semaines d'avance
var MAX_CREATIONS_PAR_OUVERTURE = 6;     // sécurité : jamais plus par ouverture
```

Le plafond sert au cas où le planning aurait pris beaucoup de retard : au lieu d'en créer trente d'un coup, l'appli rattrape sur quelques ouvertures et te le signale.

### La feuille n'est plus repeinte à chaque saisie (28.08.2026)

Chaque enregistrement depuis l'appli repeignait aussi la case sur la vraie feuille Google Sheets (couleur du chantier, orange d'absence, rouge d'une tâche importante). Comme tu n'as plus besoin de ces mises en forme, l'appli n'écrit plus que les valeurs — c'est ce qui rend l'enregistrement, l'assignation groupée et surtout le décalage en masse nettement plus économes en allers-retours.

Concrètement :

- **Dans l'appli et sur les PDF, rien ne change** : l'appli colore sa grille elle-même, et le PDF recalcule toutes ses couleurs à partir des valeurs au moment d'imprimer. Tu ne verras aucune différence là où tu travailles.
- **Sur la feuille brute dans Google Sheets**, une case fraîchement saisie peut rester sans couleur un moment. Tout est remis en couleurs automatiquement à chaque création de semaine (environ une fois par semaine), et le menu 🔧 Planning > mise en forme fait pareil à la demande — la feuille ne reste donc jamais dépareillée bien longtemps.
- **Si quelqu'un utilise encore la feuille brute comme vue de travail** (toi ou un collègue, directement dans Google Sheets), dis-le-moi : remettre la peinture à chaque saisie est un petit changement, facile à refaire.

Dans la fiche d'une case, les propositions dépendent du **nom de la ligne** : « Béton / armature » pour tout ce qui contient *armature* ou *béton*, « Second œuvre » pour *2nd œuvre*, *second œuvre* ou *finition*. Les absences (Congé, Absent, Maladie, Vacances) sont proposées au **personnel uniquement** — un sous-traitant n'est pas « en congé », c'est son statut de réservation (Confirmé/À réserver/Annulé) qui porte cette information.

La liste est en tête de `Index.html`, sous le titre `TEXTES RAPIDES PAR MÉTIER` — chaque bloc a ses mots-clés et ses textes, il suffit de recopier un bloc pour ajouter un métier.

Trois points à connaître :

1. **Personnel / sous-traitants : c'est la ligne qui décide.** Tout ce qui commence à la **ligne 22** ou en dessous s'affiche dans « Sous-traitants », le reste dans « Personnel ». Rien n'est écrit dans ta feuille pour ça — les noms restent exactement comme ils sont aujourd'hui.

   Si un jour tu ajoutes ou supprimes du personnel **directement dans Google Sheets** au-dessus des sous-traitants, tout descend ou remonte de 4 lignes : il faut alors corriger ce nombre. Il est tout en haut de `WebApp.gs`, bien visible :

   ```
   var PREMIERE_LIGNE_SOUS_TRAITANT = 22;
   ```

   Tu changes le 22, tu enregistres, et c'est réglé (pas besoin de redéployer). Les ajouts faits **depuis l'appli**, eux, se rangent tout seuls du bon côté — tu n'as rien à faire.

2. **Statut d'un sous-traitant** — la vraie feuille n'a pas de colonne dédiée, donc l'appli écrit le statut en tête de chaque ligne du détail : `[Confirmé] `, `[Réservé] `, etc. C'est la mise au propre de ce que tu tapes déjà à la main, et ça reste lisible tel quel si tu ouvres la case dans Google Sheets. Une case où tu avais déjà tapé un statut librement (sans ce format) s'affiche normalement, simplement sans statut structuré, tant qu'elle n'a pas été réenregistrée une fois depuis l'appli.

   **Plusieurs tâches sur la même demi-journée, chacune avec son propre statut.** Dans la fiche d'une case sous-traitant, bouton **« + Ajouter une tâche »** : chaque tâche a son propre texte et son propre statut (Aucun/À réserver/Réservé/Confirmé/Annulé). Dans la grille et à l'impression, chaque tâche affiche sa propre pastille de statut, l'une sous l'autre. Une case déjà remplie avec plusieurs lignes de texte et un seul statut (ancienne saisie) s'affiche désormais comme plusieurs tâches distinctes dès la réouverture — seule la première garde le statut, les autres n'en ont pas tant que tu ne leur en donnes pas un toi-même.

   **Depuis le 28.08.2026, le personnel a exactement la même fiche « + Ajouter une tâche »** (sans le statut, propre aux sous-traitants) — c'est le correctif direct à « j'ai des doubles tâches que je ne peux pas modifier » : une case personnel à plusieurs lignes se décompose maintenant, elle aussi, en tâches modifiables et supprimables séparément, au lieu d'un seul bloc de texte.

   **Le bouton pour supprimer une tâche est maintenant toujours visible**, même s'il n'en reste qu'une seule (avant, il fallait passer par « + Ajouter » puis annuler pour vider une case à une seule tâche — plus lent). Cliquer dessus sur la DERNIÈRE tâche restante ne fait pas disparaître la ligne (il en faut toujours au moins une dans la fiche) : elle est simplement vidée, ce qui revient à enregistrer une case vide une fois que tu sauvegardes.

3. **Ajouter une personne** réutilise une ligne déjà vide si possible, sinon en crée une nouvelle qui apparaît (vide) sur toutes les semaines — exactement comme le fait déjà aujourd'hui « 👤 Ajouter du personnel » au menu.

   **Renommer ou retirer une ligne** propose maintenant deux portées : « Cette semaine » (par défaut) ou « Cette semaine et les suivantes ». **Les semaines passées ne sont jamais modifiées**, quel que soit le choix — c'est volontaire, pour ne jamais réécrire l'historique.

### Chantiers, jalons et notes

- **Bouton « Chantiers »** (barre du haut) : change la couleur d'un chantier existant (sélecteur de couleur natif) et/ou en ajoute un nouveau, en une seule fois. La couleur proposée pour un nouveau chantier vient de la palette imprimable (`CHANTIER_PALETTE` dans `Planning_Format.gs`).
- **Une nouvelle semaine n'a plus aucun chantier pré-rempli** — seuls les noms sont repris de la semaine précédente, à toi d'assigner les chantiers. (Le menu desktop « ➕ Créer la semaine suivante », lui, continue de tout reprendre comme avant — ce changement ne touche que l'appli.)
- **Poser un jalon ou une note sur un jour qui en a déjà un** ajoute le texte à la ligne du dessous au lieu de l'écraser — pratique pour empiler plusieurs informations sur le même jour sans perdre ce qui y était déjà. Rouvrir une case déjà remplie depuis la grille, en revanche, permet toujours de remplacer ou d'effacer son contenu comme avant.
- **Depuis le 28.08.2026, une case « notes » peut contenir plusieurs notes indépendantes le même jour**, exactement comme les tâches ci-dessus — c'est ce qui te permet de bien séparer une note qui court sur plusieurs jours d'une autre qui ne concerne qu'un seul jour, même si elles tombent toutes les deux sur la même date. Rouvrir une case avec une seule note ouvre directement l'éditeur, comme avant ; dès qu'il y en a 2 ou plus le même jour, un petit choix s'affiche d'abord pour modifier ou supprimer l'une sans toucher aux autres. **À l'impression, les notes d'un même jour s'affichent maintenant chacune sur sa propre ligne** dans la case — c'était le 2e point de ta demande, elles ne se mélangent plus visuellement.

### Tag « Important »

Sur une tâche (personnel ou sous-traitant) comme sur une note, un chip à bascule **« Important »** dans la fiche fait ressortir le texte en rouge — à l'affichage dans la grille, et à l'impression. Indépendant du statut de réservation (les deux peuvent cohabiter sur la même tâche) et indépendant aussi de la coloration automatique déjà existante sur certains mots-clés (« important », « urgent ») : les deux mènent au même rouge, mais celui-ci est un choix que tu poses toi-même, pas un mot à retenir ou à taper d'une certaine façon. Si une case contient plusieurs tâches ou notes et qu'une seule est taguée Important, c'est TOUTE la case qui ressort en rouge dans le vrai Google Sheet (la grille de l'appli, elle, est plus précise et ne colore que le texte concerné) — une limitation de Google Sheets plutôt qu'un choix : la couleur du texte d'une cellule ne peut pas varier ligne par ligne à l'intérieur d'elle-même.

### Feuille d'impression (« 📋 S... »)

Imprimer une semaine — depuis le menu 🔧 Planning, le trigger mobile, ou le bouton « Générer le PDF » de l'appli — crée toujours un onglet temporaire « 📋 S<n> » dans ton Google Sheet : c'est lui qui sert de source à l'export PDF vers Drive (**Boulot > plannings**). **Depuis le 28.08.2026, cet onglet se supprime tout seul dès que le PDF est bien enregistré dans Drive — sur les 3 chemins.** Avant ce round, seule l'appli faisait ce ménage automatiquement ; le menu desktop et le trigger mobile laissaient l'onglet ouvert pour que tu l'imprimes/l'exportes toi-même depuis Google Sheets. Ce n'est plus le cas : si le PDF est généré avec succès, il n'y a plus besoin de garder l'onglet, quel que soit le chemin utilisé.

**Si l'enregistrement du PDF dans Drive échoue** (connexion, droits, etc.), l'onglet est gardé — filet de sécurité pour ne pas te laisser sans rien à imprimer, comme avant ce round. Le message affiché après l'impression te le dit clairement dans les deux cas.

Si des onglets « 📋 S... » traînent quand même (ancienne génération, export resté en échec, etc.), le menu **🔧 Planning > 🗑️ Supprimer feuilles impression** les nettoie tous en un coup, comme avant.

### Déplacer une case

Dans la fiche d'une case personnel/sous-traitant déjà remplie, le nom et la date affichés en haut (« Bastien · Jeu 10 oct. après-midi ») sont cliquables (soulignés en pointillé) :

- **Toucher la date** ouvre un choix de demi-journée (Matin/Après-midi) puis de jour, parmi les 5 jours de la semaine affichée.
- **Toucher le nom** ouvre un choix d'une autre personne — uniquement dans la même section (le personnel entre eux, les sous-traitants entre eux).

Choisir une destination déplace tout de suite le contenu de la case (chantier + tâches) vers cette destination, et vide la case d'origine. **Depuis le 28.08.2026, si la case choisie n'est pas vide**, un choix s'affiche au lieu de bloquer purement et simplement :

- **Ne rien faire** : rien ne bouge, comme avant.
- **Écraser** : le contenu qui arrive remplace tout ce qu'il y avait sur la case destination.
- **Ajouter** : les deux se combinent — le chantier de la destination est gardé s'il y en avait déjà un, sinon celui qui arrive le remplit ; les tâches s'empilent, sans dupliquer un texte identique déjà présent.

Limité pour l'instant à la semaine actuellement affichée (jour ou personne) : impossible de déplacer directement vers une autre semaine. Pour décaler plusieurs jours d'un coup, toute une ligne ou tout le planning, cf. « Décaler le planning » ci-dessous.

### Décaler le planning

Pour décaler d'un coup tout ce qui est déjà rempli à partir d'un jour donné — une ligne ou tout le monde, de plusieurs jours d'un coup — **touche l'en-tête d'un jour** en haut de la grille (là où sont écrits son nom et sa date). Ça ouvre directement la fiche « Décaler le planning », avec ce jour déjà choisi comme point de départ.

- **Portée** : une ligne (tu choisis qui) ou tout le monde.
- **Sens** : avancer ou reculer.
- **Nombre de jours ouvrables** : samedis et dimanches ignorés, jours fériés comptés comme des jours normaux (comme partout ailleurs dans l'appli).

Bouton **Aperçu** : rien n'est encore écrit à ce stade. Tu vois d'abord un résumé chiffré — combien de cases se déplacent sans problème, combien posent un conflit (une case déjà occupée à l'arrivée), combien sont impossibles (par exemple reculer sur un jour déjà passé). Chaque conflit se règle individuellement avec les 3 mêmes choix que pour déplacer une seule case : ne rien faire, écraser, ou ajouter (cf. « Déplacer une case » ci-dessus pour le détail d'« ajouter »). Les cas impossibles sont juste listés à titre d'information, rien à décider — ils ne bougent pas.

Bouton **Confirmer** pour appliquer tes choix, ou **Retour** pour changer la portée/le sens/le nombre de jours sans perdre les choix déjà faits sur les conflits en cours.

**Jalons, notes et récurrences ne sont jamais concernés** par ce décalage — ce sont des dates qui ne dépendent pas de l'avancement du chantier (un jour d'école, une séance, un congé restent posés là où ils sont), exactement comme tu l'avais demandé. Pour décaler un jalon ou une note, cf. la section dédiée ci-dessous.

Si le décalage dépasse la dernière semaine actuellement dans le planning, les semaines nécessaires se créent toutes seules (jamais plus de 10 d'un coup — sécurité contre une faute de frappe sur le nombre de jours).

### Décaler un jalon ou une note

Dans la fiche de modification d'un jalon ou d'une note déjà posé (jamais sur un nouvel ajout — rien à décaler sur du neuf), un nouveau bloc **« Décaler ce jalon/cette note »** propose deux boutons de part et d'autre d'un nombre de jours :

- **◀ Plus tôt** recule Début et Fin de N jours ouvrables ; **Plus tard ▶** les avance d'autant. N se tape dans la case au milieu (1 par défaut).
- Les champs Début/Fin se mettent à jour tout de suite sous tes yeux (le titre de la fiche aussi), mais **rien n'est encore enregistré** — clique sur Enregistrer pour confirmer, exactement comme si tu avais changé les dates toi-même. Tu peux aussi cliquer plusieurs fois de suite, ou Annuler pour ne rien garder.
- « Jours ouvrables » compte les jours de semaine (samedi/dimanche ignorés, comme le reste de cette fiche) — un jour férié compte pour l'instant comme un jour normal. Dis-le-moi si tu préfères que les fériés soient sautés aussi, c'est facile à ajuster.

C'est un raccourci, pas un nouveau mécanisme : décaler ainsi revient exactement à modifier les dates à la main, avec le même résultat (l'ancienne plage se vide, la nouvelle se remplit).

### Tâches récurrentes

**Bouton « Récurrences »** (barre du haut) : pour tout ce qui revient chaque semaine — une séance de chantier tous les lundis, l'école d'un apprenti tous les mercredis matin, etc. — sans avoir à le retaper à la main semaine après semaine.

- **Ajouter une récurrence** : choisis le type (Jalon, Note, ou Personne), le jour de la semaine, et le texte. Pour une récurrence « Personne », choisis en plus qui et Matin / Après-midi / **Journée** (les deux à la fois — pratique pour un congé ou une absence qui dure toute la journée, plus besoin de créer 2 récurrences). Elle se pose tout de suite sur la semaine affichée et toutes les suivantes, et ensuite automatiquement sur chaque nouvelle semaine créée.
- **Elle n'écrase jamais ce que tu as déjà tapé.** Un jalon ou une note récurrent s'ajoute à côté d'un texte déjà présent (jamais de doublon si elle repasse deux fois par la même case). Une récurrence « Personne » ne remplit une demi-journée que si elle est encore complètement vide — dès que tu y as mis un chantier ou un texte toi-même, la récurrence ne touche plus cette demi-journée. Avec « Journée », le matin et l'après-midi sont traités chacun de leur côté : si l'après-midi est déjà occupé mais pas le matin, seul le matin reçoit le texte de la récurrence.
- **Mettre en pause** (interrupteur à côté de chaque récurrence) : elle arrête de se poser sur les nouvelles semaines, mais ce qu'elle avait déjà écrit reste en place.
- **Supprimer** : en plus de ne plus se poser à l'avenir, elle retire aussi le texte qu'elle avait déjà écrit sur les semaines à venir (mais jamais sur les semaines passées, et jamais si tu as modifié cette case entre-temps).

Comme partout ailleurs dans l'appli, **les semaines passées ne sont jamais modifiées** par une récurrence, que ce soit à l'ajout ou à la suppression.
