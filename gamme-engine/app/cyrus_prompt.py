# Prompt de classification des articles selon la structure hiérarchique du magasin.
# Le LLM renvoie UNIQUEMENT un JSON contraint (codes numériques), validé ensuite
# contre la hiérarchie officielle (hierarchy.py). Jamais de markdown libre.

import os

_HIERARCHY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "store_hierarchy.txt")


def load_hierarchy_text() -> str:
    try:
        with open(_HIERARCHY_PATH, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


CLASSIFICATION_HIERARCHY = load_hierarchy_text()

CYRUS_PROMPT = """Tu es un expert en classification et structuration d'articles de grande distribution.

Tu reçois une liste d'articles. Pour CHAQUE article, tu dois l'assigner à la branche la plus précise de la hiérarchie officielle du magasin fournie ci-dessous (secteur → rayon → famille → sous-famille).

RÈGLES STRICTES :
1. Utilise UNIQUEMENT les codes numériques présents dans la hiérarchie officielle. N'invente JAMAIS un code.
2. Chaque combinaison (secteur, rayon, famille, sous_famille) doit exister exactement dans l'arbre fourni.
3. Si l'article ne correspond clairement à aucune sous-famille, choisis la famille la plus proche et mets sous_famille à null (ou à la sous-famille la plus pertinente).
4. Si l'article est ambigu, choisis la classification la plus probable et justifie brièvement dans 'justification'.
5. Si l'article n'a AUCUNE correspondance plausible dans toute la hiérarchie, renvoie tous les champs hiérarchiques à null et 'classe' = false.
6. Sois 100% cohérent : même type d'article = même classification.

Hiérarchie officielle (codes + libellés exacts, indentation = profondeur) :
------
{hiérarchie}
------

FORMAT DE RÉPONSE : renvoie UNIQUEMENT un objet JSON valide, sans texte autour :
{{"articles": [
  {{"libelle": "<libellé original exact>", "secteur": "<numéro secteur>", "rayon": "<numéro rayon>", "famille": "<numéro famille>", "sous_famille": "<code sous-famille ou null>", "classe": true, "justification": "<courte>"}}
]}}

Les champs 'secteur', 'rayon', 'famille' sont les NUMÉROS (ex: "01", "010", "101"). 'sous_famille' est le code numérique de la sous-famille (ex: "101"). 'classe' vaut true si une classification valide a été trouvée, false sinon. 'justification' est une phrase courte expliquant le choix (surtout en cas d'ambiguïté ou de doute)."""


def build_cyrus_prompt():
    return CYRUS_PROMPT.format(hiérarchie=CLASSIFICATION_HIERARCHY)
