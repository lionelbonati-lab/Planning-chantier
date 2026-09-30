"use strict";
  /* ============================================================
     ÉQUIPES (round du 25.09.2026, suite 33 — sql/0015_equipes.sql).
     Lionel : « J'aimerai pouvoir gérer mon personnel par équipe sur de
     plus grands chantiers. Plusieurs personnes auront les mêmes tâches sur
     toute la semaine. » Ses 3 choix (AskUserQuestion) :
       - « Ligne d'équipe » : une seule ligne par équipe dans le planning,
         la tâche est saisie une fois pour tous les membres ;
       - composition « Par semaine » : Luc peut être dans l'équipe A cette
         semaine et dans la B la suivante ;
       - impression « Une ligne par équipe », avec les noms des membres.

     Une équipe est une ligne de `personnes` (equipe = true) : ses tâches
     sont de vraies tâches (taches.personne_id = l'équipe). Grille, bulles,
     séries, copier/coller et impression la traitent donc comme une
     personne, sans code à part. Ce fichier n'ajoute que :
       - la composition par semaine (etat.compositionsEquipes, instantanés
         « à partir du lundi X », cf. planCompositionEquipe) ;
       - l'ordre d'affichage : chaque équipe suivie de ses membres, en tête
         du Personnel (personnesAffichees / ordrePersonnesEquipes) ;
       - le repli : une équipe repliée (par défaut) cache ses membres, SAUF
         ceux qui ont quelque chose à eux dans la fenêtre (absence, tâche
         ailleurs) — ils restent visibles juste sous l'équipe, c'est ainsi
         qu'une absence dans l'équipe se voit d'un coup d'œil ;
       - l'étiquette de la ligne (nom + membres, ▸/▾) et la fenêtre de
         composition (clic sur l'étiquette).
     ============================================================ */

  // Équipes dépliées ({ id: true }) — préférence d'affichage de cet
  // appareil seulement (comme le repli des sections), d'où localStorage.
  var CLE_EQUIPES_DEPLIEES = "planning.equipesDepliees";
  var equipesDepliees = (function () {
    try { return JSON.parse(localStorage.getItem(CLE_EQUIPES_DEPLIEES) || "{}") || {}; } catch (e) { return {}; }
  })();
  function basculerDepliageEquipe(equipeId) {
    if (equipesDepliees[equipeId]) delete equipesDepliees[equipeId]; else equipesDepliees[equipeId] = true;
    try { localStorage.setItem(CLE_EQUIPES_DEPLIEES, JSON.stringify(equipesDepliees)); } catch (e) { /* navigation privée : repli non retenu */ }
    render(false);
  }

  /* ---------- Données ---------- */
  var COLONNES_COMPOSITIONS = "id, equipe_id, lundi, membres";
  function normaliserCompositions(lignes) {
    return (lignes || []).map(function (l) {
      return { equipeId: String(l.equipe_id), lundi: String(l.lundi).slice(0, 10), membres: (l.membres || []).map(String) };
    }).sort(function (a, b) { return a.lundi < b.lundi ? -1 : a.lundi > b.lundi ? 1 : 0; });
  }
  function chargerCompositionsEquipes() {
    return Promise.resolve(sbClient.from("equipes_compositions").select(COLONNES_COMPOSITIONS)).then(function (res) {
      if (res.error) throw res.error;
      etat.compositionsEquipes = normaliserCompositions(res.data);
      return etat.compositionsEquipes;
    });
  }
  // Une seule écriture atomique (sql/0015, remplacer_compositions_equipes) :
  // tous les instantanés des équipes touchées sont remplacés d'un bloc.
  function enregistrerCompositionsEquipesServeur(plan) {
    return Promise.resolve(sbClient.rpc("remplacer_compositions_equipes", {
      p_equipes: plan.equipes.map(Number),
      p_lignes: plan.lignes.map(function (l) { return { equipe_id: +l.equipeId, lundi: l.lundi, membres: l.membres.map(Number) }; })
    })).then(function (res) {
      if (res && res.error) throw res.error;
      return chargerCompositionsEquipes();
    });
  }

  function estLigneEquipe(personneId) { var p = personneParAncre(personneId); return !!(p && p.equipe); }

  /* ---------- Dates ---------- */
  function decalerIso_(iso, jours) {
    var d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + jours);
    return d.toISOString().slice(0, 10);
  }
  function lundiDeIso(iso) {
    var d = new Date(iso + "T00:00:00Z");
    return decalerIso_(iso, -((d.getUTCDay() + 6) % 7));
  }
  // Semaine de référence de la grille : celle de la pilule « Sem. N »
  // (labGCourant). Sur une fenêtre de 2 semaines, les équipes sont
  // regroupées selon la 1re ; la fenêtre de composition dit toujours de
  // quelle semaine il s'agit.
  function lundiCourantEquipes() { return infosSemaineDepuisLabG(labGCourant()).debut; }

  /* ---------- Composition ---------- */
  // Instantané en vigueur pour l'équipe à ce lundi : le dernier dont le
  // lundi est ≤ au lundi demandé. compos = liste triée par lundi.
  function instantaneEquipe_(compos, equipeId, lundi) {
    var r = null;
    for (var i = 0; i < compos.length; i++) {
      var c = compos[i];
      if (c.equipeId === String(equipeId) && c.lundi <= lundi) r = c;
    }
    return r;
  }
  function membresBruts_(compos, equipeId, lundi) {
    var c = instantaneEquipe_(compos, equipeId, lundi);
    return c ? c.membres.slice() : [];
  }
  // Membres affichables : personnel actif connu, jamais une équipe ni un
  // intervenant — un id disparu (personne supprimée) est ignoré.
  function membresEquipe(equipeId, lundi) {
    return membresBruts_(etat.compositionsEquipes || [], equipeId, lundi).filter(function (id) {
      var p = personneParAncre(id);
      return p && !p.equipe && !p.sousTraitant;
    });
  }
  // Équipe (active, donc dans PERSONNES) d'une personne cette semaine-là.
  function equipeDuMembre(personneId, lundi) {
    var id = String(personneId);
    for (var i = 0; i < PERSONNES.length; i++) {
      if (PERSONNES[i].equipe && membresEquipe(PERSONNES[i].id, lundi).indexOf(id) >= 0) return PERSONNES[i].id;
    }
    return null;
  }
  function memesMembres_(a, b) {
    if (a.length !== b.length) return false;
    var x = a.slice().sort(), y = b.slice().sort();
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  // Nouvelle composition de l'équipe `equipeId` à la semaine `lundi` —
  // fonction PURE (testée seule) : renvoie { equipes, lignes } = la liste
  // complète des instantanés de chaque équipe touchée, à écrire telle
  // quelle par remplacer_compositions_equipes.
  //   portee "semaine"   : seule cette semaine change. Un instantané est
  //                        posé au lundi suivant avec la composition
  //                        d'AVANT (si aucun n'y est déjà), pour que la
  //                        suite reste comme elle était.
  //   portee "suivantes" : cette semaine et toutes les suivantes — les
  //                        instantanés futurs de l'équipe sont effacés.
  // Une personne n'est que dans une équipe à la fois : un membre ajouté
  // ici est retiré, sur la même portée, de l'équipe où il était.
  // Normalisation : un instantané identique au précédent (ou vide sans
  // précédent) est retiré — la table ne garde que les vrais changements.
  function planCompositionEquipe(compos, equipeId, lundi, membres, portee) {
    equipeId = String(equipeId);
    membres = membres.map(String);
    var lundiSuivant = decalerIso_(lundi, 7);
    var parEquipe = {};
    compos.forEach(function (c) {
      (parEquipe[c.equipeId] = parEquipe[c.equipeId] || []).push({ equipeId: c.equipeId, lundi: c.lundi, membres: c.membres.map(String) });
    });
    var touchees = {};
    touchees[equipeId] = true;
    Object.keys(parEquipe).forEach(function (x) {
      if (x === equipeId) return;
      var prend = function (liste) { return liste.some(function (m) { return membres.indexOf(m) >= 0; }); };
      if (prend(membresBruts_(compos, x, lundi))) touchees[x] = true;
      if (portee === "suivantes" && parEquipe[x].some(function (c) { return c.lundi > lundi && prend(c.membres); })) touchees[x] = true;
    });
    var lignes = [];
    Object.keys(touchees).forEach(function (x) {
      var liste = (parEquipe[x] || []).slice();
      var avant = membresBruts_(compos, x, lundi);
      var suite = membresBruts_(compos, x, lundiSuivant);
      var nouveau = x === equipeId ? membres.slice() : avant.filter(function (m) { return membres.indexOf(m) < 0; });
      var poser = function (l, m) {
        liste = liste.filter(function (c) { return c.lundi !== l; });
        liste.push({ equipeId: x, lundi: l, membres: m });
      };
      if (portee === "suivantes") {
        if (x === equipeId) liste = liste.filter(function (c) { return c.lundi <= lundi; });
        else liste.forEach(function (c) { if (c.lundi > lundi) c.membres = c.membres.filter(function (m) { return membres.indexOf(m) < 0; }); });
      } else if (!liste.some(function (c) { return c.lundi === lundiSuivant; })) {
        poser(lundiSuivant, suite);
      }
      poser(lundi, nouveau);
      liste.sort(function (a, b) { return a.lundi < b.lundi ? -1 : 1; });
      var prec = [];
      liste.forEach(function (c) {
        if (!memesMembres_(c.membres, prec)) lignes.push(c);
        prec = c.membres;
      });
    });
    return { equipes: Object.keys(touchees), lignes: lignes };
  }

  /* ---------- Ordre d'affichage ---------- */
  // Personnel ordonné pour l'affichage : chaque équipe (à sa place dans
  // l'ordre de la page Personnel, avant les personnes seules) suivie de
  // ses membres, puis le personnel hors équipe. `liste` = personnes du
  // Personnel (pas d'intervenants) ; idDe(p) = son id en chaîne.
  // Renvoie [{ p, role: "equipe" | "membre" | null, equipeId }].
  function ordrePersonnesEquipes(liste, lundi, idDe) {
    var parId = {};
    liste.forEach(function (p) { parId[idDe(p)] = p; });
    var equipes = liste.filter(function (p) { return p.equipe; });
    var pris = {}, out = [];
    equipes.forEach(function (e) {
      var eid = idDe(e);
      out.push({ p: e, role: "equipe", equipeId: eid });
      var ids = membresBruts_(etat.compositionsEquipes || [], eid, lundi);
      liste.forEach(function (p) {
        var id = idDe(p);
        if (!p.equipe && !p.sousTraitant && !pris[id] && ids.indexOf(id) >= 0) { pris[id] = true; out.push({ p: p, role: "membre", equipeId: eid }); }
      });
    });
    liste.forEach(function (p) { if (!p.equipe && !pris[idDe(p)]) out.push({ p: p, role: null, equipeId: null }); });
    return out;
  }
  // Lignes de la grille pour un secteur, dans l'ordre affiché — seule
  // source pour le rendu (grille-rendu.js) ET pour les gestes qui
  // parcourent les lignes (sélection au glissé, coller sur plusieurs
  // lignes) : un membre caché ne doit jamais recevoir un collage.
  function personnesAffichees(secteur) {
    if (secteur === "sous-traitant") return PERSONNES.filter(function (p) { return p.sousTraitant; });
    var ordre = ordrePersonnesEquipes(PERSONNES.filter(function (p) { return !p.sousTraitant; }), lundiCourantEquipes(), function (p) { return p.id; });
    // Round du 29.09.2026 (suite 118) — Lionel : « En vue un jour, le
    // pliage et le dépliage de l'équipe ne fonctionnent pas. » La vue
    // « 1 jour » charge 2 semaines : un membre qui avait quoi que ce soit
    // dans ces 2 semaines restait sous son équipe repliée — sur un vrai
    // chantier, tous ; ▸/▾ ne changeait donc rien. Dans cette vue, seul
    // compte le jour affiché (lignes refaites au changement de jour,
    // cf. defilementArrete, grille-telephone.js).
    var jour = modeJourMobileActif() ? (jourMobileIso || etat.aujourdhui) : null;
    return ordre.filter(function (e) {
      if (e.role !== "membre" || equipesDepliees[e.equipeId]) return true;
      // Suite 131 : un membre retiré de l'équipe (ou ajouté à une autre)
      // reste visible, pour que sa case « Hors équipe » se voie.
      if (aExceptionAffichee_(e.p.id, jour)) return true;
      return TACHES.some(function (it) {
        return it.personneId === e.p.id && (!jour || ((it.dateDebutIso || isoDeGi(it.giDebut)) <= jour && isoDeApres(it) >= jour));
      });
    }).map(function (e) { return e.p; });
  }
  // Membres affichés sous les équipes (suite 118) : comparés avant / après
  // un changement de jour en vue « 1 jour ».
  function signatureMembresAffiches_() { return personnesAffichees("personnel").map(function (p) { return p.id; }).join(","); }
  function personnesAfficheesToutes() { return personnesAffichees("personnel").concat(personnesAffichees("sous-traitant")); }
  // Suite 120 : même ordre, sans pliage — un membre caché sous son équipe
  // repliée reste dans les listes « Pour qui » de l'ajout.
  function personnelOrdonneSansPliage() {
    return ordrePersonnesEquipes(PERSONNES.filter(function (p) { return !p.sousTraitant; }), lundiCourantEquipes(), function (p) { return p.id; })
      .map(function (e) { return e.p; });
  }

  /* ---------- Couleur (round du 29.09.2026, suite 119) ----------
     Lionel : « mettre une couleur sur l'équipe, je vois qu'il y a une
     bordure grise, il serait bien de pouvoir choisir sa couleur par
     équipe ». La bande à gauche du nom de l'équipe (et, plus pâle, de ses
     membres) prend la couleur choisie — menu du nom (clic droit, appui
     long) ou pastille de la page Personnel. Enregistrée en base
     (personnes.couleur, sql/0025) : la même sur tous les appareils. Sans
     couleur : l'accent du thème, comme avant. */
  var COULEURS_EQUIPES = ["#e53935", "#fb8c00", "#fdd835", "#43a047", "#00897b", "#1e88e5", "#8e24aa", "#6d4c41"];
  function couleurEquipe(equipeId) {
    var r = (etat.personnesActives || []).filter(function (x) { return String(x.id) === String(equipeId); })[0];
    return (r && r.couleur) || null;
  }
  function changerCouleurEquipe(equipeId, couleur) {
    couleur = couleur ? hexPastille(couleur) : null;
    if (couleur === couleurEquipe(equipeId)) return Promise.resolve();
    return couleurPersonneServeur(ancreDe(equipeId), couleur).then(function () {
      (etat.personnesActives || []).forEach(function (x) { if (String(x.id) === String(equipeId)) x.couleur = couleur; });
      render(false);
      toast(couleur ? "Couleur de l’équipe modifiée." : "Couleur de l’équipe par défaut.");
    }).catch(function (err) { toast("Échec de la modification : " + (err && err.message ? err.message : err)); });
  }
  function poserCouleurEquipe_(lbl, equipeId) {
    var c = couleurEquipe(equipeId);
    lbl.classList.toggle("equipe-coloree", !!c);
    if (c) lbl.style.setProperty("--couleur-equipe", c); else lbl.style.removeProperty("--couleur-equipe");
  }

  /* ---------- Étiquette de ligne ---------- */
  function nomsMembres_(ids) {
    return ids.map(function (id) { var p = personneParAncre(id); return p ? p.nom : null; }).filter(Boolean);
  }
  // Complète l'étiquette (.lbl, déjà posée avec le nom) d'une ligne
  // d'équipe (contenu remplacé) ou d'un membre (simple classe, décalé sous
  // son équipe). Rien pour une personne sans équipe.
  function remplirEtiquetteEquipe(lbl, p) {
    var lundi = lundiCourantEquipes();
    if (p.equipe) {
      var base = membresEquipe(p.id, lundi);
      var noms = nomsMembres_(base);
      // Suite 131 : les personnes ajoutées cette semaine, « +Paul » après
      // les membres ; le détail des exceptions dans l'info-bulle.
      var excSemaine = exceptionsSemaine(lundi, function (x) { return x.equipeId === p.id || base.indexOf(x.personneId) >= 0; })
        .filter(function (x) { var ex = exceptionCase(x.personneId, x.date, x.demi); return ex && (ex.equipeId === p.id || (ex.sorte === "ajout" && base.indexOf(x.personneId) >= 0)); });
      var ajoutes = [];
      excSemaine.forEach(function (x) { if (x.equipeId === p.id && x.sorte === "ajout" && base.indexOf(x.personneId) < 0 && ajoutes.indexOf(x.personneId) < 0) ajoutes.push(x.personneId); });
      noms = noms.concat(nomsMembres_(ajoutes).map(function (n) { return "+" + n; }));
      var detail = excSemaine.slice().sort(function (a, b) { return cleDemi_(a) < cleDemi_(b) ? -1 : 1; }).map(function (x) {
        var ex = exceptionCase(x.personneId, x.date, x.demi), m = personneParAncre(x.personneId);
        return (m ? m.nom : x.personneId) + " : " + (ex.equipeId === p.id ? (ex.sorte === "ajout" ? "ajouté" : "hors équipe") : "dans l’équipe " + personneParAncre(ex.equipeId).nom) + ", " + libelleDemiJournee_(x.date, x.demi);
      }).filter(function (l, i, t) { return t.indexOf(l) === i; });
      var ouverte = !!equipesDepliees[p.id];
      lbl.classList.add("lbl-equipe");
      lbl.dataset.equipe = p.id;
      poserCouleurEquipe_(lbl, p.id);
      // Suite 104 : le menu de la ligne (grille-hauteurs.js) propose
      // « Composition de l'équipe… » ; suite 106 : il s'ouvre au clic droit.
      lbl.title = p.nom + (noms.length ? " — " + noms.join(", ") : "") + (detail.length ? "\n" + detail.join("\n") : "") + "\nClic droit : composition de la semaine, hauteur de la ligne";
      lbl.innerHTML =
        '<div class="equipe-titre"><button type="button" class="equipe-repli" aria-expanded="' + ouverte + '" title="' + (ouverte ? "Replier les membres" : "Déplier les membres") + '">' + (ouverte ? "▾" : "▸") + "</button>" +
        "<b>" + nomSurDeuxLignes(p.nom) + "</b></div>" +
        '<span class="equipe-membres">' + (noms.length ? esc(noms.join(", ")) : "Aucun membre") + "</span>";
      lbl.querySelector(".equipe-repli").addEventListener("click", function (ev) { ev.stopPropagation(); basculerDepliageEquipe(p.id); });
      return;
    }
    var eq = !p.sousTraitant && equipeDuMembre(p.id, lundi);
    if (eq) {
      lbl.classList.add("lbl-membre");
      lbl.dataset.membreDe = eq;
      poserCouleurEquipe_(lbl, eq);
    }
  }

  /* ---------- Fenêtre de composition ---------- */
  function ouvrirCompositionEquipe(equipeId) {
    var equipe = personneParAncre(equipeId);
    if (!equipe) return;
    var lundi = lundiCourantEquipes();
    var actuels = membresEquipe(equipeId, lundi);
    var candidats = PERSONNES.filter(function (p) { return !p.sousTraitant && !p.equipe; });
    var pop = document.createElement("div");
    pop.className = "pop form-pop composition-equipe";
    pop.innerHTML =
      '<div class="cp-titre">' + esc(equipe.nom) + " — semaine " + numeroSemaineIsoUTC(lundi) + "</div>" +
      '<p class="composition-aide">Membres de l’équipe cette semaine. Les tâches de la ligne d’équipe valent pour eux tous ; une absence se pose sur la ligne de la personne.</p>' +
      '<div class="composition-liste">' + (candidats.length ? candidats.map(function (p) {
        var autre = equipeDuMembre(p.id, lundi);
        var note = autre && autre !== String(equipeId) ? '<small>' + esc(personneParAncre(autre).nom) + "</small>" : "";
        return '<label class="composition-membre"><input type="checkbox" value="' + esc2(p.id) + '"' + (actuels.indexOf(p.id) >= 0 ? " checked" : "") + "><span>" + esc(p.nom) + "</span>" + note + "</label>";
      }).join("") : '<p class="composition-aide">Aucun personnel actif.</p>') + "</div>" +
      '<div class="form-actions composition-actions">' +
      '<button type="button" class="f-annuler">Annuler</button>' +
      '<button type="button" class="f-semaine" title="Seulement la semaine ' + numeroSemaineIsoUTC(lundi) + '">Cette semaine</button>' +
      '<button type="button" class="f-ok" title="Cette semaine et toutes les suivantes">Et les suivantes</button>' +
      "</div>";
    positionnerPop(pop, Math.round(window.innerWidth / 2 - 150), Math.round(window.innerHeight / 2 - 180));
    var fermer = fermerAuClicExterieur(pop, null, function () { pop.querySelector(".f-ok").click(); });
    pop.querySelector(".f-annuler").addEventListener("click", fermer);
    function enregistrer(portee) {
      var membres = [].map.call(pop.querySelectorAll(".composition-membre input:checked"), function (c) { return c.value; });
      fermer();
      if (memesMembres_(membres, actuels)) return;
      var plan = planCompositionEquipe(etat.compositionsEquipes || [], equipeId, lundi, membres, portee);
      enregistrerCompositionsEquipesServeur(plan).then(function () {
        render(false);
        toast(portee === "semaine" ? "Équipe modifiée pour la semaine " + numeroSemaineIsoUTC(lundi) + "." : "Équipe modifiée à partir de la semaine " + numeroSemaineIsoUTC(lundi) + ".");
      }).catch(function (err) { toast("Échec de l’enregistrement : " + (err && err.message ? err.message : err)); });
    }
    pop.querySelector(".f-semaine").addEventListener("click", function () { enregistrer("semaine"); });
    pop.querySelector(".f-ok").addEventListener("click", function () { enregistrer("suivantes"); });
  }

  /* ---------- Exceptions par demi-journée (round du 30.09.2026, suite 131) ----------
     Lionel : « J'aimerai que les équipes soient plus modulable, possibilité
     d'ajouter/retirer une personnes un ou plusieurs jours/demi-jour.
     Propose moi des solutions. » Son choix : « Exceptions » — la
     composition de la semaine reste la base ; clic droit sur une ou
     plusieurs cases d'un membre → « Retirer de l'équipe » ; clic droit sur
     la ligne d'équipe → « Ajouter quelqu'un » pour ces demi-journées ; la
     case retirée est grisée « Hors équipe », la personne ajoutée marquée
     « + Équipe » ; la vue ouvrier et l'impression suivent.

     Table equipes_exceptions (sql/0032) : une ligne par (équipe, personne,
     date, demi), sorte « retrait » ou « ajout ». Même règle qu'en base
     (equipe_membre_, qui décide la vue ouvrier) : ajoutée ici → membre ;
     sinon membre de la composition ET ni retirée ici, ni ajoutée
     ailleurs à cette demi-journée (une personne n'est que dans une équipe
     à la fois). Les tâches restent sur la ligne d'équipe : seules les
     cases des personnes sont marquées (marquerExceptionsEquipes). */
  var COLONNES_EXCEPTIONS = "id, equipe_id, personne_id, date, demi, sorte";
  function normaliserExceptions(lignes) {
    return (lignes || []).map(function (l) {
      return { id: String(l.id), equipeId: String(l.equipe_id), personneId: String(l.personne_id), date: String(l.date).slice(0, 10), demi: l.demi, sorte: l.sorte };
    });
  }
  function chargerExceptionsEquipes() {
    return Promise.resolve(sbClient.from("equipes_exceptions").select(COLONNES_EXCEPTIONS)).then(function (res) {
      if (res.error) throw res.error;
      etat.exceptionsEquipes = normaliserExceptions(res.data);
      return etat.exceptionsEquipes;
    });
  }
  function exceptionsLe_(personneId, iso, demi) {
    personneId = String(personneId);
    return (etat.exceptionsEquipes || []).filter(function (x) { return x.personneId === personneId && x.date === iso && x.demi === demi; });
  }
  function estMembreDeBase_(equipeId, personneId, iso) {
    return membresBruts_(etat.compositionsEquipes || [], equipeId, lundiDeIso(iso)).indexOf(String(personneId)) >= 0;
  }
  function estMembreEquipeLe(equipeId, personneId, iso, demi) {
    equipeId = String(equipeId);
    var ex = exceptionsLe_(personneId, iso, demi);
    if (ex.some(function (x) { return x.equipeId === equipeId && x.sorte === "ajout"; })) return true;
    if (!estMembreDeBase_(equipeId, personneId, iso)) return false;
    return !ex.some(function (x) { return (x.equipeId === equipeId && x.sorte === "retrait") || (x.equipeId !== equipeId && x.sorte === "ajout"); });
  }
  // Équipe (active) où se trouve la personne à cette demi-journée, ou null.
  function equipeDuMembreLe(personneId, iso, demi) {
    for (var i = 0; i < PERSONNES.length; i++) {
      if (PERSONNES[i].equipe && estMembreEquipeLe(PERSONNES[i].id, personneId, iso, demi)) return PERSONNES[i].id;
    }
    return null;
  }
  // Ce que montre la case de la personne à cette demi-journée : « + Équipe »
  // si elle y est ajoutée, « Hors équipe » si elle est retirée de la sienne
  // (sans être ajoutée ailleurs), sinon null. Grille et impression.
  function exceptionCase(personneId, iso, demi) {
    var ex = exceptionsLe_(personneId, iso, demi);
    for (var i = 0; i < ex.length; i++) {
      var eq = ex[i].sorte === "ajout" && personneParAncre(ex[i].equipeId);
      if (eq && eq.equipe) return { sorte: "ajout", equipeId: eq.id, texte: "+ " + eq.nom, couleur: couleurEquipe(eq.id) };
    }
    for (var j = 0; j < ex.length; j++) {
      var eq2 = ex[j].sorte === "retrait" && personneParAncre(ex[j].equipeId);
      if (eq2 && eq2.equipe && estMembreDeBase_(eq2.id, personneId, iso)) return { sorte: "retrait", equipeId: eq2.id, texte: "Hors équipe", couleur: null };
    }
    return null;
  }
  // Exceptions d'une personne (ou d'une équipe : equipeId) dans la semaine
  // du lundi donné — impression (personne gardée même sans tâche) et
  // étiquette d'équipe (« +Paul »).
  function exceptionsSemaine(lundi, filtre) {
    var fin = decalerIso_(lundi, 6);
    return (etat.exceptionsEquipes || []).filter(function (x) {
      return x.date >= lundi && x.date <= fin && (!filtre || filtre(x));
    });
  }
  // Une exception de la personne dans la fenêtre affichée (en vue « 1
  // jour », ce jour-là) : un membre retiré reste visible sous son équipe
  // repliée, comme un membre absent (cf. personnesAffichees).
  function aExceptionAffichee_(personneId, jour) {
    personneId = String(personneId);
    return (etat.exceptionsEquipes || []).some(function (x) {
      return x.personneId === personneId && (jour ? x.date === jour : giDepuisIso(x.date) != null) && !!exceptionCase(personneId, x.date, x.demi);
    });
  }
  function cleDemi_(x) { return x.date + (x.demi === "matin" ? "0" : "1"); }
  var JOURS_COURTS_ = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  function libelleDemiJournee_(iso, demi) {
    return JOURS_COURTS_[new Date(iso + "T00:00:00Z").getUTCDay()] + " " + iso.slice(8, 10) + "." + iso.slice(5, 7) + " " + (demi === "matin" ? "matin" : "après-midi");
  }

  // Cases des personnes : « Hors équipe » (hachures grises) ou « + Équipe »
  // (couleur de l'équipe), posé après chaque rendu (cf. render), comme
  // les demandes d'absence (marquerCellulesDemandes).
  function marquerExceptionsEquipes() {
    var racine = document.getElementById("racine");
    if (!racine) return;
    racine.querySelectorAll(".cell.hors-equipe, .cell.ajout-equipe").forEach(function (c) {
      c.classList.remove("hors-equipe", "ajout-equipe");
      delete c.dataset.exception;
      c.style.removeProperty("--couleur-exception");
      if (c.dataset.titreException) { c.removeAttribute("title"); delete c.dataset.titreException; }
    });
    (etat.exceptionsEquipes || []).forEach(function (x) {
      var gi = giDepuisIso(x.date);
      if (gi == null) return;
      var c = racine.querySelector('.cell[data-kind="personne"][data-personne="' + x.personneId + '"][data-jour="' + gi + '"][data-demi="' + x.demi + '"]');
      var ex = c && exceptionCase(x.personneId, x.date, x.demi);
      if (!ex) return;
      var eq = personneParAncre(ex.equipeId);
      c.classList.add(ex.sorte === "ajout" ? "ajout-equipe" : "hors-equipe");
      c.dataset.exception = ex.texte;
      if (ex.couleur) c.style.setProperty("--couleur-exception", ex.couleur);
      if (!c.getAttribute("title")) {
        c.setAttribute("title", (ex.sorte === "ajout" ? "Ajouté à l’équipe " : "Retiré de l’équipe ") + eq.nom + " — " + libelleDemiJournee_(x.date, x.demi) + "\nClic droit : modifier");
        c.dataset.titreException = "1";
      }
    });
  }

  // Demi-journées d'une plage de la grille (menus d'ajout : case seule ou
  // glissé) — même découpage que les tâches (demisOccupeesTache).
  function demisPlage_(giDebut, duree, demiDebut, demiFin) {
    var it = { giDebut: giDebut, duree: duree, demiDebut: demiDebut || null, demiFin: demiFin || null }, out = [];
    for (var gi = giDebut; gi < giDebut + duree; gi++) {
      var iso = isoDeGi(gi);
      if (!iso) continue;
      demisOccupeesTache(it, gi).forEach(function (demi) { out.push({ iso: iso, demi: demi }); });
    }
    return out;
  }
  function trouverException_(equipeId, personneId, iso, demi, sorte) {
    return exceptionsLe_(personneId, iso, demi).filter(function (x) { return x.equipeId === String(equipeId) && x.sorte === sorte; })[0] || null;
  }
  // Écriture directe dans la table (RLS : utilisateurs connectés) :
  // suppressions d'abord (la contrainte unique ne gêne jamais l'ajout qui
  // suit), puis relecture et nouveau rendu.
  function ecrireExceptionsEquipes(aSupprimer, aAjouter, message) {
    if (!aSupprimer.length && !aAjouter.length) return Promise.resolve();
    var p = Promise.resolve();
    var verifier = function (res) { if (res && res.error) throw res.error; };
    if (aSupprimer.length) p = p.then(function () { return sbClient.from("equipes_exceptions").delete().in("id", aSupprimer.map(Number)); }).then(verifier);
    if (aAjouter.length) p = p.then(function () {
      return sbClient.from("equipes_exceptions").insert(aAjouter.map(function (a) {
        return { equipe_id: +a.equipeId, personne_id: +a.personneId, date: a.iso, demi: a.demi, sorte: a.sorte };
      }));
    }).then(verifier);
    return p.then(chargerExceptionsEquipes).then(function () {
      render(false);
      toast(message);
    }).catch(function (err) { toast("Échec de l’enregistrement : " + (err && err.message ? err.message : err)); });
  }
  // Retirer `personneId` de l'équipe aux demi-journées où il en est : son
  // ajout effacé s'il y avait été ajouté, un retrait posé s'il en est
  // membre par la composition.
  function planRetrait_(equipeId, personneId, demis, supp, ajouts) {
    demis.forEach(function (s) {
      if (!estMembreEquipeLe(equipeId, personneId, s.iso, s.demi)) return;
      var aj = trouverException_(equipeId, personneId, s.iso, s.demi, "ajout");
      if (aj) supp.push(aj.id);
      if (estMembreDeBase_(equipeId, personneId, s.iso)) ajouts.push({ equipeId: equipeId, personneId: personneId, iso: s.iso, demi: s.demi, sorte: "retrait" });
    });
  }
  // Mettre `personneId` dans l'équipe : ses ajouts ailleurs et son retrait
  // d'ici effacés ; un ajout posé s'il n'en est pas membre par la
  // composition.
  function planAjout_(equipeId, personneId, demis, supp, ajouts) {
    demis.forEach(function (s) {
      if (estMembreEquipeLe(equipeId, personneId, s.iso, s.demi)) return;
      exceptionsLe_(personneId, s.iso, s.demi).forEach(function (x) {
        if ((x.equipeId !== String(equipeId) && x.sorte === "ajout") || (x.equipeId === String(equipeId) && x.sorte === "retrait")) supp.push(x.id);
      });
      if (!estMembreDeBase_(equipeId, personneId, s.iso)) ajouts.push({ equipeId: equipeId, personneId: personneId, iso: s.iso, demi: s.demi, sorte: "ajout" });
    });
  }
  function nbDemis_(n) { return n + " demi-journée" + (n > 1 ? "s" : ""); }

  // Entrées « Équipe » des menus d'ajout d'une case ou d'une plage
  // (ouvrirAjout, ouvrirAjoutPlage — donc aussi du clic droit) :
  //   - lignes de personnes : « Retirer de l'équipe X » là où elles en
  //     sont, « Remettre dans l'équipe X » là où elles en ont été retirées ;
  //   - ligne d'équipe seule : « Ajouter quelqu'un › » et « Retirer
  //     quelqu'un › » (liste des personnes, puis écriture).
  function ajouterEntreesExceptions_(pop, fermer, cibles, giDebut, duree, demiDebut, demiFin) {
    var demis = demisPlage_(giDebut, duree, demiDebut, demiFin);
    if (!demis.length) return;
    var vus = {}, personnes = [], equipe = null;
    cibles.forEach(function (c) {
      var p = personneParAncre(c.personne);
      if (!p || vus[p.id] || p.sousTraitant) return;
      vus[p.id] = true;
      if (p.equipe) { if (cibles.length === 1) equipe = p; } else personnes.push(p);
    });
    var entrees = [];
    PERSONNES.forEach(function (eq) {
      if (!eq.equipe) return;
      var dans = personnes.filter(function (p) { return demis.some(function (s) { return estMembreEquipeLe(eq.id, p.id, s.iso, s.demi); }); });
      var retires = personnes.filter(function (p) { return demis.some(function (s) { return trouverException_(eq.id, p.id, s.iso, s.demi, "retrait") && estMembreDeBase_(eq.id, p.id, s.iso); }); });
      var qui = function (liste) { return liste.length === 1 && personnes.length === 1 ? "" : " (" + liste.length + ")"; };
      if (dans.length) entrees.push({ libelle: "Retirer de l’équipe " + eq.nom + qui(dans), action: function () {
        var supp = [], ajouts = [];
        dans.forEach(function (p) { planRetrait_(eq.id, p.id, demis, supp, ajouts); });
        ecrireExceptionsEquipes(supp, ajouts, (dans.length === 1 ? dans[0].nom + " retiré" : dans.length + " personnes retirées") + " de l’équipe " + eq.nom + " (" + nbDemis_(demis.length) + ").");
      } });
      if (retires.length) entrees.push({ libelle: "Remettre dans l’équipe " + eq.nom + qui(retires), action: function () {
        var supp = [];
        retires.forEach(function (p) { demis.forEach(function (s) { var x = trouverException_(eq.id, p.id, s.iso, s.demi, "retrait"); if (x) supp.push(x.id); }); });
        ecrireExceptionsEquipes(supp, [], (retires.length === 1 ? retires[0].nom + " remis" : retires.length + " personnes remises") + " dans l’équipe " + eq.nom + ".");
      } });
    });
    if (equipe) {
      var candidats = PERSONNES.filter(function (p) { return !p.equipe && !p.sousTraitant; });
      var aAjouter = candidats.filter(function (p) { return demis.some(function (s) { return !estMembreEquipeLe(equipe.id, p.id, s.iso, s.demi); }); });
      var aRetirer = candidats.filter(function (p) { return demis.some(function (s) { return estMembreEquipeLe(equipe.id, p.id, s.iso, s.demi); }); });
      var sousMenu = function (titre, liste, agir) {
        return { libelle: titre + " ›", sousMenu: true, action: function () {
          pop.innerHTML = '<div class="cp-titre">' + esc(titre) + " — " + esc(equipe.nom) + " (" + nbDemis_(demis.length) + ")</div>" + liste.map(function (p) {
            return '<button type="button" data-exc-personne="' + esc2(p.id) + '">' + esc(p.nom) + "</button>";
          }).join("");
          pop.querySelectorAll("button[data-exc-personne]").forEach(function (b) {
            b.addEventListener("click", function () { fermer(); agir(personneParAncre(b.dataset.excPersonne)); });
          });
        } };
      };
      if (aAjouter.length) entrees.push(sousMenu("Ajouter quelqu’un", aAjouter, function (p) {
        var supp = [], ajouts = [];
        planAjout_(equipe.id, p.id, demis, supp, ajouts);
        ecrireExceptionsEquipes(supp, ajouts, p.nom + " ajouté à l’équipe " + equipe.nom + " (" + nbDemis_(demis.length) + ").");
      }));
      if (aRetirer.length) entrees.push(sousMenu("Retirer quelqu’un", aRetirer, function (p) {
        var supp = [], ajouts = [];
        planRetrait_(equipe.id, p.id, demis, supp, ajouts);
        ecrireExceptionsEquipes(supp, ajouts, p.nom + " retiré de l’équipe " + equipe.nom + " (" + nbDemis_(demis.length) + ").");
      }));
    }
    if (!entrees.length) return;
    var bloc = document.createElement("div");
    bloc.className = "mc-equipe";
    bloc.innerHTML = '<div class="mc-sep"></div><div class="cp-titre">Équipe</div>' + entrees.map(function (e, i) {
      return '<button type="button" data-exc="' + i + '">' + esc(e.libelle) + "</button>";
    }).join("");
    pop.appendChild(bloc);
    bloc.querySelectorAll("button[data-exc]").forEach(function (b) {
      b.addEventListener("click", function (ev) {
        var e = entrees[+b.dataset.exc];
        if (e.sousMenu) { ev.stopPropagation(); e.action(); return; }
        fermer();
        e.action();
      });
    });
  }
