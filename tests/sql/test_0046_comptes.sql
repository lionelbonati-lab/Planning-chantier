-- Tests de 0046 (comptes). À lancer après test_0045_*.sql (tests/sql/lancer.sh) :
-- L = Lionel (administrateur, P1), C = collègue (P2), S = inconnu (autre entreprise).
\set QUIET on
\pset tuples_only on
\pset format unaligned
create or replace function pg_temp.v(ok boolean, libelle text) returns text language sql as $$ select case when ok then 'OK: ' else 'ÉCHEC: ' end || libelle $$;
grant execute on function pg_temp.v(boolean, text) to authenticated, anon, service_role;

-- ---- Réglages et couleurs : même clé dans deux plannings ----
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
insert into reglages (cle, valeur) values ('ordre_groupes', '["intervenants"]') on conflict (planning_id, cle) do update set valeur = excluded.valeur;
insert into couleurs_perso (id, clair) values ('principale', '#ffffff') on conflict (planning_id, id) do update set clair = excluded.clair;
commit;
select pg_temp.v((select count(*) from reglages where cle = 'ordre_groupes') = 2 and (select count(*) from couleurs_perso where id = 'principale') = 2
  and (select valeur from reglages where cle = 'ordre_groupes' and planning_id = (select id from plannings where nom = 'Lionel Test')) = '["personnel", "groupe-1", "intervenants"]'::jsonb,
  'réglage et couleur de même clé dans les deux plannings, chacun le sien');

-- ---- Nouveau planning (fonction serveur, clé de service) ----
do $$ begin
  set local role authenticated;
  perform creer_planning_((select entreprise_id from plannings limit 1), 'Pirate');
  raise notice 'ÉCHEC: un compte crée un planning';
exception when others then raise notice 'OK: un compte ne peut pas créer de planning lui-même (%)', sqlerrm; end $$;
begin; set local role service_role;
select creer_planning_((select entreprise_id from plannings where nom = 'Lionel Test'), 'Planning de Marc') is not null;
commit;
select pg_temp.v(exists (select 1 from plannings where nom = 'Planning de Marc')
  and (select string_agg(p.nom || ':' || l.masque, ',' order by p.nom, p.id) from lignes_planning l join personnes p on p.id = l.personne_id
       where l.planning_id = (select id from plannings where nom = 'Planning de Marc')) like 'Fantôme:true,Machines:false,Machines:false,Mathis:true,%Paul:true,Transports:false%',
  'nouveau planning : personnel masqué (chacun coche les siens), lignes Machines / Transports affichées (' ||
  coalesce((select string_agg(p.nom || ':' || l.masque, ',' order by p.nom, p.id) from lignes_planning l join personnes p on p.id = l.personne_id
       where l.planning_id = (select id from plannings where nom = 'Planning de Marc')), '-') || ')');

-- ---- Comptes et plannings de l'entreprise ----
update auth.users set last_sign_in_at = now() - interval '1 day' where email = 'c@test';
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select pg_temp.v((select string_agg(email || ':' || role || ':' || planning || ':' || moi, ',' order by email) from comptes_entreprise()) = 'c@test:membre:Collègue:false,lionel@test:admin:Lionel Test:true'
  and (select derniere_connexion is not null from comptes_entreprise() where email = 'c@test') and (select prenom from comptes_entreprise() where moi) = 'Lionel',
  'L (administrateur) : les comptes de son entreprise (e-mail, rôle, planning, dernière connexion, nom)');
select pg_temp.v((select string_agg(nom || ':' || comptes || ':' || le_mien, ',' order by nom) from plannings_entreprise()) = 'Collègue:1:false,Lionel Test:1:true,Planning de Marc:0:false',
  'L : les plannings de l''entreprise (pour l''invitation), le sien marqué');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select pg_temp.v((select string_agg(email, ',') from comptes_entreprise()) = 'c@test' and (select count(*) from plannings_entreprise()) = 0,
  'C (membre) : son compte seul, aucun planning à inviter');
do $$ begin
  perform retirer_compte('11111111-1111-1111-1111-111111111111');
  raise notice 'ÉCHEC: C retire un compte';
exception when others then raise notice 'OK: C ne peut retirer aucun compte (%)', sqlerrm; end $$;
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select pg_temp.v((select string_agg(email, ',') from comptes_entreprise()) = 's@test' and (select string_agg(nom, ',') from plannings_entreprise()) = 'Inconnu',
  'S (administrateur d''une autre entreprise) : rien de l''entreprise de L');
do $$ begin
  perform retirer_compte('22222222-2222-2222-2222-222222222222');
  raise notice 'ÉCHEC: S retire un compte d''une autre entreprise';
exception when others then raise notice 'OK: S ne peut pas retirer un compte d''une autre entreprise (%)', sqlerrm; end $$;
commit;

-- ---- Retirer, supprimer ----
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  perform retirer_compte('11111111-1111-1111-1111-111111111111');
  raise notice 'ÉCHEC: L retire son propre compte';
exception when others then raise notice 'OK: L ne retire pas son propre compte ici (%)', sqlerrm; end $$;
do $$ begin
  perform supprimer_mon_compte();
  raise notice 'ÉCHEC: le seul administrateur supprime son compte';
exception when others then raise notice 'OK: le seul administrateur ne peut pas supprimer son compte (%)', sqlerrm; end $$;
select retirer_compte('22222222-2222-2222-2222-222222222222');
commit;
select pg_temp.v(not exists (select 1 from auth.users where email = 'c@test') and not exists (select 1 from membres where user_id = '22222222-2222-2222-2222-222222222222')
  and exists (select 1 from plannings where nom = 'Collègue') and exists (select 1 from taches where planning_id = (select id from plannings where nom = 'Collègue')),
  'L retire le compte de C : le compte part, son planning et ses données restent');
