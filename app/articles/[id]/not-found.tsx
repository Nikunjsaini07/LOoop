import Link from "@/components/PageLink";
import BrandLogo from "@/components/BrandLogo";

export default function ArticleNotFound() {
  return <main className="reading-main article-not-found">
    <BrandLogo />
    <p className="eyebrow">Article unavailable</p>
    <h1>This story has slipped<br />out of the collection.</h1>
    <p>Return to your feed to find something else worth reading.</p>
    <Link className="ink-button" href="/">Back to feed</Link>
  </main>;
}
