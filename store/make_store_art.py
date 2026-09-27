"""Builds the Play Store graphics from real in-game captures in store/raw/ (made by store/capture_screens.js).
  store/screenshots/01..06.png  1080x1920 captioned screenshots
  store/feature-graphic-1024x500.png
Run from the repo root: python3 store/make_store_art.py  (needs Pillow)"""
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'assets'))
import make_icon  # noqa: E402

FONT_DIR = '/usr/share/fonts/truetype/sand-box/google'
BOLD = os.path.join(FONT_DIR, 'Barlow Condensed/BarlowCondensed-ExtraBold.ttf')
MED = os.path.join(FONT_DIR, 'Barlow/Barlow-Medium.ttf')
GOLD = (240, 196, 92)

CAPTIONS = [
    ('01', '1-preview', 'DRAG. DROP. SHATTER.', 'Fill rows and columns on the 8x8 board'),
    ('02', '3-walnut-preview', 'ROW + COLUMN COMBOS', 'Clear several lines at once for huge points'),
    ('03', '9-over', 'CHASE YOUR BEST', 'Streak bonuses multiply every clear'),
    ('04', '7-shop', 'PREMIUM THEMES', 'Jewel, walnut, jade & more. Cosmetic only'),
    ('05', '6-marble', 'CALM, CLEAN, CLASSY', 'No timers. Think, place, relax'),
    ('06', '4-jade', 'FAIR PIECES EVERY TIME', 'Smart dealer avoids impossible sets. Plays offline'),
]


def bg(w, h):
    im = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(im)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=make_icon.lerp((50, 34, 72), (12, 10, 18), (y / h) ** 0.8))
    glow = Image.new('L', (w, h), 0)
    ImageDraw.Draw(glow).ellipse([w * 0.05, -h * 0.2, w * 0.95, h * 0.35], fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(min(w, h) * 0.08))
    im.paste(Image.new('RGB', (w, h), (130, 90, 180)), (0, 0), glow)
    return im.convert('RGBA')


def fit_font(path, text, max_w, start):
    size = start
    while size > 20:
        f = ImageFont.truetype(path, size)
        if f.getlength(text) <= max_w:
            return f
        size -= 4
    return ImageFont.truetype(path, size)


def rounded(im, r):
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], r, fill=255)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, (0, 0), m)
    return out


def screenshot(num, raw, title, sub):
    W, H = 1080, 1920
    canvas = bg(W, H)
    d = ImageDraw.Draw(canvas)
    ft = fit_font(BOLD, title, W - 120, 118)
    tw = ft.getlength(title)
    d.text(((W - tw) / 2, 70), title, font=ft, fill=(248, 244, 236))
    tb = d.textbbox(((W - tw) / 2, 70), title, font=ft)[3]
    d.rectangle([(W / 2 - 70, tb + 22), (W / 2 + 70, tb + 30)], fill=GOLD)
    fs = fit_font(MED, sub, W - 140, 50)
    sw = fs.getlength(sub)
    d.text(((W - sw) / 2, tb + 52), sub, font=fs, fill=(200, 190, 214))
    shot = Image.open(os.path.join(HERE, 'raw', raw + '.png')).convert('RGB')
    top = tb + 52 + fs.size + 56
    sh_h = H - top - 60
    sh_w = int(shot.width * sh_h / shot.height)
    shot = shot.resize((sh_w, sh_h), Image.LANCZOS)
    x = (W - sh_w) // 2
    shadow = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([x - 14, top + 6, x + sh_w + 14, top + sh_h + 34], 60, fill=(0, 0, 0, 170))
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(24)))
    frame = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle([x - 14, top - 14, x + sh_w + 14, top + sh_h + 14], 58, fill=(40, 30, 54, 255), outline=(150, 118, 70, 255), width=3)
    canvas = Image.alpha_composite(canvas, frame)
    canvas.alpha_composite(rounded(shot, 46), (x, top))
    out = os.path.join(HERE, 'screenshots', num + '.png')
    canvas.convert('RGB').save(out, optimize=True)
    return out


def feature():
    W, H = 1024, 500
    canvas = bg(W, H)
    art = Image.new('RGBA', (1200, 1200), (0, 0, 0, 0))
    make_icon.draw_art(art, 0.7)
    art = art.resize((470, 470), Image.LANCZOS).rotate(-8, resample=Image.BICUBIC, expand=False)
    canvas.alpha_composite(art, (W - 470 + 6, (H - 470) // 2))
    d = ImageDraw.Draw(canvas)
    f1 = ImageFont.truetype(BOLD, 122)
    f2 = ImageFont.truetype(BOLD, 58)
    f3 = ImageFont.truetype(MED, 30)
    d.text((56, 96), 'GRIDSTONE', font=f1, fill=GOLD)
    d.text((60, 244), 'BLOCK PUZZLE 8x8', font=f2, fill=(244, 240, 250))
    d.rectangle([(62, 330), (192, 336)], fill=GOLD)
    d.text((60, 356), 'Drag, drop & clear lines', font=f3, fill=(206, 196, 220))
    d.text((60, 396), 'Gem & wood themes · plays offline', font=f3, fill=(160, 150, 178))
    out = os.path.join(HERE, 'feature-graphic-1024x500.png')
    canvas.convert('RGB').save(out, optimize=True)
    return out


if __name__ == '__main__':
    os.makedirs(os.path.join(HERE, 'screenshots'), exist_ok=True)
    for c in CAPTIONS:
        print(screenshot(*c))
    print(feature())
