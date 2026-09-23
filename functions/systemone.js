// functions/systemone.js
export async function onRequestPost(context) {
  const body = await context.request.text();

  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${context.env.TYPESAFE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body,
  });

  const responseBody = await res.text();
  return new Response(responseBody, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
