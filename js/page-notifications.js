"use strict";
  /* ============================================================
     NOTIFICATIONS PUSH — round du 29.09.2026 (suite 126)
     ------------------------------------------------------------
     Lionel : « Notification Push sur le téléphone et l'ordinateur avec
     différents paramètre à régler dans l'appli. », puis, à notre question
     sur ce qui doit arriver : les 4 sortes, chacune avec son interrupteur —
     demandes d'absence, importants (la veille et le matin), à réserver,
     modifications faites sur un autre appareil.

     Page Réglages › Notifications (#page-notifications-push). Tout se règle
     APPAREIL PAR APPAREIL (un abonnement = le navigateur de cet appareil,
     table abonnements_push, sql/0027_notifications_push.sql) :
       - « Recevoir les notifications sur cet appareil » : demande la
         permission du navigateur, s'abonne (clé publique VAPID lue par
         cle_publique_push) et range l'adresse d'envoi ; éteint :
         désabonne et efface ;
       - les 4 sortes (interrupteurs) ;
       - sous chaque sorte, quand l'envoyer (suite 128, ci-dessous) ;
       - « Envoyer un essai » : un message tout de suite, pour vérifier ;
       - les autres appareils abonnés (nom, retrait).
     L'envoi : fonction Edge envoyer-push, appelée par pg_cron. L'affichage
     et le clic : sw.js (événements push / notificationclick).
     iPhone / iPad : seulement l'appli ajoutée à l'écran d'accueil et ouverte
     depuis son icône (iOS 16.4 et plus).
     À chaque ouverture de l'appli, un appareil abonné met à jour sa ligne
     (session de connexion reprise par la base : c'est elle qui dit « un
     autre appareil » pour les modifications).

     Round du 30.09.2026 (suite 128) — Lionel : « Notifications,
     notification différents pour chaque groupe de libellé différents.
     Possibilité de pour régler x jours avant et en fonction des horaires
     de travail. », puis, à nos questions : chaque sorte actuelle a ses
     propres réglages ; l'heure d'envoi est le « Début de demi journée ».
     Les 2 heures fixes (« La veille », « Le matin ») sont remplacées, sous
     chaque sorte, par une liste « Quand » (colonne reglages de
     abonnements_push, sql/0029) :
       - Importants, À réserver : le jour même, 1 à 5 ou 10 jours de travail
         avant (1 par défaut) ;
       - Demandes d'absence : toujours annoncées à leur arrivée ; en plus,
         « Rappel » x jours avant le début si elle attend encore (pas de
         rappel par défaut) ;
       - Modifications : pas de réglage (une minute après).
     Jours de travail : week-ends, fériés et vacances d'entreprise sautés.
     Envoi au début de la demi-journée concernée, selon la page Horaires
     (functions/envoyer-push/logic.js). La ligne « Quand » est cachée quand
     la sorte est éteinte.
     ============================================================ */

  // Suite 128 : « reglage » = clé dans abonnements_push.reglages ; « choix »
  // = [valeur, libellé] de la liste « Quand » ("" = pas d'envoi).
  var JOURS_AVANT_PUSH_ = [["0", "Le jour même"], ["1", "1 jour avant"], ["2", "2 jours avant"], ["3", "3 jours avant"], ["4", "4 jours avant"], ["5", "5 jours avant"], ["10", "10 jours avant"]];
  var TYPES_PUSH_ = [
    { cle: "demandes", nom: "Demandes d’absence", aide: "Dès qu’un ouvrier en envoie une depuis son lien.",
      reglage: "rappel_demandes", nomReglage: "Rappel", aideReglage: "Si la demande attend encore, avant le début de l’absence.",
      choix: [["", "Pas de rappel"], ["0", "Le jour même"], ["1", "1 jour avant"], ["2", "2 jours avant"], ["3", "3 jours avant"], ["5", "5 jours avant"]] },
    { cle: "importants", nom: "Importants", aide: "Tâches, jalons et notes marqués importants.",
      reglage: "importants", nomReglage: "Quand", aideReglage: "Au début de la demi-journée concernée (page Horaires).", choix: JOURS_AVANT_PUSH_ },
    { cle: "a_reserver", nom: "À réserver", aide: "Les tâches encore à réserver.",
      reglage: "a_reserver", nomReglage: "Quand", aideReglage: "Au début de la demi-journée de la tâche (page Horaires).", choix: JOURS_AVANT_PUSH_ },
    { cle: "modifs", nom: "Modifications d’un autre appareil", aide: "Une minute après le dernier changement fait ailleurs." }
  ];
  // Comme REGLAGES_DEFAUT de functions/envoyer-push/logic.js.
  var REGLAGES_PUSH_DEFAUT_ = { importants: 1, a_reserver: 1, rappel_demandes: null };
  function valeurReglagePush_(ligne, cle) {
    var r = (ligne && ligne.reglages) || {};
    var v = cle in r ? r[cle] : REGLAGES_PUSH_DEFAUT_[cle];
    return v === null || v === undefined ? "" : String(v);
  }

  function pushPrisEnCharge_() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }
  function estIos_() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function estAppliInstallee_() {
    return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  }
  // « iPhone · Safari », « Windows · Chrome »… pour la liste des appareils.
  function nomAppareilPush_() {
    var ua = navigator.userAgent;
    var sys = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "iPad"
      : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Appareil";
    var nav = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
    return sys + (nav ? " · " + nav : "");
  }
  function cleVersOctets_(b64) {
    var pad = "=".repeat((4 - b64.length % 4) % 4);
    var bin = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function octetsVersCle_(buf) {
    var s = "", b = new Uint8Array(buf);
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function erreurPush_(err) { return err && err.message ? err.message : String(err); }

  // Enregistrement du service worker (sw.js, posé par hors-ligne.js au
  // chargement) ; 8 s au plus.
  function inscriptionSw_() {
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise(function (ok, ko) { setTimeout(function () { ko(new Error("Service de l’appli pas prêt, recharge la page.")); }, 8000); })
    ]);
  }
  function abonnementCourant_() {
    if (!pushPrisEnCharge_()) return Promise.resolve(null);
    return inscriptionSw_().then(function (reg) { return reg.pushManager.getSubscription(); });
  }
  function ligneDepuisAbonnement_(sub) {
    var j = sub.toJSON();
    return { endpoint: sub.endpoint, p256dh: j.keys ? j.keys.p256dh : octetsVersCle_(sub.getKey("p256dh")), auth: j.keys ? j.keys.auth : octetsVersCle_(sub.getKey("auth")), nom_appareil: nomAppareilPush_() };
  }
  // Range (ou met à jour) la ligne de cet appareil ; renvoie la ligne.
  function rangerAbonnement_(sub) {
    return Promise.resolve(sbClient.from("abonnements_push").upsert(ligneDepuisAbonnement_(sub), { onConflict: "endpoint" }).select("*"))
      .then(function (res) { if (res.error) throw res.error; return (res.data || [])[0] || null; });
  }

  function htmlContenuPageNotificationsPush() {
    return '<div class="page-titre"><h1>Notifications</h1></div>' +
      '<p class="page-sous">Messages reçus sur cet appareil, même appli fermée. Chaque appareil a ses propres réglages.</p>' +
      '<div class="push-reglages">' +
        '<p class="push-etat" id="pushEtat" hidden></p>' +
        '<label class="reglage-ligne" for="chkPushActif"><span class="reglage-texte"><span class="reglage-nom"><b>Recevoir les notifications sur cet appareil</b></span><span id="pushNomAppareil"></span></span>' +
          '<span class="interrupteur"><input type="checkbox" id="chkPushActif"><span class="interrupteur-piste"></span></span></label>' +
        '<div id="pushDetails" hidden>' +
          '<h2 class="titre-liste">Quoi et quand</h2>' +
          '<p class="page-sous push-note">« Jours avant » : jours de travail (week-ends, fériés et vacances sautés). Envoi au début du matin ou de l’après-midi, selon la page Horaires.</p>' +
          TYPES_PUSH_.map(function (t) {
            var html = '<label class="reglage-ligne" for="chkPush-' + t.cle + '"><span class="reglage-texte"><span class="reglage-nom"><b>' + esc(t.nom) + '</b></span><span>' + esc(t.aide) + '</span></span>' +
              '<span class="interrupteur"><input type="checkbox" id="chkPush-' + t.cle + '" data-type="' + t.cle + '"><span class="interrupteur-piste"></span></span></label>';
            if (t.reglage) {
              html += '<label class="reglage-ligne push-quand" for="selPush-' + t.reglage + '" data-pour="' + t.cle + '"><span class="reglage-texte"><span class="reglage-nom"><b>' + esc(t.nomReglage) + '</b></span><span>' + esc(t.aideReglage) + '</span></span>' +
                '<select class="push-choix" id="selPush-' + t.reglage + '" data-reglage="' + t.reglage + '">' +
                t.choix.map(function (c) { return '<option value="' + c[0] + '">' + esc(c[1]) + '</option>'; }).join("") + '</select></label>';
            }
            return html;
          }).join("") +
          '<p class="push-actions"><button type="button" class="btn-calculer" id="btnPushEssai">Envoyer un essai</button></p>' +
        '</div>' +
        '<div id="pushAutres" hidden><h2 class="titre-liste">Autres appareils abonnés</h2><div class="liste-intervenants" id="pushListeAutres"></div></div>' +
      '</div>';
  }

  var lignePush_ = null; // ligne abonnements_push de cet appareil (null : pas abonné)
  function afficherEtatPush_(texte) {
    var p = document.getElementById("pushEtat");
    if (!p) return;
    p.hidden = !texte;
    p.textContent = texte || "";
  }
  function remplirPagePush_() {
    var chk = document.getElementById("chkPushActif");
    var details = document.getElementById("pushDetails");
    if (!chk || !details) return;
    chk.checked = !!lignePush_;
    details.hidden = !lignePush_;
    var nom = document.getElementById("pushNomAppareil");
    if (nom) nom.textContent = lignePush_ ? "Cet appareil : " + (lignePush_.nom_appareil || nomAppareilPush_()) : "";
    if (!lignePush_) return;
    var types = lignePush_.types || {};
    TYPES_PUSH_.forEach(function (t) {
      var c = document.getElementById("chkPush-" + t.cle);
      if (c) c.checked = types[t.cle] !== false;
      if (!t.reglage) return;
      var sel = document.getElementById("selPush-" + t.reglage);
      if (sel) sel.value = valeurReglagePush_(lignePush_, t.reglage);
    });
    majLignesQuandPush_();
  }
  // Ligne « Quand » / « Rappel » cachée quand sa sorte est éteinte.
  function majLignesQuandPush_() {
    document.querySelectorAll(".push-quand[data-pour]").forEach(function (l) {
      var c = document.getElementById("chkPush-" + l.dataset.pour);
      l.hidden = !!c && !c.checked;
    });
  }
  function renderAutresAppareilsPush_() {
    var bloc = document.getElementById("pushAutres"), zone = document.getElementById("pushListeAutres");
    if (!bloc || !zone) return;
    Promise.resolve(sbClient.from("abonnements_push").select("id, endpoint, nom_appareil, cree_le").order("cree_le")).then(function (res) {
      if (res.error) throw res.error;
      var autres = (res.data || []).filter(function (a) { return !lignePush_ || a.endpoint !== lignePush_.endpoint; });
      bloc.hidden = !autres.length;
      zone.innerHTML = autres.map(function (a) {
        return '<div class="ligne-intervenant push-appareil"><span class="push-appareil-nom">' + esc(a.nom_appareil || "Appareil") + '</span>' +
          '<span class="push-appareil-date">depuis le ' + esc(libelleDateCourteIso(String(a.cree_le).slice(0, 10))) + '</span>' +
          '<button type="button" class="lien-reset-tout" data-retirer="' + a.id + '">Retirer</button></div>';
      }).join("");
      zone.querySelectorAll("[data-retirer]").forEach(function (b) {
        b.addEventListener("click", function () {
          Promise.resolve(sbClient.from("abonnements_push").delete().eq("id", +b.dataset.retirer)).then(function (r) {
            if (r.error) throw r.error;
            renderAutresAppareilsPush_();
          }).catch(function (err) { toast("Retrait impossible : " + erreurPush_(err)); });
        });
      });
    }).catch(function () { bloc.hidden = true; });
  }

  // Ouverture de la page : état de cet appareil relu.
  function renderNotificationsPush() {
    var chk = document.getElementById("chkPushActif");
    if (!chk) return;
    if (!pushPrisEnCharge_()) {
      chk.disabled = true;
      lignePush_ = null;
      remplirPagePush_();
      afficherEtatPush_(estIos_() && !estAppliInstallee_()
        ? "Sur iPhone et iPad : ajoute d’abord l’appli à l’écran d’accueil (bouton Partager › « Sur l’écran d’accueil »), puis ouvre-la depuis son icône et reviens ici."
        : "Ce navigateur ne reçoit pas de notifications.");
      renderAutresAppareilsPush_();
      return;
    }
    chk.disabled = false;
    afficherEtatPush_(Notification.permission === "denied" ? "Notifications bloquées pour l’appli dans les réglages du navigateur ou de l’appareil : autorise-les là, puis reviens ici." : "");
    abonnementCourant_().then(function (sub) {
      if (!sub) return null;
      return Promise.resolve(sbClient.from("abonnements_push").select("*").eq("endpoint", sub.endpoint).limit(1)).then(function (res) {
        if (res.error) throw res.error;
        // Abonné dans le navigateur mais ligne effacée (retirée depuis un
        // autre appareil) : l'appareil reste abonné, ligne recréée.
        return (res.data || [])[0] || rangerAbonnement_(sub);
      });
    }).then(function (ligne) {
      lignePush_ = ligne;
      remplirPagePush_();
      renderAutresAppareilsPush_();
    }).catch(function (err) {
      afficherEtatPush_("État des notifications illisible : " + erreurPush_(err));
    });
  }

  function activerPush_() {
    // Permission d'abord, directement dans le geste (Safari l'exige).
    return Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") throw new Error(perm === "denied" ? "Notifications refusées pour l’appli : autorise-les dans les réglages du navigateur ou de l’appareil." : "Autorisation pas donnée.");
      return Promise.all([inscriptionSw_(), Promise.resolve(sbClient.rpc("cle_publique_push"))]);
    }).then(function (r) {
      var reg = r[0], res = r[1];
      if (res.error) throw res.error;
      if (!res.data) throw new Error("Notifications pas encore configurées sur le serveur.");
      return reg.pushManager.getSubscription().then(function (sub) {
        return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleVersOctets_(res.data) });
      });
    }).then(rangerAbonnement_);
  }
  function desactiverPush_() {
    return abonnementCourant_().then(function (sub) {
      var endpoint = sub ? sub.endpoint : lignePush_ && lignePush_.endpoint;
      return (sub ? sub.unsubscribe().catch(function () {}) : Promise.resolve()).then(function () {
        if (!endpoint) return null;
        return Promise.resolve(sbClient.from("abonnements_push").delete().eq("endpoint", endpoint)).then(function (res) { if (res.error) throw res.error; });
      });
    });
  }
  function enregistrerReglagePush_(champs) {
    if (!lignePush_) return;
    Object.assign(lignePush_, champs);
    Promise.resolve(sbClient.from("abonnements_push").update(champs).eq("endpoint", lignePush_.endpoint)).then(function (res) {
      if (res.error) throw res.error;
    }).catch(function (err) { toast("Réglage pas enregistré : " + erreurPush_(err)); });
  }

  function cablerPageNotificationsPush() {
    var chk = document.getElementById("chkPushActif");
    if (!chk || chk.dataset.cable) return;
    chk.dataset.cable = "1";
    chk.addEventListener("change", function () {
      var allumer = chk.checked;
      chk.disabled = true;
      (allumer ? activerPush_() : desactiverPush_()).then(function (ligne) {
        lignePush_ = allumer ? ligne : null;
        afficherEtatPush_("");
        if (allumer) toast("Notifications activées sur cet appareil.");
      }).catch(function (err) {
        afficherEtatPush_(erreurPush_(err));
      }).then(function () {
        chk.disabled = false;
        remplirPagePush_();
        renderAutresAppareilsPush_();
      });
    });
    TYPES_PUSH_.forEach(function (t) {
      var c = document.getElementById("chkPush-" + t.cle);
      // Les 4 sortes enregistrées ensemble, telles qu'affichées.
      if (c) c.addEventListener("change", function () {
        var types = {};
        TYPES_PUSH_.forEach(function (u) { types[u.cle] = document.getElementById("chkPush-" + u.cle).checked; });
        enregistrerReglagePush_({ types: types });
        majLignesQuandPush_();
      });
      // « Quand » / « Rappel » (suite 128) : les 3 réglages enregistrés
      // ensemble, tels qu'affichés ("" = pas de rappel → null).
      var sel = t.reglage && document.getElementById("selPush-" + t.reglage);
      if (sel) sel.addEventListener("change", function () {
        var reglages = {};
        TYPES_PUSH_.forEach(function (u) {
          if (!u.reglage) return;
          var v = document.getElementById("selPush-" + u.reglage).value;
          reglages[u.reglage] = v === "" ? null : +v;
        });
        enregistrerReglagePush_({ reglages: reglages });
      });
    });
    document.getElementById("btnPushEssai").addEventListener("click", function () {
      if (!lignePush_) return;
      var b = this;
      b.disabled = true;
      Promise.resolve(sbClient.functions.invoke("envoyer-push", { body: { test: lignePush_.endpoint } })).then(function (res) {
        if (res.error) throw res.error;
        if (!res.data || !res.data.ok) throw new Error((res.data && res.data.erreur) || "envoi refusé");
        toast("Essai envoyé : il arrive dans quelques secondes.");
      }).catch(function (err) {
        toast("Essai pas envoyé : " + erreurPush_(err));
      }).then(function () { b.disabled = false; });
    });
  }

  // À chaque ouverture de l'appli (connecté) : la ligne de cet appareil
  // reprend sa session de connexion, et revient si elle avait été effacée.
  function rafraichirAbonnementPush() {
    if (!pushPrisEnCharge_() || Notification.permission !== "granted" || !window.sbClient) return Promise.resolve();
    return abonnementCourant_().then(function (sub) {
      if (!sub) return null;
      return rangerAbonnement_(sub).then(function (ligne) { lignePush_ = ligne; });
    }).catch(function () { /* réessayé à la prochaine ouverture */ });
  }

  // Clic sur une notification (sw.js) : l'appli s'ouvre ou revient au
  // premier plan ; demandes, importants, à réserver ouvrent la fenêtre
  // Notifications.
  function ouvrirNotificationsDepuisPush_() {
    var pagePlanning = document.getElementById("page-planning");
    if (pagePlanning && !pagePlanning.classList.contains("actif")) {
      var onglet = document.querySelector('.onglet[data-page="planning"]');
      if (onglet) onglet.click();
    }
    if (typeof ouvrirNotifications === "function") ouvrirNotifications();
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (e) {
      if (e.data && e.data.type === "ouvrir-notifications") ouvrirNotificationsDepuisPush_();
    });
  }
  function ouvrirNotificationsSiDemande() {
    if (location.hash !== "#notifications") return;
    history.replaceState(null, "", location.pathname + location.search);
    ouvrirNotificationsDepuisPush_();
  }
