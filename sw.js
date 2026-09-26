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
var CACHE = "planning-appli-v2";
var EN_PLUS = ["./", "index.html", "manifest.json", "functions/enregistrer-plage/logic.js", "icons/icon-32.png", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (cache) {
    return fetch("index.html", { cache: "no-cache" }).then(function (rep) { return rep.text(); }).then(function (html) {
      var urls = EN_PLUS.slice();
      html.replace(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g, function (_, u) {
        if (/^(https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com)\/|[^:]+$)/.test(u)) urls.push(u);
        return _;
      });
      // Un fichier introuvable ne bloque pas l'installation.
      return Promise.all(urls.map(function (u) { return cache.add(new Request(u, { cache: "no-cache" })).catch(function () {}); }));
    }).catch(function () { return cache.addAll(EN_PLUS).catch(function () {}); });
  }).then(function () { return self.skipWaiting(); }));
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
// Même fichier ? ETag d'abord (GitHub Pages en donne un), sinon date de
// modification ; sans l'un ni l'autre, on ne sait pas : pas d'alerte.
function differe(a, b) {
  var ea = a.headers.get("etag"), eb = b.headers.get("etag");
  if (ea && eb) return ea.replace(/^W\//, "") !== eb.replace(/^W\//, "");
  var la = a.headers.get("last-modified"), lb = b.headers.get("last-modified");
  return !!(la && lb && la !== lb);
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
  var copieP = ouvert.then(function (cache) { return cache.match(req, { ignoreSearch: memeOrigine }); });
  // Fichiers de l'appli : toujours revalidés auprès de GitHub Pages (le
  // cache HTTP du navigateur les garderait sinon 10 minutes).
  var reseauP = ouvert.then(function (cache) {
    return fetch(memeOrigine ? new Request(req.url, { cache: "no-cache", credentials: "same-origin" }) : req).then(function (rep) {
      if (!rep || !(rep.ok || rep.type === "opaque")) return rep;
      return copieP.then(function (copie) {
        var nouvelle = copie && memeOrigine && rep.ok && differe(copie, rep);
        return cache.put(req, rep.clone()).catch(function () {}).then(function () {
          return nouvelle ? prevenirNouvelleVersion() : null;
        }).then(function () { return rep; });
      });
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
  e.waitUntil(reseauP.catch(function () {}));
});
