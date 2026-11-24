import json
import logging
from collections import Counter
from pathlib import Path
from typing import Any, Optional

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)

PRIORITY_VOCAB: list[str] = [
    "SAYA", "AKU", "KAMU", "ANDA", "KITA", "MEREKA",
    "MAKAN", "MINUM", "TOLONG", "TERIMA", "KASIH", "HALO",
    "APA", "KABAR", "BANTU", "RUMAH", "SAKIT", "MAU",
    "INGIN", "PERGI", "BELI", "BAYAR", "HARGA", "BERAPA",
    "DIMANA", "KAPAN", "SIAPA", "BAGAIMANA", "MENGAPA",
    "MAAF", "NAMA", "OBAT", "DOKTER", "APOTEK", "KAMPUS",
    "BELAJAR", "KERJA", "SKRIPSI", "INFORMATIKA", "NASI",
    "AIR", "KOPI", "HAUS", "LAPAR", "KEPALA", "BUTUH",
    "DARURAT", "DEKAT", "SINI", "BESOK", "PAGI", "SIANG",
    "SORE", "MALAM", "SELAMAT", "DATANG", "TELAT", "KETEMU",
    "SENANG", "BISA", "TIDAK", "YA", "NGOBROL", "BAHASA",
    "ISYARAT", "PERMISI", "TURUN", "HALTE", "STASIUN", "QRIS",
]

ABBREVIATION_MAP: dict[str, str] = {
    "SY": "SAYA",
    "SYA": "SAYA",
    "MKN": "MAKAN",
    "KMPUS": "KAMPUS",
    "TRMKSH": "TERIMA KASIH",
    "GPP": "TIDAK APA-APA",
    "TDK": "TIDAK",
    "YG": "YANG",
    "BGT": "BANGET",
    "TLG": "TOLONG",
    "MKSH": "TERIMA KASIH",
    "MNM": "MINUM",
    "DMN": "DIMANA",
    "BRP": "BERAPA",
    "GMN": "BAGAIMANA",
    "RS": "RUMAH SAKIT",
}

BIGRAM_CONTEXT_BONUS: dict[str, dict[str, float]] = {
    "TERIMA": {"KASIH": 35.0},
    "SELAMAT": {"PAGI": 30.0, "SIANG": 30.0, "SORE": 30.0, "MALAM": 30.0},
    "APA": {"KABAR": 35.0},
    "RUMAH": {"SAKIT": 35.0},
    "TOLONG": {"BANTU": 25.0},
    "BANTU": {"SAYA": 20.0},
    "NAMA": {"SAYA": 25.0},
    "BERAPA": {"HARGA": 30.0},
    "BAHASA": {"ISYARAT": 30.0},
}

WORD_DISPLAY_MAP: dict[str, str] = {
    "DIMANA": "di mana",
    "KEMANA": "ke mana",
    "DARIMANA": "dari mana",
    "GIMANA": "bagaimana",
    "KENAPA": "mengapa",
    "NGGAK": "tidak",
    "GAK": "tidak",
    "GA": "tidak",
    "UDAH": "sudah",
    "TELAT": "terlambat",
}

QUESTION_WORDS: set[str] = {
    "apa", "apakah", "siapa", "di mana", "ke mana",
    "dari mana", "kapan", "berapa", "bagaimana", "mengapa",
}


class BISINDONLPProcessor:
    """
    Pengolah NLP BISINDO identik 100% dengan notebook testing:
    - vocab_counter (Sastrawi + kosakata prioritas + dataset JSONL)
    - deduplicate_stream(raw_letters, max_repeat=2)
    - correct_word(raw_word, prev_word) dengan formula exact rapidfuzz WRatio + log10 freq - diff*12 + bigram bonus
    - refine_gloss_to_natural (dataset JSONL match >= 88% -> opsional LLM hook -> rule-based)
    """

    def __init__(
        self,
        vocab_counter: Optional[Counter] = None,
        abbr_map: Optional[dict[str, str]] = None,
        bigram_bonus: Optional[dict[str, dict[str, float]]] = None,
        dataset_path: Optional[Path] = None,
    ) -> None:
        self.dataset_path: Path = dataset_path or settings.resolved_gloss_dataset_path
        self.abbr_map: dict[str, str] = dict(abbr_map or ABBREVIATION_MAP)
        self.bigram_bonus: dict[str, dict[str, float]] = dict(
            bigram_bonus or BIGRAM_CONTEXT_BONUS
        )
        self.dataset_pairs: list[tuple[str, str]] = []
        self.vocab_counter: Counter = (
            vocab_counter if vocab_counter is not None else self._build_vocab_counter()
        )
        self._load_dataset()
        self.vocab_list: list[str] = list(self.vocab_counter.keys())

    def _build_vocab_counter(self) -> Counter:
        counter: Counter = Counter()
        try:
            from Sastrawi.Stemmer.StemmerFactory import StemmerFactory

            factory = StemmerFactory()
            for w in factory.get_words_from_file():
                cleaned = w.strip().upper()
                if cleaned.isalpha() and len(cleaned) >= 2:
                    counter[cleaned] += 1
            logger.info("Kosakata Sastrawi dimuat: %d kata.", len(counter))
        except Exception as exc:
            logger.warning("Sastrawi tidak tersedia (%s), gunakan kosakata prioritas.", exc)

        # Beri bobot frekuensi lebih tinggi untuk kata sehari-hari & layanan publik
        for w in PRIORITY_VOCAB:
            counter[w] += 100
        return counter

    def _load_dataset(self) -> None:
        if not self.dataset_path.exists():
            return
        try:
            pairs: list[tuple[str, str]] = []
            with self.dataset_path.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    item = json.loads(line)
                    gloss = str(item.get("gloss", "")).strip().upper()
                    natural = str(item.get("natural", "")).strip()
                    if gloss and natural:
                        pairs.append((gloss, natural))
                        for token in gloss.split():
                            if token.isalpha():
                                self.vocab_counter[token] += 50
            self.dataset_pairs = pairs
            logger.info(
                "Dataset gloss dimuat (%d pasangan) dari %s.",
                len(self.dataset_pairs),
                self.dataset_path,
            )
        except Exception as exc:
            logger.warning("Gagal memuat dataset JSONL (%s): %s", self.dataset_path, exc)

    def deduplicate_stream(self, raw_letters: list[str], max_repeat: int = 2) -> str:
        """Identik 100% dengan deduplicate_stream pada notebook testing."""
        if not raw_letters:
            return ""
        flat = [ch.strip().upper() for ch in raw_letters if ch and ch.strip()]
        if not flat:
            return ""
        cleaned = [flat[0]]
        rep = 1
        for ch in flat[1:]:
            if ch == cleaned[-1]:
                rep += 1
                if rep <= max_repeat:
                    cleaned.append(ch)
            else:
                rep = 1
                cleaned.append(ch)
        return "".join(cleaned).upper()

    def correct_word(self, raw_word: str, prev_word: Optional[str] = None) -> str:
        """Identik 100% dengan correct_word pada notebook testing."""
        word = raw_word.strip().upper()
        if not word:
            return ""
        if word in self.abbr_map:
            return self.abbr_map[word]

        prev_upper = prev_word.strip().upper() if prev_word else None

        try:
            from rapidfuzz import fuzz, process

            cands = process.extract(
                word,
                self.vocab_list,
                scorer=fuzz.WRatio,
                limit=10,
                score_cutoff=65,
            )
            if not cands:
                return word

            best, max_sc = word, -1.0
            for cw, sim, _ in cands:
                diff = abs(len(cw) - len(word))
                if diff > 2:
                    continue
                score = (
                    float(sim)
                    + min(15.0, float(np.log10(self.vocab_counter[cw] + 1) * 2.5))
                    - (diff * 12.0)
                )
                if (
                    prev_upper
                    and prev_upper in self.bigram_bonus
                    and cw in self.bigram_bonus[prev_upper]
                ):
                    score += self.bigram_bonus[prev_upper][cw]
                if score > max_sc:
                    max_sc, best = score, cw
            return best
        except Exception:
            return word

    def correct_letters(
        self, letters: list[str], prev_word: Optional[str] = None
    ) -> dict[str, str]:
        raw_word = self.deduplicate_stream(letters, max_repeat=2)
        corrected_word = self.correct_word(raw_word, prev_word=prev_word)
        return {
            "raw_word": raw_word,
            "corrected_word": corrected_word,
        }

    def _match_dataset(self, query_gloss: str) -> Optional[str]:
        if not self.dataset_pairs:
            return None
        try:
            from rapidfuzz import fuzz

            best_score = 0.0
            best_natural: Optional[str] = None
            for ref_gloss, natural in self.dataset_pairs:
                score = float(fuzz.token_set_ratio(query_gloss, ref_gloss))
                if score > best_score:
                    best_score = score
                    best_natural = natural

            if best_score >= 88.0 and best_natural:
                return best_natural
        except Exception:
            pass
        return None

    @staticmethod
    def _refine_with_optional_llm(cleaned_gloss: list[str]) -> Optional[str]:
        if not settings.LLM_API_URL and not settings.GEMINI_API_KEY:
            return None
        return None

    def refine_gloss_to_natural(self, gloss_words: list[str]) -> dict[str, Any]:
        cleaned: list[str] = []
        for token in gloss_words:
            part = token.strip().upper()
            if not part:
                continue
            if not cleaned or cleaned[-1] != part:
                cleaned.append(part)

        if not cleaned:
            return {"sentence": "", "source": "rule", "raw_gloss": []}

        query_gloss = " ".join(cleaned)

        matched = self._match_dataset(query_gloss)
        if matched:
            return {"sentence": matched, "source": "dataset", "raw_gloss": cleaned}

        llm_result = self._refine_with_optional_llm(cleaned)
        if llm_result:
            return {"sentence": llm_result, "source": "llm", "raw_gloss": cleaned}

        words = [WORD_DISPLAY_MAP.get(token, token.lower()) for token in cleaned]
        joined = " ".join(words).strip().rstrip(".!?")
        is_question = any(w in QUESTION_WORDS for w in words)
        sentence = joined[0].upper() + joined[1:] + ("?" if is_question else ".")

        return {"sentence": sentence, "source": "rule", "raw_gloss": cleaned}


nlp_processor = BISINDONLPProcessor()
