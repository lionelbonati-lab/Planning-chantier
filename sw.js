/* ============================================================
   SERVICE WORKER — round du 25.09.2026 (suite 52), mode hors ligne
   ------------------------------------------------------------
   Lionel (proposition 13) : « consulter le planning et noter des
   changements sans réseau ». Ce fichier ne s'occupe que de l'APPLI
   elle-même (HTML, CSS, JS, supabase-js, polices, icônes) : l'ouvrir sans
   réseau. Les données (Supabase) sont gardées par js/hors-ligne.js.

   Stratégie « réseau d'abord » : avec du réseau, toujours la dernière
   version publiée (GitHub Pages), et la copie est mise à jour ; sans
   réseau (ou sans réponse en 6 s), la copie. À l'installation, index.html
   est lu et tous les fichiers qu'il charge sont copiés d'avance (pas de
   liste à tenir à jour ici quand un fichier js/ est ajouté), plus la
   logique des notes/jalons (chargée à la demande par hors-ligne.js).
   Les appels à Supabase ne passent jamais par ici.

   Round du 26.09.2026 (suite 61) — Lionel : « Améliore le temps
   d'ouverture de l'appli en stockant localement des pages qui ne
   dépendent pas du serveur. » Stratégie inversée : « copie d'abord »
   (stale-while-revalidate). L'appli (HTML, CSS, JS, supabase-js, polices,
   icônes) est servie tout de suite depuis la copie de l'appareil, sans
   attendre le réseau ; en même temps, chaque fichier est redemandé à
   GitHub Pages (sans le cache HTTP du navigateur) et la copie mise à jour
   pour la prochaine ouverture. Si un fichier a changé (ETag, sinon date de
   modification), la page est prévenue (message « appli-maj ») et propose
   « Recharger » (js/hors-ligne.js) : une nouvelle version publiée est
   donc prise au plus tard à l'ouverture suivante, sans rien casser dans la
   page ouverte. Un fichier jamais copié (première ouverture, nouveau
   fichier js/) vient du réseau, comme avant. Nouveau nom de cache (v2) :
   l'ancienne copie est effacée et tout est recopié à l'installation.
   ============================================================ */
var CACHE = "planning-appli-v3";
// Round du 29.09.2026 (suite 100) : "./" retiré, l'adresse du dossier est
// rangée sous index.html (cleCopie, plus bas). Cache v3 : la copie v2, qui
// pouvait mêler deux versions de l'appli, est effacée et tout est recopié.
var EN_PLUS = ["index.html", "manifest.json", "functions/enregistrer-plage/logic.js", "icons/icon-32.png", "icons/icon-192.png", "icons/icon-512.png"];

// Fichiers chargés par une page (scripts, feuilles de style, supabase-js,
// polices).
function fichiersDePage(html) {
  var urls = [];
  html.replace(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g, function (_, u) {
    if (/^(https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com)\/|[^:]+$)/.test(u)) urls.push(u);
    return _;
  });
  return urls;
}

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (cache) {
    return fetch("index.html", { cache: "no-cache" }).then(function (rep) { return rep.text(); }).then(function (html) {
      var urls = EN_PLUS.concat(fichiersDePage(html));
      // Un fichier introuvable ne bloque pas l'installation.
      return Promise.all(urls.map(function (u) { return cache.add(new Request(u, { cache: "no-cache" })).catch(function () {}); }));
    }).catch(function () { return cache.addAll(EN_PLUS).catch(function () {}); });
  }).then(function () { return self.skipWaiting(); }));
});

// Round du 29.09.2026 (suite 99) — découpage du planning en plusieurs
// fichiers (js/grille-hauteurs.js…). Une page de l'appli revalidée
// (index.html, consultation.html) peut charger un fichier que la copie
// n'a jamais vu : servie depuis la copie à l'ouverture suivante, sans
// réseau, elle le demandait en vain (le planning ne s'affichait plus).
// Chaque page revalidée fait copier d'avance ceux qui manquent.
//
// Suite 100 : une page qui a changé fait recopier TOUS ses fichiers (pas
// seulement ceux qui manquent), et la page n'est rangée qu'ensuite (cf.
// fetch) : la copie ne garde jamais une page neuve avec d'anciens scripts.
function copierFichiersManquants(cache, rep, tous) {
  return rep.text().then(function (html) {
    return Promise.all(fichiersDePage(html).map(function (u) {
      return (tous ? Promise.resolve(null) : cache.match(u, { ignoreSearch: true })).then(function (c) {
        return c || rangerSiPasPlusVieux(cache, u);
      });
    }));
  }).catch(function () {});
}

// Round du 29.09.2026 (suite 100) — Lionel, capture à l'appui
// (« Impossible de charger le planning — caleJourMobileSurJourOuvre_ is
// not defined ») : « Sur portable, j'ai beau appuyer sur recharger
// plusieurs fois, ça ne fonctionne pas ». La copie rangeait chaque adresse
// telle quelle : une ouverture par un raccourci (index.html?raccourci=notes)
// ou par l'adresse du dossier (…/) créait une 2e copie de la page, que la
// recherche « sans paramètres » ressortait ensuite la première pour
// index.html. Cette copie-là n'était plus jamais revalidée : ancien
// index.html (sans js/grille-telephone.js) avec les scripts neufs, et
// « Recharger » la resservait. Une seule clé par fichier désormais :
// l'adresse sans paramètres, le dossier rangé sous index.html.
function cleCopie(url) {
  return url.origin + url.pathname.replace(/\/$/, "/index.html");
}

// Suite 100 : recopie complète de la version publiée (index.html, tout ce
// qu'il charge, EN_PLUS), la page en dernier. Demandée par la page avant
// de recharger (« Recharger », ou démarrage raté faute d'une fonction :
// js/hors-ligne.js, reparerCopieAppli_) ; répond sur le port reçu.
function recopierTout() {
  return caches.open(CACHE).then(function (cache) {
    return fetch("index.html", { cache: "no-cache" }).then(function (rep) {
      if (!rep.ok) throw new Error("index.html : " + rep.status);
      var page = rep.clone();
      return rep.text().then(function (html) {
        var urls = EN_PLUS.filter(function (u) { return u !== "index.html"; }).concat(fichiersDePage(html));
        return Promise.all(urls.map(function (u) { return rangerSiPasPlusVieux(cache, u); }));
      }).then(function () {
        return cache.match("index.html").then(function (copie) { if (!copie || comparer(copie, page) >= 0) return cache.put("index.html", page); });
      });
    });
  });
}
self.addEventListener("message", function (e) {
  if (!e.data || e.data.type !== "recopier") return;
  var port = e.ports && e.ports[0];
  e.waitUntil(recopierTout().then(function () { return true; }, function () { return false; }).then(function (ok) {
    if (port) port.postMessage({ type: "recopie-finie", ok: ok });
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (c) { return c !== CACHE; }).map(function (c) { return caches.delete(c); }));
  }).then(function () { return self.clients.claim(); }));
});

function copiable(url) {
  if (url.origin === self.location.origin) return true;
  return /^(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname);
}
// Réponse du réseau `b` comparée à la copie `a` : 1 = plus récente, 0 =
// même fichier (ou on ne sait pas), -1 = plus ANCIENNE.
// Round du 29.09.2026 (suite 120) — Lionel : « Sur desktop, sans cesse une
// demande de rechargement ». On ne regardait que « différent » (ETag).
// Après une publication, GitHub Pages (Fastly) sert quelques minutes
// l'ancienne version depuis certains serveurs et la nouvelle depuis
// d'autres : chaque va-et-vient relançait le bandeau « Recharger » — et
// rangeait l'ancienne version par-dessus la neuve, d'où un nouveau
// bandeau au passage suivant. La date de modification (Last-Modified,
// donnée par GitHub Pages) tranche : seule une version plus récente
// alerte et remplace la copie ; une plus ancienne est ignorée. Sans date :
// l'ETag, comme avant.
function comparer(a, b) {
  var la = Date.parse(a.headers.get("last-modified") || ""), lb = Date.parse(b.headers.get("last-modified") || "");
  if (!isNaN(la) && !isNaN(lb) && la !== lb) return lb > la ? 1 : -1;
  var ea = a.headers.get("etag"), eb = b.headers.get("etag");
  if (ea && eb) return ea.replace(/^W\//, "") !== eb.replace(/^W\//, "") ? 1 : 0;
  return 0;
}
// Suite 120 : copie d'un fichier depuis le réseau, sauf si la réponse est
// plus ancienne que la copie déjà là (serveur pas encore à jour).
function rangerSiPasPlusVieux(cache, u) {
  return fetch(new Request(u, { cache: "no-cache" })).then(function (rep) {
    if (!rep || !(rep.ok || rep.type === "opaque")) return;
    return cache.match(u, { ignoreSearch: true }).then(function (copie) {
      if (copie && rep.ok && comparer(copie, rep) < 0) return;
      return cache.put(u, rep);
    });
  }).catch(function () {});
}
function prevenirNouvelleVersion() {
  return self.clients.matchAll({ type: "window" }).then(function (cs) {
    cs.forEach(function (c) { c.postMessage({ type: "appli-maj" }); });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (!copiable(url)) return; // Supabase et le reste : pas touchés
  var memeOrigine = url.origin === self.location.origin;
  var ouvert = caches.open(CACHE);
  var cle = memeOrigine ? cleCopie(url) : req; // suite 100 : une seule copie par fichier
  var copieP = ouvert.then(function (cache) { return cache.match(cle); });
  // Fichiers de l'appli : toujours revalidés auprès de GitHub Pages (le
  // cache HTTP du navigateur les garderait sinon 10 minutes).
  // Suite 100 : la réponse est rendue tout de suite (fichier jamais
  // copié) ; le rangement, qui peut attendre les fichiers d'une page, se
  // fait à côté (rangeP, gardé vivant par waitUntil).
  var rangeP = null;
  var reseauP = ouvert.then(function (cache) {
    return fetch(memeOrigine ? new Request(req.url, { cache: "no-cache", credentials: "same-origin" }) : req).then(function (rep) {
      if (!rep || !(rep.ok || rep.type === "opaque")) return rep;
      var page = memeOrigine && rep.ok && /(\/|\.html)$/.test(url.pathname) ? rep.clone() : null;
      var aRanger = rep.clone();
      rangeP = copieP.then(function (copie) {
        var ordre = copie && memeOrigine && rep.ok ? comparer(copie, rep) : 0;
        if (ordre < 0) return null; // suite 120 : serveur en retard, copie gardée
        var nouvelle = ordre > 0;
        // Les fichiers d'une page d'abord (tous si elle a changé), la page
        // ensuite.
        return (page ? copierFichiersManquants(cache, page, nouvelle) : Promise.resolve()).then(function () {
          return cache.put(cle, aRanger).catch(function () {});
        }).then(function () {
          return nouvelle ? prevenirNouvelleVersion() : null;
        });
      });
      return rep;
    });
  });
  e.respondWith(copieP.then(function (copie) {
    if (copie) return copie;
    return reseauP.catch(function (err) {
      // Page de l'appli demandée par une autre adresse (…/?x), sans réseau : index.html.
      if (req.mode !== "navigate") throw err;
      return ouvert.then(function (cache) { return cache.match("index.html"); }).then(function (c) { if (c) return c; throw err; });
    });
  }));
  e.waitUntil(reseauP.then(function () { return rangeP; }).catch(function () {}));
});

/* Round du 29.09.2026 (suite 126) — Lionel : « Notification Push sur le
   téléphone et l'ordinateur avec différents paramètre à régler dans
   l'appli. » Messages envoyés par la fonction Edge envoyer-push
   ({ titre, corps, tag }, cf. functions/envoyer-push) : affichés même
   appli fermée. Même tag = la nouvelle remplace l'ancienne (une seule
   « Planning modifié » à la fois). Un clic ouvre l'appli ou la ramène au
   premier plan ; demandes, importants et à réserver ouvrent en plus la
   fenêtre Notifications (js/page-notifications.js). */
self.addEventListener("push", function (e) {
  var m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { corps: e.data ? e.data.text() : "" }; }
  var options = { body: m.corps || "", icon: "icons/icon-192.png", data: { tag: m.tag || "" } };
  if (m.tag) { options.tag = m.tag; options.renotify = true; }
  e.waitUntil(self.registration.showNotification(m.titre || "Planning", options));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var tag = (e.notification.data && e.notification.data.tag) || "";
  var ouvrirNotifs = ["demandes", "veille", "matin", "a-reserver"].indexOf(tag) >= 0;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (cs) {
    var c = cs.filter(function (x) { return x.url.indexOf(self.registration.scope) === 0 && !/consultation\.html/.test(x.url); })[0];
    if (c) {
      if (ouvrirNotifs) c.postMessage({ type: "ouvrir-notifications" });
      return c.focus();
    }
    return self.clients.openWindow(self.registration.scope + (ouvrirNotifs ? "#notifications" : ""));
  }));
});
