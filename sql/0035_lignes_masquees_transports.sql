-- ============================================================
-- Planning Chantiers — lignes masquées, ligne unique « Transports »
-- Migration 0035 — 01.10.2026 (suite 134)
--
-- Lionel (page Améliorations et bugs, amélioration n° 9) : « Machine et
-- transports doivent avoir leurs propre onglet.
-- Machine aura ses propres ajout rapides.
-- Transport ne sera q'une ligne comme note et jalons.
-- Elle aura aussi ses propres ajout rapides.
-- On déplace les ajouts rapides de chaques type dans leurs onglets
-- correspondant 2 onglet en haut des pages ne pas avoir trop de donnée sur
-- une pages.
-- Ajouter une coche pour masquer une ligne personnel/intervenant et machine
-- sans les désactiver. »
-- Ses choix : masquage « Tous les appareils » ; ligne Transports « En haut,
-- sous Notes ».
--
--   1. personnes.masque : ligne cachée du planning et de l'impression sur
--      tous les appareils, sans être désactivée (tâches, assignations,
--      équipes inchangées). false par défaut.
--   2. groupes.ligne_unique : un groupe dont les lignes ne forment pas une
--      section mais UNE ligne fixe en haut du planning, sous Notes (sa
--      première ligne active). Transports passe à true. Les tâches de la
--      ligne Transports restent de vraies tâches (taches.personne_id) :
--      texte, chantier, important, plusieurs jours, séries, entrées rapides
--      — tout ce qui existe déjà pour une ligne, sans nouvelle table.
--   3. La ligne « Transports » : la seule ligne active du groupe. Les
--      lignes d'essai du groupe (aucune tâche à ce jour) sont désactivées,
--      pas supprimées.
--   4. Entrées rapides : assigne_a accepte aussi « @machines » et
--      « @transports » (texte libre, pas de contrainte à changer).
--
-- Sauvegardes : rien à changer (mêmes tables ; une ancienne sauvegarde
-- restaurée reprend les valeurs par défaut des 2 colonnes).
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `lignes_masquees_transports`) ; ce fichier garde la trace.
-- Rejouable.
-- ============================================================

alter table personnes add column if not exists masque boolean not null default false;
alter table groupes add column if not exists ligne_unique boolean not null default false;

update groupes set ligne_unique = true where nom = 'Transports' and not ligne_unique;

do $$
declare g bigint;
begin
  for g in select id from groupes where ligne_unique and actif loop
    if not exists (select 1 from personnes where groupe_id = g and actif and nom = 'Transports') then
      update personnes set actif = false where groupe_id = g and actif;
      insert into personnes (nom, sous_traitant, actif, ordre, equipe, groupe_id)
        values ('Transports', false, true, coalesce((select max(ordre) from personnes), 0) + 1, false, g);
    else
      update personnes set actif = false where groupe_id = g and actif and nom <> 'Transports';
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
