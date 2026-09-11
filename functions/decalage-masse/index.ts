// decalage-masse — décale les tâches/chantiers d'une personne (ou de tout le
// monde) de N jours ouvrés, en avant ou en arrière (port de
// calculerPlanDecalage_/apiApercuDecalage/apiAppliquerDecalage, WebApp.gs).
// Une seule fonction serveur, deux actions ('apercu' | 'appliquer') — les
// deux REFONT LE MÊME CALCUL depuis un état frais de la base (cf. logic.js,
// calculerPlanDecalage) : jamais de plan mis en cache côté client, même
// principe que l'ancien code ("toujours revalider contre l'état réel de la
// feuille"). Ce fichier : vérifie l'authentification, résout la portée en
// liste de personne_id, lit les cases concernées (fenêtre à partir de la
// date de départ, plus une fenêtre antérieure si on recule — cf. commentaire
// sur cellesParCle dans logic.js), appelle calculerPlanDecalage(), puis pour
// 'appliquer' construit et exécute le plan d'opérations.
//
// Sécurité : client Supabase créé avec le JWT de l'appelant (jamais
// service_role) — mêmes règles RLS qu'un accès direct au client, cf.
// sql/0002_rls.sql.
//
// Limite connue, assumée (identique aux autres Edge Functions de ce
// projet) : les opérations sont appliquées une par une, pas dans une seule
// transaction Postgres.
//
// Approximation connue : "aujourd'hui" (utilisé pour interdire de reculer
// dans le passé) est calculé en UTC (Deno n'a pas d'équivalent fiable du
// fuseau "du script" de l'ancien Apps Script) — décalage possible d'un jour
// autour de minuit, impact mineur pour ce garde-fou.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { decalerJourOuvre, cleCase, calculerPlanDecalage, construireOpsDecalage } from "./logic.js";

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

type Cellule = { taches: Record<string, unknown>[]; assignations: Record<string, unknown>[] };

function ajouter(cellesParCle: Record<string, Cellule>, personneId: number, date: string, demi: string, champ: "taches" | "assignations", ligne: Record<string, unknown>) {
  const cle = cleCase(personneId, date, demi);
  if (!cellesParCle[cle]) cellesParCle[cle] = { taches: [], assignations: [] };
  cellesParCle[cle][champ].push(ligne);
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
    if (["apercu", "appliquer"].indexOf(action) === -1) return json({ ok: false, erreur: "Action invalide." }, 400);
    const portee = String(payload.portee || "");
    if (["ligne", "tous"].indexOf(portee) === -1) return json({ ok: false, erreur: "Portée invalide." }, 400);
    const dateDepartIso = String(payload.dateDepartIso || "");
    const sens = String(payload.sens || "");
    const n = parseInt(payload.nJours, 10) || 0;

    let personneIds: number[];
    if (portee === "ligne") {
      if (!payload.personneId) return json({ ok: false, erreur: "Choisis une case." }, 400);
      personneIds = [payload.personneId];
    } else {
      const { data, error } = await supabase.from("personnes").select("id");
      if (error) return json({ ok: false, erreur: error.message }, 500);
      personneIds = (data ?? []).map((p: { id: number }) => p.id);
    }

    const colonnesTaches = "id, personne_id, date, demi, texte, statut_id, important, serie_id";
    const colonnesAssignations = "id, personne_id, date, demi, chantier_id";

    const cellesParCle: Record<string, Cellule> = {};
    const clesSources = new Set<string>();
    const sourcesCandidates: { personneId: number; date: string; demi: string }[] = [];

    if (personneIds.length > 0 && dateDepartIso) {
      const { data: tachesSource, error: e1 } = await supabase.from("taches").select(colonnesTaches)
        .in("personne_id", personneIds).gte("date", dateDepartIso);
      if (e1) return json({ ok: false, erreur: e1.message }, 500);
      const { data: assignationsSource, error: e2 } = await supabase.from("assignations").select(colonnesAssignations)
        .in("personne_id", personneIds).gte("date", dateDepartIso);
      if (e2) return json({ ok: false, erreur: e2.message }, 500);

      (tachesSource ?? []).forEach((t: Record<string, unknown>) => {
        ajouter(cellesParCle, t.personne_id as number, t.date as string, t.demi as string, "taches", t);
        clesSources.add(cleCase(t.personne_id as number, t.date as string, t.demi as string));
      });
      (assignationsSource ?? []).forEach((a: Record<string, unknown>) => {
        ajouter(cellesParCle, a.personne_id as number, a.date as string, a.demi as string, "assignations", a);
        clesSources.add(cleCase(a.personne_id as number, a.date as string, a.demi as string));
      });
      clesSources.forEach((cle) => {
        const [personneId, date, demi] = cle.split("|");
        sourcesCandidates.push({ personneId: parseInt(personneId, 10), date, demi });
      });

      // On recule : les destinations peuvent tomber AVANT la date de départ
      // (jamais des sources, seulement lues pour détecter un conflit là-bas
      // — même principe que l'ancien iMin/cDebut, fenêtre de lecture élargie
      // côté passé uniquement quand nécessaire).
      if (sens === "reculer" && n >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(dateDepartIso)) {
        const dateMinDest = decalerJourOuvre(dateDepartIso, -n);
        const { data: tachesAvant, error: e3 } = await supabase.from("taches").select(colonnesTaches)
          .in("personne_id", personneIds).gte("date", dateMinDest).lt("date", dateDepartIso);
        if (e3) return json({ ok: false, erreur: e3.message }, 500);
        const { data: assignationsAvant, error: e4 } = await supabase.from("assignations").select(colonnesAssignations)
          .in("personne_id", personneIds).gte("date", dateMinDest).lt("date", dateDepartIso);
        if (e4) return json({ ok: false, erreur: e4.message }, 500);
        (tachesAvant ?? []).forEach((t: Record<string, unknown>) => ajouter(cellesParCle, t.personne_id as number, t.date as string, t.demi as string, "taches", t));
        (assignationsAvant ?? []).forEach((a: Record<string, unknown>) => ajouter(cellesParCle, a.personne_id as number, a.date as string, a.demi as string, "assignations", a));
      }
    }

    const aujourdhuiIso = new Date().toISOString().slice(0, 10);
    const plan = calculerPlanDecalage({ personneIds, dateDepartIso, sens, nJours: n }, sourcesCandidates, cellesParCle, aujourdhuiIso);

    if (action === "apercu") {
      return json({
        ok: true,
        nbSimples: plan.simples.length,
        conflits: plan.conflits.map((e: Record<string, unknown>) => ({ id: e.id, personneId: e.personneId, demi: e.demi, dateSource: e.dateSource, dateDest: e.dateDest })),
        impossibles: plan.impossibles,
      });
    }

    const resultat = construireOpsDecalage(plan, payload.resolutions || {});
    for (const opUntyped of resultat.ops) {
      const op = opUntyped as Record<string, unknown>;
      if (op.type === "insert") {
        const { type: _type, table: opTable, ...ligne } = op;
        const { error } = await supabase.from(opTable as string).insert(ligne);
        if (error) return json({ ok: false, erreur: error.message }, 500);
      } else if (op.type === "delete") {
        const { error } = await supabase.from(op.table as string).delete().eq("id", op.id);
        if (error) return json({ ok: false, erreur: error.message }, 500);
      }
    }

    return json({ ok: true, deplaces: resultat.deplaces, ecrases: resultat.ecrases, ajoutes: resultat.ajoutes, ignores: resultat.ignores });
  } catch (e) {
    return json({ ok: false, erreur: String(e && (e as Error).message ? (e as Error).message : e) }, 400);
  }
});
