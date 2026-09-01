// background service worker
// chrome.storage.local(視聴状態の実体) と chrome.storage.sync(複数端末間の同期用バケット)
// を常時橋渡しする。YouTubeのタブを開いていなくても同期が効くよう、
// content-scriptではなくここに同期ロジックを集約している。
importScripts("../shared/constants.js", "../shared/storage.js", "../shared/syncStorage.js");

(function () {
  const ns = self.__ytWatch;

  function handleLocalChange(changes) {
    Object.keys(changes).forEach((key) => {
      if (!ns.storage.isWatchKey(key)) return;
      const newValue = changes[key].newValue;
      if (!newValue) return;

      const videoId = ns.storage.videoIdFromKey(key);
      const watched = newValue.status === "watched";
      const updatedAtMs = typeof newValue.updatedAt === "number" ? newValue.updatedAt : Date.now();
      ns.syncStorage.pushWatchState(videoId, watched, updatedAtMs);
    });
  }

  function handleSyncChange(changes) {
    Object.keys(changes).forEach((key) => {
      if (!ns.syncStorage.isBucketKey(key)) return;
      ns.syncStorage.applyBucketChange(key, changes[key].oldValue, changes[key].newValue);
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      handleLocalChange(changes);
    } else if (area === "sync") {
      handleSyncChange(changes);
    }
  });

  // 拡張機能のインストール・更新時、およびブラウザ起動時に
  // ローカル/リモートの状態を突き合わせる(未同期分のキャッチアップ)
  chrome.runtime.onInstalled.addListener(() => {
    ns.syncStorage.reconcileAll();
  });

  chrome.runtime.onStartup.addListener(() => {
    ns.syncStorage.reconcileAll();
  });
})();
