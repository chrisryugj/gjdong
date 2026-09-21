import type { SnowMapData } from "@/lib/snow/types"
import { buildChecklist, type Finding, fmt, gapSummary, planHeatBudget, priorityText, segName, segPriority, totals } from "@/lib/snow/facts"
import { eok } from "@/lib/snow/costs"

// /snow 물어보기의 준비된 질의응답(시드. dumping qa-seeds 규약). 문장은 여기, 숫자는 map.json(facts)에서 읽는다(데이터가 갱신되면 문장도 따라온다).
// answer = 1부(말로 하는 답, 2~4문장·합니다체·통계 용어 없음), detail = 2부("- 수치: / - 근거: / - 한계: / - 다음 행동:" 불릿, 각 60자 안). hint는 1부 첫 문장.
// core = 처음 보이는 6개(공백·당장 할 일·비용·열선 없는 동·단계·초등학교). 나머지는 "더 보기". focus가 있으면 "지도에서 보기" 버튼(공백 탭 발견 카드와 같은 배선)

export interface Seed {
  q: string
  hint: string
  answer: string
  detail: string
  core?: boolean
  focus?: Finding["focus"]
}

const lines = (...ls: (string | null | false | undefined)[]) => ls.filter(Boolean).map((l) => `- ${l}`).join("\n")

export function buildSeeds(data: SnowMapData): Seed[] {
  const t = totals(data)
  const g = gapSummary(data)
  const checks = buildChecklist(data)
  const plan = planHeatBudget(data, Infinity)
  const first = g.noHeatList[0]
  const asof = data.asof.cacl.slice(0, 7)
  const schoolsNoHeat = data.schools.filter((s) => !s.heatNear.length)
  const noHeatDongWeak = data.dongs.filter((d) => g.noHeatDongs.includes(d.d)).reduce((s, d) => s + d.weak, 0)
  const noHeatDongMat = data.dongs.filter((d) => g.noHeatDongs.includes(d.d)).reduce((s, d) => s + d.salt + d.cacl + d.sand, 0)
  const seoulRank = data.seoul.findIndex((x) => x.gu === "광진구") + 1
  return [
    {
      q: "눈 오기 전에 어디가 비었나?",
      hint: `적설취약구간 ${t.weak}곳 중 ${g.weakNoHeat}곳에 열선이 없습니다.`,
      answer: `적설취약구간 ${t.weak}곳 중 ${g.weakNoHeat}곳에 열선이 없습니다. 그중 ${data.gaps.materialNearM}m 안에 자재도 없는 곳은 ${g.gu.none}곳${g.gu.noneNames.length ? `, ${g.gu.noneNames.join("과 ")}` : ""}입니다. 서울시가 관리하는 결빙구간 ${g.si.total}곳 중 ${g.si.none}곳은 열선도 자재도 없습니다.`,
      detail: lines(`수치: 열선 없는 적설취약구간 ${g.weakNoHeat}/${t.weak}, 결빙구간 공백 ${g.si.none}/${g.si.total}(자원 기준일 ${asof})`, "근거: 행안부 적설취약구간·상습 결빙구간, 광진구 제설함·염화칼슘보관함·모래주머니, 발견 카드", `한계: ${data.gaps.heatNearM}m 열선·${data.gaps.materialNearM}m 자재 거리는 이 화면의 가정. 구 취약지점 ${data.ops.weakPoints}개소 목록은 비공개`),
      core: true,
      focus: { layer: "weak" },
    },
    {
      q: "당장 무엇부터 하면 되나?",
      hint: `${checks[0]?.title ?? "점검 후보 1"}부터 하시면 됩니다.`,
      answer: `${checks[0]?.title ?? "점검 후보 1"}부터 하시면 됩니다. ${checks[0]?.needsDecision ? "예산 결정이 필요한 항목입니다." : "부서 지시로 끝나고 예산 결정이 필요 없습니다."} 그다음은 ${checks[1]?.short ?? "후보 2"}와 ${checks[2]?.short ?? "후보 3"}입니다. 다섯 건 전부 기한은 대책기간 시작 전입니다.`,
      detail: lines(`수치: 점검 후보 ${checks.length}건, 결정 필요 ${checks.filter((c) => c.needsDecision).length}건, 부서 지시 ${checks.filter((c) => !c.needsDecision).length}건`, "근거: 점검 후보 1~5(공백 탭 01, 보고 요약 한 장)", `다음 행동: ${checks[0]?.dept ?? "도로과"}에 ${checks[0]?.short ?? "후보 1"} 지시, 기한 ${checks[0]?.due ?? "대책기간 전"}`),
      core: true,
      focus: checks[0]?.focus,
    },
    {
      q: "열선을 다 놓으면 얼마나 드나?",
      hint: `구 관리 열선 없는 구간 ${plan.planned.length}곳 전부면 개략 ${eok(plan.cost)}입니다.`,
      answer: `구 관리 열선 없는 구간 ${plan.planned.length}곳 전부면 개략 ${eok(plan.cost)}입니다. 구간 길이 ${fmt(plan.meters)}m에 2차로를 가정한 값이고 1차로면 절반입니다. 다만 공개 기사의 평균 단가라 조달 단가와 다릅니다.`,
      detail: lines(`수치: ${fmt(plan.meters)}m × 2차로 × 1차로 100m당 1억원, 관리 연 100m당 360만원`, `근거: 개략 단가 출처(헤럴드경제 2024-02-20 서울시 관계자), 공백 탭 예산 역산`, "한계: 취약구간 차로수가 자료에 없어 2차로 가정. 실시설계 전 개략치", "다음 행동: 공백 탭 예산 역산 슬라이더로 예산별 신설 구간 확인"),
      core: true,
    },
    {
      q: "열선 없는 동은 어디인가?",
      hint: `${g.noHeatDongs.join(", ")} ${g.noHeatDongs.length}곳입니다.`,
      answer: `${g.noHeatDongs.join(", ")} ${g.noHeatDongs.length}곳입니다. 이 동들은 열선 없이 비치 자재 ${noHeatDongMat}개소와 인력으로 첫 결빙에 대응합니다. 적설취약구간은 ${noHeatDongWeak}곳뿐이라 열선보다 자재 점검이 먼저입니다.`,
      detail: lines(`수치: 열선 없는 동 ${g.noHeatDongs.length}/15, 열선 있는 동 ${t.heatDongs}, 자재 ${noHeatDongMat}개소`, `근거: 서울시 자치구별 도로열선(광진 ${t.heatSeg}행), 광진구 자재 3종, 점검 후보 4`, "한계: 동 값은 동주민센터 담당 구간표가 없어 행정동 경계로 자른 것"),
      core: true,
      focus: g.noHeatDongs[0] ? { dong: g.noHeatDongs[0] } : undefined,
    },
    {
      q: "지금 예보면 몇 단계인가?",
      hint: "대응 단계 탭이 기상청 예보와 특보로 서울시 기준 단계를 판정합니다.",
      answer: "대응 단계 탭이 기상청 예보와 특보로 서울시 기준 단계를 판정합니다. 보강은 1cm 미만, 1단계는 5cm 미만, 2단계는 5cm 이상 또는 대설주의보, 3단계는 10cm 이상 또는 대설경보입니다. 대책기간 밖에는 슬라이더 시나리오로 봅니다.",
      detail: lines("수치: 24시간 예보 적설과 대설특보 중 높은 쪽, 광진구 격자 nx 62·ny 126", "근거: 서울시 대응 단계 기준(2026-02-01), 기상청 단기예보·특보 현황", `한계: 실제 발령은 구 상황실이 합니다. 대책기간 ${data.ops.period.from}부터 ${data.ops.period.to}까지`),
      core: true,
    },
    {
      q: "초등학교 통학로는 괜찮은가?",
      hint: `초등학교 ${t.schools}교 중 ${g.schoolsNoHeat}교는 ${data.gaps.schoolNearM}m 안에 열선이 없습니다.`,
      answer: `초등학교 ${t.schools}교 중 ${g.schoolsNoHeat}교는 ${data.gaps.schoolNearM}m 안에 열선이 없습니다. 통학로 제설 소관이 자료에 없어 점검 후보 5로 두고 소관 확정을 먼저 요청합니다. ${data.gaps.schoolNearM}m는 이 화면의 가정입니다.`,
      detail: lines(`수치: 열선 없는 초등학교 ${g.schoolsNoHeat}/${t.schools}${schoolsNoHeat.length ? `(${schoolsNoHeat.slice(0, 4).map((s) => s.name.replace(/초등학교$/, "초")).join("·")} 등)` : ""}`, "근거: 나이스 초등학교 기본정보, 서울시 자치구별 도로열선, 점검 후보 5", "한계: 통학로 범위·소관은 못 구한 데이터. 학교 위치는 카카오 키워드 검색", "다음 행동: 통학로 제설 소관 확정 뒤 학교별 점검"),
      core: true,
      focus: { layer: "school" },
    },
    {
      q: "서울시 관리 결빙구간은 구가 무엇을 하나?",
      hint: "구는 관리청에 제설 계획 확인을 요청합니다.",
      answer: `구는 관리청에 제설 계획 확인을 요청합니다. 구가 직접 자재를 놓는 구간이 아닙니다. 서울시 관리 결빙구간 ${g.si.total}곳 중 ${g.si.none}곳은 열선도 자재도 없지만 전부 간선도로입니다. 관리청의 제설 계획과 살포 구간을 확인해 구 상황실이 공유하면 됩니다.`,
      detail: lines(`수치: 시 관리 결빙구간 ${g.si.total}곳(시설공단·동부도로사업소), 구 관리 ${data.ice.length - g.si.total}곳은 열선 있음`, "근거: 행안부 상습 결빙구간, 점검 후보 3", "한계: 관리청 살포 구간·장비 현황은 구 데이터에 없음", "다음 행동: 관리청 공문 발송, 대책기간 전"),
      focus: { layer: "ice" },
    },
    {
      q: "자재는 충분한가?",
      hint: `비치 자재 ${fmt(t.materials)}개소가 15개 동 전부에 있습니다.`,
      answer: `비치 자재 ${fmt(t.materials)}개소가 15개 동 전부에 있습니다. 제설함 ${t.salt}, 염화칼슘보관함 ${t.cacl}, 모래주머니 ${t.sand}지점 ${fmt(t.sandBags)}포입니다. 다만 공개 자료의 위치와 수량이라 현장 충전 상태와 다를 여지가 있습니다.`,
      detail: lines(`수치: 제설함 ${t.salt}(${data.asof.salt.slice(0, 7)}), 염화칼슘함 ${t.cacl}(${asof}), 모래주머니 ${data.asof.sand.slice(0, 4)}년 기준`, "근거: 광진구 제설함·염화칼슘보관함·모래주머니 공개 자료, 자원 현황 탭", `한계: 모래주머니는 ${data.asof.sand.slice(0, 4)}년 자료. 살포기 ${data.ops.sprayers}대 위치는 못 구한 데이터`),
    },
    {
      q: "건물 앞 눈은 누가 언제까지 치우나?",
      hint: "건축물관리자가 눈이 그친 뒤 주간 4시간 안에, 야간이면 다음 날 오전 11시까지 치웁니다.",
      answer: "건축물관리자가 눈이 그친 뒤 주간 4시간 안에, 야간이면 다음 날 오전 11시까지 치웁니다. 하루 10cm 이상이면 24시간 안입니다. 범위는 대지에 접한 보도 전부와 이면도로 대지경계 1m이고 차도는 구청이 맡습니다.",
      detail: lines("수치: 주간 4시간, 야간 다음 날 11시, 10cm 이상 24시간(조례 제5조)", "근거: 광진구 건축물관리자의 제설·제빙에 관한 조례 제4·5조, 자연재해대책법 제27조", "한계: 조례에 과태료 조항이 없고 시한 준수 실적은 자료에 없음"),
    },
    {
      q: `우선순위 1위는 왜 ${first ? segName(first) : "그 구간"}인가?`,
      hint: first ? `${segName(first)}는 ${priorityText(segPriority(first, data))}로 점수가 가장 높습니다.` : "우선순위 점수가 가장 높은 구간입니다.",
      answer: first ? `${segName(first)}는 ${priorityText(segPriority(first, data))}로 점수가 가장 높습니다. 점수는 자재 없음 3점, 경사 퍼센트의 10분의 1, 초등학교 1교당 1.5점, 행안부 급경사 1점, 구 소관 0.5점을 더한 값입니다. 가중치는 이 화면의 가정입니다.` : "우선순위 점수가 가장 높은 구간입니다.",
      detail: lines(first ? `수치: 점수 ${segPriority(first, data).score.toFixed(1)}, 길이 ${Math.round(first.pathM)}m, 동 ${first.d ?? "구 경계선 밖"}` : null, "근거: 공백 탭 02 표 둘째 줄, 데이터·방법 우선순위와 예산 역산", "한계: 경사는 지형 고도 추정치, 가중치는 가정"),
      focus: first && first.src === "weak" ? { segIds: [first.i] } : undefined,
    },
    {
      q: "이 화면에 없는 자료는 무엇인가?",
      hint: `동주민센터 담당 구간표와 구 취약지점 ${data.ops.weakPoints}개소 목록이 없습니다.`,
      answer: `동주민센터 담당 구간표와 구 취약지점 ${data.ops.weakPoints}개소 목록이 없습니다. 살포기 ${data.ops.sprayers}대 위치, 조례 시한 준수 실적, 제설 민원, 자재 조달 단가, 통학로 소관도 없습니다. 정보공개청구로 받으면 화면의 동 값과 분모가 바뀝니다.`,
      detail: lines("수치: 공개 자료 14종 사용, 미확보 7종", "근거: 데이터·방법 모달 못 구한 데이터", "한계: 동 값은 행정동 경계 대용, 취약구간 분모는 행안부 47"),
    },
    {
      q: "다른 구와 견주면 어떤가?",
      hint: `광진구 열선 연장은 서울 ${data.seoul.length}개 구 중 ${seoulRank}위입니다.`,
      answer: `광진구 열선 연장은 서울 ${data.seoul.length}개 구 중 ${seoulRank}위입니다. 비교 자료는 서울시 자치구별 도로열선 집계뿐이고 자재나 취약구간의 구별 비교 자료는 없습니다. 열선이 많다고 공백이 없는 것은 아닙니다.`,
      detail: lines(`수치: 광진 ${t.heatSeg}구간 ${fmt(t.heatM)}m, 서울 집계 ${data.asof.seoul.slice(0, 7)}`, "근거: 서울시 자치구별 도로열선(25개 구), 자원 현황 탭 03", "한계: 구별 취약구간 수·자재는 비교 자료 없음"),
    },
  ]
}
