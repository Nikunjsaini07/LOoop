import test from 'node:test';
import assert from 'node:assert/strict';
import { publisherExcerpt, visibleTopics } from './article-copy.ts';
test('publisher excerpts omit repeated titles and only strip an explicit long author roster', () => {
  assert.equal(publisherExcerpt({ title: 'PostgreSQL monitoring', summary: 'PostgreSQL monitoring' }), '');
  assert.equal(publisherExcerpt({ title: 'Article', summary: 'By Alice Adams, Ben Baker, Chris Clark, Dana Diaz Introduction The actual publisher introduction.' }), 'The actual publisher introduction.');
  assert.equal(publisherExcerpt({ title: 'Article', summary: 'By design, the system handles failures. Introduction to the implementation follows.' }), 'By design, the system handles failures. Introduction to the implementation follows.');
});
test('title-specific child topics stay visible without changing stored ranking scores', () => {
  assert.equal(visibleTopics({ title: 'TypeScript to Rust', topics: ['Frontend', 'Systems', 'Rust'] })[0], 'Rust');
  assert.equal(visibleTopics({ title: 'Distributed PostgreSQL latency', topics: ['Systems', 'Scale', 'Data', 'PostgreSQL'] })[0], 'PostgreSQL');
});
