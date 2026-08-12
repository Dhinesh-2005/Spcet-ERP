import zipfile, xml.etree.ElementTree as ET, re
from io import BytesIO

xlsx_path = r'D:\final excel formats\QUESTION BANK reg 2021.xlsx'
with open(xlsx_path, 'rb') as f:
    content = f.read()

zf = zipfile.ZipFile(BytesIO(content))
files = zf.namelist()

# Step 1: Build image list from richValueRel
print('=== richValueRel.xml ===')
rvr_xml = zf.read('xl/richData/richValueRel.xml').decode('utf-8','replace')
# Parse rels to get rId -> image path mapping
rels_xml = zf.read('xl/richData/_rels/richValueRel.xml.rels').decode('utf-8','replace')
print('rels:', rels_xml[:500])

rels_tree = ET.fromstring(rels_xml)
rid_to_img = {}
for child in rels_tree:
    rid = child.attrib.get('Id','')
    tgt = child.attrib.get('Target','')
    resolved = 'xl/media/' + tgt.split('/')[-1]
    rid_to_img[rid] = resolved
    print('rid', rid, '->', resolved, '| in zip:', resolved in files)

# Step 2: Build index list from richValueRel.xml (gives ordered list of rIds)
rvr_tree = ET.fromstring(rvr_xml)
ns = {'r2022': 'http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
rvr_index = []  # list of (rId, image_path) in order
for rel in rvr_tree:
    rid = None
    for attr_k, attr_v in rel.attrib.items():
        if attr_k.endswith('}id') or attr_k == 'id':
            rid = attr_v
    if rid is None:
        for attr_k, attr_v in rel.attrib.items():
            if 'id' in attr_k.lower():
                rid = attr_v
    print('rvr rel:', rel.tag, rel.attrib, '=> rId:', rid)
    if rid:
        rvr_index.append(rid_to_img.get(rid,'?'))

print('rvr_index:', rvr_index)

# Step 3: Parse sheet to find cells with vm attribute (rich value images)
print('\n=== Sheet cells with vm attribute (image cells) ===')
sheet_xml = zf.read('xl/worksheets/sheet1.xml').decode('utf-8','replace')
tree = ET.fromstring(sheet_xml)
ns_main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

for row_elem in tree.iter('{'+ns_main+'}row'):
    row_num = row_elem.attrib.get('r','?')
    for c_elem in row_elem:
        vm = c_elem.attrib.get('vm')
        cell_ref = c_elem.attrib.get('r','')
        if vm is not None:
            print('  Cell', cell_ref, 'row', row_num, 'vm=', vm, '-> rich value index', vm)
