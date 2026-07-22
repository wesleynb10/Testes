from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    niche: Mapped[str] = mapped_column(String(120), default="casa")
    price: Mapped[float] = mapped_column(Float, default=0.0)
    affiliate_url: Mapped[str] = mapped_column(String(500), default="")
    supplier_url: Mapped[str] = mapped_column(String(500), default="")
    pain: Mapped[str] = mapped_column(String(300), default="")
    hook_visual: Mapped[str] = mapped_column(String(300), default="")
    benefits: Mapped[str] = mapped_column(Text, default="")
    researcher: Mapped[str] = mapped_column(String(120), default="")
    # Scorecard inputs (0–2 each)
    score_hook: Mapped[int] = mapped_column(Integer, default=0)
    score_price: Mapped[int] = mapped_column(Integer, default=0)
    score_problem: Mapped[int] = mapped_column(Integer, default=0)
    score_margin: Mapped[int] = mapped_column(Integer, default=0)
    score_social: Mapped[int] = mapped_column(Integer, default=0)
    score: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(40), default="draft")
    # draft | produce | archive | in_production | posted | killed | scaled
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    scripts: Mapped[list["Script"]] = relationship(back_populates="product")


class Script(Base):
    __tablename__ = "scripts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    hook_type: Mapped[str] = mapped_column(String(80))
    body: Mapped[str] = mapped_column(Text)
    # roteiro | edicao | pronto | postado
    status: Mapped[str] = mapped_column(String(40), default="roteiro")
    caption: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    product: Mapped["Product"] = relationship(back_populates="scripts")
    assets: Mapped[list["Asset"]] = relationship(back_populates="script")


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    script_id: Mapped[int] = mapped_column(ForeignKey("scripts.id"))
    file_url: Mapped[str] = mapped_column(String(500), default="")
    duration_s: Mapped[int] = mapped_column(Integer, default=20)
    status: Mapped[str] = mapped_column(String(40), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    script: Mapped["Script"] = relationship(back_populates="assets")
    posts: Mapped[list["Post"]] = relationship(back_populates="asset")


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id"), nullable=True)
    script_id: Mapped[int | None] = mapped_column(ForeignKey("scripts.id"), nullable=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    platform: Mapped[str] = mapped_column(String(40), default="tiktok")
    account: Mapped[str] = mapped_column(String(120), default="")
    posted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    views: Mapped[int] = mapped_column(Integer, default=0)
    retention_3s: Mapped[float] = mapped_column(Float, default=0.0)
    watch_pct: Mapped[float] = mapped_column(Float, default=0.0)
    ctr: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    asset: Mapped["Asset | None"] = relationship(back_populates="posts")
    conversions: Mapped[list["Conversion"]] = relationship(back_populates="post")


class Conversion(Base):
    __tablename__ = "conversions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"))
    offer_type: Mapped[str] = mapped_column(String(40), default="affiliate")
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    orders: Mapped[int] = mapped_column(Integer, default=0)
    revenue: Mapped[float] = mapped_column(Float, default=0.0)
    cpa: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    post: Mapped["Post"] = relationship(back_populates="conversions")
