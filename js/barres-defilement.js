"use strict";

// ─── Barres de défilement discrètes ─────────────────────────────────────
// Round du 26.09.2026 (suite 65) — Lionel, capture à l'appui : « une barre
// de défilement est apparu a droite sur mon planning alors qu'il y a encore
// de la place. Fait en sorte que toutes les barres de défilement soient des
// barres discrètes, visibles unique si il y a déplacement. »
//
// Principe : style.css masque TOUTES les barres natives (scrollbar-width:
// none + ::-webkit-scrollbar), qui prenaient de la place (≈ 17 px sous
// Windows) et restaient affichées en permanence. Ce module les remplace par
// une fine poignée (.barre-defilement, 6 px, position:fixed sur <body>)
// dessinée au-dessus de l'élément QUI DÉFILE, seulement pendant le
// défilement : elle apparaît au premier événement "scroll" (écouté en
// capture sur document, donc pour n'importe quel élément de la page —
// #app, .scroller, listes des fenêtres…) puis s'efface ~0,8 s après le
// dernier déplacement. Elle ne prend jamais de place dans la mise en page.
//
// Ignorés : un débordement de 2 px ou moins (arrondis de sous-pixels — pas
// de poignée pour « presque rien »), et les éléments en overflow:hidden
// dont le scrollLeft est seulement recopié par le code (ex.
// .entete-planning-scroll, calé sur .scroller — une poignée là ferait
// doublon avec celle du tableau).
//
// Tant qu'elle est visible, la poignée se saisit à la souris (glisser =
// faire défiler, comme une barre native) ; le survol la garde affichée.
// L'appui sur la poignée est intercepté en capture sur window, AVANT les
// écouteurs "extérieur = fermer" des fenêtres (cf. formulaires-communs.js),
// pour que saisir la poignée d'une liste dans une fenêtre ne la ferme pas.
(function () {
  var DELAI_MASQUAGE_ = 800;
  var TOLERANCE_ = 2;
  var MARGE_ = 2;
  var TAILLE_MIN_ = 24;
  var actifs_ = [];
  var glisse_ = null;

  function defile_(el, axe) {
    var cs = getComputedStyle(el);
    var ov = axe === "v" ? cs.overflowY : cs.overflowX;
    if (el !== document.scrollingElement && ov !== "auto" && ov !== "scroll") return false;
    return axe === "v"
      ? el.scrollHeight - el.clientHeight > TOLERANCE_
      : el.scrollWidth - el.clientWidth > TOLERANCE_;
  }

  function entree_(el) {
    for (var i = 0; i < actifs_.length; i++) if (actifs_[i].el === el) return actifs_[i];
    var e = { el: el, v: null, h: null, minuteur: null, survol: false };
    ["v", "h"].forEach(function (axe) {
      var p = document.createElement("div");
      p.className = "barre-defilement barre-defilement-" + axe;
      p.setAttribute("aria-hidden", "true");
      p.addEventListener("mouseenter", function () { e.survol = true; afficher_(e); });
      p.addEventListener("mouseleave", function () { e.survol = false; programmerMasquage_(e); });
      p._entree = e; p._axe = axe;
      document.body.appendChild(p);
      e[axe] = p;
    });
    actifs_.push(e);
    return e;
  }

  // Rectangle réellement visible de l'élément : intersection avec la
  // fenêtre, pour que la poignée horizontale d'un grand tableau (dont le
  // bas sort de l'écran) reste au bas de la PARTIE VISIBLE plutôt que
  // hors écran.
  function rectVisible_(el) {
    if (el === document.scrollingElement) return { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
    var r = el.getBoundingClientRect();
    return {
      top: Math.max(r.top + el.clientTop, 0),
      left: Math.max(r.left + el.clientLeft, 0),
      right: Math.min(r.left + el.clientLeft + el.clientWidth, window.innerWidth),
      bottom: Math.min(r.top + el.clientTop + el.clientHeight, window.innerHeight)
    };
  }

  function placer_(e) {
    var el = e.el;
    if (!el.isConnected) { retirer_(e); return; }
    var r = rectVisible_(el);
    var visibleV = defile_(el, "v") && r.bottom - r.top > TAILLE_MIN_ && r.right > r.left;
    var visibleH = defile_(el, "h") && r.right - r.left > TAILLE_MIN_ && r.bottom > r.top;
    e.v.classList.toggle("utile", visibleV);
    e.h.classList.toggle("utile", visibleH);
    if (visibleV) {
      var hautV = r.bottom - r.top - 2 * MARGE_;
      var tV = Math.max(TAILLE_MIN_, hautV * el.clientHeight / el.scrollHeight);
      var maxV = el.scrollHeight - el.clientHeight;
      var yV = r.top + MARGE_ + (hautV - tV) * Math.min(1, Math.max(0, el.scrollTop / maxV));
      e.v.style.height = tV + "px";
      e.v.style.transform = "translate(" + (r.right - MARGE_) + "px," + yV + "px)";
    }
    if (visibleH) {
      var largH = r.right - r.left - 2 * MARGE_;
      var tH = Math.max(TAILLE_MIN_, largH * el.clientWidth / el.scrollWidth);
      var maxH = el.scrollWidth - el.clientWidth;
      var xH = r.left + MARGE_ + (largH - tH) * Math.min(1, Math.max(0, Math.abs(el.scrollLeft) / maxH));
      e.h.style.width = tH + "px";
      e.h.style.transform = "translate(" + xH + "px," + (r.bottom - MARGE_) + "px)";
    }
  }

  function afficher_(e) {
    clearTimeout(e.minuteur);
    e.v.classList.add("visible");
    e.h.classList.add("visible");
  }

  function programmerMasquage_(e) {
    clearTimeout(e.minuteur);
    e.minuteur = setTimeout(function () {
      if (e.survol || (glisse_ && glisse_.entree === e)) return;
      e.v.classList.remove("visible");
      e.h.classList.remove("visible");
    }, DELAI_MASQUAGE_);
  }

  function retirer_(e) {
    clearTimeout(e.minuteur);
    e.v.remove(); e.h.remove();
    actifs_ = actifs_.filter(function (x) { return x !== e; });
  }

  function surDefilement_(ev) {
    var el = ev.target === document ? document.scrollingElement : ev.target;
    if (!el || el.nodeType !== 1) return;
    if (!defile_(el, "v") && !defile_(el, "h")) return;
    var e = entree_(el);
    // Tout défilement peut déplacer les autres éléments à l'écran (ex. #app
    // qui glisse sous la poignée horizontale de .scroller) : on replace
    // toutes les poignées encore affichées, pas seulement la sienne.
    actifs_.slice().forEach(function (x) { if (x === e || x.v.classList.contains("visible")) placer_(x); });
    afficher_(e);
    programmerMasquage_(e);
  }

  // Glisser la poignée (souris) : même rapport qu'une barre native, le
  // déplacement de la poignée sur sa piste ↔ tout le défilement possible.
  function surAppui_(ev) {
    var p = ev.target;
    if (!p || !p.classList || !p.classList.contains("barre-defilement")) return;
    ev.stopPropagation();
    ev.preventDefault();
    if (ev.type !== "pointerdown" || ev.button !== 0) return;
    var e = p._entree, el = e.el, axe = p._axe;
    var r = rectVisible_(el);
    var piste = axe === "v" ? r.bottom - r.top - 2 * MARGE_ : r.right - r.left - 2 * MARGE_;
    var taille = axe === "v" ? p.offsetHeight : p.offsetWidth;
    var max = axe === "v" ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
    glisse_ = {
      entree: e, axe: axe,
      depart: axe === "v" ? ev.clientY : ev.clientX,
      pos: axe === "v" ? el.scrollTop : el.scrollLeft,
      ratio: piste - taille > 0 ? max / (piste - taille) : 0
    };
    p.classList.add("saisie");
    afficher_(e);
  }

  function surDeplacement_(ev) {
    if (!glisse_) return;
    var d = (glisse_.axe === "v" ? ev.clientY : ev.clientX) - glisse_.depart;
    var el = glisse_.entree.el;
    if (glisse_.axe === "v") el.scrollTop = glisse_.pos + d * glisse_.ratio;
    else el.scrollLeft = glisse_.pos + d * glisse_.ratio;
  }

  function surRelache_() {
    if (!glisse_) return;
    var e = glisse_.entree;
    e.v.classList.remove("saisie"); e.h.classList.remove("saisie");
    glisse_ = null;
    programmerMasquage_(e);
  }

  document.addEventListener("scroll", surDefilement_, { capture: true, passive: true });
  ["pointerdown", "mousedown", "click", "auxclick", "contextmenu"].forEach(function (t) {
    window.addEventListener(t, surAppui_, true);
  });
  window.addEventListener("pointermove", surDeplacement_, true);
  window.addEventListener("pointerup", surRelache_, true);
  window.addEventListener("pointercancel", surRelache_, true);
  window.addEventListener("resize", function () {
    actifs_.slice().forEach(function (x) { if (x.v.classList.contains("visible")) placer_(x); });
  });
})();
