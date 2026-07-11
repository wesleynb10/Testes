"""
Drip email campaign service.
Schedules 5-email sequence for leads that don't convert.
Uses MongoDB email_queue collection with a background asyncio loop
that polls every 60 seconds and sends due emails via Resend.
"""
import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta

from email_service import send_email, _wrap

logger = logging.getLogger(__name__)

# Delay from lead creation (in hours). Adjust for testing if needed.
DRIP_SCHEDULE = [
    {"step": 1, "delay_hours": 24,  "subject": "🎯 Seu relatório personalizado (baseado nos números que você simulou)"},
    {"step": 2, "delay_hours": 72,  "subject": "Como Rafael saiu do vermelho em 4 meses (case real)"},
    {"step": 3, "delay_hours": 120, "subject": "🔥 Cupom SAVE20 — R$ 20 de desconto expira em 48h"},
    {"step": 4, "delay_hours": 216, "subject": "Última chance antes de tirarmos o desconto do ar"},
    {"step": 5, "delay_hours": 336, "subject": "Uma pergunta antes de você ir embora..."},
]


# =============================================================================
# TEMPLATES
# =============================================================================
def tpl_day1(metadata: dict) -> str:
    md = metadata or {}
    monthly = md.get("monthly", 500)
    years = md.get("years", 20)
    rate = md.get("rate", 0.9)
    # Rough compound projection for headline
    r = rate / 100
    n = years * 12
    projected = md.get("initial", 1000) * ((1 + r) ** n) + monthly * (((1 + r) ** n - 1) / (r or 0.001))
    body = f"""
      <h1>Você está a <span class="gold">R$ {projected:,.0f}</span> de distância.</h1>
      <p>Ontem você simulou aportar <strong>R$ {monthly:,.0f}/mês</strong> durante <strong>{years} anos</strong> a uma taxa de <strong>{rate}% ao mês</strong>.</p>
      <p>O resultado que apareceu na sua tela foi real. Mas ele só acontece se você <em>começar</em>.</p>
      <div class="divider"></div>
      <h2>O que separa quem chega lá de quem só simula:</h2>
      <ul>
        <li>Um sistema pra <strong>não esquecer</strong> de aportar todo mês</li>
        <li>Um controle de <strong>gastos claro</strong> pra sobrar dinheiro pra aportar</li>
        <li>Um <strong>Número da Liberdade</strong> pra saber quando pode parar</li>
      </ul>
      <p>É exatamente isso que o FinPremium faz. E hoje ele custa 3 pizzas.</p>
      <p style="text-align:center;"><a class="btn" href="https://wealth-control-25.preview.emergentagent.com/venda">Quero começar agora →</a></p>
      <div class="divider"></div>
      <p style="font-size:12px;">Se preferir não receber mais essa sequência, é só responder este email com "sair".</p>
    """.replace("{:,.0f}", "").replace(",", ".")  # ptBR-ish
    return _wrap(body)


def tpl_day3(metadata: dict) -> str:
    body = """
      <h1>Como <span class="gold">Rafael, 41 anos</span>, saiu do vermelho em 4 meses.</h1>
      <p>Rafael me mandou uma mensagem semana passada. Preferi contar a história dele porque, provavelmente, você vai se identificar:</p>
      <div class="kpi">
        <p style="font-size:15px; font-style:italic; color:#F5F0E1; margin:0;">
          "Eu era autônomo, ganhava bem, mas todo mês estava no vermelho. Tinha 4 cartões estourados. Meu maior medo era ir dormir sabendo que amanhã não tinha dinheiro pra pagar o combustível.
          <br><br>
          Em 4 meses no FinPremium, quitei R$ 12 mil em dívidas, comecei a aportar R$ 800/mês, e a ansiedade sumiu. Sério, sumiu."
        </p>
      </div>
      <p><strong>Rafael, 41 anos, autônomo, Rio de Janeiro</strong></p>
      <div class="divider"></div>
      <h2>O que ele fez diferente</h2>
      <ol style="padding-left:20px; color:#ADA79A; font-size:14px;">
        <li style="margin:8px 0;">Cadastrou <strong>todas</strong> as dívidas no simulador Bola de Neve.</li>
        <li style="margin:8px 0;">Descobriu que economizaria <strong>R$ 3.400 em juros</strong> só reorganizando a ordem de pagamento.</li>
        <li style="margin:8px 0;">Aplicou a regra 50/30/20 e sobrou R$ 800/mês pra investir.</li>
      </ol>
      <p style="text-align:center;"><a class="btn" href="https://wealth-control-25.preview.emergentagent.com/venda">Quero fazer o meu →</a></p>
      <p style="font-size:12px;">7 dias de garantia. Se não gostar, devolvemos.</p>
    """
    return _wrap(body)


def tpl_day5(metadata: dict) -> str:
    body = """
      <h1><span class="gold">R$ 20 de desconto</span> pra você desbloquear agora.</h1>
      <p>Sabe aquele valor que você simulou na calculadora e ficou pensando "e se…"?</p>
      <p>Enquanto você pensa, os juros compostos <strong>não param de correr contra você</strong>.</p>
      <div class="kpi">
        <div style="font-size:11px; color:#6E6A5F; letter-spacing:0.14em; text-transform:uppercase;">Cupom exclusivo</div>
        <div style="font-size:32px; color:#E8CE87; font-family:Georgia, serif; margin-top:6px;">SAVE20</div>
        <div style="font-size:12px; color:#ADA79A; margin-top:8px;">De R$ 97 por <strong style="color:#E8CE87;">R$ 77</strong> · Expira em 48h</div>
      </div>
      <p style="text-align:center;"><a class="btn" href="https://wealth-control-25.preview.emergentagent.com/venda">Usar meu cupom →</a></p>
      <p style="font-size:12px;">O cupom é único. Se você deixar expirar, não volta.</p>
    """
    return _wrap(body)


def tpl_day9(metadata: dict) -> str:
    body = """
      <h1>Última chance — vou <span class="gold">tirar do ar em 24h</span>.</h1>
      <p>Você é uma das poucas pessoas que ainda não usaram o cupom SAVE20. Vou ser direto:</p>
      <p>Amanhã ele desaparece do sistema. Não vou aviso nem "última semana". Some.</p>
      <div class="divider"></div>
      <h2>Se você começar hoje:</h2>
      <ul>
        <li>Configura seu orçamento em ~15 minutos</li>
        <li>Descobre em quantos meses zera suas dívidas</li>
        <li>Recebe todos os 6 bônus (curso, e-book, planilhas extras)</li>
        <li>Paga <strong style="color:#E8CE87;">R$ 77</strong> (de R$ 97)</li>
      </ul>
      <p style="text-align:center;"><a class="btn" href="https://wealth-control-25.preview.emergentagent.com/venda">Aproveitar antes de sumir →</a></p>
    """
    return _wrap(body)


def tpl_day14(metadata: dict) -> str:
    body = """
      <h1>Uma pergunta antes de eu ir embora.</h1>
      <p>Ok, entendi que agora não é o momento. Sem pressão.</p>
      <p>Mas antes de eu parar de te mandar emails, você poderia me responder uma coisa? Vai me ajudar muito:</p>
      <div class="kpi">
        <p style="font-size:16px; color:#F5F0E1; margin:0;">
          <strong>O que faltou pra você entrar no FinPremium?</strong>
        </p>
        <p style="font-size:13px; color:#ADA79A; margin:8px 0 0;">
          (é só responder este email — 1 palavra ou 1 frase serve)
        </p>
      </div>
      <p>Pode ser preço, momento, medo, dúvida sobre alguma feature. Qualquer coisa. Prometo ler todas.</p>
      <p>Se me responder, envio de brinde a Planilha de Juros Compostos Premium (R$ 47) mesmo sem você ter comprado. Como agradecimento.</p>
      <div class="divider"></div>
      <p style="font-size:12px;">Se preferir só sair da lista, não precisa responder. Isso já foi o último email.</p>
    """
    return _wrap(body)


TEMPLATES = {1: tpl_day1, 2: tpl_day3, 3: tpl_day5, 4: tpl_day9, 5: tpl_day14}


# =============================================================================
# SCHEDULER
# =============================================================================
async def schedule_drip(db, lead_email: str, lead_id: str, metadata: dict | None):
    """Called when a new lead is created. Schedules 5 emails."""
    now = datetime.now(timezone.utc)
    docs = []
    for step in DRIP_SCHEDULE:
        docs.append({
            "id": str(uuid.uuid4()),
            "lead_id": lead_id,
            "lead_email": lead_email,
            "step": step["step"],
            "subject": step["subject"],
            "send_at": now + timedelta(hours=step["delay_hours"]),
            "metadata": metadata or {},
            "status": "pending",  # pending | sent | cancelled | failed
            "created_at": now.isoformat(),
        })
    if docs:
        await db.email_queue.insert_many(docs)
    logger.info(f"[drip] scheduled {len(docs)} emails for {lead_email}")


async def cancel_drip_for_email(db, email: str, reason: str = "purchased"):
    """Cancel remaining pending emails once lead converts."""
    email = (email or "").lower().strip()
    if not email:
        return 0
    result = await db.email_queue.update_many(
        {"lead_email": email, "status": "pending"},
        {"$set": {"status": "cancelled", "cancelled_reason": reason,
                  "cancelled_at": datetime.now(timezone.utc).isoformat()}},
    )
    logger.info(f"[drip] cancelled {result.modified_count} for {email} ({reason})")
    return result.modified_count


async def send_due_emails(db):
    """Poll and send emails whose send_at is due. Idempotent."""
    now = datetime.now(timezone.utc)
    due = await db.email_queue.find(
        {"status": "pending", "send_at": {"$lte": now}},
    ).to_list(length=50)
    if not due:
        return 0

    sent = 0
    for doc in due:
        try:
            step = doc["step"]
            template = TEMPLATES.get(step)
            if not template:
                await db.email_queue.update_one(
                    {"id": doc["id"]},
                    {"$set": {"status": "failed", "error": "no_template"}},
                )
                continue
            html = template(doc.get("metadata"))
            email_id = await send_email(
                to_email=doc["lead_email"],
                subject=doc["subject"],
                html=html,
                tag=f"drip-step-{step}",
            )
            if email_id:
                await db.email_queue.update_one(
                    {"id": doc["id"]},
                    {"$set": {"status": "sent", "sent_at": now.isoformat(), "email_id": email_id}},
                )
                sent += 1
            else:
                await db.email_queue.update_one(
                    {"id": doc["id"]},
                    {"$set": {"status": "failed", "error": "send_failed",
                              "failed_at": now.isoformat()}},
                )
        except Exception as e:
            # Never let a single doc break the whole loop
            logger.exception(f"[drip] exception processing doc {doc.get('id')}: {e}")
            try:
                await db.email_queue.update_one(
                    {"id": doc["id"]},
                    {"$set": {"status": "failed", "error": str(e)[:200],
                              "failed_at": now.isoformat()}},
                )
            except Exception:
                pass
    if sent:
        logger.info(f"[drip] sent {sent} emails")
    return sent


async def drip_worker_loop(db, interval_seconds: int = 60):
    """Background async task that polls the queue forever."""
    logger.info(f"[drip] worker started (interval={interval_seconds}s)")
    while True:
        try:
            await send_due_emails(db)
        except Exception as e:
            logger.exception(f"[drip] worker iteration failed: {e}")
        await asyncio.sleep(interval_seconds)


# =============================================================================
# ADMIN: manual trigger for testing (fires the next pending email now)
# =============================================================================
async def fire_next_email_for_lead(db, lead_email: str):
    """Force-send the next pending email in the sequence for this lead."""
    email = lead_email.lower().strip()
    doc = await db.email_queue.find_one(
        {"lead_email": email, "status": "pending"},
        sort=[("send_at", 1)],
    )
    if not doc:
        return None
    # Update send_at to now so send_due_emails picks it up
    await db.email_queue.update_one(
        {"id": doc["id"]},
        {"$set": {"send_at": datetime.now(timezone.utc)}},
    )
    sent = await send_due_emails(db)
    return {"triggered": True, "step": doc["step"], "sent_this_run": sent}
