#!/usr/bin/env python3
"""
Question Classification Script for National History Bee

Classifies questions by analyzing their content to determine:
- Regions (geographic focus)
- Time periods (historical era)
- Answer type (what kind of thing is being asked about)
- Subject themes (topical categories)

This script handles impossible combinations (e.g., US + Ancient) during
initial classification rather than requiring a separate fix pass.
"""

import json
import re
import sys
from datetime import datetime
from collections import defaultdict

# =============================================================================
# CONFIGURATION
# =============================================================================

QUESTIONS_FILE = "questions.json"
METADATA_FILE = "question_metadata.json"

# Valid categories
REGIONS = [
    "United States",
    "Europe",
    "Asia",
    "Latin America & Caribbean",
    "Americas (Pre-Columbian)",
    "Africa",
    "Middle East & North Africa",
    "Global/Multi-Regional"
]

TIME_PERIODS = [
    "Ancient World (pre-500 CE)",
    "Medieval Era (500-1450)",
    "Early Modern (1450-1750)",
    "Age of Revolutions (1750-1850)",
    "Industrial & Imperial Age (1850-1914)",
    "World Wars & Interwar (1914-1945)",
    "Contemporary Era (1945-present)"
]

ANSWER_TYPES = [
    "People & Biography",
    "Events (Wars, Battles, Revolutions)",
    "Documents, Laws & Treaties",
    "Places, Cities & Civilizations",
    "Religion & Mythology",
    "Cultural History (Art, Literature, Music)",
    "Science, Technology & Innovation",
    "Groups, Organizations & Institutions",
    "Ideas, Ideologies & Philosophies",
    "Economic History & Trade",
    "Geography & Environment",
    "Political History & Diplomacy",
    "Social History & Daily Life"
]

SUBJECT_THEMES = [
    "Political & Governmental",
    "Military & Conflict",
    "Social Movements & Culture",
    "Economic & Trade",
    "Religion & Philosophy",
    "Science & Technology",
    "Arts & Literature"
]

# =============================================================================
# DETECTION PATTERNS - Organized by specificity
# =============================================================================

# Pre-Columbian Americas (HIGH PRIORITY - check first)
PRE_COLUMBIAN_PATTERNS = [
    r'\b(Aztec|Mexica|Nahua|Nahuatl)\b',
    r'\b(Maya|Mayan)\b',
    r'\b(Inca|Incan|Quechua)\b',
    r'\b(Olmec|Toltec|Zapotec|Mixtec)\b',
    r'\b(Tenochtitlan|Teotihuacan|Chichen Itza|Machu Picchu|Cusco|Cuzco)\b',
    r'\b(Montezuma|Moctezuma|Atahualpa|Pachacuti)\b',
    r'\b(Popol Vuh|quipu|chinampa)\b',
    r'\b(mesoamerican|pre-columbian|pre-conquest)\b',
    r'\b(Cholula|Tlaxcala|Texcoco)\b',
    r'\b(Triple Alliance|Flower War)\b',
]

# Ancient World indicators (HIGH PRIORITY - determines time period first)
ANCIENT_PATTERNS = [
    # Explicit time markers
    r'\b(BCE|B\.C\.E\.|B\.C\.|BC)\b',
    r'\b(ancient|antiquity)\b',

    # Ancient Rome
    r'\b(Julius Caesar|Caesar Augustus|Augustus|Octavian)\b',
    r'\b(Brutus|Cassius|Mark Antony|Cicero|Cato)\b',
    r'\b(Nero|Caligula|Tiberius|Trajan|Hadrian|Marcus Aurelius|Constantine)\b',
    r'\b(Roman Empire|Roman Republic|SPQR|Ancient Rome)\b',
    r'\b(Punic War|Gallic Wars|Battle of Cannae|Battle of Zama|Battle of Actium)\b',
    r'\b(Ides of March|crossing the Rubicon|Rubicon River)\b',
    r'\b(gladiator|centurion|legion|legionary|tribune|consul|proconsul|praetor)\b',
    r'\b(Colosseum|Pantheon|Pax Romana|Roman Senate)\b',
    r'\b(Hannibal|Scipio|Vercingetorix|Commius|Boudicca)\b',

    # Ancient Greece
    r'\b(Ancient Greece|Sparta|Spartan|Athens|Athenian|Macedon|Macedonian)\b',
    r'\b(Alexander the Great|Philip of Macedon)\b',
    r'\b(Socrates|Plato|Aristotle|Pericles|Themistocles)\b',
    r'\b(Peloponnesian War|Trojan War|Battle of Thermopylae|Battle of Marathon|Battle of Salamis)\b',
    r'\b(Parthenon|Acropolis|oracle|Delphi)\b',

    # Ancient Egypt
    r'\b(Ancient Egypt|Pharaoh|Pyramid of Giza|Sphinx)\b',
    r'\b(Ramses|Ramesses|Tutankhamun|Cleopatra|Ptolemy|Nefertiti|Akhenaten)\b',
    r'\b(hieroglyph|papyrus)\b',

    # Ancient Middle East
    r'\b(Mesopotamia|Babylon|Babylonian|Assyria|Assyrian|Sumer|Sumerian)\b',
    r'\b(Persian Empire|Achaemenid)\b',
    r'\b(Cyrus the Great|Darius|Xerxes)\b',
    r'\b(Hammurabi|Nebuchadnezzar|Gilgamesh|Sargon)\b',
    r'\b(Carthage|Carthaginian|Phoenicia|Phoenician)\b',
    r'\b(cuneiform)\b',

    # Ancient Asia
    r'\b(Confucius|Buddha|Siddhartha)\b',
    r'\b(Qin Shi Huang|Han Dynasty|Zhou Dynasty)\b',
    r'\b(Ashoka|Chandragupta|Maurya)\b',
]

# Medieval indicators (HIGH PRIORITY)
MEDIEVAL_PATTERNS = [
    r'\b(medieval|Middle Ages|Dark Ages)\b',
    r'\b(feudal|feudalism|serf|serfdom|vassal|fief|manor)\b',
    r'\b(Crusade|Crusader|Knights Templar|Teutonic|Hospitaller)\b',
    r'\b(Viking|Norse|Norsemen|Varangian)\b',
    r'\b(Charlemagne|Carolingian|Merovingian)\b',
    r'\b(Magna Carta|Domesday Book)\b',
    r'\b(Black Death|bubonic plague)\b',
    r'\b(Holy Roman Empire|Papal States)\b',
    r'\b(William the Conqueror|Richard the Lionheart|Saladin)\b',
    r'\b(Genghis Khan|Mongol Empire|Kublai Khan|Golden Horde)\b',
    r'\b(Hundred Years.? War|War of the Roses)\b',
    r'\b(Byzantine|Byzantium|Constantinople)\b',
    r'\b(Ottoman|Seljuk|Abbasid|Umayyad)\b',
    r'\b(castle|knight|jousting|chivalry|heraldry)\b',
    r'\b(monastery|abbey|Gothic cathedral)\b',
    r'\b(Norman Conquest|Battle of Hastings)\b',
    r'\b(Inquisition|heresy)\b',
]

# US-specific indicators (only valid for post-1776)
US_PATTERNS = [
    # US offices and institutions
    r'\b(President of the United States|POTUS|Vice President)\b',
    r'\b(U\.?S\.? Supreme Court|U\.?S\.? Congress|U\.?S\.? Senate)\b',
    r'\b(House of Representatives|Constitutional Convention)\b',
    r'\b(Continental Congress|Founding Fathers|Framers)\b',
    r'\b(FBI|CIA|NSA|IRS|EPA|FDA|NASA)\b',
    r'\b(Democratic Party|Republican Party|Whig Party|Federalist Party)\b',
    r'\b(Attorney General|Secretary of State|Secretary of)\b',

    # US events
    r'\b(American Civil War|Union Army|Confederate|Confederacy)\b',
    r'\b(Revolutionary War|American Revolution)\b',
    r'\b(War of 1812|Spanish-American War|Mexican-American War)\b',
    r'\b(Civil Rights Movement|New Deal|Great Society|Watergate)\b',
    r'\b(Louisiana Purchase|Manifest Destiny|Reconstruction)\b',
    r'\b(Pearl Harbor|9/11|September 11)\b',
    r'\b(Gettysburg|Yorktown|Bunker Hill|Valley Forge|Antietam|Bull Run)\b',
    r'\b(Boston Tea Party|Boston Massacre)\b',

    # US presidents
    r'\b(George Washington|Thomas Jefferson|Abraham Lincoln)\b',
    r'\b(Theodore Roosevelt|Franklin Roosevelt|FDR)\b',
    r'\b(John Adams|James Madison|James Monroe|Andrew Jackson)\b',
    r'\b(Ulysses Grant|Woodrow Wilson|Harry Truman)\b',
    r'\b(Dwight Eisenhower|John F\.? Kennedy|JFK)\b',
    r'\b(Lyndon Johnson|LBJ|Richard Nixon|Gerald Ford)\b',
    r'\b(Jimmy Carter|Ronald Reagan|George H\.?W\.? Bush)\b',
    r'\b(Bill Clinton|George W\.? Bush|Barack Obama|Donald Trump|Joe Biden)\b',

    # Other US figures
    r'\b(Alexander Hamilton|Benjamin Franklin|John Hancock|Patrick Henry)\b',
    r'\b(Martin Luther King|Rosa Parks|Frederick Douglass|Harriet Tubman)\b',
    r'\b(Robert E\.? Lee|Stonewall Jackson|Ulysses S\.? Grant)\b',
    r'\b(Aaron Burr|John Wilkes Booth|Lee Harvey Oswald)\b',
    r'\b(Spiro Agnew)\b',

    # US places
    r'\b(White House|Capitol Hill|Pentagon|Oval Office|Mount Rushmore)\b',
    r'\b(Ellis Island|Statue of Liberty|Liberty Bell)\b',

    # US documents
    r'\b(Declaration of Independence|U\.?S\.? Constitution|Bill of Rights)\b',
    r'\b(Emancipation Proclamation|Gettysburg Address)\b',
    r'\b(Monroe Doctrine|Truman Doctrine|Marshall Plan)\b',
    r'\b(Federalist Papers|Articles of Confederation)\b',
    r'\b(Thirteenth Amendment|Fourteenth Amendment|Fifteenth Amendment|Nineteenth Amendment)\b',
]

# Colonial Americas (1492-1776)
COLONIAL_AMERICAS_PATTERNS = [
    r'\b(Jamestown|Plymouth|Mayflower|Pilgrims|Puritans)\b',
    r'\b(Thirteen Colonies|colonial America|American colonies)\b',
    r'\b(conquistador|Cortes|Cortez|Pizarro|Coronado)\b',
    r'\b(Columbian Exchange|Christopher Columbus|1492)\b',
    r'\b(New Spain|New France|New England)\b',
    r'\b(Salem witch|French and Indian War|King Philip.?s War)\b',
    r'\b(Pocahontas|John Smith|Squanto)\b',
    r'\b(indentured servant|Middle Passage)\b',
]

# Europe patterns
EUROPE_PATTERNS = [
    # Countries
    r'\b(Britain|British|England|English|United Kingdom|UK)\b',
    r'\b(Scotland|Scottish|Wales|Welsh|Ireland|Irish)\b',
    r'\b(France|French|Paris|Versailles|Gaul|Gallic)\b',
    r'\b(Germany|German|Prussia|Prussian|Berlin|Bavaria)\b',
    r'\b(Italy|Italian|Venice|Florence|Milan)\b',
    r'\b(Spain|Spanish|Madrid|Castile|Aragon|Catalonia)\b',
    r'\b(Russia|Russian|Moscow|St\.? Petersburg|Soviet|USSR)\b',
    r'\b(Poland|Polish|Austria|Austrian|Hungary|Hungarian)\b',
    r'\b(Netherlands|Dutch|Belgium|Belgian|Switzerland|Swiss)\b',
    r'\b(Sweden|Swedish|Denmark|Danish|Norway|Norwegian)\b',
    r'\b(Finland|Finnish|Portugal|Portuguese|Greece|Greek)\b',
    r'\b(Czech|Czechoslovakia|Yugoslavia|Serbia|Croatia)\b',
    r'\b(Romania|Bulgarian|Ukraine|Ukrainian)\b',

    # European figures
    r'\b(Napoleon|Bonaparte|Hitler|Stalin|Churchill|Bismarck)\b',
    r'\b(Queen Victoria|Henry VIII|Elizabeth I|Elizabeth II)\b',
    r'\b(Louis XIV|Louis XVI|Marie Antoinette)\b',
    r'\b(Kaiser Wilhelm|Frederick the Great|Catherine the Great)\b',
    r'\b(Lenin|Trotsky|Gorbachev|Khrushchev)\b',
    r'\b(Mussolini|Franco|De Gaulle)\b',

    # European events/concepts
    r'\b(Renaissance|Reformation|Enlightenment|Industrial Revolution)\b',
    r'\b(World War I|World War II|WWI|WWII|WW1|WW2)\b',
    r'\b(Cold War|Iron Curtain|Berlin Wall)\b',
    r'\b(French Revolution|Russian Revolution|Bolshevik)\b',
    r'\b(Hundred Years.? War|Thirty Years.? War|Seven Years.? War)\b',
    r'\b(NATO|European Union|EU|Brexit|Common Market)\b',
    r'\b(Holocaust|Auschwitz|Normandy|D-Day)\b',
    r'\b(Treaty of Versailles|Congress of Vienna)\b',
]

# Asia patterns
ASIA_PATTERNS = [
    # Countries
    r'\b(China|Chinese|Beijing|Shanghai|Hong Kong|Taiwan)\b',
    r'\b(Japan|Japanese|Tokyo|Kyoto|Osaka)\b',
    r'\b(India|Indian|Delhi|Mumbai|Bombay|Calcutta|Kolkata)\b',
    r'\b(Korea|Korean|Seoul|Pyongyang|North Korea|South Korea)\b',
    r'\b(Vietnam|Vietnamese|Hanoi|Saigon|Ho Chi Minh)\b',
    r'\b(Thailand|Thai|Cambodia|Cambodian|Khmer)\b',
    r'\b(Indonesia|Indonesian|Philippines|Filipino|Malaysia)\b',
    r'\b(Pakistan|Pakistani|Bangladesh|Bangladeshi|Sri Lanka)\b',
    r'\b(Myanmar|Burma|Burmese|Singapore|Laos)\b',
    r'\b(Mongolia|Mongolian|Tibet|Tibetan)\b',

    # Asian figures
    r'\b(Mao|Zedong|Mao Tse-tung|Deng Xiaoping|Xi Jinping)\b',
    r'\b(Gandhi|Nehru|Indira Gandhi)\b',
    r'\b(Hirohito|Emperor Meiji|Tojo)\b',
    r'\b(Kim Il-sung|Kim Jong)\b',
    r'\b(Sun Yat-sen|Chiang Kai-shek)\b',

    # Asian events/concepts
    r'\b(Korean War|Vietnam War|Sino-Japanese)\b',
    r'\b(Opium War|Boxer Rebellion|Tiananmen)\b',
    r'\b(Hiroshima|Nagasaki)\b',
    r'\b(Ming Dynasty|Qing Dynasty|Tang Dynasty|Song Dynasty)\b',
    r'\b(Meiji Restoration|Tokugawa|shogun|samurai)\b',
    r'\b(Silk Road|Great Wall of China)\b',
    r'\b(Hinduism|Buddhism|Confucianism|Shinto)\b',
    r'\b(Mughal|Raj|British India|East India Company)\b',
]

# Middle East & North Africa patterns
MENA_PATTERNS = [
    # Countries/Regions
    r'\b(Middle East|Near East)\b',
    r'\b(Israel|Israeli|Palestine|Palestinian|Jerusalem|Tel Aviv)\b',
    r'\b(Iraq|Iraqi|Baghdad)\b',
    r'\b(Iran|Iranian|Tehran|Persia|Persian)\b',
    r'\b(Syria|Syrian|Damascus)\b',
    r'\b(Turkey|Turkish|Istanbul|Ankara|Ottoman)\b',
    r'\b(Egypt|Egyptian|Cairo|Alexandria|Nile)\b',
    r'\b(Saudi Arabia|Saudi|Mecca|Medina)\b',
    r'\b(Lebanon|Lebanese|Beirut|Jordan|Jordanian)\b',
    r'\b(Kuwait|Kuwaiti|UAE|Dubai|Qatar|Bahrain)\b',
    r'\b(Libya|Libyan|Tunisia|Tunisian|Algeria|Algerian|Morocco|Moroccan)\b',
    r'\b(Yemen|Yemeni|Oman)\b',

    # Figures
    r'\b(Nasser|Sadat|Mubarak|Arafat|Netanyahu)\b',
    r'\b(Saddam Hussein|Khomeini|Ataturk)\b',
    r'\b(Suleiman the Magnificent)\b',
    r'\b(Muhammad|Mohammed|Prophet)\b',

    # Events/Concepts
    r'\b(Islam|Islamic|Muslim|Quran|Koran)\b',
    r'\b(Caliph|Caliphate|Sultan|Sultanate)\b',
    r'\b(Arab Spring|Gulf War|Iran-Iraq War)\b',
    r'\b(Suez Canal|Suez Crisis)\b',
    r'\b(Six-Day War|Yom Kippur War|Camp David)\b',
    r'\b(Safavid)\b',
    r'\b(Crusade|Crusader|Holy Land)\b',
    r'\b(Zionism|Zionist|Balfour Declaration)\b',
]

# Africa (sub-Saharan) patterns
AFRICA_PATTERNS = [
    # Countries
    r'\b(Nigeria|Nigerian|Lagos|Abuja)\b',
    r'\b(South Africa|Johannesburg|Cape Town|Pretoria)\b',
    r'\b(Kenya|Kenyan|Nairobi)\b',
    r'\b(Ethiopia|Ethiopian|Addis Ababa|Abyssinia)\b',
    r'\b(Congo|Congolese|Kinshasa|Zaire)\b',
    r'\b(Ghana|Ghanaian|Accra)\b',
    r'\b(Zimbabwe|Zimbabwean|Rhodesia)\b',
    r'\b(Tanzania|Tanzanian|Uganda|Ugandan)\b',
    r'\b(Rwanda|Rwandan|Burundi)\b',
    r'\b(Sudan|Sudanese|Khartoum)\b',
    r'\b(Senegal|Ivory Coast|Mali|Niger)\b',
    r'\b(Angola|Angolan|Mozambique)\b',
    r'\b(Botswana|Namibia|Zambia)\b',

    # Figures
    r'\b(Mandela|Nelson Mandela)\b',
    r'\b(Desmond Tutu|Steve Biko)\b',
    r'\b(Haile Selassie|Idi Amin|Mugabe)\b',
    r'\b(Shaka Zulu|Mansa Musa)\b',

    # Events/Concepts
    r'\b(Apartheid|anti-apartheid)\b',
    r'\b(Rwandan genocide|Darfur)\b',
    r'\b(Scramble for Africa|decolonization)\b',
    r'\b(Zulu|Bantu|Swahili)\b',
    r'\b(Sahara|Sahel|sub-Saharan)\b',
    r'\b(Timbuktu|Great Zimbabwe)\b',
    r'\b(slave trade)\b',
    r'\b(Boer War|Mau Mau)\b',
]

# Latin America & Caribbean patterns
LATIN_AMERICA_PATTERNS = [
    # Countries
    r'\b(Mexico|Mexican|Mexico City)\b',
    r'\b(Brazil|Brazilian|Rio de Janeiro|Sao Paulo|Brasilia)\b',
    r'\b(Argentina|Argentine|Buenos Aires)\b',
    r'\b(Chile|Chilean|Santiago)\b',
    r'\b(Colombia|Colombian|Bogota)\b',
    r'\b(Peru|Peruvian|Lima)\b',
    r'\b(Venezuela|Venezuelan|Caracas)\b',
    r'\b(Cuba|Cuban|Havana)\b',
    r'\b(Bolivia|Bolivian|La Paz)\b',
    r'\b(Ecuador|Ecuadorian|Quito)\b',
    r'\b(Paraguay|Paraguayan|Uruguay|Uruguayan)\b',
    r'\b(Panama|Panamanian|Panama Canal)\b',
    r'\b(Puerto Rico|Dominican Republic|Haiti|Haitian|Jamaica)\b',
    r'\b(Guatemala|Honduras|El Salvador|Nicaragua|Costa Rica)\b',

    # Figures
    r'\b(Simon Bolivar|Bolivar)\b',
    r'\b(Fidel Castro|Castro|Che Guevara|Raul Castro)\b',
    r'\b(Peron|Eva Peron|Evita)\b',
    r'\b(Pinochet|Allende)\b',
    r'\b(Zapata|Pancho Villa|Mexican Revolution)\b',
    r'\b(Toussaint Louverture|Duvalier)\b',

    # Events/Concepts
    r'\b(Latin America|South America|Central America|Caribbean)\b',
    r'\b(Bay of Pigs|Cuban Missile Crisis)\b',
    r'\b(Falklands War|Malvinas)\b',
    r'\b(Dirty War|Desaparecidos)\b',
    r'\b(Sandinista|Contra|FARC)\b',
    r'\b(Organization of American States|OAS)\b',
]

# Global/Multi-Regional patterns
GLOBAL_PATTERNS = [
    r'\b(United Nations|UN|UNESCO|WHO|IMF|World Bank)\b',
    r'\b(World War|global|international|worldwide)\b',
    r'\b(League of Nations)\b',
    r'\b(globalization|multinational)\b',
]

# =============================================================================
# TIME PERIOD PATTERNS (for questions without clear ancient/medieval markers)
# =============================================================================

TIME_PERIOD_YEAR_PATTERNS = {
    'Early Modern (1450-1750)': [
        r'\b(Renaissance|Reformation|Counter-Reformation)\b',
        r'\b(Protestant|Protestantism|Luther|Calvin|Calvinist)\b',
        r'\b(Elizabethan|Tudor|Stuart)\b',
        r'\b(Thirty Years.? War|War of Spanish Succession)\b',
        r'\b(Columbus|Magellan|Vasco da Gama)\b',
        r'\b(colonization|New World)\b',
        r'\b(Shakespeare|Gutenberg|Leonardo|Michelangelo|Galileo)\b',
        r'\b(Louis XIV|Sun King)\b',
        r'\b(Peter the Great|Ivan the Terrible)\b',
        r'\b(Spanish Armada|English Civil War)\b',
        r'\b(Age of Reason)\b',
    ],
    'Age of Revolutions (1750-1850)': [
        r'\b(American Revolution|Revolutionary War|1776)\b',
        r'\b(French Revolution|Bastille|guillotine|Robespierre|Jacobin)\b',
        r'\b(Napoleonic|Waterloo|Congress of Vienna)\b',
        r'\b(Haitian Revolution)\b',
        r'\b(Latin American independence)\b',
        r'\b(War of 1812)\b',
    ],
    'Industrial & Imperial Age (1850-1914)': [
        r'\b(Victorian|Queen Victoria)\b',
        r'\b(American Civil War|1861|1865)\b',
        r'\b(Reconstruction|Jim Crow)\b',
        r'\b(German unification|Franco-Prussian)\b',
        r'\b(Meiji Restoration)\b',
        r'\b(imperialism|Scramble for Africa)\b',
        r'\b(Spanish-American War|1898)\b',
        r'\b(Boer War)\b',
        r'\b(Boxer Rebellion)\b',
        r'\b(Gilded Age|Progressive Era)\b',
        r'\b(suffrage|suffragette)\b',
    ],
    'World Wars & Interwar (1914-1945)': [
        r'\b(World War I|World War II|WWI|WWII|WW1|WW2|First World War|Second World War)\b',
        r'\b(1914|1918|1939|1941|1945)\b',
        r'\b(Treaty of Versailles|League of Nations)\b',
        r'\b(Great Depression|New Deal|1929)\b',
        r'\b(Nazi|Third Reich|Holocaust|Auschwitz)\b',
        r'\b(Fascist|fascism)\b',
        r'\b(Pearl Harbor|D-Day|Normandy)\b',
        r'\b(Hiroshima|Nagasaki|atomic bomb|Manhattan Project)\b',
        r'\b(Trench warfare|Somme|Verdun|Gallipoli)\b',
        r'\b(Weimar|Reichstag)\b',
        r'\b(Spanish Civil War)\b',
        r'\b(appeasement|Munich Agreement)\b',
    ],
    'Contemporary Era (1945-present)': [
        r'\b(Cold War|Iron Curtain|Berlin Wall)\b',
        r'\b(Korean War|Vietnam War|Gulf War|Iraq War|Afghanistan)\b',
        r'\b(NATO|Warsaw Pact)\b',
        r'\b(Cuban Missile Crisis|Bay of Pigs)\b',
        r'\b(Civil Rights Movement)\b',
        r'\b(Watergate|Iran-Contra)\b',
        r'\b(9/11|September 11|War on Terror)\b',
        r'\b(Gorbachev|Khrushchev)\b',
        r'\b(Cultural Revolution|Tiananmen)\b',
        r'\b(European Union|EU|Brexit)\b',
        r'\b(independence movement)\b',
        r'\b(space race|Moon landing|Apollo)\b',
        r'\b(internet|digital)\b',
    ]
}

# =============================================================================
# ANSWER TYPE PATTERNS
# =============================================================================

ANSWER_TYPE_PATTERNS = {
    'Documents, Laws & Treaties': [
        r'\b(treaty|treaties|Treaty of)\b',
        r'\b(constitution|constitutional)\b',
        r'\b(declaration|Declaration of)\b',
        r'\b(act|Act of|legislation|law|statute)\b',
        r'\b(bill|Bill of)\b',
        r'\b(amendment|Amendment)\b',
        r'\b(charter|proclamation|edict|decree)\b',
        r'\b(Magna Carta|concordat|covenant|pact|accord)\b',
        r'\b(document|manuscript|code of)\b',
    ],
    'Events (Wars, Battles, Revolutions)': [
        r'\b(battle|Battle of)\b',
        r'\b(war|War of|World War|Civil War)\b',
        r'\b(revolution|Revolution|revolutionary)\b',
        r'\b(revolt|uprising|rebellion|insurrection)\b',
        r'\b(siege|Siege of|invasion|Invasion of)\b',
        r'\b(campaign|offensive|operation)\b',
        r'\b(massacre|genocide|atrocity)\b',
        r'\b(assassination|coup|putsch)\b',
    ],
    'Religion & Mythology': [
        r'\b(god|goddess|deity|deities|divine)\b',
        r'\b(myth|mythology|mythical|mythological)\b',
        r'\b(religion|religious)\b',
        r'\b(Bible|Quran|Torah|scripture)\b',
        r'\b(Buddhism|Hinduism|Islam|Christianity|Judaism)\b',
        r'\b(church|mosque|temple|synagogue|cathedral)\b',
        r'\b(saint|apostle|prophet|pope|bishop|priest)\b',
        r'\b(Zeus|Apollo|Athena|Odin|Thor|Ra|Osiris)\b',
        r'\b(miracle|sacred|holy)\b',
    ],
    'Cultural History (Art, Literature, Music)': [
        r'\b(novel|book|poem|poetry|author|writer|wrote)\b',
        r'\b(painting|painter|painted|sculpture|sculptor)\b',
        r'\b(composer|symphony|opera|concerto|sonata)\b',
        r'\b(artist|artwork|masterpiece|canvas|fresco)\b',
        r'\b(playwright|play|drama|theater|theatre)\b',
        r'\b(literary|literature|epic|sonnet)\b',
        r'\b(baroque|renaissance art|impressionist|modernist)\b',
        r'\b(ballet|dance|choreograph)\b',
        r'\b(film|movie|cinema|director)\b',
        r'\b(album|band|song|singer|musician)\b',
    ],
    'Science, Technology & Innovation': [
        r'\b(invented|invention|inventor)\b',
        r'\b(discovered|discovery|discoverer)\b',
        r'\b(scientist|physicist|chemist|biologist)\b',
        r'\b(theory|theorem|formula|equation)\b',
        r'\b(experiment|laboratory)\b',
        r'\b(telescope|microscope|vaccine)\b',
        r'\b(patent|innovation|technological)\b',
        r'\b(steam engine|railroad|telegraph|telephone)\b',
        r'\b(computer|internet|nuclear|atomic)\b',
    ],
    'Economic History & Trade': [
        r'\b(trade|trading|commerce|merchant)\b',
        r'\b(economic|economy|economics)\b',
        r'\b(currency|money|coin|gold standard)\b',
        r'\b(bank|banking|financial)\b',
        r'\b(depression|recession|crash)\b',
        r'\b(tariff|tax|taxation)\b',
        r'\b(export|import|mercantile)\b',
        r'\b(Silk Road|spice trade)\b',
        r'\b(stock market|Wall Street)\b',
    ],
    'Geography & Environment': [
        r'\b(mountain|river|ocean|sea|lake|strait)\b',
        r'\b(volcano|earthquake|tsunami)\b',
        r'\b(desert|peninsula|island|archipelago)\b',
        r'\b(climate|weather|environment)\b',
        r'\b(geographic|geography|cartograph)\b',
        r'\b(natural disaster|flood|drought|famine)\b',
        r'\b(canyon|valley|plateau|basin)\b',
        r'\b(national park|wildlife|conservation)\b',
    ],
    'Groups, Organizations & Institutions': [
        r'\b(organization|institution)\b',
        r'\b(party|political party)\b',
        r'\b(league|union|association|federation)\b',
        r'\b(United Nations|NATO|EU)\b',
        r'\b(company|corporation|firm)\b',
        r'\b(order|Order of|society|Society of)\b',
        r'\b(guild|fraternity|brotherhood)\b',
        r'\b(army|navy|military|regiment)\b',
        r'\b(tribe|clan|people|ethnic group)\b',
    ],
    'Ideas, Ideologies & Philosophies': [
        r'\b(philosophy|philosopher|philosophical)\b',
        r'\b(ideology|ideological)\b',
        r'\b(doctrine|dogma)\b',
        r'\b(theory of|concept of|idea of)\b',
        r'\b(socialism|capitalism|communism|fascism)\b',
        r'\b(liberalism|conservatism|nationalism)\b',
        r'\b(enlightenment thought|intellectual movement)\b',
    ],
    'Political History & Diplomacy': [
        r'\b(election|elected|vote|voting)\b',
        r'\b(congress|parliament|senate|legislature)\b',
        r'\b(political|politics|politician)\b',
        r'\b(diplomacy|diplomatic|ambassador)\b',
        r'\b(policy|administration|cabinet)\b',
        r'\b(reform|legislation)\b',
        r'\b(campaign|primary|nomination)\b',
    ],
    'Social History & Daily Life': [
        r'\b(social|society)\b',
        r'\b(daily life|lifestyle|custom|tradition)\b',
        r'\b(class|peasant|aristocrat|nobility)\b',
        r'\b(slavery|slave|enslaved|abolitionist)\b',
        r'\b(immigration|migration|emigration)\b',
        r'\b(labor|worker|strike)\b',
        r'\b(women.?s rights|suffrage|feminist)\b',
        r'\b(civil rights|equality|discrimination)\b',
    ],
    'Places, Cities & Civilizations': [
        r'\b(city|capital|metropolis)\b',
        r'\b(empire|kingdom|dynasty|realm)\b',
        r'\b(civilization|civilisation)\b',
        r'\b(colony|colonial|settlement)\b',
        r'\b(founded|established|built)\b',
        r'\b(located|situated|site of)\b',
    ],
    'People & Biography': [
        r'\b(who was|who is|name this person|name this man|name this woman)\b',
        r'\b(this leader|this president|this king|this queen|this emperor)\b',
        r'\b(this general|this inventor|this scientist|this artist)\b',
        r'\b(this author|this composer|this explorer)\b',
        r'\b(born|died|childhood|biography|life of)\b',
        r'\b(assassinated|executed|murdered)\b',
        r'\b(succeeded|predecessor|heir)\b',
    ]
}

# =============================================================================
# SUBJECT THEME PATTERNS
# =============================================================================

SUBJECT_THEME_PATTERNS = {
    'Military & Conflict': [
        r'\b(war|battle|military|army|navy|soldier|weapon)\b',
        r'\b(siege|invasion|conquest|defeat|victory)\b',
        r'\b(general|admiral|commander|troops)\b',
        r'\b(campaign|offensive|defensive|strategy)\b',
    ],
    'Political & Governmental': [
        r'\b(political|government|president|congress|parliament)\b',
        r'\b(election|vote|law|constitution|treaty)\b',
        r'\b(king|queen|emperor|monarch|ruler)\b',
        r'\b(republic|democracy|dictatorship|regime)\b',
    ],
    'Religion & Philosophy': [
        r'\b(religion|religious|church|temple|mosque)\b',
        r'\b(god|goddess|divine|sacred|holy)\b',
        r'\b(philosophy|philosopher|thought|belief)\b',
        r'\b(Christianity|Islam|Judaism|Buddhism|Hinduism)\b',
    ],
    'Arts & Literature': [
        r'\b(art|artist|painting|sculpture|music)\b',
        r'\b(literature|novel|poem|author|writer)\b',
        r'\b(theater|drama|opera|symphony)\b',
        r'\b(Renaissance|baroque|romantic|modernist)\b',
    ],
    'Science & Technology': [
        r'\b(science|scientific|scientist|discovery)\b',
        r'\b(technology|invention|inventor|innovation)\b',
        r'\b(physics|chemistry|biology|medicine)\b',
        r'\b(experiment|theory|laboratory)\b',
    ],
    'Economic & Trade': [
        r'\b(economic|economy|trade|commerce)\b',
        r'\b(money|currency|bank|financial)\b',
        r'\b(merchant|market|industry|manufacture)\b',
        r'\b(depression|recession|prosperity)\b',
    ],
    'Social Movements & Culture': [
        r'\b(social|society|movement|reform)\b',
        r'\b(rights|equality|freedom|liberty)\b',
        r'\b(culture|cultural|tradition|custom)\b',
        r'\b(revolution|protest|demonstration)\b',
    ]
}

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

def get_years_from_text(text):
    """Extract years mentioned in the text."""
    years = []
    # Match 4-digit years (1000-2029)
    for match in re.finditer(r'\b(1[0-9]{3}|20[0-2][0-9])\b', text):
        years.append(int(match.group(1)))
    # Match BC/BCE years (as negative)
    for match in re.finditer(r'\b(\d+)\s*(BCE|B\.C\.E\.|B\.C\.|BC)\b', text, re.IGNORECASE):
        years.append(-int(match.group(1)))
    return years

def determine_time_period_from_years(years):
    """Determine time period based on year values."""
    if not years:
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

# =============================================================================
# CLASSIFICATION FUNCTIONS
# =============================================================================

def classify_question(question_text, answer_text):
    """
    Classify a single question, handling impossible combinations properly.

    Strategy:
    1. First determine if this is ancient/medieval content (highest priority)
    2. Then determine regions based on content
    3. Ensure no impossible combinations (US + Ancient, etc.)
    """
    combined = question_text + ' ' + answer_text

    # === STEP 1: Determine time period first (ancient/medieval take priority) ===

    ancient_score = count_matches(combined, ANCIENT_PATTERNS)
    medieval_score = count_matches(combined, MEDIEVAL_PATTERNS)
    pre_columbian_score = count_matches(combined, PRE_COLUMBIAN_PATTERNS)

    is_ancient = ancient_score >= 2
    is_medieval = medieval_score >= 2
    is_pre_columbian = pre_columbian_score >= 1

    # === STEP 2: Determine regions ===

    regions = []

    # Pre-Columbian Americas (special case - both region and time indicator)
    if is_pre_columbian:
        regions.append('Americas (Pre-Columbian)')

    # Calculate region scores
    us_score = count_matches(combined, US_PATTERNS)
    colonial_score = count_matches(combined, COLONIAL_AMERICAS_PATTERNS)
    europe_score = count_matches(combined, EUROPE_PATTERNS)
    asia_score = count_matches(combined, ASIA_PATTERNS)
    mena_score = count_matches(combined, MENA_PATTERNS)
    africa_score = count_matches(combined, AFRICA_PATTERNS)
    latam_score = count_matches(combined, LATIN_AMERICA_PATTERNS)
    global_score = count_matches(combined, GLOBAL_PATTERNS)

    # KEY FIX: Don't assign US region if content is clearly ancient/medieval
    # A question about Julius Caesar mentioning "Senate" should NOT be tagged US
    if us_score >= 2 and not is_ancient and not is_medieval:
        regions.append('United States')
    elif us_score >= 1 and not is_ancient and not is_medieval and colonial_score == 0:
        # Single US match only counts if no ancient/medieval/colonial content
        regions.append('United States')

    # Colonial Americas
    if colonial_score >= 1 and 'United States' not in regions and 'Americas (Pre-Columbian)' not in regions:
        # Don't add separate colonial region - it will be handled by time period
        pass

    # Europe - but check if it's ancient content first
    if europe_score >= 2:
        regions.append('Europe')

    # Asia
    if asia_score >= 2:
        regions.append('Asia')

    # Middle East & North Africa
    if mena_score >= 2:
        regions.append('Middle East & North Africa')

    # Africa (sub-Saharan) - only if not already MENA
    if africa_score >= 2 and 'Middle East & North Africa' not in regions:
        regions.append('Africa')

    # Latin America (only for post-colonial content)
    if latam_score >= 2 and 'Americas (Pre-Columbian)' not in regions:
        # Don't add Latin America for ancient/medieval content
        if not is_ancient and not is_medieval:
            regions.append('Latin America & Caribbean')

    # Global
    if global_score >= 2:
        regions.append('Global/Multi-Regional')

    # Default region if nothing matched
    if not regions:
        regions = ['Global/Multi-Regional']

    # Limit to top 2 regions
    regions = regions[:2]

    # === STEP 3: Determine time periods ===

    time_periods = []

    if is_pre_columbian:
        time_periods.append('Ancient World (pre-500 CE)')
    elif is_ancient:
        time_periods.append('Ancient World (pre-500 CE)')

    if is_medieval and 'Ancient World (pre-500 CE)' not in time_periods:
        time_periods.append('Medieval Era (500-1450)')

    # Check other time period patterns
    if not time_periods:
        for period, patterns in TIME_PERIOD_YEAR_PATTERNS.items():
            if count_matches(combined, patterns) >= 2:
                if period not in time_periods:
                    time_periods.append(period)
                    break  # Only add one

    # Use explicit years if still no time period
    if not time_periods:
        years = get_years_from_text(combined)
        period = determine_time_period_from_years(years)
        if period:
            time_periods.append(period)

    # Default time period
    if not time_periods:
        time_periods = ['Contemporary Era (1945-present)']

    # === STEP 4: Final validation - remove impossible combinations ===

    # US cannot be Ancient or Medieval
    if 'United States' in regions:
        time_periods = [t for t in time_periods if t not in ['Ancient World (pre-500 CE)', 'Medieval Era (500-1450)']]
        if not time_periods:
            time_periods = ['Contemporary Era (1945-present)']

    # Latin America cannot be Ancient or Medieval (unless Pre-Columbian)
    if 'Latin America & Caribbean' in regions and 'Americas (Pre-Columbian)' not in regions:
        time_periods = [t for t in time_periods if t not in ['Ancient World (pre-500 CE)', 'Medieval Era (500-1450)']]
        if not time_periods:
            time_periods = ['Contemporary Era (1945-present)']

    # Limit to top 2 time periods
    time_periods = time_periods[:2]

    # === STEP 5: Classify answer type ===

    answer_type_scores = {}
    for ans_type, patterns in ANSWER_TYPE_PATTERNS.items():
        answer_type_scores[ans_type] = count_matches(combined, patterns)

    best_answer_type = max(answer_type_scores, key=answer_type_scores.get)
    if answer_type_scores[best_answer_type] == 0:
        best_answer_type = 'People & Biography'

    # === STEP 6: Classify subject themes ===

    theme_scores = {}
    for theme, patterns in SUBJECT_THEME_PATTERNS.items():
        theme_scores[theme] = count_matches(combined, patterns)

    matched_themes = [(t, s) for t, s in theme_scores.items() if s > 0]
    matched_themes.sort(key=lambda x: -x[1])
    subject_themes = [t for t, s in matched_themes[:3]]

    if not subject_themes:
        subject_themes = ['Political & Governmental']

    return {
        'regions': regions,
        'time_periods': time_periods,
        'answer_type': best_answer_type,
        'subject_themes': subject_themes
    }

# =============================================================================
# MAIN
# =============================================================================

def main():
    print("=" * 70)
    print("Question Classification Script")
    print("=" * 70)

    # Load questions
    print(f"\nLoading questions from {QUESTIONS_FILE}...")
    with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
        questions_data = json.load(f)

    # Initialize metadata structure
    metadata = {
        '_progress': {
            'last_updated': None,
            'total_questions': 0,
            'categorized': 0
        },
        'categories': {}
    }

    # Count total questions
    total = 0
    for category in ['preliminary', 'quarterfinals', 'semifinals', 'finals']:
        questions_list = questions_data.get(category, [])
        if isinstance(questions_list, list):
            total += len([q for q in questions_list if isinstance(q, dict)])

    metadata['_progress']['total_questions'] = total
    print(f"Total questions to classify: {total}")

    # Process each category
    processed = 0
    for category in ['preliminary', 'quarterfinals', 'semifinals', 'finals']:
        print(f"\nProcessing {category}...")

        questions_list = questions_data.get(category, [])
        if not isinstance(questions_list, list):
            continue

        for q in questions_list:
            if not isinstance(q, dict):
                continue

            qid = q.get('id')
            if not qid:
                continue

            question_text = q.get('question', '')
            answer_text = q.get('answer', '')

            # Classify the question
            classification = classify_question(question_text, answer_text)
            metadata['categories'][qid] = classification

            processed += 1
            if processed % 500 == 0:
                print(f"  Processed {processed}/{total} questions...")

    # Update progress
    metadata['_progress']['categorized'] = processed
    metadata['_progress']['last_updated'] = datetime.now().isoformat()

    # Save metadata
    print(f"\nSaving metadata to {METADATA_FILE}...")
    with open(METADATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    # Print summary
    print("\n" + "=" * 70)
    print("CLASSIFICATION COMPLETE")
    print("=" * 70)
    print(f"Total questions classified: {processed}")

    # Show distribution
    print("\nRegion distribution:")
    region_counts = defaultdict(int)
    for qid, meta in metadata['categories'].items():
        for region in meta.get('regions', []):
            region_counts[region] += 1
    for region, count in sorted(region_counts.items(), key=lambda x: -x[1]):
        print(f"  {region}: {count}")

    print("\nTime period distribution:")
    period_counts = defaultdict(int)
    for qid, meta in metadata['categories'].items():
        for period in meta.get('time_periods', []):
            period_counts[period] += 1
    for period, count in sorted(period_counts.items(), key=lambda x: -x[1]):
        print(f"  {period}: {count}")

    # Check for impossible combinations (should be zero now)
    print("\nValidation - checking for impossible combinations:")
    impossible_count = 0
    for qid, meta in metadata['categories'].items():
        regions = meta.get('regions', [])
        periods = meta.get('time_periods', [])

        if 'United States' in regions:
            if 'Ancient World (pre-500 CE)' in periods or 'Medieval Era (500-1450)' in periods:
                impossible_count += 1
                print(f"  WARNING: {qid} has US + Ancient/Medieval")

        if 'Latin America & Caribbean' in regions and 'Americas (Pre-Columbian)' not in regions:
            if 'Ancient World (pre-500 CE)' in periods or 'Medieval Era (500-1450)' in periods:
                impossible_count += 1
                print(f"  WARNING: {qid} has LatAm + Ancient/Medieval")

    if impossible_count == 0:
        print("  None found - all classifications are valid!")
    else:
        print(f"  Found {impossible_count} impossible combinations")

    print(f"\nMetadata saved to {METADATA_FILE}")


if __name__ == '__main__':
    main()
