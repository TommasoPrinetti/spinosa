#!/usr/bin/env python3
"""
yake-cli.py — YAKE keyword extractor for Spinosa Framework

Extracts keywords from .md files using YAKE, detects language via
langdetect, and writes or extends YAML frontmatter with keywords,
topics, and concepts.

Usage (single file, in-place update):
    yake-cli --inplace <file.md>

Usage (single file, output to stdout):
    yake-cli --input <file.md>

Usage (batch mode — process multiple files from stdin):
    yake-cli --batch

    stdin protocol (tab-separated lines):
        FILE\t/path/to/file.md

    stderr protocol (tab-separated lines):
        BEGIN\trel_path
        END\tok\trel_path\tduration_s
        END\tfail\trel_path\tduration_s

Behaviour per file:
    1. Parse existing YAML frontmatter (if any)
    2. Detect language of body text using langdetect
    3. Store language in header (only if not already set)
    4. Run YAKE with detected language (top=20, max_ngram=3)
    5. Split output:
       - keywords: all top 20 terms
       - topics:   top 5 highest-ranked terms
       - concepts: all 3+ word ngrams from the keyword set
    6. Merge into existing header:
       - Normalise: lowercase, strip punctuation
       - Dedup by normalised form
       - Append only truly new terms
    7. Write header back to file (--inplace) or stdout (--input)
"""

import sys
import os
import argparse
import time
import re
from pathlib import Path


YAML_RE = re.compile(r'^---\s*\n(.*?)\n(?:---|\.\.\.)\s*\n', re.DOTALL)


def parse_yaml_header(text):
    """Extract existing YAML frontmatter as dict.

    Returns (header_dict, body_text).
    """
    m = YAML_RE.match(text)
    if not m:
        return {}, text

    header = {}
    for line in m.group(1).split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if ':' in line:
            key, _, val = line.partition(':')
            key = key.strip()
            val = val.strip()
            if val.startswith('[') and val.endswith(']'):
                items = []
                for x in val[1:-1].split(','):
                    x = x.strip().strip('"').strip("'")
                    if x:
                        items.append(x)
                header[key] = items
            else:
                header[key] = val.strip('"').strip("'")
    return header, text[m.end():]


def detect_language(text, existing_lang=None):
    """Detect language of body text using langdetect.

    Returns ISO 639-1 code (default 'en' on failure).
    Preserves an already-set language.
    """
    if existing_lang:
        return existing_lang
    try:
        from langdetect import detect
        lang = detect(text)
        if lang and len(lang) == 2:
            return lang
    except Exception:
        pass
    return 'en'


def extract_keywords(text, language, top=20, max_ngram=3):
    """Run YAKE keyword extraction on text.

    Returns list of (keyword, score) tuples, lowest score first (best).
    """
    try:
        import yake
        extractor = yake.KeywordExtractor(
            lan=language,
            n=max_ngram,
            dedupLim=0.9,
            top=top,
            features=None
        )
        return extractor.extract_keywords(text)
    except ImportError:
        print("  Missing required package: yake", file=sys.stderr, flush=True)
        return []
    except Exception as e:
        print(f"  YAKE extraction failed: {e}", file=sys.stderr, flush=True)
        return []


STOPWORDS = {
    'a', 'afin', 'ah', 'ai', 'aie', 'ainsi', 'aller', 'alors', 'après', 'as',
    'assez', 'attendu', 'au', 'aucun', 'aujourd', 'auprès', 'aussi', 'autre',
    'aux', 'avaient', 'avais', 'avait', 'avant', 'avec', 'avez', 'avons',
    'bah', 'beaucoup', 'ben', 'bien', 'bon', 'c', 'car', 'ce', 'cela',
    'celle', 'celles', 'celui', 'cent', 'cependant', 'certain', 'certes',
    'ces', 'cet', 'cette', 'ceux', 'chez', 'ci', 'combien', 'comme',
    'comment', 'concernant', 'contre', 'coucou', 'd', 'dans', 'de', 'debout',
    'dedans', 'dehors', 'delà', 'depuis', 'derrière', 'des', 'dès', 'dessous',
    'dessus', 'devant', 'devenu', 'devoir', 'doit', 'donc', 'dont', 'du',
    'durant', 'déjà', 'e', 'effet', 'elle', 'elles', 'en', 'encore', 'enfin',
    'entre', 'envers', 'environ', 'er', 'es', 'est', 'et', 'etaient', 'etait',
    'etant', 'etc', 'ete', 'etes', 'euh', 'eurent', 'eut', 'eût', 'eûtes',
    'excepté', 'fais', 'faisaient', 'faisait', 'faisant', 'fait', 'faite',
    'faites', 'fallait', 'faut', 'furent', 'fus', 'fusse', 'fussent',
    'fusses', 'fussiez', 'fussions', 'fut', 'fût', 'fûtes', 'grâce',
    'h', 'ha', 'hein', 'hem', 'hep', 'ho', 'holà', 'hop', 'hormis',
    'hou', 'houp', 'hue', 'hui', 'hum', 'hurrah', 'i', 'il', 'ils',
    'j', 'je', 'jusque', 'k', 'l', 'la', 'là', 'le', 'les', 'leur',
    'leurs', 'lui', 'm', 'ma', 'maint', 'maintenant', 'mais', 'malgré',
    'me', 'mes', 'mien', 'mienne', 'miennes', 'miens', 'mieux', 'moi',
    'moins', 'mon', 'mot', 'moyennant', 'n', 'na', 'ne', 'ner', 'nes',
    'ni', 'non', 'nos', 'notre', 'nous', 'nul', 'o', 'oh', 'ohé', 'olà',
    'on', 'ont', 'ore', 'ou', 'où', 'oui', 'par', 'parce', 'parmi',
    'pas', 'pendant', 'peu', 'peut', 'peuvent', 'peux', 'plu', 'plus',
    'plutôt', 'pour', 'pourquoi', 'pourtant', 'pouvait', 'puis', 'puisque',
    'qu', 'quand', 'quant', 'que', 'quel', 'quelle', 'quelles', 'quels',
    'qui', 'quoi', 'r', 'revoici', 'revoilà', 'rien', 's', 'sa', 'sans',
    'sauf', 'se', 'selon', 'sera', 'serai', 'seraient', 'serais', 'serait',
    'seras', 'serez', 'seriez', 'serions', 'serons', 'seront', 'ses',
    'seul', 'si', 'sien', 'sienne', 'siennes', 'siens', 'sinon', 'soi',
    'soit', 'sois', 'sommes', 'sont', 'sous', 'soyez', 'soyons', 'sujet',
    'sur', 't', 'ta', 'tandis', 'tant', 'tard', 'te', 'tel', 'telle',
    'telles', 'tels', 'tes', 'tien', 'tienne', 'tiennes', 'tiens', 'toi',
    'ton', 'tôt', 'toujours', 'tout', 'toute', 'toutes', 'très', 'trop',
    'tu', 'u', 'un', 'une', 'va', 'vais', 'vas', 'vers', 'veut', 'veux',
    'via', 'vite', 'voici', 'voilà', 'voire', 'vont', 'vos', 'votre',
    'vous', 'vu', 'vêt', 'y', 'z', 'à', 'ça', 'étaient', 'étais',
    'était', 'étant', 'été', 'étiez', 'étions', 'été', 'êtes',
    # English
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am',
    'an', 'and', 'any', 'are', 'aren', 'as', 'at', 'be', 'because',
    'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
    'can', 'cannot', 'could', 'did', 'do', 'does', 'doing', 'down',
    'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has',
    'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him',
    'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it',
    'its', 'itself', 'just', 'll', 'me', 'might', 'more', 'most',
    'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'oh', 'on',
    'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out',
    'over', 'own', 'per', 'quite', 're', 's', 'same', 'she', 'should',
    'so', 'some', 'such', 't', 'than', 'that', 'the', 'their', 'theirs',
    'them', 'themselves', 'then', 'there', 'these', 'they', 'this',
    'those', 'through', 'to', 'too', 'under', 'until', 'up', 'us',
    'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which',
    'while', 'who', 'whom', 'why', 'will', 'with', 'would', 'you',
    'your', 'yours', 'yourself', 'yourselves',
    # Transcription artifacts
    'speaker', 'speakers', 'detected', 'model', 'asr', 'diarization',
    'unknown', 'transcription', 'transcript',
}

def is_stopword_only(kw):
    """Return True if keyword is pure stopword content (no research value)."""
    tokens = kw.lower().strip().strip('.,;:!?()[]{}"\'').split()
    if not tokens:
        return True
    for t in tokens:
        t = t.strip('.,;:!?()[]{}"\'')
        if t and t not in STOPWORDS:
            return False
    return True


def normalize_keyword(kw):
    """Normalise a keyword for dedup comparison."""
    return kw.lower().strip().strip('.,;:!?()[]{}"\'').strip()


def build_yaml_header(existing, language, keywords_list):
    """Merge new YAKE keywords into existing header.

    Returns YAML frontmatter string (with --- delimiters).
    """
    existing_keywords = set()
    for k in existing.get('keywords', []):
        existing_keywords.add(normalize_keyword(k))

    existing_topics = set()
    for t in existing.get('topics', []):
        existing_topics.add(normalize_keyword(t))

    existing_concepts = set()
    for c in existing.get('concepts', []):
        existing_concepts.add(normalize_keyword(c))

    all_terms = [kw for kw, _ in keywords_list]
    top_terms = [kw for kw, _ in keywords_list[:5]]
    concept_terms = [kw for kw, _ in keywords_list if len(kw.split()) >= 3]

    new_keywords = []
    for kw in all_terms:
        nk = normalize_keyword(kw)
        if nk and nk not in existing_keywords:
            new_keywords.append(kw)
            existing_keywords.add(nk)

    new_topics = []
    for kw in top_terms:
        nk = normalize_keyword(kw)
        if nk and nk not in existing_topics:
            new_topics.append(kw)
            existing_topics.add(nk)

    new_concepts = []
    for kw in concept_terms:
        nk = normalize_keyword(kw)
        if nk and nk not in existing_concepts:
            new_concepts.append(kw)
            existing_concepts.add(nk)

    header = dict(existing)
    header['language'] = language
    merged = existing.get('keywords', []) + new_keywords
    if merged:
        header['keywords'] = merged
    if new_topics or existing.get('topics'):
        header['topics'] = existing.get('topics', []) + new_topics
    if new_concepts or existing.get('concepts'):
        header['concepts'] = existing.get('concepts', []) + new_concepts

    lines = ['---']
    order = ['type', 'source_type', 'original_format', 'converter_engine',
             'language', 'people', 'places', 'organizations',
             'topics', 'keywords', 'concepts',
             'explicit_source_terms', 'inferred_concepts',
             'canonical_aliases', 'uncertain_terms',
             'machine_artifacts', 'metadata_uncertainty',
             'related_sources', 'generated_by', 'generated_at',
             'processing_status', 'created', 'updated']
    seen = set()
    for key in order:
        if key in header:
            val = header[key]
            if isinstance(val, list):
                if val:
                    items = ', '.join(f'"{v}"' for v in val)
                    lines.append(f'{key}: [{items}]')
            else:
                lines.append(f'{key}: {val}')
            seen.add(key)
    for key, val in header.items():
        if key not in seen:
            if isinstance(val, list):
                if val:
                    items = ', '.join(f'"{v}"' for v in val)
                    lines.append(f'{key}: [{items}]')
            else:
                lines.append(f'{key}: {val}')
    lines.append('---')
    return '\n'.join(lines) + '\n'


MAX_FILE_SIZE = 50 * 1024 * 1024


def process_file(filepath, inplace=False):
    """Process a single .md file: extract keywords, write/merge YAML header.

    Returns True on success.
    """
    if not os.path.exists(filepath):
        print(f"  File not found: {filepath}", file=sys.stderr, flush=True)
        return False

    try:
        size = os.path.getsize(filepath)
        if size > MAX_FILE_SIZE:
            print(f"  File too large ({size / 1024 / 1024:.0f} MB) — skipping: {filepath}",
                  file=sys.stderr, flush=True)
            return False
    except Exception as e:
        print(f"  Cannot stat {filepath}: {e}", file=sys.stderr, flush=True)
        return False

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            text = f.read()
    except Exception as e:
        print(f"  Cannot read {filepath}: {e}", file=sys.stderr, flush=True)
        return False

    existing, body = parse_yaml_header(text)

    if not body.strip():
        print(f"  Empty body in {filepath}", file=sys.stderr, flush=True)
        return False

    existing_lang = existing.get('language', None)
    language = detect_language(body, existing_lang)

    keywords_list = extract_keywords(body, language)
    keywords_list = [(kw, sc) for kw, sc in keywords_list if not is_stopword_only(kw)]

    if not keywords_list:
        print(f"  No keywords extracted from {filepath}", file=sys.stderr, flush=True)
        return False

    yaml_header = build_yaml_header(existing, language, keywords_list)

    if inplace:
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(yaml_header)
                f.write(body)
        except Exception as e:
            print(f"  Cannot write {filepath}: {e}", file=sys.stderr, flush=True)
            return False
    else:
        try:
            sys.stdout.write(yaml_header)
            sys.stdout.flush()
        except (BrokenPipeError, OSError):
            pass

    return True


def single_main(filepath, inplace=False):
    """Handle single-file mode."""
    ok = process_file(filepath, inplace=inplace)
    sys.exit(0 if ok else 1)


def batch_main():
    """Handle batch mode: read FILE/SOURCE lines from stdin."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        parts = line.split('\t')
        if len(parts) < 1:
            continue
        cmd = parts[0]
        if cmd == 'SOURCE':
            continue
        if cmd == 'FILE' and len(parts) >= 2:
            filepath = parts[1]
            rel = os.path.basename(filepath)
            print(f"BEGIN\t{rel}", file=sys.stderr, flush=True)
            start = time.time()
            try:
                ok = process_file(filepath, inplace=True)
            except Exception as e:
                print(f"  Unexpected error processing {filepath}: {e}",
                      file=sys.stderr, flush=True)
                ok = False
            dur = int(time.time() - start)
            status = 'ok' if ok else 'fail'
            print(f"END\t{status}\t{rel}\t{dur}", file=sys.stderr, flush=True)
    sys.exit(0)


def main():
    parser = argparse.ArgumentParser(
        description='YAKE: Extract keywords from .md files and write YAML headers'
    )
    parser.add_argument(
        '--inplace', metavar='FILE',
        help='Read file, add/extend YAML header in-place'
    )
    parser.add_argument(
        '--input', metavar='FILE',
        help='Read file, output YAML fragment to stdout'
    )
    parser.add_argument(
        '--batch', action='store_true',
        help='Process multiple files from stdin (single engine instance)'
    )

    args = parser.parse_args()

    if args.batch:
        batch_main()
    elif args.inplace:
        single_main(args.inplace, inplace=True)
    elif args.input:
        single_main(args.input, inplace=False)
    else:
        parser.error('One of --inplace, --input, or --batch is required')


if __name__ == '__main__':
    main()
