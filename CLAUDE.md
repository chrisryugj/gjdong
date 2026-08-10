# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Korean address converter tool using Kakao Local API. Converts addresses to standardized formats (road name, jibun, administrative dong) with map visualization. Four main surfaces:
1. **Main Converter** (`/`) - Single/batch address conversion with Excel export
2. **Facility Dashboard** (`/facility`) - Map-based facility manager: paste/upload any facility table (column order auto-detected), filter by admin-dong/category, search, colored markers, Excel/screenshot/report export. Data persists in `localStorage` only.
3. **Tableau Geocoder** (`/tableau-geocoder`) - CSV/Excel file upload for bulk geocoding (adds lat/lon columns)
4. **Chrome Extension** (`extension/`) - Browser extension for instant address conversion (popup, right-click, shortcut, auto-detect)
5. **Crowd Radar / 인파레이더** (`/crowd`) - Real-time congestion dashboard for **5 cities, 239 spots** (Seoul 121 · Jeju 66 · Busan 26 · Gangwon east coast 18 · Incheon Airport gates 8). Architecture after the 2026-08 refactor:
   - **Adapters** ([lib/crowd/](lib/crowd/)): one file per city (`seoul-rtd.ts`, `jeju.ts`, `busan.ts`, `gangwon.ts`, `incheon.ts`), each with a "데이터 계약 실측" header comment (the de-facto tech doc — never delete). Shared helpers in [lib/crowd/adapter-kit.ts](lib/crowd/adapter-kit.ts) (toNum, parkRatioLv 0.6/0.8/0.95, meanRoadLv, fetchMeteo12h, fetchBeachInfo, createSnapshot, emptyDetailFields). Server routing goes through `ADAPTERS` registry ([lib/crowd/adapters.ts](lib/crowd/adapters.ts), server-only); client UI branches only on `CITY_CAPS` capability table ([lib/crowd/cities.ts](lib/crowd/cities.ts)). Adding a city = adapter file + one entry in each. Grade basis differs per city (`CrowdSpot.basis`: ppl/access/wait/none) and is disclosed in list/map/cards — methodology in [docs/crowd-methodology.md](docs/crowd-methodology.md), adoption guide in [docs/crowd-adoption-guide.md](docs/crowd-adoption-guide.md).
   - **Dashboard** ([components/crowd/crowd-dashboard.tsx](components/crowd/crowd-dashboard.tsx), ~530 lines) composes hooks in [components/crowd/hooks/](components/crowd/hooks/): use-crowd-data (city + polling, `CITY_CAPS.pollMinutes`, hidden-tab pause with alerts-armed exception except Jeju), use-spot-selection (history/deep-link policy), use-spot-filters, use-persisted-prefs, use-split-pane, use-install-prompt, use-watchlist, use-ops-mode, use-crowd-alerts, use-time-lens (map-only day×hour pattern recolor from the cumulative heatmap; loader shared with spot-heatmap via [lib/crowd/heatmap-client.ts](lib/crowd/heatmap-client.ts), heatmap cities only, list/header stay live). Map view auto-fits the city's real spot bbox once per city on data arrival (`fitCity` prop, dashboard only — ops minimap/report keep `fitView`); wheel zoom uses `zoomSnap` 0.25 + `wheelPxPerZoomLevel` (Leaflet ignores `zoomDelta` for wheel — keep it default 1 so +/- buttons stay full-step).
   - **Ops mode** (상황실, [components/crowd/ops/](components/crowd/ops/), dynamic import): watchlist up to 12 spots (localStorage per city, `?mode=ops&spots=` deep link = session override), card grid busy-first with trend arrows, district bulk-add ([lib/crowd/districts.ts](lib/crowd/districts.ts) static mapping — regenerate via `scripts/generate-crowd-districts.ts` with Kakao key), CSV/XLSX/situation-report export ([lib/crowd/export.ts](lib/crowd/export.ts), Korean-fixed output; XLSX = snapshot+event-log sheets via click-time `import("xlsx")` — SheetJS CE writes no freeze/fill), busy-transition browser alerts ([lib/crowd/alerts.ts](lib/crowd/alerts.ts) seed/disarm/re-arm/cooldown), event timeline log ([lib/crowd/oplog.ts](lib/crowd/oplog.ts) + use-ops-log — polling snapshots to per-city localStorage, 288-tick cap, zero extra API calls).
   - **Print report** (`/crowd/report?city=&spots=`, [components/crowd/report/](components/crowd/report/)): A4 공문서-style situation report, Korean-fixed, `buildReportModel` in export.ts; data etiquette mirrors ops (detail fan-out Seoul-only watch spots, extra only when spots given), sparkline column from the ops event log when ≥2 ticks. MBTI picks ([lib/crowd/mbti.ts](lib/crowd/mbti.ts), citizen mode Seoul-only) is an entertainment feature — deterministic category/level scoring, always-visible disclaimer, never in work outputs.
   - **Incheon airport board** ([components/crowd/airport-board.tsx](components/crowd/airport-board.tsx), dynamic import, list-bottom `extra` slot of SpotListPanel): parking zones + arrivals (pickup) + taxi queue + bus/limousine timetables via `/api/crowd/airport` ([lib/crowd/incheon-airport.ts](lib/crowd/incheon-airport.ts), keyless airport.kr internals — arrivals `getArrPasSchList.do` POST with hex layout constant, taxi = SSR table on `/ap_ko/987/subview.do` (T1 row is `<th>`, T2 is `<td>`, fare-table decoys exist — anchor on "대기 차량(대)"), bus `busRouteList.do`/`busInfoDetail.do` (detail HTML carries no reliable route name — display the clicked route's name from the list), arrival-exit passenger forecast `statisticPredictCrowdedOfInout.do` (daily 17:00 forecast, T1 groups A,B/C/D/E,F · T2 A/B), AREX timetable parsed from airportrailroad.com `/train/normal/info/{100|110}/0` SSR (span `data-id` A010=express·B010=all-stop-to-Seoul only; attributes are newline-indented so the tag-close regex must allow ~400 chars; Sat/Sun→holiday table, public holidays not detected)).
   - **data.go.kr layer** (2026-08-09, one account key `DATA_GO_KR_KEY`, each service needs 활용신청; unapproved = silent empty): [lib/crowd/safety.ts](lib/crowd/safety.ts) 기상특보(getPwnStatus — ⚠️stnId does NOT filter, every office returns the same nationwide bulletin; parse 시도 segments with paren-aware splitting, "제외" parens = in effect, drop 먼바다 segments, gangwon needs inner coastal-town match) + 재난문자 merged into the existing `disaster` banner/report for ALL cities (seoul keeps RTD messages + warnings only). 재난문자 primary = **keyless safetydata.go.kr 알림 SSR page** (`/disaster-data/disasterNotification?keyword=시도명` — keyword searches a hidden recipient-region field, verified live; today-only filter, incheon excludes non-영종 sender 구s exactly), fallback = V2 API DSSP-IF-00247 (needs data.go.kr 15134001 approval, auto-activates). [lib/crowd/air.ts](lib/crowd/air.ts) 에어코리아 시도별 실시간(1 call/sido, 15-min snapshot + stale-on-error; ⚠️gateway kills reused keep-alive connections after big responses — use krgovFetch not undici fetch, and numOfRows=60 not 200 which 504s; station mapping = district→station candidates verified live, station name always disclosed). [lib/crowd/events.ts](lib/crowd/events.ts) TourAPI searchFestival2(⚠️old areaCode param silently returns 0 — use `lDongRegnCd` 법정동 codes 11/26/28/50/51; ⚠️response carries raw control chars, strip [\x00-\x1F] before JSON.parse; 120-day lookback then filter ongoing/≤14d-upcoming). Spot↔event matching is client-side ([lib/crowd/events-client.ts](lib/crowd/events-client.ts)) so the events route never calls adapter fetchSpots (jeju origin protection). Seoul subway arrivals: keyless RTD `subway?hotspotNm=` endpoint folded into `fetchSpotExtra` (`parseSubwayRows`). "지금 vs 평소" baseline badges: `baselineDelta` in heatmap-client + use-baseline hook (heatmap cities, ≥3 samples only). CITY_CAPS gained `air`/`tourEvents`/`subway`; ops toolbar has an event-linked watch panel; report gained 특보 merge + 행사 부록.
   - Jeju source protection is a hard constraint (2026-08 blocking incident): 15-min cache/polling, no ops detail fan-out, no hidden-tab polling; datacenter IPs get empty replies so prod reads the `data-jeju` snapshot branch published by a home-network collector (`scripts/collect-jeju.ts`).
   - i18n ko/en/ja/zh: barrel [lib/crowd/i18n.ts](lib/crowd/i18n.ts) re-exports sibling files (i18n-core/-terms/-spots/-districts/-ui-{ko,en,ja,zh}/-meta). New UI strings must be added to all four `i18n-ui-*` files (UIStrings type enforces at build). API queries always use Korean spot names as keys.
   - Tests: `tests/crowd-*.test.ts` (~45 cases) pin grade-derivation boundaries, parser traps (availLots=0, "만차", "-"), registry/caps consistency, i18n symmetry, exports, alert transitions. Heatmap collection: `.github/workflows/crowd-heatmap.yml` every 3h into the orphan `data` branch.
6. **광진 라이프 / 광진구 생활상황판** (`/gwangjin`) — the crowd dashboard itself locked to pseudo-city `gwangjin` (2026-08-10 rework; the earlier standalone card page is gone). `gwangjin` is a full `CITY_IDS` member = seoul RTD subset (6 spots incl. 광나루한강공원): adapter reuses `seoulFetchDetail`/`seoulFetchDisaster` with `detail.city:"seoul"` so extra/air/tour-events ride seoul plumbing; heatmap-client aliases gwangjin→seoul data file; hidden from /crowd's switcher via `SWITCH_CITY_IDS` (deep link ?city=gwangjin still works). `CrowdDashboard fixedCity` prop (via [components/gwangjin/client.tsx](components/gwangjin/client.tsx)) pins the city, hides the switcher (`CrowdHeader lockCity`), and `useCrowdData` ignores `?city=`. Gwangjin-only UI: map life-POI layer ([components/gwangjin/use-gwangjin-life.ts](components/gwangjin/use-gwangjin-life.ts) → `CrowdMap lifePois` — 따릉이/EV/무더위쉼터/지하철역(탭=도착 팝업, lazy fetch)/응급실(고정 좌표 HOSPITAL_COORDS), default layers station+er, toggles in map control stack) + list-bottom `extra` slot life board ([gwangjin-life-board.tsx](components/gwangjin/gwangjin-life-board.tsx): 지하철 전광판·응급/약국·생활인구·상권·행사·비/수위(우천 시 승격)·주차). Data adapters below unchanged: Adapters in [lib/gwangjin/](lib/gwangjin/) with "데이터 계약 실측" headers (2026-08-10): `constants.ts` (RTD spots 5+1, 8 stations with official sub-named keys — "아차산" alone returns INFO-200, 15 dong codes — 자양4동 is 11215847 not ...880, code order ≠ name order), `seoul-open.ts` (openapi.seoul.go.kr:8088 envelope helper; sample key caps 5 rows/call ERROR-335 — bulk fetchers fall back to ≤5), `subway.ts` (swopenapi arrivals, must post-filter by statnNm — sample key intermittently ignores the station filter), `emergency.ts` (E-Gen ER beds + pharmacies, XML regex parse, DATA_GO_KR_KEY + 활용신청 15000563/15000576 — verified live: hv10/hv11 are "Y" flags not numbers, fields vary per hospital, 186 Gwangjin pharmacies with dutyTime{1..8}s/c), `env-safety.ts` (rain 광진구청 10-min, 중랑천 성동교 water level vs PLAN_FLDE, RealtimeCityAir, GetParkingInfo — Gwangjin has exactly 1 live-linked lot, citydata_cmrcl 건대입구역 — response shape differs: LIVE_CMRCL_STTS not row), `life.ts` (따릉이 master join via tbCycleStationInfo STA_LOC, culturalEventInfo date positional + GUNAME post-filter, 생활인구 SPOP_LOCAL_RESD_DONG — hour param must be zero-padded "00", data lags ~10 days, EV getChargerInfo zscode=11215 verified live (328 stations) + addr re-filter, 무더위쉼터 = Seoul TbGtnHwcwP OA-21065 5-page scan + AREA_CD 11215 prefix (96 shelters w/ coords; MOIS data.go.kr HeatWaveShelter3/4/5 and safemap are ALL retired as of 2026-08 — don't resurrect them)). Routes `/api/gwangjin{,/subway,/care,/daily,/pop}` split by poll cadence; missing keys degrade to null → UI renders key-application links (KEY_GUIDES). Keys: `SEOUL_OPEN_KEY` (one key covers subway/bike/rain/river/air/parking/events/pop/cmrcl), `DATA_GO_KR_KEY` shared with crowd. RTD spot 아차산 is force-mapped to 광진구 in districts.ts (generator geocodes the peak to 구리시 — keep the manual line after regeneration).

## Development Commands

```bash
npm install      # Install dependencies (uses pnpm-lock.yaml but npm works)
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
```

## Environment Setup

Create `.env.local` with:
```
KAKAO_REST_API_KEY=your_kakao_rest_api_key
```

Get API key from [Kakao Developers](https://developers.kakao.com/) - create app, copy REST API key, add web platform with your domain.

## Architecture

### Tech Stack
- Next.js 15 (App Router) with React 19
- Tailwind CSS 4 + shadcn/ui components
- Leaflet.js for maps (loaded dynamically via CDN)
- xlsx library for Excel export

### Core Data Flow

1. **Client Component** ([components/address-generator.tsx](components/address-generator.tsx))
   - Main UI component handling user input, state management, batch processing
   - Calls API routes for address resolution
   - Supports Excel 2-column paste (address + facility name)

2. **Client-side Resolver** ([lib/utils/address-resolver.ts](lib/utils/address-resolver.ts))
   - `resolveAddressDisplay()` - cached address resolution for single lookups
   - Calls `/api/resolve-address` endpoint

3. **API Routes**
   - [app/api/resolve-address/route.ts](app/api/resolve-address/route.ts) - Single address lookup (full resolution with all formats)
   - [app/api/resolve-address-batch/route.ts](app/api/resolve-address-batch/route.ts) - Batch processing with adaptive rate limiting
   - [app/api/geocode/route.ts](app/api/geocode/route.ts) - Simple geocoding (returns only lat/lon) for Tableau Geocoder

4. **Kakao API Integration** ([lib/utils/kakao-api.ts](lib/utils/kakao-api.ts))
   - `resolveAddress()` - Main resolution function combining multiple Kakao APIs
   - `kakaoSearchAddress()` - Address search API
   - `kakaoKeywordSearch()` - Keyword/place search API
   - `kakaoCoord2Address()` - Coordinates to address
   - `kakaoCoord2Region()` - Coordinates to region (for admin dong)
   - `removeApartmentUnit()` - Extracts unit info (동/호) from address strings

### Address Resolution Strategy

The resolver uses a multi-step approach:
1. If input contains building keywords (학교, 병원, 주민센터, etc.) → try keyword search first
2. Try address search API
3. If address search fails → fallback to keyword search
4. Convert coordinates back to standardized address format

### Output Formats

`ResolvedDisplay` type contains:
- `display`: Formatted string like "광진구 아차산로 400(자양동 870, 자양2동)"
- `meta`: Structured data with gu, roadName, buildingNo, unit, legalDong, jibunNo, adminDong, postalCode, coordinates

### Path Aliases

Uses `@/*` mapping to project root (configured in tsconfig.json):
```typescript
import { Button } from "@/components/ui/button"
import { resolveAddress } from "@/lib/utils/kakao-api"
```

## Chrome Extension (`extension/`)

### Tech Stack
- Plasmo framework (Manifest V3), React 19, TypeScript, Tailwind CSS 3
- `@plasmohq/storage` for chrome.storage persistence

### Extension Commands
```bash
cd extension
npm install       # Install extension dependencies
npm run dev       # Dev mode with hot reload
npm run build     # Production build → build/chrome-mv3-prod
npm run package   # Package as .zip for distribution
```

### Structure
- **popup.tsx** - Main popup UI (single/batch conversion, 7 output formats, history, favorites)
- **background.ts** - Service worker (context menu, keyboard shortcut `Ctrl+Shift+C`, auto-detect handler)
- **content.ts** - Content script (clipboard address auto-detection on web pages)
- **options.tsx** - Settings page (API server, default format, map provider, notifications, auto-detect)
- **lib/api.ts** - API client (calls web app's `/api/resolve-address` and `/api/resolve-address-batch`)
- **lib/types.ts** - Types, constants, field labels/examples
- **lib/storage.ts** - History (max 20 + unlimited favorites), settings management
- **lib/format.ts** - Field value extraction for 7 output formats

### Key Features
- 7 output formats: 표준형식1, 표준형식2, 도로명주소, 지번주소, 행정동, 우편번호, 세부주소
- Context menu "표준주소 변환" on text selection
- Clipboard shortcut with desktop notification
- Content script auto-detection with Korean address regex pattern
- Independent popup window mode (stays open after clicking away)
- Configurable API base URL (defaults to https://gjdong.vercel.app)

## Key Implementation Details

- **Rate Limiting**: Batch API uses adaptive batch sizing (5-7 addresses) and delays (80-100ms) based on volume. Automatically reduces batch size and increases delays on high error rates.
- **Batch Chunking**: Client sends requests in chunks of 10 addresses with retry logic (max 2 retries per chunk)
- **Unit Extraction**: Complex regex in `removeApartmentUnit()` handles various Korean apartment unit formats (동/층/호)
- **Building Keywords**: `BUILDING_KEYWORDS` array triggers keyword search for places like 주민센터, 학교, 병원
- **Caching**: Client-side FIFO cache (100 entries max) in address-resolver.ts - evicts oldest entry when full
- **Map**: Leaflet loaded dynamically via CDN, supports batch markers with numbered pins
- **Excel Input**: Supports 2-column paste (address + facility name) detected via tab or 3+ spaces
- **Encoding Support**: Tableau Geocoder supports UTF-8, EUC-KR, CP949 for Korean CSV files
- **Facility Column Inference** ([lib/facility-column-inference.ts](lib/facility-column-inference.ts)): `parseFacilityTable()`/`parseFacilityText()` auto-detect address/name/serial/category columns from pasted or uploaded tables regardless of column order or header presence (header keyword matching first, then per-column data scoring for headerless tables). Detected category/admin-dong columns become dynamic filters in the dashboard. Covered by `tests/facility-column-inference.test.ts`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
