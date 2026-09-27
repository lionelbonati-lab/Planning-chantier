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

   DEMANDES D'ABSENCE — round du 27.09.2026 (suite 69). Lionel : « Le lien
   de consultation des ouvriers doit pouvoir ajouter une absence que je
   doit valider dans mon planning. » Bloc « Mes absences » en tête de page
   (personnel seulement : ni intervenant ni équipe, peut_demander) :
   « Demander une absence » ouvre un petit formulaire — type (entrées
   rapides d'absence de l'appli, sinon Congé / Vacances / Maladie), du …
   (matin / après-midi) au … (matin / après-midi), motif (suite 80 ; avant
   « remarque ») —, envoyé par
   consultation_demander_absence (sql/0020). Rien n'est écrit dans le
   planning : la demande attend l'accord du bureau (js/demandes-absence.js
   côté appli). La liste montre les demandes en attente (« Retirer »
   possible) et celles traitées depuis moins de 30 jours (acceptée /
   refusée) ; une demande en attente apparaît aussi, en pointillés, dans
   les demi-journées qu'elle couvre.
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

  // ---- Demandes d'absence (suite 69, cf. en-tête) ----------------------
  var formulaireOuvert = false, envoiEnCours = false;
  var LIBELLE_STATUT = { en_attente: "En attente", acceptee: "Acceptée", refusee: "Refusée" };
  function jourCourt(iso) { return JOURS[(dateDe(iso).getDay() + 6) % 7].slice(0, 3).toLowerCase() + ". " + jourMois(iso); }
  // « Congé - Motif », comme la bulle posée dans le planning à
  // l'acceptation (suite 80, cf. texteDemandeAbsence dans l'appli).
  function texteDemande(q) {
    var motif = (q.remarque || "").trim();
    return motif ? q.motif + " - " + motif : q.motif;
  }
  function libelleDemande(q) {
    var dm = function (demi) { return demi === "aprem" ? "après-midi" : "matin"; };
    if (q.debut === q.fin) {
      return jourCourt(q.debut) + (q.demi_debut === q.demi_fin ? " " + dm(q.demi_debut) : "");
    }
    return "du " + jourCourt(q.debut) + (q.demi_debut === "aprem" ? " après-midi" : "") +
      " au " + jourCourt(q.fin) + (q.demi_fin === "matin" ? " matin" : "");
  }
  function demandeCouvre(q, iso, demi) {
    if (iso < q.debut || iso > q.fin) return false;
    if (iso === q.debut && q.demi_debut === "aprem" && demi === "matin") return false;
    if (iso === q.fin && q.demi_fin === "matin" && demi === "aprem") return false;
    return true;
  }
  function htmlDemandes() {
    var d = donnees;
    if (!d.peut_demander) return "";
    var liste = d.demandes || [];
    var motifs = (d.motifs && d.motifs.length ? d.motifs : ["Congé", "Vacances", "Maladie"]);
    var debutDefaut = d.lundi > d.aujourdhui ? d.lundi : d.aujourdhui;
    var html = '<section class="absences" id="blocAbsences"><div class="absences-titre"><span>Mes absences</span>' +
      (formulaireOuvert ? "" : '<button type="button" class="btn-demander" id="btnDemanderAbsence">Demander une absence</button>') + "</div>";
    if (formulaireOuvert) {
      var choixDemi = function (id, val) {
        return '<select id="' + id + '"><option value="matin"' + (val === "matin" ? " selected" : "") + ">Matin</option>" +
          '<option value="aprem"' + (val === "aprem" ? " selected" : "") + ">Après-midi</option></select>";
      };
      html += '<form class="form-absence" id="formAbsence" novalidate>' +
        // Suite 80 — Lionel : « Motif à la place de remarque. » Le choix
        // Congé / Vacances… devient le « Type » ; le texte libre, le
        // « Motif » (id et colonne `remarque` inchangés). Bulle posée à
        // l'acceptation : « Congé - Motif » (texteDemandeAbsence, appli).
        '<label>Type<select id="faMotif">' + motifs.map(function (m) { return "<option>" + esc(m) + "</option>"; }).join("") + "</select></label>" +
        '<div class="fa-ligne"><label>Du<input type="date" id="faDebut" required min="' + d.aujourdhui + '" value="' + debutDefaut + '"></label>' + choixDemi("faDemiDebut", "matin") + "</div>" +
        '<div class="fa-ligne"><label>Au<input type="date" id="faFin" required min="' + d.aujourdhui + '" value="' + debutDefaut + '"></label>' + choixDemi("faDemiFin", "aprem") + "</div>" +
        '<label>Motif <small>(facultatif)</small><textarea id="faRemarque" rows="2" maxlength="300" placeholder="Ex. : rendez-vous médical"></textarea></label>' +
        '<p class="fa-erreur" id="faErreur" hidden></p>' +
        '<div class="fa-actions"><button type="button" class="btn-secondaire" id="faAnnuler">Annuler</button>' +
        '<button type="submit" class="btn-demander" id="faEnvoyer">Envoyer la demande</button></div>' +
        '<p class="fa-aide">Le bureau doit la valider : elle n’apparaît dans le planning qu’une fois acceptée.</p></form>';
    }
    if (liste.length) {
      html += '<ul class="demandes">' + liste.map(function (q) {
        return '<li class="demande-' + esc(q.statut) + '"><div><b>' + esc(texteDemande(q)) + "</b> — " + esc(libelleDemande(q)) + "</div>" +
          '<span class="etat">' + esc(LIBELLE_STATUT[q.statut] || q.statut) + "</span>" +
          (q.statut === "en_attente" ? '<button type="button" class="btn-retirer" data-id="' + esc(q.id) + '">Retirer</button>' : "") + "</li>";
      }).join("") + "</ul>";
    } else if (!formulaireOuvert) {
      html += '<p class="absences-vide">Aucune demande en cours.</p>';
    }
    return html + "</section>";
  }
  function appelRpc(nom, corps) {
    return fetch(SUPABASE_URL + "/rest/v1/rpc/" + nom, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(corps)
    }).then(function (rep) {
      if (!rep.ok) throw new Error("HTTP " + rep.status);
      return rep.json();
    });
  }
  function cablerDemandes() {
    var btn = document.getElementById("btnDemanderAbsence");
    if (btn) btn.addEventListener("click", function () { formulaireOuvert = true; afficher(); var m = document.getElementById("faMotif"); if (m) m.focus(); });
    var form = document.getElementById("formAbsence");
    if (form) {
      var debut = document.getElementById("faDebut"), fin = document.getElementById("faFin");
      debut.addEventListener("change", function () { if (fin.value < debut.value) fin.value = debut.value; });
      var masquerErreur = function () { document.getElementById("faErreur").hidden = true; };
      form.addEventListener("input", masquerErreur);
      form.addEventListener("change", masquerErreur);
      document.getElementById("faAnnuler").addEventListener("click", function () { formulaireOuvert = false; afficher(); });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (envoiEnCours) return;
        var erreur = document.getElementById("faErreur");
        var montrer = function (t) { erreur.textContent = t; erreur.hidden = false; };
        var corps = {
          p_jeton: jeton, p_debut: debut.value, p_fin: fin.value,
          p_demi_debut: document.getElementById("faDemiDebut").value, p_demi_fin: document.getElementById("faDemiFin").value,
          p_motif: document.getElementById("faMotif").value, p_remarque: document.getElementById("faRemarque").value
        };
        if (!corps.p_debut || !corps.p_fin) return montrer("Choisis les dates.");
        if (corps.p_fin < corps.p_debut) return montrer("La fin est avant le début.");
        if (corps.p_debut === corps.p_fin && corps.p_demi_debut === "aprem" && corps.p_demi_fin === "matin") return montrer("Le même jour : de l’après-midi au matin, ce n’est pas possible.");
        envoiEnCours = true;
        document.getElementById("faEnvoyer").disabled = true;
        appelRpc("consultation_demander_absence", corps).then(function (r) {
          envoiEnCours = false;
          if (!r || !r.ok) { document.getElementById("faEnvoyer").disabled = false; montrer((r && r.erreur) || "Demande refusée par le serveur."); return; }
          formulaireOuvert = false;
          return charger(donnees.lundi);
        }).catch(function () {
          envoiEnCours = false;
          document.getElementById("faEnvoyer").disabled = false;
          montrer("Envoi impossible : vérifie ta connexion internet.");
        });
      });
    }
    document.querySelectorAll("#blocAbsences .btn-retirer").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("Retirer cette demande d’absence ?")) return;
        b.disabled = true;
        appelRpc("consultation_annuler_demande", { p_jeton: jeton, p_id: +b.dataset.id }).then(function () { return charger(donnees.lundi); })
          .catch(function () { b.disabled = false; window.alert("Impossible de retirer la demande : vérifie ta connexion internet."); });
      });
    });
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

    var html = htmlDemandes();
    var enAttente = (d.demandes || []).filter(function (q) { return q.statut === "en_attente"; });
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
        var demandes = enAttente.filter(function (q) { return demandeCouvre(q, iso, dm[0]); });
        if (feries.length && !liste.length) return;
        html += '<div class="demi demi-' + dm[0] + '"><div class="demi-nom">' + dm[1] + "</div>" +
          '<div class="taches">' + (liste.length || demandes.length ? liste.map(htmlTache).join("") + demandes.map(function (q) {
            return '<div class="tache demande"><div class="texte">' + esc(texteDemande(q)) + '</div><div class="details"><span>Demande d’absence en attente</span></div></div>';
          }).join("") : '<span class="vide">—</span>') + "</div></div>";
      });
      html += "</section>";
    }
    html += '<p class="pied">Planning tenu à jour par le bureau : recharge la page pour voir les derniers changements.</p>';
    // Formulaire ouvert pendant un changement de semaine : ce qui est déjà
    // saisi est gardé.
    var saisie = {};
    ["faMotif", "faDebut", "faDemiDebut", "faFin", "faDemiFin", "faRemarque"].forEach(function (id) {
      var c = document.getElementById(id);
      if (c) saisie[id] = c.value;
    });
    document.getElementById("contenu").innerHTML = html;
    Object.keys(saisie).forEach(function (id) { var c = document.getElementById(id); if (c) c.value = saisie[id]; });
    cablerDemandes();
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
