// 한국 관공서 호스트 전용 HTTP 헬퍼 (서버 전용)
// TOPIS·KHOA 등은 TLS 중간 인증서가 누락된 체인을 보내 Node fetch(undici)가
// UNABLE_TO_VERIFY_LEAF_SIGNATURE / SELF_SIGNED_CERT_IN_CHAIN 으로 거부한다 (2026-08-04 실측).
// 공개 조회 전용 데이터라 해당 요청에 한해 체인 검증을 끄고 node:https로 직접 통신한다.

import https from "node:https"

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

export function krgovFetch(
  url: string,
  options: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {},
): Promise<string> {
  const { method = "GET", headers = {}, body, timeoutMs = 12000 } = options
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        rejectUnauthorized: false,
        timeout: timeoutMs,
        // UA 없는 요청은 handshake 후 즉시 끊는 호스트가 있다(KHOA 실측) — 브라우저 UA 기본
        headers: { "User-Agent": DEFAULT_UA, Accept: "application/json, text/plain, */*", ...headers },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`krgov ${res.statusCode} ${url}`))
          return
        }
        let data = ""
        res.setEncoding("utf8")
        res.on("data", (chunk: string) => (data += chunk))
        res.on("end", () => resolve(data))
      },
    )
    req.on("timeout", () => req.destroy(new Error(`krgov timeout ${url}`)))
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}

export async function krgovJson(url: string, options?: Parameters<typeof krgovFetch>[1]): Promise<unknown> {
  return JSON.parse(await krgovFetch(url, options))
}
