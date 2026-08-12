# Patch question_bank.py: replace _extract_all_excel_images with richData-aware version

new_func = r'''def _extract_all_excel_images(content_bytes, sheet=None):
    image_map = {}

    def _detect_fmt(raw):
        if raw[0:2] == b"\xff\xd8":
            return "jpeg"
        if raw[0:4] == b"\x89PNG":
            return "png"
        if raw[0:3] == b"GIF":
            return "gif"
        if raw[0:2] == b"BM":
            return "bmp"
        if raw[0:4] == b"RIFF" and raw[8:12] == b"WEBP":
            return "webp"
        return "png"

    def _img_obj(raw):
        if not raw:
            return None
        fmt = _detect_fmt(raw)
        b64 = base64.b64encode(raw).decode("utf-8")
        return {"base64": "data:image/" + fmt + ";base64," + b64}

    def _resolve_path(base_dir, target, file_list):
        if target.startswith("../"):
            parent = base_dir.rsplit("/", 1)[0] if "/" in base_dir else ""
            resolved = (parent + "/" + target[3:]).lstrip("/")
        elif target.startswith("/"):
            resolved = target.lstrip("/")
        else:
            resolved = (base_dir + "/" + target).lstrip("/")
        resolved = "/".join(p for p in resolved.split("/") if p)
        if resolved not in file_list:
            rl = resolved.lower()
            resolved = next((f for f in file_list if f.lower() == rl), resolved)
        return resolved

    try:
        zf = zipfile.ZipFile(BytesIO(content_bytes))
        file_list = zf.namelist()

        # ---------------------------------------------------------------
        # METHOD 1: Modern Excel "in-cell image" via xl/richData
        # richValueRel.xml lists rId -> image relationship (index = order)
        # Sheet cells have vm="N" attribute (1-based) -> richvalue index
        # rdrichvalue.xml maps richvalue index -> rvRel index -> image
        # ---------------------------------------------------------------
        rvr_file = "xl/richData/richValueRel.xml"
        rvr_rels_file = "xl/richData/_rels/richValueRel.xml.rels"
        if rvr_file in file_list and rvr_rels_file in file_list:
            try:
                # Build rId -> image path from rels
                rid_to_img = {}
                for child in ET.fromstring(zf.read(rvr_rels_file)):
                    rid = child.attrib.get("Id", "")
                    tgt = child.attrib.get("Target", "")
                    resolved = _resolve_path("xl/richData", tgt, file_list)
                    if rid and resolved in file_list:
                        rid_to_img[rid] = resolved

                # Build ordered list of image paths from richValueRel.xml
                rvr_ordered = []
                rvr_tree = ET.fromstring(zf.read(rvr_file))
                for rel in rvr_tree:
                    rid = None
                    for attr_k, attr_v in rel.attrib.items():
                        if attr_k.endswith("}id") or attr_k == "id":
                            rid = attr_v
                            break
                    if rid and rid in rid_to_img:
                        rvr_ordered.append(rid_to_img[rid])
                    else:
                        rvr_ordered.append(None)

                # Parse rdrichvalue.xml: each <rv> element's first <v> is the rvRel index (0-based)
                # vm index in cell is 1-based index into rdrichvalue entries
                rv_file = "xl/richData/rdrichvalue.xml"
                vm_to_img = {}  # vm value (int) -> image path
                if rv_file in file_list:
                    rv_tree = ET.fromstring(zf.read(rv_file))
                    rv_entries = [e for e in rv_tree if e.tag.split("}")[-1] == "rv"]
                    for rv_idx, rv_elem in enumerate(rv_entries):
                        vals = [c.text for c in rv_elem if c.tag.split("}")[-1] == "v"]
                        if vals:
                            try:
                                rvrel_idx = int(vals[0])
                                if 0 <= rvrel_idx < len(rvr_ordered) and rvr_ordered[rvrel_idx]:
                                    vm_to_img[rv_idx + 1] = rvr_ordered[rvrel_idx]
                            except (ValueError, TypeError):
                                pass
                else:
                    # Fallback: vm=1 -> first image
                    if rvr_ordered and rvr_ordered[0]:
                        vm_to_img[1] = rvr_ordered[0]

                # Pre-load images to avoid re-reading bytes multiple times
                img_cache = {}

                # Parse sheet XML to find cells with vm attribute
                sheet_files = [f for f in file_list if re.match(r"xl/worksheets/sheet\d+\.xml$", f)]
                for sf in sheet_files:
                    try:
                        s_tree = ET.fromstring(zf.read(sf))
                        ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
                        for row_elem in s_tree.iter("{" + ns + "}row"):
                            # Row number is 1-based in XML; convert to 0-based for image_map
                            row_r = row_elem.attrib.get("r")
                            row_0 = int(row_r) - 1 if row_r else None
                            for c_elem in row_elem:
                                vm_str = c_elem.attrib.get("vm")
                                if vm_str is None:
                                    continue
                                try:
                                    vm_val = int(vm_str)
                                except ValueError:
                                    continue
                                cell_ref = c_elem.attrib.get("r", "")
                                # Parse column from cell ref e.g. "C2" -> col index 2 (0-based)
                                col_letters = "".join(ch for ch in cell_ref if ch.isalpha())
                                col_0 = 0
                                for ch in col_letters:
                                    col_0 = col_0 * 26 + (ord(ch.upper()) - ord("A") + 1)
                                col_0 -= 1  # 0-based

                                img_path = vm_to_img.get(vm_val)
                                if not img_path:
                                    continue
                                if img_path not in img_cache:
                                    raw = zf.read(img_path)
                                    img_cache[img_path] = _img_obj(raw)
                                img_obj = img_cache[img_path]
                                if img_obj and row_0 is not None:
                                    if row_0 not in image_map:
                                        image_map[row_0] = img_obj
                                    image_map[(row_0, col_0)] = img_obj
                    except Exception:
                        pass
            except Exception:
                pass

        # ---------------------------------------------------------------
        # METHOD 2: Classic floating drawing images (twoCellAnchor)
        # ---------------------------------------------------------------
        drawing_files = [f for f in file_list if re.search(r"drawings/drawing\d*\.xml$", f)]
        for dw_file in drawing_files:
            parts = dw_file.rsplit("/", 1)
            dw_dir = parts[0] if len(parts) == 2 else ""
            dw_name = parts[-1]
            rel_file = dw_dir + "/_rels/" + dw_name + ".rels" if dw_dir else "_rels/" + dw_name + ".rels"

            rel_map = {}
            if rel_file in file_list:
                try:
                    for child in ET.fromstring(zf.read(rel_file)):
                        rid = child.attrib.get("Id", "")
                        tgt = child.attrib.get("Target", "")
                        if rid and tgt:
                            rel_map[rid] = _resolve_path(dw_dir, tgt, file_list)
                except Exception:
                    pass

            if not rel_map:
                continue

            try:
                dw_tree = ET.fromstring(zf.read(dw_file))
                for anchor in dw_tree.iter():
                    tag = anchor.tag.split("}")[-1] if "}" in anchor.tag else anchor.tag
                    if tag not in ("twoCellAnchor", "oneCellAnchor"):
                        continue
                    from_elem = next((c for c in anchor if c.tag.split("}")[-1] == "from"), None)
                    if from_elem is None:
                        continue
                    row_idx = col_idx = None
                    for c in from_elem:
                        t = c.tag.split("}")[-1] if "}" in c.tag else c.tag
                        if t == "row" and c.text:
                            try: row_idx = int(c.text)
                            except ValueError: pass
                        elif t == "col" and c.text:
                            try: col_idx = int(c.text)
                            except ValueError: pass
                    if row_idx is None:
                        continue
                    r_id = None
                    for blip in anchor.iter():
                        if blip.tag.split("}")[-1] == "blip":
                            for k, v in blip.attrib.items():
                                if k.split("}")[-1] == "embed":
                                    r_id = v
                                    break
                            if r_id:
                                break
                    if not r_id or r_id not in rel_map:
                        continue
                    img_path = rel_map[r_id]
                    if img_path in file_list:
                        raw = zf.read(img_path)
                        img_obj = _img_obj(raw)
                        if img_obj:
                            if row_idx not in image_map:
                                image_map[row_idx] = img_obj
                            if col_idx is not None:
                                image_map[(row_idx, col_idx)] = img_obj
            except Exception:
                pass
    except Exception:
        pass

    # ---------------------------------------------------------------
    # METHOD 3: openpyxl sheet._images fallback
    # ---------------------------------------------------------------
    if sheet and hasattr(sheet, "_images") and sheet._images:
        for img in sheet._images:
            try:
                row_idx = col_idx = None
                anchor = getattr(img, "anchor", None)
                if anchor:
                    if hasattr(anchor, "_from"):
                        row_idx = anchor._from.row
                        col_idx = anchor._from.col
                    elif hasattr(anchor, "row"):
                        row_idx = anchor.row
                        col_idx = getattr(anchor, "col", None)
                if row_idx is None:
                    continue
                raw = None
                if hasattr(img, "_data"):
                    raw = img._data()
                elif hasattr(img, "ref"):
                    ref = img.ref
                    raw = ref.read() if hasattr(ref, "read") else (ref if isinstance(ref, bytes) else None)
                elif hasattr(img, "path"):
                    with open(img.path, "rb") as f:
                        raw = f.read()
                if not raw and hasattr(img, "image"):
                    try:
                        buf = BytesIO()
                        img.image.save(buf, format="PNG")
                        raw = buf.getvalue()
                    except Exception:
                        pass
                if raw:
                    img_obj = _img_obj(raw)
                    if img_obj:
                        if row_idx not in image_map:
                            image_map[row_idx] = img_obj
                        if col_idx is not None and (row_idx, col_idx) not in image_map:
                            image_map[(row_idx, col_idx)] = img_obj
            except Exception:
                pass

    return image_map

'''

with open(r"app\routes\question_bank.py", "r", encoding="utf-8") as f:
    src = f.read()
    lines = src.splitlines(True)

# Find the function boundaries
start_line = None
end_line = None
for i, line in enumerate(lines):
    if line.strip().startswith("def _extract_all_excel_images"):
        start_line = i
    if start_line is not None and i > start_line:
        # Find next top-level def or class (not indented)
        if line and not line[0].isspace() and (line.startswith("def ") or line.startswith("class ") or line.startswith("@")):
            end_line = i
            break

print(f"Function at lines {start_line+1} to {end_line} (0-indexed)")

new_lines = lines[:start_line] + [new_func + "\n"] + lines[end_line:]

with open(r"app\routes\question_bank.py", "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("Patched successfully. New total lines:", len(new_lines))
