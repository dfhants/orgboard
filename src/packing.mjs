/**
 * Compute column assignments for horizontal layout packing.
 *
 * Given an array of entry heights, an available container height, and a gap
 * between entries, assign entries sequentially into columns (top to bottom,
 * then start a new column when the next entry wouldn't fit).
 *
 * @param {Object} options
 * @param {number[]} options.heights - measured height of each entry
 * @param {number}   options.availableHeight - usable container height (px)
 * @param {number}   options.gap - vertical gap between entries within a column
 * @returns {number[][]} array of columns, each containing indices into `heights`
 */
export function computeColumns({ heights, availableHeight, gap }) {
  if (heights.length === 0) return [[]];

  // If availableHeight is zero/negative or too small for even the first entry,
  // fall back to one entry per column (no stacking possible).
  if (availableHeight <= 0) {
    return heights.map((_, i) => [i]);
  }

  const columns = [];
  let col = [];
  let colUsed = 0;

  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];

    // Would adding this entry (plus gap if not the first in the column) overflow?
    if (col.length > 0 && colUsed + gap + h > availableHeight) {
      columns.push(col);
      col = [];
      colUsed = 0;
    }

    col.push(i);
    colUsed += (col.length > 1 ? gap : 0) + h;
  }

  if (col.length > 0) columns.push(col);

  return columns;
}


