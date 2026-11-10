-- ============================================================
-- Planning Chantiers — droits de la fonction serveur inviter-compte
-- Migration 0049 — 10.11.2026 (suite 160)
--
-- Lionel : « J'ai une erreur à la création de compte » (« Échec : Compte
-- pas créé : permission denied for table membres »).
--
-- La fonction serveur inviter-compte (suite 155) travaille avec la clé de
-- service, qui n'a ici que les droits donnés table par table (comme pour
-- envoyer-push, sql/0027) : rien n'avait été donné sur les tables des
-- plannings (0044). Droits au plus juste, dans l'ordre de la fonction :
--   - plannings : lire (le planning partagé est-il de l'entreprise ?) et
--     effacer (un échec efface le planning qu'elle vient de créer) ;
--   - membres : ajouter le compte ;
--   - entreprises : lire son nom ;
--   - profils : écrire prénom, nom et entreprise du compte.
-- Puis les plannings laissés par les essais qui ont échoué : sans compte
-- et vides (leurs lignes, créées avec eux, partent avec eux).
--
-- Lionel l'applique dans l'éditeur SQL de Supabase. Rejouable.
-- ============================================================

grant select, delete on plannings to service_role;
grant insert on membres to service_role;
grant select on entreprises to service_role;
grant select, insert, update on profils to service_role;

delete from plannings pl
where not exists (select 1 from membres m where m.planning_id = pl.id)
  and not exists (select 1 from personnes p where p.planning_id = pl.id)
  and not exists (select 1 from taches t where t.planning_id = pl.id)
  and not exists (select 1 from jalons j where j.planning_id = pl.id)
  and not exists (select 1 from notes n where n.planning_id = pl.id)
  and not exists (select 1 from series s where s.planning_id = pl.id)
  and not exists (select 1 from assignations a where a.planning_id = pl.id)
  and not exists (select 1 from sauvegardes s where s.planning_id = pl.id)
  and not exists (select 1 from reglages r where r.planning_id = pl.id)
  and not exists (select 1 from couleurs_perso c where c.planning_id = pl.id)
  and not exists (select 1 from liens_responsables l where l.planning_id = pl.id)
  and not exists (select 1 from abonnements_push a where a.planning_id = pl.id);

notify pgrst, 'reload schema';
