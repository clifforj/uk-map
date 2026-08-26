"""Checks the staged archive's vector_layers cover every layer id declared in shortbread.yml."""
import json
import sys

meta = json.load(open("metadata.json"))
actual = sorted(layer["id"] for layer in meta.get("vector_layers", []))
expected = sorted(line.strip() for line in open("expected-layers.txt") if line.strip())

missing = sorted(set(expected) - set(actual))
if missing:
    sys.exit(f"::error::Archive is missing expected layers: {missing}")

print(f"Layer check OK: {len(actual)} layers present, all {len(expected)} expected layers found")
