# -*- coding: utf-8 -*-
"""Repair backtick-swallowed code fragments in the v12 log section."""
import io

FN = '2026-10-07.md'

REPAIRS = [
    (u'- **5 份循环拷贝**：小时列 120 项、分钟列 300 项；px、视口 170px、',
     u'- **5 份循环拷贝**：小时列 120 项、分钟列 300 项；`DT_ITEM=34`px、视口 170px、'),
    (u'  （middle copy 起始项索引：小时 48、分钟 120）。',
     u'  `midBase = floor(5/2)*n`（middle copy 起始项索引：小时 48、分钟 120）。'),
    (u' 公式漏乘每份项数 n： 把 copy 序号当项索引用 → 打开面板',
     u'`dtCenterCol` 公式漏乘每份项数 n：`(mid + val)*ITEM` 把 copy 序号当项索引用 → 打开面板'),
    (u'正确：。',
     u'正确：`(mid * n + val) * DT_ITEM - (clientHeight - DT_ITEM)/2`。'),
]

with io.open(FN, 'r', encoding='utf-8', newline='') as f:
    s = f.read()

for old, new in REPAIRS:
    cnt = s.count(old)
    assert cnt == 1, ('expected 1 occurrence, got', cnt, old[:40])
    s = s.replace(old, new)

with io.open(FN, 'w', encoding='utf-8', newline='') as f:
    f.write(s)
print('repaired 4 fragments, total lines:', s.count('\n'))
