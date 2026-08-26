"""Checks pmtiles show output covers the UK/Ireland extent recorded in issue 1.2."""
import re
import sys

text = open("show.txt").read()
m = re.search(
    r"bounds: \(long: ([-\d.]+), lat: ([-\d.]+)\) \(long: ([-\d.]+), lat: ([-\d.]+)\)",
    text,
)
if not m:
    sys.exit("::error::Could not parse bounds from pmtiles show output")

min_lon, min_lat, max_lon, max_lat = map(float, m.groups())
if not (min_lon < -13 and max_lon > 1 and min_lat < 51 and max_lat > 59):
    sys.exit(
        f"::error::Bounds ({min_lon},{min_lat})-({max_lon},{max_lat}) "
        "do not cover the expected UK/Ireland extent"
    )
print(f"Bounds OK: ({min_lon},{min_lat})-({max_lon},{max_lat})")
