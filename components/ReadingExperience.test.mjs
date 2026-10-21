import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { emptyProfile } from '../lib/server/core.ts';
import { readingSpot } from '../lib/reading-spot.ts';

async function component(name) {
  const source = await readFile(new URL(`./${name}.tsx`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText.replace(/^import .+ from ["'][^"']+["'];?\r?$/gm, '');
  globalThis.__readingExperienceTest = { React, readingSpot };
  const prelude = `const {React,readingSpot}=globalThis.__readingExperienceTest;
    const {useId,useState,useSyncExternalStore}=React;
    const TOPICS=[],Link='a',CompanyLogo=()=>null,FeedPagination=()=>null,downloadJson=()=>{};
    const ArrowRight=()=>null,BookOpenCheck=()=>null,Bookmark=()=>null,Check=()=>null,ChevronDown=()=>null,Pencil=()=>null,SlidersHorizontal=()=>null,X=()=>null;`;
  return (await import(`data:text/javascript;base64,${Buffer.from(prelude + compiled).toString('base64')}`)).default;
}
const ProfileView = await component('ProfileView');
const ProfileSyncNotice = await component('ProfileSyncNotice');
delete globalThis.__readingExperienceTest;
const article = { id: 'last-story', company_id: 'github', company: 'GitHub', title: 'The story I finished', summary: 'A publisher excerpt.', url: 'https://github.blog/story', topics: [], published_at: null, discovered_at: '2026-10-01T00:00:00Z' };
const profile = { ...emptyProfile(), readLogs: [{ articleId: article.id, readAt: '2026-10-02T00:00:00Z' }] };
const renderProfile = patch => renderToStaticMarkup(React.createElement(ProfileView, { profile, articles: [article], sources: [], onChange: () => true, onOpen: () => {}, onBookmark: () => {}, onReadLog: () => {}, onCustomize: () => {}, ...patch }));

test('profile shows last read rather than the empty next-read prompt', () => {
  const html = renderProfile();
  assert.match(html, /Last read/);
  assert.match(html, /The story I finished/);
  assert.match(html, /Read again/);
  assert.doesNotMatch(html, /A little room|Synced to your account/);
});

test('history loading and failure never masquerade as an empty library', () => {
  assert.match(renderProfile({ articles: [], libraryState: 'loading' }), /Loading your last story/);
  const failed = renderProfile({ articles: [], libraryState: 'error' });
  assert.match(failed, /Your reading history is still saved/);
  assert.match(failed, /Try again/);
  assert.doesNotMatch(failed, /Your reading starts here/);
});

test('healthy sync stays quiet while saves, failures and conflicts stay actionable', () => {
  const props = { profile, ready: true, accountVerified: true, storageLabel: 'Synced to your account', syncStatus: 'synced', mutationError: '', recovery: null, retrySync: () => {}, resolveRecovery: () => {} };
  const render = patch => renderToStaticMarkup(React.createElement(ProfileSyncNotice, { ...props, ...patch }));
  assert.equal(render(), '');
  assert.match(render({ syncStatus: 'syncing', storageLabel: 'Saving your changes…' }), /Saving changes/);
  assert.match(render({ syncStatus: 'error', mutationError: 'Save failed' }), /Save failed.*Try syncing again/);
  assert.match(render({ recovery: emptyProfile() }), /Choose which reading copy to keep/);
});
