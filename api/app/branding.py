from pathlib import Path

from reportlab.lib import colors

BRAND_TAN = colors.HexColor("#A9A28C")
BRAND_CREAM = colors.HexColor("#F2EFE6")
BRAND_BROWN = colors.HexColor("#7B4B34")
BRAND_OLIVE = colors.HexColor("#5F5F52")

LOGO_PATH = str(Path(__file__).resolve().parent / "assets" / "logo.png")
