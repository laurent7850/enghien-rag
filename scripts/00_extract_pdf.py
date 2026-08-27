"""
Etape 0 du pipeline de digitalisation : PDF -> texte normalise.

Convertit un PDF a couche texte (OCR ABBYY) vers le format brut attendu par
scripts/01_clean_and_chunk.ts :

    - "- 24 -"              marqueur de page (folio imprime, pas l'index PDF)
    - "LIVRE I"             partie de premier niveau
    - "CHAPITRE III"        chapitre
    - "SS 1. - TITRE"       section

Le decoupage typographique s'appuie sur la taille de police et la position
verticale des lignes, seuls signaux fiables pour separer corps de texte,
titres, folios et notes de bas de page.

Usage : py -3 scripts/00_extract_pdf.py <ouvrage_id>
"""

import json
import os
import re
import sys
import unicodedata

import fitz  # PyMuPDF

# ---------------------------------------------------------------------------
# Configuration par ouvrage
# ---------------------------------------------------------------------------

OUVRAGES = {
    "reygaerts-1998-t1": {
        "pdf": "Géographie Historique d'Enghien T1 reconnu.pdf",
        "titre": "La région d'Enghien — Une géographie historique, une histoire urbaine",
        "auteur": "Jacques Reygaerts",
        "annee": 1998,
        "tome": 1,
        # Taille de police du corps de texte, en points.
        "body_size": 12,
        # En deca de ce nombre de caracteres de corps, la page est consideree
        # comme une planche (figure pleine page) et ecartee.
        "min_body_chars": 200,
        # Pages PDF a exclure explicitement (couvertures, faux-titres).
        "skip_pages": [1, 2, 3, 4, 5, 6],
        # La table des matieres finale duplique la structure : inutile au RAG.
        "stop_at_toc": True,
        "livres": {
            "PREMIER": ("I", "Géographie historique des temps anciens"),
            "DEUXIEME": ("II", "Géographie physique et histoire urbaine"),
            "TROISIEME": ("III", "Géographie humaine et histoire d'Enghien"),
        },
        # Corrections OCR appliquees aux seuls titres. Un chiffre romain mal
        # reconnu fait perdre tout un chapitre a l'indexation, d'ou ce garde-fou
        # cible plutot qu'une correction globale du texte (trop risquee).
        "heading_corrections": {
            "Xin. DE HAINAUT": "XIII. DE HAINAUT",
            "LES DEUX ENGHDEN": "LES DEUX ENGHIEN",
            "MOTTE SEIGEURIALE": "MOTTE SEIGNEURIALE",
            "TOPOGRAHIE HISTORIQUE": "TOPOGRAPHIE HISTORIQUE",
            "HEDEGEM, LE": "HEDEGHEM, LE",
        },
    },
}

# ---------------------------------------------------------------------------
# Detection typographique
# ---------------------------------------------------------------------------

# Le folio imprime : nombre seul, en haut de page, dans une police plus petite
# que le corps.
FOLIO_MAX_Y_RATIO = 0.08
FOLIO_RE = re.compile(r"^(\d{1,3})$")

# Les notes de bas de page : police nettement plus petite, en bas de page.
FOOTNOTE_MAX_SIZE = 8
FOOTNOTE_MIN_Y_RATIO = 0.78
FOOTNOTE_START_RE = re.compile(r"^(\d{1,3})\s*(bis|ter)?\s+\S")

LIVRE_RE = re.compile(r"^LIVRE\s+(PREMIER|DEUXIEME|TROISIEME)\b\.?\s*(.*)$")
CHAPITRE_RE = re.compile(r"^([IVXL]{1,6})\s*\.\s*(.+)$")
SECTION_RE = re.compile(r"^(\d{1,2})\s*\.\s*(.+)$")
# Sections alphabetiques : "A. LES PORTES", "B. LES DROITS SEIGNEURIAUX"
SECTION_ALPHA_RE = re.compile(r"^([A-F])\s*\.\s*(.+)$")


def uppercase_ratio(text):
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return 0.0
    return sum(1 for c in letters if c.isupper()) / len(letters)


def strip_accents(text):
    return "".join(
        c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn"
    )


def read_lines(page):
    """Retourne les lignes de la page, triees par position verticale.

    PyMuPDF restitue les blocs dans l'ordre du flux PDF, qui place souvent les
    notes de bas de page avant la suite du corps. Sans ce tri, les notes
    s'inserent au milieu des phrases.
    """
    lines = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            spans = line["spans"]
            text = "".join(s["text"] for s in spans).strip()
            if not text:
                continue
            lines.append(
                {
                    "text": re.sub(r"[ \t]+", " ", text),
                    "size": round(max(s["size"] for s in spans)),
                    "bold": any("bold" in s["font"].lower() for s in spans),
                    "y": line["bbox"][1],
                    "x": line["bbox"][0],
                }
            )
    lines.sort(key=lambda l: (round(l["y"], 1), l["x"]))
    return lines


def classify_page(lines, height, cfg):
    """Separe folio, notes de bas de page et corps de texte."""
    folio = None
    body, notes = [], []
    body_size = cfg["body_size"]

    for line in lines:
        y_ratio = line["y"] / height
        text = line["text"]

        if folio is None and y_ratio < FOLIO_MAX_Y_RATIO and line["size"] < body_size:
            m = FOLIO_RE.match(text)
            if m:
                folio = int(m.group(1))
                continue

        is_small = line["size"] <= FOOTNOTE_MAX_SIZE
        is_low = y_ratio >= FOOTNOTE_MIN_Y_RATIO
        # Une note commence par son numero d'appel ; les lignes suivantes de la
        # meme note sont simplement petites et basses.
        if is_small or (is_low and line["size"] < body_size and FOOTNOTE_START_RE.match(text)):
            notes.append(text)
            continue
        if is_low and notes and line["size"] < body_size:
            notes.append(text)
            continue

        body.append(line)

    return folio, body, notes


def heading_kind(line, cfg):
    """Identifie un titre et le normalise vers les marqueurs du chunker."""
    text = line["text"]
    if not line["bold"]:
        return None
    if uppercase_ratio(text) < 0.9:
        return None
    if len(text) < 4:
        return None

    for wrong, right in cfg.get("heading_corrections", {}).items():
        if text.startswith(wrong):
            text = right + text[len(wrong):]
            break

    flat = strip_accents(text).upper()

    m = LIVRE_RE.match(flat)
    if m:
        num, titre = cfg["livres"].get(m.group(1), (None, ""))
        if num:
            return ("livre", "LIVRE " + num, titre)

    m = CHAPITRE_RE.match(text)
    if m and len(m.group(2).strip()) > 3:
        return ("chapitre", "CHAPITRE " + m.group(1), m.group(2).strip())

    m = SECTION_RE.match(text)
    if m:
        return ("section", "§ {}. — {}".format(m.group(1), m.group(2).strip()), "")

    m = SECTION_ALPHA_RE.match(text)
    if m:
        return ("section", "§ {}. — {}".format(m.group(1), m.group(2).strip()), "")

    return ("titre", text, "")


# ---------------------------------------------------------------------------

def main():
    ouvrage_id = sys.argv[1] if len(sys.argv) > 1 else "reygaerts-1998-t1"
    cfg = OUVRAGES[ouvrage_id]

    pdf_path = os.path.join(os.path.expanduser("~"), "Downloads", cfg["pdf"])
    if not os.path.exists(pdf_path):
        sys.exit("PDF introuvable : " + pdf_path)

    doc = fitz.open(pdf_path)
    print("Ouvrage : " + cfg["titre"])
    print("Auteur  : {} ({}), tome {}".format(cfg["auteur"], cfg["annee"], cfg["tome"]))
    print("Pages   : {}\n".format(doc.page_count))

    out, all_notes = [], []
    stats = {"texte": 0, "planches": 0, "vides": 0, "sans_folio": 0, "notes": 0}
    structure = []
    last_folio = 0

    for index in range(doc.page_count):
        pdf_page = index + 1
        if pdf_page in cfg["skip_pages"]:
            continue

        page = doc[index]
        lines = read_lines(page)
        if not lines:
            stats["vides"] += 1
            continue

        folio, body, notes = classify_page(lines, page.rect.height, cfg)
        body_chars = sum(len(l["text"]) for l in body if l["size"] >= cfg["body_size"])

        if body_chars < cfg["min_body_chars"]:
            stats["planches"] += 1
            continue

        if cfg["stop_at_toc"] and any(
            strip_accents(l["text"]).upper().startswith("TABLE DES MATIERES") for l in body
        ):
            print("Table des matieres atteinte page PDF {} : arret.".format(pdf_page))
            break

        if folio is None:
            folio = last_folio + 1
            stats["sans_folio"] += 1
        last_folio = folio

        out.append("— {} —".format(folio))
        for line in body:
            kind = heading_kind(line, cfg)
            if kind:
                type_, marker, titre = kind
                out.append("")
                out.append(marker if not titre else "{}. {}".format(marker, titre))
                out.append("")
                structure.append(
                    {"type": type_, "marker": marker, "titre": titre, "page": folio}
                )
            else:
                out.append(line["text"])
        out.append("")

        if notes:
            all_notes.append({"page": folio, "notes": notes})
            stats["notes"] += len(notes)
        stats["texte"] += 1

    text = "\n".join(out)
    # Un paragraphe se termine par une ponctuation forte ; les retours a la
    # ligne internes au PDF ne sont que des fins de ligne typographiques.
    text = re.sub(r"(?<=[a-zà-ÿ,;:'’\-])\n(?=[a-zà-ÿ])", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    os.makedirs(base, exist_ok=True)
    txt_path = os.path.join(base, ouvrage_id + "_fulltext.txt")
    with open(txt_path, "w", encoding="utf-8") as fh:
        fh.write(text)
    with open(os.path.join(base, ouvrage_id + "_notes.json"), "w", encoding="utf-8") as fh:
        json.dump(all_notes, fh, ensure_ascii=False, indent=2)
    with open(os.path.join(base, ouvrage_id + "_structure.json"), "w", encoding="utf-8") as fh:
        json.dump(structure, fh, ensure_ascii=False, indent=2)

    print("Pages de texte      : {}".format(stats["texte"]))
    print("Planches ecartees   : {}".format(stats["planches"]))
    print("Pages vides         : {}".format(stats["vides"]))
    print("Folios reconstruits : {}".format(stats["sans_folio"]))
    print("Notes extraites     : {}".format(stats["notes"]))
    print("Titres detectes     : {}".format(len(structure)))
    print("\nTexte : {} ({:,} caracteres)".format(txt_path, len(text)))


if __name__ == "__main__":
    main()
