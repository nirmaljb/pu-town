"""What a built pine must meet before run.sh exports it to the Godot project.

compare.py checks every build against these numbers, writes the result to
review/scores.json and fails the run if any check fails. Pure Python.
"""

# Triangles. The near tree stands close to the camera; the distance version stands
# in for it far away and in the whole-map overview, where thousands are drawn.
NEAR_TRIANGLES = (8_000, 12_000)
FAR_TRIANGLES = (0, 600)

# The scores of the unreduced tree: 18,133 triangles, built from the session worktree's
# sources on 2026-10-16 and rebuilt byte-identical from this directory on 2026-10-17.
# The reduced tree must not score materially worse than this.
BEFORE_REDUCTION = {
    'side_mean_iou': 0.6482,
    'side_mean_envelope_iou': 0.7918,
    'top_iou': 0.772,
    'side_snow_share': 0.507,  # the mean of the four side views
    'top_snow_share': 0.459,
}

# How much worse than BEFORE_REDUCTION counts as material. The raw side IoU scores
# where each needle tooth falls against one painting, so it gets more room than the
# crown's outline. A snow share may move, but no further from the sheet's share.
SLACK = {'side_mean_iou': 0.03, 'side_mean_envelope_iou': 0.02, 'top_iou': 0.02, 'snow_share': 0.02}

# The distance version scores against the same sheets, with more room, and must keep
# the near tree's outline and its balance of snow and needles, so that the two match
# in shape and tone. These are proxies: up close the two are plainly different, and
# the distance at which a swap goes unnoticed is chosen in the game, not here.
FAR_SLACK = {'side_mean_envelope_iou': 0.06, 'top_iou': 0.06, 'snow_share': 0.05}
FAR_OUTLINE_AGAINST_NEAR = 0.85

# The rendered median of the snow and of the needles, each channel within this many
# 8-bit steps of the sheet's median for the same class.
PALETTE_STEPS = 12


def _rgb(hex_):
    return [int(hex_[i:i + 2], 16) for i in (1, 3, 5)]


def checks(report, scores):
    """A list of {'name', 'value', 'limit', 'pass'}, one per check."""
    out = []

    def check(name, value, limit, passed):
        out.append({'name': name, 'value': value, 'limit': limit, 'pass': bool(passed)})

    before = BEFORE_REDUCTION
    near = scores.get('near')
    check('near version built', near is not None and 'near' in report, 'present', near is not None and 'near' in report)
    if near is None or 'near' not in report:
        return out
    low, high = NEAR_TRIANGLES
    check('near triangles', report['near']['triangles'], f'{low}-{high}', low <= report['near']['triangles'] <= high)
    for key in ('side_mean_iou', 'side_mean_envelope_iou', 'top_iou'):
        floor = round(before[key] - SLACK[key], 4)
        check(f'near {key}', near[key], f'>= {floor}', near[key] >= floor)
    for view, reference in (('side', 'side_reference_snow_share'), ('top', 'top_reference_snow_share')):
        allowed = round(abs(before[f'{view}_snow_share'] - scores[reference]) + SLACK['snow_share'], 3)
        error = round(abs(near[f'{view}_snow_share'] - scores[reference]), 3)
        check(f'near {view} snow share off the sheet', error, f'<= {allowed}', error <= allowed)
    for name, rendered, sheet in (('snow', near['rendered_colour']['snow'], scores['reference_colour']['snow']),
                                  ('needles', near['rendered_colour']['needles'], scores['reference_colour']['needles'])):
        steps = max(abs(a - b) for a, b in zip(_rgb(rendered), _rgb(sheet)))
        check(f'near rendered {name} colour against the sheet', steps, f'<= {PALETTE_STEPS} steps', steps <= PALETTE_STEPS)

    far = scores.get('far')
    check('far version built', far is not None and 'far' in report, 'present', far is not None and 'far' in report)
    if far is None or 'far' not in report:
        return out
    low, high = FAR_TRIANGLES
    check('far triangles', report['far']['triangles'], f'{low}-{high}', low <= report['far']['triangles'] <= high)
    for key in ('side_mean_envelope_iou', 'top_iou'):
        floor = round(before[key] - FAR_SLACK[key], 4)
        check(f'far {key}', far[key], f'>= {floor}', far[key] >= floor)
    for view in ('side', 'top'):
        gap = round(abs(far[f'{view}_snow_share'] - near[f'{view}_snow_share']), 3)
        check(f'far {view} snow share against the near tree', gap, f'<= {FAR_SLACK["snow_share"]}',
              gap <= FAR_SLACK['snow_share'])
    outline = scores['far_against_near']['side_mean_envelope_iou']
    check('far outline against the near tree', outline, f'>= {FAR_OUTLINE_AGAINST_NEAR}', outline >= FAR_OUTLINE_AGAINST_NEAR)
    return out
