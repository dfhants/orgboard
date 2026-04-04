import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateSlotSize } from "../src/packing.mjs";

// Real CSS values from styles.css:
//   .slot   { padding: 10px; border: 2px dashed; }
//   .member-slot { gap: 10px; }
//   .person-card { width: 84px; min-height: 84px; }
//
// So: paddingX=20  paddingY=20  borderX=4  borderY=4  gap=10
//
// All diagrams below use:
//   ╔══╗   = slot border (2px each side → 4 total)
//   ·      = slot padding (10px each side → 20 total)
//   ┃  ┃   = entry
//   ←g→    = gap (10px)
//
// HORIZONTAL layout = flex-direction: column, flex-wrap: wrap
//   Entries flow top→bottom, then wrap into a new column to the right.
//   Height is locked to the tallest single entry + padding + border.
//   Width is calculated from the column packing.
//
// VERTICAL layout = flex-direction: row, flex-wrap: wrap
//   Entries flow left→right, wrapping into rows. Max 2 columns.
//   Only width is calculated. Height is left to CSS.

const SLOT = { gap: 10, paddingX: 20, paddingY: 20, borderX: 4, borderY: 4 };

function calc(layout, entries) {
  return calculateSlotSize({ layout, entries, ...SLOT });
}

function card(w = 84, h = 84) {
  return { width: w, height: h };
}

// ─── Empty ───────────────────────────────────────────────────────────

describe("empty slot", () => {
  //  ╔════════╗
  //  ║ ·    · ║  No entries → nothing to size.
  //  ╚════════╝  Return null for both dimensions.
  it("returns null for both when there are no entries", () => {
    assert.deepStrictEqual(calc("horizontal", []), { width: null, height: null });
    assert.deepStrictEqual(calc("vertical", []), { width: null, height: null });
  });
});

// ─── Horizontal layout (flex-direction: column, flex-wrap: wrap) ─────

describe("horizontal layout", () => {

  it("single card", () => {
    //  ╔══════════════╗
    //  ║ · ┃ 84×84┃ · ║   One entry → one column.
    //  ╚══════════════╝
    //
    //  width:  |2|10| 84 |10|2| = 108
    //  height: |2|10| 84 |10|2| = 108
    const { width, height } = calc("horizontal", [card()]);
    assert.equal(width, 108);
    assert.equal(height, 108);
  });

  it("two identical cards — each gets its own column", () => {
    //  Content height = tallest entry = 84.
    //  First entry fills 84 of 84 available height.
    //  Second would need 84 + 10gap = 94, exceeds 84 → starts new column.
    //
    //  ╔══════════════════════════════╗
    //  ║ · ┃84×84┃ ←g→ ┃84×84┃ · ║
    //  ╚══════════════════════════════╝
    //
    //  width:  |2|10| 84 |10| 84 |10|2| = 202
    //  height: |2|10| 84 |10|2|          = 108
    const { width, height } = calc("horizontal", [card(), card()]);
    assert.equal(width, 202);
    assert.equal(height, 108);
  });

  it("three identical cards — three columns", () => {
    //  Same reasoning: each 84-tall entry alone fills its column.
    //
    //  ╔══════════════════════════════════════════════╗
    //  ║ · ┃84×84┃ ←g→ ┃84×84┃ ←g→ ┃84×84┃ · ║
    //  ╚══════════════════════════════════════════════╝
    //
    //  width: |2|10| 84 |10| 84 |10| 84 |10|2| = 296
    const { width, height } = calc("horizontal", [card(), card(), card()]);
    assert.equal(width, 296);
    assert.equal(height, 108);
  });

  it("one tall entry and one short card — cannot share a column", () => {
    //  Content height = tallest = 200.
    //  Col 1: 84×200 fills the height (used=200).
    //  Card 2: 200 + 10gap + 84 = 294  >  200 → wraps to col 2.
    //
    //  ╔══════════════════════════════╗
    //  ║ · ┃      ┃ ←g→ ┃84×84┃ · ║
    //  ║ · ┃84×200┃      ·      · ║
    //  ║ · ┃      ┃      ·      · ║
    //  ╚══════════════════════════════╝
    //
    //  width:  |2|10| 84 |10| 84 |10|2| = 202
    //  height: |2|10| 200 |10|2|         = 224
    const { width, height } = calc("horizontal", [card(84, 200), card()]);
    assert.equal(width, 202);
    assert.equal(height, 224);
  });

  it("entries of different widths — column is as wide as its widest entry", () => {
    //  All height 84 → three individual columns.
    //  Each column's width matches the single entry inside it.
    //
    //  ╔═══════════════════════════════════════════════════╗
    //  ║ · ┃ 84w ┃ ←g→ ┃  120w  ┃ ←g→ ┃ 100w ┃ · ║
    //  ╚═══════════════════════════════════════════════════╝
    //
    //  width: |2|10| 84 |10| 120 |10| 100 |10|2| = 348
    const { width, height } = calc("horizontal", [card(84, 84), card(120, 84), card(100, 84)]);
    assert.equal(width, 348);
    assert.equal(height, 108);
  });

  it("two short entries — gap still prevents stacking", () => {
    //  Both 84×30. Content height = tallest = 30.
    //  Col 1: used=30. Second: 30 + 10gap + 30 = 70  >  30 → wraps.
    //  Even short entries can't share a column when the gap
    //  pushes their combined size over the content height.
    //
    //  ╔══════════════════════════════╗
    //  ║ · ┃84×30┃ ←g→ ┃84×30┃ · ║
    //  ╚══════════════════════════════╝
    //
    //  width:  |2|10| 84 |10| 84 |10|2| = 202
    //  height: |2|10| 30 |10|2|          = 54
    const { width, height } = calc("horizontal", [card(84, 30), card(84, 30)]);
    assert.equal(width, 202);
    assert.equal(height, 54);
  });

  it("two short entries stack below a tall one", () => {
    //  Entries: 84×100, 84×40, 84×40. Content height = 100.
    //
    //  Col 1: [84×100] → used=100 (exactly full).
    //         Next: 100+10+40=150 > 100 → wraps.
    //  Col 2: [84×40] → used=40.
    //         Next: 40+10+40=90 ≤ 100 → fits!
    //         [84×40, 84×40] stacked, used=90.
    //
    //  ╔══════════════════════════════╗
    //  ║ · ┃       ┃ ←g→ ┃84×40┃ · ║
    //  ║ · ┃84×100 ┃      ──────  · ║
    //  ║ · ┃       ┃  g  ┃84×40┃ · ║
    //  ╚══════════════════════════════╝
    //
    //  width:  |2|10| 84 |10| 84 |10|2| = 202
    //  height: |2|10| 100 |10|2|         = 124
    const { width, height } = calc("horizontal", [card(84, 100), card(84, 40), card(84, 40)]);
    assert.equal(width, 202);
    assert.equal(height, 124);
  });

  it("mixed widths stacking in columns", () => {
    //  Entries: 100×100, 80×40, 120×40. Content height = 100.
    //
    //  Col 1: [100×100] → colWidth=100, used=100.
    //  Col 2: [80×40] → used=40. Add [120×40]: 40+10+40=90 ≤ 100 → stacks.
    //         colWidth = max(80, 120) = 120.
    //
    //  The column's width is driven by its widest entry (120),
    //  even though the first entry in that column was only 80.
    //
    //  ╔═══════════════════════════════════════╗
    //  ║ · ┃        ┃ ←g→ ┃ 80×40  ┃ ·  ║
    //  ║ · ┃100×100 ┃      ─────────  ·  ║
    //  ║ · ┃        ┃  g  ┃120×40  ┃ ·  ║
    //  ╚═══════════════════════════════════════╝
    //
    //  width:  |2|10| 100 |10| 120 |10|2| = 254
    //  height: |2|10| 100 |10|2|          = 124
    const { width, height } = calc("horizontal", [card(100, 100), card(80, 40), card(120, 40)]);
    assert.equal(width, 254);
    assert.equal(height, 124);
  });

  it("five uniform cards — five columns", () => {
    //  All 84×84 → five separate columns.
    //
    //  ╔══════════════════════════════════════════════════════════════════╗
    //  ║ · ┃84┃ ←g→ ┃84┃ ←g→ ┃84┃ ←g→ ┃84┃ ←g→ ┃84┃ · ║
    //  ╚══════════════════════════════════════════════════════════════════╝
    //
    //  width: 5×84 + 4×10 + 20 + 4 = 484
    const entries = Array.from({ length: 5 }, () => card());
    const { width, height } = calc("horizontal", entries);
    assert.equal(width, 484);
    assert.equal(height, 108);
  });

  it("full-height entry cannot share its column — gap would overflow", () => {
    //  Two 84×84 cards, content height = 84.
    //  Col 1 used=84 (exactly full). Adding anything needs +10gap minimum,
    //  so 84+10+84=178 > 84 → wraps. No entry can ever share with a
    //  full-height entry because the gap alone causes overflow.
    //
    //  ╔══════════════════════════════╗
    //  ║ · ┃84×84┃ ←g→ ┃84×84┃ · ║
    //  ╚══════════════════════════════╝
    //
    //  width: 202, height: 108
    const { width, height } = calc("horizontal", [card(84, 84), card(84, 84)]);
    assert.equal(width, 202);
    assert.equal(height, 108);
  });

  it("single wide entry", () => {
    //  ╔════════════════════════╗
    //  ║ ·    ┃200×50┃    · ║   One wide, short entry → one column.
    //  ╚════════════════════════╝
    //
    //  width:  |2|10| 200 |10|2| = 224
    //  height: |2|10|  50 |10|2| = 74
    const { width, height } = calc("horizontal", [card(200, 50)]);
    assert.equal(width, 224);
    assert.equal(height, 74);
  });
});

// ─── Vertical layout (flex-direction: row, flex-wrap: wrap) ──────────
//
// Entries flow left→right, wrapping into new rows.
// Width is sized to fit up to 2 columns. Height is left to CSS (null).
//
// Width = max(widest, narrowest × cols + gap × (cols-1)) + pad + border
//   where cols = min(entryCount, 2)
//
// The max() ensures the slot is at least wide enough for its widest
// single entry, while also wide enough for two of the narrowest
// side-by-side.

describe("vertical layout", () => {

  it("single card — one column", () => {
    //  ╔══════════════╗
    //  ║ · ┃84×84┃ · ║   1 entry → 1 column.
    //  ╚══════════════╝
    //
    //  cols=1. max(84, 84×1) = 84.
    //  width: 84+20+4 = 108.  height: null (CSS handles rows).
    const { width, height } = calc("vertical", [card()]);
    assert.equal(width, 108);
    assert.equal(height, null);
  });

  it("two cards — two columns", () => {
    //  ╔══════════════════════════════╗
    //  ║ · ┃84×84┃ ←g→ ┃84×84┃ · ║
    //  ╚══════════════════════════════╝
    //
    //  cols=2. max(84, 84×2 + 10) = max(84, 178) = 178.
    //  width: 178+20+4 = 202.
    const { width, height } = calc("vertical", [card(), card()]);
    assert.equal(width, 202);
    assert.equal(height, null);
  });

  it("three cards — capped at 2 columns, third wraps to next row", () => {
    //  ╔══════════════════════════════╗
    //  ║ · ┃84×84┃ ←g→ ┃84×84┃ · ║   Row 1: entries 1 & 2
    //  ║ · ┃84×84┃               · ║   Row 2: entry 3 wraps down
    //  ╚══════════════════════════════╝
    //
    //  cols=min(3,2)=2. Same formula as two cards → width: 202.
    //  The third card wraps into a new row but doesn't widen the slot.
    const { width, height } = calc("vertical", [card(), card(), card()]);
    assert.equal(width, 202);
    assert.equal(height, null);
  });

  it("one wide and one narrow — widest single entry wins", () => {
    //  ╔══════════════════════════════════╗
    //  ║ · ┃     200×84      ┃        · ║   The 200w entry is wider
    //  ║ · ┃84×84┃                    · ║   than 2×narrowest+gap.
    //  ╚══════════════════════════════════╝
    //
    //  narrowest=84, widest=200. cols=2.
    //  max(200, 84×2+10) = max(200, 178) = 200.
    //  width: 200+20+4 = 224.
    //
    //  Even though we want 2 columns, the single widest entry
    //  forces the slot wider than two narrow columns would need.
    const { width, height } = calc("vertical", [card(200, 84), card(84, 84)]);
    assert.equal(width, 224);
    assert.equal(height, null);
  });

  it("two narrow entries — two-column formula drives width", () => {
    //  ╔════════════════════════╗
    //  ║ · ┃60w┃ ←g→ ┃60w┃ · ║   Both 60px wide.
    //  ╚════════════════════════╝
    //
    //  narrowest=widest=60. cols=2.
    //  max(60, 60×2+10) = max(60, 130) = 130.
    //  width: 130+20+4 = 154.
    //
    //  When all entries are the same narrow width, the two-column
    //  formula (narrow×2 + gap) always exceeds the single widest.
    const { width, height } = calc("vertical", [card(60, 84), card(60, 84)]);
    assert.equal(width, 154);
    assert.equal(height, null);
  });

  it("single wide entry — 1 column", () => {
    //  ╔════════════════════════╗
    //  ║ ·    ┃200×84┃    · ║   Just one entry → 1 column.
    //  ╚════════════════════════╝
    //
    //  cols=1. max(200, 200×1) = 200.
    //  width: 200+20+4 = 224.
    const { width, height } = calc("vertical", [card(200, 84)]);
    assert.equal(width, 224);
    assert.equal(height, null);
  });

  it("many entries at different widths", () => {
    //  4 entries, widths: 84, 100, 60, 120.
    //  narrowest=60, widest=120. cols=2.
    //
    //  ╔════════════════════════╗
    //  ║ · ┃ 84w ┃ g ┃100w┃ · ║   Row 1
    //  ║ · ┃ 60w ┃ g ┃120w┃ · ║   Row 2
    //  ╚════════════════════════╝
    //
    //  max(120, 60×2+10) = max(120, 130) = 130.
    //  width: 130+20+4 = 154.
    //
    //  The two-column formula uses the narrowest for both columns
    //  (the minimum needed for two side-by-side), and the max()
    //  guarantees the widest single entry still fits.
    const { width, height } = calc("vertical", [card(84, 84), card(100, 84), card(60, 84), card(120, 84)]);
    assert.equal(width, 154);
    assert.equal(height, null);
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────

describe("edge cases", () => {

  it("zero gap — entries pack tighter but still can't share columns", () => {
    //  Horizontal, gap=0. Two 84×84 cards.
    //  Content height = 84. Col 1 used=84.
    //  Next: 84 + 0gap + 84 = 168  >  84 → still wraps!
    //  Even with no gap, two full-height entries exceed the content
    //  height when combined (their heights alone sum to 168).
    //
    //  ╔════════════════════════════╗
    //  ║ · ┃84×84┃┃84×84┃ ·  ║   No gap between columns.
    //  ╚════════════════════════════╝
    //
    //  width:  |2|10| 84 | 84 |10|2| = 192  (no column gap)
    //  height: |2|10| 84 |10|2|      = 108
    const result = calculateSlotSize({
      layout: "horizontal",
      entries: [card(), card()],
      gap: 0,
      paddingX: 20, paddingY: 20, borderX: 4, borderY: 4,
    });
    assert.equal(result.width, 192);
    assert.equal(result.height, 108);
  });

  it("zero padding and border — content fills edge to edge", () => {
    //  No padding, no border. Slot size equals the raw content.
    //
    //  ┃84×84┃    That's the whole slot.
    //
    //  width: 84, height: 84
    const result = calculateSlotSize({
      layout: "horizontal",
      entries: [card()],
      gap: 10,
      paddingX: 0, paddingY: 0, borderX: 0, borderY: 0,
    });
    assert.equal(result.width, 84);
    assert.equal(result.height, 84);
  });

  it("fractional entry sizes — each column width is ceiled individually", () => {
    //  Two entries: 84.3w and 84.7w. Same height → two columns.
    //  Each column width is ceiled independently to avoid sub-pixel
    //  rendering gaps where the browser rounds down.
    //
    //  ╔═════════════════════════════════╗
    //  ║ · ┃84.3w┃ ←g→ ┃84.7w┃ ·  ║
    //  ╚═════════════════════════════════╝
    //
    //  col 1: ceil(84.3)=85.  col 2: ceil(84.7)=85.
    //  width: 85 + 10 + 85 + 20 + 4 = 204
    const result = calculateSlotSize({
      layout: "horizontal",
      entries: [card(84.3, 84), card(84.7, 84)],
      gap: 10,
      paddingX: 20, paddingY: 20, borderX: 4, borderY: 4,
    });
    assert.equal(result.width, 204);
  });

  it("unknown layout returns nulls — no calculation attempted", () => {
    //  Unrecognised layout string → bail out safely with null dimensions.
    //  The caller won't set any inline styles.
    const result = calculateSlotSize({
      layout: "something-else",
      entries: [card()],
      gap: 10,
      paddingX: 20, paddingY: 20, borderX: 4, borderY: 4,
    });
    assert.deepStrictEqual(result, { width: null, height: null });
  });
});
