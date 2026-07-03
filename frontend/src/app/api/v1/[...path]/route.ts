import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
// Server-only. Never prefixed with NEXT_PUBLIC_, so it stays out of the bundle.
const API_KEY = process.env.API_KEY || '';

// Only these client request headers are forwarded upstream. The write key is
// injected here server-side rather than sent from the browser. `x-forwarded-for`
// is passed through (when a fronting proxy set it) so the backend rate limiter
// can key on the real client IP rather than this proxy's address.
const FORWARD_REQUEST_HEADERS = ['content-type', 'accept', 'x-forwarded-for'];

async function handler(req: NextRequest) {
  const url = `${BACKEND_URL}${req.nextUrl.pathname}${req.nextUrl.search}`;

  const requestHeaders = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) {
      requestHeaders.set(name, value);
    }
  }
  if (API_KEY) {
    requestHeaders.set('X-API-Key', API_KEY);
  }

  const init: RequestInit = { method: req.method, headers: requestHeaders };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text();
  }

  const upstream = await fetch(url, init);

  // Drop hop-by-hop and length/encoding headers. undici already decompressed the
  // body, so forwarding the upstream (compressed) content-length would truncate
  // or corrupt the response if the backend ever enables gzip. Let the runtime
  // recompute the length.
  const STRIP_RESPONSE_HEADERS = [
    'content-encoding',
    'content-length',
    'transfer-encoding',
    'connection',
  ];
  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIP_RESPONSE_HEADERS.includes(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
