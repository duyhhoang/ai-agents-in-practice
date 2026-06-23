from PIL import Image
from pathlib import Path

src = Path("public/supply-chain-logo.png")
dst = Path("public/supply-chain-logo-transparent.png")

img = Image.open(src).convert("RGBA")
new_pixels = []

for r, g, b, a in img.getdata():
    # remove near-white pixels
    if r > 235 and g > 235 and b > 235:
        new_pixels.append((255, 255, 255, 0))
    else:
        new_pixels.append((r, g, b, a))

img.putdata(new_pixels)
img.save(dst)

print(f"Saved transparent logo to {dst}")
