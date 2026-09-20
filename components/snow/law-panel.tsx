"use client"

import type { SnowMapData } from "@/lib/snow/types"
import { SectionHead } from "@/components/dumping/section-head"

// 법령·책임 탭. 자연재해대책법 제27조 → 광진구 조례(제3~9조 요지) → 서울시 대응 단계 기준 → 대책기간. 원문은 법제처에서 2026-09-20 조회

interface Props {
  data: SnowMapData | null
}

const ORD = [
  { a: "제3조", t: "책임 순위", g: "소유자가 거주하면 소유자 → 점유자 → 관리자. 거주하지 않으면 점유자 → 관리자 → 소유자. 당사자 합의가 있으면 그 순서" },
  { a: "제4조", t: "범위", g: "보도는 대지에 접한 구간 전부. 이면도로·보행자전용도로는 주거용 건축물이면 주출입구 대지경계에서 1m, 비주거용이면 대지경계에서 1m. 시행령 제22조의8 시설물은 지붕" },
  { a: "제5조", t: "시기", g: "눈이 그친 때로부터 주간 4시간 이내, 야간은 다음 날 오전 11시까지. 1일 적설 10cm 이상이면 24시간 이내. 지붕은 지역별 적설량의 50%에 이르고 추가 강설이 예상되면 즉시" },
  { a: "제6조", t: "방법", g: "삽·빗자루로 치운 뒤 보도 가장자리·공터로. 얼음은 녹이는 재료나 모래를 쓰고 녹은 뒤 모래를 치운다" },
  { a: "제7·8조", t: "안전", g: "장비·장구를 갖추고, 일몰·폭풍·이상한파로 위험하면 작업을 중단한다" },
  { a: "제9조", t: "도구 비치", g: "건축물 안에 제설·제빙 도구를 비치해 관리한다" },
]

export default function LawPanel({ data }: Props) {
  return (
    <div className="px-4 pb-4 pt-3">
      <p className="dump-headline text-[21px] leading-[1.42] text-[var(--cp-text-strong)]">
        차도는 구청이, 보도와 이면도로 1m는 건축물관리자가 치운다. <span className="text-[var(--cp-text-muted)]">법률이 원칙을 정하고 조례가 범위와 시한을 정한다.</span>
      </p>

      <SectionHead n="01" sub="법률 제20961호 · 시행 2025-10-01 · 법제처 국가법령정보센터 MST 276321">
        자연재해대책법 제27조
      </SectionHead>
      <blockquote className="border-l-2 border-(--dump-accent) pl-3 text-[13.5px] leading-relaxed text-[var(--cp-text)]">
        ① 건축물의 소유자·점유자 또는 관리자로서 그 건축물에 대한 관리 책임이 있는 자(건축물관리자)는 관리하고 있는 건축물 주변의 보도, 이면도로, 보행자 전용도로, 시설물의 지붕(대통령령으로 정하는 시설물의 지붕으로 한정)에 대한 제설·제빙 작업을 하여야 한다.
        <br />② 건축물관리자의 구체적 제설·제빙 책임 범위 등에 관하여 필요한 사항은 해당 지방자치단체의 조례로 정한다.
      </blockquote>

      <SectionHead n="02" sub="2020-10-28 제정·시행 · 소관 도로과 도로관리팀 · 법제처 자치법규 1540021">
        광진구 건축물관리자의 제설·제빙에 관한 조례
      </SectionHead>
      <ul className="space-y-2">
        {ORD.map((o) => (
          <li key={o.a} className="flex gap-2.5 text-[13.5px] leading-snug">
            <span className="w-14 shrink-0 font-mono text-[12px] text-(--dump-accent)">{o.a}</span>
            <span>
              <b className="text-[var(--cp-text-strong)]">{o.t}</b> <span className="text-[var(--cp-text-muted)]">{o.g}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12.5px] leading-snug text-[var(--cp-text-dim)]">조례에 과태료 조항은 없다. 이면도로 제설은 의무이되 제재 없는 의무다. 대응 단계 탭의 시한 계산은 제5조 제1항을 그대로 적용한다.</p>

      <SectionHead n="03" sub="서울시 보도자료 2026-02-01(대설예비특보 2단계 발령). 자치구가 같은 기준을 따른다">
        서울시 강설 대응 단계
      </SectionHead>
      <table className="w-full text-[13px]">
        <tbody>
          {[
            ["평시", "적설 예보 없음", "상황실 감시"],
            ["보강", "1cm 미만 예보", "보강 근무 · 취약지점 점검"],
            ["1단계", "5cm 미만 예보", "제설제 사전 살포 · 인력 배치"],
            ["2단계", "5cm 이상 예보 또는 대설주의보", "전 장비·인력 투입"],
            ["3단계", "10cm 이상 예보 또는 대설경보", "전 직원·민관 총동원"],
          ].map(([s, c, a]) => (
            <tr key={s} className="border-t border-[var(--cp-border-faint)]">
              <td className="py-1.5 pr-2 font-semibold text-[var(--cp-text-strong)]">{s}</td>
              <td className="py-1.5 pr-2 text-[var(--cp-text)]">{c}</td>
              <td className="py-1.5 text-[var(--cp-text-dim)]">{a}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {data && (
        <>
          <SectionHead n="04" sub={data.ops.source}>
            광진구 대책기간·동원 규모(보도)
          </SectionHead>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
            <li><span className="text-[var(--cp-text-dim)]">기간</span> <b>{data.ops.period.from} ~ {data.ops.period.to}</b></li>
            <li><span className="text-[var(--cp-text-dim)]">인력</span> <b>{data.ops.staff.toLocaleString("ko-KR")}명 · 실무반 {data.ops.squads}</b></li>
            <li><span className="text-[var(--cp-text-dim)]">장비</span> <b>유니목 {data.ops.unimog} · 15t 덤프 {data.ops.dump15t}</b></li>
            <li><span className="text-[var(--cp-text-dim)]">살포기</span> <b>{data.ops.sprayers}대</b></li>
            <li><span className="text-[var(--cp-text-dim)]">취약지점</span> <b>{data.ops.weakPoints}개소</b></li>
            <li><span className="text-[var(--cp-text-dim)]">시즌 제설제</span> <b>{data.ops.saltTons.toLocaleString("ko-KR")}톤</b></li>
          </ul>
          <p className="mt-2 text-[12px] leading-snug text-[var(--cp-text-faint)]">보도자료 수치라 개소 정의가 공개 데이터와 다르다(열선 55개소 vs 구 데이터 41구간). 위치가 공개된 자원만 지도에 있다.</p>
        </>
      )}
    </div>
  )
}
