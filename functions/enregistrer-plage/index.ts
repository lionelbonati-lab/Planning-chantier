// enregistrer-plage — pose un jalon ou une note sur une plage de jours
// ouvrés (port de apiEnregistrerPlage, WebApp.gs). La logique métier pure
// vit dans ./logic.js (testée séparément, cf. test_enregistrer_plage.js à
// la racine du dépôt) ; ce fichier ne fait que : vérifier l'authentification,
// lire les lignes déjà en base pour les dates concernées, appliquer le plan
// d'opérations que renvoie planPlage(), répondre.
//
// Sécurité : le client Supabase est créé avec le JWT de l'appelant (jamais
// une clé service_role) — les requêtes passent donc par les mêmes règles
// RLS que n'importe quel accès direct au client (cf. sql/0002_rls.sql) :
// aucun utilisateur non connecté ne peut rien lire ni écrire ici.
//
// Limite connue, assumée pour cette première version : les opérations
// (insert/update/delete) sont appliquées une par une, pas dans une seule
// transaction Postgres — un échec au milieu d'une plage de plusieurs jours
// laisserait les jours déjà traités enregistrés et les suivants non
// traités. Le risque est faible en usage réel (peu de jours par appel), et
// l'appelant reçoit une erreur claire s'il arrive. À revoir avec une
// fonction Postgres (RPC) transactionnelle si ça pose un jour un vrai
// problème — pas fait ici pour garder cette première fonction simple à lire
// et à tester.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { planPlage } from "./logic.js";

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
    const params = await req.json();

    if (params.kind !== "jalon" && params.kind !== "note") {
      return json({ ok: false, erreur: "Type de case invalide." }, 400);
    }

    // Fenêtre de dates à relire : la nouvelle plage, plus l'ancienne si
    // fournie (édition) — on a besoin des deux pour à la fois retrouver ce
    // qui existe déjà là où on écrit ET l'entrée à libérer là où on n'écrit
    // plus.
    const bornes = [params.dateDebut, params.dateFin];
    if (params.origine) bornes.push(params.origine.dateDebut, params.origine.dateFin);
    const valides = bornes.filter((d: unknown): d is string => typeof d === "string" && d.length > 0);
    if (valides.length === 0) return json({ ok: false, erreur: "Choisis une date de début." }, 400);
    const min = valides.reduce((a, b) => (a < b ? a : b));
    const max = valides.reduce((a, b) => (a > b ? a : b));

    const table = params.kind === "jalon" ? "jalons" : "notes";
    // "demi" (round du 08.09.2026, suite — sql/0006_jalons_demi.sql) : un
    // jalon porte désormais lui aussi sa propre demi-journée par bord,
    // exactement comme une note — planPlage() en a besoin pour décider si
    // une ligne existante correspond déjà à ce qui est demandé.
    const colonnes = params.kind === "jalon" ? "id, date, texte, demi" : "id, date, texte, important, demi";

    const { data: existantes, error: erreurLecture } = await supabase
      .from(table)
      .select(colonnes)
      .gte("date", min)
      .lte("date", max);
    if (erreurLecture) return json({ ok: false, erreur: erreurLecture.message }, 500);

    const plan = planPlage(params, existantes ?? []);

    for (const op of plan.ops) {
      if (op.type === "insert") {
        const { type: _type, table: opTable, ...ligne } = op;
        const { error } = await supabase.from(opTable).insert(ligne);
        if (error) return json({ ok: false, erreur: error.message }, 500);
      } else if (op.type === "update") {
        const { type: _type, table: opTable, id, ...champs } = op;
        const { error } = await supabase.from(opTable).update(champs).eq("id", id);
        if (error) return json({ ok: false, erreur: error.message }, 500);
      } else if (op.type === "delete") {
        const { error } = await supabase.from(op.table).delete().eq("id", op.id);
        if (error) return json({ ok: false, erreur: error.message }, 500);
      }
    }

    return json({
      ok: true,
      jours: plan.poses,
      remplaces: plan.remplaces,
      liberes: plan.liberes,
      ajoutes: plan.ajoutes,
    });
  } catch (e) {
    return json({ ok: false, erreur: String(e && (e as Error).message ? (e as Error).message : e) }, 400);
  }
});
