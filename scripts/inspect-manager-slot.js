const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("http://localhost:4173");
  await page.waitForSelector(".manager-slot");

  const data = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll(".manager-slot").forEach((slot) => {
      const teamEl = slot.closest(".team");
      const teamName = teamEl?.querySelector(".team-name")?.textContent?.trim();
      const slotRect = slot.getBoundingClientRect();
      const slotStyles = window.getComputedStyle(slot);

      const info = {
        team: teamName,
        slot: {
          width: Math.round(slotRect.width * 100) / 100,
          height: Math.round(slotRect.height * 100) / 100,
          padding: slotStyles.padding,
          border: slotStyles.borderWidth + " " + slotStyles.borderStyle,
          minHeight: slotStyles.minHeight,
          boxSizing: slotStyles.boxSizing,
          display: slotStyles.display,
        },
        children: [],
      };

      for (const child of slot.children) {
        const r = child.getBoundingClientRect();
        const s = window.getComputedStyle(child);
        info.children.push({
          tag: child.tagName.toLowerCase(),
          class: child.className,
          text: child.textContent?.slice(0, 50),
          width: Math.round(r.width * 100) / 100,
          height: Math.round(r.height * 100) / 100,
          margin: s.margin,
          padding: s.padding,
          display: s.display,
          fontSize: s.fontSize,
          lineHeight: s.lineHeight,
        });
      }
      results.push(info);
    });
    return results;
  });

  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})();
