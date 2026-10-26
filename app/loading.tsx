import "./loading.css";

export default function Loading() {
  return <main className="route-loading" role="status" aria-live="polite" aria-label="Loading Readwell">
    <header className="route-loading-header">
      <span className="route-loading-brand"><img src="/brand/readwell-original.png" alt="" />Readwell</span>
      <span className="route-loading-nav" aria-hidden="true"><i /><i /><i /></span>
      <span className="route-loading-theme" aria-hidden="true" />
    </header>
    <section className="route-loading-content">
      <span className="route-loading-kicker"><i />Gathering your reading</span>
      <h1>Engineering,<br /><em>worth reading.</em></h1>
      <p>Stories from the teams building the internet.</p>
      <div className="route-loading-search" aria-hidden="true" />
      <div className="route-loading-stories" aria-hidden="true">
        {[0, 1, 2].map((item) => <div className="route-loading-story" key={item}>
          <span className="route-loading-mark" />
          <span className="route-loading-lines"><i /><i /><i /></span>
        </div>)}
      </div>
    </section>
  </main>;
}
