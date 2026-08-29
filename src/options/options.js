(function () {
  const ns = window.__ytWatch;
  const form = document.getElementById("settings-form");
  const percentInput = document.getElementById("thresholdPercent");
  const minutesInput = document.getElementById("thresholdMinutes");
  const statusEl = document.getElementById("save-status");

  async function load() {
    const settings = await ns.storage.getSettings();
    percentInput.value = settings.thresholdPercent;
    minutesInput.value = settings.thresholdMinutes;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const percent = Number(percentInput.value);
    const minutes = Number(minutesInput.value);

    const settings = {
      thresholdPercent: Number.isFinite(percent) && percent > 0 ? percent : ns.DEFAULT_SETTINGS.thresholdPercent,
      thresholdMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : ns.DEFAULT_SETTINGS.thresholdMinutes,
    };

    await ns.storage.setSettings(settings);

    statusEl.textContent = "保存しました";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  });

  load();

  // --- エクスポート ---
  const exportBtn = document.getElementById("export-btn");

  exportBtn.addEventListener("click", async () => {
    const entries = await ns.storage.getAllWatchEntries();
    const payload = {
      type: "yt-watched-status-export",
      version: 1,
      exportedAt: Date.now(),
      entries: entries,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);

    const a = document.createElement("a");
    a.href = url;
    a.download = `yt-watched-status-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // --- インポート ---
  const importBtn = document.getElementById("import-btn");
  const importFileInput = document.getElementById("import-file-input");
  const importStatusEl = document.getElementById("import-status");

  importBtn.addEventListener("click", () => {
    importFileInput.click();
  });

  importFileInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    importStatusEl.classList.remove("error");
    importStatusEl.textContent = "インポート中...";

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const entries = data && typeof data.entries === "object" ? data.entries : null;

      if (!entries) {
        throw new Error("invalid format: entries not found");
      }

      const result = await ns.storage.importWatchEntries(entries);
      importStatusEl.textContent =
        `インポート完了:${result.importedCount}件反映` +
        (result.skippedCount > 0 ? ` / ${result.skippedCount}件は既存データの方が新しいためスキップ` : "");
    } catch (err) {
      console.warn("[YTWatch] import failed", err);
      importStatusEl.classList.add("error");
      importStatusEl.textContent = "インポートに失敗しました。エクスポートされたJSONファイルを選択してください。";
    } finally {
      importFileInput.value = ""; // 同じファイルを選び直せるようにリセット
    }
  });
})();
