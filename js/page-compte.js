"use strict";
  /* ============================================================
     MON COMPTE — round du 26.09.2026 (suite 61)
     ------------------------------------------------------------
     Lionel : « Ajouter une page info personnel, pour entrée ses donnée
     comme Nom, Prénom, Entreprise, modification du mot de passe,
     suppression du compte et déconnexion. a mettre dans le menu setup »,
     puis : « Possibilté d'ajouter une photo de profile ».

     Page « Mon compte », première entrée du menu de la pastille (cf.
     PAGES_REGLAGES, js/coquille.js) :
       - photo de profil : recadrée en carré et réduite à 256 px dans le
         navigateur (JPEG, quelques dizaines de Ko), affichée dans la
         pastille à la place de l'initiale ;
       - prénom, nom, entreprise ; l'initiale de la pastille suit le prénom
         (« L » tant que rien n'est rempli, comme avant) ;
       - mot de passe : l'actuel est vérifié (nouvelle connexion) avant de
         poser le nouveau (8 caractères au moins) ;
       - se déconnecter ;
       - supprimer le compte : mot de passe + « SUPPRIMER » tapé, puis
         supprimer_mon_compte() (sql/0019) ; le planning n'est pas effacé.
     Stockage : table `profils` (sql/0019), une ligne par compte, visible
     de lui seul. Copie sur l'appareil (localStorage « planning.profil »,
     avec l'adresse du compte) : la photo est là dès l'ouverture, et sans
     réseau.
     ============================================================ */

  var CLE_PROFIL_LOCAL = "planning.profil";
  var profilCompte_ = null;      // { prenom, nom, entreprise, photo, maj, email }
  var utilisateurCompte_ = null; // { id, email } du compte connecté
  var COTE_PHOTO_ = 256;

  function lireProfilLocal_() {
    try { var p = JSON.parse(localStorage.getItem(CLE_PROFIL_LOCAL) || "null"); return p && typeof p === "object" ? p : null; } catch (e) { return null; }
  }
  function ecrireProfilLocal_(p) {
    try { if (p) localStorage.setItem(CLE_PROFIL_LOCAL, JSON.stringify(p)); else localStorage.removeItem(CLE_PROFIL_LOCAL); } catch (e) { /* stockage plein ou bloqué : la base garde tout */ }
  }
  // Seule une image en data URL est acceptée comme photo (jamais une
  // adresse quelconque venue de la base).
  function photoSure_(p) { return typeof p === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(p) ? p : null; }
  function initialeCompte_(p) {
    var t = ((p && (p.prenom || p.nom)) || "").trim();
    return t ? t.charAt(0).toUpperCase() : "L";
  }
  function nomAfficheCompte_(p) {
    var n = [p && p.prenom, p && p.nom].filter(function (x) { return x && x.trim(); }).join(" ").trim();
    return n || "Mon compte";
  }
  function messageErreurCompte_(err) {
    var m = String((err && err.message) || err || "");
    if (/should be different/i.test(m)) return "le nouveau mot de passe doit être différent de l’actuel.";
    if (/at least|weak|short/i.test(m)) return "mot de passe trop court ou trop simple (" + m + ").";
    if (/failed to fetch|network/i.test(m)) return "pas de réseau.";
    return m;
  }

  // Pastilles (haut, bas, en-tête du menu), menu et page.
  function afficherProfilCompte_() {
    var p = profilCompte_ || {};
    var photo = photoSure_(p.photo);
    document.querySelectorAll(".avatar-nav").forEach(function (a) {
      a.textContent = "";
      a.classList.toggle("avec-photo", !!photo);
      if (photo) { var img = document.createElement("img"); img.src = photo; img.alt = ""; a.appendChild(img); }
      else a.textContent = initialeCompte_(p);
    });
    var nom = document.getElementById("menuCompteNom");
    if (nom) nom.textContent = nomAfficheCompte_(p);
    var email = (utilisateurCompte_ && utilisateurCompte_.email) || p.email || "";
    ["menuCompteEmail", "compteEmail"].forEach(function (id) { var z = document.getElementById(id); if (z) z.textContent = email; });
    var ident = document.getElementById("compteMdpIdentifiant");
    if (ident) ident.value = email;
    var apercu = document.getElementById("comptePhotoApercu");
    if (apercu) {
      apercu.textContent = "";
      apercu.classList.toggle("avec-photo", !!photo);
      if (photo) { var im = document.createElement("img"); im.src = photo; im.alt = "Photo de profil"; apercu.appendChild(im); }
      else apercu.textContent = initialeCompte_(p);
    }
    var retirer = document.getElementById("btnRetirerPhoto");
    if (retirer) retirer.hidden = !photo;
  }
  // Un champ déjà modifié à la main n'est pas écrasé par la réponse du
  // serveur (arrivée pendant la saisie).
  var CHAMPS_PROFIL_ = [["comptePrenom", "prenom"], ["compteNom", "nom"], ["compteEntreprise", "entreprise"]];
  function remplirFormulaireCompte_() {
    var p = profilCompte_ || {};
    CHAMPS_PROFIL_.forEach(function (c) {
      var input = document.getElementById(c[0]);
      if (input && !input.dataset.modifie) input.value = p[c[1]] || "";
    });
  }

  // Appelée une fois la coquille posée (cablerMenuCompte, coquille.js) :
  // copie de l'appareil d'abord (si c'est bien ce compte), puis la base.
  function chargerInfosCompte() {
    Promise.resolve(sbClient.auth.getSession()).then(function (r) {
      var u = r && r.data && r.data.session && r.data.session.user;
      if (u) utilisateurCompte_ = { id: u.id || null, email: u.email || "" };
      var local = lireProfilLocal_();
      if (local && (!utilisateurCompte_ || !local.email || local.email === utilisateurCompte_.email)) profilCompte_ = local;
      afficherProfilCompte_();
      remplirFormulaireCompte_();
      return Promise.resolve(sbClient.from("profils").select("prenom, nom, entreprise, photo, maj").limit(1));
    }).then(function (res) {
      if (!res || res.error) return; // table injoignable : la copie de l'appareil reste
      var l = Array.isArray(res.data) ? res.data[0] : res.data;
      profilCompte_ = l ? { prenom: l.prenom || "", nom: l.nom || "", entreprise: l.entreprise || "", photo: l.photo || null, maj: l.maj || null } : null;
      if (profilCompte_ && utilisateurCompte_) profilCompte_.email = utilisateurCompte_.email;
      ecrireProfilLocal_(profilCompte_);
      afficherProfilCompte_();
      remplirFormulaireCompte_();
    }).catch(function () {});
  }

  // Enregistre seulement les colonnes changées (upsert : les autres
  // restent telles quelles sur la ligne existante).
  function enregistrerProfil_(changements, messageOk) {
    var ligne = Object.assign({ maj: new Date().toISOString() }, changements);
    if (utilisateurCompte_ && utilisateurCompte_.id) ligne.user_id = utilisateurCompte_.id;
    return Promise.resolve(sbClient.from("profils").upsert(ligne, { onConflict: "user_id" })).then(function (res) {
      if (res && res.error) throw res.error;
      profilCompte_ = Object.assign({ prenom: "", nom: "", entreprise: "", photo: null }, profilCompte_ || {}, changements, { maj: ligne.maj });
      if (utilisateurCompte_) profilCompte_.email = utilisateurCompte_.email;
      ecrireProfilLocal_(profilCompte_);
      afficherProfilCompte_();
      toast(messageOk);
      return true;
    }).catch(function (err) {
      toast("Pas enregistré : " + messageErreurCompte_(err));
      return false;
    });
  }

  // Photo choisie -> carré central, réduit à 256 px par moitiés successives
  // (une seule réduction d'une photo de téléphone de 4000 px crénelle).
  // Fond blanc sous une image transparente (PNG) : JPEG n'en a pas.
  function reduirePhoto_(fichier) {
    return new Promise(function (ok, ko) {
      if (!fichier || !/^image\//.test(fichier.type || "")) { ko(new Error("ce fichier n’est pas une image.")); return; }
      var url = URL.createObjectURL(fichier);
      var img = new Image();
      img.onload = function () {
        var c = Math.min(img.naturalWidth, img.naturalHeight);
        if (!c) { URL.revokeObjectURL(url); ko(new Error("image illisible.")); return; }
        var source = img, sx = (img.naturalWidth - c) / 2, sy = (img.naturalHeight - c) / 2, cote = c;
        while (cote / 2 >= COTE_PHOTO_ * 1.5) {
          var etape = document.createElement("canvas");
          etape.width = etape.height = Math.round(cote / 2);
          etape.getContext("2d").drawImage(source, sx, sy, cote, cote, 0, 0, etape.width, etape.width);
          source = etape; sx = 0; sy = 0; cote = etape.width;
        }
        var canvas = document.createElement("canvas");
        canvas.width = canvas.height = COTE_PHOTO_;
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, COTE_PHOTO_, COTE_PHOTO_);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(source, sx, sy, cote, cote, 0, 0, COTE_PHOTO_, COTE_PHOTO_);
        URL.revokeObjectURL(url);
        ok(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error("image illisible (format non pris en charge ?).")); };
      img.src = url;
    });
  }

  function deconnecterCompte() {
    var recharger = function () { window.location.reload(); };
    Promise.resolve(sbClient.auth.signOut()).then(recharger, recharger);
  }

  // Mot de passe du compte connecté vérifié par une nouvelle connexion
  // (même appel que l'écran de connexion). Renvoie un message d'erreur, ou
  // null si c'est le bon.
  function verifierMotDePasse_(motDePasse) {
    var email = utilisateurCompte_ && utilisateurCompte_.email;
    if (!email) return Promise.resolve("adresse du compte inconnue — reconnecte-toi.");
    return Promise.resolve(sbClient.auth.signInWithPassword({ email: email, password: motDePasse })).then(function (r) {
      if (r && r.error) return /invalid login credentials/i.test(r.error.message || "") ? "mot de passe actuel incorrect." : messageErreurCompte_(r.error);
      return null;
    }, function (err) { return messageErreurCompte_(err); });
  }

  function changerMotDePasse_() {
    var actuel = document.getElementById("compteMdpActuel");
    var nouveau = document.getElementById("compteMdpNouveau");
    var confirme = document.getElementById("compteMdpConfirme");
    var erreur = document.getElementById("erreurMotDePasse");
    var bouton = document.getElementById("btnChangerMotDePasse");
    function echec(m) { erreur.textContent = m.charAt(0).toUpperCase() + m.slice(1); bouton.disabled = false; bouton.textContent = "Changer le mot de passe"; }
    erreur.textContent = "";
    if (!actuel.value) { echec("tape ton mot de passe actuel."); actuel.focus(); return; }
    if (nouveau.value.length < 8) { echec("le nouveau mot de passe doit faire au moins 8 caractères."); nouveau.focus(); return; }
    if (nouveau.value !== confirme.value) { echec("les deux nouveaux mots de passe ne sont pas identiques."); confirme.focus(); return; }
    bouton.disabled = true; bouton.textContent = "Vérification…";
    verifierMotDePasse_(actuel.value).then(function (pb) {
      if (pb) { echec(pb); return; }
      return Promise.resolve(sbClient.auth.updateUser({ password: nouveau.value })).then(function (r) {
        if (r && r.error) { echec(messageErreurCompte_(r.error)); return; }
        actuel.value = nouveau.value = confirme.value = "";
        bouton.disabled = false; bouton.textContent = "Changer le mot de passe";
        toast("Mot de passe changé.");
      }, function (err) { echec(messageErreurCompte_(err)); });
    });
  }

  // Fenêtre de suppression : mot de passe + « SUPPRIMER », bouton rouge
  // actif seulement quand les deux sont là.
  function ouvrirSuppressionCompte_() {
    if (popFermerActuel) popFermerActuel();
    var email = (utilisateurCompte_ && utilisateurCompte_.email) || "";
    var overlay = document.createElement("div");
    overlay.className = "voile-confirm";
    var pop = document.createElement("div");
    pop.className = "pop confirm-pop pop-suppression-compte";
    pop.innerHTML = '<div class="cp-titre">Supprimer le compte</div>' +
      '<p class="confirm-texte">Le compte <b>' + esc(email) + '</b> sera supprimé définitivement : il ne pourra plus se connecter. ' +
      'Le planning (tâches, personnes, chantiers…) n’est pas effacé. S’il n’y a pas d’autre compte, il faudra en recréer un depuis Supabase pour se reconnecter.</p>' +
      '<label class="champ-compte"><span>Mot de passe</span><input type="password" class="sc-mdp" autocomplete="current-password"></label>' +
      '<label class="champ-compte"><span>Tape SUPPRIMER pour confirmer</span><input type="text" class="sc-mot" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>' +
      '<p class="erreur-compte" role="alert"></p>' +
      '<div class="confirm-boutons"><button type="button" class="c-annuler">Annuler</button>' +
      '<button type="button" class="c-ok danger" disabled>Supprimer définitivement</button></div>';
    document.body.appendChild(overlay);
    document.body.appendChild(pop);
    var mdp = pop.querySelector(".sc-mdp"), mot = pop.querySelector(".sc-mot"), ok = pop.querySelector(".c-ok"), erreur = pop.querySelector(".erreur-compte");
    var enCours = false;
    function pret() { return !!mdp.value && mot.value.trim().toUpperCase() === "SUPPRIMER"; }
    function majBouton() { ok.disabled = enCours || !pret(); }
    function fermer() {
      if (enCours) return;
      overlay.remove(); pop.remove();
      if (popFermerActuel === fermer) popFermerActuel = null;
      if (popValiderActuel === valider) popValiderActuel = null;
    }
    function valider() {
      if (enCours || !pret()) return;
      enCours = true; majBouton(); ok.textContent = "Suppression…"; erreur.textContent = "";
      verifierMotDePasse_(mdp.value).then(function (pb) {
        if (pb) throw new Error(pb);
        return Promise.resolve(sbClient.rpc("supprimer_mon_compte"));
      }).then(function (res) {
        if (res && res.error) throw res.error;
        ecrireProfilLocal_(null);
        deconnecterCompte();
      }).catch(function (err) {
        enCours = false; ok.textContent = "Supprimer définitivement"; majBouton();
        var m = messageErreurCompte_(err);
        erreur.textContent = "Compte non supprimé : " + m;
      });
    }
    mdp.addEventListener("input", majBouton);
    mot.addEventListener("input", majBouton);
    overlay.addEventListener("pointerdown", fermer);
    pop.querySelector(".c-annuler").addEventListener("click", fermer);
    ok.addEventListener("click", valider);
    popFermerActuel = fermer;
    popValiderActuel = valider;
    mdp.focus();
  }

  function htmlContenuPageCompte() {
    return '<div class="page-titre"><h1>Mon compte</h1></div>' +
      '<p class="page-sous">Connecté avec <b id="compteEmail"></b>.</p>' +
      '<section class="bloc-compte">' +
        '<h2 class="titre-liste">Photo de profil</h2>' +
        '<div class="compte-photo">' +
          '<span class="compte-photo-apercu" id="comptePhotoApercu">L</span>' +
          '<span class="compte-photo-actions">' +
            '<span class="compte-boutons">' +
              '<button type="button" class="btn-calculer" id="btnChoisirPhoto">Choisir une photo…</button>' +
              '<button type="button" class="btn-lien-compte" id="btnRetirerPhoto" hidden>Retirer</button>' +
            '</span>' +
            '<span class="compte-aide">Recadrée en carré, elle remplace l’initiale dans la pastille.</span>' +
            '<input type="file" id="fichierPhoto" accept="image/*" hidden>' +
          '</span>' +
        '</div>' +
      '</section>' +
      '<form class="bloc-compte" id="formInfosCompte" novalidate>' +
        '<h2 class="titre-liste">Informations personnelles</h2>' +
        '<div class="grille-champs-compte">' +
          '<label class="champ-compte"><span>Prénom</span><input type="text" id="comptePrenom" autocomplete="given-name" maxlength="80"></label>' +
          '<label class="champ-compte"><span>Nom</span><input type="text" id="compteNom" autocomplete="family-name" maxlength="80"></label>' +
          '<label class="champ-compte champ-large"><span>Entreprise</span><input type="text" id="compteEntreprise" autocomplete="organization" maxlength="120"></label>' +
        '</div>' +
        '<div class="compte-actions"><button type="submit" class="btn-enregistrer" id="btnEnregistrerInfos">Enregistrer</button></div>' +
      '</form>' +
      '<form class="bloc-compte" id="formMotDePasse" novalidate>' +
        '<h2 class="titre-liste">Mot de passe</h2>' +
        // Pour le gestionnaire de mots de passe du navigateur : le compte
        // dont on change le mot de passe.
        '<input type="email" id="compteMdpIdentifiant" autocomplete="username" hidden>' +
        '<div class="grille-champs-compte">' +
          '<label class="champ-compte champ-large"><span>Mot de passe actuel</span><input type="password" id="compteMdpActuel" autocomplete="current-password"></label>' +
          '<label class="champ-compte"><span>Nouveau mot de passe</span><input type="password" id="compteMdpNouveau" autocomplete="new-password"></label>' +
          '<label class="champ-compte"><span>Confirmer</span><input type="password" id="compteMdpConfirme" autocomplete="new-password"></label>' +
        '</div>' +
        '<p class="erreur-compte" id="erreurMotDePasse" role="alert"></p>' +
        '<div class="compte-actions"><button type="submit" class="btn-enregistrer" id="btnChangerMotDePasse">Changer le mot de passe</button></div>' +
      '</form>' +
      '<section class="bloc-compte">' +
        '<h2 class="titre-liste">Session</h2>' +
        '<div class="compte-ligne"><span>Quitter l’appli sur cet appareil.</span>' +
          '<button type="button" class="btn-calculer" id="btnDeconnexionCompte">Se déconnecter</button></div>' +
      '</section>' +
      '<section class="bloc-compte bloc-compte-danger">' +
        '<h2 class="titre-liste">Supprimer le compte</h2>' +
        '<div class="compte-ligne"><span>Le compte ne pourra plus se connecter. Le planning n’est pas effacé.</span>' +
          '<button type="button" class="btn-effacer" id="btnSupprimerCompte">Supprimer le compte…</button></div>' +
      '</section>';
  }

  function cablerPageCompte() {
    var form = document.getElementById("formInfosCompte");
    if (!form) return;
    CHAMPS_PROFIL_.forEach(function (c) {
      var input = document.getElementById(c[0]);
      input.addEventListener("input", function () { input.dataset.modifie = "1"; });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var changements = {};
      CHAMPS_PROFIL_.forEach(function (c) { changements[c[1]] = document.getElementById(c[0]).value.trim(); });
      var bouton = document.getElementById("btnEnregistrerInfos");
      bouton.disabled = true;
      enregistrerProfil_(changements, "Informations enregistrées.").then(function (fait) {
        bouton.disabled = false;
        if (fait) CHAMPS_PROFIL_.forEach(function (c) { var i = document.getElementById(c[0]); delete i.dataset.modifie; i.value = changements[c[1]]; });
      });
    });
    var fichier = document.getElementById("fichierPhoto");
    document.getElementById("btnChoisirPhoto").addEventListener("click", function () { fichier.value = ""; fichier.click(); });
    fichier.addEventListener("change", function () {
      var f = fichier.files && fichier.files[0];
      if (!f) return;
      reduirePhoto_(f).then(function (photo) {
        return enregistrerProfil_({ photo: photo }, "Photo de profil enregistrée.");
      }).catch(function (err) { toast("Photo non enregistrée : " + messageErreurCompte_(err)); });
    });
    document.getElementById("btnRetirerPhoto").addEventListener("click", function () {
      demanderConfirmation("Retirer la photo de profil ?", function () { enregistrerProfil_({ photo: null }, "Photo retirée."); });
    });
    document.getElementById("formMotDePasse").addEventListener("submit", function (e) { e.preventDefault(); changerMotDePasse_(); });
    document.getElementById("btnDeconnexionCompte").addEventListener("click", deconnecterCompte);
    document.getElementById("btnSupprimerCompte").addEventListener("click", ouvrirSuppressionCompte_);
  }
