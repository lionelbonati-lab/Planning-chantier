-- ============================================================
-- Planning Chantiers — vue ouvrier : tâche d'équipe cachée sous une
-- absence ; absences partielles (arrivée, départ, quelques heures)
-- Migration 0031 — 30.09.2026 (suite 130)
--
-- Lionel (page Améliorations et bugs, bug n° 2) : « Dans la vue ouvrier, une personne qui à une absence sur sa case verra son absence et la tâche attibuée à l'équipe. Comment faire pour que cet ouvrier ne vois que son absence. Comment gérer un absence partiel, un départ anticipé ou un début de travail plus tard. Fait moi plusieurs propositions »
-- Ses choix : « Masquer » (l'ouvrier absent ne voit que son absence) et
-- « Arrivée / départ à l'heure », puis : « Ca deviendra le texte de la
-- bulle ».
--
--   1. absence_partielle_(texte, demi) : une absence est PARTIELLE sur une
--      demi-journée quand son texte porte une heure de cette demi-journée
--      (« Arrivée 9h30 », « Départ 16h15 », « Rdv médical 13h00 - 14h00 » :
--      avant 12h00 = matin, sinon après-midi). Le texte de la bulle reste
--      la seule source : rien à ajouter aux tâches, copier / déplacer /
--      séries / annuler / impression la gardent telle quelle ; ôter l'heure
--      du texte la rend complète. Même règle que absencePartielle
--      (js/core.js) ;
--   2. consultation_planning : une tâche d'équipe n'est plus envoyée pour
--      une demi-journée où la personne a une absence COMPLÈTE (partielle :
--      elle travaille une partie de la demi-journée, la tâche reste) ;
--      chaque tâche dit si c'est une absence partielle (« partielle »).
--
-- Les demandes d'arrivée / de départ des ouvriers passent par les
-- fonctions existantes (sql/0022, 0023) : l'heure est dans le type
-- (« Arrivée 9h30 - Congé », 60 caractères au plus), les demi-journées
-- sont celles qu'elle touche (js/consultation.js).
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `absences_partielles`) ; ce fichier garde la trace. Rejouable.
-- ============================================================

create or replace function absence_partielle_(p_texte text, p_demi text) returns boolean
language sql immutable set search_path = public as $$
  select exists (
    select 1 from regexp_matches(coalesce(p_texte, ''), '(^|[^0-9])([01]?[0-9]|2[0-3]) ?[hH] ?([0-5][0-9])?(?![[:alpha:]])', 'g') m
    where (case when m[2]::int < 12 then 'matin' else 'aprem' end) = p_demi);
$$;
revoke all on function absence_partielle_(text, text) from public, anon, authenticated;

create or replace function consultation_planning(p_jeton text, p_lundi date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  lien liens_consultation;
  p personnes;
  v_lundi date;
  aujourdhui date := (now() at time zone 'Europe/Zurich')::date;
  equipes bigint[];
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
  select coalesce(array_agg(c.equipe_id), '{}') into equipes
    from (select distinct on (equipe_id) equipe_id, membres from equipes_compositions where lundi <= v_lundi
          order by equipe_id, lundi desc) c
    join personnes e on e.id = c.equipe_id and e.actif
    where p.id::text = any (c.membres::text[]);
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
        'chantier', ch.nom, 'couleur', ch.couleur, 'statut', st.nom, 'couleur_statut', st.couleur,
        'equipe', case when t.personne_id <> p.id then e.nom end
      ) order by t.date, t.demi desc, t.personne_id <> p.id, t.ordre)
      from taches t
      join personnes e on e.id = t.personne_id
      left join chantiers ch on ch.id = t.chantier_id
      left join statuts st on st.id = t.statut_id
      where (t.personne_id = p.id or t.personne_id = any (equipes)) and t.date between v_lundi and v_lundi + 6
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
    'motifs', coalesce((select jsonb_agg(f.nom order by f.ordre, f.nom) from formulaires_rapides f where f.type_entree = 'absence'),
      '["Congé", "Vacances", "Maladie"]'::jsonb),
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

notify pgrst, 'reload schema';
