import type { Metadata, Viewport } from "next"
import CrowdDashboard from "@/components/crowd/dashboard-client"
import { isLang, META, UI, type Lang } from "@/lib/crowd/i18n"
import { isCityId } from "@/lib/crowd/cities"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f6f3",
}

const OG_LOCALE: Record<Lang, string> = { ko: "ko_KR", en: "en_US", ja: "ja_JP", zh: "zh_CN" }

// ?lang= 딥링크 공유 시 해당 언어 제목·설명으로 OG 카드가 나가도록 동적 생성
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; city?: string }>
}): Promise<Metadata> {
  const { lang: raw, city: cityRaw } = await searchParams
  const lang: Lang = isLang(raw) ? raw : "ko"
  const city = isCityId(cityRaw) ? cityRaw : "seoul"
  // 제주/부산 딥링크는 제목·설명의 현지화된 "서울"만 해당 도시명으로 치환 (4개 언어 공통 처리)
  const names = UI[lang].cityNames
  const swap = (s: string) => (city === "seoul" ? s : s.replaceAll(names.seoul, names[city]))
  const m = {
    title: swap(META[lang].title),
    description: swap(META[lang].description),
    ogTitle: swap(META[lang].ogTitle),
    ogDescription: swap(META[lang].ogDescription),
  }
  const params = new URLSearchParams()
  if (lang !== "ko") params.set("lang", lang)
  if (city !== "seoul") params.set("city", city)
  const qs = params.toString()
  const url = qs ? `https://gjdong.vercel.app/crowd?${qs}` : "https://gjdong.vercel.app/crowd"

  return {
    manifest: "/crowd-manifest.webmanifest",
    appleWebApp: { capable: true, title: lang === "ko" ? "인파레이더" : "Seoul Crowd Radar", statusBarStyle: "default" },
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
      canonical: "https://gjdong.vercel.app/crowd",
      languages: {
        ko: "https://gjdong.vercel.app/crowd",
        en: "https://gjdong.vercel.app/crowd?lang=en",
        ja: "https://gjdong.vercel.app/crowd?lang=ja",
        "zh-CN": "https://gjdong.vercel.app/crowd?lang=zh",
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

export default function CrowdPage() {
  return <CrowdDashboard />
}
