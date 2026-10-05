// POST /api/recommend
// 내 사진 + 상황(+ 내가 찾아 둔 옷 사진)을 Claude에게 보여 주고 코디 3가지를 추천받음
// 키(ANTHROPIC_API_KEY)가 없으면 예시 추천을 돌려줌 (데모 모드)

import Anthropic from '@anthropic-ai/sdk';
import { json, fail, checkAccess, readJson, parseDataUrl, describeApiError } from '../_lib.js';
import { DEMO_RECOMMENDATION } from '../_demo.js';

const CATEGORIES = ['outer', 'top', 'bottom', 'dress', 'shoes', 'bag', 'accessory'];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'dressCode', 'looks', 'candidates', 'avoid'],
  properties: {
    summary: { type: 'string', description: '사진과 상황을 보고 판단한 스타일 방향 2~3문장' },
    dressCode: { type: 'string', description: '이 상황의 복장 기준 한 줄 (예: 비즈니스 캐주얼)' },
    looks: {
      type: 'array',
      description: '서로 분위기가 다른 코디 3개, 가장 무난한 것부터',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'concept', 'why', 'items', 'tips'],
        properties: {
          name: { type: 'string', description: '짧은 코디 이름' },
          concept: { type: 'string', description: '한 줄 콘셉트' },
          why: { type: 'string', description: '이 사람과 이 상황에 왜 어울리는지 2~3문장' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['category', 'name', 'color', 'query'],
              properties: {
                category: { type: 'string', enum: CATEGORIES },
                name: { type: 'string', description: '아이템 이름 (예: 네이비 싱글 수트 재킷)' },
                color: { type: 'string' },
                query: { type: 'string', description: '쇼핑몰 상품 검색어. 성별·색·핏·소재를 넣은 3~6단어' },
              },
            },
          },
          tips: { type: 'array', items: { type: 'string' }, description: '핏·길이·소품 팁 2~3개' },
        },
      },
    },
    candidates: {
      type: 'array',
      description: '사용자가 올린 옷 후보 각각에 대한 평가. 후보가 없으면 빈 배열',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'verdict', 'comment'],
        properties: {
          index: { type: 'integer', description: '후보 번호 (1부터)' },
          verdict: { type: 'string', enum: ['추천', '보통', '비추천'] },
          comment: { type: 'string', description: '이유와 함께 입을 것 1~2문장' },
        },
      },
    },
    avoid: { type: 'array', items: { type: 'string' }, description: '이 상황에서 피할 것 2~4개' },
  },
};

const SYSTEM = `당신은 한국의 퍼스널 스타일리스트입니다. 사용자가 보낸 사진과 상황을 보고, 한국 쇼핑몰에서 실제로 살 수 있는 옷으로 코디를 추천합니다.

- 사진에서는 옷 고르기에 쓸 정보만 봅니다: 전체적인 분위기, 피부·머리색과 어울리는 색 계열, 어울리는 핏. 외모나 체형을 평가하거나 단점을 지적하지 않습니다.
- 면접이면 업계(IT·금융·공기업·승무원·디자인 등)에 맞는 격식 수준을 먼저 정하고, 지나치게 튀지 않으면서 단정하고 자신감 있어 보이는 쪽을 고릅니다.
- 코디 3개는 격식·분위기가 서로 다르게 짭니다. 각 코디는 상의(또는 원피스)와 하의를 꼭 포함하고, 필요하면 아우터·신발·가방을 더합니다.
- query 는 쇼핑몰(무신사·29CM 등)에서 상품을 찾을 검색어입니다. 브랜드명 대신 성별·색·핏·소재·아이템 종류를 넣어 실제 상품이 잘 나오게 씁니다.
- 예산이 주어지면 아이템 가격대가 예산 안에 들어오게 검색어를 고릅니다 (예: '가성비', '기본').
- 사용자가 직접 찾아 둔 옷 후보가 있으면 하나씩 솔직하게 평가하고, 좋은 후보는 코디에 반영합니다.
- 모든 글은 친근한 존댓말로, 짧고 구체적으로 씁니다.`;

export async function onRequestPost({ request, env }) {
  const denied = checkAccess(request, env);
  if (denied) return denied;

  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return fail(e.message || '요청을 읽지 못했어요.');
  }

  const photo = parseDataUrl(body.photo);
  const situation = String(body.situation || '').slice(0, 500).trim();
  if (!situation) return fail('어떤 상황에 입을 옷인지 적어 주세요.');

  if (!env.ANTHROPIC_API_KEY) return json({ ...DEMO_RECOMMENDATION, demo: true });

  const candidates = (Array.isArray(body.candidates) ? body.candidates : []).slice(0, 4);
  const content = [];
  if (photo) {
    content.push({ type: 'text', text: '[내 사진]' });
    content.push({ type: 'image', source: { type: 'base64', media_type: photo.mediaType, data: photo.data } });
  }
  candidates.forEach((c, i) => {
    const img = parseDataUrl(c.image);
    content.push({ type: 'text', text: `[옷 후보 ${i + 1}] ${String(c.note || '').slice(0, 100)}` });
    if (img) content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
    else if (/^https:\/\//.test(c.image || '')) content.push({ type: 'image', source: { type: 'url', url: c.image } });
  });

  const lines = [`상황: ${situation}`];
  if (body.gender) lines.push(`성별: ${String(body.gender).slice(0, 10)}`);
  if (body.budget) lines.push(`전체 예산: ${String(body.budget).slice(0, 30)}`);
  if (Array.isArray(body.styles) && body.styles.length) lines.push(`좋아하는 느낌: ${body.styles.slice(0, 6).join(', ')}`);
  if (!photo) lines.push('(사진 없음: 상황만 보고 추천해 주세요)');
  content.push({ type: 'text', text: lines.join('\n') });

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // 안전 필터가 거절하면 서버가 다른 모델로 알아서 다시 시도
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    });

    if (response.stop_reason === 'refusal') return fail('이 사진으로는 추천을 만들 수 없어요. 다른 사진으로 해 볼까요?', 422);
    if (response.stop_reason === 'max_tokens') return fail('추천이 너무 길어져서 끊겼어요. 다시 시도해 주세요.', 502);

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return json(JSON.parse(text));
  } catch (e) {
    if (e instanceof Anthropic.APIError) return fail(describeApiError(e, '추천'), 502);
    console.log('recommend error', e && e.stack);
    return fail('추천 결과를 읽지 못했어요. 다시 시도해 주세요.', 502);
  }
}
