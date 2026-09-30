-- ============================================================
-- Planning Chantiers — améliorations et bugs (notes de Lionel pour Claude)
-- Migration 0030 — 30.09.2026 (suite 129)
--
-- Lionel : « J'aimerai avoir un endroit où je peux prendre des notes pour
-- améliorer et signaler des bugs. 2 cases, améliorations et bug. Quand
-- j'ai quelque chose à noter, je le note dans la case correspondante et
-- j'envoie avec un bouton. Quand j'ai du temps pour discuter des
-- améliorations et bug tu devras lire ce que j'ai envoyé. Idéalement il
-- faudrait faire la distinction entre mobile, tablette et deskop. »
--
-- Table retours : une ligne par note envoyée depuis Réglages ›
-- Améliorations et bugs (js/page-retours.js) :
--   - sorte : 'amelioration' ou 'bug' (la case d'où elle est partie) ;
--   - appareil : 'telephone', 'tablette', 'ordinateur' (reconnu à l'envoi,
--     modifiable avant) ou 'tous' (concerne tous les appareils) ;
--   - details : ce qui aide à comprendre un bug sans le demander —
--     navigateur, taille d'écran et de fenêtre, densité, tactile, appli
--     installée, page d'où l'on venait ;
--   - statut / reponse : posés par Claude à la discussion (« lu », puis
--     « traite » avec ce qui a été fait), affichés sous la note.
-- Lecture par Claude : outil Supabase de la session (execute_sql), par
-- exemple « select * from retours where statut <> 'traite' order by
-- cree_le ».
--
-- Pas dans les sauvegardes (tables_sauvegardees_, 0017) : restaurer le
-- planning ne doit pas effacer les notes envoyées depuis.
--
-- Appliquée directement sur le projet via l'outil Supabase de la session
-- (migration `retours`) ; ce fichier garde la trace. Rejouable.
-- ============================================================

create table if not exists retours (
  id bigint generated always as identity primary key,
  sorte text not null check (sorte in ('amelioration', 'bug')),
  texte text not null check (length(btrim(texte)) > 0),
  appareil text not null check (appareil in ('telephone', 'tablette', 'ordinateur', 'tous')),
  details jsonb not null default '{}'::jsonb,
  statut text not null default 'nouveau' check (statut in ('nouveau', 'lu', 'traite')),
  reponse text,
  cree_par uuid default auth.uid(),
  cree_le timestamptz not null default now()
);
create index if not exists retours_cree_le_idx on retours (cree_le desc);

alter table retours enable row level security;
drop policy if exists "connecte_tout" on retours;
create policy "connecte_tout" on retours for all to authenticated using (true) with check (true);
revoke all on retours from anon;
grant select, insert, update, delete on retours to authenticated;
