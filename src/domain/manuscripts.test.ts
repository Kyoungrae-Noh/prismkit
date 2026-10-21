import { it, expect } from 'vitest'
import { manuscript, brief, content } from '../../tests/fixtures/manuscript'
import {
  validateBrief,
  validateContent,
  validateManuscripts,
  qualityIssues,
  draftHTML,
  draftMarkdown,
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
