// functions/systemone.js
//
// クライアントからは質問文(state)だけを受け取り、jev に送る
// model / questions はここで固定する。これにより、クライアント側から
// 任意のモデルや質問構成を指定して API 利用枠を消費されることを防ぐ。
//
// 必須の環境変数(Secret): TYPESAFE_API_KEY
//   Cloudflareダッシュボード → 対象プロジェクト → Settings → Environment variables
//   で "Secret" として登録してください(平文の Variable ではなく Secret を使うこと)。

const MAX_STATE_LENGTH = 500;

const ROOM_CRITERIA = {
  humanities: "総記・人文科学分野の参考図書類、図書館・図書館情報学関係の主要雑誌に関する質問",
  science_economy: "科学技術及び経済社会関係の参考図書、科学技術関係の抄録・索引誌に関する質問",
  classics: "貴重書、準貴重書、江戸期以前の和古書、清代以前の漢籍に関する質問",
  map: "明治以降の一枚ものの地図(地形図、地質図、海図など)、住宅地図に関する質問",
  modern_politics: "日本近現代政治史料、日本占領関係資料、日系移民関係資料に関する質問",
  music_av: "録音資料、映像資料、楽譜、電子資料(CD-ROM等)に関する質問",
  parliament_gov: "内外の議会の会議録・議事資料、内外の官公報、法令集、判例集、条約集、内外の官庁の刊行資料目録・要覧・年次報告、統計資料類、政府間国際機関刊行資料、法律・政治分野の参考図書類に関する質問",
  newspaper: "新聞の原紙、新聞の縮刷版・復刻版、新聞のマイクロフィルム、新聞切抜資料に関する質問",
  none: "上記のどれにも該当しない、または総合案内・調べ方相談が必要な質問"
};

export async function onRequestPost(context) {
  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return jsonError("リクエストの形式が不正です。", 400);
  }

  const state = typeof payload?.state === "string" ? payload.state.trim() : "";

  if (!state) {
    return jsonError("質問文(state)が空です。", 400);
  }
  if (state.length > MAX_STATE_LENGTH) {
    return jsonError(`質問文は${MAX_STATE_LENGTH}文字以内にしてください。`, 400);
  }

  const apiKey = context.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return jsonError("サーバー側でAPIキーが未設定です。", 500);
  }

  const upstream = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      state,
      model: "jev-latest",
      questions: {
        room: {
          type: "choice",
          instructions: "利用者の質問に最も適した国立国会図書館 東京本館の専門室を選んでください",
          criteria: ROOM_CRITERIA
        },
        consultation_only: {
          type: "noul",
          instructions: "利用者は特定の資料ではなく、調べ方や探し方の相談をしている"
        }
      }
    })
  });

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" }
  });
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
