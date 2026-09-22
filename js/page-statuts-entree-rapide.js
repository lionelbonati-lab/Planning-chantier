"use strict";
  /* ============================================================
     PAGE "STATUTS" — CRUD complet (§3 du spec, apiListerStatuts/
     apiEnregistrerStatuts, NOUVELLES). Simplification vs le prototype :
     pas d'éditeur de style de texte (gras/italique/souligné/couleur du
     texte) — champs texteGras/texteItalique/texteSouligne/texteCouleur du
     prototype absents du contrat serveur (cle/nom/couleur/ordre seulement),
     déviation documentée dans FRONTEND-CHANGELOG.md. Pas de réordonnancement
     (comme le prototype) : un nouveau statut est ajouté en fin de liste.
     ============================================================ */
  function ligneFicheStatut(s) {
    return '<div class="ligne-intervenant" data-cle="' + esc2(s.cle) + '">' +
      '<span class="gauche-chantier"><span class="swatch-chantier" style="background:' + esc2(s.couleur) + '"></span><b>' + esc(s.nom) + '</b></span>' +
      '<span class="ligne-actions"><button type="button" class="lien-modifier">Modifier</button>' +
      '<button type="button" class="lien-supprimer">Supprimer</button></span></div>';
  }
  function renderStatuts() {
    var zone = document.getElementById("listeStatuts");
    if (!zone) return;
    var liste = etat.statutsServeur.slice().sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); });
    zone.innerHTML = liste.map(ligneFicheStatut).join("") + '<button type="button" class="ligne-ajouter">+ Ajouter</button>';
    zone.querySelectorAll(".lien-modifier").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var cle = btn.closest("[data-cle]").dataset.cle;
        var s = etat.statutsServeur.filter(function (x) { return x.cle === cle; })[0];
        if (s) ouvrirModifierStatut(s);
      });
    });
    zone.querySelectorAll(".lien-supprimer").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var cle = btn.closest("[data-cle]").dataset.cle;
        var s = etat.statutsServeur.filter(function (x) { return x.cle === cle; })[0];
        supprimerStatutServeur(s);
      });
    });
    var btnAdd = zone.querySelector(".ligne-ajouter");
    if (btnAdd) btnAdd.addEventListener("click", ouvrirAjoutStatut);
  }
  function couleurProposeeStatut() {
    var utilisees = {};
    etat.statutsServeur.forEach(function (s) { utilisees[(s.couleur || "").toLowerCase()] = true; });
    for (var i = 0; i < PALETTE_STATUTS.length; i++) if (!utilisees[PALETTE_STATUTS[i].toLowerCase()]) return PALETTE_STATUTS[i];
    return PALETTE_STATUTS[0];
  }
  function rafraichirApresStatuts(nouveauxStatuts) {
    etat.statutsServeur = nouveauxStatuts || [];
    appliquerStatutsEtFormulaires();
    construireVueDepuisCache();
    render(false);
    renderStatuts();
  }
  function ouvrirAjoutStatut() {
    var pop = document.createElement("div");
    pop.className = "pop form-pop";
    pop.innerHTML =
      '<div class="cp-titre">Ajouter — Statut</div>' +
      '<input type="text" class="f-nom" placeholder="Nom du statut…">' +
      '<div class="champ-couleur-chantier"><label>Couleur du badge</label><input type="color" class="f-couleur" value="' + couleurProposeeStatut() + '"></div>' +
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
      var ordre = etat.statutsServeur.length + 1;
      enregistrerStatutsServeur([], [{ nom: nom, couleur: pop.querySelector(".f-couleur").value, ordre: ordre }], []).then(function (r) {
        rafraichirApresStatuts(r);
        toast("Statut ajouté.");
      }).catch(function (err) { toast("Échec de l’ajout : " + (err && err.message ? err.message : err)); });
    });
    inputNom.focus();
  }
  function ouvrirModifierStatut(s) {
    var pop = document.createElement("div");
    pop.className = "pop form-pop";
    pop.innerHTML =
      '<div class="cp-titre">Modifier</div>' +
      '<input type="text" class="f-nom" value="' + esc2(s.nom) + '">' +
      '<div class="champ-couleur-chantier"><label>Couleur du badge</label><input type="color" class="f-couleur" value="' + esc2(s.couleur) + '"></div>' +
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
      enregistrerStatutsServeur([{ cle: s.cle, nom: nom, couleur: pop.querySelector(".f-couleur").value, ordre: s.ordre }], [], []).then(function (r) {
        rafraichirApresStatuts(r);
        toast("Modifié.");
      }).catch(function (err) { toast("Échec de la modification : " + (err && err.message ? err.message : err)); });
    });
    inputNom.focus();
  }
  function supprimerStatutServeur(s) {
    if (!s) return;
    demanderConfirmation("Supprimer le statut « " + s.nom + " » ? Les tâches qui l’utilisaient n’auront plus de statut.", function () {
      enregistrerStatutsServeur([], [], [s.cle]).then(function (r) {
        rafraichirApresStatuts(r);
        toast("Supprimé.");
      }).catch(function (err) { toast("Échec de la suppression : " + (err && err.message ? err.message : err)); });
    });
  }

  /* ============================================================
     PAGE "ENTRÉE RAPIDE" — CRUD des formulaires dynamiques (§3 du spec,
     apiListerFormulairesRapides/apiEnregistrerFormulaireRapide/
     apiSupprimerFormulaireRapide). "Assigné à" restauré round "reverifie 1x
     que tu a tout fait" du 02.09.2026 (8e colonne AssigneA côté WebApp.gs,
     select .nf-assigne ici, filtrage dans boutonsMenuAjout) — c'était une
     déviation documentée vs le prototype (contrat serveur pas encore étendu
     à l'époque, cf. FRONTEND-CHANGELOG.md §2), pas un manque définitif.
     Simplifications restantes vs le prototype : pas de "type" (Tâche/
     Absence) par formulaire (cf. ouvrirFormulaireDynamique plus haut). Pas
     de champ "unité" dédié pour un champ Nombre (absent du contrat) : à
     inclure dans le libellé (ex. "Quantité (m³)").
     ============================================================ */
  var champsEnConstruction = [];
  var formulaireEnEdition = null; // nom du formulaire en édition, ou null pour un nouveau
  var typeChampActuel = "texte";

  // Les 3 formulaires rapides HISTORIQUES (Armature/Béton/Livraison armature)
  // ont chacun leur propre interface dédiée, codée en dur (cf.
  // ouvrirFormulaireArmature/ouvrirFormulaireBeton/ouvrirFormulaireLivraisonArmature
  // plus bas), reconnue par CORRESPONDANCE EXACTE DE NOM dans
  // cablerBoutonsMenuAjout — jamais par le formulaire générique ci-dessous.
  // Round "entrées rapides disparues" (01.09.2026, cf. BACKEND-CHANGELOG.md
  // §7bis pour le détail complet) : ces 3 noms peuvent désormais apparaître
  // dans CETTE page de réglages générique (avant, la feuille de config était
  // vide et ils n'apparaissaient nulle part). Les y RENOMMER casserait
  // silencieusement la correspondance exacte de nom et ferait perdre leur
  // interface dédiée au profit du formulaire générique (vide, seul le champ
  // "info" placeholder) — "Modifier" est donc désactivé pour ces 3-là
  // (leurs champs ne sont de toute façon jamais lus par leur interface
  // dédiée, cf. FR_CHAMPS_DEFAUT côté WebApp.gs). "Supprimer" reste permis
  // (retire simplement le bouton du menu "Ajouter", sans danger — facile à
  // reconstruire en resauvegardant n'importe quel autre formulaire, qui
  // réutilise la même feuille).
  var NOMS_FORMULAIRES_SPECIAUX = ["Armature", "Béton", "Livraison armature"];

  function champsResumeAffiche(f) {
    return (f.champs && f.champs.length) ? f.champs.map(function (c) { return c.label; }).join(" · ") : "Aucun champ";
  }
  // ---- "Assigné à" = une CATÉGORIE, pas une personne ---------------------
  // Correction du 02.09.2026 (Lionel : "les ajouts rapides doivent être pour
  // le personnel en général, pas une seule personne"). Sa demande d'origine —
  // "les entrées rapides par intervenant ou ouvrier" — parlait bien des deux
  // CATÉGORIES (le personnel d'un côté, les intervenants de l'autre) ; je
  // l'avais sur-interprétée en assignation individuelle. Le besoin réel :
  // qu'un formulaire "Armature" n'encombre pas le menu des intervenants, et
  // inversement.
  //   ""              -> tout le monde
  //   "@personnel"    -> le personnel interne seulement
  //   "@intervenants" -> les sous-traitants seulement
  // Rétrocompatibilité : une valeur numérique est une ancre de personne
  // (assignation individuelle du round précédent) — toujours honorée à
  // l'affichage comme au filtrage, pour ne rien casser de ce qui a déjà pu
  // être enregistré, même si l'interface ne propose plus de la créer.
  var ASSIGNE_TOUS = "", ASSIGNE_PERSONNEL = "@personnel", ASSIGNE_INTERVENANTS = "@intervenants";
  function nomAssigneAffiche(f) {
    var a = String(f.assigneA || "");
    if (a === ASSIGNE_TOUS) return "Tout le monde";
    if (a === ASSIGNE_PERSONNEL) return "Personnel";
    if (a === ASSIGNE_INTERVENANTS) return "Intervenants";
    var p = personneParAncre(a); // ancienne assignation individuelle
    return p ? p.nom : ("#" + a);
  }
  // Ce formulaire doit-il apparaître dans le menu "Ajouter" de cette personne ?
  function formulaireVisiblePour(f, personneId) {
    var a = String(f.assigneA || "");
    if (a === ASSIGNE_TOUS) return true;
    var estIntervenant = secteurPersonne(personneId) === "sous-traitant";
    if (a === ASSIGNE_PERSONNEL) return !estIntervenant;
    if (a === ASSIGNE_INTERVENANTS) return estIntervenant;
    return a === String(personneId); // ancienne assignation individuelle
  }
  function renderFormulaires() {
    var zone = document.getElementById("listeFormulaires");
    if (!zone) return;
    // Filet de sécurité, cf. chargerFormulairesRapides — no-op si déjà
    // chargé/en cours (cas normal, le chargement d'arrière-plan démarré à
    // l'ouverture de l'appli a presque toujours déjà fini ici).
    chargerFormulairesRapides();
    var liste = etat.formulairesRapidesServeur.slice().sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); });
    zone.innerHTML = liste.map(function (f) {
      return '<div class="carte-form" data-nom="' + esc2(f.nom) + '">' +
        '<div class="gauche"><b>' + esc(f.nom) + '</b><span class="champs">' + esc(champsResumeAffiche(f)) + ' · Assigné à : ' + esc(nomAssigneAffiche(f)) + (f.typeEntree === "absence" ? ' · Absence' : '') + '</span></div>' +
        '<div class="droite">' +
        '<button type="button" class="lien-modifier">Modifier</button>' +
        '<button type="button" class="lien-supprimer">Supprimer</button></div></div>';
    }).join("") || '<div class="page-placeholder">Aucun formulaire pour l’instant.</div>';
    // Bouton d'ajout EN BAS DE LISTE, comme sur Chantiers, Statuts, Personnel
    // et Intervenants (retour de Lionel : "le bouton ajout de formulaire est
    // mal placé"). Il était seul de son espèce en haut, dans le titre de page.
    var btnBas = document.createElement("button");
    btnBas.type = "button";
    btnBas.className = "ligne-ajouter";
    btnBas.textContent = "+ Nouveau formulaire";
    btnBas.addEventListener("click", ouvrirNouveauFormulaire);
    zone.appendChild(btnBas);
    // Reprise en un clic des absences historiques (Congé / Vacances), jusqu'ici
    // codées en dur dans le menu "Ajouter" et donc impossibles à éditer. Un
    // bouton explicite plutôt qu'une création automatique : rien n'est écrit
    // dans sa feuille sans qu'il l'ait demandé. Disparaît une fois faites.
    if (!liste.some(function (f) { return f.typeEntree === "absence"; })) {
      var btnAbs = document.createElement("button");
      btnAbs.type = "button";
      btnAbs.className = "ligne-ajouter";
      btnAbs.textContent = "+ Reprendre les absences (Congé, Vacances) pour pouvoir les modifier";
      btnAbs.addEventListener("click", creerAbsencesParDefaut);
      zone.appendChild(btnAbs);
    }
    zone.querySelectorAll(".lien-modifier").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var nom = btn.closest(".carte-form").dataset.nom;
        var f = etat.formulairesRapidesServeur.filter(function (x) { return x.nom === nom; })[0];
        if (f) ouvrirEditeurFormulaire(f);
      });
    });
    zone.querySelectorAll(".lien-supprimer").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var nom = btn.closest(".carte-form").dataset.nom;
        demanderConfirmation("Supprimer le formulaire « " + nom + " » ?", function () {
          supprimerFormulaireRapideServeur(nom).then(function (r) {
            rafraichirApresFormulaires(r);
            toast("Formulaire supprimé.");
          }).catch(function (err) { toast("Échec de la suppression : " + (err && err.message ? err.message : err)); });
        });
      });
    });
  }
  // Crée Congé et Vacances comme entrées rapides ordinaires (type "absence",
  // sans champ = ajout en un clic, réservées au personnel) — exactement le
  // comportement des 2 boutons codés en dur qu'elles remplacent. Une fois
  // créées, elles sont renommables, réassignables et supprimables comme le
  // reste, et les boutons historiques s'effacent d'eux-mêmes (cf.
  // boutonsMenuAjout).
  function creerAbsencesParDefaut() {
    var ordreBase = etat.formulairesRapidesServeur.length;
    var aCreer = [
      { nom: "Congé", ordre: ordreBase + 1 },
      { nom: "Vacances", ordre: ordreBase + 2 }
    ].filter(function (a) {
      return !etat.formulairesRapidesServeur.some(function (f) { return f.nom === a.nom; });
    });
    if (!aCreer.length) { toast("Elles existent déjà."); return; }
    var chaine = Promise.resolve(), dernier = null;
    aCreer.forEach(function (a) {
      chaine = chaine.then(function () {
        return enregistrerFormulaireRapideServeur(a.nom, a.ordre, [], ASSIGNE_PERSONNEL, "absence")
          .then(function (r) { dernier = r; });
      });
    });
    chaine.then(function () {
      rafraichirApresFormulaires(dernier);
      toast("Congé et Vacances sont maintenant modifiables ici.");
    }).catch(function (err) { toast("Échec : " + (err && err.message ? err.message : err)); });
  }
  function rafraichirApresFormulaires(nouveauxFormulaires) {
    etat.formulairesRapidesServeur = nouveauxFormulaires || [];
    appliquerStatutsEtFormulaires();
    renderFormulaires();
  }
  function rendreListeChampsForm() {
    var zone = document.getElementById("listeChampsForm");
    if (!zone) return;
    if (!champsEnConstruction.length) {
      zone.innerHTML = '<div class="aucun-champ">Aucun champ pour l’instant — Chantier (et Statut, pour un intervenant) sont déjà proposés automatiquement.</div>';
    } else {
      // Round du 02.09.2026 (retour de Lionel : "j'aimerai pouvoir changer
      // l'ordre ou modifier un champ dans ce formulaire") : monter/descendre
      // et modifier, en plus du retrait qui existait seul jusqu'ici. L'ordre
      // des champs est celui du texte de tâche produit (cf. note du panneau),
      // donc pouvoir le corriger sans tout resaisir est loin d'être cosmétique.
      zone.innerHTML = champsEnConstruction.map(function (c, i) {
        var detail = c.type === "select" ? "Liste de choix — " + (c.options || []).join(", ")
          : c.type === "nombre" ? "Nombre" : c.type === "case" ? "Case à cocher" : "Texte";
        return '<div class="ligne-champ-form" data-idx="' + i + '"><span class="cf-label">' + esc(c.label) + '</span>' +
          '<span class="cf-type">' + esc(detail) + '</span>' +
          '<span class="cf-actions">' +
          '<button type="button" class="cf-monter" title="Monter"' + (i === 0 ? " disabled" : "") + '>↑</button>' +
          '<button type="button" class="cf-descendre" title="Descendre"' + (i === champsEnConstruction.length - 1 ? " disabled" : "") + '>↓</button>' +
          '<button type="button" class="cf-modifier" title="Modifier ce champ">Modifier</button>' +
          '<button type="button" class="cf-suppr" title="Retirer ce champ">✕</button>' +
          '</span></div>';
      }).join("");
    }
    function idxDe(btn) { return +btn.closest("[data-idx]").dataset.idx; }
    function echanger(i, j) {
      var tmp = champsEnConstruction[i];
      champsEnConstruction[i] = champsEnConstruction[j];
      champsEnConstruction[j] = tmp;
      rendreListeChampsForm();
    }
    zone.querySelectorAll(".cf-monter").forEach(function (btn) {
      btn.addEventListener("click", function () { var i = idxDe(btn); if (i > 0) echanger(i, i - 1); });
    });
    zone.querySelectorAll(".cf-descendre").forEach(function (btn) {
      btn.addEventListener("click", function () { var i = idxDe(btn); if (i < champsEnConstruction.length - 1) echanger(i, i + 1); });
    });
    zone.querySelectorAll(".cf-modifier").forEach(function (btn) {
      btn.addEventListener("click", function () { ouvrirConstructeurChamp(idxDe(btn)); });
    });
    zone.querySelectorAll(".cf-suppr").forEach(function (btn) {
      btn.addEventListener("click", function () {
        champsEnConstruction.splice(idxDe(btn), 1);
        rendreListeChampsForm();
      });
    });
  }
  function idChampDepuisLabel(label) {
    var base = String(label).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "") || "champ";
    var id = base, n = 2;
    while (champsEnConstruction.some(function (c) { return c.cle === id; })) { id = base + "-" + n; n++; }
    return id;
  }
  function ouvrirPanneauFormulaire() {
    document.getElementById("constructeurChamp").hidden = true;
    document.getElementById("panneauNouveauForm").hidden = false;
  }
  function fermerPanneauFormulaire() {
    document.getElementById("panneauNouveauForm").hidden = true;
    var inputNom = document.querySelector(".nf-nom");
    inputNom.value = "";
    inputNom.disabled = false; // réactivé : le panneau resservira peut-être à un formulaire ordinaire
    var noteSpec = document.getElementById("noteFormSpecial");
    if (noteSpec) noteSpec.hidden = true;
    champEnModification = null;
    formulaireEnEdition = null;
  }
  // Repeuplé à CHAQUE ouverture du panneau (jamais mis en cache) : PERSONNES
  // peut avoir changé (ajout/suppression) depuis la dernière ouverture, même
  // principe que renderFormulaires() qui ne cache jamais non plus.
  // Trois niveaux, précisés par Lionel : « tout le monde, personnel, et
  // ensuite chaque intervenant séparé. L'électricien n'a pas besoin des ajouts
  // béton. » Le personnel interne fait globalement le même métier, donc un
  // seul groupe suffit ; les intervenants sont chacun un corps de métier
  // différent (électricien, peintre, chauffagiste…), d'où une entrée par
  // intervenant. Repeuplé à CHAQUE ouverture du panneau : la liste des
  // intervenants a pu changer depuis la dernière fois.
  function remplirSelectAssigneFormulaire(assigneActuel) {
    var sel = document.querySelector(".nf-assigne");
    if (!sel) return;
    var a = String(assigneActuel || "");
    var intervenants = PERSONNES.filter(function (p) { return p.sousTraitant; });
    var html = '<option value="' + ASSIGNE_TOUS + '">Tout le monde</option>' +
      '<option value="' + ASSIGNE_PERSONNEL + '">Personnel</option>';
    if (intervenants.length) {
      html += '<optgroup label="Un intervenant en particulier">' +
        intervenants.map(function (p) { return '<option value="' + esc2(p.id) + '">' + esc(p.nom) + '</option>'; }).join("") +
        '</optgroup>';
    }
    // Valeur déjà enregistrée qui ne figure pas dans la liste ci-dessus :
    // "tous les intervenants" (proposé un temps), ou une personne du
    // personnel, ou un intervenant supprimé depuis. On la conserve comme
    // option pour qu'ouvrir puis enregistrer un formulaire ne change jamais
    // son réglage à l'insu de Lionel.
    var dejaListee = (a === ASSIGNE_TOUS || a === ASSIGNE_PERSONNEL) ||
      intervenants.some(function (p) { return p.id === a; });
    if (!dejaListee) {
      html += '<option value="' + esc2(a) + '">' + esc(nomAssigneAffiche({ assigneA: a })) + ' (réglage actuel)</option>';
    }
    sel.innerHTML = html;
    sel.value = a;
  }
  function ouvrirEditeurFormulaire(f) {
    formulaireEnEdition = f.nom;
    champsEnConstruction = (f.champs || []).map(function (c) {
      return { cle: c.cle, label: c.label, type: c.type, options: c.options ? c.options.slice() : undefined };
    });
    document.getElementById("titreNouveauForm").textContent = "Modifier — " + f.nom;
    var inputNom = document.querySelector(".nf-nom");
    inputNom.value = f.nom;
    // Round du 02.09.2026 (Lionel : "les 3 ajouts créés ensemble doivent
    // pouvoir être modifiés"). "Modifier" était purement et simplement bloqué
    // pour Armature / Béton / Livraison armature — trop brutal : ce qu'il faut
    // protéger, c'est uniquement leur NOM, qui est la clé exacte reliant le
    // bouton à son interface dédiée (cf. cablerBoutonsMenuAjout). Les
    // renommer ferait silencieusement perdre cette interface au profit du
    // formulaire générique. Tout le reste — et surtout "Assigné à", qui est
    // précisément ce dont Lionel a besoin pour qu'ils cessent d'apparaître à
    // la fois chez le personnel et chez les intervenants — est modifiable.
    var estSpecial = NOMS_FORMULAIRES_SPECIAUX.indexOf(f.nom) !== -1;
    inputNom.disabled = estSpecial;
    var noteSpec = document.getElementById("noteFormSpecial");
    if (noteSpec) noteSpec.hidden = !estSpecial;
    remplirSelectAssigneFormulaire(f.assigneA);
    var selType = document.querySelector(".nf-type");
    if (selType) selType.value = (f.typeEntree === "absence") ? "absence" : "tache";
    rendreListeChampsForm();
    ouvrirPanneauFormulaire();
  }
  // Ouvre le constructeur de champ. idx = index du champ à MODIFIER, ou null
  // pour en créer un nouveau (round du 02.09.2026 — avant, ce panneau ne
  // savait qu'ajouter, et corriger une faute de frappe dans un libellé
  // obligeait à supprimer le champ puis à le refaire, en le perdant de sa
  // place au passage).
  var champEnModification = null;
  function ouvrirConstructeurChamp(idx) {
    champEnModification = (typeof idx === "number") ? idx : null;
    var existant = champEnModification !== null ? champsEnConstruction[champEnModification] : null;
    document.getElementById("constructeurChamp").hidden = false;
    document.querySelector(".cc-label").value = existant ? existant.label : "";
    document.querySelector(".cc-options").value = existant && existant.options ? existant.options.join(", ") : "";
    typeChampActuel = existant ? existant.type : "texte";
    document.querySelectorAll("#constructeurChamp .cc-type-row .chip").forEach(function (b) {
      b.classList.toggle("actif", b.dataset.type === typeChampActuel);
    });
    document.querySelector(".cc-options").hidden = typeChampActuel !== "select";
    var btnValider = document.querySelector(".cc-ajouter");
    if (btnValider) btnValider.textContent = existant ? "Enregistrer le champ" : "Ajouter le champ";
    document.querySelector(".cc-label").focus();
  }
  function ouvrirNouveauFormulaire() {
    formulaireEnEdition = null;
    champsEnConstruction = [];
    document.getElementById("titreNouveauForm").textContent = "Nouveau formulaire";
    var inputNom = document.querySelector(".nf-nom");
    inputNom.value = "";
    inputNom.disabled = false;
    var noteSpec = document.getElementById("noteFormSpecial");
    if (noteSpec) noteSpec.hidden = true;
    remplirSelectAssigneFormulaire(ASSIGNE_TOUS);
    var selTypeN = document.querySelector(".nf-type");
    if (selTypeN) selTypeN.value = "tache";
    rendreListeChampsForm();
    ouvrirPanneauFormulaire();
    inputNom.focus();
  }
  function cablerPageEntreeRapide() {
    var btnNouveau = document.getElementById("btnNouveauFormulaire");
    if (btnNouveau) btnNouveau.addEventListener("click", ouvrirNouveauFormulaire);
    document.querySelectorAll("#constructeurChamp .cc-type-row .chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("#constructeurChamp .cc-type-row .chip").forEach(function (b) { b.classList.remove("actif"); });
        btn.classList.add("actif");
        typeChampActuel = btn.dataset.type;
        document.querySelector(".cc-options").hidden = typeChampActuel !== "select";
      });
    });
    var btnAjouterChamp = document.getElementById("btnAjouterChamp");
    if (btnAjouterChamp) btnAjouterChamp.addEventListener("click", function () { ouvrirConstructeurChamp(null); });
    var ccAnnuler = document.querySelector(".cc-annuler");
    if (ccAnnuler) ccAnnuler.addEventListener("click", function () {
      champEnModification = null;
      document.getElementById("constructeurChamp").hidden = true;
    });
    var ccAjouter = document.querySelector(".cc-ajouter");
    if (ccAjouter) ccAjouter.addEventListener("click", function () {
      var label = document.querySelector(".cc-label").value.trim();
      if (!label) { toast("Nom du champ obligatoire."); return; }
      var options = null;
      if (typeChampActuel === "select") {
        options = document.querySelector(".cc-options").value.split(",").map(function (o) { return o.trim(); }).filter(Boolean);
        if (!options.length) { toast("Ajoute au moins une option (séparées par une virgule)."); return; }
      }
      if (champEnModification !== null && champsEnConstruction[champEnModification]) {
        // Modification : la CLÉ du champ est conservée telle quelle. C'est
        // elle qui identifie le champ dans les formulaires déjà remplis —
        // la régénérer depuis le nouveau libellé les orphelinerait.
        var c = champsEnConstruction[champEnModification];
        c.label = label;
        c.type = typeChampActuel;
        if (options) c.options = options; else delete c.options;
      } else {
        var champ = { cle: idChampDepuisLabel(label), label: label, type: typeChampActuel };
        if (options) champ.options = options;
        champsEnConstruction.push(champ);
      }
      champEnModification = null;
      rendreListeChampsForm();
      document.getElementById("constructeurChamp").hidden = true;
    });
    var nfAnnuler = document.querySelector(".nf-annuler");
    if (nfAnnuler) nfAnnuler.addEventListener("click", fermerPanneauFormulaire);
    var nfOk = document.querySelector(".nf-ok");
    if (nfOk) nfOk.addEventListener("click", function () {
      var nom = document.querySelector(".nf-nom").value.trim();
      if (!nom) { toast("Nom du formulaire obligatoire."); return; }
      var dejaExistant = etat.formulairesRapidesServeur.filter(function (x) { return x.nom === nom; })[0];
      if (dejaExistant && nom !== formulaireEnEdition) { toast("Un formulaire « " + nom + " » existe déjà."); return; }
      var existant = formulaireEnEdition && etat.formulairesRapidesServeur.filter(function (x) { return x.nom === formulaireEnEdition; })[0];
      var ordre = existant ? existant.ordre : (etat.formulairesRapidesServeur.length + 1);
      var champsAEnvoyer = champsEnConstruction.map(function (c) { return { cle: c.cle, label: c.label, type: c.type, options: c.options || [] }; });
      var assigneA = document.querySelector(".nf-assigne") ? document.querySelector(".nf-assigne").value : "";
      var typeEntree = document.querySelector(".nf-type") ? document.querySelector(".nf-type").value : "tache";
      var ancienNom = formulaireEnEdition;
      // apiEnregistrerFormulaireRapide fait un delete-then-append PAR NOM :
      // si le nom a changé, l'ancien bloc de lignes ne serait jamais retiré
      // tout seul — on le supprime explicitement d'abord.
      var chaine = (ancienNom && ancienNom !== nom) ? supprimerFormulaireRapideServeur(ancienNom) : Promise.resolve();
      chaine.then(function () {
        return enregistrerFormulaireRapideServeur(nom, ordre, champsAEnvoyer, assigneA, typeEntree);
      }).then(function (r) {
        rafraichirApresFormulaires(r);
        fermerPanneauFormulaire();
        toast(ancienNom ? "Formulaire modifié." : "Formulaire ajouté.");
      }).catch(function (err) { toast("Échec de l’enregistrement : " + (err && err.message ? err.message : err)); });
    });
  }

