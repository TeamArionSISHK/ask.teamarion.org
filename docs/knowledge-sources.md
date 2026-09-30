# Ask Arion knowledge sources

Updated 30 September 2026. This file is an editorial reference, not part of the
model prompt. `server/data/knowledge.ts` remains the curated runtime knowledge.

## Sources

- Existing knowledge at commit `d197e5a`: preserve prior campaign history,
  engineering principles, outreach, contacts, privacy and public software tools.
- Submitted/locked World Finals public team profile, supplied as pasted text:
  founding date, names/career ambitions, naming rationale, manufacturing access,
  preparation challenges and personal anecdotes. Unselected Yes/No fields and
  `@handle` placeholders are not evidence of an answer or an account.
- `T07_TEAM_ARION_(HKG)_engineering (1).pdf`: main engineering content on PDF
  pages 2–11; Ultraviolet design, CAD, analysis, materials, manufacture and tests.
  Remaining pages contain supporting AI-use material.
- `T07_TEAM_ARION_(HKG)_enterprise (2).pdf`: main enterprise content on PDF
  pages 2–11; identity, marketing, outreach, supporters, sustainability, pit
  design and PurpleExperience. Supporting AI-use material follows.
- `T07_TEAM_ARION_(HKG)_projectmanagement 1.pdf`: PDF pages 2–7 for governance,
  scheduling, finance methods and risks; pages 8–9 for AI-use accountability.
- PurpleExperience repository, read-only: `src/locales/en.json`, `src/App.tsx`,
  `README.md` and `AGENTS.md`. Current public experiences are Studio Ultraviolet,
  Explore Our Car and Voices of Tomorrow. The internal `quiz` route renders
  Voices; old quiz documentation must not be used to describe the current app.

Page numbers above include each PDF cover. The source PDFs remain outside this
repository; full extracts are not sent to the model.

## 30 September 2026 dictation update

- Source: Mark’s attached `Pasted markdown(6).md`, supplied with instructions to
  add pit-display reasoning and correct the knowledge. A separate pit tour is
  explicitly deferred; no tour, wayfinding, event prompts or UI changes are
  included in this update.
- Normalised obvious speech-to-text substitutions (Team Arion, STEM Racing,
  pit display, car viewer and “Imagined with [name]”) without treating uncertain
  phrases as new facts. The raw dictation is not copied into runtime knowledge.
- Added the Gemini experiment that inspired Studio Ultraviolet, visitor
  authorship/personalisation rationale, affordability as a qualitative decision,
  interface iteration, moderation rationale and the quiz-to-Voices decision.
- The interface work is qualitative testing with friends, including comparisons
  between iterations. Apple’s Human Interface Guidelines were consulted; eye
  tracking was considered but not conducted. Preserve the portfolio’s existing
  participant account without inventing a combined sample size.
- Safety layers describe Mark’s design account, not a fresh implementation audit.
  Omit tentative image-model identification, named moderation deployment claims,
  exact runtime sequencing and unverified per-image costs. No claims of
  statistically proven UX improvements or perfect moderation were added.
- Preserve March 2025 as the submitted profile’s founding date. The dictation’s
  “April last year” competition-entry recollection does not establish a revised
  founding date. Its “first and last” wording refers to World Finals, not the
  team’s first STEM Racing competition.
- Frame PurpleExperience as the integrated pit experience, with Studio
  Ultraviolet, Explore Our Car and Voices of Tomorrow as its core digital
  experiences. Ask Arion predates its WF integration and complements them.
- Reconcile earlier recruitment/continuity ambitions with the final competition.
  Voices publication remains a plan for suitable approved entries, not a promise
  to publish every submission.
- Keep the portfolio’s reuse/avoided-purchase figures attributed to its documented
  configuration. The final monitor arrangement is unconfirmed; the 29 September
  display discussions in the supplied conversation context show that it was
  still being resolved. No replacement setup or revised percentage is inferred.
- Keep competitor comparisons as the team’s intended differentiation, not claims
  of global uniqueness or unsupported descriptions of other teams.
- Add explicit distinctions between intent and outcomes, creative postcards and
  engineering evidence, and static knowledge and live pit status. Existing
  privacy, funding and original-roster restrictions remain in force.

## Editorial decisions

- The user's current instruction authorises public descriptions and rationale
  for PurpleExperience. Removed the generic confidential-project section and
  explicit PurpleExperience prohibition; retained unrelated privacy and original
  roster restrictions. The PurpleExperience repository was not edited.
- Removed relative World Finals countdown/urgency language. Fixed event dates
  remain; enquiries should confirm availability with the team.
- Per user instruction, omit World Finals fund totals, individual contribution
  amounts, allocations and balances. Keep supporter names and general budget
  controls. Earlier regional finance facts remain explicitly historical.
- The submitted public profile's March 2025 founding date supersedes the old
  April date. August 2025 merger timing is unchanged.
- Keep Confluence/25P and Fluence masses/results separate from Ultraviolet.
  Historical hours, iteration counts and simulation totals are not current
  World Finals metrics. The new portfolio documents a manufactured/tested
  Ultraviolet configuration, but supplies no final mass or race time.
  The engineering appendix also records a September 11–12 rear-support root
  failure after repeated track testing; successful main-portfolio checks must
  not be presented as proof that all testing was failure-free. The profile's
  July main-development start does not erase earlier engineering research.
- Preserve shared engineering principles without repeating scripted model
  answers. Identify FEA/CFD figures as specific simulated results, spin/rolling
  tests as observations and the wind tunnel as qualitative. Omit ambiguous
  rotational-speed arithmetic, fit-class terminology and print orientation.
- Retain earlier workshop reporting of 140 as historical; the latest portfolio
  says over 100 across seven workshops. These reports overlap, not add together.
  Latest school-booth reporting is 1,000+, compared with earlier 800+.
- Separate prior AIDA marketing from the World Finals relationship cycle, and
  preserve earlier/current MARC formulations with their campaign scope.
- Separate earlier FMEA/RPN from the World Finals likelihood/impact risk register.
- Preserve supporter/service distinctions: DHL GoGreen was a service, not a
  sponsorship. School/foundation support is not synonymous with corporate support.
- Use the later event-provided-table pit refinement. Voices publication, junior
  training and a carbon dashboard remain plans; aspirations are not awards.
- The public profile lists `github.com/TeamArion`; existing repositories and
  knowledge use `github.com/TeamArionSISHK`. Retain both contexts without claiming
  a verified account migration. No inferred social accounts were added.
- Streaming and non-streaming answers share the curated assistant rules so the
  public PurpleExperience description, historical scope and countdown policy
  apply consistently. Talking about generated souvenirs is allowed; attaching
  images to Ask Arion answers remains outside this change.

## Maintenance

Prefer short, distinct facts over repeated sample answers. Label campaign,
date, measurement type and planned/completed status when they change meaning.
Do not paste whole portfolios into the runtime prompt. Keep provider settings
and runtime architecture independent of editorial updates.
