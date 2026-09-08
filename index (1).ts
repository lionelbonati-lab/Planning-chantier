// enregistrer-serie — crée une série récurrente (tâche/jalon/note) et pose
// ses occurrences (port de apiEnregistrerSerie, WebApp.gs). Logique métier
// pure dans ./logic.js (testée séparément, cf. test_enregistrer_serie.js) ;
// ce fichier vérifie l'authentification, insère la ligne `series`, lit ce
// qui existe déjà en base pour la fenêtre de dates concernée, applique le
// plan d'opérations que renvoie construireOccurrencesSerie(), répond.
//
// Sécurité : client Supabase créé avec le JWT de l'appelant (jamais
// service_role) — mêmes règles RLS qu'un accès direct au client, cf.
// sql/0002_rls.sql.
//
// Limite connue, assumée (identique à enregistrer-plage) : les opérations
// sont appliquées une par une, pas dans une seule transaction Postgres — un
// échec en cours de série laisse les occurrences déjà écrites en place. À
// revoir avec une fonction Postgres (RPC) transactionnelle si ça pose un
// jour un vrai problème.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { genererDatesSerie, champsSerie, construireOccurrencesSerie } from "./logic.js";

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, erreur: "Non authentifié." }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  try {
    const payload = await req.json();

    // Valide type/texte/ancre puis construit les champs de la ligne
    // `series` — jette avant toute écriture si le payload est invalide.
    const champs = champsSerie(payload);
    // Génère les dates AVANT d'insérer quoi que ce soit : une définition
    // invalide (fréquence, finType, date de fin) ou qui ne produit aucune
    // occurrence jette ici, série jamais créée.
    const dates = genererDatesSerie(champs.date_debut, champs.frequence, champs.intervalle, champs.fin_type, champs.fin_valeur);

    const { data: serie, error: erreurSerie } = await supabase
      .from("series")
      .insert(champs)
      .select("id")
      .single();
    if (erreurSerie) return json({ ok: false, erreur: erreurSerie.message }, 500);
    const serieId = serie.id;

    const min = dates.reduce((a, b) => (a < b ? a : b));
    const max = dates.reduce((a, b) => (a > b ? a : b));
    const table = champs.type === "tache" ? "taches" : (champs.type === "jalon" ? "jalons" : "notes");
    const colonnes = champs.type === "tache" ? "date, personne_id, demi" : "date";

    const { data: existantes, error: erreurLecture } = await supabase
      .from(table)
      .select(colonnes)
      .gte("date", min)
      .lte("date", max);
    if (erreurLecture) return json({ ok: false, erreur: erreurLecture.message }, 500);

    let existantesAssignations: unknown[] = [];
    if (champs.type === "tache") {
      const { data, error } = await supabase
        .from("assignations")
        .select("date, personne_id, demi")
        .eq("personne_id", champs.cible_personne_id)
        .gte("date", min)
        .lte("date", max);
      if (error) return json({ ok: false, erreur: error.message }, 500);
      existantesAssignations = data ?? [];
    }

    const plan = construireOccurrencesSerie(champs, dates, serieId, existantes ?? [], existantesAssignations);

    for (const op of plan.ops) {
      const { type: _type, table: opTable, ...ligne } = op as Record<string, unknown>;
      const { error } = await supabase.from(opTable as string).insert(ligne);
      if (error) return json({ ok: false, erreur: error.message }, 500);
    }

    return json({ ok: true, serieId, dates, posees: plan.posees, ignorees: plan.ignorees });
  } catch (e) {
    return json({ ok: false, erreur: String(e && (e as Error).message ? (e as Error).message : e) }, 400);
  }
});
