import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

async function handler(req: NextRequest) {
  const url = `${BACKEND_URL}${req.nextUrl.pathname}${req.nextUrl.search}`;

  const init: RequestInit = {
    method: req.method,
    headers: Object.fromEntries(req.headers),
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text();
  }

  const upstream = await fetch(url, init);

  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
