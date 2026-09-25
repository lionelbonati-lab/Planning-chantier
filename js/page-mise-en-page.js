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
      pied: { page: true, date: true, texte: "" }
    };
  }
  var BORNES_MEP_ = { marges: [0, 40], espaces: [0, 15] };

  // Remet d'aplomb une valeur lue (serveur, cache, ancienne clé) : toute
  // clé manquante ou d'un mauvais type reprend sa valeur par défaut.
  function normaliserMiseEnPage_(src) {
    var m = miseEnPageDefaut();
    if (!src || typeof src !== "object") return m;
    if (src.orientation === "portrait" || src.orientation === "paysage") m.orientation = src.orientation;
    if (["petite", "normale", "grande"].indexOf(src.taille) >= 0) m.taille = src.taille;
    ["marges", "espaces"].forEach(function (groupe) {
      var s = src[groupe] || {};
      Object.keys(m[groupe]).forEach(function (k) {
        var v = parseFloat(s[k]);
        if (isFinite(v)) m[groupe][k] = Math.min(BORNES_MEP_[groupe][1], Math.max(BORNES_MEP_[groupe][0], Math.round(v * 10) / 10));
      });
    });
    ["entete", "pied"].forEach(function (groupe) {
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
  function champNombre_(groupe, cle, libelle, pas) {
    return '<label class="mep-champ">' + libelle + ' <span class="mep-unite"><input type="number" inputmode="decimal" data-g="' + groupe + '" data-k="' + cle + '" min="' +
      BORNES_MEP_[groupe][0] + '" max="' + BORNES_MEP_[groupe][1] + '" step="' + pas + '" value="' + mepEdition_[groupe][cle] + '"> mm</span></label>';
  }
  function caseMep_(groupe, cle, libelle, note) {
    return '<label class="impr-option"><input type="checkbox" data-g="' + groupe + '" data-k="' + cle + '"' + (mepEdition_[groupe][cle] ? " checked" : "") + '> <span>' + libelle +
      (note ? '<small class="impr-note">' + note + '</small>' : "") + '</span></label>';
  }
  function texteMep_(groupe, cle, libelle, exemple) {
    return '<label class="mep-champ mep-texte">' + libelle + ' <input type="text" maxlength="120" data-g="' + groupe + '" data-k="' + cle + '" placeholder="' + exemple + '" value="' + esc(mepEdition_[groupe][cle]) + '"></label>';
  }
  function choixMep_(cle, libelle, valeurs) {
    return '<label class="mep-champ">' + libelle + ' <select data-k="' + cle + '">' + valeurs.map(function (v) {
      return '<option value="' + v[0] + '"' + (mepEdition_[cle] === v[0] ? " selected" : "") + ">" + v[1] + "</option>";
    }).join("") + "</select></label>";
  }
  function formulaireMep_() {
    var ch = nomChantierChoisi_();
    return '<fieldset><legend>Page</legend>' +
        choixMep_("orientation", "Orientation", [["paysage", "Paysage"], ["portrait", "Portrait"]]) +
        choixMep_("taille", "Taille du texte", [["petite", "Petite"], ["normale", "Normale"], ["grande", "Grande"]]) +
      '</fieldset><fieldset><legend>Marges</legend>' +
        champNombre_("marges", "haut", "Haut", 1) + champNombre_("marges", "bas", "Bas", 1) +
        champNombre_("marges", "gauche", "Gauche", 1) + champNombre_("marges", "droite", "Droite", 1) +
        '<small class="mep-aide">L’en-tête et le pied de page s’écrivent dans les marges du haut et du bas : garder au moins 8 mm pour qu’ils aient la place.</small>' +
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
    var ligne = 4 * echelle + 2 * m.espaces.cases;
    var c = '<div class="mep-tete" style="height:' + px(ligne * 1.4) + '"></div>';
    function personnes(n) {
      for (var i = 0; i < n; i++) {
        if (i) c += '<div style="height:' + px(m.espaces.personnes) + '"></div>';
        c += '<div class="mep-ligne" style="height:' + px(ligne * (i % 3 === 1 ? 2 : 1)) + '"><span></span><i style="width:' + (20 + (i * 17) % 45) + '%;margin-left:' + ((i * 23) % 40) + '%"></i></div>';
      }
    }
    personnes(paysage ? 6 : 9);
    c += '<div style="height:' + px(m.espaces.sections) + '"></div>';
    personnes(paysage ? 2 : 3);
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
    // Valeur hors bornes : remise dans les bornes à la sortie du champ
    // seulement (pas pendant la frappe, « 1 » en route vers « 12 »).
    if (final && el.type === "number") el.value = mepEdition_[g][k];
    etatSauvegardeMep_("Enregistrement…");
    enregistrerMiseEnPage(mepEdition_, function (err) { etatSauvegardeMep_(err ? "Non enregistré sur le compte" : "Enregistré", !!err); });
    dessinerApercuMep_();
  }
  function cablerPageMiseEnPage() {
    var f = document.getElementById("mepFormulaire");
    if (!f) return;
    f.addEventListener("input", function (e) { if (e.target.type !== "checkbox" && e.target.tagName !== "SELECT") changementMep_(e.target, false); });
    f.addEventListener("change", function (e) { changementMep_(e.target, true); });
    document.getElementById("btnReinitMep").addEventListener("click", function () {
      mepEdition_ = miseEnPageDefaut();
      f.innerHTML = formulaireMep_();
      etatSauvegardeMep_("Enregistrement…");
      enregistrerMiseEnPage(mepEdition_, function (err) { etatSauvegardeMep_(err ? "Non enregistré sur le compte" : "Enregistré", !!err); });
      dessinerApercuMep_();
    });
    window.addEventListener("resize", function () {
      var p = document.getElementById("page-mise-en-page");
      if (p && p.classList.contains("actif") && mepEdition_) dessinerApercuMep_();
    });
  }
