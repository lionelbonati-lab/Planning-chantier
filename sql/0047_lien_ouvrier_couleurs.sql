-- ============================================================
-- Planning Chantiers — plusieurs plannings, étape 4 : lien des ouvriers
-- Migration 0047 — 09.11.2026 (suite 156)
--
-- Choix de Lionel (suite 153) : lien des ouvriers « Les deux plannings
-- réunis » (fait par la 0044) ; « Pour les chantiers chacun choisi sa
-- couleur » (0045). Et : « Fait toutes les étapes sans me redemander ».
--
-- Depuis la 0045, la couleur choisie par un planning est rangée dans
-- couleurs_chantiers ; le lien des ouvriers montrait encore celle de
-- départ (chantiers.couleur). Il montre désormais, pour chaque tâche, la
-- couleur choisie par le planning de cette tâche (sinon celle de départ).
-- Rien d'autre ne change (même fonction que la 0044).
--
-- Lionel l'applique dans l'éditeur SQL de Supabase. Rejouable.
-- ============================================================

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
        'chantier', ch.nom, 'couleur', coalesce(cc.couleur, ch.couleur), 'lat', ch.latitude, 'lng', ch.longitude, 'statut', st.nom, 'couleur_statut', st.couleur,
        'equipe', case when t.personne_id <> p.id then e.nom end,
        -- 0041 : détails et fichiers joints.
        'details', t.details, 'pieces', t.pieces
      ) order by t.date, t.demi desc, t.personne_id <> p.id, t.ordre)
      from taches t
      join personnes e on e.id = t.personne_id
      left join chantiers ch on ch.id = t.chantier_id
      -- 0047 : couleur du chantier choisie par le planning de la tâche.
      left join couleurs_chantiers cc on cc.chantier_id = ch.id and cc.planning_id = t.planning_id
      left join statuts st on st.id = t.statut_id
      where t.date between v_lundi and v_lundi + 6
        -- 0032 : tâche d'une équipe dont la personne est membre CETTE
        -- demi-journée (composition de la semaine + exceptions).
        and (t.personne_id = p.id or (e.equipe and equipe_membre_(t.personne_id, p.id, t.date, t.demi)))
        -- 0031 : tâche d'équipe cachée sous une absence complète de la personne.
        and (t.personne_id = p.id or not exists (select 1 from taches a where a.personne_id = p.id and a.est_absence
          and a.date = t.date and a.demi = t.demi and not absence_partielle_(a.texte, a.demi)))), '[]'::jsonb),
    -- 0044 : fériés et horaires de son entreprise.
    'feries', coalesce((select jsonb_agg(jsonb_build_object('date', f.date, 'libelle', f.libelle) order by f.date)
      from feries f where f.entreprise_id = p.entreprise_id and f.date between v_lundi and v_lundi + 6), '[]'::jsonb),
    'horaires', coalesce((select jsonb_agg(jsonb_build_object('debut', h.date_debut, 'fin', h.date_fin,
        'matin', to_char(h.matin_debut, 'HH24:MI') || '–' || to_char(h.matin_fin, 'HH24:MI'),
        'aprem', case when h.aprem_debut is not null and h.aprem_fin is not null then to_char(h.aprem_debut, 'HH24:MI') || '–' || to_char(h.aprem_fin, 'HH24:MI') end) order by h.date_debut, h.id)
      from horaires h where h.entreprise_id = p.entreprise_id and h.date_debut <= v_lundi + 6 and h.date_fin >= v_lundi), '[]'::jsonb),
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

notify pgrst, 'reload schema';
