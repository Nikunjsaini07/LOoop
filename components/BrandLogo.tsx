/** Frame only the supplied book symbol, keeping the original artwork intact. */
export default function BrandLogo() {
  return <svg className="brand-mark" viewBox="250 345 230 320" aria-hidden="true" focusable="false">
    <defs>
      <filter id="readwell-ink" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values="0 0 0 0 .09  0 0 0 0 .09  0 0 0 0 .09  -.2126 -.7152 -.0722 0 1" />
      </filter>
    </defs>
    <image href="/brand/readwell-original.png" width="1536" height="1024" filter="url(#readwell-ink)" />
  </svg>;
}
