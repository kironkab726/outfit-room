// API 함수들이 같이 쓰는 도우미

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function fail(message, status = 400) {
  return json({ error: message }, status);
}

// ACCESS_CODE 를 정해 두면, 화면에서 같은 코드를 넣은 요청만 유료 API를 씀
export function checkAccess(request, env) {
  if (!env.ACCESS_CODE) return null;
  if (request.headers.get('X-Access-Code') === env.ACCESS_CODE) return null;
  return fail('입장 코드가 맞지 않아요.', 401);
}

const MAX_BODY = 8 * 1024 * 1024; // 사진 여러 장이 base64로 들어오므로 넉넉히

export async function readJson(request) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_BODY) throw new Error('사진 용량이 너무 커요.');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new Error('사진 용량이 너무 커요.');
  return JSON.parse(text);
}

// "data:image/jpeg;base64,...." → { mediaType, data }
export function parseDataUrl(url) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(url || '');
  return m ? { mediaType: m[1], data: m[2] } : null;
}

export function isHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
