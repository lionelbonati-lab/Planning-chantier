-- ============================================================
-- Planning Chantiers — écriture d'une case de personne en UNE transaction
-- Migration 0012 — 24.09.2026 (suite 24)
--
-- Lionel (réponse à la revue du 24.09.2026) : corriger l'écriture non
-- atomique d'une case. Jusqu'ici, enregistrerCellulePersonneServeur
-- (js/donnees-sync.js) envoyait 3 requêtes séparées : effacer les tâches de
-- la case, effacer son reste d'`assignations`, insérer les nouvelles
-- tâches. Une coupure réseau (ou une erreur) après l'effacement laissait la
-- case VIDE en base : les tâches disparaissaient sans message.
--
-- Cette fonction fait les 3 dans une seule transaction (une fonction
-- plpgsql appelée par rpc() s'exécute d'un bloc) : soit la case est
-- entièrement remplacée, soit rien ne change.
--
-- security invoker : s'exécute avec les droits de l'utilisateur connecté,
-- donc sous les mêmes policies RLS que les requêtes directes d'avant
-- (0002_rls.sql). Exécution réservée à `authenticated`.
--
-- p_lignes : tableau JSON des tâches de la case, dans l'ordre d'affichage
-- ({texte, statut_id, important, serie_id, est_absence, chantier_id}) ;
-- `ordre` = position dans le tableau. Tableau vide = case vidée.
--
-- Rejouable sans risque (create or replace).
-- ============================================================

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
  insert into taches (personne_id, date, demi, ordre, texte, statut_id, important, serie_id, est_absence, chantier_id)
  select p_personne_id, p_date, p_demi, (e.pos - 1)::integer,
         e.l->>'texte',
         nullif(e.l->>'statut_id', '')::bigint,
         coalesce((e.l->>'important')::boolean, false),
         nullif(e.l->>'serie_id', '')::bigint,
         coalesce((e.l->>'est_absence')::boolean, false),
         nullif(e.l->>'chantier_id', '')::bigint
  from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) with ordinality as e(l, pos);
end;
$$;

revoke execute on function remplacer_case_personne(bigint, date, text, jsonb) from public, anon;
grant execute on function remplacer_case_personne(bigint, date, text, jsonb) to authenticated;
