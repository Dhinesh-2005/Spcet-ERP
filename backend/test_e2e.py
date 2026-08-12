import sys
sys.path.insert(0, ".")
from app.routes.question_bank import _extract_all_excel_images, _find_col_idx, _clean_str
import openpyxl, re
from io import BytesIO

xlsx_path = r'D:\final excel formats\QUESTION BANK reg 2021.xlsx'
with open(xlsx_path, 'rb') as f:
    content = f.read()

wb = openpyxl.load_workbook(BytesIO(content), data_only=True)
sheet = wb.active
rows = list(sheet.iter_rows(values_only=True))

# Detect header
header_idx = 0
for idx, row in enumerate(rows[:20]):
    if not row: continue
    row_str = " ".join([_clean_str(c).lower() for c in row if c])
    if "question" in row_str or "co" in row_str or "part" in row_str:
        header_idx = idx
        break

header = [_clean_str(c) for c in (rows[header_idx] or [])]
q_idx = _find_col_idx(header, ["question", "qtext", "questions"])
img_idx = _find_col_idx(header, ["image", "img", "diagram", "figure", "picture"])
print("Header row:", header_idx, "| header:", header)
print("question col:", q_idx, "| image col:", img_idx)

image_map = _extract_all_excel_images(content, sheet)
print("image_map size:", len(image_map))

with_img = 0
without_img = 0
for row_num in range(header_idx + 1, min(header_idx + 20, len(rows))):
    row = rows[row_num]
    if not row: continue
    question_text = _clean_str(row[q_idx]) if q_idx < len(row) else ""
    if not question_text: continue
    img_data = image_map.get((row_num, img_idx)) if img_idx != -1 else None
    if not img_data: img_data = image_map.get(row_num)
    status = "HAS IMAGE" if img_data else "no image"
    print("  row", row_num, "|", question_text[:50], "|", status)
    if img_data: with_img += 1
    else: without_img += 1

print("\nTotal with image:", with_img, "| without:", without_img)
