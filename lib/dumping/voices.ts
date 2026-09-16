// 답을 읽어 주는 목소리(Gemini TTS 프리셋). 30종 가운데 보고 톤에 맞는 것만 고른다. 이름은 API 값 그대로.
// 특성 설명은 Google 문서의 한 낱말 표기를 우리말로 옮긴 것이라 실제 인상은 미리 듣기로 확인한다
export interface VoiceOption {
  id: string
  label: string
  desc: string
}

export const DEFAULT_VOICE = "Kore"
export const VOICES: VoiceOption[] = [
  { id: "Kore", label: "코레", desc: "단단한 · 기본" },
  { id: "Charon", label: "카론", desc: "차분한 설명조" },
  { id: "Sadaltager", label: "사달타게르", desc: "박식한" },
  { id: "Orus", label: "오루스", desc: "단단한 · 낮은" },
  { id: "Aoede", label: "아오이데", desc: "산뜻한" },
  { id: "Leda", label: "레다", desc: "젊은" },
  { id: "Achird", label: "아키르드", desc: "친근한" },
  { id: "Vindemiatrix", label: "빈데미아트릭스", desc: "부드러운" },
  { id: "Puck", label: "퍽", desc: "경쾌한" },
  { id: "Enceladus", label: "엔셀라두스", desc: "숨결 섞인" },
]

export function isVoice(id: unknown): id is string {
  return typeof id === "string" && VOICES.some((v) => v.id === id)
}
