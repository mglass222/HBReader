#!/usr/bin/env python3
"""
Initial Question Classification Script

Classifies National History Bee questions by analyzing their content to determine:
- Regions (geographic focus)
- Time periods (historical era)
- Answer type (what kind of thing is being asked about)
- Subject themes (topical categories)

This script performs initial classification. Use fix_classifications.py to fix
any impossible combinations that may result from keyword matching.
"""

import json
import re
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
# REGION DETECTION PATTERNS
# =============================================================================

REGION_PATTERNS = {
    'Americas (Pre-Columbian)': [
        r'\b(Aztec|Mexica|Nahua|Nahuatl)\b',
        r'\b(Maya|Mayan)\b',
        r'\b(Inca|Incan|Quechua)\b',
        r'\b(Olmec|Toltec|Zapotec|Mixtec)\b',
        r'\b(Tenochtitlan|Teotihuacan|Chichen Itza|Machu Picchu|Cusco|Cuzco)\b',
        r'\b(Montezuma|Moctezuma|Atahualpa|Pachacuti)\b',
        r'\b(Popol Vuh|quipu|chinampa)\b',
        r'\b(mesoamerican|pre-columbian|pre-conquest)\b',
        r'\b(Cholula|Tlaxcala|Texcoco)\b',
    ],

    'United States': [
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

        # US presidents (be careful with common names)
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

        # US places
        r'\b(White House|Capitol Hill|Pentagon|Oval Office|Mount Rushmore)\b',
        r'\b(Ellis Island|Statue of Liberty|Liberty Bell)\b',
        r'\b(Jamestown|Plymouth|Mayflower)\b',

        # US documents
        r'\b(Declaration of Independence|U\.?S\.? Constitution|Bill of Rights)\b',
        r'\b(Emancipation Proclamation|Gettysburg Address)\b',
        r'\b(Monroe Doctrine|Truman Doctrine|Marshall Plan)\b',
        r'\b(Federalist Papers|Articles of Confederation)\b',

        # US states (selective - major ones)
        r'\b(New York|California|Texas|Florida|Massachusetts)\b',
        r'\b(Virginia|Pennsylvania|Illinois|Ohio|Georgia)\b',
        r'\b(Washington D\.?C\.?|District of Columbia)\b',
    ],

    'Europe': [
        # Countries
        r'\b(Britain|British|England|English|United Kingdom|UK)\b',
        r'\b(Scotland|Scottish|Wales|Welsh|Ireland|Irish)\b',
        r'\b(France|French|Paris|Versailles|Gaul|Gallic)\b',
        r'\b(Germany|German|Prussia|Prussian|Berlin|Bavaria)\b',
        r'\b(Italy|Italian|Rome|Roman|Venice|Florence|Milan)\b',
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
        r'\b(Charlemagne|William the Conqueror|Richard the Lionheart)\b',
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

        # Ancient European
        r'\b(Ancient Greece|Ancient Rome|Sparta|Spartan|Athens|Athenian)\b',
        r'\b(Roman Empire|Roman Republic|Byzantine|Byzantium)\b',
        r'\b(Julius Caesar|Augustus|Nero|Marcus Aurelius|Constantine)\b',
        r'\b(Socrates|Plato|Aristotle|Alexander the Great)\b',
        r'\b(Colosseum|Parthenon|Acropolis|Pantheon)\b',
    ],

    'Asia': [
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
        r'\b(Genghis Khan|Kublai Khan|Tamerlane)\b',
        r'\b(Confucius|Buddha|Siddhartha)\b',
        r'\b(Sun Yat-sen|Chiang Kai-shek)\b',

        # Asian events/concepts
        r'\b(Korean War|Vietnam War|Sino-Japanese)\b',
        r'\b(Opium War|Boxer Rebellion|Tiananmen)\b',
        r'\b(Hiroshima|Nagasaki|atomic bomb)\b',
        r'\b(Ming Dynasty|Qing Dynasty|Tang Dynasty|Han Dynasty)\b',
        r'\b(Meiji Restoration|Tokugawa|shogun|samurai)\b',
        r'\b(Silk Road|Great Wall of China)\b',
        r'\b(Hinduism|Buddhism|Confucianism|Shinto)\b',
        r'\b(Mughal|Raj|British India|East India Company)\b',
    ],

    'Middle East & North Africa': [
        # Countries/Regions
        r'\b(Middle East|Near East)\b',
        r'\b(Israel|Israeli|Palestine|Palestinian|Jerusalem|Tel Aviv)\b',
        r'\b(Iraq|Iraqi|Baghdad|Mesopotamia|Babylon)\b',
        r'\b(Iran|Iranian|Tehran|Persia|Persian)\b',
        r'\b(Syria|Syrian|Damascus)\b',
        r'\b(Turkey|Turkish|Istanbul|Constantinople|Ankara|Ottoman)\b',
        r'\b(Egypt|Egyptian|Cairo|Alexandria|Nile|Pharaoh)\b',
        r'\b(Saudi Arabia|Saudi|Mecca|Medina)\b',
        r'\b(Lebanon|Lebanese|Beirut|Jordan|Jordanian)\b',
        r'\b(Kuwait|Kuwaiti|UAE|Dubai|Qatar|Bahrain)\b',
        r'\b(Libya|Libyan|Tunisia|Tunisian|Algeria|Algerian|Morocco|Moroccan)\b',
        r'\b(Yemen|Yemeni|Oman)\b',

        # Figures
        r'\b(Nasser|Sadat|Mubarak|Arafat|Netanyahu)\b',
        r'\b(Saddam Hussein|Khomeini|Ataturk)\b',
        r'\b(Saladin|Suleiman the Magnificent)\b',
        r'\b(Muhammad|Mohammed|Prophet)\b',
        r'\b(Cyrus the Great|Darius|Xerxes)\b',
        r'\b(Cleopatra|Ramses|Tutankhamun|Nefertiti)\b',

        # Events/Concepts
        r'\b(Islam|Islamic|Muslim|Quran|Koran)\b',
        r'\b(Caliph|Caliphate|Sultan|Sultanate)\b',
        r'\b(Arab Spring|Gulf War|Iran-Iraq War)\b',
        r'\b(Suez Canal|Suez Crisis)\b',
        r'\b(Six-Day War|Yom Kippur War|Camp David)\b',
        r'\b(Ottoman Empire|Safavid|Abbasid|Umayyad)\b',
        r'\b(Crusade|Crusader|Holy Land)\b',
        r'\b(Zionism|Zionist|Balfour Declaration)\b',
        r'\b(Ancient Egypt|Pyramid|Sphinx|hieroglyph)\b',
    ],

    'Africa': [
        # Countries (sub-Saharan)
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
        r'\b(Scramble for Africa|colonialism|decolonization)\b',
        r'\b(Zulu|Bantu|Swahili)\b',
        r'\b(Sahara|Sahel|sub-Saharan)\b',
        r'\b(Timbuktu|Great Zimbabwe)\b',
        r'\b(slave trade|Middle Passage)\b',
        r'\b(Boer War|Mau Mau)\b',
    ],

    'Latin America & Caribbean': [
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
        r'\b(Cortes|Cortez|Pizarro|conquistador)\b',
        r'\b(Toussaint Louverture|Duvalier)\b',

        # Events/Concepts
        r'\b(Latin America|South America|Central America|Caribbean)\b',
        r'\b(Bay of Pigs|Cuban Missile Crisis)\b',
        r'\b(Falklands War|Malvinas)\b',
        r'\b(Dirty War|Desaparecidos)\b',
        r'\b(Sandinista|Contra|FARC)\b',
        r'\b(Organization of American States|OAS)\b',
    ],

    'Global/Multi-Regional': [
        r'\b(United Nations|UN|UNESCO|WHO|IMF|World Bank)\b',
        r'\b(World War|global|international|worldwide)\b',
        r'\b(Cold War)\b',
        r'\b(League of Nations)\b',
        r'\b(globalization|multinational)\b',
        r'\b(imperialism|colonialism)\b',
    ]
}

# =============================================================================
# TIME PERIOD DETECTION PATTERNS
# =============================================================================

TIME_PERIOD_PATTERNS = {
    'Ancient World (pre-500 CE)': [
        # Explicit markers
        r'\b(BCE|B\.C\.E\.|B\.C\.|BC)\b',
        r'\b(ancient|antiquity)\b',

        # Ancient civilizations
        r'\b(Roman Empire|Roman Republic|Ancient Rome|Ancient Greece)\b',
        r'\b(Ancient Egypt|Pharaoh|Pyramid of Giza|Sphinx)\b',
        r'\b(Mesopotamia|Babylon|Babylonian|Assyria|Assyrian|Sumer)\b',
        r'\b(Persian Empire|Achaemenid)\b',
        r'\b(Sparta|Spartan|Athens|Athenian|Macedon)\b',
        r'\b(Carthage|Carthaginian|Phoenicia|Phoenician)\b',

        # Ancient figures
        r'\b(Julius Caesar|Augustus|Nero|Caligula|Tiberius|Trajan|Hadrian|Marcus Aurelius|Constantine)\b',
        r'\b(Alexander the Great|Philip of Macedon)\b',
        r'\b(Socrates|Plato|Aristotle|Pericles|Themistocles)\b',
        r'\b(Hannibal|Scipio|Cicero|Cato)\b',
        r'\b(Cleopatra|Ramses|Tutankhamun|Nefertiti|Akhenaten)\b',
        r'\b(Cyrus the Great|Darius|Xerxes)\b',
        r'\b(Confucius|Buddha|Siddhartha)\b',
        r'\b(Hammurabi|Nebuchadnezzar|Gilgamesh)\b',

        # Ancient events
        r'\b(Punic War|Peloponnesian War|Trojan War|Gallic Wars)\b',
        r'\b(Battle of Thermopylae|Battle of Marathon|Battle of Salamis)\b',
        r'\b(Battle of Cannae|Battle of Zama|Battle of Actium)\b',
        r'\b(Ides of March|crossing the Rubicon)\b',

        # Ancient concepts
        r'\b(gladiator|centurion|legion|legionary|tribune|consul)\b',
        r'\b(Colosseum|Parthenon|Acropolis|Pantheon)\b',
        r'\b(hieroglyph|papyrus|cuneiform)\b',
        r'\b(oracle|Delphi)\b',
    ],

    'Medieval Era (500-1450)': [
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
    ],

    'Early Modern (1450-1750)': [
        r'\b(Renaissance|Reformation|Counter-Reformation)\b',
        r'\b(Protestant|Protestantism|Luther|Calvin|Calvinist)\b',
        r'\b(Elizabethan|Tudor|Stuart)\b',
        r'\b(Thirty Years.? War|War of Spanish Succession)\b',
        r'\b(Columbus|Magellan|Vasco da Gama|Cortes|Pizarro)\b',
        r'\b(conquistador|colonization|New World)\b',
        r'\b(Jamestown|Plymouth|Mayflower|Pilgrims|Puritans)\b',
        r'\b(Shakespeare|Gutenberg|Leonardo|Michelangelo|Galileo)\b',
        r'\b(Henry VIII|Elizabeth I|Mary Queen of Scots)\b',
        r'\b(Louis XIV|Sun King|Versailles)\b',
        r'\b(Peter the Great|Ivan the Terrible)\b',
        r'\b(Mughal|Tokugawa|Ming Dynasty|Qing Dynasty)\b',
        r'\b(East India Company|Dutch East India)\b',
        r'\b(Spanish Armada|English Civil War)\b',
        r'\b(Enlightenment|Age of Reason)\b',
        r'\b(1[5-7]\d{2})\b',  # Years 1500-1749
    ],

    'Age of Revolutions (1750-1850)': [
        r'\b(American Revolution|Revolutionary War|1776)\b',
        r'\b(French Revolution|Bastille|guillotine|Robespierre|Jacobin)\b',
        r'\b(Declaration of Independence|Constitution|Bill of Rights)\b',
        r'\b(Napoleon|Napoleonic|Waterloo|Congress of Vienna)\b',
        r'\b(George Washington|Thomas Jefferson|Benjamin Franklin)\b',
        r'\b(Continental Congress|Founding Fathers)\b',
        r'\b(Haitian Revolution|Toussaint Louverture)\b',
        r'\b(Simon Bolivar|Latin American independence)\b',
        r'\b(War of 1812)\b',
        r'\b(Industrial Revolution)\b',
        r'\b(Monroe Doctrine)\b',
        r'\b(1[78]\d{2})\b',  # Years 1700-1849 (overlaps intentionally)
    ],

    'Industrial & Imperial Age (1850-1914)': [
        r'\b(Victorian|Queen Victoria)\b',
        r'\b(American Civil War|Civil War|1861|1865)\b',
        r'\b(Abraham Lincoln|Gettysburg|Emancipation)\b',
        r'\b(Reconstruction|Jim Crow)\b',
        r'\b(Bismarck|German unification|Franco-Prussian)\b',
        r'\b(Meiji|Meiji Restoration)\b',
        r'\b(imperialism|colonialism|Scramble for Africa)\b',
        r'\b(Spanish-American War|1898)\b',
        r'\b(Boer War)\b',
        r'\b(Boxer Rebellion|Opium War)\b',
        r'\b(railroad|telegraph|steamship)\b',
        r'\b(Theodore Roosevelt|Teddy Roosevelt)\b',
        r'\b(Gilded Age|Progressive Era)\b',
        r'\b(suffrage|suffragette)\b',
        r'\b(18[5-9]\d|190\d|191[0-3])\b',  # Years 1850-1913
    ],

    'World Wars & Interwar (1914-1945)': [
        r'\b(World War I|World War II|WWI|WWII|WW1|WW2|First World War|Second World War)\b',
        r'\b(1914|1918|1939|1941|1945)\b',
        r'\b(Treaty of Versailles|League of Nations)\b',
        r'\b(Great Depression|New Deal|1929)\b',
        r'\b(Hitler|Nazi|Third Reich|Holocaust|Auschwitz)\b',
        r'\b(Mussolini|Fascist|fascism)\b',
        r'\b(Stalin|Soviet|Bolshevik|Russian Revolution)\b',
        r'\b(Churchill|Roosevelt|FDR)\b',
        r'\b(Pearl Harbor|D-Day|Normandy)\b',
        r'\b(Hiroshima|Nagasaki|atomic bomb|Manhattan Project)\b',
        r'\b(Trench warfare|Somme|Verdun|Gallipoli)\b',
        r'\b(Weimar|Reichstag)\b',
        r'\b(Spanish Civil War)\b',
        r'\b(appeasement|Munich Agreement)\b',
        r'\b(191[4-9]|19[234]\d)\b',  # Years 1914-1945
    ],

    'Contemporary Era (1945-present)': [
        r'\b(Cold War|Iron Curtain|Berlin Wall)\b',
        r'\b(Korean War|Vietnam War|Gulf War|Iraq War|Afghanistan)\b',
        r'\b(United Nations|UN|NATO|Warsaw Pact)\b',
        r'\b(Cuban Missile Crisis|Bay of Pigs)\b',
        r'\b(Civil Rights Movement|Martin Luther King|Rosa Parks)\b',
        r'\b(Kennedy|JFK|Nixon|Reagan|Clinton|Obama|Trump|Biden)\b',
        r'\b(Watergate|Iran-Contra)\b',
        r'\b(9/11|September 11|War on Terror)\b',
        r'\b(Soviet Union|USSR|Gorbachev|Khrushchev)\b',
        r'\b(Mao|Cultural Revolution|Tiananmen)\b',
        r'\b(apartheid|Mandela)\b',
        r'\b(European Union|EU|Brexit)\b',
        r'\b(decolonization|independence movement)\b',
        r'\b(space race|Moon landing|Apollo)\b',
        r'\b(internet|digital|computer)\b',
        r'\b(19[5-9]\d|20[0-2]\d)\b',  # Years 1950-2029
    ]
}

# =============================================================================
# ANSWER TYPE DETECTION PATTERNS
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
        r'\b(miracle|sacred|holy|divine)\b',
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
        r'\b(movement|ism)\b',
    ],

    'Political History & Diplomacy': [
        r'\b(election|elected|vote|voting)\b',
        r'\b(congress|parliament|senate|legislature)\b',
        r'\b(political|politics|politician)\b',
        r'\b(diplomacy|diplomatic|ambassador)\b',
        r'\b(policy|administration|cabinet)\b',
        r'\b(reform|legislation|bill)\b',
        r'\b(campaign|primary|nomination)\b',
    ],

    'Social History & Daily Life': [
        r'\b(social|society)\b',
        r'\b(daily life|lifestyle|custom|tradition)\b',
        r'\b(class|peasant|aristocrat|nobility)\b',
        r'\b(slavery|slave|enslaved|abolitionist)\b',
        r'\b(immigration|migration|emigration)\b',
        r'\b(labor|worker|union|strike)\b',
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
        r'\b(ancient|medieval) .*(city|civilization|empire)\b',
    ],

    'People & Biography': [
        r'\b(who was|who is|name this person|name this man|name this woman)\b',
        r'\b(this leader|this president|this king|this queen|this emperor)\b',
        r'\b(this general|this inventor|this scientist|this artist)\b',
        r'\b(this author|this composer|this explorer)\b',
        r'\b(born|died|childhood|biography|life of)\b',
        r'\b(assassinated|executed|murdered)\b',
        r'\b(succeeded|predecessor|heir|dynasty)\b',
    ]
}

# =============================================================================
# SUBJECT THEME DETECTION PATTERNS
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
# CLASSIFICATION FUNCTIONS
# =============================================================================

def count_pattern_matches(text, patterns):
    """Count how many patterns match in the text."""
    count = 0
    for pattern in patterns:
        if re.search(pattern, text, re.IGNORECASE):
            count += 1
    return count

def classify_regions(text):
    """Determine the geographic regions for a question."""
    scores = {}
    for region, patterns in REGION_PATTERNS.items():
        scores[region] = count_pattern_matches(text, patterns)

    # Get regions with matches, sorted by score
    matched = [(r, s) for r, s in scores.items() if s > 0]
    matched.sort(key=lambda x: -x[1])

    # Return top 2 regions max
    regions = [r for r, s in matched[:2]]

    # Default if nothing matched
    if not regions:
        regions = ['Global/Multi-Regional']

    return regions

def classify_time_periods(text, regions):
    """Determine the time periods for a question."""
    scores = {}
    for period, patterns in TIME_PERIOD_PATTERNS.items():
        scores[period] = count_pattern_matches(text, patterns)

    # Get periods with matches, sorted by score
    matched = [(p, s) for p, s in scores.items() if s > 0]
    matched.sort(key=lambda x: -x[1])

    # Return top 2 periods max
    periods = [p for p, s in matched[:2]]

    # Apply region-based constraints to avoid impossible combinations
    if 'United States' in regions:
        # US can't be Ancient or Medieval
        periods = [p for p in periods if p not in ['Ancient World (pre-500 CE)', 'Medieval Era (500-1450)']]
        if not periods:
            # Default to Contemporary for US
            periods = ['Contemporary Era (1945-present)']

    if 'Latin America & Caribbean' in regions and 'Americas (Pre-Columbian)' not in regions:
        # Post-colonial Latin America can't be Ancient or Medieval
        periods = [p for p in periods if p not in ['Ancient World (pre-500 CE)', 'Medieval Era (500-1450)']]
        if not periods:
            periods = ['Contemporary Era (1945-present)']

    # Default if nothing matched
    if not periods:
        periods = ['Contemporary Era (1945-present)']

    return periods

def classify_answer_type(text):
    """Determine the answer type for a question."""
    scores = {}
    for ans_type, patterns in ANSWER_TYPE_PATTERNS.items():
        scores[ans_type] = count_pattern_matches(text, patterns)

    # Get best match
    best_type = max(scores, key=scores.get)

    # If no matches, default to People & Biography
    if scores[best_type] == 0:
        return 'People & Biography'

    return best_type

def classify_subject_themes(text):
    """Determine subject themes for a question."""
    scores = {}
    for theme, patterns in SUBJECT_THEME_PATTERNS.items():
        scores[theme] = count_pattern_matches(text, patterns)

    # Get themes with matches, sorted by score
    matched = [(t, s) for t, s in scores.items() if s > 0]
    matched.sort(key=lambda x: -x[1])

    # Return top 3 themes max
    themes = [t for t, s in matched[:3]]

    # Default if nothing matched
    if not themes:
        themes = ['Political & Governmental']

    return themes

def classify_question(question_text, answer_text):
    """Classify a single question."""
    combined = question_text + ' ' + answer_text

    # Classify each dimension
    regions = classify_regions(combined)
    time_periods = classify_time_periods(combined, regions)
    answer_type = classify_answer_type(combined)
    subject_themes = classify_subject_themes(combined)

    return {
        'regions': regions,
        'time_periods': time_periods,
        'answer_type': answer_type,
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

    print(f"\nMetadata saved to {METADATA_FILE}")
    print("\nNote: Run fix_classifications.py to fix any remaining impossible combinations.")


if __name__ == '__main__':
    main()
