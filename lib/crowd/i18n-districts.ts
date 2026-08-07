// 자치구(구·시·군) 명칭 외국어 표기 [en, ja, zh-CN] — districts.ts의 값 전수를 커버한다.
// 서울·부산의 "중구"처럼 도시 간 동명 구는 번역도 동일해 한 항목으로 충분하다.

import { pick, type Lang } from "./i18n-core"

export const DISTRICT_T: Record<string, [string, string, string]> = {
  // ── 서울 (+경계 인접 시)
  강남구: ["Gangnam-gu", "江南区", "江南区"],
  강동구: ["Gangdong-gu", "江東区", "江东区"],
  강북구: ["Gangbuk-gu", "江北区", "江北区"],
  강서구: ["Gangseo-gu", "江西区", "江西区"],
  과천시: ["Gwacheon-si", "果川市", "果川市"],
  관악구: ["Gwanak-gu", "冠岳区", "冠岳区"],
  광진구: ["Gwangjin-gu", "広津区", "广津区"],
  구로구: ["Guro-gu", "九老区", "九老区"],
  구리시: ["Guri-si", "九里市", "九里市"],
  금천구: ["Geumcheon-gu", "衿川区", "衿川区"],
  노원구: ["Nowon-gu", "蘆原区", "芦原区"],
  도봉구: ["Dobong-gu", "道峰区", "道峰区"],
  동대문구: ["Dongdaemun-gu", "東大門区", "东大门区"],
  동작구: ["Dongjak-gu", "銅雀区", "铜雀区"],
  마포구: ["Mapo-gu", "麻浦区", "麻浦区"],
  서대문구: ["Seodaemun-gu", "西大門区", "西大门区"],
  서초구: ["Seocho-gu", "瑞草区", "瑞草区"],
  성동구: ["Seongdong-gu", "城東区", "城东区"],
  성북구: ["Seongbuk-gu", "城北区", "城北区"],
  송파구: ["Songpa-gu", "松坡区", "松坡区"],
  양천구: ["Yangcheon-gu", "陽川区", "阳川区"],
  영등포구: ["Yeongdeungpo-gu", "永登浦区", "永登浦区"],
  용산구: ["Yongsan-gu", "龍山区", "龙山区"],
  은평구: ["Eunpyeong-gu", "恩平区", "恩平区"],
  종로구: ["Jongno-gu", "鍾路区", "钟路区"],
  중구: ["Jung-gu", "中区", "中区"],
  // ── 부산
  금정구: ["Geumjeong-gu", "金井区", "金井区"],
  기장군: ["Gijang-gun", "機張郡", "机张郡"],
  남구: ["Nam-gu", "南区", "南区"],
  동구: ["Dong-gu", "東区", "东区"],
  부산진구: ["Busanjin-gu", "釜山鎮区", "釜山镇区"],
  사하구: ["Saha-gu", "沙下区", "沙下区"],
  서구: ["Seo-gu", "西区", "西区"],
  수영구: ["Suyeong-gu", "水営区", "水营区"],
  영도구: ["Yeongdo-gu", "影島区", "影岛区"],
  해운대구: ["Haeundae-gu", "海雲台区", "海云台区"],
  // ── 강원(동해안)
  강릉시: ["Gangneung-si", "江陵市", "江陵市"],
  고성군: ["Goseong-gun", "高城郡", "高城郡"],
  동해시: ["Donghae-si", "東海市", "东海市"],
  삼척시: ["Samcheok-si", "三陟市", "三陟市"],
  속초시: ["Sokcho-si", "束草市", "束草市"],
  양양군: ["Yangyang-gun", "襄陽郡", "襄阳郡"],
  평창군: ["Pyeongchang-gun", "平昌郡", "平昌郡"],
  // ── 제주
  제주시: ["Jeju-si", "済州市", "济州市"],
  서귀포시: ["Seogwipo-si", "西帰浦市", "西归浦市"],
}

export const trDistrict = (name: string, lang: Lang) => pick(DISTRICT_T, name, lang)
