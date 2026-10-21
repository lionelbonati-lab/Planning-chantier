"use strict";
  /* ============================================================
     EMPLACEMENT D'UN CHANTIER — round du 21.10.2026 (suite 145)
     ------------------------------------------------------------
     Lionel : « J'aimerai pouvoir ajouter une adresse, sur un chantier, afin
     que mes ouvriers puisse cliquer sur le nom du chantier et que ça leur
     ouvre leur navigation gps. » Ses choix : saisie par « un pin sur une
     carte » ; appli GPS « Au choix » ; cliquable sur le « Lien des
     ouvriers » et le « Lien responsable » (js/gps.js).

     Réglages › Chantiers, bouton pin d'un chantier → ouvrirEmplacementChantier :
       - une carte (Leaflet 1.9.4, copié dans js/vendor/leaflet/ et chargé
         seulement à la première ouverture) : « Plan » (OpenStreetMap) ou
         « Photo » (photo aérienne swisstopo, Suisse), choix gardé par
         l'appareil ;
       - toucher la carte pose le pin, on le glisse pour l'ajuster ;
       - « Chercher » : une adresse ou un lieu (OpenStreetMap / Nominatim,
         une recherche par appui — pas à chaque lettre, comme le demandent
         ses règles d'usage), ou des coordonnées collées (« 46.5197,
         6.6323 », copiées de Google Maps) ; plusieurs résultats : une
         liste à toucher ;
       - « Ma position » : le pin là où se trouve le téléphone (sur le
         chantier) ;
       - « Retirer le pin », « Annuler », « Enregistrer » (grisé tant que
         rien n'a changé).
     Le pin = chantiers.latitude / longitude (sql/0040), 6 décimales
     (~10 cm), envoyé avec chaque tâche par les fonctions des liens.
     ============================================================ */

  var CARTE_LEAFLET_ = null;          // promesse du chargement de Leaflet
  var CLE_COUCHE_CARTE = "planning.carte.couche";
  // Sans aucun pin : la Suisse entière.
  var CENTRE_DEFAUT_CARTE = [46.8, 8.2], ZOOM_DEFAUT_CARTE = 8;

  function chargerLeaflet_() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (CARTE_LEAFLET_) return CARTE_LEAFLET_;
    CARTE_LEAFLET_ = new Promise(function (ok, ko) {
      var css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "js/vendor/leaflet/leaflet.css";
      document.head.appendChild(css);
      var s = document.createElement("script");
      s.src = "js/vendor/leaflet/leaflet.js";
      s.onload = function () { if (window.L && window.L.map) ok(window.L); else { CARTE_LEAFLET_ = null; ko(new Error("carte")); } };
      s.onerror = function () { CARTE_LEAFLET_ = null; ko(new Error("carte")); };
      document.head.appendChild(s);
    });
    return CARTE_LEAFLET_;
  }

  // « 46.5197, 6.6323 », « 46.5197 6.6323 » ou « 46,5197, 6,6323 » →
  // [lat, lng] ; null si ce ne sont pas des coordonnées.
  function coordonneesDansTexte_(texte) {
    var m = /^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/.exec(texte || "");
    if (!m) return null;
    var lat = parseFloat(m[1].replace(",", ".")), lng = parseFloat(m[2].replace(",", "."));
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return null;
    return [lat, lng];
  }
  function arrondiCoordonnee_(x) { return Math.round(x * 1e6) / 1e6; }
  function libelleCoordonnees_(lat, lng) { return lat.toFixed(5) + ", " + lng.toFixed(5); }

  function ouvrirEmplacementChantier(c) {
    var voile = document.createElement("div");
    voile.className = "voile-confirm";
    var pop = document.createElement("div");
    pop.className = "pop carte-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Emplacement — " + c.nom);
    pop.innerHTML =
      '<div class="carte-tete"><div class="cp-titre">Emplacement — ' + esc(c.nom) + '</div>' +
        '<button type="button" class="carte-fermer btn-icone-ligne" title="Fermer" aria-label="Fermer">' + ICONS.close + '</button></div>' +
      '<form class="carte-recherche" autocomplete="off">' +
        '<input type="search" class="carte-texte" placeholder="Adresse, lieu ou coordonnées" aria-label="Adresse, lieu ou coordonnées" enterkeyhint="search">' +
        '<button type="submit" class="carte-chercher">Chercher</button>' +
      '</form>' +
      '<div class="carte-resultats" hidden></div>' +
      '<div class="carte-cadre">' +
        '<div class="carte-zone"><p class="carte-message">Chargement de la carte…</p></div>' +
        '<div class="carte-couches" role="group" aria-label="Fond de carte">' +
          '<button type="button" data-couche="plan">Plan</button><button type="button" data-couche="photo">Photo</button>' +
        '</div>' +
        '<button type="button" class="carte-position">' + ICONS.pin + '<span>Ma position</span></button>' +
      '</div>' +
      '<p class="carte-aide"></p>' +
      '<div class="carte-actions">' +
        '<button type="button" class="carte-retirer danger">Retirer le pin</button>' +
        '<span class="carte-espace"></span>' +
        '<button type="button" class="carte-annuler">Annuler</button>' +
        '<button type="button" class="carte-ok">Enregistrer</button>' +
      '</div>';
    document.body.appendChild(voile);
    document.body.appendChild(pop);

    var initial = c.lat != null && c.lng != null ? [c.lat, c.lng] : null;
    var pin = initial ? initial.slice() : null;
    var carte = null, marqueur = null, couches = {};
    var champ = pop.querySelector(".carte-texte");
    var zoneResultats = pop.querySelector(".carte-resultats");
    var aide = pop.querySelector(".carte-aide");
    var btnOk = pop.querySelector(".carte-ok");
    var btnRetirer = pop.querySelector(".carte-retirer");

    function fermer() {
      if (carte) carte.remove();
      voile.remove(); pop.remove();
      if (popFermerActuel === fermer) popFermerActuel = null;
    }
    popFermerActuel = fermer;     // Échap (cf. clavier, js/formulaires-communs.js)
    voile.addEventListener("pointerdown", fermer);
    pop.querySelector(".carte-fermer").addEventListener("click", fermer);
    pop.querySelector(".carte-annuler").addEventListener("click", fermer);

    function change() {
      if (!pin || !initial) return !!pin !== !!initial;
      return arrondiCoordonnee_(pin[0]) !== arrondiCoordonnee_(initial[0]) || arrondiCoordonnee_(pin[1]) !== arrondiCoordonnee_(initial[1]);
    }
    function majEtat() {
      btnOk.disabled = !change();
      btnRetirer.hidden = !pin;
      aide.textContent = pin
        ? "Pin : " + libelleCoordonnees_(pin[0], pin[1]) + ". Glisse-le pour l’ajuster."
        : "Touche la carte pour poser le pin, ou cherche une adresse.";
    }
    function iconePin(L) {
      return L.divIcon({ className: "carte-pin", html: ICONS.pin, iconSize: [34, 34], iconAnchor: [17, 32] });
    }
    function poser(lat, lng, zoom) {
      pin = [lat, lng];
      if (carte) {
        var L = window.L;
        if (!marqueur) {
          marqueur = L.marker(pin, { icon: iconePin(L), draggable: true, keyboard: false }).addTo(carte);
          marqueur.on("dragend", function () { var p = marqueur.getLatLng(); pin = [p.lat, p.lng]; majEtat(); });
        } else {
          marqueur.setLatLng(pin);
        }
        if (zoom) carte.setView(pin, Math.max(carte.getZoom(), zoom));
      }
      majEtat();
    }
    btnRetirer.addEventListener("click", function () {
      pin = null;
      if (marqueur) { marqueur.remove(); marqueur = null; }
      majEtat();
    });
    btnOk.addEventListener("click", function () {
      if (!change()) return;
      var lat = pin ? arrondiCoordonnee_(pin[0]) : null, lng = pin ? arrondiCoordonnee_(pin[1]) : null;
      btnOk.disabled = true;
      majEmplacementChantierServeur(c.ligne, lat, lng).then(function (r) {
        fermer();
        rafraichirApresChantiers(r);
        toast(pin ? "Emplacement de « " + c.nom + " » enregistré." : "Pin de « " + c.nom + " » retiré.");
      }).catch(function (err) {
        btnOk.disabled = false;
        toast("Échec de l’enregistrement : " + (err && err.message ? err.message : err));
      });
    });

    // ---- Recherche --------------------------------------------------------
    function montrerResultats(liste) {
      zoneResultats.innerHTML = liste.map(function (r, i) {
        return '<button type="button" data-i="' + i + '">' + esc(r.display_name) + "</button>";
      }).join("");
      zoneResultats.hidden = !liste.length;
      zoneResultats.querySelectorAll("button").forEach(function (b) {
        b.addEventListener("click", function () {
          var r = liste[+b.dataset.i];
          zoneResultats.hidden = true;
          poser(+r.lat, +r.lon, 17);
        });
      });
    }
    pop.querySelector(".carte-recherche").addEventListener("submit", function (e) {
      e.preventDefault();
      var texte = champ.value.trim();
      if (!texte) return;
      var xy = coordonneesDansTexte_(texte);
      if (xy) { zoneResultats.hidden = true; poser(xy[0], xy[1], 17); return; }
      var btn = pop.querySelector(".carte-chercher");
      btn.disabled = true;
      fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=fr&q=" + encodeURIComponent(texte))
        .then(function (rep) { if (!rep.ok) throw new Error("HTTP " + rep.status); return rep.json(); })
        .then(function (liste) {
          liste = (liste || []).filter(function (r) { return isFinite(+r.lat) && isFinite(+r.lon); });
          if (!liste.length) { montrerResultats([]); toast("Aucun résultat pour « " + texte + " »."); return; }
          if (liste.length === 1) { montrerResultats([]); poser(+liste[0].lat, +liste[0].lon, 17); return; }
          montrerResultats(liste);
        })
        .catch(function () { toast("Recherche impossible : vérifie la connexion."); })
        .then(function () { btn.disabled = false; });
    });

    // ---- Ma position --------------------------------------------------------
    var btnPosition = pop.querySelector(".carte-position");
    btnPosition.addEventListener("click", function () {
      if (!navigator.geolocation) { toast("Position indisponible sur cet appareil."); return; }
      btnPosition.disabled = true;
      navigator.geolocation.getCurrentPosition(function (p) {
        btnPosition.disabled = false;
        poser(p.coords.latitude, p.coords.longitude, 18);
      }, function () {
        btnPosition.disabled = false;
        toast("Position refusée ou introuvable.");
      }, { enableHighAccuracy: true, timeout: 15000 });
    });

    // ---- Carte --------------------------------------------------------------
    function choisirCouche(nom) {
      if (!carte || !couches[nom]) return;
      Object.keys(couches).forEach(function (k) { if (k !== nom && carte.hasLayer(couches[k])) carte.removeLayer(couches[k]); });
      if (!carte.hasLayer(couches[nom])) couches[nom].addTo(carte);
      pop.querySelectorAll(".carte-couches button").forEach(function (b) { b.classList.toggle("actif", b.dataset.couche === nom); });
      try { localStorage.setItem(CLE_COUCHE_CARTE, nom); } catch (e) {}
    }
    pop.querySelectorAll(".carte-couches button").forEach(function (b) {
      b.addEventListener("click", function () { choisirCouche(b.dataset.couche); });
    });

    majEtat();
    chargerLeaflet_().then(function (L) {
      if (!pop.isConnected) return;
      var zone = pop.querySelector(".carte-zone");
      zone.innerHTML = "";
      // Sans pin : centrée sur les chantiers déjà placés, sinon la Suisse.
      var places = (etat.chantiers || []).filter(function (x) { return x.lat != null && x.lng != null; });
      carte = L.map(zone, { zoomControl: true, maxZoom: 20 });
      carte.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
      if (pin) carte.setView(pin, 17);
      else if (places.length) carte.fitBounds(places.map(function (x) { return [x.lat, x.lng]; }), { maxZoom: 13, padding: [30, 30] });
      else carte.setView(CENTRE_DEFAUT_CARTE, ZOOM_DEFAUT_CARTE);
      couches.plan = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 20, maxNativeZoom: 19, attribution: "© <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">OpenStreetMap</a>"
      });
      couches.photo = L.tileLayer("https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg", {
        maxZoom: 20, maxNativeZoom: 20, attribution: "© <a href=\"https://www.swisstopo.admin.ch\" target=\"_blank\" rel=\"noopener\">swisstopo</a>"
      });
      var memoire = null;
      try { memoire = localStorage.getItem(CLE_COUCHE_CARTE); } catch (e) {}
      choisirCouche(couches[memoire] ? memoire : "plan");
      carte.on("click", function (e) { poser(e.latlng.lat, e.latlng.lng); });
      if (pin) { var p = pin; marqueur = null; poser(p[0], p[1]); }
      // La boîte vient d'apparaître : Leaflet remesure sa taille.
      setTimeout(function () { if (carte) carte.invalidateSize(); }, 50);
    }).catch(function () {
      var zone = pop.querySelector(".carte-zone");
      if (zone) zone.innerHTML = '<p class="carte-message">Carte indisponible : vérifie la connexion, puis réessaie.</p>';
    });
    champ.focus();
  }
