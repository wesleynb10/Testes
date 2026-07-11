"""
Resend email service — templates and async senders for FinPremium.
Test mode: emails only reach addresses verified in the Resend dashboard.
Owner notifications always work (OWNER_EMAIL is the account holder).
"""
import os
import asyncio
import logging
import resend

logger = logging.getLogger(__name__)

resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
OWNER = os.environ.get("OWNER_EMAIL", "")


BASE_STYLE = """
<style>
  body { margin: 0; padding: 0; background: #07060A; color: #F5F0E1; font-family: -apple-system, 'Segoe UI', Arial, sans-serif; }
  .wrapper { max-width: 600px; margin: 0 auto; padding: 40px 24px; }
  .card { background: linear-gradient(180deg, #1B1A22 0%, #131218 100%); border: 1px solid #2A2833; border-radius: 14px; padding: 32px; }
  .gold { color: #E8CE87; }
  h1 { font-family: Georgia, serif; font-weight: 500; font-size: 32px; letter-spacing: -0.02em; margin: 0 0 16px; }
  h2 { font-family: Georgia, serif; font-weight: 500; font-size: 22px; margin: 24px 0 12px; color: #E8CE87; }
  p { line-height: 1.6; font-size: 15px; color: #ADA79A; margin: 0 0 14px; }
  .btn { display: inline-block; background: linear-gradient(180deg, #E8CE87, #C9A961); color: #07060A !important; padding: 14px 28px; border-radius: 999px; text-decoration: none; font-weight: 700; margin: 16px 0; }
  .kpi { background: rgba(201,169,97,0.08); border: 1px solid rgba(201,169,97,0.25); border-radius: 10px; padding: 14px 18px; margin: 8px 0; }
  .divider { height: 1px; background: #2A2833; margin: 24px 0; }
  .footer { color: #6E6A5F; font-size: 11px; text-align: center; margin-top: 32px; }
  .brand { font-family: Georgia, serif; font-size: 22px; letter-spacing: -0.02em; }
  ul { padding-left: 20px; }
  ul li { color: #ADA79A; font-size: 14px; margin: 6px 0; }
</style>
"""


def _wrap(body_html: str) -> str:
    return f"""
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8">{BASE_STYLE}</head>
<body>
  <div class="wrapper">
    <div style="text-align:center; margin-bottom:24px;">
      <span class="brand">Fin<span class="gold">Premium</span></span>
      <div style="font-size:10px; letter-spacing:0.24em; color:#C9A961; margin-top:4px;">WEALTH OS</div>
    </div>
    <div class="card">
      {body_html}
    </div>
    <div class="footer">FinPremium · Wealth OS · © 2026<br>Você recebeu porque interagiu com nossa plataforma.</div>
  </div>
</body>
</html>
"""


def customer_welcome_html(package_name: str, amount: float, session_id: str) -> str:
    body = f"""
      <h1>Bem-vindo(a) ao <span class="gold">FinPremium</span>!</h1>
      <p>Seu pagamento de <strong>R$ {amount:.2f}</strong> foi confirmado. Você agora tem acesso vitalício ao <strong>{package_name}</strong>.</p>

      <h2>Como acessar</h2>
      <p>Basta clicar no botão abaixo. Recomendamos favoritar a URL no navegador.</p>
      <p style="text-align:center;"><a class="btn" href="https://wealth-control-25.preview.emergentagent.com/">Entrar no FinPremium →</a></p>

      <div class="divider"></div>

      <h2>Seus bônus</h2>
      <ul>
        <li>Calculadora de Juros Compostos Premium</li>
        <li>Minicurso 1º Milhão em 7 Passos (vídeo)</li>
        <li>E-book: As 30 Perguntas dos Ricos Antes de Investir</li>
        <li>Simulador de Aposentadoria Antecipada</li>
        <li>Guia dos 10 Livros que Mudam Sua Vida</li>
        <li>Comunidade Privada no Telegram</li>
      </ul>

      <div class="divider"></div>

      <h2>Próximos passos</h2>
      <p><strong>1.</strong> Configure sua renda mensal em Orçamento.</p>
      <p><strong>2.</strong> Cadastre suas dívidas no simulador de Bola de Neve.</p>
      <p><strong>3.</strong> Descubra seu Número da Liberdade em Metas.</p>

      <div class="divider"></div>

      <p style="font-size:12px;">Garantia incondicional de 7 dias. Alguma dúvida? Responda este email.</p>
      <p style="font-size:11px; color:#6E6A5F;">ID: {session_id[:24]}...</p>
    """
    return _wrap(body)


def owner_sale_html(package_name: str, amount: float, customer_email: str, session_id: str) -> str:
    body = f"""
      <h1>💰 Nova venda confirmada!</h1>
      <div class="kpi">
        <div style="font-size:11px; color:#6E6A5F; letter-spacing:0.14em; text-transform:uppercase;">Valor</div>
        <div style="font-size:32px; color:#E8CE87; font-family:Georgia, serif;">R$ {amount:.2f}</div>
      </div>
      <p><strong>Pacote:</strong> {package_name}</p>
      <p><strong>Cliente:</strong> {customer_email or "(não informado no checkout)"}</p>
      <p><strong>Session:</strong> <code style="color:#C9A961;">{session_id[:32]}...</code></p>
      <div class="divider"></div>
      <p style="font-size:13px;">O cliente já recebeu o email de boas-vindas com o link de acesso.</p>
    """
    return _wrap(body)


def owner_lead_html(email: str, source: str, metadata: dict | None) -> str:
    meta_str = ""
    if metadata:
        rows = []
        for k, v in metadata.items():
            rows.append(f'<li><strong>{k}:</strong> {v}</li>')
        meta_str = f"<ul>{''.join(rows)}</ul>"
    body = f"""
      <h1>🎯 Novo lead capturado</h1>
      <div class="kpi">
        <div style="font-size:11px; color:#6E6A5F; letter-spacing:0.14em; text-transform:uppercase;">Email</div>
        <div style="font-size:22px; color:#E8CE87;">{email}</div>
      </div>
      <p><strong>Origem:</strong> {source}</p>
      {f"<h2>Dados da simulação</h2>{meta_str}" if metadata else ""}
      <div class="divider"></div>
      <p style="font-size:13px;">Dica: envie um follow-up nas próximas 24h — o CTR é <strong style="color:#E8CE87;">3x maior</strong>.</p>
    """
    return _wrap(body)


async def send_email(to_email: str, subject: str, html: str, tag: str = "generic"):
    """Fire-and-forget email send. Never raises — logs errors."""
    if not resend.api_key:
        logger.warning(f"[email:{tag}] RESEND_API_KEY not set, skipping")
        return None
    if not to_email:
        logger.warning(f"[email:{tag}] no recipient, skipping")
        return None
    params = {
        "from": SENDER,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        # resend SDK may return either a dict or a namespaced object
        email_id = result.get("id") if isinstance(result, dict) else getattr(result, "id", None)
        logger.info(f"[email:{tag}] sent to {to_email} id={email_id}")
        return email_id
    except Exception as e:
        logger.error(f"[email:{tag}] FAILED to {to_email}: {e}")
        return None


async def notify_new_lead(email: str, source: str, metadata: dict | None = None):
    if not OWNER:
        return
    await send_email(
        to_email=OWNER,
        subject=f"🎯 Novo lead FinPremium — {email}",
        html=owner_lead_html(email, source, metadata),
        tag="lead-notify",
    )


async def send_customer_welcome(customer_email: str, package_name: str, amount: float, session_id: str):
    if not customer_email:
        return
    await send_email(
        to_email=customer_email,
        subject="🎉 Bem-vindo(a) ao FinPremium — Acesso liberado",
        html=customer_welcome_html(package_name, amount, session_id),
        tag="customer-welcome",
    )


async def notify_owner_sale(package_name: str, amount: float, customer_email: str, session_id: str):
    if not OWNER:
        return
    await send_email(
        to_email=OWNER,
        subject=f"💰 Venda R$ {amount:.2f} — {package_name}",
        html=owner_sale_html(package_name, amount, customer_email, session_id),
        tag="owner-sale",
    )
