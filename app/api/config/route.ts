export async function GET() {
  const r = await fetch(`${process.env.BACKEND_URL ?? "http://127.0.0.1:8000"}/config`);
  return Response.json(await r.json());
}

export async function PUT(req: Request) {
  const body = await req.json();
  const r = await fetch(`${process.env.BACKEND_URL ?? "http://127.0.0.1:8000"}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return Response.json(await r.json());
}
