export async function GET() {
  try {
    const r = await fetch(`${process.env.BACKEND_URL ?? "http://127.0.0.1:8000"}/conversations`);
    return Response.json(await r.json());
  } catch {
    return Response.json({ sessions: [] });
  }
}
