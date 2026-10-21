"use strict";
  /* ============================================================
     DÉTAILS ET FICHIERS JOINTS DES TÂCHES — round du 21.10.2026 (suite 147)
     ------------------------------------------------------------
     Lionel : « J'aimerais pouvoir rajouter des détails à mes tâches
     J'aimerais pouvoir leur joindre des fichiers, photos ou PDF. » Ses
     choix : « Dans la fiche » (texte long visible en ouvrant la tâche ; la
     bulle garde son texte court et une petite icône) ; visibles aussi sur
     le « Lien des ouvriers » et le « Lien responsable » ; fichiers ajoutés
     « Seulement toi » (depuis l'appli, ordinateur ou téléphone) ; photos
     « Originales ».

     Données (sql/0041) : taches.details (texte) et taches.pieces (tableau
     { chemin, nom, type, taille, vignette }), portés comme le texte par
     chaque ligne demi-journée de la bulle (même fusion, mêmes copies).
     Fichiers dans le dossier privé « pieces » de Supabase Storage :
       fichiers/<id>/<nom>  l'original, tel quel ;
       vignettes/<id>.jpg   pour une photo, une image de 360 px au plus,
                            faite ici (liste de la fiche, liens sur
                            téléphone) — l'original reste intact.
     Ouvrir : adresse signée, valable 1 heure (les liens anonymes passent
     par la fonction serveur pieces-lien). Retirer un fichier de la fiche
     ne l'efface pas tout de suite (Annuler, les copies de la tâche et les
     sauvegardes le citent encore) : pieces_orphelines() liste ceux que
     plus rien ne cite depuis 7 jours, effacés une fois par jour au plus
     (nettoyerPiecesOrphelines_).

     Un tableau `pieces` n'est jamais modifié sur place (les copies
     d'Annuler, clonerListe, le partagent) : toujours remplacé.
     ============================================================ */
  var BUCKET_PIECES_ = "pieces";
  var TAILLE_MAX_PIECE_ = 50 * 1024 * 1024; // limite du dossier (forfait gratuit)
  var COTE_VIGNETTE_ = 360;

  var ICONE_TROMBONE_ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 11.5 12.6 19.9a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"/></svg>';
  var ICONE_DETAILS_ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 6h14M5 11h14M5 16h9"/></svg>';
  var ICONE_PHOTO_ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-8 8"/></svg>';
  var ICONE_DOCUMENT_ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';

  // ---- Données -----------------------------------------------------------

  // Forme fixe (même ordre des clés partout) : les comparaisons en JSON
  // (moteur de diff, fusion des demi-journées) ne voient jamais deux fois
  // le même fichier comme différent.
  function normaliserPieces_(pieces) {
    if (!Array.isArray(pieces)) return [];
    return pieces.filter(function (p) { return p && typeof p.chemin === "string" && p.chemin; }).map(function (p) {
      return { chemin: p.chemin, nom: String(p.nom || p.chemin.split("/").pop()), type: String(p.type || ""), taille: Math.max(0, +p.taille || 0), vignette: p.vignette || null };
    });
  }
  function clePieces_(pieces) { return JSON.stringify(normaliserPieces_(pieces).map(function (p) { return p.chemin; })); }
  function detailsTexte_(d) { return d == null ? null : (String(d).trim() || null); }
  // Même contenu de détails et de fichiers (fusion des demi-journées,
  // construireVueDepuisCache ; séries).
  function memesDetailsPieces_(a, b) {
    return detailsTexte_(a && a.details) === detailsTexte_(b && b.details) && clePieces_(a && a.pieces) === clePieces_(b && b.pieces);
  }
  function aDetailsOuPieces_(it) { return !!(it && (detailsTexte_(it.details) || (it.pieces && it.pieces.length))); }

  // Nom rangé dans le dossier : lettres sans accents, chiffres, . _ - ( ) et
  // espace (seuls caractères qu'accepte Supabase Storage) ; le vrai nom
  // reste dans `nom`.
  function nomFichierStockage_(nom) {
    var s = String(nom || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._() -]+/g, "_")
      .replace(/_+/g, "_").replace(/^[ ._]+|[ ._]+$/g, "");
    if (s.length > 100) {
      var ext = (s.match(/\.[A-Za-z0-9]{1,8}$/) || [""])[0];
      s = s.slice(0, 100 - ext.length) + ext;
    }
    return s || "fichier";
  }
  function idPiece_() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* contexte non sécurisé */ }
    var h = "";
    for (var i = 0; i < 32; i++) h += Math.floor(Math.random() * 16).toString(16);
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }
  function tailleLisible_(n) {
    if (!(n > 0)) return "";
    if (n < 1024) return "< 1 Ko";
    if (n < 1024 * 1024) return Math.round(n / 1024) + " Ko";
    return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0).replace(".", ",") + " Mo";
  }
  function estImagePiece_(p) { return /^image\//.test(p.type || "") || /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(p.nom || ""); }

  // Vignette d'une photo (JPEG, 360 px au plus) ; null si le navigateur ne
  // sait pas la lire (HEIC sur ordinateur, fichier abîmé…).
  function vignetteImage_(fichier) {
    if (!/^image\//.test(fichier.type || "") || typeof createImageBitmap !== "function") return Promise.resolve(null);
    return createImageBitmap(fichier).then(function (img) {
      var r = Math.min(1, COTE_VIGNETTE_ / Math.max(img.width, img.height));
      var c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * r));
      c.height = Math.max(1, Math.round(img.height * r));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      if (img.close) img.close();
      return new Promise(function (ok) { c.toBlob(function (b) { ok(b || null); }, "image/jpeg", 0.82); });
    }).catch(function () { return null; });
  }

  // Envoie un fichier (puis sa vignette) ; résout avec la pièce à joindre.
  function envoyerPiece_(fichier) {
    if (fichier.size > TAILLE_MAX_PIECE_) return Promise.reject(new Error("plus de 50 Mo"));
    var id = idPiece_();
    var chemin = "fichiers/" + id + "/" + nomFichierStockage_(fichier.name);
    var depot = sbClient.storage.from(BUCKET_PIECES_);
    return depot.upload(chemin, fichier, { contentType: fichier.type || "application/octet-stream", cacheControl: "31536000", upsert: false }).then(function (res) {
      if (res.error) throw res.error;
      return vignetteImage_(fichier);
    }).then(function (blob) {
      var piece = { chemin: chemin, nom: fichier.name || "fichier", type: fichier.type || "", taille: fichier.size || 0, vignette: null };
      if (!blob) return piece;
      var cheminV = "vignettes/" + id + ".jpg";
      return depot.upload(cheminV, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false }).then(function (r) {
        if (!r.error) piece.vignette = cheminV;
        return piece;
      }, function () { return piece; });
    });
  }

  // Adresses signées (1 h) : { chemin: adresse }. Un échec rend {} (la
  // liste s'affiche quand même, sans lien).
  function adressesPieces_(chemins) {
    chemins = chemins.filter(Boolean);
    if (!chemins.length) return Promise.resolve({});
    return Promise.resolve(sbClient.storage.from(BUCKET_PIECES_).createSignedUrls(chemins, 3600)).then(function (res) {
      var urls = {};
      ((res && res.data) || []).forEach(function (s) { if (s && s.path && s.signedUrl && !s.error) urls[s.path] = s.signedUrl; });
      return urls;
    }).catch(function () { return {}; });
  }

  // ---- Bulle ---------------------------------------------------------------

  // Petite icône devant le texte de la bulle : trombone (fichiers) ou
  // lignes (détails seuls).
  function iconeJointBulle_(it) {
    if (!aDetailsOuPieces_(it)) return "";
    var n = (it.pieces || []).length;
    return '<span class="b-joint" title="' + esc2(libelleJoint_(it)) + '">' + (n ? ICONE_TROMBONE_ : ICONE_DETAILS_) + '</span>';
  }
  function libelleJoint_(it) {
    var n = (it.pieces || []).length, morceaux = [];
    if (detailsTexte_(it.details)) morceaux.push("détails");
    if (n) morceaux.push(n + " fichier" + (n > 1 ? "s" : ""));
    return morceaux.join(", ");
  }

  // ---- Fiche de la tâche -------------------------------------------------

  function sectionDetailsPiecesHTML_() {
    return '<div class="label-champ pj-titre">Détails</div>' +
      '<div class="details-texte" tabindex="0"></div>' +
      '<div class="pj-entete"><span class="label-champ">Fichiers</span>' +
      '<button type="button" class="pj-ajouter">' + ICONE_TROMBONE_ + '<span>Joindre</span></button></div>' +
      '<ul class="pj-liste"></ul>' +
      '<input type="file" class="pj-input" multiple hidden>';
  }

  // Câble la section ; lecture au moment d'enregistrer : details() (texte
  // ou null), pieces() (nouveau tableau), enCours() (envois pas finis).
  function cablerDetailsPieces_(pop, itemExisting) {
    var details = (itemExisting && itemExisting.details) || "";
    var pieces = normaliserPieces_(itemExisting && itemExisting.pieces);
    var envois = []; // { nom } en cours d'envoi
    var urls = {}, apercus = {}; // chemin -> adresse signée / aperçu local (fichier tout juste choisi)
    var liste = pop.querySelector(".pj-liste"), input = pop.querySelector(".pj-input");
    cablerDescriptifEdit(pop, function () { return details; }, function (v) { details = v; }, "Cliquer pour ajouter des détails…",
      { selecteur: ".details-texte", titre: "Modifier les détails", long: true });

    function apercuHTML(p) {
      var src = apercus[p.chemin] || (p.vignette && urls[p.vignette]);
      if (src) return '<span class="pj-apercu pj-photo"><img src="' + esc2(src) + '" alt=""></span>';
      return '<span class="pj-apercu">' + (estImagePiece_(p) ? ICONE_PHOTO_ : ICONE_DOCUMENT_) +
        (/pdf/i.test(p.type) || /\.pdf$/i.test(p.nom) ? '<b>PDF</b>' : '') + '</span>';
    }
    function afficher() {
      liste.innerHTML = pieces.map(function (p, i) {
        var url = urls[p.chemin];
        var corps = apercuHTML(p) + '<span class="pj-nom">' + esc(p.nom) + '</span><span class="pj-taille">' + esc(tailleLisible_(p.taille)) + '</span>';
        return '<li class="pj-item">' + (url ? '<a class="pj-lien" href="' + esc2(url) + '" target="_blank" rel="noopener">' + corps + '</a>' : '<span class="pj-lien">' + corps + '</span>') +
          '<button type="button" class="pj-retirer" data-i="' + i + '" title="Retirer ce fichier" aria-label="Retirer ' + esc2(p.nom) + '">' + ICONE_FERMER + '</button></li>';
      }).join("") + envois.map(function (e) {
        return '<li class="pj-item pj-envoi"><span class="pj-lien"><span class="pj-apercu">' + ICONE_DOCUMENT_ + '</span><span class="pj-nom">' + esc(e.nom) +
          '</span><span class="pj-taille">Envoi…</span></span></li>';
      }).join("");
      liste.hidden = !pieces.length && !envois.length;
    }
    function signer(lot) {
      var chemins = [];
      lot.forEach(function (p) { if (!urls[p.chemin]) chemins.push(p.chemin); if (p.vignette && !urls[p.vignette]) chemins.push(p.vignette); });
      if (!chemins.length) return;
      adressesPieces_(chemins).then(function (u) { Object.assign(urls, u); if (pop.isConnected) afficher(); });
    }
    liste.addEventListener("click", function (e) {
      var b = e.target.closest(".pj-retirer");
      if (!b) return;
      var p = pieces[+b.dataset.i];
      if (!p) return;
      pieces = pieces.filter(function (x) { return x !== p; });
      afficher();
    });
    pop.querySelector(".pj-ajouter").addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () {
      var fichiers = Array.prototype.slice.call(input.files || []);
      input.value = "";
      fichiers.forEach(function (f) {
        if (f.size > TAILLE_MAX_PIECE_) { toast("« " + f.name + " » dépasse 50 Mo : pas joint."); return; }
        var e = { nom: f.name || "fichier" };
        envois.push(e);
        envoyerPiece_(f).then(function (p) {
          if (estImagePiece_(p) && window.URL && URL.createObjectURL) apercus[p.chemin] = URL.createObjectURL(f);
          pieces = pieces.concat([p]);
          signer([p]);
        }, function (err) {
          toast("« " + e.nom + " » n’a pas pu être envoyé" + (err && err.message ? " : " + err.message : "") + ".");
        }).then(function () {
          envois = envois.filter(function (x) { return x !== e; });
          if (pop.isConnected) afficher();
        });
      });
      afficher();
    });
    afficher();
    signer(pieces);
    return {
      details: function () { return detailsTexte_(details); },
      pieces: function () { return pieces.slice(); },
      enCours: function () { return envois.length > 0; }
    };
  }

  // ---- Nettoyage --------------------------------------------------------
  // Une fois par jour au plus, par appareil : fichiers que plus aucune
  // tâche ni sauvegarde ne cite depuis 7 jours (pieces_orphelines, sql/0041).
  // Silencieux : un échec (base pas encore à jour, sans réseau) réessaie le
  // lendemain.
  var CLE_NETTOYAGE_PIECES_ = "planning.piecesNettoyees";
  function nettoyerPiecesOrphelines_() {
    var maintenant = Date.now(), dernier = 0;
    try { dernier = +localStorage.getItem(CLE_NETTOYAGE_PIECES_) || 0; } catch (e) { /* stockage bloqué */ }
    if (maintenant - dernier < 24 * 3600 * 1000 || typeof sbClient === "undefined" || typeof sbClient.rpc !== "function" || !sbClient.storage) return Promise.resolve(0);
    try { localStorage.setItem(CLE_NETTOYAGE_PIECES_, String(maintenant)); } catch (e) { /* stockage bloqué */ }
    return new Promise(function (ok) { ok(sbClient.rpc("pieces_orphelines")); }).then(function (res) {
      var noms = (res && !res.error && Array.isArray(res.data) ? res.data : []).map(function (r) { return typeof r === "string" ? r : r && r.pieces_orphelines; }).filter(Boolean);
      if (!noms.length) return 0;
      return Promise.resolve(sbClient.storage.from(BUCKET_PIECES_).remove(noms)).then(function (r) { return r && r.error ? 0 : noms.length; });
    }).catch(function () { return 0; });
  }
