"""시드 파티의 커버 이미지를 생성한다.

웹에서 사진을 긁어오지 않고 직접 그린다. 남의 사진에는 저작권과 초상권이
붙고, 시드 데이터가 실서비스 화면에 그대로 올라가기 때문이다. 여기서 만드는
이미지는 사진이 아니라 카테고리 색과 파티 정보를 얹은 타이포그래피 카드다.

manifest.json(=generate-seed-images.mjs가 씀)을 읽어 out 디렉터리에 JPEG를
쓴다. 인자: build-images.py <manifest.json> <out-dir>
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1200, 800
FONT_PATH = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
FONT_REGULAR, FONT_MEDIUM, FONT_BOLD = 0, 2, 6

# 카테고리별 배경 그라디언트(위 → 아래)와 강조색.
PALETTE = {
    "솔로파티": ((122, 31, 75), (48, 12, 34), (255, 138, 178)),
    "로테이션 소개팅": ((26, 35, 126), (12, 16, 60), (140, 158, 255)),
    "혼술바": ((78, 52, 46), (32, 21, 18), (232, 168, 112)),
    "게스트하우스 파티": ((0, 80, 74), (0, 32, 30), (94, 226, 210)),
}
FALLBACK = ((38, 38, 42), (16, 16, 18), (200, 200, 210))


def font(size, index=FONT_REGULAR):
    return ImageFont.truetype(FONT_PATH, size, index=index)


def gradient(top, bottom):
    """세로 그라디언트. 한 줄짜리 이미지를 늘리는 편이 픽셀 루프보다 빠르다."""
    strip = Image.new("RGB", (1, HEIGHT))
    pixels = strip.load()
    for y in range(HEIGHT):
        t = y / (HEIGHT - 1)
        pixels[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return strip.resize((WIDTH, HEIGHT), Image.BILINEAR)


def add_texture(image, accent):
    """대각선 광원. 단색 그라디언트만 두면 50장이 전부 같은 카드로 보인다."""
    overlay = Image.new("RGB", (WIDTH, HEIGHT), (0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for i in range(-HEIGHT, WIDTH, 90):
        draw.line([(i, HEIGHT), (i + HEIGHT, 0)], fill=accent, width=26)
    return Image.blend(image, overlay, 0.05)


def wrap(draw, text, text_font, max_width):
    lines, line = [], ""
    for char in text:
        candidate = line + char
        if draw.textlength(candidate, font=text_font) <= max_width or line == "":
            line = candidate
        else:
            lines.append(line)
            line = char
    if line:
        lines.append(line)
    return lines


def rounded_chip(draw, xy, text, text_font, fill, color):
    x, y = xy
    width = draw.textlength(text, font=text_font)
    box = (x, y, x + width + 44, y + 58)
    draw.rounded_rectangle(box, radius=29, fill=fill)
    draw.text((x + 22, y + 14), text, font=text_font, fill=color)
    return box[2]


def build(entry, out_dir):
    top, bottom, accent = PALETTE.get(entry["category"], FALLBACK)
    image = add_texture(gradient(top, bottom), accent)
    draw = ImageDraw.Draw(image)

    margin = 80
    chip_font = font(30, FONT_MEDIUM)
    end = rounded_chip(draw, (margin, margin), entry["category"], chip_font, accent, bottom)
    rounded_chip(
        draw,
        (end + 16, margin),
        "승인제" if entry["admissionMode"] == "APPROVAL" else "즉시참가",
        chip_font,
        (255, 255, 255),
        bottom,
    )

    # 제목은 두 줄까지만. 세 줄이 되면 아래 정보 블록을 밀어낸다.
    title_font = font(66, FONT_BOLD)
    lines = wrap(draw, entry["title"], title_font, WIDTH - margin * 2)[:2]
    # 두 줄짜리 제목이 아래 블록을 밀지 않도록, 줄 수에 맞춰 시작점을 올린다.
    y = 330 - (len(lines) - 1) * 43
    for line in lines:
        draw.text((margin, y), line, font=title_font, fill=(255, 255, 255))
        y += 86

    draw.line([(margin, y + 26), (margin + 120, y + 26)], fill=accent, width=6)

    info_font = font(36, FONT_MEDIUM)
    draw.text(
        (margin, y + 66),
        f"{entry['location']} · {entry['placeName']}",
        font=info_font,
        fill=(255, 255, 255),
    )

    detail_font = font(32, FONT_REGULAR)
    draw.text(
        (margin, y + 120),
        f"정원 {entry['maxCapacity']}명 · 남 {entry['priceMale']:,}원 / 여 {entry['priceFemale']:,}원",
        font=detail_font,
        fill=(255, 255, 255),
    )

    brand_font = font(30, FONT_MEDIUM)
    brand = entry["businessName"]
    draw.text(
        (WIDTH - margin - draw.textlength(brand, font=brand_font), HEIGHT - margin - 12),
        brand,
        font=brand_font,
        fill=accent,
    )

    path = out_dir / f"{entry['slug']}.jpg"
    image.save(path, "JPEG", quality=86, optimize=True, progressive=True)
    return path


def main():
    if len(sys.argv) != 3:
        raise SystemExit("사용법: build-images.py <manifest.json> <out-dir>")
    manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    total = 0
    for entry in manifest:
        path = build(entry, out_dir)
        total += path.stat().st_size
        print(f"  + {path.name}  {path.stat().st_size // 1024}KB")
    print(f"이미지 {len(manifest)}장, 합계 {total // 1024}KB")


if __name__ == "__main__":
    main()
