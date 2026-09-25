-- ============================================================
-- Planning Chantiers — un chantier PAR TÂCHE (taches.chantier_id)
-- Migration 0010 — 16.09.2026
--
-- Fichier ajouté le 24.09.2026 (suite 24, rattrapage) : cette migration a
-- été appliquée en base le 16.09.2026 (supabase_migrations, version
-- 20260916073025 « taches_chantier_id ») sans que son fichier soit ajouté
-- au dépôt — alors que le code la cite partout sous ce nom
-- (sql/0010_taches_chantier_id.sql). Contenu recopié tel qu'appliqué.
--
-- Lionel : « plusieurs chantier sur la même case ... actuellement si une
-- tâche est affecté à un chantier, la tâche déjà en place change de
-- chantier ». Chaque ligne `taches` porte désormais son propre chantier ;
-- la table `assignations` (un chantier par case) n'est plus écrite. Reprise
-- des données : chaque tâche existante (hors absences) prend le chantier de
-- la 1re assignation de sa case.
--
-- Rejouable sans risque (if not exists ; la reprise ne touche que les
-- tâches encore sans chantier).
-- ============================================================

alter table taches add column if not exists chantier_id bigint references chantiers(id) on delete set null;
create index if not exists idx_taches_chantier on taches (chantier_id);

with premiere_assignation as (
  select distinct on (personne_id, date, demi) personne_id, date, demi, chantier_id
  from assignations
  order by personne_id, date, demi, id asc
)
update taches t
set chantier_id = a.chantier_id
from premiere_assignation a
where a.personne_id = t.personne_id and a.date = t.date and a.demi = t.demi
  and t.chantier_id is null
  and t.est_absence = false;
