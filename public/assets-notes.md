# Scroll website assets

Prepared on 18 October 2026. These assets are local: the running page does not contact a font CDN.

## Fonts

Both files are the Latin upright variable WOFF2 subsets returned by the official Google Fonts CSS API, using a current Chrome user agent.

- `fonts/newsreader-latin.woff2`: Newsreader, weight 200–800, optical size 6–72 requested. 132,000 bytes. License: `fonts/Newsreader-OFL.txt` (SIL Open Font License 1.1).
- `fonts/instrument-sans-latin.woff2`: Instrument Sans, weight 400–700, normal width. 30,092 bytes. License: `fonts/InstrumentSans-OFL.txt` (SIL Open Font License 1.1).

CSS source: <https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400..700&family=Newsreader:opsz,wght@6..72,200..800&display=swap>

Official binary sources:

- <https://fonts.gstatic.com/s/newsreader/v26/cY9AfjOCX1hbuyalUrK4397yjA.woff2>
- <https://fonts.gstatic.com/s/instrumentsans/v4/pxiTypc9vsFDm051Uf6KVwgkfoSxQ0GsQv8ToedPibnr0SZe1Q.woff2>

License sources:

- <https://raw.githubusercontent.com/google/fonts/main/ofl/newsreader/OFL.txt>
- <https://raw.githubusercontent.com/google/fonts/main/ofl/instrumentsans/OFL.txt>

Declare `font-style: normal`, the actual weight ranges, `font-display: swap`, and `font-optical-sizing: auto` for Newsreader. Other character sets use system fallbacks. No italic file is bundled, so avoid synthetic italic styling.

## Parchment texture

`textures/parchment.png`: 1,254 × 1,254, 2,618,902 bytes. Generated with the built-in image generator, then copied into this project without image editing. Visually inspected for no text, no edge vignette, and a subtle archival paper surface. Use it as a decorative repeating material layer at restrained opacity with a solid `#F0E3C7` background. The image is not essential to content or interaction; the background color is its fallback. Seamlessness is a generated visual intention, not a mathematically verified edge constraint.

Final generation prompt:

> Use case: historical-scene. Asset type: seamless paper material texture for a real reading website, to be repeated subtly behind text. A perfectly flat, straight-on square scan of pale aged historical parchment paper. Entire image is only paper material, from edge to edge. Fine organic fibers, extraordinarily subtle irregular warm tan mottling and a few extremely faint age freckles. High-end archival handmade paper, quiet and elegant. No directional lighting, consistent brightness across the entire image. Seamless tileable appearance at all edges, uniformly pale color. Predominantly light warm ivory tan #F0E3C7, very subtle fibers #DDCBA7, extremely low contrast. No orange or dark brown patches. Material fills frame, no objects or page boundary. No text, writing, ink, calligraphy, symbols, drawings, borders, outlines, folds, rolled edges, burnt edges, torn edges, creases, shadows, vignette, 3D scene, rulers, hands, or watermark. Neutral raster material, not a mockup or website screenshot. 1024 by 1024 square requested.
