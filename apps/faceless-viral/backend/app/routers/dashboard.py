from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Conversion, Post, Product, Script
from ..schemas import DashboardOut

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def dashboard(db: Session = Depends(get_db)):
    products_total = db.query(Product).count()
    products_produce = (
        db.query(Product)
        .filter(Product.status.in_(["produce", "in_production", "posted", "scaled"]))
        .count()
    )

    scripts_by_status = {s: 0 for s in ["roteiro", "edicao", "pronto", "postado"]}
    for status, count in (
        db.query(Script.status, func.count(Script.id)).group_by(Script.status).all()
    ):
        scripts_by_status[status] = count

    posts = db.query(Post).all()
    posts_total = len(posts)
    views_total = sum(p.views for p in posts)
    avg_retention = (
        sum(p.retention_3s for p in posts) / posts_total if posts_total else 0.0
    )
    avg_watch = sum(p.watch_pct for p in posts) / posts_total if posts_total else 0.0
    avg_ctr = sum(p.ctr for p in posts) / posts_total if posts_total else 0.0

    conversions = db.query(Conversion).all()
    clicks_total = sum(c.clicks for c in conversions)
    orders_total = sum(c.orders for c in conversions)
    revenue_total = sum(c.revenue for c in conversions)

    alerts: list[dict] = []

    # Kill: products with many posts but no conversions/clicks
    for product in db.query(Product).filter(Product.status.in_(["posted", "in_production"])).all():
        product_posts = [p for p in posts if p.product_id == product.id]
        if len(product_posts) >= 10:
            post_ids = {p.id for p in product_posts}
            related = [c for c in conversions if c.post_id in post_ids]
            total_clicks = sum(c.clicks for c in related)
            total_orders = sum(c.orders for c in related)
            cold = all(p.views < 1000 for p in product_posts)
            if cold and total_clicks == 0 and total_orders == 0:
                alerts.append(
                    {
                        "type": "kill",
                        "level": "warn",
                        "message": f"Matar produto '{product.name}': ≥10 posts frios sem cliques/vendas",
                        "product_id": product.id,
                    }
                )

    # Scale: strong organic + sales
    for product in db.query(Product).all():
        product_posts = [p for p in posts if p.product_id == product.id]
        if not product_posts:
            continue
        post_ids = {p.id for p in product_posts}
        related = [c for c in conversions if c.post_id in post_ids]
        orders = sum(c.orders for c in related)
        best_ctr = max((p.ctr for p in product_posts), default=0)
        best_ret = max((p.retention_3s for p in product_posts), default=0)
        if orders >= 1 and best_ctr >= 0.01 and best_ret >= 0.7:
            alerts.append(
                {
                    "type": "scale",
                    "level": "success",
                    "message": (
                        f"Escalar '{product.name}': venda + CTR≥1% + retenção 3s≥70%. "
                        "Gerar 5–10 novos hooks e considerar loja."
                    ),
                    "product_id": product.id,
                }
            )
            if product.status == "posted":
                # suggest store migration
                alerts.append(
                    {
                        "type": "migrate_store",
                        "level": "info",
                        "message": f"Migrar '{product.name}' de afiliado → loja (oferta validada)",
                        "product_id": product.id,
                    }
                )

    # Weak retention alert
    weak = [p for p in posts if p.views >= 500 and p.retention_3s and p.retention_3s < 0.7]
    if weak:
        alerts.append(
            {
                "type": "creative",
                "level": "warn",
                "message": f"{len(weak)} post(s) com retenção 3s < 70% — revisar hook visual",
            }
        )

    return DashboardOut(
        products_total=products_total,
        products_produce=products_produce,
        scripts_by_status=scripts_by_status,
        posts_total=posts_total,
        views_total=views_total,
        clicks_total=clicks_total,
        orders_total=orders_total,
        revenue_total=revenue_total,
        avg_retention_3s=round(avg_retention, 4),
        avg_watch_pct=round(avg_watch, 4),
        avg_ctr=round(avg_ctr, 4),
        alerts=alerts,
    )
