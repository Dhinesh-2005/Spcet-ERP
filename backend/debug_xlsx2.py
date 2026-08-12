import zipfile, xml.etree.ElementTree as ET
from io import BytesIO

xlsx_path = r'D:\final excel formats\QUESTION BANK reg 2021.xlsx'
with open(xlsx_path, 'rb') as f:
    content = f.read()

zf = zipfile.ZipFile(BytesIO(content))
files = zf.namelist()

print('ALL FILES IN ZIP:')
for f in files:
    print(' ', f)

print('\n=== richData rels ===')
rd_rels = [f for f in files if 'richData' in f and 'rels' in f]
for rf in rd_rels:
    print('File:', rf)
    print(zf.read(rf).decode('utf-8','replace')[:2000])
    print()

print('\n=== richValueRel.xml ===')
rvr_files = [f for f in files if 'richValueRel' in f and f.endswith('.xml')]
for rf in rvr_files:
    print('File:', rf)
    print(zf.read(rf).decode('utf-8','replace')[:3000])
    print()

print('\n=== richValue files ===')
rv_files = [f for f in files if 'richData' in f and f.endswith('.xml')]
for rf in rv_files[:5]:
    print('File:', rf)
    print(zf.read(rf).decode('utf-8','replace')[:2000])
    print()

print('\n=== Sheet XML (first 3000 chars) ===')
sheet_files = [f for f in files if 'worksheets/sheet' in f and f.endswith('.xml')]
for sf in sheet_files[:1]:
    print('File:', sf)
    print(zf.read(sf).decode('utf-8','replace')[:3000])
