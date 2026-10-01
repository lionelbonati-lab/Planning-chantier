"use strict";
  /* ============================================================
     GROUPES DE LIGNES (round du 30.09.2026, suite 132 — sql/0033_groupes.sql).
     Lionel (retour n° 4, page Améliorations et bugs) : « Les groupes
     machines et transports font leur apparitions.
     J'aimerai pouvoir réorganiser mes groupes dans le planning. »
     Ses 2 choix (AskUserQuestion) :
       - lignes Machines / Transports « Comme le personnel » : tâches,
         absences (panne, révision), tâches déplaçables entre les lignes du
         même groupe ;
       - « Glisser les titres » : le titre d'une section du planning se
         glisse plus haut ou plus bas ; l'ordre est enregistré pour le
         compte et suivi à l'impression.

     Une ligne de groupe est une ligne de `personnes` avec groupe_id (table
     groupes : Machines et Transports créés d'office). Elle se comporte
     comme une personne du Personnel, sans équipe ; seul son secteur
     change (secteurDe : "groupe-<id>"), ce qui lui donne sa propre section
     dans le planning et à l'impression, et la garde dans son groupe au
     glisser (changementPersonneAutorise, js/grille-rendu.js).

     Sections du corps du planning (sectionsCorps) : Personnel,
     Intervenants, puis chaque groupe — dans l'ordre choisi (réglage du
     compte « ordre_groupes », table reglages ; repli sur cet appareil si
     la base ne répond pas). Jalons et Notes restent en tête, figés.

     Round du 01.10.2026 (suite 134 — sql/0035). Lionel (retour n° 9) :
     « Machine et transports doivent avoir leurs propre onglet. [...]
     Transport ne sera q'une ligne comme note et jalons. [...] Ajouter une
     coche pour masquer une ligne personnel/intervenant et machine sans les
     désactiver. » Ses choix : masquage « Tous les appareils », ligne
     Transports « En haut, sous Notes ».
       - Un groupe « ligne_unique » (Transports) n'est plus une section :
         sa ligne (secteur "transports") est posée en tête du corps du
         planning, juste sous Notes, sans titre de section (cf.
         ligneTransports, js/grille-rendu.js). Ses tâches restent des
         tâches (plusieurs jours, chantier, important, séries).
       - personnes.masque (ligneMasquee) : la ligne n'est plus posée dans
         le planning ni imprimée, sans être désactivée.
     ============================================================ */
  var COLONNES_GROUPES = "id, nom, ordre, actif, ligne_unique";
  function normaliserGroupes(lignes) {
    return (lignes || []).filter(function (g) { return g.actif !== false; }).map(function (g) {
      return { id: String(g.id), nom: g.nom, ordre: g.ordre || 0, ligneUnique: !!g.ligne_unique };
    }).sort(function (a, b) { return a.ordre - b.ordre || (+a.id) - (+b.id); });
  }
  // Suite 134 : groupes de lignes (Machines…) et groupe de la ligne
  // Transports (ligne_unique).
  function groupesLignes() { return (etat.groupes || []).filter(function (g) { return !g.ligneUnique; }); }
  function groupeTransports() { return (etat.groupes || []).filter(function (g) { return g.ligneUnique; })[0] || null; }
  // Suite 134 : ligne cachée par la coche « Afficher » (personnes.masque).
  function ligneMasquee(id) {
    id = String(id);
    return (etat.personnesActives || []).some(function (p) { return String(p.id) === id && !!p.masque; });
  }
  function groupeParId(id) {
    id = String(id);
    return (etat.groupes || []).filter(function (g) { return g.id === id; })[0] || null;
  }
  // Secteur d'une ligne : "personnel", "sous-traitant", "groupe-<id>" ou
  // "transports" (suite 134 : ligne du groupe ligne_unique).
  // Un groupe disparu ou désactivé : la ligne retombe dans le Personnel.
  function secteurDe(p) {
    if (!p) return "personnel";
    if (p.sousTraitant) return "sous-traitant";
    var g = p.groupeId && !p.equipe ? groupeParId(p.groupeId) : null;
    if (g) return g.ligneUnique ? "transports" : "groupe-" + p.groupeId;
    return "personnel";
  }

  /* ---------- Ordre des sections ---------- */
  var CLE_ORDRE_SECTIONS = "ordre_groupes";
  var CLE_ORDRE_SECTIONS_LOCAL = "planning.ordreGroupes";
  function ordreSectionsEnregistre_() {
    if (etat.reglages && Array.isArray(etat.reglages[CLE_ORDRE_SECTIONS])) return etat.reglages[CLE_ORDRE_SECTIONS];
    try { var l = JSON.parse(localStorage.getItem(CLE_ORDRE_SECTIONS_LOCAL) || "null"); if (Array.isArray(l)) return l; } catch (e) {}
    return [];
  }
  // [{ cle, secteur, libelle }] dans l'ordre affiché. Une section absente
  // du réglage (nouveau groupe) se range à sa place par défaut, après
  // celles qui y sont.
  function sectionsCorps() {
    var defaut = [
      { cle: "personnel", secteur: "personnel", libelle: "Personnel" },
      { cle: "intervenants", secteur: "sous-traitant", libelle: "Intervenants" }
    ].concat(groupesLignes().map(function (g) { return { cle: "groupe-" + g.id, secteur: "groupe-" + g.id, libelle: g.nom }; }));
    var ordre = ordreSectionsEnregistre_();
    var rang = function (s) { var i = ordre.indexOf(s.cle); return i < 0 ? ordre.length + defaut.indexOf(s) : i; };
    return defaut.slice().sort(function (a, b) { return rang(a) - rang(b); });
  }
  function enregistrerOrdreSections(cles) {
    if (!etat.reglages) etat.reglages = {};
    etat.reglages[CLE_ORDRE_SECTIONS] = cles.slice();
    try { localStorage.setItem(CLE_ORDRE_SECTIONS_LOCAL, JSON.stringify(cles)); } catch (e) {}
    render(false);
    return Promise.resolve(sbClient.from("reglages").upsert({ cle: CLE_ORDRE_SECTIONS, valeur: cles, maj: new Date().toISOString() }, { onConflict: "cle" })).then(function (res) {
      if (res && res.error) throw res.error;
    }).catch(function (err) { toast("Ordre gardé sur cet appareil seulement : " + (err && err.message ? err.message : err)); });
  }
  // Place la section `cle` juste avant `cleCible` (ou après, apres = true).
  function deplacerSection(cle, cleCible, apres) {
    if (cle === cleCible) return;
    var cles = sectionsCorps().map(function (s) { return s.cle; });
    var i = cles.indexOf(cle);
    if (i < 0 || cles.indexOf(cleCible) < 0) return;
    cles.splice(i, 1);
    var j = cles.indexOf(cleCible) + (apres ? 1 : 0);
    cles.splice(j, 0, cle);
    if (cles.join() === sectionsCorps().map(function (s) { return s.cle; }).join()) return;
    enregistrerOrdreSections(cles);
    toast("Ordre des groupes enregistré.");
  }

  // Glisser le titre d'une section (poignée ⠿ de .section-row, cf.
  // ligneSection dans js/grille-rendu.js) : un trait montre où elle va ;
  // relâchée, elle y est rangée. Souris et doigt (la poignée ne fait
  // jamais défiler).
  function cablerGlisserSection(ligne, cle) {
    var poignee = ligne.querySelector(".section-poignee");
    if (!poignee) return;
    poignee.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      e.stopPropagation();
      var pointerId = e.pointerId, trait = null, cible = null;
      try { poignee.setPointerCapture(pointerId); } catch (ex) {}
      ligne.classList.add("section-glissee");
      function lignes() { return [].slice.call(ligne.parentNode.querySelectorAll(".section-row[data-section]")); }
      function onMove(e2) {
        if (e2.pointerId !== pointerId) return;
        var toutes = lignes(), y = e2.clientY, choix = null;
        toutes.forEach(function (l) {
          var r = l.getBoundingClientRect();
          if (choix == null || Math.abs(r.top - y) < choix.d) choix = { d: Math.abs(r.top - y), l: l, apres: false };
        });
        // Après la dernière section : sous son titre, plus bas que lui.
        var derniere = toutes[toutes.length - 1];
        if (derniere && y > derniere.getBoundingClientRect().bottom + 12) choix = { l: derniere, apres: true };
        if (!choix) return;
        cible = { cle: choix.l.dataset.section, apres: choix.apres };
        if (!trait) { trait = document.createElement("div"); trait.className = "section-trait"; document.body.appendChild(trait); }
        var rr = choix.l.getBoundingClientRect(), gr = ligne.parentNode.getBoundingClientRect();
        trait.style.left = Math.round(gr.left) + "px";
        trait.style.width = Math.round(gr.width) + "px";
        trait.style.top = Math.round(choix.apres ? rr.bottom + 20 : rr.top - 2) + "px";
      }
      function fin(e2) {
        if (e2.pointerId !== pointerId) return;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", fin);
        document.removeEventListener("pointercancel", annuler);
        ligne.classList.remove("section-glissee");
        if (trait) trait.remove();
        if (cible) deplacerSection(cle, cible.cle, cible.apres);
      }
      function annuler(e2) { cible = null; fin(e2); }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", fin);
      document.addEventListener("pointercancel", annuler);
    });
  }
