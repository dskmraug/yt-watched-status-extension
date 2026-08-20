// サムネイルへの視聴済み/未視聴バッジの描画・更新
(function (ns) {
  const BADGE_ATTR = ns.BADGE_ATTR;
  const ANCHOR_SELECTOR = ns.SELECTORS.thumbnailAnchorSelector;

  function createBadgeElement() {
    const badge = document.createElement("div");
    badge.className = "yt-watch-badge";
    return badge;
  }

  function applyStatusToBadge(badge, status) {
    const isWatched = status === "watched";
    badge.classList.toggle("yt-watch-badge--watched", isWatched);
    badge.classList.toggle("yt-watch-badge--unwatched", !isWatched);
    badge.textContent = isWatched ? "☑" : "□";
  }

  function applyBadge(anchorEl, status) {
    // バッジを絶対配置で右上に置くため、リンク要素自体を relative にする
    // (新旧いずれの構造でも、サムネイル画像へのリンクはほぼ画像と同じ大きさでラップされているため
    //  外側のコンテナ要素を特定しなくても、リンク要素を基準にすれば十分な位置に描画できる)
    const computedPosition = getComputedStyle(anchorEl).position;
    if (computedPosition === "static") {
      anchorEl.style.position = "relative";
    }

    let badge = anchorEl.querySelector(":scope > .yt-watch-badge");
    if (!badge) {
      badge = createBadgeElement();
      anchorEl.appendChild(badge);
    }
    applyStatusToBadge(badge, status);
    anchorEl.setAttribute(BADGE_ATTR, "true");
  }

  async function processThumbnailAnchors(anchorEls) {
    const idByEl = new Map();
    anchorEls.forEach((el) => {
      const id = ns.videoId.extractVideoId(el.href);
      if (id) idByEl.set(el, id);
    });
    if (idByEl.size === 0) return;

    const uniqueIds = Array.from(new Set(idByEl.values()));
    const statusMap = await ns.storage.getWatchStatusBulk(uniqueIds);

    idByEl.forEach((id, el) => {
      const record = statusMap[id];
      const status = record && record.status === "watched" ? "watched" : "unwatched";
      applyBadge(el, status);
    });
  }

  // 他タブでの状態変更や動画ページでのボタン操作を受けて、該当動画のバッジをすべて更新する
  function refreshBadgesForVideoId(videoId, status) {
    document.querySelectorAll(ANCHOR_SELECTOR).forEach((el) => {
      if (!ns.domObserver.isThumbnailAnchor(el)) return;
      const id = ns.videoId.extractVideoId(el.href);
      if (id === videoId) {
        applyBadge(el, status);
      }
    });
  }

  function init() {
    ns.domObserver.onThumbnailsAdded((els) => {
      processThumbnailAnchors(els);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      Object.keys(changes).forEach((key) => {
        if (!ns.storage.isWatchKey(key)) return;
        const videoId = ns.storage.videoIdFromKey(key);
        const newValue = changes[key].newValue;
        const status = newValue && newValue.status === "watched" ? "watched" : "unwatched";
        refreshBadgesForVideoId(videoId, status);
      });
    });
  }

  ns.thumbnailOverlay = { init };
})((window.__ytWatch = window.__ytWatch || {}));
