// サムネイル要素の出現検知(MutationObserver)と、
// YouTube(SPA)のページ遷移検知をまとめたモジュール
(function (ns) {
  const ANCHOR_SELECTOR = ns.SELECTORS.thumbnailAnchorSelector;

  // href候補には動画タイトルへのリンクなど、サムネイル以外の <a> も混ざりうるため、
  // 「画像(img)を子孫に持つか」で実際のサムネイルリンクだけに絞り込む
  function isThumbnailAnchor(a) {
    if (!a || !a.href) return false;
    const videoId = ns.videoId.extractVideoId(a.href);
    if (!videoId) return false;
    return !!a.querySelector("img");
  }

  function collectThumbnailAnchors(root) {
    if (!root || !root.querySelectorAll) return [];
    return Array.from(root.querySelectorAll(ANCHOR_SELECTOR)).filter(isThumbnailAnchor);
  }

  // --- サムネイル出現検知 ---
  function onThumbnailsAdded(callback) {
    const initial = collectThumbnailAnchors(document);
    if (initial.length) callback(initial);

    const observer = new MutationObserver((mutations) => {
      const found = [];
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches && node.matches(ANCHOR_SELECTOR) && isThumbnailAnchor(node)) {
            found.push(node);
          }
          found.push(...collectThumbnailAnchors(node));
        });
      });
      if (found.length) callback(found);
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    return observer;
  }

  // --- ページ遷移検知 ---
  // 複数モジュールから onNavigate() が呼ばれても、
  // イベントリスナー/ポーリングは1つだけセットアップする(コールバックはリストで管理)
  const navigateCallbacks = [];
  let navigateSetupDone = false;

  function setupNavigateWatcherOnce() {
    if (navigateSetupDone) return;
    navigateSetupDone = true;

    const fire = () => {
      navigateCallbacks.forEach((cb) => {
        try {
          cb(location.href);
        } catch (e) {
          console.warn("[YTWatch] navigate callback error", e);
        }
      });
    };

    // YouTube独自のSPA遷移完了イベント
    window.addEventListener("yt-navigate-finish", fire);

    // 保険として、上記イベントが発火しないケースに備えURLのポーリングも行う
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        fire();
      }
    }, 1000);
  }

  function onNavigate(callback) {
    navigateCallbacks.push(callback);
    setupNavigateWatcherOnce();
  }

  ns.domObserver = { onThumbnailsAdded, onNavigate, isThumbnailAnchor };
})((window.__ytWatch = window.__ytWatch || {}));
