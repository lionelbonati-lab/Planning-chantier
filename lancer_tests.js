// Lance toute la suite de tests (test_*.js) et en fait le bilan.
//
// Round du 25.09.2026 (suite 36). Lionel, après la liste des « 8 échecs
// connus » : « Quels sont ces huit erreurs et questionne-moi pour les
// résoudre », puis, à la question « Veux-tu que toute la suite tourne
// automatiquement sur GitHub à chaque PR ? » : « Oui, à chaque PR ». Ces 8
// tests avaient cassé le 17.09.2026 (découpage d'index.html en js/*.js)
// sans que personne ne le voie : ils ne tournaient qu'à la main. Ce
// lanceur sert au workflow .github/workflows/tests.yml et en local :
//
//   node lancer_tests.js                      toute la suite
//   node lancer_tests.js test_suite35.js …    seulement ces tests
//   TESTS_PARALLELES=2 node lancer_tests.js   nombre de tests simultanés
//
// Chaque test tourne dans son propre processus (délai de 6 min) ; la
// sortie complète d'un test en échec est réimprimée à la fin. Code de
// sortie 1 si un seul test échoue.
//
// Ce fichier ne commence PAS par « test_ » : ce n'est pas un test à lancer.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const demandes = process.argv.slice(2).map((f) => path.basename(f));
const tests = fs.readdirSync(__dirname)
  .filter((f) => /^test_.*\.js$/.test(f) && (demandes.length === 0 || demandes.includes(f)))
  .sort();
const PARALLELES = Math.max(1, parseInt(process.env.TESTS_PARALLELES, 10) || Math.min(4, os.cpus().length));
const DELAI_MS = 6 * 60 * 1000;
const surGithub = !!process.env.GITHUB_ACTIONS;

function lancer(fichier) {
  return new Promise((fini) => {
    const debut = Date.now();
    const p = spawn(process.execPath, [fichier], { cwd: __dirname, env: process.env });
    let sortie = '';
    p.stdout.on('data', (d) => { sortie += d; });
    p.stderr.on('data', (d) => { sortie += d; });
    const minuteur = setTimeout(() => { sortie += '\n[délai de ' + DELAI_MS / 60000 + ' min dépassé — test arrêté]'; p.kill('SIGKILL'); }, DELAI_MS);
    p.on('close', (code) => {
      clearTimeout(minuteur);
      fini({ fichier, code, sortie, secondes: Math.round((Date.now() - debut) / 1000) });
    });
  });
}

(async () => {
  if (tests.length === 0) { console.error('Aucun test trouvé.'); process.exit(1); }
  console.log(tests.length + ' tests, ' + PARALLELES + ' à la fois.\n');
  const resultats = [];
  let prochain = 0;
  async function ouvrier() {
    while (prochain < tests.length) {
      const r = await lancer(tests[prochain++]);
      resultats.push(r);
      console.log((r.code === 0 ? '✓ ' : '✗ ') + r.fichier + ' (' + r.secondes + ' s)');
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLELES, tests.length) }, ouvrier));

  const echecs = resultats.filter((r) => r.code !== 0).sort((a, b) => a.fichier.localeCompare(b.fichier));
  echecs.forEach((r) => {
    console.log(surGithub ? '::group::✗ ' + r.fichier : '\n===== ✗ ' + r.fichier + ' =====');
    console.log(r.sortie.trim());
    if (surGithub) {
      console.log('::endgroup::');
      console.log('::error title=' + r.fichier + '::' + ((r.sortie.match(/^(ÉCHEC|Error|.*Error:).*$/m) || ['code de sortie ' + r.code])[0]).slice(0, 300));
    }
  });
  console.log('\n' + (resultats.length - echecs.length) + '/' + resultats.length + ' tests OK'
    + (echecs.length ? ' — en échec : ' + echecs.map((r) => r.fichier).join(', ') : ''));
  process.exit(echecs.length ? 1 : 0);
})();
