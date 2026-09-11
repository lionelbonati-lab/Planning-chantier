// Vérifie Index.html (l'appli connectée) avec un faux google.script.run
// injecté avant tout script de la page, puisqu'il n'y a pas de vrai backend
// Apps Script disponible ici. Couvre : chargement, sections, statut,
// ajout/suppression, erreurs serveur, échappement HTML, multi-lignes,
// impression, mode sombre, textes rapides (congé/absent/maladie/vacances),
// assignation groupée d'un chantier (jour ou semaine), ouverture sur la
// semaine en cours, colonne du jour, fermeture de la fiche d'impression,
// sections déduites de la ligne (sous-traitants à partir de la ligne 22),
// jalons/notes sur une plage de dates avec fusion, textes rapides par métier,
// renommage d'une ligne, accès direct à une semaine, création automatique des
// semaines manquantes, absence de double barre de défilement, absences
// masquées chez les sous-traitants, case vide sans le nom du chantier en
// double, gestion des chantiers (couleurs + ajout), jalons/notes en mode
// « ajout » (jamais d'écrasement), portée (semaine seule / semaines à venir)
// du renommage et de la suppression d'une ligne.
const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, 'Index.html');
const OUT = path.resolve(__dirname, 'screenshots');

// ---- faux backend, injecté dans la page avant tout script (addInitScript) ----
const MOCK = `
(function () {
  function vide() { return { chantier: null, taches: [] }; }
  function estAbsence(txt) {
    var t = (txt || "").toLowerCase();
    return t.indexOf("absent") !== -1 || t.indexOf("cong") !== -1 || t.indexOf("vacance") !== -1;
  }
  // Même helper que côté Index.html : une case n'est plus qu'un détail texte,
  // mais une liste de tâches — on les rejoint pour tout ce qui raisonne encore
  // sur "le texte de la case" (détection d'absence, assignation groupée).
  function detailJoint(cell) {
    return (cell && cell.taches && cell.taches.length) ? cell.taches.map(function (t) { return t.texte; }).join("\\n") : "";
  }
  // Même filtrage qu'encoderTaches_ côté WebApp.gs : jamais de tâche à texte
  // vide conservée (une ligne ajoutée puis jamais remplie disparaît). Le tag
  // Important (round du 28.08.2026) suit le même sort que le statut : lu tel
  // quel depuis le payload, sans logique particulière côté "serveur" mock.
  function taillerTaches_(taches) {
    return (taches || []).map(function (t) {
      return { texte: String((t && t.texte) == null ? "" : t.texte).trim(), statut: (t && t.statut) || null, important: !!(t && t.important) };
    }).filter(function (t) { return t.texte !== ""; });
  }
  // Notes (round du 28.08.2026) : une case peut contenir plusieurs notes
  // indépendantes. Comme côté WebApp.gs, elles restent stockées comme un
  // TEXTE UNIQUE encodé (une ligne par note, tag [Important] éventuel) — pas
  // comme un tableau JS — précisément pour que le moteur de récurrences
  // ci-dessous (appliquerRecurrenceSurSemaine / retirerRecurrenceSurSemaine),
  // qui raisonne au niveau de la ligne brute sans savoir ce qu'est une "note",
  // continue de fonctionner SANS AUCUN changement, exactement comme le vrai
  // moteur de récurrences de WebApp.gs.
  function decoderLigneNote_(ligne) {
    var s = String(ligne).replace(/^-\\s+/, "");
    var important = false, m;
    while ((m = /^\\[([^\\]]+)\\][ \\t]*/.exec(s))) {
      if (m[1] === "Important") { important = true; s = s.slice(m[0].length); continue; }
      break;
    }
    return { texte: s, important: important };
  }
  function decoderNotesJour_(brut) {
    var s = String(brut == null ? "" : brut);
    if (s.trim() === "") return [];
    return s.split("\\n").map(function (l) { return l.trim(); }).filter(function (l) { return l !== ""; }).map(decoderLigneNote_);
  }
  function encoderNotesJour_(entrees) {
    return (entrees || []).map(function (e) {
      var texte = String(e && e.texte == null ? "" : e.texte).trim();
      if (texte === "") return null;
      return (e && e.important ? "[Important] " : "") + texte;
    }).filter(function (l) { return l !== null; }).join("\\n");
  }

  // ---- mêmes règles de sections que WebApp.gs ----
  var PREMIERE_LIGNE_SOUS_TRAITANT = 22;
  var MARQUEUR_SOUS_TRAITANT = "🔧 ";
  var MARQUEUR_PERSONNEL = "👷 ";
  function decoderNom_(brut, startRow) {
    var s = String(brut == null ? "" : brut);
    if (s.indexOf(MARQUEUR_SOUS_TRAITANT) === 0) return { nom: s.slice(MARQUEUR_SOUS_TRAITANT.length).trim(), sousTraitant: true };
    if (s.indexOf(MARQUEUR_PERSONNEL) === 0) return { nom: s.slice(MARQUEUR_PERSONNEL.length).trim(), sousTraitant: false };
    return { nom: s, sousTraitant: (startRow != null && startRow >= PREMIERE_LIGNE_SOUS_TRAITANT) };
  }
  function encoderNom_(nom, sousTraitant, startRow) {
    var n = String(nom == null ? "" : nom).trim();
    var implicite = (startRow != null && startRow >= PREMIERE_LIGNE_SOUS_TRAITANT);
    if (!!sousTraitant === implicite) return n;
    return (sousTraitant ? MARQUEUR_SOUS_TRAITANT : MARQUEUR_PERSONNEL) + n;
  }

  // Aujourd'hui = mercredi 09.09.2026 (semaine 37). Le planning a par défaut
  // 5 semaines d'avance : rien à créer à l'ouverture (le test dédié réduit
  // la liste avec window.__mockRetirer pour provoquer la création).
  var AUJOURDHUI = "2026-09-09";
  var chantiers = [{ nom: "BINE", couleur: "#adcbef", ligne: 2 }, { nom: "Filisetti", couleur: "#b8b2dd", ligne: 3 }];
  var palette = ["#f4a261", "#2a9d8f", "#e76f51", "#264653", "#e9c46a", "#8ab6d6", "#c9ada7", "#9d8189"];
  var recurrences = [], recSeq = 0;
  var LUNDIS = ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"];
  var NUMS = ["36", "37", "38", "39", "40", "41", "42"];

  function decale(iso, n) {
    var p = iso.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2] + n);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function jours5(lundi) {
    var MOIS = ["", "jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
    var out = [];
    for (var i = 0; i < 5; i++) {
      var iso = decale(lundi, i), p = iso.split("-");
      out.push({ iso: iso, jour: p[2], mois: MOIS[parseInt(p[1], 10)] });
    }
    return out;
  }
  function cellules() { return [vide(), vide(), vide(), vide(), vide()]; }

  // Jalons et notes stockés PAR DATE (et non par semaine) : c'est ce qui
  // permet de vérifier une plage à cheval sur deux semaines, comme la vraie
  // feuille où la ligne 4 court sur toute la largeur.
  var textesJour = { jalon: {}, note: {} };
  textesJour.jalon["2026-09-03"] = "Contrôle chantier";
  textesJour.note["2026-08-31"] = "Fermeture matériaux";
  textesJour.note["2026-09-01"] = "Fermeture matériaux";
  // Mercredi 02.09 (semaine 36) : 2 notes INDÉPENDANTES le même jour, une
  // importante — exactement le cas que Lionel veut pouvoir démêler (round du
  // 28.08.2026, requête 6). Encodage brut, comme le ferait la vraie feuille.
  textesJour.note["2026-09-02"] = "Livraison sable\\n[Important] Contrôle sécurité";

  // Lignes 6/10/14 = personnel, 18 = sous-traitant marqué bien qu'au-dessus
  // du seuil, 22 et 26 = sous-traitants par leur seule position.
  function blocsVierges() {
    return [
      { ancre: 6, nomBrut: "Lionel", matin: cellules(), aprem: cellules() },
      { ancre: 10, nomBrut: "Mathis", matin: cellules(), aprem: cellules() },
      { ancre: 14, nomBrut: "Bastien", matin: cellules(), aprem: cellules() },
      { ancre: 18, nomBrut: "🔧 Plâtrier X", matin: cellules(), aprem: cellules() },
      { ancre: 22, nomBrut: "Armature / Béton", matin: cellules(), aprem: cellules() },
      { ancre: 26, nomBrut: "2nd œuvre", matin: cellules(), aprem: cellules() }
    ];
  }

  var semaines = [], data = {};
  LUNDIS.forEach(function (lundi, i) {
    var labG = 1 + i * 8;
    semaines.push({ labG: labG, num: NUMS[i], debut: lundi, fin: decale(lundi, 4) });
    data[labG] = { numero: NUMS[i], lundi: lundi, blocs: blocsVierges() };
  });
  // Contenu de départ, semaine 36 (labG 1) : statuts, multi-tâches.
  data[1].blocs[0].matin[0] = { chantier: "Filisetti", taches: [{ texte: "Bétonnage radier", statut: null }] };
  data[1].blocs[4].matin[0] = { chantier: "Filisetti", taches: [{ texte: "Béton radier 50m3", statut: "confirme" }] };
  // Case avec 2 tâches distinctes préexistantes, une seule porte un statut —
  // c'est l'équivalent, côté mock, d'une ancienne case multi-ligne à statut
  // unique relue par le nouveau décodage par ligne (cf. test_markers.js,
  // "ancienne limitation résolue").
  data[1].blocs[4].matin[3] = { chantier: null, taches: [
    { texte: "Armature murs rez", statut: "areserver" },
    { texte: "deuxième ligne", statut: null }
  ] };
  data[1].blocs[4].aprem[0] = { chantier: "Filisetti", taches: [{ texte: "Béton 28m3", statut: "confirme" }] };
  // Case PERSONNEL avec 2 tâches distinctes préexistantes (demande de
  // Lionel, 28.08.2026, requête 1 : "j'ai des doubles tâches que je ne peux
  // pas modifier") — même principe que la case sous-traitant ci-dessus,
  // côté personnel cette fois. Une des deux porte "important" pour couvrir
  // aussi la requête 5 sur ce même bloc.
  data[1].blocs[0].aprem[0] = { chantier: "Filisetti", taches: [
    { texte: "Pose fenêtres", statut: null, important: false },
    { texte: "Rangement dépôt", statut: null, important: true }
  ] };

  // Réduit le planning à nbGarder semaines, pour provoquer la création
  // automatique à l'ouverture (appelé avant le chargement de la page).
  window.__mockRetirer = function (nbGarder) {
    semaines.splice(nbGarder);
    Object.keys(data).forEach(function (k) { if (+k > 1 + (nbGarder - 1) * 8) delete data[k]; });
  };

  // Pré-installe une récurrence active AVANT l'ouverture de l'appli, pour
  // vérifier qu'une semaine créée automatiquement (assurerSemainesAvance_)
  // la reçoit dès sa création — sans passer par la fiche.
  window.__mockAjouterRecurrence = function (rec) { recurrences.push(rec); };

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  window.__appels = {};
  function compter(nom) { window.__appels[nom] = (window.__appels[nom] || 0) + 1; }

  // Décaler le planning (round du 28.08.2026) : mock DÉLIBÉRÉMENT léger, pas
  // un port de calculerPlanDecalage_ — le vrai algorithme (cascade, création
  // automatique de semaines, etc.) est déjà vérifié en profondeur contre le
  // VRAI WebApp.gs dans test_semaines.js. Ce qu'il reste à couvrir ICI, c'est
  // le CÂBLAGE côté client : bons paramètres envoyés, bon rendu de l'aperçu
  // reçu, bonnes résolutions renvoyées à la confirmation. window.__mockApercuDecalage
  // laisse chaque test fournir la réponse qu'il veut vérifier ; à défaut,
  // réponse vide (rien à décaler). window.__decalageAppels journalise CHAQUE
  // appel (aperçu ET confirmation) avec ses arguments exacts, pour vérifier
  // ce que la fiche a réellement envoyé.
  window.__decalageAppels = [];
  window.__mockApercuDecalage = null;
  window.__mockAppliquerDecalage = null;

  function chargerSemaine(labG) {
    var d = data[labG];
    if (!d) throw new Error("Semaine introuvable.");
    var js = jours5(d.lundi);
    var personnes = [];
    d.blocs.forEach(function (b) {
      var brut = String(b.nomBrut || "").trim();
      if (brut === "") return;
      var dec = decoderNom_(brut, b.ancre);
      personnes.push({ ancre: b.ancre, nom: dec.nom, sousTraitant: dec.sousTraitant, matin: clone(b.matin), aprem: clone(b.aprem) });
    });
    return {
      labG: labG, numero: d.numero,
      dates: js.map(function (x) { return x.jour; }),
      mois: js.map(function (x) { return x.mois; }),
      isoDates: js.map(function (x) { return x.iso; }),
      jalons: js.map(function (x) { return textesJour.jalon[x.iso] || ""; }),
      // Décodé en liste d'entrées {texte, important} au moment de la lecture
      // seulement — le stockage interne (textesJour.note) reste un texte
      // encodé (cf. commentaire de decoderNotesJour_ ci-dessus).
      notes: js.map(function (x) { return decoderNotesJour_(textesJour.note[x.iso] || ""); }),
      personnes: personnes
    };
  }
  function bloc(labG, ancre) {
    var b = data[labG].blocs.filter(function (x) { return x.ancre === ancre; })[0];
    if (!b) throw new Error("Cette ligne n'existe plus — recharge la semaine.");
    return b;
  }
  // Toutes les dates ouvrées connues du planning, dans l'ordre.
  function joursOuvres() {
    var out = [];
    semaines.forEach(function (s) { jours5(s.debut).forEach(function (j) { out.push(j.iso); }); });
    return out;
  }
  // Colonnes label ciblées par un renommage/suppression : la semaine
  // affichée seule, ou elle et toutes celles à venir — jamais les passées.
  function cibles_(labG, portee) {
    if (portee !== "suivantes") return [labG];
    return semaines.filter(function (s) { return s.labG >= labG; }).map(function (s) { return s.labG; });
  }

  // ---- récurrences : même moteur que appliquerRecurrenceSurSemaine_/
  // retirerRecurrenceSurSemaine_ côté WebApp.gs, adapté au modèle du mock. ----
  // demisDe(demi) : mêmes décalages que decalagesDemi_ côté serveur, mais
  // exprimés comme les 2 clés du mock ("matin"/"aprem") plutôt qu'un décalage
  // de ligne — "journee" traite les 2 demi-journées indépendamment.
  function demisDe(demi) {
    if (demi === "aprem") return ["aprem"];
    if (demi === "journee") return ["matin", "aprem"];
    return ["matin"];
  }
  function appliquerRecurrenceSurSemaine(rec, labG) {
    var d = data[labG];
    if (!d) return false;
    if (rec.type === "personne") {
      var b = d.blocs.filter(function (x) { return x.ancre === rec.ancre; })[0];
      if (!b || String(b.nomBrut || "").trim() === "") return false;
      var touche = false;
      demisDe(rec.demi).forEach(function (demi) {
        var cell = b[demi][rec.jour];
        if (cell.chantier || (cell.taches && cell.taches.length > 0)) return;
        cell.taches = [{ texte: rec.texte, statut: null }];
        touche = true;
      });
      return touche;
    }
    var iso = jours5(d.lundi)[rec.jour].iso;
    var ancien = textesJour[rec.type][iso] || "";
    if (ancien === "") { textesJour[rec.type][iso] = rec.texte; return true; }
    if (lignesDe(ancien).indexOf(rec.texte) !== -1) return false;
    textesJour[rec.type][iso] = ancien + "\\n" + rec.texte;
    return true;
  }
  function appliquerRecurrenceDepuis(rec, labGDepart) {
    var touches = 0;
    semaines.filter(function (s) { return s.labG >= labGDepart; }).forEach(function (s) {
      if (appliquerRecurrenceSurSemaine(rec, s.labG)) touches++;
    });
    return touches;
  }
  function retirerRecurrenceSurSemaine(rec, labG) {
    var d = data[labG];
    if (!d) return false;
    if (rec.type === "personne") {
      var b = d.blocs.filter(function (x) { return x.ancre === rec.ancre; })[0];
      if (!b) return false;
      var touche = false;
      demisDe(rec.demi).forEach(function (demi) {
        var cell = b[demi][rec.jour];
        // Ne retire que si la case contient EXACTEMENT ce que la récurrence y
        // avait posé (une seule tâche, ce texte, aucun statut) — si tu as
        // retouché la case depuis (ajouté un statut, une 2e tâche...), la
        // récurrence ne touche plus à rien, comme côté serveur.
        var seule = (cell.taches && cell.taches.length === 1) ? cell.taches[0] : null;
        if (!seule || seule.texte !== rec.texte || seule.statut) return;
        cell.taches = [];
        touche = true;
      });
      return touche;
    }
    var iso = jours5(d.lundi)[rec.jour].iso;
    var ancien = textesJour[rec.type][iso] || "";
    if (ancien === "") return false;
    var restantes = lignesDe(ancien).filter(function (l) { return l !== rec.texte; });
    var nouveau = restantes.join("\\n");
    if (nouveau === ancien) return false;
    if (nouveau === "") delete textesJour[rec.type][iso]; else textesJour[rec.type][iso] = nouveau;
    return true;
  }
  function retirerRecurrenceDepuis(rec, labGDepart) {
    var touches = 0;
    semaines.filter(function (s) { return s.labG >= labGDepart; }).forEach(function (s) {
      if (retirerRecurrenceSurSemaine(rec, s.labG)) touches++;
    });
    return touches;
  }

  // Lignes non vides d'une cellule multi-ligne, comparées sans le tiret
  // ajouté à l'affichage — même logique que lignesDe_ côté serveur.
  function lignesDe(txt) {
    return String(txt == null ? "" : txt).split("\\n").map(function (l) {
      return l.trim().replace(/^-\\s+/, "");
    }).filter(function (l) { return l !== ""; });
  }

  var handlers = {
    apiDemarrer: function () {
      compter("apiDemarrer");
      // Reproduit assurerSemainesAvance_ : 5 semaines après la semaine en cours.
      var lundiCourant = null;
      semaines.forEach(function (s) { if (AUJOURDHUI >= s.debut && AUJOURDHUI <= s.fin) lundiCourant = s.debut; });
      if (!lundiCourant) lundiCourant = AUJOURDHUI;
      var creees = [], garde = 0;
      while (semaines.filter(function (s) { return s.debut > lundiCourant; }).length < 5 && garde++ < 6) {
        var dernier = semaines[semaines.length - 1];
        var labG = dernier.labG + 8, lundi = decale(dernier.debut, 7);
        var num = String(parseInt(dernier.num, 10) + 1);
        semaines.push({ labG: labG, num: num, debut: lundi, fin: decale(lundi, 4) });
        data[labG] = { numero: num, lundi: lundi, blocs: blocsVierges() };
        recurrences.filter(function (r) { return r.actif; }).forEach(function (r) { appliquerRecurrenceSurSemaine(r, labG); });
        creees.push(num);
      }
      var index = 0;
      for (var i = 0; i < semaines.length; i++) if (AUJOURDHUI >= semaines[i].debut && AUJOURDHUI <= semaines[i].fin) { index = i; break; }
      return {
        semaines: clone(semaines), aujourdhui: AUJOURDHUI, index: index,
        chantiers: clone(chantiers), palette: clone(palette), semaine: chargerSemaine(semaines[index].labG),
        creation: { creees: creees.length, numeros: creees, incomplet: false }
      };
    },
    apiListerChantiers: function () { compter("apiListerChantiers"); return clone(chantiers); },
    apiEnregistrerChantiers: function (modifs, nouveau, labGCourant) {
      compter("apiEnregistrerChantiers");
      (modifs || []).forEach(function (m) {
        if (!m || !m.ligne || !/^#[0-9a-fA-F]{6}$/.test(String(m.couleur || ""))) return;
        var ch = chantiers.filter(function (c) { return c.ligne === m.ligne; })[0];
        if (ch) ch.couleur = m.couleur;
      });
      if (nouveau && String(nouveau.nom || "").trim() !== "") {
        var nom = String(nouveau.nom).trim();
        if (chantiers.some(function (c) { return c.nom.toLowerCase() === nom.toLowerCase(); })) {
          throw new Error("« " + nom + " » existe déjà.");
        }
        var ligneNeuve = chantiers.reduce(function (m, c) { return Math.max(m, c.ligne); }, 1) + 1;
        chantiers.push({ nom: nom, couleur: nouveau.couleur || palette[0] || "#8a8a8a", ligne: ligneNeuve });
      }
      return { ok: true, chantiers: clone(chantiers), semaine: chargerSemaine(labGCourant) };
    },
    apiChargerSemaine: function (labG) { compter("apiChargerSemaine"); return chargerSemaine(labG); },
    // Reproduit apiEnregistrerPlage : écrit sur tous les jours ouvrés de la
    // plage (même à cheval sur plusieurs semaines) et libère les jours sortis
    // de la plage d'origine qui portent encore l'ancien texte. Jalon :
    // comportement INCHANGÉ (texte unique par case). Note (round du
    // 28.08.2026) : une case pouvant contenir plusieurs notes indépendantes,
    // on ne peut plus comparer/écraser la cellule ENTIÈRE — cf. WebApp.gs,
    // même commentaire, même correction (une autre note sans rapport peut
    // très bien partager le même jour).
    apiEnregistrerPlage: function (kind, d1, d2, texte, labGCourant, origine, mode, important) {
      compter("apiEnregistrerPlage");
      if (kind !== "jalon" && kind !== "note") throw new Error("Type de case invalide.");
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(d1 || ""))) throw new Error("Choisis une date de début.");
      var fin = String(d2 || "") || d1;
      if (fin < d1) { var t = d1; d1 = fin; fin = t; }
      var estNote = kind === "note";
      var contenu = String(texte == null ? "" : texte).trim();
      var ajout = (mode === "ajout");
      if (ajout && contenu === "") throw new Error("Écris un texte.");
      var oTexteBrut = origine ? String(origine.texte == null ? "" : origine.texte).trim() : "";
      var oTexte = oTexteBrut; // jalons uniquement (cf. branche notes ci-dessous)
      var poses = 0, remplaces = 0, liberes = 0, ajoutes = 0;
      joursOuvres().forEach(function (iso) {
        var dansNouvelle = (iso >= d1 && iso <= fin);

        if (estNote) {
          var dansOrigine = !!(origine && origine.debut && iso >= origine.debut && iso <= origine.fin);
          if (!dansNouvelle && !dansOrigine) return;
          var ancien = textesJour.note[iso] || "";
          var entrees = decoderNotesJour_(ancien);
          var retire = false;
          if (dansOrigine && oTexteBrut !== "") {
            var avant = entrees.length;
            entrees = entrees.filter(function (e) { return !(e.texte === oTexteBrut && !!e.important === !!(origine && origine.important)); });
            retire = entrees.length < avant;
          }
          var ajouteIci = false;
          if (dansNouvelle) {
            poses++;
            var dejaLaNote = entrees.map(function (e) { return e.texte; });
            lignesDe(contenu).forEach(function (l) {
              if (dejaLaNote.indexOf(l) === -1) { entrees.push({ texte: l, important: !!important }); dejaLaNote.push(l); ajouteIci = true; }
            });
          }
          var nouveauJour = encoderNotesJour_(entrees);
          if (nouveauJour !== ancien) {
            if (nouveauJour === "") delete textesJour.note[iso]; else textesJour.note[iso] = nouveauJour;
            if (dansNouvelle) { if (retire && ajouteIci) remplaces++; else if (ajouteIci) ajoutes++; }
            else if (retire) liberes++;
          }
          return;
        }

        // Jalon : INCHANGÉ.
        var ancienJalon = textesJour.jalon[iso] || "";
        if (dansNouvelle) {
          poses++;
          if (ajout) {
            if (ancienJalon === "") { textesJour.jalon[iso] = contenu; ajoutes++; return; }
            var dejaLa = lignesDe(ancienJalon);
            var aAjouter = lignesDe(contenu).filter(function (l) { return dejaLa.indexOf(l) === -1; });
            if (aAjouter.length > 0) { textesJour.jalon[iso] = ancienJalon + "\\n" + aAjouter.join("\\n"); ajoutes++; }
            return;
          }
          if (ancienJalon === contenu) return;
          if (ancienJalon !== "") remplaces++;
          if (contenu === "") delete textesJour.jalon[iso]; else textesJour.jalon[iso] = contenu;
        } else if (origine && origine.debut && iso >= origine.debut && iso <= origine.fin && oTexte !== "" && ancienJalon === oTexte) {
          delete textesJour.jalon[iso];
          liberes++;
        }
      });
      if (poses === 0) throw new Error("Aucun jour ouvré de cette plage n'existe dans le planning.");
      return { ok: true, jours: poses, remplaces: remplaces, liberes: liberes, ajoutes: ajoutes, semaine: chargerSemaine(labGCourant) };
    },
    // portee : "semaine" (celle affichée seulement) ou "suivantes" (celle-ci
    // et toutes celles à venir — jamais les semaines passées, cf. cibles()).
    apiRenommerPersonne: function (labG, ancre, nom, sousTraitant, portee) {
      compter("apiRenommerPersonne");
      if (!String(nom || "").trim()) throw new Error("Nom vide.");
      var b = bloc(labG, ancre);
      var texte = encoderNom_(nom, !!sousTraitant, b.ancre);
      var cibles = cibles_(labG, portee);
      cibles.forEach(function (l) {
        var autre = data[l].blocs.filter(function (x) { return x.ancre === ancre; })[0];
        if (autre) autre.nomBrut = texte;
      });
      return { ok: true, semaines: cibles.length, semaine: chargerSemaine(labG) };
    },
    apiEnregistrerCellulePersonne: function (labG, ancre, demi, jour, payload) {
      compter("apiEnregistrerCellulePersonne");
      bloc(labG, ancre)[demi][jour] = { chantier: payload.chantier, taches: taillerTaches_(payload.taches) };
      return { ok: true, semaine: chargerSemaine(labG) };
    },
    apiAjouterPersonne: function (labG, nom, sousTraitant) {
      compter("apiAjouterPersonne");
      var veutST = !!sousTraitant, blocs = data[labG].blocs, i;
      for (i = 0; i < blocs.length; i++) {
        if (String(blocs[i].nomBrut || "").trim() !== "") continue;
        if ((blocs[i].ancre >= PREMIERE_LIGNE_SOUS_TRAITANT) !== veutST) continue;
        blocs[i].nomBrut = encoderNom_(nom, veutST, blocs[i].ancre);
        return { ok: true, ancre: blocs[i].ancre, reutilise: true, semaine: chargerSemaine(labG) };
      }
      var insertRow = null;
      if (!veutST) for (i = 0; i < blocs.length; i++) if (blocs[i].ancre >= PREMIERE_LIGNE_SOUS_TRAITANT) { insertRow = blocs[i].ancre; break; }
      if (insertRow === null) insertRow = blocs.length ? blocs[blocs.length - 1].ancre + 4 : 6;
      Object.keys(data).forEach(function (k) {
        data[k].blocs.forEach(function (b) { if (b.ancre >= insertRow) b.ancre += 4; });
        var neuf = { ancre: insertRow, nomBrut: "", matin: cellules(), aprem: cellules() };
        if (k === String(labG)) neuf.nomBrut = encoderNom_(nom, veutST, insertRow);
        data[k].blocs.push(neuf);
        data[k].blocs.sort(function (a, b) { return a.ancre - b.ancre; });
      });
      return { ok: true, ancre: insertRow, reutilise: false, semaine: chargerSemaine(labG) };
    },
    apiSupprimerPersonne: function (labG, ancre, portee) {
      compter("apiSupprimerPersonne");
      bloc(labG, ancre); // vérifie que la ligne existe encore sur la semaine affichée
      var cibles = cibles_(labG, portee);
      cibles.forEach(function (l) {
        var autre = data[l].blocs.filter(function (x) { return x.ancre === ancre; })[0];
        if (autre) { autre.nomBrut = ""; autre.matin = cellules(); autre.aprem = cellules(); }
      });
      return { ok: true, semaines: cibles.length, semaine: chargerSemaine(labG) };
    },
    apiGenererPdf: function (labG) {
      compter("apiGenererPdf");
      // supprimee: true — reflète imprimerSemaine() (Planning_Format.gs,
      // 28.08.2026) : l'onglet d'impression est supprimé après un export
      // Drive réussi, pour les 3 appelants dont l'appli web. Le toast
      // affiché par Index.html dépend de ce champ (cf. genBtn ci-dessous).
      return { ok: true, feuille: "📋 S" + data[labG].numero, supprimee: true, pdf: { ok: true, msg: "📁 PDF enregistré dans Boulot > plannings." } };
    },
    apiAttribuerChantierGroupe: function (labG, chantier, jours) {
      compter("apiAttribuerChantierGroupe");
      var nomChantier = String(chantier || "").trim();
      if (!nomChantier) throw new Error("Choisis un chantier.");
      if (!jours || !jours.length) throw new Error("Choisis un jour, ou toute la semaine.");
      var cible = data[labG].blocs.filter(function (b) {
        var brut = String(b.nomBrut || "").trim();
        return brut !== "" && !decoderNom_(brut, b.ancre).sousTraitant;
      });
      var nCellules = 0;
      cible.forEach(function (b) {
        jours.forEach(function (j) {
          ["matin", "aprem"].forEach(function (demi) {
            var cell = b[demi][j];
            if (estAbsence(detailJoint(cell))) return;
            if (cell.chantier === nomChantier) return;
            cell.chantier = nomChantier;
            nCellules++;
          });
        });
      });
      return { ok: true, personnes: cible.length, cellules: nCellules, semaine: chargerSemaine(labG) };
    },
    apiListerRecurrences: function () { compter("apiListerRecurrences"); return clone(recurrences); },
    apiEnregistrerRecurrence: function (rec, labGCourant) {
      compter("apiEnregistrerRecurrence");
      var type = rec && rec.type;
      if (["jalon", "note", "personne"].indexOf(type) === -1) throw new Error("Type de récurrence invalide.");
      var jour = parseInt(rec.jour, 10);
      if (isNaN(jour) || jour < 0 || jour > 4) throw new Error("Choisis un jour de la semaine.");
      var texte = String(rec.texte == null ? "" : rec.texte).trim();
      if (!texte) throw new Error("Écris un texte.");
      var ancre = null, demi = null, repere;
      if (type === "personne") {
        ancre = parseInt(rec.ancre, 10);
        if (!ancre) throw new Error("Choisis une personne.");
        demi = (rec.demi === "aprem" || rec.demi === "journee") ? rec.demi : "matin";
        repere = String(rec.nomPersonne || "").trim() || ("ligne " + ancre);
      } else {
        repere = type === "jalon" ? "Jalon" : "Note";
      }
      var idRec = rec.id ? String(rec.id) : ("r" + (++recSeq));
      var nouvelleRec = { id: idRec, actif: true, type: type, jour: jour, ancre: ancre, demi: demi, texte: texte, repere: repere };
      recurrences = recurrences.filter(function (r) { return r.id !== idRec; });
      recurrences.push(nouvelleRec);
      var touches = appliquerRecurrenceDepuis(nouvelleRec, labGCourant);
      return { ok: true, jours: touches, recurrences: clone(recurrences), semaine: chargerSemaine(labGCourant) };
    },
    apiBasculerRecurrence: function (id, actif, labGCourant) {
      compter("apiBasculerRecurrence");
      var r = recurrences.filter(function (x) { return x.id === String(id); })[0];
      if (!r) throw new Error("Récurrence introuvable — recharge la page.");
      r.actif = !!actif;
      return { ok: true, recurrences: clone(recurrences), semaine: chargerSemaine(labGCourant) };
    },
    apiSupprimerRecurrence: function (id, labGCourant) {
      compter("apiSupprimerRecurrence");
      var idx = -1;
      for (var i = 0; i < recurrences.length; i++) { if (recurrences[i].id === String(id)) { idx = i; break; } }
      if (idx === -1) throw new Error("Récurrence introuvable — recharge la page.");
      var rec = recurrences[idx];
      recurrences.splice(idx, 1);
      var touches = retirerRecurrenceDepuis(rec, labGCourant);
      return { ok: true, jours: touches, recurrences: clone(recurrences), semaine: chargerSemaine(labGCourant) };
    },
    apiApercuDecalage: function (labG, jourIdx, portee, ancre, sens, nJours) {
      compter("apiApercuDecalage");
      window.__decalageAppels.push({ fn: "apercu", labG: labG, jourIdx: jourIdx, portee: portee, ancre: ancre, sens: sens, nJours: nJours });
      return window.__mockApercuDecalage || { nbSimples: 0, conflits: [], impossibles: [] };
    },
    apiAppliquerDecalage: function (labG, jourIdx, portee, ancre, sens, nJours, resolutions) {
      compter("apiAppliquerDecalage");
      window.__decalageAppels.push({ fn: "appliquer", labG: labG, jourIdx: jourIdx, portee: portee, ancre: ancre, sens: sens, nJours: nJours, resolutions: clone(resolutions) });
      var base = window.__mockAppliquerDecalage || { ok: true, deplaces: 0, ecrases: 0, ajoutes: 0, ignores: 0 };
      return { ok: base.ok, deplaces: base.deplaces, ecrases: base.ecrases, ajoutes: base.ajoutes, ignores: base.ignores, semaine: chargerSemaine(labG) };
    }
  };

  function makeRun(onOk, onErr) {
    var proxy = {
      withSuccessHandler: function (fn) { return makeRun(fn, onErr); },
      withFailureHandler: function (fn) { return makeRun(onOk, fn); }
    };
    Object.keys(handlers).forEach(function (name) {
      proxy[name] = function () {
        var args = Array.prototype.slice.call(arguments);
        setTimeout(function () {
          try {
            if (window.__forcerEchec === name) throw new Error("Erreur simulée (" + name + ")");
            var res = handlers[name].apply(null, args);
            if (onOk) onOk(res);
          } catch (e) {
            if (onErr) onErr(e); else console.error("Erreur non gérée:", e);
          }
        }, 20);
      };
    });
    return proxy;
  }

  window.google = { script: { run: makeRun(null, null) } };
})();
`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];

  async function newPage(opts) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.addInitScript(MOCK);
    page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
    page.on('console', (msg) => { if (msg.type() === 'error' && msg.text().indexOf('ERR_TUNNEL') === -1) errors.push('[console] ' + msg.text()); });
    await page.goto(FILE_URL);
    await page.waitForSelector('.appbar', { timeout: 4000 });
    return { ctx, page };
  }
  const structure = (page) => page.evaluate(() => {
    const out = [];
    document.querySelectorAll('table.planning tbody > tr').forEach((tr) => {
      if (tr.classList.contains('section-row')) out.push('§' + tr.querySelector('.section-label').textContent.trim());
      else if (tr.classList.contains('person-first')) out.push(tr.querySelector('.row-label-name').textContent.trim());
    });
    return out;
  });
  const semaineAffichee = async (page) => (await page.textContent('.weeknav .label')).trim().replace(/\s+/g, ' ');
  // Retour à la semaine 36 (celle qui contient les données de test statut /
  // multi-ligne) : la semaine ouverte par défaut est désormais la 37.
  async function versSemaine36(page) {
    await page.click('[data-action="prev"]');
    await page.waitForTimeout(250);
  }

  // A) Ouverture : semaine d'AUJOURD'HUI (37), en UN SEUL appel serveur,
  //    et sections déduites de la ligne (22+ = sous-traitants, sans marqueur).
  {
    const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    const label = await semaineAffichee(page);
    const appels = await page.evaluate(() => window.__appels);
    const sections = await structure(page);
    await page.screenshot({ path: path.join(OUT, '01-ouverture-semaine-en-cours.png'), fullPage: true });
    console.log('A) semaine ouverte (attendu : Semaine 37, celle d\'aujourd\'hui) =', label);
    console.log('   appels serveur au démarrage (attendu { apiDemarrer: 1 } et rien d\'autre) =', JSON.stringify(appels));
    console.log('   sections (attendu Personnel: Lionel/Mathis/Bastien — Sous-traitants: Plâtrier X (marqué), Armature / Béton + 2nd œuvre (lignes 22 et 26)) =', JSON.stringify(sections));
    await ctx.close();
  }

  // B) Colonne d'aujourd'hui : mercredi 09.09 = index 2 dans la semaine 37 ;
  //    aucune colonne marquée sur une autre semaine.
  {
    const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    const auj = await page.evaluate(() => {
      const ths = Array.from(document.querySelectorAll('table.planning thead th'));
      return {
        enTete: ths.map((th, i) => (th.classList.contains('today') ? i : null)).filter((x) => x !== null),
        libelle: (document.querySelector('thead th.today') || {}).textContent || null,
        colonnes: Array.from(new Set(Array.from(document.querySelectorAll('td.cell.today-col')).map((td) => td.getAttribute('data-jour')))),
        nbCellules: document.querySelectorAll('td.cell.today-col').length
      };
    });
    await versSemaine36(page);
    const autreSemaine = await page.evaluate(() => ({
      enTete: document.querySelectorAll('thead th.today').length,
      cellules: document.querySelectorAll('td.cell.today-col').length
    }));
    await page.screenshot({ path: path.join(OUT, '02-colonne-aujourdhui.png'), fullPage: true });
    console.log('B) en-tête marqué (attendu [3] : la colonne 0 est celle des noms, donc mercredi = 3e th) =', JSON.stringify(auj.enTete), ' | texte =', JSON.stringify((auj.libelle || '').replace(/\s+/g, ' ').trim()));
    console.log('   data-jour des cellules marquées (attendu ["2"] = mercredi, une seule colonne) =', JSON.stringify(auj.colonnes), ' | nb de cellules =', auj.nbCellules);
    console.log('   sur la semaine 36 (pas la semaine en cours) — en-têtes marqués =', autreSemaine.enTete, ', cellules marquées =', autreSemaine.cellules, '(attendu 0 et 0)');
    await ctx.close();
  }

  // C) Statut : absent chez le personnel, présent chez un sous-traitant,
  //    avec le bon chip présélectionné (données de la semaine 36). Les DEUX
  //    fiches ont désormais #tachesWrap (round du 28.08.2026, requête 1) :
  //    ce qui distingue vraiment personnel et sous-traitant, c'est la ligne
  //    de statut (.tacheStatutRow) — cf. aussi le bloc V, plus complet.
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    await versSemaine36(page);
    await page.click('td.cell[data-kind="pers"][data-ancre="6"][data-demi="matin"][data-jour="0"]');
    await page.waitForTimeout(250);
    const hasStatutLionel = await page.evaluate(() => !!document.querySelector('#tachesWrap .tacheStatutRow'));
    // Date dans le titre de la fiche tâche (round du 28.08.2026, demande de
    // Lionel : "je n'ai pas la date du jour pour lequel je rentre la tâche
    // [...] idem [...] sous-traitant") — cf. dateLabel via jl[jour].d dans
    // openEditSheet(), Index.html.
    const titrePersonnel = await page.evaluate(() => document.querySelector('#editSheet h2').textContent.trim());
    await page.click('#editSheet #cancelBtn');
    await page.waitForTimeout(150);

    await page.click('td.cell[data-kind="pers"][data-ancre="22"][data-demi="matin"][data-jour="0"]');
    await page.waitForTimeout(250);
    const hasStatutST = await page.evaluate(() => !!document.querySelector('#tachesWrap .tacheStatutRow'));
    const chipSel = await page.evaluate(() => { const el = document.querySelector('#tachesWrap .tache-row[data-i="0"] .tacheStatutRow .chip.selected'); return el ? el.textContent.trim() : null; });
    const titreST = await page.evaluate(() => document.querySelector('#editSheet h2').textContent.trim());
    await page.screenshot({ path: path.join(OUT, '03-fiche-sous-traitant.png') });
    console.log('C) ligne de statut chez Lionel (personnel, attendu false) =', hasStatutLionel, ' | chez le sous-traitant ligne 22 (attendu true) =', hasStatutST, ' | statut de la tâche 1 présélectionné (attendu "Confirmé") =', chipSel);
    console.log('   titre fiche personnel (attendu "Lionel · Lun <date> matin") =', JSON.stringify(titrePersonnel), ' | titre fiche sous-traitant (attendu "<nom> · Lun <même date> matin") =', JSON.stringify(titreST));
    await ctx.close();
  }

  // D) MULTI-TÂCHES PRÉEXISTANTES : une case sous-traitant avec 2 tâches
  //    distinctes (une seule porte un statut) s'affiche en 2 blocs séparés
  //    dans la grille, et se recharge sans perte — 2 lignes dans la fiche,
  //    chacune avec son propre texte et son propre statut.
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    await versSemaine36(page);
    const grille = await page.evaluate(() => Array.from(document.querySelectorAll('td.cell[data-ancre="22"][data-demi="matin"][data-jour="3"] .tache-bloc')).map((el) => ({
      txt: el.querySelector('.txt').textContent.trim(),
      pastille: (el.querySelector('.statut-pill') || {}).textContent || null
    })));
    await page.click('td.cell[data-kind="pers"][data-ancre="22"][data-demi="matin"][data-jour="3"]');
    await page.waitForTimeout(250);
    const fiche = await page.evaluate(() => Array.from(document.querySelectorAll('#tachesWrap .tache-row')).map((row) => ({
      texte: row.querySelector('.fTacheTexte').value,
      statutSelectionne: (row.querySelector('.tacheStatutRow .chip.selected') || {}).textContent || null
    })));
    await page.click('#editSheet #cancelBtn');
    console.log('D) grille (2 blocs attendus : "Armature murs rez" + pastille "À réserver", puis "deuxième ligne" sans pastille) =', JSON.stringify(grille));
    console.log('   fiche rouverte (2 lignes attendues, mêmes textes/statuts, rien perdu) =', JSON.stringify(fiche));
    await ctx.close();
  }

  // E) Enregistrement d'un statut : pastille correcte, ET aucun appel de
  //    rechargement en plus (le serveur renvoie déjà la semaine relue).
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    await versSemaine36(page);
    await page.evaluate(() => { window.__appels = {}; });
    await page.click('td.cell[data-kind="pers"][data-ancre="22"][data-demi="matin"][data-jour="1"]'); // case vide, mardi matin
    await page.waitForTimeout(250);
    await page.click('#chipRow .chip[data-c="BINE"]');
    await page.fill('.fTacheTexte[data-i="0"]', 'Nouvelle tâche');
    await page.click('#tachesWrap .tache-row[data-i="0"] .tacheStatutRow .chip.st-reserve');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const pill = await page.evaluate(() => {
      const td = document.querySelector('td.cell[data-ancre="22"][data-demi="matin"][data-jour="1"]');
      const p = td.querySelector('.statut-pill');
      return p ? { cls: p.className, txt: p.textContent.trim() } : null;
    });
    const appels = await page.evaluate(() => window.__appels);
    await page.screenshot({ path: path.join(OUT, '04-apres-enregistrement-statut.png') });
    console.log('E) pastille après enregistrement (attendu st-reserve / "Réservé") =', JSON.stringify(pill));
    console.log('   appels pour cet enregistrement (attendu 1 écriture, AUCUN apiChargerSemaine) =', JSON.stringify(appels));
    await ctx.close();
  }

  // F) Ajout dans la bonne section (le personnel ne doit jamais atterrir chez
  //    les sous-traitants) ; suppression ; annulation sans effet.
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });

    await page.click('.btn-add-row[data-add="pers"]');
    await page.waitForTimeout(150);
    await page.fill('#fNom', 'Julien');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);

    await page.click('.btn-add-row[data-add="sous"]');
    await page.waitForTimeout(150);
    await page.fill('#fNom', 'Electricien 2');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);

    const structureApresAjout = await structure(page);
    const toastAjout = await page.evaluate(() => document.getElementById('toast').textContent);

    const avant = await page.evaluate(() => document.querySelectorAll('.row-label-name').length);
    await page.click('.row-del[data-del-ancre="10"]'); // Mathis
    await page.waitForTimeout(200);
    await page.click('#editSheet #cancelBtn');
    await page.waitForTimeout(150);
    const apresAnnulation = await page.evaluate(() => document.querySelectorAll('.row-label-name').length);

    await page.click('.row-del[data-del-ancre="10"]');
    await page.waitForTimeout(200);
    await page.click('#confirmDelBtn');
    await page.waitForTimeout(400);
    const nomsApresSuppression = await page.evaluate(() => Array.from(document.querySelectorAll('.row-label-name')).map((e) => e.textContent.trim()));

    await page.screenshot({ path: path.join(OUT, '05-apres-ajout-suppression.png'), fullPage: true });
    console.log('F) structure après ajouts (Julien doit être dans PERSONNEL, Electricien 2 dans SOUS-TRAITANTS) :', JSON.stringify(structureApresAjout));
    console.log('   toast d\'ajout =', JSON.stringify(toastAjout));
    console.log('   avant suppression =', avant, ' après annulation (doit être identique) =', apresAnnulation, ' noms après confirmation (Mathis doit avoir disparu) =', JSON.stringify(nomsApresSuppression));
    await ctx.close();
  }

  // G) Échec serveur à l'enregistrement : fiche ouverte, saisie préservée.
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    await page.evaluate(() => { window.__forcerEchec = 'apiEnregistrerCellulePersonne'; });
    await page.click('td.cell[data-kind="pers"][data-ancre="6"][data-demi="aprem"][data-jour="2"]');
    await page.waitForTimeout(200);
    // Personnel unifié sur #tachesWrap depuis ce round (comme les
    // sous-traitants) : plus de #fDetail séparé, cf. bloc R plus bas.
    await page.fill('#tachesWrap .fTacheTexte[data-i="0"]', 'Texte qui ne doit pas se perdre');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(300);
    const sheetToujoursOuverte = await page.evaluate(() => document.getElementById('editSheet').classList.contains('open'));
    const texteEncoreLa = await page.evaluate(() => document.querySelector('#tachesWrap .fTacheTexte[data-i="0"]').value);
    const toastTexte = await page.evaluate(() => document.getElementById('toast').textContent);
    await page.screenshot({ path: path.join(OUT, '06-echec-enregistrement.png') });
    console.log('G) fiche encore ouverte après échec (attendu true) =', sheetToujoursOuverte, ' | texte saisi préservé =', JSON.stringify(texteEncoreLa), ' | toast =', JSON.stringify(toastTexte));
    await ctx.close();
  }

  // H) Échec fatal au démarrage : écran d'erreur + bouton réessayer.
  {
    const ctx = await browser.newContext({ viewport: { width: 820, height: 1100 } });
    const page = await ctx.newPage();
    await page.addInitScript(MOCK);
    await page.addInitScript(() => { window.__forcerEchec = 'apiDemarrer'; });
    page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
    await page.goto(FILE_URL);
    await page.waitForTimeout(300);
    const aEcranErreur = await page.evaluate(() => !!document.querySelector('.error-screen'));
    const texteErreur = await page.evaluate(() => { const p = document.querySelector('.error-screen p'); return p ? p.textContent : null; });
    await page.screenshot({ path: path.join(OUT, '07-erreur-demarrage.png') });
    console.log('H) écran d\'erreur affiché =', aEcranErreur, ' | message =', JSON.stringify(texteErreur));
    await ctx.close();
  }

  // I) XSS : nom avec caractères spéciaux, affiché échappé.
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    await page.click('.btn-add-row[data-add="pers"]');
    await page.waitForTimeout(150);
    await page.fill('#fNom', '<b>Hacker</b> & "test"');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const injecte = await page.evaluate(() => !!document.querySelector('.row-label-name b'));
    const texteAffiche = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('.row-label-name'));
      const cible = els.find((e) => e.textContent.indexOf('Hacker') !== -1);
      return cible ? cible.textContent : null;
    });
    console.log('I) balise <b> injectée dans le DOM (doit être false) =', injecte, ' | texte affiché =', JSON.stringify(texteAffiche));
    await ctx.close();
  }

  // J) IMPRESSION — badges, PDF, et surtout FERMETURE de la fiche (le bug
  //    signalé : après avoir ouvert une case une fois, les boutons ✕ et
  //    Fermer de l'aperçu d'impression ne répondaient plus).
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    await versSemaine36(page);

    // On ouvre d'abord une case, puis on la ferme : c'est la manœuvre qui
    // déclenchait le bug (deux fiches avec les mêmes id dans la page).
    await page.click('td.cell[data-kind="pers"][data-ancre="6"][data-demi="matin"][data-jour="0"]');
    await page.waitForTimeout(200);
    await page.click('#editSheet #cancelBtn');
    await page.waitForTimeout(200);

    await page.click('[data-action="print"]');
    await page.waitForTimeout(300);
    const badges = await page.evaluate(() => Array.from(document.querySelectorAll('.print-statut')).map((el) => el.textContent.trim()));
    const doublonsId = await page.evaluate(() => document.querySelectorAll('#editSheet #closeSheet, #printSheet #closeSheet').length);

    await page.click('#printSheet #closeSheet');
    await page.waitForTimeout(250);
    const fermeeParCroix = await page.evaluate(() => ({
      fiche: document.getElementById('printSheet').classList.contains('open'),
      fond: document.getElementById('backdrop').classList.contains('open')
    }));

    await page.click('[data-action="print"]');
    await page.waitForTimeout(300);
    await page.click('#printSheet #cancelBtn');
    await page.waitForTimeout(250);
    const fermeeParBouton = await page.evaluate(() => document.getElementById('printSheet').classList.contains('open'));

    await page.click('[data-action="print"]');
    await page.waitForTimeout(300);
    await page.click('#genPdf');
    await page.waitForTimeout(350);
    const toastTexte = await page.evaluate(() => document.getElementById('toast').textContent);
    const fermeeApresPdf = await page.evaluate(() => document.getElementById('printSheet').classList.contains('open'));

    await page.screenshot({ path: path.join(OUT, '08-impression-et-pdf.png') });
    console.log('J) boutons ✕ portant le même id dans la page (attendu 2 — c\'était la cause du bug) =', doublonsId);
    console.log('   badges de statut à l\'impression =', JSON.stringify(badges));
    console.log('   après clic sur ✕ — fiche encore ouverte ? (attendu false) =', fermeeParCroix.fiche, ', fond encore visible ? (attendu false) =', fermeeParCroix.fond);
    console.log('   après clic sur « Fermer » — fiche encore ouverte ? (attendu false) =', fermeeParBouton);
    console.log('   après génération du PDF — fiche encore ouverte ? (attendu false) =', fermeeApresPdf, ' | toast =', JSON.stringify(toastTexte));
    await ctx.close();
  }

  // K) Mode sombre.
  {
    const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
    await page.screenshot({ path: path.join(OUT, '09-dark-grille-complete.png'), fullPage: true });
    await versSemaine36(page);
    await page.click('td.cell[data-kind="pers"][data-ancre="22"][data-demi="matin"][data-jour="0"]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, '10-dark-fiche-sous-traitant.png') });
    await ctx.close();
  }

  // L) Navigation + cache : revenir sur une semaine déjà vue est instantané
  //    (rendu synchrone, pas d'écran de chargement, pas d'attente réseau).
  {
    const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    const depart = await semaineAffichee(page);
    await page.click('[data-action="prev"]');
    await page.waitForTimeout(300);
    const label36 = await semaineAffichee(page);

    // Retour sur la 37, déjà en cache : on lit l'état SANS temporisation.
    await page.click('[data-action="next"]');
    const immediat = await page.evaluate(() => ({
      table: !!document.querySelector('table.planning'),
      chargement: !!document.querySelector('.loading-screen'),
      label: (document.querySelector('.weeknav .label') || {}).textContent.replace(/\s+/g, ' ').trim()
    }));
    await page.waitForTimeout(300);
    const rows = await page.evaluate(() => document.querySelectorAll('table.planning tbody tr').length);
    console.log('L) départ =', depart, ' | après « précédent » =', label36);
    console.log('   retour sur une semaine déjà vue, lu IMMÉDIATEMENT après le clic : grille présente =', immediat.table, ', écran de chargement =', immediat.chargement, ' (attendu true / false), semaine =', JSON.stringify(immediat.label));
    console.log('   lignes de table après aller-retour =', rows);
    await ctx.close();
  }

  // M) Textes rapides.
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    await versSemaine36(page);

    await page.click('td.cell[data-kind="pers"][data-ancre="6"][data-demi="matin"][data-jour="0"]');
    await page.waitForTimeout(250);
    const chantierAvant = await page.evaluate(() => { const el = document.querySelector('#chipRow .chip.selected'); return el ? el.getAttribute('data-c') : null; });

    await page.click('.chip-row.rapide .chip[data-t="Congé"]');
    await page.waitForTimeout(100);
    const apresCongeDetail = await page.evaluate(() => document.querySelector('#tachesWrap .fTacheTexte[data-i="0"]').value);
    const apresCongeChantier = await page.evaluate(() => { const el = document.querySelector('#chipRow .chip.selected'); return el ? el.getAttribute('data-c') : null; });

    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const grilleApres = await page.evaluate(() => {
      const td = document.querySelector('td.cell[data-kind="pers"][data-ancre="6"][data-demi="matin"][data-jour="0"]');
      return { txt: td.querySelector('.txt').textContent.trim(), aTag: !!td.querySelector('.chantier-tag') };
    });

    await page.click('td.cell[data-kind="pers"][data-ancre="6"][data-demi="matin"][data-jour="0"]');
    await page.waitForTimeout(250);
    const preSelectionAuReedit = await page.evaluate(() => { const el = document.querySelector('.chip-row.rapide .chip.selected'); return el ? el.getAttribute('data-t') : null; });

    await page.click('#chipRow .chip[data-c="BINE"]');
    await page.click('.chip-row.rapide .chip[data-t="Maladie"]');
    await page.waitForTimeout(100);
    const apresMaladieDetail = await page.evaluate(() => document.querySelector('#tachesWrap .fTacheTexte[data-i="0"]').value);
    const apresMaladieChantier = await page.evaluate(() => { const el = document.querySelector('#chipRow .chip.selected'); return el ? el.getAttribute('data-c') : null; });
    await page.click('#editSheet #cancelBtn');

    await page.screenshot({ path: path.join(OUT, '11-textes-rapides.png') });
    console.log('M) chantier avant clic (attendu "Filisetti") =', chantierAvant,
      ' | après « Congé » -> détail =', JSON.stringify(apresCongeDetail),
      ', chantier sélectionné (attendu "") =', JSON.stringify(apresCongeChantier));
    console.log('   après enregistrement -> texte grille (attendu "Congé") =', JSON.stringify(grilleApres.txt), ' | tag chantier (attendu false) =', grilleApres.aTag);
    console.log('   au réédit, chip rapide pré-sélectionné (attendu "Congé") =', preSelectionAuReedit);
    console.log('   « Maladie » (non-absence) -> détail =', JSON.stringify(apresMaladieDetail), ' | chantier conservé (attendu "BINE") =', apresMaladieChantier);
    await ctx.close();
  }

  // N) Assignation groupée : personnel uniquement (sections déduites de la
  //    ligne), absences sautées, bouton verrouillé tant que le choix est
  //    incomplet.
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });

    // Congé de Mathis le mardi matin, posé depuis l'appli elle-même.
    await page.click('td.cell[data-kind="pers"][data-ancre="10"][data-demi="matin"][data-jour="1"]');
    await page.waitForTimeout(250);
    await page.click('.chip-row.rapide .chip[data-t="Congé"]');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);

    await page.click('[data-action="assign"]');
    await page.waitForTimeout(200);
    const boutonVerrouAuDepart = await page.evaluate(() => document.querySelector('#editSheet #saveBtn').disabled);
    await page.click('#chipRowGroupe .chip[data-c="BINE"]');
    const boutonApresChantierSeul = await page.evaluate(() => document.querySelector('#editSheet #saveBtn').disabled);
    await page.click('#jourChipRow .chip[data-j="1"]'); // Mardi
    const boutonApresJour = await page.evaluate(() => document.querySelector('#editSheet #saveBtn').disabled);

    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(450);
    const toastMardi = await page.evaluate(() => document.getElementById('toast').textContent);
    const etatMardi = await page.evaluate(() => {
      // Depuis le round 4, une case avec chantier mais sans détail n'a PLUS
      // de .txt du tout (seul le bandeau .chantier-tag porte le nom) : on
      // lit les deux séparément au lieu de supposer que .txt existe toujours.
      function lire(ancre, demi) {
        const td = document.querySelector('td.cell[data-kind="pers"][data-ancre="' + ancre + '"][data-demi="' + demi + '"][data-jour="1"]');
        if (!td) return null;
        const txtEl = td.querySelector('.txt');
        const tagEl = td.querySelector('.chantier-tag');
        return { txt: txtEl ? txtEl.textContent.trim() : null, tag: tagEl ? tagEl.textContent.trim() : null };
      }
      return {
        lionel: lire(6, 'matin'), mathisMatin: lire(10, 'matin'), mathisAprem: lire(10, 'aprem'),
        bastien: lire(14, 'matin'), stMarque: lire(18, 'matin'), stLigne22: lire(22, 'matin'), stLigne26: lire(26, 'matin')
      };
    });
    await page.screenshot({ path: path.join(OUT, '12-apres-assignation-mardi.png'), fullPage: true });
    console.log('N) bouton verrouillé au départ (attendu true) =', boutonVerrouAuDepart, ' | après chantier seul (attendu true) =', boutonApresChantierSeul, ' | après chantier + jour (attendu false) =', boutonApresJour);
    console.log('   toast (attendu « BINE » -> 3 personne(s) -> Mar) =', JSON.stringify(toastMardi));
    console.log('   Lionel (attendu txt=null, tag="BINE" — le chantier ne doit PLUS être recopié en texte) =', JSON.stringify(etatMardi.lionel), ' | Bastien (attendu pareil) =', JSON.stringify(etatMardi.bastien));
    console.log('   Mathis matin EN CONGÉ (doit rester txt="Congé", tag=null) =', JSON.stringify(etatMardi.mathisMatin), ' | son après-midi (attendu txt=null, tag="BINE") =', JSON.stringify(etatMardi.mathisAprem));
    console.log('   sous-traitants intacts — ligne 18 marquée =', JSON.stringify(etatMardi.stMarque), ', ligne 22 =', JSON.stringify(etatMardi.stLigne22), ', ligne 26 =', JSON.stringify(etatMardi.stLigne26), '(les 3 doivent afficher txt="libre", tag=null)');

    // Toute la semaine : recouvre tout sauf le mardi matin de Mathis.
    await page.click('[data-action="assign"]');
    await page.waitForTimeout(200);
    await page.click('#chipRowGroupe .chip[data-c="Filisetti"]');
    await page.click('#jourChipRow .chip[data-j="semaine"]');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(450);
    const toastSemaine = await page.evaluate(() => document.getElementById('toast').textContent);
    const compteFilisetti = await page.evaluate(() =>
      Array.from(document.querySelectorAll('td.cell[data-kind="pers"][data-ancre="6"] .chantier-tag, td.cell[data-kind="pers"][data-ancre="10"] .chantier-tag, td.cell[data-kind="pers"][data-ancre="14"] .chantier-tag'))
        .filter((el) => el.textContent.trim() === 'Filisetti').length);
    const mathisMardiMatin = await page.evaluate(() => document.querySelector('td.cell[data-ancre="10"][data-demi="matin"][data-jour="1"] .txt').textContent.trim());
    console.log('   toast « toute la semaine » (attendu « Filisetti » -> 3 personne(s)) =', JSON.stringify(toastSemaine));
    console.log('   cases des 3 personnels affichant « Filisetti » (attendu 29 = 30 - le mardi matin de Mathis) =', compteFilisetti);
    console.log('   Mathis mardi matin après « toute la semaine » (doit rester « Congé ») =', mathisMardiMatin);
    await ctx.close();
  }

  // O) MISE EN PAGE : aucun défilement du document (c'est ce qui donnait deux
  //    barres dans l'iframe Apps Script), fiches punaisées sur la fenêtre.
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 700 }, colorScheme: 'light' });
    const mesures = await page.evaluate(() => {
      const st = (el) => getComputedStyle(el);
      return {
        docDefile: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
        bodyDefile: document.body.scrollHeight > document.body.clientHeight + 1,
        overflowHtml: st(document.documentElement).overflow,
        posApp: st(document.getElementById('app')).position,
        posBackdrop: st(document.getElementById('backdrop')).position,
        posSheet: st(document.getElementById('editSheet')).position,
        grilleDefile: document.querySelector('.grid-wrap').scrollHeight > document.querySelector('.grid-wrap').clientHeight
      };
    });
    // Fiche ouverte : la grille dessous est verrouillée.
    await page.click('td.cell[data-kind="pers"][data-ancre="6"][data-demi="matin"][data-jour="0"]');
    await page.waitForTimeout(250);
    const pendant = await page.evaluate(() => ({
      classe: document.body.classList.contains('fiche-ouverte'),
      grille: getComputedStyle(document.querySelector('.grid-wrap')).overflow
    }));
    await page.click('#editSheet #cancelBtn');
    await page.waitForTimeout(250);
    const apres = await page.evaluate(() => ({
      classe: document.body.classList.contains('fiche-ouverte'),
      ficheOuverte: document.getElementById('editSheet').classList.contains('open'),
      fond: document.getElementById('backdrop').classList.contains('open')
    }));
    console.log('O) le document lui-même défile ? (attendu false/false) =', mesures.docDefile, '/', mesures.bodyDefile, ' | overflow html =', mesures.overflowHtml);
    console.log('   positions (attendu fixed partout) — #app =', mesures.posApp, ', voile =', mesures.posBackdrop, ', fiche =', mesures.posSheet);
    console.log('   seule la grille défile (attendu true) =', mesures.grilleDefile);
    const libelle = await page.evaluate(() => {
      const el = document.querySelector('.weeknav .label');
      const r = el.getBoundingClientRect();
      return { hauteur: Math.round(r.height), largeur: Math.round(r.width) };
    });
    console.log('   libellé de semaine sur une seule ligne (hauteur attendue < 40px) =', JSON.stringify(libelle));
    console.log('   pendant l\'ouverture — body.fiche-ouverte =', pendant.classe, ', grille verrouillée =', JSON.stringify(pendant.grille), '(attendu true / "hidden")');
    console.log('   après fermeture — classe retirée =', !apres.classe, ', fiche fermée =', !apres.ficheOuverte, ', voile retiré =', !apres.fond, '(attendu true partout)');
    await ctx.close();
  }

  // P) JALON SUR UNE PLAGE : création, fusion à l'affichage, réouverture
  //    pré-remplie, raccourcissement (le jour libéré redevient vide), effacement.
  {
    const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    const litLigne = (classe) => page.evaluate((c) => Array.from(document.querySelectorAll('tr.' + c + ' td.cell:not(.weekend)')).map((td) => ({
      txt: td.querySelector('.txt').textContent.trim(),
      span: td.getAttribute('colspan') || '1',
      jour: td.getAttribute('data-jour'),
      fin: td.getAttribute('data-fin')
    })), classe);

    await page.click('.btn-plage[data-plage="jalon"]');
    await page.waitForTimeout(250);
    const champs = await page.evaluate(() => ({
      debut: document.getElementById('fDebut').value,
      fin: document.getElementById('fFin').value,
      texte: document.getElementById('fTexte').value
    }));
    await page.fill('#fDebut', '2026-09-08');
    await page.fill('#fFin', '2026-09-10');
    await page.fill('#fTexte', 'Coulage dalle R+1');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const toastPose = await page.evaluate(() => document.getElementById('toast').textContent);
    const apresPose = await litLigne('jalons');

    // Réouverture : la fiche doit reprendre TOUTE la plage, pas un seul jour.
    await page.click('tr.jalons td.cell.filled');
    await page.waitForTimeout(250);
    const reouverture = await page.evaluate(() => ({
      debut: document.getElementById('fDebut').value,
      fin: document.getElementById('fFin').value,
      texte: document.getElementById('fTexte').value
    }));

    // Raccourcissement à 2 jours : le jeudi doit se vider tout seul.
    await page.fill('#fFin', '2026-09-09');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const apresRaccourci = await litLigne('jalons');

    // Effacement : texte vide sur la plage.
    await page.click('tr.jalons td.cell.filled');
    await page.waitForTimeout(250);
    await page.fill('#fTexte', '');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const apresEffacement = await litLigne('jalons');

    await page.screenshot({ path: path.join(OUT, '13-jalon-plage.png'), fullPage: true });
    console.log('P) fiche vierge pré-remplie sur aujourd\'hui (attendu debut=2026-09-09, fin et texte vides) =', JSON.stringify(champs));
    console.log('   toast (attendu « posé sur 3 jour(s) ») =', JSON.stringify(toastPose));
    console.log('   ligne jalons après pose (attendu 1 case colspan=3 « Coulage dalle R+1 » du mardi au jeudi) =', JSON.stringify(apresPose));
    console.log('   réouverture pré-remplie (attendu 2026-09-08 -> 2026-09-10) =', JSON.stringify(reouverture));
    console.log('   après raccourcissement à 2 jours (le jeudi doit être redevenu vide) =', JSON.stringify(apresRaccourci));
    console.log('   après effacement (plus aucune case remplie) =', JSON.stringify(apresEffacement));
    await ctx.close();
  }

  // Q) NOTE À CHEVAL SUR DEUX SEMAINES + fusion existante de la semaine 36.
  //    Une case notes n'a plus de .txt qu'à VIDE (round du 28.08.2026) : à
  //    rempli, chaque entrée est son propre .note-item — cf. bloc AG plus bas
  //    pour le cas de 2 notes indépendantes sur le même jour et le tag
  //    Important, ce bloc-ci reste concentré sur la plage/fusion. Le mercredi
  //    de cette même semaine 36 porte justement les 2 notes pré-semées pour
  //    AG (« Livraison sable » + « [Important] Contrôle sécurité ») : elles
  //    sont hors de la plage jeu→mar ci-dessous et doivent rester intactes.
  {
    const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    const lireNotes = () => page.evaluate(() => Array.from(document.querySelectorAll('tr.notes td.cell:not(.weekend)')).map((td) => ({
      entrees: Array.from(td.querySelectorAll('.note-item')).map((el) => el.textContent.trim()),
      span: td.getAttribute('colspan') || '1'
    })));
    await versSemaine36(page);
    const noteExistante = await lireNotes();

    // Plage du jeudi 03.09 (semaine 36) au mardi 08.09 (semaine 37).
    await page.click('.btn-plage[data-plage="note"]');
    await page.waitForTimeout(250);
    await page.fill('#fDebut', '2026-09-03');
    await page.fill('#fFin', '2026-09-08');
    await page.fill('#fTexte', 'Livraison béton reportée');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const toast = await page.evaluate(() => document.getElementById('toast').textContent);
    const s36 = await lireNotes();
    await page.click('[data-action="next"]');
    await page.waitForTimeout(400);
    const s37 = await lireNotes();

    console.log('Q) note existante semaine 36 (attendu une case colspan=2, entrées ["Fermeture matériaux"]) =', JSON.stringify(noteExistante));
    console.log('   toast (attendu 4 jours ouvrés : jeu, ven, lun, mar) =', JSON.stringify(toast));
    console.log('   semaine 36 après (attendu 3 cases : lun+mar colspan=2 "Fermeture matériaux" intacte, mercredi colspan=1 avec ses 2 notes indépendantes déjà présentes ["Livraison sable","Contrôle sécurité"] — hors plage, non touchées, cf. bloc AG —, jeu+ven colspan=2 "Livraison béton reportée") =', JSON.stringify(s36));
    console.log('   semaine 37 après (attendu lun+mar colspan=2 "Livraison béton reportée", le reste vide) =', JSON.stringify(s37));
    await ctx.close();
  }

  // R) TEXTES RAPIDES PAR MÉTIER selon le nom de la ligne.
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    const propositions = async (ancre) => {
      await page.click('td.cell[data-kind="pers"][data-ancre="' + ancre + '"][data-demi="matin"][data-jour="0"]');
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => ({
        titres: Array.from(document.querySelectorAll('#editSheet .field-label')).map((e) => e.textContent.trim()),
        textes: Array.from(document.querySelectorAll('#editSheet .chip-row.rapide .chip')).map((e) => e.getAttribute('data-t'))
      }));
      await page.click('#editSheet #cancelBtn');
      await page.waitForTimeout(200);
      return r;
    };
    const lionel = await propositions(6);       // personnel, aucun métier
    const armature = await propositions(22);    // "Armature / Béton"
    const secondOeuvre = await propositions(26); // "2nd œuvre"

    // Un texte métier remplit le détail sans toucher au chantier choisi.
    await page.click('td.cell[data-kind="pers"][data-ancre="22"][data-demi="matin"][data-jour="1"]');
    await page.waitForTimeout(250);
    await page.click('#chipRow .chip[data-c="BINE"]');
    await page.click('.chip-row.rapide .chip[data-t="Armature inf radier"]');
    await page.waitForTimeout(100);
    const apresClic = await page.evaluate(() => ({
      // Le texte rapide remplit la tâche qui a le focus dans #tachesWrap —
      // personnel et sous-traitants confondus depuis ce round (plus de
      // #fDetail séparé).
      detail: document.querySelector('#tachesWrap .fTacheTexte[data-i="0"]').value,
      chantier: (document.querySelector('#chipRow .chip.selected') || {}).getAttribute ? document.querySelector('#chipRow .chip.selected').getAttribute('data-c') : null,
      selectionnes: Array.from(document.querySelectorAll('.chip-row.rapide .chip.selected')).map((e) => e.getAttribute('data-t'))
    }));
    await page.screenshot({ path: path.join(OUT, '14-textes-metier.png') });
    await page.click('#editSheet #cancelBtn');

    console.log('R) Lionel (aucun métier) — rangées =', JSON.stringify(lionel.titres), ' | propositions =', JSON.stringify(lionel.textes));
    console.log('   Armature / Béton — rangées =', JSON.stringify(armature.titres));
    console.log('     propositions =', JSON.stringify(armature.textes));
    console.log('   2nd œuvre — rangées =', JSON.stringify(secondOeuvre.titres), ' | propositions =', JSON.stringify(secondOeuvre.textes));
    console.log('   clic sur « Armature inf radier » -> détail =', JSON.stringify(apresClic.detail), ', chantier conservé =', apresClic.chantier, ', une seule proposition active =', JSON.stringify(apresClic.selectionnes));
    await ctx.close();
  }

  // S) RENOMMER une ligne : semaine seule vs cette semaine + les suivantes
  //    (jamais les passées, correction demandée le 27.08.2026), et
  //    correction de section (un sous-traitant remonté dans Personnel).
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    await page.click('.row-rename[data-ren-ancre="10"]');
    await page.waitForTimeout(250);
    const prerempli = await page.evaluate(() => ({
      nom: document.getElementById('fNom').value,
      section: (document.querySelector('#sectionChipRow .chip.selected') || {}).textContent,
      portee: (document.querySelector('#porteeChipRow .chip.selected') || {}).textContent
    }));
    await page.fill('#fNom', 'Mathis R.');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const nomsS37 = await page.evaluate(() => Array.from(document.querySelectorAll('.row-label-name')).map((e) => e.textContent.trim()));
    await page.click('[data-action="prev"]');
    await page.waitForTimeout(400);
    const nomsS36 = await page.evaluate(() => Array.from(document.querySelectorAll('.row-label-name')).map((e) => e.textContent.trim()));

    // Cette semaine + les suivantes, avec changement de section — la semaine
    // 36 (passée) ne doit JAMAIS être touchée.
    await page.click('[data-action="next"]');
    await page.waitForTimeout(400);
    await page.click('.row-rename[data-ren-ancre="26"]');
    await page.waitForTimeout(250);
    await page.fill('#fNom', 'Yannis');
    await page.click('#sectionChipRow .chip[data-s="pers"]');
    await page.click('#porteeChipRow .chip[data-p="suivantes"]');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const toastRenommage = await page.evaluate(() => document.getElementById('toast').textContent);
    const structure37 = await structure(page);
    await page.click('[data-action="prev"]');
    await page.waitForTimeout(400);
    const structure36 = await structure(page);
    await page.click('[data-action="next"]'); // 37
    await page.waitForTimeout(400);
    await page.click('[data-action="next"]'); // 38 — une semaine à venir
    await page.waitForTimeout(400);
    const structure38 = await structure(page);

    await page.screenshot({ path: path.join(OUT, '15-renommage.png'), fullPage: true });
    console.log('S) fiche pré-remplie =', JSON.stringify(prerempli));
    console.log('   après renommage « cette semaine » — semaine 37 =', JSON.stringify(nomsS37));
    console.log('   semaine 36 (doit garder « Mathis ») =', JSON.stringify(nomsS36));
    console.log('   toast « suivantes » (attendu mention de 6 semaines : 37..42) =', JSON.stringify(toastRenommage));
    console.log('   après « cette semaine et les suivantes » + section Personnel — S37 =', JSON.stringify(structure37));
    console.log('   S36 — PASSÉE, ne doit JAMAIS contenir Yannis (bug corrigé le 27.08.2026) =', JSON.stringify(structure36));
    console.log('   S38 — À VENIR, doit aussi contenir Yannis dans § Personnel =', JSON.stringify(structure38));
    await ctx.close();
  }

  // T) ALLER À UNE SEMAINE : par le numéro, par la liste, par « Cette semaine ».
  {
    const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    await page.click('.weeknav .label');
    await page.waitForTimeout(250);
    const contenu = await page.evaluate(() => ({
      nb: document.querySelectorAll('.item-semaine').length,
      actuelle: document.querySelectorAll('.item-semaine.actuelle').length,
      enCours: (document.querySelector('.item-semaine .marque') || {}).textContent || null,
      premier: (document.querySelector('.item-semaine') || {}).textContent.replace(/\s+/g, ' ').trim()
    }));
    await page.screenshot({ path: path.join(OUT, '16-aller-semaine.png') });
    await page.fill('#fNum', '41');
    await page.waitForTimeout(400);
    const parNumero = await semaineAffichee(page);

    await page.click('.weeknav .label');
    await page.waitForTimeout(250);
    await page.click('.item-semaine[data-idx="0"]');
    await page.waitForTimeout(400);
    const parListe = await semaineAffichee(page);

    await page.click('.weeknav .label');
    await page.waitForTimeout(250);
    await page.click('#btnAuj');
    await page.waitForTimeout(400);
    const parBouton = await semaineAffichee(page);
    const ficheFermee = await page.evaluate(() => document.getElementById('editSheet').classList.contains('open'));

    console.log('T) fiche : semaines listées =', contenu.nb, ', semaine courante marquée =', contenu.actuelle, ', repère « en cours » =', JSON.stringify(contenu.enCours), ', 1re entrée =', JSON.stringify(contenu.premier));
    console.log('   saisie « 41 » ->', parNumero);
    console.log('   clic sur la 1re de la liste ->', parListe);
    console.log('   bouton « Cette semaine » ->', parBouton, ' | fiche refermée =', !ficheFermee);
    await ctx.close();
  }

  // U) CRÉATION AUTOMATIQUE : planning réduit à 2 semaines -> l'ouverture
  //    complète jusqu'à 5 semaines d'avance et l'annonce.
  {
    const ctxU = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctxU.newPage();
    await page.addInitScript(MOCK);
    await page.addInitScript(() => { window.__mockRetirer(2); }); // ne garde que S36 et S37
    page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
    page.on('console', (msg) => { if (msg.type() === 'error' && msg.text().indexOf('ERR_TUNNEL') === -1) errors.push('[console] ' + msg.text()); });
    await page.goto(FILE_URL);
    await page.waitForSelector('.appbar', { timeout: 4000 });
    await page.waitForTimeout(300);
    const toast = await page.evaluate(() => document.getElementById('toast').textContent);
    const ouverte = await semaineAffichee(page);
    await page.click('.weeknav .label');
    await page.waitForTimeout(250);
    const liste = await page.evaluate(() => Array.from(document.querySelectorAll('.item-semaine b')).map((e) => e.textContent.trim()));
    console.log('U) toast d\'ouverture (attendu 5 semaines créées : S38..S42) =', JSON.stringify(toast));
    console.log('   semaine ouverte (toujours celle d\'aujourd\'hui) =', ouverte);
    console.log('   semaines du planning après complétion =', JSON.stringify(liste));
    await ctxU.close();
  }

  // V) SOUS-TRAITANTS : plus de chip "Absences" (un sous-traitant n'est pas
  //    "en congé", c'est son statut qui le dit) — le personnel les garde.
  //    Depuis ce round (28.08.2026, requêtes 1+2+5), les DEUX fiches
  //    partagent désormais la même liste de tâches répétable : seul le
  //    statut de réservation reste propre aux sous-traitants ; le tag
  //    Important et le bouton supprimer (toujours visible, même à 1 seule
  //    tâche) sont communs aux deux.
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    const lireFiche = () => page.evaluate(() => ({
      titres: Array.from(document.querySelectorAll('#editSheet .field-label')).map((e) => e.textContent.trim()),
      aStatut: !!document.querySelector('#tachesWrap .tacheStatutRow'),
      aImportant: !!document.querySelector('#tachesWrap .tacheImportantRow'),
      nbLignes: document.querySelectorAll('#tachesWrap .tache-row').length,
      supprimerVisibleAUneSeule: !!document.querySelector('#tachesWrap .tacheDel')
    }));

    await page.click('td.cell[data-kind="pers"][data-ancre="22"][data-demi="matin"][data-jour="0"]');
    await page.waitForTimeout(250);
    const sousTraitant = await lireFiche();
    await page.click('#editSheet #cancelBtn');
    await page.waitForTimeout(200);

    await page.click('td.cell[data-kind="pers"][data-ancre="6"][data-demi="matin"][data-jour="0"]');
    await page.waitForTimeout(250);
    const personnel = await lireFiche();
    await page.click('#editSheet #cancelBtn');

    console.log('V) rangées fiche sous-traitant (attendu SANS "Absences", avec "Tâches" — le statut vit dans chaque tâche, plus de ligne "Statut" séparée) =', JSON.stringify(sousTraitant.titres));
    console.log('   sous-traitant — statut présent (attendu true), Important présent (attendu true), 1 ligne au départ (attendu 1), bouton supprimer visible même à 1 seule tâche (attendu true, demande de Lionel 28.08.2026) =', JSON.stringify(sousTraitant));
    console.log('   rangées fiche personnel (attendu AVEC "Absences" ET "Tâches" — plus de champ détail séparé, requête 1 du 28.08.2026) =', JSON.stringify(personnel.titres));
    console.log('   personnel — statut présent (attendu FALSE, sans objet pour le personnel), Important présent (attendu true), bouton supprimer visible même à 1 seule tâche (attendu true) =', JSON.stringify(personnel));
    await ctx.close();
  }

  // W) GESTION DES CHANTIERS : changer une couleur, ajouter un chantier, une
  //    seule écriture — la grille et le sélecteur de chantier se mettent à
  //    jour immédiatement (pas de second aller-retour).
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    await page.click('[data-action="chantiers"]');
    await page.waitForTimeout(250);
    const depart = await page.evaluate(() => Array.from(document.querySelectorAll('.item-chantier')).map((el) => ({
      nom: el.querySelector('.nom').textContent.trim(),
      couleur: el.querySelector('input[type="color"]').value
    })));
    const proposee = await page.evaluate(() => document.getElementById('fNouveauCouleur').value);

    await page.evaluate(() => {
      const inp = document.querySelector('.item-chantier input[type="color"]');
      inp.value = '#ff3366';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const modifieVisible = await page.evaluate(() => !document.querySelector('.item-chantier .modifie').hidden);

    await page.fill('#fNouveauNom', 'Terrain de la gare');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const toast = await page.evaluate(() => document.getElementById('toast').textContent);

    await page.click('[data-action="chantiers"]');
    await page.waitForTimeout(250);
    const apres = await page.evaluate(() => Array.from(document.querySelectorAll('.item-chantier')).map((el) => ({
      nom: el.querySelector('.nom').textContent.trim(),
      couleur: el.querySelector('input[type="color"]').value
    })));
    await page.click('#editSheet #cancelBtn');
    await page.waitForTimeout(200);

    // Le nouveau chantier doit être immédiatement proposé dans une case.
    await page.click('td.cell[data-kind="pers"][data-ancre="6"][data-demi="matin"][data-jour="0"]');
    await page.waitForTimeout(250);
    const dansSelecteur = await page.evaluate(() => Array.from(document.querySelectorAll('#chipRow .chip')).map((c) => c.getAttribute('data-c')));
    await page.click('#editSheet #cancelBtn');
    await page.screenshot({ path: path.join(OUT, '17-gestion-chantiers.png') });

    console.log('W) chantiers au départ =', JSON.stringify(depart), ' | couleur proposée pour un nouveau (depuis la palette) =', proposee);
    console.log('   pastille « modifié » visible après changement de couleur (attendu true) =', modifieVisible);
    console.log('   toast après enregistrement =', JSON.stringify(toast));
    console.log('   chantiers après réouverture (1er en #ff3366, + Terrain de la gare) =', JSON.stringify(apres));
    console.log('   nouveau chantier dans le sélecteur d\'une case (attendu "Terrain de la gare" dedans) =', JSON.stringify(dansSelecteur));
    await ctx.close();
  }

  // X) JALONS/NOTES — mode « ajout » (bouton +) : n'écrase jamais un texte
  //    déjà présent sur un jour, l'ajoute en dessous ; rejouer le même texte
  //    ne duplique rien.
  {
    const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    await versSemaine36(page);
    const avant = await page.evaluate(() => document.querySelector('tr.jalons td.cell.filled .txt').textContent.trim());

    await page.click('.btn-plage[data-plage="jalon"]');
    await page.waitForTimeout(250);
    const titre = await page.evaluate(() => document.querySelector('#editSheet h2').textContent.trim());
    const aide = await page.evaluate(() => document.querySelector('#editSheet .aide').textContent.trim());
    await page.fill('#fDebut', '2026-09-03');
    await page.fill('#fFin', '2026-09-03');
    await page.fill('#fTexte', 'Livraison ferraillage');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const toastAjout = await page.evaluate(() => document.getElementById('toast').textContent);
    const apres = await page.evaluate(() => document.querySelector('tr.jalons td.cell.filled .txt').textContent.trim());

    // Rejouer le texte déjà présent : ne doit rien dupliquer.
    await page.click('.btn-plage[data-plage="jalon"]');
    await page.waitForTimeout(250);
    await page.fill('#fDebut', '2026-09-03');
    await page.fill('#fFin', '2026-09-03');
    await page.fill('#fTexte', 'Contrôle chantier');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const apresDoublon = await page.evaluate(() => document.querySelector('tr.jalons td.cell.filled .txt').textContent.trim());

    await page.screenshot({ path: path.join(OUT, '18-jalon-ajout.png'), fullPage: true });
    // Date dans le titre (round du 28.08.2026, demande de Lionel : "je n'ai
    // pas la date du jour pour lequel je rentre... jalon [et] note") — cf.
    // dateLabel dans openPlageSheet(), Index.html.
    console.log('X) titre de la fiche depuis le bouton + (attendu "Nouveau jalon · <date du jour>") =', titre, ' | aide =', JSON.stringify(aide));
    console.log('   jalon avant (attendu "Contrôle chantier") =', JSON.stringify(avant));
    console.log('   toast après ajout =', JSON.stringify(toastAjout));
    console.log('   jalon après ajout (attendu les 2 lignes réunies, rien d\'écrasé) =', JSON.stringify(apres));
    console.log('   après réenregistrement du texte déjà présent (doit rester identique, pas de doublon) =', JSON.stringify(apresDoublon));
    await ctx.close();
  }

  // Y) SUPPRESSION D'UNE LIGNE : portée "cette semaine" (par défaut) vs
  //    "cette semaine et les suivantes" — jamais les semaines passées.
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    // "Cette semaine" (par défaut, semaine 37 ouverte) : Bastien retiré de
    // la 37 seulement.
    await page.click('.row-del[data-del-ancre="14"]');
    await page.waitForTimeout(200);
    const porteeParDefaut = await page.evaluate(() => (document.querySelector('#porteeSupprRow .chip.selected') || {}).getAttribute('data-p'));
    await page.click('#confirmDelBtn');
    await page.waitForTimeout(400);
    const toastSemaine = await page.evaluate(() => document.getElementById('toast').textContent);
    const nomsS37 = await page.evaluate(() => Array.from(document.querySelectorAll('.row-label-name')).map((e) => e.textContent.trim()));
    await page.click('[data-action="prev"]');
    await page.waitForTimeout(400);
    const nomsS36 = await page.evaluate(() => Array.from(document.querySelectorAll('.row-label-name')).map((e) => e.textContent.trim()));
    await page.click('[data-action="next"]'); // 37
    await page.waitForTimeout(400);
    await page.click('[data-action="next"]'); // 38 — une semaine à venir
    await page.waitForTimeout(400);
    const nomsS38 = await page.evaluate(() => Array.from(document.querySelectorAll('.row-label-name')).map((e) => e.textContent.trim()));

    // "Cette semaine et les suivantes", depuis la 38 : Mathis disparaît de
    // la 38 et des suivantes, mais reste sur la 37 (antérieure à la portée).
    await page.click('.row-del[data-del-ancre="10"]');
    await page.waitForTimeout(200);
    await page.click('#porteeSupprRow .chip[data-p="suivantes"]');
    await page.click('#confirmDelBtn');
    await page.waitForTimeout(400);
    const toastSuivantes = await page.evaluate(() => document.getElementById('toast').textContent);
    const nomsS38apres = await page.evaluate(() => Array.from(document.querySelectorAll('.row-label-name')).map((e) => e.textContent.trim()));
    await page.click('[data-action="prev"]'); // 37
    await page.waitForTimeout(400);
    const nomsS37apres = await page.evaluate(() => Array.from(document.querySelectorAll('.row-label-name')).map((e) => e.textContent.trim()));

    await page.screenshot({ path: path.join(OUT, '19-suppression-portee.png'), fullPage: true });
    console.log('Y) portée sélectionnée par défaut (attendu "semaine") =', porteeParDefaut);
    console.log('   toast « cette semaine » (Bastien) =', JSON.stringify(toastSemaine));
    console.log('   S37 après (Bastien doit avoir disparu) =', JSON.stringify(nomsS37));
    console.log('   S36 (doit garder Bastien — jamais touchée) =', JSON.stringify(nomsS36));
    console.log('   S38 avant 2e suppression (doit encore avoir Mathis) =', JSON.stringify(nomsS38));
    console.log('   toast « les suivantes » (Mathis, depuis S38) =', JSON.stringify(toastSuivantes));
    console.log('   S38 après (Mathis doit avoir disparu) =', JSON.stringify(nomsS38apres));
    console.log('   S37 (doit garder Mathis — semaine antérieure à la portée) =', JSON.stringify(nomsS37apres));
    await ctx.close();
  }

  // Z) RÉCURRENCES : ajouter (jalon + personne), pause sans retrait, puis
  //    suppression qui retire aussi ce qui avait été posé sur les semaines à
  //    venir (jamais les passées). Chaque action ferme la fiche (comme
  //    partout ailleurs dans l'appli) — on la rouvre entre deux actions.
  {
    const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    await page.click('[data-action="recurrences"]');
    await page.waitForTimeout(300);
    const vide = await page.evaluate(() => (document.querySelector('#listeRecurrences') || {}).children.length);

    // Jalon récurrent chaque lundi.
    await page.fill('#fTexteRec', 'Séance de chantier');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const toastJalon = await page.evaluate(() => document.getElementById('toast').textContent);
    const ficheFermeeApresAjout = await page.evaluate(() => !document.getElementById('editSheet').classList.contains('open'));

    // Récurrence "Personne" : Lionel, mercredi matin, "École".
    await page.click('[data-action="recurrences"]');
    await page.waitForTimeout(300);
    const nbApresJalon = await page.evaluate(() => document.querySelectorAll('#listeRecurrences .item-recurrence').length);
    await page.click('#typeRecRow .chip[data-t="personne"]');
    await page.click('#jourRecRow .chip[data-j="2"]');
    await page.click('#persoRecRow .chip[data-n="Lionel"]');
    await page.fill('#fTexteRec', 'École');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const toastPersonne = await page.evaluate(() => document.getElementById('toast').textContent);

    // Posé tout de suite sur la semaine affichée (37) et sur une semaine à
    // venir (38) ; jamais sur une semaine passée (36).
    const litJalonLundi = (p) => p.evaluate(() => (document.querySelector('tr.jalons td.cell[data-jour="0"] .txt') || {}).textContent || null);
    const litEcoleMercrediLionel = (p) => p.evaluate(() => {
      const td = document.querySelector('td.cell[data-kind="pers"][data-ancre="6"][data-demi="matin"][data-jour="2"]');
      const el = td && td.querySelector('.txt');
      return el ? el.textContent.trim() : null;
    });
    const jalonS37 = await litJalonLundi(page);
    const ecoleS37 = await litEcoleMercrediLionel(page);
    await page.click('[data-action="next"]'); await page.waitForTimeout(400);
    const jalonS38 = await litJalonLundi(page);
    const ecoleS38 = await litEcoleMercrediLionel(page);
    await page.click('[data-action="prev"]'); await page.waitForTimeout(400);
    await page.click('[data-action="prev"]'); await page.waitForTimeout(400);
    const jalonS36 = await litJalonLundi(page);
    const ecoleS36 = await litEcoleMercrediLionel(page);
    await page.click('[data-action="next"]'); await page.waitForTimeout(400); // retour sur 37

    // Pause : ne retire PAS ce qui a déjà été posé.
    await page.click('[data-action="recurrences"]');
    await page.waitForTimeout(300);
    await page.click('#listeRecurrences .item-recurrence:nth-child(1) .switch'); // clic sur l'étiquette, comme un vrai doigt sur l'interrupteur
    await page.waitForTimeout(400);
    const ficheFermeeApresPause = await page.evaluate(() => !document.getElementById('editSheet').classList.contains('open'));
    const jalonApresPause = await litJalonLundi(page);

    // Réouverture : la pastille "inactive" doit être là ; on supprime la
    // récurrence "Personne" — retire aussi "École" des semaines à venir
    // (37 = affichée, 38 = future).
    await page.click('[data-action="recurrences"]');
    await page.waitForTimeout(300);
    const inactiveApresPause = await page.evaluate(() => document.querySelector('#listeRecurrences .item-recurrence').classList.contains('inactive'));
    await page.click('#listeRecurrences .item-recurrence:nth-child(2) .recDel');
    await page.waitForTimeout(400);
    const toastSuppr = await page.evaluate(() => document.getElementById('toast').textContent);
    const ecoleApresSupprS37 = await litEcoleMercrediLionel(page);
    await page.click('[data-action="next"]'); await page.waitForTimeout(400);
    const ecoleApresSupprS38 = await litEcoleMercrediLionel(page);

    // Vérification finale : il ne reste que le jalon (en pause).
    await page.click('[data-action="recurrences"]');
    await page.waitForTimeout(300);
    const nbFinal = await page.evaluate(() => document.querySelectorAll('#listeRecurrences .item-recurrence').length);

    await page.screenshot({ path: path.join(OUT, '20-recurrences.png'), fullPage: true });
    console.log('Z) liste vide au départ (attendu 0) =', vide);
    console.log('   toast récurrence jalon =', JSON.stringify(toastJalon), ' | fiche refermée automatiquement après ajout (attendu true) =', ficheFermeeApresAjout);
    console.log('   nb récurrences à la réouverture (attendu 1) =', nbApresJalon, ' | toast récurrence personne =', JSON.stringify(toastPersonne));
    console.log('   jalon lundi — S37 (attendu "Séance de chantier") =', JSON.stringify(jalonS37), ' | S38 à venir (attendu pareil) =', JSON.stringify(jalonS38), ' | S36 passée (attendu "—", case vide, jamais touchée) =', JSON.stringify(jalonS36));
    console.log('   École mercredi Lionel — S37 (attendu "École") =', JSON.stringify(ecoleS37), ' | S38 à venir (attendu pareil) =', JSON.stringify(ecoleS38), ' | S36 passée (attendu "libre", jamais touchée) =', JSON.stringify(ecoleS36));
    console.log('   fiche refermée automatiquement après la pause (attendu true) =', ficheFermeeApresPause, ' | jalon toujours là après pause (attendu "Séance de chantier", PAS retiré) =', JSON.stringify(jalonApresPause));
    console.log('   pastille "inactive" à la réouverture (attendu true) =', inactiveApresPause);
    console.log('   toast suppression =', JSON.stringify(toastSuppr));
    console.log('   École après suppression — S37 (attendu "libre", retiré) =', JSON.stringify(ecoleApresSupprS37), ' | S38 (attendu "libre", retiré aussi) =', JSON.stringify(ecoleApresSupprS38));
    console.log('   nb récurrences final (attendu 1, il reste le jalon en pause) =', nbFinal);
    await ctx.close();
  }

  // AA) RÉCURRENCE PRÉ-EXISTANTE + CRÉATION AUTOMATIQUE : une récurrence
  //     active installée avant l'ouverture doit être posée sur les semaines
  //     créées automatiquement par assurerSemainesAvance_ (mercredi jour=2,
  //     "Livraison béton" sur toute personne dont la ligne existe encore).
  {
    const ctxAA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctxAA.newPage();
    await page.addInitScript(MOCK);
    await page.addInitScript(() => {
      window.__mockRetirer(2); // ne garde que S36 et S37
      window.__mockAjouterRecurrence({ id: 'preexistante', actif: true, type: 'jalon', jour: 2, texte: 'Livraison béton', repere: 'Jalon' });
    });
    page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
    page.on('console', (msg) => { if (msg.type() === 'error' && msg.text().indexOf('ERR_TUNNEL') === -1) errors.push('[console] ' + msg.text()); });
    await page.goto(FILE_URL);
    await page.waitForSelector('.appbar', { timeout: 4000 });
    await page.waitForTimeout(300);
    const jalonMercrediS37 = await page.evaluate(() => (document.querySelector('tr.jalons td.cell[data-jour="2"] .txt') || {}).textContent || null);
    await page.click('[data-action="next"]'); await page.waitForTimeout(400); // 37 -> 38, créée automatiquement
    const jalonMercrediS38 = await page.evaluate(() => (document.querySelector('tr.jalons td.cell[data-jour="2"] .txt') || {}).textContent || null);
    await page.click('[data-action="next"]'); await page.waitForTimeout(400); // 38 -> 39, créée automatiquement
    const jalonMercrediS39 = await page.evaluate(() => (document.querySelector('tr.jalons td.cell[data-jour="2"] .txt') || {}).textContent || null);
    console.log('AA) semaine ouverte à froid avec une récurrence déjà active — jalon mercredi S37 (déjà existante avant l\'ouverture, attendu "—", jamais rétroactif) =', JSON.stringify(jalonMercrediS37));
    console.log('    jalon mercredi S38, créée automatiquement à l\'ouverture (attendu "Livraison béton", posé tout seul) =', JSON.stringify(jalonMercrediS38));
    console.log('    jalon mercredi S39, aussi créée automatiquement (attendu pareil) =', JSON.stringify(jalonMercrediS39));
    await ctxAA.close();
  }

  // AB) RÉCURRENCE "PERSONNE" EN JOURNÉE ENTIÈRE (demande de Lionel,
  //     27.08.2026) : la demi-journée "Journée" pose le texte à la fois le
  //     matin ET l'après-midi, chacun avec sa PROPRE règle de non-écrasement —
  //     une moitié déjà occupée garde son contenu, seule l'autre, vide,
  //     reçoit la récurrence.
  {
    const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });

    // Bastien, jeudi après-midi : un chantier posé À LA MAIN avant la
    // récurrence, pour vérifier qu'elle ne l'écrase pas.
    await page.click('td.cell[data-kind="pers"][data-ancre="14"][data-demi="aprem"][data-jour="3"]');
    await page.waitForTimeout(250);
    await page.click('#chipRow .chip[data-c="BINE"]');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);

    await page.click('[data-action="recurrences"]');
    await page.waitForTimeout(300);
    await page.click('#typeRecRow .chip[data-t="personne"]');
    await page.click('#jourRecRow .chip[data-j="3"]');
    await page.click('#persoRecRow .chip[data-n="Bastien"]');
    await page.click('#demiRecRow .chip[data-d="journee"]');
    await page.fill('#fTexteRec', 'Congé');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const toastJournee = await page.evaluate(() => document.getElementById('toast').textContent);

    const litBastienJeudi = (p) => p.evaluate(() => {
      function lire(demi) {
        const td = document.querySelector('td.cell[data-kind="pers"][data-ancre="14"][data-demi="' + demi + '"][data-jour="3"]');
        const txt = td && td.querySelector('.txt');
        return { txt: txt ? txt.textContent.trim() : null, tag: !!(td && td.querySelector('.chantier-tag')) };
      }
      return { matin: lire('matin'), aprem: lire('aprem') };
    });

    const s37 = await litBastienJeudi(page);
    await page.click('[data-action="next"]'); await page.waitForTimeout(400);
    const s38 = await litBastienJeudi(page);
    await page.click('[data-action="prev"]'); await page.waitForTimeout(400);
    await page.click('[data-action="prev"]'); await page.waitForTimeout(400);
    const s36 = await litBastienJeudi(page);
    await page.click('[data-action="next"]'); await page.waitForTimeout(400); // retour sur 37

    // Résumé de la fiche : doit afficher "journée", pas "matin".
    await page.click('[data-action="recurrences"]');
    await page.waitForTimeout(300);
    const resume = await page.evaluate(() => {
      const items = document.querySelectorAll('#listeRecurrences .item-recurrence .nom');
      return items.length ? items[items.length - 1].textContent : null;
    });

    // Suppression : les DEUX moitiés doivent être retirées sur S37 et S38 (le
    // chantier posé à la main sur l'après-midi, lui, doit rester intact —
    // la récurrence ne l'a jamais écrit, donc rien à y retirer).
    await page.click('#listeRecurrences .item-recurrence:last-child .recDel');
    await page.waitForTimeout(400);
    const s37ApresSuppr = await litBastienJeudi(page);
    await page.click('[data-action="next"]'); await page.waitForTimeout(400);
    const s38ApresSuppr = await litBastienJeudi(page);

    console.log('AB) toast récurrence « journée » =', JSON.stringify(toastJournee));
    console.log('    Bastien jeudi S37 — matin (attendu "Congé", tag=false) =', JSON.stringify(s37.matin), ' | après-midi (attendu tag="BINE" conservé, PAS "Congé" — déjà occupé) =', JSON.stringify(s37.aprem));
    console.log('    Bastien jeudi S38 à venir — matin (attendu "Congé") =', JSON.stringify(s38.matin), ' | après-midi (case vide au départ, attendu "Congé" aussi) =', JSON.stringify(s38.aprem));
    console.log('    Bastien jeudi S36 passée (attendu "libre" des deux côtés, jamais touchée) — matin =', JSON.stringify(s36.matin), ' | après-midi =', JSON.stringify(s36.aprem));
    console.log('    résumé affiché (attendu contient "journée") =', JSON.stringify(resume));
    console.log('    après suppression — S37 matin (attendu "libre", retiré) =', JSON.stringify(s37ApresSuppr.matin), ' | S37 après-midi (attendu tag="BINE" toujours intact, jamais touché par la récurrence) =', JSON.stringify(s37ApresSuppr.aprem));
    console.log('    après suppression — S38 matin (attendu "libre", retiré) =', JSON.stringify(s38ApresSuppr.matin), ' | S38 après-midi (attendu "libre", retiré aussi) =', JSON.stringify(s38ApresSuppr.aprem));
    await ctx.close();
  }

  // AC) PLUSIEURS TÂCHES PAR CASE, CHACUNE AVEC SON PROPRE STATUT (demande de
  //     Lionel, 28.08.2026 : « les 2 tâches peuvent avoir des statuts
  //     différents, comment faire ça ? ») — ajout de 2 tâches avec des
  //     statuts distincts, 2 pastilles dans la grille, persistance au
  //     rechargement, puis suppression de l'une SANS jamais toucher au
  //     statut de l'autre.
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    await versSemaine36(page);

    const lireFiche = () => page.evaluate(() => Array.from(document.querySelectorAll('#tachesWrap .tache-row')).map((row) => {
      const chip = row.querySelector('.tacheStatutRow .chip.selected');
      return { texte: row.querySelector('.fTacheTexte').value, statut: chip ? chip.getAttribute('data-s') : null };
    }));
    const lireGrille = () => page.evaluate(() => Array.from(document.querySelectorAll('td.cell[data-ancre="22"][data-demi="matin"][data-jour="2"] .tache-bloc')).map((el) => {
      const pill = el.querySelector('.statut-pill');
      return { txt: el.querySelector('.txt').textContent.trim(), pastille: pill ? { cls: pill.className, txt: pill.textContent.trim() } : null };
    }));

    // Case vide (mercredi matin, ligne 22 = sous-traitant "Armature / Béton").
    await page.click('td.cell[data-kind="pers"][data-ancre="22"][data-demi="matin"][data-jour="2"]');
    await page.waitForTimeout(250);
    const uneSeuleLigneAuDepart = await page.evaluate(() => document.querySelectorAll('#tachesWrap .tache-row').length);
    // Demande #2 (round 9) : le bouton supprimer doit être visible même sur
    // une ligne unique, pour effacer plus vite/intuitivement sans passer par
    // "+ Ajouter" puis annuler.
    const supprimerVisibleSurUneSeule = await page.evaluate(() => !!document.querySelector('#tachesWrap .tacheDel'));

    await page.fill('#tachesWrap .fTacheTexte[data-i="0"]', 'Coffrage voile Nord');
    await page.click('#tachesWrap .tache-row[data-i="0"] .tacheStatutRow .chip.st-confirme');

    await page.click('#addTacheBtn');
    await page.waitForTimeout(100);
    const deuxLignesApresAjout = await page.evaluate(() => document.querySelectorAll('#tachesWrap .tache-row').length);
    const supprimerVisibleADeux = await page.evaluate(() => document.querySelectorAll('#tachesWrap .tacheDel').length);

    await page.fill('#tachesWrap .fTacheTexte[data-i="1"]', 'Électricien passage gaines');
    await page.click('#tachesWrap .tache-row[data-i="1"] .tacheStatutRow .chip.st-areserver');

    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const grilleApresAjout = await lireGrille();

    // Réouverture : les 2 tâches et leurs statuts respectifs doivent revenir
    // intacts — round-trip complet par le serveur, pas seulement en mémoire.
    await page.click('td.cell[data-kind="pers"][data-ancre="22"][data-demi="matin"][data-jour="2"]');
    await page.waitForTimeout(250);
    const ficheApresRechargement = await lireFiche();

    // Suppression de la 1ère tâche (« Coffrage voile Nord », Confirmé) : la
    // 2e (« Électricien… », À réserver) doit rester exactement comme elle
    // était — son statut ne doit jamais déborder sur l'autre ligne.
    await page.click('#tachesWrap .tache-row[data-i="0"] .tacheDel');
    await page.waitForTimeout(100);
    const apresSuppressionEnMemoire = await lireFiche();
    // Retombé à 1 ligne : le bouton doit rester visible (toujours, demande #2),
    // pas disparaître à nouveau.
    const supprimerVisibleApresSuppression = await page.evaluate(() => !!document.querySelector('#tachesWrap .tacheDel'));

    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const grilleApresSuppression = await lireGrille();

    await page.screenshot({ path: path.join(OUT, '21-multi-taches-statuts.png') });
    console.log('AC) 1 seule ligne au départ (attendu 1) =', uneSeuleLigneAuDepart, ' | bouton supprimer visible même sur ligne unique (attendu true) =', supprimerVisibleSurUneSeule);
    console.log('    après « + Ajouter une tâche » — nb de lignes (attendu 2) =', deuxLignesApresAjout, ' | boutons supprimer visibles (attendu 2) =', supprimerVisibleADeux);
    console.log('    grille après enregistrement (attendu 2 blocs séparés : "Coffrage voile Nord" + pastille Confirmé, "Électricien passage gaines" + pastille À réserver) =', JSON.stringify(grilleApresAjout));
    console.log('    fiche rouverte après rechargement complet (attendu les 2 mêmes tâches, mêmes statuts, rien perdu) =', JSON.stringify(ficheApresRechargement));
    console.log('    après suppression de la tâche 1, en mémoire (attendu 1 seule ligne restante : "Électricien passage gaines" / areserver, INCHANGÉE) =', JSON.stringify(apresSuppressionEnMemoire), ' | bouton supprimer toujours visible à 1 ligne (attendu true) =', supprimerVisibleApresSuppression);
    console.log('    grille après enregistrement de la suppression (attendu 1 seul bloc restant, "Coffrage voile Nord" disparu, "Électricien…" toujours À réserver) =', JSON.stringify(grilleApresSuppression));
    await ctx.close();
  }

  // AD) NOMBRE D'ALLERS-RETOURS SERVEUR (round 8 — « il y a beaucoup de
  //     chargement/enregistrement »). Chaque appel google.script.run paie un
  //     démarrage complet d'Apps Script : ce qui se voit comme de la lenteur,
  //     ce n'est pas le volume de données mais le NOMBRE d'appels. Ce bloc les
  //     compte, pour que le gain soit vérifié et non pas supposé.
  {
    const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    const compteurs = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__appels)));
    const raz = () => page.evaluate(() => { window.__appels = {}; });
    const nb = (o) => Object.keys(o).reduce((t, k) => t + o[k], 0);

    // 1) Aller-retour entre deux semaines déjà vues : doit être GRATUIT.
    await raz();
    await page.click('[data-action="prev"]'); await page.waitForTimeout(350); // 37 -> 36 (jamais vue)
    const apresPremiereVisite = await compteurs();
    await raz();
    await page.click('[data-action="next"]'); await page.waitForTimeout(350); // 36 -> 37 (déjà vue)
    await page.click('[data-action="prev"]'); await page.waitForTimeout(350); // 37 -> 36 (déjà vue)
    await page.click('[data-action="next"]'); await page.waitForTimeout(350); // 36 -> 37 (déjà vue)
    const apresAllersRetours = await compteurs();

    // 2) Enregistrer une case ne doit invalider QUE la semaine affichée : la
    //    semaine voisine déjà en cache reste utilisable sans appel.
    await raz();
    await page.click('td.cell[data-kind="pers"][data-ancre="6"][data-demi="matin"][data-jour="0"]');
    await page.waitForTimeout(250);
    await page.fill('#tachesWrap .fTacheTexte[data-i="0"]', 'Coffrage');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const apresEnregistrement = await compteurs();
    await raz();
    await page.click('[data-action="prev"]'); await page.waitForTimeout(350); // retour sur la 36, toujours en cache
    const apresRetourVoisine = await compteurs();

    // 3) Une récurrence, elle, touche les semaines À VENIR : celles-ci doivent
    //    bien être rechargées (le cache ne doit PAS masquer le changement).
    await page.click('[data-action="next"]'); await page.waitForTimeout(350);
    await page.click('[data-action="next"]'); await page.waitForTimeout(400); // visite la 38 pour la mettre en cache
    await page.click('[data-action="prev"]'); await page.waitForTimeout(350); // retour sur la 37
    await page.click('[data-action="recurrences"]'); await page.waitForTimeout(300);
    await page.click('#typeRecRow .chip[data-t="personne"]');
    await page.click('#jourRecRow .chip[data-j="4"]');
    await page.click('#persoRecRow .chip[data-n="Bastien"]');
    await page.fill('#fTexteRec', 'Rangement dépôt');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(450);
    await raz();
    await page.click('[data-action="next"]'); await page.waitForTimeout(450); // 38 : doit être RELUE
    const recSurS38 = await page.evaluate(() => {
      const td = document.querySelector('td.cell[data-kind="pers"][data-ancre="14"][data-demi="matin"][data-jour="4"]');
      const el = td && td.querySelector('.txt');
      return el ? el.textContent.trim() : null;
    });
    const apresRecurrence = await compteurs();

    console.log('AD) 1re visite d\'une semaine jamais vue (attendu 1 apiChargerSemaine) =', JSON.stringify(apresPremiereVisite));
    console.log('    3 navigations entre semaines DÉJÀ VUES (attendu {} — plus aucun aller-retour serveur) =', JSON.stringify(apresAllersRetours), '| total =', nb(apresAllersRetours));
    console.log('    enregistrer une case (attendu 1 seule écriture, aucune relecture) =', JSON.stringify(apresEnregistrement), '| total =', nb(apresEnregistrement));
    console.log('    puis retour sur la semaine voisine (attendu {} : une case n\'invalide que sa propre semaine) =', JSON.stringify(apresRetourVoisine), '| total =', nb(apresRetourVoisine));
    console.log('    après une récurrence, la S38 déjà en cache est bien RELUE (attendu 1 apiChargerSemaine) =', JSON.stringify(apresRecurrence));
    console.log('    et elle affiche le texte récurrent (attendu "Rangement dépôt", donc pas de cache périmé) =', JSON.stringify(recSurS38));
    await ctx.close();
  }

  // AE) TÂCHES MULTIPLES CÔTÉ PERSONNEL, ET SUPPRESSION TOUJOURS POSSIBLE
  //     MÊME À UNE SEULE TÂCHE (demande de Lionel, 28.08.2026, requêtes 1+2 :
  //     "possibilité d'ajouter des tâches aussi dans le personnel,
  //     actuellement j'ai des doubles tâches que je ne peux pas modifier" /
  //     "pouvoir supprimer des tâches grâce au bouton supprimer même si elle
  //     est unique, car c'est plus rapide et intuitif"). Lionel (ligne 6),
  //     lundi après-midi : 2 tâches préexistantes en données, avant ce round
  //     invisibles/non modifiables côté personnel.
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    await versSemaine36(page);

    const lireGrille = (demi, jour) => page.evaluate(({ demi, jour }) => Array.from(document.querySelectorAll('td.cell[data-ancre="6"][data-demi="' + demi + '"][data-jour="' + jour + '"] .tache-bloc')).map((el) => ({
      txt: el.querySelector('.txt').textContent.trim(), important: el.classList.contains('important')
    })), { demi, jour });
    const lireFiche = () => page.evaluate(() => Array.from(document.querySelectorAll('#tachesWrap .tache-row')).map((row) => ({
      texte: row.querySelector('.fTacheTexte').value,
      important: row.querySelector('.tacheImportantRow .important-chip').classList.contains('selected'),
      aStatut: !!row.querySelector('.tacheStatutRow')
    })));

    const grilleAvant = await lireGrille('aprem', 0);

    await page.click('td.cell[data-kind="pers"][data-ancre="6"][data-demi="aprem"][data-jour="0"]');
    await page.waitForTimeout(250);
    const ficheAvant = await lireFiche();

    // Supprimer la 1ère tâche (2 -> 1) : comportement déjà connu (cf. bloc
    // AC côté sous-traitant), vérifié ici côté personnel.
    await page.click('#tachesWrap .tache-row[data-i="0"] .tacheDel');
    await page.waitForTimeout(100);
    const apres2vers1 = await lireFiche();

    // Sur l'UNIQUE tâche restante, le bouton supprimer doit toujours être là
    // (jamais caché en dessous de 2 tâches) — et cliquer dessus doit la VIDER
    // EN PLACE plutôt que faire disparaître la ligne (c'est tout l'objet de
    // la requête 2).
    const supprimerVisibleA1 = await page.evaluate(() => !!document.querySelector('#tachesWrap .tacheDel'));
    await page.click('#tachesWrap .tache-row[data-i="0"] .tacheDel');
    await page.waitForTimeout(100);
    const apresViderEnPlace = await lireFiche();
    const supprimerEncoreVisibleApresVidage = await page.evaluate(() => !!document.querySelector('#tachesWrap .tacheDel'));

    await page.click('#editSheet #cancelBtn'); // on annule : on veut la grille INTACTE pour la suite
    await page.waitForTimeout(200);

    // Ajout d'une 2e tâche à une case personnel qui n'en avait qu'une (lundi
    // matin, "Bétonnage radier") : le bouton + doit fonctionner aussi côté
    // personnel, pas seulement sous-traitant.
    await page.click('td.cell[data-kind="pers"][data-ancre="6"][data-demi="matin"][data-jour="0"]');
    await page.waitForTimeout(250);
    const uneSeuleAuDepart = await page.evaluate(() => document.querySelectorAll('#tachesWrap .tache-row').length);
    await page.click('#addTacheBtn');
    await page.waitForTimeout(100);
    await page.fill('#tachesWrap .fTacheTexte[data-i="1"]', 'Nettoyage chantier');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const grilleApresAjout = (await lireGrille('matin', 0)).map((b) => b.txt);
    await ctx.close();

    console.log('AE) grille AVANT (attendu 2 blocs : "Pose fenêtres" non important, "Rangement dépôt" important) =', JSON.stringify(grilleAvant));
    console.log('    fiche ouverte (attendu 2 lignes, mêmes textes, aStatut FALSE pour les 2 — sans objet côté personnel) =', JSON.stringify(ficheAvant));
    console.log('    après suppression de la 1ère tâche (attendu 1 seule ligne restante, "Rangement dépôt"/important) =', JSON.stringify(apres2vers1));
    console.log('    bouton supprimer visible avec 1 seule tâche (attendu true, requête 2) =', supprimerVisibleA1);
    console.log('    après clic sur supprimer LA seule tâche restante (attendu 1 ligne TOUJOURS PRÉSENTE mais vidée : texte="", important=false — pas de ligne qui disparaît) =', JSON.stringify(apresViderEnPlace));
    console.log('    bouton supprimer toujours visible après vidage (attendu true) =', supprimerEncoreVisibleApresVidage);
    console.log('    ajout d\'une 2e tâche à une case personnel qui n\'en avait qu\'une (attendu 1 ligne au départ) =', uneSeuleAuDepart);
    console.log('    grille après enregistrement (attendu 2 blocs : "Bétonnage radier" + "Nettoyage chantier") =', JSON.stringify(grilleApresAjout));
  }

  // AF) TAG MANUEL "IMPORTANT" SUR UNE TÂCHE (demande de Lionel, 28.08.2026,
  //     requête 5 : "mettre un tag important pour faire ressortir le texte…
  //     en rouge") — bascule dans la fiche, style dans la grille, style à
  //     l'impression. Vérifié aussi que ça n'a AUCUN effet sur le statut de
  //     réservation (les deux sont indépendants).
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    await versSemaine36(page);

    // Case sous-traitant vierge (mardi matin, ligne 22) : statut ET important
    // ensemble, pour vérifier qu'ils cohabitent sans interférence.
    await page.click('td.cell[data-kind="pers"][data-ancre="22"][data-demi="matin"][data-jour="1"]');
    await page.waitForTimeout(250);
    const pasImportantAuDepart = await page.evaluate(() => !document.querySelector('#tachesWrap .important-chip.selected'));
    await page.fill('#tachesWrap .fTacheTexte[data-i="0"]', 'Étanchéité toiture');
    await page.click('#tachesWrap .tache-row[data-i="0"] .tacheStatutRow .chip.st-confirme');
    await page.click('#tachesWrap .tache-row[data-i="0"] .tacheImportantRow .important-chip');
    const chipSelectionnee = await page.evaluate(() => document.querySelector('#tachesWrap .important-chip').classList.contains('selected'));
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);

    const grille = await page.evaluate(() => {
      const bloc = document.querySelector('td.cell[data-ancre="22"][data-demi="matin"][data-jour="1"] .tache-bloc');
      return { important: bloc.classList.contains('important'), pastille: !!bloc.querySelector('.statut-pill') };
    });

    // Réouverture : le chip Important doit revenir sélectionné (round-trip
    // serveur, pas juste en mémoire), le statut aussi.
    await page.click('td.cell[data-kind="pers"][data-ancre="22"][data-demi="matin"][data-jour="1"]');
    await page.waitForTimeout(250);
    const apresRechargement = await page.evaluate(() => ({
      important: document.querySelector('#tachesWrap .important-chip').classList.contains('selected'),
      statut: (document.querySelector('#tachesWrap .tacheStatutRow .chip.selected') || {}).textContent || null
    }));
    await page.click('#editSheet #cancelBtn');

    // Impression : la tâche importante doit ressortir dans un
    // <span class="print-important">.
    await page.click('[data-action="print"]');
    await page.waitForTimeout(300);
    const impressionImportants = await page.evaluate(() => Array.from(document.querySelectorAll('.print-important')).map((el) => el.textContent.trim()));
    await page.screenshot({ path: path.join(OUT, '22-tag-important.png') });

    console.log('AF) aucun chip Important sélectionné au départ (attendu true) =', pasImportantAuDepart);
    console.log('    chip sélectionné juste après le clic, avant enregistrement (attendu true) =', chipSelectionnee);
    console.log('    grille après enregistrement (attendu important=true ET pastille de statut toujours là — les deux cohabitent) =', JSON.stringify(grille));
    console.log('    après rechargement complet depuis le serveur (attendu important=true, statut="Confirmé") =', JSON.stringify(apresRechargement));
    console.log('    à l\'impression, textes en évidence (attendu contient "Étanchéité toiture") =', JSON.stringify(impressionImportants));
    await ctx.close();
  }

  // AG) PLUSIEURS NOTES INDÉPENDANTES LE MÊME JOUR (demande de Lionel,
  //     28.08.2026, requête 6 : "bien séparer les notes qui sont sur
  //     plusieurs jours d'une note qui serait sur un jour en même temps…
  //     à l'impression il faudrait que les notes tombant le même jour soient
  //     séparées sur des lignes différentes"). Mercredi 02.09 (semaine 36,
  //     jour 2) porte 2 notes indépendantes en données de départ, une
  //     importante — cf. seed textesJour.note["2026-09-02"].
  {
    const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    await versSemaine36(page);

    // Dans la GRILLE : les 2 notes doivent apparaître comme 2 .note-item
    // distincts dans la même case (jamais fusionnées avec un jour voisin
    // puisque mardi et jeudi n'ont pas exactement les 2 mêmes entrées).
    const grille = await page.evaluate(() => {
      const td = document.querySelector('tr.notes td.cell[data-jour="2"]');
      return {
        entrees: Array.from(td.querySelectorAll('.note-item')).map((el) => ({ texte: el.textContent.trim(), important: el.classList.contains('important') })),
        span: td.getAttribute('colspan') || '1'
      };
    });

    // 2 notes ou plus le même jour -> petite liste à choisir, PAS la fiche
    // d'édition directe (cf. openNotesJourSheet).
    await page.click('td.cell[data-kind="note"][data-jour="2"]');
    await page.waitForTimeout(250);
    const liste = await page.evaluate(() => ({
      estListe: !!document.getElementById('notesListWrap'),
      entrees: Array.from(document.querySelectorAll('#notesListWrap .note-label')).map((el) => ({ texte: el.textContent.trim(), important: el.classList.contains('important') }))
    }));

    // Éditer LA NOTE IMPORTANTE (clic sur son libellé) : la fiche doit
    // s'ouvrir pré-remplie sur SON texte à elle uniquement, en un seul jour
    // (elle n'est pas sur plusieurs jours dans ce jeu de données), avec le
    // chip Important déjà coché.
    await page.click('#notesListWrap .note-label.important');
    await page.waitForTimeout(250);
    const editeurNoteImportante = await page.evaluate(() => ({
      debut: document.getElementById('fDebut').value,
      fin: document.getElementById('fFin').value,
      texte: document.getElementById('fTexte').value,
      important: document.querySelector('#importantChipRow .chip').classList.contains('selected'),
      // Date dans le titre (round du 28.08.2026, demande de Lionel : "idem
      // [...] note" — cf. dateLabel dans openPlageSheet(), Index.html).
      titre: document.querySelector('#editSheet h2').textContent.trim()
    }));
    await page.click('#editSheet #cancelBtn');
    await page.waitForTimeout(200);

    // Supprimer SEULEMENT la note NON importante depuis la liste : l'autre
    // (importante) doit rester intacte sur ce même jour — c'est exactement le
    // piège corrigé ce round (cf. WebApp.gs, apiEnregistrerPlage).
    await page.click('td.cell[data-kind="note"][data-jour="2"]');
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      var cible = Array.from(document.querySelectorAll('#notesListWrap .note-label')).find(function (el) { return !el.classList.contains('important'); });
      cible.closest('.tache-row').querySelector('.tacheDel').click();
    });
    await page.waitForTimeout(400);
    const grilleApresSuppression = await page.evaluate(() => {
      const td = document.querySelector('tr.notes td.cell[data-jour="2"]');
      return Array.from(td.querySelectorAll('.note-item')).map((el) => ({ texte: el.textContent.trim(), important: el.classList.contains('important') }));
    });

    // Il ne reste plus qu'UNE note ce jour-là : rouvrir doit désormais aller
    // DIRECTEMENT dans l'éditeur (plus de liste à choisir pour une seule).
    await page.click('td.cell[data-kind="note"][data-jour="2"]');
    await page.waitForTimeout(250);
    const apresRetourA1 = await page.evaluate(() => ({
      estListe: !!document.getElementById('notesListWrap'),
      texteEditeur: (document.getElementById('fTexte') || {}).value || null
    }));
    await page.click('#editSheet #cancelBtn');
    await page.waitForTimeout(200);

    // Impression : les notes du même jour doivent être sur des LIGNES
    // SÉPARÉES dans la case (pas mélangées en un seul bloc de texte), et la
    // note importante ressort en rouge (.print-important) — vérifié sur un
    // autre jour resté à 2 notes pour ne pas dépendre de la suppression
    // ci-dessus : on réouvre une page fraîche.
    const { ctx: ctx2, page: page2 } = await newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    await versSemaine36(page2);
    await page2.click('[data-action="print"]');
    await page2.waitForTimeout(300);
    const impressionNotes = await page2.evaluate(() => {
      const td = document.querySelectorAll('tr.print-notes td')[3]; // jour 2 = mercredi (td[0] = étiquette de ligne)
      return td ? { html: td.innerHTML, important: Array.from(td.querySelectorAll('.print-important')).map((el) => el.textContent.trim()) } : null;
    });
    await page2.screenshot({ path: path.join(OUT, '23-notes-multiples-impression.png'), fullPage: true });
    await ctx2.close();

    await page.screenshot({ path: path.join(OUT, '24-notes-multiples-liste.png') });
    console.log('AG) grille — mercredi (attendu 2 entrées : "Livraison sable" non importante, "Contrôle sécurité" importante, span=1) =', JSON.stringify(grille));
    console.log('    clic sur la case -> petite liste (attendu estListe=true, 2 entrées) =', JSON.stringify(liste));
    console.log('    édition de la note importante (attendu debut=2026-09-02, fin="" (un seul jour), texte="Contrôle sécurité", important=true, titre="Modifier la note · 02 sept.") =', JSON.stringify(editeurNoteImportante));
    console.log('    après suppression de "Livraison sable" seule (attendu 1 SEULE entrée restante : "Contrôle sécurité", toujours importante — pas touchée) =', JSON.stringify(grilleApresSuppression));
    console.log('    réouverture avec 1 seule note restante (attendu estListe=FALSE — édition directe désormais, texte="Contrôle sécurité") =', JSON.stringify(apresRetourA1));
    console.log('    impression — case du mercredi (attendu les 2 textes séparés par <br>, "Contrôle sécurité" entouré de .print-important) =', JSON.stringify(impressionNotes));
    await ctx.close();
  }

  // AH) DÉPLACER UNE CASE (nom/date cliquables dans le titre de la fiche
  //     tâche — round du 28.08.2026, demande de Lionel : "changer la date ou
  //     le nom en cliquant dessus... pour décaler une tâche"). Semaine 36 :
  //     Lionel lundi matin porte déjà "Bétonnage radier"/Filisetti (cf. seed).
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    await versSemaine36(page);

    const lireCellule = (ancre, demi, jour) => page.evaluate((a) => {
      const td = document.querySelector('td.cell[data-kind="pers"][data-ancre="' + a.ancre + '"][data-demi="' + a.demi + '"][data-jour="' + a.jour + '"]');
      if (!td) return null;
      return {
        chantier: (td.querySelector('.chantier-tag') || {}).textContent || null,
        taches: Array.from(td.querySelectorAll('.tache-bloc .txt')).map((el) => el.textContent.trim())
      };
    }, { ancre, demi, jour });

    const avantLionelLun = await lireCellule(6, 'matin', 0);
    const avantLionelMar = await lireCellule(6, 'matin', 1);

    // Ouvrir la case (Lionel, lundi matin) : titre cliquable attendu (case
    // non vide), header du sélecteur de jour conforme au patron "Aller à une
    // semaine" (liste de boutons, jour actuel marqué).
    await page.click('td.cell[data-kind="pers"][data-ancre="6"][data-demi="matin"][data-jour="0"]');
    await page.waitForTimeout(250);
    const cliquable = await page.evaluate(() => !!document.getElementById('titreDateBtn') && !!document.getElementById('titreNomBtn'));
    await page.screenshot({ path: path.join(OUT, '25-fiche-titre-cliquable.png') });
    await page.click('#titreDateBtn');
    await page.waitForTimeout(200);
    const pickerJour = await page.evaluate(() => {
      const actuel = document.querySelector('#joursDeplWrap .item-semaine.actuelle');
      return {
        titre: document.querySelector('#editSheet h2').textContent.trim(),
        nbJours: document.querySelectorAll('#joursDeplWrap .item-semaine').length,
        actuelEstJour0: actuel ? actuel.getAttribute('data-jour') : null
      };
    });
    await page.screenshot({ path: path.join(OUT, '26-selecteur-jour.png') });

    // Déplacer vers mardi matin (vide au départ) : doit réussir.
    await page.click('#joursDeplWrap .item-semaine[data-jour="1"]');
    await page.waitForTimeout(400);
    const toastDeplaceJour = await page.evaluate(() => document.getElementById('toast').textContent);
    const apresLionelLun = await lireCellule(6, 'matin', 0);
    const apresLionelMar = await lireCellule(6, 'matin', 1);

    await page.screenshot({ path: path.join(OUT, '27-apres-deplacement-jour.png') });
    console.log('AH) titre cliquable sur une case remplie (attendu true) =', cliquable);
    console.log('    Lionel lundi matin AVANT (attendu chantier="Filisetti", tâche "Bétonnage radier") =', JSON.stringify(avantLionelLun), ' | mardi matin AVANT (attendu vide) =', JSON.stringify(avantLionelMar));
    console.log('    sélecteur de jour (attendu titre="Choisir un autre jour", 5 jours, jour actuel = "0") =', JSON.stringify(pickerJour));
    console.log('    toast après déplacement vers mardi =', JSON.stringify(toastDeplaceJour));
    console.log('    lundi matin APRÈS (attendu vide, contenu parti) =', JSON.stringify(apresLionelLun), ' | mardi matin APRÈS (attendu le contenu de lundi, déplacé) =', JSON.stringify(apresLionelMar));

    // Depuis la nouvelle case (mardi), changer de PERSONNE : liste attendue
    // SANS Lionel (case actuelle) ni aucun sous-traitant (autre section).
    await page.click('td.cell[data-kind="pers"][data-ancre="6"][data-demi="matin"][data-jour="1"]');
    await page.waitForTimeout(250);
    await page.click('#titreNomBtn');
    await page.waitForTimeout(200);
    const candidatsPersonne = await page.evaluate(() => Array.from(document.querySelectorAll('#personnesDeplWrap .item-semaine b')).map((el) => el.textContent.trim()));
    await page.screenshot({ path: path.join(OUT, '28-selecteur-personne.png') });
    await page.click('#personnesDeplWrap .item-semaine[data-ancre="10"]'); // Mathis
    await page.waitForTimeout(400);
    const toastDeplacePersonne = await page.evaluate(() => document.getElementById('toast').textContent);
    const apresMathisMar = await lireCellule(10, 'matin', 1);
    const apresLionelMar2 = await lireCellule(6, 'matin', 1);

    console.log('    liste "changer de personne" depuis mardi (attendu ["Mathis","Bastien"], jamais Lionel ni un sous-traitant) =', JSON.stringify(candidatsPersonne));
    console.log('    toast après déplacement vers Mathis =', JSON.stringify(toastDeplacePersonne));
    console.log('    Mathis mardi matin APRÈS (attendu le contenu déplacé) =', JSON.stringify(apresMathisMar), ' | Lionel mardi matin APRÈS (attendu vide à nouveau) =', JSON.stringify(apresLionelMar2));

    // Case déjà occupée : PLUS de blocage pur et simple depuis la demande de
    // Lionel "au passage" (28.08.2026) — 3 choix proposés (ne rien faire /
    // écraser / ajouter). Armature/Béton (ancre 22) : lundi ET jeudi matin
    // ont du contenu (seed) — lundi = chantier "Filisetti" + 1 tâche, jeudi
    // = pas de chantier + 2 tâches déjà là, de quoi vérifier la fusion
    // (chantier comblé puisqu'il était vide, tâches combinées sans doublon).
    const avantSTLun = await lireCellule(22, 'matin', 0);
    const avantSTJeu = await lireCellule(22, 'matin', 3);
    await page.click('td.cell[data-kind="pers"][data-ancre="22"][data-demi="matin"][data-jour="0"]');
    await page.waitForTimeout(250);
    await page.click('#titreDateBtn');
    await page.waitForTimeout(200);
    await page.click('#joursDeplWrap .item-semaine[data-jour="3"]'); // jeudi, déjà occupé
    await page.waitForTimeout(300);
    const resolutionPresente = await page.evaluate(() => ({
      titre: document.querySelector('#editSheet h2').textContent.trim(),
      dejaLaBas: (document.querySelector('.conflit-resume') || {}).textContent,
      choix: !!document.getElementById('conflitRien') && !!document.getElementById('conflitAjouter') && !!document.getElementById('conflitEcraser')
    }));
    await page.screenshot({ path: path.join(OUT, '30-resolution-conflit-ecran.png') });

    // "Ne rien faire" : la fiche se ferme, RIEN ne bouge d'aucun côté.
    await page.click('#conflitRien');
    await page.waitForTimeout(300);
    const apresRienSTLun = await lireCellule(22, 'matin', 0);
    const apresRienSTJeu = await lireCellule(22, 'matin', 3);

    // "Ajouter" : le chantier de la destination est comblé (il était vide),
    // ses 2 tâches restent, celle qui arrive s'ajoute à la suite — et la
    // case d'origine se vide (son contenu a été repris, pas perdu).
    await page.click('td.cell[data-kind="pers"][data-ancre="22"][data-demi="matin"][data-jour="0"]');
    await page.waitForTimeout(250);
    await page.click('#titreDateBtn');
    await page.waitForTimeout(200);
    await page.click('#joursDeplWrap .item-semaine[data-jour="3"]');
    await page.waitForTimeout(300);
    await page.click('#conflitAjouter');
    await page.waitForTimeout(400);
    const apresAjoutSTLun = await lireCellule(22, 'matin', 0);
    const apresAjoutSTJeu = await lireCellule(22, 'matin', 3);

    // "Écraser" : un nouveau contenu posé sur lundi (vidé par l'étape
    // précédente), déplacé vers jeudi (occupé par le résultat de la fusion
    // ci-dessus) — jeudi doit alors perdre TOUT son contenu précédent (y
    // compris le chantier tout juste comblé) et ne garder QUE ce qui arrive.
    await page.click('td.cell[data-kind="pers"][data-ancre="22"][data-demi="matin"][data-jour="0"]');
    await page.waitForTimeout(250);
    await page.fill('#tachesWrap .fTacheTexte[data-i="0"]', 'Test écraser');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    await page.click('td.cell[data-kind="pers"][data-ancre="22"][data-demi="matin"][data-jour="0"]');
    await page.waitForTimeout(250);
    await page.click('#titreDateBtn');
    await page.waitForTimeout(200);
    await page.click('#joursDeplWrap .item-semaine[data-jour="3"]');
    await page.waitForTimeout(300);
    await page.click('#conflitEcraser');
    await page.waitForTimeout(400);
    const apresEcraserSTLun = await lireCellule(22, 'matin', 0);
    const apresEcraserSTJeu = await lireCellule(22, 'matin', 3);

    await page.screenshot({ path: path.join(OUT, '30-resolution-conflit.png') });
    console.log('    case destination déjà occupée -> résolution proposée (attendu titre contient "n\'est pas vide", résumé "Armature murs rez — deuxième ligne", 3 boutons) =', JSON.stringify(resolutionPresente));
    console.log('    "Ne rien faire" -> rien n\'a bougé (attendu AVANT === APRÈS des 2 côtés) =', JSON.stringify({ lunInchange: JSON.stringify(avantSTLun) === JSON.stringify(apresRienSTLun), jeuInchange: JSON.stringify(avantSTJeu) === JSON.stringify(apresRienSTJeu) }));
    console.log('    "Ajouter" -> lundi (attendu vide, contenu repris) =', JSON.stringify(apresAjoutSTLun), ' | jeudi (attendu chantier="Filisetti" comblé + 3 tâches : "Armature murs rez","deuxième ligne","Béton radier 50m3") =', JSON.stringify(apresAjoutSTJeu));
    console.log('    "Écraser" -> lundi (attendu vide) =', JSON.stringify(apresEcraserSTLun), ' | jeudi (attendu chantier=null et SEULEMENT "Test écraser", tout le reste remplacé) =', JSON.stringify(apresEcraserSTJeu));

    // Cliquer sur le jour ACTUEL lui-même (depuis la fiche de jeudi, qui
    // porte "Test écraser" après l'étape ci-dessus) : no-op signalé, rien
    // n'est écrit.
    await page.click('td.cell[data-kind="pers"][data-ancre="22"][data-demi="matin"][data-jour="3"]');
    await page.waitForTimeout(250);
    await page.click('#titreDateBtn');
    await page.waitForTimeout(200);
    await page.click('#joursDeplWrap .item-semaine[data-jour="3"]');
    await page.waitForTimeout(300);
    const toastDejaLa = await page.evaluate(() => document.getElementById('toast').textContent);
    console.log('    reclic sur le jour actuel (attendu "C\'est déjà là.") =', JSON.stringify(toastDejaLa));

    await ctx.close();
  }

  // AI) DÉCALER UN JALON/UNE NOTE EXISTANT (raccourci "Plus tôt"/"Plus tard"
  //     dans sa fiche — round du 28.08.2026, demande de Lionel : "proposer
  //     une décalage spécifique au jalon [...] idem pour les notes", en
  //     réponse à la proposition de décalage en masse). Semaine 37 :
  //     mar 08.09 -> jeu 10.09 (index 1 -> 3).
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    const litLigne = (classe) => page.evaluate((c) => Array.from(document.querySelectorAll('tr.' + c + ' td.cell:not(.weekend)')).map((td) => ({
      txt: td.querySelector('.txt').textContent.trim(),
      span: td.getAttribute('colspan') || '1',
      jour: td.getAttribute('data-jour'),
      fin: td.getAttribute('data-fin')
    })), classe);
    const champsPlage = () => page.evaluate(() => ({
      debut: document.getElementById('fDebut').value,
      fin: document.getElementById('fFin').value,
      titre: document.querySelector('#editSheet h2').textContent.trim()
    }));

    // Pose du jalon de départ : mar 08.09 -> jeu 10.09 (identique au bloc P).
    await page.click('.btn-plage[data-plage="jalon"]');
    await page.waitForTimeout(250);
    await page.fill('#fDebut', '2026-09-08');
    await page.fill('#fFin', '2026-09-10');
    await page.fill('#fTexte', 'Coulage dalle R+1');
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);

    // Réouverture : raccourci attendu visible (mode remplacement uniquement),
    // pré-rempli à "1" jour ouvrable.
    await page.click('tr.jalons td.cell.filled');
    await page.waitForTimeout(250);
    const raccourciPresent = await page.evaluate(() => ({
      decalRow: !!document.getElementById('decalReculerBtn') && !!document.getElementById('decalAvancerBtn'),
      nParDefaut: document.getElementById('fDecalN').value
    }));

    // "Plus tard" x1 (N=1) : mar->mer, jeu->ven — reste dans la semaine 37.
    await page.click('#decalAvancerBtn');
    await page.waitForTimeout(150);
    const apresAvancer1 = await champsPlage();

    // "Plus tôt" x1 (N=1) : doit revenir EXACTEMENT à la plage de départ
    // (aller-retour symétrique).
    await page.click('#decalReculerBtn');
    await page.waitForTimeout(150);
    const apresReculer1 = await champsPlage();

    // On rejoue "Plus tard" x1 pour repartir dans l'état décalé (mer->ven),
    // puis on enregistre : la case de départ (mardi) doit se vider toute
    // seule, exactement comme le raccourcissement manuel du bloc P — la
    // fiche n'a fait que remplir les mêmes champs Début/Fin qu'une saisie
    // manuelle, donc le mécanisme d'effacement de la plage d'origine
    // (apiEnregistrerPlage, déjà utilisé partout ailleurs) s'applique tel quel.
    await page.click('#decalAvancerBtn');
    await page.waitForTimeout(150);
    await page.click('#editSheet #saveBtn');
    await page.waitForTimeout(400);
    const toastDecalage = await page.evaluate(() => document.getElementById('toast').textContent);
    const ligneApresDecalage = await litLigne('jalons');

    // N personnalisé (3) + franchissement d'un week-end ET d'un changement
    // de semaine, depuis la position déjà décalée (mer 09.09 -> ven 11.09) :
    // vérifie que le raccourci n'est pas limité à N=1 ni à la semaine
    // affichée (pas d'enregistrement ici, juste les champs).
    await page.click('tr.jalons td.cell.filled');
    await page.waitForTimeout(250);
    await page.fill('#fDecalN', '3');
    await page.click('#decalAvancerBtn');
    await page.waitForTimeout(150);
    const apresAvancer3 = await champsPlage();

    await page.screenshot({ path: path.join(OUT, '29-decalage-jalon.png') });
    console.log('AI) raccourci "Décaler" présent en réouverture, N=1 par défaut (attendu decalRow=true, nParDefaut="1") =', JSON.stringify(raccourciPresent));
    console.log('    après "Plus tard" x1 (attendu debut=2026-09-09, fin=2026-09-11, titre="Modifier le jalon · 09 sept. – 11 sept.") =', JSON.stringify(apresAvancer1));
    console.log('    après "Plus tôt" x1 — aller-retour (attendu = plage de départ, debut=2026-09-08, fin=2026-09-10) =', JSON.stringify(apresReculer1));
    console.log('    toast après enregistrement du décalage (attendu « posé sur 3 jour(s) » — mer/jeu restent identiques donc 0 remplacement, seul le mardi sort de la plage et le vendredi y entre) =', JSON.stringify(toastDecalage));
    console.log('    ligne jalons après enregistrement (attendu : mardi 08.09 vidé tout seul, mer->ven = 1 case colspan=3 "Coulage dalle R+1") =', JSON.stringify(ligneApresDecalage));
    console.log('    N=3 depuis mer 09.09 -> ven 11.09, à travers un week-end ET un changement de semaine (attendu debut=2026-09-14, fin=2026-09-16) =', JSON.stringify(apresAvancer3));

    await ctx.close();
  }

  // AJ) Décaler le planning — fiche : clic sur l'en-tête de jour, portée /
  //     personne / sens / N jours, bons paramètres envoyés à l'aperçu, bon
  //     rendu du résultat reçu, et "Retour" qui rouvre la fiche avec les
  //     MÊMES choix (round du 28.08.2026, demande de Lionel). Le calcul du
  //     décalage lui-même (cascade, création de semaines, etc.) est déjà
  //     vérifié en profondeur contre le vrai WebApp.gs dans
  //     test_semaines.js — ce bloc-ci ne couvre que le câblage client, via
  //     window.__mockApercuDecalage (cf. MOCK en tête de fichier).
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    await page.click('.th-jour[data-jour="0"]');
    await page.waitForTimeout(200);
    const titreDepart = await page.evaluate(() => document.querySelector('#editSheet h2').textContent.trim());
    const defauts = await page.evaluate(() => {
      var bloc = document.querySelector('#personneDecBloc');
      return {
        porteeSel: document.querySelector('#porteeDecRow .chip.selected').getAttribute('data-p'),
        personneBlocHidden: bloc.hidden,
        sensSel: document.querySelector('#sensDecRow .chip.selected').getAttribute('data-s'),
        nJours: document.querySelector('#nJoursDec').value
      };
    });

    // Portée "Une ligne" -> le bloc personne apparaît, 1re personne du
    // planning présélectionnée (Lionel, ancre 6) ; on choisit Mathis (10) à
    // la place, "Reculer", puis N=3.
    await page.click('#porteeDecRow .chip[data-p="ligne"]');
    const apresLigne = await page.evaluate(() => {
      var bloc = document.querySelector('#personneDecBloc');
      var actuel = document.querySelector('#personnesDecWrap .item-semaine.actuelle');
      return { personneBlocHidden: bloc.hidden, ancrePreselectionnee: actuel ? actuel.getAttribute('data-ancre') : null };
    });
    await page.click('#personnesDecWrap .item-semaine[data-ancre="10"]');
    await page.click('#sensDecRow .chip[data-s="reculer"]');
    await page.fill('#nJoursDec', '3');

    await page.evaluate(() => {
      window.__mockApercuDecalage = {
        nbSimples: 1,
        conflits: [
          { id: 'c1', nom: 'Mathis', demi: 'matin', jourSourceIso: '2026-09-08', jourDestIso: '2026-09-03',
            source: { chantier: 'BINE', taches: [{ texte: 'Coffrage', statut: null, important: false }] },
            dest: { chantier: 'XYZ', taches: [] } },
          { id: 'c2', nom: 'Mathis', demi: 'aprem', jourSourceIso: '2026-09-09', jourDestIso: '2026-09-04',
            source: { chantier: null, taches: [{ texte: 'Nouvelle tâche', statut: null, important: false }] },
            dest: { chantier: 'Déjà là', taches: [] } }
        ],
        impossibles: [{ nom: 'Mathis', demi: 'matin', jourSourceIso: '2026-09-01' }]
      };
    });
    await page.click('#apercuDecBtn');
    await page.waitForTimeout(250);

    const appelApercu = await page.evaluate(() => window.__decalageAppels[window.__decalageAppels.length - 1]);
    const ecranApercu = await page.evaluate(() => {
      var items = document.querySelectorAll('.conflit-item');
      var resumesPremier = items[0].querySelectorAll('.conflit-resume');
      return {
        titre: document.querySelector('#editSheet h2').textContent.trim(),
        stats: Array.from(document.querySelectorAll('.decalage-stat')).map(function (el) { return el.querySelector('b').textContent + ' ' + el.querySelector('span').textContent; }),
        nbConflitItems: items.length,
        premierTitre: items[0].querySelector('.conflit-titre').textContent.trim(),
        premierDejaLa: resumesPremier[0].textContent.trim(),
        premierArrive: resumesPremier[1].textContent.trim(),
        nbImpossibles: document.querySelectorAll('.impossibles-bloc div').length
      };
    });
    await page.screenshot({ path: path.join(OUT, '32-decalage-apercu.png') });

    console.log('AJ) titre fiche au clic sur l\'en-tête lundi (attendu "À partir du Lun ...") =', JSON.stringify(titreDepart));
    console.log('    défauts (attendu portée=tous, bloc personne caché=true, sens=avancer, nJours="1") =', JSON.stringify(defauts));
    console.log('    après clic "Une ligne" (attendu bloc personne caché=false, ancre présélectionnée="6") =', JSON.stringify(apresLigne));
    console.log('    appel apiApercuDecalage (attendu portee=ligne, ancre=10, sens=reculer, nJours=3) =', JSON.stringify(appelApercu));
    console.log('    écran aperçu (attendu titre="Aperçu", stats=["1 déplacement direct","2 conflits à choisir","1 ignoré"], 2 items, 1er="Mathis · matin · 08 sept. → 03 sept.", déjà là="XYZ", arrive="BINE — Coffrage") =', JSON.stringify(ecranApercu));

    // "Retour" : rouvre la fiche avec EXACTEMENT les mêmes choix (jamais remis à zéro).
    await page.click('#retourBtn');
    await page.waitForTimeout(200);
    const apresRetour = await page.evaluate(() => {
      var actuel = document.querySelector('#personnesDecWrap .item-semaine.actuelle');
      return {
        porteeSel: document.querySelector('#porteeDecRow .chip.selected').getAttribute('data-p'),
        ancreSelectionnee: actuel ? actuel.getAttribute('data-ancre') : null,
        sensSel: document.querySelector('#sensDecRow .chip.selected').getAttribute('data-s'),
        nJours: document.querySelector('#nJoursDec').value
      };
    });
    console.log('    après "Retour" (attendu portee=ligne, ancre="10", sens=reculer, nJours="3" — PAS remis à zéro) =', JSON.stringify(apresRetour));

    await ctx.close();
  }

  // AK) Décaler le planning — résolution des conflits (3 choix, un par
  //     case) et confirmation : les BONS choix sont envoyés à
  //     apiAppliquerDecalage (id -> "ecraser"/"ajouter" ; absent = "ne rien
  //     faire", jamais envoyé), changer d'avis sur un même conflit ne laisse
  //     qu'UN choix actif, et la fiche se ferme avec un toast récapitulatif.
  {
    const { ctx, page } = await newPage({ viewport: { width: 820, height: 1100 }, colorScheme: 'light' });
    await page.evaluate(() => {
      window.__mockApercuDecalage = {
        nbSimples: 0,
        conflits: [
          { id: 'x1', nom: 'Lionel', demi: 'matin', jourSourceIso: '2026-09-07', jourDestIso: '2026-09-08', source: { chantier: 'A', taches: [] }, dest: { chantier: 'B', taches: [] } },
          { id: 'x2', nom: 'Lionel', demi: 'aprem', jourSourceIso: '2026-09-07', jourDestIso: '2026-09-08', source: { chantier: 'C', taches: [] }, dest: { chantier: 'D', taches: [] } },
          { id: 'x3', nom: 'Lionel', demi: 'matin', jourSourceIso: '2026-09-08', jourDestIso: '2026-09-09', source: { chantier: 'E', taches: [] }, dest: { chantier: 'F', taches: [] } }
        ],
        impossibles: []
      };
      // Réponse "serveur" volontairement indépendante des choix cliqués ci-
      // dessous (mock délibérément léger, cf. remarque du bloc AJ) : ce test
      // vérifie que la fiche AFFICHE fidèlement ce que renvoie le serveur,
      // pas qu'il recalcule quoi que ce soit lui-même.
      window.__mockAppliquerDecalage = { ok: true, deplaces: 0, ecrases: 1, ajoutes: 1, ignores: 1 };
    });
    await page.click('.th-jour[data-jour="0"]');
    await page.click('#apercuDecBtn');
    await page.waitForTimeout(250);

    const items = await page.$$('.conflit-item');
    await items[1].$eval('.conflit-choix .chip[data-c="ecraser"]', function (el) { el.click(); });
    await items[2].$eval('.conflit-choix .chip[data-c="ecraser"]', function (el) { el.click(); }); // change d'avis...
    await items[2].$eval('.conflit-choix .chip[data-c="ajouter"]', function (el) { el.click(); }); // ...pour "ajouter"
    const choixVisibles = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.conflit-item')).map(function (it) {
        var sel = it.querySelector('.conflit-choix .chip.selected');
        return sel ? sel.getAttribute('data-c') : null;
      })
    );

    await page.click('#confirmerDecBtn');
    await page.waitForTimeout(300);

    const appelConfirm = await page.evaluate(() => window.__decalageAppels[window.__decalageAppels.length - 1]);
    const toast = await page.evaluate(() => document.getElementById('toast').textContent.trim());
    const ficheFermee = await page.evaluate(() => !document.body.classList.contains('fiche-ouverte'));
    await page.screenshot({ path: path.join(OUT, '33-decalage-confirme.png') });

    console.log('AK) choix visibles avant confirmation (attendu ["rien","ecraser","ajouter"] — un seul actif par conflit, même après avoir changé d\'avis sur le 3e) =', JSON.stringify(choixVisibles));
    console.log('    résolutions envoyées (attendu {x2:"ecraser", x3:"ajouter"} — x1 absent) =', JSON.stringify(appelConfirm && appelConfirm.resolutions));
    console.log('    toast récapitulatif (reflète tel quel la réponse du mock — attendu contient "1 écrasé", "1 ajouté" et "1 ignoré") =', JSON.stringify(toast));
    console.log('    fiche refermée après confirmation (attendu true) =', ficheFermee);

    await ctx.close();
  }

  console.log('\n=== ERREURS JS CAPTURÉES ===');
  console.log(errors.length ? errors.join('\n') : '(aucune)');

  await browser.close();
})();
