"use strict";
  /* ============================================================
     LIENS RESPONSABLES — round du 07.10.2026 (suite 143)
     ------------------------------------------------------------
     Lionel : « J'aimerai pouvoir envoyer le planning à mon responsable, en
     lecture seul. » Ses choix : « Lien sans connexion », gérés « Dans le
     menu Réglages », « Un lien par personne » (un nom, sa date de dernière
     consultation, supprimable seul).

     Page Réglages › Liens responsables (#page-liens-responsables) :
       - « Nom » (« Responsable », « Patron »…) + « Créer le lien » ;
       - un cadre par lien : son nom, l'adresse, « Copier », « Partager… »
         (feuille de partage du téléphone), « Ouvrir », la date de la
         dernière consultation, « Nouveau lien » (l'ancien ne marche plus)
         et « Supprimer ».
     Table liens_responsables (sql/0038) ; jeton tiré comme celui des
     ouvriers (nouveauJetonConsultation_, js/liens-consultation.js). La
     page ouverte par le lien : responsable.html (js/responsable.js) —
     tout le planning, semaine en cours et les 4 suivantes.
     ============================================================ */

  var LIENS_RESPONSABLES_ = null;   // lignes de liens_responsables (null : pas encore lues)

  function adresseResponsable(jeton) {
    return new URL("responsable.html?j=" + jeton, location.href).href;
  }

  function htmlContenuPageLiensResponsables() {
    return '<div class="page-titre"><h1>Liens responsables</h1></div>' +
      '<p class="page-sous">Un lien à envoyer à un responsable : tout le planning (équipes, personnel, jalons, notes, machines, transports, intervenants), semaine par semaine, de la semaine en cours aux 4 suivantes, sans connexion et sans rien pouvoir modifier. Un lien par personne : chacun garde sa date de dernière consultation et se supprime seul.</p>' +
      '<form class="lr-ajout" id="formLienResponsable" autocomplete="off">' +
        '<input type="text" class="lr-nom" id="nomLienResponsable" maxlength="60" placeholder="Nom (ex. Responsable, Patron)" aria-label="Nom du lien">' +
        '<button type="submit" class="btn-enregistrer" id="btnCreerLienResponsable" disabled>Créer le lien</button>' +
      '</form>' +
      '<div class="lr-liste" id="listeLiensResponsables"></div>';
  }

  function renderListeLiensResponsables_() {
    var zone = document.getElementById("listeLiensResponsables");
    if (!zone) return;
    if (LIENS_RESPONSABLES_ == null) { zone.innerHTML = '<p class="page-sous">Chargement…</p>'; return; }
    if (!LIENS_RESPONSABLES_.length) { zone.innerHTML = '<p class="lr-vide">Aucun lien pour l’instant.</p>'; return; }
    zone.innerHTML = LIENS_RESPONSABLES_.map(function (l) {
      var url = adresseResponsable(l.jeton);
      return '<section class="lien-responsable" data-id="' + l.id + '">' +
        '<h2 class="lr-titre">' + esc(l.nom) + '</h2>' +
        '<input type="text" class="lr-url" readonly value="' + esc2(url) + '" aria-label="Adresse du lien ' + esc2(l.nom) + '">' +
        '<div class="lr-boutons">' +
          '<button type="button" class="btn-enregistrer" data-action="copier">Copier</button>' +
          (navigator.share ? '<button type="button" class="btn-calculer" data-action="partager">Partager…</button>' : "") +
          '<a class="btn-calculer" href="' + esc2(url) + '" target="_blank" rel="noopener">Ouvrir</a>' +
        '</div>' +
        '<p class="lr-vu">' + esc(libelleVuLe_(l.vu_le)) + '</p>' +
        '<div class="lr-gestion">' +
          '<button type="button" class="lien-modifier" data-action="nouveau">Nouveau lien</button>' +
          '<button type="button" class="lien-supprimer" data-action="supprimer">Supprimer</button>' +
        '</div>' +
      '</section>';
    }).join("");
  }

  // Relue à chaque ouverture de la page (dernière consultation à jour).
  function renderLiensResponsables() {
    renderListeLiensResponsables_();
    Promise.resolve(sbClient.from("liens_responsables").select("id, nom, jeton, cree_le, vu_le").order("cree_le", { ascending: true })).then(function (res) {
      if (res.error) throw res.error;
      LIENS_RESPONSABLES_ = res.data || [];
      renderListeLiensResponsables_();
    }).catch(function (err) {
      var zone = document.getElementById("listeLiensResponsables");
      if (zone) zone.innerHTML = '<p class="lr-vide">Liens illisibles : ' + esc(erreurLien_(err)) + '</p>';
    });
  }

  function creerLienResponsable_() {
    var champ = document.getElementById("nomLienResponsable");
    var btn = document.getElementById("btnCreerLienResponsable");
    var nom = champ.value.trim();
    if (!nom) return;
    btn.disabled = true;
    var ligne = { nom: nom, jeton: nouveauJetonConsultation_() };
    Promise.resolve(sbClient.from("liens_responsables").insert(ligne).select("id, nom, jeton, cree_le, vu_le")).then(function (res) {
      if (res.error) throw res.error;
      champ.value = "";
      LIENS_RESPONSABLES_ = (LIENS_RESPONSABLES_ || []).concat(res.data && res.data[0] ? [res.data[0]] : []);
      renderListeLiensResponsables_();
      toast("Lien « " + nom + " » créé.");
    }).catch(function (err) {
      toast("Échec : " + erreurLien_(err));
    }).then(function () { btn.disabled = !champ.value.trim(); });
  }

  function actionLienResponsable_(action, l, carte) {
    var url = adresseResponsable(l.jeton);
    if (action === "copier") {
      var champ = carte.querySelector(".lr-url");
      var ok = function () { toast("Lien copié."); };
      var repli = function () { champ.select(); document.execCommand("copy"); ok(); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, repli);
      else repli();
    } else if (action === "partager") {
      navigator.share({ title: "Planning chantier", text: "Le planning (consultation seule) :", url: url }).catch(function () {});
    } else if (action === "nouveau") {
      demanderConfirmation("Remplacer le lien « " + l.nom + " » ? L’ancien lien ne marchera plus : il faudra envoyer le nouveau.", function () {
        var jeton = nouveauJetonConsultation_();
        Promise.resolve(sbClient.from("liens_responsables").update({ jeton: jeton, cree_le: new Date().toISOString(), vu_le: null }).eq("id", l.id)).then(function (res) {
          if (res.error) throw res.error;
          l.jeton = jeton; l.vu_le = null;
          renderListeLiensResponsables_();
          toast("Nouveau lien créé — l’ancien ne marche plus.");
        }).catch(function (err) { toast("Échec : " + erreurLien_(err)); });
      });
    } else if (action === "supprimer") {
      demanderConfirmation("Supprimer le lien « " + l.nom + " » ? Il ne marchera plus.", function () {
        Promise.resolve(sbClient.from("liens_responsables").delete().eq("id", l.id)).then(function (res) {
          if (res.error) throw res.error;
          LIENS_RESPONSABLES_ = (LIENS_RESPONSABLES_ || []).filter(function (x) { return x.id !== l.id; });
          renderListeLiensResponsables_();
          toast("Lien supprimé.");
        }).catch(function (err) { toast("Échec : " + erreurLien_(err)); });
      });
    }
  }

  function cablerPageLiensResponsables() {
    var page = document.getElementById("page-liens-responsables");
    if (!page || page.dataset.cable) return;
    page.dataset.cable = "1";
    var champ = document.getElementById("nomLienResponsable");
    var btn = document.getElementById("btnCreerLienResponsable");
    champ.addEventListener("input", function () { btn.disabled = !champ.value.trim(); });
    document.getElementById("formLienResponsable").addEventListener("submit", function (e) {
      e.preventDefault();
      creerLienResponsable_();
    });
    page.addEventListener("focusin", function (e) {
      if (e.target.classList && e.target.classList.contains("lr-url")) e.target.select();
    });
    page.addEventListener("click", function (e) {
      var b = e.target.closest("[data-action]");
      var carte = b && b.closest(".lien-responsable");
      if (!carte) return;
      var l = (LIENS_RESPONSABLES_ || []).filter(function (x) { return String(x.id) === carte.dataset.id; })[0];
      if (l) actionLienResponsable_(b.dataset.action, l, carte);
    });
  }
