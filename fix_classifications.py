#!/usr/bin/env python3
"""
Comprehensive classification fix for question metadata.

This script:
1. Adds new region categories (e.g., "Americas (Pre-Columbian)")
2. Fixes impossible region + time period combinations
3. Analyzes question content to determine primary historical context

Impossible combinations to fix:
- United States + Ancient World (pre-500 CE) - US founded 1776
- United States + Medieval Era (500-1450) - US founded 1776
- Latin America & Caribbean + Ancient World (pre-500 CE) - Should be Pre-Columbian Americas
- Latin America & Caribbean + Medieval Era (500-1450) - Should be Pre-Columbian Americas
"""

import json
import re
from datetime import datetime
from collections import defaultdict

# =============================================================================
# DETECTION PATTERNS
# =============================================================================

# Pre-Columbian Americas indicators (Aztec, Maya, Inca, etc.)
PRE_COLUMBIAN_INDICATORS = [
    r'\b(Aztec|Mexica|Nahua|Nahuatl)\b',
    r'\b(Maya|Mayan|Yucatan)\b',
    r'\b(Inca|Incan|Quechua)\b',
    r'\b(Olmec|Toltec|Zapotec|Mixtec)\b',
    r'\b(Tenochtitlan|Teotihuacan|Chichen Itza|Machu Picchu|Cusco|Cuzco)\b',
    r'\b(Montezuma|Moctezuma|Atahualpa|Pachacuti)\b',
    r'\b(Popol Vuh|quipu|chinampa)\b',
    r'\b(mesoamerican|pre-columbian|pre-conquest)\b',
    r'\b(Cholula|Tlaxcala|Texcoco)\b',
    r'\b(Triple Alliance|Flower War)\b',
    r'\b(Popocatep|Iztaccihuatl)\b',  # Mexican volcanoes in legends
]

# Ancient World indicators (Rome, Greece, Egypt, Persia, etc.)
ANCIENT_INDICATORS = [
    # Ancient figures
    r'\b(Julius Caesar|Caesar Augustus|Augustus|Octavian|Brutus|Cassius|Mark Antony)\b',
    r'\b(Alexander the Great|Philip of Macedon|Socrates|Plato|Aristotle|Pericles|Themistocles)\b',
    r'\b(Hannibal|Scipio|Cato|Cicero|Nero|Caligula|Tiberius|Trajan|Hadrian|Marcus Aurelius)\b',
    r'\b(Vercingetorix|Commius|Boudicca)\b',
    r'\b(Pharaoh|Ramses|Ramesses|Tutankhamun|Cleopatra|Ptolemy|Nefertiti|Akhenaten)\b',
    r'\b(Xerxes|Darius|Cyrus the Great|Persian Empire)\b',
    r'\b(Hammurabi|Nebuchadnezzar|Gilgamesh|Sargon)\b',
    r'\b(Confucius|Qin Shi Huang|Han Dynasty|Zhou Dynasty)\b',
    r'\b(Ashoka|Chandragupta|Maurya)\b',

    # Ancient places and civilizations
    r'\b(Roman Empire|Roman Republic|SPQR)\b',
    r'\b(Ancient Greece|Ancient Rome|Ancient Egypt|Ancient Persia|Ancient China|Ancient India)\b',
    r'\b(Sparta|Spartan|Athens|Athenian|Macedon|Macedonian)\b',
    r'\b(Carthage|Carthaginian|Phoenicia|Phoenician)\b',
    r'\b(Mesopotamia|Babylon|Babylonian|Assyria|Assyrian|Sumer|Sumerian)\b',
    r'\b(Byzantine|Byzantium|Constantinople)\b',

    # Ancient events and battles
    r'\b(Punic War|Battle of Cannae|Battle of Zama|Battle of Actium|Battle of Thermopylae|Battle of Marathon|Battle of Salamis)\b',
    r'\b(Peloponnesian War|Trojan War|Gallic Wars)\b',
    r'\b(Ides of March|Rubicon|Alesia)\b',

    # Ancient structures
    r'\b(Colosseum|Pantheon|Parthenon|Acropolis|Pyramid of Giza|Sphinx|Great Wall)\b',

    # Time indicators
    r'\b(BCE|B\.C\.E\.|B\.C\.|BC)\b',
    r'\b\d+\s*(BCE|B\.C\.E\.|B\.C\.|BC)\b',

    # Ancient concepts
    r'\b(gladiator|centurion|tribune|consul|proconsul|praetor|legion|legionary)\b',
    r'\b(Pax Romana|Senate of Rome|Roman Senate)\b',
    r'\b(oracle|Delphi|Olympic Games)\b',
    r'\b(hieroglyph|papyrus|cuneiform)\b',
]

# Medieval indicators
MEDIEVAL_INDICATORS = [
    r'\b(medieval|Middle Ages|Dark Ages)\b',
    r'\b(feudal|feudalism|serfdom|serf|vassal|fief)\b',
    r'\b(Crusade|Crusader|Knights Templar|Teutonic|Hospitaller)\b',
    r'\b(Viking|Norse|Norsemen)\b',
    r'\b(Charlemagne|Carolingian|Merovingian)\b',
    r'\b(Magna Carta|Domesday Book)\b',
    r'\b(Black Death|bubonic plague)\b',
    r'\b(Holy Roman Empire|Papal States)\b',
    r'\b(William the Conqueror|Richard the Lionheart|Saladin)\b',
    r'\b(Genghis Khan|Mongol Empire|Kublai Khan)\b',
    r'\b(Hundred Years.? War|War of the Roses)\b',
    r'\b(castle|knight|jousting|chivalry)\b',
    r'\b(monastery|abbey|cathedral|Gothic architecture)\b',
    r'\b(Ottoman|Seljuk|Abbasid|Umayyad)\b',
]

# US-specific indicators (post-1776)
US_INDICATORS = [
    # US-specific offices and institutions
    r'\b(Attorney General|Secretary of State|President of the United States|POTUS)\b',
    r'\b(U\.?S\.? Supreme Court|U\.?S\.? Congress|U\.?S\.? Senate|House of Representatives)\b',
    r'\b(Constitutional Convention|Continental Congress|Founding Fathers)\b',
    r'\b(FBI|CIA|NSA|IRS|EPA|FDA)\b',
    r'\b(Democratic Party|Republican Party|Whig Party|Federalist Party)\b',

    # US-specific events
    r'\b(American Civil War|Revolutionary War|War of 1812|Spanish-American War|Mexican-American War)\b',
    r'\b(Civil Rights Movement|New Deal|Great Society|Watergate|Iran-Contra)\b',
    r'\b(Louisiana Purchase|Manifest Destiny|Reconstruction|Prohibition)\b',
    r'\b(Pearl Harbor|9/11|September 11)\b',
    r'\b(Gettysburg|Yorktown|Bunker Hill|Valley Forge|Antietam|Bull Run)\b',

    # US presidents and notable figures
    r'\b(George Washington|Thomas Jefferson|Abraham Lincoln|Theodore Roosevelt|Franklin Roosevelt|FDR)\b',
    r'\b(John Adams|James Madison|James Monroe|Andrew Jackson|Ulysses Grant)\b',
    r'\b(Woodrow Wilson|Harry Truman|Dwight Eisenhower|John F\.? Kennedy|JFK)\b',
    r'\b(Lyndon Johnson|LBJ|Richard Nixon|Ronald Reagan|Bill Clinton|Barack Obama)\b',
    r'\b(Alexander Hamilton|Benjamin Franklin|John Hancock|Patrick Henry)\b',
    r'\b(Martin Luther King|Rosa Parks|Frederick Douglass|Harriet Tubman)\b',
    r'\b(Spiro Agnew|Aaron Burr|John Wilkes Booth)\b',

    # US places
    r'\b(White House|Capitol Hill|Pentagon|Oval Office|Mount Rushmore)\b',
    r'\b(Ellis Island|Statue of Liberty|Liberty Bell)\b',

    # US documents and laws
    r'\b(Declaration of Independence|U\.?S\.? Constitution|Bill of Rights|Emancipation Proclamation)\b',
    r'\b(Monroe Doctrine|Truman Doctrine|Marshall Plan)\b',
    r'\b(Thirteenth Amendment|Fourteenth Amendment|Fifteenth Amendment|Nineteenth Amendment)\b',
]

# Colonial Americas (1492-1776) indicators
COLONIAL_AMERICAS_INDICATORS = [
    r'\b(Jamestown|Plymouth|Mayflower|Pilgrims|Puritans)\b',
    r'\b(Thirteen Colonies|colonial America|American colonies)\b',
    r'\b(conquistador|Cortes|Cortez|Pizarro|Coronado)\b',
    r'\b(Columbian Exchange|Christopher Columbus|1492)\b',
    r'\b(New Spain|New France|New England)\b',
    r'\b(Salem witch|French and Indian War|King Philip.?s War)\b',
    r'\b(Pocahontas|John Smith|Squanto)\b',
    r'\b(indentured servant|Middle Passage)\b',
]

# European indicators
EUROPE_INDICATORS = [
    r'\b(Europe|European)\b',
    r'\b(Britain|British|England|English|Scotland|Scottish|Wales|Welsh|Ireland|Irish)\b',
    r'\b(France|French|Paris|Versailles)\b',
    r'\b(Germany|German|Prussia|Prussian|Berlin)\b',
    r'\b(Italy|Italian|Rome|Venice|Florence|Milan)\b',
    r'\b(Spain|Spanish|Madrid|Castile|Aragon)\b',
    r'\b(Russia|Russian|Moscow|St\.? Petersburg|Soviet|USSR)\b',
    r'\b(Poland|Polish|Austria|Austrian|Hungary|Hungarian)\b',
    r'\b(Netherlands|Dutch|Belgium|Belgian|Switzerland|Swiss)\b',
    r'\b(Sweden|Swedish|Denmark|Danish|Norway|Norwegian|Finland|Finnish)\b',
    r'\b(Portugal|Portuguese|Greece|Greek)\b',
    r'\b(Napoleon|Bonaparte|Hitler|Stalin|Churchill|Bismarck)\b',
    r'\b(Renaissance|Reformation|Enlightenment)\b',
    r'\b(World War I|World War II|WWI|WWII|WW1|WW2)\b',
    r'\b(NATO|European Union|EU|Brexit)\b',
]

# Asia indicators
ASIA_INDICATORS = [
    r'\b(Asia|Asian)\b',
    r'\b(China|Chinese|Beijing|Shanghai|Hong Kong)\b',
    r'\b(Japan|Japanese|Tokyo|Kyoto|samurai|shogun)\b',
    r'\b(India|Indian|Delhi|Mumbai|Bombay|Gandhi)\b',
    r'\b(Korea|Korean|Seoul|Pyongyang)\b',
    r'\b(Vietnam|Vietnamese|Hanoi|Saigon)\b',
    r'\b(Thailand|Thai|Cambodia|Cambodian|Indonesia|Indonesian)\b',
    r'\b(Pakistan|Pakistani|Bangladesh|Bangladeshi)\b',
    r'\b(Mao|Zedong|Deng Xiaoping|Xi Jinping)\b',
    r'\b(Ming Dynasty|Qing Dynasty|Tang Dynasty|Song Dynasty)\b',
    r'\b(Meiji|Tokugawa|Hirohito)\b',
    r'\b(Korean War|Vietnam War|Sino-Japanese)\b',
]

# Middle East & North Africa indicators
MENA_INDICATORS = [
    r'\b(Middle East|Arab|Arabian)\b',
    r'\b(Israel|Israeli|Palestine|Palestinian|Jerusalem|Tel Aviv)\b',
    r'\b(Iraq|Iraqi|Baghdad|Iran|Iranian|Tehran|Persia|Persian)\b',
    r'\b(Syria|Syrian|Damascus|Lebanon|Lebanese|Beirut)\b',
    r'\b(Turkey|Turkish|Istanbul|Ankara|Ottoman)\b',
    r'\b(Egypt|Egyptian|Cairo|Nile)\b',
    r'\b(Saudi Arabia|Saudi|Mecca|Medina)\b',
    r'\b(Jordan|Jordanian|Kuwait|Kuwaiti|UAE|Dubai)\b',
    r'\b(Islam|Islamic|Muslim|Quran|Koran|Caliph|Caliphate|Sultan)\b',
    r'\b(Suez Canal|Gulf War|Arab Spring)\b',
    r'\b(Nasser|Sadat|Arafat|Netanyahu)\b',
]

# Africa (sub-Saharan) indicators
AFRICA_INDICATORS = [
    r'\b(Africa|African)\b',
    r'\b(Nigeria|Nigerian|Lagos)\b',
    r'\b(South Africa|Johannesburg|Cape Town|Apartheid|Mandela)\b',
    r'\b(Kenya|Kenyan|Nairobi)\b',
    r'\b(Ethiopia|Ethiopian|Addis Ababa)\b',
    r'\b(Congo|Congolese|Kinshasa)\b',
    r'\b(Ghana|Ghanaian|Zimbabwe|Zimbabwean)\b',
    r'\b(Rwanda|Rwandan|genocide)\b',
    r'\b(Sahara|Sahel|sub-Saharan)\b',
    r'\b(Zulu|Bantu|Swahili)\b',
    r'\b(colonialism|decolonization|scramble for Africa)\b',
]

# Latin America & Caribbean (post-colonial) indicators
LATIN_AMERICA_INDICATORS = [
    r'\b(Latin America|South America|Central America|Caribbean)\b',
    r'\b(Mexico|Mexican|Mexico City)\b',
    r'\b(Brazil|Brazilian|Rio de Janeiro|Sao Paulo)\b',
    r'\b(Argentina|Argentine|Buenos Aires)\b',
    r'\b(Chile|Chilean|Santiago)\b',
    r'\b(Colombia|Colombian|Bogota)\b',
    r'\b(Peru|Peruvian|Lima)\b',
    r'\b(Venezuela|Venezuelan|Caracas)\b',
    r'\b(Cuba|Cuban|Havana|Castro|Che Guevara)\b',
    r'\b(Bolivia|Bolivian|Bolivar|Simon Bolivar)\b',
    r'\b(Panama|Panamanian|Panama Canal)\b',
    r'\b(Puerto Rico|Dominican Republic|Haiti|Haitian)\b',
    r'\b(Zapata|Villa|Mexican Revolution)\b',
    r'\b(Pinochet|Peron|Allende)\b',
]

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def count_matches(text, patterns):
    """Count how many patterns match in the text."""
    count = 0
    for pattern in patterns:
        if re.search(pattern, text, re.IGNORECASE):
            count += 1
    return count

def get_year_from_text(text):
    """Extract years mentioned in the text."""
    years = []
    # Match 4-digit years
    for match in re.finditer(r'\b(1[0-9]{3}|20[0-2][0-9])\b', text):
        years.append(int(match.group(1)))
    # Match BC/BCE years
    for match in re.finditer(r'\b(\d+)\s*(BCE|B\.C\.E\.|B\.C\.|BC)\b', text, re.IGNORECASE):
        years.append(-int(match.group(1)))  # Negative for BC
    return years

def determine_time_period(years, text):
    """Determine time period based on years and text content."""
    if not years:
        # Check text indicators
        if count_matches(text, ANCIENT_INDICATORS) > 0:
            return "Ancient World (pre-500 CE)"
        if count_matches(text, MEDIEVAL_INDICATORS) > 0:
            return "Medieval Era (500-1450)"
        return None

    avg_year = sum(years) / len(years)

    if avg_year < 500:
        return "Ancient World (pre-500 CE)"
    elif avg_year < 1450:
        return "Medieval Era (500-1450)"
    elif avg_year < 1750:
        return "Early Modern (1450-1750)"
    elif avg_year < 1850:
        return "Age of Revolutions (1750-1850)"
    elif avg_year < 1914:
        return "Industrial & Imperial Age (1850-1914)"
    elif avg_year < 1945:
        return "World Wars & Interwar (1914-1945)"
    else:
        return "Contemporary Era (1945-present)"

def analyze_question(question_text, answer_text):
    """
    Analyze a question to determine correct region and time period.
    Returns dict with 'regions' and 'time_periods' lists.
    """
    combined = question_text + ' ' + answer_text

    result = {
        'regions': [],
        'time_periods': [],
        'is_pre_columbian': False,
    }

    # Check for Pre-Columbian Americas first (special case)
    pre_columbian_score = count_matches(combined, PRE_COLUMBIAN_INDICATORS)
    if pre_columbian_score >= 1:
        result['regions'].append('Americas (Pre-Columbian)')
        result['time_periods'].append('Ancient World (pre-500 CE)')
        result['is_pre_columbian'] = True
        # Don't return yet - might have other regions too

    # Check for Ancient content
    ancient_score = count_matches(combined, ANCIENT_INDICATORS)
    medieval_score = count_matches(combined, MEDIEVAL_INDICATORS)

    # Check for US content
    us_score = count_matches(combined, US_INDICATORS)
    colonial_score = count_matches(combined, COLONIAL_AMERICAS_INDICATORS)

    # Check other regions
    europe_score = count_matches(combined, EUROPE_INDICATORS)
    asia_score = count_matches(combined, ASIA_INDICATORS)
    mena_score = count_matches(combined, MENA_INDICATORS)
    africa_score = count_matches(combined, AFRICA_INDICATORS)
    latam_score = count_matches(combined, LATIN_AMERICA_INDICATORS)

    # Determine regions
    if us_score >= 2 or (us_score >= 1 and colonial_score == 0 and ancient_score == 0):
        result['regions'].append('United States')

    if colonial_score >= 1 and us_score < 2:
        # Colonial period - could be US or Latin America
        if 'Americas (Pre-Columbian)' not in result['regions']:
            result['regions'].append('Americas (Colonial)')

    if europe_score >= 2:
        result['regions'].append('Europe')

    if asia_score >= 2:
        result['regions'].append('Asia')

    if mena_score >= 2:
        result['regions'].append('Middle East & North Africa')

    if africa_score >= 2 and 'Middle East & North Africa' not in result['regions']:
        result['regions'].append('Africa')

    if latam_score >= 2 and 'Americas (Pre-Columbian)' not in result['regions']:
        result['regions'].append('Latin America & Caribbean')

    # Determine time periods
    years = get_year_from_text(combined)

    if ancient_score >= 2 and not result['is_pre_columbian']:
        result['time_periods'].append('Ancient World (pre-500 CE)')

    if medieval_score >= 2:
        result['time_periods'].append('Medieval Era (500-1450)')

    # Use years if available
    if years:
        period = determine_time_period(years, combined)
        if period and period not in result['time_periods']:
            result['time_periods'].append(period)

    return result

def fix_impossible_combination(qid, meta, question_text, answer_text):
    """
    Fix an impossible region + time period combination.
    Returns updated metadata dict and a description of what was changed.
    """
    combined = question_text + ' ' + answer_text
    regions = meta.get('regions', [])
    time_periods = meta.get('time_periods', [])
    changes = []

    # Analyze the question
    analysis = analyze_question(question_text, answer_text)

    # Check for US + Ancient/Medieval
    if 'United States' in regions:
        if 'Ancient World (pre-500 CE)' in time_periods:
            # Is it actually ancient content or US content with ancient reference?
            ancient_score = count_matches(combined, ANCIENT_INDICATORS)
            us_score = count_matches(combined, US_INDICATORS)
            pre_columbian_score = count_matches(combined, PRE_COLUMBIAN_INDICATORS)

            if pre_columbian_score >= 1:
                # Pre-Columbian content - change region
                meta['regions'] = [r for r in regions if r != 'United States']
                meta['regions'].append('Americas (Pre-Columbian)')
                changes.append(f"Changed 'United States' to 'Americas (Pre-Columbian)'")
            elif ancient_score > us_score:
                # Actually ancient content - remove US, add appropriate region
                meta['regions'] = [r for r in regions if r != 'United States']
                if not meta['regions']:
                    # Determine ancient region
                    if count_matches(combined, [r'\b(Rome|Roman|Italy|Latin|Caesar|Cicero|Nero)\b']) > 0:
                        meta['regions'] = ['Europe']
                    elif count_matches(combined, [r'\b(Greece|Greek|Athens|Sparta|Alexander)\b']) > 0:
                        meta['regions'] = ['Europe']
                    elif count_matches(combined, [r'\b(Egypt|Pharaoh|Nile|Pyramid)\b']) > 0:
                        meta['regions'] = ['Africa']
                    elif count_matches(combined, [r'\b(Persia|Persian|Mesopotamia|Babylon)\b']) > 0:
                        meta['regions'] = ['Middle East & North Africa']
                    elif count_matches(combined, [r'\b(China|Chinese|India|Indian)\b']) > 0:
                        meta['regions'] = ['Asia']
                    else:
                        meta['regions'] = ['Europe']
                changes.append(f"Removed 'United States' (ancient content)")
            else:
                # Actually US content - remove Ancient
                meta['time_periods'] = [t for t in time_periods if t != 'Ancient World (pre-500 CE)']
                if not meta['time_periods']:
                    # Determine appropriate US time period
                    years = get_year_from_text(combined)
                    if years:
                        meta['time_periods'] = [determine_time_period(years, combined)]
                    else:
                        meta['time_periods'] = ['Contemporary Era (1945-present)']
                changes.append(f"Removed 'Ancient World' (US content)")

        if 'Medieval Era (500-1450)' in time_periods:
            medieval_score = count_matches(combined, MEDIEVAL_INDICATORS)
            us_score = count_matches(combined, US_INDICATORS)

            if medieval_score > us_score:
                # Actually medieval content - remove US
                meta['regions'] = [r for r in regions if r != 'United States']
                if not meta['regions']:
                    meta['regions'] = ['Europe']
                changes.append(f"Removed 'United States' (medieval content)")
            else:
                # Actually US content - remove Medieval
                meta['time_periods'] = [t for t in time_periods if t != 'Medieval Era (500-1450)']
                if not meta['time_periods']:
                    years = get_year_from_text(combined)
                    if years:
                        meta['time_periods'] = [determine_time_period(years, combined)]
                    else:
                        meta['time_periods'] = ['Contemporary Era (1945-present)']
                changes.append(f"Removed 'Medieval Era' (US content)")

    # Check for Latin America + Ancient/Medieval
    if 'Latin America & Caribbean' in regions:
        if 'Ancient World (pre-500 CE)' in time_periods or 'Medieval Era (500-1450)' in time_periods:
            pre_columbian_score = count_matches(combined, PRE_COLUMBIAN_INDICATORS)
            latam_score = count_matches(combined, LATIN_AMERICA_INDICATORS)

            if pre_columbian_score >= 1:
                # Pre-Columbian content - change region
                meta['regions'] = [r for r in regions if r != 'Latin America & Caribbean']
                if 'Americas (Pre-Columbian)' not in meta['regions']:
                    meta['regions'].append('Americas (Pre-Columbian)')
                changes.append(f"Changed 'Latin America & Caribbean' to 'Americas (Pre-Columbian)'")
            elif latam_score > 0:
                # Modern Latin America content - remove ancient/medieval
                meta['time_periods'] = [t for t in time_periods
                                        if t not in ['Ancient World (pre-500 CE)', 'Medieval Era (500-1450)']]
                if not meta['time_periods']:
                    years = get_year_from_text(combined)
                    if years:
                        meta['time_periods'] = [determine_time_period(years, combined)]
                    else:
                        meta['time_periods'] = ['Contemporary Era (1945-present)']
                changes.append(f"Removed impossible time period (Latin America content)")

    return meta, changes

# =============================================================================
# MAIN
# =============================================================================

def main():
    print("Loading questions and metadata...")

    with open('questions.json', 'r', encoding='utf-8') as f:
        questions_data = json.load(f)

    with open('question_metadata.json', 'r', encoding='utf-8') as f:
        metadata = json.load(f)

    # Build lookup
    questions_lookup = {}
    for category in ['preliminary', 'quarterfinals', 'semifinals', 'finals']:
        for q in questions_data.get(category, []):
            if isinstance(q, dict):
                questions_lookup[q.get('id')] = q

    # Track statistics
    stats = defaultdict(int)
    all_changes = []

    categories = metadata.get('categories', {})

    print("\nAnalyzing questions for impossible combinations...")
    print("=" * 80)

    for qid, meta in categories.items():
        regions = meta.get('regions', [])
        time_periods = meta.get('time_periods', [])

        # Check for impossible combinations
        has_impossible = False

        if 'United States' in regions:
            if 'Ancient World (pre-500 CE)' in time_periods:
                has_impossible = True
                stats['US + Ancient'] += 1
            if 'Medieval Era (500-1450)' in time_periods:
                has_impossible = True
                stats['US + Medieval'] += 1

        if 'Latin America & Caribbean' in regions:
            if 'Ancient World (pre-500 CE)' in time_periods:
                has_impossible = True
                stats['LatAm + Ancient'] += 1
            if 'Medieval Era (500-1450)' in time_periods:
                has_impossible = True
                stats['LatAm + Medieval'] += 1

        if has_impossible:
            q = questions_lookup.get(qid, {})
            question_text = q.get('question', '')
            answer_text = q.get('answer', '')

            updated_meta, changes = fix_impossible_combination(qid, meta, question_text, answer_text)

            if changes:
                categories[qid] = updated_meta
                all_changes.append((qid, changes))
                print(f"{qid}: {'; '.join(changes)}")

    # Save updated metadata
    metadata['_progress']['last_updated'] = datetime.now().isoformat()

    with open('question_metadata.json', 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    # Print summary
    print("\n" + "=" * 80)
    print("RECLASSIFICATION COMPLETE")
    print("=" * 80)
    print("\nImpossible combinations found:")
    for combo, count in sorted(stats.items()):
        print(f"  {combo}: {count}")
    print(f"\nTotal questions fixed: {len(all_changes)}")
    print(f"\nMetadata saved to question_metadata.json")

    # Check for new regions that were added
    new_regions = set()
    for qid, meta in categories.items():
        for region in meta.get('regions', []):
            new_regions.add(region)

    print(f"\nAll regions in metadata:")
    for region in sorted(new_regions):
        print(f"  - {region}")


if __name__ == '__main__':
    main()
