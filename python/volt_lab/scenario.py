"""Seeded synthetic profiles matching the JavaScript generator."""
import math


def random_source(seed):
    state = seed & 0xFFFFFFFF
    while True:
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        value = ((state ^ (state >> 15)) * (state | 1)) & 0xFFFFFFFF
        value ^= (value + ((value ^ (value >> 7)) * (value | 61))) & 0xFFFFFFFF
        yield ((value ^ (value >> 14)) & 0xFFFFFFFF) / 4294967296


def generate_scenario(seed, profile="balanced", outage_hours=3):
    rng = random_source(seed)
    outage_day = math.floor(next(rng) * 7)
    rows = []
    for day in range(7):
        sunlight = 0.2 + next(rng) * 0.2 if profile == "cloudy" else 0.45 + next(rng) * 0.55
        trip = 10 + next(rng) * 7
        for quarter in range(96):
            time = quarter / 4
            hour, minute = quarter // 4, quarter % 4 * 15
            outage = (day in (2, 5) and 17 <= time < 17 + outage_hours) if profile == "outage" else (day == outage_day and 18 <= time < 19)
            home = 0.65 + next(rng) * 0.6 + (1.6 if 17 <= hour < 22 else 0) + (0.65 if 7 <= hour < 9 else 0)
            solar = max(0, math.sin((time - 6) / 12 * math.pi)) * 5 * sunlight * (0.85 + next(rng) * 0.15)
            rows.append(dict(day=day, hour=hour, minute=minute, time=time, trip=trip,
                             gridAvailable=not outage, price=0.09 if hour < 7 else 0.36 if 17 <= hour < 22 else 0.18,
                             home=home, solar=solar, carbon=0.65 if 17 <= hour < 22 else 0.3 if 10 <= hour < 16 else 0.45))
    return rows
