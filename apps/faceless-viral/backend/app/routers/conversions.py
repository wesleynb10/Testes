from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Conversion, Post
from ..schemas import ConversionCreate, ConversionOut

router = APIRouter(prefix="/api/conversions", tags=["conversions"])


@router.get("", response_model=list[ConversionOut])
def list_conversions(db: Session = Depends(get_db)):
    return db.query(Conversion).order_by(Conversion.id.desc()).all()


@router.post("", response_model=ConversionOut)
def create_conversion(payload: ConversionCreate, db: Session = Depends(get_db)):
    post = db.get(Post, payload.post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    conversion = Conversion(**payload.model_dump())
    db.add(conversion)
    db.commit()
    db.refresh(conversion)
    return conversion
