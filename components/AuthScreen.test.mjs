import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { safeReturnPath } from '../lib/auth-path.ts';

// Exercise the page before the external identity script is available, and on failure.
const source = await readFile(new URL('./AuthScreen.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText.replace(/^import .+ from ["'][^"']+["'];?\r?$/gm, '');
globalThis.__authScreenTest = { React, safeReturnPath, path: '/profile', status: 'loading' };
const prelude = `const context=globalThis.__authScreenTest;
const {React,safeReturnPath}=context;
const {useEffect,useState}=React;
const useSyncExternalStore=()=>safeReturnPath(context.path);
const Link='a',BrandLogo=()=>null,ThemeToggle=()=>null;
const ArrowLeft=()=>null,ArrowRight=()=>null,Bookmark=()=>null,LoaderCircle=()=>null,RefreshCw=()=>null;
const ClerkLoading=({children})=>context.status==='loading'?children:null;
const ClerkFailed=({children})=>context.status==='error'?children:null;
const ClerkLoaded=({children})=>context.status==='loaded'?children:null,SignIn=()=>null,SignUp=()=>null;
const useAuth=()=>({isLoaded:context.status==='loaded',isSignedIn:false});`;
const { default: AuthScreen } = await import(`data:text/javascript;base64,${Buffer.from(prelude + compiled).toString('base64')}`);
const render = (path, status = 'loading', mode = 'sign-in') => {
  Object.assign(globalThis.__authScreenTest, { path, status });
  return renderToStaticMarkup(React.createElement(AuthScreen, { mode }));
};

test('an unavailable identity script leaves a useful sign-in page and public escape route', () => {
  const html = render('/profile');
  assert.match(html, /Welcome back/);
  assert.match(html, /role="status"/);
  assert.match(html, /Loading secure sign-in/);
  assert.match(html, /href="\/"[^>]*>Just here to read/);
  assert.doesNotMatch(html, /Opening sign-in/);
});

test('identity service failures expose recovery without hiding guest browsing', () => {
  const html = render('/settings', 'error');
  assert.match(html, /Sign-in couldn’t load/);
  assert.match(html, /Try again/);
  assert.match(html, /Browse blogs/);
  assert.doesNotMatch(html, /Loading secure sign-in/);
});

test('guest browsing retains public story context but never targets account pages or outside origins', () => {
  const story = '/articles/a-story?return_to=%2F%3Ftopic%3DData';
  assert.ok(render(story).includes(`href="${story}"`));
  for (const path of ['/profile?tab=saved', '/settings#data', '//untrusted.test', '/sign-in']) {
    assert.match(render(path), /href="\/"[^>]*>Just here to read/);
  }
});

test('sign-up has its own heading while retaining the same loading and recovery experience', () => {
  const html = render('/profile', 'error', 'sign-up');
  assert.match(html, /A shelf of your own/);
  assert.match(html, /Try again/);
});

test('authentication uses Google exclusively with no manual email or password fields', () => {
  const signUpHtml = render('/profile', 'loaded', 'sign-up');
  assert.match(signUpHtml, /Sign in with Google/);
  assert.doesNotMatch(signUpHtml, /id="auth-name"/);
  assert.doesNotMatch(signUpHtml, /id="auth-email"/);
  assert.doesNotMatch(signUpHtml, /id="auth-password"/);

  const signInHtml = render('/profile', 'loaded', 'sign-in');
  assert.match(signInHtml, /Sign in with Google/);
  assert.doesNotMatch(signInHtml, /id="auth-name"/);
  assert.doesNotMatch(signInHtml, /id="auth-email"/);
  assert.doesNotMatch(signInHtml, /id="auth-password"/);
});

