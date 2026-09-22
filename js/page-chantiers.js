"use strict";
  /* ============================================================
     PAGE "CHANTIERS" — CRUD complet (§7 du spec). Phase 4/étape 3 (§6bis) :
     ajouterChantierServeur/majCouleurChantierServeur/renommerChantierServeur/
     compterUtilisationsChantierServeur/retirerChantierServeur (section
     "CONFIG SIMPLE" plus bas) remplacent apiEnregistrerChantiers/
     apiRenommerChantier/apiCompterUtilisationsChantier/apiSupprimerChantier.
     Renommer ne migre plus aucune case : les cases du planning renvoient à
     un chantier par SON ID (assignations.chantier_id, une vraie clé
     étrangère, sql/0001) et non plus par son nom — ce que
     apiRenommerChantier devait faire à la main (balayer toutes les cases du
     classeur) est donc devenu un non-problème, un simple update. Supprimer
     compte/vide TOUTES les cases concernées, passées comprises (déviation
     assumée par rapport à l'ancien "semaine affichée et suivantes
     seulement" — la contrainte de clé étrangère l'exige de toute façon, cf.
     compterUtilisationsChantierServeur).
     ============================================================ */
  // opts.premier/opts.dernier : cf. commentaire équivalent sur
  // ligneFichePersonne — même logique de bornes, même absence de flèches
  // sur une ligne désactivée.
  function ligneFicheChantier(c, opts) {
    opts = opts || {};
    if (!c.actif) {
      return '<div class="ligne-intervenant ligne-desactivee" data-ligne="' + c.ligne + '">' +
        '<span class="gauche-chantier"><span class="swatch-chantier" style="background:' + esc2(c.couleur) + '"></span><b>' + esc(c.nom) + '</b></span>' +
        '<span class="ligne-actions">' +
        '<button type="button" class="lien-reactiver">Réactiver</button>' +
        '<button type="button" class="lien-supprimer-def" title="Supprimer définitivement">' + ICONS.trash + ' Supprimer</button>' +
        '</span></div>';
    }
    return '<div class="ligne-intervenant" data-ligne="' + c.ligne + '">' +
      '<span class="cf-actions">' +
      '<button type="button" class="cf-monter" title="Monter"' + (opts.premier ? " disabled" : "") + '>↑</button>' +
      '<button type="button" class="cf-descendre" title="Descendre"' + (opts.dernier ? " disabled" : "") + '>↓</button>' +
      '</span>' +
      '<span class="gauche-chantier"><span class="swatch-chantier" style="background:' + esc2(c.couleur) + '"></span><b>' + esc(c.nom) + '</b></span>' +
      '<span class="ligne-actions">' +
      // <label>, pas <span> : le piste couvre TOUT le .interrupteur en
      // position absolute (cf. .interrupteur-piste), le checkbox lui-même
      // n'est donc jamais atteignable au clic direct — seul le
      // label-forwarding natif du navigateur le rend cliquable, exactement
      // comme .reglage-ligne (chkWeekends, htmlPageGeneral) qui est déjà un
      // <label> pour la même raison. Repéré en écrivant
      // verif_tri_desactiver.js (round du 14.09.2026, Playwright ne
      // parvenait pas à cliquer le checkbox) : sans <label>, l'interrupteur
      // aurait été inerte au clic pour de vrais utilisateurs aussi, pas
      // seulement pour le test.
      '<label class="champ-actif"><span class="interrupteur"><input type="checkbox" checked><span class="interrupteur-piste"></span></span>Actif</label>' +
      '<button type="button" class="lien-modifier">Couleur</button>' +
      '<button type="button" class="lien-renommer">Renommer</button>' +
      '</span></div>';
  }
  // ↑/↓ chantiers — même schéma qu'echangerOrdrePersonnes (2 updates
  // serveur sur les `ordre` voisins, puis rafraîchissement complet).
  function echangerOrdreChantiers(c, direction, actifs) {
    var idx = -1;
    for (var i = 0; i < actifs.length; i++) if (actifs[i].ligne === c.ligne) { idx = i; break; }
    var j = idx + direction;
    if (idx < 0 || j < 0 || j >= actifs.length) return;
    var a = actifs[idx], b = actifs[j];
    Promise.all([
      sbClient.from("chantiers").update({ ordre: b.ordre }).eq("id", a.ligne),
      sbClient.from("chantiers").update({ ordre: a.ordre }).eq("id", b.ligne)
    ]).then(function (r) {
      r.forEach(function (res) { if (res.error) throw res.error; });
      return resultatChantiers_();
    }).then(function (r) { rafraichirApresChantiers(r); })
      .catch(function (err) { toast("Échec du tri : " + (err && err.message ? err.message : err)); });
  }
  // etat.chantiers est la liste COMPLÈTE (actifs + désactivés, cf.
  // listerChantiersDepuisServeur plus bas) — contrairement à
  // etat.personnesActives, jamais filtrée côté "source de vérité" : un
  // chantier désactivé doit rester résolvable pour les cases déjà posées
  // (CHANTIERS/etat.chantiersParId en ont besoin, cf. construireVueDepuisCache/
  // demarrer). Cette page-ci fait donc elle-même le tri actifs/désactivés,
  // plutôt que de dépendre d'un filtre serveur.
  function renderChantiers() {
    var zone = document.getElementById("listeChantiers");
    if (!zone) return;
    var actifs = etat.chantiers.filter(function (c) { return c.actif !== false; });
    var inactifs = etat.chantiers.filter(function (c) { return c.actif === false; });
    var html = actifs.map(function (c, i) {
      return ligneFicheChantier(c, { premier: i === 0, dernier: i === actifs.length - 1 });
    }).join("") + '<button type="button" class="ligne-ajouter">+ Ajouter</button>';
    if (inactifs.length) {
      html += '<button type="button" class="repli-desactives"><span class="chevron">›</span> Désactivés (' + inactifs.length + ')</button>' +
        '<div class="groupe-desactives" hidden>' + inactifs.map(function (c) { return ligneFicheChantier(c); }).join("") + '</div>';
    }
    zone.innerHTML = html;
    function chantierDeLigne(btn) {
      var ligne = +btn.closest("[data-ligne]").dataset.ligne;
      return etat.chantiers.filter(function (x) { return x.ligne === ligne; })[0];
    }
    zone.querySelectorAll(".lien-modifier").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var c = chantierDeLigne(btn);
        if (c) ouvrirCouleurChantier(c);
      });
    });
    zone.querySelectorAll(".lien-renommer").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var c = chantierDeLigne(btn);
        if (c) ouvrirRenommerChantier(c);
      });
    });
    zone.querySelectorAll(".lien-reactiver").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var c = chantierDeLigne(btn);
        if (!c) return;
        basculerActifChantierServeur(c.ligne, true).then(function () { return resultatChantiers_(); }).then(function (r) {
          rafraichirApresChantiers(r);
          toast("Chantier réactivé.");
        }).catch(function (err) { toast("Échec : " + (err && err.message ? err.message : err)); });
      });
    });
    // Suppression définitive — cf. retirerChantierServeur (déjà un vrai
    // DELETE de longue date, simplement déplacé ici depuis la ligne active
    // d'origine) : uniquement proposée sur un chantier déjà désactivé.
    zone.querySelectorAll(".lien-supprimer-def").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var c = chantierDeLigne(btn);
        if (!c) return;
        compterUtilisationsChantierServeur(c.ligne).then(function (n) {
          var titre = "Supprimer définitivement « " + c.nom + " »" +
            (n ? " et vider " + (n === 1 ? "la case qui l’utilise" : "les " + n + " cases qui l’utilisent") : "") +
            " ? Cette action est irréversible.";
          demanderConfirmation(titre, function () {
            retirerChantierServeur(c.ligne).then(function (r) {
              rafraichirApresChantiers(r, true); // true = invalide le cache (chantier retiré des cases qui l'utilisaient)
              toast("Chantier supprimé définitivement.");
            }).catch(function (err) { toast("Échec de la suppression : " + (err && err.message ? err.message : err)); });
          });
        }).catch(function (err) { toast("Échec : " + (err && err.message ? err.message : err)); });
      });
    });
    // Interrupteur "Actif" — cf. commentaire équivalent sur
    // cablerListePersonnes : décocher = désactiver, revert visuel immédiat,
    // le rafraîchissement après confirmation fait le reste.
    zone.querySelectorAll(".ligne-intervenant:not(.ligne-desactivee) .interrupteur input").forEach(function (chk) {
      chk.addEventListener("change", function () {
        var c = chantierDeLigne(chk);
        chk.checked = true;
        if (!c) return;
        compterUtilisationsChantierServeur(c.ligne).then(function (n) {
          var titre = "Désactiver « " + c.nom + " »" +
            (n ? " (encore utilisé par " + (n === 1 ? "1 case" : n + " cases") + ", qui restent affichées telles quelles)" : "") + " ?";
          demanderConfirmation(titre, function () {
            basculerActifChantierServeur(c.ligne, false).then(function () { return resultatChantiers_(); }).then(function (r) {
              rafraichirApresChantiers(r);
              toast("Chantier désactivé.");
            }).catch(function (err) { toast("Échec : " + (err && err.message ? err.message : err)); });
          });
        }).catch(function (err) { toast("Échec : " + (err && err.message ? err.message : err)); });
      });
    });
    zone.querySelectorAll(".cf-monter").forEach(function (btn) {
      btn.addEventListener("click", function () { var c = chantierDeLigne(btn); if (c) echangerOrdreChantiers(c, -1, actifs); });
    });
    zone.querySelectorAll(".cf-descendre").forEach(function (btn) {
      btn.addEventListener("click", function () { var c = chantierDeLigne(btn); if (c) echangerOrdreChantiers(c, 1, actifs); });
    });
    var btnAdd = zone.querySelector(".ligne-ajouter");
    if (btnAdd) btnAdd.addEventListener("click", ouvrirAjoutChantier);
    var btnRepli = zone.querySelector(".repli-desactives");
    if (btnRepli) btnRepli.addEventListener("click", function () {
      btnRepli.classList.toggle("ouvert");
      var groupe = zone.querySelector(".groupe-desactives");
      if (groupe) groupe.hidden = !btnRepli.classList.contains("ouvert");
    });
  }
  function couleurProposeeChantier() {
    var utilisees = {};
    etat.chantiers.forEach(function (c) { utilisees[(c.couleur || "").toLowerCase()] = true; });
    var palette = etat.palette || [];
    for (var i = 0; i < palette.length; i++) if (!utilisees[palette[i].toLowerCase()]) return palette[i];
    return palette[0] || "#adcbef";
  }
  // invaliderCache : nécessaire seulement quand le NOM d'un chantier a pu
  // changer (renommage) ou qu'un chantier a disparu (suppression) — ces
  // 2 cas rendent périmé le texte déjà "cuit" dans les semaines en cache
  // (chargerSemaineDepuisServeur traduit chantier_id -> nom au moment du
  // chargement, cf. construireDonneesSemaine ; un simple ajout ou
  // changement de couleur n'a pas besoin d'y toucher, la couleur est
  // relue en direct depuis CHANTIERS à chaque render(), jamais mise en cache).
  function rafraichirApresChantiers(r, invaliderCache) {
    etat.chantiers = r.chantiers || [];
    etat.chantierParNom = {};
    etat.chantiers.forEach(function (c) { etat.chantierParNom[c.nom] = c; });
    etat.chantiersParId = {};
    etat.chantiers.forEach(function (c) { etat.chantiersParId[c.ligne] = c.nom; });
    function finir() {
      construireVueDepuisCache();
      construireSelectChantier();
      render(false);
      renderChantiers();
    }
    if (invaliderCache) {
      oublierCache(null);
      assurerFenetreChargee(finir);
    } else {
      finir();
    }
  }
  function ouvrirAjoutChantier() {
    var pop = document.createElement("div");
    pop.className = "pop form-pop";
    pop.innerHTML =
      '<div class="cp-titre">Ajouter — Chantier</div>' +
      '<input type="text" class="f-nom" placeholder="Nom du chantier…">' +
      '<div class="champ-couleur-chantier"><label>Couleur</label><input type="color" class="f-couleur" value="' + couleurProposeeChantier() + '"></div>' +
      '<div class="form-actions"><button type="button" class="f-annuler">Annuler</button><button type="button" class="f-ok">Enregistrer</button></div>';
    var px = Math.round(window.innerWidth / 2 - 110), py = Math.round(window.innerHeight / 2 - 90);
    positionnerPop(pop, px, py);
    var fermer = fermerAuClicExterieur(pop, null, function () { pop.querySelector(".f-ok").click(); });
    var inputNom = pop.querySelector(".f-nom");
    pop.querySelector(".f-annuler").addEventListener("click", fermer);
    pop.querySelector(".f-ok").addEventListener("click", function () {
      var nom = inputNom.value.trim();
      if (!nom) { fermer(); return; }
      fermer();
      ajouterChantierServeur(nom, pop.querySelector(".f-couleur").value).then(function (r) {
        rafraichirApresChantiers(r);
        toast("Chantier ajouté.");
      }).catch(function (err) { toast("Échec de l’ajout : " + (err && err.message ? err.message : err)); });
    });
    inputNom.focus();
  }
  function ouvrirCouleurChantier(c) {
    var pop = document.createElement("div");
    pop.className = "pop form-pop";
    pop.innerHTML =
      '<div class="cp-titre">' + esc(c.nom) + '</div>' +
      '<div class="champ-couleur-chantier"><label>Couleur</label><input type="color" class="f-couleur" value="' + esc2(c.couleur) + '"></div>' +
      '<div class="note-panneau">Le nom d’un chantier existant ne peut pas être changé ici — il sert de clé dans les cases déjà remplies du planning.</div>' +
      '<div class="form-actions"><button type="button" class="f-annuler">Annuler</button><button type="button" class="f-ok">Enregistrer</button></div>';
    var px = Math.round(window.innerWidth / 2 - 110), py = Math.round(window.innerHeight / 2 - 90);
    positionnerPop(pop, px, py);
    var fermer = fermerAuClicExterieur(pop, null, function () { pop.querySelector(".f-ok").click(); });
    pop.querySelector(".f-annuler").addEventListener("click", fermer);
    pop.querySelector(".f-ok").addEventListener("click", function () {
      var couleur = pop.querySelector(".f-couleur").value;
      fermer();
      majCouleurChantierServeur(c.ligne, couleur).then(function (r) {
        rafraichirApresChantiers(r);
        toast("Modifié.");
      }).catch(function (err) { toast("Échec de la modification : " + (err && err.message ? err.message : err)); });
    });
  }
  function ouvrirRenommerChantier(c) {
    var pop = document.createElement("div");
    pop.className = "pop form-pop";
    pop.innerHTML =
      '<div class="cp-titre">Renommer — ' + esc(c.nom) + '</div>' +
      '<input type="text" class="f-nom" value="' + esc2(c.nom) + '">' +
      '<div class="note-panneau">Le nouveau nom apparaît partout où ce chantier est déjà utilisé, y compris les semaines passées (le lien se fait par identifiant, pas par le nom).</div>' +
      '<div class="form-actions"><button type="button" class="f-annuler">Annuler</button><button type="button" class="f-ok">Enregistrer</button></div>';
    var px = Math.round(window.innerWidth / 2 - 110), py = Math.round(window.innerHeight / 2 - 90);
    positionnerPop(pop, px, py);
    var fermer = fermerAuClicExterieur(pop, null, function () { pop.querySelector(".f-ok").click(); });
    var inputNom = pop.querySelector(".f-nom");
    pop.querySelector(".f-annuler").addEventListener("click", fermer);
    pop.querySelector(".f-ok").addEventListener("click", function () {
      var nom = inputNom.value.trim();
      if (!nom || nom === c.nom) { fermer(); return; }
      fermer();
      renommerChantierServeur(c.ligne, nom).then(function (r) {
        rafraichirApresChantiers(r, true); // true = invalide le cache (nom "cuit" dans les semaines déjà chargées, cf. rafraichirApresChantiers)
        toast("Chantier renommé.");
      }).catch(function (err) { toast("Échec du renommage : " + (err && err.message ? err.message : err)); });
    });
    inputNom.focus();
    inputNom.select();
  }
  // supprimerChantierServeur (le lien "Supprimer" d'origine sur une ligne
  // active, qui appelait déjà retirerChantierServeur — un vrai DELETE) a
  // disparu au round du 14.09.2026 : désactiver (interrupteur "Actif") est
  // maintenant l'action proposée sur une ligne active, la vraie suppression
  // (même retirerChantierServeur, inchangée) n'est plus proposée que depuis
  // "Désactivés" — cf. renderChantiers ci-dessus.

