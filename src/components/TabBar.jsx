import { scenarios, activeScenarioId } from '../state.mjs';
import { renameScenario } from '../scenarios.mjs';
import { notifyStateChange } from '../state.mjs';
import { useRef } from 'preact/hooks';
import { useInlineEdit } from './useInlineEdit.js';

function TabName({ scenario }) {
  // Track whether this tab was active at mousedown time (before events.mjs processes the click)
  const wasActiveAtMouseDown = useRef(false);
  const { editing, setEditing, inputProps } = useInlineEdit(scenario.name, (newName) => {
    renameScenario(scenario.id, newName);
    notifyStateChange();
  });

  if (editing) {
    return (
      <input
        {...inputProps}
        class="scenario-tab-input"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      class="scenario-tab-name"
      data-tab-name={scenario.id}
      onMouseDown={() => {
        wasActiveAtMouseDown.current = scenario.id === activeScenarioId;
      }}
      onClick={(e) => {
        if (wasActiveAtMouseDown.current) {
          e.stopPropagation();
          setEditing(true);
        }
      }}
    >
      {scenario.name}
    </span>
  );
}

export function TabBar() {
  const tabs = scenarios.map((s) => {
    const isActive = s.id === activeScenarioId;
    return (
      <button class={`scenario-tab${isActive ? " is-active" : ""}`} data-scenario-id={s.id} key={s.id}>
        <TabName scenario={s} />
        {scenarios.length > 1 && (
          <button class="scenario-tab-close" data-close-scenario={s.id} title="Close scenario" aria-label="Close scenario"><i data-lucide="x"></i></button>
        )}
      </button>
    );
  });

  return (
    <>
      {tabs}
      <button class="scenario-tab-add" title="New scenario" aria-label="New scenario"><i data-lucide="plus"></i></button>
    </>
  );
}
