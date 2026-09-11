-- ============================================================
-- Planning Chantiers — sécurité d'accès (Row Level Security)
-- Migration 0002 — 03.09.2026
--
-- À exécuter APRÈS 0001_schema.sql, dans le même Éditeur SQL Supabase.
--
-- Principe simple pour démarrer : sans compte connecté (Supabase Auth),
-- personne ne peut ni lire ni écrire quoi que ce soit — l'appli n'est pas
-- consultable publiquement. Une fois connecté (n'importe quel compte créé
-- dans Supabase Auth, cf. MIGRATION-SETUP.md), on peut tout lire et tout
-- écrire — suffisant pour une petite équipe où tous les comptes créés sont
-- de confiance. Si un jour il faut distinguer (ex. lecture seule pour
-- l'équipe de chantier, écriture pour Lionel uniquement), ces règles
-- s'affinent à ce moment-là, table par table, sans tout reprendre.
--
-- Rejouable sans risque (supprime chaque règle si elle existe déjà avant de
-- la recréer) — utile si ce script a déjà été lancé une première fois.
-- ============================================================

drop policy if exists "connecte_tout" on personnes;
drop policy if exists "connecte_tout" on chantiers;
drop policy if exists "connecte_tout" on statuts;
drop policy if exists "connecte_tout" on formulaires_rapides;
drop policy if exists "connecte_tout" on formulaires_rapides_champs;
drop policy if exists "connecte_tout" on feries;
drop policy if exists "connecte_tout" on series;
drop policy if exists "connecte_tout" on assignations;
drop policy if exists "connecte_tout" on taches;
drop policy if exists "connecte_tout" on jalons;
drop policy if exists "connecte_tout" on notes;

alter table personnes enable row level security;
alter table chantiers enable row level security;
alter table statuts enable row level security;
alter table formulaires_rapides enable row level security;
alter table formulaires_rapides_champs enable row level security;
alter table feries enable row level security;
alter table series enable row level security;
alter table assignations enable row level security;
alter table taches enable row level security;
alter table jalons enable row level security;
alter table notes enable row level security;

create policy "connecte_tout" on personnes for all to authenticated using (true) with check (true);
create policy "connecte_tout" on chantiers for all to authenticated using (true) with check (true);
create policy "connecte_tout" on statuts for all to authenticated using (true) with check (true);
create policy "connecte_tout" on formulaires_rapides for all to authenticated using (true) with check (true);
create policy "connecte_tout" on formulaires_rapides_champs for all to authenticated using (true) with check (true);
create policy "connecte_tout" on feries for all to authenticated using (true) with check (true);
create policy "connecte_tout" on series for all to authenticated using (true) with check (true);
create policy "connecte_tout" on assignations for all to authenticated using (true) with check (true);
create policy "connecte_tout" on taches for all to authenticated using (true) with check (true);
create policy "connecte_tout" on jalons for all to authenticated using (true) with check (true);
create policy "connecte_tout" on notes for all to authenticated using (true) with check (true);
