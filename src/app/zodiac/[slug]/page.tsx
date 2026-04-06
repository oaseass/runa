import { notFound } from "next/navigation";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { ZodiacArc } from "@/app/zodiac/_components/ZodiacArc";

// ─── Punchy trait lines per sign (Co-Star style) ─────────────────────────────

const SIGN_TRAITS: Record<string, string[]> = {
  aries:       ["필터 없음", "화는 내는데 이유는 잊어버림", "모든 걸 경쟁으로 봄", "도발하면 뒤돌아보지 않음", "시작은 잘 함. 마무리는 덜 함."],
  taurus:      ["굽힐 수 없는 고집", "감정을 음식으로 삼킴", "원한은 몇 년씩 품고 있음", "안락함 없이는 작동 불리", "절대 서두르지 않음"],
  gemini:      ["파티에서 모두에게 말 걸음", "오늘만 세 번 마음 바꿈", "모든 것에 대해 조금씩 앎", "엔딩 크레딧 뜨기 전에 지루해짐", "말하는 것보다 더 많은 비밀을 품고 있음"],
  cancer:      ["모든 걸 개인적으로 받아들임", "차 안에서 혼자 울음", "사람이 준 감정은 절대 잊지 않음", "슬플 때 먹을 걸 가져다 줌", "무엇보다 안전이 먼저 필요함"],
  leo:         ["자기 소유지인 것처럼 들어옴", "주목받아야 함", "사랑하는 사람에게는 놀라울 정도로 관대함", "무시당하는 걸 견디지 못함", "혼자 있을 때도 연기함"],
  virgo:       ["부탁도 안 했는데 고쳐줌", "모든 단어를 과도하게 고민함", "불안하면 청소함", "괜찮다고 하지만 뜻은 다름", "자신에게 가장 혹독한 비평가"],
  libra:       ["식당을 못 고름", "싫은데 좋다고 함", "가능성을 보고 사랑에 빠짐", "갈등을 어떻게든 피함", "예쁜 것들을 너무 많이 소유함"],
  scorpio:     ["말하는 것보다 더 많이 앎", "절대 완전히 잊지 않음", "집착에 가까울 만큼 충성스러움", "사람을 속이 다 보이는 책처럼 읽음", "매번 고통을 통해 변혁함"],
  sagittarius: ["너무 진지해지기 전에 떠남", "최악의 타이밍에 잔인하게 솔직함", "항상 다른 어딘가에 있어야 할 것 같음", "루틴이 생기면 즉시 지루해짐", "무모할 정도로 낙관적"],
  capricorn:   ["남들이 자는 동안 일함", "이미 5년 계획이 있음", "쉽게 도움을 구하지 않음", "생산성 뒤에 감정을 숨김", "나타나는 사람이면 누구든 존중함"],
  aquarius:    ["남들과 같아지길 거부함", "인류는 신경 쓰지만 개별 인간에게는 조금 덜", "어느 자리에서든 시대를 앞서 있음", "감정이 커지면 분리함", "믿지도 않는 주장을 끝까지 논쟁함"],
  pisces:      ["다른 사람의 에너지를 흡수함", "반쯤 꿈속에서 살아감", "너무 쉽게, 너무 자주 용서함", "모든 것을 깊이 느낌", "고통에서 아름다움을 만들어냄"],
};

// ─── Constellation image per sign ────────────────────────────────────────────
const SIGN_IMG: Record<string, string> = {
  aries:       "/luna/assets/costar/constellations/aries.svg",
  taurus:      "/luna/assets/costar/constellations/taurus.svg",
  gemini:      "/luna/assets/costar/constellations/gemini.svg",
  cancer:      "/luna/assets/costar/constellations/cancer.svg",
  leo:         "/luna/assets/costar/constellations/leo.svg",
  virgo:       "/luna/assets/costar/constellations/virgo.svg",
  libra:       "/luna/assets/costar/constellations/libra.svg",
  scorpio:     "/luna/assets/costar/constellations/scorpius.svg",
  sagittarius: "/luna/assets/costar/constellations/sagittarius.svg",
  capricorn:   "/luna/assets/costar/constellations/capricornus.svg",
  aquarius:    "/luna/assets/costar/constellations/aquarius.svg",
  pisces:      "/luna/assets/costar/constellations/pisces.svg",
};

const SIGN_DATA: Record<string, {
  glyph: string; name: string; nameEn: string; dateRange: string;
  element: string; modality: string; ruler: string; keywords: string[];
  headline: string; body: string; love: string; work: string; selfKnow: string;
}> = {
  aries: { glyph:"♈", name:"양자리", nameEn:"ARIES", dateRange:"3월 21일 — 4월 19일", element:"불", modality:"활동", ruler:"화성", keywords:["시작","용기","충동","선구"], headline:"당신은 먼저 움직이는 사람입니다.", body:"양자리는 황도의 첫 번째 별자리로, 어떤 상황에서든 가장 먼저 뛰어드는 에너지를 가집니다. 화성이 지배하는 이 별자리는 본능적인 행동력과 선구자 기질로 가득 차 있습니다.", love:"연애에서 양자리는 직접적입니다. 관심이 생기면 바로 표현하고, 식으면 솔직하게 인정합니다.", work:"일에서 양자리는 아이디어와 추진력의 원천입니다. 프로젝트를 시작하는 능력은 탁월합니다.", selfKnow:"당신의 에너지는 불꽃처럼 타오릅니다. 행동 전에 한 번 더 확인하는 습관이 삶을 바꿔놓을 것입니다." },
  taurus: { glyph:"♉", name:"황소자리", nameEn:"TAURUS", dateRange:"4월 20일 — 5월 20일", element:"흙", modality:"고정", ruler:"금성", keywords:["안정","감각","인내","소유"], headline:"당신은 뿌리를 내리는 사람입니다.", body:"황소자리는 감각적 세계를 가장 충실하게 누리는 별자리입니다. 금성이 지배하며, 아름다움·음식·질감처럼 오감을 자극하는 모든 것에 끌립니다.", love:"관계에서 황소자리는 헌신적이고 신뢰할 수 있습니다. 한번 마음을 열면 오래 지속됩니다.", work:"황소자리는 끈기와 실용성의 화신입니다. 느리지만 확실하게 결과를 쌓아가며, 재정 감각이 뛰어납니다.", selfKnow:"당신의 강점은 흔들리지 않는 중심에 있습니다. 컴포트 존이 성장을 막을 때 그 경계를 넓히는 용기가 필요합니다." },
  gemini: { glyph:"♊", name:"쌍둥이자리", nameEn:"GEMINI", dateRange:"5월 21일 — 6월 20일", element:"공기", modality:"변통", ruler:"수성", keywords:["소통","호기심","다재다능","변화"], headline:"당신은 두 개의 세계를 동시에 삽니다.", body:"쌍둥이자리는 황도에서 가장 빠르게 생각하고, 가장 많이 말하며, 가장 다양한 관심사를 가집니다. 언어와 정보가 주된 도구입니다.", love:"연애에서 쌍둥이자리는 지적 자극을 먹고 삽니다. 대화가 없는 관계는 지루해집니다.", work:"아이디어 생성과 네트워킹에서 타의 추종을 불허합니다. 한 가지를 끝까지 파고드는 집중력을 키워야 합니다.", selfKnow:"당신의 마음은 무선 안테나 같습니다. 진짜 원하는 것에 주파수를 맞추는 시간을 갖세요." },
  cancer: { glyph:"♋", name:"게자리", nameEn:"CANCER", dateRange:"6월 21일 — 7월 22일", element:"물", modality:"활동", ruler:"달", keywords:["돌봄","직관","감정","기억"], headline:"당신은 기억으로 집을 짓습니다.", body:"게자리는 달이 지배하는 감정의 별자리입니다. 강한 겉모습 뒤에는 깊은 감수성이 숨어 있으며, 소중한 것을 지키려는 본능이 모든 행동의 뿌리에 있습니다.", love:"게자리는 깊은 유대감을 원합니다. 감정적 안전이 전제될 때 가장 헌신적인 파트너가 됩니다.", work:"공감 능력이 리더십 자산이 됩니다. 팀 분위기를 읽고 사람들이 편한 환경을 만드는 데 탁월합니다.", selfKnow:"당신의 직관은 거의 언제나 맞습니다. 논리로 설명하지 못할 때도 그것을 신뢰하는 법을 연습하세요." },
  leo: { glyph:"♌", name:"사자자리", nameEn:"LEO", dateRange:"7월 23일 — 8월 22일", element:"불", modality:"고정", ruler:"태양", keywords:["창조","리더십","자아표현","자부심"], headline:"당신은 스테이지가 필요한 사람입니다.", body:"사자자리는 태양이 지배하며, 모든 별자리 중 자기 자신에 대한 의식이 가장 선명합니다. 진정성 있게 빛날 때 주변 사람 모두가 따뜻해집니다.", love:"사자자리는 로맨스를 큰 제스처로 표현합니다. 자신의 헌신을 알아봐 줄 때 가장 행복합니다.", work:"창의적인 분야에서 두각을 나타내며, 인정받을 때 잠재력이 폭발합니다.", selfKnow:"자존감과 자아도취 사이의 경계를 이해하는 것이 당신의 숙제입니다." },
  virgo: { glyph:"♍", name:"처녀자리", nameEn:"VIRGO", dateRange:"8월 23일 — 9월 22일", element:"흙", modality:"변통", ruler:"수성", keywords:["분석","완벽","봉사","세밀함"], headline:"당신은 패턴을 보는 사람입니다.", body:"처녀자리는 디테일에서 진실을 찾습니다. 불완전한 것을 완전하게 만들려는 충동이 이 별자리를 가장 유능한 실행자로 만듭니다.", love:"처녀자리의 사랑은 작은 행동에 담겨 있습니다. 일상적인 돌봄과 배려로 깊은 애정을 표현합니다.", work:"체계화와 문제 해결 능력이 탁월합니다. 완벽주의가 진행을 막을 때를 경계해야 합니다.", selfKnow:"당신은 자신에게 가장 가혹한 비평가입니다. 다른 사람에게 베푸는 친절을 자신에게도 적용하세요." },
  libra: { glyph:"♎", name:"천칭자리", nameEn:"LIBRA", dateRange:"9월 23일 — 10월 22일", element:"공기", modality:"활동", ruler:"금성", keywords:["균형","공정","관계","미학"], headline:"당신은 균형을 찾는 사람입니다.", body:"천칭자리는 황도의 정중앙에 위치하며, 대립하는 두 힘 사이에서 균형을 찾는 것이 삶의 테마입니다. 결정을 내리기 어렵다는 것은 모든 관점을 진지하게 고려한다는 증거입니다.", love:"파트너십이 천칭자리의 중심 주제입니다. 관계를 위해 자신을 잃지 않도록 경계가 필요합니다.", work:"협상과 중재 능력이 뛰어납니다. 모두가 납득할 수 있는 해결책을 찾는 데 탁월합니다.", selfKnow:"때로는 완벽한 선택보다 충분히 좋은 선택이 더 가치 있다는 것을 기억하세요." },
  scorpio: { glyph:"♏", name:"전갈자리", nameEn:"SCORPIO", dateRange:"10월 23일 — 11월 21일", element:"물", modality:"고정", ruler:"명왕성", keywords:["변환","깊이","직관","비밀"], headline:"당신은 표면 아래를 봅니다.", body:"전갈자리는 황도에서 가장 강렬하고 변환적인 에너지를 가집니다. 두려움 없이 어둠 속으로 들어가 진실을 끌어내는 능력이 있습니다.", love:"전갈자리는 영혼까지 닿는 깊은 합일을 원합니다. 신뢰가 형성되면 놀라울 정도로 헌신적이지만, 배신은 절대 잊지 않습니다.", work:"조사·연구·심리 분야에서 빛납니다. 남들이 보지 못하는 패턴을 발견합니다.", selfKnow:"당신의 감정은 대양처럼 깊습니다. 그 깊이를 변환의 도구로 삼을 때 가장 강력해집니다." },
  sagittarius: { glyph:"♐", name:"사수자리", nameEn:"SAGITTARIUS", dateRange:"11월 22일 — 12월 21일", element:"불", modality:"변통", ruler:"목성", keywords:["탐험","자유","철학","낙관"], headline:"당신은 지평선을 향해 달립니다.", body:"사수자리는 목성이 지배하며, 확장·성장·의미를 쉼 없이 추구합니다. 어디에도 묶이지 않는 자유로움이 삶의 산소입니다.", love:"연애에서 사수자리는 동반자보다 탐험 파트너를 원합니다. 함께 성장할 수 있는 관계를 추구합니다.", work:"큰 그림을 그리고 비전을 제시하는 데 탁월합니다. 방향과 의미를 다루는 역할에서 활기를 찾습니다.", selfKnow:"멀리 보는 눈을 한 곳에 집중할 때, 당신의 화살은 가장 멀리 날아갑니다." },
  capricorn: { glyph:"♑", name:"염소자리", nameEn:"CAPRICORN", dateRange:"12월 22일 — 1월 19일", element:"흙", modality:"활동", ruler:"토성", keywords:["목표","규율","책임","인내"], headline:"당신은 산을 오르는 사람입니다.", body:"염소자리는 토성이 지배하며, 황도에서 가장 야망 있고 구조적인 별자리입니다. 체계적으로 목표를 쌓아가는 과정에서 자신의 가치를 증명합니다.", love:"관계에서 신중하고 진지합니다. 일단 헌신하면 끝까지 책임집니다.", work:"커리어가 삶의 중심 축일 때가 많습니다. 장기 목표를 설정하고 결국 정상에 이르는 능력이 있습니다.", selfKnow:"지금 여기의 삶을 즐기는 것도 목표임을 기억하세요. 오르는 과정도 당신의 삶입니다." },
  aquarius: { glyph:"♒", name:"물병자리", nameEn:"AQUARIUS", dateRange:"1월 20일 — 2월 18일", element:"공기", modality:"고정", ruler:"천왕성", keywords:["혁신","인도주의","독립","미래"], headline:"당신은 시대를 앞서 태어났습니다.", body:"물병자리는 천왕성이 지배하며, 관습에 얽매이지 않는 혁신 에너지를 가집니다. 미래를 바라보는 눈이 현재를 혁신합니다.", love:"관계에서 지적 연결을 최우선시하며, 개인의 자유를 보장하는 파트너십을 원합니다.", work:"기존 방식을 의심하고 새로운 관점을 제시하는 역할에서 빛납니다.", selfKnow:"당신의 독창성이 고립으로 이어질 때를 알아채야 합니다. 혁신은 연결 속에서 더 강해집니다." },
  pisces: { glyph:"♓", name:"물고기자리", nameEn:"PISCES", dateRange:"2월 19일 — 3월 20일", element:"물", modality:"변통", ruler:"해왕성", keywords:["공감","영성","직관","용해"], headline:"당신은 경계가 녹는 사람입니다.", body:"물고기자리는 황도의 마지막 별자리로, 모든 별자리의 경험이 녹아 있습니다. 현실과 꿈 사이를 자유롭게 오가며, 타인의 감정을 자신의 것처럼 느끼는 공감 능력이 있습니다.", love:"이상적인 사랑을 꿈꾸며, 눈에 보이는 그대로의 상대를 사랑하는 연습이 관계를 더 깊게 만듭니다.", work:"예술·음악·치유·영성 분야에서 탁월한 재능을 발휘합니다.", selfKnow:"자신을 잃지 않아야 다른 사람에게 더 많이 줄 수 있습니다. 경계 설정은 필수 기술입니다." },
};

const SIGN_ORDER = ["aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces"];

// ─── Extended data: reputation, friends, archetype, Q&A, quote ────────────────

const SIGN_EXTRA: Record<string, {
  archetype: string;
  reputation: string;
  friends: string;
  qa: { q: string; a: string }[];
  quote: string;
}> = {
  aries: {
    archetype: "선구자",
    reputation: "용감하고 충동적인 리더. 처음엔 강렬해 보이지만, 그 뒤에는 진심이 있다.",
    friends: "사자자리, 사수자리와 같은 불꽃 에너지를 공유합니다. 쌍둥이자리와도 의외의 호흡이 맞습니다.",
    qa: [
      { q: "왜 항상 먼저 시작하려 하나요?", a: "기다리는 것은 기회를 놓치는 일입니다. 당신의 에너지는 시작점에서 가장 강하게 타오릅니다." },
      { q: "화가 빨리 나는 이유가 있나요?", a: "화성의 직접적인 에너지가 감정도 즉각적으로 만듭니다. 다만 식는 것도 그만큼 빠릅니다." },
      { q: "인내심을 기르려면?", a: "결승선이 아닌 과정 자체를 의미로 삼는 연습이 필요합니다. 속도만큼 방향도 중요합니다." },
    ],
    quote: "\"나는 주저함이 없습니다. 그것이 나의 가장 큰 힘이자 가장 큰 함정입니다.\"",
  },
  taurus: {
    archetype: "감각가",
    reputation: "믿음직스럽고 고집스러운 안전지대. 한번 신뢰를 얻으면 영원한 동반자.",
    friends: "처녀자리, 염소자리와 흙의 실용성을 나눕니다. 게자리와는 깊은 안정감을 공유합니다.",
    qa: [
      { q: "변화를 그렇게 싫어하는 이유가 있나요?", a: "안정은 내가 최선을 발휘할 수 있는 조건입니다. 변화가 필요할 때도, 나만의 속도가 있습니다." },
      { q: "소유욕이 강한 게 문제인가요?", a: "소중한 것을 지키려는 본능입니다. 사람을 소유하려는 욕망과 구별하는 것이 관건입니다." },
      { q: "게으름을 극복하려면?", a: "게으름이 아니라 에너지를 비축하는 것입니다. 움직여야 할 때를 아는 것이 황소자리의 지혜입니다." },
    ],
    quote: "\"아름다운 것을 천천히 즐기는 것, 그것이 내가 아는 가장 현명한 삶의 방식입니다.\"",
  },
  gemini: {
    archetype: "이야기꾼",
    reputation: "재치 있고 예측 불가능한 대화 상대. 두 얼굴이 아닌, 두 층위를 동시에 가진 존재.",
    friends: "천칭자리, 물병자리와 공기 원소의 지적 대화를 즐깁니다. 양자리의 즉흥성과도 잘 맞습니다.",
    qa: [
      { q: "마음이 자주 바뀌는 게 단점인가요?", a: "한 번에 여러 관점을 보기 때문입니다. 결정이 필요할 때 의도적으로 한 목소리에 귀 기울이세요." },
      { q: "왜 그렇게 많은 것에 관심이 있나요?", a: "세상은 궁금한 것으로 가득 차 있습니다. 깊이는 선택적으로, 넓이는 본능적으로 추구합니다." },
      { q: "외로움을 느끼는 순간이 있나요?", a: "모두와 연결되어 있지만, 자신의 진짜 내면과는 단절될 때입니다. 조용한 시간이 필요합니다." },
    ],
    quote: "\"나는 한 가지 생각에 머물 수 없습니다. 그것이 나의 저주이자, 내가 가진 가장 큰 선물입니다.\"",
  },
  cancer: {
    archetype: "보호자",
    reputation: "따뜻하고 조금 신경질적인 보호자. 신뢰를 얻기까지 시간이 걸리지만, 한번 열면 깊습니다.",
    friends: "전갈자리, 물고기자리와 물 원소의 감정적 깊이를 나눕니다. 황소자리와는 안정과 돌봄을 교환합니다.",
    qa: [
      { q: "왜 그렇게 과거에 집착하나요?", a: "과거는 내가 누구인지를 알려주는 증거입니다. 다만 거기에 갇히지 않는 것이 숙제입니다." },
      { q: "기분 변화가 왜 그렇게 심한가요?", a: "달처럼 에너지가 차고 기웁니다. 감정을 억누르지 말고, 그 흐름을 이해하는 것이 먼저입니다." },
      { q: "타인 돌봄을 멈추기 어려운 이유는?", a: "돌봄은 나의 정체성입니다. 하지만 자신을 먼저 채워야 다른 사람도 돌볼 수 있습니다." },
    ],
    quote: "\"나는 집을 만드는 사람입니다. 벽돌이 아닌 기억으로, 시멘트가 아닌 사랑으로.\"",
  },
  leo: {
    archetype: "창조가",
    reputation: "존재감이 넘치는 왕. 하지만 사랑하는 이에게는 온 태양을 줍니다.",
    friends: "양자리, 사수자리와 불 원소의 활력을 나눕니다. 천칭자리와는 매력과 매력의 균형이 맞습니다.",
    qa: [
      { q: "주목받고 싶은 욕구가 지나친 건 아닌가요?", a: "빛이 존재하려면 보여야 합니다. 다만 그 빛이 주변을 밝히기 위한 것인지 확인하세요." },
      { q: "비판을 받아들이기 힘든 이유는?", a: "자아가 창작물과 연결되어 있기 때문입니다. 비판이 나를 향한 것이 아님을 분리하는 연습이 필요합니다." },
      { q: "리더가 될 준비가 되어 있나요?", a: "태어났을 때부터입니다. 다만 진정한 리더는 자신보다 팀을 먼저 빛나게 합니다." },
    ],
    quote: "\"나는 빛을 두려워하지 않습니다. 그것이 나입니다.\"",
  },
  virgo: {
    archetype: "장인",
    reputation: "날카롭고 분석적인 완벽주의자. 까다로워 보이지만, 그 기준은 자신에게 가장 엄격하게 들어맞습니다.",
    friends: "황소자리, 염소자리와 흙 원소의 실용성을 나눕니다. 전갈자리와는 깊은 분석적 대화를 나눕니다.",
    qa: [
      { q: "왜 그렇게 모든 걸 고치려 하나요?", a: "세상이 더 잘 작동할 수 있다고 믿기 때문입니다. 고치지 않아도 되는 것을 구별하는 것이 관건입니다." },
      { q: "비판이 상처를 주는 것을 압니까?", a: "압니다. 하지만 침묵보다는 진실이 장기적으로 도움이 된다고 믿습니다. 타이밍과 방식을 배우는 중입니다." },
      { q: "완벽하지 않아도 괜찮을 수 있을까요?", a: "진행 중인 것도 완성입니다. 그 진실을 머리가 아닌 몸으로 받아들이는 데 시간이 필요합니다." },
    ],
    quote: "\"완벽함은 목적지가 아닙니다. 하지만 그것을 추구하는 과정이 나를 만들었습니다.\"",
  },
  libra: {
    archetype: "중재자",
    reputation: "우아하고 사교적인 조화의 달인. 갈등을 피하려다 자신의 진짜 의견을 삼키기도 합니다.",
    friends: "쌍둥이자리, 물병자리와 공기 원소의 지적 교류를 즐깁니다. 사자자리와는 미학적 공감대가 깊습니다.",
    qa: [
      { q: "결정을 그렇게 오래 미루는 이유가 뭔가요?", a: "모든 가능성이 보이기 때문입니다. 하나를 택하면 다른 것을 잃는다는 두려움과 함께 살고 있습니다." },
      { q: "갈등을 왜 그렇게 피하나요?", a: "불협화음이 물리적으로 불편합니다. 다만 회피가 장기적으로 더 큰 불균형을 만든다는 것도 알고 있습니다." },
      { q: "자신의 입장을 명확히 말할 수 있나요?", a: "있습니다. 준비가 되었을 때, 그 말은 신중하고 공정합니다. 그게 나의 방식입니다." },
    ],
    quote: "\"나는 결정하기 어려운 게 아닙니다. 모든 것이 다 중요하게 보이는 것입니다.\"",
  },
  scorpio: {
    archetype: "연금술사",
    reputation: "신비롭고 강렬한 변환자. 속을 알 수 없지만, 그 안에는 치열한 내면세계가 있습니다.",
    friends: "게자리, 물고기자리와 물의 깊이를 나눕니다. 처녀자리와는 날카로운 통찰을 교환합니다.",
    qa: [
      { q: "왜 복수심을 오래 유지하나요?", a: "신뢰는 내가 주는 가장 귀한 것입니다. 그것이 부서졌을 때의 반응은 그 무게에 비례합니다." },
      { q: "비밀을 그렇게 많이 지키는 이유는?", a: "정보는 권력이고, 취약함은 위협이 됩니다. 신뢰할 수 있는 사람에게는 모든 것을 줍니다." },
      { q: "변화를 두려워하지 않나요?", a: "변화는 나의 본질입니다. 전갈은 허물을 벗습니다. 그 과정은 고통스럽지만, 그만큼 강해집니다." },
    ],
    quote: "\"나는 어둠이 두렵지 않습니다. 어둠 속에서 가장 선명하게 보이기 때문입니다.\"",
  },
  sagittarius: {
    archetype: "탐험가",
    reputation: "자유롭고 솔직한 방랑자. 발언이 직선적이어서 상처를 주기도 하지만, 악의는 없습니다.",
    friends: "양자리, 사자자리와 불의 모험 에너지를 나눕니다. 물병자리와는 철학적 대화가 깊습니다.",
    qa: [
      { q: "왜 한 곳에 정착하지 못하나요?", a: "세상은 한 곳에 담을 수 없습니다. 뿌리를 내리는 것과 날아오르는 것, 둘 다 선택할 수 있습니다." },
      { q: "솔직함이 때로 잔인하지 않나요?", a: "거짓말보다 진실이 더 친절하다고 믿습니다. 다만 타이밍과 말투를 배우는 것이 목성의 지혜입니다." },
      { q: "두려움을 느끼는 게 있나요?", a: "갇히는 것. 의미를 잃는 것. 그리고 더 이상 성장하지 못하는 상태." },
    ],
    quote: "\"나는 목적지보다 방향을 믿습니다. 화살은 쏘는 순간 이미 자유입니다.\"",
  },
  capricorn: {
    archetype: "건축가",
    reputation: "냉철하고 야망 있는 전략가. 감정을 숨기지만, 신뢰하는 이에게는 깊은 헌신을 보입니다.",
    friends: "황소자리, 처녀자리와 흙의 실용성을 나눕니다. 전갈자리와는 깊은 전략적 파트너십을 형성합니다.",
    qa: [
      { q: "왜 그렇게 일에 집중하나요?", a: "성취는 내가 세상에 남기는 흔적입니다. 하지만 관계와 현재도 그만큼 가치 있다는 것을 배우고 있습니다." },
      { q: "감정을 잘 드러내지 않는 이유는?", a: "취약함이 약점이 된다고 배웠습니다. 하지만 진정한 강함은 감정을 드러낼 수 있는 용기에 있습니다." },
      { q: "실패를 어떻게 다루나요?", a: "분석하고, 교훈을 뽑고, 다시 시작합니다. 실패는 경로 조정이지, 종착점이 아닙니다." },
    ],
    quote: "\"나는 정상을 봅니다. 그리고 지금 이 발걸음이 그 정상의 일부임을 압니다.\"",
  },
  aquarius: {
    archetype: "혁명가",
    reputation: "독창적이고 초연한 이상주의자. 집단을 위해 싸우지만, 개인으로서는 거리두기를 선호합니다.",
    friends: "쌍둥이자리, 천칭자리와 공기 원소의 지성을 나눕니다. 사수자리와는 미래 비전을 공유합니다.",
    qa: [
      { q: "왜 그렇게 감정적으로 거리를 두나요?", a: "감정에 압도되면 더 큰 그림을 볼 수 없습니다. 하지만 그것이 차갑게 보일 수 있다는 것도 압니다." },
      { q: "집단을 위해 일하면서 왜 혼자를 선호하나요?", a: "인류를 사랑하지만, 개별 인간에게는 에너지 소모가 큽니다. 그것이 모순처럼 보이지만 진실입니다." },
      { q: "규칙을 따르는 게 왜 그렇게 힘든가요?", a: "모든 규칙에는 목적이 있습니다. 목적이 사라진 규칙은 깨져야 합니다. 그것이 진화입니다." },
    ],
    quote: "\"나는 지금 이 시대가 아직 이해하지 못하는 것들을 봅니다. 그것이 나의 고독이자 사명입니다.\"",
  },
  pisces: {
    archetype: "몽상가",
    reputation: "몽상적이고 섬세한 공감자. 모든 것을 흡수하기 때문에 자기만의 공간이 필수입니다.",
    friends: "게자리, 전갈자리와 물의 직관적 언어를 나눕니다. 황소자리와는 감각적 안정을 공유합니다.",
    qa: [
      { q: "현실과 꿈의 경계가 흐릿하지 않나요?", a: "흐릿합니다. 그것이 나를 예술가이자 예언자로 만들지만, 현실에서 길을 잃게 만들기도 합니다." },
      { q: "왜 그렇게 쉽게 감정에 빠지나요?", a: "경계가 없기 때문입니다. 타인의 기쁨이 나의 기쁨이고, 타인의 고통이 나의 고통입니다." },
      { q: "현실 도피를 어떻게 극복하나요?", a: "도피가 아니라 회복입니다. 꿈의 세계가 충전이 되면, 현실에서 더 강하게 존재할 수 있습니다." },
    ],
    quote: "\"나는 두 세계 사이에서 삽니다. 그 경계를 걷는 것이 내가 아는 가장 진실한 삶입니다.\"",
  },
};

export async function generateStaticParams() {
  return SIGN_ORDER.map((slug) => ({ slug }));
}

export default async function ZodiacPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sign = SIGN_DATA[slug];
  if (!sign) notFound();

  const extra = SIGN_EXTRA[slug];
  const currentIdx = SIGN_ORDER.indexOf(slug);
  const prevSlug = SIGN_ORDER[(currentIdx + 11) % 12];
  const nextSlug = SIGN_ORDER[(currentIdx + 1) % 12];
  const traits = SIGN_TRAITS[slug] ?? [];
  const editorialImg = SIGN_IMG[slug];

  return (
    <div className="zdv-root">

      {/* ── Arc navigator ── */}
      <ZodiacArc currentSlug={slug} />

      <main className="zdv-content">

        {/* SECTION 1 — Hero */}
        <section className="zdv-section zdv-hero">
          <h1 className="zdv-sign-name-en">{sign.nameEn}</h1>
          <p className="zdv-sign-name-ko">{sign.name}</p>
          <p className="zdv-date-range">{sign.dateRange}</p>
        </section>

        {/* SECTION 2 — Rules */}
        <section className="zdv-section zdv-rules">
          <p className="zdv-section-label">기본 성질</p>
          <div className="zdv-rules-grid">
            <div className="zdv-rule-item">
              <span className="zdv-rule-key">원소</span>
              <span className="zdv-rule-val">{sign.element}</span>
            </div>
            <div className="zdv-rule-item">
              <span className="zdv-rule-key">양식</span>
              <span className="zdv-rule-val">{sign.modality}</span>
            </div>
            <div className="zdv-rule-item">
              <span className="zdv-rule-key">지배 행성</span>
              <span className="zdv-rule-val">{sign.ruler}</span>
            </div>
            <div className="zdv-rule-item">
              <span className="zdv-rule-key">원형</span>
              <span className="zdv-rule-val">{extra.archetype}</span>
            </div>
          </div>
          <div className="zdv-keywords">
            {sign.keywords.map((k) => (
              <span key={k} className="zdv-keyword">{k}</span>
            ))}
          </div>
        </section>

        {/* SECTION 3 — Trait lines */}
        <section className="zdv-section zdv-traits-section">
          {traits.map((trait, i) => (
            <p key={i} className="zdv-trait-line">{trait}</p>
          ))}
        </section>

        {/* SECTION 4 — Intro essay + Love + Work */}
        <section className="zdv-section zdv-essay">
          <blockquote className="zdv-headline">{sign.headline}</blockquote>
          <p className="zdv-body-text zdv-body-text--lead">{sign.body}</p>
          {editorialImg && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={editorialImg} alt="" className="zdv-editorial-img" />
          )}
          <div className="zdv-divider" />
          <p className="zdv-section-label">연애</p>
          <p className="zdv-body-text">{sign.love}</p>
          <div className="zdv-divider" />
          <p className="zdv-section-label">일</p>
          <p className="zdv-body-text">{sign.work}</p>
        </section>

        {/* SECTION 5 — Q&A */}
        <section className="zdv-section zdv-qa-section">
          <p className="zdv-section-label">Q &amp; A</p>
          {extra.qa.map((item, i) => (
            <div key={i} className="zdv-qa-item">
              <p className="zdv-qa-q">{item.q}</p>
              <p className="zdv-qa-a">{item.a}</p>
            </div>
          ))}
        </section>

        {/* SECTION 6 — Know Yourself (dark) */}
        <section className="zdv-section zdv-dark-section">
          <p className="zdv-section-label zdv-section-label--light">나를 이해하기</p>
          <p className="zdv-dark-body">{sign.selfKnow}</p>
        </section>

        {/* SECTION 7 — Archetype quote */}
        <section className="zdv-section zdv-archetype-section">
          <p className="zdv-section-label">원형</p>
          <p className="zdv-archetype-label">{extra.archetype}</p>
          <p className="zdv-archetype-quote">{extra.quote}</p>
        </section>

        {/* ── Sign navigation ── */}
        <nav className="zdv-sign-nav" aria-label="별자리 이동">
          <Link href={`/zodiac/${prevSlug}`} className="zdv-sign-nav-link">
            <span className="zdv-sign-nav-glyph">{SIGN_DATA[prevSlug].glyph}</span>
            <span className="zdv-sign-nav-name">{SIGN_DATA[prevSlug].name}</span>
            <span className="zdv-sign-nav-dir">← 이전</span>
          </Link>
          <Link href={`/zodiac/${nextSlug}`} className="zdv-sign-nav-link zdv-sign-nav-link--right">
            <span className="zdv-sign-nav-dir">다음 →</span>
            <span className="zdv-sign-nav-name">{SIGN_DATA[nextSlug].name}</span>
            <span className="zdv-sign-nav-glyph">{SIGN_DATA[nextSlug].glyph}</span>
          </Link>
        </nav>

        <div style={{ height: "5.5rem" }} />
      </main>

      <BottomNav />
    </div>
  );
}