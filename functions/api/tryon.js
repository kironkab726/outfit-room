// POST /api/tryon  { person, garment, category }
// fal.ai 가상 피팅 모델로 내 사진에 옷을 입혀 봄
//   person  : 내 사진 (data URL) 또는 이전 피팅 결과 주소(https)
//   garment : 옷 사진 (상품 이미지 주소 또는 data URL)
//   category: tops | bottoms | one-pieces
// 키(FAL_KEY)가 없으면 원래 사진을 그대로 돌려줌 (데모 모드)

import { json, fail, checkAccess, readJson, parseDataUrl, isHttpUrl } from '../_lib.js';

const CATEGORIES = new Set(['tops', 'bottoms', 'one-pieces']);
const imageOk = v => !!parseDataUrl(v) || isHttpUrl(v);

export async function onRequestPost({ request, env }) {
  const denied = checkAccess(request, env);
  if (denied) return denied;

  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return fail(e.message || '요청을 읽지 못했어요.');
  }
  const { person, garment } = body;
  const category = CATEGORIES.has(body.category) ? body.category : 'auto';
  if (!imageOk(person)) return fail('내 사진이 없어요. 먼저 사진을 올려 주세요.');
  if (!imageOk(garment)) return fail('옷 사진을 찾지 못했어요.');

  if (!env.FAL_KEY) return json({ demo: true, image: person });

  const model = env.FAL_TRYON_MODEL || 'fal-ai/fashn/tryon/v1.6';
  const res = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Key ${env.FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_image: person,
      garment_image: garment,
      category,
      mode: 'balanced',
      garment_photo_type: 'auto',
      output_format: 'jpeg',
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.log('fal error', res.status, detail.slice(0, 500));
    if (res.status === 401 || res.status === 403) return fail('서버의 fal.ai 키가 올바르지 않아요.', 500);
    if (res.status === 422) return fail('이 사진으로는 입혀 볼 수 없어요. 전신이 잘 보이는 정면 사진이나 다른 옷으로 해 보세요.', 422);
    return fail('가상 피팅 서버가 잠시 불안정해요. 다시 시도해 주세요.', 502);
  }

  const data = await res.json();
  const image = data?.images?.[0]?.url;
  if (!image) return fail('피팅 결과를 받지 못했어요.', 502);
  return json({ image });
}
