-- ============================================================
-- Planning Chantiers — taches.est_absence (vraie colonne, remplace la
-- déduction par texte)
-- Migration 0009 — 14.09.2026
--
-- Bug signalé par Lionel, vidéo à l'appui : « J'ai une erreur en mettant une
-- absence sur plusieurs jours, elle est attribuée à un chantier et prend la
-- couleur grise. »
--
-- Cause : la table `taches` n'a jamais eu de colonne distinguant une
-- "absence" d'une tâche normale (cf. commentaire d'estAbsence()/
-- creerSerieServeur dans Index.html avant ce round) — c'est le CLIENT qui
-- décidait seul, à CHAQUE reconstruction depuis le cache serveur
-- (construireVueDepuisCache), en appliquant estAbsence(texte) : une
-- absence n'était reconnue que si son texte contenait "absent", "cong"
-- (Congé) ou "vacance" (Vacances). Une absence au descriptif libre (motif
-- personnalisé, ou simplement "test" comme dans la vidéo de Lionel) ne
-- matchait aucun de ces 3 mots : synchroniser() recharge SYSTÉMATIQUEMENT
-- depuis le serveur juste après chaque écriture (oublierCache +
-- construireVueDepuisCache), donc l'item repassait "tâche" quelques
-- centaines de ms après l'avoir enregistré comme absence — sans chantier
-- (chantier=null), d'où le repli gris (#e5e5e5, cf. bulleEl) au lieu de la
-- couleur d'absence attendue. En rouvrant la fiche, ouvrirEdition() la
-- traitait alors comme une VRAIE tâche (bandeau bleu avec nom de chantier
-- par défaut au lieu du bandeau "Absence"), et un simple clic sur
-- "Enregistrer" lui attribuait pour de bon ce chantier par défaut — d'où
-- « elle est attribuée à un chantier ».
--
-- Correctif : une vraie colonne, écrite explicitement à la création
-- (enregistrerCellulePersonneServeur pour une absence simple/plage,
-- enregistrer-serie pour une absence en série — cf. FRONTEND-CHANGELOG.md
-- pour le détail des 2 chemins), lue à la reconstruction
-- (construireVueDepuisCache, via tacheVue_) : estAbsence(texte) n'est plus
-- utilisée qu'en OR (filet de sécurité) pour ne jamais reclasser en tâche
-- une ligne déjà en base avant ce round.
--
-- Backfill : best-effort sur les lignes déjà en base, avec EXACTEMENT la
-- même règle que l'ancienne détection cliente (estAbsence() d'Index.html /
-- estAbsence() de Planning_Format.gs) — ne change donc le comportement
-- d'AUCUNE absence déjà correctement reconnue jusqu'ici ; ne répare pas
-- rétroactivement une absence au texte libre déjà tombée "grise" avant ce
-- round (aucun moyen de la distinguer avec certitude d'une vraie tâche a
-- posteriori) — Lionel peut la rouvrir et l'enregistrer à nouveau comme
-- absence une fois ce correctif en place.
--
-- Appliquée directement sur le projet Supabase via le connecteur MCP au
-- moment où la demande a été traitée (même méthode que 0003/0005/0006/0007/
-- 0008) — ce fichier documente juste ce qui a déjà été fait.
-- ============================================================

alter table taches add column if not exists est_absence boolean not null default false;

update taches set est_absence = true
where est_absence = false
  and (
    lower(texte) like '%absent%'
    or lower(texte) like '%cong%'
    or lower(texte) like '%vacance%'
  );
