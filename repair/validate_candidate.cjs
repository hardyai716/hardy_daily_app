#!/usr/bin/env node
// Validates a generated candidate without contacting WorkBuddy.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const candidateDir = process.argv[2];
if (!candidateDir) throw new Error('Usage: node repair/validate_candidate.cjs <candidate-dir>');

const indexPath = path.join(candidateDir, 'index.html');
const lifePath = path.join(candidateDir, 'life-all-in-one.html');
const manifestPath = path.join(candidateDir, 'manifest.json');
const submissionPath = path.join(candidateDir, 'WORKBUDDY_SUBMISSION.md');
const index = fs.readFileSync(indexPath);
const life = fs.readFileSync(lifePath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const source = index.toString('utf8');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

assert.deepEqual(index, life, 'index.html and life-all-in-one.html differ');
assert.equal(index.length, manifest.bytes, 'manifest byte count is stale');
assert.equal(sha256(index), manifest.candidate_sha256, 'manifest SHA-256 is stale');
assert.equal(manifest.two_paths_identical, true);
assert.equal(Number(source.match(/appVersion:(\d+)/)?.[1]), manifest.app_version);
assert.equal(Number(source.match(/schemaVersion:(\d+)/)?.[1]), manifest.schema_version);
assert.equal((source.match(/\n/g) || []).length, (source.match(/\r\n/g) || []).length, 'HTML has bare LF line endings');

const bindings = [
  'DB_MONEY',
  'DB_HABIT',
  'DB_PLAN',
  'DB_FITNESS',
  'DB_SHOPPING',
  'DB_MEDIA',
  'DB_HABIT_DEFS',
  'DB_SETTINGS',
  'DB_ASSET_ACCOUNTS',
  'DB_ASSET_SNAPSHOTS',
  'DB_ASSET_SNAPSHOT_ITEMS',
];
const ids = Object.fromEntries(bindings.map(name => {
  const match = source.match(new RegExp(`var ${name} = '([^']*)'`));
  assert.ok(match, `missing binding ${name}`);
  assert.ok(match[1], `empty binding ${name}`);
  return [name, match[1]];
}));
assert.equal(new Set(Object.values(ids)).size, bindings.length, 'database bindings are not unique');
assert.equal(manifest.database_bindings, bindings.length);
if (fs.existsSync(submissionPath)) {
  const submission = fs.readFileSync(submissionPath, 'utf8');
  assert.ok(submission.includes(String(index.length)), 'submission byte count is stale');
  assert.ok(submission.includes(sha256(index)), 'submission SHA-256 is stale');
}

console.log(JSON.stringify({
  candidateDir,
  bytes: index.length,
  sha256: sha256(index),
  appVersion: manifest.app_version,
  schemaVersion: manifest.schema_version,
  twoPathsIdentical: true,
  databaseBindings: bindings.length,
}, null, 2));
