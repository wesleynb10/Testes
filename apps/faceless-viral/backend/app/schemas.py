from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


ProductStatus = Literal[
    "draft",
    "produce",
    "archive",
    "in_production",
    "posted",
    "killed",
    "scaled",
]
ScriptStatus = Literal["roteiro", "edicao", "pronto", "postado"]
OfferType = Literal["affiliate", "store", "ads"]


class ProductCreate(BaseModel):
    name: str
    niche: str = "casa"
    price: float = 0
    affiliate_url: str = ""
    supplier_url: str = ""
    pain: str = ""
    hook_visual: str = ""
    benefits: str = ""
    researcher: str = ""
    score_hook: int = Field(0, ge=0, le=2)
    score_price: int = Field(0, ge=0, le=2)
    score_problem: int = Field(0, ge=0, le=2)
    score_margin: int = Field(0, ge=0, le=2)
    score_social: int = Field(0, ge=0, le=2)
    notes: str = ""


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    niche: Optional[str] = None
    price: Optional[float] = None
    affiliate_url: Optional[str] = None
    supplier_url: Optional[str] = None
    pain: Optional[str] = None
    hook_visual: Optional[str] = None
    benefits: Optional[str] = None
    researcher: Optional[str] = None
    score_hook: Optional[int] = Field(None, ge=0, le=2)
    score_price: Optional[int] = Field(None, ge=0, le=2)
    score_problem: Optional[int] = Field(None, ge=0, le=2)
    score_margin: Optional[int] = Field(None, ge=0, le=2)
    score_social: Optional[int] = Field(None, ge=0, le=2)
    status: Optional[ProductStatus] = None
    notes: Optional[str] = None


class ProductOut(BaseModel):
    id: int
    name: str
    niche: str
    price: float
    affiliate_url: str
    supplier_url: str
    pain: str
    hook_visual: str
    benefits: str
    researcher: str
    score_hook: int
    score_price: int
    score_problem: int
    score_margin: int
    score_social: int
    score: int
    status: str
    notes: str
    decision: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ScriptOut(BaseModel):
    id: int
    product_id: int
    hook_type: str
    body: str
    status: str
    caption: str
    created_at: datetime
    product_name: Optional[str] = None

    class Config:
        from_attributes = True


class ScriptStatusUpdate(BaseModel):
    status: ScriptStatus


class PostCreate(BaseModel):
    script_id: Optional[int] = None
    product_id: Optional[int] = None
    asset_id: Optional[int] = None
    platform: str = "tiktok"
    account: str = ""
    posted_at: Optional[datetime] = None
    views: int = 0
    retention_3s: float = 0
    watch_pct: float = 0
    ctr: float = 0


class PostUpdate(BaseModel):
    views: Optional[int] = None
    retention_3s: Optional[float] = None
    watch_pct: Optional[float] = None
    ctr: Optional[float] = None
    account: Optional[str] = None
    posted_at: Optional[datetime] = None


class PostOut(BaseModel):
    id: int
    asset_id: Optional[int]
    script_id: Optional[int]
    product_id: Optional[int]
    platform: str
    account: str
    posted_at: Optional[datetime]
    views: int
    retention_3s: float
    watch_pct: float
    ctr: float
    created_at: datetime

    class Config:
        from_attributes = True


class ConversionCreate(BaseModel):
    post_id: int
    offer_type: OfferType = "affiliate"
    clicks: int = 0
    orders: int = 0
    revenue: float = 0
    cpa: float = 0


class ConversionOut(BaseModel):
    id: int
    post_id: int
    offer_type: str
    clicks: int
    orders: int
    revenue: float
    cpa: float
    created_at: datetime

    class Config:
        from_attributes = True


class DashboardOut(BaseModel):
    products_total: int
    products_produce: int
    scripts_by_status: dict[str, int]
    posts_total: int
    views_total: int
    clicks_total: int
    orders_total: int
    revenue_total: float
    avg_retention_3s: float
    avg_watch_pct: float
    avg_ctr: float
    alerts: list[dict]
