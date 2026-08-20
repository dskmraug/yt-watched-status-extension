// content script エントリーポイント
// 各モジュールを初期化する。動画ページ判定は各モジュール内部で行うため、
// ここでは常にすべて初期化してよい(非対象ページでは内部で自動的に無処理となる)
(function (ns) {
  function init() {
    ns.thumbnailOverlay.init();
    ns.videoPageButton.init();
    ns.playbackTracker.init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})((window.__ytWatch = window.__ytWatch || {}));
