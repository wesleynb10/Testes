from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Product, Script
from ..schemas import ScriptOut, ScriptStatusUpdate
from ..scripts_gen import generate_hooks

router = APIRouter(prefix="/api/scripts", tags=["scripts"])


def _to_out(script: Script, product_name: str | None = None) -> ScriptOut:
    return ScriptOut(
        id=script.id,
        product_id=script.product_id,
        hook_type=script.hook_type,
        body=script.body,
        status=script.status,
        caption=script.caption,
        created_at=script.created_at,
        product_name=product_name,
    )


@router.get("", response_model=list[ScriptOut])
def list_scripts(status: str | None = None, db: Session = Depends(get_db)):
    query = (
        db.query(Script, Product.name)
        .join(Product, Product.id == Script.product_id)
        .order_by(Script.id.desc())
    )
    if status:
        query = query.filter(Script.status == status)
    return [_to_out(script, name) for script, name in query.all()]


@router.post("/generate/{product_id}", response_model=list[ScriptOut])
def generate_for_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    if product.score < 7 and product.status != "produce":
        raise HTTPException(
            400,
            "Só gere roteiros para produtos com score ≥ 7 ou status produce",
        )

    hooks = generate_hooks(
        product.name, product.pain, product.benefits, product.hook_visual
    )
    created = []
    for hook in hooks:
        script = Script(
            product_id=product.id,
            hook_type=hook["hook_type"],
            body=hook["body"],
            caption=hook["caption"],
            status="roteiro",
        )
        db.add(script)
        created.append(script)

    if product.status in {"draft", "produce", "archive"}:
        product.status = "in_production"

    db.commit()
    for script in created:
        db.refresh(script)
    return [_to_out(s, product.name) for s in created]


@router.patch("/{script_id}", response_model=ScriptOut)
def update_script_status(
    script_id: int, payload: ScriptStatusUpdate, db: Session = Depends(get_db)
):
    script = db.get(Script, script_id)
    if not script:
        raise HTTPException(404, "Script not found")
    script.status = payload.status
    product = db.get(Product, script.product_id)
    if payload.status == "postado" and product:
        product.status = "posted"
    db.commit()
    db.refresh(script)
    name = product.name if product else None
    return _to_out(script, name)


@router.get("/kanban")
def kanban(db: Session = Depends(get_db)):
    columns = ["roteiro", "edicao", "pronto", "postado"]
    result = {col: [] for col in columns}
    rows = (
        db.query(Script, Product.name)
        .join(Product, Product.id == Script.product_id)
        .order_by(Script.id.desc())
        .all()
    )
    for script, name in rows:
        if script.status in result:
            result[script.status].append(_to_out(script, name))
    return result
