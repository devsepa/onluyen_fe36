export function scopePracticeQuestions(bank,deckId){return deckId?bank.filter(q=>q.sharedDeck===deckId):bank}
