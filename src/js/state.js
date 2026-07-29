// Shared application state
// All modules import this and can read/modify the state

export const state = {
    // Question data
    questions: {
        preliminary: [],
        quarterfinals: [],
        semifinals: [],
        finals: []
    },
    questionMetadata: {},
    currentQuestion: null,

    // Streaming state
    streamingInterval: null,
    isPaused: false,
    currentCharIndex: 0,
    currentSection: 'question',
    answerInputShown: false,

    // Practice tracking
    questionsPracticed: 0,
    questionHistory: [],
    sessionHistory: [],
    historyLoaded: false,

    // User state
    currentUser: null,
    userProfile: null,

    // Filter state
    activeFilters: {
        region: 'all',
        timePeriod: 'all',
        answerTypes: []
    },

    // Dashboard state
    dashboardQuestionSet: 'all',
    selectedTrendPeriod: 'month',

    // Leaderboard state
    currentLeaderboardPeriod: 'allTime',

    // UI state
    currentTooltipEvent: null,
    profileWarningDismissed: false
};

// Constants - Keys match question ID format (P/Q/S/F)
export const POINTS_VALUES = {
    'P': 10,  // Preliminary
    'Q': 20,  // Quarterfinals
    'S': 30,  // Semifinals
    'F': 50   // Finals
};

export const DIFFICULTY_COLORS = {
    'P': '#3498db', // Preliminary - blue
    'Q': '#27ae60', // Quarterfinals - green
    'S': '#f39c12', // Semifinals - orange
    'F': '#e74c3c'  // Finals - red
};

export const DIFFICULTY_NAMES = {
    'P': 'Preliminary',
    'Q': 'Quarterfinals',
    'S': 'Semifinals',
    'F': 'Finals'
};

export const ANSWER_TYPE_COLORS = {
    'People & Biography': '#3498db',
    'Events (Wars, Battles, Revolutions)': '#ff69b4',
    'Political History & Diplomacy': '#9b59b6',
    'Economic History & Trade': '#27ae60',
    'Social History & Daily Life': '#f39c12',
    'Cultural History (Art, Literature, Music)': '#1abc9c',
    'Religion & Mythology': '#e67e22',
    'Science, Technology & Innovation': '#2980b9',
    'Geography & Environment': '#16a085',
    'Places, Cities & Civilizations': '#8e44ad',
    'Groups, Organizations & Institutions': '#c0392b',
    'Documents, Laws & Treaties': '#d35400',
    'Ideas, Ideologies & Philosophies': '#7f8c8d'
};

export const ANSWER_TYPE_SHORT_NAMES = {
    'People & Biography': 'People',
    'Events (Wars, Battles, Revolutions)': 'Events',
    'Political History & Diplomacy': 'Political',
    'Economic History & Trade': 'Economic',
    'Social History & Daily Life': 'Social',
    'Cultural History (Art, Literature, Music)': 'Cultural',
    'Religion & Mythology': 'Religion',
    'Science, Technology & Innovation': 'Science',
    'Geography & Environment': 'Geography',
    'Places, Cities & Civilizations': 'Places',
    'Groups, Organizations & Institutions': 'Groups',
    'Documents, Laws & Treaties': 'Documents',
    'Ideas, Ideologies & Philosophies': 'Ideas'
};

export const RANK_CONFIG = {
    tiers: [
        { name: 'Bronze', minLevel: 1, maxLevel: 10, color: '#CD7F32', colorLight: '#D4954A' },
        { name: 'Silver', minLevel: 11, maxLevel: 20, color: '#C0C0C0', colorLight: '#D8D8D8' },
        { name: 'Gold', minLevel: 21, maxLevel: 35, color: '#FFD700', colorLight: '#FFE44D' },
        { name: 'Platinum', minLevel: 36, maxLevel: 50, color: '#E5E4E2', colorLight: '#F0EFED' },
        { name: 'Diamond', minLevel: 51, maxLevel: 70, color: '#B9F2FF', colorLight: '#D4F7FF' },
        { name: 'Master', minLevel: 71, maxLevel: 85, color: '#9966CC', colorLight: '#B38DD9' },
        { name: 'Grandmaster', minLevel: 86, maxLevel: 100, color: '#FF4500', colorLight: '#FF6A33' }
    ],
    titles: {
        1: 'Bronze I', 2: 'Bronze II', 3: 'Bronze III', 4: 'Bronze IV', 5: 'Bronze V',
        6: 'Bronze VI', 7: 'Bronze VII', 8: 'Bronze VIII', 9: 'Bronze IX', 10: 'Bronze X',
        11: 'Silver I', 12: 'Silver II', 13: 'Silver III', 14: 'Silver IV', 15: 'Silver V',
        16: 'Silver VI', 17: 'Silver VII', 18: 'Silver VIII', 19: 'Silver IX', 20: 'Silver X',
        21: 'Gold I', 22: 'Gold II', 23: 'Gold III', 24: 'Gold IV', 25: 'Gold V',
        26: 'Gold VI', 27: 'Gold VII', 28: 'Gold VIII', 29: 'Gold IX', 30: 'Gold X',
        31: 'Gold XI', 32: 'Gold XII', 33: 'Gold XIII', 34: 'Gold XIV', 35: 'Gold XV',
        36: 'Platinum I', 37: 'Platinum II', 38: 'Platinum III', 39: 'Platinum IV', 40: 'Platinum V',
        41: 'Platinum VI', 42: 'Platinum VII', 43: 'Platinum VIII', 44: 'Platinum IX', 45: 'Platinum X',
        46: 'Platinum XI', 47: 'Platinum XII', 48: 'Platinum XIII', 49: 'Platinum XIV', 50: 'Platinum XV',
        51: 'Diamond I', 52: 'Diamond II', 53: 'Diamond III', 54: 'Diamond IV', 55: 'Diamond V',
        56: 'Diamond VI', 57: 'Diamond VII', 58: 'Diamond VIII', 59: 'Diamond IX', 60: 'Diamond X',
        61: 'Diamond XI', 62: 'Diamond XII', 63: 'Diamond XIII', 64: 'Diamond XIV', 65: 'Diamond XV',
        66: 'Diamond XVI', 67: 'Diamond XVII', 68: 'Diamond XVIII', 69: 'Diamond XIX', 70: 'Diamond XX',
        71: 'Master I', 72: 'Master II', 73: 'Master III', 74: 'Master IV', 75: 'Master V',
        76: 'Master VI', 77: 'Master VII', 78: 'Master VIII', 79: 'Master IX', 80: 'Master X',
        81: 'Master XI', 82: 'Master XII', 83: 'Master XIII', 84: 'Master XIV', 85: 'Master XV',
        86: 'Grandmaster I', 87: 'Grandmaster II', 88: 'Grandmaster III', 89: 'Grandmaster IV', 90: 'Grandmaster V',
        91: 'Grandmaster VI', 92: 'Grandmaster VII', 93: 'Grandmaster VIII', 94: 'Grandmaster IX', 95: 'Grandmaster X',
        96: 'Grandmaster XI', 97: 'Grandmaster XII', 98: 'Grandmaster XIII', 99: 'Grandmaster XIV', 100: 'Grandmaster XV'
    },
    dailyLoginBonuses: [
        { days: 100, bonus: 2000 },
        { days: 60, bonus: 1000 },
        { days: 30, bonus: 500 },
        { days: 14, bonus: 300 },
        { days: 7, bonus: 150 },
        { days: 3, bonus: 50 }
    ]
};
