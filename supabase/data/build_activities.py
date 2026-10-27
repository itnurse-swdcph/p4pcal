# สร้าง activities.json จากไฟล์ "ส่งแบบบันทึก P4P กลุ่มการพยาบาล.xlsx" (7 ชีต = 7 สายงาน)
#   python3 build_activities.py <xlsx> <out.json>
import sys, re, json, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
norm = lambda v: re.sub(r'\s+', ' ', str(v)).strip() if v is not None else ''
def num(v):
    try: return round(float(v), 2)
    except (TypeError, ValueError): return None
ROLE_MULT = {'ADM-01-01', 'ADM-04-01', 'ACD-01-01'}      # ประชุม/เกื้อกูล/ประชุมวิชาการ: คงตัวคูณบทบาทเดิม
ACAD = re.compile(r'วิทยากร|ฝึกซ้อม|ฝึกทักษะ|ฝึกอบรม|อบรม|สอน|ทบทวนภารกิจ|ประชุมทบทวน|CQI|โครงการ|นำเสนอผลงาน|รายงานความเสี่ยง|รายงานคุณภาพ|ฝึกปฏิบัติ')
ADMIN = re.compile(r'ประชุม|เกื้อกูล|พิธี|จัดทำรายงาน|สารบรรณ|พัสดุ|การเงิน|บุคลากร')
def domain(cat, title, default='บริการ'):
    if ACAD.search(title) or ACAD.search(cat): return 'วิชาการ'
    if ADMIN.search(cat) or ADMIN.search(title): return 'บริหาร'
    return default
out, rows = [], []
def add(line, code, dom, title, uom, minutes, evidence='', note='', active=True, role=False, category=None, main=None):
    out.append(dict(code=code, domain=dom, category=category, main_activity=main, title=title, uom=uom or '-', minutes=minutes if minutes is not None else 0, use_role_mult=role,
        max_day=None, max_month=None, need_evidence=False, definition=evidence or None, no_dup_group=None, eligible=[line], note=note or None, active=active and minutes is not None))

# --- พยาบาล (รหัสเดิมในแบบ) ---
ws = wb['พยาบาล']; cat = ''; top = ''
strip_no = lambda t: re.sub(r'^\d+\s*[.\)]?\s*', '', t).strip()
DOM = {'ADM': 'บริหาร', 'SVC': 'บริการ', 'ACD': 'วิชาการ'}
for r in ws.iter_rows(min_row=6):
    b, c, d, e, f = [x.value for x in r[1:6]]
    if c:
        code = norm(c).upper().replace('SCV-', 'SVC-')   # ในแบบพิมพ์ผิดเป็น scv-09-xx
        role = code in ROLE_MULT
        add('พยาบาล', code, DOM[code[:3]], norm(d), norm(e), num(f), role=role, category=top, main=strip_no(cat))
    elif b:
        t = norm(b)
        if re.match(r'^\d', t): cat = t
        elif t.startswith('งานด้าน'): top = t; cat = ''

# --- สายงานที่มีรหัสกิจกรรมในแบบ ---
SHEETS = {'พนักงานช่วยเหลือคนไข้': 'ผู้ช่วยเหลือคนไข้', 'พนักงานประจำตึก': 'พนักงานประจำตึก', 'พนักงานธุรการ': 'พนักงานธุรการ'}
for sheet, line in SHEETS.items():
    ws = wb[sheet]
    hdr = {norm(c.value): c.column - 1 for c in ws[5] if c.value}
    col = lambda key: next((i for h, i in hdr.items() if key in h), None)
    ci = dict(cat=col('หมวดหมู่'), main=col('กิจกรรมหลัก'), sub=col('กิจกรรมย่อย (ภาษาราชการ)'), uom=col('หน่วยนับ'), prop=col('เวลาที่เสนอ'),
              cmp=col('เวลาเดิมที่ใช้เปรียบเทียบ'), status=col('สถานะการปรับปรุง'), scope=col('ขอบเขตการใช้'), ev=col('หลักฐาน'),
              caution=col('ข้อควรระวัง'), sup=col('การกำกับดูแล'))
    g = lambda r, k: norm(r[ci[k]].value) if ci.get(k) is not None else ''
    for r in ws.iter_rows(min_row=6):
        code = norm(r[0].value)
        if not re.match(r'^[A-Z]{2,5}-\d', code): continue
        minutes = num(r[ci['prop']].value) if ci['prop'] is not None else None
        if minutes is None and ci['cmp'] is not None: minutes = num(r[ci['cmp']].value)
        scope, status, cat = g(r, 'scope'), g(r, 'status'), g(r, 'cat')
        out_of_scope = 'ไม่ควรนับ' in status or 'นอกภารกิจ' in scope
        title = g(r, 'sub')
        if 'ศูนย์เครื่องมือแพทย์' in scope: title = '[เฉพาะศูนย์เครื่องมือแพทย์] ' + title
        elif 'ไตเทียม' in scope: title = '[เฉพาะไตเทียม/คลินิก] ' + title
        elif out_of_scope: title = '[นอกภารกิจตำแหน่ง ไม่นับ] ' + title
        note = '; '.join(x for x in [f"ข้อควรระวัง: {g(r, 'caution')}" if g(r, 'caution') else '',
                                    f"กำกับดูแล: {g(r, 'sup')}" if g(r, 'sup') else '', f'ขอบเขต: {scope}' if scope else ''] if x)
        add(line, code, domain(cat, g(r, 'sub')), title, g(r, 'uom'), minutes, evidence=g(r, 'ev'), note=note, active=not out_of_scope, category=strip_no(cat), main=g(r, 'main') or None)

# --- สายงานที่ไม่มีรหัสในแบบ: สร้างรหัสตามลำดับหมวด/ข้อ ---
for sheet, line, pre in [('พนักงานเปล', 'พนักงานเปล', 'TRP'), ('Paramedics', 'Paramedic', 'PMD'), ('EMT', 'EMT', 'EMT')]:
    ws = wb[sheet]; sec = 0; item = 0; secname = ''
    for r in ws.iter_rows(min_row=4):
        a, b, c, d = [x.value for x in r[:4]]
        if b and not c and not d:
            sec += 1; item = 0; secname = norm(b); continue
        if not (b and c): continue
        item += 1
        title = re.sub(r'^\s*\d+\s*[.\)]\s*', '', norm(b))
        add(line, f'{pre}-{sec:02d}-{item:03d}', domain(secname, title), title, norm(c), num(d), category=secname.strip())

codes = [x['code'] for x in out]
assert len(codes) == len(set(codes)), 'รหัสซ้ำ'
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
import collections
print('รวม', len(out), 'ใช้งาน', sum(x['active'] for x in out))
for line, n in collections.Counter(x['eligible'][0] for x in out).items(): print(' ', line, n)
print(' ด้าน', dict(collections.Counter(x['domain'] for x in out)))
print(' ปิดใช้งาน', [x['code'] for x in out if not x['active']])
