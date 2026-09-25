-- ============================================================
-- Planning Chantiers — horaires de travail
-- Migration 0014 — 25.09.2026 (suite 27)
--
-- Lionel : « J'aimerai une nouvelle page horaires de travail. Pouvoir
-- entrer les horaires comme le tableau en bas à gauche » (feuille PMB
-- « Horaire de travail 2026 » : une ligne par période, ex. « Mars, du 2 au
-- 31, matin 07:00-12:00, après-midi 13:00-17:00 »).
--
-- Une ligne = une période de dates (bornes incluses) et ses horaires. Un
-- seul horaire pour toute l'entreprise, comme sur la feuille (pas de lien
-- avec `personnes`). L'après-midi est facultatif : certains jours ne
-- travaillent que le matin (17 juillet, 18 décembre sur la feuille 2026).
-- La page Horaires (js/page-horaires.js) refuse les périodes qui se
-- chevauchent ; la base ne le vérifie pas (exclusion constraint = extension
-- btree_gist, inutile pour une table de quelques dizaines de lignes).
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `horaires`) ; ce fichier garde la trace. `if not exists` sur
-- la table ; policy recréée proprement (drop if exists) : rejouable.
-- ============================================================

create table if not exists horaires (
  id bigint generated always as identity primary key,
  date_debut date not null,
  date_fin date not null,
  matin_debut time not null,
  matin_fin time not null,
  aprem_debut time,
  aprem_fin time,
  -- Pause retirée de la durée du matin, en minutes. La feuille PMB compte
  -- les heures TRAVAILLÉES : 07:00-12:00 y vaut 04:45, 07:45-12:00 04:00,
  -- le 17 juillet 07:00-10:15 03:00 (« il convient d'y ajouter 1/4 d'heure
  -- de pause par jour »). Ajoutée juste après la création (migration
  -- `horaires_pause_matin`), table encore vide.
  pause_matin smallint not null default 15,
  constraint horaires_pause_positive check (pause_matin >= 0),
  constraint horaires_dates_ordre check (date_fin >= date_debut),
  constraint horaires_matin_ordre check (matin_fin > matin_debut),
  constraint horaires_aprem_complet check ((aprem_debut is null) = (aprem_fin is null)),
  constraint horaires_aprem_ordre check (aprem_debut is null or aprem_fin > aprem_debut)
);

create index if not exists idx_horaires_date_debut on horaires (date_debut);

alter table horaires enable row level security;
-- Pattern RLS de toute l'appli (mono-tenant) — identique à feries.
drop policy if exists "connecte_tout" on horaires;
create policy "connecte_tout" on horaires for all to authenticated using (true) with check (true);
-- Grant explicite requis pour une table créée en SQL (cf. 0004, 0005, 0011).
grant select, insert, update, delete on horaires to authenticated;
