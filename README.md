# NDL 専門室振り分けツール

国立国会図書館 東京本館の「専門室・閲覧室案内」に基づき、利用者の質問文から最も適した専門室を判定するWebツールです。判定には [TypeSafe](https://typesafe.ai) の System One モデル「jev」を使用しています。

Cloudflare Pages + Pages Functions 上で動作します。静的な `index.html`(Vue 3をCDN読み込み)と、jevへのリクエストを中継する `functions/systemone.js` の2ファイルだけで構成されています。

## 構成

```
.
├── index.html              静的ページ(Vue 3)。利用者はここで質問文を入力する
├── functions/
│   └── systemone.js        Pages Function。jevへのリクエストを中継するプロキシ
└── README.md
```

`index.html` は `/systemone` に質問文(`state`)だけをPOSTします。`functions/systemone.js` がそれを受け取り、TypeSafeのAPIキーを付与したうえで `https://api.typesafe.ai/v1/systemone` に転送します。ブラウザとTypeSafeのAPIが同一オリジンにならないためのCORS制約は、この中継によって回避しています。APIキーはブラウザに一切渡りません。

## セキュリティについて

- **APIキー**: `TYPESAFE_API_KEY` はCloudflareのSecret(暗号化された環境変数)としてのみ保持し、リポジトリにもクライアントにも含めません。
- **クライアントが送れるのは質問文だけ**: `model` や `questions`(jevへの実際の指示内容)はすべて `functions/systemone.js` 側で固定しています。クライアントから任意のモデルや質問を指定してAPI利用枠を消費される、という経路を塞ぐためです。
- **文字数制限**: 質問文は500文字までに制限しています(サーバー側で強制)。
- **認証なしで公開される点に注意**: `/systemone` エンドポイント自体には利用者認証がないため、URLを知っていれば誰でも呼び出せます。公開範囲を絞りたい場合は、Cloudflare Turnstile(無料のbot対策)の導入や、Cloudflareのレート制限ルールを追加することを検討してください。

## デプロイ手順(Cloudflare Pages)

1. このリポジトリをGitHubにpushします
2. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → 「Import an existing Git repository」からこのリポジトリを選択します
3. ビルドコマンドは空のままでデプロイします(静的HTMLのため)
4. デプロイ後、プロジェクトの **Settings → Environment variables** で `TYPESAFE_API_KEY` を **Secret** として登録します(必ずSecretを選択し、平文のVariableにはしないでください)
5. 以降、`main`(または設定したブランチ)にpushするたびに自動で再デプロイされます

## 判定ロジック

jev の `questions` として以下2つを1回のリクエストで並列評価しています。

- `room`(Choice): 質問文に最も適した専門室を、各室の資料範囲を説明した `criteria` から選択
  - 人文総合情報室 / 科学技術・経済情報室 / 古典籍資料室 / 地図室 / 憲政資料室 / 音楽・映像資料室 / 議会官庁資料室 / 新聞資料室 / 該当なし
- `consultation_only`(Noul): 利用者が特定の資料ではなく調べ方の相談をしているかどうか

専門室の分類・資料範囲の説明文は、[国立国会図書館「専門室・閲覧室案内」](https://www.ndl.go.jp/tokyo/reading_info)の記載に基づいています。表示用ラベル(`index.html` 内の `ROOMS`)と、jevに渡す判定基準(`functions/systemone.js` 内の `ROOM_CRITERIA`)は同じキー名で対応させているので、専門室を追加・変更する場合は両方を更新してください。

## 注意事項

- 本ツールは国立国会図書館の公式サービスではありません
- jevの判定結果は参考情報です。特に confidence が低い場合や、古典籍資料室・憲政資料室など許可申請が必要な資料に関わる場合は、必ず[国立国会図書館の公式案内](https://www.ndl.go.jp/tokyo/reading_info)や窓口で確認してください
- 各専門室の開室時間・利用条件は変更される場合があるため、最新情報は公式サイトをご確認ください

## ライセンス

未定(必要に応じて追記してください)
