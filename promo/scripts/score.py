#!/usr/bin/env python3
"""Actuarius filmi için özgün müzik ve ses tasarımı — tamamen sentez (numpy).

Görüntüyle aynı 100 BPM vuruş ızgarasını kullanır (src/film/theme.ts):
1 vuruş = 0,6 sn = 18 kare @30fps. Sahne başlangıçları ve sahne-içi olaylar
aşağıdaki CUES tablosunda vuruş cinsinden tutulur.

Kullanım:  python3 scripts/score.py  →  public/score.wav
Gereksinim: numpy, scipy
"""
from __future__ import annotations

import os
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
BPM = 100
BEAT = 60 / BPM  # 0.6 sn
TOTAL_BEATS = 118  # theme.ts: SCENE_BEATS toplamı
DUR = TOTAL_BEATS * BEAT + 0.2
N = int(DUR * SR)
rng = np.random.default_rng(7)

# Sahne başlangıçları (vuruş) — theme.ts ile aynı sıra
SCENE = dict(origin=0, chain=24, curve=34, agent=44, product=64, numbers=80, audit=90, finale=100)
F = lambda frames: frames / 18.0  # kare → vuruş


def t2i(beats: float) -> int:
    return int(round(beats * BEAT * SR))


def tone_time(n: int) -> np.ndarray:
    return np.arange(n) / SR


# ─── Temel yapı taşları ─────────────────────────────────────────────
def midi(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def saw(freq: float, n: int, phase: float = 0.0) -> np.ndarray:
    """PolyBLEP testere — ucuz ve yeterince temiz (çıktı zaten alçak geçirenden geçer)."""
    dt = freq / SR
    ph = (phase / (2 * np.pi) + dt * np.arange(n)) % 1.0
    y = 2 * ph - 1
    m1 = ph < dt
    t1 = ph[m1] / dt
    y[m1] -= t1 + t1 - t1 * t1 - 1
    m2 = ph > 1 - dt
    t2 = (ph[m2] - 1) / dt
    y[m2] -= t2 * t2 + t2 + t2 + 1
    return y


def env_adsr(n: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    s_n = max(0, n - a_n - d_n - r_n)
    e = np.concatenate([
        np.linspace(0, 1, max(a_n, 1), endpoint=False),
        np.linspace(1, s, max(d_n, 1), endpoint=False),
        np.full(s_n, s),
        np.linspace(s, 0, max(r_n, 1)),
    ])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def lp(x: np.ndarray, fc: float, order: int = 2) -> np.ndarray:
    b, a = signal.butter(order, min(fc, SR / 2 - 100) / (SR / 2), "low")
    return signal.lfilter(b, a, x)


def hp(x: np.ndarray, fc: float, order: int = 2) -> np.ndarray:
    b, a = signal.butter(order, fc / (SR / 2), "high")
    return signal.lfilter(b, a, x)


def bp(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    b, a = signal.butter(order, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], "band")
    return signal.lfilter(b, a, x)


def sweep_filter(x: np.ndarray, f0: float, f1: float, kind: str = "low", block: int = 512, q_order: int = 2) -> np.ndarray:
    """Zamanla değişen filtre (üstel kesim süpürmesi), blok blok durum taşıyarak."""
    out = np.zeros_like(x)
    zi = None
    nb = int(np.ceil(len(x) / block))
    for i in range(nb):
        t = i / max(nb - 1, 1)
        fc = f0 * (f1 / f0) ** t
        if kind == "band":
            lo, hi = fc / 1.4, fc * 1.4
            b, a = signal.butter(q_order, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], "band")
        else:
            b, a = signal.butter(q_order, min(fc, SR / 2 - 100) / (SR / 2), kind)
        if zi is None or len(zi) != max(len(a), len(b)) - 1:
            zi = signal.lfilter_zi(b, a) * 0
        seg = x[i * block:(i + 1) * block]
        y, zi = signal.lfilter(b, a, seg, zi=zi)
        out[i * block:(i + 1) * block] = y
    return out


class Bus:
    def __init__(self):
        self.L = np.zeros(N)
        self.R = np.zeros(N)

    def add(self, at_beats: float, x: np.ndarray, gain: float = 1.0, pan: float = 0.0, stereo: np.ndarray | None = None):
        i = t2i(at_beats)
        if i >= N:
            return
        if stereo is not None:
            l, r = stereo
        else:
            l = x * np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
            r = x * np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
        n = min(len(l), N - i)
        if i < 0:
            return
        self.L[i:i + n] += l[:n] * gain
        self.R[i:i + n] += r[:n] * gain


dry = Bus()
wet = Bus()  # reverb gönderimi


# ─── Armoni ─────────────────────────────────────────────────────────
# D minör merkezli; yükselişte Bb–F–C, finalde F add9 ile aydınlık kapanış.
CH = {
    "Dm9": [38, 50, 57, 60, 64, 65],
    "Bbmaj7": [34, 46, 53, 57, 60, 62],
    "Fadd9": [41, 53, 57, 60, 67, 69],
    "C6": [36, 48, 55, 60, 64, 69],
    "Gm9": [43, 55, 58, 62, 65, 69],
    "A7sus": [45, 57, 62, 64, 67, 69],
    "Dm": [38, 50, 57, 62, 65, 69],
}
# (başlangıç vuruşu, süre, akor)
PROG = [
    (0, 10, "Dm9"), (10, 8, "Bbmaj7"), (18, 6, "Fadd9"),
    (24, 5, "Dm9"), (29, 5, "Bbmaj7"),
    (34, 5, "Fadd9"), (39, 5, "C6"),
]
for b in range(44, 64, 16):
    PROG += [(b, 4, "Dm"), (b + 4, 4, "Bbmaj7"), (b + 8, 4, "Fadd9"), (b + 12, 4, "C6")]
PROG += [(64, 4, "Bbmaj7"), (68, 4, "Fadd9"), (72, 4, "C6"), (76, 4, "Dm9")]
PROG += [(80, 5, "Gm9"), (85, 5, "A7sus")]
PROG += [(90, 3, "Dm"), (93, 3, "Bbmaj7"), (96, 4, "C6")]
PROG += [(100, 3, "Dm9"), (103, 15, "Fadd9")]


def chord_at(beat: float) -> list[int]:
    cur = PROG[0][2]
    for s, d, c in PROG:
        if s <= beat:
            cur = c
    return CH[cur]


# ─── Pad ────────────────────────────────────────────────────────────
def pad(start: float, dur: float, notes: list[int], cutoff: tuple[float, float], gain: float):
    n = int(dur * BEAT * SR) + int(1.5 * SR)
    L = np.zeros(n)
    R = np.zeros(n)
    for m in notes:
        for d, pan in ((-0.09, -0.7), (0.0, 0.0), (0.08, 0.7)):
            fr = midi(m + d)
            v = saw(fr, n, rng.random() * 6.28)
            L += v * (1 - pan) * 0.5
            R += v * (1 + pan) * 0.5
    e = env_adsr(n, 0.9, 0.5, 0.85, 1.4)
    L = sweep_filter(L * e, cutoff[0], cutoff[1], "low")
    R = sweep_filter(R * e, cutoff[0], cutoff[1], "low")
    s = gain / (len(notes) * 3)
    dry.add(start, None, stereo=(L * s * 0.6, R * s * 0.6))
    wet.add(start, None, stereo=(L * s, R * s))


for s, d, c in PROG:
    if s < 10:
        cut = (300, 1400)
        g = 0.55
    elif s < 44:
        cut = (900, 2200)
        g = 0.5
    elif s < 80:
        cut = (1400, 3000)
        g = 0.42
    elif s < 90:
        cut = (500, 1600)
        g = 0.5
    elif s < 100:
        cut = (1500, 3200)
        g = 0.42
    else:
        cut = (900, 4200) if c == "Fadd9" else (400, 900)
        g = 1.0 if c == "Fadd9" else 0.3
    pad(s, d, CH[c], cut, g)


# ─── Bas ────────────────────────────────────────────────────────────
def bass_note(at: float, m: int, length: float, gain: float, bright: float = 400):
    n = int(length * BEAT * SR)
    fr = midi(m)
    t = tone_time(n)
    x = np.sin(2 * np.pi * fr * t) + 0.35 * saw(fr, n)
    x = lp(x, bright) * env_adsr(n, 0.005, 0.12, 0.6, 0.05)
    dry.add(at, x * gain)


for b8 in np.arange(10, 100, 0.5):
    beat = float(b8)
    if 80 <= beat < 90 and beat % 1:
        continue
    root = chord_at(beat)[0]
    root = root if root < 40 else root - 12
    groove = 44 <= beat < 80 or 90 <= beat < 100
    g = 0.34 if groove else 0.2
    accent = 1.0 if beat % 1 == 0 else 0.7
    bass_note(beat, root + (12 if (groove and beat % 2 == 1.5) else 0), 0.45, g * accent, 520 if groove else 300)


# ─── Davul ──────────────────────────────────────────────────────────
def kick(gain: float = 1.0, depth: float = 1.0) -> np.ndarray:
    n = int(0.5 * SR)
    t = tone_time(n)
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t * (7 / depth))
    click = hp(rng.standard_normal(n), 3000) * np.exp(-t * 300) * 0.25
    return (x + click) * gain


def snare() -> np.ndarray:
    n = int(0.35 * SR)
    t = tone_time(n)
    noise = bp(rng.standard_normal(n), 1200, 9000) * np.exp(-t * 16)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.5
    return (noise * 0.7 + body) * 0.55


def hat(open_: bool = False) -> np.ndarray:
    n = int((0.22 if open_ else 0.06) * SR)
    t = tone_time(n)
    return hp(rng.standard_normal(n), 7500, 4) * np.exp(-t * (18 if open_ else 80)) * 0.25


def in_groove(b: float) -> bool:
    return 44 <= b < 80 or 90 <= b < 100


for q in np.arange(10, 100, 0.25):
    b = float(q)
    if b % 1 == 0:
        if in_groove(b) or (24 <= b < 44 and b % 2 == 0):
            dry.add(b, kick(0.85 if in_groove(b) else 0.5))
        if in_groove(b) and int(b) % 2 == 1:
            s = snare()
            dry.add(b, s, 0.75, 0.05)
            wet.add(b, s, 0.25)
    if in_groove(b) or 64 <= b < 80:
        vel = [0.5, 0.25, 0.8, 0.3][int(round((b % 1) * 4)) % 4]
        dry.add(b, hat(open_=(b % 1 == 0.5 and int(b) % 4 == 3)), vel, 0.35 * (1 if int(b * 4) % 2 else -1))


# ─── Arp (pluck + dotted-eighth delay) ──────────────────────────────
def pluck(m: int, gain: float) -> np.ndarray:
    n = int(0.45 * SR)
    t = tone_time(n)
    fr = midi(m)
    x = saw(fr, n) * 0.6 + np.sin(2 * np.pi * fr * t)
    x = lp(x, 2600) * np.exp(-t * 9)
    return x * gain


arp_start, arp_end = 10, 100
step = 0.5
for k, s in enumerate(np.arange(arp_start, arp_end, 0.25)):
    b = float(s)
    dense = 44 <= b < 80 or 90 <= b < 100
    if not dense and b % step:
        continue
    if 80 <= b < 90 and b % 1:
        continue
    notes = [m + 12 for m in chord_at(b)[2:]]
    m = notes[k % len(notes)] + (12 if (k // len(notes)) % 3 == 2 else 0)
    g = 0.11 if dense else 0.09
    x = pluck(m, g)
    pan = np.sin(k * 0.9) * 0.6
    dry.add(b, x, 1.0, pan)
    # 3/4 vuruşluk gecikme, iki tekrar
    wet.add(b, x, 0.5, -pan)
    dry.add(b + 0.75, x, 0.35, -pan)
    dry.add(b + 1.5, x, 0.15, pan)


# ─── Ses tasarımı: impact, riser, whoosh, tick ──────────────────────
def impact(at: float, gain: float = 1.0, long: float = 2.5):
    n = int(long * SR)
    t = tone_time(n)
    f = 38 + 70 * np.exp(-t * 6)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
    crack = lp(rng.standard_normal(n), 3500) * np.exp(-t * 9) * 0.5
    x = (boom + crack) * gain
    dry.add(at, x, 0.8)
    wet.add(at, x, 0.5)


def riser(end_at: float, beats: float, gain: float = 0.6, f0: float = 300, f1: float = 7000):
    n = int(beats * BEAT * SR)
    t = np.linspace(0, 1, n)
    noise = rng.standard_normal(n)
    x = sweep_filter(noise, f0, f1, "band") * (t ** 2.2)
    tone = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (t * 2)) / SR) * (t ** 3) * 0.25
    x = (x * 1.1 + tone) * gain
    x[-int(0.01 * SR):] *= np.linspace(1, 0, int(0.01 * SR))
    L = x * (1 - 0.3 * np.sin(t * 20))
    R = x * (1 + 0.3 * np.sin(t * 20))
    dry.add(end_at - beats, None, stereo=(L * 0.7, R * 0.7))
    wet.add(end_at - beats, None, stereo=(L * 0.5, R * 0.5))


def whoosh(center: float, length: float = 0.9, gain: float = 0.5, pan_from: float = -0.8, pan_to: float = 0.8):
    n = int(length * SR)
    t = np.linspace(0, 1, n)
    e = np.sin(np.pi * t) ** 2.5
    x = sweep_filter(rng.standard_normal(n), 400, 5000, "band") * e * gain * 0.6
    pan = pan_from + (pan_to - pan_from) * t
    L = x * np.cos((pan + 1) * np.pi / 4) * 1.4
    R = x * np.sin((pan + 1) * np.pi / 4) * 1.4
    start = center - (length / 2) / BEAT
    dry.add(start, None, stereo=(L, R))
    wet.add(start, None, stereo=(L * 0.4, R * 0.4))


def tick(at: float, gain: float = 0.12, freq: float = 3200):
    n = int(0.03 * SR)
    t = tone_time(n)
    x = np.sin(2 * np.pi * freq * t) * np.exp(-t * 260) * gain
    dry.add(at, x, 1.0, float(rng.uniform(-0.5, 0.5)))


def shimmer(at: float, notes: list[int], gain: float = 0.12, spread: float = 0.08):
    for i, m in enumerate(notes):
        n = int(2.2 * SR)
        t = tone_time(n)
        x = np.sin(2 * np.pi * midi(m) * t) * np.exp(-t * 2.2) + 0.3 * np.sin(4 * np.pi * midi(m) * t) * np.exp(-t * 4)
        wet.add(at + i * spread, x * gain, 1.0, (i % 2) * 1.2 - 0.6)
        dry.add(at + i * spread, x * gain * 0.4, 1.0, (i % 2) * 1.2 - 0.6)


# Açılış: karanlıkta alçak drone + parçacık pırıltıları
n0 = int(10 * BEAT * SR)
t0 = tone_time(n0)
drone = (np.sin(2 * np.pi * midi(26) * t0) + 0.5 * np.sin(2 * np.pi * midi(38) * t0 * 1.001)) * np.minimum(1, t0 / 3) * 0.22
dry.add(0, drone)
for i in range(46):
    b = float(rng.uniform(0.5, 9.5))
    tick(b, 0.05 * float(rng.uniform(0.4, 1)), float(rng.uniform(2500, 6500)))

o = SCENE["origin"]
riser(o + 10, 3, 0.55)  # parçacıklar üçgene akar
impact(o + 10, 1.0)  # çubuklar belirir
shimmer(o + 10, [74, 77, 81, 86], 0.08)
whoosh(o + 16, 1.4, 0.35)  # projeksiyon taraması
shimmer(o + 16, [81, 84, 88], 0.07, 0.25)
riser(o + 24, 1.2, 0.5, 600, 9000)  # köşegen boyunca dalış

c = SCENE["chain"]
impact(c, 0.6, 1.4)
for k in range(5):  # enerji darbesi halkalardan geçer
    b = c + F(18) + k * (F(118 - 18) / 5.2)
    tick(b, 0.12, 1800 + k * 300)
    shimmer(b, [69 + [0, 3, 7, 10, 12][k]], 0.05)
impact(c + F(126), 0.55, 1.6)  # CDF
shimmer(c + F(126), [77, 81, 84, 89], 0.08)
whoosh(c + 10, 0.8, 0.45)

cv = SCENE["curve"]
for i in range(8):  # veri noktaları
    tick(cv + F(18 + i * 3), 0.1, 2200 + i * 180)
whoosh(cv + F(54) + 1, 1.8, 0.2, 0.8, -0.8)  # eğriler çizilir
shimmer(cv + F(108), [72, 76, 79, 84], 0.09)
whoosh(cv + 10, 0.8, 0.45)

a = SCENE["agent"]
impact(a, 0.8)
riser(a + 5, 2, 0.4)
for i in range(6):  # staccato fiiller — her vuruşta darbe
    dry.add(a + 5 + i, kick(0.9, 0.7))
    shimmer(a + 5 + i, [74 + [0, 3, 5, 7, 10, 12][i]], 0.06)
impact(a + 11, 0.7)
for i in range(6):  # günlük satırları
    for j in range(5):
        tick(a + F(270 + 10 + i * 9) + j * 0.07, 0.05, 4200)
whoosh(a + 20, 0.9, 0.5)

p = SCENE["product"]
for i in range(4):  # tünelde kelimeler
    whoosh(p + 1 + i, 0.6, 0.35, -0.9 if i % 2 else 0.9, 0.9 if i % 2 else -0.9)
shimmer(p + 6, [69, 72, 76, 81, 84], 0.06)
riser(p + 16, 3, 0.6)

nm = SCENE["numbers"]
impact(nm, 1.0)
for i in range(60):  # sayaç tamburları
    tick(nm + F(6) + i * (F(46) / 60) ** 1.0 * (1 + i / 90), 0.06, 2600 + (i % 7) * 120)
for i in range(3):
    dry.add(nm + 6 + i, kick(0.8, 0.8))
    shimmer(nm + 6 + i, [81, 84, 88][i : i + 1], 0.08)
whoosh(nm + 10, 0.9, 0.45)

au = SCENE["audit"]
for i in range(4):
    dry.add(au + 1 + i, kick(0.7, 0.7))
impact(au + 6, 0.6, 1.8)
riser(SCENE["finale"], 2, 0.45)

fi = SCENE["finale"]
# parçacık akışı: ters reverb benzeri şişme
n = int(3 * BEAT * SR)
t = np.linspace(0, 1, n)
swell = sweep_filter(rng.standard_normal(n), 200, 6000, "band") * t ** 3 * 0.5
dry.add(fi, swell)
wet.add(fi, swell * 0.6)
impact(fi + 3, 1.25, 4.0)  # logo katılaşır
shimmer(fi + 3, [65, 69, 72, 76, 79, 84], 0.1, 0.12)
shimmer(fi + 5, [88, 91, 96], 0.06, 0.2)  # ışık süpürmesi
shimmer(fi + 8, [84, 88], 0.05)


# ─── Reverb (konvolüsyon, sentetik IR) ──────────────────────────────
def reverb(x: np.ndarray, seconds: float = 3.2, seed: int = 0) -> np.ndarray:
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = tone_time(n)
    ir = r.standard_normal(n) * np.exp(-t * (6.9 / seconds))
    ir = lp(ir, 6000)
    ir[: int(0.012 * SR)] = 0  # ön gecikme
    ir /= np.sqrt(np.sum(ir ** 2))
    return signal.fftconvolve(x, ir)[: len(x)]


L = dry.L + reverb(wet.L, seed=1) * 0.9
R = dry.R + reverb(wet.R, seed=2) * 0.9

# Mastering: hafif düşük kesim, yumuşak limitleme, fade
L, R = hp(L, 28), hp(R, 28)
peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
L, R = L / peak * 1.5, R / peak * 1.5
L, R = np.tanh(L), np.tanh(R)
fade_in = np.minimum(1, tone_time(N) / 0.05)
end_i = t2i(TOTAL_BEATS)
fade_out = np.ones(N)
fs = t2i(TOTAL_BEATS - 4)
fade_out[fs:] = np.linspace(1, 0, N - fs) ** 1.5
L, R = L * fade_in * fade_out, R * fade_in * fade_out
peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
L, R = L / peak * 0.89, R / peak * 0.89

out = os.path.join(os.path.dirname(__file__), "..", "public", "score.wav")
wavfile.write(out, SR, (np.stack([L, R], axis=1) * 32767).astype(np.int16))
print(f"yazıldı: {os.path.normpath(out)}  ({DUR:.1f} sn)")
