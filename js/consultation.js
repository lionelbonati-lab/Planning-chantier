"use strict";
/* ============================================================
   CONSULTATION EN LECTURE SEULE — round du 25.09.2026 (suite 51)
   ------------------------------------------------------------
   Page consultation.html?j=<jeton> (cf. son en-tête). Proposition 10 de
   Lionel : « un lien en lecture seule à donner aux ouvriers ou aux
   sous-traitants pour qu'ils voient leur planning sur leur téléphone ».

   Un seul appel : POST /rest/v1/rpc/consultation_planning avec la clé
   publique (anon) — pas de supabase-js, pas de connexion. La fonction
   (sql/0018) renvoie la semaine demandée de la personne du lien, bornée
   de 4 semaines en arrière à 26 en avant, ou null si le lien a été
   supprimé ou remplacé.

   Affichage : une carte par jour (lundi → vendredi, samedi/dimanche
   seulement s'ils ont quelque chose), Matin puis Après-midi, avec pour
   chaque tâche le texte, le chantier (sa couleur en fond), le statut,
   l'équipe quand la tâche vient d'elle. Fériés en bandeau, horaires du
   jour dans le titre (la dernière période qui contient la date l'emporte,
   même règle que l'appli). ‹ › changent de semaine, « Auj. » revient à
   celle d'aujourd'hui ; un glissement horizontal fait de même.
   ============================================================ */
(function () {
  // Même projet et même clé publique que js/core.js (clé « anon », faite
  // pour être dans une page web : elle ne donne accès qu'à ce que les
  // règles de la base autorisent — ici, la seule fonction de consultation).
  var SUPABASE_URL = "https://mvqvznohgtpulpgalvxl.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cXZ6bm9oZ3RwdWxwZ2FsdnhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0ODI2MDcsImV4cCI6MjEwNDA1ODYwN30.HJjw2evEw1ka1IQAPNgba8sA8qDNRWhPvd96Kx4DkUQ";

  var JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

  var params = new URLSearchParams(location.search);
  var jeton = params.get("j") || (location.hash || "").replace(/^#/, "");
  var donnees = null, demande = 0;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function dateDe(iso) { var p = iso.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function isoDe(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function plusJours(iso, n) { var d = dateDe(iso); d.setDate(d.getDate() + n); return isoDe(d); }
  function numeroSemaine(iso) {
    var d = dateDe(iso); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    var j4 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - j4) / 864e5 - 3 + (j4.getDay() + 6) % 7) / 7);
  }
  function jourMois(iso) { var d = dateDe(iso); return d.getDate() + " " + MOIS[d.getMonth()]; }
  // Couleur de fond lisible pour un texte foncé (les couleurs de chantier
  // sont des pastels ; une couleur absente ou invalide → fond neutre).
  function couleurSure(c) { return /^#[0-9a-f]{3,8}$/i.test(c || "") ? c : ""; }

  function message(titre, texte) {
    document.getElementById("contenu").innerHTML = '<p class="message"><b>' + esc(titre) + "</b>" + esc(texte) + "</p>";
  }

  function charger(lundi) {
    var n = ++demande;
    document.body.classList.add("chargement");
    return fetch(SUPABASE_URL + "/rest/v1/rpc/consultation_planning", {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_jeton: jeton, p_lundi: lundi || null })
    }).then(function (rep) {
      if (!rep.ok) throw new Error("HTTP " + rep.status);
      return rep.json();
    }).then(function (d) {
      if (n !== demande) return;
      document.body.classList.remove("chargement");
      if (!d) {
        document.getElementById("titreSemaine").textContent = "";
        ["btnPrecedente", "btnSuivante", "btnAujourdhui"].forEach(function (id) { document.getElementById(id).disabled = true; });
        message("Ce lien ne marche plus.", "Il a été remplacé ou supprimé. Demande le nouveau lien au bureau.");
        return;
      }
      donnees = d;
      afficher();
    }).catch(function () {
      if (n !== demande) return;
      document.body.classList.remove("chargement");
      message("Planning inaccessible.", "Vérifie ta connexion internet, puis recharge la page.");
    });
  }

  function horairesDu(iso) {
    var h = null;
    (donnees.horaires || []).forEach(function (p) { if (p.debut <= iso && iso <= p.fin) h = p; });
    return h ? h.matin + (h.aprem ? " · " + h.aprem : "") : "";
  }

  function htmlTache(t) {
    if (t.absence) {
      return '<div class="tache absence"><div class="texte">' + esc(t.texte || "Absent") + "</div></div>";
    }
    var fond = couleurSure(t.couleur);
    var details = [];
    if (t.chantier) details.push("<span>" + esc(t.chantier) + "</span>");
    if (t.statut) details.push('<span class="statut"' + (couleurSure(t.couleur_statut) ? ' style="--cs:' + t.couleur_statut + '"' : "") + ">" + esc(t.statut) + "</span>");
    if (t.equipe) details.push("<span>Équipe " + esc(t.equipe) + "</span>");
    return '<div class="tache"' + (fond ? ' style="--c:' + fond + '"' : "") + ">" +
      '<div class="texte">' + (t.important ? '<span class="important" title="Important">⚑ </span>' : "") + esc(t.texte || "(sans texte)") + "</div>" +
      (details.length ? '<div class="details">' + details.join("") + "</div>" : "") + "</div>";
  }

  function afficher() {
    var d = donnees;
    document.getElementById("nom").textContent = d.personne.nom;
    document.title = "Planning — " + d.personne.nom;
    var dimanche = plusJours(d.lundi, 6);
    document.getElementById("titreSemaine").innerHTML = "Semaine " + numeroSemaine(d.lundi) +
      "<small>" + esc(jourMois(d.lundi) + " – " + jourMois(dimanche) + " " + dateDe(dimanche).getFullYear()) + "</small>";
    document.getElementById("btnPrecedente").disabled = d.lundi <= d.min;
    document.getElementById("btnSuivante").disabled = d.lundi >= d.max;
    var lundiAujourdhui = plusJours(d.aujourdhui, -((dateDe(d.aujourdhui).getDay() + 6) % 7));
    document.getElementById("btnAujourdhui").disabled = d.lundi === lundiAujourdhui;

    var html = "";
    for (var i = 0; i < 7; i++) {
      var iso = plusJours(d.lundi, i);
      var taches = (d.taches || []).filter(function (t) { return t.date === iso; });
      var feries = (d.feries || []).filter(function (f) { return f.date === iso; });
      if (i >= 5 && !taches.length && !feries.length) continue;
      var heures = feries.length ? "" : horairesDu(iso);
      var auj = iso === d.aujourdhui;
      html += '<section class="jour' + (auj ? " aujourdhui" : "") + '" data-date="' + iso + '">' +
        '<div class="jour-titre"><span>' + JOURS[i] + " " + esc(jourMois(iso)) + (auj ? ' <span class="etiquette">Aujourd’hui</span>' : "") + "</span>" +
        (heures ? '<span class="heures">' + esc(heures) + "</span>" : "") + "</div>" +
        feries.map(function (f) { return '<div class="ferie">Férié — ' + esc(f.libelle || "") + "</div>"; }).join("");
      [["matin", "Matin"], ["aprem", "Après-midi"]].forEach(function (dm) {
        var liste = taches.filter(function (t) { return t.demi === dm[0]; });
        if (feries.length && !liste.length) return;
        html += '<div class="demi demi-' + dm[0] + '"><div class="demi-nom">' + dm[1] + "</div>" +
          '<div class="taches">' + (liste.length ? liste.map(htmlTache).join("") : '<span class="vide">—</span>') + "</div></div>";
      });
      html += "</section>";
    }
    html += '<p class="pied">Planning tenu à jour par le bureau : recharge la page pour voir les derniers changements.</p>';
    document.getElementById("contenu").innerHTML = html;
    var carteAuj = document.querySelector(".jour.aujourdhui");
    if (carteAuj && !afficher.dejaDefile) { afficher.dejaDefile = true; carteAuj.scrollIntoView({ block: "center" }); }
  }

  function changerSemaine(n) {
    if (!donnees) return;
    var cible = plusJours(donnees.lundi, 7 * n);
    if (cible < donnees.min || cible > donnees.max) return;
    charger(cible);
  }
  document.getElementById("btnPrecedente").addEventListener("click", function () { changerSemaine(-1); });
  document.getElementById("btnSuivante").addEventListener("click", function () { changerSemaine(1); });
  document.getElementById("btnAujourdhui").addEventListener("click", function () { charger(null); });

  // Glissement horizontal franc (≥ 60 px, plus horizontal que vertical).
  var depart = null;
  document.addEventListener("touchstart", function (e) { depart = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (!depart || !e.changedTouches.length) return;
    var dx = e.changedTouches[0].clientX - depart.x, dy = e.changedTouches[0].clientY - depart.y;
    depart = null;
    if (Math.abs(dx) >= 60 && Math.abs(dx) > 2 * Math.abs(dy)) changerSemaine(dx < 0 ? 1 : -1);
  }, { passive: true });

  if (!/^[0-9a-f]{32}$/i.test(jeton || "")) {
    ["btnPrecedente", "btnSuivante", "btnAujourdhui"].forEach(function (id) { document.getElementById(id).disabled = true; });
    document.getElementById("titreSemaine").textContent = "";
    message("Lien incomplet.", "Ouvre le lien reçu tel quel, sans le couper.");
  } else {
    charger(null);
  }
})();
