// chrome.storage.local への読み書きをまとめた共通ラッパー
(function (ns) {
  const STORAGE_PREFIX = ns.STORAGE_PREFIX;
  const SETTINGS_KEY = ns.SETTINGS_KEY;
  const DEFAULT_SETTINGS = ns.DEFAULT_SETTINGS;

  function keyFor(videoId) {
    return STORAGE_PREFIX + videoId;
  }

  function isWatchKey(key) {
    return key.indexOf(STORAGE_PREFIX) === 0;
  }

  function videoIdFromKey(key) {
    return key.slice(STORAGE_PREFIX.length);
  }

  function getWatchStatus(videoId) {
    return new Promise((resolve) => {
      chrome.storage.local.get([keyFor(videoId)], (result) => {
        if (chrome.runtime.lastError) {
          console.warn("[YTWatch] getWatchStatus failed", chrome.runtime.lastError);
          resolve(null);
          return;
        }
        resolve(result[keyFor(videoId)] || null);
      });
    });
  }

  // 複数動画分の視聴状態をまとめて取得する(サムネイル一覧描画時の負荷軽減用)
  function getWatchStatusBulk(videoIds) {
    return new Promise((resolve) => {
      if (!videoIds || videoIds.length === 0) {
        resolve({});
        return;
      }
      const keys = videoIds.map(keyFor);
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          console.warn("[YTWatch] getWatchStatusBulk failed", chrome.runtime.lastError);
          resolve({});
          return;
        }
        const map = {};
        videoIds.forEach((id) => {
          map[id] = result[keyFor(id)] || null;
        });
        resolve(map);
      });
    });
  }

  function setWatchStatus(videoId, status, source) {
    const value = {
      status: status,
      source: source, // "manual" | "auto"
      updatedAt: Date.now(),
    };
    return new Promise((resolve) => {
      chrome.storage.local.set({ [keyFor(videoId)]: value }, () => {
        if (chrome.runtime.lastError) {
          console.warn("[YTWatch] setWatchStatus failed", chrome.runtime.lastError);
        }
        resolve(value);
      });
    });
  }

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([SETTINGS_KEY], (result) => {
        if (chrome.runtime.lastError) {
          console.warn("[YTWatch] getSettings failed", chrome.runtime.lastError);
          resolve(Object.assign({}, DEFAULT_SETTINGS));
          return;
        }
        resolve(Object.assign({}, DEFAULT_SETTINGS, result[SETTINGS_KEY] || {}));
      });
    });
  }

  function setSettings(settings) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [SETTINGS_KEY]: settings }, () => resolve(settings));
    });
  }

  // 保存されている視聴状態を全件取得する(エクスポート用)
  // 戻り値: { [videoId]: { status, source, updatedAt } }
  function getAllWatchEntries() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (result) => {
        if (chrome.runtime.lastError) {
          console.warn("[YTWatch] getAllWatchEntries failed", chrome.runtime.lastError);
          resolve({});
          return;
        }
        const entries = {};
        Object.keys(result).forEach((key) => {
          if (isWatchKey(key)) {
            entries[videoIdFromKey(key)] = result[key];
          }
        });
        resolve(entries);
      });
    });
  }

  // インポートしたデータを既存データとマージする。
  // 同じ動画IDが両方に存在する場合は updatedAt が新しい方を採用する。
  // 戻り値: { importedCount, skippedCount }
  async function importWatchEntries(importedEntries) {
    const existing = await getAllWatchEntries();
    const toWrite = {};
    let importedCount = 0;
    let skippedCount = 0;

    Object.keys(importedEntries || {}).forEach((videoId) => {
      const incoming = importedEntries[videoId];
      if (!incoming || (incoming.status !== "watched" && incoming.status !== "unwatched")) {
        return; // 不正なレコードは無視する
      }

      const current = existing[videoId];
      const incomingTime = typeof incoming.updatedAt === "number" ? incoming.updatedAt : 0;
      const currentTime = current && typeof current.updatedAt === "number" ? current.updatedAt : -1;

      if (!current || incomingTime >= currentTime) {
        toWrite[keyFor(videoId)] = {
          status: incoming.status,
          source: incoming.source === "auto" ? "auto" : "manual",
          updatedAt: incomingTime || Date.now(),
        };
        importedCount += 1;
      } else {
        skippedCount += 1; // 既存の方が新しいためスキップ
      }
    });

    if (Object.keys(toWrite).length === 0) {
      return { importedCount, skippedCount };
    }

    return new Promise((resolve) => {
      chrome.storage.local.set(toWrite, () => {
        if (chrome.runtime.lastError) {
          console.warn("[YTWatch] importWatchEntries failed", chrome.runtime.lastError);
        }
        resolve({ importedCount, skippedCount });
      });
    });
  }

  ns.storage = {
    getWatchStatus,
    getWatchStatusBulk,
    setWatchStatus,
    getSettings,
    setSettings,
    getAllWatchEntries,
    importWatchEntries,
    isWatchKey,
    videoIdFromKey,
    keyFor,
  };
})((globalThis.__ytWatch = globalThis.__ytWatch || {}));
