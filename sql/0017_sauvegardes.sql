-- ============================================================
-- Planning Chantiers — sauvegardes automatiques
-- Migration 0017 — 25.09.2026 (suite 49)
--
-- Proposition 14 retenue par Lionel (« 8,9,10,13,14,15 m'intéressent ») :
-- « Sauvegarde automatique : un export régulier des données Supabase,
-- pour pouvoir revenir en arrière après une grosse erreur. »
--
-- Une sauvegarde = une copie complète de toutes les tables de l'appli,
-- rangée en JSON dans la table `sauvegardes` du même projet (quelques
-- dizaines de Ko : 16 tables, quelques centaines de lignes).
--   - auto : chaque nuit (pg_cron, 02:17 UTC = 04:17 en été, 03:17 en
--     hiver), seulement si quelque chose a changé depuis la précédente ;
--     les 30 dernières gardées ;
--   - manuelle : bouton « Sauvegarder maintenant » (onglet Général) ;
--     les 20 dernières gardées ;
--   - avant_restauration : posée d'office juste avant une restauration,
--     pour pouvoir l'annuler ; les 10 dernières gardées ;
--   - importee : fichier .json téléchargé plus tôt puis ré-importé ; les
--     10 dernières gardées.
-- Le téléchargement du fichier (onglet Général) en garde une copie hors
-- de Supabase.
--
-- Restauration (restaurer_sauvegarde) : TOUT est remplacé, dans une
-- seule transaction (un échec ne laisse rien à moitié) : tables vidées
-- des enfants aux parents, remplies des parents aux enfants, identifiants
-- d'origine gardés (les liens entre tables restent justes), compteurs
-- d'identifiants recalés.
--
-- Fonctions SECURITY DEFINER : la table n'accepte ni insertion ni
-- modification directe des clients (lecture et suppression seulement) ;
-- les fonctions ne sont exécutables que par un utilisateur connecté.
-- `delete ... where true` : l'extension safeupdate de Supabase refuse un
-- DELETE sans WHERE venant de l'API.
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `sauvegardes`) ; ce fichier garde la trace. Rejouable.
-- ============================================================

create table if not exists sauvegardes (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  origine text not null check (origine in ('auto', 'manuelle', 'avant_restauration', 'importee')),
  lignes integer not null,
  contenu jsonb not null
);
create index if not exists sauvegardes_cree_le on sauvegardes (cree_le desc);

alter table sauvegardes enable row level security;
drop policy if exists "connecte_lire" on sauvegardes;
create policy "connecte_lire" on sauvegardes for select to authenticated using (true);
drop policy if exists "connecte_supprimer" on sauvegardes;
create policy "connecte_supprimer" on sauvegardes for delete to authenticated using (true);
grant select, delete on sauvegardes to authenticated;

-- Tables sauvegardées, parents avant enfants (ordre de remplissage ; le
-- vidage se fait à l'envers).
create or replace function tables_sauvegardees_() returns text[]
language sql immutable as $$
  select array['statuts', 'chantiers', 'personnes', 'categories_feries', 'feries', 'couleurs_perso', 'horaires', 'reglages',
    'formulaires_rapides', 'formulaires_rapides_champs', 'series', 'assignations', 'taches', 'jalons', 'notes', 'equipes_compositions'];
$$;

-- Copie de toutes les tables : { version, tables: { nom: [lignes] } }.
-- Lignes triées (texte JSON) : 2 copies des mêmes données sont égales.
create or replace function contenu_sauvegarde_() returns jsonb
language plpgsql security definer set search_path = public as $$
declare t text; lignes jsonb; tables jsonb := '{}'::jsonb;
begin
  foreach t in array tables_sauvegardees_() loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), ''[]''::jsonb) from %I x', t) into lignes;
    tables := tables || jsonb_build_object(t, lignes);
  end loop;
  return jsonb_build_object('version', 1, 'tables', tables);
end $$;

create or replace function nombre_lignes_sauvegarde_(p_contenu jsonb) returns integer
language sql immutable as $$
  select coalesce(sum(jsonb_array_length(v)), 0)::int from jsonb_each(p_contenu -> 'tables') as e(k, v) where jsonb_typeof(v) = 'array';
$$;

-- Garde les `n` dernières sauvegardes d'une origine.
create or replace function elaguer_sauvegardes_(p_origine text, n integer) returns void
language sql security definer set search_path = public as $$
  delete from sauvegardes where origine = p_origine and id not in (
    select id from sauvegardes where origine = p_origine order by cree_le desc, id desc limit n);
$$;

-- Nouvelle sauvegarde ; renvoie son id. Une sauvegarde auto identique à
-- la dernière sauvegarde auto n'est pas refaite (renvoie celle-ci).
create or replace function creer_sauvegarde(p_origine text default 'manuelle') returns bigint
language plpgsql security definer set search_path = public as $$
declare c jsonb := contenu_sauvegarde_(); derniere record; nid bigint;
begin
  if p_origine not in ('auto', 'manuelle', 'avant_restauration') then raise exception 'Origine inconnue : %', p_origine; end if;
  if p_origine = 'auto' then
    select id, contenu into derniere from sauvegardes where origine = 'auto' order by cree_le desc, id desc limit 1;
    if found and derniere.contenu = c then return derniere.id; end if;
  end if;
  insert into sauvegardes (origine, lignes, contenu) values (p_origine, nombre_lignes_sauvegarde_(c), c) returning id into nid;
  perform elaguer_sauvegardes_(p_origine, case p_origine when 'auto' then 30 when 'manuelle' then 20 else 10 end);
  return nid;
end $$;

-- Fichier .json ré-importé : rangé comme sauvegarde « importee » (il
-- reste à le restaurer). Refusé s'il n'a pas la forme d'une sauvegarde.
create or replace function importer_sauvegarde(p_contenu jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare nid bigint;
begin
  if jsonb_typeof(p_contenu -> 'tables') <> 'object' or (p_contenu ->> 'version') is null
    or jsonb_typeof(p_contenu -> 'tables' -> 'personnes') <> 'array' then
    raise exception 'Ce fichier n''est pas une sauvegarde du planning.';
  end if;
  insert into sauvegardes (origine, lignes, contenu) values ('importee', nombre_lignes_sauvegarde_(p_contenu), p_contenu) returning id into nid;
  perform elaguer_sauvegardes_('importee', 10);
  return nid;
end $$;

-- Remplace toutes les données par celles de la sauvegarde `p_id`, après
-- une sauvegarde « avant_restauration » de l'état actuel (renvoyée).
create or replace function restaurer_sauvegarde(p_id bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare s jsonb; t text; ts text[] := tables_sauvegardees_(); avant bigint; i integer; cols text;
begin
  select contenu -> 'tables' into s from sauvegardes where id = p_id;
  if s is null then raise exception 'Sauvegarde introuvable.'; end if;
  avant := creer_sauvegarde('avant_restauration');
  for i in reverse array_length(ts, 1) .. 1 loop
    execute format('delete from %I where true', ts[i]);
  end loop;
  foreach t in array ts loop
    -- Seules les colonnes présentes dans la sauvegarde sont écrites : une
    -- colonne ajoutée depuis prend sa valeur par défaut.
    if jsonb_typeof(s -> t) = 'array' and jsonb_array_length(s -> t) > 0 then
      select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into cols
        from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = t and exists (select 1 from jsonb_array_elements(s -> t) e where e ? c.column_name);
      execute format('insert into %I (%s) overriding system value select %s from jsonb_populate_recordset(null::%I, $1)', t, cols, cols, t) using s -> t;
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'id' and is_identity = 'YES') then
      execute format('select setval(pg_get_serial_sequence(%L, ''id''), coalesce((select max(id) from %I), 0) + 1, false)', 'public.' || t, t);
    end if;
  end loop;
  return avant;
end $$;

revoke all on function tables_sauvegardees_(), contenu_sauvegarde_(), nombre_lignes_sauvegarde_(jsonb), elaguer_sauvegardes_(text, integer),
  creer_sauvegarde(text), importer_sauvegarde(jsonb), restaurer_sauvegarde(bigint) from public, anon;
grant execute on function creer_sauvegarde(text), importer_sauvegarde(jsonb), restaurer_sauvegarde(bigint) to authenticated;

-- Sauvegarde de chaque nuit.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'sauvegarde-planning';
select cron.schedule('sauvegarde-planning', '17 2 * * *', $$select public.creer_sauvegarde('auto')$$);
