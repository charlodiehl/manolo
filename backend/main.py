"""
Manolo Backend — FastAPI + LangGraph
Puerto: 8000
"""
import os
from dotenv import load_dotenv
load_dotenv()

import httpx, json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, AsyncGenerator
from langchain_core.messages import HumanMessage
from agent import graph
from db import (get_leads, save_config, get_config,
                log_conversation_message, get_conversation_sessions,
                get_conversation_messages, log_search, update_lead_status)

app = FastAPI(title="Manolo AI Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models ────────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    sessionId: str

class ChatResponse(BaseModel):
    reply: str
    sessionId: str

class ConfigModel(BaseModel):
    max_price_usd: Optional[float] = None
    walk_away_usd: Optional[float] = None
    amarok_value_usd: Optional[float] = None
    max_km: Optional[int] = None
    year_min: Optional[int] = None
    year_max: Optional[int] = None
    permuta_only: Optional[bool] = None
    opening_discount_pct: Optional[int] = None

class LeadUpdateModel(BaseModel):
    status: str
    notes: Optional[str] = ""

class SearchRequest(BaseModel):
    query: str = "ford mustang gt"
    limit: int = 12

# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"ok": True, "status": "live", "agent": "manolo-langgraph"}


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Envía un mensaje a Manolo y recibe respuesta con memoria de sesión."""
    try:
        config = {"configurable": {"thread_id": req.sessionId}}
        result = await graph.ainvoke(
            {"messages": [HumanMessage(content=req.message)]},
            config=config,
        )
        messages = result.get("messages", [])
        if not messages:
            raise ValueError("No messages returned")

        # Obtener último mensaje del asistente
        last = messages[-1]
        reply = last.content if isinstance(last.content, str) else str(last.content)

        log_conversation_message(req.sessionId, "user", req.message)
        log_conversation_message(req.sessionId, "assistant", reply)

        return ChatResponse(reply=reply, sessionId=req.sessionId)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/leads")
async def list_leads(status: str = None):
    """Lista los leads guardados (autos encontrados en ML)."""
    return {"leads": get_leads(status=status)}


@app.get("/stats")
async def stats():
    """Stats para el dashboard."""
    leads = get_leads(limit=100)
    if leads:
        prices = [l["price_usd"] for l in leads if l["price_usd"] > 0]
        best = min(prices) if prices else 0
        avg = round(sum(prices) / len(prices)) if prices else 0
    else:
        best = avg = 0
    return {
        "total_leads": len(leads),
        "best_price_usd": best,
        "avg_price_usd": avg,
        "last_search": get_memory("last_search_query"),
    }


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """Streaming SSE — primer token en ~1 segundo."""
    async def generate() -> AsyncGenerator[str, None]:
        config = {"configurable": {"thread_id": req.sessionId}}
        full_reply = ""
        try:
            async for event in graph.astream_events(
                {"messages": [HumanMessage(content=req.message)]},
                config=config,
                version="v2",
            ):
                kind = event.get("event", "")
                if kind == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        content = chunk.content
                        if isinstance(content, list):
                            content = "".join(b.get("text", "") if isinstance(b, dict) else str(b) for b in content)
                        if content:
                            full_reply += content
                            yield f"data: {json.dumps({'chunk': content})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return

        log_conversation_message(req.sessionId, "user", req.message)
        log_conversation_message(req.sessionId, "assistant", full_reply)
        yield f"data: {json.dumps({'done': True, 'full': full_reply})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/config")
async def get_config_endpoint():
    return get_config()

@app.put("/config")
async def update_config_endpoint(config: ConfigModel):
    data = {k: v for k, v in config.model_dump().items() if v is not None}
    save_config(data)
    return get_config()

@app.post("/search")
async def trigger_search(req: SearchRequest):
    """Trigger ML search directly and return structured results."""
    from tools import _scrape_ml
    _scrape_ml(req.query, req.limit)
    leads = get_leads(limit=req.limit)
    log_search(req.query, len(leads))
    return {"leads": leads, "count": len(leads), "query": req.query}

@app.put("/leads/{ml_id}")
async def update_lead_endpoint(ml_id: str, data: LeadUpdateModel):
    update_lead_status(ml_id, data.status, data.notes)
    return {"ok": True, "ml_id": ml_id, "status": data.status}

@app.get("/leads/{ml_id}/image")
async def get_lead_image(ml_id: str):
    """Fetch thumbnail from ML public API."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"https://api.mercadolibre.com/items/{ml_id}")
            data = r.json()
            thumb = data.get("thumbnail", "")
            thumb = thumb.replace("http://", "https://")
            return {"image_url": thumb}
    except Exception:
        return {"image_url": ""}

@app.get("/conversations")
async def list_conversations():
    return {"sessions": get_conversation_sessions()}

@app.get("/conversations/{session_id}")
async def get_session(session_id: str):
    return {"messages": get_conversation_messages(session_id)}


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False, log_level="info")
