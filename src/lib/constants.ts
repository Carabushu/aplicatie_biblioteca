export const GENRES = [
  'Aventură', 'Fantasy', 'SF', 'Istorie', 'Biografie', 'Poezie', 'Povești', 'Basme',
  'Benzi desenate', 'Mister / Polițist', 'Dragoste', 'Umor', 'Știință', 'Natură',
  'Enciclopedie', 'Religie', 'Filosofie', 'Psihologie', 'Dezvoltare personală',
  'Economie / Business', 'Tehnic', 'Gătit', 'Călătorii', 'Artă', 'Manual / Școală',
  'Clasici', 'Literatură română', 'Literatură universală', 'Altele',
] as const

export const LANGUAGES: Record<string, string> = {
  ro: 'Română', en: 'Engleză', de: 'Germană', fr: 'Franceză', it: 'Italiană',
  es: 'Spaniolă', hu: 'Maghiară', ru: 'Rusă', la: 'Latină', other: 'Altă limbă',
}

export const AUDIENCE_LABEL = { adulti: 'Adulți', copii: 'Copii' } as const

export const STATUS_LABEL = { unread: 'Necitită', reading: 'În curs', read: 'Citită' } as const

export const ACTIVE_MEMBER_KEY = 'biblioteca.activeMember'
export const BOOKS_CACHE_KEY = 'biblioteca.booksCache'
