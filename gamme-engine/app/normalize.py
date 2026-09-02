import re
import unicodedata

_STOPWORDS = {
    "le", "la", "les", "de", "du", "des", "un", "une", "au", "aux", "et", "avec",
    "sans", "pour", "marque", "nouveau", "nouvelle", "nouveaux", "x", "a", "en", "sur", "sous",
}

_UNITS = {"g", "kg", "ml", "l", "cl", "dl", "pcb", "sachet", "boite", "bt", "bte", "carton"}

_SIZE_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|cl|dl)\b", re.IGNORECASE)
_MULTI_RE = re.compile(r"(\d+)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|cl|dl)\b")


def strip_accents(s):
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def normalize(libelle):
    if not libelle:
        return []
    s = strip_accents(str(libelle).lower())
    s = re.sub(r"[^a-z0-9%]+", " ", s)
    return [t for t in s.split() if t not in _STOPWORDS and len(t) > 1]


def extract_format(libelle):
    if not libelle:
        return None
    s = str(libelle)
    m = _MULTI_RE.search(s)
    if m:
        qty = float(m.group(2).replace(",", "."))
        unit = m.group(3).lower()
        if unit == "kg":
            qty *= 1000
        return f"{qty:g}{unit}"
    m = _SIZE_RE.search(s)
    if m:
        qty = float(m.group(1).replace(",", "."))
        unit = m.group(2).lower()
        if unit == "kg":
            qty *= 1000
        return f"{qty:g}{unit}"
    return None


def stem_fr(w):
    """Racine française simple : singulier / forme de base pour matcher
    les pluriels et variantes (« filous » → « filou », « petits » → « petit »,
    « yaourts » → « yaourt »). N'affecte pas les mots courts ni les « ss »/« x »
    qui ne sont pas des pluriels fréquents (prix, os…)."""
    if not w or len(w) < 4:
        return w
    if w.endswith("ss"):
        return w
    if w.endswith("s") or w.endswith("x"):
        stem = w[:-1]
        if len(stem) >= 3:
            return stem
    return w


def base_tokens(libelle):
    toks = normalize(libelle)
    fmt = extract_format(libelle)
    out = [
        stem_fr(t)
        for t in toks
        if not re.fullmatch(r"\d+[.,]?\d*", t) and not re.fullmatch(r"\d+[.,]?\d*(g|kg|ml|l|cl|dl)", t)
    ]
    if fmt:
        out.append(fmt)
    return out


def format_norm(libelle):
    fmt = extract_format(libelle)
    if fmt:
        return fmt
    return None