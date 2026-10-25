// Accept local app paths only, including when Supabase returns from an OAuth flow.
export function safeReturnPath(value: string | null | undefined): string {
  if (!value?.startsWith('/') || value.startsWith('//')) return '/profile';
  try {
    const url = new URL(value, 'https://readwell.local');
    if (url.origin !== 'https://readwell.local' || /^\/sign-(in|up)(\/|$)/.test(url.pathname)) return '/profile';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/profile'; }
}

export function signInPath(returnTo: string) {
  return '/sign-in?return_to=' + encodeURIComponent(safeReturnPath(returnTo));
}
