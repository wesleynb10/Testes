from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Post, Product, Script
from ..schemas import PostCreate, PostOut, PostUpdate

router = APIRouter(prefix="/api/posts", tags=["posts"])


@router.get("", response_model=list[PostOut])
def list_posts(db: Session = Depends(get_db)):
    return db.query(Post).order_by(Post.id.desc()).all()


@router.post("", response_model=PostOut)
def create_post(payload: PostCreate, db: Session = Depends(get_db)):
    if payload.script_id:
        script = db.get(Script, payload.script_id)
        if not script:
            raise HTTPException(404, "Script not found")
        script.status = "postado"
        product = db.get(Product, script.product_id)
        if product:
            product.status = "posted"
        if not payload.product_id:
            payload.product_id = script.product_id

    post = Post(
        **payload.model_dump(),
        posted_at=payload.posted_at or datetime.utcnow(),
        platform=payload.platform or "tiktok",
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


@router.patch("/{post_id}", response_model=PostOut)
def update_post(post_id: int, payload: PostUpdate, db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(post, key, value)
    db.commit()
    db.refresh(post)
    return post
