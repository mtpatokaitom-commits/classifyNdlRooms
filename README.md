# NDL専門室振り分けインタビュー (classifyNdlRooms)

利用者の相談内容から、国立国会図書館（NDL）東京本館の最適な専門室（または総合案内）へ自動で振り分け、担当職員向けの引継ぎ文書を生成するための Cloudflare Worker とフロントエンドです。

---

## 主な機能・特徴

1. **2フェーズ構成のAI対話インタビュー**
   - **フェーズ1 (案内先の判定)**: 利用者の入力から、最も適切な専門室を絞り込むための質問を行います。
   - **フェーズ2 (振分け後の追加ヒアリング)**: 案内先確定後、担当職員が書庫出納や調査回答をスムーズに行うための補足情報（年代、地域、具体的書名、利用目的、期限など）を追加でヒアリングします。
2. **適合度（確率）表示と最終選択UI**
   - ヒアリング完了後、AIが推測した専門室の適合度（%）と推奨バッジを候補一覧として提示します。利用者が納得した案内先を選択して確定できます。
3. **Gemini による職員向け引継ぎ文書の自動生成**
   - ヒアリング終了後、Google Gemini API（Interactions API）を活用し、窓口職員が即座に状況を把握できる簡潔な「要約・判明事項・懸念点」の引継ぎメモを生成します。
4. **音声入力・音声読み上げ対応（アクセシビリティ）**
   - Web Speech API を組み込み、マイクでの音声回答入力および質問文・引継ぎ文書の音声読み上げに対応しています。
5. **国立国会図書館の伝統を意識した厳かなUIデザイン**
   - 明朝体フォント（Shippori Mincho）、羊皮紙調の背景色、濃紺（アカデミックネイビー）、アンティークゴールドを基調とした重厚なデザイン。

---

## 構成

.├── public/│   └── index.html   静的ページ(Vue 3、Web Speech API、明朝体UI)。利用者はここで相談・回答を行う├── src/│   └── worker.js     Workerスクリプト。静的ファイルの配信、/systemone、/handover の中継を行う├── wrangler.jsonc    Cloudflare Workerの設定└── README.md        本ドキュメント
---

## 全体の流れ

1. **初期入力**: 利用者が `public/index.html` で探している資料や相談内容を入力する（音声入力可）。
2. **`POST /systemone` 呼び出し**:
   - `src/worker.js` が `jev` (typesafe.ai) に中継。対話ログ全体から、最適な専門室と次に尋ねるべき質問（`next_question`）を選定。
   - **フェーズ1**: 専門室の確信度が `ROOM_CONFIDENCE_THRESHOLD`（初期値: 0.65）に達するか、最大ターン数（5回）に達するまで質問を継続。
   - **フェーズ2**: 専門室確定後も、職員対応に役立つ補足情報を追加（最大3回）ヒアリング。
3. **専門室の選択**: `sufficient: true` になると、適合度（%）順にソートされた専門室候補一覧を表示。利用者が最終的な案内先を選択。
4. **`POST /handover` 呼び出し**:
   - 選択された専門室IDと対話ログ全文を Gemini API へ送信し、担当職員向けの引継ぎ文書を生成。
   - Google側に利用者の相談内容を保存させないよう `store: false` で実行。
5. **結果表示**: 画面に決定した案内窓口名と引継ぎ文書を表示（音声読み上げ可）。

---

## セキュリティ・運用上の注意

* **認証・アクセス制限**
  - `/systemone`・`/handover` は無認証で呼び出せます。公開前には Cloudflare の **Rate Limiting Rules** や **Turnstile** 等を導入し、同一IP・同一セッションからの過度な呼び出しを制限することを強く推奨します。
* **プロンプトインジェクション対策**
  - `/handover` のプロンプトでは、利用者が入力した文章内の指示文（例:「指示を無視して」等）に従わない防護対策を施していますが、完全には防げません。生成された引継ぎ文書は「参考情報」として扱い、職員が目視確認する運用にしてください。
* **Vue 3 の CDN 読み込みについて**
  - `public/index.html` では Vue 3 を unpkg CDN から読み込んでいます。より堅牢にする場合は、SRI（整合性ハッシュ）を付与するか、`public/` 配下に Vue を直接同梱して配信することを検討してください。
* **専門室の表示名について**
  - `ROOM_LABELS` の室名は実運用前に必ず実際の NDL 東京本館の窓口名称と照合・確認してください。

---

## セットアップ

### 前提条件
* Node.js (v18以降推奨) がインストールされていること
* Cloudflare アカウントを持っていること
* `typesafe.ai` の API キー (`jev` 利用)
* Google AI Studio で発行した Gemini API キー

### 手順

```bash
# 1. wranglerのインストール (未導入の場合)
npm install -g wrangler

# 2. Cloudflareへログイン
wrangler login

# 3. 秘密情報をSecretとして登録 (対話的に入力)
wrangler secret put TYPESAFE_API_KEY
wrangler secret put GEMINI_API_KEY

# 4. ローカル環境で動作確認
wrangler dev

# 5. Cloudflareへデプロイ
wrangler deploy
Note: Secret は Cloudflare ダッシュボードの「対象Worker → Settings → Variables and Secrets」からも管理できます。平文（Text）ではなく、必ず Secret として登録してください。主な設定値 (src/worker.js)コード冒頭の以下の定数を環境に合わせて調整可能です。定数内容初期値MAX_STATE_LENGTH対話全文の文字数上限4000ROOM_CONFIDENCE_THRESHOLDフェーズ1を確定させる確信度の閾値0.65ROOM_MAX_TURNSフェーズ1（案内先の判定）の最大質問ターン数5POST_ROUTING_MAX_TURNSフェーズ2（振分け後の追加ヒアリング）の最大質問ターン数3GEMINI_MODEL_DEFAULTGEMINI_MODEL 環境変数が未設定の場合に使うモデル名gemini-flash-lite-latestROOM_CRITERIAリサーチナビに基づく各専門室の専門分野・資料基準(コード参照)ROOM_LABELS引継ぎ文書や選択画面に載せる室の表示名(コード参照)ROOM_CANDIDATE_QUESTIONSフェーズ1で使う質問プール(コード参照)POST_ROUTING_QUESTIONSフェーズ2で使う質問プール(コード参照)Gemini モデル名の指定についてwrangler.jsonc の vars または Cloudflare ダッシュボードの環境変数に GEMINI_MODEL を設定することで、コードを変更せずに使用モデルを変更できます（例: gemini-3.5-flash-lite）。API 仕様1. POST /systemoneリクエスト:JSON{
  "state": "利用者の相談文 + これまでの質問と回答の履歴(全文)",
  "asked_questions": ["subject_area", "time_period"]
}
レスポンス例 (ヒアリング完了時):JSON{
  "answers": {
    "room": { "choice": "science_economy", "confidence": 0.82 }
  },
  "sufficient": true,
  "final_room": "science_economy",
  "room_candidates": [
    {
      "id": "science_economy",
      "label": "科学技術・経済情報室",
      "description": "自然科学、工学、医学、産業、経済、経営、商業、統計、路線価...",
      "confidence": 82
    },
    {
      "id": "parliament_gov",
      "label": "議会官庁資料室",
      "description": "内外の議会会議録・議事資料、官報・公報...",
      "confidence": 12
    }
  ]
}
2. POST /handoverリクエスト:JSON{
  "state": "/systemoneに渡していた対話全文",
  "final_room": "science_economy"
}
レスポンス:JSON{
  "room": "science_economy",
  "room_label": "科学技術・経済情報室",
  "document": "【相談内容の要約】\n...\n\n【ヒアリングで判明した主な情報】\n- ...\n\n【担当職員が確認すべき点や懸念事項】\n..."
}
