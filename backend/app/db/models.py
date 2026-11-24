from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(150), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    quick_cards: Mapped[list["QuickCard"]] = relationship(
        "QuickCard", back_populates="user", cascade="all, delete-orphan"
    )
    translation_logs: Mapped[list["TranslationLog"]] = relationship(
        "TranslationLog", back_populates="user", cascade="all, delete-orphan"
    )
    sound_alerts: Mapped[list["SoundAlert"]] = relationship(
        "SoundAlert", back_populates="user", cascade="all, delete-orphan"
    )
    settings: Mapped[Optional["UserSetting"]] = relationship(
        "UserSetting", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class QuickCard(Base):
    __tablename__ = "quick_cards"
    __table_args__ = (
        CheckConstraint(
            "category IN ('darurat', 'kesehatan', 'transportasi', 'transaksi', 'umum')",
            name="quick_cards_category_check",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    user: Mapped[Optional["User"]] = relationship("User", back_populates="quick_cards")


class TranslationLog(Base):
    __tablename__ = "translation_logs"
    __table_args__ = (
        CheckConstraint(
            "mode IN ('sign_to_text', 'speech_to_text')",
            name="translation_logs_mode_check",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    mode: Mapped[str] = mapped_column(String(20), nullable=False)
    raw_gloss: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    final_text: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="translation_logs")


class SoundAlert(Base):
    __tablename__ = "sound_alerts"
    __table_args__ = (
        CheckConstraint(
            "severity IN ('warning', 'danger')",
            name="sound_alerts_severity_check",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sound_type: Mapped[str] = mapped_column(String(50), nullable=False)
    decibel_level: Mapped[float] = mapped_column(Float, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="sound_alerts")


class UserSetting(Base):
    __tablename__ = "user_settings"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    alert_threshold_db: Mapped[int] = mapped_column(Integer, default=75, server_default="75")
    tts_speech_rate: Mapped[float] = mapped_column(Float, default=1.0, server_default="1.0")
    tts_voice: Mapped[str] = mapped_column(
        String(50), default="id-ID-ArdiNeural", server_default="id-ID-ArdiNeural", nullable=False
    )
    auto_detect_sign: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    haptic_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="settings")
