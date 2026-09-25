"use strict";
  /* ============================================================
     LIENS DE CONSULTATION — round du 25.09.2026 (suite 51)
     ------------------------------------------------------------
     Proposition 10 retenue par Lionel (« 8,9,10,13,14,15 m'intéressent ») :
     « Lien de consultation : un lien en lecture seule à donner aux ouvriers
     ou aux sous-traitants pour qu'ils voient leur planning sur leur
     téléphone, sans pouvoir rien modifier. »

     Bouton « Lien » sur chaque ligne active des onglets Personnel et
     Intervenants (ligneFichePersonne, js/page-personnel.js). Il ouvre une
     fenêtre :
       - pas encore de lien : « Créer le lien » ;
       - sinon : l'adresse, « Copier », « Partager » (feuille de partage du
         téléphone : SMS, WhatsApp…), « Ouvrir », la date de la dernière
         consultation, « Nouveau lien » (l'ancien ne marche plus : lien
         transmis par erreur, personne partie) et « Supprimer le lien ».

     Table liens_consultation (sql/0018) : au plus un lien par personne. Le
     jeton (32 caractères hexadécimaux, 128 bits) est tiré ici avec
     crypto.getRandomValues. La page ouverte par le lien :
     consultation.html (js/consultation.js).
     ============================================================ */

  function nouveauJetonConsultation_() {
    var octets = new Uint8Array(16);
    crypto.getRandomValues(octets);
    return Array.prototype.map.call(octets, function (o) { return ("0" + o.toString(16)).slice(-2); }).join("");
  }
  function adresseConsultation(jeton) {
    return new URL("consultation.html?j=" + jeton, location.href).href;
  }
  function libelleVuLe_(ts) {
    if (!ts) return "Pas encore ouvert.";
    var d = new Date(ts);
    var iso = d.getFullYear() + "-" + pad2_(d.getMonth() + 1) + "-" + pad2_(d.getDate());
    return "Dernière consultation : " + libelleDateCourteIso(iso) + ", " + pad2_(d.getHours()) + ":" + pad2_(d.getMinutes()) + ".";
  }
  function erreurLien_(err) { return err && err.message ? err.message : String(err); }

  function ouvrirLienConsultation(id) {
    var p = personneParAncre(id);
    if (!p) return;
    if (popFermerActuel) popFermerActuel();
    var pop = document.createElement("div");
    pop.className = "pop form-pop pop-lien-consultation";
    pop.innerHTML = '<div class="cp-titre">Lien de consultation — ' + esc(p.nom) + "</div>" +
      '<div class="lc-contenu"><p class="lc-aide">Chargement…</p></div>' +
      '<div class="form-actions"><button type="button" class="f-annuler">Fermer</button></div>';
    positionnerPop(pop, Math.round(window.innerWidth / 2 - 170), Math.round(window.innerHeight / 2 - 140));
    var fermer = fermerAuClicExterieur(pop, null, null);
    pop.querySelector(".f-annuler").addEventListener("click", fermer);
    var contenu = pop.querySelector(".lc-contenu");
    var lien = null;

    function dessiner() {
      if (!lien) {
        contenu.innerHTML = '<p class="lc-aide">Un lien à envoyer à ' + esc(p.nom) + " : son planning, semaine par semaine, sur son téléphone, " +
          "sans connexion et sans rien pouvoir modifier. Seules ses tâches (et celles de son équipe) y sont visibles.</p>" +
          '<div class="lc-boutons"><button type="button" class="btn-enregistrer lc-creer">Créer le lien</button></div>';
        contenu.querySelector(".lc-creer").addEventListener("click", creer);
        return;
      }
      var url = adresseConsultation(lien.jeton);
      contenu.innerHTML = '<input type="text" class="lc-url" readonly value="' + esc2(url) + '">' +
        '<div class="lc-boutons">' +
        '<button type="button" class="btn-enregistrer lc-copier">Copier</button>' +
        (navigator.share ? '<button type="button" class="btn-calculer lc-partager">Partager…</button>' : "") +
        '<a class="btn-calculer lc-ouvrir" href="' + esc2(url) + '" target="_blank" rel="noopener">Ouvrir</a>' +
        "</div>" +
        '<p class="lc-vu">' + esc(libelleVuLe_(lien.vu_le)) + "</p>" +
        '<div class="lc-gestion">' +
        '<button type="button" class="lien-modifier lc-nouveau">Nouveau lien</button>' +
        '<button type="button" class="lien-supprimer lc-supprimer">Supprimer le lien</button>' +
        "</div>";
      var champ = contenu.querySelector(".lc-url");
      champ.addEventListener("focus", function () { champ.select(); });
      contenu.querySelector(".lc-copier").addEventListener("click", function () {
        var ok = function () { toast("Lien copié."); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(ok, function () { champ.select(); document.execCommand("copy"); ok(); });
        } else { champ.select(); document.execCommand("copy"); ok(); }
      });
      var partager = contenu.querySelector(".lc-partager");
      if (partager) partager.addEventListener("click", function () {
        navigator.share({ title: "Planning — " + p.nom, text: "Ton planning (consultation seule) :", url: url }).catch(function () {});
      });
      contenu.querySelector(".lc-nouveau").addEventListener("click", function () {
        demanderConfirmation("Remplacer le lien de « " + p.nom + " » ? L’ancien lien ne marchera plus : il faudra envoyer le nouveau.", remplacer);
      });
      contenu.querySelector(".lc-supprimer").addEventListener("click", function () {
        demanderConfirmation("Supprimer le lien de « " + p.nom + " » ? Il ne marchera plus.", supprimer);
      });
    }
    // La confirmation (demanderConfirmation) ferme cette fenêtre (clic
    // extérieur) : après « Nouveau lien » ou « Supprimer », elle est
    // rouverte, à jour.
    function echec(err) { toast("Échec : " + erreurLien_(err)); if (pop.isConnected) dessiner(); else ouvrirLienConsultation(id); }
    function creer() {
      var jeton = nouveauJetonConsultation_();
      Promise.resolve(sbClient.from("liens_consultation").insert({ personne_id: ancreDe(p.id), jeton: jeton })).then(function (res) {
        if (res.error) throw res.error;
        lien = { id: res.data && res.data[0] ? res.data[0].id : null, jeton: jeton, vu_le: null };
        if (lien.id == null) return charger();
        dessiner();
      }).catch(echec);
    }
    function remplacer() {
      var jeton = nouveauJetonConsultation_();
      Promise.resolve(sbClient.from("liens_consultation").update({ jeton: jeton, cree_le: new Date().toISOString(), vu_le: null }).eq("personne_id", ancreDe(p.id)))
        .then(function (res) {
          if (res.error) throw res.error;
          toast("Nouveau lien créé — l’ancien ne marche plus.");
          ouvrirLienConsultation(id);
        }).catch(echec);
    }
    function supprimer() {
      Promise.resolve(sbClient.from("liens_consultation").delete().eq("personne_id", ancreDe(p.id))).then(function (res) {
        if (res.error) throw res.error;
        toast("Lien supprimé.");
        ouvrirLienConsultation(id);
      }).catch(echec);
    }
    function charger() {
      return Promise.resolve(sbClient.from("liens_consultation").select("id, jeton, cree_le, vu_le").eq("personne_id", ancreDe(p.id))).then(function (res) {
        if (res.error) throw res.error;
        lien = res.data && res.data[0] ? res.data[0] : null;
        if (pop.isConnected) dessiner();
      }).catch(function (err) { contenu.innerHTML = '<p class="lc-aide">Liens illisibles : ' + esc(erreurLien_(err)) + "</p>"; });
    }
    charger();
  }
