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
        "min_body_chars_sans_folio": 1200,
        # Pages PDF a exclure explicitement (couvertures, faux-titres).
        "skip_pages": [1, 2, 3, 4, 5, 6],
        # La table des matieres finale duplique la structure : inutile au RAG.
        # Pas d'"ICONOGRAPHIE" ici : contrairement au tome 2, le mot apparait
        # en plein corps de ce volume.
        "stop_at_headings": ["TABLE DES MATIERES"],
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

    "cahiers-pe-t1": {
        "pdf": "Cahier de Petit enghien T I HR.pdf",
        "titre": "Les Cahiers de Petit-Enghien",
        "auteur": "Union des groupements patriotiques de Petit-Enghien",
        "annee": 1996,
        "tome": 1,
        # Album de memoire villageoise : prose, photos legendees, fac-similes.
        # Corps en 10-12 pt selon les pages, titres d'articles a partir de 13.
        "body_size": 10,
        "heading_min_size": 13,
        "min_body_chars": 200,
        # Les pages sans folio sont surtout des pleines pages de photos.
        "min_body_chars_sans_folio": 600,
        "skip_pages": [1, 2, 3],
        "stop_at_headings": [],
        # Pas de LIVRE/CHAPITRE : des articles a titres libres.
        "structure": "articles",
        "livres": {},
        # Le folio est imprime en bas de page, pas en tete.
        "folio_position": "bottom",
        # Pas de notes de bas de page ; le petit corps est celui des legendes
        # de photos, qui sont du contenu a conserver.
        "footnotes": False,
        # OCR mediocre sur les zones de photos : filtrer les lignes de bruit.
        "filter_noise": True,
        # Pages de reclames et de documents manuscrits scannes : ecartees.
        "max_junk_ratio": 0.28,
        "heading_corrections": {},
    },
    "cahiers-pe-t2": {
        "pdf": "Cahier de Petit-Enghien T II HR.pdf",
        "titre": "Les Cahiers de Petit-Enghien",
        "auteur": "Union des groupements patriotiques de Petit-Enghien",
        "annee": 1998,  # estimation : entre T1 (1996) et T3 (2001), aucune date dans le volume,
        "tome": 2,
        # Album de memoire villageoise : prose, photos legendees, fac-similes.
        # Corps en 10-12 pt selon les pages, titres d'articles a partir de 13.
        "body_size": 10,
        "heading_min_size": 13,
        "min_body_chars": 200,
        # Les pages sans folio sont surtout des pleines pages de photos.
        "min_body_chars_sans_folio": 600,
        "skip_pages": [1, 2, 3],
        "stop_at_headings": [],
        # Pas de LIVRE/CHAPITRE : des articles a titres libres.
        "structure": "articles",
        "livres": {},
        # Le folio est imprime en bas de page, pas en tete.
        "folio_position": "bottom",
        # Pas de notes de bas de page ; le petit corps est celui des legendes
        # de photos, qui sont du contenu a conserver.
        "footnotes": False,
        # OCR mediocre sur les zones de photos : filtrer les lignes de bruit.
        "filter_noise": True,
        # Pages de reclames et de documents manuscrits scannes : ecartees.
        "max_junk_ratio": 0.28,
        "heading_corrections": {},
    },
    "cahiers-pe-t3": {
        "pdf": "Cahier de Petit-Enghien T III.pdf",
        "titre": "Les Cahiers de Petit-Enghien",
        "auteur": "Union des groupements patriotiques de Petit-Enghien",
        "annee": 2001,
        "tome": 3,
        # Album de memoire villageoise : prose, photos legendees, fac-similes.
        # Corps en 10-12 pt selon les pages, titres d'articles a partir de 13.
        "body_size": 10,
        "heading_min_size": 13,
        "min_body_chars": 200,
        # Les pages sans folio sont surtout des pleines pages de photos.
        "min_body_chars_sans_folio": 600,
        "skip_pages": [1, 2, 3],
        "stop_at_headings": [],
        # Pas de LIVRE/CHAPITRE : des articles a titres libres.
        "structure": "articles",
        "livres": {},
        # Le folio est imprime en bas de page, pas en tete.
        "folio_position": "bottom",
        # Pas de notes de bas de page ; le petit corps est celui des legendes
        # de photos, qui sont du contenu a conserver.
        "footnotes": False,
        # OCR mediocre sur les zones de photos : filtrer les lignes de bruit.
        "filter_noise": True,
        # Pages de reclames et de documents manuscrits scannes : ecartees.
        "max_junk_ratio": 0.28,
        "heading_corrections": {},
    },
    "cahiers-pe-t4": {
        "pdf": "Cahier de Petit Enghien T IV HR.pdf",
        "titre": "Les Cahiers de Petit-Enghien",
        "auteur": "Union des groupements patriotiques de Petit-Enghien",
        "annee": 2007,
        "tome": 4,
        # Album de memoire villageoise : prose, photos legendees, fac-similes.
        # Corps en 10-12 pt selon les pages, titres d'articles a partir de 13.
        "body_size": 10,
        "heading_min_size": 13,
        "min_body_chars": 200,
        # Les pages sans folio sont surtout des pleines pages de photos.
        "min_body_chars_sans_folio": 600,
        "skip_pages": [1, 2, 3],
        "stop_at_headings": [],
        # Pas de LIVRE/CHAPITRE : des articles a titres libres.
        "structure": "articles",
        "livres": {},
        # Le folio est imprime en bas de page, pas en tete.
        "folio_position": "bottom",
        # Pas de notes de bas de page ; le petit corps est celui des legendes
        # de photos, qui sont du contenu a conserver.
        "footnotes": False,
        # OCR mediocre sur les zones de photos : filtrer les lignes de bruit.
        "filter_noise": True,
        # Pages de reclames et de documents manuscrits scannes : ecartees.
        "max_junk_ratio": 0.28,
        "heading_corrections": {},
    },

    "reygaerts-1998-t2": {
        "pdf": "Géographie Historique d'Enghien T2 reconnu.pdf",
        "titre": "La région d'Enghien — Une géographie historique, une histoire urbaine",
        "auteur": "Jacques Reygaerts",
        "annee": 1998,
        "tome": 2,
        "body_size": 12,
        "min_body_chars": 200,
        "min_body_chars_sans_folio": 1200,
        "skip_pages": [1, 2, 3, 4, 5, 6],
        # « ICONOGRAPHIE EXPLICATIVE » precede la table des matieres et n'est
        # qu'une liste de legendes de figures, organisee par livre : sans arret
        # ici, elle declencherait de faux changements de livre en fin de tome.
        "stop_at_headings": ["ICONOGRAPHIE", "TABLE DES MATIERES"],
        # Le tome 2 reprend le Livre III commence dans le tome 1 : sa page 1
        # porte « LIVRE TROISIEME (Suite) » et enchaine au chapitre II.
        "livre_initial": "III",
        "livres": {
            "PREMIER": ("I", "Géographie historique des temps anciens"),
            "DEUXIEME": ("II", "Géographie physique et histoire urbaine"),
            "TROISIEME": ("III", "Géographie humaine et histoire d'Enghien"),
        },
        "heading_corrections": {},
    },
}

# ---------------------------------------------------------------------------
# Detection typographique
# ---------------------------------------------------------------------------

# Le folio imprime : nombre seul, en haut de page, dans une police plus petite
# que le corps.
FOLIO_MAX_Y_RATIO = 0.08
FOLIO_BOTTOM_MIN_Y = 0.85
# Saut maximal admis entre deux folios lus (les cahiers de planches ecartes
# creent des trous reels d'une dizaine de pages au plus).
FOLIO_MAX_JUMP = 15
FOLIO_RE = re.compile(r"^(\d{1,3})$")

# Les notes de bas de page : police nettement plus petite, en bas de page.
FOOTNOTE_MAX_SIZE = 8
FOOTNOTE_MIN_Y_RATIO = 0.78
FOOTNOTE_START_RE = re.compile(r"^(\d{1,3})\s*(bis|ter)?\s+\S")

LIVRE_RE = re.compile(r"^LIVRE\s+(PREMIER|DEUXIEME|TROISIEME)\b\.?\s*(.*)$")
CHAPITRE_RE = re.compile(r"^([IVXL]{1,6})\s*\.\s*(.+)$")

ROMAINS = {
    "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8,
    "IX": 9, "X": 10, "XI": 11, "XII": 12, "XIII": 13, "XIV": 14, "XV": 15,
    "XVI": 16, "XVII": 17, "XVIII": 18, "XIX": 19, "XX": 20,
}
SECTION_RE = re.compile(r"^(\d{1,2})\s*\.\s*(.+)$")
# Sections alphabetiques : "A. LES PORTES", "B. LES DROITS SEIGNEURIAUX"
SECTION_ALPHA_RE = re.compile(r"^([A-F])\s*\.\s*(.+)$")

# Un marqueur d'arret n'est pris en compte qu'au-dela de cette fraction du
# volume : les annexes de fin ne commencent jamais au milieu du livre.
STOP_MIN_PROGRESSION = 0.85


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


VOYELLES_RE = re.compile(r"[aeiouyàâäéèêëîïôöùûüœ]")
CASSE_MELEE_RE = re.compile(r"[a-zà-ÿ][A-ZÀ-Ÿ]")
MOT_RE = re.compile(r"[^\W\d_]{2,}", re.UNICODE)


def junk_ratio(texts):
    """Proportion de mots impossibles dans un ensemble de lignes.

    Detecte les pages de fac-similes (reclames, documents manuscrits) dont
    l'OCR produit des lettres mais pas des mots : consonnes sans voyelle,
    casse melee en plein mot, chaines interminables. La prose reelle reste
    sous ~5 % ; ces pages depassent 25 %.
    """
    words = MOT_RE.findall(" ".join(texts))
    if len(words) < 15:
        return 0.0
    def junky(w):
        if len(w) >= 3 and not VOYELLES_RE.search(w.lower()):
            return True
        if CASSE_MELEE_RE.search(w):
            return True
        return len(w) >= 16
    return sum(1 for w in words if junky(w)) / len(words)


def plausible(text):
    """Ligne de texte reel, par opposition au bruit OCR d'une photo.

    Les scans de photos et de documents manuscrits produisent des lignes de
    symboles ("e!P~ ~~~[. S2 <") qui pollueraient les chunks. Une ligne est
    plausible si elle est essentiellement alphanumerique.
    """
    core = [c for c in text if not c.isspace()]
    if not core:
        return False
    alnum = sum(1 for c in core if c.isalnum())
    return alnum >= 3 and alnum / len(core) >= 0.7


def classify_page(lines, height, cfg):
    """Separe folio, notes de bas de page et corps de texte."""
    folio = None
    body, notes = [], []
    body_size = cfg["body_size"]
    folio_bottom = cfg.get("folio_position") == "bottom"
    footnotes = cfg.get("footnotes", True)
    filter_noise = cfg.get("filter_noise", False)

    for line in lines:
        y_ratio = line["y"] / height
        text = line["text"]

        # En bas de page, le folio flotte davantage (87-95 % de la hauteur
        # selon les volumes) et peut etre un peu plus gros que le corps.
        in_folio_zone = (
            y_ratio > FOLIO_BOTTOM_MIN_Y if folio_bottom else y_ratio < FOLIO_MAX_Y_RATIO
        )
        max_size = body_size + 3 if folio_bottom else body_size
        # Plancher : les scans de photos sement des chiffres parasites de
        # 2-3 pt qui voleraient la place du vrai folio.
        if folio is None and in_folio_zone and 7 <= line["size"] <= max_size:
            m = FOLIO_RE.match(text)
            if m:
                folio = int(m.group(1))
                continue

        if filter_noise and not plausible(text):
            continue

        if footnotes:
            is_small = line["size"] <= FOOTNOTE_MAX_SIZE
            is_low = y_ratio >= FOOTNOTE_MIN_Y_RATIO
            # Une note commence par son numero d'appel ; les lignes suivantes
            # de la meme note sont simplement petites et basses.
            if is_small or (
                is_low and line["size"] < body_size and FOOTNOTE_START_RE.match(text)
            ):
                notes.append(text)
                continue
            if is_low and notes and line["size"] < body_size:
                notes.append(text)
                continue

        body.append(line)

    return folio, body, notes


def heading_kind(line, cfg, etat):
    """Identifie un titre et le normalise vers les marqueurs du chunker.

    `etat` porte le numero du dernier chapitre rencontre : il sert a distinguer
    un vrai chapitre d'une sous-section elle aussi numerotee en chiffres romains.
    """
    text = line["text"]

    # Structure "articles" (recueils, albums) : pas de LIVRE/CHAPITRE, des
    # articles a titres libres. Un titre est une ligne nettement plus grande
    # que le corps, en majuscules — le gras n'est pas fiable dans ces mises en
    # page composites. Chaque article devient une section numerotee.
    if cfg.get("structure") == "articles":
        letters = sum(1 for c in text if c.isalpha())
        mots = MOT_RE.findall(text)
        if (
            line["size"] >= cfg.get("heading_min_size", 13)
            and uppercase_ratio(text) >= 0.9
            and letters >= 5
            and plausible(text)
            # aucun mot impossible : un titre garble ("GU~UlE LAMBI") polluerait
            # les citations de tout l'article qu'il ouvre
            and not any(
                not VOYELLES_RE.search(w.lower()) or CASSE_MELEE_RE.search(w)
                for w in mots
            )
        ):
            etat["article_num"] += 1
            titre = re.sub(r"\s+", " ", text).strip(" .~-")
            return ("section", "§ {}. — {}".format(etat["article_num"], titre), "")
        return None

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
        valeur = ROMAINS.get(m.group(1).upper())
        # Un numero de chapitre progresse toujours. Un « I. » qui reapparait
        # apres un « VII. » est une sous-section, pas un nouveau chapitre :
        # sans ce controle, tout le reste du chapitre serait mal rattache.
        if valeur is not None and valeur <= etat["chapitre_num"]:
            return ("section", "§ {}. — {}".format(m.group(1), m.group(2).strip()), "")
        if valeur is not None:
            etat["chapitre_num"] = valeur
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
    stats = {"texte": 0, "planches": 0, "vides": 0, "sans_folio": 0,
             "folios_rejetes": 0, "folios_resync": 0, "fac_similes": 0, "notes": 0}
    structure = []
    last_folio = 0
    last_observed = 0
    pending_folio = None
    etat = {"chapitre_num": 0, "article_num": 0}

    # Un tome peut reprendre un livre commence dans le precedent. Sans ce
    # marqueur initial, le chunker rattacherait tout le debut au Livre I.
    livre_initial = cfg.get("livre_initial")
    if livre_initial:
        out.append("LIVRE " + livre_initial)
        out.append("")
        print("Livre initial force a {} (tome de continuation).".format(livre_initial))

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

        # Une page sans folio imprime est presque toujours une planche. Les
        # legendes de figures peuvent depasser le seuil ordinaire (jusqu'a ~600
        # caracteres) et fabriqueraient alors de faux folios, decalant les
        # citations de toutes les pages suivantes. On leur applique donc un
        # seuil nettement plus severe : une vraie page de texte en compte ~2300.
        seuil = cfg["min_body_chars"] if folio is not None else cfg.get(
            "min_body_chars_sans_folio", cfg["min_body_chars"]
        )
        if body_chars < seuil:
            stats["planches"] += 1
            continue

        # Fac-similes (reclames, manuscrits) : des lettres, pas des mots.
        max_junk = cfg.get("max_junk_ratio")
        if max_junk is not None:
            jr = junk_ratio([l["text"] for l in body])
            if jr > max_junk:
                stats["fac_similes"] += 1
                continue

        # Un marqueur d'arret ne vaut que dans les annexes de fin de volume :
        # le meme mot peut apparaitre en plein corps de texte, et l'arret
        # amputerait alors silencieusement une partie de l'ouvrage.
        en_fin_de_volume = pdf_page > doc.page_count * STOP_MIN_PROGRESSION
        arret = next(
            (
                marqueur
                for marqueur in cfg.get("stop_at_headings", [])
                for l in body
                if strip_accents(l["text"]).upper().startswith(marqueur)
            ),
            None,
        ) if en_fin_de_volume else None
        if arret:
            print('"{}" atteint page PDF {} : arret.'.format(arret, pdf_page))
            break

        # Un folio ne regresse jamais, et ne saute pas non plus de dizaines de
        # pages d'un coup : dans les deux cas, la valeur vient d'un nombre
        # parasite (fac-simile, legende de photo) et la retenir fausserait les
        # citations. La comparaison porte sur le dernier folio REELLEMENT LU,
        # jamais sur un folio reconstruit.
        #
        # Resynchronisation : si deux pages consecutives portent des valeurs
        # qui se suivent, c'est une vraie rupture de sequence (long cahier de
        # planches saute) et la nouvelle base est adoptee. Sans cela, un seul
        # nombre parasite vers l'avant ferait rejeter en cascade tous les
        # folios reels suivants (constate : 45 rejets sur le Cahier T2).
        if folio is not None and last_observed:
            suspect = folio < last_observed or folio - last_folio > FOLIO_MAX_JUMP
            if suspect:
                if pending_folio is not None and abs(folio - (pending_folio + 1)) <= 1:
                    stats["folios_resync"] += 1
                    pending_folio = None
                    last_observed = folio
                else:
                    pending_folio = folio
                    stats["folios_rejetes"] += 1
                    folio = None
            else:
                pending_folio = None

        if folio is None:
            folio = last_folio + 1
            stats["sans_folio"] += 1
        else:
            last_observed = folio
        last_folio = folio

        out.append("— {} —".format(folio))
        for line in body:
            kind = heading_kind(line, cfg, etat)
            if kind:
                type_, marker, titre = kind
                out.append("")
                out.append(marker if not titre else "{}. {}".format(marker, titre))
                out.append("")
                if type_ == "livre":
                    etat["chapitre_num"] = 0
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
    print("Folios rejetes      : {} (parasites)".format(stats["folios_rejetes"]))
    print("Resynchronisations  : {}".format(stats["folios_resync"]))
    print("Fac-similes ecartes : {} (qualite lexicale)".format(stats["fac_similes"]))
    print("Notes extraites     : {}".format(stats["notes"]))
    print("Titres detectes     : {}".format(len(structure)))
    print("\nTexte : {} ({:,} caracteres)".format(txt_path, len(text)))


if __name__ == "__main__":
    main()
