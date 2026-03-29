"""
Persistent memory — SQLite
Guarda leads, historial de precios y aprendizaje del agente.
"""
import sqlite3, json, os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "manolo.db")

def _conn():
    return sqlite3.connect(DB_PATH)

def init_db():
    with _conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ml_id TEXT UNIQUE,
            title TEXT,
            price_usd REAL,
            price_ars REAL,
            year INTEGER,
            km INTEGER,
            seller_name TEXT,
            seller_phone TEXT,
            url TEXT,
            rating REAL,
            status TEXT DEFAULT 'nuevo',
            notes TEXT,
            created_at TEXT,
            updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ml_id TEXT,
            price_usd REAL,
            scraped_at TEXT
        );
        CREATE TABLE IF NOT EXISTS agent_memory (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS contact_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER,
            method TEXT,
            message TEXT,
            response TEXT,
            contacted_at TEXT
        );
        """)

def save_lead(ml_id, title, price_usd, price_ars, year, km,
              seller_name, seller_phone, url, rating, image_url=""):
    now = datetime.utcnow().isoformat()
    with _conn() as c:
        c.execute("""
            INSERT INTO leads (ml_id,title,price_usd,price_ars,year,km,
                seller_name,seller_phone,url,rating,image_url,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(ml_id) DO UPDATE SET
                price_usd=excluded.price_usd,
                price_ars=excluded.price_ars,
                rating=excluded.rating,
                image_url=CASE WHEN excluded.image_url != '' THEN excluded.image_url ELSE leads.image_url END,
                updated_at=excluded.updated_at
        """, (ml_id, title, price_usd, price_ars, year, km,
              seller_name, seller_phone, url, rating, image_url, now, now))
        c.execute("INSERT INTO price_history (ml_id,price_usd,scraped_at) VALUES (?,?,?)",
                  (ml_id, price_usd, now))

def get_leads(status=None, limit=20):
    with _conn() as c:
        if status:
            rows = c.execute(
                "SELECT * FROM leads WHERE status=? ORDER BY rating DESC LIMIT ?",
                (status, limit)).fetchall()
        else:
            rows = c.execute(
                "SELECT * FROM leads ORDER BY rating DESC LIMIT ?", (limit,)).fetchall()
        cols = [d[0] for d in c.description]
        return [dict(zip(cols, r)) for r in rows]

def update_lead_status(ml_id, status, notes=None):
    now = datetime.utcnow().isoformat()
    with _conn() as c:
        c.execute("UPDATE leads SET status=?, notes=?, updated_at=? WHERE ml_id=?",
                  (status, notes, now, ml_id))

def log_contact(lead_id, method, message, response=""):
    with _conn() as c:
        c.execute("""INSERT INTO contact_log (lead_id,method,message,response,contacted_at)
                     VALUES (?,?,?,?,?)""",
                  (lead_id, method, message, response, datetime.utcnow().isoformat()))

def set_memory(key, value):
    with _conn() as c:
        c.execute("""INSERT INTO agent_memory (key,value,updated_at) VALUES (?,?,?)
                     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at""",
                  (key, json.dumps(value), datetime.utcnow().isoformat()))

def get_memory(key, default=None):
    with _conn() as c:
        row = c.execute("SELECT value FROM agent_memory WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

def save_config(data: dict):
    """Guarda configuración del usuario."""
    for k, v in data.items():
        set_memory(f"config_{k}", v)

def get_config() -> dict:
    """Retorna configuración actual con defaults."""
    defaults = {
        "max_price_usd": 50000,
        "walk_away_usd": 60000,
        "amarok_value_usd": 48000,
        "max_km": 80000,
        "year_min": 2019,
        "year_max": 2024,
        "permuta_only": True,
        "provinces": ["CABA", "GBA", "Rosario", "Córdoba"],
        "opening_discount_pct": 18,
    }
    result = {}
    with _conn() as c:
        for k, default in defaults.items():
            row = c.execute("SELECT value FROM agent_memory WHERE key=?", (f"config_{k}",)).fetchone()
            result[k] = json.loads(row[0]) if row else default
    return result

def add_conversations_table():
    with _conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            role TEXT,
            content TEXT,
            created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS search_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query TEXT,
            results_count INTEGER,
            searched_at TEXT
        );
        """)

def log_conversation_message(session_id: str, role: str, content: str):
    with _conn() as c:
        c.execute("INSERT INTO conversations (session_id,role,content,created_at) VALUES (?,?,?,?)",
                  (session_id, role, content, datetime.utcnow().isoformat()))

def get_conversation_sessions():
    with _conn() as c:
        rows = c.execute("""
            SELECT session_id, COUNT(*) as msg_count, MIN(created_at) as started_at, MAX(created_at) as last_at
            FROM conversations GROUP BY session_id ORDER BY last_at DESC LIMIT 20
        """).fetchall()
        return [{"session_id": r[0], "msg_count": r[1], "started_at": r[2], "last_at": r[3]} for r in rows]

def get_conversation_messages(session_id: str):
    with _conn() as c:
        rows = c.execute(
            "SELECT role, content, created_at FROM conversations WHERE session_id=? ORDER BY id ASC",
            (session_id,)).fetchall()
        return [{"role": r[0], "content": r[1], "created_at": r[2]} for r in rows]

def log_search(query: str, count: int):
    with _conn() as c:
        c.execute("INSERT INTO search_log (query, results_count, searched_at) VALUES (?,?,?)",
                  (query, count, datetime.utcnow().isoformat()))

def ensure_image_url_column():
    try:
        with _conn() as c:
            c.execute("ALTER TABLE leads ADD COLUMN image_url TEXT DEFAULT ''")
    except Exception:
        pass  # column already exists

init_db()
ensure_image_url_column()
add_conversations_table()
