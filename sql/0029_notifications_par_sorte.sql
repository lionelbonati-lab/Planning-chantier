-- ============================================================
-- Planning Chantiers — notifications : réglages par sorte, x jours avant,
-- au début de la demi-journée
-- Migration 0029 — 30.09.2026 (suite 128)
--
-- Lionel : « Notifications, notification différents pour chaque groupe de
-- libellé différents. Possibilité de pour régler x jours avant et en
-- fonction des horaires de travail. », puis, à nos questions : chaque
-- sorte actuelle a ses propres réglages ; l'heure d'envoi est le « Début
-- de demi journée ».
--
--   1. abonnements_push.reglages : « x jours avant » de chaque sorte, par
--      appareil — importants et à réserver (jours de travail avant ; 1 par
--      défaut), rappel des demandes d'absence encore en attente (null =
--      pas de rappel, par défaut). Les heures fixes de la veille et du
--      matin (heure_veille, heure_matin, derniere_veille, dernier_matin,
--      0027) sont retirées (2e partie, après le déploiement de la
--      fonction Edge qui ne les lit plus) ;
--   2. push_creneaux_(t) : les CRÉNEAUX d'aujourd'hui à traiter — début du
--      matin et début de l'après-midi selon la page Horaires (dernière
--      période qui commence l'emporte, comme horaireDuJour ; pas de
--      période : 07:00 / 13:00 ; période « matin seul » : pas de créneau
--      l'après-midi). Un créneau est dû pendant les 4 heures qui suivent
--      son début, tant qu'il n'est pas noté dans push_passages ;
--   3. push_passages : créneaux déjà traités (noté par envoyer-push AVANT
--      d'envoyer : jamais deux fois) ;
--   4. push_a_faire_ (pg_cron, chaque minute) : l'appel de la fonction
--      Edge se fait aussi quand un créneau est dû (au lieu des heures de
--      veille / matin de chaque abonnement) ;
--   5. droits du rôle service : horaires et feries (jours de travail),
--      push_passages, push_creneaux_.
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migrations `notifications_par_sorte` puis
-- `notifications_par_sorte_nettoyage`) ; ce fichier garde la trace.
-- Rejouable.
-- ============================================================

-- ---- 1. Réglages par sorte --------------------------------------------------
alter table abonnements_push add column if not exists reglages jsonb not null
  default '{"importants": 1, "a_reserver": 1, "rappel_demandes": null}'::jsonb;

-- ---- 3. Créneaux déjà traités (avant 2 : push_creneaux_ la lit) -----------
create table if not exists push_passages (
  cle text primary key,            -- « 2026-10-01:matin », « 2026-10-01:aprem »
  le timestamptz not null default now()
);
alter table push_passages enable row level security;
revoke all on push_passages from anon, authenticated;
grant select, insert, delete on push_passages to service_role;

-- ---- 2. Créneaux d'aujourd'hui à traiter -----------------------------------
create or replace function push_creneaux_(t timestamptz default now())
returns table (cle text, jour date, demi text)
language sql stable security definer set search_path = public as $$
  with j as (
    select (t at time zone 'Europe/Zurich')::date as jour, (t at time zone 'Europe/Zurich')::time as heure
  ),
  h as (
    select p.matin_debut, case when p.aprem_debut is not null and p.aprem_fin is not null then p.aprem_debut end as aprem_debut
    from horaires p, j
    where j.jour between p.date_debut and p.date_fin and extract(isodow from j.jour) < 6
    order by p.date_debut desc, p.id desc
    limit 1
  ),
  c as (
    select 'matin'::text as demi, coalesce((select h.matin_debut from h), time '07:00') as debut
    union all
    select 'aprem'::text, case when exists (select 1 from h) then (select h.aprem_debut from h) else time '13:00' end
  )
  select j.jour::text || ':' || c.demi, j.jour, c.demi
  from c, j
  where c.debut is not null
    and j.heure >= c.debut
    and extract(epoch from j.heure) < extract(epoch from c.debut) + 4 * 3600
    and not exists (select 1 from push_passages x where x.cle = j.jour::text || ':' || c.demi);
$$;
revoke all on function push_creneaux_(timestamptz) from public, anon, authenticated;
grant execute on function push_creneaux_(timestamptz) to service_role;

-- ---- 4. Appel de la fonction Edge, seulement s'il y a à faire ----------------
create or replace function push_a_faire_() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from abonnements_push) and (
    exists (select 1 from demandes_absence where statut = 'en_attente' and not notifiee_push)
    or exists (select 1 from push_modifs where derniere <= now() - interval '60 seconds')
    or exists (select 1 from push_creneaux_())
  );
$$;
revoke all on function push_a_faire_() from public, anon, authenticated;

-- ---- 5. Droits de la fonction Edge ------------------------------------------
grant select on horaires, feries to service_role;

-- ---- 1 (suite). Heures fixes retirées -----------------------------------------
-- Après le déploiement de la fonction Edge (v2) qui ne les lit plus.
alter table abonnements_push drop column if exists heure_veille;
alter table abonnements_push drop column if exists heure_matin;
alter table abonnements_push drop column if exists derniere_veille;
alter table abonnements_push drop column if exists dernier_matin;
