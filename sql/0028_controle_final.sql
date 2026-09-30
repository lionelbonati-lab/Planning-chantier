-- ============================================================
-- Planning Chantiers — round de contrôle final (conseils Supabase)
-- Migration 0028 — 30.09.2026 (suite 127)
--
-- Lionel : « Fait un round de contrôle à la fin »
--
-- Conseils de sécurité / performance de Supabase repris :
--   1. abonnement_push_session_ et noter_modif_push_ (0027) sont des
--      fonctions de déclencheur : personne n'a à les appeler en direct
--      (/rest/v1/rpc/…). Droit d'exécution retiré ; les déclencheurs
--      continuent de marcher (le droit n'est vérifié qu'à leur création —
--      vérifié : une écriture d'un utilisateur connecté est toujours notée
--      dans push_modifs) ;
--   2. tables_sauvegardees_ et nombre_lignes_sauvegarde_ (sauvegardes) :
--      search_path fixé, comme les autres fonctions ;
--   3. policy « soi_meme » de profils (0019) : auth.uid() lu une fois par
--      requête, plus une fois par ligne.
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migrations `controle_final_droits_fonctions` et
-- `controle_final_policy_profils`) ; ce fichier garde la trace. Rejouable.
-- ============================================================

revoke execute on function public.abonnement_push_session_() from public, anon, authenticated;
revoke execute on function public.noter_modif_push_() from public, anon, authenticated;

alter function public.tables_sauvegardees_() set search_path = public;
alter function public.nombre_lignes_sauvegarde_(jsonb) set search_path = public;

drop policy if exists "soi_meme" on profils;
create policy "soi_meme" on profils for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
