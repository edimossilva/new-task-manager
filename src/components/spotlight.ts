/**
 * Which readout is holding the home page.
 *
 * `both` is the pair the page opens on -- what was missed and what is running,
 * the two things a day asks of you -- and tapping either annunciator narrows it
 * to that one question. It lives in its own module because the view and the
 * card both need the type.
 *
 * A band's gauge is deliberately NOT one of these: tapping a gauge narrows the
 * page to that horizon instead of lighting it, so the two controls are
 * alternatives rather than one mechanism wearing two hats. See `HomeView`.
 */
export type Spotlight = 'late' | 'now' | 'both'
