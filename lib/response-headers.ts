/** Shared by the web Worker and regression tests. Preserve streaming bodies. */
export function secureResponse(response: Response, requestUrl: string): Response {
  const result = new Response(response.body, response);
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  result.headers.set('X-Frame-Options', 'DENY');
  result.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const url = new URL(requestUrl);
  if (url.protocol === 'https:') result.headers.set('Strict-Transport-Security', 'max-age=31536000');
  if (/^\/(sign-in|sign-up|profile|settings)(\/|$)/.test(url.pathname)
    || /^\/api\/(profile|account|reports|webhooks)(\/|$)/.test(url.pathname)) {
    result.headers.set('Cache-Control', 'private, no-store');
  }
  return result;
}
