// 共通定数
// content-script / options ページ / background service worker のいずれからも
// <script> タグ(またはservice workerではimportScripts)で直接読み込む前提のため、
// ES modules の import/export は使わず globalThis.__ytWatch 名前空間に載せる。
// (service workerには window が存在しないため globalThis を使う。ブラウザ環境では window === globalThis)
(function (ns) {
  // 視聴状態を保存する際のキー接頭辞。実際のキーは `watch:<videoId>` になる
  ns.STORAGE_PREFIX = "watch:";

  // 自動判定の閾値等、設定値を保存するキー
  ns.SETTINGS_KEY = "settings";

  // 設定の初期値
  ns.DEFAULT_SETTINGS = {
    thresholdPercent: 50, // 再生割合(%)のしきい値
    thresholdMinutes: 10, // 再生時間(分)のしきい値
  };

  // YouTube側のDOM変更に備え、セレクタは候補を配列で保持し
  // 先頭から順に見つかったものを採用する
  ns.SELECTORS = {
    // サムネイルへのリンク候補。
    // ・旧構造(検索結果/再生リスト等): <a id="thumbnail">
    // ・新構造(ホーム/チャンネル等の"lockup"系コンポーネント): href が /watch?v=... または /shorts/... の <a>
    // どちらも一旦この時点では候補として拾い、実際にサムネイル画像(img)を含むかどうかで
    // タイトルリンク等と区別する(domObserver.js の isThumbnailAnchor を参照)
    thumbnailAnchorSelector: 'a#thumbnail, a[href*="/watch?v="], a[href^="/shorts/"]',
    // 視聴済み切替ボタンをオーバーレイ表示する対象。
    // 登録ボタン周辺は他ボタン追加等でスペースが不足しやすいため、
    // 動画プレーヤー本体を基準にする
    playerContainer: ["#movie_player", ".html5-video-player"],
    videoElement: ["video.html5-main-video", "video"],
  };

  ns.BADGE_ATTR = "data-watch-badge-applied";
  ns.BUTTON_ID = "yt-watch-toggle-button";

  // 複数端末間の自動同期(chrome.storage.sync)用の設定。
  // 動画1本=1アイテムだと512アイテム上限にすぐ達するため、
  // 複数の動画IDを1アイテム(バケット)にまとめて格納する。
  // バケットの割り当てはvideoIdのハッシュ値で決まる(ハッシュバケット方式)。
  ns.SYNC_BUCKET_PREFIX = "wb:"; // watched bucket
  ns.SYNC_BUCKET_COUNT = 64;
  // 1エントリは "videoId(11文字) + updatedAt(epoch秒をbase36で7桁固定)" の
  // 区切り文字なし固定長(18文字)で連結して1バケットの文字列を構成する。
  // 視聴済みの動画のみを保存し、未視聴はエントリ自体を持たないことで表現する。
  ns.SYNC_VIDEO_ID_LENGTH = 11;
  ns.SYNC_TIMESTAMP_LENGTH = 7;
  ns.SYNC_TIMESTAMP_RADIX = 36;
})((globalThis.__ytWatch = globalThis.__ytWatch || {}));
