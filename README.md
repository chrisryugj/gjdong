# 주소 변환기

카카오 API를 활용한 주소 변환 도구입니다. 단일 주소 또는 여러 주소를 한번에 변환할 수 있습니다.

## 주요 기능

- **자동 모드 감지**: 한 줄 입력 시 단일 변환, 여러 줄 입력 시 일괄 변환
- **다양한 주소 형식 제공**: 도로명, 지번, 행정동 주소 변환
- **지도 시각화**: Leaflet 지도에 위치 마커 표시
- **결과 표시 옵션**: 한번에 출력 또는 개별 출력 선택 가능
- **간편한 복사**: 원클릭으로 변환된 주소 복사

## 환경 변수 설정

배포 전에 다음 환경 변수를 설정해야 합니다:

\`\`\`
KAKAO_REST_API_KEY=your_kakao_rest_api_key
\`\`\`

### Kakao API 키 발급 방법

1. [Kakao Developers](https://developers.kakao.com/) 접속
2. 애플리케이션 생성
3. 앱 설정 > 앱 키에서 REST API 키 복사
4. 플랫폼 설정에서 Web 플랫폼 추가 및 도메인 등록

## 로컬 실행

\`\`\`bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
\`\`\`

브라우저에서 `http://localhost:3000` 접속

## Vercel 배포

1. GitHub에 코드 푸시
2. [Vercel](https://vercel.com) 접속 후 프로젝트 import
3. Environment Variables에 `KAKAO_REST_API_KEY` 추가
4. Deploy 버튼 클릭

또는 v0에서 직접 "Publish" 버튼을 클릭하여 배포할 수 있습니다.

## 사용 방법

### 단일 주소 변환
1. 입력창에 주소 한 줄 입력
2. "주소 검색" 버튼 클릭
3. 변환된 주소 확인 및 복사

### 일괄 주소 변환
1. 입력창에 여러 주소를 줄바꿈으로 구분하여 입력
2. 결과 표시 방법 선택 (한번에 출력 / 개별 출력)
3. "주소 검색" 버튼 클릭
4. 변환된 주소 목록 확인 및 복사

## 기술 스택

- **Framework**: Next.js 15 (App Router)
- **UI**: React, Tailwind CSS, shadcn/ui
- **지도**: Leaflet.js
- **API**: Kakao Local API

## 라이선스

MIT
