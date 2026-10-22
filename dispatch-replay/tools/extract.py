#!/usr/bin/env python3
"""Turn one Claude Code session transcript into a dispatch-replay data file.

Only labels, model names, tool groups, counts and timings leave the transcript.
No prompt text, report text, file path or tool argument is copied out, so the
output is safe to publish. Run with `python3 -I`.

    python3 -I tools/extract.py MAIN.jsonl --from 2026-10-22T05:16:00 \
        --to 2026-10-22T06:24:30 --slug factcheck-1022 \
        --title "..." --task "..." [--captions captions.json] > data/factcheck-1022.js
"""
import argparse
import glob
import json
import os
import re
import sys
from datetime import datetime, timezone

HANDBACK_MARK = '[Subagent hand-back]'
HANDBACK_RE = r'<agent-message from="([^"]+)">(.*?)(?:</agent-message>|$)'
REPORT_START = 'The report follows:'
TOOL_GROUP = {
    'WebSearch': 'web', 'WebFetch': 'web',
    'Read': 'file', 'Grep': 'file', 'Glob': 'file',
    'Edit': 'write', 'Write': 'write', 'NotebookEdit': 'write',
    'Bash': 'shell',
}


def parse_ts(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp()


def parse_bound(s):
    d = datetime.fromisoformat(s.replace('Z', '+00:00'))
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.timestamp()


def ctx_tokens(u):
    return (u.get('input_tokens', 0) + u.get('cache_read_input_tokens', 0)
            + u.get('cache_creation_input_tokens', 0))


def report_chars(block):
    """Length of the subagent's own report, without the harness frame or indentation."""
    i = block.find(REPORT_START)
    body = block[i + len(REPORT_START):] if i >= 0 else block
    return len(''.join(line.strip() for line in body.splitlines()))


def tool_group(name):
    if name in TOOL_GROUP:
        return TOOL_GROUP[name]
    return 'mcp' if name.startswith('mcp__') else 'other'


def model_family(m):
    m = (m or '').lower()
    for fam in ('opus', 'sonnet', 'haiku', 'fable'):
        if fam in m:
            return fam
    return m or 'unknown'


def lines(path):
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def texts_in(o):
    """All strings inside a JSON value (handbacks can sit in nested attachments)."""
    if isinstance(o, str):
        yield o
    elif isinstance(o, dict):
        for v in o.values():
            yield from texts_in(v)
    elif isinstance(o, list):
        for v in o:
            yield from texts_in(v)


def read_subagent(path, rel):
    seen, ctx, tools, stamps, model = set(), [], [], [], None
    for o in lines(path):
        if o.get('timestamp'):
            stamps.append(rel(parse_ts(o['timestamp'])))
        if o.get('type') != 'assistant':
            continue
        m = o.get('message') or {}
        t = rel(parse_ts(o['timestamp']))
        model = m.get('model') or model
        mid = m.get('id')
        if mid not in seen:
            seen.add(mid)
            ctx.append([t, ctx_tokens(m.get('usage') or {})])
        for c in m.get('content') or []:
            if isinstance(c, dict) and c.get('type') == 'tool_use':
                tools.append([t, tool_group(c.get('name', ''))])
    return {
        'startT': min(stamps) if stamps else None,
        'endT': max(stamps) if stamps else None,
        'family': model_family(model),
        'ctx': ctx,
        'tools': tools,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('main_jsonl')
    ap.add_argument('--from', dest='t_from', required=True)
    ap.add_argument('--to', dest='t_to', required=True)
    ap.add_argument('--slug', required=True)
    ap.add_argument('--title', required=True)
    ap.add_argument('--subtitle', default='')
    ap.add_argument('--task', required=True, help='hand-written task line shown in the bubble')
    ap.add_argument('--captions', help='JSON file: [[seconds, text], ...]')
    ap.add_argument('--label-strip', default='', help='regex removed from every label, e.g. "r6-?\\s?"')
    a = ap.parse_args()

    t0, t1 = parse_bound(a.t_from), parse_bound(a.t_to)
    rel = lambda t: round(t - t0, 1)
    sub_dir = os.path.join(os.path.splitext(a.main_jsonl)[0], 'subagents')

    main_ctx, main_tools, seen = [], [], set()
    agents, by_tool_id, by_name = [], {}, {}
    task_t, last_text = None, []
    handbacks = {}

    for o in lines(a.main_jsonl):
        if not o.get('timestamp'):
            continue
        t_abs = parse_ts(o['timestamp'])
        if not (t0 <= t_abs <= t1):
            continue
        t = rel(t_abs)
        ty = o.get('type')
        m = o.get('message') or {}
        content = m.get('content')

        if ty == 'user' and isinstance(content, str) and task_t is None \
                and not content.startswith('<') and HANDBACK_MARK not in content:
            task_t = t

        if ty == 'assistant':
            mid = m.get('id')
            if mid not in seen:
                seen.add(mid)
                main_ctx.append([t, ctx_tokens(m.get('usage') or {})])
            for c in content or []:
                if not isinstance(c, dict):
                    continue
                if c.get('type') == 'text' and c.get('text', '').strip():
                    last_text.append([t, len(c['text'])])
                if c.get('type') == 'tool_use' and c.get('name') not in ('Agent', 'Task'):
                    main_tools.append([t, tool_group(c.get('name', ''))])
                if c.get('type') == 'tool_use' and c.get('name') in ('Agent', 'Task'):
                    inp = c.get('input') or {}
                    ag = {
                        'id': inp.get('name') or c['id'][-8:],
                        'label': re.sub(a.label_strip, '', inp.get('description') or '').strip()
                                 if a.label_strip else (inp.get('description') or ''),
                        'kind': 'subagent',
                        'vendor': 'claude',
                        'askedModel': inp.get('model') or 'inherit',
                        'effort': inp.get('effort'),
                        'dispatchT': t,
                        'promptChars': len(inp.get('prompt') or ''),
                    }
                    agents.append(ag)
                    by_tool_id[c['id']] = ag
                    by_name[ag['id']] = ag

        if ty == 'user' and isinstance(content, list):
            for c in content:
                if isinstance(c, dict) and c.get('type') == 'tool_result' \
                        and c.get('tool_use_id') in by_tool_id:
                    tur = o.get('toolUseResult')
                    if isinstance(tur, dict) and tur.get('agentId'):
                        by_tool_id[c['tool_use_id']]['_agentId'] = tur['agentId']

        for s in texts_in(o if ty == 'attachment' else content):
            if HANDBACK_MARK in s:
                for name, body in re.findall(HANDBACK_RE, s, flags=re.S):
                    handbacks.setdefault(name, [t, report_chars(body)])

    for ag in agents:
        aid = ag.pop('_agentId', None)
        files = glob.glob(os.path.join(sub_dir, f'agent-*{aid}*.jsonl')) if aid else []
        if not files:
            sys.exit(f'no subagent transcript for {ag["id"]}')
        ag.update(read_subagent(files[0], rel))
        hb = handbacks.get(ag['id'])
        if not hb:
            sys.exit(f'no hand-back found for {ag["id"]}')
        ag['handbackT'], ag['handbackChars'] = hb
        ag['peakTokens'] = max(v for _, v in ag['ctx'])
        ag['toolCount'] = len(ag['tools'])

    after = [x for x in last_text if x[0] >= max(ag['handbackT'] for ag in agents)]
    reply = max(after, key=lambda x: x[1]) if after else None

    data = {
        'schema': 1,
        'slug': a.slug,
        'title': a.title,
        'subtitle': a.subtitle,
        'date': datetime.fromtimestamp(t0, timezone.utc).astimezone().strftime('%Y-%m-%d'),
        'duration': rel(t1),
        'task': {'t': task_t or 0, 'text': a.task},
        'main': {'ctx': main_ctx, 'tools': main_tools},
        'agents': agents,
        'reply': {'t': reply[0], 'chars': reply[1]} if reply else None,
        'captions': json.load(open(a.captions, encoding='utf-8')) if a.captions else [],
    }
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    print('// Generated by tools/extract.py from a Claude Code transcript. Do not edit by hand.')
    print('window.REPLAY_DATA = window.REPLAY_DATA || {};')
    print(f'window.REPLAY_DATA[{json.dumps(a.slug)}] = {body};')


if __name__ == '__main__':
    main()
