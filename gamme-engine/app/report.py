import html
import json
import os
from datetime import datetime

from . import config
from . import db

PRIO_LABELS = {"critique": "🔴 Critique", "important": "🟠 Important", "surveiller": "🟡 À surveiller", "corrige": "🟢 Corrigé"}
STATUT_LABELS = {
    "nouveau": "🔴 Nouveau", "persistant_aggrave": "🟠 Persistant aggravé",
    "persistant_stable": "🟠 Persistant stable", "persistant_ameliore": "🟡 Persistant amélioré",
    "corrige": "🟢 Corrigé",
}
CONF_LABELS = {"fort": "🟢 Fort", "moyen": "🟡 Moyen", "faible": "🔴 Faible", "aucun": "—"}


def eur(v):
    if v is None:
        return "—"
    return f"{v / 100:,.2f} €".replace(",", " ").replace(".", ",").replace(" ", "\u202f")


def num_str(v, dec=0):
    if v is None:
        return "—"
    if float(v).is_integer():
        return f"{int(v)}"
    return f"{round(float(v), dec):,}".replace(",", " ")


def fmt_couv(v):
    if v is None:
        return "—"
    return "999 (dormant)" if v == 999 else num_str(v)


def md_table(headers, rows):
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    for r in rows:
        cells = [str(c).replace("|", "/") if c is not None else "—" for c in r]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def write_report(conn, import_id, rayon, jour, nb, prev_id, negatifs, negatifs_tous, anomalies, compared, extra, compensations):
    resume = extra
    llm_error = extra.get("llm_error")
    prev_label = f"J-1 (import #{prev_id})" if prev_id else "aucun (premier import)"

    nb_corriges = len([c for c in compared if c.get("stock_j1") is not None and c.get("stock_j1") < 0 and (c.get("stock_j") or 0) >= 0])
    nb_nouveaux = len([n for n in negatifs if n["statut"] == "nouveau"])
    nb_persistants = len([n for n in negatifs if n["statut"].startswith("persistant")])
    nb_avec = len([n for n in negatifs if n["llm_analyse"] and any(c.get("code") for c in n["compensateurs"])])
    nb_sans = len([n for n in negatifs if n["llm_analyse"] and not any(c.get("code") for c in n["compensateurs"])])
    nb_non_analyses = len([n for n in negatifs if not n["llm_analyse"]])

    crit = [n for n in negatifs if n["priorite"] == "critique"]
    imp = [n for n in negatifs if n["priorite"] == "important"]
    surv = [n for n in negatifs if n["priorite"] == "surveiller"]

    md = []
    md.append(f"# Rapport du {jour} — Rayon {config.RAYON}")
    md.append("")
    md.append(f"- **Import #{import_id}** · {nb} articles analysés · comparaison avec {prev_label}")
    md.append("")
    md.append("## Résumé")
    md.append("")
    md.append(f"- 🔴 Nouveaux stock négatifs : **{nb_nouveaux}**")
    md.append(f"- 🟠 Négatifs persistants : **{nb_persistants}**")
    md.append(f"- 🟢 Négatifs corrigés : **{nb_corriges}**")
    md.append(f"- ⚠️ Anomalies détectées : **{len(anomalies)}**")
    md.append(f"- ✅ Compensateurs trouvés : **{nb_avec}** / sans résultat : **{nb_sans}**")
    if nb_non_analyses:
        md.append(f"- ➖ Non analysés par le LLM (plafond journalier) : **{nb_non_analyses}**")
    md.append("")

    if llm_error:
        md.append(f"> ⚠️ Analyse des compensateurs par LLM en échec : {llm_error}")
        md.append("")

    if prev_id is None and compared:
        md.append("## Stock négatifs dans le fichier de référence")
        md.append("")
        md.append(f"Le fichier de référence (J-1) contient déjà **{len(compared)}** articles en stock négatif. "
                  "Ils serviront de base de comparaison aux prochains imports (classés alors en « persistants »).")
        md.append("")
        md.append(md_table(["Code", "Libellé", "Stock"], [[c["code"], c["libelle"], num_str(c["stock"])] for c in compared]))
        md.append("")

    if negatifs:
        md.append("## Tableau détaillé des stock négatifs")
        md.append("")
        headers = ["Code", "Libellé", "Stock J-1", "Stock J", "Variation", "Px revient", "Px vente",
                   "COUV", "Compensateur", "Libellé compensateur", "Px revient comp.", "COUV comp.",
                   "Confiance", "Justification"]
        rows = []
        for n in sorted(negatifs, key=lambda x: (x["priorite"], x["code"])):
            comp = n["compensateurs"][0] if n["compensateurs"] else {}
            rows.append([
                n["code"], n["libelle"], num_str(n["stock_j1"]), num_str(n["stock_j"]),
                num_str(n["variation"], 1), eur(n["px_revient"]), eur(n["px_vente"]), fmt_couv(n["couv"]),
                comp.get("code") or "—", comp.get("libelle") or "—", eur(comp.get("px_revient")),
                fmt_couv(comp.get("couv")), CONF_LABELS.get(comp.get("confiance"), "—"),
                (comp.get("justification") or "—"),
            ])
        md.append(md_table(headers, rows))
        md.append("")
    else:
        md.append("## Tableau détaillé des stock négatifs")
        md.append("")
        md.append("Aucun stock négatif ce jour. 🎉")
        md.append("")

    for label, group in (("PRIORITÉ 🔴 CRITIQUE", crit), ("PRIORITÉ 🟠 IMPORTANT", imp), ("PRIORITÉ 🟡 À SURVEILLER", surv)):
        if not group:
            continue
        md.append(f"## {label}")
        md.append("")
        rows = []
        for n in group:
            rows.append([n["code"], n["libelle"], num_str(n["stock_j1"]), num_str(n["stock_j"]),
                         num_str(n["variation"], 1), STATUT_LABELS.get(n["statut"], n["statut"]),
                         f"{n['jours_consecutifs']}j", n["premiere_apparition"],
                         "oui" if n["compensateurs"] else "non"])
        md.append(md_table(["Code", "Libellé", "J-1", "J", "Variation", "Statut", "Jours négatifs", "1ère apparition", "Compensateur"], rows))
        md.append("")

    corriges = sorted(
        [c for c in compared if c.get("stock_j1") is not None and c.get("stock_j1") < 0 and (c.get("stock_j") or 0) >= 0],
        key=lambda c: abs(c.get("variation") or 0), reverse=True,
    )
    if corriges:
        md.append("## 🟢 Négatifs corrigés ce jour")
        md.append("")
        rows = [[c["code"], c.get("row_j", {}).get("libelle"), num_str(c.get("stock_j1")), num_str(c.get("stock_j")),
                 num_str(c.get("variation"), 1)]
                for c in corriges[:40]]
        md.append(md_table(["Code", "Libellé", "Stock J-1", "Stock J", "Variation"], rows))
        if len(corriges) > 40:
            md.append("")
            md.append(f"_… et {len(corriges) - 40} autres corrigés (liste complète consultable via l'API /api/article/{{code}}/historique)._")
        md.append("")

    recurrentes = [n for n in negatifs if n["nb_occurrences"] > 1]
    if recurrentes:
        md.append("## 🔁 Problèmes récurrents")
        md.append("")
        rows = [[n["code"], n["libelle"], n["nb_occurrences"], n["premiere_apparition"],
                 "corrigé puis redevenu négatif" if n["nb_occurrences"] > 1 else "—"]
                for n in recurrentes]
        md.append(md_table(["Code", "Libellé", "Nb occurrences", "1ère apparition", "Note"], rows))
        md.append("")

    if anomalies:
        md.append("## ⚠️ Autres anomalies")
        md.append("")
        rows = [[a["code"], a["type"], a["description"], num_str(a["valeur_j1"]), num_str(a["valeur_j"])]
                for a in anomalies]
        md.append(md_table(["Code", "Type", "Description", "J-1", "J"], rows))
        md.append("")

    md.append("## ⚠️ Limites des données")
    md.append("")
    md.append("Les mouvements (réceptions, ventes, sorties) et la date du dernier mouvement ne sont **pas "
              "présents dans le fichier** : aucune cause de variation n'est inventée, aucune analyse de "
              "mouvements n'est produite.")
    md.append("")
    md.append("_Rapport généré automatiquement par gamme-engine._")

    md_text = "\n".join(md)
    html_text = md_to_html(md_text, jour)

    out_dir = config.rayon_rapports_dir(rayon, jour)
    os.makedirs(out_dir, exist_ok=True)
    md_path = os.path.join(out_dir, "rapport.md")
    html_path = os.path.join(out_dir, "rapport.html")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_text)
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_text)

    nao_dir = os.path.join(config.NAO_PROJECT_DIR, "docs", "rapports")
    os.makedirs(nao_dir, exist_ok=True)
    with open(os.path.join(nao_dir, f"rapport_{rayon}_{jour}.md"), "w", encoding="utf-8") as f:
        f.write(md_text)
    with open(os.path.join(nao_dir, f"rapport_{rayon}_{jour}.html"), "w", encoding="utf-8") as f:
        f.write(html_text)

    story_path = None
    try:
        from . import report_story
        story_path = report_story.generate(conn, import_id, rayon, jour, nb, prev_id,
                                           negatifs, negatifs_tous, anomalies, compared)
    except Exception as e:
        print(f"[report] Story mode échoué: {e}")

    return md_path, html_path, story_path


def md_to_html(md_text, jour):
    css = """
    body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 1100px; margin: 24px auto; padding: 0 16px; color: #1f2933; background: #f7f9fc; }
    h1 { color: #0f172a; border-bottom: 3px solid #2563eb; padding-bottom: 8px; }
    h2 { color: #0f172a; margin-top: 28px; border-left: 4px solid #2563eb; padding-left: 10px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    th { background: #1e293b; color: #fff; padding: 8px 10px; text-align: left; font-size: 13px; }
    td { border: 1px solid #e2e8f0; padding: 6px 10px; font-size: 13px; }
    tr:nth-child(even) { background: #f8fafc; }
    blockquote { border-left: 4px solid #f59e0b; background: #fffbeb; padding: 8px 12px; margin: 12px 0; }
    ul { line-height: 1.7; }
    em { color: #64748b; }
    """
    body = html.escape(md_text)
    import re

    def table_repl(m):
        lines = m.group(0).strip().split("\n")
        rows = []
        for ln in lines[1:]:
            cells = [c.strip() for c in ln.strip().strip("|").split("|")]
            if set(cells) == {"---"}:
                continue
            rows.append("<tr>" + "".join(f"<td>{c}</td>" for c in cells) + "</tr>")
        return "<table>" + "".join(rows) + "</table>"

    def head_repl(m):
        return f"<h2>{m.group(1)}</h2>"

    def h1_repl(m):
        return f"<h1>{m.group(1)}</h1>"

    def quote_repl(m):
        return f"<blockquote>{m.group(1)}</blockquote>"

    def list_repl(m):
        items = "".join(f"<li>{it}</li>" for it in re.findall(r"^- (.*)", m.group(0), re.M))
        return f"<ul>{items}</ul>"

    def em_repl(m):
        return f"<em>{m.group(1)}</em>"

    html_text = body
    for pat, fn in [
        (re.compile(r"^# (.+)$", re.M), h1_repl),
        (re.compile(r"^## (.+)$", re.M), head_repl),
        (re.compile(r"(?m)^(\|.*\|)$", re.M), table_repl),
        (re.compile(r"(?m)^> (.+)$", re.M), quote_repl),
        (re.compile(r"(?m)^- (.+)$", re.M), list_repl),
        (re.compile(r"_([^_]+)_"), em_repl),
    ]:
        html_text = pat.sub(fn, html_text)
    paragraphs = []
    for block in html_text.split("\n\n"):
        block = block.strip()
        if not block:
            continue
        if not block.startswith(("<h1", "<h2", "<table", "<blockquote", "<ul")):
            block = block.replace("\n", "<br/>")
            block = f"<p>{block}</p>"
        paragraphs.append(block)
    inner = "\n".join(paragraphs)
    return f"<!DOCTYPE html><html lang='fr'><head><meta charset='utf-8'><title>Rapport du {jour}</title><style>{css}</style></head><body>{inner}</body></html>"