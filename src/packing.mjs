/**
 * Calculate the packed dimensions for a member slot.
 *
 * @param {Object} options
 * @param {"horizontal"|"vertical"} options.layout
 * @param {{width: number, height: number}[]} options.entries - measured sizes of each member-entry
 * @param {number} options.gap - gap between entries (used for both row and column gap)
 * @param {number} options.paddingX - left + right padding
 * @param {number} options.paddingY - top + bottom padding
 * @param {number} options.borderX - left + right border width
 * @param {number} options.borderY - top + bottom border width
 * @returns {{width: number, height: number | null}} - pixel values to set on the slot (null means don't set)
 */
export function calculateSlotSize({ layout, entries, gap, paddingX, paddingY, borderX, borderY }) {
  if (entries.length === 0) {
    return { width: null, height: null };
  }

  const widths = entries.map((e) => e.width);
  const heights = entries.map((e) => e.height);

  if (layout === "horizontal") {
    // flex-direction: column, flex-wrap: wrap
    // Height is set to fit exactly the tallest single entry (content height).
    const tallest = Math.max(...heights);
    const contentHeight = tallest;
    const height = Math.ceil(contentHeight + paddingY + borderY);

    // Simulate column wrapping: pack entries top-to-bottom into columns
    // of the available content height, then sum up column widths.
    const columns = [];
    let colUsed = 0;
    let colWidth = 0;

    for (let i = 0; i < entries.length; i++) {
      const entryH = heights[i];
      const entryW = widths[i];

      // Would this entry overflow the current column?
      if (colUsed > 0 && colUsed + gap + entryH > contentHeight) {
        columns.push(colWidth);
        colUsed = 0;
        colWidth = 0;
      }

      colUsed += (colUsed > 0 ? gap : 0) + entryH;
      colWidth = Math.max(colWidth, entryW);
    }

    if (colWidth > 0) {
      columns.push(colWidth);
    }

    const totalColumnsWidth =
      columns.reduce((sum, w) => sum + Math.ceil(w), 0) +
      gap * Math.max(0, columns.length - 1);

    const width = Math.ceil(totalColumnsWidth + paddingX + borderX);

    return { width, height };
  }

  if (layout === "vertical") {
    // flex-direction: row, flex-wrap: wrap
    // Cap at 2 columns. Width needs to fit them; height is handled by CSS.
    const narrowest = Math.min(...widths);
    const widest = Math.max(...widths);
    const columnCount = Math.max(1, Math.min(entries.length, 2));
    const contentWidth = Math.max(widest, narrowest * columnCount + gap * Math.max(0, columnCount - 1));
    const width = Math.ceil(contentWidth + paddingX + borderX);

    return { width, height: null };
  }

  return { width: null, height: null };
}


