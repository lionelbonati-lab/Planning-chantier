"use strict";
  /* ============ SÉRIES « COMME UN AGENDA » — portée d'un changement ============
     Round du 24.09.2026 (suite 20) — Lionel : « J'aimerai améliorer mes
     séries. j'aimerai qu'elles se comporte comme sur un calendrier avant
     suppression, déplacement ou modification. proposer de modifier toute la
     série, les événements à venir ou uniquement celui-ci. »

     Avant ce round, seule la FICHE (et la suppression depuis la pilule, en
     dur sur « cet élément seul ») passait par gerer-serie, et encore :
     - les dates changées dans la fiche étaient silencieusement ignorées
       (gerer-serie ne sait que réécrire texte/drapeau/statut/chantier) ;
     - glisser, étirer, décaler aux flèches ou poser le ⚑ sur une occurrence
       ne demandait rien : le moteur de diff générique (synchroniser)
       réécrivait la case, et une note/un jalon y perdait son serie_id
       (enregistrer-plage ne le connaît pas) — l'occurrence sortait de sa
       série sans prévenir.

     Désormais, tout geste qui touche une bulle de série ouvre la même boîte
     qu'un agenda (demanderPorteeSerie) : « Cet événement », « Cet événement
     et les suivants », « Tous les événements ». Le choix est appliqué ICI,
     directement sur les tables (sbClient, comme enregistrerTacheEnDatesServeur)
     — les Edge Functions ne sont ni modifiées ni redéployées :
     - lecture des lignes de la série (serie_id), filtrées par portée :
       « cet événement » = les dates de la bulle (et sa personne pour une
       tâche), « les suivants » = à partir de sa date de début, « tous » =
       sans filtre ;
     - modification (texte, drapeau, statut, chantier) : UPDATE des lignes ;
     - déplacement / changement de durée / changement de personne : les
       lignes sont retirées puis reposées décalées, serie_id conservé ;
     - suppression : DELETE des lignes.
     Puis rechargement de la fenêtre (apresEcritureSerie), comme après
     toute écriture de série.

     Unité du décalage : la DEMI-JOURNÉE OUVRÉE (samedi/dimanche sautés),
     exactement celle du glisser dans la grille (gi ne compte que les jours
     ouvrés, cf. demiSlotsDepuisBornes) : décaler une occurrence du vendredi
     d'une journée vers la droite la pose le lundi, et chaque autre
     occurrence de la portée bouge du même nombre de demi-journées ouvrées.
     ============================================================ */

  // ---- Calendrier ouvré en dates ISO pures (indépendant de la fenêtre
  // chargée : une série s'étend bien au-delà des semaines affichées).
  // Jour 0 = lundi 05.01.1970 ; calculs en UTC pour échapper aux heures
  // d'été/hiver (cf. dateUTCDepuisIso_, donnees-sync.js).
  var EPOQUE_LUNDI_SERIE_ = Date.UTC(1970, 0, 5);
  function jourCalSerie_(iso) {
    return Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - EPOQUE_LUNDI_SERIE_) / 86400000);
  }
  function isoDeJourCalSerie_(n) { return new Date(EPOQUE_LUNDI_SERIE_ + n * 86400000).toISOString().slice(0, 10); }
  function estWeekendSerie_(iso) { return ((jourCalSerie_(iso) % 7) + 7) % 7 >= 5; }
  // Rang du jour OUVRÉ (5 par semaine) — n'a de sens que du lundi au vendredi.
  function jourOuvreSerie_(iso) { var n = jourCalSerie_(iso), s = Math.floor(n / 7); return s * 5 + (n - s * 7); }
  function isoDeJourOuvreSerie_(w) { var s = Math.floor(w / 5); return isoDeJourCalSerie_(s * 7 + (w - s * 5)); }
  // Demi-journée ouvrée (2 par jour ouvré, matin puis après-midi) <-> case.
  function demiOuvreSerie_(date, demi) { return 2 * jourOuvreSerie_(date) + (demi === "aprem" ? 1 : 0); }
  function caseDeDemiOuvre_(h) { var w = Math.floor(h / 2); return { date: isoDeJourOuvreSerie_(w), demi: h - 2 * w ? "aprem" : "matin" }; }
  // Même chose en CALENDAIRE, pour les seules lignes posées un samedi ou un
  // dimanche (série "tous les jours") : elles n'ont pas de rang ouvré.
  function demiCalSerie_(date, demi) { return 2 * jourCalSerie_(date) + (demi === "aprem" ? 1 : 0); }
  function caseDeDemiCal_(h) { var n = Math.floor(h / 2); return { date: isoDeJourCalSerie_(n), demi: h - 2 * n ? "aprem" : "matin" }; }

  // Forme d'une bulle en vraies dates : {debut, fin, demiDebut, demiFin}.
  // dateDebutIso fait foi (une note/un jalon peut commencer hors de la
  // fenêtre, giDebut n'est alors qu'un bord d'affichage) ; la fin se compte
  // en jours ouvrés (isoDeApres).
  function formeItemSerie_(it) {
    return { debut: it.dateDebutIso || isoDeGi(it.giDebut), fin: isoDeApres(it), demiDebut: it.demiDebut || null, demiFin: it.demiFin || null };
  }
  function memeFormeSerie_(a, b) {
    return a.debut === b.debut && a.fin === b.fin && (a.demiDebut || null) === (b.demiDebut || null) && (a.demiFin || null) === (b.demiFin || null);
  }
  // Première et dernière demi-journées ouvrées d'une forme, ou null si
  // l'une de ses bornes tombe un week-end (pas de rang ouvré : seul « cet
  // événement » est alors proposé, cf. changementsSerieDepuis_).
  function bornesDemiSerie_(f) {
    if (estWeekendSerie_(f.debut) || estWeekendSerie_(f.fin)) return null;
    var dd = f.demiDebut || null, df = f.demiFin || null;
    if (f.debut === f.fin && !!dd !== !!df) { dd = dd || df; df = dd; }
    return { debut: demiOuvreSerie_(f.debut, dd === "aprem" ? "aprem" : "matin"), fin: demiOuvreSerie_(f.fin, df === "matin" ? "matin" : "aprem") };
  }

  // ---- Lignes serveur ----
  var TABLE_DE_LISTE_SERIE_ = { TACHES: "taches", NOTES: "notes", JALONS: "jalons" };
  function verifierReponseSerie_(res) { if (res && res.error) throw res.error; return res; }
  // Lignes d'une série dans la portée voulue. ref = {debut, fin, personneId}
  // de l'occurrence de départ (avant changement). Paginé par 1000 (plafond
  // par défaut d'une lecture Supabase) : une série de plusieurs jours par
  // occurrence dépasse vite ce nombre de lignes.
  function lireLignesSerie_(table, serieId, portee, ref) {
    var PAGE = 1000, toutes = [];
    function page(depuis) {
      var q = sbClient.from(table).select("*").eq("serie_id", serieId);
      if (portee === "unique") {
        q = q.gte("date", ref.debut).lte("date", ref.fin);
        if (table === "taches" && ref.personneId != null) q = q.eq("personne_id", ancreDe(ref.personneId));
      } else if (portee === "suivant") {
        q = q.gte("date", ref.debut);
      }
      return q.order("id", { ascending: true }).range(depuis, depuis + PAGE - 1).then(function (res) {
        verifierReponseSerie_(res);
        var data = res.data || [];
        toutes = toutes.concat(data);
        return data.length < PAGE ? toutes : page(depuis + PAGE);
      });
    }
    return page(0);
  }
  // Demi-journées couvertes par une ligne : une tâche = 1 ligne par
  // demi-journée ; une note/un jalon = 1 ligne par jour, demi null = le jour
  // entier.
  function demisLigneSerie_(table, l) { return table === "taches" || l.demi ? [l.demi] : ["matin", "aprem"]; }
  var CHAMPS_POSITION_SERIE_ = ["id", "created_at", "date", "demi", "ordre"];
  function gabaritLigneSerie_(l) {
    var g = {};
    Object.keys(l).forEach(function (k) { if (CHAMPS_POSITION_SERIE_.indexOf(k) < 0) g[k] = l[k]; });
    return g;
  }
  // Contenu d'une ligne hors position (texte, drapeau, personne, statut,
  // chantier...) : deux demi-journées voisines au même contenu forment une
  // même occurrence — la règle de fusion des bulles (construireVueDepuisCache).
  function cleContenuSerie_(l) {
    var g = gabaritLigneSerie_(l);
    return JSON.stringify(Object.keys(g).sort().map(function (k) { return [k, g[k]]; }));
  }

  // Plan du déplacement : {supprimer: [id], inserer: [ligne]}. ch.avant /
  // ch.apres = formes de l'occurrence de départ ; ch.personneId = nouvelle
  // personne (tâche) ou null.
  // - « cet événement » : l'occurrence est reposée EXACTEMENT sur sa
  //   nouvelle forme (slotsPlageTacheIso, week-end compris quand une borne y
  //   tombe) ;
  // - « les suivants » / « tous » : chaque occurrence bouge du même nombre
  //   de demi-journées ouvrées que celle de départ ; si sa durée a changé
  //   (poignée étirée, dates de la fiche), chaque occurrence prend la
  //   nouvelle durée, comme dans un agenda. Les occurrences se retrouvent
  //   par la règle de fusion des bulles (demi-journées ouvrées consécutives
  //   au même contenu), recoupées à la durée d'origine de celle de départ
  //   pour qu'une série hebdomadaire "toute la semaine" (occurrences
  //   jointives vendredi -> lundi) ne soit pas prise pour une seule très
  //   longue occurrence.
  function planDeplacementSerie_(table, lignes, ch, portee) {
    var inserer = [];
    var personne = ch.personneId != null ? ancreDe(ch.personneId) : null;
    function poser(gabarit, cases) {
      if (personne != null && table === "taches") gabarit = Object.assign({}, gabarit, { personne_id: personne });
      if (table === "taches") {
        cases.forEach(function (c) { inserer.push(Object.assign({}, gabarit, { date: c.date, demi: c.demi })); });
        return;
      }
      var parDate = {}, dates = [];
      cases.forEach(function (c) {
        if (!parDate[c.date]) { parDate[c.date] = {}; dates.push(c.date); }
        parDate[c.date][c.demi] = true;
      });
      dates.forEach(function (d) {
        var demis = Object.keys(parDate[d]);
        inserer.push(Object.assign({}, gabarit, { date: d, demi: demis.length > 1 ? null : demis[0] }));
      });
    }
    var ids = lignes.map(function (l) { return l.id; });
    var bAv = bornesDemiSerie_(ch.avant), bAp = bornesDemiSerie_(ch.apres);
    if (portee === "unique" || !bAv || !bAp) {
      poser(gabaritLigneSerie_(lignes[0]), slotsPlageTacheIso(ch.apres.debut, ch.apres.fin, ch.apres.demiDebut, ch.apres.demiFin));
      return { supprimer: ids, inserer: inserer };
    }
    var delta = bAp.debut - bAv.debut;
    var lgAvant = bAv.fin - bAv.debut + 1, lgApres = bAp.fin - bAp.debut + 1;
    var groupes = {}, ordreGroupes = [];
    lignes.forEach(function (l) {
      if (estWeekendSerie_(l.date)) {
        // Case de week-end (série "tous les jours") : décalée du même
        // nombre de demi-journées, en calendaire, sans changer de durée.
        poser(gabaritLigneSerie_(l), demisLigneSerie_(table, l).map(function (dm) { return caseDeDemiCal_(demiCalSerie_(l.date, dm) + delta); }));
        return;
      }
      var k = cleContenuSerie_(l);
      if (!groupes[k]) { groupes[k] = { gabarit: gabaritLigneSerie_(l), demis: {} }; ordreGroupes.push(k); }
      demisLigneSerie_(table, l).forEach(function (dm) { groupes[k].demis[demiOuvreSerie_(l.date, dm)] = true; });
    });
    ordreGroupes.forEach(function (k) {
      var g = groupes[k];
      var hs = Object.keys(g.demis).map(Number).sort(function (a, b) { return a - b; });
      var suites = [];
      hs.forEach(function (h) {
        var s = suites[suites.length - 1];
        if (s && h === s.fin + 1) s.fin = h; else suites.push({ debut: h, fin: h });
      });
      suites.forEach(function (s) {
        for (var d = s.debut; d <= s.fin; d += lgAvant) {
          var f = Math.min(s.fin, d + lgAvant - 1);
          var nd = d + delta, nf = lgApres !== lgAvant ? nd + lgApres - 1 : f + delta;
          var cases = [];
          for (var h = nd; h <= nf; h++) cases.push(caseDeDemiOuvre_(h));
          poser(g.gabarit, cases);
        }
      });
    });
    return { supprimer: ids, inserer: inserer };
  }
  function supprimerLignesSerie_(table, ids) {
    if (!ids.length) return Promise.resolve();
    return sbClient.from(table).delete().in("id", ids).then(verifierReponseSerie_);
  }
  // Insertion ; pour une tâche, chaque ligne va EN BOUT de sa case (ordre =
  // max existant + 1), comme enregistrerTacheEnDatesServeur : jamais
  // d'écrasement ni de réordonnancement des tâches déjà posées là.
  function insererLignesSerie_(table, lignes) {
    if (!lignes.length) return Promise.resolve();
    var prep = Promise.resolve(lignes);
    if (table === "taches") {
      var dates = lignes.map(function (l) { return l.date; }).sort();
      var personnes = [];
      lignes.forEach(function (l) { if (personnes.indexOf(l.personne_id) < 0) personnes.push(l.personne_id); });
      prep = sbClient.from("taches").select("personne_id, date, demi, ordre").in("personne_id", personnes)
        .gte("date", dates[0]).lte("date", dates[dates.length - 1]).then(function (res) {
          verifierReponseSerie_(res);
          var max = {};
          (res.data || []).forEach(function (r) {
            var k = r.personne_id + "|" + r.date + "|" + r.demi;
            max[k] = Math.max(max[k] == null ? -1 : max[k], r.ordre || 0);
          });
          lignes.forEach(function (l) {
            var k = l.personne_id + "|" + l.date + "|" + l.demi;
            l.ordre = (max[k] == null ? -1 : max[k]) + 1;
            max[k] = l.ordre;
          });
          return lignes;
        });
    }
    return prep.then(function (ls) { return sbClient.from(table).insert(ls); }).then(verifierReponseSerie_);
  }

  // Un changement : {table, serieId, ref, supprimer, modifs, avant, apres,
  // deplace, personneId}. Ordre : modification (UPDATE) PUIS déplacement,
  // qui repart des lignes déjà modifiées (le contenu reposé est donc le bon).
  function executerUnChangementSerie_(ch, portee) {
    return lireLignesSerie_(ch.table, ch.serieId, portee, ch.ref).then(function (lignes) {
      if (!lignes.length) return;
      var ids = lignes.map(function (l) { return l.id; });
      if (ch.supprimer) return supprimerLignesSerie_(ch.table, ids);
      var chaine = Promise.resolve();
      if (ch.modifs && Object.keys(ch.modifs).length) {
        chaine = chaine.then(function () {
          return sbClient.from(ch.table).update(ch.modifs).in("id", ids).then(verifierReponseSerie_);
        }).then(function () { lignes.forEach(function (l) { Object.assign(l, ch.modifs); }); });
      }
      if (ch.deplace) {
        chaine = chaine.then(function () {
          var plan = planDeplacementSerie_(ch.table, lignes, ch, portee);
          return supprimerLignesSerie_(ch.table, plan.supprimer).then(function () { return insererLignesSerie_(ch.table, plan.inserer); });
        });
      }
      return chaine;
    });
  }
  // « Les suivants » / « tous » : un seul passage par série, depuis son
  // occurrence la plus ancienne — une sélection qui prend 2 occurrences
  // d'une même série (vue 2 semaines) ne doit pas la décaler 2 fois.
  function regrouperChangementsSerie_(changements, portee) {
    if (portee === "unique") return changements;
    var parSerie = {}, ordre = [];
    changements.forEach(function (ch) {
      var k = ch.table + "|" + ch.serieId;
      if (!parSerie[k]) { parSerie[k] = ch; ordre.push(k); }
      else if (ch.ref.debut < parSerie[k].ref.debut) parSerie[k] = ch;
    });
    return ordre.map(function (k) { return parSerie[k]; });
  }
  function executerChangementsSerie(changements, portee) {
    var chaine = Promise.resolve();
    regrouperChangementsSerie_(changements, portee).forEach(function (ch) {
      chaine = chaine.then(function () { return executerUnChangementSerie_(ch, portee); });
    });
    return chaine;
  }

  // ---- Côté grille : d'un geste local à un changement de série ----

  // Changement décrit par la bulle AVANT (`av`, copie de l'instantané
  // d'annulation) et APRÈS (`ap`, null = supprimée). formeApres (fiche) :
  // dates choisies dans la fiche, qui font foi — une borne peut y être hors
  // de la fenêtre chargée, sans gi ni durée ouvrée fiable.
  function changementSerie_(nomListe, av, ap, formeApres) {
    var table = TABLE_DE_LISTE_SERIE_[nomListe];
    var avant = formeItemSerie_(av);
    var ch = {
      id: av.id, nomListe: nomListe, itemAvant: Object.assign({}, av),
      table: table, serieId: av.serieId,
      ref: { debut: avant.debut, fin: avant.fin, personneId: table === "taches" ? av.personneId : null },
      supprimer: !ap, modifs: null, avant: avant, apres: avant, deplace: false, personneId: null, weekend: false
    };
    if (!ap) return ch;
    var apres = formeApres || formeItemSerie_(ap);
    var autrePersonne = table === "taches" && String(ap.personneId) !== String(av.personneId);
    ch.apres = apres;
    ch.deplace = !memeFormeSerie_(avant, apres) || autrePersonne;
    if (autrePersonne) ch.personneId = ap.personneId;
    ch.weekend = ch.deplace && (!bornesDemiSerie_(avant) || !bornesDemiSerie_(apres));
    var m = {};
    if (ap.texte !== av.texte && String(ap.texte || "").trim()) m.texte = ap.texte;
    if (!!ap.important !== !!av.important) m.important = !!ap.important;
    if (table === "taches") {
      if ((ap.statut || null) !== (av.statut || null)) m.statut_id = ap.statut ? (etat.statutIdParCle[ap.statut] || null) : null;
      if ((ap.chantier || null) !== (av.chantier || null) && ap.chantier) m.chantier_id = chantierIdDeNom_(ap.chantier);
    }
    if (Object.keys(m).length) ch.modifs = m;
    return ch;
  }
  function listeCouranteSerie_(nomListe) { return nomListe === "TACHES" ? TACHES : nomListe === "NOTES" ? NOTES : JALONS; }
  // Bulles de série modifiées depuis l'instantané `snap` (le dernier
  // sauvegarderUndo, pris par chaque geste juste avant de muter). Une bulle
  // absente de l'état courant n'est pas comptée ici : la suppression a son
  // propre chemin (supprimerSelection, fiches), qui demande la portée AVANT
  // de retirer quoi que ce soit.
  function changementsSerieDepuis_(snap) {
    var out = [];
    Object.keys(TABLE_DE_LISTE_SERIE_).forEach(function (nomListe) {
      var courante = listeCouranteSerie_(nomListe);
      (snap[nomListe] || []).forEach(function (av) {
        if (!av.serieId) return;
        var ap = courante.filter(function (x) { return x.id === av.id; })[0];
        if (!ap) return;
        var ch = changementSerie_(nomListe, av, ap);
        if (ch.deplace || ch.modifs) out.push(ch);
      });
    });
    return out;
  }
  var TITRES_SERIE_ = {
    supprimer: "Supprimer l’événement récurrent",
    deplacer: "Déplacer l’événement récurrent",
    modifier: "Modifier l’événement récurrent"
  };
  function messageSerie_(changements, seulementUnique) {
    var n = {};
    changements.forEach(function (ch) { n[ch.id] = true; });
    var nb = Object.keys(n).length;
    var txt = nb > 1 ? nb + " événements récurrents sont concernés." : "";
    if (seulementUnique) txt += (txt ? " " : "") + "Une case de week-end ne se déplace qu’événement par événement.";
    return txt;
  }
  // Attend la fin d'une synchronisation en cours (synchroniser, donnees-sync.js)
  // avant d'écrire la série : ses propres écritures de case ne doivent pas
  // passer après les nôtres.
  function apresSynchroSerie_() {
    return new Promise(function (ok) {
      (function attendre() {
        if (syncEnCours || syncRelance) { setTimeout(attendre, 60); return; }
        ok();
      })();
    });
  }
  // Applique la portée choisie. Les bulles de série reprennent d'abord leur
  // état d'avant dans la grille locale — leur écriture passe par le moteur
  // ci-dessus, pas par le diff générique (qui ferait perdre son serie_id à
  // une note ou un jalon) — puis synchroniser() envoie le RESTE du geste
  // (bulles hors série glissées en même temps) avant d'écrire la série.
  // Pile Annuler/Refaire : conservée pour « cet événement » (revenir en
  // arrière réécrit la partie visible, comme pour toute bulle) ; vidée pour
  // « les suivants » / « tous », qui touchent des semaines que l'instantané
  // local ne contient pas (même raison que ecrireHorsFenetre, fiche tâche),
  // et quand `viderPile` (fiche envoyée hors de la fenêtre).
  function appliquerChangementsSerie(changements, portee, messageOk, viderPile) {
    changements.forEach(function (ch) {
      var liste = listeCouranteSerie_(ch.nomListe);
      for (var i = 0; i < liste.length; i++) {
        if (liste[i].id === ch.id) { liste[i] = Object.assign({}, ch.itemAvant); return; }
      }
      if (ch.supprimer) liste.push(Object.assign({}, ch.itemAvant));
    });
    synchroniser();
    occupe(true);
    return apresSynchroSerie_().then(function () {
      return executerChangementsSerie(changements, portee);
    }).then(function () {
      occupe(false);
      if (portee !== "unique" || viderPile) { pileUndo = []; pileRedo = []; }
      toast(messageOk || "Enregistré.");
      apresEcritureSerie();
    }).catch(function (err) {
      occupe(false);
      toast("Échec de l’écriture de la série : " + (err && err.message ? err.message : err) + " — rechargement…");
      apresEcritureSerie();
    });
  }
  // Remplace render() à la fin d'un geste qui a pu toucher une bulle de
  // série (glisser, étirer, flèches, ⚑, fiche). Sans bulle de série
  // touchée : render() habituel, renvoie false (l'appelant garde son
  // toast). Sinon la grille montre déjà le résultat (render(false), sans
  // rien écrire), la boîte de portée s'ouvre, et renvoie true :
  // - Annuler / Échap / clic à côté : l'instantané revient, rien n'est
  //   écrit (comme un agenda qui remet l'événement à sa place) ;
  // - un choix : appliquerChangementsSerie.
  function rendreAvecPorteeSerie(verbe, messageOk) {
    var snap = pileUndo[pileUndo.length - 1];
    var changements = snap ? changementsSerieDepuis_(snap) : [];
    if (!changements.length) { render(); return false; }
    render(false);
    var seulementUnique = changements.some(function (ch) { return ch.weekend; });
    demanderPorteeSerie(TITRES_SERIE_[verbe] || TITRES_SERIE_.modifier, function (portee) {
      appliquerChangementsSerie(changements, portee, messageOk);
    }, {
      seulementUnique: seulementUnique,
      message: messageSerie_(changements, seulementUnique),
      onAnnuler: function () {
        if (pileUndo[pileUndo.length - 1] === snap) restaurerEtat(pileUndo.pop());
        Object.keys(bullesSelectionnees).forEach(function (id) { if (!itemParId(id)) delete bullesSelectionnees[id]; });
        render(false);
        majBarreSelection();
      }
    });
    return true;
  }
  // Suppression de bulles dont certaines sont en série (pilule, touche
  // Suppr, fiche) : la boîte de portée tient lieu de confirmation. Les
  // bulles hors série sont retirées localement (diff générique), celles de
  // série par le moteur. `plages` = [{item, liste}] (itemParId).
  function supprimerAvecPorteeSerie(plages, apresChoix, messageOk) {
    var nomDeListe = function (liste) { return liste === TACHES ? "TACHES" : liste === NOTES ? "NOTES" : "JALONS"; };
    var serie = plages.filter(function (p) { return p.item.serieId; });
    demanderPorteeSerie(TITRES_SERIE_.supprimer, function (portee) {
      sauvegarderUndo();
      var changements = serie.map(function (p) { return changementSerie_(nomDeListe(p.liste), p.item, null); });
      plages.forEach(function (p) {
        var i = p.liste.indexOf(p.item);
        if (i >= 0) p.liste.splice(i, 1);
      });
      if (apresChoix) apresChoix();
      construireGrille();
      appliquerChangementsSerie(changements, portee, messageOk);
    }, { message: messageSerie_(serie.map(function (p) { return { id: p.item.id }; }), false) });
  }
  // Fiche (tâche, absence, note, jalon) d'une bulle de série, bouton
  // Enregistrer : la fiche est déjà fermée par l'appelant, la boîte de
  // portée s'ouvre. Rien de changé : false (l'appelant ferme simplement).
  // Corrige au passage l'ancien trajet (gerer-serie « modifier »), qui
  // ignorait en silence les dates changées dans la fiche.
  function enregistrerFicheSerie(nomListe, itemAvant, itemApres, formeApres, horsFenetre) {
    var ch = changementSerie_(nomListe, itemAvant, itemApres, formeApres);
    if (!ch.deplace && !ch.modifs) return false;
    demanderPorteeSerie(TITRES_SERIE_[ch.modifs ? "modifier" : "deplacer"], function (portee) {
      sauvegarderUndo();
      appliquerChangementsSerie([ch], portee, "Modifié.", horsFenetre);
    }, { seulementUnique: ch.weekend, message: messageSerie_([ch], ch.weekend) });
    return true;
  }
