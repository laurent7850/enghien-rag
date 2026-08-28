"""
Etape 0 (variante OCR) : PDF scanne SANS couche texte -> texte normalise.

Pour les volumes jamais oceanises (ex. scan ScanSnap brut), la voie vision
documentee dans docs/DIGITALISATION.md §2c : chaque page est rendue en image
puis transcrite par un modele vision via OpenRouter, avec le format de sortie
du pipeline impose directement dans le prompt (folio « — n — », titres, notes).

Chaque page transcrite est mise en cache sur disque (data/<id>_ocr/pNNN.txt) :
une reprise apres interruption ne repaye que les pages manquantes.

Usage : py -3 scripts/00b_ocr_vision.py <ouvrage_id> [--assemble-only]
Requiert OPENROUTER_API_KEY dans l'environnement.
"""

import base64
import concurrent.futures
import json
import os
import re
import sys
import time
import urllib.request

import fitz  # PyMuPDF

# ---------------------------------------------------------------------------

OUVRAGES = {
    "godet-1967": {
        "pdf": "Jadis à Petit-Enghien.pdf",
        "titre": "Jadis à Petit-Enghien, ou prospection dans le passé de ce village",
        "auteur": "Jean Godet",
        "annee": 1967,
        # Couvertures et pages de garde ; la fin du PDF est la couverture arriere.
        "skip_pages": [1, 2, 3, 180],
        "dpi": 150,
        "model": "google/gemini-3.7-flash",
        # Une page dont la transcription est plus courte est une page blanche
        # ou une pleine page d'illustration.
        "min_chars": 60,
    },
}

MODEL_FALLBACK_DELAY = 10
MAX_RETRIES = 4
WORKERS = 6

PROMPT = """Transcris fidèlement et intégralement le texte de cette page de livre imprimé en français (1967).

Règles strictes :
- Restitue le texte exactement, accents et ponctuation compris. N'invente rien, ne résume rien, ne commente pas.
- Le numéro de page imprimé (en bas, du type « — 17 — ») : reproduis-le seul sur sa dernière ligne, au format « — 17 — ».
- Les notes de bas de page (numérotées (1), (2)…) : regroupe-les à la fin, chacune sur sa ligne, précédées d'une ligne « NOTES: ».
- Une ligne de titre (centrée, détachée du texte, souvent en capitales) : mets-la seule sur sa ligne, préfixée par « TITRE: ».
- Sépare les paragraphes par une ligne vide. Recolle les mots coupés par une césure en fin de ligne.
- Si la page est blanche ou ne contient qu'une image sans texte, réponds exactement « [PAGE SANS TEXTE] »."""

API_KEY = os.environ.get("OPENROUTER_API_KEY")
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

FOLIO_RE = re.compile(r"^[—\-–]\s*(\d{1,3})\s*[—\-–]\s*$")
FOLIO_MAX_JUMP = 15


def call_model(model, png_bytes):
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": "data:image/png;base64,"
                            + base64.b64encode(png_bytes).decode()
                        },
                    },
                    {"type": "text", "text": PROMPT},
                ],
            }
        ],
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": "Bearer " + API_KEY,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Enghien RAG OCR",
        },
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        resp = json.load(r)
    choices = resp.get("choices")
    if not choices:
        raise RuntimeError("reponse sans choices: " + json.dumps(resp)[:200])
    usage = resp.get("usage", {})
    return choices[0]["message"]["content"], usage.get("cost", 0)


def ocr_page(cfg, doc, index, cache_dir):
    """Transcrit une page (avec cache disque et retries)."""
    path = os.path.join(cache_dir, "p{:03d}.txt".format(index + 1))
    if os.path.exists(path):
        return path, 0.0, True
    png = doc[index].get_pixmap(dpi=cfg["dpi"]).tobytes("png")
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            text, cost = call_model(cfg["model"], png)
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(text)
            return path, cost, False
        except Exception as exc:  # rate limit, reseau : on retente
            last_error = exc
            time.sleep(MODEL_FALLBACK_DELAY * (attempt + 1))
    raise RuntimeError("page {}: {}".format(index + 1, last_error))


def assemble(ouvrage_id, cfg, cache_dir, page_indices):
    """Assemble les transcriptions au format du contrat de sortie."""
    out, all_notes, structure = [], [], []
    stats = {"texte": 0, "vides": 0, "sans_folio": 0, "rejetes": 0}
    last_folio = 0
    last_observed = 0
    pending = None
    article = 0

    for index in page_indices:
        path = os.path.join(cache_dir, "p{:03d}.txt".format(index + 1))
        raw = open(path, encoding="utf-8").read().strip()
        if not raw or "[PAGE SANS TEXTE]" in raw or len(raw) < cfg["min_chars"]:
            stats["vides"] += 1
            continue

        lines = raw.split("\n")

        # Folio : la ligne « — n — » ou qu'elle soit (le modele la met en fin
        # de transcription, avant ou apres les notes selon les pages).
        folio = None
        body_lines = []
        notes = []
        in_notes = False
        for line in lines:
            s = line.strip()
            m = FOLIO_RE.match(s)
            if m:
                folio = int(m.group(1))
                continue
            if s.upper().startswith("NOTES:"):
                in_notes = True
                reste = s[6:].strip()
                if reste:
                    notes.append(reste)
                continue
            if in_notes:
                if s:
                    notes.append(s)
                continue
            body_lines.append(line)

        # Memes garde-fous que 00_extract_pdf.py : un folio ne regresse pas et
        # ne saute pas des dizaines de pages (parasites), resynchronisation sur
        # deux valeurs consecutives.
        if folio is not None and last_observed:
            suspect = folio < last_observed or folio - last_folio > FOLIO_MAX_JUMP
            if suspect:
                if pending is not None and abs(folio - (pending + 1)) <= 1:
                    last_observed = folio
                    pending = None
                else:
                    pending = folio
                    stats["rejetes"] += 1
                    folio = None
            else:
                pending = None
        if folio is None:
            folio = last_folio + 1
            stats["sans_folio"] += 1
        else:
            last_observed = folio
        last_folio = folio

        out.append("— {} —".format(folio))
        for line in body_lines:
            s = line.strip()
            if s.upper().startswith("TITRE:"):
                titre = s[6:].strip(" .~-")
                if len(titre) >= 4:
                    article += 1
                    marker = "§ {}. — {}".format(article, titre)
                    out.extend(["", marker, ""])
                    structure.append(
                        {"type": "section", "marker": marker, "titre": "", "page": folio}
                    )
                continue
            out.append(line)
        out.append("")

        if notes:
            all_notes.append({"page": folio, "notes": notes})
        stats["texte"] += 1

    text = "\n".join(out)
    text = re.sub(r"\n{3,}", "\n\n", text)

    txt_path = os.path.join(DATA, ouvrage_id + "_fulltext.txt")
    with open(txt_path, "w", encoding="utf-8") as fh:
        fh.write(text)
    with open(os.path.join(DATA, ouvrage_id + "_notes.json"), "w", encoding="utf-8") as fh:
        json.dump(all_notes, fh, ensure_ascii=False, indent=2)
    with open(os.path.join(DATA, ouvrage_id + "_structure.json"), "w", encoding="utf-8") as fh:
        json.dump(structure, fh, ensure_ascii=False, indent=2)

    print("Pages de texte      : {}".format(stats["texte"]))
    print("Pages vides/images  : {}".format(stats["vides"]))
    print("Folios reconstruits : {}".format(stats["sans_folio"]))
    print("Folios rejetes      : {}".format(stats["rejetes"]))
    print("Titres detectes     : {}".format(len(structure)))
    print("Notes (pages)       : {}".format(len(all_notes)))
    print("\nTexte : {} ({:,} caracteres)".format(txt_path, len(text)))


def main():
    ouvrage_id = sys.argv[1] if len(sys.argv) > 1 else "godet-1967"
    assemble_only = "--assemble-only" in sys.argv
    cfg = OUVRAGES[ouvrage_id]

    pdf_path = os.path.join(os.path.expanduser("~"), "Downloads", cfg["pdf"])
    doc = fitz.open(pdf_path)
    skip = set(cfg["skip_pages"])
    page_indices = [i for i in range(doc.page_count) if i + 1 not in skip]

    cache_dir = os.path.join(DATA, ouvrage_id + "_ocr")
    os.makedirs(cache_dir, exist_ok=True)

    print("Ouvrage : {} — {} ({})".format(cfg["titre"], cfg["auteur"], cfg["annee"]))
    print("Pages a traiter : {} / {} (cache : {})\n".format(
        len(page_indices), doc.page_count,
        sum(1 for i in page_indices
            if os.path.exists(os.path.join(cache_dir, "p{:03d}.txt".format(i + 1))))))

    if not assemble_only:
        if not API_KEY:
            sys.exit("OPENROUTER_API_KEY absente de l'environnement")
        total_cost = 0.0
        done = 0
        errors = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futures = {
                pool.submit(ocr_page, cfg, doc, i, cache_dir): i for i in page_indices
            }
            for fut in concurrent.futures.as_completed(futures):
                i = futures[fut]
                try:
                    _, cost, cached = fut.result()
                    total_cost += cost
                    done += 1
                    if done % 20 == 0 or done == len(page_indices):
                        print("  {}/{} pages — cout cumule {:.3f} $".format(
                            done, len(page_indices), total_cost))
                except Exception as exc:
                    errors.append((i + 1, str(exc)[:80]))
        if errors:
            print("\nPages en echec ({}) :".format(len(errors)))
            for p, e in errors[:10]:
                print("  p{} : {}".format(p, e))
            sys.exit("Relancer le script : seules les pages manquantes seront retraitees.")
        print("\nOCR termine — cout total {:.3f} $\n".format(total_cost))

    assemble(ouvrage_id, cfg, cache_dir, page_indices)


if __name__ == "__main__":
    main()
