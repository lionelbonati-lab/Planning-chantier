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
    var imprimesTous = (data.personnes || []).filter(function (p) { return !personneVide(p); });
    var sautees = (data.personnes || []).length - imprimesTous.length;
    var imprPersonnel = imprimesTous.filter(function (p) { return !p.sousTraitant; });
    var imprIntervenants = imprimesTous.filter(function (p) { return p.sousTraitant; });
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
    var notesRemplies = (data.notes || []).some(function (n) { return n && n.length > 0; });

    var overlay = document.createElement("div");
    overlay.className = "voile-confirm";
    var pop = document.createElement("div");
    pop.className = "pop confirm-pop impression-modal";
    var h = '<div class="cp-titre">Aperçu impression — semaine ' + esc(data.numero) + '</div>';
    // NB_COLS : 1 colonne "nom" + 2 sous-colonnes (matin/aprem) par jour —
    // toute cellule qui doit couvrir la largeur entière du tableau
    // (spacers, colspan de secours) s'appuie sur cette constante plutôt
    // qu'un nombre en dur, pour ne plus jamais désynchroniser un colspan
    // si le nombre de jours affichés change un jour.
    var NB_COLS = 1 + jl.length * 2;
    h += '<div class="print-doc"><table class="print-table"><thead>';
    // round du 15.09.2026 (suite) — Lionel : "j'aimerai bien l'affichage
    // matin/après-midi côte à côte, comme le planning". La grille compacte
    // (planning à l'écran) place déjà matin et aprem à côté l'un de
    // l'autre plutôt que sur 2 lignes — l'aperçu impression, jusqu'ici,
    // faisait l'inverse (cf. plus bas : 1 ligne "matin" + 1 ligne "aprem"
    // par personne). Reprend le même principe qu'à l'écran : chaque jour
    // devient 2 SOUS-COLONNES ("th colspan=2" pour son en-tête), chaque
    // personne tient sur UNE SEULE ligne. Jalons/notes restent au niveau
    // du JOUR (data.jalons[i]/data.notes[i] n'ont pas de granularité demi
    // côté forme serveur brute, contrairement aux cases personne — cf.
    // personneVide juste au-dessus) : leur cellule s'étale sur
    // les 2 sous-colonnes de son jour (colspan=2), comme une plage en
    // "journée entière" dans la grille à l'écran.
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
    jl.forEach(function () { h += '<th>Matin</th><th class="demi-aprem">Aprem</th>'; });
    h += '</tr>';
    // Ligne des horaires (round du 25.09.2026, suite 27) — Lionel : « Sur la
    // page d'impression. On rajoute une ligne sous matin et après-midi pour
    // afficher les horaires du matin et de l'après-midi. Une case à cocher
    // sur la page impression permet d'afficher ou non les horaires. » Même
    // source que le planning (horaireDuJour, page-horaires.js). Posée
    // seulement si au moins un jour de la semaine a un horaire ; la case à
    // cocher (en bas de la fenêtre) masque la ligne à l'écran ET au papier.
    var horairesSemaine = jl.map(function (j) { return horaireDuJour(j.iso); });
    var aDesHoraires = horairesSemaine.some(function (x) { return !!x; });
    if (aDesHoraires) {
      h += '<tr class="print-horaires"><th class="coin-horaires">Horaires</th>';
      horairesSemaine.forEach(function (x) {
        h += '<th>' + (x ? esc(x.matin) : '') + '</th><th class="demi-aprem">' + (x ? esc(x.aprem || '—') : '') + '</th>';
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
    h += '<tr class="print-jalons"><td style="font-weight:700;white-space:nowrap">Jalons</td>';
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
    var jalonsImpr = data.jalons || [];
    for (var ij = 0; ij < jalonsImpr.length; ij++) {
      var txtJ = jalonsImpr[ij] ? jalonsImpr[ij].texte : "";
      if (!txtJ) {
        h += '<td colspan="2"></td>';
        continue;
      }
      var runLen = 1;
      while (ij + runLen < jalonsImpr.length && jalonsImpr[ij + runLen] && jalonsImpr[ij + runLen].texte === txtJ) {
        runLen++;
      }
      h += '<td colspan="' + (runLen * 2) + '" class="filled">' + esc(txtJ) + '</td>';
      ij += runLen - 1;
    }
    h += '</tr>';

    // Portage mockup (rounds 7-9) — classes print-spacer-jalons/personne
    // (cf. leur commentaire CSS) : le PREMIER spacer qui suit la ligne
    // Jalons porte toujours print-spacer-jalons, que ce soit le spacer
    // avant Notes (si elle est remplie) ou, sinon, directement le spacer
    // avant la 1ère personne juste en dessous — ces 2 cas ne peuvent pas
    // survenir en même temps, donc jamais posée 2 fois.
    if (notesRemplies) {
      h += '<tr class="print-spacer print-spacer-jalons"><td colspan="' + NB_COLS + '"></td></tr>';
      h += '<tr class="print-notes"><td style="font-weight:700;white-space:nowrap"></td>';
      (data.notes || []).forEach(function (entries) {
        var rempli = entries && entries.length > 0;
        var txt = (entries || []).map(function (n) {
          var ouvre = n.important ? '<span class="print-important">' : "";
          var ferme = n.important ? '</span>' : "";
          return ouvre + esc(n.texte) + ferme;
        }).join("<br>");
        h += '<td colspan="2" class="' + (rempli ? "filled" : "") + '">' + txt + '</td>';
      });
      h += '</tr>';
    }

    // print-spacer-personne (round 8) : ce spacer précède TOUJOURS la 1ère
    // personne, donc porte toujours cette classe. print-spacer-jalons SE
    // CUMULE dessus seulement si Notes n'a pas déjà pris ce rôle juste
    // au-dessus (sinon ce spacer-ci n'est plus le premier après Jalons).
    h += '<tr class="print-spacer print-spacer-personne' + (notesRemplies ? '' : ' print-spacer-jalons') + '"><td colspan="' + NB_COLS + '"></td></tr>';

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
        var badge = (p.sousTraitant && t.statut && STATUTS[t.statut]) ? ' <span class="print-statut" style="background:' + STATUTS[t.statut].couleur + '">' + esc(STATUTS[t.statut].nom) + '</span>' : "";
        var ouvre = t.important ? '<span class="print-important">' : "";
        var ferme = t.important ? '</span>' : "";
        return { bg: bg === "transparent" ? "var(--surface-2)" : bg, txt: ouvre + esc(t.texte) + ferme + badge };
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
      h += '<td style="font-weight:700;white-space:nowrap">' + esc(p.nom) + '</td>';
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
          h += celluleTache(infoMatin, null, false);
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
    if (legendKeys.length) {
      h += '<div class="print-legend">';
      legendKeys.forEach(function (nomChantier) {
        var ch = etat.chantierParNom[nomChantier];
        h += '<div class="legend-item"><span class="sw" style="background:' + (ch ? ch.couleur : "#e5e5e5") + '"></span>' + esc(nomChantier) + '</div>';
      });
      h += '</div>';
    }
    if (sautees > 0) {
      h += '<div class="skip-note">' + sautees + ' personne(s) sans rien cette semaine — masquée(s) à l’impression.</div>';
    }
    h += '</div>'; // .print-doc

    // Case « Afficher les horaires » (suite 27) : cochée par défaut, retenue
    // sur l'appareil (réglage de confort, cf. lireOptionHorairesImpression_).
    var avecHoraires = lireOptionHorairesImpression_();
    h += '<div class="impression-actions">' +
      (aDesHoraires ? '<label class="impr-option"><input type="checkbox" class="f-horaires"' + (avecHoraires ? ' checked' : '') + '> Afficher les horaires</label>' : '') +
      '<button type="button" class="f-fermer">Fermer</button><button type="button" class="btn-primaire f-genpdf">Imprimer / PDF</button></div>';
    pop.innerHTML = h;
    document.body.appendChild(overlay);
    document.body.appendChild(pop);
    function nettoyer() { overlay.remove(); pop.remove(); if (popFermerActuel === nettoyer) popFermerActuel = null; }
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
    var docImpr = pop.querySelector(".print-doc");
    docImpr.classList.toggle("sans-horaires", !avecHoraires);
    var caseHoraires = pop.querySelector(".f-horaires");
    if (caseHoraires) caseHoraires.addEventListener("change", function () {
      docImpr.classList.toggle("sans-horaires", !caseHoraires.checked);
      try { localStorage.setItem(CLE_HORAIRES_IMPRESSION, caseHoraires.checked ? "1" : "0"); } catch (e) {}
    });
    var genBtn = pop.querySelector(".f-genpdf");
    genBtn.addEventListener("click", function () { window.print(); });
  }

  verifierSessionEtDemarrer();
