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
    rechargerPersonnesActives_().then(function () {
      assurerFenetreChargee(function () {
        construireVueDepuisCache();
        render(false);
        renderPersonnel(); renderIntervenants(); renderMachines();
      });
    }).catch(erreurFatale);
  }
  // Round du 01.10.2026 (suite 137) — Lionel (retour n° 16) : « La la
  // petite coche "afficher" tout à gauche. Le tri étant possible sur
  // planning, enlever les flèches de tri des onglets. » Plus de ↑/↓ (l'ordre
  // se règle en glissant les noms dans le planning, suite 115) : la coche
  // « Afficher » prend leur place, devant le nom.
  function ligneFichePersonne(p) {
    if (!p.actif) {
      return '<div class="ligne-intervenant ligne-desactivee" data-id="' + esc2(p.id) + '"><b>' + esc(p.nom) + '</b>' +
        '<span class="ligne-actions">' +
        // Icônes (suite 53) : cf. boutonIconeLigne, js/core.js.
        boutonIconeLigne("lien-reactiver", ICONS.restaurer, "Réactiver") +
        boutonIconeLigne("lien-supprimer-def", ICONS.trash, "Supprimer définitivement") +
        '</span></div>';
    }
    return '<div class="ligne-intervenant" data-id="' + esc2(p.id) + '">' +
      // Coche « Afficher » (suite 134), tout à gauche depuis la suite 137.
      '<label class="champ-afficher" title="Afficher dans le planning"><input type="checkbox" class="chk-afficher" aria-label="Afficher dans le planning"' + (p.masque ? '' : ' checked') + '></label>' +
      // Suite 119 : couleur de l'équipe (pastille = sélecteur, comme Chantiers).
      (p.equipe ? pastilleCouleur("pastille-equipe", p.couleur, "Couleur de l’équipe") : '') +
      '<b>' + esc(p.nom) + '</b>' +
      // Compteur « N tâches en cours » retiré (suite 54) — Lionel : « Enlever
      // le nombre de taches attribuée, cela n'a aucune valeur. »
      '<span class="ligne-actions">' +
      // <label>, pas <span> : le piste couvre TOUT le .interrupteur en
      // position absolute (cf. .interrupteur-piste), le checkbox lui-même
      // n'est donc jamais atteignable au clic direct — seul le
      // label-forwarding natif du navigateur le rend cliquable, exactement
      // comme .reglage-ligne (chkWeekends, htmlPagesReglages) qui est déjà un
      // <label> pour la même raison. Repéré en écrivant
      // verif_tri_desactiver.js (round du 14.09.2026, Playwright ne
      // parvenait pas à cliquer le checkbox) : sans <label>, l'interrupteur
      // aurait été inerte au clic pour de vrais utilisateurs aussi, pas
      // seulement pour le test.
      // « Actif » masqué sur téléphone (suite 53), gardé en title.
      '<label class="champ-actif" title="Actif"><span class="interrupteur"><input type="checkbox" checked><span class="interrupteur-piste"></span></span><span class="champ-actif-texte">Actif</span></label>' +
      // Lien de consultation en lecture seule (suite 51, js/liens-consultation.js).
      // Icônes (suite 53) — Lionel : « Des icônes seront mieux que des
      // textes car sur mobile les textes sortent de l'écran. »
      boutonIconeLigne("lien-consultation", ICONS.lien, "Lien de consultation") +
      boutonIconeLigne("lien-modifier", ICONS.pencil, "Modifier") +
      '</span></div>';
  }
  function cablerListePersonnes(zone, apresChangement) {
    function idDe(el) { return el.closest("[data-id]").dataset.id; }
    function nomDe(el) { return el.closest("[data-id]").querySelector("b").textContent; }
    zone.querySelectorAll(".lien-modifier").forEach(function (btn) {
      btn.addEventListener("click", function () { ouvrirModifierPersonne(idDe(btn), apresChangement); });
    });
    zone.querySelectorAll(".lien-consultation").forEach(function (btn) {
      btn.addEventListener("click", function () { ouvrirLienConsultation(idDe(btn)); });
    });
    zone.querySelectorAll(".pastille-equipe").forEach(function (input) {
      input.addEventListener("change", function () {
        changerCouleurEquipe(idDe(input), input.value).then(apresChangement);
      });
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
        var titre = "Désactiver « " + nom + " » ?";
        demanderConfirmation(titre, function () {
          basculerActifPersonneServeur(ancreDe(id), false).then(function () {
            rafraichirApresPersonnel();
            toast("Désactivé.");
          }).catch(function (err) { toast("Échec : " + (err && err.message ? err.message : err)); });
        });
      });
    });
    // « Afficher » (suite 134) : masque / réaffiche la ligne, sans confirmation.
    zone.querySelectorAll(".chk-afficher").forEach(function (chk) {
      chk.addEventListener("change", function () {
        sbClient.from("personnes").update({ masque: !chk.checked }).eq("id", ancreDe(idDe(chk))).then(function (res) {
          if (res.error) throw res.error;
          rafraichirApresPersonnel();
        }).catch(function (err) { chk.checked = !chk.checked; toast("Échec : " + (err && err.message ? err.message : err)); });
      });
    });
    var btnAdd = zone.querySelector(".ligne-ajouter");
    if (btnAdd) btnAdd.addEventListener("click", function () { ouvrirAjoutPersonne(btnAdd.dataset.sousTraitant === "1", btnAdd.dataset.equipe === "1", btnAdd.dataset.groupe || null); });
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
  // equipe (suite 33) : 3e liste, les équipes (page Personnel, au-dessus
  // des personnes) — mêmes lignes, flèches, interrupteur et suppression.
  // groupeId (round du 30.09.2026, suite 132 — js/groupes.js) : liste
  // d'un groupe (Machines, Transports…), sous les personnes ; ses lignes
  // ne sont plus dans « Personnes ».
  function renderListePersonnes(sousTraitant, equipe, groupeId) {
    var zone = document.getElementById(groupeId ? "listeGroupe-" + groupeId : equipe ? "listeEquipes" : sousTraitant ? "listeIntervenants" : "listePersonnel");
    if (!zone) return;
    listerPersonnesGestionServeur().then(function (toutes) {
      var liste = toutes.filter(function (p) {
        var groupe = !p.equipe && !p.sousTraitant && p.groupeId && groupeParId(p.groupeId) ? p.groupeId : null;
        if (groupeId) return groupe === String(groupeId);
        return equipe ? p.equipe : (!p.equipe && !groupe && !!p.sousTraitant === !!sousTraitant);
      });
      var actifs = liste.filter(function (p) { return p.actif; });
      var inactifs = liste.filter(function (p) { return !p.actif; });
      var html = actifs.map(function (p) { return ligneFichePersonne(p); }).join("") + '<button type="button" class="ligne-ajouter" data-sous-traitant="' + (sousTraitant ? 1 : 0) + '"' + (equipe ? ' data-equipe="1"' : "") + (groupeId ? ' data-groupe="' + esc2(groupeId) + '"' : "") + ">" + (equipe ? "+ Nouvelle équipe" : "+ Ajouter") + "</button>";
      if (inactifs.length) {
        html += '<button type="button" class="repli-desactives"><span class="chevron">›</span> Désactivés (' + inactifs.length + ')</button>' +
          '<div class="groupe-desactives" hidden>' + inactifs.map(function (p) { return ligneFichePersonne(p); }).join("") + '</div>';
      }
      zone.innerHTML = html;
      cablerListePersonnes(zone, function () { renderListePersonnes(sousTraitant, equipe, groupeId); });
    }).catch(erreurFatale);
  }
  function renderPersonnel() {
    renderListePersonnes(false, true); renderListePersonnes(false);
  }
  // Suite 132 : une liste par groupe, dans l'ordre du planning. Suite 134 :
  // sur la page Machines (plus sur Personnel) ; la ligne Transports n'y est
  // pas (sectionsCorps ne garde que les groupes à lignes, cf. groupesLignes).
  // Round du 01.10.2026 (suite 135) — Lionel (retour n° 13) : « Machine
  // aussi en une seule ligne comme transport. Pas d'ajouts rapide pour ces
  // 2 groupe. la liste de matériaux de "transport" et des machines sera
  // dans le clic droit de leurs lignes. » Son choix : listes gérées sur les
  // « Pages Machines / Transports ». Les pages ne listent plus de lignes
  // (une seule par groupe, sql/0036) mais les éléments du groupe
  // (elements_groupes) : ajouter, renommer, ↑/↓, supprimer. Supprimer un
  // élément ne touche à aucune bulle déjà posée.
  function renderMachines() {
    var zone = document.getElementById("listesGroupes");
    if (!zone) return;
    var groupes = sectionsCorps().filter(function (s) { return /^groupe-/.test(s.cle); }).map(function (s) { return groupeParId(s.cle.slice(7)); }).filter(Boolean);
    zone.innerHTML = groupes.map(function (g) {
      return '<h2 class="titre-liste">' + esc(g.nom) + '</h2><div class="liste-intervenants liste-elements" id="listeElements-' + esc2(g.id) + '"></div>';
    }).join("");
    groupes.forEach(function (g) { renderListeElements_(g); });
  }
  function renderTransports() {
    var zone = document.getElementById("listeTransports"), g = groupeTransports();
    if (!zone) return;
    zone.innerHTML = g ? '<div class="liste-intervenants liste-elements" id="listeElements-' + esc2(g.id) + '"></div>' : '';
    if (g) renderListeElements_(g);
  }
  function renderListeElements_(groupe) {
    var zone = document.getElementById("listeElements-" + groupe.id);
    if (!zone) return;
    var elements = elementsDuGroupe(groupe.id);
    zone.innerHTML = elements.map(function (e, i) {
      return '<div class="ligne-intervenant" data-id="' + esc2(e.id) + '">' +
        '<span class="cf-actions">' +
        '<button type="button" class="cf-monter" title="Monter"' + (i === 0 ? " disabled" : "") + '>↑</button>' +
        '<button type="button" class="cf-descendre" title="Descendre"' + (i === elements.length - 1 ? " disabled" : "") + '>↓</button>' +
        '</span><b>' + esc(e.nom) + '</b><span class="ligne-actions">' +
        boutonIconeLigne("lien-modifier", ICONS.pencil, "Renommer") +
        boutonIconeLigne("lien-supprimer-el", ICONS.trash, "Supprimer") +
        '</span></div>';
    }).join("") + '<button type="button" class="ligne-ajouter">+ Ajouter</button>';
    function elDe(btn) { var id = btn.closest("[data-id]").dataset.id; return elements.filter(function (e) { return e.id === id; })[0]; }
    zone.querySelector(".ligne-ajouter").addEventListener("click", function () {
      saisirNomElement_("Ajouter — " + groupe.nom, "", function (nom) {
        var ordre = elements.reduce(function (m, e) { return Math.max(m, e.ordre); }, 0) + 1;
        return ecrireElements_([sbClient.from("elements_groupes").insert({ groupe_id: +groupe.id, nom: nom, ordre: ordre })], "Ajouté à « " + groupe.nom + " ».");
      });
    });
    zone.querySelectorAll(".lien-modifier").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var e = elDe(btn);
        saisirNomElement_("Renommer", e.nom, function (nom) {
          return ecrireElements_([sbClient.from("elements_groupes").update({ nom: nom }).eq("id", +e.id)], "Renommé.");
        });
      });
    });
    zone.querySelectorAll(".lien-supprimer-el").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var e = elDe(btn);
        demanderConfirmation("Retirer « " + e.nom + " » de la liste ? Les bulles déjà posées restent.", function () {
          ecrireElements_([sbClient.from("elements_groupes").delete().eq("id", +e.id)], "Retiré de la liste.");
        });
      });
    });
    // ↑/↓ : rangs renumérotés 1..n (un rang en double ne bloque rien).
    zone.querySelectorAll(".cf-monter, .cf-descendre").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var e = elDe(btn), i = elements.indexOf(e), j = i + (btn.classList.contains("cf-monter") ? -1 : 1);
        if (j < 0 || j >= elements.length) return;
        var ordre = elements.slice();
        ordre[i] = elements[j]; ordre[j] = e;
        ecrireElements_(ordre.map(function (x, k) { return sbClient.from("elements_groupes").update({ ordre: k + 1 }).eq("id", +x.id); }), null);
      });
    });
  }
  function saisirNomElement_(titre, valeur, ok) {
    var pop = document.createElement("div");
    pop.className = "pop form-pop";
    pop.innerHTML = '<div class="cp-titre">' + esc(titre) + '</div>' +
      '<input type="text" class="f-nom" value="' + esc2(valeur) + '" placeholder="Nom…">' +
      '<div class="form-actions"><button type="button" class="f-annuler">Annuler</button><button type="button" class="f-ok">Enregistrer</button></div>';
    positionnerPop(pop, Math.round(window.innerWidth / 2 - 110), Math.round(window.innerHeight / 2 - 90));
    var fermer = fermerAuClicExterieur(pop, null, function () { pop.querySelector(".f-ok").click(); });
    var input = pop.querySelector(".f-nom");
    pop.querySelector(".f-annuler").addEventListener("click", fermer);
    pop.querySelector(".f-ok").addEventListener("click", function () {
      var nom = input.value.trim();
      fermer();
      if (nom && nom !== valeur) ok(nom);
    });
    input.focus();
  }
  // Écritures puis liste relue (etat.elementsGroupes : menus des cases et
  // pages Machines / Transports).
  function ecrireElements_(requetes, message) {
    return Promise.all(requetes).then(function (r) {
      r.forEach(function (res) { if (res.error) throw res.error; });
      return sbClient.from("elements_groupes").select(COLONNES_ELEMENTS);
    }).then(function (res) {
      if (res.error) throw res.error;
      etat.elementsGroupes = normaliserElements(res.data || []);
      renderMachines(); renderTransports();
      if (message) toast(message);
    }).catch(function (err) { toast("Échec : " + (err && err.message ? err.message : err)); });
  }
  function renderIntervenants() { renderListePersonnes(true); }
  function ouvrirAjoutPersonne(sousTraitant, equipe, groupeId) {
    var groupe = groupeId ? groupeParId(groupeId) : null;
    var pop = document.createElement("div");
    pop.className = "pop form-pop";
    pop.innerHTML =
      '<div class="cp-titre">Ajouter — ' + (groupe ? esc(groupe.nom) : equipe ? "Équipe" : sousTraitant ? "Intervenant" : "Personnel") + '</div>' +
      '<input type="text" class="f-nom" placeholder="Nom' + (groupe ? "" : equipe ? " de l’équipe" : sousTraitant ? " de l’intervenant" : " de la personne") + '…">' +
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
      ajouterPersonneServeur(nom, !!sousTraitant, !!equipe, groupe ? groupe.id : null).then(function () {
        rafraichirApresPersonnel();
        toast(groupe ? "Ajouté à « " + groupe.nom + " »." : equipe ? "Équipe ajoutée — clique sur son nom dans le planning pour choisir ses membres." : sousTraitant ? "Intervenant ajouté." : "Personnel ajouté.");
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

