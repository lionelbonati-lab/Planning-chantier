"use strict";
  /* ============================================================
     PAGES "PERSONNEL" / "INTERVENANTS" — CRUD (§6 du spec). Phase 4/étape 3
     (§6bis) : ajouterPersonneServeur/renommerPersonneServeur/
     basculerActifPersonneServeur (section "CONFIG SIMPLE" plus bas)
     remplacent apiAjouterPersonne/apiRenommerPersonne/apiSupprimerPersonne.
     Le concept de "portée" (cette semaine seulement / et les suivantes)
     DISPARAÎT ici : c'était un contournement du classeur (une personne = 4
     lignes PARTAGÉES par toutes les semaines, "renommer à partir de telle
     semaine" = réécrire seulement les colonnes de cette semaine et des
     suivantes). Une personne est maintenant une seule vraie ligne
     `personnes`, valable pour toutes les semaines à la fois —
     renommer/désactiver s'applique donc TOUJOURS partout, passé compris,
     sans qu'aucun prompt de portée n'ait plus de sens à proposer
     (demanderPortee2 retiré). Désactiver reste un simple "vider" côté
     planning, comme avant (actif=false, pas un DELETE, cf.
     basculerActifPersonneServeur) — round du 14.09.2026 : une vraie
     suppression (irréversible, cascade sur l'historique) existe désormais
     EN PLUS, mais séparément, cf. supprimerPersonnePermanenceServeur.
     ============================================================ */
  function rafraichirApresPersonnel() {
    // Un ajout/renommage/désactivation touche potentiellement toutes les
    // semaines (jamais scopé à "depuis la semaine affichée" comme avant,
    // cf. commentaire ci-dessus) : tout le cache est invalidé plutôt que
    // seulement depuis labGCourant(). etat.personnesActives est rechargé
    // AVANT de redemander la fenêtre affichée, sans quoi
    // chargerSemaineDepuisServeur filtrerait encore sur l'ancienne liste.
    oublierCache(null);
    TACHES_PAR_PERSONNE = null; promesseTachesParPersonne = null;
    rechargerPersonnesActives_().then(function () {
      assurerFenetreChargee(function () {
        construireVueDepuisCache();
        render(false);
        renderPersonnel(); renderIntervenants();
      });
    }).catch(erreurFatale);
  }
  // texteCompteurTaches(n) : null tant que le chargement n'est pas terminé
  // (case laissée vide plutôt qu'un "0" trompeur pendant l'attente).
  function texteCompteurTaches(n) {
    if (n == null) return "";
    return n === 0 ? "Aucune tâche en cours" : (n === 1 ? "1 tâche en cours" : n + " tâches en cours");
  }
  // opts.premier/opts.dernier : bornes du groupe ACTIF affiché (désactive
  // ↑ en tête, ↓ en fin — même logique que .cf-monter/.cf-descendre
  // d'Entrée rapide). Absents (undefined) pour une ligne désactivée, qui
  // n'a pas de flèches — cf. commentaire de tête plus haut (round du
  // 14.09.2026).
  function ligneFichePersonne(p, opts) {
    opts = opts || {};
    var n = TACHES_PAR_PERSONNE ? TACHES_PAR_PERSONNE[p.id] : null;
    if (!p.actif) {
      return '<div class="ligne-intervenant ligne-desactivee" data-id="' + esc2(p.id) + '"><b>' + esc(p.nom) + '</b>' +
        '<span class="compte"></span>' +
        '<span class="ligne-actions">' +
        '<button type="button" class="lien-reactiver">Réactiver</button>' +
        '<button type="button" class="lien-supprimer-def" title="Supprimer définitivement">' + ICONS.trash + ' Supprimer</button>' +
        '</span></div>';
    }
    return '<div class="ligne-intervenant" data-id="' + esc2(p.id) + '">' +
      '<span class="cf-actions">' +
      '<button type="button" class="cf-monter" title="Monter"' + (opts.premier ? " disabled" : "") + '>↑</button>' +
      '<button type="button" class="cf-descendre" title="Descendre"' + (opts.dernier ? " disabled" : "") + '>↓</button>' +
      '</span>' +
      '<b>' + esc(p.nom) + '</b>' +
      '<span class="compte">' + esc(texteCompteurTaches(n == null ? null : n)) + '</span>' +
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
      '<button type="button" class="lien-modifier">Modifier</button>' +
      '</span></div>';
  }
  // Charge compterTachesPersonnesServeur() une seule fois (mémorisée dans
  // promesseTachesParPersonne, cf. section "CONFIG SIMPLE" plus bas), puis
  // patche directement les badges déjà à l'écran — jamais un re-render
  // complet depuis ce callback (renderPersonnel/renderIntervenants
  // appellent elles-mêmes chargerCompteursTaches : un re-render en boucle
  // depuis ici recréerait la boucle).
  function chargerCompteursTaches() {
    if (TACHES_PAR_PERSONNE) { appliquerCompteursTaches(); return; }
    if (!promesseTachesParPersonne) {
      promesseTachesParPersonne = compterTachesPersonnesServeur().then(function (r) {
        TACHES_PAR_PERSONNE = r || {};
        appliquerCompteursTaches();
      }).catch(function () {
        promesseTachesParPersonne = null; // échec : pas de compteur affiché, retenté à la prochaine ouverture de page
      });
    }
  }
  function appliquerCompteursTaches() {
    document.querySelectorAll(".ligne-intervenant[data-id] .compte").forEach(function (el) {
      var id = el.closest("[data-id]").dataset.id;
      el.textContent = texteCompteurTaches(TACHES_PAR_PERSONNE[id]);
    });
  }
  // ↑/↓ : échange l'ordre entre 2 lignes ACTIVES voisines (jamais les
  // désactivées, qui n'ont pas de flèches) — 2 updates serveur puis
  // rafraîchissement complet, même schéma que pour les chantiers plus bas
  // (echangerOrdreChantiers). `actifs` = tableau déjà trié par ordre,
  // capturé en fermeture au moment du rendu (cf. renderListePersonnes).
  function echangerOrdrePersonnes(id, direction, actifs) {
    var idx = -1;
    for (var i = 0; i < actifs.length; i++) if (actifs[i].id === String(id)) { idx = i; break; }
    var j = idx + direction;
    if (idx < 0 || j < 0 || j >= actifs.length) return;
    var a = actifs[idx], b = actifs[j];
    Promise.all([
      sbClient.from("personnes").update({ ordre: b.ordre }).eq("id", ancreDe(a.id)),
      sbClient.from("personnes").update({ ordre: a.ordre }).eq("id", ancreDe(b.id))
    ]).then(function (r) {
      r.forEach(function (res) { if (res.error) throw res.error; });
      rafraichirApresPersonnel();
    }).catch(function (err) { toast("Échec du tri : " + (err && err.message ? err.message : err)); });
  }
  function cablerListePersonnes(zone, apresChangement, actifs) {
    function idDe(el) { return el.closest("[data-id]").dataset.id; }
    function nomDe(el) { return el.closest("[data-id]").querySelector("b").textContent; }
    zone.querySelectorAll(".lien-modifier").forEach(function (btn) {
      btn.addEventListener("click", function () { ouvrirModifierPersonne(idDe(btn), apresChangement); });
    });
    zone.querySelectorAll(".lien-reactiver").forEach(function (btn) {
      btn.addEventListener("click", function () {
        basculerActifPersonneServeur(ancreDe(idDe(btn)), true).then(function () {
          rafraichirApresPersonnel();
          toast("Réactivé.");
        }).catch(function (err) { toast("Échec : " + (err && err.message ? err.message : err)); });
      });
    });
    // Suppression définitive — cf. supprimerPersonnePermanenceServeur : un
    // vrai DELETE, jamais proposé ici que sur une ligne déjà désactivée
    // (.lien-supprimer-def n'existe que sur ces lignes-là, cf.
    // ligneFichePersonne). Cascade en base sur taches/assignations/series
    // (sql/0001 : "on delete cascade") — irréversible, d'où la
    // confirmation explicite malgré la demande de Lionel de garder le
    // bouton lui-même simple ("icône rouge suffit").
    zone.querySelectorAll(".lien-supprimer-def").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = idDe(btn), nom = nomDe(btn);
        demanderConfirmation("Supprimer définitivement « " + nom + " » ? Cette action est irréversible et efface aussi tout son historique (tâches, assignations).", function () {
          supprimerPersonnePermanenceServeur(ancreDe(id)).then(function () {
            rafraichirApresPersonnel();
            toast("Supprimé définitivement.");
          }).catch(function (err) { toast("Échec de la suppression : " + (err && err.message ? err.message : err)); });
        });
      });
    });
    // Interrupteur "Actif" — seulement présent sur les lignes actives
    // (jamais sur .ligne-desactivee, qui n'a que Réactiver/Supprimer) :
    // décocher = désactiver. Revert visuel immédiat (checkbox remise à
    // checked) que la confirmation aboutisse ou non — c'est le
    // rafraîchissement qui suit une désactivation confirmée qui fait
    // réellement disparaître la ligne du groupe actif (elle réapparaît
    // dans "Désactivés"), jamais un simple état visuel local du switch.
    zone.querySelectorAll(".ligne-intervenant:not(.ligne-desactivee) .interrupteur input").forEach(function (chk) {
      chk.addEventListener("change", function () {
        var id = idDe(chk), nom = nomDe(chk);
        chk.checked = true;
        var n = TACHES_PAR_PERSONNE ? TACHES_PAR_PERSONNE[id] : null;
        var titre = "Désactiver « " + nom + " »" + (n ? " qui a " + (n === 1 ? "1 tâche en cours" : n + " tâches en cours") : "") + " ?";
        demanderConfirmation(titre, function () {
          basculerActifPersonneServeur(ancreDe(id), false).then(function () {
            rafraichirApresPersonnel();
            toast("Désactivé.");
          }).catch(function (err) { toast("Échec : " + (err && err.message ? err.message : err)); });
        });
      });
    });
    zone.querySelectorAll(".cf-monter").forEach(function (btn) {
      btn.addEventListener("click", function () { echangerOrdrePersonnes(idDe(btn), -1, actifs); });
    });
    zone.querySelectorAll(".cf-descendre").forEach(function (btn) {
      btn.addEventListener("click", function () { echangerOrdrePersonnes(idDe(btn), 1, actifs); });
    });
    var btnAdd = zone.querySelector(".ligne-ajouter");
    if (btnAdd) btnAdd.addEventListener("click", function () { ouvrirAjoutPersonne(btnAdd.dataset.sousTraitant === "1"); });
    var btnRepli = zone.querySelector(".repli-desactives");
    if (btnRepli) btnRepli.addEventListener("click", function () {
      btnRepli.classList.toggle("ouvert");
      var groupe = zone.querySelector(".groupe-desactives");
      if (groupe) groupe.hidden = !btnRepli.classList.contains("ouvert");
    });
  }
  // Page de gestion (Personnel/Intervenants) : liste COMPLÈTE (actifs +
  // désactivés), contrairement à PERSONNES/etat.personnesActives qui reste
  // actifs seulement (la grille n'affiche jamais une personne désactivée,
  // historique compris — comportement PRÉEXISTANT, inchangé ici, cf.
  // desactiverPersonneServeur d'origine devenu basculerActifPersonneServeur
  // plus bas). Jamais mise en cache : ces 2 pages sont peu visitées, un
  // aller-retour de plus à chaque activation d'onglet est négligeable
  // (même choix que renderStatuts/renderFormulaires, qui ne cachent pas
  // non plus).
  function renderListePersonnes(sousTraitant) {
    var zone = document.getElementById(sousTraitant ? "listeIntervenants" : "listePersonnel");
    if (!zone) return;
    listerPersonnesGestionServeur().then(function (toutes) {
      var liste = toutes.filter(function (p) { return !!p.sousTraitant === !!sousTraitant; });
      var actifs = liste.filter(function (p) { return p.actif; });
      var inactifs = liste.filter(function (p) { return !p.actif; });
      var html = actifs.map(function (p, i) {
        return ligneFichePersonne(p, { premier: i === 0, dernier: i === actifs.length - 1 });
      }).join("") + '<button type="button" class="ligne-ajouter" data-sous-traitant="' + (sousTraitant ? 1 : 0) + '">+ Ajouter</button>';
      if (inactifs.length) {
        html += '<button type="button" class="repli-desactives"><span class="chevron">›</span> Désactivés (' + inactifs.length + ')</button>' +
          '<div class="groupe-desactives" hidden>' + inactifs.map(function (p) { return ligneFichePersonne(p); }).join("") + '</div>';
      }
      zone.innerHTML = html;
      cablerListePersonnes(zone, function () { renderListePersonnes(sousTraitant); }, actifs);
      chargerCompteursTaches();
    }).catch(erreurFatale);
  }
  function renderPersonnel() { renderListePersonnes(false); }
  function renderIntervenants() { renderListePersonnes(true); }
  function ouvrirAjoutPersonne(sousTraitant) {
    var pop = document.createElement("div");
    pop.className = "pop form-pop";
    pop.innerHTML =
      '<div class="cp-titre">Ajouter — ' + (sousTraitant ? "Intervenant" : "Personnel") + '</div>' +
      '<input type="text" class="f-nom" placeholder="Nom' + (sousTraitant ? " de l’intervenant" : " de la personne") + '…">' +
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
      ajouterPersonneServeur(nom, !!sousTraitant).then(function () {
        rafraichirApresPersonnel();
        toast(sousTraitant ? "Intervenant ajouté." : "Personnel ajouté.");
      }).catch(function (err) { toast("Échec de l’ajout : " + (err && err.message ? err.message : err)); });
    });
    inputNom.focus();
  }
  function ouvrirModifierPersonne(id, apresChangement) {
    var p = personneParAncre(id);
    if (!p) return;
    var pop = document.createElement("div");
    pop.className = "pop form-pop";
    pop.innerHTML =
      '<div class="cp-titre">Modifier</div>' +
      '<input type="text" class="f-nom" value="' + esc2(p.nom) + '">' +
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
      renommerPersonneServeur(ancreDe(p.id), nom, !!p.sousTraitant).then(function () {
        rafraichirApresPersonnel();
        apresChangement();
        toast("Modifié.");
      }).catch(function (err) { toast("Échec de la modification : " + (err && err.message ? err.message : err)); });
    });
    inputNom.focus();
  }
  // supprimerPersonneServeur (le lien "Supprimer" d'origine, qui appelait
  // déjà desactiverPersonneServeur en coulisses — jamais un vrai DELETE) a
  // disparu au round du 14.09.2026 : son rôle est repris directement par
  // l'interrupteur "Actif" (cf. cablerListePersonnes ci-dessus, même
  // confirmation "Désactiver « X » qui a N tâches en cours ?"), et une vraie
  // suppression existe désormais séparément (supprimerPersonnePermanenceServeur,
  // section CONFIG SIMPLE plus bas) — proposée seulement sur une ligne déjà
  // désactivée.

