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
    return ordre.filter(function (e) {
      if (e.role !== "membre" || equipesDepliees[e.equipeId]) return true;
      return TACHES.some(function (it) { return it.personneId === e.p.id; });
    }).map(function (e) { return e.p; });
  }
  function personnesAfficheesToutes() { return personnesAffichees("personnel").concat(personnesAffichees("sous-traitant")); }

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
      var noms = nomsMembres_(membresEquipe(p.id, lundi));
      var ouverte = !!equipesDepliees[p.id];
      lbl.classList.add("lbl-equipe");
      lbl.dataset.equipe = p.id;
      lbl.title = p.nom + (noms.length ? " — " + noms.join(", ") : "") + "\nCliquer pour changer la composition de la semaine";
      lbl.innerHTML =
        '<div class="equipe-titre"><button type="button" class="equipe-repli" aria-expanded="' + ouverte + '" title="' + (ouverte ? "Replier les membres" : "Déplier les membres") + '">' + (ouverte ? "▾" : "▸") + "</button>" +
        "<b>" + nomSurDeuxLignes(p.nom) + "</b></div>" +
        '<span class="equipe-membres">' + (noms.length ? esc(noms.join(", ")) : "Aucun membre") + "</span>";
      lbl.querySelector(".equipe-repli").addEventListener("click", function (ev) { ev.stopPropagation(); basculerDepliageEquipe(p.id); });
      lbl.addEventListener("click", function () { ouvrirCompositionEquipe(p.id); });
      return;
    }
    var eq = !p.sousTraitant && equipeDuMembre(p.id, lundi);
    if (eq) {
      lbl.classList.add("lbl-membre");
      lbl.dataset.membreDe = eq;
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
