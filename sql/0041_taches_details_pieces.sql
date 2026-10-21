-- ============================================================
-- Planning Chantiers — détails et fichiers joints (photos, PDF…) sur les
-- tâches
-- Migration 0041 — 21.10.2026 (suite 147)
--
-- Lionel : « J'aimerais pouvoir rajouter des détails à mes tâches
-- J'aimerais pouvoir leur joindre des fichiers, photos ou PDF. » Ses
-- choix : les détails « Dans la fiche » (la bulle garde son texte court) ;
-- visibles aussi sur le « Lien des ouvriers » et le « Lien responsable » ;
-- fichiers ajoutés « Seulement toi » (depuis l'appli) ; photos
-- « Originales » (sans réduction).
--
--   1. taches.details (texte long, vide = null) et taches.pieces (tableau
--      JSON des fichiers joints : { chemin, nom, type, taille, vignette }).
--      Comme pour le texte, chaque ligne demi-journée d'une bulle porte les
--      mêmes valeurs. Dans les sauvegardes sans rien changer (to_jsonb de
--      la ligne, sql/0017) ; une ancienne sauvegarde se restaure sans ;
--   2. le dossier de fichiers « pieces » (Supabase Storage), PRIVÉ :
--      seul un utilisateur connecté (Lionel) lit, ajoute et supprime ; un
--      fichier jusqu'à 50 Mo (limite du forfait gratuit). Les liens
--      anonymes n'y ont pas accès directement : la fonction serveur
--      « pieces-lien » vérifie le jeton et que le fichier est joint à une
--      tâche que ce lien affiche, puis donne une adresse valable 1 heure ;
--   3. remplacer_case_personne (version de sql/0012) écrit aussi
--      details et pieces ;
--   4. consultation_planning et consultation_responsable (versions de
--      sql/0040) : chaque tâche donne aussi « details » et « pieces » ;
--   5. pieces_orphelines() : les fichiers que plus aucune tâche ni aucune
--      sauvegarde ne cite, ajoutés il y a plus de 7 jours (Annuler,
--      hors-ligne) ; l'appli les supprime (une fois par jour au plus).
-- Rien d'autre ne change.
--
-- À appliquer par Lionel dans l'éditeur SQL de Supabase (comme 0038 à
-- 0040) ; ce fichier garde la trace. Rejouable.
-- ============================================================

-- ---- 1. Colonnes -------------------------------------------------------
alter table taches add column if not exists details text;
alter table taches add column if not exists pieces jsonb not null default '[]'::jsonb;
alter table taches drop constraint if exists taches_pieces_tableau;
alter table taches add constraint taches_pieces_tableau check (jsonb_typeof(pieces) = 'array');

-- ---- 2. Dossier de fichiers privé ------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('pieces', 'pieces', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "pieces_lire" on storage.objects;
create policy "pieces_lire" on storage.objects for select to authenticated using (bucket_id = 'pieces');
drop policy if exists "pieces_ajouter" on storage.objects;
create policy "pieces_ajouter" on storage.objects for insert to authenticated with check (bucket_id = 'pieces');
drop policy if exists "pieces_supprimer" on storage.objects;
create policy "pieces_supprimer" on storage.objects for delete to authenticated using (bucket_id = 'pieces');

-- ---- 3. Écriture d'une case -------------------------------------------
create or replace function remplacer_case_personne(
  p_personne_id bigint,
  p_date date,
  p_demi text,
  p_lignes jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_demi not in ('matin', 'aprem') then
    raise exception 'Demi-journée invalide : %', p_demi;
  end if;
  delete from taches where personne_id = p_personne_id and date = p_date and demi = p_demi;
  delete from assignations where personne_id = p_personne_id and date = p_date and demi = p_demi;
  insert into taches (personne_id, date, demi, ordre, texte, statut_id, important, serie_id, est_absence, chantier_id, details, pieces)
  select p_personne_id, p_date, p_demi, (e.pos - 1)::integer,
         e.l->>'texte',
         nullif(e.l->>'statut_id', '')::bigint,
         coalesce((e.l->>'important')::boolean, false),
         nullif(e.l->>'serie_id', '')::bigint,
         coalesce((e.l->>'est_absence')::boolean, false),
         nullif(e.l->>'chantier_id', '')::bigint,
         -- 0041 : détails (vide = null) et fichiers joints (tableau, sinon vide).
         nullif(btrim(coalesce(e.l->>'details', '')), ''),
         case when jsonb_typeof(e.l->'pieces') = 'array' then e.l->'pieces' else '[]'::jsonb end
  from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) with ordinality as e(l, pos);
end;
$$;

revoke execute on function remplacer_case_personne(bigint, date, text, jsonb) from public, anon;
grant execute on function remplacer_case_personne(bigint, date, text, jsonb) to authenticated;

-- ---- 4. Liens ouvriers et responsables --------------------------------
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
    'feries', coalesce((select jsonb_agg(jsonb_build_object('date', f.date, 'libelle', f.libelle) order by f.date)
      from feries f where f.date between v_lundi and v_lundi + 6), '[]'::jsonb),
    'horaires', coalesce((select jsonb_agg(jsonb_build_object('debut', h.date_debut, 'fin', h.date_fin,
        'matin', to_char(h.matin_debut, 'HH24:MI') || '–' || to_char(h.matin_fin, 'HH24:MI'),
        'aprem', case when h.aprem_debut is not null and h.aprem_fin is not null then to_char(h.aprem_debut, 'HH24:MI') || '–' || to_char(h.aprem_fin, 'HH24:MI') end) order by h.date_debut, h.id)
      from horaires h where h.date_debut <= v_lundi + 6 and h.date_fin >= v_lundi), '[]'::jsonb),
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

revoke all on function consultation_planning(text, date) from public;
grant execute on function consultation_planning(text, date) to anon, authenticated;

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
        'important', n.important, 'chantier', ch.nom, 'couleur', ch.couleur, 'lat', ch.latitude, 'lng', ch.longitude) order by n.date, n.demi desc nulls first, n.id)
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

-- ---- 5. Fichiers que plus rien ne cite ------------------------------
-- security invoker : lit storage.objects, taches et sauvegardes sous les
-- politiques de l'utilisateur connecté (pieces_lire ci-dessus). Les
-- sauvegardes comptent : restaurer l'une d'elles redonne ses fichiers.
create or replace function pieces_orphelines() returns setof text
language sql stable security invoker set search_path = public as $$
  with citees as (
    select p ->> 'chemin' as nom, p ->> 'vignette' as vignette
    from taches t, jsonb_array_elements(t.pieces) p
    union all
    select p ->> 'chemin', p ->> 'vignette'
    from sauvegardes s,
      jsonb_array_elements(case when jsonb_typeof(s.contenu -> 'tables' -> 'taches') = 'array' then s.contenu -> 'tables' -> 'taches' else '[]'::jsonb end) l,
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
