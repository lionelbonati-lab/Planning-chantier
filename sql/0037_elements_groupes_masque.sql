-- ============================================================
-- Planning Chantiers — élément de liste masqué (Machines / Transports)
-- Migration 0037 — 01.10.2026 (suite 139)
--
-- Lionel : « Chaque machine/transport a sa coche qui le fera apparaître ou
-- non dans la liste clic droit. »
--
--   elements_groupes.masque : l'élément n'est plus proposé au clic droit
--   des lignes Machines / Transports, sans être supprimé (coche
--   « Afficher » des pages Machines / Transports). Les bulles déjà posées
--   ne changent pas.
--
-- Droits, RLS et sauvegardes inchangés (même table, sql/0036).
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `elements_groupes_masque`) ; ce fichier garde la trace.
-- Rejouable.
-- ============================================================

alter table elements_groupes add column if not exists masque boolean not null default false;

notify pgrst, 'reload schema';
