-- ============================================================
-- Planning Chantiers — détails et fichiers joints (photos, PDF…) sur les
-- notes
-- Migration 0043 — 21.10.2026 (suite 149)
--
-- Lionel : « Les notes peuvent aussi avoir des descriptifs avec les photos
-- et des fichiers liés, même si je les utiliserai sûrement moins souvent. »
-- Comme les tâches (sql/0041, suite 147) : détails dans la fiche, fichiers
-- ajoutés depuis l'appli seulement, photos originales.
--
-- À appliquer APRÈS la 0041 (dossier « pieces », pieces_orphelines).
--
--   1. notes.details (texte long, vide = null) et notes.pieces (tableau
--      JSON { chemin, nom, type, taille, vignette }, comme taches.pieces).
--      Chaque ligne jour d'une note porte les mêmes valeurs. Dans les
--      sauvegardes sans rien changer (to_jsonb de la ligne, sql/0017) ;
--   2. consultation_responsable (version de sql/0041) : chaque note donne
--      aussi « details » et « pieces » (le lien des ouvriers n'affiche pas
--      les notes : consultation_planning ne change pas) ;
--   3. pieces_orphelines() (version de sql/0041) : les fichiers des notes,
--      et ceux des notes des sauvegardes, comptent aussi comme cités.
-- Rien d'autre ne change.
--
-- À appliquer par Lionel dans l'éditeur SQL de Supabase (comme 0038 à
-- 0042) ; ce fichier garde la trace. Rejouable.
-- ============================================================

-- ---- 1. Colonnes -------------------------------------------------------
alter table notes add column if not exists details text;
alter table notes add column if not exists pieces jsonb not null default '[]'::jsonb;
alter table notes drop constraint if exists notes_pieces_tableau;
alter table notes add constraint notes_pieces_tableau check (jsonb_typeof(pieces) = 'array');

-- ---- 2. Lien responsable ----------------------------------------------
create or replace function consultation_responsable(p_jeton text, p_lundi date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  lien liens_responsables;
  v_lundi date;
  aujourdhui date := (now() at time zone 'Europe/Zurich')::date;
  v_min date := date_trunc('week', (now() at time zone 'Europe/Zurich')::date)::date;
  v_max date := date_trunc('week', (now() at time zone 'Europe/Zurich')::date)::date + 28;
begin
  if p_jeton is null or length(p_jeton) < 32 then return null; end if;
  select * into lien from liens_responsables where jeton = p_jeton;
  if not found then return null; end if;
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
      where p.actif and not coalesce(p.masque, false) and not coalesce(p.equipe, false)), '[]'::jsonb),
    'groupes', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'nom', g.nom) order by g.ordre, g.id)
      from groupes g where g.actif and not g.ligne_unique), '[]'::jsonb),
    'ordre_groupes', coalesce((select r.valeur from reglages r where r.cle = 'ordre_groupes' and jsonb_typeof(r.valeur) = 'array'), '[]'::jsonb),
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
        where t.date between v_lundi and v_lundi + 6
          and p.actif and not coalesce(p.masque, false) and not coalesce(p.equipe, false)
        union all
        -- 0039 : tâche d'équipe recopiée sur chaque membre de cette
        -- demi-journée, sauf sous une absence complète de ce membre.
        select t.id, m.id, true
        from taches t
        join personnes e on e.id = t.personne_id and e.equipe
        join personnes m on m.actif and not coalesce(m.masque, false) and not coalesce(m.equipe, false) and not m.sous_traitant
          and equipe_membre_(e.id, m.id, t.date, t.demi)
        where t.date between v_lundi and v_lundi + 6
          and not exists (select 1 from taches a where a.personne_id = m.id and a.est_absence
            and a.date = t.date and a.demi = t.demi and not absence_partielle_(a.texte, a.demi))
      ) x
      join taches t on t.id = x.id
      left join chantiers ch on ch.id = t.chantier_id
      left join statuts st on st.id = t.statut_id), '[]'::jsonb),
    'jalons', coalesce((select jsonb_agg(jsonb_build_object('date', j.date, 'demi', j.demi, 'texte', j.texte,
        'important', j.important, 'chantier', ch.nom, 'couleur', ch.couleur, 'lat', ch.latitude, 'lng', ch.longitude) order by j.date, j.demi desc nulls first, j.id)
      from jalons j left join chantiers ch on ch.id = j.chantier_id
      where j.date between v_lundi and v_lundi + 6), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('date', n.date, 'demi', n.demi, 'texte', n.texte,
        'important', n.important, 'chantier', ch.nom, 'couleur', ch.couleur, 'lat', ch.latitude, 'lng', ch.longitude,
        -- 0043 : détails et fichiers joints des notes.
        'details', n.details, 'pieces', n.pieces) order by n.date, n.demi desc nulls first, n.id)
      from notes n left join chantiers ch on ch.id = n.chantier_id
      where n.date between v_lundi and v_lundi + 6), '[]'::jsonb),
    'feries', coalesce((select jsonb_agg(jsonb_build_object('date', f.date, 'libelle', f.libelle) order by f.date)
      from feries f where f.date between v_lundi and v_lundi + 6), '[]'::jsonb),
    'horaires', coalesce((select jsonb_agg(jsonb_build_object('debut', h.date_debut, 'fin', h.date_fin,
        'matin', to_char(h.matin_debut, 'HH24:MI') || '–' || to_char(h.matin_fin, 'HH24:MI'),
        'aprem', case when h.aprem_debut is not null and h.aprem_fin is not null then to_char(h.aprem_debut, 'HH24:MI') || '–' || to_char(h.aprem_fin, 'HH24:MI') end) order by h.date_debut, h.id)
      from horaires h where h.date_debut <= v_lundi + 6 and h.date_fin >= v_lundi), '[]'::jsonb)
  );
end $$;

revoke all on function consultation_responsable(text, date) from public;
grant execute on function consultation_responsable(text, date) to anon, authenticated;

-- ---- 3. Fichiers que plus rien ne cite ------------------------------
-- Comme sql/0041 : security invoker ; tâches ET notes, en base et dans les
-- sauvegardes (restaurer l'une d'elles redonne ses fichiers).
create or replace function pieces_orphelines() returns setof text
language sql stable security invoker set search_path = public as $$
  with citees as (
    select p ->> 'chemin' as nom, p ->> 'vignette' as vignette
    from taches t, jsonb_array_elements(t.pieces) p
    union all
    select p ->> 'chemin', p ->> 'vignette'
    from notes n, jsonb_array_elements(n.pieces) p
    union all
    select p ->> 'chemin', p ->> 'vignette'
    from sauvegardes s,
      unnest(array['taches', 'notes']) as tb(nom),
      jsonb_array_elements(case when jsonb_typeof(s.contenu -> 'tables' -> tb.nom) = 'array' then s.contenu -> 'tables' -> tb.nom else '[]'::jsonb end) l,
      jsonb_array_elements(case when jsonb_typeof(l -> 'pieces') = 'array' then l -> 'pieces' else '[]'::jsonb end) p
  )
  select o.name from storage.objects o
  where o.bucket_id = 'pieces' and o.created_at < now() - interval '7 days'
    and not exists (select 1 from citees c where c.nom = o.name or c.vignette = o.name)
  order by o.name
  limit 200;
$$;

revoke all on function pieces_orphelines() from public, anon;
grant execute on function pieces_orphelines() to authenticated;

notify pgrst, 'reload schema';
