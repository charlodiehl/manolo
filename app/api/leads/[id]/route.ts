export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const r = await fetch(`${process.env.BACKEND_URL ?? "http://127.0.0.1:8000"}/leads/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return Response.json(await r.json());
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await fetch(`${process.env.BACKEND_URL ?? "http://127.0.0.1:8000"}/leads/${id}/image`);
  return Response.json(await r.json());
}
