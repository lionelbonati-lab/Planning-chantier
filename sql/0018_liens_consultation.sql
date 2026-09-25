-- ============================================================
-- Planning Chantiers — liens de consultation en lecture seule
-- Migration 0018 — 25.09.2026 (suite 51)
--
-- Proposition 10 retenue par Lionel (« 8,9,10,13,14,15 m'intéressent ») :
-- « Lien de consultation : un lien en lecture seule à donner aux ouvriers
-- ou aux sous-traitants pour qu'ils voient leur planning sur leur
-- téléphone, sans pouvoir rien modifier. »
--
-- Un lien = une personne (ou une équipe) + un jeton aléatoire de 32
-- caractères (128 bits, impossible à deviner). Au plus un lien par
-- personne : « Nouveau lien » remplace l'ancien, qui ne marche plus ;
-- « Supprimer » le retire.
--
-- La page consultation.html (sans connexion, clé anon) n'appelle QUE la
-- fonction consultation_planning(jeton, lundi) : SECURITY DEFINER, elle
-- renvoie la semaine de CETTE personne seulement — ses tâches, celles de
-- son équipe cette semaine-là, les fériés, les horaires — et rien d'autre
-- (ni les autres personnes, ni les notes, ni les jalons). La table des
-- liens elle-même reste fermée à anon (RLS : connecté seulement). Semaines
-- consultables : de 4 semaines en arrière à 26 semaines en avant.
-- vu_le : dernière consultation (au plus une écriture par heure),
-- affichée à Lionel.
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `liens_consultation`) ; ce fichier garde la trace. Rejouable.
-- ============================================================

create table if not exists liens_consultation (
  id bigint generated always as identity primary key,
  personne_id bigint not null unique references personnes(id) on delete cascade,
  jeton text not null unique default replace(gen_random_uuid()::text, '-', ''),
  cree_le timestamptz not null default now(),
  vu_le timestamptz
);

alter table liens_consultation enable row level security;
drop policy if exists "connecte_tout" on liens_consultation;
create policy "connecte_tout" on liens_consultation for all to authenticated using (true) with check (true);
grant select, insert, update, delete on liens_consultation to authenticated;

-- Semaine `p_lundi` (ramenée au lundi, bornée) de la personne du lien
-- `p_jeton` ; null si le lien n'existe pas (ou plus).
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
  -- Équipes dont la personne est membre cette semaine-là : dernière
  -- composition de chaque équipe au plus tard ce lundi (même règle que
  -- membresBruts_, js/equipes.js).
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
        'chantier', ch.nom, 'couleur', ch.couleur, 'statut', st.nom, 'couleur_statut', st.couleur,
        'equipe', case when t.personne_id <> p.id then e.nom end
      ) order by t.date, t.demi desc, t.personne_id <> p.id, t.ordre)
      from taches t
      join personnes e on e.id = t.personne_id
      left join chantiers ch on ch.id = t.chantier_id
      left join statuts st on st.id = t.statut_id
      where (t.personne_id = p.id or t.personne_id = any (equipes)) and t.date between v_lundi and v_lundi + 6), '[]'::jsonb),
    'feries', coalesce((select jsonb_agg(jsonb_build_object('date', f.date, 'libelle', f.libelle) order by f.date)
      from feries f where f.date between v_lundi and v_lundi + 6), '[]'::jsonb),
    'horaires', coalesce((select jsonb_agg(jsonb_build_object('debut', h.date_debut, 'fin', h.date_fin,
        'matin', to_char(h.matin_debut, 'HH24:MI') || '–' || to_char(h.matin_fin, 'HH24:MI'),
        'aprem', case when h.aprem_debut is not null and h.aprem_fin is not null then to_char(h.aprem_debut, 'HH24:MI') || '–' || to_char(h.aprem_fin, 'HH24:MI') end) order by h.date_debut, h.id)
      from horaires h where h.date_debut <= v_lundi + 6 and h.date_fin >= v_lundi), '[]'::jsonb)
  );
end $$;

revoke all on function consultation_planning(text, date) from public;
grant execute on function consultation_planning(text, date) to anon, authenticated;
