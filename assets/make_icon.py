"""Generates Gridstone's original launcher icons, adaptive foreground, splash images and store icon.
Art: faceted gem blocks in a 3x3 cluster (one gap) on a dark plum stone board. Pure Pillow, no external assets.
Run: python3 assets/make_icon.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter

S = 1024
BG_TOP, BG_BOT = (46, 30, 66), (14, 11, 22)       # plum -> near black
SPLASH = (18, 15, 26)                              # #120F1A
GEMS = {
    'ruby': ((255, 102, 128), (214, 36, 72), (120, 10, 36)),
    'sapphire': ((110, 170, 255), (40, 104, 232), (14, 42, 122)),
    'topaz': ((255, 226, 120), (238, 178, 34), (128, 80, 6)),
    'amethyst': ((204, 150, 255), (140, 72, 226), (62, 22, 118)),
    'emerald': ((120, 240, 170), (24, 176, 104), (6, 84, 50)),
}
LAYOUT = [['ruby', 'ruby', None], ['sapphire', 'topaz', 'topaz'], ['sapphire', 'emerald', 'amethyst']]


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vgrad(w, h, top, bot):
    im = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(im)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp(top, bot, y / max(1, h - 1)))
    return im


def background(size):
    im = vgrad(size, size, BG_TOP, BG_BOT)
    glow = Image.new('L', (size, size), 0)
    ImageDraw.Draw(glow).ellipse([size * 0.1, -size * 0.25, size * 0.9, size * 0.55], fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.08))
    im.paste(Image.new('RGB', (size, size), (120, 84, 170)), (0, 0), glow)
    return im


def gem(side, colors):
    """One faceted gem block, RGBA, side x side."""
    hi, mid, lo = colors
    im = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    r = int(side * 0.2)
    body = vgrad(side, side, hi, lo).convert('RGBA')
    m = Image.new('L', (side, side), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, side - 1, side - 1], r, fill=255)
    im.paste(body, (0, 0), m)
    d = ImageDraw.Draw(im)
    # inner table facet
    p = int(side * 0.2)
    table = vgrad(side - 2 * p, side - 2 * p, lerp(hi, (255, 255, 255), 0.25), mid).convert('RGBA')
    tm = Image.new('L', table.size, 0)
    ImageDraw.Draw(tm).rounded_rectangle([0, 0, table.size[0] - 1, table.size[1] - 1], int(r * 0.5), fill=255)
    im.paste(table, (p, p), tm)
    # bevel lines from corners to the table
    col = lerp(hi, (255, 255, 255), 0.4) + (110,)
    w = max(1, side // 60)
    for a, b in [((r * 0.45, r * 0.45), (p, p)), ((side - r * 0.45, r * 0.45), (side - p, p)),
                 ((r * 0.45, side - r * 0.45), (p, side - p)), ((side - r * 0.45, side - r * 0.45), (side - p, side - p))]:
        d.line([a, b], fill=col, width=w)
    # specular glint
    g = Image.new('L', (side, side), 0)
    ImageDraw.Draw(g).ellipse([p * 1.1, p * 1.0, p * 2.4, p * 1.7], fill=200)
    g = g.filter(ImageFilter.GaussianBlur(side * 0.03))
    im.paste(Image.new('RGBA', (side, side), (255, 255, 255, 255)), (0, 0), g)
    return im


def draw_art(canvas, scale, board=True):
    """Draw the gem cluster centered on canvas (RGBA)."""
    W = canvas.size[0]
    span = W * scale
    cell = span / 3
    gap = cell * 0.08
    side = int(cell - gap)
    x0 = (W - span) / 2
    y0 = (W - span) / 2
    if board:
        pad = cell * 0.16
        sh = Image.new('L', canvas.size, 0)
        ImageDraw.Draw(sh).rounded_rectangle([x0 - pad, y0 - pad + cell * 0.06, x0 + span + pad, y0 + span + pad + cell * 0.06], int(cell * 0.3), fill=150)
        canvas.paste(Image.new('RGBA', canvas.size, (0, 0, 0, 255)), (0, 0), sh.filter(ImageFilter.GaussianBlur(cell * 0.12)))
        d = ImageDraw.Draw(canvas)
        d.rounded_rectangle([x0 - pad, y0 - pad, x0 + span + pad, y0 + span + pad], int(cell * 0.3), fill=(30, 22, 44, 255), outline=(150, 118, 70, 255), width=max(2, int(cell * 0.03)))
    d = ImageDraw.Draw(canvas)
    for r, row in enumerate(LAYOUT):
        for c, name in enumerate(row):
            x = int(x0 + c * cell + gap / 2)
            y = int(y0 + r * cell + gap / 2)
            if name is None:
                d.rounded_rectangle([x, y, x + side, y + side], int(side * 0.2), fill=(20, 14, 30, 255))
                continue
            shadow = Image.new('L', canvas.size, 0)
            ImageDraw.Draw(shadow).rounded_rectangle([x, y + side * 0.06, x + side, y + side * 1.06], int(side * 0.2), fill=140)
            canvas.paste(Image.new('RGBA', canvas.size, (0, 0, 0, 255)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(side * 0.05)))
            g = gem(side, GEMS[name])
            canvas.alpha_composite(g, (x, y))


def rounded_mask(size, r):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], r, fill=255)
    return m


def main():
    root = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(root)
    res = os.path.join(repo, 'android/app/src/main/res')
    big = 2048
    full = background(big).convert('RGBA')
    draw_art(full, 0.66)
    full = full.convert('RGB').resize((S, S), Image.LANCZOS)
    full.save(os.path.join(root, 'icon-full.png'))
    for out in [os.path.join(root, 'play-store-icon-512.png'), os.path.join(repo, 'www/icon.png'), os.path.join(repo, 'store/icon-512.png')]:
        os.makedirs(os.path.dirname(out), exist_ok=True)
        full.resize((512, 512), Image.LANCZOS).save(out)
    # adaptive foreground (transparent), art within the 66/108 safe zone
    fg = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw_art(fg, 0.46)
    fg = fg.resize((432, 432), Image.LANCZOS)
    sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    fsizes = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
    for dens, px in sizes.items():
        d = os.path.join(res, 'mipmap-' + dens)
        sq = full.resize((px, px), Image.LANCZOS)
        out = Image.new('RGBA', (px, px), (0, 0, 0, 0))
        out.paste(sq, (0, 0), rounded_mask(px, int(px * 0.18)))
        out.save(os.path.join(d, 'ic_launcher.png'))
        rnd = Image.new('RGBA', (px, px), (0, 0, 0, 0))
        cm = Image.new('L', (px, px), 0)
        ImageDraw.Draw(cm).ellipse([0, 0, px - 1, px - 1], fill=255)
        rnd.paste(sq, (0, 0), cm)
        rnd.save(os.path.join(d, 'ic_launcher_round.png'))
        fg.resize((fsizes[dens], fsizes[dens]), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_foreground.png'))
    # legacy splash (Android < 12); Android 12+ shows the launcher icon on #120F1A
    splash_sizes = {
        'drawable': (480, 320),
        'drawable-land-mdpi': (480, 320), 'drawable-land-hdpi': (800, 480), 'drawable-land-xhdpi': (1280, 720),
        'drawable-land-xxhdpi': (1600, 960), 'drawable-land-xxxhdpi': (1920, 1280),
        'drawable-port-mdpi': (320, 480), 'drawable-port-hdpi': (480, 800), 'drawable-port-xhdpi': (720, 1280),
        'drawable-port-xxhdpi': (960, 1600), 'drawable-port-xxxhdpi': (1280, 1920),
    }
    logo = Image.new('RGBA', (big, big), SPLASH + (255,))
    draw_art(logo, 0.62)
    logo = logo.convert('RGB')
    for folder, (w, h) in splash_sizes.items():
        im = Image.new('RGB', (w, h), SPLASH)
        side = int(min(w, h) * 0.6)
        im.paste(logo.resize((side, side), Image.LANCZOS), ((w - side) // 2, (h - side) // 2))
        im.save(os.path.join(res, folder, 'splash.png'))
    print('icons + splash written')


if __name__ == '__main__':
    main()
