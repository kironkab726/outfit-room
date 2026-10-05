// Cloudflare Worker 입구
//   /api/* 요청은 아래 함수로, 나머지(화면 파일)는 public/ 폴더에서 그대로 내려줌

import * as recommend from './api/recommend.js';
import * as shop from './api/shop.js';
import * as tryon from './api/tryon.js';
import { fail } from './_lib.js';

const ROUTES = {
  'POST /api/recommend': recommend.onRequestPost,
  'GET /api/shop': shop.onRequestGet,
  'POST /api/tryon': tryon.onRequestPost,
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const handler = ROUTES[`${request.method} ${pathname}`];
    if (!handler) return fail('없는 주소예요.', 404);
    try {
      return await handler({ request, env });
    } catch (e) {
      console.log('api error', pathname, e && e.stack);
      return fail('서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요.', 500);
    }
  },
};
