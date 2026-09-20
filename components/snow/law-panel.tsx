"use client"

import type { SnowMapData } from "@/lib/snow/types"
import { SectionHead } from "@/components/dumping/section-head"
import { Table } from "./ui"

// 법령·책임 탭. 01 자연재해대책법 제27조 02 광진구 조례(제3~9조 요지) 03 서울시 대응 단계 기준 04 대책기간·동원 규모(보도자료). 원문은 법제처에서 2026-09-20 조회
// 헤드라인은 조문에 있는 사실만: 보도는 접한 구간 전부, 이면도로는 대지경계 1m. 차도는 조례에 없다(구 제설대책기간 운영, 보도자료)

interface Props {
  data: SnowMapData | null
  dark?: boolean
}

const ORD = [
  { a: "제3조", t: "책임 순위", g: "소유자가 거주하면 소유자, 점유자, 관리자 순입니다. 거주하지 않으면 점유자, 관리자, 소유자 순입니다. 당사자 합의가 있으면 그 순서입니다" },
  { a: "제4조", t: "범위", g: "보도는 대지에 접한 구간 전부입니다. 이면도로·보행자전용도로는 주거용이면 주출입구 대지경계에서 1m, 비주거용이면 대지경계에서 1m입니다" },
  { a: "제5조", t: "시기", g: "눈이 그친 때로부터 주간 4시간 이내, 야간은 다음 날 오전 11시까지입니다. 1일 적설 10cm 이상이면 24시간 이내입니다" },
  { a: "제6조", t: "방법", g: "삽·빗자루로 치운 뒤 보도 가장자리나 공터에 둡니다. 얼음은 녹이는 재료나 모래를 쓰고 녹은 뒤 모래를 치웁니다" },
  { a: "제7·8조", t: "안전", g: "장비와 장구를 갖춥니다. 일몰·폭풍·이상한파로 위험하면 작업을 중단합니다" },
  { a: "제9조", t: "도구 비치", g: "건축물 안에 제설·제빙 도구를 비치해 관리합니다" },
]

export default function LawPanel({ data, dark = true }: Props) {
  return (
    <div className="px-4 pb-4 pt-3">
      <p className="dump-headline text-[21px] leading-[1.42] text-[var(--cp-text-strong)]">건축물관리자가 보도와 이면도로 대지경계 1m를 치웁니다.</p>
      <p className="mt-1.5 text-[14px] leading-snug text-[var(--cp-text-muted)]">보도는 대지에 접한 구간 전부입니다. 근거는 조례 제4조입니다. 차도는 구 제설대책기간 운영으로 구청이 맡습니다(보도자료).</p>
      {data && (
        <p className="mt-1.5 text-[13.5px] leading-snug text-[var(--cp-text-dim)]">
          지도는 이 탭에서 취약구간을 관리청별 색으로 표시합니다. 구 관리 {data.weak.length + data.ice.filter((s) => /\(광진구\)/.test(s.agency)).length}곳은 하늘색, 서울시 관리 {data.ice.filter((s) => !/\(광진구\)/.test(s.agency)).length}곳(시설공단·동부도로사업소)은 {dark ? "흰색" : "검정"}입니다.
        </p>
      )}

      <SectionHead n="01" sub="법률 제20961호 · 시행 2025-10-01 · 법제처 국가법령정보센터 MST 276321">
        자연재해대책법 제27조
      </SectionHead>
      <blockquote className="rounded-xl bg-[var(--cp-panel2)] px-3.5 py-2.5 text-[14px] leading-relaxed text-[var(--cp-text)]">
        ① 건축물의 소유자·점유자 또는 관리자로서 그 건축물에 대한 관리 책임이 있는 자(건축물관리자)는 관리하고 있는 건축물 주변의 보도, 이면도로, 보행자 전용도로, 시설물의 지붕(대통령령으로 정하는 시설물의 지붕으로 한정)에 대한 제설·제빙 작업을 하여야 한다.
        <br />② 건축물관리자의 구체적 제설·제빙 책임 범위 등에 관하여 필요한 사항은 해당 지방자치단체의 조례로 정한다.
      </blockquote>

      <SectionHead n="02" sub="2020-10-28 제정·시행 · 소관 도로과 도로관리팀 · 법제처 자치법규 1540021">
        광진구 건축물관리자의 제설·제빙에 관한 조례
      </SectionHead>
      <Table
        cols={[
          { k: "조", w: "48px", dim: true },
          { k: "항목", w: "60px" },
          { k: "요지", w: "minmax(0,1fr)", dim: true },
        ]}
        rows={ORD}
        rowKey={(o) => o.a}
        cell={(o, k) => (k === "조" ? <span className="font-mono text-[12.5px] text-(--dump-accent)">{o.a}</span> : k === "항목" ? <span className="font-semibold text-[var(--cp-text-strong)]">{o.t}</span> : <span title={o.g}>{o.g}</span>)}
      />
      <details className="mt-1.5">
        <summary className="cursor-pointer text-[13px] text-(--dump-accent)">요지 전문</summary>
        <ul className="mt-1 space-y-1.5 text-[13.5px] leading-snug text-[var(--cp-text-muted)]">
          {ORD.map((o) => (
            <li key={o.a} className="flex gap-2">
              <span className="w-12 shrink-0 font-mono text-[12.5px] text-(--dump-accent)">{o.a}</span>
              <span>{o.g}</span>
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-2 text-[13px] leading-snug text-[var(--cp-text-dim)]">조례에 과태료 조항은 없습니다. 대응 단계 탭의 시한 계산은 제5조 제1항을 그대로 적용합니다.</p>

      <SectionHead n="03" sub="서울시 보도자료 2026-02-01(대설예비특보 2단계 발령). 자치구가 같은 기준을 따릅니다">
        서울시 강설 대응 단계
      </SectionHead>
      <table className="w-full text-[13.5px]">
        <tbody>
          {[
            ["평시", "적설 예보 없음", "상황실 감시"],
            ["보강", "1cm 미만 예보", "보강 근무 · 취약구간 점검"],
            ["1단계", "5cm 미만 예보", "제설제 사전 살포 · 인력 배치"],
            ["2단계", "5cm 이상 또는 대설주의보", "전 장비·인력 투입"],
            ["3단계", "10cm 이상 또는 대설경보", "전 직원·민관 총동원"],
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
            대책기간·동원 규모(보도자료)
          </SectionHead>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13.5px]">
            <li><span className="text-[var(--cp-text-dim)]">기간</span> <b>{data.ops.period.from}부터 {data.ops.period.to}까지</b></li>
            <li><span className="text-[var(--cp-text-dim)]">인력</span> <b>{data.ops.staff.toLocaleString("ko-KR")}명 · 실무반 {data.ops.squads}개</b></li>
            <li><span className="text-[var(--cp-text-dim)]">장비</span> <b>유니목 {data.ops.unimog}대 · 15톤 덤프 {data.ops.dump15t}대</b></li>
            <li><span className="text-[var(--cp-text-dim)]">살포기</span> <b>{data.ops.sprayers}대</b></li>
            <li><span className="text-[var(--cp-text-dim)]">취약지점</span> <b>{data.ops.weakPoints}개소</b></li>
            <li><span className="text-[var(--cp-text-dim)]">시즌 제설제</span> <b>{data.ops.saltTons.toLocaleString("ko-KR")}톤</b></li>
          </ul>
          <p className="mt-2 text-[13px] leading-snug text-[var(--cp-text-dim)]">보도자료 수치라 개소 정의가 공개 데이터와 다를 수 있습니다. 위치가 공개된 자원만 지도에 있습니다.</p>
        </>
      )}
    </div>
  )
}
