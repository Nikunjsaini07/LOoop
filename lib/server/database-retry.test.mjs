import test from 'node:test';
import assert from 'node:assert/strict';
import {withDatabaseRetry} from './database-retry.ts';
test('brief database contention is retried while validation errors propagate immediately',async()=>{
 let attempts=0;
 assert.equal(await withDatabaseRetry(async()=>{if(++attempts===1)throw new Error('SQLITE_BUSY: database is locked');return 'ready';}),'ready');
 assert.equal(attempts,2);
 attempts=0;
 await assert.rejects(()=>withDatabaseRetry(async()=>{attempts++;throw new Error('Invalid feed cursor');}),/Invalid feed cursor/);
 assert.equal(attempts,1);
});
test('database retries are bounded when a runtime cannot recover',async()=>{
 let attempts=0;
 await assert.rejects(()=>withDatabaseRetry(async()=>{attempts++;throw new Error('D1_ERROR: Failed to parse body as JSON, got: internal error');}),/D1_ERROR/);
 assert.equal(attempts,3);
});
