-- Round du 29.09.2026 (suite 122) — Lionel : « Pastille de couleur pour le
-- chantier dans les notes et jalons, pas de chantier = pas de pastille .
-- ajouter le chantier aux formulaires note et jalons. »
-- Les jalons ont leur chantier depuis 0007 ; les notes n'en avaient pas.
-- Nullable : une note sans chantier n'a pas de pastille. Un chantier
-- supprimé laisse ses notes sans chantier (on delete set null), comme le
-- fait déjà supprimerChantier pour les jalons (js/donnees-sync.js).
alter table public.notes add column if not exists chantier_id bigint references public.chantiers(id) on delete set null;
create index if not exists idx_notes_chantier on public.notes (chantier_id);
