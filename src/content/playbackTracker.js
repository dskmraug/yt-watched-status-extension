// タブがアクティブな間の再生時間を計測し、
// 設定された閾値(割合 or 時間、いずれか早い方)に達したら自動的に視聴済みにする
(function (ns) {
  let videoEl = null;
  let trackedVideoId = null;
  let accumulatedActiveSeconds = 0;
  let lastTickTimestamp = null;
  let alreadyWatched = false; // 既に視聴済み(手動含む)かどうか。trueなら自動判定は不要
  let settingsCache = Object.assign({}, ns.DEFAULT_SETTINGS);

  function isTabActive() {
    return document.visibilityState === "visible" && document.hasFocus();
  }

  function resetTrackingState(videoId) {
    trackedVideoId = videoId;
    accumulatedActiveSeconds = 0;
    lastTickTimestamp = null;
    alreadyWatched = false;
  }

  async function refreshWatchedFlag(videoId) {
    const record = await ns.storage.getWatchStatus(videoId);
    alreadyWatched = !!(record && record.status === "watched");
  }

  function findVideoElement() {
    for (const sel of ns.SELECTORS.videoElement) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  async function evaluateThreshold() {
    if (alreadyWatched || !videoEl || !trackedVideoId) return;
    const duration = videoEl.duration;
    if (!duration || Number.isNaN(duration) || duration <= 0) return;

    const percentReached = (accumulatedActiveSeconds / duration) * 100 >= settingsCache.thresholdPercent;
    const minutesReached = accumulatedActiveSeconds / 60 >= settingsCache.thresholdMinutes;

    if (percentReached || minutesReached) {
      alreadyWatched = true; // 二重書き込み防止のため先にフラグを立てる
      await ns.storage.setWatchStatus(trackedVideoId, "watched", "auto");
    }
  }

  function tick() {
    if (!videoEl || videoEl.paused || videoEl.ended) {
      lastTickTimestamp = null;
      return;
    }
    const now = performance.now();
    if (isTabActive()) {
      if (lastTickTimestamp !== null) {
        accumulatedActiveSeconds += (now - lastTickTimestamp) / 1000;
      }
      lastTickTimestamp = now;
    } else {
      // 非アクティブの間はカウントを進めない
      lastTickTimestamp = null;
    }
    evaluateThreshold();
  }

  async function attachToVideo() {
    const videoId = ns.videoId.getCurrentVideoId();
    if (!videoId) {
      videoEl = null;
      trackedVideoId = null;
      return;
    }

    const el = findVideoElement();
    if (!el) {
      setTimeout(attachToVideo, 500);
      return;
    }

    if (videoEl === el && trackedVideoId === videoId) return;

    videoEl = el;
    resetTrackingState(videoId);
    settingsCache = await ns.storage.getSettings();
    await refreshWatchedFlag(videoId);
  }

  function init() {
    ns.domObserver.onNavigate(() => {
      attachToVideo();
    });
    attachToVideo();

    setInterval(tick, 1000);

    // タブの可視性・フォーカスが変わった直後は経過時間を誤加算しないようリセット
    document.addEventListener("visibilitychange", () => {
      lastTickTimestamp = null;
    });
    window.addEventListener("blur", () => {
      lastTickTimestamp = null;
    });
    window.addEventListener("focus", () => {
      lastTickTimestamp = null;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[ns.SETTINGS_KEY]) {
        settingsCache = Object.assign({}, ns.DEFAULT_SETTINGS, changes[ns.SETTINGS_KEY].newValue || {});
      }
      // 現在追跡中の動画が手動等で視聴済みに変更された場合、自動判定を停止する
      const key = ns.storage.keyFor(trackedVideoId || "");
      if (trackedVideoId && changes[key]) {
        const newValue = changes[key].newValue;
        alreadyWatched = !!(newValue && newValue.status === "watched");
      }
    });
  }

  ns.playbackTracker = { init };
})((window.__ytWatch = window.__ytWatch || {}));
