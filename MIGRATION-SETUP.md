# Démarrer la migration — ce que toi seule peux faire

Ce guide couvre uniquement les étapes de la **phase 1** (§6 de
`MIGRATION-GITHUB-PLAN.md`) qui demandent un compte à toi — création de
compte, de projet, autorisations. Rien de tout ça ne peut se faire depuis
une session Claude (exactement comme aujourd'hui, où tu es la seule à
pouvoir coller le code dans l'éditeur Apps Script et déployer). Une fois ces
comptes créés, la suite (schéma, code) peut avancer sans nouvel aller-retour
de ce genre.

Deux comptes à créer, tous les deux gratuits pour ce projet (cf. §7 du plan).

## 1. Créer le projet Supabase (la nouvelle base de données)

1. Va sur [supabase.com](https://supabase.com), **Start your project**, crée
   un compte (email, ou connexion GitHub si tu as déjà un compte GitHub —
   pratique, ça relie tout de suite les deux).
2. **New project** : donne-lui un nom (ex. "planning-chantiers"), choisis un
   mot de passe pour la base (généré automatiquement si tu préfères — garde-le
   de côté, il ne sert qu'en cas de besoin technique avancé, pas pour l'usage
   quotidien de l'appli), et une région proche (Europe, ex. Frankfurt).
3. Attends une minute ou deux que le projet se crée.
4. Dans le menu de gauche, **SQL Editor** > **New query**. Colle le contenu
   de `sql/0001_schema.sql`, clique **Run**. Puis fais pareil avec
   `sql/0002_rls.sql`. Si tout se passe bien, tu vois "Success" — les tables
   sont créées (visibles dans **Table Editor** dans le menu de gauche, un peu
   comme des feuilles Google Sheets).
5. **Authentication** (menu de gauche) > **Users** > **Add user** : crée ton
   propre compte (l'email que tu veux utiliser pour te connecter à l'appli,
   un mot de passe). C'est ce compte que l'appli te demandera plus tard.
6. Note deux informations, dans **Project Settings** (roue crantée, en bas du
   menu de gauche) > **API** : **Project URL** et **anon public key** — deux
   longues chaînes de caractères. Elles ne sont pas secrètes au sens strict
   (elles sont conçues pour être visibles dans le code d'une appli web), mais
   garde-les de côté, elles serviront à brancher l'appli dessus.

## 2. Créer le dépôt GitHub (où vivra le code, versionné)

1. Va sur [github.com](https://github.com), crée un compte si tu n'en as pas
   déjà un.
2. **New repository** : nom (ex. "planning-chantiers"), coche **Private**
   (le code et les noms de ton équipe n'ont pas besoin d'être publics), ne
   coche rien d'autre pour l'instant.
3. C'est tout pour cette étape — le contenu (code, schéma, tests) sera
   déposé dedans lors d'une prochaine session, une fois que tu confirmes que
   les comptes ci-dessus sont prêts.

## Ensuite

Une fois les 2 comptes créés et les 2 fichiers SQL exécutés (étape 1.4), dis-le
et la suite peut continuer : déposer le code dans le dépôt GitHub, écrire les
fonctions serveur (Edge Functions), adapter `Index.html` pour parler à
Supabase au lieu de Google, puis activer GitHub Pages. Rien de bloquant avant
ça — l'appli actuelle continue de fonctionner normalement pendant ce temps.
