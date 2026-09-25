"use strict";
  /* ============================================================
     PAGE "JALONS" — round du 12.09.2026. Lionel (après avoir confirmé que
     le mode "2 semaines" de la grille suffit pour les TÂCHES) : « il
     faudrait créer une page jalon dans le menu qui permettrait d'étendre
     les jalons uniquement sur des périodes plus longues », puis, sur le
     visuel proposé (mockup-page-jalons.html, validé) : « un page dans le
     menu, même mise en page et bouton que le personnel. sous modifier on
     peut saisir le nom, attribuer un chantier (pour la couleur du jalon),
     date de début et date de fin (même principe que les formulaires, avec
     clic et flèches, mais sans A/P). »

     Pourquoi une page à part plutôt qu'agrandir la grille : un jalon posé
     dans la grille (TACHES/JALONS/NOTES, cf. plus haut) vit dans le système
     de coordonnées `gi`, qui ne représente QUE les jours de la fenêtre
     actuellement chargée (1 ou 2 semaines, cf. giVisibleFenetre) — c'est
     une limite structurelle du moteur de synchro de la grille, pas
     seulement d'affichage (cf. le commentaire de appliquerDateChoisieFormulaire
     plus bas dans ce fichier). Cette page-ci ne passe JAMAIS par ce
     système : elle travaille en dates ISO pures et appelle enregistrer-plage
     directement avec une vraie plage (dateDebut/dateFin + origine),
     exactement comme le fait déjà une NOTE multi-jours — aucune limite de
     durée, aucun changement necessaire au moteur de la grille.

     Chantier sur un jalon (sql/0007_jalons_chantier.sql) : la table jalons
     n'avait jusqu'ici aucune colonne chantier (contrairement à
     taches/assignations) — un jalon posé depuis la grille garde donc
     toujours sa teinte pastel fixe (--jalon-bg), jamais la couleur d'un
     chantier ; seuls les jalons créés/édités depuis CETTE page peuvent en
     avoir un. functions/enregistrer-plage/logic.js reconduit tel quel le
     chantier_id/important déjà en base quand l'appelant ne les mentionne
     pas (cf. son commentaire de tête) — donc éditer le TEXTE d'un jalon
     depuis la grille ne peut jamais effacer un chantier posé ici.

     Un "jalon" tel qu'affiché ici est une FUSION de lignes jalons (une par
     jour ouvré, cf. sql/0001_schema.sql) dont le texte/important/chantier
     sont identiques sur des jours ouvrés consécutifs — même principe que la
     fusion déjà faite par la grille (cf. jalonAuGi plus bas), mais sur
     TOUTE la table plutôt que sur la seule fenêtre chargée.
     ============================================================ */
  var JALONS_TOUS = null; // null = pas encore chargé ; tableau de jalons FUSIONNÉS sinon (cf. fusionnerJalonsTous)

  function chargerJalonsTousServeur() {
    return sbClient.from("jalons").select("id, date, texte, important, chantier_id, demi").order("date").then(function (r) {
      if (r.error) throw new Error(r.error.message);
      return r.data || [];
    });
  }
  // Fusion PURE (aucun accès réseau/DOM) — regroupe des lignes jalons triées
  // par date en jalons "plage" : 2 lignes se fusionnent si elles portent le
  // même texte/important/chantier ET que la 2e tombe sur le jour ouvré qui
  // suit directement la 1ère (isoJourOuvreVoisin, déjà utilisée par les
  // flèches de dates plus bas dans ce fichier — saute les week-ends).
  // idDebut/idFin (les id des lignes de bord) servent de clé d'identité côté
  // UI ; `demi` n'est PAS pris en compte ici : cette page travaille toujours
  // en jours entiers (cf. tête de section), un jalon posé avec une
  // demi-journée de bord depuis la grille s'affiche donc ici sans distinction.
  function fusionnerJalonsTous(lignes) {
    var tri = lignes.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var items = [];
    var courant = null;
    // Demi-journées (revue du 24.09.2026, suite 22) : un jalon posé dans la
    // grille peut commencer l'après-midi ou finir le matin (colonne `demi`,
    // sql/0006_jalons_demi.sql) — cette page les ignorait. Deux effets :
    // modifier un tel jalon ici le repassait en journées entières, et le
    // déplacer laissait l'ancien EN DOUBLE (l'origine envoyée, sans demi, ne
    // correspondait plus à la ligne en base). Même règle de fusion que la
    // grille (construireVueDepuisCache) : seul le 1er jour peut porter une
    // demi-journée sans couper la plage, un jour suivant qui en porte une la
    // termine. demiDebut/demiFin sont gardés pour être renvoyés tels quels.
    tri.forEach(function (l) {
      var chantierId = l.chantier_id != null ? l.chantier_id : null;
      var important = !!l.important;
      var demi = l.demi || null;
      if (courant && l.texte === courant.texte && important === courant.important &&
          chantierId === courant.chantierId && isoJourOuvreVoisin(courant.dateFin, 1) === l.date &&
          (courant.dateFin === courant.dateDebut || courant.demiFin === null)) {
        courant.dateFin = l.date;
        courant.idFin = l.id;
        courant.demiFin = demi;
      } else {
        courant = { idDebut: l.id, idFin: l.id, dateDebut: l.date, dateFin: l.date, texte: l.texte, important: important, chantierId: chantierId, demiDebut: demi, demiFin: demi };
        items.push(courant);
      }
    });
    return items;
  }
  function chantierParId(id) {
    if (id == null) return null;
    return etat.chantiers.filter(function (c) { return c.ligne === id || String(c.ligne) === String(id); })[0] || null;
  }
  // Formatage d'une date ISO en toutes lettres courtes ("Lun. 07 sept." ou,
  // avecAnnee, "07 sept. 2026") — contrairement à libelleDateCourte (plus
  // bas dans ce fichier), volontairement indépendant de gi/de la fenêtre
  // chargée : cette page doit pouvoir afficher n'importe quelle date, même
  // à des années de distance.
  function libelleDateIso(iso, avecAnnee) {
    var d = new Date(iso + "T00:00:00");
    return pad2_(d.getDate()) + " " + MOIS_ABBR_WEB[d.getMonth() + 1] + (avecAnnee ? " " + d.getFullYear() : "");
  }
  function libelleDateIsoCourte(iso) {
    var d = new Date(iso + "T00:00:00");
    return JOURS_ABBR[d.getDay()] + ". " + libelleDateIso(iso);
  }
  function libellePlageJalon(j) {
    var anneeCourante = new Date().getFullYear();
    var debutAvecAnnee = new Date(j.dateDebut + "T00:00:00").getFullYear() !== anneeCourante || j.dateDebut.slice(0, 4) !== j.dateFin.slice(0, 4);
    if (j.dateDebut === j.dateFin) return libelleDateIso(j.dateDebut, true);
    return libelleDateIso(j.dateDebut, debutAvecAnnee) + " → " + libelleDateIso(j.dateFin, true);
  }
  function ligneFicheJalon(j) {
    var c = chantierParId(j.chantierId);
    var couleur = c ? c.couleur : "var(--jalon-bg)";
    return '<div class="ligne-intervenant" data-id-debut="' + esc2(j.idDebut) + '">' +
      '<span class="gauche-chantier"><span class="swatch-chantier" style="background:' + esc2(couleur) + '"></span><b>' + esc(j.texte) + '</b></span>' +
      // Drapeau « important » : l'icône des onglets (suite 53 ; ICONE_DRAPEAU,
      // plein, ne donnait qu'un petit carré noir à cette taille).
      (j.important ? '<span class="compte jalon-important" title="Important">' + ICONS.flag + '</span>' : '') +
      '<span class="plage-jalon">' + esc(libellePlageJalon(j)) + '</span>' +
      '<span class="ligne-actions">' +
      // Icônes (suite 53, cf. boutonIconeLigne).
      boutonIconeLigne("lien-modifier", ICONS.pencil, "Modifier") +
      boutonIconeLigne("lien-supprimer", ICONS.trash, "Supprimer") + '</span></div>';
  }
  // Revue du 24.09.2026 (suite 22) : cette page écrit les jalons sans
  // passer par la grille, qui gardait donc sa vue d'avant (jusqu'à la
  // prochaine navigation) — jalon supprimé encore affiché au retour sur
  // Planning, et un déplacement fait ensuite dans la grille partait de
  // cette donnée périmée. Même relecture que les pages Chantiers et
  // Personnel après leurs écritures.
  function rafraichirGrilleApresJalons_() {
    oublierCache();
    assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); });
  }
  function supprimerJalonServeur(j, apresChangement) {
    demanderConfirmation("Supprimer « " + j.texte + " » ?", function () {
      occupe(true);
      invoquerFonctionServeur("enregistrer-plage", {
        kind: "jalon", dateDebut: j.dateDebut, dateFin: j.dateFin, texte: "", mode: "remplacement", origine: null
      }).then(function () {
        occupe(false);
        JALONS_TOUS = null;
        rafraichirGrilleApresJalons_();
        apresChangement();
        toast("Supprimé.");
      }).catch(function (err) { occupe(false); toast("Échec de la suppression : " + (err && err.message ? err.message : err)); });
    });
  }
  function cablerListeJalons(zone) {
    function jalonDeLigne(btn) {
      var idDebut = btn.closest("[data-id-debut]").dataset.idDebut;
      return JALONS_TOUS.filter(function (x) { return String(x.idDebut) === idDebut; })[0] || null;
    }
    zone.querySelectorAll(".lien-modifier").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var j = jalonDeLigne(btn);
        if (j) ouvrirFormulaireJalon(j);
      });
    });
    zone.querySelectorAll(".lien-supprimer").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var j = jalonDeLigne(btn);
        if (j) supprimerJalonServeur(j, renderJalons);
      });
    });
    var btnAdd = zone.querySelector(".ligne-ajouter");
    if (btnAdd) btnAdd.addEventListener("click", function () { ouvrirFormulaireJalon(null); });
  }
  function renderJalons() {
    var zone = document.getElementById("listeJalons");
    if (!zone) return;
    if (JALONS_TOUS === null) {
      zone.innerHTML = '<div class="page-placeholder">Chargement…</div>';
      chargerJalonsTousServeur().then(function (lignes) {
        JALONS_TOUS = fusionnerJalonsTous(lignes);
        renderJalons();
      }).catch(function (err) {
        zone.innerHTML = '<div class="page-placeholder">Échec du chargement : ' + esc(err && err.message ? err.message : err) + '</div>';
      });
      return;
    }
    var tries = JALONS_TOUS.slice().sort(function (a, b) { return a.dateDebut < b.dateDebut ? -1 : a.dateDebut > b.dateDebut ? 1 : 0; });
    zone.innerHTML = tries.map(ligneFicheJalon).join("") + '<button type="button" class="ligne-ajouter">+ Ajouter</button>';
    cablerListeJalons(zone);
  }

  // ---- Fiche Ajouter/Modifier (bandeau coloré par chantier + 2 dates ISO
  // sans A/P + nom en texte libre) — réutilise bandeauHTML/piedPrincipalHTML
  // (fabriques partagées définies plus bas dans ce fichier, cf. leur
  // commentaire de tête) et les mêmes classes CSS que .carte-item, mais PAS
  // datesPlageHTML/cablerDatesPlage (ceux-là travaillent en `gi`, borné à la
  // fenêtre chargée — cf. tête de section) : dateLigneJalonHTML/
  // cablerDatesJalon ci-dessous en sont des variantes en ISO pur, sans
  // aucune limite de fenêtre, et sans les boutons A/P (non demandés ici).
  function dateLigneJalonHTML(label, iso, bord) {
    return '<div class="date-ligne" data-bord="' + bord + '">' +
      '<div class="date-ligne-gauche">' +
      '<span class="label-date">' + label + '</span>' +
      '<div class="date-nav">' +
      '<button type="button" class="fleche f-fleche" data-sens="-1" title="Jour ouvré précédent">' + ICONE_CHEVRON_G + '</button>' +
      '<span class="date-val">' + esc(libelleDateIsoCourte(iso)) + '</span>' +
      '<button type="button" class="fleche f-fleche" data-sens="1" title="Jour ouvré suivant">' + ICONE_CHEVRON_D + '</button>' +
      '</div></div></div>';
  }
  function datesPlageJalonHTML(debutIso, finIso) {
    return '<div class="dates-plage">' + dateLigneJalonHTML("Début", debutIso, "debut") + dateLigneJalonHTML("Fin", finIso, "fin") + '</div>';
  }
  // Même règle asymétrique que appliquerDateChoisieFormulaire (plus bas dans
  // ce fichier, cf. son commentaire pour l'historique complet) : le bord
  // édité prend exactement la date choisie, l'AUTRE bord n'est recollé que
  // si le garder rendrait Début > Fin — mais ici, à la différence de la
  // grille, AUCUNE fenêtre à respecter : n'importe quelle date ISO est
  // valide, jamais de rejet ni de toast.
  function appliquerDateChoisieJalon(state, bord, isoChoisi, rafraichir) {
    var autre = bord === "debut" ? state.finIso : state.debutIso;
    if (bord === "debut") {
      state.debutIso = isoChoisi;
      state.finIso = (autre >= isoChoisi) ? autre : isoChoisi;
    } else {
      state.finIso = isoChoisi;
      state.debutIso = (autre <= isoChoisi) ? autre : isoChoisi;
    }
    rafraichir();
  }
  function cablerDatesJalon(pop, state, rafraichir) {
    var conteneur = pop.querySelector(".dates-plage");
    conteneur.querySelectorAll(".f-fleche").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var bord = btn.closest(".date-ligne").dataset.bord;
        var isoActuel = bord === "debut" ? state.debutIso : state.finIso;
        appliquerDateChoisieJalon(state, bord, isoJourOuvreVoisin(isoActuel, +btn.dataset.sens), rafraichir);
      });
    });
    conteneur.querySelectorAll(".date-val").forEach(function (span) {
      span.classList.add("date-val-cliquable");
      span.title = "Cliquer pour choisir une date dans le calendrier";
      span.addEventListener("click", function () {
        if (conteneur.querySelector(".date-picker-natif")) return;
        var ligne = span.closest(".date-ligne");
        var bord = ligne.dataset.bord;
        var input = document.createElement("input");
        input.type = "date";
        input.className = "date-picker-natif";
        input.value = bord === "debut" ? state.debutIso : state.finIso;
        var r = span.getBoundingClientRect();
        input.style.left = r.left + "px"; input.style.top = r.top + "px";
        input.style.width = Math.max(r.width, 90) + "px"; input.style.height = r.height + "px";
        ligne.appendChild(input);
        var nettoye = false;
        function nettoyer() { if (nettoye) return; nettoye = true; if (input.parentElement) input.remove(); }
        input.addEventListener("change", function () {
          var iso = input.value;
          nettoyer();
          if (iso) appliquerDateChoisieJalon(state, bord, iso, rafraichir);
        });
        input.addEventListener("blur", function () { setTimeout(nettoyer, 200); });
        if (input.showPicker) { try { input.showPicker(); } catch (ex) { input.focus(); } }
        else input.focus();
      });
    });
  }
  // Round du 14.09.2026 : n'offre plus un chantier désactivé au choix pour
  // un NOUVEAU jalon — sauf s'il s'agit justement du chantier déjà choisi
  // sur ce jalon (édition d'un jalon existant qui pointait vers un chantier
  // depuis désactivé) : reste alors proposé/sélectionné, pour ne jamais
  // faire disparaître silencieusement le lien à l'enregistrement.
  function champChantierJalonHTML(chantierIdInit) {
    var liste = etat.chantiers.filter(function (c) {
      return c.actif !== false || (chantierIdInit != null && String(chantierIdInit) === String(c.ligne));
    });
    var options = liste.map(function (c) {
      var sel = chantierIdInit != null && String(chantierIdInit) === String(c.ligne);
      return '<option value="' + esc2(c.ligne) + '"' + (sel ? " selected" : "") + '>' + esc(c.nom) + '</option>';
    }).join("");
    return '<select class="f-chantier-jalon chantier-tag">' + options + '</select>';
  }
  function ouvrirFormulaireJalon(itemExisting) {
    var aujourdhuiIso = premierJourOuvreDepuis(isoDeDate(new Date()));
    var state = {
      debutIso: itemExisting ? itemExisting.dateDebut : aujourdhuiIso,
      finIso: itemExisting ? itemExisting.dateFin : aujourdhuiIso,
      important: itemExisting ? itemExisting.important : false,
      // Round du 14.09.2026 : le 1er chantier ACTIF (etat.chantiers peut
      // désormais contenir des désactivés, triés par ordre sans distinction) —
      // jamais un chantier désactivé comme choix par défaut d'un nouveau jalon.
      chantierId: itemExisting ? itemExisting.chantierId : (function () {
        var actifs = etat.chantiers.filter(function (c) { return c.actif !== false; });
        return actifs.length ? actifs[0].ligne : null;
      })()
    };
    function couleurBandeau() {
      var c = chantierParId(state.chantierId);
      return c ? c.couleur : "var(--jalon-bg)";
    }
    var pop = document.createElement("div");
    pop.className = "pop form-pop carte-item";
    pop.innerHTML =
      bandeauHTML({ clair: !chantierParId(state.chantierId), fondStyle: "background:" + couleurBandeau(), important: state.important, chantierHTML: champChantierJalonHTML(state.chantierId), nomGrand: "Jalon" }) +
      datesPlageJalonHTML(state.debutIso, state.finIso) +
      '<div class="corps"><div class="label-champ" style="margin:0 0 6px">Nom</div>' +
      '<input type="text" class="f-nom-jalon" value="' + esc2(itemExisting ? itemExisting.texte : "") + '" placeholder="ex. Livraison agglos"></div>' +
      piedPrincipalHTML(!!itemExisting);
    var px = Math.round(window.innerWidth / 2 - 162), py = Math.max(30, Math.round(window.innerHeight / 2 - 230));
    positionnerPop(pop, px, py);
    var fermer = fermerAuClicExterieur(pop, null, function () { pop.querySelector(".f-ok").click(); });
    function cablerBandeau() {
      pop.querySelector(".f-annuler").addEventListener("click", fermer);
      pop.querySelector(".f-important").addEventListener("click", function () {
        state.important = !state.important;
        rafraichirBandeau();
      });
      var sel = pop.querySelector(".f-chantier-jalon");
      if (sel) sel.addEventListener("change", function () {
        state.chantierId = sel.value ? +sel.value : null;
        rafraichirBandeau();
      });
    }
    function rafraichirBandeau() {
      pop.querySelector(".bandeau").outerHTML = bandeauHTML({
        clair: !chantierParId(state.chantierId), fondStyle: "background:" + couleurBandeau(),
        important: state.important, chantierHTML: champChantierJalonHTML(state.chantierId), nomGrand: "Jalon"
      });
      cablerBandeau();
    }
    function rafraichirDates() {
      pop.querySelector(".dates-plage").outerHTML = datesPlageJalonHTML(state.debutIso, state.finIso);
      cablerDatesJalon(pop, state, rafraichirDates);
    }
    cablerBandeau();
    cablerDatesJalon(pop, state, rafraichirDates);
    var suppr = pop.querySelector(".f-suppr");
    if (suppr) suppr.addEventListener("click", function () { fermer(); supprimerJalonServeur(itemExisting, renderJalons); });
    pop.querySelector(".f-ok").addEventListener("click", function () {
      var texte = pop.querySelector(".f-nom-jalon").value.trim();
      if (!texte) { fermer(); return; }
      // Demi-journées (cf. fusionnerJalonsTous) : un bord dont la date n'a
      // pas changé garde sa demi-journée ; un bord déplacé ici (pas de
      // matin/après-midi sur cette page) redevient une journée entière.
      var demiDebut = itemExisting && state.debutIso === itemExisting.dateDebut ? (itemExisting.demiDebut || null) : null;
      var demiFin = itemExisting && state.finIso === itemExisting.dateFin ? (itemExisting.demiFin || null) : null;
      // Forme canonique (comme la grille, cf. bornesDepuisDemiSlots) : sur 1
      // jour, les 2 bords portent la même demi-journée ou aucune ; sur
      // plusieurs, un début « matin » ou une fin « après-midi » valent une
      // journée entière.
      if (state.debutIso === state.finIso) { if (demiDebut !== demiFin) { demiDebut = null; demiFin = null; } }
      else { if (demiDebut === "matin") demiDebut = null; if (demiFin === "aprem") demiFin = null; }
      var payload = {
        kind: "jalon", dateDebut: state.debutIso, dateFin: state.finIso, texte: texte,
        demiDebut: demiDebut, demiFin: demiFin,
        important: state.important, chantierId: state.chantierId, mode: "remplacement",
        origine: itemExisting ? {
          dateDebut: itemExisting.dateDebut, dateFin: itemExisting.dateFin, texte: itemExisting.texte,
          demiDebut: itemExisting.demiDebut || null, demiFin: itemExisting.demiFin || null,
          important: itemExisting.important, chantierId: itemExisting.chantierId
        } : null
      };
      fermer();
      occupe(true);
      invoquerFonctionServeur("enregistrer-plage", payload).then(function () {
        occupe(false);
        JALONS_TOUS = null;
        rafraichirGrilleApresJalons_();
        renderJalons();
        toast(itemExisting ? "Modifié." : "Ajouté.");
      }).catch(function (err) {
        occupe(false);
        toast("Échec de l’enregistrement : " + (err && err.message ? err.message : err));
      });
    });
  }

