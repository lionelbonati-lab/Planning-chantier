-- ============================================================
-- Planning Chantiers — demandes d'absence depuis le lien de consultation
-- Migration 0020 — 27.09.2026 (suite 69)
--
-- Lionel : « Le lien de consultation des ouvriers doit pouvoir ajouter une
-- absence que je doit valider dans mon planning. »
--
-- La page consultation.html (sans connexion, clé anon) n'écrit JAMAIS dans
-- `taches` : elle dépose une DEMANDE (table demandes_absence, fermée à
-- anon comme liens_consultation) par la fonction
-- consultation_demander_absence(jeton, …), SECURITY DEFINER, qui ne vise
-- que la personne du lien. Lionel la voit dans son planning (bandeau +
-- cases hachurées, js/demandes-absence.js) et l'accepte — les absences
-- sont alors posées par l'appli, comme s'il les avait saisies — ou la
-- refuse. L'ouvrier voit l'état de ses demandes sur sa page et peut
-- retirer une demande encore en attente (consultation_annuler_demande).
--
-- Garde-fous (lien public, donc à l'abri des abus) : personnel seulement
-- (ni intervenant ni équipe : pas d'absence sur ces lignes, même règle que
-- boutonsMenuAjout) ; d'aujourd'hui à un an ; 62 jours au plus par
-- demande ; 10 demandes en attente au plus par personne ; motif ≤ 60
-- caractères, remarque ≤ 300.
--
-- consultation_planning (sql/0018) renvoie en plus : peut_demander, les
-- motifs proposés (entrées rapides de type « absence », sinon Congé /
-- Vacances / Maladie) et les demandes de la personne (en attente, ou
-- traitées il y a moins de 30 jours).
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `demandes_absence`) ; ce fichier garde la trace. Rejouable.
-- ============================================================

create table if not exists demandes_absence (
  id bigint generated always as identity primary key,
  personne_id bigint not null references personnes(id) on delete cascade,
  date_debut date not null,
  date_fin date not null,
  demi_debut text not null default 'matin' check (demi_debut in ('matin', 'aprem')),
  demi_fin text not null default 'aprem' check (demi_fin in ('matin', 'aprem')),
  motif text not null default 'Absence',
  remarque text,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'acceptee', 'refusee')),
  cree_le timestamptz not null default now(),
  traitee_le timestamptz,
  check (date_fin >= date_debut)
);
create index if not exists demandes_absence_personne_idx on demandes_absence (personne_id);
create index if not exists demandes_absence_statut_idx on demandes_absence (statut);

alter table demandes_absence enable row level security;
drop policy if exists "connecte_tout" on demandes_absence;
create policy "connecte_tout" on demandes_absence for all to authenticated using (true) with check (true);
grant select, insert, update, delete on demandes_absence to authenticated;

-- Dépose une demande pour la personne du lien. Renvoie {ok:true, id} ou
-- {ok:false, erreur:"…"} (message affiché tel quel sur la page).
create or replace function consultation_demander_absence(p_jeton text, p_debut date, p_fin date,
  p_demi_debut text default 'matin', p_demi_fin text default 'aprem', p_motif text default null, p_remarque text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  lien liens_consultation;
  p personnes;
  aujourdhui date := (now() at time zone 'Europe/Zurich')::date;
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
  v_remarque text := nullif(btrim(coalesce(p_remarque, '')), '');
  v_id bigint;
begin
  select * into lien from liens_consultation where jeton = p_jeton;
  if not found then return jsonb_build_object('ok', false, 'erreur', 'Ce lien ne marche plus.'); end if;
  select * into p from personnes where id = lien.personne_id;
  if p.sous_traitant or coalesce(p.equipe, false) then
    return jsonb_build_object('ok', false, 'erreur', 'Pas de demande d’absence depuis ce lien.');
  end if;
  if p_debut is null or p_fin is null or p_fin < p_debut then
    return jsonb_build_object('ok', false, 'erreur', 'Dates invalides : la fin est avant le début.');
  end if;
  if p_demi_debut not in ('matin', 'aprem') or p_demi_fin not in ('matin', 'aprem')
     or (p_debut = p_fin and p_demi_debut = 'aprem' and p_demi_fin = 'matin') then
    return jsonb_build_object('ok', false, 'erreur', 'Demi-journées invalides.');
  end if;
  if p_debut < aujourdhui or p_fin > aujourdhui + 365 then
    return jsonb_build_object('ok', false, 'erreur', 'Dates possibles : d’aujourd’hui à dans un an.');
  end if;
  if p_fin - p_debut > 62 then
    return jsonb_build_object('ok', false, 'erreur', 'Deux mois au plus par demande.');
  end if;
  if length(coalesce(v_motif, '')) > 60 or length(coalesce(v_remarque, '')) > 300 then
    return jsonb_build_object('ok', false, 'erreur', 'Texte trop long.');
  end if;
  if (select count(*) from demandes_absence where personne_id = p.id and statut = 'en_attente') >= 10 then
    return jsonb_build_object('ok', false, 'erreur', 'Trop de demandes en attente : attends la réponse du bureau.');
  end if;
  insert into demandes_absence (personne_id, date_debut, date_fin, demi_debut, demi_fin, motif, remarque)
    values (p.id, p_debut, p_fin, p_demi_debut, p_demi_fin, coalesce(v_motif, 'Absence'), v_remarque)
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Retire une demande encore en attente de la personne du lien.
create or replace function consultation_annuler_demande(p_jeton text, p_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  lien liens_consultation;
begin
  select * into lien from liens_consultation where jeton = p_jeton;
  if not found then return false; end if;
  delete from demandes_absence where id = p_id and personne_id = lien.personne_id and statut = 'en_attente';
  return found;
end $$;

revoke all on function consultation_demander_absence(text, date, date, text, text, text, text) from public;
grant execute on function consultation_demander_absence(text, date, date, text, text, text, text) to anon, authenticated;
revoke all on function consultation_annuler_demande(text, bigint) from public;
grant execute on function consultation_annuler_demande(text, bigint) to anon, authenticated;

-- consultation_planning (sql/0018) + peut_demander, motifs, demandes.
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
      from horaires h where h.date_debut <= v_lundi + 6 and h.date_fin >= v_lundi), '[]'::jsonb),
    'peut_demander', not p.sous_traitant and not coalesce(p.equipe, false),
    'motifs', coalesce((select jsonb_agg(f.nom order by f.ordre, f.nom) from formulaires_rapides f where f.type_entree = 'absence'),
      '["Congé", "Vacances", "Maladie"]'::jsonb),
    'demandes', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'debut', d.date_debut, 'fin', d.date_fin,
        'demi_debut', d.demi_debut, 'demi_fin', d.demi_fin, 'motif', d.motif, 'remarque', d.remarque, 'statut', d.statut)
        order by d.date_debut, d.id)
      from demandes_absence d where d.personne_id = p.id
        and (d.statut = 'en_attente' or d.traitee_le > now() - interval '30 days')), '[]'::jsonb)
  );
end $$;

revoke all on function consultation_planning(text, date) from public;
grant execute on function consultation_planning(text, date) to anon, authenticated;
