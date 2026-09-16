import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('project authoring save, library, publication and release artwork boundary', () => {
  const result = spawnSync('python3', ['../tools/avatar-editor/test_authoring.py'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
