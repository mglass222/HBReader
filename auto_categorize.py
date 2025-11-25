#!/usr/bin/env python3
"""
Automated Question Categorization using keyword matching and heuristics.
This provides a first-pass categorization that can be refined later.
"""

import json
import re
from datetime import datetime

# Keyword patterns for regions
REGION_PATTERNS = {
    'United States': [
        r'\b(America|American|U\.?S\.?A?|United States|Washington|Lincoln|Jefferson|Roosevelt|Kennedy|Madison|Jackson|Grant|New York|California|Texas|Boston|Chicago|Philadelphia|Civil War|Revolutionary War|Constitution|Congress|Senate|Supreme Court|Confederacy|Union)\b',
        r'\b(Jamestown|Plymouth|Louisiana Purchase|Manifest Destiny|Gettysburg|Pearl Harbor)\b'
    ],
    'Europe': [
        r'\b(Europe|European|Britain|British|England|English|France|French|Germany|German|Italy|Italian|Spain|Spanish|Russia|Russian|Poland|Polish|Greece|Greek|Rome|Roman)\b',
        r'\b(London|Paris|Berlin|Moscow|Renaissance|Reformation|Napoleon|Hitler|Churchill|Stalin|Brexit)\b',
        r'\b(Netherlands|Dutch|Belgium|Austria|Sweden|Denmark|Norway|Portugal|Ireland)\b'
    ],
    'Asia': [
        r'\b(Asia|Asian|China|Chinese|Japan|Japanese|India|Indian|Korea|Korean|Vietnam|Vietnamese|Thailand|Cambodia|Indonesia|Pakistan|Bangladesh)\b',
        r'\b(Beijing|Tokyo|Delhi|Mumbai|Seoul|Mao|Gandhi|Confucius|Buddha|Hinduism|Buddhism)\b',
        r'\b(Ming|Qing|Mughal|Shogun|Samurai|Silk Road)\b'
    ],
    'Latin America & Caribbean': [
        r'\b(Latin America|South America|Central America|Caribbean|Mexico|Mexican|Brazil|Brazilian|Argentina|Cuba|Colombian|Venezuela|Chile|Peru)\b',
        r'\b(Aztec|Maya|Inca|Bolivar|Castro|Che Guevara|Buenos Aires|Rio de Janeiro)\b'
    ],
    'Africa': [
        r'\b(Africa|African|Egypt|Egyptian|Ethiopia|Nigerian|Kenya|South Africa|Congo|Zimbabwe|Ghana|Sudan|Algeria|Morocco)\b',
        r'\b(Sahara|Nile|Cairo|Nairobi|Lagos|Mandela|Apartheid|colonialism)\b'
    ],
    'Middle East & North Africa': [
        r'\b(Middle East|Arab|Arabian|Israel|Israeli|Palestine|Palestinian|Iraq|Iranian|Syria|Turkey|Turkish|Ottoman|Lebanon|Jordan)\b',
        r'\b(Baghdad|Damascus|Jerusalem|Mecca|Medina|Islam|Muslim|Quran|Caliph|Sultan)\b'
    ],
    'Global/Multi-Regional': [
        r'\b(World War|global|international|United Nations|UN|NATO|Cold War|imperialism|colonialism|globalization)\b'
    ]
}

# Time period patterns
TIME_PATTERNS = {
    'Ancient World (pre-500 CE)': [
        r'\b(ancient|BC|B\.C\.|BCE|B\.C\.E\.|Rome|Roman Empire|Greece|Greek|Athens|Sparta|Alexandria|Caesar|Alexander|Cleopatra|Socrates|Plato|Aristotle)\b',
        r'\b(Egypt|Pharaoh|Pyramid|Mesopotamia|Persia|Assyria|Babylon)\b'
    ],
    'Medieval Era (500-1450)': [
        r'\b(medieval|Middle Ages|feudal|crusade|Viking|Byzantine|Charlemagne|Magna Carta|Black Death|knight|castle|monastery)\b',
        r'\b(Genghis Khan|Mongol|Teutonic|Templar|Inquisition)\b'
    ],
    'Early Modern (1450-1750)': [
        r'\b(Renaissance|Reformation|Luther|Protestant|Counter-Reformation|Elizabethan|Tudor|Stuart|Thirty Years)\b',
        r'\b(Columbus|Magellan|Cortez|conquistador|colonization|Jamestown|Plymouth|Mayflower)\b',
        r'\b(Shakespeare|Gutenberg|Leonardo|Michelangelo|Galileo)\b'
    ],
    'Age of Revolutions (1750-1850)': [
        r'\b(Revolution|revolutionary|Napoleon|Washington|Jefferson|Declaration of Independence|Constitution|Bill of Rights)\b',
        r'\b(Bastille|guillotine|Robespierre|Jacobin|Continental Congress|Articles of Confederation)\b',
        r'\b(1776|1789|1812|Waterloo|Congress of Vienna)\b'
    ],
    'Industrial & Imperial Age (1850-1914)': [
        r'\b(Industrial Revolution|imperialism|Victorian|Bismarck|Meiji|railroad|telegraph|steamship)\b',
        r'\b(Civil War|Gettysburg|Lincoln|slavery|abolitionism|Reconstruction)\b',
        r'\b(1861|1865|1871|1898|Spanish-American War)\b'
    ],
    'World Wars & Interwar (1914-1945)': [
        r'\b(World War|WWI|WWII|WW1|WW2|Hitler|Nazi|Holocaust|Pearl Harbor|Normandy|D-Day|atomic bomb)\b',
        r'\b(Treaty of Versailles|League of Nations|Great Depression|New Deal|Stalin|Churchill|Roosevelt)\b',
        r'\b(1914|1918|1929|1939|1941|1945|Auschwitz|Hiroshima|Nagasaki)\b'
    ],
    'Contemporary Era (1945-present)': [
        r'\b(Cold War|Vietnam|Korea|Afghanistan|Iraq|9/11|September 11|Soviet|USSR|Berlin Wall|Cuban Missile)\b',
        r'\b(Kennedy|Nixon|Reagan|Clinton|Obama|Trump|Brexit|EU|European Union)\b',
        r'\b(1950s|1960s|1970s|1980s|1990s|2000s|2010s|twenty-first century|21st century)\b'
    ]
}

# Answer type patterns
ANSWER_TYPE_PATTERNS = {
    'People & Biography': [
        r'(name this|who|person|leader|president|king|queen|emperor|ruler|general|scientist|artist|composer|writer|poet)\b',
        r'\b(assassination|born|died|childhood|succeeded|predecessor|biography)\b'
    ],
    'Events & Incidents': [
        r'\b(battle|war|revolution|massacre|assassination|bombing|attack|protest|riot|rebellion|uprising)\b',
        r'\b(occurred|happened|took place|outbreak|aftermath)\b'
    ],
    'Places & Geography': [
        r'\b(city|country|island|mountain|river|sea|ocean|capital|region|territory|state|province)\b',
        r'\b(located|borders|geography|landscape)\b'
    ],
    'Works & Documents': [
        r'\b(treaty|constitution|declaration|book|novel|poem|painting|sculpture|symphony|opera|document|manuscript)\b',
        r'\b(wrote|painted|composed|authored|published|signed)\b'
    ],
    'Groups & Institutions': [
        r'\b(party|organization|movement|congress|parliament|senate|court|army|navy|church|monastery|university)\b',
        r'\b(founded|established|members|joined)\b'
    ],
    'Concepts & Ideas': [
        r'\b(theory|doctrine|philosophy|ideology|principle|concept|belief|religion|faith)\b',
        r'\b(invented|discovered|proposed|believed)\b'
    ]
}

# Subject themes patterns
SUBJECT_PATTERNS = {
    'Military & Conflict': [r'\b(war|battle|military|army|navy|soldier|weapon|siege|invasion|defeat|victory)\b'],
    'Political & Governmental': [r'\b(political|government|president|congress|parliament|election|vote|law|constitution|treaty)\b'],
    'Religion & Philosophy': [r'\b(religion|religious|church|temple|mosque|god|philosophy|theological|belief|faith|doctrine)\b'],
    'Arts & Literature': [r'\b(art|painting|sculpture|music|literature|poem|novel|composer|artist|writer)\b'],
    'Science & Technology': [r'\b(science|technology|invention|discover|experiment|theory|mathematics|physics|chemistry)\b'],
    'Economic & Trade': [r'\b(economic|economy|trade|commerce|market|currency|gold|silver|tax|tariff)\b'],
    'Social Movements & Culture': [r'\b(social|society|culture|rights|reform|protest|movement|equality|discrimination)\b']
}

def categorize_by_keywords(text):
    """Categorize a question using keyword matching."""
    text_lower = text.lower()

    # Find regions
    regions = []
    for region, patterns in REGION_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text, re.IGNORECASE):
                regions.append(region)
                break

    # Find time periods
    time_periods = []
    for period, patterns in TIME_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text, re.IGNORECASE):
                time_periods.append(period)
                break

    # Find answer type
    answer_type = 'Events & Incidents'  # default
    max_matches = 0
    for ans_type, patterns in ANSWER_TYPE_PATTERNS.items():
        matches = sum(1 for pattern in patterns if re.search(pattern, text, re.IGNORECASE))
        if matches > max_matches:
            max_matches = matches
            answer_type = ans_type

    # Find subject themes
    themes = []
    for theme, patterns in SUBJECT_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text, re.IGNORECASE):
                themes.append(theme)
                break

    # Defaults if nothing found
    if not regions:
        regions = ['Global/Multi-Regional']
    if not time_periods:
        time_periods = ['Contemporary Era (1945-present)']
    if not themes:
        themes = ['Political & Governmental']

    return {
        'regions': list(set(regions))[:2],  # Max 2 regions
        'time_periods': list(set(time_periods))[:2],  # Max 2 periods
        'answer_type': answer_type,
        'subject_themes': list(set(themes))[:3]  # Max 3 themes
    }

def main():
    print("Loading questions...")
    with open('questions.json', 'r') as f:
        questions = json.load(f)

    print("Loading existing metadata...")
    with open('question_metadata.json', 'r') as f:
        metadata = json.load(f)

    total_processed = 0

    for difficulty in ['preliminary', 'quarterfinals', 'semifinals', 'finals']:
        print(f"\nProcessing {difficulty}...")
        questions_list = questions[difficulty]

        # Start from where we left off
        start_index = len(metadata[difficulty])

        if start_index >= len(questions_list):
            print(f"  All {len(questions_list)} questions already categorized, skipping...")
            total_processed += len(questions_list)
            continue

        print(f"  Starting from index {start_index}/{len(questions_list)}")

        for i, q in enumerate(questions_list[start_index:], start=start_index):
            # Categorize using keywords
            combined_text = q['question'] + ' ' + q['answer']
            cat = categorize_by_keywords(combined_text)

            metadata[difficulty].append(cat)
            total_processed += 1

            if total_processed % 500 == 0:
                print(f"  Processed {total_processed} questions...")
                # Save checkpoint every 500 questions
                metadata['_progress']['categorized'] = total_processed
                metadata['_progress']['last_updated'] = datetime.now().isoformat()
                with open('question_metadata.json', 'w') as f:
                    json.dump(metadata, f, indent=2, ensure_ascii=False)

    # Final save
    metadata['_progress']['categorized'] = total_processed
    metadata['_progress']['total_questions'] = sum(len(questions[d]) for d in ['preliminary', 'quarterfinals', 'semifinals', 'finals'])
    metadata['_progress']['last_updated'] = datetime.now().isoformat()

    with open('question_metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*60}")
    print(f"✓ CATEGORIZATION COMPLETE!")
    print(f"Total questions categorized: {total_processed}")
    print(f"{'='*60}")

if __name__ == '__main__':
    main()
