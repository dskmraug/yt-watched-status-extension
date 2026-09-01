// chrome.storage.sync を使った複数端末間の視聴済み状態の自動同期。
// background service worker からのみ読み込まれる(content-script/optionsからは使わない)。
//
// 設計:
// - 動画1本=1アイテムだと512アイテム上限にすぐ達するため、videoIdのハッシュ値で
//   バケット(SYNC_BUCKET_COUNT個)に振り分け、1バケット=複数動画IDを保存する。
// - 各バケットの値は "videoId(11文字)+updatedAt(epoch秒をbase64で6桁固定)" を
//   区切り文字なしで連結した固定長(17文字/件)の文字列。base64はvideoIdと同じ
//   64種類の文字を使う独自エンコード(JS標準のNumber#toString(radix)はradix<=36
//   までしか対応していないため専用の変換関数を用意している)。
// - 「視聴済みの動画のみ」を保存し、未視聴はエントリを持たないことで表現する
//   (存在しない=未視聴)。
// - chrome.storage.sync はアイテム単位で同期されるため、複数端末が同じバケットを
//   ほぼ同時に更新すると後勝ちで上書きされる恐れがある。これに対しては
//   (1)書き込み直前に必ず最新のバケットを取得してから差分を適用し、
//   (3)書き込み後に再取得して反映を検証し、ズレていれば最新状態を取り直して
//   リトライする、という楽観的ロックで衝突の窓を狭める。
(function (ns) {
  const BUCKET_PREFIX = ns.SYNC_BUCKET_PREFIX;
  const BUCKET_COUNT = ns.SYNC_BUCKET_COUNT;
  const VIDEO_ID_LENGTH = ns.SYNC_VIDEO_ID_LENGTH;
  const TIMESTAMP_LENGTH = ns.SYNC_TIMESTAMP_LENGTH;
  const TIMESTAMP_ALPHABET = ns.SYNC_TIMESTAMP_ALPHABET;
  const TIMESTAMP_BASE = TIMESTAMP_ALPHABET.length;
  const ENTRY_LENGTH = VIDEO_ID_LENGTH + TIMESTAMP_LENGTH;
  const MAX_WRITE_ATTEMPTS = 3;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // videoId(URL-safeな英数字・-・_、11文字固定)をバケット番号に変換する簡易ハッシュ(djb2)
  function hashVideoId(videoId) {
    let hash = 5381;
    for (let i = 0; i < videoId.length; i++) {
      hash = ((hash << 5) + hash + videoId.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function bucketKeyFor(videoId) {
    const index = hashVideoId(videoId) % BUCKET_COUNT;
    return BUCKET_PREFIX + index;
  }

  function isBucketKey(key) {
    return typeof key === "string" && key.indexOf(BUCKET_PREFIX) === 0;
  }

  // epoch秒 -> TIMESTAMP_ALPHABET(64種類)によるTIMESTAMP_LENGTH桁固定文字列
  function encodeTimestamp(sec) {
    let n = sec;
    let out = "";
    for (let i = 0; i < TIMESTAMP_LENGTH; i++) {
      out = TIMESTAMP_ALPHABET[n % TIMESTAMP_BASE] + out;
      n = Math.floor(n / TIMESTAMP_BASE);
    }
    return out;
  }

  // TIMESTAMP_ALPHABET文字列 -> epoch秒(不正な文字が含まれる場合はNaN)
  function decodeTimestamp(str) {
    let n = 0;
    for (let i = 0; i < str.length; i++) {
      const digit = TIMESTAMP_ALPHABET.indexOf(str[i]);
      if (digit < 0) return NaN;
      n = n * TIMESTAMP_BASE + digit;
    }
    return n;
  }

  // バケット文字列 -> Map<videoId, updatedAtSec>
  function decodeBucket(raw) {
    const map = new Map();
    if (typeof raw !== "string") return map;
    for (let i = 0; i + ENTRY_LENGTH <= raw.length; i += ENTRY_LENGTH) {
      const chunk = raw.slice(i, i + ENTRY_LENGTH);
      const videoId = chunk.slice(0, VIDEO_ID_LENGTH);
      const ts = decodeTimestamp(chunk.slice(VIDEO_ID_LENGTH));
      if (videoId && Number.isFinite(ts)) {
        map.set(videoId, ts);
      }
    }
    return map;
  }

  // Map<videoId, updatedAtSec> -> バケット文字列
  function encodeBucket(map) {
    const ids = Array.from(map.keys()).sort();
    return ids.map((id) => id + encodeTimestamp(map.get(id))).join("");
  }

  function getBucketRaw(bucketKey) {
    return new Promise((resolve) => {
      chrome.storage.sync.get([bucketKey], (result) => {
        if (chrome.runtime.lastError) {
          console.warn("[YTWatch] sync get failed", chrome.runtime.lastError);
          resolve("");
          return;
        }
        resolve(typeof result[bucketKey] === "string" ? result[bucketKey] : "");
      });
    });
  }

  function setBucketRaw(bucketKey, raw) {
    return new Promise((resolve) => {
      if (raw === "") {
        chrome.storage.sync.remove(bucketKey, () => {
          if (chrome.runtime.lastError) {
            console.warn("[YTWatch] sync remove failed", chrome.runtime.lastError);
          }
          resolve();
        });
        return;
      }
      chrome.storage.sync.set({ [bucketKey]: raw }, () => {
        if (chrome.runtime.lastError) {
          console.warn("[YTWatch] sync set failed", chrome.runtime.lastError);
        }
        resolve();
      });
    });
  }

  // ローカルでの視聴状態の変化を対応バケットへ反映する(衝突対策1+3)
  async function pushWatchState(videoId, watched, updatedAtMs) {
    const bucketKey = bucketKeyFor(videoId);
    const updatedAtSec = Math.floor(updatedAtMs / 1000);

    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
      const raw = await getBucketRaw(bucketKey);
      const map = decodeBucket(raw);
      const existing = map.get(videoId);

      if (watched) {
        if (existing !== undefined && existing >= updatedAtSec) return; // 既に同等以上の情報がある
        map.set(videoId, updatedAtSec);
      } else {
        if (existing === undefined) return; // 既に未視聴(エントリなし)
        map.delete(videoId);
      }

      const nextRaw = encodeBucket(map);
      if (nextRaw === raw) return; // 変化なし

      await setBucketRaw(bucketKey, nextRaw);

      const verifyRaw = await getBucketRaw(bucketKey);
      if (verifyRaw === nextRaw) return; // 反映確認OK

      // 他端末の書き込みと衝突した可能性がある。最新状態を取り直してリトライする
      await sleep(50 + Math.floor(Math.random() * 150));
    }

    console.warn("[YTWatch] pushWatchState: 書き込みが収束しませんでした", videoId);
  }

  // リモート(他端末)側の状態をローカルへ反映する
  function applyRemoteToLocal(videoId, watched, updatedAtSec) {
    const key = ns.storage.keyFor(videoId);
    const value = {
      status: watched ? "watched" : "unwatched",
      source: "synced",
      updatedAt: updatedAtSec * 1000,
    };
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          console.warn("[YTWatch] applyRemoteToLocal failed", chrome.runtime.lastError);
        }
        resolve();
      });
    });
  }

  // sync領域のバケット変化(onChangedイベント)を受けて、差分のあった動画IDのみローカルに反映する
  async function applyBucketChange(bucketKey, oldRaw, newRaw) {
    const oldMap = decodeBucket(oldRaw);
    const newMap = decodeBucket(newRaw);
    const videoIds = new Set([...oldMap.keys(), ...newMap.keys()]);

    for (const videoId of videoIds) {
      const oldTs = oldMap.get(videoId);
      const newTs = newMap.get(videoId);
      if (oldTs === newTs) continue;

      const local = await ns.storage.getWatchStatus(videoId);
      const localUpdatedAt = local && typeof local.updatedAt === "number" ? local.updatedAt : -Infinity;

      if (newTs !== undefined) {
        // リモートで視聴済みになった(または更新された)
        const remoteUpdatedAt = newTs * 1000;
        if (remoteUpdatedAt > localUpdatedAt) {
          await applyRemoteToLocal(videoId, true, newTs);
        }
      } else if (
        local &&
        local.status === "watched" &&
        typeof oldTs === "number" &&
        localUpdatedAt <= oldTs * 1000
      ) {
        // リモートでエントリが削除された(未視聴に戻された)。
        // ローカルがそれより新しい独自の変更を持っていない場合のみ追従する
        await applyRemoteToLocal(videoId, false, Math.floor(Date.now() / 1000));
      }
    }
  }

  // 起動時・インストール時に、ローカルとリモートの状態をまとめて突き合わせる。
  // videoIdごとに updatedAt が新しい方を勝者として、もう一方へ反映する。
  async function reconcileAll() {
    const [localEntries, syncData] = await Promise.all([
      ns.storage.getAllWatchEntries(),
      new Promise((resolve) => {
        chrome.storage.sync.get(null, (result) => {
          if (chrome.runtime.lastError) {
            console.warn("[YTWatch] reconcileAll: sync get failed", chrome.runtime.lastError);
            resolve({});
            return;
          }
          resolve(result || {});
        });
      }),
    ]);

    const remoteMap = new Map();
    Object.keys(syncData).forEach((key) => {
      if (!isBucketKey(key)) return;
      decodeBucket(syncData[key]).forEach((ts, videoId) => remoteMap.set(videoId, ts));
    });

    const allVideoIds = new Set([...Object.keys(localEntries), ...remoteMap.keys()]);

    for (const videoId of allVideoIds) {
      const local = localEntries[videoId];
      const localWatched = !!(local && local.status === "watched");
      const localUpdatedAt = local && typeof local.updatedAt === "number" ? local.updatedAt : -Infinity;

      const remoteTs = remoteMap.get(videoId);
      const remoteWatched = remoteTs !== undefined;
      const remoteUpdatedAt = remoteWatched ? remoteTs * 1000 : -Infinity;

      if (remoteUpdatedAt > localUpdatedAt) {
        if (remoteWatched !== localWatched) {
          await applyRemoteToLocal(videoId, remoteWatched, remoteTs);
        }
      } else if (localUpdatedAt > remoteUpdatedAt) {
        if (localWatched !== remoteWatched) {
          await pushWatchState(videoId, localWatched, localUpdatedAt);
        }
      }
    }
  }

  ns.syncStorage = {
    bucketKeyFor,
    isBucketKey,
    decodeBucket,
    encodeBucket,
    pushWatchState,
    applyBucketChange,
    reconcileAll,
  };
})((globalThis.__ytWatch = globalThis.__ytWatch || {}));
