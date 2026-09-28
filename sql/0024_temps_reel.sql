-- Round du 28.09.2026 (suite 89) — Lionel : « une tâche mise sur mon
-- téléphone met bcp de temps à apparaître sur mon ordinateur ».
-- Un ordinateur resté affiché ne relisait sa semaine qu'en revenant sur
-- l'onglet (visibilitychange). Les tables du planning sont maintenant
-- publiées en temps réel : l'appli (js/donnees-sync.js, ecouterTempsReel)
-- est prévenue de chaque écriture d'un autre appareil et relit la semaine
-- affichée. RLS s'applique aussi aux messages temps réel.
do $$
declare t text;
begin
  foreach t in array array['taches', 'jalons', 'notes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
