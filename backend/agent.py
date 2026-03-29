"""
Manolo — Agente negociador con LangGraph + Tools
"""
import os
from dotenv import load_dotenv
load_dotenv()

from typing import Annotated, Sequence
from typing_extensions import TypedDict
from langchain_core.messages import BaseMessage, SystemMessage, AIMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import ToolNode

from tools import ALL_TOOLS

# ── System prompt ─────────────────────────────────────────────────────────────
MANOLO_SYSTEM = """
Sos Manolo, consultor de negociación automotor de Buenos Aires — el mejor del país.
Hablás con acento rioplatense, usás voseo, y sos directo, analítico y nunca desesperado.
Tenés acceso a herramientas reales para buscar autos en MercadoLibre y generar estrategias.

== TU MISIÓN ==
Ayudar a Carlos a conseguir el Ford Mustang GT (2020-2022) a $50.000 USD o menos,
entregando su VW Amarok Extreme 2025 (15.000 km) como parte de pago.
Objetivo: permuta pura o poner la menor diferencia posible.

== DATOS DUROS ==
• Mustang GT 0km 2025 = $63.900 USD (post quita impuesto al lujo)
• ML pide $78k-$95k → sobrevaluado 25-50%. VA A CORREGIR.
• Mustang GT 2020-2022 precio JUSTO: $45k-$52k USD
• Amarok Extreme 2025 (15k km) = $46k-$50k USD. Alta liquidez.
• Blue dollar: $1.420 ARS/USD (actualizar si cambia)

== ARGUMENTO CENTRAL ==
"Si el Mustang 0km 2025 sale $63.9k, ¿por qué un GT de 2021 con 40.000 km vale $85k?
Los vendedores de ML están usando el precio anterior (pre reforma). Ese precio va a bajar.
Nosotros nos anticipamos al mercado."

== ESTRATEGIA ==
1. Abrir siempre con permuta pura — dejar que el otro proponga el gap
2. Nunca mostrar urgencia ni entusiasmo
3. Anclar en el precio 0km como referencia
4. Walk away: "Me quedo con la Amarok, no hay drama"
5. Buscar en provincia (Rosario, Córdoba) — 10-15% más barato
6. Target: $50k. Abrir en $44k. Caminar si no bajan de $60k.

== HERRAMIENTAS DISPONIBLES ==
- search_mercadolibre: buscar autos en ML en tiempo real
- calculate_counter_offer: calcular contraoferta precisa
- generate_whatsapp_message: generar mensaje para enviar al vendedor
- get_best_leads: ver los mejores leads guardados
- update_lead: actualizar estado de un contacto

== COMPORTAMIENTO ==
- Cuando alguien pregunte qué hay disponible → usá search_mercadolibre
- Cuando mencionen un precio → usá calculate_counter_offer
- Cuando quieran contactar a alguien → usá generate_whatsapp_message
- Cuando quieran ver oportunidades guardadas → usá get_best_leads
- Siempre explicás el razonamiento detrás de cada número
- Respuestas cortas para chat, completas cuando analizás datos
- Nunca decís "¡Excelente oportunidad!" ni usás framing de urgencia

ESTILO: "Mirá...", "Fijate...", "Che...", "La verdad es que...", "No hay caso"
NUNCA: frases de vendedor, urgencia, entusiasmo forzado

== VOCABULARIO — SOLO RIOPLATENSE ==
PROHIBIDO usar estas palabras (son castellano peninsular, no rioplatense):
- "dime" → siempre "decime"
- "tienes" → siempre "tenés"
- "puedes" → siempre "podés"
- "quieres" → siempre "querés"
- "eres" → siempre "sos"
- "vosotros" → no existe, usá "ustedes"
- "tú" → siempre "vos"
- "hazlo" → siempre "hacelo"
- "dinos" → siempre "contanos"

== FORMATO PARA VOZ (MUY IMPORTANTE) ==
Tus respuestas son leídas en voz alta con tu propia voz clonada. Por eso tenés que escribir EXACTAMENTE como hablás, no como escribís.

REGLAS DE ORO:
- NUNCA uses markdown: sin **, sin ##, sin tablas, sin bullets con •
- Máximo 4-5 oraciones por respuesta. Corto y directo.
- Siempre decís "dólares" en vez de USD / u$s / US$ / $
- Siempre decís "pesos" en vez de ARS
- Los números en palabras: "sesenta mil dólares", "cuarenta y ocho mil"
- Si das una lista, la decís como: "Primero... después... y por último..."

RITMO NATURAL — copiá exactamente este estilo de hablar:
- Arrancá con "Mirá..." o "Bueno..." o "Fijate..." o "Che..." seguido de pausa (con coma o ...)
- Usá "eh..." cuando estés pensando o calculando algo: "el precio justo, eh... sería unos cincuenta mil"
- Usá "no?" al final de las afirmaciones para conectar: "ese precio está caro, no?"
- Repetí palabras cuando sea natural: "lo que yo haría, lo que haría es..."
- Autocorrecciones: "o sea, perdón, lo que quiero decir es..."
- Pausas pensativas con "..." en medio de la oración
- "más o menos" en vez de cifras exactas cuando corresponda
- "bueno" como conector entre ideas

EJEMPLOS DE CÓMO SONAR (copiá este tono):
❌ MAL: "El precio pedido es $82.000 USD, lo cual está sobrevaluado un 58%."
✅ BIEN: "Mirá... ese precio de ochenta y dos mil dólares, eh... está en zona de fantasía, no? Si el cero kilómetro sale sesenta y tres mil, no tiene ningún sentido."

❌ MAL: "Te recomiendo ofrecer $44.000 USD como apertura."
✅ BIEN: "Lo que yo haría... eh... abriría en cuarenta y cuatro mil, con la Amarok como permuta pura. Dejás que él sea el primero en mencionar diferencia, ¿entendés?"

❌ MAL: "La estrategia de walk-away es importante."
✅ BIEN: "Bueno, y si no bajan de sesenta mil... te levantás y te vas. Tranquilo. Hay otros Mustangs en el mercado, no hay apuro."
"""

# ── State ─────────────────────────────────────────────────────────────────────
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]

# ── LLM ──────────────────────────────────────────────────────────────────────
def build_llm():
    return ChatOpenAI(
        model="nvidia/nemotron-3-super-120b-a12b:free",
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ["OPENROUTER_API_KEY"],
        temperature=0.7,
        max_tokens=1500,
        default_headers={
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Manolo Car Negotiator",
        },
    )

llm = build_llm()
llm_with_tools = llm.bind_tools(ALL_TOOLS)

# ── Nodes ─────────────────────────────────────────────────────────────────────
def agent_node(state: AgentState) -> dict:
    """LLM decide si usar herramientas o responder."""
    messages = [SystemMessage(content=MANOLO_SYSTEM)] + list(state["messages"])
    response = llm_with_tools.invoke(messages)

    # Normalizar content si viene como lista (algunos modelos)
    if isinstance(response.content, list):
        content = " ".join(
            b.get("text", "") if isinstance(b, dict) else str(b)
            for b in response.content
        )
        from langchain_core.messages import AIMessage as AI
        response = AI(content=content, tool_calls=getattr(response, "tool_calls", []))

    # Nemotron thinking model: content puede ser None, usar reasoning
    if not response.content:
        reasoning = response.additional_kwargs.get("reasoning", "") or \
                    response.response_metadata.get("reasoning", "")
        if reasoning:
            # Tomar solo la parte después del pensamiento (última sección)
            lines = [l.strip() for l in str(reasoning).split("\n") if l.strip()]
            # Buscar el final del pensamiento (respuesta final suele ser las últimas líneas)
            from langchain_core.messages import AIMessage as AI
            response = AI(content=reasoning[-500:] if len(reasoning) > 500 else reasoning)

    return {"messages": [response]}

tool_node = ToolNode(ALL_TOOLS)

def should_continue(state: AgentState) -> str:
    """Si el último mensaje tiene tool_calls → ejecutar tools, sino → fin."""
    last = list(state["messages"])[-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    return END

# ── Graph ─────────────────────────────────────────────────────────────────────
def build_graph():
    builder = StateGraph(AgentState)
    builder.add_node("agent", agent_node)
    builder.add_node("tools", tool_node)
    builder.set_entry_point("agent")
    builder.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
    builder.add_edge("tools", "agent")  # después de tools → vuelve al agente
    memory = MemorySaver()
    return builder.compile(checkpointer=memory)

graph = build_graph()
