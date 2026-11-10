// ============================================================
// inviter-compte — round du 09.11.2026 (suite 155)
// ------------------------------------------------------------
// Lionel : « Un collègue aimerait utiliser mon planning pour ses propres
// besoins. Il doit pouvoir un compte et gérer son propre planning. » Ses
// choix : compte créé « Toi, depuis l'appli » ; invitations « Toi seul »,
// dans « un nouveau, ou le tien pour le partager ».
//
// Appelée par la page Réglages › Comptes (js/page-comptes.js), avec le
// jeton de connexion de l'administrateur :
//   POST { prenom, nom, email, planning: "nouveau" | id, nom_planning }
//   → { ok: true, email, mot_de_passe } (mot de passe provisoire)
// Le service d'e-mail intégré de Supabase n'écrit qu'aux membres de
// l'équipe du projet : pas d'e-mail d'invitation automatique. Le compte
// est créé confirmé, avec un mot de passe provisoire que l'administrateur
// envoie lui-même (la page prépare le message) ; à la première connexion,
// l'appli demande d'en choisir un (user_metadata.changer_mot_de_passe).
// Clé de service lue sur le serveur seulement, jamais renvoyée. Un échec
// après la création du compte l'efface (rien à moitié fait).
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { validerInvitation, motDePasseProvisoire } from "./logic.js";

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
    demande = validerInvitation(await req.json());
  } catch (e) {
    return json({ ok: false, erreur: e instanceof Error ? e.message : "Demande invalide." }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  // L'appelant, avec ses propres droits : administrateur, et son entreprise.
  const appelant = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: admin, error: errAdmin } = await appelant.rpc("suis_admin");
  if (errAdmin || admin !== true) return json({ ok: false, erreur: "Réservé à l’administrateur." }, 403);
  const { data: entreprise, error: errEntreprise } = await appelant.rpc("mon_entreprise");
  if (errEntreprise || !entreprise) return json({ ok: false, erreur: "Entreprise introuvable." }, 403);

  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  let planningId = demande.planning;
  if (planningId !== "nouveau") {
    const { data: pl } = await service.from("plannings").select("id").eq("id", planningId).eq("entreprise_id", entreprise).maybeSingle();
    if (!pl) return json({ ok: false, erreur: "Planning inconnu." }, 400);
  }

  const octets = new Uint8Array(12);
  crypto.getRandomValues(octets);
  const motDePasse = motDePasseProvisoire(octets);
  const { data: cree, error: errCree } = await service.auth.admin.createUser({
    email: demande.email,
    password: motDePasse,
    email_confirm: true,
    user_metadata: { changer_mot_de_passe: true, prenom: demande.prenom, nom: demande.nom },
  });
  if (errCree || !cree?.user) {
    const deja = /already|registered|exists/i.test(errCree?.message ?? "");
    return json({ ok: false, erreur: deja ? "Cette adresse a déjà un compte." : "Compte pas créé : " + (errCree?.message ?? "erreur inconnue") }, deja ? 409 : 500);
  }
  const userId = cree.user.id;
  try {
    if (planningId === "nouveau") {
      const { data: nouveau, error } = await service.rpc("creer_planning_", { p_entreprise: entreprise, p_nom: demande.nomPlanning });
      if (error || !nouveau) throw error ?? new Error("planning pas créé");
      planningId = nouveau as string;
    }
    const { error: errMembre } = await service.from("membres").insert({ user_id: userId, planning_id: planningId, role: "membre" });
    if (errMembre) throw errMembre;
    const { data: ent } = await service.from("entreprises").select("nom").eq("id", entreprise).maybeSingle();
    const { error: errProfil } = await service.from("profils").upsert({ user_id: userId, prenom: demande.prenom, nom: demande.nom, entreprise: ent?.nom ?? "" }, { onConflict: "user_id" });
    if (errProfil) throw errProfil;
  } catch (e) {
    await service.auth.admin.deleteUser(userId);
    if (demande.planning === "nouveau" && planningId !== "nouveau") await service.from("plannings").delete().eq("id", planningId);
    return json({ ok: false, erreur: "Compte pas créé : " + String((e as Error)?.message || e) }, 500);
  }
  return json({ ok: true, email: demande.email, mot_de_passe: motDePasse });
});
