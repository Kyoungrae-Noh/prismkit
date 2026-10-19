import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
export interface AccessSettings {
  ACCESS_ISSUER?: string
  ACCESS_AUD?: string
  ADMIN_EMAIL?: string
}
export async function verifyAccess(
  request: Request,
  settings: AccessSettings,
  key?: JWTVerifyGetKey,
): Promise<void> {
  const { ACCESS_ISSUER: issuer, ACCESS_AUD: audience, ADMIN_EMAIL: email } = settings
  if (
    !issuer ||
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) ||
    !audience ||
    !email
  )
    throw new Error('Access configuration unavailable')
  const token = request.headers.get('cf-access-jwt-assertion')
  if (!token || token.length > 16384) throw new Error('Authentication required')
  const resolver =
    key ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), { timeoutDuration: 5000 })
  const { payload } = await jwtVerify(token, resolver, {
    issuer,
    audience,
    algorithms: ['RS256'],
    requiredClaims: ['exp', 'iat', 'sub', 'email'],
    clockTolerance: 0,
  })
  if (
    payload.type !== 'app' ||
    typeof payload.email !== 'string' ||
    payload.email.toLowerCase() !== email.toLowerCase()
  )
    throw new Error('Access denied')
}
