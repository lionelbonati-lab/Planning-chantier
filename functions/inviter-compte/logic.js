// ============================================================
// inviter-compte — logique pure (round du 09.11.2026, suite 155). Testée
// par tests/test_suite155.js ; index.ts fait les appels réseau.
// ============================================================

var EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var UUID_VALIDE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Sans caractères qui se confondent (0/O, 1/l/I) : le mot de passe est
// recopié à la main.
var ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Valide { prenom, nom, email, planning: "nouveau" | id, nom_planning } ;
// jette un message lisible si elle ne va pas.
function validerInvitation(body) {
  var b = body || {};
  var prenom = String(b.prenom || "").trim(), nom = String(b.nom || "").trim();
  var email = String(b.email || "").trim().toLowerCase();
  if (!EMAIL_VALIDE.test(email) || email.length > 200) throw new Error("Adresse e-mail invalide.");
  if (!prenom && !nom) throw new Error("Indique au moins le prénom ou le nom.");
  if (prenom.length > 60 || nom.length > 60) throw new Error("Nom trop long.");
  var planning = String(b.planning || "");
  if (planning !== "nouveau" && !UUID_VALIDE.test(planning)) throw new Error("Planning inconnu.");
  var nomPlanning = String(b.nom_planning || "").trim().slice(0, 80) || (prenom + " " + nom).trim();
  return { prenom: prenom, nom: nom, email: email, planning: planning, nomPlanning: nomPlanning };
}

// Mot de passe provisoire « xxxx-xxxx-xxxx » tiré de 12 octets au hasard
// (crypto.getRandomValues côté serveur).
function motDePasseProvisoire(octets) {
  var t = "";
  for (var i = 0; i < 12; i++) {
    t += ALPHABET.charAt(octets[i] % ALPHABET.length);
    if (i === 3 || i === 7) t += "-";
  }
  return t;
}

export { validerInvitation, motDePasseProvisoire, ALPHABET };
