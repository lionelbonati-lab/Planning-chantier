-- ============================================================
-- Planning Chantiers — équipes de personnel
-- Migration 0015 — 25.09.2026 (suite 33)
--
-- Lionel : « J'aimerai pouvoir gérer mon personnel par équipe sur de plus
-- grands chantiers. Plusieurs personnes auront les mêmes tâches sur toute
-- la semaine. » Choix de Lionel (AskUserQuestion) : une LIGNE D'ÉQUIPE
-- dans le planning (la tâche est saisie une fois pour toute l'équipe),
-- une composition qui peut changer d'une SEMAINE à l'autre, et une ligne
-- par équipe à l'impression.
--
-- 1) Une équipe est une ligne de `personnes` avec equipe = true. Elle a
--    donc ses propres tâches (taches.personne_id = l'équipe), exactement
--    comme une personne : grille, bulles, séries, copier/coller,
--    impression — tout le reste de l'appli la traite sans code à part.
--
-- 2) equipes_compositions : la composition d'une équipe, par INSTANTANÉ.
--    Une ligne (equipe_id, lundi, membres) vaut pour la semaine de ce
--    lundi ET les suivantes, jusqu'au prochain instantané de la même
--    équipe. « Cette semaine seulement » = un instantané pour la semaine,
--    plus un pour la semaine d'après qui remet l'ancienne composition ;
--    « et les suivantes » = un instantané, les suivants effacés. Le calcul
--    est fait côté client (js/equipes.js, planCompositionEquipe), une
--    seule écriture atomique par remplacer_compositions_equipes ci-dessous.
--    Une personne n'est dans qu'une équipe à la fois : garanti par ce même
--    calcul (pas par la base, les membres sont un tableau).
--    membres : ids de `personnes`, sans clé étrangère (tableau) — une
--    personne supprimée depuis est simplement ignorée par le client.
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `equipes`) ; ce fichier garde la trace. Rejouable.
-- ============================================================

alter table personnes add column if not exists equipe boolean not null default false;

create table if not exists equipes_compositions (
  id bigint generated always as identity primary key,
  equipe_id bigint not null references personnes (id) on delete cascade,
  lundi date not null,
  membres bigint[] not null default '{}',
  constraint equipes_compositions_lundi check (extract(isodow from lundi) = 1),
  -- Sert aussi d'index pour la clé étrangère (equipe_id en tête, cf. 0013).
  constraint equipes_compositions_unique unique (equipe_id, lundi)
);

alter table equipes_compositions enable row level security;
-- Pattern RLS de toute l'appli (mono-tenant) — identique à horaires.
drop policy if exists "connecte_tout" on equipes_compositions;
create policy "connecte_tout" on equipes_compositions for all to authenticated using (true) with check (true);
grant select, insert, update, delete on equipes_compositions to authenticated;

-- Remplace TOUS les instantanés des équipes p_equipes par p_lignes
-- ([{equipe_id, lundi, membres: [ids]}]) en une transaction : soit la
-- nouvelle composition est entièrement écrite, soit rien ne change (même
-- principe que remplacer_case_personne, 0012). security invoker : mêmes
-- policies RLS que les requêtes directes.
create or replace function remplacer_compositions_equipes(
  p_equipes bigint[],
  p_lignes jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from equipes_compositions where equipe_id = any (p_equipes);
  insert into equipes_compositions (equipe_id, lundi, membres)
  select (l ->> 'equipe_id')::bigint,
         (l ->> 'lundi')::date,
         coalesce(array(select (m #>> '{}')::bigint from jsonb_array_elements(l -> 'membres') m), '{}')
  from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) l;
end;
$$;

revoke all on function remplacer_compositions_equipes(bigint[], jsonb) from public;
grant execute on function remplacer_compositions_equipes(bigint[], jsonb) to authenticated;
