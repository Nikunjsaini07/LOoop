import { backendFetch } from '../backend';
import { secureResponse } from '../response-headers';

const forwardedHeaders = ['authorization', 'content-type', 'origin', 'sec-fetch-site'];
const methodsWithBody = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_BODY_BYTES = 600000;

export async function proxyApi(request: Request) {
  const url = new URL(request.url);
  const fail = (error: string, status: number) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
  
  const origin = request.headers.get('origin');
  // Next may normalize request.url to localhost behind its server adapter.
  // Host is the browser-facing authority; the API also checks the exact APP_ORIGIN.
  let sameHost = !origin;
  if (origin) {
    try { const source = new URL(origin); sameHost = ['http:', 'https:'].includes(source.protocol) && source.host === (request.headers.get('host') || url.host); }
    catch { sameHost = false; }
  }
  if (methodsWithBody.has(request.method) && (request.headers.get('sec-fetch-site') === 'cross-site' || !sameHost)) {
    return fail('This request must come from Readwell', 403);
  }
  try {
    const headers = new Headers();
    for (const name of forwardedHeaders) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    // Never forward browser-supplied proxy credentials, cookies, Host or IP headers.
    let body: ArrayBuffer | undefined;
    if (methodsWithBody.has(request.method)) {
      if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return fail('Request is too large', 413);
      const reader = request.body?.getReader();
      if (reader) {
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BODY_BYTES) { await reader.cancel(); return fail('Request is too large', 413); }
          chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        body = bytes.buffer;
      }
    }
    const response = await backendFetch(url.pathname + url.search, { method: request.method, headers, body });
    if (response.status >= 300 && response.status < 400) return fail('Unexpected article service redirect', 502);
    const result = secureResponse(response, request.url);
    // Node fetch decodes compressed upstream bodies. Their original encoding and
    // length must not be sent again or browsers attempt to decompress twice.
    result.headers.delete('Content-Encoding');
    result.headers.delete('Content-Length');
    result.headers.delete('Set-Cookie');
    result.headers.delete('X-Readwell-Proxy-Secret');
    if (!response.headers.get('Cache-Control')?.includes('public')) {
      result.headers.set('Cache-Control', 'private, no-store');
    }
    return result;
  } catch {
    return fail('The article service is temporarily unavailable. Please try again.', 503);
  }
}
