// 가로쓰레기통 배치 추천(데이터팀). map.json과 출처가 달라 파일을 따로 둔다.
// map.json은 비공개 저장소 export_dashboard.py가 통째로 다시 쓰기 때문에, 여기에 섞으면 다음 export에 지워진다.
import raw from "@/data/dumping/bin-recos.json"
import type { BinRecoData } from "./types"

export const BIN_RECOS = raw as unknown as BinRecoData
