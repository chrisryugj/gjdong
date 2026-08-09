// 인파레이더 메타데이터 빌더 — /crowd(기본)와 /crowd/[...slug](변형)가 공유한다.
// searchParams를 읽지 않으므로 두 라우트 모두 정적 프리렌더된다.

import type { Metadata, Viewport } from "next"
import { citySubtitle, META, UI, type Lang } from "@/lib/crowd/i18n"
import { type CityId } from "@/lib/crowd/cities"
import { crowdPath, DEFAULT_CITY } from "@/lib/crowd/crowd-url"

const ORIGIN = "https://gjdong.vercel.app"

const OG_LOCALE: Record<Lang, string> = { ko: "ko_KR", en: "en_US", ja: "ja_JP", zh: "zh_CN" }

export const crowdViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f6f3",
}

/**
 * 도시별 제목·설명.
 *
 * 서울은 기존 META 문안 그대로. 비서울은 **치환하지 않는다** — META 본문은 서울 전용
 * 사실(명소 121곳·따릉이·명동·12시간 예측)로 짜여 있어 도시명만 바꾸면 거짓이 된다.
 * 대신 헤더가 쓰는 도시별 부제(citySubtitle)를 그대로 쓴다: 원천이 다른 만큼 세는 대상도
 * 다르다는 게 이미 4개 언어로 반영돼 있다(인파/접근·주차/출국장 대기).
 */
export function cityCopy(lang: Lang, city: CityId) {
  const t = UI[lang]
  // 브랜드명에는 숫자가 없어 도시명 치환이 안전하다 ("서울 인파레이더" → "부산 인파레이더")
  const brand = t.title.replaceAll(t.cityNames.seoul, t.cityNames[city])
  if (city === DEFAULT_CITY) {
    return {
      brand,
      title: META[lang].title,
      description: META[lang].description,
      ogTitle: META[lang].ogTitle,
      ogDescription: META[lang].ogDescription,
    }
  }
  const sub = citySubtitle(t, city)
  return { brand, title: `${brand} — ${sub}`, description: sub, ogTitle: brand, ogDescription: sub }
}

export function buildCrowdMetadata(lang: Lang, city: CityId): Metadata {
  const m = cityCopy(lang, city)
  const url = `${ORIGIN}${crowdPath(lang, city)}`

  return {
    manifest: "/crowd-manifest.webmanifest",
    // 홈 화면 이름도 도시를 따른다 — 부산 화면을 담아두고 "Seoul Crowd Radar"가 뜨면 안 된다
    appleWebApp: { capable: true, title: m.brand, statusBarStyle: "default" },
    // 파비콘은 /crowd 라우트에만 — 표준주소실록 본진 브랜딩은 건드리지 않는다
    icons: {
      icon: [
        { url: "/crowd-favicon-32.png?v=2", sizes: "32x32", type: "image/png" },
        { url: "/crowd-favicon-16.png?v=2", sizes: "16x16", type: "image/png" },
        { url: "/crowd-icon-192.png?v=2", sizes: "192x192", type: "image/png" },
      ],
      apple: "/crowd-icon-180.png?v=2",
    },
    title: m.title,
    description: m.description,
    alternates: {
      canonical: url,
      // 도시는 유지한 채 언어만 바꾼 짝 — 크롤러가 같은 화면의 언어판임을 알게 한다
      languages: {
        ko: `${ORIGIN}${crowdPath("ko", city)}`,
        en: `${ORIGIN}${crowdPath("en", city)}`,
        ja: `${ORIGIN}${crowdPath("ja", city)}`,
        "zh-CN": `${ORIGIN}${crowdPath("zh", city)}`,
      },
    },
    openGraph: {
      title: m.ogTitle,
      description: m.ogDescription,
      type: "website",
      locale: OG_LOCALE[lang],
      url,
      images: [
        {
          url: "/og-crowd.jpg?v=2",
          width: 1200,
          height: 630,
          alt: m.ogTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: m.ogTitle,
      description: m.ogDescription,
      images: ["/og-crowd.jpg?v=2"],
    },
  }
}
