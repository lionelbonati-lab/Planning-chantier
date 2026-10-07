-- ============================================================
-- Planning Chantiers — liens de consultation « responsable »
-- Migration 0038 — 07.10.2026 (suite 143)
--
-- Lionel : « J'aimerai pouvoir envoyer le planning à mon responsable, en
-- lecture seul. » Ses choix : « Lien sans connexion » (comme le lien des
-- ouvriers, sql/0018) ; contenu : personnel et équipes plus « Jalons,
-- Notes, Machines et transports, Intervenants » ; « Vue simplifiée »
-- (responsable.html, semaine par semaine) ; « Surtout l'ordinateur » ;
-- gérés « Dans le menu Réglages » ; « Un lien par personne » (un nom,
-- sa date de dernière consultation, supprimable seul) ; congés « Le texte
-- complet » ; période « Moins loin » = semaine en cours et les 4 suivantes.
--
--   1. liens_responsables : un lien = un nom (« Responsable », « Patron »…)
--      + un jeton aléatoire (32 caractères hexadécimaux, tiré par le
--      navigateur, js/page-liens-responsables.js). Lecture/écriture pour
--      les connectés seulement ; le visiteur n'y touche jamais directement.
--      Pas dans les sauvegardes (comme liens_consultation).
--   2. consultation_responsable(jeton, lundi) : seule porte pour le
--      visiteur anonyme. Jeton inconnu (lien supprimé ou renouvelé) : null.
--      Semaine bornée entre le lundi en cours et 4 semaines plus loin.
--      Renvoie les lignes affichées dans l'appli (actives, non masquées,
--      sql/0035) avec leur section, les équipes de la semaine (membres de
--      la composition en vigueur ce lundi-là, sql/0015), les tâches,
--      jalons et notes de la semaine, fériés, horaires et l'ordre des
--      sections (réglage ordre_groupes). vu_le mis à jour au plus une fois
--      par heure.
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `liens_responsables`) ; ce fichier garde la trace. Rejouable.
-- ============================================================

create table if not exists liens_responsables (
  id bigint generated always as identity primary key,
  nom text not null check (length(btrim(nom)) > 0),
  jeton text not null unique check (length(jeton) >= 32),
  cree_le timestamptz not null default now(),
  vu_le timestamptz
);

alter table liens_responsables enable row level security;
drop policy if exists "connecte_tout" on liens_responsables;
create policy "connecte_tout" on liens_responsables for all to authenticated using (true) with check (true);
revoke all on liens_responsables from anon;
grant select, insert, update, delete on liens_responsables to authenticated;

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
    'personnes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nom', p.nom, 'equipe', coalesce(p.equipe, false), 'couleur', p.couleur,
        'section', case when p.sous_traitant then 'intervenants'
          when g.id is not null and not coalesce(p.equipe, false) then case when g.ligne_unique then 'transports' else 'groupe-' || g.id end
          else 'personnel' end,
        'membres', case when p.equipe then coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'nom', m.nom) order by m.ordre, m.id)
          from (select c.membres from equipes_compositions c where c.equipe_id = p.id and c.lundi <= v_lundi
            order by c.lundi desc limit 1) c
          join personnes m on m.id = any (c.membres) and m.actif and not coalesce(m.equipe, false) and not m.sous_traitant), '[]'::jsonb) end
      ) order by p.ordre, p.id)
      from personnes p left join groupes g on g.id = p.groupe_id and g.actif
      where p.actif and not coalesce(p.masque, false)), '[]'::jsonb),
    'groupes', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'nom', g.nom) order by g.ordre, g.id)
      from groupes g where g.actif and not g.ligne_unique), '[]'::jsonb),
    'ordre_groupes', coalesce((select r.valeur from reglages r where r.cle = 'ordre_groupes' and jsonb_typeof(r.valeur) = 'array'), '[]'::jsonb),
    'taches', coalesce((select jsonb_agg(jsonb_build_object(
        'personne', t.personne_id, 'date', t.date, 'demi', t.demi, 'ordre', t.ordre, 'texte', t.texte,
        'important', t.important, 'absence', t.est_absence,
        'chantier', ch.nom, 'couleur', ch.couleur, 'statut', st.nom, 'couleur_statut', st.couleur
      ) order by t.date, t.demi desc, t.ordre, t.id)
      from taches t
      left join chantiers ch on ch.id = t.chantier_id
      left join statuts st on st.id = t.statut_id
      where t.date between v_lundi and v_lundi + 6), '[]'::jsonb),
    'jalons', coalesce((select jsonb_agg(jsonb_build_object('date', j.date, 'demi', j.demi, 'texte', j.texte,
        'important', j.important, 'chantier', ch.nom, 'couleur', ch.couleur) order by j.date, j.demi desc nulls first, j.id)
      from jalons j left join chantiers ch on ch.id = j.chantier_id
      where j.date between v_lundi and v_lundi + 6), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('date', n.date, 'demi', n.demi, 'texte', n.texte,
        'important', n.important, 'chantier', ch.nom, 'couleur', ch.couleur) order by n.date, n.demi desc nulls first, n.id)
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
