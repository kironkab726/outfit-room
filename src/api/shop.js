// GET /api/shop?q=검색어&max=가격상한
// Claude 웹 검색으로 한국 쇼핑몰의 실제 상품 페이지를 찾아 줌 (사진·가격·구매 링크)
//   - 네이버 쇼핑 검색 API는 2026-07-31에 종료되어 Claude 웹 검색으로 대신함
//   - 링크는 검색 결과에 실제로 나온 주소만 씀 (AI가 지어낸 주소는 버림)
//   - 상품 사진은 상품 페이지의 og:image 를 읽어서 씀 (가상 피팅에 필요)
//   - 같은 검색어는 6시간 동안 저장해 두고 다시 씀 (비용 절약)
// 키(ANTHROPIC_API_KEY)가 없으면 상품 없이 쇼핑몰 검색 링크만 돌려줌 (데모 모드)

import Anthropic from '@anthropic-ai/sdk';
import { json, fail, checkAccess } from '../_lib.js';

// 상품을 찾을 쇼핑몰 (여기에 있는 주소의 상품만 보여 줌)
const MALLS = {
  'musinsa.com': '무신사',
  '29cm.co.kr': '29CM',
  'wconcept.co.kr': 'W컨셉',
  'ssfshop.com': 'SSF샵',
  'lfmall.co.kr': 'LF몰',
  'thehyundai.com': '더현대닷컴',
  'ssg.com': 'SSG닷컴',
  'lotteon.com': '롯데ON',
  'coupang.com': '쿠팡',
  '11st.co.kr': '11번가',
  'gmarket.co.kr': 'G마켓',
  'zigzag.kr': '지그재그',
  'a-bly.com': '에이블리',
  'smartstore.naver.com': '네이버 스마트스토어',
  'brand.naver.com': '네이버 브랜드스토어',
  'uniqlo.com': '유니클로',
  'spao.com': '스파오',
  'topten10mall.com': '탑텐',
};

const CACHE_SECONDS = 6 * 60 * 60;

function mallOf(url) {
  try {
    const host = new URL(url).hostname.replace(/^(www|m)\./, '');
    for (const [domain, name] of Object.entries(MALLS)) {
      if (host === domain || host.endsWith(`.${domain}`)) return name;
    }
  } catch { /* 잘못된 주소 */ }
  return null;
}

function searchLinks(q) {
  const e = encodeURIComponent(q);
  return [
    { name: '네이버쇼핑', url: `https://search.shopping.naver.com/search/all?query=${e}` },
    { name: '무신사', url: `https://www.musinsa.com/search/goods?keyword=${e}` },
    { name: '29CM', url: `https://www.29cm.co.kr/search?keyword=${e}` },
    { name: '쿠팡', url: `https://www.coupang.com/np/search?q=${e}` },
  ];
}

const REPORT_TOOL = {
  name: 'report_products',
  description: '찾은 상품을 보고합니다. 웹 검색을 마친 뒤 마지막에 한 번 호출하세요.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['products'],
    properties: {
      products: {
        type: 'array',
        description: '검색어에 가장 잘 맞는 상품 최대 6개. 상품 상세 페이지만 (검색 결과·카테고리·기획전 페이지 제외)',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'url', 'price'],
          properties: {
            title: { type: 'string', description: '상품명' },
            url: { type: 'string', description: '웹 검색 결과에 나온 상품 상세 페이지 주소 그대로' },
            price: { type: 'integer', description: '검색 결과에 보인 판매가(원). 모르면 0' },
          },
        },
      },
    },
  },
};

// 검색 결과 블록에 실제로 나온 주소 모으기
function collectSearchUrls(content, into) {
  for (const block of content) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) if (r.url) into.add(r.url);
    }
  }
}

async function findProducts(env, q, max) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const messages = [{
    role: 'user',
    content: `한국 쇼핑몰에서 다음 옷의 실제 판매 상품을 찾아 주세요.\n검색어: ${q}${max ? `\n가격: ${max.toLocaleString('ko-KR')}원 이하 우선` : ''}\n\n웹 검색으로 상품 상세 페이지를 찾은 뒤 report_products 도구로 보고하세요. 검색 결과에 실제로 나온 주소만 쓰고, 품절로 보이는 상품은 빼세요.`,
  }];
  const seen = new Set();

  // 서버 도구가 오래 걸리면 pause_turn 으로 끊길 수 있어서 몇 번 이어서 진행
  for (let turn = 0; turn < 4; turn++) {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // 안전 필터가 거절하면 서버가 다른 모델로 알아서 다시 시도
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 3,
          allowed_domains: Object.keys(MALLS),
          user_location: { type: 'approximate', country: 'KR', timezone: 'Asia/Seoul' },
        },
        REPORT_TOOL,
      ],
      messages,
    });
    collectSearchUrls(response.content, seen);

    const report = response.content.find(b => b.type === 'tool_use' && b.name === 'report_products');
    if (report) return { products: report.input.products || [], seen };
    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }
    if (response.stop_reason === 'end_turn') {
      // 보고 없이 끝나면 한 번 더 요청
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: 'report_products 도구로 찾은 상품을 보고해 주세요.' });
      continue;
    }
    break;
  }
  return { products: [], seen };
}

// 상품 페이지에서 대표 사진(og:image) 읽기
async function ogImage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OutfitRoomBot/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(6000),
      redirect: 'follow',
    });
    // 없는 페이지면 상품을 빼고, 그 밖의 실패는 링크만 살림
    if (!res.ok) return { ok: res.status !== 404 && res.status !== 410, image: null };
    const html = (await res.text()).slice(0, 300000);
    const m = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    let image = m ? m[1].replace(/&amp;/g, '&') : null;
    if (image && image.startsWith('//')) image = `https:${image}`;
    if (image && !/^https:\/\//.test(image)) image = null;
    return { ok: true, image };
  } catch {
    return { ok: true, image: null }; // 막혀 있거나 느린 쇼핑몰: 링크는 살리고 사진만 없음
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  if (!q) return fail('검색어가 없어요.');
  const max = Number(url.searchParams.get('max')) || 0;
  const links = searchLinks(q);

  if (!env.ANTHROPIC_API_KEY) return json({ demo: true, items: [], links });

  const denied = checkAccess(request, env);
  if (denied) return denied;

  // 같은 검색어는 저장해 둔 결과를 씀
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(`https://cache.outfit-room/shop?q=${encodeURIComponent(q)}&max=${max}`);
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  let found;
  try {
    found = await findProducts(env, q, max);
  } catch (e) {
    console.log('shop error', e && e.message);
    if (e instanceof Anthropic.RateLimitError) return json({ error: '요청이 많아요. 잠시 후 다시 시도해 주세요.', items: [], links }, 429);
    return json({ error: '상품 검색이 잠시 안 돼요.', items: [], links }, 502);
  }

  // 검색 결과에 실제로 나온, 허용한 쇼핑몰의 주소만 남김
  const unique = new Map();
  for (const p of found.products) {
    const mall = mallOf(p.url);
    if (!mall || !found.seen.has(p.url) || unique.has(p.url)) continue;
    unique.set(p.url, { title: String(p.title).slice(0, 120), link: p.url, price: p.price > 0 ? p.price : 0, mall });
  }
  let items = [...unique.values()].slice(0, 6);

  const pages = await Promise.all(items.map(it => ogImage(it.link)));
  items = items
    .map((it, i) => ({ ...it, image: pages[i].image, alive: pages[i].ok }))
    .filter(it => it.alive)
    .map(({ alive, ...it }) => it);

  // 예산 안의 상품, 사진 있는 상품(가상 피팅 가능)을 앞으로
  const score = it => (max && it.price && it.price <= max ? 2 : 0) + (it.image ? 1 : 0);
  items.sort((a, b) => score(b) - score(a));
  items = items.slice(0, 4);

  if (cache && items.length) {
    await cache.put(cacheKey, new Response(JSON.stringify({ items, links }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` },
    }));
  }
  return json({ items, links });
}
