import sys
sys.path.insert(0, ".")
from app.routes.question_bank import _extract_all_excel_images
import openpyxl
from io import BytesIO

xlsx_path = r'D:\final excel formats\QUESTION BANK reg 2021.xlsx'
with open(xlsx_path, 'rb') as f:
    content = f.read()

wb = openpyxl.load_workbook(BytesIO(content), data_only=True)
sheet = wb.active

image_map = _extract_all_excel_images(content, sheet)

print("Total image_map entries:", len(image_map))
print("Keys found:")
keys = sorted(image_map.keys(), key=lambda k: (k[0] if isinstance(k,tuple) else k, k[1] if isinstance(k,tuple) else 0))
for k in keys[:20]:
    v = image_map[k]
    b64_len = len(v.get("base64","")) if v else 0
    print("  key:", k, "| base64 length:", b64_len)
