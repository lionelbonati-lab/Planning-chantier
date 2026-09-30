-- Round du 30.09.2026 (suite 132) — groupes de lignes du planning.
-- Lionel (retour n° 4, page Améliorations et bugs) : « Les groupes
-- machines et transports font leur apparitions.
-- J'aimerai pouvoir réorganiser mes groupes dans le planning. »
--
-- Jusqu'ici, 2 groupes fixes de lignes : Personnel (sous_traitant = false)
-- et Intervenants (sous_traitant = true). Cette table ajoute des groupes
-- nommés — Machines et Transports créés d'office, d'autres possibles plus
-- tard — et chaque ligne de `personnes` peut y être rangée (groupe_id).
-- groupe_id null : la ligne reste dans Personnel ou Intervenants, comme
-- avant. Les tâches d'une machine sont de vraies tâches (taches.personne_id
-- = la ligne), sans rien de plus en base.
-- L'ordre des groupes dans le planning (réorganisable) est un réglage du
-- compte (table reglages, clé « ordre_groupes ») : pas de colonne ici
-- pour Personnel / Intervenants / Jalons / Notes, qui ne sont pas des
-- lignes de cette table.
--
-- Sauvegardes : `groupes` avant `personnes` (parents avant enfants, cf.
-- tables_sauvegardees_, 0017). Une ancienne sauvegarde sans `groupes`
-- restaurée : lignes remises sans groupe (valeur par défaut null).

create table if not exists groupes (
  id bigint generated always as identity primary key,
  nom text not null check (length(btrim(nom)) > 0),
  ordre integer not null default 0,
  actif boolean not null default true,
  cree_le timestamptz not null default now()
);

alter table groupes enable row level security;
drop policy if exists "connecte_tout" on groupes;
create policy "connecte_tout" on groupes for all to authenticated using (true) with check (true);
grant select, insert, update, delete on groupes to authenticated;

insert into groupes (nom, ordre)
  select v.nom, v.ordre from (values ('Machines', 1), ('Transports', 2)) as v (nom, ordre)
  where not exists (select 1 from groupes);

alter table personnes add column if not exists groupe_id bigint references groupes (id) on delete set null;
-- Index de la clé étrangère (cf. 0013).
create index if not exists personnes_groupe on personnes (groupe_id);

create or replace function tables_sauvegardees_() returns text[]
language sql immutable set search_path = public as $$
  select array['statuts', 'chantiers', 'groupes', 'personnes', 'categories_feries', 'feries', 'couleurs_perso', 'horaires', 'reglages',
    'formulaires_rapides', 'formulaires_rapides_champs', 'series', 'assignations', 'taches', 'jalons', 'notes', 'equipes_compositions',
    'equipes_exceptions'];
$$;

notify pgrst, 'reload schema';
