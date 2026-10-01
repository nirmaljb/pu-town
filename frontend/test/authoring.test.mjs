import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// On Windows `python3` is usually the Microsoft Store placeholder, not an interpreter.
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

test('project authoring save, library, publication and release artwork boundary', () => {
  const result = spawnSync(PYTHON,['../tools/avatar-editor/test_authoring.py'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
