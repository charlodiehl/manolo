export async function POST(req: Request) {
  const { message, sessionId } = await req.json();
  try {
    const r = await fetch(`${process.env.BACKEND_URL ?? "http://127.0.0.1:8000"}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId }),
    });
    const data = await r.json();
    return Response.json(data);
  } catch (e: unknown) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
