"""The coach's language model, 100 % Python, running on your computer. No API key, no other application.

Two engines, chosen automatically:
- MLX (`mlx-lm`, by Apple) on Macs with an Apple chip (M1, M2…): fast and light thanks to 4-bit models;
- Hugging Face `transformers` + PyTorch elsewhere (Windows, Linux, Intel Macs), on GPU if present.
Both install with pip only; the model is downloaded once from Hugging Face, then works offline.
"""
from __future__ import annotations

import platform
import threading
import time
from collections.abc import Callable, Iterator

from .textproc import extract_json, partial_field

TIERS = {
    "leger": {"label": "Léger", "hint": "Conseillé avec 8 Go de mémoire (Mac M1). ~1 Go.",
              "mlx": "mlx-community/Qwen2.5-1.5B-Instruct-4bit", "hf": "Qwen/Qwen2.5-1.5B-Instruct"},
    "equilibre": {"label": "Équilibré", "hint": "Meilleures corrections. ~2 Go avec MLX, 16 Go conseillés sinon.",
                  "mlx": "mlx-community/Qwen2.5-3B-Instruct-4bit", "hf": "Qwen/Qwen2.5-3B-Instruct"},
    "precis": {"label": "Précis", "hint": "Ordinateur puissant uniquement. ~4,5 Go avec MLX.",
               "mlx": "mlx-community/Qwen2.5-7B-Instruct-4bit", "hf": "Qwen/Qwen2.5-7B-Instruct"},
}


def apple_silicon() -> bool:
    return platform.system() == "Darwin" and platform.machine() == "arm64"


class Engine:
    """Loaded model + streaming generation. One generation at a time (a lock serialises calls)."""

    def __init__(self, tier: str = "leger"):
        self.tier = tier if tier in TIERS else "leger"
        self.kind = "mlx" if apple_silicon() else "transformers"
        self.model_id = TIERS[self.tier]["mlx" if self.kind == "mlx" else "hf"]
        self._lock = threading.Lock()
        self.chars_per_sec: float | None = None
        if self.kind == "mlx":
            from mlx_lm import load

            self.model, self.tokenizer = load(self.model_id)
        else:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer

            self.device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_id)
            dtype = torch.float32 if self.device == "cpu" else torch.float16
            self.model = AutoModelForCausalLM.from_pretrained(self.model_id, torch_dtype=dtype).to(self.device)

    def _prompt(self, messages: list[dict]) -> str:
        return self.tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)

    def stream(self, messages: list[dict], max_tokens: int = 350, temperature: float = 0.5) -> Iterator[str]:
        """Yields the answer piece by piece."""
        prompt = self._prompt(messages)
        if self.kind == "mlx":
            from mlx_lm import stream_generate

            try:
                from mlx_lm.sample_utils import make_sampler

                gen = stream_generate(self.model, self.tokenizer, prompt, max_tokens=max_tokens,
                                      sampler=make_sampler(temp=temperature, top_p=0.9))
            except (ImportError, TypeError):  # older mlx-lm
                gen = stream_generate(self.model, self.tokenizer, prompt, max_tokens=max_tokens, temp=temperature)
            for r in gen:
                yield r if isinstance(r, str) else r.text
            return
        from transformers import TextIteratorStreamer

        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)
        streamer = TextIteratorStreamer(self.tokenizer, skip_prompt=True, skip_special_tokens=True)
        kw = dict(**inputs, streamer=streamer, max_new_tokens=max_tokens, do_sample=temperature > 0,
                  temperature=max(temperature, 0.01), top_p=0.9)
        t = threading.Thread(target=self.model.generate, kwargs=kw, daemon=True)
        t.start()
        yield from streamer
        t.join()

    def json(self, messages: list[dict], *, max_tokens: int = 350, temperature: float = 0.5,
             stream_field: str | None = None, on_partial: Callable[[str, bool], None] | None = None) -> dict:
        """Asks for a JSON answer. With stream_field, on_partial(text, done) follows that field while it is written."""
        with self._lock:
            for attempt in range(2):
                text, sent, t0 = "", "", time.time()
                for piece in self.stream(messages, max_tokens, temperature if attempt == 0 else 0.2):
                    text += piece
                    if stream_field and on_partial:
                        value, done = partial_field(text, stream_field)
                        if value != sent or done:
                            on_partial(value, done)
                            sent = value
                            if done:
                                on_partial = None
                if len(text) > 40:
                    cps = len(text) / max(0.1, time.time() - t0)
                    self.chars_per_sec = cps if self.chars_per_sec is None else 0.6 * self.chars_per_sec + 0.4 * cps
                try:
                    out = extract_json(text)
                    if isinstance(out, dict):
                        return out
                except ValueError:
                    pass
                # a small model sometimes breaks the format: one retry, colder
                messages = messages + [{"role": "assistant", "content": text},
                                       {"role": "user", "content": "Reply again with ONLY the valid JSON object, nothing else."}]
            raise ValueError("Le coach a donné une réponse illisible. Réessaie.")

    @property
    def slow(self) -> bool:
        """Under ~10 words per second: a lighter model would clearly help."""
        return self.chars_per_sec is not None and self.chars_per_sec < 55
