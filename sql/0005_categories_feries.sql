-- ============================================================
-- Planning Chantiers — table "Catégories fériés" + correctif contrainte
-- Migration 0005 — 04.09.2026 (phase 4, étape 3 du §6bis)
--
-- Contrairement à 0001-0004, CE FICHIER EST DÉJÀ APPLIQUÉ EN QUASI-TOTALITÉ
-- (CREATE TABLE, seed, RLS, correctif de contrainte sur `feries` — testé via
-- le connecteur MCP au moment où ce gap a été repéré, comme 0003) : il
-- documente ici ce qui a déjà été fait, pour que le dépôt reste le reflet
-- fidèle du schéma réel (même logique que 0003_notes_demi.sql).
--
-- SEUL le dernier bloc (le GRANT, tout en bas) reste À COLLER À LA MAIN par
-- Lionel dans l'Éditeur SQL Supabase : une action qui élargit des droits
-- d'accès sur un rôle est bloquée par les garde-fous de sécurité de
-- l'environnement d'agent, refusée sans confirmation humaine directe —
-- exactement la même limite que 0004_grants_authenticated.sql. Recoller tout
-- le fichier ne pose aucun risque (tout est idempotent, cf. plus bas) si
-- c'est plus simple que d'isoler seulement la dernière ligne.
--
-- Pourquoi cette table manquait : le schéma initial (0001_schema.sql) n'a
-- jamais eu de table `categories_feries` — l'étape 2 (chargement) avait
-- laissé etat.categoriesFeriesServeur = [] volontairement, avec un repli
-- client sur CATEGORIES_FERIES_DEFAUT (Index.html). Cette migration comble
-- le manque pour de vrai, afin qu'enregistrerCouleursCategoriesFeriesServeur
-- (Index.html, section "CONFIG SIMPLE") ait une vraie table où écrire —
-- reprend le contenu de l'ancienne feuille "Catégories fériés" (WebApp.gs,
-- CATEGORIES_FERIES_ORDRE_DEFAUT/CATEGORIES_FERIES_NOMS_DEFAUT/
-- CATEGORIES_FERIES_COULEUR_DEFAUT) : 3 lignes fixes (id/nom/couleur), dont
-- seule la couleur est modifiable depuis l'appli — pas d'ajout, de
-- suppression ni de renommage de catégorie prévu côté client.
--
-- Rejouable sans risque : la table n'est créée que si elle n'existe pas
-- déjà (create table if not exists) et les 3 lignes par défaut ne sont
-- insérées que si la table est vide au moment du script (pas d'écrasement
-- d'une éventuelle couleur déjà personnalisée par Lionel entre-temps).
-- ============================================================

create table if not exists categories_feries (
  id      text primary key,   -- "vacances_entreprise" | "ferie" | "compenses" — jamais un id numérique généré, ce sont des clés fixes connues du client (CATEGORIES_FERIES_DEFAUT, Index.html)
  nom     text not null,
  couleur text not null
);

insert into categories_feries (id, nom, couleur)
select * from (values
  ('vacances_entreprise', 'Vacances entreprise', '#a9c6ea'),
  ('ferie',               'Férié',               '#e8a3a3'),
  ('compenses',           'Compensés',           '#e8dba3')
) as defaut(id, nom, couleur)
where not exists (select 1 from categories_feries);

drop policy if exists "connecte_tout" on categories_feries;
alter table categories_feries enable row level security;
create policy "connecte_tout" on categories_feries for all to authenticated using (true) with check (true);

-- ---- Correctif : la contrainte de `feries.categorie` (migration 0001)
-- n'autorisait que 'ferie'/'vacances_entreprise' — 'compenses' manquait
-- depuis le début (gap découvert en portant apiEnregistrerFeriesV3 à
-- l'étape 3, jamais remarqué avant faute d'avoir déjà testé cette 3e
-- catégorie en conditions réelles). Sans ce correctif, poser un jour férié
-- de catégorie "Compensés" depuis l'appli échouerait avec une erreur
-- Postgres "violates check constraint". Rejouable sans risque (drop
-- constraint if exists avant de la recréer).
alter table feries drop constraint if exists feries_categorie_check;
alter table feries add constraint feries_categorie_check
  check (categorie in ('ferie', 'vacances_entreprise', 'compenses'));

-- ---- Droits d'accès (cf. en-tête — bloqué pour cette session, à Lionel de
-- coller ce bloc, comme pour 0004) : sans GRANT, un utilisateur connecté et
-- autorisé par la policy ci-dessus se voit quand même refuser l'accès avec
-- "permission denied for table categories_feries", la policy RLS n'étant
-- jamais évaluée avant le GRANT au niveau SQL de base.
grant select, insert, update, delete on categories_feries to authenticated;
