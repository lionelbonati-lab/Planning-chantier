-- ============================================================
-- Planning Chantiers — demandes d'absence : modifier, annuler, masquer
-- Migration 0021 — 27.09.2026 (suite 83)
--
-- Lionel, page de consultation des ouvriers :
--   « Possibilité de modifier en plus de retirer avant consultation »
--   « Possibilité de modifier (nouvelle demande d'approbation) ou annuler
--     (Notification dans console bureau) une absence validé. »
--   « Possibilité de faire une nouvelle demande ou supprimer des
--     notifications une absence supprimée. »
--
-- Toujours la même règle que 0020 : la page (clé anon) n'écrit JAMAIS dans
-- `taches`. Elle dépose des demandes ; le bureau les traite dans ses
-- notifications (js/demandes-absence.js), qui posent ou retirent les
-- absences comme s'il les avait saisies.
--
--   - type : « nouvelle » (0020), « modification » (nouvelles dates /
--     type / motif d'une absence acceptée) ou « annulation » (retirer une
--     absence acceptée) ; remplace_id = l'absence acceptée visée.
--     Accepter une modification retire les absences de l'ancienne demande
--     (à partir d'aujourd'hui) et pose les nouvelles : l'ancienne passe
--     « remplacee ». Accepter une annulation retire les absences : l'ancienne
--     passe « annulee ». Refuser : l'absence acceptée reste telle quelle.
--   - consultation_modifier_demande : demande EN ATTENTE → corrigée sur
--     place (le bureau ne l'a pas encore traitée) ; absence ACCEPTÉE →
--     nouvelle demande « modification » à approuver.
--   - consultation_annuler_absence : absence acceptée → demande
--     « annulation » (notification au bureau).
--   - consultation_masquer_demande : l'ouvrier retire de sa liste une
--     demande traitée (refusée, annulée, absence supprimée par le bureau) ;
--     rien n'est effacé côté bureau (masquee = true).
--   - consultation_planning renvoie en plus type, remplace_id, traitee_le
--     et « supprimee » (absence acceptée dont le bureau a retiré toutes
--     les absences du planning), garde les absences acceptées à venir
--     (même traitées il y a plus de 30 jours, pour pouvoir les modifier ou
--     les annuler) et laisse de côté les demandes masquées, remplacées et
--     les annulations acceptées (l'absence d'origine s'affiche « Annulée »).
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `demandes_absence_modifier`) ; ce fichier garde la trace.
-- Rejouable.
-- ============================================================

alter table demandes_absence add column if not exists type text not null default 'nouvelle';
alter table demandes_absence add column if not exists remplace_id bigint references demandes_absence(id) on delete set null;
alter table demandes_absence add column if not exists masquee boolean not null default false;
alter table demandes_absence drop constraint if exists demandes_absence_type_check;
alter table demandes_absence add constraint demandes_absence_type_check check (type in ('nouvelle', 'modification', 'annulation'));
alter table demandes_absence drop constraint if exists demandes_absence_statut_check;
alter table demandes_absence add constraint demandes_absence_statut_check
  check (statut in ('en_attente', 'acceptee', 'refusee', 'annulee', 'remplacee'));
create index if not exists demandes_absence_remplace_idx on demandes_absence (remplace_id);

-- Contrôles communs (mêmes messages que consultation_demander_absence) :
-- null si tout va bien, sinon le message affiché tel quel sur la page.
create or replace function demande_absence_erreur_(p_debut date, p_fin date, p_demi_debut text, p_demi_fin text, p_motif text, p_remarque text)
returns text language plpgsql stable set search_path = public as $$
declare
  aujourdhui date := (now() at time zone 'Europe/Zurich')::date;
begin
  if p_debut is null or p_fin is null or p_fin < p_debut then return 'Dates invalides : la fin est avant le début.'; end if;
  if p_demi_debut not in ('matin', 'aprem') or p_demi_fin not in ('matin', 'aprem')
     or (p_debut = p_fin and p_demi_debut = 'aprem' and p_demi_fin = 'matin') then
    return 'Demi-journées invalides.';
  end if;
  if p_debut < aujourdhui or p_fin > aujourdhui + 365 then return 'Dates possibles : d’aujourd’hui à dans un an.'; end if;
  if p_fin - p_debut > 62 then return 'Deux mois au plus par demande.'; end if;
  if length(coalesce(btrim(p_motif), '')) > 60 or length(coalesce(btrim(p_remarque), '')) > 300 then return 'Texte trop long.'; end if;
  return null;
end $$;
revoke all on function demande_absence_erreur_(date, date, text, text, text, text) from public;

-- Modifier : en attente → corrigée sur place ; acceptée → demande
-- « modification » à approuver. Renvoie {ok, id} ou {ok:false, erreur}.
create or replace function consultation_modifier_demande(p_jeton text, p_id bigint, p_debut date, p_fin date,
  p_demi_debut text default 'matin', p_demi_fin text default 'aprem', p_motif text default null, p_remarque text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  lien liens_consultation;
  d demandes_absence;
  aujourdhui date := (now() at time zone 'Europe/Zurich')::date;
  v_motif text := coalesce(nullif(btrim(coalesce(p_motif, '')), ''), 'Absence');
  v_remarque text := nullif(btrim(coalesce(p_remarque, '')), '');
  v_erreur text;
  v_id bigint;
begin
  select * into lien from liens_consultation where jeton = p_jeton;
  if not found then return jsonb_build_object('ok', false, 'erreur', 'Ce lien ne marche plus.'); end if;
  select * into d from demandes_absence where id = p_id and personne_id = lien.personne_id;
  if not found then return jsonb_build_object('ok', false, 'erreur', 'Demande introuvable : recharge la page.'); end if;
  v_erreur := demande_absence_erreur_(p_debut, p_fin, p_demi_debut, p_demi_fin, v_motif, v_remarque);
  if v_erreur is not null then return jsonb_build_object('ok', false, 'erreur', v_erreur); end if;
  if d.statut = 'en_attente' then
    if d.type = 'annulation' then
      return jsonb_build_object('ok', false, 'erreur', 'Une annulation ne se modifie pas : retire-la.');
    end if;
    update demandes_absence set date_debut = p_debut, date_fin = p_fin, demi_debut = p_demi_debut, demi_fin = p_demi_fin,
      motif = v_motif, remarque = v_remarque where id = d.id;
    return jsonb_build_object('ok', true, 'id', d.id);
  end if;
  if d.statut <> 'acceptee' then
    return jsonb_build_object('ok', false, 'erreur', 'Cette demande ne se modifie plus : fais une nouvelle demande.');
  end if;
  if d.date_fin < aujourdhui then
    return jsonb_build_object('ok', false, 'erreur', 'Absence passée : plus modifiable.');
  end if;
  if exists (select 1 from demandes_absence where remplace_id = d.id and statut = 'en_attente') then
    return jsonb_build_object('ok', false, 'erreur', 'Une demande est déjà en attente pour cette absence.');
  end if;
  if (select count(*) from demandes_absence where personne_id = d.personne_id and statut = 'en_attente') >= 10 then
    return jsonb_build_object('ok', false, 'erreur', 'Trop de demandes en attente : attends la réponse du bureau.');
  end if;
  insert into demandes_absence (personne_id, date_debut, date_fin, demi_debut, demi_fin, motif, remarque, type, remplace_id)
    values (d.personne_id, p_debut, p_fin, p_demi_debut, p_demi_fin, v_motif, v_remarque, 'modification', d.id)
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Annuler une absence acceptée : demande « annulation » (mêmes dates),
-- que le bureau voit dans ses notifications.
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
  if d.date_fin < aujourdhui then
    return jsonb_build_object('ok', false, 'erreur', 'Absence passée : plus annulable.');
  end if;
  if exists (select 1 from demandes_absence where remplace_id = d.id and statut = 'en_attente') then
    return jsonb_build_object('ok', false, 'erreur', 'Une demande est déjà en attente pour cette absence.');
  end if;
  insert into demandes_absence (personne_id, date_debut, date_fin, demi_debut, demi_fin, motif, remarque, type, remplace_id)
    values (d.personne_id, d.date_debut, d.date_fin, d.demi_debut, d.demi_fin, d.motif, d.remarque, 'annulation', d.id)
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Retirer une demande traitée de la liste de l'ouvrier.
create or replace function consultation_masquer_demande(p_jeton text, p_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  lien liens_consultation;
begin
  select * into lien from liens_consultation where jeton = p_jeton;
  if not found then return false; end if;
  update demandes_absence set masquee = true where id = p_id and personne_id = lien.personne_id and statut <> 'en_attente';
  return found;
end $$;

revoke all on function consultation_modifier_demande(text, bigint, date, date, text, text, text, text) from public;
grant execute on function consultation_modifier_demande(text, bigint, date, date, text, text, text, text) to anon, authenticated;
revoke all on function consultation_annuler_absence(text, bigint) from public;
grant execute on function consultation_annuler_absence(text, bigint) to anon, authenticated;
revoke all on function consultation_masquer_demande(text, bigint) from public;
grant execute on function consultation_masquer_demande(text, bigint) to anon, authenticated;

-- consultation_planning (0018, 0020) : liste des demandes étendue.
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
        'supprimee', d.statut = 'acceptee' and not exists (select 1 from taches t where t.personne_id = p.id and t.est_absence
          and t.date between d.date_debut and d.date_fin))
        order by d.date_debut, d.id)
      from demandes_absence d where d.personne_id = p.id and not d.masquee and d.statut <> 'remplacee'
        and not (d.type = 'annulation' and d.statut = 'acceptee')
        and (d.statut = 'en_attente' or d.date_fin >= aujourdhui or d.traitee_le > now() - interval '30 days')), '[]'::jsonb)
  );
end $$;

revoke all on function consultation_planning(text, date) from public;
grant execute on function consultation_planning(text, date) to anon, authenticated;
