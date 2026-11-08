#!/usr/bin/env bash
# run.sh <workspace> [backend ...]
#
# Part of https://github.com/christianvuerings/tsrs-lint-monorepo-repro.
# Runs `oxlint --type-aware -A all -D typescript/no-floating-promises` once per backend over every file in
# <workspace>/files.txt, in one oxlint call (one headless request with one tsconfig program per suite), under
# /usr/bin/time, and prints wall time, CPU time (user plus system) and peak RSS for each backend.
#
# Backends default to the two that package.json installs: node_modules/.bin/tsrs-lint (tsrs 0.23.0) and
# node_modules/.bin/tsgolint (oxlint-tsgolint 7.0.2006). Any other path is used as OXLINT_TSGOLINT_PATH as is, except a
# file named `tsrs` (for example target/release/tsrs from a tsrs checkout), which is run as `tsrs --lint`.
#
# Peak RSS is the largest process of the run, oxlint or the backend it starts (GNU time's maximum resident set size).
# Every suite has one floating promise by design, so each backend reports 175 findings and oxlint exits 1.
# Relative backend paths are taken from the current directory, except node_modules/.bin/..., taken from this directory.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
if [ $# -lt 1 ] || [ ! -f "$1/files.txt" ]; then
  echo "usage: run.sh <workspace written by gen.mjs> [backend ...]" >&2
  exit 2
fi
start=$(pwd)
ws=$(cd "$1" && pwd)
shift
backends=("$@")
if [ ${#backends[@]} -eq 0 ]; then
  backends=(node_modules/.bin/tsrs-lint node_modules/.bin/tsgolint)
fi
oxlint=${OXLINT:-$here/node_modules/.bin/oxlint}
if [ ! -x /usr/bin/time ]; then
  echo "run.sh needs GNU time at /usr/bin/time (Debian and Ubuntu: apt install time)" >&2
  exit 2
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mapfile -t files < "$ws/files.txt"
cd "$ws"

printf '%-32s %9s %9s %10s %s\n' backend wall cpu 'peak RSS' result
for b in "${backends[@]}"; do
  case "$b" in
    /*) path=$b ;;
    node_modules/.bin/*) path=$here/$b ;;
    *) path=$start/$b ;;
  esac
  helper=$path
  if [ "$(basename "$b")" = tsrs ]; then
    helper=$tmp/tsrs-lint-$RANDOM
    printf '#!/bin/sh\nexec "%s" --lint "$@"\n' "$path" > "$helper"
    chmod +x "$helper"
  fi
  status=0
  OXLINT_TSGOLINT_PATH=$helper /usr/bin/time -f '%e %U %S %M' -o "$tmp/time" \
    "$oxlint" --type-aware -A all -D typescript/no-floating-promises "${files[@]}" > "$tmp/out" 2>&1 || status=$?
  read -r wall user sys rss < <(tail -n 1 "$tmp/time")
  result="$(grep -c 'no-floating-promises' "$tmp/out" || true) findings, oxlint exit $status"
  awk -v b="$b" -v w="$wall" -v u="$user" -v s="$sys" -v m="$rss" -v r="$result" \
    'BEGIN { printf "%-32s %8.1fs %8.1fs %7.1f GB %s\n", b, w, u + s, m / 1048576, r }'
  if [ "$status" -gt 1 ]; then  # 1 means findings; anything else is a failure
    tail -n 20 "$tmp/out" >&2
  fi
done
