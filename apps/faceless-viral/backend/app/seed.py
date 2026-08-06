"""Seed sample product + scripts for local demo."""

from .db import Base, SessionLocal, engine
from .models import Product
from .scoring import compute_score, decision_from_score
from .scripts_gen import generate_hooks
from .models import Script


def run():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing = db.query(Product).filter(Product.name == "Organizador de cabos magnético").first()
        if existing:
            print(f"Already seeded product id={existing.id}")
            return

        scores = dict(
            score_hook=2,
            score_price=2,
            score_problem=2,
            score_margin=1,
            score_social=2,
        )
        score = compute_score(**scores)
        product = Product(
            name="Organizador de cabos magnético",
            niche="casa",
            price=39.9,
            affiliate_url="https://example.com/aff/cabos",
            pain="cabos embolados na mesa",
            hook_visual="cabos se encaixando com click satisfying",
            benefits="1) mesa limpa  2) cabe no bolso  3) sem furar parede",
            researcher="Researcher A",
            **scores,
            score=score,
            status=decision_from_score(score),
        )
        db.add(product)
        db.flush()

        for hook in generate_hooks(
            product.name, product.pain, product.benefits, product.hook_visual
        ):
            db.add(
                Script(
                    product_id=product.id,
                    hook_type=hook["hook_type"],
                    body=hook["body"],
                    caption=hook["caption"],
                    status="roteiro",
                )
            )
        product.status = "in_production"
        db.commit()
        print(f"Seeded product id={product.id} with 5 scripts")
    finally:
        db.close()


if __name__ == "__main__":
    run()
