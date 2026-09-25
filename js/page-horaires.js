"use strict";
  /* ============================================================
     HORAIRES DE TRAVAIL — round du 25.09.2026 (suite 27)
     ------------------------------------------------------------
     Lionel, photo de la feuille PMB « Horaire de travail 2026 » à l'appui :
     « J'aimerai une nouvelle page horaires de travail. Pouvoir entrer les
     horaires comme le tableau en bas à gauche. Les heures de travail
     viennent s'afficher dans le tableau des fériés. On affichera dans les
     case des jour du planning les heures de travail, l'heure de début et
     l'heure de fin de la journée de travail. »

     Une période = des dates (bornes incluses) + l'horaire du matin + celui
     de l'après-midi (facultatif : le 17 juillet et le 18 décembre de la
     feuille ne travaillent que le matin). Table `horaires` (sql/0014), un
     seul horaire pour toute l'entreprise, comme sur la feuille.

     Ce fichier porte aussi les petites fonctions de lecture utilisées
     ailleurs (horaireDuJour, formatDuree) : planning (grille-rendu.js),
     tableau des fériés (page-feries.js), impression (impression.js).
     Les horaires ne valent que du lundi au vendredi : le week-end n'a
     jamais d'horaire, même si une période le couvre (une période « du 2 au
     31 mars » s'écrit d'un bloc, sans découper autour des week-ends).
     ============================================================ */

  var COLONNES_HORAIRES = "id, date_debut, date_fin, matin_debut, matin_fin, aprem_debut, aprem_fin, pause_matin";

  // Postgres renvoie un `time` en « 07:00:00 » : on ne garde que « 07:00 ».
  function hhmm_(t) { return t ? String(t).slice(0, 5) : ""; }
  function normaliserHoraires(lignes) {
    return lignes.map(function (r) {
      return { id: r.id, du: r.date_debut, au: r.date_fin, matinDebut: hhmm_(r.matin_debut), matinFin: hhmm_(r.matin_fin), apremDebut: hhmm_(r.aprem_debut), apremFin: hhmm_(r.aprem_fin), pause: String(r.pause_matin == null ? 15 : r.pause_matin) };
    }).sort(function (a, b) { return a.du < b.du ? -1 : a.du > b.du ? 1 : 0; });
  }
  function minutesDe_(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  // Durée d'une demi-journée en heures (0 si incomplète ou à l'envers).
  function dureeDemi(debut, fin) {
    var a = minutesDe_(debut), b = minutesDe_(fin);
    return (a === null || b === null || b <= a) ? 0 : (b - a) / 60;
  }
  // Pause (minutes) retirée du MATIN, comme la feuille PMB : ses durées
  // sont des heures travaillées — 07:00-12:00 y vaut 04:45, et le 17
  // juillet (matin seul, 07:00-10:15) 03:00 : « il convient d'y ajouter
  // 1/4 d'heure de pause par jour ». 15 min par défaut, réglable par période.
  function dureeMatin(h) { var d = dureeDemi(h.matinDebut, h.matinFin); return d ? Math.max(0, d - (+h.pause || 0) / 60) : 0; }
  function dureeHoraire(h) { return dureeMatin(h) + dureeDemi(h.apremDebut, h.apremFin); }
  // Décimal, comme la feuille : 8.75, 7.50, 3.00 (Lionel, suite 27 : « Décimal »).
  function formatDuree(heures) { return (Math.round(heures * 100) / 100).toFixed(2); }
  // Durée d'une demi-journée au format de la feuille (« 04:45 »).
  function formatDureeHhmm_(heures) {
    var min = Math.round(heures * 60);
    return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
  }
  function estWeekendIso_(iso) { var j = new Date(iso + "T00:00:00").getDay(); return j === 0 || j === 6; }

  // Horaire d'un jour (ISO) : null le week-end ou hors de toute période.
  // Périodes qui se chevaucheraient malgré tout (la page les refuse, pas la
  // base) : la dernière qui commence l'emporte, choix stable et prévisible.
  // Renvoie { matin: "07:00–12:00", aprem: "13:00–17:00" | null, debut,
  // fin, duree, jourSeul } — debut/fin = début et fin de la JOURNÉE (fin du matin
  // quand il n'y a pas d'après-midi).
  function horaireDuJour(iso) {
    if (!iso || estWeekendIso_(iso)) return null;
    var liste = etat.horairesServeur || [], h = null;
    for (var i = 0; i < liste.length; i++) if (liste[i].du <= iso && iso <= liste[i].au) h = liste[i];
    if (!h) return null;
    var aprem = h.apremDebut && h.apremFin;
    return {
      matin: h.matinDebut + "–" + h.matinFin,
      aprem: aprem ? h.apremDebut + "–" + h.apremFin : null,
      debut: h.matinDebut,
      fin: aprem ? h.apremFin : h.matinFin,
      duree: dureeHoraire(h),
      // Période d'UN seul jour (« du 9 au 9 » sur la feuille PMB) : un jour
      // compensé qui en porte une compte comme travaillé (suite 32, cf.
      // heuresFerieJour_ dans page-feries.js).
      jourSeul: h.du === h.au
    };
  }

  /* ---------------- Page Horaires ---------------- */
  // horairesEdition : copie de travail de TOUTES les périodes (toutes
  // années confondues), modifiée par la page et envoyée par Enregistrer —
  // changer d'année ne perd donc rien de ce qui n'est pas encore enregistré.
  // null = à recopier depuis le serveur à la prochaine ouverture.
  var horairesEdition = null, horairesAnnee = new Date().getFullYear(), prochaineCleHoraire = 1;

  function copierHorairesServeur_() {
    horairesEdition = (etat.horairesServeur || []).map(function (h) { return Object.assign({ cle: prochaineCleHoraire++ }, h); });
  }
  function isoDate_(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function dateCourte_(iso) { return iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : "?"; }

  function diffHoraires() {
    var parId = {}, modifs = [], nouveaux = [], supprimes = [];
    (horairesEdition || []).forEach(function (h) { if (h.id != null) parId[h.id] = h; });
    (etat.horairesServeur || []).forEach(function (o) {
      var h = parId[o.id];
      if (!h) { supprimes.push(o.id); return; }
      if (["du", "au", "matinDebut", "matinFin", "apremDebut", "apremFin", "pause"].some(function (k) { return (h[k] || "") !== (o[k] || ""); })) modifs.push(h);
    });
    (horairesEdition || []).forEach(function (h) { if (h.id == null) nouveaux.push(h); });
    return { modifs: modifs, nouveaux: nouveaux, supprimes: supprimes };
  }
  function majCompteModifsHoraires() {
    var btn = document.getElementById("btnEnregistrerHoraires");
    if (!btn) return;
    var d = diffHoraires(), n = d.modifs.length + d.nouveaux.length + d.supprimes.length;
    btn.innerHTML = "Enregistrer" + (n ? ' <span class="compte-modifs">' + n + "</span>" : "");
  }

  // Refus avant envoi : champ manquant, heures à l'envers, après-midi à
  // moitié rempli, périodes qui se chevauchent (un jour aurait alors 2
  // horaires). Renvoie [{ cle, message }] ; vide = tout est bon.
  function erreursHoraires() {
    var erreurs = [];
    horairesEdition.forEach(function (h) {
      var nom = "La période du " + dateCourte_(h.du) + " au " + dateCourte_(h.au);
      if (!h.du || !h.au) erreurs.push({ cle: h.cle, message: "Une période n’a pas ses 2 dates." });
      else if (h.au < h.du) erreurs.push({ cle: h.cle, message: nom + " finit avant de commencer." });
      else if (!/^\d{1,3}$/.test(String(h.pause))) erreurs.push({ cle: h.cle, message: nom + " : la pause doit être un nombre de minutes (0 si aucune)." });
      else if (!dureeMatin(h)) erreurs.push({ cle: h.cle, message: nom + " : l’horaire du matin est incomplet ou à l’envers." });
      else if (!!h.apremDebut !== !!h.apremFin || (h.apremDebut && !dureeDemi(h.apremDebut, h.apremFin))) erreurs.push({ cle: h.cle, message: nom + " : l’horaire de l’après-midi est incomplet ou à l’envers (laisser les 2 cases vides s’il n’y a pas d’après-midi)." });
    });
    if (erreurs.length) return erreurs;
    // Comparée à la période qui finit le plus tard jusqu'ici (pas seulement
    // à la voisine) : une longue période qui en couvre plusieurs courtes
    // est repérée avec chacune d'elles.
    var tries = horairesEdition.slice().sort(function (a, b) { return a.du < b.du ? -1 : a.du > b.du ? 1 : 0; });
    var plusLongue = tries[0];
    for (var i = 1; i < tries.length; i++) {
      if (tries[i].du <= plusLongue.au) {
        erreurs.push({ cle: tries[i].cle, message: "Les périodes du " + dateCourte_(plusLongue.du) + " au " + dateCourte_(plusLongue.au) + " et du " + dateCourte_(tries[i].du) + " au " + dateCourte_(tries[i].au) + " se chevauchent." });
        erreurs.push({ cle: plusLongue.cle, message: "" });
      }
      if (tries[i].au > plusLongue.au) plusLongue = tries[i];
    }
    return erreurs;
  }

  function celluleDureeHtml_(heures) { return heures ? formatDureeHhmm_(heures) : "—"; }
  function ligneHoraireHtml_(h) {
    var champ = function (nom, type, libelle) {
      return '<label class="hc hc-' + nom + '"><span class="hc-lib">' + libelle + '</span><input type="' + type + '"' + (type === "time" ? ' step="300"' : type === "number" ? ' min="0" max="120" step="5" inputmode="numeric" title="Pause retirée du matin, en minutes"' : "") + ' data-champ="' + nom + '" value="' + esc(h[nom] || "") + '"></label>';
    };
    return '<div class="horaire-ligne' + (h.aVerifier ? " a-verifier" : "") + '" data-cle="' + h.cle + '"' + (h.aVerifier ? ' title="Copiée de l’année précédente : jour seul ou tombé un week-end, à vérifier."' : "") + ">" +
      champ("du", "date", "Du") + champ("au", "date", "Au") +
      champ("matinDebut", "time", "Matin, début") + champ("matinFin", "time", "Matin, fin") + champ("pause", "number", "Pause (min)") +
      '<span class="hc hc-duree" data-duree="matin"><span class="hc-lib">Durée</span><b>' + celluleDureeHtml_(dureeMatin(h)) + "</b></span>" +
      champ("apremDebut", "time", "Après-midi, début") + champ("apremFin", "time", "Après-midi, fin") +
      '<span class="hc hc-duree" data-duree="aprem"><span class="hc-lib">Durée</span><b>' + celluleDureeHtml_(dureeDemi(h.apremDebut, h.apremFin)) + "</b></span>" +
      '<span class="hc hc-total" data-duree="total"><span class="hc-lib">Par jour</span><b>' + formatDuree(dureeHoraire(h)) + "</b></span>" +
      '<button type="button" class="hc-suppr" title="Supprimer cette période" aria-label="Supprimer cette période">' + ICONS.trash + "</button>" +
      "</div>";
  }

  function renderHoraires() {
    if (!horairesEdition) copierHorairesServeur_();
    document.getElementById("horaireAnneeLabel").textContent = horairesAnnee;
    document.getElementById("btnCopierHoraires").innerHTML = "Copier<span class=\"lib-long\"> depuis</span> " + (horairesAnnee - 1);
    var debutAnnee = horairesAnnee + "-01-01", finAnnee = horairesAnnee + "-12-31";
    var visibles = horairesEdition.filter(function (h) {
      // Une période neuve encore sans dates reste visible là où on l'a créée.
      if (!h.du || !h.au) return h.anneeCreation === horairesAnnee;
      return h.du <= finAnnee && h.au >= debutAnnee;
    }).sort(function (a, b) { return (a.du || "9") < (b.du || "9") ? -1 : (a.du || "9") > (b.du || "9") ? 1 : 0; });
    var zone = document.getElementById("horairesListe");
    zone.innerHTML = visibles.length
      ? '<div class="horaire-entete"><span class="he-dates">Période</span><span class="he-demi he-matin">Matin (pause déduite)</span><span class="he-demi">Après-midi</span><span class="he-total">Par jour</span></div>' +
        visibles.map(ligneHoraireHtml_).join("")
      : '<p class="horaires-vide">Aucun horaire pour ' + horairesAnnee + ". « Ajouter une période » pour commencer.</p>";
    zone.querySelectorAll(".horaire-ligne").forEach(function (ligne) {
      var h = horairesEdition.filter(function (x) { return String(x.cle) === ligne.dataset.cle; })[0];
      ligne.querySelectorAll("input").forEach(function (inp) {
        // Pas de nouveau rendu pendant la saisie (il ferait perdre le
        // focus au milieu d'une date) : seules les durées de la ligne sont
        // recalculées. Le tri se refait au prochain rendu.
        inp.addEventListener("input", function () {
          h[inp.dataset.champ] = inp.value;
          ligne.classList.remove("erreur");
          ligne.querySelector('[data-duree="matin"] b').textContent = celluleDureeHtml_(dureeMatin(h));
          ligne.querySelector('[data-duree="aprem"] b').textContent = celluleDureeHtml_(dureeDemi(h.apremDebut, h.apremFin));
          ligne.querySelector('[data-duree="total"] b').textContent = formatDuree(dureeHoraire(h));
          majCompteModifsHoraires();
        });
      });
      ligne.querySelector(".hc-suppr").addEventListener("click", function () {
        horairesEdition = horairesEdition.filter(function (x) { return x !== h; });
        renderHoraires();
      });
    });
    majCompteModifsHoraires();
  }

  // Nouvelle période : commence le lendemain de la dernière période de
  // l'année affichée (ou le 1er janvier) et finit en fin de ce mois, avec
  // les horaires de cette dernière période — sur la feuille, une période
  // ne change souvent que d'1/4 d'heure par rapport à la précédente.
  function ajouterPeriodeHoraire() {
    var finAnnee = horairesAnnee + "-12-31";
    var precedentes = horairesEdition.filter(function (h) { return h.au && h.du && h.du <= finAnnee && h.au >= horairesAnnee + "-01-01"; })
      .sort(function (a, b) { return a.au < b.au ? -1 : 1; });
    var derniere = precedentes[precedentes.length - 1];
    var debut = new Date(horairesAnnee, 0, 1);
    if (derniere) { debut = new Date(derniere.au + "T00:00:00"); debut.setDate(debut.getDate() + 1); }
    var du = isoDate_(debut) > finAnnee ? "" : isoDate_(debut);
    var au = du ? isoDate_(new Date(debut.getFullYear(), debut.getMonth() + 1, 0)) : "";
    horairesEdition.push({
      cle: prochaineCleHoraire++, id: null, anneeCreation: horairesAnnee, du: du, au: au,
      matinDebut: derniere ? derniere.matinDebut : "07:00", matinFin: derniere ? derniere.matinFin : "12:00",
      apremDebut: derniere ? derniere.apremDebut : "13:00", apremFin: derniere ? derniere.apremFin : "17:00",
      pause: derniere ? derniere.pause : "15"
    });
    renderHoraires();
    var lignes = document.querySelectorAll("#horairesListe .horaire-ligne");
    var nouvelle = lignes[lignes.length - 1];
    if (nouvelle) { nouvelle.scrollIntoView({ block: "nearest" }); nouvelle.classList.add("nouvelle"); }
  }

  // Copier les horaires de l'année précédente (round du 25.09.2026, suite
  // 28) — Lionel : « Possibilité de copier les horaires d'une année à
  // l'autre pour éviter de tout rentrer. »
  // Règle, dans cet ordre :
  //  1. mêmes dates au calendrier (« du 2 au 31 mars » → « du 2 au 31
  //     mars »), période coupée aux bornes de l'année ; un 29 février
  //     devient le 28. Les horaires de la feuille changent au fil des mois
  //     (saisons) : garder les dates évite toute dérive d'une année à
  //     l'autre, contrairement à un décalage de 52 semaines qui recule
  //     d'1 ou 2 jours chaque année ;
  //  2. une coupure entre 2 périodes qui ne contenait QUE des jours de
  //     week-end ou des fériés (catégorie « Férié » de la page Fériés)
  //     l'année source est refermée : la période suivante commence au 1er
  //     jour ouvré (ni week-end, ni férié s'il est déjà saisi) après la fin
  //     de la précédente. Sans ça, les jours de la semaine ayant glissé,
  //     « du 2 mars » (lundi en 2026) laisserait le lundi 1er mars 2027
  //     sans horaire, et « du 4 mai » (après le vendredi 1er mai férié) le
  //     lundi 3 mai 2027. Les vacances entreprise ne comptent PAS comme
  //     fériés : leur coupure reste ;
  //  3. les autres coupures (vacances, ponts) restent aux mêmes dates : à
  //     vérifier, comme les périodes d'un seul jour (veille de vacances,
  //     17 juillet 2026) qui peuvent tomber un week-end l'année suivante —
  //     ces lignes sont surlignées (.a-verifier).
  // Rien n'est écrit avant Enregistrer, comme toute modification de la page.
  function estOuvre_(d, feries) { return d.getDay() !== 0 && d.getDay() !== 6 && !feries[isoDate_(d)]; }
  function joursOuvresEntre_(debutIso, finIso, feries) {
    // Nombre de jours ouvrés STRICTEMENT entre 2 dates.
    var n = 0, d = new Date(debutIso + "T00:00:00"), fin = new Date(finIso + "T00:00:00");
    d.setDate(d.getDate() + 1);
    while (d < fin) { if (estOuvre_(d, feries)) n++; d.setDate(d.getDate() + 1); }
    return n;
  }
  function premierOuvreApres_(iso, feries) {
    var d = new Date(iso + "T00:00:00");
    do { d.setDate(d.getDate() + 1); } while (!estOuvre_(d, feries));
    return isoDate_(d);
  }
  function lendemain_(iso) { var d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + 1); return isoDate_(d); }
  function versAnnee_(iso, annee) {
    var md = iso.slice(5);
    if (md === "02-29" && !(annee % 4 === 0 && (annee % 100 !== 0 || annee % 400 === 0))) md = "02-28";
    return annee + "-" + md;
  }
  function aUnJourOuvre_(du, au) {
    var d = new Date(du + "T00:00:00"), fin = new Date(au + "T00:00:00");
    for (; d <= fin; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0 && d.getDay() !== 6) return true;
    return false;
  }
  function periodesDeLAnnee_(annee) {
    var debut = annee + "-01-01", fin = annee + "-12-31";
    return horairesEdition.filter(function (h) { return h.du && h.au && h.du <= fin && h.au >= debut; });
  }
  function copierAnneePrecedente() {
    var source = horairesAnnee - 1, cible = horairesAnnee;
    var debutSource = source + "-01-01", finSource = source + "-12-31";
    var feries = {};
    (etat.feriesServeur || []).forEach(function (f) { if (f.categorie === "ferie") feries[f.iso] = true; });
    var periodes = periodesDeLAnnee_(source).map(function (h) {
      return Object.assign({}, h, { du: h.du < debutSource ? debutSource : h.du, au: h.au > finSource ? finSource : h.au });
    }).sort(function (a, b) { return a.du < b.du ? -1 : 1; });
    if (!periodes.length) { toast("Aucun horaire en " + source + " à copier."); return; }
    var copies = [];
    periodes.forEach(function (h, i) {
      var du = versAnnee_(h.du, cible), au = versAnnee_(h.au, cible);
      var prec = copies[copies.length - 1];
      if (prec) {
        if (i > 0 && joursOuvresEntre_(periodes[i - 1].au, h.du, feries) === 0) {
          var ouvre = premierOuvreApres_(prec.au, feries);
          if (ouvre < du) du = ouvre;
        }
        if (du <= prec.au) du = lendemain_(prec.au); // 29 février ramené au 28
      }
      if (du > au) return;
      copies.push({
        cle: prochaineCleHoraire++, id: null, du: du, au: au,
        matinDebut: h.matinDebut, matinFin: h.matinFin, apremDebut: h.apremDebut, apremFin: h.apremFin, pause: h.pause,
        aVerifier: !aUnJourOuvre_(du, au) || du === au
      });
    });
    function appliquer() {
      // Les périodes de l'année cible sont remplacées. Une période à cheval
      // sur 2 années (ex. du 21.12 au 08.01) n'est que raccourcie : sa partie
      // hors de l'année cible est gardée, pas effacée avec le reste.
      var debutCible = cible + "-01-01", finCible = cible + "-12-31";
      horairesEdition = horairesEdition.filter(function (h) {
        if (!h.du && h.anneeCreation === cible) return false;
        if (!h.du || !h.au || h.du > finCible || h.au < debutCible) return true;
        if (h.du < debutCible) { h.au = source + "-12-31"; return true; }
        if (h.au > finCible) { h.du = (cible + 1) + "-01-01"; return true; }
        return false;
      }).concat(copies);
      renderHoraires();
      var aVerifier = copies.filter(function (c) { return c.aVerifier; }).length;
      toast(copies.length + " période" + (copies.length > 1 ? "s" : "") + " copiée" + (copies.length > 1 ? "s" : "") + " depuis " + source + "." +
        (aVerifier ? " " + aVerifier + " à vérifier (surlignée" + (aVerifier > 1 ? "s" : "") + ") : jour seul ou tombé un week-end." : "") +
        " Vérifie les vacances, puis Enregistrer.");
    }
    var nbExistantes = periodesDeLAnnee_(cible).length;
    if (nbExistantes) demanderConfirmation("Remplacer les " + nbExistantes + " période" + (nbExistantes > 1 ? "s" : "") + " de " + cible + " par celles de " + source + " ? (Rien n’est enregistré avant Enregistrer.)", appliquer);
    else appliquer();
  }

  function enregistrerHoraires() {
    var erreurs = erreursHoraires();
    document.querySelectorAll("#horairesListe .horaire-ligne").forEach(function (l) {
      l.classList.toggle("erreur", erreurs.some(function (e) { return String(e.cle) === l.dataset.cle; }));
    });
    if (erreurs.length) { toast(erreurs[0].message); return; }
    var d = diffHoraires();
    if (!d.modifs.length && !d.nouveaux.length && !d.supprimes.length) { toast("Rien à enregistrer."); return; }
    enregistrerHorairesServeur(d.modifs, d.nouveaux, d.supprimes).then(function () {
      copierHorairesServeur_();
      renderHoraires();
      render(false); // les horaires du planning ont pu changer
      toast("Horaires enregistrés.");
    }).catch(function (err) { toast("Échec de l’enregistrement : " + (err && err.message ? err.message : err)); });
  }

  function cablerPageHoraires() {
    document.getElementById("horaireAnneePrec").addEventListener("click", function () { horairesAnnee--; renderHoraires(); });
    document.getElementById("horaireAnneeSuiv").addEventListener("click", function () { horairesAnnee++; renderHoraires(); });
    document.getElementById("btnAjouterHoraire").addEventListener("click", ajouterPeriodeHoraire);
    document.getElementById("btnCopierHoraires").addEventListener("click", copierAnneePrecedente);
    document.getElementById("btnEnregistrerHoraires").addEventListener("click", enregistrerHoraires);
  }
