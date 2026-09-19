import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { checkDiff, renderIndex, validate } from './lib.mjs';

const progress = 'harness/progress/2026-09-19-session.md';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'esteh-harness-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, value) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(
      join(root, path),
      typeof value === 'string' ? value : JSON.stringify(value),
    );
  };
  const feature = (id = 'one', changes = {}) => {
    const f = {
      id,
      priority: 0,
      area: 'tooling',
      title: id,
      status: 'not_started',
      branch: null,
      depends_on: [],
      spec: 'docs/spec.md',
      verification: ['npm test'],
      evidence: [],
      ...changes,
    };
    write(`harness/features/${id}.json`, f);
    return f;
  };
  write('docs/spec.md', '# Spec');
  feature();
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const commit = () => {
    git('add', '.');
    git(
      '-c',
      'user.name=Harness Test',
      '-c',
      'user.email=harness@example.invalid',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-qm',
      'fixture',
    );
    return git('rev-parse', 'HEAD');
  };
  const init = () => {
    git('init', '-q');
    return commit();
  };
  return { root, write, feature, git, commit, init };
}

test('valid state does not require Git; empty tracker set fails', (t) => {
  const f = fixture(t);
  assert.deepEqual(validate(f.root).errors, []);
  rmSync(join(f.root, 'harness/features/one.json'));
  assert.match(validate(f.root).errors.join(), /tidak ada tracker/);
});

test('malformed JSON and non-object roots fail', (t) => {
  const f = fixture(t);
  for (const bad of ['{', 'null', '[]', 'true']) {
    f.write('harness/features/one.json', bad);
    assert.ok(validate(f.root).errors.length > 0);
  }
});

test('schema rejects invalid types, statuses, IDs and blank verification', (t) => {
  const f = fixture(t);
  for (const patch of [
    { id: 1 },
    { id: 'other' },
    { priority: -1 },
    { priority: '1' },
    { area: '' },
    { title: null },
    { status: 'done' },
    { branch: 2 },
    { depends_on: [null] },
    { depends_on: ['two', 'two'] },
    { verification: [] },
    { verification: [' '] },
    { evidence: {} },
    { spec: '../missing' },
  ]) {
    f.feature('one', patch);
    assert.ok(validate(f.root).errors.length, JSON.stringify(patch));
  }
});

test('passing needs existing progress evidence, not a claim or outside symlink', (t) => {
  const f = fixture(t);
  f.feature('one', { status: 'passing' });
  assert.match(validate(f.root).errors.join(), /evidence_before_passing/);
  for (const evidence of [
    ['passed'],
    [{ path: progress, summary: 'passed' }],
  ]) {
    f.feature('one', { status: 'passing', evidence });
    assert.ok(validate(f.root).errors.length);
  }
  f.write(progress, '# npm test: exit 0');
  assert.deepEqual(validate(f.root).errors, []);
  f.feature('one', {
    status: 'passing',
    evidence: [{ path: progress, summary: '' }],
  });
  assert.ok(validate(f.root).errors.length);
  rmSync(join(f.root, progress));
  symlinkSync(new URL('./lib.mjs', import.meta.url), join(f.root, progress));
  f.feature('one', {
    status: 'passing',
    evidence: [{ path: progress, summary: 'outside' }],
  });
  assert.ok(validate(f.root).errors.length);
});

test('blocked needs reason; in_progress needs branch and single active per branch', (t) => {
  const f = fixture(t);
  f.feature('one', { status: 'blocked' });
  assert.ok(validate(f.root).errors.length);
  f.feature('one', { status: 'blocked', blocked_reason: 'decision pending' });
  assert.deepEqual(validate(f.root).errors, []);
  f.feature('one', { status: 'in_progress' });
  assert.ok(validate(f.root).errors.length);
  f.feature('one', { status: 'in_progress', branch: 'main' });
  f.feature('two', { status: 'in_progress', branch: 'main' });
  assert.match(validate(f.root).errors.join(), /sudah aktif/);
  f.feature('two', { status: 'in_progress', branch: 'feature/two' });
  assert.deepEqual(validate(f.root).errors, []);
});

test('dependencies must exist, be acyclic and pass before dependent starts/passes', (t) => {
  const f = fixture(t);
  f.feature('one', { depends_on: ['two'] });
  assert.match(validate(f.root).errors.join(), /tidak ada/);
  f.feature('two', { depends_on: ['one'] });
  assert.match(validate(f.root).errors.join(), /cycle/);
  f.feature('two');
  for (const status of ['in_progress', 'passing']) {
    f.feature('one', { depends_on: ['two'], status, branch: 'main' });
    assert.match(validate(f.root).errors.join(), /belum passing/);
  }
  f.write(progress, '# tests pass');
  const evidence = [{ path: progress, summary: 'tests pass' }];
  f.feature('two', { status: 'passing', evidence });
  f.feature('one', { depends_on: ['two'], status: 'passing', evidence });
  assert.deepEqual(validate(f.root).errors, []);
});

test('index deterministic, sorted and linked, with escaped table cells', (t) => {
  const f = fixture(t);
  f.feature('two', { title: 'Two | feature', priority: 2 });
  f.write(progress, '# session');
  f.write('harness/handoffs/task.md', '# handoff');
  const { features } = validate(f.root);
  const index = renderIndex(f.root, features);
  assert.equal(index, renderIndex(f.root, features.reverse()));
  assert.match(index, /Two \\\| feature/);
  assert.match(index, /handoffs\/task.md/);
  assert.match(index, /progress\/2026-09-19-session.md/);
});

test('CLI handles invalid invocation and preserves index on invalid state', (t) => {
  const f = fixture(t);
  cpSync(new URL('./', import.meta.url), join(f.root, 'scripts/harness'), {
    recursive: true,
  });
  const cli = (...args) =>
    spawnSync(
      process.execPath,
      [join(f.root, 'scripts/harness/cli.mjs'), ...args],
      { cwd: tmpdir() },
    );
  assert.equal(cli('check').status, 0);
  for (const args of [
    [],
    ['wat'],
    ['check', '--base'],
    ['index', '--base', 'HEAD'],
    ['check', '--wat'],
    ['check', '--base', 'HEAD', 'extra'],
  ]) {
    assert.equal(cli(...args).status, 2);
  }
  assert.equal(cli('index').status, 0);
  const index = readFileSync(join(f.root, 'harness/INDEX.md'), 'utf8');
  f.write('harness/features/one.json', '{}');
  assert.equal(cli('index').status, 1);
  assert.equal(readFileSync(join(f.root, 'harness/INDEX.md'), 'utf8'), index);
});

test('diff gate needs valid base and permits docs-only committed changes', (t) => {
  const f = fixture(t);
  const base = f.init();
  assert.match(checkDiff(f.root, 'missing').join(), /Base commit/);
  f.write('docs/spec.md', '# updated');
  f.commit();
  assert.deepEqual(checkDiff(f.root, base), []);
});

test('runtime/config/unknown changes need new progress, not an old log', (t) => {
  const f = fixture(t);
  f.write(progress, '# previous session');
  const base = f.init();
  f.write('src/app.ts', 'export {};');
  f.commit();
  assert.match(checkDiff(f.root, base).join(), /memerlukan progress baru/);
  f.write('harness/progress/2026-09-19-new-session.md', '# verified');
  f.commit();
  assert.deepEqual(checkDiff(f.root, base), []);
  const next = f.git('rev-parse', 'HEAD');
  f.write('future-config.toml', 'value = 1');
  f.commit();
  assert.match(checkDiff(f.root, next).join(), /memerlukan progress baru/);
});

test('passing tracker without source changes still needs new session log', (t) => {
  const f = fixture(t);
  f.write(progress, '# old evidence');
  const base = f.init();
  f.feature('one', {
    status: 'passing',
    evidence: [{ path: progress, summary: 'old tests' }],
  });
  f.commit();
  assert.match(checkDiff(f.root, base).join(), /memerlukan progress baru/);
});

test('progress edits and renames fail append-only rule', (t) => {
  const f = fixture(t);
  f.write(progress, '# old');
  const base = f.init();
  f.write(progress, '# edited');
  f.commit();
  assert.match(checkDiff(f.root, base).join(), /append-only/);
  renameSync(
    join(f.root, progress),
    join(f.root, 'harness/progress/2026-09-19-renamed.md'),
  );
  f.commit();
  assert.match(checkDiff(f.root, base).join(), /append-only/);
});

test('empty or misnamed progress cannot satisfy diff gate', (t) => {
  const f = fixture(t);
  const base = f.init();
  f.write('package.json', '{}');
  f.write(progress, '  ');
  f.commit();
  assert.match(checkDiff(f.root, base).join(), /kosong/);
  f.write('harness/progress/wrong-name.md', '# session');
  f.commit();
  assert.match(checkDiff(f.root, base).join(), /nama progress/);
});
