"""Build the static case-study site data for the 10-per-dataset subset.

Reads ../selected_10.json (subset and renumbering) and the 20-per-dataset native bundle in
../../case_study_200_20261008/selected_bundle.json, plus ../../dsl18_20261008 metadata,
./manual_notes.json and ../CASE_STUDY_SUMMARY_ZH.md; writes ./data/*.json and ./data/summary.md.
Labels are copied as published; automatic flags are rule-based reading aids, not corrections.
"""
import csv
import json
import re
import statistics
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SOURCE = ROOT.parent / 'case_study_200_20261008'
DSL = ROOT.parent / 'dsl18_20261008'
OUT = HERE / 'data'

FLAGS = {
    'preamble': ('开场白', "S 以 “Sure!”“Here is/Here's…”“**Summary” 等模型套话开头。"),
    'meta_ref': ('谈论文本本身', 'S 在描述“这篇文本/文档/摘要”本身，如 “The text is about…”“The summary does not…”“(Note: …)”。'),
    'incomplete_end': ('结尾不完整', 'S 去掉空白后不以句末标点结束：可能是截断，也可能只是原系统输出没有句号，需要人看。'),
    'too_short': ('S 极短', 'S 少于 10 个 token。'),
    'fragment_unit': ('碎片单元', '句级/子句级标注中有单元少于 3 个词（含被切开的列表序号）。'),
    'artifact_tokens': ('残留符号', 'S 含 <pad>、<unk>、UNK、-lrb-/-rrb- 等分词或模型残留。'),
    'repetition': ('重复', 'S 内有完全相同的句子，或同一个 8-gram 出现 3 次及以上。'),
    'dup_first_last': ('首句=末句', 'DiverseSumm：summary_sentence 的第一句与最后一句完全相同（官方文件即如此，真实首句丢失）。'),
    'human_ref': ('人工参考摘要', '生成器名含 human/gold/reference，S 是人写的参考摘要。'),
    'shared_D': ('同一 D 多个 S', '本批 200 条里还有别的样本使用同一篇 D（可能跨数据集）。'),
    'near_dup_docs': ('多文档近似重复', '多文档 D 中有文章两两 8-gram 重合 ≥ 0.5。'),
    'source_noise': ('D 含残留', 'D 含 <br />、HTML 实体、â/Ã 等编码乱码或替换符。'),
    'label_casing': ('标签大小写不一', 'VeriGray：同一类标签有大小写不同的写法。'),
    'range_mismatch': ('range 对不上', 'VeriGray：句子的 range 字段截出的文字与 text 不一致。'),
    'annotator_split': ('标注员分歧', 'LongEval 单元票数不一致；SummEval 专家分极差 ≥ 2；ExtEval 两位标注员的 misleading 不同。'),
    'crowd_expert_gap': ('众包与专家差 ≥ 2', 'SummEval：众包 consistency 均值与专家均值相差 ≥ 2 分。'),
    'implicit_true': ('D 外为真', 'RAGTruth：有 span 标了 implicit_true（D 没有但现实为真）。'),
    'out_dependent': ('需外部知识', 'VeriGray：有句子标为 out-dependent（需 D 之外的知识才能支持）。'),
}
PREAMBLE = re.compile(r"^\s*(sure[!,.]|here('s| is| are)\b|\*\*\s*summary|summary\s*:)", re.I)
META_REF = re.compile(r"\b(the (provided )?(text|document|passage|article|transcript)s? "
                      r"(is|are|discusses|discuss|focuses|highlights|mentions|outlines|explains|concludes|covers|touches)"
                      r"|the summary (is|does|focuses)|\(note:)", re.I)
ARTIFACT = re.compile(r"<pad>|<unk>|\bUNK\b|-lrb-|-rrb-", re.I)
NOISE = re.compile(r"<br\s*/?>|&amp;|&quot;|&#\d+;|â|Ã|�")
END_OK = tuple('.!?。！？"\'”’)]】»*')
ALIAS = {'Explicitly-Supported', 'Implicitly-Supported', 'Contradicting', 'Fabricated',
         'Out-Dependent', 'Ambiguous', 'No-Fact'}


def words(text):
    return re.findall(r"\w+", text.lower())


def shingles(text, k=8):
    w = words(text)
    return {' '.join(w[i:i + k]) for i in range(max(1, len(w) - k + 1))}


def sentences(text):
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if len(s.strip()) > 20]


def tone(dataset, unit):
    if dataset == 'LongEval':
        votes = unit['label'].split(' / ')
        return 'ok' if votes == ['Yes'] else 'err' if votes == ['No'] else 'gray'
    return {'支持': 'ok', '无该问题': 'ok', '无错误 span': 'ok', '有错误': 'err', '有问题': 'err',
            '灰区': 'gray'}.get(unit['state'], 'neutral')


def longeval_votes(annotation):
    return [[v['label'] for v in u['votes']] for u in annotation['fine_units']]


def flags_for(c, dup_partners):
    r, a, ds = c['raw_record'], c['raw_record']['annotation'], c['dataset']
    s = (r['summary'] or '').strip()
    out = []

    def add(key, detail=''):
        out.append({'key': key, 'detail': detail})

    if PREAMBLE.search(s):
        add('preamble', s[:60])
    m = META_REF.search(s)
    if m:
        add('meta_ref', m.group(0))
    if s and not s.endswith(END_OK) and not s.endswith('```'):
        add('incomplete_end', '…' + s[-40:])
    if c['summary_tokens'] < 10:
        add('too_short', f"{c['summary_tokens']} token")
    if ds not in ('AggreFact', 'SummEval', 'ExtEval', 'RAGTruth-Summary'):
        short = [u['text'] for u in c['units'] if len(words(u['text'])) < 3]
        if short:
            add('fragment_unit', ' / '.join(t.strip()[:30] for t in short[:4]))
    m = ARTIFACT.findall(s)
    if m:
        add('artifact_tokens', ' '.join(sorted(set(m))))
    sents = sentences(s)
    repeated = sorted({x for x in sents if sents.count(x) > 1})
    grams = defaultdict(int)
    w = words(s)
    for i in range(len(w) - 7):
        grams[' '.join(w[i:i + 8])] += 1
    loops = [g for g, n in grams.items() if n >= 3]
    first_last = ds == 'DiverseSumm-LongFormFact' and len(a['summary_sentence']) > 1 \
        and a['summary_sentence'][0] == a['summary_sentence'][-1]
    if first_last:
        add('dup_first_last', a['summary_sentence'][0][:80])
        # The duplicated first sentence is already reported (it repeats only twice, below the 8-gram loop bar).
        repeated = [x for x in repeated if x != a['summary_sentence'][0].strip()]
    if repeated or loops:
        add('repetition', (repeated[0] if repeated else loops[0])[:80])
    if any(k in str(c['generator']).lower() for k in ['human', 'gold', 'reference']):
        add('human_ref', str(c['generator']))
    if dup_partners:
        add('shared_D', '、'.join(dup_partners))
    if len(r['sources']) > 1:
        sh = [shingles(x) for x in r['sources']]
        pairs = [(i, j) for i in range(len(sh)) for j in range(i + 1, len(sh))
                 if len(sh[i] & sh[j]) / max(1, min(len(sh[i]), len(sh[j]))) >= 0.5]
        if pairs:
            docs = sorted({k for p in pairs for k in p})
            add('near_dup_docs', f"{len(docs)} 篇互有重合：" + '、'.join(f'Article {k}' if ds == 'DiverseSumm-LongFormFact' else f'Document {k + 1}' for k in docs))
    m = NOISE.findall('\n'.join(r['sources']))
    if m:
        add('source_noise', ' '.join(sorted(set(m)))[:40])
    if ds == 'VeriGray':
        labels = {v['annotation'] for v in a['sentences']}
        odd = sorted(x for x in labels if x not in ALIAS)
        if odd:
            add('label_casing', ' / '.join(odd))
        bad = sum(1 for v in a['sentences'] if s and r['summary'][v['range'][0]:v['range'][1]] != v['text'])
        if bad:
            add('range_mismatch', f'{bad} 句')
        if any(v['annotation'].lower() == 'out-dependent' for v in a['sentences']):
            add('out_dependent')
    if ds == 'LongEval':
        split = sum(1 for v in longeval_votes(a) if len(set(v)) > 1)
        if split:
            add('annotator_split', f'{split} 个单元票数不一致')
    if ds == 'SummEval':
        ex = [x['consistency'] for x in a['expert_annotations']]
        tu = [x['consistency'] for x in a['turker_annotations']]
        if max(ex) - min(ex) >= 2:
            add('annotator_split', f'专家 {ex}')
        if abs(statistics.mean(tu) - statistics.mean(ex)) >= 2:
            add('crowd_expert_gap', f'专家 {ex} · 众包 {tu}')
    if ds == 'ExtEval' and a['misleading1'] != a['misleading2']:
        add('annotator_split', f"misleading1={a['misleading1']} · misleading2={a['misleading2']}")
    if ds == 'RAGTruth-Summary':
        it = [v['text'] for v in a['labels'] if v.get('implicit_true')]
        if it:
            add('implicit_true', ' / '.join(it))
    return out


def main():
    bundle = json.loads((SOURCE / 'selected_bundle.json').read_text())
    subset = json.loads((ROOT / 'selected_10.json').read_text())
    renumber = {p['old_id']: p['new_id'] for p in subset['cases']}
    meta = json.loads((DSL / 'dataset_metadata.json').read_text())
    errors = list(csv.DictReader((DSL / 'error_types.csv').open(encoding='utf-8-sig')))
    notes = json.loads((HERE / 'manual_notes.json').read_text())
    cases = []
    for c in bundle['cases']:
        if c['case_id'] in renumber:
            new_id = renumber[c['case_id']]
            cases.append(dict(c, case_id=new_id, reading_order=int(new_id.rsplit(':', 1)[1]), old_id=c['case_id']))
    cases.sort(key=lambda c: list(renumber.values()).index(c['case_id']))
    ids = {c['case_id'] for c in cases}
    assert set(notes) <= ids, sorted(set(notes) - ids)

    by_source = defaultdict(list)
    for c in cases:
        key = re.sub(r'[^a-z0-9]', '', ' '.join(c['raw_record']['sources']).lower())[:400]
        by_source[key].append(c['case_id'])
    partners = {cid: [x for x in group if x != cid] for group in by_source.values() for cid in group}

    rows = []
    for c in cases:
        r = c['raw_record']
        units = []
        for u in c['units']:
            units.append(dict(text=u['text'], label=u['label'], state=u['state'], tone=tone(c['dataset'], u),
                              types=u['types'], explanation=u['explanation'],
                              error_spans=u.get('error_spans', [])))
        rows.append(dict(
            id=c['case_id'], old_id=c['old_id'], ds=c['dataset'], order=c['reading_order'], record_id=str(c['record_id']),
            subset=str(c['subset'] or '—'), generator=str(c['generator'] or '未注明'),
            d_tok=c['source_tokens'], s_tok=c['summary_tokens'], d_q=c['d_bin'], s_q=c['s_bin'],
            state=c['state'], label_display=c['native_label_display'], query=str(r['query'] or ''),
            summary=r['summary'], sources=r['sources'], units=units, spans=c['spans'],
            annotation=r['annotation'], source_file=Path(c['source_file']).name, source_line=c['source_line'],
            sha=c['record_sha256'], flags=flags_for(c, partners[c['case_id']]),
            note=notes.get(c['case_id'])))

    datasets = {}
    for name, m in bundle['datasets'].items():
        md = meta[name]
        datasets[name] = dict(domain=md[0], unit=md[1], meaning=md[2], generator_note=md[3], data_note=md[4],
                              source_url=md[5], paper_url=md[6],
                              glossary=[dict(label=e['label'], meaning=e['meaning_zh'],
                                             example=e['illustrative_example_zh'], note=e['hierarchy_or_note'])
                                        for e in errors if e['dataset'] == name],
                              raw_records=m['raw_records'], eligible_records=m['eligible_records'],
                              excluded=m['excluded'])
    OUT.mkdir(exist_ok=True)
    (OUT / 'cases.json').write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':')))
    (OUT / 'meta.json').write_text(json.dumps(dict(
        seed=bundle['seed'], method=bundle['method'], subset_rule=subset['rule'],
        per_dataset=subset['per_dataset'], datasets=datasets,
        flags={k: dict(label=v[0], definition=v[1]) for k, v in FLAGS.items()}), ensure_ascii=False, indent=1))
    (OUT / 'summary.md').write_text((ROOT / 'CASE_STUDY_SUMMARY_ZH.md').read_text())
    counts = defaultdict(lambda: defaultdict(int))
    for row in rows:
        for f in {f['key'] for f in row['flags']}:
            counts[f][row['ds']] += 1
    for f in FLAGS:
        print(f"{FLAGS[f][0]:<10}", dict(counts[f]))
    print('cases', len(rows), 'bytes', (OUT / 'cases.json').stat().st_size)


if __name__ == '__main__':
    main()
