#!/usr/bin/env python3
"""Gera os efeitos sonoros de demonstração (síntese própria, sem direitos autorais).

Uso:  python3 tools/gen_sounds.py
Saída: app/src/main/res/raw/{tap_low,tap_high,tick}.wav  (mono, 16 bit, 22,05 kHz)
"""
import math
import os
import random
import struct
import wave

RATE = 22050
OUT = os.path.join(os.path.dirname(__file__), "..", "app", "src", "main", "res", "raw")


def render(path, dur, f0, f1, tau, noise_amp, noise_len, gain=0.85):
    random.seed(7)
    n = int(RATE * dur)
    phase = 0.0
    frames = bytearray()
    for i in range(n):
        t = i / RATE
        k = min(1.0, t / (dur * 0.6))
        f = f0 + (f1 - f0) * k          # a frequência cai: som de "tum"
        phase += 2 * math.pi * f / RATE
        env = math.exp(-t / tau)
        s = math.sin(phase) * env
        if t < noise_len:                # estalo curto no ataque
            s += (random.random() * 2 - 1) * noise_amp * (1 - t / noise_len)
        fade = min(1.0, (n - i) / (RATE * 0.01))  # fade-out final evita "click"
        v = max(-1.0, min(1.0, s * gain * fade))
        frames += struct.pack("<h", int(v * 32767))
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(frames))


os.makedirs(OUT, exist_ok=True)
render(os.path.join(OUT, "tap_low.wav"), 0.24, 200, 105, 0.055, 0.35, 0.012)
render(os.path.join(OUT, "tap_high.wav"), 0.20, 340, 215, 0.045, 0.30, 0.010)
render(os.path.join(OUT, "tick.wav"), 0.06, 1300, 900, 0.012, 0.25, 0.006, gain=0.6)
print("ok:", sorted(os.listdir(OUT)))
