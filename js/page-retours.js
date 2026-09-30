"use strict";
  /* ============================================================
     AMÉLIORATIONS ET BUGS — round du 30.09.2026 (suite 129)
     ------------------------------------------------------------
     Lionel : « J'aimerai avoir un endroit où je peux prendre des notes
     pour améliorer et signaler des bugs. 2 cases, améliorations et bug.
     Quand j'ai quelque chose à noter, je le note dans la case
     correspondante et j'envoie avec un bouton. Quand j'ai du temps pour
     discuter des améliorations et bug tu devras lire ce que j'ai envoyé.
     Idéalement il faudrait faire la distinction entre mobile, tablette et
     deskop. »

     Page Réglages › Améliorations et bugs (#page-retours) :
       - « Concerne » : Téléphone, Tablette, Ordinateur (celui de cet
         appareil choisi d'office, reconnu par appareilRetour_) ou Tous ;
       - 2 cases, « Améliorations » et « Bugs », chacune avec son bouton
         « Envoyer » (Ctrl/Cmd + Entrée aussi) ; le texte pas encore
         envoyé reste dans la case (brouillon gardé sur cet appareil) ;
       - sous chaque case, ce qui a déjà été envoyé (le plus récent en
         haut) : appareil, date, et ce que Claude en a fait (« Lu »,
         « Traité » + sa réponse, posés à la discussion) ; « Retirer »
         efface une note. Les 3 dernières seulement, « Voir les N
         autres » pour le reste : sur téléphone, la case « Bugs » (sous
         la liste des améliorations) reste à portée.
     Base : table retours (sql/0030_retours.sql), avec, pour les bugs
     surtout, les détails de l'appareil (navigateur, écran, fenêtre, page
     d'où l'on venait) : Claude les lit avec l'outil Supabase de la
     session.
     ============================================================ */

  var SORTES_RETOUR_ = [
    { cle: "amelioration", nom: "Améliorations", un: "Amélioration", place: "Une idée, quelque chose à changer ou à ajouter…" },
    { cle: "bug", nom: "Bugs", un: "Bug", place: "Ce qui ne marche pas : où, quoi, comment y arriver…" }
  ];
  var APPAREILS_RETOUR_ = [["telephone", "Téléphone"], ["tablette", "Tablette"], ["ordinateur", "Ordinateur"], ["tous", "Tous"]];
  var STATUTS_RETOUR_ = { nouveau: "Envoyé", lu: "Lu", traite: "Traité" };
  var RETOURS_ = null;          // lignes de la table retours (null : pas encore lues)
  var appareilRetourChoisi_ = null;
  var RETOURS_VISIBLES_ = 3;
  var retoursDeplies_ = {};      // sorte → liste entière affichée

  function nomAppareilRetour_(cle) {
    var a = APPAREILS_RETOUR_.filter(function (x) { return x[0] === cle; })[0];
    return a ? a[1] : cle;
  }
  // Téléphone, tablette ou ordinateur : d'abord le système (iPhone,
  // Android « Mobile », iPad — qui se dit Mac —, Android sans « Mobile »),
  // sinon l'écran : pointeur principal au doigt → téléphone sous 600 px de
  // petit côté, tablette au-delà ; souris → ordinateur.
  function appareilRetour_() {
    var ua = navigator.userAgent;
    if (/iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua))) return "telephone";
    if (/iPad|Android|Tablet/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "tablette";
    var mm = function (q) { return !!(window.matchMedia && matchMedia(q).matches); };
    var doigt = mm("(pointer: coarse)") || (navigator.maxTouchPoints > 0 && !mm("(pointer: fine)"));
    if (!doigt) return "ordinateur";
    return Math.min(window.innerWidth, window.innerHeight) < 600 ? "telephone" : "tablette";
  }
  // Ce qui aide à comprendre un bug sans avoir à le redemander.
  function detailsRetour_() {
    var installee = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    return {
      reconnu: appareilRetour_(),
      navigateur: typeof nomAppareilPush_ === "function" ? nomAppareilPush_() : "",
      ua: navigator.userAgent,
      ecran: screen.width + "×" + screen.height,
      fenetre: window.innerWidth + "×" + window.innerHeight,
      densite: window.devicePixelRatio || 1,
      tactile: navigator.maxTouchPoints || 0,
      appli_installee: !!installee,
      page: typeof dernierePagePrincipale_ === "string" ? dernierePagePrincipale_ : ""
    };
  }

  function lireBrouillonRetour_(sorte) {
    try { return localStorage.getItem("retours.brouillon." + sorte) || ""; } catch (e) { return ""; }
  }
  function garderBrouillonRetour_(sorte, texte) {
    try {
      if (texte) localStorage.setItem("retours.brouillon." + sorte, texte);
      else localStorage.removeItem("retours.brouillon." + sorte);
    } catch (e) { /* brouillon perdu au rechargement, rien de plus */ }
  }

  function htmlContenuPageRetours() {
    return '<div class="page-titre"><h1>Améliorations et bugs</h1></div>' +
      '<p class="page-sous">Note une idée ou un problème dans sa case, puis « Envoyer ». Tout ce qui est envoyé est gardé ici, avec l’appareil concerné, et relu quand on en discute.</p>' +
      '<div class="retours-concerne"><span class="retours-concerne-nom">Concerne</span>' +
        '<div class="bascule-appareil retours-appareils" role="radiogroup" aria-label="Appareil concerné">' +
          APPAREILS_RETOUR_.map(function (a) {
            return '<button type="button" class="bascule-profil" role="radio" data-appareil="' + a[0] + '">' + esc(a[1]) + '</button>';
          }).join("") +
        '</div><span class="retours-reconnu" id="retoursReconnu"></span></div>' +
      '<div class="retours-cases">' +
        SORTES_RETOUR_.map(function (s) {
          return '<section class="retours-case" data-sorte="' + s.cle + '">' +
            '<h2 class="titre-liste">' + esc(s.nom) + '</h2>' +
            '<textarea class="retours-texte" id="retoursTexte-' + s.cle + '" rows="4" placeholder="' + esc(s.place) + '"></textarea>' +
            '<p class="retours-actions"><button type="button" class="btn-enregistrer" id="btnRetour-' + s.cle + '" disabled>Envoyer</button></p>' +
            '<div class="retours-liste" id="retoursListe-' + s.cle + '"></div>' +
          '</section>';
        }).join("") +
      '</div>';
  }

  function majBasculeAppareilRetour_() {
    document.querySelectorAll(".retours-appareils [data-appareil]").forEach(function (b) {
      var actif = b.dataset.appareil === appareilRetourChoisi_;
      b.classList.toggle("actif", actif);
      b.setAttribute("aria-checked", actif ? "true" : "false");
    });
  }
  function dateRetour_(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    var hh = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    var jour = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    return libelleDateCourteIso(jour) + " " + d.getFullYear() + ", " + hh;
  }
  function renderListesRetours_() {
    SORTES_RETOUR_.forEach(function (s) {
      var zone = document.getElementById("retoursListe-" + s.cle);
      if (!zone) return;
      if (RETOURS_ === null) { zone.innerHTML = ""; return; }
      var lignes = RETOURS_.filter(function (r) { return r.sorte === s.cle; });
      var cachees = retoursDeplies_[s.cle] ? 0 : Math.max(0, lignes.length - RETOURS_VISIBLES_);
      zone.innerHTML = lignes.length ? lignes.slice(0, lignes.length - cachees).map(function (r) {
        return '<div class="retour" data-statut="' + esc(r.statut) + '">' +
          '<div class="retour-tete"><span class="retour-appareil">' + esc(nomAppareilRetour_(r.appareil)) + '</span>' +
            '<span class="retour-date">' + esc(dateRetour_(r.cree_le)) + '</span>' +
            '<span class="retour-statut">' + esc(STATUTS_RETOUR_[r.statut] || r.statut) + '</span>' +
            '<button type="button" class="lien-reset-tout" data-retirer-retour="' + r.id + '">Retirer</button></div>' +
          '<p class="retour-texte">' + esc(r.texte) + '</p>' +
          (r.reponse ? '<p class="retour-reponse">' + esc(r.reponse) + '</p>' : '') +
        '</div>';
      }).join("") + (cachees ? '<button type="button" class="lien-reset-tout retours-plus" data-deplier-retours="' + s.cle + '">Voir les ' + cachees + ' autres</button>'
        : retoursDeplies_[s.cle] && lignes.length > RETOURS_VISIBLES_ ? '<button type="button" class="lien-reset-tout retours-plus" data-deplier-retours="' + s.cle + '">Réduire</button>' : '')
        : '<p class="retours-vide">Rien d’envoyé pour l’instant.</p>';
    });
  }

  // Ouverture de la page : notes relues (Claude a pu les marquer lues).
  function renderRetours() {
    if (!document.getElementById("page-retours")) return;
    if (!appareilRetourChoisi_) appareilRetourChoisi_ = appareilRetour_();
    majBasculeAppareilRetour_();
    var reconnu = document.getElementById("retoursReconnu");
    if (reconnu) reconnu.textContent = "Cet appareil : " + nomAppareilRetour_(appareilRetour_()).toLowerCase();
    renderListesRetours_();
    Promise.resolve(sbClient.from("retours").select("*").order("cree_le", { ascending: false })).then(function (res) {
      if (res.error) throw res.error;
      RETOURS_ = (res.data || []).slice().sort(function (a, b) { return String(b.cree_le).localeCompare(String(a.cree_le)) || b.id - a.id; });
      renderListesRetours_();
    }).catch(function (err) { toast("Notes envoyées illisibles : " + (err && err.message ? err.message : err)); });
  }

  function envoyerRetour_(sorte) {
    var zone = document.getElementById("retoursTexte-" + sorte), btn = document.getElementById("btnRetour-" + sorte);
    var texte = zone.value.trim();
    if (!texte || btn.disabled) return;
    btn.disabled = true;
    var ligne = { sorte: sorte, texte: texte, appareil: appareilRetourChoisi_ || appareilRetour_(), details: detailsRetour_() };
    Promise.resolve(sbClient.from("retours").insert(ligne).select("*")).then(function (res) {
      if (res.error) throw res.error;
      var nouvelle = (res.data || [])[0] || Object.assign({ id: 0, statut: "nouveau", cree_le: new Date().toISOString() }, ligne);
      if (!nouvelle.cree_le) nouvelle.cree_le = new Date().toISOString();
      if (!nouvelle.statut) nouvelle.statut = "nouveau";
      RETOURS_ = [nouvelle].concat(RETOURS_ || []);
      zone.value = "";
      garderBrouillonRetour_(sorte, "");
      renderListesRetours_();
      toast((sorte === "bug" ? "Bug" : "Amélioration") + " envoyé" + (sorte === "bug" ? "" : "e") + ".");
    }).catch(function (err) {
      // Texte gardé dans la case (et en brouillon) : renvoyer plus tard.
      toast("Pas envoyé : " + (err && err.message ? err.message : err));
    }).then(function () { btn.disabled = !zone.value.trim(); });
  }

  function cablerPageRetours() {
    var page = document.getElementById("page-retours");
    if (!page || page.dataset.cable) return;
    page.dataset.cable = "1";
    page.querySelectorAll(".retours-appareils [data-appareil]").forEach(function (b) {
      b.addEventListener("click", function () {
        appareilRetourChoisi_ = b.dataset.appareil;
        majBasculeAppareilRetour_();
      });
    });
    SORTES_RETOUR_.forEach(function (s) {
      var zone = document.getElementById("retoursTexte-" + s.cle), btn = document.getElementById("btnRetour-" + s.cle);
      zone.value = lireBrouillonRetour_(s.cle);
      btn.disabled = !zone.value.trim();
      zone.addEventListener("input", function () {
        btn.disabled = !zone.value.trim();
        garderBrouillonRetour_(s.cle, zone.value);
      });
      zone.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); envoyerRetour_(s.cle); }
      });
      btn.addEventListener("click", function () { envoyerRetour_(s.cle); });
    });
    page.addEventListener("click", function (e) {
      var d = e.target.closest("[data-deplier-retours]");
      if (d) {
        retoursDeplies_[d.dataset.deplierRetours] = !retoursDeplies_[d.dataset.deplierRetours];
        renderListesRetours_();
        return;
      }
      var b = e.target.closest("[data-retirer-retour]");
      if (!b) return;
      var id = +b.dataset.retirerRetour;
      demanderConfirmation("Retirer cette note ? Elle ne sera plus lue.", function () {
        Promise.resolve(sbClient.from("retours").delete().eq("id", id)).then(function (res) {
          if (res.error) throw res.error;
          RETOURS_ = (RETOURS_ || []).filter(function (r) { return r.id !== id; });
          renderListesRetours_();
        }).catch(function (err) { toast("Retrait impossible : " + (err && err.message ? err.message : err)); });
      });
    });
  }
