import re
import os
from collections import defaultdict

_HIERARCHY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "store_hierarchy.txt")


def _parse_line(ln):
    depth = len(ln) - len(ln.lstrip("\t"))
    rest = ln.strip()
    if not rest:
        return None
    m = re.match(r"(\d+)\s+(.*)", rest)
    if not m:
        return None
    return {"depth": depth, "code": m.group(1), "name": m.group(2).strip()}


class Hierarchy:
    def __init__(self):
        self._paths = set()      # set of (secteur, rayon, famille, sf)
        self._codes = {}         # (niveau, code) -> nom
        self._children = defaultdict(dict)  # parent_path -> {code: name}
        self._load()

    def _load(self):
        try:
            with open(_HIERARCHY_PATH, encoding="utf-8") as f:
                lines = f.readlines()
        except OSError:
            return
        stack = []
        for ln in lines:
            p = _parse_line(ln)
            if p is None:
                continue
            d = p["depth"]
            code = p["code"]
            name = p["name"]
            while stack and stack[-1]["depth"] >= d:
                stack.pop()
            parent = stack[-1] if stack else None
            self._codes[(d, code)] = name
            if d == 1:
                self._children[("secteur",)].setdefault(code, name)
            elif d == 2 and parent:
                pcode = parent["code"]
                self._children[("secteur", pcode)].setdefault(code, name)
            elif d == 3 and parent:
                pcode = parent["code"]
                gp = stack[-2] if len(stack) >= 2 else None
                gcode = gp["code"] if gp else ""
                self._children[("secteur", gcode, pcode)].setdefault(code, name)
            elif d == 4 and len(stack) >= 2:
                gcode = stack[-2]["code"] if len(stack) >= 2 else ""
                pcode = parent["code"]
                pp = stack[-3] if len(stack) >= 3 else None
                ppcode = pp["code"] if pp else ""
                self._children[("secteur", ppcode, gcode, pcode)].setdefault(code, name)
            stack.append(p)

        # Build all valid 4-uplets (secteur, rayon, famille, sous_famille)
        for sect_code in self._children.get(("secteur",), {}):
            for ray_code in self._children.get(("secteur", sect_code), {}):
                for fam_code in self._children.get(("secteur", sect_code, ray_code), {}):
                    sf_codes = self._children.get(("secteur", sect_code, ray_code, fam_code), {})
                    if sf_codes:
                        for sf_code in sf_codes:
                            self._paths.add((sect_code, ray_code, fam_code, sf_code))
                    else:
                        # famille sans sous-famille explicite : sous-famille = famille
                        self._paths.add((sect_code, ray_code, fam_code, fam_code))

    def nom(self, niveau, code):
        return self._codes.get((niveau, code), "")

    def nom_path(self, secteur, rayon, famille, sous_famille):
        """Résout les noms par le chemin COMPLET (les codes se répètent dans
        l'arbre : ex. sous-famille '107' peut être VOLAILLES ou HAMMACK selon
        la branche). Retourne (nom_secteur, nom_rayon, nom_famille, nom_sf)."""
        nom_sec = self._children.get(("secteur",), {}).get(secteur, "")
        nom_ray = self._children.get(("secteur", secteur), {}).get(rayon, "")
        nom_fam = self._children.get(("secteur", secteur, rayon), {}).get(famille, "")
        if sous_famille and sous_famille != famille:
            sf_map = self._children.get(("secteur", secteur, rayon, famille), {})
            nom_sf = sf_map.get(sous_famille, nom_fam)
        else:
            nom_sf = nom_fam
        return nom_sec, nom_ray, nom_fam, nom_sf

    def valider(self, secteur, rayon, famille, sous_famille):
        if not sous_famille:
            sous_famille = famille
        return (secteur, rayon, famille, sous_famille) in self._paths

    def sous_arbre_secteur(self, secteur_code):
        """Retourne le texte du sous-arbre pour un secteur donné (pour retry)."""
        parts = []
        sect_name = self.nom(1, secteur_code)
        parts.append(f"{secteur_code} {sect_name}")
        for ray_code in self._children.get(("secteur", secteur_code), {}):
            ray_name = self.nom(2, ray_code)
            parts.append(f"\t{ray_code} {ray_name}")
            for fam_code in self._children.get(("secteur", secteur_code, ray_code), {}):
                fam_name = self.nom(3, fam_code)
                parts.append(f"\t\t{fam_code} {fam_name}")
                for sf_code in self._children.get(("secteur", secteur_code, ray_code, fam_code), {}):
                    sf_name = self.nom(4, sf_code)
                    parts.append(f"\t\t\t{sf_code} {sf_name}")
        return "\n".join(parts)

    def recap(self, rows):
        """Retourne un texte récapitulatif : total articles, répartition secteurs,
        anomalies (NON CLASSÉS). rows = liste de listes 9 colonnes (format to_row)."""
        total = len(rows)
        if total == 0:
            return "Aucun article à classifier."
        sect_counts = defaultdict(int)
        sect_noms = defaultdict(str)
        non_classe = 0
        for r in rows:
            nom_sect = r[1] if len(r) > 1 else ""  # Nom secteur
            num_sect = r[2] if len(r) > 2 else ""  # Numéro secteur
            if num_sect:
                sect_counts[num_sect] += 1
                sect_noms[num_sect] = nom_sect
            else:
                non_classe += 1
        lines = [f"**{total} articles classifiés** — {len(sect_counts)} secteurs concernés."]
        if sect_counts:
            for code, n in sorted(sect_counts.items(), key=lambda x: -x[1]):
                pct = n / total * 100
                nom = sect_noms.get(code) or self.nom(1, code)
                lines.append(f"- Secteur {code} ({nom}) : {n} article(s) ({pct:.0f}%)")
        if non_classe:
            lines.append(f"⚠️ **{non_classe} article(s) non classé(s)** — aucun secteur correspondant trouvé dans la hiérarchie.")
        return "\n".join(lines)

    def columns(self):
        return [
            "Libellé", "Nom secteur", "Numéro secteur",
            "Nom rayon", "Numéro rayon", "Nom famille",
            "Numéro famille", "Nom sous-famille", "Code sous-famille"
        ]

    def to_row(self, libelle, secteur, rayon, famille, sous_famille, classe=True):
        if not classe or not secteur:
            return [libelle, "", "", "", "", "", "", "", ""]
        if not sous_famille:
            sous_famille = famille
        nom_sec, nom_ray, nom_fam, nom_sf = self.nom_path(secteur, rayon, famille, sous_famille)
        return [
            libelle,
            nom_sec, secteur,
            nom_ray, rayon,
            nom_fam, famille,
            nom_sf, sous_famille,
        ]


_HIERARCHY = None


def get_hierarchy():
    global _HIERARCHY
    if _HIERARCHY is None:
        _HIERARCHY = Hierarchy()
    return _HIERARCHY