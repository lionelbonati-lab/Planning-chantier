-- ============================================================
-- Planning Chantiers — droits manquants pour le rôle "authenticated"
-- Migration 0004 — 04.09.2026
--
-- Corrige l'erreur "permission denied for table personnes" rencontrée par
-- Lionel en testant le chargement (phase 4, étape 2) : les tables ont été
-- créées via l'Éditeur SQL (0001_schema.sql), ce qui NE donne PAS
-- automatiquement à Supabase les droits SQL de base (SELECT/INSERT/UPDATE/
-- DELETE) pour les rôles anon/authenticated — contrairement à une table
-- créée depuis l'interface "Table Editor" du tableau de bord, qui les
-- accorde toute seule. RLS (0002_rls.sql) ne suffit pas seule : une policy
-- RLS ne fait que RESTREINDRE des droits déjà accordés au niveau SQL, elle
-- n'en accorde jamais elle-même. Sans ce GRANT, même un utilisateur connecté
-- et autorisé par la policy "connecte_tout" se voit refuser l'accès avant
-- même que la policy soit évaluée — d'où le message "permission denied"
-- plutôt qu'un simple "0 ligne renvoyée".
--
-- À exécuter dans l'Éditeur SQL Supabase, comme 0001/0002/0003 — cette
-- migration n'a PAS pu être appliquée automatiquement depuis cette session
-- (une action GRANT sur des rôles est bloquée par les garde-fous de
-- sécurité de l'environnement d'agent, qui refuse d'élargir des droits
-- d'accès sans confirmation humaine directe).
--
-- Rejouable sans risque (GRANT est idempotent : le relancer ne fait rien de
-- plus si les droits sont déjà accordés).
-- ============================================================

grant select, insert, update, delete on
  personnes, chantiers, statuts, formulaires_rapides, formulaires_rapides_champs,
  feries, series, assignations, taches, jalons, notes
to authenticated;

-- Les colonnes "id" (bigint generated always as identity) reposent sur une
-- séquence Postgres sous-jacente : sans ce droit, un INSERT échouerait
-- séparément même après le GRANT ci-dessus (autre garde-fou par défaut de
-- Postgres, indépendant des GRANT de table).
grant usage, select on all sequences in schema public to authenticated;
