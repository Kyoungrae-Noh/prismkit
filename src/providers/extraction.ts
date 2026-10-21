import type { CaptureDraft } from '../domain/captures'
/** Future implementation must call an authenticated same-origin server endpoint, never a vendor from the browser. */
export interface ExtractionProvider {
  readonly connected: boolean
  extract(images: { id: string; blob: Blob }[]): Promise<CaptureDraft[]>
}
export const extractionProvider: ExtractionProvider = {
  connected: false,
  async extract() {
    throw new Error(
      'AI 판독 미연결: 승인된 서버 API와 비용 설정이 없습니다. 원본을 보며 수동 입력하세요.',
    )
  },
}
