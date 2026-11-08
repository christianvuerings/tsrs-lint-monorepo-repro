# tsrs-lint over 175 tsconfig programs in one request: a generated monorepo

A generated project for timing type-aware lint with [tsrs](https://github.com/oxc-project/tsrs) (`tsrs-lint`) and
tsgolint, in one `oxlint --type-aware` call over 175 overlapping tsconfig programs. Its shape is copied from
statistics of the same lint request in our web monorepo, so it gives numbers close to the ones quoted for that
monorepo in https://github.com/christianvuerings/tsrs/pull/12. Everything in it is generated: no code, names or files
come from the monorepo.

| request | | tsrs `main`<br>[`fc384313`](https://github.com/oxc-project/tsrs/commit/fc384313300dee5a1ba64ff15282bee9307f59c3) | + fix 1<br>[`5245ecca`](https://github.com/christianvuerings/tsrs/pull/12/commits/5245ecca885389eb7ea1c110c6e57e5f8d90c661) | + fix 2<br>[`4a440b37`](https://github.com/christianvuerings/tsrs/pull/12/commits/4a440b37af94fe6c4d93474917820196d8012088) | + fix 3<br>[`bbf1629f`](https://github.com/christianvuerings/tsrs/pull/12/commits/bbf1629f8a2604614ecf7cf3e0249f757a380c11) | tsgolint 7.0.2006 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| this project, 175 programs | peak RSS | 15.2 GB | 2.4 GB | 0.8 GB | 0.8 GB | 2.2 GB |
| | wall time | 34.1 s | 32.6 s | 6.5 s | 3.8 s | 10.3 s |
| | CPU time | 58.7 s | 56.0 s | 23.1 s | 15.0 s | 186 s |
| our web monorepo, 175 programs | peak RSS | 19.9 GB | 1.5 GB | 0.9 GB | 1.1 GB | 1.8 GB |
| | wall time | 34.7 s | 34.1 s | 12.9 s | 7.7 s | 10.6 s |
| | CPU time | 98.3 s | 95.9 s | 57.1 s | 40.0 s | 126 s |

Medians of 5 interleaved runs per cell, Nov 8, 2026, 8:24 to 9:09 AM PT. Each number is the lint helper alone on the request in `payload.json` (the one oxlint 1.92.0 sends), each run alone in
its own memory-limited cgroup, on a quiet Linux x86-64 machine with 64 hardware threads (Intel Xeon 6975P-C). Both
rows come from the same machine. Pull request 12 quotes the monorepo request on a slower machine (tsrs `main` 44.3 s
and 19.9 GB there).

`+ fix 1`, `+ fix 2` and `+ fix 3` are the three fixes of pull request 12, applied in order: each program's memory is
freed with the program, each referenced project's tsconfig is parsed once per request, and each declaration file is
parsed and bound once per request. Every tsrs build wrote byte-identical output to `main` in every run (175 findings,
one floating promise per suite, by design). tsgolint reports the same 175 findings in another order.

## Reproduce

Linux x86-64 with Node.js (tested with 24), pnpm and GNU time (`/usr/bin/time`):

```sh
pnpm install --frozen-lockfile
node gen.mjs ws
./run.sh ws
```

`gen.mjs` writes about 159,000 files (230 MB) into `ws`, the same files on every run. `run.sh` lints every file
in `ws/files.txt` in one oxlint call, once with `node_modules/.bin/tsrs-lint` (the published tsrs 0.23.0, a release
build of the `main` source) and once with `node_modules/.bin/tsgolint`, and prints wall time, CPU time and peak RSS
for each. On the machine above they come out close to the table, oxlint included: tsrs-lint 0.23.0 31.8 s, 54.9 s of
CPU and 15.2 GB, tsgolint 10.0 s, 180 s and 2.1 GB (one run each).

To time a fix, build tsrs at that fix and pass the binary to `run.sh`, which runs a file named `tsrs` as
`tsrs --lint`:

```sh
git clone https://github.com/christianvuerings/tsrs && cd tsrs && git checkout bbf1629f   # + fix 3; 5245ecca for + fix 1, 4a440b37 for + fix 2
CARGO_PROFILE_RELEASE_LTO=thin CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16 cargo build --release --locked -p tsrs_cli
cp ../tsrs-lint-monorepo-repro/node_modules/.pnpm/@tsrs+linux-x64-gnu@0.23.0-ts7.1.0-beta/node_modules/@tsrs/linux-x64-gnu/lib*.d.ts target/release/
cd ../tsrs-lint-monorepo-repro && ./run.sh ws ../tsrs/target/release/tsrs
```

The table's tsrs builds used that build command (plus `CARGO_PROFILE_RELEASE_DEBUG=line-tables-only` and
`CARGO_PROFILE_RELEASE_STRIP=false`), with the 116 `lib*.d.ts` files of `@tsrs/linux-x64-gnu` 0.23.0 next to the
binary. To time a helper without oxlint, as the table does, give it the request directly:

```sh
node_modules/.bin/tsrs-lint headless < ws/payload.json > tsrs.frames
node_modules/.bin/tsgolint headless < ws/payload.json > tsgolint.frames
```

`payload.json` holds absolute paths, so regenerate it (`node gen.mjs <new dir>`) after moving the workspace. oxlint
sends the same files in an order that changes from run to run; `payload.json` lists them suite by suite.

## Shape

`gen.mjs` writes:

- 2,000 composite library packages in 11 layers. Each references up to 5 packages of lower layers, so reference
  chains are deep and each suite's reference closure holds hundreds of tsconfigs (median 518, 67 to 841, 89,612 in
  all). Package sizes follow a long tail: most have 48 source files, 200 have 130, and 12 have 1,000 or 3,000.
- 175 composite test suites with 1 to 4 references each and 1,069 files to lint in all (`.ts`, and `.tsx` with JSX),
  each with its own support code and a fixture chain built through generic `extend` calls. 163 suites have 3
  support files. The other 12 have 55 to 780, as many as the 12 largest programs of our web monorepo, with comment
  lines that bring each file to those programs' average file size (1.7 to 13.7 KB).
- A declarations-only test framework package with overloaded page and locator methods and conditional assertion
  types, 12 ambient type packages, a 4.8 MB schema package used by the largest suite, and 21 global type files that
  augment the DOM interfaces.
- One `tsconfig.base.json` for every project: `module: preserve`, `moduleResolution: bundler`, `jsx: preserve`,
  `strict`, `composite`, the `dom`, `dom.iterable`, `esnext` and `webworker` libs, and 21 `paths` patterns. Every
  project includes its own directory and the global types directory with include globs.

The real request it copies: 175 programs, 1,060 files to lint, 2,003 tsconfigs in the request, a reference closure
of median 376 tsconfigs (259 to 1,652, 89,980 in all) and depth 9 to 23. On tsrs `main`, parsing referenced tsconfigs
takes about 61% of that request. The programs' file lists come out close: 5,621 distinct files and 36.5 MB across the
request (26.7 MB of it non-declaration source) against 6,307 files and 44.1 MB (24.8 MB), and the largest program
holds 1,306 files and 17.9 MB against 1,377 files and 16.4 MB.

Every option of `gen.mjs` has a default (the list is at the top of the file); pass `--name=value` to change one, for
example `node gen.mjs ws100 --suites=100`.

## Where it differs from our web monorepo

- `+ fix 2` and `+ fix 3` take about half as long on this project as on the monorepo (6.5 s against 12.9 s, 3.8 s
  against 7.7 s). What remains after those fixes is per-program type work, which the monorepo's real code has more of
  than generated code.
- `+ fix 1` peaks at 2.4 GB here against 1.5 GB, and `main` at 15.2 GB against 19.9 GB.
- tsgolint uses more CPU time here (186 s against 126 s). Its peak memory follows the amount of code in the largest
  programs rather than their size in bytes, because it keeps what it builds for each program until the request ends.
  Generated code packs more code into each KB than real files, so without the comment lines in the big suites'
  files tsgolint peaked at 5.1 GB here.

Written with Claude Code on behalf of Christian Vuerings.
