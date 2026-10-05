# 옷방 — AI 코디 추천 + 가상 피팅

내 사진과 상황(예: "IT 회사 면접")을 알려 주면

1. **Claude**가 사진·상황을 보고 분위기가 다른 코디 3가지를 추천하고
2. **네이버쇼핑 검색**으로 아이템마다 실제 상품(사진·가격·구매 링크)을 찾아 주고
3. **fal.ai 가상 피팅**으로 고른 상품을 내 사진에 입혀 보여 줍니다. (하의 → 상의 순서로 겹쳐 입기, "코디 통째로 입혀 보기" 지원)

직접 찾아 둔 옷(쇼핑몰 캡처나 이미지 주소)을 최대 4개 올리면 어떤 게 나은지 평가도 받을 수 있어요.

## 구조

```
public/            화면 (index.html, app.js, style.css)
src/index.js       Cloudflare Worker 입구 (/api/* 를 아래 함수로 연결)
src/api/           서버 함수
  recommend.js     POST /api/recommend  코디 추천 (Claude)
  shop.js          GET  /api/shop       상품 검색 (네이버쇼핑)
  tryon.js         POST /api/tryon      가상 피팅 (fal.ai)
```

API 키는 서버(함수)에만 있고 브라우저로는 나가지 않습니다. 키가 없는 기능은 **데모 모드**(예시 추천, 쇼핑몰 검색 링크만, 피팅 없이 원래 사진)로 동작해서 키 없이도 화면을 확인할 수 있어요.

## 필요한 키

| 기능 | 환경 변수 | 받는 곳 | 비용 (대략) |
|---|---|---|---|
| 코디 추천 | `ANTHROPIC_API_KEY` | https://console.anthropic.com | 추천 1번에 수십 원 |
| 상품 검색 | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | https://developers.naver.com → 애플리케이션 등록 → "검색" API | 무료 (하루 25,000회) |
| 가상 피팅 | `FAL_KEY` | https://fal.ai/dashboard/keys | 1장에 수십~백 원대 |
| (선택) 입장 코드 | `ACCESS_CODE` | 직접 정함 | — |

`ACCESS_CODE`를 정해 두면 그 코드를 아는 사람만 유료 기능(추천·피팅)을 쓸 수 있어요. 사이트 주소가 퍼져서 요금이 많이 나오는 걸 막으려면 꼭 정해 두세요.

## 내 컴퓨터에서 실행

```bash
npm install
cp .dev.vars.example .dev.vars   # 키 채우기 (비워 두면 데모 모드)
npm run dev                       # http://localhost:8788
```

## 배포 (Cloudflare Workers)

1. Cloudflare 대시보드 → Workers & Pages → 만들기 → **Workers** → Git 저장소 가져오기 → 이 저장소 선택
2. 빌드 명령: 비워 둠 / 배포 명령: `npx wrangler deploy` (기본값 그대로)
3. 워커 → 설정 → **변수 및 비밀**에 위 키들을 **비밀(Secret)** 로 추가 → 다시 배포

`main` 브랜치에 올리면 자동으로 다시 배포됩니다.

## 참고

- 사진은 추천·피팅 요청에만 쓰고 저장하지 않습니다. (Anthropic, fal.ai 로 전송되어 처리됨)
- 가상 피팅 모델은 `FAL_TRYON_MODEL` 로 바꿀 수 있어요. 기본값은 `fal-ai/fashn/tryon/v1.6` 입니다.
- 가상 피팅은 상의·하의·원피스만 됩니다. 신발·가방은 상품 링크만 보여 줘요.
