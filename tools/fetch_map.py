#!/usr/bin/env python3
"""Fetch the map background for a data set's marks: OpenStreetMap tiles with
the OpenSeaMap seamark overlay, stitched and cropped to the marks' extent in
Web Mercator, saved as an 8-bit PNG with a JSON sidecar recording exactly
what it covers and where it came from.

    python3 tools/fetch_map.py data/hyc/al-2025

Reads the `map` section of the directory's manifest.json. This is a manual
refresh step, not part of `regenerate.py`: the tiles change over time and the
committed background is what the rendered pages embed, so `--check` stays
reproducible offline. Tile use is a few dozen tiles once — within the
OpenStreetMap tile usage policy — and both sources require attribution,
which the sidecar carries and the renderer prints.
"""

import datetime
import io
import json
import math
import os
import sys
import time
import urllib.request

from PIL import Image

USER_AGENT = 'sailscoring-course-cards/0.1 (https://github.com/sailscoring/course-cards)'
LAYERS = {
    'osm': ('https://tile.openstreetmap.org/{z}/{x}/{y}.png', '© OpenStreetMap contributors'),
    'openseamap': ('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', '© OpenSeaMap contributors'),
}
TILE = 256


def mercator(lat, lng, zoom):
    """Web Mercator pixel coordinates at `zoom`."""
    n = 2 ** zoom * TILE
    x = (lng + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def stitch(template, zoom, tx0, ty0, tx1, ty1):
    sheet = Image.new('RGBA', ((tx1 - tx0 + 1) * TILE, (ty1 - ty0 + 1) * TILE), (0, 0, 0, 0))
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            tile = Image.open(io.BytesIO(fetch(template.format(z=zoom, x=tx, y=ty)))).convert('RGBA')
            sheet.paste(tile, ((tx - tx0) * TILE, (ty - ty0) * TILE))
            time.sleep(0.1)
    return sheet


def main():
    base = sys.argv[1]
    manifest = json.load(open(os.path.join(base, 'manifest.json')))
    cfg = manifest['map']
    marks = json.load(open(os.path.join(base, cfg['marks'])))['marks']
    positions = [m['position'] for m in marks if m.get('position')]
    zoom = cfg.get('zoom', 14)
    pad = cfg.get('paddingMinutes', 0.6) / 60
    mid_lat = (min(p['lat'] for p in positions) + max(p['lat'] for p in positions)) / 2
    k = math.cos(math.radians(mid_lat))
    south = min(p['lat'] for p in positions) - pad
    north = max(p['lat'] for p in positions) + pad
    west = min(p['lng'] for p in positions) - pad / k
    east = max(p['lng'] for p in positions) + pad / k

    x0, y0 = mercator(north, west, zoom)
    x1, y1 = mercator(south, east, zoom)
    tx0, ty0, tx1, ty1 = int(x0 // TILE), int(y0 // TILE), int(x1 // TILE), int(y1 // TILE)
    image = None
    for layer in cfg['layers']:
        template, _ = LAYERS[layer]
        sheet = stitch(template, zoom, tx0, ty0, tx1, ty1)
        image = sheet if image is None else Image.alpha_composite(image, sheet)
    crop = image.crop((round(x0 - tx0 * TILE), round(y0 - ty0 * TILE), round(x1 - tx0 * TILE), round(y1 - ty0 * TILE)))
    # 8-bit palette: the cartography is flat colour, so this is small and lossless enough.
    out = crop.convert('RGB').quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    png_path = os.path.join(base, cfg['background'])
    os.makedirs(os.path.dirname(png_path), exist_ok=True)
    out.save(png_path, optimize=True)
    sidecar = {
        'bounds': {'south': south, 'west': west, 'north': north, 'east': east},
        'projection': 'EPSG:3857',
        'zoom': zoom,
        'width': out.width,
        'height': out.height,
        'layers': cfg['layers'],
        'attribution': ' · '.join(LAYERS[l][1] for l in cfg['layers']),
        'fetched': datetime.date.today().isoformat(),
    }
    json.dump(sidecar, open(png_path[:-4] + '.json', 'w'), indent=2)
    print(f'{png_path}: {out.width}×{out.height}, {os.path.getsize(png_path) // 1024} KB')


if __name__ == '__main__':
    main()
