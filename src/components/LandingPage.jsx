export function LandingPage() {
  return (
    <div class="landing-page">
      <div class="landing-content">
        <img class="landing-logo" src="/icons/icon.svg" width="168" height="168" alt="OrgBoard" />
        <h1 class="landing-title">Welcome to OrgBoard</h1>
        <p class="landing-subtitle">How would you like to get started?</p>
        <p class="landing-privacy"><i data-lucide="lock"></i> Your data stays on your device — nothing is sent to a server.</p>
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
