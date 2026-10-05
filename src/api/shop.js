// GET /api/shop?q=검색어&max=가격상한
// 네이버쇼핑 검색 API로 실제 상품(사진·가격·구매 링크)을 찾아 줌
// 키가 없으면 상품 없이 쇼핑몰 검색 링크만 돌려줌 (데모 모드)

import { json, fail } from '../_lib.js';

const stripTags = s => String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function searchLinks(q) {
  const e = encodeURIComponent(q);
  return [
    { name: '네이버쇼핑', url: `https://search.shopping.naver.com/search/all?query=${e}` },
    { name: '무신사', url: `https://www.musinsa.com/search/goods?keyword=${e}` },
    { name: '29CM', url: `https://www.29cm.co.kr/search?keyword=${e}` },
    { name: '쿠팡', url: `https://www.coupang.com/np/search?q=${e}` },
  ];
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  if (!q) return fail('검색어가 없어요.');
  const max = Number(url.searchParams.get('max')) || 0;
  const links = searchLinks(q);

  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) return json({ demo: true, items: [], links });

  const api = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(q)}&display=20&sort=sim&exclude=used:rental:cbshop`;
  const res = await fetch(api, {
    headers: { 'X-Naver-Client-Id': env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET },
  });
  if (!res.ok) return json({ error: '쇼핑 검색이 잠시 안 돼요.', items: [], links }, 502);

  const data = await res.json();
  let items = (data.items || []).map(it => ({
    title: stripTags(it.title),
    link: it.link,
    image: it.image,
    price: Number(it.lprice) || 0,
    mall: it.mallName || '',
    brand: it.brand || '',
  })).filter(it => it.link && it.image && it.price > 0);

  // 가격 상한이 있으면 그 안의 상품을 먼저
  if (max > 0) {
    const within = items.filter(it => it.price <= max);
    if (within.length >= 3) items = within;
  }

  return json({ items: items.slice(0, 6), links }, 200);
}
