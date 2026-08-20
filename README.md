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
- 動画ページのチャンネル登録ボタン横に視聴済み切替ボタンを表示(常に手動でトグル可能)
- タブがアクティブな状態での再生時間を計測し、設定した閾値(割合または時間、いずれか早い方)に
  到達すると自動的に視聴済みにする
- 視聴状態は `chrome.storage.local` に保存され、ブラウザ再起動後も保持される

## ディレクトリ構成

```
extension/
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
