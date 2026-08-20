// 動画プレーヤー左上にオーバーレイ表示する、視聴済み/未視聴の切替ボタン
//
// 従来は「チャンネル登録ボタンのすぐ横」に配置していたが、
// YouTube側に「質問する」ボタン等が追加され登録ボタン周辺のスペースが不足したため、
// 動画プレーヤー自体(#movie_player)へのオーバーレイ表示に変更した。
// この方式であれば、登録ボタン周辺のレイアウト変更の影響を受けない。
(function (ns) {
  const BUTTON_ID = ns.BUTTON_ID;

  let currentVideoId = null;
  let currentButton = null;
  let retryTimer = null;
  let retryCount = 0;
  const MAX_RETRIES = 20; // 500ms間隔 x 20 = 最大10秒待機して諦める

  function findPlayerContainer() {
    for (const sel of ns.SELECTORS.playerContainer) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function updateButtonLabel(btn, status) {
    const isWatched = status === "watched";
    btn.textContent = isWatched ? "視聴済み ✓" : "未視聴";
    btn.classList.toggle("yt-watch-toggle-btn--watched", isWatched);
    btn.classList.toggle("yt-watch-toggle-btn--unwatched", !isWatched);
  }

  function createButton(status) {
    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.className = "yt-watch-toggle-btn yt-watch-toggle-btn--overlay";
    updateButtonLabel(btn, status);
    return btn;
  }

  async function handleClick(e) {
    // プレーヤー本体のクリック(再生/一時停止トグル等)を誤爆させない
    e.stopPropagation();
    e.preventDefault();

    if (!currentVideoId) return;
    const latest = await ns.storage.getWatchStatus(currentVideoId);
    const currentStatus = latest && latest.status === "watched" ? "watched" : "unwatched";
    const nextStatus = currentStatus === "watched" ? "unwatched" : "watched";
    await ns.storage.setWatchStatus(currentVideoId, nextStatus, "manual");
    if (currentButton) updateButtonLabel(currentButton, nextStatus);
  }

  function stopEventPropagation(e) {
    e.stopPropagation();
  }

  async function mountButton() {
    const videoId = ns.videoId.getCurrentVideoId();
    clearTimeout(retryTimer);
    if (!videoId) {
      // 動画ページでなければ何もしない
      return;
    }
    if (videoId !== currentVideoId) {
      retryCount = 0; // 動画が変わったらリトライ回数もリセット
    }

    const player = findPlayerContainer();
    if (!player) {
      retryCount += 1;
      if (retryCount > MAX_RETRIES) {
        console.warn(
          "[YTWatch] プレーヤー要素が見つからず、視聴済みボタンの表示を諦めました。",
          videoId
        );
        return;
      }
      // プレーヤーがまだ描画されていない場合はリトライ
      retryTimer = setTimeout(mountButton, 500);
      return;
    }
    retryCount = 0;

    // 別動画のボタンが残っていれば除去してから作り直す
    const existing = document.getElementById(BUTTON_ID);
    if (existing) existing.remove();

    // プレーヤー要素はYouTube側で通常position指定済みだが、念のため確認
    if (getComputedStyle(player).position === "static") {
      player.style.position = "relative";
    }

    currentVideoId = videoId;
    const record = await ns.storage.getWatchStatus(videoId);
    const status = record && record.status === "watched" ? "watched" : "unwatched";

    const btn = createButton(status);
    btn.addEventListener("click", handleClick);
    // シークバー操作等への誤爆防止のため、各種ポインタ操作もプレーヤーへ伝播させない
    ["mousedown", "pointerdown", "touchstart"].forEach((type) => {
      btn.addEventListener(type, stopEventPropagation);
    });

    player.appendChild(btn);
    currentButton = btn;
  }

  function onExternalStatusChange(videoId, status) {
    if (videoId !== currentVideoId || !currentButton) return;
    updateButtonLabel(currentButton, status);
  }

  function init() {
    ns.domObserver.onNavigate(() => {
      mountButton();
    });
    mountButton();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      Object.keys(changes).forEach((key) => {
        if (!ns.storage.isWatchKey(key)) return;
        const videoId = ns.storage.videoIdFromKey(key);
        const newValue = changes[key].newValue;
        const status = newValue && newValue.status === "watched" ? "watched" : "unwatched";
        onExternalStatusChange(videoId, status);
      });
    });
  }

  ns.videoPageButton = { init };
})((window.__ytWatch = window.__ytWatch || {}));
