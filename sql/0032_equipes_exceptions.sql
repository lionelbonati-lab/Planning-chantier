-- ============================================================
-- Planning Chantiers — équipes modulables : exceptions à la demi-journée
-- Migration 0032 — 30.09.2026 (suite 131)
--
-- Lionel (page Améliorations et bugs, amélioration n° 3) : « J'aimerai que
-- les équipes soient plus modulable, possibilité d'ajouter/retirer une
-- personnes un ou plusieurs jours/demi-jour. Propose moi des solutions. »
-- Son choix : « Exceptions » — la composition par semaine (sql/0015) reste
-- la base ; pour une ou plusieurs demi-journées, on retire un membre de
-- son équipe ou on y ajoute quelqu'un.
--
--   1. equipes_exceptions : (équipe, personne, date, demi, sorte) — sorte
--      « retrait » (membre sorti de l'équipe) ou « ajout » (personne mise
--      dans l'équipe). Une personne ajoutée à une autre équipe n'est plus
--      dans la sienne pour cette demi-journée. Dans les sauvegardes ;
--   2. equipe_membre_(équipe, personne, date, demi) : la règle, même que
--      estMembreEquipeLe (js/equipes.js) ;
--   3. consultation_planning : les tâches d'équipe suivent cette règle à la
--      demi-journée (avant : la composition de la semaine). Le reste
--      (absence complète, sql/0031) inchangé.
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `equipes_exceptions`) ; ce fichier garde la trace. Rejouable.
-- ============================================================

create table if not exists equipes_exceptions (
  id bigint generated always as identity primary key,
  equipe_id bigint not null references personnes (id) on delete cascade,
  personne_id bigint not null references personnes (id) on delete cascade,
  date date not null,
  demi text not null check (demi in ('matin', 'aprem')),
  sorte text not null check (sorte in ('retrait', 'ajout')),
  cree_le timestamptz not null default now(),
  -- Sert aussi d'index pour la clé étrangère equipe_id (cf. 0013).
  constraint equipes_exceptions_unique unique (equipe_id, personne_id, date, demi)
);
create index if not exists equipes_exceptions_personne on equipes_exceptions (personne_id, date);

alter table equipes_exceptions enable row level security;
drop policy if exists "connecte_tout" on equipes_exceptions;
create policy "connecte_tout" on equipes_exceptions for all to authenticated using (true) with check (true);
grant select, insert, update, delete on equipes_exceptions to authenticated;

-- Membre de l'équipe cette demi-journée : ajouté ici, ou dans la
-- composition de la semaine sans être retiré ni ajouté à une autre équipe.
create or replace function equipe_membre_(p_equipe bigint, p_personne bigint, p_date date, p_demi text) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from personnes e where e.id = p_equipe and e.equipe and e.actif) and (
    exists (select 1 from equipes_exceptions x where x.equipe_id = p_equipe and x.personne_id = p_personne
      and x.date = p_date and x.demi = p_demi and x.sorte = 'ajout')
    or (
      exists (select 1 from (select c.membres from equipes_compositions c where c.equipe_id = p_equipe and c.lundi <= p_date
        order by c.lundi desc limit 1) c where p_personne = any (c.membres))
      and not exists (select 1 from equipes_exceptions x where x.personne_id = p_personne and x.date = p_date and x.demi = p_demi
        and ((x.equipe_id = p_equipe and x.sorte = 'retrait') or (x.equipe_id <> p_equipe and x.sorte = 'ajout')))));
$$;
revoke all on function equipe_membre_(bigint, bigint, date, text) from public, anon, authenticated;

-- Sauvegardes (sql/0017) : les exceptions en font partie (après personnes).
create or replace function tables_sauvegardees_() returns text[]
language sql immutable set search_path = public as $$
  select array['statuts', 'chantiers', 'personnes', 'categories_feries', 'feries', 'couleurs_perso', 'horaires', 'reglages',
    'formulaires_rapides', 'formulaires_rapides_champs', 'series', 'assignations', 'taches', 'jalons', 'notes', 'equipes_compositions',
    'equipes_exceptions'];
$$;

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
        'chantier', ch.nom, 'couleur', ch.couleur, 'statut', st.nom, 'couleur_statut', st.couleur,
        'equipe', case when t.personne_id <> p.id then e.nom end
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
