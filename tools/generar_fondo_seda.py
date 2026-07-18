#!/usr/bin/env python
"""Genera los fondos de seda del sitio (haces de luz blanco/negro en las esquinas).

Uso:
    pip install pillow
    python tools/generar_fondo_seda.py

Salida:
    assets/img/bg-silk.jpg    (1920x1200, escritorio ~16:9)
    assets/img/bg-silk-m.jpg  (700x1400, móvil ~proporción teléfono)

Ajusta ANG (ángulo de los haces), las listas `beams` (centro, sigma, pico)
o las posiciones de los núcleos al final, y vuelve a ejecutar.
"""
from PIL import Image, ImageDraw, ImageChops, ImageFilter
import math

ANG = 35  # ángulo de los haces en grados (suben hacia la esquina)


def make_beams(m, n, beams, falloff=1.35):
    """Haces con perfil gaussiano perpendicular + rampa de caída a lo largo."""
    layer = Image.new('L', (m, n), 0)
    px = layer.load()
    for y in range(n):
        v = 0.0
        for (c, sigma, peak) in beams:
            d = (y - c) / sigma
            v += peak * math.exp(-d * d)
        vv = min(255, int(v * 255))
        for x in range(m):
            px[x, y] = vv
    ramp = Image.new('L', (m, n), 0)
    rd = ImageDraw.Draw(ramp)
    for x in range(m):
        t = x / (m - 1)
        a = min(1.0, t / 0.06) * max(0.0, 1.0 - t) ** falloff  # arranque suave + caída
        rd.line([(x, 0), (x, n)], fill=int(a * 255))
    return ImageChops.multiply(layer, ramp)


def feather(layer, f=90):
    """Difumina los bordes de la capa para que no se vean cortes al pegarla."""
    m = Image.new('L', layer.size, 0)
    d = ImageDraw.Draw(m)
    d.rectangle([f, f, layer.width - f, layer.height - f], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(f / 2))
    return ImageChops.multiply(layer, m)


def bright_point(m, n, ang):
    """Posición del extremo brillante (x=0) tras rotar con expand=True."""
    a = math.radians(ang)
    nx = -(m / 2) * math.cos(a)
    ny = (m / 2) * math.sin(a)
    wm = abs(m * math.cos(a)) + abs(n * math.sin(a))
    hm = abs(m * math.sin(a)) + abs(n * math.cos(a))
    return (wm / 2 + nx, hm / 2 + ny)


# Haces del cluster superior derecho e inferior izquierdo (compartidos)
TR_BEAMS = [
    (230, 95, 0.30),   # velo exterior
    (380, 40, 1.00),   # núcleo principal
    (480, 75, 0.42),
    (610, 32, 0.65),   # segunda veta
    (710, 60, 0.34),
    (830, 28, 0.50),   # tercera veta
]
BL_BEAMS = [
    (380, 130, 0.55),
    (545, 50, 0.32),
    (680, 95, 0.20),
]

TR_LAYER = feather(make_beams(2600, 1000, TR_BEAMS).rotate(ANG, expand=True, resample=Image.BICUBIC))
BL_LAYER = feather(make_beams(2400, 900, BL_BEAMS).rotate(ANG, expand=True, resample=Image.BICUBIC))
TR_BP = bright_point(2600, 1000, ANG)
BL_BP = bright_point(2400, 900, ANG)


def render(w, h, tr_core, bl_core, out):
    lay = Image.new('L', (w, h), 0)
    lay.paste(TR_LAYER, (int(tr_core[0] - TR_BP[0]), int(tr_core[1] - TR_BP[1])))
    lay2 = Image.new('L', (w, h), 0)
    lay2.paste(BL_LAYER, (int(bl_core[0] - BL_BP[0]), int(bl_core[1] - BL_BP[1])))
    lay = ImageChops.lighter(lay, lay2)
    noise = Image.effect_noise((w, h), 16)  # grano de película
    lay = ImageChops.add(lay, noise.point(lambda v: max(0, (v - 128) // 6)))
    silk = Image.merge('RGB', (lay, lay, lay))
    silk.save(out, quality=86, optimize=True)
    print('generado', out, silk.size)


if __name__ == '__main__':
    # (x, y) del núcleo brillante en cada lienzo
    render(1920, 1200, tr_core=(1900, 60), bl_core=(20, 1170), out='assets/img/bg-silk.jpg')
    render(700, 1400, tr_core=(672, 80), bl_core=(28, 1332), out='assets/img/bg-silk-m.jpg')
