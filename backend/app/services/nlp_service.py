import json
import logging
import re
import time
from collections import Counter
from pathlib import Path
from typing import Any, Optional

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Kamu adalah asisten penerjemah bahasa isyarat BISINDO ke Bahasa Indonesia yang natural dan sopan.
Input yang kamu terima berasal dari deteksi kamera tangan (ejaan jari/gloss) sehingga bisa berupa:
1. Rangkaian huruf yang menempel sebagian atau seluruhnya tanpa spasi (contoh: "HALONAMAKU BUDI" -> "Halo namaku Budi", "HALONAMAKUBUDI" -> "Halo namaku Budi", "SAYAMAUMAKANNASI" -> "Saya mau makan nasi").
2. Kata dengan huruf berulang atau typo ringan (contoh: "SAAAAYAAA MAUUU MKNNN" -> "Saya mau makan").
3. Susunan kata yang terbalik atau belum baku (contoh: "TERIMA KASIH BANTU SYA" -> "Terima kasih sudah membantu saya").

Aturan wajib:
- Pisahkan rangkaian huruf tanpa spasi menjadi kata-kata yang tepat, lalu susun menjadi 1 kalimat Bahasa Indonesia yang utuh, natural, dan siap dibacakan oleh Text-to-Speech.
- JANGAN memotong kalimat dan JANGAN mengubah atau menghilangkan nama orang.
- HANYA kembalikan kalimat hasil akhirnya saja, tanpa tanda kutip, tanpa penjelasan, dan tanpa komentar tambahan apa pun."""

CHAT_AI_SYSTEM_PROMPT = (
    "Kamu adalah asisten teman bicara yang ramah, suportif, dan inklusif untuk pengguna "
    "bahasa isyarat BISINDO. Balas kalimat pengguna dalam Bahasa Indonesia yang natural, "
    "hangat, dan singkat (maksimal 1–2 kalimat saja) agar enak dibacakan oleh Text-to-Speech."
)

DEFAULT_AI_REPLY = (
    "Terima kasih sudah berbagi! Ada hal lain yang ingin kamu sampaikan?"
)

PRIORITY_VOCAB: list[str] = [
    "SAYA", "AKU", "KAMU", "ANDA", "KITA", "MEREKA",
    "MAKAN", "MINUM", "TOLONG", "TERIMA", "KASIH", "HALO",
    "APA", "KABAR", "BANTU", "RUMAH", "SAKIT", "MAU",
    "INGIN", "PERGI", "BELI", "BAYAR", "HARGA", "BERAPA",
    "DIMANA", "KAPAN", "SIAPA", "BAGAIMANA", "MENGAPA",
    "MAAF", "SAAT", "NAMA", "OBAT", "DOKTER", "APOTEK", "KAMPUS",
    "BELAJAR", "KERJA", "SKRIPSI", "INFORMATIKA", "NASI",
    "AIR", "KOPI", "HAUS", "LAPAR", "KEPALA", "BUTUH",
    "DARURAT", "DEKAT", "SINI", "BESOK", "PAGI", "SIANG",
    "SORE", "MALAM", "SELAMAT", "DATANG", "TELAT", "KETEMU",
    "SENANG", "BISA", "TIDAK", "YA", "NGOBROL", "BAHASA",
    "ISYARAT", "PERMISI", "TURUN", "HALTE", "STASIUN", "QRIS",
    "TUNGGU", "SEBENTAR", "MINGGU", "MANGGA",
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


def _collapse_repeats(text: str, max_repeat: int) -> str:
    if not text:
        return ""
    cleaned = [text[0]]
    rep = 1
    for ch in text[1:]:
        if ch == cleaned[-1]:
            rep += 1
            if rep <= max_repeat:
                cleaned.append(ch)
        else:
            rep = 1
            cleaned.append(ch)
    return "".join(cleaned)


class BISINDONLPProcessor:
    """
    Hybrid NLP BISINDO:
    1. Pembersihan lokal cerdas (deduplicate_stream sadar kamus + correct_word ketat score_cutoff=80)
    2. Gemini API (gemini-2.5-flash) mendukung API Key standar maupun Vertex AI Express (AQ....)
    3. Auto-fallback offline ke dataset JSONL + rule-based lokal tanpa crash.
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
        self.dataset_replies: list[tuple[str, str, str]] = []
        self.vocab_counter: Counter = (
            vocab_counter if vocab_counter is not None else self._build_vocab_counter()
        )
        self._load_dataset()
        self.vocab_list: list[str] = list(self.vocab_counter.keys())
        self._gemini_clients: list[tuple[str, Any]] = []
        self._gemini_initialized: bool = False

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
            logger.warning(
                "Sastrawi tidak tersedia (%s), gunakan kosakata prioritas.", exc
            )

        for w in PRIORITY_VOCAB:
            counter[w] += 100
        return counter

    def _load_dataset(self) -> None:
        if not self.dataset_path.exists():
            return
        try:
            pairs: list[tuple[str, str]] = []
            replies: list[tuple[str, str, str]] = []
            with self.dataset_path.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    item = json.loads(line)
                    gloss = str(item.get("gloss", "")).strip().upper()
                    natural = str(item.get("natural", "")).strip()
                    reply = str(item.get("reply", "")).strip()
                    if gloss and natural:
                        pairs.append((gloss, natural))
                        if reply:
                            replies.append((gloss, natural, reply))
                        for token in gloss.split():
                            if token.isalpha():
                                self.vocab_counter[token] += 50
            self.dataset_pairs = pairs
            self.dataset_replies = replies
            logger.info(
                "Dataset gloss dimuat (%d pasangan) dari %s.",
                len(self.dataset_pairs),
                self.dataset_path,
            )
        except Exception as exc:
            logger.warning("Gagal memuat dataset JSONL (%s): %s", self.dataset_path, exc)

    def _init_gemini_clients(self) -> list[tuple[str, Any]]:
        if self._gemini_initialized:
            return self._gemini_clients
        self._gemini_initialized = True

        api_key = (settings.GEMINI_API_KEY or "").strip()
        if not api_key:
            logger.info("GEMINI_API_KEY kosong; /api/refine-text menggunakan fallback lokal.")
            return self._gemini_clients

        try:
            from google import genai
            from google.genai import types

            # Minimum deadline resmi Gemini API adalah 10s (10000ms), v1beta mendukung system_instruction.
            modes = [
                (
                    "developer_api",
                    False,
                    types.HttpOptions(api_version="v1beta", timeout=10000),
                ),
                (
                    "vertexai_express",
                    True,
                    types.HttpOptions(timeout=10000),
                ),
            ]

            for label, use_vertex, http_opts in modes:
                try:
                    if use_vertex:
                        client = genai.Client(
                            vertexai=True,
                            api_key=api_key,
                            http_options=http_opts,
                        )
                    else:
                        client = genai.Client(
                            api_key=api_key,
                            http_options=http_opts,
                        )
                    self._gemini_clients.append((label, client))
                except Exception as exc:
                    logger.warning("Gagal inisialisasi Gemini client (%s): %s", label, exc)
        except ImportError:
            logger.warning(
                "Library 'google-genai' belum terinstal. Fallback ke NLP lokal."
            )
        return self._gemini_clients

    def deduplicate_stream(self, raw_letters: list[str] | str, max_repeat: int = 2) -> str:
        """
        Bersihkan pengulangan huruf ekstrem (misal SAAAAYAAAA -> SAYA).
        Cek dulu versi 1 huruf unik berurutan di kamus; hanya izinkan huruf ganda
        (seperti MAAF, SAAT, TUNGGU) jika memang valid di kamus.
        """
        if not raw_letters:
            return ""
        if isinstance(raw_letters, str):
            joined = "".join(ch for ch in raw_letters.strip().upper() if ch.isalpha())
        else:
            joined = "".join(
                ch.strip().upper() for ch in raw_letters if ch and ch.strip()
            )
        if not joined:
            return ""

        collapsed_1 = _collapse_repeats(joined, max_repeat=1)
        collapsed_2 = _collapse_repeats(joined, max_repeat=max_repeat)

        if collapsed_1 in self.vocab_counter or collapsed_1 in self.abbr_map:
            return collapsed_1
        if collapsed_2 in self.vocab_counter or collapsed_2 in self.abbr_map:
            return collapsed_2
        return collapsed_1

    def correct_word(self, raw_word: str, prev_word: Optional[str] = None) -> str:
        """
        Koreksi kata lokal yang ketat:
        - Jika sudah ada persis di abbr_map atau vocab_counter -> langsung kembalikan.
        - Fuzzy matching memakai rapidfuzz WRatio dengan score_cutoff=80 agar tidak ngawur.
        """
        word = self.deduplicate_stream(raw_word)
        if not word:
            return ""
        if word in self.abbr_map:
            return self.abbr_map[word]
        if word in self.vocab_counter:
            return word

        prev_upper = prev_word.strip().upper() if prev_word else None

        try:
            from rapidfuzz import fuzz, process

            cands = process.extract(
                word,
                self.vocab_list,
                scorer=fuzz.WRatio,
                limit=10,
                score_cutoff=80,
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
        raw_word = self.deduplicate_stream(letters)
        corrected_word = self.correct_word(raw_word, prev_word=prev_word)
        return {
            "raw_word": raw_word,
            "corrected_word": corrected_word,
        }

    def _call_gemini_refine(self, raw_input_text: str) -> Optional[str]:
        clients = self._init_gemini_clients()
        if not clients:
            print("[NLP] Gemini FAILED (GEMINI_API_KEY kosong / SDK tidak tersedia), using local fallback")
            return None

        from google.genai import types

        model_name = settings.GEMINI_MODEL or "gemini-2.5-flash"
        last_error: str = "unknown error"

        for idx, (label, client) in enumerate(clients):
            try:
                config = types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=0.2,
                    max_output_tokens=256,
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                )
                response = client.models.generate_content(
                    model=model_name,
                    contents=raw_input_text,
                    config=config,
                )
                text = (response.text or "").strip()
                text = re.sub(r'^["\'“”]+|["\'“”]+$', "", text).strip()
                text = " ".join(text.splitlines()).strip()
                if text:
                    if idx > 0:
                        self._gemini_clients[0], self._gemini_clients[idx] = (
                            self._gemini_clients[idx],
                            self._gemini_clients[0],
                        )
                    msg = f"[NLP] Gemini OK: '{raw_input_text}' -> '{text}'"
                    logger.info(msg)
                    print(msg)
                    return text
                last_error = f"{label}: empty response"
            except Exception as exc:
                last_error = f"{label}: {exc}"
                logger.warning("Gemini refine gagal pada mode %s (%s).", label, exc)

        fail_msg = f"[NLP] Gemini FAILED ({last_error}), using local fallback"
        logger.warning(fail_msg)
        print(fail_msg)
        return None

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

    def refine_text(self, raw_text: str) -> dict[str, Any]:
        """Wrapper string langsung untuk refine_gloss_to_natural."""
        tokens = [t for t in re.split(r"\s+", (raw_text or "").strip()) if t]
        return self.refine_gloss_to_natural(tokens)

    def refine_gloss_to_natural(self, gloss_words: list[str]) -> dict[str, Any]:
        # 1. Pembersihan sangat ringan untuk Gemini (JANGAN rapidfuzz dulu agar string tanpa spasi tidak rusak)
        raw_joined = " ".join(
            t.strip() for t in gloss_words if t and t.strip()
        ).strip()
        if not raw_joined:
            return {"sentence": "", "source": "rule", "raw_gloss": []}

        # Hanya ringkas pengulangan ekstrem >= 3 huruf berurutan (misal SAAAA -> SA), pertahankan huruf ganda normal
        light_cleaned = re.sub(r"([A-Za-z])\1{2,}", r"\1", raw_joined.upper())
        light_cleaned = re.sub(r"\s+", " ", light_cleaned).strip()
        raw_tokens = light_cleaned.split()

        # 2. Prioritas utama: Gemini 2.5 Flash (thinking_budget=0, max_output_tokens=256)
        gemini_sentence = self._call_gemini_refine(light_cleaned)
        if gemini_sentence:
            return {
                "sentence": gemini_sentence,
                "source": "llm",
                "raw_gloss": raw_tokens,
            }

        # 3. Auto-Fallback Offline: Deduplikasi sadar kamus + Koreksi kata lokal + Dataset JSONL + Rule-based
        corrected_tokens: list[str] = []
        prev_word: Optional[str] = None
        for tok in raw_tokens:
            fixed = self.correct_word(tok, prev_word=prev_word)
            for part in fixed.split():
                corrected_tokens.append(part)
                prev_word = part

        query_gloss = " ".join(corrected_tokens)
        matched = self._match_dataset(query_gloss)
        if matched:
            return {
                "sentence": matched,
                "source": "dataset",
                "raw_gloss": corrected_tokens,
            }

        words = [WORD_DISPLAY_MAP.get(token, token.lower()) for token in corrected_tokens]
        joined = " ".join(words).strip().rstrip(".!?")
        is_question = any(w in QUESTION_WORDS for w in words)
        sentence = joined[0].upper() + joined[1:] + ("?" if is_question else ".")

        return {
            "sentence": sentence,
            "source": "rule",
            "raw_gloss": corrected_tokens,
        }

    def _match_offline_reply(self, natural_text: str) -> str:
        """Fallback offline: cari balasan terdekat dari kolom 'reply' dataset JSONL."""
        clean = (natural_text or "").strip()
        if not clean or not self.dataset_replies:
            return DEFAULT_AI_REPLY
        try:
            from rapidfuzz import fuzz

            query_lower = clean.lower()
            query_upper = clean.upper()
            best_score = 0.0
            best_reply: Optional[str] = None
            for ref_gloss, ref_natural, ref_reply in self.dataset_replies:
                score_nat = float(fuzz.token_set_ratio(query_lower, ref_natural.lower()))
                score_gloss = float(fuzz.token_set_ratio(query_upper, ref_gloss))
                score = max(score_nat, score_gloss)
                if score > best_score:
                    best_score = score
                    best_reply = ref_reply

            if best_score >= 60.0 and best_reply:
                return best_reply
        except Exception:
            pass
        return DEFAULT_AI_REPLY

    def generate_ai_reply(self, natural_text: str) -> str:
        """
        Hasilkan balasan obrolan dua arah ramah (1-2 kalimat) memakai gemini-2.5-flash.
        Fallback offline ke dataset JSONL atau balasan sopan default jika API error/offline.
        """
        clean_input = (natural_text or "").strip()
        if not clean_input:
            return DEFAULT_AI_REPLY

        t0 = time.perf_counter()
        clients = self._init_gemini_clients()
        if not clients:
            reply = self._match_offline_reply(clean_input)
            print(f"[CHAT AI] Offline fallback ({(time.perf_counter() - t0) * 1000:.0f}ms): '{reply}'")
            return reply

        from google.genai import types

        model_name = settings.GEMINI_MODEL or "gemini-2.5-flash"
        last_error: str = "unknown error"

        for idx, (label, client) in enumerate(clients):
            try:
                config = types.GenerateContentConfig(
                    system_instruction=CHAT_AI_SYSTEM_PROMPT,
                    temperature=0.5,
                    max_output_tokens=150,
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                )
                response = client.models.generate_content(
                    model=model_name,
                    contents=clean_input,
                    config=config,
                )
                text = (response.text or "").strip()
                text = re.sub(r'^["\'“”]+|["\'“”]+$', "", text).strip()
                text = " ".join(text.splitlines()).strip()
                if text:
                    if idx > 0:
                        self._gemini_clients[0], self._gemini_clients[idx] = (
                            self._gemini_clients[idx],
                            self._gemini_clients[0],
                        )
                    elapsed_ms = (time.perf_counter() - t0) * 1000.0
                    msg = f"[CHAT AI] Gemini OK ({elapsed_ms:.0f}ms): '{clean_input}' -> '{text}'"
                    logger.info(msg)
                    print(msg)
                    return text
                last_error = f"{label}: empty response"
            except Exception as exc:
                last_error = f"{label}: {exc}"
                logger.warning("Gemini chat reply gagal pada mode %s (%s).", label, exc)

        reply = self._match_offline_reply(clean_input)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        fail_msg = f"[CHAT AI] Gemini FAILED ({last_error}, {elapsed_ms:.0f}ms), fallback -> '{reply}'"
        logger.warning(fail_msg)
        print(fail_msg)
        return reply


nlp_processor = BISINDONLPProcessor()


def generate_ai_reply(natural_text: str) -> str:
    return nlp_processor.generate_ai_reply(natural_text)
