-- ============================================================
-- Planning Chantiers — plusieurs plannings, étape 2 : lignes, couleurs de
-- chantier et absences
-- Migration 0045 — 09.11.2026 (suite 154)
--
-- Suite de la 0044 (suite 153). Choix de Lionel : lignes « Chacun
-- choisit » (« La coche Afficher et l'ordre des lignes sont propres à
-- chaque planning ») ; « Pour les chantiers chacun choisi sa couleur »,
-- « La même au départ » ; absences « Oui, partout » (« Un congé posé par
-- toi apparaît aussi chez lui (et inversement) »). Et : « Fait toutes les
-- étapes sans me redemander ».
--
--   1. lignes_planning (planning, personne, ordre, masque) : l'ordre et la
--      coche « Afficher » d'une ligne pour un planning (vide = valeur de la
--      personne). L'appli écrit toujours personnes.ordre / personnes.masque :
--      un déclencheur range la valeur dans lignes_planning pour le planning
--      du compte et laisse la personne telle quelle. Une personne ajoutée
--      par un planning est masquée dans les autres (chacun coche les siens).
--      Vue personnes_du_planning : la personne avec l'ordre et la coche du
--      planning du compte (l'appli la lit à la place de personnes).
--   2. couleurs_chantiers (planning, chantier, couleur) : même principe pour
--      chantiers.couleur ; un nouveau chantier garde la couleur choisie à sa
--      création pour tous, jusqu'à ce que chacun la change pour lui. Vue
--      chantiers_du_planning.
--   3. Absences : une tâche d'absence est visible et modifiable par tous
--      les plannings de l'entreprise (le reste des tâches reste à son
--      planning).
--   4. Lien responsable : lignes, ordre et couleurs du planning du lien ;
--      absences de tous les plannings.
--   5. Sauvegardes : lignes_planning et couleurs_chantiers en font partie ;
--      restaurer ne touche qu'aux tables présentes dans la sauvegarde.
--
-- Appliquée par Claude (outil Supabase de la session), à la demande de
-- Lionel. Rejouable.
-- ============================================================

-- ---------- 1. Ordre et coche « Afficher » par planning ----------
create table if not exists lignes_planning (
  planning_id uuid not null default mon_planning() references plannings (id) on delete cascade,
  personne_id bigint not null references personnes (id) on delete cascade,
  ordre integer,
  masque boolean,
  primary key (planning_id, personne_id)
);
create index if not exists lignes_planning_personne on lignes_planning (personne_id);
alter table lignes_planning enable row level security;
drop policy if exists "planning" on lignes_planning;
create policy "planning" on lignes_planning for all to authenticated
  using (planning_id = (select mon_planning())) with check (planning_id = (select mon_planning()));
revoke all on lignes_planning from anon, authenticated;
grant select on lignes_planning to authenticated;

-- L'appli écrit personnes.masque / personnes.ordre : rangés pour le
-- planning du compte (sans compte, sauvegarde de nuit… : la personne).
create or replace function personnes_masque_planning_() returns trigger
language plpgsql security definer set search_path = public as $$
declare pl uuid := mon_planning();
begin
  if pl is null then return new; end if;
  insert into lignes_planning (planning_id, personne_id, masque) values (pl, new.id, new.masque)
    on conflict (planning_id, personne_id) do update set masque = excluded.masque;
  new.masque := old.masque;
  return new;
end $$;
create or replace function personnes_ordre_planning_() returns trigger
language plpgsql security definer set search_path = public as $$
declare pl uuid := mon_planning();
begin
  if pl is null then return new; end if;
  insert into lignes_planning (planning_id, personne_id, ordre) values (pl, new.id, new.ordre)
    on conflict (planning_id, personne_id) do update set ordre = excluded.ordre;
  new.ordre := old.ordre;
  return new;
end $$;
drop trigger if exists personnes_masque_planning on personnes;
create trigger personnes_masque_planning before update of masque on personnes for each row execute function personnes_masque_planning_();
drop trigger if exists personnes_ordre_planning on personnes;
create trigger personnes_ordre_planning before update of ordre on personnes for each row execute function personnes_ordre_planning_();
-- Une personne ajoutée (pas une équipe) : masquée dans les autres plannings.
create or replace function personnes_masquer_ailleurs_() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.planning_id is null then
    insert into lignes_planning (planning_id, personne_id, masque)
      select pl.id, new.id, true from plannings pl
      where pl.entreprise_id = new.entreprise_id and pl.id is distinct from mon_planning()
    on conflict (planning_id, personne_id) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists personnes_masquer_ailleurs on personnes;
create trigger personnes_masquer_ailleurs after insert on personnes for each row execute function personnes_masquer_ailleurs_();

create or replace view personnes_du_planning with (security_invoker = true) as
  select p.id, p.nom, p.sous_traitant, p.actif, coalesce(l.ordre, p.ordre) as ordre, p.created_at, p.equipe, p.couleur,
    p.groupe_id, coalesce(l.masque, p.masque) as masque, p.entreprise_id, p.planning_id
  from personnes p
  left join lignes_planning l on l.personne_id = p.id and l.planning_id = (select mon_planning());
revoke all on personnes_du_planning from anon, authenticated;
grant select on personnes_du_planning to authenticated;

-- ---------- 2. Couleur des chantiers par planning ----------
create table if not exists couleurs_chantiers (
  planning_id uuid not null default mon_planning() references plannings (id) on delete cascade,
  chantier_id bigint not null references chantiers (id) on delete cascade,
  couleur text not null,
  primary key (planning_id, chantier_id)
);
create index if not exists couleurs_chantiers_chantier on couleurs_chantiers (chantier_id);
alter table couleurs_chantiers enable row level security;
drop policy if exists "planning" on couleurs_chantiers;
create policy "planning" on couleurs_chantiers for all to authenticated
  using (planning_id = (select mon_planning())) with check (planning_id = (select mon_planning()));
revoke all on couleurs_chantiers from anon, authenticated;
grant select on couleurs_chantiers to authenticated;

create or replace function chantiers_couleur_planning_() returns trigger
language plpgsql security definer set search_path = public as $$
declare pl uuid := mon_planning();
begin
  if pl is null or new.couleur is null then return new; end if;
  insert into couleurs_chantiers (planning_id, chantier_id, couleur) values (pl, new.id, new.couleur)
    on conflict (planning_id, chantier_id) do update set couleur = excluded.couleur;
  new.couleur := old.couleur;
  return new;
end $$;
drop trigger if exists chantiers_couleur_planning on chantiers;
create trigger chantiers_couleur_planning before update of couleur on chantiers for each row execute function chantiers_couleur_planning_();

create or replace view chantiers_du_planning with (security_invoker = true) as
  select c.id, c.nom, coalesce(cc.couleur, c.couleur) as couleur, c.created_at, c.actif, c.ordre, c.latitude, c.longitude, c.entreprise_id
  from chantiers c
  left join couleurs_chantiers cc on cc.chantier_id = c.id and cc.planning_id = (select mon_planning());
revoke all on chantiers_du_planning from anon, authenticated;
grant select on chantiers_du_planning to authenticated;

revoke all on function personnes_masque_planning_(), personnes_ordre_planning_(), personnes_masquer_ailleurs_(), chantiers_couleur_planning_()
  from public, anon, authenticated;

-- ---------- 3. Absences visibles et modifiables dans toute l'entreprise ----------
drop policy if exists "planning" on taches;
create policy "planning" on taches for all to authenticated
  using (planning_id = (select mon_planning())
    or (est_absence and planning_id in (select p.id from plannings p where p.entreprise_id = (select mon_entreprise()))))
  with check (planning_id = (select mon_planning())
    or (est_absence and planning_id in (select p.id from plannings p where p.entreprise_id = (select mon_entreprise()))));

-- ---------- 4. Lien responsable ----------
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
    -- 0039 : sans les équipes. 0045 : ordre et coche du planning du lien.
    'personnes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nom', p.nom, 'couleur', p.couleur,
        'section', case when p.sous_traitant then 'intervenants'
          when g.id is not null then case when g.ligne_unique then 'transports' else 'groupe-' || g.id end
          else 'personnel' end
      ) order by coalesce(l.ordre, p.ordre), p.id)
      from personnes p left join groupes g on g.id = p.groupe_id and g.actif
      left join lignes_planning l on l.personne_id = p.id and l.planning_id = lien.planning_id
      where p.entreprise_id = v_e and p.actif and not coalesce(l.masque, p.masque, false) and not coalesce(p.equipe, false)), '[]'::jsonb),
    'groupes', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'nom', g.nom) order by g.ordre, g.id)
      from groupes g where g.entreprise_id = v_e and g.actif and not g.ligne_unique), '[]'::jsonb),
    'ordre_groupes', coalesce((select r.valeur from reglages r where r.planning_id = lien.planning_id and r.cle = 'ordre_groupes' and jsonb_typeof(r.valeur) = 'array'), '[]'::jsonb),
    'taches', coalesce((select jsonb_agg(jsonb_build_object(
        'personne', x.personne, 'date', t.date, 'demi', t.demi, 'ordre', t.ordre, 'texte', t.texte,
        'important', t.important, 'absence', t.est_absence,
        'chantier', ch.nom, 'couleur', coalesce(cc.couleur, ch.couleur), 'lat', ch.latitude, 'lng', ch.longitude, 'statut', st.nom, 'couleur_statut', st.couleur,
        -- 0041 : détails et fichiers joints.
        'details', t.details, 'pieces', t.pieces
      ) order by t.date, t.demi desc, x.personne, x.d_equipe, t.ordre, t.id)
      from (
        -- Tâches des personnes affichées (0045 : leurs absences, de tous
        -- les plannings).
        select t.id, t.personne_id as personne, false as d_equipe
        from taches t join personnes p on p.id = t.personne_id
        left join lignes_planning l on l.personne_id = p.id and l.planning_id = lien.planning_id
        where (t.planning_id = lien.planning_id or t.est_absence) and p.entreprise_id = v_e and t.date between v_lundi and v_lundi + 6
          and p.actif and not coalesce(l.masque, p.masque, false) and not coalesce(p.equipe, false)
        union all
        -- 0039 : tâche d'équipe recopiée sur chaque membre de cette
        -- demi-journée, sauf sous une absence complète de ce membre.
        select t.id, m.id, true
        from taches t
        join personnes e on e.id = t.personne_id and e.equipe
        join personnes m on m.entreprise_id = v_e and m.actif and not coalesce(m.equipe, false) and not m.sous_traitant
          and equipe_membre_(e.id, m.id, t.date, t.demi)
        left join lignes_planning l on l.personne_id = m.id and l.planning_id = lien.planning_id
        where t.planning_id = lien.planning_id and t.date between v_lundi and v_lundi + 6 and not coalesce(l.masque, m.masque, false)
          and not exists (select 1 from taches a where a.personne_id = m.id and a.est_absence
            and a.date = t.date and a.demi = t.demi and not absence_partielle_(a.texte, a.demi))
      ) x
      join taches t on t.id = x.id
      left join chantiers ch on ch.id = t.chantier_id
      left join couleurs_chantiers cc on cc.chantier_id = ch.id and cc.planning_id = lien.planning_id
      left join statuts st on st.id = t.statut_id), '[]'::jsonb),
    'jalons', coalesce((select jsonb_agg(jsonb_build_object('date', j.date, 'demi', j.demi, 'texte', j.texte,
        'important', j.important, 'chantier', ch.nom, 'couleur', coalesce(cc.couleur, ch.couleur), 'lat', ch.latitude, 'lng', ch.longitude) order by j.date, j.demi desc nulls first, j.id)
      from jalons j left join chantiers ch on ch.id = j.chantier_id
      left join couleurs_chantiers cc on cc.chantier_id = ch.id and cc.planning_id = lien.planning_id
      where j.planning_id = lien.planning_id and j.date between v_lundi and v_lundi + 6), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('date', n.date, 'demi', n.demi, 'texte', n.texte,
        'important', n.important, 'chantier', ch.nom, 'couleur', coalesce(cc.couleur, ch.couleur), 'lat', ch.latitude, 'lng', ch.longitude,
        -- 0043 : détails et fichiers joints des notes.
        'details', n.details, 'pieces', n.pieces) order by n.date, n.demi desc nulls first, n.id)
      from notes n left join chantiers ch on ch.id = n.chantier_id
      left join couleurs_chantiers cc on cc.chantier_id = ch.id and cc.planning_id = lien.planning_id
      where n.planning_id = lien.planning_id and n.date between v_lundi and v_lundi + 6), '[]'::jsonb),
    'feries', coalesce((select jsonb_agg(jsonb_build_object('date', f.date, 'libelle', f.libelle) order by f.date)
      from feries f where f.entreprise_id = v_e and f.date between v_lundi and v_lundi + 6), '[]'::jsonb),
    'horaires', coalesce((select jsonb_agg(jsonb_build_object('debut', h.date_debut, 'fin', h.date_fin,
        'matin', to_char(h.matin_debut, 'HH24:MI') || '–' || to_char(h.matin_fin, 'HH24:MI'),
        'aprem', case when h.aprem_debut is not null and h.aprem_fin is not null then to_char(h.aprem_debut, 'HH24:MI') || '–' || to_char(h.aprem_fin, 'HH24:MI') end) order by h.date_debut, h.id)
      from horaires h where h.entreprise_id = v_e and h.date_debut <= v_lundi + 6 and h.date_fin >= v_lundi), '[]'::jsonb)
  );
end $$;

-- ---------- 5. Sauvegardes ----------
create or replace function tables_sauvegardees_() returns text[]
language sql immutable set search_path = public as $$
  select array['statuts', 'chantiers', 'groupes', 'categories_elements', 'elements_groupes', 'personnes', 'categories_feries', 'feries',
    'couleurs_perso', 'horaires', 'reglages', 'formulaires_rapides', 'formulaires_rapides_champs', 'series', 'assignations', 'taches',
    'jalons', 'notes', 'equipes_compositions', 'equipes_exceptions', 'lignes_planning', 'couleurs_chantiers'];
$$;

-- Restaurer : seules les tables présentes dans la sauvegarde sont remises
-- (une sauvegarde d'avant 0045 garde l'ordre, les coches et les couleurs
-- du planning). Une absence d'un autre planning n'est pas touchée.
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
    if s ? ts[i] and ts[i] <> 'personnes'
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = ts[i] and column_name = 'planning_id') then
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
  -- Une absence remise qui existe déjà dans un autre planning (reprise
  -- entre-temps par l'autre, même case, même texte) : pas en double.
  delete from taches t where t.planning_id = pl and t.est_absence and exists (select 1 from taches a
    where a.planning_id <> pl and a.est_absence and a.personne_id = t.personne_id and a.date = t.date and a.demi = t.demi and a.texte = t.texte);
  return avant;
end $$;
revoke all on function restaurer_sauvegarde(bigint) from public, anon;
grant execute on function restaurer_sauvegarde(bigint) to authenticated;

notify pgrst, 'reload schema';
