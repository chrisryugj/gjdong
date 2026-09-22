"""IBM Plex Sans KR 셀프호스팅 + gasp 패치 (2026-09-22, 윈도 폰트 깨짐).

Google Fonts가 주는 Plex Sans KR 슬라이스의 gasp 표는 {8:10, 16:5, 65535:15}다. 9~16ppem 구간 값 5는
그리드핏만 켜고 회색조 안티에일리어싱을 끈 값이라 윈도(DirectWrite)에서 10~16px 글자가 비트맵처럼
깨진다(플레이라이트 크로미움 실측, 600·700에서 두드러짐). next/font/google은 파일을 손댈 수 없어
슬라이스를 직접 받아 gasp를 {65535:15}(모든 크기 안티에일리어싱)로 고쳐 public/에 두고 CSS를 만든다.

실행: uv run --with fonttools --with brotli python scripts/patch-plex-kr-gasp.py
산출: public/fonts/plex-kr/*.woff2, app/dumping/plex-kr.css
"""
import io
import re
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "fonts" / "plex-kr"
OUT_CSS = ROOT / "app" / "dumping" / "plex-kr.css"
CSS_URL = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;600;700&display=swap"
# woff2 + unicode-range 슬라이스를 받으려면 최신 크롬 UA가 필요하다
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main() -> None:
    css = fetch(CSS_URL).decode("utf-8")
    faces = re.findall(r"@font-face\s*\{([^}]*)\}", css)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.woff2"):
        old.unlink()
    rules = []
    for body in faces:
        weight = re.search(r"font-weight:\s*(\d+)", body).group(1)
        url = re.search(r"url\(([^)]+)\)", body).group(1)
        urange = re.search(r"unicode-range:\s*([^;]+)", body).group(1).strip()
        name = url.rsplit("/", 1)[-1]  # 예: pxiGyp8kv8JHgFVrLPTucHtA.woff2 (구글 파일명 그대로, 슬라이스마다 다름)
        font = TTFont(io.BytesIO(fetch(url)))
        font["gasp"].gaspRange = {65535: 15}
        font.flavor = "woff2"
        font.save(OUT_DIR / name)
        rules.append(
            "@font-face{font-family:'IBM Plex Sans KR';font-style:normal;font-weight:%s;font-display:swap;"
            "src:url(/fonts/plex-kr/%s) format('woff2');unicode-range:%s}" % (weight, name, urange)
        )
    header = (
        "/* scripts/patch-plex-kr-gasp.py 산출물. 손으로 고치지 말 것.\n"
        "   Google Fonts IBM Plex Sans KR 400·600·700 슬라이스의 gasp를 고쳐 셀프호스팅한다(윈도 10~16px 깨짐). */\n"
    )
    var = ".plex-kr{--font-plex:'IBM Plex Sans KR'}\n"
    OUT_CSS.write_text(header + var + "\n".join(rules) + "\n", encoding="utf-8")
    print(f"{len(rules)} faces -> {OUT_DIR.relative_to(ROOT)}, {OUT_CSS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
