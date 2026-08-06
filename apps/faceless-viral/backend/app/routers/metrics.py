import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Conversion, Post, Product, Script
from ..scripts_gen import daily_checklist

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.post("/import-csv")
async def import_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    CSV columns (header required):
    account,platform,views,retention_3s,watch_pct,ctr,clicks,orders,revenue,cpa,offer_type,script_id,product_id
    """
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(400, "CSV must be UTF-8") from exc

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(400, "Empty CSV")

    created_posts = 0
    created_conversions = 0
    for row in reader:
        if not any((row.get(k) or "").strip() for k in (reader.fieldnames or [])):
            continue
        post = Post(
            account=(row.get("account") or "").strip(),
            platform=(row.get("platform") or "tiktok").strip() or "tiktok",
            views=int(float(row.get("views") or 0)),
            retention_3s=float(row.get("retention_3s") or 0),
            watch_pct=float(row.get("watch_pct") or 0),
            ctr=float(row.get("ctr") or 0),
            script_id=int(row["script_id"]) if row.get("script_id") else None,
            product_id=int(row["product_id"]) if row.get("product_id") else None,
            posted_at=datetime.utcnow(),
        )
        db.add(post)
        db.flush()
        created_posts += 1

        clicks = int(float(row.get("clicks") or 0))
        orders = int(float(row.get("orders") or 0))
        revenue = float(row.get("revenue") or 0)
        cpa = float(row.get("cpa") or 0)
        if clicks or orders or revenue:
            conversion = Conversion(
                post_id=post.id,
                offer_type=(row.get("offer_type") or "affiliate").strip()
                or "affiliate",
                clicks=clicks,
                orders=orders,
                revenue=revenue,
                cpa=cpa,
            )
            db.add(conversion)
            created_conversions += 1

    db.commit()
    return {
        "ok": True,
        "posts_created": created_posts,
        "conversions_created": created_conversions,
    }


@router.get("/checklist", response_class=PlainTextResponse)
def export_checklist(db: Session = Depends(get_db)):
    produce = (
        db.query(Product)
        .filter(Product.status.in_(["produce", "in_production"]))
        .order_by(Product.score.desc())
        .all()
    )
    scripts_ready = db.query(Script).filter(Script.status.in_(["roteiro", "edicao", "pronto"])).count()
    posts_planned = db.query(Script).filter(Script.status == "pronto").count()
    text = daily_checklist(
        [p.name for p in produce[:10]],
        scripts_ready,
        posts_planned,
    )
    return PlainTextResponse(text, media_type="text/markdown; charset=utf-8")


@router.get("/csv-template", response_class=PlainTextResponse)
def csv_template():
    header = (
        "account,platform,views,retention_3s,watch_pct,ctr,"
        "clicks,orders,revenue,cpa,offer_type,script_id,product_id\n"
    )
    example = (
        "casa1,tiktok,12000,0.72,0.45,0.018,40,2,89.90,0,affiliate,,\n"
    )
    return PlainTextResponse(header + example, media_type="text/csv")
