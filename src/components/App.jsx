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
import logoUrl from '../../assets/icons/icon-192.png';
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
