"use strict";
/* ============================================================
   PLANNING EN LECTURE SEULE POUR UN RESPONSABLE — round du 07.10.2026
   (suite 143)
   ------------------------------------------------------------
   Page responsable.html?j=<jeton> (cf. son en-tête). Lionel : « J'aimerai
   pouvoir envoyer le planning à mon responsable, en lecture seul. » Ses
   choix : « Lien sans connexion » ; personnel et équipes plus « Jalons,
   Notes, Machines et transports, Intervenants » ; « Vue simplifiée » ;
   « Surtout l'ordinateur » ; « Un lien par personne » ; congés « Le texte
   complet » ; période « Moins loin » (semaine en cours + 4 suivantes).

   Un seul appel : POST /rest/v1/rpc/consultation_responsable avec la clé
   publique (anon), comme js/consultation.js. La fonction (sql/0038)
   renvoie la semaine demandée, bornée par le serveur (min / max), ou null
   si le lien a été supprimé ou renouvelé.

   Affichage : une grille de la semaine, colonne des noms + Matin /
   Après-midi de chaque jour (lundi → vendredi ; samedi et dimanche
   seulement s'ils ont quelque chose). Lignes dans l'ordre de l'appli :
   Jalons, Notes, Transports, puis les sections dans l'ordre choisi par
   Lionel (réglage ordre_groupes, cf. sectionsCorps dans js/groupes.js) —
   Personnel (chaque équipe avec ses membres en sous-titre ; un membre n'a
   sa propre ligne que s'il a quelque chose cette semaine, absence par
   exemple, comme une équipe repliée), Intervenants, Machines… Une bulle
   identique sur des demi-journées qui se suivent n'en fait qu'une ; les
   bulles d'une même case s'empilent. Absences : texte complet (« Congé -
   Mariage »), hachurées. ‹ › et les flèches du clavier changent de
   semaine, « Auj. » revient à la semaine en cours.
   ============================================================ */
(function () {
  // Même projet et même clé publique que js/core.js et js/consultation.js.
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
  function couleurSure(c) { return /^#[0-9a-f]{3,8}$/i.test(c || "") ? c : ""; }
  function lundiDe(iso) { return plusJours(iso, -((dateDe(iso).getDay() + 6) % 7)); }

  function message(titre, texte) {
    document.getElementById("contenu").innerHTML = '<p class="message"><b>' + esc(titre) + "</b>" + esc(texte) + "</p>";
  }

  function charger(lundi) {
    var n = ++demande;
    document.body.classList.add("chargement");
    return fetch(SUPABASE_URL + "/rest/v1/rpc/consultation_responsable", {
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
        donnees = null;
        document.getElementById("titreSemaine").textContent = "";
        ["btnPrecedente", "btnSuivante", "btnAujourdhui"].forEach(function (id) { document.getElementById(id).disabled = true; });
        message("Ce lien ne marche plus.", "Il a été remplacé ou supprimé. Demande le nouveau lien.");
        return;
      }
      donnees = d;
      afficher();
    }).catch(function () {
      if (n !== demande) return;
      document.body.classList.remove("chargement");
      message("Planning inaccessible.", "Vérifie la connexion internet, puis recharge la page.");
    });
  }

  function horairesDu(iso) {
    var h = null;
    (donnees.horaires || []).forEach(function (p) { if (p.debut <= iso && iso <= p.fin) h = p; });
    return h;
  }

  // ---- Bulles d'une ligne ---------------------------------------------
  // Chaque élément (tâche, jalon, note) occupe une ou deux demi-journées
  // (jalon / note sans demi = la journée). Les éléments identiques qui se
  // suivent sont fusionnés en une bulle, puis rangés en pistes : la
  // première piste libre sur toute la durée de la bulle.
  function demisDe(it) { return it.demi === "matin" ? [0] : it.demi === "aprem" ? [1] : [0, 1]; }
  function placer(elements, indexJour) {
    var bulles = [];
    elements.forEach(function (it, rang) {
      var j = indexJour[it.date];
      if (j == null) return;
      var cle = [it.sorte, it.texte, it.chantier, it.couleur, it.statut, it.couleur_statut, !!it.absence, !!it.important].join("|");
      demisDe(it).forEach(function (d) {
        var slot = j * 2 + d;
        var ouverte = null;
        for (var i = 0; i < bulles.length; i++) {
          if (bulles[i].cle === cle && bulles[i].fin === slot - 1) { ouverte = bulles[i]; break; }
        }
        if (ouverte) ouverte.fin = slot;
        else bulles.push({ cle: cle, debut: slot, fin: slot, it: it, rang: rang });
      });
    });
    bulles.sort(function (a, b) { return a.debut - b.debut || a.rang - b.rang; });
    var pistes = [];
    bulles.forEach(function (b) {
      var p = 0;
      while (pistes[p] && pistes[p].some(function (x) { return x.debut <= b.fin && b.debut <= x.fin; })) p++;
      (pistes[p] = pistes[p] || []).push(b);
      b.piste = p;
    });
    return { bulles: bulles, pistes: Math.max(1, pistes.length) };
  }

  function htmlBulle(b, ligne) {
    var it = b.it;
    var style = "grid-row:" + (ligne + b.piste) + ";grid-column:" + (b.debut + 2) + " / " + (b.fin + 3);
    var titre = [it.texte, it.chantier, it.statut].filter(Boolean).join(" · ");
    if (it.absence) {
      return '<div class="bulle absence" style="' + style + '" title="' + esc(titre) + '"><div class="texte">' + esc(it.texte || "Absent") + "</div></div>";
    }
    var fond = couleurSure(it.couleur);
    var details = [];
    if (it.chantier) details.push("<span>" + esc(it.chantier) + "</span>");
    if (it.statut) details.push('<span class="statut"' + (couleurSure(it.couleur_statut) ? ' style="--cs:' + it.couleur_statut + '"' : "") + ">" + esc(it.statut) + "</span>");
    return '<div class="bulle ' + it.sorte + (fond ? "" : " neutre") + '" style="' + style + (fond ? ";--c:" + fond : "") + '" title="' + esc(titre) + '">' +
      '<div class="texte">' + (it.important ? '<span class="important" title="Important">⚑ </span>' : "") + esc(it.texte || (it.sorte === "tache" ? "(sans texte)" : "")) + "</div>" +
      (details.length ? '<div class="details">' + details.join("") + "</div>" : "") + "</div>";
  }

  // ---- Lignes de la grille ---------------------------------------------
  // Ordre des sections : même règle que sectionsCorps (js/groupes.js) —
  // Personnel, Intervenants puis les groupes par défaut, rangés selon le
  // réglage ordre_groupes ; une section absente du réglage garde sa place
  // par défaut, après les autres.
  function sections() {
    var defaut = [{ cle: "personnel", libelle: "Personnel" }, { cle: "intervenants", libelle: "Intervenants" }]
      .concat((donnees.groupes || []).map(function (g) { return { cle: "groupe-" + g.id, libelle: g.nom }; }));
    var ordre = Array.isArray(donnees.ordre_groupes) ? donnees.ordre_groupes : [];
    var rang = function (s) { var i = ordre.indexOf(s.cle); return i < 0 ? ordre.length + defaut.indexOf(s) : i; };
    return defaut.slice().sort(function (a, b) { return rang(a) - rang(b); });
  }

  // [{ titre } | { nom, sous, classe, couleur, elements }] dans l'ordre affiché.
  function lignes(tachesDe) {
    var personnes = donnees.personnes || [];
    var dans = function (cle) { return personnes.filter(function (p) { return p.section === cle; }); };
    var ligneDe = function (p, classe, sous) {
      return { nom: p.nom, sous: sous || "", classe: classe || "", couleur: p.couleur, elements: tachesDe(p.id) };
    };
    var out = [
      { nom: "Jalons", classe: "ligne-haut", elements: (donnees.jalons || []).map(function (j) { return Object.assign({ sorte: "jalon" }, j); }) },
      { nom: "Notes", classe: "ligne-haut", elements: (donnees.notes || []).map(function (n) { return Object.assign({ sorte: "note" }, n); }) }
    ];
    dans("transports").forEach(function (p) { out.push(ligneDe(p, "ligne-haut")); });
    sections().forEach(function (s) {
      var rangs = [];
      if (s.cle === "personnel") {
        var liste = dans("personnel"), parId = {}, pris = {};
        liste.forEach(function (p) { parId[p.id] = p; });
        liste.filter(function (p) { return p.equipe; }).forEach(function (e) {
          var membres = (e.membres || []).filter(function (m) { return parId[m.id] && !pris[m.id]; });
          rangs.push(ligneDe(e, "equipe", membres.map(function (m) { return m.nom; }).join(", ")));
          membres.forEach(function (m) {
            pris[m.id] = true;
            var l = ligneDe(parId[m.id], "membre");
            l.couleur = e.couleur;
            if (l.elements.length) rangs.push(l);
          });
        });
        liste.forEach(function (p) { if (!p.equipe && !pris[p.id]) rangs.push(ligneDe(p)); });
      } else {
        rangs = dans(s.cle).map(function (p) { return ligneDe(p); });
      }
      if (!rangs.length) return;
      // Un groupe d'une seule ligne (Machines, suite 135) : la ligne tient
      // lieu de titre, comme dans l'appli.
      if (!(s.cle.indexOf("groupe-") === 0 && rangs.length === 1)) out.push({ titre: s.libelle });
      out = out.concat(rangs);
    });
    return out;
  }

  function afficher() {
    var d = donnees, lundi = d.lundi;
    document.getElementById("titreSemaine").innerHTML = "Semaine " + numeroSemaine(lundi) +
      "<small>" + esc(jourMois(lundi) + " – " + jourMois(plusJours(lundi, 4)) + " " + dateDe(plusJours(lundi, 4)).getFullYear()) + "</small>";
    document.getElementById("btnPrecedente").disabled = lundi <= d.min;
    document.getElementById("btnSuivante").disabled = lundi >= d.max;
    document.getElementById("btnAujourdhui").disabled = lundi === lundiDe(d.aujourdhui);

    // Jours affichés : lundi → vendredi, + samedi / dimanche s'ils ont
    // une tâche, un jalon ou une note.
    var occupes = {};
    (d.taches || []).concat(d.jalons || [], d.notes || []).forEach(function (it) { occupes[it.date] = true; });
    var jours = [];
    for (var i = 0; i < 7; i++) {
      var iso = plusJours(lundi, i);
      if (i < 5 || occupes[iso]) jours.push(iso);
    }
    var indexJour = {};
    jours.forEach(function (iso, k) { indexJour[iso] = k; });
    var feries = {};
    (d.feries || []).forEach(function (f) { feries[f.date] = f.libelle || "Férié"; });
    var parPersonne = {};
    (d.taches || []).forEach(function (t) {
      if (indexJour[t.date] == null) return;
      (parPersonne[t.personne] = parPersonne[t.personne] || []).push(Object.assign({ sorte: "tache" }, t));
    });
    var tachesDe = function (id) { return parPersonne[id] || []; };

    var html = [];
    html.push('<div class="case-coin"></div>');
    jours.forEach(function (iso, k) {
      var j = (dateDe(iso).getDay() + 6) % 7, h = horairesDu(iso);
      var cls = "tete-jour" + (iso === d.aujourdhui ? " aujourdhui" : "") + (feries[iso] ? " ferie" : "");
      html.push('<div class="' + cls + '" style="grid-row:1;grid-column:' + (k * 2 + 2) + ' / span 2">' + esc(JOURS[j] + " " + jourMois(iso)) +
        (feries[iso] ? '<span class="ferie-nom">' + esc(feries[iso]) + "</span>" : "") +
        (h ? "<small>" + esc(h.matin + (h.aprem ? " · " + h.aprem : "")) + "</small>" : "") + "</div>");
      html.push('<div class="tete-demi debut-jour" style="grid-row:2;grid-column:' + (k * 2 + 2) + '"' + (h ? ' title="' + esc(h.matin) + '"' : "") + ">Matin</div>");
      html.push('<div class="tete-demi" style="grid-row:2;grid-column:' + (k * 2 + 3) + '"' + (h && h.aprem ? ' title="' + esc(h.aprem) + '"' : "") + ">Après-midi</div>");
    });

    var ligne = 3;
    lignes(tachesDe).forEach(function (l) {
      if (l.titre) {
        html.push('<div class="titre-section" style="grid-row:' + ligne + '">' + esc(l.titre) + "</div>");
        ligne++;
        return;
      }
      var place = placer(l.elements, indexJour), n = place.pistes;
      var span = "grid-row:" + ligne + " / span " + n;
      var ce = couleurSure(l.couleur);
      html.push('<div class="nom' + (l.classe ? " " + l.classe : "") + '" style="' + span + ";grid-column:1" + (ce ? ";--ce:" + ce : "") + '">' +
        esc(l.nom) + (l.sous ? "<small>" + esc(l.sous) + "</small>" : "") + "</div>");
      jours.forEach(function (iso, k) {
        [0, 1].forEach(function (dm) {
          var cls = "fond" + (dm === 0 ? " debut-jour" : "") + (feries[iso] ? " ferie" : iso === d.aujourdhui ? " aujourdhui" : "");
          html.push('<div class="' + cls + '" style="' + span + ";grid-column:" + (k * 2 + dm + 2) + '"></div>');
        });
      });
      place.bulles.forEach(function (b) { html.push(htmlBulle(b, ligne)); });
      ligne += n;
    });

    document.getElementById("contenu").innerHTML =
      '<div class="cadre"><div class="grille" style="--jours:' + jours.length + ";grid-template-columns:var(--colonne-noms) repeat(" + (jours.length * 2) + ', minmax(0, 1fr))">' +
      html.join("") + "</div></div>";
  }

  function allerA(lundi) {
    if (!donnees) return;
    if (lundi < donnees.min) lundi = donnees.min;
    if (lundi > donnees.max) lundi = donnees.max;
    if (lundi === donnees.lundi) return;
    charger(lundi);
  }
  document.getElementById("btnPrecedente").addEventListener("click", function () { if (donnees) allerA(plusJours(donnees.lundi, -7)); });
  document.getElementById("btnSuivante").addEventListener("click", function () { if (donnees) allerA(plusJours(donnees.lundi, 7)); });
  document.getElementById("btnAujourdhui").addEventListener("click", function () { if (donnees) allerA(lundiDe(donnees.aujourdhui)); });
  document.addEventListener("keydown", function (e) {
    if (!donnees || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowLeft") allerA(plusJours(donnees.lundi, -7));
    else if (e.key === "ArrowRight") allerA(plusJours(donnees.lundi, 7));
  });

  if (!/^[0-9a-f]{32,}$/i.test(jeton)) {
    ["btnPrecedente", "btnSuivante", "btnAujourdhui"].forEach(function (id) { document.getElementById(id).disabled = true; });
    document.getElementById("titreSemaine").textContent = "";
    message("Lien incomplet.", "Ouvre le lien complet reçu, sans le couper.");
  } else {
    charger(null);
  }
})();
