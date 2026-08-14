import json
import os

from . import config
from . import db


def _eur(v):
    if v is None:
        return "—"
    return f"{float(v):.2f} €"


def _num(v, d=0):
    if v is None:
        return "—"
    return f"{float(v):,.{d}f}".replace(",", " ")


def generate(conn, import_id, rayon, jour, nb, prev_id, negatifs, negatifs_tous, anomalies, compared):
    libelle_rayon = config.rayon_libelle(rayon)
    nb_import = conn.execute(
        "SELECT COUNT(*) AS n FROM imports WHERE rayon = ? AND id <= ? AND statut IN ('ok','baseline')",
        (rayon, import_id)).fetchone()["n"]
    resume = {
        "jour": jour, "nb_articles": nb, "rayon": rayon, "libelle_rayon": libelle_rayon,
        "nouveaux": len([n for n in negatifs if n["statut"] == "nouveau"]),
        "persistants": len([n for n in negatifs if n["statut"].startswith("persistant")]),
        "corriges": len([c for c in compared if c["stock_j1"] is not None and c["stock_j1"] < 0 and (c["stock_j"] or 0) >= 0]),
        "anomalies": len(anomalies),
        "avec_compensateur": len([n for n in negatifs if any(c.get("code") for c in n.get("compensateurs", []))]),
        "sans_compensateur": len([n for n in negatifs if n.get("compensateurs") is not None and not any(c.get("code") for c in n["compensateurs"])]),
        "critiques": len([n for n in negatifs if n["priorite"] == "critique"]),
        "importants": len([n for n in negatifs if n["priorite"] == "important"]),
        "nb_import": nb_import,
        "baseline": prev_id is None,
    }

    top_neg = sorted(negatifs, key=lambda n: (n.get("stock_j") or 0))[:10]
    top_neg_data = [{
        "code": n["code"], "libelle": (n.get("libelle") or "")[:40],
        "stock": n.get("stock_j"), "valeur": -(n.get("stock_j") or 0) * (n.get("px_revient") or 0),
    } for n in top_neg]

    compens = [{
        "neg": (n.get("libelle") or n["code"])[:32],
        "comp": (n.get("compensateur_libelle") or "—")[:32],
        "confiance": n.get("confiance") or "aucun",
    } for n in negatifs if n.get("compensateur_libelle")]

    types_anom = {}
    for a in anomalies:
        types_anom[a["type"]] = types_anom.get(a["type"], 0) + 1

    serie_jours = []
    rows = conn.execute(
        "SELECT jour, COUNT(*) AS n, SUM(CASE WHEN priorite = 'critique' THEN 1 ELSE 0 END) AS crit "
        "FROM negatifs_journaliers WHERE rayon = ? AND jour <= ? AND statut != 'corrige' "
        "GROUP BY jour ORDER BY jour", (rayon, jour),
    ).fetchall()
    for r in rows:
        serie_jours.append({"jour": r["jour"], "total": r["n"], "critiques": r["crit"] or 0})

    data = {
        "resume": resume,
        "top_neg": top_neg_data,
        "compens": compens,
        "types_anom": types_anom,
        "serie_jours": serie_jours,
        "negatifs": [{
            "code": n["code"], "libelle": n.get("libelle"), "stock_j1": n.get("stock_j1"),
            "stock_j": n.get("stock_j"), "variation": n.get("variation"),
            "px_revient": n.get("px_revient"), "px_vente": n.get("px_vente"),
            "couv": n.get("couv"), "statut": n["statut"], "priorite": n.get("priorite"),
            "jours_consecutifs": n.get("jours_consecutifs"),
            "premiere_apparition": n.get("premiere_apparition"),
            "compensateur": n.get("compensateur_libelle"), "confiance": n.get("confiance"),
            "justification": n.get("justification"),
        } for n in negatifs],
    }

    html = _template().replace("__DATA__", json.dumps(data, ensure_ascii=False))
    out_dir = config.rayon_rapports_dir(rayon, jour)
    os.makedirs(out_dir, exist_ok=True)
    story_path = os.path.join(out_dir, "rapport_story.html")
    with open(story_path, "w", encoding="utf-8") as f:
        f.write(html)

    nao_dir = os.path.join(config.NAO_PROJECT_DIR, "docs", "rapports")
    os.makedirs(nao_dir, exist_ok=True)
    with open(os.path.join(nao_dir, f"rapport_story_{rayon}_{jour}.html"), "w", encoding="utf-8") as f:
        f.write(html)

    return story_path


def _template():
    return """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rapport Gamme — __TITRE__</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
:root{--bg:#0b1120;--panel:#111a2e;--panel2:#0f1830;--line:#1e2a45;--txt:#e2e8f0;--mut:#8ba3c7;
--bleu:#3b82f6;--rouge:#ef4444;--orange:#f59e0b;--vert:#22c55e;--violet:#8b5cf6;}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--txt);font-family:-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.55}
.wrap{max-width:1180px;margin:0 auto;padding:28px 20px 80px}
.hero{background:linear-gradient(135deg,#0f1f42 0%,#111a2e 55%,#1a1035 100%);border:1px solid var(--line);
border-radius:22px;padding:38px 34px;margin-bottom:26px;position:relative;overflow:hidden}
.hero::after{content:"";position:absolute;top:-120px;right:-80px;width:340px;height:340px;
background:radial-gradient(circle,rgba(59,130,246,.28),transparent 70%)}
.hero .tag{display:inline-block;background:rgba(59,130,246,.15);color:#93c5fd;border:1px solid rgba(59,130,246,.35);
border-radius:999px;padding:4px 14px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:14px}
.hero h1{font-size:30px;font-weight:800;margin-bottom:6px}
.hero .sub{color:var(--mut);font-size:15px}
.badge{display:inline-block;margin-top:12px;padding:5px 14px;border-radius:10px;font-size:13px;font-weight:600}
.badge.baseline{background:rgba(139,92,246,.18);color:#c4b5fd;border:1px solid rgba(139,92,246,.4)}
.badge.import{background:rgba(34,197,94,.14);color:#86efac;border:1px solid rgba(34,197,94,.4)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:26px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px 16px}
.kpi .n{font-size:30px;font-weight:800;line-height:1.1}
.kpi .l{color:var(--mut);font-size:12.5px;margin-top:4px;text-transform:uppercase;letter-spacing:.06em}
.kpi.rouge .n{color:var(--rouge)}.kpi.orange .n{color:var(--orange)}.kpi.vert .n{color:var(--vert)}
.kpi.bleu .n{color:var(--bleu)}.kpi.violet .n{color:var(--violet)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px}
.card h2{font-size:15px;margin-bottom:14px;color:#cbd5e1;display:flex;align-items:center;gap:8px}
.card h2::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--bleu);display:inline-block}
.card.full{grid-column:1/-1}
canvas{max-height:300px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{background:var(--panel2);color:var(--mut);text-align:left;padding:9px 10px;font-weight:600;letter-spacing:.04em}
td{border-top:1px solid var(--line);padding:8px 10px;vertical-align:top}
tr:hover td{background:rgba(59,130,246,.06)}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11.5px;font-weight:600}
.pil-critique{background:rgba(239,68,68,.16);color:#fca5a5}
.pil-important{background:rgba(245,158,11,.16);color:#fcd34d}
.pil-surveiller{background:rgba(139,92,246,.16);color:#c4b5fd}
.pil-vert{background:rgba(34,197,94,.16);color:#86efac}
.pil-jaune{background:rgba(245,158,11,.16);color:#fcd34d}
.pil-rouge{background:rgba(239,68,68,.16);color:#fca5a5}
.footer{margin-top:26px;color:#64748b;font-size:12.5px;text-align:center}
@media(max-width:860px){.grid{grid-template-columns:1fr}}
.story{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;margin-top:16px}
.story h2{font-size:15px;margin-bottom:10px;color:#cbd5e1}
.story .tl{position:relative;padding-left:22px}
.story .tl::before{content:"";position:absolute;left:6px;top:4px;bottom:4px;width:2px;background:var(--line)}
.story .tl div{position:relative;margin-bottom:12px}
.story .tl div::before{content:"";position:absolute;left:-22px;top:6px;width:10px;height:10px;border-radius:50%;background:var(--bleu)}
.story .tl div.ok::before{background:var(--vert)}
.story .tl div.ko::before{background:var(--rouge)}
.story .tl .t{font-weight:600;font-size:13.5px}
.story .tl .d{color:var(--mut);font-size:12.5px}
</style>
</head>
<body>
<div class="wrap">
<div class="hero">
<div class="tag" id="tag">Rapport quotidien</div>
<h1 id="title">—</h1>
<div class="sub" id="subtitle">—</div>
<div class="badge" id="badge"></div>
</div>
<div class="kpis" id="kpis"></div>
<div class="grid">
<div class="card"><h2>Répartition des stocks négatifs</h2><canvas id="cRepartition"></canvas></div>
<div class="card"><h2>Anomalies par type</h2><canvas id="cAnomalies"></canvas></div>
<div class="card"><h2>Top 10 négatifs — valeur bloquée (€)</h2><canvas id="cTop"></canvas></div>
<div class="card"><h2>Évolution des négatifs</h2><canvas id="cSerie"></canvas></div>
<div class="card full"><h2>Compensateurs proposés</h2><canvas id="cComp"></canvas></div>
<div class="card full" id="tableWrap"><h2>Détail complet</h2><div style="overflow-x:auto"><table id="tbl"></table></div></div>
<div class="story full" id="storyWrap">
<h2>Déroulé du jour</h2>
<div class="tl" id="timeline"></div>
</div>
</div>
<div class="footer">Généré automatiquement par gamme-engine · Rayon « <span id="rayonName"></span> » · <span id="footerDate"></span></div>
</div>
<script>
const D = __DATA__;
const $ = id => document.getElementById(id);
const fmt = (v) => v === null || v === undefined ? "—" : Number(v).toLocaleString("fr-FR");
const euro = (v) => v === null || v === undefined ? "—" : Number(v).toLocaleString("fr-FR",{style:"currency",currency:"EUR"});
const R = D.resume;
$("tag").textContent = R.libelle_rayon + " · Rapport quotidien";
$("title").textContent = "Rapport du " + R.jour.replace(/-/g, "/");
$("subtitle").textContent = (R.baseline ? "Import de référence (pas de comparaison J-1)" : "Import #" + R.nb_import + " · " + fmt(R.nb_articles) + " articles analysés") ;
$("badge").className = "badge " + (R.baseline ? "baseline" : "import");
$("badge").textContent = R.baseline ? "BASELINE — SNAPSHOT DE BASE" : "IMPORT TRAITÉ AUTOMATIQUEMENT";
$("rayonName").textContent = R.libelle_rayon;
$("footerDate").textContent = new Date().toLocaleDateString("fr-FR");
const kpis = [
  ["rouge", R.nouveaux, "Nouveaux négatifs"],
  ["orange", R.persistants, "Négatifs persistants"],
  ["vert", R.corriges, "Corrigés aujourd'hui"],
  ["violet", R.anomalies, "Anomalies détectées"],
  ["bleu", R.avec_compensateur, "Avec compensateur"],
  ["jaune", R.sans_compensateur, "Sans compensateur"],
];
$("kpis").innerHTML = kpis.map(([c,n,l]) => `<div class="kpi ${c}"><div class="n">${fmt(n)}</div><div class="l">${l}</div></div>`).join("");
new Chart($("cRepartition"),{type:"doughnut",data:{labels:["Nouveaux","Persistants"],datasets:[{data:[R.nouveaux,R.persistants],backgroundColor:["#ef4444","#f59e0b"],borderColor:"#111a2e",borderWidth:3}]},options:{plugins:{legend:{labels:{color:"#cbd5e1"}}}}});
const ta = D.types_anom; const tl = Object.keys(ta);
new Chart($("cAnomalies"),{type:"bar",data:{labels:tl.map(x=>x.replace(/_/g," ")),datasets:[{data:tl.map(x=>ta[x]),backgroundColor:"#8b5cf6"}]},options:{plugins:{legend:{display:false}},scales:{x:{ticks:{color:"#8ba3c7"}},y:{ticks:{color:"#8ba3c7"}}}}});
new Chart($("cTop"),{type:"bar",data:{labels:D.top_neg.map(t=>t.code),datasets:[{data:D.top_neg.map(t=>Math.round(t.valeur)),backgroundColor:"#ef4444"}]},options:{plugins:{legend:{display:false}},scales:{x:{ticks:{color:"#8ba3c7"}},y:{ticks:{color:"#8ba3c7"}}}}});
new Chart($("cSerie"),{type:"line",data:{labels:D.serie_jours.map(s=>s.jour.slice(5)),datasets:[
 {label:"Négatifs (hors corrigés)",data:D.serie_jours.map(s=>s.total),borderColor:"#f59e0b",backgroundColor:"rgba(245,158,11,.12)",fill:true,tension:.3},
 {label:"Critiques",data:D.serie_jours.map(s=>s.critiques),borderColor:"#ef4444",backgroundColor:"rgba(239,68,68,.1)",fill:true,tension:.3}]},
 options:{plugins:{legend:{labels:{color:"#cbd5e1"}}},scales:{x:{ticks:{color:"#8ba3c7"}},y:{ticks:{color:"#8ba3c7"}}}}});
const cmp = D.compens.slice(0,8);
new Chart($("cComp"),{type:"bar",data:{labels:cmp.map(c=>c.neg),datasets:[{data:cmp.map(c=>1),backgroundColor:cmp.map(c=>c.confiance==="fort"?"#22c55e":c.confiance==="moyen"?"#f59e0b":"#64748b")}]},options:{indexAxis:"y",plugins:{legend:{display:false}},scales:{x:{display:false},y:{ticks:{color:"#8ba3c7",font:{size:10}}}}}});
const rows = D.negatifs.map(n=>`<tr><td>${n.code}</td><td>${n.libelle||"—"}</td><td>${fmt(n.stock_j1)}</td><td><b>${fmt(n.stock_j)}</b></td><td>${fmt(n.variation)}</td><td>${euro(n.px_revient)}</td><td>${euro(n.px_vente)}</td><td>${n.couv??"—"}</td><td><span class="pill pil-${n.priorite}">${n.priorite}</span></td><td>${n.compensateur||"—"}</td><td><span class="pill ${n.confiance==="fort"?"pil-vert":n.confiance==="moyen"?"pil-jaune":n.confiance==="faible"?"pil-rouge":"pil-jaune"}">${n.confiance||"—"}</span></td><td style="max-width:220px">${n.justification||"—"}</td></tr>`).join("");
$("tbl").innerHTML = `<thead><tr><th>Code</th><th>Libellé</th><th>J-1</th><th>J</th><th>Δ</th><th>Px rev.</th><th>Px vente</th><th>COUV</th><th>Priorité</th><th>Compensateur</th><th>Confiance</th><th>Justification</th></tr></thead><tbody>${rows}</tbody>`;
const tlData = [
  ["Import du fichier reçu", "Fichier analysé et archivé automatiquement (" + fmt(R.nb_articles) + " articles).", "ok"],
  ["Comparaison avec J-1", R.baseline ? "Premier import : snapshot de base enregistré." : fmt(R.corriges) + " articles corrigés, " + fmt(R.nouveaux) + " nouveaux en rupture.", R.baseline?"ok":"ok"],
  ["Analyse LLM", R.baseline ? "Reportée au prochain import." : R.avec_compensateur + " compensateurs trouvés, " + R.sans_compensateur + " sans équivalent.", "ok"],
];
$("timeline").innerHTML = tlData.map(([t,d,c])=>`<div class="${c}"><div class="t">${t}</div><div class="d">${d}</div></div>`).join("");
</script>
</body>
</html>"""
