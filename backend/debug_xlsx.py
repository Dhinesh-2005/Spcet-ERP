import re, base64, zipfile, xml.etree.ElementTree as ET
from io import BytesIO

xlsx_path = r'D:\final excel formats\QUESTION BANK reg 2021.xlsx'
with open(xlsx_path, 'rb') as f:
    content = f.read()

zf = zipfile.ZipFile(BytesIO(content))
files = zf.namelist()

print('=== ZIP drawing/media/rels ===')
for fn in files:
    if any(x in fn.lower() for x in ['draw', 'media', 'rels']):
        print(' ', fn)

drawing_files = [fn for fn in files if re.search(r'drawings/drawing[0-9]*\.xml$', fn)]
print('\nDrawing files:', drawing_files)

for dw_file in drawing_files:
    parts = dw_file.rsplit('/', 1)
    dw_dir = parts[0] if len(parts)==2 else ''
    dw_name = parts[-1]
    if dw_dir:
        rel_file = dw_dir + '/_rels/' + dw_name + '.rels'
    else:
        rel_file = '_rels/' + dw_name + '.rels'
    print('Rel file:', rel_file, '| exists:', rel_file in files)
    rel_map = {}
    if rel_file in files:
        for child in ET.fromstring(zf.read(rel_file)):
            rid = child.attrib.get('Id','')
            tgt = child.attrib.get('Target','')
            if tgt.startswith('../'):
                parent_dir = dw_dir.rsplit('/',1)[0] if '/' in dw_dir else ''
                resolved = (parent_dir + '/' + tgt[3:]).lstrip('/')
            else:
                resolved = (dw_dir+'/'+tgt).lstrip('/')
            resolved = '/'.join(p for p in resolved.split('/') if p)
            rel_map[rid] = resolved
            print('  Rel', rid, '->', tgt, '=> resolved:', resolved, '| in_zip:', resolved in files)
    tree = ET.fromstring(zf.read(dw_file))
    anchors = [e for e in tree.iter() if e.tag.split('}')[-1] in ('twoCellAnchor','oneCellAnchor')]
    print('  Total anchors:', len(anchors))
    for a in anchors[:10]:
        from_e = next((c for c in a if c.tag.split('}')[-1]=='from'), None)
        row_v = col_v = None
        if from_e is not None:
            for c in from_e:
                t = c.tag.split('}')[-1]
                if t=='row': row_v = c.text
                if t=='col': col_v = c.text
        blip_rid = None
        for b in a.iter():
            if b.tag.split('}')[-1]=='blip':
                for k,v in b.attrib.items():
                    if k.split('}')[-1]=='embed': blip_rid=v
                break
        img_p = rel_map.get(blip_rid, 'NOT_IN_MAP')
        print('    row=' + str(row_v) + ' col=' + str(col_v) + ' rId=' + str(blip_rid) + ' img=' + img_p + ' ok=' + str(img_p in files))
