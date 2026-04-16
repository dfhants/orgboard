export function LandingPage() {
  return (
    <div class="landing-page">
      <div class="landing-content">
        <svg class="landing-logo" viewBox="0 0 64 64" width="56" height="56"><rect width="64" height="64" rx="14" fill="var(--accent)"/><rect x="14" y="14" width="14" height="14" fill="#fff"/><rect x="36" y="14" width="14" height="14" fill="#fff"/><rect x="25" y="36" width="14" height="14" fill="#fff"/></svg>
        <h1 class="landing-title">Welcome to OrgBoard</h1>
        <p class="landing-subtitle">How would you like to get started?</p>
        <div class="landing-options">
          <button class="landing-card" type="button" data-landing-action="demo">
            <span class="landing-card-icon"><i data-lucide="layout-grid"></i></span>
            <span class="landing-card-title">Launch demo</span>
            <span class="landing-card-desc">Explore with sample teams and people already set up</span>
          </button>
          <button class="landing-card" type="button" data-landing-action="import">
            <span class="landing-card-icon"><i data-lucide="upload"></i></span>
            <span class="landing-card-title">Import from CSV</span>
            <span class="landing-card-desc">Load your own data with column mapping and load options</span>
          </button>
          <button class="landing-card" type="button" data-landing-action="blank">
            <span class="landing-card-icon"><i data-lucide="plus-square"></i></span>
            <span class="landing-card-title">Start blank</span>
            <span class="landing-card-desc">Begin with an empty board and build from scratch</span>
          </button>
        </div>
      </div>
    </div>
  );
}
