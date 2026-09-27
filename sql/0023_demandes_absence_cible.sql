-- ============================================================
-- Planning Chantiers — demandes d'absence : une seule absence d'une
-- série, absences posées par le bureau
-- Migration 0023 — 27.09.2026 (suite 87)
--
-- Lionel :
--   « Un ouvrier doit pouvoir modifier une serie ou juste un des éléments. »
--   « Les congés placés par le bureau doivent aussi apparaître dans la
--     liste des congés de l'ouvrier. »
--
-- Une modification ou une annulation peut désormais viser une PARTIE
-- précise du planning plutôt qu'une demande entière — colonnes cible_* :
--   - cible_debut / cible_fin / cible_demi_debut / cible_demi_fin : les
--     demi-journées visées ;
--   - cible_texte : le texte des absences visées (absences posées par le
--     bureau, dont le texte est libre).
-- Deux cas :
--   1. une seule absence d'une série acceptée (remplace_id = la série,
--      cible = cette occurrence) : Accepter ne retire que cette absence et,
--      pour une modification, pose la nouvelle dans la même série ; la
--      série reste « acceptee » (ni remplacée ni annulée) ;
--   2. une absence posée directement par le bureau (remplace_id null,
--      cible = le bloc d'absences) : consultation_changer_absence_bureau.
--
-- consultation_planning renvoie en plus :
--   - les cible_* de chaque demande, et les annulations acceptées d'UNE
--     absence (la page les retire de la liste mais les montre sur la
--     série : « sauf le … ») ;
--   - « absences » : les absences à venir de la personne (un an), que la
--     page regroupe en blocs ; celles que ne couvre aucune demande
--     acceptée sont « posées par le bureau ».
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `demandes_absence_cible`) ; ce fichier garde la trace.
-- Rejouable.
-- ============================================================

alter table demandes_absence add column if not exists cible_debut date;
alter table demandes_absence add column if not exists cible_fin date;
alter table demandes_absence add column if not exists cible_demi_debut text;
alter table demandes_absence add column if not exists cible_demi_fin text;
alter table demandes_absence add column if not exists cible_texte text;

-- p_date est-elle le début d'une absence de la série d ?
create or replace function demande_absence_est_occurrence_(d demandes_absence, p_date date)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  v date;
  v_pas interval;
begin
  if d.serie_frequence is null then return p_date = d.date_debut; end if;
  for k in 0..60 loop
    if d.serie_frequence = 'mois' then v_pas := make_interval(months => k * d.serie_intervalle);
    else v_pas := make_interval(weeks => k * d.serie_intervalle); end if;
    v := (d.date_debut + v_pas)::date;
    if v > d.serie_fin then return false; end if;
    if v = p_date then return true; end if;
  end loop;
  return false;
end $$;
revoke all on function demande_absence_est_occurrence_(demandes_absence, date) from public;

-- Modifier : + p_cible_debut (une seule absence d'une série acceptée).
drop function if exists consultation_modifier_demande(text, bigint, date, date, text, text, text, text, text, integer, date);
create or replace function consultation_modifier_demande(p_jeton text, p_id bigint, p_debut date, p_fin date,
  p_demi_debut text default 'matin', p_demi_fin text default 'aprem', p_motif text default null, p_remarque text default null,
  p_serie_frequence text default null, p_serie_intervalle integer default null, p_serie_fin date default null,
  p_cible_debut date default null)
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
  if p_cible_debut is not null and v_freq is not null then
    return jsonb_build_object('ok', false, 'erreur', 'Une seule absence ne se répète pas.');
  end if;
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
  if p_cible_debut is not null then
    if d.serie_frequence is null or not demande_absence_est_occurrence_(d, p_cible_debut) then
      return jsonb_build_object('ok', false, 'erreur', 'Absence introuvable dans la série : recharge la page.');
    end if;
    if p_cible_debut + (d.date_fin - d.date_debut) < aujourdhui then
      return jsonb_build_object('ok', false, 'erreur', 'Absence passée : plus modifiable.');
    end if;
    if exists (select 1 from demandes_absence where remplace_id = d.id and statut = 'en_attente'
               and (cible_debut is null or cible_debut = p_cible_debut)) then
      return jsonb_build_object('ok', false, 'erreur', 'Une demande est déjà en attente pour cette absence.');
    end if;
  else
    if demande_absence_fin_(d.date_debut, d.date_fin, d.serie_fin) < aujourdhui then
      return jsonb_build_object('ok', false, 'erreur', 'Absence passée : plus modifiable.');
    end if;
    if exists (select 1 from demandes_absence where remplace_id = d.id and statut = 'en_attente') then
      return jsonb_build_object('ok', false, 'erreur', 'Une demande est déjà en attente pour cette absence.');
    end if;
  end if;
  if (select count(*) from demandes_absence where personne_id = d.personne_id and statut = 'en_attente') >= 10 then
    return jsonb_build_object('ok', false, 'erreur', 'Trop de demandes en attente : attends la réponse du bureau.');
  end if;
  insert into demandes_absence (personne_id, date_debut, date_fin, demi_debut, demi_fin, motif, remarque, type, remplace_id,
      serie_frequence, serie_intervalle, serie_fin, cible_debut, cible_fin, cible_demi_debut, cible_demi_fin)
    values (d.personne_id, p_debut, p_fin, p_demi_debut, p_demi_fin, v_motif, v_remarque, 'modification', d.id,
      v_freq, v_intervalle, v_serie_fin, p_cible_debut,
      case when p_cible_debut is null then null else p_cible_debut + (d.date_fin - d.date_debut) end,
      case when p_cible_debut is null then null else d.demi_debut end,
      case when p_cible_debut is null then null else d.demi_fin end)
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Annuler : + p_cible_debut (une seule absence d'une série acceptée).
drop function if exists consultation_annuler_absence(text, bigint);
create or replace function consultation_annuler_absence(p_jeton text, p_id bigint, p_cible_debut date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  lien liens_consultation;
  d demandes_absence;
  aujourdhui date := (now() at time zone 'Europe/Zurich')::date;
  v_fin date;
  v_id bigint;
begin
  select * into lien from liens_consultation where jeton = p_jeton;
  if not found then return jsonb_build_object('ok', false, 'erreur', 'Ce lien ne marche plus.'); end if;
  select * into d from demandes_absence where id = p_id and personne_id = lien.personne_id;
  if not found or d.statut <> 'acceptee' or d.type = 'annulation' then
    return jsonb_build_object('ok', false, 'erreur', 'Cette absence ne peut pas être annulée : recharge la page.');
  end if;
  if p_cible_debut is not null then
    if d.serie_frequence is null or not demande_absence_est_occurrence_(d, p_cible_debut) then
      return jsonb_build_object('ok', false, 'erreur', 'Absence introuvable dans la série : recharge la page.');
    end if;
    v_fin := p_cible_debut + (d.date_fin - d.date_debut);
    if v_fin < aujourdhui then
      return jsonb_build_object('ok', false, 'erreur', 'Absence passée : plus annulable.');
    end if;
    if exists (select 1 from demandes_absence where remplace_id = d.id and statut = 'en_attente'
               and (cible_debut is null or cible_debut = p_cible_debut)) then
      return jsonb_build_object('ok', false, 'erreur', 'Une demande est déjà en attente pour cette absence.');
    end if;
    insert into demandes_absence (personne_id, date_debut, date_fin, demi_debut, demi_fin, motif, remarque, type, remplace_id,
        cible_debut, cible_fin, cible_demi_debut, cible_demi_fin)
      values (d.personne_id, p_cible_debut, v_fin, d.demi_debut, d.demi_fin, d.motif, d.remarque, 'annulation', d.id,
        p_cible_debut, v_fin, d.demi_debut, d.demi_fin)
      returning id into v_id;
    return jsonb_build_object('ok', true, 'id', v_id);
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

-- Absence posée par le bureau (bloc de la page, cible_*) : demande de
-- modification (nouvelles dates / type / motif, répétition possible) ou
-- d'annulation. Le texte visé est relu ici (jamais celui de la page).
create or replace function consultation_changer_absence_bureau(p_jeton text, p_action text,
  p_cible_debut date, p_cible_fin date, p_cible_demi_debut text default 'matin', p_cible_demi_fin text default 'aprem',
  p_debut date default null, p_fin date default null, p_demi_debut text default 'matin', p_demi_fin text default 'aprem',
  p_motif text default null, p_remarque text default null,
  p_serie_frequence text default null, p_serie_intervalle integer default null, p_serie_fin date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  lien liens_consultation;
  p personnes;
  aujourdhui date := (now() at time zone 'Europe/Zurich')::date;
  v_texte text;
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
  if p_action not in ('modification', 'annulation') or p_cible_debut is null or p_cible_fin is null or p_cible_fin < p_cible_debut
     or p_cible_fin - p_cible_debut > 62 or coalesce(p_cible_demi_debut, '') not in ('matin', 'aprem') or coalesce(p_cible_demi_fin, '') not in ('matin', 'aprem') then
    return jsonb_build_object('ok', false, 'erreur', 'Absence introuvable : recharge la page.');
  end if;
  if p_cible_fin < aujourdhui then
    return jsonb_build_object('ok', false, 'erreur', 'Absence passée : plus modifiable.');
  end if;
  select t.texte into v_texte from taches t where t.personne_id = p.id and t.est_absence
    and t.date between p_cible_debut and p_cible_fin order by t.date, t.demi limit 1;
  if v_texte is null then
    return jsonb_build_object('ok', false, 'erreur', 'Absence introuvable : recharge la page.');
  end if;
  if exists (select 1 from demandes_absence where personne_id = p.id and statut = 'en_attente' and remplace_id is null
             and cible_debut is not null and cible_debut <= p_cible_fin and cible_fin >= p_cible_debut) then
    return jsonb_build_object('ok', false, 'erreur', 'Une demande est déjà en attente pour cette absence.');
  end if;
  if (select count(*) from demandes_absence where personne_id = p.id and statut = 'en_attente') >= 10 then
    return jsonb_build_object('ok', false, 'erreur', 'Trop de demandes en attente : attends la réponse du bureau.');
  end if;
  if p_action = 'annulation' then
    insert into demandes_absence (personne_id, date_debut, date_fin, demi_debut, demi_fin, motif, remarque, type,
        cible_debut, cible_fin, cible_demi_debut, cible_demi_fin, cible_texte)
      values (p.id, p_cible_debut, p_cible_fin, p_cible_demi_debut, p_cible_demi_fin, v_texte, null, 'annulation',
        p_cible_debut, p_cible_fin, p_cible_demi_debut, p_cible_demi_fin, v_texte)
      returning id into v_id;
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;
  v_erreur := coalesce(demande_absence_erreur_(p_debut, p_fin, p_demi_debut, p_demi_fin, v_motif, v_remarque),
    demande_absence_serie_erreur_(p_debut, p_fin, v_freq, p_serie_intervalle, p_serie_fin));
  if v_erreur is not null then return jsonb_build_object('ok', false, 'erreur', v_erreur); end if;
  insert into demandes_absence (personne_id, date_debut, date_fin, demi_debut, demi_fin, motif, remarque, type,
      serie_frequence, serie_intervalle, serie_fin, cible_debut, cible_fin, cible_demi_debut, cible_demi_fin, cible_texte)
    values (p.id, p_debut, p_fin, p_demi_debut, p_demi_fin, v_motif, v_remarque, 'modification',
      v_freq, case when v_freq is null then null else p_serie_intervalle end, case when v_freq is null then null else p_serie_fin end,
      p_cible_debut, p_cible_fin, p_cible_demi_debut, p_cible_demi_fin, v_texte)
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

revoke all on function consultation_modifier_demande(text, bigint, date, date, text, text, text, text, text, integer, date, date) from public;
grant execute on function consultation_modifier_demande(text, bigint, date, date, text, text, text, text, text, integer, date, date) to anon, authenticated;
revoke all on function consultation_annuler_absence(text, bigint, date) from public;
grant execute on function consultation_annuler_absence(text, bigint, date) to anon, authenticated;
revoke all on function consultation_changer_absence_bureau(text, text, date, date, text, text, date, date, text, text, text, text, text, integer, date) from public;
grant execute on function consultation_changer_absence_bureau(text, text, date, date, text, text, date, date, text, text, text, text, text, integer, date) to anon, authenticated;

-- consultation_planning (0018, 0020, 0021, 0022) : cible_*, annulations
-- d'une seule absence, absences à venir.
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
