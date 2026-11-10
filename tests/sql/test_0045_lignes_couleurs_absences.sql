-- Tests de 0045 (lignes, couleurs de chantier, absences par planning).
-- À lancer après test_0044_*.sql (tests/sql/lancer.sh) : L = Lionel (P1),
-- C = collègue (P2, même entreprise).
\set QUIET on
\pset tuples_only on
\pset format unaligned
create or replace function pg_temp.v(ok boolean, libelle text) returns text language sql as $$ select case when ok then 'OK: ' else 'ÉCHEC: ' end || libelle $$;
grant execute on function pg_temp.v(boolean, text) to authenticated, anon;
create or replace function pg_temp.ligne(n text) returns text language sql as $$
  select coalesce((select ordre::text || '/' || masque::text from personnes_du_planning where nom = n), '-') $$;
grant execute on function pg_temp.ligne(text) to authenticated;
-- Remise à zéro des lignes et couleurs de L avant les tests (les tests 0044 ont pu en écrire).
delete from lignes_planning; delete from couleurs_chantiers;
update personnes set masque = false, ordre = 2 where nom = 'Paul';

-- ---- Lignes : ordre et coche par planning ----
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
update personnes set masque = true where nom = 'Mathis';
update personnes set ordre = 1 where nom = 'Paul';
select pg_temp.v(pg_temp.ligne('Mathis') like '%/true' and pg_temp.ligne('Paul') = '1/false', 'C : masque Mathis et met Paul en tête, pour lui (' || pg_temp.ligne('Mathis') || ' ; ' || pg_temp.ligne('Paul') || ')');
insert into personnes (nom, ordre) values ('Ouvrier de C', 20);
select pg_temp.v(pg_temp.ligne('Ouvrier de C') = '20/false', 'C : son nouvel ouvrier est affiché chez lui');
commit;
select pg_temp.v((select masque from personnes where nom = 'Mathis') = false and (select ordre from personnes where nom = 'Paul') = 2,
  'la personne elle-même ne change pas (Mathis non masqué, Paul ordre 2)');
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select pg_temp.v(pg_temp.ligne('Mathis') like '%/false' and pg_temp.ligne('Paul') = '2/false' and pg_temp.ligne('Ouvrier de C') = '20/true',
  'L : Mathis toujours affiché, Paul à sa place, l''ouvrier ajouté par C masqué chez lui (' || pg_temp.ligne('Ouvrier de C') || ')');
update personnes set masque = false where nom = 'Ouvrier de C';
update personnes set masque = true where nom = 'Paul';
insert into personnes (nom, ordre) values ('Ouvrier de L', 21);
select pg_temp.v(pg_temp.ligne('Ouvrier de C') = '20/false' and pg_temp.ligne('Paul') = '2/true', 'L : coche l''ouvrier de C, masque Paul, pour lui');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select pg_temp.v(pg_temp.ligne('Paul') = '1/false' and pg_temp.ligne('Ouvrier de L') = '21/true', 'C : Paul toujours affiché en tête ; l''ouvrier ajouté par L masqué chez lui');
commit;

-- ---- Couleur des chantiers ----
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
update chantiers set couleur = '#ff0000' where nom like '26150%';
select pg_temp.v((select couleur from chantiers_du_planning where nom like '26150%') = '#ff0000', 'C : change la couleur de Villa Bine pour lui');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select pg_temp.v((select couleur from chantiers_du_planning where nom like '26150%') = '#bfe0c9', 'L : garde sa couleur pour Villa Bine');
insert into chantiers (nom, couleur) values ('Nouveau de L', '#00aa00');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select pg_temp.v((select couleur from chantiers_du_planning where nom = 'Nouveau de L') = '#00aa00', 'C : un chantier créé par L a la même couleur au départ');
commit;
select pg_temp.v((select couleur from chantiers where nom like '26150%') = '#bfe0c9', 'le chantier lui-même garde sa couleur de création');

-- ---- Absences ----
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
insert into taches (personne_id, date, demi, texte, est_absence) values ((select id from personnes where nom = 'Paul'), '2026-11-12', 'aprem', 'Maladie', true);
update taches set texte = 'Congé (modifié par C)' where texte = 'Congé';
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select pg_temp.v((select string_agg(texte, ',' order by texte) from taches where est_absence) = 'Congé (modifié par C),Maladie'
  and not exists (select 1 from taches where texte in ('Importée', 'Case de C', 'Tâche de C')),
  'L : voit l''absence posée par C et sa modification de son congé ; pas les autres tâches de C');
commit;
set role anon;
select pg_temp.v((select string_agg(x ->> 'texte', ',' order by x ->> 'texte') from jsonb_array_elements(consultation_responsable('fedcba9876543210fedcba9876543210', '2026-11-09') -> 'taches') x)
  = 'Coffrage,Congé (modifié par C),Ferraillage,Réunion'
  and (select string_agg(x ->> 'nom', ',' order by x ->> 'nom') from jsonb_array_elements(consultation_responsable('fedcba9876543210fedcba9876543210', '2026-11-09') -> 'personnes') x) not like '%Paul%'
  and (select x ->> 'couleur' from jsonb_array_elements(consultation_responsable('fedcba9876543210fedcba9876543210', '2026-11-09') -> 'taches') x where x ->> 'texte' = 'Coffrage') = '#bfe0c9',
  'lien responsable de L : ses lignes (Paul masqué chez L), absences de tous, ses couleurs');
select pg_temp.v((select x ->> 'couleur' from jsonb_array_elements(consultation_responsable('cccccccccccccccccccccccccccccccc', '2026-11-09') -> 'taches') x where x ->> 'texte' = 'Case de C') is null
  and exists (select 1 from jsonb_array_elements(consultation_responsable('cccccccccccccccccccccccccccccccc', '2026-11-09') -> 'personnes') x where x ->> 'nom' = 'Paul'),
  'lien responsable de C : Paul affiché chez C');
reset role;
do $$ begin
  set local role anon;
  perform 1 from personnes_du_planning;
  raise notice 'ÉCHEC: vue lisible sans connexion';
exception when others then raise notice 'OK: vues personnes_du_planning / chantiers_du_planning fermées sans connexion (%)', sqlerrm; end $$;

-- ---- Sauvegardes ----
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select creer_sauvegarde('manuelle') is not null;
select pg_temp.v((select jsonb_array_length(contenu -> 'tables' -> 'lignes_planning') from sauvegardes where id = (select max(id) from sauvegardes)) >= 2,
  'L : sa sauvegarde contient ses lignes (ordre, coches)');
update personnes set masque = false where nom = 'Paul';
select restaurer_sauvegarde((select max(id) from sauvegardes where origine = 'manuelle')) is not null;
select pg_temp.v(pg_temp.ligne('Paul') = '2/true', 'L restaure : Paul de nouveau masqué chez lui (' || pg_temp.ligne('Paul') || ')');
commit;
-- Absence de L reprise par C (même case réécrite) puis restauration de L : pas en double.
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select remplacer_case_personne((select id from personnes where nom = 'Mathis'), '2026-11-11', 'matin', '[{"texte": "Congé (modifié par C)", "est_absence": true}]');
commit;
select pg_temp.v((select p.nom from taches t join plannings p on p.id = t.planning_id where t.texte = 'Congé (modifié par C)') = 'Collègue',
  'la case réécrite par C : l''absence passe dans son planning (toujours visible des deux)');
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select restaurer_sauvegarde((select max(id) from sauvegardes where origine = 'manuelle')) is not null;
select pg_temp.v((select count(*) from taches where est_absence and texte = 'Congé (modifié par C)') = 1, 'L restaure : l''absence reprise par C n''est pas remise en double');
commit;
