-- ============================================================
-- Planning Chantiers — profil du compte, suppression du compte
-- Migration 0019 — 26.09.2026 (suite 61)
--
-- Lionel : « Ajouter une page info personnel, pour entrée ses donnée comme
-- Nom, Prénom, Entreprise, modification du mot de passe, suppression du
-- compte et déconnexion. a mettre dans le menu setup » puis
-- « Possibilté d'ajouter une photo de profile ».
--
-- profils : une ligne par compte (clé = l'utilisateur connecté), visible et
-- modifiable par ce compte seulement (RLS). La photo est une petite image
-- JPEG carrée (256 px, recadrée et réduite dans le navigateur, cf.
-- js/page-compte.js) gardée en data URL : quelques dizaines de Ko au plus,
-- pas de bucket de stockage à gérer. La ligne disparaît avec le compte
-- (on delete cascade). Pas dans les sauvegardes du planning
-- (tables_sauvegardees_, 0017) : ce n'est pas le planning.
--
-- supprimer_mon_compte() : supprime le compte CONNECTÉ (auth.users) et
-- rien d'autre — le planning (tâches, personnes, chantiers…) reste dans la
-- base. SECURITY DEFINER : la clé du navigateur ne peut pas supprimer un
-- compte elle-même. La page demande le mot de passe et « SUPPRIMER »
-- avant de l'appeler.
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `profils_compte`) ; ce fichier garde la trace. Rejouable.
-- ============================================================

create table if not exists profils (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  prenom text not null default '',
  nom text not null default '',
  entreprise text not null default '',
  photo text,
  maj timestamptz not null default now(),
  constraint profils_photo_image check (photo is null or (photo like 'data:image/%' and length(photo) <= 400000))
);

alter table profils enable row level security;
drop policy if exists "soi_meme" on profils;
create policy "soi_meme" on profils for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on profils to authenticated;

create or replace function supprimer_mon_compte() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Non connecté.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function supprimer_mon_compte() from public, anon;
grant execute on function supprimer_mon_compte() to authenticated;
