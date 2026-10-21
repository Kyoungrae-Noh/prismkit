import { it, expect } from 'vitest'
import { manuscript, brief, content } from '../../tests/fixtures/manuscript'
import {
  validateBrief,
  validateContent,
  validateManuscripts,
  qualityIssues,
  draftHTML,
  draftMarkdown,
  evidenceNeeds,
} from './manuscripts'
it('requires controlled templates, source provenance and exactly five Naver image positions', () => {
  expect(validateContent(content, brief)).toEqual(content)
  expect(() => validateBrief({ ...brief, account: 'other' })).toThrow()
  expect(() => validateContent({ ...content, imageNotes: [] }, brief)).toThrow()
  expect(() =>
    validateContent({ ...content, checklist: [] }, { ...brief, type: 'reviewman' }),
  ).toThrow()
  expect(() =>
    validateContent(
      { ...content, sections: [{ ...content.sections[0], sourceIds: ['invented'] }] },
      brief,
    ),
  ).toThrow()
})
it('evaluates reader intent, missing official action evidence, overclaims and comparison safely', () => {
  const m = manuscript()
  m.brief = {
    ...m.brief,
    type: 'reviewman',
    topic: '지원 신청 비교',
    intent: '신청 비교',
    angle: '',
    sources: [],
  }
  m.content.cta = ''
  m.content.sections[0].body = '100% 지원 보장'
  expect(evidenceNeeds(m.brief).join(' ')).toContain('공식 공고')
  const q = qualityIssues(m).join(' ')
  expect(q).toContain('보장·과장')
  expect(q).toContain('비교 의도')
  expect(q).toContain('공식 근거 없음')
  expect(q).toContain('다음에 할 행동')
  m.brief = { ...brief, type: 'reviewman' }
  m.content = {
    ...content,
    comparison: { columns: ['조건', '확인 내용'], rows: [['대상', '확인 필요']] },
  }
  expect(validateContent(m.content, m.brief).comparison?.rows).toHaveLength(1)
  expect(draftHTML(m)).toContain('<table>')
  expect(draftMarkdown(m)).toContain('| 조건 | 확인 내용 |')
  expect(() =>
    validateContent(
      {
        ...m.content,
        comparison: { columns: ['조건', '자료'], rows: [['https://invented.invalid', '미확인']] },
      },
      m.brief,
    ),
  ).toThrow('URL')
})
it('rejects invented and unsafe links, secret-shaped fields and oversized briefs', () => {
  expect(() => validateContent({ ...content, cta: 'https://invented.example' }, brief)).toThrow()
  expect(() =>
    validateBrief({ ...brief, sources: [{ ...brief.sources[0], url: 'javascript:alert(1)' }] }),
  ).toThrow()
  expect(() => validateBrief({ ...brief, OPENAI_API_KEY: 'test' })).toThrow()
  expect(() => validateBrief({ ...brief, evidence: '가'.repeat(5001) })).toThrow()
  expect(() =>
    validateBrief({ ...brief, sources: [{ ...brief.sources[0], kind: 'internal' }] }),
  ).toThrow()
})
it('flags missing evidence, stale sources, sensitive claims and cross-template duplicates without approving', () => {
  const m = manuscript()
  m.brief.sources = []
  m.content.sections[0].sourceIds = []
  m.content.sections[0].body = '신청 조건은 3만원입니다.'
  const issues = qualityIssues(m, [manuscript()]).join(' ')
  expect(issues).toContain('공식 근거 없음')
  expect(issues).toContain('사실 확인 문장')
  expect(issues).toContain('중복 가능성')
  expect(qualityIssues(manuscript(), [], Date.parse('2027-01-01')).join(' ')).toContain('30일 초과')
})
it('exports correct account templates with escaped HTML and editable content while retaining generated original', () => {
  const m = manuscript()
  m.content.title = '<script>alert(1)</script>'
  const html = draftHTML(m)
  expect(html).not.toContain('<script>')
  expect(html).toContain('&lt;script&gt;')
  expect(html).toContain('font-size:30pt')
  expect(html).toContain('font-size:19pt')
  expect(html.match(/\[이미지 \d:/g)).toHaveLength(5)
  expect(draftMarkdown(m)).toContain('## │ FAQ')
  expect(draftMarkdown(m)).toContain('공식 안내')
  m.brief.type = 'reviewman'
  expect(draftHTML(m)).toContain('name="description"')
  expect(draftHTML(m)).not.toContain('font-size:19pt')
  m.content.title = ''
  expect(validateManuscripts([m])).toHaveLength(1)
  expect(m.generated.title).toBe(content.title)
})
