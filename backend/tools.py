"""
Herramientas del agente Manolo.
"""
import os, httpx, json, re
from langchain_core.tools import tool
from db import save_lead, get_leads, update_lead_status, log_contact, set_memory, get_memory

BLUE_RATE = 1420  # ARS/USD

# ─────────────────────────────────────────────────────────────
# 1. MERCADOLIBRE SEARCH
# ─────────────────────────────────────────────────────────────
@tool
def search_mercadolibre(query: str = "ford mustang gt", limit: int = 10) -> str:
    """
    Busca autos en MercadoLibre Argentina en tiempo real.
    Retorna los mejores listings con precio, año, km y análisis de valor.
    Usar cuando el usuario pida ver qué hay disponible o buscar autos.
    """
    return _scrape_ml(query, limit)


def _scrape_ml(query: str, limit: int = 10) -> str:
    """Scraper de MercadoLibre Argentina."""
    try:
        from bs4 import BeautifulSoup
        # URL para ML autos Argentina
        q_clean = re.sub(r'\bford\b|\bgt\b', '', query.lower()).strip()
        search_url = q_clean.replace(" ", "-").strip("-")
        url = f"https://autos.mercadolibre.com.ar/ford/{search_url}/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "es-AR,es;q=0.9",
        }
        with httpx.Client(timeout=15, headers=headers, follow_redirects=True) as client:
            r = client.get(url)
            html = r.text

        soup = BeautifulSoup(html, "html.parser")
        items = soup.find_all("li", class_=re.compile(r"ui-search-layout", re.I))

        results = []
        for item in items[:limit]:
            title_el = item.find("a", class_=re.compile(r"title", re.I))
            title = title_el.get_text(strip=True) if title_el else "?"

            # Filtrar solo autos (ignorar accesorios)
            if not any(k in title.upper() for k in ["MUSTANG", "FORD", "GT", "V8"]):
                continue

            link = title_el["href"] if title_el and "href" in title_el.attrs else ""
            # Limpiar link de redirect
            clean_link = re.search(r"https://auto\.mercadolibre\.com\.ar/[A-Z0-9\-_]+", link)
            link = clean_link.group(0) if clean_link else link

            # Extraer ID de ML del link
            ml_id_match = re.search(r"MLA-(\d+)", link)
            ml_id = f"MLA{ml_id_match.group(1)}" if ml_id_match else f"item_{len(results)}"

            # Extraer precio: buscar U$S primero, luego $ grande
            text = item.get_text(" ", strip=True)
            # ML Argentina muestra: "US$ 60.000" (USD) o "$ 100.000.000" (ARS)
            usd_match = re.search(r"US\$\s*([\d\.]+)", text) or re.search(r"U\$S?\s*([\d\.]+)", text)
            ars_match = re.search(r"(?<![US])\$\s*([\d]{2,3}[\.\d]+)", text)

            if usd_match:
                price_str = usd_match.group(1).replace(".", "")
                price_usd = int(price_str) if price_str.isdigit() else 0
                price_ars = price_usd * BLUE_RATE
            elif ars_match:
                price_str = ars_match.group(1).replace(".", "")
                price_ars = int(price_str) if price_str.isdigit() else 0
                price_usd = round(price_ars / BLUE_RATE)
            else:
                # Último recurso: primer número > 5 dígitos
                big_nums = re.findall(r"\b(\d{5,})\b", text.replace(".", ""))
                price_usd = int(big_nums[0]) if big_nums and int(big_nums[0]) < 200000 else 0
                price_ars = price_usd * BLUE_RATE

            # Filtrar precios fuera de rango real de autos
            if not (15000 < price_usd < 200000):
                continue

            # Año y km del título o texto
            year_match = re.search(r"\b(20[12]\d)\b", title + " " + text)
            year = int(year_match.group(1)) if year_match else 0
            km_match = re.search(r"([\d\.]+)\s*km", text, re.I)
            km = int(km_match.group(1).replace(".", "")) if km_match else 0

            rating = max(0, round(10 - (price_usd / 7500), 2))

            # Try to get image URL
            img_el = item.find("img")
            image_url = ""
            if img_el:
                image_url = img_el.get("data-src") or img_el.get("src") or ""
                if image_url and not image_url.startswith("http"):
                    image_url = ""

            save_lead(ml_id, title, price_usd, price_ars, year, km, "ML", "", link, rating, image_url)

            analysis = _analyze_price(price_usd, year, km)
            results.append(
                f"• {title} ({year or '?'}) — ${price_usd:,.0f} USD | {km:,} km\n"
                f"  {analysis}\n"
                f"  🔗 {link[:80]}"
            )

        if not results:
            return (
                f"No encontré autos Mustang en MercadoLibre con la búsqueda '{query}'.\n"
                f"Probá con: search_mercadolibre('mustang') o 'mustang coupe'"
            )

        set_memory("last_search_query", query)
        set_memory("last_search_count", len(results))
        return f"🔍 Encontré {len(results)} Mustangs en MercadoLibre:\n\n" + "\n\n".join(results)

    except Exception as e:
        return f"Error scrapeando MercadoLibre: {e}"


def _analyze_price(price_usd: float, year: int, km: int) -> str:
    """Analiza si el precio es justo."""
    if price_usd <= 0:
        return "precio no disponible"
    if price_usd < 45000:
        return "✅ PRECIO BAJO — investigar urgente"
    elif price_usd <= 55000:
        return "🟡 precio razonable — negociable"
    elif price_usd <= 70000:
        return "🟠 algo caro — requiere negociación fuerte"
    else:
        return f"🔴 sobrevaluado (vs $63.9k 0km)"


# ─────────────────────────────────────────────────────────────
# 2. CALCULAR CONTRAOFERTA
# ─────────────────────────────────────────────────────────────
@tool
def calculate_counter_offer(asking_price_usd: float, year: int = 2021, km: int = 30000) -> str:
    """
    Calcula la contraoferta óptima para un Mustang GT dado el precio pedido.
    También calcula si el deal es viable con la Amarok como permuta.
    Usar cuando el usuario diga un precio y quiera saber qué ofrecer.
    """
    amarok_value = 48000  # USD
    target_max = 50000

    # Descuento sugerido por antigüedad y km
    age = 2025 - year
    km_discount = min(km / 100000 * 0.10, 0.15)  # hasta 15% por km
    age_discount = age * 0.04  # 4% por año
    total_discount = min(km_discount + age_discount, 0.35)

    fair_value = round(63900 * (1 - total_discount))
    open_offer = round(asking_price_usd * 0.82)  # abrir 18% abajo
    ideal_offer = round(asking_price_usd * 0.88)  # cerrar acá
    walk_away = round(asking_price_usd * 0.95)  # máximo a pagar

    gap_permuta = round(fair_value - amarok_value)
    gap_asking = round(asking_price_usd - amarok_value)

    verdict = ""
    if asking_price_usd <= target_max:
        verdict = "✅ DEAL VIABLE — estamos en zona de acuerdo"
    elif asking_price_usd <= 58000:
        verdict = "🟡 NEGOCIABLE — hay margen para llegar"
    elif asking_price_usd <= 70000:
        verdict = "🟠 DIFÍCIL — necesita bajar mucho"
    else:
        verdict = "🔴 NO TOCAR — precio de fantasía"

    return f"""
📊 Análisis de precio para Mustang GT {year} con {km:,} km:

Precio pedido:      ${asking_price_usd:,.0f} USD
Valor justo real:   ${fair_value:,.0f} USD
(0km = $63.900 − {total_discount:.0%} por antigüedad/km)

💬 Estrategia de oferta:
  Apertura (permuta pura):  ${open_offer:,.0f} (Amarok ${amarok_value:,.0f} + diferencia ${max(0, open_offer - amarok_value):,.0f})
  Cierre ideal:             ${ideal_offer:,.0f} (diferencia ${max(0, ideal_offer - amarok_value):,.0f})
  Máximo absoluto:          ${walk_away:,.0f} (diferencia ${max(0, walk_away - amarok_value):,.0f})

Con Amarok como permuta:
  Gap a precio pedido:  ${gap_asking:,.0f} USD a poner de tu bolsillo
  Gap a precio justo:   ${gap_permuta:,.0f} USD a poner de tu bolsillo

{verdict}

📌 Argumento clave: "Si el 0km 2025 sale $63.9k, tu auto de {year} con {km:,} km debería estar en ${fair_value:,.0f} máximo."
"""


# ─────────────────────────────────────────────────────────────
# 3. GENERAR MENSAJE WHATSAPP
# ─────────────────────────────────────────────────────────────
@tool
def generate_whatsapp_message(
    seller_name: str,
    car_title: str,
    asking_price_usd: float,
    offer_usd: float,
    year: int = 2021
) -> str:
    """
    Genera un mensaje de WhatsApp listo para enviar al vendedor.
    Incluye link directo para abrir WhatsApp (si tiene número) o texto para copiar.
    Usar cuando el usuario quiera contactar a un vendedor.
    """
    amarok_value = 48000

    # Mensaje en estilo rioplatense, directo, sin urgencia
    msg = (
        f"Hola {seller_name}, vi tu {car_title}. "
        f"Te ofrezco permuta por una Amarok Extreme 2025 con 15.000 km (vale ${amarok_value:,} USD) "
        f"más ${max(0, int(offer_usd - amarok_value)):,} USD de diferencia. "
        f"El total quedaría en ${int(offer_usd):,} USD. "
        f"Si te interesa hablamos, sino no hay problema. Saludos"
    )

    # Log en DB (sin número por ahora)
    log_contact(0, "whatsapp_generated", msg)

    wa_link = f"https://wa.me/?text={httpx.URL('').copy_with()}"  # placeholder

    return f"""
📱 Mensaje listo para copiar y enviar por WhatsApp:

---
{msg}
---

💡 Tip de negociación:
- Mandalo a la noche (más receptivos)
- Si no responde en 24hs, mandá uno más con: "¿Sigue disponible?"
- Si baja pero no llega a tu número: "Che, ¿qué más podés mejorar? (garantía, service, etc.)"
- Si dice que no: esperá 1 semana y volvé a contactar

📌 Argumento si cuestiona el precio:
"El Mustang 0km 2025 sale $63.9k, el tuyo de {year} por lógica debería estar en ${int(offer_usd):,}-${int(offer_usd*1.05):,}."
"""


# ─────────────────────────────────────────────────────────────
# 4. VER LEADS GUARDADOS
# ─────────────────────────────────────────────────────────────
@tool
def get_best_leads(status: str = "nuevo") -> str:
    """
    Muestra los mejores leads guardados en la base de datos.
    Incluye los autos encontrados en búsquedas anteriores.
    Usar cuando el usuario quiera ver qué oportunidades hay guardadas.
    """
    leads = get_leads(status=status, limit=10)
    if not leads:
        return f"No hay leads con estado '{status}'. Probá buscar en MercadoLibre primero."

    lines = [f"📋 Mejores leads ({status}) — {len(leads)} encontrados:\n"]
    for l in leads:
        rating_bar = "●" * int(l["rating"]) + "○" * (10 - int(l["rating"]))
        lines.append(
            f"• {l['title']} ({l['year'] or '?'}) — ${l['price_usd']:,.0f} USD\n"
            f"  {l['km']:,} km | Vendedor: {l['seller_name']}\n"
            f"  Rating: {rating_bar} ({l['rating']:.1f}/10)\n"
            f"  🔗 {l['url']}"
        )
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────
# 5. MARCAR LEAD
# ─────────────────────────────────────────────────────────────
@tool
def update_lead(ml_id: str, status: str, notes: str = "") -> str:
    """
    Actualiza el estado de un lead.
    Estados válidos: nuevo, contactado, negociando, descartado, cerrado.
    Usar cuando el usuario indique el resultado de un contacto.
    """
    valid = {"nuevo", "contactado", "negociando", "descartado", "cerrado"}
    if status not in valid:
        return f"Estado inválido. Usá uno de: {', '.join(valid)}"
    update_lead_status(ml_id, status, notes)
    return f"✅ Lead {ml_id} actualizado a '{status}'. {notes}"


ALL_TOOLS = [
    search_mercadolibre,
    calculate_counter_offer,
    generate_whatsapp_message,
    get_best_leads,
    update_lead,
]
