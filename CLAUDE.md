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
   - Jeju source protection is a hard constraint (2026-08 blocking incident): 15-min cache/polling, no ops detail fan-out, no hidden-tab polling; datacenter IPs get empty replies so prod reads the `data-jeju` snapshot branch published by a home-network collector (`scripts/collect-jeju.ts`).
   - i18n ko/en/ja/zh: barrel [lib/crowd/i18n.ts](lib/crowd/i18n.ts) re-exports sibling files (i18n-core/-terms/-spots/-districts/-ui-{ko,en,ja,zh}/-meta). New UI strings must be added to all four `i18n-ui-*` files (UIStrings type enforces at build). API queries always use Korean spot names as keys.
   - Tests: `tests/crowd-*.test.ts` (~45 cases) pin grade-derivation boundaries, parser traps (availLots=0, "만차", "-"), registry/caps consistency, i18n symmetry, exports, alert transitions. Heatmap collection: `.github/workflows/crowd-heatmap.yml` every 3h into the orphan `data` branch.

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
