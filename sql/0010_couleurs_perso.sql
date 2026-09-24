-- Round B (24.09.2026) — Lionel : « Les couleurs devrait être les mêmes sur
-- tous les appareils du même compte. Comme les chantiers. »
-- Table de réglages minimaliste, même gabarit que categories_feries
-- (id text primary key, pas de bigint identity, pas de timestamps).
-- Un id par "groupe" de couleur personnalisable (ex. "principale", "fond",
-- "jalons", ...), clair/sombre nullable (upsert partiel : une couleur peut
-- être définie pour un seul des 2 thèmes sans toucher l'autre colonne).
--
-- ATTENTION : cette migration a déjà été appliquée EN DIRECT sur le projet
-- Supabase de production (mvqvznohgtpulpgalvxl, migration
-- 20260924104048_couleurs_perso) via l'outil MCP Supabase pendant une
-- session précédente — cette table EXISTE DÉJÀ en base. Ce fichier ne fait
-- que documenter la migration dans le repo (dossier claude/sql/, convention
-- déjà suivie par 0001-0009) : NE PAS le ré-appliquer tel quel sans
-- vérifier d'abord (`create table if not exists` ci-dessous par sécurité,
-- mais la policy/les grants ne sont pas idempotents en l'état — retirer ces
-- 2 dernières instructions si la table existe déjà avec sa policy/ses
-- grants, cf. contenu vérifié ci-dessous).

create table if not exists couleurs_perso (
  id text primary key,
  clair text,
  sombre text
);

alter table couleurs_perso enable row level security;

-- Pattern RLS standard de toute l'appli (mono-tenant, pas de scoping par
-- utilisateur) — identique à categories_feries/chantiers/etc.
create policy "connecte_tout" on couleurs_perso
  for all to authenticated using (true) with check (true);

-- Les tables créées via l'éditeur SQL/l'API n'héritent PAS des grants par
-- défaut (contrairement à une création depuis le Table Editor) — grant
-- explicite requis, comme pour chaque autre table de l'appli.
grant select, insert, update, delete on couleurs_perso to authenticated;
