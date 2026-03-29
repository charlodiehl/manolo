export async function GET() {
  try {
    const r = await fetch(`${process.env.BACKEND_URL ?? "http://127.0.0.1:8000"}/health`);
    const data = await r.json();
    return Response.json({ mc: "ok", gateway: data?.ok ? "live" : "down" });
  } catch {
    return Response.json({ mc: "ok", gateway: "down" });
  }
}
