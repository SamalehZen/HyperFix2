import os
import re
import shutil
import tempfile
from datetime import datetime

import pandas as pd
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from . import config

OUT_DIR = os.path.join(config.NAO_PROJECT_DIR, "docs", "etiquettes")
PUBLIC_BASE = "https://lololo.hypeer.cloud/etiquettes"
RETENTION_DAYS = 1  # les PDF d'étiquettes sont supprimés automatiquement après 24 h

LABEL_W = 95 * mm
LABEL_H = 55 * mm
COLS = 2
ROWS = 5
MARGIN_X = (A4[0] - COLS * LABEL_W) / 2
MARGIN_Y = (A4[1] - ROWS * LABEL_H) / 2

# Tailles : hauteur des barres, extension des gardes, tailles de police
SIZES = {
    "standard": {"module_px": 6, "bar_h_mm": 24.0, "guard_ext_mm": 4.0, "digit_pt": 10.0, "lib_pt": 12.0, "code_pt": 12.0},
    "grand": {"module_px": 7, "bar_h_mm": 28.0, "guard_ext_mm": 4.5, "digit_pt": 11.0, "lib_pt": 13.0, "code_pt": 13.0},
}

# --- EAN-13 encodage (spécification officielle) ---
L_CODES = {
    "0": "0001101", "1": "0011001", "2": "0010011", "3": "0111101", "4": "0100011",
    "5": "0110001", "6": "0101111", "7": "0111011", "8": "0110111", "9": "0001011",
}
R_CODES = {
    "0": "1110010", "1": "1100110", "2": "1101100", "3": "1000010", "4": "1011100",
    "5": "1001110", "6": "1010000", "7": "1000100", "8": "1001000", "9": "1110100",
}
G_CODES = {d: R_CODES[d][::-1] for d in R_CODES}
PARITY = [
    "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
    "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
]

DPI = 300
QUIET_LEFT_MOD = 11
QUIET_RIGHT_MOD = 7
TOTAL_MODS = QUIET_LEFT_MOD + 95 + QUIET_RIGHT_MOD


def _px_to_mm(px):
    return px / DPI * 25.4


def ean13_pattern(ean):
    """Motif EAN-13 (95 modules, 0/1) à partir d'un EAN à 13 chiffres valide."""
    first = int(ean[0])
    par = PARITY[first]
    pat = "101"
    for i in range(6):
        d = ean[1 + i]
        pat += L_CODES[d] if par[i] == "L" else G_CODES[d]
    pat += "01010"
    for i in range(6):
        pat += R_CODES[ean[7 + i]]
    pat += "101"
    return pat


def _cell_str(value):
    if value is None:
        return ""
    s = str(value).strip()
    if re.fullmatch(r"\d+\.0+", s):
        s = s.split(".")[0]
    return s


def _find_col(df, names):
    for c in df.columns:
        if str(c).strip().lower() in names:
            return c
    return None


def _ean_check(ean):
    total = 0
    for i, c in enumerate(ean[:12]):
        total += int(c) * (1 if i % 2 == 0 else 3)
    return (10 - total % 10) % 10


def normalize_ean(value):
    s = _cell_str(value)
    if not s or not s.isdigit() or len(s) not in (12, 13):
        return None, "invalide"
    if len(s) == 12:
        return s + str(_ean_check(s)), "ok"
    if int(s[12]) != _ean_check(s):
        return s[:12] + str(_ean_check(s)), "corrige"
    return s, "ok"


def read_table(path):
    if path.lower().endswith(".csv"):
        for sep in (",", ";", None):
            try:
                return pd.read_csv(path, sep=sep, dtype=str, engine="python" if sep is None else "c")
            except Exception:
                continue
        raise ValueError("Fichier CSV illisible")
    return pd.read_excel(path, dtype=str)


def _wrap(text, font, size, max_width, c):
    words = text.split()
    lines = []
    cur = ""
    for w in words:
        trial = (cur + " " + w).strip()
        if c.stringWidth(trial, font, size) <= max_width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines[:2]


def _latin1(text):
    return text.encode("latin-1", "replace").decode("latin-1")


def _ean_image(ean, tmp_dir, module_px, bar_h_px, guard_ext_px):
    """PNG professionnel : barres de garde étendues sous les barres normales."""
    from PIL import Image, ImageDraw

    pat = ean13_pattern(ean)
    n = len(pat)
    width = (QUIET_LEFT_MOD + n + QUIET_RIGHT_MOD) * module_px
    height = bar_h_px + guard_ext_px
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    for i, ch in enumerate(pat):
        if ch == "0":
            continue
        x0 = (QUIET_LEFT_MOD + i) * module_px
        x1 = x0 + module_px - 1
        if i < 3 or 45 <= i <= 49 or i >= 92:
            bottom = height - 1
        else:
            bottom = bar_h_px - 1
        draw.rectangle([x0, 0, x1, bottom], fill="black")
    png = os.path.join(tmp_dir, ean + ".png")
    img.save(png)
    return png, width, height


def _cleanup_old_pdfs():
    """Supprime les PDF d'étiquettes plus vieux que RETENTION_DAYS jours."""
    if not os.path.isdir(OUT_DIR):
        return
    now = datetime.now().timestamp()
    limit = RETENTION_DAYS * 86400
    for f in os.listdir(OUT_DIR):
        if not f.lower().endswith(".pdf"):
            continue
        p = os.path.join(OUT_DIR, f)
        try:
            if now - os.path.getmtime(p) > limit:
                os.remove(p)
        except OSError:
            pass


def generate_labels_pdf(path, copies=1, taille="standard"):
    if taille not in SIZES:
        raise ValueError(f"Taille inconnue : {taille}. Tailles disponibles : {', '.join(SIZES)}")
    sz = SIZES[taille]
    module_px = sz["module_px"]
    bar_h_px = int(round(sz["bar_h_mm"] / 25.4 * DPI))
    guard_ext_px = int(round(sz["guard_ext_mm"] / 25.4 * DPI))
    digit_pt = sz["digit_pt"]
    lib_pt = sz["lib_pt"]
    code_pt = sz["code_pt"]
    bar_h_mm = sz["bar_h_mm"]
    guard_ext_mm = sz["guard_ext_mm"]

    df = read_table(path)
    col_code = _find_col(df, ("code", "code article", "code_article", "code article"))
    col_ean = _find_col(df, ("ean", "ean13", "ean 13", "ean-13", "code barre", "code-barres", "codebarre", "cb"))
    col_lib = _find_col(df, ("libellé", "libelle", "designation", "désignation", "article", "libelle article"))
    if not col_code or not col_ean or not col_lib:
        raise ValueError(
            f"Colonnes introuvables. Attendu : une colonne 'Code', une colonne 'EAN' et une colonne 'Libellé'. "
            f"Trouvées : {list(df.columns)}"
        )

    articles = []
    corriges = 0
    ignores = []
    for _, row in df.iterrows():
        code = _cell_str(row[col_code])
        lib = _cell_str(row[col_lib])
        if not code:
            continue
        ean, statut = normalize_ean(row[col_ean])
        if statut == "corrige":
            corriges += 1
        if ean is None:
            ignores.append({"code": code, "libelle": lib[:40], "ean": _cell_str(row[col_ean])[:20]})
            continue
        articles.append({"code": code, "ean": ean, "libelle": lib})

    if not articles:
        raise ValueError("Aucun article avec un EAN valide dans le fichier.")

    copies = max(1, min(int(copies or 1), 10))
    os.makedirs(OUT_DIR, exist_ok=True)
    _cleanup_old_pdfs()
    name = f"etiquettes_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.pdf"
    pdf_path = os.path.join(OUT_DIR, name)

    # Géométrie (tout en mm, converti en points)
    bar_w_mm = _px_to_mm(TOTAL_MODS * module_px)
    y_bars_base_mm = guard_ext_mm + 8.0  # bas des barres normales depuis le bas de l'étiquette

    # Centres horizontaux des chiffres (en modules depuis le bord gauche de l'image)
    digit_centers = {
        "first": 5.5,
        "left6": 35.0,
        "right6": 81.5,
        "check": 109.5,
    }

    tmp_dir = tempfile.mkdtemp(prefix="labels_")
    try:
        c = canvas.Canvas(pdf_path, pagesize=A4)
        c.setTitle("Etiquettes EAN-13")
        idx = 0
        for art in articles:
            for _ in range(copies):
                pos = idx % (COLS * ROWS)
                if pos == 0 and idx > 0:
                    c.showPage()
                row = pos // COLS
                col = pos % COLS
                x0 = MARGIN_X + col * LABEL_W
                y1 = A4[1] - (MARGIN_Y + row * LABEL_H)
                y0 = y1 - LABEL_H
                c.setLineWidth(0.4)
                c.setStrokeGray(0.75)
                c.rect(x0, y0, LABEL_W, LABEL_H)

                cx = x0 + LABEL_W / 2
                lib_top = y0 + (y_bars_base_mm + bar_h_mm + 2.5) * mm
                lib = _latin1(art["libelle"][:60])
                lines = _wrap(lib, "Helvetica-Bold", lib_pt, LABEL_W - 10 * mm, c)
                ty = lib_top
                for ln in lines:
                    c.setFont("Helvetica-Bold", lib_pt)
                    c.drawCentredString(cx, ty, ln)
                    ty += 5.5 * mm

                png, w_px, h_px = _ean_image(art["ean"], tmp_dir, module_px, bar_h_px, guard_ext_px)
                img_left = cx - bar_w_mm * mm / 2
                img_bottom = y0 + (y_bars_base_mm - guard_ext_mm) * mm
                c.drawImage(png, img_left, img_bottom, width=bar_w_mm * mm, height=_px_to_mm(h_px) * mm)

                digits_y = y0 + (y_bars_base_mm - guard_ext_mm + 1.0) * mm
                c.setFont("Helvetica", digit_pt)
                c.drawCentredString(img_left + _px_to_mm(digit_centers["first"] * module_px) * mm, digits_y, art["ean"][0])
                c.drawCentredString(img_left + _px_to_mm(digit_centers["left6"] * module_px) * mm, digits_y, art["ean"][1:7])
                c.drawCentredString(img_left + _px_to_mm(digit_centers["right6"] * module_px) * mm, digits_y, art["ean"][7:13])
                c.drawCentredString(img_left + _px_to_mm(digit_centers["check"] * module_px) * mm, digits_y, art["ean"][12])

                c.setFont("Helvetica-Bold", code_pt)
                c.drawCentredString(cx, y0 + 3 * mm, _latin1(art["code"]))

                idx += 1
        c.save()
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    return {
        "pdf_path": pdf_path,
        "url": f"{PUBLIC_BASE}/{name}",
        "nb_etiquettes": idx,
        "nb_articles": len(articles),
        "corriges": corriges,
        "ignores": ignores,
    }
