# 옷방 — AI 코디 추천 + 가상 피팅

내 사진과 상황(예: "IT 회사 면접")을 알려 주면

1. **Claude**가 사진·상황을 보고 분위기가 다른 코디 3가지를 추천하고
2. **Claude 웹 검색**으로 무신사·29CM 등 쇼핑몰에서 아이템마다 실제 상품(사진·가격·구매 링크)을 찾아 주고
3. **fal.ai 가상 피팅**으로 고른 상품을 내 사진에 입혀 보여 줍니다. (하의 → 상의 순서로 겹쳐 입기, "코디 통째로 입혀 보기" 지원)

직접 찾아 둔 옷(쇼핑몰 캡처나 이미지 주소)을 최대 4개 올리면 어떤 게 나은지 평가도 받을 수 있어요.

## 구조

```
public/            화면 (index.html, app.js, style.css)
src/index.js       Cloudflare Worker 입구 (/api/* 를 아래 함수로 연결)
src/api/           서버 함수
  recommend.js     POST /api/recommend  코디 추천 (Claude)
  shop.js          GET  /api/shop       상품 검색 (Claude 웹 검색)
  tryon.js         POST /api/tryon      가상 피팅 (fal.ai)
```

API 키는 서버(함수)에만 있고 브라우저로는 나가지 않습니다. 키가 없는 기능은 **데모 모드**(예시 추천, 쇼핑몰 검색 링크만, 피팅 없이 원래 사진)로 동작해서 키 없이도 화면을 확인할 수 있어요.

## 필요한 키

| 기능 | 환경 변수 | 받는 곳 | 비용 (대략) |
|---|---|---|---|
| 코디 추천 + 상품 검색 | `ANTHROPIC_API_KEY` | https://console.anthropic.com | 추천 1번 + 상품 검색까지 수백 원 |
| 가상 피팅 | `FAL_KEY` | https://fal.ai/dashboard/keys | 1장에 수십~백 원대 |
| (선택) 입장 코드 | `ACCESS_CODE` | 직접 정함 | — |

`ACCESS_CODE`를 정해 두면 그 코드를 아는 사람만 유료 기능(추천·상품 검색·피팅)을 쓸 수 있어요. 사이트 주소가 퍼져서 요금이 많이 나오는 걸 막으려면 꼭 정해 두세요.

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

- 네이버 쇼핑 검색 API는 2026-07-31에 종료되어, 상품은 Claude 웹 검색으로 찾습니다. 링크는 검색 결과에 실제로 나온 쇼핑몰 주소만 쓰고(AI가 지어낸 주소는 버림), 사진은 상품 페이지에서 읽어 옵니다. 같은 검색어는 6시간 동안 저장해 두고 다시 씁니다.
- 가격은 검색 시점 기준이라 실제와 다를 수 있어요. 사진을 못 읽어 오는 쇼핑몰의 상품은 링크만 보여 줍니다.

- 사진은 추천·피팅 요청에만 쓰고 저장하지 않습니다. (Anthropic, fal.ai 로 전송되어 처리됨)
- 가상 피팅 모델은 `FAL_TRYON_MODEL` 로 바꿀 수 있어요. 기본값은 `fal-ai/fashn/tryon/v1.6` 입니다.
- 가상 피팅은 상의·하의·원피스만 됩니다. 신발·가방은 상품 링크만 보여 줘요.
