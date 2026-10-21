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
        renderPersonnel(); renderIntervenants(); renderMachines(); renderTransports();
      });
    }).catch(erreurFatale);
  }
  // Round du 01.10.2026 (suite 137) — Lionel (retour n° 16) : « La la
  // petite coche "afficher" tout à gauche. Le tri étant possible sur
  // planning, enlever les flèches de tri des onglets. » Plus de ↑/↓ (l'ordre
  // se règle en glissant les noms dans le planning, suite 115) : la coche
  // « Afficher » prend leur place, devant le nom.
  // Round du 01.10.2026 (suite 138) — Lionel : « Je n'aime pas cette
  // fonction désactiver sur personnel et intervenants, la supprimer. » Son
  // choix : « L'interrupteur « Actif » des pages ». Plus d'interrupteur ni
  // de liste « Désactivés » : la coche « Afficher » cache une ligne, la
  // corbeille (avec confirmation) la supprime, directement sur la ligne.
  function ligneFichePersonne(p) {
    return '<div class="ligne-intervenant" data-id="' + esc2(p.id) + '">' +
      // Coche « Afficher » (suite 134), tout à gauche depuis la suite 137.
      '<label class="champ-afficher" title="Afficher dans le planning"><input type="checkbox" class="chk-afficher" aria-label="Afficher dans le planning"' + (p.masque ? '' : ' checked') + '></label>' +
      // Suite 119 : couleur de l'équipe (pastille = sélecteur, comme Chantiers).
      (p.equipe ? pastilleCouleur("pastille-equipe", p.couleur, "Couleur de l’équipe") : '') +
      '<b>' + esc(p.nom) + '</b>' +
      // Compteur « N tâches en cours » retiré (suite 54) — Lionel : « Enlever
      // le nombre de taches attribuée, cela n'a aucune valeur. »
      '<span class="ligne-actions">' +
      // Lien de consultation en lecture seule (suite 51, js/liens-consultation.js).
      // Icônes (suite 53) — Lionel : « Des icônes seront mieux que des
      // textes car sur mobile les textes sortent de l'écran. »
      boutonIconeLigne("lien-consultation", ICONS.lien, "Lien de consultation") +
      boutonIconeLigne("lien-modifier", ICONS.pencil, "Modifier") +
      boutonIconeLigne("lien-supprimer-def", ICONS.trash, "Supprimer définitivement") +
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
    // Suppression définitive — cf. supprimerPersonnePermanenceServeur : un
    // vrai DELETE, proposé sur chaque ligne depuis la suite 138 (avant :
    // seulement sur une ligne déjà désactivée). Cascade en base sur taches/assignations/series
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
  // Suite 138 : plus de liste « Désactivés » (interrupteur « Actif »
  // retiré) ; une ligne inactive n'est plus listée nulle part.
  function renderListePersonnes(sousTraitant, equipe, groupeId) {
    var zone = document.getElementById(groupeId ? "listeGroupe-" + groupeId : equipe ? "listeEquipes" : sousTraitant ? "listeIntervenants" : "listePersonnel");
    if (!zone) return;
    listerPersonnesGestionServeur().then(function (toutes) {
      var liste = toutes.filter(function (p) {
        var groupe = !p.equipe && !p.sousTraitant && p.groupeId && groupeParId(p.groupeId) ? p.groupeId : null;
        if (groupeId) return groupe === String(groupeId);
        return p.actif && (equipe ? p.equipe : (!p.equipe && !groupe && !!p.sousTraitant === !!sousTraitant));
      });
      var html = liste.map(function (p) { return ligneFichePersonne(p); }).join("") + '<button type="button" class="ligne-ajouter" data-sous-traitant="' + (sousTraitant ? 1 : 0) + '"' + (equipe ? ' data-equipe="1"' : "") + (groupeId ? ' data-groupe="' + esc2(groupeId) + '"' : "") + ">" + (equipe ? "+ Nouvelle équipe" : "+ Ajouter") + "</button>";
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
  // élément ne touche à aucune bulle déjà posée. Suite 148 : rangés par
  // catégorie, glisser-déposer à la place de ↑/↓ (renderListeElements_).
  function renderMachines() {
    var zone = document.getElementById("listesGroupes");
    if (!zone) return;
    var groupes = sectionsCorps().filter(function (s) { return /^groupe-/.test(s.cle); }).map(function (s) { return groupeParId(s.cle.slice(7)); }).filter(Boolean);
    zone.innerHTML = groupes.map(function (g) {
      return '<h2 class="titre-liste">' + esc(g.nom) + '</h2>' + htmlAfficherGroupe_(g) + '<div class="liste-intervenants liste-elements" id="listeElements-' + esc2(g.id) + '"></div>';
    }).join("");
    groupes.forEach(function (g) { renderListeElements_(g); });
    cablerAfficherGroupe_(zone);
  }
  function renderTransports() {
    var zone = document.getElementById("listeTransports"), g = groupeTransports();
    if (!zone) return;
    zone.innerHTML = g ? htmlAfficherGroupe_(g) + '<h2 class="titre-liste">Matériaux</h2><div class="liste-intervenants liste-elements" id="listeElements-' + esc2(g.id) + '"></div>' : '';
    if (g) { renderListeElements_(g); cablerAfficherGroupe_(zone); }
  }
  // Round du 01.10.2026 (suite 138) — Lionel : « machine et transport
  // doivent aussi pourvoir être masqué. » Son choix : « Coche « Afficher »
  // + clic droit ». Même coche que Personnel / Intervenants (suite 134,
  // personnes.masque) pour la ligne du groupe ; le clic droit sur son nom
  // propose déjà « Masquer la ligne » (suite 137).
  function lignesDuGroupe_(g) {
    return (etat.personnesActives || []).filter(function (p) { return p.groupe_id != null && String(p.groupe_id) === String(g.id); });
  }
  function htmlAfficherGroupe_(g) {
    var lignes = lignesDuGroupe_(g);
    if (!lignes.length) return '';
    return '<label class="champ-afficher afficher-groupe" title="Afficher dans le planning"><input type="checkbox" class="chk-afficher-groupe" data-groupe="' + esc2(g.id) + '"' +
      (lignes.some(function (p) { return p.masque; }) ? '' : ' checked') + '> Afficher la ligne dans le planning</label>';
  }
  function cablerAfficherGroupe_(zone) {
    zone.querySelectorAll(".chk-afficher-groupe").forEach(function (chk) {
      chk.addEventListener("change", function () {
        var ids = lignesDuGroupe_({ id: chk.dataset.groupe }).map(function (p) { return ancreDe(p.id); });
        sbClient.from("personnes").update({ masque: !chk.checked }).in("id", ids).then(function (res) {
          if (res.error) throw res.error;
          rafraichirApresPersonnel();
        }).catch(function (err) { chk.checked = !chk.checked; toast("Échec : " + (err && err.message ? err.message : err)); });
      });
    });
  }
  // Round du 21.10.2026 (suite 148) — Lionel : « J'aimerai pouvoir trier ma
  // liste de machines et grouper par catégorie. Et pour les trier par
  // lister, déposer, plutôt que par les petites flèches. » Ses choix :
  // « Liste de catégories » (« + Catégorie », renommer, supprimer, sur
  // Machines comme sur Transports) ; un élément sans catégorie va « Dans
  // « Autres » », toujours en dernier. Plus de ↑/↓ : la poignée ⠿ d'un
  // élément le glisse à sa place, dans sa catégorie ou dans une autre ;
  // celle d'une catégorie range la catégorie (cf. cablerGlisserElements_).
  // Sans catégorie, la liste reste d'un seul bloc, sans titre.
  function renderListeElements_(groupe) {
    var zone = document.getElementById("listeElements-" + groupe.id);
    if (!zone) return;
    var elements = elementsDuGroupe(groupe.id), blocs = blocsElementsGroupe(groupe.id), avecCategories = blocs.length > 1;
    zone.innerHTML = blocs.map(function (bloc) {
      var c = bloc.categorie;
      return '<div class="cat-elements' + (c ? '' : ' cat-autres') + '" data-cat="' + (c ? esc2(c.id) : '') + '">' +
        (avecCategories ? '<div class="cat-entete">' +
          (c ? '<span class="poignee-cat" title="Glisser pour ranger la catégorie" aria-hidden="true">⠿</span>' : '') +
          '<span class="cat-nom">' + esc(c ? c.nom : 'Autres') + '</span><span class="cat-compte">' + bloc.elements.length + '</span>' +
          (c ? '<span class="ligne-actions">' + boutonIconeLigne("cat-ajouter", ICONS.plus, "Ajouter dans cette catégorie") +
            boutonIconeLigne("cat-renommer", ICONS.pencil, "Renommer la catégorie") +
            boutonIconeLigne("cat-supprimer", ICONS.trash, "Supprimer la catégorie") + '</span>' : '') +
          '</div>' : '') +
        '<div class="cat-corps">' + bloc.elements.map(htmlLigneElement_).join("") +
          (avecCategories && !bloc.elements.length ? '<p class="cat-vide">Vide : glissez un élément ici.</p>' : '') + '</div></div>';
    }).join("") + '<div class="liste-elements-ajouts"><button type="button" class="ligne-ajouter">+ Ajouter</button>' +
      '<button type="button" class="ligne-ajouter-cat">+ Catégorie</button></div>';
    function elDe(btn) { var id = btn.closest("[data-id]").dataset.id; return elements.filter(function (e) { return e.id === id; })[0]; }
    function catDe(btn) { var id = btn.closest(".cat-elements").dataset.cat; return categoriesDuGroupe(groupe.id).filter(function (c) { return c.id === id; })[0]; }
    function ordreSuivant() { return elements.reduce(function (m, e) { return Math.max(m, e.ordre); }, 0) + 1; }
    zone.querySelector(".ligne-ajouter").addEventListener("click", function () {
      saisirNomElement_("Ajouter — " + groupe.nom, "", function (nom) {
        return ecrireElements_([sbClient.from("elements_groupes").insert({ groupe_id: +groupe.id, nom: nom, ordre: ordreSuivant() })], "Ajouté à « " + groupe.nom + " ».");
      });
    });
    zone.querySelector(".ligne-ajouter-cat").addEventListener("click", function () {
      var cats = categoriesDuGroupe(groupe.id);
      saisirNomElement_("Nouvelle catégorie — " + groupe.nom, "", function (nom) {
        var ordre = cats.reduce(function (m, c) { return Math.max(m, c.ordre); }, 0) + 1;
        return ecrireElements_([sbClient.from("categories_elements").insert({ groupe_id: +groupe.id, nom: nom, ordre: ordre })], "Catégorie « " + nom + " » ajoutée.");
      });
    });
    zone.querySelectorAll(".cat-ajouter").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var c = catDe(btn);
        saisirNomElement_("Ajouter — " + c.nom, "", function (nom) {
          return ecrireElements_([sbClient.from("elements_groupes").insert({ groupe_id: +groupe.id, nom: nom, ordre: ordreSuivant(), categorie_id: +c.id })], "Ajouté à « " + c.nom + " ».");
        });
      });
    });
    zone.querySelectorAll(".cat-renommer").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var c = catDe(btn);
        saisirNomElement_("Renommer la catégorie", c.nom, function (nom) {
          return ecrireElements_([sbClient.from("categories_elements").update({ nom: nom }).eq("id", +c.id)], "Catégorie renommée.");
        });
      });
    });
    // Ses éléments passent dans « Autres » (on delete set null, sql/0042).
    zone.querySelectorAll(".cat-supprimer").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var c = catDe(btn), n = btn.closest(".cat-elements").querySelectorAll(".ligne-element").length;
        demanderConfirmation("Supprimer la catégorie « " + c.nom + " » ?" + (n ? " " + (n > 1 ? "Ses " + n + " éléments passent" : "Son élément passe") + " dans « Autres »." : ""), function () {
          ecrireElements_([sbClient.from("categories_elements").delete().eq("id", +c.id)], "Catégorie supprimée.");
        });
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
    zone.querySelectorAll(".chk-afficher-el").forEach(function (chk) {
      chk.addEventListener("change", function () {
        ecrireElements_([sbClient.from("elements_groupes").update({ masque: !chk.checked }).eq("id", +elDe(chk).id)], null);
      });
    });
    zone.querySelectorAll(".lien-supprimer-el").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var e = elDe(btn);
        demanderConfirmation("Retirer « " + e.nom + " » de la liste ? Les bulles déjà posées restent.", function () {
          ecrireElements_([sbClient.from("elements_groupes").delete().eq("id", +e.id)], "Retiré de la liste.");
        });
      });
    });
    cablerGlisserElements_(zone, groupe);
  }
  function htmlLigneElement_(e) {
    return '<div class="ligne-intervenant ligne-element" data-id="' + esc2(e.id) + '">' +
      // Round du 01.10.2026 (suite 139) — Lionel : « Chaque
      // machine/transport a sa coche qui le fera apparaître ou non dans la
      // liste clic droit. » Même coche que Personnel, tout à gauche.
      '<label class="champ-afficher" title="Proposer au clic droit"><input type="checkbox" class="chk-afficher-el" aria-label="Proposer au clic droit"' + (e.masque ? '' : ' checked') + '></label>' +
      '<span class="poignee-el" title="Glisser pour ranger" aria-hidden="true">⠿</span>' +
      '<b>' + esc(e.nom) + '</b><span class="ligne-actions">' +
      boutonIconeLigne("lien-modifier", ICONS.pencil, "Renommer") +
      boutonIconeLigne("lien-supprimer-el", ICONS.trash, "Supprimer") +
      '</span></div>';
  }
  // Glisser-déposer (suite 148). La poignée ⠿ se glisse à la souris comme
  // au doigt (elle ne fait jamais défiler la page) ; à la souris, toute la
  // ligne (ou le titre de la catégorie) se glisse aussi, sauf sa coche et
  // ses boutons. Au-delà de 5 px, un trait montre la place d'arrivée et la
  // page défile près de ses bords ; relâché, le nouvel ordre s'affiche tout
  // de suite puis s'écrit en base.
  function cablerGlisserElements_(zone, groupe) {
    zone.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey)) return;
      var poignee = e.target.closest(".poignee-el, .poignee-cat"), source = null;
      if (poignee) source = poignee.classList.contains("poignee-el") ? poignee.closest(".ligne-element") : poignee.closest(".cat-elements");
      else if (e.pointerType === "mouse" && !e.target.closest("button, input, label")) {
        source = e.target.closest(".ligne-element");
        if (!source && e.target.closest(".cat-entete")) source = e.target.closest(".cat-elements:not(.cat-autres)");
      }
      if (!source || !zone.contains(source)) return;
      if (poignee) e.preventDefault();
      var estCat = source.classList.contains("cat-elements"), pointerId = e.pointerId, y0 = e.clientY, x0 = e.clientX;
      var trait = null, cible = null, dernierY = y0, defile = scrollableDe_(zone), boucle = 0;
      function rect(el) { return el.getBoundingClientRect(); }
      function placerTrait(y, gauche, largeur) {
        trait.style.top = Math.round(y - 1) + "px";
        trait.style.left = Math.round(gauche) + "px";
        trait.style.width = Math.round(largeur) + "px";
      }
      function viser(y) {
        var zr = rect(zone);
        if (estCat) {
          var blocs = [].slice.call(zone.querySelectorAll(".cat-elements:not(.cat-autres)")).filter(function (b) { return b !== source; });
          var k = 0;
          while (k < blocs.length && y > (rect(blocs[k]).top + rect(blocs[k]).bottom) / 2) k++;
          cible = { avant: blocs[k] ? blocs[k].dataset.cat : null };
          placerTrait(blocs[k] ? rect(blocs[k]).top - 5 : rect(blocs.length ? blocs[blocs.length - 1] : source).bottom + 4, zr.left, zr.width);
          return;
        }
        var meilleur = null;
        zone.querySelectorAll(".cat-elements").forEach(function (b) {
          var r = rect(b), d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
          if (!meilleur || d < meilleur.d) meilleur = { d: d, bloc: b };
        });
        if (!meilleur) return;
        var corps = meilleur.bloc.querySelector(".cat-corps"), cr = rect(corps);
        var lignes = [].slice.call(corps.querySelectorAll(".ligne-element")).filter(function (l) { return l !== source; });
        var j = 0;
        while (j < lignes.length && y > (rect(lignes[j]).top + rect(lignes[j]).bottom) / 2) j++;
        cible = { cat: meilleur.bloc.dataset.cat || null, avant: lignes[j] ? lignes[j].dataset.id : null };
        var vide = corps.querySelector(".cat-vide");
        placerTrait(lignes[j] ? rect(lignes[j]).top - 5 : lignes.length ? rect(lignes[lignes.length - 1]).bottom + 4 : vide ? (rect(vide).top + rect(vide).bottom) / 2 : cr.top + 2, cr.left, cr.width);
      }
      // Près du haut ou du bas de la fenêtre : la page défile, le trait suit.
      function defiler() {
        boucle = 0;
        if (!trait) return;
        var h = window.innerHeight, pas = dernierY < 50 ? -12 : dernierY > h - 50 ? 12 : 0;
        if (!pas) return;
        defile.scrollTop += pas;
        viser(dernierY);
        boucle = requestAnimationFrame(defiler);
      }
      function onMove(e2) {
        if (e2.pointerId !== pointerId) return;
        if (!trait) {
          if (Math.abs(e2.clientY - y0) <= 5 && Math.abs(e2.clientX - x0) <= 5) return;
          trait = document.createElement("div");
          trait.className = "trait-ordre-ligne";
          document.body.appendChild(trait);
          document.body.classList.add("glisse-ligne");
          source.classList.add("el-deplace");
        }
        e2.preventDefault();
        dernierY = e2.clientY;
        viser(dernierY);
        if (!boucle) boucle = requestAnimationFrame(defiler);
      }
      function onUp(e2) {
        if (e2.pointerId !== pointerId) return;
        var fin = trait && cible && e2.type === "pointerup";
        detacher();
        if (!fin) return;
        if (estCat) deposerCategorie_(groupe, source.dataset.cat, cible.avant);
        else deposerElement_(groupe, source.dataset.id, cible.cat, cible.avant);
      }
      function detacher() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        if (boucle) cancelAnimationFrame(boucle);
        if (trait) trait.remove();
        document.body.classList.remove("glisse-ligne");
        source.classList.remove("el-deplace");
      }
      document.addEventListener("pointermove", onMove, { passive: false });
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }
  // Ancêtre qui fait défiler la page (sinon le document).
  function scrollableDe_(el) {
    for (var n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      var oy = getComputedStyle(n).overflowY;
      if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n;
    }
    return document.scrollingElement || document.documentElement;
  }
  // Élément `id` posé dans la catégorie `cat` (null = « Autres »), avant
  // l'élément `avantId` (null = en dernier).
  function deposerElement_(groupe, id, cat, avantId) {
    var blocs = blocsOrdre_(groupe), el = null;
    blocs.forEach(function (b) {
      b.elements = b.elements.filter(function (x) { if (x.id === id) el = x; return x.id !== id; });
    });
    var dest = blocs.filter(function (b) { return b.cat === cat; })[0];
    if (!el || !dest) return;
    var k = avantId ? dest.elements.map(function (x) { return x.id; }).indexOf(avantId) : -1;
    dest.elements.splice(k < 0 ? dest.elements.length : k, 0, el);
    ecrireOrdreElements_(categoriesDuGroupe(groupe.id), blocs);
  }
  // Catégorie `id` rangée avant la catégorie `avantId` (null = juste avant
  // « Autres »).
  function deposerCategorie_(groupe, id, avantId) {
    var cats = categoriesDuGroupe(groupe.id), c = cats.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var liste = cats.filter(function (x) { return x !== c; });
    var k = avantId ? liste.map(function (x) { return x.id; }).indexOf(avantId) : -1;
    liste.splice(k < 0 ? liste.length : k, 0, c);
    var blocs = blocsOrdre_(groupe), parCat = {};
    blocs.forEach(function (b) { parCat[b.cat] = b; });
    ecrireOrdreElements_(liste, liste.map(function (x) { return parCat[x.id]; }).concat([parCat[null]]));
  }
  function blocsOrdre_(groupe) {
    return blocsElementsGroupe(groupe.id).map(function (b) { return { cat: b.categorie ? b.categorie.id : null, elements: b.elements.slice() }; });
  }
  // Écrit l'ordre affiché : catégories 1..n, éléments 1..N à la suite,
  // catégorie après catégorie puis « Autres » — sans catégories (supprimées
  // ou injoignables), la liste à plat garde le même ordre. Seules les
  // lignes changées sont écrites ; l'écran suit tout de suite.
  function ecrireOrdreElements_(cats, blocs) {
    var requetes = [], rang = 0;
    cats.forEach(function (c, i) {
      if (c.ordre === i + 1) return;
      c.ordre = i + 1;
      requetes.push(sbClient.from("categories_elements").update({ ordre: i + 1 }).eq("id", +c.id));
    });
    blocs.forEach(function (b) {
      b.elements.forEach(function (x) {
        var champs = {};
        rang++;
        if (x.ordre !== rang) { champs.ordre = rang; x.ordre = rang; }
        if (x.categorieId !== b.cat) { champs.categorie_id = b.cat == null ? null : +b.cat; x.categorieId = b.cat; }
        if (Object.keys(champs).length) requetes.push(sbClient.from("elements_groupes").update(champs).eq("id", +x.id));
      });
    });
    if (!requetes.length) return;
    etat.categoriesElements.sort(comparerOrdre);
    etat.elementsGroupes.sort(comparerOrdre);
    renderMachines(); renderTransports();
    ecrireElements_(requetes, null);
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
  // Écritures puis listes relues (etat.elementsGroupes et, suite 148,
  // etat.categoriesElements : menus des cases et pages Machines /
  // Transports). Relues aussi après un échec : l'écran reprend alors l'état
  // de la base (un glisser-déposer s'affiche avant d'être écrit).
  function ecrireElements_(requetes, message) {
    var ok = true;
    function echec(err) { ok = false; toast("Échec : " + (err && err.message ? err.message : err)); }
    return Promise.all(requetes).then(function (r) {
      r.forEach(function (res) { if (res.error) throw res.error; });
    }).catch(echec).then(function () {
      return Promise.all([sbClient.from("elements_groupes").select(COLONNES_ELEMENTS), sbClient.from("categories_elements").select(COLONNES_CATEGORIES_ELEMENTS)]);
    }).then(function (r) {
      if (r[0].error) throw r[0].error;
      etat.elementsGroupes = normaliserElements(r[0].data || []);
      if (!r[1].error) etat.categoriesElements = normaliserCategoriesElements(r[1].data || []);
      renderMachines(); renderTransports();
      if (ok && message) toast(message);
    }).catch(echec);
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
  // désactivée. Suite 138 : interrupteur retiré, la suppression est sur
  // chaque ligne.

