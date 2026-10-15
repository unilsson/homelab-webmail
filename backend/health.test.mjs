import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('API health route exists',()=>assert.match(readFileSync(new URL('./server.ts',import.meta.url),'utf8'),/\/api\/health/));
