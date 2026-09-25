"use strict";
  /* ============================================================
     MISE EN PAGE DE L'IMPRESSION — round du 25.09.2026 (suite 39)
     ------------------------------------------------------------
     Lionel : « Je pensais aussi à une mise en page. En-tête, pied de
     pages, marges, espaces entre les éléments. C'est peut-être plus
     judicieux de faire un onglet mise en pages. Et garde que les réglage à
     cocher dans la feuille impression. » Ses choix (questions posées) :
       - en-tête : « Texte libre, Chantier filtré, La date d'impression » ;
       - pied de page : « Numéro de page, Date d'impression, Texte libre » ;
       - aperçu dans l'onglet : « Aperçu simplifié sans données » ;
       - stockage : « Liés au compte » (table `reglages`, sql/0016).
     Orientation et taille du texte (suite 38, dans l'aperçu d'impression)
     déménagent ici ; le « titre libre » devient le texte libre de
     l'en-tête. L'aperçu d'impression (js/impression.js) ne garde que ses
     cases à cocher et lit ces réglages avec lireMiseEnPage().

     « Chantier filtré » : le planning n'a pas de filtre par chantier ; le
     seul chantier « choisi » est celui du sélecteur de la barre d'outils
     (chantier par défaut des formulaires, construireSelectChantier). C'est
     lui qui s'écrit dans l'en-tête ; rien si aucun n'est choisi.

     Stockage : une ligne { cle: "mise_en_page", valeur: {…} } dans
     `reglages`, écrite 0,5 s après le dernier changement (une seule
     requête pendant qu'on tape un texte ou fait défiler un nombre). Copie
     en localStorage : si la table ne répond pas au chargement, le dernier
     réglage connu de l'appareil s'applique quand même.
     ============================================================ */

  var CLE_MEP_SERVEUR = "mise_en_page";
  var CLE_MEP_LOCAL = "planning.mise-en-page";

  // Marges en mm (celles d'avant : 12 mm partout, cf. @page de style.css).
  // Espacements en mm, convertis en px entiers à l'impression (cf.
  // pxDepuisMm_) : 1,6 mm = 6 px entre 2 personnes, 3,7 mm = 14 px entre
  // 2 sections, 1,3 mm = 5 px dans les cases, 3,7 mm = 14 px avant la
  // légende — exactement l'impression d'avant cette suite.
  function miseEnPageDefaut() {
    return {
      orientation: "paysage", taille: "normale",
      marges: { haut: 12, bas: 12, gauche: 12, droite: 12 },
      espaces: { personnes: 1.6, sections: 3.7, cases: 1.3, legende: 3.7 },
      entete: { texte: "", chantier: true, date: false },
      pied: { page: true, date: true, texte: "" },
      // Suite 44 (cf. plus bas, « Accolades » et « Colonnes »).
      liens: { hautBas: false, gaucheDroite: false, toutes: false },
      colonnes: { jours: "dynamique", largeurJour: 48, noms: "dynamique", largeurNoms: 30 }
    };
  }
  // Bornes des champs en mm : par groupe, ou par clé pour les colonnes
  // (un jour de 15 mm, une colonne des noms de 10 mm au moins).
  var BORNES_MEP_ = { marges: [0, 40], espaces: [0, 15], colonnes: { largeurJour: [15, 120], largeurNoms: [10, 80] } };
  function bornesMep_(g, k) { var b = BORNES_MEP_[g]; return Array.isArray(b) ? b : b[k]; }

  // Remet d'aplomb une valeur lue (serveur, cache, ancienne clé) : toute
  // clé manquante ou d'un mauvais type reprend sa valeur par défaut.
  function normaliserMiseEnPage_(src) {
    var m = miseEnPageDefaut();
    if (!src || typeof src !== "object") return m;
    if (src.orientation === "portrait" || src.orientation === "paysage") m.orientation = src.orientation;
    if (["petite", "normale", "grande"].indexOf(src.taille) >= 0) m.taille = src.taille;
    ["marges", "espaces", "colonnes"].forEach(function (groupe) {
      var s = src[groupe] || {};
      Object.keys(m[groupe]).forEach(function (k) {
        if (typeof m[groupe][k] !== "number") return;
        var v = parseFloat(s[k]), b = bornesMep_(groupe, k);
        if (isFinite(v)) m[groupe][k] = Math.min(b[1], Math.max(b[0], Math.round(v * 10) / 10));
      });
    });
    ["jours", "noms"].forEach(function (k) {
      var v = (src.colonnes || {})[k];
      if (v === "fixe" || v === "dynamique") m.colonnes[k] = v;
    });
    ["entete", "pied", "liens"].forEach(function (groupe) {
      var s = src[groupe] || {};
      Object.keys(m[groupe]).forEach(function (k) {
        if (typeof s[k] === typeof m[groupe][k]) m[groupe][k] = typeof s[k] === "string" ? s[k].slice(0, 120) : s[k];
      });
    });
    return m;
  }

  // Réglages de la suite 38 encore retenus sur l'appareil (orientation,
  // taille du texte, titre libre dans planning.impression.reglages) : repris
  // tant que le compte n'a pas encore de mise en page enregistrée, pour que
  // rien ne change à la première impression après cette suite.
  function miseEnPageDepuisSuite38_() {
    try {
      var r = JSON.parse(localStorage.getItem("planning.impression.reglages") || "null");
      if (!r || typeof r !== "object") return null;
      var m = miseEnPageDefaut();
      if (r.orientation) m.orientation = r.orientation;
      if (r.taille) m.taille = r.taille;
      if (typeof r.titre === "string") m.entete.texte = r.titre;
      return m;
    } catch (e) { return null; }
  }

  function lireMiseEnPage() {
    var src = (etat.reglages && etat.reglages[CLE_MEP_SERVEUR]) || null;
    if (src) return normaliserMiseEnPage_(src);
    if (!etat.reglages) {
      try { src = JSON.parse(localStorage.getItem(CLE_MEP_LOCAL) || "null"); } catch (e) {}
      if (src) return normaliserMiseEnPage_(src);
    }
    // Compte encore sans mise en page : reprise des réglages de la suite 38
    // de cet appareil, enregistrée aussitôt sur le compte (une seule fois :
    // la ligne existe ensuite) — l'aperçu d'impression réécrit sa clé sans
    // eux au premier changement de case.
    var ancien = miseEnPageDepuisSuite38_();
    if (ancien && etat.reglages && JSON.stringify(normaliserMiseEnPage_(ancien)) !== JSON.stringify(miseEnPageDefaut())) return enregistrerMiseEnPage(ancien);
    return normaliserMiseEnPage_(ancien);
  }

  var minuteurMep_ = null;
  function enregistrerMiseEnPage(m, surFin) {
    m = normaliserMiseEnPage_(m);
    // etat.reglages null = table injoignable au chargement : l'appareil
    // garde sa copie (ci-dessous) ; l'écriture serveur est tentée quand même.
    if (etat.reglages) etat.reglages[CLE_MEP_SERVEUR] = m;
    try { localStorage.setItem(CLE_MEP_LOCAL, JSON.stringify(m)); } catch (e) {}
    clearTimeout(minuteurMep_);
    minuteurMep_ = setTimeout(function () {
      sbClient.from("reglages").upsert({ cle: CLE_MEP_SERVEUR, valeur: m, maj: new Date().toISOString() }, { onConflict: "cle" }).then(function (res) {
        if (res.error) throw res.error;
        if (!etat.reglages) { etat.reglages = {}; etat.reglages[CLE_MEP_SERVEUR] = m; }
        if (surFin) surFin(null);
      }).catch(function (err) {
        if (surFin) surFin(err);
        toast("Mise en page gardée sur cet appareil, mais pas enregistrée sur le compte : " + (err && err.message ? err.message : err));
      });
    }, 500);
    return m;
  }

  // Accolades des marges — round du 25.09.2026 (suite 44). Lionel :
  // « Accolades pour lier les marges, gauche/droite, haut/bas ou les 4. »
  // Marges liées = même valeur : changer l'une change les autres. Lier
  // aligne aussitôt sur la première du groupe (haut, ou gauche).
  var GROUPES_LIENS_MEP_ = { hautBas: ["haut", "bas"], gaucheDroite: ["gauche", "droite"], toutes: ["haut", "bas", "gauche", "droite"] };
  function margesLiees_(m, k) {
    var l = m.liens, out = [k];
    Object.keys(GROUPES_LIENS_MEP_).forEach(function (nom) {
      var g = GROUPES_LIENS_MEP_[nom];
      if (l[nom] && g.indexOf(k) >= 0) g.forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
    });
    return out;
  }
  function basculerLienMarges_(m, nom) {
    m.liens[nom] = !m.liens[nom];
    if (m.liens[nom]) { var g = GROUPES_LIENS_MEP_[nom]; g.forEach(function (x) { m.marges[x] = m.marges[g[0]]; }); }
    return m;
  }
  // Largeur utile de la feuille (papier moins marges gauche et droite), en
  // mm : ce que le tableau peut occuper sans être coupé.
  function largeurUtileMm_(m) { return (m.orientation === "portrait" ? 210 : 297) - m.marges.gauche - m.marges.droite; }
  // Colonnes fixes ou dynamiques — round du 25.09.2026 (suite 44). Lionel :
  // « Possibilité de pouvoir rendre fixe la largeur des colonnes des jours
  // avec option pour qu'elles soient dynamiques (comportement actuel).
  // Idem pour la colonne des noms. » Dynamique : le navigateur partage la
  // largeur selon le contenu, comme avant. Fixe : largeur en mm posée sur
  // les <col> du tableau d'impression (js/impression.js, style.css) ; un
  // jour = 2 demi-colonnes (matin, aprem) de la moitié chacune.
  function variablesColonnesImpression(m) {
    var c = m.colonnes;
    return {
      "--impr-col-noms": c.largeurNoms + "mm",
      "--impr-col-demi": (c.largeurJour / 2) + "mm"
    };
  }

  // Espacement en mm -> px entiers : une hauteur fractionnaire décale les
  // traits d'un demi-pixel d'une ligne à l'autre (cf. la dérive d'arrondi
  // des largeurs fractionnaires du 16.09.2026).
  function pxDepuisMm_(mm) { return Math.round(mm * 96 / 25.4); }
  function variablesEspacesImpression(m) {
    return {
      "--impr-esp-personnes": pxDepuisMm_(m.espaces.personnes) + "px",
      "--impr-esp-sections": pxDepuisMm_(m.espaces.sections) + "px",
      "--impr-pad-cases": pxDepuisMm_(m.espaces.cases) + "px",
      "--impr-esp-legende": pxDepuisMm_(m.espaces.legende) + "px"
    };
  }

  // « Imprimé le 25.09.2026 à 18:05 » (libellé proposé à Lionel).
  function texteDateImpression(d) {
    d = d || new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return "Imprimé le " + p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear() + " à " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function nomChantierChoisi_() {
    var k = typeof chantierParDefautValide === "function" ? chantierParDefautValide() : null;
    return k && CHANTIERS[k] ? CHANTIERS[k].nom : "";
  }
  // Textes des 6 emplacements (haut/bas × gauche/centre/droite) : en-tête =
  // texte libre à gauche, chantier au centre, date à droite ; pied = texte
  // libre à gauche, date au centre, numéro de page à droite ("page" : le
  // numéro n'existe qu'au moment d'imprimer, cf. cssPageImpression).
  function zonesMiseEnPage(m, date) {
    var dateTxt = texteDateImpression(date);
    return {
      haut: [m.entete.texte.trim(), m.entete.chantier ? nomChantierChoisi_() : "", m.entete.date ? dateTxt : ""],
      bas: [m.pied.texte.trim(), m.pied.date ? dateTxt : "", m.pied.page ? "page" : ""]
    };
  }
  function chaineCss_(s) { return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ") + '"'; }
  // Règle @page complète : format, marges, et en-tête/pied de page dans
  // les « boîtes de marge » (@top-left, @bottom-right…, Chrome 131+) —
  // répétés sur chaque page par le navigateur lui-même, numéro de page
  // compris (counter(page) / counter(pages)). Placée sous @media print :
  // elle l'emporte sur celle de style.css (même règle, plus loin dans la
  // page) sans rien changer à l'écran.
  function cssPageImpression(m, date) {
    var z = zonesMiseEnPage(m, date);
    var style = "font-family: 'IBM Plex Sans', system-ui, sans-serif; font-size: 8pt; color: #57616b;";
    var boites = "";
    [["top", z.haut], ["bottom", z.bas]].forEach(function (b) {
      ["left", "center", "right"].forEach(function (cote, i) {
        var t = b[1][i];
        if (!t) return;
        var contenu = t === "page" && b[0] === "bottom" && i === 2 ? '"Page " counter(page) " / " counter(pages)' : chaineCss_(t);
        boites += " @" + b[0] + "-" + cote + " { content: " + contenu + "; " + style + " vertical-align: " + (b[0] === "top" ? "bottom" : "top") + "; }";
      });
    });
    var mg = m.marges;
    return "@media print { @page { size: " + (m.orientation === "portrait" ? "portrait" : "landscape") + "; margin: " +
      mg.haut + "mm " + mg.droite + "mm " + mg.bas + "mm " + mg.gauche + "mm;" + boites + " } }";
  }

  /* ---------- Onglet « Mise en page » ---------- */
  var mepEdition_ = null;
  // Flèches haut/bas — round du 25.09.2026 (suite 44). Lionel : « Ajouter
  // des petites flèches haut/bas pour pouvoir changer des réglages au MM. »
  // Les flèches natives des champs numériques n'existent pas sur téléphone
  // (clavier seulement) : 2 petits boutons à droite de chaque champ, d'un
  // pas du champ (1 mm pour les marges et les colonnes, 0,1 mm pour les
  // espacements, qui ne font que quelques mm). Maintenus, ils répètent
  // (cf. cablerPageMiseEnPage). Flèches natives masquées (style.css) pour
  // ne pas en avoir 2 paires sur ordinateur.
  var SVG_FLECHE_MEP_ = '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 5l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function champNombre_(groupe, cle, libelle, pas, off) {
    var b = bornesMep_(groupe, cle);
    return '<label class="mep-champ' + (off ? ' mep-off' : '') + '">' + libelle + ' <span class="mep-unite"><span class="mep-nombre"><input type="number" inputmode="decimal" data-g="' + groupe + '" data-k="' + cle + '" min="' +
      b[0] + '" max="' + b[1] + '" step="' + pas + '" value="' + mepEdition_[groupe][cle] + '"' + (off ? ' disabled' : '') + '>' +
      '<span class="mep-fleches"><button type="button" class="mep-fleche" data-sens="1" tabindex="-1" aria-label="' + libelle + ' : plus"' + (off ? ' disabled' : '') + '>' + SVG_FLECHE_MEP_ + '</button>' +
      '<button type="button" class="mep-fleche mep-fleche-bas" data-sens="-1" tabindex="-1" aria-label="' + libelle + ' : moins"' + (off ? ' disabled' : '') + '>' + SVG_FLECHE_MEP_ + '</button></span></span> mm</span></label>';
  }
  // Accolade : bouton qui lie ou délie un groupe de marges (aria-pressed).
  // « inclus » : paire déjà liée par l'accolade des 4 (grisée, sans effet).
  var SVG_LIEN_MEP_ = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1a2.5 2.5 0 01-3.5-3.5l1-1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  function accoladeMep_(nom, titre, ligne, hauteur, colonne) {
    var l = mepEdition_.liens, inclus = nom !== "toutes" && l.toutes, actif = l[nom] || inclus;
    return '<button type="button" class="mep-accolade' + (actif ? ' actif' : '') + (inclus ? ' inclus' : '') + '" data-lien="' + nom + '" aria-pressed="' + actif + '"' +
      (inclus ? ' disabled' : '') + ' title="' + titre + '" aria-label="' + titre + '" style="grid-row:' + ligne + ' / span ' + hauteur + ';grid-column:' + colonne + '">' +
      '<span class="mep-accolade-trait"></span>' + SVG_LIEN_MEP_ + '</button>';
  }
  function caseMep_(groupe, cle, libelle, note) {
    return '<label class="impr-option"><input type="checkbox" data-g="' + groupe + '" data-k="' + cle + '"' + (mepEdition_[groupe][cle] ? " checked" : "") + '> <span>' + libelle +
      (note ? '<small class="impr-note">' + note + '</small>' : "") + '</span></label>';
  }
  function texteMep_(groupe, cle, libelle, exemple) {
    return '<label class="mep-champ mep-texte">' + libelle + ' <input type="text" maxlength="120" data-g="' + groupe + '" data-k="' + cle + '" placeholder="' + exemple + '" value="' + esc(mepEdition_[groupe][cle]) + '"></label>';
  }
  function choixMep_(cle, libelle, valeurs, groupe) {
    var actuel = groupe ? mepEdition_[groupe][cle] : mepEdition_[cle];
    return '<label class="mep-champ">' + libelle + ' <select' + (groupe ? ' data-g="' + groupe + '"' : '') + ' data-k="' + cle + '">' + valeurs.map(function (v) {
      return '<option value="' + v[0] + '"' + (actuel === v[0] ? " selected" : "") + ">" + v[1] + "</option>";
    }).join("") + "</select></label>";
  }
  function fmtMm_(v) { return String(Math.round(v * 10) / 10).replace(".", ","); }
  // Ligne d'aide sous les colonnes : ce qu'il reste, ou ce qui dépasse.
  function aideColonnes_(m) {
    var c = m.colonnes, n = JOURS.length, utile = largeurUtileMm_(m);
    var jf = c.jours === "fixe", nf = c.noms === "fixe";
    if (!jf && !nf) return { texte: "Les colonnes se partagent les " + fmtMm_(utile) + " mm utiles selon leur contenu.", alerte: false };
    if (jf && nf) {
      var total = c.largeurNoms + n * c.largeurJour;
      return total > utile + 0.05
        ? { texte: "Tableau : " + fmtMm_(total) + " mm pour " + fmtMm_(utile) + " mm utiles — dépasse de " + fmtMm_(total - utile) + " mm, la droite sera coupée à l’impression.", alerte: true }
        : { texte: "Tableau : " + fmtMm_(c.largeurNoms) + " + " + n + " × " + fmtMm_(c.largeurJour) + " = " + fmtMm_(total) + " mm, sur " + fmtMm_(utile) + " mm utiles.", alerte: false };
    }
    if (jf) {
      var reste = utile - n * c.largeurJour;
      return reste < 15
        ? { texte: "Jours : " + n + " × " + fmtMm_(c.largeurJour) + " = " + fmtMm_(n * c.largeurJour) + " mm — il ne reste que " + fmtMm_(Math.max(0, reste)) + " mm pour les noms sur " + fmtMm_(utile) + " mm utiles : le tableau risque d’être coupé à droite.", alerte: true }
        : { texte: "Jours : " + n + " × " + fmtMm_(c.largeurJour) + " = " + fmtMm_(n * c.largeurJour) + " mm ; il reste " + fmtMm_(reste) + " mm pour les noms.", alerte: false };
    }
    var parJour = (utile - c.largeurNoms) / n;
    return parJour < 15
      ? { texte: "Il ne reste que " + fmtMm_(utile - c.largeurNoms) + " mm pour les " + n + " jours : colonne des noms trop large.", alerte: true }
      : { texte: "Il reste " + fmtMm_(utile - c.largeurNoms) + " mm pour les " + n + " jours (" + fmtMm_(parJour) + " mm chacun, selon leur contenu).", alerte: false };
  }
  function formulaireMep_() {
    var ch = nomChantierChoisi_();
    return '<fieldset><legend>Page</legend>' +
        choixMep_("orientation", "Orientation", [["paysage", "Paysage"], ["portrait", "Portrait"]]) +
        choixMep_("taille", "Taille du texte", [["petite", "Petite"], ["normale", "Normale"], ["grande", "Grande"]]) +
      '</fieldset><fieldset><legend>Marges</legend>' +
        // Grille : les 4 champs à gauche, une accolade par paire (haut/bas,
        // gauche/droite), une grande pour les 4 (suite 44).
        '<div class="mep-marges">' +
          '<div style="grid-row:1;grid-column:1">' + champNombre_("marges", "haut", "Haut", 1) + '</div>' +
          '<div style="grid-row:2;grid-column:1">' + champNombre_("marges", "bas", "Bas", 1) + '</div>' +
          '<div style="grid-row:3;grid-column:1">' + champNombre_("marges", "gauche", "Gauche", 1) + '</div>' +
          '<div style="grid-row:4;grid-column:1">' + champNombre_("marges", "droite", "Droite", 1) + '</div>' +
          accoladeMep_("hautBas", "Lier haut et bas", 1, 2, 2) + accoladeMep_("gaucheDroite", "Lier gauche et droite", 3, 2, 2) +
          accoladeMep_("toutes", "Lier les 4 marges", 1, 4, 3) +
        '</div>' +
        '<small class="mep-aide">Accolades : marges liées, changées ensemble. L’en-tête et le pied de page s’écrivent dans les marges du haut et du bas : garder au moins 8 mm pour qu’ils aient la place.</small>' +
      '</fieldset><fieldset><legend>Colonnes</legend>' +
        choixMep_("jours", "Jours", [["dynamique", "Dynamiques"], ["fixe", "Largeur fixe"]], "colonnes") +
        champNombre_("colonnes", "largeurJour", "Un jour", 1, mepEdition_.colonnes.jours !== "fixe") +
        choixMep_("noms", "Noms", [["dynamique", "Dynamique"], ["fixe", "Largeur fixe"]], "colonnes") +
        champNombre_("colonnes", "largeurNoms", "Colonne des noms", 1, mepEdition_.colonnes.noms !== "fixe") +
        (function () { var a = aideColonnes_(mepEdition_); return '<small class="mep-aide mep-aide-colonnes' + (a.alerte ? ' alerte' : '') + '">' + esc(a.texte) + '</small>'; })() +
      '</fieldset><fieldset><legend>Espacements</legend>' +
        champNombre_("espaces", "personnes", "Entre les personnes", 0.1) + champNombre_("espaces", "sections", "Entre les sections", 0.1) +
        champNombre_("espaces", "cases", "Dans les cases", 0.1) + champNombre_("espaces", "legende", "Avant la légende", 0.1) +
      '</fieldset><fieldset><legend>En-tête</legend>' +
        texteMep_("entete", "texte", "Texte libre", "ex. Version du 25.09") +
        caseMep_("entete", "chantier", "Chantier choisi", ch ? "(" + esc(ch) + ")" : "(celui du sélecteur de la barre du planning — aucun choisi pour l’instant)") +
        caseMep_("entete", "date", "Date d’impression") +
      '</fieldset><fieldset><legend>Pied de page</legend>' +
        caseMep_("pied", "page", "Numéro de page", "(« Page 1 / 2 »)") +
        caseMep_("pied", "date", "Date d’impression") +
        texteMep_("pied", "texte", "Texte libre", "ex. Document interne") +
      '</fieldset>';
  }

  // Aperçu schématique (choix de Lionel : « Aperçu simplifié sans
  // données ») : une feuille A4 à l'échelle, ses marges en pointillés,
  // l'en-tête et le pied de page en vrai texte, et des barres grises à la
  // place du tableau (en-tête des jours, personnes, intervenants, légende),
  // espacées comme à l'impression.
  function dessinerApercuMep_() {
    var zone = document.getElementById("mepApercu");
    if (!zone) return;
    var m = mepEdition_, paysage = m.orientation !== "portrait";
    var Lmm = paysage ? 297 : 210, Hmm = paysage ? 210 : 297;
    var largeurDispo = Math.max(160, Math.min(zone.clientWidth || 420, paysage ? 520 : 380));
    var k = largeurDispo / Lmm; // px d'écran par mm de papier
    var px = function (mm) { return (mm * k).toFixed(2) + "px"; };
    var z = zonesMiseEnPage(m, new Date());
    var mg = m.marges, echelle = { petite: 0.82, normale: 1, grande: 1.2 }[m.taille];
    function bande(cote, textes) {
      var h = '<div class="mep-zone mep-zone-' + cote + '" style="left:' + px(mg.gauche) + ";right:" + px(mg.droite) + ";" +
        (cote === "haut" ? "top:0;height:" + px(mg.haut) : "bottom:0;height:" + px(mg.bas)) + ";font-size:" + px(2.8) + '">';
      ["g", "c", "d"].forEach(function (pos, i) {
        var t = textes[i] === "page" && cote === "bas" && i === 2 ? "Page 1 / 1" : textes[i];
        h += '<span class="mep-z-' + pos + '">' + esc(t || "") + "</span>";
      });
      return h + "</div>";
    }
    // Contenu : hauteurs en mm à l'échelle 1 de l'impression (ligne de
    // texte ~4 mm × taille du texte, + la marge intérieure des cases).
    // Colonnes (suite 44) : noms puis 5 jours, à leur largeur fixe, ou
    // estimée quand elle est dynamique (noms ~ 28 mm, jours = le reste
    // partagé) ; traits verticaux entre les jours ; un tableau plus large
    // que la largeur utile est coupé à droite, comme sur le papier
    // (hachures rouges au bord).
    var ligne = 4 * echelle + 2 * m.espaces.cases;
    var utile = largeurUtileMm_(m), n = JOURS.length, col = m.colonnes;
    var nomsMm = col.noms === "fixe" ? col.largeurNoms : Math.min(28, utile * 0.2);
    var jourMm = col.jours === "fixe" ? col.largeurJour : Math.max(0, (utile - nomsMm) / n);
    var tableMm = nomsMm + n * jourMm, depasse = tableMm > utile + 0.05;
    var c = '<div class="mep-tableau" style="width:' + px(tableMm) + '">';
    for (var j = 0; j <= n; j++) c += '<b class="mep-col" style="left:' + px(nomsMm + j * jourMm) + '"></b>';
    c += '<div class="mep-tete" style="height:' + px(ligne * 1.4) + '"></div>';
    function personnes(n0, nb) {
      for (var i = n0; i < n0 + nb; i++) {
        if (i > n0) c += '<div style="height:' + px(m.espaces.personnes) + '"></div>';
        // Tâche factice : de la demi-journée d à d + l (sur 10), dans la grille des jours.
        var d = (i * 3) % 9, l = Math.min(10 - d, 1 + (i * 7) % 4);
        c += '<div class="mep-ligne" style="height:' + px(ligne * (i % 3 === 1 ? 2 : 1)) + '"><span style="width:' + px(nomsMm) + '"></span>' +
          '<i style="left:' + px(nomsMm + d * jourMm / 2) + ';width:' + px(l * jourMm / 2) + '"></i></div>';
      }
    }
    personnes(0, paysage ? 6 : 9);
    c += '<div style="height:' + px(m.espaces.sections) + '"></div>';
    personnes(10, paysage ? 2 : 3);
    if (depasse) c += '<div class="mep-coupe" style="left:' + px(utile) + '" title="Tableau coupé à droite"></div>';
    c += '</div>';
    c += '<div class="mep-legende" style="margin-top:' + px(m.espaces.legende) + ";height:" + px(3.5 * echelle) + '"><i></i><i></i><i></i></div>';
    zone.innerHTML = '<div class="mep-feuille" style="width:' + px(Lmm) + ";height:" + px(Hmm) + '">' +
      '<div class="mep-cadre" style="top:' + px(mg.haut) + ";bottom:" + px(mg.bas) + ";left:" + px(mg.gauche) + ";right:" + px(mg.droite) + '">' + c + "</div>" +
      bande("haut", z.haut) + bande("bas", z.bas) + "</div>" +
      '<div class="mep-legende-apercu">A4 ' + (paysage ? "paysage" : "portrait") + " — aperçu simplifié, sans les données du planning.</div>";
  }

  function renderMiseEnPage() {
    mepEdition_ = lireMiseEnPage();
    var f = document.getElementById("mepFormulaire");
    if (!f) return;
    f.innerHTML = formulaireMep_();
    dessinerApercuMep_();
  }
  function etatSauvegardeMep_(texte, erreur) {
    var s = document.getElementById("mepEtat");
    if (!s) return;
    s.textContent = texte;
    s.classList.toggle("erreur", !!erreur);
  }
  function sauverMep_() {
    etatSauvegardeMep_("Enregistrement…");
    enregistrerMiseEnPage(mepEdition_, function (err) { etatSauvegardeMep_(err ? "Non enregistré sur le compte" : "Enregistré", !!err); });
    dessinerApercuMep_();
  }
  // Formulaire redessiné (colonne passée en fixe, accolade…) en gardant le
  // focus sur le même champ.
  function redessinerFormulaireMep_() {
    var f = document.getElementById("mepFormulaire");
    if (!f) return;
    var a = document.activeElement, cle = a && f.contains(a) && a.dataset.k ? '[data-k="' + a.dataset.k + '"]' + (a.dataset.g ? '[data-g="' + a.dataset.g + '"]' : '') : null;
    f.innerHTML = formulaireMep_();
    var cible = cle && f.querySelector(cle);
    if (cible) cible.focus();
  }
  function changementMep_(el, final) {
    var g = el.dataset.g, k = el.dataset.k;
    if (!k) return;
    var v = el.type === "checkbox" ? el.checked : el.value;
    if (el.type === "number") {
      v = parseFloat(String(v).replace(",", "."));
      if (!isFinite(v)) { if (final) el.value = (g ? mepEdition_[g][k] : mepEdition_[k]); return; }
    }
    if (g) mepEdition_[g][k] = v; else mepEdition_[k] = v;
    mepEdition_ = normaliserMiseEnPage_(mepEdition_);
    // Marges liées par une accolade (suite 44) : même valeur partout.
    var f = document.getElementById("mepFormulaire");
    if (g === "marges") {
      margesLiees_(mepEdition_, k).forEach(function (x) {
        mepEdition_.marges[x] = mepEdition_.marges[k];
        var champ = x !== k && f && f.querySelector('[data-g="marges"][data-k="' + x + '"]');
        if (champ) champ.value = mepEdition_.marges[x];
      });
    }
    // Valeur hors bornes : remise dans les bornes à la sortie du champ
    // seulement (pas pendant la frappe, « 1 » en route vers « 12 »).
    if (final && el.type === "number") el.value = mepEdition_[g][k];
    // Colonne passée en fixe ou dynamique : son champ de largeur s'active.
    if (g === "colonnes" && el.tagName === "SELECT") redessinerFormulaireMep_();
    else {
      // Aide des colonnes à jour (largeur utile, total) sans redessiner.
      var aide = f && f.querySelector(".mep-aide-colonnes");
      if (aide) { var a = aideColonnes_(mepEdition_); aide.textContent = a.texte; aide.classList.toggle("alerte", a.alerte); }
    }
    sauverMep_();
  }
  // Un pas de flèche : valeur du champ ± son pas, dans les bornes.
  function pasFlecheMep_(bouton) {
    var input = bouton.closest(".mep-nombre").querySelector("input");
    if (!input || input.disabled) return;
    var b = bornesMep_(input.dataset.g, input.dataset.k), pas = parseFloat(input.step) || 1;
    var v = parseFloat(String(input.value).replace(",", "."));
    if (!isFinite(v)) v = mepEdition_[input.dataset.g][input.dataset.k];
    // Arrondi au pas (0,1 mm) : pas de 1.6000000000000001.
    input.value = Math.min(b[1], Math.max(b[0], Math.round((v + pas * parseInt(bouton.dataset.sens, 10)) * 10) / 10));
    changementMep_(input, true);
  }
  function cablerPageMiseEnPage() {
    var f = document.getElementById("mepFormulaire");
    if (!f) return;
    f.addEventListener("input", function (e) { if (e.target.type !== "checkbox" && e.target.tagName !== "SELECT") changementMep_(e.target, false); });
    f.addEventListener("change", function (e) { changementMep_(e.target, true); });
    // Flèches : un pas à l'appui, puis répétition tant qu'on reste appuyé
    // (après 0,4 s, un pas toutes les 0,08 s). Le clic clavier (detail 0)
    // fait un pas ; le clic qui suit un appui au doigt/souris est ignoré
    // (déjà compté au pointerdown).
    var repetition = null;
    function stopRepetition() { clearTimeout(repetition); clearInterval(repetition); repetition = null; }
    f.addEventListener("pointerdown", function (e) {
      var b = e.target.closest(".mep-fleche");
      if (!b || b.disabled || e.button > 0) return;
      e.preventDefault();
      stopRepetition();
      pasFlecheMep_(b);
      repetition = setTimeout(function () { repetition = setInterval(function () { if (b.isConnected) pasFlecheMep_(b); else stopRepetition(); }, 80); }, 400);
    });
    ["pointerup", "pointercancel", "blur"].forEach(function (t) { window.addEventListener(t, stopRepetition); });
    f.addEventListener("pointerleave", stopRepetition);
    f.addEventListener("click", function (e) {
      var fl = e.target.closest(".mep-fleche");
      if (fl) { e.preventDefault(); if (e.detail === 0) pasFlecheMep_(fl); return; }
      var acc = e.target.closest(".mep-accolade");
      if (acc && !acc.disabled) {
        e.preventDefault();
        mepEdition_ = basculerLienMarges_(mepEdition_, acc.dataset.lien);
        redessinerFormulaireMep_();
        var nouv = f.querySelector('.mep-accolade[data-lien="' + acc.dataset.lien + '"]');
        if (nouv) nouv.focus();
        sauverMep_();
      }
    });
    document.getElementById("btnReinitMep").addEventListener("click", function () {
      mepEdition_ = miseEnPageDefaut();
      f.innerHTML = formulaireMep_();
      sauverMep_();
    });
    window.addEventListener("resize", function () {
      var p = document.getElementById("page-mise-en-page");
      if (p && p.classList.contains("actif") && mepEdition_) dessinerApercuMep_();
    });
  }
