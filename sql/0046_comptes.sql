-- ============================================================
-- Planning Chantiers — plusieurs plannings, étape 3 : les comptes
-- Migration 0046 — 09.11.2026 (suite 155)
--
-- Choix de Lionel (suite 153) : compte créé « Toi, depuis l'appli »
-- (« Une page Réglages › Comptes : tu tapes son e-mail […]. Personne
-- d'autre ne peut créer de compte. ») ; invitations « Toi seul » (« tu
-- invites un compte, en choisissant son planning (un nouveau, ou le tien
-- pour le partager) »). Et : « Fait toutes les étapes sans me redemander ».
--
-- Le compte est créé par la fonction serveur inviter-compte (clé de
-- service) ; ici, ce dont elle et la page Réglages › Comptes ont besoin :
--   1. reglages et couleurs_perso : clé (planning_id, cle) / (planning_id,
--      id) à la place de l'ancienne (deux plannings peuvent avoir le même
--      réglage). L'appli l'utilise depuis la suite 153.
--   2. creer_planning_(entreprise, nom) : nouveau planning ; tout le
--      personnel y est masqué (chacun coche les siens), sauf les lignes
--      Machines / Transports.
--   3. comptes_entreprise() : les comptes de l'entreprise (administrateur ;
--      les autres : le leur), avec e-mail, nom, planning et dernière
--      connexion ; plannings_entreprise() : les plannings, pour l'invitation.
--   4. retirer_compte(compte) : l'administrateur retire un compte (ni le
--      sien, ni un autre administrateur) ; le planning et ses données
--      restent.
--   5. supprimer_mon_compte : le dernier administrateur ne peut pas
--      supprimer son compte (l'entreprise resterait sans administrateur).
--
-- Lionel l'applique dans l'éditeur SQL de Supabase. Rejouable.
-- ============================================================

-- ---------- 1. Clés par planning ----------
alter table reglages drop constraint if exists reglages_pkey;
alter table reglages add constraint reglages_pkey primary key (planning_id, cle);
drop index if exists reglages_planning_cle;
alter table couleurs_perso drop constraint if exists couleurs_perso_pkey;
alter table couleurs_perso add constraint couleurs_perso_pkey primary key (planning_id, id);
drop index if exists couleurs_perso_planning_id;

-- ---------- 2. Nouveau planning ----------
create or replace function creer_planning_(p_entreprise uuid, p_nom text) returns uuid
language plpgsql security definer set search_path = public as $$
declare pl uuid;
begin
  if not exists (select 1 from entreprises where id = p_entreprise) then raise exception 'Entreprise inconnue.'; end if;
  insert into plannings (entreprise_id, nom) values (p_entreprise, coalesce(nullif(btrim(p_nom), ''), 'Planning')) returning id into pl;
  insert into lignes_planning (planning_id, personne_id, masque)
    select pl, p.id, p.groupe_id is null from personnes p where p.entreprise_id = p_entreprise and p.planning_id is null
  on conflict (planning_id, personne_id) do nothing;
  return pl;
end $$;
revoke all on function creer_planning_(uuid, text) from public, anon, authenticated;
grant execute on function creer_planning_(uuid, text) to service_role;

-- ---------- 3. Comptes et plannings de l'entreprise ----------
create or replace function comptes_entreprise() returns table (
  user_id uuid, email text, prenom text, nom text, planning_id uuid, planning text, role text,
  cree_le timestamptz, derniere_connexion timestamptz, moi boolean, provisoire boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, coalesce(pr.prenom, ''), coalesce(pr.nom, ''), m.planning_id, pl.nom, m.role,
    m.cree_le, u.last_sign_in_at, m.user_id = auth.uid(),
    coalesce((u.raw_user_meta_data ->> 'changer_mot_de_passe')::boolean, false)
  from membres m
  join plannings pl on pl.id = m.planning_id
  join auth.users u on u.id = m.user_id
  left join profils pr on pr.user_id = m.user_id
  where pl.entreprise_id = mon_entreprise() and (suis_admin() or m.user_id = auth.uid())
  order by m.role, m.cree_le;
$$;
create or replace function plannings_entreprise() returns table (id uuid, nom text, comptes integer, le_mien boolean)
language sql stable security definer set search_path = public as $$
  select pl.id, pl.nom, (select count(*) from membres m where m.planning_id = pl.id)::integer, pl.id = mon_planning()
  from plannings pl where pl.entreprise_id = mon_entreprise() and suis_admin()
  order by pl.cree_le, pl.id;
$$;

-- ---------- 4. Retirer un compte ----------
create or replace function retirer_compte(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cible membres;
begin
  if not suis_admin() then raise exception 'Réservé à l''administrateur.'; end if;
  select m.* into cible from membres m join plannings pl on pl.id = m.planning_id
    where m.user_id = p_user and pl.entreprise_id = mon_entreprise();
  if not found then raise exception 'Compte introuvable.'; end if;
  if p_user = auth.uid() or cible.role = 'admin' then raise exception 'Ce compte ne peut pas être retiré ici.'; end if;
  delete from auth.users where id = p_user;
end $$;
revoke all on function comptes_entreprise(), plannings_entreprise(), retirer_compte(uuid) from public, anon;
grant execute on function comptes_entreprise(), plannings_entreprise(), retirer_compte(uuid) to authenticated;

-- ---------- 5. Supprimer son compte ----------
create or replace function supprimer_mon_compte() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Non connecté.';
  end if;
  -- 0046 : jamais le dernier administrateur de son entreprise.
  if public.suis_admin() and not exists (select 1 from public.membres m join public.plannings pl on pl.id = m.planning_id
      where m.role = 'admin' and m.user_id <> auth.uid() and pl.entreprise_id = public.mon_entreprise()) then
    raise exception 'Tu es le seul administrateur : ton compte ne peut pas être supprimé.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

notify pgrst, 'reload schema';
