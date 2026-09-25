"use strict";
  /* ============================================================
     RÉINTÉGRATION V2 — aperçu d'impression / PDF
     ------------------------------------------------------------
     Fonctionnalité réelle de production (usage hebdomadaire de Lionel) que
     le portage V3 avait fait disparaître : le prototype V3 (bulles)
     n'avait jamais eu à la concevoir, donc rien à en porter — elle est
     reprise depuis l'ancien Index.html V2 (conservé dans le Projet Claude,
     chemin claude/Index.html) et adaptée aux conventions de ce fichier
     (TACHES/JALONS/NOTES reconstruits depuis etat.cache, modale
     .pop/.voile-confirm au lieu des "sheets" plein écran de V2,
     gsP()/toast() au lieu de gs()/showToast()). Logique métier ET contrat
     serveur INCHANGÉS (apiGenererPdf, toujours présente telle quelle dans
     WebApp.gs) — seul l'habillage client change.
     Le décalage en masse et l'assignation groupée, réintégrés au même
     moment depuis V2, ont ensuite été retirés à la demande explicite de
     Lionel : *"plus besoin du décalage en masse grâce à la sélection
     multiple de la nouvelle feuille. plus besoin de l'assignation groupée
     non plus."* — la sélection multiple de bulles de V3 (copier/déplacer
     un groupe de bulles, cf. la barre d'action) couvre désormais ces deux
     usages. `apiApercuDecalage`/`apiAppliquerDecalage`/
     `apiAttribuerChantierGroupe` restent intactes côté serveur (WebApp.gs)
     mais ne sont plus appelées par ce fichier — cf. FRONTEND-CHANGELOG.md
     §5 pour le détail.
     ============================================================ */

  // Une case (forme serveur brute — cf. apiChargerSemaine, PAS une bulle
  // TACHES/JALONS/NOTES) est "vide" si elle n'a ni chantier ni tâche avec
  // du texte. Utilisé par l'aperçu d'impression pour masquer les personnes
  // sans rien cette semaine-là (cf. openPrintSheet).
  function personneVide(p) {
    var cells = (p.matin || []).concat(p.aprem || []);
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].chantier || (cells[i].taches && cells[i].taches.length > 0)) return false;
    }
    return true;
  }
  // detailJoint/fondCase (couleur de fond UNIQUE par case, absence > chantier
  // > transparent) ont existé jusqu'au round du 16.09.2026 — retirées avec
  // le passage à Option A (bande de couleur par tâche, cf. infoCase plus
  // bas) : la couleur ne se décide plus au niveau de LA CASE mais de CHAQUE
  // tâche individuellement, `detailJoint` (texte joint de toutes les tâches,
  // pour une détection d'absence globale à la case) n'a donc plus de sens.

  /* ============ DÉCALER LE PLANNING EN MASSE — RETIRÉ ============
     Fonctionnalité retirée à la demande de Lionel (cf. commentaire en tête
     de cette section) : la sélection multiple de bulles de V3 couvre
     désormais ce besoin. Fonctions supprimées : apresEcritureDepuis,
     ouvrirDecalagePlanning_, ouvrirApercuDecalage_. apiApercuDecalage/
     apiAppliquerDecalage restent intactes côté serveur si jamais ce choix
     était reconsidéré plus tard. */
  /* ============ APERÇU D'IMPRESSION + GÉNÉRATION PDF ============
     Déclenché par le bouton "Imprimer" de la barre du planning. Travaille
     directement sur la forme serveur brute de la semaine affichée
     (etat.cache[labG] — PAS les bulles TACHES/JALONS/NOTES reconstruites)
     : c'est exactement ce que la vraie feuille imprime, donc c'est la
     source la plus sûre pour un aperçu fidèle, indépendante du moteur de
     bulles. apiGenererPdf(labG) est INCHANGÉE côté serveur — ce fichier
     relaie juste son résultat. */
  // Choix « Afficher les horaires » de l'aperçu d'impression (suite 27) :
  // retenu par appareil (localStorage), comme un réglage d'affichage ; coché
  // si rien n'est retenu ou si le stockage est indisponible.
  var CLE_HORAIRES_IMPRESSION = "planning.impression.horaires";
  function lireOptionHorairesImpression_() {
    try { return localStorage.getItem(CLE_HORAIRES_IMPRESSION) !== "0"; } catch (e) { return true; }
  }
  // Réglages de l'aperçu d'impression — round du 25.09.2026 (suite 38).
  // Lionel : « Améliore la page impression pour pouvoir modifier
  // manuellement divers réglages. Afficher ou non certaines données. »
  // Ses choix (questions posées) : masquer/afficher Jalons, Notes,
  // Intervenants, et personne par personne ; Légende des chantiers,
  // Statuts des intervenants, Couleurs des chantiers (« Si les couleurs
  // sont enlevées, prévoir de noter le nom du chantier »), Personnes sans
  // tâche ; Orientation, Taille du texte, Titre libre ; réglages
  // « Retenus » sur l'appareil, avec un bouton Réinitialiser.
  // Un seul objet JSON en localStorage. La case « Horaires » (suite 27)
  // en fait partie ; son ancienne clé reste lue (réglage déjà retenu avant
  // cette suite) et tenue à jour.
  // masques : { ancre de la personne: true } pour chaque personne décochée.
  // Suite 39 (même jour) — Lionel : « C'est peut-être plus judicieux de
  // faire un onglet mise en pages. Et garde que les réglage à cocher dans
  // la feuille impression. » Orientation, taille du texte et titre libre
  // (devenu le texte libre de l'en-tête) sont partis dans l'onglet Mise en
  // page (js/page-mise-en-page.js, lireMiseEnPage) ; ici ne restent que
  // les cases à cocher. Les anciennes valeurs encore retenues sous cette
  // clé y sont reprises une fois (miseEnPageDepuisSuite38_).
  var CLE_REGLAGES_IMPRESSION = "planning.impression.reglages";
  function reglagesImpressionDefaut_() {
    return { horaires: true, jalons: true, notes: true, personnel: true, intervenants: true, legende: true, statuts: true,
      couleurs: true, vides: false, masques: {} };
  }
  function lireReglagesImpression_() {
    var r = reglagesImpressionDefaut_();
    try {
      var lu = JSON.parse(localStorage.getItem(CLE_REGLAGES_IMPRESSION) || "null");
      if (lu && typeof lu === "object") {
        Object.keys(r).forEach(function (k) { if (lu[k] != null && typeof lu[k] === typeof r[k]) r[k] = lu[k]; });
      } else {
        r.horaires = lireOptionHorairesImpression_();
      }
    } catch (e) {}
    return r;
  }
  function ecrireReglagesImpression_(r) {
    try {
      localStorage.setItem(CLE_REGLAGES_IMPRESSION, JSON.stringify(r));
      localStorage.setItem(CLE_HORAIRES_IMPRESSION, r.horaires ? "1" : "0");
    } catch (e) {}
  }
  function openPrintSheet() {
    var labG = labGCourant();
    var data = etat.cache[labG];
    if (!data) { toast("Cette semaine n’est pas encore chargée — réessaie."); return; }
    var jl = JOURS.map(function (j, i) { return { j: j, d: data.dates[i], m: data.mois[i], iso: data.isoDates[i] }; });

    // round du 15.09.2026 — Lionel, sur l'aperçu impression : "les dates ne
    // sont pas complètes, on ne voit ni le mois ni l'année [...] rajouter
    // une ligne mois, l'année peut être placée dans la cellule haut
    // gauche". data.mois[i]/data.isoDates[i] existaient déjà (repris tels
    // quels d'infosSemaineDepuisLabG) mais n'étaient jusqu'ici affichés
    // nulle part dans l'aperçu — seul "Lun 14" apparaissait, ambigu dès
    // qu'on ressort une impression après coup (quel mois ? quelle année ?).
    // Regroupe les jours CONSÉCUTIFS du même mois (une semaine de 5 jours
    // ouvrés ne chevauche 2 mois qu'en fin de mois — ex. jeu 30/ven 31 août
    // -> lun 1er/mar 2/mer 3 septembre) pour un colspan par groupe plutôt
    // qu'un mois répété identique sur chaque colonne.
    var groupesMois = [];
    jl.forEach(function (j) {
      var moisPlein = MOIS_FR[parseInt(j.iso.slice(5, 7), 10) - 1];
      var dernier = groupesMois[groupesMois.length - 1];
      if (dernier && dernier.mois === moisPlein) dernier.span++;
      else groupesMois.push({ mois: moisPlein, span: 1 });
    });
    // Année(s) de la cellule en haut à gauche : la quasi-totalité du temps
    // une seule ("2026") ; à cheval sur le nouvel an (semaine du dernier
    // lundi de décembre), les 2 sont affichées ("2026 / 2027") plutôt que
    // de trancher arbitrairement pour l'une des deux.
    var anneesSemaine = [];
    jl.forEach(function (j) { var a = j.iso.slice(0, 4); if (anneesSemaine.indexOf(a) === -1) anneesSemaine.push(a); });

    // round du 15.09.2026 (suite) — Lionel : "L'ordre sur le pdf doit être
    // celui à l'écran". La grille compacte affiche 2 sections successives,
    // Personnel puis Intervenants (cf. construireGrille : groupePersonnel/
    // groupeIntervenants juste avant ligneSection, lignes ~6237) — alors
    // que data.personnes est simplement trié par le champ "ordre" côté
    // serveur, qui peut très bien entremêler personnel et sous-traitants.
    // On reproduit ici le même regroupement (p.sousTraitant est déjà
    // disponible sur cette forme de données, cf. construireVueDepuisCache).
    // Réglages d'impression (suite 38) : la liste imprimée dépend désormais
    // des cases cochées (intervenants, personne par personne, personnes
    // sans tâche) — calculée par personnesImprimees_(r) à chaque
    // reconstruction de l'aperçu. Rôles d'équipe connus d'avance sur la
    // liste COMPLÈTE : un membre sans rien à lui ne sort jamais, même avec
    // « Personnes sans tâche » (ses tâches sont sur la ligne d'équipe).
    var lundiImpr = (data.isoDates || [])[0];
    var idImpr = function (p) { return String(p.ancre); };
    var personnelTous = (data.personnes || []).filter(function (p) { return !p.sousTraitant; });
    var intervenantsTous = (data.personnes || []).filter(function (p) { return p.sousTraitant; });
    var ordreComplet = ordrePersonnesEquipes(personnelTous, lundiImpr, idImpr).concat(intervenantsTous.map(function (p) { return { p: p, role: null }; }));
    var roleComplet = {};
    ordreComplet.forEach(function (e) { roleComplet[idImpr(e.p)] = e.role; });
    function personnesImprimees_(r) {
      var sautees = 0, decochees = 0;
      function garde(p) {
        if (p.sousTraitant && !r.intervenants) return false;
        if (!p.sousTraitant && !r.personnel) return false;
        if (personneVide(p) && !(r.vides && roleComplet[idImpr(p)] !== "membre")) { sautees++; return false; }
        if (r.masques[idImpr(p)]) { decochees++; return false; }
        return true;
      }
      var imprimesTous = (data.personnes || []).filter(garde);
      // Équipes (round du 25.09.2026, suite 33) — Lionel : impression « Une
      // ligne par équipe ». Même ordre qu'à l'écran : chaque équipe suivie de
      // ses membres de CETTE semaine, puis le personnel hors équipe (cf.
      // ordrePersonnesEquipes, js/equipes.js). La ligne d'équipe porte les
      // tâches de toute l'équipe ; un membre n'a sa propre ligne que s'il a
      // quelque chose à lui (absence, tâche ailleurs) — les autres sont
      // sautés par personneVide, comme n'importe qui.
      var roleImpr = {};
      var imprPersonnel = ordrePersonnesEquipes(imprimesTous.filter(function (p) { return !p.sousTraitant; }), lundiImpr, idImpr)
        .map(function (e) { roleImpr[idImpr(e.p)] = e.role; return e.p; });
      var imprIntervenants = imprimesTous.filter(function (p) { return p.sousTraitant; });
      return { personnel: imprPersonnel, intervenants: imprIntervenants, role: roleImpr, sautees: sautees, decochees: decochees };
    }

    // Horaires de la semaine (suite 27, cf. la ligne « Horaires » plus bas),
    // hors de construireDocImpression_ : le panneau de réglages en a
    // besoin aussi (case « Horaires » seulement s'il y en a).
    var horairesSemaine = jl.map(function (j) { return horaireDuJour(j.iso); });
    var aDesHoraires = horairesSemaine.some(function (x) { return !!x; });
    // construireDocImpression_(r) — suite 38 : tout le contenu de
    // .print-doc (tableau, légende, mention des personnes masquées) selon
    // les réglages `r`, reconstruit à chaque changement. Le titre libre de
    // la suite 38 est devenu le texte libre de l'en-tête (suite 39).
    function construireDocImpression_(r) {
      var h = '';
      // NB_COLS : 1 colonne "nom" + 2 sous-colonnes (matin/aprem) par jour —
      // toute cellule qui doit couvrir la largeur entière du tableau
      // (spacers, colspan de secours) s'appuie sur cette constante plutôt
      // qu'un nombre en dur, pour ne plus jamais désynchroniser un colspan
      // si le nombre de jours affichés change un jour.
      var NB_COLS = 1 + jl.length * 2;
      h += '<table class="print-table">';
      // Colonnes (suite 44, onglet Mise en page) : noms, puis matin/aprem de
      // chaque jour — largeurs fixes posées en CSS (.noms-fixe/.jours-fixes
      // sur .print-doc), rien sinon (partage selon le contenu, comme avant).
      h += '<colgroup><col class="col-noms">' + jl.map(function () { return '<col class="col-demi"><col class="col-demi">'; }).join('') + '</colgroup><thead>';
      // round du 15.09.2026 (suite) — Lionel : "j'aimerai bien l'affichage
      // matin/après-midi côte à côte, comme le planning". La grille compacte
      // (planning à l'écran) place déjà matin et aprem à côté l'un de
      // l'autre plutôt que sur 2 lignes — l'aperçu impression, jusqu'ici,
      // faisait l'inverse (cf. plus bas : 1 ligne "matin" + 1 ligne "aprem"
      // par personne). Reprend le même principe qu'à l'écran : chaque jour
      // devient 2 SOUS-COLONNES ("th colspan=2" pour son en-tête), chaque
      // personne tient sur UNE SEULE ligne. Jalons/notes : longtemps restés
      // au niveau du JOUR (colspan=2 d'office), ils suivent désormais leur
      // demi-journée comme à l'écran — cf. segmentsDemiImpression_ plus bas
      // (round du 25.09.2026, suite 35).
      h += '<tr class="print-mois"><th class="coin-annee">' + esc(anneesSemaine.join(" / ")) + '</th>';
      groupesMois.forEach(function (g) { h += '<th colspan="' + (g.span * 2) + '">' + esc(g.mois) + '</th>'; });
      h += '</tr>';
      // round du 15.09.2026 (suite) — Lionel : "Inscription semaine N dans la
      // case sous l'année". Cette case de coin (rowspan=2, sous "2026")
      // était vide jusqu'ici ; elle prend maintenant le numéro de semaine —
      // d'autant plus utile que "Aperçu impression — semaine N" (le titre de
      // la modale, cf. cp-titre plus haut) ne s'imprime plus (cf. @media
      // print, "pas besoin de aperçu avant impression - semaine N") : sans
      // ça, le numéro de semaine aurait disparu du document imprimé.
      h += '<tr><th rowspan="2" class="coin-semaine">Semaine ' + esc(data.numero) + '</th>';
      jl.forEach(function (j) { h += '<th colspan="2">' + j.j + ' ' + j.d + '</th>'; });
      h += '</tr>';
      h += '<tr class="print-demis">';
      // .demi-matin / .demi-aprem : les 2 côtés de la frontière pointillée
      // (suite 30, cf. leur CSS — chacun déclare « dotted » de son côté).
      jl.forEach(function () { h += '<th class="demi-matin">Matin</th><th class="demi-aprem">Aprem</th>'; });
      h += '</tr>';
      // Ligne des horaires (round du 25.09.2026, suite 27) — Lionel : « Sur la
      // page d'impression. On rajoute une ligne sous matin et après-midi pour
      // afficher les horaires du matin et de l'après-midi. Une case à cocher
      // sur la page impression permet d'afficher ou non les horaires. » Même
      // source que le planning (horaireDuJour, page-horaires.js). Posée
      // seulement si au moins un jour de la semaine a un horaire ; la case à
      // cocher (en bas de la fenêtre) masque la ligne à l'écran ET au papier.
      if (aDesHoraires) {
        h += '<tr class="print-horaires"><th class="coin-horaires">Horaires</th>';
        horairesSemaine.forEach(function (x) {
          h += '<th class="demi-matin">' + (x ? esc(x.matin) : '') + '</th><th class="demi-aprem">' + (x ? esc(x.aprem || '—') : '') + '</th>';
        });
        h += '</tr>';
      }
      h += '</thead><tbody>';

      // round du 15.09.2026 (suite, suite, suite) — Lionel : "ajoute les
      // libellé jalon et note dans la colonne gauche" (même demande, et
      // mêmes libellés "Jalons"/"Notes", que sur la grille compacte à
      // l'écran — cf. construireGrille, "Titre de ligne" — pour la même
      // raison : sans repère textuel, la colonne de gauche ne dit plus quelle
      // ligne est quoi une fois qu'on ne voit plus la légende de couleurs).
      // Round du 16.09.2026 (suite) — Lionel : "il reste le mot 'note' dans
      // l'imprimé. le supprimer." Revient uniquement sur "Notes" (cf. plus bas,
      // print-notes) : "Jalons" reste, lui, toujours demandé et donc affiché.
      // round du 16.09.2026 — Lionel : "tout jalons identique doit être lié".
      // Jusqu'ici chaque JOUR avait sa propre cellule (colspan=2, un jalon
      // n'ayant qu'un texte par jour, pas de granularité demi comme les cases
      // personne) — 2 jours consécutifs portant le même texte de jalon (ex:
      // "Maçonnerie" 3 jours de suite) s'affichaient donc comme des cases
      // identiques mais séparées par une bordure de jour banale, comme si
      // c'étaient 2 jalons différents qui coïncidaient par hasard. Même
      // principe de fusion que celui déjà utilisé pour matin/aprem d'une case
      // personne (infoCase/celluleTache un peu plus bas, portage mockup round
      // 12) mais appliqué ici ENTRE PLUSIEURS JOURS consécutifs plutôt
      // qu'entre les 2 demis d'un même jour : une seule cellule fusionnée
      // (colspan = 2 × nombre de jours du groupe) recouvre toute la série,
      // sans bordure interne — un seul jalon continu plutôt que des jalons
      // identiques mais visuellement découpés jour par jour. Comme pour la
      // fusion matin/aprem, seuls les jalons NON VIDES se fusionnent : 2 jours
      // sans jalon ne "partagent" rien, donc restent des cases distinctes
      // (mêmes choix, même raisonnement que le commentaire de infoCase plus
      // bas).
      //
      // segmentsDemiImpression_ / lignesDemiImpression_ — round du 25.09.2026
      // (suite 35). Lionel, captures à l'appui : « Comportement anormal des
      // notes qui se trouvent sur des lignes différentes sur le planning. En
      // impression les notes sont regroupées sous le même jour. » Le mercredi,
      // « Remorque plateau » (matin) et « Tri déchets dépôt » (après-midi)
      // sortaient dans UNE seule case « journée » (textes joints par <br>), et
      // « Libérer garage BINE » (jeudi matin) couvrait tout le jeudi : la
      // demi-journée (n.demi, posée depuis le §47) était lue par le planning
      // mais jamais par l'impression. Les jalons avaient la même lacune (fusion
      // « tout jalons identique doit être lié » au jour près, demi ignorée).
      // Même découpe que construireVueDepuisCache (js/donnees-sync.js) pour
      // que papier et écran coïncident : une entrée démarre un segment, qui se
      // prolonge au jour suivant tant qu'on y retrouve le même texte (même
      // important, même chantier pour un jalon), sans franchir la fin d'une
      // occurrence de série, et seuls les 2 BORDS du segment peuvent être une
      // demi-journée. Les bornes passent ensuite en demi-slots
      // (demiSlotsDepuisBornes, js/grille-rendu.js : matin du jour i = 2i,
      // après-midi = 2i+1) — une case couvre ainsi exactement ses
      // sous-colonnes Matin/Aprem. Les segments sont enfin répartis en
      // lignes (même règle que assignerPistesCompact à l'écran : deux entrées
      // ne se gênent que si elles occupent une même demi-journée), une <tr>
      // par ligne.
      function segmentsDemiImpression_(parJour, avecChantier) {
        var consommes = parJour.map(function () { return {}; });
        function suivante(i, ref) {
          var arr = parJour[i] || [];
          for (var k = 0; k < arr.length; k++) {
            var e = arr[k];
            if (consommes[i][k] || e.texte !== ref.texte || !!e.important !== !!ref.important) continue;
            if (avecChantier && (e.chantierId || null) !== (ref.chantierId || null)) continue;
            return k;
          }
          return -1;
        }
        var segs = [];
        parJour.forEach(function (arr, i) {
          (arr || []).forEach(function (e, k) {
            if (consommes[i][k] || !e.texte) return;
            consommes[i][k] = true;
            var demiCourant = e.demi || null, fin = i;
            var limite = limiteOccurrenceSerie_(e.serieId, data.isoDates[i]);
            while (fin + 1 < parJour.length) {
              if (fin !== i && demiCourant !== null) break;
              if (limite && data.isoDates[fin + 1] >= limite) break;
              var k2 = suivante(fin + 1, e);
              if (k2 === -1) break;
              fin++;
              consommes[fin][k2] = true;
              demiCourant = parJour[fin][k2].demi || null;
            }
            var b = demiSlotsDepuisBornes(i, fin - i + 1, e.demi || null, demiCourant);
            segs.push({ texte: e.texte, important: !!e.important, h0: b.halfStart, h1: b.halfFinIncl });
          });
        });
        return segs;
      }
      function lignesDemiImpression_(segs) {
        var lignes = []; // lignes[l] = { occupe: {h: true}, parDebut: {h0: seg} }
        segs.slice().sort(function (a, b) { return a.h0 - b.h0; }).forEach(function (sg) {
          var l = 0;
          for (; l < lignes.length; l++) {
            var libre = true;
            for (var h = sg.h0; h <= sg.h1 && libre; h++) if (lignes[l].occupe[h]) libre = false;
            if (libre) break;
          }
          if (l === lignes.length) lignes.push({ occupe: {}, parDebut: {} });
          for (var h2 = sg.h0; h2 <= sg.h1; h2++) lignes[l].occupe[h2] = true;
          lignes[l].parDebut[sg.h0] = sg;
        });
        return lignes.length ? lignes : [{ occupe: {}, parDebut: {} }];
      }
      // Une <tr> par ligne ; le libellé de gauche couvre toutes les lignes
      // (rowspan). Case vide : un seul <td colspan=2> pour un jour entièrement
      // libre (rendu identique à avant), une demi-case sinon.
      function rangeesDemiImpression_(classe, libelle, segs) {
        var lignes = lignesDemiImpression_(segs), nbSlots = jl.length * 2, out = "";
        lignes.forEach(function (ligne, l) {
          out += '<tr class="' + classe + '">';
          if (l === 0) out += '<td' + (lignes.length > 1 ? ' rowspan="' + lignes.length + '"' : '') + ' style="font-weight:700;white-space:nowrap">' + libelle + '</td>';
          for (var h = 0; h < nbSlots;) {
            var sg = ligne.parDebut[h];
            if (sg) {
              var span = Math.min(sg.h1, nbSlots - 1) - h + 1;
              var txt = sg.important ? '<span class="print-important">' + esc(sg.texte) + '</span>' : esc(sg.texte);
              out += '<td colspan="' + span + '" class="filled">' + txt + '</td>';
              h += span;
            } else if (h % 2 === 0 && !ligne.occupe[h + 1]) {
              out += '<td colspan="2"></td>';
              h += 2;
            } else {
              out += '<td></td>';
              h += 1;
            }
          }
          out += '</tr>';
        });
        return out;
      }
      // Liste imprimée selon les réglages (cf. personnesImprimees_).
      var liste = personnesImprimees_(r);
      var imprPersonnel = liste.personnel, imprIntervenants = liste.intervenants, roleImpr = liste.role;
      var imprimes = imprPersonnel.concat(imprIntervenants);
      // Index (dans `imprimes`) du dernier "Personnel" avant le 1er
      // "Intervenant" — sert plus bas à insérer une séparation plus large que
      // le spacer ordinaire entre 2 personnes du même groupe (cf.
      // "print-spacer-section" dans le CSS), seulement quand les 2 groupes
      // sont représentés cette semaine-là.
      var indexFrontiereSection = (imprPersonnel.length > 0 && imprIntervenants.length > 0) ? (imprPersonnel.length - 1) : -1;
      // Round du 16.09.2026 (sql/0010_taches_chantier_id.sql — Option A,
      // choisie par Lionel via AskUserQuestion : "bande de couleur par
      // tâche") : chaque tâche de la case a désormais son PROPRE chantier
      // (cell.chantier lui-même n'est plus qu'un repli pour une case sans
      // aucune tâche, cf. celluleVue_) — la légende doit donc parcourir
      // cell.taches, pas seulement cell.chantier, pour ne manquer aucun
      // chantier utilisé quelque part sur la semaine.
      var chantiersUtilises = {};
      imprimes.forEach(function (p) {
        (p.matin || []).concat(p.aprem || []).forEach(function (cell) {
          var taches = (cell && cell.taches) || [];
          if (taches.length) {
            taches.forEach(function (t) {
              var estAbs = !!t.absence || estAbsence(t.texte);
              if (t.chantier && !estAbs) chantiersUtilises[t.chantier] = true;
            });
          } else if (cell && cell.chantier) {
            chantiersUtilises[cell.chantier] = true;
          }
        });
      });
      var notesRemplies = r.notes && (data.notes || []).some(function (n) { return n && n.length > 0; });
      // Jalons masquables (suite 38) : sans eux, pas de spacer de fermeture
      // de leur ligne (print-spacer-jalons) au-dessus des notes.
      var jalonsParJour = (data.jalons || []).map(function (j) { return j && j.texte ? [j] : []; });
      if (r.jalons) h += rangeesDemiImpression_("print-jalons", "Jalons", segmentsDemiImpression_(jalonsParJour, true));

      // Portage mockup (rounds 7-9) — classes print-spacer-jalons/personne
      // (cf. leur commentaire CSS) : le PREMIER spacer qui suit la ligne
      // Jalons porte toujours print-spacer-jalons, que ce soit le spacer
      // avant Notes (si elle est remplie) ou, sinon, directement le spacer
      // avant la 1ère personne juste en dessous — ces 2 cas ne peuvent pas
      // survenir en même temps, donc jamais posée 2 fois.
      if (notesRemplies) {
        // Sans jalons (suite 38) : simple espace sous l'en-tête, sans le
        // trait de fermeture de leur ligne.
        h += '<tr class="print-spacer' + (r.jalons ? ' print-spacer-jalons' : '') + '"><td colspan="' + NB_COLS + '"></td></tr>';
        h += rangeesDemiImpression_("print-notes", "", segmentsDemiImpression_(data.notes || [], false));
      }

      // print-spacer-personne (round 8) : ce spacer précède TOUJOURS la 1ère
      // personne, donc porte toujours cette classe. print-spacer-jalons SE
      // CUMULE dessus seulement si Notes n'a pas déjà pris ce rôle juste
      // au-dessus (sinon ce spacer-ci n'est plus le premier après Jalons).
      h += '<tr class="print-spacer print-spacer-personne' + (notesRemplies || !r.jalons ? '' : ' print-spacer-jalons') + '"><td colspan="' + NB_COLS + '"></td></tr>';

      // classeDemi (round du 15.09.2026, suite — "traitillé entre aprèm et
      // matin") : posée uniquement côté aprem, pour que le CSS (.demi-aprem)
      // ne mette en traitillé QUE la frontière interne matin→aprem, jamais
      // la frontière entre 2 jours (bordure gauche de la case matin du jour
      // suivant, qui elle n'a pas cette classe et reste pleine). Round du
      // 16.09.2026 : portée maintenant sur chaque `.print-bande` plutôt que
      // sur le `<td>` lui-même (cf. commentaire détaillé sur celluleTache
      // ci-dessous) — le sélecteur CSS `.demi-aprem` (générique, sans égard
      // au type d'élément) continue de matcher sans le moindre changement.
      //
      // infoCase/celluleTache (portage mockup round 12 — Lionel : "fait de
      // même entre les matins et après-midi. Fusionner les cases qui
      // comportent la même tâche" — réécrit round du 16.09.2026 pour Option A,
      // "bande de couleur par tâche", choisie par Lionel via AskUserQuestion
      // pour représenter plusieurs chantiers sur une même case à
      // l'impression) : infoCase calcule maintenant un FRAGMENT (bg + texte)
      // par TÂCHE de la case plutôt qu'un seul fond+texte pour toute la case
      // — chaque tâche empilée garde sa propre couleur de chantier, exactement
      // comme sur la grille à l'écran (bulleEl). celluleTache sérialise un
      // <td> unique contenant UN <div class="print-bande"> par fragment
      // (padding déplacé du <td> vers chaque bande, cf. CSS table.print-table
      // td.td-tache/.print-bande) ; la comparaison matin/aprem qui décide de
      // la fusion (fusionnee) porte donc sur le tableau COMPLET des fragments
      // (JSON.stringify), plus seulement sur un texte+fond uniques.
      function infoCase(p, cell) {
        var taches = (cell && cell.taches) || [];
        if (!taches.length) {
          // Case sans aucune tâche : au mieux un chantier de repli (vieille
          // ligne `assignations` jamais réécrite, cf. celluleVue_), sinon
          // fond neutre — toujours UN SEUL fragment, comme n'importe quelle
          // case avant Option A.
          var bg0 = "transparent";
          if (cell && cell.chantier && !r.couleurs) {
            return { fragments: [{ bg: "var(--surface-2)", txt: '<span class="print-chantier">' + esc(cell.chantier) + '</span>' }], empty: true };
          }
          if (cell && cell.chantier) {
            var ch0 = etat.chantierParNom[cell.chantier];
            bg0 = ch0 ? ch0.couleur : "#e5e5e5";
          }
          return { fragments: [{ bg: bg0 === "transparent" ? "var(--surface-2)" : bg0, txt: "" }], empty: true };
        }
        var fragments = taches.map(function (t) {
          // Absence (round du 16.09.2026) : désormais détectée PAR TÂCHE
          // (t.absence, la vraie colonne — cf. tacheVue_), avec le même filet
          // de sécurité estAbsence(texte) qu'ailleurs dans ce fichier, plutôt
          // que sur le texte JOINT de toute la case (l'ancien fondCase/
          // detailJoint, qui ne regardait d'ailleurs jamais la vraie colonne) —
          // cohérent avec la fusion écran (construireVueDepuisCache) et
          // correct puisque chaque tâche a maintenant sa PROPRE bande.
          var estAbs = !!t.absence || estAbsence(t.texte);
          var bg = "transparent";
          if (estAbs) {
            bg = "var(--absence-bg)";
          } else if (t.chantier) {
            var ch = etat.chantierParNom[t.chantier];
            bg = ch ? ch.couleur : "#e5e5e5";
          }
          // Réglages (suite 38). Lionel : « Si les couleurs sont enlevées,
          // prévoir de noter le nom du chantier » — sans couleurs, fond blanc
          // (absences comprises : impression noir et blanc, économie
          // d'encre) et nom du chantier en petit sous le texte de la tâche.
          // Statuts des intervenants (« RÉSERVÉ »…) masquables.
          var nomChantier = "";
          if (!r.couleurs) {
            bg = "transparent";
            if (t.chantier && !estAbs) nomChantier = '<span class="print-chantier">' + esc(t.chantier) + '</span>';
          }
          var badge = (r.statuts && p.sousTraitant && t.statut && STATUTS[t.statut]) ? ' <span class="print-statut" style="background:' + STATUTS[t.statut].couleur + '">' + esc(STATUTS[t.statut].nom) + '</span>' : "";
          var ouvre = t.important ? '<span class="print-important">' : "";
          var ferme = t.important ? '</span>' : "";
          return { bg: bg === "transparent" ? "var(--surface-2)" : bg, txt: ouvre + esc(t.texte) + ferme + badge + nomChantier };
        });
        return { fragments: fragments, empty: false };
      }
      // Fond du <td> = couleur de la DERNIÈRE bande (round du 16.09.2026,
      // 2e essai — un premier essai avec un wrapper flex height:100% s'est
      // avéré ne PAS marcher : dans un tableau à hauteur de ligne "auto",
      // aucun descendant statique ne peut se dimensionner en % contre la
      // hauteur d'une cellule, celle-ci n'étant définitive qu'une fois le
      // contenu de TOUTES les cellules de la ligne connu — confirmé par un
      // test isolé où même un simple <div style="height:100%"> restait
      // cantonné à sa propre hauteur de contenu). Un <td>, lui, REMPLIT
      // toujours la hauteur de sa ligne — propriété native de n'importe
      // quelle cellule de tableau, jamais soumise à ce problème. Poser la
      // couleur de la dernière bande directement sur le <td> fait donc
      // "déborder" cette couleur sur tout espace restant sous les bandes
      // (les bandes, opaques, restent dessus et gardent leur propre couleur
      // pour leur propre hauteur) — sans ça, une case à peu de bandes (voire
      // une seule, ex. "Pose parpaings") laissait un bloc blanc parasite sous
      // sa bande dès qu'une AUTRE case du même jour empilait plusieurs tâches
      // et étirait la ligne entière (bug constaté au premier rendu réel de ce
      // round, cf. FRONTEND-CHANGELOG.md). Imperfection mineure acceptée :
      // sur une case à PLUSIEURS bandes de couleurs différentes ET côté aprem
      // (classeDemi), le pointillé .demi-aprem (cf. son commentaire CSS,
      // background-color:inherit) peut reprendre cette couleur de dernière
      // bande sur toute la hauteur plutôt que celle, différente, d'une bande
      // du dessus — un artefact d'1px de large, au bord partagé avec la case
      // voisine, jugé négligeable face à la complexité d'un vrai découpage
      // par bande.
      function celluleTache(info, classeDemi, fusionnee) {
        var bandes = info.fragments.map(function (f) {
          return '<div class="print-bande" style="background:' + f.bg + '">' + f.txt + '</div>';
        }).join("");
        var lastBg = info.fragments[info.fragments.length - 1].bg;
        return '<td class="td-tache' + (classeDemi ? ' ' + classeDemi : '') + '"' + (fusionnee ? ' colspan="2"' : '') + ' style="background:' + lastBg + '">' + bandes + '</td>';
      }

      imprimes.forEach(function (p, idx) {
        h += '<tr>';
        if (roleImpr[String(p.ancre)] === "equipe") {
          var nomsEquipe = membresEquipe(p.ancre, lundiImpr).map(function (id) { var m = personneParAncre(id); return m ? m.nom : null; }).filter(Boolean);
          h += '<td class="print-nom-equipe" style="font-weight:700;white-space:nowrap">' + esc(p.nom) +
            (nomsEquipe.length ? '<span class="print-membres">' + esc(nomsEquipe.join(", ")) + '</span>' : '') + '</td>';
        } else if (roleImpr[String(p.ancre)] === "membre") {
          h += '<td class="print-nom-membre" style="font-weight:600;white-space:nowrap">' + esc(p.nom) + '</td>';
        } else {
          h += '<td style="font-weight:700;white-space:nowrap">' + esc(p.nom) + '</td>';
        }
        for (var i = 0; i < jl.length; i++) {
          var infoMatin = infoCase(p, (p.matin || [])[i]);
          var infoAprem = infoCase(p, (p.aprem || [])[i]);
          // Fusion (round 12 ; étendue au tableau COMPLET de fragments round
          // du 16.09.2026, Option A) seulement si le contenu est RÉELLEMENT
          // identique des 2 côtés (mêmes tâches, mêmes chantiers, même ordre)
          // ET non vide — 2 cases vides ne "comportent" aucune tâche, donc pas
          // de fusion entre elles (choix de Lionel dans le mockup, jamais
          // amendé depuis).
          if (!infoMatin.empty && JSON.stringify(infoMatin.fragments) === JSON.stringify(infoAprem.fragments)) {
            h += celluleTache(infoMatin, null, true);
          } else {
            h += celluleTache(infoMatin, "demi-matin", false);
            h += celluleTache(infoAprem, "demi-aprem", false);
          }
        }
        h += '</tr>';
        if (idx < imprimes.length - 1) {
          // round du 15.09.2026 (suite) — Lionel : "Ligne entre personnel et
          // intervenants, vide et sans couleur aussi, un peu plus large que
          // celle entre le personnel" — même spacer invisible partout, avec
          // en plus la classe "print-spacer-section" (juste plus haute)
          // seulement à la frontière calculée plus haut. print-spacer-personne
          // (portage mockup, rounds 8-9) : posée sur TOUS ces spacers, cf. son
          // commentaire CSS pour le raisonnement complet.
          // Passe de vérification des bordures (round du 25.09.2026, suite
          // 29) — Lionel : « Fait une passe de vérification des bordures de
          // l'impression. » Le spacer est coupé en 2 demi-lignes vides :
          // print-spacer-fin reste sur la page de la personne du DESSUS (elle
          // porte la moitié basse de son trait 2px), print-spacer-personne
          // suit celle du DESSOUS (trait 2px du haut, cf. son CSS). Sous
          // border-collapse, Chrome partage chaque trait entre les 2 lignes
          // qu'il sépare ; une coupure de page entre une personne et son
          // spacer tranchait donc le trait en 2 (1px en bas de page, trait
          // orphelin ou personne collée à l'en-tête en page suivante). Entre
          // 2 demi-lignes vides, il n'y a plus aucun trait à trancher.
          var section = idx === indexFrontiereSection ? " print-spacer-section" : "";
          h += '<tr class="print-spacer print-spacer-fin' + section + '"><td colspan="' + NB_COLS + '"></td></tr>';
          h += '<tr class="print-spacer print-spacer-personne' + section + '"><td colspan="' + NB_COLS + '"></td></tr>';
        }
      });

      h += '</tbody></table>';

      var legendKeys = Object.keys(chantiersUtilises);
      if (r.legende && r.couleurs && legendKeys.length) {
        h += '<div class="print-legend">';
        legendKeys.forEach(function (nomChantier) {
          var ch = etat.chantierParNom[nomChantier];
          h += '<div class="legend-item"><span class="sw" style="background:' + (ch ? ch.couleur : "#e5e5e5") + '"></span>' + esc(nomChantier) + '</div>';
        });
        h += '</div>';
      }
      if (liste.sautees > 0) {
        h += '<div class="skip-note">' + liste.sautees + ' personne(s) sans rien cette semaine — masquée(s) à l’impression.</div>';
      }
      if (liste.decochees > 0) {
        h += '<div class="skip-note">' + liste.decochees + ' personne(s) décochée(s) dans les réglages — masquée(s) à l’impression.</div>';
      }
      return h;
    }

    var overlay = document.createElement("div");
    overlay.className = "voile-confirm";
    var pop = document.createElement("div");
    pop.className = "pop confirm-pop impression-modal";
    // Panneau « Réglages » (suite 38), replié ou non d'un clic sur son
    // titre. Suite 40 (même jour) — Lionel, capture sur téléphone à l'appui :
    // « Réglages Toujours fermés à l'ouverture. Descendre les réglage sous
    // l'aperçu. Comme le bouton imprimer. » Replié à chaque ouverture, placé
    // sous l'aperçu, juste au-dessus de Fermer / Imprimer ; déplié, il est
    // amené à l'écran (il s'ouvre vers le bas, hors de vue sinon). Chaque changement est retenu sur
    // l'appareil puis l'aperçu est reconstruit : ce qui s'affiche est
    // exactement ce qui s'imprimera. Une option qui n'a pas d'effet dans
    // l'état actuel est grisée (légende sans couleurs, personne sans tâche
    // tant que « Personnes sans tâche » est décoché, intervenant quand la
    // section est masquée).
    var r = lireReglagesImpression_();
    // Personnes proposées : toutes celles de la semaine, dans l'ordre de
    // l'impression, sauf un membre d'équipe sans rien à lui (ses tâches
    // sont sur la ligne d'équipe, il n'a jamais de ligne propre).
    var choixPersonnes = ordreComplet.filter(function (e) { return !(e.role === "membre" && personneVide(e.p)); });
    // Personnel / Intervenants en listes déroulantes — round du 25.09.2026
    // (suite 43). Lionel : « Aperçu avant impression : ajouter case à
    // cocher personnel. Rendre personnel et intervenants déroulant sous
    // leur case à cocher générale pour réduire la longueur de la liste. »
    // Le fieldset Personnes n'aligne plus toutes les personnes d'un bloc :
    // une case générale par section (Personnel, nouvelle ; Intervenants,
    // venue de « Afficher »), et sous chacune la liste des personnes,
    // repliée, dépliée d'un appui sur le compteur à sa droite (« 3 / 4 » :
    // personnes cochées sur celles proposées). Repliées à chaque ouverture
    // de l'aperçu, comme le panneau Réglages (suite 40) ; l'état déplié
    // survit à la reconstruction du panneau à chaque case cochée.
    var groupesOuverts = { personnel: false, intervenants: false };
    function panneauReglages_() {
      function caseR(cle, libelle, opt) {
        opt = opt || {};
        return '<label class="impr-option' + (opt.off ? ' impr-off' : '') + '"><input type="checkbox" data-r="' + cle + '"' +
          (opt.classe ? ' class="' + opt.classe + '"' : '') + (r[cle] ? ' checked' : '') + (opt.off ? ' disabled' : '') + '> <span>' + libelle +
          (opt.note ? '<small class="impr-note">' + opt.note + '</small>' : '') + '</span></label>';
      }
      var h = '<fieldset><legend>Afficher</legend>';
      if (aDesHoraires) h += caseR("horaires", "Horaires", { classe: "f-horaires" });
      h += caseR("jalons", "Jalons") + caseR("notes", "Notes") +
        caseR("legende", "Légende des chantiers", { off: !r.couleurs, note: r.couleurs ? "" : "(inutile sans couleurs)" }) +
        caseR("statuts", "Statuts des intervenants") +
        caseR("couleurs", "Couleurs des chantiers", { note: r.couleurs ? "" : "(nom du chantier écrit dans la case)" }) +
        caseR("vides", "Personnes sans tâche");
      h += '</fieldset><fieldset class="impr-personnes"><legend>Personnes</legend>';
      function groupe(cle, libelle, entrees) {
        var ouvert = groupesOuverts[cle];
        var coches = entrees.filter(function (e) { return !r.masques[idImpr(e.p)]; }).length;
        var g = '<div class="impr-groupe' + (ouvert ? ' ouvert' : '') + '"><div class="impr-groupe-tete">' + caseR(cle, libelle);
        if (!entrees.length) return g + '</div></div>';
        g += '<button type="button" class="impr-deplier" data-g="' + cle + '" aria-expanded="' + ouvert + '" title="Choisir personne par personne">' +
          coches + ' / ' + entrees.length + '<span class="impr-chevron" aria-hidden="true">›</span></button></div>' +
          '<div class="impr-liste"' + (ouvert ? '' : ' hidden') + '>';
        entrees.forEach(function (e) {
          var p = e.p, id = idImpr(p), vide = personneVide(p);
          var off = !r[cle] || (vide && !r.vides);
          g += '<label class="impr-option' + (e.role === "membre" ? ' impr-membre' : '') + (off ? ' impr-off' : '') + '">' +
            '<input type="checkbox" data-p="' + esc(id) + '"' + (r.masques[id] ? '' : ' checked') + (off ? ' disabled' : '') + '> ' + esc(p.nom) +
            (vide ? ' <small>(rien cette semaine)</small>' : '') + '</label>';
        });
        return g + '</div></div>';
      }
      h += groupe("personnel", "Personnel", choixPersonnes.filter(function (e) { return !e.p.sousTraitant; })) +
        groupe("intervenants", "Intervenants", choixPersonnes.filter(function (e) { return e.p.sousTraitant; }));
      h += '</fieldset>';
      return h;
    }
    pop.innerHTML = '<div class="cp-titre">Aperçu impression — semaine ' + esc(data.numero) + '</div>' +
      '<div class="print-doc"></div>' +
      '<details class="impr-reglages"><summary>Réglages</summary><div class="impr-grille"></div>' +
        // Suite 39 : plus que des cases à cocher ici ; la mise en page
        // (orientation, marges, en-tête…) a son onglet, rappelé d'un lien.
        '<div class="impr-lien-mep"><button type="button" class="f-reinit">Réinitialiser</button>' +
        '<span><span class="impr-resume-mep"></span> — <button type="button" class="lien-mep">Mise en page ›</button></span></div></details>' +
      '<div class="impression-actions"><button type="button" class="f-fermer">Fermer</button><button type="button" class="btn-primaire f-genpdf">Imprimer / PDF</button></div>';
    var reglagesEl = pop.querySelector(".impr-reglages");
    reglagesEl.addEventListener("toggle", function () {
      if (reglagesEl.open && reglagesEl.scrollIntoView) reglagesEl.scrollIntoView({ block: "nearest" });
    });
    var grilleReglages = pop.querySelector(".impr-grille");
    var docImpr = pop.querySelector(".print-doc");
    // Mise en page (suite 39, onglet Mise en page) : règle @page complète
    // (format, marges, en-tête et pied de page, cf. cssPageImpression)
    // posée le temps de l'aperçu — elle suit celle de style.css (« size:
    // landscape; margin: 12mm ») et l'emporte donc — retirée à la
    // fermeture. Relue à chaque ouverture : ce qui a changé dans l'onglet,
    // ici ou sur un autre appareil, s'applique à la prochaine impression.
    var mep = lireMiseEnPage();
    var stylePage = document.createElement("style");
    stylePage.className = "style-page-impression";
    document.head.appendChild(stylePage);
    function appliquerReglages_(avecPanneau) {
      if (avecPanneau) {
        // Garde le focus sur le même réglage après reconstruction du panneau.
        var actif = document.activeElement, cle = actif && grilleReglages.contains(actif) ? (actif.dataset.r || actif.dataset.p) : null;
        grilleReglages.innerHTML = panneauReglages_();
        if (cle) {
          var cible = grilleReglages.querySelector('[data-r="' + cle + '"], [data-p="' + cle + '"]');
          if (cible) cible.focus();
        }
      }
      // En-tête et pied de page simulés à l'écran (masqués à l'impression,
      // où le navigateur écrit les vrais dans les marges de chaque page).
      var z = zonesMiseEnPage(mep, new Date());
      function ligneEcran(classe, textes) {
        if (!textes.some(Boolean)) return "";
        return '<div class="' + classe + '">' + textes.map(function (t) { return '<span>' + esc(t === "page" ? "Page 1 / …" : t) + '</span>'; }).join("") + '</div>';
      }
      docImpr.innerHTML = ligneEcran("impr-entete-ecran", z.haut) + construireDocImpression_(r) + ligneEcran("impr-pied-ecran", z.bas);
      docImpr.classList.toggle("sans-horaires", !r.horaires);
      docImpr.classList.toggle("sans-couleurs", !r.couleurs);
      docImpr.classList.toggle("taille-petite", mep.taille === "petite");
      docImpr.classList.toggle("taille-grande", mep.taille === "grande");
      docImpr.classList.toggle("noms-fixe", mep.colonnes.noms === "fixe");
      docImpr.classList.toggle("jours-fixes", mep.colonnes.jours === "fixe");
      var vars = Object.assign(variablesEspacesImpression(mep), variablesColonnesImpression(mep));
      Object.keys(vars).forEach(function (k) { docImpr.style.setProperty(k, vars[k]); });
      stylePage.textContent = cssPageImpression(mep, new Date());
      var mg = mep.marges;
      pop.querySelector(".impr-resume-mep").textContent = (mep.orientation === "portrait" ? "Portrait" : "Paysage") + ", marges " +
        (mg.haut === mg.bas && mg.bas === mg.gauche && mg.gauche === mg.droite ? mg.haut + " mm" : mg.haut + "/" + mg.droite + "/" + mg.bas + "/" + mg.gauche + " mm") +
        // Colonnes fixes (suite 44) rappelées ici aussi.
        (mep.colonnes.jours === "fixe" ? ", jours " + String(mep.colonnes.largeurJour).replace(".", ",") + " mm" : "") +
        (mep.colonnes.noms === "fixe" ? ", noms " + String(mep.colonnes.largeurNoms).replace(".", ",") + " mm" : "");
    }
    grilleReglages.addEventListener("change", function (e) {
      var el = e.target;
      if (el.dataset.r) r[el.dataset.r] = el.type === "checkbox" ? el.checked : el.value;
      else if (el.dataset.p) { if (el.checked) delete r.masques[el.dataset.p]; else r.masques[el.dataset.p] = true; }
      else return;
      ecrireReglagesImpression_(r);
      appliquerReglages_(true);
    });
    reglagesEl.addEventListener("click", function (e) {
      var deplier = e.target.closest(".impr-deplier");
      if (deplier) {
        var cleG = deplier.dataset.g, ouvert = !groupesOuverts[cleG];
        groupesOuverts[cleG] = ouvert;
        deplier.setAttribute("aria-expanded", String(ouvert));
        deplier.closest(".impr-groupe").classList.toggle("ouvert", ouvert);
        deplier.closest(".impr-groupe").querySelector(".impr-liste").hidden = !ouvert;
      } else if (e.target.closest(".f-reinit")) {
        r = reglagesImpressionDefaut_();
        ecrireReglagesImpression_(r);
        appliquerReglages_(true);
      } else if (e.target.closest(".lien-mep")) {
        nettoyer();
        var onglet = document.querySelector('.onglet[data-page="mise-en-page"]');
        if (onglet) onglet.click();
      }
    });
    // Date d'impression remise à l'heure au moment d'imprimer (l'aperçu a
    // pu rester ouvert plusieurs minutes).
    function avantImpression() { stylePage.textContent = cssPageImpression(mep, new Date()); }
    window.addEventListener("beforeprint", avantImpression);
    appliquerReglages_(true);
    document.body.appendChild(overlay);
    document.body.appendChild(pop);
    function nettoyer() { overlay.remove(); pop.remove(); stylePage.remove(); window.removeEventListener("beforeprint", avantImpression); if (popFermerActuel === nettoyer) popFermerActuel = null; }
    overlay.addEventListener("pointerdown", nettoyer);
    pop.querySelector(".f-fermer").addEventListener("click", nettoyer);
    popFermerActuel = nettoyer;

    // round du 15.09.2026 — Lionel : "on peut travailler sur la page
    // d'impression ?". Ce bouton appelait gs("apiGenererPdf", ...), donc
    // google.script.run — plus rien depuis l'hébergement sur GitHub Pages
    // (§8 du plan de migration, resté ouvert) : l'appel levait une
    // exception systématiquement rattrapée par le catch ci-dessous depuis
    // le 07.09.2026 (message clair, mais aucun PDF produit). Plutôt qu'une
    // nouvelle fonction serveur pour reconstruire un PDF depuis zéro
    // (Edge Function), choix de Lionel : s'appuyer sur l'impression du
    // NAVIGATEUR, directement sur cet aperçu (cf. @media print,
    // .impression-modal, plus haut dans <style>) — "Enregistrer en PDF"
    // dans la boîte qui s'ouvre donne le même fichier, sans aller-retour
    // serveur ni dépendance nouvelle.
    pop.querySelector(".f-genpdf").addEventListener("click", function () { window.print(); });
  }

  verifierSessionEtDemarrer();
