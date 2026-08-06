from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import Base, engine
from .routers import conversions, dashboard, metrics, posts, products, scripts

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Faceless Viral Commerce API",
    description="Ops MVP: scorecard, roteiros, Kanban TikTok-first, tracking",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(products.router)
app.include_router(scripts.router)
app.include_router(posts.router)
app.include_router(conversions.router)
app.include_router(metrics.router)
app.include_router(dashboard.router)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "faceless-viral"}
