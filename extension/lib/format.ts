import type { ResolvedDisplay, OutputField } from "./types"

export function getFieldValue(result: ResolvedDisplay, field: OutputField): string {
  if (result.fallback) return "변환 실패"

  const { meta } = result
  const fullBuildingNo = meta.unit
    ? `${meta.buildingNo} ${meta.unit}`
    : meta.buildingNo

  switch (field) {
    case "standard1":
      return `${meta.sido} ${result.display}`
    case "standard2":
      return result.display
    case "road":
      return meta.roadName
        ? `${meta.gu} ${meta.roadName}${fullBuildingNo}`
        : ""
    case "jibun":
      return meta.legalDong
        ? `${meta.gu} ${meta.legalDong} ${meta.jibunNo}`
        : ""
    case "adminDong":
      return meta.adminDong || ""
    case "postalCode":
      return meta.postalCode || ""
    case "unit":
      return meta.unit || ""
    default:
      return ""
  }
}
