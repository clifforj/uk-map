// TILE_HOSTNAME is substituted for local testing (see client/serve.sh) from a
// hostname you supply yourself — see docs/decisions/003-cloudflare-domain.md.
// In this committed source it stays a placeholder so the real hostname is never
// checked into the (public) repo.
const TILE_HOSTNAME = "__TILE_HOSTNAME__";

async function main() {
  const latest = await fetch(`https://${TILE_HOSTNAME}/latest.json`, { cache: "no-store" }).then(
    (r) => r.json()
  );

  const styleText = await fetch("style.json").then((r) => r.text());
  const style = JSON.parse(
    styleText
      .replaceAll("__TILE_HOSTNAME__", TILE_HOSTNAME)
      .replaceAll("__VERSION__", latest.version)
  );

  const map = new maplibregl.Map({
    container: "map",
    style,
    center: [-2.5, 54.5], // roughly the centre of the UK
    zoom: 5,
    attributionControl: false, // added explicitly below, uncollapsed
  });

  map.addControl(new maplibregl.AttributionControl({ compact: false }));
  map.addControl(new maplibregl.NavigationControl());
}

main().catch((err) => {
  document.getElementById("map").textContent = `Failed to load map: ${err}`;
  throw err;
});
