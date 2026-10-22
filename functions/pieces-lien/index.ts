// ============================================================
// pieces-lien — round du 21.10.2026 (suite 147)
// ------------------------------------------------------------
// Lionel : « J'aimerais pouvoir rajouter des détails à mes tâches
// J'aimerais pouvoir leur joindre des fichiers, photos ou PDF. » Visibles
// aussi sur le « Lien des ouvriers » et le « Lien responsable ».
//
// Les fichiers sont dans le dossier PRIVÉ « pieces » (sql/0041) : seul un
// utilisateur connecté y a accès. Les deux liens sont anonymes ; ils
// demandent ici une adresse pour les fichiers d'une fiche :
//   POST { jeton, page: "consultation" | "responsable", lundi, chemins }
//   → { ok: true, urls: { chemin: adresse valable 1 heure } }
// Le jeton est vérifié en relisant la semaine par la même fonction que la
// page (consultation_planning / consultation_responsable, avec la clé
// publique) : seuls les fichiers joints à une tâche (ou, suite 149, à une
// note du lien responsable) que ce lien affiche sont signés, avec la clé
// de service (jamais renvoyée). Un chemin qui n'en fait pas partie est
// simplement absent de la réponse.
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { validerDemande, rpcDeLaPage, cheminsVisibles, cheminsASigner } from "./logic.js";

const DUREE_SECONDES = 3600;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, erreur: "Méthode non supportée." }, 405);

  let demande;
  try {
    demande = validerDemande(await req.json());
  } catch (e) {
    return json({ ok: false, erreur: e instanceof Error ? e.message : "Demande invalide." }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const publique = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false } });
  // Suite 150 : consultation_planning pour le lien des ouvriers (et non
  // « consultation_consultation », qui n'existe pas) — voir logic.js.
  const { data: semaine, error: erreurSemaine } = await publique.rpc(rpcDeLaPage(demande.page), {
    p_jeton: demande.jeton,
    p_lundi: demande.lundi,
  });
  if (erreurSemaine) return json({ ok: false, erreur: erreurSemaine.message }, 500);
  if (!semaine) return json({ ok: false, erreur: "Ce lien n'existe plus." }, 403);

  const aSigner = cheminsASigner(demande.chemins, cheminsVisibles(semaine));
  const urls: Record<string, string> = {};
  if (aSigner.length) {
    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const { data, error } = await service.storage.from("pieces").createSignedUrls(aSigner, DUREE_SECONDES);
    if (error) return json({ ok: false, erreur: error.message }, 500);
    (data || []).forEach((s: { path: string | null; signedUrl: string; error: string | null }) => {
      if (s.path && s.signedUrl && !s.error) urls[s.path] = s.signedUrl;
    });
  }
  return json({ ok: true, urls });
});
