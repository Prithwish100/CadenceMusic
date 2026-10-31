import os
import struct
import zlib
import math

def write_png(filename, width, height, pixels):
    """
    pixels: list of (r, g, b, a) tuples of length width * height
    """
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0) # Filter type 0 (None)
        row_offset = y * width
        for x in range(width):
            r, g, b, a = pixels[row_offset + x]
            raw_data.extend((r, g, b, a))

    compressed = zlib.compress(bytes(raw_data), 9)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data)) +
            tag +
            data +
            struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0) # 8-bit RGBA
    png = (
        b"\x89PNG\r\n\x1a\n" +
        chunk(b"IHDR", ihdr) +
        chunk(b"IDAT", compressed) +
        chunk(b"IEND", b"")
    )

    with open(filename, "wb") as f:
        f.write(png)

def render_cadence_icon(size, is_maskable=False):
    pixels = []
    center = size / 2.0
    scale = (size / 512.0) * (0.8 if is_maskable else 1.0)
    
    # Sunset Orange colors:
    # Outer: #0A0A0C
    # Accent: #E25822 (226, 88, 34)
    # Bright: #F06A35 (240, 106, 53)
    # Deep: #121216 (18, 18, 22)

    for y in range(size):
        for x in range(size):
            dx = x - center
            dy = y - center
            dist = math.sqrt(dx * dx + dy * dy)
            norm_dist = dist / scale

            # Background base: Onyx Black
            r, g, b, a = 10, 10, 12, 255

            if norm_dist <= 240:
                # Inside vinyl area
                if norm_dist <= 190:
                    r, g, b = 18, 18, 22 # Vinyl grooves base
                    
                    # Grooves ring styling
                    if 150 <= norm_dist <= 154 or 120 <= norm_dist <= 123 or 95 <= norm_dist <= 98:
                        r, g, b = 28, 28, 36

                # Core disc (Sunset orange glow)
                if norm_dist <= 82:
                    t = norm_dist / 82.0
                    # Radial gradient from bright sunset orange to deep orange
                    r = int(240 * (1 - t) + 210 * t)
                    g = int(106 * (1 - t) + 55 * t)
                    b = int(53 * (1 - t) + 22 * t)

                # Spindle center
                if norm_dist <= 26:
                    r, g, b = 10, 10, 12 # Spindle hole

                if norm_dist <= 8:
                    r, g, b = 245, 245, 247 # Center pin

                # Ambient glow around center core
                elif 82 < norm_dist <= 110:
                    glow_factor = (110 - norm_dist) / 28.0
                    r = int(18 + glow_factor * (226 - 18) * 0.4)
                    g = int(18 + glow_factor * (88 - 18) * 0.4)
                    b = int(22 + glow_factor * (34 - 22) * 0.4)

            # Maskable icons need full-bleed background, standard icons can have slight corner rounding
            pixels.append((r, g, b, a))

    return pixels

os.makedirs("public", exist_ok=True)

# 192x192
p192 = render_cadence_icon(192)
write_png("public/pwa-192x192.png", 192, 192, p192)

# 512x512
p512 = render_cadence_icon(512)
write_png("public/pwa-512x512.png", 512, 512, p512)

# 512x512 maskable (with safe zone margin)
p512_maskable = render_cadence_icon(512, is_maskable=True)
write_png("public/pwa-maskable-512x512.png", 512, 512, p512_maskable)

# apple-touch-icon 180x180
p180 = render_cadence_icon(180)
write_png("public/apple-touch-icon.png", 180, 180, p180)

# favicon 64x64
p64 = render_cadence_icon(64)
write_png("public/favicon-64x64.png", 64, 64, p64)

print("PWA PNG icon generation complete!")
