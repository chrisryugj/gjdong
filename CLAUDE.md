# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Korean address converter tool using Kakao Local API. Converts addresses to standardized formats (road name, jibun, administrative dong) with map visualization. Three main surfaces:
1. **Main Converter** (`/`) - Single/batch address conversion with Excel export
2. **Tableau Geocoder** (`/tableau-geocoder`) - CSV/Excel file upload for bulk geocoding (adds lat/lon columns)
3. **Chrome Extension** (`extension/`) - Browser extension for instant address conversion (popup, right-click, shortcut, auto-detect)

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
- `display`: Formatted string like "광진구 아차산로400(자양동 870, 자양2동)"
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
