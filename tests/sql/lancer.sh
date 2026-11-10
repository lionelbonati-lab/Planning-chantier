#!/bin/bash
# ============================================================
# Tests SQL sur une copie locale de la base — round du 09.11.2026 (suite 153)
# ------------------------------------------------------------
# Rejoue sql/0001…0043 sur un PostgreSQL local (16) qui imite Supabase
# (supabase_imite.sql : rôles, auth.uid(), storage, cron, net), y met des
# données comme celles de Lionel (donnees_avant_0044.sql), applique
# sql/0044 et suivantes deux fois (rejouables), puis lance test_*.sql
# (0044 : comptes, liens, sauvegardes ; 0045 : lignes, couleurs,
# absences ; 0046 : comptes de l'entreprise, retirer un compte ; 0047 :
# couleurs du lien des ouvriers) : Lionel, un collègue dans un 2e planning de la même
# entreprise, un inconnu dans une autre entreprise. Chaque vérification
# affiche « OK: » ou « ÉCHEC: ».
#
# Lancer (serveur local déjà démarré, accès sans mot de passe) :
#   PGHOST=/chemin/du/socket PGPORT=54329 PGUSER=postgres bash tests/sql/lancer.sh
# Pas lancé par tests/lancer_tests.js (le CI n'a pas de PostgreSQL).
# ============================================================
D=$(cd "$(dirname "$0")" && pwd); R="$D/../.."; B=test_plannings
psql() { command psql -v ON_ERROR_STOP=1 -q "$@"; }
command psql -q -d postgres -c "drop database if exists $B" -c "create database $B" || exit 1
psql -d $B -f "$D/supabase_imite.sql" 2>/dev/null || exit 1
for f in "$R"/sql/00*.sql; do
  n=$(basename "$f" | cut -c1-4); [ "$((10#$n))" -ge 44 ] && break
  sed -E 's/^\s*create extension[^;]*;//I' "$f" | psql -d $B -f - >/dev/null 2>&1 || { echo "ÉCHEC: migration $f"; exit 1; }
done
psql -d $B -f "$D/donnees_avant_0044.sql" >/dev/null || exit 1
for i in 1 2; do
  for f in "$R"/sql/00*.sql; do
    n=$(basename "$f" | cut -c1-4); [ "$((10#$n))" -lt 44 ] && continue
    psql -d $B -f "$f" >/dev/null 2>&1 || { echo "ÉCHEC: $f (passage $i)"; exit 1; }
  done
done
# Une erreur SQL inattendue (qui arrête un fichier de tests) compte aussi.
for t in "$D"/test_00*.sql; do psql -d $B -f "$t" 2>&1; done | sed -e 's/^psql:[^:]*:[0-9]*: NOTICE:  //' \
  -e 's/^psql:\([^:]*\):\([0-9]*\): ERROR:  /ÉCHEC: erreur SQL (\1, ligne \2) : /' | grep -E "^(OK|ÉCHEC)" | tee /dev/stderr | grep -q "^ÉCHEC" && exit 1
echo "Tests SQL : tout est OK."
