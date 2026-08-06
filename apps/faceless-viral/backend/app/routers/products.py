from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Product
from ..schemas import ProductCreate, ProductOut, ProductUpdate
from ..scoring import compute_score, decision_from_score, score_breakdown

router = APIRouter(prefix="/api/products", tags=["products"])


def _to_out(product: Product) -> ProductOut:
    return ProductOut(
        id=product.id,
        name=product.name,
        niche=product.niche,
        price=product.price,
        affiliate_url=product.affiliate_url,
        supplier_url=product.supplier_url,
        pain=product.pain,
        hook_visual=product.hook_visual,
        benefits=product.benefits,
        researcher=product.researcher,
        score_hook=product.score_hook,
        score_price=product.score_price,
        score_problem=product.score_problem,
        score_margin=product.score_margin,
        score_social=product.score_social,
        score=product.score,
        status=product.status,
        notes=product.notes,
        decision=decision_from_score(product.score),
        created_at=product.created_at,
        updated_at=product.updated_at,
    )


@router.get("", response_model=list[ProductOut])
def list_products(status: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Product).order_by(Product.score.desc(), Product.id.desc())
    if status:
        query = query.filter(Product.status == status)
    return [_to_out(p) for p in query.all()]


@router.post("/scorecard")
def preview_scorecard(payload: ProductCreate):
    return score_breakdown(
        payload.score_hook,
        payload.score_price,
        payload.score_problem,
        payload.score_margin,
        payload.score_social,
    )


@router.post("", response_model=ProductOut)
def create_product(payload: ProductCreate, db: Session = Depends(get_db)):
    score = compute_score(
        payload.score_hook,
        payload.score_price,
        payload.score_problem,
        payload.score_margin,
        payload.score_social,
    )
    status = decision_from_score(score)
    product = Product(
        **payload.model_dump(),
        score=score,
        status=status,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return _to_out(product)


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    return _to_out(product)


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(product, key, value)

    product.score = compute_score(
        product.score_hook,
        product.score_price,
        product.score_problem,
        product.score_margin,
        product.score_social,
    )
    # If researcher didn't force a status, keep score-driven suggestion for draft/produce/archive
    if "status" not in data and product.status in {"draft", "produce", "archive"}:
        product.status = decision_from_score(product.score)

    db.commit()
    db.refresh(product)
    return _to_out(product)


@router.delete("/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    db.delete(product)
    db.commit()
    return {"ok": True}
