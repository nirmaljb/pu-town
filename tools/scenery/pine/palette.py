"""The pine's flat material colours, measured from the owner's tree sheets.

The owner chose the tree sheets over the snow town kit for this object (2026-10-16),
because the sheets were generated to suit the game. Each colour is the median of
its class in reference/side.png (grey background), then darkened for the blizzard's
survival mood where noted. The town's fog greys them further in game.
"""

SWATCHES = {
    # Needles: chosen so the review render's needles land a shade under the sheet's
    # median #42494A (compare.py reports both).
    'Needles': '#4A5352',
    # Deep needles inside the crown, where little light reaches.
    'Shadow': '#2E3536',
    # Snow: chosen so the review render's snow lands just under the sheet's median
    # #B2BCD0, the cool lavender-white of the slabs.
    'Snow': '#C2CBDE',
    # Ice drips: snow seen through ice, a little darker and bluer.
    'Ice': '#8E9AB2',
    # Bark: chosen so the review render's trunk lands a shade under the sheet's
    # grey-brown #524F50.
    'Bark': '#5C5250',
}


def srgb_to_linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def linear_colours():
    """Material name -> linear RGB."""
    return {name: tuple(srgb_to_linear(int(hex_[i:i + 2], 16) / 255) for i in (1, 3, 5))
            for name, hex_ in SWATCHES.items()}
