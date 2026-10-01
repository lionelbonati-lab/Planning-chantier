-- ============================================================
-- Planning Chantiers — listes d'éléments des groupes, ligne unique « Machines »
-- Migration 0036 — 01.10.2026 (suite 135)
--
-- Lionel (page Améliorations et bugs, amélioration n° 13) : « Machine aussi
-- en une seule ligne comme transport.
-- Pas d'ajouts rapide pour ces 2 groupe. la liste de matériaux de
-- "transport" et des machines sera dans le clic droit de leurs lignes.
-- ainsi les bulles seront des machine et des matériaux au lieu de tâches »
-- Ses choix : listes gérées sur les « Pages Machines / Transports » ; bulle
-- = « Élément + chantier + quantité » ; la ligne Machines « À la place de
-- la section Machines » (section toujours déplaçable, une seule ligne).
--
--   1. elements_groupes : la liste d'un groupe (machines de Machines,
--      matériaux de Transports). Supprimer un élément n'enlève aucune
--      bulle : la bulle est une tâche dont le texte reprend le nom
--      (« Élément - quantité »), le chantier est celui de la tâche.
--   2. Machines : une seule ligne active « Machines ». Les anciennes lignes
--      (une par machine) deviennent des éléments de la liste ; leurs
--      tâches passent sur la ligne « Machines », texte préfixé du nom de
--      la machine (« Karcher - Décoffrage murs étage ») ; les lignes sont
--      désactivées, pas supprimées.
--   3. Transports : liste vide (Lionel y met ses matériaux).
--
-- Sauvegardes (sql/0017) : elements_groupes après groupes. Une ancienne
-- sauvegarde sans la table restaurée : listes vides.
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `elements_groupes`) ; ce fichier garde la trace. Rejouable.
-- ============================================================

create table if not exists elements_groupes (
  id bigint generated always as identity primary key,
  groupe_id bigint not null references groupes (id) on delete cascade,
  nom text not null check (length(btrim(nom)) > 0),
  ordre integer not null default 0,
  cree_le timestamptz not null default now()
);
-- Index de la clé étrangère (cf. 0013).
create index if not exists elements_groupes_groupe on elements_groupes (groupe_id);

alter table elements_groupes enable row level security;
drop policy if exists "connecte_tout" on elements_groupes;
create policy "connecte_tout" on elements_groupes for all to authenticated using (true) with check (true);
grant select, insert, update, delete on elements_groupes to authenticated;

do $$
declare g bigint; ligne bigint; p record; rang integer := 0;
begin
  for g in select id from groupes where not ligne_unique and actif loop
    if exists (select 1 from personnes where groupe_id = g and actif and nom = 'Machines') then continue; end if;
    insert into personnes (nom, sous_traitant, actif, ordre, equipe, groupe_id)
      values ('Machines', false, true, coalesce((select max(ordre) from personnes), 0) + 1, false, g)
      returning id into ligne;
    for p in select id, nom from personnes where groupe_id = g and actif and id <> ligne order by ordre, id loop
      rang := rang + 1;
      insert into elements_groupes (groupe_id, nom, ordre) values (g, p.nom, rang);
      update taches set personne_id = ligne,
        texte = case when coalesce(btrim(texte), '') = '' then p.nom else p.nom || ' - ' || texte end
        where personne_id = p.id;
      update personnes set actif = false where id = p.id;
    end loop;
  end loop;
end $$;

create or replace function tables_sauvegardees_() returns text[]
language sql immutable set search_path = public as $$
  select array['statuts', 'chantiers', 'groupes', 'elements_groupes', 'personnes', 'categories_feries', 'feries', 'couleurs_perso', 'horaires',
    'reglages', 'formulaires_rapides', 'formulaires_rapides_champs', 'series', 'assignations', 'taches', 'jalons', 'notes',
    'equipes_compositions', 'equipes_exceptions'];
$$;

notify pgrst, 'reload schema';
