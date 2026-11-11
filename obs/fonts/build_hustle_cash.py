# "Hustle Cash": an original heavy, condensed, slanted display face for money amounts.
# Glyphs are built from chamfered blocks (shapely), skewed, and written as CFF outlines.
import sys
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from shapely import affinity
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen

H, W, X0 = 720, 360, 30         # digit height, body width, left side bearing
ADV = W + 2 * X0
SV, SH = 122, 112               # stem and bar thickness
C = 46                          # outer corner chamfer
MID = H / 2
SLANT = 0.16

def R(x1, y1, x2, y2): return box(x1, y1, x2, y2)

def chamfer_clip(x1, y1, x2, y2, c=C):
    return Polygon([(x1 + c, y1), (x2 - c, y1), (x2, y1 + c), (x2, y2 - c),
                    (x2 - c, y2), (x1 + c, y2), (x1, y2 - c), (x1, y1 + c)])

L, Rt = X0, X0 + W
top    = R(L, H - SH, Rt, H)
bot    = R(L, 0, Rt, SH)
mid    = R(L, MID - SH / 2, Rt, MID + SH / 2)
lu     = R(L, MID - SH / 2, L + SV, H)
ll     = R(L, 0, L + SV, MID + SH / 2)
ru     = R(Rt - SV, MID - SH / 2, Rt, H)
rl     = R(Rt - SV, 0, Rt, MID + SH / 2)
lf, rf = R(L, 0, L + SV, H), R(Rt - SV, 0, Rt, H)

def digit(*parts, clip=True):
    g = unary_union(parts)
    return g.intersection(chamfer_clip(L, 0, Rt, H)) if clip else g

glyphs = {
    'zero':  digit(top, bot, lf, rf, Polygon([(L + SV, SH + 40), (L + SV + 50, SH), (Rt - SV, H - SH - 40), (Rt - SV - 50, H - SH)])),
    'one':   unary_union([R(L + 140, 0, L + 140 + SV + 10, H),
                          Polygon([(L + 10, H - 200), (L + 140, H), (L + 150, H - 10), (L + 150, H - 250), (L + 10, H - 330)]),
                          R(L + 50, 0, Rt - 20, SH - 10)]).intersection(chamfer_clip(L, 0, Rt, H, 30)),
    'two':   digit(top, ru, mid, ll, bot),
    'three': digit(top, R(L + 90, MID - SH / 2, Rt, MID + SH / 2), bot, rf),
    'four':  unary_union([R(Rt - SV - 10, 0, Rt - 10, H), R(L, MID - 90 - SH / 2, Rt, MID - 90 + SH / 2),
                          Polygon([(L, MID - 90), (L + SV, MID - 90), (L + SV + 40, H), (L + 40, H)])]).intersection(chamfer_clip(L, 0, Rt, H)),
    'five':  digit(top, lu, mid, rl, bot),
    'six':   digit(top, lf, mid, rl, bot),
    'seven': digit(top, Polygon([(Rt - SV, H - SH), (Rt, H - SH), (L + 200, 0), (L + 200 - SV - 10, 0)]), R(Rt - SV, H - SH - 60, Rt, H)),
    'eight': digit(top, bot, mid, lf, rf),
    'nine':  digit(top, lu, mid, rf, bot),
}
# Dollar: a narrower "S" with a bar through it that sticks out top and bottom.
s = unary_union([top, lu, mid, rl, bot]).intersection(chamfer_clip(L, 0, Rt, H))
s = affinity.scale(s, 0.86, 0.86, origin=((L + Rt) / 2, MID))
cx = (L + Rt) / 2
glyphs['dollar'] = unary_union([s, R(cx - 34, -70, cx + 34, H + 70)])
glyphs['comma'] = Polygon([(40, SH + 20), (40 + SV, SH + 20), (40 + SV - 20, -60), (40 + 20, -150), (40 + 30, -10), (40, -10)])
glyphs['period'] = chamfer_clip(40, 0, 40 + SV, SH + 10, 20)
glyphs['minus'] = R(L, MID - SH / 2, Rt, MID + SH / 2)
glyphs['plus'] = unary_union([R(L, MID - SH / 2, Rt, MID + SH / 2), R(cx - SH / 2, MID - 150, cx + SH / 2, MID + 150)])

adv = {g: ADV for g in glyphs}
adv['comma'] = adv['period'] = 40 + SV + 30
adv['dollar'] = ADV
adv['space'] = 200

def ring_points(ring, clockwise):
    pts = list(ring.coords)[:-1]
    # Signed area: positive = counter-clockwise
    a = sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]))
    if (a > 0) == clockwise: pts.reverse()
    return pts

def draw(geom, pen):
    polys = getattr(geom, 'geoms', [geom])
    for p in polys:
        if p.is_empty: continue
        p = affinity.skew(p, xs=SLANT * 57.2958, origin=(0, 0))  # degrees
        for ring, cw in [(p.exterior, False)] + [(i, True) for i in p.interiors]:  # CFF: outer CCW
            pts = [(round(x), round(y)) for x, y in ring_points(ring, cw)]
            pen.moveTo(pts[0])
            for q in pts[1:]: pen.lineTo(q)
            pen.closePath()

order = ['.notdef', 'space'] + list(glyphs)
cmap = {ord(c): n for c, n in zip('0123456789', ['zero','one','two','three','four','five','six','seven','eight','nine'])}
cmap.update({ord('$'): 'dollar', ord(','): 'comma', ord('.'): 'period', ord('-'): 'minus', ord('+'): 'plus', 32: 'space'})

fb = FontBuilder(1000, isTTF=False)
fb.setupGlyphOrder(order)
fb.setupCharacterMap(cmap)
charstrings, metrics = {}, {}
for name in order:
    pen = T2CharStringPen(adv.get(name, 500), None)
    if name in glyphs: draw(glyphs[name], pen)
    charstrings[name] = pen.getCharString()
    metrics[name] = (adv.get(name, 500), 0)
fam = 'Hustle Cash'
fb.setupCFF('HustleCash-Black', {'FullName': fam + ' Black'}, charstrings, {})
fb.setupHorizontalMetrics(metrics)
fb.setupHorizontalHeader(ascent=900, descent=-200)
fb.setupNameTable({'familyName': fam, 'styleName': 'Black', 'uniqueFontIdentifier': 'HustleCash-Black-1.0',
                   'fullName': fam + ' Black', 'psName': 'HustleCash-Black', 'version': 'Version 1.000',
                   'copyright': 'Original design, made for Minimap Nav and the HUD overlay.'})
fb.setupOS2(sTypoAscender=900, sTypoDescender=-200, usWinAscent=900, usWinDescent=200, usWeightClass=900, sxHeight=500, sCapHeight=H)
fb.setupPost()
fb.save(sys.argv[1])
print('saved', sys.argv[1])
