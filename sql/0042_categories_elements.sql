-- ============================================================
-- Planning Chantiers — catégories des listes Machines / Transports
-- Migration 0042 — 21.10.2026 (suite 148)
--
-- Lionel : « J'aimerai pouvoir trier ma liste de machines et grouper par
-- catégorie. Et pour les trier par lister, déposer, plutôt que par les
-- petites flèches. Dans le menu, clic droit de la souris, on aura du coup
-- les catégories, et ensuite, dans un sous-menu, les machines de la
-- catégorie. »
-- Ses choix : « Liste de catégories » (ajoutées, renommées, supprimées sur
-- la page Machines / Transports, machines glissées d'une catégorie à
-- l'autre) ; « Machines et Transports » ; machine sans catégorie : « Dans
-- « Autres » » (dernier sous-menu du clic droit).
--
--   1. categories_elements : les catégories de la liste d'un groupe,
--      dans leur ordre (glisser-déposer). Supprimer une catégorie garde
--      ses éléments : ils passent dans « Autres » (on delete set null).
--   2. elements_groupes.categorie_id : la catégorie de l'élément, null =
--      « Autres ». `ordre` reste le rang de l'élément dans sa catégorie.
--
-- Sauvegardes (sql/0017) : categories_elements après groupes, avant
-- elements_groupes (restauration dans l'ordre, effacement à rebours).
-- Une ancienne sauvegarde sans la table restaurée : tout dans « Autres ».
--
-- À appliquer dans l'éditeur SQL de Supabase. Rejouable.
-- ============================================================

create table if not exists categories_elements (
  id bigint generated always as identity primary key,
  groupe_id bigint not null references groupes (id) on delete cascade,
  nom text not null check (length(btrim(nom)) > 0),
  ordre integer not null default 0,
  cree_le timestamptz not null default now()
);
-- Index de la clé étrangère (cf. 0013).
create index if not exists categories_elements_groupe on categories_elements (groupe_id);

alter table categories_elements enable row level security;
drop policy if exists "connecte_tout" on categories_elements;
create policy "connecte_tout" on categories_elements for all to authenticated using (true) with check (true);
grant select, insert, update, delete on categories_elements to authenticated;

alter table elements_groupes add column if not exists categorie_id bigint references categories_elements (id) on delete set null;
create index if not exists elements_groupes_categorie on elements_groupes (categorie_id);

create or replace function tables_sauvegardees_() returns text[]
language sql immutable set search_path = public as $$
  select array['statuts', 'chantiers', 'groupes', 'categories_elements', 'elements_groupes', 'personnes', 'categories_feries', 'feries',
    'couleurs_perso', 'horaires', 'reglages', 'formulaires_rapides', 'formulaires_rapides_champs', 'series', 'assignations', 'taches',
    'jalons', 'notes', 'equipes_compositions', 'equipes_exceptions'];
$$;

notify pgrst, 'reload schema';
