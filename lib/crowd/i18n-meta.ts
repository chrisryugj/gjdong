import type { Lang } from "./i18n-core"

// ── 페이지 메타데이터 (?lang= 딥링크 공유용)
export const META: Record<Lang, { title: string; description: string; ogTitle: string; ogDescription: string }> = {
  ko: {
    title: "서울 인파레이더 — 실시간 인구밀집 상황판 | 표준주소실록",
    description:
      "서울 주요 명소 121곳의 실시간 혼잡도를 한눈에. 12시간 예측에 주차 여유·문화행사·따릉이·사고 통제 경고까지 알려드립니다.",
    ogTitle: "서울 인파레이더 — 실시간 인구밀집 상황판",
    ogDescription: "서울 121곳 실시간 혼잡도 + 주차·문화행사·따릉이·통제 경고까지 한 화면에",
  },
  en: {
    title: "Seoul Crowd Radar — Live crowd levels at 121 hotspots",
    description:
      "Real-time crowd levels at 121 Seoul hotspots with 12-hour forecasts, parking availability, events, bike share, and live CCTV. Free, no app needed.",
    ogTitle: "Seoul Crowd Radar — Live crowd levels at 121 hotspots",
    ogDescription: "Is Myeongdong packed right now? Check live crowds, forecasts, parking & CCTV on one map.",
  },
  ja: {
    title: "ソウル混雑レーダー — 主要121スポットの混雑状況をリアルタイムで",
    description:
      "ソウル主要121スポットの混雑状況をリアルタイムで表示。12時間予測、駐車場の空き、イベント、シェアサイクル、ライブCCTVまで。アプリ不要・無料。",
    ogTitle: "ソウル混雑レーダー — 121スポットの混雑をリアルタイムで",
    ogDescription: "明洞は今混んでる？混雑状況・予測・駐車場・CCTVを1つの地図で。",
  },
  zh: {
    title: "首尔人流雷达 — 实时查看121个热门地点的拥挤程度",
    description:
      "实时显示首尔121个热门地点的拥挤程度：12小时预测、停车余位、文化活动、共享单车、实时监控画面。免费，无需下载App。",
    ogTitle: "首尔人流雷达 — 实时查看121个热门地点",
    ogDescription: "明洞现在挤不挤？拥挤程度·预测·停车·监控，一张地图全掌握。",
  },
}
