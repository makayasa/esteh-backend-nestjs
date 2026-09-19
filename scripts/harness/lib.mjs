import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const statuses = ['not_started', 'in_progress', 'blocked', 'passing'];
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const texts = (value) =>
  Array.isArray(value) && value.length > 0 && value.every(text);
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function files(root, directory, extension) {
  const path = resolve(root, directory);
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => entry.name)
    .sort();
}

function localFile(root, path) {
  if (!text(path) || isAbsolute(path)) return false;
  const target = resolve(root, path);
  if (!existsSync(target)) return false;
  const rel = relative(realpathSync(root), realpathSync(target));
  return (
    rel !== '..' &&
    !rel.startsWith(`..${sep}`) &&
    !isAbsolute(rel) &&
    statSync(target).isFile()
  );
}

export function validate(root) {
  const errors = [];
  const features = [];
  const names = files(root, 'harness/features', '.json');
  if (!names.length) errors.push('harness/features/: tidak ada tracker JSON.');
  for (const name of names) {
    const fail = (message) => errors.push(`${name}: ${message}`);
    let f;
    try {
      f = JSON.parse(
        readFileSync(resolve(root, 'harness/features', name), 'utf8'),
      );
    } catch {
      fail('JSON tidak valid.');
      continue;
    }
    if (!object(f)) {
      fail('root harus object.');
      continue;
    }
    features.push(f);
    if (!text(f.id) || !slug.test(f.id) || `${f.id}.json` !== name)
      fail('id harus slug dan cocok dengan nama file.');
    if (!Number.isInteger(f.priority) || f.priority < 0)
      fail('priority harus integer >= 0.');
    for (const key of ['area', 'title'])
      if (!text(f[key])) fail(`${key} harus string non-kosong.`);
    if (!statuses.includes(f.status)) fail('status tidak valid.');
    if (f.branch !== null && !text(f.branch))
      fail('branch harus string non-kosong atau null.');
    if (f.status === 'in_progress' && !text(f.branch))
      fail('in_progress memerlukan branch.');
    if (f.status === 'blocked' && !text(f.blocked_reason))
      fail('blocked memerlukan blocked_reason.');
    if (
      !Array.isArray(f.depends_on) ||
      !f.depends_on.every((id) => text(id) && slug.test(id)) ||
      new Set(f.depends_on).size !== f.depends_on.length
    )
      fail('depends_on harus array ID unik.');
    if (!text(f.spec) || !localFile(root, f.spec.split('#')[0]))
      fail('spec harus menunjuk file repo yang tersedia.');
    if (!texts(f.verification))
      fail('verification harus array string non-kosong.');
    if (!Array.isArray(f.evidence)) fail('evidence harus array.');
    else {
      if (f.status === 'passing' && !f.evidence.length)
        fail('passing memerlukan evidence (evidence_before_passing).');
      for (const item of f.evidence) {
        if (
          !object(item) ||
          !text(item.summary) ||
          !text(item.path) ||
          !/^harness\/progress\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(
            item.path,
          ) ||
          !localFile(root, item.path)
        )
          fail(
            'evidence harus memiliki summary dan path progress repo yang tersedia.',
          );
      }
    }
  }
  const byId = new Map(
    features.filter((f) => text(f.id)).map((f) => [f.id, f]),
  );
  const active = new Map();
  for (const f of features) {
    if (f.status === 'in_progress' && text(f.branch)) {
      if (active.has(f.branch))
        errors.push(
          `${f.id}: branch ${f.branch} sudah aktif pada ${active.get(f.branch)}.`,
        );
      active.set(f.branch, f.id);
    }
    if (!Array.isArray(f.depends_on)) continue;
    for (const id of f.depends_on) {
      if (!byId.has(id)) errors.push(`${f.id}: dependency ${id} tidak ada.`);
      else if (
        ['passing', 'in_progress'].includes(f.status) &&
        byId.get(id).status !== 'passing'
      ) {
        errors.push(`${f.id}: dependency ${id} belum passing.`);
      }
    }
  }
  const visited = new Set();
  const visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) {
      errors.push(`${id}: dependency cycle.`);
      return;
    }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    const dependencies = byId.get(id).depends_on;
    if (Array.isArray(dependencies)) for (const dep of dependencies) visit(dep);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
  return { features, errors };
}

function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// Committed trees only. Git rename detection is disabled so renaming an old
// progress entry cannot masquerade as a new session without deleting history.
export function checkDiff(root, base) {
  let baseSha;
  try {
    baseSha = git(
      root,
      'rev-parse',
      '--verify',
      '--end-of-options',
      `${base}^{commit}`,
    ).trim();
  } catch {
    return [`Base commit tidak tersedia: ${base}`];
  }
  let fields;
  try {
    fields = git(
      root,
      'diff',
      '--name-status',
      '-z',
      '--no-renames',
      baseSha,
      'HEAD',
      '--',
    ).split('\0');
  } catch {
    return ['HEAD/diff tidak tersedia; buat commit dahulu untuk mode --base.'];
  }
  const changes = [];
  for (let i = 0; i < fields.length - 1; i += 2)
    changes.push({ status: fields[i], path: fields[i + 1] });
  const errors = [];
  let needsProgress = false;
  let addedProgress = false;
  for (const change of changes) {
    const { status, path } = change;
    if (path.startsWith('harness/progress/')) {
      if (status !== 'A')
        errors.push(
          `${path}: progress append-only, riwayat tidak boleh diubah/dihapus.`,
        );
      else if (
        /^harness\/progress\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(path)
      ) {
        if (git(root, 'show', `HEAD:${path}`).trim()) addedProgress = true;
        else errors.push(`${path}: progress baru kosong.`);
      } else errors.push(`${path}: nama progress harus YYYY-MM-DD-<slug>.md.`);
    }
    // Known documentation paths are cheap; everything else defaults to requiring
    // a session record, including future runtime/config directories.
    const documentation =
      path.startsWith('docs/') ||
      path.startsWith('harness/') ||
      ['README.md', 'AGENTS.md', 'CLAUDE.md', 'CONTEXT.md'].includes(path);
    if (!documentation) needsProgress = true;
    if (/^harness\/features\/[^/]+\.json$/.test(path) && status !== 'D') {
      try {
        if (JSON.parse(git(root, 'show', `HEAD:${path}`)).status === 'passing')
          needsProgress = true;
      } catch {
        errors.push(`${path}: tracker pada HEAD bukan JSON valid.`);
      }
    }
  }
  if (needsProgress && !addedProgress)
    errors.push(
      'Perubahan kode/config/tooling atau tracker passing memerlukan progress baru.',
    );
  return errors;
}

const cell = (value) =>
  String(value)
    .replaceAll('|', '\\|')
    .replace(/[\r\n]/g, ' ');
export function renderIndex(root, features) {
  const sorted = [...features].sort(
    (a, b) =>
      a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const lines = [
    '# Harness Index — GENERATED',
    '',
    'Regenerasi: `npm run harness:index`. Sumber kebenaran: shard features/progress/handoffs.',
    '',
    `## Features (${sorted.length})`,
    '',
    '| Prio | Status | Feature | Branch | Evidence |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const f of sorted)
    lines.push(
      `| ${f.priority} | ${f.status} | [${cell(f.title)}](features/${f.id}.json) | ${cell(f.branch ?? '—')} | ${f.evidence.length} |`,
    );
  for (const [directory, heading, latest] of [
    ['handoffs', 'Handoffs', false],
    ['progress', 'Progress terbaru', true],
  ]) {
    let names = files(root, `harness/${directory}`, '.md');
    if (latest) names = names.reverse().slice(0, 10);
    lines.push('', `## ${heading}`, '');
    lines.push(
      ...(names.length
        ? names.map((name) => `- [${name}](${directory}/${name})`)
        : ['_Belum ada._']),
    );
  }
  return lines.join('\n') + '\n';
}
