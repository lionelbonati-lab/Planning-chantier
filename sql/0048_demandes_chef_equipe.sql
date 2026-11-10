-- ============================================================
-- Planning Chantiers — plusieurs plannings : demandes d'absence chez le
-- chef d'équipe
-- Migration 0048 — 10.11.2026 (suite 157)
--
-- Lionel : « J'aimerai que la demande de congé n'apparaisse uniquement
-- chez la personne qui emploie un ouvrier ». Ses choix : chef d'équipe =
-- « Planning où il est affiché » (« la demande arrive dans chaque planning
-- où sa ligne est cochée « Afficher » ») ; l'absence acceptée « Partout,
-- comme maintenant ». Puis (suite 158) : « Remplace employeur par chef
-- d'équipe, car nous ne sommes pas employeurs, nous sommes chefs d'équipe. »
--
--   1. plannings_de_la_personne_(personne) : les plannings de son
--      entreprise où sa ligne est affichée (personne active, coche
--      « Afficher » du planning, sinon celle de la personne) ; affichée
--      nulle part : le planning de l'administrateur (la demande ne se perd
--      pas).
--   2. demandes_absence : chaque compte ne voit (et ne traite) que les
--      demandes des personnes de son planning (policy « entreprise »).
--   3. destinataires_demandes_() : pour la fonction serveur envoyer-push
--      (clé de service), les plannings à prévenir de chaque demande en
--      attente.
-- L'absence acceptée reste visible dans tous les plannings (0045).
--
-- Lionel l'applique dans l'éditeur SQL de Supabase. Rejouable.
-- ============================================================

create or replace function plannings_de_la_personne_(p_personne bigint) returns setof uuid
language sql stable security definer set search_path = public as $$
  with p as (select id, entreprise_id, actif, masque from personnes where id = p_personne),
  affiches as (
    select pl.id from p join plannings pl on pl.entreprise_id = p.entreprise_id
    left join lignes_planning l on l.planning_id = pl.id and l.personne_id = p.id
    where p.actif and not coalesce(l.masque, p.masque, false)
  )
  select id from affiches
  union
  select m.planning_id from p join plannings pl on pl.entreprise_id = p.entreprise_id join membres m on m.planning_id = pl.id
  where m.role = 'admin' and not exists (select 1 from affiches);
$$;
revoke all on function plannings_de_la_personne_(bigint) from public, anon, authenticated;
grant execute on function plannings_de_la_personne_(bigint) to service_role;

-- Pour la policy : la demande est-elle pour le planning du compte ?
create or replace function demande_pour_moi_(p_personne bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from plannings_de_la_personne_(p_personne) x where x = mon_planning());
$$;
revoke all on function demande_pour_moi_(bigint) from public, anon;
grant execute on function demande_pour_moi_(bigint) to authenticated, service_role;

drop policy if exists "entreprise" on demandes_absence;
create policy "entreprise" on demandes_absence for all to authenticated
  using (entreprise_id = (select mon_entreprise()) and demande_pour_moi_(personne_id))
  with check (entreprise_id = (select mon_entreprise()));

create or replace function destinataires_demandes_() returns table (personne_id bigint, planning_id uuid)
language sql stable security definer set search_path = public as $$
  select d.personne_id, x from (select distinct q.personne_id from demandes_absence q where q.statut = 'en_attente') d,
    plannings_de_la_personne_(d.personne_id) x;
$$;
revoke all on function destinataires_demandes_() from public, anon, authenticated;
grant execute on function destinataires_demandes_() to service_role;

notify pgrst, 'reload schema';
