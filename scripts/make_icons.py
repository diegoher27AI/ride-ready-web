"""Genera los iconos de la app a partir de un solo archivo SVG.

El icono es el anillo naranja (como los anillos de recuperacion del panel) con
el nombre adentro. Para cambiarlo, edita ICON_SVG aqui y corre:

    python3 scripts/make_icons.py

Necesita rsvg-convert (brew install librsvg).
"""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'icons'

BG = '#05070d'
O1, O2, O3 = '#FFD60A', '#FF9F0A', '#FF6B00'
WHITE = '#fff'

RING = f'''
  <circle cx="256" cy="256" r="178" fill="none" stroke="{O2}" stroke-width="4" opacity=".35"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="url(#g)" stroke-width="30"
          stroke-linecap="round" stroke-dasharray="820 943" transform="rotate(-90 256 256)"/>
  <circle cx="256" cy="106" r="17" fill="{WHITE}"/>'''

WORDS = f'''
  <text x="256" y="246" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif"
        font-weight="300" font-size="52" letter-spacing="9" fill="{WHITE}">RIDE</text>
  <text x="256" y="306" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif"
        font-weight="700" font-size="52" letter-spacing="9" fill="{O2}">READY</text>'''

DEFS = f'''
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="{O1}"/><stop offset="0.5" stop-color="{O2}"/><stop offset="1" stop-color="{O3}"/>
  </linearGradient></defs>'''


def svg(rounded: bool, scale: float = 1.0) -> str:
    """rounded: esquinas redondeadas (iOS ya recorta, pero el manifiesto las quiere).
    scale: para el icono 'maskable', todo mas chico para que Android no corte nada."""
    shape = f'<rect width="512" height="512" rx="110" fill="{BG}"/>' if rounded else f'<rect width="512" height="512" fill="{BG}"/>'
    inner = DEFS + RING + WORDS
    if scale != 1.0:
        off = 256 * (1 - scale)
        inner = DEFS + f'<g transform="translate({off:.1f} {off:.1f}) scale({scale})">{RING}{WORDS}</g>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">{shape}{inner}</svg>'


def write(name: str, size: int, source: str) -> None:
    tmp = OUT / '_tmp.svg'
    tmp.write_text(source)
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), str(tmp), '-o', str(OUT / name)], check=True)
    tmp.unlink()
    print(name, size)


OUT.mkdir(parents=True, exist_ok=True)
write('icon-192.png', 192, svg(rounded=True))
write('icon-512.png', 512, svg(rounded=True))
write('apple-touch-icon.png', 180, svg(rounded=True))
write('icon-maskable-512.png', 512, svg(rounded=False, scale=0.78))
(OUT / 'icon.svg').write_text(svg(rounded=True))
print('listo')
