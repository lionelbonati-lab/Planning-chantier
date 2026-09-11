# Planning V3 — spec de départ (29.08.2026, complétée le même jour)

**Statut : en phase de validation sur maquette, rien n'est encore implémenté sur le vrai planning.**

Lionel veut travailler la V3 sur une COPIE du fichier, pour garder l'ancienne version utilisable pendant que la nouvelle se construit.

## Demandes de Lionel — 1er message

1. Cliquer une case propose un menu permettant d'ajouter rapidement une absence ou une tâche (inspiré de Nolio).
2. Cliquer une tâche permet de la modifier.
3. Maj (shift) en déplaçant une bulle permet de la copier plutôt que la déplacer. **Devenu : Maj à la souris, barre du bas avec Annuler/Copier/Déplacer après le geste au tactile (points 48, 55, 58, 60).**
4. Pas de menu de conflit quand une case est déjà occupée — la bulle s'ajoute directement.
5. Petite croix sur chaque bulle pour supprimer rapidement. **Retirée par la suite (point 41)** — la suppression passe maintenant par le formulaire d'édition ou la sélection de cases.
6. Possibilité d'afficher 1 ou 2 semaines à l'écran.
7. Notes et « légende » doivent avoir le même comportement (hypothèse : la ligne des jalons — à confirmer).
8. 2 notes le même jour doivent être visuellement séparées, pas mélangées dans la même case.
9. L'impression devra peut-être passer par du HTML — la feuille Sheets ne servirait plus que de base de données. **Question d'architecture à part, à creuser une fois les interactions validées.**

## Demandes de Lionel — 2e message, complément

10. Cliquer-étendre sur plusieurs cases puis relâcher ajoute la même tâche/note/jalon/absence sur toutes les cases sélectionnées.
11. En mode 2 semaines, les 2 semaines doivent se suivre horizontalement, pas verticalement.
12. Cliquer le bord d'une bulle pour l'étendre à gauche/droite (resize). **Implémenté et généralisé** — TOUTE bulle personnel/sous-traitant a des poignées gauche/droite, même créée par un simple clic (voir point 31).
13. Proposer une date de fin ou une durée en jours dans les fiches note et jalon.
14. Idem pour le personnel, en demi-journées. **Résolu autrement (point 29/31)** : la durée vient de la sélection ou du redimensionnement, jamais d'un champ Durée tapé.

## Demandes de Lionel — 3e à 7e messages, corrections successives

15. Délai (~0,5s) avant activation du mode sélection tactile, pour ne pas gêner le défilement sur tablette.
16. Chaque demi-journée du personnel doit être une bulle indépendante (supprimable seule). **Toujours vrai** — une bulle couvre la plage de jours choisie sur SA ligne (matin ou aprem) ; depuis le point 43, elle peut aussi changer de personne/ligne en la déplaçant.
17. Bug : modifier une bulle issue d'une plage recréait plusieurs tâches (système de « groupe »). Retiré, puis un système différent (lié uniquement matin↔aprem) a été testé et à son tour retiré (point 29) — plus aucune liaison nulle part aujourd'hui.
18. La sélection doit fonctionner **verticalement** pour le personnel (plusieurs ouvriers × demi-journées × jours en un geste). **Repris pour la sélection rapide (point 46).**
19. Barrières : tâche ↔ notes ↔ jalons jamais mélangés ; personnel ↔ sous-traitants jamais mélangés.
20. Correction du point 19 : sous-traitants sélectionnables/déplaçables matin ET après-midi (comme le personnel) — seule la frontière personnel↔sous-traitant reste bloquée.
21. Suppression du remplissage automatique matin+après-midi : une sélection ne remplit que les lignes réellement sélectionnées.
22. Retrait complet du champ Durée (jours) pour les tâches du personnel/sous-traitants — gardé uniquement pour jalons/notes.
23. **Jalons et notes sur plusieurs jours doivent être UNE SEULE bulle** — déplacer/modifier/supprimer agit sur le bloc entier.
24. Le même principe de délai (0,5s avant activation) doit aussi s'appliquer au déplacement d'une bulle existante, pas seulement à la sélection.
25. Bug de la croix de suppression affectée par le même problème de délai tactile. **Corrigé** (avant d'être retirée au point 41).
26. Implémentation littérale du point 12 : glisser le bord (gauche ou droite) d'une bulle jalon/note pour l'étendre ou la réduire. **Implémenté.**

## Demandes de Lionel — 8e message

27. Bug : impossible d'ajouter une tâche/note/jalon sur une case déjà occupée. **Corrigé** — bouton "+" toujours cliquable sur chaque case, même pleine (voir point 30 pour son repositionnement, puis point 41 pour son retrait).
28. 1er essai (case à cocher "bulle unique" créant un rectangle matin+aprem) — **rejeté par Lionel**.

## Demandes de Lionel — 9e message

29. 2e essai demandé : bulles séparées par ligne (matin/aprem jamais fusionnées) mais **liées en arrière-plan** pour la suppression (supprimer le matin supprime aussi l'aprem). **Testé, puis lui-même rejeté au message suivant** (point 31 : "ne plus lier les tâches d'une ligne à l'autre").

## Demandes de Lionel — 10e message

30. Bug : la vue revient à gauche après chaque modification. **Corrigé** — le défilement horizontal du `.scroller` est mémorisé avant `render()` et restauré juste après.
31. Bug : le "+" chevauche la croix de suppression d'une bulle. **Corrigé** puis les deux ont finalement été retirés (point 41).
32. Bug : les bulles simples (1 case) disparaissent, invisibles sous une tâche multi-jours qui les recouvre. **Corrigé structurellement** (voir "Refonte du modèle" ci-dessous) : plus de superposition possible, tout s'empile proprement en pistes.
33. Retirer la liaison matin↔aprem testée au point 29 : chaque ligne (matin OU aprem) reste strictement indépendante, y compris pour la suppression — **fait**.
34. Nouvelle demande : pouvoir sélectionner plusieurs bulles EXISTANTES pour les supprimer/déplacer/copier ensemble. **Implémenté**, puis entièrement retravaillé à plusieurs reprises (points 39, 42, 46).

## Demandes de Lionel — 11e message (dans la foulée du 10e)

35. Les bulles multi-cases prenaient toute la hauteur de leur case — à dimensionner comme les bulles standard. **Corrigé.**
36. Les bulles créées sur 1 seule case (clic simple) doivent, elles aussi, pouvoir être étendues (poignées). **Corrigé.**

## Demandes de Lionel — 12e message

37. "Je ne peux plus déplacer une tâche d'une ligne, ni la copier d'ailleurs." **Investigué** (tests automatisés répétés en glisser souris, glisser+Maj, et glisser tactile simulé sur bulles personnel/jalon/note : tout fonctionne dans le code actuel). Cause la plus probable : le mode "Sélection multiple" du point 34 bloquait volontairement TOUT glisser normal dès qu'il était actif (un clic sur une bulle ne faisait plus que la cocher) — Lionel l'avait sans doute laissé activé en testant. Résolu de fait par la refonte du point 39 : le mode Sélection ne bloque plus le glisser, il l'étend au groupe.
38. Rejet du système de sélection multiple en flèches ±1 jour : "impossible de copier où je le souhaite une fois sélectionné." Demande explicite : garder le même geste que pour une bulle seule (glisser = déplacer, Maj+glisser = copier), une touche Suppr/Retour arrière au clavier pour supprimer sur ordinateur, un bouton "copie" supplémentaire pour tablette (remplace Maj), et renommer le bouton "Sélection" tout court. **Le bouton "Copie" a depuis été retiré à son tour (point 48) au profit de boutons contextuels au tactile.**

## Demandes de Lionel — 13e message

39. Suppression multi-cases par clic droit/double-tap : "un clic droit et une sélection de plusieurs cases doit permettre de supprimer le contenu de plusieurs cases en même temps avec validation, dans ce cas les cases sélectionnées apparaissent en rouge. Double tape et tirer sur tablette tactile." **Implémenté en rouge, puis entièrement revu en bleu et fusionné avec la sélection de bulles (point 46).**
40. "Passer en jaune le coloriage d'une case où le déplacement est interdit." **Implémenté en jaune, puis en orange (point 49) — le jaune ressemblait trop aux notes.**
41. "Les 2 croix sont trop rapprochées sur tablette, enlever le x de supprimer et le + de tâches, c'est trop lourd visuellement et en plus cela masque la barre pour agrandir une tâche." **Fait** — les deux boutons ont été retirés. Suppression : formulaire d'édition (tap une bulle → bouton "Supprimer") ou sélection de cases. Ajout : tap sur le fond visible d'une case (plus besoin d'un bouton dédié, il suffisait déjà de cibler le fond).
42. En mode sélection, le glisser de groupe ne montrait rien bouger visuellement — "troublant". Demande : la barre du bas ne doit garder QUE le bouton de suppression (ovale rouge), avec validation avant toute suppression ; impossible de faire défiler le planning pendant un glisser sur tablette — défilement automatique en bord d'écran demandé. **Fait** — voir "Sélection — v3" et "Défilement automatique" ci-dessous.
43. "Le déplacement d'une ligne à l'autre est toujours impossible, je dois pouvoir déplacer une tâche n'importe où entre le personnel." **Fait** — contredit et remplace la contrainte posée aux points 16/33 (une tâche restait bloquée sur SA personne et SA ligne). Une tâche personnel/sous-traitant peut maintenant changer de personne ET de ligne (matin/aprem) en la glissant ; seule la frontière personnel ↔ sous-traitant (point 19/20, jamais remise en cause).

## Sélection — v3, glisser visible + barre réduite (29.08.2026, points 42, 59)

**Design de la barre du bas revu au point 60-61 — voir "Barre d'action unique" plus bas ; le principe (glisser visible, bouton Annuler séparé) reste, seule sa présentation change.**

- **Glisser un groupe se voit** : chaque bulle cochée reçoit un clone visuel (fantôme) qui suit le doigt/curseur pendant le geste (l'originale s'estompe pendant ce temps), exactement comme pour une bulle seule.
- **Barre du bas** : un bouton ovale rouge "Supprimer" (toujours avec confirmation), et depuis le 17e message un bouton "Annuler" juste à côté pour désélectionner et sortir du mode "Sélection" sans rien supprimer ni déplacer (point 59) — en plus de la sortie automatique déjà en place à la fin de toute action réussie (point 51).
- La touche Suppr/Retour arrière au clavier passe aussi par la même confirmation que le bouton "Supprimer".

## Défilement automatique en bord d'écran (point 42)

Pendant tout glisser armé (bulle seule, groupe sélectionné, ou sélection rapide de cases), s'approcher du bord gauche/droit visible du planning fait défiler la vue automatiquement (vitesse proportionnelle à la proximité du bord), pour pouvoir déplacer une bulle au-delà de l'écran visible sans lever le doigt — notamment sur tablette où le geste de glisser empêche par ailleurs tout défilement manuel.

## Demandes de Lionel — 14e message

Retours détaillés après test de la version "suppression multi-cases en rouge" :

44. "Sur tablette, je ne peux bouger le planning que en mettant mon doigt sur une tâche. Pas pratique." **Corrigé** — en mode "Sélection", un simple glisser sur le fond d'une case fait maintenant défiler normalement (avant : aucune réaction, seul un doigt posé sur une bulle permettait de défiler).
45. "Le double clic [double-tap] est très pratique, par contre il serait mieux que la sélection soit faite comme pour l'ajout de tâches en ligne × colonne. On va utiliser cette fonction comme une sélection multiple rapide." **Fait** — voir "Sélection rapide" ci-dessous : le clic droit/double-tap + tirer réutilise maintenant EXACTEMENT le même algorithme rectangle (multi-lignes pour le personnel/sous-traitant, comme au point 18) que le geste d'ajout, au lieu d'un ramassage libre case par case.
46. "On glisse le tout sur le bouton supprimer ou on appuie dessus, les 2 options. On peut déplacer cette sélection comme un déplacement/copie unique sur ordi." **Fait** — la sélection rapide alimente directement le mode "Sélection" existant (mêmes bulles cochées), donc hérite de tout : glisser le groupe pour déplacer/copier, glisser jusqu'au bouton rouge OU cliquer dessus pour supprimer (avec confirmation dans les deux cas).
47. "La sélection passe en bleu au lieu de rouge. On peut ainsi supprimer le bouton copier." **Fait** — la sélection rapide réutilise le même surlignage bleu (`selection-active`) que le geste d'ajout à l'origine ; depuis le point 54, l'ajout a lui-même changé de couleur (vert) pour rester distinct de la sélection. Le rouge ne sert plus qu'à la confirmation de suppression. Le bouton "Copie" a été retiré (point 48 explique par quoi il est remplacé).
48. "Sur tablette, après déplacement proposer de copier ou de déplacer via un menu à l'emplacement du doigt" — pour la sélection ET pour une bulle seule. **Fait, puis revu aux points 56, 58 et 60** (position et forme des boutons changées à chaque fois).
49. "Les déplacements interdits passent en orange, jaune trop similaire aux notes." **Fait.**
50. Mode standard : "sur tablette, lors de la sélection d'une tâche le texte de la tâche est automatiquement sélectionné, ce qui ouvre le clavier et cache la fenêtre, pas pratique, ne rien sélectionner lors de l'ouverture de la fenêtre. Idem sur ordinateur." **Fait** (revu au point 53, le clavier s'ouvrait encore).

## Sélection rapide de cases (v4, 29.08.2026, points 44-48 — remplace la "suppression multi-cases" du point 39)

Clic droit (souris) ou double-tap (tactile, deux `pointerdown` sur la même case en moins de 400ms) puis tirer : sélectionne un rectangle de cases avec le MÊME algorithme que l'ajout par glisser (`lignesSecteur`/`trouverIndexLigne`/`trouverCellules`/`surlignerRectangle`) — donc multi-lignes pour le personnel/sous-traitant (une section à la fois), en surlignage bleu (distinct du vert de l'ajout, point 54). Au relâcher, toute bulle (tâche/absence/jalon/note) dont la plage touche un des jours sélectionnés sur sa ligne est COCHÉE (mode "Sélection" activé automatiquement si besoin) — pas de suppression immédiate. À partir de là, la sélection se comporte exactement comme une sélection manuelle (tap par tap) : on peut la glisser pour la déplacer/copier comme une bulle seule, la glisser jusqu'au bouton rouge "Supprimer" en bas ou cliquer dessus pour la supprimer (toujours avec confirmation), cliquer "Annuler" pour tout désélectionner sans rien changer (point 59), ou tout décocher en quittant le mode "Sélection" — désormais automatique en fin d'action réussie (point 51). Pas de délai d'armement pour ce geste (contrairement aux autres gestes tactiles) : le clic droit et le double-tap sont déjà volontaires, sans ambiguïté avec le défilement. Depuis le 16e message, le clic droit n'ouvre plus jamais le menu contextuel du navigateur, nulle part sur la page (point 57).

**Bug corrigé au 18e message (point 60)** : ce geste cochait bien les bulles et activait le mode Sélection, mais la barre du bas ne s'affichait pas dans certains cas (notamment sur téléphone) — une fonction interne oubliait de rafraîchir son affichage.

## 3 boutons Annuler/Copier/Déplacer au tactile (v6, points 48, 52, 55, 56, 58 — **design remplacé au point 60, voir "Barre d'action unique" ci-dessous**)

À la souris, Maj+glisser copie immédiatement (comportement inchangé depuis le 1er message). Au tactile, il n'y a pas de touche Maj : tout glisser (bulle seule ou groupe sélectionné) se terminait par 3 boutons à plat — **Annuler / Copier / Déplacer**, dans cet ordre (demande de Lionel, 29.08.2026 : "plutôt qu'un menu, proposer 3 boutons, annuler/copier/déplacer" — ce n'était plus présenté comme un menu déroulant avec titre, seulement 3 boutons regroupés). Juste avant leur affichage, la ou les bulles se "posent" visuellement dans leur case cible : plus de scale/rotation/grande ombre — l'aspect "soulevé" que Lionel signalait au 16e message a été explicitement retiré (classe `posee`, ajoutée AVANT de mesurer/positionner pour que la mesure ne soit pas faussée par l'ancien agrandissement — **ce point reste vrai avec le nouveau design**). Les 3 boutons étaient positionnés en bas de l'écran, à l'endroit du bouton "Supprimer" (même forme de barre ovale), plutôt qu'à l'endroit du doigt.

Trois issues possibles : "Déplacer" et "Copier" appliquent le changement (et sortent du mode Sélection le cas échéant, point 51) ; "Annuler" annule pour de bon et remet tout en place. Toucher en dehors des boutons n'annulait rien — ça les cachait juste, la bulle (ou le groupe) restait gelée, posée à l'endroit où elle venait d'atterrir, mais restait attrapable : la reprendre et la redéposer ailleurs réaffichait les boutons, et ainsi de suite, autant de fois que nécessaire, jusqu'à un choix explicite (demande de Lionel, 29.08.2026 : "si rien n'est sélectionné, geler la sélection et laisser la possibilité de bouger encore. Réafficher le menu et ainsi de suite."). **Ce principe de "geler et laisser reprendre" est inchangé au point 60** ; seule la présentation (3 boutons enclos dans une bulle flottante) a été remplacée par la barre unique ci-dessous.

## Demandes de Lionel — 15e message

51. "Sortir du mode sélection automatiquement à la fin de l'action." **Fait** — que l'action soit une suppression (bouton rouge, glisser-dessus, ou touche Suppr/Retour arrière), un déplacement ou une copie, le mode "Sélection" se désactive tout seul une fois l'action effectuée (bouton "Sélection" décoché, sélection vidée, barre du bas masquée). Une annulation (bouton "Annuler", ou toucher en dehors sans jamais choisir dans l'ancien design) ne compte pas comme une action terminée : le mode Sélection reste actif dans ce cas — il faut soit re-choisir Déplacer/Copier, soit utiliser le bouton "Annuler" de la barre pour en sortir explicitement (point 59).
52. "Poser les bulles avant d'afficher le menu." **Fait**, puis le rendu du "posé" a été corrigé au point 55, et le menu lui-même remplacé par 3 boutons au point 58, puis par la barre unique au point 60.
53. Mode standard : "le clavier s'ouvre toujours quand on clique une tâche, ne pas mettre le curseur dans la barre de texte." **Fait** — le correctif du point 50 (retrait de `.select()`) ne suffisait pas : `.focus()` seul suffit encore à ouvrir le clavier tactile sur certaines tablettes. Le champ texte n'est plus du tout focalisé automatiquement à l'ouverture du formulaire (tâche/absence ou jalon/note), ni sur tablette ni sur ordinateur — l'utilisateur touche/clique le champ lui-même s'il veut modifier le texte.
54. "Sélection de plusieurs cases pour entrer une tâche passe en vert." **Fait** — le rectangle de sélection utilisé pour AJOUTER une tâche/note/jalon sur plusieurs cases (glisser normal, point 10/18) est maintenant vert (nouvelle classe `selection-add`), pour rester visuellement distinct du bleu réservé à la sélection rapide de bulles existantes (points 39/45-47).

## Demandes de Lionel — 16e message

55. "La bulle ne se pose pas correctement elle apparaît toujours comme soulevée." **Fait** — le correctif du point 52 repositionnait la bulle (left/top) mais gardait l'agrandissement/l'inclinaison/la grande ombre du glisser actif (`transform: scale(...) rotate(...)`, box-shadow prononcée), donnant toujours une impression de bulle en l'air. Nouvelle classe `posee` qui neutralise explicitement ces styles (transform none, ombre légère, petite transition d'atterrissage) — appliquée AVANT la mesure de hauteur dans `poserSurCellule`, pour que le repositionnement se base sur la taille réelle "posée" et non sur la taille agrandie du glisser.
56. "Déplace le menu glisser/déposer à la même place que le bouton supprimer. Ajouter annuler à ce menu. Si rien n'est sélectionné, geler la sélection et laisser la possibilité de bouger encore. Réafficher le menu et ainsi de suite." **Fait** — voir "3 boutons Annuler/Copier/Déplacer au tactile" ci-dessus pour le détail complet (design depuis remplacé au point 60) : boutons repositionnés en bas (position/forme de la barre de sélection), bouton "Annuler" ajouté, et le geste devient une boucle reprise-pose-boutons tant qu'aucun choix explicite n'est fait plutôt qu'une annulation automatique au moindre tap en dehors.
57. "Le clic droit sur ordinateur n'est pas optimal car le menu contextuel de la souris s'ouvre. Bloquer ce menu." **Fait** — un blocage global (`contextmenu` sur tout le document) remplace l'ancien blocage limité aux cases de fond, qui ne suffisait pas si le clic droit commençait ou passait par une bulle ou une autre zone de la page.

## Demandes de Lionel — 17e message

58. "Plutôt qu'un menu, proposer 3 boutons, annuler/copier/déplacer." **Fait, puis remplacé par la barre unique au point 60** — les 3 boutons affichés après un glisser tactile avaient été réordonnés dans l'ordre demandé : Annuler, Copier, Déplacer (auparavant Déplacer, Copier, Annuler).
59. "Mettre un bouton annuler à côté du supprimer pour déselectionner et sortir du mode sélection." **Fait, puis fusionné dans la barre unique au point 60** — bouton "Annuler" ajouté dans la barre de sélection, juste à côté de "Supprimer" : il vide la sélection et désactive le mode "Sélection" sans rien supprimer ni déplacer, indépendamment de tout geste de glisser en cours. Complète la sortie automatique du point 51, qui ne se déclenche qu'après une action réussie (pas après une simple envie d'arrêter la sélection en cours).

## Demandes de Lionel — 18e message

[2 captures d'écran jointes, vue téléphone/thème sombre] "les boutons supprimer et annuler ne s'affiche pas sur téléphone. je n'aime pas le design des 3 boutons, je préférerais des bouton distinct allongé comme l'était le bouton supprimer. il aurait le bouton annuler qui a gauche et le supprimer rouge à droite centré sur le bas de la page. lors du déplacement switcher le bouton supprimer pour les 2 boutons déplacer et copier en bleu. annuler reste en place. en couleur noir ou blanc selon le fond."

60. **Bug corrigé** : sur téléphone (et en fait sur tout appareil, dans certains cas), les boutons Supprimer/Annuler n'apparaissaient pas après une sélection rapide (clic droit ou double-tap + tirer, point 45). Cause trouvée : la fonction qui transforme ce geste en sélection de bulles (`selectionnerDepuisCellules`) cochait bien les bulles et activait le mode "Sélection", mais oubliait d'appeler la fonction qui synchronise l'affichage de la barre du bas — celle-ci restait donc cachée même avec une sélection active, quel que soit l'appareil (une sélection tap par tap n'était, elle, pas touchée par ce bug). Corrigé en ajoutant l'appel manquant.
61. **Nouveau design de la barre du bas — "barre d'action unique"** : remplace à la fois l'ancienne barre de sélection (Supprimer + Annuler, points 42/59) et l'ancien menu à 3 boutons enclos dans une bulle flottante (points 48/56/58). Une seule barre fixe en bas de l'écran, centrée, avec des boutons individuellement dessinés en pilule allongée (comme l'était l'ancien bouton "Supprimer" seul) — plus de fond/bulle englobante autour du groupe de boutons. "Annuler" reste toujours à gauche, à la même position, que ce soit pour désélectionner (sélection au repos) ou pour annuler un glisser en cours (choix déplacer/copier en attente) — seule l'action qu'il déclenche change selon le contexte, pas sa position ni son style. À droite : soit "Supprimer" (rouge) quand une sélection est au repos, soit "Copier" et "Déplacer" (bleu) juste après un glisser tactile en attente de choix — jamais les deux jeux de boutons affichés en même temps. Couleur d'"Annuler" neutre, qui s'adapte au thème clair/sombre (fond clair + texte foncé en thème clair, fond foncé + texte clair en thème sombre) via les mêmes variables CSS que le reste de l'interface — "en couleur noir ou blanc selon le fond" (demande de Lionel). Comme avant (point 56/60 précédent), la bulle/le groupe posé reste attrapable pendant que "Copier"/"Déplacer" sont affichés : le reprendre et le redéposer ailleurs réaffiche la barre avec Copier/Déplacer, en boucle jusqu'à un choix explicite.

## Barre d'action unique (v7, points 60-61 ; ancrage revu v8, points 62-63 — remplace "Sélection — v3" et "3 boutons Annuler/Copier/Déplacer au tactile" ci-dessus pour tout ce qui concerne la PRÉSENTATION de la barre du bas)

Une seule barre (bas du planning, centrée), contenant 4 boutons présents en permanence dans la page mais affichés/masqués individuellement selon le contexte :

- **Annuler** (gris neutre, bordure) — toujours affiché quand la barre est visible, toujours à gauche.
- **Supprimer** (rouge) — affiché quand une sélection de bulles est au repos (mode "Sélection" actif, au moins une bulle cochée, aucun glisser en cours). Clic = suppression avec confirmation (comme avant).
- **Copier** et **Déplacer** (bleu, tous les deux) — affichés à la place de "Supprimer" juste après un glisser tactile (bulle seule ou groupe), tant qu'aucun choix n'a été fait. Remplacent l'ancien menu à 3 boutons flottant à l'emplacement du doigt (points 48/56), lui-même déjà déplacé en bas de l'écran au point 56.

Chaque bouton est un ovale allongé indépendant (padding généreux, coins arrondis à 999px, ombre portée légère), sans fond ni bulle englobante commune — direct sur le fond de la page, comme l'ancien bouton "Supprimer" seul le faisait déjà. "Annuler" ne change jamais de position ni de style entre les deux contextes (sélection au repos / choix glisser en attente) ; seule la fonction qu'il déclenche en interne change.

**Ancrage — `position: sticky`, pas `fixed` (point 62)** : la barre est placée dans un conteneur dédié qui n'enveloppe QUE la grille (`.zone-planning`, autour de `#racine`), juste après elle. Résultat : en glissant/scrollant la page, la barre reste collée au bas de l'écran tant que le planning est encore visible au-dessus, mais elle se détache et redevient un élément normal du flux dès que le bas de la grille est atteint — elle ne peut donc plus rester plaquée par-dessus la note d'aide affichée sous le planning, ni traîner en bas d'une page bien plus longue que la grille elle-même. Avant ce changement, la barre était en `position: fixed` par rapport à la fenêtre entière, donc toujours collée au bas de l'écran quel que soit l'endroit défilé de la page.

**Annuler sort aussi du mode Sélection après un déplacement (point 63)** : auparavant, annuler le choix Copier/Déplacer après un glisser (bulle seule ou groupe) remettait juste la bulle à sa place SANS désactiver le mode "Sélection" — cohérent avec le point 51 ("une annulation ne compte pas comme une action terminée"). Lionel a demandé l'inverse pour ce cas précis : cliquer "Annuler" à ce moment-là (juste après avoir glissé une bulle/un groupe) désélectionne maintenant tout et sort du mode "Sélection", comme le ferait un Déplacer/Copier réussi. Le bouton "Annuler" de la barre au repos (à côté de "Supprimer", point 59) n'est pas concerné par ce changement : il sortait déjà du mode Sélection.

Ce design corrige au passage le bug du point 60 : comme la fonction de sélection rapide appelle maintenant systématiquement la même fonction de synchronisation que la sélection manuelle, la barre s'affiche correctement dans tous les cas, y compris sur téléphone.

## Demandes de Lionel — 19e message

"la barre du bas doit être présente en bas de planning non pas en bas de page. le bouton annuler doit aussi sortir de la sélection après un déplacement."

62. **Fait** — voir "Ancrage — `position: sticky`" ci-dessus.
63. **Fait** — voir "Annuler sort aussi du mode Sélection après un déplacement" ci-dessus.

## Demandes de Lionel — 20e message

[capture d'écran jointe, vue ordinateur] "sur ordinateur lors du déplacement d'une bulle, une barre grise s'affiche"

64. **Bug corrigé, plus important qu'il n'y paraît** : la barre du bas s'affichait en réalité EN PERMANENCE (Annuler + Supprimer flottant par-dessus la grille), y compris hors de tout mode "Sélection" — ce qui se remarquait surtout pendant un glisser à la souris, quand la barre venait chevaucher la grille juste sous la bulle déplacée. Cause : le point 62 (barre en `position: sticky`) lui donnait un `display: flex` posé directement sur la classe `.barre-action` ; en CSS, un style d'auteur l'emporte TOUJOURS sur le style par défaut du navigateur pour l'attribut `hidden`, même à spécificité comparable — la barre ignorait donc purement et simplement `hidden` et restait affichée tout le temps, y compris dans les captures des points 60/61 qui semblaient pourtant correctes (le bug ne saute aux yeux que quand on regarde la grille elle-même, pas seulement l'état interne du bouton). Corrigé par une règle `.barre-action[hidden] { display: none; }`, plus spécifique, qui reprend la main. Aucun changement visuel pour les cas déjà couverts par les tests (l'un des deux tests utilisés jusqu'ici, qui ne vérifiait que la propriété `hidden` en JavaScript et non le rendu réel, n'aurait pas pu détecter ce bug — capture d'écran ajoutée aux vérifications pour la suite).

## Demandes de Lionel — 21e message

"enlever le bouton sélection, il ne me sert plus maintenant qu'on a trouvé les astuces. la copie ne se fait pas si on appuie sur shift après l'appuis sur la souris. il faut impérativement appuyer shift avant la souris, fait en sorte que les 2 fonctionnent. appuyer sur esc de l'ordi sert à sortir de la sélection et d'une modification de bulle sans enregistrer. ajoute des raccourcis clavier usuel pour couper, copier, coller. annuler une action, refaire une action. sur l'ordinateur, un clic sur une tâche doit la sélectionner, un double clic ou entrer pour l'ouvrir. idem sur tablette. réduire le temps de latence entre sélections et mouvement à 0,4s. mettre en évidence la case où sera ajoutée une nouvelle case en vert comme l'ajout multiple. l'espace entre le fond de la case et le bas de la bulle doit être plus grand afin de pouvoir cliquer dessus pour y ajouter une nouvelle tâche."

65. **Bouton "Sélection" retiré.** Il n'y a plus de mode à activer avant de sélectionner : un clic sur une bulle sélectionne toujours directement (voir point 68). En conséquence, tout ce qui testait "est-on en mode Sélection ?" (glisser sur le fond d'une case pendant un glisser de groupe, etc.) teste maintenant "y a-t-il une sélection active en ce moment ?" (`bullesSelectionnees` non vide) — comportement inchangé en pratique, juste sans bouton à penser à activer/désactiver.
66. **Bug corrigé — Maj après le clic souris ne copiait pas.** La copie (Maj+glisser) était décidée une seule fois, à l'instant du clic (`mousedown`), donc appuyer sur Maj un instant plus tard n'avait aucun effet. Corrigé : l'état de la touche Maj est relu à chaque mouvement de la souris pendant le glisser, jusqu'au tout dernier moment — peu importe qu'elle soit pressée avant de cliquer, pendant le glisser, ou relâchée puis re-pressée, seul son état au moment de lâcher compte désormais. Le badge "Copier X bulle(s)" apparaît/disparaît lui aussi en direct si Maj est pressée en cours de route.
67. **Échap** ferme le formulaire d'ajout/modification actuellement ouvert SANS enregistrer (équivalent au bouton "Annuler" du formulaire), ou, si aucun formulaire n'est ouvert, désélectionne tout et sort de la sélection en cours (équivalent au bouton "Annuler" de la barre du bas).
68. **Un clic sélectionne, un double clic (ou Entrée) ouvre — à la souris comme au doigt.** Avant, un simple clic sur une bulle l'ouvrait directement pour modification ; il fallait activer le bouton "Sélection" pour qu'un clic la coche à la place. Maintenant qu'il n'y a plus de bouton, c'est l'inverse par défaut : un clic (ou tap) sélectionne toujours ; il faut double-cliquer (ou double-tap) pour ouvrir, ou, quand une seule bulle est sélectionnée, appuyer sur Entrée. Même détection que le double-tap déjà utilisé pour la sélection rapide (deux clics/taps sur la MÊME bulle en moins de 400ms), mais appliquée ici à l'ouverture plutôt qu'au glisser rectangle.
69. **Raccourcis clavier usuels** (ordinateur uniquement, ignorés quand on tape dans un champ de texte pour ne pas gêner le couper/copier/coller/annuler natif du navigateur dans ce champ) :
    - **Ctrl+C** copie la sélection dans un presse-papier interne à la maquette ; **Ctrl+X** la coupe (copie + suppression, SANS demande de confirmation — contrairement au bouton "Supprimer", un couper est réversible par un collage ou un Ctrl+Z) ; **Ctrl+V** colle le contenu du presse-papier en recréant des bulles neuves, à l'identique de l'originale (même case) ; les bulles collées deviennent la nouvelle sélection.
    - **Ctrl+Z** annule la dernière action (ajout, modification, suppression, déplacement, copie, redimension, collage) ; **Ctrl+Y** (ou Ctrl+Maj+Z) la rétablit. Pile de 50 actions maximum ; repart de zéro à chaque "Réinitialiser".
    - **Suppr / Retour arrière** supprime la sélection (comme avant, avec confirmation) ; **Entrée** ouvre la bulle sélectionnée quand il n'y en a qu'une (point 68).
70. **Délai avant armement réduit de 0,5s à 0,4s** (sélection tactile, déplacement, poignées, glisser de groupe) — seule cette valeur a changé, le principe (immédiat à la souris, délai au tactile pour ne pas gêner le défilement) reste identique.
71. **Case d'ajout mise en évidence en vert.** Cliquer une case vide pour ajouter une bulle la surligne maintenant en vert (`selection-add`, même couleur que l'ajout multi-cases du point 54) tant que le popup de choix/formulaire reste ouvert — avant, rien ne montrait quelle case précise recevrait la nouvelle bulle. Le surlignage disparaît à la fermeture du popup, quel qu'en soit le chemin (bouton, clic extérieur, Échap).
72. **Espace agrandi sous chaque bulle.** La marge sous une bulle-plage est passée à 14px (contre un espace beaucoup plus mince avant), pour laisser un vrai morceau de fond de case cliquable en dessous et pouvoir y ajouter une nouvelle tâche sans viser au pixel près.

## Demandes de Lionel — 22e message

"* la touche entrée doit pouvoir servir pour valider l'enregistrement d'une tâche ou la validation de la suppression. ou d'autre validation.

* j'ai besoin de 2 flèche flottante sur le planning pour annuler et refaire une action. je verrai ca haut gauche au niveau de la case vide a gauche de semaine 36. ils doivent toujours être présent et si la page disparait les laisser fixe au dessus du planning, un peu comme la barre des déplacements.
* je n'arrive plus a déplacer mes taches entre personnel, rétabli ca.
* il ne doit plus être possible de sélectionner d'autre taches lorsque un déplacement est en cours et que le menu déplacer est apparu
* réduit encore le temps d'appuis a 0,3s"

73. **Régression corrigée — déplacement entre personnel à nouveau possible.** Le refactor du 21e message (point 68) avait fusionné le glisser d'une bulle seule avec celui d'un groupe de bulles cochées, pour partager tout le reste (Maj en direct, badge, glisser jusqu'au bouton Supprimer, boucle de reprise). Mais le calcul d'arrivée du chemin "groupe" ne déplace QUE le jour (chaque bulle du groupe doit rester sur sa propre ligne, ce qui est le bon comportement pour un vrai groupe) — il ne touchait donc plus jamais la personne/ligne (matin/aprem) d'une bulle, cassant sans le vouloir le point 43 ("je dois pouvoir déplacer une tâche n'importe où entre le personnel"). **Corrigé** en ajoutant une branche : une bulle TACHES seule (pas un vrai groupe de plusieurs bulles cochées) continue de se résoudre contre la case de dépôt réelle (personne + matin/aprem + jour), exactement comme avant le 21e message ; un vrai groupe (plusieurs bulles, ou une bulle jalon/note qui n'a pas de ligne) garde le calcul par décalage de jours qui préserve la ligne de chacun. La frontière personnel ↔ sous-traitant (points 19/20) reste infranchissable dans les deux cas. Vérifié à la souris ET au tactile (menu Déplacer/Copier), y compris en reprenant une bulle déjà "posée" pour la redéposer ailleurs.
74. **Entrée valide le popup ouvert**, qu'il s'agisse du formulaire tâche/absence/jalon/note (bouton "Enregistrer") ou d'une confirmation de suppression (bouton rouge) — y compris en tapant dans le champ texte du formulaire, où Entrée ne faisait rien auparavant (elle est maintenant vérifiée en priorité, avant le garde-fou qui ignore les autres raccourcis pendant la frappe, exactement comme Échap l'est déjà pour fermer sans enregistrer). N'importe quel autre popup à venir peut se brancher sur le même mécanisme.
75. **2 flèches flottantes Annuler/Refaire**, toujours visibles en haut à gauche du planning (au niveau de la ligne d'en-tête, à côté de la case vide avant les jours de la semaine) — grisées (mais jamais masquées) quand il n'y a rien à annuler/refaire. Ancrées de la même façon que la barre du bas (`position: sticky`) : elles restent collées en haut de l'écran si on défile plus bas que le haut du planning, et redeviennent normales une fois remontées au-delà. Font exactement la même chose que Ctrl+Z/Ctrl+Y au clavier (point 69) — un simple raccourci visuel et tactile vers la même pile de 50 actions.
76. **Impossible de sélectionner une autre bulle pendant que le menu Déplacer/Copier/Annuler est affiché.** Tant qu'une bulle ou un groupe reste "posé" en attendant un choix (Copier/Déplacer/Annuler), toute AUTRE bulle du planning ignore désormais les clics/taps/glissers — seule la bulle/le groupe posé reste manipulable (le reprendre pour le redéposer ailleurs continue de fonctionner comme avant, point 56/58). Le garde-fou se lève automatiquement dès qu'un choix est fait (Copier, Déplacer ou Annuler) ou que la sélection est vidée par ailleurs.
77. **Délai avant armement réduit de 0,4s à 0,3s** (sélection tactile, déplacement, poignées, glisser de groupe) — même principe qu'au point 70, seule la valeur change.

## Refonte du modèle personnel/sous-traitant (29.08.2026, en réponse aux points 30-36)

Les points 32/35/36 avaient tous la même cause : deux systèmes de bulles coexistaient (bulles "simples" imbriquées dans la case + bulles "plage" superposées par-dessus la grille), ce qui provoquait recouvrement, tailles incohérentes, et rendait les bulles simples non redimensionnables. **Le modèle est maintenant unifié** : toute tâche/absence personnel/sous-traitant — qu'elle vienne d'un clic simple (durée=1) ou d'une sélection multi-cases — est un item "plage" (`TACHES`, giDebut/duree sur SA ligne matin ou aprem). Chaque ligne (personne × matin/aprem) empile ses propres bulles en "pistes" comme le fait déjà la ligne Jalons/Notes : deux bulles qui se chevauchent dans le temps se placent sur des pistes différentes au lieu de se cacher l'une l'autre, et la ligne grandit dynamiquement en hauteur pour les accueillir. Chaque bulle est dimensionnée à son contenu (comme une bulle standard), pas étirée sur la hauteur de la ligne. Toutes ont des poignées gauche/droite. Depuis le point 43, une tâche peut aussi changer de personne/ligne en la déplaçant (plus seulement de jour).

## Maquette (prototype-bulles.html, publiée en artifact, même lien à chaque mise à jour)

État actuel — couvre tous les points sauf 7 (hypothèse) et 9 (hors scope) :

- **Personnel/sous-traitants** : modèle unifié `TACHES` décrit ci-dessus. Ajout par tap sur le fond visible d'une case (plus de bouton "+" dédié, retiré au point 41). Une tâche peut être déplacée vers n'importe quelle personne/ligne du même secteur (point 43).
- **Jalons/notes** : items "plage" globaux (`JALONS`/`NOTES`), une seule bulle par plage, pistes, formulaire avec champ Durée, poignées gauche/droite.
- **Suppression** : formulaire d'édition (bouton "Supprimer", plus de croix sur la bulle), ou sélection + bouton rouge/glisser-dessus/Suppr clavier — toujours avec confirmation pour les suppressions groupées, et sortie automatique de la sélection une fois la suppression faite (point 51).
- **Sélection, sans bouton ni mode (point 65)** : un simple clic/tap sur une bulle la sélectionne toujours directement — plus besoin d'activer quoi que ce soit avant (le bouton "Sélection" a été retiré). Double clic/double-tap (ou Entrée quand une seule bulle est cochée) ouvre l'édition à la place (point 68). Le clic droit/double-tap + tirer reste la façon de cocher rapidement plusieurs bulles déjà là d'un coup (point 45-47, surlignage bleu ; le clic droit n'ouvre jamais le menu contextuel du navigateur, point 57). Dans tous les cas, glisser le groupe déplace/copie, la barre d'action unique (point 61) propose "Supprimer" ou glisser dessus pour supprimer, "Annuler" pour sortir sans rien changer (point 59), et la sélection se vide aussi automatiquement une fois l'action (suppression, déplacement ou copie) terminée — y compris après une annulation qui suit un déplacement (point 63).
- **Ajout sur plusieurs cases** : glisser normal (sans clic droit/double-tap) sur le fond des cases, surlignage vert (`selection-add`, point 54). **Ajout sur une seule case (point 71)** : la case cliquée se surligne aussi en vert tant que le popup/formulaire d'ajout reste ouvert, pour montrer clairement où la nouvelle bulle sera posée.
- **Déplacer/copier** : Maj+glisser à la souris — l'état de Maj est relu en continu pendant tout le glisser, donc appuyer avant OU après le clic fonctionne pareil (point 66, corrige un bug) ; au tactile, la bulle (ou le groupe) se pose d'abord dans sa case cible SANS aspect "soulevé" (point 55), puis la barre d'action unique affiche "Annuler" (gauche, fixe) et "Copier"/"Déplacer" (droite, bleu) à la place de "Supprimer" (points 58, 60, 61). Toucher en dehors ne fait que masquer le choix : la bulle reste gelée et peut être reprise pour être redéplacée, la barre se réaffichant à chaque nouveau dépôt jusqu'à un choix explicite. Annuler ce choix désélectionne (point 63).
- **Déplacement d'une tâche vers un autre personnel/ligne (point 43), régression du 21e message corrigée (point 73)** : une bulle seule (pas un groupe de plusieurs bulles cochées) atterrit sur la case réellement visée (personne + matin/aprem + jour), à la souris comme au tactile ; un vrai groupe garde chaque bulle sur sa propre ligne (seul le jour change).
- **Pendant le menu Déplacer/Copier/Annuler (point 76)** : aucune autre bulle du planning ne peut être sélectionnée ou glissée tant que le choix n'est pas fait ; seule la bulle/le groupe posé reste manipulable.
- **Barre du bas ancrée au planning** (`position: sticky`), pas à la fenêtre entière (point 62) : elle reste collée au bas de l'écran tant que la grille défile encore au-dessus, puis se détache normalement une fois le bas du planning atteint.
- **Case interdite** : orange (dépôt refusé par un glisser, point 49) ; bleu réservé à la sélection, vert à l'ajout.
- **Défilement automatique** en bord d'écran pendant tout glisser armé ; défilement normal en glissant le fond d'une case quand une sélection est active (point 44).
- **Formulaires** : le champ texte n'est plus focalisé (ni sélectionné) à l'ouverture (points 50 et 53), pour ne jamais déclencher le clavier tactile par-dessus la fenêtre. Échap ferme le formulaire ouvert sans enregistrer, ou désélectionne s'il n'y en a pas (point 67).
- **Raccourcis clavier (point 69)** : Ctrl+C/X/V pour copier/couper/coller la sélection (couper et coller passent par un presse-papier interne, sans confirmation pour couper) ; Ctrl+Z/Ctrl+Y pour annuler/refaire n'importe quelle modification (pile de 50) ; Suppr/Retour arrière pour supprimer (confirmation) ; Entrée pour ouvrir la bulle sélectionnée quand rien d'autre n'est ouvert, ou pour valider le popup actuellement ouvert — formulaire (Enregistrer) ou confirmation de suppression — même en tapant dans le champ texte (point 74). Tous ignorés pendant la frappe dans un champ de texte, SAUF Échap et Entrée (validation/fermeture d'un popup).
- **Flèches flottantes Annuler/Refaire (point 75)** : toujours visibles en haut à gauche du planning, grisées quand rien à annuler/refaire, ancrées comme la barre du bas (collées en haut de l'écran si on défile plus bas). Équivalent visuel/tactile de Ctrl+Z/Ctrl+Y.
- Délai de 0,3s avant armement (sélection de case pour ajout, déplacement, poignées, glisser de groupe), au tactile uniquement — réduit depuis 0,5s puis 0,4s (points 70, 77) — sauf clic droit/double-tap (sélection rapide) et reprise d'une bulle gelée en attente de choix, volontaires par nature.
- Espace sous chaque bulle agrandi à 14px (point 72), pour cliquer plus facilement le fond de case en dessous.
- Démo : Mathis reste en 2 bulles indépendantes (matin + aprem, semaine 37, "Coffrage dalle") pour montrer que rien ne les lie plus.

## Simplifications assumées, encore ouvertes

- Sélection/plages plafonnées à la fenêtre affichée (5 ou 10 jours).
- Point 7 : « légende » toujours interprété comme la ligne des jalons.
- Point 9 (Sheet = base de données + impression HTML) : toujours hors mockup, question d'architecture à part.
- Double-tap tactile détecté par deux `pointerdown` sur la même case en moins de 400ms — à ajuster si ça se déclenche trop souvent/trop rarement en usage réel sur tablette.

## Prochaine étape

Attendre le retour de Lionel sur cette nouvelle version (régression du déplacement entre personnel corrigée ; Entrée valide un formulaire/une confirmation ouverts, même en tapant ; 2 flèches flottantes Annuler/Refaire toujours visibles en haut à gauche du planning ; plus aucune autre bulle sélectionnable pendant le menu Déplacer/Copier/Annuler ; délai réduit à 0,3s) avant de commencer le travail sur la copie du vrai fichier (V3). Rien à faire côté Index.html / WebApp.gs / Planning_Format.gs tant que les interactions ne sont pas validées.
