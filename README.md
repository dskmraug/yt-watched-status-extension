# YouTube 視聴済み管理 Chrome拡張機能

YouTubeの動画サムネイルに視聴済み/未視聴のバッジを表示し、
動画ページのボタンや自動再生判定によって視聴状態を管理する拡張機能です。

## インストール方法(開発者モードでの読み込み)

1. Chromeで `chrome://extensions` を開く
2. 右上の「デベロッパーモード」をオンにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このフォルダ(`extension` フォルダ、`manifest.json` があるディレクトリ)を選択する
5. YouTube (`https://www.youtube.com`) を開くとバッジ・ボタンが表示される

## 設定

拡張機能一覧の本拡張の「詳細」→「拡張機能のオプション」から、
自動視聴済み判定のしきい値(再生割合・再生時間)を変更できます。
初期値は 割合50% / 時間10分 です。

## 機能概要

- サムネイル左上に視聴済み(緑・☑)/未視聴(赤・□)のバッジを表示
- 動画ページの左上に視聴済み/未視聴切替ボタンを表示(常に手動でトグル可能)
- タブがアクティブな状態での再生時間を計測し、設定した閾値(割合または時間、いずれか早い方)に
  到達すると自動的に視聴済みにする
- 視聴状態は `chrome.storage.local` に保存され、ブラウザ再起動後も保持される

## 既知の制限・今後の調整が必要な点

- YouTube側のDOM構造・クラス名は変更される可能性があるため、
  セレクタが古くなった場合は `src/shared/constants.js` の `SELECTORS` を更新してください
  (特に登録ボタン周辺のセレクタは変更されやすい箇所です)
- バッジの位置・サイズは実際の表示を見ながら `src/styles/overlay.css` で微調整が必要な場合があります
- ホーム画面などサムネイルが極端に多いページでのパフォーマンスは、実運用で問題があれば
  IntersectionObserverによる遅延描画などの追加最適化を検討してください
- 複数端末間でのデータ同期は未対応です(`chrome.storage.local` のためこの端末のみ)

## ディレクトリ構成

```
yt-watched-status-extension/
├── manifest.json
├── README.md
└── src/
    ├── content/
    │   ├── content-script.js
    │   ├── domObserver.js
    │   ├── thumbnailOverlay.js
    │   ├── videoPageButton.js
    │   └── playbackTracker.js
    ├── options/
    │   ├── options.html
    │   ├── options.js
    │   └── options.css
    ├── shared/
    │   ├── constants.js
    │   ├── videoId.js
    │   └── storage.js
    └── styles/
        └── overlay.css
```
