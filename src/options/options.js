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
})();
