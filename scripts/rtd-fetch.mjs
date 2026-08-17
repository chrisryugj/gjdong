// 서울 실시간도시데이터(SeoulRtd) 공용 호출부.
// 서버가 간헐적으로 따옴표 없는 스키마 스텁을 돌려주는 flake가 있어 파싱 실패도 재시도 대상이고,
// GitHub Actions 러너에서는 연결 자체가 잠깐 끊기는 일(fetch failed)도 있어 재시도로 흡수한다.

const RTD_BASE = "https://data.seoul.go.kr/SeoulRtd/api"
const RTD_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Referer: "https://data.seoul.go.kr/SeoulRtd/map",
  Accept: "application/json, text/plain, */*",
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// "fetch failed"는 진짜 원인을 cause에 숨긴다 (EAI_AGAIN·ECONNRESET·TLS…).
// 다음 실패 때 로그만 보고 원인을 가릴 수 있게 메시지에 같이 싣는다.
function describe(err) {
  const cause = err?.cause
  if (!cause) return err.message
  return `${err.message} (${cause.message ?? cause})`
}

// 기본 5회 / 2·4·8·16초 백오프 — 총 30초. 러너에서 관측된 끊김이 3초 창(구 1·2초)을
// 넘겨서 수집이 통째로 날아갔다. 호출부가 실패를 감당할 수 있으면 tries를 줄여 쓴다.
export async function rtdJson(path, params, { tries = 5, sleep = wait } = {}) {
  const qs = new URLSearchParams(params).toString()
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(`${RTD_BASE}/${path}?${qs}`, { headers: RTD_HEADERS })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (!text) throw new Error("empty response")
      return JSON.parse(text)
    } catch (err) {
      if (i >= tries) throw new Error(`SeoulRtd ${path} failed: ${describe(err)}`)
      await sleep(1000 * 2 ** i)
    }
  }
}
