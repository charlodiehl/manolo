export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "";
  const endpoint = status ? `${process.env.BACKEND_URL ?? "http://127.0.0.1:8000"}/leads?status=${status}` : `${process.env.BACKEND_URL ?? "http://127.0.0.1:8000"}/leads`;
  const r = await fetch(endpoint);
  return Response.json(await r.json());
}
