import { useState } from 'react'
import {
  exportWorkspace,
  parseBackup,
  restoreWorkspace,
  rawSnapshot,
  backupCounts,
  compareBackups,
  previousBackup,
  BACKUP_MAX,
  type Backup,
} from '../data/backup'
import { useWorkspace } from '../app/workspace'
export function BackupPage() {
  const { refresh } = useWorkspace()
  const [preview, setPreview] = useState<{
    current: Backup
    incoming: Backup
    expected: string
  } | null>(null)
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false)
  const [error, setError] = useState(''),
    [message, setMessage] = useState('')
  async function download(previous = false) {
    try {
      const data = previous
        ? await previousBackup(localStorage)
        : await exportWorkspace(localStorage)
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = `prismkit-${previous ? 'before-restore' : 'workspace'}-${new Date().toISOString().slice(0, 10)}.json`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '백업 실패')
    }
  }
  return (
    <div className="backup-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">LOCAL BACKUP</div>
          <h1>백업·복원</h1>
          <p>글감부터 캡처·발행 이력까지 하나의 파일로 보관합니다.</p>
        </div>
      </div>
      <section className="panel research-panel">
        <p>
          API 키·Access 토큰은 백업 대상이 아닙니다. 메모·캡처·URL에는 직접 입력한 개인정보가 포함될
          수 있으므로 파일을 안전하게 보관하세요. 파일은 이 브라우저에서만 처리하며 외부 서버에
          업로드하지 않습니다.
        </p>
        <p>
          version 2 전체 백업은 캡처 글감·추천 목록과 이미지 원본도 포함합니다(최대 64 MiB). 원본이
          누락되면 불완전한 백업을 만들지 않습니다. version 1 가져오기는 기존 캡처 자료를 유지하며
          연결이 끊기면 복원을 거부합니다. 이미지 원본은 복원 전에 별도 저장소에 안전하게 준비하고,
          마지막에 전체 자료를 한 번에 전환합니다.
        </p>
        <button className="button secondary" onClick={() => void download()}>
          전체 JSON 내보내기
        </button>{' '}
        <button className="button secondary" onClick={() => void download(true)}>
          복원 전 자동 백업 내려받기
        </button>
        <p>
          가져오기는 전체 교체 방식입니다. 같은 ID의 다른 내용과 삭제될 자료를 비교한 뒤 확인해야
          합니다. 직전 자료를 자동 백업하고, 저장 공간이 부족하면 기존 자료를 유지합니다. 기존 개별
          JSON 내보내기 기능도 유지됩니다.
        </p>
        <label className="idea-form">
          전체 JSON 가져오기
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0]
              setPreview(null)
              setConfirmed(false)
              setError('')
              setMessage('')
              if (!file) return
              setBusy(true)
              try {
                if (file.size > BACKUP_MAX) throw new Error('파일 용량 제한을 초과했습니다.')
                const expected = JSON.stringify(rawSnapshot(localStorage))
                const incoming = await parseBackup(await file.text()),
                  current = await exportWorkspace(localStorage)
                setPreview({ current, incoming, expected })
              } catch (e) {
                setError(e instanceof Error ? e.message : '파일 검사 실패')
              } finally {
                setBusy(false)
                event.target.value = ''
              }
            }}
          />
        </label>
        {preview && (
          <div className="backup-preview">
            <h2>복원 전 비교</h2>
            <div className="table-scroll">
              <table className="keyword-table">
                <thead>
                  <tr>
                    <th>자료</th>
                    <th>현재</th>
                    <th>가져올 자료</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(backupCounts(preview.current)).map(([key, count]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>{count}</td>
                      <td>
                        {
                          backupCounts(preview.incoming)[
                            key as keyof ReturnType<typeof backupCounts>
                          ]
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              동일 {compareBackups(preview.current, preview.incoming).same} · 추가{' '}
              {compareBackups(preview.current, preview.incoming).added} · 같은 ID의 변경{' '}
              {compareBackups(preview.current, preview.incoming).changed} · 교체로 제거{' '}
              {compareBackups(preview.current, preview.incoming).removed}
            </p>
            <p>
              원본 ID와 글감·후보 연결, 3개 계정의 이력 확인 상태를 함께 복원합니다. 잘못된 참조나
              중복 ID는 허용하지 않습니다.
            </p>
            <label className="backup-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>현재 전체 자료를 교체하고 직전 자료를 자동 백업하는 데 동의합니다.</span>
            </label>
            <p>
              <button
                className="button primary"
                disabled={!confirmed || busy}
                onClick={async () => {
                  setBusy(true)
                  setError('')
                  try {
                    await restoreWorkspace(localStorage, preview.incoming, preview.expected)
                    await parseBackup(JSON.stringify(await exportWorkspace(localStorage)))
                    setPreview(null)
                    setConfirmed(false)
                    setMessage('전체 복원과 연결 무결성 검사가 완료되었습니다.')
                    await refresh(true)
                  } catch (e) {
                    setError(e instanceof Error ? e.message : '복원 실패')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                확인하고 전체 복원
              </button>
            </p>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
      </section>
    </div>
  )
}
