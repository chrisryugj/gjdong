/**
 * 지도 툴팁 마크업 → DOM 조각. maplibre `Popup.setHTML` 은 라이브러리 살균기(DOM.sanitize)에 기대는데, 그 살균기 우회 취약점
 * (GHSA-jrc7-96c5-q579, 5.x, 6.4.1 에서 수정)이 있었다. 판을 올린 뒤에도 살균기에 기대지 않도록 `setDOMContent` 로 넘긴다.
 * 마크업은 앱의 툴팁 함수가 만들고 그 안의 글은 전부 이스케이프돼 있다(dumping map-geo `escapeHtml`, snow map-geo `esc`).
 * 조각이라 팝업 안 구조(.snow-tip·.dump-bartip)는 setHTML 때와 같다
 */
export function tipNode(html: string): DocumentFragment {
  const frag = document.createDocumentFragment()
  frag.append(...Array.from(new DOMParser().parseFromString(html, "text/html").body.childNodes))
  return frag
}
