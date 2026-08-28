"""Comparatif OCR sur echantillon avant de traiter un volume entier.

Teste les deux voies documentees dans docs/DIGITALISATION.md §2 :
  A. plugin file-parser d'OpenRouter (engine cloudflare-ai, gratuit)
  B. modele vision page par page (le format de sortie est impose par le prompt)

Usage : py -3 scripts/ocr_test.py
Requiert OPENROUTER_API_KEY dans l'environnement (jamais en dur).
"""

import base64
import json
import os
import sys
import urllib.request

API_KEY = os.environ.get("OPENROUTER_API_KEY")
if not API_KEY:
    sys.exit("OPENROUTER_API_KEY absente de l'environnement")

URL = "https://openrouter.ai/api/v1/chat/completions"
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


def call(payload):
    req = urllib.request.Request(
        URL,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": "Bearer " + API_KEY,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Enghien RAG OCR test",
        },
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)


def test_file_parser():
    print("=" * 70)
    print("A. file-parser / cloudflare-ai (gratuit)")
    print("=" * 70)
    with open(os.path.join(DATA, "jadis_sample.pdf"), "rb") as fh:
        b64 = base64.b64encode(fh.read()).decode()
    resp = call(
        {
            "model": "google/gemini-3.7-flash",
            "plugins": [{"id": "file-parser", "pdf": {"engine": "cloudflare-ai"}}],
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "file",
                            "file": {
                                "filename": "jadis_sample.pdf",
                                "file_data": "data:application/pdf;base64," + b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": "Recopie fidelement et integralement le texte de ce document, sans commentaire.",
                        },
                    ],
                }
            ],
        }
    )
    msg = resp["choices"][0]["message"]
    print(msg.get("content", "")[:1500])
    print("\n[usage]", resp.get("usage"))


PROMPT_VISION = """Transcris fidèlement et intégralement le texte de cette page de livre imprimé en français (1967).

Règles strictes :
- Restitue le texte exactement, accents et ponctuation compris. N'invente rien, ne résume rien.
- Le numéro de page imprimé (en bas, du type « — 17 — ») : reproduis-le seul sur sa dernière ligne, au format « — 17 — ».
- Les notes de bas de page (numérotées (1), (2)…) : place-les à la fin, chacune sur sa ligne, précédées de la ligne « NOTES: ».
- Un titre centré : seul sur sa ligne.
- Sépare les paragraphes par une ligne vide. Ne coupe pas les mots en fin de ligne : recolle les césures.
- Réponds uniquement avec la transcription, sans commentaire."""


def test_vision():
    print("\n" + "=" * 70)
    print("B. vision google/gemini-3.7-flash, page par page")
    print("=" * 70)
    for pno in (5, 21, 91):
        with open(os.path.join(DATA, "jadis_ocr_p{}.png".format(pno)), "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode()
        resp = call(
            {
                "model": "google/gemini-3.7-flash",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": "data:image/png;base64," + b64},
                            },
                            {"type": "text", "text": PROMPT_VISION},
                        ],
                    }
                ],
            }
        )
        msg = resp["choices"][0]["message"]["content"]
        print("\n----- page PDF {} -----".format(pno))
        print(msg[:900])
        print("[usage]", resp.get("usage"))


if __name__ == "__main__":
    try:
        test_file_parser()
    except Exception as exc:  # comparer quand meme la voie B
        print("file-parser en echec :", exc)
    test_vision()
