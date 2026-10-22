#!/usr/bin/env python3
"""Turn one Claude Code session transcript into a dispatch-replay data file.

Only labels, model names, tool groups, counts and timings leave the transcript.
No prompt text, report text, file path or tool argument is copied out, so the
output is safe to publish. Run with `python3 -I`.

    python3 -I tools/extract.py MAIN.jsonl --from 2026-10-22T05:16:00 \
        --to 2026-10-22T06:24:30 --slug factcheck-1022 \
        --title "..." --task "..." [--captions captions.json] > data/factcheck-1022.js

Besides subagents (Agent/Task tool calls), shell calls that run one of the wrapper
scripts in EXTERNAL become `kind: "external"` executors. Three ways of launching
are recognised, each with its own hand-back moment:

- foreground: the call's own result is the read-back;
- `run_in_background`: the task notification marks the hand-back, and the first
  later tool call that reads the task's output file supplies the read-back length;
- detached (`nohup ... &`): the hand-back is the first later tool result that shows
  the wrapper's one-line JSON status for that job's `--output` file, and that line
  is the read-back.

A job whose hand-back cannot be found stops the script instead of being guessed.
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
# Wrapper script -> (vendor, default label word). Vendors must exist in VENDOR in src/core.js.
EXTERNAL = {
    'codex-image-gen.ts': ('codex', 'Codex生图'),
    'codex-run.sh': ('codex', 'Codex'),
    'kimi-run.sh': ('kimi', 'Kimi'),
    'agy-gui-run.sh': ('agy', 'AGY'),
    'gemini-image-gen.ts': ('agy', 'Gemini生图'),
    'grok-clean.sh': ('grok', 'Grok'),
    'grok-image-gen.sh': ('grok', 'Grok生图'),
}
# A wrapper counts as run only in command position, not when a command merely names it (grep, cat, docs).
INVOKE_RE = re.compile(
    r'(?:^|[;&|(]\s*|\bnohup\s+|\bbun\s+(?:run\s+)?|\bbash\s+|\bsh\s+|\bnode\s+|\bexec\s+|\btimeout\s+\d+\s+)'
    r'(?:[~\w./$-]*/)?(' + '|'.join(re.escape(k) for k in EXTERNAL) + r')\b', re.M)
HEREDOC_RE = re.compile(r"<<-?\s*['\"]?(\w+)['\"]?\n.*?\n\1\b", re.S)
LOOP_RE = re.compile(r'\bfor\s+(\w+)\s+in\s+([^;\n]+?)\s*;\s*do\b(.*?)\bdone\b', re.S)
STATUS_RE = re.compile(r'\{"status":\s*"(?:ok|error)".*\}')
NOTIFY_RE = re.compile(r'<task-notification>.*?</task-notification>', re.S)


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


def result_text(c):
    """Text of a tool_result block; image blocks count as nothing."""
    body = c.get('content')
    if isinstance(body, str):
        return body
    return ''.join(x.get('text', '') for x in body or [] if isinstance(x, dict) and x.get('type') == 'text')


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


def line_end(s, i):
    """Index of the first newline at or after i that is not inside quotes or $( )."""
    stack = []
    while i < len(s):
        c, top = s[i], stack[-1] if stack else ''
        if top == "'":
            if c == "'":
                stack.pop()
        elif c == '\\':
            i += 1
        elif top == '"':
            if c == '"':
                stack.pop()
            elif s.startswith('$(', i):
                stack.append('(')
                i += 1
        elif c in '"\'':
            stack.append(c)
        elif s.startswith('$(', i):
            stack.append('(')
            i += 1
        elif c == ')' and top == '(':
            stack.pop()
        elif c == '\n' and not stack:
            return i
        i += 1
    return len(s)


def external_jobs(cmd):
    """Wrapper runs in one shell command: [(script, output basename or None, detached, files it writes)].

    Heredoc bodies are dropped (they hold prompts that may name a wrapper), and a simple
    `for X in a b; do ...; done` loop is unrolled so each iteration counts as its own run.
    """
    body = HEREDOC_RE.sub('<<HEREDOC', cmd)

    def unroll(m):
        var, vals, inner = m.group(1), m.group(2).split(), m.group(3)
        pat = re.compile(r'\$(?:\{%s\}|%s\b)' % (var, var))
        return '\n'.join(pat.sub(v, inner) for v in vals)
    body = LOOP_RE.sub(unroll, body)
    jobs = []
    for m in INVOKE_RE.finditer(body):
        line_start = body.rfind('\n', 0, m.start()) + 1
        before, rest = body[line_start:m.start()], body[m.end():line_end(body, m.end())]
        out = re.search(r'--output\s+["\']?([^\s"\']+)', rest)
        # a lone `&` (not `&&`, `2>&1` or `&>`) after the run sends it to the background
        detached = 'nohup' in before or bool(re.search(r'(?<![&>])&(?![&>\d])', rest))
        # where its result can be read later: --output, and stdout/stderr redirected to a file
        files = [os.path.basename(f) for f in re.findall(r'(?:--output\s+|\d?>>?\s*)["\']?([^\s"\';&|<>]+)', rest)]
        files = [f for f in files if f and f not in ('null', '1', '2') and not f.startswith('&')]
        jobs.append((m.group(1), os.path.basename(out.group(1)) if out else None, detached, files))
    return jobs


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
    ap.add_argument('--external-labels', help='JSON file: hand-written labels for external runs, in launch order')
    a = ap.parse_args()

    t0, t1 = parse_bound(a.t_from), parse_bound(a.t_to)
    rel = lambda t: round(t - t0, 1)
    sub_dir = os.path.join(os.path.splitext(a.main_jsonl)[0], 'subagents')

    main_ctx, main_tools, seen = [], [], set()
    agents, by_tool_id = [], {}
    task_t, last_text = None, []
    handbacks = {}
    externals, ext_by_call = [], {}          # external runs in launch order; tool_use id -> runs it launched
    calls, results = [], {}                  # every tool call [t, id, input text]; tool_use id -> [t, text]
    notices, statuses = {}, []               # tool_use id -> notification time; [t, basename, line length, elapsed]

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

        # The author's task: the first plain message, or a slash command such as /goal
        if ty == 'user' and isinstance(content, str) and task_t is None and not o.get('isMeta') \
                and (not content.startswith('<') or content.startswith('<command-name>')) \
                and HANDBACK_MARK not in content:
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
                if c.get('type') != 'tool_use':
                    continue
                inp = c.get('input') or {}
                calls.append([t, c['id'], json.dumps(inp, ensure_ascii=False)])
                if c.get('name') not in ('Agent', 'Task'):
                    main_tools.append([t, tool_group(c.get('name', ''))])
                if c.get('name') == 'Bash':
                    for script, out, detached, files in external_jobs(inp.get('command') or ''):
                        mode = 'background' if inp.get('run_in_background') else 'detached' if detached else 'foreground'
                        job = {'script': script, 'out': out, 'files': files, 'mode': mode, 'call': c['id'], 'dispatchT': t}
                        externals.append(job)
                        ext_by_call.setdefault(c['id'], []).append(job)
                if c.get('name') in ('Agent', 'Task'):
                    ag = {
                        'id': inp.get('name') or 's%d' % (len(agents) + 1),
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

        if ty == 'user' and isinstance(content, list):
            for c in content:
                if not (isinstance(c, dict) and c.get('type') == 'tool_result'):
                    continue
                text = result_text(c)
                results[c.get('tool_use_id')] = [t, text]
                for line in text.splitlines():
                    s = STATUS_RE.search(line)
                    if not s:
                        continue
                    try:
                        st = json.loads(s.group(0))
                    except json.JSONDecodeError:
                        continue
                    if st.get('path'):
                        statuses.append([t, os.path.basename(st['path']), len(s.group(0)), st.get('elapsed_seconds')])
                if c.get('tool_use_id') in by_tool_id:
                    tur = o.get('toolUseResult')
                    if isinstance(tur, dict) and tur.get('agentId'):
                        by_tool_id[c['tool_use_id']]['_agentId'] = tur['agentId']

        for s in texts_in(o if ty == 'attachment' else content):
            if HANDBACK_MARK in s:
                for name, body in re.findall(HANDBACK_RE, s, flags=re.S):
                    handbacks.setdefault(name, [t, report_chars(body)])
            if '<task-notification>' in s:
                for n in NOTIFY_RE.findall(s):
                    tid = re.search(r'<tool-use-id>([^<]+)</tool-use-id>', n)
                    out = re.search(r'<output-file>([^<]+)</output-file>', n)
                    task = re.search(r'<task-id>([^<]+)</task-id>', n)
                    if tid and tid.group(1) not in notices:
                        notices[tid.group(1)] = [t, out.group(1) if out else None, task.group(1) if task else None]

    for ag in agents:
        aid = ag.pop('_agentId', None)
        files = glob.glob(os.path.join(sub_dir, f'agent-*{aid}*.jsonl')) if aid else []
        if not files:
            sys.exit(f'no subagent transcript for {ag["id"]}')
        ag.update(read_subagent(files[0], rel))
        hb = handbacks.get(ag['id']) or handbacks.get(aid)
        if not hb:
            sys.exit(f'no hand-back found for {ag["id"]}')
        ag['handbackT'], ag['handbackChars'] = hb
        ag['peakTokens'] = max(v for _, v in ag['ctx'])
        ag['toolCount'] = len(ag['tools'])

    labels = json.load(open(a.external_labels, encoding='utf-8')) if a.external_labels else []
    if labels and len(labels) != len(externals):
        sys.exit(f'--external-labels has {len(labels)} labels for {len(externals)} external runs')
    used_status = set()
    for n, job in enumerate(externals, 1):
        vendor, word = EXTERNAL[job['script']]
        end = None
        if job['mode'] == 'foreground':
            hb = results.get(job['call'])
            if hb:
                hb = [hb[0], len(hb[1])]
                end = hb[0]
        elif job['mode'] == 'background':
            note = notices.get(job['call'])
            hb = None
            if note:
                keys = [k for k in note[1:] + job['files'] if k]      # output file, task id, files the run wrote
                read = next((r for r in calls if r[0] >= note[0] and any(k in r[2] for k in keys) and r[1] in results), None)
                if read:
                    hb = [note[0], len(results[read[1]][1])]
                    end = note[0]
        else:
            i = next((i for i, s in enumerate(statuses)
                      if i not in used_status and s[0] >= job['dispatchT'] and job['out'] and s[1] == job['out']), None)
            hb = None
            if i is not None:
                used_status.add(i)
                hb = [statuses[i][0], statuses[i][2]]
                if statuses[i][3] is not None:      # the wrapper's own run time
                    end = min(round(job['dispatchT'] + statuses[i][3], 1), hb[0])
        if not hb:
            sys.exit(f'no hand-back found for external run {n} ({job["script"]}, {job["mode"]}, launched at {job["dispatchT"]}s)')
        agents.append({
            'id': 'x%d' % n,
            'label': labels[n - 1] if labels else f'{word} {n}',
            'kind': 'external',
            'vendor': vendor,
            'dispatchT': job['dispatchT'],
            'startT': job['dispatchT'],
            'endT': end,
            'ctx': [],
            'tools': [],
            'handbackT': hb[0],
            'handbackChars': hb[1],
            'toolCount': 0,
        })
    agents.sort(key=lambda ag: ag['dispatchT'])

    after = [x for x in last_text if x[0] >= max((ag['handbackT'] for ag in agents), default=0)]
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
