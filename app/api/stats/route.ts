export async function GET() {
  try {
    const r = await fetch(`${process.env.BACKEND_URL ?? "http://127.0.0.1:8000"}/stats`);
    return Response.json(await r.json());
  } catch {
    return Response.json({ total_leads: 0, best_price_usd: 0, avg_price_usd: 0 });
  }
}
