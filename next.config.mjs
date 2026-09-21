/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          // 전면 CSP는 인라인 스크립트·외부 타일 화이트리스트 관리가 커서, 프레이밍·플러그인·base 탈취만 막는다
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
        ],
      },
      // 암호 게이트 페이지 — 메타 noindex(page.tsx)에 더해 헤더로도 색인 거부 (API 응답까지 포함)
      {
        source: "/dumping/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          // 음성 질의응답(마이크·호출어). 전역 microphone=()가 이 경로에도 걸려 SpeechRecognition이 not-allowed였다(2026-09-16 실측). 같은 키는 뒤 항목이 이긴다
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self)" },
        ],
      },
      {
        source: "/api/dumping/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      // /snow 물어보기 마이크(6라운드). /dumping과 같은 이유로 전역 microphone=()를 self로 덮는다
      {
        source: "/snow/:path*",
        headers: [{ key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self)" }],
      },
    ]
  },
}

export default nextConfig
