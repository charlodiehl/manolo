export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  const r = await fetch(`${process.env.BACKEND_URL ?? "http://127.0.0.1:8000"}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!r.ok || !r.body) {
    return Response.json({ error: "stream unavailable" }, { status: 502 });
  }

  return new Response(r.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
