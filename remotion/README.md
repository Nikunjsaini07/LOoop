# Readwell intro video

An 80-second, 1920 × 1080 Remotion introduction at 30 fps. The `ReadwellIntro` composition uses Readwell's bundled Cal Sans and Geist fonts, publisher logos, real article titles, and its dotted reading-surface texture.

## Preview and render

```sh
npm run video:studio
npm run video:render
```

The MP4 is written to `out/readwell-intro.mp4`. Remotion needs a Chrome/Chromium browser available for rendering. On Windows with Chrome installed, pass its executable explicitly if Remotion does not find it:

```sh
npx remotion render remotion/index.ts ReadwellIntro out/readwell-intro.mp4 --browser-executable "C:/Program Files/Google/Chrome/Application/chrome.exe"
```

## Story beats

- 0–8s: Introduce the problem and Readwell
- 8–20s: Unified engineering feed
- 20–33s: Search and topic discovery
- 33–45s: Publisher coverage
- 45–57s: Trending stories
- 57–68s: Personal library
- 68–75s: Reading payoff
- 75–80s: Brand close
