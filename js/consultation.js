"use strict";
/* ============================================================
   CONSULTATION EN LECTURE SEULE — round du 25.09.2026 (suite 51)
   ------------------------------------------------------------
   Page consultation.html?j=<jeton> (cf. son en-tête). Proposition 10 de
   Lionel : « un lien en lecture seule à donner aux ouvriers ou aux
   sous-traitants pour qu'ils voient leur planning sur leur téléphone ».

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
   même règle que l'appli). ‹ › changent de semaine, « Auj. » revient à
   celle d'aujourd'hui ; un glissement horizontal fait de même.

   DEMANDES D'ABSENCE — round du 27.09.2026 (suite 69). Lionel : « Le lien
   de consultation des ouvriers doit pouvoir ajouter une absence que je
   doit valider dans mon planning. » Bloc « Mes absences » en tête de page
   (personnel seulement : ni intervenant ni équipe, peut_demander) :
   « Demander une absence » ouvre un petit formulaire — type (entrées
   rapides d'absence de l'appli, sinon Congé / Vacances / Maladie), du …
   (matin / après-midi) au … (matin / après-midi), motif (suite 80 ; avant
   « remarque ») —, envoyé par
   consultation_demander_absence (sql/0020). Rien n'est écrit dans le
   planning : la demande attend l'accord du bureau (js/demandes-absence.js
   côté appli). La liste montre les demandes en attente (« Retirer »
   possible) et celles traitées depuis moins de 30 jours (acceptée /
   refusée) ; une demande en attente apparaît aussi, en pointillés, dans
   les demi-journées qu'elle couvre.

   Round du 27.09.2026 (suite 83) : le bloc « Mes absences » laisse la
   place à une barre du bas (« Demander une absence » + cloche « Mes
   demandes ») et à deux feuilles qui montent du bas ; modifier / retirer
   une demande en attente, modifier / annuler une absence acceptée,
   nouvelle demande / supprimer une demande refusée ou une absence
   supprimée (détail plus bas, sql/0021). « Recharge la page pour voir les
   derniers changements. » passe dans l'en-tête.

   Round du 27.09.2026 (suite 86) — Lionel : « Pouvoir gérer les séries
   dans les demande de congé. » Le formulaire a « Répéter » (non, chaque
   semaine, toutes les 2/3/4 semaines, chaque mois, tous les 2/3 mois) et
   « Jusqu'au » : la demande garde la première absence et la règle
   (sql/0022). Liste : « chaque semaine jusqu'au … » ; pointillés sur
   chaque occurrence en attente ; une série se modifie / s'annule d'un
   bloc tant que sa dernière absence n'est pas passée (modifier une série
   commencée repart de sa prochaine absence).

   Round du 27.09.2026 (suite 87) — Lionel : « Un ouvrier doit pouvoir
   modifier une serie ou juste un des éléments. Les congés placés par le
   bureau doivent aussi apparaître dans la liste des congés de
   l'ouvrier. » (sql/0023)
     - série acceptée : Modifier / Annuler demandent « Quoi » — toute la
       série, ou une de ses absences à venir (demande avec cible_debut ;
       le bureau ne touche qu'à celle-là) ; la série note ses absences à
       part (« Sauf : lun. 5 oct. (annulée) ») ;
     - absences posées directement par le bureau (sans demande) : listées
       dans « Mes demandes » (« Posée par le bureau », demi-journées qui se
       suivent regroupées), modifiables / annulables comme une absence
       acceptée (consultation_changer_absence_bureau).
   ============================================================ */
(function () {
  // Même projet et même clé publique que js/core.js (clé « anon », faite
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
  // Suite 83 — Lionel : « Faire une barre de menu en bas. Y placer le
  // bouton pour le formulaire de demande de congé. Cloche Notifications à
  // droite pour voir l'état des demande de vacances. » Le bloc « Mes
  // absences » en tête de page devient :
  //   - la barre du bas (#barreBas) : « Demander une absence » + la cloche,
  //     dont le compteur = demandes traitées que l'ouvrier n'a pas encore
  //     vues (acceptée, refusée, annulée, supprimée — mémoire de l'appareil) ;
  //   - deux feuilles qui montent du bas (#feuille) : le formulaire, et
  //     « Mes demandes » (la liste, avec les gestes de chaque demande).
  // Et les gestes demandés :
  //   « Possibilité de modifier en plus de retirer avant consultation » →
  //     demande en attente : Modifier (corrigée sur place) / Retirer ;
  //   « modifier (nouvelle demande d'approbation) ou annuler (Notification
  //     dans console bureau) une absence validé » → absence acceptée à venir :
  //     Modifier (demande « modification », l'absence reste posée jusqu'à la
  //     réponse) / Annuler l'absence (demande « annulation », dans les
  //     notifications du bureau) ;
  //   « faire une nouvelle demande ou supprimer des notifications une
  //     absence supprimée » → refusée, annulée, ou absence retirée du
  //     planning par le bureau : Nouvelle demande (formulaire pré-rempli) /
  //     Supprimer (masquée de la liste).
  // Serveur : sql/0020 et sql/0021_demandes_absence_modifier.sql.
  var envoiEnCours = false;
  var feuilleOuverte = null;          // null, "formulaire" ou "demandes"
  var CLE_VUS = "consultation.vus." + jeton;
  var vus = (function () { try { return JSON.parse(localStorage.getItem(CLE_VUS) || "[]") || []; } catch (e) { return []; } })();
  function jourCourt(iso) { return JOURS[(dateDe(iso).getDay() + 6) % 7].slice(0, 3).toLowerCase() + ". " + jourMois(iso); }
  // « Congé - Motif », comme la bulle posée dans le planning à
  // l'acceptation (suite 80, cf. texteDemandeAbsence dans l'appli).
  function texteDemande(q) {
    if (q.bureau) return q.texte || "Absence";
    var motif = (q.remarque || "").trim();
    return motif ? q.motif + " - " + motif : q.motif;
  }
  function libelleDemande(q) {
    var dm = function (demi) { return demi === "aprem" ? "après-midi" : "matin"; };
    var serie = estSerie(q) ? ", " + libelleRepetition(q.serie_frequence, q.serie_intervalle) + " jusqu’au " + jourCourt(q.serie_fin) : "";
    if (q.debut === q.fin) {
      return jourCourt(q.debut) + (q.demi_debut === q.demi_fin ? " " + dm(q.demi_debut) : "") + serie;
    }
    return "du " + jourCourt(q.debut) + (q.demi_debut === "aprem" ? " après-midi" : "") +
      " au " + jourCourt(q.fin) + (q.demi_fin === "matin" ? " matin" : "") + serie;
  }
  // ---- Suite 86 : séries (même calcul que occurrencesDemandeAbsence_,
  // js/demandes-absence.js, et que le serveur, sql/0022) ----
  function estSerie(q) { return !!(q && (q.serie_frequence === "semaine" || q.serie_frequence === "mois") && q.serie_fin); }
  function libelleRepetition(freq, intervalle) {
    var n = Math.max(1, +intervalle || 1);
    if (freq === "mois") return n === 1 ? "chaque mois" : "tous les " + n + " mois";
    return n === 1 ? "chaque semaine" : "toutes les " + n + " semaines";
  }
  // k × N semaines, ou k × N mois au même quantième (ramené au dernier
  // jour d'un mois plus court).
  function pas(iso, freq, n) {
    if (freq !== "mois") return plusJours(iso, 7 * n);
    var d = dateDe(iso), jour = d.getDate(), m = d.getMonth() + n;
    var dernier = new Date(d.getFullYear(), m + 1, 0).getDate();
    return isoDe(new Date(d.getFullYear(), m, Math.min(jour, dernier)));
  }
  function occurrences(q) {
    if (!estSerie(q)) return [{ debut: q.debut, fin: q.fin }];
    var duree = Math.round((dateDe(q.fin) - dateDe(q.debut)) / 864e5), n = Math.max(1, +q.serie_intervalle || 1), out = [];
    for (var k = 0; k < 60; k++) {
      var debut = pas(q.debut, q.serie_frequence, k * n);
      if (debut > q.serie_fin) break;
      out.push({ debut: debut, fin: plusJours(debut, duree) });
    }
    return out;
  }
  function finDerniere(q) { var o = occurrences(q); return o[o.length - 1].fin; }
  function demandeCouvre(q, iso, demi) {
    // Série : week-ends sautés (comme les absences posées par le bureau).
    if (estSerie(q) && dateDe(iso).getDay() % 6 === 0) return false;
    return occurrences(q).some(function (o) {
      if (iso < o.debut || iso > o.fin) return false;
      if (iso === o.debut && q.demi_debut === "aprem" && demi === "matin") return false;
      if (iso === o.fin && q.demi_fin === "matin" && demi === "aprem") return false;
      return true;
    });
  }
  function typeDe(q) { return q.type || "nouvelle"; }
  function demandeParId(id) { return (donnees.demandes || []).filter(function (x) { return x.id === id; })[0] || null; }
  function changementEnAttente(q) {
    return (donnees.demandes || []).some(function (x) { return x.statut === "en_attente" && x.remplace_id === q.id && !x.cible_debut; });
  }
  // ---- Suite 87 : une seule absence d'une série, absences du bureau ----
  // Demandes qui visent une seule absence de la série q (en attente ou
  // acceptées : cette absence n'est plus proposée).
  function enfantsCible(q) {
    return (donnees.demandes || []).filter(function (x) {
      return x.remplace_id === q.id && x.cible_debut && (x.statut === "en_attente" || x.statut === "acceptee");
    });
  }
  function ouvre(o) {
    for (var iso = o.debut; iso <= o.fin; iso = plusJours(iso, 1)) if (dateDe(iso).getDay() % 6) return true;
    return false;
  }
  // Absences à venir de la série que l'ouvrier peut encore viser une à
  // une : ni passées, ni déjà visées, pas tout en week-end (rien de posé).
  function occurrencesLibres(q) {
    var prises = enfantsCible(q).map(function (x) { return x.cible_debut; });
    return occurrences(q).filter(function (o) { return o.fin >= donnees.aujourdhui && prises.indexOf(o.debut) < 0 && ouvre(o); });
  }
  // Toute la série : pas pendant qu'une de ses absences attend le bureau
  // (le serveur refuserait).
  function serieEntiereLibre(q) {
    return !enfantsCible(q).some(function (x) { return x.statut === "en_attente"; });
  }
  function libellePlage(debut, fin, demiDebut, demiFin) {
    return libelleDemande({ debut: debut, fin: fin, demi_debut: demiDebut || "matin", demi_fin: demiFin || "aprem" });
  }
  function jourOuvreSuivant(iso) {
    var n = plusJours(iso, 1);
    while (dateDe(n).getDay() % 6 === 0) n = plusJours(n, 1);
    return n;
  }
  // Absences posées par le bureau sans demande (donnees.absences, de
  // aujourd'hui à dans un an) : demi-journées qui se suivent (week-end
  // sauté) avec le même texte → un bloc. Écartées : celles d'une demande
  // acceptée (déjà listée) et celles visées par une demande en attente
  // (listée à sa place, « Avant : … »).
  function blocsBureau() {
    var d = donnees, dem = d.demandes || [];
    var acceptees = dem.filter(function (q) { return q.statut === "acceptee" && typeDe(q) !== "annulation"; });
    var visees = dem.filter(function (q) { return q.statut === "en_attente" && !q.remplace_id && q.cible_debut; }).map(function (q) {
      return { debut: q.cible_debut, fin: q.cible_fin || q.cible_debut, demi_debut: q.cible_demi_debut || "matin", demi_fin: q.cible_demi_fin || "aprem" };
    });
    var vus = {}, blocs = [], b = null;
    (d.absences || []).forEach(function (a) {
      var cle = a.date + ":" + a.demi;
      if (vus[cle]) return;
      vus[cle] = true;
      if (acceptees.some(function (q) { return demandeCouvre(q, a.date, a.demi); })) return;
      if (visees.some(function (q) { return demandeCouvre(q, a.date, a.demi); })) return;
      var texte = a.texte || "Absence";
      var suite = b && b.texte === texte && !!b.serie === !!a.serie && (a.demi === "aprem" ? b.fin === a.date && b.demi_fin === "matin"
        : b.demi_fin === "aprem" && jourOuvreSuivant(b.fin) === a.date) && dateDe(a.date) - dateDe(b.debut) < 60 * 864e5;
      if (suite) { b.fin = a.date; b.demi_fin = a.demi; return; }
      b = { bureau: true, id: "b" + a.date + a.demi, debut: a.date, fin: a.date, demi_debut: a.demi, demi_fin: a.demi,
        texte: texte, serie: !!a.serie, statut: "acceptee", type: "nouvelle" };
      blocs.push(b);
    });
    return blocs;
  }
  // État affiché : clé (classe, mémoire des demandes vues) et libellé.
  function etatDemande(q) {
    if (q.bureau) return { cle: "bureau", libelle: "Posée par le bureau" };
    var t = typeDe(q);
    if (q.statut === "en_attente") return { cle: "en_attente", libelle: t === "modification" ? "Modification en attente" : t === "annulation" ? "Annulation en attente" : "En attente" };
    if (q.statut === "acceptee") return q.supprimee ? { cle: "supprimee", libelle: "Supprimée" } : { cle: "acceptee", libelle: "Acceptée" };
    if (q.statut === "refusee") return { cle: "refusee", libelle: t === "modification" ? "Modification refusée" : t === "annulation" ? "Annulation refusée" : "Refusée" };
    if (q.statut === "annulee") return { cle: "annulee", libelle: "Annulée" };
    return { cle: q.statut, libelle: q.statut };
  }
  // Une absence acceptée dont une modification ou une annulation attend le
  // bureau n'est montrée qu'une fois : par la demande en attente.
  // Suite 87 : + les absences posées par le bureau ; l'annulation acceptée
  // d'une seule absence n'est plus montrée (l'absence a disparu, la série
  // la note « Sauf : … »).
  function demandesVisibles() {
    return (donnees.demandes || []).filter(function (q) {
      if (q.statut === "acceptee" && changementEnAttente(q)) return false;
      return !(typeDe(q) === "annulation" && q.statut === "acceptee" && q.cible_debut);
    }).concat(blocsBureau()).sort(function (a, b) { return a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0; });
  }
  function cleVue(q) { return q.id + ":" + etatDemande(q).cle; }
  function nonVues() {
    return demandesVisibles().filter(function (q) { return !q.bureau && q.statut !== "en_attente" && vus.indexOf(cleVue(q)) < 0; });
  }
  function marquerVues() {
    vus = demandesVisibles().filter(function (q) { return !q.bureau && q.statut !== "en_attente"; }).map(cleVue);
    try { localStorage.setItem(CLE_VUS, JSON.stringify(vus)); } catch (e) { /* mémoire indisponible : gardée pour cette visite */ }
  }
  function gestesDemande(q) {
    var e = etatDemande(q).cle, t = typeDe(q), g = [];
    if (q.statut === "en_attente") {
      if (t !== "annulation") g.push(["modifier", "Modifier"]);
      g.push(["retirer", "Retirer", 1]);
    } else if (e === "bureau") {
      if (q.fin >= donnees.aujourdhui) { g.push(["modifier", "Modifier"]); g.push(["annuler", "Annuler l’absence", 1]); }
    } else if (e === "acceptee") {
      // Suite 87 : série → « Annuler… » demande quoi (toute la série ou une
      // de ses absences).
      var libres = estSerie(q) ? occurrencesLibres(q).length > 0 || serieEntiereLibre(q) : true;
      if (finDerniere(q) >= donnees.aujourdhui && libres) { g.push(["modifier", "Modifier"]); g.push(["annuler", estSerie(q) ? "Annuler…" : "Annuler l’absence", 1]); }
    } else {
      if (e !== "annulee" && t !== "annulation") g.push(["nouvelle", "Nouvelle demande"]);
      g.push(["masquer", "Supprimer", 1]);
    }
    return g;
  }
  function htmlListeDemandes(aSignaler) {
    var liste = demandesVisibles();
    if (!liste.length) return '<p class="demandes-vide">Aucune demande d’absence.</p>';
    return '<ul class="demandes">' + liste.map(function (q) {
      var e = etatDemande(q), t = typeDe(q), orig = q.remplace_id ? demandeParId(q.remplace_id) : null, note = "";
      // Suite 87 : demande qui vise une seule absence (d'une série, ou
      // posée par le bureau).
      var provenance = q.cible_debut ? (q.remplace_id ? " (une absence de la série)" : " (posée par le bureau)") : "";
      if (t === "modification" && q.statut !== "acceptee" && q.cible_debut) {
        var avant = q.cible_texte || (orig ? texteDemande(orig) : "");
        note = "Avant : " + (avant && avant !== texteDemande(q) ? avant + " — " : "") +
          libellePlage(q.cible_debut, q.cible_fin, q.cible_demi_debut, q.cible_demi_fin) + provenance;
      } else if (t === "modification" && q.statut !== "acceptee" && orig) {
        note = "Avant : " + (texteDemande(orig) !== texteDemande(q) ? texteDemande(orig) + " — " : "") + libelleDemande(orig);
      } else if (t === "modification" && q.cible_debut) {
        note = q.remplace_id ? "Remplace l’absence du " + jourCourt(q.cible_debut) + " de la série." : "Remplace une absence posée par le bureau.";
      } else if (t === "annulation") {
        note = (q.statut === "en_attente" ? "Le bureau est prévenu : il retire l’absence du planning." : "L’absence reste dans le planning.") +
          (q.cible_debut ? " Seulement celle-ci" + provenance + "." : "");
      } else if (e.cle === "supprimee") {
        note = "Retirée du planning par le bureau.";
      } else if (q.bureau && q.serie) {
        note = "Absence répétée par le bureau : seule celle-ci change.";
      }
      if (estSerie(q) && q.statut === "acceptee") {
        var enfants = enfantsCible(q).slice().sort(function (a, b) { return a.cible_debut < b.cible_debut ? -1 : 1; });
        var sauf = enfants.filter(function (x) { return x.statut === "acceptee"; }).map(function (x) {
          return jourCourt(x.cible_debut) + (typeDe(x) === "annulation" ? " (annulée)" : " (modifiée)");
        });
        var attente = enfants.filter(function (x) { return x.statut === "en_attente"; }).map(function (x) {
          return jourCourt(x.cible_debut) + (typeDe(x) === "annulation" ? " (annulation)" : " (modification)");
        });
        var parts = [];
        if (sauf.length) parts.push("Sauf : " + sauf.join(", ") + ".");
        if (attente.length) parts.push("En attente du bureau : " + attente.join(", ") + ".");
        if (parts.length) note = (note ? note + " " : "") + parts.join(" ");
      }
      return '<li class="demande-' + esc(e.cle) + (aSignaler.indexOf(q) >= 0 ? " non-vu" : "") + '" data-id="' + esc(q.id) + '">' +
        '<div class="dq-texte"><b>' + esc(texteDemande(q)) + "</b><span>" + esc(libelleDemande(q)) + "</span>" + (note ? "<small>" + esc(note) + "</small>" : "") + "</div>" +
        '<span class="etat">' + esc(e.libelle) + "</span>" +
        '<div class="dq-actions">' + gestesDemande(q).map(function (g) {
          return '<button type="button" class="btn-action' + (g[2] ? " danger" : "") + '" data-action="' + g[0] + '">' + esc(g[1]) + "</button>";
        }).join("") + "</div></li>";
    }).join("") + "</ul>";
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

  // ---- Feuilles (formulaire, « Mes demandes ») --------------------------
  function ouvrirFeuille(nom, titre, html) {
    feuilleOuverte = nom;
    document.getElementById("feuilleTitre").textContent = titre;
    document.getElementById("feuilleCorps").innerHTML = html;
    document.getElementById("feuille").hidden = false;
    document.getElementById("feuilleFond").hidden = false;
    document.body.classList.add("feuille-ouverte");
  }
  function fermerFeuille() {
    feuilleOuverte = null;
    document.getElementById("feuille").hidden = true;
    document.getElementById("feuilleFond").hidden = true;
    document.body.classList.remove("feuille-ouverte");
  }
  function majBarreBas() {
    var d = donnees, barre = document.getElementById("barreBas");
    barre.hidden = !d.peut_demander;
    document.body.classList.toggle("avec-barre-bas", !!d.peut_demander);
    var n = d.peut_demander ? nonVues().length : 0, badge = document.getElementById("compteNotifications");
    badge.textContent = n;
    badge.hidden = !n;
    var titre = "Mes demandes d’absence" + (n ? " — " + n + " réponse" + (n > 1 ? "s" : "") + " à voir" : "");
    var cloche = document.getElementById("btnNotifications");
    cloche.title = titre;
    cloche.setAttribute("aria-label", titre);
  }

  function ouvrirDemandes() {
    var aSignaler = nonVues();
    ouvrirFeuille("demandes", "Mes demandes d’absence", "");
    dessinerDemandes(aSignaler);
    marquerVues();
    majBarreBas();
  }
  function dessinerDemandes(aSignaler) {
    var corps = document.getElementById("feuilleCorps");
    var liste = demandesVisibles();
    corps.innerHTML = htmlListeDemandes(aSignaler || []);
    corps.querySelectorAll(".demandes li").forEach(function (li) {
      var q = liste.filter(function (x) { return String(x.id) === li.dataset.id; })[0] || null;
      li.querySelectorAll("[data-action]").forEach(function (b) {
        b.addEventListener("click", function () { gesteDemande(q, b.dataset.action, b); });
      });
    });
  }
  function gesteDemande(q, geste, bouton) {
    if (!q) return;
    if (geste === "modifier") return ouvrirFormulaire(q, q.bureau ? "bureau" : "modifier");
    if (geste === "nouvelle") return ouvrirFormulaire(q, "refaire");
    if (geste === "annuler" && estSerie(q)) return ouvrirAnnulationSerie(q);
    if (geste === "annuler" && q.bureau) {
      if (!window.confirm("Annuler cette absence ? Le bureau est prévenu et la retire du planning.")) return;
      bouton.disabled = true;
      return appelRpc("consultation_changer_absence_bureau", { p_jeton: jeton, p_action: "annulation",
        p_cible_debut: q.debut, p_cible_fin: q.fin, p_cible_demi_debut: q.demi_debut, p_cible_demi_fin: q.demi_fin }).then(function (r) {
        if (!r || r.ok === false) { bouton.disabled = false; window.alert((r && r.erreur) || "Impossible d’annuler l’absence."); return; }
        return charger(donnees.lundi);
      }).catch(function () { bouton.disabled = false; window.alert("Impossible d’annuler l’absence : vérifie ta connexion internet."); });
    }
    var appel = {
      retirer: ["Retirer cette demande d’absence ?", "consultation_annuler_demande", "Impossible de retirer la demande"],
      annuler: ["Annuler cette absence ? Le bureau est prévenu et la retire du planning.", "consultation_annuler_absence", "Impossible d’annuler l’absence"],
      masquer: [null, "consultation_masquer_demande", "Impossible de supprimer la demande"]
    }[geste];
    if (!appel || (appel[0] && !window.confirm(appel[0]))) return;
    bouton.disabled = true;
    appelRpc(appel[1], { p_jeton: jeton, p_id: q.id }).then(function (r) {
      if (r && r.ok === false) { bouton.disabled = false; window.alert(r.erreur || appel[2] + "."); return; }
      return charger(donnees.lundi);
    }).catch(function () { bouton.disabled = false; window.alert(appel[2] + " : vérifie ta connexion internet."); });
  }

  // Suite 87 : « Quoi » — options de la liste « Quoi » d'une série
  // acceptée : toute la série (si possible) puis chaque absence libre.
  function optionsPortee(q) {
    var o = serieEntiereLibre(q) ? [["", "Toute la série (les absences à venir)"]] : [];
    return o.concat(occurrencesLibres(q).map(function (x) { return [x.debut, "Seulement : " + libellePlage(x.debut, x.fin, q.demi_debut, q.demi_fin)]; }));
  }
  function htmlPortee(q) {
    return '<label>Quoi<select id="faPortee">' + optionsPortee(q).map(function (c) {
      return '<option value="' + c[0] + '">' + esc(c[1]) + "</option>";
    }).join("") + "</select></label>";
  }
  function ouvrirAnnulationSerie(q) {
    var retour = feuilleOuverte === "demandes";
    ouvrirFeuille("formulaire", "Annuler une absence", '<form class="form-absence" id="formAnnulation" novalidate>' +
      '<p class="fa-origine">Série acceptée : ' + esc(texteDemande(q)) + " — " + esc(libelleDemande(q)) + "</p>" + htmlPortee(q) +
      '<p class="fa-erreur" id="faErreur" hidden></p>' +
      '<div class="fa-actions"><button type="button" class="btn-secondaire" id="faAnnuler">Retour</button>' +
      '<button type="submit" class="btn-demander" id="faEnvoyer"></button></div>' +
      '<p class="fa-aide">Le bureau est prévenu : il retire du planning ce que tu annules.</p></form>');
    var portee = document.getElementById("faPortee"), envoyer = document.getElementById("faEnvoyer");
    var maj = function () { envoyer.textContent = portee.value ? "Annuler cette absence" : "Annuler la série"; document.getElementById("faErreur").hidden = true; };
    portee.addEventListener("change", maj);
    maj();
    var quitter = function () { if (retour) ouvrirDemandes(); else fermerFeuille(); };
    document.getElementById("faAnnuler").addEventListener("click", quitter);
    document.getElementById("formAnnulation").addEventListener("submit", function (e) {
      e.preventDefault();
      if (envoiEnCours) return;
      var erreur = document.getElementById("faErreur");
      var corps = { p_jeton: jeton, p_id: q.id };
      if (portee.value) corps.p_cible_debut = portee.value;
      envoiEnCours = true;
      envoyer.disabled = true;
      appelRpc("consultation_annuler_absence", corps).then(function (r) {
        envoiEnCours = false;
        if (!r || !r.ok) { envoyer.disabled = false; erreur.textContent = (r && r.erreur) || "Annulation refusée par le serveur."; erreur.hidden = false; return; }
        return charger(donnees.lundi).then(quitter);
      }).catch(function () {
        envoiEnCours = false;
        envoyer.disabled = false;
        erreur.textContent = "Envoi impossible : vérifie ta connexion internet.";
        erreur.hidden = false;
      });
    });
    portee.focus();
  }

  // Suite 87 : texte d'une absence du bureau (« Congé - Motif ») → type
  // et motif du formulaire ; texte inconnu → proposé tel quel comme type.
  function analyserTexte(texte, motifs) {
    var t = String(texte || "Absence"), i = t.indexOf(" - ");
    if (i > 0 && motifs.indexOf(t.slice(0, i)) >= 0) return { motif: t.slice(0, i), remarque: t.slice(i + 3) };
    return { motif: t, remarque: "" };
  }

  // mode : "nouvelle" (barre du bas), "modifier" (demande en attente ou
  // absence acceptée) ou "refaire" (nouvelle demande pré-remplie depuis une
  // demande refusée ou une absence supprimée). q : la demande visée.
  function ouvrirFormulaire(q, mode) {
    var d = donnees, retour = feuilleOuverte === "demandes";
    var motifs = (d.motifs && d.motifs.length ? d.motifs : ["Congé", "Vacances", "Maladie"]).slice();
    var bloc = mode === "bureau" ? q : null;
    if (bloc) { var lu = analyserTexte(bloc.texte, motifs); q = Object.assign({}, bloc, { motif: lu.motif, remarque: lu.remarque }); }
    if (q && motifs.indexOf(q.motif) < 0) motifs.push(q.motif);
    var debutDefaut = d.lundi > d.aujourdhui ? d.lundi : d.aujourdhui;
    var v = q ? { motif: q.motif, debut: q.debut < d.aujourdhui ? d.aujourdhui : q.debut, demiDebut: q.demi_debut, demiFin: q.demi_fin, remarque: q.remarque || "" }
      : { motif: motifs[0], debut: debutDefaut, demiDebut: "matin", demiFin: "aprem", remarque: "" };
    v.fin = q ? (q.fin < v.debut ? v.debut : q.fin) : debutDefaut;
    // Suite 86 : série commencée → repart de sa prochaine absence (dates
    // de celle-ci), même règle et même fin.
    v.repeter = estSerie(q) ? q.serie_frequence + ":" + Math.max(1, +q.serie_intervalle || 1) : "";
    v.jusquau = estSerie(q) ? q.serie_fin : "";
    if (estSerie(q) && q.debut < d.aujourdhui) {
      var prochaine = occurrences(q).filter(function (o) { return o.debut >= d.aujourdhui; })[0];
      if (prochaine) { v.debut = prochaine.debut; v.fin = prochaine.fin; }
    }
    var CHOIX_REPETER = [["", "Non"], ["semaine:1", "Chaque semaine"], ["semaine:2", "Toutes les 2 semaines"], ["semaine:3", "Toutes les 3 semaines"],
      ["semaine:4", "Toutes les 4 semaines"], ["mois:1", "Chaque mois"], ["mois:2", "Tous les 2 mois"], ["mois:3", "Tous les 3 mois"]];
    if (v.repeter && !CHOIX_REPETER.some(function (c) { return c[0] === v.repeter; })) {
      CHOIX_REPETER.push([v.repeter, libelleRepetition(q.serie_frequence, q.serie_intervalle).replace(/^./, function (c) { return c.toUpperCase(); })]);
    }
    var accepteeModifiee = (mode === "modifier" && q.statut === "acceptee") || !!bloc;
    // Suite 87 : série acceptée → « Quoi » (toute la série ou une absence).
    var avecPortee = mode === "modifier" && accepteeModifiee && estSerie(q);
    var titre = bloc ? "Modifier l’absence" : mode === "modifier" ? (accepteeModifiee ? "Modifier l’absence" : "Modifier la demande") : mode === "refaire" ? "Nouvelle demande" : "Demander une absence";
    var envoyer = bloc ? "Envoyer la modification" : mode === "modifier" ? (accepteeModifiee ? "Envoyer la modification" : "Enregistrer") : "Envoyer la demande";
    var choixDemi = function (id, val) {
      return '<select id="' + id + '"><option value="matin"' + (val === "matin" ? " selected" : "") + ">Matin</option>" +
        '<option value="aprem"' + (val === "aprem" ? " selected" : "") + ">Après-midi</option></select>";
    };
    var html = '<form class="form-absence" id="formAbsence" novalidate>' +
      (accepteeModifiee ? '<p class="fa-origine">' + (bloc ? "Absence posée par le bureau : " : estSerie(q) ? "Série acceptée : " : "Absence acceptée : ") +
        esc(texteDemande(q)) + " — " + esc(libelleDemande(bloc ? bloc : q)) + "</p>" : "") + (avecPortee ? htmlPortee(q) : "") +
      // Suite 80 — Lionel : « Motif à la place de remarque. » Le choix
      // Congé / Vacances… devient le « Type » ; le texte libre, le
      // « Motif » (id et colonne `remarque` inchangés). Bulle posée à
      // l'acceptation : « Congé - Motif » (texteDemandeAbsence, appli).
      '<label>Type<select id="faMotif">' + motifs.map(function (m) { return "<option" + (m === v.motif ? " selected" : "") + ">" + esc(m) + "</option>"; }).join("") + "</select></label>" +
      '<div class="fa-ligne"><label>Du<input type="date" id="faDebut" required min="' + d.aujourdhui + '" value="' + v.debut + '"></label>' + choixDemi("faDemiDebut", v.demiDebut) + "</div>" +
      '<div class="fa-ligne"><label>Au<input type="date" id="faFin" required min="' + d.aujourdhui + '" value="' + v.fin + '"></label>' + choixDemi("faDemiFin", v.demiFin) + "</div>" +
      '<div class="fa-ligne fa-serie"><label>Répéter<select id="faRepeter">' + CHOIX_REPETER.map(function (c) {
        return '<option value="' + c[0] + '"' + (c[0] === v.repeter ? " selected" : "") + ">" + esc(c[1]) + "</option>";
      }).join("") + "</select></label>" +
      '<label id="faLigneJusquau"' + (v.repeter ? "" : " hidden") + '>Jusqu’au<input type="date" id="faJusquau" value="' + esc(v.jusquau) + '"></label></div>' +
      '<label>Motif <small>(facultatif)</small><textarea id="faRemarque" rows="2" maxlength="300" placeholder="Ex. : rendez-vous médical">' + esc(v.remarque) + "</textarea></label>" +
      '<p class="fa-erreur" id="faErreur" hidden></p>' +
      '<div class="fa-actions"><button type="button" class="btn-secondaire" id="faAnnuler">Annuler</button>' +
      '<button type="submit" class="btn-demander" id="faEnvoyer">' + esc(envoyer) + "</button></div>" +
      '<p class="fa-aide">' + (accepteeModifiee ? "Le bureau doit valider la modification : en attendant, l’absence acceptée reste dans le planning."
        : mode === "modifier" ? "Le bureau n’a pas encore répondu : la demande est corrigée telle quelle."
        : "Le bureau doit la valider : elle n’apparaît dans le planning qu’une fois acceptée.") + "</p></form>";
    ouvrirFeuille("formulaire", titre, html);
    var form = document.getElementById("formAbsence");
    var debut = document.getElementById("faDebut"), fin = document.getElementById("faFin");
    var repeter = document.getElementById("faRepeter"), jusquau = document.getElementById("faJusquau");
    // « Jusqu'au » : au plus tôt la 2e absence, au plus tard dans un an ;
    // vide ou trop tôt → 4 absences proposées.
    var majJusquau = function () {
      var r = repeter.value.split(":");
      document.getElementById("faLigneJusquau").hidden = !repeter.value;
      if (!repeter.value || !debut.value) return;
      var n = +r[1] || 1, mini = pas(debut.value, r[0], n);
      jusquau.min = mini;
      jusquau.max = plusJours(d.aujourdhui, 365);
      if (!jusquau.value || jusquau.value < mini) {
        var propose = pas(debut.value, r[0], 3 * n);
        jusquau.value = propose > jusquau.max ? (mini > jusquau.max ? mini : jusquau.max) : propose;
      }
    };
    repeter.addEventListener("change", majJusquau);
    // Une seule absence de la série : ses dates, sans répétition (le
    // bureau ne change que celle-là) ; retour à « Toute la série » : les
    // valeurs de départ.
    var portee = document.getElementById("faPortee");
    var majPortee = function () {
      if (!portee) return;
      var o = portee.value ? occurrencesLibres(q).filter(function (x) { return x.debut === portee.value; })[0] : null;
      debut.value = o ? o.debut : v.debut;
      fin.value = o ? o.fin : v.fin;
      document.getElementById("faDemiDebut").value = v.demiDebut;
      document.getElementById("faDemiFin").value = v.demiFin;
      repeter.value = o ? "" : v.repeter;
      jusquau.value = o ? "" : v.jusquau;
      form.querySelector(".fa-serie").hidden = !!o;
      majJusquau();
    };
    if (portee) portee.addEventListener("change", majPortee);
    debut.addEventListener("change", function () { if (fin.value < debut.value) fin.value = debut.value; majJusquau(); });
    if (portee) majPortee(); else majJusquau();
    var masquerErreur = function () { document.getElementById("faErreur").hidden = true; };
    form.addEventListener("input", masquerErreur);
    form.addEventListener("change", masquerErreur);
    var quitter = function () { if (retour) ouvrirDemandes(); else fermerFeuille(); };
    document.getElementById("faAnnuler").addEventListener("click", quitter);
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
      // Répétition : envoyée seulement si choisie (un serveur sans sql/0022
      // accepte toujours une demande simple). Mêmes contrôles que le serveur.
      if (repeter.value) {
        var r = repeter.value.split(":"), n = +r[1] || 1;
        if (!jusquau.value || jusquau.value < pas(corps.p_debut, r[0], n)) return montrer("« Jusqu’au » trop tôt : il faut au moins deux absences.");
        if (jusquau.value > plusJours(d.aujourdhui, 365)) return montrer("Répétition possible jusqu’à dans un an.");
        if (Math.round((dateDe(corps.p_fin) - dateDe(corps.p_debut)) / 864e5) >= (r[0] === "mois" ? 28 : 7) * n) return montrer("Chaque absence doit finir avant la suivante.");
        corps.p_serie_frequence = r[0]; corps.p_serie_intervalle = n; corps.p_serie_fin = jusquau.value;
      }
      if (mode === "modifier") corps.p_id = q.id;
      if (portee && portee.value) corps.p_cible_debut = portee.value;
      var fonction = mode === "modifier" ? "consultation_modifier_demande" : "consultation_demander_absence";
      if (bloc) {
        fonction = "consultation_changer_absence_bureau";
        corps.p_action = "modification";
        corps.p_cible_debut = bloc.debut; corps.p_cible_fin = bloc.fin;
        corps.p_cible_demi_debut = bloc.demi_debut; corps.p_cible_demi_fin = bloc.demi_fin;
      }
      envoiEnCours = true;
      document.getElementById("faEnvoyer").disabled = true;
      appelRpc(fonction, corps).then(function (r) {
        envoiEnCours = false;
        if (!r || !r.ok) { document.getElementById("faEnvoyer").disabled = false; montrer((r && r.erreur) || "Demande refusée par le serveur."); return; }
        return charger(donnees.lundi).then(quitter);
      }).catch(function (err) {
        envoiEnCours = false;
        document.getElementById("faEnvoyer").disabled = false;
        // Serveur pas encore à jour (sql/0022 absente) : la fonction à
        // 10 paramètres n'existe pas (HTTP 404).
        if (corps.p_serie_frequence && /HTTP 404/.test(err && err.message)) return montrer("La répétition n’est pas encore possible : fais une demande par absence.");
        montrer("Envoi impossible : vérifie ta connexion internet.");
      });
    });
    var m = document.getElementById("faMotif");
    if (m) m.focus();
  }

  document.getElementById("btnDemanderAbsence").addEventListener("click", function () { ouvrirFormulaire(null, "nouvelle"); });
  document.getElementById("btnNotifications").addEventListener("click", ouvrirDemandes);
  document.getElementById("feuilleFermer").addEventListener("click", fermerFeuille);
  document.getElementById("feuilleFond").addEventListener("click", fermerFeuille);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && feuilleOuverte) fermerFeuille(); });

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
    // Suite 83 : une annulation en attente ne change rien à l'écran —
    // l'absence reste posée tant que le bureau ne l'a pas retirée.
    var enAttente = (d.demandes || []).filter(function (q) { return q.statut === "en_attente" && typeDe(q) !== "annulation"; });
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
            return '<div class="tache demande"><div class="texte">' + esc(texteDemande(q)) + '</div><div class="details"><span>' + (typeDe(q) === "modification" ? "Modification en attente" : "Demande d’absence en attente") + "</span></div></div>";
          }).join("") : '<span class="vide">—</span>') + "</div></div>";
      });
      html += "</section>";
    }
    // Suite 83 : « recharge la page… » est passé en haut, à la place de
    // « le planning est tenu par le bureau » (pied retiré).
    document.getElementById("contenu").innerHTML = html;
    majBarreBas();
    if (feuilleOuverte === "demandes") dessinerDemandes([]);
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
    if (!depart || !e.changedTouches.length || feuilleOuverte) return;
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
