-- ============================================================
-- Planning Chantiers — plusieurs plannings (entreprise, plannings, membres)
-- Migration 0044 — 09.11.2026 (suite 153)
--
-- Lionel : « Un collègue aimerait utiliser mon planning pour ses propres
-- besoins. Il doit pouvoir un compte et gérer son propre planning. »
-- Ses choix : « Certaines listes en commun » ; compte créé « Toi, depuis
-- l'appli » ; au départ « Partage des bases et listes » ; plusieurs
-- personnes sur un même planning : « Oui, le prévoir ». Partagés : statuts,
-- entrées rapides, horaires et fériés, chantiers (« Pour les chantiers
-- chacun choisi sa couleur »), intervenants, machines, matériaux,
-- « Personnel sans les équipes » ; modifiables par « Vous deux » ; tâches
-- de l'autre visibles : « Non ». Puis : lignes « Chacun choisit », absences
-- « Oui, partout », lien des ouvriers « Les deux plannings réunis »,
-- invitations « Toi seul », lien responsable « Le planning de son
-- créateur », sauvegardes « Son planning seul », retours « Toi aussi »,
-- couleur d'un nouveau chantier « La même au départ ».
--
-- Étape 1 (cette migration) : la séparation dans la base, sans rien
-- changer à l'écran tant qu'il n'y a qu'un planning.
--   1. entreprises, plannings, membres (un compte = un planning ; rôle
--      admin ou membre). mon_planning(), mon_entreprise(), suis_admin() :
--      ceux du compte connecté (null sans connexion).
--   2. Toutes les données existantes vont dans « ton » planning, et ton
--      compte en devient l'administrateur.
--   3. Chaque table reçoit sa colonne, remplie d'office à l'écriture :
--        - entreprise_id (partagé entre les plannings) : statuts, chantiers,
--          groupes, categories_elements, elements_groupes, personnes,
--          categories_feries, feries, horaires, formulaires_rapides(_champs),
--          liens_consultation, demandes_absence ;
--        - planning_id (propre à chaque planning) : series, assignations,
--          taches, jalons, notes, equipes_compositions, equipes_exceptions,
--          reglages, couleurs_perso, liens_responsables, sauvegardes,
--          abonnements_push (et user_id : un appareil = un compte),
--          push_modifs ;
--        - personnes.planning_id : une équipe appartient à son planning ;
--          une personne (ouvrier, intervenant, ligne Machines / Transports)
--          n'en a pas : elle est partagée.
--      Les policies « connecte_tout » laissent place à « entreprise » /
--      « planning » : un compte ne voit et n'écrit que les lignes de son
--      entreprise / de son planning. Retours : les siens (l'administrateur
--      les voit tous).
--   4. Fichiers joints (dossier « pieces ») : le compte n'y lit, n'ajoute
--      et n'efface que ceux de son planning : chemin commençant par l'id
--      du planning, ou ancien chemin (fichiers/…, vignettes/…) pour le
--      planning qui les avait (plannings.fichiers_anciens). pieces_orphelines
--      (lancée par le compte) ne voit donc plus que ceux-là.
--   5. Sauvegardes par planning : la sauvegarde de nuit en fait une par
--      planning ; « Restaurer » remet les tâches, jalons, notes, séries,
--      équipes, réglages et couleurs du planning, et ne touche aux listes
--      partagées que pour y remettre ce qui manque aux lignes restaurées
--      (jamais de modification ni d'effacement). Une référence qui n'existe
--      plus (chantier, statut…) est vidée ; une ligne sans sa personne est
--      laissée de côté.
--   6. Lien des ouvriers : ses fériés et horaires sont ceux de son
--      entreprise ; une demande d'absence prend l'entreprise de l'ouvrier.
--      Lien responsable : le planning de celui qui l'a créé.
--   7. reglages (cle) et couleurs_perso (id) gardent leur clé d'avant
--      jusqu'à l'étape des invitations ; une clé (planning_id, cle) /
--      (planning_id, id) s'y ajoute dès maintenant (l'appli l'utilise).
--
-- Lionel l'applique dans l'éditeur SQL de Supabase. Rejouable.
-- ============================================================

-- ---------- 1. Entreprises, plannings, membres ----------
create table if not exists entreprises (
  id uuid primary key default gen_random_uuid(),
  nom text not null default '',
  cree_le timestamptz not null default now()
);
create table if not exists plannings (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprises (id) on delete cascade,
  nom text not null default '',
  -- Fichiers joints d'avant cette migration (chemins sans id de planning).
  fichiers_anciens boolean not null default false,
  cree_le timestamptz not null default now()
);
create index if not exists plannings_entreprise on plannings (entreprise_id);
create table if not exists membres (
  user_id uuid primary key references auth.users (id) on delete cascade,
  planning_id uuid not null references plannings (id) on delete cascade,
  role text not null default 'membre' check (role in ('admin', 'membre')),
  cree_le timestamptz not null default now()
);
create index if not exists membres_planning on membres (planning_id);

create or replace function mon_planning() returns uuid
language sql stable security definer set search_path = public as $$
  select planning_id from membres where user_id = auth.uid();
$$;
create or replace function mon_entreprise() returns uuid
language sql stable security definer set search_path = public as $$
  select p.entreprise_id from membres m join plannings p on p.id = m.planning_id where m.user_id = auth.uid();
$$;
create or replace function suis_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from membres where user_id = auth.uid()), false);
$$;
revoke all on function mon_planning(), mon_entreprise(), suis_admin() from public, anon;
grant execute on function mon_planning(), mon_entreprise(), suis_admin() to authenticated, service_role;

alter table entreprises enable row level security;
alter table plannings enable row level security;
alter table membres enable row level security;
drop policy if exists "la_mienne" on entreprises;
create policy "la_mienne" on entreprises for select to authenticated using (id = (select mon_entreprise()));
drop policy if exists "de_mon_entreprise" on plannings;
create policy "de_mon_entreprise" on plannings for select to authenticated using (entreprise_id = (select mon_entreprise()));
-- Soi-même ; l'administrateur voit tous les comptes de son entreprise.
drop policy if exists "soi_ou_admin" on membres;
create policy "soi_ou_admin" on membres for select to authenticated using (
  user_id = (select auth.uid())
  or ((select suis_admin()) and planning_id in (select p.id from plannings p where p.entreprise_id = (select mon_entreprise()))));
revoke all on entreprises, plannings, membres from anon, authenticated;
grant select on entreprises, plannings, membres to authenticated;

-- ---------- 2. Ton planning ----------
do $$
declare e uuid; p uuid; pr profils;
begin
  if not exists (select 1 from plannings) then
    select * into pr from profils order by maj limit 1;
    insert into entreprises (nom) values (coalesce(nullif(btrim(pr.entreprise), ''), 'Mon entreprise')) returning id into e;
    insert into plannings (entreprise_id, nom, fichiers_anciens)
      values (e, coalesce(nullif(btrim(coalesce(pr.prenom, '') || ' ' || coalesce(pr.nom, '')), ''), 'Mon planning'), true) returning id into p;
  end if;
  -- Les comptes d'avant (le tien) : administrateurs du premier planning.
  insert into membres (user_id, planning_id, role)
    select u.id, (select id from plannings order by cree_le, id limit 1), 'admin' from auth.users u
    on conflict (user_id) do nothing;
end $$;

-- ---------- 3. Colonnes et policies ----------
do $$
declare
  e uuid := (select entreprise_id from plannings order by cree_le, id limit 1);
  p uuid := (select id from plannings order by cree_le, id limit 1);
  t text;
begin
  foreach t in array array['statuts', 'chantiers', 'groupes', 'categories_elements', 'elements_groupes', 'personnes', 'categories_feries',
      'feries', 'horaires', 'formulaires_rapides', 'formulaires_rapides_champs', 'liens_consultation', 'demandes_absence'] loop
    execute format('alter table %I add column if not exists entreprise_id uuid references entreprises (id) on delete cascade', t);
    execute format('update %I set entreprise_id = $1 where entreprise_id is null', t) using e;
    execute format('alter table %I alter column entreprise_id set default mon_entreprise(), alter column entreprise_id set not null', t);
    execute format('create index if not exists %I on %I (entreprise_id)', t || '_entreprise', t);
    execute format('drop policy if exists "connecte_tout" on %I', t);
    execute format('drop policy if exists "entreprise" on %I', t);
    if t <> 'personnes' then
      execute format('create policy "entreprise" on %I for all to authenticated using (entreprise_id = (select mon_entreprise())) with check (entreprise_id = (select mon_entreprise()))', t);
    end if;
  end loop;
  foreach t in array array['series', 'assignations', 'taches', 'jalons', 'notes', 'equipes_compositions', 'equipes_exceptions',
      'reglages', 'couleurs_perso', 'liens_responsables', 'sauvegardes', 'abonnements_push', 'push_modifs'] loop
    execute format('alter table %I add column if not exists planning_id uuid references plannings (id) on delete cascade', t);
    execute format('update %I set planning_id = $1 where planning_id is null', t) using p;
    execute format('alter table %I alter column planning_id set default mon_planning(), alter column planning_id set not null', t);
    execute format('create index if not exists %I on %I (planning_id)', t || '_planning', t);
    execute format('drop policy if exists "connecte_tout" on %I', t);
    execute format('drop policy if exists "planning" on %I', t);
    if t not in ('sauvegardes', 'abonnements_push', 'push_modifs') then
      execute format('create policy "planning" on %I for all to authenticated using (planning_id = (select mon_planning())) with check (planning_id = (select mon_planning()))', t);
    end if;
  end loop;
end $$;
create index if not exists taches_planning_date on taches (planning_id, date);

-- Personnes : partagées dans l'entreprise, sauf les équipes (leur planning).
alter table personnes add column if not exists planning_id uuid references plannings (id) on delete cascade;
update personnes set planning_id = (select id from plannings order by cree_le, id limit 1) where equipe and planning_id is null;
update personnes set planning_id = null where not equipe and planning_id is not null;
create index if not exists personnes_planning on personnes (planning_id);
create or replace function personnes_planning_() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(new.equipe, false) then new.planning_id := coalesce(new.planning_id, mon_planning());
  else new.planning_id := null; end if;
  return new;
end $$;
drop trigger if exists personnes_planning on personnes;
create trigger personnes_planning before insert or update of equipe, planning_id on personnes
  for each row execute function personnes_planning_();
alter table personnes drop constraint if exists personnes_equipe_planning;
alter table personnes add constraint personnes_equipe_planning check ((planning_id is not null) = coalesce(equipe, false));
create policy "entreprise" on personnes for all to authenticated
  using (entreprise_id = (select mon_entreprise()) and (planning_id is null or planning_id = (select mon_planning())))
  with check (entreprise_id = (select mon_entreprise()) and (planning_id is null or planning_id = (select mon_planning())));

-- Une demande d'absence (lien des ouvriers, sans connexion) et un lien
-- d'ouvrier prennent l'entreprise de la personne.
create or replace function entreprise_de_la_personne_() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.entreprise_id is null then
    select entreprise_id into new.entreprise_id from personnes where id = new.personne_id;
  end if;
  return new;
end $$;
drop trigger if exists entreprise_de_la_personne on demandes_absence;
create trigger entreprise_de_la_personne before insert on demandes_absence for each row execute function entreprise_de_la_personne_();
drop trigger if exists entreprise_de_la_personne on liens_consultation;
create trigger entreprise_de_la_personne before insert on liens_consultation for each row execute function entreprise_de_la_personne_();

-- Sauvegardes : lecture et suppression de celles de son planning
-- (écriture par les fonctions ci-dessous).
drop policy if exists "connecte_lire" on sauvegardes;
drop policy if exists "connecte_supprimer" on sauvegardes;
drop policy if exists "planning_lire" on sauvegardes;
drop policy if exists "planning_supprimer" on sauvegardes;
create policy "planning_lire" on sauvegardes for select to authenticated using (planning_id = (select mon_planning()));
create policy "planning_supprimer" on sauvegardes for delete to authenticated using (planning_id = (select mon_planning()));

-- Appareils abonnés aux notifications : ceux du compte.
alter table abonnements_push add column if not exists user_id uuid references auth.users (id) on delete cascade;
update abonnements_push set user_id = (select m.user_id from membres m where m.role = 'admin' order by m.cree_le limit 1) where user_id is null;
alter table abonnements_push alter column user_id set default auth.uid(), alter column user_id set not null;
drop policy if exists "soi_meme" on abonnements_push;
create policy "soi_meme" on abonnements_push for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and planning_id = (select mon_planning()));

-- Modifications à annoncer : par planning et par session.
alter table push_modifs drop constraint if exists push_modifs_pkey;
alter table push_modifs add constraint push_modifs_pkey primary key (planning_id, session_id);
create or replace function noter_modif_push_() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into push_modifs (planning_id, session_id)
    select distinct l.planning_id, coalesce(auth.jwt() ->> 'session_id', '') from lignes l where l.planning_id is not null
  on conflict (planning_id, session_id) do update set derniere = now();
  return null;
end $$;

-- Retours (page Améliorations et bugs) : les siens ; l'administrateur, tous.
drop policy if exists "connecte_tout" on retours;
drop policy if exists "auteur_ou_admin" on retours;
create policy "auteur_ou_admin" on retours for all to authenticated
  using (cree_par = (select auth.uid()) or (select suis_admin()))
  with check (cree_par = (select auth.uid()) or (select suis_admin()));

-- Clés par planning (l'ancienne clé seule part à l'étape des invitations).
create unique index if not exists reglages_planning_cle on reglages (planning_id, cle);
create unique index if not exists couleurs_perso_planning_id on couleurs_perso (planning_id, id);

-- ---------- 4. Fichiers joints ----------
create or replace function piece_de_mon_planning(p_nom text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when split_part(coalesce(p_nom, ''), '/', 1) in ('fichiers', 'vignettes')
    then coalesce((select pl.fichiers_anciens from plannings pl where pl.id = mon_planning()), false)
    else split_part(coalesce(p_nom, ''), '/', 1) = mon_planning()::text end;
$$;
revoke all on function piece_de_mon_planning(text) from public, anon;
grant execute on function piece_de_mon_planning(text) to authenticated;
drop policy if exists "pieces_lire" on storage.objects;
create policy "pieces_lire" on storage.objects for select to authenticated using (bucket_id = 'pieces' and piece_de_mon_planning(name));
drop policy if exists "pieces_ajouter" on storage.objects;
create policy "pieces_ajouter" on storage.objects for insert to authenticated with check (bucket_id = 'pieces' and piece_de_mon_planning(name));
drop policy if exists "pieces_supprimer" on storage.objects;
create policy "pieces_supprimer" on storage.objects for delete to authenticated using (bucket_id = 'pieces' and piece_de_mon_planning(name));

-- ---------- 5. Sauvegardes par planning ----------
-- Lignes d'une table pour la sauvegarde d'un planning : les siennes ; pour
-- une table partagée, celles de l'entreprise (les équipes : du planning).
create or replace function lignes_du_planning_(p_table text, p_planning uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e uuid := (select entreprise_id from plannings where id = p_planning); filtre text; r jsonb;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_table and column_name = 'entreprise_id') then
    filtre := format('x.entreprise_id = %L', e);
    if p_table = 'personnes' then filtre := filtre || format(' and (x.planning_id is null or x.planning_id = %L)', p_planning); end if;
  else
    filtre := format('x.planning_id = %L', p_planning);
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), ''[]''::jsonb) from %I x where %s', p_table, filtre) into r;
  return r;
end $$;

drop function if exists contenu_sauvegarde_();
create or replace function contenu_sauvegarde_(p_planning uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t text; tables jsonb := '{}'::jsonb;
begin
  foreach t in array tables_sauvegardees_() loop
    tables := tables || jsonb_build_object(t, lignes_du_planning_(t, p_planning));
  end loop;
  return jsonb_build_object('version', 2, 'tables', tables);
end $$;

drop function if exists elaguer_sauvegardes_(text, integer);
create or replace function elaguer_sauvegardes_(p_planning uuid, p_origine text, n integer) returns void
language sql security definer set search_path = public as $$
  delete from sauvegardes where planning_id = p_planning and origine = p_origine and id not in (
    select id from sauvegardes where planning_id = p_planning and origine = p_origine order by cree_le desc, id desc limit n);
$$;

create or replace function sauvegarder_planning_(p_planning uuid, p_origine text) returns bigint
language plpgsql security definer set search_path = public as $$
declare c jsonb := contenu_sauvegarde_(p_planning); derniere record; nid bigint;
begin
  if p_origine = 'auto' then
    select id, contenu into derniere from sauvegardes where planning_id = p_planning and origine = 'auto' order by cree_le desc, id desc limit 1;
    if found and derniere.contenu = c then return derniere.id; end if;
  end if;
  insert into sauvegardes (planning_id, origine, lignes, contenu) values (p_planning, p_origine, nombre_lignes_sauvegarde_(c), c) returning id into nid;
  perform elaguer_sauvegardes_(p_planning, p_origine, case p_origine when 'auto' then 30 when 'manuelle' then 20 else 10 end);
  return nid;
end $$;

-- Compte connecté : son planning. Sans connexion (sauvegarde de nuit,
-- pg_cron) : chaque planning.
create or replace function creer_sauvegarde(p_origine text default 'manuelle') returns bigint
language plpgsql security definer set search_path = public as $$
declare pl uuid; nid bigint;
begin
  if p_origine not in ('auto', 'manuelle', 'avant_restauration') then raise exception 'Origine inconnue : %', p_origine; end if;
  if auth.uid() is not null then
    if mon_planning() is null then raise exception 'Aucun planning pour ce compte.'; end if;
    return sauvegarder_planning_(mon_planning(), p_origine);
  end if;
  for pl in select id from plannings order by cree_le, id loop
    nid := sauvegarder_planning_(pl, p_origine);
  end loop;
  return nid;
end $$;

create or replace function importer_sauvegarde(p_contenu jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare nid bigint; pl uuid := mon_planning();
begin
  if pl is null then raise exception 'Aucun planning pour ce compte.'; end if;
  if jsonb_typeof(p_contenu -> 'tables') <> 'object' or (p_contenu ->> 'version') is null
    or jsonb_typeof(p_contenu -> 'tables' -> 'personnes') <> 'array' then
    raise exception 'Ce fichier n''est pas une sauvegarde du planning.';
  end if;
  insert into sauvegardes (planning_id, origine, lignes, contenu) values (pl, 'importee', nombre_lignes_sauvegarde_(p_contenu), p_contenu) returning id into nid;
  perform elaguer_sauvegardes_(pl, 'importee', 10);
  return nid;
end $$;

-- Remet les lignes sauvegardées d'une table (restaurer_sauvegarde) :
-- planning_id / entreprise_id imposés (jamais ceux du fichier) ; une
-- référence vers une ligne absente ou d'ailleurs est vidée (colonne
-- facultative) ou la ligne laissée de côté (colonne obligatoire) ; une
-- ligne dont l'id existe déjà n'est pas remise — sauf une équipe du
-- planning, mise à jour.
create or replace function restaurer_table_(p_table text, p_lignes jsonb, p_planning uuid, p_entreprise uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  cols text; avec_planning boolean; avec_entreprise boolean; fk record; cond text; nullable boolean; maj text;
begin
  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then return; end if;
  avec_planning := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_table and column_name = 'planning_id');
  avec_entreprise := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_table and column_name = 'entreprise_id');
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into cols
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = p_table
      and (c.column_name in ('planning_id', 'entreprise_id') or exists (select 1 from jsonb_array_elements(p_lignes) l where l ? c.column_name));
  if to_regclass('pg_temp.restauration_') is not null then execute 'drop table restauration_'; end if;
  -- Colonnes de la table sans leurs contraintes (une colonne absente de la
  -- sauvegarde reste vide ici, elle n'est pas écrite).
  execute format('create temp table restauration_ on commit drop as select * from jsonb_populate_recordset(null::%I, ''[]''::jsonb)', p_table);
  execute format('insert into restauration_ select * from jsonb_populate_recordset(null::%I, $1)', p_table) using p_lignes;
  if avec_entreprise then execute format('update restauration_ set entreprise_id = %L', p_entreprise); end if;
  if p_table = 'personnes' then
    execute format('update restauration_ set planning_id = case when coalesce(equipe, false) then %L::uuid end', p_planning);
  elsif avec_planning then
    execute format('update restauration_ set planning_id = %L', p_planning);
  end if;
  for fk in
    select a.attname as col, rt.relname as cible, ra.attname as col_cible
    from pg_constraint k
    join pg_class ct on ct.oid = k.conrelid join pg_namespace n on n.oid = ct.relnamespace
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    join pg_class rt on rt.oid = k.confrelid
    join pg_attribute ra on ra.attrelid = k.confrelid and ra.attnum = k.confkey[1]
    where k.contype = 'f' and n.nspname = 'public' and ct.relname = p_table and array_length(k.conkey, 1) = 1
      and rt.relname not in ('plannings', 'entreprises')
  loop
    cond := format('r.%I = restauration_.%I', fk.col_cible, fk.col);
    if fk.cible = 'personnes' then
      cond := cond || format(' and r.entreprise_id = %L and (r.planning_id is null or r.planning_id = %L)', p_entreprise, p_planning);
    elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = fk.cible and column_name = 'planning_id') then
      cond := cond || format(' and r.planning_id = %L', p_planning);
    elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = fk.cible and column_name = 'entreprise_id') then
      cond := cond || format(' and r.entreprise_id = %L', p_entreprise);
    end if;
    select c.is_nullable = 'YES' into nullable from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = p_table and c.column_name = fk.col;
    if nullable then
      execute format('update restauration_ set %I = null where %I is not null and not exists (select 1 from %I r where %s)', fk.col, fk.col, fk.cible, cond);
    else
      execute format('delete from restauration_ where not exists (select 1 from %I r where %s)', fk.cible, cond);
    end if;
  end loop;
  if p_table = 'personnes' then
    select string_agg(format('%I = excluded.%I', c.column_name, c.column_name), ', ') into maj
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'personnes' and c.column_name not in ('id', 'entreprise_id', 'planning_id')
        and exists (select 1 from jsonb_array_elements(p_lignes) l where l ? c.column_name);
    execute format('insert into personnes (%s) overriding system value select %s from restauration_ on conflict (id) do update set %s where personnes.planning_id = %L and excluded.planning_id = %L',
      cols, cols, coalesce(maj, 'nom = personnes.nom'), p_planning, p_planning);
  else
    execute format('insert into %I (%s) overriding system value select %s from restauration_ on conflict do nothing', p_table, cols, cols);
  end if;
  execute 'drop table restauration_';
end $$;

create or replace function restaurer_sauvegarde(p_id bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  pl uuid := mon_planning();
  e uuid;
  s jsonb; t text; ts text[] := tables_sauvegardees_(); avant bigint; i integer;
  equipes_gardees bigint[];
begin
  if pl is null then raise exception 'Aucun planning pour ce compte.'; end if;
  e := (select entreprise_id from plannings where id = pl);
  select contenu -> 'tables' into s from sauvegardes where id = p_id and planning_id = pl;
  if s is null then raise exception 'Sauvegarde introuvable.'; end if;
  avant := sauvegarder_planning_(pl, 'avant_restauration');
  -- Lignes du planning effacées (ordre inverse : les références d'abord).
  for i in reverse array_length(ts, 1) .. 1 loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = ts[i] and column_name = 'planning_id')
       and ts[i] <> 'personnes' then
      execute format('delete from %I where planning_id = %L', ts[i], pl);
    end if;
  end loop;
  -- Équipes du planning absentes de la sauvegarde : effacées ; les autres
  -- restent (leur lien d'ouvrier aussi) et sont remises à jour.
  equipes_gardees := coalesce(array(select (l ->> 'id')::bigint from jsonb_array_elements(case when jsonb_typeof(s -> 'personnes') = 'array' then s -> 'personnes' else '[]'::jsonb end) l
    where coalesce((l ->> 'equipe')::boolean, false) and l ->> 'id' is not null), '{}');
  delete from personnes where planning_id = pl and not (id = any (equipes_gardees));
  foreach t in array ts loop
    perform restaurer_table_(t, s -> t, pl, e);
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'id' and is_identity = 'YES') then
      execute format('select setval(pg_get_serial_sequence(%L, ''id''), greatest(coalesce((select max(id) from %I), 0) + 1, nextval(pg_get_serial_sequence(%L, ''id''))), false)',
        'public.' || t, t, 'public.' || t);
    end if;
  end loop;
  return avant;
end $$;
revoke all on function lignes_du_planning_(text, uuid), contenu_sauvegarde_(uuid), elaguer_sauvegardes_(uuid, text, integer),
  sauvegarder_planning_(uuid, text), restaurer_table_(text, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function creer_sauvegarde(text), importer_sauvegarde(jsonb), restaurer_sauvegarde(bigint) from public, anon;
grant execute on function creer_sauvegarde(text), importer_sauvegarde(jsonb), restaurer_sauvegarde(bigint) to authenticated;

-- ---------- 6. Liens sans connexion ----------
-- Lien des ouvriers : tâches de tous les plannings (par la personne),
-- fériés et horaires de son entreprise.
create or replace function consultation_planning(p_jeton text, p_lundi date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  lien liens_consultation;
  p personnes;
  v_lundi date;
  aujourdhui date := (now() at time zone 'Europe/Zurich')::date;
begin
  select * into lien from liens_consultation where jeton = p_jeton;
  if not found then return null; end if;
  select * into p from personnes where id = lien.personne_id;
  v_lundi := date_trunc('week', coalesce(p_lundi, aujourdhui))::date;
  v_lundi := greatest(v_lundi, date_trunc('week', aujourdhui)::date - 28);
  v_lundi := least(v_lundi, date_trunc('week', aujourdhui)::date + 182);
  if lien.vu_le is null or lien.vu_le < now() - interval '1 hour' then
    update liens_consultation set vu_le = now() where id = lien.id;
  end if;
  return jsonb_build_object(
    'personne', jsonb_build_object('nom', p.nom, 'sous_traitant', p.sous_traitant, 'equipe', p.equipe),
    'lundi', v_lundi,
    'aujourdhui', aujourdhui,
    'min', date_trunc('week', aujourdhui)::date - 28,
    'max', date_trunc('week', aujourdhui)::date + 182,
    'taches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', t.date, 'demi', t.demi, 'ordre', t.ordre, 'texte', t.texte, 'important', t.important, 'absence', t.est_absence,
        'partielle', t.est_absence and absence_partielle_(t.texte, t.demi),
        'chantier', ch.nom, 'couleur', ch.couleur, 'lat', ch.latitude, 'lng', ch.longitude, 'statut', st.nom, 'couleur_statut', st.couleur,
        'equipe', case when t.personne_id <> p.id then e.nom end,
        -- 0041 : détails et fichiers joints.
        'details', t.details, 'pieces', t.pieces
      ) order by t.date, t.demi desc, t.personne_id <> p.id, t.ordre)
      from taches t
      join personnes e on e.id = t.personne_id
      left join chantiers ch on ch.id = t.chantier_id
      left join statuts st on st.id = t.statut_id
      where t.date between v_lundi and v_lundi + 6
        -- 0032 : tâche d'une équipe dont la personne est membre CETTE
        -- demi-journée (composition de la semaine + exceptions).
        and (t.personne_id = p.id or (e.equipe and equipe_membre_(t.personne_id, p.id, t.date, t.demi)))
        -- 0031 : tâche d'équipe cachée sous une absence complète de la personne.
        and (t.personne_id = p.id or not exists (select 1 from taches a where a.personne_id = p.id and a.est_absence
          and a.date = t.date and a.demi = t.demi and not absence_partielle_(a.texte, a.demi)))), '[]'::jsonb),
    -- 0044 : fériés et horaires de son entreprise.
    'feries', coalesce((select jsonb_agg(jsonb_build_object('date', f.date, 'libelle', f.libelle) order by f.date)
      from feries f where f.entreprise_id = p.entreprise_id and f.date between v_lundi and v_lundi + 6), '[]'::jsonb),
    'horaires', coalesce((select jsonb_agg(jsonb_build_object('debut', h.date_debut, 'fin', h.date_fin,
        'matin', to_char(h.matin_debut, 'HH24:MI') || '–' || to_char(h.matin_fin, 'HH24:MI'),
        'aprem', case when h.aprem_debut is not null and h.aprem_fin is not null then to_char(h.aprem_debut, 'HH24:MI') || '–' || to_char(h.aprem_fin, 'HH24:MI') end) order by h.date_debut, h.id)
      from horaires h where h.entreprise_id = p.entreprise_id and h.date_debut <= v_lundi + 6 and h.date_fin >= v_lundi), '[]'::jsonb),
    'peut_demander', not p.sous_traitant and not coalesce(p.equipe, false),
    -- 0034 : types proposés à l'ouvrier, fixes (avant : les entrées
    -- rapides d'absence de l'appli).
    'motifs', '["Absence", "Congé"]'::jsonb,
    'demandes', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'debut', d.date_debut, 'fin', d.date_fin,
        'demi_debut', d.demi_debut, 'demi_fin', d.demi_fin, 'motif', d.motif, 'remarque', d.remarque, 'statut', d.statut,
        'type', d.type, 'remplace_id', d.remplace_id, 'traitee_le', d.traitee_le,
        'serie_frequence', d.serie_frequence, 'serie_intervalle', d.serie_intervalle, 'serie_fin', d.serie_fin,
        'cible_debut', d.cible_debut, 'cible_fin', d.cible_fin, 'cible_demi_debut', d.cible_demi_debut, 'cible_demi_fin', d.cible_demi_fin,
        'cible_texte', d.cible_texte,
        'supprimee', d.statut = 'acceptee' and not exists (select 1 from taches t where t.personne_id = p.id and t.est_absence
          and t.date between d.date_debut and demande_absence_fin_(d.date_debut, d.date_fin, d.serie_fin)))
        order by d.date_debut, d.id)
      from demandes_absence d where d.personne_id = p.id and not d.masquee and d.statut <> 'remplacee'
        and not (d.type = 'annulation' and d.statut = 'acceptee' and d.cible_debut is null)
        and (d.statut = 'en_attente' or demande_absence_fin_(d.date_debut, d.date_fin, d.serie_fin) >= aujourdhui
          or d.traitee_le > now() - interval '30 days')), '[]'::jsonb),
    'absences', coalesce((select jsonb_agg(jsonb_build_object('date', t.date, 'demi', t.demi, 'texte', t.texte, 'serie', t.serie_id is not null)
        order by t.date, t.demi desc, t.ordre)
      from taches t where t.personne_id = p.id and t.est_absence and t.date between aujourdhui and aujourdhui + 365), '[]'::jsonb)
  );
end $$;

-- Lien responsable : le planning de celui qui l'a créé (ses tâches,
-- jalons, notes, l'ordre de ses sections), les listes de son entreprise.
create or replace function consultation_responsable(p_jeton text, p_lundi date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  lien liens_responsables;
  v_e uuid;
  v_lundi date;
  aujourdhui date := (now() at time zone 'Europe/Zurich')::date;
  v_min date := date_trunc('week', (now() at time zone 'Europe/Zurich')::date)::date;
  v_max date := date_trunc('week', (now() at time zone 'Europe/Zurich')::date)::date + 28;
begin
  if p_jeton is null or length(p_jeton) < 32 then return null; end if;
  select * into lien from liens_responsables where jeton = p_jeton;
  if not found then return null; end if;
  v_e := (select entreprise_id from plannings where id = lien.planning_id);
  v_lundi := date_trunc('week', coalesce(p_lundi, aujourdhui))::date;
  v_lundi := least(greatest(v_lundi, v_min), v_max);
  if lien.vu_le is null or lien.vu_le < now() - interval '1 hour' then
    update liens_responsables set vu_le = now() where id = lien.id;
  end if;
  return jsonb_build_object(
    'nom', lien.nom,
    'lundi', v_lundi,
    'aujourdhui', aujourdhui,
    'min', v_min,
    'max', v_max,
    -- Section comme secteurDe (js/groupes.js) : intervenant, ligne d'un
    -- groupe actif (Transports = groupe ligne_unique), sinon personnel.
    -- 0039 : sans les équipes.
    'personnes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nom', p.nom, 'couleur', p.couleur,
        'section', case when p.sous_traitant then 'intervenants'
          when g.id is not null then case when g.ligne_unique then 'transports' else 'groupe-' || g.id end
          else 'personnel' end
      ) order by p.ordre, p.id)
      from personnes p left join groupes g on g.id = p.groupe_id and g.actif
      where p.entreprise_id = v_e and p.actif and not coalesce(p.masque, false) and not coalesce(p.equipe, false)), '[]'::jsonb),
    'groupes', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'nom', g.nom) order by g.ordre, g.id)
      from groupes g where g.entreprise_id = v_e and g.actif and not g.ligne_unique), '[]'::jsonb),
    'ordre_groupes', coalesce((select r.valeur from reglages r where r.planning_id = lien.planning_id and r.cle = 'ordre_groupes' and jsonb_typeof(r.valeur) = 'array'), '[]'::jsonb),
    'taches', coalesce((select jsonb_agg(jsonb_build_object(
        'personne', x.personne, 'date', t.date, 'demi', t.demi, 'ordre', t.ordre, 'texte', t.texte,
        'important', t.important, 'absence', t.est_absence,
        'chantier', ch.nom, 'couleur', ch.couleur, 'lat', ch.latitude, 'lng', ch.longitude, 'statut', st.nom, 'couleur_statut', st.couleur,
        -- 0041 : détails et fichiers joints.
        'details', t.details, 'pieces', t.pieces
      ) order by t.date, t.demi desc, x.personne, x.d_equipe, t.ordre, t.id)
      from (
        -- Tâches des personnes affichées.
        select t.id, t.personne_id as personne, false as d_equipe
        from taches t join personnes p on p.id = t.personne_id
        where t.planning_id = lien.planning_id and t.date between v_lundi and v_lundi + 6
          and p.actif and not coalesce(p.masque, false) and not coalesce(p.equipe, false)
        union all
        -- 0039 : tâche d'équipe recopiée sur chaque membre de cette
        -- demi-journée, sauf sous une absence complète de ce membre.
        select t.id, m.id, true
        from taches t
        join personnes e on e.id = t.personne_id and e.equipe
        join personnes m on m.entreprise_id = v_e and m.actif and not coalesce(m.masque, false) and not coalesce(m.equipe, false) and not m.sous_traitant
          and equipe_membre_(e.id, m.id, t.date, t.demi)
        where t.planning_id = lien.planning_id and t.date between v_lundi and v_lundi + 6
          and not exists (select 1 from taches a where a.personne_id = m.id and a.est_absence
            and a.date = t.date and a.demi = t.demi and not absence_partielle_(a.texte, a.demi))
      ) x
      join taches t on t.id = x.id
      left join chantiers ch on ch.id = t.chantier_id
      left join statuts st on st.id = t.statut_id), '[]'::jsonb),
    'jalons', coalesce((select jsonb_agg(jsonb_build_object('date', j.date, 'demi', j.demi, 'texte', j.texte,
        'important', j.important, 'chantier', ch.nom, 'couleur', ch.couleur, 'lat', ch.latitude, 'lng', ch.longitude) order by j.date, j.demi desc nulls first, j.id)
      from jalons j left join chantiers ch on ch.id = j.chantier_id
      where j.planning_id = lien.planning_id and j.date between v_lundi and v_lundi + 6), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('date', n.date, 'demi', n.demi, 'texte', n.texte,
        'important', n.important, 'chantier', ch.nom, 'couleur', ch.couleur, 'lat', ch.latitude, 'lng', ch.longitude,
        -- 0043 : détails et fichiers joints des notes.
        'details', n.details, 'pieces', n.pieces) order by n.date, n.demi desc nulls first, n.id)
      from notes n left join chantiers ch on ch.id = n.chantier_id
      where n.planning_id = lien.planning_id and n.date between v_lundi and v_lundi + 6), '[]'::jsonb),
    'feries', coalesce((select jsonb_agg(jsonb_build_object('date', f.date, 'libelle', f.libelle) order by f.date)
      from feries f where f.entreprise_id = v_e and f.date between v_lundi and v_lundi + 6), '[]'::jsonb),
    'horaires', coalesce((select jsonb_agg(jsonb_build_object('debut', h.date_debut, 'fin', h.date_fin,
        'matin', to_char(h.matin_debut, 'HH24:MI') || '–' || to_char(h.matin_fin, 'HH24:MI'),
        'aprem', case when h.aprem_debut is not null and h.aprem_fin is not null then to_char(h.aprem_debut, 'HH24:MI') || '–' || to_char(h.aprem_fin, 'HH24:MI') end) order by h.date_debut, h.id)
      from horaires h where h.entreprise_id = v_e and h.date_debut <= v_lundi + 6 and h.date_fin >= v_lundi), '[]'::jsonb)
  );
end $$;

notify pgrst, 'reload schema';
