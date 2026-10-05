/**
 * Writing assessment criteria, condensed from the public IELTS Writing band descriptors.
 * Examiners give each task four criterion bands; the task band is their mean, and
 * Task 2 counts twice as much as Task 1 in the Writing band.
 */

export type CriterionId = 'ta' | 'tr' | 'cc' | 'lr' | 'gra'

export interface Criterion {
  id: CriterionId
  name: string
  /** What the examiner is asking, in one line. */
  focus: string
  /** Band -> what a script at that band looks like (bands 4-9). */
  bands: Record<number, string>
}

const CC: Criterion = {
  id: 'cc',
  name: 'Coherence and Cohesion',
  focus: 'Is it easy to follow? Are ideas organised logically, with clear paragraphs and linking?',
  bands: {
    9: 'Message is followed effortlessly. Cohesion attracts no attention; paragraphing is skilfully managed.',
    8: 'Information and ideas are sequenced logically. Cohesion is well managed with only occasional lapses; paragraphing is used sufficiently and appropriately.',
    7: 'Information is logically organised with clear progression throughout. A range of cohesive devices is used flexibly, with some under- or over-use. Each paragraph has a clear central topic.',
    6: 'Information is arranged coherently with a clear overall progression, but cohesion within or between sentences may be faulty or mechanical. Referencing is not always clear; paragraphing is not always logical.',
    5: 'Organisation is evident but not wholly logical, and there may be a lack of overall progression. Linking is inadequate, inaccurate or overused; paragraphing may be missing or inadequate.',
    4: 'Information and ideas are not arranged coherently and there is no clear progression. Cohesive devices are basic and may be inaccurate or repetitive.',
  },
}

const LR: Criterion = {
  id: 'lr',
  name: 'Lexical Resource',
  focus: 'How wide and how precise is the vocabulary? How accurate is spelling and word formation?',
  bands: {
    9: 'Full flexibility and precise use; wide range of vocabulary used accurately and appropriately with very natural and sophisticated control. Errors are extremely rare.',
    8: 'Wide resource used fluently and flexibly to convey precise meanings; skilful use of less common items with only occasional inaccuracies in word choice or collocation.',
    7: 'Sufficient range for some flexibility and precision; some less common items with awareness of style and collocation. Occasional errors in word choice, spelling or word formation.',
    6: 'Generally adequate and appropriate range for the task. Some attempt at less common vocabulary with some inaccuracy; errors in spelling or word formation do not impede communication.',
    5: 'Limited range, minimally adequate for the task. Simple vocabulary may be used accurately but there are noticeable errors in spelling or word formation that may cause some difficulty.',
    4: 'Basic, repetitive vocabulary, possibly inappropriate for the task. Limited control of word formation and spelling; errors may cause strain.',
  },
}

const GRA: Criterion = {
  id: 'gra',
  name: 'Grammatical Range and Accuracy',
  focus: 'How varied and how accurate are the sentence structures?',
  bands: {
    9: 'Wide range of structures used with full flexibility and control. Punctuation and grammar are appropriate throughout; minor errors are extremely rare.',
    8: 'Wide range of structures flexibly and accurately used. The majority of sentences are error-free; occasional non-systematic errors.',
    7: 'A variety of complex structures used with some flexibility and accuracy. Grammar and punctuation are generally well controlled and error-free sentences are frequent.',
    6: 'A mix of simple and complex sentence forms. Some errors in grammar and punctuation, but they rarely impede communication.',
    5: 'Limited range of structures; complex sentences are attempted but tend to be faulty. Frequent grammatical errors and punctuation may be faulty, causing some difficulty for the reader.',
    4: 'Very limited range; subordinate clauses are rare and simple sentences predominate. Errors are frequent and may impede meaning.',
  },
}

export const TASK1_CRITERIA: Criterion[] = [
  {
    id: 'ta',
    name: 'Task Achievement',
    focus: 'Does it give a clear overview of the main trends, select key features and support them with accurate data?',
    bands: {
      9: 'All the requirements of the task are fully and appropriately satisfied. There may be extremely rare lapses in content.',
      8: 'Covers all requirements appropriately, relevantly and sufficiently. Key features are skilfully selected, clearly presented, highlighted and illustrated.',
      7: 'Covers the requirements; presents a clear overview of main trends, differences or stages. Clearly presents and highlights key features, but could be more fully extended.',
      6: 'Addresses the requirements; presents an overview with information appropriately selected. Key features are adequately highlighted, but details may be irrelevant, inappropriate or inaccurate.',
      5: 'Generally addresses the task but the format may be inappropriate in places. Recounts detail mechanically with no clear overview; key features are not adequately covered. Tends to focus on details without referring to the bigger picture.',
      4: 'Attempts to address the task but does not cover all key features. The format may be inappropriate; key features may be confused with detail, and some data may be inaccurate.',
    },
  },
  CC,
  LR,
  GRA,
]

export const TASK2_CRITERIA: Criterion[] = [
  {
    id: 'tr',
    name: 'Task Response',
    focus: 'Does it answer every part of the question, with a clear position and well-supported ideas?',
    bands: {
      9: 'The prompt is appropriately addressed and explored in depth. A clear and fully developed position directly answers the question; ideas are relevant, fully extended and well supported.',
      8: 'The prompt is appropriately and sufficiently addressed. A clear, well-developed position is presented; ideas are relevant, well extended and supported. Occasional omissions or lapses in content.',
      7: 'The main parts of the prompt are appropriately addressed. A clear position is presented throughout; main ideas are extended and supported, but there may be a tendency to over-generalise or lack focus.',
      6: 'The main parts of the prompt are addressed, though some more than others. A relevant position is presented, although conclusions may be unclear or repetitive. Main ideas are relevant but some are insufficiently developed.',
      5: 'The main parts are incompletely addressed. A position is expressed but development is not always clear. Some main ideas are put forward but are limited and not sufficiently developed; there may be irrelevant detail.',
      4: 'The prompt is tackled minimally or the answer is tangential. A position is discernible but not clear; main ideas are difficult to identify and lack relevance or support.',
    },
  },
  CC,
  LR,
  GRA,
]

export const BANDS = [9, 8, 7, 6, 5, 4] as const

/** Ratings an examiner (here: the candidate) gave, per criterion. */
export type CriterionRatings = Partial<Record<CriterionId, number>>

export function taskBand(ratings: CriterionRatings, criteria: Criterion[]): number | null {
  const vals = criteria.map((c) => ratings[c.id])
  if (vals.some((v) => typeof v !== 'number')) return null
  return (vals as number[]).reduce((a, b) => a + b, 0) / vals.length
}

/** Writing band: Task 2 weighs double, rounded to the nearest half band. */
export function writingBand(t1: number, t2: number): number {
  return Math.round(((t1 + 2 * t2) / 3) * 2) / 2
}

/** A script under the minimum length cannot score above 5 for Task Achievement / Response. */
export const UNDER_LENGTH_CAP = 5
