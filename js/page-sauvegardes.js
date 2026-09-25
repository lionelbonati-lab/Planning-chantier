"use strict";
  /* ============================================================
     SAUVEGARDES — round du 25.09.2026 (suite 49)
     ------------------------------------------------------------
     Proposition 14 retenue par Lionel (« 8,9,10,13,14,15 m'intéressent ») :
     « Sauvegarde automatique : un export régulier des données Supabase,
     pour pouvoir revenir en arrière après une grosse erreur. »

     Côté serveur (sql/0017_sauvegardes.sql) : une copie complète de toutes
     les tables chaque nuit (si quelque chose a changé), rangée dans la
     table `sauvegardes`, les 30 dernières gardées. Ici, section
     « Sauvegardes » de l'onglet Général :
       - la liste (date, type, nombre de lignes), les plus récentes en haut ;
       - « Sauvegarder maintenant » (sauvegarde manuelle, 20 gardées) ;
       - « Télécharger » : le fichier .json, à garder hors de Supabase ;
       - « Importer un fichier… » : un .json téléchargé plus tôt revient
         dans la liste (il reste à le restaurer) ;
       - « Restaurer… » : après confirmation, TOUT le planning est remplacé
         par cette sauvegarde. L'état actuel est d'abord sauvegardé
         (« Avant restauration ») : une restauration s'annule en
         restaurant celle-là. La page est ensuite rechargée (personnes,
         chantiers, statuts… sont lus au démarrage).
     ============================================================ */

  var ORIGINES_SAUVEGARDE = { auto: "Automatique", manuelle: "Manuelle", avant_restauration: "Avant restauration", importee: "Importée" };

  // « Jeu. 24 sept. 2026, 04:17 » (heure locale de l'appareil).
  function libelleDateSauvegarde_(ts) {
    var d = new Date(ts);
    var iso = d.getFullYear() + "-" + pad2_(d.getMonth() + 1) + "-" + pad2_(d.getDate());
    return libelleDateCourteIso(iso) + " " + d.getFullYear() + ", " + pad2_(d.getHours()) + ":" + pad2_(d.getMinutes());
  }
  function messageErreur_(err) { return err && err.message ? err.message : String(err); }

  function renderSauvegardes() {
    var zone = document.getElementById("listeSauvegardes");
    if (!zone) return;
    zone.innerHTML = '<p class="page-sous">Chargement…</p>';
    Promise.resolve(sbClient.from("sauvegardes").select("id, cree_le, origine, lignes").order("cree_le", { ascending: false }).limit(100))
      .then(function (res) {
        if (res.error) throw res.error;
        var liste = (res.data || []).slice().sort(function (a, b) { return a.cree_le < b.cree_le ? 1 : a.cree_le > b.cree_le ? -1 : b.id - a.id; });
        if (!liste.length) { zone.innerHTML = '<p class="page-sous">Aucune sauvegarde pour l’instant — la première se fera cette nuit, ou maintenant avec le bouton ci-dessus.</p>'; return; }
        zone.innerHTML = liste.map(function (s) {
          return '<div class="ligne-intervenant ligne-sauvegarde" data-id="' + s.id + '">' +
            '<span class="sv-infos"><b>' + esc(libelleDateSauvegarde_(s.cree_le)) + '</b>' +
            '<span class="sv-type sv-' + esc2(s.origine) + '">' + esc(ORIGINES_SAUVEGARDE[s.origine] || s.origine) + '</span>' +
            '<span class="sv-lignes">' + s.lignes + ' ligne' + (s.lignes > 1 ? 's' : '') + '</span></span>' +
            '<span class="ligne-actions">' +
            '<button type="button" class="lien-telecharger">Télécharger</button>' +
            '<button type="button" class="lien-restaurer">Restaurer…</button>' +
            '</span></div>';
        }).join("");
        zone.querySelectorAll(".ligne-sauvegarde").forEach(function (ligne) {
          var s = liste.filter(function (x) { return String(x.id) === ligne.dataset.id; })[0];
          ligne.querySelector(".lien-telecharger").addEventListener("click", function () { telechargerSauvegarde_(s); });
          ligne.querySelector(".lien-restaurer").addEventListener("click", function () { restaurerSauvegarde_(s); });
        });
      })
      .catch(function (err) { zone.innerHTML = '<p class="page-sous">Sauvegardes illisibles : ' + esc(messageErreur_(err)) + '</p>'; });
  }

  function sauvegarderMaintenant_(btn) {
    btn.disabled = true;
    Promise.resolve(sbClient.rpc("creer_sauvegarde", { p_origine: "manuelle" })).then(function (res) {
      if (res.error) throw res.error;
      toast("Sauvegarde faite.");
      renderSauvegardes();
    }).catch(function (err) { toast("Échec de la sauvegarde : " + messageErreur_(err)); })
      .then(function () { btn.disabled = false; });
  }

  // Fichier « planning-sauvegarde-2026-09-24-0417.json ».
  function telechargerSauvegarde_(s) {
    Promise.resolve(sbClient.from("sauvegardes").select("contenu").eq("id", s.id)).then(function (res) {
      if (res.error) throw res.error;
      var contenu = res.data && res.data[0] && res.data[0].contenu;
      if (!contenu) throw new Error("sauvegarde introuvable");
      var d = new Date(s.cree_le);
      var nom = "planning-sauvegarde-" + d.getFullYear() + "-" + pad2_(d.getMonth() + 1) + "-" + pad2_(d.getDate()) + "-" + pad2_(d.getHours()) + pad2_(d.getMinutes()) + ".json";
      var lien = document.createElement("a");
      lien.href = URL.createObjectURL(new Blob([JSON.stringify(contenu, null, 1)], { type: "application/json" }));
      lien.download = nom;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      setTimeout(function () { URL.revokeObjectURL(lien.href); }, 10000);
    }).catch(function (err) { toast("Échec du téléchargement : " + messageErreur_(err)); });
  }

  function importerFichierSauvegarde_(fichier) {
    if (!fichier) return;
    fichier.text().then(function (texte) {
      var contenu;
      try { contenu = JSON.parse(texte); } catch (e) { throw new Error("ce fichier n’est pas une sauvegarde du planning."); }
      return Promise.resolve(sbClient.rpc("importer_sauvegarde", { p_contenu: contenu }));
    }).then(function (res) {
      if (res.error) throw res.error;
      toast("Fichier importé : il est en haut de la liste, prêt à être restauré.");
      renderSauvegardes();
    }).catch(function (err) { toast("Import impossible : " + messageErreur_(err)); });
  }

  function restaurerSauvegarde_(s) {
    demanderConfirmation("Restaurer la sauvegarde du " + libelleDateSauvegarde_(s.cree_le) + " ? Tout le planning (tâches, jalons, notes, personnes, chantiers, réglages…) " +
      "sera remplacé par son contenu. L’état actuel est d’abord sauvegardé (« Avant restauration ») : tu pourras revenir en arrière.", function () {
      occupe(true);
      Promise.resolve(sbClient.rpc("restaurer_sauvegarde", { p_id: s.id })).then(function (res) {
        if (res.error) throw res.error;
        toast("Sauvegarde restaurée — rechargement…");
        setTimeout(function () { location.reload(); }, 600);
      }).catch(function (err) {
        occupe(false);
        toast("Échec de la restauration (rien n’a changé) : " + messageErreur_(err));
      });
    });
  }

  function cablerPageSauvegardes() {
    var btn = document.getElementById("btnSauvegarderMaintenant");
    if (btn) btn.addEventListener("click", function () { sauvegarderMaintenant_(btn); });
    var fichier = document.getElementById("fichierSauvegarde");
    var btnImporter = document.getElementById("btnImporterSauvegarde");
    if (fichier && btnImporter) {
      btnImporter.addEventListener("click", function () { fichier.value = ""; fichier.click(); });
      fichier.addEventListener("change", function () { importerFichierSauvegarde_(fichier.files && fichier.files[0]); });
    }
  }
