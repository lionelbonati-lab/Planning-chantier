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
   ============================================================ */
var CACHE = "planning-appli-v1";
var EN_PLUS = ["./", "index.html", "manifest.json", "functions/enregistrer-plage/logic.js", "icons/icon-192.png", "icons/icon-512.png"];

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

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (!copiable(url)) return; // Supabase et le reste : pas touchés
  e.respondWith(caches.open(CACHE).then(function (cache) {
    var reseau = fetch(req).then(function (rep) {
      if (rep && (rep.ok || rep.type === "opaque")) cache.put(req, rep.clone());
      return rep;
    });
    var copie = function () {
      return cache.match(req, { ignoreSearch: url.origin === self.location.origin }).then(function (c) {
        // Page de l'appli demandée par une autre adresse (…/?x) : index.html.
        return c || (req.mode === "navigate" ? cache.match("index.html") : null);
      });
    };
    return new Promise(function (ok, ko) {
      var fini = false;
      var minuteur = setTimeout(function () { copie().then(function (c) { if (c && !fini) { fini = true; ok(c); } }); }, 6000);
      reseau.then(function (rep) { clearTimeout(minuteur); if (!fini) { fini = true; ok(rep); } }, function (err) {
        clearTimeout(minuteur);
        copie().then(function (c) { if (fini) return; fini = true; if (c) ok(c); else ko(err); });
      });
    });
  }));
});
