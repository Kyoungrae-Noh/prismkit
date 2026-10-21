import { handleProtected, failure } from '../edge/security.ts'
import { draftRoute } from '../edge/draft-route.ts'
import { aiRoute } from '../edge/ai-route.ts'
export const onRequest: PagesFunction<
  Omit<PagesEnv, 'SEARCHAD'> & Pick<Env, 'SEARCHAD'> & { AI_ENABLED?: string }
> = async (context) => {
  try {
    let upstream: Response | undefined
    const response = await handleProtected(
      context.request,
      context.env,
      () => context.next(),
      async (keyword) => {
        // One coordination object per SearchAd customer. No browser-selected object IDs.
        const stub = context.env.SEARCHAD.get(
          context.env.SEARCHAD.idFromName('prismkit-searchad-v1'),
        )
        upstream = await stub.query(keyword)
        if (!upstream.ok) throw new Error('Upstream rejected')
        return await upstream.json()
      },
      undefined,
      async () => {
        const stub = context.env.SEARCHAD.get(
          context.env.SEARCHAD.idFromName('prismkit-searchad-v1'),
        )
        upstream = await stub.usage()
        if (!upstream.ok) throw new Error('Budget unavailable')
        return await upstream.json()
      },
      () =>
        new URL(context.request.url).pathname.startsWith('/api/ai/drafts/')
          ? draftRoute(context.request, () =>
              context.env.SEARCHAD.get(context.env.SEARCHAD.idFromName('prismkit-drafts-v1')),
            )
          : aiRoute(context.request, context.env.AI_ENABLED === 'true', () =>
              context.env.SEARCHAD.get(context.env.SEARCHAD.idFromName('prismkit-ai-v1')),
            ),
    )
    return upstream && !upstream.ok ? upstream : response
  } catch {
    return failure(503, 'UNAVAILABLE', '서버 요청을 안전하게 처리할 수 없습니다.')
  }
}
