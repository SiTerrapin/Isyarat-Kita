import json
import logging
from pathlib import Path
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

PRIORITY_VOCAB: set[str] = {
    "SAYA",
    "AKU",
    "KAMU",
    "ANDA",
    "KITA",
    "MEREKA",
    "MAKAN",
    "MINUM",
    "TOLONG",
    "TERIMA",
    "KASIH",
    "HALO",
    "APA",
    "KABAR",
    "BANTU",
    "RUMAH",
    "SAKIT",
    "MAU",
    "INGIN",
    "PERGI",
    "BELI",
    "BAYAR",
    "HARGA",
    "BERAPA",
    "DIMANA",
    "KAPAN",
    "SIAPA",
    "BAGAIMANA",
    "MENGAPA",
    "MAAF",
    "NAMA",
    "OBAT",
    "DOKTER",
    "APOTEK",
    "KAMPUS",
    "BELAJAR",
    "KERJA",
    "SKRIPSI",
    "INFORMATIKA",
    "NASI",
    "AIR",
    "KOPI",
    "HAUS",
    "LAPAR",
    "KEPALA",
    "BUTUH",
    "DARURAT",
    "DEKAT",
    "SINI",
    "BESOK",
    "PAGI",
    "SIANG",
    "SORE",
    "MALAM",
    "DATANG",
    "TELAT",
    "KETEMU",
    "SENANG",
    "BISA",
    "TIDAK",
    "YA",
    "NGOBROL",
    "BAHASA",
    "ISYARAT",
    "PERMISI",
    "TURUN",
    "HALTE",
    "STASIUN",
    "QRIS",
    "TUNAI",
    "SEKARANG",
    "TUNGGU",
    "SEBENTAR",
}

ABBREVIATION_MAP: dict[str, str] = {
    "SY": "SAYA",
    "SYA": "SAYA",
    "AQ": "AKU",
    "KM": "KAMU",
    "MKN": "MAKAN",
    "MNM": "MINUM",
    "TRMKSH": "TERIMA KASIH",
    "MKSH": "TERIMA KASIH",
    "MAKASIH": "TERIMA KASIH",
    "TLG": "TOLONG",
    "TLNG": "TOLONG",
    "GPP": "TIDAK APA-APA",
    "TDK": "TIDAK",
    "GA": "TIDAK",
    "GAK": "TIDAK",
    "NGGAK": "TIDAK",
    "YG": "YANG",
    "BGT": "BANGET",
    "DG": "DENGAN",
    "DGN": "DENGAN",
    "UTK": "UNTUK",
    "RS": "RUMAH SAKIT",
    "DMN": "DIMANA",
    "BRP": "BERAPA",
    "GMN": "BAGAIMANA",
    "KPN": "KAPAN",
    "SKT": "SAKIT",
    "OBT": "OBAT",
    "SDH": "SUDAH",
    "UDAH": "SUDAH",
    "BLM": "BELUM",
}

BIGRAM_CONTEXT_BONUS: dict[tuple[str, str], float] = {
    ("TERIMA", "KASIH"): 20.0,
    ("RUMAH", "SAKIT"): 20.0,
    ("APA", "KABAR"): 18.0,
    ("NAMA", "SAYA"): 15.0,
    ("TOLONG", "BANTU"): 16.0,
    ("BANTU", "SAYA"): 14.0,
    ("SAYA", "MAU"): 12.0,
    ("MAU", "MAKAN"): 12.0,
    ("MAU", "MINUM"): 12.0,
    ("MAKAN", "NASI"): 14.0,
    ("MINUM", "AIR"): 14.0,
    ("MINUM", "KOPI"): 14.0,
    ("BERAPA", "HARGA"): 18.0,
    ("BUTUH", "OBAT"): 15.0,
    ("DATANG", "TELAT"): 14.0,
    ("BAHASA", "ISYARAT"): 18.0,
    ("DEKAT", "SINI"): 14.0,
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
    "apa",
    "apakah",
    "siapa",
    "di mana",
    "ke mana",
    "dari mana",
    "kapan",
    "berapa",
    "bagaimana",
    "mengapa",
}


class BISINDONLPProcessor:
    """
    Pengolah NLP Bahasa Indonesia ringan untuk BISINDO:
    - Deduplikasi stream huruf
    - Koreksi kata (Sastrawi + rapidfuzz + ABBREVIATION_MAP + BIGRAM_CONTEXT_BONUS)
    - Perangkai gloss ke kalimat natural (dataset JSONL match -> rule-based -> opsional LLM hook)
    """

    def __init__(self, dataset_path: Optional[Path] = None) -> None:
        self.dataset_path: Path = dataset_path or settings.resolved_gloss_dataset_path
        self.vocab_set: set[str] = set(PRIORITY_VOCAB)
        self.vocab_list: list[str] = []
        self.dataset_pairs: list[tuple[str, str]] = []
        self._load_vocabulary()
        self._load_dataset()

    def _load_vocabulary(self) -> None:
        try:
            from Sastrawi.Stemmer.StemmerFactory import StemmerFactory

            factory = StemmerFactory()
            words = factory.get_words_from_file()
            for w in words:
                cleaned = w.strip().upper()
                if cleaned.isalpha() and len(cleaned) >= 2:
                    self.vocab_set.add(cleaned)
            logger.info("Kosakata Sastrawi dimuat: %d kata.", len(self.vocab_set))
        except Exception as exc:
            logger.warning(
                "Sastrawi tidak tersedia (%s). Menggunakan kosakata prioritas (%d kata).",
                exc,
                len(self.vocab_set),
            )
        self.vocab_list = sorted(self.vocab_set)

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
                                self.vocab_set.add(token)
            self.dataset_pairs = pairs
            self.vocab_list = sorted(self.vocab_set)
            logger.info(
                "Dataset referensi gloss dimuat (%d pasangan) dari %s.",
                len(self.dataset_pairs),
                self.dataset_path,
            )
        except Exception as exc:
            logger.warning("Gagal memuat dataset JSONL (%s): %s", self.dataset_path, exc)

    @staticmethod
    def deduplicate_stream(raw_letters: list[str], max_repeat: int = 2) -> str:
        """Gabungkan stream huruf sambil membatasi pengulangan beruntun maksimal max_repeat."""
        result: list[str] = []
        repeat_count = 0
        last_char = ""

        for ch in raw_letters:
            clean = ch.strip().upper()
            if not clean:
                continue
            for c in clean:
                if c == last_char:
                    repeat_count += 1
                    if repeat_count <= max_repeat:
                        result.append(c)
                else:
                    last_char = c
                    repeat_count = 1
                    result.append(c)
        return "".join(result)

    def correct_word(self, raw_word: str, prev_word: Optional[str] = None) -> str:
        word = raw_word.strip().upper()
        if not word:
            return ""

        if word in ABBREVIATION_MAP:
            return ABBREVIATION_MAP[word]

        if word in self.vocab_set:
            return word

        prev_upper = prev_word.strip().upper() if prev_word else None

        try:
            from rapidfuzz import fuzz, process

            candidates = process.extract(
                word,
                self.vocab_list,
                scorer=fuzz.WRatio,
                score_cutoff=65,
                limit=8,
            )
            if not candidates:
                return word

            best_word = word
            best_score = -1.0
            for cand, base_score, _ in candidates:
                score = float(base_score)
                if cand in PRIORITY_VOCAB:
                    score += 5.0
                if prev_upper:
                    score += BIGRAM_CONTEXT_BONUS.get((prev_upper, cand), 0.0)
                if score > best_score:
                    best_score = score
                    best_word = cand
            return best_word
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
        """Hook opsional jika suatu saat ingin dihubungkan ke LLM API / Gemini."""
        if not settings.LLM_API_URL and not settings.GEMINI_API_KEY:
            return None
        return None

    def refine_gloss_to_natural(self, gloss_words: list[str]) -> dict[str, Any]:
        cleaned: list[str] = []
        for token in gloss_words:
            part = token.strip().upper()
            if not part:
                continue
            # Bersihkan pengulangan kata beruntun yang identik
            if not cleaned or cleaned[-1] != part:
                cleaned.append(part)

        if not cleaned:
            return {"sentence": "", "source": "rule", "raw_gloss": []}

        query_gloss = " ".join(cleaned)

        # 1. Cek kecocokan tinggi pada dataset referensi JSONL (>= 88%)
        matched = self._match_dataset(query_gloss)
        if matched:
            return {
                "sentence": matched,
                "source": "dataset",
                "raw_gloss": cleaned,
            }

        # 2. Hook opsional LLM (tidak aktif secara default agar 100% ringan & offline)
        llm_result = self._refine_with_optional_llm(cleaned)
        if llm_result:
            return {
                "sentence": llm_result,
                "source": "llm",
                "raw_gloss": cleaned,
            }

        # 3. Lightweight Indonesian grammar & capitalization refiner
        words: list[str] = []
        for token in cleaned:
            mapped = WORD_DISPLAY_MAP.get(token, token.lower())
            words.append(mapped)

        joined = " ".join(words).strip().rstrip(".!?")
        is_question = any(w in QUESTION_WORDS for w in words)
        sentence = joined[0].upper() + joined[1:] + ("?" if is_question else ".")

        return {
            "sentence": sentence,
            "source": "rule",
            "raw_gloss": cleaned,
        }


nlp_processor = BISINDONLPProcessor()
