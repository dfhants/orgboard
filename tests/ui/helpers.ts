import type { Page } from "@playwright/test";

/**
 * Perform a reliable HTML5 drag-and-drop between two elements.
 * Dispatches the full sequence of drag events that the app's handlers expect.
 */
export async function dragAndDrop(
  page: Page,
  sourceSelector: string,
  targetSelector: string
) {
  await page.evaluate(
    ({ src, tgt }) => {
      const source = document.querySelector(src) as HTMLElement;
      const target = document.querySelector(tgt) as HTMLElement;
      if (!source || !target) {
        throw new Error(
          `Could not find source (${src}) or target (${tgt})`
        );
      }

      const srcRect = source.getBoundingClientRect();
      const tgtRect = target.getBoundingClientRect();

      const dataTransfer = new DataTransfer();

      const srcX = srcRect.x + srcRect.width / 2;
      const srcY = srcRect.y + srcRect.height / 2;
      const tgtX = tgtRect.x + tgtRect.width / 2;
      const tgtY = tgtRect.y + tgtRect.height / 2;

      source.dispatchEvent(
        new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: srcX,
          clientY: srcY,
        })
      );

      // Small delay simulated by dispatching drag events sequentially
      target.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: tgtX,
          clientY: tgtY,
        })
      );

      target.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: tgtX,
          clientY: tgtY,
        })
      );

      source.dispatchEvent(
        new DragEvent("dragend", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        })
      );
    },
    { src: sourceSelector, tgt: targetSelector }
  );
}

/**
 * Start a drag and hover over a target WITHOUT dropping.
 * Returns a cleanup function that fires dragend to cancel the drag.
 */
export async function dragHover(
  page: Page,
  sourceSelector: string,
  targetSelector: string
) {
  await page.evaluate(
    ({ src, tgt }) => {
      const source = document.querySelector(src) as HTMLElement;
      const target = document.querySelector(tgt) as HTMLElement;
      if (!source || !target) {
        throw new Error(
          `Could not find source (${src}) or target (${tgt})`
        );
      }

      const srcRect = source.getBoundingClientRect();
      const tgtRect = target.getBoundingClientRect();
      const dataTransfer = new DataTransfer();

      source.dispatchEvent(
        new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: srcRect.x + srcRect.width / 2,
          clientY: srcRect.y + srcRect.height / 2,
        })
      );

      target.dispatchEvent(
        new DragEvent("dragenter", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: tgtRect.x + tgtRect.width / 2,
          clientY: tgtRect.y + tgtRect.height / 2,
        })
      );

      target.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: tgtRect.x + tgtRect.width / 2,
          clientY: tgtRect.y + tgtRect.height / 2,
        })
      );
    },
    { src: sourceSelector, tgt: targetSelector }
  );
}

/**
 * Cancel an in-progress drag by dispatching dragend on the source element.
 */
export async function dragCancel(page: Page, sourceSelector: string) {
  await page.evaluate((src) => {
    const source = document.querySelector(src) as HTMLElement;
    if (source) {
      source.dispatchEvent(
        new DragEvent("dragend", {
          bubbles: true,
          cancelable: true,
          dataTransfer: new DataTransfer(),
        })
      );
    }
  }, sourceSelector);
}

/**
 * Perform a copy drag (with 'c' key held) between two elements.
 */
export async function dragAndDropCopy(
  page: Page,
  sourceSelector: string,
  targetSelector: string
) {
  // Press 'c' to activate copy mode
  await page.keyboard.down("c");
  await dragAndDrop(page, sourceSelector, targetSelector);
  await page.keyboard.up("c");
}
