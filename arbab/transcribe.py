"""ARBAB voice message -> text (2026-11-26).

iPhone has no Tagalog speech-to-text, so the app records the voice message
and this turns it into text on the laptop with faster-whisper (runs locally,
nothing leaves the laptop). Called by wait-msg.cjs:

    python transcribe.py <audio file> <tl|en>

Prints only the transcript (UTF-8) on stdout. "tl" = Tagalog/Taglish, "en" =
English, from the EN/TL switch in the app. Model "small" (multilingual,
~470 MB, downloaded once to the Hugging Face cache), CPU int8.
"""
import sys


def load_audio(path):
    """16 kHz mono float32, decoded here with PyAV. faster-whisper's own
    decode_audio passes metadata_errors=, which PyAV 19 no longer accepts."""
    import av
    import numpy as np
    chunks = []
    with av.open(path) as c:
        res = av.AudioResampler(format="s16", layout="mono", rate=16000)
        for frame in c.decode(c.streams.audio[0]):
            for out in res.resample(frame):
                chunks.append(out.to_ndarray())
        for out in res.resample(None):
            chunks.append(out.to_ndarray())
    if not chunks:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(chunks, axis=1).flatten().astype(np.float32) / 32768.0


def main():
    if len(sys.argv) < 2:
        print("usage: transcribe.py <audio> [tl|en]", file=sys.stderr)
        return 2
    audio = sys.argv[1]
    lang = (sys.argv[2] if len(sys.argv) > 2 else "tl").lower()
    from faster_whisper import WhisperModel
    model = WhisperModel("small", device="cpu", compute_type="int8")
    # Tagalog: tell Whisper it's Tagalog (auto-detect often calls Taglish
    # "English" and then translates). The prompt nudges it to keep the
    # English words as they are, the way William talks.
    segments, _ = model.transcribe(
        load_audio(audio),
        language="tl" if lang == "tl" else "en",
        beam_size=5,
        vad_filter=True,
        initial_prompt=("Taglish, trading at pera: BTC, gold, XAU, P&L, stop loss, take profit, "
                        "position, account, bot, alert, news.") if lang == "tl" else None,
    )
    text = " ".join(s.text.strip() for s in segments).strip()
    sys.stdout.reconfigure(encoding="utf-8")
    print(text)
    return 0

if __name__ == "__main__":
    sys.exit(main())
