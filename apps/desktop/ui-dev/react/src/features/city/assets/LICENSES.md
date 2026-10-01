# City assets — sources and licenses

Every file in this folder is listed here; `scripts/verify-react-city-assets.mjs` fails if a file
is missing from this table or if the folder exceeds the 5 MB budget. All files ship inside the
app bundle; nothing is fetched at runtime.

Files were downscaled to 512 px (ground / facade / normals) or 2048×1024 (skies) and re-encoded
as JPEG with macOS `sips`. HDR skies were tone-mapped (ACES, exposure noted) to 8-bit before
encoding — no `.hdr` file is shipped.

| File | Source asset | Author / site | License | Processing |
| --- | --- | --- | --- | --- |
| `sky-day.jpg` | `kloofendal_48d_partly_cloudy_puresky` (2K HDR) | Poly Haven — polyhaven.com | CC0 1.0 | ACES, exposure 1.0 → 2048×1024 q80 |
| `sky-dusk.jpg` | `kloppenheim_06_puresky` (2K HDR) | Poly Haven — polyhaven.com | CC0 1.0 | ACES, exposure 0.45 → 2048×1024 q80 |
| `ground-asphalt-02-color.jpg` / `-normal.jpg` | `asphalt_02` (1K diffuse, normal GL) | Poly Haven | CC0 1.0 | 512 q76 / q80 |
| `ground-concrete-pavement-02-color.jpg` / `-normal.jpg` | `concrete_pavement_02` | Poly Haven | CC0 1.0 | 512 q76 / q80 |
| `ground-coast-sand-01-color.jpg` / `-normal.jpg` | `coast_sand_01` | Poly Haven | CC0 1.0 | 512 q76 / q80 |
| `ground-brown-mud-02-color.jpg` / `-normal.jpg` | `brown_mud_02` | Poly Haven | CC0 1.0 | 512 q76 / q80 |
| `ground-aerial-grass-rock-color.jpg` / `-normal.jpg` | `aerial_grass_rock` | Poly Haven | CC0 1.0 | 512 q76 / q80 |
| `facade-glass.jpg` | `Facade001` (1K color) | ambientCG — ambientcg.com | CC0 1.0 | 512 q78 |
| `facade-commercial.jpg` | `Facade002` (1K color) | ambientCG | CC0 1.0 | 512 q78 |
| `facade-banded.jpg` | `Facade006` (1K color) | ambientCG | CC0 1.0 | 512 q78 |
| `stucco-normal.jpg` | `PaintedPlaster006` (1K normal GL; color map not used) | ambientCG | CC0 1.0 | 512 q78 |
| `water-normal.jpg` | `examples/textures/waternormals.jpg` | three.js — github.com/mrdoob/three.js | MIT (three.js authors) | 512 q80 |
