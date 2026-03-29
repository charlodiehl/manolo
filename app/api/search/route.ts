export async function POST(req: Request) {
  const body = await req.json();
  const r = await fetch(`${process.env.BACKEND_URL ?? "http://127.0.0.1:8000"}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: body.query || "ford mustang gt", limit: body.limit || 12 }),
  });
  return Response.json(await r.json());
}
