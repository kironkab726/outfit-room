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

// Anthropic API 오류를 화면에 보여 줄 말로 바꿈 (원인 파악용 오류 코드 포함)
export function describeApiError(e, what) {
  const status = e && e.status;
  const type = e && e.error && e.error.error && e.error.error.type;
  const detail = String((e && e.error && e.error.error && e.error.error.message) || (e && e.message) || '').slice(0, 160);
  console.log(`${what} error`, status, type, detail);
  let message;
  if (!status) message = `${what} 서버에 연결하지 못했어요.`;
  else if (status === 401) message = '서버의 Anthropic API 키가 올바르지 않아요. 키를 다시 확인해 주세요.';
  else if (status === 403) message = 'Anthropic이 요청을 막았어요. (서버 위치가 지원 지역이 아니거나 키 권한 문제)';
  else if (status === 404) message = '이 Anthropic 계정에서 쓸 수 없는 모델이에요.';
  else if (status === 400 && /credit/i.test(detail)) message = 'Anthropic 크레딧이 부족해요. console.anthropic.com 의 Billing 에서 충전해 주세요.';
  else if (status === 429) message = '요청이 많거나 사용 한도에 걸렸어요. 잠시 후 다시 시도해 주세요.';
  else if (status === 529 || status >= 500) message = 'Anthropic 서버가 붐벼요. 잠시 후 다시 시도해 주세요.';
  else message = `${what} 요청이 거절됐어요.`;
  return `${message} (오류 ${status || '연결'}${type ? ` ${type}` : ''}: ${detail})`;
}
