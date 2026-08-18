#!/usr/bin/env python3
"""Parse a contractor SOS form that was saved as PDF instead of .xls."""
from __future__ import annotations

import json
import re
import sys

from pypdf import PdfReader

SPEC_RE = re.compile(r'(?<!\d)([2-9]\d{5})(?!\d)')
APP_RE = re.compile(r'(?<!\d)(\d{9,10})(?!\d)')
CITY_RE = re.compile(
    r'([A-Za-z][A-Za-z .\'-]{2,40}),?\s*(DE|MD|PA|NJ|VA|NC|NY|OH|IN|GA|AL|UT|AZ|IL|MI)\s*\d{0,5}',
    re.I,
)


def pdf_text(path: str) -> str:
    reader = PdfReader(path)
    return '\n'.join((page.extract_text() or '') for page in reader.pages)


def is_contractor_form(text: str) -> bool:
    blob = re.sub(r'\s+', ' ', text)
    if re.search(r'material sources have been reviewed', blob, re.I):
        return False
    has_header = bool(re.search(r'spec\w{0,6}cation', blob, re.I) and re.search(r'Item Description', blob, re.I))
    return has_header and bool(SPEC_RE.search(text))


def is_issued_letter(text: str) -> bool:
    return bool(re.search(r'material sources have been reviewed', text, re.I))


def _grab(text: str, label: str) -> str:
    labels = (
        r'Agreement\s*/?\s*Permit\s*/?\s*Contract\s*/?\s*Application\s*#?',
        r'Title of Contract',
        r'Sub-Contractor',
        r'Contractor',
        r'Address',
        r'E-Mail',
        r'DelDOT Contact',
        r'District',
        r'Date',
        r'Spec\w{0,6}cation',
    )
    nxt = '|'.join(labels)
    pat = re.compile(rf'{label}\s*:?\s*(.*?)(?=(?:{nxt})\s*:|$)', re.I | re.S)
    m = pat.search(text)
    if not m:
        return ''
    val = re.sub(r'\s+', ' ', m.group(1)).strip(' :')
    val = re.sub(r'\s*Source of Supply.*$', '', val, flags=re.I).strip()
    return val[:180]


def parse_project(text: str) -> dict:
    contract = _grab(text, r'Agreement\s*/?\s*Permit\s*/?\s*Contract\s*/?\s*Application\s*#?')
    m = APP_RE.search(contract) or APP_RE.search(text)
    if m:
        contract = m.group(1)
    title = _grab(text, r'Title of Contract')
    title = re.sub(r'\s*Source of Supply.*$', '', title, flags=re.I).strip()
    contractor = _grab(text, r'Contractor')
    contractor = re.sub(r'^Contractor:\s*', '', contractor, flags=re.I)
    address = _grab(text, r'Address')
    address = re.sub(r'^Address:\s*', '', address, flags=re.I)
    return {
        'contract': contract,
        'title': title,
        'contractor': contractor,
        'address': address,
        'email': _grab(text, r'E-Mail'),
        'subContractor': _grab(text, r'Sub-Contractor'),
        'date': re.sub(r'^Date:\s*', '', _grab(text, r'Date'), flags=re.I),
        'district': re.sub(r'^District:\s*', '', _grab(text, r'District'), flags=re.I),
        'contact': re.sub(r'^DelDOT Contact:\s*', '', _grab(text, r'DelDOT Contact'), flags=re.I),
        'appNums': APP_RE.findall(contract + ' ' + text[:800]),
    }


def _chunk_desc(chunk: str) -> str:
    chunk = re.sub(r'\s+', ' ', chunk).strip()
    chunk = re.split(r'(?:Address & Contact|Material Requirements\?|Spec(?:if|fi)cation)', chunk, maxsplit=1)[0]
    # Cut at first city/state or phone-looking run.
    m = CITY_RE.search(chunk)
    if m and m.start() > 8:
        chunk = chunk[: m.start()]
    m = re.search(r'\d{3}[-.)\s]+\d{3}', chunk)
    if m and m.start() > 12:
        chunk = chunk[: m.start()]
    return chunk.strip(' -,')[:120]


def parse_items(text: str) -> list:
    hits = list(SPEC_RE.finditer(text))
    items = []
    seen = set()
    for i, hit in enumerate(hits):
        spec = hit.group(1)
        if spec in seen:
            continue
        seen.add(spec)
        end = hits[i + 1].start() if i + 1 < len(hits) else min(len(text), hit.end() + 400)
        chunk = text[hit.end() : end]
        desc = _chunk_desc(chunk)
        loc = ''
        city = CITY_RE.search(chunk)
        if city:
            loc = f'{city.group(1).strip()} {city.group(2).upper()}'
        items.append({
            'spec': spec,
            'desc': desc,
            'material': desc,
            'manufacturer': '',
            'alt': '',
            'supplier': '',
            'loc': loc,
        })
    return items


def parse_form(path: str) -> dict:
    text = pdf_text(path)
    kind = 'contractor-form' if is_contractor_form(text) else (
        'issued-letter' if is_issued_letter(text) else 'unknown'
    )
    out = {
        'path': path,
        'kind': kind,
        'project': parse_project(text) if kind == 'contractor-form' else {},
        'items': parse_items(text) if kind == 'contractor-form' else [],
        'appNums': list(dict.fromkeys(APP_RE.findall(text))),
        'text': text,
    }
    return out


def main() -> None:
    if len(sys.argv) < 3:
        print('usage: corpus-formpdf.py --inspect|--parse FILE', file=sys.stderr)
        sys.exit(2)
    mode, path = sys.argv[1], sys.argv[2]
    parsed = parse_form(path)
    if mode == '--inspect':
        print(json.dumps({
            'kind': parsed['kind'],
            'appNums': parsed['appNums'],
            'project': parsed.get('project') or {},
            'itemCount': len(parsed.get('items') or []),
            'specs': [i['spec'] for i in parsed.get('items') or []],
        }))
        return
    if mode == '--parse':
        slim = {k: parsed[k] for k in ('kind', 'project', 'items', 'appNums')}
        print(json.dumps(slim))
        return
    if mode == '--text':
        sys.stdout.write(parsed['text'])
        return
    sys.exit(2)


if __name__ == '__main__':
    main()
