"""Prints (name, z, x, y) tuples for the locations spot-checked by hand in issue 1.2,
across a spread of zooms, using the standard slippy-map Web Mercator tile formula.
"""
import math

LOCATIONS = [
    ("Central London", 51.5074, -0.1278),
    ("Scottish Highlands", 57.1497, -4.8353),
    ("Aberystwyth", 52.4153, -4.0829),
    ("Belfast", 54.5973, -5.9301),
]
ZOOMS = [0, 5, 10, 14]


def tile_xy(lat, lon, z):
    lat_rad = math.radians(lat)
    n = 2**z
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


for name, lat, lon in LOCATIONS:
    for z in ZOOMS:
        x, y = tile_xy(lat, lon, z)
        print(f"{name}\t{z}\t{x}\t{y}")
