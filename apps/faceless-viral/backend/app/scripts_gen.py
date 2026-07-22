"""Generate the 5 faceless hook scripts from the playbook templates."""

from __future__ import annotations

HOOK_TEMPLATES = [
    {
        "hook_type": "problema_imediato",
        "body": (
            "[VOZ/TEXTO] Pare de sofrer com {pain}.\n"
            "[DEMO] Olha o {product} resolvendo em segundos.\n"
            "[BENEFÍCIO] {benefits}\n"
            "[CTA] Link na bio — comenta EU QUERO. #publi"
        ),
        "caption": "Resolve {pain} em segundos. Link na bio. Comenta EU QUERO. #publi",
    },
    {
        "hook_type": "antes_depois",
        "body": (
            "[VISUAL] Antes: {pain}. Depois: resolvido com {product}.\n"
            "[VOZ] O {product} virou o atalho que eu queria.\n"
            "[PROVA] Em menos de 10 segundos muda o jogo. {benefits}\n"
            "[CTA] Tá no link da bio. #publi"
        ),
        "caption": "Antes x depois com {product}. Link na bio. #publi",
    },
    {
        "hook_type": "ninguem_te_conta",
        "body": (
            "[TEXTO] O produto viral que resolve {pain} de verdade.\n"
            "[DEMO] Encaixa / liga / usa — pronto. ({product})\n"
            "[LISTA] {benefits}\n"
            "[CTA] Corre no link da bio antes de esgotar o hype. #publi"
        ),
        "caption": "Ninguém te conta sobre o {product}. Link na bio. #publi",
    },
    {
        "hook_type": "satisfying",
        "body": (
            "[VISUAL] Loop satisfying do {product} nos primeiros 1s. Hook: {hook_visual}\n"
            "[VOZ] Isso vicia. E ainda resolve {pain}.\n"
            "[BENEFÍCIO] {benefits}\n"
            "[CTA] Link na bio. Salva esse vídeo. #publi"
        ),
        "caption": "Satisfying + útil: {product}. Salva. Link na bio. #publi",
    },
    {
        "hook_type": "prova_social",
        "body": (
            "[TEXTO] Por que esse {product} tá em todo lugar?\n"
            "[DEMO] Porque resolve {pain} sem drama.\n"
            "[PROVA] {benefits}\n"
            "[CTA] Comenta EU QUERO / link na bio. #publi"
        ),
        "caption": "Todo mundo pedindo o {product}. Comenta EU QUERO. #publi",
    },
]


def generate_hooks(
    product_name: str,
    pain: str,
    benefits: str,
    hook_visual: str = "",
) -> list[dict[str, str]]:
    product = product_name.strip() or "produto"
    pain_text = pain.strip() or "esse problema"
    benefits_text = benefits.strip() or "Rápido. Barato. Cabe no dia a dia."
    hook = hook_visual.strip() or f"demo visual do {product}"

    results = []
    for template in HOOK_TEMPLATES:
        ctx = {
            "product": product,
            "pain": pain_text,
            "benefits": benefits_text,
            "hook_visual": hook,
        }
        results.append(
            {
                "hook_type": template["hook_type"],
                "body": template["body"].format(**ctx),
                "caption": template["caption"].format(**ctx),
                "status": "roteiro",
            }
        )
    return results


def daily_checklist(
    products_to_produce: list[str],
    scripts_ready: int,
    posts_planned: int,
) -> str:
    lines = [
        "# Checklist diário — Faceless Viral (TikTok-first)",
        "",
        "## Researcher",
        "- [ ] Scorecard em 5–10 produtos",
        "- [ ] Entregar 1–2 fichas com score ≥ 7",
        f"- [ ] Produtos liberados hoje: {', '.join(products_to_produce) or '—'}",
        "",
        "## Produção",
        f"- [ ] Roteiros prontos na fila: {scripts_ready}",
        "- [ ] Batch CapCut (3–5 cuts)",
        "- [ ] Voz IA + texto on-screen + CTA #publi",
        "",
        "## Poster (TikTok only)",
        f"- [ ] Posts planejados: {posts_planned}",
        "- [ ] Postar nas 2 contas TikTok",
        "- [ ] Responder CTA / fixar comentário",
        "",
        "## Closer",
        "- [ ] Tracking: views, retenção 3s, CTR, vendas",
        "- [ ] Bio com 1 oferta ativa",
        "- [ ] Revisar kill/scale alerts",
        "",
    ]
    return "\n".join(lines)
