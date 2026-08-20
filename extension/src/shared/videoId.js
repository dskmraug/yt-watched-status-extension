// URL から YouTube 動画ID(11文字)を抽出するユーティリティ
(function (ns) {
  function extractVideoId(url) {
    if (!url) return null;
    try {
      const u = new URL(url, location.href);

      if (u.pathname === "/watch") {
        const v = u.searchParams.get("v");
        return v && v.length === 11 ? v : v; // 通常は11文字だが将来仕様変更にも一応耐える
      }

      const shortsMatch = u.pathname.match(/^\/shorts\/([\w-]{11})/);
      if (shortsMatch) return shortsMatch[1];

      const embedMatch = u.pathname.match(/^\/embed\/([\w-]{11})/);
      if (embedMatch) return embedMatch[1];

      return null;
    } catch (e) {
      return null;
    }
  }

  function getCurrentVideoId() {
    return extractVideoId(location.href);
  }

  ns.videoId = { extractVideoId, getCurrentVideoId };
})((window.__ytWatch = window.__ytWatch || {}));
