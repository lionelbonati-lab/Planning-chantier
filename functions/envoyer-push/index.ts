// ============================================================
// envoyer-push — round du 29.09.2026 (suite 126)
// ------------------------------------------------------------
// Lionel : « Notification Push sur le téléphone et l'ordinateur avec
// différents paramètre à régler dans l'appli. »
//
// Deux appels :
//   - { jeton } : pg_cron (sql/0027_notifications_push.sql), chaque minute
//     où il y a quelque chose à faire. Le jeton (table privée push_config)
//     prouve que l'appel vient de la base. Lit ce qu'il faut, laisse
//     logic.js (planEnvois) décider, note ce qui est annoncé AVANT
//     d'envoyer (un envoi lent ou raté ne se répète pas chaque minute),
//     puis envoie ;
//   - { test: endpoint } : bouton « Envoyer un essai » de Réglages ›
//     Notifications, avec le jeton de connexion de l'utilisateur ; envoie
//     un message d'essai à cet appareil seulement.
// Un abonnement que le service du navigateur dit disparu (404 / 410 :
// notifications retirées, navigateur désinstallé) est effacé.
// Envoi : bibliothèque web-push (chiffrement aes128gcm, signature VAPID).
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { planEnvois, heureLocale, decalerIso } from "./logic.js";

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

type Abonnement = { id: number; endpoint: string; p256dh: string; auth: string };
type Message = { titre: string; corps: string; tag: string };

// deno-lint-ignore no-explicit-any
async function envoyer(abo: Abonnement, message: Message): Promise<{ ok: boolean; statut?: number; erreur?: string }> {
  try {
    const r = await webpush.sendNotification(
      { endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } },
      JSON.stringify(message),
      // Une série de modifications non encore remise remplace la précédente.
      { TTL: 12 * 3600, urgency: "normal", ...(message.tag === "modifs" ? { topic: "modifs" } : {}) },
    );
    return { ok: true, statut: r.statusCode };
  } catch (e) {
    // deno-lint-ignore no-explicit-any
    const err = e as any;
    return { ok: false, statut: err?.statusCode, erreur: String(err?.body || err?.message || err).slice(0, 300) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, erreur: "Méthode non supportée." }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const params = await req.json().catch(() => ({}));
    const { data: config, error: errConfig } = await admin.from("push_config").select("vapid_public, vapid_prive, sujet, jeton").eq("id", 1).maybeSingle();
    if (errConfig || !config) return json({ ok: false, erreur: "Notifications pas configurées." }, 500);
    webpush.setVapidDetails(config.sujet, config.vapid_public, config.vapid_prive);

    // ---- Essai depuis les réglages ----
    if (params.test) {
      const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: u } = await admin.auth.getUser(jwt);
      if (!u?.user) return json({ ok: false, erreur: "Non authentifié." }, 401);
      const { data: abo } = await admin.from("abonnements_push").select("id, endpoint, p256dh, auth").eq("endpoint", String(params.test)).maybeSingle();
      if (!abo) return json({ ok: false, erreur: "Cet appareil n’est pas abonné." }, 404);
      const r = await envoyer(abo, { titre: "Essai réussi", corps: "Les notifications du planning arrivent sur cet appareil.", tag: "essai" });
      if (!r.ok && (r.statut === 404 || r.statut === 410)) await admin.from("abonnements_push").delete().eq("id", abo.id);
      return json({ ok: r.ok, statut: r.statut, erreur: r.erreur });
    }

    // ---- Passage planifié ----
    if (!params.jeton || params.jeton !== config.jeton) return json({ ok: false, erreur: "Accès refusé." }, 403);
    const maintenant = new Date();
    const local = heureLocale(maintenant);
    const demain = decalerIso(local.iso, 1);
    const lire = async (q: PromiseLike<{ data: unknown; error: unknown }>) => {
      const r = await q;
      if (r.error) throw r.error;
      return (r.data || []) as Record<string, unknown>[];
    };
    const [abonnements, demandes, modifs, personnes, chantiers, statuts, taches, jalons, notes, aReserver] = await Promise.all([
      lire(admin.from("abonnements_push").select("id, endpoint, p256dh, auth, session_id, types, heure_veille, heure_matin, derniere_veille, dernier_matin")),
      lire(admin.from("demandes_absence").select("id, personne_id, date_debut, date_fin, demi_debut, demi_fin, motif, type").eq("statut", "en_attente").eq("notifiee_push", false)),
      lire(admin.from("push_modifs").select("session_id, derniere")),
      lire(admin.from("personnes").select("id, nom, ordre").eq("actif", true).order("ordre")),
      lire(admin.from("chantiers").select("id, nom")),
      lire(admin.from("statuts").select("id, cle, nom, ordre")),
      lire(admin.from("taches").select("personne_id, date, demi, texte, chantier_id, est_absence, important").eq("important", true).gte("date", local.iso).lte("date", demain)),
      lire(admin.from("jalons").select("date, texte, chantier_id, important").eq("important", true).gte("date", local.iso).lte("date", demain)),
      lire(admin.from("notes").select("date, texte, chantier_id, important").eq("important", true).gte("date", local.iso).lte("date", demain)),
      lire(admin.from("taches").select("personne_id, date, texte, chantier_id, statut_id").not("statut_id", "is", null).gte("date", local.iso).order("date").limit(5000)),
    ]);

    const plan = planEnvois({ abonnements, demandes, modifs, personnes, chantiers, statuts, taches, jalons, notes, aReserver }, maintenant);

    // Noté d'abord : rien n'est annoncé deux fois.
    if (plan.demandesAnnoncees.length) await admin.from("demandes_absence").update({ notifiee_push: true }).in("id", plan.demandesAnnoncees);
    if (plan.modifsTraitees.length) {
      // Une session qui a encore écrit entre-temps reste pour le passage suivant.
      await admin.from("push_modifs").delete().in("session_id", plan.modifsTraitees).lte("derniere", new Date(maintenant.getTime() - 60000).toISOString());
    }
    for (const m of plan.majAbonnements) {
      const { id, ...champs } = m;
      await admin.from("abonnements_push").update(champs).eq("id", id);
    }

    const resultats = await Promise.all(plan.envois.map((e: { abonnement: Abonnement; message: Message }) => envoyer(e.abonnement, e.message).then((r) => ({ e, r }))));
    const disparus = [...new Set(resultats.filter((x) => !x.r.ok && (x.r.statut === 404 || x.r.statut === 410)).map((x) => x.e.abonnement.id))];
    if (disparus.length) await admin.from("abonnements_push").delete().in("id", disparus);

    return json({
      ok: true,
      envoyes: resultats.filter((x) => x.r.ok).length,
      echecs: resultats.filter((x) => !x.r.ok).map((x) => ({ abonnement: x.e.abonnement.id, tag: x.e.message.tag, statut: x.r.statut, erreur: x.r.erreur })),
      retires: disparus.length,
    });
  } catch (e) {
    return json({ ok: false, erreur: String((e as Error)?.message || e) }, 500);
  }
});
