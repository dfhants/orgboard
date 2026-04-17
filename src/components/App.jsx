import { useLayoutEffect, useEffect, useRef } from 'preact/hooks';
import {
  state, showLanding, boardZoom, renderTick,
  scenarios, activeScenarioId,
} from '../state.mjs';
import { evaluateAllChecks } from '../checks.mjs';
import { globalCriteria } from '../state.mjs';
import { sortAllTeams } from '../operations.mjs';
import { createIcons } from '../icons.mjs';
import { tightenLayout, applyBoardZoomToShell, observeShellResize } from '../layout.mjs';
import { debouncedSave } from '../scenarios.mjs';

import { LandingPage } from './LandingPage.jsx';
import { TabBar } from './TabBar.jsx';
import { ActionBar } from './ActionBar.jsx';
const logoUrl = '/icons/icon-192.png';
import { Board } from './Board.jsx';
import { UnassignedBar } from './UnassignedBar.jsx';
import { StatsPanel } from './StatsPanel.jsx';

function updateScrollIndicators(wrapper, rosterCards) {
  if (!wrapper || !rosterCards) return;
  wrapper.classList.toggle('can-scroll-left', rosterCards.scrollLeft > 0);
  wrapper.classList.toggle('can-scroll-right', rosterCards.scrollLeft + rosterCards.clientWidth < rosterCards.scrollWidth - 1);
}

export function App() {
  // Subscribe to the render tick signal — any state change triggers re-render
  const _tick = renderTick.value;

  const shellRef = useRef(null);
  const rosterRef = useRef(null);
  const isLanding = showLanding;

  // Sort and evaluate checks before rendering (same as old render())
  let lastCheckResults = null;
  if (!isLanding) {
    sortAllTeams(state.activeSortLayers);
    lastCheckResults = evaluateAllChecks(state, globalCriteria.filter((c) => c.enabled));
  }

  // After DOM commit: hydrate icons, apply zoom, tighten layout
  useLayoutEffect(() => {
    createIcons();

    if (isLanding) {
      applyBoardZoomToShell(1);
      // Reset page-shell margins for landing page
      const shell = shellRef.current;
      if (shell) {
        shell.style.marginRight = "0";
        shell.style.marginLeft = "0";
        shell.style.height = "calc(100vh - 52px)";
      }
    } else {
      // Clear any inline overrides from landing page
      const shell = shellRef.current;
      if (shell) {
        shell.style.marginRight = "";
        shell.style.marginLeft = "";
        shell.style.height = "";
        shell.dataset.layout = state.rootLayout;
      }
      applyBoardZoomToShell(boardZoom);
      tightenLayout();
    }

    // Update scroll indicators for unassigned bar
    if (!isLanding && !state.unassignedBarCollapsed) {
      const drawer = document.getElementById('unassigned-drawer');
      if (drawer) {
        const rosterCards = drawer.querySelector('.roster-cards');
        const wrapper = drawer.querySelector('.roster-cards-wrapper');
        updateScrollIndicators(wrapper, rosterCards);
      }
    }

    // Scroll active tab into view
    const activeTab = document.querySelector(".scenario-tab.is-active");
    if (activeTab) activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  });

  // After paint: save state to DB
  useEffect(() => {
    debouncedSave();
  });

  // Set up scroll indicator handlers on the roster cards
  useEffect(() => {
    if (isLanding || state.unassignedBarCollapsed) return;
    const drawer = document.getElementById('unassigned-drawer');
    if (!drawer) return;
    const rosterCards = drawer.querySelector('.roster-cards');
    const wrapper = drawer.querySelector('.roster-cards-wrapper');
    if (!rosterCards || !wrapper) return;
    const onScroll = () => updateScrollIndicators(wrapper, rosterCards);
    rosterCards.addEventListener('scroll', onScroll);
    return () => rosterCards.removeEventListener('scroll', onScroll);
  });

  return (
    <>
      <header class="app-toolbar">
        <div class="toolbar-brand">
          <img class="toolbar-logo" src={logoUrl} width="28" height="28" alt="OrgBoard logo" />
          <span class="toolbar-title">OrgBoard</span>
        </div>
        <div id="scenario-tabs" class="scenario-tabs">
          <TabBar />
        </div>
        <nav class="toolbar-actions">
          <button class="toolbar-button" type="button" id="import-db-btn" title="Import database" aria-label="Import database"><i data-lucide="database"></i><span>Import DB</span></button>
          <button class="toolbar-button" type="button" id="export-db-btn" title="Export database" aria-label="Export database"><i data-lucide="download"></i><span>Export</span></button>
          <a class="toolbar-button" href="https://github.com/dfhants/orgboard" target="_blank" rel="noopener noreferrer" title="View source on GitHub" aria-label="View source on GitHub"><svg class="github-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg></a>
        </nav>
      </header>

      <div class="page-shell" ref={shellRef} data-layout={state.rootLayout}>
        <main class="app-grid">
          {isLanding
            ? <LandingPage />
            : <Board lastCheckResults={lastCheckResults} />}
        </main>
      </div>

      {!isLanding && <ActionBar />}
      {!isLanding && <UnassignedBar />}
      {!isLanding
        ? <StatsPanel lastCheckResults={lastCheckResults} />
        : null}
    </>
  );
}
