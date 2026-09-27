# NDL専門室振り分けインタビュー

利用者の相談内容から、国立国会図書館 東京本館の専門室(または総合案内)へ
自動で振り分けるためのCloudflare Workerとフロントエンドです。

## 構成

```
.
├── public/
│   └── index.html   静的ページ(Vue 3、CDN読み込み)。利用者はここで相談内容を入力する
├── src/
│   └── worker.js     Workerスクリプト。静的ファイルの配信、/systemone、/handoverの中継を行う
├── wrangler.jsonc    Cloudflare Workerの設定
└── README.md
```

## セキュリティ上の注意

- **`/systemone`・`/handover`はどちらも認証なしで呼び出せます。** 特に`/handover`は
  利用者が入力した文章(`state`)をそのままGeminiへのプロンプトに埋め込むため、
  第三者が直接叩けば実質的に無認証のAPI中継として使われてしまいます。公開前に、
  Cloudflareの[Rate Limiting Rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)
  や[Turnstile](https://developers.cloudflare.com/turnstile/)などで、同一IP・
  同一セッションからの過度な呼び出しを制限することを強く推奨します。
- `/handover`のプロンプトには、ヒアリング記録内の指示文めいた記述に従わないよう
  防御的な一文を入れていますが、プロンプトインジェクションを完全には防げません。
  生成された引継ぎ文書は「参考情報」として扱い、職員が内容を鵜呑みにせず確認する
  運用にしてください。
- `public/index.html`はVueをCDN(unpkg)から読み込んでいます。SRI(整合性ハッシュ)
  は付けていないため、より厳格にするならバージョンを固定した上でSRIを付与するか、
  Vue本体を`public/`配下に同梱してCDN依存を無くすことを検討してください。

## 全体の流れ

1. 利用者が`public/index.html`で最初の相談内容を入力する。
2. フロントエンドが`POST /systemone`を呼び出す。`src/worker.js`がjev(typesafe.ai)
   に中継し、現時点で最も近い専門室(`room`)と、次に聞くべき質問(`next_question`)
   を判定する。
3. `room`の確信度(`confidence`)が十分でなければ、`next_question`の質問文を
   利用者に提示して回答してもらい、これまでの対話を積み上げてもう一度2に戻る。
   - 用意している質問候補を全て聞き終えるか、規定のターン数に達しても確信度が
     十分にならない場合は、`final_room`が`"information"`(総合案内)になる。
4. 確信度が十分になったら(`sufficient: true`)、`POST /handover`を呼び出し、
   Gemini APIにこれまでの対話記録を渡して、担当職員への引継ぎ文書を生成する。
5. フロントエンドは案内先の室名と引継ぎ文書を利用者に表示する。

`src/worker.js`冒頭のコメントに、より詳細な設計意図とAPIのリクエスト/レスポンス
形式を記載している。

## セットアップ

### 前提

- Node.js がインストールされていること
- Cloudflareアカウントを持っていること
- [typesafe.ai](https://docs.typesafe.ai)のAPIキー(jev利用)
- [Google AI Studio](https://ai.google.dev)で発行したGemini APIキー

### 手順

```bash
# wranglerをインストール(未導入の場合)
npm install -g wrangler

# Cloudflareにログイン
wrangler login

# 秘密情報をSecretとして登録(値は対話的に入力する)
wrangler secret put TYPESAFE_API_KEY
wrangler secret put GEMINI_API_KEY

# ローカルで動作確認
wrangler dev

# デプロイ
wrangler deploy
```

`wrangler secret put`で登録した値は、Cloudflareダッシュボードの
「対象Worker → Settings → Variables and Secrets」でも確認・変更できる
(表示は隠されるが、値自体はここで管理されている)。平文の環境変数(Text)
ではなく必ず"Secret"として登録すること。

## 主な設定値(src/worker.js)

用途に応じて、コード冒頭付近の以下の定数を調整する。

| 定数 | 内容 | 初期値 |
|---|---|---|
| `MAX_STATE_LENGTH` | 対話全文の文字数上限 | 4000 |
| `ROOM_CONFIDENCE_THRESHOLD` | この確信度以上でroomの判定を確定させる | 0.65 |
| `MAX_TURNS` | 質問を打ち切るまでの最大ターン数 | 5 |
| `GEMINI_MODEL_DEFAULT` | `GEMINI_MODEL`環境変数が未設定の場合に使うモデル名 | `gemini-2.5-flash` |
| `ROOM_CRITERIA` | 各専門室の判定基準(jevに渡す説明文) | - |
| `ROOM_LABELS` | 引継ぎ文書に載せる室の表示名 | - |
| `CANDIDATE_QUESTIONS` | 次に聞く質問の候補プール | - |

**`ROOM_LABELS`は仮の室名です。** 実際のNDL東京本館の室名と異なる場合がある
ため、運用開始前に必ず確認・修正してください。

`GEMINI_MODEL`はwrangler.jsoncの`vars`、またはCloudflareダッシュボードの
環境変数から上書きできる(Secretではなく通常の環境変数でよい)。Geminiの
モデル名は更新頻度が高いため、最新の推奨モデルは
https://ai.google.dev/gemini-api/docs を確認すること。

## API仕様

### `POST /systemone`

リクエスト:

```json
{
  "state": "利用者の相談文 + これまでの質問と回答の履歴(全文)",
  "asked_questions": ["subject_area", "time_period"]
}
```

レスポンス(例):

```json
{
  "answers": {
    "room": { "choice": "map", "confidence": 0.42, "probabilities": { "...": 0.0 } },
    "next_question": { "choice": "material_format", "text": "探している資料の形式は..." }
  },
  "sufficient": false,
  "final_room": null
}
```

`sufficient: true`のとき、`final_room`(専門室のid、または`"information"`)を
案内先として採用する。

### `POST /handover`

リクエスト:

```json
{
  "state": "/systemoneに渡していた対話全文",
  "final_room": "map"
}
```

レスポンス:

```json
{
  "room": "map",
  "room_label": "地図室",
  "document": "職員への引継ぎ文書(テキスト)"
}
```
