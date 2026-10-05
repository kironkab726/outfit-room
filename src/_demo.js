// API 키가 없을 때 보여 줄 예시 추천 (면접 기준)

export const DEMO_RECOMMENDATION = {
  summary: '데모 모드라 사진을 분석하지 않은 예시 추천이에요. 면접에서는 단정한 핏과 차분한 색(네이비·차콜·화이트)이 가장 안전하고, 업계 분위기에 따라 격식 수준만 조절하면 됩니다.',
  dressCode: '비즈니스 포멀 ~ 비즈니스 캐주얼',
  looks: [
    {
      name: '정석 네이비 수트',
      concept: '어느 면접에서도 실패 없는 기본',
      why: '네이비는 신뢰감을 주면서 블랙보다 부드러워 보여요. 대기업·금융권·공기업처럼 격식을 따지는 곳에 잘 맞아요.',
      items: [
        { category: 'outer', name: '네이비 싱글 수트 재킷', color: '네이비', query: '네이비 싱글 정장 자켓' },
        { category: 'top', name: '화이트 셔츠', color: '화이트', query: '화이트 레귤러핏 셔츠 면접' },
        { category: 'bottom', name: '네이비 슬랙스', color: '네이비', query: '네이비 정장 슬랙스' },
        { category: 'shoes', name: '블랙 로퍼', color: '블랙', query: '블랙 가죽 로퍼' },
      ],
      tips: ['재킷 소매 밖으로 셔츠가 1cm 정도 보이게', '바지 길이는 신발 등에 살짝 닿는 정도', '양말·벨트는 신발 색과 맞추기'],
    },
    {
      name: '차콜 세미 정장',
      concept: '격식은 지키되 덜 딱딱하게',
      why: '차콜 재킷에 니트나 밴딩 없는 셔츠를 매치하면 정장보다 부드럽고 세련돼 보여요. 중견기업·외국계에 잘 맞아요.',
      items: [
        { category: 'outer', name: '차콜 울 블레이저', color: '차콜', query: '차콜 울 블레이저' },
        { category: 'top', name: '라이트 블루 셔츠', color: '라이트 블루', query: '연하늘 옥스포드 셔츠' },
        { category: 'bottom', name: '그레이 슬랙스', color: '그레이', query: '그레이 와이드 슬랙스' },
        { category: 'shoes', name: '브라운 로퍼', color: '브라운', query: '브라운 페니 로퍼' },
      ],
      tips: ['상하의 톤을 한 단계씩 다르게', '넥타이 없이 단추는 하나만 풀기'],
    },
    {
      name: '깔끔한 비즈니스 캐주얼',
      concept: 'IT·스타트업 면접용',
      why: '자유로운 회사에서는 정장이 오히려 어색할 수 있어요. 니트와 슬랙스로 단정함만 챙기면 충분해요.',
      items: [
        { category: 'top', name: '네이비 라운드 니트', color: '네이비', query: '네이비 라운드넥 니트' },
        { category: 'bottom', name: '베이지 슬랙스', color: '베이지', query: '베이지 테이퍼드 슬랙스' },
        { category: 'shoes', name: '화이트 가죽 스니커즈', color: '화이트', query: '화이트 가죽 스니커즈' },
      ],
      tips: ['니트는 보풀 없는 새것으로', '운동화는 로고가 작은 가죽 소재로'],
    },
  ],
  candidates: [],
  avoid: ['큰 로고·화려한 패턴', '구김 많은 린넨', '너무 짧거나 붙는 옷', '향이 강한 향수'],
};
