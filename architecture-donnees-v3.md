# Architecture des données — réponse à Lionel (29.08.2026)

Question de Lionel, avant de commencer le travail sur la copie du vrai fichier (V3) : « comment gère-t-on les changement et l'ajout de nom, les changement de semaine, l'ajout de chantier, les texte rapide des sous-traitants, les status, les jours de congé et de vacances de l'entreprise ? toutes ces donnée sont sur la v2. penses-tu partir d'une feuille sheet vierge et monter ta base de donnée de manière plus adaptée au planning ? et si un de mes collègue souhaite aussi utiliser sa version de ce planning mais n'a pas de connaissance informatique, simplifier l'installation de l'app ? »

Complément de Lionel juste après : « j'ai une feuille nommée fériés avec la liste de tous les congés » — a corrigé une erreur de ma première réponse (cf. ci-dessous).

## Où vivent les données aujourd'hui (V2, `WebApp.gs`/`Planning_Format.gs`/`Index.html`)

Trois familles, de granularité très différente :

1. **Dans la structure même de la feuille « Planning »** : noms du personnel/sous-traitants (une ligne = une personne, convention de position — ligne ≥ 22 = sous-traitant, cf. `PREMIERE_LIGNE_SOUS_TRAITANT`), semaines (un bloc de colonnes, création automatique via `SEMAINES_AVANCE`). Déjà éditable par Lionel depuis l'appli (ajouter/renommer/retirer une personne, les semaines se créent toutes seules).
2. **Dans des feuilles de configuration dédiées, déjà éditables par Lionel directement dans Google Sheets** : « Chantier » (nom + couleur, bouton « Chantiers » dans l'appli) et **« Fériés »**, qui contient EN RÉALITÉ déjà toute la donnée demandée — vérifié en lisant le vrai fichier (Drive) plutôt qu'en supposant. Colonne A = libellé (Noël, Pâques, Vacances été, Vacances Noël, Pont fête dieu…), colonne B = date, colonne C = une catégorie visuelle que Lionel a lui-même ajoutée pour s'y retrouir (Compensés / Fériés / Vacances) —**purement décorative, le script ne la lit jamais**. Ce que le script (`lireFeries()`, `Planning_Format.gs`) lit réellement : colonnes A+B, et la COULEUR DE FOND de la cellule du libellé (colonne A) comme couleur d'affichage/impression de ce jour. Toutes les lignes sont traitées à l'identique, qu'il s'agisse d'un jour férié officiel ou d'une semaine de vacances d'entreprise — aucune distinction de catégorie dans le code.
3. **Codé en dur dans `Index.html`, modifiable seulement en passant par une session Claude** : table `TEXTES_METIER` (textes rapides par mot-clé de métier), liste des statuts de réservation sous-traitant (Aucun/À réserver/Réservé/Confirmé/Annulé). C'est le vrai trou identifié par Lionel — pas de feuille dédiée, donc pas de self-service pour lui.

**Correction par rapport à ma première réponse** : j'avais affirmé qu'il n'existait « rien pour une vraie fermeture d'entreprise/vacances collectives ». C'est faux — Lionel l'a déjà, dans « Fériés », alimentée à la main avec toutes les dates de l'année (fériés officiels, ponts, vacances d'été, vacances de Noël). Ce qui est vrai en revanche : cette donnée n'est aujourd'hui utilisée QUE pour la couleur d'affichage/impression de la colonne du jour — elle ne fait rien de plus (pas d'avertissement si quelqu'un est planifié un jour de vacances d'entreprise, pas d'exclusion de ces jours du calcul « jours ouvrables » du décalage en masse, qui ne saute que les week-ends). Si Lionel veut que ces jours soient aussi exploités activement (avertir/bloquer une saisie dessus, les exclure du décompte de jours ouvrables), c'est une extension possible à discuter — rien construit ni demandé pour l'instant.

## Décision : pas de refonte complète, compléter ce qui manque

Recommandation donnée à Lionel : ne PAS repartir d'une feuille vierge avec un schéma de données entièrement nouveau. Le modèle actuel (une ligne = une personne, partagée par toutes les semaines) fonctionne en production, une bonne partie du script (impression, décalage en masse, récurrences, `detecterPersonnes`) est calée dessus — une refonte ferait courir un vrai risque à un outil déjà en service pour un gain surtout théorique.

**Ce qui reste à compléter, une fois la correction ci-dessus prise en compte** — seulement 2 feuilles de config manquantes, pas 3 :
- **« Textes rapides »** (métier → liste de textes) — remplace `TEXTES_METIER` codé en dur.
- **« Statuts »** — la liste des statuts sous-traitant, éditable/renommable par Lionel.
- ~~« Vacances entreprise »~~ — inutile, déjà couvert par « Fériés » (cf. ci-dessus). Seule question ouverte : faut-il exploiter cette donnée plus activement (avertissement/blocage, exclusion du calcul jours ouvrables) ?

Éventuellement, à l'occasion du chantier V3, faire sortir la liste du personnel de la simple position de ligne vers une vraie petite liste (la convention « ligne 22 » reste fragile si Lionel modifie la feuille brute directement) — mais ce point peut attendre que le reste soit stabilisé, pas urgent.

## Installation simplifiée pour un collègue (données séparées, confirmé par Lionel)

Contexte confirmé par Lionel : un collègue qui voudrait sa propre version aurait SES PROPRES données (personnel, chantiers, planning), séparées de celles de Lionel — pas un accès au planning de Lionel.

Un script Apps Script lié (« bound ») à un Google Sheet voyage avec la feuille lors d'une copie (Fichier > Créer une copie) — le code n'a donc pas besoin d'être copié-collé à la main par le collègue. Plan proposé (pas encore construit, en attente du feu vert de Lionel) :

1. Préparer un fichier « modèle » : la structure actuelle de Lionel, nettoyée de ses données réelles (personnel/chantiers/planning vidés, mais la structure « Fériés »/« Chantier » conservée comme squelette à adapter), avec les 3 fichiers de script déjà en place.
2. Le collègue ouvre le modèle, Fichier > Créer une copie → obtient sa propre feuille avec le script déjà collé dedans.
3. Dans sa copie : Extensions > Apps Script > Déployer > Nouveau déploiement > Application Web > Déployer, autoriser l'accès (étape Google, un peu impressionnante visuellement mais inévitable).
4. Coller l'URL obtenue sur son téléphone, ajouter à l'écran d'accueil.

Réduit l'installation à « faire une copie » + « déployer » — plus aucun code à voir ou à coller (contre les 3 étapes de copier-coller manuel de `claude/Installation.md` aujourd'hui). Pas totalement zéro-friction (l'autorisation Google reste un vrai clic technique), mais très en dessous de l'existant.

## Prochaine étape

En attente de la réponse de Lionel sur : (a) faut-il intégrer les 2 feuilles de config restantes (textes rapides, statuts) maintenant, ou attendre un round dédié une fois la V3 (interface bulles) posée sur la copie du vrai fichier ; (a bis) veut-il exploiter plus activement les dates de « Fériés » (avertissement/blocage de saisie, exclusion du calcul jours ouvrables) ; (b) faut-il préparer le modèle d'installation simplifié pour un collègue dès maintenant. Rien construit tant que ces points ne sont pas confirmés — cf. `claude/planning-status.md` pour l'état complet du script V2 en production, et `claude/V3-spec.md` pour la maquette d'interface en cours de validation séparément.
