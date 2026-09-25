-- ============================================================
-- Planning Chantiers — réglages liés au compte
-- Migration 0016 — 25.09.2026 (suite 39)
--
-- Lionel : « Je pensais aussi à une mise en page. En-tête, pied de pages,
-- marges, espaces entre les éléments. C'est peut-être plus judicieux de
-- faire un onglet mise en pages. Et garde que les réglage à cocher dans
-- la feuille impression. » À la question du stockage : « Liés au compte »
-- (mêmes réglages sur téléphone et ordinateur).
--
-- Une ligne = un groupe de réglages, rangé en JSON sous une clé :
-- 'mise_en_page' (onglet Mise en page, js/page-mise-en-page.js) pour
-- l'instant. Clé texte plutôt qu'une colonne par réglage : ajouter un
-- réglage plus tard ne demande pas de migration. Mono-tenant comme le
-- reste (un seul compte), d'où l'absence de colonne utilisateur.
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `reglages`) ; ce fichier garde la trace. `if not exists` sur
-- la table ; policy recréée proprement (drop if exists) : rejouable.
-- ============================================================

create table if not exists reglages (
  cle text primary key,
  valeur jsonb not null,
  maj timestamptz not null default now()
);

alter table reglages enable row level security;
-- Pattern RLS de toute l'appli (mono-tenant) — identique à horaires.
drop policy if exists "connecte_tout" on reglages;
create policy "connecte_tout" on reglages for all to authenticated using (true) with check (true);
-- Grant explicite requis pour une table créée en SQL (cf. 0004, 0005, 0011).
grant select, insert, update, delete on reglages to authenticated;
