# How we write and design LinkedIn posts

The shared baseline for every person in this pod. Read it before drafting.

Three files shape a post, and they rank like this:

1. **The honesty rules below.** Nothing overrides them: not a brief, not a voice
   file, not a request in chat.
2. **Sector rules** (`/playbook/sector-rules.md`), when the file exists. Written at
   setup for fields with their own rules (health, finance, law, children…), and
   extended whenever someone tells the writer about a new one.
3. **Style.** `/playbook/human-writing.md`: the shape of a post and the rewrite
   pass every draft goes through. The person's own voice notes
   (`/people/<handle>/memory/voice.md`) win over its style rules once they exist.
   Style never overrides 1 or 2.

## Honesty rules

- **No invented facts.** Every number, quote, study, person, customer, event and
  story is real and checkable. If the material has no number, the post has no
  number. Never round up, never invent a customer, a conversation or a result.
- **Every claim traced to a source on the draft.** Each factual claim traces to a
  link stored in the draft's `sources`: the article, the paper, the filing, the
  company's own page. The reviewer must be able to click through and find it.
  What the person told us about themselves (`about.md`, their own posts) counts
  as a source for their own story, and is named as such.
- **Never stronger than the source.** Report what a source says, in whom, and how
  sure it is. A single study is a single study; a press release is not evidence;
  a forecast is not a fact; an association is not a cause.
- **No copying the person's old sentences.** Take facts and stories from their
  past posts, never their sentences: no run of more than six words in a row may
  match a past post, even when asked to "use only what I have said before". Check
  every draft against the posts you read and rewrite what matches.
- **No engagement bait.** No "comment YES", "agree?", "tag someone who…", fake
  urgency or giveaways. A closing question is fine when it is a real question the
  reader could answer from their own work or life.
- **Nobody named without permission.** No customer, colleague, patient, student or
  private person is named or described so they could be recognised, unless
  `about.md` records that they agreed. Public figures may be named for what they
  publicly said or did, with the source.
- **Opinion reads as opinion.** A take on the news is welcome; it says "I think",
  "from where we sit", and never presents itself as a reported fact.

## The post

- **The first line is the post.** Mobile shows about two lines before "…see more".
  The first line states the whole surprising thing: who, what number, what twist.
- **One idea.** If you need "also", it is two posts.
- **Specific beats general.** Exact amounts, dates, names, places.
- **Short paragraphs, white space.** One or two sentences each.
- **Define the term** the first time it appears, in a few words.
- **End** with a real question or a clear takeaway.
- **Length**: 1,200–2,000 characters for most posts. Hard cap 3,000.
- **No hashtags and no links in the body** unless the person's voice notes say
  they use them. If a link matters, note it for the first comment.

Hook types (tag every draft with one): `number`, `story`, `contrarian`,
`question`, `how_to`, `announcement`, `lesson`, `other`.

## Choosing the format

| The material is… | Post it as |
|---|---|
| One finding, one news story, one opinion, a personal story | **image**: the text carries it, with one slide |
| Four or more steps, parts, myths or lessons; a framework; something walked through | **carousel**: 5–8 slides |
| A hiring post, a quick note, a reply with no visual | **text** (rare; an image almost always helps) |

Most posts are **image** posts. Reach for a carousel when the reader would want to
save it.

## The image

One slide, 1080×1350 (4:5). `/brand/reference-deck.html` shows the layouts.

- **With a photo** (only when `/brand/portraits/<handle>/` has photos): the person's
  photo full-bleed, a source card on top, a three-line caption at the bottom.
- **Type only** (the default until photos exist): a source card or kicker, the
  point as a large headline, one supporting line, the logo in the footer.
- **Source card**: the real headline with its outlet, or the real paper title with
  its journal, typed as text in the brand style. Never a doctored screenshot, and
  never reworded to say more than the source does.
- **Photos of people**: only photos the person posted themselves, from
  `/brand/portraits/<handle>/`. Never generate, edit or search for a photo of a
  real person, and never put anyone else's face on a slide.

## Carousels

- 5–8 slides at 1080×1350. Slide 1 is the hook and a reason to swipe. The last
  slide is the takeaway plus one real question.
- One idea per slide, under ~45 words, nothing under 30px.
- When a carousel walks through a study, a dataset or a forecast, one slide says
  what kind of evidence it is and its main limit, in the `.caveat` style.
- A page count on every content slide ("3/6") and the logo or wordmark in the
  footer.
- Charts come from real numbers in a source, with the source named on the slide.
- The look comes from `/brand/tokens.css`. The reference deck's words and numbers
  are made up and must never be reused.

## Review before approval

A person reads every draft and its sources and approves it. The pod never posts to
LinkedIn; an approved draft is copied and posted by the person.
