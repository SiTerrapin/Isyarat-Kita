from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from app.core.security import get_current_user, get_optional_user
from app.db.database import get_db
from app.db.models import QuickCard, User
from app.schemas.cards import (
    CardCategory,
    QuickCardCreate,
    QuickCardResponse,
    QuickCardUpdate,
)

router = APIRouter(prefix="/api/cards", tags=["Quick Cards"])


def _to_card_response(card: QuickCard) -> QuickCardResponse:
    return QuickCardResponse(
        id=card.id,
        user_id=card.user_id,
        category=card.category,
        title=card.title,
        message=card.message,
        is_pinned=card.is_pinned,
        is_custom=card.user_id is not None,
        created_at=card.created_at,
    )


@router.get("", response_model=list[QuickCardResponse])
def list_cards(
    category: Optional[CardCategory] = Query(default=None, description="Filter opsional berdasarkan kategori"),
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> list[QuickCardResponse]:
    query = db.query(QuickCard)

    if current_user is None:
        # Guest Mode: hanya kartu bawaan sistem (user_id IS NULL)
        query = query.filter(QuickCard.user_id.is_(None))
    else:
        # User Login: kartu bawaan sistem + kartu kustom milik user
        query = query.filter(
            or_(QuickCard.user_id.is_(None), QuickCard.user_id == current_user.id)
        )

    if category is not None:
        query = query.filter(QuickCard.category == category)

    cards = (
        query.order_by(desc(QuickCard.is_pinned), desc(QuickCard.created_at), desc(QuickCard.id))
        .all()
    )
    return [_to_card_response(card) for card in cards]


@router.post("", response_model=QuickCardResponse, status_code=status.HTTP_201_CREATED)
def create_card(
    payload: QuickCardCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuickCardResponse:
    card = QuickCard(
        user_id=current_user.id,
        category=payload.category,
        title=payload.title.strip(),
        message=payload.message.strip(),
        is_pinned=payload.is_pinned,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return _to_card_response(card)


@router.put("/{card_id}", response_model=QuickCardResponse)
def update_card(
    card_id: int,
    payload: QuickCardUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuickCardResponse:
    card = db.query(QuickCard).filter(QuickCard.id == card_id).first()
    if card is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kartu tidak ditemukan.",
        )
    if card.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Kartu bawaan sistem tidak dapat diubah.",
        )
    if card.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Anda tidak memiliki izin untuk mengubah kartu ini.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    if "title" in update_data and update_data["title"] is not None:
        update_data["title"] = update_data["title"].strip()
    if "message" in update_data and update_data["message"] is not None:
        update_data["message"] = update_data["message"].strip()

    for field, value in update_data.items():
        setattr(card, field, value)

    db.commit()
    db.refresh(card)
    return _to_card_response(card)


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    card = db.query(QuickCard).filter(QuickCard.id == card_id).first()
    if card is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kartu tidak ditemukan.",
        )
    if card.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Kartu bawaan sistem tidak dapat dihapus.",
        )
    if card.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Anda tidak memiliki izin untuk menghapus kartu ini.",
        )

    db.delete(card)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
