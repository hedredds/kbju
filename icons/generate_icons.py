"""Generate PWA icons for KBJU app using Pillow.
Monochrome glassmorphism style: dark rounded-square tile with a white ring
(calorie progress ring motif) matching the app's design system.
Run: python generate_icons.py
"""
from PIL import Image, ImageDraw

BG = (15, 15, 15, 255)      # --text (#0f0f0f) used as icon background
FG = (245, 245, 245, 255)   # --bg (#F5F5F5) used as ring/foreground color


def rounded_square(size, radius_ratio=0.22):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = int(size * radius_ratio)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BG)
    return img, draw


def draw_ring(draw, size, maskable=False):
    # Leave extra safe-zone padding for maskable icons
    pad_ratio = 0.26 if maskable else 0.18
    pad = size * pad_ratio
    bbox = [pad, pad, size - pad, size - pad]
    stroke = max(int(size * 0.07), 6)
    # background track (subtle)
    draw.ellipse(bbox, outline=(245, 245, 245, 60), width=stroke)
    # progress arc ~72% (CalZen-like ring)
    start_angle = -90
    end_angle = start_angle + 360 * 0.72
    draw.arc(bbox, start=start_angle, end=end_angle, fill=FG, width=stroke)


def make_icon(size, maskable=False):
    img, draw = rounded_square(size, radius_ratio=0.0 if maskable else 0.22)
    draw_ring(draw, size, maskable=maskable)
    return img


def main():
    specs = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-192-maskable.png", 192, True),
        ("icon-512-maskable.png", 512, True),
    ]
    for filename, size, maskable in specs:
        icon = make_icon(size, maskable=maskable)
        icon.save(filename)
        print(f"Saved {filename} ({size}x{size}, maskable={maskable})")


if __name__ == "__main__":
    main()
