"""
Persistent memory — Supabase (Postgres) con fallback a SQLite para dev local.
"""
import sqlite3, json, os
from datetime import datetime

# ── Supabase setup ─────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY")

_sb = None

def _use_supabase() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)

def _get_sb():
    global _sb
    if _sb is None:
        from supabase import create_client
        _sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _sb

# ── SQLite fallback ────────────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "manolo.db")

def _conn():
    return sqlite3.connect(DB_PATH)

def _init_sqlite():
    with _conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT, ml_id TEXT UNIQUE, title TEXT,
            price_usd REAL, price_ars REAL, year INTEGER, km INTEGER,
            seller_name TEXT, seller_phone TEXT, url TEXT, rating REAL,
            status TEXT DEFAULT 'nuevo', notes TEXT, image_url TEXT DEFAULT '',
            created_at TEXT, updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT, ml_id TEXT, price_usd REAL, scraped_at TEXT
        );
        CREATE TABLE IF NOT EXISTS agent_memory (
            key TEXT PRIMARY KEY, value TEXT, updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT,
            role TEXT, content TEXT, created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS search_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT,
            results_count INTEGER, searched_at TEXT
        );
        """)

# ── save_lead ──────────────────────────────────────────────────────────────────
def save_lead(ml_id, title, price_usd, price_ars, year, km,
              seller_name, seller_phone, url, rating, image_url=""):
    now = datetime.utcnow().isoformat()
    if _use_supabase():
        sb = _get_sb()
        sb.table("leads").upsert({
            "ml_id": ml_id, "title": title, "price_usd": price_usd,
            "price_ars": price_ars, "year": year, "km": km,
            "seller_name": seller_name, "seller_phone": seller_phone,
            "url": url, "rating": rating,
            "image_url": image_url or "",
            "updated_at": now,
        }, on_conflict="ml_id").execute()
        sb.table("price_history").insert({"ml_id": ml_id, "price_usd": price_usd, "scraped_at": now}).execute()
    else:
        with _conn() as c:
            c.execute("""
                INSERT INTO leads (ml_id,title,price_usd,price_ars,year,km,
                    seller_name,seller_phone,url,rating,image_url,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(ml_id) DO UPDATE SET
                    price_usd=excluded.price_usd, price_ars=excluded.price_ars,
                    rating=excluded.rating,
                    image_url=CASE WHEN excluded.image_url!='' THEN excluded.image_url ELSE leads.image_url END,
                    updated_at=excluded.updated_at
            """, (ml_id,title,price_usd,price_ars,year,km,seller_name,seller_phone,url,rating,image_url,now,now))
            c.execute("INSERT INTO price_history (ml_id,price_usd,scraped_at) VALUES (?,?,?)", (ml_id,price_usd,now))

# ── get_leads ──────────────────────────────────────────────────────────────────
def get_leads(status=None, limit=20):
    if _use_supabase():
        sb = _get_sb()
        q = sb.table("leads").select("*").order("rating", desc=True).limit(limit)
        if status:
            q = q.eq("status", status)
        return q.execute().data or []
    else:
        with _conn() as c:
            if status:
                rows = c.execute("SELECT * FROM leads WHERE status=? ORDER BY rating DESC LIMIT ?", (status,limit)).fetchall()
            else:
                rows = c.execute("SELECT * FROM leads ORDER BY rating DESC LIMIT ?", (limit,)).fetchall()
            cols = [d[0] for d in c.description]
            return [dict(zip(cols,r)) for r in rows]

# ── update_lead_status ─────────────────────────────────────────────────────────
def update_lead_status(ml_id, status, notes=None):
    now = datetime.utcnow().isoformat()
    if _use_supabase():
        _get_sb().table("leads").update({"status": status, "notes": notes, "updated_at": now}).eq("ml_id", ml_id).execute()
    else:
        with _conn() as c:
            c.execute("UPDATE leads SET status=?, notes=?, updated_at=? WHERE ml_id=?", (status,notes,now,ml_id))

# ── config (via agent_memory) ──────────────────────────────────────────────────
def _set_mem(key, value):
    now = datetime.utcnow().isoformat()
    if _use_supabase():
        _get_sb().table("agent_memory").upsert({"key": key, "value": json.dumps(value), "updated_at": now}, on_conflict="key").execute()
    else:
        with _conn() as c:
            c.execute("INSERT INTO agent_memory (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
                      (key, json.dumps(value), now))

def _get_mem(key, default=None):
    if _use_supabase():
        res = _get_sb().table("agent_memory").select("value").eq("key", key).execute()
        return json.loads(res.data[0]["value"]) if res.data else default
    else:
        with _conn() as c:
            row = c.execute("SELECT value FROM agent_memory WHERE key=?", (key,)).fetchone()
            return json.loads(row[0]) if row else default

def save_config(data: dict):
    for k, v in data.items():
        _set_mem(f"config_{k}", v)

def get_config() -> dict:
    defaults = {
        "max_price_usd": 50000, "walk_away_usd": 60000, "amarok_value_usd": 48000,
        "max_km": 80000, "year_min": 2019, "year_max": 2024,
        "permuta_only": True, "opening_discount_pct": 18,
    }
    return {k: _get_mem(f"config_{k}", v) for k, v in defaults.items()}

# ── conversations ──────────────────────────────────────────────────────────────
def log_conversation_message(session_id: str, role: str, content: str):
    now = datetime.utcnow().isoformat()
    if _use_supabase():
        _get_sb().table("conversations").insert({"session_id": session_id, "role": role, "content": content, "created_at": now}).execute()
    else:
        with _conn() as c:
            c.execute("INSERT INTO conversations (session_id,role,content,created_at) VALUES (?,?,?,?)", (session_id,role,content,now))

def get_conversation_sessions():
    if _use_supabase():
        res = _get_sb().rpc("get_conversation_sessions").execute()
        if res.data:
            return res.data
        # fallback: basic query
        res = _get_sb().table("conversations").select("session_id,created_at").order("created_at", desc=True).execute()
        seen, out = set(), []
        for r in (res.data or []):
            if r["session_id"] not in seen:
                seen.add(r["session_id"]); out.append({"session_id": r["session_id"], "msg_count": 0, "started_at": r["created_at"], "last_at": r["created_at"]})
        return out[:20]
    else:
        with _conn() as c:
            rows = c.execute("""SELECT session_id, COUNT(*) as msg_count, MIN(created_at), MAX(created_at)
                FROM conversations GROUP BY session_id ORDER BY MAX(created_at) DESC LIMIT 20""").fetchall()
            return [{"session_id": r[0], "msg_count": r[1], "started_at": r[2], "last_at": r[3]} for r in rows]

def get_conversation_messages(session_id: str):
    if _use_supabase():
        res = _get_sb().table("conversations").select("role,content,created_at").eq("session_id", session_id).order("created_at").execute()
        return res.data or []
    else:
        with _conn() as c:
            rows = c.execute("SELECT role,content,created_at FROM conversations WHERE session_id=? ORDER BY id ASC", (session_id,)).fetchall()
            return [{"role": r[0], "content": r[1], "created_at": r[2]} for r in rows]

# ── search_log ─────────────────────────────────────────────────────────────────
def log_search(query: str, count: int):
    now = datetime.utcnow().isoformat()
    if _use_supabase():
        _get_sb().table("search_log").insert({"query": query, "results_count": count, "searched_at": now}).execute()
    else:
        with _conn() as c:
            c.execute("INSERT INTO search_log (query,results_count,searched_at) VALUES (?,?,?)", (query,count,now))

# ── backwards-compat aliases ───────────────────────────────────────────────────
def get_memory(key, default=None):
    return _get_mem(key, default)

def set_memory(key, value):
    _set_mem(key, value)

def log_contact(lead_id, method, message, response=""):
    pass  # no-op — contact logging handled via conversations table

# ── init ───────────────────────────────────────────────────────────────────────
def ensure_image_url_column():
    if not _use_supabase():
        try:
            with _conn() as c:
                c.execute("ALTER TABLE leads ADD COLUMN image_url TEXT DEFAULT ''")
        except Exception:
            pass

if not _use_supabase():
    _init_sqlite()
    ensure_image_url_column()
else:
    print(f"[db] Using Supabase: {SUPABASE_URL}")
