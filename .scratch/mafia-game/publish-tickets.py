"""Publish the approved nine-ticket breakdown, with resumable local bookkeeping."""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = 'nirmaljb/pu-town'
PARENT = 'https://github.com/nirmaljb/pu-town/issues/12'
MANIFEST = ROOT / 'published.json'
OUTPUT = ROOT / 'published-bodies'
OUTPUT.mkdir(exist_ok=True)


def gh(*args):
    result = subprocess.run(['gh', *args], text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise RuntimeError(f'gh {args[0]} failed: {result.stderr.strip()}')
    return result.stdout.strip()


def api(endpoint, *args):
    return json.loads(gh('api', endpoint, '-H', 'Accept: application/vnd.github+json',
                         '-H', 'X-GitHub-Api-Version: 2026-03-10', *args))


def save():
    MANIFEST.write_text(json.dumps(published, indent=2) + '\n')


overview = (ROOT / 'breakdown.md').read_text()
titles = {int(n): title for n, title in re.findall(r'^(\d+)\. \*\*(.+)\*\*$', overview, re.M)}
assert set(titles) == set(range(1, 10))
tickets = {}
for path in sorted((ROOT / 'issues').glob('*.md')):
    n = int(path.name[:2])
    body = path.read_text()
    blockers = [int(x) for x in re.findall(r'Draft ticket (\d+):', body)]
    assert all(x < n for x in blockers)
    tickets[n] = {'title': titles[n], 'body': body, 'blockers': blockers}
assert set(tickets) == set(titles)
published = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
parent_before = json.loads(gh('issue', 'view', '12', '--repo', REPO,
                              '--json', 'title,body,state,labels'))
snapshot_path = ROOT / 'parent-before-publication.json'
if not snapshot_path.exists():
    snapshot_path.write_text(json.dumps(parent_before, indent=2) + '\n')


def render(n, final=False):
    body = tickets[n]['body'].split('## Blocked by')[0]
    def link(match):
        key = str(int(match.group(1)))
        if key in published:
            entry = published[key]
            return f"[#{entry['number']}]({entry['url']})"
        assert not final
        return 'the "' + titles[int(key)] + '" slice'
    body = re.sub(r'ticket (\d{2})', link, body)
    blockers = tickets[n]['blockers']
    body += '## Blocked by\n\n'
    if blockers:
        body += '\n'.join(f"- [#{published[str(b)]['number']}: {titles[b]}]({published[str(b)]['url']})"
                          for b in blockers) + '\n'
    else:
        body += 'None (can start immediately).\n'
    return body


existing = json.loads(gh('issue', 'list', '--repo', REPO, '--state', 'all',
                         '--limit', '100', '--json', 'number,title,body,url'))
for n, ticket in tickets.items():
    key = str(n)
    if key not in published:
        matches = [x for x in existing if x['title'] == ticket['title'] and PARENT in x['body']]
        assert len(matches) <= 1, f'Ambiguous existing ticket {n}'
        path = OUTPUT / f'{n:02d}.md'
        path.write_text(render(n))
        if matches:
            url = matches[0]['url']
        else:
            url = gh('issue', 'create', '--repo', REPO, '--title', ticket['title'],
                     '--body-file', str(path), '--label', 'ready-for-agent')
        assert re.fullmatch(r'https://github.com/nirmaljb/pu-town/issues/\d+', url)
        published[key] = {'number': int(url.rsplit('/', 1)[1]), 'url': url,
                          'title': ticket['title'], 'localBlockers': ticket['blockers']}
        save()
    entry = published[key]
    assert entry['number'] != 12
    if 'id' not in entry:
        entry['id'] = api(f"repos/{REPO}/issues/{entry['number']}")['id']
        save()
    endpoint = f"repos/{REPO}/issues/{entry['number']}/dependencies/blocked_by"
    current = {x['id'] for x in api(endpoint)}
    for blocker in ticket['blockers']:
        blocker_id = published[str(blocker)]['id']
        if blocker_id not in current:
            api(endpoint, '--method', 'POST', '-F', f'issue_id={blocker_id}')
    print(f"Published {n:02d}: #{entry['number']} with blockers "
          f"{[published[str(b)]['number'] for b in ticket['blockers']]}", flush=True)

for n in tickets:
    entry = published[str(n)]
    body = render(n, final=True)
    path = OUTPUT / f'{n:02d}.md'
    path.write_text(body)
    remote = api(f"repos/{REPO}/issues/{entry['number']}")
    if remote['body'] != body or 'ready-for-agent' not in {x['name'] for x in remote['labels']}:
        gh('issue', 'edit', str(entry['number']), '--repo', REPO,
           '--body-file', str(path), '--add-label', 'ready-for-agent')
    remote = api(f"repos/{REPO}/issues/{entry['number']}")
    assert remote['body'] == body
    assert remote['title'] == entry['title']
    assert 'ready-for-agent' in {x['name'] for x in remote['labels']}
    blockers = api(f"repos/{REPO}/issues/{entry['number']}/dependencies/blocked_by")
    assert {x['number'] for x in blockers} == {published[str(b)]['number'] for b in tickets[n]['blockers']}
    entry['verified'] = True
    save()
    print(f"Verified #{entry['number']}: exact body, label, and native blockers", flush=True)

parent_after = json.loads(gh('issue', 'view', '12', '--repo', REPO,
                             '--json', 'title,body,state,labels'))
assert parent_before == parent_after == json.loads(snapshot_path.read_text())
print('All nine issues verified; parent #12 is unchanged.', flush=True)
