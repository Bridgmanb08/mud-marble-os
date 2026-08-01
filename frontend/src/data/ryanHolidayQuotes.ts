export interface RyanHolidayQuote {
  text: string;
  source: string;
}

// A rotating inventory of Ryan Holiday quotes/lines, curated from his major
// books, for a simple daily greeting toast -- not AI-generated, just a fixed
// list that cycles by day so it doesn't repeat back-to-back.
export const RYAN_HOLIDAY_QUOTES: RyanHolidayQuote[] = [
  { text: 'The obstacle in the path becomes the path.', source: 'The Obstacle Is the Way' },
  { text: "Choose not to be harmed -- and you won't feel harmed.", source: 'The Obstacle Is the Way' },
  { text: "It matters what you do with what happens and what you've been given.", source: 'The Obstacle Is the Way' },
  { text: 'There is no good or bad without us, there is only perception.', source: 'The Obstacle Is the Way' },
  { text: 'There is always a countermove, always an escape or way through.', source: 'The Obstacle Is the Way' },
  { text: 'Stop looking for angels, and start looking for angles.', source: 'The Obstacle Is the Way' },
  { text: "I am in control, not my emotions. I see what's really going on here.", source: 'The Obstacle Is the Way' },
  { text: 'To argue, to complain, or worse, to just give up -- these are choices.', source: 'The Obstacle Is the Way' },
  { text: 'Impressing people is utterly different from being truly impressive.', source: 'Ego Is the Enemy' },
  { text: 'Ego is the enemy of what you want and of what you have.', source: 'Ego Is the Enemy' },
  { text: "You cannot get better if you're convinced you are the best.", source: 'Ego Is the Enemy' },
  { text: "We can't keep learning if we think we already know everything.", source: 'Ego Is the Enemy' },
  { text: 'Silence is the respite of the confident and the strong.', source: 'Ego Is the Enemy' },
  { text: 'Ego is stolen. Confidence is earned.', source: 'Ego Is the Enemy' },
  { text: "Most successful people are people you've never heard of.", source: 'Ego Is the Enemy' },
  { text: 'As our island of knowledge grows, so does the shore of our ignorance.', source: 'Ego Is the Enemy' },
  { text: 'Humility engenders learning because it beats back the arrogance that puts blinders on.', source: 'Ego Is the Enemy' },
  { text: "That's the nice thing about the present. It keeps showing up to give you a second chance.", source: 'Stillness Is the Key' },
  { text: 'Living clearly and presently takes courage.', source: 'Stillness Is the Key' },
  { text: "Be part of what's going on around you. Feast on it, adjust for it.", source: 'Stillness Is the Key' },
  { text: 'The path to success runs through solitude and stillness.', source: 'Stillness Is the Key' },
  { text: 'There is the event itself and the story we tell ourselves about what it means.', source: 'The Daily Stoic' },
  { text: 'We forget: it is our reaction that hurts us, not the event.', source: 'The Daily Stoic' },
  { text: 'Discipline is the daily choice between what you want now and what you want most.', source: 'Discipline Is Destiny' },
  { text: 'Courage is the willingness to act rightly in the face of fear, uncertainty, and pressure.', source: 'Courage Is Calling' },
  { text: 'Do the work. Do it well. And then let go of the rest.', source: 'Discipline Is Destiny' },
  { text: 'The best leaders are humble enough to accept blame and confident enough to give credit.', source: 'Ego Is the Enemy' },
  { text: 'What is defeat? Nothing but the first step to something better.', source: 'The Obstacle Is the Way' },
  { text: 'Focus on the moment, not the monsters that may or may not be up ahead.', source: 'The Obstacle Is the Way' },
  { text: 'Great work is not a matter of ability, but of character.', source: 'Ego Is the Enemy' },
];
