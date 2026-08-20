import re
import base64
import xml.etree.ElementTree as ET
from io import BytesIO
from typing import List, Dict, Any, Optional
from lxml import etree as lxml_etree
import docx

def _detect_fmt(raw: bytes) -> str:
    if not raw:
        return "png"
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

def omml_to_latex(elem: ET.Element) -> str:
    """
    Recursively converts an OMML (Office Math Markup Language) XML element into LaTeX syntax.
    """
    if elem is None:
        return ""
    tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag

    if tag in ("oMath", "oMathPara"):
        return "".join(omml_to_latex(c) for c in elem).strip()

    if tag == "t":
        return elem.text or ""

    if tag == "r":  # run in math
        text_parts = []
        for c in elem:
            ctag = c.tag.split("}")[-1] if "}" in c.tag else c.tag
            if ctag == "t":
                text_parts.append(c.text or "")
        return "".join(text_parts)

    if tag == "f":  # fraction \frac{num}{den}
        num, den = "", ""
        for child in elem:
            ctag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if ctag == "num":
                num = omml_to_latex(child)
            elif ctag == "den":
                den = omml_to_latex(child)
        return f"\\frac{{{num}}}{{{den}}}"

    if tag == "sSup":  # superscript
        e, sup = "", ""
        for child in elem:
            ctag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if ctag == "e":
                e = omml_to_latex(child)
            elif ctag == "sup":
                sup = omml_to_latex(child)
        return f"{e}^{{{sup}}}"

    if tag == "sSub":  # subscript
        e, sub = "", ""
        for child in elem:
            ctag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if ctag == "e":
                e = omml_to_latex(child)
            elif ctag == "sub":
                sub = omml_to_latex(child)
        return f"{e}_{{{sub}}}"

    if tag == "sSubSup":  # sub-sup
        e, sub, sup = "", "", ""
        for child in elem:
            ctag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if ctag == "e":
                e = omml_to_latex(child)
            elif ctag == "sub":
                sub = omml_to_latex(child)
            elif ctag == "sup":
                sup = omml_to_latex(child)
        return f"{e}_{{{sub}}}^{{{sup}}}"

    if tag == "rad":  # radical / square root
        e, deg = "", ""
        for child in elem:
            ctag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if ctag == "e":
                e = omml_to_latex(child)
            elif ctag == "deg":
                deg = omml_to_latex(child)
        if deg:
            return f"\\sqrt[{deg}]{{{e}}}"
        return f"\\sqrt{{{e}}}"

    if tag == "nary":  # integral, sum, etc.
        op, sub, sup, e = "", "", "", ""
        for child in elem:
            ctag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if ctag == "naryPr":
                for chr_elem in child.iter():
                    if chr_elem.tag.endswith("chr"):
                        op = chr_elem.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/math}val", "")
            elif ctag == "sub":
                sub = omml_to_latex(child)
            elif ctag == "sup":
                sup = omml_to_latex(child)
            elif ctag == "e":
                e = omml_to_latex(child)
        op_str = "\\int"
        if op == "∫":
            op_str = "\\int"
        elif op == "∑":
            op_str = "\\sum"
        elif op:
            op_str = op
        limits = ""
        if sub and sup:
            limits = f"_{{{sub}}}^{{{sup}}}"
        elif sub:
            limits = f"_{{{sub}}}"
        elif sup:
            limits = f"^{{{sup}}}"
        return f"{op_str}{limits} {e}"

    if tag == "d":  # delimiter (brackets around matrix or math expression)
        beg = "("
        end = ")"
        e_content = ""
        for child in elem:
            ctag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if ctag == "dPr":
                for subc in child:
                    subtag = subc.tag.split("}")[-1] if "}" in subc.tag else subc.tag
                    if subtag == "begChr":
                        beg = subc.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/math}val", "(")
                    elif subtag == "endChr":
                        end = subc.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/math}val", ")")
            elif ctag == "e":
                e_content = omml_to_latex(child)

        if "\\begin{matrix}" in e_content:
            if beg == "[" or end == "]":
                return e_content.replace("\\begin{matrix}", "\\begin{bmatrix}").replace("\\end{matrix}", "\\end{bmatrix}")
            elif beg == "(" or end == ")":
                return e_content.replace("\\begin{matrix}", "\\begin{pmatrix}").replace("\\end{matrix}", "\\end{pmatrix}")
            elif beg == "|" or end == "|":
                return e_content.replace("\\begin{matrix}", "\\begin{vmatrix}").replace("\\end{matrix}", "\\end{vmatrix}")

        return f"{beg}{e_content}{end}"

    if tag == "func":  # math functions (e.g. \sin, \cos, \log)
        fName, e_content = "", ""
        for child in elem:
            ctag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if ctag == "fName":
                fName = omml_to_latex(child)
            elif ctag == "e":
                e_content = omml_to_latex(child)
        return f"{fName} {e_content}"

    if tag == "acc":  # accent (hat, bar, vec, dot)
        acc_chr = "⃗"
        e_content = ""
        for child in elem:
            ctag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if ctag == "accPr":
                for chr_elem in child.iter():
                    if chr_elem.tag.endswith("chr"):
                        acc_chr = chr_elem.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/math}val", "⃗")
            elif ctag == "e":
                e_content = omml_to_latex(child)
        return f"\\vec{{{e_content}}}" if acc_chr in ("⃗", "->") else f"{e_content}{acc_chr}"

    if tag == "eqArr":  # equation array (aligned equations)
        rows = []
        for child in elem:
            ctag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if ctag == "e":
                rows.append(omml_to_latex(child))
        return " \\\\ ".join(rows)

    if tag == "m":  # matrix
        rows = []
        for child in elem:
            ctag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if ctag == "mr":
                cols = []
                for cell in child:
                    cell_tag = cell.tag.split("}")[-1] if "}" in cell.tag else cell.tag
                    if cell_tag == "e":
                        cols.append(omml_to_latex(cell))
                rows.append(" & ".join(cols))
        matrix_body = " \\\\ ".join(rows)
        return f"\\begin{{matrix}}{matrix_body}\\end{{matrix}}"

    if tag in ("num", "den", "e", "sub", "sup", "deg", "fName"):
        return "".join(omml_to_latex(c) for c in elem)

    # Fallback for any other XML element
    res = []
    if elem.text:
        res.append(elem.text)
    for child in elem:
        res.append(omml_to_latex(child))
        if child.tail:
            res.append(child.tail)
    return "".join(res)

def extract_cell_text(cell) -> str:
    """
    Extracts full text from a docx table cell, preserving:
    - Normal text runs
    - Superscripts (e.g. x^2)
    - Subscripts (e.g. H_2O)
    - OMML Math equations
    """
    tc_elem = cell._tc
    parts = []

    for p_elem in tc_elem.iterfind(".//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
        p_parts = []
        for child in p_elem:
            ctag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if ctag == "r":  # text run
                is_super = False
                is_sub = False
                rPr = child.find("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}rPr")
                if rPr is not None:
                    vertAlign = rPr.find("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}vertAlign")
                    if vertAlign is not None:
                        val = vertAlign.attrib.get("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val", "")
                        if val == "superscript":
                            is_super = True
                        elif val == "subscript":
                            is_sub = True

                t_parts = []
                for t in child.iterfind(".//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"):
                    if t.text:
                        t_parts.append(t.text)
                run_text = "".join(t_parts)

                if is_super and run_text:
                    p_parts.append(f"^{run_text}")
                elif is_sub and run_text:
                    p_parts.append(f"_{run_text}")
                else:
                    p_parts.append(run_text)

            elif ctag in ("oMath", "oMathPara"):
                math_latex = omml_to_latex(child)
                if math_latex:
                    p_parts.append(f" {math_latex} ")

        p_text = "".join(p_parts).strip()
        if p_text:
            parts.append(p_text)

    # Fallback if XML iteration didn't catch anything
    if not parts and cell.text:
        return cell.text.strip()

    return "\n".join(parts)

def extract_cell_image(cell, doc: docx.Document) -> Optional[Dict[str, str]]:
    """
    Extracts embedded image (if any) from a docx table cell and returns dict {"base64": "data:image/...;base64,..."}.
    """
    tc_elem = cell._tc
    embed_rids = []
    for blip in tc_elem.iterfind(".//{http://schemas.openxmlformats.org/drawingml/2006/main}blip"):
        for k, v in blip.attrib.items():
            if k.endswith("embed") or k.endswith("link"):
                embed_rids.append(v)
    for imgdata in tc_elem.iterfind(".//{urn:schemas-microsoft-com:vml}imagedata"):
        for k, v in imgdata.attrib.items():
            if k.endswith("id") or k.endswith("href"):
                embed_rids.append(v)

    for rid in embed_rids:
        if rid in doc.part.rels:
            rel = doc.part.rels[rid]
            target_part = rel.target_part
            raw_bytes = target_part.blob
            if raw_bytes:
                fmt = _detect_fmt(raw_bytes)
                b64 = base64.b64encode(raw_bytes).decode("utf-8")
                return {"base64": f"data:image/{fmt};base64,{b64}"}
    return None

def _clean_str(val: Any) -> str:
    if val is None:
        return ""
    return str(val).strip()

def _find_col_idx(header: List[str], keywords: List[str]) -> int:
    for idx, cell in enumerate(header):
        val = re.sub(r"[^a-z0-9]", "", _clean_str(cell).lower())
        for kw in keywords:
            if kw in val:
                return idx
    return -1

def parse_docx_question_bank_rows(content_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Parses all question bank tables in a Word (.docx) file and returns raw row data dicts
    containing cell values and image data for each question row across all tables.
    
    Matches exact structure expected by question processing pipeline.
    """
    doc = docx.Document(BytesIO(content_bytes))
    raw_rows = []

    for table in doc.tables:
        if not table.rows:
            continue

        # Find header row in this table (look in top 5 rows)
        header_row_idx = -1
        header_cells = []
        for r_idx, row in enumerate(table.rows[:5]):
            row_texts = [_clean_str(extract_cell_text(c)) for c in row.cells]
            row_str = " ".join(row_texts).lower()
            if "question" in row_str or "co" in row_str or "part" in row_str or "qtext" in row_str:
                header_row_idx = r_idx
                header_cells = row_texts
                break

        if header_row_idx == -1:
            # Fallback to first row as header if table has multiple rows
            if len(table.rows) > 1:
                header_row_idx = 0
                header_cells = [_clean_str(extract_cell_text(c)) for c in table.rows[0].cells]
            else:
                continue

        q_idx = _find_col_idx(header_cells, ["question", "qtext", "questions"])
        co_idx = _find_col_idx(header_cells, ["co", "courseoutcome", "c/o", "co/po"])
        k_idx = _find_col_idx(header_cells, ["klevel", "k-level", "btl", "bloom"])
        marks_idx = _find_col_idx(header_cells, ["mark", "marks", "weightage"])
        part_idx = _find_col_idx(header_cells, ["part", "section"])
        unit_idx = _find_col_idx(header_cells, ["unit", "unitno"])
        img_idx = _find_col_idx(header_cells, ["image", "img", "diagram", "figure", "picture"])

        if q_idx == -1:
            # If no explicit question column found, check if first/second column has text
            continue

        for r_idx in range(header_row_idx + 1, len(table.rows)):
            row = table.rows[r_idx]
            cell_texts = [extract_cell_text(c) for c in row.cells]
            
            question_text = cell_texts[q_idx].strip() if q_idx < len(cell_texts) else ""
            if not question_text:
                continue

            raw_co = cell_texts[co_idx].strip() if co_idx != -1 and co_idx < len(cell_texts) else ""
            raw_k = cell_texts[k_idx].strip() if k_idx != -1 and k_idx < len(cell_texts) else ""
            raw_marks = cell_texts[marks_idx].strip() if marks_idx != -1 and marks_idx < len(cell_texts) else ""
            raw_part = cell_texts[part_idx].strip() if part_idx != -1 and part_idx < len(cell_texts) else ""
            raw_unit = cell_texts[unit_idx].strip() if unit_idx != -1 and unit_idx < len(cell_texts) else ""

            # Image extraction: check img_idx cell first, then fallback to any cell in row
            img_data = None
            if img_idx != -1 and img_idx < len(row.cells):
                img_data = extract_cell_image(row.cells[img_idx], doc)
            if not img_data:
                for c in row.cells:
                    img_data = extract_cell_image(c, doc)
                    if img_data:
                        break

            # Extract native OpenXML child elements (w:p, m:oMath, etc.) and rel_map
            # Use lxml.etree.tostring() — python-docx uses lxml internally so _tc elements
            # are lxml elements. lxml preserves namespace prefixes (w:p, m:oMath, etc.)
            # unlike stdlib ET which converts them to Clark notation {ns}tag.
            q_cell = row.cells[q_idx] if q_idx < len(row.cells) else None
            cell_xml_list = []
            rel_map = {}
            if q_cell is not None:
                for child in q_cell._tc:
                    tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                    if tag in ("p", "tbl"):
                        try:
                            # lxml.etree.tostring preserves all namespace prefixes correctly
                            xml_bytes = lxml_etree.tostring(
                                child,
                                xml_declaration=False,
                                encoding="unicode",
                                with_tail=False,
                            )
                            cell_xml_list.append(xml_bytes)
                        except Exception:
                            pass
                # Collect image/drawing relationship blobs
                for node in q_cell._tc.iter():
                    for k, v in list(node.attrib.items()):
                        if k.endswith("embed") or k.endswith("href"):
                            rid = v
                            if rid in doc.part.rels:
                                try:
                                    rel = doc.part.rels[rid]
                                    if hasattr(rel, "target_part") and rel.target_part:
                                        raw_b = rel.target_part.blob
                                        if raw_b:
                                            rel_map[rid] = base64.b64encode(raw_b).decode("utf-8")
                                except Exception:
                                    pass

            raw_rows.append({
                "question": question_text,
                "cell_xml": cell_xml_list,
                "rel_map": rel_map,
                "co": raw_co,
                "kLevel": raw_k,
                "marks": raw_marks,
                "part": raw_part,
                "unit": raw_unit,
                "image": img_data,
            })

    return raw_rows
