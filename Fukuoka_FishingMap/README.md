# 福岡 漁港と釣りの地図

福岡県の指定漁港65港を Google Maps 上に表示する、Node.js の Web アプリです。漁港一覧から選択すると、岸釣りの季節の参考情報、天気・風、気象庁の潮位予測、現在地からの直線距離と車の経路を表示します。

## データについての重要な注意

- 漁港の対象は、水産庁の2022年4月時点の一覧をもとにした[65港の一覧](https://nekonoko.online/fishing-port/)と照合しています。[水産庁の漁港一覧](https://www.jfa.maff.go.jp/j/gyoko_gyozyo/g_zyoho_bako/gyoko_itiran/sub81.html)も参照してください。指定や施設は変更されることがあります。
- 全65港の座標は[国土数値情報「漁港」点データ](https://nlftp.mlit.go.jp/ksj/gmlold/datalist/gmlold_KsjTmplt-C09.html)の福岡県データを使用しています。1984年の古い代表位置（JGD2000）であり、現在の施設位置、港の入口、釣りが可能な場所を保証しません。出典には不明な情報を含むとの注意があります。港名「稚田」は一覧の「椎田」として表示しています。座標は国のデータとの照合であり、現地測量や Google Maps との個別検証ではありません。
- 魚種は漁港別の実際の釣果ではなく、[新宮漁港の岸釣り情報](https://www.turi-portal.com/teibo/2954)または[有明海の沿岸釣り情報](https://tsurispot.com/area-guide/ariake-sea)をもとにした地域・月別の一般的な目安です。実際に釣れるか、釣りが許されるかは分かりません。船釣り・沖釣りの釣果は含みません。沖ノ島は一般上陸が原則できません。
- 天気と風は [Open-Meteo](https://open-meteo.com/) のモデルに基づく現在値であり、実測ではありません。風向は風が吹いてくる方向です。サービスの利用条件・料金を確認してください。
- 潮位は[気象庁の潮位表](https://www.data.jma.go.jp/kaiyou/db/tide/suisan/index.php)の毎時天文潮位を、博多・唐津・苅田・大牟田の代表地点から表示します。筑前海では博多と唐津の直線距離で選び、豊前海は苅田、有明海は大牟田を使用します。漁港の潮位そのものではなく、海岸地形や気象等による差があります。予測値を安全判断の唯一の根拠にしないでください。対象年のデータがまだ提供されていない場合はエラーを表示します。
- 位置情報は利用者の操作と許可がある場合のみ取得し、経路検索時に Google Maps に送信します。経路は車の候補で、立入権や道路・航路の利用可能性を保証しません。離島等では車の経路が見つからない場合があります。
- 漁港の立入・釣りの可否は表示していません。施設管理者の規則や現地の掲示、[福岡県の遊漁ルール](https://www.pref.fukuoka.lg.jp/contents/yugyo-rule.html)を事前に確認し、漁業の妨げにならないようにしてください。

## Google Maps の準備

1. Google Cloud でプロジェクトを作成し、課金を有効にします。Google Maps Platform の使用料・無料枠は Google の案内を確認してください。
2. **Maps JavaScript API** と **Directions API（従来版）** を有効にします。画面の地図と車の経路検索にそれぞれ必要です。
3. ブラウザ用 API キーを作成し、アプリケーション制限を「ウェブサイト」にして、実際に使用する Render の URL（カスタムドメインを使う場合はそれも）と、必要なら `http://localhost:8080/*` を許可します。API 制限は上記の2 API に絞ります。
4. キーはブラウザへ配信されるため秘密にはできません。必ず HTTP リファラー制限、API 制限、使用量上限・予算アラートを設定してください。Directions API の利用可否や課金状況も確認してください。

## ローカル起動

Node.js 20 以上が必要です。外部 npm パッケージは不要です。

```powershell
cd C:\Git\Okyaku\Fukuoka_FishingMap
$env:GOOGLE_MAPS_API_KEY = "作成したキー"
npm start
```

ブラウザで `http://localhost:8080` を開きます。現在地の取得には、localhost または HTTPS とブラウザの許可が必要です。Google Maps のキーが未設定または読み込みに失敗した場合、Leaflet と OpenStreetMap による代替地図を表示します。代替地図ではアプリ内に車ルートを描画できませんが、現在地を取得すると Google Maps へのルートリンクを表示します。Leaflet の CDN、OpenStreetMap のタイル、気象・潮位情報にはインターネット接続が必要です。地図表示時には各配信元へ地図タイルやライブラリのリクエストが送信されます。

## Render へのデプロイ

1. このフォルダを Git リポジトリに追加して GitHub 等へ push します。API キーはリポジトリに書かないでください。
2. Render で **New → Blueprint** を選び、そのリポジトリを接続します。現在の構成（リポジトリの直下に `Fukuoka_FishingMap` がある構成）では Blueprint のパスに `Fukuoka_FishingMap/render.yaml` を指定します。`rootDir` によって、ビルド・起動コマンドはこのフォルダで実行されます。このフォルダ自体をリポジトリのルートにする場合は、`render.yaml` の `rootDir` 行を削除してください。
3. `GOOGLE_MAPS_API_KEY` の入力欄にブラウザ用キーを設定し、デプロイします。`PORT` は Render が自動設定します。
4. 発行された HTTPS URL をキーの許可リファラーに追加し、Google Cloud の変更が反映された後に地図、天気、潮位、位置情報、ルートを確認します。独自ドメインを使う場合も同様に追加します。

`npm test` で潮位のパースとデータの整合性を確認できます。Google Maps、Open-Meteo、気象庁の稼働・制限は別途実環境で確認してください。
