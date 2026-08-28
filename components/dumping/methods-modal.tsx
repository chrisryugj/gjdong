"use client"

import { ModalShell } from "./ops-modal"

// 분석에 쓰인 통계 모델·방법론 해설 — 일반 직원도 읽을 수 있게 "쉽게 말하면"을 앞세운다.
// 수치는 gwangjin-dumping/README.md 확정치만 인용한다(SSOT).

interface Method {
  name: string
  easy: string // 쉽게 말하면 — 비유 중심 한두 문장
  here: string // 이 분석에서 한 일과 결과
  caution?: string
}

const METHODS: Method[] = [
  {
    name: "100m 격자 결합",
    easy: "구 전체를 100m 바둑판(1,062칸)으로 나누고, 민원·과태료·건축물대장·인구를 전부 같은 칸 위에 얹었다. 서로 다른 장부를 한 지도에서 비교할 수 있게 만드는 밑작업이다.",
    here: "민원 3,462건과 과태료 3,247건을 주소로 좌표화해 격자에 배정했고, 건축물대장 24,520동으로 칸마다 무관리 주거단위 수를 셌다.",
  },
  {
    name: "다중회귀 분석 (표준화 β)",
    easy: "여러 요인이 섞여 있을 때 각 요인의 몫을 갈라내는 계산이다. \"인구가 많아서인가, 관리가 없어서인가\"를 동시에 넣고 따로 재는 것. β는 그 몫의 크기다.",
    here: "격자 1,062칸에서 과태료 건수를 종속변수로 놓고 재니, 관리주체 없는 주거 밀도가 β +0.312로 최강, 공동주택 세대수는 무효(p=0.708), 골목 비율은 오히려 음수(-0.222)였다.",
    caution: "계산 방법을 4가지(기본 OLS, 이분산 보정, 군집 보정, 음이항)로 바꿔 전부 같은 결론일 때만 채택했다. 그래도 이는 조건부 연관이지 인과 증명이 아니다.",
  },
  {
    name: "이중차분(DID)과 이벤트 스터디",
    easy: "CCTV를 설치한 곳과 아직 안 한 곳을 전후로 비교해 효과를 재는 방법이다. 중요한 함정이 하나 있다. 원래 많이 발생하던 곳은 아무것도 안 해도 저절로 줄어드는 경향(평균회귀)이 있어서, 비교를 잘못 짜면 없는 효과가 있어 보인다.",
    here: "초기 분석은 감소 효과가 있다고 봤지만, 비교 대상(대조군)에 같은 조건을 걸어 다시 재니 그쪽도 똑같이 줄었다. 감소분 전부가 평균회귀였고 주장은 철회됐다. 설치 전후를 월 단위로 펼쳐 본 이벤트 스터디(관측 22,247행)에서도 어느 시점도 유의하지 않았다.",
    caution: "이 철회 경험이 조치 대장(개입 사전등록) 원칙의 근거다. 효과 평가는 실행 전에 설계부터 등록한다.",
  },
  {
    name: "신고 채널 분해",
    easy: "민원이 늘었다고 발생이 는 건 아니다. 신고 창구(앱, 120, 직접)별로 쪼개 보면 무엇이 늘었는지가 갈린다.",
    here: "민원 2.10배 증가를 쪼개니 앱만 2.97배, 120·직접은 1.10배였다. 신고와 무관한 과태료도 1.1배 수준. 증가분 대부분은 앱 보급 효과다.",
  },
  {
    name: "핫스팟 점수와 백테스트",
    easy: "최근 발생일수록 무겁게 쳐서(90일 지나면 절반 가중) 격자마다 점수를 매기고, 점수 상위 지역을 다음 분기 관리 대상으로 뽑는다. 믿을 만한지는 과거로 돌아가 실험한다. 작년 이맘때 이 방법으로 뽑았다면 실제로 맞았을까를 8개 분기 반복 채점했다.",
    here: "상위 20곳 중 평균 65%에서 다음 분기 실제 발생이 있었고, 구 전체 발생의 11.5%가 이 20곳 안에서 일어났다(아무 곳 20곳을 찍으면 2.8%).",
  },
  {
    name: "홀트윈터스 수요 전망",
    easy: "월별 접수의 수준·추세·계절 반복(여름에 많고 겨울에 적은 패턴)을 학습해 다음 달을 내다보는 시계열 모형이다.",
    here: "직전 8개월을 한 달씩 가려놓고 맞혀보는 검증에서 평균 오차 18%. 인력·순찰 배치용 행정수요 전망으로만 쓴다.",
    caution: "신고 접수량 전망이지 발생량 예측이 아니다.",
  },
  {
    name: "온톨로지 (지식그래프)",
    easy: "데이터셋·증거·주장·지표·대책을 점으로, 그 사이 관계(뒷받침한다, 겨냥한다)를 선으로 잇는 지식 지도다. 표로는 못 묻는 질문, 예컨대 \"연관 요인 중 대책이 없는 것은?\"을 기계적으로 물을 수 있다.",
    here: "69개 지식과 93개 연결로 구성했다. 청년·외국인·1인세대 요인에 대응 수단이 없다는 빈칸이 여기서 드러나 다국어 안내·전입 시점 안내 등 신규 대책 셋이 나왔다.",
  },
  {
    name: "검증 하네스와 한계 공개",
    easy: "결론을 내기 전에 통계의 전제 조건들이 실제로 성립하는지 따로 검사하고, 어긋난 것은 숨기지 않고 적었다.",
    here: "잔차 정규성·등분산성·공간 독립성 위배를 확인해 보정 모형을 병행했고, 청년·외국인·1인세대·무관리주거는 상관 0.85~0.97로 얽혀 있어 무엇이 진짜 요인인지 갈라낼 수 없다는 한계를 명시했다. 어느 하나를 범인으로 지목하는 해석은 금지다.",
  },
]

export default function MethodsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <ModalShell
      title="분석 방법 안내"
      sub="이 상황판의 숫자가 어떻게 계산됐는지, 통계를 모르는 분도 읽을 수 있게 정리했습니다"
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        {METHODS.map((m, i) => (
          <section key={m.name} className="rounded-xl border border-[var(--cp-border)] p-3">
            <h3 className="flex items-baseline gap-2 text-[15px] font-bold text-[var(--cp-text-strong)]">
              <span className="font-mono text-[13px] text-[var(--cp-text-faint)]">{String(i + 1).padStart(2, "0")}</span>
              {m.name}
            </h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--cp-text-muted)]">
              <b className="text-[#0a4a41]">쉽게 말하면</b> · {m.easy}
            </p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--cp-text-muted)]">
              <b className="text-[var(--cp-text-strong)]">이 분석에서는</b> · {m.here}
            </p>
            {m.caution && (
              <p className="mt-1.5 rounded-lg bg-[#a8322a]/8 px-2.5 py-1.5 text-[13.5px] leading-relaxed text-[#7a2620]">
                주의 · {m.caution}
              </p>
            )}
          </section>
        ))}
        <p className="text-[12.5px] leading-relaxed text-[var(--cp-text-faint)]">
          상세 수식·검증 절차는 저장소 gwangjin-dumping의 README와 REPRODUCE/MODEL_SPEC.md에 있으며,
          모든 수치는 해시 검증(verify.py)으로 재현이 고정돼 있다.
        </p>
      </div>
    </ModalShell>
  )
}
