# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Korean address converter tool using Kakao Local API. Converts addresses to standardized formats (road name, jibun, administrative dong) with map visualization. Supports single address lookup and batch conversion with Excel export.

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
   - [app/api/resolve-address/route.ts](app/api/resolve-address/route.ts) - Single address lookup
   - [app/api/resolve-address-batch/route.ts](app/api/resolve-address-batch/route.ts) - Batch processing with adaptive rate limiting

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

## Key Implementation Details

- **Rate Limiting**: Batch API uses adaptive batch sizing (5-7 addresses) and delays (80-100ms) based on volume
- **Unit Extraction**: Complex regex in `removeApartmentUnit()` handles various Korean apartment unit formats (동/층/호)
- **Building Keywords**: `BUILDING_KEYWORDS` array triggers keyword search for places like 주민센터, 학교, 병원
- **Caching**: Client-side LRU cache (100 entries) in address-resolver.ts
- **Map**: Leaflet loaded dynamically, supports batch markers with numbered pins
