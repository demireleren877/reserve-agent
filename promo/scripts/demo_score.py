#!/usr/bin/env python3
"""Agent demo (Fire Home Q3 kapanışı) için ses — tamamen sentez (numpy).

Sakin, arkada kalan bir ambiyans + arayüz sesleri (tuş, tık, adım onayı, bildirim).
Olay zamanları src/demo/Demo.tsx ile aynıdır; orada bir zaman değişirse burada da
güncellenmelidir.

Kullanım:  python3 scripts/demo_score.py  →  public/demo-score.wav
"""
from __future__ import annotations

import os

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
DUR = 90.0
N = int(DUR * SR)
rng = np.random.default_rng(11)

# ─── Demo.tsx ile aynı zamanlar ──────────────────────────────────────────────
PROMPT_LEN = 97
TYPE_START = 0.9
TYPE_CPS = 30
SEND = TYPE_START + PROMPT_LEN / TYPE_CPS + 0.4
YES = 26.4
REPLY = 40.0
STEPS_DONE = [
    SEND + 1.3 + 0.6, SEND + 2.0 + 1.2, 15.4 + 0.7, 16.2 + 0.8, YES + 0.9 + 0.9,
    32.4 + 0.5, 33.0 + 0.5, 33.6 + 0.9, 45.6 + 0.6, 51.6 + 0.5, 52.2 + 0.8,
    61.6 + 1.1, 76.4 + 0.7,
]


def t(n: int) -> np.ndarray:
    return np.arange(n) / SR


def hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def place(buf: np.ndarray, x: np.ndarray, at: float, gain: float = 1.0) -> None:
    i = int(at * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(x))
    buf[i:j] += x[: j - i] * gain


def lowpass(x: np.ndarray, fc: float, order: int = 2) -> np.ndarray:
    b, a = signal.butter(order, fc / (SR / 2), "low")
    return signal.lfilter(b, a, x)


# ─── Pad: yumuşak, geniş akorlar ─────────────────────────────────────────────
def pad_voice(freq: float, dur: float) -> np.ndarray:
    n = int(dur * SR)
    tt = t(n)
    v = np.zeros(n)
    for det in (-0.07, 0.0, 0.06):
        f = freq * 2 ** (det / 12)
        ph = rng.uniform(0, 2 * np.pi)
        # yumuşak testere: ilk birkaç harmonik
        for k in range(1, 7):
            v += np.sin(2 * np.pi * f * k * tt + ph * k) / (k ** 1.6)
    v = lowpass(v, 1400)
    att = np.clip(tt / 2.2, 0, 1)
    rel = np.clip((dur - tt) / 2.6, 0, 1)
    return v * att * rel


CHORDS = [  # (süre sn, MIDI notaları) — D major, sakin bir döngü
    (8, [50, 57, 62, 64, 66, 69]),  # Dmaj9
    (8, [47, 54, 59, 62, 66, 69]),  # Bm11
    (8, [43, 50, 55, 59, 62, 66]),  # Gmaj7
    (8, [45, 52, 57, 59, 61, 64]),  # A6sus
]

music_l = np.zeros(N)
music_r = np.zeros(N)
pos = 0.0
ci = 0
while pos < DUR:
    dur, notes = CHORDS[ci % len(CHORDS)]
    seg = dur + 2.6  # ardışık akorlar üst üste biner
    for j, m in enumerate(notes):
        v = pad_voice(hz(m), seg)
        g = 0.05 if j else 0.07
        pan = 0.5 + 0.35 * np.sin(j * 1.7)
        place(music_l, v, pos, g * (1 - pan) * 1.4)
        place(music_r, v, pos, g * pan * 1.4)
    pos += dur
    ci += 1

# Arpej: sekizlikler, çok hafif (84 BPM)
BPM = 84
eighth = 60 / BPM / 2
arp_patterns = [[74, 76, 78, 81], [71, 74, 76, 78], [67, 71, 74, 78], [69, 71, 73, 76]]
k = 0
tm = 6.0
while tm < 84:
    chord = int(tm // 8) % 4
    m = arp_patterns[chord][k % 4] + (12 if (k // 8) % 2 else 0)
    n = int(1.2 * SR)
    tt = t(n)
    f = hz(m)
    pl = (np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * 2 * f * tt)) * np.exp(-tt * 5.5)
    pl *= np.clip(tt / 0.004, 0, 1)
    g = 0.022 * (0.7 + 0.3 * rng.random())
    pan = 0.5 + 0.3 * np.sin(k * 0.9)
    place(music_l, pl, tm, g * (1 - pan) * 1.6)
    place(music_r, pl, tm, g * pan * 1.6)
    tm += eighth
    k += 1

# Sub bas: akor kökleri
pos = 0.0
ci = 0
while pos < DUR:
    dur, notes = CHORDS[ci % len(CHORDS)]
    n = int((dur + 1) * SR)
    tt = t(n)
    b = np.sin(2 * np.pi * hz(notes[0] - 12) * tt) * np.clip(tt / 1.5, 0, 1) * np.clip((dur + 1 - tt) / 1.5, 0, 1)
    place(music_l, b, pos, 0.05)
    place(music_r, b, pos, 0.05)
    pos += dur
    ci += 1

# Yankı (basit çok-tap gecikme)
def reverb(x: np.ndarray) -> np.ndarray:
    y = x.copy()
    for d, g in ((0.113, 0.32), (0.191, 0.26), (0.297, 0.2), (0.433, 0.14), (0.61, 0.09)):
        i = int(d * SR)
        y[i:] += x[:-i] * g
    return lowpass(y, 6000)


music_l = reverb(music_l)
music_r = reverb(music_r)

# Genel zarf: giriş/çıkış + konuşma alanında hafif kısma yok (seslendirme yok)
env = np.ones(N)
tt = t(N)
env *= np.clip(tt / 3.0, 0, 1)
env *= np.clip((DUR - 0.5 - tt) / 5.5, 0, 1)
music_l *= env
music_r *= env

# ─── Arayüz sesleri ──────────────────────────────────────────────────────────
ui = np.zeros(N)


def key_click() -> np.ndarray:
    n = int(0.03 * SR)
    noise = rng.standard_normal(n) * np.exp(-t(n) * 260)
    b, a = signal.butter(2, [1800 / (SR / 2), 7000 / (SR / 2)], "band")
    return signal.lfilter(b, a, noise)


def mouse_click() -> np.ndarray:
    n = int(0.05 * SR)
    tt = t(n)
    c = np.sin(2 * np.pi * 2300 * tt) * np.exp(-tt * 180) + 0.6 * np.sin(2 * np.pi * 900 * tt) * np.exp(-tt * 120)
    return c


def tick() -> np.ndarray:
    n = int(0.25 * SR)
    tt = t(n)
    return (np.sin(2 * np.pi * hz(88) * tt) + 0.3 * np.sin(2 * np.pi * hz(95) * tt)) * np.exp(-tt * 22)


def chime() -> np.ndarray:
    n = int(1.6 * SR)
    tt = t(n)
    a = np.sin(2 * np.pi * hz(81) * tt) * np.exp(-tt * 3.2)
    b = np.zeros(n)
    i = int(0.12 * SR)
    b[i:] = np.sin(2 * np.pi * hz(88) * tt[: n - i]) * np.exp(-tt[: n - i] * 3.0)
    return (a + b) * np.clip(tt / 0.003, 0, 1)


# Tuşlar (yazma süresince, hafif rastgele aralıklarla)
for i in range(PROMPT_LEN):
    at = TYPE_START + i / TYPE_CPS + rng.normal(0, 0.006)
    place(ui, key_click(), at, 0.05 * (0.6 + 0.4 * rng.random()))
place(ui, mouse_click(), SEND, 0.16)
place(ui, mouse_click(), YES, 0.16)
for s in STEPS_DONE:
    place(ui, tick(), s, 0.045)
place(ui, chime(), REPLY + 0.05, 0.12)

# ─── Karışım ─────────────────────────────────────────────────────────────────
L = music_l + ui
R = music_r + ui
mix = np.stack([L, R], axis=1)
peak = np.max(np.abs(mix))
mix = mix / peak * 0.55  # bol headroom: demo müziği geride kalmalı
out = os.path.join(os.path.dirname(__file__), "..", "public", "demo-score.wav")
wavfile.write(out, SR, (mix * 32767).astype(np.int16))
print(f"wrote {out} · {DUR:.0f}s · peak {peak:.2f} → 0.55")
