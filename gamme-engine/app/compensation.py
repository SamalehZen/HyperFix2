import json

from rapidfuzz import fuzz

from . import config
from . import llm
from .normalize import base_tokens, extract_format, normalize

SYSTEM_PROMPT = """Tu es un expert métier de la grande distribution. Ton travail : pour chaque article en stock négatif, évaluer les articles candidats proposés et sélectionner le ou les compensateurs pertinents (produits substituables que le magasin peut proposer ou commander à la place).

Règles strictes :
1. La similarité se juge sur le produit : nature, libellé, format/poids, caractéristiques communes. Deux libellés différents peuvent désigner des produits similaires (ex. « Emmental râpé 200g » ≈ « Emmental râpé marque Y 200g »).
2. COUV = 999 signifie stock dormant (aucun mouvement). Un candidat avec COUV = 999 est privilégié, mais JAMAIS uniquement pour cette raison : le produit doit d'abord être réellement similaire.
3. Un prix de revient proche renforce la pertinence mais ne prouve pas la similarité à lui seul.
4. N'attribue JAMAIS de confiance élevée en cas de doute.
5. Ne force JAMAIS de correspondance : si aucun candidat n'est suffisamment pertinent, indique "aucun_compensateur" avec la raison.
6. N'invente JAMAIS d'information absente des données fournies.
7. Réponds UNIQUEMENT avec un JSON valide, sans texte autour, au format :
{"articles": [{"code": <int>, "compensateurs": [{"code": <int>, "score": <int 0-100>, "confiance": "fort"|"moyen"|"faible", "justification": "<phrase courte en français>"}], "aucun_compensateur": <bool>, "raison_aucun": "<raison ou null>"}]}
Classe les compensateurs par score décroissant. Un seul compensateur par article est souvent suffisant."""


def prefilter(df, negative_codes, top_n=None):
    top_n = top_n or config.TOP_CANDIDATES
    records = df.to_dict("records")
    rows = []
    for d in records:
        code = d.get("Code")
        if code in negative_codes:
            continue
        rows.append({
            "code": code,
            "libelle": d.get("Libellé"),
            "format": extract_format(d.get("Libellé")),
            "px_revient": to_float(d.get("Px revient")),
            "px_vente": to_float(d.get("Px vente")),
            "couv": to_float(d.get("Couv. ")),
            "stock": to_float(d.get("Stock")),
            "tokens": set(base_tokens(d.get("Libellé"))),
        })

    neg_info = {}
    for d in records:
        if d.get("Code") in negative_codes:
            neg_info[d["Code"]] = {
                "libelle": d.get("Libellé"),
                "format": extract_format(d.get("Libellé")),
                "px_revient": to_float(d.get("Px revient")),
                "px_vente": to_float(d.get("Px vente")),
                "couv": to_float(d.get("Couv. ")),
                "stock": to_float(d.get("Stock")),
                "tokens": set(base_tokens(d.get("Libellé"))),
            }

    out = {}
    for code in negative_codes:
        n = neg_info[code]
        scored = []
        for c in rows:
            if c["code"] == code:
                continue
            s = score_candidate(n, c)
            scored.append(s)
        scored.sort(key=lambda x: x["score"], reverse=True)
        out[code] = scored[:top_n]
    return out, neg_info


def to_float(v):
    if v is None:
        return None
    try:
        f = float(v)
        return None if f != f else f
    except (TypeError, ValueError):
        return None


def score_candidate(neg, cand):
    score = 0.0
    tokens_neg, tokens_cand = neg["tokens"], cand["tokens"]
    if tokens_neg and tokens_cand:
        inter = len(tokens_neg & tokens_cand)
        union = len(tokens_neg | tokens_cand)
        jaccard = inter / union if union else 0.0
        score += jaccard * 60
        text_ratio = fuzz.token_sort_ratio(str(neg["libelle"]), str(cand["libelle"])) / 100
        score += text_ratio * 20
    if neg["format"] and neg["format"] == cand["format"]:
        score += 10
    elif neg["format"] and cand["format"]:
        score += 4
    if neg["px_revient"] and cand["px_revient"] and neg["px_revient"] > 0:
        ratio = abs(neg["px_revient"] - cand["px_revient"]) / neg["px_revient"]
        if ratio <= 0.10:
            score += 10
        elif ratio <= 0.25:
            score += 6
    return {
        "code": cand["code"], "libelle": cand["libelle"],
        "format": cand["format"], "px_revient": cand["px_revient"],
        "px_vente": cand["px_vente"], "couv": cand["couv"], "stock": cand["stock"],
        "score": round(score, 1),
    }


def compensateur_heuristique(df, code_negatif):
    """Repli sans LLM : meilleur candidat du scoring heuristique (Jaccard +
    format + prix). Renvoie un dict compensateur (confiance 'faible') si le
    score atteint FALLBACK_SCORE_SEUIL, sinon None."""
    candidates, _neg_info = prefilter(df, [code_negatif])
    cands = candidates.get(code_negatif, [])
    if not cands:
        return None
    best = cands[0]
    if best["score"] < config.FALLBACK_SCORE_SEUIL:
        return None
    return {
        "code": best["code"],
        "libelle": best["libelle"],
        "px_revient": best["px_revient"],
        "px_vente": best["px_vente"],
        "couv": best["couv"],
        "stock": best["stock"],
        "score": best["score"],
        "confiance": "faible",
        "justification": "Compensateur heuristique (similarité libellé/format/prix) — LLM indisponible",
    }


def compensate(df, negative_codes, negative_libelles=None):
    """Analyse LLM des compensateurs. Retourne (results, errors, failed_codes) :
    - results     : {code_negatif: [compensateurs...]} (chunks de 8 articles) ;
    - errors      : liste de messages pour les lots sans réponse exploitable —
      remontés comme llm_error dans le résumé (visibles dans le dashboard),
      jamais confondus avec « aucun compensateur trouvé » ;
    - failed_codes: ensemble des codes dont le lot LLM a échoué (à traiter
      par compensateur_heuristique)."""
    candidates, neg_info = prefilter(df, negative_codes)
    lib_map = {d["Code"]: d.get("Libellé") for d in df.to_dict("records") if d["Code"] not in negative_codes}
    for code in negative_codes:
        for cand in candidates[code]:
            cand["libelle"] = lib_map.get(cand["code"])

    results = {}
    errors = []
    failed_codes = set()
    chunks = [negative_codes[i:i + 8] for i in range(0, len(negative_codes), 8)]
    for chunk in chunks:
        payload = []
        for code in chunk:
            n = neg_info[code]
            payload.append({
                "code": code,
                "libelle": n["libelle"],
                "format": n["format"],
                "stock": n["stock"],
                "px_revient": n["px_revient"],
                "px_vente": n["px_vente"],
                "couv": n["couv"],
                "candidats": [
                    {"code": c["code"], "libelle": c["libelle"], "format": c["format"],
                     "px_revient": c["px_revient"], "px_vente": c["px_vente"],
                     "couv": c["couv"], "stock": c["stock"]}
                    for c in candidates[code]
                ],
            })
        user_msg = json.dumps({"articles": payload}, ensure_ascii=False)
        try:
            content = llm.chat_completion([
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ])
        except Exception as e:
            errors.append(f"lot {chunk}: {e}")
            failed_codes.update(chunk)
            for code in chunk:
                results[code] = []
            continue
        parsed = llm.parse_json(content)
        if not parsed or "articles" not in parsed:
            errors.append(f"lot {chunk}: réponse LLM non parsable")
            failed_codes.update(chunk)
            for code in chunk:
                results[code] = []
            continue
        for art in parsed["articles"]:
            code = art.get("code")
            if code not in chunk:
                continue
            out = []
            if not art.get("aucun_compensateur"):
                for c in art.get("compensateurs", []) or []:
                    cand = next((x for x in candidates[code] if x["code"] == c.get("code")), None)
                    if cand is None:
                        continue
                    out.append({
                        "code": cand["code"],
                        "libelle": cand["libelle"],
                        "px_revient": cand["px_revient"],
                        "px_vente": cand["px_vente"],
                        "couv": cand["couv"],
                        "stock": cand["stock"],
                        "score": c.get("score"),
                        "confiance": c.get("confiance"),
                        "justification": c.get("justification"),
                    })
                out.sort(key=lambda x: x.get("score") or 0, reverse=True)
            else:
                out = [{"code": None, "libelle": None, "px_revient": None, "px_vente": None,
                        "couv": None, "score": None, "confiance": "aucun",
                        "justification": art.get("raison_aucun") or "Aucun compensateur trouvé"}]
            results[code] = out
    return results, errors, failed_codes