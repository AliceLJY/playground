"""从批次目录的 iFixit API 原文里只取步骤文字，存进 data/，测试按它对账。
    python3 -I tools/extract-ifixit.py <批次目录>
iFixit 指南内容按 CC BY-NC-SA 3.0 授权，这里只留步骤原文与出处。"""
import json, sys, os
src = sys.argv[1]
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
for name, gid in (('ifixit-180199-换SSD.json', 180199), ('ifixit-178986-芯片识别.json', 178986)):
    d = json.load(open(os.path.join(src, name)))
    keep = {
        'source': d['url'], 'introduction': d['introduction_raw'], 'guideid': d['guideid'], 'title': d['title'], 'revisionid': d['revisionid'],
        'license': 'CC BY-NC-SA 3.0, iFixit', 'difficulty': d['difficulty'], 'time_required': d['time_required'],
        'tools': [t['text'] for t in d.get('tools') or []],
        'steps': [{'n': i + 1, 'title': s['title'], 'guideid': s['guideid'],
                   'lines': [{'bullet': l['bullet'], 'level': l['level'], 'text': l['text_raw']} for l in s['lines']]}
                  for i, s in enumerate(d['steps'])],
    }
    json.dump(keep, open(os.path.join(out, f'ifixit-{gid}.steps.json'), 'w'), ensure_ascii=False, indent=1)
    print(gid, len(keep['steps']), 'steps')
