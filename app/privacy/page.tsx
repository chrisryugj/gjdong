import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "개인정보 처리방침 · 표준주소실록",
  description: "표준주소실록 웹서비스와 크롬 확장 프로그램의 데이터 처리 방침",
}

const UPDATED = "2026-08-02"

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-[12px] text-slate-500 hover:text-slate-700">
          ← 표준주소실록으로 돌아가기
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-slate-900">개인정보 처리방침</h1>
        <p className="mt-1 text-[12px] text-slate-500">최종 갱신 {UPDATED}</p>

        <div className="mt-8 space-y-8 text-[13px] leading-relaxed text-slate-700">
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-[15px] font-semibold text-slate-900">0. 운영 주체</h2>
            <p className="mt-2">
              표준주소실록은 개인이 공익 목적으로 만든 비영리 도구다. 광진구청을 포함한
              어떤 기관의 공식 서비스도 아니며, 운영·책임 주체는 제작자 개인이다.
              문의: <a className="underline" href="mailto:ryuseungin@gmail.com">ryuseungin@gmail.com</a>
            </p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-[15px] font-semibold text-slate-900">1. 웹서비스가 처리하는 정보</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>
                <b>입력한 주소·시설명</b>: 주소 변환을 위해 서버로 전송되어 Kakao Local API 호출에
                사용된다. 서버는 이 값을 데이터베이스에 저장하지 않으며, 응답을 돌려준 뒤 폐기한다.
              </li>
              <li>
                <b>업로드한 파일</b>(태블로 지오코더의 CSV·엑셀): 좌표 부여를 위해 메모리에서만
                처리되고 디스크에 보관하지 않는다.
              </li>
              <li>
                <b>회원 정보 없음</b>: 로그인·회원가입이 없어 이름·연락처·계정 식별자를 수집하지 않는다.
              </li>
            </ul>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-[15px] font-semibold text-slate-900">2. 브라우저에 저장되는 정보</h2>
            <p className="mt-2">
              아래 항목은 <b>이용자 브라우저의 로컬스토리지에만</b> 저장된다. 서버로 전송되지 않고,
              제작자는 열람할 수 없다.
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>최근 변환 이력</li>
              <li>
                시설관리 대시보드에 등록한 시설 목록 — 시설명, 원본·변환 주소, 좌표, 분류
                (키: <code className="rounded bg-slate-100 px-1">gjdong_facilities_v1</code>)
              </li>
              <li>지도 마커 색상·분류 표시 순서 등 화면 설정</li>
            </ul>
            <p className="mt-2 text-slate-600">
              삭제하려면 대시보드의 초기화 기능을 쓰거나, 브라우저 설정에서 이 사이트의 저장
              데이터를 지우면 된다. <b>공용 PC에서는 사용 후 삭제를 권한다.</b>
            </p>
            <p className="mt-2 text-slate-600">
              주민등록번호, 건강정보 등 민감정보나 특정 개인을 식별할 수 있는 명단은 이 도구에
              입력하지 않기를 권한다. 이 도구는 그런 정보를 다루도록 설계되지 않았다.
            </p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-[15px] font-semibold text-slate-900">3. 크롬 확장 프로그램</h2>
            <p className="mt-2">
              확장 프로그램은 <b>모든 웹사이트</b>에서 동작하며, 다음과 같이 작동한다.
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>
                이용자가 <b>복사(Ctrl/⌘+C)한 텍스트</b>가 한국 주소 형태인지 확장 내부에서 검사한다.
                주소 형태가 아니면 아무 일도 일어나지 않고 외부로 나가지 않는다.
              </li>
              <li>
                주소 형태로 판정되면 <b>그 주소 문자열이</b>{" "}
                <code className="rounded bg-slate-100 px-1">https://gjdong.vercel.app/api/resolve-address</code>{" "}
                로 전송되어 변환된다. 페이지의 다른 내용, 열람 기록, 쿠키는 전송하지 않는다.
              </li>
              <li>
                이 자동 감지는 <b>기본으로 켜져 있다.</b> 확장 설정 화면의 &ldquo;클립보드 자동 감지&rdquo;를
                끄면 복사 후킹과 전송이 모두 중단된다.
              </li>
              <li>변환 이력·즐겨찾기·설정은 브라우저의 확장 저장소에만 보관된다.</li>
            </ul>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-[15px] font-semibold text-slate-900">4. 제3자 제공·처리 위탁</h2>
            <p className="mt-2">
              주소 변환은 <a className="underline" href="https://developers.kakao.com/" target="_blank" rel="noopener noreferrer">Kakao Local API</a>를
              호출해 이루어진다. 이 과정에서 입력한 주소 문자열이 카카오에 전달된다. 그 외 제3자에게
              정보를 제공하거나 판매하지 않는다.
            </p>
            <p className="mt-2 text-slate-600">
              방문자 수 표시를 위해 외부 카운터(hitscounter.dev) 이미지를 불러온다. 이 요청에는
              브라우저가 통상 보내는 정보(IP·User-Agent)가 포함될 수 있다.
            </p>
            <p className="mt-2 text-slate-600">
              페이지별 이용 통계는{" "}
              <a className="underline" href="https://vercel.com/docs/analytics/privacy-policy" target="_blank" rel="noopener noreferrer">Vercel Web Analytics</a>로
              집계한다. 쿠키를 사용하지 않으며 방문자를 지속적으로 식별하는 값을 저장하지 않는다.
              요청 정보(IP·User-Agent 등)는 해시로 변환해 하루 단위로만 순방문자를 구분하고,
              수집 항목은 방문 경로·유입 경로(referrer)·국가·기기 및 브라우저 종류 수준이다.
            </p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-[15px] font-semibold text-slate-900">5. 문의</h2>
            <p className="mt-2">
              처리방침에 대한 문의나 정정·삭제 요청은{" "}
              <a className="underline" href="mailto:ryuseungin@gmail.com">ryuseungin@gmail.com</a> 으로
              보내면 된다. 소스코드는{" "}
              <a className="underline" href="https://github.com/chrisryugj/gjdong" target="_blank" rel="noopener noreferrer">GitHub</a>
              에 공개되어 있어 처리 방식을 직접 확인할 수 있다.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
