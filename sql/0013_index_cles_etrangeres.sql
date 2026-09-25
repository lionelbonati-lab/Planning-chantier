-- ============================================================
-- Planning Chantiers — index des clés étrangères
-- Migration 0013 — 24.09.2026 (suite 24)
--
-- Lionel, à la question « Supabase » de la revue : « Ajouter les index ».
-- L'analyseur de performances Supabase (lint 0001 « unindexed foreign
-- keys ») relevait 10 clés étrangères sans index. Sans index, deux cas
-- lisent la table entière :
--   - un filtre sur la colonne, ex. `serie_id` : chaque modification ou
--     suppression d'une série (js/series.js) cherche toutes ses occurrences
--     dans taches/notes/jalons ;
--   - la suppression d'une ligne référencée (un chantier, un statut, une
--     personne, une série) : Postgres vérifie les lignes qui la citent.
-- Aujourd'hui les volumes sont petits, mais ces tables grossissent chaque
-- semaine (une ligne par demi-journée et par personne pour `taches`).
--
-- `if not exists` : rejouable sans erreur. Appliquée directement sur le
-- projet via l'outil Supabase de la session ; ce fichier garde la trace.
-- ============================================================

create index if not exists idx_taches_serie               on taches (serie_id);
create index if not exists idx_taches_statut              on taches (statut_id);
create index if not exists idx_notes_serie                on notes (serie_id);
create index if not exists idx_jalons_serie               on jalons (serie_id);
create index if not exists idx_jalons_chantier            on jalons (chantier_id);
create index if not exists idx_series_chantier            on series (chantier_id);
create index if not exists idx_series_cible_personne      on series (cible_personne_id);
create index if not exists idx_series_statut              on series (statut_id);
create index if not exists idx_assignations_chantier      on assignations (chantier_id);
create index if not exists idx_formulaires_rapides_champs_formulaire on formulaires_rapides_champs (formulaire_id);
