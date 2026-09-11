-- ============================================================
-- Planning Chantiers — ajoute la demi-journée sur une note
-- Migration 0003 — 04.09.2026
--
-- Complète le schéma initial (0001) : une note peut être posée sur une
-- seule demi-journée (matin/aprem) plutôt que la journée entière —
-- comportement déjà présent côté Google Sheets sur les jours de bord d'une
-- plage de jalons/notes (cf. demiPourJourDePlage_ dans WebApp.gs), oublié
-- au premier passage du schéma (repéré en écrivant la fonction serveur
-- enregistrer-plage, cf. functions/enregistrer-plage/).
--
-- Appliquée directement sur le projet Supabase via le connecteur MCP au
-- moment où le manque a été repéré — ce fichier n'a donc PAS besoin d'être
-- recollé dans l'éditeur SQL par Lionel, il documente juste ce qui a déjà
-- été fait, pour que le dépôt reste le reflet fidèle du schéma réel.
--
-- null = toute la journée (comportement le plus courant, valeur par défaut).
-- ============================================================

alter table notes add column if not exists demi text check (demi in ('matin', 'aprem'));
