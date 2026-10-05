/**
 * The announcements that open and close every Listening paper, whichever parts are drawn:
 * "This is the IELTS listening test ..." before Part 1, and after Part 4 "You now have two
 * minutes to check all your answers ... That is the end of the listening test."
 * Both are stretches of the British Council sample recording, played as they are, so the
 * final checking time is the official two minutes.
 */
export const LISTENING_FRAME = {
  audio: 'https://ok26.org/i/si28ap78',
  intro: { from: 0, to: 35.0 },
  outro: { from: 1650.4, to: 1780.3 },
}
