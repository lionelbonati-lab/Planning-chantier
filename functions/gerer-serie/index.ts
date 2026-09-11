// gerer-serie — modifie ou supprime les occurrences d'une série récurrente,
// selon une portée (port de apiModifierSerie ET apiSupprimerSerie, WebApp.gs
// — les deux actions partagent leur logique, cf. logic.js). Ce fichier :
// vérifie l'authentification, retrouve le type de la série (pour savoir
// quelle table interroger), lit les occurrences déjà filtrées par portée+
// serie_id via une requête Supabase (plus besoin de parcourir des "semaines"
// comme l'ancien code, cf. logic.js), applique le plan d'opérations que
// renvoie planModifierSerie()/planSupprimerSerie(), répond.
//
// Sécurité : client Supabase créé avec le JWT de l'appelant (jamais
// service_role) — mêmes règles RLS qu'un accès direct au client, cf.
// sql/0002_rls.sql.
//
// Limite connue, assumée (identique à enregistrer-plage/enregistrer-serie) :
// les opérations sont appliquées une par une, pas dans une seule transaction
// Postgres.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { planSupprimerSerie, planModifierSerie } from "./logic.js";

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
    const action = String(payload.action || "");
    if (["modifier", "supprimer"].indexOf(action) === -1) return json({ ok: false, erreur: "Action invalide." }, 400);
    const portee = String(payload.portee || "");
    if (["unique", "suivant", "serie"].indexOf(portee) === -1) return json({ ok: false, erreur: "Portée invalide." }, 400);
    const serieId = payload.serieId;
    if (!serieId) return json({ ok: false, erreur: "Série invalide." }, 400);
    const dateRefIso = String(payload.dateRefIso || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRefIso)) return json({ ok: false, erreur: "Date de référence invalide." }, 400);

    const { data: serie, error: erreurSerie } = await supabase
      .from("series")
      .select("id, type")
      .eq("id", serieId)
      .maybeSingle();
    if (erreurSerie) return json({ ok: false, erreur: erreurSerie.message }, 500);
    if (!serie) return json({ ok: false, erreur: "Série introuvable." }, 404);

    const table = serie.type === "tache" ? "taches" : (serie.type === "jalon" ? "jalons" : "notes");
    const colonnes = table === "taches" ? "id, personne_id, date, demi" : "id, date";

    let requete = supabase.from(table).select(colonnes).eq("serie_id", serieId);
    if (portee === "unique") requete = requete.eq("date", dateRefIso);
    else if (portee === "suivant") requete = requete.gte("date", dateRefIso);
    const { data: lignes, error: erreurLecture } = await requete;
    if (erreurLecture) return json({ ok: false, erreur: erreurLecture.message }, 500);

    const plan = action === "supprimer"
      ? planSupprimerSerie(table, lignes ?? [])
      : planModifierSerie(table, lignes ?? [], payload.modifs || {});

    for (const opUntyped of plan.ops) {
      const op = opUntyped as Record<string, unknown>;
      if (op.type === "delete") {
        const { error } = await supabase.from(op.table as string).delete().eq("id", op.id);
        if (error) return json({ ok: false, erreur: error.message }, 500);
      } else if (op.type === "update") {
        const { error } = await supabase.from(op.table as string).update(op.champs).eq("id", op.id);
        if (error) return json({ ok: false, erreur: error.message }, 500);
      } else if (op.type === "replace_assignation") {
        const { error: erreurSuppr } = await supabase.from("assignations").delete()
          .eq("personne_id", op.personne_id as number).eq("date", op.date as string).eq("demi", op.demi as string);
        if (erreurSuppr) return json({ ok: false, erreur: erreurSuppr.message }, 500);
        const { error: erreurInsert } = await supabase.from("assignations").insert({
          personne_id: op.personne_id, date: op.date, demi: op.demi, chantier_id: op.chantier_id,
        });
        if (erreurInsert) return json({ ok: false, erreur: erreurInsert.message }, 500);
      }
    }

    return json({ ok: true, touchees: (lignes ?? []).length });
  } catch (e) {
    return json({ ok: false, erreur: String(e && (e as Error).message ? (e as Error).message : e) }, 400);
  }
});
