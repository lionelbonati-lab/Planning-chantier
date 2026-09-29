-- Round du 29.09.2026 (suite 119) — Lionel : « mettre une couleur sur
-- l'équipe, je vois qu'il y a une bordure grise, il serait bien de pouvoir
-- choisir sa couleur par équipe ».
-- Couleur (#rrggbb) d'une ligne de `personnes` — utilisée pour les équipes
-- (bande à gauche du nom de l'équipe et de ses membres, js/equipes.js).
-- Vide : couleur d'accent du thème, comme avant.
alter table public.personnes add column if not exists couleur text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'personnes_couleur_hex') then
    alter table public.personnes add constraint personnes_couleur_hex check (couleur is null or couleur ~ '^#[0-9a-fA-F]{6}$');
  end if;
end $$;
