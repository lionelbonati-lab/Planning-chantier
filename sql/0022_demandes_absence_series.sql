-- ============================================================
-- Planning Chantiers — demandes d'absence en série
-- Migration 0022 — 27.09.2026 (suite 86)
--
-- Lionel : « Pouvoir gérer les séries dans les demande de congé. »
--
-- L'ouvrier peut demander une absence qui se répète (ex. tous les lundis
-- matin, un vendredi sur deux, le 1er de chaque mois) : la demande garde
-- la PREMIÈRE absence (date_debut … date_fin, demi-journées) et la règle
-- de répétition :
--   - serie_frequence : 'semaine' ou 'mois' (null = pas de répétition) ;
--   - serie_intervalle : toutes les N semaines / tous les N mois (1 à 12) ;
--   - serie_fin : dernière date où une absence peut COMMENCER.
-- Occurrence k : la première décalée de k × N semaines (ou mois : même
-- quantième, ramené au dernier jour d'un mois plus court — le calcul de
-- `date + interval 'N month'`), même durée. Le bureau accepte la série
-- d'un coup (js/demandes-absence.js) : les absences sont posées en VRAIE
-- série du planning (ligne `series`, serie_id sur chaque absence), qu'il
-- gère ensuite comme les autres (« cet événement / les suivants / tous ») ;
-- serie_id, gardé ici, sert à retirer la série entière quand l'ouvrier
-- la modifie ou l'annule (à partir d'aujourd'hui, le passé reste).
--
-- Garde-fous en plus de ceux de 0020/0021 (lien public) : au moins deux
-- absences (serie_fin au moins à la 2e), jusqu'à dans un an au plus,
-- chaque absence finit avant la suivante (moins de N semaines, ou de
-- N × 28 jours).
--
-- consultation_demander_absence et consultation_modifier_demande prennent
-- trois paramètres de plus (par défaut : pas de répétition — une page
-- restée ouverte avec l'ancien script marche toujours) ; les anciennes
-- signatures sont retirées (pas de surcharge ambiguë pour PostgREST).
-- consultation_annuler_absence copie la règle dans l'annulation ;
-- consultation_planning la renvoie et compte une série jusqu'à la fin de
-- sa dernière absence (« Modifier » / « Annuler » tant qu'elle n'est pas
-- passée, « Supprimée » si le bureau a tout retiré).
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `demandes_absence_series`) ; ce fichier garde la trace.
-- Rejouable.
-- ============================================================

alter table demandes_absence add column if not exists serie_frequence text;
alter table demandes_absence add column if not exists serie_intervalle integer;
alter table demandes_absence add column if not exists serie_fin date;
alter table demandes_absence add column if not exists serie_id bigint references series(id) on delete set null;
alter table demandes_absence drop constraint if exists demandes_absence_serie_check;
alter table demandes_absence add constraint demandes_absence_serie_check check (
  (serie_frequence is null and serie_intervalle is null and serie_fin is null)
  or (serie_frequence in ('semaine', 'mois') and serie_intervalle between 1 and 12 and serie_fin is not null));
create index if not exists demandes_absence_serie_idx on demandes_absence (serie_id);

-- Fin de la DERNIÈRE absence (borne haute : serie_fin + durée d'une absence).
create or replace function demande_absence_fin_(p_debut date, p_fin date, p_serie_fin date)
returns date language sql immutable set search_path = public as $$
  select case when p_serie_fin is null then p_fin else p_serie_fin + (p_fin - p_debut) end
$$;
grant execute on function demande_absence_fin_(date, date, date) to anon, authenticated;

-- Contrôle de la répétition : null si tout va bien (ou pas de répétition),
-- sinon le message affiché tel quel sur la page.
create or replace function demande_absence_serie_erreur_(p_debut date, p_fin date, p_frequence text, p_intervalle integer, p_serie_fin date)
returns text language plpgsql stable set search_path = public as $$
declare
  aujourdhui date := (now() at time zone 'Europe/Zurich')::date;
  v_pas interval;
  v_jours integer;
begin
  if p_frequence is null then return null; end if;
  if p_frequence not in ('semaine', 'mois') or p_intervalle is null or p_intervalle not between 1 and 12 then
    return 'Répétition invalide.';
  end if;
  v_pas := case when p_frequence = 'semaine' then make_interval(weeks => p_intervalle) else make_interval(months => p_intervalle) end;
  if p_serie_fin is null or p_serie_fin < (p_debut + v_pas)::date then
    return '« Jusqu’au » trop tôt : il faut au moins deux absences.';
  end if;
  if p_serie_fin > aujourdhui + 365 then return 'Répétition possible jusqu’à dans un an.'; end if;
  -- (pas de CASE dans la condition d'un IF plpgsql : son THEN est pris
  -- pour celui du IF)
  v_jours := case when p_frequence = 'semaine' then 7 else 28 end * p_intervalle;
  if p_fin - p_debut >= v_jours then
    return 'Chaque absence doit finir avant la suivante.';
  end if;
  return null;
end $$;
revoke all on function demande_absence_serie_erreur_(date, date, text, integer, date) from public;

drop function if exists consultation_demander_absence(text, date, date, text, text, text, text);
create or replace function consultation_demander_absence(p_jeton text, p_debut date, p_fin date,
  p_demi_debut text default 'matin', p_demi_fin text default 'aprem', p_motif text default null, p_remarque text default null,
  p_serie_frequence text default null, p_serie_intervalle integer default null, p_serie_fin date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  lien liens_consultation;
  p personnes;
  v_motif text := coalesce(nullif(btrim(coalesce(p_motif, '')), ''), 'Absence');
  v_remarque text := nullif(btrim(coalesce(p_remarque, '')), '');
  v_freq text := nullif(btrim(coalesce(p_serie_frequence, '')), '');
  v_erreur text;
  v_id bigint;
begin
  select * into lien from liens_consultation where jeton = p_jeton;
  if not found then return jsonb_build_object('ok', false, 'erreur', 'Ce lien ne marche plus.'); end if;
  select * into p from personnes where id = lien.personne_id;
  if p.sous_traitant or coalesce(p.equipe, false) then
    return jsonb_build_object('ok', false, 'erreur', 'Pas de demande d’absence depuis ce lien.');
  end if;
  v_erreur := coalesce(demande_absence_erreur_(p_debut, p_fin, p_demi_debut, p_demi_fin, v_motif, v_remarque),
    demande_absence_serie_erreur_(p_debut, p_fin, v_freq, p_serie_intervalle, p_serie_fin));
  if v_erreur is not null then return jsonb_build_object('ok', false, 'erreur', v_erreur); end if;
  if (select count(*) from demandes_absence where personne_id = p.id and statut = 'en_attente') >= 10 then
    return jsonb_build_object('ok', false, 'erreur', 'Trop de demandes en attente : attends la réponse du bureau.');
  end if;
  insert into demandes_absence (personne_id, date_debut, date_fin, demi_debut, demi_fin, motif, remarque, serie_frequence, serie_intervalle, serie_fin)
    values (p.id, p_debut, p_fin, p_demi_debut, p_demi_fin, v_motif, v_remarque, v_freq,
      case when v_freq is null then null else p_serie_intervalle end, case when v_freq is null then null else p_serie_fin end)
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

drop function if exists consultation_modifier_demande(text, bigint, date, date, text, text, text, text);
create or replace function consultation_modifier_demande(p_jeton text, p_id bigint, p_debut date, p_fin date,
  p_demi_debut text default 'matin', p_demi_fin text default 'aprem', p_motif text default null, p_remarque text default null,
  p_serie_frequence text default null, p_serie_intervalle integer default null, p_serie_fin date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  lien liens_consultation;
  d demandes_absence;
  aujourdhui date := (now() at time zone 'Europe/Zurich')::date;
  v_motif text := coalesce(nullif(btrim(coalesce(p_motif, '')), ''), 'Absence');
  v_remarque text := nullif(btrim(coalesce(p_remarque, '')), '');
  v_freq text := nullif(btrim(coalesce(p_serie_frequence, '')), '');
  v_intervalle integer := case when v_freq is null then null else p_serie_intervalle end;
  v_serie_fin date := case when v_freq is null then null else p_serie_fin end;
  v_erreur text;
  v_id bigint;
begin
  select * into lien from liens_consultation where jeton = p_jeton;
  if not found then return jsonb_build_object('ok', false, 'erreur', 'Ce lien ne marche plus.'); end if;
  select * into d from demandes_absence where id = p_id and personne_id = lien.personne_id;
  if not found then return jsonb_build_object('ok', false, 'erreur', 'Demande introuvable : recharge la page.'); end if;
  v_erreur := coalesce(demande_absence_erreur_(p_debut, p_fin, p_demi_debut, p_demi_fin, v_motif, v_remarque),
    demande_absence_serie_erreur_(p_debut, p_fin, v_freq, v_intervalle, v_serie_fin));
  if v_erreur is not null then return jsonb_build_object('ok', false, 'erreur', v_erreur); end if;
  if d.statut = 'en_attente' then
    if d.type = 'annulation' then
      return jsonb_build_object('ok', false, 'erreur', 'Une annulation ne se modifie pas : retire-la.');
    end if;
    update demandes_absence set date_debut = p_debut, date_fin = p_fin, demi_debut = p_demi_debut, demi_fin = p_demi_fin,
      motif = v_motif, remarque = v_remarque, serie_frequence = v_freq, serie_intervalle = v_intervalle, serie_fin = v_serie_fin
      where id = d.id;
    return jsonb_build_object('ok', true, 'id', d.id);
  end if;
  if d.statut <> 'acceptee' then
    return jsonb_build_object('ok', false, 'erreur', 'Cette demande ne se modifie plus : fais une nouvelle demande.');
  end if;
  if demande_absence_fin_(d.date_debut, d.date_fin, d.serie_fin) < aujourdhui then
    return jsonb_build_object('ok', false, 'erreur', 'Absence passée : plus modifiable.');
  end if;
  if exists (select 1 from demandes_absence where remplace_id = d.id and statut = 'en_attente') then
    return jsonb_build_object('ok', false, 'erreur', 'Une demande est déjà en attente pour cette absence.');
  end if;
  if (select count(*) from demandes_absence where personne_id = d.personne_id and statut = 'en_attente') >= 10 then
    return jsonb_build_object('ok', false, 'erreur', 'Trop de demandes en attente : attends la réponse du bureau.');
  end if;
  insert into demandes_absence (personne_id, date_debut, date_fin, demi_debut, demi_fin, motif, remarque, type, remplace_id,
      serie_frequence, serie_intervalle, serie_fin)
    values (d.personne_id, p_debut, p_fin, p_demi_debut, p_demi_fin, v_motif, v_remarque, 'modification', d.id,
      v_freq, v_intervalle, v_serie_fin)
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function consultation_annuler_absence(p_jeton text, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  lien liens_consultation;
  d demandes_absence;
  aujourdhui date := (now() at time zone 'Europe/Zurich')::date;
  v_id bigint;
begin
  select * into lien from liens_consultation where jeton = p_jeton;
  if not found then return jsonb_build_object('ok', false, 'erreur', 'Ce lien ne marche plus.'); end if;
  select * into d from demandes_absence where id = p_id and personne_id = lien.personne_id;
  if not found or d.statut <> 'acceptee' or d.type = 'annulation' then
    return jsonb_build_object('ok', false, 'erreur', 'Cette absence ne peut pas être annulée : recharge la page.');
  end if;
  if demande_absence_fin_(d.date_debut, d.date_fin, d.serie_fin) < aujourdhui then
    return jsonb_build_object('ok', false, 'erreur', 'Absence passée : plus annulable.');
  end if;
  if exists (select 1 from demandes_absence where remplace_id = d.id and statut = 'en_attente') then
    return jsonb_build_object('ok', false, 'erreur', 'Une demande est déjà en attente pour cette absence.');
  end if;
  insert into demandes_absence (personne_id, date_debut, date_fin, demi_debut, demi_fin, motif, remarque, type, remplace_id,
      serie_frequence, serie_intervalle, serie_fin)
    values (d.personne_id, d.date_debut, d.date_fin, d.demi_debut, d.demi_fin, d.motif, d.remarque, 'annulation', d.id,
      d.serie_frequence, d.serie_intervalle, d.serie_fin)
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

revoke all on function consultation_demander_absence(text, date, date, text, text, text, text, text, integer, date) from public;
grant execute on function consultation_demander_absence(text, date, date, text, text, text, text, text, integer, date) to anon, authenticated;
revoke all on function consultation_modifier_demande(text, bigint, date, date, text, text, text, text, text, integer, date) from public;
grant execute on function consultation_modifier_demande(text, bigint, date, date, text, text, text, text, text, integer, date) to anon, authenticated;
revoke all on function consultation_annuler_absence(text, bigint) from public;
grant execute on function consultation_annuler_absence(text, bigint) to anon, authenticated;

-- consultation_planning (0018, 0020, 0021) : demandes avec leur répétition.
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
        'demi_debut', d.demi_debut, 'demi_fin', d.demi_fin, 'motif', d.motif, 'remarque', d.remarque, 'statut', d.statut,
        'type', d.type, 'remplace_id', d.remplace_id, 'traitee_le', d.traitee_le,
        'serie_frequence', d.serie_frequence, 'serie_intervalle', d.serie_intervalle, 'serie_fin', d.serie_fin,
        'supprimee', d.statut = 'acceptee' and not exists (select 1 from taches t where t.personne_id = p.id and t.est_absence
          and t.date between d.date_debut and demande_absence_fin_(d.date_debut, d.date_fin, d.serie_fin)))
        order by d.date_debut, d.id)
      from demandes_absence d where d.personne_id = p.id and not d.masquee and d.statut <> 'remplacee'
        and not (d.type = 'annulation' and d.statut = 'acceptee')
        and (d.statut = 'en_attente' or demande_absence_fin_(d.date_debut, d.date_fin, d.serie_fin) >= aujourdhui
          or d.traitee_le > now() - interval '30 days')), '[]'::jsonb)
  );
end $$;

revoke all on function consultation_planning(text, date) from public;
grant execute on function consultation_planning(text, date) to anon, authenticated;

notify pgrst, 'reload schema';
