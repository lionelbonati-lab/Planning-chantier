-- ============================================================
-- Planning Chantiers — notifications push (téléphone et ordinateur)
-- Migration 0027 — 29.09.2026 (suite 126)
--
-- Lionel : « Notification Push sur le téléphone et l'ordinateur avec
-- différents paramètre à régler dans l'appli. », puis, à notre question
-- sur ce qui doit arriver : les 4 sortes, chacune avec son interrupteur —
-- demandes d'absence, importants (la veille et le matin), à réserver,
-- modifications faites sur un autre appareil.
--
-- Chemin d'une notification :
--   1. l'appareil s'abonne (Réglages › Notifications, js/page-notifications.js) :
--      son navigateur donne une adresse d'envoi (endpoint + 2 clés), rangée
--      dans abonnements_push avec ses réglages (sortes, heures) ;
--   2. pg_cron, chaque minute, regarde s'il y a quelque chose à faire
--      (push_a_faire_ : requête légère) et seulement alors appelle la
--      fonction Edge envoyer-push (pg_net) ;
--   3. envoyer-push (functions/envoyer-push) décide quoi envoyer à qui
--      (logic.js), le note en base et l'envoie, signé des clés VAPID.
--
-- « Un autre appareil » : chaque appareil a sa propre session de
-- connexion ; le jeton envoyé avec chaque écriture porte son identifiant
-- (claim session_id). Un déclencheur sur taches, jalons et notes note la
-- session qui écrit (push_modifs) ; l'abonnement garde la session de son
-- appareil (reprise à chaque ouverture de l'appli). Rien à changer dans
-- les écritures de l'appli ni dans les fonctions Edge (elles écrivent
-- avec le jeton de l'utilisateur).
--
-- push_config (clés VAPID, jeton d'appel de pg_cron) : lisible seulement
-- par le rôle service (fonction Edge) — aucune policy, aucun droit pour
-- anon/authenticated. Ses valeurs sont posées à part (pas dans ce
-- fichier, publié sur GitHub).
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `notifications_push`) ; ce fichier garde la trace. Rejouable.
-- ============================================================

create extension if not exists pg_net;

-- ---- Abonnements (un par navigateur d'appareil) --------------------------
create table if not exists abonnements_push (
  id bigint generated always as identity primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  nom_appareil text,
  session_id text,
  types jsonb not null default '{"demandes": true, "importants": true, "a_reserver": true, "modifs": true}'::jsonb,
  heure_veille smallint not null default 18 check (heure_veille between 0 and 23),
  heure_matin smallint not null default 7 check (heure_matin between 0 and 23),
  derniere_veille date,
  dernier_matin date,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

alter table abonnements_push enable row level security;
drop policy if exists "connecte_tout" on abonnements_push;
create policy "connecte_tout" on abonnements_push for all to authenticated using (true) with check (true);
grant select, insert, update, delete on abonnements_push to authenticated;

-- Session de l'appareil reprise à chaque écriture du client ; gardée
-- telle quelle quand c'est la fonction Edge (rôle service) qui écrit.
create or replace function abonnement_push_session_() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.session_id := coalesce(auth.jwt() ->> 'session_id', new.session_id);
  new.maj_le := now();
  return new;
end $$;
drop trigger if exists abonnement_push_session on abonnements_push;
create trigger abonnement_push_session before insert or update on abonnements_push
  for each row execute function abonnement_push_session_();

-- ---- Modifications, par session -------------------------------------------
create table if not exists push_modifs (
  session_id text primary key,
  premiere timestamptz not null default now(),
  derniere timestamptz not null default now()
);
alter table push_modifs enable row level security;
revoke all on push_modifs from anon, authenticated;

-- Un déclencheur par sorte d'écriture : la table des lignes touchées
-- (« lignes ») permet d'ignorer une écriture qui ne change rien
-- (update … where sans ligne trouvée).
create or replace function noter_modif_push_() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from lignes) then return null; end if;
  insert into push_modifs (session_id) values (coalesce(auth.jwt() ->> 'session_id', ''))
  on conflict (session_id) do update set derniere = now();
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['taches', 'jalons', 'notes'] loop
    execute format('drop trigger if exists noter_modif_push on %I', t);
    execute format('drop trigger if exists noter_modif_push_ajout on %I', t);
    execute format('drop trigger if exists noter_modif_push_modif on %I', t);
    execute format('drop trigger if exists noter_modif_push_suppr on %I', t);
    execute format('create trigger noter_modif_push_ajout after insert on %I referencing new table as lignes for each statement execute function noter_modif_push_()', t);
    execute format('create trigger noter_modif_push_modif after update on %I referencing new table as lignes for each statement execute function noter_modif_push_()', t);
    execute format('create trigger noter_modif_push_suppr after delete on %I referencing old table as lignes for each statement execute function noter_modif_push_()', t);
  end loop;
end $$;

-- ---- Demandes d'absence déjà annoncées ------------------------------------
-- Celles qui attendaient avant les notifications : pas annoncées après
-- coup (seulement quand la colonne est créée : rejouer ne marque rien).
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'demandes_absence' and column_name = 'notifiee_push') then
    alter table demandes_absence add column notifiee_push boolean not null default false;
    update demandes_absence set notifiee_push = true where true;
  end if;
end $$;

-- ---- Configuration privée ---------------------------------------------------
create table if not exists push_config (
  id smallint primary key default 1 check (id = 1),
  vapid_public text not null,
  vapid_prive text not null,
  sujet text not null,
  jeton text not null
);
alter table push_config enable row level security;
revoke all on push_config from anon, authenticated;

-- Clé publique VAPID : le navigateur en a besoin pour s'abonner.
create or replace function cle_publique_push() returns text
language sql stable security definer set search_path = public as $$
  select vapid_public from push_config where id = 1;
$$;
revoke all on function cle_publique_push() from public, anon;
grant execute on function cle_publique_push() to authenticated;

-- ---- Droits de la fonction Edge (rôle service) -----------------------------
-- Dans ce projet, le rôle service n'a pas d'office le droit de lire les
-- tables (premier essai : « Notifications pas configurées. ») : seulement
-- ce dont envoyer-push a besoin (migration `notifications_push_droits_service`).
grant select on push_config to service_role;
grant select, update, delete on abonnements_push to service_role;
grant select, delete on push_modifs to service_role;
grant select, update on demandes_absence to service_role;
grant select on personnes, chantiers, statuts, taches, jalons, notes to service_role;

-- ---- Appel de la fonction Edge, seulement s'il y a à faire ----------------
create or replace function push_a_faire_() returns boolean
language sql stable security definer set search_path = public as $$
  with z as (select (now() at time zone 'Europe/Zurich') as t)
  select exists (select 1 from abonnements_push) and (
    exists (select 1 from demandes_absence where statut = 'en_attente' and not notifiee_push)
    or exists (select 1 from push_modifs where derniere <= now() - interval '60 seconds')
    or exists (select 1 from abonnements_push a, z
      where (extract(hour from z.t) >= a.heure_veille and a.derniere_veille is distinct from z.t::date)
         or (extract(hour from z.t) >= a.heure_matin and a.dernier_matin is distinct from z.t::date))
  );
$$;
revoke all on function push_a_faire_() from public, anon, authenticated;

select cron.schedule('envoyer-push', '* * * * *', $cron$
  select net.http_post(
    url := 'https://mvqvznohgtpulpgalvxl.supabase.co/functions/v1/envoyer-push',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cXZ6bm9oZ3RwdWxwZ2FsdnhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0ODI2MDcsImV4cCI6MjEwNDA1ODYwN30.HJjw2evEw1ka1IQAPNgba8sA8qDNRWhPvd96Kx4DkUQ'),
    body := jsonb_build_object('jeton', (select jeton from public.push_config where id = 1)),
    timeout_milliseconds := 30000)
  where public.push_a_faire_();
$cron$);
