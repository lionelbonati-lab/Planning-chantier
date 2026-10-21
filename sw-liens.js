/* ============================================================
   SERVICE WORKER DES LIENS — round du 21.10.2026 (suite 146)
   ------------------------------------------------------------
   Lionel : « Ajoute moi une icône sur la vue ouvrier et responsables pour
   installer l'application. »

   Enregistré par js/installer.js pour la seule page de chaque lien
   (portée « consultation.html » ou « responsable.html ») : il ne touche
   ni à l'appli du bureau (sw.js, portée du dossier entier) ni aux autres
   pages. Chrome et Edge ne proposent leur fenêtre « Installer » (et donc
   l'icône) qu'à une page tenue par un service worker qui répond aux
   requêtes.

   Stratégie « réseau d'abord » : avec du réseau, toujours la dernière
   version publiée, et la copie est mise à jour ; sans réseau, la copie —
   la page s'ouvre et dit « Planning inaccessible. Vérifie ta connexion »
   au lieu de la page d'erreur du navigateur. Les appels à Supabase (POST)
   ne passent jamais par ici : le planning lui-même n'est jamais gardé.
   ============================================================ */
var CACHE = "planning-liens-v1";

self.addEventListener("install", function () { self.skipWaiting(); });

self.addEventListener("activate", function (e) {
  // Seulement les anciennes copies de CE fichier (celles de sw.js restent).
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (c) { return c.indexOf("planning-liens-") === 0 && c !== CACHE; }).map(function (c) { return caches.delete(c); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  var memeOrigine = url.origin === self.location.origin;
  if (!memeOrigine && !/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;
  e.respondWith(fetch(memeOrigine ? new Request(req.url, { cache: "no-cache", credentials: "same-origin" }) : req).then(function (rep) {
    if (rep && (rep.ok || rep.type === "opaque")) {
      var copie = rep.clone();
      e.waitUntil(caches.open(CACHE).then(function (cache) { return cache.put(req, copie); }).catch(function () {}));
    }
    return rep;
  }).catch(function (err) {
    // Hors ligne : la copie, quel que soit le jeton de l'adresse.
    return caches.match(req, { ignoreSearch: memeOrigine }).then(function (c) { if (c) return c; throw err; });
  }));
});
