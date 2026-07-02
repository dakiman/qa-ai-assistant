import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
// Server-only. Never prefixed with NEXT_PUBLIC_, so it stays out of the bundle.
const API_KEY = process.env.API_KEY || '';

// Only these client request headers are forwarded upstream. The write key is
// injected here server-side rather than sent from the browser.
const FORWARD_REQUEST_HEADERS = ['content-type', 'accept'];

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

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
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
