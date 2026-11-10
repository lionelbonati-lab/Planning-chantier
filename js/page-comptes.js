"use strict";
  /* ============================================================
     COMPTES — round du 09.11.2026 (suite 155)
     ------------------------------------------------------------
     Lionel : « Un collègue aimerait utiliser mon planning pour ses propres
     besoins. Il doit pouvoir un compte et gérer son propre planning. » Ses
     choix : compte créé « Toi, depuis l'appli » ; invitations « Toi seul »,
     dans « un nouveau, ou le tien pour le partager » ; plusieurs comptes
     par planning « Oui, le prévoir ». Puis : « Fait toutes les étapes sans
     me redemander ».

     Page Réglages › Comptes (#page-comptes), pour l'administrateur seul
     (onglet caché sinon, cf. majOngletComptes) :
       - « Créer le compte » : prénom, nom, e-mail, planning (« Un nouveau
         planning » ou un planning existant, à partager) → fonction serveur
         inviter-compte. Le service d'e-mail intégré de Supabase n'écrit
         qu'aux membres de l'équipe du projet : la page donne le mot de
         passe provisoire et un message prêt à envoyer (« Envoyer par
         e-mail », « Copier le message », « Partager… ») ; à sa première
         connexion, le collègue choisit son mot de passe (js/core.js) ;
       - la liste des comptes de l'entreprise (comptes_entreprise, sql/0046) :
         nom, e-mail, planning, rôle, dernière connexion ; « Retirer » pour
         un compte membre (son planning et ses données restent).
     ============================================================ */

  var COMPTES_ = null;    // lignes de comptes_entreprise() (null : pas encore lues)
  var PLANNINGS_ = [];    // lignes de plannings_entreprise()

  function htmlContenuPageComptes() {
    return '<div class="page-titre"><h1>Comptes</h1></div>' +
      '<p class="page-sous">Les comptes de ton entreprise. Un nouveau compte a son propre planning, ou partage un planning existant. Les chantiers, le personnel, les intervenants, les machines, les matériaux, les statuts, les entrées rapides, les horaires et les fériés sont communs ; chaque planning garde ses tâches, ses lignes et ses couleurs.</p>' +
      '<form class="cpt-ajout" id="formInviterCompte" autocomplete="off">' +
        '<input type="text" id="cptPrenom" maxlength="60" placeholder="Prénom" aria-label="Prénom">' +
        '<input type="text" id="cptNom" maxlength="60" placeholder="Nom" aria-label="Nom">' +
        '<input type="email" id="cptEmail" maxlength="200" placeholder="Adresse e-mail" aria-label="Adresse e-mail">' +
        '<select id="cptPlanning" aria-label="Planning"><option value="nouveau">Un nouveau planning, à son nom</option></select>' +
        '<button type="submit" class="btn-enregistrer" id="btnInviterCompte" disabled>Créer le compte</button>' +
      '</form>' +
      '<div id="cptResultat"></div>' +
      '<div class="lr-liste" id="listeComptes"></div>';
  }

  function nomCompte_(c) { return ((c.prenom || "") + " " + (c.nom || "")).trim() || c.email; }
  function libelleConnexion_(c) {
    if (!c.derniere_connexion) return "Pas encore connecté.";
    var d = new Date(c.derniere_connexion);
    var iso = d.getFullYear() + "-" + pad2_(d.getMonth() + 1) + "-" + pad2_(d.getDate());
    return "Dernière connexion : " + libelleDateCourteIso(iso) + ", " + pad2_(d.getHours()) + ":" + pad2_(d.getMinutes()) + "." +
      (c.provisoire ? " Mot de passe provisoire pas encore changé." : "");
  }

  function renderListeComptes_() {
    var zone = document.getElementById("listeComptes");
    if (!zone) return;
    if (COMPTES_ == null) { zone.innerHTML = '<p class="page-sous">Chargement…</p>'; return; }
    zone.innerHTML = COMPTES_.map(function (c) {
      return '<section class="lien-responsable compte" data-id="' + esc2(c.user_id) + '">' +
        '<h2 class="lr-titre">' + esc(nomCompte_(c)) + (c.role === "admin" ? ' <span class="cpt-role">Administrateur</span>' : "") + (c.moi ? ' <span class="cpt-role">Toi</span>' : "") + '</h2>' +
        '<p class="cpt-email">' + esc(c.email) + '</p>' +
        '<p class="cpt-planning">Planning : ' + esc(c.planning) + '</p>' +
        '<p class="lr-vu">' + esc(libelleConnexion_(c)) + '</p>' +
        (c.moi || c.role === "admin" ? "" : '<div class="lr-gestion"><button type="button" class="lien-supprimer" data-action="retirer">Retirer le compte</button></div>') +
      '</section>';
    }).join("");
  }

  function renderOptionsPlannings_() {
    var sel = document.getElementById("cptPlanning");
    if (!sel) return;
    var choisi = sel.value;
    sel.innerHTML = '<option value="nouveau">Un nouveau planning, à son nom</option>' + PLANNINGS_.map(function (p) {
      return '<option value="' + esc2(p.id) + '">Partager « ' + esc(p.nom) + ' »' + (p.le_mien ? " (le tien)" : "") + '</option>';
    }).join("");
    if ([].some.call(sel.options, function (o) { return o.value === choisi; })) sel.value = choisi;
  }

  // Relue à chaque ouverture de la page (dernières connexions à jour).
  function renderComptes() {
    renderListeComptes_();
    Promise.all([sbClient.rpc("comptes_entreprise"), sbClient.rpc("plannings_entreprise")]).then(function (r) {
      if (r[0].error) throw r[0].error;
      COMPTES_ = r[0].data || [];
      PLANNINGS_ = (r[1] && !r[1].error && r[1].data) || [];
      renderListeComptes_();
      renderOptionsPlannings_();
    }).catch(function (err) {
      var zone = document.getElementById("listeComptes");
      if (zone) zone.innerHTML = '<p class="lr-vide">Comptes illisibles : ' + esc(erreurLien_(err)) + '</p>';
    });
  }

  function messageInvitation_(prenom, email, motDePasse) {
    return "Bonjour" + (prenom ? " " + prenom : "") + ",\n\n" +
      "Ton compte pour le planning chantiers est prêt :\n" + new URL("index.html", location.href).href + "\n\n" +
      "Adresse e-mail : " + email + "\nMot de passe provisoire : " + motDePasse + "\n\n" +
      "À ta première connexion, tu choisiras ton propre mot de passe.\n";
  }

  function htmlCompteCree_(r, prenom, nom) {
    var message = messageInvitation_(prenom, r.email, r.mot_de_passe);
    var mailto = "mailto:" + encodeURIComponent(r.email) + "?subject=" + encodeURIComponent("Ton compte pour le planning chantiers") + "&body=" + encodeURIComponent(message);
    return '<section class="lien-responsable cpt-cree">' +
      '<h2 class="lr-titre">Compte créé : ' + esc(((prenom || "") + " " + (nom || "")).trim() || r.email) + '</h2>' +
      '<p>Mot de passe provisoire : <b class="cpt-mdp">' + esc(r.mot_de_passe) + '</b>. Il n’est affiché qu’ici : envoie-le maintenant. À sa première connexion, il choisira son propre mot de passe.</p>' +
      '<textarea class="cpt-message" readonly rows="7" aria-label="Message à envoyer">' + esc(message) + '</textarea>' +
      '<div class="lr-boutons">' +
        '<a class="btn-enregistrer" href="' + esc2(mailto) + '">Envoyer par e-mail</a>' +
        '<button type="button" class="btn-calculer" data-action="copier-message">Copier le message</button>' +
        (navigator.share ? '<button type="button" class="btn-calculer" data-action="partager-message">Partager…</button>' : "") +
      '</div>' +
    '</section>';
  }

  function inviterCompte_() {
    var prenom = document.getElementById("cptPrenom").value.trim(), nom = document.getElementById("cptNom").value.trim();
    var email = document.getElementById("cptEmail").value.trim();
    var planning = document.getElementById("cptPlanning").value;
    var btn = document.getElementById("btnInviterCompte");
    btn.disabled = true;
    invoquerFonctionServeur("inviter-compte", { prenom: prenom, nom: nom, email: email, planning: planning, nom_planning: (prenom + " " + nom).trim() }).then(function (r) {
      document.getElementById("cptResultat").innerHTML = htmlCompteCree_(r, prenom, nom);
      ["cptPrenom", "cptNom", "cptEmail"].forEach(function (id) { document.getElementById(id).value = ""; });
      toast("Compte créé pour " + email + ".");
      renderComptes();
    }).catch(function (err) {
      toast("Échec : " + erreurLien_(err));
    }).then(function () { majBoutonInviter_(); });
  }

  function majBoutonInviter_() {
    var btn = document.getElementById("btnInviterCompte");
    if (!btn) return;
    var email = document.getElementById("cptEmail").value.trim();
    var nom = document.getElementById("cptPrenom").value.trim() + document.getElementById("cptNom").value.trim();
    btn.disabled = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !nom;
  }

  function copierTexte_(texte, champ) {
    var ok = function () { toast("Message copié."); };
    var repli = function () { champ.select(); document.execCommand("copy"); ok(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texte).then(ok, repli);
    else repli();
  }

  function cablerPageComptes() {
    var page = document.getElementById("page-comptes");
    if (!page || page.dataset.cable) return;
    page.dataset.cable = "1";
    ["cptPrenom", "cptNom", "cptEmail"].forEach(function (id) { document.getElementById(id).addEventListener("input", majBoutonInviter_); });
    document.getElementById("formInviterCompte").addEventListener("submit", function (e) {
      e.preventDefault();
      if (!document.getElementById("btnInviterCompte").disabled) inviterCompte_();
    });
    page.addEventListener("click", function (e) {
      var b = e.target.closest("[data-action]");
      if (!b) return;
      if (b.dataset.action === "copier-message" || b.dataset.action === "partager-message") {
        var champ = page.querySelector(".cpt-message");
        if (!champ) return;
        if (b.dataset.action === "copier-message") copierTexte_(champ.value, champ);
        else navigator.share({ title: "Planning chantier", text: champ.value }).catch(function () {});
        return;
      }
      var carte = b.closest(".compte");
      var c = carte && (COMPTES_ || []).filter(function (x) { return x.user_id === carte.dataset.id; })[0];
      if (!c || b.dataset.action !== "retirer") return;
      demanderConfirmation("Retirer le compte de " + nomCompte_(c) + " ? Il ne pourra plus se connecter. Son planning (« " + c.planning + " ») et ses données restent.", function () {
        Promise.resolve(sbClient.rpc("retirer_compte", { p_user: c.user_id })).then(function (res) {
          if (res.error) throw res.error;
          COMPTES_ = (COMPTES_ || []).filter(function (x) { return x.user_id !== c.user_id; });
          renderListeComptes_();
          toast("Compte retiré.");
        }).catch(function (err) { toast("Échec : " + erreurLien_(err)); });
      });
    });
  }

  // Rôle et planning du compte connecté, lus après le premier rendu (cf.
  // demarrer, js/donnees-sync.js) : etat.admin (onglet Comptes) et
  // etat.planningId (dossier des fichiers joints, js/pieces-jointes.js). Un
  // échec (sans réseau) laisse l'onglet caché.
  function chargerMonCompte() {
    var lire = function (nom) {
      return new Promise(function (ok) { ok(sbClient.rpc(nom)); }).then(function (r) { return r && !r.error ? r.data : null; }, function () { return null; });
    };
    return Promise.all([lire("suis_admin"), lire("mon_planning")]).then(function (r) {
      etat.admin = r[0] === true;
      if (r[1]) etat.planningId = String(r[1]);
      majOngletComptes();
    });
  }

  // L'onglet n'apparaît qu'à l'administrateur (etat.admin, lu au chargement).
  function majOngletComptes() {
    document.querySelectorAll('[data-page="comptes"]').forEach(function (b) { b.hidden = !etat.admin; });
  }
