#!/usr/bin/env node
// gen.mjs <dir> [--option=value ...]
// Generates a monorepo shaped like a large web app's end-to-end test layer, for type-aware lint benchmarks. The
// defaults generate the project timed in README.md; the generator is deterministic (`seed`), so every run of
// `node gen.mjs <dir>` writes the same files. Shape:
// - `packages`: composite library projects in `layers` layers. Each references `refs` projects of lower layers, so
//   project-reference chains are deep and every test program's reference closure holds hundreds of tsconfigs.
//   Every tsconfig includes its own directory and a shared global-types directory with include globs.
// - `suites`: small composite test projects, `filesPerSuite` files each (one of them with a floating promise),
//   that import two library packages and a generated end-to-end framework package in node_modules.
// - every program uses the DOM, DOM iterable, ESNext and WebWorker libs and JSX.
// Writes <dir>/files.txt (the files to lint) and <dir>/payload.json: the request oxlint 1.92.0 sends for
// `oxlint --type-aware -A all -D typescript/no-floating-promises` over those files, so a lint helper can be run
// alone: `tsrs-lint headless < payload.json` or `tsgolint headless < payload.json`. oxlint sends the same files in an
// order that changes from run to run; payload.json lists them suite by suite.
// Derived from the generator in https://github.com/oxc-project/tsrs/issues/932. Everything is generated.
import fs from 'node:fs';
import path from 'node:path';

const opts = {
  suites: 175,
  filesPerSuite: 6,
  packages: 2000,
  layers: 11,
  refs: 5,
  filesPerPackage: '3000x2,1000x10,130x200,48',
  importsPerTest: 8,
  testsPerPackage: 10,
  stepsPerTest: 8,
  typesPackages: 12,
  typesKB: 560,
  schemaKB: 6000,
  schemaFiles: 340,
  schemaFrom: 750,
  supportFunctions: 24,
  supportFiles: '780/7/10.8x1,740/3/4.9x1,580/3/5.6x1,420/1/2.1x1,145/9/13.7x1,95/1/3x1,90/3/5.1x1,85/3/4.9x1,85/1/3x1,65/4/6.6x1,55/2/3.6x1,55/1/1.7x1,3',
  pathAliases: 20,
  chainEvery: 4,
  globalTypes: 21,
  frameworkFiles: 46,
  frameworkKB: 1400,
  locatorMethods: 60,
  pageMethods: 150,
  matchers: 40,
  fixtureLevels: 4,
  suiteRefs: '1,1,2,2,3,4',
  dry: 0,
  seed: 1,
};
const [dir, ...rest] = process.argv.slice(2);
for (const a of rest) {
  const [k, v] = a.replace(/^--/, '').split('=');
  if (!(k in opts)) throw new Error(`unknown option ${k}`);
  opts[k] = ['suiteRefs', 'supportFiles', 'filesPerPackage'].includes(k) ? v : Number(v);
}
if (!dir)
  throw new Error(
    'usage: gen.mjs <dir> [--suites=175] [--packages=2000] [--layers=11] [--refs=5] ...',
  );
if (!opts.dry && fs.existsSync(dir)) throw new Error(`${dir} exists: pick a new directory`);

let seed = opts.seed;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (n) => Math.floor(rand() * n);
const write = (p, s) => {
  if (opts.dry) return;
  fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
  fs.writeFileSync(path.join(dir, p), s);
};
const json = (v) => JSON.stringify(v, null, 2) + '\n';
const pad = (i, n = 4) => String(i).padStart(n, '0');

write('package.json', json({ name: 'lint-scale-repro', private: true }));
write('.oxlintrc.json', json({ plugins: ['typescript'] }));
write(
  'tsconfig.base.json',
  json({
    compilerOptions: {
      target: 'esnext',
      module: 'preserve',
      moduleResolution: 'bundler',
      jsx: 'preserve',
      strict: true,
      composite: true,
      declaration: true,
      declarationMap: true,
      emitDeclarationOnly: true,
      isolatedModules: true,
      skipLibCheck: true,
      types: [],
      lib: ['dom', 'dom.iterable', 'esnext', 'webworker'],
      outDir: './.build',
      rootDir: '.',
      paths: Object.fromEntries([
        ['@repro/*', ['./packages/*/src/index.mts', './packages/*/index.ts', './.build/packages/*/src/index.d.mts', './packages/*/src/index.ts', './.build/packages/*/src/index.d.ts', './.build/packages/*/index.d.ts']],
        ...Array.from({ length: opts.pathAliases }, (_, i) => [`@alias${i}/*`, [`./packages/*/src/a${i % 3}/b${i % 2}/index.ts`, `./.build/packages/*/src/a${i % 3}/b${i % 2}/index.d.ts`]]),
      ]),
    },
  }),
);

// Global type augmentations every program includes.
for (let g = 0; g < opts.globalTypes; g++) {
  // Augment the big DOM interfaces, as app-wide global type files do: every program merges them with the DOM lib.
  const doms = ['Window', 'Document', 'HTMLElement', 'Element', 'Navigator', 'EventTarget', 'Node'];
  let s = '';
  for (let i = 0; i < 12; i++)
    s += `interface GlobalHelper${g}_${i} { readonly key${i}: string; value?: number }\n`;
  for (const d of doms) s += `interface ${d} { ext${g}_${d}?: GlobalHelper${g}_0; on${g}${d}?(event: CustomEvent<GlobalHelper${g}_1>): void }\n`;
  s += `interface WindowEventMap { 'ext${g}': CustomEvent<GlobalHelper${g}_2> }\ninterface HTMLElementTagNameMap { 'x-el-${g}': HTMLElement }\n`;
  s += `declare const __global${g}: GlobalHelper${g}_0;\n`;
  write(`types/global/g${pad(g, 2)}.d.ts`, s);
}

// A generated end-to-end framework package (declarations only): a page and locator API with many overloaded methods,
// fixtures typed through generic `extend` chains, and assertion types selected by conditional types.
{
  const m = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('\n');
  write('node_modules/@repro/e2e/locator.d.ts',
    `export interface LocatorOptions { has?: Locator; hasText?: string | RegExp; exact?: boolean }\n` +
    `export interface ActionOptions { timeout?: number; force?: boolean; trial?: boolean; position?: { x: number; y: number } }\n` +
    `export interface Locator<E extends Element = Element> {\n  locator(selector: string, options?: LocatorOptions): Locator<E>;\n  filter(options?: LocatorOptions): Locator<E>;\n` +
    m(opts.locatorMethods, (i) => `  action${i}(options?: ActionOptions): Promise<void>;\n  action${i}(value: string, options?: ActionOptions): Promise<void>;\n  query${i}<R>(fn: (el: E, arg: number) => R | Promise<R>): Promise<Awaited<R>>;`) +
    `\n  click(options?: ActionOptions): Promise<void>;\n  fill(value: string, options?: ActionOptions): Promise<void>;\n  textContent(options?: ActionOptions): Promise<string | null>;\n}\n`);
  write('node_modules/@repro/e2e/page.d.ts',
    `import type { Locator, LocatorOptions, ActionOptions } from './locator';\nexport interface Response { ok(): boolean; status(): number; json<T = unknown>(): Promise<T> }\n` +
    `export interface Page {\n  goto(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<Response | null>;\n  locator(selector: string, options?: LocatorOptions): Locator;\n` +
    m(opts.pageMethods, (i) => `  method${i}(selector: string, options?: ActionOptions): Promise<void>;\n  method${i}<T>(selector: string, fn: (el: Element) => T, options?: ActionOptions): Promise<Awaited<T>>;\n  getBy${i}(text: string | RegExp, options?: { exact?: boolean }): Locator;`) +
    `\n}\n`);
  write('node_modules/@repro/e2e/test.d.ts',
    `import type { Page } from './page';\n` +
    `export type FixtureValue<T, A> = T | ((args: A, use: (value: T) => Promise<void>) => Promise<void>);\n` +
    `export type Fixtures<T, A> = { [K in keyof T]: FixtureValue<T[K], A & T> | [FixtureValue<T[K], A & T>, { scope?: 'test' | 'worker'; auto?: boolean }] };\n` +
    `export interface TestArgs { page: Page; baseURL: string | undefined }\n` +
    `export interface TestType<A> {\n  (title: string, body: (args: A) => Promise<void> | void): void;\n  only(title: string, body: (args: A) => Promise<void> | void): void;\n  step<T>(title: string, body: () => T | Promise<T>): Promise<T>;\n  extend<T extends object>(fixtures: Fixtures<T, A>): TestType<A & T>;\n  beforeEach(body: (args: A) => Promise<void> | void): void;\n}\n` +
    `export declare const test: TestType<TestArgs>;\n`);
  write('node_modules/@repro/e2e/expect.d.ts',
    `import type { Locator } from './locator';\nimport type { Page } from './page';\n` +
    `export interface LocatorAssertions<R> {\n  not: LocatorAssertions<R>;\n` + m(opts.matchers, (i) => `  toHave${i}(expected: string | RegExp | readonly (string | RegExp)[], options?: { timeout?: number }): R;`) + `\n}\n` +
    `export interface PageAssertions<R> {\n  not: PageAssertions<R>;\n` + m(opts.matchers, (i) => `  toPage${i}(expected: string | RegExp, options?: { timeout?: number }): R;`) + `\n}\n` +
    `export interface ValueAssertions<R, T> {\n  not: ValueAssertions<R, T>;\n` + m(opts.matchers, (i) => `  toBe${i}(expected: T extends readonly (infer U)[] ? U | T : T): R;`) + `\n}\n` +
    `export type Matchers<R, T> = T extends Locator ? LocatorAssertions<Promise<R>> : T extends Page ? PageAssertions<Promise<R>> : ValueAssertions<R, T>;\n` +
    `export declare function expect<T>(actual: T, message?: string): Matchers<void, T>;\n`);
  // Filler declarations so the package reaches about `frameworkKB` across `frameworkFiles` files.
  const filler = Math.max(0, opts.frameworkFiles - 4);
  const perFile = Math.ceil((opts.frameworkKB * 1024 * 0.85) / Math.max(1, filler) / 150);
  let index = `export * from './locator';\nexport * from './page';\nexport * from './test';\nexport * from './expect';\n`;
  for (let f = 0; f < filler; f++) {
    let t = `import type { Locator } from './locator';\n`;
    for (let i = 0; i < perFile; i++) t += `export interface Option${f}_${i}<T = unknown> { name: string; value?: T; locator?: Locator; next?: Option${f}_${(i + 1) % perFile}<T> }\n`;
    write(`node_modules/@repro/e2e/types${pad(f, 2)}.d.ts`, t);
    index += `export * from './types${pad(f, 2)}';\n`;
  }
  // Ambient helper type packages the framework references, about `typesKB` in `typesPackages` packages.
  const perTypes = Math.ceil((opts.typesKB * 1024) / opts.typesPackages / 170);
  for (let t = 0; t < opts.typesPackages; t++) {
    let d = 'export {};\ndeclare global {\n';
    for (let i = 0; i < 20; i++) d += `  interface Window { types${t}_${i}?: Shape${t}_${i} }\n`;
    d += '}\n';
    for (let i = 0; i < perTypes; i++) d += `export interface Shape${t}_${i}<K extends string = string> { kind: K; size: number; parts: ReadonlyArray<Shape${t}_${(i + 1) % perTypes}<K>> }\n`;
    for (let i = 0; i < 10; i++) d += `declare module 'virtual-${t}-${i}' { export const value: Shape${t}_${i}; export default value; }\n`;
    write(`node_modules/@repro/types-${pad(t, 2)}/index.d.ts`, d);
    write(`node_modules/@repro/types-${pad(t, 2)}/package.json`, json({ name: `@repro/types-${pad(t, 2)}`, version: '1.0.0', types: 'index.d.ts' }));
    index += `export type * as Types${t} from '@repro/types-${pad(t, 2)}';\n`;
  }
  write('node_modules/@repro/e2e/index.d.ts', index);
  write('node_modules/@repro/e2e/package.json', json({ name: '@repro/e2e', version: '1.0.0', types: 'index.d.ts' }));
}

write('tsconfig.project.json', json({ extends: './tsconfig.base.json', compilerOptions: { noEmitOnError: true, incremental: true } }));
// A large generated schema-types package (declarations only), imported by the suites with the most support code.
{
  const perFile = Math.ceil((opts.schemaKB * 1024) / opts.schemaFiles / 210);
  let index = '';
  for (let f = 0; f < opts.schemaFiles; f++) {
    let d = f ? `import type { Node0_0 } from './n000';\n` : '';
    for (let i = 0; i < perFile; i++) {
      d += `export interface Node${f}_${i} { __typename: 'Node${f}_${i}'; id: string; fields: { a${i}?: string | null; b${i}?: number | null; c${i}?: ReadonlyArray<Node${f}_${(i + 1) % perFile}> | null } }\n`;
    }
    write(`node_modules/@repro/schema/n${pad(f, 3)}.d.ts`, d);
    index += `export * from './n${pad(f, 3)}';\n`;
  }
  write('node_modules/@repro/schema/index.d.ts', index);
  write('node_modules/@repro/schema/package.json', json({ name: '@repro/schema', version: '1.0.0', types: 'index.d.ts' }));
}

const project = (rel, references, extraInclude = []) =>
  write(
    `${rel}/tsconfig.json`,
    json({
      extends: path.relative(rel, 'tsconfig.project.json'),
      include: ['.', path.relative(rel, 'types/global'), ...extraInclude],
      exclude: ['./__tests__'],
      references: references.map((r) => ({ path: path.relative(rel, r) })),
    }),
  );

// Layered library packages.
const layerOf = [];
const byLayer = Array.from({ length: opts.layers }, () => []);
for (let p = 0; p < opts.packages; p++) {
  const layer = Math.min(opts.layers - 1, Math.floor((p / opts.packages) * opts.layers));
  layerOf.push(layer);
  byLayer[layer].push(p);
}
const pkgRefs = [];
for (let p = 0; p < opts.packages; p++) {
  const layer = layerOf[p];
  const set = new Set();
  if (layer > 0) {
    for (let r = 0; r < opts.refs; r++) {
      const l = r === 0 ? layer - 1 : pick(layer);
      set.add(byLayer[l][pick(byLayer[l].length)]);
    }
  }
  pkgRefs.push([...set]);
}
const expand = (spec, n) => {
  const out = [];
  for (const part of spec.split(',')) {
    const [v, times] = part.split('x').map(Number);
    for (let i = 0; i < (times || n); i++) out.push(v);
  }
  out.length = n;
  for (let i = out.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const pkgFiles = expand(String(opts.filesPerPackage), opts.packages);
const pkgDir = (p) => `packages/p${pad(p)}`;
for (let p = 0; p < opts.packages; p++) {
  project(pkgDir(p), pkgRefs[p].map(pkgDir));
  const deps = pkgRefs[p];
  let index = '';
  for (let f = 0; f < pkgFiles[p]; f++) {
    const sub = f < 4 ? '' : `a${f % 3}/b${f % 2}/c${Math.floor(f / 64)}/`;
    write(
      `${pkgDir(p)}/src/${sub}m${f}.ts`,
      `export interface Model${f} { id: string; count: number }\nexport async function load${f}(id: string): Promise<Model${f}> { return { id, count: ${p} }; }\n`,
    );
    if (f < 4) index += `export * from './m${f}';\n`;
  }
  if (deps.length && p % opts.chainEvery === 0) index += `export { load0 as dep0 } from '@repro/p${pad(deps[0])}';\n`;
  for (let t = 1; t < opts.testsPerPackage; t++) write(`${pkgDir(p)}/__tests__/t${t}.test.ts`, `export const u${t} = ${t};\n`);
  index += `export class Screen { constructor(readonly name: string) {} async open(): Promise<void> {} async read(): Promise<number> { return ${p}; } }\n`;
  write(`${pkgDir(p)}/src/index.ts`, index);
  write(`${pkgDir(p)}/__tests__/m.test.ts`, `export const t${p} = ${deps.length};\n`);
}

// Test suites.
const closure = (refs) => {
  const seen = new Set();
  const stack = [...refs];
  while (stack.length) {
    const p = stack.pop();
    if (seen.has(p)) continue;
    seen.add(p);
    stack.push(...pkgRefs[p]);
  }
  return seen;
};
const suiteRefCounts = opts.suiteRefs.split(',').map(Number);
// Support code per suite, as `files[/functions[/KB]][xsuites]`: "780/7/10.8x1,95/1x2,3" is 1 suite with 780 support
// files of 7 function pairs each, padded with comment lines to 10.8 KB, 2 suites with 95 files of 1 pair, and every
// other suite (an entry without `x`) with 3 files of `supportFunctions` pairs, spread by the seeded shuffle. Without
// padding a file is about 0.6 KB plus 0.37 KB per function pair.
const supportPattern = [];
for (const part of opts.supportFiles.split(',')) {
  const [, n, fns, kb, times] = part.match(/^(\d+)(?:\/(\d+))?(?:\/([\d.]+))?(?:x(\d+))?$/).map(Number);
  for (let i = 0; i < (times || opts.suites); i++) supportPattern.push({ n, fns: fns || opts.supportFunctions, kb });
}
supportPattern.length = opts.suites;
for (let i = supportPattern.length - 1; i > 0; i--) {
  const j = pick(i + 1);
  [supportPattern[i], supportPattern[j]] = [supportPattern[j], supportPattern[i]];
}
const files = [];
const closures = [];
const union = new Set();
const top = byLayer.slice(Math.floor(opts.layers / 2)).flat();
for (let s = 0; s < opts.suites; s++) {
  const rel = `e2e/s${pad(s, 3)}`;
  const n = suiteRefCounts[s % suiteRefCounts.length];
  const refs = [...new Set(Array.from({ length: n }, () => top[pick(top.length)]))];
  project(rel, refs.map(pkgDir));
  const c = closure(refs);
  const closureList = [...c].filter((q, i) => i % 7 === 3);
  closures.push(c.size);
  for (const p of c) union.add(p);
  const count = Math.max(1, Math.round(opts.filesPerSuite * (0.25 + 1.5 * rand())));
  // Each suite's own support code: most suites have a little, a few have a lot (page objects, fixtures).
  const { n: supportCount, fns: supportFunctions, kb: supportKB } = supportPattern[s % supportPattern.length];
  let supportIndex = '';
  for (let k = 0; k < supportCount; k++) {
    let body = `export interface Record${k} { id: string; count: number; tags?: string[]; nested?: { at: number; by: string } }\n`;
    body += `export async function helper${k}(input: Record${k}) {\n  const tags = [...(input.tags ?? []), 'h${k}'].map((t, i) => ({ t, i, upper: t.toUpperCase() }));\n  const byKey = Object.fromEntries(tags.map((x) => [x.t, x] as const));\n  const nested = input.nested ? { ...input.nested, at: input.nested.at + 1 } : undefined;\n  return { ...input, tags: tags.map((x) => x.t), byKey, nested, total: tags.reduce((a, x) => a + x.i, input.count) };\n}\n`;
    for (let j = 0; j < supportFunctions; j++) {
      body += `export function pick${k}_${j}<K extends keyof Record${k}>(r: Record${k}, key: K): Record${k}[K] { return r[key]; }\n`;
      body += `export async function step${k}_${j}(r: Record${k}, n = ${j}) {\n  const next = await helper${k}(r);\n  const items = Object.entries(next.byKey).map(([key, v]) => ({ key, ...v, n }));\n  return { ...next, step: n + next.total, items, first: items[0]?.upper ?? null };\n}\n`;
    }
    // Comment lines up to `supportKB` per file, as real files carry documentation and blank lines besides code.
    for (let line = 0; supportKB && body.length < supportKB * 1024; line++) {
      body += line % 6 === 5 ? '\n' : `// Step ${line} of helper ${k}: reads the record, updates the tags and returns the next state.\n`;
    }
    write(`${rel}/support/s${pad(k)}.ts`, body);
    supportIndex += `export * from './s${pad(k)}';\n`;
  }
  if (supportCount >= opts.schemaFrom) supportIndex += `export type * as Schema from '@repro/schema';\n`;
  write(`${rel}/support/index.ts`, supportIndex);
  let fx = `import { test as base, expect } from '@repro/e2e';\nimport type { Record0 } from './s0000';\nexport const test = base`;
  for (let l = 0; l < opts.fixtureLevels; l++) fx += `\n  .extend<{ fixture${l}: Record0 }>({ fixture${l}: async ({ page }, use) => { await page.goto('/f${l}'); await use({ id: '${l}', count: ${l} }); } })`;
  write(`${rel}/support/fixtures.ts`, fx + `;\nexport { expect };\n`);
  for (let f = 0; f < count; f++) {
    const a = refs[f % refs.length];
    const ext = f % 7 === 6 ? 'tsx' : 'ts';
    const jsx =
      ext === 'tsx'
        ? `export const View${f} = () => <div className="v${f}">{String(${f})}</div>;\n`
        : '';
    const p = `${rel}/flow${f}.spec.${ext}`;
    const extra = closureList.slice(0, opts.importsPerTest).map((q, i) => `import { load${i % 4} as l${i} } from '@repro/p${pad(q)}';\n`).join('');
    const extraUse = closureList.slice(0, opts.importsPerTest).map((q, i) => `  await l${i}('${s}');\n`).join('');
    let steps = '';
    for (let k = 0; k < opts.stepsPerTest; k++) {
      steps += `  await page.locator('#f${f}-${k}').action${k % opts.locatorMethods}();\n  const v${k} = await support.helper${k % supportCount}({ id: '${s}-${k}', count: fixture0.count + ${k} });\n  await expect(page.locator('#v${k}')).toHave${k % opts.matchers}(String(v${k}.count));\n  await page.method${k % opts.pageMethods}('#m${k}');\n`;
    }
    write(
      p,
      `import { test, expect } from './support/fixtures';\n${extra}import { Screen, load0 } from '@repro/p${pad(a)}';\nimport * as support from './support/index';\n${jsx}` +
        `test('flow ${s}.${f}', async ({ page, fixture0 }) => {\n  await page.goto('/s${s}/${f}');\n  const screen = new Screen('${s}');\n` +
        (f === 0 ? `  screen.open();\n` : `  await screen.open();\n`) +
        steps + extraUse + `  await load0('${s}');\n});\n`,
    );
    files.push(p);
  }
}
const ruleOptions = {
  allowForKnownSafeCalls: [],
  allowForKnownSafePromises: [],
  checkThenables: false,
  ignoreIIFE: false,
  ignoreVoid: true,
};
write(
  'payload.json',
  JSON.stringify({
    version: 2,
    configs: [
      {
        file_paths: files.map((p) => path.resolve(dir, p)),
        rules: [{ name: 'no-floating-promises', options: ruleOptions }],
      },
    ],
    source_overrides: null,
    report_syntactic: false,
    report_semantic: false,
  }),
);
write('files.txt', files.join('\n') + '\n');
const sorted = [...closures].sort((x, y) => x - y);
const q = (f) => sorted[Math.floor(f * (sorted.length - 1))];
console.log(
  JSON.stringify({
    suites: opts.suites,
    lintedFiles: files.length,
    packages: opts.packages,
    tsconfigsInRequest: union.size + opts.suites,
    closure: {
      min: q(0),
      p25: q(0.25),
      median: q(0.5),
      p75: q(0.75),
      max: q(1),
      sum: closures.reduce((a, b) => a + b, 0),
    },
  }),
);
