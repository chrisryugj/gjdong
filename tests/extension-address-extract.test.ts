import assert from "node:assert/strict"
import test from "node:test"
import { extractAddress } from "../extension/lib/address-extract"

// 익스텐션이 복사·선택 텍스트에서 "주소만" 떼어 보내는지 고정하는 회귀 테스트.
// 예전 구현은 줄 단위로만 걸러서 표 한 행이 통째로 서버·Kakao API 로 나갔다.

test("표 한 행에서 주소 칸만 남긴다", () => {
  const row = "홍길동\t010-1234-5678\t서울시 광진구 자양로 117\t1970-01-01"
  const out = extractAddress(row)

  assert.equal(out, "서울시 광진구 자양로 117")
  assert.ok(!out!.includes("홍길동"))
  assert.ok(!out!.includes("010-1234-5678"))
  assert.ok(!out!.includes("1970-01-01"))
})

test("공백으로만 구분된 이름+주소에서 이름을 떼어낸다", () => {
  const out = extractAddress("홍길동 서울시 광진구 자양로 117")

  assert.equal(out, "서울시 광진구 자양로 117")
})

test("같은 칸에 섞인 주민등록번호·연락처를 지운다", () => {
  const out = extractAddress("광진구 자양로 117 900101-1234567 010-9876-5432")

  assert.ok(out!.startsWith("광진구 자양로 117"))
  assert.ok(!out!.includes("900101-1234567"))
  assert.ok(!out!.includes("010-9876-5432"))
})

test("이메일도 지운다", () => {
  const out = extractAddress("광진구 아차산로 400 hong@example.com")

  assert.ok(!out!.includes("hong@example.com"))
  assert.ok(out!.includes("아차산로 400"))
})

test("주소가 없으면 null — 원문 폴백 금지", () => {
  assert.equal(extractAddress("홍길동\t010-1234-5678\t1970-01-01"), null)
  assert.equal(extractAddress("오늘 회의는 3시입니다"), null)
  assert.equal(extractAddress(""), null)
})

test("행정구역 표기는 주소 앞에 그대로 살린다", () => {
  assert.equal(extractAddress("서울특별시 광진구 아차산로 400"), "서울특별시 광진구 아차산로 400")
  assert.equal(extractAddress("경기도 성남시 분당구 판교역로 166"), "경기도 성남시 분당구 판교역로 166")
})

test("네이버 지도 UI 잔여물을 제거한다", () => {
  const out = extractAddress("도로명 광진구 아차산로 400 복사")

  assert.equal(out, "광진구 아차산로 400")
})

test("여러 줄 중 주소가 있는 줄만 고른다", () => {
  const out = extractAddress("민원접수 결과\n담당자 김철수\n광진구 자양로 117\n연락처 02-450-1234")

  assert.equal(out, "광진구 자양로 117")
})
