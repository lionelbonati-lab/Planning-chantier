-- ============================================================
-- Planning Chantiers — actif/ordre sur les chantiers (parité avec personnes)
-- Migration 0008 — 14.09.2026
--
-- Lionel : « j'aimerais pouvoir trier et désactiver mes entrées dans les
-- listes personnel, chantier, intervenant. » Personnel/Intervenants avaient
-- déjà ces 2 colonnes depuis le tout premier schéma (sql/0001, table
-- personnes) ; Chantiers ne les a jamais eues — cette migration comble
-- l'écart en ajoutant exactement les 2 mêmes colonnes, mêmes types/défauts,
-- à la table chantiers.
--
-- actif (défaut true) : un chantier désactivé disparaît des listes
-- déroulantes/légende utilisées pour poser une NOUVELLE tâche/jalon, mais
-- reste résolu normalement pour tout ce qui existe déjà (cf.
-- FRONTEND-CHANGELOG.md — CHANTIERS/etat.chantiersParId restent construits
-- depuis la liste COMPLÈTE, jamais filtrée à actif=true côté client,
-- contrairement à personnes où une personne désactivée disparaît de tout,
-- historique compris — cf. commentaire de desactiverPersonneServeur/
-- basculerActifPersonneServeur dans Index.html : les 2 tables ne se
-- comportent pas pareil une fois désactivées, une différence assumée liée
-- à ce qu'elles représentent (une ligne de la grille vs un simple attribut
-- de case).
--
-- ordre (défaut 0, backfill = id) : même principe que personnes.ordre,
-- permet le tri ↑/↓ par ligne dans la page de gestion. Backfill sur les 3
-- lignes déjà en base (BINE/Filisetti/Ecole St-Ursanne) : ordre = id, pour
-- préserver leur ordre d'apparition actuel (par ordre de création) au
-- premier chargement après la migration.
--
-- Appliquée directement sur le projet Supabase via le connecteur MCP au
-- moment où la demande a été traitée (même méthode que 0003/0005/0006/0007)
-- — ce fichier documente juste ce qui a déjà été fait, pas besoin de le
-- recoller dans l'éditeur SQL. Aucun GRANT/RLS supplémentaire nécessaire
-- (policy "connecte_tout" déjà en place table par table depuis 0002_rls.sql
-- / 0004_grants_authenticated.sql, sans restriction par colonne).
-- ============================================================

alter table chantiers add column if not exists actif boolean not null default true;
alter table chantiers add column if not exists ordre integer not null default 0;
update chantiers set ordre = id;
